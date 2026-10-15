// tests/attribution/run.mjs — da dove arriva chi ci scrive, assistenti AI compresi.
//
// IL DIFETTO (ottobre 2026). Le visite da ChatGPT arrivano con
// utm_source=chatgpt.com e diventavano un canale a sé ("chatgpt.com");
// Gemini (gemini.google.com) cadeva su 'google' perché il controllo di Google
// veniva prima; il primo contatto poteva congelarsi su 'internal' quando il
// consenso arrivava alla seconda pagina; solo /owners e /canone portavano una
// fonte sul lead; /behavior non vedeva canali né conversioni confermate.
//
// Qui si prova, sui file veri:
//  1. la tabella di classifySource (AI prima di Google);
//  2. che il blocco CLASSIFY di js/boom-track.js sia IDENTICO a quello del
//     motore (una copia sola, incollata due volte);
//  3. in Chromium: niente cookie né memoria prima del consenso, il cookie
//     boom_attr dopo, il primo contatto mai 'internal', il cookie che sparisce
//     col diniego, il «(ref: …)» nel WhatsApp una volta sola, il deposito di
//     blocco che non è un Property Finding;
//  4. attributionFromReq: il corpo batte il cookie, 120 caratteri, niente query;
//  5. gli handler veri (Firestore in memoria) scrivono la fonte dal cookie;
//  6. il lead WhatsApp legge il «(ref: ai:chatgpt)»;
//  7. summarize riclassifica le righe vecchie e conta tentativi e conversioni.
//
// Run: node tests/attribution/run.mjs

