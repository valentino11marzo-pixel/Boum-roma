// tests/zone/run.mjs — LE GUIDE DI QUARTIERE DICONO IL VERO (suite `zonepages`).
//
// IL REPERTO (ottobre 2026). Sulle undici guide /apartments-in/<zona>:
//   · ogni card e ogni voce dell'ItemList puntava a /apartments/<id> — una
//     rotta che non esiste: 404 per il cliente e per il motore che la cita;
//   · una casa in lista d'attesa (occupata, si libera fra mesi) veniva
//     dichiarata "InStock", cioe' libera ADESSO, a chiunque leggesse i dati
//     strutturati — la stessa bugia che dispo-engine e' nato per togliere;
//   · i canoni d'esempio erano «verified» senza alcuna misura dietro, con
//     percentuali fra zone («30% cheaper», «20–30% premium») mai calcolate;
//   · il piede portava a /deals, uno strumento interno dell'admin;
//   · la pagina di Ponte Milvio, in arrivo nella sitemap, non aveva il
//     contratto di scorrimento ne' consenso e tracker.
//
// Le regole, ognuna nata da uno di quei difetti:
//   1. link e ItemList su /listing/<id>, mai /apartments/<id>
//   2. la disponibilita' segue la corsia condivisa (js/dispo-engine.js):
//      eseguito DAVVERO lo script della pagina, con un Firestore finto, su
//      tutte le undici zone — InStock solo su «libera adesso», PreOrder con
//      la data su chi si prenota, niente su chi non si sa, fuori l'affittata
//   3. i canoni sono dichiarati indicativi e rimandano a /meteo, e nessuna
//      percentuale fra zone resta senza fonte
//   4. ogni risposta del FAQPage e' QUELLA visibile in pagina
//   5. il generatore e le pagine pubblicate sono la stessa cosa: una modifica
//      fatta solo a mano su una pagina si perderebbe alla prossima build, una
//      fatta solo nel generatore non arriverebbe mai in produzione
//
// Il controllo in Chromium (prati con una casa in lista d'attesa) si
// auto-skippa senza playwright; tutto il resto gira ovunque.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const verifica = (guai, buono, cattivo) => guai.length
  ? male(cattivo + '\n      ' + guai.slice(0, 12).join('\n      ') + (guai.length > 12 ? `\n      … e altri ${guai.length - 12}` : ''))
  : bene(buono);

const ZONE = ['trastevere', 'centro-storico', 'monti', 'prati', 'pigneto', 'testaccio',
  'ostiense', 'trieste-coppede', 'san-lorenzo', 'esquilino', 'ponte-milvio'];
const leggi = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const PAGINE = Object.fromEntries(ZONE.map((z) => [z, leggi(`apartments-in/${z}.html`)]));
const HUB = leggi('apartments-in/index.html');
const GEN = leggi('scripts/neighborhoods-build.js');
const DATI = leggi('scripts/neighborhoods-data.js');
const TUTTE = { ...Object.fromEntries(ZONE.map((z) => [`${z}.html`, PAGINE[z]])), 'index.html': HUB };

console.log('\n\x1b[1m▸ zonepages\x1b[0m  le guide di quartiere: ' + ZONE.length + ' zone + hub + generatore');

// ── 1 · i link portano alla scheda vera ─────────────────────────────────
{
  const guai = [];
  for (const [f, s] of [...Object.entries(TUTTE), ['neighborhoods-build.js', GEN]]) {
    if (s.includes("/apartments/'+")) guai.push(`${f} → card su /apartments/'+id`);
    if (s.includes('https://www.boomrome.com/apartments/"+')) guai.push(`${f} → ItemList su /apartments/"+id`);
  }
  for (const z of ZONE) {
    const s = PAGINE[z];
    if (!s.includes(`href="/listing/'+encodeURIComponent(l.id)+'"`)) guai.push(`${z} → la card non punta a /listing/<id>`);
    if ((s.match(/"https:\/\/www\.boomrome\.com\/listing\/"\+encodeURIComponent\(l\.id\)/g) || []).length !== 2)
      guai.push(`${z} → l'ItemList non dichiara /listing/<id> per voce e per item`);
  }
  verifica(guai, 'card e ItemList puntano a /listing/<id> (pagine e generatore)',
    'link che portano a una rotta inesistente (404):');
}

