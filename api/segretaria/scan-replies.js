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
import { fsGet, fsGetMany, fsGetVersioned, fsCommit, fsPatch, fsList, readJson } from '../homie/_lib.js';
import { requireRole } from '../_auth.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportEmployeeHealth } from '../employees/_lib.js';
import { segretariaTurn } from './_core.js';
import { listFollowUps, refreshTrackedFollowUp } from './_follow-up.js';
import { runBudget } from '../_budget.js';
import { emailKey, emailBinding, scopedConversation, importScopedMessage, patchScopedConversation, canonicalEmailConversation } from './_mail-import.js';

const MEMORY_DOC = 'heartbeat/segretaria-mail-memory';
const WINDOW_DAYS = 3;
const MAX_PER_RUN = 8;
const validId = value => typeof value === 'string' && /^[\w.-]{1,180}$/.test(value) && !['.', '..'].includes(value);
const iso = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
const number = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const imapConfigured = () => !!((process.env.PFS_IMAP_USER || process.env.GMAIL_USER)
  && (process.env.PFS_IMAP_PASS || process.env.GMAIL_APP_PASS));
const fail = (code, status = 500) => Object.assign(new Error(code), { status });

// Metadata only: neither an env var nor a Mac heartbeat proves message intake.
async function sourceStatus() {
  const [health, mac] = await Promise.all([fsGet('teamHealth/segretaria'), fsGet('heartbeat/mac')]);
  const stats = health?.stats || {}, checkedAt = iso(stats.checkedAt || health?.lastRunAt);
  const fresh = !!checkedAt && Date.now() - Date.parse(checkedAt) >= 0 && Date.now() - Date.parse(checkedAt) < 30 * 60000;
  const verified = stats.source === 'email' && stats.connected === true;
  const healthy = verified && fresh && health?.ok === true && !stats.incomplete && !stats.skipped && !stats.errors && !stats.trackingErrors;
  const heartbeatAt = iso(mac?.lastSeenAt || mac?.lastPingAt || mac?.updatedAt);
  return { checkedAt: new Date(Date.now()).toISOString(),
    email: { configured: imapConfigured(), connectionVerified: verified, healthy: imapConfigured() && healthy,
      coverage: 'tracked_conversations', windowDays: WINDOW_DAYS, maxPerRun: MAX_PER_RUN, fullMailbox: false,
      lastScan: checkedAt ? { checkedAt, fresh, connected: verified, incomplete: stats.incomplete === true,
        skipped: ['imap_unconfigured', 'no_watched_conversations'].includes(stats.skipped) ? stats.skipped : null,
        failed: health?.ok === false, watched: number(stats.watched), scanned: number(stats.scanned),
        imported: number(stats.imported), deferred: number(stats.deferred), deferredSenders: number(stats.deferredSenders),
        errors: number(stats.errors) + number(stats.trackingErrors) } : null },
    whatsapp: { heartbeatAt, bridgeFresh: !!heartbeatAt && Date.now() - Date.parse(heartbeatAt) >= 0
      && Date.now() - Date.parse(heartbeatAt) < 2 * 60000, ingestionVerified: false } };
}

// Concurrent manual runs share the existing receipts; a last-writer-wins PATCH
// could forget the other run and re-expose an already imported email to the cron.
async function rememberMessages(newIds) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const prior = await fsGetVersioned(MEMORY_DOC);
    const oldIds = Array.isArray(prior?.data.ids) ? prior.data.ids : [];
    const ids = [...new Set([...oldIds, ...newIds])].slice(-500);
    try {
      await fsCommit([{ docPath: MEMORY_DOC, fields: { ids, updatedAt: new Date() },
        precondition: prior ? { updateTime: prior.updateTime } : { exists: false } }]);
      return;
    } catch (error) { if (!error.conflict) throw error; }
  }
  throw fail('email_memory_changed');
}


