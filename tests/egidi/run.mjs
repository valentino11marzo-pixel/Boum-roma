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
// Il 30/09 sera il fondatore ha bocciato «Il Fascicolo» come troppo basilare:
// la home diventa «Valentino Egidi Immobiliare» (vendite) col passaggio
// esplicito a BOOM (affitti). Le regole di sostanza restano, quelle di gusto
// seguono la nuova direzione.
// Terza direzione (v3, stessa sera): il tabellone Solari come hero (le
// partenze VENDERE/COMPRARE/INVESTIRE → Valentino Egidi, AFFITTARE → BOOM),
// Archivo con l'asse della larghezza e JetBrains Mono ospitati QUI, il
// metodo recitato da un modello 3D sullo scroll, la candidatura in quattro
// passi che finisce su WhatsApp senza passare da un server. Niente rosso fra
// le varianti: il nome Valentino in rosso è la casa di moda.
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

// 7. Il brand e il ponte verso BOOM (rifondazione del 30/09: «Valentino
//    Egidi Immobiliare» = vendite, BOOM = affitti, e il passaggio si vede).
ok(html.includes("classList.add('js')"), 'la classe js si accende prima del render');
ok(/Valentino Egidi Immobiliare/.test(title), 'il titolo porta il brand');
ok(html.includes('Valentino Egidi Immobiliare è un marchio di Egidi Immobiliare S.r.l.'), 'il piede dichiara di chi è il marchio');
const testo = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
ok(testo.includes('BOOM è il marchio di Egidi Immobiliare S.r.l. per gli affitti a studenti e professionisti internazionali.'), 'la frase fissa su BOOM');
const boomLinks = [...html.matchAll(/href="(https:\/\/www\.boomrome\.com\/[^"]*)"/g)].map((m) => m[1]).filter((u) => !/\/privacy$/.test(u));
ok(boomLinks.length >= 4 && boomLinks.every((u) => /utm_source=egidimmobiliare&amp;utm_medium=referral&amp;utm_campaign=\w+/.test(u)), `ogni link verso BOOM porta gli UTM (${boomLinks.length})`);
ok(/data-evento="handoff_boom"/.test(html) && /data-evento="whatsapp_click"/.test(html), 'eventi handoff_boom e whatsapp_click sui link');
ok(!/!/.test(testo), 'nessun punto esclamativo');
ok(!/\p{Extended_Pictographic}/u.test(testo), 'nessuna emoji');
ok(!/consulenza fiscale/i.test(testo), 'nessuna «consulenza fiscale»');
ok(!/entratel/i.test(html), 'Entratel non citato finché non è attivo');
// Movimento con le regole di chi non vuole movimento.
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
ok(/prefers-reduced-motion:reduce/.test(css), 'riduzione del movimento rispettata');
ok(/id="ferma"[^>]*aria-pressed/.test(html), 'un bottone ferma le animazioni che si ripetono (WCAG 2.2.2)');
ok(!/cursor\s*:\s*none|lenis|locomotive/i.test(html), 'niente cursore custom né scroll dirottato');
// Oro solo su fondi scuri (BOOM, notte, blu), mai su carta.
const oro = [...css.matchAll(/([^{}]+)\{(?:[^{}]*;)?color:var\(--oro\)/g)].map((m) => m[1].trim());
ok(oro.length > 0 && oro.every((sel) => /a-boom|casa-boom|\.atto|\.pass|investire|cifra\.oro|contatti/.test(sel)), `testo oro solo su fondi scuri o blu (${oro.join(' | ')})`);
// I caratteri: scelti, ospitati qui, con licenza. Nessuna richiesta a terzi.
for (const f of ['archivo-wdth.woff2', 'jetbrains-mono.woff2']) {
    const b = existsSync(path.join(SITE, 'fonts', f)) ? readFileSync(path.join(SITE, 'fonts', f)) : Buffer.alloc(0);
    ok(b.subarray(0, 4).toString('latin1') === 'wOF2' && b.length < 120000, `fonts/${f}: woff2 vero e leggero (${b.length} B)`);
    ok(html.includes(`<link rel="preload" href="/fonts/${f}" as="font" type="font/woff2" crossorigin>`), `fonts/${f} precaricato`);
}
ok(/SIL Open Font License/.test(read('fonts/OFL.txt')) && /Archivo/.test(read('fonts/OFL.txt')) && /JetBrains Mono/.test(read('fonts/OFL.txt')), 'fonts/OFL.txt: licenza e attribuzione dei due caratteri');
ok(/font-stretch:62% 125%/.test(css), "Archivo dichiara l'asse della larghezza (62–125%)");
ok(!/fonts\.googleapis|fonts\.gstatic|use\.typekit/.test(html), 'nessun carattere da servizi esterni');
ok(/"source":"\/fonts\/\(\.\*\)"[^\]]*immutable/.test(JSON.stringify(JSON.parse(read('vercel.json')))), 'i caratteri hanno cache lunga (immutable)');
ok(!/data-colore=rosso|c=rosso|\brosso\b/i.test(html), 'nessuna variante rossa (il rosso Valentino è della casa di moda)');
// Contrasto AA sulle coppie di testo, per ogni variante di colore.
const hex = (h) => h.replace('#', '').match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const tok = Object.fromEntries([...css.match(/:root\{[^}]*\}/)[0].matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const varianti = [tok, ...[...css.matchAll(/data-colore=\w+\]\{([^}]*)\}/g)].map((m) => ({ ...tok, ...Object.fromEntries([...m[1].matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map((x) => [x[1], x[2]])) }))];
ok(varianti.length === 3, 'tre varianti di accento in anteprima (blu, verde, nero)');
for (const v of varianti) {
    ok(cr('#FFFFFF', v.accento) >= 4.5, `bianco su accento ${v.accento}: ${cr('#FFFFFF', v.accento).toFixed(2)}`);
    ok(cr(v.accento, tok.carta) >= 3, `accento ${v.accento} su carta (titoli grandi): ${cr(v.accento, tok.carta).toFixed(2)}`);
    ok(cr(tok.nebbia, v.notte) >= 4.5, `nebbia su notte ${v.notte}: ${cr(tok.nebbia, v.notte).toFixed(2)}`);
    ok(cr('#FFFFFF', v['cella-2']) >= 4.5, `lettere del tabellone su cella ${v['cella-2']}: ${cr('#FFFFFF', v['cella-2']).toFixed(2)}`);
    ok(cr(tok.oro, v.accento) >= 3 || v.accento === tok.ink, `oro su accento ${v.accento} (titoli grandi): ${cr(tok.oro, v.accento).toFixed(2)}`);
}
for (const [fg, bg] of [[tok.ink, tok.carta], [tok.grigio, tok.carta], [tok['grigio-2'], '#FFFFFF'], [tok.boom, tok.oro], [tok.oro, tok.boom], [tok.oro, '#0B0B0D'], ['#DADADF', tok.ink], ['#A6A6AE', tok.ink], ['#B4B4BB', tok.ink]]) {
    ok(cr(fg, bg) >= 4.5, `contrasto ${fg} su ${bg}: ${cr(fg, bg).toFixed(2)}`);
}
ok(gzipSync(Buffer.from(html)).length < 60000, `home sotto 60 KB compressi (${gzipSync(Buffer.from(html)).length} B)`);

