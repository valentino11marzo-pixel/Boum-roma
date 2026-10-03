// tests/preagreement/consent-ui.mjs — L'ACCETTAZIONE NATURALE, IN UN BROWSER VERO.
//
// 30/09/2026, dall'operatore: «la spunta per accettare i termini […] deve
// essere facilissima e naturale da mettere: adesso è troppo aggressiva e
// diventa bloccante». Misurato a 390px prima del cambio: una casella da 21px
// accanto a 7 righe di legalese, sotto 17 righe in maiuscolo del mandato, e
// «Accept & sign» SPENTO — toccato non faceva niente e non diceva niente.
//
// Si prova quello che fa il cliente dal telefono, sulla pagina vera
// (pre-agreement.html) con la sola rete finta:
//   1. il bottone non è mai morto: toccato senza spunta NON firma, porta sulla
//      riga e la indica;
//   2. la spunta si mette toccando la FRASE, non solo il quadratino;
//   3. il testo che il server registra è sulla pagina, integro, a un tocco
//      (stesso testo = stesso hash);
//   4. il mandato resta A PARTE, mai pre-spuntato: senza toccarlo parte
//      mandate:false, toccato parte mandate:true;
//   5. due tocchi veloci = UNA firma;
//   6. la card del mandato dopo l'accettazione: niente POST senza spunta,
//      con la spunta un POST solo, poi «Mandate given».

import { loadChromium, launchOptions } from '../_browser.mjs';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP: playwright non disponibile (npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js)');
  process.exit(0);
}
const { PA_CONSENT_TEXT, PA_MANDATE_TEXT } = await import('../../api/preagreement/_consent.js');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const TOKEN = 'a'.repeat(32);
const basePA = (over = {}) => ({
  token: TOKEN, status: 'sent', ref: null, askMandate: true,
  property: { address: 'Via Cavour 12, Roma', type: 'Entire Apartment', condition: 'Furnished', use: 'Residential', unit: 'B' },
  landlord: { name: 'Mario Rossi' },
  lease: { startDate: '2026-10-15', endDate: '2027-09-30', months: 12, lawRef: 'L.431/98 art.5 c.1' },
  money: { rent: 1200, monthlyTotal: 1300, energyCredit: 100, depositMonths: 2, deposit: 2400, dueAtSigning: 0,
    feePct: 10, feeVatPct: 22, feeDue: 'move-in', installmentMonths: 1, chargedMonthly: 1300 },
  tenant: { fullName: 'Anna Rossi', email: 'anna@example.com', phone: '+393331112223' },
  tenants: [{ fullName: 'Anna Rossi', email: 'anna@example.com', phone: '+393331112223' }],
  contract: null,
  ...over,
});

const browser = await chromium.launch(launchOptions());
const errs = [];

async function open(pa, { submitDelay = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const posts = { submit: [], mandate: [] };
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.includes('/api/preagreement/lookup')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, pa }) });
    if (u.includes('/api/preagreement/submit')) {
      posts.submit.push(JSON.parse(r.request().postData() || '{}'));
      if (submitDelay) await new Promise((res) => setTimeout(res, submitDelay));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ref: 'BOOM-TEST' }) });
    }
    if (u.includes('/api/preagreement/mandate')) {
      posts.mandate.push(JSON.parse(r.request().postData() || '{}'));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, at: '2026-09-30T19:00:00.000Z' }) });
    }
    if (u.startsWith('http://boom.test/')) {
      const path = u.replace('http://boom.test/', '').split('?')[0];
      try {
        const body = readFileSync(ROOT + path);
        const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html';
        return r.fulfill({ status: 200, body, contentType: type });
      } catch { return r.fulfill({ status: 404, body: '' }); }
    }
    return r.abort();   // niente rete esterna: un CDN lento renderebbe la suite un dado
  });
  await page.goto('http://boom.test/pre-agreement.html?t=' + TOKEN, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForFunction(() => document.getElementById('load') && document.getElementById('load').style.display === 'none', null, { timeout: 8000 }).catch(() => {});
  return { ctx, page, posts };
}

async function toStep4(page) {
  for (let i = 0; i < 3; i++) { await page.click('#abarBtn'); await page.waitForTimeout(250); }
  await page.waitForSelector('#paOk', { timeout: 5000 });
}

// ═══ 1 · Il passo 4 ═══════════════════════════════════════════════════════
console.log('\n\x1b[1mLa firma della proposta, dal telefono\x1b[0m');
{
  const { ctx, page, posts } = await open(basePA());
  await toStep4(page);
  check('il bottone «Accept & sign» NON è spento senza la spunta', await page.$eval('#abarBtn', (b) => !b.disabled));
  check('la spunta di accettazione parte vuota', !(await page.$eval('#paOk', (e) => e.checked)));
  check('il mandato parte vuoto (mai pre-spuntato)', !(await page.$eval('#paMandate', (e) => e.checked)));

  await page.click('#abarBtn');
  await page.waitForTimeout(250);
  check('senza spunta il tocco NON firma (nessun POST)', posts.submit.length === 0, String(posts.submit.length));
  check('…porta sulla riga e la indica', await page.$eval('#okRow', (r) => r.classList.contains('need')));
  check('…e la barra dice cosa manca, in una frase', /I accept this proposal/.test(await page.textContent('#abarHint')));

  const wording = await page.$eval('#okRow + details.full p', (p) => p.textContent);
  check('il testo che il server registra è sulla pagina, integro, a un tocco', wording === PA_CONSENT_TEXT);
  const mWording = await page.$eval('#mandateBox + details.full p', (p) => p.textContent);
  check('anche il mandato, parola per parola', mWording === PA_MANDATE_TEXT);
  check('il testo lungo è RACCOLTO (non è il muro davanti alla spunta)', !(await page.$eval('#okRow + details.full', (d) => d.open)));

  const box = await page.$eval('#okRow', (r) => { const b = r.getBoundingClientRect(); return { w: b.width, h: b.height }; });
  check('la riga da toccare è grande (≥ 44px di altezza, quasi tutta la larghezza)', box.h >= 44 && box.w >= 280, JSON.stringify(box));

  await page.click('#okRow b');   // si tocca la FRASE, non il quadratino
  check('toccare la frase mette la spunta', await page.$eval('#paOk', (e) => e.checked));
  check('…e la riga si accende', await page.$eval('#okRow', (r) => r.classList.contains('on') && !r.classList.contains('need')));

  await page.click('#abarBtn');
  await page.waitForTimeout(400);
  check('con la spunta firma: UN POST, accept:true', posts.submit.length === 1 && posts.submit[0].accept === true, JSON.stringify(posts.submit));
  check('…e il mandato non toccato parte FALSO', posts.submit[0] && posts.submit[0].mandate === false);
  await ctx.close();
}

