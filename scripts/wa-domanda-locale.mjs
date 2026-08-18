// scripts/wa-domanda-locale.mjs — LA DOMANDA, MISURATA SUL MAC.
//
//   node scripts/wa-domanda-locale.mjs ~/storico.json
//   wacli messages list --json | node scripts/wa-domanda-locale.mjs
//
// PERCHÉ ESISTE. Il misuratore vive dentro la Miniera, lato server: ma il
// server vede i thread solo DOPO che il Mac li ha spediti, e il codice nuovo
// solo dopo il deploy. Questo lo fa girare dov'è già tutto, oggi, senza
// mandare niente a nessuno: l'archivio resta sul Mac, esce solo l'aggregato.
//
// LA REGOLA DI HOMIE, RISPETTATA: qui non c'è nessun modello che "legge le
// chat e si fa un'idea". C'è la STESSA grammatica del server
// (js/wa-demand-engine.js, una copia sola), quindi il risultato è un conteggio
// ripetibile e non un'impressione — e rilanciandolo domani dà lo stesso numero.
//
// COSA ESCE, e cosa NON esce. Esce una classifica di intenzioni con conteggi,
// più esempi CORTI. Gli esempi passano da scrub(): via email, numeri di
// telefono, IBAN e cifre lunghe. Un rapporto che si incolla in chat non deve
// portarsi dietro i recapiti dei clienti.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WAD = require(path.join(HERE, '..', 'js', 'wa-demand-engine.js'));
const WA = require(path.join(HERE, '..', 'js', 'whatsapp-replies.js'));

/* ── lettura dell'export wacli ─────────────────────────────────────────────
 * Il formato VERO di wacli (visto in produzione sul Mac, 2026-08) annida:
 *   {"success":true,"data":{"fts":true,"messages":[…]}}
 * La prima versione guardava un livello solo e si fermava con un errore. Un
 * lettore che pretende UNA forma esatta trasferisce all'operatore un lavoro
 * che è del codice — e la forma cambia da sola alla prossima versione di
 * wacli. Quindi non si indovina e non si pretende: si CERCA la prima lista
 * fatta di cose che somigliano a messaggi, e se non c'è si dice quali chiavi
 * sono state trovate, così il passo dopo è ovvio. */
