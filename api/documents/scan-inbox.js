// api/documents/scan-inbox.js — LO SMISTATORE via email (cron giornaliero)
//
// Second intake for "mando qualsiasi cosa": forward an email with attached
// documents (F24, fatture, ricevute, contratti…) to the BOOM mailbox and
// they get classified + filed by the same pipeline as the Telegram intake
// (_smista.js). Only emails from TRUSTED senders are processed — the
// operator's own addresses plus DOC_MAIL_FROM, or verified landlord/tenant
// relations — so random inbound mail can never write to the archive.
//
// Processed emails are remembered in `docImports/<hash>` (attachments are
// never re-classified). Per-run AI budget caps cost. Telegram recap when
// something is filed.
//
// Env: PFS_IMAP_USER/PASS override GMAIL_USER/GMAIL_APP_PASS (IMAP read).
//      DOC_MAIL_FROM — extra trusted sender addresses/domains, comma-sep
//      (e.g. "commercialista@studiorossi.it").
//
// Auth: cron secret / X-Homie-Secret / admin ID token. `?dry=1` lists what
// would be filed without writing.

import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { fsGet, fsPatch } from '../homie/_lib.js';
import { requireCronOrAdmin, reportEmployeeHealth, saveReport, tgNotify } from '../employees/_lib.js';
import { smistaDocument, MAX_DOC_BYTES } from './_smista.js';
import { loadDocumentRelations, documentRelation, documentEmail } from '../homie/message.js';
import { runBudget } from '../_budget.js';

const EMPLOYEE = 'smistatore';
const LOOKBACK_DAYS = 7;
const MAX_MESSAGES = 15;
const MAX_AI_CALLS = 10;
const ACCEPTED = /^(application\/pdf|image\/(jpeg|png|webp|gif))$/;

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[documents/scan-inbox] failed');
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: 'scan_failed' });
    return res.status(500).json({ ok: false, error: 'scan_failed' });
  }
}

