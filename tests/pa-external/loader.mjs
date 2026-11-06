// Loader della suite: stripe → mock (constructEvent senza firma), nodemailer
// → cattura (registration-delivery/smtp.mjs). pdf-lib e jspdf VERI.
// PAEXT_MUTATION reintroduce un difetto per volta (tests/pa-external/mutate.mjs).
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'stripe') return { url: new URL('../money/stripe-mock.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === 'nodemailer') return { url: new URL('../registration-delivery/smtp.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
const MUTATIONS = {
  'no-occupancy': ['/api/contracts/_external.js', "await step('occupancy',async () => applyOccupancy(contractId,c));", ''],
  'no-obligations': ['/api/contracts/_external.js', 'const r = await writeObligations(contractId,ob);', 'const r = {failed:0,created:0};'],
  'welcome-twice': ['/api/contracts/_external.js', "if (c.welcomeEmailSent) return {ok:true,skipped:'already_sent',at:c.welcomeEmailSentAt||null};", '',
    "if (w && w.status === 'sent') return", 'if (false) return'],
  'welcome-partial-twice': ['/api/contracts/_external.js', "if (w && w.status === 'sent') return", 'if (false) return'],
  'fee-at-signing': ['/api/preagreement/_fee.js', "if (fee.due === 'signing') return", 'if (false) return'],
  // la fattura esistente RISCRITTA con la cifra di adesso (il 409 di Firestore
  // è il guardiano: qui lo si scavalca apposta)
  'invoice-rewritten': ['/api/preagreement/_external.js', 'if (!inv) {', 'if (true) {',
    "await fsCreate('invoices', doc, id);", "await fsCommit([{ docPath: 'invoices/' + id, fields: doc, precondition: { exists: !!inv } }]);"],
  'profile-role-blind': ['/api/preagreement/_external.js', "if (hits[0].role === who.role) { action = 'link'; userId = hits[0].id; }", "if (true) { action = 'link'; userId = hits[0].id; }"],
  'profile-duplicate': ['/api/preagreement/_external.js', "if (h.length) return { hits: h, by: 'conversione' };", ''],
  'no-pa-stamp': ['/api/stripe-webhook.js', 'if (inv.preAgreementId) {', 'if (false) {'],
  'schedule-unasked': ['/api/contracts/_external.js', 'if (b.schedule === true) {', 'if (true) {'],
  // il PDF che non riporta i dati si carica senza che nessuno lo decida
  'pdf-mismatch-silent': ['/api/contracts/_external.js', "b.acceptMismatch !== true) return", 'false) return'],
  // un benvenuto dall'esito incerto si rimanda da solo (doppia email)
  'welcome-uncertain-resent': ['/api/contracts/_external.js', "if (resolve !== 'resend') return {ok:false,error:'welcome_uncertain'", "if (false) return {ok:false,error:'welcome_uncertain'"],
  // un timeout SMTP diventa «non partito», quindi rimandabile al tap dopo
  'timeout-as-failed': ['/api/contracts/_external.js', ": (threw || Object.values(oc).includes('uncertain')) ? 'uncertain' : 'failed';", ": 'failed';"],
  // il Gestore sollecita una provvigione già pagata
  'feerem-paid': ['/api/employees/gestore.js', "if (RENT.paymentBlockReason(inv, 'invoice') || inv.tenantReported === true) return null;", 'if (false) return null;'],
};
export async function load(url, context, nextLoad) {
  const out = await nextLoad(url, context);
  const m = MUTATIONS[process.env.PAEXT_MUTATION || ''];
  if (!m || !url.endsWith(m[0]) || !out.source) return out;
  let src = String(out.source);
  for (let i = 1; i < m.length; i += 2) {
    if (!src.includes(m[i])) throw new Error('mutation anchor missing: ' + process.env.PAEXT_MUTATION);
    src = src.replace(m[i], m[i + 1]);
  }
  return { ...out, source: src };
}
