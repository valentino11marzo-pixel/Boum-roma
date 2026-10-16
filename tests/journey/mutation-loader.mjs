let mutation;
export function initialize(data) { mutation = data; }
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith('/api/journey/_run.js')) return result;
  let source = String(result.source);
  const before = mutation === 'start-date'
    ? 'due: dHandover != null && dHandover <= -3 && dHandover >= -6'
    : 'const handedOn = confirmedHandoverDate(c)';
  const after = mutation === 'start-date'
    ? 'due: dStart != null && dStart <= -3 && dStart >= -6'
    : "const handedOn = String(c.verbaleConsegna?.at || '').slice(0, 10)";
  if (!source.includes(before)) throw new Error('Mutation target missing');
  return { ...result, source: source.replace(before, after) };
}
