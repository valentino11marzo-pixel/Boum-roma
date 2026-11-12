// tests/riservatezza/run.mjs — NEL REPOSITORY SOLO DATI INVENTATI.
//
// Il 12/11/2026 questo repository risultava PUBBLICO su GitHub, e fixture,
// commenti e note portavano dati di persone vere; un default del codice era
// l'indirizzo di un terzo. Nessuna suite poteva accorgersene: ognuna guardava
// il comportamento del codice, nessuna i dati che il codice e i test si
// portano dietro.
//
// Come nascevano: le fixture venivano scritte guardando un caso vero (un dump
// di produzione, un'email, una chiamata) e il caso restava nella fixture.
// La regola è in CLAUDE.md («Solo dati inventati»); questa è la sua rete.
//
// COSA GUARDA (ogni file tracciato da git, test compresi: è da lì che è
// uscito il primo caso):
//   1. una casella su un provider di posta personale (gmail, libero, …);
//   2. un numero di telefono che non è un numero dell'azienda e non è
//      EVIDENTEMENTE inventato (vedi `evidentlySynthetic`);
//   3. un codice fiscale col carattere di controllo valido, fuori
//      dall'elenco dei codici sintetici già in uso;
//   4. un IBAN valido (mod 97) che non è quello dell'azienda né un esempio;
//   5. un riferimento con la forma di quelli veri: `BOOM-` + 8 caratteri
//      (le proposte) e un id di sessione Stripe live;
//   6. un segreto: token di bot Telegram, chiavi live, chiavi private.
// Le eccezioni sono nominate, per riga (`on`) e col perché; un'eccezione che
// non serve più fa cadere il test anche lei.
//
// COSA NON PUÒ GUARDARE, e va detto: i NOMI e gli INDIRIZZI. Un nome vero
// non ha una forma che lo distingua da uno inventato, e nessuna espressione
// regolare lo prenderà. Per quelli la rete non c'è: c'è la regola, e chi
// scrive una fixture.
//
// E la rete ha le maglie: un numero vero con quattro cifre uguali di fila
// passa per inventato (circa uno su cento). Per questo nelle fixture si
// usano le forme dichiarate qui sotto, non un numero «a caso».

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = 'tests/riservatezza/run.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ─── i file ─────────────────────────────────────────────────────────────────
// Quelli tracciati da git. Se git non c'è (un archivio scompattato) si
// cammina l'albero: meglio guardare qualche file in più che nessuno.
function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean);
  } catch {
    const out = [];
    (function walk(dir) {
      for (const name of readdirSync(dir)) {
        if (name === '.git' || name === 'node_modules') continue;
        const abs = join(dir, name);
        if (statSync(abs).isDirectory()) walk(abs); else out.push(relative(ROOT, abs).split(sep).join('/'));
      }
    })(ROOT);
    return out;
  }
}
// Dati generati, non scritti da nessuno: hash d'integrità, un font in
// base64, la costa d'Europa in gradi. Lunghe sequenze di cifre che non sono
// di nessuno.
const GENERATED = new Set(['package-lock.json', 'api/package-lock.json', 'api/_pdffont-data.js', 'cities/_europe.json']);
const files = trackedFiles().filter((f) => !GENERATED.has(f));

// ─── 1) caselle personali ───────────────────────────────────────────────────
const PROVIDERS = ['gmail', 'googlemail', 'hotmail', 'outlook', 'live', 'msn', 'yahoo', 'ymail', 'icloud', 'me', 'mac',
  'libero', 'virgilio', 'tiscali', 'alice', 'tin', 'fastwebnet', 'inwind', 'iol', 'katamail', 'poste', 'proton', 'protonmail',
  'pm', 'gmx', 'aol', 'yandex', 'web', 'orange', 'wanadoo', 'free', 'laposte', 'sfr', 't-online', 'qq', '163', 'naver',
  'hey', 'zoho', 'tutanota', 'tuta', 'pec', 'legalmail', 'arubapec'];
