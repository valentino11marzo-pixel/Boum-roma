// tests/market/engine.mjs — IL PERITO: il libro mastro non può mentire.
//
// Le tre regole che tengono in piedi tutto, asserite prima che esista una
// riga di UI:
//   1. UN BLOCCO NON È UNA MORTE. Un 403/captcha/timeout è 'unknown', mai
//      'gone' — altrimenti un pomeriggio di blocchi diventa "mezza Roma
//      affittata oggi" e l'assorbimento è spazzatura.
//   2. I CONTATTI NON ENTRANO. Il libro mastro è statistica, non rubrica:
//      observe() scarta contactEmail/contactPhone anche se la sorgente li
//      passa. GDPR per costruzione, non per policy.
//   3. SOTTO CAMPIONE NON SI PUBBLICA. Una mediana su 3 annunci è
//      un'opinione travestita: zoneStats/pricePosition dicono
//      "campione insufficiente", mai un numero debole.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const M = createRequire(import.meta.url)(join(here, '..', '..', 'js', 'market-engine.js'));

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

console.log('\nMARKET ENGINE — il libro mastro del Perito\n');

const NOW = '2026-08-05T12:00:00.000Z';
const DAY = 86400e3;
const nowMs = Date.parse(NOW);
const ago = (d) => new Date(nowMs - d * DAY).toISOString();

// ── observe: il fold ──────────────────────────────────────────────────────

check('prima osservazione: nasce attivo, con storia prezzi e date', () => {
  const d = M.observe(null, { sourceUrl: 'https://x/1', source: 'immobiliare', price: 1500, zone: 'Centro Storico', sqm: 70 }, NOW);
  assert.equal(d.status, 'active');
  assert.equal(d.firstSeenAt, NOW);
  assert.equal(d.lastSeenAt, NOW);
  assert.equal(d.zoneSlug, 'centro-storico');
  assert.deepEqual(d.priceHistory, [{ p: 1500, at: NOW }]);
  assert.equal(d.needsEnrich, false);
});

check('REGOLA 2: i contatti del privato non entrano MAI nel libro mastro', () => {
  const d = M.observe(null, {
    sourceUrl: 'https://x/1', price: 1500, zone: 'Prati',
    contactEmail: 'mario@privato.it', contactPhone: '3331234567',
    images: ['a.jpg'], description: 'testo lungo'
  }, NOW);
  assert.ok(!('contactEmail' in d), 'contactEmail è passato dalla porta');
  assert.ok(!('contactPhone' in d), 'contactPhone è passato dalla porta');
  assert.ok(!('images' in d), 'le foto non servono alla statistica');
  assert.ok(!('description' in d), 'la descrizione non serve alla statistica');
});

check('ri-avvistamento: bump lastSeen, il prezzo invariato non sporca la storia', () => {
  const a = M.observe(null, { sourceUrl: 'https://x/1', price: 1500, zone: 'Prati', sqm: 70 }, ago(10));
  const b = M.observe(a, { sourceUrl: 'https://x/1', price: 1500 }, NOW);
  assert.equal(b.lastSeenAt, NOW);
  assert.equal(b.priceHistory.length, 1, 'stesso prezzo = nessuna voce nuova');
  assert.equal(b.sqm, 70, 'un attributo buono non si perde se l\'osservazione non lo porta');
});

check('ribasso: storia aggiornata + priceDropAt; rialzo: storia sì, drop no', () => {
  const a = M.observe(null, { sourceUrl: 'https://x/1', price: 1500, zone: 'Prati' }, ago(10));
  const giu = M.observe(a, { sourceUrl: 'https://x/1', price: 1400 }, NOW);
  assert.equal(giu.price, 1400);
  assert.equal(giu.priceHistory.length, 2);
  assert.equal(giu.priceDropAt, NOW);
  const su = M.observe(a, { sourceUrl: 'https://x/1', price: 1600 }, NOW);
  assert.equal(su.price, 1600);
  assert.ok(!su.priceDropAt, 'un rialzo non è un ribasso');
});

check('un morto riavvistato è un RIENTRO: vita vecchia archiviata, conta l\'assorbimento', () => {
  let d = M.observe(null, { sourceUrl: 'https://x/1', price: 1500, zone: 'Prati' }, ago(60));
  d = M.applyCheck(d, 'gone', { httpStatus: 404 }, ago(40));
  const r = M.observe(d, { sourceUrl: 'https://x/1', price: 1550 }, NOW);
  assert.equal(r.status, 'active');
  assert.equal(r.relistedAt, NOW);
  assert.equal(r.firstSeenAt, NOW, 'la nuova vita riparte da ora');
  assert.equal(r.pastLives.length, 1);
  assert.equal(r.pastLives[0].goneAt, ago(40));
});

// ── deathVerdict: REGOLA 1 ────────────────────────────────────────────────

check('404 e 410 sono morti provate', () => {
  assert.equal(M.deathVerdict({ httpStatus: 404 }), 'gone');
  assert.equal(M.deathVerdict({ httpStatus: 410 }), 'gone');
});

