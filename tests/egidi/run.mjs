// tests/egidi/run.mjs — il sito di Egidi Immobiliare (egidimmobiliare.it)
// dentro il repo di BOOM, servito da un progetto Vercel suo (root `egidi/`).
//
// Ogni regola qui sotto è un difetto VERO trovato nelle bozze di giugno 2026
// prima della pubblicazione, non una buona pratica generica:
//   · «© MMXXX» e «Roma · MMXXX» — l'anno 2030 di un esercizio di stile,
//     stampato nel piè di pagina legale di una S.r.l.;
//   · la barra fissa per scegliere fra le ipotesi di design (A/B/Dossier/
//     Cinema/Attuale), coi link a pagine che sul dominio nuovo non esistono;
//   · «affittare in 48 ore» promesso ai proprietari, mentre la FAQ di BOOM
//     dichiara 8 giorni di media per affittare: le 48 ore valgono dalla
//     firma alle chiavi, non per trovare l'inquilino;
//   · il «ritratto di Valentino Egidi» nelle sottopagine era una foto stock
//     di uno sconosciuto (alt="Valentino Egidi" su images.unsplash.com);
//   · REA e sede legale assenti (art. 2250 c.c. li vuole sul sito);
//   · senza JavaScript la pagina restava quasi tutta a opacità zero, e i
//     contatori stampavano «0 h», «0 %».
// Dal passo 3 della rifondazione (brief «Il Fascicolo», docs/EGIDI_PRD.md)
// valgono anche i criteri di accettazione del PRD: test dei 5 secondi per
// ogni titolo candidato, segnaposto solo in anteprima, un solo movimento,
// contrasto AA, zero richieste esterne, fascicolo composto con riduzione del
// movimento.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = path.join(ROOT, 'egidi');
const CANON = 'https://www.egidimmobiliare.it/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const read = (f) => readFileSync(path.join(SITE, f), 'utf8');

console.log('── egidi: il sito della casa madre');
const PAGES = ['index.html', '404.html'];
for (const f of PAGES) ok(existsSync(path.join(SITE, f)), `egidi/${f} esiste`);
const html = read('index.html');

// 1. Pubblicabile: indicizzabile, canonica sul dominio vero, lingua dichiarata.
ok(/<html lang="it">/.test(html), 'lang="it"');
ok(!/noindex/i.test(html), 'la home non è più noindex (era un\'anteprima)');
ok(html.includes(`<link rel="canonical" href="${CANON}">`), 'canonical sul dominio www');
ok(html.includes(`<meta property="og:url" content="${CANON}">`), 'og:url sul dominio www');
const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
ok(title.length > 0 && title.length <= 62, `titolo ≤ 62 caratteri (${title.length})`);
ok(desc.length >= 110 && desc.length <= 165, `description 110–165 caratteri (${desc.length})`);

