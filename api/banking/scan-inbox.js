// api/banking/scan-inbox.js — estratti conto via EMAIL (cron giornaliero)
//
// The automatic bank feed that needs NO open-banking API and no consent
// renewals — vital now that GoCardless Bank Account Data is closed to new
// signups. Every Italian home banking can send (or the operator can
// forward) the periodic statement by email. This cron reads the Gmail
// mailbox over IMAP (same infrastructure as the PFS radar), finds
// statement attachments and ingests them:
//
//   • CSV / TXT  → parsed directly (`parseBankCsv`, same column auto-detect
//                  as the manual import)
//   • PDF        → Claude (haiku) extracts the movement list server-side
//                  (same raw-fetch pattern as api/documents/ocr.js)
//
// Then the ONE shared pipeline: categorize → dedupe by content hash →
// reconcile credits against pending `payments` (safe match → paid,
// uncertain → suggestion in /banca). Every processed email is remembered
// in `bankImports/<hash>` so a PDF is never re-OCR'd; the tx-level dedupe
// makes even a forced re-run a no-op.
//
// Come si usa (one-time): nell'home banking attiva l'invio periodico
// dell'estratto conto (CSV o PDF) alla casella Gmail di BOOM — oppure
// inoltra l'email quando arriva. Nient'altro.
//
// Env: PFS_IMAP_USER/PASS override GMAIL_USER/GMAIL_APP_PASS (as in
// api/pfs/scan-inbox.js). Optional BANK_MAIL_FROM: comma-separated sender
// filters (e.g. "intesasanpaolo.com,fineco.it") searched IN ADDITION to
// the subject keywords.
//
// Auth: cron secret / X-Homie-Secret / admin ID token. `?dry=1` lists what
// would be imported without writing.

import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { parseBankCsv, ingestBankTransactions, fsGet, fsPatch } from './_lib.js';
import { requireCronOrAdmin, reportEmployeeHealth, saveReport, tgNotify } from '../employees/_lib.js';
import { extractJson } from '../agent/_claude.js';

