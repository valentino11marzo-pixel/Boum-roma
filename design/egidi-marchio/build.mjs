import { writeFileSync } from 'node:fs'; import { board } from './skeleton.mjs';
import { T1 } from './t1.mjs'; import { T2 } from './t2.mjs'; import { T3 } from './t3.mjs';
import { loadChromium, launchOptions } from '../../tests/_browser.mjs';
const sel = process.argv.slice(2); const all = { 1: T1, 2: T2, 3: T3 };
const c = await loadChromium(); const b = await c.launch(launchOptions());
for (const [k, t] of Object.entries(all)) {
  if (sel.length && !sel.includes(k)) continue;
  writeFileSync(`board-${k}.html`, board(t));
  const p = await (await b.newContext({ viewport: { width: 1880, height: 1000 }, deviceScaleFactor: 1 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('requestfailed', r => errs.push('FAIL ' + r.url().slice(-60)));
  await p.goto('file://' + process.cwd() + `/board-${k}.html`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  await p.screenshot({ path: `board-${k}.jpg`, type: 'jpeg', quality: 86, fullPage: true });
  console.log(k, errs.length ? errs : 'ok');
}
await b.close();
