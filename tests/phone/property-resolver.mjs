// Risolutore Immobile Unico v1: guida l'handler vero con Firestore in memoria.
// Nessun portale o provider esterno viene contattato.

import { readFileSync } from 'node:fs';

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
let runQueryCalls = 0;
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
    runQueryCalls++;
    const query = JSON.parse(options.body).structuredQuery;
    const collection = query.from[0].collectionId;
    const rows = [...DB.entries()]
      .filter(([path]) => path.startsWith(collection + '/') && path.split('/').length === 2)
      .slice(0, query.limit);
    return json(rows.map(([path, value]) => ({ document: document(path, value) })));
  }
  const marker = '/documents/';
  if (href.includes('firestore.googleapis.com') && href.includes(marker)
    && (!options.method || options.method === 'GET')) {
    const encodedPath = href.slice(href.indexOf(marker) + marker.length).split('?')[0];
    const path = encodedPath.split('/').map(decodeURIComponent).join('/');
    return DB.has(path) ? json(document(path, DB.get(path))) : json({ error: 'not found' }, 404);
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
listing('nodate-a', {
  name: 'Casa Senza Data', address: 'Via Libera 7, Roma', zone: 'EUR',
  type: 'Apartment', price: 1300, status: 'available',
});
listing('unreadable-a', {
  name: 'Casa Da Confermare', address: 'Via Incerta 4, Roma', zone: 'EUR',
  type: 'Apartment', price: 1350, status: 'available', availableDate: 'da concordare',
});
listing('guessed-a', {
  name: 'Casa Anno Da Confermare', address: 'Via Calendario 6', zone: 'EUR',
  type: 'Apartment', price: 1300, status: 'available', availableDate: '1 Aug',
});
listing('wait-expired-a', {
  name: 'Attico Con Vecchia Data', address: 'Via Calendario 8', zone: 'EUR',
  type: 'Apartment', price: 1300, status: 'waitlist', availableFrom: '2000-01-01',
});
listing('montezebio-a', {
  name: 'Prati cozy', address: 'Via Montezebio', zone: 'Prati',
  type: 'Loft', price: 1500, status: 'available', availableFrom: '2099-03-01',
});
listing('numeric-spaces-a', {
  name: 'Casa civici separati', address: 'Via Roma 1 2', zone: 'Test',
  type: 'Apartment', price: 3100, status: 'available', availableFrom: 'Immediate',
});
listing('numeric-spaces-b', {
  name: 'Casa civico frazionato', address: 'Via Roma 12 3', zone: 'Test',
  type: 'Apartment', price: 3200, status: 'available', availableFrom: 'Immediate',
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
  const headers = {};
  const req = { method: 'GET', query, headers: { 'x-homie-secret': 'resolver-test-secret' }, url: '/api/phone/agent-tools' };
  const res = {
    setHeader(name, value) { headers[name] = value; }, status(code) { status = code; return this; },
    json(value) { body = value; return this; }, end() { return this; },
  };
  await handler(req, res);
  return { status, body, headers };
};

// Retrocompatibilita: op=catalog senza input conserva la risposta storica,
// ma non gonfia il contesto della chiamata con schede complete.
{
  const queriesBefore = runQueryCalls;
  const { status, body } = await call({ op: 'catalog' });
  const a = body.listings.find(row => row.id === 'apt-a');
  check('catalogo senza input resta compatibile', status === 200 && body.ok && Array.isArray(body.listings));
  check('catalogo live resta entro 25 risultati', body.listings.length === 25
    && body.coverage.listings.responseLimit === 25, body.coverage);
  check('catalogo live conserva identita e disponibilita nello schema leggero', a?.type === 'Apartment'
    && a.priceEurMonth === 1500 && a.availableFrom === 'Immediate'
    && a.address === 'Via Aurelia 10, Roma' && a.description === undefined
    && a.availability?.state === 'available_now', a);
  check('catalogo generico non perde data ignota, futura e anno dedotto',
    body.listings.find(row => row.id === 'nodate-a')?.availability?.state === 'needs_confirmation'
      && body.listings.find(row => row.id === 'guessed-a')?.availability?.state === 'needs_confirmation'
      && body.listings.find(row => row.id === 'guessed-a')?.availability?.yearInferred === true
      && body.listings.find(row => row.id === 'wait-a')?.availability?.state === 'available_later'
      && body.listings.find(row => row.id === 'wait-a')?.availability?.date === '2099-05-01', body.listings);
  check('nota generica distingue data futura o incerta da indisponibilita',
    body.note.includes('A future or unconfirmed date does not mean unavailable')
      && body.note.includes('unverified availability, not proven unavailability'));
  check('proiezione pubblica non espone campi privati',
    !JSON.stringify(body).includes('ownerPhone') && !JSON.stringify(body).includes('internalNotes'));
  check('affittato mai fra le alternative generiche', !body.listings.some(row => row.id === 'rent-a'));
  const unavailable = body.unavailableListings.find(row => row.id === 'rent-a');
  check('affittato riconoscibile soltanto nell indice compatto separato', unavailable?.name === 'Casa Affittata'
    && unavailable.address === 'Via Chiusa 9, Roma' && unavailable.type === 'Apartment'
    && unavailable.status === 'rented' && unavailable.priceEurMonth === 1400
    && unavailable.description === undefined && unavailable.features === undefined, unavailable);
  check('indice chiusi dichiara cap e copertura senza una seconda lettura',
    body.coverage.listings.unavailableReturned === body.unavailableListings.length
      && body.coverage.listings.unavailableResponseLimit === 8
      && typeof body.coverage.listings.unavailableComplete === 'boolean'
      && runQueryCalls === queriesBefore + 1, body.coverage);
  check('bozza privata assente dal catalogo', !JSON.stringify(body).includes('private-a'));
  check('catalogo dichiara fonte, istante e copertura',
    body.source === 'BOOM listings' && !Number.isNaN(Date.parse(body.checkedAt))
      && body.coverage.listings.complete === false
      && body.coverage.listings.sourceComplete === true, body.coverage);
}

{
  const reserved = [];
  for (let i = 0; i < 9; i++) {
    const path = 'listings/reserved-' + i;
    reserved.push(path);
    DB.set(path, {
      name: 'Casa riservata ' + i, address: 'Via Riserva ' + i + ', Roma',
      zone: 'Roma', type: 'Apartment', price: 1100 + i, status: 'reserved',
    });
  }
  const capped = await call({ op: 'catalog' });
  check('indice chiusi resta capato e non pretende copertura completa',
    capped.body.unavailableListings.length === 8
      && capped.body.coverage.listings.unavailableComplete === false,
  capped.body.coverage);
  for (const path of reserved) DB.delete(path);
}

{
  const byId = await call({ op: 'catalog', reference: 'apt-a' });
  check('reference per listing id e esatta', byId.body.match === 'exact'
    && byId.body.results.length === 1 && byId.body.results[0].id === 'apt-a');
  check('match esatto ha ragione e nota coerenti', byId.body.reason === 'exact'
    && byId.body.certainty === 'verified'
    && byId.body.note.includes('identity is verified')
    && !byId.body.note.includes('No verified BOOM property'), byId.body);
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

  const joinedAddress = await call({ op: 'catalog', query: 'Via Monte Zebio' });
  check('spazi ASR dentro un toponimo conservano il match esatto', joinedAddress.body.match === 'exact'
    && joinedAddress.body.certainty === 'verified'
    && joinedAddress.body.results.length === 1
    && joinedAddress.body.results[0].id === 'montezebio-a', joinedAddress.body);

  listing('montezebio-b', {
    name: 'Seconda casa Montezebio', address: 'Via Monte Zebio', zone: 'Prati',
    type: 'Apartment', price: 1550, status: 'available', availableFrom: 'Immediate',
  });
  const joinedDuplicate = await call({ op: 'catalog', query: 'Via Monte Zebio' });
  check('normalizzazione degli spazi non sceglie fra indirizzi duplicati',
    joinedDuplicate.body.match === 'ambiguous'
      && joinedDuplicate.body.certainty === 'needs_confirmation'
      && joinedDuplicate.body.results.length === 2
      && joinedDuplicate.body.results.some(row => row.id === 'montezebio-a')
      && joinedDuplicate.body.results.some(row => row.id === 'montezebio-b'), joinedDuplicate.body);
  DB.delete('listings/montezebio-b');

  const partialAddress = await call({ op: 'catalog', query: 'Via Monte' });
  check('normalizzazione degli spazi non promuove un indirizzo parziale a exact',
    partialAddress.body.match !== 'exact' && partialAddress.body.results.length === 0,
    partialAddress.body);

  const mergedCivic = await call({ op: 'catalog', query: 'Via Roma 12' });
  check('i gruppi numerici 1 e 2 non collidono con il civico 12',
    mergedCivic.body.match === 'none' && mergedCivic.body.results.length === 0,
    mergedCivic.body);

  const mergedLongCivic = await call({ op: 'catalog', query: 'Via Roma 123' });
  check('i gruppi numerici 12 e 3 non collidono con il civico 123',
    mergedLongCivic.body.match === 'none' && mergedLongCivic.body.results.length === 0,
    mergedLongCivic.body);
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

  const namedOutsideBudget = await call({
    op: 'catalog', query: 'Casa Aurelia', maxPrice: '1200',
  });
  check('identita nominata non scompare quando e fuori budget', namedOutsideBudget.body.match === 'exact'
    && namedOutsideBudget.body.results[0].id === 'apt-a'
    && namedOutsideBudget.body.results[0].criteriaMatch === false
    && namedOutsideBudget.body.results[0].criteriaMismatches.includes('maxPrice')
    && namedOutsideBudget.body.note.includes('does not satisfy')
    && !namedOutsideBudget.body.note.includes('No verified BOOM property'), namedOutsideBudget.body);

  const alternativesOutsideBudget = await call({ op: 'catalog', type: 'Apartment', maxPrice: '1100' });
  check('senza identita il budget continua a filtrare le alternative',
    alternativesOutsideBudget.body.match === 'none' && alternativesOutsideBudget.body.results.length === 0,
    alternativesOutsideBudget.body);
  check('ricerca senza risultati chiarisce un criterio senza chiedere un annuncio non citato',
    alternativesOutsideBudget.body.certainty === 'needs_confirmation'
      && alternativesOutsideBudget.body.verification.scope === 'search_criteria'
      && alternativesOutsideBudget.body.verification.nextStep === 'clarify_one_search_criterion',
    alternativesOutsideBudget.body);

  const duplicateWithBudget = await call({
    op: 'catalog', query: 'Via Doppia 8, Roma', maxPrice: '1225',
  });
  check('il budget non sceglie fra due identita uguali', duplicateWithBudget.body.match === 'ambiguous'
    && duplicateWithBudget.body.results.length === 2
    && duplicateWithBudget.body.results.some(row => row.id === 'dup-a' && row.criteriaMatch === true)
    && duplicateWithBudget.body.results.some(row => row.id === 'dup-b'
      && row.criteriaMatch === false && row.criteriaMismatches.includes('maxPrice')),
  duplicateWithBudget.body);
}

{
  const waiting = await call({ op: 'catalog', reference: 'wait-a' });
  check('waitlist resta disponibile piu avanti con la data vera', waiting.body.match === 'exact'
    && waiting.body.results[0].availability.state === 'available_later'
    && waiting.body.results[0].availability.date === '2099-05-01', waiting.body.results[0]);
  const tooEarly = await call({ op: 'catalog', query: 'Attico Futuro', moveIn: '2099-04-01' });
  check('move-in precedente conserva identita ma segnala incompatibilita', tooEarly.body.match === 'exact'
    && tooEarly.body.results[0].id === 'wait-a'
    && tooEarly.body.results[0].availability.state === 'available_later'
    && tooEarly.body.results[0].criteriaMatch === false
    && tooEarly.body.results[0].criteriaMismatches.includes('moveIn'), tooEarly.body);
  const rented = await call({ op: 'catalog', reference: 'rent-a' });
  check('reference esatta riconosce l’affittato ma lo marca unavailable', rented.body.match === 'exact'
    && rented.body.results[0].availability.state === 'unavailable');
}

{
  const noDate = await call({
    op: 'catalog', query: 'Casa Senza Data', moveIn: '2099-12-31',
  });
  check('available senza data richiede conferma anche col filtro move-in', noDate.body.match === 'exact'
    && noDate.body.results[0].id === 'nodate-a'
    && noDate.body.results[0].availability.state === 'needs_confirmation'
    && noDate.body.results[0].criteriaMatch === false, noDate.body);

  const unreadable = await call({ op: 'catalog', reference: 'unreadable-a' });
  check('testo disponibilita illeggibile resta needs_confirmation', unreadable.body.match === 'exact'
    && unreadable.body.results[0].availability.state === 'needs_confirmation', unreadable.body);
  const unreadableMoveIn = await call({
    op: 'catalog', query: 'Casa Da Confermare', moveIn: '2099-12-31',
  });
  check('testo illeggibile conserva identita senza superare il filtro move-in',
    unreadableMoveIn.body.match === 'exact'
      && unreadableMoveIn.body.results[0].availability.state === 'needs_confirmation'
      && unreadableMoveIn.body.results[0].criteriaMatch === false
      && unreadableMoveIn.body.results[0].criteriaMismatches.includes('moveIn'), unreadableMoveIn.body);

  for (const id of ['guessed-a', 'wait-expired-a']) {
    const uncertain = await call({ op: 'catalog', reference: id, moveIn: '2099-12-31' });
    check(id + ': anno dedotto o waitlist scaduta richiede conferma, mai data certa',
      uncertain.body.match === 'exact'
        && uncertain.body.results[0].availability.state === 'needs_confirmation'
        && uncertain.body.results[0].criteriaMatch === false, uncertain.body);
  }
}

{
  // L'incidente reale: una casa citata dal cliente puo essere pubblicata su
  // un portale senza essere nel catalogo BOOM. Assenza non prova chiusura.
  for (const query of ['Via Petronio Arbitro', "Via Val d'Ossola"]) {
    const missing = await call({ op: 'catalog', query });
    check(query + ': assente significa da verificare, mai indisponibile',
      missing.body.match === 'none' && missing.body.results.length === 0
        && missing.body.certainty === 'needs_confirmation'
        && missing.body.verification?.needed === true
        && missing.body.verification.scope === 'property_identity_and_availability'
        && missing.body.verification.nextStep === 'ask_for_listing_link_or_reference'
        && missing.body.note.includes('does not mean it is unavailable')
        && missing.body.note.includes('promote a service unless the caller requests'), missing.body);
  }
  const unmapped = await call({ op: 'catalog', reference: 'https://www.casa.it/immobili/55039702/' });
  check('link portale senza mapping richiede verifica senza dichiarare casa chiusa',
    unmapped.body.match === 'none' && unmapped.body.reason === 'unverified_external_reference'
      && unmapped.body.certainty === 'needs_confirmation'
      && unmapped.body.verification?.needed === true
      && unmapped.body.note.includes('does not mean the home is unavailable'), unmapped.body);

  listing('tor-duplex', { name: 'Tor di Quinto Duplex', address: 'Via Di Tor Di quinto 39',
    type: 'Duplex', status: 'available', availableFrom: 'Immediate' });
  listing('tor-onebed', { name: 'Tor di Quinto One-Bed', address: 'Via Di Tor Di Quinto 39',
    type: 'bilocale', status: 'available', availableFrom: '2099-12-31' });
  const sameStreet = await call({ op: 'catalog', query: 'Via Di Tor Di Quinto 39' });
  check('due case reali allo stesso indirizzo restano ambigue anche con date diverse',
    sameStreet.body.match === 'ambiguous' && sameStreet.body.certainty === 'needs_confirmation'
      && sameStreet.body.results.length === 2
      && new Set(sameStreet.body.results.map(row => row.availability.state)).size === 2, sameStreet.body);
  DB.delete('listings/tor-duplex');
  DB.delete('listings/tor-onebed');
}

{
  const previous = DB.get('listings/apt-a');
  const first = await call({ op: 'catalog', reference: 'apt-a' });
  listing('apt-a', { ...previous, availableFrom: '2099-09-01' });
  const second = await call({ op: 'catalog', reference: 'apt-a' });
  check('ogni lettura voce usa il catalogo aggiornato e vieta cache HTTP',
    first.body.results[0].availability.state === 'available_now'
      && second.body.results[0].availability.state === 'available_later'
      && second.body.results[0].availability.date === '2099-09-01'
      && second.headers['Cache-Control'] === 'private, no-store, max-age=0', second);
  DB.set('listings/apt-a', previous);
}

{
  const contract = readFileSync(new URL('../../bot/RECEPTIONIST.md', import.meta.url), 'utf8');
  check('contratto provider dichiara tutti gli input del resolver',
    ['reference', 'query', 'type', 'zone', 'maxPrice', 'moveIn']
      .every(name => contract.includes('`' + name + '`'))
      && !contract.includes('nessun parametro dal modello'));
  check('contratto provider insegna match e certezza', contract.includes('match:exact')
    && contract.includes('certainty:verified') && contract.includes('certainty:needs_confirmation'));
  check('contratto provider descrive indice chiusi compatto e lookup mirato atomico',
    contract.includes('`unavailableListings`')
      && contract.includes('identità compatto')
      && contract.includes('stesso rilascio'));
}

{
  // Il cap viene raggiunto apposta: una scansione parziale non puo provare
  // che il primo risultato sia unico o che un riferimento esterno non esista.
  const addedListings = [];
  for (let i = 0; i < 205; i++) {
    const path = 'listings/partial-' + String(i).padStart(3, '0');
    addedListings.push(path);
    DB.set(path, {
      name: 'Copertura campione ' + i, address: 'Via Copertura ' + i + ', Roma',
      zone: 'Test', type: 'Studio', price: 800 + i, status: 'available', availableFrom: 'Immediate',
    });
  }
  const lateDuplicate = 'listings/late-aurelia-duplicate';
  addedListings.push(lateDuplicate);
  DB.set(lateDuplicate, {
    name: 'Aurelia duplicata', address: 'Via Aurelia 10, Roma', zone: 'Prati',
    type: 'Apartment', price: 1550, status: 'available', availableFrom: 'Immediate',
  });

  const partialQuery = await call({ op: 'catalog', query: 'Via Aurelia 10, Roma' });
  check('scansione listing parziale non dichiara un exact definitivo',
    partialQuery.body.coverage.listings.complete === false
      && partialQuery.body.match === 'ambiguous'
      && partialQuery.body.certainty === 'needs_confirmation'
      && partialQuery.body.reason === 'coverage_incomplete', partialQuery.body);

  const directUnderPartial = await call({ op: 'catalog', reference: 'apt-a' });
  check('id noto usa il documento diretto anche con catalogo parziale',
    directUnderPartial.body.coverage.listings.complete === false
      && directUnderPartial.body.coverage.listings.directChecked === true
      && directUnderPartial.body.match === 'exact'
      && directUnderPartial.body.certainty === 'verified', directUnderPartial.body);

  const addedPubs = [];
  for (let i = 0; i < 801; i++) {
    const path = 'portalPubs/partial_' + String(i).padStart(3, '0');
    addedPubs.push(path);
    DB.set(path, {
      portal: 'idealista', listingId: 'apt-b', status: 'live',
      remoteId: 'partial-' + i,
      remoteUrl: 'https://www.idealista.it/immobile/partial-' + i + '/',
    });
  }
  const partialExternal = await call({
    op: 'catalog', reference: 'https://www.idealista.it/immobile/not-seen/',
  });
  check('copertura portalPubs parziale non dichiara reference esterna non mappata',
    partialExternal.body.coverage.portalPubs.complete === false
      && partialExternal.body.match === 'ambiguous'
      && partialExternal.body.certainty === 'needs_confirmation'
      && partialExternal.body.reason === 'coverage_incomplete'
      && partialExternal.body.error === undefined, partialExternal.body);

  for (const path of addedListings.concat(addedPubs)) DB.delete(path);
}

{
  const old = DB.get('listings/apt-a');
  listing('apt-a', {...old, catalogReview:{price:'conflict',availability:'conflict'},
    description:'Old price 1500, available immediately.'});
  const r = (await call({op:'catalog',reference:'apt-a',moveIn:'2099-12-31',maxPrice:'2000'})).body.results[0];
  check('fonti discordanti conservano identita ma non prezzo o data finti', r.id === 'apt-a'
    && r.priceEurMonth === null && r.availableFrom === null && r.availability.date === null
    && r.availability.state === 'needs_confirmation' && r.description === null
    && r.requiresConfirmation.includes('price') && r.requiresConfirmation.includes('availability')
    && r.criteriaMatch === false, r);
  const generic = (await call({op:'catalog'})).body.listings.find(r=>r.id==='apt-a');
  check('conflitti visibili anche nel catalogo compatto', generic.priceEurMonth === null
    && generic.requiresConfirmation.includes('price') && generic.availability.state === 'needs_confirmation');
  listing('apt-a', {...old,status:'rented',catalogReview:{availability:'conflict'}});
  check('conflitto non riapre una casa affittata',
    (await call({op:'catalog',reference:'apt-a'})).body.results[0].availability.state === 'unavailable');
  listing('apt-a', old);
}

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nAll ${passed} property resolver checks passed`);
process.exit(failed ? 1 : 0);
