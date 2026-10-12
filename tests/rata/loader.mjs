// Loader ESM di tests/rata/soldi.mjs: 'stripe' e 'nodemailer' finti (nessun
// addebito, nessuna email vera), i pacchetti pesanti che non c'entrano
// stubbati come in tests/money. Con RATA_MUTATION rimette UN difetto nel
// sorgente caricato (mai nei file del repo: altri lavorano in parallelo),
// e la suite deve cadere — tests/rata/soldi-mutate.mjs lo verifica.
const HEAVY = new Set(['pdf-lib', 'passkit-generator', 'imapflow', 'sharp', 'jspdf']);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'stripe') return { url: new URL('./stripe-mock.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === 'nodemailer') return { url: new URL('./mail-mock.mjs', import.meta.url).href, shortCircuit: true };
  if (HEAVY.has(specifier)) return { url: new URL('../money/anything-mock.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}

// [file, da, a] — il difetto che la suite deve accorgersi di avere davanti.
const MUTATIONS = {
  'card-gate': ['/api/payments/link.js', 'if (!policy.available) {', 'if (false) {'],
  'fee-line': ['/api/payments/pay.js', '    if (fee > 0) {\n      lineItems.push', '    if (true) {\n      lineItems.push'],
  'utc-date': ['/api/payments/rata.js', 'date > latestReportDay()', 'date > new Date().toISOString().slice(0, 10)'],
  'second-report': ['/api/payments/rata.js', 'if (repeat || nothingNew) {', 'if (true) {'],
  'withdraw-proof': ['/api/payments/rata.js', 'tenantReportDate: null, tenantNotes: null, proofUrl: null, proofName: null, tenantReports: null,', 'tenantReportDate: null,'],
  'receipt-email': ['/api/stripe-webhook.js', '[session.customer_details && session.customer_details.email, session.customer_email, contract && contract.tenantEmail]', '[session.customer_email]'],
  'double-alarm': ['/api/stripe-webhook.js', 'const reported = pay.tenantReported === true;', 'const reported = false;'],
  'utc-paid': ['/api/stripe-webhook.js', /romeDay\(now\)/g, 'now.slice(0, 10)'],
  'moneyback-patch': ['/api/stripe-webhook.js', 'if (rataPatch) {', 'if (false) {'],
  'moneyback-mine': ['/api/stripe-webhook.js', "const mine = String(pay.status || '') === 'paid'", 'const mine = true || String(pay.status || \'\') === \'paid\''],
  'pi-metadata': ['/api/payments/link.js', '...(isInvoice ? {} : { payment_intent_data:', '...(true ? {} : { payment_intent_data:'],
  'return-rata': ['/api/payments/link.js', "success_url: back ? back + '&return=success'", "success_url: false ? back + '&return=success'"],
  'report-rome-default': ['/api/payments/rata.js', 'const reportDate = date || romeDay(new Date());', 'const reportDate = date || new Date().toISOString().slice(0, 10);'],
};

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  const m = MUTATIONS[process.env.RATA_MUTATION || ''];
  if (!m || !url.endsWith(m[0]) || result.source == null) return result;
  const source = String(result.source);
  const next = source.replace(m[1], m[2]);
  if (next === source) throw new Error('mutazione ' + process.env.RATA_MUTATION + ' non applicata: il sorgente è cambiato');
  return { ...result, source: next };
}
