// api/feed/immobiliare.js — IL FEED VERSO IMMOBILIARE.IT
//
// Il catalogo BOOM in formato feed 2.0 (docs/feed-immobiliare.md — le
// specifiche raccolte dal portale tecnico feed.immobiliare.it). Modello
// PULL: questo endpoint emette SEMPRE il feed fresco; a consegnarlo è il
// Mac di Homie (batch: scarica ?gz=1 e lo carica sull'FTP del Support;
// REST: spezza i nodi property e li PUTta uno a uno — Immobiliare vuole
// gli IP pubblici dei chiamanti e Vercel non ne ha di fissi, il Mac sì).
//
// Vincoli implementati dalle specifiche CERTE:
//   · UTF-8, CDATA su testi liberi
//   · identità = unique-id (id listing BOOM) + agent/email (username agenzia)
//   · date-updated ISO-DATE-TIME, bumpata dal campo più recente del listing
//     (se la loro data è ≥ della nostra NON aggiornano — "non negoziabile")
//   · transaction type="R", price EUR
//   · location: IT / Lazio / Roma, city code ISTAT 058091, locality con
//     lat/lng + thoroughfare; @map="exact" SOLO quando boom-geo dice che il
//     pin è un portone vero (via+civico) — la precisione non si spaccia
//   · pictures con position progressiva, URL Firebase Storage (HEAD ok)
//   · niente nodo <publish> → extra-visibilità invariate
// I nodi il cui nome esatto attende l'XSD completo (superficie, locali,
// descrizione…) sono emessi dal blocco EXTENDED, disattivabile con
// ?core=1 finché lo schema non è confermato.
//
// GET /api/feed/immobiliare.xml?k=<feedKey>[&gz=1][&core=1][&id=<listingId>]
// feedKey derivato da HOMIE_SECRET (ruotarlo revoca l'URL), stesso pattern
// del feed calendario visite.
// ?id= → il SOLO <property> di quel listing (la porta REST del Pubblicista:
// il Mac lo scarica e lo PUTta su /property/{unique-id} uno a uno).

import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fsList } from '../homie/_lib.js';
import GEO from '../../js/boom-geo.js';
import DISPO from '../../js/dispo-engine.js';
import FACTS from '../../js/listing-facts.js';

const ISTAT_ROMA = '058091';
const AGENCY_EMAIL = process.env.FEED_AGENCY_EMAIL || process.env.GMAIL_USER || '';

export const feedKey = () =>
  crypto.createHash('sha256').update('feed-immobiliare:' + (process.env.HOMIE_SECRET || 'boom')).digest('hex').slice(0, 32);

const cdata = (s) => '<![CDATA[' + String(s == null ? '' : s).replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]>';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isoDT = (v) => {
  const d = v ? new Date(v.toDate ? v.toDate() : v) : null;
  return d && !isNaN(d) ? d.toISOString().slice(0, 19) : new Date().toISOString().slice(0, 19);
};

// Tipologie Immobiliare (id numerici — la lista completa vive nella doc
// "tipologie supportate"; 14 = appartamento è l'esempio ufficiale della
// guida. Da confermare/estendere con la lista quando incollata).
const TYPOLOGY = { appartamento: 14, apartment: 14, attico: 14, loft: 14, studio: 14, monolocale: 14, bilocale: 14, trilocale: 14, stanza: 14, room: 14 };
export const typologyId = (l) => TYPOLOGY[String(l.type || '').toLowerCase()] || 14;

// <rooms> sono i LOCALI, non le camere: così lo dichiara il blocco EXTENDED
// («superficie, locali, bagni…»), ed è la distinzione dei portali italiani —
// locali e camere da letto sono due numeri diversi. Fino al 15/10/2026 il
// nodo portava `Number(l.beds || l.bedrooms)`, cioè le camere — o niente,
// quando `beds` era testo libero (NaN): un bilocale arrivava come «1
// locale», un monolocale, e il bilocale di Via dei Cappellari («3») come 3.
// Ora il nodo esce SOLO quando i locali sono un fatto dichiarato due volte:
// il TIPO li nomina (monolocale/studio 1, bilocale 2, trilocale 3,
// quadrilocale 4) e le camere della regola unica (FACTS.bedroomsOf) più il
// soggiorno — la convenzione di tutta BOOM (bilocale = 1 camera,
// api/leads/_reverse.js) — danno lo stesso numero. Camere + 1 da sole sono
// una stima di convenzione, e al portale arriverebbero come dato
// dell'annuncio: un «Loft Style» con 2 camere non ha dichiarato 3 locali, un
// «Duplex» nemmeno (15/10/2026, dalla revisione: 8 dei 9 nodi nuovi erano
// così). Quindi si tace: tipo che non nomina i locali, camere ignote, una
// stanza (non ha i locali della casa intera), e il tipo che dice un altro
// numero — dato conteso, da verificare in casa (js/catalogo-correzioni.js),
// non da spedire a un portale. Il nome del nodo resta da confermare
// sull'XSD: se dirà che <rooms> sono le camere, la regola è da rifare.
const LOCALI_DEL_TIPO = { monolocale: 1, studio: 1, bilocale: 2, trilocale: 3, quadrilocale: 4 };
// Una STANZA in una casa condivisa, non una casa intera: lo dicono il tipo o
// il nome, con una parola INTERA — «Bedroom» non è «room» (" Spacious 2
// Bedroom flat " finiva fra le stanze), e «Parioli Double Room with Garden»
// lo dice solo nel nome. Le stesse due parole della regola di prima
// (/stanza|room/): «shared» da solo no, «shared garden» non è una stanza.
// La usa anche il Pubblicista (hint Idealista).
export const isRoom = (l) =>
  /\b(room|stanza)\b/i.test(String((l && l.type) || '') + ' ' + String((l && l.name) || ''));
