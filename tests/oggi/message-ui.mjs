import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { html } from './home-harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const chromium = await loadChromium(); assert(chromium, 'Browser required');
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
let browser, checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log('PASS ' + name); };
try {
    browser = await chromium.launch(launchOptions({ headless: true }));
    for (const width of [1440, 390, 320]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = [];
        page.setDefaultTimeout(5000); page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
        await page.goto(base); await page.waitForFunction(() => oggiSegretaria.loaded);
        await page.evaluate(() => {
            window.copied = [];
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => copied.push(t) } });
        });
        const open = async n => {
            if (!await page.locator('#ogQueueArchive').evaluate(el => el.open)) await page.locator('#ogQueueArchive > summary').click();
            await page.locator('#sgFollowPanel [data-sg-action="message"]').nth(n).click();
            await page.waitForSelector('#owMessageText');
        };
        await check(width + ' copia soltanto il testo rivisto, non fonte né scadenze interne', async () => {
            await open(0);
            assert.equal(await page.locator('#owMessageText').inputValue(), '');
            assert(await page.locator('#owMessageCopy').isDisabled());
            await page.locator('[data-ow-template="access"]').click();
            const text = await page.locator('#owMessageText').inputValue();
            assert.match(text, /Casa Aurora/); assert.match(text, /Verifico l’accesso/);
            assert.doesNotMatch(text, /Persona Demo|portiere|10 alle 12|Confermare l’accesso|2026-|not-a-credential/);
            const edited = 'Buongiorno, può confermarmi la disponibilità per il passaggio? Verifico poi l’accesso. Grazie.';
            await page.locator('#owMessageText').fill(edited);
            await page.locator('[data-ow-template="update"]').click();
            assert.equal(await page.locator('#owMessageText').inputValue(), edited);
            await page.locator('#owMessageCopy').click();
            assert.deepEqual(await page.evaluate(() => copied), [edited]);
            assert.match(await page.locator('#owMessageStatus').innerText(), /Copiato/);
            assert.equal(await page.evaluate(() => testIO.writes.length), 0);
            await page.evaluate(() => oggiSegretariaRender());
            assert.equal(await page.locator('#owMessageText').inputValue(), edited);
            assert(await page.locator('#sgFollowForm').isVisible());
            assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width + 1);
            await page.locator('[data-sg-modal="cancel"]').first().click();
        });
        await check(width + ' richiesta ambigua: chiarimento senza casa o identità inventate', async () => {
            await open(1);
            assert.equal(await page.locator('[data-ow-template="access"]').count(), 0);
            await page.locator('[data-ow-template="clarify"]').click();
            const text = await page.locator('#owMessageText').inputValue();
            assert.match(text, /quale immobile/); assert.doesNotMatch(text, /Aurora|Giuliano|domani/);
            assert(await page.locator('#sgPractice').isDisabled());
            await page.locator('[data-sg-modal="cancel"]').first().click();
        });
        await check(width + ' un nuovo messaggio blocca la copia automatica della bozza vecchia', async () => {
            await open(0); await page.locator('[data-ow-template="access"]').click();
            const count = await page.evaluate(() => copied.length);
            await page.evaluate(() => { oggiSegretaria.rows[0] = structuredClone(oggiSegretaria.rows[0]); oggiSegretaria.rows[0].followUp.lastMessageId = 'new-message'; });
            await page.locator('#owMessageCopy').click();
            assert.equal(await page.evaluate(() => copied.length), count);
            assert.match(await page.locator('#owMessageStatus').innerText(), /richiesta è cambiata/);
            await page.locator('[data-sg-modal="cancel"]').first().click();
        });
        await check(width + ' cambio pratica e immobile rimosso non copiano il contesto precedente', async () => {
            await open(0); await page.locator('[data-ow-template="access"]').click();
            const count = await page.evaluate(() => copied.length);
            await page.locator('#sgPractice').selectOption('');
            await page.locator('#owMessageCopy').click();
            assert.equal(await page.evaluate(() => copied.length), count);
            await page.locator('#sgPractice').selectOption('contracts/contratto-demo');
            await page.evaluate(() => { window.oldProperties = S.properties; S.properties = []; });
            await page.locator('#owMessageCopy').click();
            assert.equal(await page.evaluate(() => copied.length), count);
            await page.evaluate(() => { S.properties = oldProperties; });
            await page.locator('[data-sg-modal="cancel"]').first().click();
        });
        await check(width + ' bozza conservata tornando da esito e dopo conflitto, da ricontrollare', async () => {
            await open(0); await page.locator('#owMessageText').fill('Testo scritto a mano da conservare.');
            await page.locator('[data-sg-modal="close"]').click();
            await page.locator('[data-sg-modal="back"]').click();
            assert.equal(await page.locator('#owMessageText').inputValue(), 'Testo scritto a mano da conservare.');
            const date = await page.evaluate(() => BOOM_SEGRETARIA_CASI.localDateTime(new Date(Date.now() + 86400000).toISOString()));
            await page.locator('#sgCheckAt').fill(date);
            await page.evaluate(() => { testIO.followUps[0].followUp.lastMessageId = 'new-inbound'; testIO.followUps[0].followUp.preview = 'È cambiato l’orario: prima ci sentiamo.'; });
            await page.locator('[data-sg-submit]').click();
            await page.waitForSelector('#owMessageReviewed');
            assert.equal(await page.locator('#owMessageText').inputValue(), 'Testo scritto a mano da conservare.');
            assert.match(await page.locator('#sgFollowModal').innerText(), /È cambiato l’orario/);
            const count = await page.evaluate(() => copied.length);
            await page.locator('#owMessageCopy').click();
            assert.equal(await page.evaluate(() => copied.length), count);
            await page.locator('#owMessageReviewed').click();
            await page.locator('#owMessageCopy').click();
            assert.equal(await page.evaluate(() => copied.length), count + 1);
            await page.locator('[data-sg-modal="cancel"]').first().click();
        });
        await check(width + ' fallimento clipboard esplicito e cambio account non copia', async () => {
            await open(0); await page.locator('[data-ow-template="update"]').click();
            await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw Error('denied'); }; document.execCommand = () => false; window.prompts = []; window.prompt = (label, text) => prompts.push({ label, text }); });
            await page.locator('#owMessageCopy').click();
            assert.match(await page.locator('#owMessageStatus').innerText(), /non riuscita/);
            assert.equal(await page.evaluate(() => prompts[0].label), 'Copia il testo:');
            await page.evaluate(() => { testAuth.currentUser = { uid: 'different-admin' }; });
            await page.locator('#owMessageCopy').click();
            assert.equal(await page.evaluate(() => prompts.length), 1);
            assert.equal(await page.evaluate(() => testIO.writes.length), 0);
            assert.deepEqual(errors, []);
        });
        await check(width + ' messaggio e seguito completano il percorso senza un invio implicito', async () => {
            await page.evaluate(() => { testAuth.currentUser = { uid: 'demo-admin', getIdToken: async () => 'not-a-credential' }; });
            await page.locator('#sgAction').fill('Attendere la disponibilità del tecnico');
            await page.locator('#sgWaitingOn').selectOption('collaborator');
            await page.locator('#sgWaitingLabel').fill('Tecnico dimostrativo');
            await page.locator('[data-ow-recheck="tomorrow"]').click();
            const when = await page.locator('#sgCheckAt').inputValue();
            assert.match(when, /T09:00$/); assert(new Date(when).getTime() > Date.now());
            await page.locator('[data-sg-submit]').click();
            await page.waitForFunction(() => !document.getElementById('sgFollowModal') && !oggiSegretaria.loading);
            assert.equal(await page.locator('[data-ow-view="following"]').getAttribute('aria-pressed'), 'true');
            assert.match(await page.locator('[data-sg-group="waiting"]').innerText(), /Tecnico dimostrativo/);
            assert.equal(await page.evaluate(() => testIO.demoWrites.length), 1);
            assert.equal(await page.evaluate(() => testIO.writes.length), 0);
            assert.doesNotMatch(await page.evaluate(() => JSON.stringify(testIO.demoWrites)), /Buongiorno|messageText|draft/);
            assert.deepEqual(errors, []);
        });
        await page.close();
    }
    console.log(checks + ' verifiche messaggio reale OK');
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
