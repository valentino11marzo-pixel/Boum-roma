// api/owner-lead.js
// La porta della pagina /owners — il proprietario che ci affida un bene.
//
// Perché una porta sua e non più /api/partners/submit. Il vecchio modulo
// della pagina mandava lì i proprietari, con la ZONA infilata nel campo
// `org` (quello dell'ente) e nessun dato dell'immobile: l'operatore riceveva
// «Proprietario: Prati» e doveva richiamare per sapere tutto il resto. Il
// messaggio WhatsApp già scritto (api/_market.js → b2bReplyText) chiedeva
// infatti «che zona, da quando è libero, arredato o no?» — le tre cose che un
// modulo decente avrebbe già raccolto. Qui si raccolgono, e la risposta
// pronta NON le richiede più.
//
// Tre regole, tutte asserite in tests/owners/run.mjs:
//  1. Il proprietario NON entra nella macchina inquilino. `leadType:'landlord'`
//     + `intent:'owner'` → isB2B() lo riconosce, il Commerciale TACE (la sua
//     persona scriverebbe «stai ancora cercando casa a Roma?» a chi una casa
//     la OFFRE) e la card Telegram porta la voce del proprietario.
//  2. L'operatore lo sa SUBITO, con UNA card: il ping parte qui, alla porta,
//     col tasto WhatsApp e il messaggio già scritto, e il lead viene marcato
//     `telegramNotifiedAt` — notify-pending non lo ripete e non lo seppellisce
//     nel riepilogo dei lead C. Un proprietario è offerta: vale più di dieci
//     richieste.
//  3. Ogni scrittura è ATTESA prima della risposta (la lezione del 13/09: su
//     Vercel ciò che parte dopo res.json può morire in volo). Il ping è
//     best-effort e a tempo: se Telegram tace, il lead resta `new` senza
//     `telegramNotifiedAt` e notify-pending lo recupera entro un minuto.
//
// IL CONTO DELLA SUA CASA (13/10/2026). La stessa porta serve /canone: il
// proprietario che chiede il conto in PDF manda il suo `calc` (zona, metri,
// dotazioni…). Quarta regola: i numeri del browser NON valgono. Il server
// rilegge l'input con la lista chiusa del motore (js/conto-engine.js),
// RICALCOLA il conto con js/canone-engine.js e lo congela in
// `ownerConti/<id>` — il PDF si stampa da quella foto, mai da un ricalcolo
// (un link aperto fra sei mesi mostra il conto che il proprietario ha
// ricevuto). Un `calc` sbagliato non costa il lead: il lead nasce, senza PDF.
// Lo stesso recapito entro 30 giorni non fa un secondo lead: il conto nuovo
// si aggiunge a quello esistente (`owner.conti`).
//
// Method: POST   Body: { name, contact | email | phone, zone, freeFrom, goal,
//                        sqm, rooms, furnished, rent, message, lang,
//                        attribution, sourceRef('owners'|'canone'), calc?,
//                        company(honeypot) }
// Response 200: { ok: true, id, ref?, pdfUrl? } | 4xx/5xx: { ok: false, error }
// Method: GET ?pdf=<contoId>&t=<token> → il PDF del conto (link firmato).

import crypto from 'node:crypto';
import { fsCreate, fsPatch, fsGet, fsList, logActivity } from './homie/_lib.js';
import { phoneVariants, normalizePhone } from './homie/_lead.js';
import { tgSend } from './telegram/_lib.js';
import { b2bReplyText } from './_market.js';
import CONTO from '../js/conto-engine.js';
import { buildContoPdf } from './owners/_conto-pdf.js';

