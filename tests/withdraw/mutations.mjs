// tests/withdraw/mutations.mjs — the defects the suite must catch, one per
// run (tests/withdraw/run.mjs spawns itself with WITHDRAW_MUTATION=<name>;
// tests/withdraw/loader.mjs rewrites api/withdraw.js before it is loaded).
// Each entry: [file suffix, anchor, replacement, anchor, replacement, …]. A
// missing anchor fails loudly: a mutation that no longer applies is a hole.
export const MUTATIONS = {
  // the answer says whether an order matched (enumeration)
  'answer-reveals-match': ['/api/withdraw.js',
    '  try { await receive(n.st); }', '  let kind; try { kind = await receive(n.st); }',
    '  return SAME(res); // the one answer: match or not', "  return kind && kind !== 'none' ? res.status(200).json({ ok: true, matched: true }) : SAME(res);"],
  // the acknowledgement dated in UTC instead of Rome
  'ack-in-utc': ['/api/withdraw.js', "let p = DESK_CAL.zoneParts(at, 'Europe/Rome');", "let p = DESK_CAL.zoneParts(at, 'UTC');"],
  // the acknowledgement never reaches the consumer (it goes to the operator)
  'ack-not-to-consumer': ['/api/withdraw.js', "    ['ack', ackEmail(st, stamp, receipt)],", "    ['ack', { ...ackEmail(st, stamp, receipt), to: OPERATOR_EMAIL() }],"],
  // an invoiced or paid order stamped withdrawn like an unsigned one
  'stamp-after-signing': ['/api/withdraw.js', "    if (lead.paid === true || (s && s !== 'draft' && s !== 'no_fee')) return 'book_signed';", '    if (false) return \'book_signed\';'],
  // a guessed reference stops someone else's order
  'no-identity-check': ['/api/withdraw.js', '  if (emailKey(one.email) !== st.emailKey) return {', '  if (false) return {'],
  // a retried submit is a second statement (second card, second email)
  'no-dedupe': ['/api/withdraw.js', '  if (prior) return resume(path, prior);', '  if (false) return resume(path, prior);',
    "    await fsCreate('agentNotifications', doc, id);", "    await fsCreate('agentNotifications', doc);"],
  // the bot's statement is processed
  'no-honeypot': ['/api/withdraw.js', '  if (body.company) return SAME(res);', '  if (false) return SAME(res);'],
  // no per-IP limit
  'no-rate-limit': ['/api/withdraw.js', '  if (rateLimited(ip)) return', '  if (false) return'],
  // a free file (no contract) counted as an order
  'free-file-is-order': ['/api/withdraw.js', 'export const isOrderLead = (d) => !!d && /^book_/', 'export const isOrderLead = (d) => !!d || /^book_/'],
};
