// tests/catalogo/strumento.mjs — /catalogo, LO STRUMENTO CHE SCRIVE LE CORREZIONI
// (suite `catalogostrumento`).
//
// js/catalogo-correzioni.js dice COSA cambiare nel catalogo (il nome dalla
// via vera, i dati che si possono provare); catalogo.html lo scrive su
// Firestore con un tap dell'admin. Uno strumento che scrive su 27 annunci
// veri in un colpo deve dimostrare queste cose, e questa suite le pretende
// in un Chromium vero (Firebase finto, i 27 annunci del 15/10/2026 dal
// fixture) e, per le descrizioni, col SERVER VERO: /api/wizard/describe è
// instradato all'handler di api/wizard/describe.js, con Firestore REST,
// Identity Toolkit e Anthropic finti (solo la rete è simulata). Il mondo è
// UNO: il server legge il Firestore finto della pagina, e le sue scritture
// tornano lì — la pagina, rileggendo, vede ciò che il server ha scritto.
//
//   1. 27 righe; si preseleziona SOLO la proposta ancora valida: un nome
//      cambiato a mano dopo la proposta arriva deselezionato (nome, dati e
//      descrizione), con l'avviso.
//   2. Una scelta vale sul valore su cui è stata fatta: una spunta o un nome
//      scritto a mano NON sopravvivono a una rilettura che trova un valore
//      diverso (rinomina concorrente + Applica, ↻ Ricarica), e non tornano
//      in vita se il valore torna com'era.
//   3. Ciò che si vede è ciò che si scrive: un annuncio toccato dopo il
//      caricamento non si scrive (il nome E i campi delle correzioni,
//      ricontrollati in transazione); permesso negato detto; un commit forse
//      avvenuto (deadline-exceeded, unavailable) è «incerto», mai «niente
//      scritto»; un nome vuoto, troppo lungo o DOPPIO blocca la conferma; e
//      una casella cambiata dietro il foglio fa riconfermare.
//   4. Pagina e server d'accordo su cosa si rigenera (regenerable ⇄
//      regenVerdict, sul fixture e per mutazione); i «lotto12» sono umani; le
//      camere incerte non si rigenerano da sole; si rigenera DOPO le
//      scritture, a blocchi di al massimo 3, col Bearer; l'esito mostra la
//      frase del server, poi il codice, e per broke_rules i problemi.
//   5. Senza una lettura dal server la pagina non propone niente: una
//      rilettura fallita toglie la lista e la barra.
//   6. Un nome con <img onerror> è testo; da telefono (390px) niente scorre
//      di lato e nessun bottone che scrive è coperto.
//
// Più i controlli sulla sorgente; e OGNI regola è rieseguita su una copia
// ROTTA (della pagina o di js/catalogo-correzioni.js): la suite pretende che
// la regola cada (mutazioni in coda alle sezioni).
//
// La parte statica gira sempre; quella in browser si auto-skippa senza
// playwright, come le altre suite del repo.

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import FIX from '../../js/catalogo-correzioni.js';
import { loadChromium, launchOptions } from '../_browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const PAGE = src('catalogo.html');
const FIXTURE = JSON.parse(src('tests/catalogo/fixture-listings-2026-10-15.json'));
const CMD = 'node scripts/catalogo-nomi.mjs --from-firestore';
const ADMIN = 'admin@boomrome.com';
const TOKEN = 'tok-admin-1';

// ── l'ambiente del server PRIMA del modulo (homie/_lib legge l'env quando si
// carica). Solo la rete è finta: il codice del server è quello vero.
process.env.FIREBASE_API_KEY = 'fb-key';
process.env.FIREBASE_ADMIN_EMAIL = 'server@boom.test';
process.env.FIREBASE_ADMIN_PASS = 'pw';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.CRON_SECRET = 'cron-secret-test';
process.env.ANTHROPIC_API_KEY = 'anthropic-test';
for (const k of ['LOCAL_AI_URL', 'LOCAL_AI_MODEL', 'LOCAL_AI_VISION_MODEL', 'ANTHROPIC_MODEL']) delete process.env[k];
let D = null, erroreD = null;
try { D = await import('../../api/wizard/describe.js'); } catch (e) { erroreD = e; }

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + String(detail).slice(0, 500) : '')); }
}
// una mutazione deve far CADERE la regola: se passa ancora, la regola è cieca.
// `ancoraVera` può essere una funzione: una mutazione che non trova il suo
// appiglio è un fallimento detto, mai un crash che nasconde il resto
function caduta(name, ancoraVera) {
  let v;
  try { v = typeof ancoraVera === 'function' ? ancoraVera() : ancoraVera; }
  catch (e) { check('mutazione: ' + name + ' → non applicabile', false, e.message); return; }
  check('mutazione: ' + name + ' → la regola cade', !v);
}
function muta(testo, coppie) {
  let out = testo;
  for (const [da, a] of coppie) {
    if (!out.includes(da)) throw new Error('mutazione senza appiglio: ' + da.slice(0, 70));
    out = out.replace(da, a);
  }
  return out;
}

// ══ L'ORACOLO — cosa DEVE succedere, ricavato dai dati, non dalla pagina ══
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const loose = (s) => norm(s).toLowerCase();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const L = (id) => FIXTURE.find((l) => l._id === id);
function statoNome(l) {
  const P = FIX.LISTINGS[l._id];
  if (!P) return 'nessuna';
  if (norm(l.name) === norm(P.name)) return 'applicato';
  if (norm(l.name) === norm(P.from)) return 'da-fare';
  return 'a-mano';
}
const incerta = (id) => !!FIX.LISTINGS[id] && (FIX.LISTINGS[id].incerto || []).includes('camere');
// la regola dichiarata di tagsReplace: il vecchio diventa il nuovo; se il
// nuovo c'è già, il vecchio sparisce e basta (mai un doppione)
function sostituisciAtteso(arr, mappa) {
  const has = (k) => Object.prototype.hasOwnProperty.call(mappa, k);
  const out = [];
  for (const x of arr) {
    if (has(x)) { if (!arr.includes(mappa[x]) && !out.includes(mappa[x])) out.push(mappa[x]); }
    else out.push(x);
  }
  return out;
}
// gli update attesi coi default (nessuna casella toccata)
function attesi(docs) {
  const out = {};
  for (const l of docs) {
    const P = FIX.LISTINGS[l._id];
    if (!P) continue;
    const st = statoNome(l);
    if (st === 'a-mano') continue;                  // niente parte da solo
    const u = {};
    if (st === 'da-fare') {
      u.name = P.name;
      if (!(l.nameOriginal != null && String(l.nameOriginal).trim()) && norm(l.name)) u.nameOriginal = l.name;
      u.nameUpdatedAt = { __fv: 'serverTimestamp' };
      u.nameUpdatedBy = ADMIN;
    }
    for (const [k, v] of Object.entries(P.fix || {})) {
      if (k === 'tagsReplace') {
        for (const campo of ['tags', 'features']) {
          const arr = Array.isArray(l[campo]) ? l[campo] : null;
          if (!arr || !Object.keys(v).some((o) => arr.includes(o))) continue;
          u[campo] = sostituisciAtteso(arr, v);
        }
      } else if (!eq(l[k], v) && !((k === 'zone' || k === 'type') && loose(l[k]) !== loose(v))) {
        u[k] = v;
      }
    }
    if (Object.keys(u).length) { u.updatedAt = { __fv: 'serverTimestamp' }; out[l._id] = u; }
  }
  return out;
}
// le descrizioni che partono coi default: rigenerabili (lo specchio del
// server), con problemi, su una riga non cambiata a mano, camere non incerte
function regenAttese(docs) {
  return docs.filter((l) => FIX.regenerable(l).ok && FIX.descriptionIssues(l).length > 0
    && statoNome(l) !== 'a-mano' && !incerta(l._id)).map((l) => l._id);
}

// ══ LA PARTE STATICA — la sorgente ═══════════════════════════════════════
console.log('CATALOGO — lo strumento: la sorgente');

// (a) vercel.json: /catalogo e /catalogo.html sono superfici admin —
// noindex E no-store. Stessa traduzione path-to-regexp di tests/crawl.
const sorgenteRe = (s) => new RegExp('^' + s
  .replace(/:([A-Za-z_]\w*)\(((?:[^()]|\([^()]*\))*)\)/g, '(?<$1>$2)')
  .replace(/:([A-Za-z_]\w*)\*/g, '(?<$1>.*)')
  .replace(/:([A-Za-z_]\w*)/g, '(?<$1>[^/]+)') + '$');
function headerAdmin(vercelTesto) {
  const v = JSON.parse(vercelTesto);
  const ok = (p) => (v.headers || []).some((g) => {
    const hs = g.headers || [];
    return sorgenteRe(g.source).test(p)
      && hs.some((x) => /^x-robots-tag$/i.test(x.key) && /noindex/i.test(x.value))
      && hs.some((x) => /^cache-control$/i.test(x.key) && /no-store/i.test(x.value));
  });
  return ok('/catalogo') && ok('/catalogo.html');
}
const VERCEL = src('vercel.json');
check('vercel.json: /catalogo e /catalogo.html ricevono X-Robots-Tag noindex e Cache-Control no-store', headerAdmin(VERCEL));
{
  const v = JSON.parse(VERCEL);
  const sitemap = src('sitemap.xml');
  const toccate = [...sitemap.matchAll(/<loc>https:\/\/www\.boomrome\.com(\/[^<]*)<\/loc>/g)].map((m) => m[1])
    .filter((p) => /^\/catalogo/.test(p));
  check('nessuna pagina della sitemap comincia con /catalogo (il gruppo è un prefisso)', toccate.length === 0, toccate.join(', '));
  check('vercel.json: nessuna regola functions nuova (il limite è 50)', Object.keys(v.functions || {}).length <= 50);
}

