// Real Oggi UI and proposal fixture; only IO and the clock are simulated.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import PROPOSTA from '../../js/segretaria-proposta-engine.js';
import { loadChromium, launchOptions } from '../_browser.mjs';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const portal = read('js/portal-app.js'), proposalTest = read('tests/segretaria/proposta-ui.mjs');
const NOW = Date.parse('2026-09-21T12:00:00Z');
const fixtureStart = proposalTest.indexOf('const fixture = `');
const fixtureEnd = proposalTest.indexOf('writeFileSync(previewPath, html);');
assert(fixtureStart >= 0 && fixtureEnd > fixtureStart, 'Fixture e shell condivisi presenti');
const fixtureSource = proposalTest.slice(fixtureStart, fixtureEnd);
function functionRange(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start < 0) start = source.indexOf('    async function ' + name + '(');
  assert(start >= 0, 'Funzione reale presente: ' + name);
  const next = source.slice(start + 5).search(/\n    (?:async )?function /);
  assert(next >= 0, 'Fine funzione reale: ' + name);
  return [start, start + 5 + next];
}
function htmlFor(source) {
  const start = source.indexOf('    // ═══ SEGRETERIA · SEGUITI IN OGGI');
  const end = source.indexOf('    // ═══ FINE SEGRETERIA · SEGUITI IN OGGI');
  assert(start >= 0 && end > start);
  const listeners = ['startInboxListener', 'stopInboxListener', 'stopOpenConvListener']
    .map(name => source.slice(...functionRange(source, name))).join('\n');
  const result = {};
  vm.runInNewContext(fixtureSource + '\nresult.html = html;', {
    PROPOSTA, read, ui: source.slice(start, end), listeners, result
  });
  const clock = `<script>window.__now=${NOW};const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.__now]))}static now(){return window.__now}};</script>`;
  return result.html.replace('<head>', '<head>' + clock);
}
const chromium = await loadChromium();
assert(chromium, 'Browser necessario: BOOM_PLAYWRIGHT/BOOM_CHROME');
const browser = await chromium.launch(launchOptions());
let passed = 0, failed = 0;
const check = async (name, body) => {
  if (process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER)) return;
  try { await body(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.message); }
};
async function fixture({ source = portal, at = NOW + 86400000, draft = true, delivery = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 }, timezoneId: 'Europe/Rome' });
  const errors = [], network = [];
  page.setDefaultTimeout(3000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  await page.setContent(htmlFor(source));
  await page.waitForSelector('article[data-sg-id]');
  await page.evaluate(async ({ at, draft, delivery }) => {
    const task = window.__rows[0], p = task.preparation;
    window.__rows = [task];
    p.nextAction.checkAt = typeof at === 'number' ? new Date(at).toISOString() : at;
    if (!draft) p.draft = null;
    // Keep the follow-up date future: the proposal's own date is decisive.
    task.followUp.checkAt = new Date(Date.now() + 2 * 86400000).toISOString();
    if (delivery) {
      p.approval = { revision: p.revision, messageId: p.messageId, actionId: 'fixture-action' };
      task.deliveryResult = { id: task.id, actionId: 'fixture-action', delivery, confirmed: true };
    }
    await oggiSegretariaLoad(true);
  }, { at, draft, delivery });
  return { page, errors, network };
}
const posts = page => page.evaluate(() => window.__requests.filter(r => r.method === 'POST'));
const state = page => page.evaluate(() => ({ rows: window.__rows, receipts: oggiSegretaria.receipts }));
async function open(page, mode = 'review') {
  await page.evaluate(mode => oggiSegretariaOpen(window.__ids[0], '', mode), mode);
  await page.waitForSelector('#sgPreparationReview');
}
function clean({ errors, network }) { assert.deepEqual(errors, []); assert.deepEqual(network, []); }
async function disabledAtRender(page) {
  assert.equal(await page.locator('[data-sg-modal="approve"]').isDisabled(), true, 'La data non valida blocca la conferma già al render');
}
async function expiryDuringOpen(page) {
  await open(page);
  assert.equal(await page.locator('[data-sg-modal="approve"]').isEnabled(), true);
  const before = await state(page);
  await page.evaluate(() => { window.__now = Date.parse(oggiSegretaria.modal.task.preparation.nextAction.checkAt); });
  // No render and no source mutation: only time passes while the modal stays open.
  await page.locator('[data-sg-modal="approve"]').click();
  assert.deepEqual(await posts(page), [], 'La scadenza a modale aperta blocca il POST al click');
  assert.equal(await page.locator('#sgFollowError').isVisible(), true);
  assert.match(await page.locator('#sgFollowError').innerText(), /ricontroll|scad|trascors|passat/i);
  await disabledAtRender(page);
  assert.deepEqual(await state(page), before, 'Il blocco non modifica proposta o ricevute');
}
// Mutate only calls in one real function, leaving the helper and the other guard intact.
function omitTimeGuard(source, name) {
  const [start, end] = functionRange(source, name);
  let body = source.slice(start, end), count = 0, offset = 0;
  const call = 'oggiSegretariaApprovalTimeIssue(';
  while (true) {
    const at = body.indexOf(call, offset);
    if (at < 0) break;
    let stop = at + call.length, depth = 1;
    while (depth && stop < body.length) {
      if (body[stop] === '(') depth++;
      if (body[stop] === ')') depth--;
      stop++;
    }
    assert.equal(depth, 0);
    body = body.slice(0, at) + "''" + body.slice(stop);
    offset = at + 2; count++;
  }
  assert(count > 0, 'Mutazione agganciata alla guardia reale: ' + name);
  return source.slice(0, start) + body + source.slice(end);
}

