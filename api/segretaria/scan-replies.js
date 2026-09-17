// api/segretaria/scan-replies.js — la porta EMAIL della Segretaria (cron */10).
//
// La tranche 2 di STUDIO_SEGRETARIA: i lead dei portali spesso non hanno un
// numero — la Segretaria apre via email (segretariaOpen) e le RISPOSTE del
// cliente tornano nella casella Gmail. Questo cron le raccoglie e le
// consegna allo stesso turno del canale WhatsApp.
//
// Il perimetro è STRETTO di proposito: si leggono SOLO le email dei mittenti
// che corrispondono a conversazioni CONSEGNATE o con un seguito APERTO,
// con contactEmail. Seguire un caso non autorizza una risposta automatica.
// Il resto della casella non ci riguarda — i lead nuovi li
// fa già leads/scan-inbox, i documenti documents/scan-inbox, la banca il suo.
// Nessuna conversazione consegnata via email ⇒ il run costa una query e basta.
//
// Idempotente per costruzione: Message-ID ricordati in
// heartbeat/segretaria-mail-memory (cap 500) + il contextHash del turno.
// Heartbeat teamHealth/segretaria (allerta Telegram esistente dopo 3 run
// falliti). Auth come i cron PFS; `?dry=1` conta senza scrivere.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import crypto from 'node:crypto';
import SEG from '../../js/segretaria-engine.js';
import { fsGet, fsPatch, fsCreate, fsList } from '../homie/_lib.js';
import { normalizePhone } from '../homie/_lead.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportEmployeeHealth } from '../employees/_lib.js';
import { segretariaTurn } from './_core.js';
import { listFollowUps, refreshTrackedFollowUp } from './_follow-up.js';
import { runBudget } from '../_budget.js';

const MEMORY_DOC = 'heartbeat/segretaria-mail-memory';
const WINDOW_DAYS = 3;
const MAX_PER_RUN = 8;

