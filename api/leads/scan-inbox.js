// api/leads/scan-inbox.js
// LEAD inbox scanner (cron */10 min): the server-side ear on the portals.
//
// The operator's leads arrive as portal notification emails (Immobiliare/
// Idealista/Casa.it/Subito "hai ricevuto una richiesta") into the Gmail
// mailbox. The Mac-side Homie agent already forwards what it catches to
// /api/homie/inbound — this cron is the Mac-INDEPENDENT safety net and
// primary channel: it reads the same mailbox over IMAP (same infra as
// pfs/banking/documents scan-inbox), extracts the prospect with Claude
// haiku, matches the listing against the real catalog, dedupes (both
// per-email-message and per-person) and writes the SAME `leads` schema
// homie/inbound writes — so cockpit, portal, Commerciale AI and the
// Telegram lead ping all light up no matter which path caught it first.
//
// Request emails only: saved-search alerts belong to pfs/scan-inbox and are
// filtered out by subject. Processed messages are remembered in
// `heartbeat/leads-inbox-memory` so re-runs and the 2-day lookback never
// re-pay the AI call.
//
// LA LEZIONE DEL 30 OTTOBRE 2026, letta nei log: «soft deadline: restano
// 40–80 email» a OGNI giro, per settimane, senza mai scendere. Il controllo
// del tempo addebitava 45s (download + modello) a OGNI email prima di
// aprirla — anche agli alert, alle newsletter e a quelle già lette, che poi
// si scartavano DOPO il download. Con 53s utili un giro poteva cominciare
// email solo nei primi ~8s: rileggeva ogni volta le stesse email più vecchie
// (immobiliare per primo, idealista dopo, in ordine di dominio) e le
// richieste nuove di idealista — la maggioranza — arrivavano al server con
// uno o due giorni di ritardo, quando la finestra le portava in testa. Ora:
// UN fetch delle intestazioni per tutta la finestra, il filtro (oggetto,
// memoria) sulle intestazioni, le più RECENTI per prime, e il tempo si
// chiede a pezzi — il download e il modello ciascuno col suo costo vero.
//
// Auth: cron secret / X-Homie-Secret / admin ID token. `?dry=1` read-only.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import crypto from 'node:crypto';
import { fsGet, fsPatch, fsCreate, fsList } from '../homie/_lib.js';
import { normalizePhone } from '../homie/_lead.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportHealth } from '../pfs/_health.js';
import { parseModelJson } from '../_modeljson.js';
import { runBudget } from '../_budget.js';
import { ai } from '../_ai.js';
// ?mode=bounces — i rimbalzi delle email ai clienti (api/leads/_rimbalzi.js):
// stesso file perché vercel.json è al limite delle 50 regole functions.
import { bouncesHandler } from './_rimbalzi.js';

const LOOKBACK_DAYS = 2;
const AI_BUDGET_PER_RUN = 8;
// Il modello sta nel registro: js/ai-registry.js, scopo 'leads.inbox'.

const PORTAL_DOMAINS = ['immobiliare.it', 'idealista.it', 'idealista.com', 'casa.it', 'subito.it', 'bakeca.it'];
// «Nuova offerta di <nome> sul tuo immobile» (idealista): chi offre un
// canone è il lead più caldo che arrivi, e l'oggetto non diceva «messaggio».
const REQUEST_RE = /richiest|contatt|messagg|interessat|ti ha scritto|nuovo lead|vuole informazioni|ha risposto|nuova offerta di |request|enquiry|contacted/i;
const ALERT_RE = /nuovi annunci|ricerca salvata|annunci per te|price drop|ribasso|della tua ricerca|saved search/i;

function sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex'); }

// La memoria è indicizzata sul Message-ID come lo scrive mailparser (fra < >):
// l'intestazione dell'envelope IMAP va resa nella STESSA forma, o ogni email
// già letta sembrerebbe nuova e ripagherebbe il modello.
export function memIdFor(rawMessageId, uid, user) {
  let v = String(rawMessageId || '').trim();
  if (v) { if (v[0] !== '<') v = '<' + v; if (v[v.length - 1] !== '>') v += '>'; }
  const msgId = v || `${uid}@${user}`;
  return { msgId, memId: sha1(msgId) };
}

