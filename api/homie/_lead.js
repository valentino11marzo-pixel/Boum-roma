// api/homie/_lead.js — da messaggio WhatsApp a lead, senza far pensare nessuno.
//
// IL BUCO CHE CHIUDE.
// Finché Homie ANALIZZAVA ogni messaggio con Sonnet, era lui a decidere "questa
// è una persona che cerca casa" e a creare il lead. Se Homie smette di pensare
// — che è l'obiettivo, perché quel pensiero costa ed è già fatto sul server —
// un WhatsApp da un numero sconosciuto finisce in `conversations` e basta:
//   · il Lead Brain non lo vede      (interroga `leads`)
//   · notify-pending non lo manda    (interroga `leads`)
//   · il Commerciale non scrive nulla
// cioè il cliente sparisce dal telefono dell'operatore e sopravvive solo
// nell'Inbox del portale, che richiede un desktop. Un prospect su WhatsApp è
// vivo ADESSO: perderlo lì è perderlo.
//
// Qui la decisione diventa DETERMINISTICA e gratis: un inbound da un numero
// che non è già un contatto BOOM diventa un `leads` doc con lo stesso schema
// che scrivono homie/inbound e leads/scan-inbox. Da lì la macchina esistente
// fa tutto da sola — Lead Brain (haiku in batch, tetto giornaliero) → ping
// Telegram col bottone WhatsApp precompilato → bozza del Commerciale.
//
// Il giudizio resta al Brain, che è l'unico posto dove è batchato e limitato.
// Qui si filtra solo il RUMORE puro (un pollice in su, un "ok") — non si
// giudica se la persona è seria: quello costerebbe token e li spende già
// qualcun altro, meglio.

import { fsList } from './_lib.js';

// ── il numero, scritto in tutti i modi in cui esiste davvero ───────────────
// WhatsApp consegna SEMPRE l'internazionale (+393334444444); i portali e i
// form salvano spessissimo il nazionale (3334444444), e capita lo 0039. Una
// ricerca per uguaglianza su UNA sola forma manca la persona e la sdoppia:
// due lead, due risposte diverse, e il cliente che se ne accorge.
export function normalizePhone(p) {
  if (!p) return '';
  let s = String(p).replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = '+' + s.slice(2);
  else if (!s.startsWith('+')) {
    if (s.startsWith('3') || s.startsWith('0')) s = '+39' + s.replace(/^0/, '');
  }
  return s;
}

/** Le forme sotto cui lo stesso numero può essere archiviato. Senza duplicati. */
export function phoneVariants(p) {
  const norm = normalizePhone(p);
  const out = new Set();
  if (norm) out.add(norm);
  const raw = String(p || '').trim();
  if (raw) out.add(raw);
  if (norm.startsWith('+39')) out.add(norm.slice(3));        // nazionale
  if (norm.startsWith('+')) out.add('00' + norm.slice(1));   // 0039…
  return [...out].filter(Boolean);
}

// ── il rumore, e solo quello ────────────────────────────────────────────────
// Non è un filtro anti-spam: allo spam pensa stage0 del Lead Brain, gratis e
// con regole già scritte. Qui cade solo ciò che non è un messaggio — una
// reazione, una spunta, un "ok" — perché aprire un lead su un pollice in su
// riempie la pipeline di niente.
const ACK_ONLY = /^(ok(ay)?|va bene|perfetto|perfect|grazie( mille)?|thanks?( you)?|thx|ricevuto|👍|🙏|👌|✅|ciao|hi|hello|buongiorno|buonasera|salve)[\s.!?😊🙂👍🙏👌]*$/i;

export function isNoise(text) {
  const s = String(text || '').trim();
  if (s.length < 2) return true;
  // solo emoji / punteggiatura: nessuna lettera né cifra
  if (!/[\p{L}\p{N}]/u.test(s)) return true;
  // un saluto secco è rumore SOLO se è cortissimo: "ciao" sì,
  // "ciao, cercavo un bilocale" ovviamente no
  if (s.length <= 24 && ACK_ONLY.test(s)) return true;
  return false;
}

