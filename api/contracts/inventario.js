// api/contracts/inventario.js
// L'INVENTARIO DAL VIDEO — filma il giro, l'elenco si scrive da solo.
//
// Il verbale di consegna (api/contracts/verbale.js) rinviava agli arredi con
// una riga sola: "completa degli arredi e delle dotazioni pattuite". Alla
// riconsegna, diciotto mesi dopo, quella riga non dice se la lavastoviglie
// c'era, se il divano aveva già lo strappo, se le sedie erano sei. La
// trattenuta sul deposito si gioca lì — e senza elenco la vince chi ricorda
// più forte.
//
// Il giro in casa l'operatore lo fa comunque. Qui quel giro diventa un
// documento: /inventario estrae i fotogrammi dal video SUL TELEFONO (il
// video non sale mai: 100MB in un vano scala non arriverebbero), li manda
// qui, Claude propone stanza per stanza, l'operatore corregge, e il PDF
// nasce con dentro le foto vere.
//
// Method:  POST  ·  Authorization: Bearer <firebase-id-token>
//          (admin/owner/landlord — owner solo sui PROPRI immobili)
//
//   { op:'analyze', propertyId|contractId, frames:[{base64,t}],
//     voice:{base64,mimeType}?, note? }
//        → { ok, proposal:{rooms,warnings,counts}, transcript, model }
//          NON SCRIVE NIENTE. La proposta è una proposta (regola 2 del
//          motore): diventa documento solo quando l'operatore la conferma.
//
//   { op:'save', propertyId|contractId, kind:'consegna'|'riconsegna',
//     rooms:[...], reviewed:true, note?, shots:[{base64,label}]? }
//        → { ok, url, counts, diff? }
//          PDF su Storage + `inventario` sull'immobile (e sul contratto) +
//          documento in archivio. Alla RICONSEGNA calcola da sé le
//          differenze contro l'inventario di consegna: è il motivo per cui
//          questa funzione esiste.
//
// Regole ereditate dalla piattaforma: testata, marchio, font e piede legale
// vengono da api/_pdfbrand.js (una copia sola per tutti i PDF del sistema, e
// il WinAnsi di wa() con essa), import statici (il bundler Vercel non traccia
// i lazy import), email best-effort e time-boxed — un PDF salvato non si
// perde perché Gmail è giù.

import { PDFDocument } from 'pdf-lib';
import { fsGet, fsPatch, fsCreate, readJson, logActivity } from '../homie/_lib.js';
import { storageUpload, sendEmail } from '../agent/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { shell, btn, para, fine, hero, tiles, includes, rule } from '../preagreement/_notify.js';
import { transcribeAudio } from '../wizard/_stt.js';
import { brandAssets, masthead, stampFooters, wa, INK, GREY, FAINT, GOLD, HAIR, RED } from '../_pdfbrand.js';
import INV from '../../js/inventario-engine.js';

const ADMIN_NOTIFY = process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';
const MODEL = 'claude-opus-5';          // il documento vale sul deposito: qui non si risparmia
const MAX_FRAMES = 12;
const MAX_FRAME_BYTES = 1.4 * 1024 * 1024;

const clip = (v, n = 160) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const dIT = (s) => { try { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }); } catch { return ''; } };
const romeNow = () => {
  const now = new Date();
  return {
    d: now.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }),
    t: now.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }),
    iso: now.toISOString(),
  };
};

// data:image/jpeg;base64,… oppure base64 nudo
function imgBuf(s) {
  const raw = String(s || '');
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(raw);
  const b64 = m ? m[2] : raw;
  if (!b64 || b64.length > MAX_FRAME_BYTES * 1.4) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) return null;
    const kind = m ? (m[1] === 'png' ? 'png' : 'jpg') : (buf[0] === 0x89 ? 'png' : 'jpg');
    return { buf, kind, b64, mime: kind === 'png' ? 'image/png' : 'image/jpeg' };
  } catch { return null; }
}