const TLDS = ['com', 'it', 'fr', 'de', 'es', 'co\\.uk', 'net', 'me', 'ru', 'pt', 'nl', 'ch', 'at', 'be', 'com\\.br', 'com\\.tr', 'io'];
const MAILBOX = new RegExp('[A-Za-z0-9._%+-]+@(?:' + PROVIDERS.join('|').replace(/-/g, '\\-') + ')\\.(?:' + TLDS.join('|') + ')(?![A-Za-z0-9-])', 'gi');
// Un mittente di sistema non è la casella di nessuno.
const SYSTEM_LOCAL = /^(?:mailer-daemon|postmaster|no-?reply|noreply|bounce[s]?|do-?not-?reply)@/i;
const mailboxesIn = (s) => [...String(s).matchAll(MAILBOX)].map((m) => m[0].toLowerCase()).filter((a) => !SYSTEM_LOCAL.test(a));

// ─── 2) telefoni ────────────────────────────────────────────────────────────
// I numeri dell'AZIENDA: quello che il sito pubblica su ogni pagina, e quelli
// dell'infrastruttura (non sono di una persona).
const BUSINESS = new Map([
  ['393313251961', 'il numero BOOM pubblicato su ogni pagina del sito'],
  ['17078466974', 'il numero Twilio del workspace della Receptionist (infrastruttura, STUDIO_CARICO)'],
  ['390698236589', 'un numero candidato nel carrello del provider, mai acquistato (bot/RECEPTIONIST.md)'],
]);
// Dove sta un numero: +CC…, 00CC…, wa.me/…, tel:…, un JID di WhatsApp, il
// valore di una chiave «telefono», un cellulare italiano scritto a gruppi.
const PHONE_RES = [
  /(?<![\w.@/=+-])\+\d[\d ().\-]{6,17}\d(?!\w)/g,
  /(?<![\w.@/=+-])00[1-9]\d[\d ().\-]{6,16}\d(?!\w)/g,
  /wa\.me\/\+?(\d{8,15})/g,
  /tel:\+?([\d\-]{8,16})/g,
  /[?&]phone=\+?(\d{8,15})/g,
  /(?<!\d)(\d{9,15})@(?:s\.whatsapp\.net|c\.us)/g,
  /(?:phone|tel|telefono|whatsapp|mobile|cell|cellulare|numero|msisdn|wa|num)[A-Za-z]{0,12}["']?\s*[:=]\s*["'`](\+?\d[\d ().\-]{6,17}\d)["'`]/gi,
  /(?<![\w.@/=+-])3\d{2}[ .\-]\d{3}[ .\-]?\d{4}(?![\w.])/g,
  /(?<![\w.@/=+-])3\d{2}[ .\-]\d{7}(?![\w.])/g,
  /["'`](3\d{9})["'`]/g,
];
function digitsOf(raw) {
  let d = String(raw).replace(/\D/g, '');
  if (/^\s*00/.test(String(raw).replace(/^[^\d+]*/, ''))) d = d.replace(/^00/, '');
  return d;
}
// EVIDENTEMENTE inventato: una forma che nessuno scambia per un numero vero.
//   - un intervallo riservato alla finzione (Ofcom 07700 900xxx · 01632
//     960xxx · 020 7946 0xxx, il 555 americano);
//   - cinque zeri di fila, o quattro cifre in scala (1234, 9876), ovunque;
//   - nelle ULTIME sette cifre (il prefisso 333 farebbe passare un numero
//     vero su dieci): quattro cifre uguali di fila, due terne uguali
//     attaccate (111222), o al più due cifre diverse.
// Un numero vero ci casca circa una volta su settanta: è una rete, non una
// prova. Per una fixture nuova: +39 333 1234567, +39 340 000 0000 e simili.
export function evidentlySynthetic(digits) {
  const d = String(digits);
  if (/^(?:44|440|0)7700900\d{3}$/.test(d) || /^(?:44|440|0)1632960\d{3}$/.test(d) || /^(?:44|440|0)2079460\d{3}$/.test(d)) return true;
  if (/^1?\d{3}555\d{4}$/.test(d) || /^1?555\d{7}$/.test(d)) return true;
  if (/0{5}/.test(d)) return true;
  for (let i = 0; i + 4 <= d.length; i++) {
    const a = [...d.slice(i, i + 4)].map(Number);
    if (a.every((x, k) => k === 0 || x === a[k - 1] + 1) || a.every((x, k) => k === 0 || x === a[k - 1] - 1)) return true;
  }
  const t = d.slice(-7);
  if (/(\d)\1{3}/.test(t)) return true;
  if (/(\d)\1\1(\d)\2\2/.test(t)) return true;
  if (new Set(t).size <= 2) return true;
  return false;
}
function phonesIn(s) {
  const out = new Map();
  for (const re of PHONE_RES) {
    for (const m of String(s).matchAll(re)) {
      const raw = m[1] || m[0];
      const d = digitsOf(raw);
      if (d.length < 9 || d.length > 15) continue;
      const key = /^3\d{8,9}$/.test(d) ? '39' + d : d;          // un cellulare italiano scritto senza prefisso
      if (BUSINESS.has(key) || BUSINESS.has(d)) continue;
      if (evidentlySynthetic(d)) continue;
      out.set(key, raw.trim());
    }
  }
  return [...out.keys()];
}

// ─── 3) codici fiscali ──────────────────────────────────────────────────────
const CF = /(?<![A-Za-z0-9])[A-Za-z]{6}\d{2}[A-EHLMPRSTa-ehlmprst]\d{2}[A-Za-z]\d{3}[A-Za-z](?![A-Za-z0-9])/g;
const ODD = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
export function cfValid(code) {
  const c = String(code).toUpperCase();
  if (!/^[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 15; i++) s += i % 2 === 0 ? ODD[c[i]] : (/\d/.test(c[i]) ? +c[i] : c.charCodeAt(i) - 65);
  return String.fromCharCode(65 + (s % 26)) === c[15];
}
// I codici SINTETICI in uso nelle suite: costruiti da nomi di fantasia, non
// presi da nessuno. Per una fixture nuova si riusa uno di questi, o un codice
// col carattere di controllo sbagliato.
const SYNTHETIC_CF = new Map([
  ['RSSMRA85T10A562S', 'Rossi Mario: l\'esempio dei manuali'],
  ['RSSMRA80A01H501U', 'Rossi Mario, 1/1/1980, Roma'],
  ['RSSNNA70A41H501J', 'Rossi Anna, 1/1/1970, Roma'],
  ['RSSNNA80A41H501L', 'Rossi Anna, 1/1/1980, Roma'],
  ['BNCGLI70A41H501A', 'Bianchi Giulia, 1/1/1970, Roma'],
  ['BNCLCU00B02H501C', 'Bianchi Luca, 2/2/2000, Roma'],
  ['NREMRT99T41H501X', 'Neri Marta, 1/12/1999, Roma'],
  ['DNGMRC90A01H501V', 'D\'Angelo Marco, 1/1/1990, Roma'],
  ['TSTOYK95A41H501P', 'Testa Oyku, 1/1/1995, Roma'],
  ['VRDGLI90A41H501U', 'Verdi Giulia, 1/1/1990, Roma'],
  ['SMTJHN85M01Z404G', 'Smith John, 1/8/1985, nato all\'estero'],
  ['SMPLSE05E50Z110Y', 'Sample Elsa: la conduttrice delle fixture di contratto'],
  ['PRVNOA05C52Z110Y', 'Prova Noa: la co-conduttrice delle stesse fixture'],
]);
const cfsIn = (s) => [...String(s).matchAll(CF)].map((m) => m[0].toUpperCase()).filter((c) => cfValid(c) && !SYNTHETIC_CF.has(c));

// ─── 4) IBAN ────────────────────────────────────────────────────────────────
const IBAN = /(?<![A-Z0-9])[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?(?![A-Z0-9])/g;
export function ibanValid(raw) {
  const s = String(raw).replace(/ /g, '');
  if (s.length < 15 || s.length > 34) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  let m = 0;
  for (const ch of r) m = (m * 10 + +ch) % 97;
  return m === 1;
}
const KNOWN_IBAN = new Map([
  ['IT54O0326803200052861450580', 'il conto di Egidi Immobiliare S.r.l., che /casa dà a chi paga con bonifico (js/rent-engine.js è servito dal sito)'],
  ['IT60X0542811101000000123456', 'l\'IBAN italiano degli esempi'],
  ['IT40S0542811101000000123456', 'variante dell\'esempio, nelle suite'],
  ['IT07X0542811101000000654321', 'variante dell\'esempio, nelle suite'],
  ['IT79O0123456789000012345678', 'sintetico (ABI 01234, conto 12345678)'],
  ['DE89370400440532013000', 'l\'esempio tedesco della documentazione IBAN'],
  ['GB82WEST12345698765432', 'l\'esempio britannico della documentazione IBAN'],
  ['FR1420041010050500013M02606', 'l\'esempio francese della documentazione IBAN'],
  ['NL91ABNA0417164300', 'l\'esempio olandese della documentazione IBAN'],
]);
const ibansIn = (s) => [...String(s).matchAll(IBAN)].map((m) => m[0].replace(/ /g, '')).filter((v) => ibanValid(v) && !KNOWN_IBAN.has(v));

// ─── 5) riferimenti con la forma di quelli veri ─────────────────────────────
// Le proposte vere sono BOOM-<8 caratteri base36>. Le fixture ne usano 6
// (BOOM-AB12CD) o una parola (BOOM-ORFANA): mai otto.
const REF = /(?<![A-Z0-9-])BOOM-[A-Z0-9]{8}(?![A-Z0-9])/g;
const REF_SHAPE_ONLY = new Set(['BOOM-XXXXXXXX']);
const refsIn = (s) => [...String(s).matchAll(REF)].map((m) => m[0]).filter((v) => !REF_SHAPE_ONLY.has(v) && /\d/.test(v) && /[A-Z]/.test(v.slice(5)));
// Una sessione Stripe live vera è lunga e casuale; una finta lo dichiara.
const STRIPE_LIVE = /cs_live_[A-Za-z0-9]{30,}/g;
const stripeIn = (s) => [...String(s).matchAll(STRIPE_LIVE)].map((m) => m[0]).filter((v) => !/synthetic|fixture|test|fake/i.test(v));

// ─── 6) segreti ─────────────────────────────────────────────────────────────
const SECRETS = [
  ['un token di bot Telegram', /(?<!\d)\d{8,10}:AA[A-Za-z0-9_-]{33}(?![A-Za-z0-9_-])/g],
  ['una chiave Stripe live', /(?:sk|rk)_live_[A-Za-z0-9]{16,}/g],
  ['un segreto di webhook Stripe', /whsec_[A-Za-z0-9]{24,}/g],
  ['una chiave Anthropic', /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ['una chiave OpenAI', /sk-proj-[A-Za-z0-9_-]{20,}/g],
  ['un token GitHub', /(?:ghp|gho|ghs)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/g],
  ['una chiave privata', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g],
];
const secretsIn = (s) => SECRETS.flatMap(([label, re]) => [...String(s).matchAll(re)].map(() => label));

// ─── la guardia vede davvero? ───────────────────────────────────────────────
// (Una regola che non trova mai niente è indistinguibile da una che non
// guarda.) I campioni si COMPONGONO a pezzi: scritti per intero, questo file
// cadrebbe sulla propria regola.
const AT = '@';
ok(mailboxesIn('scrivi a nome.cognome' + AT + 'gmail.com oggi').length === 1, 'la guardia vede una casella personale');
ok(mailboxesIn('x' + AT + 'libero.it · y' + AT + 'hotmail.co.uk · z' + AT + 'pec.it').length === 3, '…anche italiana, britannica, certificata');
ok(mailboxesIn('hello' + AT + 'boom-rome.com · mario' + AT + 'example.com · you' + AT + 'email.com').length === 0, 'una casella dell\'azienda, un dominio riservato e un segnaposto non sono casi');
ok(mailboxesIn('Mail Delivery Subsystem <mailer-daemon' + AT + 'googlemail.com>').length === 0, 'un mittente di sistema non è la casella di nessuno');

const UNASSIGNED = '+' + '999 58' + '19 26437';                                   // +999 non esiste: di nessuno, ma ha la forma
ok(phonesIn('chiamami al ' + UNASSIGNED).length === 1, 'la guardia vede un numero che non è evidentemente inventato');
ok(phonesIn("phone: '" + '99958' + '1926437' + "'").length === 1, '…anche senza il +, come valore di una chiave telefono');
ok(phonesIn('https://wa.me/' + '99958' + '1926437' + '?text=ciao').length === 1, '…e dentro un link WhatsApp');
ok(phonesIn('99958' + '1926437' + AT + 's.whatsapp.net').length === 1, '…e in un JID di WhatsApp');
ok(phonesIn('+39 331 325 1961 · wa.me/393313251961 · +39-331-325-1961').length === 0, 'il numero dell\'azienda passa, in ogni grafia');
ok(phonesIn('+39 333 1234567 · +393339999999 · +447700900123 · +39 340 000 0000 · 3331112222').length === 0, 'le forme inventate passano');
ok(!evidentlySynthetic('34' + '6189' + '27354') && !evidentlySynthetic('39347' + '5819264'), 'un numero qualunque NON è «evidentemente inventato»');
ok(evidentlySynthetic('393331234567') && evidentlySynthetic('34600000001') && evidentlySynthetic('393337654321') && evidentlySynthetic('905321112222'),
  'scale, zeri e cifre ripetute sì');
ok(phonesIn('M12 340 453 557 L88 · h1 ^= Math.imul(h2, 3266489909) · €1.234.567 · 2026-11-12T10:00').length === 0, 'un tracciato SVG, una costante, un importo e una data non sono telefoni');

const body15 = 'XXXYYY' + '00A01' + 'Z999';
const fakeCf = body15 + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((ch) => cfValid(body15 + ch));
ok(cfValid(fakeCf) && cfsIn('cf: ' + fakeCf).length === 1 && cfsIn('cf: ' + fakeCf.toLowerCase()).length === 1, 'la guardia vede un codice fiscale valido fuori elenco (anche minuscolo)');
ok(cfsIn('RSSMRA85T10A562S · RSSMRA85T10A562A').length === 0, 'un codice dell\'elenco passa, e uno col carattere di controllo sbagliato non è il codice di nessuno');
ok([...SYNTHETIC_CF.keys()].every(cfValid), 'ogni codice dell\'elenco è davvero valido (altrimenti la voce non serve)');

const ibanBody = 'X05428' + '11101' + '000000' + '765432';
const fakeIban = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', ...Array.from({ length: 88 }, (_, i) => String(i + 10))]
  .map((cc) => 'IT' + cc + ibanBody).find(ibanValid);
ok(Boolean(fakeIban) && ibansIn('iban ' + fakeIban).length === 1, 'la guardia vede un IBAN valido fuori elenco');
ok(ibansIn('IT60X0542811101000000123456 · IT00X0000000000000000000000').length === 0, 'un esempio dell\'elenco passa, e uno che non torna al mod 97 non è un IBAN');
ok([...KNOWN_IBAN.keys()].every(ibanValid), 'ogni IBAN dell\'elenco è davvero valido');

ok(refsIn('la proposta BOOM-' + 'MX7Q2K' + '9A era pagata').length === 1, 'la guardia vede un riferimento con la forma di quelli veri');
ok(refsIn('BOOM-AB12CD · BOOM-ORFANA · BOOM-XXXXXXXX · BOOM-SYNTHETIC').length === 0, 'i riferimenti delle fixture (sei caratteri, una parola) passano');
ok(stripeIn('cs_live_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8').length === 1 && stripeIn('cs_live_SYNTHETICabandonedCheckoutSessionOfTheRecoveryTest00000001 · cs_live_up_1').length === 0,
  'una sessione Stripe live lunga e casuale cade; una che si dichiara finta, o corta, no');
ok(secretsIn('botToken: \'' + '1234567890' + ':AA' + 'x'.repeat(33) + '\'').length === 1 && secretsIn('sk' + '_live_' + 'a'.repeat(24)).length === 1
  && secretsIn('-----BEGIN ' + 'PRIVATE KEY-----').length === 1 && secretsIn('TELEGRAM_BOT_TOKEN · sk_test_abc · AIzaSy…').length === 0,
  'la guardia vede un token Telegram, una chiave live e una chiave privata — non i loro nomi');

// ─── le eccezioni ───────────────────────────────────────────────────────────
// Ognuna vale per UNA riga (riconosciuta da `on`) e dice perché. `kind` è la
// classe. Il valore NON si ripete qui: un numero o una casella di qualcuno
// scritti in un secondo file sarebbero un secondo posto da cui toglierli.
const ALLOWED = [
  { kind: 'casella', file: 'book.html', on: 'id="in-email" placeholder=',
    why: 'il segnaposto del campo email della prenotazione: «you», non una persona' },
  { kind: 'casella', file: 'cockpit-preview.html', on: 'whitelist:',
    why: 'il login Google dell\'operatore nella whitelist degli admin: un identificativo suo, nella sua pagina' },
  { kind: 'telefono', file: 'onboarding.html', on: 'waNum=',
    why: 'il numero WhatsApp a cui /onboarding manda il messaggio: da confermare col proprietario (se è superato, ci va il numero BOOM)' },
  { kind: 'telefono', file: 'proppass.html', on: 'Emergency Phone',
    why: 'il «telefono d\'emergenza» precompilato nel generatore di pass: da confermare col proprietario' },
  { kind: 'sessione stripe', file: 'tests/cities/checkout.mjs', on: 'const sids',
    why: 'una sessione finta scritta a scala (a1B2c3…): serve con la forma di una vera per provare quali id la porta accetta' },
  { kind: 'segreto', file: 'tests/segretaria/context.mjs', on: 'fixture_secret',
    why: 'una chiave finta («fixture_secret») per provare che il contesto la toglie' },
];

// ─── il giro ────────────────────────────────────────────────────────────────
const found = [];
let read = 0;
for (const f of files) {
  let buf;
  try { buf = readFileSync(join(ROOT, f)); } catch { continue; }
  if (buf.includes(0) || buf.length > 16 * 1024 * 1024) continue;
  read++;
  if (f === SELF) continue;                         // i propri elenchi e i campioni composti a pezzi
  buf.toString('utf8').split('\n').forEach((text, i) => {
    if (text.length > 200000) return;               // una riga di dati incorporati (un PNG in base64)
    const line = i + 1;
    for (const value of mailboxesIn(text)) found.push({ kind: 'casella', file: f, line, value, text });
    for (const value of phonesIn(text)) found.push({ kind: 'telefono', file: f, line, value, text });
    for (const value of cfsIn(text)) found.push({ kind: 'codice fiscale', file: f, line, value, text });
    for (const value of ibansIn(text)) found.push({ kind: 'iban', file: f, line, value, text });
    for (const value of refsIn(text)) found.push({ kind: 'riferimento', file: f, line, value, text });
    for (const value of stripeIn(text)) found.push({ kind: 'sessione stripe', file: f, line, value, text });
    for (const value of secretsIn(text)) found.push({ kind: 'segreto', file: f, line, value, text });
  });
}
ok(read > 1000, `la guardia legge il repository (${read} file di testo): un elenco vuoto passerebbe sempre`);
for (const f of ['tests/upgrade/run.mjs', 'tests/recovery/run.mjs', 'js/portal-app.js', 'api/fiscal/_aspi.js', 'CLAUDE.md', 'index.html', 'bot/HOMIE.md']) {
  ok(files.includes(f), `fra i file letti c'è ${f}`);
}

const excuses = (a, x) => a.kind === x.kind && a.file === x.file && x.text.includes(a.on);
const unexpected = found.filter((x) => !ALLOWED.some((a) => excuses(a, x)));
// Nell'output il POSTO, mai il valore: la CI di un repository pubblico è
// pubblica anche lei.
const byKind = {};
for (const x of unexpected) (byKind[x.kind] ||= []).push(`${x.file}:${x.line}`);
for (const [k, list] of Object.entries(byKind)) console.log(`   ${k}: ${[...new Set(list)].slice(0, 40).join(' · ')}${list.length > 40 ? ' …' : ''}`);
const none = (kind) => !unexpected.some((x) => x.kind === kind);
ok(none('casella'), 'nessuna casella su un provider di posta personale (le fixture usano example.com; un terzo non sta nel codice)');
ok(none('telefono'), 'nessun numero di telefono che non sia dell\'azienda o evidentemente inventato');
ok(none('codice fiscale'), 'nessun codice fiscale valido fuori dall\'elenco dei sintetici');
ok(none('iban'), 'nessun IBAN valido che non sia quello dell\'azienda o un esempio');
ok(none('riferimento') && none('sessione stripe'), 'nessun riferimento di proposta e nessuna sessione Stripe con la forma di quelli veri');
ok(none('segreto'), 'nessun token e nessuna chiave: un segreto sta nelle env, e uno finito qui si REVOCA (toglierlo non basta)');

const stale = ALLOWED.filter((a) => !found.some((x) => excuses(a, x)));
for (const a of stale) console.log(`   eccezione che non serve più: ${a.kind} in ${a.file} (${a.on})`);
ok(stale.length === 0, "ogni eccezione serve ancora: un'eccezione inutile si toglie dall'elenco");

// ─── la regola è scritta dove la legge chi scrive ───────────────────────────
const guide = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
ok(/Solo dati inventati/.test(guide) && /tests\/riservatezza/.test(guide), 'CLAUDE.md porta la regola «Solo dati inventati» e nomina questa suite');
ok(/riservatezza/.test(readFileSync(join(ROOT, 'tests/run-all.mjs'), 'utf8')), 'la suite è nel registro di npm test');

console.log(`\n${fail ? '✗' : '✓'} riservatezza: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
