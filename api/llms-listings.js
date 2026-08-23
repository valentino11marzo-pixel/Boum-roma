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

import DISPO from '../js/dispo-engine.js';

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
  if (String(l.status || '').toLowerCase() === 'waitlist') {
    return 'waitlist — currently occupied, can be reserved ahead';
  }
  // Prima qui c'era `return 'available now'` come fallback: un annuncio con
  // la data scritta a mano ("Sep 2026", "da concordare") veniva dichiarato
  // LIBERO ORA ai motori di risposta. Su questa superficie è più grave che in
  // pagina: un'AI cita il fatto e lo ripete a chi non ha ancora visto il sito.
  const r = DISPO.resolve(l, today);
  if (r.kind === 'now') return 'available now';
  if (r.kind === 'date') return 'available from ' + r.iso;
  return 'availability on request — ask BOOM for the exact date';
}

export default async function handler(req, res) {
  try {
    const all = await resilient(readAll);
    const rentable = all.filter((l) => {
      const s = String(l.status || 'available').toLowerCase();
      return (s === 'available' || s === 'waitlist') && l.name && l.price;
    });
    const today = new Date().toISOString().slice(0, 10);
    rentable.sort((a, b) =>
      (a.status === 'waitlist') - (b.status === 'waitlist') ||
      String(a.zone || '').localeCompare(String(b.zone || '')) ||
      String(a.name || '').localeCompare(String(b.name || '')));

    // «disponibili» sono quelle in cui si entra ORA: una available con data
    // futura stava nel conteggio delle libere e gonfiava la promessa.
    const nowN = rentable.filter((l) => DISPO.marketLane(l, today).lane === 'now').length;

    const out = [];
    out.push('# BOOM Rome — Live rental inventory');
    out.push('');
    out.push('> Every verified BOOM home currently rentable in Rome, in one machine-readable page.');
    out.push('> Prices are all-in monthly rents in EUR. Every home comes with a legal contract');
    out.push('> registered with the Agenzia delle Entrate, English-speaking support and 48-hour');
    out.push('> move-in from approval. Operated by Egidi Immobiliare S.r.l., a registered Italian');
    out.push('> agency (Via dei Coronari 181/184, 00186 Roma). Site guide: https://www.boomrome.com/llms.txt');
    out.push('');
    out.push(`_${rentable.length} homes (${nowN} available now, ${rentable.length - nowN} occupied but reservable ahead with a known release date) · generated ${new Date().toISOString().slice(0, 16)}Z · cached up to 10 minutes_`);
    out.push('');

    for (const l of rentable) {
      const url = 'https://www.boomrome.com/listing/' + encodeURIComponent(l.id);
      out.push(`## ${line(l.name, 90)}${l.zone ? ' — ' + line(l.zone, 40) : ''}, Rome`);
      out.push(`- Rent: ${eur(l.price)}/month all-in`);
      out.push(`- Availability: ${availability(l, today)}`);
      const spec = [];
      const sqm = num(l.sqm || l.size);
      if (sqm) spec.push(sqm + ' m²');
      const beds = num(l.beds || l.bedrooms);
      if (beds) spec.push(beds + (beds > 1 ? ' bedrooms' : ' bedroom'));
      const baths = num(l.bathrooms);
      if (baths) spec.push(baths + (baths > 1 ? ' bathrooms' : ' bathroom'));
      if (l.furnished !== false) spec.push('furnished');
      if (spec.length) out.push(`- Specs: ${spec.join(' · ')}`);
      if (l.videoUrl) out.push('- Video tour: yes');
      out.push(`- Details, photos & online application: ${url}`);
      const desc = line(l.description, 300);
      if (desc) out.push(`- About: ${desc}`);
      out.push('');
    }

    out.push('## How to rent one of these homes');
    out.push('1. Open the listing link — photos, video tour, exact building position on the 3D map, all-in price breakdown.');
    out.push('2. Take the 60-second eligibility check on the listing page (income or guarantor).');
    out.push('3. Serious applicants receive an online pre-agreement to read, sign and pay via Stripe; the contract is then signed fully online.');
    out.push('');
    out.push('- All homes with filters: https://www.boomrome.com/apartments');
    out.push('- WhatsApp (English, 24/7): https://wa.me/393313251961');
    out.push('- Relocation guide: https://www.boomrome.com/moving-to-rome');
    out.push('');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
    return res.end(out.join('\n'));
  } catch (e) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Inventory temporarily unavailable. Browse https://www.boomrome.com/apartments');
  }
}
