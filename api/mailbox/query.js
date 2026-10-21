// Explicit admin mailbox reads, confirmed import and manual contact admission.
// No flags, attachments, models, automatic enrollment or outbound operations.
import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { bearerFrom, verifyIdToken } from '../_auth.js';
import { fsGet, readJson } from '../homie/_lib.js';
import SEG from '../../js/segretaria-engine.js';
import { MailImportError, emailKey, emailBinding, canonicalEmailConversation, importScopedMessage } from '../segretaria/_mail-import.js';
import { admitMailboxMessage, matchingEmailConversations } from './_admission.js';

const DEADLINE_MS = 20000, PAGE_SIZE = 20, BODY_BYTES = 256 * 1024, REF_TTL = 15 * 60000;
const SAFE_ERROR = Symbol('mailbox-error');
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status, [SAFE_ERROR]: true });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const uidOK = value => Number.isSafeInteger(value) && value > 0 && value <= 4294967295;
const validId = value => typeof value === 'string' && /^[\w.-]{1,180}$/.test(value) && !['.', '..'].includes(value);
const addressOK = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const addresses = values => (Array.isArray(values) ? values : []).slice(0, 100).map(a => ({ name: String(a.name || '').slice(0, 300), address: String(a.address || '').slice(0, 320) }));

function configuration() {
  // Do not silently switch to a different mailbox when Gmail is half configured.
  const gmail = !!(process.env.GMAIL_USER || process.env.GMAIL_APP_PASS);
  const account = (gmail ? process.env.GMAIL_USER : process.env.PFS_IMAP_USER)?.trim();
  const pass = gmail ? process.env.GMAIL_APP_PASS : process.env.PFS_IMAP_PASS;
  const host = gmail ? 'imap.gmail.com' : process.env.PFS_IMAP_HOST || 'imap.gmail.com';
  if (!account || !pass) throw fail('mailbox_unconfigured', 503);
  const scope = hash(JSON.stringify([host, account]));
  // Purpose-separated from the IMAP password; neither key nor password leaves server.
  const key = crypto.createHmac('sha256', pass).update('boom:mailbox-read:v1:' + scope).digest();
  return { account, pass, host, scope, key };
}

function sign(data, cfg, actor) {
  const payload = Buffer.from(JSON.stringify({ ...data, v: 1, scope: cfg.scope, actor, expires: Date.now() + REF_TTL })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', cfg.key).update(payload).digest('base64url');
}

function verify(token, type, cfg, actor) {
  if (typeof token !== 'string' || token.length > 4096 || !/^[\w-]+\.[\w-]+$/.test(token)) throw fail('invalid_reference');
  const [payload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', cfg.key).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw fail('invalid_reference');
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw fail('invalid_reference'); }
  if (data.v !== 1 || data.type !== type || data.scope !== cfg.scope || data.actor !== actor
      || !Number.isSafeInteger(data.expires) || data.expires <= Date.now() || data.expires > Date.now() + REF_TTL
      || typeof data.folder !== 'string' || !data.folder || !/^\d+$/.test(data.validity)) throw fail('invalid_reference');
  return data;
}

function metadata(row, messageRef) {
  const envelope = row.envelope || {};
  const date = new Date(envelope.date || row.internalDate || NaN);
  return { messageRef, from: addresses(envelope.from), to: addresses(envelope.to), replyTo: addresses(envelope.replyTo), subject: String(envelope.subject || '').slice(0, 2000),
    at: Number.isFinite(date.getTime()) ? date.toISOString() : null, size: Number.isFinite(row.size) ? row.size : null,
    hasAttachments: hasAttachments(row.bodyStructure) };
}

function importSource(row, text, account) {
  const envelope = row.envelope || {}, own = emailKey(account);
  const from = (envelope.from || []).map(a => emailKey(a.address));
  const replyTo = (envelope.replyTo || []).map(a => emailKey(a.address));
  const recipients = [...(envelope.to || []), ...(envelope.cc || [])].map(a => emailKey(a.address));
  const block = reason => ({ importable: false, importBlockReason: reason });
  if (from.length !== 1 || !addressOK(from[0]) || replyTo.length > 1 || replyTo.some(a => !addressOK(a)))
    return block('email_sender_ambiguous');
  const candidate = replyTo[0] || from[0];
  if (from[0] === own || candidate === own || !recipients.includes(own)) return block('email_not_inbound');
  const mid = typeof envelope.messageId === 'string' ? envelope.messageId.trim() : '';
  if (!mid || mid.length > 998 || /[\u0000-\u0020\u007f]/.test(mid)) return block('email_message_id_missing');
  if (text.truncated || text.bodyUnavailable || !text.text?.trim()) return block('email_body_incomplete');
  const at = new Date(envelope.date || row.internalDate || NaN);
  if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now()) return block('email_date_invalid');
  const body = SEG.stripQuoted(text.text);
  if (!body) return block('email_body_incomplete');
  return { importable: true, importBlockReason: null, mid, candidate, body, at };
}