// ── 2 · la corsia condivisa, sul codice ─────────────────────────────────
{
  const guai = [];
  for (const [f, s] of [...ZONE.map((z) => [z, PAGINE[z]]), ['neighborhoods-build.js', GEN]]) {
    const i = s.indexOf('<script src="/js/dispo-engine.js"></script>');
    const j = s.indexOf('firebase-firestore-compat.js');
    const k = s.indexOf('loadZoneListings');
    if (i < 0) guai.push(`${f} → non carica /js/dispo-engine.js`);
    else if (!(j < i && i < k)) guai.push(`${f} → dispo-engine non sta fra firestore-compat e lo script delle card`);
    if (/"@type":"Offer"[^}]*"availability":"https:\/\/schema\.org\/InStock"/.test(s))
      guai.push(`${f} → l'Offer dichiara InStock senza condizione`);
    if (!/m\.lane===\\?'now'&&!m\.dateUnreadable\)return \{"availability":"https:\/\/schema\.org\/InStock"\}/.test(s))
      guai.push(`${f} → InStock non e' legato a lane now + data leggibile`);
    if (!/"availability":"https:\/\/schema\.org\/PreOrder","availabilityStarts":m\.iso/.test(s))
      guai.push(`${f} → manca PreOrder con availabilityStarts`);
  }
  verifica(guai, 'ogni zona carica dispo-engine e l\'ItemList non dichiara InStock a prescindere',
    'disponibilita\' dichiarata senza la corsia:');
}

// ── 3 · /deals e' uno strumento interno ─────────────────────────────────
{
  const guai = [];
  for (const [f, s] of [...Object.entries(TUTTE), ['neighborhoods-build.js', GEN]]) {
    if (/Current Deals|href="\/deals"/.test(s)) guai.push(f);
  }
  verifica(guai, 'nessun link a /deals (strumento admin) nelle guide, hub compreso',
    'link pubblici a /deals:');
}

// ── 4 · l'organizzazione e' Egidi Immobiliare ───────────────────────────
{
  const guai = [];
  for (const [f, s] of Object.entries(TUTTE)) {
    let org = null;
    for (const m of s.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
      let d; try { d = JSON.parse(m[1]); } catch { guai.push(`${f} → JSON-LD che non parsa`); continue; }
      for (const n of (d['@graph'] || [d])) if (n['@id'] === 'https://www.boomrome.com/#organization') org = n;
    }
    if (!org) { guai.push(`${f} → nessun nodo #organization`); continue; }
    const a = org.address || {};
    if (org.legalName !== 'Egidi Immobiliare S.r.l.') guai.push(`${f} → legalName ${org.legalName}`);
    if (org.vatID !== 'IT17322991005') guai.push(`${f} → vatID ${org.vatID}`);
    if (org.telephone !== '+39-331-325-1961') guai.push(`${f} → telephone ${org.telephone}`);
    if (a.streetAddress !== 'Via dei Coronari 181/184' || a.postalCode !== '00186'
      || a.addressLocality !== 'Roma' || a.addressRegion !== 'RM' || a.addressCountry !== 'IT')
      guai.push(`${f} → indirizzo ${JSON.stringify(a)}`);
  }
  verifica(guai, '#organization: Egidi Immobiliare S.r.l., P.IVA, telefono e sede di Via dei Coronari',
    'entita\' organizzazione sbagliata:');
}

// ── 5 · una risposta dichiarata e' la risposta in pagina ────────────────
const testo = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();
{
  const guai = [];
  for (const z of ZONE) {
    const s = PAGINE[z];
    const visibili = new Map();
    for (const m of s.matchAll(/<summary class="faq-q">([\s\S]*?)<\/summary><div class="faq-a">([\s\S]*?)<\/div><\/details>/g))
      visibili.set(testo(m[1]), testo(m[2]));
    let faq = null;
    for (const m of s.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
      try { const d = JSON.parse(m[1]); if (d['@type'] === 'FAQPage') faq = d; } catch { /* sopra */ }
    }
    if (!faq) { guai.push(`${z} → nessun FAQPage`); continue; }
    if (faq.mainEntity.length !== visibili.size) guai.push(`${z} → ${faq.mainEntity.length} domande dichiarate, ${visibili.size} in pagina`);
    for (const q of faq.mainEntity) {
      const v = visibili.get(testo(q.name));
      if (v === undefined) guai.push(`${z} → «${q.name}» non e' in pagina`);
      else if (v !== testo(q.acceptedAnswer.text)) guai.push(`${z} → «${q.name}»: risposta dichiarata ≠ risposta visibile`);
    }
  }
  verifica(guai, 'ogni risposta del FAQPage e\' identica a quella visibile in pagina',
    'FAQPage che dice altro dalla pagina:');
}

