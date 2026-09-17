// Motore puro e blocco Oggi REALE in Chromium. Stub soltanto auth/API/router
// del portale: nessun dato reale, modello, messaggio, invito o calendario.
// node tests/segretaria/casi-ui.mjs (BOOM_PLAYWRIGHT/BOOM_CHROME se necessari)
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import E from '../../js/segretaria-casi-engine.js';
import PROPOSTA from '../../js/segretaria-proposta-engine.js';
import { loadChromium, launchOptions } from '../_browser.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
let checks = 0;
const check = (name, body) => { body(); console.log('PASS ' + name); checks++; };
const NOW = Date.now();
const screenshots = mkdtempSync(join(tmpdir(), 'boom-segretaria-ui-'));
const FUTURE = new Date(NOW + 2 * 86400000).toISOString();
const ID = 'sg_' + 'a'.repeat(32), IDB = 'sg_' + 'b'.repeat(32), IDC = 'sg_' + 'c'.repeat(32);
const row = (id, overrides = {}) => ({ id, status: 'open', source: 'segretaria', title: 'Seguire la richiesta', followUp: {
  conversationId: 'conv_test', contactName: 'Cliente prova', preview: 'È arrivato il documento?',
  lastMessageId: 'msg-a', practiceRef: null, propertyRef: null,
  nextAction: 'Controllare il documento', waitingOn: 'valentino', waitingLabel: 'Valentino',
  checkAt: FUTURE, checkBasis: 'proposta interna', confirmed: false, needsReview: true, ambiguous: true, ...overrides
} });
const A = row(ID, { contactName: 'Cliente <img src=x onerror="window.__injected=1">' });
const B = row(IDB, { contactName: 'Cliente in attesa', conversationId: 'conv_b', lastMessageId: 'msg-b',
  practiceRef: 'contracts/c1', propertyRef: 'properties/p1', confirmed: true, needsReview: false, ambiguous: false,
  nextAction: 'Attendere il documento firmato', waitingOn: 'client', waitingLabel: 'Cliente' });
const C = row(IDC, { contactName: 'Intervento da ricontrollare', conversationId: 'conv_c',
  practiceRef: 'contracts/c2', propertyRef: 'properties/p2', confirmed: true, needsReview: false, ambiguous: false,
  checkAt: new Date(NOW - 3600000).toISOString(), waitingOn: 'collaborator', waitingLabel: 'Tecnico' });
const DOSSIER = { incomplete: false, ambiguous: true,
  practices: [
    { ref: 'contracts/c1', type: 'contract', status: 'active', propertyRefs: ['properties/p1'] },
    { ref: 'contracts/c2', type: 'contract', status: 'active', propertyRefs: ['properties/p2'] }
  ], properties: [{ ref: 'properties/p1', label: 'Casa Fiore' }, { ref: 'properties/p2', label: 'Casa Luna' }] };