async function importMessage({ row, text, source, proof, cfg, actor, conversationId, admission, run, beforeCommit }) {
  const mail = importSource(row, text, cfg.account);
  if (!mail.importable) throw fail(mail.importBlockReason, 409);
  if (admission && emailKey(admission.confirmedEmail) !== mail.candidate) throw fail('email_confirmation_changed', 409);
  const messageId = 'segretaria_mail_' + hash(mail.mid);
  const fields = {
    conversationId, direction: 'in', channel: 'email', body: mail.body, at: mail.at,
    by: 'segretaria-mail', source: 'segretaria-mail', emailMessageId: mail.mid,
    subject: String(row.envelope?.subject || '').slice(0, 2000),
    mailboxSource: { mode: 'manual', account: source.account, folder: source.folder,
      uidValidity: proof.validity, uid: proof.uid, from: addresses(row.envelope?.from),
      replyTo: addresses(row.envelope?.replyTo), subject: String(row.envelope?.subject || '').slice(0, 2000),
      text: text.text, importedBy: actor,
      importedAt: new Date().toISOString() },
  };
  if (admission) return admitMailboxMessage({ email: mail.candidate, name: admission.contactName, actor,
    fields, messageId, run, beforeCommit });
  const conv = await run(() => fsGet('conversations/' + conversationId));
  if (!conv) throw fail('conversation_not_found', 404);
  if (conv.segretaria === true) throw fail('conversation_automated', 409);
  if (conv.conversationBindingConflict || conv.conversationBindingStatus === 'unavailable')
    throw fail('conversation_identity_changed', 409);
  if (emailKey(conv.contactEmail) !== mail.candidate) throw fail('email_contact_mismatch', 409);
  // Mirror the existing sync-only uniqueness check, including legacy case/space variants.
  const matches = await matchingEmailConversations(mail.candidate, run);
  const candidates = new Map(matches.map(c => [c.id, c])); candidates.set(conv.id, conv);
  const canonical = await run(() => canonicalEmailConversation([...candidates.values()]));
  if (canonical?.id !== conversationId || emailBinding(canonical) !== emailBinding(conv))
    throw fail('email_identity_ambiguous', 409);
  const outcome = await run(() => importScopedMessage(conv, fields, messageId, { manualOnly: true, beforeCommit }));
  return { conversationId, messageId, imported: outcome === 'imported', duplicate: outcome !== 'imported' };
}

function attached(node) {
  return node?.disposition?.toLowerCase() === 'attachment' || !!node?.dispositionParameters?.filename || !!node?.parameters?.name;
}
function hasAttachments(node) {
  return !!node && (attached(node) || node.type === 'message/rfc822' || (node.childNodes || []).some(hasAttachments));
}
function textParts(node, out = []) {
  if (!node || attached(node) || node.type === 'message/rfc822') return out;
  if (['text/plain', 'text/html'].includes(node.type?.toLowerCase())) out.push(node);
  else for (const child of node.childNodes || []) textParts(child, out);
  return out;
}