export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const body = req.method === 'POST' ? await readJson(req) : {};
  if (!body || (body.mode && body.mode !== 'sync_only')) return res.status(400).json({ ok: false, error: 'invalid_mode' });
  const statusOnly = req.method === 'GET' && req.query?.status === '1';
  const syncOnly = body.mode === 'sync_only';
  let actor;
  if (statusOnly || syncOnly) {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;
    actor = 'admin:' + user.uid;
  } else {
    actor = await requireCronOrAdmin(req, res);
    if (!actor) return;
    // The shared PFS guard also grants owners/landlords: a global mailbox is
    // outside their scope. Preserve the existing cron/bridge transport only.
    if (actor.startsWith('admin:')) {
      const profile = await fsGet('users/' + actor.slice(6));
      if (profile?.role !== 'admin') return res.status(403).json({ ok: false, error: 'admin_required' });
    }
  }
  if (syncOnly && !validId(body.conversationId)) return res.status(400).json({ ok: false, error: 'invalid_conversation_id' });
  const dry = req.query?.dry === '1';

  try {
    if (statusOnly) return res.status(200).json({ ok: true, ...(await sourceStatus()) });
    const out = await run({ dry, syncOnly, conversationId: syncOnly ? body.conversationId : null });
    out.checkedAt = new Date(Date.now()).toISOString();
    out.healthy = out.connected && !out.incomplete && !out.errors && !out.trackingErrors;
    if (!dry && !syncOnly) await reportEmployeeHealth('segretaria', { ok: !out.incomplete && !out.errors && !out.trackingErrors, stats: out,
      ...(!out.healthy && out.skipped !== 'no_watched_conversations' ? { error: out.skipped === 'imap_unconfigured'
        ? 'Connessione email non configurata.' : 'Lettura email incompleta; verificare copertura e contatori.' } : {}) });
    return res.status(200).json({ ok: true, actor, dry, mode: syncOnly ? 'sync_only' : 'scheduled',
      ...(syncOnly ? { conversationId: body.conversationId } : {}), ...out });
  } catch (e) {
    const code = ['conversation_not_found', 'conversation_email_missing', 'email_identity_ambiguous', 'email_identity_scan_incomplete',
      'conversation_identity_changed', 'email_message_identity_conflict'].includes(e.message)
      ? e.message : 'email_scan_failed';
    console.error('[segretaria/scan-replies]', code);
    if (!dry && !syncOnly && !statusOnly) await reportEmployeeHealth('segretaria', { ok: false, error: code });
    return res.status(e.status || 500).json({ ok: false, error: code, checkedAt: new Date(Date.now()).toISOString(), incomplete: true });
  }
}