check('una riga stabile: lettura, risposta e duplicato non chiudono il seguito', () => {
  const readAndReplied = { ...A, read: true, replied: true, unread: 0, needsReply: false };
  const groups = E.partition([readAndReplied, readAndReplied, B, C, { ...A, id: 'sg_' + 'd'.repeat(32), status: 'done' }], NOW);
  assert.equal(groups.decisions.length, 2);
  assert.equal(groups.waiting.length, 1);
  assert.equal(groups.decisions.find(t => t.id === ID).followUp.lastMessageId, 'msg-a');
});
check('scadenza interna trascorsa e nuovo messaggio tornano tra i ricontrolli', () => {
  assert.equal(E.partition([B], NOW + 3 * 86400000).decisions.length, 1);
  assert.equal(E.partition([{ ...B, followUp: { ...B.followUp, needsReview: true } }], NOW).decisions.length, 1);
  assert.equal(E.describe(C, DOSSIER, {}, NOW).state, 'Da ricontrollare');
});
check('casa e pratica soltanto da riferimenti verificati; mai prima candidata', () => {
  assert.equal(E.describe(A, DOSSIER, {}, NOW).house, 'Casa da collegare');
  assert.equal(E.describe(A, DOSSIER, {}, NOW).practice, 'Pratica da collegare');
  assert.equal(E.describe(B, DOSSIER, {}, NOW).house, 'Casa Fiore');
  assert.equal(E.propertyLabel('properties/missing', DOSSIER, {}), 'Casa collegata · nome da verificare');
});
const fields = { practiceRef: '', nextAction: 'Attendere i documenti', waitingOn: 'client', waitingLabel: 'Cliente', checkAt: E.localDateTime(FUTURE) };
check('null è una scelta esplicita: azione/chi/data salvati, pratica resta da collegare', () => {
  const result = E.confirmation(A, fields, DOSSIER, NOW);
  assert.equal(result.payload.practiceRef, null);
  assert.equal(result.payload.lastMessageId, 'msg-a');
  assert.equal(result.payload.waitingOn, 'client');
  assert.equal(result.payload.op, 'confirm');
  assert.equal(Object.hasOwn(result.payload, 'send'), false);
  assert.equal(Object.hasOwn(result.payload, 'calendarize'), false);
});
check('identità dubbia e pratica estranea bloccano; sola storia parziale non blocca la pratica verificata', () => {
  assert.ok(E.confirmation(A, { ...fields, practiceRef: 'contracts/c1' }, { ...DOSSIER, identityIncomplete: true }, NOW).error);
  assert.ok(E.confirmation(A, { ...fields, practiceRef: 'contracts/c1' }, { ...DOSSIER, identityAmbiguous: true }, NOW).error);
  assert.ok(E.confirmation(A, { ...fields, practiceRef: 'contracts/foreign' }, DOSSIER, NOW).error);
  assert.ok(E.confirmation(A, { ...fields, practiceRef: '' }, { ...DOSSIER, identityIncomplete: true }, NOW).payload);
  assert.ok(E.confirmation(A, { ...fields, practiceRef: 'contracts/c1' }, { ...DOSSIER, historyIncomplete: true, incomplete: true }, NOW).payload);
});
check('azione, responsabile e ricontrollo non possono restare vuoti o nel passato', () => {
  for (const invalid of [{ nextAction: '' }, { waitingLabel: '' }, { waitingOn: 'other' }, { checkAt: 'not-a-date' },
    { checkAt: E.localDateTime(new Date(NOW - 60000).toISOString()) }, { checkAt: E.localDateTime(new Date(NOW + 366 * 86400000).toISOString()) }]) {
    assert.ok(E.confirmation(A, { ...fields, ...invalid }, DOSSIER, NOW).error);
  }
});
check('MUTAZIONE: usare letto come chiusura fa perdere un seguito e il test cade', () => {
  const source = read('js/segretaria-casi-engine.js');
  const mutated = source.replace("task.status !== 'open' || seen.has(task.id)", "task.status !== 'open' || task.read || seen.has(task.id)");
  assert.notEqual(source, mutated);
  const sandbox = { window: {} };
  vm.runInNewContext(mutated, sandbox);
  assert.throws(() => assert.equal(sandbox.window.BOOM_SEGRETARIA_CASI.partition([{ ...A, read: true }], NOW).decisions.length, 1));
});
check('script della vista registrato e trattato come logica del portale nella cache', () => {
  assert.match(read('portal.html'), /<script src="\/js\/segretaria-casi-engine.js"><\/script>/);
  assert.ok(read('portal.html').indexOf('<script src="/js/segretaria-casi-engine.js"') < read('portal.html').indexOf('<script src="/js/portal-app.js"'));
  assert.match(read('sw.js'), /url.pathname === '\/js\/segretaria-casi-engine.js'/);
});

