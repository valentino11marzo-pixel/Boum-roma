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
// Method: POST   Body: { name, contact | email | phone, zone, freeFrom, goal,
//                        sqm, rooms, furnished, rent, message, lang,
//                        attribution, company(honeypot) }
// Response 200: { ok: true, id } | 4xx/5xx: { ok: false, error }

import { fsCreate, fsPatch, logActivity } from './homie/_lib.js';
import { tgSend } from './telegram/_lib.js';
import { b2bReplyText } from './_market.js';

const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > MAX_PER_WINDOW;
}

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
  const summary = ownerSummary(owner);

  const now = new Date();
  const lead = {
    source: 'web',
    service: 'Proprietari',
    market: 'roma',
    leadType: 'landlord',          // offre una casa — NON cerca casa
    intent: 'owner',
    name, email: hasEmail ? email : null, phone: hasPhone ? phone : null,
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
    sourceRef: 'owners',
    // Da dove arriva (UTM → referrer → diretto), timbrato nel modulo da
    // js/boom-track.js: le campagne proprietari di docs/owner-outreach.md si
    // misurano solo così.
    attribution: clip(body.attribution, 120),
    owner: { ...owner, at: now.toISOString() },
    raw: { ...owner, ip, ua: clip(req.headers['user-agent'], 300) },
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

  await logActivity('Lead proprietario (pagina /owners)', 'lead',
    { leadId: id, zone: owner.zone, goal: owner.goal }, 'owner-lead').catch(() => {});

  // La card, alla porta. Tetto di 5s: una risposta al proprietario non
  // aspetta Telegram. Se fallisce, notify-pending la recupera al minuto dopo.
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (chatId) {
    try {
      const card = ownerCard({ ...lead, id });
      const mid = await Promise.race([
        tgSend(chatId, card.text, { reply_markup: { inline_keyboard: card.buttons } }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('tg_timeout')), 5000)),
      ]);
      await fsPatch(`leads/${id}`, { telegramNotifiedAt: new Date(), telegramMessageId: mid || null });
    } catch (e) {
      console.warn('[owner-lead] telegram ping deferred to notify-pending:', e.message);
    }
  }

  return res.status(200).json({ ok: true, id });
}

/**
 * La card Telegram del proprietario: chi, l'immobile in una riga, cosa chiede
 * e il tasto WhatsApp col messaggio già scritto (col Lei — la dottrina delle
 * risposte rapide: il proprietario è il cliente che ci affida un bene).
 */
export function ownerCard(lead) {
  const o = lead.owner || {};
  const lines = [
    `🔑 <b>Proprietario: ${esc(lead.name)}</b> · pagina /owners`,
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
  return { text: lines.join('\n'), buttons };
}
