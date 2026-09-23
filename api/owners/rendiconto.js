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
// senza scrivere né spedire. Idempotente per (proprietario, mese): il doc
// `rendiconti/<ownerId>_<YYYY-MM>` nasce con fsCreate → un rerun trova il
// 409 e NON rispedisce (se le rules non sono ancora deployate il controllo
// fallisce APERTO e il recap lo dice — meglio un doppio invio raro che un
// mese saltato in silenzio).
//
// Auth: cron Vercel (Bearer CRON_SECRET), X-Homie-Secret, o admin Firebase
// (bottone "Esegui ora"). Query: ?dry=1 · ?month=YYYY-MM (default: il mese
// scorso) · ?ownerId=<id> (solo quel proprietario).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  requireCronOrAdmin, fsGet, fsList, fsCreate, logActivity, tgNotify,
  reportEmployeeHealth, saveReport, euro, esc,
} from '../employees/_lib.js';
import { storageUpload, sendEmail } from '../agent/_lib.js';
import { shell, para, fine, btn, rule } from '../preagreement/_notify.js';
import { fsDelete } from '../homie/_lib.js';
import { ownerArchiveOpen, ownerArchiveUrl } from '../owner/_entry.js';

const EMPLOYEE = 'rendiconto';
const clip = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);

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
    // Un giro in cui qualche rendiconto NON è partito non è un giro sano
    // (22/09/2026 — la lezione del 1/09: Storage giù per tutti, e /team
    // restava verde perché il try/catch per proprietario assorbiva tutto).
    // Il battito è ok solo a zero fallimenti: così la card si accende e
    // l'allerta dei 3 run di fila di reportEmployeeHealth resta quella di sempre.
    if (!dry) {
      const failed = out.counts.failed || 0;
      await reportEmployeeHealth(EMPLOYEE, failed
        ? { ok: false, error: `${failed} rendiconti ${out.month} non riusciti — ${out.retry}`, stats: out.counts }
        : { ok: true, stats: out.counts });
    }
    return res.status(200).json({ ok: true, actor, dry, ...out });
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
  const counts = { owners: 0, sent: 0, skippedNoEmail: 0, skippedNoActivity: 0, alreadySent: 0, failed: 0, totalCollected: 0 };

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

    // L'ORDINE (22/09/2026 — la lezione del segno scritto prima del file):
    //   1. si LEGGE il segno: c'è → già inviato, e il PDF archiviato NON si
    //      riscrive (un rerun o un ?month= sovrascriveva la copia già
    //      spedita, e l'archivio divergeva in silenzio dall'allegato);
    //   2. si carica il PDF (percorso deterministico): se Storage rifiuta,
    //      niente segno e niente email — il mese resta da fare, non «fatto»;
    //   3. si CREA il segno (409 = un'altra esecuzione ci è arrivata prima →
    //      niente seconda email);
    //   4. l'email. Se fallisce il segno si toglie: meglio un doppio invio
    //      raro che un mese saltato in silenzio (la regola scritta in testa).
    // Ogni proprietario nel suo try/catch: uno che si rompe non ferma gli altri.
    try {
      const markerPath = `rendiconti/${ownerId}_${month}`;
      let idemWarn = null;
      let markerCreated = false;   // il segno l'ha scritto QUESTO giro? (solo allora si toglie)
      try {
        if (await fsGet(markerPath)) { counts.alreadySent++; results.push({ ownerId, ownerName, skipped: 'already_sent' }); continue; }
      } catch (e) { idemWarn = 'marker_read_failed'; }   // fail-open dichiarato, come il create qui sotto

      const pdfBytes = await buildPdf({ ownerName, label, month, sections, collected, expected, arrears });
      let url;
      try { url = await storageUpload(`rendiconti/${ownerId}/rendiconto_${month}.pdf`, pdfBytes, 'application/pdf'); }
      catch (e) { counts.failed++; results.push({ ownerId, ownerName, error: 'upload_failed' }); console.warn('[rendiconto] upload_failed', e && e.status ? e.status : ''); continue; }

      try { await fsCreate('rendiconti', { ownerId, month, at: new Date().toISOString() }, `${ownerId}_${month}`); markerCreated = true; }
      catch (e) {
        if (e.exists) { counts.alreadySent++; results.push({ ownerId, ownerName, skipped: 'already_sent' }); continue; }
        idemWarn = e.message; // 403 rules non deployate → si procede, il recap lo dice
      }

      try {
        await sendOwnerEmail({ ownerEmail, ownerName, label, month, sections, collected, expected, arrears, pdfBytes, archiveOpen: ownerArchiveOpen(u) });
      } catch (e) {
        counts.failed++;
        results.push({ ownerId, ownerName, error: e && e.message === 'email_timeout' ? 'email_timeout' : 'email_failed' });
        // Si toglie il segno che QUESTO giro ha creato, qualunque cosa sia
        // successo prima: se la lettura del segno era fallita (idemWarn) il
        // create era riuscito lo stesso, e lasciarlo registrava come
        // «inviato» un mese mai spedito — ogni rilancio l'avrebbe saltato.
        if (markerCreated) { try { await fsDelete(markerPath); } catch { /* il recap lo dice comunque */ } }
        continue;
      }
      counts.sent++; counts.totalCollected += collected;
      results.push({ ownerId, ownerName, ownerEmail, month, collected, expected, arrears, properties: sections.length, url, ...(idemWarn ? { idemWarn } : {}) });
    } catch (e) {
      counts.failed++;
      results.push({ ownerId, ownerName, error: 'owner_failed' });
      console.warn('[rendiconto] owner_failed');
    }
  }

  // Il rimedio, scritto (22/09/2026): il cron gira il 1° e fa SOLO il mese
  // appena chiuso — un mese fallito non torna da solo al giro dopo. Si
  // rilancia a mano quel mese; i segni rendono il rilancio sicuro (chi l'ha
  // già ricevuto viene saltato), e con un solo fallito basta quel proprietario.
  const failedIds = results.filter((r) => r.error).map((r) => r.ownerId);
  const retry = `rilancia con ?month=${month}${failedIds.length === 1 ? `&ownerId=${encodeURIComponent(failedIds[0])}` : ''}`;

  if (!dry && (counts.sent || counts.failed)) {
    await saveReport(EMPLOYEE, { summary: `${counts.sent} rendiconti ${label} inviati — ${euro(counts.totalCollected)} incassati${counts.failed ? ` · ${counts.failed} non riusciti (${retry})` : ''}`, counts, results: results.slice(0, 20) });
    await tgNotify(`📒 <b>Rendiconti ${esc(label)}</b>\n${counts.sent} proprietari · incassato ${esc(euro(counts.totalCollected))}${counts.skippedNoEmail ? `\n⚠️ ${counts.skippedNoEmail} senza email` : ''}${counts.failed ? `\n⚠️ ${counts.failed} non riusciti — non si ritentano da soli: ${esc(retry)}` : ''}${results.some((r) => r.idemWarn) ? '\n⚠️ idempotenza non garantita (deploy rules!)' : ''}`);
    await logActivity('Rendiconti mensili inviati', 'employee', counts, EMPLOYEE);
  }
  return { month, label, counts, results, retry: counts.failed ? retry : null };
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
// Il bottone porta all'archivio del proprietario (#r=<mese>) SOLO se
// l'account ce l'ha davvero (invitato o già entrato); altrimenti niente
// bottone e una riga. L'URL tokenizzato di Storage non entra MAI nell'HTML:
// è una credenziale senza scadenza dentro un'email che si inoltra — il PDF
// viaggia comunque in allegato.
async function sendOwnerEmail({ ownerEmail, ownerName, label, month, sections, collected, expected, arrears, pdfBytes, archiveOpen }) {
  const first = ownerName.split(' ')[0] || 'Gentile proprietario';
  const props = sections.map((s) => clip(s.prop.address || s.prop.name, 60)).join(' · ');
  const att = pdfBytes.length < 8 * 1024 * 1024
    ? [{ filename: `BOOM_Rendiconto_${label.replace(' ', '_')}.pdf`, content: pdfBytes, contentType: 'application/pdf' }] : undefined;
  await Promise.race([
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
        + (archiveOpen
          ? btn(ownerArchiveUrl('r=' + month), 'Apri il suo archivio')
          : fine('Vuole l’archivio online di tutti i rendiconti? Risponda a questa email.'))
        + fine('Il rendiconto arriva automaticamente il 1° di ogni mese. Per qualsiasi domanda basta rispondere a questa email.'),
        `Rendiconto ${label} — incassato ${euro(collected)}`),
      attachments: att,
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 15000)),
  ]);
}
