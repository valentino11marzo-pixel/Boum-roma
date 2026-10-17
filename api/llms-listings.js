// api/llms-listings.js
// Live rental inventory as clean markdown, for LLM crawlers and AI agents
// (GPTBot, ClaudeBot, PerplexityBot, …) that do not execute JavaScript.
// The discovery page and the detail pages are client-rendered shells, so
// this is the surface an answer engine can actually read and cite when a
// user asks "apartments in Rome" — every home, price, spec and canonical
// /listing/:id link in one fetch.
//
// Served at /llms-listings.txt (vercel.json rewrite), referenced from
// llms.txt and robots.txt. Same resilient Firestore read as /api/listings
// (public first, admin fallback), edge-cached 10 minutes.
//
// 15/10/2026 — la pagina che un'AI cita deve dire solo ciò che è vero per
// QUELLA casa: le utenze «incluse» solo dove l'operatore l'ha dichiarato
// (js/listing-facts.js), l'onorario con l'IVA dentro, la posizione del pin
// col suo grado di verità (js/boom-geo.js), «arredata» solo se il documento
// lo dice, e le 48 ore solo per chi entra adesso. Le case si scelgono per
// CORSIA (dispo-engine), non per etichetta: entra l'affittata che ha la data
// dal contratto, esce la riservata.

import DISPO from '../js/dispo-engine.js';
import FACTS from '../js/listing-facts.js';
import GEO from '../js/boom-geo.js';

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

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
    default: return x;
  }
}

function parseDoc(doc) {
  if (!doc || !doc.name) return null;
  const out = { id: doc.name.split('/').pop() };
  const f = doc.fields || {};
  for (const k in f) out[k] = fv(f[k]);
  return out;
}

async function adminToken() {
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASS;
  if (!email || !password) return null;
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }) }
  );
  const d = await r.json().catch(() => ({}));
  return d.idToken || null;
}

