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
// GET /api/feed/immobiliare.xml?k=<feedKey>[&gz=1][&core=1]
// feedKey derivato da HOMIE_SECRET (ruotarlo revoca l'URL), stesso pattern
// del feed calendario visite.

import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fsList } from '../homie/_lib.js';
import GEO from '../../js/boom-geo.js';

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

// I pubblicabili: stessa regola della vetrina (llms/sitemap) — disponibili
// o in lista d'attesa, con nome e prezzo.
export const publishable = (l) => {
  const s = String(l.availabilityStatus || l.status || 'available').toLowerCase();
  return (s === 'available' || s === 'waitlist') && l.name && Number(l.price) > 0;
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
    const rooms = Number(l.beds || l.bedrooms) || 0;
    if (rooms) out.push(`  <rooms>${rooms}</rooms>`);
    const baths = Number(l.bathrooms || l.baths) || 0;
    if (baths) out.push(`  <bathrooms>${baths}</bathrooms>`);
    if (l.energyClass) out.push(`  <energy-class>${esc(l.energyClass)}</energy-class>`);
    const desc = l.description || l.descriptionIt || '';
    if (desc) out.push(`  <description language="it">${cdata(String(desc).slice(0, 4000))}</description>`);
    if (l.descriptionEn || l.description) out.push(`  <description language="en">${cdata(String(l.descriptionEn || l.description).slice(0, 4000))}</description>`);
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
    const xml = buildFeed(listings, { extended: req.query?.core !== '1' });
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
