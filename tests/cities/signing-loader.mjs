// tests/cities/signing-loader.mjs — the loader of tests/cities/signing.mjs.
// 'stripe' → the money suite's mock (it records every session the code would
// open: a signing desk must open NONE); 'nodemailer' → the capture of
// tests/registration-delivery/smtp.mjs (the emails, their attachments, a hook
// to make a send fail). pdf-lib is the REAL one: the order PDF is parsed.
//
// SIGNING_MUTATION reintroduces one defect at a time, on the source as it is
// loaded (the file on disk is never touched): the suite runs itself as a
// child with the mutation and expects its guard to hold.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'stripe') return { url: new URL('../money/stripe-mock.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === 'nodemailer') return { url: new URL('../registration-delivery/smtp.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}

const MUTATIONS = {
  // the signing branch of the till removed: only the belt stands between a
  // signing desk and a payment session
  'no-branch': ['/api/service-checkout.js', "    if (offer.chargeAt === 'signing') return createCityOrder(req, res, { offer, body, ip });\n", ''],
  // the terms version no longer checked: an old page's order is accepted
  'no-terms-check': ['/api/_cityorder.js', "if (String(body.termsV || '') !== T.v) return", 'if (false) return'],
  // the counter written without its version: two orders can take one number
  'blind-counter': ['/api/_cityorder.js', 'precondition: cnt ? { updateTime: cnt.updateTime } : { exists: false } },', 'precondition: cnt ? { exists: true } : { exists: false } },'],
  // the managed ticket that believes any token
  'any-token': ['/api/city-lead.js', 'if (!verifyOrderToken(id, token)) return', 'if (false) return'],
  // ── the charge at signing (stage A2) ──
  // the claim written without its version: two taps both go through
  'blind-claim': ['/api/payments/_citysign.js', "const claim = { docPath: 'leads/' + leadId, fields: { signing: sg }, precondition: { updateTime: v.updateTime } };", "const claim = { docPath: 'leads/' + leadId, fields: { signing: sg }, precondition: { exists: true } };"],
  // the withdrawal-window gate removed (CRD art. 14(4)(a)(ii))
  'no-window': ['/api/payments/_citysign.js', 'if (c.startNow === false && c.withdrawalEndsOn && facts.signedOn <= c.withdrawalEndsOn && !facts.early) {', 'if (false) {'],
  // Berlin's no-stacking gate removed (§3(3) WoVermRG)
  'no-stacking': ['/api/payments/_citysign.js', "if (fs) return refuse('law', 'stacking'", "if (false) return refuse('law', 'stacking'"],
  // the client email of the invoice not guarded on a resume
  'resend-email': ['/api/payments/_citysign.js', 'if (!sg.clientEmailSentAt) {\n    const m = invoiceEmail(', 'if (true) {\n    const m = invoiceEmail('],
  // the card's key not checked: an older card applies a newer draft
  'no-key-check': ['/api/payments/_citysign.js', "if (key != null && key !== s.key) return { ok: false, error: 'stale_card', lead, signing: s };", "if (false) return { ok: false, error: 'stale_card', lead, signing: s };"],
  // the INVOICE webhook without the order stamp
  'no-city-stamp': ['/api/stripe-webhook.js', 'if (inv.cityLeadId) {', 'if (false) {'],
  // ── the review of v1.8 ──
  // F4: the order PDF's body through wa() again (every letter outside WinAnsi deleted)
  'wa-body': ['/api/_cityorderpdf.js', 'lines(asTyped(p), body, SIZE, LEAD, INK);', 'lines(wa(p), body, SIZE, LEAD, INK);'],
  // F4: a name the PDF cannot print, and nobody told
  'no-pdf-alarm': ['/api/_cityorder.js', 'if (pdf && pdf.unprinted.length) {', 'if (false) {'],
  // F5: the register reads the order only, never its fee invoice
  'register-lead-only': ['/api/ops/conservazione.js', "return typeof id === 'string' && invoices && invoices.has(id) ? invoices.get(id) : null;", 'return null;'],
  // ── the card flip (06/11/2026): every reader asks the desk's mode TODAY
  // again, and the orders booked at signing before the flip are lost ──
  // the mode the order was sold under ignored
  'order-mode-ignored': ['/api/_market.js', "if (/^book_/.test(String(l.id || '')) && l.city && typeof l.city === 'object' && l.city.chargeAt === 'signing') return 'signing';", ''],
  // the managed ticket gated on the desk's mode
  'ticket-by-mode': ['/api/city-lead.js', 'if (!known || !CITY_MARKETS[cityKey].order || !ORDER_RE.test(id)) {', "if (!known || chargeAtOf(cityKey) !== 'signing' || !ORDER_RE.test(id)) {"],
  // /firmato's fee gated on the desk's mode
  'fee-by-mode': ['/api/payments/_citysign.js', "if (!desk || !desk.order) return { ok: false, error: 'not_signing_desk' };", "if (!desk || desk.chargeAt !== 'signing') return { ok: false, error: 'not_signing_desk' };"],
  // the monthly register gated on the desk's mode
  'register-by-mode': ['/api/ops/conservazione.js', 'if (!desk || !desk.order || !desk.order.prefix) continue;', "if (!desk || desk.chargeAt !== 'signing' || !desk.order || !desk.order.prefix) continue;"],
};
export async function load(url, context, nextLoad) {
  const out = await nextLoad(url, context);
  const m = MUTATIONS[process.env.SIGNING_MUTATION || ''];
  if (!m || !url.endsWith(m[0]) || !out.source) return out;
  const src = String(out.source);
  if (!src.includes(m[1])) throw new Error('mutation anchor missing: ' + process.env.SIGNING_MUTATION);
  return { ...out, source: src.replace(m[1], m[2]) };
}
