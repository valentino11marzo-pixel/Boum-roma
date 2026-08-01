// tests/iban/run.mjs
// L'IBAN CHE /casa MOSTRA ALL'INQUILINO.
//
// Un IBAN sbagliato salvato in /banca manda i soldi a un altro conto o li fa
// respingere, e nessuno se ne accorge finché non manca un canone. La
// validazione mod-97 (ISO 13616) è l'unica che distingue un IBAN reale da uno
// con una O al posto di uno zero — differenza invisibile a occhio, fatale in
// banca. Ha già dimostrato di servire su coordinate reali: l'OCR di un PDF
// leggeva un carattere ambiguo, e solo le cifre di controllo hanno detto quale
// fosse.
//
// L'IBAN usato qui è SINTETICO (cifre di controllo calcolate a mano) e non
// appartiene a nessun conto: un IBAN vero non va in un repo pubblico. Conserva
// però l'insidia che conta — il CIN è la lettera O, indistinguibile da uno zero.
//
// La funzione vive dentro banca.html: la si estrae dal file e la si esegue,
// così se qualcuno la modifica è questo test a rompersi.
//
//   node tests/iban/run.mjs

import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../../banca.html', import.meta.url), 'utf8');
const lens = src.match(/const IBAN_LEN = \{[\s\S]*?\};/);
const norm = src.match(/const ibanNorm = [^;]+;/);
const fn = src.match(/function ibanCheck\(raw\) \{[\s\S]*?\n  \}/);
if (!lens || !norm || !fn) {
  console.log('\x1b[31m✗ ibanCheck / IBAN_LEN / ibanNorm non trovati in banca.html\x1b[0m');
  process.exit(1);
}
const ibanCheck = new Function(`${lens[0]}\n${norm[0]}\n${fn[0]}\nreturn ibanCheck;`)();

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

console.log('\n\x1b[1mIl caso reale che ci ha insegnato la lezione\x1b[0m');
// Il quinto carattere è la LETTERA O (il CIN), non uno zero: a occhio sono
// identici, per la banca no.
const vero = 'IT79O0123456789000012345678';
const finto = 'IT7900123456789000012345678';   // stessa stringa con lo zero
check('con la lettera O (il CIN vero) → valido', ibanCheck(vero).ok, JSON.stringify(ibanCheck(vero)));
check('con lo zero al suo posto → RIFIUTATO', !ibanCheck(finto).ok, JSON.stringify(ibanCheck(finto)));
check('…e spiega dove guardare', /O confusa con uno zero/.test(ibanCheck(finto).msg), ibanCheck(finto).msg);

console.log('\n\x1b[1mCome le persone lo incollano davvero\x1b[0m');
for (const [label, v] of [
  ['con spazi a gruppi di quattro', 'IT79 O012 3456 7890 0001 2345 678'],
  ['tutto minuscolo',               vero.toLowerCase()],
  ['con spazi casuali',             ' IT79O01234 567890 00012345678 '],
  ['con punti in mezzo',            'IT79.O0123456789000012345678'],
]) {
  const c = ibanCheck(v);
  check(`${label} → normalizzato e valido`, c.ok && c.value === vero, c.value || c.msg);
}
check('lo restituisce raggruppato a quattro, come lo stampa la banca',
  ibanCheck(vero).pretty === 'IT79 O012 3456 7890 0001 2345 678', ibanCheck(vero).pretty);

console.log('\n\x1b[1mQuello che deve rifiutare\x1b[0m');
for (const [label, v, hint] of [
  ['una cifra in meno',        'IT79O012345678900001234567', 'caratteri'],
  ['una cifra in più',         'IT79O01234567890000123456789', 'caratteri'],
  ['due cifre trasposte',      'IT79O0123456789000012345687', 'controllo'],
  ['senza il prefisso paese',  '79O0123456789000012345678', 'formato'],
  ['lettere dove vanno cifre', 'ITXXABCDEFGHIJKLMNOPQRSTUVW', 'formato'],
  ['vuoto',                    '', null],
  ['un numero di telefono',    '+39 331 325 1961', 'formato'],
]) {
  const c = ibanCheck(v);
  check(`${label} → rifiutato`, !c.ok, JSON.stringify(c));
  if (hint && v) check(`  …e il messaggio parla di ${hint}`, new RegExp(hint, 'i').test(c.msg), c.msg);
}

console.log('\n\x1b[1mAltri paesi (l\'inquilino può pagare dall\'estero)\x1b[0m');
for (const [cc, v] of [
  ['DE', 'DE89370400440532013000'],
  ['GB', 'GB82WEST12345698765432'],
  ['FR', 'FR1420041010050500013M02606'],
  ['NL', 'NL91ABNA0417164300'],
]) {
  check(`IBAN ${cc} valido accettato`, ibanCheck(v).ok, JSON.stringify(ibanCheck(v)));
}
check('un IBAN DE con la lunghezza italiana è rifiutato',
  !ibanCheck('DE89370400440532013000123456').ok);

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mUn IBAN sbagliato non arriva mai in /casa.\x1b[0m');
