// tests/whatsapp/replies.mjs
// LE RISPOSTE RAPIDE SI SPEDISCONO A OCCHI CHIUSI: qui si verifica ciò che
// nessuno rileggerebbe più dopo averle salvate nel telefono.
//
// Una risposta rapida è la cosa più pericolosa che ci sia in un archivio di
// testi: la scrivi una volta, la mandi mille, e non la rileggi mai. Se dentro
// c'è un link che il sito non serve più, il 404 non lo scopre l'operatore —
// lo scopre il cliente, da solo, e non lo dice: sparisce.
//
//   node tests/whatsapp/replies.mjs
//
// Cosa si pretende:
//  1. lint() pulito (scorciatoie valide e uniche, lunghezze nei limiti,
//     segnaposto riconoscibili).
//  2. OGNI link dentro un testo esiste come rotta vera del sito — dedotta dal
//     repo: file, cartella, rewrite/redirect di vercel.json o voce di sitemap.
//  3. Il link recensione passa la STESSA validazione delle email
//     (api/reviews/_lib.js): la scatola delle stelle, non la scheda Maps.
//  4. I prezzi citati nei testi sono quelli di api/_catalog.js. Se domani il
//     Virtual Viewing passa a €99, questo test è ciò che impedisce di
//     continuare a promettere €89 su WhatsApp per mesi.
//  5. Il documento in docs/ è rigenerato: una copia vecchia è peggio di
//     nessuna copia, perché sembra vera.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WA from '../../js/whatsapp-replies.js';
import { CATALOG } from '../../api/_catalog.js';
import { reviewUrl } from '../../api/reviews/_lib.js';
import { renderDoc, DOC_PATH } from '../../scripts/wa-export.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${label}${extra ? '\n      ' + extra : ''}`); }
};

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m1. I limiti dell\'app\x1b[0m');
const lint = WA.lint();
ok(lint.ok, 'nessun errore di forma', lint.errors.join('\n      '));
lint.warnings.forEach((w) => console.log(`    \x1b[33m!\x1b[0m ${w}`));
const inst = WA.installed().length;
ok(inst <= WA.LIMITS.total,
  `${inst} da installare su un massimo di ${WA.LIMITS.total} (restano ${WA.LIMITS.total - inst} slot liberi; ${WA.REPLIES.length - inst} in panchina)`);
ok(WA.REPLIES.every((r) => !r.bench || !r.star),
  'niente in panchina è marcato ⭐ prima fila',
  'una risposta "da installare per prima" che poi non si installa è una contraddizione che si paga sul telefono');
ok(WA.FAMILIES.every((f) => WA.REPLIES.some((r) => r.fam === f.key)),
  'ogni famiglia dichiarata ha almeno una risposta');