// ── 6 · i canoni sono indicativi, e lo dicono ───────────────────────────
const RANGE_SENZA = 'Asking rents for a mid-term 1-bedroom here vary widely with the building and the floor; BOOM\'s current homes in this zone are listed on this page with their exact rent, and measured asking rents per m² are at boomrome.com/meteo where the sample allows.';
const INDICATIVO = 'Indicative asking range from BOOM, not a measured statistic. Measured asking rents per m² for zones with enough listings: boomrome.com/meteo.';
// Centro, Trieste, Trastevere e Prati: il catalogo BOOM smentisce il
// pavimento della forchetta (bilocali del Centro a €1.200–1.500, un bilocale
// a Trieste a €2.000, il Bilocale Trastevere a €1.200 «Available now» sotto
// un «1-Bed Rent €1,400–€2,200», il Prati cozy a €1.500 sotto «€1,600–€2,600»).
// La forchetta non si scrive da nessuna parte: ne' in testa, ne' nella card
// dell'hub, ne' nel Place, che un motore legge come un dato, ne' nella FAQ.
const SENZA_FORCHETTA = ['centro-storico', 'trieste-coppede', 'trastevere', 'prati'];
{
  const guai = [];
  const { NEIGHBORHOODS } = require(path.join(R, 'scripts/neighborhoods-data.js'));
  const perSlug = Object.fromEntries(NEIGHBORHOODS.map((n) => [n.slug, n]));
  const hubRent = Object.fromEntries([...HUB.matchAll(/href="\/apartments-in\/([a-z-]+)">\s*<div class="hub-card-head">\s*<span class="hub-card-name">[^<]*<\/span>\s*<span class="hub-card-rent">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]));
  for (const z of ZONE) {
    const s = PAGINE[z];
    if (/verified [12](?:–2)? ?-?bedroom/i.test(s)) guai.push(`${z} → «verified N-bedroom» senza una verifica dietro`);
    if (!s.includes('<div class="stat-note">Indicative asking range · <a href="/meteo">measured market data →</a></div>'))
      guai.push(`${z} → il canone in testa non e' dichiarato indicativo con il rimando a /meteo`);
    const senza = SENZA_FORCHETTA.includes(z);
    // anche il Place lo dice: un motore legge il dato strutturato, non l'etichetta
    let place = 0;
    for (const m of s.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
      let d; try { d = JSON.parse(m[1]); } catch { continue; }
      if (d['@type'] !== 'Place') continue;
      place++;
      const p = (d.additionalProperty || []).find((x) => /rent/i.test(x.name));
      if (senza) { if (p) guai.push(`${z} → il Place dichiara una forchetta che il catalogo smentisce: ${p.minValue}–${p.maxValue}`); }
      else if (!p || !/^Indicative asking rent/.test(p.name)) guai.push(`${z} → il Place dichiara il canone come un dato: ${p && p.name}`);
    }
    if (place !== 1) guai.push(`${z} → ${place} nodi Place`);
    const testa = (s.match(/<div class="stat-value">([^<]*)<\/div><div class="stat-label">1-Bed Rent/) || [])[1];
    if (senza) {
      if (testa !== 'Varies by building') guai.push(`${z} → in testa «${testa}», non «Varies by building»`);
      if (hubRent[z] !== 'See listings') guai.push(`${z} → la card dell'hub dice «${hubRent[z]}», non «See listings»`);
    } else {
      if (!/^€[\d,]+–€[\d,]+$/.test(testa || '')) guai.push(`${z} → in testa «${testa}», non una forchetta`);
      if (hubRent[z] !== testa) guai.push(`${z} → la card dell'hub (${hubRent[z]}) ≠ la testa (${testa})`);
    }
    const n = perSlug[z];
    if (!n) { guai.push(`${z} → assente da neighborhoods-data.js`); continue; }
    if (!!n.rentRangeUnreliable !== senza) guai.push(`${z} → rentRangeUnreliable nei dati = ${!!n.rentRangeUnreliable}, atteso ${senza}`);
    const rent = n.faqs.filter((f) => /€|rent|cost/i.test(f.q) && /\/month|rents/.test(f.a));
    const atteso = senza ? RANGE_SENZA : INDICATIVO;
    // la FAQ non rimette la forchetta che la testa ha tolto
    if (senza && rent.some((f) => /€\s?[\d,.]+\s*[–-]\s*€?\s?[\d,.]+/.test(f.a))) guai.push(`${z} → la FAQ sul canone dichiara ancora una forchetta`);
    if (!rent.some((f) => f.a.endsWith(atteso))) guai.push(`${z} → la risposta sul canone non chiude con la dichiarazione attesa`);
    if (!s.includes(atteso)) guai.push(`${z} → la pagina non porta la dichiarazione sul canone`);
  }
  if (/verified [12](?:–2)? ?-?bedroom/i.test(DATI)) guai.push('neighborhoods-data.js → «verified N-bedroom»');
  if (!GEN.includes('<div class="stat-note">Indicative asking range · <a href="/meteo">measured market data →</a></div>'))
    guai.push('neighborhoods-build.js → manca l\'etichetta sotto il canone');
  verifica(guai, 'canoni dichiarati indicativi, rimando a /meteo, nessun «verified» senza verifica; Centro, Trieste, Trastevere e Prati senza forchetta (testa, hub, Place, FAQ)',
    'canoni presentati come un dato misurato:');
}

