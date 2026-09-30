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
// Quarta direzione (v4, «ancora di meglio»): palette Inchiostro (notte
// #111D36 che si distingue davvero dal nero BOOM), tabellone meccanico con le
// palette che cadono una per una (e un orologio vero), e il metodo recitato da
// un appartamento in WebGL (three.js impacchettato qui, caricato solo quando
// serve, con poster al posto suo quando il telefono non regge o chi legge non
// vuole movimento). Il 3D è un'illustrazione dichiarata: i numeri che stampa
// la pagina (85,6 m², 107 m²) vengono dalla STESSA pianta della scena.
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
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
// Oro solo su fondi scuri (BOOM, notte), mai su carta: ogni regola che scrive
// in oro sta dentro un contenitore nero o porta il proprio fondo nero.
const oro = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /(^|;)\s*(color|--ink-su):\s*(var\(--oro\)|#FFD700)/i.test(m[2])).map((m) => ({ sel: m[1].trim(), fondo: /background:(#060607|var\(--boom\))/.test(m[2]) }));
ok(oro.length > 0 && oro.every((r) => r.fondo || /casa-boom|\.atto-5|a-boom|i-boom|m3d-pin/.test(r.sel)), `testo oro solo su fondi scuri (${oro.map((r) => r.sel).join(' | ')})`);
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
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (h) => h.replace('#', '').match(/\w\w/g).map((x) => lin(parseInt(x, 16) / 255));
const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// OKLab, per sapere se due scuri si distinguono a occhio (la notte dal nero BOOM)
const oklab = (h) => { const [r, g, b] = rgb(h); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s2, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s2, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s2]; };
const dE = (a, b) => { const [p, q] = [oklab(a), oklab(b)]; return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const tok = Object.fromEntries([...css.match(/:root\{[^}]*\}/)[0].matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const pieno = (v) => ({ ...v, 'hero-fondo': v['hero-fondo'] && v['hero-fondo'].startsWith('#') ? v['hero-fondo'] : v.notte, 'hero-testo': v['hero-testo'] && v['hero-testo'].startsWith('#') ? v['hero-testo'] : '#FFFFFF', 'hero-sec': v['hero-sec'] && v['hero-sec'].startsWith('#') ? v['hero-sec'] : v.nebbia });
const nomi = ['inchiostro', ...[...css.matchAll(/data-colore=(\w+)\]\{/g)].map((m) => m[1])];
const varianti = [tok, ...[...css.matchAll(/data-colore=\w+\]\{([^}]*)\}/g)].map((m) => ({ ...tok, ...Object.fromEntries([...m[1].matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map((x) => [x[1], x[2]])) }))].map(pieno);
ok(varianti.length === 3 && nomi.join(',') === 'inchiostro,persiana,travertino', `tre palette: inchiostro in produzione, persiana e travertino solo in anteprima (${nomi.join(', ')})`);
ok(/\^\(travertino\|persiana\)\$/.test(html) && /classList\.contains\('anteprima'\) && \/\^/.test(html), 'le varianti si accendono solo in anteprima, con ?c= fra quelle dichiarate');
varianti.forEach((v, i) => {
    const n = nomi[i];
    ok(cr('#FFFFFF', v.accento) >= 4.5, `${n}: bianco su accento ${v.accento} (bottoni): ${cr('#FFFFFF', v.accento).toFixed(2)}`);
    ok(cr(v.accento, v.carta) >= 4.5, `${n}: accento ${v.accento} su carta (etichette piccole): ${cr(v.accento, v.carta).toFixed(2)}`);
    for (const k of ['nebbia', 'luce', 'accento-chiaro']) ok(cr(v[k], v.notte) >= 4.5, `${n}: ${k} su notte ${v.notte}: ${cr(v[k], v.notte).toFixed(2)}`);
    ok(cr(v.nebbia, v['notte-2']) >= 4.5, `${n}: nebbia su notte-2 (le carte del metodo): ${cr(v.nebbia, v['notte-2']).toFixed(2)}`);
    ok(cr(v['hero-testo'], v['hero-fondo']) >= 7 && cr(v['hero-sec'], v['hero-fondo']) >= 4.5, `${n}: testo dell'hero su ${v['hero-fondo']} (${cr(v['hero-testo'], v['hero-fondo']).toFixed(2)} · ${cr(v['hero-sec'], v['hero-fondo']).toFixed(2)})`);
    ok(cr(v.ink, v.carta) >= 7 && cr(v.grigio, v.carta) >= 4.5, `${n}: inchiostro e grigio su carta (${cr(v.ink, v.carta).toFixed(2)} · ${cr(v.grigio, v.carta).toFixed(2)})`);
    ok(dE(v.notte, tok.boom) >= 11, `${n}: la notte ${v.notte} si distingue dal nero BOOM (ΔE_OK ${dE(v.notte, tok.boom).toFixed(1)} ≥ 11): il passaggio dell'atto 5 si vede`);
});
for (const [fg, bg, cosa] of [[tok['ink-su'], tok['flap-su'], 'lettere del tabellone'], [tok['ink-giu'], tok['flap-giu'], 'metà bassa delle palette'], ['#FFD700', '#141416', 'AFFITTARE in oro sulla palette'], [tok.boom, tok.oro, 'nero su oro (pin BOOM)'], [tok.oro, tok.boom, 'oro su nero BOOM'], [tok.luce, tok.boom, 'testo sulla casa BOOM'], [tok.nebbia, tok.cassa, 'intestazioni del tabellone']]) {
    ok(cr(fg, bg) >= 4.5, `contrasto ${cosa}: ${fg} su ${bg}: ${cr(fg, bg).toFixed(2)}`);
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

// 9b. Il metodo in 3D: il pacchetto è quello dichiarato nel manifest, la
//     pagina chiede QUELLA versione, i poster ci sono e i numeri che la pagina
//     stampa escono dalla stessa pianta della scena.
const MAN = path.join(SITE, 'js', 'metodo3d.manifest.json'), BUNDLE = path.join(SITE, 'js', 'metodo3d.js');
let man = null; try { man = JSON.parse(readFileSync(MAN, 'utf8')); } catch { /* sotto */ }
const bundle = existsSync(BUNDLE) ? readFileSync(BUNDLE) : Buffer.alloc(0);
ok(man && bundle.length > 0, 'egidi/js/metodo3d.js e il suo manifest esistono');
const sha = createHash('sha256').update(bundle).digest('hex');
ok(man && man.sha256 === sha, 'il manifest dichiara lo sha256 del pacchetto vero (rigenerato con design/egidi-3d/build.mjs)');
const V3D = (html.match(/var V3D = '([0-9a-f]{8})'/) || [])[1];
ok(man && V3D === sha.slice(0, 8), `la pagina chiede la versione del pacchetto (V3D ${V3D} = ${sha.slice(0, 8)})`);
const versioni = [...html.matchAll(/\/(?:js\/metodo3d\.js|img\/metodo-\d\.webp)\?v=([0-9a-f]{8}|' \+ V3D)/g)].map((m) => m[1]);
ok(versioni.length >= 7 && versioni.every((v) => v === V3D || v === "' + V3D"), `ogni riferimento a pacchetto e poster porta ?v= della versione (${versioni.length})`);
ok(!/00000000/.test(html), 'nessuna versione segnaposto rimasta nella pagina');
ok(bundle.length <= 620000 && brotliCompressSync(bundle).length <= 140000, `pacchetto ≤ 620 KB e ≤ 140 KB brotli (${bundle.length} B · ${brotliCompressSync(bundle).length} B)`);
ok(man && man.three === '0.186.1', 'three.js alla versione fissata (0.186.1)');
const host = [...new Set([...bundle.toString('latin1').matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()))].filter((h) => !['www.w3.org', 'threejs.org', 'github.com', 'jcgt.org'].includes(h));
ok(host.length === 0, `il pacchetto non nomina server esterni (${host.join(', ')})`);
ok(existsSync(path.join(SITE, 'js', 'LICENSE-three.txt')) && /MIT License/.test(readFileSync(path.join(SITE, 'js', 'LICENSE-three.txt'), 'utf8')) && /three\.js authors/i.test(readFileSync(path.join(SITE, 'js', 'LICENSE-three.txt'), 'utf8')), 'licenza MIT di three.js accanto al pacchetto');
const webpDim = (b) => { if (b.subarray(0, 4).toString('latin1') !== 'RIFF' || b.subarray(8, 12).toString('latin1') !== 'WEBP') return null; const k = b.subarray(12, 16).toString('latin1'); if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]; if (k === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]; if (k === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; } return null; };
for (let n = 1; n <= 5; n++) {
    const f = path.join(SITE, 'img', `metodo-${n}.webp`), b = existsSync(f) ? readFileSync(f) : Buffer.alloc(0), d = webpDim(b);
    ok(d && d[0] === 1200 && d[1] === 900 && b.length <= 92160, `img/metodo-${n}.webp: WebP vero 1200×900, ≤ 90 KB (${d ? d.join('×') : 'non webp'} · ${b.length} B)`);
}
ok(/"source":"\/js\/\(\.\*\)"[^\]]*immutable/.test(JSON.stringify(vj)) && /"source":"\/img\/\(\.\*\)"[^\]]*immutable/.test(JSON.stringify(vj)), 'pacchetto e poster con cache lunga (immutable): la versione sta nella query');
ok(/html\.m3d-off \.atti\{/.test(css.replace(/\s+/g, ' ')) || /m3d-off \.atti/.test(css), 'senza 3D la sezione si accorcia (niente scroll a vuoto)');
ok(/prefers-reduced-motion: reduce/.test(html) && /saveData/.test(html) && /deviceMemory/.test(html) && /WebGL2RenderingContext/.test(html), 'il 3D si spegne da solo con movimento ridotto, risparmio dati, poca memoria o senza WebGL2');
ok(/Illustrazione · appartamento tipo, non in vendita/.test(html), 'il 3D si dichiara: illustrazione, appartamento tipo, non in vendita');
try {
    // egidi/ non ha un package.json di tipo module: Node leggerebbe il pacchetto come CommonJS. Una copia .mjs lo importa com'è.
    const tmp = path.join(tmpdir(), `egidi-metodo3d-${process.pid}.mjs`); writeFileSync(tmp, bundle);
    const M = await import(pathToFileURL(tmp).href); unlinkSync(tmp);
    const P = M.PIANTA || {};
    const netta = (P.netta || 0).toFixed(1).replace('.', ','), comm = P.commerciale;
    ok(html.includes(`${netta} m² calpestabili · circa ${comm} m² commerciali`), `la pagina stampa gli stessi metri della scena (${netta} m² · ${comm} m²)`);
    ok(Array.isArray(P.stanze) && P.stanze.length === 8 && Math.abs(P.stanze.reduce((a, x) => a + x.netta, 0) - P.netta) < 0.05, `otto stanze, e la somma fa la superficie netta (${(P.stanze || []).length})`);
    const posePagina = JSON.parse('[' + ((html.match(/var POSE = \[([^\]]+)\]/) || [])[1] || '') + ']');
    ok(typeof M.monta === 'function' && typeof M.rilievoX === 'function' && Array.isArray(M.POSE) && M.POSE.length === 5 && M.POSE.every((x, k) => Math.abs(x - posePagina[k]) < 1e-9), `il pacchetto esporta monta, rilievoX e le stesse pose della pagina (${M.POSE} · ${posePagina})`);
} catch (e) { ok(false, 'il pacchetto si importa in Node senza toccare il DOM: ' + e.message); }

// 10. Nel browser vero: nessun errore, niente scroll laterale, leggibile senza JS.
const chromium = await loadChromium();
if (!chromium) {
    console.log('  (browser: SKIP — playwright non disponibile)');
} else {
    const TIPI = { '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json' };
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
        // di norma senza 3D (?m3d=0): il WebGL si prova a parte, una volta, perché in un runner è lento
        const apri = async (w, { js = true, h = 844, rm = 'no-preference', q = '?m3d=0', blocca = null } = {}) => {
            const ctx = await b.newContext({ viewport: { width: w, height: h }, javaScriptEnabled: js, reducedMotion: rm });
            await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (rt) => { esterne.push(rt.request().url()); rt.abort(); });
            if (blocca) await ctx.route(blocca, (rt) => rt.fulfill({ status: 404, body: '' }));
            const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
            await p.goto(url + q, { waitUntil: 'load' }); await p.waitForTimeout(300);
            return { ctx, p, errs };
        };
        const parole = () => [...document.querySelectorAll('#tabellone .riga')].map((r) => [...r.querySelectorAll('.celle .f')].map((x) => x.getAttribute('data-c') ?? x.textContent).join('').replace(/ /g, ' ').trim() + '=' + r.dataset.parola);
        for (const [w, js] of [[320, true], [390, true], [1440, true], [390, false]]) {
            const { ctx, p, errs } = await apri(w, { js, q: js ? '?m3d=0' : '' });
            const m = await p.evaluate((parole) => ({
                sw: document.documentElement.scrollWidth, iw: innerWidth,
                anteprimaVisibili: [...document.querySelectorAll('.solo-anteprima')].filter((e) => e.getClientRects().length).length,
                segnapostoFuori: [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /DA FORNIRE|VERIFICARE|PASSO 4/.test(e.textContent) && !e.closest('.solo-anteprima')).length,
                marchioRighe: Math.round(document.querySelector('.marchio b').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('.marchio b')).lineHeight === 'normal' ? getComputedStyle(document.querySelector('.marchio b')).fontSize * 1.3 : getComputedStyle(document.querySelector('.marchio b')).lineHeight)),
                parole: new Function('return (' + parole + ')()')(),
                atti: [...document.querySelectorAll('.atto')].filter((a) => a.getClientRects().length && +getComputedStyle(a).opacity > 0.99).length,
                poster: [...document.querySelectorAll('noscript')].length
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
                const img = await p.evaluate(() => [...document.querySelectorAll('.atto noscript')].map((n) => n.innerHTML + n.textContent).join(' ') + [...document.querySelectorAll('.atto img')].map((i) => i.getAttribute('src')).join(' '));
                ok(new Set(img.match(/metodo-\d\.webp/g) || []).size === 5, `${tag}: ogni atto ha il suo poster anche senza JS`);
            }
            await ctx.close();
        }
        // Test dei 5 secondi a 390×844 e la piega: sopra la barra WhatsApp si legge
        // chi siamo, dove, che per affittare c'è BOOM; il bottone sta sopra la piega.
        {
            const { ctx, p } = await apri(390);
            const r = await p.evaluate(() => {
                const s = document.querySelector('.hero .sotto'), t = document.querySelector('.titolo'), wa = document.querySelector('.wa-fissa');
                return { fondo: s.getBoundingClientRect().bottom, boom: document.querySelector('.riga.a-boom').getBoundingClientRect().bottom, bar: wa.classList.contains('nascosta') ? innerHeight : wa.getBoundingClientRect().top, btn: document.querySelector('.hero-basso .btn').getBoundingClientRect().bottom, testo: s.textContent, sx: Math.min(s.getBoundingClientRect().left, t.getBoundingClientRect().left) };
            });
            ok(r.fondo <= r.bar, `390px: la tesi sta sopra la piega (${Math.round(r.fondo)} ≤ ${Math.round(r.bar)})`);
            ok(r.boom <= r.bar, `390px: la riga AFFITTARE → BOOM sta sopra la barra WhatsApp (${Math.round(r.boom)} ≤ ${Math.round(r.bar)})`);
            ok(r.btn <= 828, `390×844: il bottone «Candida» sta sopra la piega (${Math.round(r.btn)} ≤ 828)`);
            ok(/Valentino Egidi Immobiliare/.test(r.testo) && /Roma/.test(r.testo) && /BOOM/.test(r.testo), '390px: brand, Roma e BOOM nella tesi');
            ok(r.sx >= 16, `390px: margine sinistro ${Math.round(r.sx)}px ≥ 16`);
            await ctx.close();
        }
        {
            const { ctx, p } = await apri(1440, { h: 900 });
            const y = await p.evaluate(() => document.querySelector('.hero-basso .btn').getBoundingClientRect().bottom);
            ok(y <= 860, `1440×900: il bottone «Candida» sta sopra la piega (${Math.round(y)} ≤ 860)`);
            await ctx.close();
        }
        // Niente salti mentre il tabellone gira: le celle hanno la loro misura dall'inizio.
        for (const [w, h] of [[1440, 900], [390, 844]]) {
            const ctx = await b.newContext({ viewport: { width: w, height: h } });
            await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (rt) => rt.abort());
            const p = await ctx.newPage();
            await p.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
            await p.goto(url + '?m3d=0', { waitUntil: 'load' }); await p.waitForTimeout(3500);
            const cls = await p.evaluate(() => window.__cls);
            ok(cls <= 0.02, `${w}px: CLS ${cls.toFixed(4)} ≤ 0,02 durante il giro del tabellone`);
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
        // Il tabellone: gira palette per palette, si posa sulle parole giuste,
        // AFFITTARE porta a BOOM in oro, «Ferma» posa subito (WCAG 2.2.2); finito
        // il giro il bottone offre di rifarlo. L'orologio dice l'ora di Roma.
        for (const w of [1440, 390]) {
            const { ctx, p } = await apri(w, { h: w > 900 ? 900 : 844 });
            const gira = await p.evaluate(() => new Promise((res) => setTimeout(() => res({ celle: document.querySelectorAll('#tabellone .riga .f.gira').length, an: document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#tabellone')).length }), 900)));
            ok(gira.celle > 0 && gira.an > 0, `${w}px: il tabellone gira all'apertura, con palette animate (${gira.celle} celle · ${gira.an} animazioni)`);
            const stop = await p.evaluate((parole) => { const f = document.getElementById('ferma'); f.click(); return { pressed: f.getAttribute('aria-pressed'), testo: f.textContent.trim(), dopo: new Function('return (' + parole + ')()')(), gira: document.querySelectorAll('#tabellone .riga .f.gira').length }; }, parole.toString());
            ok(stop.pressed === 'true' && stop.gira === 0 && stop.dopo.every((x) => x.split('=')[0] === x.split('=')[1]), `${w}px: «Ferma» posa subito le parole (${stop.dopo.join(' ')})`);
            ok(/Riavvia/.test(stop.testo), `${w}px: fermo, il bottone dice «Riavvia»`);
            const riparte = await p.evaluate(() => { const f = document.getElementById('ferma'); f.click(); return new Promise((res) => setTimeout(() => res({ pressed: f.getAttribute('aria-pressed'), gira: document.querySelectorAll('#tabellone .riga .f.gira').length }), 400)); });
            ok(riparte.pressed === 'false' && riparte.gira > 0, `${w}px: «Riavvia» lo fa ripartire (${riparte.gira} celle)`);
            await p.waitForTimeout(5200);
            const fine = await p.evaluate((parole) => ({ parole: new Function('return (' + parole + ')()')(), testo: document.getElementById('ferma').textContent.trim(), gira: document.querySelectorAll('#tabellone .f.gira').length }), parole.toString());
            ok(fine.gira === 0 && fine.parole.every((x) => x.split('=')[0] === x.split('=')[1]), `${w}px: si posa su VENDERE · COMPRARE · INVESTIRE · AFFITTARE (${fine.parole.join(' ')})`);
            ok(/Riavvia/.test(fine.testo), `${w}px: finito il giro, il bottone offre di rifarlo (${fine.testo})`);
            const boom = await p.evaluate(() => { const r = document.querySelector('.riga.a-boom'); return { href: r.getAttribute('href'), dest: r.querySelector('.dest').textContent, col: getComputedStyle(r.querySelector('.dest')).color, lettera: getComputedStyle(r.querySelector('.f .m')).color, altre: [...document.querySelectorAll('.riga:not(.a-boom)')].map((x) => x.querySelector('.dest').textContent) }; });
            ok(boom.dest === 'BOOM' && boom.col === 'rgb(255, 215, 0)' && /boomrome\.com\/owners\?utm_source=egidimmobiliare&utm_medium=referral&utm_campaign=tabellone/.test(boom.href), `${w}px: AFFITTARE → BOOM, in oro, con gli UTM`);
            ok(boom.altre.every((x) => x === 'Valentino Egidi'), `${w}px: le altre partenze vanno a Valentino Egidi`);
            const ora = await p.evaluate(() => ({ sr: document.querySelector('#orologio .sr').textContent, celle: [...document.querySelectorAll('#orologio .f')].map((f) => f.getAttribute('data-c')).join(''), roma: new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(/\D/g, '') }));
            ok(ora.celle === ora.roma && ora.sr === `Ora di Roma ${ora.roma.slice(0, 2)}:${ora.roma.slice(2)}`, `${w}px: l'orologio del tabellone segna l'ora di Roma (${ora.celle} · ${ora.sr})`);
            await ctx.close();
        }
        // «Ferma» si ricorda: chi l'ha fermato non se lo ritrova in moto alla visita dopo.
        {
            const { ctx, p } = await apri(1440, { h: 900 });
            await p.evaluate(() => document.getElementById('ferma').click());
            await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(600);
            const r = await p.evaluate((parole) => ({ gira: document.querySelectorAll('#tabellone .f.gira').length, parole: new Function('return (' + parole + ')()')(), pressed: document.getElementById('ferma').getAttribute('aria-pressed') }), parole.toString());
            ok(r.gira === 0 && r.pressed === 'true' && r.parole.every((x) => x.split('=')[0] === x.split('=')[1]), 'fermato una volta, alla visita dopo il tabellone resta fermo');
            await ctx.close();
        }
        // Movimento ridotto: niente tabellone che gira, niente bottone inutile, niente 3D.
        {
            const { ctx, p, errs } = await apri(1440, { h: 900, rm: 'reduce', q: '' });
            const r = await p.evaluate((parole) => ({ ferma: getComputedStyle(document.getElementById('ferma')).display, parole: new Function('return (' + parole + ')()')(), m3d: document.documentElement.classList.contains('m3d-off'), an: document.getAnimations().filter((a) => a.playState === 'running' && !(a.animationName === 'barra')).length }), parole.toString());
            ok(r.ferma === 'none', 'movimento ridotto: il bottone «Ferma» non serve e non si vede');
            ok(r.parole.every((x) => x.split('=')[0] === x.split('=')[1]), 'movimento ridotto: le parole sono già al loro posto');
            ok(r.m3d, 'movimento ridotto: il metodo usa i poster, niente WebGL');
            ok(r.an === 0 && errs.length === 0, `movimento ridotto: nessuna animazione in corso (${r.an})`);
            await ctx.close();
        }
        // Il metodo senza 3D: lo scroll VERO porta ogni atto sulla sua posa, il testo
        // giusto si accende, il poster cambia, all'ultimo atto il fondo diventa BOOM.
        for (const [w, h] of [[1440, 900], [390, 844]]) {
            const { ctx, p } = await apri(w, { h });
            const g = await p.evaluate(() => ({ top: document.getElementById('atti').offsetTop, alt: document.getElementById('atti').offsetHeight, pose: window.__metodo ? [0.85, 1.70, 2.48, 3.85, 4.85].map((t) => window.__metodo.pDaT(t)) : null }));
            ok(g.pose && g.alt / h > 3.5 && g.alt / h < 5, `${w}px: senza 3D il metodo dura ${(g.alt / h).toFixed(1)} schermi (non 6,8)`);
            const visti = [];
            for (let i = 0; i < 5; i++) {
                await p.evaluate(([y]) => scrollTo(0, y), [g.top + g.pose[i] * (g.alt - h) + 1]); await p.waitForTimeout(260);
                visti.push(await p.evaluate(() => ({ T: window.__metodo.T(), su: [...document.querySelectorAll('.atto')].map((a) => +a.style.opacity > 0.99 ? 1 : 0).join(''), poster: (document.getElementById('poster3d').getAttribute('src').match(/metodo-(\d)/) || [])[1], segni: document.querySelectorAll('.binario a.su').length, s5: document.getElementById('metodo').classList.contains('s5'), testata: document.getElementById('testata').className })));
            }
            ok(visti.every((v, i) => Math.abs(v.T - [0.85, 1.70, 2.48, 3.85, 4.85][i]) < 0.02), `${w}px: lo scroll porta ogni atto sulla sua posa (${visti.map((v) => v.T.toFixed(2)).join(' ')})`);
            ok(visti.map((v) => v.su).join(' ') === '10000 01000 00100 00010 00001', `${w}px: un atto per volta nel testo (${visti.map((v) => v.su).join(' ')})`);
            ok(visti.map((v) => v.poster).join('') === '12345', `${w}px: il poster segue l'atto (${visti.map((v) => v.poster).join('')})`);
            ok(visti.map((v) => v.segni).join('') === '12345', `${w}px: il binario segna gli atti fatti`);
            ok(visti.slice(0, 4).every((v) => !v.s5 && v.testata === 'scura') && visti[4].s5 && visti[4].testata === 'boom', `${w}px: testata scura sul metodo, nera BOOM all'ultimo atto (${visti.map((v) => v.testata).join(' ')})`);
            const salto = await p.evaluate(async () => { document.querySelectorAll('.binario a')[2].click(); await new Promise((r) => setTimeout(r, 900)); return window.__metodo.T(); });
            ok(Math.abs(salto - 2.48) < 0.05, `${w}px: un tocco sul binario porta all'atto (T ${salto.toFixed(2)})`);
            await ctx.close();
        }
        // Il metodo in WebGL, una volta sola (è lento in un runner senza GPU):
        // la scena si monta, disegna, recita l'atto e aggancia etichette e pin.
        // Se il pacchetto non arriva, i poster prendono il posto senza errori.
        {
            const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
            await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (rt) => { esterne.push(rt.request().url()); rt.abort(); });
            const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
            await p.goto(url + '?m3d=forza', { waitUntil: 'load' });
            await p.evaluate(() => document.getElementById('metodo').scrollIntoView());
            const pronto = await p.waitForFunction(() => document.documentElement.classList.contains('m3d-pronto') || document.documentElement.classList.contains('m3d-ripiego'), null, { timeout: 90000 }).then(() => p.evaluate(() => document.documentElement.className)).catch(() => 'tempo scaduto');
            if (/m3d-pronto/.test(pronto)) {
                const r = await p.evaluate(async () => {
                    const M = window.__metodo; M.vai(0.85);
                    const t = document.getElementById('tela3d'), c = document.createElement('canvas'); c.width = 64; c.height = 40; const g = c.getContext('2d'); g.drawImage(t, 0, 0, 64, 40);
                    const px = g.getImageData(0, 0, 64, 40).data; let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 20) n++;
                    const i1 = M.scena().info(), eti = document.querySelectorAll('.m3d-eti.accesa').length;
                    // l'opacità CALCOLATA, non la classe: una regola più pesante può tenere spento un pin «acceso»
                    const visto = async (sel, t) => { const e = document.querySelector(sel); for (let k = 0; k < 16; k++) { M.vai(t); await new Promise((ok) => setTimeout(ok, 160)); if (e.classList.contains('acceso') && +getComputedStyle(e).opacity > 0.9) return true; } return 'T ' + M.T().toFixed(2) + ' ' + e.className + ' op ' + getComputedStyle(e).opacity; };
                    const nc = await visto('.m3d-pin[data-pin=noncombacia]', 1.63);
                    M.vai(1.5); const fatti = document.querySelectorAll('#lista3d li.fatto').length;
                    const mirino = await visto('#mirino3d', 2.48);
                    const boom = await visto('.m3d-pin.boom', 4.85);
                    return { pieni: n / (64 * 40), info: i1, eti, nc, fatti, mirino, boom, tag: getComputedStyle(document.querySelector('.m3d-tag')).display };
                });
                ok(r.pieni > 0.2, `3D: la scena disegna davvero (${Math.round(r.pieni * 100)}% della tela)`);
                ok(r.info.programs > 0 && r.info.programs <= 24 && r.info.calls > 0 && r.info.calls <= 160, `3D: budget GPU (programmi ${r.info.programs} · chiamate ${r.info.calls} · triangoli ${r.info.tris})`);
                ok(r.eti >= 6, `3D: all'atto 1 le stanze si etichettano sulla pianta (${r.eti})`);
                ok(r.nc === true && r.fatti === 4 && r.boom === true, `3D: «Non combacia» all'atto 2, documenti spuntati, «Oppure la affitta BOOM» all'atto 5, e si VEDONO (${r.nc} ${r.fatti} ${r.boom})`);
                ok(r.mirino === true, `3D: il mirino delle foto si vede durante lo scatto (${r.mirino})`);
                ok(r.tag !== 'none', '3D: il cartellino «Illustrazione» resta visibile');
            } else ok(false, `3D: con ?m3d=forza la scena si monta (${pronto})`);
            ok(errs.length === 0, `3D: nessun errore JS (${errs.join(' | ')})`);
            await ctx.close();
        }
        {
            const { ctx, p, errs } = await apri(1280, { h: 800, q: '?m3d=forza', blocca: /\/js\/metodo3d\.js/ });
            await p.evaluate(() => document.getElementById('metodo').scrollIntoView());
            const r = await p.waitForFunction(() => document.documentElement.classList.contains('m3d-ripiego'), null, { timeout: 15000 }).then(() => p.evaluate(() => ({ poster: getComputedStyle(document.getElementById('poster3d')).display, op: getComputedStyle(document.getElementById('poster3d')).opacity, fatti: document.querySelectorAll('#lista3d li.fatto').length }))).catch(() => null);
            ok(r && r.poster !== 'none' && +r.op > 0.9 && r.fatti === 4, `3D: se il pacchetto non arriva, restano i poster e le spunte (${JSON.stringify(r)})`);
            ok(errs.length === 0, `3D mancante: nessun errore JS (${errs.join(' | ')})`);
            await ctx.close();
        }
        // Testata: trasparente sull'hero, chiara sulla carta, scura sulle sezioni notte.
        {
            const { ctx, p } = await apri(1440, { h: 900 });
            const at = async (id) => { await p.evaluate((i) => scrollTo(0, document.getElementById(i).offsetTop + 200), id); await p.waitForTimeout(200); return p.evaluate(() => document.getElementById('testata').className); };
            const hero = await p.evaluate(() => document.getElementById('testata').className);
            const v = { hero, case: await at('case'), valentino: await at('valentino'), macchina: await at('macchina'), investire: await at('investire') };
            ok(v.hero === '' && v.case === 'chiara' && v.valentino === 'chiara' && v.macchina === 'scura' && v.investire === 'chiara', `testata: nulla sull'hero, chiara sulla carta, scura sulla notte (${JSON.stringify(v)})`);
            await ctx.close();
        }
        // La macchina: quattro schede, frecce da tastiera, niente in ciclo.
        {
            const { ctx, p, errs } = await apri(1440, { h: 900 });
            const r = await p.evaluate(async () => {
                const sl = (ms) => new Promise((res) => setTimeout(res, ms)), vis = () => [...document.querySelectorAll('[role=tabpanel]')].filter((x) => !x.hidden).map((x) => x.id).join(',');
                const o = { inizio: vis() };
                document.getElementById('tab-firma').focus(); document.getElementById('tab-firma').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await sl(50);
                o.freccia = vis() + '/' + document.activeElement.id;
                document.getElementById('tab-fasc').click(); await sl(50);
                const voci = [...document.querySelectorAll('#pan-fasc button[aria-pressed]')]; o.voci = voci.length; o.manca = voci.filter((x) => /MANCA/.test(x.textContent)).length;
                const m = voci.find((x) => /MANCA/.test(x.textContent)); m.click(); await sl(50); o.spunta = m.getAttribute('aria-pressed');
                o.cicli = document.getAnimations().filter((a) => a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity && a.effect.target && a.effect.target.closest && a.effect.target.closest('#macchina')).length;
                return o;
            });
            ok(r.inizio === 'pan-firma', `macchina: si apre sulla firma (${r.inizio})`);
            ok(r.freccia === 'pan-fasc/tab-fasc', `macchina: le frecce passano alla scheda dopo (${r.freccia})`);
            ok(r.voci === 6 && r.manca === 1 && r.spunta === 'true', `macchina: il fascicolo ha sei voci, una che manca, e si spunta (${r.voci} · ${r.manca} · ${r.spunta})`);
            ok(r.cicli === 0 && errs.length === 0, `macchina: niente che gira in ciclo (${r.cicli})`);
            await ctx.close();
        }
        // Il calcolo: aritmetica vera, nessun numero prima che il visitatore scriva,
        // e le palette dei risultati si posano sul numero giusto.
        {
            const { ctx, p } = await apri(390);
            const vuoto = await p.evaluate(() => document.getElementById('lordo').textContent);
            const c1 = await p.evaluate(() => { document.getElementById('esempio').click(); return ['lordo', 'netto', 'annuo'].map((k) => document.getElementById(k).textContent); });
            const c2 = await p.evaluate(() => { document.querySelector('input[name=regime][value="0.10"]').click(); return document.getElementById('netto').textContent; });
            ok(vuoto === '—', 'calcolo: nessun numero prima che il visitatore scriva');
            ok(c1.join('|') === '5,8%|4,6%|€ 14.400', `calcolo: 250.000 e 1.200 danno 5,8% lordo, 4,6% netto, € 14.400 (${c1.join('|')})`);
            ok(c2 === '5,2%', `calcolo: col concordato il netto sale al 5,2% (${c2})`);
            await p.waitForTimeout(3200);
            const pal = await p.evaluate(() => ['lordo', 'netto', 'annuo'].map((k) => [...document.querySelectorAll(`[data-cifra=${k}] .f`)].map((f) => f.getAttribute('data-c') || ' ').join('').trim() + '=' + document.getElementById(k).textContent));
            ok(pal.every((x) => x.split('=')[0] === x.split('=')[1]), `calcolo: le palette si posano sul risultato (${pal.join(' ')})`);
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
