// Test-only defects injected into the real Owner Command modules.
const mutants = {
  first_match: ['api/segretaria/_owner-command.js',
    'matches.slice(0, OWNER_COMMAND_LIMITS.candidates).map(([collection, row]) => projectCandidate(collection, row))',
    'matches.slice(0, 1).map(([collection, row]) => projectCandidate(collection, row))'],
  stale_contact: ['api/segretaria/_owner-command.js',
    'if (!contacts.phones.includes(address) || phone(conversation.contactPhone) !== address)',
    'if (false)'],
  idempotency_conflict: ['api/segretaria/_owner-command.js',
    "if (existing?.source !== 'owner-command' || existing.ownerCommand?.requestHash !== requestHash)",
    "if (false && (existing?.source !== 'owner-command' || existing.ownerCommand?.requestHash !== requestHash))"],
  caller_id_auth: ['api/segretaria/owner-command.js',
    "const auth = await requireRole(req, res, ['admin']);",
    "const auth = { uid: 'admin' };"],
  generic_retry_target: ['api/segretaria/_prepare.js',
    'expectedTarget = persistedTarget;',
    'expectedTarget = expectedTarget;'],
  channel_target: ['api/segretaria/_prepare.js',
    "|| current.channel !== expectedTarget.channel || current.address !== expectedTarget.address",
    "|| false"],
  owner_budget: ['api/segretaria/_owner-command.js',
    "if (!time.afford(35_000)) fail('preparation_time_budget', 503);",
    "if (false) fail('preparation_time_budget', 503);"],
  approval_target: ['api/segretaria/_dispatch.js',
    "if (f.source === 'owner-command') {",
    "if (false && f.source === 'owner-command') {"],
};

export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context), name = process.env.OWNER_COMMAND_MUTATION, mutant = mutants[name];
  if (!mutant || !url.endsWith('/' + mutant[0])) return loaded;
  const source = String(loaded.source);
  if (source.split(mutant[1]).length !== 2) throw new Error('mutation_target_not_unique_' + name);
  process.stderr.write('MUTATION_APPLIED:' + name + '\n');
  return { ...loaded, source: source.replace(mutant[1], mutant[2]) };
}