// ── 7 · nessuna percentuale fra zone senza fonte ────────────────────────
// La regola del piano, piu' la sua sorella moltiplicativa: «half the rent»
// e «twice the rent» sono la stessa affermazione in altre parole.
const PERCENTO = /(\d+\s*[–-]\s*)?\d+\s*%\+?\s*(premium|cheaper|below|discount|better value|over|above|more|less)|\+\s*\d+\s*%/i;
const VOLTE = /\b(half|twice|double|triple)\s+the\s+rents?\b/i;
{
  const guai = [];
  const fonti = [...Object.entries(TUTTE), ['neighborhoods-data.js', DATI], ['neighborhoods-build.js', GEN]];
  for (const [f, s] of fonti) {
    s.split('\n').forEach((riga, i) => {
      const m = riga.match(PERCENTO) || riga.match(VOLTE);
      if (m) guai.push(`${f}:${i + 1} → «${m[0]}»`);
    });
  }
  verifica(guai, 'nessuna percentuale o multiplo di canone fra zone senza una fonte',
    'confronti di canone inventati:');
}

// ── 8 · titoli e descrizioni dentro i limiti, una sola descrizione ──────
{
  const guai = [];
  for (const [f, s] of Object.entries(TUTTE)) {
    const h = s.slice(0, s.indexOf('</head>'));
    const t = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const d = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    const og = (h.match(/<meta property="og:description" content="([^"]*)"/) || [])[1];
    const tw = (h.match(/<meta name="twitter:description" content="([^"]*)"/) || [])[1];
    if (!t || t.length > 62) guai.push(`${f} → titolo ${t.length} car`);
    if (d.length < 110 || d.length > 165) guai.push(`${f} → descrizione ${d.length} car`);
    if (og !== d || tw !== d) guai.push(`${f} → og/twitter:description diverse dalla meta description`);
    if (/from €[\d,]+\/mo/.test(d)) guai.push(`${f} → descrizione con un canone minimo scritto a mano`);
  }
  const { NEIGHBORHOODS } = require(path.join(R, 'scripts/neighborhoods-data.js'));
  const esc = (x) => x.replace(/&/g, '&amp;');
  for (const n of NEIGHBORHOODS) {
    const s = PAGINE[n.slug] || '';
    if (!s.includes(`<title>${esc(n.metaTitle)}</title>`)) guai.push(`${n.slug} → metaTitle dei dati ≠ titolo pubblicato`);
    if (!s.includes(`<meta name="description" content="${esc(n.metaDescription)}">`)) guai.push(`${n.slug} → metaDescription dei dati ≠ pubblicata`);
  }
  verifica(guai, 'titoli ≤62, descrizioni 110–165 senza «from €X/mo», og/twitter allineati, dati = pagine',
    'titoli o descrizioni fuori regola:');
}

