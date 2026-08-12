// tests/photos/sweep.mjs
// Lo sweep notturno ha 3 slot e 42s: sceglie POCHI annunci per notte. Finché
// l'ordine è quello di fsList — cioè l'ID del documento, puro alfabeto — li
// spende dove capita. Nel catalogo vero (28/07/2026) i candidati erano 8, di
// cui 6 con UNA sola foto: le tre notti successive sarebbero andate tutte su
// annunci dove il cervello non ha niente da decidere (nessuna copertina da
// scegliere, nessuna galleria da riordinare, nessun doppione da togliere),
// mentre il Trilocale Pigneto da 25 foto restava grezzo fino alla terza.
//
// Qui si verificano i predicati puri del gestore VERO: chi è candidato, quali
// foto contano come sorgente, e in che ordine lo sweep li affronta.
//
//   node tests/photos/sweep.mjs

let mod;
try {
  mod = await import('../../api/photos/enhance.js');
} catch (e) {
  if (String(e.message || '').includes('sharp')) {
    console.log('SKIP: sharp non installato (npm i sharp)');
    process.exit(0);
  }
  throw e;
}
const { sweepOrder, needsCuration, sourceUrls, isEnhancedUrl } = mod;

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fail++; console.log(`  ✗ ${what}`); }
};
const eq = (got, want, what) => ok(
  JSON.stringify(got) === JSON.stringify(want),
  `${what}${JSON.stringify(got) === JSON.stringify(want) ? '' : `  (atteso ${JSON.stringify(want)}, ottenuto ${JSON.stringify(got)})`}`,
);

// url finti nella forma reale di Firebase Storage
const raw = (n) => `https://firebasestorage.googleapis.com/v0/b/x/o/listings%2Fraw%2F${n}.jpg?alt=media`;
const enh = (n) => `https://firebasestorage.googleapis.com/v0/b/x/o/listings%2Fenhanced%2Fabc%2F${n}.jpg?alt=media`;
const listing = (id, images, extra = {}) => ({
  id,
  js: { status: 'available', image: images[0], images, ...extra },
});

console.log('\n▸ riconoscere una foto già lavorata');
ok(isEnhancedUrl(enh('1')), 'un output enhanced è riconosciuto anche url-encoded');
ok(!isEnhancedUrl(raw('1')), 'una foto grezza non passa per lavorata');

console.log('\n▸ chi è candidato allo sweep');
ok(needsCuration({ status: 'available', images: [raw('1')] }), 'mai curato → candidato');
ok(!needsCuration({ status: 'available', image: enh('1'), images: [enh('1')], photosEnhancedAt: 'x' }),
  'curato e integro → non ricandidato');
ok(needsCuration({ status: 'available', image: enh('1'), images: [enh('1'), raw('9')], photosEnhancedAt: 'x' }),
  'curazione sovrascritta da una foto grezza → torna candidato');
ok(!needsCuration({ status: 'rented', images: [raw('1')] }), 'un annuncio affittato non si cura');
ok(!needsCuration({ status: 'available', images: [] }), 'senza foto non è candidato (niente da fare)');
ok(needsCuration({ status: 'waitlist', images: [raw('1')] }), 'waitlist è affittabile → candidato');

console.log('\n▸ quali foto contano come sorgente');
eq(sourceUrls({ image: raw('1'), images: [raw('1'), raw('2')] }), [raw('1'), raw('2')],
  'senza imagesOriginal: le attuali, deduplicate');
eq(sourceUrls({ image: enh('1'), images: [enh('1')], imagesOriginal: [raw('1')] }), [raw('1')],
  'i nostri output non rientrano mai come sorgente');
eq(sourceUrls({ image: enh('1'), images: [enh('1'), raw('7')], imagesOriginal: [raw('1')] }), [raw('1'), raw('7')],
  'una foto nuova si aggiunge agli originali, non li sostituisce');

console.log('\n▸ l\'ordine dello sweep — prima dove il cervello ha lavoro da fare');
// il catalogo vero del 28/07/2026, nell'ordine in cui fsList lo consegna
const catalogo = [
  listing('2SwJ8yD3ITXylrEtYIlL', [raw('a')]),                                   // 1 foto
  listing('navona',               [raw('b')]),                                   // 1 foto
  listing('piemonte',             [raw('c')]),                                   // 1 foto
  listing('pigneto',              [raw('d')]),                                   // 1 foto
  listing('qRRRV7BjXDPqgTpVchnz', Array.from({ length: 11 }, (_, i) => raw('p' + i))),
  listing('ripetta',              [raw('e')]),                                   // 1 foto
  listing('sr0rpLSqbpDMASkHINfx', Array.from({ length: 25 }, (_, i) => raw('t' + i))),
  listing('wvX0h0lBoNKOMuTuHkVI', [raw('f')]),                                   // 1 foto
];
const ordinati = sweepOrder(catalogo).map(c => c.id);
eq(ordinati.slice(0, 2), ['sr0rpLSqbpDMASkHINfx', 'qRRRV7BjXDPqgTpVchnz'],
  'le due vere gallerie (25 e 11 foto) sono le prime due della notte');
ok(!ordinati.slice(0, 2).some(id => ['navona', 'piemonte', 'pigneto'].includes(id)),
  'nessun annuncio da una foto ruba uno dei primi slot');
eq(ordinati.slice(2), ['2SwJ8yD3ITXylrEtYIlL', 'navona', 'piemonte', 'pigneto', 'ripetta', 'wvX0h0lBoNKOMuTuHkVI'],
  'a parità di foto resta l\'ordine dei documenti (run riproducibile)');
eq(sweepOrder(catalogo).length, catalogo.length, 'nessun candidato viene perso per strada');
eq(catalogo.map(c => c.id)[0], '2SwJ8yD3ITXylrEtYIlL', 'l\'array in ingresso non viene mutato');

// gli output enhanced non devono gonfiare il conteggio: qui conta il LAVORO
const misto = [
  listing('poco',  [enh('1'), enh('2'), enh('3'), raw('x')], { imagesOriginal: [raw('x')], photosEnhancedAt: 'x' }),
  listing('tanto', Array.from({ length: 4 }, (_, i) => raw('y' + i))),
];
eq(sweepOrder(misto).map(c => c.id), ['tanto', 'poco'],
  'la priorità guarda le foto SORGENTE, non quante ne abbiamo già prodotte');

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
