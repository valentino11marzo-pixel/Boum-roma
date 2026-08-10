#!/usr/bin/env python3
"""miniera_extract.py — da wacli alla MINIERA: righe per-thread, mai l'archivio.

Legge su stdin il JSON di `wacli messages list` (tollerante alle varianti di
campo fra versioni, come lib/wacli.sh) e produce UNA riga per conversazione:
conteggi, tempi, direzione dell'ultima parola, campioni corti di testo.
Il testo integrale NON esce mai da qui (decisione D2 dello studio) — il
server riceve feature, e ogni giudizio vive nel motore server-side testato.

Uso (orchestrato da miniera.sh):
    wacli messages list --json --limit 100000 \
      | python3 miniera_extract.py --known known.json --batches /tmp/dir

  --known FILE    mappa {docId: contentHash} dal GET dell'endpoint: i thread
                  invariati si saltano (sync incrementale, D7)
  --batches DIR   scrive lì batch_NNN.json già nel formato del POST
                  ({"op":"threads","rows":[...]}), 100 righe l'uno
  --dry           solo il riassunto, nessun file

Stampa su stdout una riga di riassunto: rows=N changed=M batches=K
"""
import sys, json, os, re, hashlib, argparse

CLIP_TEXT, CLIP_SAMPLE, BATCH = 240, 1200, 100

def field(m, *keys, default=''):
    for k in keys:
        if isinstance(m, dict) and k in m and m[k] not in (None, ''):
            return m[k]
    return default

def to_ms(v):
    """Epoch ms da: epoch sec, epoch ms, o stringa ISO. None se illeggibile."""
    if v in (None, ''):
        return None
    if isinstance(v, (int, float)):
        v = float(v)
        return int(v if v > 1e12 else v * 1000)
    s = str(v).strip()
    if re.fullmatch(r'\d{10}', s):
        return int(s) * 1000
    if re.fullmatch(r'\d{13}', s):
        return int(s)
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() * 1000)
    except Exception:
        return None

def ts_of(m):
    return to_ms(field(m, 'timestamp', 'time', 'sentAt', 'at', 'ts', 'date', 'createdAt', default=None))

def is_out(m):
    """Il messaggio l'abbiamo mandato NOI? Tollerante alle varianti wacli."""
    for k in ('fromMe', 'from_me', 'isFromMe', 'isOutgoing', 'sent', 'outgoing'):
        if k in m:
            return bool(m[k])
    d = str(field(m, 'direction', default='')).lower()
    if d in ('out', 'outgoing', 'sent'):
        return True
    if d in ('in', 'incoming', 'received'):
        return False
    return False  # nel dubbio è del cliente: meglio una risposta di troppo

def body_of(m):
    b = field(m, 'body', 'text', 'content', 'message', default='')
    if isinstance(b, dict):
        b = field(b, 'text', 'caption', 'conversation', default='')
    return re.sub(r'\s+', ' ', str(b)).strip()

def chat_of(m):
    c = field(m, 'chatId', 'chat', 'remoteJid', 'jid', 'peer', 'chatName', default='')
    return str(c) or str(field(m, 'from', 'sender', 'phone', 'name', default=''))

def clip(s, n):
    return s[:n]

def doc_id(chat_id):
    return hashlib.sha1(str(chat_id).encode('utf-8')).hexdigest()[:40]

def extract(msgs):
    groups = {}
    for m in msgs:
        if not isinstance(m, dict):
            continue
        chat = chat_of(m)
        if not chat or '@g.us' in chat or 'status@broadcast' in chat:
            continue  # i gruppi non entrano MAI (D5); il server ri-veta comunque
        groups.setdefault(chat, []).append(m)

    rows = []
    for chat, items in groups.items():
        items = [m for m in items if ts_of(m) is not None]
        if not items:
            continue
        items.sort(key=ts_of)
        first_in = next((m for m in items if not is_out(m)), None)
        first_in_ts = ts_of(first_in) if first_in else None
        reply_min = None
        if first_in_ts is not None:
            first_out_after = next(
                (m for m in items if is_out(m) and ts_of(m) >= first_in_ts), None)
            if first_out_after is not None:
                reply_min = round((ts_of(first_out_after) - first_in_ts) / 60000)
        ins = [m for m in items if not is_out(m)]
        outs = [m for m in items if is_out(m)]
        in_texts = [t for t in (body_of(m) for m in ins) if t]
        # La parte utente del JID è un numero internazionale SENZA "+":
        # si manda già col "+" o il server raddoppierebbe il prefisso.
        phone_raw = chat.split('@')[0]
        if re.fullmatch(r'\d{7,15}', phone_raw):
            phone = '+' + phone_raw
        elif re.fullmatch(r'\+\d{7,15}', phone_raw):
            phone = phone_raw
        else:
            phone = str(field(items[-1], 'phone', 'senderPhone', default=''))
        rows.append({
            'chatId': chat,
            'phone': phone,
            'name': clip(str(field(items[-1], 'pushName', 'senderName', 'name',
                                   'chatName', 'notifyName', default='')), 80),
            'msgCount': len(items),
            'inCount': len(ins),
            'outCount': len(outs),
            'firstTs': ts_of(items[0]),
            'lastTs': ts_of(items[-1]),
            'firstInTs': first_in_ts,
            'firstReplyMinutes': reply_min,
            'lastDirection': 'out' if is_out(items[-1]) else 'in',
            'firstInText': clip(in_texts[0], CLIP_TEXT) if in_texts else '',
            'lastInText': clip(in_texts[-1], CLIP_TEXT) if in_texts else '',
            'lastOutText': clip(next((body_of(m) for m in reversed(outs) if body_of(m)), ''), CLIP_TEXT),
            'inSample': clip(' · '.join(in_texts), CLIP_SAMPLE),
        })
    return rows

def content_hash(row):
    # DEVE combaciare con rowHash() di js/miniera-engine.js: msgCount:lastTs
    return f"{row.get('msgCount', 0)}:{row.get('lastTs', 0)}"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--known', default=None)
    ap.add_argument('--batches', default=None)
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    try:
        msgs = json.load(sys.stdin)
    except Exception:
        print('rows=0 changed=0 batches=0 error=bad_json')
        return 1
    if not isinstance(msgs, list):
        print('rows=0 changed=0 batches=0 error=not_a_list')
        return 1

    rows = extract(msgs)

    known = {}
    if args.known and os.path.exists(args.known):
        try:
            known = json.load(open(args.known)) or {}
        except Exception:
            known = {}
    changed = [r for r in rows if known.get(doc_id(r['chatId'])) != content_hash(r)]

    batches = 0
    if args.batches and not args.dry:
        os.makedirs(args.batches, exist_ok=True)
        for i in range(0, len(changed), BATCH):
            path = os.path.join(args.batches, f'batch_{batches:03d}.json')
            with open(path, 'w') as f:
                json.dump({'op': 'threads', 'rows': changed[i:i + BATCH]},
                          f, ensure_ascii=False)
            batches += 1

    print(f'rows={len(rows)} changed={len(changed)} batches={batches}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