// ─── L'analisi ───────────────────────────────────────────────────────────
// Il prompt dice due volte la stessa cosa perché è la cosa che conta: si
// elenca ciò che si VEDE. Una condizione non visibile resta vuota (regola 1
// del motore) — un "buono" inventato qui diventa una trattenuta sbagliata
// sul deposito di qualcuno, tra un anno e mezzo.
const SYSTEM = `Sei l'assistente di un agente immobiliare a Roma che sta facendo l'INVENTARIO di un appartamento in affitto. Ricevi fotogrammi estratti da un video girato camminando per la casa, in ordine cronologico.

Elenca gli arredi, gli elettrodomestici e le dotazioni che VEDI, raggruppati per stanza.

REGOLE ASSOLUTE:
- Elenca SOLO ciò che è visibile nei fotogrammi. Non dedurre, non completare, non aggiungere l'ovvio ("ci sarà un citofono").
- La condizione va indicata SOLO se il fotogramma mostra qualcosa: usa "danneggiato" per un difetto visibile (macchia, strappo, crepa, anta rotta), "nuovo" per un oggetto palesemente nuovo. In tutti gli altri casi lascia condition = null. Non scrivere mai "buono" per riempire il campo.
- Marca e modello solo se leggibili nell'immagine.
- Fotogrammi diversi della stessa stanza sono la STESSA stanza; lo stesso oggetto ripreso due volte è UN oggetto.
- Le quantità sono quelle che conti (6 sedie = qty 6). Se non riesci a contare, metti 1.
- Non elencare oggetti personali dell'inquilino precedente, sporcizia o rifiuti.
- Nomi delle stanze in italiano: ingresso, soggiorno, cucina, camera, camera 2, bagno, bagno 2, balcone, terrazzo, ripostiglio, lavanderia, studio, cantina, box, impianti.

Rispondi SOLO con JSON, nessun testo attorno:
{"rooms":[{"room":"cucina","items":[{"name":"Lavastoviglie Bosch","qty":1,"condition":null,"note":""}]}]}`;

