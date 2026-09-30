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
// Oro solo su fondi scuri (BOOM) o sul blu, mai su carta.
const oro = [...css.matchAll(/([^{}]+)\{(?:[^{}]*;)?color:var\(--oro\)/g)].map((m) => m[1].trim());
ok(oro.length > 0 && oro.every((sel) => /casa-boom|investire|cifra\.oro|contatti|modo-boom|nastro/.test(sel)), `testo oro solo su fondi scuri o blu (${oro.join(' | ')})`);
// Contrasto AA sulle coppie di testo, per ogni variante di colore.
const hex = (h) => h.replace('#', '').match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const tok = Object.fromEntries([...css.match(/:root\{[^}]*\}/)[0].matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const accenti = [tok.accento, ...[...css.matchAll(/data-colore=\w+\]\{--accento:(#[0-9A-Fa-f]{6})/g)].map((m) => m[1])];
ok(accenti.length === 3, 'tre varianti di accento in anteprima');
for (const a of accenti) {
    ok(cr('#FFFFFF', a) >= 4.5, `bianco su accento ${a}: ${cr('#FFFFFF', a).toFixed(2)}`);
    ok(cr(a, tok.carta) >= 3, `accento ${a} su carta (titoli grandi): ${cr(a, tok.carta).toFixed(2)}`);
}
ok(cr(tok.oro, tok.accento) >= 3, `oro sul blu (titoli grandi): ${cr(tok.oro, tok.accento).toFixed(2)}`);
for (const [fg, bg] of [[tok.ink, tok.carta], [tok.grigio, tok.carta], [tok['grigio-2'], '#FFFFFF'], [tok.boom, tok.oro], [tok.oro, tok.boom], ['#C9C9CF', tok.boom], ['#A6A6AE', tok.ink], ['#B4B4BB', tok.ink]]) {
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
            await p.goto(url + q, { waitUntil: 'load' }); await p.waitForTimeout(300);
            return { ctx, p, errs };
        };
        const incrocia = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        for (const [w, js] of [[320, true], [390, true], [1440, true], [390, false]]) {
            const { ctx, p, errs } = await apri(w, { js });
            const m = await p.evaluate(() => ({
                sw: document.documentElement.scrollWidth, iw: innerWidth,
                anteprimaVisibili: [...document.querySelectorAll('.solo-anteprima')].filter((e) => e.getClientRects().length).length,
                segnapostoFuori: [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /DA FORNIRE|VERIFICARE|PASSO 4/.test(e.textContent) && !e.closest('.solo-anteprima')).length,
                marchioRighe: Math.round(document.querySelector('.marchio-testo b').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('.marchio-testo b')).fontSize))
            }));
            const tag = `${w}px ${js ? 'con' : 'senza'} JS`;
            ok(errs.length === 0, `${tag}: nessun errore JS (${errs.join(' | ')})`);
            ok(m.sw <= m.iw, `${tag}: nessuno scroll orizzontale (${m.sw} > ${m.iw})`);
            ok(m.segnapostoFuori === 0, `${tag}: ogni segnaposto sta dentro .solo-anteprima`);
            ok(m.marchioRighe <= 1, `${tag}: «VALENTINO EGIDI» su una riga sola`);
            if (js) ok(m.anteprimaVisibili > 0, `${tag}: in anteprima (host locale) i segnaposto si vedono`);
            else ok(m.anteprimaVisibili === 0, `${tag}: senza JS nessun segnaposto visibile`);
            await ctx.close();
        }
        // Test dei 5 secondi a 390×844: sopra la barra WhatsApp si legge chi
        // siamo, dove, e che per affittare c'è BOOM. E il testo non tocca il bordo.
        {
            const { ctx, p } = await apri(390);
            const r = await p.evaluate(() => {
                const s = document.querySelector('.hero .sotto'), t = document.querySelector('.titolo');
                return { fondo: s.getBoundingClientRect().bottom, bar: document.querySelector('.wa-fissa').getBoundingClientRect().top, testo: s.textContent, sx: Math.min(s.getBoundingClientRect().left, t.getBoundingClientRect().left) };
            });
            ok(r.fondo <= r.bar, `390px: la tesi sta sopra la piega (${Math.round(r.fondo)} ≤ ${Math.round(r.bar)})`);
            ok(/Valentino Egidi Immobiliare/.test(r.testo) && /Roma/.test(r.testo) && /BOOM/.test(r.testo), '390px: brand, Roma e BOOM nella tesi');
            ok(r.sx >= 16, `390px: margine sinistro ${Math.round(r.sx)}px ≥ 16`);
            await ctx.close();
        }
        // L'hero: i muri si ALZANO (il difetto della prima prova era il segno
        // della rotazione: pendevano sotto il pavimento), il verbo diventa BOOM,
        // la pillola BOOM non copre niente, il bottone ferma tutto.
        for (const w of [1440, 390]) {
            const { ctx, p } = await apri(w, { h: w > 900 ? 900 : 844 });
            await p.waitForTimeout(1600);
            const muri = await p.evaluate(() => {
                const l = document.querySelector('.lastra').getBoundingClientRect(), m = document.querySelector('.muro').getBoundingClientRect();
                return { h: parseFloat(getComputedStyle(document.querySelector('.muro')).height), muroTop: m.top, lastraTop: l.top };
            });
            ok(muri.h > 0 && muri.muroTop < muri.lastraTop - 10, `${w}px: il muro di fondo sale sopra il pavimento (${Math.round(muri.muroTop)} < ${Math.round(muri.lastraTop)})`);
            const boom = await p.evaluate(() => {
                document.getElementById('ferma').click(); window.__egidiVerbo(3);
                const chip = document.querySelector('.boom-chip');
                return new Promise((res) => setTimeout(() => res({
                    modo: document.getElementById('hero').classList.contains('modo-boom'),
                    bg: getComputedStyle(document.getElementById('hero')).backgroundColor,
                    chip: chip.getBoundingClientRect().toJSON(), chipTab: chip.tabIndex, chipOp: +getComputedStyle(chip).opacity,
                    ferma: document.getElementById('ferma').getBoundingClientRect().toJSON(),
                    cta: [...document.querySelectorAll('.hero-cta .btn')].map((e) => e.getBoundingClientRect().toJSON())
                }), 900));
            });
            ok(boom.modo && boom.bg === 'rgb(6, 6, 7)', `${w}px: su «Affitta» l'hero diventa BOOM (${boom.bg})`);
            ok(boom.chipOp > 0.99 && boom.chipTab === 0, `${w}px: la pillola BOOM è visibile e raggiungibile da tastiera`);
            ok(!incrocia(boom.chip, boom.ferma) && boom.cta.every((c) => !incrocia(boom.chip, c)), `${w}px: la pillola BOOM non copre bottoni`);
            const stop = await p.evaluate(() => { document.getElementById('ferma').click(); document.getElementById('ferma').click(); return { pressed: document.getElementById('ferma').getAttribute('aria-pressed'), modo: document.getElementById('hero').classList.contains('modo-boom') }; });
            ok(stop.pressed === 'true' && !stop.modo, `${w}px: «Ferma» riporta su «Vendi» e resta fermo`);
            await ctx.close();
        }
        // Movimento ridotto: nessun giro di verbi, muri e pin già al loro posto.
        {
            const { ctx, p } = await apri(1440, { h: 900, rm: 'reduce' });
            const r = await p.evaluate(() => ({ ferma: document.getElementById('ferma').hidden, muro: parseFloat(getComputedStyle(document.querySelector('.muro')).height), pin: getComputedStyle(document.querySelector('.pin')).opacity }));
            await p.waitForTimeout(3000);
            const modo = await p.evaluate(() => document.getElementById('hero').classList.contains('modo-boom'));
            ok(r.ferma && r.muro > 0 && r.pin === '1' && !modo, `movimento ridotto: fermo, muri alzati, pin visibili (${JSON.stringify(r)})`);
            await ctx.close();
        }
        // Testata: trasparente sull'hero, chiara dopo.
        {
            const { ctx, p } = await apri(1440, { h: 900 });
            const prima = await p.evaluate(() => document.getElementById('testata').classList.contains('chiara'));
            await p.evaluate(() => scrollTo(0, innerHeight * 1.5)); await p.waitForTimeout(300);
            const dopo = await p.evaluate(() => document.getElementById('testata').classList.contains('chiara'));
            ok(!prima && dopo, 'testata trasparente sull\'hero, chiara dopo');
            await ctx.close();
        }
        // Il calcolo e il check: aritmetica vera, niente riepilogo a vuoto.
        {
            const { ctx, p } = await apri(390);
            const vuoto = await p.evaluate(() => [document.getElementById('lordo').textContent, document.getElementById('esito').getClientRects().length]);
            const c1 = await p.evaluate(() => { document.getElementById('esempio').click(); return ['lordo', 'netto', 'annuo'].map((k) => document.getElementById(k).textContent); });
            const c2 = await p.evaluate(() => { document.querySelector('input[name=regime][value="0.10"]').click(); return document.getElementById('netto').textContent; });
            ok(vuoto[0] === '—', 'calcolo: nessun numero prima che il visitatore scriva');
            ok(c1.join('|') === '5,8%|4,6%|€ 14.400', `calcolo: 250.000 e 1.200 danno 5,8% lordo, 4,6% netto, € 14.400 (${c1.join('|')})`);
            ok(c2 === '5,2%', `calcolo: col concordato il netto sale al 5,2% (${c2})`);
            await p.evaluate(() => { ['si', 'no', 'ns', 'si', 'si', 'si', 'no', 'si'].forEach((x, i) => document.querySelector(`input[name=v${i + 1}][value=${x}]`).click()); });
            const ch = await p.evaluate(() => ({ punti: document.getElementById('punti').textContent, righe: document.querySelectorAll('#manca li').length, titolo: document.getElementById('esito-titolo').textContent }));
            ok(vuoto[1] === 0, 'check: nessun riepilogo prima della prima risposta');
            ok(ch.punti === '5' && ch.righe === 3 && ch.titolo === 'Cosa manca', `check: 5 su 8 e tre voci da sistemare o verificare (${JSON.stringify(ch)})`);
            await ctx.close();
        }
        ok(esterne.length === 0, `zero richieste esterne per disegnare la pagina (${esterne.slice(0, 3).join(' | ')})`);
    } finally { await b.close(); srv.close(); }
}

console.log(`egidi: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
