// Owner Command in Oggi: real browser UI, mocked only at auth/HTTP boundaries.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const portal = read('js/portal-app.js');
const start = portal.indexOf('    // ═══ OWNER COMMAND ·');
const end = portal.indexOf('    // ═══ FINE OWNER COMMAND', start);
assert(start >= 0 && end > start, 'blocco Owner Command presente');
const ownerUi = portal.slice(start, end);

const candidate = (suffix, overrides = {}) => ({
  personRef: 'leads/person-' + suffix,
  name: suffix === 'a' ? 'Giuliano Bianchi' : 'Giuliano Verdi',
  roles: ['lead'],
  contact: { phones: ['+39333000000' + (suffix === 'a' ? '1' : '2')], emails: [] },
  conversations: [{ ref: 'conversations/conv-' + suffix, channel: 'whatsapp', phone: '+39333000000' + (suffix === 'a' ? '1' : '2'), email: null }],
  practices: [{ ref: 'leads/practice-' + suffix, type: 'lead', status: 'qualified', propertyRefs: ['listings/flat-' + suffix] }],
  properties: [{ ref: 'listings/flat-' + suffix, label: suffix === 'a' ? 'Prati' : 'Parioli' }],
  ambiguous: false,
  incomplete: false,
  ...overrides,
});

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP browser non disponibile (imposta BOOM_PLAYWRIGHT/BOOM_CHROME per la prova UI reale)');
  process.exit(0);
}
const browser = await chromium.launch(launchOptions({ headless: true }));
let passed = 0, failed = 0;
const check = async (label, fn) => {
  try { await fn(); passed++; console.log('PASS ' + label); }
  catch (error) { failed++; console.error('FAIL ' + label + '\n  ' + error.stack); }
};

async function fixture({ candidates = [candidate('a'), candidate('b')], incomplete = false, failFirstPrepare = false, width = 980 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<main id="main"></main><div id="modals"></div>');
  await page.addStyleTag({ content: read('css/portal.css') + '\n' + read('css/segretaria.css') });
  await page.addScriptTag({ content: `
    const auth={currentUser:{uid:'admin',getIdToken:async()=> 'synthetic-token'}};
    const isAdmin=()=>true;
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.requests=[];window.opened=[];window.loads=[];window.prepareAttempts=0;
    window.resolveResponse=${JSON.stringify({ ok: true, operation: 'resolve', count: candidates.length,
      ambiguous: incomplete || candidates.length !== 1, incomplete, truncated: false,
      resolution: { status: candidates.length ? (incomplete ? 'incomplete' : candidates.length === 1 ? 'candidate_available' : 'ambiguous') : 'not_found', requiresExplicitSelection: candidates.length > 0 },
      candidates })};
    window.failFirstPrepare=${JSON.stringify(failFirstPrepare)};
    window.fetch=async(url,options={})=>{
      const body=JSON.parse(options.body||'{}');requests.push({url:String(url),method:options.method,headers:options.headers,body});
      if(String(url)!=='/api/segretaria/owner-command')throw Error('Endpoint inatteso: '+url);
      if(body.op==='resolve')return {ok:true,status:200,json:async()=>structuredClone(resolveResponse)};
      if(body.op!=='prepare-only')throw Error('Operazione inattesa: '+body.op);
      prepareAttempts++;
      if(failFirstPrepare&&prepareAttempts===1)return {ok:false,status:503,json:async()=>({ok:false,error:'preparation_time_budget'})};
      return {ok:true,status:200,json:async()=>({ok:true,operation:'prepare-only',caseId:'sg_case-demo',preparation:{revision:'rev-demo',draft:{channel:'whatsapp',body:'Bozza'}}})};
    };
    const oggiSegretariaLoad=(fresh)=>loads.push(fresh);
    const oggiSegretariaOpen=async(...args)=>opened.push(args);
  ` });
  await page.addScriptTag({ content: ownerUi + `\ndocument.getElementById('main').innerHTML=oggiOwnerCommandPanel();` });
  return { page, errors };
}

async function resolve(page) {
  await page.locator('#ogOwnerQuery').fill('Giuliano');
  await page.locator('#ogOwnerInstruction').fill('Avvisa il portiere che il tecnico arriva alle 15');
  await page.locator('#ogOwnerResolveForm').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => !document.querySelector('[data-og-owner-action="resolve"]').disabled);
}

async function chooseExactSecond(page) {
  await page.locator('[data-og-owner-person="1"]').click();
  assert.equal(await page.locator('#ogOwnerConversation').inputValue(), '', 'conversazione non preselezionata');
  assert.equal(await page.locator('#ogOwnerPractice').inputValue(), '', 'pratica non preselezionata');
  assert.equal(await page.locator('#ogOwnerProperty').inputValue(), '', 'Flat non preselezionato');
  assert.equal(await page.locator('#ogOwnerRoute').inputValue(), '', 'canale non preselezionato');
  await page.locator('#ogOwnerConversation').selectOption('conversations/conv-b');
  await page.locator('#ogOwnerPractice').selectOption('leads/practice-b');
  await page.locator('#ogOwnerProperty').selectOption('listings/flat-b');
  await page.locator('#ogOwnerRoute').selectOption({ label: 'WhatsApp · +393330000002' });
}