import { register } from 'node:module';
register('../apply/loader.mjs', import.meta.url);

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => readFileSync(path.join(ROOT, p), 'utf8');
const B = require('../../js/behavior-engine.js');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 500) : ''}`); }
};
const section = t => console.log('\n\x1b[1m▸ ' + t + '\x1b[0m');

// ── 1. la tabella ──────────────────────────────────────────────────────────
section('1. classifySource: gli assistenti AI per motore, PRIMA di Google');
{
  const c = (utm, host) => B.classifySource(utm, host);
  const t = (name, got, ch, eng) => ok(name, got.channel === ch && (eng === undefined || got.engine === eng), got);
  t('utm chatgpt.com → ai_assistant / chatgpt', c('chatgpt.com', ''), 'ai_assistant', 'chatgpt');
  t('utm ChatGPT.com (maiuscole) → chatgpt', c('ChatGPT.com', ''), 'ai_assistant', 'chatgpt');
  t('referrer gemini.google.com → gemini, NON google', c('', 'gemini.google.com'), 'ai_assistant', 'gemini');
  t('referrer bard.google.com → gemini', c('', 'bard.google.com'), 'ai_assistant', 'gemini');
  t('referrer www.perplexity.ai → perplexity', c('', 'www.perplexity.ai'), 'ai_assistant', 'perplexity');
  t('referrer chat.openai.com → chatgpt', c('', 'chat.openai.com'), 'ai_assistant', 'chatgpt');
  t('referrer copilot.microsoft.com → copilot', c('', 'copilot.microsoft.com'), 'ai_assistant', 'copilot');
  t('referrer grok.com → grok', c('', 'grok.com'), 'ai_assistant', 'grok');
  t('referrer claude.ai → claude', c('', 'claude.ai'), 'ai_assistant', 'claude');
  t('referrer chat.deepseek.com → deepseek', c('', 'chat.deepseek.com'), 'ai_assistant', 'deepseek');
  t('referrer chat.mistral.ai → mistral', c('', 'chat.mistral.ai'), 'ai_assistant', 'mistral');
  t('utm gemini con referrer google → gemini (l\'AI vince)', c('gemini', 'www.google.com'), 'ai_assistant', 'gemini');
  t('www.google.com → google', c('', 'www.google.com'), 'google', '');
  t('google.it → google', c('', 'google.it'), 'google');
  t('www.boomrome.com → internal', c('', 'www.boomrome.com'), 'internal');
  t('boomrome.com → internal', c('', 'boomrome.com'), 'internal');
  t('nessun referrer → direct', c('', ''), 'direct');
  t('utm qualsiasi (newsletter) → il suo nome', c('newsletter', 'www.google.com'), 'newsletter', '');
  t('duckduckgo.com → organic_search', c('', 'duckduckgo.com'), 'organic_search');
  t('search.brave.com → organic_search', c('', 'search.brave.com'), 'organic_search');
  t('kagi.com → organic_search', c('', 'kagi.com'), 'organic_search');
  t('l.instagram.com → social', c('', 'l.instagram.com'), 'social');
  t('t.co → social', c('', 't.co'), 'social');
  t('x.com → social', c('', 'x.com'), 'social');
  t('un sito qualunque → referral', c('', 'expatforum.it'), 'referral');
  t('un dominio che CONTIENE "box" non diventa x.com', c('', 'dropbox.com'), 'referral');
  ok('aiEngine toglie www. e spazi', B.aiEngine('  WWW.Perplexity.AI ') === 'perplexity');
  ok('aiEngine su un host non AI → stringa vuota', B.aiEngine('www.google.com') === '');
}

// ── 2. una copia sola ──────────────────────────────────────────────────────
section('2. Il blocco CLASSIFY è identico nel tracker e nel motore');
{
  const block = src => { const m = src.match(/\/\* CLASSIFY:BEGIN \*\/[\s\S]*?\/\* CLASSIFY:END \*\//); return m ? m[0] : null; };
  const a = block(read('js/boom-track.js')), b = block(read('js/behavior-engine.js'));
  ok('il blocco esiste in entrambi i file', !!a && !!b);
  ok('byte per byte uguale', a === b, a && b ? { track: a.length, engine: b.length } : null);
  ok('il controllo AI sta PRIMA di quello di Google', !!b && b.indexOf('aiEngine(utm) || aiEngine(host)') < b.indexOf("'google'"));
  const track = read('js/boom-track.js');
  ok('il tracker non scrive mai "internal" come primo contatto', /if \(touch\.channel !== 'internal'\) writeTouch\('boom:source'/.test(track));
  ok('il cookie ha Max-Age 90 giorni, Path=/, SameSite=Lax e Secure su https',
    track.includes("'boom_attr=' + encodeURIComponent(attr) + '; Max-Age=7776000; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '')"));
  ok('il diniego cancella il cookie', track.includes("document.cookie = 'boom_attr=; Max-Age=0; Path=/'") && /boom-consent-denied[^\n]*dropAttribution/.test(track));
  ok('il resto della pagina NON cambia: il listener boom-conversion c\'è ancora', /addEventListener\('boom-conversion'/.test(track));
}

// ── 3. nel browser ─────────────────────────────────────────────────────────
section('3. In Chromium: il consenso decide, il primo contatto non si congela');
{
  const { loadChromium, launchOptions } = await import('../_browser.mjs');
  const chromium = await loadChromium();
  if (!chromium) console.log('  SKIP: playwright non disponibile — la prova in browser non gira');
  else {
    // trackFirst: come book/contact/deals/faq, il tracker PRIMA del modulo del consenso
    const page = (title, trackFirst) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} — BOOM</title></head>
<body><main><section id="hero" style="min-height:420px"><h1>${title}</h1>
<a id="next" href="/property-finding">Property Finding</a>
<a id="wa" href="https://wa.me/393313251961?text=Hi%20BOOM%2C%20about%20a%20flat">WhatsApp</a>
<a id="wa2" href="https://wa.me/393313251961">WhatsApp bare</a>
<a id="wa3" href="https://wa.me/393313251961?text=Ciao">WhatsApp after</a>
<form id="f" onsubmit="return false"><input name="email"></form></section></main>
${trackFirst ? '<script src="/js/boom-track.js"></script><script src="/js/boom-consent.js"></script>' : '<script src="/js/boom-consent.js"></script><script src="/js/boom-track.js"></script>'}
<script>document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href*="wa.me"]'); if (a) e.preventDefault(); });</script>
</body></html>`;
    const PAGES = { '/faq': page('FAQ'), '/property-finding': page('Property Finding'), '/thank-you': page('Thank you'), '/contact': page('Contact', true) };
    const srv = http.createServer((rq, rs) => {
      const u = rq.url.split('?')[0];
      if (PAGES[u]) { rs.setHeader('content-type', 'text/html; charset=utf-8'); return rs.end(PAGES[u]); }
      if (u === '/js/boom-consent.js' || u === '/js/boom-track.js') {
        rs.setHeader('content-type', 'text/javascript'); return rs.end(read(u.slice(1)));
      }
      rs.statusCode = 404; rs.end();
    }).listen(0);
    const base = `http://localhost:${srv.address().port}`;
    const br = await chromium.launch(launchOptions());
    const beacons = [];
    const open = async (init) => {
      const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
      if (init) await ctx.addInitScript(init);
      await ctx.route('**/*', async r => {
        const u = r.request().url();
        if (u.includes('/api/analytics/collect')) { try { beacons.push(JSON.parse(r.request().postData() || 'null')); } catch {} return r.fulfill({ status: 204 }); }
        return u.startsWith(base) ? r.continue() : r.abort();
      });
      const pg = await ctx.newPage();
      const errs = []; pg.on('pageerror', e => errs.push(e.message));
      return { ctx, pg, errs };
    };
    const attrCookie = async ctx => { const c = (await ctx.cookies()).find(x => x.name === 'boom_attr'); return c ? decodeURIComponent(c.value) : null; };
    const stores = pg => pg.evaluate(() => ({
      ls: Object.keys(localStorage).filter(k => k.startsWith('boom:')),
      ss: Object.keys(sessionStorage).filter(k => k.startsWith('boom:')),
      first: JSON.parse(localStorage.getItem('boom:source') || 'null'),
      last: JSON.parse(localStorage.getItem('boom:last') || 'null'),
      cookie: document.cookie,
    }));
    const accept = async pg => { await pg.waitForSelector('.boomcst .ok', { state: 'visible', timeout: 8000 }); await pg.click('.boomcst .ok'); await pg.waitForTimeout(150); };
    const deny = async pg => { await pg.waitForSelector('.boomcst .no', { state: 'visible', timeout: 8000 }); await pg.click('.boomcst .no'); await pg.waitForTimeout(150); };
    try {
      // 3a. da Gemini, consenso sulla pagina d'arrivo
      {
        const { ctx, pg, errs } = await open();
        await pg.goto(base + '/faq', { referer: 'https://gemini.google.com/', waitUntil: 'load' });
        await pg.waitForTimeout(400);
        const before = await stores(pg);
        ok('prima del consenso: nessun cookie boom_attr', (await attrCookie(ctx)) === null, before.cookie);
        ok('prima del consenso: niente in localStorage né in sessionStorage', before.ls.length === 0 && before.ss.length === 0, before);
        ok('prima del consenso: boomAttribution non esiste', await pg.evaluate(() => typeof window.boomAttribution === 'undefined'));
        await accept(pg);
        ok('dopo il consenso, con referrer gemini.google.com: cookie «ai:gemini · /faq»', (await attrCookie(ctx)) === 'ai:gemini · /faq', await attrCookie(ctx));
        const after = await stores(pg);
        ok('il primo contatto salvato è l\'assistente, col motore e la landing', after.first && after.first.channel === 'ai_assistant'
          && after.first.engine === 'gemini' && after.first.landing === '/faq' && after.first.referrerHost === 'gemini.google.com' && after.first.at > 0, after.first);
        ok('boom:last tiene l\'ultimo contatto non interno', after.last && after.last.engine === 'gemini', after.last);
        ok('window.boomAttribution() restituisce la stessa stringa', (await pg.evaluate(() => window.boomAttribution())) === 'ai:gemini · /faq');
        ok('il campo nascosto boom_source del modulo porta la stringa, non il canale nudo',
          (await pg.inputValue('#f input[name="boom_source"]')) === 'ai:gemini · /faq');

        await pg.click('#wa'); await pg.click('#wa');
        const wa = await pg.getAttribute('#wa', 'href');
        const suffix = encodeURIComponent('\n\n(ref: ai:gemini)');
        ok('WhatsApp con text=: il «(ref: ai:gemini)» si aggiunge al testo UNA volta', wa.split(suffix).length === 2 && wa.startsWith('https://wa.me/393313251961?text=Hi%20BOOM%2C%20about%20a%20flat' + suffix), wa);
        ok('...e il link è marcato data-boom-ref', (await pg.getAttribute('#wa', 'data-boom-ref')) === '1');
        const text = decodeURIComponent(new URL(wa).searchParams.get('text') === null ? '' : wa.split('text=')[1]);
        const { waRef } = await import('../../api/homie/_lead.js');
        ok('il messaggio che arriva su WhatsApp si rilegge lato server', waRef(text) === 'whatsapp · ai:gemini', text);
        await pg.click('#wa2'); await pg.click('#wa2');
        const wa2 = await pg.getAttribute('#wa2', 'href');
        ok('WhatsApp senza text=: il messaggio di oggi, col ref una volta sola', /text=Hi%20BOOM!%20I%20am%20interested/.test(wa2)
          && (decodeURIComponent(wa2).match(/\(ref: ai:gemini\)/g) || []).length === 1, wa2);

        // 3d. diniego: il cookie sparisce
        await pg.waitForTimeout(600); // il riquadro chiuso esce dal DOM
        await pg.evaluate(() => window.boomConsent.open());
        await deny(pg);
        const gone = await stores(pg);
        ok('diniego: il cookie boom_attr non c\'è più', (await attrCookie(ctx)) === null, gone.cookie);
        ok('diniego: via anche i contatti salvati', gone.first === null && gone.last === null && gone.ss.length === 0, gone);
        ok('diniego: boomAttribution() vuota e il campo nascosto svuotato', (await pg.evaluate(() => window.boomAttribution())) === ''
          && (await pg.inputValue('#f input[name="boom_source"]')) === '');
        await pg.click('#wa3');
        ok('diniego: un WhatsApp cliccato dopo non porta più il ref', (await pg.getAttribute('#wa3', 'href')) === 'https://wa.me/393313251961?text=Ciao');
        // i link decorati PRIMA del diniego: la fonte non deve restare nel messaggio
        const noRef = h => !/ref%3A/i.test(h) && !/\(ref:/.test((() => { try { return decodeURIComponent(h); } catch { return h; } })());
        const waAfter = await pg.getAttribute('#wa', 'href'), wa2Back = await pg.getAttribute('#wa2', 'href');
        ok('diniego: il link con text= torna com\'era, senza il «(ref: …)»', waAfter === 'https://wa.me/393313251961?text=Hi%20BOOM%2C%20about%20a%20flat', waAfter);
        ok('diniego: il link senza text= torna nudo', wa2Back === 'https://wa.me/393313251961', wa2Back);
        ok('...e nessuno dei due resta marcato data-boom-ref', (await pg.getAttribute('#wa', 'data-boom-ref')) === null && (await pg.getAttribute('#wa2', 'data-boom-ref')) === null);
        await pg.click('#wa'); await pg.click('#wa2');
        const waRe = await pg.getAttribute('#wa', 'href'), wa2Re = await pg.getAttribute('#wa2', 'href');
        ok('diniego: ricliccati, #wa e #wa2 non portano più la fonte', noRef(waRe) && noRef(wa2Re), { waRe, wa2Re });
        await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(300);
        ok('dopo il diniego, ricaricando: ancora nessun cookie', (await attrCookie(ctx)) === null);
        ok('nessun errore JS', errs.length === 0, errs);
        await ctx.close();
      }

      // 3c. arrivo da Gemini senza consenso, consenso alla seconda pagina
      {
        const { ctx, pg, errs } = await open();
        await pg.goto(base + '/faq', { referer: 'https://gemini.google.com/', waitUntil: 'load' });
        await pg.waitForSelector('.boomcst .ok', { state: 'visible', timeout: 8000 });
        const s0 = await stores(pg);
        ok('su /faq senza scelta: nessun dato scritto (nemmeno il referrer in attesa)', s0.ls.length === 0 && s0.ss.length === 0 && (await attrCookie(ctx)) === null, s0);
        await Promise.all([pg.waitForNavigation({ waitUntil: 'load' }), pg.click('#next')]);
        ok('la seconda pagina vede /faq come referrer (navigazione interna)', /\/faq$/.test(await pg.evaluate(() => document.referrer)));
        await accept(pg);
        const s1 = await stores(pg);
        // SCELTA DI PRIVACY DELIBERATA, diversa dal piano (che voleva qui il
        // referrer dell'assistente): ricordarlo vorrebbe dire scriverlo PRIMA
        // del consenso. Il primo contatto è noto solo se il consenso arriva
        // sulla pagina d'arrivo o in una visita esterna successiva.
        ok('consenso su /property-finding: scelta di privacy — il referrer di /faq non era salvabile prima del consenso, quindi nessun primo contatto (e mai «internal»)', s1.first === null && s1.last === null, s1);
        ok('...e nessun cookie «internal»: una fonte sconosciuta resta vuota', (await attrCookie(ctx)) === null && (await pg.evaluate(() => window.boomAttribution())) === '');
        ok('...il campo nascosto boom_source resta vuoto, mai inventato', (await pg.inputValue('#f input[name="boom_source"]')) === '');
        await pg.goto(base + '/faq', { referer: 'https://www.perplexity.ai/', waitUntil: 'load' });
        await pg.waitForTimeout(300);
        const s2 = await stores(pg);
        ok('la visita dopo, da un assistente, diventa il primo contatto (prima restava «internal» per sempre)',
          s2.first && s2.first.engine === 'perplexity' && (await attrCookie(ctx)) === 'ai:perplexity · /faq', { first: s2.first, cookie: await attrCookie(ctx) });
        await pg.goto(base + '/property-finding', { referer: 'https://www.google.com/', waitUntil: 'load' });
        await pg.waitForTimeout(300);
        const s3 = await stores(pg);
        ok('un contatto successivo (Google) aggiorna boom:last, non il primo', s3.first.engine === 'perplexity' && s3.last.channel === 'google'
          && (await attrCookie(ctx)) === 'ai:perplexity · /faq', { first: s3.first, last: s3.last });
        ok('nessun errore JS', errs.length === 0, errs);
        await ctx.close();
      }

      // un primo contatto vecchio: 'internal' è assenza, 'chatgpt.com' è ChatGPT
      {
        const { ctx, pg } = await open(() => {
          localStorage.setItem('boom:consent', 'all:' + Date.now());
          if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('boom:source', JSON.stringify({ channel: 'internal', landing: '/blog' })); }
        });
        await pg.goto(base + '/faq', { referer: 'https://gemini.google.com/', waitUntil: 'load' });
        await pg.waitForTimeout(300);
        const s = await stores(pg);
        ok('un «internal» salvato dal tracker vecchio vale come assente: vince Gemini', s.first && s.first.engine === 'gemini' && (await attrCookie(ctx)) === 'ai:gemini · /faq', s.first);
        await ctx.close();
      }
      {
        const { ctx, pg } = await open(() => {
          localStorage.setItem('boom:consent', 'all:' + Date.now());
          localStorage.setItem('boom:source', JSON.stringify({ channel: 'chatgpt.com', landing: '/blog-contract-types', referrerHost: '' }));
        });
        await pg.goto(base + '/faq', { waitUntil: 'load' });
        await pg.waitForTimeout(300);
        ok('un primo contatto vecchio «chatgpt.com» (utm) si legge come ChatGPT', (await attrCookie(ctx)) === 'ai:chatgpt · /blog-contract-types', await attrCookie(ctx));
        await ctx.close();
      }
      {
        // consenso vecchio scaduto o ritirato: il cookie rimasto si cancella
        const { ctx, pg } = await open();
        await ctx.addCookies([{ name: 'boom_attr', value: encodeURIComponent('google · /'), url: base }]);
        await pg.goto(base + '/faq', { waitUntil: 'load' });
        await pg.waitForTimeout(300);
        ok('senza consenso valido, un boom_attr rimasto si cancella al caricamento', (await attrCookie(ctx)) === null);
        await ctx.close();
      }
      {
        // un consenso SCADUTO ('all:1000', oltre i 365 giorni) su una pagina che
        // carica il tracker PRIMA del modulo del consenso (book, contact, deals,
        // faq): il tracker non deve valerlo nemmeno per l'istante in cui il
        // modulo non l'ha ancora cancellato
        const { ctx, pg, errs } = await open(() => {
          if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.setItem('boom:consent', 'all:1000'); }
        });
        await pg.goto(base + '/contact', { referer: 'https://www.google.com/', waitUntil: 'load' });
        await pg.waitForTimeout(300);
        const s = await stores(pg);
        ok('consenso scaduto, tracker prima del consenso: nessun cookie boom_attr', (await attrCookie(ctx)) === null, await attrCookie(ctx));
        ok('...niente primo contatto salvato e il campo nascosto non nasce', s.first === null && s.last === null
          && (await pg.locator('#f input[name="boom_source"]').count()) === 0, s);
        ok('...e il modulo del consenso l\'ha tolto e richiede la scelta', (await pg.evaluate(() => localStorage.getItem('boom:consent'))) === null);
        ok('nessun errore JS', errs.length === 0, errs);
        await ctx.close();
      }
      {
        // il ritorno da Stripe: un passaggio del nostro percorso, non una fonte
        const { ctx, pg } = await open(() => { localStorage.setItem('boom:consent', 'all:' + Date.now()); });
        await pg.goto(base + '/thank-you?session_id=x', { referer: 'https://checkout.stripe.com/', waitUntil: 'load' });
        await pg.waitForTimeout(300);
        const s = await stores(pg);
        ok('consenso, nessun primo contatto, ritorno da checkout.stripe.com: boom:source resta vuoto', s.first === null && s.last === null, s);
        ok('...e nessun cookie «referral · /thank-you»', (await attrCookie(ctx)) === null, await attrCookie(ctx));
        await ctx.close();
      }
      {
        // un «referral» da Stripe salvato dal tracker di prima vale come assente
        const { ctx, pg } = await open(() => {
          localStorage.setItem('boom:consent', 'all:' + Date.now());
          if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.setItem('boom:source', JSON.stringify({ channel: 'referral', referrerHost: 'checkout.stripe.com', landing: '/thank-you' })); }
        });
        await pg.goto(base + '/faq', { referer: 'https://chatgpt.com/', waitUntil: 'load' });
        await pg.waitForTimeout(300);
        ok('un vecchio primo contatto «referral» da Stripe non vince: vince ChatGPT', (await attrCookie(ctx)) === 'ai:chatgpt · /faq', await attrCookie(ctx));
        await ctx.close();
      }

      // /thank-you?reserved=1: il deposito di blocco non è un Property Finding
      {
        beacons.length = 0;
        const { ctx, pg } = await open(() => { localStorage.setItem('boom:consent', 'all:' + Date.now()); });
        await pg.goto(base + '/thank-you?reserved=1&amt=300&session_id=cs_test_123', { waitUntil: 'load' });
        await pg.waitForTimeout(3900);
        const b = beacons.find(x => x && x.pagePath === '/thank-you');
        ok('?reserved=1: il servizio è «reservation», non property_finding', b && b.service === 'reservation', b && b.service);
        ok('...ed è una conversione confermata (acquisto)', b && b.interactions.some(x => x.kind === 'conversion'), b && b.interactions);
        ok('...la query (session_id) non viaggia nel payload', b && !JSON.stringify(b).includes('cs_test_123'));
        await ctx.close();
      }
    } finally { await br.close(); srv.close(); }
  }
}

