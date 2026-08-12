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
  --report        PRIMO SGUARDO LOCALE: stampa il rapporto leggibile e non
                  scrive né manda NIENTE. È la via per avere i dati in mano
                  prima che il server sia pronto — senza gli esiti Firestore
                  (visite, contratti) qui non ci sono conversioni né thread
                  d'oro, e il rapporto lo dice invece di fingere.

Stampa su stdout una riga di riassunto: rows=N changed=M batches=K
(oppure il rapporto, con --report)
"""
import sys, json, os, re, hashlib, argparse

CLIP_TEXT, CLIP_SAMPLE, BATCH = 240, 1200, 100

def field(m, *keys, default=''):
    """Tollerante al CASE oltre che al nome: il wacli in produzione emette
    PascalCase (ChatJID, FromMe, Text, Timestamp, PushName) — scoperto al
    primo run vero, quando Homie ha dovuto normalizzare a mano."""
    if not isinstance(m, dict):
        return default
    for k in keys:
        if k in m and m[k] not in (None, ''):
            return m[k]
    low = {str(kk).lower(): vv for kk, vv in m.items() if vv not in (None, '')}
    for k in keys:
        v = low.get(k.lower())
        if v is not None:
            return v
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
    """Il messaggio l'abbiamo mandato NOI? Tollerante alle varianti wacli.
    Qui serve la PRESENZA della chiave, non il valore (FromMe=False conta),
    quindi il lookup case-insensitive è fatto a parte da field()."""
    low = {str(k).lower(): v for k, v in m.items()}
    for k in ('fromme', 'from_me', 'isfromme', 'isoutgoing', 'sent', 'outgoing'):
        if k in low and low[k] is not None:
            return bool(low[k])
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
    c = field(m, 'chatId', 'chatJid', 'chat', 'remoteJid', 'jid', 'peer', 'chatName', default='')
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
        # Il nome sta sul messaggio del CLIENTE (pushName): se l'ultimo è
        # nostro andrebbe perso — si prende dall'ultimo che ne porta uno.
        name = next((str(field(m, 'pushName', 'senderName', 'name', 'chatName',
                               'notifyName', default='')) for m in reversed(items)
                     if field(m, 'pushName', 'senderName', 'name', 'chatName',
                              'notifyName', default='')), '')
        rows.append({
            'chatId': chat,
            'phone': phone,
            'name': clip(name, 80),
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

# ── il primo sguardo locale (--report) ──────────────────────────────────
# Stessa filosofia del motore server ma DICHIARATAMENTE parziale: qui non
# ci sono gli esiti (chi ha visitato, chi ha firmato, chi è un inquilino),
# quindi niente conversioni, niente veti sui ruoli — e lo si scrive.
IT_WORDS = re.compile(r'\b(sono|vorrei|salve|buongiorno|buonasera|grazie|disponibile|disponibilit|appartamento|affitto|visitare|visita|cerco|abbiamo|possibile|quando|quanto|anche|molto|ciao)\b', re.I)
EN_WORDS = re.compile(r'\b(hello|hi|dear|thanks|thank you|available|availability|apartment|flat|rent|viewing|interested|looking for|would like|could you|please|when|how much|i am|we are)\b', re.I)
KEYWORDS = [
    ('visita',   re.compile(r'\b(visit|vedere|vederlo|viewing|appuntamento|quando posso)\b', re.I)),
    ('prezzo',   re.compile(r'\b(troppo car|expensive|budget|trattabil|negoti)\b', re.I)),
    ('deposito', re.compile(r'\b(deposito|deposit|cauzione|caparra|mensilit)\b', re.I)),
    ('date',     re.compile(r'\b(disponibil|available from|da quando|settembre|ottobre|september|october)\b', re.I)),
    ('arredo',   re.compile(r'\b(arredat|furnish|mobili)\b', re.I)),
    ('garanzie', re.compile(r'\b(garant|guarantor|busta paga|payslip)\b', re.I)),
]

def rome_hour(ms):
    from datetime import datetime, timezone
    try:
        from zoneinfo import ZoneInfo
        return datetime.fromtimestamp(ms / 1000, ZoneInfo('Europe/Rome')).hour
    except Exception:
        return datetime.fromtimestamp(ms / 1000, timezone.utc).hour

def report(rows, now_ms):
    H, D = 3600 * 1000, 24 * 3600 * 1000
    out = ['⛏ LA MINIERA — primo sguardo LOCALE (senza gli esiti del server)', '']
    if not rows:
        out.append('Nessuna conversazione leggibile da wacli.')
        return '\n'.join(out)
    msgs = sum(r['msgCount'] for r in rows)
    a30 = sum(1 for r in rows if now_ms - r['lastTs'] <= 30 * D)
    a90 = sum(1 for r in rows if now_ms - r['lastTs'] <= 90 * D)
    out.append(f"Conversazioni 1-a-1: {len(rows)} (gruppi esclusi) · messaggi: {msgs}")
    out.append(f"Attive negli ultimi 30 giorni: {a30} · 90 giorni: {a90}")

    out += ['', '— I SILENZI —']
    unanswered = sorted(
        (r for r in rows
         if r['lastDirection'] == 'in'
         and (now_ms - r['lastTs']) >= 6 * H
         and (now_ms - r['lastTs']) <= 120 * D),
        key=lambda r: now_ms - r['lastTs'])
    out.append(f"Ultima parola del CLIENTE, senza risposta da ≥6h (ultimi 120g): {len(unanswered)}")
    for r in unanswered[:15]:
        days = round((now_ms - r['lastTs']) / D, 1)
        snippet = (r['lastInText'] or r['firstInText'])[:60]
        out.append(f"  · {r['name'] or r['phone'] or r['chatId']} — {days}g fa: \"{snippet}\"")
    cold = sorted(
        (r for r in rows
         if r['lastDirection'] == 'out'
         and (now_ms - r['lastTs']) >= 48 * H
         and (now_ms - r['lastTs']) <= 120 * D
         and (r['inCount'] >= 3
              or KEYWORDS[0][1].search(r['inSample'] or '')
              or re.search(r'\d{3,5}\s*(€|euro|eur)', r['inSample'] or '', re.I))),
        key=lambda r: now_ms - r['lastTs'])
    out.append(f"Ultima parola NOSTRA, thread freddo ≥48h con un segnale vero: {len(cold)}")
    out.append('  (ATTENZIONE: senza il server qui NON c\'è il filtro ruoli — dentro possono')
    out.append('   esserci inquilini, proprietari o gente che ha già firmato. Non scrivere')
    out.append('   a nessuno da questa lista: serve solo a misurare quanto vale il Segugio.)')
    for r in cold[:10]:
        days = round((now_ms - r['lastTs']) / D, 1)
        out.append(f"  · {r['name'] or r['phone'] or r['chatId']} — fermo da {days}g")

    out += ['', '— LA VELOCITÀ DI PRIMA RISPOSTA —']
    lat = sorted(r['firstReplyMinutes'] for r in rows if r['firstReplyMinutes'] is not None)
    never = sum(1 for r in rows if r['firstReplyMinutes'] is None and r['inCount'] > 0)
    if lat:
        med = lat[len(lat) // 2]
        q30 = round(100 * sum(1 for m in lat if m <= 30) / len(lat))
        q24 = round(100 * sum(1 for m in lat if m > 1440) / len(lat))
        out.append(f"Mediana: {med}′ · entro 30′: {q30}% · oltre 24h: {q24}% · mai risposto: {never}")
    else:
        out.append(f"Nessuna latenza misurabile · mai risposto: {never}")

    out += ['', '— LINGUE (stima dalle parole del cliente) —']
    it = en = na = 0
    for r in rows:
        s = r['inSample'] or ''
        if len(s) < 12: na += 1
        elif IT_WORDS.search(s) and not EN_WORDS.search(s): it += 1
        elif EN_WORDS.search(s) and not IT_WORDS.search(s): en += 1
        else: na += 1
    out.append(f"it: {it} · en: {en} · incerte: {na}")

    out += ['', '— QUANDO SCRIVONO (primo messaggio, ora di Roma) —']
    hours = {}
    for r in rows:
        if r['firstInTs']:
            h = rome_hour(r['firstInTs'])
            hours[h] = hours.get(h, 0) + 1
    top = sorted(hours.items(), key=lambda kv: -kv[1])[:4]
    out.append(' · '.join(f"{h:02d}:00 → {n}" for h, n in top) if top else 'nessun dato')

    out += ['', '— PAROLE CHE RICORRONO —']
    counts = []
    for name, rx in KEYWORDS:
        n = sum(1 for r in rows if rx.search(
            ' '.join([r['firstInText'] or '', r['inSample'] or '', r['lastInText'] or ''])))
        if n:
            counts.append(f"{name}: {n}")
    out.append(' · '.join(counts) if counts else 'niente di rilevante')

    out += ['', 'NOTA: senza gli esiti in Firestore (visite, contratti, ruoli) qui non',
            'esistono tassi di conversione, thread d\'oro né veti: quelli escono solo',
            'dallo studio lato server (STUDIO_HOMIE_GAME_CHANGER.md). Questo rapporto',
            'serve a decidere se vale la pena accenderlo.']
    return '\n'.join(out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--known', default=None)
    ap.add_argument('--batches', default=None)
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--report', action='store_true')
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

    if args.report:
        import time
        print(report(rows, int(time.time() * 1000)))
        return 0

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