function trustedSenders() {
  const set = new Set();
  [process.env.GMAIL_USER, process.env.PFS_IMAP_USER, process.env.FIREBASE_ADMIN_EMAIL, process.env.ACCOUNTING_EMAIL]
    .filter(Boolean).forEach(a => set.add(String(a).toLowerCase().trim()));
  String(process.env.DOC_MAIL_FROM || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    .forEach(a => set.add(a));
  return [...set];
}

async function run({ dry }) {
  const budget = runBudget(60_000, 6_000);
  const user = process.env.PFS_IMAP_USER || process.env.GMAIL_USER;
  const pass = process.env.PFS_IMAP_PASS || process.env.GMAIL_APP_PASS;
  if (!user || !pass) throw new Error('IMAP credentials missing (GMAIL_USER/GMAIL_APP_PASS)');

  const trusted = trustedSenders();
  if (!trusted.length) throw new Error('nessun mittente fidato configurato');
  let archive = null;
  try { archive = await loadDocumentRelations(); }
  catch { console.warn('[documents/scan-inbox] relations unavailable'); }
  const relatedEmails = archive ? [
    ...archive.landlords.map(p => p.email),
    ...archive.users.filter(p => ['tenant', 'landlord'].includes(p.role)).map(p => p.email),
    ...archive.contracts.flatMap(c => [c.landlordEmail, c.tenantEmail]),
  ].map(documentEmail).filter(Boolean) : [];
  const searchSenders = [...new Set([...trusted, ...relatedEmails])];

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
  const counts = { emails: 0, filed: 0, needsFiling: 0, alreadyProcessed: 0, skippedAtt: 0, deferred: 0 };
  const filedLines = [];
  let aiBudget = MAX_AI_CALLS;

  const client = new ImapFlow({
    host: process.env.PFS_IMAP_HOST || 'imap.gmail.com',
    port: 993, secure: true,
    auth: { user, pass },
    logger: false, socketTimeout: 25000,
    // i default imapflow (connect 90s) superano il limite piattaforma:
    // lo stallo diventava un kill senza battito
    connectionTimeout: 15000, greetingTimeout: 10000,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uidSet = new Set();
      for (const from of searchSenders) {
        if (!budget.afford(25_000)) break;
        try { for (const u of (await client.search({ since, from }, { uid: true })) || []) uidSet.add(u); }
        catch { /* single search failing is fine */ }
      }

      const uids = [...uidSet].slice(-MAX_MESSAGES);
      for (const uid of uids) {
        if (aiBudget <= 0 || !budget.afford(25_000)) { counts.deferred++; break; }
        const msgObj = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msgObj?.source) continue;
        const mail = await simpleParser(msgObj.source);
        // IMAP FROM è una ricerca, NON un'autorizzazione: ricontrolla
        // l'indirizzo completo e rifiuta From multipli/ambigui.
        const from = mail.from?.value || [];
        if (from.length !== 1) continue;
        const sender = documentEmail(from[0].address);
        if (!sender) continue;
        const operator = trusted.some(t => sender === t || (!t.includes('@') && sender.endsWith('@' + t)));
        const relation = archive ? documentRelation(archive, { email: sender }) : null;
        if (!operator && !relation) continue;
        const atts = (mail.attachments || []).filter(a => ACCEPTED.test((a.contentType || '').split(';')[0].trim().toLowerCase()));
        if (!atts.length) continue;
        counts.emails++;

        const messageKey = mail.messageId || crypto.createHash('sha1').update(msgObj.source).digest('hex');
        const mailKey = 'doc_' + crypto.createHash('sha1')
          .update(messageKey).digest('hex').slice(0, 24);
        const already = await fsGet('docImports/' + mailKey).catch(() => null);
        if (already) { counts.alreadyProcessed++; continue; }

        const linkHint = relation ? `Relazione: ${relation.label}; immobili: ${relation.propertyIds.join(', ')}; contratti: ${relation.contractIds.join(', ')}.` : '';
        const hint = [linkHint, mail.subject, String(mail.text || '').slice(0, 400)].filter(Boolean).join(' — ');
        const results = [];
        let complete = true;
        const names = new Map();
        for (const att of atts) {
          if (aiBudget <= 0 || !budget.afford(40_000)) { complete = false; counts.deferred++; break; }
          if (att.content.length > MAX_DOC_BYTES) { counts.skippedAtt++; results.push({ file: att.filename, ok: false, error: 'too_large' }); continue; }
          aiBudget--;
          if (dry) { results.push({ file: att.filename, ok: true, dry: true }); counts.filed++; continue; }
          try {
            const fileName = att.filename || 'allegato';
            const occurrence = names.get(fileName) || 0;
            names.set(fileName, occurrence + 1);
            const docId = 'em_' + crypto.createHash('sha1')
              .update(messageKey + fileName + (occurrence ? `#${occurrence}` : '')).digest('hex');
            const out = await smistaDocument({
              base64: att.content.toString('base64'),
              mediaType: (att.contentType || '').split(';')[0].trim().toLowerCase(),
              fileName,
              hint,
              origin: 'email',
              docId,
              relation: relation || { kind: 'operator' },
            });
            if (out.duplicate) { results.push({ file: fileName, ok: true, duplicate: true }); continue; }
            counts.filed++;
            if (out.needsFiling) counts.needsFiling++;
            results.push({ file: att.filename, ok: true, label: out.label, property: out.propertyLabel, folder: out.folder });
            filedLines.push(`${out.label}${out.propertyLabel ? ' · ' + out.propertyLabel : ' · da smistare'}`);
          } catch {
            complete = false;
            results.push({ file: att.filename, ok: false, error: 'attachment_failed' });
          }
        }

        if (!dry && complete && results.length) {
          await fsPatch('docImports/' + mailKey, {
            subject: String(mail.subject || '').slice(0, 200),
            from: mail.from?.value?.[0]?.address || null,
            date: mail.date || null,
            processedAt: new Date(),
            results,
          });
        }
      }
    } finally { lock.release(); }
  } finally {
    await client.logout().catch(() => {});
  }

  const summary = counts.filed
    ? `${counts.filed} documenti archiviati dall'email${counts.needsFiling ? ` (${counts.needsFiling} da assegnare a un immobile)` : ''}`
    : 'Nessun nuovo documento in casella';

  if (!dry && counts.filed) {
    await saveReport(EMPLOYEE, { summary, counts, filed: filedLines.slice(0, 10) });
    await tgNotify(
      `📁📬 <b>Smistatore — documenti archiviati dall'email</b>\n` +
      filedLines.slice(0, 8).map(l => `• ${l}`).join('\n') +
      (counts.needsFiling ? `\n🤔 ${counts.needsFiling} senza immobile riconosciuto → portale, Archivio` : '')
    );
  }
  return { counts, summary };
}