export function localiOf(l) {
  l = l || {};
  if (isRoom(l)) return null;
  const tipo = String(l.type || '').toLowerCase().match(/\b(monolocale|studio|bilocale|trilocale|quadrilocale)\b/);
  if (!tipo) return null;                            // il tipo non dice i locali
  const camere = FACTS.bedroomsOf(l);
  if (camere == null) return null;                   // camere ignote: niente conto
  const locali = LOCALI_DEL_TIPO[tipo[1]];
  return camere + 1 === locali ? locali : null;      // conteso: si tace
}

// I pubblicabili: stessa regola della vetrina (llms/sitemap) — disponibili
// o in lista d'attesa, con nome e prezzo.
// Si pubblica ciò che si può DAVVERO affittare — la corsia, non l'etichetta.
// Include quindi la casa affittata di cui il contratto dichiara la fine: sui
// portali è un annuncio legittimo e atteso (`available-from` lo dice), ed è
// il segmento del blocco anticipato. Resta fuori solo ciò di cui non
// sappiamo quando si libera. Vetrina, feed e Pubblicista leggono questa.
export const publishable = (l) => {
  if (!l.name || !(Number(l.price) > 0)) return false;
  return DISPO.marketLane({
    ...l, status: l.availabilityStatus || l.status || 'available',
  }).lane !== 'closed';
};

