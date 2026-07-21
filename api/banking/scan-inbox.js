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
import { callClaude, extractJson } from '../agent/_claude.js';

const EMPLOYEE = 'banca-mail';
const LOOKBACK_DAYS = 7;
const MAX_MESSAGES = 25;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const OCR_MODEL = 'claude-haiku-4-5-20251001';
// Statement emails (attachments) + per-movement ALERT emails ("Hai ricevuto
// un bonifico di €1.200,00 da…") whose amounts live in the email BODY — the
// path that works even when the bank only links the statement behind login.
const SUBJECTS = [
  'estratto conto', 'lista movimenti', 'movimenti conto', 'rendiconto',
  'account statement', 'estratto di conto',
  'bonifico', 'accredito', 'addebito', 'pagamento ricevuto',
];
// Body parsing is restricted to real bank senders (plus BANK_MAIL_FROM) so a
// tenant writing "ti ho fatto il bonifico" never becomes a transaction.
const KNOWN_BANK_DOMAINS = [
  'intesasanpaolo.com', 'isybank.com', 'unicredit.it', 'unicredit.eu',
  'fineco.it', 'finecobank.com', 'bper.it', 'bnl.it', 'bnlmail.com',
  'mps.it', 'credem.it', 'n26.com', 'revolut.com', 'poste.it',
  'sella.it', 'ing.com', 'ing.it', 'bancomediolanum.it', 'mediolanum.it',
  'credit-agricole.it', 'ca-italia.it', 'widiba.it', 'illimity.com',
  'hype.it', 'buddybank.com', 'chebanca.it', 'mediobanca.com',
];
const MAX_BODY_AI_CALLS = 8; // per-run budget for body extraction

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
  const counts = { emails: 0, attachments: 0, imported: 0, skippedTx: 0, matched: 0, suggested: 0, alreadyProcessed: 0, pdfOcr: 0, bodyParsed: 0 };
  const details = [];
  let bodyAiBudget = MAX_BODY_AI_CALLS;

  const extraSenders = String(process.env.BANK_MAIL_FROM || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const isBankSender = (addr) => {
    const domain = String(addr || '').toLowerCase().split('@').pop() || '';
    return KNOWN_BANK_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))
      || extraSenders.some(d => domain.includes(d));
  };

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
      for (const from of extraSenders) {
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

        // ── Avvisi movimento nel CORPO dell'email (nessun allegato) ─────
        // Molte banche non allegano nulla: l'estratto sta dietro login, ma
        // gli avvisi operazione ("Hai ricevuto un bonifico di €1.200,00 da
        // MARIO ROSSI") portano l'importo nel testo. Solo da mittenti
        // bancari riconosciuti, con budget AI per run.
        const fromAddr = mail.from?.value?.[0]?.address || '';
        if (!results.some(r => r.ok) && isBankSender(fromAddr) && bodyAiBudget > 0) {
          const bodyText = String(mail.text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
          if (bodyText && /\d/.test(bodyText) && /(€|eur|importo|bonifico|accredito|addebito|pagamento)/i.test(bodyText)) {
            bodyAiBudget--;
            const rawTxs = await bodyToMovements(mail.subject, bodyText, mail.date).catch(e => {
              console.warn('[banking/scan-inbox] body parse failed:', e.message);
              return null;
            });
            if (rawTxs && rawTxs.length) {
              counts.bodyParsed++;
              if (dry) {
                results.push({ body: true, ok: true, how: 'body-ai', movements: rawTxs.length, dry: true });
                counts.imported += rawTxs.length;
              } else {
                const out = await ingestBankTransactions(rawTxs, {
                  accountId: 'mail-alert:' + (fromAddr.split('@').pop() || 'banca'),
                  source: 'email-alert',
                  actor: 'banca-mail',
                });
                counts.imported += out.imported; counts.skippedTx += out.skipped;
                counts.matched += out.matched; counts.suggested += out.suggested;
                results.push({ body: true, ok: true, how: 'body-ai', ...out });
              }
            } else {
              // Nothing extractable (e.g. "il tuo estratto è disponibile"):
              // record it so we never re-pay the AI call for this email.
              results.push({ body: true, ok: false });
            }
          }
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

// Avviso movimento (testo email) → movimenti via Claude haiku (text-only).
// Un'email di avviso porta di norma UN movimento; il prompt vieta di
// inventare e ammette la lista vuota (email "estratto disponibile" → []).
async function bodyToMovements(subject, bodyText, mailDate) {
  const fallbackDate = mailDate ? new Date(mailDate).toISOString().slice(0, 10) : null;
  const { text } = await callClaude({
    model: OCR_MODEL,
    maxTokens: 1000,
    system: 'Estrai movimenti bancari da email di avviso operazione di banche italiane. Rispondi SOLO con JSON valido: {"movements":[{"date":"YYYY-MM-DD","amount":-123.45,"description":"...","counterparty":"..."}]}. amount negativo per addebiti/uscite, positivo per accrediti/entrate. Non inventare nulla: se l\'email non riporta un\'operazione con importo (es. è solo un avviso "estratto conto disponibile" o marketing), rispondi {"movements":[]}.',
    user: `Oggetto: ${subject || ''}\nData email: ${fallbackDate || 'sconosciuta'}\n\nTesto:\n${bodyText}\n\nSe la data dell'operazione non è nel testo usa la data email.`,
  });
  const parsed = extractJson(text);
  const movements = Array.isArray(parsed?.movements) ? parsed.movements : [];
  return movements
    .filter(m => m && /^\d{4}-\d{2}-\d{2}$/.test(m.date || '') && Number(m.amount))
    .map(m => ({
      bookingDate: m.date,
      amount: Number(m.amount),
      description: String(m.description || subject || '').slice(0, 400),
      counterparty: String(m.counterparty || '').slice(0, 120),
    }));
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