// Handover deliberately marks both the primary lead conversation and its
// historical WhatsApp alias. Only that exact persisted binding is one person.
async function canonicalEmailConversation(rows) {
  if (rows.length === 1) return rows[0];
  const leadIds = rows.map(c => c.leadId || (c.contactType === 'lead' ? c.contactId : null));
  const leadId = leadIds[0];
  if (typeof leadId !== 'string' || !/^[\w.-]{1,180}$/.test(leadId)
      || leadIds.some(id => id !== leadId)
      || rows.some(c => !['lead', 'whatsapp'].includes(c.contactType)
        || (c.contactType === 'lead' && c.contactId !== leadId))) return null;
  const primaryId = 'conv_lead_' + leadId.replace(/[^A-Za-z0-9_-]/g, '');
  const primary = rows.find(c => c.id === primaryId && c.contactType === 'lead' && c.contactId === leadId);
  if (!primary) return null;
  const lead = await fsGet('leads/' + leadId);
  if (!lead) return null;
  const phones = new Set([...rows.map(c => c.contactPhone), lead.phone].filter(Boolean).map(normalizePhone));
  const emails = new Set([...rows.map(c => c.contactEmail), lead.email].filter(Boolean).map(e => String(e).trim().toLowerCase()));
  const uids = new Set(rows.map(c => c.contactUid).filter(Boolean));
  return phones.size > 1 || emails.size > 1 || uids.size > 1 ? null : primary;
}

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry });
    if (!dry) await reportEmployeeHealth('segretaria', { ok: !out.trackingErrors, stats: out,
      ...(out.trackingErrors ? { error: 'Messaggi ricevuti; seguito non aggiornato, riprova al prossimo giro.' } : {}) });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[segretaria/scan-replies]', e);
    if (!dry) await reportEmployeeHealth('segretaria', { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry }) {
  const B = runBudget(60_000, 7_000);
  const COST_SEARCH = 25_000, COST_TURN = 45_000;
  // Reuse the existing cases, including conversations returned to a person.
  // A failed source must not turn a partial identity list into a unique match.
  const convs = await fsList('conversations', { filter: { field: 'segretaria', op: 'EQUAL', value: true }, limit: 50 });
  const tracked = await listFollowUps();
  const selected = new Map(convs.map(c => [c.id, c]));
  let missingConversations = 0;
  const trackedIds = [...new Set(tracked.rows.map(t => t.followUp.conversationId))];
  await Promise.all(trackedIds.filter(cid => !selected.has(cid)).map(async cid => {
    if (!/^[\w.-]{1,180}$/.test(String(cid || ''))) { missingConversations++; return; }
    const c = await fsGet('conversations/' + cid);
    if (c) selected.set(cid, c); else missingConversations++;
  }));
  const byEmail = new Map();
  for (const c of selected.values()) {
    const e = String(c.contactEmail || '').trim().toLowerCase();
    if (e) byEmail.set(e, [...(byEmail.get(e) || []), c]);
  }
  const ambiguous = [];
  let knownAliases = 0;
  for (const [email, rows] of byEmail) {
    const canonical = await canonicalEmailConversation(rows);
    if (canonical) { byEmail.set(email, canonical); knownAliases += rows.length - 1; }
    else { ambiguous.push(rows); byEmail.delete(email); }
  }
  const stats = { watched: byEmail.size, seen: 0, processed: 0, turns: 0, escalated: 0, refreshed: 0,
    trackingErrors: 0, incomplete: tracked.incomplete || convs.length >= 50 || missingConversations > 0,
    followUpsIncomplete: tracked.incomplete, missingConversations, knownAliases,
    ambiguousEmails: ambiguous.length, ambiguousConversationIds: ambiguous.flatMap(rows => rows.map(c => c.id)) };
  if (!byEmail.size) return stats;

  const user = process.env.PFS_IMAP_USER || process.env.GMAIL_USER;
  const pass = process.env.PFS_IMAP_PASS || process.env.GMAIL_APP_PASS;
  if (!user || !pass) return { ...stats, skipped: 'imap_unconfigured' };

  const memory = (await fsGet(MEMORY_DOC).catch(() => null)) || {};
  const seenIds = new Set(Array.isArray(memory.ids) ? memory.ids : []);
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000);
  // Vedi api/_budget.js: il residuo deve coprire il COSTO del passo, non
  // solo essere positivo (un turno = fetch IMAP 25s + una chiamata al modello).
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
        if (!B.afford(COST_SEARCH)) break;
        try {
          const uids = await client.search({ since, from }, { uid: true });
          for (const u of uids || []) uidSet.add(u);
        } catch { console.warn('[segretaria/scan-replies] search failed'); stats.incomplete = true; }
      }
      const uids = [...uidSet].sort((a, b) => a - b).slice(-MAX_PER_RUN * 3);

      for (const uid of uids) {
        if (!B.afford(COST_TURN) || stats.processed >= MAX_PER_RUN) break;
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

        stats.processed++;
        if (dry) { if (conv.segretaria) stats.turns++; newIds.push(mid); continue; }

        // Il messaggio entra nell'Inbox come ogni altro, poi il turno.
        const at = parsed.date ? new Date(parsed.date) : new Date();
        const eventId = 'mail_' + SEG.textHash(mid);
        const storedId = 'segretaria_mail_' + crypto.createHash('sha256').update(mid).digest('hex');
        try { await fsCreate('messages', {
          conversationId: conv.id, direction: 'in', channel: 'email',
          body: text, by: 'segretaria-mail', source: 'segretaria-mail', emailMessageId: mid, at,
        }, storedId); }
        catch (e) {
          if (!e.exists) throw e;
          const prior = await fsGet('messages/' + storedId);
          if (prior?.conversationId !== conv.id || prior.emailMessageId !== mid || prior.body !== text)
            throw new Error('email_message_identity_conflict');
        }
        await fsPatch('conversations/' + conv.id, {
          lastMessageAt: at, lastDirection: 'in', needsReply: true,
          lastMessagePreview: text.slice(0, 90), updatedAt: at,
        });

        try {
          const followed = await refreshTrackedFollowUp({ cid: conv.id, conv, text, messageId: eventId, now: at.getTime() });
          if (followed) stats.refreshed++;
          if (conv.followUpTrackingError) await fsPatch('conversations/' + conv.id, { followUpTrackingError: null });
        } catch {
          stats.trackingErrors++;
          await fsPatch('conversations/' + conv.id, { needsReply: true,
            followUpTrackingError: 'Email ricevuta; seguito non aggiornato. Verificare il caso in Oggi.' }).catch(() => {});
          continue; // No memory acknowledgement or automatic turn; retry next run.
        }

        // Recheck the actual handover: watching an open case is never consent
        // for a model call, an email, or a WhatsApp action.
        const current = await fsGet('conversations/' + conv.id);
        if (!current?.segretaria) { newIds.push(mid); continue; }

        let lead = null;
        if (conv.leadId) { try { const l = await fsGet(`leads/${conv.leadId}`); if (l) lead = { id: conv.leadId, ...l }; } catch { /* ignore */ } }
        const r = await segretariaTurn({ cid: conv.id, conv: current, lead, text, messageId: eventId, now: Date.now() });
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
