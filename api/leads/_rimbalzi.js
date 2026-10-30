// api/leads/_rimbalzi.js — I RIMBALZI: un'email a un cliente che non arriva
// diventa un avviso, invece di un silenzio.
//
// IL CASO VERO (ottobre 2026). Un cliente compra un servizio da una pagina
// città e scrive il proprio indirizzo con un refuso. La conferma d'ordine —
// che porta anche il recesso, cioè il supporto durevole — parte, Gmail la
// rimanda indietro con «Indirizzo non trovato», e il rimbalzo finisce nella
// casella da cui è partita, dove nessuno lo legge in tempo. Il cliente ha
// pagato e non ha niente; noi crediamo di avergli scritto.
//
// Qui il server legge quei rimbalzi (DSN, RFC 3464) dalla casella che SPEDISCE
// — GMAIL_USER, la stessa di Nodemailer: i rimbalzi tornano al mittente, mai
// alla casella degli alert PFS — e per ognuno:
//   1. legge la parte macchina (message/delivery-status) quando c'è: è la
//      fonte che fa fede; X-Failed-Recipients e il testo umano solo se manca;
//   2. distingue il DEFINITIVO (Action: failed) dal RITARDO (Action: delayed):
//      un ritardo non sveglia nessuno, si annota e basta;
//   3. cerca l'indirizzo negli archivi veri (lead, clienti PFS; e, solo da
//      elencare, proposte, visite, contratti, conversazioni, ricerche,
//      proprietari, utenti);
//   4. SEGNA il lead/cliente (emailBounce) con una scrittura condizionata —
//      mai una patch che rifarebbe nascere un lead cancellato — e MAI tocca
//      l'email, lo stato, il voto o la notifica del lead;
//   5. manda UNA card Telegram: chi, cosa, perché, col WhatsApp già scritto
//      per chiedere l'indirizzo giusto. Non corregge niente e non rimanda
//      niente da solo: lo fa l'operatore.
//
// L'idempotenza non dipende dalla memoria: `agentNotifications/bounce-<dsnId>`
// nasce con fsCreate (409 se esiste) e il lead porta il dsnId già segnato.
// Persa la memoria o due run insieme: un avviso, una scrittura.
//
// Gira come modo a parte di api/leads/scan-inbox.js (?mode=bounces): nessuna
// funzione nuova (vercel.json è a 50 regole, il limite), nessuna collection
// nuova, nessuna regola da distribuire.
//
// Log: solo codici e un prefisso di hash. Mai un indirizzo, un nome, un
// oggetto, un telefono o il testo diagnostico del server remoto.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import crypto from 'node:crypto';
import { fsGet, fsPatch, fsCreate, fsList, fsGetVersioned, fsCommit, logActivity } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportHealth } from '../pfs/_health.js';
import { runBudget } from '../_budget.js';
import { tgSend } from '../telegram/_lib.js';
import { replyLang } from '../_lang.js';
import { isReunion, isB2B, b2bSide, isCityMarket, cityMarketOf, cityLabel, cityPhone } from '../_market.js';

const LOOKBACK_DAYS = 3;
const MAX_CANDIDATES = 60;     // le più recenti: oltre, il prossimo giro
const MAX_NEW_PER_RUN = 10;    // download completi per run
const SOURCE_MAX = 262144;     // la parte originale sta in coda: un PDF rimandato non si scarica intero
const MAX_RECIPIENTS = 5;
const COST_STEP = 25_000;      // = socketTimeout imapflow (il conto non è finto)
// Il conto di ciò che segue il download, a pezzi: si chiede `afford` PRIMA di
// ogni pezzo (un destinatario da cercare, un record da segnare, l'avviso),
// mai una volta sola per tutto il rimbalzo — cinque destinatari su un
// Firestore lento costano cinque volte, e la funzione muore a 60s.
const COST_MATCH = 12_000;     // le letture di UN destinatario (10s di tetto + margine)
const COST_FLAG = 8_000;       // segnare UN record: lettura versionata + commit
const FS_OP_MS = 4_000;        // il tetto di UNA scrittura/lettura puntuale
const TG_TIMEOUT_MS = 8_000;
// claim (4) + rilettura e ripresa su 409 (4+4) + Telegram (8) + esito (4)
const COST_NOTIFY = 24_000;
const READ_TIMEOUT_MS = 10_000;
const CLAIM_STALE_MS = 180_000; // una funzione vive 60s: un claim più vecchio è orfano
const QUIET_MS = 24 * 3600 * 1000;
const QUIET_KEEP_MS = 7 * 24 * 3600 * 1000;
const SEEN_KEEP = 500;
const FALLBACK_DAYS = 45;
const FALLBACK_LIMIT = 300;
// Un rimbalzo che non è di nessun record dà UNA riga d'avviso — ma una
// tempesta di backscatter (spam che usa il nostro indirizzo come mittente)
// non deve riempire Telegram: al massimo 5 righe così al giorno (ora di
// Roma), le altre si ricordano in silenzio («unmatched_capped»).
const UNMATCHED_CARDS_PER_DAY = 5;
export const MEM_DOC = 'heartbeat/leads-bounces-memory';
export const HEALTH_SOURCE = 'leads-bounces';

const DAY = 86400000;
const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));
const codeErr = (code) => Object.assign(new Error(code), { code });
// Un'operazione che non risponde entro `ms` diventa un errore normale (col
// suo codice), non un'attesa che porta la funzione oltre i 60s.
const capped = (p, ms, code = 'fs_timeout') => {
  let t;
  return Promise.race([
    Promise.resolve(p),
    new Promise((_, rej) => { t = setTimeout(() => rej(codeErr(code)), Math.max(1, ms)); }),
  ]).finally(() => clearTimeout(t));
};
const log = (code, dsnId) => console.warn('[leads/rimbalzi]', code, dsnId ? String(dsnId).slice(0, 8) : '');

// ── frasi del testo umano ──────────────────────────────────────────────────
// SOFT_RE: le frasi italiane del rimbalzo «in ritardo» di Gmail NON sono
// verificate su un esemplare vero — le inglesi sì, le italiane sono stime.
export const HARD_RE = /indirizzo non trovato|address not found|non (?:è|e') stato recapitato|wasn'?t delivered|message not delivered|messaggio non recapitato|messaggio bloccato|message blocked|undeliverable|undelivered|delivery (?:has )?failed|could not be delivered|permanent(?:ly)? (?:failure|error)|returned mail|non recapitabile|\(failure\)/i;
export const SOFT_RE = /\(delay\)|\bdelay(?:ed)?\b|ritard|temporar|will (?:retry|keep trying)|riprover|still trying|delivery incomplete|consegna (?:non )?(?:completata|incompleta)/i;
const DAEMON_LOCAL = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)$/i;
const DAEMON_NAME = /mail delivery (?:subsystem|system)/i;
const ADDR_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const STATUS_RE = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/;

export function emailKey(v) { return typeof v === 'string' ? v.trim().toLowerCase() : ''; }

/** L'indirizzo di un campo DSN («rfc822; <a@b.c>») o null. */
export function normAddr(v) {
  const s = String(v == null ? '' : v)
    .replace(/^\s*[\w.-]+\s*;\s*/, '')   // il tipo d'indirizzo: rfc822; utf-8;
    .trim().replace(/^<+|>+$/g, '').trim();
  return ADDR_RE.test(s) ? s : null;
}

