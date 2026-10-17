// Change only the real handler under test; dependencies/IO use its usual loader.
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith('/api/contracts/verbale.js')) return result;
  const source = String(result.source);
  const replacements = {
    name: ["if (!clip(firma && firma.name, 60))", "if (false)"],
    image: ["throw error;", "/* mutation: discard an unreadable signature */"],
  };
  const pair = replacements[process.env.BOOM_VERBALE_MUTATION];
  if (!pair || !source.includes(pair[0])) throw new Error('Mutation target missing');
  return { ...result, source: source.replace(pair[0], pair[1]) };
}
