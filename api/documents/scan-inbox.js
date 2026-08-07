// api/documents/scan-inbox.js — LO SMISTATORE via email (cron giornaliero)
//
// Second intake for "mando qualsiasi cosa": forward an email with attached
// documents (F24, fatture, ricevute, contratti…) to the BOOM mailbox and
// they get classified + filed by the same pipeline as the Telegram intake
// (_smista.js). Only emails from TRUSTED senders are processed — the
// operator's own addresses plus DOC_MAIL_FROM — so random inbound mail can
// never write to the archive.
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

const EMPLOYEE = 'smistatore';
const LOOKBACK_DAYS = 7;
const MAX_MESSAGES = 15;
const MAX_AI_CALLS = 10;
const ACCEPTED = /^(application\/pdf|image\/(jpeg|png|webp|gif))/;

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[documents/scan-inbox]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
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
  const user = process.env.PFS_IMAP_USER || process.env.GMAIL_USER;
  const pass = process.env.PFS_IMAP_PASS || process.env.GMAIL_APP_PASS;
  if (!user || !pass) throw new Error('IMAP credentials missing (GMAIL_USER/GMAIL_APP_PASS)');

  const trusted = trustedSenders();
  if (!trusted.length) throw new Error('nessun mittente fidato configurato');

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
  const counts = { emails: 0, filed: 0, needsFiling: 0, alreadyProcessed: 0, skippedAtt: 0 };
  const filedLines = [];
  let aiBudget = MAX_AI_CALLS;

  const client = new ImapFlow({
    host: process.env.PFS_IMAP_HOST || 'imap.gmail.com',
    port: 993, secure: true,
    auth: { user, pass },
    logger: false, socketTimeout: 30000,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uidSet = new Set();
      for (const from of trusted) {
        try { for (const u of (await client.search({ since, from }, { uid: true })) || []) uidSet.add(u); }
        catch { /* single search failing is fine */ }
      }

      const uids = [...uidSet].slice(-MAX_MESSAGES);
      for (const uid of uids) {
        if (aiBudget <= 0) break;
        const msgObj = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msgObj?.source) continue;
        const mail = await simpleParser(msgObj.source);
        const atts = (mail.attachments || []).filter(a => ACCEPTED.test(a.contentType || ''));
        if (!atts.length) continue;
        counts.emails++;

        const mailKey = 'doc_' + crypto.createHash('sha1')
          .update(mail.messageId || `${mail.date}|${mail.subject}`).digest('hex').slice(0, 24);
        const already = await fsGet('docImports/' + mailKey).catch(() => null);
        if (already) { counts.alreadyProcessed++; continue; }

        const hint = [mail.subject, String(mail.text || '').slice(0, 400)].filter(Boolean).join(' — ');
        const results = [];
        for (const att of atts) {
          if (aiBudget <= 0) break;
          if (att.content.length > MAX_DOC_BYTES) { counts.skippedAtt++; results.push({ file: att.filename, ok: false, error: 'too_large' }); continue; }
          aiBudget--;
          if (dry) { results.push({ file: att.filename, ok: true, dry: true }); counts.filed++; continue; }
          try {
            const out = await smistaDocument({
              base64: att.content.toString('base64'),
              mediaType: (att.contentType || '').split(';')[0],
              fileName: att.filename || 'allegato',
              hint,
              origin: 'email',
            });
            counts.filed++;
            if (out.needsFiling) counts.needsFiling++;
            results.push({ file: att.filename, ok: true, label: out.label, property: out.propertyLabel, folder: out.folder });
            filedLines.push(`${out.label}${out.propertyLabel ? ' · ' + out.propertyLabel : ' · da smistare'}`);
          } catch (e) {
            results.push({ file: att.filename, ok: false, error: e.message.slice(0, 120) });
          }
        }

        if (!dry && results.length) {
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
