export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'nodemailer') return { url: new URL('./smtp.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  let source = result.source && String(result.source);
  if (process.env.DELIVERY_MUTATION === 'missing-intent' && url.endsWith('/api/sign/_finalize.js')) {
    source = source.replace('fields: { ...fields, registrationPackEmail: email }', 'fields: { ...fields }');
  }
  if (process.env.DELIVERY_MUTATION === 'receipt-blind-claim' && url.endsWith('/api/fiscal/_ricevuta.js')) {
    source = source.replace("if (entry?.status === 'sent')", "if (false && entry?.status === 'sent')")
      .replace("if (entry?.status === 'sending' || (entry?.status === 'uncertain' && !force))", "if (false)");
  }
  if (process.env.DELIVERY_MUTATION === 'package-blind-claim' && url.endsWith('/api/sign/_finalize.js')) {
    source = source.replace('if (!v || !packRetryEligible(v.data)) return null;', 'if (!v) return null;');
  }
  return source && source !== String(result.source) ? { ...result, source } : result;
}