const HITS = new Map();
const PDF_HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;
function rateLimited(ip, map = HITS, max = MAX_PER_WINDOW) {
  const now = Date.now();
  const arr = (map.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  map.set(ip, arr);
  if (map.size > 5000) map.clear();
  return arr.length > max;
}

// ─── Il link del PDF: derivato, non memorizzato ─────────────────────────
// Stesso schema di api/payments/_token.js: sha256 dell'id + segreto server.
// Ruotando il segreto si revocano tutti i link in circolazione.
const SITE = 'https://www.boomrome.com';
function salt() {
  return process.env.HOMIE_SECRET || process.env.CRON_SECRET || process.env.STRIPE_WEBHOOK_SECRET || 'boom';
}
export function contoToken(id) {
  return crypto.createHash('sha256').update(`boom-conto:${id}:${salt()}`).digest('hex').slice(0, 24);
}
export function verifyContoToken(id, token) {
  const want = Buffer.from(contoToken(id));
  const got = Buffer.from(String(token || ''));
  if (want.length !== got.length) return false;
  try { return crypto.timingSafeEqual(want, got); } catch (_) { return false; }
}
export function contoPdfUrl(id) {
  return `${SITE}/api/owner-lead?pdf=${encodeURIComponent(id)}&t=${contoToken(id)}`;
}
// Il riferimento che il proprietario legge e cita al telefono: corto, senza
// lettere che si confondono (I/O/0/1), derivato dall'id.
const REF_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function contoRef(id) {
  const h = crypto.createHash('sha256').update('conto-ref:' + id).digest();
  let out = '';
  for (let i = 0; i < 6; i++) out += REF_ALPHA[h[i] % REF_ALPHA.length];
  return 'CNT-' + out;
}
const newId = () => crypto.randomBytes(15).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 20).padEnd(20, '0');

const withTimeout = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(tag || 'timeout')), ms))]);

/**
 * Dal `calc` del browser al conto del SERVER. null se l'input non passa la
 * lista chiusa: il lead nasce lo stesso, senza PDF.
 */
export function serverConto(calc) {
  if (!calc || typeof calc !== 'object') return null;
  const n = CONTO.normalize(calc);
  if (!n.ok) return null;
  const r = CONTO.conto(n.input);
  return r && r.ok ? r : null;
}

/** La riga che la card, la risposta e il lead leggono (mai il conto intero). */
export function contoSummary(r, extra = {}) {
  return {
    zone: { cod: r.zone.cod, label: r.zone.label },
    mq: r.input.mq, sc: r.sc, tipo: r.tipo, declared: r.declared, normale: r.normale,
    fascia: r.fascia, nP: r.nP, max: r.max, min: r.min,
    fasce: { A: r.fasce.A ? r.fasce.A.max : null, B: r.fasce.B ? r.fasce.B.max : null, C: r.fasce.C ? r.fasce.C.max : null },
    ask: r.ask ? { value: r.ask.value, fits: r.ask.fits, excess: r.ask.excess, need: r.ask.need == null ? null : r.ask.need } : null,
    netto: r.netto || null, pareggioLibero: r.pareggioLibero || null,
    ...extra,
  };
}

/** La riga del Perito per la zona, best-effort e a tempo. */
async function marketSnapshot(cod) {
  const slug = CONTO.MARKET_OF[cod];
  if (!slug) return null;
  try {
    const d = await withTimeout(fsGet(`marketStats/${slug}`), 2500, 'market_timeout');
    if (!d || !d.asked || !d.asked.ok) return null;
    const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return CONTO.marketFor(cod, { minSample: d.minSample, zones: [{ slug, zone: name, asked: d.asked, updatedAt: d.at || null }] });
  } catch (_) { return null; }
}

