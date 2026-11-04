// Pure spend guard: no model, credentials, network or persisted state.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reserveAutomaticAttempt } from '../../api/segretaria/_preparation-limits.js';

const A = 'sg_' + 'a'.repeat(32), B = 'sg_' + 'b'.repeat(32);
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
const reserve = (counter = null, settings = {}, caseId = A) => reserveAutomaticAttempt({ settings, counter, caseId });
const denied = (result, error) => assert.deepEqual(result, { ok: false, error });
const tracked = (byCase, count = Object.values(byCase).reduce((sum, value) => sum + value, 0), total = count) =>
  ({ count: total, automaticBudget: { version: 1, count, byCase } });

check('new day reserves exactly one automatic attempt', () => {
  assert.deepEqual(reserve(), { ok: true, fields: { automaticBudget: { version: 1, count: 1, byCase: { [A]: 1 } } } });
});
check('empty legacy counter starts the automatic ledger', () => assert.equal(reserve({ count: 0 }).ok, true));
check('absent settings use defaults', () => assert.equal(reserveAutomaticAttempt({ counter: null, caseId: A }).ok, true));
check('zero daily cap denies the first attempt', () => denied(reserve(null, { prepareAutoDailyCap: 0 }), 'preparation_daily_limit'));
check('zero case cap denies the first attempt', () => denied(reserve(null, { prepareAutoCaseDailyCap: 0 }), 'preparation_case_daily_limit'));
for (const [field, values] of Object.entries({ prepareAutoDailyCap: [-1, 201, 1.5, '20', null, true, NaN, Infinity],
  prepareAutoCaseDailyCap: [-1, 11, 0.5, '2', null, false, NaN, Infinity] })) {
  for (const value of values) check('invalid configured cap fails closed: ' + field + ' / ' + String(value), () =>
    denied(reserve(null, { [field]: value }), 'preparation_limit_config_invalid'));
}
for (const settings of [[], 'config', new Date(0)]) check('malformed settings fail closed: ' + Object.prototype.toString.call(settings), () =>
  denied(reserve(null, settings), 'preparation_limit_config_invalid'));
check('invalid target cannot become a ledger key', () => denied(reserve(null, {}, 'sg_bad'), 'invalid_case'));
for (const counter of [undefined, {}, [], { count: -1 }, { count: 0.5 }, { count: '0' }, { count: Number.MAX_SAFE_INTEGER + 1 }]) {
  check('malformed total counter fails closed: ' + JSON.stringify(counter), () =>
    denied(reserveAutomaticAttempt({ settings: {}, counter, caseId: A }), 'preparation_limit_counter_invalid'));
}
for (const counter of [{ count: 1 }, { count: 2, triggers: { manual: 1, inbound: 1 } },
  { count: 2, triggers: { manual: 2, inbound: 1 } }, { count: 2, triggers: { manual: '2' } },
  { count: 2, triggers: { manual: 2, other: -1 } }]) {
  check('unknown or contradictory legacy history cannot buy a fresh allowance: ' + JSON.stringify(counter), () =>
    denied(reserve(counter), 'preparation_limit_history_unknown'));
}
check('proven manual-only history consumes no automatic quota', () => {
  assert.deepEqual(reserve({ count: 80, triggers: { manual: 80, inbound: 0 } }), reserve(null));
});
for (const automaticBudget of [null, [], { version: 2, count: 0, byCase: {} },
  { version: 1, count: -1, byCase: {} }, { version: 1, count: 0, byCase: [] },
  { version: 1, count: 1, byCase: { wrong: 1 } }, { version: 1, count: 0, byCase: { [A]: 0 } },
  { version: 1, count: 1, byCase: { [A]: '1' } }, { version: 1, count: 1, byCase: { [A]: 0.5 } }]) {
  check('invalid automatic ledger fails closed: ' + JSON.stringify(automaticBudget), () =>
    denied(reserve({ count: 10, automaticBudget }), 'preparation_limit_counter_invalid'));
}
check('ledger sum must equal its count', () => denied(reserve(tracked({ [A]: 1 }, 2)), 'preparation_limit_counter_invalid'));
check('automatic count cannot exceed the total counter', () => denied(reserve(tracked({ [A]: 1 }, 1, 0)), 'preparation_limit_counter_invalid'));
check('sum overflow cannot pass validation', () => denied(reserve(tracked({ [A]: Number.MAX_SAFE_INTEGER, [B]: 1 }, Number.MAX_SAFE_INTEGER)),
  'preparation_limit_counter_invalid'));