function looksLikeMessage(x) {
  if (!x || typeof x !== 'object') return false;
  const hasText = ['body', 'text', 'content', 'message', 'caption'].some(k => x[k] != null);
  const hasWho = ['chatId', 'chat', 'jid', 'from', 'conversationId', 'key', 'remoteJid'].some(k => x[k] != null);
  return hasText && hasWho;
}
function findMessages(node, depth) {
  if (depth > 4 || node == null) return null;
  if (Array.isArray(node)) return node.some(looksLikeMessage) ? node : null;
  if (typeof node !== 'object') return null;
  // prima le chiavi che di solito la portano, poi tutto il resto
  const keys = Object.keys(node);
  const first = ['messages', 'data', 'items', 'result', 'rows', 'records'].filter(k => keys.includes(k));
  for (const k of first.concat(keys.filter(k => !first.includes(k)))) {
    const found = findMessages(node[k], depth + 1);
    if (found) return found;
  }
  return null;
}
function findAnyArray(node, depth) {
  if (depth > 4 || node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.length ? node : null;
  let best = null;
  for (const k of Object.keys(node)) {
    const f = findAnyArray(node[k], depth + 1);
    if (f && (!best || f.length > best.length)) best = f;
  }
  return best;
}
function readInput() {
  const arg = process.argv[2];
  const raw = arg && arg !== '-' ? fs.readFileSync(arg, 'utf8') : fs.readFileSync(0, 'utf8');
  const j = JSON.parse(raw);
  const found = findMessages(j, 0);
  if (found) return found;
  const keys = j && typeof j === 'object' ? Object.keys(j).slice(0, 12).join(', ') : typeof j;
  // Se una lista c'è ma i suoi oggetti non somigliano a messaggi, il dato che
  // serve sono i NOMI DEI CAMPI: senza, il giro dopo è un altro tentativo.
  const any = findAnyArray(j, 0);
  const hint = any && any.length && typeof any[0] === 'object'
    ? ' Ho trovato una lista di ' + any.length + ' elementi con questi campi: '
      + Object.keys(any[0]).slice(0, 15).join(', ') + '.'
    : '';
  throw new Error('non trovo una lista di messaggi in questo JSON. Chiavi al primo livello: '
    + keys + '.' + hint
    + ' Serve un array di oggetti con un testo (body/text/content) e una chat (chatId/jid/from).');
}

/* I nomi dei campi cambiano fra versioni di wacli: si prova in ordine, come
 * fa già miniera_extract.py. Qui si RIDUCE soltanto — nessun giudizio. */
const field = (o, ...ks) => {
  for (const k of ks) if (o && o[k] != null && o[k] !== '') return o[k];
  return '';
};
function bodyOf(m) {
  let b = field(m, 'body', 'text', 'content', 'message', 'caption');
  // stile Baileys: { message: { conversation | extendedTextMessage: { text } } }
  if (b && typeof b === 'object') {
    b = field(b, 'text', 'caption', 'conversation')
      || field(b.extendedTextMessage || {}, 'text')
      || field(b.imageMessage || b.videoMessage || {}, 'caption');
  }
  return typeof b === 'string' ? b : '';
}
const isOut = (m) => {
  const v = field(m, 'fromMe', 'isFromMe', 'outgoing', 'direction') || field(m.key || {}, 'fromMe');
  return v === true || v === 'out' || v === 'outgoing' || v === 1 || v === '1';
};
const chatOf = (m) => String(
  field(m, 'chatId', 'chat', 'jid', 'conversationId', 'remoteJid', 'from')
  || field(m.key || {}, 'remoteJid', 'chatId') || '');
const tsOf = (m) => {
  const t = field(m, 'timestamp', 'ts', 'time', 'date', 'createdAt');
  const n = typeof t === 'string' ? Date.parse(t) : Number(t);
  if (!n || Number.isNaN(n)) return 0;
  return n < 1e12 ? n * 1000 : n;                 // secondi → millisecondi
};

/* ── privacy: l'aggregato si incolla in chat, i recapiti no ───────────── */
function scrub(s) {
  return String(s || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/(?:\+|00)\d[\d\s().-]{7,}\d/g, '[telefono]')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, '[iban]')
    .replace(/\b\d{9,}\b/g, '[numero]');
}

/* ── una voce per CONVERSAZIONE, solo parole del cliente ──────────────── */
function reduce(msgs) {
  const byChat = new Map();
  for (const m of msgs) {
    const chat = chatOf(m);
    if (!chat || /@g\.us|@broadcast|status@/i.test(chat)) continue;   // gruppi e stati: mai
    if (isOut(m)) continue;                                           // solo ciò che scrive il cliente
    const body = bodyOf(m);
    if (!body) continue;
    if (!byChat.has(chat)) byChat.set(chat, { texts: [], last: 0 });
    const e = byChat.get(chat);
    if (e.texts.length < 40) e.texts.push(body);
    e.last = Math.max(e.last, tsOf(m));
  }
  return [...byChat.entries()].map(([chat, e]) => ({
    source: 'whatsapp', id: chat,
    text: e.texts.join(' · ').slice(0, 4000),
    at: e.last || null,
  }));
}

/* ── il costo vero di ogni risposta: la sua lunghezza (come sul server) ── */
const LEN = new Map(WA.REPLIES.map((r) => [r.sc, r.text.length]));
const costOf = (covers) => {
  const l = covers.map((sc) => LEN.get(sc) || 0).filter(Boolean);
  return l.length ? Math.max(...l) / 200 : 2;
};

