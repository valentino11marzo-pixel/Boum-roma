// Loader ESM di tests/palazzo/leftovers.mjs: 'stripe' e 'nodemailer' finti
// (nessun addebito, nessuna email vera); jspdf e pdf-lib restano VERI (il
// PDF del contratto si impagina davvero quando la guardia lo permette).
// Con LEFTOVERS_MUTATION rimette UN difetto nel sorgente caricato (mai nei
// file del repo) e la suite deve cadere: il driver delle mutazioni in fondo
// a leftovers.mjs lo verifica, un processo figlio per difetto.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'stripe') return { url: new URL('../rata/stripe-mock.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === 'nodemailer') return { url: new URL('../notify/nodemailer-mock.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}

// [file, da, a] — «da» può essere una RegExp globale quando il difetto
// originale stava in più punti (la guardia del PDF è in tre funzioni, in
// profondità: toglierne una sola lascia le altre a fare il lavoro).
export const MUTATIONS = {
  'model-pdf': ['/api/sign/_contractpdf.js', /CS\.noModelPdf\(contract\)/g, 'false'],
  'lookup-409': ['/api/magic-sign/lookup.js', 'if (CS.isPaper(contract) || CS.isPlaceholder(contract)) {', 'if (false) {'],
  'snapshot-unsigned': ['/api/telegram/webhook.js', "c.status !== 'draft' && !CS.notSignable(c) && ", "c.status !== 'draft' && "],
  'snapshot-reported': ['/api/telegram/webhook.js', "payments.filter(p => RENT.paymentState(p, now) === 'overdue')", "payments.filter(p => ['overdue', 'reported'].includes(RENT.paymentState(p, now)))"],
  'ocr-host': ['/api/documents/ocr.js', "  if (!storageUrlAllowed(url)) throw new Error('fileUrl_not_allowed');\n", ''],
  'ocr-landlord': ['/api/documents/ocr.js', "requireRole(req, res, ['admin'])", "requireRole(req, res, ['admin', 'landlord'])"],
  'qa-landlord': ['/api/documents/qa.js', "requireRole(req, res, ['admin'])", "requireRole(req, res, ['admin', 'landlord'])"],
  'webhook-costs': ['/api/stripe-webhook.js', "      receiptUrl: receiptUrl || '',\n      // La carta incassa sul conto Stripe di BOOM", "      serviceFeeEur: fee, stripeCostEur, cardCountry, cardBrand, receiptUrl: receiptUrl || '',\n      // La carta incassa sul conto Stripe di BOOM"],
  'report-withdraw': ['/api/payments/report.js', ": withdrawFields(p,{by:'tenant'});", ': {tenantReported:false,tenantReportedAt:null};'],
  'review-withdraw': ['/api/payments/report.js', "{...withdrawFields(p,{by:'admin',reason,reviewId:auditId}),tenantReportReviewId:auditId,", '{tenantReported:false,tenantReportedAt:null,tenantReportReviewId:auditId,'],
  'notify-footer': ['/api/notify/send.js', 'fine(FOOTER[emailLang(p)])', 'fine(FOOTER.it)'],
  'notify-link-cut': ['/api/notify/send.js', "btn(String(p.portal_link).trim(), esc(p.cta_text))", 'btn(clip(p.portal_link, 300), esc(p.cta_text))'],
  'caller-privacy': ['/api/phone/agent-tools.js', "kind: t.role === 'cotenant' ? 'cotenant' : 'tenant', firstName,", "kind: t.role === 'cotenant' ? 'cotenant' : 'tenant', firstName, propertyLabel: t.propertyLabel, contractId: t.contractId,"],
  'send-sign-guard': ['/api/preagreement/send-sign.js', 'if (deny) return res.status(403).json({ ok: false, error: deny });', 'if (false) return null;'],
  'resolve-guard': ['/api/preagreement/resolve.js', 'if (deny) return res.status(403).json({ ok: false, error: deny });', 'if (false) return null;'],
};

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  const key = process.env.LEFTOVERS_MUTATION || '';
  const m = MUTATIONS[key];
  if (!m || !url.endsWith(m[0]) || result.source == null) return result;
  const source = String(result.source);
  const next = source.replace(m[1], m[2]);
  if (next === source) throw new Error('mutazione ' + key + ' non applicata: il sorgente è cambiato');
  return { ...result, source: next };
}
