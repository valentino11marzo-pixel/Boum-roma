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
import { readFileSync, existsSync } from 'node:fs';
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

// 7. Il numero vero sta nel markup: senza JS non si legge «0 h».
for (const [, c, v] of html.matchAll(/data-c="(\d+)">(\d+)</g)) ok(c === v, `contatore ${c}: il markup porta ${v}`);
ok(/html:not\(\.js\) \.rv\{opacity:1/.test(html), 'senza JS le sezioni restano visibili');
ok(html.includes("document.documentElement.classList.add('js')"), 'la classe js si accende prima del render');

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
        for (const [w, js] of [[390, true], [1440, true], [390, false]]) {
            const ctx = await b.newContext({ viewport: { width: w, height: 844 }, javaScriptEnabled: js });
            await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (rt) => rt.abort()); // niente rete: font e foto esterne non devono servire
            const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
            await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(400);
            const m = await p.evaluate(() => ({
                sw: document.documentElement.scrollWidth, iw: innerWidth,
                hidden: [...document.querySelectorAll('.rv')].filter((e) => getComputedStyle(e).opacity === '0').length,
                counters: [...document.querySelectorAll('[data-c]')].map((e) => e.childNodes[0].nodeValue === e.dataset.c)
            }));
            const tag = `${w}px ${js ? 'con' : 'senza'} JS`;
            ok(errs.length === 0, `${tag}: nessun errore JS (${errs.join(' | ')})`);
            ok(m.sw <= m.iw, `${tag}: nessuno scroll orizzontale (${m.sw} > ${m.iw})`);
            if (!js) {
                ok(m.hidden === 0, `${tag}: nessuna sezione invisibile (${m.hidden})`);
                ok(m.counters.every(Boolean), `${tag}: i contatori mostrano il numero vero`);
            }
            await ctx.close();
        }
    } finally { await b.close(); srv.close(); }
}

console.log(`egidi: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