async function askClaude(frames, hint) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: 'ai_unconfigured' };

  const content = [];
  frames.forEach((f, i) => {
    content.push({ type: 'text', text: `Fotogramma ${i + 1}${f.t != null ? ` (secondo ${f.t})` : ''}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: f.img.mime, data: f.img.b64 } });
  });
  content.push({
    type: 'text',
    text: hint
      ? `Note dell'agente registrate durante il giro (hanno PRECEDENZA su ciò che deduci dalle immagini, ma non inventare ciò che non nominano): "${clip(hint, 1500)}"\n\nProduci ora il JSON dell'inventario.`
      : 'Produci ora il JSON dell\'inventario.',
  });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: SYSTEM, messages: [{ role: 'user', content }] }),
    });
    if (!r.ok) {
      console.error('[inventario] anthropic', r.status, (await r.text()).slice(0, 200));
      return { ok: false, error: 'ai_failed_' + r.status };
    }
    const j = await r.json();
    if (j.stop_reason === 'refusal') return { ok: false, error: 'ai_refused' };
    const text = (j.content || []).map((c) => c.text || '').join('');
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b <= a) return { ok: false, error: 'ai_unparsable' };
    return { ok: true, raw: JSON.parse(text.slice(a, b + 1)) };
  } catch (e) {
    console.error('[inventario] ai', e.message);
    return { ok: false, error: 'ai_failed' };
  }
}

// ─── Il PDF ──────────────────────────────────────────────────────────────
export async function buildInventarioPdf({ property, contract, inv, kind, note, shots, when, diff, author }) {
  const pdf = await PDFDocument.create();
  const b = await brandAssets(pdf);          // font + marchio VERO, una copia sola
  const { font, bold } = b;
  const W = 595, H = 842, M = 48;
  const uscita = kind === 'riconsegna';
  const DOC = uscita ? 'Inventario — riconsegna' : 'Inventario — consegna';

  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = masthead(page, b, { W, H, M, title: DOC, date: when.d }); };
  const T = (t, x, yy, sz, f, col, cs) => page.drawText(wa(t), { x, y: yy, size: sz, font: f || font, color: col || INK, ...(cs ? { characterSpacing: cs } : {}) });
  const line = (yy, x1 = M, x2 = W - M, th = 0.6, col) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: th, color: col || HAIR });
  const need = (h) => { if (y - h < 70) newPage(); };
  const wrap = (text, size, width, f) => {
    const words = wa(text).split(/\s+/).filter(Boolean); const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if ((f || font).widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const paraDraw = (text, size = 9.5, lh = 14, f, col) => {
    for (const l of wrap(text, size, W - 2 * M, f)) { need(lh); T(l, M, y, size, f, col); y -= lh; }
  };
  // Titolo di sezione: micro-maiuscole spaziate + filo d'oro, come le
  // sezioni del portale e del Fascicolo — la stessa grammatica ovunque.
  const sect = (title, col) => {
    need(38); y -= 10;
    T(String(title).toUpperCase(), M, y, 9, bold, col || GOLD, 2.6); y -= 6;
    line(y, M, W - M, 0.8, col || GOLD); y -= 17;
  };
  const rowKV = (k, v, kw = 150) => {
    need(16);
    T(String(k).toUpperCase(), M, y, 7.5, font, FAINT, 1.1);
    for (const [i, l] of wrap(v, 9.5, W - M - (M + kw), font).slice(0, 3).entries()) { T(l, M + kw, y - i * 12, 9.5, font, INK); if (i) y -= 12; }
    y -= 15;
  };

  newPage();

  // Intestazione del documento: occhiello + titolo grande + data
  T(uscita ? 'STATO DEI LUOGHI' : 'STATO DEI LUOGHI', M, y, 8, font, GOLD, 3);
  y -= 20;
  T(uscita ? 'Inventario alla riconsegna' : 'Inventario alla consegna', M, y, 19, bold, INK, 0.2);
  y -= 15;
  T(`Roma, ${when.d} — ore ${when.t}`, M, y, 9.5, font, GREY); y -= 8;
  line(y, M, W - M, 0.8, HAIR); y -= 18;

  sect('Riferimento');
  rowKV('Immobile', clip(property.address || property.name || (contract && contract.propertyAddress) || '', 90));
  if (contract) {
    rowKV('Contratto', `${contract.type === 'studenti' ? 'per studenti universitari' : 'transitorio'} — dal ${dIT(contract.startDate)} al ${dIT(contract.endDate)}`);
    const cond = [clip(contract.tenantName, 60)].concat((Array.isArray(contract.coTenants) ? contract.coTenants : []).map((c) => clip(c && c.name, 60))).filter(Boolean);
    if (cond.length) rowKV('Conduttore/i', cond.join(', '));
    if (contract.landlordName) rowKV('Locatore', clip(contract.landlordName, 90));
  }
  const c = INV.counts(inv.rooms);
  rowKV('Rilevato da', clip(author || 'BOOM Roma', 60));
  rowKV('Consistenza', `${c.pieces} ${c.pieces === 1 ? 'pezzo' : 'pezzi'} in ${c.rooms} ${c.rooms === 1 ? 'ambiente' : 'ambienti'}` + (c.damaged ? ` — ${c.damaged} con difetti rilevati` : ''));

  // ── Le voci, stanza per stanza ──
  sect(uscita ? 'Stato alla riconsegna' : 'Elenco di consegna');
  const colQty = M, colName = M + 34, colCond = W - M - 168;
  for (const room of inv.rooms) {
    need(34);
    y -= 5;
    T(room.label.toUpperCase(), M, y, 8.5, bold, INK, 2);
    const cnt = wa(`${room.items.length} ${room.items.length === 1 ? 'voce' : 'voci'}`);
    T(cnt, W - M - font.widthOfTextAtSize(cnt, 7.5), y, 7.5, font, FAINT);
    y -= 5;
    line(y, M, W - M, 0.5, HAIR); y -= 13;
    for (const it of room.items) {
      const noteLines = it.note ? wrap('— ' + it.note, 8, colCond - colName - 8, font) : [];
      need(14 + noteLines.length * 10);
      T('n. ' + it.qty, colQty, y, 9, font, GREY);
      const nm = wrap(it.name, 9.5, colCond - colName - 10, font);
      T(nm[0] + (nm.length > 1 ? '…' : ''), colName, y, 9.5, font, INK);
      const cl = INV.conditionLabel(it.condition);
      T(cl, colCond, y, 8.5, font, it.condition === 'danneggiato' ? RED : (it.condition ? GREY : FAINT), 0.3);
      y -= 13;
      for (const nl of noteLines) { T(nl, colName, y, 8, font, GREY); y -= 10; }
      if (noteLines.length) y -= 2;
    }
    y -= 7;
  }
  if (!inv.rooms.length) paraDraw('Nessuna voce registrata.', 9.5, 14, font, GREY);

  // ── La legenda che evita la lite ──
  y -= 4;
  paraDraw('"Condizione non dichiarata" significa che al momento del rilievo non è stato riscontrato né documentato alcun difetto specifico: non equivale a un\u2019attestazione di buono stato, e non può essere invocata come prova di un danno successivo.', 8, 11.5, font, FAINT);

  if (clip(note)) { sect('Annotazioni'); paraDraw(clip(note, 900)); }

  // ── Differenze (solo alla riconsegna) ──
  if (uscita && diff) {
    sect('Differenze rispetto alla consegna', RED);
    const bullet = (t, col) => { for (const l of wrap('- ' + t, 9.5, W - 2 * M - 10, font)) { need(13); T(l, M + 6, y, 9.5, font, col || INK); y -= 13; } };
    const group = (title, rows, col, fmt) => {
      if (!rows.length) return;
      need(16); T(String(title).toUpperCase(), M, y, 7.5, bold, FAINT, 1.2); y -= 13;
      rows.forEach((x) => bullet(fmt(x), col)); y -= 5;
    };
    if (!diff.missing.length && !diff.damaged.length && !diff.added.length && !diff.unverifiable.length) {
      paraDraw('Nessuna differenza rilevata: tutte le voci dell\u2019inventario di consegna risultano presenti e senza danni nuovi.', 9.5, 14, font, INK);
    } else {
      group('Mancanti', diff.missing, RED, (x) => `${x.room}: ${x.name} (n. ${x.qty})`);
      group('Danneggiati', diff.damaged, RED, (x) => `${x.room}: ${x.name} — alla consegna ${INV.conditionLabel(x.from)}`);
      group('Segnalati ma non verificabili', diff.unverifiable, GREY, (x) => `${x.room}: ${x.name} — ${x.why}`);
      group('Presenti ora e non in consegna', diff.added, GREY, (x) => `${x.room}: ${x.name} (n. ${x.qty})`);
      paraDraw('L\u2019elenco sopra è una rilevazione di fatto. Ogni conseguenza economica va valutata tenendo conto del normale deperimento d\u2019uso (art. 1590 c.c.).', 8, 11.5, font, FAINT);
    }
  }

  // ── Fotogrammi: la prova ──
  const ph = (Array.isArray(shots) ? shots : []).slice(0, 6).map((p) => ({ label: p.label, img: imgBuf(p.base64) })).filter((p) => p.img);
  if (ph.length) {
    sect('Fotogrammi del rilievo');
    const bw = (W - 2 * M - 16) / 2, bh = 140;
    for (let i = 0; i < ph.length; i += 2) {
      need(bh + 26);
      for (let j = i; j < Math.min(i + 2, ph.length); j++) {
        const x = M + (j - i) * (bw + 16);
        try {
          const img = ph[j].img.kind === 'png' ? await pdf.embedPng(ph[j].img.buf) : await pdf.embedJpg(ph[j].img.buf);
          const sc = Math.min(bw / img.width, bh / img.height);
          page.drawImage(img, { x, y: y - bh, width: img.width * sc, height: img.height * sc });
          T(clip(ph[j].label || `Fotogramma ${j + 1}`, 40), x, y - bh - 11, 7.5, font, FAINT, 0.4);
        } catch { /* un fotogramma corrotto non ferma il documento */ }
      }
      y -= bh + 26;
    }
  }

  // ── Sottoscrizione ──
  sect('Sottoscrizione');
  paraDraw(contract
    ? 'Il presente inventario costituisce allegato al verbale di consegna dell\u2019immobile e ne integra l\u2019articolo relativo allo stato dei luoghi. Le parti lo sottoscrivono per accettazione.'
    : 'Documento di rilievo interno. Diventa allegato al verbale di consegna al momento della stipula.', 9, 13, font, GREY);
  y -= 16;
  const colW = (W - 2 * M - 24) / 2;
  need(54);
  line(y, M, M + colW, 0.7); line(y, M + colW + 24, W - M, 0.7);
  T('IL CONDUTTORE', M, y - 12, 7.5, bold, FAINT, 1.2);
  T('PER BOOM / IL LOCATORE', M + colW + 24, y - 12, 7.5, bold, FAINT, 1.2);

  stampFooters(pdf, b, { W, M });          // il piede su tutte le pagine, numerate
  return Buffer.from(await pdf.save());
}

// ─── Email (best-effort, time-boxed) ─────────────────────────────────────
async function notify({ to, subject, html, pdfBytes, filename }) {
  if (!to) return;
  const attachments = pdfBytes && pdfBytes.length < 8 * 1024 * 1024
    ? [{ filename, content: pdfBytes, contentType: 'application/pdf' }] : undefined;
  try {
    await Promise.race([
      sendEmail({ to, subject, html, attachments }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 12000)),
    ]);
  } catch (e) { console.warn('[inventario] mail', to, e.message); }
}

// ─── Il bersaglio: immobile (sempre) + contratto (se c'è) ────────────────
async function resolveTarget(body, auth) {
  const contractId = clip((body || {}).contractId, 80);
  let contract = null, propertyId = clip((body || {}).propertyId, 80);
  if (contractId) {
    contract = await fsGet('contracts/' + contractId);
    if (!contract) return { error: 'contract_not_found', status: 404 };
    contract.id = contractId;
    propertyId = propertyId || contract.propertyId || '';
  }
  if (!propertyId) return { error: 'property_required', status: 400 };
  const property = await fsGet('properties/' + propertyId);
  if (!property) return { error: 'property_not_found', status: 404 };
  property.id = propertyId;
  // Object-level auth: owner/landlord solo sui PROPRI immobili (come verbale)
  if (auth.profile.role !== 'admin' && String(property.ownerId || '') !== auth.uid) {
    return { error: 'not_your_property', status: 403 };
  }
  return { contract, property, contractId: contractId || null, propertyId };
}

// ─── Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const op = clip((body || {}).op, 20) || 'analyze';

  let target;
  try { target = await resolveTarget(body, auth); }
  catch (e) { console.error('[inventario] target', e.message); return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (target.error) return res.status(target.status).json({ ok: false, error: target.error });
  const { contract, property, contractId, propertyId } = target;

  // ── analyze ────────────────────────────────────────────────────────────
  if (op === 'analyze') {
    const raw = Array.isArray(body.frames) ? body.frames.slice(0, MAX_FRAMES) : [];
    const frames = raw.map((f) => ({ t: Number((f || {}).t) || null, img: imgBuf((f || {}).base64) })).filter((f) => f.img);
    if (!frames.length) return res.status(400).json({ ok: false, error: 'no_frames' });

    // La voce è un AIUTO, non la fonte: se Whisper non c'è si va avanti e lo
    // si DICE (un silenzio qui si legge come "ha capito e ha ignorato").
    let transcript = '', voiceError = null;
    const v = body.voice;
    if (v && v.base64) {
      const out = await transcribeAudio(Buffer.from(String(v.base64).replace(/^data:[^,]+,/, ''), 'base64'), v.mimeType, { maxChars: 2000 });
      if (out.ok) transcript = out.text; else voiceError = out.error;
    }
    const hint = [transcript, clip(body.note, 600)].filter(Boolean).join('\n');

    const ai = await askClaude(frames, hint);
    if (!ai.ok) return res.status(ai.error === 'ai_unconfigured' ? 501 : 502).json({ ok: false, error: ai.error, transcript, voiceError });

    const proposal = INV.normalizeProposal(ai.raw, { source: 'ai' });
    return res.status(200).json({
      ok: true, proposal, transcript, voiceError,
      model: MODEL, frames: frames.length,
      property: { id: propertyId, label: clip(property.address || property.name, 90) },
    });
  }

  // ── save ───────────────────────────────────────────────────────────────
  if (op === 'save') {
    const kind = clip(body.kind, 20) === 'riconsegna' ? 'riconsegna' : 'consegna';
    const inv = INV.normalizeProposal({ rooms: Array.isArray(body.rooms) ? body.rooms : [] }, { source: 'human' });
    inv.reviewed = body.reviewed === true;
    const gate = INV.saveable(inv);
    if (!gate.ok) return res.status(400).json({ ok: false, error: gate.error });

    const when = romeNow();
    const author = auth.email || auth.uid;

    // Alla riconsegna il confronto è il documento: si legge l'inventario di
    // consegna dove sta (contratto prima, immobile poi) e si diffa.
    let diff = null;
    if (kind === 'riconsegna') {
      const entry = (contract && contract.inventario) || property.inventario || null;
      if (entry && Array.isArray(entry.rooms)) diff = INV.diffInventory(entry, inv);
    }

    let pdfBytes;
    try {
      pdfBytes = await buildInventarioPdf({ property, contract, inv, kind, note: body.note, shots: body.shots, when, diff, author });
    } catch (e) {
      console.error('[inventario] pdf', e.message);
      return res.status(500).json({ ok: false, error: 'pdf_failed' });
    }

    const base = contractId ? `contracts/${contractId}` : `property-docs/${propertyId}`;
    let url;
    try { url = await storageUpload(`${base}/inventario-${kind}_${Date.now()}.pdf`, pdfBytes, 'application/pdf'); }
    catch (e) { console.error('[inventario] storage', e.message); return res.status(502).json({ ok: false, error: 'storage_failed' }); }
    if (!url) return res.status(502).json({ ok: false, error: 'storage_failed' });

    // I fotogrammi restano come prova, ma non bloccano mai il salvataggio.
    const shotUrls = [];
    for (const [i, sh] of (Array.isArray(body.shots) ? body.shots.slice(0, 6) : []).entries()) {
      const im = imgBuf((sh || {}).base64);
      if (!im) continue;
      try {
        const u = await storageUpload(`property-docs/${propertyId}/inventario/${when.iso.slice(0, 10)}_${kind}_${i + 1}.jpg`, im.buf, im.mime);
        if (u) shotUrls.push(u);
      } catch (e) { console.warn('[inventario] shot', e.message); }
    }

    const record = {
      at: when.iso, by: author, kind, url,
      counts: INV.counts(inv.rooms),
      rooms: inv.rooms,
      note: clip(body.note, 900) || '',
      shots: shotUrls,
      contractId: contractId || null,
      ...(diff ? { diff: { missing: diff.missing, damaged: diff.damaged, added: diff.added, unverifiable: diff.unverifiable, intact: diff.intact } } : {}),
    };
    const field = kind === 'riconsegna' ? 'inventarioUscita' : 'inventario';
    await fsPatch('properties/' + propertyId, { [field]: record }).catch((e) => console.warn('[inventario] property patch', e.message));
    if (contractId) await fsPatch('contracts/' + contractId, { [field]: record }).catch((e) => console.warn('[inventario] contract patch', e.message));

    const label = clip(property.address || property.name || propertyId, 60);
    const yr = new Date().getFullYear();
    await fsCreate('documents', {
      name: `Inventario ${kind} · ${label} · ${yr}`,
      type: 'legal', category: 'inventario',
      tags: ['02_Contratti', 'inventario', 'stato dei luoghi', kind],
      fileUrl: url, fileName: `inventario-${kind}.pdf`, mimeType: 'application/pdf',
      propertyId, contractId: contractId || null, fiscalYear: yr,
      docDate: when.iso.slice(0, 10),
      tenantName: (contract && contract.tenantName) || null,
      notes: `${record.counts.pieces} pezzi in ${record.counts.rooms} ambienti — rilievo del ${when.d}`,
      source: 'inventario', uploadedBy: author,
      needsFiling: false, shared: false, createdAt: new Date(),
    }).catch((e) => console.warn('[inventario] documents filing:', e.message));

    // L'email è il documento che l'operatore ritrova fra sei mesi: stesso
    // design system delle altre (masthead nero, marchio, carta bianca), il
    // numero che conta in testa, e il PDF IN ALLEGATO — un link a Storage
    // scade dalla memoria, un allegato no.
    const uscita = kind === 'riconsegna';
    const cnt = record.counts;
    const dl = (n, w1, w2) => `${n} ${n === 1 ? w1 : w2}`;
    // Il confronto è UN QUADRO, non un elenco spuntato: una spunta verde
    // accanto a "5 voci mancanti" dice il contrario di quello che è successo.
    const diffBlock = diff
      ? rule() + para('<strong>Confronto con l\u2019inventario di consegna</strong>')
        + tiles([
          { k: 'Mancanti', v: String(diff.missing.length) },
          { k: 'Danni nuovi', v: String(diff.damaged.length) },
          { k: 'Comparsi dopo', v: String(diff.added.length) },
        ])
        + (diff.unverifiable.length
          ? fine(`${dl(diff.unverifiable.length, 'voce non verificabile', 'voci non verificabili')}: alla consegna la condizione non era dichiarata, quindi il danno non le si può imputare. È nel PDF, con il motivo accanto.`)
          : '')
      : '';

    await notify({
      to: ADMIN_NOTIFY,
      subject: `📋 Inventario ${kind} — ${label}`,
      html: shell(
        hero({
          eyebrow: `Inventario — ${kind}`,
          value: `${cnt.pieces} ${cnt.pieces === 1 ? 'pezzo' : 'pezzi'}`,
          note: `in ${dl(cnt.rooms, 'ambiente', 'ambienti')}`
            + (cnt.damaged ? ` · <strong>${dl(cnt.damaged, 'con difetti rilevati', 'con difetti rilevati')}</strong>` : '')
            + (cnt.undeclared ? ` · ${cnt.undeclared} senza condizione dichiarata` : ''),
        })
        + tiles([
          { k: 'Immobile', v: label },
          { k: 'Rilievo', v: when.d, sub: `ore ${when.t}` },
          { k: 'Fotogrammi', v: String(shotUrls.length), sub: shotUrls.length ? 'allegati al PDF' : 'nessuno' },
        ])
        + para(uscita
          ? 'Il PDF è in allegato: elenco di oggi e, in coda, le differenze rispetto alla consegna. È il documento su cui si decide il <strong>saldo del deposito</strong>.'
          : (contractId
            ? 'Il PDF è in allegato e agganciato al contratto: da qui in poi il <strong>verbale di consegna</strong> stampa questo elenco al posto della formula generica sugli arredi.'
            : 'Il PDF è in allegato e agganciato all\u2019immobile. Quando nascerà il contratto, diventerà l\u2019allegato del verbale di consegna.'))
        + diffBlock
        + btn(url, 'Apri l\u2019inventario')
        + fine('Copia archiviata in Documenti (categoria inventario)'
          + (kind === 'consegna' ? '. Alla riconsegna riapri /inventario sullo stesso immobile: il confronto lo fa da solo.' : '.')),
        `Inventario ${kind} — ${label}`),
      pdfBytes, filename: `BOOM_Inventario_${kind}_${when.iso.slice(0, 10)}.pdf`,
    });

    logActivity('Inventario ' + kind, 'property', { propertyId, contractId, pieces: record.counts.pieces }, author).catch(() => {});
    return res.status(200).json({ ok: true, url, counts: record.counts, diff, shots: shotUrls.length });
  }

  return res.status(400).json({ ok: false, error: 'unknown_op' });
}