await check('0 risultati: rimedio visibile e nessuna preparazione', async () => {
  const { page, errors } = await fixture({ candidates: [] });
  try {
    await resolve(page);
    assert.match(await page.locator('#ogOwnerCommand').innerText(), /Nessuna persona verificata/);
    assert.equal(await page.locator('[data-og-owner-person]').count(), 0);
    assert.equal(await page.locator('[data-og-owner-action="prepare"]').count(), 0);
    assert.equal(await page.evaluate(() => requests.length), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

await check('1 risultato: People resta una conferma esplicita', async () => {
  const { page, errors } = await fixture({ candidates: [candidate('a')] });
  try {
    await resolve(page);
    assert.equal(await page.locator('[data-og-owner-person]').count(), 1);
    assert.equal(await page.locator('[data-og-owner-person="0"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.og-owner-selection').count(), 0, 'un solo candidato non viene scelto automaticamente');
    assert.match(await page.locator('#ogOwnerCommand').innerText(), /Conferma comunque People/);
    assert.equal(await page.evaluate(() => requests.filter(item => item.body.op === 'prepare-only').length), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

await check('N risultati: nessun first-match e cinque scelte esplicite', async () => {
  const { page, errors } = await fixture();
  try {
    await resolve(page);
    assert.equal(await page.locator('[data-og-owner-person]').count(), 2);
    assert.deepEqual(await page.locator('[data-og-owner-person]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed'))), ['false', 'false']);
    assert.equal(await page.locator('[data-og-owner-action="prepare"]').count(), 0, 'senza People scelto non esiste una preparazione azionabile');
    await chooseExactSecond(page);
    assert.equal(await page.locator('[data-og-owner-action="prepare"]').isEnabled(), true);
    assert.match(await page.locator('.og-owner-selected-person').innerText(), /Giuliano Verdi/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

await check('prepare-only usa il bersaglio esatto, retry idempotente e apre il caso Oggi', async () => {
  const { page, errors } = await fixture({ failFirstPrepare: true });
  try {
    await resolve(page);
    await chooseExactSecond(page);
    await page.locator('[data-og-owner-action="prepare"]').click();
    await page.waitForSelector('.og-owner-notice.is-error');
    assert.match(await page.locator('.og-owner-notice.is-error').innerText(), /più tempo|Riprova/);
    await page.locator('[data-og-owner-action="prepare"]').click();
    await page.waitForFunction(() => opened.length === 1);
    const state = await page.evaluate(() => ({ requests, opened, loads }));
    const prepares = state.requests.filter(item => item.body.op === 'prepare-only');
    assert.equal(prepares.length, 2);
    assert.equal(prepares[0].body.commandId, prepares[1].body.commandId, 'retry conserva la stessa chiave idempotente');
    assert.deepEqual({ ...prepares[1].body, commandId: '<id>' }, {
      op: 'prepare-only', instruction: 'Avvisa il portiere che il tecnico arriva alle 15',
      personRef: 'leads/person-b', conversationId: 'conv-b', practiceRef: 'leads/practice-b',
      propertyRef: 'listings/flat-b', channel: 'whatsapp', address: '+393330000002', commandId: '<id>'
    });
    assert.match(prepares[1].body.commandId, /^owner-ui-[\w.-]+$/);
    assert.deepEqual(state.opened, [['sg_case-demo', 'Incarico preparato da Valentino. Controlla destinatario, testo e seguito prima di confermare.', 'review']]);
    assert.deepEqual(state.loads, [true]);
    assert.equal(state.requests.every(item => item.url === '/api/segretaria/owner-command'), true, 'nessun endpoint di invio chiamato');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

await check('recapito discordante e pratica multi-Flat non diventano azionabili', async () => {
  const unsafe = candidate('a', {
    contact: { phones: ['+393330000099'], emails: [] },
    practices: [{ ref: 'leads/practice-a', type: 'lead', status: 'qualified', propertyRefs: ['listings/flat-a', 'listings/flat-other'] }]
  });
  const { page, errors } = await fixture({ candidates: [unsafe] });
  try {
    await resolve(page);
    await page.locator('[data-og-owner-person="0"]').click();
    await page.locator('#ogOwnerConversation').selectOption('conversations/conv-a');
    assert.match(await page.locator('#ogOwnerCommand').innerText(), /recapito che coincide|Flat verificato/);
    assert.equal(await page.locator('#ogOwnerPractice option:enabled').count(), 1, 'resta solo il placeholder: pratica ambigua disabilitata');
    assert.equal(await page.locator('[data-og-owner-action="prepare"]').isDisabled(), true);
    assert.equal(await page.evaluate(() => requests.filter(item => item.body.op === 'prepare-only').length), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

await check('su iPhone il comando resta in una colonna senza scorrimento laterale', async () => {
  const { page, errors } = await fixture({ width: 390 });
  try {
    await resolve(page);
    await page.locator('[data-og-owner-person="0"]').click();
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      columns: getComputedStyle(document.querySelector('.og-owner-form')).gridTemplateColumns,
      button: document.querySelector('[data-og-owner-action="resolve"]').getBoundingClientRect().width,
      panel: document.querySelector('#ogOwnerCommand').getBoundingClientRect().width,
    }));
    assert.ok(layout.overflow <= 1, 'overflow orizzontale: ' + layout.overflow);
    assert.equal(layout.columns.trim().split(/\s+/).length, 1);
    assert.ok(layout.button > layout.panel * .8, 'azione primaria non a piena corsia');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
