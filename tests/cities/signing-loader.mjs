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
};
export async function load(url, context, nextLoad) {
  const out = await nextLoad(url, context);
  const m = MUTATIONS[process.env.SIGNING_MUTATION || ''];
  if (!m || !url.endsWith(m[0]) || !out.source) return out;
  const src = String(out.source);
  if (!src.includes(m[1])) throw new Error('mutation anchor missing: ' + process.env.SIGNING_MUTATION);
  return { ...out, source: src.replace(m[1], m[2]) };
}