/** RFC 3461 xtext (solo Original-Recipient): «a+2Bb@x» → «a+b@x». */
export function xtextDecode(s) {
  return String(s || '').replace(/\+([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Le righe «Campo: valore» di una parte delivery-status, a gruppi separati
 * da una riga vuota. Nome in minuscolo → PRIMO valore; le righe che
 * iniziano con spazio o tab continuano il campo precedente (folding).
 */
export function parseFieldGroups(s) {
  const lines = String(s || '').replace(/\r\n?/g, '\n').split('\n');
  const groups = [];
  let cur = null, last = null;
  for (const line of lines) {
    if (!line.trim()) { if (cur && cur.size) groups.push(cur); cur = null; last = null; continue; }
    if (/^[ \t]/.test(line)) { if (cur && last) cur.set(last, cur.get(last) + ' ' + line.trim()); continue; }
    const m = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!m) { last = null; continue; }
    if (!cur) cur = new Map();
    const k = m[1].toLowerCase();
    if (cur.has(k)) { last = null; continue; }
    cur.set(k, m[2].trim());
    last = k;
  }
  if (cur && cur.size) groups.push(cur);
  return groups;
}

const stripType = (v) => String(v || '').replace(/^\s*[\w.-]+\s*;\s*/, '').replace(/\s+/g, ' ').trim();
const actionOf = (raw, status) => {
  const a = String(raw || '').trim().toLowerCase().split(/[\s(;]/)[0];
  if (a) return a;
  if (status && status[0] === '5') return 'failed';
  if (status && status[0] === '4') return 'delayed';
  return null;
};

function keysOf(...forms) {
  const out = [];
  for (const f of forms) {
    if (!f) continue;
    for (const v of [f, f.trim(), f.trim().toLowerCase()]) if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Una parte machine → { perMessage, recipients[] , groups:n }. */
function machineRecipients(text) {
  const groups = parseFieldGroups(text);
  const perMessage = groups.find((g) => g.has('reporting-mta')) || null;
  const recGroups = groups.filter((g) => g.has('final-recipient') || (g.has('original-recipient') && g.has('action')));
  const recipients = [];
  for (const g of recGroups) {
    const finalRecipient = g.has('final-recipient') ? normAddr(g.get('final-recipient')) : null;
    const origRaw = g.has('original-recipient') ? normAddr(g.get('original-recipient')) : null;
    const origDecoded = origRaw ? (normAddr(xtextDecode(origRaw)) || origRaw) : null;
    const address = origDecoded || finalRecipient;
    if (!address) continue;
    const st = STATUS_RE.exec(g.get('status') || '');
    const status = st ? `${st[1]}.${st[2]}.${st[3]}` : null;
    const action = actionOf(g.get('action'), status);
    if (!action) continue;
    recipients.push({
      address, finalRecipient, originalRecipient: origDecoded,
      keys: keysOf(address, finalRecipient, origRaw, origDecoded),
      action, status,
      diagnostic: g.has('diagnostic-code') ? clip(stripType(g.get('diagnostic-code')), 300) : null,
      remoteMta: g.has('remote-mta') ? clip(stripType(g.get('remote-mta')), 200) : null,
      willRetryUntil: g.has('will-retry-until') ? clip(g.get('will-retry-until'), 100) : null,
      source: 'dsn',
    });
  }
  return {
    groups: recGroups.length,
    perMessage: perMessage ? { reportingMta: clip(stripType(perMessage.get('reporting-mta')), 200), arrivalDate: clip(perMessage.get('arrival-date') || null, 100) } : null,
    recipients,
  };
}

const addrOfFrom = (parsed) => {
  const v = parsed && parsed.from && Array.isArray(parsed.from.value) ? parsed.from.value[0] : null;
  return { address: v && v.address ? String(v.address) : '', name: v && v.name ? String(v.name) : '' };
};

/** Le caselle «nostre»: un rimbalzo che parla solo di noi non è di un cliente. */
export function ownAddresses(env = process.env) {
  return [env.GMAIL_USER, env.PFS_IMAP_USER].map(emailKey).filter(Boolean);
}
export function isOwnAddress(addr, own = []) {
  const k = emailKey(addr);
  if (!k) return false;
  if (own.map(emailKey).includes(k)) return true;
  return /@(?:boom-rome\.com|boomrome\.com)$/.test(k);
}

// ── il testo umano: SOLO gli indirizzi scritti come destinatari ────────────
// Un rimbalzo senza parte macchina (qmail, un MTA che accetta e poi rimanda)
// porta spesso in coda la COPIA del messaggio originale: Reply-To, corpo,
// firme. Un indirizzo lì dentro non è un destinatario fallito — è magari un
// cliente nominato nell'email, a cui la card direbbe «il tuo indirizzo non
// esiste». Quindi: (1) il testo si taglia dove comincia la copia; (2) valgono
// solo le forme da destinatario; (3) senza forme, solo un indirizzo che sia
// anche nel To dell'originale allegato; (4) altrimenti è ambiguo: illeggibile.
const QUOTE_START = [
  /^[ \t]*-{2,}[ \t]*(?:below this line|original message|messaggio originale|mensaje original|message d'origine|forwarded message|messaggio inoltrato|this is a copy)/im,
  /^[ \t]*-{2,}.*(?:copy of (?:the|your) message|original message|messaggio originale|headers? of (?:the|your) message)/im,
  /^(?:Return-Path|Received|Reply-To|Message-ID|DKIM-Signature|ARC-[\w-]+|MIME-Version|X-[\w-]+)[ \t]*:/im,
  /^(?:From|To|Cc|Subject|Date)[ \t]*:[^\n]*\n(?:From|To|Cc|Subject|Date|Reply-To|Message-ID)[ \t]*:/im,
];
export function humanHead(text) {
  const head = String(text || '').replace(/\r\n?/g, '\n').slice(0, 3000);
  let cut = head.length;
  for (const re of QUOTE_START) { const m = re.exec(head); if (m && m.index < cut) cut = m.index; }
  return head.slice(0, cut);
}
const A = '([^\\s<>"\'(),;:]+@[^\\s<>"\'(),;:]+\\.[^\\s<>"\'(),;:]+)';
const RCPT_FORMS = [
  new RegExp('recapitato a\\s+<?' + A, 'gi'),                          // Gmail IT: «non è stato recapitato a x»
  new RegExp('delivered to\\s+<?' + A, 'gi'),                          // Gmail EN: «wasn't delivered to x»
  new RegExp('message to\\s+<?' + A + '>?\\s+(?:could ?n.?t|couldn.?t|was ?n.?t|cannot|can.?t|could not)', 'gi'), // Exchange
  new RegExp('rcpt to:\\s*<' + A + '>', 'gi'),                          // «SMTP error … after RCPT TO:<x>»
  new RegExp('^[ \\t]*<' + A + '>[ \\t]*:', 'gim'),                     // qmail/Postfix: «<x>:» in testa alla riga
  new RegExp('^[ \\t]{2,}' + A + '[ \\t]*$', 'gim'),                    // Gmail vecchio / Exim: l'indirizzo da solo, rientrato
];
const ANY_ADDR = new RegExp(A, 'g');
function humanRecipients(head, originalTo = []) {
  const found = [];
  // il postmaster del server remoto nominato nel testo non è un destinatario
  const take = (raw) => { const a = normAddr(String(raw).replace(/[>.,;:)]+$/, '')); if (a && !DAEMON_LOCAL.test(a.split('@')[0]) && !found.includes(a)) found.push(a); };
  for (const re of RCPT_FORMS) { re.lastIndex = 0; for (const m of head.matchAll(re)) take(m[1]); }
  if (found.length) return found;
  const to = new Set((originalTo || []).map(emailKey).filter(Boolean));
  if (!to.size) return [];
  for (const m of head.matchAll(ANY_ADDR)) { const a = normAddr(m[1].replace(/[.]+$/, '')); if (a && to.has(emailKey(a)) && !found.includes(a)) found.push(a); }
  return found;
}

const ORIGINAL_TYPES = /^(message\/rfc822|text\/rfc822-headers|message\/global|message\/global-headers)$/i;
const MACHINE_TYPES = /^message\/(global-)?delivery-status$/i;

async function readOriginal(parsed) {
  const att = (parsed.attachments || []).find((a) => ORIGINAL_TYPES.test(String(a.contentType || '')));
  if (!att || !att.content) return null;
  try {
    let buf = Buffer.isBuffer(att.content) ? att.content : Buffer.from(String(att.content));
    if (!/\r?\n\r?\n/.test(buf.toString('latin1'))) buf = Buffer.concat([buf, Buffer.from('\r\n\r\n')]);
    const o = await simpleParser(buf, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
    const to = ((o.to && (Array.isArray(o.to) ? o.to : [o.to])) || [])
      .flatMap((x) => (x && x.value) || []).map((x) => x && x.address).filter(Boolean).slice(0, 5);
    return {
      subject: clip(o.subject || null, 200),
      messageId: clip(o.messageId || null, 200),
      date: o.date instanceof Date && Number.isFinite(o.date.getTime()) ? o.date.toISOString() : null,
      to,
    };
  } catch { return null; }
}

/**
 * Il rimbalzo letto. Pura (nessuna rete): async solo perché l'originale
 * allegato si legge con lo stesso mailparser.
 * @returns {Promise<{isDsn:boolean, reason?:string, recipients:Array, reportType, daemon, original, inReplyTo, references, reportingMta, arrivalDate, at}>}
 */
export async function parseDsn(parsed, { own = ownAddresses() } = {}) {
  const ct = parsed && parsed.headers && typeof parsed.headers.get === 'function' ? parsed.headers.get('content-type') : null;
  const ctValue = String((ct && ct.value) || '').toLowerCase();
  const reportType = String((ct && ct.params && ct.params['report-type']) || '').toLowerCase();
  const base = { isDsn: false, recipients: [], reportType: reportType || null };
  if (/^(disposition-notification|feedback-report|tlsrpt)$/.test(reportType)) return { ...base, reason: 'not_dsn' };
  const from = addrOfFrom(parsed);
  if (from.address && isOwnAddress(from.address, own)) return { ...base, reason: 'own_sender' };
  const local = from.address.split('@')[0] || '';
  const daemon = DAEMON_LOCAL.test(local) || DAEMON_NAME.test(from.name);
  const isReport = ctValue === 'multipart/report' && reportType === 'delivery-status';

  // 1. la parte macchina: allegati, poi il testo (mailparser la mette in
  //    parsed.text quando arriva senza Content-Disposition)
  let machine = { groups: 0, perMessage: null, recipients: [] };
  const machineTexts = (parsed.attachments || [])
    .filter((a) => MACHINE_TYPES.test(String(a.contentType || '')))
    .map((a) => (Buffer.isBuffer(a.content) ? a.content.toString('utf8') : String(a.content || '')));
  for (const t of machineTexts) {
    const m = machineRecipients(t);
    machine = { groups: machine.groups + m.groups, perMessage: machine.perMessage || m.perMessage, recipients: machine.recipients.concat(m.recipients) };
  }
  if (!machine.groups) {
    const m = machineRecipients(parsed.text || '');
    if (m.groups) machine = m;
  }

  const subject = String(parsed.subject || '');
  const text = String(parsed.text || '');
  // il testo umano SENZA la copia del messaggio originale (vedi humanHead)
  const head = humanHead(text);
  const original = await readOriginal(parsed);
  let recipients = machine.recipients;
  let usedFallback = false;
  const xfRaw = parsed.headers && typeof parsed.headers.get === 'function' ? parsed.headers.get('x-failed-recipients') : null;
  const xFailed = [].concat(xfRaw || []).map((v) => (typeof v === 'string' ? v : (v && v.text) || ''))
    .join(',').split(/[,\s]+/).map(normAddr).filter(Boolean);
  // il testo umano può dire QUALE rimbalzo è, anche senza codice di stato
  const hint = /indirizzo non trovato|address not found|inesistente|does(?:n'?t| not) exist/i.test(subject + '\n' + head) ? 'address_not_found' : null;
  if (!machine.groups) {
    // 2. X-Failed-Recipients: l'intestazione dei fallimenti (Exim, Gmail)
    if (xFailed.length) {
      const st = STATUS_RE.exec(subject + '\n' + head);
      const status = st && st[1] === '5' ? `${st[1]}.${st[2]}.${st[3]}` : null;
      recipients = xFailed.map((address) => ({ address, finalRecipient: address, originalRecipient: null, keys: keysOf(address),
        action: 'failed', status, diagnostic: null, remoteMta: null, willRetryUntil: null, source: 'x-failed-recipients', hint }));
      usedFallback = true;
    } else if (daemon && HARD_RE.test(subject + '\n' + text)) {
      // 3. il solo testo umano, e solo da un demone di posta: gli indirizzi
      //    SCRITTI COME DESTINATARI, mai quelli della copia citata
      const found = humanRecipients(head, original ? original.to : []);
      const soft = SOFT_RE.test(subject) || (SOFT_RE.test(head) && !HARD_RE.test(subject));
      const st = STATUS_RE.exec(subject + '\n' + head);
      const status = st ? `${st[1]}.${st[2]}.${st[3]}` : null;
      recipients = found.map((address) => ({ address, finalRecipient: address, originalRecipient: null, keys: keysOf(address),
        action: soft ? 'delayed' : 'failed', status, diagnostic: null, remoteMta: null, willRetryUntil: null, source: 'human', hint }));
      usedFallback = true;
    }
  }
  // consegnato, inoltrato, espanso: non è un rimbalzo
  const kept = recipients.filter((r) => !['delivered', 'relayed', 'expanded'].includes(r.action));
  const noFailure = recipients.length > 0 && kept.length === 0;
  const notOwn = kept.filter((r) => !isOwnAddress(r.address, own) && !isOwnAddress(r.finalRecipient, own)).slice(0, MAX_RECIPIENTS);
  // un demone che dice «non recapitato» ma da cui non si legge nessun
  // indirizzo è un rimbalzo ILLEGGIBILE, non un'email qualunque: si conta
  const daemonHard = daemon && HARD_RE.test(subject + '\n' + text);
  const isDsn = isReport || ((daemon || xFailed.length > 0) && recipients.length > 0) || (daemonHard && !recipients.length);
  const out = {
    ...base, isDsn, daemon, recipients: notOwn, original, usedFallback,
    inReplyTo: clip(parsed.inReplyTo || null, 200),
    references: clip([].concat(parsed.references || []).join(' ') || null, 600),
    reportingMta: machine.perMessage ? machine.perMessage.reportingMta : null,
    arrivalDate: machine.perMessage ? machine.perMessage.arrivalDate : null,
    at: parsed.date instanceof Date && Number.isFinite(parsed.date.getTime()) ? parsed.date.toISOString() : null,
  };
  if (!isDsn) return { ...out, isDsn: false, recipients: [], reason: 'not_dsn' };
  if (noFailure) return { ...out, recipients: [], reason: 'no_failure' };
  if (!recipients.length) return { ...out, recipients: [], reason: 'unparsed' };
  if (!notOwn.length) return { ...out, recipients: [], reason: 'own_only' };
  return out;
}

// ── definitivo o ritardo, e che tipo ──────────────────────────────────────
const BAD_ADDR = new Set(['5.1.1', '5.1.0', '5.1.3', '5.1.6', '5.1.10', '5.2.1', '5.4.1']);
const BAD_DOMAIN = new Set(['5.1.2', '5.4.4']);
const FULL = new Set(['5.2.2', '4.2.2']);
const DIAG_BAD = /does not exist|no such user|user unknown|unknown user|invalid recipient|recipient not found|address rejected|mailbox unavailable/i;
// Una lista nera parla del MITTENTE (il nostro IP), mai dell'indirizzo del
// cliente: viene prima di tutto, anche di «address rejected» (Postfix scrive
// «Recipient address rejected: … blocked using <dnsbl>»). «DNS» da solo non
// dice «dominio inesistente»: un «DNSBL» lo direbbe al posto di un rifiuto.
const DIAG_BLOCKLIST = /dnsbl|dns ?blocklist|block ?list|black ?list|\brbl\b|spamhaus|spamcop|listed (?:on|in|at|by)\b/i;
const DIAG_DOMAIN = /domain (?:name )?not found|nxdomain|host not found|no mx\b|no such domain|unrouteable (?:mail )?domain/i;
const DIAG_FULL = /quota|mailbox (?:is )?full|casella piena/i;
const DIAG_REJECT = /spam|block|blacklist|dnsbl|\brbl\b|policy|dmarc|spf|unauthenticated/i;

/** { kind, subtype|null, hard } — kind ∈ bad_address · mailbox_full · rejected · gave_up · other · delayed */
export function bounceKind(rec) {
  const action = String((rec && rec.action) || '').toLowerCase();
  if (action === 'delayed') return { kind: 'delayed', subtype: null, hard: false };
  if (action !== 'failed') return { kind: 'other', subtype: null, hard: false };
  const st = String(rec.status || '');
  const d = String(rec.diagnostic || '');
  if (BAD_ADDR.has(st)) return { kind: 'bad_address', subtype: null, hard: true };
  if (BAD_DOMAIN.has(st)) return { kind: 'bad_address', subtype: 'domain', hard: true };
  if (FULL.has(st)) return { kind: 'mailbox_full', subtype: null, hard: true };
  if (/^5\.7\./.test(st)) return { kind: 'rejected', subtype: null, hard: true };
  if (/^4\./.test(st)) return { kind: 'gave_up', subtype: null, hard: true };
  if (rec.hint === 'address_not_found') return { kind: 'bad_address', subtype: null, hard: true };
  if (DIAG_BLOCKLIST.test(d)) return { kind: 'rejected', subtype: null, hard: true };
  if (DIAG_BAD.test(d)) return { kind: 'bad_address', subtype: null, hard: true };
  if (DIAG_FULL.test(d)) return { kind: 'mailbox_full', subtype: null, hard: true };
  if (DIAG_REJECT.test(d)) return { kind: 'rejected', subtype: null, hard: true };
  if (DIAG_DOMAIN.test(d)) return { kind: 'bad_address', subtype: 'domain', hard: true };
  return { kind: 'other', subtype: null, hard: true };
}
/** Il rimbalzo con la sua classe: { ...rec, kind, subtype, hard }. */
export function classify(rec) { return { ...rec, ...bounceKind(rec) }; }

const TITLE = { bad_address: 'indirizzo inesistente', domain: 'dominio inesistente', mailbox_full: 'casella piena', rejected: 'rifiutata dal server', other: 'non recapitata' };
const WORDS = { bad_address: "l'indirizzo non esiste", domain: 'il dominio non esiste', mailbox_full: 'casella piena', rejected: 'rifiutata dal server del destinatario', other: 'non recapitata' };
const isGoogle = (mta) => /google|gmail/i.test(String(mta || ''));
const titleOf = (r, mta) => r.kind === 'gave_up' ? (isGoogle(mta) ? 'Gmail ha smesso di riprovare' : 'il server ha smesso di riprovare')
  : r.subtype === 'domain' ? TITLE.domain : (TITLE[r.kind] || TITLE.other);
const wordsOf = (r, mta) => r.kind === 'gave_up' ? (isGoogle(mta) ? 'Gmail ha smesso di riprovare' : 'il server di invio ha smesso di riprovare')
  : r.subtype === 'domain' ? WORDS.domain : (WORDS[r.kind] || WORDS.other);

// ── chi è, dagli archivi ──────────────────────────────────────────────────
const getPath = (o, path) => String(path).split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
const tsOf = (v) => { if (!v) return 0; if (v instanceof Date) return v.getTime(); const t = Date.parse(v); return Number.isFinite(t) ? t : 0; };
// Un cliente PFS non è pagante perché esiste: savePFSClient del portal lo crea
// in fase 'lead' o 'qualified' (in attesa di pagamento). Pagato = una PROVA:
// lo stato 'paid' del webhook, un importo, la data del pagamento, o una fase
// che nel funnel viene DOPO il pagamento (PFS_STAGES: onboarded = «Payment
// received»). Senza prova la card dice la fase, mai «PAGATO».
const PFS_PAID_STAGES = new Set(['payment_confirmed', 'onboarded', 'searching', 'options', 'sent', 'viewing', 'negotiating', 'closing', 'placed']);
export function pfsPaidProof(d) {
  if (!d || typeof d !== 'object') return null;
  if (String(d.status || '').toLowerCase() === 'paid') return 'status';
  if (Number(d.amount_paid) > 0) return 'amount';
  if (d.paid_at) return 'paid_at';
  if (PFS_PAID_STAGES.has(String(d.stage || '').toLowerCase())) return 'stage';
  return null;
}
const isPaid = (p) => (p.coll === 'pfsClients'
  ? !!pfsPaidProof(p.doc)
  : (p.doc && p.doc.paid === true) || /^(svc_|res_)/.test(String(p.id || '')));
const isDead = (p) => p.coll === 'leads' && p.doc && (p.doc.grade === 'dead' || p.doc.status === 'archived');
// Un rimbalzo è «orfano» solo se l'indirizzo non è di NESSUN record letto:
// né un lead/cliente (people) né un contratto, una proposta, un profilo
// (also). Un inquilino che esiste solo nel contratto — l'invito Magic Sign,
// il benvenuto — non è backscatter e non consuma il tetto degli orfani.
const isOrphan = (it) => !it.people.length && !it.also.length;
// Chi è sotto contratto con BOOM (contratto, proposta, proprietario, profilo
// di inquilino o proprietario): il rimbalzo è urgente come quello di un
// pagante — l'email era quasi certamente un atto (firma, benvenuto, rendiconto).
const URGENT_ALSO = new Set(['contracts', 'preAgreements', 'landlords']);
const URGENT_ROLES = new Set(['landlord', 'owner', 'tenant']);
const isBound = (a) => URGENT_ALSO.has(a.coll) || (a.coll === 'users' && URGENT_ROLES.has(String((a.doc && a.doc.role) || '').toLowerCase()));

export const WRITE_FIELDS = [['leads', 'email'], ['pfsClients', 'email']];
// NON cercati, e la card lo dice: i co-conduttori (contracts.coTenants[].email
// vive dentro una lista di mappe, che Firestore non sa filtrare per EQUAL).
export const LIST_FIELDS = [
  ['preAgreements', 'tenant.email'], ['preAgreements', 'landlord.email'],
  ['viewingRequests', 'email'], ['viewingRequests', 'clientEmail'],
  ['contracts', 'tenantEmail'], ['contracts', 'landlordEmail'],
  ['conversations', 'contactEmail'], ['savedSearches', 'email'],
  ['landlords', 'email'], ['users', 'email'],
];
export const NOT_SEARCHED = 'i co-conduttori dei contratti non si cercano per email';

/** Nome, telefono e lato di chi possiede l'indirizzo in un record «also». */
export function alsoParty(a) {
  const d = (a && a.doc) || {};
  const get = (path) => getPath(d, path);
  switch (a && a.coll) {
    case 'contracts':
      return a.field === 'landlordEmail'
        ? { name: d.landlordName || null, phone: d.landlordPhone || null, side: 'landlord' }
        : { name: d.tenantName || null, phone: d.tenantPhone || null, side: 'tenant' };
    case 'preAgreements': {
      const k = a.field === 'landlord.email' ? 'landlord' : 'tenant';
      return { name: get(k + '.name') || null, phone: get(k + '.phone') || null, side: k };
    }
    case 'viewingRequests': return { name: d.name || d.clientName || null, phone: d.phone || d.clientPhone || null, side: 'tenant' };
    case 'conversations': return { name: d.contactName || d.name || null, phone: d.contactPhone || d.phone || null, side: null };
    case 'landlords': return { name: d.name || d.fullName || null, phone: d.phone || null, side: 'landlord' };
    case 'users': {
      const role = String(d.role || '').toLowerCase();
      return { name: d.name || d.displayName || d.fullName || null, phone: d.phone || null,
        side: role === 'landlord' || role === 'owner' ? 'landlord' : role === 'tenant' ? 'tenant' : null };
    }
    default: return { name: d.name || null, phone: d.phone || null, side: null };
  }
}
/** Il record a cui il WhatsApp parla: un lead vero, o la parte di un contratto. */
function pseudoLead(a) {
  const p = alsoParty(a);
  // il proprietario col Lei (voce owner di _market.js), l'inquilino nella
  // lingua di casa BOOM (replyLang senza parole → inglese)
  return p.side === 'landlord'
    ? { name: p.name, phone: p.phone, leadType: 'landlord', source: 'web' }
    : { name: p.name, phone: p.phone };
}

/**
 * Il numero WhatsApp di un lead — la STESSA regola della card di
 * api/telegram/notify-pending.js (copia: notify-pending è legato dai test
 * delle città alla sua forma; tests/rimbalzi pretende la parità guidando il
 * handler vero). Un lead di città si legge col paese del desk (cityPhone),
 * Roma con l'ipotesi italiana ('39' + 10 cifre che iniziano per 3).
 */
export function leadWaNumber(lead = {}) {
  const l = lead || {};
  const cityTel = isCityMarket(l) ? cityPhone(l.phone, cityMarketOf(l)) : null;
  const digits = String(cityTel || l.phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (cityTel || String(l.phone || '').trim().startsWith('+')) return digits;
  return digits.length === 10 && digits.startsWith('3') ? '39' + digits : digits;
}

function makeMatcher({ list = fsList, now = Date.now() } = {}) {
  let recent = null;
  const signal = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(READ_TIMEOUT_MS) : undefined);
  const recentLeads = () => {
    if (!recent) {
      const since = new Date(now - FALLBACK_DAYS * DAY);
      const q = (value) => list('leads', { filter: { field: 'createdAt', op: 'GREATER_THAN_OR_EQUAL', value }, orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: FALLBACK_LIMIT, signal: signal() });
      recent = Promise.all([q(since), q(since.toISOString())]).then(([a, b]) => [...(a || []), ...(b || [])]);
    }
    return recent;
  };
  return async function matchAddress(keys) {
    const lower = new Set(keys.map(emailKey).filter(Boolean));
    const plan = [];
    for (const [coll, field] of [...WRITE_FIELDS, ...LIST_FIELDS]) {
      for (const k of keys) plan.push({ coll, field, write: WRITE_FIELDS.some(([c, f]) => c === coll && f === field), k });
    }
    const settled = await Promise.allSettled(plan.map((p) => list(p.coll, { filter: { field: p.field, op: 'EQUAL', value: p.k }, limit: 10, signal: signal() })));
    const people = new Map(), also = new Map();
    let coreFailed = false;
    const partial = new Set();
    settled.forEach((r, i) => {
      const p = plan[i];
      if (r.status !== 'fulfilled') { if (p.write) coreFailed = true; else partial.add(p.coll); return; }
      for (const doc of r.value || []) {
        if (!doc || !doc.id || !lower.has(emailKey(getPath(doc, p.field)))) continue;
        const key = p.coll + '/' + doc.id;
        const bucket = p.write ? people : also;
        if (!bucket.has(key)) bucket.set(key, { coll: p.coll, id: doc.id, doc, field: p.field });
      }
    });
    if (!coreFailed && people.size === 0) {
      try {
        for (const doc of await recentLeads()) {
          if (!doc || !doc.id || !lower.has(emailKey(doc.email))) continue;
          const key = 'leads/' + doc.id;
          if (!people.has(key)) people.set(key, { coll: 'leads', id: doc.id, doc, field: 'email', viaFallback: true });
        }
      } catch { coreFailed = true; }
    }
    const order = [...people.values()].sort((a, b) => (isPaid(b) - isPaid(a))
      || (tsOf(b.doc.createdAt || b.doc.created_at || b.doc.paid_at) - tsOf(a.doc.createdAt || a.doc.created_at || a.doc.paid_at)));
    return { people: order, also: [...also.values()], coreFailed, partial: [...partial] };
  };
}

// ── la card ───────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function romeDay(t = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t); }
  catch { return t.toISOString().slice(0, 10); }
}
export function romeShort(v) {
  const t = v instanceof Date ? v : new Date(v || NaN);
  if (!Number.isFinite(t.getTime())) return null;
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(t).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
  } catch { return null; }
}
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const euro = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? String(Math.round(Number(n))) : null);

function personLines(p) {
  const d = p.doc || {};
  const name = d.name || d.clientName || d.fullName || 'senza nome';
  let where, state;
  if (p.coll === 'pfsClients') {
    where = 'Property Finding';
    const proof = pfsPaidProof(d);
    const eur = Number.isFinite(Number(d.amount_paid)) && Number(d.amount_paid) > 0 ? euro(Number(d.amount_paid) / 100) : null;
    const stage = d.stage ? String(d.stage) : null;
    state = proof
      ? '💶 PAGATO Property Finding' + (eur ? ' €' + eur : '') + (proof === 'stage' ? ` (dalla fase «${stage}»)` : '')
      : `fase «${stage || 'non indicata'}» · nessun pagamento registrato`;
  } else {
    where = cityLabel(d) || (isReunion(d) ? '🇷🇪 La Réunion' : (d.source || 'lead'));
    if (isPaid(p)) {
      const plan = (d.city && d.city.serviceLabel) || d.kind || '';
      const eur = euro(d.amount_eur);
      state = '💶 PAGATO' + (plan ? ' ' + plan : '') + (eur ? ' €' + eur : '');
    } else state = d.grade === 'dead' ? 'morto' : (d.status || 'nuovo');
  }
  const sent = d.clientEmailSentAt ? romeShort(d.clientEmailSentAt) : null;
  return [
    `👤 <b>${esc(name)}</b> · ${esc(where)} · ${esc(state)}`,
    `   📞 ${d.phone ? esc(d.phone) : 'nessun telefono'} · <code>${esc(p.coll + '/' + p.id)}</code>${sent ? ' · conferma inviata ' + esc(sent) : ''}`,
  ];
}

function alsoLabel(a) {
  const d = a.doc || {};
  switch (a.coll) {
    case 'preAgreements': return `proposta ${d.ref || a.id} (${a.field === 'landlord.email' ? 'proprietario' : 'inquilino'})`;
    case 'viewingRequests': { const w = romeShort(d.confirmedDateTime || d.proposedDateTime || d.when); return 'visita' + (w ? ' ' + w.split(' ')[0] : ''); }
    case 'contracts': return `contratto (${a.field === 'landlordEmail' ? 'proprietario' : 'inquilino'})`;
    case 'conversations': return 'conversazione';
    case 'savedSearches': return 'ricerca salvata';
    case 'landlords': return 'scheda proprietario';
    case 'users': return 'profilo utente' + (d.role ? ' (' + d.role + ')' : '');
    default: return a.coll;
  }
}

function alsoLines(a) {
  const p = alsoParty(a);
  return [
    `📇 <b>${esc(p.name || 'senza nome')}</b> · ${esc(alsoLabel(a))}`,
    `   📞 ${p.phone ? esc(p.phone) : 'nessun telefono'} · <code>${esc(a.coll + '/' + a.id)}</code>`,
  ];
}

const TODO_RECORD_BAD = "Chiedi l'indirizzo giusto su WhatsApp o al telefono, correggilo dove è salvato (contratto, proposta o profilo) e rimanda l'email (in Gmail il rimbalzo è nella stessa conversazione dell'originale → Inoltra).";
const TODO = {
  bad_address: "Chiedi l'indirizzo giusto su WhatsApp o al telefono, correggilo sul lead e rimanda l'email (in Gmail il rimbalzo è nella stessa conversazione dell'originale → Inoltra).",
  mailbox_full: "Casella piena: l'indirizzo è probabilmente giusto. Avvisa su WhatsApp e rimanda più tardi, o chiedi un altro indirizzo.",
  rejected: "Il server del destinatario l'ha rifiutata (filtro/politica): l'indirizzo può essere giusto. Chiedi su WhatsApp un indirizzo alternativo.",
  other: "Non recapitata dopo i tentativi del server: verifica l'indirizzo su WhatsApp.",
};

/**
 * Il testo HTML della card Telegram. Solo fatti del rimbalzo e dei record:
 * non dice MAI quale flusso ha rimbalzato (le righe che lo nominano sono
 * condizionali: «se era…»).
 * @param {{ items: Array<{rec, people, also}>, original, reportingMta, partial }} a
 */
export function cardText(a) {
  const items = a.items || [];
  const first = items[0] ? items[0].rec : { kind: 'other' };
  const out = [`📭 <b>Email non recapitata — ${esc(titleOf(first, a.reportingMta))}</b>`];
  const o = a.original;
  items.forEach((it, i) => {
    const r = it.rec;
    if (i > 0) out.push('');
    out.push(`✉️ <code>${esc(r.address)}</code>`);
    out.push(`⚙️ ${esc(r.status || 's/codice')} · ${esc(wordsOf(r, a.reportingMta))}${r.source === 'human' ? ' <i>(letto dal testo del rimbalzo)</i>' : r.source === 'x-failed-recipients' ? ' <i>(dall\'intestazione X-Failed-Recipients)</i>' : ''}`);
    if (i === 0 && o && (o.subject || o.date)) {
      const when = o.date ? romeShort(o.date) : null;
      out.push(`📨 ${o.subject ? '«' + esc(o.subject) + '»' : 'email originale'}${when ? ' · inviata ' + esc(when) : ''}`);
    }
    out.push('');
    if (it.people.length) {
      for (const p of it.people.slice(0, 3)) out.push(...personLines(p));
      if (it.people.length > 3) out.push(`+${it.people.length - 3} altri`);
      if (it.also.length) {
        const labels = [...new Set(it.also.map(alsoLabel))];
        out.push('Anche in: ' + esc(labels.slice(0, 6).join(' · ')) + (labels.length > 6 ? ` · +${labels.length - 6}` : ''));
      }
    } else if (it.also.length) {
      // nessun lead o cliente PFS, ma l'indirizzo È di qualcuno: lo si dice
      out.push('Nessun lead o cliente PFS con questo indirizzo, ma è in:');
      for (const x of it.also.slice(0, 3)) out.push(...alsoLines(x));
      if (it.also.length > 3) out.push(`+${it.also.length - 3} altri`);
    } else out.push(`🔎 Nessun lead o cliente BOOM con questo indirizzo negli archivi letti (${NOT_SEARCHED}).`);
  });
  if (a.partial && a.partial.length) out.push(`⚠️ Non letti (errore): ${esc(a.partial.join(', '))} — l'elenco qui sopra può essere incompleto.`);
  out.push('');
  const matched = items.find((it) => it.people.length);
  const listed = matched ? null : items.find((it) => it.also.length);
  if (matched) {
    const r = matched.rec;
    let todo = '👉 ' + (TODO[r.kind] || TODO.other);
    const p = matched.people[0];
    if (p.coll === 'leads' && /^svc_/.test(p.id) && isCityMarket(p.doc) && p.doc.clientEmailSentAt) {
      todo += " Se è la conferma dell'ordine, contiene il recesso: va rimandata (supporto durevole).";
    }
    const pfs = matched.people.find((x) => x.coll === 'pfsClients' && x.doc && x.doc.portalAccessCode);
    if (pfs) todo += ` Se era la conferma PFS, conteneva il codice portale <code>${esc(pfs.doc.portalAccessCode)}</code>: mandalo su WhatsApp.`;
    out.push(todo);
  } else if (listed) {
    const r = listed.rec;
    let todo = '👉 ' + (r.kind === 'bad_address' ? TODO_RECORD_BAD : (TODO[r.kind] || TODO.other));
    if (listed.also.some((x) => x.coll === 'contracts')) {
      todo += " Se era l'invito alla firma o il benvenuto, il link è personale: rimandalo dal portale dopo aver corretto l'indirizzo.";
    }
    out.push(todo);
  } else {
    out.push("👉 Se l'email l'hai scritta tu, il rimbalzo è nella stessa conversazione in Gmail; se era automatica, cerca l'indirizzo nel portale.");
  }
  return out.join('\n');
}

/**
 * Il messaggio WhatsApp per chiedere l'indirizzo giusto. Mai un prezzo, mai
 * il testo diagnostico del server. La voce segue il mercato del lead.
 */
export function waTextFor(lead = {}, address = '', kind = 'bad_address', subject = null) {
  const first = firstName(lead.name || lead.clientName);
  const subj = subject ? String(subject).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const bad = kind === 'bad_address';
  if (isReunion(lead)) {
    return `Bonjour${first ? ' ' + first : ''}, ici l'équipe BOOM. L'email que nous vous avons envoyée${subj ? ' (« ' + subj + ' »)' : ''} nous est revenue : ` +
      (bad ? `l'adresse ${address} semble ne pas exister.` : `elle n'a pas pu être remise à ${address}.`) +
      ' Pouvez-vous nous envoyer la bonne adresse email ? Nous vous la renverrons tout de suite.';
  }
  if (isB2B(lead) && b2bSide(lead) === 'owner') {
    return `Buongiorno${first ? ' ' + first : ''}, sono Valentino di BOOM — Egidi Immobiliare. L'email che Le ho inviato${subj ? ' («' + subj + '»)' : ''} è tornata indietro: ` +
      (bad ? `l'indirizzo ${address} risulta inesistente.` : `non è stato possibile consegnarla a ${address}.`) +
      ' Può scrivermi un indirizzo corretto? Gliela rimando subito.';
  }
  const en = isCityMarket(lead) || replyLang(lead) !== 'it';
  if (en) {
    return `Hi${first ? ' ' + first : ''}, Valentino from BOOM here. The email I sent you${subj ? ' ("' + subj + '")' : ''} came back: ` +
      (bad ? `the address ${address} doesn't seem to exist.` : `it couldn't be delivered to ${address}.`) +
      ' Could you send me the right email address? I\'ll resend it straight away.';
  }
  return `Ciao${first ? ' ' + first : ''}, sono Valentino di BOOM. L'email che ti ho mandato${subj ? ' («' + subj + '»)' : ''} è tornata indietro: ` +
    (bad ? `l'indirizzo ${address} risulta inesistente.` : `non è stato possibile consegnarla a ${address}.`) +
    ' Mi scrivi quello giusto? Te la rimando subito.';
}

/** Il riassunto in testo semplice per agentNotifications (≤600). */
export function summaryText(a) {
  const parts = [];
  for (const it of a.items || []) {
    const r = it.rec;
    const who = it.people.slice(0, 3).map((p) => {
      const d = p.doc || {};
      return `${d.name || 'senza nome'} (${p.coll}/${p.id}${d.phone ? ', tel ' + String(d.phone).replace(/[^\d+]/g, '') : ''})`;
    }).join('; ');
    const listed = !who && it.also.length ? it.also.slice(0, 3).map((x) => {
      const p = alsoParty(x);
      return `${p.name || 'senza nome'} (${alsoLabel(x)}, ${x.coll}/${x.id}${p.phone ? ', tel ' + String(p.phone).replace(/[^\d+]/g, '') : ''})`;
    }).join('; ') : '';
    parts.push(`Email non recapitata a ${r.address} (${r.status || 's/codice'} · ${wordsOf(r, a.reportingMta)}). ${who ? 'Persone: ' + who + '.' : listed ? 'Nessun lead/cliente PFS, ma è in: ' + listed + '.' : 'Nessun record con questo indirizzo.'}`);
  }
  const matched = (a.items || []).find((it) => it.people.length);
  const listed = matched ? null : (a.items || []).find((it) => it.also.length);
  parts.push(matched ? (TODO[matched.rec.kind] || TODO.other)
    : listed ? (listed.rec.kind === 'bad_address' ? TODO_RECORD_BAD : (TODO[listed.rec.kind] || TODO.other))
    : "Se l'email era automatica, cerca l'indirizzo nel portale.");
  return parts.join(' ').slice(0, 600);
}

// ── le scritture ──────────────────────────────────────────────────────────
async function flagDoc(p, rec, ctx) {
  const path = p.coll + '/' + p.id;
  const op = ctx.fsOp || ((f) => f());
  for (let attempt = 0; attempt < 3; attempt++) {
    const snap = await op(() => fsGetVersioned(path));
    if (!snap) return 'gone';                       // cancellato: nessun fantasma
    const d = snap.data || {};
    const prev = d.emailBounce && typeof d.emailBounce === 'object' ? d.emailBounce : null;
    if (prev && prev.dsnId === ctx.dsnId) return 'same';
    const addressKey = emailKey(d.email) || emailKey(rec.address);
    if (!rec.hard && prev && prev.hard === true && prev.addressKey === addressKey) return 'kept_hard'; // mai un declassamento
    const nowIso = new Date().toISOString();
    const fields = {
      emailBounce: {
        at: ctx.at || nowIso, address: clip(rec.address, 200), addressKey: clip(addressKey, 200), action: rec.action, status: rec.status || null,
        kind: rec.kind, hard: !!rec.hard, reason: rec.diagnostic ? clip(String(rec.diagnostic).split(/(?<=[.!?])\s/)[0], 200) : null,
        dsnId: ctx.dsnId, dsnMessageId: clip(ctx.dsnMessageId, 200),
        originalSubject: ctx.original ? ctx.original.subject || null : null,
        originalMessageId: ctx.original ? ctx.original.messageId || null : null,
        originalAt: ctx.original ? ctx.original.date || null : null,
        reportingMta: ctx.reportingMta || null, source: rec.source, retryUntil: rec.willRetryUntil || null,
      },
    };
    if (rec.hard) {
      fields.emailBouncedAt = new Date();
      fields.emailBounceCount = (Number(d.emailBounceCount) || 0) + 1;
      // Un FATTO di tempo, non di identità: un definitivo è arrivato dopo che
      // la conferma al cliente era partita. Non dice che a rimbalzare sia
      // stata la conferma (il Message-ID della conferma non si conserva: può
      // essere un'email successiva) — la card lo chiede con un «Se è…».
      // 15 minuti di tolleranza: clientEmailSentAt si scrive quando l'invio
      // RITORNA, e il rimbalzo della conferma può arrivare pochi secondi prima.
      if (d.clientEmailSentAt && tsOf(ctx.at || nowIso) >= tsOf(d.clientEmailSentAt) - 15 * 60e3) fields.emailBouncedAfterConfirmationAt = nowIso;
    } else fields.emailDelayedAt = new Date();
    try {
      await op(() => fsCommit([{ docPath: path, fields, precondition: { updateTime: snap.updateTime } }]));
      return 'written';
    } catch (e) {
      if (e.conflict) continue;
      // un updateTime su un documento sparito risponde NOT_FOUND, non
      // «conflitto»: si rilegge, e se non c'è più non è un guasto
      let again;
      try { again = await op(() => fsGetVersioned(path)); } catch { throw e; }
      if (again === null) return 'gone';
      throw e;
    }
  }
  throw codeErr('flag_conflict');
}

/**
 * La card, UNA volta per rimbalzo, consegnata DA QUI. Il claim
 * (`agentNotifications/bounce-<dsnId>`, fsCreate → 409 se esiste) porta
 * sempre `telegramNotifiedAt`: notify-pending non lo tocca mai. Non ci si
 * affida alla sua finestra (status=='pending' limit 50, senza ordine: con 50
 * notifiche più vecchie davanti un riassunto non partirebbe mai). Un invio
 * fallito resta 'failed' sul claim e il rimbalzo NON si ricorda: il giro dopo
 * lo rilegge e riprende il claim con la precondizione — una card, prima o poi,
 * oppure un battito rosso finché Telegram non torna.
 * → { outcome: 'sent' | 'failed' | 'already_sent' | 'in_flight' }
 */
async function notifyOnce(alert, ctx) {
  const id = 'bounce-' + ctx.dsnId;
  const path = 'agentNotifications/' + id;
  const op = ctx.fsOp || ((f) => f());
  const anyPaid = alert.items.some((it) => it.people.some(isPaid));
  const anyBound = alert.items.some((it) => it.also.some(isBound));
  const refs = alert.items.flatMap((it) => it.people.map((p) => ({ collection: p.coll, id: p.id })))
    .concat(alert.items.flatMap((it) => it.also.map((x) => ({ collection: x.coll, id: x.id }))))
    .slice(0, 5);
  const priority = anyPaid || anyBound ? 'urgent' : 'high';
  const summary = summaryText(alert);
  const nowIso = new Date().toISOString();
  const claim = {
    type: 'email.bounced', priority, status: 'pending',
    summary, actor: 'leads/rimbalzi',
    ref: refs[0] || null, refs, dedupKey: id,
    createdAt: nowIso, claimedAt: nowIso, attempts: 1,
    telegramNotifiedAt: new Date(),        // il CLAIM: notify-pending la salta, sempre
    telegramDelivery: 'sending',
  };
  try {
    await op(() => fsCreate('agentNotifications', claim, id));
  } catch (e) {
    if (!e.exists) throw e;
    // Il claim c'è già: consegnato, in volo, o da riprendere.
    const snap = await op(() => fsGetVersioned(path));
    const d = snap && snap.data;
    if (!d) throw codeErr('claim_unreadable');
    if (d.telegramDelivery === 'sent' || d.telegramMessageId) return { outcome: 'already_sent' };
    const stale = Date.now() - tsOf(d.claimedAt || d.createdAt) > CLAIM_STALE_MS;
    if (d.telegramDelivery === 'sending' && !stale) return { outcome: 'in_flight' };
    // fallito, rilasciato (il codice di prima) o orfano: lo si riprende,
    // condizionato — due giri insieme, uno solo lo prende
    try {
      await op(() => fsCommit([{ docPath: path, fields: {
        telegramDelivery: 'sending', telegramNotifiedAt: new Date(), claimedAt: new Date().toISOString(),
        attempts: (Number(d.attempts) || 0) + 1, priority, summary, refs, ref: refs[0] || null,
      }, precondition: { updateTime: snap.updateTime } }]));
    } catch (err) {
      if (err.conflict) return { outcome: 'in_flight' };
      throw err;
    }
  }
  const chatId = process.env.TELEGRAM_CHAT_ID;
  let mid = null, sent = false, failCode = null;
  try {
    if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) throw codeErr('telegram_unconfigured');
    const buttons = [];
    // il numero: prima un lead/cliente, poi la parte di un contratto/profilo
    const who = alert.items.flatMap((it) => it.people.map((x) => ({ lead: x.doc || {}, rec: it.rec })))
      .concat(alert.items.flatMap((it) => it.also.map((x) => ({ lead: pseudoLead(x), rec: it.rec }))))
      .find(({ lead }) => leadWaNumber(lead));
    if (who) {
      const num = leadWaNumber(who.lead);
      const txt = waTextFor(who.lead, who.rec.address, who.rec.kind, alert.original && alert.original.subject);
      buttons.push([{ text: '💬 WhatsApp (msg pronto)', url: `https://wa.me/${num}?text=${encodeURIComponent(txt)}` }]);
    }
    const onlyContracts = !alert.items.some((it) => it.people.length) && alert.items.some((it) => it.also.some((x) => x.coll === 'contracts'));
    buttons.push([{ text: '📇 Portale', url: 'https://www.boomrome.com/portal#' + (onlyContracts ? 'contracts' : 'leads') }]);
    let timer;
    mid = await Promise.race([
      tgSend(chatId, cardText(alert), { reply_markup: { inline_keyboard: buttons } }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(codeErr('telegram_timeout')), TG_TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
    sent = true;
  } catch (e) { failCode = e.code || 'telegram_failed'; log(failCode, ctx.dsnId); }
  const fields = sent
    ? { telegramDelivery: 'sent', telegramMessageId: mid || null, telegramChatId: chatId, sentAt: new Date().toISOString() }
    // consegna fallita: il claim RESTA (telegramNotifiedAt pieno) e dice
    // perché; il rimbalzo non si ricorda, il giro dopo riprova da qui
    : { telegramDelivery: 'failed', lastFailedAt: new Date().toISOString(), lastFailCode: failCode };
  try {
    await op(() => fsCommit([{ docPath: path, fields, precondition: { exists: true } }]));
  } catch (e) {
    // dopo un invio riuscito l'avviso È partito (e il rimbalzo si ricorda:
    // nessuna ripresa); dopo un invio fallito il claim resta 'sending' e fra
    // 180s è orfano: il giro dopo lo riprende comunque
    log(e.code || 'claim_outcome_failed', ctx.dsnId);
  }
  return { outcome: sent ? 'sent' : 'failed' };
}

// ── il giro ───────────────────────────────────────────────────────────────
const SEARCH = (since) => ({
  since,
  or: [
    { from: 'mailer-daemon' }, { from: 'postmaster' },
    { subject: 'Delivery Status Notification' }, { subject: 'Undeliverable' }, { subject: 'Undelivered Mail' },
    { subject: 'Mail delivery failed' }, { subject: 'Returned mail' }, { subject: 'failure notice' },
    { subject: 'Non recapitabile' },
  ],
});

export async function scanBounces({ dry = false } = {}) {
  const stats = { folder: null, candidates: 0, envelopes: 0, dsn: 0, hard: 0, soft: 0, matched: 0, unmatched: 0, flagged: 0, alerted: 0, quiet: 0, alreadySeen: 0, deferred: 0, errors: 0, notDsn: 0, unparsed: 0, ownOnly: 0, notifyFailed: 0, inFlight: 0, incomplete: false };
  const preview = [];
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASS;
  if (!user || !pass) return { ok: false, skipped: 'imap_unconfigured', error: 'imap_unconfigured', stats, preview };

  const B = runBudget(60_000, 7_000);
  const own = ownAddresses();
  let mem;
  try { mem = (await fsGet(MEM_DOC)) || {}; }
  catch { return { ok: false, error: 'memory_unreadable', stats, preview }; }
  const seen = mem.seen && typeof mem.seen === 'object' ? { ...mem.seen } : {};
  const quiet = mem.quiet && typeof mem.quiet === 'object' ? { ...mem.quiet } : {};
  const today = romeDay();
  const cap = mem.unmatchedCards && mem.unmatchedCards.day === today ? { day: today, n: Number(mem.unmatchedCards.n) || 0 } : { day: today, n: 0 };
  let memDirty = false;
  const remember = (dsnId, outcome) => { seen[dsnId] = { at: new Date().toISOString(), outcome }; memDirty = true; };

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false,
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 25000,
  });
  if (typeof client.on === 'function') client.on('error', () => {}); // un errore di socket non abbatte il processo
  let stopped = false;
  const close = () => { try { client.close(); } catch { /* chiuso */ } };
  // Ogni passo IMAP ha un tetto suo: il socketTimeout c'è, ma un passo che non
  // risponde non deve poter portare la funzione oltre il budget.
  const run = async (op) => {
    if (stopped) throw codeErr('imap_timeout');
    const ms = Math.max(1, B.capFor(COST_STEP));
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(op),
        new Promise((_, rej) => { timer = setTimeout(() => { stopped = true; close(); rej(codeErr('imap_timeout')); }, ms); }),
      ]);
    } finally { clearTimeout(timer); }
  };

  const matchAddress = makeMatcher();
  let infraError = null;
  try {
    if (!B.afford(COST_STEP)) throw codeErr('no_time');
    await run(() => client.connect());
    const folders = await run(() => client.list());
    const all = (folders || []).filter((f) => f && f.specialUse === '\\All' && !(f.flags && typeof f.flags.has === 'function' && f.flags.has('\\Noselect')));
    const folder = all.length === 1 ? all[0].path : 'INBOX';
    stats.folder = folder;
    const lock = await run(() => client.getMailboxLock(folder, { readOnly: true }));
    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * DAY);
      if (!B.afford(COST_STEP)) throw codeErr('no_time');
      const found = await run(() => client.search(SEARCH(since), { uid: true }));
      const uids = [...new Set(Array.isArray(found) ? found : [])].filter((u) => Number.isInteger(u) && u > 0).sort((a, b) => b - a).slice(0, MAX_CANDIDATES);
      stats.candidates = uids.length;
      let envelopes = [];
      if (uids.length) {
        if (!B.afford(COST_STEP)) throw codeErr('no_time');
        envelopes = await run(() => client.fetchAll(uids.join(','), { envelope: true, size: true, emailId: true }, { uid: true })) || [];
      }
      envelopes = [...envelopes].sort((a, b) => (b.uid || 0) - (a.uid || 0));
      stats.envelopes = envelopes.length;
      let fetched = 0;
      for (const env of envelopes) {
        const mid = env && env.envelope && env.envelope.messageId;
        const dsnId = sha1(mid || ('gm:' + (env.emailId || (folder + ':' + env.uid)))).slice(0, 24);
        if (seen[dsnId]) { stats.alreadySeen++; continue; }
        if (fetched >= MAX_NEW_PER_RUN) { stats.deferred++; stats.incomplete = true; continue; }
        if (!B.afford(COST_STEP)) { stats.deferred++; stats.incomplete = true; break; }
        fetched++;
        const msg = await run(() => client.fetchOne(String(env.uid), { source: { maxLength: SOURCE_MAX } }, { uid: true }));
        if (!msg || !msg.source) { stats.errors++; stats.incomplete = true; log('fetch_empty', dsnId); continue; }
        let parsed;
        try { parsed = await simpleParser(msg.source, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true }); }
        catch { remember(dsnId, 'unparsed'); stats.unparsed++; log('mime_unparsed', dsnId); continue; }
        const dsn = await parseDsn(parsed, { own });
        if (!dsn.isDsn) { stats.notDsn++; remember(dsnId, 'not_dsn'); preview.push({ dsnId, outcome: 'not_dsn' }); continue; }
        stats.dsn++;
        if (!dsn.recipients.length) {
          const outcome = dsn.reason === 'own_only' ? 'own_only' : dsn.reason === 'no_failure' ? 'not_dsn' : 'unparsed';
          if (outcome === 'own_only') stats.ownOnly++; else if (outcome === 'unparsed') stats.unparsed++; else stats.notDsn++;
          remember(dsnId, outcome); preview.push({ dsnId, outcome });
          continue;
        }
        const recs = dsn.recipients.map(classify);
        const hard = recs.filter((r) => r.hard), soft = recs.filter((r) => !r.hard);

        // Ogni destinatario si cerca solo se il tempo che resta lo paga: un
        // rimbalzo lasciato a metà non si ricorda e il giro dopo lo riprende
        // (segnare è idempotente per dsnId).
        const items = [];
        let coreFailed = false, outOfTime = false;
        const partial = new Set();
        for (const rec of recs) {
          if (!B.afford(COST_MATCH)) { outOfTime = true; break; }
          let m;
          try { m = await capped(matchAddress(rec.keys), B.capFor(COST_MATCH), 'match_timeout'); }
          catch { m = { coreFailed: true }; }
          if (m.coreFailed) { coreFailed = true; break; }
          m.partial.forEach((c) => partial.add(c));
          items.push({ rec, people: m.people, also: m.also });
        }
        if (outOfTime) { stats.deferred++; stats.incomplete = true; break; }
        if (coreFailed) { stats.errors++; stats.incomplete = true; log('match_read_failed', dsnId); continue; }
        stats.hard += hard.length; stats.soft += soft.length;
        const matchedN = items.reduce((n, it) => n + it.people.length, 0);
        items.forEach((it) => { if (isOrphan(it)) stats.unmatched++; else stats.matched++; });

        // ogni lettura/scrittura puntuale ha il suo tetto, dentro il budget
        const fsOp = (f) => capped(f(), Math.min(FS_OP_MS, Math.max(1, B.capFor(FS_OP_MS))));
        const ctx = { dsnId, dsnMessageId: mid || null, at: dsn.at, original: dsn.original, reportingMta: dsn.reportingMta, fsOp };
        // segnare: una persona per rimbalzo, la classe più grave vince
        let writeFailed = false;
        const gone = new Set();
        if (!dry) {
          const byDoc = new Map();
          for (const it of items) for (const p of it.people) {
            const k = p.coll + '/' + p.id;
            const cur = byDoc.get(k);
            if (!cur || (it.rec.hard && !cur.rec.hard)) byDoc.set(k, { p, rec: it.rec });
          }
          for (const { p, rec } of byDoc.values()) {
            if (!B.afford(COST_FLAG)) { outOfTime = true; break; }
            try {
              const r = await capped(flagDoc(p, rec, ctx), B.capFor(COST_FLAG), 'flag_timeout');
              if (r === 'gone') gone.add(p.coll + '/' + p.id);
              if (r === 'written') {
                stats.flagged++;
                // il registro attività è un'eco: se non si scrive, il segno sul
                // lead c'è comunque (e il giro dopo direbbe 'same')
                try {
                  await fsOp(() => logActivity('email_bounced', p.coll === 'pfsClients' ? 'pfs' : 'lead',
                    { [p.coll === 'pfsClients' ? 'pfsClientId' : 'leadId']: p.id, dsnId, status: rec.status || null, kind: rec.kind }, 'leads/rimbalzi'));
                } catch { log('activity_failed', dsnId); }
              }
            } catch (e) { writeFailed = true; log(e.code || 'flag_failed', dsnId); }
          }
        }
        if (outOfTime) { stats.deferred++; stats.incomplete = true; break; }
        if (writeFailed) { stats.errors++; stats.incomplete = true; continue; }
        // un record sparito fra la ricerca e la scrittura non va nella card
        if (gone.size) for (const it of items) it.people = it.people.filter((p) => !gone.has(p.coll + '/' + p.id));

        // avvisare, o tacere — e perché. Un ritardo non sveglia nessuno; un
        // definitivo sì, anche senza nessun record (una riga: l'indirizzo non
        // è di nessun record letto), tranne due silenzi dichiarati:
        // solo lead morti/archiviati e nessun pagante (i bot che scrivono
        // indirizzi finti), o lo stesso indirizzo già avvisato nelle 24 ore.
        const hardItems = items.filter((it) => it.rec.hard);
        const quietKey = (it) => sha256(emailKey(it.rec.address)).slice(0, 16);
        let outcome;
        let rememberIt = true;
        if (!hardItems.length) outcome = matchedN ? 'flagged_soft' : items.some((it) => it.also.length) ? 'soft_listed' : 'unmatched';
        else {
          const nowMs = Date.now();
          const worth = hardItems.filter((it) => !it.people.length || it.also.length || it.people.some(isPaid) || !it.people.every(isDead));
          const fresh = worth.filter((it) => { const q = quiet[quietKey(it)]; return !(q && nowMs - tsOf(q) < QUIET_MS); });
          const orphanOnly = fresh.length > 0 && fresh.every(isOrphan);
          if (!worth.length) outcome = 'quiet_dead';
          else if (!fresh.length) outcome = 'quiet_repeat';
          else if (dry) outcome = 'would_alert';
          else if (orphanOnly && cap.n >= UNMATCHED_CARDS_PER_DAY) outcome = 'unmatched_capped';
          else {
            if (!B.afford(COST_NOTIFY)) { stats.deferred++; stats.incomplete = true; break; }
            let r;
            try { r = await notifyOnce({ items: fresh, original: dsn.original, reportingMta: dsn.reportingMta, partial: [...partial] }, ctx); }
            catch (e) { stats.errors++; stats.incomplete = true; log(e.code || 'notify_failed', dsnId); continue; }
            outcome = orphanOnly ? 'unmatched' : 'alerted';
            if (r.outcome === 'sent' || r.outcome === 'already_sent') {
              // consegnato (ora o da un giro prima): l'indirizzo tace 24 ore
              for (const it of fresh) quiet[quietKey(it)] = new Date().toISOString();
              memDirty = true;
              if (r.outcome === 'sent') { stats.alerted++; if (orphanOnly) cap.n++; }
            } else if (r.outcome === 'in_flight') {
              // un altro giro lo sta consegnando: non si ricorda, si ricontrolla
              stats.inFlight++; rememberIt = false; outcome = 'in_flight';
            } else {
              // Telegram non ha risposto: niente memoria e niente silenzio, il
              // giro dopo riprende il claim. Il battito lo dice.
              stats.notifyFailed++; stats.incomplete = true; rememberIt = false; outcome = 'alert_failed';
            }
          }
          if (outcome === 'quiet_dead' || outcome === 'quiet_repeat' || outcome === 'unmatched_capped') stats.quiet++;
        }
        if (!dry && rememberIt) remember(dsnId, outcome);
        preview.push({ dsnId, hard: hardItems.length > 0, kind: (hardItems[0] || items[0]).rec.kind, status: (hardItems[0] || items[0]).rec.status || null, matched: matchedN, outcome });
      }
    } finally {
      try { lock.release(); } catch { /* lock perso col socket */ }
    }
  } catch (e) {
    infraError = e.code === 'no_time' ? null : (e.code || 'imap_failed');
    if (e.code === 'no_time') { stats.deferred++; stats.incomplete = true; }
  }
  if (infraError) close();
  else { try { await run(() => client.logout()); } catch { close(); } }

  if (memDirty && !dry) {
    const nowMs = Date.now();
    const keptSeen = Object.fromEntries(Object.entries(seen).sort((a, b) => String(b[1] && b[1].at).localeCompare(String(a[1] && a[1].at))).slice(0, SEEN_KEEP));
    const keptQuiet = Object.fromEntries(Object.entries(quiet).filter(([, at]) => nowMs - tsOf(at) < QUIET_KEEP_MS));
    try { await capped(fsPatch(MEM_DOC, { seen: keptSeen, quiet: keptQuiet, unmatchedCards: cap, updatedAt: new Date() }), FS_OP_MS); }
    catch { log('memory_save_failed'); if (!infraError) infraError = 'memory_save_failed'; }
  }
  if (infraError) log(infraError);
  // un avviso che non è partito è un guasto del giro, anche se il resto va:
  // il battito rosso è l'unico segnale quando il canale è Telegram stesso
  const ok = !infraError && stats.errors === 0 && stats.notifyFailed === 0;
  return { ok, error: infraError || (stats.errors ? 'firestore_failed' : stats.notifyFailed ? 'telegram_failed' : null), stats, preview };
}

export async function bouncesHandler(req, res) {
  if (req.method && !['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  // la guardia condivisa ammette anche owner e landlord: la casella globale no
  if (String(actor).startsWith('admin:')) {
    let profile;
    try { profile = await fsGet('users/' + String(actor).slice(6)); }
    catch { return res.status(503).json({ ok: false, error: 'role_unavailable' }); }
    if (!profile || profile.role !== 'admin') return res.status(403).json({ ok: false, error: 'admin_required' });
  }
  const dry = String((req.query && req.query.dry) || '') === '1';
  const r = await scanBounces({ dry });
  if (!dry) await reportHealth(HEALTH_SOURCE, { ok: r.ok, error: r.error || undefined, stats: r.stats });
  return res.status(r.ok || r.skipped ? 200 : 500).json({ ok: r.ok, mode: 'bounces', dry, ...(r.skipped ? { skipped: r.skipped } : {}), ...(r.error ? { error: r.error } : {}), folder: r.stats.folder, stats: r.stats, preview: r.preview });
}
