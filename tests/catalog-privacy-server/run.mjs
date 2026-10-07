// Public catalog surfaces must agree on hidden records and unknown status.
// Run: node tests/catalog-privacy-server/run.mjs
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url); // no SMTP dependency or network

const oldEnv = Object.fromEntries(['FIREBASE_PROJECT_ID', 'FIREBASE_API_KEY',
  'FIREBASE_ADMIN_EMAIL', 'FIREBASE_ADMIN_PASS', 'ANTHROPIC_API_KEY',
  'HOMIE_SECRET', 'CRON_SECRET', 'GEOCODE_SECRET'].map(k => [k, process.env[k]]));
Object.assign(process.env, {
  FIREBASE_PROJECT_ID: 'catalog-privacy-test', FIREBASE_API_KEY: 'fixture-key',
  FIREBASE_ADMIN_EMAIL: 'fixture@example.invalid', FIREBASE_ADMIN_PASS: 'fixture-only',
  ANTHROPIC_API_KEY: 'fixture-only', HOMIE_SECRET: 'fixture-only',
});

const { default: llms } = await import('../../api/llms-listings.js');
const { default: sitemap } = await import('../../api/sitemap-listings.js');
const { default: ask, buildContext } = await import('../../api/ask-listing.js');
const { default: feed, buildFeed, feedKey, publishable } = await import('../../api/feed/immobiliare.js');
const { default: matcher, matches } = await import('../../api/search/matcher.js');
const { default: geocodeAll } = await import('../../api/geocode-all.js');

let passed = 0;
function check(condition, message) {
  if (!condition) throw new Error(message);
  passed++;
}

const future = '2099-01-01';
const homes = {
  public: { name: 'Public Fixture Home', zone: 'Prati', status: 'available',
    price: 1200, description: 'Bright one bedroom', updatedAt: '2026-10-01T10:00:00Z',
    secretSynthetic: 'operator-secret' },
  private: { name: 'Hidden Fixture Secret', zone: 'Prati', status: 'available',
    visibility: 'private', price: 1300, secretSynthetic: 'operator-secret' },
  unpublished: { name: 'Unpublished Fixture Secret', status: 'available',
    published: false, price: 1400, secretSynthetic: 'operator-secret' },
  missing: { name: 'Unknown Status Home', zone: 'Prati', price: 1100,
    secretSynthetic: 'operator-secret' },
  unreadable: { name: 'Date On Request Home', zone: 'Prati', status: 'available',
    availableDate: 'da concordare', price: 900 },
  ahead: { name: 'Reserved Ahead Home', zone: 'Prati', status: 'rented',
    availableFrom: future, price: 1500 },
};
const fsValue = v => Array.isArray(v) ? { arrayValue: { values: v.map(fsValue) } }
  : v && typeof v === 'object' ? { mapValue: { fields: fsFields(v) } }
  : typeof v === 'number' ? { integerValue: String(v) }
  : typeof v === 'boolean' ? { booleanValue: v }
  : { stringValue: String(v) };
const fsFields = data => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)]));
const doc = (id, data) => ({ name: `projects/test/databases/(default)/documents/listings/${id}`,
  fields: fsFields(data) });
const originalFetch = globalThis.fetch;
const restore = () => { globalThis.fetch = originalFetch;
  for (const [k, v] of Object.entries(oldEnv)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
};
function response() {
  return { statusCode: 0, code: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = this.code = n; return this; },
    json(v) { this.body = v; return this; },
    send(v) { this.body = v; return this; },
    end(v) { this.body = v; return this; } };
}
const pages = [
  [doc('public-id', homes.public), doc('private-id', homes.private),
    doc('unpublished-id', homes.unpublished), doc('missing-id', homes.missing)],
  [doc('unreadable-id', homes.unreadable), doc('ahead-id', homes.ahead)],
];

