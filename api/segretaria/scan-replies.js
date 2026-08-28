// api/segretaria/scan-replies.js — la porta EMAIL della Segretaria (cron */10).
//
// La tranche 2 di STUDIO_SEGRETARIA: i lead dei portali spesso non hanno un
// numero — la Segretaria apre via email (segretariaOpen) e le RISPOSTE del
// cliente tornano nella casella Gmail. Questo cron le raccoglie e le
// consegna allo stesso turno del canale WhatsApp.
//
// Il perimetro è STRETTO di proposito: si leggono SOLO le email dei mittenti
// che corrispondono a conversazioni CONSEGNATE (segretaria: true, con
// contactEmail). Il resto della casella non ci riguarda — i lead nuovi li
// fa già leads/scan-inbox, i documenti documents/scan-inbox, la banca il suo.
// Nessuna conversazione consegnata via email ⇒ il run costa una query e basta.
//
// Idempotente per costruzione: Message-ID ricordati in
// heartbeat/segretaria-mail-memory (cap 500) + il contextHash del turno.
// Heartbeat teamHealth/segretaria (allerta Telegram esistente dopo 3 run
// falliti). Auth come i cron PFS; `?dry=1` conta senza scrivere.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import SEG from '../../js/segretaria-engine.js';
import { fsGet, fsPatch, fsCreate, fsList } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportEmployeeHealth } from '../employees/_lib.js';
import { segretariaTurn } from './_core.js';

const MEMORY_DOC = 'heartbeat/segretaria-mail-memory';
const WINDOW_DAYS = 3;
const MAX_PER_RUN = 8;

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry });
    if (!dry) await reportEmployeeHealth('segretaria', { ok: true, stats: out });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[segretaria/scan-replies]', e);
    if (!dry) await reportEmployeeHealth('segretaria', { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry }) {
  // Le conversazioni email consegnate: il perimetro di lettura.
  let convs = [];
  try { convs = await fsList('conversations', { filter: { field: 'segretaria', op: 'EQUAL', value: true }, limit: 50 }); }
  catch { convs = []; }
  const byEmail = new Map();
  for (const c of convs) {
    const e = String(c.contactEmail || '').trim().toLowerCase();
    if (e) byEmail.set(e, c);
  }
  if (!byEmail.size) return { watched: 0, seen: 0, turns: 0 };

  const user = process.env.PFS_IMAP_USER || process.env.GMAIL_USER;
  const pass = process.env.PFS_IMAP_PASS || process.env.GMAIL_APP_PASS;
  if (!user || !pass) return { watched: byEmail.size, skipped: 'imap_unconfigured' };

  const memory = (await fsGet(MEMORY_DOC).catch(() => null)) || {};
  const seenIds = new Set(Array.isArray(memory.ids) ? memory.ids : []);
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000);
  const softDeadline = Date.now() + 45_000;
  const stats = { watched: byEmail.size, seen: 0, turns: 0, escalated: 0 };
  const newIds = [];

  const client = new ImapFlow({
    host: process.env.PFS_IMAP_HOST || 'imap.gmail.com',
    port: 993, secure: true,
    auth: { user, pass },
    logger: false,
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 25000,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uidSet = new Set();
      for (const from of byEmail.keys()) {
        if (Date.now() > softDeadline) break;
        try {
          const uids = await client.search({ since, from }, { uid: true });
          for (const u of uids || []) uidSet.add(u);
        } catch (e) { console.warn('[segretaria/scan-replies] search', from, e.message); }
      }
      const uids = [...uidSet].sort((a, b) => a - b).slice(-MAX_PER_RUN * 3);

      for (const uid of uids) {
        if (Date.now() > softDeadline || stats.turns >= MAX_PER_RUN) break;
        let parsed;
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          parsed = await simpleParser(msg.source);
        } catch (e) { console.warn('[segretaria/scan-replies] parse uid', uid, e.message); continue; }

        const mid = String(parsed.messageId || `uid:${uid}`);
        if (seenIds.has(mid)) continue;
        const fromAddr = String(parsed.from?.value?.[0]?.address || '').toLowerCase();
        const conv = byEmail.get(fromAddr);
        stats.seen++;
        if (!conv) { newIds.push(mid); continue; }
        if (fromAddr === String(user).toLowerCase()) { newIds.push(mid); continue; }

        // La risposta VERA, senza il thread citato sotto.
        const text = SEG.stripQuoted(parsed.text || '');
        if (!text) { newIds.push(mid); continue; }

        if (dry) { stats.turns++; newIds.push(mid); continue; }

        // Il messaggio entra nell'Inbox come ogni altro, poi il turno.
        const at = parsed.date ? new Date(parsed.date) : new Date();
        await fsCreate('messages', {
          conversationId: conv.id, direction: 'in', channel: 'email',
          body: text, by: 'segretaria-mail', source: 'segretaria-mail', at,
        }).catch(() => {});
        await fsPatch('conversations/' + conv.id, {
          lastMessageAt: at, lastDirection: 'in', needsReply: true,
          lastMessagePreview: text.slice(0, 90), updatedAt: at,
        }).catch(() => {});

        let lead = null;
        if (conv.leadId) { try { const l = await fsGet(`leads/${conv.leadId}`); if (l) lead = { id: conv.leadId, ...l }; } catch { /* ignore */ } }
        const r = await segretariaTurn({ cid: conv.id, conv, lead, text, messageId: 'mail_' + SEG.textHash(mid), now: Date.now() });
        if (r && r.sent) stats.turns++;
        if (r && r.escalated) stats.escalated++;
        newIds.push(mid);
      }
    } finally { lock.release(); }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }

  if (!dry && newIds.length) {
    const ids = [...seenIds, ...newIds].slice(-500);
    await fsPatch(MEMORY_DOC, { ids, updatedAt: new Date() }).catch(() => {});
  }
  return stats;
}
