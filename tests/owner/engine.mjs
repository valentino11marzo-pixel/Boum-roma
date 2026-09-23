// tests/owner/engine.mjs — il motore dell'Archivio del Proprietario, blindato.
//
// Si guida il motore VERO (js/owner-archive-engine.js) con le dipendenze VERE
// (rent-engine, contract-fields, property-dossier-engine) sugli scenari di
// tests/owner/fixtures.mjs. Le regole delicate si provano PER MUTAZIONE: il
// sorgente viene ricaricato con il difetto rimesso al punto `/* mp:<nome> */`
// e il controllo DEVE diventare rosso. In coda, la rete finta
// (tests/owner/_harness.mjs) viene provata contro api/homie/_lib.js e
// api/_auth.js VERI: gli altri pacchetti la usano in sola lettura.
//
//   node tests/owner/engine.mjs
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {
  OWNER, RENT, FIELDS, DOSSIER, deps, projection, input, scenarios, POISON, NOW, BUCKET, su, OWNER_UID, OTHER_UID, seedFor,
} from './fixtures.mjs';
import { createHarness, ADMIN_TOKEN } from './_harness.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'js/owner-archive-engine.js'), 'utf8');

let passed = 0, failed = 0; const bad = [];
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; bad.push(name); console.log('  ✗ ' + name); }
}
function section(t) { console.log('\n' + t); }
const B = (name, o) => projection(name, o);
const withInput = (name, fn, o = {}) => projection(name, { ...o, mutate: fn });

// Il sorgente ricaricato con un punto di mutazione riscritto.
function mutant(marker, from, to) {
  const tag = '/* mp:' + marker + ' */';
  const whole = tag + ' ' + from;
  // Bersaglio assente = il sorgente è cambiato (o è stato mutato sul disco):
  // lo si dice con un controllo rosso, e il resto della suite gira lo stesso.
  if (!SRC.includes(whole)) { ok('bersaglio di mutazione presente: ' + whole.slice(0, 80), false); return null; }
  const ctx = { module: { exports: {} }, console, URL };
  vm.runInNewContext(SRC.replace(whole, tag + ' ' + to), ctx);
  return ctx.module.exports;
}
function redUnder(name, check, engine) {
  // Il controllo è verde sul motore vero e ROSSO sul mutante.
  let green = false, red = false;
  try { green = !!check(OWNER); } catch (_) { green = false; }
  if (engine) { try { red = !check(engine); } catch (_) { red = true; } }
  ok(name + ' (verde sul vero)', green);
  if (engine) ok(name + ' (rosso sul mutante)', red);
}

