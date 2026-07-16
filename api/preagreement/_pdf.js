// api/preagreement/_pdf.js
// Server-side PDF of the (accepted) pre-agreement — the black-and-white
// paper replica of the real BOOM RENTAL PROPOSAL (parties, property, lease
// term, financial terms, general conditions 5.x, signatures, Egidi footer).
// Attached to the client/admin confirmation emails so the signed document
// travels WITH the email, exactly like the scanned originals did.
//
// pdf-lib is imported statically — a lazy await import() is not traced by
// Vercel's bundler and fails at runtime in production.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const A4 = [595.28, 841.89];
const M = 56;                       // page margin
const W = A4[0] - M * 2;            // text width
const INK = rgb(0.07, 0.07, 0.07);
const SOFT = rgb(0.45, 0.45, 0.45);
const GOLD = rgb(0.54, 0.43, 0.11);
const LINE = rgb(0.88, 0.88, 0.88);

const eur = n => '€' + Number(n || 0).toLocaleString('en-US', {
  minimumFractionDigits: Math.round(Number(n || 0) * 100) % 100 !== 0 ? 2 : 0,
  maximumFractionDigits: 2,
});
const fmtD = s => { try { return new Date(String(s).slice(0, 10) + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return String(s || ''); } };
// pdf-lib's WinAnsi cannot encode every glyph phones type — normalize.
const clean = s => String(s == null ? '' : s)
  .replace(/[‘’′]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/·/g, '-').replace(/→/g, '->')
  .replace(/[^\x20-\x7E\xA0-\xFF\u20AC]/g, '');

export async function buildPaPdf(pa) {
  const p = pa.property || {}, le = pa.lease || {}, m = pa.money || {};
  const tenants = Array.isArray(pa.tenants) && pa.tenants.length ? pa.tenants : (pa.tenant ? [pa.tenant] : []);
  const ec = Number(m.energyCredit) || 0;
  const split = m.depositSplitPct != null ? Number(m.depositSplitPct) : 100;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page = pdf.addPage(A4);
  let y = A4[1] - M;

  const foot = pg => {
    pg.drawLine({ start: { x: M, y: 46 }, end: { x: A4[0] - M, y: 46 }, thickness: .5, color: LINE });
    pg.drawText('Egidi Immobiliare S.r.l.   -   P.IVA 17322991005   -   boomrome.com', { x: M, y: 34, size: 7.5, font, color: SOFT });
  };
  const need = h => {
    if (y - h < 70) { foot(page); page = pdf.addPage(A4); y = A4[1] - M; }
  };
  const wrap = (text, f, size, width) => {
    const words = clean(text).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (f.widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const para = (text, f, size, color, width = W, lh = 1.45, x = M) => {
    for (const ln of wrap(text, f, size, width)) {
      need(size * lh + 2);
      page.drawText(ln, { x, y, size, font: f, color });
      y -= size * lh;
    }
  };
  const secTitle = (no, title) => {
    need(46);
    y -= 16;
    page.drawText(`${no}.`, { x: M, y, size: 11, font: bold, color: INK });
    page.drawText(clean(title).toUpperCase(), { x: M + 20, y, size: 11, font: bold, color: INK, characterSpacing: 2 });
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: .6, color: LINE });
    y -= 14;
  };
  const row = (k, v, sub) => {
    const vLines = wrap(v, bold, 10, W - 170);
    const sLines = sub ? wrap(sub, font, 8, W - 170) : [];
    const h = vLines.length * 14 + sLines.length * 11 + 8;
    need(h);
    page.drawText(clean(k).toUpperCase(), { x: M, y, size: 7.5, font, color: SOFT, characterSpacing: 1.5 });
    for (const ln of vLines) { page.drawText(ln, { x: M + 170, y, size: 10, font: bold, color: INK }); y -= 14; }
    for (const ln of sLines) { page.drawText(ln, { x: M + 170, y, size: 8, font, color: SOFT }); y -= 11; }
    y -= 6;
  };

  // ── head ──
  page.drawText('BOOM', { x: M, y, size: 20, font: bold, color: INK, characterSpacing: 6 });
  page.drawText('Premium Apartment Rentals', { x: M, y: y - 14, size: 8, font: italic, color: SOFT });
  if (pa.ref) {
    const refTxt = `N. ${clean(pa.ref)}`;
    const wRef = bold.widthOfTextAtSize(refTxt, 10);
    page.drawRectangle({ x: A4[0] - M - wRef - 20, y: y - 6, width: wRef + 20, height: 24, borderColor: INK, borderWidth: .8 });
    page.drawText(refTxt, { x: A4[0] - M - wRef - 10, y: y + 1, size: 10, font: bold, color: INK });
    const st = pa.status === 'paid' ? `PAID ${pa.paidEur ? eur(pa.paidEur) : ''}` : 'ACCEPTED';
    page.drawText(clean(st), { x: A4[0] - M - bold.widthOfTextAtSize(st, 8) - 14, y: y - 20, size: 8, font: bold, color: GOLD });
  }
  y -= 44;
  page.drawText('RENTAL PROPOSAL', { x: M, y, size: 22, font: bold, color: INK, characterSpacing: 3 });
  y -= 16;
  page.drawText(clean(`Pre-Agreement for ${le.type || 'Transitional Lease'} - ${le.lawRef || 'uso transitorio - L.431/98 art.5 c.1'}`), { x: M, y, size: 9, font, color: SOFT });
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 1.4, color: INK });
  y -= 6;

  // ── 1. parties ──
  secTitle(1, 'Parties');
  page.drawText('LANDLORD', { x: M, y, size: 7.5, font, color: SOFT, characterSpacing: 1.5 }); y -= 13;
  para((pa.landlord || {}).name || '-', bold, 11, INK); y -= 6;
  page.drawText(tenants.length > 1 ? 'TENANTS' : 'TENANT', { x: M, y, size: 7.5, font, color: SOFT, characterSpacing: 1.5 }); y -= 13;
  tenants.forEach((t, i) => {
    if (i > 0) y -= 4;
    para(t.fullName || '-', bold, 11, INK);
    const bits = [
      t.dob ? `Born ${t.dob}${t.birthPlace ? ' - ' + t.birthPlace : ''}` : null,
      t.nationality ? `Nationality: ${t.nationality}` : null,
      t.address ? `Address: ${t.address}` : null,
      t.cf ? `C.F.: ${t.cf}` : null,
      t.idDoc ? `ID/Passport: ${t.idDoc}` : null,
      [t.email, t.phone].filter(Boolean).join('  -  ') || null,
    ].filter(Boolean).join('   |   ');
    if (bits) para(bits, font, 8.5, SOFT);
  });
  if (tenants.length > 1) { y -= 2; para('All co-tenants are jointly and severally liable for the full rent and the obligations under this agreement.', italic, 8.5, SOFT); }

  // ── 2. property ──
  secTitle(2, 'Property');
  para('The Landlord grants the Tenant the use of an apartment located at:', font, 9, SOFT);
  para(p.address || '-', bold, 12, INK); y -= 4;
  row('Type', p.type || 'Entire Apartment'); row('Condition', p.condition || 'Furnished'); row('Use', p.use || 'Residential');
  if (p.floor) row('Floor', p.floor);
  if (p.unit) row('Unit', p.unit);

  // ── 3. lease term ──
  secTitle(3, 'Lease Term');
  row('Start Date', fmtD(le.startDate));
  row('Initial Duration', `${le.months || '-'} months`);
  row('End Date', fmtD(le.endDate));

  // ── 4. financial terms ──
  secTitle(4, 'Financial Terms');
  if (ec > 0) {
    row('Monthly base rent', eur(m.rent));
    row('Energy credit', `+ ${eur(ec)}`, `included - covers electricity up to ${eur(ec)}/month`);
    row('Monthly total', eur(m.monthlyTotal != null ? m.monthlyTotal : (Number(m.rent) || 0) + ec), 'all-in as above - other utilities excluded');
  } else {
    row('Monthly rent', eur(m.rent), 'utilities excluded');
  }
  const depM = `${m.depositMonths} month(s)' base rent`;
  row('Security deposit', eur(m.deposit), split > 0 && split < 100
    ? `${depM} - ${split}% (${eur(m.depositAtSigning != null ? m.depositAtSigning : m.deposit * split / 100)}) due at signing, ${100 - split}% (${eur(m.depositAtMoveIn != null ? m.depositAtMoveIn : m.deposit * (100 - split) / 100)}) upon move-in`
    : `${depM} - refundable`);
  (pa.extras || []).forEach(x => row(x.label, eur(x.amount)));
  need(30);
  y -= 2;
  page.drawRectangle({ x: M, y: y - 8, width: W, height: 26, color: rgb(0.97, 0.96, 0.93) });
  page.drawText('TOTAL DUE AT SIGNING', { x: M + 10, y, size: 9, font: bold, color: INK, characterSpacing: 1.5 });
  const totTxt = eur(m.dueAtSigning);
  page.drawText(totTxt, { x: A4[0] - M - bold.widthOfTextAtSize(totTxt, 13) - 10, y: y - 1, size: 13, font: bold, color: INK });
  y -= 26;
  const feeAmt = m.feeMode === 'months'
    ? `${m.feeMonths || 1} month(s)' base rent = ${eur(m.fee)}`
    : `${m.feePct != null ? m.feePct : 12}% of annual rent = ${eur(m.fee)}`;
  const feeWhen = m.feeDue === 'move-in' ? 'due upon move-in, not at pre-agreement signing'
    : m.feeDue === 'signing' ? 'due at signing (included in the total above)'
    : 'due separately, not at signing';
  para(`Note: Agency fee: ${feeAmt}${m.feeVatPct ? ` + VAT ${m.feeVatPct}% (${eur(m.feeVat)}) = ${eur(m.feeTotal)}` : ''} - ${feeWhen}.${pa.note ? ' ' + pa.note : ''}`, italic, 8.5, SOFT);

  // ── 5. general conditions ──
  secTitle(5, 'General Conditions');
  const conds = [
    "The security deposit shall be returned at the end of the lease (within 15 days after move-out / keys handover), subject to verification of the property's condition and settlement of any outstanding utility balance. Normal wear and tear caused by ordinary and reasonable use of the property shall not be deemed damage and shall not be deducted from the security deposit.",
    'The security deposit shall be fully returned if the Landlord cancels the agreement for any reason, or if the Tenant cancels with justified cause.',
    'The Tenant shall maintain the property in good condition and promptly report any defects or issues.',
    'Monthly rent shall be paid by the 5th of each month via bank transfer.',
  ];
  if (ec > 0) conds.push(`The monthly payment of ${eur(m.monthlyTotal != null ? m.monthlyTotal : (Number(m.rent) || 0) + ec)} consists of: (a) base rent of ${eur(m.rent)} and (b) an energy allowance of ${eur(ec)} included in the monthly fee. The energy allowance covers electricity consumption up to ${eur(ec)}/month; should monthly electricity costs exceed it, the Tenant shall pay only the surplus directly to the Landlord upon presentation of the utility bill. If consumption is equal to or below the allowance, no additional charge applies.`);
  if (le.reason) conds.push(`Transitional need: ${le.reason}.`);
  conds.push(`${ec > 0 ? 'All other utilities (gas, water, internet)' : 'All utilities (electricity, gas, water, internet)'} are excluded from the monthly rent and are the sole responsibility of the Tenant.`);
  if (tenants.length > 1) conds.push('All co-tenants are jointly and severally liable for the full rent and all obligations hereunder.');
  (pa.customClauses || []).forEach(c => conds.push(c));
  conds.push('Any changes to these terms must be agreed upon in writing by both parties.');
  conds.forEach((c, i) => {
    const num = `5.${i + 1}`;
    need(14);
    page.drawText(num, { x: M, y, size: 8.5, font: bold, color: INK });
    para(c, font, 8.5, INK, W - 26, 1.4, M + 26);
    y -= 3;
  });

  // ── 6. signatures ──
  secTitle(6, 'Signatures');
  const when = pa.acceptedAt ? fmtD(pa.acceptedAt) : fmtD(new Date().toISOString());
  para(`Roma, ${when}`, font, 9, INK); y -= 4;
  need(96);
  const colW = W / 2 - 10;
  const boxTop = y;
  [['LANDLORD', (pa.landlord || {}).name || '', M], ['TENANT' + (tenants.length > 1 ? 'S' : ''), tenants.map(t => t.fullName).filter(Boolean).join(' - '), M + colW + 20]].forEach(([cap, who, x]) => {
    page.drawText(cap, { x, y: boxTop, size: 7.5, font, color: SOFT, characterSpacing: 1.5 });
    page.drawRectangle({ x, y: boxTop - 66, width: colW, height: 56, borderColor: LINE, borderWidth: .8 });
    page.drawText('(signature)', { x: x + 8, y: boxTop - 20, size: 6.5, font: italic, color: SOFT });
    const sigNames = cap.startsWith('TENANT') ? tenants.map(t => t.signature || t.fullName).filter(Boolean) : [who];
    let sy = boxTop - 38;
    sigNames.slice(0, 3).forEach(n => { page.drawText(clean(n), { x: x + 10, y: sy, size: sigNames.length > 2 ? 9.5 : 12, font: italic, color: INK }); sy -= sigNames.length > 2 ? 12 : 15; });
    page.drawText(clean(who).slice(0, 60), { x, y: boxTop - 76, size: 7.5, font, color: SOFT });
  });
  y = boxTop - 92;
  if (pa.consent && pa.consent.at) {
    para(`Digitally accepted with typed signature(s) - recorded ${String(pa.consent.at).replace('T', ' ').slice(0, 16)} UTC - IP ${pa.consent.ip || '-'} - boomrome.com/pre-agreement`, font, 7, SOFT);
  }

  foot(page);
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
