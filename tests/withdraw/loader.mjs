// Loader of the withdraw suite: 'nodemailer' → the mock that captures every
// email (tests/notify/nodemailer-mock.mjs); pdf-lib stays real (imported by
// the email design system). WITHDRAW_MUTATION rewrites api/withdraw.js with
// one defect from tests/withdraw/mutations.mjs before it is loaded.
import { MUTATIONS } from './mutations.mjs';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'nodemailer') return { url: new URL('../notify/nodemailer-mock.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const out = await nextLoad(url, context);
  const m = MUTATIONS[process.env.WITHDRAW_MUTATION || ''];
  if (!m || !url.endsWith(m[0]) || !out.source) return out;
  let src = String(out.source);
  for (let i = 1; i < m.length; i += 2) {
    if (!src.includes(m[i])) throw new Error('mutation anchor missing: ' + process.env.WITHDRAW_MUTATION + ' — ' + m[i]);
    src = src.replace(m[i], m[i + 1]);
  }
  return { ...out, source: src };
}
