import assert from 'node:assert/strict';
import RULES from '../../js/smartlink-engine.js';

const variants = [
  'https://www.immobiliare.it/annunci/124483437/',
  'https://www.immobiliare.it/annunci/124483437',
  'https://immobiliare.it/annunci/124483437/',
  'https://immobiliare.it/annunci/124483437',
];
for (const requested of variants) {
  const stored = RULES.storedListingUrls(requested + '?utm_source=share#foto20');
  assert.equal(stored[0], requested, 'prima query sull’URL normalizzato richiesto');
  assert.equal(stored.length, 4, 'solo quattro varianti note, senza duplicati');
  assert.deepEqual(new Set(stored), new Set(variants));
  for (const archived of variants) {
    assert.equal(RULES.sameListingUrl(requested, archived), true);
    assert.equal(RULES.sameListingUrl(archived, requested), true);
  }
}
assert.equal(RULES.sameListingUrl('http://immobiliare.it/annunci/124483437?share=1', variants[0]), true);
assert.equal(RULES.normalizeUrl(variants[3]).url, variants[3], 'nessun cambio alla destinazione di rete');
assert.equal(RULES.normalizeUrl('https://www.immobiliare.it:443/annunci/124483437/').url, variants[0]);

const exactOnly = [
  'https://annunci.immobiliare.it/annunci/124483437/',
  'https://www.immobiliare.it/annunci/124483437/foto/',
  'https://www.immobiliare.it/annunci/124483437.html',
  'https://www.immobiliare.it/annunci/%31%32%34%34%38%33%34%33%37/',
  'https://www.idealista.it/immobile/124483437/',
  'https://subito.it/annunci/124483437/',
];
for (const url of exactOnly) {
  assert.deepEqual(RULES.storedListingUrls(url + '?utm_source=x'), [url]);
  assert.equal(RULES.sameListingUrl(url, url + '?utm_source=x#foto'), true);
  assert.equal(RULES.sameListingUrl(url, variants[0]), false, 'nessuna equivalenza fuori dal percorso osservato');
}
assert.equal(RULES.sameListingUrl('https://idealista.it/immobile/124483437/', exactOnly[4]), false);
assert.equal(RULES.sameListingUrl(exactOnly[1], exactOnly[1].slice(0, -1)), false);
for (const url of [
  'https://www.immobiliare.it/annunci/133857896/',
  'https://www.immobiliare.it/annunci/0124483437/',
  'https://www.immobiliare.it/annunci/1244834370/',
]) assert.equal(RULES.sameListingUrl(url, variants[0]), false, 'ID differenti restano separati');

const invalid = [
  '', null, {}, { toString: null }, 'not a URL',
  'https://www.immobiliare.it:444/annunci/124483437/',
  'https://www.immobiliare.it:443/annunci/124483437/',
  'http://www.immobiliare.it:80/annunci/124483437/',
  'https:////www.immobiliare.it:443/annunci/124483437/',
  'https://www.immobiliare.it:\t443/annunci/124483437/',
  'https://user:password@www.immobiliare.it/annunci/124483437/',
  'https://@www.immobiliare.it/annunci/124483437/',
  'https://immobiliare.it.evil.example/annunci/124483437/',
  'https://www.immobiliare.it@evil.example/annunci/124483437/',
  'javascript://www.immobiliare.it/annunci/124483437/',
];
for (const url of invalid) {
  assert.deepEqual(RULES.storedListingUrls(url), []);
  assert.equal(RULES.sameListingUrl(url, variants[0]), false);
  assert.equal(RULES.sameListingUrl(variants[0], url), false);
  assert.equal(RULES.sameListingUrl(url, url), false, 'URL non ammessi non autorizzano riuso');
}

const archivedKey = '11111111-1111-4111-8111-111111111111';
const draftKey = '22222222-2222-4222-8222-222222222222';
const foreignKey = '33333333-3333-4333-8333-333333333333';
const photo = (key, file) => 'https://firebasestorage.googleapis.com/v0/b/boom-property-dashboards.firebasestorage.app/o/'
  + encodeURIComponent('smartlinks/' + key + '/' + file + '.webp') + '?alt=media&token=photo';