// Il nodo <property> — SOLO specifiche certe + blocco EXTENDED marcato.
export function propertyNode(l, { extended = true, agencyEmail = AGENCY_EMAIL } = {}) {
  const lat = Number((l.geo && l.geo.lat) != null ? l.geo.lat : l.lat);
  const lng = Number((l.geo && l.geo.lng) != null ? l.geo.lng : l.lng);
  // boom-geo legge lat/lng top-level e ritorna { level, exact, why }
  const prec = ((GEO && GEO.pinPrecision) ? GEO.pinPrecision({ ...l, lat, lng }) : { level: 'none' }).level;
  const hasCo = isFinite(lat) && isFinite(lng) && lat !== 0;
  const dateUpdated = isoDT(l.updatedAt || l.photosEnhancedAt || l.descriptionUpdatedAt || l.createdAt);
  const imgs = (Array.isArray(l.images) ? l.images : (l.image ? [l.image] : [])).filter(Boolean).slice(0, 30);

  const out = [];
  out.push('<property operation="write">');
  out.push(`  <unique-id>${cdata(l.id)}</unique-id>`);
  out.push(`  <date-updated>${dateUpdated}</date-updated>`);
  out.push(`  <agent><office-name>${cdata('BOOM Rome')}</office-name><email>${esc(agencyEmail)}</email></agent>`);
  out.push(`  <building IDType="${typologyId(l)}"/>`);
  out.push('  <transactions><transaction type="R">'
    + `<price currency="EUR" reserved="false">${Math.round(Number(l.price) || 0)}</price>`
    + '</transaction></transactions>');
  out.push('  <location>');
  out.push('    <country-code>IT</country-code>');
  out.push('    <administrative-area>Lazio</administrative-area>');
  out.push('    <sub-administrative-area>Roma</sub-administrative-area>');
  out.push(`    <city code="${ISTAT_ROMA}">Roma</city>`);
  // @map="exact" solo su portone vero (via+civico): la precisione dei pin
  // non si spaccia — è la stessa regola di boom-geo sul sito.
  out.push(`    <locality${prec === 'exact' ? ' map="exact"' : ''}>`);
  if (l.postalCode || l.cap) out.push(`      <postal-code>${esc(l.postalCode || l.cap)}</postal-code>`);
  if (hasCo) {
    out.push(`      <latitude>${lat.toFixed(6)}</latitude>`);
    out.push(`      <longitude>${lng.toFixed(6)}</longitude>`);
  }
  if (l.address) out.push(`      <thoroughfare display="${prec === 'exact' ? 'yes' : 'no'}">${cdata(l.address)}</thoroughfare>`);
  out.push('    </locality>');
  out.push('  </location>');
  if (imgs.length) {
    out.push('  <pictures>');
    imgs.forEach((u, i) => out.push(`    <picture position="${i + 1}" url="${esc(u)}"/>`));
    out.push('  </pictures>');
  }
  if (extended) {
    // EXTENDED — nomi nodo da confermare contro l'XSD completo
    // (payload-specifications): superficie, locali, bagni, piano,
    // arredamento, classe energetica, descrizione bilingue.
    const sqm = Number(l.sqm || l.size) || 0;
    if (sqm) out.push(`  <size unit="m2">${sqm}</size>`);
    const rooms = localiOf(l);                       // i locali, non le camere
    if (rooms) out.push(`  <rooms>${rooms}</rooms>`);
    const baths = Number(l.bathrooms || l.baths) || 0;
    if (baths) out.push(`  <bathrooms>${baths}</bathrooms>`);
    if (l.energyClass) out.push(`  <energy-class>${esc(l.energyClass)}</energy-class>`);
    // Disponibilità: il feed non la portava affatto, quindi su Immobiliare
    // ogni casa BOOM sembrava libera adesso. Si emette SOLO su data certa —
    // `unknown` non produce nodo, perché un portale non ha modo di sapere
    // che quel valore era un'ipotesi nostra. (Nome nodo da confermare
    // sull'XSD completo: sta qui, nel blocco EXTENDED, apposta.)
    const av = DISPO.resolve(l);
    if (av.kind === 'date') out.push(`  <available-from>${av.iso}</available-from>`);
    // Le lingue VERE del catalogo: `description` è l'INGLESE (lo scrivono il
    // bot, lo sweep di api/wizard/describe.js e Media Studio), `descriptionIt`
    // l'italiano. Fino al 15/10/2026 il nodo language="it" portava
    // `l.description || l.descriptionIt`, cioè l'inglese dichiarato italiano
    // su ogni casa. Senza un testo italiano il nodo it tace: un portale
    // italiano mostrerebbe una lingua sotto l'etichetta di un'altra. Stessa
    // regola del Pubblicista (api/publisher/_state.js, coreContent).
    const descIt = String(l.descriptionIt || '').trim();
    const descEn = String(l.descriptionEn || '').trim() || String(l.description || '').trim();
    if (descIt) out.push(`  <description language="it">${cdata(descIt.slice(0, 4000))}</description>`);
    if (descEn) out.push(`  <description language="en">${cdata(descEn.slice(0, 4000))}</description>`);
  }
  out.push('</property>');
  return out.join('\n');
}

export function buildFeed(listings, opts = {}) {
  const props = listings.filter(publishable).map((l) => propertyNode(l, opts)).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<feed>\n<properties>\n' + props + '\n</properties>\n</feed>\n';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const k = String(req.query?.k || '');
  if (!k || !crypto.timingSafeEqual(Buffer.from(k.padEnd(32).slice(0, 32)), Buffer.from(feedKey()))) {
    return res.status(401).json({ ok: false, error: 'bad_key' });
  }
  try {
    const listings = (await fsList('listings', { limit: 400 })).map((l) => ({ ...l }));
    const opts = { extended: req.query?.core !== '1' };
    const wantId = String(req.query?.id || '');
    if (wantId) {
      // Nodo singolo per il PUT REST: qui anche un NON pubblicabile ha senso
      // (il Mac può doverlo leggere per capire cosa c'è) — ma se non è
      // pubblicabile lo diciamo con un 404 esplicito, mai con un nodo vuoto.
      const one = listings.find((l) => l.id === wantId);
      if (!one) return res.status(404).json({ ok: false, error: 'listing_not_found' });
      if (!publishable(one)) return res.status(409).json({ ok: false, error: 'not_publishable' });
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n' + propertyNode(one, opts) + '\n');
    }
    const xml = buildFeed(listings, opts);
    if (req.query?.gz === '1') {
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="feed.xml.gz"');
      return res.status(200).send(gzipSync(Buffer.from(xml, 'utf8')));
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(xml);
  } catch (e) {
    console.error('[feed/immobiliare]', e.message);
    return res.status(500).json({ ok: false, error: 'feed_failed' });
  }
}
