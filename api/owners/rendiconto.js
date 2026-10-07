// api/owners/rendiconto.js — IL RENDICONTO PROPRIETARIO (cron mensile)
//
// Il 1° del mese ogni proprietario riceve, senza che nessuno muova un dito,
// il rendiconto del mese chiuso: per ogni suo immobile i canoni INCASSATI
// (con data e via), le rate del mese ancora aperte, gli arretrati totali,
// le manutenzioni del periodo. UN PDF nel design BOOM + email in italiano.
// È il prodotto che fa rinnovare i mandati: il proprietario VEDE il lavoro.
//
// Infrastruttura identica a La Squadra: heartbeat `teamHealth/rendiconto`,
// report `teamReports`, recap Telegram all'operatore, `?dry=1` per provare
// senza scrivere né spedire. Il doc `rendiconti/<ownerId>_<YYYY-MM>` è il
// registro di consegna: pending → sending (claim CAS) → sent solo se il
// server SMTP accetta il destinatario. Un esito ambiguo richiede verifica
// umana; non si reinvia alla cieca un'email forse già accettata.
//
// Auth: cron Vercel (Bearer CRON_SECRET), X-Homie-Secret, o admin Firebase
// (bottone "Esegui ora"). Query: ?dry=1 · ?month=YYYY-MM (default: il mese
// scorso) · ?ownerId=<id> (solo quel proprietario).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import crypto from 'node:crypto';
import {
  requireCronOrAdmin, fsGet, fsList, fsCreate, logActivity, tgNotify,
  reportEmployeeHealth, saveReport, euro, esc,
} from '../employees/_lib.js';
import { fsGetVersioned, fsCommit } from '../homie/_lib.js';
import { storageUpload, sendEmail } from '../agent/_lib.js';
import { shell, para, fine, btn, rule } from '../preagreement/_notify.js';

const EMPLOYEE = 'rendiconto';
const clip = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
const SEND_CLAIM_MS = 20 * 60 * 1000; // longer than the function's 60s ceiling

const reportPath = (ownerId, month) => `rendiconti/${ownerId}_${month}`;
const smtpAddress = (s) => String(s || '').match(/<([^<>]+)>/)?.[1]?.trim().toLowerCase()
  || String(s || '').trim().toLowerCase();

async function casFields(path, version, fields) {
  await fsCommit([{ docPath: path, fields, precondition: { updateTime: version } }]);
}

// A legacy marker does not prove delivery: the old code wrote it before PDF,
// Storage and SMTP. A stale sending claim is also ambiguous after a crash.
async function markerDecision(path) {
  for (let i = 0; i < 4; i++) {
    const v = await fsGetVersioned(path);
    if (!v) throw new Error('rendiconto_marker_missing');
    const s = v.data.status;
    if (s === 'sent') return { kind: 'sent', marker: v };
    if (s === 'pending') return { kind: 'pending', marker: v };
    if (s === 'delivery_unknown') return { kind: 'unknown', marker: v };
    if (s === 'sending' && Date.now() - Date.parse(v.data.sendStartedAt || '') < SEND_CLAIM_MS) {
      return { kind: 'in_progress', marker: v };
    }
    const reason = s === 'sending' ? 'send_claim_expired' : 'legacy_marker_unverified';
    try {
      await casFields(path, v.updateTime, { status: 'delivery_unknown', reason, reviewedAt: null });
      return { kind: 'unknown', marker: v, reason };
    } catch (e) { if (!e.conflict) throw e; }
  }
  throw new Error('rendiconto_marker_contention');
}

async function claimSend(path, recipient, pdfUrl) {
  for (let i = 0; i < 4; i++) {
    const d = await markerDecision(path);
    if (d.kind !== 'pending') return d;
    const claimId = crypto.randomUUID();
    try {
      await casFields(path, d.marker.updateTime, {
        status: 'sending', claimId, sendStartedAt: new Date().toISOString(),
        attempts: (Number(d.marker.data.attempts) || 0) + 1,
        recipient, pdfUrl, lastError: null,
      });
      return { kind: 'claimed', claimId };
    } catch (e) { if (!e.conflict) throw e; }
  }
  throw new Error('rendiconto_claim_contention');
}

async function finishClaim(path, claimId, fields) {
  const v = await fsGetVersioned(path);
  if (!v || v.data.status !== 'sending' || v.data.claimId !== claimId) {
    throw new Error('rendiconto_claim_lost');
  }
  await casFields(path, v.updateTime, fields);
}

