// api/listing.js
// Server-renders /listing/:id by injecting per-listing SEO into the static
// apartment-detail.html template: <title>, description, canonical, Open Graph
// + Twitter cards, and Apartment/Offer/Breadcrumb JSON-LD.
//
// Why: the page's client-side updateSEO() only runs after JS executes, so
// social scrapers (WhatsApp/Facebook/X) and first-pass crawlers saw the
// generic default head. Now they get real listing data on the raw HTML.
// The client still re-applies the same tags on hydration (idempotent — it
// removes [data-seo-dynamic] before re-adding), so there is no duplication.
//
// Fully defensive: on any failure it serves the unmodified template (which
// still renders client-side), so a listing page can never break.
//
// Il corpo, non solo la testa (15/10/2026). Il template porta dentro di sé
// la casa d'esempio del builder (CASE[0], «Bilocale Trastevere»): chi non
// esegue JavaScript leggeva il titolo, il quartiere e lo stato di UN'ALTRA
// casa sotto la testa giusta. Ora gli slot che il client riempie (H1, dove,
// stato, canone, racconto, briciola di zona) li scrive anche il server, con
// le STESSE regole del client — e ogni regex prende qualunque contenuto
// cotto, così rifare la build non può riportare il difetto.
// Tre esiti distinti per la lettura: documento → la casa; 404 di Firestore
// → pagina 404 noindex (la casa non c'è più); guasto (5xx, rete) → il
// template di sempre col codice 503 + Retry-After e senza cache, MAI un 404
// per un'interruzione (e mai un «noindex» cacheato all'edge su una casa
// vera). Il template è noindex: l'indicizzazione la dichiara solo chi ha
// letto il documento.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DISPO from '../js/dispo-engine.js';
import FACTS from '../js/listing-facts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso';
const SITE = 'https://www.boomrome.com';

// Firestore ha risposto «non esiste»: diverso da un guasto (null).
const NOT_FOUND = Symbol('listing_not_found');
// Stessa lista di api/sitemap-listings.js: fuori dalla sitemap = noindex qui.
const HIDDEN = /hidden|draft|archived|off_market/i;
const INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const NOINDEX = 'noindex, follow';

const NOT_FOUND_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, follow"><title>This home is no longer listed — BOOM Rome</title><style>body{margin:0;background:#08080A;color:#fff;font:300 17px/1.6 \'Helvetica Neue\',Inter,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}a{color:#D4AF37}</style></head><body><main><h1>This home is no longer listed</h1><p>It may have been rented or withdrawn. <a href="/apartments">See the homes available now →</a></p><p>Questions? <a href="https://wa.me/393313251961">WhatsApp BOOM</a></p></main></body></html>';

let TEMPLATE;
function readTemplate() {
  if (TEMPLATE !== undefined) return TEMPLATE;
  const candidates = [
    path.join(process.cwd(), 'apartment-detail.html'),
    path.join(__dirname, '..', 'apartment-detail.html'),
  ];
  for (const p of candidates) {
    try { TEMPLATE = fs.readFileSync(p, 'utf8'); return TEMPLATE; } catch { /* try next */ }
  }
  TEMPLATE = null;
  return TEMPLATE;
}