try {
  let adminReads = 0;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.includes('signInWithPassword')) return { ok: true, status: 200,
      json: async () => ({ idToken: 'fixture-token' }) };
    if (!u.includes('/documents/listings?')) throw new Error(`Unexpected catalog read: ${u}`);
    if (!options.headers?.Authorization) return { ok: false, status: 403 };
    adminReads++;
    const page = u.includes('pageToken=next') ? 1 : 0;
    return { ok: true, status: 200, json: async () => ({ documents: pages[page],
      ...(page === 0 ? { nextPageToken: 'next' } : {}) }) };
  };
  let res = response();
  await llms({ method: 'GET' }, res);
  const md = String(res.body);
  check(res.statusCode === 200 && adminReads === 2, 'LLM inventory reads all pages through admin fallback');
  check(md.includes('Public Fixture Home') && md.includes('Reserved Ahead Home')
    && md.includes('Date On Request Home'), 'LLM inventory keeps public bookable homes');
  check(!md.includes('Hidden Fixture Secret') && !md.includes('Unpublished Fixture Secret')
    && !md.includes('Unknown Status Home') && !md.includes('operator-secret'),
    'LLM inventory excludes private, unpublished, unknown status and operator fields');
  check(md.includes('availability on request — ask BOOM for the exact date')
    && md.includes(`free from ${future}`), 'LLM inventory preserves unknown and known release dates');
  check(res.headers['Cache-Control'] === 'public, max-age=0, s-maxage=120',
    'LLM inventory has a bounded two-minute edge cache');

  res = response();
  await sitemap({ method: 'GET' }, res);
  const xml = String(res.body);
  check(res.statusCode === 200 && adminReads === 4, 'sitemap reads all pages through admin fallback');
  check(xml.includes('/listing/public-id') && xml.includes('/listing/ahead-id')
    && xml.includes('/listing/unreadable-id'), 'sitemap includes public bookable homes');
  check(!xml.includes('private-id') && !xml.includes('unpublished-id')
    && !xml.includes('missing-id') && !xml.includes('operator-secret'),
    'sitemap excludes hidden and unknown-status IDs');
  check(res.headers['Cache-Control'] === 'public, max-age=0, s-maxage=120',
    'sitemap has a bounded two-minute edge cache');

  let modelCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.includes('signInWithPassword')) return { ok: true, status: 200,
      json: async () => ({ idToken: 'fixture-token' }) };
    if (u.includes('/documents/listings/private-id?')) {
      if (!options.headers?.Authorization) return { ok: false, status: 403 };
      return { ok: true, status: 200, json: async () => doc('private-id', homes.private) };
    }
    if (u.includes('/documents/listings/unpublished-id?'))
      return { ok: true, status: 200, json: async () => doc('unpublished-id', homes.unpublished) };
    if (u.includes('api.anthropic.com')) { modelCalls++; throw new Error('private listing sent to model'); }
    throw new Error(`Unexpected ask read: ${u}`);
  };
  for (const id of ['private-id', 'unpublished-id']) {
    res = response();
    await ask({ method: 'POST', headers: {}, socket: { remoteAddress: `fixture-${id}` },
      body: { id, question: 'Is this home available?' } }, res);
    check(res.statusCode === 404 && res.body.error === 'listing_not_found',
      `ask-listing hides ${id} even when Firestore returns it`);
  }
  check(modelCalls === 0, 'private apartment facts never reach the model');
  const staleContext = buildContext({ name: 'Rented Fixture', status: 'rented',
    availableDate: '2026-01-01', description: 'Available from January 2026.' });
  check(staleContext.includes('Availability:')
    && !staleContext.includes('Available from January 2026.'),
    'listing assistant does not repeat an older availability claim to the model');

  check(publishable({ id: 'private-id', ...homes.private }) === false
    && publishable({ id: 'missing-id', ...homes.missing }) === false
    && publishable({ id: 'conflicting-id', ...homes.public, status: 'rented',
      availabilityStatus: 'available' }) === false,
    'portal feed does not publish hidden, unknown-status or rented listings');
  const feedXml = buildFeed(Object.entries(homes).map(([id, data]) => ({ id: `${id}-id`, ...data })));
  check(feedXml.includes('public-id') && feedXml.includes('ahead-id')
    && !feedXml.includes('private-id') && !feedXml.includes('unpublished-id')
    && !feedXml.includes('missing-id') && !feedXml.includes('operator-secret'),
    'portal feed output contains only public bookable listings');

  const configuredSecret = process.env.HOMIE_SECRET;
  delete process.env.HOMIE_SECRET;
  res = response();
  await feed({ method: 'GET', query: { k: 'any-key' } }, res);
  check(feedKey() === null && res.statusCode === 503 && res.body.error === 'feed_unconfigured',
    'portal feed fails closed if the signing secret is absent');
  process.env.HOMIE_SECRET = configuredSecret;

  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.includes('signInWithPassword')) return { ok: true, status: 200,
      json: async () => ({ idToken: 'fixture-token' }) };
    if (u.includes(':runQuery')) {
      const collection = JSON.parse(options.body).structuredQuery.from[0].collectionId;
      if (collection !== 'listings') throw new Error(`Unexpected collection: ${collection}`);
      return { ok: true, status: 200,
        json: async () => Object.entries(homes).map(([id, data]) => ({ document: doc(`${id}-id`, data) })) };
    }
    throw new Error(`Unexpected feed read: ${u}`);
  };
  res = response();
  await feed({ method: 'GET', query: { k: feedKey(), id: 'private-id' } }, res);
  check(res.statusCode === 404 && res.body.error === 'listing_not_found',
    'single-node portal feed does not reveal a private listing');

  check(!matches({}, { id: 'private-id', ...homes.private })
    && !matches({}, { id: 'missing-id', ...homes.missing }),
    'saved-search predicate rejects private and unknown-status records');
  delete process.env.CRON_SECRET;
  res = response();
  await matcher({ headers: { authorization: 'Bearer undefined' }, query: {} }, res);
  check(res.statusCode === 401 && res.body.error === 'unauthorized',
    'saved-search cron refuses the literal unset secret');
  res = response();
  await matcher({ headers: {}, query: { dry: '1' } }, res);
  check(res.statusCode === 401 && res.body.error === 'unauthorized',
    'public dry run cannot consume admin Firestore reads');
  process.env.CRON_SECRET = 'fixture-cron-secret';
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.includes('signInWithPassword')) return { ok: true, status: 200,
      json: async () => ({ idToken: 'fixture-token' }) };
    if (u.includes(':runQuery')) {
      const collection = JSON.parse(options.body).structuredQuery.from[0].collectionId;
      const rows = collection === 'savedSearches'
        ? [doc('search-id', { status: 'active', email: 'fixture@example.invalid',
          lastNotified: '2026-10-01', criteria: {} })]
        : Object.entries(homes).map(([id, data]) => ({ ...doc(`${id}-id`, data) }));
      return { ok: true, status: 200,
        json: async () => rows.map(document => ({ document })) };
    }
    throw new Error(`Unexpected matcher read: ${u}`);
  };
  res = response();
  await matcher({ headers: { authorization: 'Bearer fixture-cron-secret' },
    query: { dry: '1' } }, res);
  check(res.statusCode === 200 && res.body.matchesFound === 3
    && res.body.emailed === 1, 'saved-search dry run counts only public bookable homes');

  process.env.GEOCODE_SECRET = 'fixture-geocode-secret';
  let geocodeReads = 0;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.includes('signInWithPassword')) return { ok: true, status: 200,
      json: async () => ({ idToken: 'fixture-token' }) };
    if (u.includes(':runQuery')) {
      check(!!options.headers?.Authorization, 'geocoder lists through admin authentication');
      geocodeReads++;
      return { ok: true, status: 200, json: async () => [] };
    }
    throw new Error(`Unexpected geocode read: ${u}`);
  };
  res = response();
  await geocodeAll({ method: 'GET', headers: {}, query: {} }, res);
  check(res.statusCode === 401 && geocodeReads === 0,
    'anonymous geocoder request is denied before catalog reads');
  res = response();
  await geocodeAll({ method: 'GET', headers: { authorization: 'Bearer fixture-geocode-secret' },
    query: {} }, res);
  check(res.statusCode === 200 && res.body.total === 0 && geocodeReads === 1,
    'admin geocoder survives closed anonymous listings reads');
} finally { restore(); }

console.log(`Catalog privacy server: ${passed} passed`);