async function readText(client, row, run) {
  const parts = textParts(row.bodyStructure), part = parts.find(p => p.type.toLowerCase() === 'text/plain') || parts[0];
  if (!part) return { text: '', truncated: false, bodyUnavailable: true };
  // A single-part message has no numeric part: TEXT excludes its headers.
  const key = part.part || 'TEXT';
  if (!/^(?:\d+(?:\.\d+)*|TEXT)$/.test(key)) return { text: '', truncated: false, bodyUnavailable: true };
  const body = await run(() => client.fetchOne(String(row.uid), { uid: true, bodyParts: [{ key, start: 0, maxLength: BODY_BYTES }] }, { uid: true }));
  const buffer = body?.bodyParts?.get(key.toLowerCase());
  if (!Buffer.isBuffer(buffer)) return { text: '', truncated: false, bodyUnavailable: true };
  const limited = buffer.subarray(0, BODY_BYTES), charset = String(part.parameters?.charset || 'utf-8');
  const encoding = String(part.encoding || '7bit').toLowerCase();
  if (!/^[\w.-]{1,50}$/.test(charset) || !['7bit', '8bit', 'binary', 'base64', 'quoted-printable'].includes(encoding))
    return { text: '', truncated: false, bodyUnavailable: true };
  // Parse only the selected text part, never the original multipart source.
  const headers = `Content-Type: ${part.type.toLowerCase()}; charset=${charset}\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n`;
  const parsed = await run(() => simpleParser(Buffer.concat([Buffer.from(headers), limited]), { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true }));
  const text = typeof parsed.text === 'string' ? parsed.text : '';
  const utf8 = Buffer.from(text);
  return { text: utf8.length > BODY_BYTES ? utf8.subarray(0, BODY_BYTES).toString('utf8').replace(/\uFFFD$/, '') : text,
    truncated: buffer.length >= BODY_BYTES || Number(part.size) > limited.length || utf8.length > BODY_BYTES || parts.filter(p => p.type.toLowerCase() === part.type.toLowerCase()).length > 1,
    bodyUnavailable: !text };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const deadline = Date.now() + DEADLINE_MS;
  let client, lock, stopped = false;
  const close = () => { try { client?.close(); } catch { /* No secondary IO on shutdown. */ } };
  // Includes auth/Firestore, connection, search, body parsing and every new IO.
  const run = async operation => {
    if (stopped || Date.now() >= deadline) throw fail('mailbox_timeout', 504);
    let timer;
    try {
      const result = await Promise.race([Promise.resolve().then(() => {
        if (stopped || Date.now() >= deadline) throw fail('mailbox_timeout', 504);
        return operation();
      }), new Promise((_, reject) => { timer = setTimeout(() => { stopped = true; close(); reject(fail('mailbox_timeout', 504)); }, deadline - Date.now()); })]);
      if (stopped || Date.now() >= deadline) throw fail('mailbox_timeout', 504);
      return result;
    } finally { clearTimeout(timer); }
  };
  try {
    const token = bearerFrom(req);
    if (!token) throw fail('invalid_or_expired_token', 401);
    const user = await run(() => verifyIdToken(token));
    if (!user) throw fail('invalid_or_expired_token', 401);
    const profile = await run(() => fsGet('users/' + user.localId));
    if (profile?.role !== 'admin') throw fail('admin_required', 403);
    const body = await run(() => readJson(req));
    if (!body || !['search', 'read', 'import', 'admit'].includes(body.action)) throw fail('invalid_action');
    const selectedMessage = ['read', 'import', 'admit'].includes(body.action);
    if (body.action === 'import' && !validId(body.conversationId)) throw fail('invalid_conversation_id');
    if (body.action === 'admit') {
      if (typeof body.confirmedEmail !== 'string' || !addressOK(body.confirmedEmail.trim()) || body.confirmedEmail.length > 320)
        throw fail('email_contact_confirmation_required');
      if (body.contactName != null && (typeof body.contactName !== 'string' || body.contactName.length > 150 || /[\u0000-\u001f\u007f]/.test(body.contactName)))
        throw fail('invalid_contact_name');
    }
    const query = typeof body.query === 'string' ? body.query.trim().replace(/ +/g, ' ') : '';
    if (body.action === 'search' && (query.length < 3 || query.length > 160 || /[\u0000-\u001f\u007f]/.test(query))) throw fail('invalid_query');
    const cfg = configuration();
    const proof = selectedMessage ? verify(body.messageRef, 'message', cfg, user.localId)
      : body.cursor ? verify(body.cursor, 'cursor', cfg, user.localId) : null;
    if (proof && (selectedMessage ? !uidOK(proof.uid) : proof.query !== hash(query) || !uidOK(proof.before))) throw fail('invalid_reference');
    client = new ImapFlow({ host: cfg.host, port: 993, secure: true, auth: { user: cfg.account, pass: cfg.pass },
      logger: false, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
    client.on('error', () => {}); // Sanitized handler response; no mailbox contents in logs.
    await run(() => client.connect());
    const folders = await run(() => client.list());
    const all = folders.filter(f => f.specialUse === '\\All' && !f.flags?.has('\\Noselect'));
    const folder = all.length === 1 ? all[0].path : 'INBOX';
    if (proof && proof.folder !== folder) throw fail('mailbox_changed', 409);
    lock = await run(() => client.getMailboxLock(folder, { readOnly: true }));
    const validity = client.mailbox?.uidValidity?.toString();
    if (!validity || !/^\d+$/.test(validity) || client.mailbox?.readOnly !== true) throw fail('mailbox_unavailable', 503);
    if (proof && proof.validity !== validity) throw fail('mailbox_changed', 409);
    const source = { account: cfg.account, folder, coverage: all.length === 1 ? 'all-mail' : 'inbox-only' };
    const ref = uid => sign({ type: 'message', folder, validity, uid }, cfg, user.localId);
    const fetchShape = { uid: true, envelope: true, internalDate: true, size: true, bodyStructure: true };
    if (selectedMessage) {
      const row = await run(() => client.fetchOne(String(proof.uid), fetchShape, { uid: true }));
      if (!row || row.uid !== proof.uid) throw fail('message_not_found', 404);
      const text = await readText(client, row, run);
      if (body.action === 'import' || body.action === 'admit') {
        const result = await importMessage({ row, text, source, proof, cfg, actor: user.localId,
          conversationId: body.conversationId, admission: body.action === 'admit'
            ? { confirmedEmail: body.confirmedEmail, contactName: body.contactName?.trim() } : null, run,
          beforeCommit: () => { if (stopped || Date.now() >= deadline) throw fail('mailbox_timeout', 504); } });
        return res.status(200).json({ ok: true, ...result, source, checkedAt: new Date().toISOString() });
      }
      const { importable, importBlockReason, candidate } = importSource(row, text, cfg.account);
      return res.status(200).json({ ok: true, message: { ...metadata(row, body.messageRef), ...text, importable, importBlockReason,
        importContact: importable ? candidate : null }, source, checkedAt: new Date().toISOString() });
    }
    // TEXT is a literal IMAP string covering headers/body, never gmraw/operators.
    const found = await run(() => client.search({ text: query, ...(proof ? { uid: '1:' + (proof.before - 1) } : {}) }, { uid: true }));
    if (!Array.isArray(found)) throw fail('mailbox_unavailable', 503);
    const uids = [...new Set(found.filter(uidOK))].filter(uid => !proof || uid < proof.before).sort((a, b) => b - a);
    const selected = uids.slice(0, PAGE_SIZE);
    const rows = selected.length ? await run(() => client.fetchAll(selected.join(','), fetchShape, { uid: true })) : [];
    const byId = new Map(rows.filter(row => selected.includes(row.uid)).map(row => [row.uid, row]));
    const items = selected.filter(uid => byId.has(uid)).map(uid => metadata(byId.get(uid), ref(uid)));
    const nextCursor = uids.length > PAGE_SIZE ? sign({ type: 'cursor', folder, validity, query: hash(query), before: selected[selected.length - 1] }, cfg, user.localId) : null;
    return res.status(200).json({ ok: true, items, source, nextCursor, incomplete: items.length !== selected.length, checkedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof MailImportError)
      return res.status(error.status).json({ ok: false, error: error.message, ...error.details, checkedAt: new Date().toISOString() });
    return res.status(error[SAFE_ERROR] ? error.status : 503).json({ ok: false, error: error[SAFE_ERROR] ? error.code : 'mailbox_unavailable', checkedAt: new Date().toISOString() });
  } finally {
    stopped = true;
    try { lock?.release(); } catch { /* close below */ }
    close();
  }
}