// (b) la sidebar del portale: UN collegamento, nel gruppo «Console e sistema»
const APP = src('js/portal-app.js');
function linkSidebar(app) {
  const i = app.indexOf('data-nav-group="console"');
  if (i < 0) return false;
  const gruppo = app.slice(i, app.indexOf('</div></details>', i));
  const qui = gruppo.match(/<div [^>]*class="nav-item"[^>]*onclick="window\.open\('\/catalogo','_blank'\)"[^>]*>[\s\S]*?<\/div>/g) || [];
  const ovunque = (app.match(/window\.open\('\/catalogo'/g) || []).length;
  return qui.length === 1 && ovunque === 1 && /🏷/.test(qui[0]) && /Catalogo<\/div>$/.test(qui[0])
    && /role="button"/.test(qui[0]) && /tabindex="0"/.test(qui[0]);
}
check('portal-app.js: un solo nav-item «🏷 Catalogo» nel gruppo Console e sistema, che apre /catalogo', linkSidebar(APP));

// (c) l'ordine degli script: listing-facts PRIMA di catalogo-correzioni
function ordineScript(html) {
  const at = (f) => { const m = html.split('<script src="' + f + '"></script>'); return m.length === 2 ? m[0].length : -1; };
  const cfg = at('/js/firebase-config.js'), bp = at('/js/boom-portal.js');
  const facts = at('/js/listing-facts.js'), fix = at('/js/catalogo-correzioni.js');
  return cfg >= 0 && bp > cfg && facts >= 0 && fix > facts && html.indexOf('<script>\n(function () {') > fix;
}
check('catalogo.html: firebase-config → boom-portal, listing-facts → catalogo-correzioni, poi la pagina', ordineScript(PAGE));
// …e perché conta: caricato prima, catalogo-correzioni non trova BOOM_FACTS
const CORR = src('js/catalogo-correzioni.js'), FACTS_SRC = src('js/listing-facts.js');
function caricaFix(corr, ordine) {
  const w = {};
  for (const code of (ordine === 'invertito' ? [corr, FACTS_SRC] : [FACTS_SRC, corr])) vm.runInNewContext(code, { window: w });
  return w.BOOM_CATALOGO_FIX;
}
{
  const prova = (ordine) => { try { caricaFix(CORR, ordine).descriptionIssues(FIXTURE[0]); return 'ok'; } catch (e) { return 'errore'; } };
  check('l\'ordine conta davvero: listing-facts → catalogo-correzioni funziona, al contrario lancia',
    prova('giusto') === 'ok' && prova('invertito') === 'errore');
}

// (d) l'igiene della pagina
function igiene(html) {
  const testa = html.slice(0, html.indexOf('</head>'));
  return /<meta name="robots" content="noindex/.test(testa)
    && /BP\.requireAuth\(\['admin'\], \{ loginUrl: '\/login' \}\)/.test(html)
    && /href="\/portal"/.test(html)
    && !/freshOnReturn/.test(html)
    && /BoomPortal\.bugButton\('catalogo'\)/.test(html);
}
check('catalogo.html: noindex, solo admin, via del ritorno al portale, 🐞, nessun reload automatico (ci sono form)', igiene(PAGE));
const htmlDaDati = (html) => /innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(html);
check('catalogo.html: nessun innerHTML/outerHTML/insertAdjacentHTML/document.write — solo textContent', !htmlDaDati(PAGE));
check('catalogo.html: descrizioni su /api/wizard/describe {mode:\'regenerate\'} col Bearer dell\'admin, e il comando per le pagine statiche',
  /fetch\('\/api\/wizard\/describe'/.test(PAGE) && /mode: 'regenerate'/.test(PAGE)
    && /'Authorization': 'Bearer ' \+ token/.test(PAGE) && /getIdToken\(\)/.test(PAGE) && PAGE.includes(CMD));
check('firestore.rules: listings è scrivibile dall\'admin (la pagina scrive coi permessi dell\'utente)',
  /match \/listings\/\{x\}\s*\{\s*allow read: if true; allow write: if isAdmin\(\); \}/.test(src('firestore.rules')));
// Il difetto vero lasciato da un riavvio a metà: DUE `function copia` (la
// copia profonda e il bottone degli appunti). La seconda sovrascriveva la
// prima in silenzio, e la base della sessione (S.visti) restava vuota.
function funzioniDoppie(html) {
  const js = html.slice(html.indexOf('<script>\n(function () {'));
  const visti = new Set(), doppie = new Set();
  for (const m of js.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) (visti.has(m[1]) ? doppie : visti).add(m[1]);
  return [...doppie];
}
check('catalogo.html: nessuna function dichiarata due volte (la seconda sovrascrive la prima senza un errore)',
  funzioniDoppie(PAGE).length === 0, funzioniDoppie(PAGE).join(', '));

// (e) LO SPECCHIO DEL SERVER — regenerable() contro regenVerdict
console.log('\nLO SPECCHIO DEL SERVER — cosa si rigenera, deciso uguale in pagina e su api/wizard/describe.js');
check('api/wizard/describe.js si carica (la prova di parità e il giro col server vero ne hanno bisogno)', !!D,
  erroreD && erroreD.message);
const kv = (v) => (v && v.ok ? 'ok/' + v.basis : 'no/' + (v && v.reason));
// casi sintetici: ogni ramo del verdetto e ogni segno del template
const SINT = D ? [
  { description: '' }, { description: '   \n ' }, { description: null }, {},
  { description: 'Beautiful bilocale in Centro, 60sqm on floor 1, fully furnished.' },
  { description: 'Spacious home, 70 sqm on floor 3.', descriptionSource: 'ai' },
  { description: 'Bright flat. Features include ac, balcony.' },
  { description: 'Features of the flat include a balcony.', descriptionSource: 'ai' },
  ...Object.keys(D.FEATURE_LABELS).map((k) => ({ description: 'A calm home with ' + k + '.', descriptionSource: 'ai' })),
  { description: 'Il testo della macchina.', descriptionSource: 'ai' },
  { description: 'Il testo della macchina.', descriptionSource: 'ai', descriptionAiHash: D.textHash('Il testo  della\nmacchina.') },
  { description: 'Corretto a mano dall\'assistente.', descriptionSource: 'ai', descriptionAiHash: D.textHash('Il testo della macchina.') },
  { description: 'Parole del fondatore.', descriptionSource: 'studio:a@b.c' },
  { description: 'Parole del fondatore.', descriptionSource: 'portal:valentino' },
  { description: 'Parole del fondatore.' },
  { description: 'Correzione approvata.', descriptionSource: 'lotto12' },
  { description: 'Correzione approvata.', descriptionSource: ' ai ' },
  { description: 'Correzione approvata.', descriptionSource: 'AI' },
] : [];
function parita(F) {
  // vero se la pagina decide come il server su tutto: fixture e sintetici
  if (!D) return false;
  const casi = FIXTURE.concat(SINT);
  const testi = FIXTURE.flatMap((l) => [l.description, l.descriptionIt])
    .concat(['', null, undefined, '  a \n b  ', 'Endertà', 'Enderta\u0300', 'Città\tvecchia', 'x'.repeat(4000), '€1,500 per month']);
  return casi.every((l) => kv(F.regenerable(l)) === kv(D.regenVerdict(l)))
    && testi.every((t) => F.textHash(t) === D.textHash(t))
    && casi.every((l) => F.isBoilerplate(l.description) === D.isBoilerplate(l.description));
}
if (D) {
  const diversi = FIXTURE.concat(SINT).filter((l) => kv(FIX.regenerable(l)) !== kv(D.regenVerdict(l)))
    .map((l) => (l._id || JSON.stringify(l).slice(0, 60)) + ' pagina ' + kv(FIX.regenerable(l)) + ' server ' + kv(D.regenVerdict(l)));
  check(`regenerable() decide come regenVerdict: i 27 annunci e ${SINT.length} casi (vuoto, template, impronta che torna e che non torna, sorgenti umane, «lotto12», « ai »)`,
    !diversi.length && parita(FIX), diversi.join(' | '));
}
// la decisione del fondatore, scritta: i «lotto12» sono correzioni approvate
// dall'operatore, quindi parole di una persona
function decisione(F) {
  return eq(F.MACHINE, ['ai'])
    && FIXTURE.filter((l) => l.descriptionSource === 'lotto12').length === 2
    && FIXTURE.filter((l) => l.descriptionSource === 'lotto12').every((l) => kv(F.regenerable(l)) === 'no/not_machine')
    && kv(F.regenerable({ description: 'Correzione approvata.', descriptionSource: 'lotto12' })) === 'no/not_machine';
}
check('MACHINE è [«ai»]: i due «lotto12» del catalogo sono correzioni approvate dall\'operatore, mai proposte per la rigenerazione',
  decisione(FIX));
// i problemi che il server mette in `issues` (copyIssues) e quelli della
// lista dell'assistente: ognuno ha la sua frase in pagina, mai un codice nudo
// davanti all'operatore. Un codice nuovo del server fa cadere qui.
const DESCRIBE_SRC = src('api/wizard/describe.js');
function frasiMancanti(html) {
  const blocco = (html.match(/var PROBLEMA = \{([\s\S]*?)\n  \};/) || [])[1] || '';
  const chiavi = new Set([...blocco.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]));
  const codici = [...DESCRIBE_SRC.matchAll(/out\.push\('([a-z_]+)'\)/g), ...CORR.matchAll(/out\.push\('([a-z_]+)'\)/g)].map((m) => m[1]);
  return codici.length ? [...new Set(codici)].filter((c) => !chiavi.has(c)) : ['(nessun codice trovato: la prova non misura niente)'];
}
check('ogni problema che il server (copyIssues) o la lista dell\'assistente può dire ha la sua frase in pagina',
  frasiMancanti(PAGE).length === 0, 'senza frase: ' + frasiMancanti(PAGE).join(', '));
// I rifiuti di regenerate (il contratto: 401 unauthorized, 403
// admin_required, 503 profile_unavailable, 500 server_missing_anthropic_key,
// 400 ids_required|too_many_ids|invalid_id): la funzione manda solo il codice,
// la frase la scrive la pagina — e ognuno è un codice che il server emette davvero.
const GUARD_SRC = src('api/pfs/_guard.js');
const CONTRATTO_RIFIUTI = ['unauthorized', 'admin_required', 'profile_unavailable', 'server_missing_anthropic_key',
  'ids_required', 'too_many_ids', 'invalid_id'];
function rifiutiMancanti(html) {
  const blocco = (html.match(/var RIFIUTO = \{([\s\S]*?)\n  \};/) || [])[1] || '';
  const chiavi = new Set([...blocco.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]));
  return CONTRATTO_RIFIUTI.filter((c) => !chiavi.has(c));
}
check('i rifiuti di regenerate hanno la loro frase in pagina, e il server li emette davvero (api/wizard/describe.js, api/pfs/_guard.js)',
  rifiutiMancanti(PAGE).length === 0 && CONTRATTO_RIFIUTI.every((c) => (DESCRIBE_SRC + GUARD_SRC).includes("'" + c + "'")),
  'senza frase: ' + rifiutiMancanti(PAGE).join(', '));

// LA LISTA DELL'ASSISTENTE DICE CIÒ CHE IL SERVER BLOCCA. descriptionIssues
// è la copia fedele di copyIssues: mai più larga (la regola di classe, in
// tests/catalogo/descrizioni.mjs) e, qui, nemmeno più stretta — sui 27
// annunci e su un corpo di frasi (ogni famiglia, e i falsi positivi che il
// fondatore ha voluto fuori) contro case di ogni forma.
const FRASI = [
  'A calm, well-kept home in Rome with good light and air conditioning.',
  'Only €1,500.', 'Rent is 1,200 per month.', '1.200/month', 'Affitto 900 al mese.', '1950 a month.', 'Canone 1.500.',
  'Cleaned twice per month.', 'Le scale si puliscono due volte al mese.', 'Rent is paid per month.', 'A 1950s building.',
  'No agency fee.', 'A deposit of two months.', 'Nessuna provvigione.', 'Deposito di due mensilità.',
  'Un deposito per le biciclette in cortile.', 'Deposito cauzionale richiesto.',
  'Available from 1 March.', 'A quiet street free from traffic.', 'Free from 1 March.', 'Free from next month.',
  'Libero dal traffico, il cortile è silenzioso.', 'Libera dal 1 settembre.', 'Disponibile dal 1 settembre.',
  'Ready to move in.', 'On Viale 21 Aprile, near the park.', 'September 1st, 2026.',
  'Ideal for stays from one month.', 'Perfect for short stays and digital nomads.', 'Flexible month-to-month rental.',
  'Soggiorni brevi anche di un mese.', 'Almeno tre mesi.', 'Ideal for long-term stays.', 'Monthly cleaning of the stairs.',
  'Mese dopo mese il quartiere cambia.',
  'On Via Endertà 9, a calm room.', 'Al civico 9 di Via Endertà.', 'Via del Corso 75 is close.', 'Corso Vittorio Emanuele II 34.',
  'Via Nazionale, 2 minutes away.', 'A due passi dal Museo Civico di Zoologia.', 'On Via Endertà, a calm room.',
  'The unfurnished space is yours.', 'Fully furnished.', 'Arredato con gusto.', 'La casa è vuota.', 'Bring your own furniture.',
  'Partially furnished, with a sofa.',
  'It offers three bedrooms.', 'Two bedrooms; one bedroom faces the courtyard.', 'One bedroom faces the courtyard.',
  'Una camera matrimoniale.', 'Una camera da letto.', 'A cosy monolocale.', 'A studio flat near Termini.', '2 bedrooms and a terrace.',
];
const FORME = [
  { type: 'bilocale', bedrooms: 1, furnished: 'yes', address: 'Via dei Cappellari 4' },
  { type: 'Loft', bedrooms: 2 }, { type: 'bilocale', bedrooms: 0, beds: 0, furnished: 'no' },
  { type: 'Room', bedrooms: 1 }, {}, { type: 'bilocale', furnished: 'partial', bedrooms: 2 },
  { address: 'Via Endertà 9', zone: 'Africano/Trieste', bedrooms: 1, tags: ['fully furnished'] },
  { address: 'Viale 21 Aprile 12', bedrooms: 1, furnished: 'yes' },
];
const testoDi = (l) => String(l.description || '') + '\n' + String(l.descriptionIt || '');
function divergenze(F) {
  if (!D) return ['api/wizard/describe.js non si carica'];
  const out = [];
  const confronta = (l, chi) => {
    const a = [...F.descriptionIssues(l)].sort(), b = [...D.copyIssues(testoDi(l), l)].sort();
    if (!eq(a, b)) out.push(chi + ': pagina ' + a.join(',') + ' · server ' + b.join(','));
  };
  for (const l of FIXTURE) confronta(l, l._id);
  for (const t of FRASI) for (const f of FORME) confronta({ ...f, description: t, descriptionIt: '' }, '«' + t.slice(0, 32) + '» su ' + (f.type || f.address || '{}'));
  return out;
}
{
  const d = divergenze(FIX);
  check(`descriptionIssues = copyIssues del server: i 27 annunci e ${FRASI.length} frasi × ${FORME.length} case, nessuna divergenza`,
    d.length === 0, d.slice(0, 4).join(' | '));
}
const INCERTE = Object.keys(FIX.LISTINGS).filter((id) => incerta(id)).sort();
check('le camere incerte sono dichiarate dove i dati si contraddicono: OLLV, hwnk, angelico (e solo lì)',
  eq(INCERTE, ['OLLVsiKhPrhpT1fx8XmB', 'angelico', 'hwnkDcXvs7Q0EW99xV7O']), INCERTE.join(', '));

console.log('\nLA MUTAZIONE — la sorgente rotta deve far cadere le regole');
const RIGA_LINK = /\n<div [^\n]*window\.open\('\/catalogo','_blank'\)[^\n]*<\/div>/;
const rigaLink = () => { const m = APP.match(RIGA_LINK); if (!m) throw new Error('il link non c\'è nel sorgente'); return m[0]; };
caduta('catalogo tolto dal gruppo admin di vercel.json',
  () => headerAdmin(muta(VERCEL, [['|catalogo|catalogo.html|', '|']])));
caduta('il link tolto dalla sidebar', () => linkSidebar(APP.replace(rigaLink(), '')));
caduta('il link spostato in «Strumenti e catalogo»', () => {
  const riga = rigaLink();
  return linkSidebar(APP.replace(riga, '').replace('data-nav-group="tools"', 'data-nav-group="tools"' + riga.replace('\n', ' ')));
});
caduta('script invertiti (catalogo-correzioni prima di listing-facts)', () => ordineScript(muta(PAGE, [
  ['<script src="/js/listing-facts.js"></script>\n<script src="/js/catalogo-correzioni.js"></script>',
    '<script src="/js/catalogo-correzioni.js"></script>\n<script src="/js/listing-facts.js"></script>']])));
caduta('un innerHTML con un dato', () => !htmlDaDati(muta(PAGE, [['el.textContent = String(v);', 'el.innerHTML = String(v);']])));
caduta('la pagina aperta a tutti i ruoli', () => igiene(muta(PAGE, [["BP.requireAuth(['admin'],", 'BP.requireAuth(null,']])));
caduta('un problema del server senza frase in pagina (address_number)',
  () => frasiMancanti(muta(PAGE, [["    address_number: 'il civico nel testo: si nomina la via, non il numero',\n", '']])).length === 0);
caduta('un rifiuto della funzione senza frase (profile_unavailable)',
  () => rifiutiMancanti(muta(PAGE, [["    profile_unavailable: 'il server non è riuscito a rileggere il tuo profilo: riprova',\n", '']])).length === 0);
caduta('la lista dell\'assistente senza la famiglia della durata',
  () => divergenze(caricaFix(muta(CORR, [["    if (RE_STAY.test(t)) out.push('stay_in_text');\n", '']]))).length === 0);
