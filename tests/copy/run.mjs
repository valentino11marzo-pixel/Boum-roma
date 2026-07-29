// tests/copy/run.mjs
// Le schede senza testo sono invisibili ai motori di ricerca e non citabili
// dalle AI. Il 28/07/2026 il catalogo live aveva 10 annunci con descrizione
// VUOTA e 10 con il template di riserva del bot — che pubblicava le chiavi
// grezze del database ("washing_machine", "double_glazing") sulla pagina e
// dentro /llms-listings.txt, cioè proprio dove passano i crawler.
//
// Lo sweep notturno le riscrive. Il rischio vero è che riscriva anche le
// parole di un umano: nel catalogo reale le descrizioni scritte a mano vanno
// da 67 a 203 caratteri e il template arriva a 203, quindi QUALSIASI regola
// basata sulla lunghezza cancellerebbe "perfect for Luiss students" tenendo
// "Features include ac, balcony". Qui si verifica che non succeda, sulle
// stringhe vere prese dal catalogo.
//
//   node tests/copy/run.mjs

import { isBoilerplate, copyGap, copyOrder, buildFacts, FEATURE_LABELS }
  from '../../api/wizard/describe.js';

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fail++; console.log(`  ✗ ${what}`); }
};
const eq = (got, want, what) => ok(JSON.stringify(got) === JSON.stringify(want),
  `${what}${JSON.stringify(got) === JSON.stringify(want) ? '' : `  (atteso ${JSON.stringify(want)}, ottenuto ${JSON.stringify(got)})`}`);

// ── stringhe VERE dal catalogo del 28/07/2026 ───────────────────────────────
const UMANE = [
  // 176 caratteri
  'A spacious and brand-new trilocale in the heart of the Pigneto, well interconnected, in a brand-new palace with a laundry room in the hall, elevator, and everything brand new. ',
  // 203 — più lunga di un template, ma scritta da una persona
  'Inside a Condo we manage from Years , located in heart of services and experience like the Olimpic stadium , max 1 of May will be ready this new unit that is possible to visit from now even if under work',
  // 141 — la scheda più citabile del catalogo: nomina un ateneo
  'Delicious and ultra spacious Bedroom with Private Bath in Parioli Heart , perfect for Luiss students . Direct garden acess , all inclusive .',
  // 94 — cortissima, ma concreta e vera
  'Spacious 2bed in front of the Metro B of piazza Annibaliano , bath , kitchen , all inclusive .',
];
const TEMPLATE = [
  // 201 — con "Features include" E chiavi grezze
  'Beautiful trilocale in Pigneto, 80sqm on floor 3, fully furnished. 2 beds, 2 bathrooms. Features include ac, balcony, elevator, dishwasher, wifi, double_glazing, doorman, washing_machine. €1,600/month.',
  // 102 — nessun "Features include", nessuna chiave grezza: si riconosce SOLO
  // dal "45sqm on floor". È il caso che giustifica quel marcatore.
  'Beautiful bilocale in Trastevere, 45sqm on floor 1, fully furnished. 1 beds, 1 bathroom. €1,200/month.',
  'Beautiful bilocale in Centro, 60sqm on floor 1, fully furnished. 3 beds, 1 bathroom. Features include ac, balcony, dishwasher, washing_machine, double_glazing, doorman, wifi. €1,500/month.',
];

console.log('\n▸ riconoscere il template di riserva');
for (const t of TEMPLATE) ok(isBoilerplate(t), `template riconosciuto: "${t.slice(0, 46)}…"`);
ok(isBoilerplate(TEMPLATE[1]), 'il template senza "Features include" né chiavi grezze si riconosce dal "sqm on floor"');

console.log('\n▸ NON toccare le parole di un umano');
for (const t of UMANE) ok(!isBoilerplate(t), `salva (${String(t.trim().length).padStart(3)} car.): "${t.trim().slice(0, 46)}…"`);
ok(!isBoilerplate('Bright flat with an elevator, a balcony and parking.'),
  'parole inglesi normali (elevator, balcony, parking) non sono chiavi grezze');
ok(isBoilerplate('Nice flat. Has washing_machine and wifi.'),
  'una chiave con underscore sfuggita è sempre un template, ovunque si trovi');
ok(!isBoilerplate(''), 'il vuoto non è "template": ha una sua categoria');

console.log('\n▸ la diagnosi per annuncio');
eq(copyGap({ status: 'available', description: '' }), 'missing', 'vuoto → missing');
eq(copyGap({ status: 'available' }), 'missing', 'campo assente → missing');
eq(copyGap({ status: 'available', description: TEMPLATE[0] }), 'boilerplate', 'template → boilerplate');
eq(copyGap({ status: 'waitlist', description: TEMPLATE[1] }), 'boilerplate', 'anche in waitlist: la pagina è pubblica');
eq(copyGap({ status: 'available', description: UMANE[2] }), null, 'testo umano corto → si lascia stare');
eq(copyGap({ status: 'rented', description: '' }), null, 'un annuncio affittato non è una pagina da curare');
eq(copyGap({ status: 'RENTED', description: TEMPLATE[0] }), null, 'lo stato si confronta senza badare alle maiuscole');

console.log('\n▸ l\'ordine dello sweep');
const cand = [
  { id: 'tmpl-waitlist', js: { status: 'waitlist',  description: TEMPLATE[0] } },
  { id: 'tmpl-live',     js: { status: 'available', description: TEMPLATE[1] } },
  { id: 'muto-waitlist', js: { status: 'waitlist',  description: '' } },
  { id: 'muto-live',     js: { status: 'available', description: '' } },
];
eq(copyOrder(cand).map(c => c.id), ['muto-live', 'tmpl-live', 'muto-waitlist', 'tmpl-waitlist'],
  'prima le pagine affittabili e mute, per ultime le waitlist con un template');
eq(cand[0].id, 'tmpl-waitlist', 'l\'array in ingresso non viene mutato');
eq(copyOrder([]).length, 0, 'nessun candidato: nessun problema');

console.log('\n▸ i fatti passati al modello');
const facts = buildFacts({
  type: 'trilocale', zone: 'Pigneto', sqm: 80, floor: '3', beds: 2, bathrooms: 2,
  furnished: 'yes', price: 1600, availableDate: '2026-08-01', concordato: true,
  features: ['ac', 'washing_machine', 'double_glazing', 'pets_allowed'],
});
ok(!/washing_machine|double_glazing|pets_allowed/.test(facts),
  'nessuna chiave grezza entra nel prompt (e quindi nella copia pubblica)');
ok(/washing machine/.test(facts) && /double glazing/.test(facts) && /pets allowed/.test(facts),
  'le stesse feature ci sono, in inglese leggibile');
ok(/canone concordato/i.test(facts), 'il concordato viene dichiarato al modello');
ok(!/Available from/.test(buildFacts({ zone: 'Prati' })), 'i fatti che non abbiamo non vengono inventati');
ok(Object.keys(FEATURE_LABELS).every(k => !/[A-Z]/.test(k)), 'le chiavi restano quelle del database');

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