// 8. Dati strutturati: fatti verificabili, JSON valido.
const ldRaw = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
let ld = null; try { ld = JSON.parse(ldRaw); } catch { /* sotto */ }
ok(ld && ld['@type'] === 'RealEstateAgent', 'JSON-LD valido (RealEstateAgent)');
ok(ld && ld.name === 'Valentino Egidi Immobiliare' && ld.legalName === 'Egidi Immobiliare S.r.l.', 'JSON-LD: brand e ragione sociale distinti');
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
    const TIPI = { '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
    const srv = http.createServer((q, r) => {
        let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html';
        const f = path.join(SITE, u);
        if (f.startsWith(SITE) && existsSync(f) && !f.endsWith(path.sep)) {
            r.writeHead(200, { 'content-type': TIPI[path.extname(f)] || 'text/html; charset=utf-8' }); r.end(readFileSync(f));
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
            await p.goto(url + q, { waitUntil: 'load' }); await p.waitForTimeout(300);
            return { ctx, p, errs };
        };
        const parole = () => [...document.querySelectorAll('#tabellone .riga')].map((r) => [...r.querySelectorAll('.f b')].map((x) => x.textContent).join('').replace(/ /g, ' ').trim() + '=' + r.dataset.parola);
        for (const [w, js] of [[320, true], [390, true], [1440, true], [390, false]]) {
            const { ctx, p, errs } = await apri(w, { js });
            const m = await p.evaluate((parole) => ({
                sw: document.documentElement.scrollWidth, iw: innerWidth,
                anteprimaVisibili: [...document.querySelectorAll('.solo-anteprima')].filter((e) => e.getClientRects().length).length,
                segnapostoFuori: [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /DA FORNIRE|VERIFICARE|PASSO 4/.test(e.textContent) && !e.closest('.solo-anteprima')).length,
                marchioRighe: Math.round(document.querySelector('.marchio b').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('.marchio b')).lineHeight === 'normal' ? getComputedStyle(document.querySelector('.marchio b')).fontSize * 1.3 : getComputedStyle(document.querySelector('.marchio b')).lineHeight)),
                parole: new Function('return (' + parole + ')()')(),
                atti: [...document.querySelectorAll('.atto')].filter((a) => a.getClientRects().length && +getComputedStyle(a).opacity > 0.99).length
            }), parole.toString());
            const tag = `${w}px ${js ? 'con' : 'senza'} JS`;
            ok(errs.length === 0, `${tag}: nessun errore JS (${errs.join(' | ')})`);
            ok(m.sw <= m.iw, `${tag}: nessuno scroll orizzontale (${m.sw} > ${m.iw})`);
            ok(m.segnapostoFuori === 0, `${tag}: ogni segnaposto sta dentro .solo-anteprima`);
            ok(m.marchioRighe <= 1, `${tag}: «VALENTINO EGIDI» su una riga sola`);
            if (js) ok(m.anteprimaVisibili > 0, `${tag}: in anteprima (host locale) i segnaposto si vedono`);
            else {
                ok(m.anteprimaVisibili === 0, `${tag}: senza JS nessun segnaposto visibile`);
                ok(m.parole.every((x) => x.split('=')[0] === x.split('=')[1]), `${tag}: il tabellone si legge anche senza JS (${m.parole.join(' ')})`);
                ok(m.atti === 5, `${tag}: i cinque atti del metodo sono tutti visibili (${m.atti})`);
            }
            await ctx.close();
        }
        // Test dei 5 secondi a 390×844: sopra la barra WhatsApp si legge chi
        // siamo, dove, e che per affittare c'è BOOM — anche la riga del tabellone.
        {
            const { ctx, p } = await apri(390);
            const r = await p.evaluate(() => {
                const s = document.querySelector('.hero .sotto'), t = document.querySelector('.titolo');
                return { fondo: s.getBoundingClientRect().bottom, boom: document.querySelector('.riga.a-boom').getBoundingClientRect().bottom, bar: document.querySelector('.wa-fissa').getBoundingClientRect().top, testo: s.textContent, sx: Math.min(s.getBoundingClientRect().left, t.getBoundingClientRect().left) };
            });
            ok(r.fondo <= r.bar, `390px: la tesi sta sopra la piega (${Math.round(r.fondo)} ≤ ${Math.round(r.bar)})`);
            ok(r.boom <= r.bar, `390px: la riga AFFITTARE → BOOM sta sopra la barra WhatsApp (${Math.round(r.boom)} ≤ ${Math.round(r.bar)})`);
            ok(/Valentino Egidi Immobiliare/.test(r.testo) && /Roma/.test(r.testo) && /BOOM/.test(r.testo), '390px: brand, Roma e BOOM nella tesi');
            ok(r.sx >= 16, `390px: margine sinistro ${Math.round(r.sx)}px ≥ 16`);
            await ctx.close();
        }
        // I caratteri arrivano davvero (dal nostro server) e il titolo li usa.
        {
            const { ctx, p } = await apri(1440, { h: 900 });
            await p.evaluate(() => document.fonts.ready);
            const f = await p.evaluate(() => ({ a: document.fonts.check('700 20px Archivo'), m: document.fonts.check('500 12px "JetBrains Mono"'), stato: [...document.fonts].map((x) => x.family + ':' + x.status).join(',') }));
            ok(f.a && f.m && !/error/.test(f.stato), `Archivo e JetBrains Mono caricati (${f.stato})`);
            await ctx.close();
        }
        // Il tabellone: gira, si posa sulle parole giuste, AFFITTARE porta a BOOM
        // in oro, «Ferma» lo ferma subito (WCAG 2.2.2) e lo riavvia.
        for (const w of [1440, 390]) {
            const { ctx, p } = await apri(w, { h: w > 900 ? 900 : 844 });
            const gira = await p.evaluate(() => new Promise((res) => setTimeout(() => res(document.querySelectorAll('.f.gira').length), 250)));
            await p.waitForTimeout(4200);
            const posato = await p.evaluate(parole);
            ok(gira > 0, `${w}px: il tabellone gira all'apertura (${gira} celle in movimento)`);
            ok(posato.every((x) => x.split('=')[0] === x.split('=')[1]), `${w}px: si posa su VENDERE · COMPRARE · INVESTIRE · AFFITTARE (${posato.join(' ')})`);
            const boom = await p.evaluate(() => { const r = document.querySelector('.riga.a-boom'); return { href: r.getAttribute('href'), dest: r.querySelector('.dest').textContent, col: getComputedStyle(r.querySelector('.dest')).color, altre: [...document.querySelectorAll('.riga:not(.a-boom)')].map((x) => x.querySelector('.dest').textContent) }; });
            ok(boom.dest === 'BOOM' && boom.col === 'rgb(255, 215, 0)' && /boomrome\.com\/owners\?utm_source=egidimmobiliare&utm_medium=referral&utm_campaign=tabellone/.test(boom.href), `${w}px: AFFITTARE → BOOM, in oro, con gli UTM`);
            ok(boom.altre.every((x) => x === 'Valentino Egidi'), `${w}px: le altre partenze vanno a Valentino Egidi`);
            const stop = await p.evaluate(parole => { const f = document.getElementById('ferma'); f.click(); const dopo = new Function('return (' + parole + ')()')(); return new Promise((res) => setTimeout(() => res({ pressed: f.getAttribute('aria-pressed'), dopo, gira: document.querySelectorAll('.f.gira b').length && [...document.querySelectorAll('.f b')].some((b) => getComputedStyle(b).animationName !== 'none' && b.parentNode.classList.contains('gira')) }), 400)); }, parole.toString());
            ok(stop.pressed === 'true' && stop.dopo.every((x) => x.split('=')[0] === x.split('=')[1]), `${w}px: «Ferma» posa subito le parole e resta fermo`);
            const riparte = await p.evaluate(() => { const f = document.getElementById('ferma'); f.click(); return new Promise((res) => setTimeout(() => res({ pressed: f.getAttribute('aria-pressed'), gira: document.querySelectorAll('.f.gira').length }), 150)); });
            ok(riparte.pressed === 'false', `${w}px: «Riavvia» lo fa ripartire`);
            await ctx.close();
        }
        // Movimento ridotto: niente tabellone che gira, niente bottone inutile, modello già in piedi.
        {
            const { ctx, p } = await apri(1440, { h: 900, rm: 'reduce' });
            const r = await p.evaluate((parole) => ({ ferma: getComputedStyle(document.getElementById('ferma')).display, parole: new Function('return (' + parole + ')()')(), muro: parseFloat(getComputedStyle(document.querySelector('.muro')).height) }), parole.toString());
            ok(r.ferma === 'none', 'movimento ridotto: il bottone «Ferma» non serve e non si vede');
            ok(r.parole.every((x) => x.split('=')[0] === x.split('=')[1]), 'movimento ridotto: le parole sono già al loro posto');
            ok(r.muro > 0, 'movimento ridotto: il modello è già in piedi');
            await ctx.close();
        }
        // Il metodo: lo scroll VERO sceglie l'atto, il modello lo recita, i muri
        // salgono sopra il pavimento (il difetto della v2 era il segno della rotazione).
        for (const [w, h] of [[1440, 900], [390, 844]]) {
            const { ctx, p } = await apri(w, { h });
            const top = await p.evaluate(() => document.getElementById('atti').offsetTop);
            const corsa = await p.evaluate(() => document.getElementById('atti').offsetHeight - innerHeight);
            const visti = [];
            for (let i = 0; i < 5; i++) {
                await p.evaluate((y) => scrollTo(0, y), top + corsa * (i + 0.5) / 5); await p.waitForTimeout(150);
                visti.push(await p.evaluate(() => document.getElementById('modello').className.replace('modello ', '') + ':' + [...document.querySelectorAll('.atto.su')].map((a) => a.dataset.atto).join('')));
            }
            ok(visti.join(' ') === 's1:1 s2:2 s3:3 s4:4 s5:5', `${w}px: lo scroll recita i cinque atti (${visti.join(' ')})`);
            await p.waitForTimeout(1300);
            const m = await p.evaluate(() => { const l = document.querySelector('.lastra').getBoundingClientRect(), mu = document.querySelector('.muro').getBoundingClientRect(), pin = document.querySelector('.p5'); return { muroTop: mu.top, lastraTop: l.top, pin: pin.textContent.trim(), pinOp: +getComputedStyle(pin).opacity, testata: document.getElementById('testata').classList.contains('chiara') }; });
            ok(m.muroTop < m.lastraTop - 10, `${w}px: il muro di fondo sale sopra il pavimento (${Math.round(m.muroTop)} < ${Math.round(m.lastraTop)})`);
            ok(m.pinOp > 0.99 && /BOOM/i.test(m.pin), `${w}px: all'ultimo atto il modello dice BOOM (${m.pin})`);
            ok(!m.testata, `${w}px: la testata resta scura sopra il metodo`);
            await ctx.close();
        }
        // Testata: scura sull'hero, chiara sulla carta, di nuovo scura sul metodo.
        {
            const { ctx, p } = await apri(1440, { h: 900 });
            const at = async (id) => { await p.evaluate((i) => scrollTo(0, document.getElementById(i).offsetTop + 200), id); await p.waitForTimeout(200); return p.evaluate(() => document.getElementById('testata').classList.contains('chiara')); };
            const hero = await p.evaluate(() => document.getElementById('testata').classList.contains('chiara'));
            const carta = await at('case'), macchina = await at('macchina');
            ok(!hero && carta && macchina, `testata scura sull'hero, chiara sulla carta (${hero} ${carta} ${macchina})`);
            await ctx.close();
        }
        // Il calcolo: aritmetica vera, nessun numero prima che il visitatore scriva.
        {
            const { ctx, p } = await apri(390);
            const vuoto = await p.evaluate(() => document.getElementById('lordo').textContent);
            const c1 = await p.evaluate(() => { document.getElementById('esempio').click(); return ['lordo', 'netto', 'annuo'].map((k) => document.getElementById(k).textContent); });
            const c2 = await p.evaluate(() => { document.querySelector('input[name=regime][value="0.10"]').click(); return document.getElementById('netto').textContent; });
            ok(vuoto === '—', 'calcolo: nessun numero prima che il visitatore scriva');
            ok(c1.join('|') === '5,8%|4,6%|€ 14.400', `calcolo: 250.000 e 1.200 danno 5,8% lordo, 4,6% netto, € 14.400 (${c1.join('|')})`);
            ok(c2 === '5,2%', `calcolo: col concordato il netto sale al 5,2% (${c2})`);
            await ctx.close();
        }
        // La candidatura: quattro passi, tutto nel browser, alla fine WhatsApp
        // col riepilogo. «Affittare» va a BOOM subito, senza passi inutili.
        {
            const { ctx, p } = await apri(390);
            const r = await p.evaluate(async () => {
                const sl = (ms) => new Promise((res) => setTimeout(res, ms)), $ = (i) => document.getElementById(i);
                const vis = () => [...document.querySelectorAll('.passo')].map((x) => (x.hidden ? 0 : 1)).join('');
                const shown = (e) => getComputedStyle(e).display !== 'none';
                const o = { passi: [vis()] };
                o.inviaPrima = shown($('invia'));
                document.querySelector('input[name=intento][value=vendere]').click(); $('avanti').click(); await sl(30); o.passi.push(vis());
                const z = document.querySelector('#candida [name=zona]'); z.value = 'Monti'; z.dispatchEvent(new Event('input', { bubbles: true }));
                $('avanti').click(); await sl(30); o.passi.push(vis());
                ['si', 'si', 'si', 'si', 'no', 'ns'].forEach((x, i) => document.querySelector(`input[name=d${i + 1}][value=${x}]`).click());
                o.punti = $('punti').textContent;
                $('avanti').click(); await sl(30); o.passi.push(vis());
                const n = document.querySelector('#candida [name=nome]'); n.value = 'Mario Rossi'; n.dispatchEvent(new Event('input', { bubbles: true }));
                o.href = $('invia').href; o.riep = $('riepilogo').textContent; o.inviaDopo = shown($('invia')); o.avantiDopo = shown($('avanti'));
                for (let i = 0; i < 4; i++) $('indietro').click();
                document.querySelector('input[name=intento][value=affittare]').click(); await sl(30);
                o.aff = { href: $('invia').href, testo: $('invia').textContent, invia: shown($('invia')), avanti: shown($('avanti')), passo: vis() };
                document.querySelector('input[name=intento][value=comprare]').click(); await sl(30);
                o.comp = { invia: shown($('invia')), avanti: shown($('avanti')) };
                $('avanti').click(); $('avanti').click(); await sl(30);
                o.comp.doc = [$('voci-doc').hidden, $('doc-comprare').hidden];
                return o;
            });
            ok(r.passi.join(' ') === '1000 0100 0010 0001' && !r.inviaPrima, `candidatura: quattro passi in ordine, niente invio prima dell'ultimo (${r.passi.join(' ')})`);
            ok(r.punti === '4/6', `candidatura: i documenti in ordine si contano (${r.punti})`);
            ok(r.href.startsWith('https://wa.me/393313251961?text=') && decodeURIComponent(r.href.split('text=')[1]) === r.riep, 'candidatura: WhatsApp si apre col riepilogo mostrato, parola per parola');
            ok(/Intenzione: Vendere/.test(r.riep) && /Zona: Monti/.test(r.riep) && /Documenti in ordine: 4 su 6/.test(r.riep) && /Impianti certificati \(da sistemare\)/.test(r.riep) && /Contratto registrato \(da verificare\)/.test(r.riep) && /Nome: Mario Rossi/.test(r.riep), 'candidatura: il riepilogo dice cosa manca');
            ok(r.inviaDopo && !r.avantiDopo, 'candidatura: all\'ultimo passo c\'è solo «Invia»');
            ok(r.aff.invia && !r.aff.avanti && r.aff.passo === '1000' && /Continua su BOOM/.test(r.aff.testo) && /boomrome\.com\/owners\?utm_source=egidimmobiliare&utm_medium=referral&utm_campaign=candidatura/.test(r.aff.href), `candidatura: «Affittare» porta subito a BOOM (${JSON.stringify(r.aff)})`);
            ok(!r.comp.invia && r.comp.avanti, 'candidatura: tornando a «Comprare» il percorso torna a quattro passi');
            ok(r.comp.doc[0] === true && r.comp.doc[1] === false, 'candidatura: chi compra non deve dichiarare i documenti di una casa che non ha');
            await ctx.close();
        }
        // Dal tabellone: COMPRARE apre la candidatura già scelta.
        {
            const { ctx, p } = await apri(1440, { h: 900 });
            await p.evaluate(() => { document.getElementById('ferma').click(); document.querySelector('.riga[data-intento=comprare]').click(); });
            const v = await p.evaluate(() => (document.querySelector('input[name=intento]:checked') || {}).value);
            ok(v === 'comprare', `dal tabellone COMPRARE la candidatura parte già su «comprare» (${v})`);
            await ctx.close();
        }
        ok(esterne.length === 0, `zero richieste esterne per disegnare la pagina (${esterne.slice(0, 3).join(' | ')})`);
    } finally { await b.close(); srv.close(); }
}

console.log(`egidi: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
