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
// `leadImports` so re-runs and the 2-day lookback never re-pay the AI call.
//
// Auth: cron secret / X-Homie-Secret / admin ID token. `?dry=1` read-only.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import crypto from 'node:crypto';
import { fsGet, fsPatch, fsCreate, fsList } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportHealth } from '../pfs/_health.js';

const LOOKBACK_DAYS = 2;
const AI_BUDGET_PER_RUN = 8;
const MODEL = 'claude-haiku-4-5-20251001';

const PORTAL_DOMAINS = ['immobiliare.it', 'idealista.it', 'idealista.com', 'casa.it', 'subito.it', 'bakeca.it'];
const REQUEST_RE = /richiest|contatt|messagg|interessat|ti ha scritto|nuovo lead|vuole informazioni|ha risposto|request|enquiry|contacted/i;
const ALERT_RE = /nuovi annunci|ricerca salvata|annunci per te|price drop|ribasso|della tua ricerca|saved search/i;

function sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex'); }

async function extractLead(key, subject, text) {
  const SYSTEM = `Estrai il potenziale inquilino (lead) da un'email di notifica di un portale immobiliare italiano. Rispondi SOLO JSON:
{"name":"...","email":"...o null","phone":"...o null","message":"il testo scritto dal cliente, o null","listingTitle":"titolo/indirizzo dell'annuncio a cui si riferisce, o null","language":"it|en"}
Regole: SOLO dati presenti nel testo, mai inventare. Il mittente del portale non è il lead. Se l'email non contiene una richiesta di una persona reale, rispondi {"name":null}.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 400, system: SYSTEM,
      messages: [{ role: 'user', content: `OGGETTO: ${subject}\n\nEMAIL:\n${String(text).slice(0, 6000)}` }],
    }),
  });
  if (!r.ok) throw new Error('anthropic_' + r.status);
  const j = await r.json();
  const out = (j.content || []).map(b => b.text || '').join('');
  const a = out.indexOf('{'), b = out.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? out.slice(a, b + 1) : out);
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
  const stats = { scanned: 0, requests: 0, ingested: 0, duplicates: 0, aiCalls: 0, unmatched: 0 };
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });

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
        try { for (const u of await client.search({ since, from: dom }, { uid: true }) || []) uids.add(u); }
        catch (e) { console.warn('[leads/scan-inbox] search', dom, e.message); }
      }

      for (const uid of uids) {
        if (stats.aiCalls >= AI_BUDGET_PER_RUN) break;
        stats.scanned++;
        let parsed;
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          parsed = await simpleParser(msg.source);
        } catch (e) { console.warn('[leads/scan-inbox] fetch/parse', uid, e.message); continue; }

        const subject = parsed.subject || '';
        if (ALERT_RE.test(subject) || !REQUEST_RE.test(subject)) continue;
        stats.requests++;

        const msgId = parsed.messageId || `${uid}@${user}`;
        const memId = sha1(msgId);
        if (seen[memId]) { stats.duplicates++; continue; }

        let lead;
        try {
          stats.aiCalls++;
          lead = await extractLead(aiKey, subject, parsed.text || parsed.html || '');
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
            phone: lead.phone ? String(lead.phone).trim().slice(0, 40) : null,
            message: lead.message ? String(lead.message).slice(0, 1500) : null,
            language: lead.language === 'en' ? 'en' : 'it',
            propertyId: prop ? prop.id : null,
            propertyTitle: prop ? (prop.name || null) : (lead.listingTitle ? String(lead.listingTitle).slice(0, 160) : null),
            propertyPrice: prop ? (prop.price || null) : null,
            status: 'new',
            sourceRef: msgId.slice(0, 200),
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