/* ── esecuzione ────────────────────────────────────────────────────────── */
let items, msgs;
try { msgs = readInput(); items = reduce(msgs); }
catch (e) { console.error('ERRORE: ' + e.message); process.exit(1); }

// "0 conversazioni" su un archivio pieno NON è una misura: è un lettore che
// non ha riconosciuto i campi. Meglio fermarsi mostrando la forma vera del
// primo messaggio — si aggiusta in un giro invece che in tre.
if (!items.length) {
  const sample = msgs.find(Boolean) || {};
  console.error('ERRORE: ho letto ' + msgs.length + ' messaggi ma nessuna conversazione in ingresso.');
  console.error('Campi del primo messaggio: ' + Object.keys(sample).join(', '));
  console.error('Struttura (valori accorciati, nessun testo intero):');
  console.error(JSON.stringify(sample, (k, v) =>
    (typeof v === 'string' ? scrub(v).slice(0, 40) : v), 1).slice(0, 900));
  console.error('\nIncolla queste righe: servono i nomi veri dei campi (testo, chat, direzione).');
  process.exit(1);
}

const days = Number(process.env.GIORNI || 180);
const m = WAD.measure(items, { costOf, defaultMinutes: 3, minSample: 30, days });

const L = [];
L.push('=== DOMANDA WHATSAPP — misura locale ===');
L.push(`finestra: ultimi ${days} giorni · conversazioni lette: ${m.totals.conversations}`);
L.push(`riconosciute: ${m.totals.classified}${m.totals.coverage != null ? ` (${m.totals.coverage}%)` : ''}`
  + ` · non riconosciute: ${m.totals.unmatched} · rumore (ok/grazie): ${m.totals.noise}`);
if (!m.sufficient) L.push(`ATTENZIONE: sotto ${m.minSample} conversazioni classificate — i conteggi valgono, le percentuali NO.`);
L.push('');
L.push('CLASSIFICA (per tempo risparmiato)');
L.push('  #  volte   min   intenzione                                  risposta');
m.intents.forEach((i, n) => {
  L.push('  ' + String(n + 1).padStart(2) + '  ' + String(i.count).padStart(5) + '  '
    + String(i.minutesSaved).padStart(4) + '   ' + i.label.padEnd(42).slice(0, 42) + '  '
    + (i.covered ? '/' + i.covers[0] : '*** DA SCRIVERE ***'));
});
if (m.gaps.length) {
  L.push('');
  L.push('CHIEDONO E NON C\'È UNA RISPOSTA PRONTA');
  m.gaps.forEach((g) => L.push(`  · ${g.label} — ${g.count} conversazioni`));
}
if (m.unmatchedSamples.length) {
  L.push('');
  L.push('NON SO NOMINARLE (le parole vere — è qui che stanno le risposte che mancano)');
  m.unmatchedSamples.slice(0, 12).forEach((u) => L.push('  · ' + scrub(u.text).slice(0, 150)));
}
L.push('');
L.push('ESEMPI PER LE PRIME CINQUE');
m.intents.slice(0, 5).forEach((i) => {
  L.push(`  [${i.label}]`);
  i.samples.slice(0, 2).forEach((s) => L.push('    · ' + scrub(s).slice(0, 130)));
});
L.push('');
L.push('--- JSON (incollalo pure così com\'è) ---');
L.push(JSON.stringify({
  finestraGiorni: days,
  totali: m.totals,
  campioneSufficiente: m.sufficient,
  classifica: m.intents.map((i) => ({
    key: i.key, volte: i.count, minuti: i.minutesSaved, lato: i.side,
    copertaDa: i.covers, esempi: i.samples.slice(0, 2).map((s) => scrub(s).slice(0, 120)),
  })),
  buche: m.gaps.map((g) => ({ key: g.key, volte: g.count })),
  ignote: m.unmatchedSamples.slice(0, 15).map((u) => scrub(u.text).slice(0, 120)),
}, null, 1));

console.log(L.join('\n'));