// Home adds a work stage without changing the existing partition contract.
const currentPreparation = task => PROPOSTA.currentContext(task) ? task.preparation : null;
const prepared = (task, overrides = {}) => ({ ...task, preparation: {
  version: PROPOSTA.VERSION, coverage: { version: PROPOSTA.CONTEXT_VERSION },
  messageId: task.followUp.lastMessageId, status: 'ready', ...overrides,
} });
const onlyGroup = (task, expected, engine = E) => {
  const groups = engine.workGroups([task], NOW, currentPreparation);
  for (const name of ['decisions', 'preparing', 'progress', 'waiting']) {
    assert.equal(groups[name].length, name === expected ? 1 : 0, name + ' for ' + task.id);
  }
  assert.equal(groups[expected][0].id, task.id);
};
check('Home: una richiesta acquisita attende preparazione, senza gonfiare le decisioni', () => {
  onlyGroup(A, 'preparing');
  onlyGroup({ ...A, read: true, replied: true, unread: 0 }, 'preparing');
  const groups = E.workGroups([A, A, B, C, { ...A, id: 'sg_' + 'd'.repeat(32), status: 'done' }, null], NOW, currentPreparation);
  assert.equal(groups.preparing.length, 1);
  assert.equal(groups.decisions.length, 1);
  assert.equal(groups.waiting.length, 1);
  assert.equal(groups.invalid, 1);
});
check('Home: soltanto una proposta del contesto corrente arriva alle decisioni', () => {
  onlyGroup(prepared(A), 'decisions');
  onlyGroup(prepared(A, { status: 'needs_context' }), 'decisions');
  onlyGroup(prepared(A, { coverage: { version: PROPOSTA.CONTEXT_VERSION - 1 } }), 'preparing');
  onlyGroup(prepared(A, { coverage: undefined }), 'preparing');
  onlyGroup(prepared(A, { version: PROPOSTA.VERSION - 1 }), 'preparing');
  onlyGroup(prepared(A, { messageId: 'previous-event' }), 'preparing');
});
check('Home: il ricontrollo confermato scaduto è una decisione anche senza nuova proposta', () => {
  onlyGroup(C, 'decisions');
  onlyGroup({ ...B, followUp: { ...B.followUp, needsReview: true } }, 'decisions');
  onlyGroup({ ...B, followUp: { ...B.followUp, checkAt: new Date(NOW).toISOString() } }, 'decisions');
});
check('Home: conferme e ricevute approvate restano in attesa o in corso', () => {
  onlyGroup(B, 'waiting');
  onlyGroup(prepared(B, { approval: { actionId: 'approved-action' } }), 'waiting');
  onlyGroup(prepared(B, { version: 0, coverage: { version: 0 }, approval: { actionId: 'legacy-approved' } }), 'waiting');
  for (const waitingOn of ['boom', 'valentino']) {
    onlyGroup(prepared({ ...B, followUp: { ...B.followUp, waitingOn } }, { approval: { actionId: 'approved-action' } }), 'progress');
  }
  for (const delivery of ['queued', 'pending_execution']) {
    onlyGroup({ ...prepared(B, { approval: { actionId: 'approved-action' } }), deliveryResult: { delivery } }, 'progress');
  }
  onlyGroup({ ...prepared(B, { approval: { actionId: 'approved-action' } }), deliveryResult: { delivery: 'needs_review' } }, 'decisions');
});
check('Home: una scelta manuale senza pratica resta da completare, non da preparare di nuovo', () => {
  const manual = { ...A, followUp: { ...A.followUp, practiceRef: null, confirmed: false,
    confirmedAt: new Date(NOW - 300000).toISOString(), confirmedBy: 'fixture-admin',
  } };
  onlyGroup(manual, 'decisions');
  onlyGroup(prepared(manual, { approval: { actionId: null } }), 'decisions');
  // Legacy receipts can lack manual metadata, but approval is still proof
  // that a proposal was already prepared and reviewed.
  onlyGroup(prepared(A, { approval: { actionId: null } }), 'decisions');
});
check('Home: una data iniziale dubbia, passata o scaduta chiede una decisione', () => {
  for (const intakeTiming of [
    { status: 'ambiguous' }, { status: 'past' },
    { status: 'resolved', requestedAt: new Date(NOW - 60000).toISOString() },
    { status: 'resolved', requestedAt: new Date(NOW).toISOString() },
  ]) {
    onlyGroup({ ...A, followUp: { ...A.followUp, intakeTiming } }, 'decisions');
  }
  onlyGroup({ ...A, followUp: { ...A.followUp, intakeTiming: { status: 'resolved', requestedAt: FUTURE } } }, 'preparing');
});
check('Home: la data iniziale già gestita non riapre una conferma manuale futura', () => {
  for (const status of ['ambiguous', 'past', 'resolved']) {
    const task = { ...B, followUp: { ...B.followUp,
      confirmedAt: new Date(NOW - 300000).toISOString(), confirmedBy: 'fixture-admin',
      intakeTiming: { status, requestedAt: new Date(NOW - 3600000).toISOString(),
        sourceAt: new Date(NOW - 7200000).toISOString(), sourceMessageId: B.followUp.lastMessageId },
    } };
    onlyGroup(task, 'waiting');
    onlyGroup({ ...task, followUp: { ...task.followUp, waitingOn: 'valentino' } }, 'progress');
    // A later source still returns to the operator: the old confirmation
    // must not hide a new request simply because confirmedAt is present.
    onlyGroup({ ...task, followUp: { ...task.followUp, needsReview: true, lastMessageId: 'new-timed-event',
      intakeTiming: { status: 'ambiguous', sourceMessageId: 'new-timed-event', sourceAt: new Date(NOW).toISOString() },
    } }, 'decisions');
  }
});
check('MUTAZIONE Home: contare le richieste non preparate come decisioni viene rilevato', () => {
  const source = read('js/segretaria-casi-engine.js');
  const mutated = source.replace('(f.confirmed === true || f.confirmedAt || f.confirmedBy || p?.approval ? groups.decisions : groups.preparing).push(task);', 'groups.decisions.push(task);');
  assert.notEqual(source, mutated);
  const sandbox = { window: {} };
  vm.runInNewContext(mutated, sandbox);
  assert.throws(() => onlyGroup(A, 'preparing', sandbox.window.BOOM_SEGRETARIA_CASI));
});

