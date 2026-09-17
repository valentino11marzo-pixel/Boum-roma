export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'stripe') return { url: new URL('./stripe-mock.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}

// Mutation checks restore each old defect only in the module loader: no
// shared workspace file is edited while other agents work in parallel.
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  const mutation = process.env.PAYMENT_LINKS_MUTATION;
  if (!mutation || !url.includes('/api/payments/')) return result;
  let source = String(result.source);
  if (mutation === 'guards' && /\/(pay|link|link-for)\.js$/.test(url)) {
    source = source.replace(/RENT\.paymentBlockReason\((pay|doc)(?:, kind === 'inv' \? 'invoice' : 'rent')?\)/g, "''");
  }
  if (mutation === 'report-state' && url.endsWith('/report.js')) source = source.replace("if (action === 'report' && !RENT.canPay(p))", 'if (false)');
  if (mutation === 'report-owner' && url.endsWith('/report.js')) source = source.replace('if (p.tenantId !== auth.uid)', 'if (false)');
  if (mutation === 'fee' && url.endsWith('/link.js')) source = source.replace('rentFee(amount, feeStats)', 'rentFee(amount)');
  if (mutation === 'return' && url.endsWith('/link.js')) source = source.replace("req.query.return === 'success'", 'false');
  if (mutation === 'reuse' && url.endsWith('/_checkout.js')) source = source.replace("if (!doc.checkoutSessionId)", 'if (true)');
  if (mutation === 'labels' && url.endsWith('/pay.js')) source = source.replace('if (RENT.isRentPayment(payment))', 'if (true)');
  return { ...result, source };
}
