// tests/consent/run.mjs
// IL CABLAGGIO GDPR NON PUÒ SPARIRE IN SILENZIO.
//
// L'11/08/2026 il commit 7965fff ("Lotto 5 — il cablaggio: il design nuovo
// sulle route vere, SEO/AI intatte") ha riscritto la testa di index.html,
// apartments.html, apartment-detail.html e altre: il blocco SEO è
// sopravvissuto, il cablaggio del consenso no. Risultato in produzione:
// la HOMEPAGE faceva partire GA4 senza `consent default`, quindi con
// consenso PIENO — cookie di analytics e advertising su ogni visitatore
// europeo, senza banner e senza opt-out. Il banner esisteva e funzionava
// (js/boom-consent.js, 42 pagine): semplicemente quelle pagine avevano
// smesso di caricarlo, e niente se ne accorgeva.
//
// La regola, in una riga: se una pagina carica gtag, DEVE negare il
// consenso di default E caricare il banner che può revocarlo. Le due cose
// insieme o nessuna delle due — negare senza banner significa non
// raccogliere mai nulla, caricare il banner senza negare significa aver
// già scritto i cookie prima che l'utente scelga.
//
//   node tests/consent/run.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

let pass = 0, fail = 0;
const ok = (c, what) => { if (c) { pass++; console.log(`  ✓ ${what}`); } else { fail++; console.log(`  ✗ ${what}`); } };

// Pagine che NON sono servite al pubblico: anteprime di lavorazione, versioni
// "classic" mai instradate, legacy che vercel.json redirige, archivio.
const IGNORED = /(^|\/)(preview-|motion-preview|pass-demo|\.journey-preview)|-classic\.html$|-legacy\.html$|^scripts\/|^design\/|^public\//;

// L'UNICA eccezione ammessa, e va motivata: /casa è una superficie
// autenticata (no-store + noindex in vercel.json). Nega il consenso e non
// mostra il banner, quindi non raccoglie nulla — stato sicuro e voluto.
const NO_BANNER_OK = new Set(['tenant.html']);

function htmlFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (e.endsWith('.html')) out.push(relative(ROOT, p));
  }
  return out;
}

const GTAG = /googletagmanager\.com\/gtag/;
const DEFAULT_DENIED = /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]/;
const ANALYTICS_DENIED = /analytics_storage\s*:\s*['"]denied['"]/;
const BANNER = /boom-consent\.js/;

const pages = htmlFiles(ROOT).filter((f) => !IGNORED.test(f)).sort();
const tracked = pages.filter((f) => GTAG.test(readFileSync(join(ROOT, f), 'utf8')));

console.log(`\n▸ le pagine pubbliche che caricano Google Analytics (${tracked.length})`);

const missingDefault = [], missingBanner = [];
for (const f of tracked) {
  const s = readFileSync(join(ROOT, f), 'utf8');
  if (!DEFAULT_DENIED.test(s) || !ANALYTICS_DENIED.test(s)) missingDefault.push(f);
  if (!BANNER.test(s) && !NO_BANNER_OK.has(f)) missingBanner.push(f);
}

ok(tracked.length > 0, `ne trova almeno una (altrimenti il test non sta guardando niente)`);
ok(missingDefault.length === 0,
  `tutte negano il consenso PRIMA di gtag('config')${missingDefault.length ? '\n      → ' + missingDefault.join('\n      → ') : ''}`);
ok(missingBanner.length === 0,
  `tutte caricano il banner che può concederlo${missingBanner.length ? '\n      → ' + missingBanner.join('\n      → ') : ''}`);

// Il banner senza il default è il difetto SPECULARE: i cookie sono già stati
// scritti quando l'utente vede la domanda.
const bannerNoDefault = tracked.filter((f) => {
  const s = readFileSync(join(ROOT, f), 'utf8');
  return BANNER.test(s) && !DEFAULT_DENIED.test(s);
});
ok(bannerNoDefault.length === 0,
  `nessuna mostra il banner dopo aver già scritto i cookie${bannerNoDefault.length ? '\n      → ' + bannerNoDefault.join('\n      → ') : ''}`);

console.log('\n▸ i generatori: una rigenerazione non può reintrodurre il difetto');

const gen = readFileSync(join(ROOT, 'scripts/neighborhoods-build.js'), 'utf8');
const genGtag = (gen.match(new RegExp(GTAG.source, 'g')) || []).length;
const genDefault = (gen.match(new RegExp(DEFAULT_DENIED.source, 'g')) || []).length;
const genBanner = (gen.match(new RegExp(BANNER.source, 'g')) || []).length;
ok(genGtag > 0, `neighborhoods-build.js inietta gtag (${genGtag} template)`);
ok(genDefault >= genGtag, `…e in OGNI template nega il consenso di default (${genDefault}/${genGtag})`);
ok(genBanner >= genGtag, `…e in OGNI template carica il banner (${genBanner}/${genGtag})`);

console.log('\n▸ chi dice al mondo chi siamo (JSON-LD)');

// 'BOOM Rome' è il MARCHIO; l'entità è Egidi Immobiliare S.r.l. Dichiarare
// titolare un soggetto inesistente contraddice il footer di ogni pagina, che
// da 08/2026 dice che BOOM® appartiene a questa società (MUE 019317594).
const wrongLegal = pages.filter((f) => /"legalName":\s*"BOOM Rome"/.test(readFileSync(join(ROOT, f), 'utf8')));
ok(wrongLegal.length === 0,
  `nessuna pagina dichiara "BOOM Rome" come ragione sociale${wrongLegal.length ? '\n      → ' + wrongLegal.join('\n      → ') : ''}`);

// Il segnaposto mandava da uno sconosciuto chi arrivava dal pannello Google.
const fakeWa = pages.filter((f) => /393331234567/.test(readFileSync(join(ROOT, f), 'utf8')));
ok(fakeWa.length === 0,
  `nessuna pagina pubblica un numero WhatsApp segnaposto${fakeWa.length ? '\n      → ' + fakeWa.join('\n      → ') : ''}`);

const seo = readFileSync(join(ROOT, 'scripts/seo-update.js'), 'utf8');
ok(/legalName:\s*'Egidi Immobiliare S\.r\.l\.'/.test(seo), 'seo-update.js timbra la ragione sociale VERA');
ok(!/393331234567/.test(seo), 'seo-update.js non porta più il numero segnaposto');

console.log(`\n${fail === 0 ? '✓' : '✗'} Consenso & identità: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