const archivedPhoto = photo(archivedKey, archivedKey);
const draftPhoto = photo(draftKey, draftKey);
const foreignPhoto = photo(foreignKey, foreignKey);
const archive = { sourceUrl: variants[0], active: true, images: [archivedPhoto] };
assert.deepEqual(RULES.reusableImages(archive, variants[3], [archivedPhoto], draftKey), [archivedPhoto]);
assert.deepEqual(RULES.reusableImages(archive, variants[3], [draftPhoto, archivedPhoto], draftKey), [draftPhoto, archivedPhoto]);
assert.equal(RULES.reusableImages(archive, variants[3], [foreignPhoto], draftKey), null, 'foto estranea non autorizzata dagli alias');
assert.equal(RULES.reusableImages(archive, variants[3], [archivedPhoto, archivedPhoto], draftKey), null);
assert.equal(RULES.reusableImages({ ...archive, active: false }, variants[3], [archivedPhoto], draftKey), null);
assert.equal(RULES.reusableImages({ ...archive, images: [] }, variants[3], [draftPhoto], draftKey), null);
for (const url of [...invalid, ...exactOnly, 'https://www.immobiliare.it/annunci/133857896/']) {
  assert.equal(RULES.reusableImages(archive, url, [archivedPhoto], draftKey), null, 'stesse foto non provano stessa fonte');
  assert.equal(RULES.reusableImages({ ...archive, sourceUrl: url }, variants[3], [archivedPhoto], draftKey), null);
}
const external = 'https://pwm.im-cdn.it/image.jpg';
assert.equal(RULES.reusableImages({ ...archive, images: [external] }, variants[3], [external], draftKey), null);

const publication = RULES.makeRecord({
  sourceUrl: variants[0], idempotencyKey: archivedKey, images: [archivedPhoto],
  title: 'Bilocale a Cipro', price: 1500, zone: 'Cipro', sqm: 50, rooms: 2, note: 'Da verificare',
  map: { lat: 41.9075, lng: 12.4475, label: 'Cipro' },
}, '2026-10-20T12:00:00.000Z');
assert.ok(publication);
const retry = { ...publication, sourceUrl: variants[3], observedAt: '2026-10-26T12:00:00.000Z' };
assert.equal(RULES.samePublication(publication, retry), true, 'retry della stessa proposta con URL equivalente');
assert.equal(RULES.samePublication(retry, publication), true);
for (const changed of [
  { price: 1600 }, { title: 'Trilocale' }, { note: 'Nota diversa' }, { zone: 'Prati' },
  { sqm: 60 }, { rooms: 3 }, { images: [draftPhoto] }, { map: null },
  { reusedFrom: 'other-archive' }, { active: false }, { availability: 'Disponibile' },
]) assert.equal(RULES.samePublication(publication, { ...retry, ...changed }), false, 'URL equivalente non annulla conflitti nei dati');
const twoPhotos = { ...publication, images: [archivedPhoto, draftPhoto] };
assert.equal(RULES.samePublication(twoPhotos, { ...retry, images: [draftPhoto, archivedPhoto] }), false);
const reused = { ...publication, reusedFrom: 'archive-1' };
assert.equal(RULES.samePublication(reused, { ...reused, sourceUrl: variants[3] }), true);
assert.equal(RULES.samePublication(reused, { ...retry, reusedFrom: 'archive-1' }), false, 'data dell’archivio non aggiornata da un retry');
for (const url of [...invalid, ...exactOnly, 'https://www.immobiliare.it/annunci/133857896/']) {
  assert.equal(RULES.samePublication(publication, { ...retry, sourceUrl: url }), false);
  assert.equal(RULES.samePublication({ ...publication, sourceUrl: url }, retry), false);
}
console.log('smartlink identity: alias archivio limitati, proprietà foto e idempotenza verificati');