// Convert a Firestore REST value object into a plain JS value.
function fv(v) {
  if (v == null) return undefined;
  const k = Object.keys(v)[0];
  const x = v[k];
  switch (k) {
    case 'integerValue':
    case 'doubleValue': return Number(x);
    case 'booleanValue': return x;
    case 'nullValue': return null;
    case 'arrayValue': return ((x && x.values) || []).map(fv);
    case 'mapValue': {
      const o = {}; const f = (x && x.fields) || {};
      for (const kk in f) o[kk] = fv(f[kk]);
      return o;
    }
    default: return x; // stringValue, timestampValue, referenceValue, …
  }
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Un taglio onesto: all'ultimo spazio entro n caratteri, coi puntini — mai
// a metà parola (prima `.slice(0, 300)` tagliava l'ultima parola a metà).
function clipWords(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.lastIndexOf(' ', n);
  return (cut > 0 ? t.slice(0, cut) : t.slice(0, n)).replace(/[\s,;:.\u2013\u2014-]+$/, '') + '…';
}

// Un percorso del sito (/foto-catalogo/…) non è un'immagine per uno
// scraper social: og:image e JSON-LD vogliono l'URL assoluto.
const abs = (u) => {
  const x = String(u == null ? '' : u);
  if (x.slice(0, 2) === '//') return 'https:' + x;
  return x.charAt(0) === '/' ? SITE + x : x;
};

// Numeric fields arrive dirty from Firestore ("1 bed", "30mq", "1+1", 2) —
// take the FIRST number group (stripping separators would turn "1+1" into 11)
// or drop the field, so "1 bed bedroom", "111 bedrooms" and NaN never ship.
const num = (v) => { const m = String(v == null ? '' : v).match(/\d+(?:\.\d+)?/); const n = m ? Number(m[0]) : 0; return n > 0 ? n : null; };

function injectSeo(html, d, id) {
  const name = String(d.name || 'Apartment').trim();
  const zone = String(d.zone || d.neighborhood || '').trim();
  const sqm = num(d.sqm || d.size);
  // le camere con UNA regola (js/listing-facts.js): il campo strutturato
  // prima del testo libero del bot. Con `num(d.beds || d.bedrooms)` «Capri 2
  // Bed» usciva «1 bedroom» (primo numero di «Living , 1 bedroom with
  // balcony , 1 bedroom…») e il bilocale di Via dei Cappellari «3 bedrooms».
  // 0 = monolocale: qui non ha una parola, quindi si tace (if (beds) sotto).
  const beds = FACTS.bedroomsOf(d);
  const baths = num(d.bathrooms);
  const price = d.price ? Number(d.price) : null;
  const canonical = 'https://www.boomrome.com/listing/' + encodeURIComponent(id);
  // la corsia, calcolata una volta: decide le parole di descrizione, fatti,
  // stato e JSON-LD (una casa occupata non promette le 48 ore)
  const laneM = DISPO.marketLane(d);
  // una bozza/nascosta non è sul mercato: la corsia non la conosce (cade su
  // «now»), quindi niente 48 ore e niente «available now» per lei
  const hiddenDoc = HIDDEN.test(String(d.status || ''));
  const quick = !hiddenDoc && laneM.lane === 'now' && !laneM.dateUnreadable;

  const title = [name, zone, 'Rome'].filter(Boolean).join(' — ') + ' | BOOM';

  const bits = [];
  if (sqm) bits.push(sqm + 'm²');
  if (beds) bits.push(beds > 1 ? beds + ' bedrooms' : beds + ' bedroom');
  if (zone) bits.push('in ' + zone);
  bits.push('verified by BOOM Rome');
  if (price) bits.push('from €' + price.toLocaleString('en-US') + '/mo');
  bits.push('legal contract');
  if (hiddenDoc) bits.push('not currently on the market');
  else if (quick) bits.push('move-in in as little as 48h');
  else if (laneM.lane === 'ahead') {
    // «free from 1 Mar 2027, reservable today»; senza data il badge dice
    // già «Reserve ahead», e ripeterlo («reserve ahead, reservable…») no
    const s = DISPO.laneCopy(laneM, 'en').short;
    bits.push(laneM.iso ? s.charAt(0).toLowerCase() + s.slice(1) + ', reservable today' : 'reservable ahead');
  } else if (laneM.lane === 'closed') bits.push('currently rented');
  else bits.push('move-in date on request'); // data illeggibile: si chiede, mai «48h»
  const description = bits.join(', ') + '.';

  const images = Array.isArray(d.images) ? d.images.filter(Boolean) : [];
  // assoluta anche quando il documento porta un percorso del sito
  // (2SwJ8yD3ITXylrEtYIlL emetteva /foto-catalogo/pigneto-palace.jpg)
  const ogImage = abs(images[0] || d.coverImage || d.image || 'https://www.boomrome.com/og-home.png');

  const setName = (n, val) => {
    html = html.replace(new RegExp('<meta name="' + n + '" content="[^"]*">'),
      () => '<meta name="' + n + '" content="' + esc(val) + '">');
  };
  const setProp = (p, val) => {
    html = html.replace(new RegExp('<meta property="' + p + '" content="[^"]*">'),
      () => '<meta property="' + p + '" content="' + esc(val) + '">');
  };

  // La casa d'esempio del template porta il suo BreadcrumbList a due voci:
  // la scheda ne tiene UNO, quello iniettato qui sotto (Home › Apartments › casa).
  html = html.replace(/<script type="application\/ld\+json">\{"@context": "https:\/\/schema\.org", "@type": "BreadcrumbList"[^<]*<\/script>\n?/, '');
  // Ogni sostituzione che porta un dato è una FUNZIONE: in una stringa di
  // rimpiazzo $' $` $& e $$ sono pattern, non testo — un `$'` nel
  // nome di una casa incollava il resto del template nella pagina (36 MB,
  // 128 <body>). esc() non li tocca: il `$` non è un carattere HTML.
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => '<title>' + esc(title) + '</title>');
  html = html.replace(/<link rel="canonical" href="[^"]*">/, () => '<link rel="canonical" href="' + esc(canonical) + '">');
  setName('description', description);
  setProp('og:title', title);
  setProp('og:description', description);
  setProp('og:url', canonical);
  setProp('og:image', ogImage);
  setProp('og:image:secure_url', ogImage);
  setProp('og:image:alt', title);
  setName('twitter:title', title);
  setName('twitter:description', description);
  setName('twitter:image', ogImage);
  // Il template è noindex (le copie /apartment-detail non sono canoniche):
  // l'indicizzazione si dichiara SOLO qui, su un documento letto davvero.
  const robots = hiddenDoc ? NOINDEX : INDEX;
  setName('robots', robots);
  setName('googlebot', robots);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Apartment',
    name,
    description: d.description ? clipWords(d.description, 300) : description,
    url: canonical,
    image: images.length ? images.map(abs) : [ogImage],
  };
  if (beds) ld.numberOfBedrooms = beds;
  if (baths) ld.numberOfBathroomsTotal = baths;
  if (sqm) ld.floorSize = { '@type': 'QuantitativeValue', value: sqm, unitCode: 'MTK' };
  ld.address = {
    '@type': 'PostalAddress',
    streetAddress: d.address || zone || 'Rome',
    addressLocality: 'Rome', addressRegion: 'Lazio', addressCountry: 'IT',
  };
  // Una scheda nascosta/bozza/archiviata/fuori mercato non è in vendita:
  // nessuna Offer. Prima la corsia la leggeva «now» e il JSON-LD diceva
  // InStock sotto una description «not currently on the market» — e i
  // crawler AI leggono il dato strutturato qualunque cosa dica il noindex.
  if (price && !hiddenDoc) {
    // La CORSIA, non lo stato grezzo. Prima una casa in `waitlist` usciva
    // come InStock — cioè dichiarava ai motori di essere disponibile ADESSO
    // mentre dentro c'è un inquilino: il dato strutturato sbagliato finisce
    // nei rich result, dove non lo corregge nessuno. PreOrder è esattamente
    // il vocabolario di schema.org per «lo prenoti ora, lo ricevi dopo», ed
    // è ciò che rende citabile il mercato del blocco anticipato.
    const lane = laneM;
    ld.offers = {
      '@type': 'Offer', price, priceCurrency: 'EUR', url: canonical,
      availability: lane.lane === 'closed' ? 'https://schema.org/SoldOut'
        : lane.lane === 'ahead' && lane.iso ? 'https://schema.org/PreOrder'
          : lane.lane === 'now' && !lane.dateUnreadable ? 'https://schema.org/InStock' : undefined,
      priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'EUR', unitText: 'MONTH' },
      seller: { '@id': 'https://www.boomrome.com/#organization' },
    };
    // availabilityStarts solo su una data CERTA (la corsia la espone solo lì)
    if (lane.iso) ld.offers.availabilityStarts = lane.iso;
  }
  // Video tour → VideoObject JSON-LD (video badge in search results). Same
  // YouTube-id extraction as the client's exYT().
  const ytm = String(d.videoUrl || d.youtubeUrl || '')
    .match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  let videoLd = null;
  if (ytm) {
    videoLd = {
      '@context': 'https://schema.org', '@type': 'VideoObject',
      name: name + ' — video tour',
      description: 'Video tour of ' + name + (zone ? ' in ' + zone : '') + ', Rome — verified by BOOM.',
      thumbnailUrl: [
        'https://i.ytimg.com/vi/' + ytm[1] + '/maxresdefault.jpg',
        'https://i.ytimg.com/vi/' + ytm[1] + '/hqdefault.jpg',
      ],
      contentUrl: 'https://www.youtube.com/watch?v=' + ytm[1],
      embedUrl: 'https://www.youtube-nocookie.com/embed/' + ytm[1],
    };
    const up = String(d.createdAt || '').match(/^\d{4}-\d{2}-\d{2}/);
    if (up) videoLd.uploadDate = up[0];
  }

  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.boomrome.com/' },
      { '@type': 'ListItem', position: 2, name: 'Apartments', item: 'https://www.boomrome.com/apartments' },
      { '@type': 'ListItem', position: 3, name, item: canonical },
    ],
  };
  const safe = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  // Preload the hero photo (sized like the client gallery: imgur 'h' = 1024px) so the
  // browser fetches it in parallel with the JS/Firestore boot instead of after it (LCP).
  const heroImg = images[0] || d.coverImage || d.image || '';
  const heroSized = /i\.imgur\.com/.test(heroImg)
    ? heroImg.replace(/(\/[A-Za-z0-9]{7})(\.(?:jpe?g|png|webp))/i, '$1h$2')
    : heroImg;
  const preload = heroImg ? '<link rel="preload" as="image" fetchpriority="high" href="' + esc(heroSized) + '">\n' : '';
  // Inject the already-read listing so the client renders instantly — no Firebase SDK
  // load + Firestore round-trip on the critical path. The client falls back to a live
  // read if this is absent (e.g. on /apartment-detail without SSR).
  const dataScript = '<script>window.__LISTING=' + safe(d) + ';window.__LISTING_ID=' + JSON.stringify(id) + ';</script>\n';
  const scripts = preload + dataScript +
    '<script type="application/ld+json" data-seo-dynamic>' + safe(ld) + '</script>\n' +
    '<script type="application/ld+json" data-seo-dynamic>' + safe(breadcrumb) + '</script>\n' +
    (videoLd ? '<script type="application/ld+json" data-seo-dynamic>' + safe(videoLd) + '</script>\n' : '') +
    '</head>';
  html = html.replace('</head>', () => scripts);

  // No-JS baseline for AI crawlers (GPTBot, ClaudeBot, PerplexityBot…) and
  // anyone with scripts off: the page body is a client-rendered shell, so
  // without this a non-executing crawler reads an empty page. Hidden whenever
  // JS runs — the hydrated page replaces it for humans.
  // Il testo che leggono i crawler AI (e chi ha JS spento). Prima una casa
  // bloccata diceva solo «currently occupied — can be reserved ahead»: la
  // DATA, che è l'unico fatto che un motore di risposta può citare utilmente
  // ("libero da settembre 2027"), spariva. Ora la corsia la porta in chiaro.
  const lane2 = laneM;
  const avail = hiddenDoc ? 'Not currently on the market.' : lane2.lane === 'ahead'
    ? (lane2.iso
      ? 'Occupied now — free from ' + lane2.iso + ' and reservable today.'
      : 'Occupied now — reservable ahead; ask BOOM for the release date.')
    : lane2.lane === 'closed' ? 'Currently rented.'
      : lane2.dateUnreadable
        // il ramo che mancava: senza, ogni data illeggibile diceva "now"
        ? 'Availability on request — ask BOOM for the exact date.'
        : 'Available now.';
  const facts = [];
  // Le utenze: si dice «incluse» SOLO se l'operatore ha messo l'etichetta
  // sulla casa (js/listing-facts.js) — mai una promessa per tutto il catalogo.
  // Le tasse del contratto: nessuna imposta «sempre dovuta». Con la cedolare
  // secca (il default dei nostri modelli, js/contract-pdf.js cedolareOn) il
  // contratto è esente da registro e bollo; senza, il conduttore paga metà
  // del registro e il bollo. Gli oneri condominiali seguono la tabella
  // allegata al contratto. Si dice «come scrive il contratto», mai una cifra.
  if (price) facts.push('<li>Monthly rent: €' + price.toLocaleString('en-US') + (FACTS.billsIncluded(d) ? ' — listed with bills included (the pre-agreement lists which bills)' : ' — utilities (electricity, gas, water, internet) are not included; condominium charges and any registration tax or stamp duty are shared as the lease states (no registration tax or stamp duty is due when the landlord opts for the cedolare secca)') + '</li>');
  // l'onorario con l'IVA dentro: è ciò che la proposta addebita davvero
  if (price) facts.push('<li>Agency fee: €' + FACTS.agencyFeeEur(price).toLocaleString('en-US') + ' incl. VAT, once (10% of one year\'s rent + 22% VAT)</li>');
  facts.push('<li>' + esc(avail) + '</li>');
  if (sqm) facts.push('<li>Size: ' + esc(sqm) + ' m²</li>');
  // i bagni non dipendono più dalle camere: un monolocale (0) li perdeva
  // insieme alla riga che per lui tace
  const rooms = [beds && beds + (beds > 1 ? ' bedrooms' : ' bedroom'),
    baths && baths + (baths > 1 ? ' bathrooms' : ' bathroom')].filter(Boolean);
  if (rooms.length) facts.push('<li>' + rooms.join(' · ') + '</li>');
  if (d.videoUrl) facts.push('<li>Video tour available on this page</li>');
  facts.push('<li>Registered Italian standard-form lease (L. 431/98), explained in English · English support' + (quick ? ' · move-in in as little as 48 hours from approval' : '') + '</li>');
  const noscript = '<noscript><section style="max-width:720px;margin:40px auto;padding:0 20px;font-family:Helvetica,Arial,sans-serif">' +
    // h2, non h1: l'H1 della pagina è #nomeCasa, ora scritto dal server
    '<h2>' + esc(name) + (zone ? ' — ' + esc(zone) : '') + ', Rome</h2>' +
    (d.description ? '<p>' + esc(clipWords(d.description, 700)) + '</p>' : '') +
    '<ul>' + facts.join('') + '</ul>' +
    '<p>This page is interactive with JavaScript (photos, video, map, online application). ' +
    'Without it: <a href="https://wa.me/393313251961">WhatsApp BOOM (English)</a> · ' +
    '<a href="/apartments">all verified homes</a> · ' +
    '<a href="/llms-listings.txt">live inventory in markdown</a>.</p>' +
    '</section></noscript>';
  // Il <body> VERO è quello dopo </head>: un replace sulla prima occorrenza
  // cadrebbe dentro un commento della testa che nomina il tag (22/10/2026:
  // il contratto di scorrimento inlinato lo nominava, e il racconto per i
  // crawler finiva dentro un commento CSS).
  const headEnd = html.indexOf('</head>');
  const bodyAt = headEnd < 0 ? -1 : html.indexOf('<body>', headEnd);
  if (bodyAt >= 0) html = html.slice(0, bodyAt + 6) + '\n' + noscript + html.slice(bodyAt + 6);

  // Gli slot del corpo, con le regole del client (casaDaListing in
  // apartment-detail.html): zona = prima parte prima di «/», dove = zona ·
  // indirizzo. Ogni regex prende QUALUNQUE contenuto cotto dal builder.
  const zona = (zone || 'Roma').split('/')[0].trim();
  const dove = [zona, String(d.address || '').trim()].filter(Boolean).join(' · ');
  const prezzoTxt = price ? '€' + price.toLocaleString('en-US') : '';
  const racconto = d.description ? clipWords(d.description, 700) : '';
  html = html.replace(/<h1 id="nomeCasa">[^<]*<\/h1>/, () => '<h1 id="nomeCasa">' + esc(name) + '</h1>');
  html = html.replace(/<p class="dove" id="doveCasa">[^<]*<\/p>/, () => '<p class="dove" id="doveCasa">' + esc(dove) + '</p>');
  // lo stesso cartello del client (statoDa in apartment-detail.html): una
  // scheda fuori mercato non dice «Available now» a chi arriva da un vecchio link
  const statoTxt = hiddenDoc ? 'Not on the market' : DISPO.laneCopy(laneM, 'en').short;
  html = html.replace(/<span class="stato-grande" id="statoCasa">[^<]*<\/span>/,
    () => '<span class="stato-grande" id="statoCasa">' + esc(statoTxt) + '</span>');
  html = html.replace(/<span class="flap-prezzo flap-scale" id="canoneCasa" data-p="[^"]*">[^<]*<\/span>/,
    () => '<span class="flap-prezzo flap-scale" id="canoneCasa" data-p="' + esc(prezzoTxt) + '">' + esc(prezzoTxt) + '</span>');
  if (racconto) html = html.replace(/<p id="raccontoCasa">[^<]*<\/p>/, () => '<p id="raccontoCasa">' + esc(racconto) + '</p>');
  html = html.replace(/<a href="[^"]*" id="briZona">[^<]*<\/a>/,
    () => '<a href="/apartments#zona=' + esc(encodeURIComponent(zona)) + '" id="briZona">' + esc(zona) + '</a>');

  return html;
}