const EMPLOYEE = 'banca-mail';
const LOOKBACK_DAYS = 7;
const MAX_MESSAGES = 10;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const OCR_MODEL = 'claude-haiku-4-5-20251001';
const SUBJECTS = ['estratto conto', 'lista movimenti', 'movimenti conto', 'rendiconto', 'account statement', 'estratto di conto'];

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[banking/scan-inbox]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry }) {
  const user = process.env.PFS_IMAP_USER || process.env.GMAIL_USER;
  const pass = process.env.PFS_IMAP_PASS || process.env.GMAIL_APP_PASS;
  if (!user || !pass) throw new Error('IMAP credentials missing (GMAIL_USER/GMAIL_APP_PASS)');

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
  const counts = { emails: 0, attachments: 0, imported: 0, skippedTx: 0, matched: 0, suggested: 0, alreadyProcessed: 0, pdfOcr: 0 };
  const details = [];

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
      // Subject-keyword searches + optional sender filters, merged.
      const uidSet = new Set();
      for (const subject of SUBJECTS) {
        try { for (const u of (await client.search({ since, subject }, { uid: true })) || []) uidSet.add(u); }
        catch { /* single search failing is fine */ }
      }
      const senders = String(process.env.BANK_MAIL_FROM || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const from of senders) {
        try { for (const u of (await client.search({ since, from }, { uid: true })) || []) uidSet.add(u); }
        catch { /* ignore */ }
      }

      const uids = [...uidSet].slice(-MAX_MESSAGES);
      for (const uid of uids) {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg?.source) continue;
        const mail = await simpleParser(msg.source);
        counts.emails++;

        const mailKey = 'mail_' + crypto.createHash('sha1')
          .update(mail.messageId || `${mail.date}|${mail.subject}`).digest('hex').slice(0, 24);
        const already = await fsGet('bankImports/' + mailKey).catch(() => null);
        if (already) { counts.alreadyProcessed++; continue; }

        const results = [];
        for (const att of mail.attachments || []) {
          const name = String(att.filename || '').toLowerCase();
          const isCsv = /\.(csv|txt)$/.test(name) || /text\/csv/.test(att.contentType || '');
          const isPdf = /\.pdf$/.test(name) || /application\/pdf/.test(att.contentType || '');
          if (!isCsv && !isPdf) continue;
          counts.attachments++;

          let rawTxs = null, how = null;
          if (isCsv) {
            const { txs } = parseBankCsv(att.content.toString('utf8'));
            if (txs && txs.length) { rawTxs = txs; how = 'csv'; }
          } else if (isPdf && att.content.length <= MAX_PDF_BYTES) {
            rawTxs = await pdfToMovements(att.content).catch(e => {
              console.warn('[banking/scan-inbox] pdf ocr failed:', name, e.message);
              return null;
            });
            if (rawTxs) { how = 'pdf-ocr'; counts.pdfOcr++; }
          }
          if (!rawTxs || !rawTxs.length) { results.push({ file: name, ok: false }); continue; }

          if (dry) {
            results.push({ file: name, ok: true, how, movements: rawTxs.length, dry: true });
            counts.imported += rawTxs.length;
            continue;
          }
          const out = await ingestBankTransactions(rawTxs, {
            accountId: 'mail:' + (mail.from?.value?.[0]?.address || 'estratto'),
            source: 'email',
            actor: 'banca-mail',
          });
          counts.imported += out.imported; counts.skippedTx += out.skipped;
          counts.matched += out.matched; counts.suggested += out.suggested;
          results.push({ file: name, ok: true, how, ...out });
        }

        if (!dry && results.length) {
          await fsPatch('bankImports/' + mailKey, {
            subject: String(mail.subject || '').slice(0, 200),
            from: mail.from?.value?.[0]?.address || null,
            date: mail.date || null,
            processedAt: new Date(),
            results,
          });
        }
        if (results.length) details.push({ subject: String(mail.subject || '').slice(0, 80), results });
      }
    } finally { lock.release(); }
  } finally {
    await client.logout().catch(() => {});
  }

  const summary = counts.imported
    ? `${counts.imported} movimenti importati dall'email (${counts.matched} canoni riconciliati, ${counts.suggested} da confermare)`
    : 'Nessun nuovo estratto conto in casella';

  if (!dry && counts.imported) {
    await saveReport('banca', { summary, counts, details: details.slice(0, 5), source: 'scan-inbox' });
    await tgNotify(
      `🏦📬 <b>Estratto conto letto dalla mail</b>\n${counts.imported} movimenti importati` +
      (counts.matched ? ` · ${counts.matched} canoni riconciliati ✅` : '') +
      (counts.suggested ? ` · ${counts.suggested} da confermare: https://boomrome.com/banca` : '')
    );
  }
  return { counts, summary, details };
}

// PDF statement → movements via Claude (document block, haiku). Returns
// [{ bookingDate, amount, description, counterparty }] or throws.
async function pdfToMovements(buffer) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const prompt = [
    'Questo è un estratto conto bancario italiano. Estrai TUTTI i movimenti e rispondi SOLO con JSON valido, nessun testo attorno:',
    '{"movements":[{"date":"YYYY-MM-DD","amount":-123.45,"description":"...","counterparty":"..."}]}',
    'Regole: amount negativo per addebiti/uscite, positivo per accrediti/entrate. Usa la data operazione (o contabile).',
    'counterparty = ordinante/beneficiario se presente, altrimenti stringa vuota. Non inventare movimenti; ignora saldi e totali.',
  ].join('\n');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const parsed = extractJson(text);
  const movements = parsed?.movements;
  if (!Array.isArray(movements)) throw new Error('estrazione PDF non valida');
  return movements
    .filter(m => m && /^\d{4}-\d{2}-\d{2}$/.test(m.date || '') && Number(m.amount))
    .map(m => ({
      bookingDate: m.date,
      amount: Number(m.amount),
      description: String(m.description || '').slice(0, 400),
      counterparty: String(m.counterparty || '').slice(0, 120),
    }));
}