// ── quale casa sta guardando ────────────────────────────────────────────────
// Stessa aritmetica di leads/scan-inbox: sovrapposizione di token distintivi,
// e MAI un tiro a indovinare — un pareggio non produce nessun match.
const STOP = new Set([
  'bilocale', 'trilocale', 'monolocale', 'quadrilocale', 'appartamento', 'apartment',
  'roma', 'rome', 'affitto', 'zona', 'luminoso', 'casa', 'flat', 'house', 'stanza',
]);

export function matchListing(text, listings) {
  if (!text || !Array.isArray(listings) || !listings.length) return null;
  const t = String(text).toLowerCase();
  let best = null, bestScore = 0, ties = 0;
  for (const l of listings) {
    const hay = `${l.name || ''} ${l.zone || ''} ${l.address || ''}`.toLowerCase();
    const toks = new Set((hay.match(/[a-zà-ù]{4,}/g) || []).filter(w => !STOP.has(w)));
    const score = [...toks].filter(w => t.includes(w)).length;
    if (score > bestScore) { best = l; bestScore = score; ties = 0; }
    else if (score === bestScore && score > 0) ties++;
  }
  return bestScore > 0 && ties === 0 ? best : null;
}

// ── il messaggio che cresce ────────────────────────────────────────────────
// Una conversazione WhatsApp arriva a pezzi: "ciao" · "cercavo un bilocale" ·
// "per settembre, sono di Berlino". Il lead NON si duplica a ogni riga: la
// prima lo crea, le successive lo ARRICCHISCONO — così replyLang capisce la
// lingua vera e il Commerciale scrive su tutto il contesto, non sul "ciao".
export const MAX_MESSAGE = 1500;

export function mergeMessage(prev, next) {
  const a = String(prev || '').trim();
  const b = String(next || '').trim();
  if (!b) return a;
  if (!a) return b.slice(0, MAX_MESSAGE);
  if (a.includes(b)) return a;
  return (a + '\n' + b).slice(0, MAX_MESSAGE);
}

/**
 * Il doc `leads` da un messaggio WhatsApp. Puro: nessuna I/O, testabile.
 * Stesso schema di homie/inbound e leads/scan-inbox — niente fork.
 */
export function buildLead({ text, phone, name, listing, messageId, conversationId, at }) {
  // normalizzato ALLA PORTA: si smette di generare il problema che
  // phoneVariants deve poi rincorrere in lettura
  const tel = normalizePhone(phone);
  return {
    source: 'whatsapp',
    name: (name && String(name).slice(0, 120)) || String(tel || phone || 'WhatsApp'),
    email: null,
    phone: tel ? tel.slice(0, 40) : null,
    message: String(text || '').slice(0, MAX_MESSAGE),
    // la lingua NON si dichiara: la deduce replyLang dalle parole vere
    language: null,
    propertyId: listing ? listing.id : null,
    propertyTitle: listing ? (listing.name || null) : null,
    propertyPrice: listing ? (listing.price || null) : null,
    status: 'new',
    sourceRef: messageId ? String(messageId).slice(0, 200) : null,
    conversationId: conversationId || null,
    raw: { via: 'homie/message', channel: 'whatsapp' },
    createdAt: at || new Date(),
  };
}

// ── deduplica per persona ──────────────────────────────────────────────────
// Lo stesso numero può arrivare da WhatsApp, da un portale e dal form del
// sito nello stesso pomeriggio. Un lead per persona, non tre.
export const DEDUPE_WINDOW_MS = 7 * 86400000;

export async function recentLeadByPhone(phone, now = Date.now()) {
  if (!phone) return null;
  const seen = new Map();
  for (const variant of phoneVariants(phone)) {
    let rows = [];
    try { rows = await fsList('leads', { filter: { field: 'phone', op: 'EQUAL', value: variant }, limit: 5 }); }
    catch { continue; }
    for (const r of rows || []) seen.set(r.id, r);
  }
  const live = [...seen.values()]
    .filter(r => now - new Date(r.createdAt || 0).getTime() < DEDUPE_WINDOW_MS)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return live[0] || null;
}

/** Il catalogo, una lettura sola, tollerante al fallimento. */
export async function loadCatalog() {
  try { return await fsList('listings', { limit: 100 }); }
  catch { return []; }
}
