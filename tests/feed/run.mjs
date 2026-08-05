// tests/feed/run.mjs — il feed Immobiliare, blindato sulle specifiche CERTE.
// (docs/feed-immobiliare.md). Mapper puro: niente rete, fixture in memoria.
// LE REGOLE: entra solo il pubblicabile, identità = unique-id + email
// agenzia, date-updated ISO, transaction R in EUR, ISTAT Roma, la
// precisione del pin non si spaccia (map="exact" SOLO su via+civico,
// indirizzo display="no" altrimenti), CDATA sui testi, gzip col magic
// giusto, chiave derivata stabile.
// Uso: node tests/feed/run.mjs
process.env.HOMIE_SECRET = 'feed-test-secret';
process.env.FEED_AGENCY_EMAIL = 'agenzia@boomrome.com';
process.env.FIREBASE_API_KEY = 'k'; process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p'; process.env.FIREBASE_PROJECT_ID = 'test';

const { buildFeed, propertyNode, publishable, feedKey } = await import('../../api/feed/immobiliare.js');
import { gunzipSync } from 'node:zlib';

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };

const EXACT = {
  id: 'lst_pigneto', name: 'Bilocale Pigneto', price: 1250, availabilityStatus: 'available',
  address: 'Via del Pigneto 112', type: 'bilocale', sqm: 55, beds: 1, bathrooms: 1,
  images: ['https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media', 'https://firebasestorage.googleapis.com/v0/b/x/o/b.jpg?alt=media'],
  geo: { lat: 41.8891, lng: 12.5432, src: 'nominatim', q: 'Via del Pigneto 112, Roma' },
  updatedAt: '2026-08-01T10:20:30.000Z', description: 'Luminoso bilocale ristrutturato — piano 2°',
};
const ZONE = {
  id: 'lst_centro', name: 'Studio Centro', price: 900, availabilityStatus: 'available',
  address: 'Centro Storico', type: 'studio',
  geo: { lat: 41.8986, lng: 12.4735, src: 'zone' },
  createdAt: '2026-07-15T08:00:00.000Z',
};
const RENTED = { id: 'lst_out', name: 'Affittato', price: 1400, availabilityStatus: 'rented' };
const NOPRICE = { id: 'lst_np', name: 'Senza prezzo', availabilityStatus: 'available' };

// ═══ Pubblicabilità ═══
check('disponibile con prezzo → entra', publishable(EXACT) === true);
check('affittato → fuori', publishable(RENTED) === false);
check('senza prezzo → fuori', publishable(NOPRICE) === false);

// ═══ Il nodo property (specifiche certe) ═══
const node = propertyNode(EXACT);
check('operation="write" + unique-id in CDATA', node.includes('<property operation="write">') && node.includes('<unique-id><![CDATA[lst_pigneto]]></unique-id>'));
check('identità agenzia (email username)', node.includes('<email>agenzia@boomrome.com</email>'));
check('date-updated ISO-DATE-TIME dal campo più recente', node.includes('<date-updated>2026-08-01T10:20:30</date-updated>'));
check('transaction R in EUR, prezzo intero', node.includes('<transaction type="R">') && node.includes('<price currency="EUR" reserved="false">1250</price>'));
check('ISTAT Roma 058091', node.includes('<city code="058091">Roma</city>'));
check('pin esatto (via+civico): map="exact" e indirizzo visibile', node.includes('<locality map="exact">') && node.includes('<thoroughfare display="yes"><![CDATA[Via del Pigneto 112]]></thoroughfare>'));
check('coordinate a 6 decimali', node.includes('<latitude>41.889100</latitude>'));
check('pictures con position progressiva', node.includes('<picture position="1"') && node.includes('<picture position="2"'));
check('niente <publish> (visibilità invariate)', !node.includes('<publish>'));
check('em-dash e accenti sopravvivono nel CDATA', node.includes('ristrutturato — piano 2°'));

// La precisione non si spaccia: pin di zona → NIENTE map="exact", indirizzo
// display="no" (il centroide del centro storico non è un portone).
const nodeZone = propertyNode(ZONE);
check('pin di zona: mai map="exact"', !nodeZone.includes('map="exact"'));
check('pin di zona: indirizzo display="no"', nodeZone.includes('display="no"'));

// core=1: fuori i nodi in attesa di XSD
const core = propertyNode(EXACT, { extended: false });
check('?core=1 tiene solo le specifiche certe', !core.includes('<size') && !core.includes('<description'));

// ═══ Il feed intero ═══
const xml = buildFeed([EXACT, ZONE, RENTED, NOPRICE]);
check('dichiarazione UTF-8 + root + solo i 2 pubblicabili', xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && (xml.match(/<property /g) || []).length === 2 && !xml.includes('lst_out'));

// ═══ Endpoint: chiave derivata + gzip ═══
const handler = (await import('../../api/feed/immobiliare.js')).default;
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return new Response(JSON.stringify({ idToken: 't' }), { status: 200 });
  if (url.includes('firestore')) {
    // :runQuery → i due listing fixture
    const row = (l) => ({ document: { name: 'p/documents/listings/' + l.id, fields: { name: { stringValue: l.name }, price: { integerValue: String(l.price || 0) }, availabilityStatus: { stringValue: l.availabilityStatus || '' }, address: { stringValue: l.address || '' } } } });
    return new Response(JSON.stringify([row(EXACT), row(ZONE), row(RENTED)]), { status: 200 });
  }
  throw new Error('unstubbed ' + url);
};
const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(b) { this.body = b; return this; } });

let r = mkRes();
await handler({ method: 'GET', query: { k: 'chiave-sbagliata-0123456789abcdef' } }, r);
check('chiave sbagliata → 401', r.code === 401);

r = mkRes();
await handler({ method: 'GET', query: { k: feedKey() } }, r);
check('chiave derivata → 200 XML', r.code === 200 && String(r.headers['Content-Type']).includes('xml') && String(r.body).includes('<feed>'));

r = mkRes();
await handler({ method: 'GET', query: { k: feedKey(), gz: '1' } }, r);
const gz = r.body;
check('?gz=1 → gzip vero (magic 1f8b) che si riapre', Buffer.isBuffer(gz) && gz[0] === 0x1f && gz[1] === 0x8b && gunzipSync(gz).toString().includes('<feed>'));

// ═══ Nodo singolo (?id=) — la porta REST del Pubblicista ═══
r = mkRes();
await handler({ method: 'GET', query: { k: feedKey(), id: 'lst_pigneto' } }, r);
check('?id= → il SOLO nodo di quel listing, senza root <feed>', r.code === 200 && String(r.body).includes('<![CDATA[lst_pigneto]]>') && !String(r.body).includes('<feed>') && !String(r.body).includes('lst_centro'));
r = mkRes();
await handler({ method: 'GET', query: { k: feedKey(), id: 'lst_inesistente' } }, r);
check('?id= sconosciuto → 404 esplicito', r.code === 404);
r = mkRes();
await handler({ method: 'GET', query: { k: feedKey(), id: 'lst_out' } }, r);
check('?id= su un affittato → 409, mai un nodo vuoto', r.code === 409 && r.body.error === 'not_publishable');

console.log(`\nFeed Immobiliare: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