// Cosa leggere davvero, dalle sole intestazioni: niente alert né newsletter,
// niente email già in memoria, le più recenti per prime (l'UID IMAP cresce
// con l'arrivo). Pura: si testa senza casella.
export function triage(envelopes, seen, user) {
  const out = { todo: [], skipped: 0, requests: 0, duplicates: 0 };
  const rows = [...(envelopes || [])].filter((m) => m && m.uid).sort((a, b) => (b.uid || 0) - (a.uid || 0));
  for (const m of rows) {
    const env = m.envelope || {};
    const subject = String(env.subject || '');
    if (ALERT_RE.test(subject) || !REQUEST_RE.test(subject)) { out.skipped++; continue; }
    out.requests++;
    const { msgId, memId } = memIdFor(env.messageId, m.uid, user);
    if (seen && seen[memId]) { out.duplicates++; continue; }
    const at = env.date ? new Date(env.date) : null;
    out.todo.push({ uid: m.uid, subject, msgId, memId, receivedAt: at && !isNaN(at) ? at.toISOString() : null });
  }
  return out;
}

async function extractLead(subject, text) {
  const SYSTEM = `Estrai il potenziale inquilino (lead) da un'email di notifica di un portale immobiliare italiano. Rispondi SOLO JSON:
{"name":"...","email":"...o null","phone":"...o null","message":"il testo scritto dal cliente, o null","listingTitle":"titolo/indirizzo dell'annuncio a cui si riferisce, o null","language":"it|en"}
Regole: SOLO dati presenti nel testo, mai inventare. Il mittente del portale non è il lead. Se l'email non contiene una richiesta di una persona reale, rispondi {"name":null}.`;
  const { text: out } = await ai({
    purpose: 'leads.inbox', system: SYSTEM, maxTokens: 400, timeoutMs: 20000, json: true,
    messages: [{ role: 'user', content: `OGGETTO: ${subject}\n\nEMAIL:\n${String(text).slice(0, 6000)}` }],
  });
  const read = parseModelJson(out);
  if (!read.ok) throw new Error('ai_json_' + read.why);
  return read.value;
}

// simple catalog match, same spirit as the wizard bot's matcher
function matchListing(title, listings) {
  if (!title) return null;
  const t = String(title).toLowerCase();
  const stop = new Set(['bilocale', 'trilocale', 'monolocale', 'appartamento', 'roma', 'affitto', 'zona', 'luminoso']);
  let best = null, bestScore = 0, ties = 0;
  for (const l of listings) {
    const hay = `${l.name || ''} ${l.zone || ''} ${l.address || ''}`.toLowerCase();
    const toks = new Set((hay.match(/[a-zà-ù]{4,}/g) || []).filter(w => !stop.has(w)));
    const score = [...toks].filter(w => t.includes(w)).length;
    if (score > bestScore) { best = l; bestScore = score; ties = 0; }
    else if (score === bestScore && score > 0) ties++;
  }
  return bestScore > 0 && ties === 0 ? best : null;
}