async function deliverReport({ ownerId, ownerEmail, ownerName, month, label, sections, collected, expected, arrears }) {
  const path = reportPath(ownerId, month);
  try {
    await fsCreate('rendiconti', {
      ownerId, month, status: 'pending', attempts: 0, createdAt: new Date().toISOString(),
    }, `${ownerId}_${month}`);
  } catch (e) { if (!e.exists) throw e; } // no untracked send when rules are unavailable

  const before = await markerDecision(path);
  if (before.kind !== 'pending') return before.kind === 'sent' ? { kind: 'already_sent' } : before;

  // These steps are safe to repeat: no email has been claimed yet and the
  // Storage path is deterministic for owner+month.
  const pdfBytes = await buildPdf({ ownerName, label, month, sections, collected, expected, arrears });
  const url = await storageUpload(`rendiconti/${ownerId}/rendiconto_${month}.pdf`, pdfBytes, 'application/pdf');
  if (!url) throw new Error('rendiconto_pdf_url_missing');

  const claim = await claimSend(path, ownerEmail, url);
  if (claim.kind !== 'claimed') return claim.kind === 'sent' ? { kind: 'already_sent' } : claim;

  let receipt;
  try {
    receipt = await sendOwnerEmail({ ownerEmail, ownerName, label, sections, collected, expected, arrears, url, pdfBytes });
  } catch (e) {
    // An explicit SMTP 4xx/5xx response is a rejection. A timeout/network
    // error after DATA may mean Gmail accepted the message: do not auto-retry.
    const rejected = Number(e.responseCode) >= 400 && Number(e.responseCode) < 600;
    try {
      await finishClaim(path, claim.claimId, rejected
        ? { status: 'pending', lastError: 'smtp_rejected', lastErrorAt: new Date().toISOString() }
        : { status: 'delivery_unknown', reason: 'smtp_outcome_unconfirmed', lastErrorAt: new Date().toISOString() });
    } catch { return { kind: 'unknown', reason: 'smtp_state_write_failed' }; }
    return { kind: rejected ? 'retry' : 'unknown', reason: rejected ? 'smtp_rejected' : 'smtp_outcome_unconfirmed' };
  }

  const accepted = Array.isArray(receipt?.accepted)
    && receipt.accepted.some((x) => smtpAddress(x) === smtpAddress(ownerEmail));
  if (!accepted) {
    const rejected = Array.isArray(receipt?.rejected)
      && receipt.rejected.some((x) => smtpAddress(x) === smtpAddress(ownerEmail));
    try {
      await finishClaim(path, claim.claimId, rejected
        ? { status: 'pending', lastError: 'smtp_recipient_rejected', lastErrorAt: new Date().toISOString() }
        : { status: 'delivery_unknown', reason: 'smtp_acceptance_unconfirmed', lastErrorAt: new Date().toISOString() });
    } catch { return { kind: 'unknown', reason: 'smtp_state_write_failed' }; }
    return { kind: rejected ? 'retry' : 'unknown', reason: rejected ? 'smtp_recipient_rejected' : 'smtp_acceptance_unconfirmed' };
  }

  const acceptedAt = new Date().toISOString();
  try {
    await finishClaim(path, claim.claimId, {
      status: 'sent', smtpAcceptedAt: acceptedAt, messageId: receipt.messageId || '', pdfUrl: url, lastError: null,
    });
  } catch {
    // Commit may have succeeded while its response was lost. Check the ledger
    // once before surfacing an unknown; never send the email again here.
    const latest = await fsGetVersioned(path).catch(() => null);
    if (latest?.data.status === 'sent' && latest.data.claimId === claim.claimId) {
      return { kind: 'sent', url, messageId: latest.data.messageId };
    }
    await finishClaim(path, claim.claimId, {
      status: 'delivery_unknown', reason: 'smtp_accepted_receipt_not_saved',
      smtpAcceptedAt: acceptedAt, messageId: receipt.messageId || '',
    }).catch(() => {});
    return { kind: 'unknown', reason: 'smtp_accepted_receipt_not_saved' };
  }
  return { kind: 'sent', url, messageId: receipt.messageId || '' };
}

