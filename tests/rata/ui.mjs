// tests/rata/ui.mjs — /rata nel browser vero, a 390px, come la apre un
// inquilino straniero da WhatsApp. La porta /api/payments/rata è finta ma le
// parole vengono dal rataView VERO; le segnalazioni cambiano lo stato come la
// porta vera. Le regole: inglese per chi non ha il telefono in italiano, il
// bonifico (gratis) sempre visibile con IBAN, BIC e causale da copiare, «ho
// già pagato» apre SOLO il modulo, la carta spenta non si nomina nemmeno, il
// ritorno da Stripe non riapre un pagamento, testi neutri per i
// co-intestatari, la rata in proporzione spiegata, il piede leggibile con
// l'informativa. Dati inventati.
// Uso: BOOM_PLAYWRIGHT=/opt/node-tools/node_modules/playwright-core/index.js node tests/rata/ui.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';

process.env.HOMIE_SECRET = 'segreto-ui';
const { rataView, amountInput } = await import('../../api/payments/rata.js');

const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const IBAN = 'IT60X0542811101000000123456';
const contract = { source: 'palazzo-import', landlordName: 'Esempio Immobiliare S.r.l.', landlordIban: IBAN, landlordBic: 'BPMOIT22XXX', tenantName: 'Ayse Esempio' };
const property = (extra) => ({ address: 'Piazzale Esempio 42, Roma', interno: '7', ...extra });
const base = { type: 'rent', month: '2026-10', amount: 1720, rentAmount: 1600, oneriAmount: 120, status: 'pending', dueDate: '2099-10-05', source: 'palazzo-import' };
const R = {
  off: { p: { id: 'off', ...base }, property: property(), contract },
  on: { p: { id: 'on', ...base }, property: property({ rataCard: { on: true, mandateAt: '2026-10-01', fee: 'absorbed' } }), contract },
  std: { p: { id: 'std', ...base, source: '', amount: 900, rentAmount: null, oneriAmount: null }, property: property(), contract: { landlordName: 'Proprietario Esempio', landlordIban: IBAN } },
  pro: { p: { id: 'pro', ...base, month: '2027-08', amount: 500, rentAmount: 465, oneriAmount: 35, periodFrom: '2027-08-15', periodTo: '2027-08-31', prorated: true }, property: property(), contract },
  paid: { p: { id: 'paid', ...base, status: 'paid', paidDate: '2026-10-04', paidVia: 'stripe', receiptUrl: 'https://pay.stripe.com/receipts/esempio' }, property: property(), contract },
  rev: { p: { id: 'rev', ...base, status: 'paid', paidDate: '2026-10-04', paidVia: 'stripe', disputeStatus: 'open' }, property: property(), contract },
  half: { p: { id: 'half', ...base }, property: property(), contract },
};
const calls = [];
let nextError = null;
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/api/payments/rata' && req.method === 'POST') {
    let body = ''; for await (const ch of req) body += ch;
    const b = JSON.parse(body); calls.push(b);
    res.setHeader('Content-Type', 'application/json');
    const r = R[b.id];
    if (!r || b.t !== 'tok') { res.statusCode = 404; res.end('{"ok":false,"error":"invalid_link"}'); return; }
    if (nextError) { const e = nextError; nextError = null; res.statusCode = e.status; res.end(JSON.stringify({ ok: false, error: e.error })); return; }
    if (b.op === 'report') {
      const p = r.p, list = Array.isArray(p.tenantReports) ? p.tenantReports : [];
      const amt = amountInput(b.amount);
      const entry = { date: b.date, note: b.note || '', proofUrl: b.proof ? 'https://firebasestorage.googleapis.com/x.jpg' : '', nonce: b.nonce, ...(amt ? { amount: Number(amt) } : {}) };
      if (!list.length) Object.assign(p, { tenantReported: true, tenantReportedAt: new Date().toISOString(), tenantReportDate: b.date, tenantNotes: entry.note, proofUrl: entry.proofUrl });
      p.tenantReports = [...list, entry];
      res.end(JSON.stringify({ ok: true, state: 'reported', proof: !!b.proof, count: p.tenantReports.length })); return;
    }
    if (b.op === 'withdraw') {
      // Come la porta vera: con più segnalazioni si toglie solo quella del nonce.
      const list = Array.isArray(r.p.tenantReports) ? r.p.tenantReports : [];
      if (list.length > 1) {
        const at = b.nonce ? list.findIndex(x => x.nonce === b.nonce) : -1;
        if (at < 0) { res.statusCode = 409; res.end('{"ok":false,"error":"several_reports"}'); return; }
        r.p.tenantReports = list.filter((_, i) => i !== at);
        Object.assign(r.p, { tenantReportDate: r.p.tenantReports[0].date });
        res.end('{"ok":true,"state":"reported"}'); return;
      }
      Object.assign(r.p, { tenantReported: false, tenantReports: null, proofUrl: null, tenantReportDate: null }); res.end('{"ok":true}'); return;
    }
    const view = rataView(r.p, { property: r.property, contract: r.contract });
    res.end(JSON.stringify({ ok: true, rata: view, payUrl: view.card.available ? 'https://www.boomrome.com/api/payments/link?k=pay&id=' + r.p.id + '&t=tok&from=rata' : '' }));
    return;
  }
  try {
    const file = path === '/rata' ? 'rata.html' : path.replace(/^\//, '');
    const data = await readFile(ROOT + file);
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
    res.end(data);
  } catch (_) { res.statusCode = 404; res.end('not found'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = 'http://127.0.0.1:' + server.address().port;

let passed = 0, failed = 0;
const errors = [];
const check = async (name, fn) => {
  try { await fn(); passed++; console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + ' — ' + (e && e.message)); }
};
const browser = await chromium.launch(launchOptions());
async function open(id, { locale = 'en-US', query = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(origin + '/rata.html?id=' + id + '&t=tok' + query);
  await pg.waitForSelector('h1');
  await pg.waitForFunction(() => !document.getElementById('app').innerText.includes('One moment') && !document.getElementById('app').innerText.includes('Un attimo'));
  return { pg, ctx };
}
// SCREENSHOT_DIR=… salva le schermate a 390px (per guardarle a occhio).
const shot = async (pg, name) => { if (process.env.SCREENSHOT_DIR) await pg.screenshot({ path: process.env.SCREENSHOT_DIR + '/rata-' + name + '.png', fullPage: true }); };
const noOverflow = pg => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

await check('inglese per un telefono non italiano: lang, titolo, intestazione', async () => {
  const { pg, ctx } = await open('off', { locale: 'tr-TR' });
  assert.equal(await pg.evaluate(() => document.documentElement.lang), 'en');
  assert.equal(await pg.title(), 'Your rent · BOOM');
  assert.equal(await pg.locator('h1').innerText(), 'Rent · October 2026');
  await ctx.close();
});
await check('italiano per un telefono italiano; ?lang=en vince sul telefono', async () => {
  let o = await open('off', { locale: 'it-IT' });
  assert.equal(await o.pg.locator('h1').innerText(), 'Canone · ottobre 2026');
  assert.equal(await o.pg.title(), 'La tua rata · BOOM');
  await o.ctx.close();
  o = await open('off', { locale: 'it-IT', query: '&lang=en' });
  assert.equal(await o.pg.locator('h1').innerText(), 'Rent · October 2026');
  await o.ctx.close();
});
await check('carta spenta (Palazzo senza mandato): solo il bonifico, e la carta non si nomina nemmeno', async () => {
  const { pg, ctx } = await open('off');
  assert.equal(await pg.locator('#card').count(), 0);
  const txt = (await pg.locator('#app').innerText()).toLowerCase();
  assert.ok(!/card|apple pay|carta/.test(txt), txt);
  assert.ok(await noOverflow(pg), 'niente scroll laterale a 390px');
  await shot(pg, 'off');
  await ctx.close();
});
await check('il bonifico è SEMPRE visibile: beneficiario, IBAN, BIC e causale, ognuno da copiare', async () => {
  const { pg, ctx } = await open('off');
  const kv = await pg.locator('.kv').innerText();
  assert.ok(kv.includes('Esempio Immobiliare S.r.l.') && kv.includes('IT60 X054 2811 1010 0000 0123 456') && kv.includes('BPMOIT22XXX') && /BOOM-[2-9A-HJ-NP-Z]{6} canone 2026-10/.test(kv), kv);
  assert.equal(await pg.locator('.kv .copy').count(), 3);
  assert.equal(await pg.locator('.kv .copy').first().getAttribute('aria-label'), 'Copy IBAN');
  assert.ok((await pg.locator('#bankh').innerText()).toLowerCase().includes('free'));
  assert.ok((await pg.locator('.hint').last().innerText()).includes('OUR'), 'la riga per chi paga da fuori SEPA');
  assert.equal(await pg.evaluate(() => [...document.querySelectorAll('.kv > *')].every(n => n.tagName === 'DIV' && n.querySelector(':scope > dt') && n.querySelector(':scope > dd'))), true, 'dl fatta di righe dt/dd');
  await ctx.close();
});
await check('«I have already paid» apre SOLO il modulo della segnalazione (il bonifico era già lì)', async () => {
  const { pg, ctx } = await open('off');
  assert.equal(await pg.locator('#f').count(), 0);
  await pg.locator('#bank').click();
  await pg.waitForSelector('#f');
  assert.equal(await pg.evaluate(() => document.activeElement && document.activeElement.id), 'dt');
  assert.equal(await pg.locator('.kv').count(), 1, 'una sola scheda del bonifico');
  await ctx.close();
});
await check('segnalato: testo neutro per i co-intestatari, conto del locatore, e «segnala un altro bonifico»', async () => {
  const { pg, ctx } = await open('off');
  await pg.locator('#bank').click();
  await pg.locator('#nt').fill('my half');
  await pg.locator('#send').click();
  await pg.waitForSelector('.status h2');
  const txt = await pg.locator('.status').innerText();
  assert.ok(txt.includes('A bank transfer made on ') && txt.includes('was reported') && txt.includes('landlord') && !/you reported/i.test(txt), txt);
  await pg.locator('#more').click();
  await pg.waitForSelector('#f');
  // La seconda metà, coi valori proposti: si manda «another» e un nonce NUOVO
  // (il server la tiene); un errore e il nuovo invio riusano lo STESSO nonce.
  nextError = { status: 503, error: 'unavailable' };
  await pg.locator('#send').click();
  await pg.waitForFunction(() => document.getElementById('err').textContent.length > 0);
  await pg.locator('#send').click();
  await pg.waitForSelector('.status ul li');
  assert.equal(await pg.locator('.status ul li').count(), 2, 'le due segnalazioni, elencate');
  const sent = calls.filter(c => c.op === 'report' && c.id === 'off').slice(-3);
  assert.ok(/^[0-9a-f]{24}$/.test(sent[0].nonce) && sent[0].another === false, 'primo modulo: nonce, non «another»');
  assert.ok(sent[1].another === true && sent[1].nonce !== sent[0].nonce, 'secondo modulo: «another» e nonce nuovo');
  assert.equal(sent[2].nonce, sent[1].nonce, 'il nuovo invio dopo un errore riusa lo stesso nonce');
  await shot(pg, 'reported');
  await ctx.close();
});
await check('col mandato: la carta c\'è, senza commissione, e porta la lingua a Stripe', async () => {
  const { pg, ctx } = await open('on');
  assert.equal(await pg.locator('#card').getAttribute('href'), 'https://www.boomrome.com/api/payments/link?k=pay&id=on&t=tok&from=rata&lang=en');
  const hint = await pg.locator('.hint').first().innerText();
  assert.ok(hint.startsWith('No fee') && hint.includes('collected by Egidi Immobiliare S.r.l. (BOOM) on behalf of Esempio Immobiliare S.r.l.'), hint);
  await shot(pg, 'on');
  await ctx.close();
});
await check('contratto normale: la commissione della carta detta prima, accanto al bonifico senza commissioni', async () => {
  const { pg, ctx } = await open('std', { locale: 'it-IT' });
  assert.ok(/€900 \+ €[\d,]+ di commissione per il pagamento con carta\. Il bonifico non ha commissioni\./.test(await pg.locator('.hint').first().innerText()));
  await ctx.close();
});
await check('la rata in proporzione si spiega (periodo e motivo)', async () => {
  const { pg, ctx } = await open('pro');
  const t = await pg.locator('.period').innerText();
  assert.ok(t.includes('Pro rata: 15 August 2027 – 31 August 2027') && t.includes('lower than usual'), t);
  await ctx.close();
});
await check('di ritorno da Stripe (riuscito): niente carta né bonifico — si aspetta la conferma', async () => {
  const { pg, ctx } = await open('on', { query: '&return=success' });
  assert.ok((await pg.locator('.status h2').innerText()).includes('Confirmation on its way'));
  assert.deepEqual([await pg.locator('#card').count(), await pg.locator('.kv').count()], [0, 0]);
  await ctx.close();
});
await check('di ritorno da Stripe (annullato): lo dice, e il bonifico è lì', async () => {
  const { pg, ctx } = await open('on', { query: '&return=cancel' });
  assert.ok((await pg.locator('.note').innerText()).includes('wasn’t completed'));
  assert.equal(await pg.locator('.kv').count(), 1);
  await ctx.close();
});
await check('pagata: la ricevuta si apre; contestazione aperta: "da verificare", niente pagamento', async () => {
  let o = await open('paid');
  assert.equal(await o.pg.locator('.status .link').getAttribute('href'), 'https://pay.stripe.com/receipts/esempio');
  assert.ok((await o.pg.locator('.status').innerText()).includes('emailed'));
  await o.ctx.close();
  o = await open('rev');
  assert.ok((await o.pg.locator('.status h2').innerText()).includes('being checked'));
  assert.equal(await o.pg.locator('#card').count() + await o.pg.locator('.kv').count(), 0);
  await o.ctx.close();
});
await check('data nel futuro: il messaggio giusto, non «controlla la connessione»', async () => {
  const { pg, ctx } = await open('std');
  await pg.locator('#bank').click();
  nextError = { status: 400, error: 'bad_date' };
  await pg.locator('#send').click();
  await pg.waitForFunction(() => document.getElementById('err').textContent.length > 0);
  assert.ok((await pg.locator('#err').innerText()).includes('can’t be in the future'));
  await ctx.close();
});
await check('accessibilità: piede leggibile (≥4,5:1) con l\'informativa, tasti lingua ≥44px, etichetta del gruppo tradotta', async () => {
  const { pg, ctx } = await open('off');
  const m = await pg.evaluate(() => {
    const lum = c => { const v = c.match(/\d+/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const f = getComputedStyle(document.getElementById('foot')).color, b = getComputedStyle(document.body).backgroundColor;
    const [l1, l2] = [lum(f), lum(b)].sort((a, b) => b - a);
    const btn = document.querySelector('[data-lang]').getBoundingClientRect();
    return { ratio: (l1 + 0.05) / (l2 + 0.05), h: btn.height, w: btn.width, href: document.querySelector('#foot a').getAttribute('href'), group: document.querySelector('.lang').getAttribute('aria-label') };
  });
  assert.ok(m.ratio >= 4.5, 'contrasto ' + m.ratio.toFixed(2));
  assert.ok(m.h >= 44 && m.w >= 44, JSON.stringify(m));
  assert.deepEqual([m.href, m.group], ['/privacy-inquilini?lang=en', 'Language']);
  await pg.locator('[data-lang="it"]').click();
  assert.deepEqual([await pg.locator('#foot a').getAttribute('href'), await pg.title(), await pg.locator('.lang').getAttribute('aria-label')], ['/privacy-inquilini', 'La tua rata · BOOM', 'Lingua']);
  await ctx.close();
});
await check('co-intestatari: la metà segnalata non dice «non pagare di nuovo»; l\'altro telefono non annulla; chi ha segnalato annulla SOLO la sua, dopo la conferma', async () => {
  const a = await open('half');
  await a.pg.locator('#bank').click();
  assert.equal(await a.pg.locator('#am').inputValue(), '1720', 'proposta la rata intera');
  await a.pg.locator('#am').fill('860');
  await a.pg.locator('#dt').fill('2026-10-03');
  await a.pg.locator('#send').click();
  await a.pg.waitForSelector('.status h2');
  let txt = await a.pg.locator('#app').innerText();
  assert.ok(txt.includes('€860 of €1,720 reported so far') && !/Don’t pay again/.test(txt), txt);
  assert.equal(await a.pg.locator('.kv').count(), 1, 'dove si paga il resto resta in vista');
  await shot(a.pg, 'half');
  await a.pg.locator('#more').click();
  await a.pg.waitForSelector('#f');
  assert.equal(await a.pg.locator('#am').inputValue(), '860', 'il secondo modulo propone ciò che manca');
  await a.pg.locator('#dt').fill('2026-10-04');
  await a.pg.locator('#send').click();
  await a.pg.waitForFunction(() => document.querySelectorAll('.status ul li').length === 2);
  txt = await a.pg.locator('.status').innerText();
  assert.ok(/Don’t pay again/.test(txt) && txt.includes('€860'), txt);
  // L'altro telefono (nessun nonce suo): niente «annulla», la strada è BOOM.
  const b = await open('half');
  assert.equal(await b.pg.locator('#wd').count(), 0);
  assert.ok((await b.pg.locator('#app').innerText()).includes('to cancel one sent from another phone'));
  await b.ctx.close();
  // Chi ha segnalato: conferma con la data, e parte il SUO nonce.
  let asked = '';
  a.pg.once('dialog', d => { asked = d.message(); d.accept(); });
  await a.pg.locator('#wd').click();
  await a.pg.waitForFunction(() => document.querySelectorAll('.status ul li').length === 1);
  const sent = calls.filter(c => c.id === 'half' && c.op === 'report');
  const wd = calls.filter(c => c.id === 'half' && c.op === 'withdraw').at(-1);
  assert.ok(asked.includes('4 October 2026') && asked.includes('this phone'), asked);
  assert.equal(wd.nonce, sent.at(-1).nonce, 'annullata solo la seconda segnalazione, quella di questo telefono');
  assert.equal(R.half.p.tenantReports.length, 1);
  assert.equal(R.half.p.tenantReports[0].date, '2026-10-03', 'la segnalazione dell\'altro resta');
  await a.ctx.close();
});
await check('nessun errore JavaScript in nessuna pagina', async () => { assert.deepEqual(errors, []); });

await browser.close();
server.close();
console.log(`\n${passed} check /rata nel browser · ${failed} falliti`);
process.exitCode = failed ? 1 : 0;