// ── 9 · Ponte Milvio e' pronta per la sitemap ───────────────────────────
{
  const guai = [];
  for (const [f, s] of Object.entries(TUTTE)) {
    if ((s.match(/<script defer src="\/js\/boom-consent\.js"><\/script>/g) || []).length !== 1) guai.push(`${f} → boom-consent.js non esattamente una volta`);
    if ((s.match(/<script defer src="\/js\/boom-track\.js"><\/script>/g) || []).length !== 1) guai.push(`${f} → boom-track.js non esattamente una volta`);
  }
  // GA4 senza consent default scrive _ga e _ga_<id> prima di qualunque
  // scelta: nello STESSO script, il default «denied» viene prima del config
  // (pagine e generatore: le due copie del template).
  for (const [f, s] of [...Object.entries(TUTTE), ['neighborhoods-build.js', GEN]]) {
    const tag = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((x) => /gtag\('config'/.test(x));
    if (!tag.length) guai.push(`${f} → nessun gtag('config')`);
    for (const x of tag) {
      const d = x.search(/gtag\('consent','default',\{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500\}\);/);
      if (d < 0 || d > x.indexOf("gtag('config'")) guai.push(`${f} → gtag('config') senza il consent default «denied» prima`);
    }
  }
  for (const z of ZONE) {
    const s = PAGINE[z];
    if (!s.includes('<!-- BOOM_SCROLL:START -->') || !s.includes('<!-- BOOM_SCROLL:END -->')) guai.push(`${z} → manca il contratto di scorrimento`);
    if ((s.match(new RegExp(`href="/book\\?zone=${z}"`, 'g')) || []).length !== 2) guai.push(`${z} → i due «Book a Viewing» non portano la zona`);
  }
  verifica(guai, 'ogni zona (Ponte Milvio compresa) ha scorrimento, consenso (default «denied» prima di gtag config), tracker e prenotazione con la zona',
    'pagine non pronte per la sitemap:');
}

// ── 10 · il generatore produce le pagine pubblicate ─────────────────────
// Il generatore NON si carica con require(): la sua sicurezza starebbe tutta
// nella guardia `require.main === module`, e senza quella guardia caricarlo
// riscriverebbe le dodici pagine (perdendo BOOM_SEO e BOOM_JSONLD) mentre il
// confronto, fatto sulle copie gia' lette, resterebbe verde. Si carica in un
// recinto: un fs che lancia a ogni scrittura, e un require che conosce solo
// path e i dati. Senza guardia il caricamento fallisce, mai scrive.
const SCRITTURA = /^(write|append|mkdir|rm|unlink|rename|copy|cp|truncate|symlink|link|chmod|chown|utimes|lchown|lutimes|futimes|fchmod|fchown|ftruncate|fsync|createWriteStream|promises)/;
const fsRecinto = new Proxy(fs, {
  get(t, k) {
    if (typeof k === 'string' && SCRITTURA.test(k))
      return () => { throw new Error(`il generatore ha tentato di scrivere (fs.${k})`); };
    const v = t[k];
    return typeof v === 'function' ? v.bind(t) : v;
  },
});
function caricaGeneratore(src) {
  const file = path.join(R, 'scripts/neighborhoods-build.js');
  const mod = { exports: {} };
  const req = (id) => {
    if (id === 'fs' || id === 'node:fs') return fsRecinto;
    if (id === 'path' || id === 'node:path') return path;
    if (id === './neighborhoods-data' || id === './neighborhoods-data.js') return require(path.join(R, 'scripts/neighborhoods-data.js'));
    throw new Error(`il generatore chiede un modulo fuori dal recinto: ${id}`);
  };
  req.main = null; // il modulo caricato qui non e' mai il principale
  const fn = vm.compileFunction(src, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: file });
  fn.call(mod.exports, mod.exports, req, mod, file, path.dirname(file));
  return mod.exports;
}
{
  const guai = [];
  if (!/^if \(require\.main === module\) \{$/m.test(GEN))
    guai.push('neighborhoods-build.js senza la guardia require.main: caricarlo riscriverebbe le pagine');
  // la trappola morde: tolta la guardia, il caricamento deve fallire e non scrivere
  let morde = false;
  try { caricaGeneratore(GEN.replace(/^if \(require\.main === module\) \{$/m, 'if (true) {')); }
  catch (e) { morde = /ha tentato di scrivere/.test(e.message); }
  if (!morde) guai.push('il recinto non ferma il generatore senza guardia');
  let gen = null;
  try { gen = caricaGeneratore(GEN); } catch (e) { guai.push('il generatore, caricato, esce dal recinto: ' + e.message); }
  const { NEIGHBORHOODS } = require(path.join(R, 'scripts/neighborhoods-data.js'));
  if (gen) {
    const anno = (x) => x.replace(/© \d{4} BOOM/, '© YYYY BOOM');
    // i due blocchi che scrive scripts/seo-update.js restano fuori dal confronto
    const pubblicata = (x) => anno(x
      .replace(/<!-- BOOM_SEO:START -->[\s\S]*?<!-- BOOM_SEO:END -->\n/, '')
      .replace(/<!-- BOOM_JSONLD:START -->[\s\S]*?<!-- BOOM_JSONLD:END -->\n/, ''));
    const prima = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
    for (const n of NEIGHBORHOODS) {
      if (!PAGINE[n.slug]) { guai.push(`${n.slug} → nei dati ma non pubblicata`); continue; }
      const a = anno(gen.pageHtml(n, NEIGHBORHOODS)), b = pubblicata(PAGINE[n.slug]);
      if (a !== b) { const i = prima(a, b); guai.push(`${n.slug} → diverge: «${b.slice(i, i + 60).replace(/\n/g, '⏎')}»`); }
    }
    const a = anno(gen.hubHtml()), b = pubblicata(HUB);
    if (a !== b) { const i = prima(a, b); guai.push(`index → diverge: «${b.slice(i, i + 60).replace(/\n/g, '⏎')}»`); }
  }
  if (NEIGHBORHOODS.length !== ZONE.length) guai.push(`i dati hanno ${NEIGHBORHOODS.length} zone, la suite ne conosce ${ZONE.length}`);
  verifica(guai, 'il generatore produce esattamente le pagine pubblicate (blocchi di seo-update a parte)',
    'generatore e pagine pubblicate divergono:');
}

// ── 10b · i blocchi di seo-update escono dal LORO generatore ────────────
// La 10 tiene fuori dal confronto BOOM_SEO e BOOM_JSONLD perche' li scrive
// scripts/seo-update.js, non neighborhoods-build.js: e cosi' niente legava il
// nodo Place al suo generatore. Il reperto (15/10/2026): la forchetta tolta a
// mano dal Place di Trastevere e Prati tornava al primo giro di seo-update,
// perche' neighborhoodJsonLd() non leggeva rentRangeUnreliable. Qui il
// generatore gira davvero, in una copia temporanea (mai sul repo), e le dodici
// pagine devono uscirne byte per byte identiche: una correzione fatta solo a
// mano sulla pagina si perderebbe al prossimo giro.
{
  const guai = [];
  const blocco = (x, nome) => (x.match(new RegExp(`<!-- ${nome}:START -->[\\s\\S]*?<!-- ${nome}:END -->`)) || [''])[0];
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zonepages-'));
  try {
    for (const d of ['scripts', 'apartments-in']) fs.cpSync(path.join(R, d), path.join(TMP, d), { recursive: true });
    const run = spawnSync(process.execPath, ['scripts/seo-update.js', 'apartments-in'], { cwd: TMP, encoding: 'utf8', timeout: 60000 });
    if (run.status !== 0) guai.push(`seo-update.js nella copia: exit ${run.status} ${(run.stderr || '').slice(0, 200)}`);
    else for (const [f, a] of Object.entries(TUTTE)) {
      const b = fs.readFileSync(path.join(TMP, 'apartments-in', f), 'utf8');
      if (a === b) continue;
      const dove = ['BOOM_SEO', 'BOOM_JSONLD'].filter((k) => blocco(a, k) !== blocco(b, k));
      const place = /"name": "Indicative asking rent/.test(blocco(b, 'BOOM_JSONLD')) && !/"name": "Indicative asking rent/.test(blocco(a, 'BOOM_JSONLD'));
      guai.push(`${f} → seo-update la riscrive (${dove.join(' + ') || 'fuori dai blocchi'})${place ? ': rimette la forchetta nel Place' : ''}`);
    }
  } finally { fs.rmSync(TMP, { recursive: true, force: true }); }
  verifica(guai, 'seo-update.js, rieseguito in una copia, lascia le dodici pagine identiche (il Place senza forchetta resta senza)',
    'seo-update.js riscriverebbe le guide di quartiere:');
}

// ── 11 · lo script delle card, eseguito davvero ─────────────────────────
// Firestore finto, motore vero, undici zone: si guarda cio' che la pagina
// scrive nella griglia e cio' che dichiara ai motori.
const giorni = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const FUTURA = giorni(200);
function catalogo(termine) {
  const base = { zone: termine, price: 1500, sqm: 60, bedrooms: 1, image: 'https://firebasestorage.googleapis.com/x.jpg' };
  return [
    { id: 'ora', ...base, name: 'Libera adesso', status: 'available' },
    { id: 'attesa', ...base, name: 'In lista', status: 'waitlist', availableDate: FUTURA },
    { id: 'attesa-muta', ...base, name: 'In lista senza data', status: 'waitlist' },
    { id: 'illeggibile', ...base, name: 'Data strana', status: 'available', availableDate: 'quando capita' },
    { id: 'affittata', ...base, name: 'Affittata', status: 'rented', availableDate: FUTURA },
    { id: 'contratto', ...base, name: 'Affittata col contratto', status: 'rented', availableFrom: FUTURA },
    { id: 'riservata', ...base, name: 'Riservata', status: 'reserved' },
    // stati che dispo-engine non conosce e che porterebbe in corsia «now»:
    // api/listing.js serve queste schede noindex «not on the market»
    { id: 'bozza', ...base, name: 'Bozza', status: 'draft' },
    { id: 'nascosta', ...base, name: 'Nascosta', status: 'hidden' },
    { id: 'archiviata', ...base, name: 'Archiviata', availabilityStatus: 'Archived' },
  ];
}
const DISPO_SRC = leggi('js/dispo-engine.js');
async function esegui(html) {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    .find((x) => x.includes('loadZoneListings'));
  const termini = (html.match(/data-zone-match="([^"]*)"/) || [])[1] || '';
  const griglia = { innerHTML: '', getAttribute: () => termini.replace(/&#39;/g, "'").replace(/&amp;/g, '&') };
  const aggiunti = [], errori = [];
  const ctx = {
    console: { error: (...a) => errori.push(a.map(String).join(' ')), log() {} },
    firebase: {
      initializeApp() {},
      firestore: () => ({ collection: () => ({ get: async () => ({
        docs: catalogo(termini.split('|')[0]).map((l) => ({ id: l.id, data: () => { const { id, ...r } = l; return r; } })) }) }) }),
    },
    document: {
      getElementById: () => griglia,
      head: { querySelectorAll: () => [], appendChild: (s) => aggiunti.push(s) },
      createElement: () => ({ setAttribute() {}, type: '', textContent: '' }),
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(DISPO_SRC, ctx);
  vm.runInContext(script, ctx);
  for (let i = 0; i < 20 && !aggiunti.length && !griglia.innerHTML.includes('listing-card'); i++) await new Promise((r) => setTimeout(r, 5));
  await new Promise((r) => setTimeout(r, 5));
  if (errori.length) throw new Error(errori.join(' · '));
  const ld = aggiunti.length ? JSON.parse(aggiunti[0].textContent) : null;
  return { griglia: griglia.innerHTML, ld };
}
{
  const guai = [];
  for (const z of ZONE) {
    let r;
    try { r = await esegui(PAGINE[z]); } catch (e) { guai.push(`${z} → lo script non gira: ${e.message}`); continue; }
    const href = [...r.griglia.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const card = new Set(href.filter((h) => h.startsWith('/listing/')).map((h) => h.slice(9)));
    if (href.some((h) => h.startsWith('/apartments/'))) guai.push(`${z} → card su /apartments/`);
    for (const id of ['ora', 'attesa', 'attesa-muta', 'illeggibile', 'contratto'])
      if (!card.has(id)) guai.push(`${z} → la casa «${id}» non ha la sua card /listing/${id}`);
    const FUORI = ['affittata', 'riservata', 'bozza', 'nascosta', 'archiviata'];
    for (const id of FUORI)
      if (card.has(id)) guai.push(`${z} → la casa «${id}» (non si affitta ne' si prenota) e' in vetrina`);
    if (/>(Bozza|Nascosta|Archiviata)</.test(r.griglia)) guai.push(`${z} → una casa fuori mercato e' nella griglia`);
    if (!/In lista<\/div><div class="listing-meta">[^<]*Free from /.test(r.griglia)) guai.push(`${z} → la card in lista d'attesa non dice da quando e' libera`);
    if (!/Data strana<\/div><div class="listing-meta">[^<]*Ask us for the date/.test(r.griglia)) guai.push(`${z} → una data illeggibile non chiede, promette`);
    if (/Data strana<\/div><div class="listing-meta">[^<]*Available now/.test(r.griglia)) guai.push(`${z} → una data illeggibile dice «Available now»`);
    if (!r.ld) { guai.push(`${z} → nessun ItemList`); continue; }
    const off = {};
    for (const e of r.ld.itemListElement) {
      const id = e.item.url.split('/listing/')[1];
      if (!e.url.startsWith('https://www.boomrome.com/listing/') || !e.item.url.startsWith('https://www.boomrome.com/listing/'))
        guai.push(`${z} → voce ItemList fuori da /listing/: ${e.url}`);
      if (e.item['@type'] !== 'Apartment' || !e.item.offers) guai.push(`${z} → voce ${id} senza forma Apartment+offers`);
      off[id] = e.item.offers || {};
    }
    for (const id of FUORI) if (id in off) guai.push(`${z} → la casa «${id}» e' nell'ItemList`);
    const av = (id) => off[id] && off[id].availability;
    if (av('ora') !== 'https://schema.org/InStock') guai.push(`${z} → la casa libera adesso non e' InStock`);
    if (av('attesa') !== 'https://schema.org/PreOrder' || off.attesa.availabilityStarts !== FUTURA)
      guai.push(`${z} → la lista d'attesa con data non e' PreOrder dal ${FUTURA}`);
    if (av('contratto') !== 'https://schema.org/PreOrder') guai.push(`${z} → l'affittata col contratto non e' PreOrder`);
    for (const id of ['attesa-muta', 'illeggibile'])
      if (av(id) !== undefined) guai.push(`${z} → «${id}» dichiara ${av(id)} senza saperlo`);
    if (Object.values(off).filter((o) => o.availability === 'https://schema.org/InStock').length !== 1)
      guai.push(`${z} → InStock su piu' di una casa`);
  }
  verifica(guai, 'eseguito su ' + ZONE.length + ' zone: card su /listing/<id>, InStock solo su «libera adesso», PreOrder con la data, nessuna dichiarazione su cio\' che non si sa, bozze/nascoste/archiviate fuori',
    'lo script della pagina dichiara una disponibilita\' falsa:');
}

// ── 12 · in un browser vero: prati con una casa in lista d'attesa ───────
const chromium = await loadChromium();
if (!chromium) {
  console.log('  SKIP: playwright non disponibile — il controllo in Chromium non gira');
} else {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const srv = http.createServer((rq, rs) => {
    const p = decodeURIComponent(rq.url.split('?')[0]);
    fs.readFile(path.join(R, p), (e, d) => e ? (rs.statusCode = 404, rs.end())
      : (rs.setHeader('content-type', MIME[path.extname(p)] || 'text/plain'), rs.end(d)));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const PORTA = srv.address().port;
  const DOC = { id: 'wl-prati-1', name: 'Bilocale Prati', zone: 'Prati', price: 1500, sqm: 55, bedrooms: 1, status: 'waitlist', availableDate: FUTURA };
  const FINTO_APP = `window.firebase={initializeApp(){},firestore(){return{collection(){return{get:async()=>({docs:[{id:${JSON.stringify(DOC.id)},data:()=>(${JSON.stringify(DOC)})}]})}}}}};`;
  const br = await chromium.launch(await launchOptions());
  try {
    const pg = await br.newPage({ viewport: { width: 390, height: 844 } });
    await pg.route('**/*', (r) => {
      const u = r.request().url();
      if (u.includes('firebase-app-compat')) return r.fulfill({ contentType: 'text/javascript', body: FINTO_APP });
      if (u.includes('firebase-firestore-compat')) return r.fulfill({ contentType: 'text/javascript', body: '' });
      return u.startsWith(`http://127.0.0.1:${PORTA}`) ? r.continue() : r.abort();
    });
    const errori = [];
    pg.on('pageerror', (e) => errori.push(e.message));
    await pg.goto(`http://127.0.0.1:${PORTA}/apartments-in/prati.html`, { waitUntil: 'load' });
    await pg.waitForSelector('.listing-card', { timeout: 5000 });
    const d = await pg.evaluate(() => ({
      href: [...document.querySelectorAll('.listing-card')].map((a) => a.getAttribute('href')),
      meta: (document.querySelector('.listing-meta') || {}).textContent || '',
      ld: [...document.head.querySelectorAll('script[data-seo-neighborhood-itemlist]')].map((s) => s.textContent),
      nota: document.querySelector('.stat-note a') && document.querySelector('.stat-note a').getAttribute('href'),
      largo: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    const guai = [...errori.map((e) => 'errore JS: ' + e)];
    if (d.href.length !== 1 || d.href[0] !== '/listing/' + DOC.id) guai.push('card: ' + JSON.stringify(d.href));
    if (!/Free from/.test(d.meta)) guai.push('la card non dice «Free from»: ' + d.meta);
    let item = null; try { item = JSON.parse(d.ld[0]).itemListElement[0].item; } catch { /* sotto */ }
    if (!item) guai.push('nessun ItemList in <head>');
    else {
      if (item.url !== 'https://www.boomrome.com/listing/' + DOC.id) guai.push('item url ' + item.url);
      if (item.offers.availability !== 'https://schema.org/PreOrder' || item.offers.availabilityStarts !== FUTURA)
        guai.push('offers ' + JSON.stringify(item.offers));
    }
    if (d.nota !== '/meteo') guai.push('l\'etichetta del canone non porta a /meteo');
    if (d.largo) guai.push('la pagina scorre di lato a 390px');
    verifica(guai, 'Chromium a 390px: prati con una casa in lista d\'attesa → card /listing/<id> «Free from», ItemList PreOrder',
      'in un browser vero la pagina non regge:');
  } finally { await br.close(); srv.close(); }
}

console.log(ko ? `  \x1b[31m${ko} guasti\x1b[0m, ${ok} regole verdi` : `  \x1b[32m${ok} regole verdi\x1b[0m`);
process.exit(ko ? 1 : 0);