check('200 + marker "annuncio ritirato" o atterraggio su ricerca = morte', () => {
  assert.equal(M.deathVerdict({ httpStatus: 200, marker: 'unavailable' }), 'gone');
  assert.equal(M.deathVerdict({ httpStatus: 200, marker: 'search' }), 'gone');
});

check('200 + pagina annuncio = vivo', () => {
  assert.equal(M.deathVerdict({ httpStatus: 200, marker: 'listing' }), 'alive');
});

check('REGOLA 1: 403, 429, 5xx, timeout, 200 ambiguo — MAI morti', () => {
  for (const ev of [
    { httpStatus: 403 }, { httpStatus: 429 }, { httpStatus: 500 },
    { httpStatus: 503 }, { httpStatus: 0 }, { httpStatus: null },
    { httpStatus: 200 }, null, undefined
  ]) {
    assert.equal(M.deathVerdict(ev), 'unknown',
      `un blocco (${JSON.stringify(ev)}) non è una morte`);
  }
});

check('applyCheck: goneAt si stampa una volta sola; unknown non tocca lo status', () => {
  let d = M.observe(null, { sourceUrl: 'https://x/1', price: 1500, zone: 'Prati' }, ago(30));
  d = M.applyCheck(d, 'gone', { httpStatus: 404 }, ago(10));
  const goneAt = d.goneAt;
  const d2 = M.applyCheck(d, 'gone', { httpStatus: 404 }, NOW);
  assert.equal(d2.goneAt, goneAt, 'una seconda conferma non sposta la data di morte');

  let u = M.observe(null, { sourceUrl: 'https://x/2', price: 1200, zone: 'Prati' }, ago(30));
  u = M.applyCheck(u, 'unknown', { httpStatus: 403 }, NOW);
  assert.equal(u.status, 'active', 'un blocco non sposta lo status');
  assert.equal(u.consecutiveUnknown, 1);
});

// ── checkQueue ────────────────────────────────────────────────────────────

check('la coda verifica i più vecchi per primi, salta i freschi e i morti', () => {
  const list = [
    { sourceUrl: 'u/old', status: 'active', lastSeenAt: ago(9), lastCheckedAt: ago(6) },
    { sourceUrl: 'u/older', status: 'active', lastSeenAt: ago(20), lastCheckedAt: ago(15) },
    { sourceUrl: 'u/fresh', status: 'active', lastSeenAt: ago(0.2) },       // visto 5h fa
    { sourceUrl: 'u/dead', status: 'gone', lastSeenAt: ago(40) },
    { sourceUrl: 'u/never', status: 'active', lastSeenAt: ago(3) },
  ];
  const q = M.checkQueue(list, { batch: 10, minIntervalHours: 20, nowMs: nowMs });
  assert.deepEqual(q.map(x => x.sourceUrl), ['u/older', 'u/old', 'u/never'],
    'ordine: mai-controllati/vecchi prima; freschi e morti fuori');
  const q2 = M.checkQueue(list, { batch: 1, minIntervalHours: 20, nowMs: nowMs });
  assert.equal(q2.length, 1, 'il batch taglia');
});

// ── zoneStats: REGOLA 3 ───────────────────────────────────────────────────

const mk = (i, zone, price, sqm, extra) => Object.assign(
  M.observe(null, { sourceUrl: 'https://x/' + i, price, sqm, zone }, ago(30)), extra || {});

check('mediana e percentili giusti su un campione noto', () => {
  // €/mq: 10, 20, 30, 40, 50 → mediana 30, p25 20, p75 40
  const zone = [10, 20, 30, 40, 50].map((v, i) => mk(i, 'Trieste', v * 50, 50));
  const s = M.zoneStats(zone, { zone: 'Trieste', minSample: 5, nowMs });
  assert.equal(s.asked.ok, true);
  assert.equal(s.asked.medianEurSqm, 30);
  assert.equal(s.asked.p25, 20);
  assert.equal(s.asked.p75, 40);
  assert.equal(s.activeCount, 5);
});

check('REGOLA 3: sotto minSample non esce un numero', () => {
  const zone = [10, 20, 30].map((v, i) => mk(i, 'Trieste', v * 50, 50));
  const s = M.zoneStats(zone, { zone: 'Trieste', minSample: 5, nowMs });
  assert.equal(s.asked.ok, false);
  assert.equal(s.asked.reason, 'small_sample');
  assert.ok(!('medianEurSqm' in s.asked), 'niente numeri deboli travestiti');
});

check('assorbimento: solo morti PROVATE, mediana dei giorni', () => {
  const gone = (i, bornD, diedD) => {
    let d = M.observe(null, { sourceUrl: 'https://g/' + i, price: 1000, sqm: 50, zone: 'Trieste' }, ago(bornD));
    return M.applyCheck(d, 'gone', { httpStatus: 404 }, ago(diedD));
  };
  // vite: 10, 12, 14, 20, 30 giorni → mediana 14
  const zone = [
    gone(1, 40, 30), gone(2, 42, 30), gone(3, 44, 30), gone(4, 50, 30), gone(5, 60, 30),
    mk(9, 'Trieste', 1000, 50)   // un vivo non conta nell'assorbimento
  ];
  const s = M.zoneStats(zone, { zone: 'Trieste', minSample: 5, nowMs });
  assert.equal(s.absorption.ok, true);
  assert.equal(s.absorption.medianDays, 14);
});