caduta('la lista dell\'assistente senza il civico',
  () => divergenze(caricaFix(muta(CORR, [["    if (addressNumberIn(t, l)) out.push('address_number');\n", '']]))).length === 0);
caduta('le camere sbagliate alla prima occorrenza diversa (non «nessuna dà il numero giusto»)',
  () => divergenze(caricaFix(muta(CORR, [['(claims.length && !claims.includes(b))', '(claims.length && claims.some((v) => v !== b))']]))).length === 0);
caduta('«free from» senza una data dopo («free from traffic» tornerebbe una data)',
  () => divergenze(caricaFix(muta(CORR, [[String.raw`'\\bfree\\s+(?:now|immediately|right\\s+away|straight\\s+away)\\b',`,
    String.raw`'\\bfree\\s+(?:now|immediately|right\\s+away|straight\\s+away|from|on)\\b',`]]))).length === 0);
caduta('l\'arredo inventato solo se dice «unfurnished» (la regola vecchia, stretta)',
  () => divergenze(caricaFix(muta(CORR, [["if (RE_FURNISHING_WORD.test(t)) out.push('furnishing_invented');",
    "if (/\\bunfurnished\\b/i.test(t)) out.push('furnishing_invented');"]]))).length === 0);
caduta('due function con lo stesso nome (il difetto di copia/clona)',
  () => funzioniDoppie(muta(PAGE, [['function clona(v) {', 'function copia(v) {']])).length === 0);
caduta('il template senza una chiave grezza (double_glazing)',
  () => parita(caricaFix(muta(CORR, [["'pets_allowed', 'double_glazing'", "'pets_allowed'"]]))));
caduta('il template senza «Features include»',
  () => parita(caricaFix(muta(CORR, [['    if (/\\bFeatures include\\b/i.test(t)) return true;\n', '']]))));
caduta('l\'impronta che conta la forma degli accenti (niente NFC)',
  () => parita(caricaFix(muta(CORR, [[".normalize('NFC')", '']]))));
caduta('un testo «ai» corretto a mano ancora rigenerabile (impronta ignorata)',
  () => parita(caricaFix(muta(CORR, [['if (l.descriptionAiHash && l.descriptionAiHash !== textHash(t)) {', 'if (false) {']]))));
caduta('la sorgente ripulita (« ai » contato come «ai», il server no)',
  () => parita(caricaFix(muta(CORR, [["return typeof s === 'string' && s !== '' ? s : null;", "return typeof s === 'string' && s.trim() !== '' ? s.trim() : null;"]]))));
caduta('«lotto12» di nuovo della macchina',
  () => decisione(caricaFix(muta(CORR, [["var MACHINE = ['ai'];", "var MACHINE = ['ai', 'lotto12'];"]]))));

