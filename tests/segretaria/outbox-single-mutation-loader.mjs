// Test-only loader: reintroduce one concrete defect in the real loaded module.
// Production files on disk and the fake network boundary remain untouched.
const mutants = {
  selection: ['api/segretaria/_delivery-guard.js',
    "if (expectedSelection && !singleSelectionMatches(id, current, expectedSelection))",
    'if (false)'],
  ack_binding: ['api/segretaria/_delivery-guard.js',
    'if (expectedSelection || receipt?.single) {', 'if (false) {'],
  claim_cas: ['api/segretaria/_delivery-guard.js',
    'precondition: { updateTime: queue.updateTime }', 'precondition: { exists: true }'],
  case_cas: ['api/segretaria/_delivery-guard.js',
    'precondition: { updateTime: task.updateTime }', 'precondition: { exists: true }'],
  expiry: ['api/segretaria/_delivery-guard.js',
    "if (window !== 'current')", 'if (false)'],
  exact_text: ['api/homie/_wa-single-protocol.js',
    '? { actionId, phone, text } : null;', '? { actionId, phone, text: text.trim().slice(0, 2000) } : null;'],
  one_payload: ['api/homie/wa-outbox-single.js',
    'messages: [result.message]', 'messages: [result.message, result.message]'],
  inspect_readonly: ['api/homie/wa-outbox-single.js',
    '? await inspectSegretariaDelivery({ id: actionId, action })',
    '? await claimSegretariaDelivery({ id: actionId, action })'],
  inspect_private: ['api/homie/wa-outbox-single.js',
    '{ ok: true, actionId, ...inspected }', '{ ok: true, actionId, ...inspected, phone: message.phone }'],
};
export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context), name = process.env.HOMIE_SINGLE_TEST_MUTATION;
  const mutant = mutants[name];
  if (!mutant || !url.endsWith('/' + mutant[0])) return loaded;
  const source = String(loaded.source);
  if (source.split(mutant[1]).length !== 2) throw new Error('mutation_target_not_unique_' + name);
  process.stderr.write('MUTATION_APPLIED:' + name + '\n');
  return { ...loaded, source: source.replace(mutant[1], mutant[2]) };
}