// Admin sign-in → ID token, so we can still read when public rules are denied.
async function adminToken() {
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASS;
  if (!email || !password) return null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const d = await r.json();
    return d.idToken || null;
  } catch { return null; }
}

// Read one listing: unauthenticated first (fast), admin-authenticated on 403.
async function readListing(id) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/listings/${encodeURIComponent(id)}?key=${API_KEY}`;
  let r = await fetch(url);
  if (r.status === 403) {
    const token = await adminToken();
    if (token) r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (r.status === 404) return NOT_FOUND;
  if (!r.ok) return null;
  const doc = await r.json();
  const f = doc.fields || {};
  const d = {};
  for (const k in f) d[k] = fv(f[k]);
  return d;
}

// Un id che Firestore non può MAI contenere (oltre 1500 byte, riservato
// `__x__`, `.`/`..`, con una `/`): Firestore risponde 400, non 404, e il
// 400 finiva nel ramo «guasto» — un 503 con Retry-After per sempre, che i
// crawler registrano come errore del server che non guarisce. Si risponde
// 404 subito, senza chiedere niente a Firestore. (Un 400 qualunque NON è
// «non trovato»: anche una chiave API sbagliata risponde 400.)
export function impossibleId(id) {
  const s = String(id == null ? '' : id);
  if (!s) return false;
  return Buffer.byteLength(s, 'utf8') > 1500 || /^__.*__$/.test(s)
    || s === '.' || s === '..' || s.includes('/');
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  return res.end(NOT_FOUND_HTML);
}

export default async function handler(req, res) {
  const id = ((req.query && req.query.id) || '').toString().trim();
  if (impossibleId(id)) return notFound(res);
  const html = readTemplate();

  if (!html) {
    // Template not bundled with the function — fall back to the static page.
    res.statusCode = 307;
    res.setHeader('Location', '/apartment-detail' + (id ? '?id=' + encodeURIComponent(id) : ''));
    return res.end();
  }

  let out = html;
  let injected = false;
  try {
    if (id) {
      const d = await readListing(id);
      if (d === NOT_FOUND) {
        // la casa non c'è più: un 404 vero, noindex — mai il template con
        // la casa d'esempio servito come se fosse questa
        return notFound(res);
      }
      if (d) { out = injectSeo(html, d, id); injected = true; }
    }
  } catch {
    out = html; // serve the plain template on any error (never a 404 on an outage)
    injected = false;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (id && !injected) {
    // Un guasto (Firestore 5xx, rete, 403 senza credenziali admin, errore
    // nell'iniezione): il template è noindex e porta la casa d'esempio.
    // Con un 200 cacheabile all'edge, un crawler passato in quei cinque
    // minuti avrebbe registrato «noindex» su una casa vera. Un 503 con
    // Retry-After Google lo riprova senza deindicizzare; il browser rende
    // comunque il corpo; e niente cache: il prossimo giro rilegge.
    res.statusCode = 503;
    res.setHeader('Retry-After', '120');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(out);
  }
  res.statusCode = 200;
  // s-maxage bounded + short SWR: the page self-refreshes from live data on
  // load, but the SSR snapshot itself shouldn't serve day-old numbers either
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  res.end(out);
}