// ══ LA PARTE IN BROWSER ══════════════════════════════════════════════════
const chromium = await loadChromium();
if (!chromium) {
  // SKIP solo se la parte statica è verde: run-all darebbe «saltata» anche
  // a una suite rossa, e un difetto si nasconderebbe dietro l'assenza del browser
  console.log(`\ncatalogostrumento (sorgente): ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
  console.log('SKIP: playwright-core assente — parte browser di /catalogo saltata (' + pass + ' controlli statici verdi)');
  process.exit(0);
}
if (!D) {
  console.log(`\ncatalogostrumento: ${pass} passed, ${fail} failed — senza api/wizard/describe.js il giro in browser non ha il server`);
  process.exit(1);
}

// ══ IL SERVER VERO, sulla rete finta ═════════════════════════════════════
// Firestore REST in memoria (precondizioni come il vero: tutte prima, poi
// tutto o niente), Identity Toolkit che riconosce il token dell'admin, e
// Anthropic che risponde in JSON — pulito, o col prezzo dentro per la casa
// che si vuole veder scartare.
const PREFIX = 'projects/test-proj/databases/(default)/documents/';
const CLEAN_EN = 'A calm, well-kept home in Rome with good light and air conditioning. The neighbourhood is residential, with daily shops and easy transport.';
const CLEAN_IT = 'Una casa tranquilla e curata a Roma, con buona luce e aria condizionata. Il quartiere è residenziale, con negozi di ogni giorno e trasporti comodi.';
const RISPOSTE = {
  pulita: { en: CLEAN_EN, it: CLEAN_IT },
  prezzo: { en: CLEAN_EN + ' Yours for €1,500 per month.', it: CLEAN_IT },
};
const SRV = { store: new Map(), writes: [], modi: [], log: [], profiloGiu: false, lettureProfilo: 0 };
let versione = 0;
const nextVersion = () => new Date(Date.UTC(2026, 9, 15, 9, 0, 0) + (++versione) * 1000).toISOString().replace('Z', '000Z');
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const srvPut = (path, data) => SRV.store.set(path, { data: JSON.parse(JSON.stringify(data)), updateTime: nextVersion() });
const fsJson = (path) => {
  const d = SRV.store.get(path), fields = {};
  for (const [k, v] of Object.entries(d.data)) fields[k] = toFs(v);
  return { name: PREFIX + path, fields, updateTime: d.updateTime, createTime: '2026-01-01T00:00:00.000000Z' };
};
const risposta = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fetchVero = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://identitytoolkit.googleapis.com/')) {
    if (u.includes('signInWithPassword')) return risposta({ idToken: 'server-token', expiresIn: '3600' });
    const tok = JSON.parse(opts.body || '{}').idToken;
    return tok === TOKEN ? risposta({ users: [{ localId: 'adm1' }] }) : risposta({ error: { message: 'INVALID_ID_TOKEN' } }, 400);
  }
  if (u.startsWith('https://api.anthropic.com/')) {
    if (u.includes('count_tokens')) return risposta({ input_tokens: 120 });
    const body = JSON.parse(opts.body);
    const ultimo = body.messages[body.messages.length - 1].content;
    const testo = typeof ultimo === 'string' ? ultimo : JSON.stringify(ultimo);
    const modo = (SRV.modi.find((m) => m.se.test(testo)) || {}).risposta || 'pulita';
    return risposta({ content: [{ type: 'text', text: JSON.stringify(RISPOSTE[modo]) }],
      usage: { input_tokens: 120, output_tokens: 90 }, model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn' });
  }
  if (u.startsWith('https://firestore.googleapis.com/')) {
    const rest = u.split('(default)/documents')[1].split('?')[0];
    if (rest === ':commit') {
      const { writes } = JSON.parse(opts.body);
      for (const w of writes) {
        if (!w.update) continue;
        const path = w.update.name.slice(PREFIX.length);
        const cd = w.currentDocument;
        if (cd && cd.updateTime && (!SRV.store.has(path) || SRV.store.get(path).updateTime !== cd.updateTime)) {
          return risposta({ error: { code: 400, status: 'FAILED_PRECONDITION', message: 'stale' } }, 400);
        }
        if (cd && cd.exists === true && !SRV.store.has(path)) return risposta({ error: { code: 404, status: 'NOT_FOUND' } }, 404);
        if (cd && cd.exists === false && SRV.store.has(path)) return risposta({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
      }
      for (const w of writes) {
        if (!w.update) continue;
        const path = w.update.name.slice(PREFIX.length);
        const fields = {};
        for (const k of (w.updateMask || {}).fieldPaths || []) fields[k] = fromFs((w.update.fields || {})[k]);
        SRV.writes.push({ path, fields });
        const cur = SRV.store.has(path) ? SRV.store.get(path).data : {};
        SRV.store.set(path, { data: { ...cur, ...fields }, updateTime: nextVersion() });
      }
      return risposta({ writeResults: writes.map(() => ({ updateTime: nextVersion() })) });
    }
    if (rest === ':runQuery') return risposta([{}]);
    if ((opts.method || 'GET') === 'GET') {
      const path = rest.replace(/^\//, '');
      if (path === 'users/adm1' && SRV.profiloGiu && ++SRV.lettureProfilo >= 2) {
        return risposta({ error: { code: 500, status: 'INTERNAL', message: 'backend' } }, 500);
      }
      return SRV.store.has(path) ? risposta(fsJson(path)) : risposta({ error: { code: 404, status: 'NOT_FOUND' } }, 404);
    }
  }
  return fetchVero(url, opts);
};
const mkRes = () => ({
  statusCode: 200, body: null, headers: {},
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; },
  end() { return this; },
});
// UNA chiamata a /api/wizard/describe: il server legge il Firestore della
// pagina, e ciò che scrive torna nel Firestore della pagina.
async function servi(page, c, piano) {
  if (piano.prima) await piano.prima(page);
  const docs = await page.evaluate(() => window.__fake.docs);
  SRV.store.clear();
  SRV.writes.length = 0;
  for (const [id, data] of Object.entries(docs)) srvPut('listings/' + id, data);
  srvPut('users/adm1', { role: 'admin', email: ADMIN });
  const res = mkRes();
  SRV.profiloGiu = !!piano.profiloGiu;
  SRV.lettureProfilo = 0;
  const chiave = process.env.ANTHROPIC_API_KEY;
  if (piano.senzaChiave) delete process.env.ANTHROPIC_API_KEY;
  const log = console.log, err = console.error;
  console.log = (...a) => SRV.log.push(a.join(' '));
  console.error = (...a) => SRV.log.push('ERR ' + a.join(' '));
  try {
    await D.default({ method: c.method, headers: { authorization: c.auth, 'content-type': 'application/json' },
      body: c.body, query: {} }, res);
  } finally {
    console.log = log; console.error = err;
    process.env.ANTHROPIC_API_KEY = chiave;
    SRV.profiloGiu = false;
  }
  const patch = SRV.writes.filter((w) => w.path.startsWith('listings/')).map((w) => [w.path.slice('listings/'.length), w.fields]);
  if (patch.length) {
    await page.evaluate((ps) => { for (const [id, f] of ps) Object.assign(window.__fake.docs[id], f); }, patch);
  }
  return { status: res.statusCode, json: res.body, scritte: patch.map((p) => p[0]) };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
let HTML = PAGE;
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/catalogo.html' || p === '/catalogo') {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(HTML);
    return;
  }
  const f = normalize(join(ROOT, p));
  if (!f.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(f);
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

// Firebase finto, iniettato PRIMA degli script della pagina. Gli update
// (via transazione) si registrano in window.__fake.writes; `deny` simula un
// permesso negato, `dubbi`/`dubbiU` un commit avvenuto ma detto
// deadline-exceeded/unavailable, `failReadsAfter` le letture che dopo la
// N-esima non rispondono più.
function fakeFirebase(cfg) {
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const docs = {};
  cfg.docs.forEach((l) => { const c = clone(l); const id = c._id; delete c._id; docs[id] = c; });
  const fake = window.__fake = { docs, writes: [], reads: 0, txs: 0, readOpts: [], deny: cfg.deny || [],
    failReadsAfter: cfg.failReadsAfter == null ? null : cfg.failReadsAfter };
  const user = { uid: 'adm1', email: cfg.email, getIdToken: () => Promise.resolve(cfg.token) };
  const has = (id) => Object.prototype.hasOwnProperty.call(docs, id);
  const snapOf = (id) => ({ id, exists: has(id), data: () => (has(id) ? clone(docs[id]) : undefined) });
  const docRef = (col, id) => ({
    id, path: col + '/' + id,
    get: () => Promise.resolve(col === 'users'
      ? { id, exists: true, data: () => ({ role: 'admin', email: cfg.email, name: 'Admin' }) }
      : snapOf(id)),
    update: (data) => { fake.writes.push({ via: 'update', id, data: clone(data) }); return Promise.resolve(); },
    set: () => Promise.reject(new Error('set non previsto')),
  });
  const colRef = (col) => {
    const q = {
      doc: (id) => docRef(col, id),
      get: (o) => {
        if (col !== 'listings') return Promise.resolve({ docs: [], size: 0, empty: true, forEach: () => {} });
        fake.reads++;
        fake.readOpts.push(o === undefined ? null : clone(o));
        if (fake.failReadsAfter != null && fake.reads > fake.failReadsAfter) {
          const e = new Error('Failed to get documents from server.'); e.code = 'unavailable'; return Promise.reject(e);
        }
        const list = Object.keys(docs).map((id) => ({ id, exists: true, data: () => clone(docs[id]) }));
        return Promise.resolve({ docs: list, size: list.length, empty: !list.length, forEach: (f) => list.forEach(f) });
      },
      where: () => q, orderBy: () => q, limit: () => q,
      add: () => Promise.reject(new Error('add non previsto')),
    };
    return q;
  };
  const store = {
    collection: colRef,
    enablePersistence: () => Promise.resolve(),
    runTransaction: (fn) => {
      fake.txs++;
      const pend = [];
      const t = {
        get: (ref) => Promise.resolve(snapOf(ref.id)),
        update: (ref, data) => { pend.push({ id: ref.id, data }); return t; },
        set: () => { throw new Error('set non previsto'); },
      };
      return Promise.resolve().then(() => fn(t)).then((res) => {
        if (pend.some((p) => fake.deny.includes(p.id))) {
          const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e;
        }
        pend.forEach((p) => {
          fake.writes.push({ via: 'transaction', id: p.id, data: clone(p.data) });
          Object.keys(p.data).forEach((k) => {
            const v = p.data[k];
            docs[p.id][k] = v && v.__fv ? 'SERVER_TS' : clone(v);
          });
        });
        // il commit è AVVENUTO ma la risposta dice deadline-exceeded (o
        // unavailable): il caso che Firestore documenta come possibile
        // («even if the operation has completed successfully»)
        if (pend.some((p) => (cfg.dubbi || []).includes(p.id))) {
          const e = new Error('Deadline expired before operation could complete.'); e.code = 'deadline-exceeded'; throw e;
        }
        if (pend.some((p) => (cfg.dubbiU || []).includes(p.id))) {
          const e = new Error('The service is currently unavailable.'); e.code = 'unavailable'; throw e;
        }
        return res;
      });
    },
  };
  const FieldValue = {
    serverTimestamp: () => ({ __fv: 'serverTimestamp' }), delete: () => ({ __fv: 'delete' }),
    arrayUnion: (...a) => ({ __fv: 'arrayUnion', a }), arrayRemove: (...a) => ({ __fv: 'arrayRemove', a }),
  };
  window.firebase = {
    initializeApp: () => ({}), apps: [{}],
    auth: Object.assign(() => ({
      onAuthStateChanged: (cb) => { setTimeout(() => cb(user), 5); return () => {}; },
      currentUser: user, signOut: () => Promise.resolve(),
    }), { Auth: { Persistence: { LOCAL: 'l', SESSION: 's' } } }),
    firestore: Object.assign(() => store, { FieldValue, Timestamp: { now: () => ({ toDate: () => new Date() }) } }),
  };
}

const browser = await chromium.launch(launchOptions());

// La pagina aperta, pronta: Firebase finto, describe sul server vero.
// `opt.describe(body, n)` decide come va la n-esima chiamata: { prima }
// (un ritocco «nel frattempo», nel Firestore della pagina), { senzaChiave }
// (il server vero senza la chiave del modello: il suo 500), { piattaforma }
// (la funzione lavora, ma la piattaforma risponde altro: un 504).
async function apri(opt) {
  HTML = opt.html || PAGE;
  SRV.modi = opt.modi || [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // un'azione che non può riuscire (un bottone spento, coperto) cade in 8
  // secondi, non in 30: le attese lunghe hanno il loro tetto esplicito
  page.setDefaultTimeout(8000);
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  const chiamate = [];
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (/gstatic\.com/.test(u)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    return route.abort();
  });
  await page.route('**/api/wizard/describe', async (route) => {
    const req = route.request();
    let body = null;
    try { body = JSON.parse(req.postData() || 'null'); } catch { body = null; }
    const scritteFinora = await page.evaluate(() => window.__fake.writes.length).catch(() => -1);
    const c = { method: req.method(), auth: req.headers().authorization || '', body, scritteFinora };
    chiamate.push(c);
    const piano = (opt.describe ? opt.describe(body, chiamate.length) : null) || {};
    let out;
    try { out = await servi(page, c, piano); }
    catch (e) { c.ponteRotto = String((e && e.stack) || e); out = { status: 500, json: { ok: false, error: 'bridge' }, scritte: [] }; }
    c.risposta = out;
    if (piano.piattaforma) {
      c.piattaforma = piano.piattaforma.status;
      return route.fulfill({ status: piano.piattaforma.status, contentType: 'text/plain', body: piano.piattaforma.text });
    }
    return route.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.json) });
  });
  await page.addInitScript(fakeFirebase, { docs: opt.docs, deny: opt.deny || [], dubbi: opt.dubbi || [],
    dubbiU: opt.dubbiU || [], failReadsAfter: opt.failReadsAfter == null ? null : opt.failReadsAfter, email: ADMIN, token: TOKEN });
  // un bottone è usabile se NIENTE lo copre, in nessun punto: il 🐞
  // flottante copriva la fine del bottone di conferma su telefono, e un clic
  // al centro (quello di playwright) passava lo stesso. Si campiona tutta la
  // superficie: il 🐞 è un cerchio, e il hit-test rispetta il border-radius —
  // gli angoli del bottone cadevano FUORI dal cerchio che lo copriva
  await page.addInitScript(() => {
    window.__libero = (el) => {
      const r = el.getBoundingClientRect();
      for (let x = r.left + 3; x <= r.right - 3; x += 8) {
        for (const y of [r.top + 6, r.top + r.height / 2, r.bottom - 6]) {
          const t = document.elementFromPoint(x, y);
          if (!t || !(t === el || el.contains(t))) return false;
        }
      }
      return true;
    };
  });
  await page.goto(BASE + '/catalogo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-fase') === 'pronto', null, { timeout: 15000 });
  return { page, errori, chiamate, chiudi: () => ctx.close() };
}

async function leggiPagina(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('#lista .casa')];
    const esito = document.getElementById('esito'), lista = document.getElementById('lista');
    const applica = document.getElementById('applica');
    return {
      n: cards.length,
      fase: document.getElementById('app').getAttribute('data-fase'),
      barra: !document.getElementById('barra').hidden,
      applicaSpento: applica.disabled,
      orizzontale: document.documentElement.scrollWidth <= innerWidth,
      applicaLibero: window.__libero(applica),
      esitoSopra: !!(esito.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING),
      card: Object.fromEntries(cards.map((c) => {
        const nome = c.querySelector('input[data-key^="name:"]');
        const regen = c.querySelector('input[data-key^="regen:"]');
        const errNome = c.querySelector('.nome .errore');
        const perche = c.querySelector('.desc [data-perche]');
        return [c.dataset.id, {
          stato: c.dataset.stato,
          nome: nome ? nome.checked : null,
          input: (c.querySelector('input.nuovo') || {}).value,
          fix: [...c.querySelectorAll('.fix')].map((f) => ({ key: f.dataset.key, stato: f.dataset.stato,
            checked: f.querySelector('input[type=checkbox]') ? f.querySelector('input[type=checkbox]').checked : null,
            testo: f.textContent })),
          regen: regen ? regen.checked : null,
          attesa: !!c.querySelector('[data-attesa="camere"]'),
          mano: /da riscrivere a mano — lista dell'assistente/.test(c.textContent),
          perche: perche ? perche.dataset.perche : null,
          avviso: (c.querySelector('.nome .avviso') || {}).textContent || '',
          errNome: errNome && !errNome.hidden ? errNome.textContent : '',
          testo: c.textContent,
        }];
      })),
    };
  });
}

// Applica (conferma compresa) e aspetta la fine: scritture, descrizioni,
// rilettura.
async function applicaEaspetta(page, { seSpento } = {}) {
  if (seSpento === 'salta' && await page.evaluate(() => document.getElementById('applica').disabled)) {
    return { conferma: null, esito: null, saltato: true };
  }
  await page.click('#applica');
  await page.waitForSelector('#conferma:not([hidden])');
  const conferma = await page.evaluate(() => {
    const corpo = document.getElementById('cCorpo'), si = document.getElementById('cSi');
    const r = si.getBoundingClientRect();
    return {
      testo: corpo.textContent, case: [...corpo.querySelectorAll('.c-casa')].map((c) => ({ id: c.dataset.id, testo: c.textContent })),
      errori: [...corpo.querySelectorAll('.c-err')].map((e) => e.textContent),
      img: document.querySelectorAll('#conferma img').length, etichetta: si.textContent, spento: si.disabled,
      bottoneVisibile: r.bottom <= innerHeight && r.top >= 0 && window.__libero(si),
      scorre: getComputedStyle(corpo).overflowY === 'auto' && corpo.scrollHeight > corpo.clientHeight,
    };
  });
  await page.evaluate(() => document.getElementById('esito').removeAttribute('data-stato'));
  await page.click('#cSi');
  await page.waitForFunction(() => document.getElementById('esito')?.getAttribute('data-stato') === 'fatto', null, { timeout: 45000 });
  const esito = await page.evaluate(() => ({
    scritture: [...document.querySelectorAll('#esitoScritture li')].map((li) => ({ id: li.dataset.id, cls: li.className, testo: li.textContent })),
    descrizioni: [...document.querySelectorAll('#esitoDescrizioni li')].map((li) => ({ id: li.dataset.id, esito: li.dataset.esito, testo: li.textContent })),
    comando: (document.getElementById('comando') || {}).textContent || '',
    testo: document.getElementById('esito').textContent,
  }));
  return { conferma, esito };
}
const stato = (page) => page.evaluate(() => ({ writes: window.__fake.writes, docs: window.__fake.docs,
  readOpts: window.__fake.readOpts, txs: window.__fake.txs, reads: window.__fake.reads }));
// spunta/togli una casella come farebbe un dito (click → change)
const spunta = (page, sel, v) => page.evaluate(({ sel, v }) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error('manca ' + sel);
  if (el.checked !== v) el.click();
}, { sel, v });
const cbNome = (id) => `.casa[data-id="${id}"] input[data-key^="name:"]`;
const rinomina = (page, id, nome) => page.evaluate(({ id, nome }) => { window.__fake.docs[id].name = nome; }, { id, nome });
async function ricarica(page) {
  const n = await page.evaluate(() => window.__fake.reads);
  await page.click('#riepilogo button:has-text("Ricarica")');
  await page.waitForFunction((n0) => window.__fake.reads > n0 && document.getElementById('app').getAttribute('data-fase') === 'pronto', n, { timeout: 15000 });
}

// Un giro completo: carica, (azioni), applica i selezionati, aspetta la fine.
async function giro(opt) {
  const s = await apri(opt);
  const { page } = s;
  const prima = await leggiPagina(page);
  if (opt.azioni) await opt.azioni(page);
  const { conferma, esito } = await applicaEaspetta(page);
  const dopo = await leggiPagina(page);
  const f = await stato(page);
  const xss = await page.evaluate(() => ({ a: window.__xss, b: window.__xss2, img: document.querySelectorAll('#lista img').length, script: document.querySelectorAll('#lista script').length }));
  await s.chiudi();
  return { prima, dopo, conferma, esito, scritture: f.writes, docs: f.docs, readOpts: f.readOpts, chiamate: s.chiamate, errori: s.errori, xss };
}
// solo il caricamento: lo stato della pagina coi default
async function soloCarica(opt) {
  const s = await apri(opt);
  const prima = await leggiPagina(s.page);
  const f = await stato(s.page);
  await s.chiudi();
  return { prima, readOpts: f.readOpts, errori: s.errori };
}

// ── le regole, come funzioni: girano sul vero e sulle copie rotte ──────
const R = {};
// (2) gli update scritti sono ESATTAMENTE quelli attesi, uno per annuncio
R.updateGiusti = (g, docs, extra) => {
  const att = Object.assign(attesi(docs), extra || {});
  const per = {};
  g.scritture.forEach((w) => { (per[w.id] = per[w.id] || []).push(w); });
  const viaUpdate = g.scritture.filter((w) => w.via !== 'transaction');
  const diversi = Object.keys(att).filter((id) => !per[id] || per[id].length !== 1 || !eq(sortKeys(per[id][0].data), sortKeys(att[id])));
  const inattesi = Object.keys(per).filter((id) => !att[id]);
  return { ok: !diversi.length && !inattesi.length && !viaUpdate.length, diversi, inattesi,
    dettaglio: diversi.slice(0, 2).map((id) => id + ' scritto ' + JSON.stringify(per[id] && per[id][0].data) + ' atteso ' + JSON.stringify(att[id])).join(' | ') };
};
function sortKeys(o) { return Object.keys(o || {}).sort().reduce((a, k) => { a[k] = o[k]; return a; }, {}); }
// (4) descrizioni: solo rigenerabili, ≤3 per blocco, Bearer, POST, dopo le scritture
R.blocchiOk = (g) => g.chiamate.length > 0 && g.chiamate.every((c) => c.body && c.body.mode === 'regenerate'
  && Array.isArray(c.body.ids) && c.body.ids.length >= 1 && c.body.ids.length <= 3);
R.bearerOk = (g) => g.chiamate.length > 0 && g.chiamate.every((c) => c.method === 'POST' && c.auth === 'Bearer ' + TOKEN);
R.soloRigenerabili = (g, docs) => {
  const per = Object.fromEntries(docs.map((l) => [l._id, l]));
  return g.chiamate.flatMap((c) => c.body.ids).every((id) => per[id] && FIX.regenerable(per[id]).ok);
};
R.idsAttesi = (g, attese) => {
  const chiesti = g.chiamate.flatMap((c) => c.body.ids);
  return eq([...chiesti].sort(), [...attese].sort()) && new Set(chiesti).size === chiesti.length;
};
R.dopoLeScritture = (g) => g.chiamate.length > 0 && g.chiamate[0].scritteFinora === g.scritture.length;
// L'esito di ogni descrizione: la frase del server PRIMA, il codice fra
// parentesi DOPO, l'esito giusto. Letto sulle risposte VERE del server.
R.esitiDalServer = (g) => {
  const risultati = g.chiamate.filter((c) => !c.piattaforma && c.risposta && c.risposta.json && Array.isArray(c.risposta.json.results))
    .flatMap((c) => c.risposta.json.results);
  const li = Object.fromEntries(g.esito.descrizioni.map((d) => [d.id, d]));
  const male = risultati.filter((x) => {
    const r = li[x.id], t = r ? r.testo : '';
    const iNota = x.note ? t.indexOf(x.note) : -1, iCod = t.indexOf('(' + x.reason + ')');
    return !(r && r.esito === x.outcome && iNota >= 0 && iCod > iNota);
  }).map((x) => x.id + ':' + x.outcome + ':' + x.reason);
  return { ok: risultati.length > 0 && !male.length, male };
};
// (1) la riga cambiata a mano: niente preselezionato, avviso detto, niente scritto
R.manuale = (g, id) => {
  const c = g.prima.card[id];
  return !!c && c.stato === 'a-mano' && c.nome === false && c.regen !== true
    && c.fix.every((f) => f.checked !== true) && /cambiato a mano dopo la proposta/.test(c.avviso)
    && /Niente di questa riga è selezionato/.test(c.avviso)
    && !g.scritture.some((w) => w.id === id);
};
// (5) i dati restano testo
R.testo = (g, id, frammento) => {
  const c = g.prima.card[id];
  return !!c && c.testo.includes(frammento) && g.xss.img === 0 && g.xss.script === 0
    && g.xss.a === undefined && g.xss.b === undefined;
};
// la casella «Rigenera» esiste dove il server rigenera, ed è accesa solo con
// problemi e senza camere incerte; dove non si rigenera, la lista dell'assistente
R.caselle = (g, docs) => docs.filter((l) => {
  const c = g.prima.card[l._id];
  if (!c) return true;
  const r = FIX.regenerable(l), iss = FIX.descriptionIssues(l).length > 0;
  if (r.ok) return c.regen !== (iss && !incerta(l._id) && statoNome(l) !== 'a-mano');
  return c.regen !== null || c.mano !== iss;
}).map((l) => l._id);
R.attesa = (g) => INCERTE.every((id) => {
  const c = g.prima.card[id];
  return c && c.regen === false && c.attesa && c.testo.includes('camere da verificare in casa: la descrizione si rifà dopo il giro');
});
R.soloServer = (g) => g.readOpts.length >= 1 && g.readOpts.every((o) => o && o.source === 'server');

// ══ I PREREQUISITI — su cosa poggiano i giri qui sotto ═══════════════════
// La suite usa alcuni annunci veri come casi: se il fixture o la mappa delle
// correzioni cambiano, lo si dice QUI, invece di far cadere un controllo a
// valle con un messaggio che sembra un difetto della pagina.
const REGEN_A = regenAttese(FIXTURE);
const SALTA = 'levico', FALLISCE = 'marconi';
const CONFLITTO = '9u42Zd1ROX3EHRgLKXFg', NEGATO = 'cezFMXTWnHUDgb1H2WWm', DUBBIO = 'aZ3EnMYBDy7c2upKRnnA';
const DUBBIO_U = 'sr0rpLSqbpDMASkHINfx', TTVR = 'ttvrjazww9oe4tA0wHTf', QR = 'qRRRV7BjXDPqgTpVchnz';
const CINQUE = '5QAKCvswE3HN9nuuG82S', TEMPLATE = ['G8tzBej0f8JyBP0oAqRS', 'yGBx17OFlSgD0Kowk9jK', 'zL4h3VusgV1qnoNQK5Dc'];
{
  const P = FIX.LISTINGS;
  const pre = [
    ['ilW5lAxnNn5M2TjsSHx2: nome da cambiare, zone con spazio in coda, descrizione «ai» con problemi',
      statoNome(L('ilW5lAxnNn5M2TjsSHx2')) === 'da-fare' && P.ilW5lAxnNn5M2TjsSHx2.fix.zone === 'Africano/Trieste'
        && L('ilW5lAxnNn5M2TjsSHx2').zone === 'Africano/Trieste ' && REGEN_A.includes('ilW5lAxnNn5M2TjsSHx2')],
    [QR + ': tagsReplace «All invlusive» solo nei tags, floor «floor », testo «lotto12»',
      !!(P[QR].fix.tagsReplace || {})['All invlusive'] && L(QR).tags.includes('All invlusive')
        && !L(QR).features.includes('All invlusive') && L(QR).floor === 'floor ' && L(QR).descriptionSource === 'lotto12'],
    ['angelico: nome già giusto, fix bedrooms 2 → 1', statoNome(L('angelico')) === 'applicato' && L('angelico').bedrooms === 2 && P.angelico.fix.bedrooms === 1],
    ['4 nomi già giusti (navona, ripetta, angelico, piemonte)', FIXTURE.filter((l) => statoNome(l) === 'applicato').length === 4],
    ['esFhjFMVfZtkIrhkx0PR: nome da cambiare, fix zone e type', statoNome(L('esFhjFMVfZtkIrhkx0PR')) === 'da-fare'
      && 'zone' in P.esFhjFMVfZtkIrhkx0PR.fix && 'type' in P.esFhjFMVfZtkIrhkx0PR.fix],
    [[CINQUE, CONFLITTO, TTVR].join(', ') + ': nomi da cambiare', [CINQUE, CONFLITTO, TTVR].every((id) => statoNome(L(id)) === 'da-fare')],
    [[SALTA, FALLISCE, NEGATO, DUBBIO, DUBBIO_U].join(', ') + ': descrizioni «ai» con problemi',
      [SALTA, FALLISCE, NEGATO, DUBBIO, DUBBIO_U].every((id) => REGEN_A.includes(id) && L(id).descriptionSource === 'ai')
        && [NEGATO, DUBBIO, DUBBIO_U].every((id) => statoNome(L(id)) === 'da-fare')],
    [TEMPLATE.join(', ') + ': il template del bot, con un prezzo nel testo',
      TEMPLATE.every((id) => FIX.regenerable(L(id)).basis === 'boilerplate' && REGEN_A.includes(id))],
    ['le camere incerte hanno descrizioni «ai»', INCERTE.every((id) => FIX.regenerable(L(id)).ok)],
    ['il testo pulito del modello finto passa i controlli del server su tutti i 27; quello col prezzo no (broke_rules)',
      FIXTURE.every((l) => D.copyIssues(CLEAN_EN + '\n' + CLEAN_IT, l).length === 0)
        && D.copyIssues(RISPOSTE.prezzo.en + '\n' + RISPOSTE.prezzo.it, L(FALLISCE)).includes('price_in_text')],
    ['la casa che si vuole veder scartare si riconosce dal prompt (Guarducci)', /Guarducci/.test(D.buildFacts(L(FALLISCE)))
      && FIXTURE.filter((l) => /Guarducci/.test(D.buildFacts(l))).length === 1],
  ];
  const mancano = pre.filter((x) => !x[1]).map((x) => x[0]);
  check('prerequisiti del fixture, della mappa delle correzioni e del server', !mancano.length,
    'il fixture, js/catalogo-correzioni.js o api/wizard/describe.js sono cambiati: ' + mancano.join(' | '));
}

// ══ GIRO A — il fixture com'è ════════════════════════════════════════════
console.log('\nGIRO A — i 27 annunci del 15/10/2026, coi default (descrizioni sul server vero)');
// La correzione a mano di un collega mentre la pagina era aperta: la passata
// dell'impronta sul testo della macchina, poi la correzione dal portal. Il
// server lo vede e salta col SUO motivo (edited_after_machine).
const ritoccoSalta = (page) => page.evaluate(({ id, hash }) => {
  const d = window.__fake.docs[id];
  d.descriptionAiHash = hash;
  d.description = 'Casa al piano giardino, corretta a mano dall\'assistente.';
}, { id: SALTA, hash: D.textHash(L(SALTA).description) });
const optA = {
  docs: FIXTURE,
  modi: [{ se: /Guarducci/, risposta: 'prezzo' }],
  describe: (body) => (body && Array.isArray(body.ids) && body.ids.includes(SALTA) ? { prima: ritoccoSalta } : {}),
};
const A = await giro(optA);
const ATTESI_A = attesi(FIXTURE);
check(`27 righe, una per annuncio (${A.prima.n})`, A.prima.n === 27 && FIXTURE.length === 27);
{
  const sbagliate = FIXTURE.filter((l) => {
    const c = A.prima.card[l._id], st = statoNome(l);
    return !c || c.stato !== st || c.nome !== (st === 'da-fare') || c.input !== FIX.LISTINGS[l._id].name;
  }).map((l) => l._id);
  check('il nome proposto precompila l\'input; preselezionato SOLO dove il nome è ancora quello della proposta', !sbagliate.length, sbagliate.join(', '));
}
{
  const applicati = FIXTURE.filter((l) => statoNome(l) === 'applicato').map((l) => l._id);
  check(`i nomi già giusti (${applicati.join(', ')}) sono «✓ applicato» e non selezionati`,
    applicati.length === 4 && applicati.every((id) => A.prima.card[id].nome === false && /✓ applicato/.test(A.prima.card[id].testo)));
}
{
  const sbagliate = R.caselle(A, FIXTURE);
  check('«Rigenera descrizione» dove il server rigenera (accesa se ci sono problemi e le camere non sono incerte); altrove, con problemi → «da riscrivere a mano — lista dell\'assistente»',
    !sbagliate.length, sbagliate.join(', '));
}
check(`il template del bot (${TEMPLATE.length} affittati) si rigenera: casella accesa, «il modello automatico del bot»`,
  TEMPLATE.every((id) => A.prima.card[id].regen === true && A.prima.card[id].testo.includes('il modello automatico del bot')));
check('i due «lotto12» sono parole di una persona: nessuna casella, e lo dice',
  ['Kz9bXztv5QXmQrNhAcoU', QR].every((id) => A.prima.card[id].regen === null && A.prima.card[id].perche === 'not_machine'
    && A.prima.card[id].testo.includes('Correzione approvata dall\'operatore (lotto12)')));
check('un testo senza sorgente non si chiama «scritto a mano»: «non marcata come scritta dalla macchina»',
  !Object.values(A.prima.card).some((c) => /Scritta a mano/.test(c.testo))
    && A.prima.card[CINQUE].testo.includes('Non marcata come scritta dalla macchina'));
check(`camere incerte (${INCERTE.join(', ')}): «Rigenera» NON preselezionata, e la riga dice perché`, R.attesa(A));
check('una correzione che è solo forma mostra gli spazi: zone «Africano/Trieste␣» → «Africano/Trieste», selezionata',
  A.prima.card.ilW5lAxnNn5M2TjsSHx2.fix.some((f) => f.key.endsWith(':zone') && f.checked === true
    && f.testo.includes('«Africano/Trieste␣» → «Africano/Trieste»')));
check('tagsReplace: «All invlusive» → «All inclusive» sull\'elenco che la porta (tags), niente riga dove non c\'è (features)',
  (() => { const f = A.prima.card[QR].fix;
    return f.some((x) => x.key.endsWith(':tags') && x.testo.includes('«All invlusive» → «All inclusive»'))
      && !f.some((x) => x.key.endsWith(':features')) && f.some((x) => x.key.endsWith(':floor') && x.testo.includes('«floor␣» → (vuoto)')); })());
check('le note da verificare in casa sono sulla riga', /Da verificare in casa/.test(A.prima.card['2SwJ8yD3ITXylrEtYIlL'].testo)
  && A.prima.card['2SwJ8yD3ITXylrEtYIlL'].testo.includes('STESSO indirizzo e STESSO piano'));
check('a 390px: niente scorrimento orizzontale e «Applica selezionati» non è coperto (dal 🐞 o altro)',
  A.prima.orizzontale && A.prima.applicaLibero);
check('il catalogo si legge dal SERVER, mai dalla cache: ogni lettura chiede {source:\'server\'}', R.soloServer(A),
  JSON.stringify(A.readOpts));
check(`la conferma elenca esattamente gli annunci da scrivere (${A.conferma.case.length} = ${Object.keys(ATTESI_A).length})`,
  eq(A.conferma.case.map((c) => c.id).sort(), Object.keys(ATTESI_A).sort()));
check('la conferma mostra vecchio → nuovo campo per campo (name, nameOriginal, zone, tags, floor…)',
  (() => { const c = Object.fromEntries(A.conferma.case.map((x) => [x.id, x.testo]));
    const vecchio = L('ilW5lAxnNn5M2TjsSHx2').name, nuovo = FIX.LISTINGS.ilW5lAxnNn5M2TjsSHx2.name;
    return c.ilW5lAxnNn5M2TjsSHx2.includes('name «' + vecchio + '» → «' + nuovo + '»')
      && c.ilW5lAxnNn5M2TjsSHx2.includes('nameOriginal «' + vecchio + '»')
      && c.ilW5lAxnNn5M2TjsSHx2.includes('zone «Africano/Trieste␣» → «Africano/Trieste»')
      && c[QR].includes('tags «All invlusive» → «All inclusive»')
      && c[QR].includes('floor «floor␣» → (vuoto)')
      && c.angelico.includes('bedrooms 2 → 1') && !c.angelico.includes('name «')
      && c.ilW5lAxnNn5M2TjsSHx2.includes('nameUpdatedBy ' + ADMIN); })(),
  JSON.stringify(A.conferma.case.filter((x) => x.id === 'ilW5lAxnNn5M2TjsSHx2' || x.id === 'angelico').map((x) => x.testo)));
check(`il bottone dice cosa farà («${A.conferma.etichetta}»), è raggiungibile a 390px e il foglio lungo scorre`,
  A.conferma.etichetta === `Scrivi ${Object.keys(ATTESI_A).length} annunci e rigenera ${REGEN_A.length} descrizioni`
    && !A.conferma.spento && A.conferma.bottoneVisibile && A.conferma.scorre);
{
  const r = R.updateGiusti(A, FIXTURE);
  check(`applicare scrive gli update giusti: ${Object.keys(ATTESI_A).length} annunci, una transazione ciascuno, nessun campo in più`, r.ok,
    'diversi: ' + r.diversi.join(',') + ' inattesi: ' + r.inattesi.join(',') + ' ' + r.dettaglio);
}
check('nameOriginal = il nome di adesso, dove il documento non ne aveva uno',
  A.scritture.filter((w) => w.data.name).every((w) => w.data.nameOriginal === FIXTURE.find((l) => l._id === w.id).name));
check('una casa col nome già giusto e senza correzioni non viene toccata (navona, ripetta, piemonte)',
  ['navona', 'ripetta', 'piemonte'].every((id) => !A.scritture.some((w) => w.id === id)));
check('angelico: nome già giusto → si scrive SOLO la correzione delle camere (1)',
  (() => { const w = A.scritture.find((x) => x.id === 'angelico'); return w && w.data.bedrooms === 1 && !('name' in w.data) && !('nameOriginal' in w.data); })());
check(`descrizioni: ${REGEN_A.length} id, tutti rigenerabili per il server, nessun doppione`, R.idsAttesi(A, REGEN_A) && R.soloRigenerabili(A, FIXTURE),
  JSON.stringify(A.chiamate.map((c) => c.body && c.body.ids)));
check(`a blocchi di al massimo 3 (${A.chiamate.map((c) => c.body.ids.length).join('+')}), POST, Bearer dell'admin`, R.blocchiOk(A) && R.bearerOk(A));
check('le descrizioni partono DOPO tutte le scritture dei dati', R.dopoLeScritture(A), JSON.stringify(A.chiamate.map((c) => c.scritteFinora)));
check('il ponte verso il server vero ha risposto a ogni chiamata (handler di api/wizard/describe.js, Firestore e modello finti)',
  A.chiamate.length > 0 && A.chiamate.every((c) => !c.ponteRotto && c.risposta && c.risposta.status === 200),
  A.chiamate.map((c) => c.ponteRotto || (c.risposta && c.risposta.status)).join(' | '));
{
  const r = R.esitiDalServer(A);
  check('l\'esito di ogni descrizione dice prima la frase del server, poi il codice fra parentesi (riscritta / saltata / fallita)',
    r.ok, r.male.join(', '));
  const e = Object.fromEntries(A.esito.descrizioni.map((d) => [d.id, d]));
  check('…sui casi veri: corretta a mano nel frattempo → saltata (edited_after_machine); il testo nuovo col prezzo → fallita (broke_rules)',
    e[SALTA] && e[SALTA].esito === 'skipped' && /\(edited_after_machine\)/.test(e[SALTA].testo)
      && e[FALLISCE] && e[FALLISCE].esito === 'failed' && /\(broke_rules\)/.test(e[FALLISCE].testo)
      && REGEN_A.filter((id) => id !== SALTA && id !== FALLISCE).every((id) => e[id] && e[id].esito === 'written'),
    JSON.stringify([e[SALTA], e[FALLISCE]]));
}
R.problemiDetti = (g) => {
  const d = g.esito.descrizioni.find((x) => x.id === FALLISCE);
  return !!d && d.testo.includes('un prezzo nel testo');
};
check('broke_rules: l\'esito dice anche QUALI regole il testo nuovo violava (issues)', R.problemiDetti(A));
check('le scritture del server sono davvero nel catalogo: testo nuovo, sorgente «ai», impronta del testo',
  REGEN_A.filter((id) => id !== SALTA && id !== FALLISCE).every((id) => A.docs[id].description === CLEAN_EN
    && A.docs[id].descriptionSource === 'ai' && A.docs[id].descriptionAiHash === D.textHash(CLEAN_EN))
    && A.docs[FALLISCE].description === L(FALLISCE).description);
check('ogni scrittura riuscita è nell\'esito con i campi scritti', Object.keys(ATTESI_A).every((id) =>
  A.esito.scritture.some((s) => s.id === id && s.cls === 'ok' && s.testo.includes('updatedAt'))));
check('dopo: il comando per riallineare le pagine statiche', A.esito.comando === CMD);
check('l\'esito sta SOPRA la lista: dopo la rilettura è la prima cosa che si vede', A.dopo.esitoSopra);
check('dopo: la pagina rilegge Firestore — i nomi scritti sono «applicato» e non più selezionati',
  Object.keys(ATTESI_A).filter((id) => ATTESI_A[id].name).every((id) => A.dopo.card[id].stato === 'applicato' && A.dopo.card[id].nome === false)
    && A.dopo.card.angelico.fix.every((f) => f.stato === 'applicato'));
check('dopo: le descrizioni riscritte non hanno più problemi e non si ripropongono; quella saltata dal server va alla sua lista col motivo',
  REGEN_A.filter((id) => id !== SALTA && id !== FALLISCE).every((id) => A.dopo.card[id].regen === false)
    && A.dopo.card[SALTA].regen === null && A.dopo.card[SALTA].perche === 'server'
    && A.dopo.card[SALTA].testo.includes('Il server non la rigenera'));
check('nessun errore JavaScript', !A.errori.length, A.errori.join(' | '));

// ══ GIRO B — il mondo che cambia sotto le mani ═══════════════════════════
console.log('\nGIRO B — rinominato a mano, nameOriginal già presente, nome ostile, conflitto, permesso negato, commit incerti, describe giù');
const OSTILE = '<img src=x onerror="window.__xss=1">Ostile';
const DOCS_B = JSON.parse(JSON.stringify(FIXTURE)).map((l) => {
  if (l._id === 'ilW5lAxnNn5M2TjsSHx2') l.name = 'Stanza Endertà (scelta mia)';        // rinominato a mano
  if (l._id === CINQUE) l.nameOriginal = 'Primo nome di sempre';                        // ne ha già uno
  if (l._id === 'esFhjFMVfZtkIrhkx0PR') l.zone = 'Monti';                              // zona cambiata davvero
  if (l._id === QR) {
    l.features = l.features.concat(['All invlusive']);                                 // il refuso in due elenchi
    l.tags = l.tags.concat(['All inclusive']);                                         // …e la forma giusta già lì
  }
  return l;
}).concat([
  { _id: 'zzOstile', status: 'available', name: OSTILE, address: '<b>Via</b> Finta 1', zone: 'Centro',
    description: '<script>window.__xss2=1</script>Testo <b>finto</b>', descriptionSource: 'ai' },
  { _id: 'zzSenzaNome', status: 'available', name: '', address: 'Via Vuota 2', zone: 'Prati' },
  // parole di una persona, con problemi: mai rigenerate
  { _id: 'zzUmana', status: 'available', name: 'Casa Umana', address: 'Via Umana 4', zone: 'Prati',
    description: 'Lovely home, unfurnished, €1,200 per month.', descriptionSource: 'studio:fondatore@boom' },
  // un testo «ai» corretto a mano DOPO la macchina (l'impronta non torna)
  { _id: 'zzCorretta', status: 'available', name: 'Casa Corretta', address: 'Via Corretta 3', zone: 'Prati',
    description: 'Bright flat, available from 1 March.', descriptionSource: 'ai',
    descriptionAiHash: D.textHash('Il testo che la macchina aveva scritto.') },
]);
function pianoB(body, n) {
  // il server vero, senza la chiave del modello: il SUO 500
  if (n === 1) return { senzaChiave: true };
  // la funzione lavora (e scrive), ma la piattaforma la ferma: 504 senza JSON
  if (n === 2) return { piattaforma: { status: 504, text: 'An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT' } };
  // il server vero non rilegge il profilo dell'admin: il SUO 503, col JSON
  if (n === 3) return { profiloGiu: true };
  return {};
}
const azioniB = async (page) => {
  await page.fill('input.nuovo[data-id="zzOstile"]', 'Finta One-Bed');
  await page.fill('input.nuovo[data-id="zzSenzaNome"]', 'Vuota One-Bed');
  // dopo il caricamento qualcuno rinomina la casa di Via Quirino Visconti
  await rinomina(page, CONFLITTO, 'Bilocale Prati (toccato nel frattempo)');
};
const optB = { docs: DOCS_B, deny: [NEGATO], dubbi: [DUBBIO], dubbiU: [DUBBIO_U], describe: pianoB, azioni: azioniB };
const B = await giro(optB);
check('rinominata a mano: nome, dati e descrizione NON preselezionati, avviso «cambiato a mano dopo la proposta», niente scritto',
  R.manuale(B, 'ilW5lAxnNn5M2TjsSHx2'));
R.nameOriginalRispettato = (g) => {
  const w = g.scritture.find((x) => x.id === CINQUE);
  return !!w && w.data.name === FIX.LISTINGS[CINQUE].name && !('nameOriginal' in w.data);
};
check('nameOriginal già presente: non si sovrascrive (resta «Primo nome di sempre»)', R.nameOriginalRispettato(B));
R.senzaNome = (g) => {
  const w = g.scritture.find((x) => x.id === 'zzSenzaNome');
  return !!w && w.data.name === 'Vuota One-Bed' && !('nameOriginal' in w.data);
};
check('un annuncio senza nome: si scrive il nome, MAI un nameOriginal vuoto', R.senzaNome(B));
R.forma = (g) => {
  const c = g.prima.card.esFhjFMVfZtkIrhkx0PR, w = g.scritture.find((x) => x.id === 'esFhjFMVfZtkIrhkx0PR');
  const z = c.fix.find((f) => f.key.endsWith(':zone'));
  return !!z && z.stato === 'cambiato' && z.checked === false && /verifica prima di scrivere/.test(z.testo)
    && !!w && !('zone' in w.data) && w.data.type === FIX.LISTINGS.esFhjFMVfZtkIrhkx0PR.fix.type;
};
check('zona cambiata davvero (non solo spazi): correzione non preselezionata, con avviso, e non scritta', R.forma(B));
R.dueElenchi = (g) => {
  const w = g.scritture.find((x) => x.id === QR);
  return !!w && Array.isArray(w.data.tags) && Array.isArray(w.data.features)
    && w.data.tags.includes('All inclusive') && !w.data.tags.includes('All invlusive')
    && w.data.features.includes('All inclusive') && !w.data.features.includes('All invlusive');
};
check('tagsReplace vale su tags E features', R.dueElenchi(B));
R.dedup = (g) => {
  const w = g.scritture.find((x) => x.id === QR);
  return !!w && eq(w.data.tags, ['Private Bath', 'Direct Garden access', 'All inclusive']);
};
check('tagsReplace dove la forma giusta c\'è già: il refuso sparisce, mai «All inclusive» due volte', R.dedup(B),
  JSON.stringify((B.scritture.find((x) => x.id === QR) || {}).data));
check('un nome con <img onerror> è testo: si vede com\'è, nessun <img> o <script> nasce, nessun handler parte', R.testo(B, 'zzOstile', '<img src=x onerror'));
check('…anche nella conferma e nella scrittura: vecchio nome intatto, nameOriginal = la stringa così com\'era',
  B.conferma.img === 0 && B.conferma.testo.includes('<img src=x onerror="window.__xss=1">Ostile')
    && (() => { const w = B.scritture.find((x) => x.id === 'zzOstile'); return w && w.data.name === 'Finta One-Bed' && w.data.nameOriginal === OSTILE; })());
check('parole di una persona con problemi e testo «ai» corretto dopo la macchina: nessuna casella, lista dell\'assistente, il motivo giusto',
  B.prima.card.zzUmana.regen === null && B.prima.card.zzUmana.mano && B.prima.card.zzUmana.perche === 'not_machine'
    && B.prima.card.zzCorretta.regen === null && B.prima.card.zzCorretta.mano && B.prima.card.zzCorretta.perche === 'edited_after_machine'
    && B.prima.card.zzCorretta.testo.includes('Scritta dalla macchina e poi corretta a mano'));
check('…e non si chiedono mai al server', R.soloRigenerabili(B, DOCS_B)
  && !B.chiamate.flatMap((c) => c.body.ids).some((id) => id === 'zzUmana' || id === 'zzCorretta'));
R.conflitto = (g) => !g.scritture.some((w) => w.id === CONFLITTO)
  && g.esito.scritture.some((s) => s.id === CONFLITTO && s.cls === 'ko' && /cambiato dopo il caricamento/.test(s.testo));
check('annuncio toccato dopo il caricamento: NON si scrive, e l\'esito lo dice', R.conflitto(B));
R.negato = (g) => !g.scritture.some((w) => w.id === NEGATO)
  && g.esito.scritture.some((s) => s.id === NEGATO && s.cls === 'ko' && /permesso negato/.test(s.testo));
check('permesso negato: niente scritto, e l\'esito lo dice', R.negato(B));
R.incertoScrittura = (g) => g.esito.scritture.some((s) => s.id === DUBBIO && s.cls === 'unk'
    && /esito incerto \(deadline-exceeded\): potrebbe essere stato scritto/.test(s.testo))
  && !g.chiamate.flatMap((c) => c.body.ids).includes(DUBBIO)
  && g.esito.descrizioni.some((d) => d.id === DUBBIO && d.esito === 'skipped' && /incerto/.test(d.testo));
check('commit forse avvenuto (deadline-exceeded): «esito incerto», mai «niente scritto»; e la descrizione aspetta', R.incertoScrittura(B));
R.incertoU = (g) => g.esito.scritture.some((s) => s.id === DUBBIO_U && s.cls === 'unk'
    && /esito incerto \(unavailable\): potrebbe essere stato scritto/.test(s.testo))
  && !g.chiamate.flatMap((c) => c.body.ids).includes(DUBBIO_U);
check('…e lo stesso per «unavailable» su un commit (Firestore lo dichiara possibile anche a scrittura riuscita)', R.incertoU(B));
R.nienteRegenSuDatiFalliti = (g) => !g.chiamate.flatMap((c) => c.body.ids).includes(NEGATO)
  && g.esito.descrizioni.some((d) => d.id === NEGATO && d.esito === 'skipped' && /non è riuscito/.test(d.testo));
check('la descrizione di un annuncio i cui dati NON sono stati scritti non si rigenera (e si dice perché)', R.nienteRegenSuDatiFalliti(B));
check('il server senza chiave del modello (il suo 500 vero): quegli id «falliti» col motivo in italiano, gli altri blocchi proseguono',
  (() => { const primo = B.chiamate[0].body.ids, e = Object.fromEntries(B.esito.descrizioni.map((d) => [d.id, d]));
    return B.chiamate[0].risposta.status === 500
      && primo.every((id) => e[id].esito === 'failed'
        && /il server ha risposto 500: il server non ha la chiave del modello \(ANTHROPIC_API_KEY\) \(server_missing_anthropic_key\)\. Niente riscritto/.test(e[id].testo))
      && B.chiamate.length > 3 && B.chiamate.slice(3).flatMap((c) => c.body.ids).some((id) => e[id].esito === 'written'); })(),
  JSON.stringify(B.esito.descrizioni.filter((d) => (B.chiamate[0].body.ids || []).includes(d.id)).map((d) => d.testo)));
R.rifiutoFunzione = (g) => {
  const c = g.chiamate[2], e = Object.fromEntries(g.esito.descrizioni.map((d) => [d.id, d]));
  return !!c && c.risposta.status === 503 && c.risposta.json && c.risposta.json.error === 'profile_unavailable'
    && c.body.ids.every((id) => e[id] && e[id].esito === 'failed'
      && e[id].testo.includes('il server non è riuscito a rileggere il tuo profilo: riprova (profile_unavailable)')
      && /Niente riscritto da questo blocco/.test(e[id].testo));
};
check('un 503 della FUNZIONE (profile_unavailable, col suo JSON, prima di ogni scrittura): «fallita», mai «incerto»',
  R.rifiutoFunzione(B), JSON.stringify(B.chiamate[2] && B.chiamate[2].risposta));
R.incerto504 = (g) => {
  const secondo = g.chiamate[1] ? g.chiamate[1].body.ids : [], e = Object.fromEntries(g.esito.descrizioni.map((d) => [d.id, d]));
  return secondo.length > 0 && secondo.every((id) => e[id] && e[id].esito === 'unknown' && /si è fermata a metà \(HTTP 504\)/.test(e[id].testo));
};
check('la piattaforma ferma la funzione (504 senza JSON): quegli id sono «esito incerto», mai «falliti»', R.incerto504(B));
check('…ed è la parola giusta: il server aveva GIÀ riscritto quelle descrizioni',
  B.chiamate[1] && B.chiamate[1].risposta.scritte.length > 0
    && B.chiamate[1].risposta.scritte.every((id) => B.docs[id].descriptionAiHash === D.textHash(CLEAN_EN)));
check('la conferma avvisa: una descrizione rigenerata senza la correzione scartata (zone) non la vede',
  /la descrizione si rifà sui dati di adesso — le correzioni non selezionate \(zone\)/.test(B.conferma.testo));
check('gli errori restano visibili dopo la rilettura', /NON scritti/.test(B.esito.testo)
  && B.esito.scritture.filter((s) => s.cls === 'ko').length === 2);
{
  const r = R.updateGiusti(B, DOCS_B.filter((l) => l._id !== CONFLITTO && l._id !== NEGATO), {
    zzOstile: { name: 'Finta One-Bed', nameOriginal: OSTILE, nameUpdatedAt: { __fv: 'serverTimestamp' }, nameUpdatedBy: ADMIN, updatedAt: { __fv: 'serverTimestamp' } },
    zzSenzaNome: { name: 'Vuota One-Bed', nameUpdatedAt: { __fv: 'serverTimestamp' }, nameUpdatedBy: ADMIN, updatedAt: { __fv: 'serverTimestamp' } },
    // la zona cambiata davvero resta fuori, il type sì
    esFhjFMVfZtkIrhkx0PR: { name: FIX.LISTINGS.esFhjFMVfZtkIrhkx0PR.name, nameOriginal: L('esFhjFMVfZtkIrhkx0PR').name,
      nameUpdatedAt: { __fv: 'serverTimestamp' }, nameUpdatedBy: ADMIN, type: FIX.LISTINGS.esFhjFMVfZtkIrhkx0PR.fix.type,
      updatedAt: { __fv: 'serverTimestamp' } },
  });
  check('il resto del giro B scrive esattamente gli update attesi', r.ok, 'diversi: ' + r.diversi.join(',') + ' inattesi: ' + r.inattesi.join(',') + ' ' + r.dettaglio);
}
check('nessun errore JavaScript (giro B)', !B.errori.length, B.errori.join(' | '));

// ══ GIRO C — una scelta vale sul valore su cui è stata fatta ═════════════
console.log('\nGIRO C — rinomina concorrente + Applica, ↻ Ricarica, campo cambiato fra lettura e scrittura');
const NOME_MIO = 'Nome scritto a mano (mio)';
async function giroC(html) {
  const s = await apri({ docs: FIXTURE, html });
  const { page } = s;
  const o = {};
  // 1. un nome scritto a mano; una collega rinomina; ↻ Ricarica
  await page.fill(`input.nuovo[data-id="${TTVR}"]`, NOME_MIO);
  o.scritto = (await leggiPagina(page)).card[TTVR];
  await rinomina(page, TTVR, 'Bilocale Ponte Milvio (della collega)');
  await ricarica(page);
  o.dopoRicarica = (await leggiPagina(page)).card[TTVR];
  // 1b. la collega rimette il nome di prima: la scelta vecchia NON torna
  await rinomina(page, TTVR, L(TTVR).name);
  await ricarica(page);
  o.tornato = (await leggiPagina(page)).card[TTVR];
  // 2. una spunta ESPLICITA (tolta e rimessa); poi una collega rinomina
  await spunta(page, cbNome(CONFLITTO), false);
  await spunta(page, cbNome(CONFLITTO), true);
  o.spuntato = (await leggiPagina(page)).card[CONFLITTO];
  await rinomina(page, CONFLITTO, 'Prati Garden (scelta della collega)');
  // 3. qualcuno cambia il piano mentre la pagina è aperta
  await page.evaluate((id) => { window.__fake.docs[id].floor = '2'; }, QR);
  o.a1 = await applicaEaspetta(page);
  o.w1 = (await stato(page)).writes;
  o.dopo1 = await leggiPagina(page);
  // il secondo giro: con niente da scrivere «Applica» è spento (e va bene così
  // solo su una pagina rotta — la regola lo misura sulle scritture)
  o.a2 = await applicaEaspetta(page, { seSpento: 'salta' });
  o.w2 = (await stato(page)).writes.slice(o.w1.length);
  o.errori = s.errori;
  await s.chiudi();
  return o;
}
const C = await giroC();
R.ricaricaAzzera = (o) => o.scritto && o.scritto.nome === true && o.scritto.input === NOME_MIO
  && o.dopoRicarica.stato === 'a-mano' && o.dopoRicarica.nome === false
  && o.dopoRicarica.input === FIX.LISTINGS[TTVR].name && /Niente di questa riga è selezionato/.test(o.dopoRicarica.avviso);
check('↻ Ricarica dopo una rinomina concorrente: la riga «a mano» arriva SENZA la spunta e senza il nome scritto prima, e l\'avviso lo dice',
  R.ricaricaAzzera(C), JSON.stringify(C.dopoRicarica && { nome: C.dopoRicarica.nome, input: C.dopoRicarica.input, avviso: C.dopoRicarica.avviso }));
R.nonTorna = (o) => o.tornato.stato === 'da-fare' && o.tornato.input === FIX.LISTINGS[TTVR].name;
check('…e se il nome torna com\'era, la scelta vecchia non torna in vita (l\'input torna alla proposta)', R.nonTorna(C),
  JSON.stringify(C.tornato && C.tornato.input));
R.conflittoCampo = (o) => !o.w1.some((w) => w.id === QR) && o.a1.esito.scritture.some((x) => x.id === QR && x.cls === 'ko'
  && x.testo.includes('cambiato dopo il caricamento (floor ora è «2», non «floor␣»)'));
check('un campo delle correzioni cambiato dopo il caricamento (floor): NESSUNA scrittura su quell\'annuncio, e l\'esito lo dice',
  R.conflittoCampo(C), JSON.stringify(C.a1.esito.scritture.find((x) => x.id === QR)));
check('la rinomina concorrente sulla riga spuntata a mano: niente scritto, «cambiato dopo il caricamento»',
  C.spuntato.nome === true && !C.w1.some((w) => w.id === CONFLITTO)
    && C.a1.esito.scritture.some((x) => x.id === CONFLITTO && x.cls === 'ko' && /cambiato dopo il caricamento/.test(x.testo)));
R.spuntaDecade = (o) => {
  const c = o.dopo1.card[CONFLITTO];
  return c.stato === 'a-mano' && c.nome === false && /Niente di questa riga è selezionato/.test(c.avviso);
};
check('dopo la rilettura la riga diventata «a mano» arriva SENZA la spunta data prima (e l\'avviso dice il vero)', R.spuntaDecade(C),
  JSON.stringify(C.dopo1.card[CONFLITTO] && { nome: C.dopo1.card[CONFLITTO].nome, avviso: C.dopo1.card[CONFLITTO].avviso }));
check('…e il campo cambiato a pagina aperta resta fermo: «cambiato», non selezionato, detto',
  C.dopo1.card[QR].fix.some((f) => f.key.endsWith(':floor') && f.stato === 'cambiato' && f.checked === false
    && f.testo.includes('mentre la pagina era aperta')));
R.secondoGiro = (o) => !o.w2.some((w) => w.id === CONFLITTO || w.id === TTVR)
  && o.w2.some((w) => w.id === QR && w.data.name === FIX.LISTINGS[QR].name && Array.isArray(w.data.tags) && !('floor' in w.data));
check('il secondo Applica non scrive la riga «a mano» né il campo cambiato; scrive il resto di quell\'annuncio (nome e tags)',
  R.secondoGiro(C), JSON.stringify(C.w2.map((w) => [w.id, Object.keys(w.data)])));
check('nessun errore JavaScript (giro C)', !C.errori.length, C.errori.join(' | '));

// ══ GIRO D — i nomi che non si scrivono ══════════════════════════════════
console.log('\nGIRO D — un nome vuoto, troppo lungo o doppio blocca la conferma');
async function tentativo(caso, html) {
  const s = await apri({ docs: FIXTURE, html });
  const { page } = s;
  await page.fill(`input.nuovo[data-id="${caso.id}"]`, caso.valore);
  const riga = (await leggiPagina(page)).card[caso.id];
  await page.click('#applica');
  await page.waitForSelector('#conferma:not([hidden])');
  const conferma = await page.evaluate(() => ({
    errori: [...document.querySelectorAll('#cCorpo .c-err')].map((e) => e.textContent),
    spento: document.getElementById('cSi').disabled }));
  if (!conferma.spento) {
    await page.evaluate(() => document.getElementById('esito').removeAttribute('data-stato'));
    await page.click('#cSi');
    await page.waitForFunction(() => document.getElementById('esito')?.getAttribute('data-stato') === 'fatto', null, { timeout: 45000 });
  } else {
    // anche il gesto del codice sul bottone spento: non parte niente
    await page.evaluate(() => document.getElementById('cSi').click());
    await page.waitForTimeout(250);
  }
  const f = await stato(page);
  await s.chiudi();
  return { riga, conferma, writes: f.writes, txs: f.txs, errori: s.errori };
}
const CASI_D = {
  vuoto: { id: CINQUE, valore: '', errore: 'il nome nuovo è vuoto' },
  lungo: { id: CONFLITTO, valore: 'x'.repeat(81), errore: 'il nome supera 80 caratteri' },
  doppio: { id: CONFLITTO, valore: '  corso ONE-bed ', errore: 'c\'è già: è il nome proposto per «Bilocale Centro» · ' + CINQUE },
  accenti: { id: TTVR, valore: 'Enderta  room', errore: 'c\'è già: è il nome proposto per «Africano Premium Room» · ilW5lAxnNn5M2TjsSHx2' },
  attuale: { id: 'FHeEHIFbil6QG8Jcccxc', valore: 'CORONARI CLASSIC', errore: 'c\'è già: è il nome di «Coronari Classic» · navona' },
};
R.bloccato = (g, caso) => g.riga.errNome.includes(caso.errore)
  && g.conferma.errori.some((t) => t.includes(caso.id) && t.includes(caso.errore))
  && g.conferma.spento && g.txs === 0 && g.writes.length === 0;
const DD = {};
for (const [k, caso] of Object.entries(CASI_D)) {
  DD[k] = await tentativo(caso);
  check(`nome ${k} (${JSON.stringify(caso.valore.length > 20 ? caso.valore.slice(0, 8) + '…' : caso.valore)} su ${caso.id}): errore sotto la riga e nella conferma, «Scrivi» spento, zero scritture`,
    R.bloccato(DD[k], caso), JSON.stringify({ riga: DD[k].riga.errNome, conferma: DD[k].conferma, txs: DD[k].txs }));
}
check('un nome doppio blocca ENTRAMBE le righe che lo vogliono', DD.doppio.conferma.errori.some((t) => t.includes(CINQUE + ': il nome «Corso One-Bed» c\'è già')));
check('nessun errore JavaScript (giro D)', Object.values(DD).every((g) => !g.errori.length), Object.values(DD).flatMap((g) => g.errori).join(' | '));

// ══ GIRO E — la rilettura che fallisce ═══════════════════════════════════
console.log('\nGIRO E — dopo un\'applicazione la rilettura fallisce: la lista vecchia non resta applicabile');
async function giroE(html) {
  const s = await apri({ docs: FIXTURE, failReadsAfter: 1, html });
  const { page } = s;
  const o = {};
  await applicaEaspetta(page);
  o.dopo = await leggiPagina(page);
  o.vista = await page.evaluate(() => ({ testo: document.getElementById('statoCarico').textContent,
    riepilogo: document.getElementById('riepilogo').childElementCount, esito: !document.getElementById('esito').hidden }));
  const prima = { chiamate: s.chiamate.length, txs: (await stato(page)).txs };
  await page.evaluate(() => document.getElementById('applica').click());
  await page.waitForTimeout(250);
  o.tentativo = await page.evaluate(() => ({ conferma: !document.getElementById('conferma').hidden, txs: window.__fake.txs }));
  o.tentativo.chiamate = s.chiamate.length - prima.chiamate;
  o.tentativo.txsNuove = o.tentativo.txs - prima.txs;
  // la rete torna: Riprova
  await page.evaluate(() => { window.__fake.failReadsAfter = null; });
  await page.evaluate(() => { const b = document.querySelector('#statoCarico button'); if (b) b.click(); });
  await page.waitForFunction(() => document.getElementById('app').getAttribute('data-fase') === 'pronto', null, { timeout: 15000 });
  o.ripreso = await leggiPagina(page);
  o.errori = s.errori;
  await s.chiudi();
  return o;
}
const E = await giroE();
R.listaTolta = (o) => o.dopo.fase === 'errore' && o.dopo.n === 0 && !o.dopo.barra && o.vista.riepilogo === 0
  && /Non riesco a leggere il catalogo/.test(o.vista.testo) && o.vista.esito
  && !o.tentativo.conferma && o.tentativo.chiamate === 0 && o.tentativo.txsNuove === 0;
check('rilettura fallita dopo l\'applicazione: lista, riepilogo e barra spariscono, l\'esito resta, e niente si può riapplicare',
  R.listaTolta(E), JSON.stringify({ fase: E.dopo.fase, n: E.dopo.n, barra: E.dopo.barra, tentativo: E.tentativo }));
check('…e «Riprova» con la rete tornata riporta la lista vera', E.ripreso.fase === 'pronto' && E.ripreso.n === 27 && E.ripreso.barra);
check('nessun errore JavaScript (giro E)', !E.errori.length, E.errori.join(' | '));

// ══ GIRO F — la casella cambiata dietro il foglio ════════════════════════
console.log('\nGIRO F — una casella cambia fra la conferma e il tap: si riconferma, mai si scrive ciò che non si è visto');
async function giroF(html) {
  const s = await apri({ docs: FIXTURE, html });
  const { page } = s;
  const o = {};
  await page.click('#applica');
  await page.waitForSelector('#conferma:not([hidden])');
  o.nelFoglio = await page.evaluate(() => [...document.querySelectorAll('#cCorpo .c-casa')].map((c) => c.dataset.id));
  await page.evaluate((sel) => { const cb = document.querySelector(sel); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }, cbNome(CINQUE));
  await page.evaluate(() => document.getElementById('esito').removeAttribute('data-stato'));
  await page.click('#cSi');
  await page.waitForTimeout(250);
  o.dopoTap = await page.evaluate(() => ({ txs: window.__fake.txs, aperto: !document.getElementById('conferma').hidden,
    ids: [...document.querySelectorAll('#cCorpo .c-casa')].map((c) => c.dataset.id) }));
  if (o.dopoTap.aperto) await page.click('#cSi');
  await page.waitForFunction(() => document.getElementById('esito')?.getAttribute('data-stato') === 'fatto', null, { timeout: 45000 });
  o.writes = (await stato(page)).writes;
  o.errori = s.errori;
  await s.chiudi();
  return o;
}
const Fg = await giroF();
R.riconferma = (o) => o.nelFoglio.includes(CINQUE) && o.dopoTap.txs === 0 && o.dopoTap.aperto && !o.dopoTap.ids.includes(CINQUE)
  && o.writes.length > 0 && !o.writes.some((w) => w.id === CINQUE);
check('il tap riconferma col piano nuovo (niente scritto al primo tap), e l\'annuncio tolto non si scrive', R.riconferma(Fg),
  JSON.stringify(Fg.dopoTap));
check('nessun errore JavaScript (giro F)', !Fg.errori.length, Fg.errori.join(' | '));

// ══ LE MUTAZIONI DELLA PAGINA — ogni regola sul codice ROTTO ═════════════
console.log('\nLA MUTAZIONE — la pagina rotta deve far cadere le regole');
// Una mutazione senza appiglio, o che rompe il giro prima che la regola si
// possa valutare, NON conta come presa: non ha misurato niente.
const M = async (nome, coppie, flusso, regola) => {
  let html, g;
  try { html = muta(PAGE, coppie); }
  catch (e) { check('mutazione: ' + nome + ' → non applicabile', false, e.message); return; }
  try { g = await flusso(html); }
  catch (e) { check('mutazione: ' + nome + ' → il giro si è rotto prima della regola', false, String(e.message).split('\n')[0]); return; }
  caduta(nome, () => regola(g));
};
const fA = (html) => giro(Object.assign({}, optA, { html }));
const fB = (html) => giro(Object.assign({}, optB, { html }));
const fCarica = (html) => soloCarica({ docs: FIXTURE, html });
await M('nameOriginal scritto sempre', [["if ((orig == null || String(orig).trim() === '') && ne.trim()) upd.nameOriginal = ne;", 'upd.nameOriginal = ne;']],
  fB, (g) => R.nameOriginalRispettato(g));
await M('nameOriginal scritto anche col nome vuoto', [["if ((orig == null || String(orig).trim() === '') && ne.trim()) upd.nameOriginal = ne;", "if (orig == null || String(orig).trim() === '') upd.nameOriginal = ne;"]],
  fB, (g) => R.senzaNome(g));
await M('blocchi da 5 descrizioni', [['var CHUNK = 3;', 'var CHUNK = 5;']], fA, (g) => R.blocchiOk(g));
await M('niente Bearer', [["'Authorization': 'Bearer ' + token", "'Authorization': token"]], fA, (g) => R.bearerOk(g));
await M('la riga cambiata a mano trattata come le altre (dati e descrizione)', [["var manuale = stato === 'a-mano';", 'var manuale = false;']],
  fB, (g) => R.manuale(g, 'ilW5lAxnNn5M2TjsSHx2'));
await M('il nome cambiato a mano preselezionato', [["r.nome = { key: 'name:' + id, su: JSON.stringify([attuale]), def: stato === 'da-fare' };",
  "r.nome = { key: 'name:' + id, su: JSON.stringify([attuale]), def: stato === 'da-fare' || stato === 'a-mano' };"]],
  fB, (g) => R.manuale(g, 'ilW5lAxnNn5M2TjsSHx2'));
await M('l\'avviso a-mano che non guarda le caselle (dice sempre «niente selezionato»)',
  [["var qualcosa = scelto(r.nome)", 'var qualcosa = false && scelto(r.nome)']],
  async (html) => {
    // la riga a mano, spuntata a mano: l'avviso deve dirlo
    const s = await apri({ docs: DOCS_B, html });
    await spunta(s.page, cbNome('ilW5lAxnNn5M2TjsSHx2'), true);
    const c = (await leggiPagina(s.page)).card.ilW5lAxnNn5M2TjsSHx2;
    await s.chiudi();
    return c;
  }, (c) => c.nome === true && /Hai selezionato tu qualcosa su questa riga/.test(c.avviso));
await M('il testo reso come HTML', [['else if (k === \'text\') el.textContent = String(v);', 'else if (k === \'text\') el.innerHTML = String(v);']],
  fB, (g) => R.testo(g, 'zzOstile', '<img src=x onerror'));
await M('niente confronto col nome caricato', [["if (ne !== w.r.attuale) throw errore('conflitto'", "if (false) throw errore('conflitto'"]],
  fB, (g) => R.conflitto(g));
await M('rigenerate anche le descrizioni umane', [
  ['def: macchina && issues.length > 0 && !manuale && !toccata && !attesa', 'def: issues.length > 0 && !manuale && !toccata && !attesa'],
  ['if (r.desc.macchina && scelto(r.desc)) {', 'if (scelto(r.desc)) {']],
  fB, (g) => R.soloRigenerabili(g, DOCS_B));
await M('la pagina col solo «ai» della sorgente (template e impronta ignorati)', [['var v = FIX.regenerable(d) || {};', "var v = { ok: FIX.machineWritten(d), basis: 'machine' };"]],
  fB, (g) => R.caselle(g, DOCS_B).length === 0);
await M('le camere incerte preselezionate', [['def: macchina && issues.length > 0 && !manuale && !toccata && !attesa', 'def: macchina && issues.length > 0 && !manuale && !toccata']],
  fCarica, (g) => R.attesa(g));
await M('il catalogo letto dalla cache', [["return BP.withTimeout(col.get({ source: 'server' }), LOAD_MS, 'catalogo')\n      .catch(function () { return BP.withTimeout(col.get({ source: 'server' }), LOAD_MS, 'catalogo'); });",
  "return BP.withTimeout(col.get(), LOAD_MS, 'catalogo');"]], fCarica, (g) => R.soloServer(g));
await M('rigenerata anche dove i dati non sono stati scritti', [['if (falliti[r.id]) {', 'if (false) {']],
  fB, (g) => R.nienteRegenSuDatiFalliti(g));
await M('zone/type corretti anche quando il valore è un altro', [["(FORMA[k] && largo(old) !== largo(v) ? 'cambiato' : 'da-fare')", "'da-fare'"]],
  fB, (g) => R.forma(g));
await M('tagsReplace solo su tags', [["['tags', 'features'].forEach(function (campo) {", "['tags'].forEach(function (campo) {"]],
  fB, (g) => R.dueElenchi(g));
await M('tagsReplace senza togliere il doppione', [['if (out.indexOf(y) < 0 && arr.indexOf(y) < 0) out.push(y);', 'out.push(y);']],
  fB, (g) => R.dedup(g));
await M('deadline-exceeded detto «niente scritto»', [["return !!e && (e.code === 'boom/timeout' || e.code === 'deadline-exceeded' || e.code === 'unavailable');", 'return false;']],
  fB, (g) => R.incertoScrittura(g));
await M('unavailable detto «niente scritto»', [["e.code === 'deadline-exceeded' || e.code === 'unavailable');", "e.code === 'deadline-exceeded');"]],
  fB, (g) => R.incertoU(g));
await M('un 504 della piattaforma contato come «fallita»', [['if (!dallaFunzione && res.status >= 500) {', 'if (false) {']],
  fB, (g) => R.incerto504(g));
await M('un 503 della funzione (col suo JSON) contato come «incerto»', [['if (!dallaFunzione && res.status >= 500) {', 'if (res.status >= 500) {']],
  fB, (g) => R.rifiutoFunzione(g));
await M('l\'esito col codice al posto della frase del server', [["var t = x.nota || x.code || '';\n    if (x.nota && x.code) t += ' (' + x.code + ')';", "var t = x.code || '';"]],
  fA, (g) => R.esitiDalServer(g).ok);
await M('l\'esito di broke_rules senza i problemi', [["    if (x.issues && x.issues.length) t += ' — ' + x.issues.join(' · ');\n", '']],
  fA, (g) => R.problemiDetti(g));
await M('il foglio di conferma sotto il 🐞 flottante (z-index di prima)', [['.velo{position:fixed;inset:0;z-index:10001;', '.velo{position:fixed;inset:0;z-index:40;']],
  fA, (g) => g.conferma.bottoneVisibile);
await M('le descrizioni prima delle scritture', [
  ['    var catena = Promise.resolve();\n    p.scritture.forEach(', '    var catena = Promise.resolve();\n    var _ritarda = p.scritture.slice(); p.scritture.length = 0;\n    p.scritture.forEach('],
  ['    return catena.then(function () {\n      fatti.forEach(', '    catena = catena.then(function () { _ritarda.forEach(function (w) { return scriviUno(w, autore); }); });\n    return catena.then(function () {\n      fatti.forEach(']],
  fA, (g) => R.dopoLeScritture(g));
// le scelte e la loro base
await M('la potatura tolta (la scelta vecchia torna in vita col valore di prima)', [['      pota(righe);\n', '']],
  giroC, (o) => R.nonTorna(o));
await M('le scelte senza base (né potatura né confronto col valore visto)', [
  ['      pota(righe);\n', ''],
  ['return s && s.su === x.su ? !!s.v : !!x.def;', 'return s ? !!s.v : !!x.def;'],
  ["return n && n.su === r.nome.su ? n.v : (r.P ? r.P.name : '');", "return n ? n.v : (r.P ? r.P.name : '');"]],
  giroC, (o) => R.ricaricaAzzera(o) && R.spuntaDecade(o) && R.secondoGiro(o));
await M('i campi delle correzioni non ricontrollati in transazione', [['if (!uguale(ora[f.campo], f.old)) {', 'if (false) {']],
  giroC, (o) => R.conflittoCampo(o));
await M('un valore cambiato a pagina aperta non riconosciuto (la base della sessione persa)', [['var visto = has(S.visti, id) ? S.visti[id] : null;', 'var visto = null;']],
  giroC, (o) => R.secondoGiro(o));
// i nomi che non si scrivono
await M('il nome vuoto accettato', [["if (!v) return 'il nome nuovo è vuoto';\n", '']],
  (html) => tentativo(CASI_D.vuoto, html), (g) => R.bloccato(g, CASI_D.vuoto));
await M('nessun limite alla lunghezza del nome', [["if (v.length > NAME_MAX) return 'il nome supera ' + NAME_MAX + ' caratteri';\n", '']],
  (html) => tentativo(CASI_D.lungo, html), (g) => R.bloccato(g, CASI_D.lungo));
await M('i nomi doppi permessi', [['if (altri.length) {', 'if (false) {']],
  (html) => tentativo(CASI_D.doppio, html), (g) => R.bloccato(g, CASI_D.doppio));
await M('il confronto dei nomi che conta gli accenti', [[".normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')", '']],
  (html) => tentativo(CASI_D.accenti, html), (g) => R.bloccato(g, CASI_D.accenti));
await M('il confronto solo coi nomi proposti, non con quelli di adesso', [["      segna(a, r, 'attuale');\n", '']],
  (html) => tentativo(CASI_D.attuale, html), (g) => R.bloccato(g, CASI_D.attuale));
await M('la rilettura fallita che lascia la lista vecchia', [[
  "      S.righe = [];\n      S.perId = {};\n      svuota($('lista'));\n      svuota($('riepilogo'));\n      $('filtri').hidden = true;\n      $('barra').hidden = true;\n",
  '']], giroE, (o) => R.listaTolta(o));
await M('l\'impronta del piano non ricontrollata al tap', [['    if (impronta(piano()) !== impronta(p)) { apriConferma(); return; }\n', '']],
  giroF, (o) => R.riconferma(o));

await browser.close();
server.close();
console.log(`\ncatalogostrumento: ${pass} passed, ${fail} failed`);
if (fail && SRV.log.length) console.log('ultime righe del server:\n  ' + SRV.log.slice(-15).join('\n  '));
process.exit(fail ? 1 : 0);