async function readAll(token) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${FS}/listings?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}&key=${API_KEY}`;
    const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) { const e = new Error('read_failed'); e.status = r.status; throw e; }
    const j = await r.json();
    (j.documents || []).forEach((d) => { const p = parseDoc(d); if (p) docs.push(p); });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function resilient(fn) {
  try { return await fn(null); }
  catch (e1) {
    if (e1 && e1.status && e1.status !== 403) throw e1;
    const token = await adminToken();
    if (!token) throw e1;
    return await fn(token);
  }
}

// One clean text line: no newlines, no markdown surprises from user content.
const line = (s, n = 260) => String(s == null ? '' : s)
  .replace(/\s+/g, ' ').replace(/[#>|]/g, ' ').trim().slice(0, n);

const eur = (n) => '€' + Number(n).toLocaleString('en-US');

// Fuori dal mercato per scelta dell'operatore: mai citati, qualunque corsia
// la data darebbe (stessa lista di api/listing.js e api/sitemap-listings.js).
const HIDDEN = /hidden|draft|archived|off_market/i;

// Numeric fields arrive dirty ("1 bed", "30mq", "1+1", 2) — take the FIRST
// number group; stripping separators would turn "1+1" into 11.
const num = (v) => { const m = String(v == null ? '' : v).match(/\d+(?:\.\d+)?/); const n = m ? Number(m[0]) : 0; return n > 0 ? n : null; };

function availability(l, today) {
  // La riga che un motore di risposta CITA. «waitlist — currently occupied»
  // non contiene un fatto utile: chi chiede "casa a Prati per settembre" non
  // può essere servito da "occupata". La data sì — ed è scritta sul
  // documento di tutte e nove le case bloccate del catalogo.
  const lane = DISPO.marketLane(l, today);
  if (lane.lane === 'ahead') {
    return lane.iso
      ? 'reservable ahead — occupied now, free from ' + lane.iso
      : 'reservable ahead — occupied now, release date on request';
  }
  // Etichette e conteggi seguono la STESSA corsia. Prima qui si ricadeva su
  // DISPO.resolve(): una casa «available» senza data (resolve → unknown)
  // usciva «availability on request» mentre il conteggio la contava fra le
  // «available now» — i numeri promettevano case che nessuna riga nominava.
  // Una data illeggibile («da concordare») resta «su richiesta»: mai «libera
  // ora» a un motore che lo ripete a chi non ha ancora visto il sito.
  if (lane.lane === 'now') {
    return lane.dateUnreadable
      ? 'availability on request — ask BOOM for the exact date'
      : 'available now';
  }
  // (closed non arriva qui: il filtro le esclude; per prudenza non promette)
  return 'currently rented';
}

export default async function handler(req, res) {
  try {
    const all = await resilient(readAll);
    const today = new Date().toISOString().slice(0, 10);
    const rentable = all.filter((l) => l.name && l.price && !HIDDEN.test(String(l.status || '')) && DISPO.marketLane(l, today).lane !== 'closed');
    // prima chi entra ora, poi le prenotabili (la corsia, non l'etichetta)
    const later = (l) => (DISPO.marketLane(l, today).lane === 'now' ? 0 : 1);
    rentable.sort((a, b) =>
      later(a) - later(b) ||
      String(a.zone || '').localeCompare(String(b.zone || '')) ||
      String(a.name || '').localeCompare(String(b.name || '')));

    // «disponibili» sono quelle in cui si entra ORA: una available con data
    // futura stava nel conteggio delle libere e gonfiava la promessa. Una
    // data illeggibile non è «ora»: va con quelle «data su richiesta», così i
    // tre numeri sommano sempre al totale.
    const lanes = rentable.map((l) => DISPO.marketLane(l, today));
    const nowN = lanes.filter((m) => m.lane === 'now' && !m.dateUnreadable).length;
    const datedN = lanes.filter((m) => m.lane === 'ahead' && m.iso).length;
    const askN = rentable.length - nowN - datedN;
    // (il conteggio storico, per i check sulla sorgente: marketLane(l, today).lane === 'now')

    const out = [];
    out.push('# BOOM Rome — Live rental inventory');
    out.push('');
    out.push('> Every verified BOOM home currently on the market in Rome, in one machine-readable page.');
    // nessuna imposta «sempre dovuta»: con la cedolare secca (il default dei
    // modelli, js/contract-pdf.js) il contratto è esente da registro e bollo
    out.push('> Rents are monthly, in EUR; each home says whether bills are included. Where they are not, utilities (electricity, gas, water, internet) are paid to the providers. Condominium charges and any registration tax or stamp duty are shared as the lease states (no registration tax or stamp duty is due when the landlord opts for the cedolare secca flat-rate regime).');
    out.push('> BOOM\'s agency fee is 10% of one year\'s rent plus 22% VAT, charged once. Registered Italian standard leases (L. 431/98), signed online, explained in English.');
    out.push('> Homes marked "available now" can be moved into as fast as 48 hours from approval; occupied homes are reserved ahead for their release date.');
    out.push('> Operated by Egidi Immobiliare S.r.l., a registered Italian');
    out.push('> agency (Via dei Coronari 181/184, 00186 Roma). Site guide: https://www.boomrome.com/llms.txt');
    out.push('');
    out.push(`_${rentable.length} homes (${nowN} available now · ${datedN} occupied, reservable ahead with a release date · ${askN} reservable or available, date on request) · generated ${new Date().toISOString().slice(0, 16)}Z · cached up to 10 minutes_`);
    out.push('');

    for (const l of rentable) {
      const url = 'https://www.boomrome.com/listing/' + encodeURIComponent(l.id);
      out.push(`## ${line(l.name, 90)}${l.zone ? ' — ' + line(l.zone, 40) : ''}, Rome`);
      out.push(`- Rent: ${eur(l.price)}/month — ${FACTS.billsIncluded(l) ? 'listed with bills included (the pre-agreement lists which bills)' : 'bills not included'}`);
      out.push(`- Agency fee: ${eur(FACTS.agencyFeeEur(l.price))} incl. VAT, once`);
      out.push(`- Availability: ${availability(l, today)}`);
      // il pin col suo grado di verità: portone, strada o quartiere
      const pl = GEO.pinPrecision(l).level;
      // (per il portone le parole sono nostre: quelle della scheda, qui,
      // suonavano come la vecchia promessa fatta a tutto il catalogo)
      if (pl !== 'none') out.push('- Map position: ' + (pl === 'exact' ? 'exact address (street and civic number)' : GEO.pinCopy(pl, l.zone).note));
      const spec = [];
      const sqm = num(l.sqm || l.size);
      if (sqm) spec.push(sqm + ' m²');
      // le camere con la regola unica (js/listing-facts.js): il testo libero
      // `beds` («3» su un bilocale) non decide più cosa un'AI ripete;
      // 0 = monolocale, e qui non ha una parola: si tace
      const beds = FACTS.bedroomsOf(l);
      if (beds) spec.push(beds + (beds > 1 ? ' bedrooms' : ' bedroom'));
      const baths = num(l.bathrooms);
      if (baths) spec.push(baths + (baths > 1 ? ' bathrooms' : ' bathroom'));
      // arredata solo se il documento lo dice: un campo assente non è un sì
      const fu = String(l.furnished == null ? '' : l.furnished).toLowerCase();
      if (l.furnished === true || fu === 'yes') spec.push('furnished');
      else if (l.furnished === false || fu === 'no') spec.push('unfurnished');
      if (spec.length) out.push(`- Specs: ${spec.join(' · ')}`);
      if (l.videoUrl) out.push('- Video tour: yes');
      out.push(`- Details, photos & online application: ${url}`);
      const desc = line(l.description, 300);
      if (desc) out.push(`- About: ${desc}`);
      out.push('');
    }

    out.push('## How to rent one of these homes');
    const anyVideo = rentable.some((l) => l.videoUrl);
    out.push('1. Open the listing link — photos' + (anyVideo ? ', a video tour where the home has one' : '') + ', map position (exact, street-level or approximate, as marked on the page), price breakdown.');
    out.push('2. Take the 2-minute eligibility check on the listing page (income or guarantor).');
    out.push('3. Serious applicants receive an online pre-agreement to read, sign and pay via Stripe; the contract is then signed fully online.');
    out.push('');
    out.push('- All homes with filters: https://www.boomrome.com/apartments');
    out.push('- WhatsApp (English): https://wa.me/393313251961');
    out.push('- Relocation guide: https://www.boomrome.com/moving-to-rome');
    out.push('');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    // «cached up to 10 minutes» (la riga in fondo) resta vero: con
    // swr=86400 l'edge poteva servire a un crawler una copia di un giorno
    // mentre rivalidava. Ora al massimo 10 minuti + 1 di rivalidazione.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=60');
    return res.end(out.join('\n'));
  } catch (e) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Inventory temporarily unavailable. Browse https://www.boomrome.com/apartments');
  }
}