// WinAnsi safety — la lezione del certificato FES.
function wa(s) {
  return String(s == null ? '' : s)
    .replace(/[→➔➡]/g, '->').replace(/[✓✔]/g, 'ok').replace(/−/g, '-')
    .replace(/[^\x20-\xFF–—‘’“”…€]/g, '');
}
const dIT = (s) => { try { const d = new Date(String(s).slice(0, 10) + 'T00:00'); return isNaN(d) ? '' : d.toLocaleDateString('it-IT'); } catch { return ''; } };
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({
      dry,
      monthOverride: /^\d{4}-\d{2}$/.test(String(req.query?.month || '')) ? req.query.month : null,
      onlyOwner: clip(req.query?.ownerId, 80) || null,
    });
    const issues = out.counts.failed + out.counts.deliveryUnknown + out.counts.skippedNoEmail + out.counts.inProgress;
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: issues === 0, stats: out.counts,
      ...(issues ? { error: `${issues} rendiconti non confermati` } : {}) });
    return res.status(!dry && issues ? 503 : 200).json({ ok: dry || issues === 0, actor, dry, ...out });
  } catch (e) {
    console.error('[rendiconto]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry, monthOverride, onlyOwner }) {
  // Mese di riferimento: quello CHIUSO (il cron gira il 1° del successivo).
  const now = new Date();
  const rome = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  let y = rome.getFullYear(), m = rome.getMonth(); // 0-based mese corrente
  if (monthOverride) { y = +monthOverride.slice(0, 4); m = +monthOverride.slice(5, 7) - 1; }
  else { m -= 1; if (m < 0) { m = 11; y -= 1; } }
  const month = `${y}-${String(m + 1).padStart(2, '0')}`;
  const label = `${MESI[m]} ${y}`;

  const [properties, contracts, payments, maintenance] = await Promise.all([
    fsList('properties', { limit: 400 }),
    fsList('contracts', { limit: 800 }),
    fsList('payments', { limit: 3000 }),
    fsList('maintenance', { limit: 600 }),
  ]);

  // Immobili per proprietario
  const byOwner = new Map();
  for (const p of properties) {
    const oid = clip(p.ownerId, 80);
    if (!oid) continue;
    if (onlyOwner && oid !== onlyOwner) continue;
    if (!byOwner.has(oid)) byOwner.set(oid, []);
    byOwner.get(oid).push(p);
  }

  const inMonth = (iso) => String(iso || '').slice(0, 7) === month;
  const today = new Date().toISOString().slice(0, 10);

  const results = [];
  const counts = { owners: 0, sent: 0, skippedNoEmail: 0, skippedNoActivity: 0,
    alreadySent: 0, inProgress: 0, deliveryUnknown: 0, failed: 0, totalCollected: 0 };

  for (const [ownerId, props] of byOwner) {
    counts.owners++;
    const propIds = new Set(props.map((p) => p.id));
    const cByProp = new Map();
    for (const c of contracts) if (propIds.has(c.propertyId)) {
      if (!cByProp.has(c.propertyId)) cByProp.set(c.propertyId, []);
      cByProp.get(c.propertyId).push(c);
    }

    // Sezioni per immobile
    const sections = [];
    let collected = 0, expected = 0, arrears = 0;
    for (const p of props) {
      const pPays = payments.filter((x) => x.propertyId === p.id || (cByProp.get(p.id) || []).some((c) => c.id === x.contractId));
      const paid = pPays.filter((x) => x.status === 'paid' && (inMonth(x.paidDate) || (!x.paidDate && inMonth(x.month))));
      const open = pPays.filter((x) => x.status !== 'paid' && x.status !== 'cancelled' && inMonth(x.month));
      const late = pPays.filter((x) => x.status !== 'paid' && x.status !== 'cancelled' && x.dueDate && x.dueDate < today && !inMonth(x.month));
      const maint = maintenance.filter((x) => x.propertyId === p.id && (inMonth(x.createdAt) || inMonth(x.resolvedAt)));
      const activeC = (cByProp.get(p.id) || []).find((c) => c.status === 'active') || (cByProp.get(p.id) || [])[0] || null;
      const sum = (arr) => arr.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      collected += sum(paid); expected += sum(open) + sum(paid); arrears += sum(late);
      if (paid.length || open.length || late.length || maint.length || activeC) {
        sections.push({ prop: p, contract: activeC, paid, open, late, maint });
      }
    }

    if (!sections.length) { counts.skippedNoActivity++; continue; }

    // Email del proprietario: users → landlords → contract.landlordEmail
    const [u, l] = await Promise.all([
      fsGet('users/' + ownerId).catch(() => null),
      fsGet('landlords/' + ownerId).catch(() => null),
    ]);
    const ownerName = clip((u && u.name) || (l && l.name) || sections[0].contract?.landlordName || 'Proprietario', 80);
    const ownerEmail = clip((u && u.email) || (l && l.email) || sections[0].contract?.landlordEmail || '', 120);
    if (!ownerEmail) { counts.skippedNoEmail++; results.push({ ownerId, ownerName, skipped: 'no_email' }); continue; }

    if (dry) { results.push({ ownerId, ownerName, ownerEmail, month, collected, expected, arrears, properties: sections.length, dry: true }); continue; }

    try {
      const delivery = await deliverReport({ ownerId, ownerEmail, ownerName, month, label, sections, collected, expected, arrears });
      if (delivery.kind === 'sent') {
        counts.sent++; counts.totalCollected += collected;
        results.push({ ownerId, ownerName, ownerEmail, month, collected, expected, arrears, properties: sections.length, url: delivery.url });
      } else if (delivery.kind === 'pending' || delivery.kind === 'retry') {
        counts.failed++; results.push({ ownerId, ownerName, month, status: 'pending', reason: delivery.reason || 'retry' });
      } else if (delivery.kind === 'unknown') {
        counts.deliveryUnknown++; results.push({ ownerId, ownerName, month, status: 'delivery_unknown', reason: delivery.reason || 'verify_email' });
      } else if (delivery.kind === 'in_progress') {
        counts.inProgress++; results.push({ ownerId, ownerName, month, skipped: 'in_progress' });
      } else {
        counts.alreadySent++; results.push({ ownerId, ownerName, skipped: 'already_sent' });
      }
    } catch (e) {
      counts.failed++;
      results.push({ ownerId, ownerName, month, status: 'failed', reason: clip(e.message, 120) });
    }
  }

  if (!dry && (counts.sent || counts.failed || counts.deliveryUnknown || counts.skippedNoEmail || counts.inProgress)) {
    await saveReport(EMPLOYEE, { summary: `${counts.sent} rendiconti ${label} accettati da SMTP — ${counts.failed} da riprovare, ${counts.deliveryUnknown} da verificare, ${counts.inProgress} in corso`, counts, results: results.slice(0, 20) });
    await tgNotify(`📒 <b>Rendiconti ${esc(label)}</b>\n${counts.sent} accettati da SMTP · incassato ${esc(euro(counts.totalCollected))}${counts.failed ? `\n⚠️ ${counts.failed} da riprovare` : ''}${counts.deliveryUnknown ? `\n🚨 ${counts.deliveryUnknown} esito email incerto: verifica prima di reinviare` : ''}${counts.inProgress ? `\n⏳ ${counts.inProgress} in corso: ricontrollare lo stato` : ''}${counts.skippedNoEmail ? `\n⚠️ ${counts.skippedNoEmail} senza email` : ''}`);
    if (counts.sent) await logActivity('Rendiconti mensili accettati da SMTP', 'employee', counts, EMPLOYEE);
  }
  return { month, label, counts, results };
}

// ── Il PDF ───────────────────────────────────────────────────────────────
export async function buildPdf({ ownerName, label, month, sections, collected, expected, arrears }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.09), grey = rgb(0.42, 0.42, 0.45), gold = rgb(0.72, 0.55, 0.05), green = rgb(0.12, 0.55, 0.3), red = rgb(0.75, 0.2, 0.15);
  const W = 595, H = 842, M = 48;
  let page, y;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 40, width: W, height: 40, color: rgb(0.04, 0.04, 0.05) });
    T('BOOM', M, H - 27, 15, bold, rgb(1, 1, 1));
    T('ROMA', M + 48, H - 26, 8, font, rgb(0.91, 0.78, 0.41));
    T('Rendiconto proprietario', W - M - 140, H - 22, 8, font, rgb(0.8, 0.8, 0.8));
    T(label, W - M - 140, H - 33, 8, font, rgb(0.6, 0.6, 0.6));
    y = H - 70;
  };
  const T = (t, x, yy, sz, f, col) => page.drawText(wa(t), { x, y: yy, size: sz, font: f || font, color: col || ink });
  const line = (yy, x1 = M, x2 = W - M, th = 0.6, col) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: th, color: col || rgb(0.78, 0.76, 0.7) });
  const need = (h) => { if (y - h < 56) newPage(); };
  const sect = (t) => { need(34); y -= 6; T(t, M, y, 11, bold, gold); y -= 5; line(y, M, W - M, 0.9, gold); y -= 15; };
  const row = (label_, value, col) => { need(15); T(label_, M + 6, y, 9, font, grey); T(value, W - M - 6 - font.widthOfTextAtSize(wa(value), 9.5), y, 9.5, font, col || ink); y -= 14; };

  newPage();
  T(`RENDICONTO MENSILE — ${label.toUpperCase()}`, M, y, 14, bold); y -= 18;
  T(`Proprietario: ${ownerName}`, M, y, 10, font, grey); y -= 24;

  // Riepilogo
  need(56);
  T('INCASSATO NEL MESE', M, y, 8, bold, grey);
  T('ATTESO NEL MESE', M + 190, y, 8, bold, grey);
  T('ARRETRATI TOTALI', M + 360, y, 8, bold, grey); y -= 16;
  T(euro(collected), M, y, 15, bold, green);
  T(euro(expected), M + 190, y, 15, bold, ink);
  T(euro(arrears), M + 360, y, 15, bold, arrears > 0 ? red : grey); y -= 26;

  for (const s of sections) {
    sect(clip(s.prop.address || s.prop.name || 'Immobile', 70));
    if (s.contract) row('Contratto', `${clip(s.contract.tenantName, 40)} — ${euro(s.contract.rent)}/mese`);
    for (const p of s.paid) row(`Incassata rata ${p.month}${p.paidVia ? ` (${p.paidVia})` : ''}${p.paidDate ? ` il ${dIT(p.paidDate)}` : ''}`, euro(p.amount), green);
    for (const p of s.open) row(`Rata ${p.month} — in attesa (scad. ${dIT(p.dueDate)})`, euro(p.amount), grey);
    for (const p of s.late) row(`ARRETRATO rata ${p.month} (scad. ${dIT(p.dueDate)})`, euro(p.amount), red);
    for (const mt of s.maint) row(`Manutenzione: ${clip(mt.title || mt.description || mt.category, 50)}`, clip(mt.status === 'resolved' || mt.status === 'done' ? 'risolta' : 'in corso', 20));
    y -= 4;
  }

  need(30);
  y -= 6;
  T('Importi lordi come da contratto. Documento generato automaticamente da BOOM Roma — per ogni dettaglio: valentino@boom-rome.com', M, y, 7.5, font, grey);
  T('BOOM® è un marchio dell\'Unione europea registrato (MUE 019317594) di Egidi Immobiliare S.r.l.', M, 44, 7, font, grey);
  T('Egidi Immobiliare S.r.l. — Via dei Coronari 181/184, 00186 Roma — Sede legale: Viale Liegi 42, 00198 Roma — P.IVA 17322991005 — boomrome.com', M, 34, 7, font, grey);
  return Buffer.from(await pdf.save());
}

