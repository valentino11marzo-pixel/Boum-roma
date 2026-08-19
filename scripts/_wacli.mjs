// scripts/_wacli.mjs — leggere un export wacli, una copia sola.
//
// Estratto da wa-domanda-locale.mjs quando è nato il secondo scanner: due
// lettori dello stesso formato divergono al primo cambio di wacli, e uno dei
// due comincia a sbagliare in silenzio. Qui dentro non c'è nessun giudizio:
// solo trovare i messaggi e leggerne i campi, comunque siano scritti.

import fs from 'node:fs';

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
  const m = lowerKeys(x);
  const hasText = ['body', 'text', 'displaytext', 'content', 'message', 'caption', 'snippet'].some(k => m[k] != null);
  const hasWho = ['chatid', 'chatjid', 'chat', 'jid', 'from', 'conversationid', 'key', 'remotejid'].some(k => m[k] != null);
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
/* I nomi dei campi cambiano fra versioni E fra convenzioni: wacli esporta in
 * PascalCase (Text, ChatJID, FromMe), altre build in camelCase, altre ancora
 * annidano alla Baileys. Aggiungerli uno a uno è una rincorsa che si perde:
 * il confronto è INSENSIBILE alle maiuscole, così una sola lista di alias
 * copre tutte e tre le convenzioni. */
const LOWER = new WeakMap();
function lowerKeys(o) {
  let m = LOWER.get(o);
  if (!m) {
    m = {};
    for (const k of Object.keys(o)) m[k.toLowerCase()] = o[k];
    LOWER.set(o, m);
  }
  return m;
}
const field = (o, ...ks) => {
  if (!o || typeof o !== 'object') return '';
  const m = lowerKeys(o);
  for (const k of ks) {
    const v = m[k.toLowerCase()];
    if (v != null && v !== '') return v;
  }
  return '';
};
function bodyOf(m) {
  let b = field(m, 'body', 'text', 'displaytext', 'content', 'caption', 'message', 'snippet');
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
  field(m, 'chatId', 'chatJID', 'chat', 'jid', 'conversationId', 'remoteJid', 'from')
  || field(m.key || {}, 'remoteJid', 'chatId') || '');
const tsOf = (m) => {
  const t = field(m, 'timestamp', 'ts', 'time', 'date', 'createdAt', 'messageTimestamp');
  const n = typeof t === 'string' ? Date.parse(t) : Number(t);
  if (!n || Number.isNaN(n)) return 0;
  return n < 1e12 ? n * 1000 : n;                 // secondi → millisecondi
};


export { readInput, findMessages, findAnyArray, looksLikeMessage, field, lowerKeys, bodyOf, isOut, chatOf, tsOf };

/* ── privacy: gli aggregati si incollano in chat, i recapiti no ──────────
 * Sostituisce invece di tagliare: si deve VEDERE che lì c'era qualcosa. */
export function scrub(s) {
  return String(s || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/(?:\+|00)\d[\d\s().-]{7,}\d/g, '[telefono]')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, '[iban]')
    .replace(/\b\d{9,}\b/g, '[numero]');
}