// Le due regole del kit, misurate sull'archivio vero dell'operatore:
// metà dei suoi messaggi sta sotto 17 caratteri e un link compare nell'1%.
// Una risposta salvata può permettersi di essere più lunga di così — la
// scrive una volta e gli fa risparmiare minuti — ma oltre una certa soglia
// non è più una risposta: è un muro che il cliente non legge, ed è
// esattamente il motivo per cui la prima versione è stata buttata.
console.log('\n\x1b[1m1b. Il kit: niente muri, una porta sola\x1b[0m');
for (const r of WA.installed()) {
  ok(r.text.length <= 520, `/${r.sc} sta in ${r.text.length} caratteri (max 520)`,
    'oltre questa soglia su WhatsApp non si legge: si taglia, non si aggiunge');
  const links = (r.text.match(/https?:\/\//g) || []).length;
  ok(links <= 1, `/${r.sc} ha al massimo un link (${links})`,
    'due link nello stesso messaggio sono due porte: il cliente non ne apre nessuna');
}

// ---------------------------------------------------------------------------
// Le rotte vere del sito, dedotte dal repo — nessuna lista scritta a mano:
// una lista a mano si dimentica di aggiornare, e allora il test smette di
// dire la verità proprio mentre continua a passare.
console.log('\n\x1b[1m2. Nessun link morto\x1b[0m');
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const sitemap = new Set(
  (fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').match(/<loc>([^<]+)<\/loc>/g) || [])
    .map((l) => l.replace(/<\/?loc>/g, '').replace(/\/$/, ''))
);
const sources = new Set([
  ...(vercel.rewrites || []).map((r) => r.source),
  ...(vercel.redirects || []).map((r) => r.source),
]);

function routeExists(pathname) {
  const clean = pathname.replace(/\/$/, '') || '/';
  if (clean === '/') return true;
  const rel = clean.slice(1);
  if (fs.existsSync(path.join(ROOT, `${rel}.html`))) return true;         // /faq → faq.html
  if (fs.existsSync(path.join(ROOT, rel, 'index.html'))) return true;     // /apartments-in → apartments-in/index.html
  if (sources.has(clean) || sources.has(`${clean}.html`)) return true;    // rewrite o redirect dichiarato
  if (sitemap.has(WA.SITE + clean)) return true;                          // rotta pubblicata (es. /listing/:id)
  return false;
}

const external = [];
for (const url of WA.allLinks()) {
  if (!url.startsWith(WA.SITE)) { external.push(url); continue; }
  const pathname = url.slice(WA.SITE.length).split('#')[0].split('?')[0];
  ok(routeExists(pathname), `${pathname || '/'} è una rotta vera`);
}

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m3. Il link fuori dal sito (recensione)\x1b[0m');
ok(external.length === 1, `un solo link esterno in tutto l'archivio (${external.length})`, external.join(' '));
for (const url of external) {
  ok(reviewUrl(url) !== null,
    `${url} apre la scatola delle stelle (stessa regola delle email)`,
    'un link "condividi" di Maps porta alla scheda: metà delle persone non trova il bottone');
}

// ---------------------------------------------------------------------------
// I prezzi vivono in api/_catalog.js. Quello che promette WhatsApp deve essere
// quello che incassa Stripe: se divergono, il cliente scopre la differenza
// sulla pagina di pagamento — dopo aver deciso di fidarsi.
console.log('\n\x1b[1m4. I prezzi non possono divergere dal catalogo\x1b[0m');
const QUOTED = {
  enabroad: ['virtual-viewing'],
  encheck: ['contract-check-express', 'deal-assistance'],
  endep: ['deposit-recovery'],
  prpack: ['concordato-pack'],
};
for (const [sc, kinds] of Object.entries(QUOTED)) {
  const r = WA.REPLIES.find((x) => x.sc === sc);
  ok(!!r, `/${sc} esiste ancora`);
  if (!r) continue;
  for (const kind of kinds) {
    const eur = CATALOG[kind] && CATALOG[kind].eur;
    ok(!!eur, `il catalogo conosce "${kind}"`);
    ok(eur ? r.text.includes(`€${eur}`) : false,
      `/${sc} cita €${eur} per ${kind}`,
      `il catalogo dice €${eur}: aggiorna il testo in js/whatsapp-replies.js`);
  }
}
// La commissione e la caparra sono le due cifre che l'operatore dice a voce
// ogni giorno: se cambiano nel listino pubblico devono cambiare anche qui.
for (const sc of ['enprice', 'itcosti']) {
  const t = WA.REPLIES.find((x) => x.sc === sc).text;
  ok(/10%/.test(t) && /€300/.test(t), `/${sc} porta la commissione 10% e i €300 di blocco`);
}

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m5. Il documento è rigenerato\x1b[0m');
const docFile = path.join(ROOT, DOC_PATH);
const onDisk = fs.existsSync(docFile) ? fs.readFileSync(docFile, 'utf8') : '';
ok(onDisk === renderDoc(),
  `${DOC_PATH} è allineato al modulo`,
  'hai cambiato le risposte senza rigenerare: node scripts/wa-export.mjs');

// ---------------------------------------------------------------------------
// La pagina da cui si copia col pollice deve leggere QUESTO modulo, non una
// seconda copia dei testi: due copie divergono al primo cambio di prezzo.
console.log('\n\x1b[1m6. Una copia sola\x1b[0m');
const page = fs.readFileSync(path.join(ROOT, 'risposte.html'), 'utf8');
ok(page.includes('js/whatsapp-replies.js'), '/risposte carica il modulo condiviso');
ok(!/Valentino from BOOM Rome/.test(page), 'la pagina non contiene una copia dei testi');
ok(/no-store|noindex/.test(page), '/risposte non è indicizzabile (è materiale interno)');
const noindexGroup = JSON.stringify(vercel.headers || []);
ok(noindexGroup.includes('risposte'), 'vercel.json tiene /risposte fuori dai motori');

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mNessuna risposta salvata porta a un 404, a un prezzo vecchio o a un documento scaduto.\x1b[0m');