export default async function handler(req, res) {
  if (String(req.query?.mode || '') === 'bounces') return bouncesHandler(req, res);
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = String((req.query && req.query.dry) || '') === '1';

  const user = process.env.PFS_IMAP_USER || process.env.GMAIL_USER;
  const pass = process.env.PFS_IMAP_PASS || process.env.GMAIL_APP_PASS;
  if (!user || !pass) {
    await reportHealth('leads-inbox', { ok: false, error: 'IMAP credentials missing' });
    return res.status(200).json({ ok: false, error: 'imap_credentials_missing' });
  }
  const aiKey = process.env.ANTHROPIC_API_KEY;
  if (!aiKey) return res.status(200).json({ ok: false, error: 'anthropic_key_missing' });

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  // Deadline morbida sotto il limite piattaforma (60s): uscire puliti batte
  // il kill a metà lavoro — memoria e dedupe rendono gratis il giro dopo.
  // IL TEMPO SI CONTA PRIMA DI SPENDERLO (api/_budget.js): la vecchia
  // scadenza a 48s chiedeva «sono in ritardo?» e poi avviava un giro che può
  // costarne 45 — la funzione moriva a 60 nel mezzo, senza battito. Ora si
  // parte solo se il residuo copre il COSTO MASSIMO del passo.
  const B = runBudget(60_000, 7_000);
  const COST_SEARCH = 25_000;   // = socketTimeout imapflow
  const COST_FETCH = 25_000;    // un fetch (intestazioni o sorgente): al massimo un socketTimeout
  const COST_AI = 20_000;       // = timeoutMs di extractLead
  const COST_WRITE = 6_000;     // dedupe per persona (due letture) + la scrittura del lead
  const stats = { envelopes: 0, skipped: 0, scanned: 0, requests: 0, ingested: 0, duplicates: 0, aiCalls: 0, unmatched: 0, timeBoxed: 0 };
  // Timeout ESPLICITI: i default di imapflow (connect 90s, socket idle 5min)
  // superano il limite piattaforma (60s) — una Gmail lenta uccideva la
  // funzione SENZA battito: errs=0 e run morti, il silenzio ambiguo. Con i
  // tetti, lo stallo diventa un errore CONTATO (reportHealth ok:false).
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false,
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 25000,
  });

  // processed-message memory: ONE doc under heartbeat/ (a collection the
  // security rules already allow to admin) — no new rules deploy needed,
  // and one patch per run instead of one per message
  const MEM_DOC = 'heartbeat/leads-inbox-memory';
  let seen = {};
  try { seen = ((await fsGet(MEM_DOC)) || {}).seen || {}; } catch { /* first run */ }
  let memDirty = false;
  const remember = (id, outcome) => { seen[id] = { at: new Date().toISOString(), outcome }; memDirty = true; };

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      let listings = [];
      try { listings = await fsList('listings', { limit: 100 }); } catch { /* match is best-effort */ }

      const uids = new Set();
      for (const dom of PORTAL_DOMAINS) {
        if (!B.afford(COST_SEARCH)) break; // socket malato: ogni search può costare 25s
        try { for (const u of await client.search({ since, from: dom }, { uid: true }) || []) uids.add(u); }
        catch (e) { console.warn('[leads/scan-inbox] search', dom, e.message); }
      }

      // UN giro di intestazioni per tutta la finestra: decidere cosa scaricare
      // costa un fetch, non un download per email.
      let envelopes = [];
      if (uids.size && B.afford(COST_FETCH)) {
        envelopes = await client.fetchAll([...uids].join(','), { envelope: true }, { uid: true }) || [];
      } else if (uids.size) {
        // le ricerche hanno mangiato il tempo (socket malato): niente download
        // a metà, il giro dopo riparte dall'inizio — e il battito lo dice
        stats.timeBoxed = uids.size;
        console.warn('[leads/scan-inbox] tempo finito prima delle intestazioni:', uids.size, 'email al prossimo giro');
      }
      const plan = triage(envelopes, seen, user);
      stats.envelopes = envelopes.length;
      stats.skipped = plan.skipped;
      stats.requests = plan.requests;
      stats.duplicates = plan.duplicates;

      for (let i = 0; i < plan.todo.length; i++) {
        const t = plan.todo[i];
        const left = plan.todo.length - i;
        if (stats.aiCalls >= AI_BUDGET_PER_RUN) { stats.timeBoxed = left; break; }
        if (!B.afford(COST_FETCH)) {
          stats.timeBoxed = left;
          console.warn('[leads/scan-inbox] tempo finito: restano', left, 'richieste al prossimo giro');
          break;
        }
        const { uid, subject, msgId, memId } = t;
        stats.scanned++;
        let parsed;
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          parsed = await simpleParser(msg.source);
        } catch (e) { console.warn('[leads/scan-inbox] fetch/parse', uid, e.message); continue; }
        // il modello solo se il tempo copre anche lui e la scrittura: altrimenti
        // l'email resta NON letta in memoria e la prende il giro dopo
        if (!B.afford(COST_AI + COST_WRITE)) {
          stats.timeBoxed = left;
          console.warn('[leads/scan-inbox] tempo finito: restano', left, 'richieste al prossimo giro');
          break;
        }

        let lead;
        try {
          stats.aiCalls++;
          lead = await extractLead(subject, parsed.text || parsed.html || '');
        } catch (e) { console.warn('[leads/scan-inbox] extract', e.message); continue; }
        if (!lead || !lead.name) {
          remember(memId, 'not_a_lead');
          continue;
        }

        // person-level dedupe: same email or phone already a lead in the last 7 days
        let dupe = false;
        for (const [field, value] of [['email', lead.email], ['phone', lead.phone]]) {
          if (!value || dupe) continue;
          try {
            const prior = await fsList('leads', { filter: { field, op: 'EQUAL', value: String(value).trim() }, limit: 5 });
            dupe = prior.some(p => Date.now() - new Date(p.createdAt || 0).getTime() < 7 * 86400000);
          } catch { /* best-effort */ }
        }
        if (dupe) {
          stats.duplicates++;
          remember(memId, 'duplicate_person');
          continue;
        }

        const fromAddr = (parsed.from && parsed.from.value && parsed.from.value[0] && parsed.from.value[0].address) || '';
        const portal = PORTAL_DOMAINS.find(d => fromAddr.endsWith(d)) || 'portal';
        const prop = matchListing(lead.listingTitle, listings);
        if (!prop && lead.listingTitle) stats.unmatched++;

        if (!dry) {
          await fsCreate('leads', {
            source: portal.replace(/\..*$/, ''),
            name: String(lead.name).slice(0, 120),
            email: lead.email ? String(lead.email).trim().slice(0, 160) : null,
            // normalizzato alla porta: WhatsApp consegna sempre +39…, i portali
            // scrivono di tutto. Archiviare una forma sola rende la stessa
            // persona due lead quando riscrive da un altro canale.
            phone: lead.phone ? (normalizePhone(lead.phone) || String(lead.phone).trim()).slice(0, 40) : null,
            message: lead.message ? String(lead.message).slice(0, 1500) : null,
            // never default to Italian: an unknown language is unknown, and
            // every downstream template treats unknown as English (replyLang)
            language: ['it', 'en'].includes(String(lead.language || '').toLowerCase()) ? String(lead.language).toLowerCase() : null,
            propertyId: prop ? prop.id : null,
            propertyTitle: prop ? (prop.name || null) : (lead.listingTitle ? String(lead.listingTitle).slice(0, 160) : null),
            propertyPrice: prop ? (prop.price || null) : null,
            status: 'new',
            sourceRef: msgId.slice(0, 200),
            // quando la persona ha scritto, distinto da quando il server l'ha letta
            receivedAt: t.receivedAt,
            raw: { subject: subject.slice(0, 200), from: fromAddr, via: 'leads/scan-inbox' },
            createdAt: new Date(),
          });
          remember(memId, 'ingested');
        }
        stats.ingested++;
      }
    } finally {
      lock.release();
    }
    if (memDirty && !dry) {
      // prune to the newest 400 entries so the doc never grows unbounded
      const entries = Object.entries(seen).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, 400);
      try { await fsPatch(MEM_DOC, { seen: Object.fromEntries(entries), updatedAt: new Date() }); }
      catch (e) { console.warn('[leads/scan-inbox] memory save failed:', e.message); }
    }
    await client.logout();
  } catch (e) {
    try { await client.logout(); } catch { /* already closed */ }
    await reportHealth('leads-inbox', { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }

  await reportHealth('leads-inbox', { ok: true, stats });
  return res.status(200).json({ ok: true, dry, ...stats });
}
