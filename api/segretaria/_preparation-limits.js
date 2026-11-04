// Pure reservation: the caller must commit these fields with the case lease
// and total-attempt counter in one CAS. A returned reservation is not a write.
const CASE_ID = /^sg_[a-f0-9]{32}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
const fail = error => ({ ok: false, error });

export function reserveAutomaticAttempt({ settings, counter, caseId }) {
  if (typeof caseId !== 'string' || !CASE_ID.test(caseId)) return fail('invalid_case');
  if (settings != null && !record(settings)) return fail('preparation_limit_config_invalid');
  const dailyCap = settings?.prepareAutoDailyCap === undefined ? 20 : settings.prepareAutoDailyCap;
  const caseCap = settings?.prepareAutoCaseDailyCap === undefined ? 2 : settings.prepareAutoCaseDailyCap;
  if (!nonnegative(dailyCap) || dailyCap > 200 || !nonnegative(caseCap) || caseCap > 10)
    return fail('preparation_limit_config_invalid');

  let count = 0, byCase = {};
  if (counter !== null) {
    if (!record(counter) || !nonnegative(counter.count)) return fail('preparation_limit_counter_invalid');
    if (Object.hasOwn(counter, 'automaticBudget')) {
      const automatic = counter.automaticBudget;
      if (!record(automatic) || automatic.version !== 1 || !nonnegative(automatic.count)
        || !record(automatic.byCase) || automatic.count > counter.count)
        return fail('preparation_limit_counter_invalid');
      let total = 0;
      for (const [id, attempts] of Object.entries(automatic.byCase)) {
        if (!CASE_ID.test(id) || !Number.isSafeInteger(attempts) || attempts <= 0)
          return fail('preparation_limit_counter_invalid');
        total += attempts;
        if (!Number.isSafeInteger(total)) return fail('preparation_limit_counter_invalid');
      }
      if (total !== automatic.count) return fail('preparation_limit_counter_invalid');
      count = automatic.count;
      byCase = automatic.byCase;
    } else if (counter.count !== 0) {
      // Old telemetry proves zero automatic attempts only when every recorded
      // attempt is manual. Never reset unknown history into a fresh allowance.
      if (!record(counter.triggers) || counter.triggers.manual !== counter.count
        || Object.entries(counter.triggers).some(([key, value]) => !nonnegative(value)
          || (key !== 'manual' && value !== 0)))
        return fail('preparation_limit_history_unknown');
    }
  }
  if (count >= dailyCap) return fail('preparation_daily_limit');
  if ((byCase[caseId] || 0) >= caseCap) return fail('preparation_case_daily_limit');
  return { ok: true, fields: { automaticBudget: { version: 1, count: count + 1,
    byCase: { ...byCase, [caseId]: (byCase[caseId] || 0) + 1 } } } };
}
