import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
export function sessionHelpers(text = source) {
  const a = text.indexOf('    // Session proof shared by boot'), b = text.indexOf('    // End shared session/source helpers.', a);
  assert(a >= 0 && b > a); return text.slice(a, b);
}
