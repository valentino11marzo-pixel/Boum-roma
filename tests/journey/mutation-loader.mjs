let mutation;
export function initialize(data) { mutation = data; }
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith('/api/journey/_run.js')) return result;
  let source = String(result.source);
  const MAP = {
    'start-date': ['due: dHandover != null && dHandover <= -3 && dHandover >= -6', 'due: dStart != null && dStart <= -3 && dStart >= -6'],
    'unverified-report': ['const handedOn = confirmedHandoverDate(c)', "const handedOn = String(c.verbaleConsegna?.at || '').slice(0, 10)"],
    // La provvigione pagata (o in corso) torna a essere sollecitata.
    'fee-paid': ["if (RENT.paymentBlockReason(inv, 'invoice') || inv.tenantReported === true) return null;", 'if (false) return null;'],
    // Il runner smette di passare la provvigione alle email.
    'fee-runner': ['walletUrl: tenantWalletUrl(id), fee })', 'walletUrl: tenantWalletUrl(id), fee: null })'],
  };
  const [before, after] = MAP[mutation] || [];
  if (!before || !source.includes(before)) throw new Error('Mutation target missing');
  return { ...result, source: source.replace(before, after) };
}