// 2. Niente residui del laboratorio di design.
for (const f of PAGES) {
    const s = read(f);
    ok(!/MMXXX/.test(s), `${f}: nessun «MMXXX» (l'anno 2030 delle bozze)`);
    ok(!/class="pv"/.test(s) && !/\.pv\{/.test(s), `${f}: nessuna barra di scelta design`);
}

// 3. Ogni link interno arriva da qualche parte: file del sito o ancora della pagina.
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (href.startsWith('#')) { ok(ids.has(href.slice(1)), `ancora ${href} esiste nella pagina`); continue; }
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const p = href.split(/[?#]/)[0];
    const hit = p === '/' || existsSync(path.join(SITE, p)) || existsSync(path.join(SITE, p + '.html'));
    ok(hit, `link interno ${href} risolve dentro egidi/ (niente pagine non pubblicate)`);
}

// 4. I dati legali di una S.r.l. (art. 2250 c.c.), uguali a quelli che BOOM già pubblica.
const LEGAL = ['Egidi Immobiliare S.r.l.', 'P.IVA 17322991005', 'REA RM-1710623', 'Viale Liegi 42, 00198 Roma', 'Via dei Coronari 181/184, 00186 Roma'];
for (const t of LEGAL) ok(html.includes(t), `piè di pagina: «${t}»`);
const boomPrivacy = readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
for (const t of ['17322991005', 'Viale Liegi 42', 'Via dei Coronari 181/184']) {
    ok(boomPrivacy.includes(t), `anti-deriva: «${t}» è anche nella privacy di BOOM (se cambia là, va cambiato qui)`);
}
ok(/href="https:\/\/www\.boomrome\.com\/privacy"/.test(html), 'link all\'informativa privacy');

// 5. Promesse che la società può mantenere.
for (const f of PAGES) {
    const s = read(f).replace(/<[^>]+>/g, ' ');
    ok(!/affitt\w*\s+in\s+48\s*(ore|h)\b/i.test(s), `${f}: nessun «affittare in 48 ore» ai proprietari (la media dichiarata da BOOM è 8 giorni)`);
}

// 6. Nessuna persona in foto presa da un archivio esterno: le immagini
//    esterne sono solo decorative (alt vuoto). Un ritratto vero va ospitato qui.
for (const f of PAGES) {
    for (const [tag] of read(f).matchAll(/<img\b[^>]*>/g)) {
        const src = (tag.match(/src="([^"]*)"/) || [])[1] || '';
        const alt = (tag.match(/alt="([^"]*)"/) || [])[1];
        if (/^https?:\/\//.test(src)) ok(alt === '', `${f}: immagine esterna solo decorativa (alt vuoto): ${src.slice(0, 60)}`);
    }
}

// 7. Un solo movimento (il fascicolo) e niente che dipenda da JS per esistere.
ok(html.includes("document.documentElement.classList.add('js')") || html.includes("d.classList.add('js')"), 'la classe js si accende prima del render');
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const animati = [...css.matchAll(/([^{}]+)\{[^{}]*\banimation\s*:/g)].map((m) => m[1].trim().split(/\s*,\s*/)).flat();
ok(animati.length > 0 && animati.every((sel) => /\.foglio|\.sigillo/.test(sel)), `si muovono solo fogli e sigillo (${animati.join(' | ')})`);
ok(!/\btransition\s*:/.test(css), 'nessuna transizione: il brief vuole un movimento solo');
ok(/prefers-reduced-motion:\s*no-preference/.test(css) && /@supports \(animation-timeline/.test(css), 'animazione solo con movimento consentito e timeline supportata (altrimenti fascicolo composto)');
ok(!/cursor\s*:\s*none|parallax|lenis/i.test(html), 'niente cursore custom, parallax o scroll hijacking');
// Oro mai come testo su carta; contrasto AA sulle coppie di testo usate.
ok(!/(^|[;{\s])color\s*:\s*var\(--oro\)/.test(css), 'nessun testo oro');
const hex = (h) => h.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const lum = (h) => { const [r, g, b] = hex(h.replace('#', '')); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const tok = Object.fromEntries([...css.matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
for (const [fg, bg] of [['ink', 'carta'], ['grafite', 'carta'], ['grafite-2', 'carta'], ['grafite-2', 'carta-2'], ['ink', 'oro'], ['carta', 'ink'], ['grafite', 'carta-2']]) {
    const r = tok[fg] && tok[bg] ? cr(tok[fg], tok[bg]) : 0;
    ok(r >= 4.5, `contrasto ${fg} su ${bg}: ${r.toFixed(2)} ≥ 4.5`);
}
ok(cr(tok.grafite_2 || tok['grafite-2'], '#FBF8F1') >= 4.5, 'contrasto grafite-2 sul foglio #FBF8F1');
// Tono e contenuti del brief.
const testo = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
ok(!/!/.test(testo.replace(/<!--[\s\S]*?-->/g, '')), 'nessun punto esclamativo');
ok(!/\p{Extended_Pictographic}/u.test(testo), 'nessuna emoji');
ok(!/consulenza fiscale/i.test(testo), 'nessuna «consulenza fiscale»');
ok(!/entratel/i.test(html), 'Entratel non citato finché non è attivo');
ok(testo.includes("BOOM è il marchio di Egidi Immobiliare S.r.l. per gli affitti a studenti e professionisti internazionali."), 'la frase fissa su BOOM');
const boomLinks = [...html.matchAll(/href="(https:\/\/www\.boomrome\.com\/[^"]*)"/g)].map((m) => m[1]).filter((u) => !/\/privacy$/.test(u));
ok(boomLinks.length > 0 && boomLinks.every((u) => /utm_source=egidimmobiliare&amp;utm_medium=referral&amp;utm_campaign=\w+/.test(u)), 'ogni link verso BOOM porta gli UTM del brief');
const titoli = ['data-h1', 'data-h2', 'data-h3'].map((a) => (html.match(new RegExp(a + '="([^"]+)"')) || [])[1]);
ok(titoli.join('|') === "Prima l'ordine. Poi il mercato.|Il tuo immobile, in ordine.|Prima controlliamo i documenti. Poi parliamo di prezzo.", 'i tre titoli candidati del brief, parola per parola');
ok(gzipSync(Buffer.from(html)).length < 60000, `home sotto 60 KB compressi (${gzipSync(Buffer.from(html)).length} B)`);

// 8. Dati strutturati: fatti verificabili, JSON valido.
const ldRaw = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
let ld = null; try { ld = JSON.parse(ldRaw); } catch { /* sotto */ }
ok(ld && ld['@type'] === 'RealEstateAgent', 'JSON-LD valido (RealEstateAgent)');
ok(ld && ld.vatID === 'IT17322991005' && ld.address?.postalCode === '00186' && ld.url === CANON, 'JSON-LD: partita IVA, CAP, url canonico');

// 9. Il progetto Vercel del sito: statico, pulito, e boomrome.com non ne serve una copia.
let vj = null; try { vj = JSON.parse(read('vercel.json')); } catch { /* sotto */ }
ok(vj && vj.cleanUrls === true, 'egidi/vercel.json valido con cleanUrls');
ok(vj && !vj.functions && !vj.crons && !vj.rewrites, 'egidi/vercel.json solo statico (niente funzioni, cron, riscritture)');
ok(vj && /git diff --quiet HEAD\^ HEAD -- \./.test(vj.ignoreCommand || ''), 'build saltata quando egidi/ non cambia');
const root = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const r1 = (root.redirects || []).find((r) => r.source === '/egidi');
const r2 = (root.redirects || []).find((r) => r.source === '/egidi/:path*');
ok(r1 && r1.destination === CANON, 'boomrome.com/egidi → egidimmobiliare.it (niente contenuto duplicato)');
ok(r2 && r2.destination === 'https://www.egidimmobiliare.it/:path*', 'boomrome.com/egidi/* → egidimmobiliare.it/*');
ok(read('robots.txt').includes('Sitemap: https://www.egidimmobiliare.it/sitemap.xml'), 'robots.txt punta alla sitemap');
ok(read('sitemap.xml').includes(`<loc>${CANON}</loc>`), 'sitemap con la home canonica');
ok(/noindex/.test(read('404.html')), '404 non indicizzabile');

// 10. Nel browser vero: nessun errore, niente scroll laterale, leggibile senza JS.
const chromium = await loadChromium();
if (!chromium) {
    console.log('  (browser: SKIP — playwright non disponibile)');
} else {
    const srv = http.createServer((q, r) => {
        let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html';
        const f = path.join(SITE, u);
        if (f.startsWith(SITE) && existsSync(f) && !f.endsWith(path.sep)) {
            r.writeHead(200, { 'content-type': f.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8' }); r.end(readFileSync(f));
        } else { r.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); r.end(read('404.html')); }
    });
    await new Promise((res) => srv.listen(0, '127.0.0.1', res));
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const b = await chromium.launch(launchOptions());
    try {
        const esterne = [];
        const apri = async (w, { js = true, h = 844, rm = 'no-preference', q = '' } = {}) => {
            const ctx = await b.newContext({ viewport: { width: w, height: h }, javaScriptEnabled: js, reducedMotion: rm });
            await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (rt) => { esterne.push(rt.request().url()); rt.abort(); });
            const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
            await p.goto(url + q, { waitUntil: 'load' }); await p.waitForTimeout(250);
            return { ctx, p, errs };
        };
        for (const [w, js] of [[320, true], [390, true], [1440, true], [390, false]]) {
            const { ctx, p, errs } = await apri(w, { js });
            const m = await p.evaluate(() => ({
                sw: document.documentElement.scrollWidth, iw: innerWidth,
                anteprimaVisibili: [...document.querySelectorAll('.solo-anteprima')].filter((e) => e.getClientRects().length).length,
                segnapostoFuori: [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /DA FORNIRE|VERIFICARE|PASSO 4/.test(e.textContent) && !e.closest('.solo-anteprima')).length
            }));
            const tag = `${w}px ${js ? 'con' : 'senza'} JS`;
            ok(errs.length === 0, `${tag}: nessun errore JS (${errs.join(' | ')})`);
            ok(m.sw <= m.iw, `${tag}: nessuno scroll orizzontale (${m.sw} > ${m.iw})`);
            ok(m.segnapostoFuori === 0, `${tag}: ogni segnaposto sta dentro .solo-anteprima`);
            // Senza JS la pagina si comporta come in produzione: segnaposto nascosti.
            if (js) ok(m.anteprimaVisibili > 0, `${tag}: in anteprima (host locale) i segnaposto si vedono`);
            else ok(m.anteprimaVisibili === 0, `${tag}: senza JS nessun segnaposto visibile`);
            await ctx.close();
        }
        // Il test dei 5 secondi, per ogni titolo: sopra la piega a 390×844
        // (tolta la barra WhatsApp) si leggono titolo, «studio immobiliare a
        // Roma» e «la società dietro BOOM».
        for (const hN of ['1', '2', '3']) {
            const { ctx, p } = await apri(390, { q: '?h=' + hN });
            const r = await p.evaluate(() => {
                const t = document.getElementById('titolo'), s = document.querySelector('.sotto');
                const bar = document.querySelector('.wa-fissa').getBoundingClientRect().top;
                return { titolo: t.textContent, fondo: s.getBoundingClientRect().bottom, bar, testo: s.textContent, sx: Math.min(t.getBoundingClientRect().left, s.getBoundingClientRect().left) };
            });
            ok(r.fondo <= r.bar, `h=${hN} «${r.titolo}»: tesi sopra la piega (${Math.round(r.fondo)} ≤ ${Math.round(r.bar)})`);
            ok(r.sx >= 16, `h=${hN}: il testo non tocca il bordo (margine ${Math.round(r.sx)}px ≥ 16)`);
            ok(/Studio immobiliare a Roma/.test(r.testo) && /la società dietro BOOM/.test(r.testo), `h=${hN}: le due frasi del test dei 5 secondi`);
            await ctx.close();
        }
        // Il check: niente riepilogo prima di rispondere, riepilogo vero dopo.
        {
            const { ctx, p } = await apri(390);
            const prima = await p.evaluate(() => document.getElementById('esito').getClientRects().length);
            await p.evaluate(() => { const v = ['si', 'no', 'ns', 'si', 'si', 'si', 'no', 'si']; v.forEach((x, i) => document.querySelector(`input[name=v${i + 1}][value=${x}]`).click()); });
            const dopo = await p.evaluate(() => ({ punti: document.getElementById('punti').textContent, righe: document.querySelectorAll('#manca li').length, titolo: document.getElementById('esito-titolo').textContent }));
            ok(prima === 0, 'check: nessun riepilogo prima della prima risposta');
            ok(dopo.punti === '5' && dopo.righe === 3 && dopo.titolo === 'Cosa manca', `check: 5 su 8 e tre voci da sistemare o verificare (${JSON.stringify(dopo)})`);
            await ctx.close();
        }
        // Riduzione del movimento: il fascicolo è composto dal primo frame.
        for (const w of [390, 1440]) {
            const { ctx, p } = await apri(w, { rm: 'reduce' });
            const f = await p.evaluate(() => ({
                ruotati: [...document.querySelectorAll('.foglio')].filter((e) => { const m = new DOMMatrix(getComputedStyle(e).transform); return Math.abs(m.b) > 0.001; }).length,
                sigillo: getComputedStyle(document.querySelector('.sigillo')).opacity
            }));
            ok(f.ruotati === 0 && f.sigillo === '1', `${w}px movimento ridotto: fogli allineati e sigillo presente (${f.ruotati} ruotati, sigillo ${f.sigillo})`);
            await ctx.close();
        }
        // Con movimento: in cima i fogli sono sparsi, dopo lo scroll composti e sigillati.
        {
            const { ctx, p } = await apri(1440, { h: 900 });
            const stato = () => p.evaluate(() => ({
                ruotati: [...document.querySelectorAll('.foglio')].filter((e) => Math.abs(new DOMMatrix(getComputedStyle(e).transform).b) > 0.01).length,
                sigillo: +getComputedStyle(document.querySelector('.sigillo')).opacity,
                supporta: CSS.supports('animation-timeline: view()')
            }));
            const inizio = await stato();
            if (inizio.supporta) {
                await p.evaluate(() => scrollTo(0, innerHeight * 0.26)); await p.waitForTimeout(250);
                const dopo = await stato();
                ok(inizio.ruotati >= 5 && inizio.sigillo < 0.1, `1440px in cima: fascicolo sparso (${inizio.ruotati} fogli ruotati, sigillo ${inizio.sigillo})`);
                ok(dopo.ruotati === 0 && dopo.sigillo > 0.99, `1440px dopo lo scroll: composto e sigillato (${dopo.ruotati}, ${dopo.sigillo})`);
            } else console.log('  (scroll-timeline non supportata da questo Chromium: salto il controllo del movimento)');
            await ctx.close();
        }
        ok(esterne.length === 0, `zero richieste esterne per disegnare la pagina (${esterne.slice(0, 3).join(' | ')})`);
    } finally { await b.close(); srv.close(); }
}

console.log(`egidi: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