// Lo stesso proprietario entro 30 giorni (stessa email o stesso numero, in
// qualunque forma): un lead solo. Fail-open: una lettura che fallisce fa
// nascere un lead nuovo, mai un rifiuto.
export const OWNER_DEDUPE_MS = 30 * 86400000;
async function recentOwnerLead({ email, phone }, now = Date.now()) {
  const seen = new Map();
  const probes = [];
  if (email) probes.push(['email', email]);
  if (phone) {
    // `phoneNorm` è la forma unica scritta alla porta: «+39 333 123 4567» e
    // «3331234567» sono lo stesso proprietario. Le varianti coprono i lead
    // nati prima, salvati così come erano stati scritti.
    const norm = normalizePhone(phone);
    if (norm) probes.push(['phoneNorm', norm]);
    for (const v of phoneVariants(phone)) probes.push(['phone', v]);
  }
  for (const [field, value] of probes) {
    try {
      const rows = await withTimeout(fsList('leads', { filter: { field, op: 'EQUAL', value }, limit: 5 }), 3000, 'dedupe_timeout');
      for (const r of rows || []) seen.set(r.id, r);
    } catch (_) { /* fail-open */ }
  }
  return [...seen.values()]
    .filter(r => r.intent === 'owner' && r.leadType === 'landlord' && now - new Date(r.createdAt || 0).getTime() < OWNER_DEDUPE_MS)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
}
const REPING_MS = 12 * 3600000;

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
// «1.450», «1,450» e «1450» sono lo stesso canone: i separatori delle
// migliaia si tolgono PRIMA di leggere il numero (la lezione di executive-lead:
// parseFloat legge «1.450» come un euro e mezzo).
const num = v => {
  const s = String(v == null ? '' : v).replace(/[.,\s](?=\d{3}(\D|$))/g, '');
  const n = typeof v === 'number' ? v : parseFloat(s.replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
};
// Migliaia deterministiche per gli occhi dell'operatore, mai toLocaleString
// (con ICU ridotta degrada in silenzio).
const fmtEur = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const EMAIL_RE = /[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}/i;

// Liste CHIUSE: un valore ignoto diventa null, mai un'etichetta inventata.
// Le chiavi viaggiano stabili dalla pagina (IT o EN), le etichette sono per
// l'operatore, che legge in italiano.
export const FREE_FROM = {
  now:    'libero da subito',
  soon:   'libero entro 3 mesi',
  later:  'libero più avanti',
  rented: 'oggi affittato',
};
export const GOALS = {
  full:       'affitto + gestione completa',
  find:       'solo trovare l\'inquilino',
  // Il secondo passo della scala di /owners: «mi riaffittate e basta?». La
  // pagina non verifica che sia davvero già cliente — lo DICHIARA lui, e
  // l'etichetta lo dice all'operatore invece di trattarlo come un fatto.
  relet:      'riaffitto (si dichiara già cliente BOOM — verificare)',
  value:      'sapere quanto rende',
  concordato: 'canone concordato (cedolare 10%)',
};
export const FURNISHED = { yes: 'arredato', partial: 'parzialmente arredato', no: 'vuoto' };
export const ROOMS = { studio: 'monolocale', '2': 'bilocale', '3': 'trilocale', '4': '4 locali', '5+': '5+ locali' };

/**
 * Dal campo unico «Telefono o email» ai due recapiti. Chi scrive entrambi li
 * vede entrambi salvati; chi scrive solo il numero non viene scambiato per
 * un'email malformata.
 */
export function splitContact(raw) {
  const s = String(raw || '').trim();
  const m = s.match(EMAIL_RE);
  const email = m ? m[0] : null;
  const rest = email ? s.replace(email, ' ') : s;
  const digits = rest.replace(/[^\d+]/g, '');
  const phone = digits.replace(/\D/g, '').length >= 6 ? rest.replace(/[^\d+\s]/g, '').replace(/\s+/g, ' ').trim() : null;
  return { email, phone };
}

/** La riga che l'operatore legge PRIMA di tutto il resto. */
export function ownerSummary(o) {
  const parts = [];
  if (o.zone) parts.push(o.zone);
  if (o.sqm) parts.push(`${Math.round(o.sqm)} mq`);
  if (o.rooms && ROOMS[o.rooms]) parts.push(ROOMS[o.rooms]);
  if (o.furnished && FURNISHED[o.furnished]) parts.push(FURNISHED[o.furnished]);
  if (o.freeFrom && FREE_FROM[o.freeFrom]) parts.push(FREE_FROM[o.freeFrom]);
  if (o.rent) parts.push(`canone in mente ~€${fmtEur(o.rent)}/mese`);
  const head = `PROPRIETARIO — Roma${parts.length ? ' · ' + parts.join(' · ') : ''}` +
    (o.goal && GOALS[o.goal] ? ` · chiede: ${GOALS[o.goal]}` : '') + '.';
  return [head, o.note].filter(Boolean).join(' ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return servePdf(req, res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });

  // Honeypot: un umano non lo riempie. 200 così il bot non impara niente.
  if (body.company) return res.status(200).json({ ok: true, id: 'skip' });

  const name = clip(body.name, 120);
  const fromContact = splitContact(body.contact);
  const email = clip(body.email, 160) || fromContact.email;
  const phone = clip(body.phone, 40) || fromContact.phone;
  const hasEmail = !!(email && EMAIL_RE.test(email));
  const hasPhone = !!(phone && phone.replace(/\D/g, '').length >= 6);
  if (!name || name.length < 2) return res.status(400).json({ ok: false, error: 'name_required' });
  if (!hasEmail && !hasPhone) return res.status(400).json({ ok: false, error: 'contact_required' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const pick = (map, v) => (Object.prototype.hasOwnProperty.call(map, String(v || '')) ? String(v) : null);
  const owner = {
    zone: clip(body.zone, 120),
    freeFrom: pick(FREE_FROM, body.freeFrom),
    goal: pick(GOALS, body.goal),
    sqm: (() => { const n = num(body.sqm); return n && n >= 10 && n <= 2000 ? n : null; })(),
    rooms: pick(ROOMS, body.rooms),
    furnished: pick(FURNISHED, body.furnished),
    // Un canone mensile plausibile, non un prezzo di vendita digitato nel
    // campo sbagliato: fuori scala → null, mai «€350.000/mese» sulla card.
    rent: (() => { const n = num(body.rent); return n && n >= 150 && n <= 30000 ? n : null; })(),
    note: clip(body.message, 1000),
    lang: body.lang === 'en' ? 'en' : 'it',
  };
  const sourceRef = body.sourceRef === 'canone' ? 'canone' : 'owners';
  // Ciò che il proprietario ha SCRITTO in questo invio, prima che il conto
  // riempia zona, metri e richiesta per un lead nuovo: in un'unione si usa
  // solo questo, e mai per sovrascrivere.
  const provided = { ...owner };

  // Il conto: ricalcolato QUI, congelato in ownerConti prima del lead.
  const r = serverConto(body.calc);
  let conto = null;
  if (r) {
    const contoId = newId();
    const ref = contoRef(contoId);
    const market = await marketSnapshot(r.zone.cod);
    try {
      await fsCreate('ownerConti', {
        ref, at: new Date().toISOString(), v: r.v, engine: 'canone-engine', cfg: 'default', sourceRef,
        input: r.input, result: r, market, prices: CONTO.PRICES,
      }, contoId);
      conto = contoSummary(r, { ref, contoId, pdfUrl: contoPdfUrl(contoId), market: market ? { median: market.median, sample: market.sample } : null, at: new Date().toISOString() });
    } catch (e) {
      // Senza la foto non c'è PDF: il lead nasce comunque, col solo riassunto.
      console.warn('[owner-lead] conto non congelato:', e.message);
      conto = contoSummary(r, { ref: null, contoId: null, pdfUrl: null, market: null, at: new Date().toISOString() });
    }
    if (!owner.zone) owner.zone = `${r.zone.label} (${r.zone.cod})`;
    if (!owner.sqm) owner.sqm = r.input.mq;
    if (!owner.goal) owner.goal = 'concordato';
    owner.conto = conto;
  }
  const summary = ownerSummary(owner);
  // La risposta è la STESSA per un lead nuovo e per un'unione: chi conosce
  // l'email di un altro non deve poter sapere se quel proprietario ci ha già
  // scritto.
  const reply = { ok: true, ref: conto ? conto.ref : null, pdfUrl: conto ? conto.pdfUrl : null };

  // Lo stesso proprietario entro 30 giorni: si aggiunge al suo lead, senza
  // togliere niente. Il recapito non è verificato, quindi un'unione può solo
  // RIEMPIRE ciò che manca (una risposta già data non si sovrascrive), le note
  // si accodano e i conti si aggiungono allo storico. Se la scrittura fallisce
  // nasce un lead nuovo: un proprietario non si perde mai per un'unione.
  const prev = await recentOwnerLead({ email: hasEmail ? email : null, phone: hasPhone ? phone : null });
  if (prev) {
    const old = prev.owner || {};
    const merged = { ...old };
    for (const [k, v] of Object.entries(provided)) {
      if (v == null || k === 'conto' || k === 'note' || k === 'lang') continue;
      if (merged[k] == null || merged[k] === '') merged[k] = v;
    }
    if (provided.note && provided.note !== old.note) merged.note = [old.note, provided.note].filter(Boolean).join(' · ').slice(0, 1000);
    if (!merged.zone && conto) merged.zone = `${conto.zone.label} (${conto.zone.cod})`;
    if (!merged.sqm && conto) merged.sqm = conto.mq;
    if (conto) { merged.conto = conto; merged.conti = [conto, ...(Array.isArray(old.conti) ? old.conti : old.conto ? [old.conto] : [])].slice(0, 10); }
    merged.at = new Date().toISOString();
    const patch = { owner: merged, message: ownerSummary(merged), notes: ownerSummary(merged), updatedAt: new Date(), lastOwnerContactAt: new Date() };
    if (!prev.email && hasEmail) patch.email = email;
    if (!prev.phone && hasPhone) { patch.phone = phone; patch.phoneNorm = normalizePhone(phone) || null; }
    let mergedOk = false;
    try { await fsPatch(`leads/${prev.id}`, patch); mergedOk = true; }
    catch (e) { console.warn('[owner-lead] merge failed, nuovo lead:', e.message); }
    if (mergedOk) {
      await logActivity('Proprietario: nuovo conto sullo stesso lead', 'lead', { leadId: prev.id, zone: merged.zone, ref: reply.ref }, 'owner-lead').catch(() => {});
      const last = prev.telegramNotifiedAt ? new Date(prev.telegramNotifiedAt).getTime() : 0;
      if (last && Date.now() - last > REPING_MS) await pingOwner({ ...prev, ...patch, name: prev.name || name, id: prev.id, sourceRef }, true);
      return res.status(200).json(reply);
    }
  }

  const { conto: _c, ...rawOwner } = owner;
  const now = new Date();
  const lead = {
    source: 'web',
    service: 'Proprietari',
    market: 'roma',
    leadType: 'landlord',          // offre una casa — NON cerca casa
    intent: 'owner',
    name, email: hasEmail ? email : null, phone: hasPhone ? phone : null,
    phoneNorm: hasPhone ? (normalizePhone(phone) || null) : null,
    message: summary,
    notes: summary,
    // La pagina è italiana col suo interruttore inglese: la scelta del
    // proprietario è la dichiarazione più onesta che abbiamo. Le SUE parole
    // (owner.note) la battono comunque, dentro b2bReplyText.
    language: owner.lang,
    zone: owner.zone,
    budget: null,                  // il budget è un concetto dell'inquilino
    propertyAddress: owner.zone,
    status: 'new',
    grade: null,
    ingestedBy: 'owner-lead',
    sourceRef,
    // Da dove arriva (UTM → referrer → diretto), timbrato nel modulo da
    // js/boom-track.js: le campagne proprietari di docs/owner-outreach.md si
    // misurano solo così.
    attribution: clip(body.attribution, 120),
    owner: { ...owner, at: now.toISOString() },
    raw: { ...rawOwner, ip, ua: clip(req.headers['user-agent'], 300) },
    createdAt: now,
    ingestedAt: now,
  };

  let id;
  try {
    ({ id } = await fsCreate('leads', lead));
  } catch (err) {
    console.error('[owner-lead] write failed:', err.message);
    return res.status(500).json({ ok: false, error: 'internal' });
  }

  await logActivity(sourceRef === 'canone' ? 'Lead proprietario (conto /canone)' : 'Lead proprietario (pagina /owners)', 'lead',
    { leadId: id, zone: owner.zone, goal: owner.goal, ref: reply.ref }, 'owner-lead').catch(() => {});

  await pingOwner({ ...lead, id });
  return res.status(200).json(reply);
}

// La card, alla porta. Tetto di 5s: una risposta al proprietario non
// aspetta Telegram. Se fallisce, notify-pending la recupera al minuto dopo.
async function pingOwner(lead, again = false) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;
  try {
    const card = ownerCard(lead, { again });
    const mid = await withTimeout(tgSend(chatId, card.text, { reply_markup: { inline_keyboard: card.buttons } }), 5000, 'tg_timeout');
    await fsPatch(`leads/${lead.id}`, { telegramNotifiedAt: new Date(), telegramMessageId: mid || null });
  } catch (e) {
    console.warn('[owner-lead] telegram ping deferred to notify-pending:', e.message);
  }
}

// GET ?pdf=<contoId>&t=<token> — il PDF, dalla foto. Il token è la
// credenziale; un id sconosciuto e un token sbagliato rispondono uguale.
async function servePdf(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url || '/', SITE).searchParams);
  const id = String(q.pdf || '');
  if (!/^[A-Za-z0-9]{12,40}$/.test(id) || !verifyContoToken(id, q.t)) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip, PDF_HITS, 30)) return res.status(429).json({ ok: false, error: 'rate_limited' });
  let snap;
  try { snap = await fsGet(`ownerConti/${id}`); }
  catch (e) { console.error('[owner-lead] pdf read:', e.message); return res.status(500).json({ ok: false, error: 'internal' }); }
  if (!snap || !snap.result || !snap.result.ok) return res.status(404).json({ ok: false, error: 'not_found' });
  try {
    const bytes = await buildContoPdf({ ...snap, parametri: CONTO.PARAMETRI, prices: snap.prices || CONTO.PRICES });
    const name = `BOOM_conto_${String(snap.result.zone && snap.result.zone.cod || 'roma')}_${snap.ref || id}.pdf`.replace(/[^\w.-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    console.error('[owner-lead] pdf build:', e.message);
    return res.status(500).json({ ok: false, error: 'pdf_failed' });
  }
}

/**
 * La card Telegram del proprietario: chi, l'immobile in una riga, cosa chiede
 * e il tasto WhatsApp col messaggio già scritto (col Lei — la dottrina delle
 * risposte rapide: il proprietario è il cliente che ci affida un bene).
 */
export function ownerCard(lead, { again = false } = {}) {
  const o = lead.owner || {};
  const c = o.conto || null;
  const lines = [
    `🔑 <b>Proprietario: ${esc(lead.name)}</b> · ${lead.sourceRef === 'canone' ? 'calcolo /canone' : 'pagina /owners'}${again ? ' · <i>è tornato</i>' : ''}`,
    c ? `🧮 ${esc(contoLine(c))}` : null,
    c && c.ask ? `💭 ${esc(askLine(c))}` : null,
    o.zone ? `🏠 ${esc(o.zone)}${o.sqm ? ' · ' + Math.round(o.sqm) + ' mq' : ''}${o.rooms && ROOMS[o.rooms] ? ' · ' + ROOMS[o.rooms] : ''}${o.furnished && FURNISHED[o.furnished] ? ' · ' + FURNISHED[o.furnished] : ''}` : null,
    o.freeFrom && FREE_FROM[o.freeFrom] ? `📅 ${FREE_FROM[o.freeFrom]}` : null,
    o.goal && GOALS[o.goal] ? `🎯 ${GOALS[o.goal]}` : null,
    o.rent ? `💶 canone in mente ~€${fmtEur(o.rent)}/mese` : null,
    [lead.phone && `📞 ${esc(lead.phone)}`, lead.email && `✉️ ${esc(lead.email)}`].filter(Boolean).join(' · ') || null,
    o.note ? `💬 <i>${esc(String(o.note).slice(0, 300))}</i>` : null,
  ].filter(Boolean);
  const buttons = [[]];
  const digits = String(lead.phone || '').replace(/\D/g, '');
  const waNum = digits ? (digits.length === 10 && digits.startsWith('3') ? '39' + digits : digits) : null;
  if (waNum) buttons[0].push({ text: '💬 WhatsApp (msg pronto)', url: `https://wa.me/${waNum}?text=${encodeURIComponent(b2bReplyText(lead))}` });
  // Niente bottone mailto: Telegram accetta solo URL http(s)/tg:// e un
  // bottone invalido fa cadere l'INTERO messaggio. L'email sta nel testo.
  buttons[0].push({ text: '📇 Portale', url: 'https://www.boomrome.com/portal' });
  if (c && c.pdfUrl && /^https:\/\//.test(c.pdfUrl)) buttons.push([{ text: '📄 Il conto in PDF', url: c.pdfUrl }]);
  return { text: lines.join('\n'), buttons };
}

const E = n => '€' + fmtEur(n);
/** «Prati (C40) · 65 mq → max €1.234/mese, fascia B (4/20)» */
export function contoLine(c) {
  const head = `${c.zone.label} (${c.zone.cod}) · ${Math.round(c.mq)} mq`;
  if (c.declared) return `${head} → max ${E(c.max)}/mese, fascia ${c.fascia} (${c.nP}/20 dotazioni)${c.ref ? ' · ' + c.ref : ''}`;
  const f = c.fasce || {};
  return `${head} → max A ${E(f.A)}${f.B ? ' · B ' + E(f.B) : ''}${f.C ? ' · C ' + E(f.C) : ''} (dotazioni non dette)${c.ref ? ' · ' + c.ref : ''}`;
}
export function askLine(c) {
  const a = c.ask;
  if (!a) return '';
  if (a.fits === true) return `pensava a ${E(a.value)}/mese: rientra`;
  if (a.fits === false) return `pensava a ${E(a.value)}/mese: supera di ${E(a.excess)} — parlarne prima dell'attestazione`;
  return `pensava a ${E(a.value)}/mese: servono ${a.need} dotazioni`;
}
