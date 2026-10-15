// Restore exactly one historical defect in a real production module; IO still uses run.mjs.
const changes = {
  storage: ['_protocol.js', 'const originalPdfPath = `${path}/sealed/${pdfHash}-${randomUUID()}.pdf`;', 'const originalPdfPath = `${path}/sealed/${pdfHash}.pdf`;'],
  consent: ['submit.js', "if (!body.consent?.text || !body.consent?.hash) fail('missing_consent', 400);", "/* mutation: mandatory consent guard removed */"],
  retry: ['submit.js', 'if (mine.signedAt) { signedDoc = doc; break; }', "if (mine.signedAt) return res.status(200).json({ok:true, complete:doc.status==='complete', note:'already_signed'});"],
  cas: ['submit.js', 'precondition: { updateTime: current.updateTime }', 'precondition: { exists: true }'],
  fields: ['_protocol.js', "if (expected !== doc.documentHash) fail('document_changed');", '/* mutation: field fingerprint ignored */'],
  bytes: ['_protocol.js', "if (hash(bytes) !== doc.pdfHash) fail('document_changed');", '/* mutation: mutable original accepted */'],
  final: ['_finalize.js', "patch = { status: 'finalization_failed', signedPdfError:", "patch = { status: 'complete', signedPdfError:"],
};
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  const change = changes[process.env.BOOM_CUSTOM_SIGN_MUTATION];
  if (!change || !url.endsWith('/api/sign/custom/' + change[0])) return result;
  const source = String(result.source);
  if (!source.includes(change[1])) throw new Error('Mutation target missing');
  return { ...result, source: source.replace(change[1], change[2]) };
}