const chromium = await loadChromium();
if (!chromium) {
  console.log(`PASS ${checks} verifiche motore. SKIP browser: playwright non disponibile.`);
  process.exit(0);
}
const portal = read('js/portal-app.js');
const start = portal.indexOf('    // ═══ SEGRETERIA · SEGUITI IN OGGI');
const end = portal.indexOf('    // ═══ FINE SEGRETERIA · SEGUITI IN OGGI');
assert.ok(start > 0 && end > start);
const ui = portal.slice(start, end);
const browser = await chromium.launch(launchOptions());
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Rome' });
  const page = await context.newPage();
  const errors = [], requests = [], posts = [];
  page.on('pageerror', error => errors.push(error.message));
  let items = JSON.parse(JSON.stringify([A, B, C, A]));
  let listFailure = false, incomplete = true, nextPost = '', detailIncomplete = false, detailHistory = false;
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><aside style="padding:16px;font:14px system-ui;background:#1b2229;color:#e6c979">Anteprima Oggi · Dati simulati · Nessun invio</aside><main id="main"></main><div id="modals"></div></body></html>' });
    requests.push(url.pathname);
    if (url.pathname !== '/api/segretaria/follow-up') return route.fulfill({ status: 404, body: '' });
    assert.equal(req.headers().authorization, 'Bearer fixture-admin');
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (req.method() === 'GET' && !url.searchParams.get('id')) {
      if (listFailure) return respond({ ok: false, error: 'follow_up_unavailable' }, 503);
      return respond({ ok: true, rows: items, incomplete });
    }
    if (req.method() === 'GET') {
      return respond({ ok: true, task: items.find(t => t.id === url.searchParams.get('id')),
        dossier: { ...DOSSIER, identityIncomplete: detailIncomplete, incomplete: detailHistory, historyIncomplete: detailHistory } });
    }
    const body = req.postDataJSON(); posts.push(body);
    const task = items.find(t => t.id === body.id);
    if (nextPost === 'stale') {
      nextPost = '';
      task.followUp.lastMessageId = 'msg-new';
      task.followUp.preview = 'Nuovo messaggio: riguarda la seconda casa.';
      task.followUp.needsReview = true;
      items = items.map(t => t.id === task.id ? task : t);
      return respond({ ok: false, error: 'new_message_reload' }, 409);
    }
    assert.equal(body.lastMessageId, task.followUp.lastMessageId);
    if (body.op === 'close') {
      assert.ok(body.outcome.trim());
      items = items.filter(t => t.id !== task.id);
      return respond({ ok: true, id: task.id, closed: true });
    }
    assert.equal(body.op, 'confirm');
    const practice = DOSSIER.practices.find(p => p.ref === body.practiceRef);
    task.followUp = { ...task.followUp, ...body, propertyRef: practice?.propertyRefs[0] || null,
      confirmed: !!body.practiceRef, ambiguous: !body.practiceRef, needsReview: !body.practiceRef };
    items = items.map(t => t.id === task.id ? task : t);
    return respond({ ok: true, id: task.id, followUp: task.followUp });
  });
  await page.goto('https://fixture.invalid/fixture');
  await page.addStyleTag({ content: read('css/portal.css') + '\n' + read('css/portal-finish.css') + '\n' + read('css/segretaria.css') + '\n#main{padding:12px} body{display:block}' });
  await page.addScriptTag({ content: `
    const S={page:'oggi',conversations:[], properties:[{id:'p1',name:'Casa Fiore'},{id:'p2',name:'Casa Luna'}]};
    const auth={currentUser:{uid:'admin',getIdToken:async()=> 'fixture-admin'}};
    const db={
      collection(name){
        if(name!=='conversations')throw Error('unexpected collection');
        return {
          doc(id){
            return {
              async get(){
                window.__sourceReads=(window.__sourceReads||[]).concat(id);
                if(window.__sourceReadMode==='denied')throw Error('permission-denied');
                return {exists:window.__sourceReadMode!=='missing',data:()=>({contactName:'Fonte simulata',unread:1})};
              }
            };
          }
        };
      }
    };
    function isAdmin(){return true}
    function esc(str){return String(str||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
    function toast(type,message){window.__lastToast={type,message}}
    function goTo(page){S.page=page;document.getElementById('main').innerHTML=page==='oggi'?oggiSegretariaPanel():'<div>Inbox</div>'}
    function inboxSelect(id){const c=S.conversations.find(c=>c.id===id);if(!c)throw Error('empty Inbox: conversation absent');c.unread=0;window.__selectedConversation=id;window.__read=true}
  ` });
  await page.addScriptTag({ content: read('js/segretaria-casi-engine.js') });
  await page.addScriptTag({ content: ui });
  await page.evaluate(() => goTo('oggi'));
  await page.waitForSelector('[data-sg-id]');
  assert.equal(await page.locator('article[data-sg-id]').count(), 3);
  assert.equal(await page.locator('[data-sg-group="decisions"] .sg-count').innerText(), '1');
  assert.equal(await page.locator('[data-sg-group="preparing"] .sg-count').innerText(), '1');
  assert.equal(await page.locator('[data-sg-group="waiting"] .sg-count').innerText(), '1');
  assert.equal(await page.locator(`[data-sg-group="preparing"] article[data-sg-id="${ID}"]`).count(), 1);
  assert.equal(await page.locator(`[data-sg-group="decisions"] article[data-sg-id="${IDC}"]`).count(), 1);
  assert.equal(await page.locator(`[data-sg-group="waiting"] article[data-sg-id="${IDB}"]`).count(), 1);
  assert.match(await page.locator('#sgFollowPanel').innerText(), /limite di 200/);
  assert.equal(await page.locator('#sgFollowPanel img').count(), 0);
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  assert.match(await page.locator('#sgFollowPanel').innerText(), /<img src=x/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  console.log('PASS browser: decisioni, attese e limite visibili, nessuna riga duplicata né HTML eseguito'); checks++;

  const clickCase = async (id, action) => {
    await page.locator(`article[data-sg-id="${id}"] details`).evaluate(el => { el.open = true; });
    await page.locator(`article[data-sg-id="${id}"] [data-sg-action="${action}"]`).click();
  };
  await clickCase(ID, 'source');
  await page.waitForFunction(() => window.__selectedConversation === 'conv_test');
  assert.deepEqual(await page.evaluate(() => window.__sourceReads), ['conv_test']);
  assert.equal(await page.evaluate(() => S.conversations.find(c => c.id === 'conv_test').unread), 0);
  assert.equal(posts.length, 0);
  await page.evaluate(() => goTo('oggi'));
  await page.waitForSelector(`article[data-sg-id="${ID}"]`);
  assert.equal(await page.locator('article[data-sg-id]').count(), 3);
  console.log('PASS browser: aprire la fonte marca letto nel router ma non chiude né modifica il seguito'); checks++;

  for (const failure of ['denied', 'missing']) {
    await page.evaluate(mode => { window.__sourceReadMode = mode; }, failure);
    await clickCase(IDC, 'source');
    await page.waitForFunction(() => document.getElementById('sgFollowPanel')?.textContent.includes('Non riesco ad aprire la conversazione'));
    assert.equal(await page.evaluate(() => S.page), 'oggi');
    assert.equal(await page.evaluate(() => S.conversations.some(c => c.id === 'conv_c')), false);
    assert.equal(await page.locator('article[data-sg-id]').count(), 3);
  }
  await page.evaluate(() => { window.__sourceReadMode = 'ok'; });
  console.log('PASS browser: fonte fuori limite caricata per id; permessi negati o fonte assente restano errori visibili sul seguito'); checks++;

  await clickCase(ID, 'edit');
  await page.waitForSelector('#sgPractice');
  assert.equal(await page.locator('#sgFollowError').isVisible(), false);
  assert.equal(await page.locator('#sgPractice').inputValue(), '');
  assert.equal(await page.locator('#sgPractice option').count(), 3);
  assert.match(await page.locator('#sgPractice').innerText(), /Casa Fiore/);
  assert.match(await page.locator('#sgPractice').innerText(), /Casa Luna/);
  await page.locator('#sgAction').fill('Attendere il documento completo');
  await page.locator('#sgWaitingOn').selectOption('client');
  await page.locator('#sgWaitingLabel').fill('Cliente');
  await page.locator('[data-sg-submit]').click();
  await page.waitForSelector('#sgFollowModal', { state: 'detached' });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].practiceRef, null);
  assert.equal(posts[0].waitingOn, 'client');
  assert.ok(posts[0].checkAt.endsWith('Z'));
  await page.waitForSelector(`article[data-sg-id="${ID}"]`);
  assert.equal(await page.locator(`article[data-sg-id="${ID}"] .li-flag`).textContent(), 'Da collegare');
  console.log('PASS browser: attesa salvata senza inventare pratica o casa'); checks++;

  nextPost = 'stale';
  await clickCase(ID, 'edit');
  await page.waitForSelector('#sgPractice');
  await page.locator('#sgPractice').selectOption('contracts/c1');
  await page.locator('[data-sg-submit]').click();
  await page.waitForFunction(() => document.getElementById('sgFollowModal')?.textContent.includes('Nuovo messaggio: riguarda la seconda casa.'));
  assert.equal(posts.length, 2);
  assert.match(await page.locator('#sgFollowModal').innerText(), /ricontrolla i dati prima di confermare/);
  assert.equal(await page.locator('#sgPractice').inputValue(), '');
  await page.locator('#sgPractice').selectOption('contracts/c2');
  assert.match(await page.locator('#sgSelectedHouse').innerText(), /Casa Luna/);
  await page.locator('#sgWaitingOn').selectOption('collaborator');
  await page.locator('#sgWaitingLabel').fill('Tecnico confermato');
  await page.locator('[data-sg-submit]').click();
  await page.waitForSelector('#sgFollowModal', { state: 'detached' });
  assert.equal(posts.length, 3);
  assert.equal(posts[2].lastMessageId, 'msg-new');
  assert.equal(posts[2].practiceRef, 'contracts/c2');
  await page.locator(`article[data-sg-id="${ID}"] details`).evaluate(el => { el.open = true; });
  await page.waitForSelector(`article[data-sg-id="${ID}"]`);
  assert.match(await page.locator(`article[data-sg-id="${ID}"]`).innerText(), /Casa Luna/);
  assert.match(await page.locator(`article[data-sg-id="${ID}"]`).innerText(), /Tecnico confermato/);
  console.log('PASS browser: 409 ricarica, non reinvia; seconda conferma usa il nuovo messaggio e la pratica scelta'); checks++;

  listFailure = true;
  await page.locator('[data-sg-action="refresh"]').click();
  await page.waitForFunction(() => document.getElementById('sgFollowPanel')?.textContent.includes('potrebbero non essere aggiornati'));
  assert.equal(await page.locator('article[data-sg-id]').count(), 3);
  assert.equal(await page.locator(`article[data-sg-id="${ID}"] details`).evaluate(el => el.open), true);
  console.log('PASS browser: rete in errore conserva i seguiti e segnala dati non aggiornati'); checks++;
  listFailure = false; incomplete = false;
  await page.locator('[data-sg-action="refresh"]').click();
  await page.waitForFunction(() => !document.getElementById('sgFollowPanel')?.textContent.includes('potrebbero non essere aggiornati'));

  detailIncomplete = true;
  await clickCase(IDC, 'edit');
  await page.waitForSelector('#sgPractice');
  assert.equal(await page.locator('#sgPractice').isDisabled(), true);
  assert.match(await page.locator('#sgFollowModal').innerText(), /Identità non verificata/);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sgFollowModal', { state: 'detached' });
  detailIncomplete = false;
  console.log('PASS browser: dossier incompleto esplicito e uscita da tastiera disponibile'); checks++;

  detailHistory = true;
  await clickCase(IDC, 'edit');
  await page.waitForSelector('#sgPractice');
  assert.equal(await page.locator('#sgPractice').isDisabled(), false);
  assert.equal(await page.locator('#sgPractice').inputValue(), 'contracts/c2');
  assert.match(await page.locator('#sgFollowModal').innerText(), /parti della cronologia non sono disponibili/);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sgFollowModal', { state: 'detached' });
  detailHistory = false;
  console.log('PASS browser: storia parziale avvisa ma lascia selezionare una pratica verificata'); checks++;

  await clickCase(ID, 'edit');
  await page.waitForSelector('#sgPractice');
  await page.locator('[data-sg-modal="close"]').click();
  await page.locator('[data-sg-submit]').click();
  assert.equal(posts.length, 3);
  await page.locator('#sgOutcome').fill('Documento completo ricevuto e verificato nella pratica corretta.');
  await page.locator('[data-sg-submit]').click();
  await page.waitForSelector('#sgFollowModal', { state: 'detached' });
  assert.equal(posts.length, 4);
  assert.equal(posts[3].op, 'close');
  assert.equal(await page.locator(`article[data-sg-id="${ID}"]`).count(), 0);
  console.log('PASS browser: soltanto una chiusura con esito rimuove il seguito'); checks++;
  assert.equal(requests.every(path => path === '/api/segretaria/follow-up'), true, requests.join(','));
  assert.deepEqual(errors, []);
  console.log('PASS browser: nessun errore JS e nessun endpoint di messaggi/calendario chiamato'); checks++;
  await page.screenshot({ path: join(screenshots, 'mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.screenshot({ path: join(screenshots, 'desktop.png'), fullPage: true });
  await context.close();
} finally { await browser.close(); }
console.log(`\nSeguiti Oggi: ${checks} verifiche passate.`);