try {
  for (const [label, at, mode] of [
    ['passato in revisione', NOW - 60000, 'review'],
    ['passato nel piano', NOW - 60000, 'execute'],
    ['scadenza esatta', NOW, 'review'],
    ['data mancante', null, 'review'],
    ['data illeggibile', 'not-a-date', 'review']
  ]) await check(label + ': avviso e zero conferme', async () => {
    const f = await fixture({ at });
    try {
      const before = await state(f.page);
      assert.match(await f.page.locator('.sg-proposal-label').innerText(), /da aggiornare/i);
      assert.equal(await f.page.locator('article .sg-time-issue').isVisible(), true);
      await open(f.page, mode); await disabledAtRender(f.page);
      assert.match(await f.page.locator('#sgPreparationReview').innerText(), /ricontroll|scad|trascors|passat/i);
      await f.page.evaluate(() => oggiSegretariaPrepare('approve'));
      assert.deepEqual(await posts(f.page), []); assert.deepEqual(await state(f.page), before); clean(f);
    } finally { await f.page.close(); }
  });
  await check('tempo scaduto a modale aperta: il click ricontrolla la data', async () => {
    const f = await fixture({ at: NOW + 60000 });
    try { await expiryDuringOpen(f.page); clean(f); } finally { await f.page.close(); }
  });
  for (const draft of [true, false]) await check('data futura ' + (draft ? 'con bozza' : 'senza bozza') + ': una conferma valida resta possibile', async () => {
    const f = await fixture({ draft });
    try {
      assert.match(await f.page.locator('.sg-proposal-label').innerText(), draft ? /messaggio da rivedere/i : /seguito interno/i);
      await open(f.page);
      assert.equal(await f.page.locator('[data-sg-modal="approve"]').isEnabled(), true);
      const expected = await f.page.evaluate(() => ({ op: 'approve', id: __ids[0], revision: __rows[0].preparation.revision, lastMessageId: __rows[0].followUp.lastMessageId }));
      await f.page.locator('[data-sg-modal="approve"]').click();
      await f.page.waitForFunction(() => !!oggiSegretaria.modal?.task?.preparation?.approval);
      assert.deepEqual((await posts(f.page)).map(r => r.body), [expected]);
      assert.equal(await f.page.locator('[data-sg-modal="approve"]').count(), 0); clean(f);
    } finally { await f.page.close(); }
  });
  await check('modulo condiviso assente: la conferma resta bloccata anche con click diretto', async () => {
    const f = await fixture();
    try {
      await f.page.evaluate(() => { window.BOOM_PROPOSTA = { ...window.BOOM_PROPOSTA, approvalExpired: undefined }; });
      await open(f.page); await disabledAtRender(f.page);
      assert.match(await f.page.locator('#sgPreparationReview').innerText(), /controllo della scadenza non è disponibile/i);
      await f.page.evaluate(() => oggiSegretariaPrepare('approve'));
      assert.deepEqual(await posts(f.page), []); clean(f);
    } finally { await f.page.close(); }
  });
  await check('scadenza rilevata dal server: 409 rilegge, blocca replay e consente rielaborazione esplicita', async () => {
    const f = await fixture();
    try {
      await open(f.page);
      const revision = await f.page.evaluate(() => oggiSegretaria.modal.task.preparation.revision);
      await f.page.evaluate(() => {
        const original = window.fetch;
        window.fetch = async (url, options = {}) => {
          const body = options.body ? JSON.parse(options.body) : null;
          if (body?.op === 'approve') {
            window.__requests.push({path: url, method: 'POST', body});
            return {ok:false,status:409,json:async()=>({ok:false,error:'preparation_expired'})};
          }
          return original(url, options);
        };
      });
      await f.page.locator('[data-sg-modal="approve"]').click();
      await f.page.waitForFunction(() => oggiSegretaria.modal?.mustRegenerate === true);
      assert.match(await f.page.locator('#sgFollowModal').innerText(), /già passato.*Rielabora/s);
      await disabledAtRender(f.page);
      await f.page.evaluate(() => oggiSegretariaPrepare('approve'));
      assert.equal((await posts(f.page)).length, 1);
      assert.deepEqual(await f.page.evaluate(() => oggiSegretaria.receipts), {});
      await f.page.locator('[data-sg-modal="generate"]').click();
      await f.page.waitForFunction(old => !oggiSegretaria.modal.busy && oggiSegretaria.modal.task.preparation.revision !== old, revision);
      assert.equal(await f.page.locator('[data-sg-modal="approve"]').isEnabled(), true);
      assert.deepEqual((await posts(f.page)).map(r => r.body.op), ['approve', 'generate']); clean(f);
    } finally { await f.page.close(); }
  });
  await check('date passate approvate: ricevute in coda, inviate e da verificare restano intatte', async () => {
    for (const delivery of ['queued', 'sent', 'needs_review']) {
      const f = await fixture({ at: NOW - 60000, delivery });
      try {
        const before = await state(f.page); await open(f.page);
        assert.equal(await f.page.locator('[data-sg-modal="approve"]').count(), 0);
        assert.equal(await f.page.locator('[data-sg-step="reply"]').getAttribute('data-sg-step-state'), delivery);
        await f.page.evaluate(() => oggiSegretariaPrepare('approve'));
        assert.deepEqual(await posts(f.page), []); assert.deepEqual(await state(f.page), before); clean(f);
      } finally { await f.page.close(); }
    }
  });
  await check('approvazione precedente: la ripresa della stessa esecuzione resta disponibile', async () => {
    const f = await fixture({ at: NOW - 60000, delivery: 'pending_execution' });
    try {
      await open(f.page);
      assert.equal(await f.page.locator('[data-sg-modal="resume"]').isEnabled(), true);
      assert.equal(await f.page.locator('[data-sg-modal="approve"]').count(), 0);
      assert.deepEqual(await posts(f.page), []); clean(f);
    } finally { await f.page.close(); }
  });
  await check('MUTAZIONE render: rimuovere la guardia riabilita una conferma scaduta', async () => {
    const f = await fixture({ source: omitTimeGuard(portal, 'oggiSegretariaModalRender'), at: NOW - 60000 });
    try {
      await open(f.page);
      await assert.rejects(() => disabledAtRender(f.page), /blocca la conferma già al render/); clean(f);
    } finally { await f.page.close(); }
  });
  await check('MUTAZIONE click: rimuovere la guardia invia una conferma scaduta dopo apertura', async () => {
    const f = await fixture({ source: omitTimeGuard(portal, 'oggiSegretariaPrepare'), at: NOW + 60000 });
    try {
      await assert.rejects(() => expiryDuringOpen(f.page), /blocca il POST al click/); clean(f);
    } finally { await f.page.close(); }
  });
} finally { await browser.close(); }
console.log('Approval time UI: ' + passed + ' pass, ' + failed + ' fail');
process.exitCode = failed ? 1 : 0;