// ── 4. la porta legge la fonte ─────────────────────────────────────────────
section('4. attributionFromReq: corpo prima del cookie, corta, senza query');
const { attributionOf, attributionFromReq } = await import('../../api/_attribution.js');
{
  const ck = v => ({ headers: { cookie: 'a=1; boom_attr=' + encodeURIComponent(v) + '; z=2' } });
  ok('il corpo vince sul cookie', attributionFromReq(ck('google · /'), { attribution: 'ai:chatgpt · /faq' }) === 'ai:chatgpt · /faq');
  ok('senza corpo, il cookie', attributionFromReq(ck('ai:gemini · /property-finding'), {}) === 'ai:gemini · /property-finding');
  ok('corpo vuoto → cookie', attributionFromReq(ck('google · /'), { attribution: '' }) === 'google · /');
  ok('niente corpo, niente cookie → null', attributionFromReq({ headers: {} }, {}) === null);
  ok('tagliata a 120 caratteri', attributionFromReq({ headers: {} }, { attribution: 'x'.repeat(500) }).length === 120);
  ok('la query string non passa (?email=…)', attributionFromReq({ headers: {} }, { attribution: 'newsletter · /owners?email=a@b.it' }) === 'newsletter · /owners');
  ok('...né nel cookie', attributionFromReq(ck('google · /faq?x=1#y'), {}) === 'google · /faq');
  ok('i caratteri di controllo diventano UNO spazio', attributionOf('ai:chatgpt\u0000\n · /faq') === 'ai:chatgpt · /faq', attributionOf('ai:chatgpt\u0000\n · /faq'));
  ok('un oggetto {channel, landing} diventa la stringa', attributionOf({ channel: 'google', landing: '/faq' }) === 'google · /faq');
  ok('un oggetto senza landing → il solo canale', attributionOf({ channel: 'google' }) === 'google' && attributionOf({ channel: 'google', landing: null }) === 'google');
  ok('un array o un numero → null', attributionOf(['x']) === null && attributionOf(42) === null);
  ok('un cookie malformato non lancia: null', attributionFromReq({ headers: { cookie: 'boom_attr=%E0%A4%A' } }, {}) === null);
  ok('una richiesta senza headers non lancia', attributionFromReq(null, null) === null && attributionFromReq({}, undefined) === null);
  ok('la campagna proprietari di sempre passa intera', attributionOf('outreach/email/owners_2026') === 'outreach/email/owners_2026');
  ok('le forme del tracker passano intere (motore, utm, percorso)',
    attributionOf('ai:meta_ai · /apartments-in/trastevere') === 'ai:meta_ai · /apartments-in/trastevere'
    && attributionOf('organic_search · /blog-contract-types') === 'organic_search · /blog-contract-types'
    && attributionOf('newsletter.it · /listing/cezFMXTWnHUDgb1H2WWm') === 'newsletter.it · /listing/cezFMXTWnHUDgb1H2WWm');

  // Il campo è pubblico: ciò che il tracker non scrive mai non arriva in
  // `leads` (15/10/2026). Lista bianca DOPO il taglio; email e telefono → null.
  const HOSTILE = [
    ['HTML', { attribution: '<img src=x onerror=alert(1)>' }],
    ['HTML nel cookie', null, '<script>alert(1)</script> · /faq'],
    ['virgolette e attributi', { attribution: 'google" onmouseover="x' }],
    ['U+202E (bidi) e U+2028', { attribution: 'ai:x\u202e · /faq\u2028y\u2029' }],
    ['oggetto annidato', { attribution: { channel: { a: 1 }, landing: ['/a', '/b'] } }],
    ['canale numero', { attribution: { channel: 42, landing: '/faq' } }],
    ['landing oggetto', { attribution: { channel: 'google', landing: { toString: () => '<b>' } } }],
    ['__proto__ da JSON', JSON.parse('{"attribution":{"__proto__":{"channel":"x","landing":"/y"}}}')],
    ['__proto__ come stringa', { attribution: '__proto__' }],
    ['email', { attribution: 'mario.rossi@gmail.com' }],
  ];
  const SAFE = s => s === null || (typeof s === 'string' && s.length > 0 && s.length <= 120
    && /^[\p{L}\p{N} _.:·\/\-]*$/u.test(s) && !/\s{2}/.test(s) && s === s.trim());
  for (const [name, body, cookie] of HOSTILE) {
    const got = attributionFromReq(cookie ? { headers: { cookie: 'boom_attr=' + encodeURIComponent(cookie) } } : { headers: {} }, body);
    ok('ostile: ' + name + ' → stringa sicura o null', SAFE(got), got);
  }
  const img = attributionOf('<img src=x onerror=alert(1)>');
  ok('l\'HTML non sopravvive: niente < > = ( ) né virgolette', img !== null && !/[<>=()"']/.test(img), img);
  ok('i controlli bidi e i separatori di riga spariscono', !/[\u202a-\u202e\u2066-\u2069\u2028\u2029]/.test(attributionOf('ai:x\u202e · /faq\u2028y\u2029') || 'x'), attributionOf('ai:x\u202e · /faq\u2028y\u2029'));
  ok('oggetto annidato → null (mai «[object Object] · /a,/b»)', attributionOf({ channel: { a: 1 }, landing: ['/a', '/b'] }) === null);
  ok('canale non stringa o landing non stringa → null', attributionOf({ channel: 42 }) === null && attributionOf({ channel: 'google', landing: 7 }) === null);
  ok('__proto__ parsato da JSON (proprietà propria, non prototipo) → null', attributionOf(JSON.parse('{"__proto__":{"channel":"x"}}')) === null);
  ok('un canale ereditato dal prototipo non conta', attributionOf(Object.create({ channel: 'google', landing: '/faq' })) === null);
  ok('un indirizzo email non è una fonte → null', attributionOf('mario.rossi@gmail.com') === null && attributionFromReq({ headers: {} }, { attribution: 'newsletter · mario.rossi@gmail.com' }) === null);
  ok('...nemmeno nel cookie', attributionFromReq({ headers: { cookie: 'boom_attr=' + encodeURIComponent('google · a@b.it') } }, {}) === null);
  ok('un numero di telefono non è una fonte → null', attributionOf('+39 333 123 4567') === null && attributionOf('whatsapp 3331234567') === null);
  ok('...ma un anno o un id corto restano', attributionOf('owners_2026 · /canone') === 'owners_2026 · /canone' && attributionOf('google · /listing/L1') === 'google · /listing/L1');
  ok('un valore fatto solo di caratteri tolti → null, mai stringa vuota', attributionOf('<>()"\'') === null && attributionOf('\u202e\u2028') === null);
}

// ── 5. gli handler veri ────────────────────────────────────────────────────
section('5. Le porte scrivono la fonte sul lead e sulla visita');
{
  process.env.FIREBASE_API_KEY = 'k';
  process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
  process.env.FIREBASE_ADMIN_PASS = 'p';
  process.env.GMAIL_USER = 'valentino@boom-rome.com';
  process.env.GMAIL_APP_PASS = 'x';
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BUSY_ICS_URLS;

  const DB = new Map();
  let autoN = 0;
  const plain = v => {
    const t = v && Object.keys(v)[0];
    if (t === 'mapValue') return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
    if (t === 'arrayValue') return (v.arrayValue.values || []).map(plain);
    if (t === 'nullValue') return null;
    if (t === 'integerValue') return Number(v.integerValue);
    return t ? v[t] : undefined;
  };
  const created = coll => [...DB.entries()].filter(([k]) => k.startsWith(coll + '/')).map(([k, d]) => ({ id: k.split('/')[1], ...Object.fromEntries(Object.entries(d).map(([f, v]) => [f, plain(v)])) }));
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
    if (u.includes('identitytoolkit') || u.includes('securetoken')) return json({ idToken: 'fake', localId: 'admin', expiresIn: '3600' });
    if (!u.includes('firestore.googleapis.com')) return json({ ok: true });
    if (u.includes(':runQuery')) return json([]);
    if (u.includes(':commit') || u.includes(':batchGet')) return json({ writeResults: [] });
    const m = u.match(/documents\/([^?]+)/), p = m ? decodeURIComponent(m[1]) : '';
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : {};
    if (method === 'GET') return DB.has(p) ? json({ name: 'x/' + p, fields: DB.get(p) }) : json({ error: { code: 404 } }, 404);
    if (method === 'POST') {
      const q = u.match(/documentId=([^&]+)/), id = q ? decodeURIComponent(q[1]) : 'auto' + (++autoN);
      DB.set(p + '/' + id, { ...(body.fields || {}) });
      return json({ name: `projects/p/databases/(default)/documents/${p}/${id}`, fields: body.fields });
    }
    if (method === 'PATCH') { DB.set(p, { ...(DB.get(p) || {}), ...(body.fields || {}) }); return json({ name: 'x/' + p, fields: DB.get(p) }); }
    return json({});
  };
  const mockRes = () => {
    const r = { statusCode: 200, body: null, headers: {} };
    r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = c => { r.statusCode = c; return r; };
    r.json = o => { r.body = o; return r; }; r.end = () => r; return r;
  };
  let ipN = 0;
  const call = async (handler, body, cookie, method = 'POST', query = {}) => {
    const res = mockRes();
    await handler({ method, body, query, headers: { 'x-forwarded-for': '10.7.0.' + (++ipN), 'user-agent': 'test', ...(cookie ? { cookie } : {}) } }, res);
    return res;
  };
  const COOKIE = 'other=1; boom_attr=' + encodeURIComponent('ai:chatgpt · /faq');

  const apply = (await import('../../api/apply-lead.js')).default;
  const r1 = await call(apply, { name: 'Berk Namyeter', email: 'berk@example.com', phone: '+90 532 000 1122', listingId: 'L1', listingName: 'Bilocale Trastevere', listingPrice: 1200, kind: 'apply', company: '' }, COOKIE);
  const l1 = created('leads').find(x => x.id === r1.body?.id);
  ok('apply-lead: 200 e attribution dal cookie', r1.statusCode === 200 && l1 && l1.attribution === 'ai:chatgpt · /faq', { code: r1.statusCode, a: l1 && l1.attribution });
  // Decisione del fondatore: nessuna promessa di risposta in un numero di
  // ore/minuti. La pagina dice «during office hours (Rome time)»: le due email
  // che partono pochi secondi dopo non possono contraddirla.
  {
    const sent = globalThis.__mails || [];
    const ack = sent.find(m => m.to === 'berk@example.com');
    const opm = sent.find(m => m.replyTo === 'berk@example.com');
    const NUMERIC = /\b(?:within|in|entro|in meno di)\s+(?:\d+|one|two|three|un[ao]?|due|tre)\s*(?:h\b|hours?|hrs?|minutes?|mins?|or[ae]\b|minut[io])/i;
    ok('apply-lead: la conferma al candidato non promette un numero di ore', !!ack && !NUMERIC.test(ack.html) && /during office hours \(Rome time\)/.test(ack.html), ack && (ack.html.match(/replies[^.]*\./) || [])[0]);
    ok('apply-lead: l\'avviso all\'operatore non dice «entro N ore»', !!opm && !NUMERIC.test(opm.html) && /orario d.ufficio/.test(opm.html), opm && (opm.html.match(/promette[^.]*\./) || [])[0]);
    ok('apply-lead: il sorgente non riscrive «within 2 hours» / «entro 2 ore»', !/within \d+ hours?|entro \d+ ore/i.test(read('api/apply-lead.js')));
  }
  const r1b = await call(apply, { name: 'Senza Consenso', email: 'nc@example.com', listingId: 'L1', kind: 'apply' });
  const l1b = created('leads').find(x => x.id === r1b.body?.id);
  ok('apply-lead senza consenso (né corpo né cookie): attribution null, il lead nasce comunque', r1b.statusCode === 200 && l1b && l1b.attribution === null, l1b && l1b.attribution);
  const r1c = await call(apply, { name: 'Cookie Rotto', email: 'cr@example.com', listingId: 'L1', kind: 'apply' }, 'boom_attr=%E0%A4%A');
  ok('apply-lead con un cookie illeggibile: il lead nasce lo stesso', r1c.statusCode === 200 && created('leads').some(x => x.id === r1c.body?.id));

  const owner = (await import('../../api/owner-lead.js')).default;
  const r2 = await call(owner, { name: 'Giulia Rossi', contact: '+39 333 123 4567', zone: 'Prati', attribution: '', lang: 'it', company: '' }, COOKIE);
  const l2 = created('leads').find(x => x.id === r2.body?.id) || created('leads').find(x => x.name === 'Giulia Rossi');
  ok('owner-lead: campo vuoto → la fonte dal cookie', r2.statusCode === 200 && l2 && l2.attribution === 'ai:chatgpt · /faq', l2 && l2.attribution);
  const r2b = await call(owner, { name: 'Marco Neri', contact: 'marco@example.it', attribution: 'outreach/email/owners_2026', lang: 'it' }, COOKIE);
  const l2b = created('leads').find(x => x.name === 'Marco Neri');
  ok('owner-lead: il campo del modulo vince sul cookie, ed è una stringa', r2b.statusCode === 200 && l2b && l2b.attribution === 'outreach/email/owners_2026' && typeof l2b.attribution === 'string');

  const exec = (await import('../../api/executive-lead.js')).default;
  const r3 = await call(exec, { name: 'Anna Schmidt', email: 'anna@fao.example', sector: 'un', lang: 'en' }, COOKIE);
  ok('executive-lead: attribution dal cookie', r3.statusCode === 200 && created('leads').some(x => x.name === 'Anna Schmidt' && x.attribution === 'ai:chatgpt · /faq'), r3.body);

  const reunion = (await import('../../api/reunion-lead.js')).default;
  const r4 = await call(reunion, { name: 'Paul Hoarau', email: 'paul@example.re', role: 'tenant', commune: 'Saint-Pierre', lang: 'fr' }, COOKIE);
  ok('reunion-lead: attribution dal cookie', r4.statusCode === 200 && created('leads').some(x => x.name === 'Paul Hoarau' && x.attribution === 'ai:chatgpt · /faq'), r4.body);

  const web = (await import('../../api/leads/web.js')).default;
  const r5 = await call(web, { form: 'contact', name: 'Lea Martin', email: 'lea@example.com', message: 'Hello' }, COOKIE);
  ok('leads/web: attribution dal cookie', r5.statusCode === 200 && created('leads').some(x => x.name === 'Lea Martin' && x.attribution === 'ai:chatgpt · /faq'), r5.body);

  const slots = (await import('../../api/viewings/slots.js')).default;
  const g = await call(slots, null, null, 'GET', { mode: 'video' });
  const first = g.body && g.body.slots && g.body.slots[0] && g.body.slots[0].times[0];
  if (!first) ok('viewings/slots: la griglia ha almeno uno slot per la prova', false, g.body);
  else {
    const r6 = await call(slots, { name: 'Tom Price', email: 'tom@example.com', mode: 'video', when: first.iso, company: '' }, COOKIE);
    const v = created('viewingRequests').find(x => x.clientName === 'Tom Price');
    ok('viewings/slots: la visita scritta in POST porta la fonte', r6.statusCode === 200 && v && v.attribution === 'ai:chatgpt · /faq', { code: r6.statusCode, body: r6.body, a: v && v.attribution });
  }

  // I moduli partner (corporate, research, universities) caricano il tracker:
  // il cookie c'è, e la porta lo buttava via (15/10/2026).
  const partners = (await import('../../api/partners/submit.js')).default;
  const r7 = await call(partners, { kind: 'corporate', name: 'Sara Bianchi', email: 'sara@acme.example', org: 'Acme Italia', company: '' }, COOKIE);
  const l7 = created('leads').find(x => x.id === r7.body?.id);
  ok('partners/submit: attribution dal cookie', r7.statusCode === 200 && l7 && l7.attribution === 'ai:chatgpt · /faq', { code: r7.statusCode, a: l7 && l7.attribution });
  const r7b = await call(partners, { kind: 'university', name: 'Ufficio Housing', email: 'housing@uni.example', org: 'Uni Roma', attribution: 'outreach/email/universities' }, COOKIE);
  const l7b = created('leads').find(x => x.id === r7b.body?.id);
  ok('partners/submit: il campo del modulo vince sul cookie', r7b.statusCode === 200 && l7b && l7b.attribution === 'outreach/email/universities', l7b && l7b.attribution);
  const r7c = await call(partners, { kind: 'research', name: 'Senza Consenso', email: 'nc@lab.example' });
  const l7c = created('leads').find(x => x.id === r7c.body?.id);
  ok('partners/submit senza consenso: attribution null, il lead nasce', r7c.statusCode === 200 && l7c && l7c.attribution === null, l7c && l7c.attribution);
  const before = DB.size;
  const r7d = await call(partners, { kind: 'corporate', name: 'Bot', email: 'bot@x.example', company: 'Bot Inc' }, COOKIE);
  ok('partners/submit: l\'honeypot non scrive nulla (la fonte si legge DOPO)', r7d.statusCode === 200 && r7d.body.id === null && DB.size === before);
  {
    const src = read('api/partners/submit.js');
    const iAttr = src.indexOf('attributionFromReq(req, body)');
    ok('partners/submit: la fonte si legge dopo honeypot e rate limit',
      iAttr > src.indexOf('if (body.company)') && iAttr > src.indexOf('rateLimited(ip)'));
  }

  // le porte che non si guidano qui: la giunzione sulla sorgente
  for (const f of ['api/apply-lead.js', 'api/executive-lead.js', 'api/reunion-lead.js', 'api/canone-lead.js', 'api/owner-lead.js', 'api/leads/web.js', 'api/viewings/slots.js', 'api/partners/submit.js']) {
    const src = read(f);
    ok(f + ': importa attributionFromReq e lo scrive', /import \{ attributionFromReq \} from '\.\.?\/(?:\.\.\/)?_attribution\.js';/.test(src) && /attributionFromReq\(req, (?:body|\{ attribution: body\.attribution \})\)/.test(src));
  }
  ok('owner-lead non tiene più la vecchia lettura del solo corpo', !/attribution: clip\(body\.attribution/.test(read('api/owner-lead.js')));
}

// ── 6. WhatsApp ────────────────────────────────────────────────────────────
section('6. Il lead WhatsApp porta il «(ref: …)» del sito');
{
  const { buildLead, waRef, waRefPatch } = await import('../../api/homie/_lead.js');
  const msg = 'Hi BOOM! I am interested — Bilocale Trastevere\n\n(ref: ai:chatgpt)';
  const l = buildLead({ text: msg, phone: '+393331112233', name: 'Kim' });
  ok('«(ref: ai:chatgpt)» → attribution «whatsapp · ai:chatgpt»', l.attribution === 'whatsapp · ai:chatgpt', l.attribution);
  ok('il messaggio resta intero, ref compreso', l.message === msg);
  ok('senza ref: attribution null', buildLead({ text: 'ciao cercavo casa', phone: '+393331112233' }).attribution === null);
  ok('il formato vecchio « (ref: google)» si legge ancora', waRef('Ciao BOOM! Sono interessato/a — FAQ (ref: google)') === 'whatsapp · google');
  ok('un lead che ha già una fonte non si riscrive', JSON.stringify(waRefPatch({ attribution: 'google · /' }, msg)) === '{}');
  ok('un lead senza fonte la riceve', waRefPatch({}, msg).attribution === 'whatsapp · ai:chatgpt');
  ok('un ref che va a capo o non si chiude non è un ref', waRef('(ref: ai:chatgpt\n)') === null && waRef('(ref: )') === null);

  // Solo ciò che il tracker emette (15/10/2026): «ai:<motore>» oppure un
  // canale/utm_source di al più 40 caratteri [A-Za-z0-9_.-]. Prima passava
  // qualunque testo fino a 120 caratteri dentro «(ref: …)».
  ok('ogni motore del tracker si legge', ['chatgpt', 'perplexity', 'gemini', 'copilot', 'claude', 'you', 'deepseek', 'meta_ai', 'mistral', 'grok']
    .every(e => waRef('Hi BOOM (ref: ai:' + e + ')') === 'whatsapp · ai:' + e));
  ok('i canali del tracker si leggono (google, organic_search, social, referral, utm con punto e trattino)',
    ['google', 'organic_search', 'social', 'referral', 'newsletter.it', 'owners-2026'].every(c => waRef('x (ref: ' + c + ')') === 'whatsapp · ' + c));
  ok('HTML dentro il ref → null', waRef('(ref: <img src=x onerror=alert`1`>)') === null && waRef('(ref: <b>x</b>)') === null);
  ok('testo libero con spazi → null', waRef('(ref: mario rossi via email)') === null);
  ok('un\'email → null', waRef('(ref: mario.rossi@gmail.com)') === null);
  ok('«ai:» con maiuscole o cifre o troppo lungo → null', waRef('(ref: ai:ChatGPT)') === null && waRef('(ref: ai:gpt4)') === null && waRef('(ref: ai:' + 'a'.repeat(21) + ')') === null);
  ok('un canale oltre 40 caratteri → null', waRef('(ref: ' + 'a'.repeat(41) + ')') === null && waRef('(ref: ' + 'a'.repeat(40) + ')') === 'whatsapp · ' + 'a'.repeat(40));
  ok('bidi / separatori di riga dentro il ref → null', waRef('(ref: goo\u202egle)') === null && waRef('(ref: goo\u2028gle)') === null);
  ok('un ref ostile non diventa la fonte del lead nuovo', buildLead({ text: 'ciao (ref: <script>x</script>)', phone: '+393331112233' }).attribution === null);
  ok('...né quella di un lead esistente', JSON.stringify(waRefPatch({}, 'ciao (ref: a b c)')) === '{}');
}

// ── 6b. il handler VERO di homie/message ───────────────────────────────────
// buildLead copre solo il lead NUOVO. Le due strade dove la fonte si perdeva
// erano il lead GIÀ legato alla chat (ramo «arricchisci») e la persona già in
// pipeline da un'altra porta nei 7 giorni (ramo «prior»): chi compila il
// modulo del sito e poi scrive su WhatsApp da una pagina aperta da un
// assistente restava senza fonte. Qui si guida il handler con il Firestore in
// memoria di tests/whatsapp (commit con precondizioni, runQuery, PATCH).
section('6b. homie/message: la fonte del «(ref: …)» arriva anche sui lead che esistono già');
{
  const DB = new Map(), versions = new Map();
  let version = 0, autoId = 0;
  const enc = v => {
    if (v === null || v === undefined) return { nullValue: null };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
    return { stringValue: String(v) };
  };
  const dec = f => {
    if (!f) return null;
    if ('nullValue' in f) return null;
    if ('stringValue' in f) return f.stringValue;
    if ('integerValue' in f) return Number(f.integerValue);
    if ('doubleValue' in f) return f.doubleValue;
    if ('booleanValue' in f) return f.booleanValue;
    if ('timestampValue' in f) return f.timestampValue;
    if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
    if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
    return null;
  };
  const T0 = '2026-01-01T00:00:00.000Z';
  const toDoc = (p, data) => ({ updateTime: versions.get(p) || T0, name: `projects/p/databases/(default)/documents/${p}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });
  const bump = k => versions.set(k, new Date(Date.parse(T0) + ++version).toISOString());
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
    if (u.includes('identitytoolkit') || u.includes('securetoken')) return json({ idToken: 'fake', localId: 'admin', expiresIn: '3600' });
    if (!u.includes('firestore.googleapis.com')) return json({ ok: true });
    const body = opts.body ? JSON.parse(opts.body) : null;
    const m = u.match(/documents\/([^?:]+)/), p = m ? decodeURIComponent(m[1]) : '';
    if (u.endsWith(':commit')) {
      const writes = body.writes || [];
      for (const w of writes) {
        const key = (w.update?.name || w.delete)?.split('/documents/')[1], c = w.currentDocument || {};
        if ((c.exists === false && DB.has(key)) || (c.exists === true && !DB.has(key)) || (c.updateTime && c.updateTime !== (versions.get(key) || T0)))
          return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
      }
      return json({ writeResults: writes.map(w => {
        if (w.delete) return {};
        const key = w.update.name.split('/documents/')[1];
        const values = Object.fromEntries(Object.entries(w.update.fields || {}).map(([k, v]) => [k, dec(v)]));
        DB.set(key, w.updateMask ? { ...(DB.get(key) || {}), ...values } : values); bump(key);
        return { updateTime: versions.get(key) };
      }) });
    }
    if (u.includes(':runQuery')) {
      const q = body.structuredQuery, coll = q.from[0].collectionId, f = q.where && q.where.fieldFilter;
      const rows = [...DB.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2)
        .filter(([, v]) => !f || String(v[f.field.fieldPath]) === String(dec(f.value)));
      return json(rows.map(([k, v]) => ({ document: toDoc(k, v) })));
    }
    if (opts.method === 'PATCH') {
      const next = { ...(DB.get(p) || {}), ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
      DB.set(p, next); bump(p); return json(toDoc(p, next));
    }
    if (opts.method === 'POST') {
      const id = new URL(u).searchParams.get('documentId') || 'doc' + (++autoId);
      if (DB.has(`${p}/${id}`)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
      DB.set(`${p}/${id}`, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
      return json(toDoc(`${p}/${id}`, DB.get(`${p}/${id}`)));
    }
    return DB.has(p) ? json(toDoc(p, DB.get(p))) : json({ error: { status: 'NOT_FOUND' } }, 404);
  };
  process.env.HOMIE_SECRET = 'test-secret';
  const { default: message } = await import('../../api/homie/message.js');
  const wa = async payload => {
    const req = { method: 'POST', headers: { 'x-homie-secret': 'test-secret', 'content-type': 'application/json' }, body: payload,
      on(ev, cb) { if (ev === 'data') cb(Buffer.from(JSON.stringify(payload))); if (ev === 'end') cb(); return this; } };
    let out = null, code = 0;
    const res = { setHeader() {}, status(c) { code = c; return this; }, json(o) { out = o; return this; }, end() { return this; } };
    await message(req, res);
    return { code, ...(out || {}) };
  };
  const lead = id => DB.get('leads/' + id) || {};
  const WIRING = '(serve il collegamento in api/homie/message.js: waRefPatch nei rami «arricchisci» e «prior»)';
  const REF = '\n\n(ref: ai:chatgpt)';

  // 1) lead nuovo da WhatsApp SENZA ref, poi un secondo messaggio CON ref
  const r1 = await wa({ direction: 'in', channel: 'whatsapp', phone: '+393331230001', name: 'Noor',
    body: 'Hello, I am looking for a one-bedroom flat for October', messageId: 'att-w1' });
  ok('primo messaggio senza ref: il lead nasce, senza fonte', r1.code === 200 && !!r1.leadId && lead(r1.leadId).attribution === null, { r1, a: r1.leadId && lead(r1.leadId).attribution });
  const r2 = await wa({ direction: 'in', channel: 'whatsapp', phone: '+393331230001',
    body: 'Hi BOOM, about the Prati flat' + REF, messageId: 'att-w2' });
  ok('lead già legato alla chat + «(ref: ai:chatgpt)»: la fonte si scrive ' + WIRING,
    r2.code === 200 && r2.leadId === r1.leadId && lead(r1.leadId).attribution === 'whatsapp · ai:chatgpt', { r2, a: lead(r1.leadId).attribution });
  ok('...e il messaggio resta intero, ref compreso', String(lead(r1.leadId).message || '').includes('(ref: ai:chatgpt)'));
  await wa({ direction: 'in', channel: 'whatsapp', phone: '+393331230001', body: 'Also ok for November\n\n(ref: google)', messageId: 'att-w3' });
  ok('...un secondo ref non riscrive la fonte già scritta ' + WIRING, lead(r1.leadId).attribution === 'whatsapp · ai:chatgpt', lead(r1.leadId).attribution);

  // 2) la persona è già in pipeline da un'altra porta (modulo del sito) senza fonte
  DB.set('leads/webNoAttr', { id: 'webNoAttr', source: 'web', phone: '+393331230002', email: 'kim@example.com',
    message: 'Contact form', status: 'new', attribution: null, createdAt: new Date().toISOString() });
  const r4 = await wa({ direction: 'in', channel: 'whatsapp', phone: '+393331230002',
    body: 'Hi, I wrote on the website too — is the flat still free?' + REF, messageId: 'att-w4' });
  ok('lead dal sito senza fonte + WhatsApp con ref: stesso lead, la fonte arriva ' + WIRING,
    r4.code === 200 && r4.leadId === 'webNoAttr' && lead('webNoAttr').attribution === 'whatsapp · ai:chatgpt', { r4, a: lead('webNoAttr').attribution });

  // 2b) il ramo «prior»: la chat arriva come contatto WhatsApp (contactType
  // dichiarato dal Mac, nessuna risoluzione per numero) e la persona è già in
  // pipeline da un'altra porta — la trova recentLeadByPhone
  DB.set('leads/webNational', { id: 'webNational', source: 'web', phone: '3331230004', message: 'Viewing request',
    status: 'new', createdAt: new Date().toISOString() });
  const r4b = await wa({ direction: 'in', channel: 'whatsapp', phone: '+393331230004', contactType: 'whatsapp', contactId: '393331230004',
    body: 'Buongiorno, ho chiesto una visita dal sito per Ostiense' + REF, messageId: 'att-w4b' });
  ok('ramo «prior» (stessa persona già in pipeline da un\'altra porta): la fonte arriva ' + WIRING,
    r4b.code === 200 && r4b.leadId === 'webNational' && r4b.leadDeduped === true && lead('webNational').attribution === 'whatsapp · ai:chatgpt', { r4b, a: lead('webNational').attribution });

  // 3) già in pipeline CON una fonte: non si tocca
  DB.set('leads/webGoogle', { id: 'webGoogle', source: 'web', phone: '+393331230003', message: 'Apply form', status: 'new',
    attribution: 'google · /apartments', createdAt: new Date().toISOString() });
  const r5 = await wa({ direction: 'in', channel: 'whatsapp', phone: '+393331230003',
    body: 'Hello, following up on my application' + REF, messageId: 'att-w5' });
  ok('lead con una fonte già scritta: il ref di WhatsApp non la sovrascrive', r5.code === 200 && r5.leadId === 'webGoogle' && lead('webGoogle').attribution === 'google · /apartments', { r5, a: lead('webGoogle').attribution });

  const src = read('api/homie/message.js');
  ok('giunzione: api/homie/message.js importa waRefPatch e lo usa nei due rami ' + WIRING,
    /\bwaRefPatch\b[\s\S]*?\} from '\.\/_lead\.js'/.test(src) && (src.match(/waRefPatch\((?:lead|prior), text\)/g) || []).length === 2);
}

// ── 7. /behavior ───────────────────────────────────────────────────────────
section('7. summarize: canali, AI prima, tentativi contro conversioni confermate');
{
  const row = (o) => Object.assign({
    schema: 1, consent: true, pageViewId: 'p' + Math.random().toString(36).slice(2, 14), sessionId: 's1',
    pagePath: '/faq', service: 'editorial', activeSeconds: 4, scrollMax: 20, exitType: 'navigate_internal',
    startedAt: '2026-10-14T10:00:00.000Z', sections: [], interactions: [], source: { channel: 'direct', landing: '/faq' }
  }, o);
  const d = B.summarize([
    // legacy: utm chatgpt.com come canale a sé, con un modulo inviato e poi la conferma
    row({ sessionId: 'legacyA', source: { channel: 'chatgpt.com', landing: '/blog-contract-types' }, activeSeconds: 30,
      interactions: [{ kind: 'lead', label: 'Send' }] }),
    row({ sessionId: 'legacyA', pagePath: '/thank-you', startedAt: '2026-10-14T10:03:00.000Z', source: { channel: 'chatgpt.com', landing: '/blog-contract-types' },
      interactions: [{ kind: 'conversion', label: 'Owner lead sent' }] }),
    // legacy: ai_assistant col referrer chatgpt.com, solo un tentativo
    row({ sessionId: 'legacyB', source: { channel: 'ai_assistant', referrerHost: 'chatgpt.com', landing: '/faq' }, interactions: [{ kind: 'checkout', label: 'Start' }] }),
    // nuovo formato: engine salvato
    row({ sessionId: 'newC', source: { channel: 'ai_assistant', engine: 'chatgpt', landing: '/faq' } }),
    // legacy: Gemini contato come google
    row({ sessionId: 'gemD', source: { channel: 'google', referrerHost: 'gemini.google.com', landing: '/property-finding' }, activeSeconds: 12 }),
    // google vero, tre sessioni
    row({ sessionId: 'g1', source: { channel: 'google', referrerHost: 'www.google.com', landing: '/' } }),
    row({ sessionId: 'g2', source: { channel: 'google', referrerHost: 'www.google.com', landing: '/' } }),
    row({ sessionId: 'g3', source: { channel: 'google', referrerHost: 'www.google.com', landing: '/apartments' }, interactions: [{ kind: 'conversion', label: 'Purchase completed' }] }),
  ]);
  const ch = d.channels || [];
  const byId = Object.fromEntries(ch.map(x => [x.id, x]));
  const gpt = byId['ai:chatgpt'];
  ok('le righe «chatgpt.com» e il referrer chatgpt.com diventano ai:chatgpt', gpt && gpt.sessions === 3 && gpt.engine === 'chatgpt', gpt);
  ok('...con 2 sessioni di tentativo (lead, checkout) e 1 conversione confermata', gpt && gpt.attemptSessions === 2 && gpt.conversionSessions === 1, gpt);
  ok('...una sessione coinvolta (≥10 s attivi)', gpt && gpt.engagedSessions === 1, gpt);
  ok('...le landing principali, la più frequente per prima', gpt && gpt.topLandings.length === 2 && gpt.topLandings[0].path === '/faq' && gpt.topLandings[0].sessions === 2, gpt && gpt.topLandings);
  ok('il referrer gemini.google.com di una riga vecchia → ai:gemini, NON google', byId['ai:gemini'] && byId['ai:gemini'].sessions === 1 && byId.google.sessions === 3, Object.keys(byId));
  ok('le righe AI vengono prima, anche con meno sessioni', ch[0].id === 'ai:chatgpt' && ch[1].id === 'ai:gemini' && ch[2].id === 'google', ch.map(x => x.id));
  ok('google: la conversione (acquisto) contata, nessun tentativo', byId.google.conversionSessions === 1 && byId.google.attemptSessions === 0);
  ok('topLandings al massimo 3', ch.every(x => x.topLandings.length <= 3));
  ok('i campi di sempre restano', ['totals', 'pages', 'sections', 'interactions', 'flows', 'recommendations', 'generatedAt'].every(k => k in d) && d.totals.sessions === 7 && d.totals.pageViews === 8, Object.keys(d));
  const norm = B.normalizeJourney(row({ pageViewId: 'aaaaaaaaaaaaaaaa', sessionId: 'ssssssssssssssss', source: { channel: 'ai_assistant', engine: 'gemini', landing: '/faq' } }), new Date());
  ok('la raccolta conserva il motore', norm.source.engine === 'gemini');
  const bad = B.normalizeJourney(row({ pageViewId: 'aaaaaaaaaaaaaaaa', sessionId: 'ssssssssssssssss', source: { channel: 'x', engine: '<script>' } }), new Date());
  ok('...ma solo un motore che conosce', bad.source.engine === '');
  const html = read('behavior.html');
  ok('/behavior mostra la tabella «Canali (incluse le AI)» con le sei colonne', html.includes('Canali (incluse le AI)')
    && ['Canale', 'Sessioni', 'Coinvolte', 'Tentativi', 'Conversioni confermate', 'Landing principali'].every(c => html.includes('<th>' + c + '</th>')));
  ok('...e la nota che separa tentativi e conversioni', html.includes('Tentativi = invii di modulo; conversioni = esiti confermati dal server o acquisti'));
  ok('...e la riempie da data.channels', /d\.channels\|\|\[\]/.test(html) && /getElementById\('channels'\)/.test(html));
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}${pass} ok, ${fail} ko\x1b[0m`);
process.exit(fail ? 1 : 0);
