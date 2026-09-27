// Risolutore Immobile Unico v1: guida l'handler vero con Firestore in memoria.
// Nessun portale o provider esterno viene contattato.

process.env.HOMIE_SECRET = 'resolver-test-secret';
process.env.FIREBASE_API_KEY = 'test-key';
process.env.FIREBASE_ADMIN_EMAIL = 'admin@example.test';
process.env.FIREBASE_ADMIN_PASS = 'test-pass';

let passed = 0, failed = 0;
const check = (name, condition, detail) => {
  if (condition) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (detail === undefined ? '' : ' — ' + JSON.stringify(detail))); }
};

const DB = new Map();
const encode = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
};
const document = (path, value) => ({
  name: `projects/test/databases/(default)/documents/${path}`,
  fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])),
});
const json = (body, status = 200) => ({
  ok: status < 400, status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  if (href.includes('identitytoolkit')) return json({ idToken: 'firebase-test-token' });
  if (href.includes(':runQuery')) {
    const query = JSON.parse(options.body).structuredQuery;
    const collection = query.from[0].collectionId;
    const rows = [...DB.entries()]
      .filter(([path]) => path.startsWith(collection + '/') && path.split('/').length === 2)
      .slice(0, query.limit);
    return json(rows.map(([path, value]) => ({ document: document(path, value) })));
  }
  throw new Error('unexpected network call: ' + href);
};

const listing = (id, data) => DB.set('listings/' + id, { ...data });
listing('apt-a', {
  name: 'Casa Aurelia', address: 'Via Aurelia 10, Roma', zone: 'Prati',
  type: 'Apartment', price: 1500, status: 'available', availableFrom: 'Immediate',
  bedrooms: 2, bathrooms: 1, sqm: 70, floor: 0, furnished: true,
  description: 'Appartamento luminoso.', features: ['Ascensore'],
  ownerPhone: '+390000000000', internalNotes: 'mai esporre',
});
listing('apt-b', {
  name: 'Casa Flaminia', address: 'Via Flaminia 20, Roma', zone: 'Prati',
  type: 'Apartment', price: 1600, status: 'available', availableFrom: 'Immediate',
});
listing('apt-c', {
  name: 'Casa Clodia', address: 'Via Clodia 30, Roma', zone: 'Prati',
  type: 'Apartment', price: 1700, status: 'available', availableFrom: 'Immediate',
});
listing('dup-a', {
  name: 'Casa Doppia A', address: 'Via Doppia 8, Roma', zone: 'San Giovanni',
  type: 'Apartment', price: 1200, status: 'available', availableFrom: 'Immediate',
});
listing('dup-b', {
  name: 'Casa Doppia B', address: 'Via Doppia 8, Roma', zone: 'San Giovanni',
  type: 'Apartment', price: 1250, status: 'available', availableFrom: 'Immediate',
});
listing('wait-a', {
  name: 'Attico Futuro', address: 'Via Futura 5, Roma', zone: 'Prati',
  type: 'Apartment', price: 1450, status: 'waitlist', availableFrom: '2099-05-01',
});
listing('rent-a', {
  name: 'Casa Affittata', address: 'Via Chiusa 9, Roma', zone: 'Prati',
  type: 'Apartment', price: 1400, status: 'rented', availableFrom: '2099-06-01',
});
listing('private-a', {
  name: 'Bozza privata', address: 'Via Segreta 1', zone: 'Prati',
  type: 'Apartment', price: 1000, status: 'draft', availableFrom: 'Immediate',
});
for (let i = 0; i < 30; i++) listing('bulk-' + String(i).padStart(2, '0'), {
  name: 'Studio campione ' + i, address: 'Via Campione ' + i + ', Roma', zone: 'Ostia',
  type: 'Studio', price: 900 + i, status: 'available', availableFrom: 'Immediate',
});

DB.set('portalPubs/immobiliare_apt-a', {
  portal: 'immobiliare', listingId: 'apt-a', status: 'live',
  remoteId: '98123', remoteUrl: 'https://www.immobiliare.it/annunci/98123/',
});
DB.set('portalPubs/idealista_wait-a', {
  portal: 'idealista', listingId: 'wait-a', status: 'live',
  remoteId: '31005', remoteUrl: 'https://www.idealista.it/immobile/31005/',
});

const { default: handler } = await import('../../api/phone/agent-tools.js');
const call = async (query) => {
  let status = 0, body = null;
  const req = { method: 'GET', query, headers: { 'x-homie-secret': 'resolver-test-secret' }, url: '/api/phone/agent-tools' };
  const res = {
    setHeader() {}, status(code) { status = code; return this; },
    json(value) { body = value; return this; }, end() { return this; },
  };
  await handler(req, res);
  return { status, body };
};

// Retrocompatibilita: op=catalog senza input conserva la risposta storica,
// ma non gonfia il contesto della chiamata con schede complete.
{
  const { status, body } = await call({ op: 'catalog' });
  const a = body.listings.find(row => row.id === 'apt-a');
  check('catalogo senza input resta compatibile', status === 200 && body.ok && Array.isArray(body.listings));
  check('catalogo live resta entro 25 risultati', body.listings.length === 25
    && body.coverage.listings.responseLimit === 25, body.coverage);
  check('catalogo live conserva lo schema leggero storico', a?.type === 'Apartment'
    && a.priceEurMonth === 1500 && a.availableFrom === 'Immediate'
    && a.address === undefined && a.description === undefined && a.availability === undefined, a);
  check('proiezione pubblica non espone campi privati',
    !JSON.stringify(body).includes('ownerPhone') && !JSON.stringify(body).includes('internalNotes'));
  check('affittato mai fra le alternative generiche', !body.listings.some(row => row.id === 'rent-a'));
  check('bozza privata assente dal catalogo', !JSON.stringify(body).includes('private-a'));
  check('catalogo dichiara fonte, istante e copertura',
    body.source === 'BOOM listings' && !Number.isNaN(Date.parse(body.checkedAt))
      && body.coverage.listings.complete === false
      && body.coverage.listings.sourceComplete === true, body.coverage);
}

{
  const byId = await call({ op: 'catalog', reference: 'apt-a' });
  check('reference per listing id e esatta', byId.body.match === 'exact'
    && byId.body.results.length === 1 && byId.body.results[0].id === 'apt-a');
  const rich = byId.body.results[0];
  check('lookup mirato restituisce la proiezione ricca con DISPO',
    rich.address === 'Via Aurelia 10, Roma' && rich.bathrooms === 1 && rich.floor === '0'
      && rich.availability.state === 'available_now', rich);
  check('id BOOM non legge portalPubs inutilmente', byId.body.coverage.portalPubs.checked === false);

  const byUrl = await call({ op: 'catalog', reference: 'https://www.boomrome.com/listing/apt-a?utm=test' });
  check('reference per URL BOOM e esatta', byUrl.body.match === 'exact' && byUrl.body.results[0].id === 'apt-a');

  const byAddress = await call({ op: 'catalog', query: 'Via Aurelia 10, Roma' });
  check('query per indirizzo esatto e esatta', byAddress.body.match === 'exact'
    && byAddress.body.results[0].id === 'apt-a');
}

{
  const byRemoteId = await call({ op: 'catalog', reference: '98123' });
  check('remoteId portalPubs risolve il listing BOOM', byRemoteId.body.match === 'exact'
    && byRemoteId.body.results[0].id === 'apt-a'
    && byRemoteId.body.coverage.portalPubs.checked === true);
  const byRemoteUrl = await call({ op: 'catalog', reference: 'https://www.immobiliare.it/annunci/98123/?foo=bar' });
  check('URL portale mappato risolve senza navigare il portale', byRemoteUrl.body.match === 'exact'
    && byRemoteUrl.body.results[0].id === 'apt-a'
    && byRemoteUrl.body.source === 'BOOM listings + portalPubs');
}

{
  const ambiguous = await call({ op: 'catalog', query: 'Via Doppia 8, Roma' });
  check('indirizzo duplicato resta ambiguo', ambiguous.body.match === 'ambiguous'
    && ambiguous.body.results.length === 2
    && ambiguous.body.note.includes('distinguishing detail'), ambiguous.body);

  const unknown = await call({ op: 'catalog', reference: 'https://www.idealista.it/immobile/999999/' });
  check('URL esterno non mappato resta non verificato', unknown.body.match === 'none'
    && unknown.body.error === 'unverified_external_reference'
    && unknown.body.results.length === 0, unknown.body);
}

{
  const filtered = await call({ op: 'catalog', type: 'Apartment', zone: 'Prati', maxPrice: '2000', moveIn: '2099-06-01' });
  check('ricerca filtrata restituisce al massimo due risultati', filtered.body.match === 'ambiguous'
    && filtered.body.results.length === 2, filtered.body.results);
  check('ricerca di alternative non offre mai la casa affittata',
    !filtered.body.results.some(row => row.id === 'rent-a'));
}

{
  const waiting = await call({ op: 'catalog', reference: 'wait-a' });
  check('waitlist resta disponibile piu avanti con la data vera', waiting.body.match === 'exact'
    && waiting.body.results[0].availability.state === 'available_later'
    && waiting.body.results[0].availability.date === '2099-05-01', waiting.body.results[0]);
  const tooEarly = await call({ op: 'catalog', query: 'Attico Futuro', moveIn: '2099-04-01' });
  check('move-in precedente non trasforma la waitlist in disponibile', tooEarly.body.match === 'none');
  const rented = await call({ op: 'catalog', reference: 'rent-a' });
  check('reference esatta riconosce l’affittato ma lo marca unavailable', rented.body.match === 'exact'
    && rented.body.results[0].availability.state === 'unavailable');
}

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nAll ${passed} property resolver checks passed`);
process.exit(failed ? 1 : 0);