check('gli unknown non entrano mai nell\'assorbimento', () => {
  const blocked = [];
  for (let i = 0; i < 8; i++) {
    let d = M.observe(null, { sourceUrl: 'https://b/' + i, price: 1000, sqm: 50, zone: 'Trieste' }, ago(30));
    d = M.applyCheck(d, 'unknown', { httpStatus: 403 }, ago(1));
    blocked.push(d);
  }
  const s = M.zoneStats(blocked, { zone: 'Trieste', minSample: 3, nowMs });
  assert.equal(s.absorption.ok, false, 'otto blocchi non sono otto affitti conclusi');
  assert.equal(s.absorption.sample, 0);
});

// ── pricePosition e comps ─────────────────────────────────────────────────

check('pricePosition: percentile del tuo €/mq fra i vivi della zona', () => {
  const zone = [10, 20, 30, 40, 50].map((v, i) => mk(i, 'Prati', v * 50, 50));
  const p = M.pricePosition({ price: 35 * 50, sqm: 50, zone: 'Prati' }, zone, { minSample: 5 });
  assert.equal(p.ok, true);
  assert.equal(p.percentile, 60, '3 su 5 sotto di te = 60°');
  const small = M.pricePosition({ price: 1000, sqm: 50, zone: 'Prati' }, zone.slice(0, 3), { minSample: 5 });
  assert.equal(small.ok, false);
});

check('comps: stessa zona, vivi, taglia ±25%, mai sé stesso, lowSample onesto', () => {
  const uni = [
    mk(1, 'Prati', 1500, 70), mk(2, 'Prati', 1450, 75), mk(3, 'Prati', 1600, 68),
    mk(4, 'Prati', 900, 30),                                   // fuori taglia
    mk(5, 'Trieste', 1500, 70),                                // altra zona
    Object.assign(mk(6, 'Prati', 1400, 72), { status: 'gone' }) // morto
  ];
  const subject = { sourceUrl: 'https://x/1', price: 1550, sqm: 70, zone: 'Prati' };
  const r = M.compsFor(subject, uni, { max: 5, nowMs });
  const urls = r.comps.map(c => c.sourceUrl);
  assert.ok(!urls.includes('https://x/1'), 'mai sé stesso');
  assert.ok(!urls.includes('https://x/4'), 'fuori taglia escluso');
  assert.ok(!urls.includes('https://x/5'), 'altra zona esclusa — mai allargare di nascosto');
  assert.ok(!urls.includes('https://x/6'), 'un morto non è un comparabile');
  assert.equal(r.comps.length, 2);
  assert.equal(r.lowSample, true, 'con 2 comparabili lo si DICE');
});

check('pricePositionFromStats: la fascia dal solo doc di zona, mai finta precisione', () => {
  const stats = { asked: { ok: true, sample: 24, p25: 18, medianEurSqm: 21, p75: 25 } };
  const at = (price, sqm) => M.pricePositionFromStats({ price, sqm }, stats);
  assert.equal(at(17 * 50, 50).band, 'sotto-p25');
  assert.equal(at(20 * 50, 50).band, 'p25-mediana');
  assert.equal(at(23 * 50, 50).band, 'mediana-p75');
  assert.equal(at(30 * 50, 50).band, 'sopra-p75');
  assert.equal(at(30 * 50, 50).vsMedianPct, 43, '+43% sulla mediana');
  assert.ok(!('percentile' in at(20 * 50, 50)), 'da tre quantili non esce un percentile esatto');
});

check('pricePositionFromStats: senza statistiche o campione dice il perché', () => {
  const small = M.pricePositionFromStats({ price: 1000, sqm: 50 },
    { asked: { ok: false, reason: 'small_sample', sample: 3 } });
  assert.equal(small.ok, false);
  assert.equal(small.reason, 'small_sample');
  assert.equal(small.sample, 3);
  const noSqm = M.pricePositionFromStats({ price: 1000 }, { asked: { ok: true, sample: 24, p25: 18, medianEurSqm: 21, p75: 25 } });
  assert.equal(noSqm.reason, 'no_price_or_sqm');
});

check('normalizeZone: accenti, maiuscole, spazi → uno slug solo', () => {
  assert.equal(M.normalizeZone('Centro Storico '), 'centro-storico');
  assert.equal(M.normalizeZone('SAN GIOVANNI'), 'san-giovanni');
  assert.equal(M.normalizeZone('Torpignattara/Pigneto'), 'torpignattara-pigneto');
  assert.equal(M.normalizeZone(''), null);
  assert.equal(M.normalizeZone(null), null);
});

console.log(`\n  ${pass} passati, ${fail} falliti\n`);
process.exit(fail ? 1 : 0);