// ── L'email (IT, design system, PDF in allegato) ─────────────────────────
async function sendOwnerEmail({ ownerEmail, ownerName, label, sections, collected, expected, arrears, url, pdfBytes }) {
  const first = ownerName.split(' ')[0] || 'Gentile proprietario';
  const props = sections.map((s) => clip(s.prop.address || s.prop.name, 60)).join(' · ');
  const att = pdfBytes.length < 8 * 1024 * 1024
    ? [{ filename: `BOOM_Rendiconto_${label.replace(' ', '_')}.pdf`, content: pdfBytes, contentType: 'application/pdf' }] : undefined;
  let timer;
  try { return await Promise.race([
    sendEmail({
      to: ownerEmail,
      subject: `📒 Rendiconto ${label} — ${clip(sections[0].prop.address || sections[0].prop.name, 50)}${sections.length > 1 ? ` +${sections.length - 1}` : ''}`,
      html: shell(
        para(`Gentile ${esc(first)},`)
        + para(`in allegato il <strong>rendiconto di ${esc(label)}</strong> per ${esc(props)}.`)
        + rule()
        + fine(`💶 <strong>Incassato nel mese</strong> — ${esc(euro(collected))}`)
        + fine(`📅 <strong>Atteso nel mese</strong> — ${esc(euro(expected))}`)
        + (arrears > 0 ? fine(`⚠️ <strong>Arretrati totali</strong> — ${esc(euro(arrears))} (ci stiamo già lavorando)`) : fine('✅ <strong>Nessun arretrato</strong>'))
        + rule()
        + btn(url, 'Apri il rendiconto')
        + fine('Il rendiconto arriva automaticamente il 1° di ogni mese. Per qualsiasi domanda basta rispondere a questa email.'),
        `Rendiconto ${label} — incassato ${euro(collected)}`),
      attachments: att,
    }),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('email_timeout')), 15000); }),
  ]); }
  finally { clearTimeout(timer); }
}