async function run({ dry, syncOnly = false, conversationId = null }) {
  const B = runBudget(60_000, 7_000);
  const COST_SEARCH = 25_000, COST_TURN = 45_000;
  // Reuse the existing cases, including conversations returned to a person.
  // A failed source must not turn a partial identity list into a unique match.
  let convs;
  if (syncOnly) {
    const target = await fsGet('conversations/' + conversationId);
    if (!target) throw fail('conversation_not_found', 404);
    const email = emailKey(target.contactEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('conversation_email_missing', 400);
    // Legacy addresses are not normalized at rest. An exact equality query
    // cannot establish uniqueness across case/space variants. Bound this
    // explicit metadata check; incomplete coverage must not become permission.
    const identityRows = await fsList('conversations', { limit: 500 });
    if (identityRows.length >= 500) throw fail('email_identity_scan_incomplete', 409);
    const matches = identityRows.filter(c => emailKey(c.contactEmail) === email);
    const candidates = new Map(matches.map(c => [c.id, c])); candidates.set(target.id, target);
    const canonical = await canonicalEmailConversation([...candidates.values()]);
    if (canonical?.id !== conversationId || emailBinding(canonical) !== emailBinding(target)) throw fail('email_identity_ambiguous', 409);
    convs = [target];
  } else convs = await fsList('conversations', { filter: { field: 'segretaria', op: 'EQUAL', value: true }, limit: 50 });
  const tracked = syncOnly ? { rows: [], incomplete: false } : await listFollowUps();
  const selected = new Map(convs.map(c => [c.id, c]));
  let missingConversations = 0;
  const trackedIds = [...new Set(tracked.rows.map(t => t.followUp.conversationId))];
  // In blocco (5/10/2026): erano ~190 letture parallele una per una ogni 10
  // minuti — la raffica che faceva ~190 login a token scaduto e i timeout a
  // 60s. Ora richieste da 100 documenti; un errore resta un errore, come prima.
  const toRead = trackedIds.filter(cid => !selected.has(cid));
  const valid = toRead.filter(cid => /^[\w.-]{1,180}$/.test(String(cid || '')));
  missingConversations += toRead.length - valid.length;
  const read = await fsGetMany(valid.map(cid => 'conversations/' + cid));
  for (const cid of valid) {
    const c = read.get('conversations/' + cid);
    if (c) selected.set(cid, c); else missingConversations++;
  }
  const byEmail = new Map();
  for (const c of selected.values()) {
    const e = String(c.contactEmail || '').trim().toLowerCase();
    if (e) byEmail.set(e, [...(byEmail.get(e) || []), c]);
  }
  const ambiguous = [];
  let knownAliases = 0;
  for (const [email, rows] of byEmail) {
    const canonical = syncOnly ? rows[0] : await canonicalEmailConversation(rows);
    if (canonical) { byEmail.set(email, canonical); knownAliases += rows.length - 1; }
    else { ambiguous.push(rows); byEmail.delete(email); }
  }
  const stats = { source: 'email', connected: false, watched: byEmail.size, seen: 0, processed: 0, turns: 0, escalated: 0, refreshed: 0,
    scanned: 0, imported: 0, duplicates: 0, deferred: 0, deferredSenders: 0, errors: 0,
    trackingErrors: 0, incomplete: tracked.incomplete || convs.length >= 50 || missingConversations > 0 || ambiguous.length > 0,
    followUpsIncomplete: tracked.incomplete, missingConversations, knownAliases,
    ambiguousEmails: ambiguous.length, ambiguousConversationIds: ambiguous.flatMap(rows => rows.map(c => c.id)) };
  const user = process.env.PFS_IMAP_USER || process.env.GMAIL_USER;
  const pass = process.env.PFS_IMAP_PASS || process.env.GMAIL_APP_PASS;
  if (!user || !pass) return { ...stats, skipped: 'imap_unconfigured', incomplete: true };
  if (!byEmail.size) return { ...stats, skipped: 'no_watched_conversations' };

  const memory = (await fsGet(MEMORY_DOC).catch(() => { stats.errors++; stats.incomplete = true; return null; })) || {};
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

  let unvisited = 0;
  try {
    await client.connect();
    stats.connected = true;
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uidSet = new Set();
      let searched = 0;
      for (const from of byEmail.keys()) {
        if (!B.afford(COST_SEARCH)) { stats.deferredSenders = byEmail.size - searched; stats.incomplete = true; break; }
        searched++;
        try {
          const uids = await client.search({ since, from }, { uid: true });
          for (const u of uids || []) uidSet.add(u);
        } catch { console.warn('[segretaria/scan-replies] search failed'); stats.errors++; stats.incomplete = true; }
      }
      const uids = [...uidSet].sort((a, b) => a - b).slice(-MAX_PER_RUN * 3);
      unvisited = uids.length;
      stats.deferred = uidSet.size - uids.length;
      if (stats.deferred) stats.incomplete = true;

      for (const [index, uid] of uids.entries()) {
        if (!B.afford(syncOnly ? COST_SEARCH : COST_TURN) || stats.processed >= MAX_PER_RUN) {
          stats.deferred += uids.length - index; stats.incomplete = true; unvisited = 0; break;
        }
        unvisited--;
        stats.scanned++;
        let parsed;
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) { stats.errors++; stats.incomplete = true; continue; }
          parsed = await simpleParser(msg.source);
        } catch { console.warn('[segretaria/scan-replies] parse failed'); stats.errors++; stats.incomplete = true; continue; }

        const mid = String(parsed.messageId || `uid:${uid}`);
        if (seenIds.has(mid)) { stats.duplicates++; continue; }
        const fromAddr = String(parsed.from?.value?.[0]?.address || '').toLowerCase();
        const conv = byEmail.get(fromAddr);
        stats.seen++;
        if (!conv) { newIds.push(mid); continue; }
        if (fromAddr === String(user).toLowerCase()) { newIds.push(mid); continue; }

        // La risposta VERA, senza il thread citato sotto.
        const text = SEG.stripQuoted(parsed.text || '');
        if (!text) { newIds.push(mid); continue; }

        stats.processed++;
        if (dry) { if (!syncOnly && conv.segretaria) stats.turns++; newIds.push(mid); continue; }

        // Il messaggio entra nell'Inbox come ogni altro, poi il turno.
        const at = parsed.date ? new Date(parsed.date) : new Date();
        const eventId = 'mail_' + SEG.textHash(mid);
        const storedId = 'segretaria_mail_' + crypto.createHash('sha256').update(mid).digest('hex');
        const fields = {
          conversationId: conv.id, direction: 'in', channel: 'email',
          body: text, by: 'segretaria-mail', source: 'segretaria-mail', emailMessageId: mid, at,
        };
        // Scheduled intake can also arrive after a newer WhatsApp/Portal reply.
        // Both transports share the identity guard and atomic timestamp check:
        // archive the email without making the conversation appear unanswered.
        const outcome = await importScopedMessage(conv, fields, storedId);
        if (outcome === 'imported') stats.imported++; else stats.duplicates++;
        // A human imported this source for review. A later scan is not permission
        // to enroll a case, prepare a reply, or turn the conversation over to AI.
        if (outcome === 'manual') { newIds.push(mid); continue; }

        try {
          let expectedTaskId, sourceGuards;
          if (syncOnly) {
            sourceGuards = (await scopedConversation(conv)).guards;
            const known = await fsList('operatorTasks', { filter: { field: 'followUp.conversationId', op: 'EQUAL', value: conv.id }, limit: 31 });
            const active = known.filter(t => t.source === 'segretaria' && t.status === 'open' && t.followUp?.open === true);
            if (known.length >= 31 || active.length > 1) throw fail('follow_up_selection_required');
            expectedTaskId = active[0]?.id;
          }
          const followed = syncOnly && !expectedTaskId ? null : await refreshTrackedFollowUp({ cid: conv.id, conv, text,
            messageId: eventId, now: at.getTime(), ...(syncOnly ? { allowEnrollment: false, preserveNewer: true, expectedTaskId, sourceGuards } : {}) });
          if (followed) stats.refreshed++;
          if (conv.followUpTrackingError) {
            if (syncOnly) await patchScopedConversation(conv, { followUpTrackingError: null });
            else await fsPatch('conversations/' + conv.id, { followUpTrackingError: null });
          }
        } catch {
          stats.trackingErrors++;
          stats.incomplete = true;
          const fields = { needsReply: true, followUpTrackingError: 'Email ricevuta; seguito non aggiornato. Verificare il caso in Oggi.' };
          await (syncOnly ? patchScopedConversation(conv, fields) : fsPatch('conversations/' + conv.id, fields)).catch(() => {});
          continue; // No memory acknowledgement or automatic turn; retry next run.
        }

        if (syncOnly) { newIds.push(mid); continue; }

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
  } catch (error) {
    stats.errors++; stats.incomplete = true;
    stats.deferred += unvisited;
    stats.error = ['email_message_identity_conflict', 'conversation_identity_changed'].includes(error.message) ? error.message : 'email_scan_failed';
    console.warn('[segretaria/scan-replies]', stats.error);
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }

  if (!dry && newIds.length) {
    await rememberMessages(newIds).catch(() => { stats.errors++; stats.incomplete = true; });
  }
  return stats;
}