check('default per-case cap stops a third attempt but permits another case', () => {
  denied(reserve(tracked({ [A]: 2 })), 'preparation_case_daily_limit');
  assert.equal(reserve(tracked({ [A]: 2 }), {}, B).ok, true);
});
const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, index) => ['sg_' + index.toString(16).padStart(32, '0'), 1]));
check('default daily cap stops attempt twenty-one', () => denied(reserve(tracked(twenty)), 'preparation_daily_limit'));
check('explicit caps permit their final slot and then stop', () => {
  const settings = { prepareAutoDailyCap: 2, prepareAutoCaseDailyCap: 2 };
  assert.equal(reserve(tracked({ [A]: 1 }), settings).fields.automaticBudget.count, 2);
  denied(reserve(tracked({ [A]: 2 }), settings), 'preparation_daily_limit');
});
check('configuration upper bounds are accepted', () => assert.equal(reserve(null, { prepareAutoDailyCap: 200, prepareAutoCaseDailyCap: 10 }).ok, true));
check('reservation preserves other cases and does not mutate either input', () => {
  const counter = tracked({ [A]: 1, [B]: 1 }, 2, 9), settings = { prepareAutoDailyCap: 20 };
  const before = structuredClone({ counter, settings });
  Object.freeze(counter.automaticBudget.byCase); Object.freeze(counter.automaticBudget); Object.freeze(counter); Object.freeze(settings);
  const result = reserve(counter, settings);
  assert.deepEqual(result.fields.automaticBudget, { version: 1, count: 3, byCase: { [A]: 2, [B]: 1 } });
  assert.deepEqual({ counter, settings }, before);
  result.fields.automaticBudget.byCase[B] = 7;
  assert.equal(counter.automaticBudget.byCase[B], 1);
});

// Reintroduce the costly defects: each real behavioral assertion must reject
// its mutated implementation, not just find a protective string in the source.
const source = await readFile(new URL('../../api/segretaria/_preparation-limits.js', import.meta.url), 'utf8');
for (const [name, before, after, input, error] of [
  ['daily cap removed', 'if (count >= dailyCap)', 'if (false)', { settings: {}, counter: tracked(twenty), caseId: A }, 'preparation_daily_limit'],
  ['case cap removed', 'if ((byCase[caseId] || 0) >= caseCap)', 'if (false)', { settings: {}, counter: tracked({ [A]: 2 }), caseId: A }, 'preparation_case_daily_limit'],
  ['legacy history silently reset', 'return fail(\'preparation_limit_history_unknown\');', 'count = 0;', { settings: {}, counter: { count: 5 }, caseId: A }, 'preparation_limit_history_unknown'],
  ['mismatched sum accepted', 'if (total !== automatic.count)', 'if (false)', { settings: {}, counter: tracked({ [A]: 1 }, 2), caseId: A }, 'preparation_limit_counter_invalid'],
]) {
  assert.ok(source.includes(before), 'mutation target must exist: ' + name);
  const mutated = await import('data:text/javascript;base64,' + Buffer.from(source.replace(before, after)).toString('base64'));
  check('mutation killed: ' + name, () => assert.throws(() => denied(mutated.reserveAutomaticAttempt(input), error)));
}
console.log(`\n${checks} checks passed; no network or model calls.`);