// ══ Contratto del modulo ════════════════════════════════════════════════
section('Modulo');
ok('nessun require nel motore', !/\brequire\s*\(/.test(SRC));
ok('nessuna formattazione dipendente dalla macchina (toLocale / Intl.NumberFormat)', !/toLocale|Intl\.NumberFormat/.test(SRC));
ok('nessun orologio di sistema (Date.now / new Date() senza argomenti)', !/Date\.now\s*\(|new Date\(\s*\)/.test(SRC));
ok('build senza deps → Error("deps richiesti")', (() => { try { OWNER.build(input('ok'), {}); return false; } catch (e) { return e.message === 'deps richiesti'; } })());
ok('fileFor senza deps → Error("deps richiesti")', (() => { try { OWNER.fileFor('c:c1:signed', {}, { rent: RENT }); return false; } catch (e) { return e.message === 'deps richiesti'; } })());
ok('costanti: BASE www, CONTACT, VERSION 1', OWNER.BASE === 'https://www.boomrome.com' && OWNER.CONTACT.wa === '393313251961' && OWNER.CONTACT.email === 'valentino@boom-rome.com' && OWNER.VERSION === 1);
ok('UMD: nel browser registra window.BOOM_OWNER', (() => { const w = {}; vm.runInNewContext(SRC, { window: w }); return typeof w.BOOM_OWNER.build === 'function'; })());

// ══ Privacy ═════════════════════════════════════════════════════════════
section('Privacy: nessun veleno esce, assertClean è verde');
for (const n of Object.keys(scenarios)) {
  for (const viewAs of [false, true]) {
    const p = B(n, { viewAs });
    const s = JSON.stringify(p);
    const leaks = POISON.filter((x) => s.includes(x));
    ok(`${n}${viewAs ? ' (vedi come)' : ''}: nessun veleno nella proiezione`, leaks.length === 0);
    ok(`${n}${viewAs ? ' (vedi come)' : ''}: assertClean ok`, OWNER.assertClean(p).ok === true);
  }
}
{
  // A BOOM_RENT e al fascicolo arrivano stub {id, name}, mai i record users.
  const spy = (store) => ({ ...deps, rent: { ...RENT, overview: (o) => { store.push(JSON.stringify(o.users)); return RENT.overview(o); } },
    dossier: { ...DOSSIER, build: (o) => { store.push(JSON.stringify(o.users)); return DOSSIER.build(o); } } });
  const check = (engine) => { const seen = []; projection('ok', { engine, deps: spy(seen) }); return seen.length > 0 && !seen.some((s) => /@|tenant\.user|\+39/.test(s)); };
  redUnder('mp:tenant-stub — nessun record users vero passa al motore dei canoni', check,
    mutant('tenant-stub', 'users: [ownerStub].concat(tenantStubs)', 'users: [ownerStub].concat(objs(inp.users))'));
  // ERRATA E4.3: gli stub nascono anche dai tenantId delle rate.
  const p = withInput('ok', (i) => { i.payments.push({ id: 'pay_x', contractId: 'c1', propertyId: 'p1', tenantId: 't_other', month: '2026-09', dueDate: '2026-09-10', amount: 100, status: 'paid', paidDate: '2026-09-09' }); });
  ok('una rata con un tenantId non del contratto non è «non collegata»', !p.verdict.reasons.some((r) => r.code === 'rent_unlinked'));
}

section('assertClean: ogni regola, col percorso e MAI il valore');
{
  const good = B('tu');
  ok('proiezione vera con todo[].url di firma e Scheda: pulita', OWNER.assertClean(good).ok && good.todo.some((t) => t.url && /sign\?sign=/.test(t.url)));
  const cases = [
    ['chiave tenantSignToken', { x: { tenantSignToken: 'SECRETVALUE1' } }, 'forbidden_key'],
    ['chiave landlordSignToken', { x: { landlordSignToken: 'SECRETVALUE1' } }, 'forbidden_key'],
    ['chiave identityDocs', { identityDocs: ['SECRETVALUE1'] }, 'forbidden_key'],
    ['chiave email', { email: 'SECRETVALUE1' }, 'forbidden_key'],
    ['chiave phone', { phone: 'SECRETVALUE1' }, 'forbidden_key'],
    ['chiave cf', { cf: 'SECRETVALUE1' }, 'forbidden_key'],
    ['chiave iban', { iban: 'SECRETVALUE1' }, 'forbidden_key'],
    ['chiave signature (ERRATA E1.1)', { properties: [{ contracts: { current: [{ signature: { status: 'x' } }] } }] }, 'forbidden_key'],
    ['chiave tenantEmail', { a: [{ tenantEmail: 'SECRETVALUE1' }] }, 'forbidden_key'],
    ['chiave tenantDocNum', { tenantDocNum: 'SECRETVALUE1' }, 'forbidden_key'],
    ['chiave …IP', { tenantSignedIP: 'SECRETVALUE1' }, 'forbidden_key'],
    ['chiave marginEur', { marginEur: 7 }, 'forbidden_key'],
    ['chiave contract', { contract: {} }, 'forbidden_key'],
    ['url fuori da todo', { archive: [{ url: 'https://www.boomrome.com/sign?sign=SECRETVALUE1' }] }, 'url_key'],
    ['url in todo ma non /sign né /scheda', { todo: [{ url: 'https://evil.com/?x=SECRETVALUE1' }] }, 'url_key'],
    ['URL Storage in una stringa', { note: 'https://firebasestorage.googleapis.com/v0/b/b/o/SECRETVALUE1' }, 'storage_url'],
    ['token= in una stringa', { note: 'https://x.it/?token=SECRETVALUE1' }, 'token_param'],
    ['ricevuta Stripe', { note: 'https://pay.stripe.com/SECRETVALUE1' }, 'stripe'],
    ['data: URI', { note: 'data:image/png;base64,SECRETVALUE1' }, 'data_uri'],
    ['email in una stringa', { note: 'scrivi a SECRETVALUE1@example.com' }, 'email'],
    ['codice fiscale', { title: 'RSSMRA80A01H501U' }, 'cf'],
    ['IBAN', { title: 'IT60X0542811101000000123456' }, 'iban'],
    ['telefono internazionale', { title: '+393331234567' }, 'phone'],
    ['cellulare italiano', { title: 'chiama 333 1234567' }, 'phone'],
  ];
  for (const [label, proj, rule] of cases) {
    const r = OWNER.assertClean(proj);
    const txt = JSON.stringify(r.violations || []);
    ok(`${label} → ${rule}, percorso presente, valore mai ristampato`,
      r.ok === false && r.violations.some((v) => v.rule === rule && typeof v.path === 'string' && v.path.length > 0)
      && !/SECRETVALUE1|RSSMRA80A01H501U|IT60X0542811101000000123456|3331234567/.test(txt));
  }
  ok('un id esadecimale con «00» e 7 cifre non è un telefono', OWNER.assertClean({ archive: [{ ref: 'd:tg_a00123456789b' }] }).ok);
}

// ══ Tabelle ══════════════════════════════════════════════════════════════
section('Tabelle');
{
  const rows = Object.entries(OWNER.VISIBILITY);
  ok('ogni riga di VISIBILITY è completa', rows.every(([, r]) => 'scope' in r && typeof r.field === 'string' && ['file', 'fact', 'never'].includes(r.owner)
    && 'folder' in r && 'event' in r && r.why && r.why.it && r.why.en));
  ok('i tipi «file» hanno cartella o sono documenti, e un evento', rows.filter(([, r]) => r.owner === 'file').every(([k, r]) => (r.folder || k === 'document' || k === 'own-document') && r.event));
  // Ogni categoria dello Smistatore, letta dal SORGENTE, è dichiarata.
  const smista = readFileSync(path.join(ROOT, 'api/documents/_smista.js'), 'utf8');
  const cats = [...smista.matchAll(/category:\s*'([^']+)'/g)].map((m) => m[1]);
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  ok('lo Smistatore ha categorie da leggere', cats.length >= 15);
  const missingCats = cats.filter((c) => !OWNER.DOC_CATEGORIES[norm(c)]);
  ok('ogni CATS.category è in DOC_CATEGORIES (chiavi normalizzate)' + (missingCats.length ? ' — mancano: ' + missingCats.join(', ') : ''), missingCats.length === 0);
  ok('DOC_CATEGORIES ha anche verbale, inventario, ricevuta', ['verbale', 'inventario', 'ricevuta'].every((k) => OWNER.DOC_CATEGORIES[k]));
  ok('chiavi DOC_CATEGORIES tutte normalizzate', Object.keys(OWNER.DOC_CATEGORIES).every((k) => k === norm(k)));
  ok('ogni categoria: owner, id, label it/en; le «file» hanno cartella', Object.values(OWNER.DOC_CATEGORIES).every((c) => ['file', 'never'].includes(c.owner) && c.id && c.label.it && c.label.en && (c.owner !== 'file' || ['contratto', 'consegna', 'soldi', 'immobile'].includes(c.folder))));
  ok('identità, estratto conto, ricevute canone: mai', ['documento identita carta id', 'estratto conto bancario', 'ricevuta canone incasso', 'ricevuta'].every((k) => OWNER.DOC_CATEGORIES[k].owner === 'never'));

  // Anti-deriva degli URL: ogni campo *Url/*PDF scritto dai produttori ha una voce.
  const PRODUCERS = ['api/agent/_lib.js', 'api/agent/documents.create.js', 'api/contracts/inventario.js', 'api/contracts/verbale.js',
    'api/documents/_smista.js', 'api/fiscal/fascicolo.js', 'api/fiscal/valutazione.js', 'api/owners/rendiconto.js',
    'api/preagreement/convert.js', 'api/preagreement/mandate.js', 'api/sign/_contractpdf.js', 'api/sign/_finalize.js',
    'api/sign/_pack.js', 'api/properties/dossier.js', 'api/fiscal/allega.js', 'api/profile/upload.js', 'api/stripe-webhook.js',
    'api/fiscal/_aspi.js', 'api/preagreement/upload.js'];
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
  const callers = walk(path.join(ROOT, 'api')).filter((f) => readFileSync(f, 'utf8').includes('storageUpload(')).map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
  const unlisted = callers.filter((f) => !PRODUCERS.includes(f));
  ok('ogni chiamante di storageUpload( sotto api/ è nella lista dei produttori' + (unlisted.length ? ' — fuori lista: ' + unlisted.join(', ') : ''), unlisted.length === 0);
  const keys = new Set();
  for (const f of PRODUCERS) {
    const s = readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/\.([A-Za-z_]\w*(?:Url|URL|PDF|Pdf))\b|\b([A-Za-z_]\w*(?:Url|URL|PDF|Pdf))\s*:/g)) keys.add(m[1] || m[2]);
  }
  const notMapped = [...keys].filter((k) => !(k in OWNER.URL_FIELDS));
  ok('ogni campo *Url/*PDF dei produttori è in URL_FIELDS' + (notMapped.length ? ' — mancano: ' + notMapped.join(', ') : ''), notMapped.length === 0);
  // Campi annidati: il contenitore nel sorgente pretende la sua voce.
  const NESTED = { verbaleConsegna: ['verbaleConsegna.url'], inventarioUscita: ['inventarioUscita.url', 'inventarioUscita.shots[]'], 'inventario': ['inventario.url', 'inventario.shots[]'],
    'dossier[': ['dossier.<slot>.url'], identityDocs: ['identityDocs[].url'], tenantMandate: ['tenantMandate.docUrl'] };
  const nestedMissing = [];
  for (const f of PRODUCERS) {
    const s = readFileSync(path.join(ROOT, f), 'utf8');
    for (const [needle, fields] of Object.entries(NESTED)) if (s.includes(needle)) fields.forEach((k) => { if (!(k in OWNER.URL_FIELDS)) nestedMissing.push(f + ' → ' + k); });
  }
  ok('i campi URL annidati (verbale, inventari, dossier, identità, mandato) sono dichiarati' + (nestedMissing.length ? ' — ' + nestedMissing.join('; ') : ''), nestedMissing.length === 0);
  ok('ogni voce di URL_FIELDS punta a un tipo di VISIBILITY o dichiara perché si ignora',
    Object.values(OWNER.URL_FIELDS).every((v) => (typeof v === 'string' && OWNER.VISIBILITY[v]) || (v && typeof v.ignore === 'string' && v.ignore.includes(' — '))));

  // Le parole: stesse chiavi in IT e EN, e ogni codice emesso ha la sua.
  const it = Object.keys(OWNER.STRINGS.it).sort(), en = Object.keys(OWNER.STRINGS.en).sort();
  ok('STRINGS.it e STRINGS.en hanno le stesse chiavi', JSON.stringify(it) === JSON.stringify(en));
  ok('nessuna stringa vuota', it.every((k) => OWNER.STRINGS.it[k] && OWNER.STRINGS.en[k]));
  ok('ogni plurale .one ha il suo .many e viceversa', it.filter((k) => /\.one$/.test(k)).every((k) => OWNER.STRINGS.it[k.replace(/\.one$/, '.many')])
    && it.filter((k) => /\.many$/.test(k)).every((k) => OWNER.STRINGS.it[k.replace(/\.many$/, '.one')]));
  const C = OWNER.CODES;
  const need = [].concat(
    C.reasons.map((c) => 'reason.' + c), C.notes.map((c) => 'note.' + c), C.stageStates.map((c) => 'stagestate.' + c), C.dots.map((c) => 'dot.' + c),
    C.vias.map((c) => 'via.' + c), C.cadences.map((c) => 'cadence.' + c), C.invoiceStatus.map((c) => 'invoice.' + c), C.maint.map((c) => 'maint.' + c),
    C.maintStatus.map((c) => 'maint.status.' + c), C.contractStatus.map((c) => 'status.' + c), C.types.map((c) => 'type.' + c),
    C.ribbon.map((c) => 'ribbon.' + c), C.folders.map((c) => 'folder.' + c), C.states.map((c) => 'state.' + c), C.events.map((c) => 'prov.' + c),
    C.by.map((c) => 'by.' + c), C.ghosts.map((c) => 'ghost.' + c), C.kinds.map((c) => 'kind.' + c), OWNER.STAGES.map((s) => 'stage.' + s));
  const noString = need.filter((k) => !(k in OWNER.STRINGS.it));
  ok('ogni codice dichiarato ha una stringa' + (noString.length ? ' — mancano: ' + noString.join(', ') : ''), noString.length === 0);
  // …e ogni codice che le proiezioni vere emettono.
  const emitted = new Set();
  for (const n of Object.keys(scenarios)) for (const va of [false, true]) {
    const p = B(n, { viewAs: va });
    p.verdict.reasons.forEach((r) => emitted.add('reason.' + r.code));
    p.verdict.lines.forEach((l) => emitted.add('dot.' + l.dot));
    p.properties.forEach((pp) => {
      emitted.add('dot.' + pp.dot);
      pp.contracts.current.concat(pp.contracts.past).forEach((c) => {
        emitted.add('status.' + c.status); emitted.add('type.' + (c.type || 'none')); emitted.add('cadence.' + (c.installmentMonths || 'none'));
        c.stages.forEach((s) => { emitted.add('stage.' + s.key); emitted.add('stagestate.' + s.state); if (s.note) emitted.add('note.' + s.note); });
      });
      pp.ribbon.months.forEach((m) => emitted.add('ribbon.' + m.state));
      pp.rows.concat(pp.others).forEach((r) => emitted.add('via.' + (r.via || 'none')));
      pp.maintenance.forEach((m) => { emitted.add('maint.' + m.category); emitted.add('maint.status.' + m.status); });
    });
    p.archive.forEach((a) => { if (a.ghost) emitted.add('ghost.' + a.kind); else { emitted.add('kind.' + a.kind); emitted.add('folder.' + a.folder); emitted.add('prov.' + a.provenance.event); emitted.add('by.' + a.provenance.by); if (a.state) emitted.add('state.' + a.state); } });
    p.invoices.forEach((i) => emitted.add('invoice.' + i.status));
  }
  const noEmit = [...emitted].filter((k) => !(k in OWNER.STRINGS.it));
  ok('ogni codice emesso dagli scenari ha una stringa' + (noEmit.length ? ' — mancano: ' + noEmit.join(', ') : ''), noEmit.length === 0 && emitted.size > 40);
  // La pagina parla SOLO col motore: ogni chiave letterale passata a t(…) in
  // proprietario.html esiste in STRINGS.it e STRINGS.en (o come plurale
  // .one/.many), e ogni prefisso ('reason.' + codice) apre almeno una chiave.
  function pageKeys(html) {
    const full = new Set(), prefixes = new Set();
    const re = /(?<![\w$.])t\(/g; let m;
    while ((m = re.exec(html))) {
      let i = m.index + 2, depth = 0, arg = '';
      for (; i < html.length; i++) {
        const ch = html[i];
        if (ch === "'" || ch === '"' || ch === '`') { const q = ch; let j = i + 1; while (j < html.length && html[j] !== q) { if (html[j] === '\\') j++; j++; } arg += html.slice(i, j + 1); i = j; continue; }
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) { if (depth === 0) break; depth--; }
        else if (ch === ',' && depth === 0) break;
        arg += ch;
      }
      // Solo i letterali al primo livello dell'argomento: dentro una
      // parentesi ('cadence.' + (x || 'none')) c'è un pezzo, non una chiave.
      for (let j = 0, d = 0; j < arg.length; j++) {
        const ch = arg[j];
        if ('([{'.includes(ch)) { d++; continue; }
        if (')]}'.includes(ch)) { d--; continue; }
        if (ch !== "'" && ch !== '"' && ch !== '`') continue;
        let k = j + 1; while (k < arg.length && arg[k] !== ch) { if (arg[k] === '\\') k++; k++; }
        const value = arg.slice(j + 1, k), before = arg.slice(0, j).trimEnd().slice(-1), after = arg.slice(k + 1).trimStart().charAt(0);
        j = k;
        if (d !== 0 || ch === '`') continue;
        if (after === '+') prefixes.add(value);
        else if (before !== '+') full.add(value);
      }
    }
    return { full: [...full], prefixes: [...prefixes] };
  }
  const known = (lang, k) => (k in OWNER.STRINGS[lang]) || ((k + '.one') in OWNER.STRINGS[lang] && (k + '.many') in OWNER.STRINGS[lang]);
  const missingKeys = (html) => {
    const { full, prefixes } = pageKeys(html);
    return full.filter((k) => !known('it', k) || !known('en', k))
      .concat(prefixes.filter((p) => !['it', 'en'].every((l) => Object.keys(OWNER.STRINGS[l]).some((k) => k.startsWith(p)))).map((p) => p + '…'));
  };
  const PAGE = readFileSync(path.join(ROOT, 'proprietario.html'), 'utf8');
  const pk = pageKeys(PAGE), pageMissing = missingKeys(PAGE);
  ok(`ogni t('…') di proprietario.html esiste in STRINGS.it e STRINGS.en (${pk.full.length} chiavi, ${pk.prefixes.length} prefissi)` + (pageMissing.length ? ' — mancano: ' + pageMissing.join(', ') : ''),
    pageMissing.length === 0 && pk.full.length > 60 && ['ui.lease_dates', 'ui.lease_dates_only', 'share.tap', 'row.processing_sepa', 'ui.loading'].every((k) => pk.full.includes(k)));
  ok('il controllo morde: una chiave inventata nella pagina viene nominata', JSON.stringify(missingKeys("x=t('ui.inventata');y=t(a?'row.due':'row.nope');z=t('nessuno.'+k)")) === JSON.stringify(['ui.inventata', 'row.nope', 'nessuno.…']));
  ok('la pagina non ha una tabella di parole propria: t() è il motore', !/\bLOCAL\s*=/.test(PAGE) && /function t\(k,p\)\{if\(O\)return O\.t\(k,LANG,p\);/.test(PAGE));
  // L'unica eccezione (revisione 23/09): la cornice d'errore quando il motore
  // stesso non arriva. Solo quelle chiavi, e con le parole ESATTE del motore.
  {
    const m = /var FALLBACK=(\{[\s\S]*?\n\});/.exec(PAGE);
    const FB = m ? vm.runInNewContext('(' + m[1] + ')') : null;
    const FRAME = ['ui.title', 'ui.exit', 'ui.lang', 'ui.loading', 'ui.close', 'ui.error', 'ui.retry', 'ui.whatsapp'];
    ok('la cornice di riserva ha solo le chiavi della cornice d\'errore, IT e EN uguali al motore',
      !!FB && ['it', 'en'].every((l) => JSON.stringify(Object.keys(FB[l]).sort()) === JSON.stringify(FRAME.slice().sort()) && FRAME.every((k) => FB[l][k] === OWNER.STRINGS[l][k])));
    const wa = /var WA_NUMBER='(\d+)'/.exec(PAGE);
    ok('il numero WhatsApp di riserva è quello del motore', !!wa && wa[1] === OWNER.CONTACT.wa);
  }
  ok('ui.lease_dates dice i giorni che MANCANO (daysToEnd), al singolare e al plurale',
    OWNER.t('ui.lease_dates', 'it', { from: 'a', to: 'b', n: 12 }) === 'dal a al b · mancano 12 giorni' && OWNER.t('ui.lease_dates', 'it', { from: 'a', to: 'b', n: 1 }) === 'dal a al b · manca un giorno'
    && OWNER.t('ui.lease_dates', 'en', { from: 'a', to: 'b', n: 12 }) === 'from a to b · 12 days left' && OWNER.t('ui.lease_dates', 'en', { from: 'a', to: 'b', n: 1 }) === 'from a to b · one day left');
  ok('t(): plurale da n, parametri, ripiego su it poi sulla chiave',
    OWNER.t('verdict.osservo.overdue', 'it', { n: 1, days: 4 }) === 'Una rata in ritardo da 4 giorni.'
    && OWNER.t('verdict.osservo.overdue', 'en', { n: 3 }) === '3 payments are late.'
    && OWNER.t('chiave.inesistente', 'en') === 'chiave.inesistente' && OWNER.t('ui.title', 'fr') === 'Il tuo archivio');
}

// ══ Riferimenti ══════════════════════════════════════════════════════════
section('Riferimenti e URL Storage');
{
  const refs = [{ scope: 'c', id: 'c1', kind: 'signed' }, { scope: 'c', id: 'pa_x.1-2', kind: 'inv-out' }, { scope: 'p', id: 'p1', kind: 'dossier-ape' },
    { scope: 'p', id: 'p1', kind: 'valutazione' }, { scope: 'd', id: 'tg_abc', kind: null }, { scope: 'r', id: 'own_1', kind: '2026-08' }];
  ok('andata e ritorno per ogni scope', refs.every((x) => JSON.stringify(OWNER.parseRef(OWNER.encodeRef(x))) === JSON.stringify(x)));
  const rejects = ['c:../x', 'c:a:b:c', 'x:1', 'r:u:2026-13', '/', 'c:' + 'a'.repeat(201), 'c:..:signed', 'c:c1', 'd:x:signed', 'p:p1:signed', 'c:c1:fascicolo', 'r:u', 'c:c 1:signed', '', null];
  ok('parseRef rifiuta ogni forma non ammessa', rejects.every((s) => OWNER.parseRef(s) === null));
  ok('encodeRef lancia su un ref non valido', [{ scope: 'c', id: '..', kind: 'signed' }, { scope: 'x', id: '1' }, { scope: 'r', id: 'u', kind: '2026-13' }]
    .every((x) => { try { OWNER.encodeRef(x); return false; } catch (_) { return true; } }));
  const good = su('contracts/c1/contratto-firmato.pdf');
  ok('URL Storage buono → bucket + percorso', JSON.stringify(OWNER.parseStorageUrl(good, [BUCKET])) === JSON.stringify({ bucket: BUCKET, path: 'contracts/c1/contratto-firmato.pdf' }));
  const evil = [
    good.replace('firebasestorage.googleapis.com', 'firebasestorage.googleapis.com.evil.com'),
    'https://evil.com/v0/b/' + BUCKET + '/o/x?u=https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/contracts%2Fc1%2Fa.pdf',
    good.replace('https:', 'http:'),
    su('contracts/c1/a.pdf', 'T', 'altro-progetto.appspot.com'),
    'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/contracts%2F..%2Fc2%2Fa.pdf',
    'https://firebasestorage.googleapis.com@evil.com/v0/b/' + BUCKET + '/o/contracts%2Fc1%2Fa.pdf',
    'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/contracts/c1/a.pdf',
    'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/%2Fcontracts%2Fc1%2Fa.pdf',
    'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/contracts%5Cc1%5Ca.pdf',
    'https://firebasestorage.googleapis.com:8443/v0/b/' + BUCKET + '/o/contracts%2Fc1%2Fa.pdf',
  ];
  ok('parseStorageUrl rifiuta host finti, host nella query, http:, bucket estranei, «..», «/» iniziale, «\\», porte', evil.every((u) => OWNER.parseStorageUrl(u, [BUCKET]) === null));

  // Ogni oggetto file:true che build produce passa da fileFor.
  let all = 0, round = 0;
  for (const n of Object.keys(scenarios)) {
    const inp = input(n); inp.now = NOW;
    const p = OWNER.build(inp, deps);
    const scope = OWNER.scopeFor({ ownerUid: inp.ownerUid, aliases: inp.aliases, properties: inp.properties, contracts: inp.contracts, documents: inp.documents, buckets: inp.buckets, uploadBucket: inp.uploadBucket });
    for (const a of p.archive.filter((x) => !x.ghost && x.file)) {
      all++;
      const f = OWNER.fileFor(a.ref, scope, deps);
      if (f.ok && f.bucket && f.path && /^BOOM_[A-Za-z0-9]+_[a-z0-9-]+(_\d{4}-\d{2}-\d{2})?\.[a-z0-9]+$/.test(f.name) && (f.fallbackUrl === null || (OWNER.parseStorageUrl(f.fallbackUrl, inp.buckets) || {}).path === f.path)) round++;
      else console.log('    ⚠ fileFor ' + a.ref + ' → ' + JSON.stringify(f));
    }
  }
  ok(`ogni file:true fa andata e ritorno in fileFor (${round}/${all})`, all > 15 && round === all);
  const inp = input('renewal');
  const scope = OWNER.scopeFor({ ownerUid: inp.ownerUid, properties: inp.properties, contracts: inp.contracts, documents: inp.documents, buckets: inp.buckets, uploadBucket: inp.uploadBucket });
  ok('scopeFor ha la forma dell\'ERRATA E2', ['ownerKeys', 'ownedPropertyIds', 'ownedContractIds', 'contractItemPaths', 'buckets', 'uploadBucket'].every((k) => k in scope)
    && scope.ownedPropertyIds instanceof Set && scope.contractItemPaths instanceof Set && scope.buckets[0] === BUCKET);
  ok('fileFor: il verbale ereditato dal rinnovo → not_visible', OWNER.fileFor('c:c_new:verbale', scope, deps).error === 'not_visible');
  ok('fileFor: ref malformato → bad_ref', OWNER.fileFor('c:../x', scope, deps).error === 'bad_ref');
  ok('fileFor: campo assente → not_found', OWNER.fileFor('c:c_new:inv-out', scope, deps).error === 'not_found');
  ok('fileFor: contratto sconosciuto → not_found', OWNER.fileFor('c:nessuno:signed', scope, deps).error === 'not_found');
  ok('fileFor: immobile di un altro → not_your_property', OWNER.fileFor('p:p_other:dossier-ape', scope, deps).error === 'not_your_property');
  ok('fileFor: rendiconto di un\'altra chiave → not_your_property', OWNER.fileFor('r:' + OTHER_UID + ':2026-08', scope, deps).error === 'not_your_property');
  const r = OWNER.fileFor('r:' + OWNER_UID + ':2026-08', scope, deps);
  ok('fileFor: rendiconto per percorso deterministico sul bucket di upload, senza URL di ripiego', r.ok && r.bucket === BUCKET && r.path === 'rendiconti/own_1/rendiconto_2026-08.pdf' && r.fallbackUrl === null);
  const s = OWNER.fileFor('c:c_old:signed', scope, deps);
  ok('fileFor: il file firmato ha il tipo, il nome ASCII e il ripiego SOLO se stesso bucket+percorso', s.ok && s.kind === 'signed' && s.contentTypeHint === 'application/pdf' && /^[\x20-\x7e]+$/.test(s.name) && s.fallbackUrl && s.fallbackUrl.includes('contracts%2Fc_old%2Fcontratto-firmato.pdf'));
  // Un signedPdfUrl su un host estraneo non è mai un file.
  const i2 = input('ok'); i2.contracts[0].signedPdfUrl = 'https://evil.example.com/contratto.pdf';
  const s2 = OWNER.scopeFor({ ownerUid: OWNER_UID, properties: i2.properties, contracts: i2.contracts, documents: i2.documents, buckets: [BUCKET] });
  const f2 = OWNER.fileFor('c:c1:signed', s2, deps);
  ok('fileFor: signedPdfUrl su un host estraneo → not_visible, nessun percorso', !f2.ok && ['not_visible', 'not_found'].includes(f2.error));
  // Un contratto di un altro locatore sullo stesso immobile (ERRATA E3.3).
  const i3 = input('ok'); i3.contracts[0].landlordId = 'altro_locatore';
  const s3 = OWNER.scopeFor({ ownerUid: OWNER_UID, properties: i3.properties, contracts: i3.contracts, buckets: [BUCKET] });
  ok('fileFor: contratto di un locatore precedente → not_visible', OWNER.fileFor('c:c1:signed', s3, deps).error === 'not_visible');
  ok('documento d:: sconosciuto → not_found; categoria vietata → not_visible', (() => {
    const i = input('ok');
    const sc = OWNER.scopeFor({ ownerUid: OWNER_UID, properties: i.properties, contracts: i.contracts, documents: i.documents, buckets: [BUCKET] });
    return OWNER.fileFor('d:nessuno', sc, deps).error === 'not_found' && OWNER.fileFor('d:d_id', sc, deps).error === 'not_visible' && OWNER.fileFor('d:d_f24', sc, deps).ok;
  })());
}

// ══ Attribuzione e rinnovo (mutazioni) ═══════════════════════════════════
section('Attribuzione: il percorso decide, la data protegge il rinnovo');
{
  const refsOf = (p) => p.archive.filter((a) => !a.ghost).map((a) => a.ref);
  const newCard = (p) => p.properties[0].contracts.current.find((c) => c.id === 'c_new');
  redUnder('mp:path-prefix — il verbale del vecchio contratto non finisce sotto il rinnovo',
    (E) => { const p = projection('renewal', { engine: E }); return !refsOf(p).includes('c:c_new:verbale') && !newCard(p).stages.some((s) => s.key === 'chiavi'); },
    mutant('path-prefix', "path.indexOf('contracts/' + cid + '/') === 0", "path.indexOf('contracts/') === 0"));
  redUnder('mp:renewal-guard — la registrazione ereditata non rende «fatto» il rinnovo',
    (E) => { const p = projection('renewal', { engine: E }); const reg = newCard(p).stages.find((s) => s.key === 'registrazione'); return reg && reg.state !== 'done'; },
    mutant('renewal-guard', 'if (c.renewalOf) {', 'if (false) {'));
  const p = B('renewal');
  const nc = newCard(p);
  ok('rinnovo: la delega ereditata non è armata (ERRATA E4.11) e la firma resta da fare', nc.signing.delegateArmed === false && p.todo.some((t) => t.id === 'sign:c_new'));
  ok('rinnovo: la marca temporale del vecchio non sigilla il nuovo', nc.sealed.tsr === false);
  ok('rinnovo: il vecchio resta tra i passati, «rinnovato», col suo verbale', p.properties[0].contracts.past[0].id === 'c_old' && p.properties[0].contracts.past[0].status === 'renewed' && refsOf(p).includes('c:c_old:verbale'));
  const ctx = { buckets: [BUCKET], day: DOSSIER.day };
  const c = { id: 'cN', propertyId: 'p1', renewalOf: 'cO', createdAt: '2026-01-15T10:00:00Z', startDate: '2026-02-01' };
  ok('attributable: un file sotto contracts/<altro>/ appartiene all\'altro', !OWNER.attributable(c, 'verbaleConsegna', { at: '2026-03-01', url: su('contracts/cO/v.pdf') }, ctx));
  ok('attributable: property-docs/<pid>/ datato dopo l\'ancora → sì; prima → no', OWNER.attributable(c, 'inventario', { at: '2026-02-01T09:00:00Z', url: su('property-docs/p1/i.pdf') }, ctx)
    && !OWNER.attributable(c, 'inventario', { at: '2025-12-01T09:00:00Z', url: su('property-docs/p1/i.pdf') }, ctx));
  ok('attributable: property-docs di un altro immobile → no', !OWNER.attributable(c, 'inventario', { at: '2026-03-01', url: su('property-docs/p9/i.pdf') }, ctx));
  ok('attributable: un valore senza data su un rinnovo → no', !OWNER.attributable(c, 'registeredAt', null, ctx));
  ok('attributable: senza rinnovo un campo senza URL conta', OWNER.attributable({ id: 'c1' }, 'registeredAt', '2026-01-01', ctx));
}

// ══ Documenti ════════════════════════════════════════════════════════════
section('documents: chi vede cosa (ordine ERRATA E3.2)');
{
  const inp = input('ok');
  const scope = OWNER.scopeFor({ ownerUid: OWNER_UID, properties: inp.properties, contracts: inp.contracts, buckets: [BUCKET] });
  const V = (d) => OWNER.documentVisibility({ propertyId: 'p1', fileUrl: su('smistatore/2026/x.pdf'), category: 'F24 IMU', ...d }, scope);
  ok('fuori perimetro → not_owner_scope', V({ propertyId: 'p_other' }).reason === 'not_owner_scope');
  ok('da smistare → unfiled', V({ needsFiling: true }).reason === 'unfiled');
  ok('archivio del deal → deal_archive_internal', V({ type: 'deal-archive', userId: OWNER_UID }).reason === 'deal_archive_internal');
  ok('copia d\'attivazione del contratto non firmato → duplicate_of_contract_item', V({ userId: OWNER_UID, fileUrl: inp.contracts[0].generatedPDF, category: 'contratto locazione' }).reason === 'duplicate_of_contract_item');
  ok('percorso di un altro contratto → path_out_of_scope', V({ fileUrl: su('contracts/c_altro/x.pdf') }).reason === 'path_out_of_scope');
  ok('data: URI → path_out_of_scope', V({ fileUrl: 'data:application/pdf;base64,AAAA' }).reason === 'path_out_of_scope');
  ok('cartella di un altro utente → path_out_of_scope', V({ fileUrl: su('documents/t1/x.pdf') }).reason === 'path_out_of_scope');
  ok('Innesto di un altro utente: ammesso SOLO sotto /innesto/ con source innesto', V({ fileUrl: su('documents/admin_1/innesto/x.pdf'), source: 'innesto' }).owner === 'file'
    && V({ fileUrl: su('documents/admin_1/altro/x.pdf'), source: 'innesto' }).owner === 'never');
  redUnder('mp:visibility — un documento d\'identità «suo» resta mai',
    (E) => E.documentVisibility({ propertyId: 'p1', userId: OWNER_UID, fileUrl: su('documents/' + OWNER_UID + '/innesto/id.jpg'), category: 'documento identità carta ID' }, scope).owner === 'never',
    mutant('visibility', "c && c.owner === 'never'", 'false'));
  ok('un documento suo → file, own-document', V({ userId: OWNER_UID, fileUrl: su('documents/' + OWNER_UID + '/n.pdf'), category: '' }).kind === 'own-document');
  ok('categoria dichiarata «file» (maiuscole/spazi indifferenti) → file', V({ category: '  F24 imu ' }).owner === 'file' && V({ category: 'Registrazione RLI' }).kind === 'doc-rli');
  ok('categoria con accento normalizzata → identità → mai', V({ category: 'documento identità carta ID' }).reason === 'never_category');
  ok('categoria non dichiarata → undeclared_category', V({ category: 'qualcosa di nuovo' }).reason === 'undeclared_category');
  ok('contratto di un altro locatore → other_landlord', (() => {
    const i = input('ok'); i.contracts[0].landlordId = 'altro';
    const s = OWNER.scopeFor({ ownerUid: OWNER_UID, properties: i.properties, contracts: i.contracts, buckets: [BUCKET] });
    return OWNER.documentVisibility({ propertyId: 'p1', contractId: 'c1', category: 'verbale', fileUrl: su('smistatore/2026/v.pdf') }, s).reason === 'other_landlord';
  })());
  const p = B('ok');
  const refs = p.archive.filter((a) => !a.ghost).map((a) => a.ref);
  ok('nella proiezione: F24 e RLI sì, identità e ricevuta del conduttore no', refs.includes('d:d_f24') && refs.includes('d:d_rli') && !refs.includes('d:d_id') && !refs.includes('d:d_rcpt'));
  ok('il documento RLI del contratto è sulla tappa «registrazione»', p.properties[0].contracts.current[0].stages.find((s) => s.key === 'registrazione').refs.includes('d:d_rli'));
}

// ══ Tappe ═══════════════════════════════════════════════════════════════
section('Tappe del contratto');
{
  const ctx = { today: '2026-09-22', day: DOSSIER.day, buckets: [BUCKET], refs: new Set(['c:c1:signed', 'c:c1:scheda', 'c:c1:verbale', 'c:c1:inv-in', 'c:c1:inv-out']) };
  const S = (over) => OWNER.stagesFor({ id: 'c1', propertyId: 'p1', status: 'active', startDate: '2026-02-01', endDate: '2027-01-31', preAgreementId: 'pa1', ...over }, ctx);
  const st = (arr, k) => arr.find((s) => s.key === k);
  const full = S({ signatureStatus: 'complete', tenantSignedAt: '2026-01-10T09:00:00Z', landlordSignedAt: '2026-01-11T09:00:00Z', fullySignedAt: '2026-01-11T09:00:00Z',
    paAcceptance: { at: '2026-01-02T10:00:00Z' }, rliRegisteredAt: '2026-02-10',
    verbaleConsegna: { at: '2026-02-01T10:00:00Z', url: su('contracts/c1/v.pdf') }, inventario: { at: '2026-02-01T11:00:00Z', url: su('contracts/c1/i.pdf') },
    inventarioUscita: { at: '2026-09-01T11:00:00Z', url: su('contracts/c1/o.pdf'), diff: { missing: ['a'], damaged: ['b', 'c'], added: [], unverifiable: ['d'] } } });
  ok('proposta, firme, firmato, registrazione, chiavi, inventario, inizio: fatti con la data', ['proposta', 'firma_conduttore', 'firma_proprietario', 'firmato', 'registrazione', 'chiavi', 'inventario', 'inizio']
    .every((k) => st(full, k) && st(full, k).state === 'done' && st(full, k).date));
  ok('firmato porta i file firmato e scheda; chiavi il verbale', st(full, 'firmato').refs.join() === 'c:c1:signed,c:c1:scheda' && st(full, 'chiavi').refs[0] === 'c:c1:verbale');
  ok('riconsegna con i conteggi del confronto', JSON.stringify(st(full, 'riconsegna').counts) === JSON.stringify({ missing: 1, damaged: 2, added: 0, unverifiable: 1 }));
  ok('l\'aereo: la prima tappa non fatta è «now», la fine futura', st(full, 'fine').state === 'now' && st(full, 'fine').date === '2027-01-31');
  ok('ordine delle tappe come STAGES', full.map((s) => s.key).join() === OWNER.STAGES.filter((k) => full.some((s) => s.key === k)).join());
  const mand = S({ signatureStatus: 'partial', tenantSignature: 'x', tenantSignedByDelegate: { signedAt: '2026-01-10T09:00:00Z' }, landlordDelegate: { name: 'Valentino', at: '2026-01-01T00:00:00Z' } });
  ok('firma per mandato → note per_mandato', st(mand, 'firma_conduttore').note === 'per_mandato' && st(mand, 'firma_conduttore').state === 'done');
  ok('delega armata e non firmata → note delega_attiva, adesso', st(mand, 'firma_proprietario').note === 'delega_attiva' && st(mand, 'firma_proprietario').state === 'now');
  ok('dopo l\'aereo le tappe sono «next»', st(mand, 'firmato').state === 'next' && st(mand, 'registrazione').state === 'next');
  const del = S({ signatureStatus: 'complete', tenantSignedAt: '2026-01-10', landlordSignedAt: '2026-01-11', landlordSignedByDelegate: { signedAt: '2026-01-11' }, fullySignedAt: '2026-09-10', rliRegisteredAt: '2026-09-15' });
  ok('firma del locatore per delega → per_delega', st(del, 'firma_proprietario').note === 'per_delega');
  const B1 = S({ signatureStatus: 'complete', fullySignedAt: '2026-01-11', registrationStatus: 'registered', registeredAt: '2026-02-12T10:00:00Z' });
  ok('registrazione: B «registered» → fatto, data del click, note data_di_conferma', st(B1, 'registrazione').state === 'done' && st(B1, 'registrazione').note === 'data_di_conferma' && st(B1, 'registrazione').date === '2026-02-12');
  const AB = S({ signatureStatus: 'complete', fullySignedAt: '2026-01-11', rliRegisteredAt: '2026-02-10', registrationStatus: 'sent', aspiRequestedAt: '2026-02-01T10:00:00Z' });
  ok('registrazione: A vince su B «sent» — nessun conflitto finto (ERRATA E1.2)', st(AB, 'registrazione').state === 'done' && st(AB, 'registrazione').date === '2026-02-10' && !AB.some((s) => s.state === 'conflict'));
  const sent = S({ signatureStatus: 'complete', fullySignedAt: '2026-01-11', registrationStatus: 'sent', aspiRequestedAt: '2026-02-01T10:00:00Z' });
  ok('registrazione: inviata ad ASPI → now, inviata_aspi, con la data', st(sent, 'registrazione').state === 'now' && st(sent, 'registrazione').note === 'inviata_aspi' && st(sent, 'registrazione').date === '2026-02-01');
  const asp = S({ signatureStatus: 'complete', fullySignedAt: '2026-01-11', aspiRequestedAt: '2026-02-03T10:00:00Z' });
  ok('registrazione: solo aspiRequestedAt → now, inviata_aspi', st(asp, 'registrazione').note === 'inviata_aspi');
  const old = S({ signatureStatus: 'complete', fullySignedAt: '2026-01-11' });
  ok('registrazione: firmato da più di 30 giorni senza esito → unknown, esito_non_registrato', st(old, 'registrazione').state === 'unknown' && st(old, 'registrazione').note === 'esito_non_registrato');
  const fresh = S({ signatureStatus: 'complete', fullySignedAt: '2026-09-10' });
  ok('registrazione: firmato da poco → ancora da fare (non unknown)', ['now', 'next'].includes(st(fresh, 'registrazione').state));
  const paper = S({ preAgreementId: null, signatureStatus: 'none' });
  ok('firma non registrata: «firmato» unknown con firma_non_registrata, nessuna tappa di firma né registrazione', st(paper, 'firmato').state === 'unknown' && st(paper, 'firmato').note === 'firma_non_registrata'
    && !st(paper, 'firma_conduttore') && !st(paper, 'registrazione') && !paper.some((x) => x.key === 'firmato' && x.state === 'done'));
  const fut = S({ startDate: '2026-10-01', endDate: '2027-09-30' });
  ok('inizio futuro → da fare con la data', st(fut, 'inizio').state !== 'done' && st(fut, 'inizio').date === '2026-10-01');
  const ren = S({ status: 'renewed', renewedToId: 'c2', renewalHistory: [{ date: '2027-01-15' }], endDate: '2026-01-31', signatureStatus: 'complete', fullySignedAt: '2025-01-11', rliRegisteredAt: '2025-02-10' });
  ok('rinnovo fatto e fine passata', st(ren, 'rinnovo').state === 'done' && st(ren, 'fine').state === 'done');
  const term = S({ status: 'terminated', terminatedAt: '2026-06-30' });
  ok('cessazione con la data', st(term, 'cessazione').state === 'done' && st(term, 'cessazione').date === '2026-06-30');
  ok('nessuna tappa inventata: proposta/chiavi/inventario/rinnovo assenti se manca il fatto', !['proposta', 'chiavi', 'inventario', 'rinnovo', 'cessazione', 'riconsegna'].some((k) => st(fut, k)));
}

// ══ Soldi ═══════════════════════════════════════════════════════════════
section('Soldi');
{
  const p = B('ok');
  const pp = p.properties[0];
  const rowKeys = ['id', 'month', 'dueDate', 'amount', 'state', 'isRent', 'type', 'paidDate', 'via', 'coversTo', 'reportedDate', 'overdueDays', 'reminders', 'sepa',
    'afterEnd', 'afterTermination', 'contractId', 'unit', 'tenantName'];
  ok('RentRow ha esattamente le chiavi pinnate', pp.rows.concat(pp.others).every((r) => JSON.stringify(Object.keys(r).sort()) === JSON.stringify(rowKeys.slice().sort())));
  ok('stripe → card; il saldo deposito è fra gli «altri addebiti»', pp.rows[0].via === 'card' && pp.others.some((r) => r.type === 'deposit-balance' && r.via === 'bank'));
  ok('il nastro: 12 mesi, corrente al centro (indice 9)', pp.ribbon.months.length === 12 && pp.ribbon.currentIndex === 9 && pp.ribbon.months[9].ym === '2026-09');
  ok('il nastro: pagato dentro il contratto, «fuori» prima dell\'inizio, «vuoto» dopo le rate', pp.ribbon.months[9].state === 'paid' && pp.ribbon.months[0].state === 'fuori' && pp.ribbon.months[10].state === 'empty');
  ok('l\'anno: somma delle rate pagate nel 2026, con i loro id', pp.year.year === '2026' && pp.year.paid === 10000 && pp.year.paidCount === 8 && pp.year.rowIds.length === 8);
  const y = withInput('ok', (i) => {
    i.payments.push({ id: 'pay_c1_2025-12', contractId: 'c1', propertyId: 'p1', tenantId: 't1', month: '2025-12', dueDate: '2025-12-05', amount: 1000, status: 'paid', paidDate: '2025-12-31T23:30:00Z' });
    i.payments.push({ id: 'pay_c1_2025-11', contractId: 'c1', propertyId: 'p1', tenantId: 't1', month: '2025-11', dueDate: '2025-11-05', amount: 999, status: 'paid', paidDate: '2025-12-31' });
    i.payments.push({ id: 'pay_c1_2026-10', contractId: 'c1', propertyId: 'p1', tenantId: 't1', month: '2026-10', dueDate: '2026-10-05', amount: null, status: 'paid', paidAt: '2026-09-20T10:00:00Z' });
  }).properties[0].year;
  ok('23:30Z del 31/12/2025 conta nel 2026 (Roma); un 31/12 civile resta nel 2025', y.rowIds.includes('pay_c1_2025-12') && !y.rowIds.includes('pay_c1_2025-11') && y.paid === 11000);
  ok('un importo mancante si conta, mai si somma', y.unknownAmountCount === 1 && y.paidCount === 10);
  // mp:overdue-state: una rata «pending» scaduta è in ritardo, qualunque cosa dica il campo.
  redUnder('mp:overdue-state — una rata pending scaduta è in ritardo',
    (E) => { const q = projection('osservo', { engine: E }); const r = q.properties[0].rows.find((x) => x.id === 'pay_c1_2026-09'); return r.state === 'overdue' && r.overdueDays === 17 && q.verdict.state === 'osservo'; },
    mutant('overdue-state', 'r.state;', "key(r.payment.status) || 'unknown';"));
  const o = B('osservo');
  const r9 = o.properties[0].rows.find((x) => x.id === 'pay_c1_2026-09');
  ok('solleciti: conteggio e ultima data', r9.reminders && r9.reminders.count === 2 && r9.reminders.last === '2026-09-15');
  const ro = o.verdict.reasons.find((r) => r.code === 'rent_overdue');
  ok('motivo rent_overdue con giorni, rata e ultimo sollecito', ro.days === 17 && ro.paymentId === 'pay_c1_2026-09' && ro.reminderLast === '2026-09-15');
  ok('cella del nastro: il peggiore vince', o.properties[0].ribbon.months[9].state === 'overdue');
  const oldUnknown = withInput('ok', (i) => { i.payments.push({ id: 'pay_c1_2023-01', contractId: 'c1', propertyId: 'p1', tenantId: 't1', month: '2023-01', dueDate: '2023-01-05', amount: 500, status: 'boh' }); });
  ok('una rata vecchia ma in stato ignoto resta visibile', oldUnknown.properties[0].rows.some((r) => r.id === 'pay_c1_2023-01' && r.state === 'unknown'));
  const oldPaid = withInput('ok', (i) => { i.payments.push({ id: 'pay_c1_2022-01', contractId: 'c1', propertyId: 'p1', tenantId: 't1', month: '2022-01', dueDate: '2022-01-05', amount: 500, status: 'paid', paidDate: '2022-01-04' }); });
  ok('una rata pagata fuori finestra (36 mesi) non si elenca', !oldPaid.properties[0].rows.some((r) => r.id === 'pay_c1_2022-01'));
  const sepa = withInput('ok', (i) => { const x = i.payments.find((q) => q.id === 'pay_c1_2026-09'); x.status = 'pending'; x.sddPiId = 'pi_1'; delete x.paidDate; });
  ok('SEPA in corso → rent_processing_sepa, riga sepa:true, osservo', sepa.verdict.reasons.some((r) => r.code === 'rent_processing_sepa') && sepa.verdict.state === 'osservo'
    && sepa.properties[0].rows.find((r) => r.id === 'pay_c1_2026-09').sepa === true);
  const card = withInput('ok', (i) => { const x = i.payments.find((q) => q.id === 'pay_c1_2026-09'); x.status = 'processing'; delete x.paidDate; });
  ok('pagamento con carta in elaborazione → rent_processing (mai «SEPA»)', card.verdict.reasons.some((r) => r.code === 'rent_processing'));
  const rep = withInput('ok', (i) => { const x = i.payments.find((q) => q.id === 'pay_c1_2026-09'); x.status = 'pending'; x.tenantReported = true; x.tenantReportedAt = '2026-09-06T10:00:00Z'; delete x.paidDate; });
  ok('bonifico segnalato → rent_reported con la data', rep.verdict.reasons.some((r) => r.code === 'rent_reported' && r.date === '2026-09-06') && rep.properties[0].rows.find((r) => r.id === 'pay_c1_2026-09').reportedDate === '2026-09-06');
  const inst = withInput('ok', (i) => { i.payments = i.payments.filter((q) => q.month !== '2026-09'); });
  ok('contratto firmato in corso senza la rata del mese → installments_missing → nonso', inst.verdict.reasons.some((r) => r.code === 'installments_missing' && r.month === '2026-09') && inst.verdict.state === 'nonso'
    && inst.properties[0].facts.some((f) => f.k === 'no_rows'));
  // Un mese fuori dal contratto non ha rate da aspettarsi: né il fatto «non
  // ancora a sistema» né il motivo installments_missing, prima dell'inizio
  // (il contratto del caso `tu` parte il 1/10) né dopo la fine.
  const noRowsOut = (E, name, fn) => {
    const q = projection(name, { engine: E, mutate: fn });
    return !q.properties[0].facts.some((f) => f.k === 'no_rows') && !q.verdict.reasons.some((r) => r.code === 'installments_missing');
  };
  const ended = (i) => { i.contracts[0].endDate = '2026-08-31'; i.payments = i.payments.filter((q) => q.month !== '2026-09'); };
  const future = (i) => { i.contracts[0].startDate = '2026-10-01'; i.contracts[0].endDate = '2027-09-30'; i.payments = []; };
  ok('prima dell\'inizio (caso tu, contratto dal 1/10): nessun no_rows per settembre, nessun installments_missing', noRowsOut(OWNER, 'tu'));
  ok('dopo la fine (scaduto il 31/08): nessun no_rows per settembre, nessun installments_missing — resta contract_expired_open',
    noRowsOut(OWNER, 'ok', ended) && withInput('ok', ended).verdict.reasons.some((r) => r.code === 'contract_expired_open'));
  ok('firmato che parte il mese prossimo, nessuna rata: nessun no_rows, nessun installments_missing, verdetto ok', noRowsOut(OWNER, 'ok', future) && withInput('ok', future).verdict.state === 'ok');
  redUnder('mp:lease-month — «rate non ancora a sistema» mai per un mese fuori dal contratto',
    (E) => noRowsOut(E, 'tu') && noRowsOut(E, 'ok', ended) && projection('ok', { engine: E, mutate: (i) => { i.payments = i.payments.filter((q) => q.month !== '2026-09'); } }).properties[0].facts.some((f) => f.k === 'no_rows'),
    mutant('lease-month', 'current.some(function (c) { return leaseCoversMonth(c, month); })', 'true'));
  redUnder('mp:installments-window — installments_missing solo fra inizio e fine del contratto',
    (E) => noRowsOut(E, 'ok', future) && noRowsOut(E, 'ok', ended),
    mutant('installments-window', 'start && start <= today && (!end || today <= end)', 'start'));
  ok('fatture BOOM: pending → open, immobile dedotto dal contratto, nessun PDF', (() => { const i = B('ok').invoices[0]; return i.status === 'open' && i.propertyId === 'p1' && i.contractId === 'c1' && i.amount === 89 && !('url' in i); })());
}

// ══ Verdetto ════════════════════════════════════════════════════════════
section('Verdetto');
{
  const states = Object.fromEntries(['ok', 'osservo', 'nonso', 'tu', 'vuoto'].map((n) => [n, B(n).verdict.state]));
  ok('i cinque stati dagli scenari: ' + JSON.stringify(states), Object.entries(states).every(([n, s]) => n === s));
  ok('«vuoto» non ha righe né archivio', B('vuoto').verdict.lines.length === 0 && B('vuoto').archive.length === 0);
  const mix = withInput('osservo', (i) => { i.contracts[0].signatureStatus = 'partial'; i.contracts[0].landlordSignature = null; i.contracts[0].landlordSignedAt = null; i.contracts[0].signInviteLandlordAt = '2026-09-01'; });
  ok('precedenza: tu batte osservo', mix.verdict.state === 'tu' && mix.verdict.reasons.some((r) => r.code === 'rent_overdue'));
  const mix2 = withInput('osservo', (i) => { i.partial = ['read:documents']; });
  ok('precedenza: osservo batte nonso (e read_partial è dichiarato)', mix2.verdict.state === 'osservo' && mix2.verdict.reasons.some((r) => r.code === 'read_partial') && mix2.meta.partial[0] === 'read:documents');
  const part = withInput('ok', (i) => { i.partial = ['truncated:payments']; });
  ok('una lettura parziale → nonso', part.verdict.state === 'nonso');
  const dl = withInput('ok', (i) => { i.deadlines = [{ id: 'dlfin_c1_9', owner: 'landlord', status: 'pending', date: '2026-08-01', title: 'Cedolare: raccomandata', linkedContractId: 'c1', linkedPropertyId: 'p1' }]; });
  ok('una scadenza del proprietario passata → tu, deadline_overdue (ERRATA E4.5)', dl.verdict.state === 'tu' && dl.verdict.reasons[0].code === 'deadline_overdue' && dl.todo[0].overdue === true);
  ok('stanze con interni distinti: nessun multiple_active_contracts', !B('rooms').verdict.reasons.some((r) => r.code === 'multiple_active_contracts'));
  const same = withInput('rooms', (i) => { i.contracts[1].unit = 'A'; });
  ok('stesso interno e date sovrapposte → multiple_active_contracts → nonso', same.verdict.reasons.some((r) => r.code === 'multiple_active_contracts') && same.verdict.state === 'nonso');
  const empt = withInput('rooms', (i) => { i.contracts[1].unit = ''; });
  ok('un interno vuoto non esclude la sovrapposizione', empt.verdict.reasons.some((r) => r.code === 'multiple_active_contracts'));
  const rw = withInput('ok', (i) => { i.contracts = []; i.payments = []; });
  ok('risulta affittato senza contratto → rented_without_contract, fatto no_lease', rw.verdict.reasons.some((r) => r.code === 'rented_without_contract') && rw.properties[0].facts[0].k === 'no_lease');
  const vac = withInput('ok', (i) => { i.contracts = []; i.payments = []; i.properties[0].status = 'vacant'; });
  ok('libero senza contratto → vacant, ok', vac.properties[0].facts[0].k === 'vacant' && vac.verdict.state === 'ok');
  const exp = withInput('ok', (i) => { i.contracts[0].endDate = '2026-08-31'; });
  ok('attivo oltre la fine → contract_expired_open con la data', exp.verdict.reasons.some((r) => r.code === 'contract_expired_open' && r.date === '2026-08-31'));
  const dates = withInput('ok', (i) => { i.contracts[0].endDate = '2025-01-01'; });
  ok('fine prima dell\'inizio → contract_date_conflict', dates.verdict.reasons.some((r) => r.code === 'contract_date_conflict'));
  const mdate = withInput('ok', (i) => { i.maintenance[0].createdAt = 'ieri'; });
  ok('una data illeggibile su una manutenzione NON è un conflitto di contratto (ERRATA E4.10)', !mdate.verdict.reasons.some((r) => r.code === 'contract_date_conflict'));
  const ghost = withInput('ok', (i) => { i.properties[0].dossier = {}; });
  ok('un fantasma (APE mancante) non cambia il verdetto', ghost.verdict.state === 'ok' && ghost.archive.some((a) => a.ghost && a.kind === 'ape'));
  // Con la copia del documento del locatore la Scheda non ha nulla da chiedere:
  // resta solo il fatto che la registrazione non risulta.
  const regU = withInput('ok', (i) => { i.contracts[0].rliRegisteredAt = null; i.contracts[0].identityDocs.push({ url: su('contracts/c1/identity/locatore.jpg'), role: 'landlord' }); });
  ok('registrazione senza esito da oltre 30 giorni → registration_unknown → nonso', regU.verdict.reasons.some((r) => r.code === 'registration_unknown') && regU.verdict.state === 'nonso');
  ok('le righe del verdetto hanno fatti tipizzati', B('ok').verdict.lines[0].facts.every((f) => ['lease', 'vacant', 'no_lease', 'month', 'no_rows', 'deadlines'].includes(f.k)));
  const prev = withInput('ok', (i) => { i.contracts.push({ ...i.contracts[0], id: 'c_prev', landlordId: 'vecchio_proprietario', status: 'terminated', startDate: '2024-01-01', endDate: '2025-01-01' }); }, { viewAs: true });
  ok('il contratto del proprietario precedente non entra, contato in adminNotes (ERRATA E3.3)', !JSON.stringify(prev.properties).includes('c_prev')
    && prev.adminNotes.hidden.some((h) => h.kind === 'contract' && h.reason === 'other_landlord'));
}

// ══ Da fare ═════════════════════════════════════════════════════════════
section('Da fare');
{
  const t = B('tu');
  ok('ordine: firma → Scheda → scadenze (per data)', t.todo.map((x) => x.kind).join() === 'sign,scheda,deadline,deadline' && t.todo[2].date < t.todo[3].date);
  const sign = t.todo[0];
  ok('firma: il link VERO del proprietario', sign.url === 'https://www.boomrome.com/sign?sign=LL-SIGN-TOKEN-123');
  const tuSign = (fn) => withInput('tu', fn).todo.some((x) => x.kind === 'sign');
  ok('firma: contratto di carta → no', !tuSign((i) => { const c = i.contracts[0]; ['tenantSignature', 'tenantSignedAt', 'preAgreementId', 'pdfGeneratedBy', 'signInviteLandlordAt'].forEach((k) => delete c[k]); c.signatureStatus = 'none'; }));
  ok('firma: delega armata → no', !tuSign((i) => { i.contracts[0].landlordDelegate = { name: 'Valentino', at: '2026-09-01T10:00:00Z' }; }));
  ok('firma: sequenziale con co-conduttore non firmato → no', !tuSign((i) => { i.contracts[0].coTenants = [{ name: 'Luca', signedAt: '2026-09-01' }]; }));
  ok('firma: co-conduttore con la firma → sì', tuSign((i) => { i.contracts[0].coTenants = [{ name: 'Luca', signature: 'x' }]; }));
  ok('firma: sequenziale di default (signingOrder assente) col conduttore non firmato → no', !tuSign((i) => { delete i.contracts[0].signingOrder; delete i.contracts[0].tenantSignature; delete i.contracts[0].tenantSignedAt; }));
  ok('firma: «any» senza la firma del conduttore → sì', tuSign((i) => { i.contracts[0].signingOrder = 'any'; delete i.contracts[0].tenantSignature; delete i.contracts[0].tenantSignedAt; }));
  ok('firma: nessun invito e nessuna firma parziale → no', !tuSign((i) => { delete i.contracts[0].signInviteLandlordAt; i.contracts[0].signatureStatus = 'none'; }));
  ok('firma: già firmata → no', !tuSign((i) => { i.contracts[0].landlordSignedAt = '2026-09-21'; }));
  ok('firma: senza token → no', !tuSign((i) => { delete i.contracts[0].landlordSignToken; }));
  redUnder('mp:view-as-url — in «vedi come» nessun link personale',
    (E) => { const v = projection('tu', { viewAs: true, engine: E }); return v.todo.filter((x) => x.kind === 'sign' || x.kind === 'scheda').every((x) => x.url === null) && !JSON.stringify(v).includes('sign?sign='); },
    mutant('view-as-url', 'url: viewAs ? null :', 'url: false ? null :'));
  const vs = B('tu', { viewAs: true });
  ok('«vedi come»: anche la Scheda senza link, e adminNotes presenti', vs.todo.find((x) => x.kind === 'scheda').url === null && vs.adminNotes && Array.isArray(vs.adminNotes.hidden));
  ok('vista del proprietario: nessun adminNotes', !('adminNotes' in B('tu')));
  const sch = t.todo[1];
  ok('Scheda: i mancanti con etichette it/en, il link derivato', sch.missing.length > 3 && sch.missing.every((m) => m.key && m.label.it && m.label.en && m.group) && sch.url === 'https://www.boomrome.com/scheda?t=c1.l.schedatok' && sch.docsOnly === false);
  const after = withInput('tu', (i) => { i.contracts[0].landlordSignature = 'data:image/png;base64,ZZ'; });
  const sch2 = after.todo.find((x) => x.kind === 'scheda');
  ok('Scheda dopo la sua firma: solo i documenti', sch2 && sch2.docsOnly === true && sch2.missing.length >= 1 && sch2.missing.every((m) => m.group === 'docs'));
  ok('Scheda: nessun mancante → nessuna voce', !B('ok').todo.some((x) => x.kind === 'scheda'));
  const dls = t.todo.filter((x) => x.kind === 'deadline');
  ok('scadenze: solo del proprietario, solo pending (quella del conduttore e quella fatta restano fuori)', dls.length === 2 && dls.every((x) => /^dl:dlfin_c1_[01]$/.test(x.id)));
  ok('scadenze: il titolo perde gli importi, mai «€»', dls.every((x) => !/€|\bEUR\b/.test(x.title)) && dls.some((x) => x.title === 'Imposta di bollo (per copia)'));
  ok('scadenze: riferimento di legge e flag overdue', dls[0].legalRef === 'DPR 642/1972' && dls[0].overdue === true && dls[1].overdue === false);
  const win = withInput('tu', (i) => {
    i.deadlines = [{ id: 'dl_old', owner: 'landlord', status: 'pending', date: '2025-09-20', title: 'Vecchia', linkedPropertyId: 'p1' },
      { id: 'dl_edge', owner: 'landlord', status: 'pending', date: '2025-09-23', title: 'Al bordo', linkedPropertyId: 'p1' },
      { id: 'dl_far', owner: 'landlord', status: 'pending', date: '2026-10-23', title: 'Lontana', linkedPropertyId: 'p1' },
      { id: 'dl_other', owner: 'landlord', status: 'pending', date: '2026-10-01', title: 'Altrui', linkedPropertyId: 'p_other' }];
  });
  ok('scadenze: finestra [oggi−365, oggi+30], solo immobili suoi', win.todo.filter((x) => x.kind === 'deadline').map((x) => x.id).join() === 'dl:dl_edge');
  ok('fatto «deadlines» nei prossimi 30 giorni', t.properties[0].facts.some((f) => f.k === 'deadlines' && f.n30 === 1));
}

// ══ Scheda del contratto ════════════════════════════════════════════════
section('La scheda del contratto');
{
  const c = B('ok').properties[0].contracts.current[0];
  const keys = ['id', 'status', 'type', 'unit', 'tenantName', 'coTenantNames', 'startDate', 'endDate', 'daysToEnd', 'rent', 'installmentMonths', 'deposit', 'cedolare', 'renewalOf', 'renewedToId', 'signing', 'sealed', 'certificate', 'stages'];
  ok('ContractCard ha esattamente le chiavi (signing, non signature)', JSON.stringify(Object.keys(c).sort()) === JSON.stringify(keys.slice().sort()));
  ok('nome come da contratto, canone, deposito, cadenza, 131 giorni alla fine', c.tenantName === 'Mario Rossi' && c.rent === 1250 && c.deposit === 2500 && c.installmentMonths === 1 && c.daysToEnd === 131);
  ok('certificato «present» (mai «emailed»), marca temporale sigillata', c.certificate === 'present' && c.sealed.tsr === true && c.sealed.at === '2026-01-11');
  const cedo = (v, canone) => withInput('ok', (i) => { delete i.contracts[0].cedolareSecca; if (v !== undefined) i.contracts[0].cedolareSecca = v; if (canone !== undefined) i.contracts[0].canone = { cedolareSecca: canone }; }).properties[0].contracts.current[0].cedolare;
  ok('cedolare a tre stati: non indicata → null; si → true; no → false; canone.si → true', cedo() === null && cedo('si') === true && cedo('no') === false && cedo(undefined, 'si') === true);
  ok('tipo: 4+4 / ordinaria / libero → 4+4; studenti; 3+2; ignoto → null', ['4+4', 'ordinaria', 'libero'].every((x) => OWNER.contractType(x) === '4+4') && OWNER.contractType('student') === 'studenti' && OWNER.contractType('32') === '3+2' && OWNER.contractType('boh') === null);
  const mail = withInput('ok', (i) => { i.contracts[0].tenantName = 'mario.rossi@example.com'; }).properties[0].contracts.current[0];
  ok('un nome che è un\'email → null', mail.tenantName === null);
  const paper = B('paper').properties[0].contracts.current[0];
  ok('firma non registrata: stato unrecorded, tipo 4+4 da «ordinaria», cedolare non indicata, nessuna bozza', paper.status === 'unrecorded' && paper.type === '4+4' && paper.cedolare === null && !B('paper').archive.some((a) => a.kind === 'draft'));
  const conv = withInput('paper', (i) => { i.contracts[0].pdfGeneratedBy = 'server'; });
  ok('appena convertito (PDF del server, nessun invito) → in attesa delle firme, non carta (ERRATA E4.6)', conv.properties[0].contracts.current[0].status === 'awaiting_signatures' && conv.archive.some((a) => a.kind === 'draft' && a.state === 'bozza'));
}

// ══ Archivio ════════════════════════════════════════════════════════════
section('Archivio, provenienza, fantasmi');
{
  const p = B('ok');
  const by = (ref) => p.archive.find((a) => a.ref === ref);
  ok('firmato: cartella contratto, stato firmato, nato alla firma completa, dal sistema', (() => { const a = by('c:c1:signed'); return a.folder === 'contratto' && a.state === 'firmato' && a.provenance.event === 'firma_completa' && a.provenance.by === 'sistema' && a.file === true; })());
  ok('verbale: consegna, operatore', (() => { const a = by('c:c1:verbale'); return a.folder === 'consegna' && a.provenance.by === 'operatore' && a.state === null; })());
  ok('visura del fascicolo caricata dal proprietario → by proprietario', by('p:p1:dossier-visura').provenance.by === 'proprietario');
  ok('valutazione, scheda, inventario: «ultima versione»', ['p:p1:valutazione', 'c:c1:scheda', 'c:c1:inv-in'].every((r) => by(r).state === 'ultima'));
  ok('bozza assente a firma completa', !p.archive.some((a) => a.kind === 'draft'));
  ok('mai file per certificato, fascicolo, pack, identità, mandato, pass, frame', !p.archive.some((a) => ['certificate', 'tsr', 'fascicolo', 'pack', 'identity', 'mandate', 'landlord-pass', 'inventario-frames'].includes(a.kind)));
  const rs = p.archive.filter((a) => a.kind === 'rendiconto');
  ok('rendiconti: più recente prima; false → not_generated, null → file (il server dirà)', rs.length === 3 && rs[0].ref === 'r:own_1:2026-08' && rs[0].file === true
    && rs.find((a) => a.ref.endsWith('2026-07')).note === 'not_generated' && rs.find((a) => a.ref.endsWith('2026-07')).file === false && rs.find((a) => a.ref.endsWith('2026-06')).file === true);
  ok('rendiconto: titolo col mese, cartella soldi', rs[0].title.it === 'Rendiconto di agosto 2026' && rs[0].title.en === 'August 2026 statement' && rs[0].folder === 'soldi');
  ok('ArchiveItem ha le chiavi pinnate', p.archive.filter((a) => !a.ghost).every((a) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(['at', 'contractId', 'date', 'file', 'folder', 'kind', 'note', 'propertyId', 'provenance', 'ref', 'state', 'title', 'year'])));
  const g = withInput('ok', (i) => { i.contracts[0].signedPdfUrl = null; i.contracts[0].verbaleConsegna = null; i.properties[0].dossier = {}; });
  const kinds = g.archive.filter((a) => a.ghost).map((a) => a.kind).sort().join();
  ok('fantasmi: firmato, APE e verbale mancanti', kinds === 'ape,signed,verbale' && g.archive.filter((a) => a.ghost).every((a) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(['contractId', 'folder', 'ghost', 'kind', 'propertyId', 'reason'])));
  const g2 = withInput('ok', (i) => {
    i.contracts[0].verbaleConsegna = null; i.properties[0].dossier = {};
    i.documents.push({ id: 'd_ape', propertyId: 'p1', category: 'APE prestazione energetica', fileUrl: su('smistatore/2026/ape.pdf') });
    i.documents.push({ id: 'd_verb', propertyId: 'p1', contractId: 'c1', category: 'verbale', fileUrl: su('contracts/c1/verbale-consegna_9.pdf') });
  });
  ok('un documento APE / verbale in archivio spegne il fantasma (ERRATA E4.7)', !g2.archive.some((a) => a.ghost && (a.kind === 'ape' || a.kind === 'verbale')));
  ok('meta.counts', p.meta.counts.properties === 1 && p.meta.counts.contracts === 1 && p.meta.counts.rendiconti === 3 && p.meta.counts.archive === p.archive.filter((a) => !a.ghost).length);
}

// ══ Forma della proiezione ══════════════════════════════════════════════
section('Forma');
{
  const p = B('ok');
  ok('chiavi di primo livello pinnate', JSON.stringify(Object.keys(p).sort()) === JSON.stringify(['archive', 'invoices', 'meta', 'month', 'notes', 'owner', 'properties', 'today', 'todo', 'updated', 'v', 'verdict', 'viewAs']));
  ok('oggi, mese, ora di Roma dall\'input now', p.today === '2026-09-22' && p.month === '2026-09' && p.updated.date === '2026-09-22' && p.updated.time === '10:42');
  ok('proprietario: nome e primo nome', p.owner.name === 'Marco Bianchi' && p.owner.firstName === 'Marco');
  const pp = p.properties[0];
  ok('immobile: chiavi pinnate', JSON.stringify(Object.keys(pp).sort()) === JSON.stringify(['address', 'cadastral', 'contracts', 'dot', 'facts', 'id', 'label', 'maintenance', 'others', 'ribbon', 'rows', 'valuation', 'year']));
  ok('catasto a caselle; valutazione con data, canone e ref', pp.cadastral.foglio === '481' && pp.cadastral.categoria === 'A/2' && pp.valuation.at === '2025-12-20' && pp.valuation.canone === 1300 && pp.valuation.ref === 'p:p1:valutazione');
  const noCat = withInput('ok', (i) => { ['foglio', 'particella', 'sub', 'categoria'].forEach((k) => delete i.properties[0][k]); i.properties[0].cadastralData = 'Foglio 12 part. 34 sub 5 cat. A/3'; }).properties[0].cadastral;
  ok('catasto dal testo libero via FIELDS.parseCadastral', noCat.foglio === '12' && noCat.particella === '34' && noCat.sub === '5' && noCat.categoria === 'A/3');
  ok('catasto assente → null', withInput('ok', (i) => { ['foglio', 'particella', 'sub', 'categoria'].forEach((k) => delete i.properties[0][k]); }).properties[0].cadastral === null);
  const m = pp.maintenance[0];
  ok('interventi: categoria in codice, costo, foto come fatto, niente descrizione', m.category === 'plumbing' && m.cost === 180 && m.hasPhoto === true && m.urgent === false && !('description' in m) && m.openedAt === '2026-09-01' && m.resolvedAt === '2026-09-03');
  ok('categoria di intervento sconosciuta → other', withInput('ok', (i) => { i.maintenance[0].category = 'giardino'; }).properties[0].maintenance[0].category === 'other');
  ok('note: il versamento al proprietario non è tracciato', p.notes.payoutNotTracked === true);
}

// ══ Formattatori ════════════════════════════════════════════════════════
section('Formattatori');
{
  const foglio = readFileSync(path.join(ROOT, 'api/sign/_foglio.js'), 'utf8');
  const line = foglio.split('\n').find((l) => /^const itNum = /.test(l));
  const ref = vm.runInNewContext(line.replace(/^const itNum = /, '(').replace(/;\s*$/, '') + ')');
  const vals = [0, 1, 999, 1000, 1250, 1234567.891, -1250.5, 0.005];
  ok('itNum identico a quello di _foglio.js su ' + JSON.stringify(vals), vals.every((v) => OWNER.itNum(v) === ref(v)));
  ok('eur: null/NaN → ""; it «€ 1.250,00»; en «€1,250.00»', OWNER.eur(null) === '' && OWNER.eur(NaN) === '' && OWNER.eur(undefined) === '' && OWNER.eur(1250) === '€ 1.250,00' && OWNER.eur(1250, { lang: 'en' }) === '€1,250.00' && OWNER.eur(-5, { lang: 'en' }) === '-€5.00');
  ok('enNum e decimali', OWNER.enNum(1234567.891) === '1,234,567.89' && OWNER.itNum(1250, 0) === '1.250');
  ok('date: numerica, lunga, corta, mese — it/en', OWNER.dateNum('2026-09-04') === '04/09/2026' && OWNER.dateLong('2026-09-04', 'it') === '4 settembre 2026' && OWNER.dateLong('2026-09-04', 'en') === '4 September 2026'
    && OWNER.dateShort('2026-09-04', 'it') === '4 set' && OWNER.dateShort('2026-09-04', 'en') === '4 Sep' && OWNER.monthLabel('2026-03', 'it') === 'marzo 2026' && OWNER.monthLabel('2026-03', 'en') === 'March 2026'
    && OWNER.dateNum('boh') === '' && OWNER.monthLabel('2026-13', 'it') === '');
  ok('scrubText: email, telefoni, CF, IBAN → «…»; taglio', OWNER.scrubText('Mario mario@x.it +39 333 1234567 RSSMRA80A01H501U IT60X0542811101000000123456') === 'Mario … … … …'
    && OWNER.scrubText('a'.repeat(100), 10).length === 10 && OWNER.scrubText('   ') === null);
}

// ══ Ricerca ═════════════════════════════════════════════════════════════
section('Ricerca');
{
  const p = withInput('ok', (i) => { i.rendiconti.push({ id: OWNER_UID + '_2026-03', ownerId: OWNER_UID, month: '2026-03', at: '2026-04-01T06:10:00Z' }); });
  const s = (q, lang = 'it') => OWNER.search(p, q, lang);
  ok('«chiavi» → il verbale, col percorso casa › contratto › cartella', (() => { const r = s('chiavi'); return r[0] && r[0].ref === 'c:c1:verbale' && r[0].path.join(' › ') === 'Via Cavour 12 › Contratto 2026–27 › Consegna'; })());
  ok('«marzo 2026» → rendiconto 2026-03 e il mese del nastro', (() => { const r = s('marzo 2026'); return r.some((x) => x.ref === 'r:own_1:2026-03') && r.some((x) => x.type === 'month' && x.id === '2026-03'); })());
  ok('«mar» senza anno → il più recente (2026-03)', s('mar').some((x) => x.ref === 'r:own_1:2026-03'));
  ok('«March 2026» in inglese', s('March 2026', 'en').some((x) => x.ref === 'r:own_1:2026-03'));
  ok('«APE» → il dossier; «imu» → F24 IMU; «valuation» → valutazione', s('APE').some((x) => x.ref === 'p:p1:dossier-ape') && s('imu').some((x) => x.ref === 'd:d_f24') && s('valuation', 'en').some((x) => x.ref === 'p:p1:valutazione'));
  ok('«énergie» con accenti normalizzati → nessun errore; «Cavour» → l\'immobile', Array.isArray(s('énergie')) && s('Cavour').some((x) => x.type === 'property' && x.id === 'p1'));
  ok('«Rossi» → il contratto', s('rossi').some((x) => x.type === 'contract' && x.id === 'c1'));
  ok('vuoto → []; al massimo 30', s('').length === 0 && OWNER.search(p, 'a', 'it').length <= 30);
}

// ══ La revisione avversariale del 23/09 ═════════════════════════════════
// Un controllo per difetto confermato, ognuno verde sul motore vero e ROSSO
// col difetto rimesso al suo punto di mutazione.
section('Revisione 23/09: segnato come affittato (availabilityStatus)');
{
  const rentedMark = (i) => { delete i.properties[0].status; i.properties[0].availabilityStatus = 'rented'; i.contracts = []; i.payments = []; i.documents = []; i.invoices = []; };
  const staleStatus = (i) => { i.properties[0].status = 'rented'; i.properties[0].availabilityStatus = 'available'; i.contracts = []; i.payments = []; i.documents = []; i.invoices = []; };
  const check = (E) => {
    const a = projection('ok', { engine: E, mutate: rentedMark }), b = projection('ok', { engine: E, mutate: staleStatus });
    return a.verdict.state === 'nonso' && a.verdict.reasons.some((r) => r.code === 'rented_without_contract') && a.properties[0].facts[0].k === 'no_lease'
      && b.verdict.state === 'ok' && !b.verdict.reasons.some((r) => r.code === 'rented_without_contract') && b.properties[0].facts[0].k === 'vacant';
  };
  redUnder('mp:availability — «Affittato» dal portal (availabilityStatus) vince su uno status stantio', check,
    mutant('availability', 'key(p.availabilityStatus);', "'';"));
  ok('availabilityStatus assente → vale ancora status (rented senza contratto → no_lease)',
    withInput('ok', (i) => { i.contracts = []; i.payments = []; }).properties[0].facts[0].k === 'no_lease');
}

section('Revisione 23/09: il contratto cessato finisce alla cessazione');
{
  // terminateContract del portal: status terminated + terminatedAt, endDate
  // e rate generate restano come erano.
  const term = (i) => { const c = i.contracts[0]; c.status = 'terminated'; c.terminatedAt = '2026-06-30'; i.properties[0].status = 'vacant';
    i.payments = i.payments.map((p) => (p.month && p.month > '2026-06') ? { ...p, status: 'pending', paidDate: undefined, paidVia: undefined } : p); };
  const onlyPaid = (i) => { const c = i.contracts[0]; c.status = 'terminated'; c.terminatedAt = '2026-06-30'; i.properties[0].status = 'vacant';
    i.payments = i.payments.filter((p) => !p.month || p.month <= '2026-06'); };
  const past = (q) => q.properties[0].contracts.past[0];
  const st = (c, k) => c.stages.find((s) => s.key === k);
  redUnder('mp:terminated-days — un cessato non dice «mancano 131 giorni»',
    (E) => { const c = past(projection('ok', { engine: E, mutate: onlyPaid })); return c.daysToEnd === -84; },
    mutant('terminated-days', 'effEnd ? daysBetween(today, effEnd) : null,', 'end ? daysBetween(today, end) : null,'));
  redUnder('mp:terminated-end — la tappa «Fine» scritta non si disegna, l\'aereo non ci va',
    (E) => { const c = past(projection('ok', { engine: E, mutate: onlyPaid })); return !st(c, 'fine') && st(c, 'cessazione').state === 'done' && st(c, 'cessazione').date === '2026-06-30' && !c.stages.some((s) => s.state === 'now'); },
    mutant('terminated-end', '!(terminated && (!term || term < end))', 'true'));
  redUnder('mp:terminated-ribbon — dopo la cessazione il nastro è «fuori», non «nessuna rata a sistema»',
    (E) => { const m = projection('ok', { engine: E, mutate: onlyPaid }).properties[0].ribbon.months; return ['2026-07', '2026-08', '2026-09', '2026-10'].every((ym) => m.find((x) => x.ym === ym).state === 'fuori') && m.find((x) => x.ym === '2026-06').state === 'paid'; },
    mutant('terminated-ribbon', 'effectiveEnd(c).slice(0, 7)', 'str(c.endDate).slice(0, 7)'));
  redUnder('mp:after-termination — le rate dopo la cessazione non sono «in ritardo» ma da verificare (nonso)',
    (E) => {
      const q = projection('ok', { engine: E, mutate: term }), pp = q.properties[0];
      const after = pp.rows.filter((r) => r.month > '2026-06');
      return q.verdict.state === 'nonso' && !q.verdict.reasons.some((r) => r.code === 'rent_overdue')
        && q.verdict.reasons.filter((r) => r.code === 'charges_after_termination').length === 1
        && q.verdict.reasons.some((r) => r.code === 'charges_after_termination' && r.date === '2026-06-30' && r.contractId === 'c1')
        && after.length > 0 && after.every((r) => r.state === 'unknown' && r.afterEnd === '2026-06-30' && r.overdueDays === null)
        && ['2026-07', '2026-08', '2026-09'].every((ym) => pp.ribbon.months.find((x) => x.ym === ym).state === 'unknown')
        && pp.facts[0].k === 'vacant';
    },
    mutant('after-termination', "['overdue', 'due', 'unknown'].indexOf(r.state) >= 0", 'false'));
  const paidAfter = withInput('ok', (i) => { term(i); const x = i.payments.find((p) => p.month === '2026-07'); x.status = 'paid'; x.paidDate = '2026-07-04'; x.paidVia = 'stripe'; });
  ok('una rata PAGATA dopo la cessazione resta un fatto: pagata, senza bandierina', paidAfter.properties[0].rows.find((r) => r.month === '2026-07').state === 'paid'
    && paidAfter.properties[0].rows.find((r) => r.month === '2026-07').afterEnd === null);
  const future = past(withInput('ok', (i) => { i.contracts[0].status = 'terminated'; i.contracts[0].terminatedAt = '2026-10-31'; }));
  ok('cessazione futura: la tappa è l\'aereo con la sua data, «Fine» scritta non c\'è, i giorni contano fino alla cessazione',
    st(future, 'cessazione').state === 'now' && st(future, 'cessazione').date === '2026-10-31' && !st(future, 'fine') && future.daysToEnd === 39);
  const noDate = past(withInput('ok', (i) => { i.contracts[0].status = 'terminated'; delete i.contracts[0].terminatedAt; }));
  ok('cessato senza data: «Cessato» non registrato (mai una data inventata), niente «Fine», niente giorni',
    st(noDate, 'cessazione').state === 'unknown' && st(noDate, 'cessazione').date === null && !st(noDate, 'fine') && noDate.daysToEnd === null);
  const late = past(withInput('ok', (i) => { i.contracts[0].status = 'terminated'; i.contracts[0].terminatedAt = '2027-03-01'; }));
  ok('cessazione DOPO la fine scritta: la fine resta quella del contratto', st(late, 'fine') && late.daysToEnd === 131);

  // Chiusura del 23/09: cessato SENZA terminatedAt (o con una data che non si
  // legge). Non si sa da quando: le rate ancora aperte di quel contratto non
  // sono «in ritardo» né «in scadenza», sono da verificare — nonso,
  // charges_after_termination senza data — e la riga lo dice.
  const undated = (i) => { const c = i.contracts[0]; c.status = 'terminated'; delete c.terminatedAt; i.properties[0].status = 'vacant';
    i.payments = i.payments.map((p) => (p.month && p.month > '2026-06') ? { ...p, status: 'pending', paidDate: undefined, paidVia: undefined } : p); };
  redUnder('mp:terminated-undated — cessato senza data: nessuna rata «in ritardo», tutte da verificare (nonso), la cella non è «overdue»',
    (E) => {
      const q = projection('ok', { engine: E, mutate: undated }), pp = q.properties[0];
      const open = pp.rows.filter((r) => r.month > '2026-06'), paid = pp.rows.filter((r) => r.month <= '2026-06');
      const cat = q.verdict.reasons.filter((r) => r.code === 'charges_after_termination');
      return q.verdict.state === 'nonso' && !q.verdict.reasons.some((r) => r.code === 'rent_overdue' || r.code === 'rent_state_unknown')
        && cat.length === 1 && cat[0].contractId === 'c1' && !('date' in cat[0])
        && open.length > 0 && open.every((r) => r.state === 'unknown' && r.afterEnd === null && r.afterTermination === true && r.overdueDays === null)
        && paid.length > 0 && paid.every((r) => r.state === 'paid' && r.afterTermination === false)
        && ['2026-07', '2026-08', '2026-09'].every((ym) => pp.ribbon.months.find((x) => x.ym === ym).state === 'unknown');
    },
    mutant('terminated-undated', 'terminatedUndated(c)', 'false'));
  const bad = withInput('ok', (i) => { undated(i); i.contracts[0].terminatedAt = 'non-una-data'; });
  ok('terminatedAt illeggibile = senza data: stesse rate da verificare, nessun rent_overdue', bad.verdict.state === 'nonso'
    && !bad.verdict.reasons.some((r) => r.code === 'rent_overdue') && bad.properties[0].rows.filter((r) => r.month > '2026-06').every((r) => r.afterTermination));
  const depU = withInput('ok', (i) => { undated(i); const d = i.payments.find((p) => p.id === 'depbal_c1'); d.status = 'pending'; delete d.paidDate; delete d.paidVia; });
  ok('anche il saldo deposito aperto di un cessato senza data: da verificare, mai charge_overdue', depU.verdict.state === 'nonso'
    && !depU.verdict.reasons.some((r) => r.code === 'charge_overdue') && depU.properties[0].others.find((r) => r.id === 'depbal_c1').afterTermination === true);
  const dated = withInput('ok', term);
  ok('con la data: le righe dopo la cessazione portano afterTermination E la data; quelle prima no', dated.properties[0].rows.filter((r) => r.month > '2026-06').every((r) => r.afterTermination === true && r.afterEnd === '2026-06-30')
    && dated.properties[0].rows.filter((r) => r.month <= '2026-06').every((r) => r.afterTermination === false));
  const active = B('ok');
  ok('un contratto attivo non è mai «cessato senza data»: nessuna riga afterTermination', active.properties[0].rows.every((r) => r.afterTermination === false));
}

section('Revisione 23/09: gli altri addebiti contano nel verdetto');
{
  const depLate = (i) => { const d = i.payments.find((p) => p.id === 'depbal_c1'); d.status = 'pending'; delete d.paidDate; delete d.paidVia; };
  redUnder('mp:others-reasons — saldo deposito scaduto da 233 giorni: osservo, mai «Tutto in ordine»',
    (E) => { const q = projection('ok', { engine: E, mutate: depLate }); const r = q.verdict.reasons.find((x) => x.code === 'charge_overdue');
      return q.verdict.state === 'osservo' && q.properties[0].dot === 'osservo' && r && r.what === 'deposit-balance' && r.days === 233 && r.paymentId === 'depbal_c1'; },
    mutant('others-reasons', 'others.forEach(', '[].forEach('));
  ok('la frase: «Saldo deposito in ritardo da 233 giorni.» / «Deposit balance is 233 days late.»',
    OWNER.t('verdict.osservo.charge_overdue', 'it', { what: OWNER.t('money.deposit_balance', 'it'), days: 233 }) === 'Saldo deposito in ritardo da 233 giorni.'
    && OWNER.t('verdict.osservo.charge_overdue', 'en', { what: OWNER.t('money.deposit_balance', 'en'), days: 233 }) === 'Deposit balance is 233 days late.');
  const weird = withInput('ok', (i) => { i.payments.push({ id: 'x_other', contractId: 'c1', propertyId: 'p1', type: 'utilities', amount: null, dueDate: '2026-08-01', status: 'weird' }); });
  ok('un altro addebito senza stato né importo → nonso (charge_state_unknown + charge_amount_missing)', weird.verdict.state === 'nonso'
    && ['charge_state_unknown', 'charge_amount_missing'].every((c) => weird.verdict.reasons.some((r) => r.code === c && r.what === 'other')));
  const rep = withInput('ok', (i) => { const d = i.payments.find((p) => p.id === 'depbal_c1'); d.status = 'pending'; d.tenantReportedAt = '2026-09-06T10:00:00Z'; d.tenantReported = true; delete d.paidDate; delete d.paidVia; });
  ok('saldo deposito con bonifico segnalato → osservo (charge_reported)', rep.verdict.state === 'osservo' && rep.verdict.reasons.some((r) => r.code === 'charge_reported'));
  ok('saldo deposito pagato (caso ok) → nessun motivo, «Tutto in ordine»', B('ok').verdict.state === 'ok' && !B('ok').verdict.reasons.some((r) => /^charge/.test(r.code)));
}

section('Revisione 23/09 (chiusa): «in attesa delle firme» solo con una prova del giro digitale');
{
  // Un contratto del portal mai firmato: token coniati, nessuna firma, nessun invito.
  const fresh = (i) => { const c = i.contracts[0];
    ['tenantSignature', 'landlordSignature', 'tenantSignedAt', 'landlordSignedAt', 'fullySignedAt', 'finalizedAt', 'preAgreementId', 'pdfGeneratedBy',
      'signedPdfUrl', 'signingCertificateUrl', 'timestampTsrUrl', 'schedaCanoneUrl', 'verbaleConsegna', 'inventario'].forEach((k) => delete c[k]);
    c.signatureStatus = 'none'; c.startDate = '2026-10-01'; c.endDate = '2027-09-30'; i.payments = []; };
  // Il clone di un rinnovo (renewContract): firme azzerate, renewalOf. Senza
  // token, perché il controllo isoli la traccia del rinnovo.
  const clone = (i) => { const old = i.contracts[0]; delete old.preAgreementId; delete old.pdfGeneratedBy;
    old.status = 'renewed'; old.renewedToId = 'c2'; old.startDate = '2025-10-01'; old.endDate = '2026-09-30';
    const c = JSON.parse(JSON.stringify(old));
    ['tenantSignature', 'landlordSignature', 'tenantSignedAt', 'landlordSignedAt', 'tenantSignedIP', 'fullySignedAt', 'finalizedAt', 'signingCertificateUrl', 'signedPdfUrl',
      'registrationPackUrl', 'fascicoloFiscaleUrl', 'schedaCanoneUrl', 'schedaCanoneAt', 'rliRegisteredAt', 'generatedPDF', 'tenantMandate', 'renewedToId', 'tenantSignToken', 'landlordSignToken'].forEach((k) => delete c[k]);
    Object.assign(c, { id: 'c2', startDate: '2026-10-01', endDate: '2027-09-30', status: 'active', signatureStatus: 'none', renewalOf: 'c1', createdAt: '2026-09-15T10:00:00Z', generatedPDF: su('contracts/c2/contract.pdf') });
    i.contracts = [old, c]; };
  const cur = (q) => q.properties[0].contracts.current[0];
  // Chiusura del 23/09: i token coniati NON provano un giro digitale
  // (saveContract li conia sempre, anche per un contratto firmato su carta):
  // senza un'altra prova lo stato è neutro, mai «in attesa delle firme». La
  // mutazione rimette i token fra le prove e il controllo deve cadere.
  redUnder('mp:renewal-unsigned (token rimessi fra le prove) — token coniati e nessun\'altra traccia → «firma non registrata a sistema», non «in attesa delle firme»',
    (E) => { const q = projection('ok', { engine: E, mutate: fresh }); const c = cur(q);
      return c.status === 'unrecorded' && q.verdict.state === 'nonso' && !q.verdict.reasons.some((r) => r.code === 'lease_unsigned')
        && q.verdict.reasons.some((r) => r.code === 'signature_unrecorded' && r.contractId === 'c1')
        && !q.archive.some((a) => a.kind === 'draft') && !c.stages.some((s) => s.key === 'firma_conduttore' || s.key === 'firma_proprietario'); },
    mutant('renewal-unsigned', 'has(c.renewalOf)', 'has(c.renewalOf) || has(c.tenantSignToken) || has(c.landlordSignToken)'));
  // Le prove POSITIVE, una per una: ognuna da sola accende «in attesa delle firme».
  const EVIDENCE = { signInviteTenantAt: '2026-09-15T10:00:00Z', signInviteLandlordAt: '2026-09-15T10:00:00Z', preAgreementId: 'pa9', pdfGeneratedBy: 'server',
    tenantSignedAt: '2026-09-16T10:00:00Z', tenantSignature: 'data:image/png;base64,QQ', signatureStatus: 'partial' };
  const each = Object.keys(EVIDENCE).map((k) => [k, cur(withInput('ok', (i) => { fresh(i); i.contracts[0][k] = EVIDENCE[k]; })).status]);
  ok('ogni prova positiva da sola → «in attesa delle firme» (' + each.map((x) => x[0]).join(', ') + ')', each.every((x) => x[1] === 'awaiting_signatures'));
  const coSigned = withInput('ok', (i) => { fresh(i); i.contracts[0].coTenants = [{ name: 'Luca', signedAt: '2026-09-16T10:00:00Z' }]; });
  ok('anche la firma di un co-conduttore è una prova', cur(coSigned).status === 'awaiting_signatures');
  const noTokens = withInput('ok', (i) => { fresh(i); delete i.contracts[0].tenantSignToken; delete i.contracts[0].landlordSignToken; });
  const innesto = withInput('ok', (i) => { fresh(i); i.contracts[0].source = 'innesto'; });
  ok('senza token, o import dell\'Innesto: stesso stato neutro e stesso motivo', [noTokens, innesto].every((q) => cur(q).status === 'unrecorded'
    && q.verdict.state === 'nonso' && q.verdict.reasons.some((r) => r.code === 'signature_unrecorded')));
  redUnder('mp:signature-unrecorded — senza firma registrata il verdetto non è «Tutto in ordine»: nonso, «La firma del contratto non risulta a sistema: BOOM verifica.»',
    (E) => { const q = projection('paper', { engine: E }); return q.verdict.state === 'nonso' && q.properties[0].dot === 'nonso'
      && q.verdict.reasons.some((r) => r.code === 'signature_unrecorded' && r.contractId === 'cp' && r.propertyId === 'p1'); },
    mutant('signature-unrecorded', "cst === 'unrecorded'", 'false'));
  ok('la frase del motivo: IT «La firma del contratto non risulta a sistema: BOOM verifica.» / EN',
    OWNER.t('reason.signature_unrecorded', 'it') === 'La firma del contratto non risulta a sistema: BOOM verifica.'
    && OWNER.t('reason.signature_unrecorded', 'en') === 'The lease signature isn’t recorded in the system: BOOM is checking.');
  {
    // Nessuna superficie afferma una firma non registrata: né l'hero (il
    // verdetto), né le tappe (niente «firmato» fatto), né l'archivio (niente
    // contratto firmato, niente fantasma «Contratto firmato»), né il «da fare».
    const q = B('paper'), c = cur(q), s = JSON.stringify(q);
    const said = (lang) => [OWNER.t('verdict.' + q.verdict.state, lang)].concat(q.verdict.reasons.map((r) => OWNER.t('reason.' + r.code, lang, r)))
      .concat(c.stages.map((x) => OWNER.t('stage.' + x.key, lang) + ' ' + (x.note ? OWNER.t('note.' + x.note, lang) : '') + ' ' + x.state)).join(' | ');
    ok('firma non registrata: verdetto nonso, nessuna tappa «firmato» fatta, nessun documento firmato né fantasma, nessuna firma da fare',
      q.verdict.state === 'nonso' && !c.stages.some((x) => x.key === 'firmato' && x.state === 'done')
      && !q.archive.some((a) => a.kind === 'signed' || (a.ghost && a.kind === 'signed')) && !q.todo.some((x) => x.kind === 'sign')
      && c.signing.fullyAt === null && c.signing.tenantAt === null && c.signing.landlordAt === null);
    ok('nessuna parola che affermi una firma: niente «firmato su carta», «firmato da», «signed on paper» nelle frasi della proiezione',
      !/firmato su carta|firmato da|Tutto in ordine/i.test(said('it')) && !/signed on paper|signed by|All in order/i.test(said('en')) && !/"status":"signed"/.test(s));
  }
  redUnder('mp:renewal-unsigned — il clone non firmato di un rinnovo è «in attesa delle firme», con la bozza',
    (E) => { const q = projection('ok', { engine: E, mutate: clone }); return cur(q).id === 'c2' && cur(q).status === 'awaiting_signatures' && q.archive.some((a) => a.ref === 'c:c2:draft') && q.verdict.state !== 'ok'; },
    mutant('renewal-unsigned', 'has(c.renewalOf)', 'false'));
  // Il PDF del server appena convertito, nessun invito, nessuna firma dovuta a lui.
  const conv = (i) => { const c = i.contracts[0]; ['tenantSignature', 'tenantSignedAt', 'preAgreementId', 'signInviteLandlordAt', 'landlordSignToken'].forEach((k) => delete c[k]); c.signatureStatus = 'none'; };
  redUnder('mp:lease-unsigned — un contratto in corso che aspetta firme non è «Tutto in ordine» (nonso)',
    (E) => { const q = projection('tu', { engine: E, mutate: conv }); return cur(q).status === 'awaiting_signatures' && !q.todo.some((x) => x.kind === 'sign')
      && q.verdict.reasons.some((r) => r.code === 'lease_unsigned' && r.contractId === 'c1'); },
    mutant('lease-unsigned', "cst === 'awaiting_signatures'", 'false'));
  const tu = B('tu');
  ok('con la SUA firma da mettere il verdetto è «serve te», e lease_unsigned non si ripete', tu.verdict.state === 'tu' && !tu.verdict.reasons.some((r) => r.code === 'lease_unsigned'));
  const paper = B('paper');
  ok('lo scenario «paper» (token coniati, nessuna prova): «firma non registrata a sistema», nessun lease_unsigned', cur(paper).status === 'unrecorded'
    && !paper.verdict.reasons.some((r) => r.code === 'lease_unsigned'));
  ok('lo stato neutro non afferma una firma: «firma non registrata a sistema» / «signature not recorded in the system»',
    OWNER.t('status.unrecorded', 'it') === 'firma non registrata a sistema' && OWNER.t('status.unrecorded', 'en') === 'signature not recorded in the system'
    && OWNER.t('note.firma_non_registrata', 'it') === 'firma non registrata a sistema'
    // «firmato su carta» esiste SOLO come stato registrato dallo staff
    // (status.signed_paper, note.su_carta): mai in una frase dello stato neutro.
    && Object.keys(OWNER.STRINGS.it).filter((k) => /firmato su carta/.test(OWNER.STRINGS.it[k])).sort().join() === 'note.su_carta,status.signed_paper'
    && Object.keys(OWNER.STRINGS.en).filter((k) => /signed on paper/.test(OWNER.STRINGS.en[k])).sort().join() === 'note.su_carta,status.signed_paper');
  ok('fatto del contratto: «Contratto fino al … · firma non registrata a sistema»',
    OWNER.t('facts.lease_unrecorded', 'it', { date: '31 maggio 2029' }) === 'Contratto fino al 31 maggio 2029 · firma non registrata a sistema'
    && OWNER.t('facts.lease_unrecorded', 'en', { date: '31 May 2029' }) === 'Lease until 31 May 2029 · signature not recorded in the system');
}

section('Chiusura 23/09: la firma su carta REGISTRATA dallo staff (paperSigned)');
{
  // Il portal («✓ Firmato su carta») scrive paperSigned {at, by, recordedAt}:
  // il giorno della firma, chi l'ha registrata, quando. È una dichiarazione
  // di BOOM, non una firma digitale: la pagina lo dice («firmato su carta,
  // registrato da BOOM») e non inventa le firme delle parti.
  const PS = { at: '2025-05-20', by: 'adm', recordedAt: '2026-09-23T10:00:00Z' };
  const paperOn = (extra) => (i) => { i.contracts[0].paperSigned = { ...PS, ...(extra || {}) }; };
  const cur = (q) => q.properties[0].contracts.current[0];
  redUnder('mp:paper-signed — firmato su carta: stato «signed_paper», tappa «Firmato» fatta col giorno della carta, niente signature_unrecorded',
    (E) => { const q = projection('paper', { engine: E, mutate: paperOn() }), c = cur(q);
      const f = c.stages.find((s) => s.key === 'firmato');
      return c.status === 'signed_paper' && f && f.state === 'done' && f.date === '2025-05-20' && f.note === 'su_carta'
        && c.signing.paperAt === '2025-05-20' && c.signing.tenantAt === null && c.signing.landlordAt === null && c.signing.fullyAt === null
        && !c.stages.some((s) => s.key === 'firma_conduttore' || s.key === 'firma_proprietario')
        && !q.verdict.reasons.some((r) => r.code === 'signature_unrecorded' || r.code === 'lease_unsigned'); },
    mutant('paper-signed', 'at;', "'';"));
  const q1 = withInput('paper', paperOn());
  const reg = cur(q1).stages.find((s) => s.key === 'registrazione');
  ok('firmato su carta da oltre 30 giorni, registrazione mai segnata: tappa «esito non registrato», verdetto nonso SOLO per la registrazione',
    reg && reg.state === 'unknown' && reg.note === 'esito_non_registrato' && q1.verdict.state === 'nonso'
    && q1.verdict.reasons.map((r) => r.code).join() === 'registration_unknown');
  ok('niente bozza (il PDF del sistema non è quello firmato), niente firma da chiedergli, niente Scheda da compilare',
    !q1.archive.some((a) => a.kind === 'draft') && !q1.todo.some((x) => x.kind === 'sign' || x.kind === 'scheda'));
  const q2 = withInput('paper', (i) => { paperOn()(i); i.contracts[0].rliRegisteredAt = '2025-06-10'; });
  ok('firmato su carta E registrato: «Tutto in ordine», la tappa di registrazione fatta', q2.verdict.state === 'ok' && q2.verdict.reasons.length === 0
    && cur(q2).stages.find((s) => s.key === 'registrazione').state === 'done');
  ok('le parole: «firmato su carta» / «signed on paper», la nota dice chi lo afferma',
    OWNER.t('status.signed_paper', 'it') === 'firmato su carta' && OWNER.t('status.signed_paper', 'en') === 'signed on paper'
    && OWNER.t('note.su_carta', 'it') === 'firmato su carta, registrato da BOOM' && OWNER.t('note.su_carta', 'en') === 'signed on paper, recorded by BOOM'
    && OWNER.t('facts.lease', 'it', { status: OWNER.t('status.signed_paper', 'it'), date: '31 maggio 2029' }) === 'Contratto firmato su carta fino al 31 maggio 2029');
  const noBy = withInput('paper', paperOn({ by: '' })), badAt = withInput('paper', paperOn({ at: '20/05/2025' })), noAt = withInput('paper', paperOn({ at: null }));
  ok('senza autore, o con un giorno illeggibile: non vale — resta «firma non registrata a sistema»', [noBy, badAt, noAt].every((q) => cur(q).status === 'unrecorded'
    && q.verdict.reasons.some((r) => r.code === 'signature_unrecorded') && cur(q).signing.paperAt === null));
  const done = withInput('ok', paperOn());
  ok('a firma digitale completa, la carta non cambia niente: «firmato», nessun paperAt', cur(done).status === 'signed' && cur(done).signing.paperAt === null
    && cur(done).stages.find((s) => s.key === 'firmato').note === null);
  // Un giro digitale lasciato a metà (invito al proprietario, conduttore
  // firmato) e poi chiuso su carta: la carta vince, niente «serve la tua firma».
  const half = withInput('tu', (i) => { i.contracts[0].paperSigned = { ...PS }; });
  ok('giro digitale a metà poi firmato su carta: niente firma da chiedergli, stato «firmato su carta»', cur(half).status === 'signed_paper'
    && !half.todo.some((x) => x.kind === 'sign') && !half.verdict.reasons.some((r) => r.code === 'sign_needed'));
  const hole = withInput('paper', (i) => { paperOn()(i); i.payments = i.payments.filter((p) => p.month !== '2026-09'); });
  ok('firmato su carta e in corso: la rata del mese che manca si vede (installments_missing)', hole.verdict.reasons.some((r) => r.code === 'installments_missing' && r.contractId === 'cp'));
  // Il rinnovo: la carta del contratto vecchio non firma il nuovo. Se un
  // paperSigned arriva sul rinnovo registrato PRIMA della sua nascita (una
  // copia), non vale; registrato dopo, sì.
  const renew = (recordedAt) => (i) => { const old = i.contracts[0]; old.paperSigned = { ...PS }; old.status = 'renewed'; old.renewedToId = 'cq'; old.endDate = '2026-05-31';
    const c = JSON.parse(JSON.stringify(old));
    Object.assign(c, { id: 'cq', startDate: '2026-06-01', endDate: '2030-05-31', status: 'active', renewalOf: 'cp', createdAt: '2026-05-20T09:00:00Z', paperSigned: { ...PS, recordedAt } });
    delete c.renewedToId; i.contracts = [old, c]; };
  redUnder('mp:paper-renewal — un paperSigned registrato PRIMA della nascita del rinnovo non firma il rinnovo',
    (E) => { const q = projection('paper', { engine: E, mutate: renew('2025-05-21T10:00:00Z') }); return cur(q).id === 'cq' && cur(q).status === 'awaiting_signatures' && cur(q).signing.paperAt === null; },
    mutant('paper-renewal', 'c.renewalOf', 'false'));
  const rOk = withInput('paper', renew('2026-06-02T10:00:00Z'));
  ok('...registrato DOPO la nascita del rinnovo, sì: «firmato su carta»', cur(rOk).id === 'cq' && cur(rOk).status === 'signed_paper');
  ok('assertClean passa con la firma su carta (nessun campo nuovo sporco)', OWNER.assertClean(q1).ok && OWNER.assertClean(rOk).ok);
  // I buchi del cartaceo si dicono (revisione del 23/09): la copia firmata
  // non nasce a sistema e il verbale non c'è — fantasmi «non ancora in
  // archivio», che non cambiano il verdetto.
  redUnder('mp:paper-ghost — firmato su carta senza copia in archivio: fantasma «Contratto firmato: non ancora in archivio»',
    (E) => { const q = projection('paper', { engine: E, mutate: (i) => { paperOn()(i); i.contracts[0].rliRegisteredAt = '2025-06-10'; } });
      return q.verdict.state === 'ok' && q.archive.some((a) => a.ghost && a.kind === 'signed' && a.contractId === 'cp'); },
    mutant('paper-ghost', '!docItems.some(', 'false && !docItems.some('));
  const scan = withInput('paper', (i) => { paperOn()(i); i.documents = (i.documents || []).concat([{ id: 'dscan', propertyId: 'p1', contractId: 'cp',
    category: 'Contratto locazione', fileUrl: su('contracts/cp/scansione-contratto.pdf'), storagePath: 'contracts/cp/scansione-contratto.pdf', name: 'Contratto firmato (scansione)', createdAt: '2025-05-21T10:00:00Z' }]); });
  ok('...con la scansione caricata come «Contratto di locazione» il fantasma sparisce', !scan.archive.some((a) => a.ghost && a.kind === 'signed'));
  const ver = withInput('paper', (i) => { paperOn()(i); i.contracts[0].rliRegisteredAt = '2025-06-10'; });
  ok('firmato su carta e iniziato, senza verbale: fantasma «Verbale di consegna» (prima solo sui firmati digitali)',
    ver.archive.some((a) => a.ghost && a.kind === 'verbale' && a.contractId === 'cp') && ver.verdict.state === 'ok');
}

section('Revisione 23/09: scrubText neutralizza ciò che assertClean rifiuta');
{
  const REVIEW = ['Data: 12/09 — perdita sotto il lavello', 'DATA: consegna chiavi', 'data: foo', 'Data: visura aggiornata', 'Scansione_001234567.pdf',
    'Pratica +1234567', 'SCN_20260912_000123456.pdf', 'PXL_20260912_004512345.jpg', 'Prot. 001234567 ricevuta', '0012345678 fattura', 'Tel +39 333 1234567',
    'vedi https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media&token=abc', 'ricevuta https://pay.stripe.com/receipts/x', 'link https://x.it/f?token=zz'];
  const check = (E) => REVIEW.every((s) => { const x = E.scrubText(s, 80); return typeof x === 'string' && x.length > 0 && E.assertClean({ title: x }).ok; });
  redUnder('mp:scrub-rules — le stringhe della revisione escono leggibili E pulite (niente 500)', check,
    mutant('scrub-rules', 'TEXT_PATTERNS.forEach(', '[].forEach('));
  redUnder('mp:scrub-data — «Data: …» (l\'italiano di «Date:») resta testo, mai un data: URI',
    (E) => { const x = E.scrubText('Data: 12/09 — perdita sotto il lavello', 80); return x === 'Data – 12/09 — perdita sotto il lavello'; },
    mutant('scrub-data', "x.replace(/^(data)\\s*:/i, '$1 –');", 'x;'));
  ok('«?token=…» fuori da un URL se ne va col suo valore', OWNER.scrubText('Via Cavour 12?token=SEGRETO-XYZ') === 'Via Cavour 12…');
  ok('un vero data: URI non è testo → null', OWNER.scrubText('data:image/png;base64,AAAA') === null && OWNER.scrubText(' DATA:text/plain,ciao') === null);
  ok('il file resta riconoscibile: «Scansione_….pdf», «Pratica …»', OWNER.scrubText('Scansione_001234567.pdf') === 'Scansione_….pdf' && OWNER.scrubText('Pratica +1234567') === 'Pratica …');
  // L'invariante, a caso: qualunque cosa scrubText lasci passare, assertClean la accetta.
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const bits = ['Data:', 'data:', ' ', '+', '00', '3', '1234567', '333 1234567', 'mario@x.it', 'RSSMRA80A01H501U', 'IT60X0542811101000000123456',
    'https://firebasestorage.googleapis.com/x', '?token=', 'pay.stripe.com', 'Via ', 'Cavour', '_', '.pdf', '12/09', '€ 1.250,00', 'a', 'B'];
  let bad = 0;
  for (let n = 0; n < 3000; n++) {
    let s = ''; const k = 1 + rnd(6); for (let j = 0; j < k; j++) s += bits[rnd(bits.length)];
    const x = OWNER.scrubText(s, 80);
    if (x !== null && !OWNER.assertClean({ t: x }).ok) bad++;
  }
  ok('3000 stringhe a caso: ciò che scrubText lascia uscire passa sempre assertClean', bad === 0);
  // Il giro vero: titolo di manutenzione e nome di un documento suo.
  const q = withInput('ok', (i) => { i.maintenance[0].title = 'Data: 12/09 — perdita sotto il lavello';
    const d = i.documents.find((x) => x.id === 'd_mine'); d.name = 'Scansione_001234567.pdf'; d.category = 'documento'; });
  ok('proiezione con «Data: …» e «…_001234567.pdf»: assertClean ok e i testi ci sono', OWNER.assertClean(q).ok
    && q.properties[0].maintenance[0].title.startsWith('Data – 12/09') && q.archive.some((a) => a.ref === 'd:d_mine' && a.title.it === 'Scansione_….pdf'));
}

section('Revisione 23/09: le stanze — di chi è la rata');
{
  const lateA = (i) => { const x = i.payments.find((p) => p.id === 'pay_cA_2026-09'); x.status = 'pending'; delete x.paidDate; delete x.paidVia; };
  redUnder('mp:rooms-label — con più contratti ogni rata porta interno e nome del contratto, e il fatto del mese pure',
    (E) => {
      const q = projection('rooms', { engine: E, mutate: lateA }), pp = q.properties[0];
      const a = pp.rows.find((r) => r.id === 'pay_cA_2026-09'), b = pp.rows.find((r) => r.id === 'pay_cB_2026-09');
      const f = pp.facts.find((x) => x.k === 'month'), ro = q.verdict.reasons.find((r) => r.code === 'rent_overdue');
      return a.contractId === 'cA' && a.unit === 'A' && a.tenantName === 'Anna Verdi' && b.contractId === 'cB' && b.unit === 'B' && b.tenantName === 'Bruno Neri'
        && f && f.state === 'overdue' && f.unit === 'A' && f.tenantName === 'Anna Verdi' && ro.unit === 'A';
    },
    mutant('rooms-label', 'multi && rc ? scrubText(rc.unit, 20) : null,', 'null,'));
  const one = B('ok').properties[0].rows[0];
  ok('un contratto solo: la rata porta il contratto ma non ripete interno e nome', one.contractId === 'c1' && one.unit === null && one.tenantName === null);
  const mail = withInput('rooms', (i) => { i.contracts[0].tenantName = 'anna@example.com'; }).properties[0].rows.find((r) => r.contractId === 'cA');
  ok('un nome che è un recapito non esce nella rata', mail.tenantName === null && !JSON.stringify(mail).includes('@'));
  ok('le stanze passano assertClean', OWNER.assertClean(withInput('rooms', lateA)).ok);
}

section('Revisione 23/09: la ricerca trova le fatture');
{
  const p = B('ok');
  const inv = (E, q, lang = 'it') => E.search(p, q, lang).some((x) => x.type === 'invoice' && x.id === 'aspi_registrazione_c1'
    && x.path.join(' › ') === (lang === 'en' ? 'Via Cavour 12 › Lease 2026–27 › Money' : 'Via Cavour 12 › Contratto 2026–27 › Soldi'));
  redUnder('mp:search-invoices — «fattura», «BOOM-2026-014», «invoice», «Fattura BOOM» trovano la fattura, col percorso',
    (E) => inv(E, 'fattura') && inv(E, 'BOOM-2026-014') && inv(E, 'invoice', 'en') && inv(E, 'Fattura BOOM') && inv(E, 'fatt'),
    mutant('search-invoices', 'objs(P.invoices).forEach(', '[].forEach('));
  ok('«xyzzy» e «affitto» non tirano fuori la fattura', !OWNER.search(p, 'xyzzy', 'it').some((x) => x.type === 'invoice') && !OWNER.search(p, 'affitto', 'it').some((x) => x.type === 'invoice'));
}

section('Revisione 23/09: ogni codice che il motore emette ha le sue parole');
{
  const codes = OWNER.CODES.reasons;
  ok('i codici nuovi sono dichiarati', ['lease_unsigned', 'charges_after_termination', 'charge_overdue', 'charge_reported', 'charge_processing', 'charge_state_unknown', 'charge_amount_missing'].every((c) => codes.includes(c)));
  ok('ogni reason.<codice> ha IT e EN', codes.every((c) => OWNER.STRINGS.it['reason.' + c] && OWNER.STRINGS.en['reason.' + c]));
  ok('row.after_end(_undated), verdict.osservo.charge_overdue, facts.lease_unrecorded e il motivo senza data in IT e EN',
    ['row.after_end', 'row.after_end_undated', 'verdict.osservo.charge_overdue', 'facts.lease_unrecorded', 'reason.charges_after_termination_undated', 'status.unrecorded', 'note.firma_non_registrata']
      .every((k) => OWNER.STRINGS.it[k] && OWNER.STRINGS.en[k]));
  ok('i codici della chiusura sono dichiarati: signature_unrecorded, unrecorded, firma_non_registrata (e «paper» non esiste più)', codes.includes('signature_unrecorded')
    && OWNER.CODES.contractStatus.includes('unrecorded') && !OWNER.CODES.contractStatus.includes('paper') && OWNER.CODES.notes.includes('firma_non_registrata')
    && !OWNER.CODES.notes.includes('nessuna_firma_digitale'));
}

// ══ La rete finta (usata in sola lettura da B, C, D) ════════════════════
section('Harness contro api/homie/_lib.js e api/_auth.js veri');
{
  const h = createHarness({ seed: seedFor('ok'), files: { 'contracts/c1/contratto-firmato.pdf': { bytes: Buffer.from('%PDF-1.4 firmato'), token: 'DLTOK' } }, authEmails: ['marco@example.com'] });
  const uninstall = h.install();
  const lib = await import('../../api/homie/_lib.js');
  const auth = await import('../../api/_auth.js');
  try {
    const p = await lib.fsGet('properties/p1');
    ok('fsGet legge un documento del seme', p && p.id === 'p1' && p.ownerId === OWNER_UID);
    ok('fsGet su un documento assente → null', (await lib.fsGet('properties/nessuno')) === null);
    await lib.fsPatch('users/' + OWNER_UID, { ownerPortalFirstAt: '2026-09-22T08:42:00Z' });
    ok('fsPatch su un doc esistente fonde (updateMask)', h.DB.get('users/' + OWNER_UID).ownerPortalFirstAt === '2026-09-22T08:42:00Z' && h.DB.get('users/' + OWNER_UID).role === 'landlord');
    await lib.fsCreate('agentNotifications', { type: 'x' }, 'owner_activated_' + OWNER_UID);
    let dup = null; try { await lib.fsCreate('agentNotifications', { type: 'x' }, 'owner_activated_' + OWNER_UID); } catch (e) { dup = e; }
    ok('fsCreate con id: la seconda volta 409 (err.exists)', dup && dup.exists === true);
    const auto = await lib.fsCreate('activityLog', { a: 1 });
    ok('fsCreate senza id: id automatico', auto.id && h.DB.has('activityLog/' + auto.id));
    const eq = await lib.fsList('payments', { filter: { field: 'contractId', op: 'EQUAL', value: 'c1' }, limit: 600 });
    ok('fsList EQUAL', eq.length === 9 && eq.every((x) => x.contractId === 'c1'));
    const inq = await lib.fsList('payments', { filter: { field: 'month', op: 'IN', value: ['2026-08', '2026-09'] }, limit: 10 });
    ok('fsList IN', inq.length === 2);
    const lim = await lib.fsList('payments', { limit: 3 });
    ok('fsList limit', lim.length === 3);
    const page2 = await lib.fsList('payments', { limit: 3, afterId: lim[2].id });
    ok('fsList paginato (afterId, __name__)', page2.length === 3 && page2[0].id > lim[2].id);
    ok('documents (la collection) non si confonde col percorso', (await lib.fsList('documents', { filter: { field: 'propertyId', op: 'EQUAL', value: 'p1' } })).length === 6);
    const v = await lib.fsGetVersioned('properties/p1');
    const before = h.snapshot();
    let conflict = null;
    try {
      await lib.fsCommit([{ docPath: 'properties/p1', fields: { ownerId: 'x' }, precondition: { updateTime: v.updateTime } },
        { docPath: 'users/' + OWNER_UID, fields: { a: 1 }, precondition: { exists: false } }]);
    } catch (e) { conflict = e; }
    ok('fsCommit: una precondizione fallita → conflitto e NESSUNA scrittura', conflict && conflict.conflict === true && h.diff(before).length === 0);
    await lib.fsCommit([{ docPath: 'properties/p1', fields: { tag: 'ok' }, precondition: { updateTime: v.updateTime } }]);
    let stale = null; try { await lib.fsCommit([{ docPath: 'properties/p1', fields: { tag: 'no' }, precondition: { updateTime: v.updateTime } }]); } catch (e) { stale = e; }
    ok('fsCommit: updateTime vecchio → 412, conflitto', stale && stale.conflict === true && h.DB.get('properties/p1').tag === 'ok');
    const r401 = h.res(); await auth.requireRole(h.req({ uid: 'sconosciuto' }), r401, ['landlord']);
    const r403 = h.res(); await auth.requireRole(h.req({ uid: 't1' }), r403, ['landlord']);
    const rOk = await auth.requireRole(h.req({ uid: OWNER_UID }), h.res(), ['landlord', 'admin']);
    ok('requireRole: bearer = uid; sconosciuto 401, inquilino 403, proprietario ok', r401.statusCode === 401 && r403.statusCode === 403 && rOk && rOk.uid === OWNER_UID);
    const base = 'https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(BUCKET) + '/o/' + encodeURIComponent('contracts/c1/contratto-firmato.pdf');
    const m0 = await fetch(base);
    const m1 = await fetch(base, { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
    const meta = await m1.json();
    const d1 = await fetch(base + '?alt=media', { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
    const d2 = await fetch(base + '?alt=media&token=DLTOK');
    const d3 = await fetch(base + '?alt=media');
    ok('Storage: metadati e byte solo col Bearer admin (o il token del file)', m0.status === 403 && m1.status === 200 && meta.size === '16'
      && d1.status === 200 && Buffer.from(await d1.arrayBuffer()).toString() === '%PDF-1.4 firmato' && d2.status === 200 && d3.status === 403);
    const miss = await fetch('https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(BUCKET) + '/o/' + encodeURIComponent('rendiconti/own_1/rendiconto_2026-07.pdf'), { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
    ok('Storage: oggetto assente → 404', miss.status === 404);
    const up = await fetch('https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(BUCKET) + '/o?uploadType=media&name=' + encodeURIComponent('rendiconti/own_1/rendiconto_2026-09.pdf'),
      { method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN_TOKEN, 'Content-Type': 'application/pdf' }, body: Buffer.from('%PDF') });
    ok('Storage: upload col Bearer admin', up.status === 200 && h.FILES.has(BUCKET + '/rendiconti/own_1/rendiconto_2026-09.pdf'));
    const su1 = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=k', { method: 'POST', body: JSON.stringify({ email: 'Marco@Example.com', password: 'x' }) });
    const su2 = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=k', { method: 'POST', body: JSON.stringify({ email: 'nuovo@example.com', password: 'x' }) });
    const cau = await (await fetch('https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=k', { method: 'POST', body: JSON.stringify({ identifier: 'nuovo@example.com', continueUri: 'https://www.boomrome.com' }) })).json();
    ok('Auth: signUp EMAIL_EXISTS (senza badare alle maiuscole), poi un uid nuovo; createAuthUri lo vede', su1.status === 400 && (await su1.json()).error.message === 'EMAIL_EXISTS'
      && su2.status === 200 && h.signUps.length === 1 && cau.registered === true);
    let threw = false; try { await fetch('https://evil.example.com/x'); } catch (_) { threw = true; }
    ok('una chiamata non prevista viene registrata e lancia', threw && h.unexpected.includes('https://evil.example.com/x') && h.fetchLog.some((e) => e.kind === 'unexpected'));
    const r = h.res(); r.status(413).setHeader('Cache-Control', 'private'); r.json({ ok: false });
    ok('res finto: status, header in minuscolo, corpo', r.statusCode === 413 && r.getHeader('cache-control') === 'private' && r.body.ok === false && r.text() === '{"ok":false}');
  } finally { uninstall(); }
  const h2 = createHarness({ mediaBearer: false, files: { 'x/a.pdf': { bytes: Buffer.from('x'), token: 'T' } } });
  const un2 = h2.install();
  try {
    const u = 'https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(BUCKET) + '/o/' + encodeURIComponent('x/a.pdf') + '?alt=media';
    const a = await fetch(u, { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
    const b = await fetch(u + '&token=T');
    ok('mediaBearer:false → il Bearer admin è rifiutato, il token del file no (per il ripiego)', a.status === 403 && b.status === 200);
  } finally { un2(); }
}

console.log('\n' + '─'.repeat(48));
if (failed) console.log('FALLITI:\n  - ' + bad.join('\n  - '));
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