// ═══ 2 · Il mandato scelto ════════════════════════════════════════════════
console.log('\n\x1b[1mIl mandato, quando il cliente lo vuole\x1b[0m');
{
  const { ctx, page, posts } = await open(basePA(), { submitDelay: 600 });
  await toStep4(page);
  await page.click('#okRow b');
  await page.click('#mandateBox b');
  check('toccare la riga del mandato lo spunta', await page.$eval('#paMandate', (e) => e.checked));
  await page.click('#abarBtn');
  // La rete è lenta: mentre la firma viaggia il cliente tocca ancora una riga
  // (la barra si ridisegna) e poi di nuovo il bottone. Col vecchio barSync il
  // bottone si RIACCENDEVA qui e partiva una seconda firma.
  await page.click('#mandateBox b');
  await page.click('#mandateBox b');
  check('mentre la firma viaggia il bottone resta fermo', await page.$eval('#abarBtn', (b) => b.disabled));
  await page.click('#abarBtn', { force: true, timeout: 1500 }).catch(() => {});
  await page.evaluate(() => document.getElementById('abarBtn').click());   // anche un click programmatico
  await page.waitForTimeout(900);
  check('due tocchi veloci = UNA firma', posts.submit.length === 1, String(posts.submit.length));
  check('…col mandato: mandate:true', posts.submit[0] && posts.submit[0].mandate === true);
  await ctx.close();
}

// ═══ 3 · Senza mandato offerto ════════════════════════════════════════════
console.log('\n\x1b[1mSenza mandato offerto dalla console\x1b[0m');
{
  const { ctx, page } = await open(basePA({ askMandate: false }));
  await toStep4(page);
  check('nessuna riga del mandato (non offerto = non chiesto)', !(await page.$('#paMandate')));
  check('la riga di accettazione c\'è comunque', !!(await page.$('#paOk')));
  await ctx.close();
}

// ═══ 4 · Il mandato dopo l'accettazione ═══════════════════════════════════
console.log('\n\x1b[1mLa card del mandato dopo l\'accettazione\x1b[0m');
{
  const { ctx, page, posts } = await open(basePA({ status: 'accepted', ref: 'BOOM-TEST', mandate: null }));
  await page.waitForSelector('#mandateBox2', { timeout: 5000 });
  check('il bottone del mandato non è spento', await page.$eval('#mandBtn', (b) => !b.disabled));
  check('la card dice in tre righe cosa succede (niente muro in maiuscolo)', (await page.$$('#mandateBox2 .mpts li')).length === 3);
  check('il testo integro è a un tocco', (await page.$eval('#mandateBox2 details.full p', (p) => p.textContent)) === PA_MANDATE_TEXT);
  check('la spunta parte vuota', !(await page.$eval('#paMandate2', (e) => e.checked)));
  await page.click('#mandBtn');
  await page.waitForTimeout(250);
  check('senza spunta: NESSUN mandato registrato', posts.mandate.length === 0, String(posts.mandate.length));
  check('…e la riga viene indicata', await page.$eval('#paMandate2', (e) => e.closest('.tick').classList.contains('need')));
  await page.click('#mandateBox2 .tick b');
  await page.click('#mandBtn');
  await page.waitForTimeout(400);
  check('con la spunta: UN POST, mandate:true', posts.mandate.length === 1 && posts.mandate[0].mandate === true, JSON.stringify(posts.mandate));
  check('…e la pagina dice «mandate given»', /Mandate to sign given/.test(await page.textContent('body')));
  await ctx.close();
}

// ═══ 5 · La sorgente ══════════════════════════════════════════════════════
console.log('\n\x1b[1mLe giunzioni sulla sorgente\x1b[0m');
{
  const src = readFileSync(ROOT + 'pre-agreement.html', 'utf8');
  check('il bottone del passo 4 non dipende più dalla spunta', !/btn\.disabled=!\(ok&&ok\.checked\)/.test(src));
  check('il vecchio «Tick the consent box above to enable signing» non c\'è più', !/Tick the consent box above/.test(src));
  check('la stampa (replica su carta) nasconde le righe da spuntare', /\.consent,\.agree,\.full,/.test(src));
}

await browser.close();
if (errs.length) console.log('  errori di pagina:', errs.slice(0, 5));
check('nessun errore JavaScript sulla pagina', errs.length === 0, errs.join(' | '));

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mAccettare è una riga da toccare, non un muro da superare.\x1b[0m');
