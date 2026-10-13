import { resolve as moneyResolve } from '../money/loader.mjs';
let mutation;
export function initialize(data) { mutation = data?.mutation; }
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'stripe') return { url: new URL('./checkout-stripe-mock.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === 'nodemailer') return { url: new URL('../notify/nodemailer-mock.mjs', import.meta.url).href, shortCircuit: true };
  return moneyResolve(specifier, context, nextResolve);
}
export async function load(url, context, nextLoad) {
  const out = await nextLoad(url, context);
  const changes = {
    convert: ['submit.js', 'if (due === 0)', 'if (!(due > 0 && checkoutUrl))'],
    lock: ['submit.js', "return res.status(503).json({ ok: false, error: 'property_lock_unavailable' });", 'lock = { ok: true };'],
    rounding: ['_checkout.js', 'Math.round((n + Number.EPSILON) * 100)', 'Math.round(n) * 100'],
    addons: ['pay.js', 'checkoutParams({ ...pa, token }, paymentTerms)', 'checkoutParams({ ...pa, token }, { ...paymentTerms, addons: [] })'],
    snapshot: ['_checkout.js', 'const saved = pa.paymentTerms;', 'const saved = null;'],
  };
  const change = changes[mutation];
  if (change && url.endsWith('/api/preagreement/' + change[0])) {
    const source = String(out.source);
    if (!source.includes(change[1])) throw Error('Mutation target missing: ' + mutation);
    return { ...out, source: source.replace(change[1], change[2]) };
  }
  return out;
}
