// tests/catalogo/vetrina.mjs — I NOMI DALLA VIA E LE CAMERE GIUSTE, SU OGNI
// PAGINA CHE LE FOTOGRAFA (suite `catalogovetrina`).
//
// IL REPERTO (15/10/2026). Vetrina, home, scheda, /try, /your-money e il
// tabellone di /board portavano cotti i nomi del bot — tre «Bilocale
// Centro», due «Bilocale Trieste», due «Trilocale Pigneto» — e le camere
// lette con la regola sbagliata (`beds || bedrooms`, il primo numero del
// testo libero): «Capri 2 Bed» in vetrina come «1 bed», il bilocale di Via
// dei Cappellari come «3 bed» (e «3BR» sul tabellone).
//
// L'ATTESO È LA FOTOGRAFIA. Cosa ogni pagina deve dire si legge da
// design/pages-deco/case-full.json — il nome e FACTS.bedroomsOf, per id —
// che scripts/catalogo-nomi.mjs aggiorna NELLO STESSO GIRO delle pagine.
// Così la suite non è inchiodata alla mappa del 15/10: quando l'admin, su
// /catalogo, sceglie un nome diverso (o corregge le camere dopo il giro in
// casa) e `--from-firestore` riallinea, pagine e fotografia cambiano insieme
// e la suite resta verde. I controlli della MAPPA (Cappellari 1, Capri 2,
// Avignonesi 0) valgono finché la fotografia porta quei valori; dopo si
// saltano, e lo dicono. Le mutazioni si agganciano ai valori letti dai
// file, mai a un nome scritto qui.
//
// Le regole, ognuna verificata qui:
//   · PER ID, ogni punto in cui una pagina scrive il nome di una casa dice
//     il nome della fotografia, e quello del bot non resta: carte (nome,
//     alt, data-cerca), CASE della home e della scheda, H1 della scheda
//     nuda, la demo della home, /try, /your-money, l'ItemList, live-rows;
//   · le camere vengono da UNA regola, FACTS.bedroomsOf: data-letti, «· N
//     bed», CASE.letti, «NBR» del tabellone, numberOfBedrooms — e camere
//     IGNOTE sono data-letti vuoto, mai «0» (= Studio);
//   · scripts/catalogo-nomi.mjs non ha una fonte di default (exit 2), è
//     idempotente, va e torna, legge Firestore vero con --from-firestore
//     (qui: fetch finta, due pagine), non indovina un id che la build non
//     ha scritto, e --check non dichiara allineata una pagina con avvisi;
//   · la copia inline della regola e le funzioni dell'idrante (rinomina,
//     scriviCamere) sono identiche fra vetrina, home e scheda;
//   · i builder Python (design/) leggono la stessa regola dal gemello
//     design/listing_facts.py — parità con Node — e rifatti oggi dicono le
//     stesse camere e gli stessi id delle pagine;
//   · i FRAMMENTI da cui le pagine nascono (ad-regia, vetrina-idrante,
//     ld-regia) portano le funzioni e i blocchi di oggi identici alle
//     pagine: una ricostruzione «sito» non toglie niente (e un blocco tolto
//     dal frammento fa cadere la regola, verificato qui sotto);
//   · in Chromium (auto-skip senza playwright) l'idrante rinomina e
//     corregge, il setaccio rilegge (anche senza accenti), le camere ignote
//     non passano il filtro Studio, la scheda rilegge la casa E le tre
//     «altre case», e un nome (o un piano, un tipo, una dotazione) non
//     entra mai come markup;
//   · i tuoi luoghi (16/10/2026): i posti salvati nel localStorage e i
//     suggerimenti di Photon (servizio di terzi) si scrivono come testo,
//     sulla pagina e sul frammento — in Chromium un «<img onerror>», una
//     virgoletta e una «&» si leggono come sono scritti, anche dopo la
//     scelta e il ricaricamento, nessun nodo entra, nessun gestore parte;
//     e la stessa sonda sulla pagina col vecchio innerHTML vede l'iniezione.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync, cpSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allinea, PAGINE, FOTOGRAFIE, veritaDallaFotografia, riassunto, argomenti, FONTE_MANCANTE }
  from '../../scripts/catalogo-nomi.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const require = createRequire(import.meta.url);
const FACTS = require('../../js/listing-facts.js');
const FIX = require('../../js/catalogo-correzioni.js');
const FX = JSON.parse(readFileSync(join(here, 'fixture-listings-2026-10-15.json'), 'utf8'));
const leggi = (f, r = ROOT) => readFileSync(join(r, f), 'utf8');
const SCRIPT = join(ROOT, 'scripts', 'catalogo-nomi.mjs');

let pass = 0, fail = 0;
async function check(name, fn) {
  try {
    const v = await fn();
    if (v === true) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (v && v !== false ? ' — ' + String(v).slice(0, 600) : '')); }
  } catch (e) {
    fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message ? e.message.split('\n')[0] : e));
  }
}
// un controllo che non si applica più (la fotografia è cambiata): si dice,
// non si conta né come verde né come rosso — e mai «SKIP:» a inizio riga,
// che per tests/run-all.mjs vorrebbe dire «suite saltata»
const salta = (name, perche) => console.log('  · saltato — ' + name + ': ' + perche);
// una lista di guai: vuota = verde, altrimenti il primo (e quanti)
const esito = (g) => (g.length ? g.slice(0, 4).join(' · ') + (g.length > 4 ? ` (+${g.length - 4})` : '') : true);

// ── l'atteso: la FOTOGRAFIA, per id ─────────────────────────────────────
const pulisci = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const mappaDi = (id) => FIX.LISTINGS[id] || {};
function attesoDa(docs) {
  const out = new Map();
  for (const d of docs) {
    if (!d || !d._id || !pulisci(d.name)) continue;
    out.set(d._id, { name: pulisci(d.name), from: pulisci(mappaDi(d._id).from), n: FACTS.bedroomsOf(d) });
  }
  return out;
}
const CF0 = JSON.parse(leggi(FOTOGRAFIE.caseFull));
const ATTESO = attesoDa(CF0);
const voce = (n) => (n === 0 ? 'Studio' : n ? n + ' bed' : null);
const tipoKiosk = (n) => (n === 0 ? 'STU' : n ? n + 'BR' : 'FLT');
const lettiAttr = (n) => (n == null ? '' : String(n));
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const dec = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  : ENT[e.toLowerCase()] ?? m));

// ── LA LETTURA, indipendente dallo script: cosa dice ogni pagina, per id ─
function carte(html) {
  return [...html.matchAll(/<a class="casa-p" href="\/listing\/([^"?#/]+)"[\s\S]*?<\/a>/g)].map((m) => {
    const b = m[0];
    const riga2 = (b.match(/<div class="riga2">([\s\S]*?)<\/div>/) || [])[1];
    const pezzi = riga2 == null ? [] : riga2.split(' <i>·</i> ').map((x) => x.trim());
    return { id: decodeURIComponent(m[1]), blocco: b,
      nome: pulisci(dec((b.match(/<span class="nome">([^<]*)<\/span>/) || [])[1] || '')),
      alt: dec((b.match(/\balt="([^"]*)"/) || [])[1] || ''),
      cerca: (b.match(/\bdata-cerca="([^"]*)"/) || [])[1],
      letti: (b.match(/\bdata-letti="([^"]*)"/) || [])[1],
      bed: [...pezzi].reverse().find((p) => /^(\d+ bed|Studio)$/.test(p)) || null };
  });
}
function caseJson(html, prefisso = 'var CASE = ') {
  const m = html.match(new RegExp(prefisso.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\[.*\\]);'));
  return m ? JSON.parse(m[1]) : null;
}
function itemList(html) {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
    try { const d = JSON.parse(m[1]); if (d['@type'] === 'ItemList') return d; } catch { /* altro */ }
  }
  return null;
}
const nuovoSenzaVecchio = (a, testo) => {
  // il nome del bot non deve restare nella carta — salvo quando è dentro il
  // nuovo («Levico» in «Levico Garden»): lì bastano i campi esatti
  if (!a.from || a.from === a.name || a.name.toLowerCase().includes(a.from.toLowerCase())) return true;
  return !testo.toLowerCase().includes(a.from.toLowerCase());
};

// i guai di una pagina, campo per campo
function guaiCarte(file, html, attesi = ATTESO) {
  const g = [];
  const cc = carte(html);
  if (!cc.length) g.push(file + ': nessuna carta');
  for (const c of cc) {
    const a = attesi.get(c.id);
    if (!a) continue;
    if (c.nome !== a.name) g.push(`${file} ${c.id}: nome «${c.nome}» invece di «${a.name}»`);
    if (!c.alt.startsWith(a.name + ', ')) g.push(`${file} ${c.id}: alt «${c.alt}»`);
    if (c.cerca != null && !dec(c.cerca).startsWith(a.name.toLowerCase() + ' ')) g.push(`${file} ${c.id}: data-cerca «${c.cerca}»`);
    if (!nuovoSenzaVecchio(a, c.blocco)) g.push(`${file} ${c.id}: il vecchio nome «${a.from}» resta nella carta`);
    if (c.letti != null && c.letti !== lettiAttr(a.n)) g.push(`${file} ${c.id}: data-letti «${c.letti}» invece di «${lettiAttr(a.n)}»`);
    if (c.bed !== voce(a.n)) g.push(`${file} ${c.id}: «${c.bed}» invece di «${voce(a.n)}»`);
  }
  return g;
}
function guaiCase(file, html, conLetti, attesi = ATTESO) {
  const g = [];
  const cs = caseJson(html);
  if (!cs || !cs.length) return [file + ': CASE assente'];
  for (const c of cs) {
    const a = attesi.get(c.id);
    if (!a) continue;
    if (c.nome !== a.name) g.push(`${file} CASE ${c.id}: «${c.nome}» invece di «${a.name}»`);
    if (conLetti && c.letti !== a.n) g.push(`${file} CASE ${c.id}: letti ${c.letti} invece di ${a.n}`);
  }
  return g;
}
function guaiScheda(html, attesi = ATTESO) {
  const g = guaiCase('apartment-detail.html', html, true, attesi);
  const cs = caseJson(html) || [];
  const h1 = pulisci(dec((html.match(/<h1 id="nomeCasa">([^<]*)<\/h1>/) || [])[1] || ''));
  const a0 = cs[0] && attesi.get(cs[0].id);
  if (!a0 || h1 !== a0.name) g.push(`H1 della scheda nuda «${h1}» invece di «${a0 && a0.name}» (CASE[0])`);
  return g;
}
const RE_PASS = /(<div class="s4-pass"><b>[\s\S]*?<\/b><span>)([^<]*)(<\/span>)/;
function guaiDemo(html, attesi = ATTESO) {
  const g = [];
  const fig = (html.match(/<figure class="s1-casa s1-eletta">[\s\S]*?<\/figure>/) || [])[0] || '';
  const id = (fig.match(/listings%2Fenhanced%2F([A-Za-z0-9_-]+)%2F/) || [])[1];
  const a = id && attesi.get(id);
  if (!a) return ['demo della home: protagonista non trovata'];
  const cap = dec((fig.match(/<figcaption>([^<]*)<\/figcaption>/) || [])[1] || '');
  const pass = pulisci(dec((html.match(RE_PASS) || [])[2] || ''));
  if (!cap.startsWith(a.name + ' · €')) g.push(`demo: didascalia «${cap}»`);
  if (pass !== a.name) g.push(`demo: pass «${pass}»`);
  return g;
}
function guaiTry(html, attesi = ATTESO) {
  const g = [];
  const bb = [...html.matchAll(/<button type="button" class="pv-casa" data-id="([^"]+)"[\s\S]*?<\/button>/g)];
  if (bb.length !== 3) g.push(`try: ${bb.length} pulsanti invece di 3`);
  for (const [b, id] of bb) {
    const a = attesi.get(id);
    if (!a) { g.push('try: id ignoto ' + id); continue; }
    const dn = pulisci(dec((b.match(/\bdata-nome="([^"]*)"/) || [])[1] || ''));
    const nb = pulisci(dec((b.match(/<span class="info"><b>([^<]*)<\/b>/) || [])[1] || ''));
    const riga = dec((b.match(/<span class="info"><b>[^<]*<\/b><span>([^<]*)<\/span>/) || [])[1] || '');
    if (dn !== a.name || nb !== a.name) g.push(`try ${id}: «${dn}»/«${nb}»`);
    if (!nuovoSenzaVecchio(a, b)) g.push(`try ${id}: il vecchio nome resta`);
    const pezzi = riga.split(' · ');
    const v = pezzi.length > 1 && /^(\d+ bed|Studio)$/.test(pezzi[pezzi.length - 1]) ? pezzi[pezzi.length - 1] : null;
    if (v !== voce(a.n)) g.push(`try ${id}: «${riga}»`);
  }
  return g;
}
function guaiSoldi(html, attesi = ATTESO) {
  const g = [];
  const bb = [...html.matchAll(/<button type="button"( data-id="([^"]*)")?><b>([^<]*)<\/b><span>[^<]*<\/span><\/button>/g)];
  if (bb.length !== 3) g.push(`your-money: ${bb.length} tasti invece di 3`);
  for (const t of bb) {
    if (!t[2]) { g.push('your-money: tasto senza data-id'); continue; }
    const a = attesi.get(t[2]);
    if (!a || pulisci(dec(t[3])) !== a.name) g.push(`your-money ${t[2]}: «${t[3]}»`);
  }
  return g;
}
function guaiBoard(html, attesi = ATTESO) {
  const g = [];
  const rr = caseJson(html) || [];
  if (rr.length < 10) g.push(`board: ${rr.length} righe`);
  for (const r of rr) {
    if (!r.id) { g.push('board: riga senza id ' + JSON.stringify(r)); continue; }
    const a = attesi.get(r.id);
    if (a && r.tipo !== tipoKiosk(a.n)) g.push(`board ${r.id}: ${r.tipo} invece di ${tipoKiosk(a.n)}`);
  }
  return g;
}
function guaiItemList(html, attesi = ATTESO) {
  const g = [];
  const it = itemList(html);
  if (!it) return ['ItemList assente'];
  const cc = carte(html);
  if (it.itemListElement.length !== cc.length) g.push(`ItemList ${it.itemListElement.length} voci, ${cc.length} carte`);
  for (const v of it.itemListElement) {
    const id = v.item.url.split('/').pop();
    const a = attesi.get(id);
    if (!a) continue;
    if (v.item.name !== a.name) g.push(`ItemList ${id}: «${v.item.name}»`);
    const atteso = a.n ? a.n : undefined;
    if (v.item.numberOfBedrooms !== atteso) g.push(`ItemList ${id}: numberOfBedrooms ${v.item.numberOfBedrooms} invece di ${atteso}`);
  }
  return g;
}
// live-rows (da cui i builder rifanno le pagine) dice ciò che dice la
// fotografia: lo stesso nome, e un `bedrooms` che è il numero della regola
function guaiLiveRows(liveRows, attesi = ATTESO) {
  const g = [];
  for (const r of JSON.parse(liveRows)) {
    const a = attesi.get(r.id);
    if (!a) continue;
    if (r.nome !== a.name) g.push(`live-rows ${r.id}: «${r.nome}»`);
    if (r.bedrooms !== (a.n == null ? null : String(a.n))) g.push(`live-rows ${r.id}: bedrooms ${r.bedrooms} invece di ${a.n}`);
    if (FACTS.bedroomsOf(r) !== a.n) g.push(`live-rows ${r.id}: la regola legge ${FACTS.bedroomsOf(r)} invece di ${a.n}`);
  }
  return g;
}
function tuttiIGuai(P, liveRows, attesi) {
  return [...guaiCarte('apartments.html', P['apartments.html'], attesi), ...guaiItemList(P['apartments.html'], attesi),
    ...guaiCarte('index.html', P['index.html'], attesi), ...guaiCase('index.html', P['index.html'], false, attesi),
    ...guaiDemo(P['index.html'], attesi), ...guaiScheda(P['apartment-detail.html'], attesi),
    ...guaiTry(P['try.html'], attesi), ...guaiSoldi(P['your-money.html'], attesi),
    ...guaiBoard(P['board.html'], attesi), ...guaiLiveRows(liveRows, attesi)];
}

const P = Object.fromEntries(PAGINE.map((f) => [f, leggi(f)]));
const LR = leggi(FOTOGRAFIE.liveRows);

console.log('CATALOGO · VETRINA — ogni pagina dice la fotografia (case-full.json), per id');
await check(`la fotografia porta nomi e camere (${ATTESO.size} case con un nome): è l'atteso di tutto il resto`, () =>
  ATTESO.size >= 15 && [...ATTESO.values()].every((a) => a.name) ? true : String(ATTESO.size));
await check('apartments.html: le carte dicono il nome della fotografia (nome, alt, data-cerca), le camere di FACTS, e il nome del bot non resta',
  () => esito(guaiCarte('apartments.html', P['apartments.html'])));
await check('apartments.html: l\'ItemList ripete nomi e camere delle carte (numberOfBedrooms dalla regola UNA)',
  () => esito(guaiItemList(P['apartments.html'])));
await check('index.html: le carte della settimana dicono il nome e le camere della fotografia',
  () => esito(guaiCarte('index.html', P['index.html'])));
await check('index.html: il CASE della mappa porta i nomi della fotografia', () => esito(guaiCase('index.html', P['index.html'], false)));
await check('index.html: la demo (didascalia e pass Wallet) porta il nome della sua protagonista', () => esito(guaiDemo(P['index.html'])));
await check('apartment-detail.html: CASE (nome, letti) e H1 della scheda nuda dicono il vero',
  () => esito(guaiScheda(P['apartment-detail.html'])));
await check('try.html: i tre pulsanti (data-nome, nome, camere)', () => esito(guaiTry(P['try.html'])));
await check('your-money.html: i tre tasti hanno l\'id e il nome della fotografia', () => esito(guaiSoldi(P['your-money.html'])));
await check('board.html: ogni riga del tabellone ha l\'id e il tipo (STU/NBR) dalla regola UNA', () => esito(guaiBoard(P['board.html'])));
await check('live-rows.json (la fotografia dei builder della home) dice nomi e camere di case-full', () => esito(guaiLiveRows(LR)));

// ── la MAPPA del 15/10: finché la fotografia porta i suoi valori ────────
console.log('\nLA MAPPA DEL 15/10 — i suoi valori, finché la fotografia li porta');
function camereOvunque(id) {
  const out = [];
  for (const f of ['apartments.html', 'index.html']) {
    for (const c of carte(P[f])) if (c.id === id) {
      if (c.bed) out.push([f + ' riga2', c.bed === 'Studio' ? 0 : parseInt(c.bed, 10)]);
      if (c.letti != null) out.push([f + ' data-letti', c.letti === '' ? null : +c.letti]);
    }
  }
  for (const c of caseJson(P['apartment-detail.html']) || []) if (c.id === id) out.push(['scheda CASE.letti', c.letti]);
  for (const r of caseJson(P['board.html']) || []) if (r.id === id) out.push(['board', r.tipo === 'STU' ? 0 : parseInt(r.tipo, 10)]);
  for (const v of (itemList(P['apartments.html']) || { itemListElement: [] }).itemListElement) {
    if (v.item.url.endsWith('/' + id)) out.push(['ItemList', v.item.numberOfBedrooms == null ? 0 : v.item.numberOfBedrooms]);
  }
  return out;
}
async function finche(id, n, dove, nome) {
  const a = ATTESO.get(id);
  if (!a || a.n !== n) return salta(nome, `la fotografia dice ${a ? a.n : 'niente'} per ${id} (una scelta dopo la mappa)`);
  await check(nome, () => {
    const v = camereOvunque(id);
    return v.length >= dove && v.every(([, x]) => x === n) ? true : JSON.stringify(v);
  });
}
await finche('OLLVsiKhPrhpT1fx8XmB', 1, 5, 'il bilocale di Via dei Cappellari non dice più «3 bed» da nessuna parte (riga, filtro, scheda, tabellone, ItemList)');
await finche('wvX0h0lBoNKOMuTuHkVI', 2, 5, '«Capri 2 Bed» non dice più «1 bed» da nessuna parte: due camere ovunque');
await finche('XcAnljWiqqx2s7msgWUR', 0, 1, 'Avignonesi è un monolocale (0) dove compare (scheda)');
{
  // si DICE, non si giudica: anche un nome uguale a quello del bot (il
  // `from` della mappa) può essere una scelta dell'admin in /catalogo. Che
  // nessuno riporti i nomi del bot lanciando `--from-firestore` PRIMA
  // dell'«Applica» lo garantisce l'ordine del rilascio (deploy → Applica →
  // `--from-firestore --check`, che lì direbbe le modifiche ed esce 1),
  // non un cancello qui: la suite segue la fotografia, qualunque essa sia
  const scelte = [...ATTESO].filter(([id, a]) => mappaDi(id).name && pulisci(mappaDi(id).name) !== a.name);
  if (scelte.length) console.log('  · nomi scelti dopo la mappa: ' + scelte.map(([id, a]) => id + '=«' + a.name + '»').join(', '));
  const delBot = scelte.filter(([id, a]) => mappaDi(id).from && a.name === pulisci(mappaDi(id).from));
  if (delBot.length) console.log('  · di cui uguali al nome del bot prima della mappa: ' + delBot.map(([id]) => id).join(', '));
}

// ── LA MUTAZIONE: le stesse regole su un campione sbagliato devono cadere ─
console.log('\nLA MUTAZIONE — sul campione sbagliato le regole cadono (valori letti dai file)');
const muta = (s, da, a) => { if (!da || !s.includes(da)) throw new Error('mutazione senza appiglio: ' + String(da).slice(0, 60)); return s.replace(da, a); };
const CA = carte(P['apartments.html']).filter((c) => ATTESO.get(c.id));
const altroNome = (c) => { const a = ATTESO.get(c.id); return a.from && a.from !== a.name ? a.from : a.name + ' Vecchio'; };
{
  const c = CA[0];
  const nomeGrezzo = (c.blocco.match(/<span class="nome">[^<]*<\/span>/) || [])[0];
  await check(`mutazione: la carta ${c.id} torna «${altroNome(c)}» → la regola delle carte cade`, () =>
    guaiCarte('apartments.html', muta(P['apartments.html'], c.blocco,
      muta(c.blocco, nomeGrezzo, '<span class="nome">' + altroNome(c) + '</span>'))).length > 0);
  const cv = CA.find((x) => x.bed);
  const altraVoce = cv.bed === '1 bed' ? '2 bed' : '1 bed';
  await check(`mutazione: la carta ${cv.id} dice «${altraVoce}» invece di «${cv.bed}» → cade`, () =>
    guaiCarte('apartments.html', muta(P['apartments.html'], cv.blocco,
      muta(cv.blocco, '<i>·</i> ' + cv.bed, '<i>·</i> ' + altraVoce))).length > 0);
  await check(`mutazione: l'alt della carta ${c.id} resta col nome di prima (lo span sì) → cade`, () =>
    guaiCarte('apartments.html', muta(P['apartments.html'], c.blocco,
      c.blocco.replace(/(\balt=")[^,"]*/, '$1' + altroNome(c)))).length > 0);
  const cl = CA.find((x) => x.letti != null && x.letti !== '');
  await check(`mutazione: data-letti di ${cl.id} cambia (il filtro direbbe un'altra cosa) → cade`, () =>
    guaiCarte('apartments.html', muta(P['apartments.html'], cl.blocco,
      muta(cl.blocco, 'data-letti="' + cl.letti + '"', 'data-letti="' + (cl.letti === '1' ? '3' : '1') + '"'))).length > 0);
}
{
  const r0 = (caseJson(P['board.html']) || [])[0];
  const riga = (P['board.html'].match(new RegExp('\\{"id": "' + r0.id + '"[^}]*\\}')) || [])[0];
  const altro = r0.tipo === '3BR' ? '1BR' : '3BR';
  await check(`mutazione: il tabellone dice «${altro}» per ${r0.id} → cade`, () =>
    guaiBoard(muta(P['board.html'], riga, muta(riga, '"tipo": "' + r0.tipo + '"', '"tipo": "' + altro + '"'))).length > 0);
  const c0 = (caseJson(P['apartment-detail.html']) || [])[0];
  await check(`mutazione: la scheda porta un altro nome nel CASE per ${c0.id} → cade`, () =>
    guaiScheda(muta(P['apartment-detail.html'], '"nome": ' + JSON.stringify(c0.nome),
      '"nome": ' + JSON.stringify(c0.nome + ' Vecchio'))).length > 0);
  const pass = P['index.html'].match(RE_PASS);
  await check('mutazione: il pass della demo porta un altro nome → cade', () =>
    guaiDemo(muta(P['index.html'], pass[0], pass[1] + pass[2] + ' Vecchio' + pass[3])).length > 0);
  const idSoldi = (P['your-money.html'].match(/<button type="button" data-id="([^"]+)">/) || [])[1];
  await check('mutazione: un tasto di /your-money perde l\'id → cade', () =>
    guaiSoldi(muta(P['your-money.html'], '<button type="button" data-id="' + idSoldi + '">', '<button type="button">')).length > 0);
}

// ── LO SCRIPT: nessuna fonte di default, idempotente, va e torna ─────────
console.log('\nLO SCRIPT — scripts/catalogo-nomi.mjs');
function copiaRadice() {
  const r = mkdtempSync(join(tmpdir(), 'boom-nomi-'));
  for (const f of [...PAGINE, ...Object.values(FOTOGRAFIE)]) {
    mkdirSync(join(r, dirname(f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(r, f));
  }
  return r;
}
const FILE = [...PAGINE, ...Object.values(FOTOGRAFIE)];
const uguali = (r) => FILE.filter((f) => leggi(f, r) !== leggi(f));
const FOTO = veritaDallaFotografia(CF0);
const cli = (args, opz = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000, ...opz });

await check('sul repo: le pagine dicono già la fotografia (zero modifiche, zero avvisi, zero case ignote)', async () => {
  const r = await allinea({ verita: FOTO, dry: true });
  return r.cambi.length === 0 && r.avvisi.length === 0 && r.ignoti.length === 0
    ? true : JSON.stringify({ cambi: r.cambi.slice(0, 3), avvisi: r.avvisi, ignoti: r.ignoti });
});
await check('nessuna fonte di default: allinea() senza fonte si rifiuta', async () => {
  try { await allinea({ dry: true }); return 'è partito senza fonte'; }
  catch (e) { return e.message === FONTE_MANCANTE ? true : e.message; }
});
{
  const r = copiaRadice();
  try {
    const giri = [[[], 'senza fonte'], [['--dry'], 'solo --dry'], [['--check'], 'solo --check'],
      [['--from-firestore', '--dalla-mappa'], 'due fonti'], [['--dalla-mappa', '--chek'], 'un argomento scritto male'],
      [['--fixture', join(here, 'fixture-listings-2026-10-15.json')], '--fixture senza --dalla-mappa']];
    const esiti = giri.map(([a, perche]) => {
      const x = cli([...a, '--root', r]);
      return { perche, status: x.status, uso: /uso: node scripts\/catalogo-nomi\.mjs/.test(x.stderr) };
    });
    await check('la riga di comando senza UNA fonte (o con un argomento ignoto) stampa l\'uso, esce 2 e non scrive niente', () =>
      esiti.every((e) => e.status === 2 && e.uso) && uguali(r).length === 0 ? true : JSON.stringify(esiti));
    await check('argomenti(): --check vale --dry, --root e --fixture vogliono un valore', () => {
      const a = argomenti(['--dalla-mappa', '--check']);
      const b = argomenti(['--from-firestore', '--root']);
      return a.opz && a.opz.dry && a.opz.check && a.opz.dallaMappa && !a.opz.fromFirestore && b.errore
        ? true : JSON.stringify({ a, b });
    });
  } finally { rmSync(r, { recursive: true, force: true }); }
}

// il vecchio mondo: i nomi del bot e la regola sbagliata delle camere, sui
// documenti del 15/10 (il fixture): il punto da cui la migrazione è partita
const perIdFx = new Map(FX.map((d) => [d._id, d]));
const vecchiaRegola = (d) => { const m = String((d && (d.beds || d.bedrooms)) || '').match(/\d+/); return m ? +m[0] : null; };
const VECCHIA = new Map(), VECCHIO = new Map();
for (const [id, a] of ATTESO) {
  const d = perIdFx.get(id);
  if (!d) continue;
  const campi = {};
  for (const k of ['beds', 'bedrooms']) if (d[k] !== undefined) campi[k] = d[k];
  const nomeVecchio = a.from || a.name;
  VECCHIA.set(id, { name: nomeVecchio, bedrooms: vecchiaRegola(d), campi });
  VECCHIO.set(id, { name: nomeVecchio, from: a.name, n: vecchiaRegola(d) });
}
{
  const r = copiaRadice();
  try {
    const giu = await allinea({ root: r, verita: VECCHIA });
    const ollv = 'OLLVsiKhPrhpT1fx8XmB', vo = VECCHIO.get(ollv);
    await check(`andata nel mondo vecchio: ${giu.cambi.length} modifiche, il Cappellari torna «${vo && vo.name} · ${vo && voce(vo.n)}»`, () => {
      const c = carte(leggi('apartments.html', r)).find((x) => x.id === ollv);
      return giu.cambi.length > 80 && c.nome === vo.name && c.bed === voce(vo.n) && c.letti === lettiAttr(vo.n);
    });
    await check('anche il mondo vecchio è un punto fermo (secondo giro: zero modifiche)', async () =>
      (await allinea({ root: r, verita: VECCHIA, dry: true })).cambi.length === 0);
    // l'andata deve riscrivere TUTTO: un campo che lo script non tocca mai
    // resterebbe «nuovo» anche nel mondo vecchio, e il ritorno passerebbe a
    // vuoto. Le stesse letture, con l'atteso del mondo vecchio.
    const R = Object.fromEntries(PAGINE.map((f) => [f, leggi(f, r)]));
    await check('il mondo vecchio è coerente in ogni punto (carte, ItemList, CASE, H1, demo, try, your-money, board, nomi delle fotografie)', () => {
      const g = [...guaiCarte('apartments.html', R['apartments.html'], VECCHIO),
        ...guaiItemList(R['apartments.html'], VECCHIO), ...guaiCarte('index.html', R['index.html'], VECCHIO),
        ...guaiCase('index.html', R['index.html'], false, VECCHIO), ...guaiDemo(R['index.html'], VECCHIO),
        ...guaiScheda(R['apartment-detail.html'], VECCHIO), ...guaiTry(R['try.html'], VECCHIO),
        ...guaiSoldi(R['your-money.html'], VECCHIO), ...guaiBoard(R['board.html'], VECCHIO)];
      for (const d of JSON.parse(leggi(FOTOGRAFIE.caseFull, r))) {
        const a = VECCHIO.get(d._id); if (a && d.name !== a.name) g.push('case-full ' + d._id + ': ' + d.name);
      }
      for (const x of JSON.parse(leggi(FOTOGRAFIE.liveRows, r))) {
        const a = VECCHIO.get(x.id); if (a && x.nome !== a.name) g.push('live-rows ' + x.id + ': ' + x.nome);
      }
      return esito(g);
    });
    // il ritorno: la fotografia del repo (letta PRIMA dell'andata) è la fonte
    const su = await allinea({ root: r, verita: FOTO });
    await check(`ritorno dalla fotografia (${su.cambi.length} modifiche): le 8 pagine/fotografie sono byte identiche al repo`, () => {
      const d = uguali(r); return d.length ? 'diverse: ' + d.join(', ') : true;
    });
    await check('idempotente: il terzo giro non cambia niente', async () =>
      (await allinea({ root: r, verita: FOTO, dry: true })).cambi.length === 0);
  } finally { rmSync(r, { recursive: true, force: true }); }
}

// --from-firestore: la forma REST vera, due pagine. I documenti sono quelli
// della FOTOGRAFIA (= il catalogo come l'admin l'ha lasciato), più i ritocchi
function rest(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(rest) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rest(x)])) } };
  return { stringValue: String(v) };
}
function catalogoRest(docs, ritocchi = {}) {
  return docs.filter((d0) => d0 && d0._id).map((d0) => {
    const d = Object.assign({}, d0, ritocchi[d0._id] || {});
    for (const [k, v] of Object.entries(d)) if (v === undefined) delete d[k];
    const id = d._id; delete d._id;
    return { name: 'projects/boom-property-dashboards/databases/(default)/documents/listings/' + id,
      fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, rest(v)])) };
  });
}
function fintoFirestore(DOCS, chiamate = []) {
  return async (url) => {
    chiamate.push(url);
    const due = url.includes('pageToken=');
    return { ok: true, status: 200, json: async () => (due
      ? { documents: DOCS.slice(14) }
      : { documents: DOCS.slice(0, 14), nextPageToken: 'pagina2' }) };
  };
}
{
  const DOCS = catalogoRest(CF0, {
    // l'operatore ha scelto un nome diverso dalla mappa, e le camere sono 3
    wvX0h0lBoNKOMuTuHkVI: { name: 'Capri Garden Two-Bed', bedrooms: 3 },
    // un documento che TACE sulle camere: le pagine restano come sono
    ripetta: { bedrooms: undefined, beds: undefined },
    // un documento che dice qualcosa che non si legge: le camere si TACCIONO
    piemonte: { bedrooms: 'abc', beds: 'n/a' },
  });
  const chiamate = [];
  const finto = fintoFirestore(DOCS, chiamate);
  const r = copiaRadice();
  try {
    const prima = Object.fromEntries(PAGINE.map((f) => [f, leggi(f, r)]));
    const fatto = await allinea({ root: r, fromFirestore: true, fetch: finto });
    await check('--from-firestore legge DUE pagine (pageSize=300, poi pageToken) dalla porta pubblica', () =>
      chiamate.length === 2 && chiamate[0].startsWith('https://firestore.googleapis.com/v1/projects/boom-property-dashboards/databases/(default)/documents/listings?pageSize=300')
      && /pageToken=pagina2/.test(chiamate[1]) ? true : JSON.stringify(chiamate));
    const AP = leggi('apartments.html', r), AD = leggi('apartment-detail.html', r), BD = leggi('board.html', r);
    const capri = carte(AP).find((x) => x.id === 'wvX0h0lBoNKOMuTuHkVI');
    const capriScheda = (caseJson(AD) || []).find((x) => x.id === 'wvX0h0lBoNKOMuTuHkVI');
    const capriBoard = (caseJson(BD) || []).find((x) => x.id === 'wvX0h0lBoNKOMuTuHkVI');
    await check('--from-firestore: il nome e le camere VERI vincono (carta, scheda, tabellone)', () =>
      capri.nome === 'Capri Garden Two-Bed' && capri.bed === '3 bed' && capri.letti === '3'
      && capri.alt.startsWith('Capri Garden Two-Bed, ') && capri.cerca.startsWith('capri garden two-bed ')
      && capriScheda.nome === 'Capri Garden Two-Bed' && capriScheda.letti === 3 && capriBoard.tipo === '3BR'
        ? true : JSON.stringify({ capri: { ...capri, blocco: undefined }, capriScheda: capriScheda && capriScheda.letti, capriBoard }));
    await check('--from-firestore: un documento che tace sulle camere non cancella niente (Ripetta resta com\'era)', () => {
      const c = carte(AP).find((x) => x.id === 'ripetta');
      const c0 = carte(prima['apartments.html']).find((x) => x.id === 'ripetta');
      return c.bed === c0.bed && c.letti === c0.letti && fatto.cambi.every((x) => !(x.id === 'ripetta' && /letti|camere|tipo|bedrooms|beds/.test(x.campo)))
        ? true : JSON.stringify({ c: { ...c, blocco: undefined }, c0: c0.bed });
    });
    // il ramo NULL: camere che non si leggono → la voce si toglie dappertutto,
    // data-letti VUOTO (mai «0» = Studio), tipo «FLT», nessun numberOfBedrooms
    const pie = carte(AP).find((x) => x.id === 'piemonte');
    const pieScheda = (caseJson(AD) || []).find((x) => x.id === 'piemonte');
    const pieBoard = (caseJson(BD) || []).find((x) => x.id === 'piemonte');
    const pieItem = (itemList(AP) || { itemListElement: [] }).itemListElement.find((v) => v.item.url.endsWith('/piemonte'));
    const pieCF = JSON.parse(leggi(FOTOGRAFIE.caseFull, r)).find((d) => d._id === 'piemonte');
    const pieLR = JSON.parse(leggi(FOTOGRAFIE.liveRows, r)).find((x) => x.id === 'piemonte');
    await check('--from-firestore: camere illeggibili (bedrooms «abc», beds «n/a») → voce tolta, data-letti vuoto, CASE.letti null, «FLT», niente numberOfBedrooms', () =>
      pie && pie.bed === null && pie.letti === '' && !/\bbed\b|Studio/.test(pie.blocco.match(/<div class="riga2">([\s\S]*?)<\/div>/)[1])
      && pieScheda && pieScheda.letti === null && pieBoard && pieBoard.tipo === 'FLT'
      && pieItem && pieItem.item.numberOfBedrooms === undefined
        ? true : JSON.stringify({ pie: pie && { ...pie, blocco: undefined }, scheda: pieScheda && pieScheda.letti, board: pieBoard, item: pieItem && pieItem.item.numberOfBedrooms }));
    await check('--from-firestore: e le fotografie lo dicono (case-full con i grezzi, live-rows bedrooms null): un builder non lo reinventa', () =>
      pieCF.bedrooms === 'abc' && pieCF.beds === 'n/a' && FACTS.bedroomsOf(pieCF) === null
      && pieLR.bedrooms === null && pieLR.beds === 'n/a' && FACTS.bedroomsOf(pieLR) === null
        ? true : JSON.stringify({ pieCF: { b: pieCF.bedrooms, s: pieCF.beds }, pieLR: { b: pieLR.bedrooms, s: pieLR.beds } }));
    await check('--from-firestore: nessun altro cambio (solo Capri, Piemonte e l\'ItemList che li ripete)', () =>
      fatto.cambi.every((x) => x.id === 'wvX0h0lBoNKOMuTuHkVI' || x.id === 'piemonte' || x.campo === 'ItemList')
        ? true : JSON.stringify(fatto.cambi.filter((x) => !['wvX0h0lBoNKOMuTuHkVI', 'piemonte'].includes(x.id)).slice(0, 5)));
    await check('--from-firestore idempotente', async () =>
      (await allinea({ root: r, fromFirestore: true, fetch: finto, dry: true })).cambi.length === 0);
  } finally { rmSync(r, { recursive: true, force: true }); }
}
{
  // IL FLUSSO DELL'ADMIN (il caso del revisore): sul Cappellari, dopo il giro
  // in casa, l'admin applica «Cappellari Three-Bed» con 3 camere; un giro
  // --from-firestore riallinea pagine e fotografia, e la suite — che legge
  // l'atteso dalla fotografia — resta verde sulla copia
  const r = copiaRadice();
  try {
    const DOCS = catalogoRest(CF0, { OLLVsiKhPrhpT1fx8XmB: { name: 'Cappellari Three-Bed', bedrooms: 3, beds: '3' } });
    await allinea({ root: r, fromFirestore: true, fetch: fintoFirestore(DOCS) });
    const Ac = attesoDa(JSON.parse(leggi(FOTOGRAFIE.caseFull, r)));
    const Pc = Object.fromEntries(PAGINE.map((f) => [f, leggi(f, r)]));
    await check('il flusso dell\'admin («Cappellari Three-Bed», 3 camere) → riallineo: ogni regola della suite, con l\'atteso della fotografia nuova, è verde', () =>
      Ac.get('OLLVsiKhPrhpT1fx8XmB').name === 'Cappellari Three-Bed' && Ac.get('OLLVsiKhPrhpT1fx8XmB').n === 3
        ? esito(tuttiIGuai(Pc, leggi(FOTOGRAFIE.liveRows, r), Ac)) : JSON.stringify(Ac.get('OLLVsiKhPrhpT1fx8XmB')));
    await check('… e la pagina ora dice «Cappellari Three-Bed · 3 bed», «3BR» (la regola «Cappellari 1» si salta da sola)', () => {
      const c = carte(Pc['apartments.html']).find((x) => x.id === 'OLLVsiKhPrhpT1fx8XmB');
      const b = (caseJson(Pc['board.html']) || []).find((x) => x.id === 'OLLVsiKhPrhpT1fx8XmB');
      return c.nome === 'Cappellari Three-Bed' && c.bed === '3 bed' && b.tipo === '3BR' ? true : JSON.stringify({ c: c.nome, bed: c.bed, b });
    });
  } finally { rmSync(r, { recursive: true, force: true }); }
}
{
  const r = copiaRadice();
  try {
    let errore = null;
    try { await allinea({ root: r, fromFirestore: true, fetch: async () => ({ ok: false, status: 503 }) }); }
    catch (e) { errore = e; }
    await check('Firestore giù (503): lo script si ferma con l\'errore e non scrive niente', () =>
      errore && /503/.test(errore.message) && uguali(r).length === 0 ? true : String(errore));
  } finally { rmSync(r, { recursive: true, force: true }); }
}
{
  // l'id che la build non ha scritto: si ricava dalla regola del builder,
  // MA solo se zona e prezzo stampati coincidono — altrimenti non si tocca
  const r = copiaRadice();
  try {
    const nudo = (s) => s.replace(/<button type="button" data-id="[^"]*">/g, '<button type="button">');
    writeFileSync(join(r, 'your-money.html'), nudo(leggi('your-money.html')));
    const giro = await allinea({ root: r, verita: FOTO });
    await check('/your-money senza id: la regola del builder (economica · mediana · cara) lo ritrova, byte identico a oggi', () =>
      leggi('your-money.html', r) === leggi('your-money.html') && giro.cambi.filter((x) => x.campo === 'data-id').length === 3);
    const tasto = (P['your-money.html'].match(/<span>([^<]*· €[\d,]+\/mo)<\/span>/) || [])[1];
    writeFileSync(join(r, 'your-money.html'), muta(nudo(leggi('your-money.html')), tasto, tasto.replace(/€([\d,]+)/, '€9,999')));
    const prima = leggi('your-money.html', r);
    const giro2 = await allinea({ root: r, verita: FOTO });
    await check('/your-money con un prezzo che la regola non spiega: la pagina NON si tocca, e lo dice', () =>
      leggi('your-money.html', r) === prima && giro2.avvisi.some((a) => a.file === 'your-money.html'));
    // il gemello per /board (prima non esercitato): tolti gli id, l'ordine
    // del kiosk (`when`) li ritrova tutti, e il tabellone torna byte identico
    const righeNude = (s) => s.replace(/\{"id": "[^"]*", "ora"/g, '{"ora"');
    writeFileSync(join(r, 'board.html'), righeNude(leggi('board.html')));
    const giroB = await allinea({ root: r, verita: FOTO });
    await check('/board senza id: la regola del builder (ordine per `when`) li ritrova tutti, byte identico a oggi', () =>
      leggi('board.html', r) === leggi('board.html') && giroB.cambi.filter((x) => x.file === 'board.html' && x.campo === 'id').length
        === (caseJson(P['board.html']) || []).length ? true : JSON.stringify(giroB.avvisi));
    const r0 = (caseJson(P['board.html']) || [])[0];
    writeFileSync(join(r, 'board.html'), muta(righeNude(leggi('board.html')), '"prezzo": "' + r0.prezzo + '"', '"prezzo": "€9,999"'));
    const primaB = leggi('board.html', r);
    const giro3 = await allinea({ root: r, verita: FOTO });
    await check('/board con una riga che la regola del builder non spiega: il tabellone NON si tocca, e lo dice', () =>
      leggi('board.html', r) === primaB && giro3.avvisi.some((a) => a.file === 'board.html'));
    // --check: una pagina che non si può allineare NON è allineata — esce 1
    // anche con zero modifiche da scrivere, e non lo dichiara a posto
    const cr = cli(['--dalla-mappa', '--check', '--root', r]);
    const mappaScrive = /modifiche in \d+ file/.test(cr.stdout);
    await check('--check con un avviso (/board non allineabile): esce 1 e NON stampa «nessuna modifica: le pagine dicono già…»', () =>
      cr.status === 1 && /⚠/.test(cr.stdout) && !/nessuna modifica: le pagine dicono già/.test(cr.stdout)
        ? true : JSON.stringify({ status: cr.status, out: cr.stdout.slice(-300), err: cr.stderr.slice(-300), mappaScrive }));
  } finally { rmSync(r, { recursive: true, force: true }); }
}
await check('riassunto(): avvisi o case ignote = pagine NON allineate (--check esce 1), solo zero di tutto è «nessuna modifica»', () => {
  const vuoto = { cambi: [], avvisi: [], ignoti: [], file: [] };
  const a = riassunto(vuoto, { check: true });
  const b = riassunto({ ...vuoto, ignoti: ['board.html · casaSparita'] }, { check: true });
  const c = riassunto({ ...vuoto, avvisi: [{ file: 'try.html', id: 'x', testo: 'non tocco' }] }, { check: true });
  const d = riassunto({ ...vuoto, ignoti: ['x'] }, { check: false });
  const ok = (x) => x.righe.some((l) => /nessuna modifica: le pagine dicono già/.test(l));
  return a.codice === 0 && ok(a) && b.codice === 1 && !ok(b) && b.righe.some((l) => /casaSparita/.test(l))
    && c.codice === 1 && !ok(c) && d.codice === 0 && !ok(d) ? true : JSON.stringify({ a, b, c, d });
});

// ── LA REGOLA INLINE: identica alla vera, su tutto il catalogo ──────────
console.log('\nLA REGOLA DELLE CAMERE — la copia inline è la stessa di FACTS.bedroomsOf');
function estrai(s, nome) {
  const i = s.indexOf('function ' + nome + '(');
  if (i < 0) return null;
  let d = 0;
  for (let k = s.indexOf('{', i); k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}' && !--d) return s.slice(i, k + 1);
  }
  return null;
}
const COPIE = { 'apartments.html': estrai(P['apartments.html'], 'camereDi'),
  'index.html': estrai(P['index.html'], 'camereDi'), 'board.html': estrai(P['board.html'], 'camereDi') };
const CASI = [
  ...FX, ...CF0,
  // la forma REST che vedono l'idrante e il tabellone: integerValue è una stringa
  ...FX.map((d) => ({ bedrooms: d.bedrooms == null ? null : String(d.bedrooms), beds: d.beds == null ? null : String(d.beds) })),
  { bedrooms: 0 }, { bedrooms: '0' }, { bedrooms: 0, beds: '3' }, { bedrooms: '' , beds: '2 BR' }, { bedrooms: null, beds: 'Studio' },
  { bedrooms: 11, beds: '2' }, { bedrooms: -1 }, { bedrooms: 1.5, beds: '1BR + Loft' }, { bedrooms: ' 3 ' }, { bedrooms: true, beds: '4' },
  { bedrooms: 'abc' }, { beds: 'Living , 1 bedroom with balcony , 1 bedroom' }, { beds: '0' }, { beds: '12' }, { beds: 3 },
  { bedrooms: 10 }, { bedrooms: '10' }, { beds: '10 bedrooms' }, {}, null,
  { bedrooms: [2] }, { bedrooms: '1e1' }, { bedrooms: false, beds: '2' }, { beds: '٣' }, { beds: '٣ 2' },
];
function parita(sorgente) {
  const fn = new Function('return (' + sorgente + ')')();
  return CASI.filter((d) => fn(d) !== FACTS.bedroomsOf(d)).map((d) => JSON.stringify(d) + ' → ' + fn(d) + ' vs ' + FACTS.bedroomsOf(d));
}
await check('vetrina, home e tabellone portano la STESSA copia della regola', () =>
  COPIE['apartments.html'] && COPIE['apartments.html'] === COPIE['index.html'] && COPIE['index.html'] === COPIE['board.html']
    ? true : JSON.stringify(Object.fromEntries(Object.entries(COPIE).map(([k, v]) => [k, v && v.length]))));
for (const [f, src] of Object.entries(COPIE)) {
  await check(`${f}: camereDi = FACTS.bedroomsOf su ${CASI.length} casi (il catalogo vero, la sua forma REST, i casi limite)`,
    () => (src ? esito(parita(src)) : 'camereDi assente'));
}
await check('mutazione: la copia che legge prima il testo libero (`beds`) cade', () =>
  parita(COPIE['apartments.html'].replace('var b = l.bedrooms;', 'var b = l.beds || l.bedrooms;')).length > 0);
await check('mutazione: la copia che accetta 15 camere cade', () =>
  parita(COPIE['apartments.html'].replace('n >= 0 && n <= 10', 'n >= 0 && n <= 20')).length > 0);
// rinomina e scriviCamere esistono in tre pagine: vetrina, home e le «altre
// case» della scheda. Una copia che diverge è un nome o una voce diversi
// sulla stessa casa — si pretende che siano IDENTICHE, come camereDi
for (const nome of ['rinomina', 'scriviCamere']) {
  const c = ['apartments.html', 'index.html', 'apartment-detail.html'].map((f) => [f, estrai(P[f], nome)]);
  await check(`${nome}: la STESSA funzione in vetrina, home e scheda (le «altre case»)`, () =>
    c.every(([, s]) => s) && c.every(([, s]) => s === c[0][1]) ? true : JSON.stringify(c.map(([f, s]) => [f, s && s.length])));
}
{
  // scriviCamere eseguita su un DOM minimo: null = attributo vuoto, mai «0»
  const fn = new Function('document', 'return (' + estrai(P['apartments.html'], 'scriviCamere') + ')');
  const nodo = (tipo, v) => ({ nodeType: tipo, nodeValue: v, tagName: tipo === 1 ? 'I' : undefined, textContent: v });
  const finta = (letti) => {
    const kids = [nodo(3, 'Prati '), nodo(1, '·'), nodo(3, ' 60 m² '), nodo(1, '·'), nodo(3, ' 1 bed')];
    kids.forEach((k, i) => { k.previousSibling = kids[i - 1] || null; });
    const r2 = { childNodes: kids, removeChild(x) { kids.splice(kids.indexOf(x), 1); }, appendChild(x) { kids.push(x); } };
    return { dataset: { letti }, querySelector: () => r2, r2 };
  };
  const scrivi = fn({ createElement: () => nodo(1, ''), createTextNode: (t) => nodo(3, t) });
  const a = finta('1'); scrivi(a, null);
  const b = finta('1'); scrivi(b, 0);
  await check('scriviCamere: camere ignote → data-letti «» e la voce sparisce; 0 → «0» e «Studio»', () =>
    a.dataset.letti === '' && !a.r2.childNodes.some((x) => /bed|Studio/.test(x.nodeValue || ''))
    && b.dataset.letti === '0' && b.r2.childNodes.some((x) => /^\s*Studio$/.test(x.nodeValue || ''))
      ? true : JSON.stringify({ a: a.dataset.letti, b: b.dataset.letti }));
}
{
  // la ricerca libera piega entrambi i lati: accenti e apostrofo tipografico
  const src = estrai(P['apartments.html'], 'piega');
  const piega = src && new Function('return (' + src + ')')();
  await check('la ricerca libera: piega() toglie gli accenti, porta ’ ‘ ʼ all\'apostrofo, e passa() la usa su ENTRAMBI i lati', () =>
    piega && piega('Endertà Room') === 'enderta room' && piega('SANT’ANNA') === "sant'anna" && piega("sant'anna") === "sant'anna"
    && piega('Coppedè  ’') === "coppede '" && piega(null) === ''
    && /piega\(c\.dataset\.cerca\)\.indexOf\(piega\(stato\.q\)\)/.test(P['apartments.html'])
      ? true : (piega ? JSON.stringify([piega('Endertà Room'), piega('SANT’ANNA')]) : 'piega assente'));
}

console.log('\nLE GIUNZIONI — chi chiama la regola, e chi non legge più `beds || bedrooms`');
for (const f of ['apartments.html', 'index.html']) {
  await check(`${f}: l'idrante rinomina la carta e ne riscrive le camere, e il setaccio rilegge`, () =>
    /if \(rinomina\(card, d\.nome\)\) ritocco = true;/.test(P[f])
    && /if \(d\.camere !== undefined && scriviCamere\(card, d\.camere\)\) ritocco = true;/.test(P[f])
    && /camere: v\('bedrooms'\) != null \|\| v\('beds'\) != null\s*\? camereDi\(\{ bedrooms: v\('bedrooms'\), beds: v\('beds'\) \}\) : undefined/.test(P[f])
    && /if \(ritocco && window\.__muroInnesta\) window\.__muroInnesta\(\[\]\);/.test(P[f]));
  await check(`${f}: l'innesto legge le camere con camereDi, e camere ignote danno data-letti vuoto (mai «0»)`, () =>
    /var letti = camereDi\(\{ bedrooms: testo\(f\.bedrooms\), beds: testo\(f\.beds\) \}\);/.test(P[f])
    && /a\.dataset\.letti = letti == null \? '' : String\(letti\);/.test(P[f])
    && !/intero\(testo\(f\.bedrooms\)/.test(P[f]) && !/String\(letti \|\| 0\)/.test(P[f]));
}
await check('apartments.html: passa() e la scheda del paragone trattano data-letti vuoto come «non si sa» (nessun filtro camere, «—»)', () =>
  /var l = lettiDi\(c\);\s*if \(l === null\) return false;/.test(P['apartments.html'])
  && /x\.letti === 0 \? 'Studio' : x\.letti == null \? '—' : x\.letti/.test(P['apartments.html'])
  && !/\+\(c\.dataset\.letti \|\| 0\)/.test(P['apartments.html']) && !/letti: \+c\.dataset\.letti \|\| 0/.test(P['apartments.html']));
await check('apartment-detail.html: la scheda usa il motore vero (BOOM_FACTS.bedroomsOf) e rilegge nome e camere dal documento', () =>
  /letti: camereDi\(d\),/.test(P['apartment-detail.html'])
  && /if \(!F \|\| !F\.bedroomsOf\) return undefined;/.test(P['apartment-detail.html'])
  && !/d\.bedrooms != null \? d\.bedrooms : d\.beds/.test(P['apartment-detail.html'])
  && /function digest\(nume, testo, grezzo\)/.test(P['apartment-detail.html'])
  && /if \(nomeNuovo\) \{ scriviNome\(\); rifaiPorte\(\); \}/.test(P['apartment-detail.html'])
  && /if \(l2 !== undefined && l2 !== c\.letti\) \{ c\.letti = l2; lettiNuovi = true; \}/.test(P['apartment-detail.html'])
  && /if \(lettiNuovi\) scriviFatti\(\);/.test(P['apartment-detail.html']));
await check('apartment-detail.html: le «altre case» si rileggono con UNA richiesta (documents:batchGet), nella seconda rilettura', () =>
  /documents:batchGet/.test(P['apartment-detail.html'])
  && /if \(VERO\) setTimeout\(function \(\) \{\s*rileggiAltre\(\);/.test(P['apartment-detail.html'])
  && (P['apartment-detail.html'].match(/fetch\(/g) || []).length >= 2);
await check('apartment-detail.html: l\'iframe del video si costruisce coi nodi (il nome mai dentro innerHTML)', () =>
  /fr\.setAttribute\('title', 'Video tour of ' \+ \(c\.nome \|\| 'this apartment'\)\);/.test(P['apartment-detail.html'])
  && !/innerHTML = '<iframe/.test(P['apartment-detail.html']));
await check('board.html: il tabellone vivo legge le camere con camereDi (prima solo parseInt(bedrooms))', () =>
  /var beds = camereDi\(\{ bedrooms: v\('bedrooms'\), beds: v\('beds'\) \}\);/.test(P['board.html'])
  && !/parseInt\(v\('bedrooms'\), 10\)/.test(P['board.html']));
{
  // il tabellone VIVO, eseguito: laneRows di board.html sul motore delle
  // corsie vero, coi documenti nella forma REST (integerValue = stringa)
  const DISPO = require('../../js/dispo-engine.js');
  const laneRows = new Function('window', estrai(P['board.html'], 'camereDi') + '\n'
    + estrai(P['board.html'], 'laneRows') + '\nreturn laneRows;')({ BOOM_DISPO: DISPO });
  const SV = (v) => ({ stringValue: String(v) }), IV = (v) => ({ integerValue: String(v) });
  const righe = laneRows([
    { fields: { zone: SV('CAPPELLARI'), status: SV('available'), price: IV(1500), bedrooms: IV(1), beds: SV('3') } },
    { fields: { zone: SV('CAPRI'), status: SV('available'), price: IV(1750), bedrooms: IV(2), beds: SV('Living , 1 bedroom') } },
    { fields: { zone: SV('AVIGNONESI'), status: SV('available'), price: IV(900), bedrooms: IV(0) } },
    { fields: { zone: SV('SOLOTESTO'), status: SV('available'), price: IV(1000), beds: SV('Living, 2 bedrooms') } },
    { fields: { zone: SV('BUIO'), status: SV('available'), price: IV(1000), bedrooms: SV('abc') } },
  ]);
  const tipo = (z) => ((righe && [...righe.part, ...righe.arr].find((x) => x.zona === z)) || {}).tipo;
  await check('board.html vivo: 1BR per il Cappellari (il testo «3» non vince), 2BR per il Capri, STU per un monolocale, il testo quando manca il campo, niente se illeggibile', () =>
    tipo('CAPPELLARI') === '1BR' && tipo('CAPRI') === '2BR' && tipo('AVIGNONESI') === 'STU'
    && tipo('SOLOTESTO') === '2BR' && tipo('BUIO') === ''
      ? true : JSON.stringify(righe && [...righe.part, ...righe.arr].map((x) => [x.zona, x.tipo])));
}
{
  // la scheda di una casa nata dopo la build, eseguita: casaDaListing col
  // motore vero (il digest poi la rilegge, e da solo nasconderebbe l'errore)
  const casaDa = (facts) => {
    const win = { BOOM_FACTS: facts, BOOM_DISPO: require('../../js/dispo-engine.js'),
      BOOM_GEO: require('../../js/boom-geo.js') };
    return new Function('window', 'BOOM_DISPO', 'BOOM_GEO', [
      estrai(P['apartment-detail.html'], 'statoDa'), estrai(P['apartment-detail.html'], 'camereDi'),
      estrai(P['apartment-detail.html'], 'casaDaListing'), 'return casaDaListing;'].join('\n'))(win, win.BOOM_DISPO, win.BOOM_GEO);
  };
  const conFacts = casaDa(FACTS), senza = casaDa(undefined);
  const letti = (fn, d) => fn(Object.assign({ name: 'X', status: 'available', price: 1000 }, d), 'X').letti;
  await check('apartment-detail.html casaDaListing: bedrooms 0 → 0 (monolocale), 1.5 → il testo «2», il Cappellari 1 (non il «3» del testo), solo testo → il testo, niente → null', () => {
    const v = [letti(conFacts, { bedrooms: 0, beds: '3' }), letti(conFacts, { bedrooms: 1.5, beds: '2' }), letti(conFacts, { bedrooms: 1, beds: '3' }),
      letti(conFacts, { beds: 'Living , 1 bedroom with balcony , 1 bedroom' }), letti(conFacts, { bedrooms: 2, beds: 'Living , 1 bedroom' }), letti(conFacts, {})];
    return JSON.stringify(v) === JSON.stringify([0, 2, 1, 1, 2, null]) ? true : JSON.stringify(v);
  });
  await check('apartment-detail.html senza js/listing-facts.js: camereDi dice undefined (NON LO SO), mai null — il digest non cancella', () =>
    letti(senza, { bedrooms: 2 }) === undefined ? true : String(letti(senza, { bedrooms: 2 })));
}
await check('nessuna delle sei pagine legge più `beds || bedrooms` (il primo numero del testo libero)', () => {
  const g = [];
  for (const [f, s] of Object.entries(P)) if (/\bbeds\s*\|\|\s*[\w.]*bedrooms/.test(s)) g.push(f);
  return esito(g);
});

// ═══ I TUOI LUOGHI — i nomi che vengono da fuori restano testo ═══
// Il localStorage (boom:pois, condiviso con /skyline) e la risposta di
// Photon (dati di OpenStreetMap, un servizio di terzi) sono dati di FUORI:
// nel blocco che li scrive nessun nodo nasce da una stringa di markup. La
// prova vera è in Chromium, più sotto; questa regola tiene anche dove il
// browser non c'è, sulla pagina E sul frammento da cui la pagina nasce.
console.log('\nI TUOI LUOGHI — il localStorage e Photon scrivono testo, mai markup');
const LUOGHI = ["var CHIAVE = 'boom:pois';", '\n    righeGiu();\n  })();'];
// le due funzioni COM'ERANO fino al 15/10/2026 (la risposta di Photon stava
// dentro il .then, qui con il suo nome): la mutazione che rimette il
// difetto, qui, nei frammenti e nel browser
const VECCHI_LUOGHI = {
  righeGiu: `function righeGiu() {
      var a = letti();
      righe.innerHTML = a.length ? a.map(function (p, i) {
        return '<div class="luogo"><b>' + p.name + '</b><i>'
          + tempo(km(c.lat, c.lng, p.lat, p.lng)) + '</i>'
          + '<button type="button" data-i="' + i + '" aria-label="Remove '
          + p.name + '">✕</button></div>';
      }).join('') : '<p class="luoghi-vuota">Nothing saved yet — type your '
        + 'office or campus above, once.</p>';
    }`,
  sugGiu: `function sugGiu(j) {
      sug.innerHTML = (j.features || []).slice(0, 4)
        .map(function (ft) {
          var p = ft.properties || {};
          var nome = p.name || p.street || 'Place';
          var dove = [p.suburb || p.district, p.city]
            .filter(Boolean).join(', ');
          return '<button type="button" data-lat="'
            + ft.geometry.coordinates[1] + '" data-lng="'
            + ft.geometry.coordinates[0] + '" data-n="'
            + String(nome).replace(/"/g, '') + '"><b>' + nome
            + '</b><span>' + dove + '</span></button>';
        }).join('')
        || '<p class="luoghi-vuota">Nothing found — try the street '
        + 'or the campus name.</p>';
    }`,
};
const guaiLuoghi = (s) => {
  const i = s.indexOf(LUOGHI[0]), j = i < 0 ? -1 : s.indexOf(LUOGHI[1], i);
  if (s.split(LUOGHI[0]).length !== 2 || j < 0) return ['il blocco dei luoghi non si trova, una volta sola'];
  // il codice, non i commenti (che raccontano il difetto apposta)
  const codice = s.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, '');
  const g = (codice.match(/\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write/g) || []).map((x) => x + ' nel blocco');
  for (const f of ['vuotaGiu', 'righeGiu', 'sugGiu']) if (!codice.includes('function ' + f + '(')) g.push(f + '() non c\'è');
  if (!codice.includes('.then(sugGiu)')) g.push('la risposta di Photon non passa da sugGiu');
  return g;
};
for (const [f, s] of [['apartment-detail.html', P['apartment-detail.html']], ['design/pages-deco/ld-regia.html', leggi('design/pages-deco/ld-regia.html')]])
  await check(`${f}: nel blocco dei luoghi nessun nodo nasce da una stringa (né innerHTML, né outerHTML, né insertAdjacentHTML) e la risposta di Photon passa da sugGiu`,
    () => esito(guaiLuoghi(s)));
await check('mutazione: righeGiu col vecchio innerHTML → la regola cade; sugGiu col vecchio innerHTML → cade anche lei', () => {
  const D = P['apartment-detail.html'];
  const a = guaiLuoghi(muta(D, estrai(D, 'righeGiu'), VECCHI_LUOGHI.righeGiu));
  const b = guaiLuoghi(muta(D, estrai(D, 'sugGiu'), VECCHI_LUOGHI.sugGiu));
  return a.length && b.length ? true : JSON.stringify({ a, b });
});

// ═══ I BUILDER PYTHON — la stessa regola, il gemello in design/ ═══
console.log('\nI BUILDER — design/listing_facts.py e i costruisci-*.py');
const PY = ['python3', 'python'].find((p) => spawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0);
const BUILDER = ['design/pages-deco/costruisci-ad.py', 'design/pages-deco/costruisci-ap.py', 'design/pages-deco/costruisci-kiosk.py',
  'design/pages-deco/costruisci-portale.py', 'design/home-live-deco/costruisci-home.py', 'design/home-live-deco/costruisci-quieta.py',
  'design/pages-deco/costruisci-casa.py', 'design/pages-deco/costruisci-prova.py', 'design/pages-deco/costruisci-ld.py'];
await check(`i ${BUILDER.length} builder che leggono le camere importano la regola UNA (listing_facts.bedrooms_of) e non se ne scrivono un'altra`, () => {
  const g = [];
  for (const f of BUILDER) {
    // il codice, non i commenti (che raccontano la regola vecchia apposta)
    const s = leggi(f).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    if (!/from listing_facts import [^\n]*bedrooms_of/.test(s)) g.push(f + ': non importa bedrooms_of');
    if (/\.get\('beds'\)|\.get\('bedrooms'\)/.test(s)) g.push(f + ': legge ancora beds/bedrooms a mano');
    if (/str\(c or ''\)|bedrooms'\) or '1'|\{b or 0\}/.test(s)) g.push(f + ': una regola vecchia');
  }
  if (!/data-letti="\{'' if b is None else b\}"/.test(leggi('design/pages-deco/costruisci-ad.py'))) g.push('costruisci-ad.py: data-letti per camere ignote non è vuoto');
  if (!/'id': r\['id'\],/.test(leggi('design/pages-deco/costruisci-kiosk.py'))) g.push('costruisci-kiosk.py: le righe non portano l\'id');
  if (!/data-id="\{_html\.escape\(str\(p\["id"\]\)\)\}"/.test(leggi('design/pages-deco/costruisci-soldi.py'))) g.push('costruisci-soldi.py: i tasti non portano data-id');
  return esito(g);
});
if (!PY) {
  salta('la parità del gemello Python e i builder rifatti', 'python3 non c\'è su questa macchina');
} else {
  const par = spawnSync(PY, ['-B', join(ROOT, 'design', 'listing_facts.py')], { encoding: 'utf8', timeout: 90000,
    env: { ...process.env, BOOM_NODE: process.execPath, PYTHONDONTWRITEBYTECODE: '1' } });
  await check('design/listing_facts.py: bedrooms_of = FACTS.bedroomsOf (Node), sulle fotografie e sui casi limite', () =>
    par.status === 0 && /^PASS /m.test(par.stdout) ? true : (par.stdout + par.stderr).slice(-400));
  // i builder rifatti OGGI, su una copia di design/ (foto-uri e foto-casa
  // sono file di lavoro mai versionati: qui vuoti — il modo `sito` non li usa)
  const CINQUE = ['costruisci-ad.py', 'costruisci-kiosk.py', 'costruisci-soldi.py', 'costruisci-prova.py', 'costruisci-ld.py'];
  const costruisci = (ritocca, quali = [...CINQUE, 'costruisci-portale.py']) => {
    const d = mkdtempSync(join(tmpdir(), 'boom-build-'));
    cpSync(join(ROOT, 'design'), join(d, 'design'), { recursive: true });
    const H = join(d, 'design', 'home-live-deco'), PD = join(d, 'design', 'pages-deco');
    for (const f of readdirSync(PD)) if (statSync(join(PD, f)).isFile()) copyFileSync(join(PD, f), join(H, f));
    writeFileSync(join(H, 'foto-uri.json'), '{}');
    writeFileSync(join(H, 'foto-casa.json'), '[]');
    if (ritocca) ritocca(H);
    const errori = [];
    for (const b of quali) {
      const x = spawnSync(PY, ['-B', b, 'sito'], { cwd: H, encoding: 'utf8', timeout: 120000,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
      if (x.status !== 0) errori.push(b + ': ' + (x.stderr || x.stdout).trim().split('\n').pop());
    }
    const out = (n) => readFileSync(join(H, n), 'utf8');
    return { d, H, errori, out };
  };
  // ── I FRAMMENTI: la ricostruzione «sito» non toglie niente di oggi ──────
  // apartments.html nasce da costruisci-ad.py (ad-regia.html + l'idrante
  // vetrina-idrante.html, appeso tale e quale), index.html da
  // costruisci-portale.py (lo stesso idrante), apartment-detail.html da
  // costruisci-ld.py (ld-regia.html). Un blocco che vive solo nella pagina
  // sparisce alla prossima build, e nessuno se ne accorge: le funzioni e i
  // blocchi di oggi devono stare IDENTICI nella pagina e nella ricostruzione.
  // La deriva che c'era già prima (righe vecchie di ld-regia, cinque righe
  // del Solari nell'idrante della home) resta fuori di proposito: qui si
  // controlla ciò che è di oggi.
  // Una funzione `function nome(` finisce alla prima graffa chiusa alla SUA
  // indentazione (il codice è formattato così ovunque); un blocco «da…a»
  // va dal primo testo (unico) al primo secondo testo dopo.
  const bloccoFn = (src, nome) => {
    const m = [...src.matchAll(new RegExp('^([ \\t]*)function ' + nome + '\\s*\\(', 'gm'))];
    if (m.length !== 1) return { n: m.length };
    const ind = m[0][1], i0 = m[0].index, fine = src.indexOf('\n' + ind + '}', i0);
    return { n: 1, testo: fine < 0 ? null : src.slice(i0, fine + ind.length + 2) };
  };
  const bloccoTra = (src, da, a) => {
    const n = src.split(da).length - 1;
    if (n !== 1) return { n };
    const i0 = src.indexOf(da), i1 = src.indexOf(a, i0);
    return { n: 1, testo: i1 < 0 ? null : src.slice(i0, i1 + a.length) };
  };
  const OGGI = {
    'apartments.html': ['boom-discovery-sito.html', 'costruisci-ad.py', [
      ['piega'], ['lettiDi'], ['passa'], ['scheda'], ['escT'], ['tabella'],
      ['camereDi'], ['rinomina'], ['scriviCamere'], ['innesta'],
      ["nome: String(v('name') || '')", ': undefined'],
      ['/* il nome e le camere del documento vero (15/10/2026)', 'window.__muroInnesta([]);']]],
    'index.html': ['boom-portale-sito.html', 'costruisci-portale.py', [
      ['camereDi'], ['rinomina'], ['scriviCamere'],
      ["nome: String(v('name') || '')", ': undefined'],
      ['/* il nome e le camere del documento vero (15/10/2026)', 'window.__muroInnesta([]);'],
      ['/* le camere con la regola UNA (camereDi), come le carte di build */', 'a.dataset.mq = String(mq);']]],
    'apartment-detail.html': ['boom-casa-p-sito.html', 'costruisci-ld.py', [
      ['camereDi'], ['scriviNome'], ['scriviFatti'], ['escA'], ['montaPrezzo'], ['rinomina'],
      ['scriviCamere'], ['ritoccaAltra'], ['rileggiAltre'],
      ['<script src="/js/listing-facts.js"></script>', '<script src="/js/listing-facts.js"></script>'],
      ['letti: camereDi(d),', 'letti: camereDi(d),'],
      ['    rifaiChiedi = function () {', '    rifaiChiedi();'],
      ['/* IL NOME E LE CAMERE (15/10/2026)', 'if (lettiNuovi) scriviFatti();'],
      ['case» in fondo (rileggiAltre, qui sotto: una richiesta sola) */', 'rileggiAltre();'],
      ["var fr = document.createElement('iframe');", 'box.appendChild(fr);'],
      ["var boxAltre = document.getElementById('altre');", "}).join('');"],
      ['var altreCarte = ', 'if (fp) montaPrezzo(fp);'],
      ['/* le dotazioni vengono dal documento', '})();'],
      // i tuoi luoghi (16/10/2026): i nomi del localStorage e di Photon
      // come testo — le funzioni, e il blocco intero perché anche i
      // gestori anonimi (ricerca, scelta) sono cambiati
      ['vuotaGiu'], ['righeGiu'], ['sugGiu'],
      ['/* i tuoi luoghi: scritti una volta, ogni casa risponde.', '    righeGiu();\n  })();']]],
  };
  const guaiFrammenti = (pagina, costruita) => {
    const g = [];
    for (const b of OGGI[pagina][2]) {
      const [p, c] = b.length === 1 ? [bloccoFn(P[pagina], b[0]), bloccoFn(costruita, b[0])]
        : [bloccoTra(P[pagina], b[0], b[1]), bloccoTra(costruita, b[0], b[1])];
      const nome = b.length === 1 ? b[0] + '()' : '«' + b[0].trim().slice(0, 44) + '»';
      if (p.n !== 1 || !p.testo) { g.push(nome + ': nella pagina ' + p.n + ' volte'); continue; }
      if (c.n !== 1 || !c.testo) { g.push(nome + ': nella ricostruzione ' + c.n + ' volte'); continue; }
      if (p.testo !== c.testo) {
        const a = p.testo.split('\n'), z = c.testo.split('\n');
        const i = a.findIndex((l, k) => l !== z[k]);
        g.push(`${nome}: diverso alla riga ${i + 1} — pagina «${String(a[i]).trim().slice(0, 60)}» / ricostruzione «${String(z[i]).trim().slice(0, 60)}»`);
      }
    }
    return g;
  };
  const B = costruisci();
  try {
    await check('i builder girano (ad, kiosk, soldi, prova, ld, portale) col gemello importato', () => esito(B.errori));
    if (!B.errori.length) {
      const idrante = leggi('design/pages-deco/vetrina-idrante.html').trim();
      await check('apartments.html porta l\'idrante di design/pages-deco/vetrina-idrante.html TALE E QUALE (costruisci-ad.py lo appende senza toccarlo)', () =>
        P['apartments.html'].includes(idrante) && B.out('boom-discovery-sito.html').includes(idrante) ? true
          : 'la pagina e il frammento divergono: ' + JSON.stringify(guaiFrammenti('apartments.html', B.out('boom-discovery-sito.html'))).slice(0, 300));
      for (const [pagina, [file, builder]] of Object.entries(OGGI)) {
        await check(`${pagina}: i blocchi di oggi (${OGGI[pagina][2].length}) sono IDENTICI nella ricostruzione «sito» di ${builder} — la prossima build non li toglie`,
          () => esito(guaiFrammenti(pagina, B.out(file))));
      }
    }
    if (!B.errori.length) {
      await check('costruisci-ad.py rifatto: ogni carta dice le camere della fotografia (data-letti, «· N bed») — il Capri non torna «1 bed»', () => {
        const g = [];
        const cc = carte(B.out('boom-discovery-sito.html'));
        if (cc.length < 10) g.push(cc.length + ' carte');
        for (const c of cc) {
          const a = ATTESO.get(c.id);
          if (!a) continue;
          if (c.letti !== lettiAttr(a.n) || c.bed !== voce(a.n)) g.push(`${c.id}: «${c.letti}»/«${c.bed}» invece di «${lettiAttr(a.n)}»/«${voce(a.n)}»`);
          if (c.nome !== a.name) g.push(`${c.id}: «${c.nome}»`);
        }
        return esito(g);
      });
      await check('costruisci-kiosk.py rifatto: le righe portano l\'id, e id/zona/tipo/prezzo sono quelli di board.html', () => {
        const K = caseJson(B.out('boom-kiosk-sito.html')) || [], BD = caseJson(P['board.html']) || [];
        const chiave = (x) => [x.id, x.zona, x.tipo, x.prezzo].join('|');
        return K.length && K.every((x) => x.id) && K.map(chiave).join('\n') === BD.map(chiave).join('\n')
          ? true : JSON.stringify(K.map(chiave).filter((k, i) => k !== (BD[i] && chiave(BD[i]))).slice(0, 3));
      });
      const blocco = (h) => (h.match(/<div class="soldi-preset"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
      await check('costruisci-soldi.py rifatto: i tre tasti (data-id compreso) sono byte identici a your-money.html — gli id senza cambiare ciò che si vede', () =>
        blocco(B.out('boom-soldi-sito.html')) === blocco(P['your-money.html']) ? true : String(blocco(B.out('boom-soldi-sito.html'))).slice(0, 300));
      const pulsanti = (h) => (h.match(/<button type="button" class="pv-casa"[\s\S]*?<\/button>/g) || []).join('\n');
      await check('costruisci-prova.py rifatto: i tre pulsanti sono byte identici a try.html (camere dalla regola, mai «1» inventato)', () =>
        pulsanti(B.out('boom-prova-sito.html')) === pulsanti(P['try.html']) ? true : pulsanti(B.out('boom-prova-sito.html')).slice(0, 300));
      await check('costruisci-ld.py rifatto: il CASE della scheda dice gli stessi id, nomi e camere di apartment-detail.html', () => {
        // per id, non per posizione: il builder ordina per «libera adesso»,
        // che dipende dalla data del giorno in cui gira
        const L = caseJson(B.out('boom-casa-p-sito.html')) || [], D = caseJson(P['apartment-detail.html']) || [];
        const mappa = (xs) => new Map(xs.map((x) => [x.id, x.nome + '|' + x.letti]));
        const ml = mappa(L), md = mappa(D);
        const g = [];
        if (!L.length || ml.size !== md.size) g.push(`${ml.size} case contro ${md.size}`);
        for (const [id, v] of md) if (ml.get(id) !== v) g.push(`${id}: «${ml.get(id)}» invece di «${v}»`);
        return esito(g);
      });
    }
  } finally { rmSync(B.d, { recursive: true, force: true }); }
  // camere che non si leggono: il builder non stampa «0» né «Studio».
  // E i casi che DIVIDONO la regola nuova dalle vecchie, scritti qui e non
  // presi dal catalogo (che domani può non averli più): il campo batte il
  // testo (navona, fotografia della home: bedrooms 2 contro «1 Bedroom»),
  // 1.5 non è un intero (navona, fotografia piena: vale il testo «2»), e
  // 0 è un monolocale (le case libere che /try sceglie: «Studio», mai «1»).
  // Lo 0 è il NUMERO, come Firestore lo dà (integerValue): la regola
  // vecchia di /try (`bedrooms or '1'`) lo prendeva per «niente» e
  // inventava una camera; uno «0» stringa lo leggeva giusto, e il caso
  // non dividerebbe le due regole
  const B2 = costruisci((H) => {
    const lr = JSON.parse(readFileSync(join(H, 'live-rows.json'), 'utf8'));
    for (const r of lr) {
      if (r.id === 'piemonte') { r.bedrooms = null; r.beds = 'n/a'; }
      if (r.id === 'navona') { r.bedrooms = '2'; r.beds = '1 Bedroom'; }
    }
    writeFileSync(join(H, 'live-rows.json'), JSON.stringify(lr));
    const cf = JSON.parse(readFileSync(join(H, 'case-full.json'), 'utf8'));
    for (const d of cf) {
      if (d._id === 'piemonte') { d.bedrooms = 'abc'; d.beds = 'n/a'; }
      if (d._id === 'navona') { d.bedrooms = '1.5'; d.beds = '2 Bedrooms'; }
      if (d.status === 'available') d.bedrooms = 0;
    }
    writeFileSync(join(H, 'case-full.json'), JSON.stringify(cf));
  }, CINQUE);
  try {
    await check('builder con camere illeggibili (Piemonte): data-letti vuoto e nessuna voce in vetrina, «FLT» sul tabellone, letti null nella scheda', () => {
      if (B2.errori.length) return esito(B2.errori);
      const c = carte(B2.out('boom-discovery-sito.html')).find((x) => x.id === 'piemonte');
      const k = (caseJson(B2.out('boom-kiosk-sito.html')) || []).find((x) => x.id === 'piemonte');
      const l = (caseJson(B2.out('boom-casa-p-sito.html')) || []).find((x) => x.id === 'piemonte');
      return c && c.letti === '' && c.bed === null && k && k.tipo === 'FLT' && l && l.letti === null
        ? true : JSON.stringify({ c: c && { letti: c.letti, bed: c.bed }, k, l: l && l.letti });
    });
    await check('builder sui casi che dividono le regole: il campo batte il testo (vetrina «2 bed», tabellone «2BR»), 1.5 vale il testo (scheda 2), 0 è «Studio» su /try (mai «1 bed»)', () => {
      if (B2.errori.length) return esito(B2.errori);
      const g = [];
      const c = carte(B2.out('boom-discovery-sito.html')).find((x) => x.id === 'navona');
      if (!c || c.letti !== '2' || c.bed !== '2 bed') g.push('vetrina navona: ' + JSON.stringify(c && { letti: c.letti, bed: c.bed }));
      const k = (caseJson(B2.out('boom-kiosk-sito.html')) || []).find((x) => x.id === 'navona');
      if (!k || k.tipo !== '2BR') g.push('tabellone navona: ' + JSON.stringify(k));
      const l = (caseJson(B2.out('boom-casa-p-sito.html')) || []).find((x) => x.id === 'navona');
      if (!l || l.letti !== 2) g.push('scheda navona: ' + JSON.stringify(l && l.letti));
      const pv = B2.out('boom-prova-sito.html').match(/<button type="button" class="pv-casa"[\s\S]*?<\/button>/g) || [];
      if (pv.length !== 3) g.push(pv.length + ' pulsanti su /try');
      for (const b of pv) {
        const info = (b.match(/<span class="info"><b>[^<]*<\/b><span>([^<]*)<\/span>/) || [])[1];
        if (!info || !/ · Studio$/.test(info)) g.push('/try: «' + info + '» invece di «<zona> · Studio»');
      }
      return esito(g);
    });
  } finally { rmSync(B2.d, { recursive: true, force: true }); }
  // la MUTAZIONE dei frammenti: un blocco tolto dal frammento (e solo da lì)
  // deve far cadere la regola — la pagina ce l'ha, la ricostruzione no
  const B3 = costruisci((H) => {
    const togli = (f, nome) => {
      const s = readFileSync(join(H, f), 'utf8'), b = bloccoFn(s, nome);
      if (b.n !== 1 || !b.testo) throw new Error('mutazione senza appiglio: ' + nome + ' in ' + f);
      writeFileSync(join(H, f), s.replace(b.testo, ''));
    };
    togli('ld-regia.html', 'rileggiAltre');
    togli('ad-regia.html', 'piega');
    // il frammento che tiene il vecchio innerHTML dei luoghi (la pagina no)
    const ld = readFileSync(join(H, 'ld-regia.html'), 'utf8'), rg = bloccoFn(ld, 'righeGiu');
    if (rg.n !== 1 || !rg.testo) throw new Error('mutazione senza appiglio: righeGiu in ld-regia.html');
    writeFileSync(join(H, 'ld-regia.html'), ld.replace(rg.testo, () => '    ' + VECCHI_LUOGHI.righeGiu));
    writeFileSync(join(H, 'vetrina-idrante.html'), muta(readFileSync(join(H, 'vetrina-idrante.html'), 'utf8'),
      "a.dataset.letti = letti == null ? '' : String(letti);", 'a.dataset.letti = String(letti || 0);'));
  }, ['costruisci-ad.py', 'costruisci-portale.py', 'costruisci-ld.py']);
  try {
    await check('mutazione: un blocco tolto dal frammento (rileggiAltre da ld-regia, piega da ad-regia, l\'innesto vecchio in vetrina-idrante) o rimesso com\'era (righeGiu con innerHTML in ld-regia) → la regola dei frammenti cade su tutte e tre le pagine', () => {
      if (B3.errori.length) return esito(B3.errori);
      const ga = guaiFrammenti('apartments.html', B3.out('boom-discovery-sito.html'));
      const gi = guaiFrammenti('index.html', B3.out('boom-portale-sito.html'));
      const gd = guaiFrammenti('apartment-detail.html', B3.out('boom-casa-p-sito.html'));
      return ga.some((x) => x.startsWith('piega()')) && ga.some((x) => x.startsWith('innesta()'))
        && gi.some((x) => x.includes('le camere con la regola UNA')) && gd.some((x) => x.startsWith('rileggiAltre()'))
        && gd.some((x) => x.startsWith('righeGiu()'))
        ? true : JSON.stringify({ ga, gi, gd }).slice(0, 500);
    });
  } finally { rmSync(B3.d, { recursive: true, force: true }); }
}

// ═══ IN CHROMIUM — l'idrante rinomina e corregge, l'innesto e la scheda pure ═══
const chromium = await loadChromium();
if (!chromium) {
  if (fail) { console.log(`\nCATALOGO VETRINA: ${fail} GUASTI su ${pass + fail} (statico; il browser non c'è)`); process.exit(1); }
  console.log(`SKIP: playwright non disponibile — statico verde (${pass} check); npm i -D playwright-core, oppure BOOM_PLAYWRIGHT=/percorso/index.js`);
  process.exit(0);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = p === '/' ? '/index.html' : (!extname(p) ? p + '.html' : p);
  try {
    const buf = await readFile(join(ROOT, fp));
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'text/plain' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const S = (v) => ({ stringValue: String(v) });
const I = (v) => ({ integerValue: String(v) });
const ARR = (xs) => ({ arrayValue: { values: xs } });
const FOTO_URL = 'https://firebasestorage.googleapis.com/v0/b/x/o/listings%2Fenhanced%2Fnuova%2Fcover.jpg?alt=media';
const doc = (id, fields) => ({ name: 'projects/boom-property-dashboards/databases/(default)/documents/listings/' + id, fields });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const ANNO = new Date().getFullYear() + 1;
const LISTA = { documents: [
  // il Cappellari: un nome scelto dall'operatore, camere 1 (il testo dice 3)
  doc('OLLVsiKhPrhpT1fx8XmB', { name: S('Cappellari One-Bed'), status: S('waitlist'), price: I(1500),
    bedrooms: I(1), beds: S('3'), availableDate: S(ANNO + '-01-31') }),
  // il Capri: un nome che NESSUNA build conosce, e tre camere
  doc('wvX0h0lBoNKOMuTuHkVI', { name: S('Zzyzx Two-Bed'), status: S('waitlist'), price: I(1750), bedrooms: I(3) }),
  // Ripetta: monolocale (0) → «Studio»
  doc('ripetta', { name: S('Ripetta Terrace'), status: S('waitlist'), price: I(2300), bedrooms: I(0) }),
  // Coronari: il documento TACE sulle camere → la build resta
  doc('navona', { name: S('Coronari Classic'), status: S('waitlist'), price: I(1800) }),
  // Piemonte: dice qualcosa che non si legge → la voce sparisce
  doc('piemonte', { name: S('Piemonte Attic'), status: S('waitlist'), price: I(1300), bedrooms: S('abc'), beds: S('n/a') }),
  // la home: Tor di Quinto con un nome nuovo e due camere
  doc('ttvrjazww9oe4tA0wHTf', { name: S('Tor di Quinto Corner One-Bed'), status: S('available'), price: I(1250), bedrooms: I(2) }),
  // l'innesto: solo il testo libero → la regola lo legge
  doc('nuovaX', { name: S('Nuova Via Uno'), zone: S('Prati'), status: S('available'), price: S('1400'),
    beds: S('Living, 2 bedrooms, 1 bath'), images: ARR([S(FOTO_URL)]),
    createdAt: S(new Date().toISOString()) }),
  // l'innesto: monolocale dichiarato → Studio
  doc('nuovaS', { name: S('Nuova Via Due'), zone: S('Prati'), status: S('available'), price: S('900'),
    bedrooms: I(0), beds: S('3'), images: ARR([S(FOTO_URL)]), createdAt: S(new Date().toISOString()) }),
  // l'innesto: un `bedrooms` che non è un intero (1.5) non vale → il testo
  // «2»; la regola di prima (il primo numero di bedrooms) diceva 1
  doc('nuovaT', { name: S('Nuova Via Tre'), zone: S('Prati'), status: S('available'), price: S('1100'),
    bedrooms: { doubleValue: 1.5 }, beds: S('2'), images: ARR([S(FOTO_URL)]), createdAt: S(new Date().toISOString()) }),
  // l'innesto: camere che non si leggono → data-letti vuoto, nessuna voce
  doc('nuovaB', { name: S('Nuova Via Quattro'), zone: S('Prati'), status: S('available'), price: S('1200'),
    bedrooms: S('boh'), images: ARR([S(FOTO_URL)]), createdAt: S(new Date().toISOString()) }),
] };
const browser = await chromium.launch(launchOptions());
const errs = [];
async function pagina(url, { scheda, lista = LISTA, ritardo = 0, batch, senzaFacts = false, ridotto = false, init } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block',
    ...(ridotto ? { reducedMotion: 'reduce' } : {}) });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(url + ' ' + String(e).split('\n')[0]));
  if (init) await pg.addInitScript(init);
  const richieste = [];
  await pg.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.includes('firestore.googleapis.com')) {
      if (/documents:batchGet/.test(u)) {
        richieste.push({ metodo: r.request().method(), tipo: r.request().headers()['content-type'] || '', corpo: r.request().postData() || '' });
        if (!batch) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        const out = await batch(JSON.parse(r.request().postData() || '{}'));
        return r.fulfill(out);
      }
      if (scheda && u.includes('/documents/listings/')) {
        const id = decodeURIComponent(u.split('/documents/listings/')[1].split('?')[0]);
        return scheda[id] ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(scheda[id]) })
          : r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
      if (/\/documents\/listings\?/.test(u)) {
        if (ritardo) await new Promise((ok) => setTimeout(ok, ritardo));
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lista) });
      }
      return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    if (senzaFacts && /\/js\/listing-facts\.js$/.test(u.split('?')[0])) return r.fulfill({ status: 503, body: '' });
    if (u.startsWith(BASE + '/')) return r.continue();
    if (u.includes('firebasestorage')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return r.abort();
  });
  await pg.goto(BASE + url);
  return { pg, ctx, richieste };
}

console.log('\nIN CHROMIUM — /apartments: l\'idrante rinomina, corregge le camere e il setaccio rilegge');
{
  const { pg, ctx } = await pagina('/apartments.html?q=zzyzx');
  await pg.waitForFunction(() => {
    const c = document.querySelector('.casa-p[data-id="wvX0h0lBoNKOMuTuHkVI"] .nome');
    return c && c.textContent === 'Zzyzx Two-Bed';
  }, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(700);
  const r = await pg.evaluate(() => {
    const leggi = (id) => {
      const c = document.querySelector('.casa-p[data-id="' + id + '"]');
      if (!c) return null;
      const r2 = c.querySelector('.riga2');
      return { nome: c.querySelector('.nome').textContent, alt: c.querySelector('.home-foto img').getAttribute('alt'),
        cerca: c.dataset.cerca, letti: c.dataset.letti, riga: r2 ? r2.textContent.replace(/\s+/g, ' ').trim() : '',
        via: c.classList.contains('via') };
    };
    return { ollv: leggi('OLLVsiKhPrhpT1fx8XmB'), capri: leggi('wvX0h0lBoNKOMuTuHkVI'), ripetta: leggi('ripetta'),
      navona: leggi('navona'), piemonte: leggi('piemonte'), x: leggi('nuovaX'), s: leggi('nuovaS'), t: leggi('nuovaT'),
      b: leggi('nuovaB'), conto: +document.getElementById('conto').textContent,
      vive: [...document.querySelectorAll('#muro .casa-p:not(.via)')].map((c) => c.dataset.id) };
  });
  await check('il Cappellari: Firestore dice «Cappellari One-Bed» → nome, alt e data-cerca rinominati, 1 bed', () =>
    r.ollv && r.ollv.nome === 'Cappellari One-Bed' && r.ollv.alt.startsWith('Cappellari One-Bed, ')
    && r.ollv.cerca.startsWith('cappellari one-bed ') && r.ollv.letti === '1' && /· 1 bed$/.test(r.ollv.riga)
      ? true : JSON.stringify(r.ollv));
  await check('il Capri: Firestore dice «Zzyzx Two-Bed», 3 camere → la carta lo dice (data-letti 3, «3 bed»)', () =>
    r.capri && r.capri.nome === 'Zzyzx Two-Bed' && r.capri.letti === '3' && /· 3 bed$/.test(r.capri.riga)
      ? true : JSON.stringify(r.capri));
  await check('?q=zzyzx (un nome che la build non conosce): dopo l\'idrante il setaccio rilegge e la carta c\'è, contata', () =>
    r.capri && !r.capri.via && r.conto === 1 && r.vive.length === 1 && r.vive[0] === 'wvX0h0lBoNKOMuTuHkVI'
      ? true : JSON.stringify({ conto: r.conto, vive: r.vive }));
  await check('bedrooms 0 → «Studio» (Ripetta), data-letti 0', () =>
    r.ripetta && /· Studio$/.test(r.ripetta.riga) && r.ripetta.letti === '0' ? true : JSON.stringify(r.ripetta));
  const navonaBuild = carte(P['apartments.html']).find((c) => c.id === 'navona');
  await check('un documento che TACE sulle camere lascia la build (Coronari)', () =>
    r.navona && r.navona.letti === navonaBuild.letti && r.navona.riga.endsWith('· ' + navonaBuild.bed) ? true : JSON.stringify(r.navona));
  await check('un documento che dice qualcosa che non si legge toglie la voce e lascia data-letti VUOTO (Piemonte: né «N bed» né «0»)', () =>
    r.piemonte && !/\bbed\b|Studio/.test(r.piemonte.riga) && r.piemonte.letti === '' ? true : JSON.stringify(r.piemonte));
  await check('l\'innesto: solo il testo libero «Living, 2 bedrooms…» → 2 camere, con la regola UNA', () =>
    r.x && r.x.letti === '2' && /· 2 bed$/.test(r.x.riga) ? true : JSON.stringify(r.x));
  await check('l\'innesto: bedrooms 0 batte il testo «3» → «Studio»', () =>
    r.s && r.s.letti === '0' && /· Studio$/.test(r.s.riga) ? true : JSON.stringify(r.s));
  await check('l\'innesto: bedrooms 1.5 non è un intero → vale il testo «2» (la regola di prima diceva 1)', () =>
    r.t && r.t.letti === '2' && /· 2 bed$/.test(r.t.riga) ? true : JSON.stringify(r.t));
  await check('l\'innesto: camere che non si leggono → data-letti vuoto, nessuna voce (mai «0»)', () =>
    r.b && r.b.letti === '' && !/\bbed\b|Studio/.test(r.b.riga) ? true : JSON.stringify(r.b));
  await ctx.close();
}
{
  // LE CAMERE IGNOTE non passano nessun filtro delle camere: «Studio» è un
  // fatto (0), «non lo sappiamo» no — e il paragone scrive «—», non «Studio»
  const { pg, ctx } = await pagina('/apartments.html');
  await pg.waitForFunction(() => document.querySelector('.casa-p[data-id="piemonte"]')
    && document.querySelector('.casa-p[data-id="piemonte"]').dataset.letti === '', null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(300);
  const filtra = (v) => pg.evaluate((v) => {
    document.querySelector('.gruppo button[data-f="letti"][data-v="' + v + '"]').click();
    const c = (id) => { const x = document.querySelector('.casa-p[data-id="' + id + '"]'); return x ? !x.classList.contains('via') : null; };
    return { piemonte: c('piemonte'), ripetta: c('ripetta'), uno: c('OLLVsiKhPrhpT1fx8XmB'), conto: +document.getElementById('conto').textContent };
  }, v);
  const studio = await filtra('0'), unoPiu = await filtra('1'), tutte = await filtra('');
  await check('filtro «Studio»: il monolocale (Ripetta, 0) passa, la casa con camere ignote (Piemonte, «») NO', () =>
    studio.ripetta === true && studio.piemonte === false && studio.uno === false ? true : JSON.stringify(studio));
  await check('filtro «1+»: le camere ignote non passano nemmeno lì; «Any» le riporta', () =>
    unoPiu.piemonte === false && unoPiu.uno === true && tutte.piemonte === true ? true : JSON.stringify({ unoPiu, tutte }));
  const tavola = await pg.evaluate(() => {
    for (const id of ['piemonte', 'ripetta']) document.querySelector('.home-para[data-id="' + id + '"]').click();
    document.getElementById('paraApri').click();
    const righe = [...document.querySelectorAll('#paraTavola tr')];
    const beds = righe.find((tr) => /Beds/.test((tr.querySelector('th') || {}).textContent || ''));
    return beds ? [...beds.querySelectorAll('td')].map((td) => td.textContent.trim()) : null;
  });
  await check('il paragone: Piemonte (camere ignote) dice «—», Ripetta «Studio»', () =>
    tavola && tavola[0] === '—' && tavola[1] === 'Studio' ? true : JSON.stringify(tavola));
  await ctx.close();
}
{
  // IL SETACCIO RILEGGE, da solo: nessuna carta innestata (il suo
  // aggiorna() rifiltrerebbe comunque e nasconderebbe il difetto), e il
  // documento arriva DOPO che il filtro della build ha già girato
  const SOLO = { documents: LISTA.documents.filter((d) => !/\/nuova[XSTB]$/.test(d.name)) };
  const { pg, ctx } = await pagina('/apartments.html?q=zzyzx', { lista: SOLO, ritardo: 1500 });
  await pg.waitForFunction(() => document.readyState === 'complete'
    && document.getElementById('muro').classList.contains('dentro'), null, { timeout: 12000 }).catch(() => {});
  await pg.waitForTimeout(300);
  const prima = await pg.evaluate(() => ({ conto: +document.getElementById('conto').textContent,
    nome: document.querySelector('.casa-p[data-id="wvX0h0lBoNKOMuTuHkVI"] .nome').textContent }));
  await pg.waitForFunction(() => document.querySelector('.casa-p[data-id="wvX0h0lBoNKOMuTuHkVI"] .nome').textContent === 'Zzyzx Two-Bed',
    null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(400);
  const dopo = await pg.evaluate(() => ({ conto: +document.getElementById('conto').textContent,
    vive: [...document.querySelectorAll('#muro .casa-p:not(.via)')].map((c) => c.dataset.id) }));
  await check('il setaccio rilegge da solo: «zzyzx» non trova niente sulla build, poi l\'idrante rinomina e la carta compare, contata', () =>
    prima.conto === 0 && prima.nome !== 'Zzyzx Two-Bed' && dopo.conto === 1
    && dopo.vive.length === 1 && dopo.vive[0] === 'wvX0h0lBoNKOMuTuHkVI' ? true : JSON.stringify({ prima, dopo }));
  await ctx.close();
}
{
  // LA RICERCA SENZA ACCENTI: si cerca come si scrive su un telefono —
  // senza la «à», con l'apostrofo tipografico che iOS mette da solo
  const VUOTA = { documents: [] };
  const piegaN = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const conAccento = [...carte(P['apartments.html'])].find((c) => piegaN(c.nome) !== c.nome.toLowerCase());
  const conApostrofo = [...carte(P['apartments.html'])].find((c) => /'/.test(dec(c.cerca || '')));
  const prove = [];
  if (conAccento) prove.push([piegaN(conAccento.nome), conAccento.id]);
  if (conApostrofo) {
    const t = dec(conApostrofo.cerca);
    const w = t.split(' ').find((x) => x.includes("'"));
    prove.push([w.replace(/'/g, '\u2019'), conApostrofo.id]);
  }
  for (const [q, id] of prove) {
    const { pg, ctx } = await pagina('/apartments.html?q=' + encodeURIComponent(q), { lista: VUOTA });
    await pg.waitForFunction(() => document.readyState === 'complete'
      && document.getElementById('muro').classList.contains('dentro'), null, { timeout: 12000 }).catch(() => {});
    await pg.waitForTimeout(400);
    const v = await pg.evaluate((id) => {
      const c = document.querySelector('.casa-p[data-id="' + id + '"]');
      return { visibile: !!c && !c.classList.contains('via'), conto: +document.getElementById('conto').textContent };
    }, id);
    await check(`?q=${q} trova ${id} (accenti e apostrofo piegati su entrambi i lati)`, () =>
      v.visibile && v.conto >= 1 ? true : JSON.stringify(v));
    await ctx.close();
  }
  if (prove.length < 2) salta('la ricerca senza accenti su una carta vera', 'nessuna carta con accento o apostrofo nel catalogo di oggi');
}

console.log('\nIN CHROMIUM — la home: le carte della settimana seguono il documento');
{
  const { pg, ctx } = await pagina('/index.html');
  await pg.waitForFunction(() => {
    const c = document.querySelector('.casa-p[href="/listing/ttvrjazww9oe4tA0wHTf"] .nome');
    return c && c.textContent === 'Tor di Quinto Corner One-Bed';
  }, null, { timeout: 15000 }).catch(() => {});
  const h = await pg.evaluate(() => {
    const c = document.querySelector('.casa-p[href="/listing/ttvrjazww9oe4tA0wHTf"]');
    const t = document.querySelector('.casa-p[href="/listing/cezFMXTWnHUDgb1H2WWm"]');
    return { nome: c.querySelector('.nome').textContent, alt: c.querySelector('img').getAttribute('alt'),
      riga: c.querySelector('.riga2').textContent.replace(/\s+/g, ' ').trim(),
      altra: t ? t.querySelector('.nome').textContent : null };
  });
  await check('home: «Tor di Quinto Corner One-Bed», alt rinominato, «2 bed»', () =>
    h.nome === 'Tor di Quinto Corner One-Bed' && h.alt.startsWith('Tor di Quinto Corner One-Bed, ')
    && /· 2 bed$/.test(h.riga) ? true : JSON.stringify(h));
  await check('home: una carta il cui documento non c\'è resta il nome della build', () =>
    h.altra === ATTESO.get('cezFMXTWnHUDgb1H2WWm').name ? true : JSON.stringify(h));
  await ctx.close();
}

console.log('\nIN CHROMIUM — la scheda: nome e camere riletti dal documento, le «altre case» pure');
const SCHEDA = { wvX0h0lBoNKOMuTuHkVI: doc('wvX0h0lBoNKOMuTuHkVI',
  { name: S('Capri Two-Bed Zeta'), status: S('waitlist'), price: I(1750), bedrooms: I(3), beds: S('Living , 1 bedroom') }) };
const leggiScheda = () => ({
  h1: document.getElementById('nomeCasa').textContent, titolo: document.title,
  applica: (document.getElementById('applicaNome') || {}).textContent,
  fatti: document.getElementById('fatti').textContent.replace(/\s+/g, ' '),
  wa: (document.querySelector('.chiedi-wa') || {}).href || '',
  alt: (document.querySelector('#telaio img') || {}).alt || '',
  altre: [...document.querySelectorAll('#altre .casa-p')].map((c) => ({
    id: (c.getAttribute('href') || '').split('/').pop(), nome: c.querySelector('.nome').textContent,
    alt: c.querySelector('img').getAttribute('alt'), stato: c.querySelector('.casa-stato').textContent,
    riga: c.querySelector('.riga2').textContent.replace(/\s+/g, ' ').trim(),
    p: c.querySelector('.flap-prezzo').dataset.p, aria: c.querySelector('.flap-prezzo').getAttribute('aria-label'),
    celle: c.querySelectorAll('.flap-prezzo .fc2').length,
    vede: [...c.querySelectorAll('.flap-prezzo .fc2 .st b')].map((b) => b.textContent).join('').trim() })) });
{
  const { pg, ctx, richieste } = await pagina('/apartment-detail.html?id=wvX0h0lBoNKOMuTuHkVI', { scheda: SCHEDA, ridotto: true });
  await pg.waitForFunction(() => document.getElementById('nomeCasa').textContent === 'Capri Two-Bed Zeta',
    null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(800);
  const d = await pg.evaluate(leggiScheda);
  await check('la scheda: H1, titolo, modulo e foto dicono il nome del documento', () =>
    d.h1 === 'Capri Two-Bed Zeta' && d.titolo.startsWith('Capri Two-Bed Zeta — ') && d.applica === 'Capri Two-Bed Zeta'
    && d.alt.startsWith('Capri Two-Bed Zeta, ') ? true : JSON.stringify(d));
  await check('la scheda: i fatti dicono «3 bed» (bedrooms batte il testo «1 bedroom»)', () =>
    /3 bed\s*Bedrooms/.test(d.fatti) ? true : d.fatti);
  await check('la scheda: il WhatsApp precompilato porta il nome nuovo', () =>
    decodeURIComponent(d.wa).includes('Capri Two-Bed Zeta') ? true : d.wa);
  await check('la scheda: le «altre case» portano i nomi della fotografia, e la rilettura fallita (batchGet 404) non tocca niente', () => {
    const nomi = new Set([...ATTESO.values()].map((a) => a.name));
    return d.altre.length === 3 && d.altre.every((a) => nomi.has(a.nome) && ATTESO.get(a.id) && ATTESO.get(a.id).name === a.nome)
      && richieste.length === 1 ? true : JSON.stringify({ altre: d.altre.map((a) => a.nome), richieste: richieste.length });
  });
  await check('la scheda: il canone delle «altre case» si VEDE, sul Solari (prima il tabellone nasceva vuoto e non si montava mai)', () =>
    d.altre.every((a) => a.p && a.celle === a.p.length && a.vede === a.p)
      ? true : JSON.stringify(d.altre.map((a) => [a.p, a.celle, a.vede])));
  await ctx.close();
}
{
  // le «altre case» lette DAL DOCUMENTO: una richiesta sola per le tre
  let corpo = null;
  const NUOVE = {};
  const batch = async (b) => {
    corpo = b;
    const ids = (b.documents || []).map((x) => String(x).split('/').pop());
    const [a, bb, cc] = ids;
    NUOVE[a] = { name: S('Altra Via Uno'), status: S('rented'), price: I(1999), bedrooms: I(0), beds: S('3') };
    NUOVE[bb] = { name: S('Altra Via Due'), status: S('available'), price: I(1234), bedrooms: S('boh') };
    // la terza: il documento manca → la carta resta com'è
    return { status: 200, contentType: 'application/json', body: JSON.stringify([
      { found: doc(a, NUOVE[a]), readTime: 'x' }, { found: doc(bb, NUOVE[bb]), readTime: 'x' },
      { missing: 'projects/boom-property-dashboards/databases/(default)/documents/listings/' + cc, readTime: 'x' }]) };
  };
  const { pg, ctx, richieste } = await pagina('/apartment-detail.html?id=wvX0h0lBoNKOMuTuHkVI', { scheda: SCHEDA, batch, ridotto: true });
  await pg.waitForFunction(() => document.getElementById('nomeCasa').textContent === 'Capri Two-Bed Zeta',
    null, { timeout: 15000 }).catch(() => {});
  const prima = await pg.evaluate(leggiScheda);
  await pg.waitForFunction(() => [...document.querySelectorAll('#altre .nome')].some((n) => n.textContent === 'Altra Via Uno'),
    null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(500);
  const d = await pg.evaluate(leggiScheda);
  const [x, y, z] = d.altre;
  await check('le «altre case»: UNA richiesta (POST documents:batchGet, text/plain) con i tre documenti delle carte', () =>
    richieste.length === 1 && richieste[0].metodo === 'POST' && /^text\/plain/.test(richieste[0].tipo)
    && corpo && corpo.documents.length === 3
    && corpo.documents.every((p, i) => p === 'projects/boom-property-dashboards/databases/(default)/documents/listings/' + prima.altre[i].id)
      ? true : JSON.stringify({ richieste, corpo }));
  await check('le «altre case»: nome e alt dal documento (rinomina della vetrina)', () =>
    x.nome === 'Altra Via Uno' && x.alt.startsWith('Altra Via Uno, ') && y.nome === 'Altra Via Due' && y.alt.startsWith('Altra Via Due, ')
      ? true : JSON.stringify([x, y]));
  await check('le «altre case»: le camere con la regola UNA (0 → «Studio» anche col testo «3»; illeggibili → nessuna voce)', () =>
    /· Studio$/.test(x.riga) && !/\bbed\b|Studio/.test(y.riga) ? true : JSON.stringify([x.riga, y.riga]));
  await check('le «altre case»: lo stato (la corsia della casa aperta: «Rented», «Available now») e il canone rimontato (data-p, aria-label, celle)', () =>
    x.stato === 'Rented' && y.stato === 'Available now' && x.p === '€1,999' && x.aria === '€1,999 per month' && x.vede === '€1,999'
    && y.p === '€1,234' && y.vede === '€1,234' ? true : JSON.stringify([x, y]));
  await check('le «altre case»: il documento che manca lascia la carta com\'era', () =>
    JSON.stringify(z) === JSON.stringify(prima.altre[2]) ? true : JSON.stringify({ z, prima: prima.altre[2] }));
  await ctx.close();
}
{
  // la rilettura che FALLISCE (Firestore 500 sul batchGet) non tocca niente
  const batch = async () => ({ status: 500, contentType: 'application/json', body: '{"error":"giù"}' });
  const { pg, ctx, richieste } = await pagina('/apartment-detail.html?id=wvX0h0lBoNKOMuTuHkVI', { scheda: SCHEDA, batch, ridotto: true });
  await pg.waitForFunction(() => document.getElementById('nomeCasa').textContent === 'Capri Two-Bed Zeta',
    null, { timeout: 15000 }).catch(() => {});
  const prima = await pg.evaluate(leggiScheda);
  await pg.waitForTimeout(1500);
  const dopo = await pg.evaluate(leggiScheda);
  await check('le «altre case»: un batchGet che risponde 500 lascia le tre carte della build', () =>
    richieste.length === 1 && JSON.stringify(dopo.altre) === JSON.stringify(prima.altre)
    && dopo.altre.every((a) => ATTESO.get(a.id) && ATTESO.get(a.id).name === a.nome) ? true : JSON.stringify(dopo.altre));
  await ctx.close();
}
{
  // js/listing-facts.js che NON arriva (503): la scheda non sa leggere le
  // camere del documento — e allora le LASCIA, non le cancella
  const { pg, ctx } = await pagina('/apartment-detail.html?id=wvX0h0lBoNKOMuTuHkVI', { scheda: SCHEDA, senzaFacts: true });
  await pg.waitForFunction(() => document.getElementById('nomeCasa').textContent === 'Capri Two-Bed Zeta',
    null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(600);
  const d = await pg.evaluate(() => ({ facts: typeof window.BOOM_FACTS, fatti: document.getElementById('fatti').textContent.replace(/\s+/g, ' ') }));
  const capri = ATTESO.get('wvX0h0lBoNKOMuTuHkVI');
  await check('senza js/listing-facts.js (503): il nome si rilegge, le camere della build restano (prima il digest le cancellava)', () =>
    d.facts === 'undefined' && capri && new RegExp(voce(capri.n) + '\\s*Bedrooms').test(d.fatti) ? true : JSON.stringify(d));
  await ctx.close();
}
{
  // una casa nata DOPO la build (non nel CASE), col documento dal server:
  // casaDaListing usa la regola vera — bedrooms 0 è un monolocale, non «niente»
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('scheda nuova ' + String(e).split('\n')[0]));
  await pg.addInitScript(() => {
    window.__LISTING_ID = 'NUOVA9';
    window.__LISTING = { name: 'Via Nuova Studio', zone: 'Prati', status: 'available', price: 900,
      bedrooms: 0, beds: '3', images: [] };
  });
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('firestore.googleapis.com')) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return u.startsWith(BASE + '/') ? r.continue() : r.abort();
  });
  await pg.goto(BASE + '/apartment-detail.html');
  await pg.waitForTimeout(1500);
  const n = await pg.evaluate(() => ({ h1: document.getElementById('nomeCasa').textContent,
    fatti: document.getElementById('fatti').textContent.replace(/\s+/g, ' ') }));
  await check('casa nuova dal server: bedrooms 0 → «Studio» (prima spariva), il testo «3» non vince', () =>
    n.h1 === 'Via Nuova Studio' && /Studio\s*Bedrooms/.test(n.fatti) && !/3 bed/.test(n.fatti) ? true : JSON.stringify(n));
  await ctx.close();
}
{
  // il NOME nel titolo dell'iframe del video: resta testo, mai markup
  const CATTIVO = 'Casa "><img id="pwn" src="x" onerror="window.__pwn=1">';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('iframe ' + String(e).split('\n')[0]));
  await pg.addInitScript((nome) => {
    window.__LISTING_ID = 'NUOVA7';
    window.__LISTING = { name: nome, zone: 'Prati', status: 'available', price: 900, bedrooms: 1,
      videoUrl: 'https://youtu.be/abcdefghijk', images: [] };
  }, CATTIVO);
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('firestore.googleapis.com')) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return u.startsWith(BASE + '/') ? r.continue() : r.abort();
  });
  await pg.goto(BASE + '/apartment-detail.html');
  await pg.waitForTimeout(1200);
  const v = await pg.evaluate(() => {
    const b = document.querySelector('.pel-play');
    if (!b) return { senzaBottone: true };
    b.click();
    const fr = document.querySelector('.pel-video iframe');
    return { titolo: fr && fr.getAttribute('title'), src: fr && fr.getAttribute('src'),
      iniettato: !!document.getElementById('pwn'), pwn: window.__pwn === 1 };
  });
  await pg.waitForTimeout(300);
  const pwn = await pg.evaluate(() => window.__pwn === 1 || !!document.getElementById('pwn'));
  await check('il video: il titolo dell\'iframe è «Video tour of <nome>» come TESTO — un nome con virgolette e markup non inietta niente', () =>
    v.titolo === 'Video tour of ' + CATTIVO && /youtube-nocookie\.com\/embed\/abcdefghijk\?autoplay=1/.test(v.src || '')
    && !v.iniettato && !pwn ? true : JSON.stringify({ ...v, pwn }));
  await ctx.close();
}
{
  // i FATTI e le dotazioni della scheda: piano, tipo e features vengono dal
  // documento (una casa nuova li prende da Firestore) — testo, mai markup
  const PIANO = '2 <img id="pwnP" src="x" onerror="window.__pwnP=1">';
  const TIPO = 'Loft "><b id="pwnT">x</b>';
  const DOTE = 'Balcony <img id="pwnD" src="x" onerror="window.__pwnD=1">';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('fatti ' + String(e).split('\n')[0]));
  await pg.addInitScript(([piano, tipo, dote]) => {
    window.__LISTING_ID = 'NUOVA5';
    window.__LISTING = { name: 'Via dei Fatti', zone: 'Prati', status: 'available', price: 900, bedrooms: 1,
      sqm: 50, floor: piano, type: tipo, furnished: 'no', features: [dote, 'Wi-Fi'], images: [] };
  }, [PIANO, TIPO, DOTE]);
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('firestore.googleapis.com')) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return u.startsWith(BASE + '/') ? r.continue() : r.abort();
  });
  await pg.goto(BASE + '/apartment-detail.html');
  await pg.waitForTimeout(1500);
  const f = await pg.evaluate(() => {
    const fatti = document.getElementById('fatti'), dentro = document.getElementById('dentroCasa');
    return { fatti: [...fatti.children].map((x) => x.className + ':' + [...x.children].map((y) => y.tagName + '=' + y.textContent).join('/')),
      dentro: [...dentro.children].map((x) => x.tagName + '=' + x.textContent),
      iniettato: ['pwnP', 'pwnT', 'pwnD'].filter((id) => document.getElementById(id)),
      pwn: !!(window.__pwnP || window.__pwnD) };
  });
  await check('la scheda: piano e tipo del documento entrano nei fatti come TESTO (un «<img onerror>» resta scritto, non diventa un nodo)', () =>
    f.fatti.includes('fatto:B=' + PIANO + '/SPAN=Floor') && f.fatti.includes('fatto:B=' + TIPO + '/SPAN=Type')
    && !f.iniettato.length && !f.pwn ? true : JSON.stringify(f));
  await check('la scheda: le dotazioni del documento entrano come TESTO, una per <span>', () =>
    JSON.stringify(f.dentro) === JSON.stringify(['SPAN=' + DOTE, 'SPAN=Wi-Fi']) && !f.iniettato.length ? true : JSON.stringify(f.dentro));
  await ctx.close();
}

console.log('\nIN CHROMIUM — i tuoi luoghi: il localStorage e Photon (finto) scrivono testo, mai markup');
{
  // I TUOI LUOGHI (16/10/2026): un posto già salvato col nome «cattivo» nel
  // localStorage (boom:pois — lo scrivono anche /skyline e le altre schede)
  // e Photon che risponde con «<img onerror>», virgolette, «&», markup nella
  // zona e coordinate che non sono numeri. Tutto si legge com'è scritto,
  // nessun nodo entra, nessun gestore parte — anche dopo aver scelto il
  // suggerimento e ricaricato. E la STESSA sonda, sulla pagina col vecchio
  // innerHTML rimesso, deve vedere l'iniezione: un test che non sa cadere
  // non protegge niente.
  const SALVATO = 'Ufficio "Nord" & Co <img id="pwnS" src="x" onerror="window.__lp=1"> <b>Bar</b>';
  const F_NOME = 'Caffè "Sant\'Eustachio" & Figli <img id="pwnF" src="x" onerror="window.__lp=1">';
  const F_ZONA = '<b id="pwnB">Sant\'Eustachio</b>', F_CITTA = 'Roma & <i id="pwnI">dintorni</i>';
  const F_VIA = 'Via dei "Coronari" <script id="pwnX">window.__lp=1</script> & Co';
  const punto = (properties, coordinates) => ({ type: 'Feature', properties,
    ...(coordinates ? { geometry: { type: 'Point', coordinates } } : {}) });
  const FOTONE = { type: 'FeatureCollection', features: [
    punto({ name: F_NOME, suburb: F_ZONA, city: F_CITTA }, [12.4776, 41.8986]),
    punto({ street: F_VIA, district: 'Ponte', city: 'Roma' }, [12.4711, 41.8995]),
    // coordinate che non sono numeri: col vecchio codice uscivano dall'attributo
    punto({ name: 'Coordinate finte' }, ['12.47" onmouseover="window.__lp=1', '41.9']) ] };
  // nessun posto valido: niente geometria, null, fuori scala
  const NULLA = { type: 'FeatureCollection', features: [
    punto({ name: 'Senza geometria' }), null, punto({ name: 'Fuori scala' }, [12.47, 141.9]) ] };
  const sondaLuoghi = async (url, { mutante = null, giro = true } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const pg = await ctx.newPage();
    const out = { errori: [], cercate: [] };
    pg.on('pageerror', (e) => out.errori.push(String(e).split('\n')[0]));
    await pg.addInitScript((salvato) => {
      window.__LISTING_ID = 'NUOVA4';
      window.__LISTING = { name: 'Via dei Luoghi', zone: 'Prati', status: 'available', price: 900, bedrooms: 1,
        lat: 41.9065, lng: 12.4625, images: [] };
      // il posto salvato altrove c'è già, ma SOLO al primo caricamento: il
      // ricaricamento deve rileggere ciò che la pagina stessa ha scritto
      try {
        if (!localStorage.getItem('boom:pois'))
          localStorage.setItem('boom:pois', JSON.stringify([{ name: salvato, lat: 41.9009, lng: 12.5018 }]));
      } catch (e) { /* about:blank: niente localStorage, niente da fare */ }
    }, SALVATO);
    await pg.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith('https://photon.komoot.io/')) {
        const q = new URL(u).searchParams.get('q') || '';
        out.cercate.push(q);
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(/nulla/.test(q) ? NULLA : FOTONE) });
      }
      if (u.includes('firestore.googleapis.com')) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      if (mutante && u.split('?')[0] === BASE + url) return r.fulfill({ status: 200, contentType: 'text/html', body: mutante });
      return u.startsWith(BASE + '/') ? r.continue() : r.abort();
    });
    const leggiLuoghi = () => pg.evaluate(() => {
      const testo = (el) => (el ? el.textContent : null);
      const figli = (el) => [...el.querySelectorAll('*')].map((x) => x.tagName).join(',');
      return {
        righe: [...document.querySelectorAll('#luogoRighe > *')].map((el) => {
          const bt = el.querySelector('button');
          return { tag: el.tagName, cls: el.className, b: testo(el.querySelector('b')), t: testo(el.querySelector('i')),
            aria: bt && bt.getAttribute('aria-label'), i: bt && bt.dataset.i, testo: el.textContent, figli: figli(el) };
        }),
        sug: [...document.querySelectorAll('#luogoSug > *')].map((el) => ({ tag: el.tagName, cls: el.className,
          b: testo(el.querySelector('b')), s: testo(el.querySelector('span')), n: el.dataset.n,
          lat: el.dataset.lat, lng: el.dataset.lng, testo: el.textContent, figli: figli(el) })) };
    });
    const iniezione = () => pg.evaluate(() => ({
      nodi: ['pwnS', 'pwnF', 'pwnB', 'pwnI', 'pwnX'].filter((id) => document.getElementById(id)),
      estranei: document.querySelectorAll('#luoghi img, #luoghi script, #luoghi svg, #luoghi iframe').length,
      gestori: [...document.querySelectorAll('#luoghi, #luoghi *')].flatMap((el) =>
        [...el.attributes].filter((a) => /^on/i.test(a.name)).map((a) => el.tagName + '[' + a.name + ']')),
      partito: window.__lp === 1 }));
    // un <img src="x"> entrato chiede /x al server (404): si aspetta il suo
    // onerror — sulla pagina giusta non c'è niente da aspettare
    const quiete = async () => {
      await pg.waitForFunction(() => !document.querySelector('#luoghi img') || window.__lp === 1, null, { timeout: 5000 }).catch(() => {});
      await pg.waitForTimeout(300);
    };
    try {
      await pg.goto(BASE + url);
      await pg.waitForFunction(() => document.getElementById('luogoRighe').children.length > 0, null, { timeout: 15000 }).catch(() => {});
      out.r1 = await leggiLuoghi();
      await pg.fill('#luogoQ', 'Sant', { timeout: 10000 });
      await pg.waitForFunction(() => document.getElementById('luogoSug').children.length > 0, null, { timeout: 10000 }).catch(() => {});
      await quiete();
      out.s1 = await leggiLuoghi();
      out.i1 = await iniezione();
      if (giro) {
        // si sceglie il primo suggerimento: il caffè «cattivo»
        await pg.evaluate(() => document.querySelector('#luogoSug button').click());
        out.scelta = await leggiLuoghi();
        out.ls = await pg.evaluate(() => JSON.parse(localStorage.getItem('boom:pois') || 'null'));
        out.campo = await pg.evaluate(() => document.getElementById('luogoQ').value);
        await pg.reload();
        await pg.waitForFunction(() => document.getElementById('luogoRighe').children.length > 1, null, { timeout: 15000 }).catch(() => {});
        await quiete();
        out.ricarica = await leggiLuoghi();
        // il ✕ della prima riga toglie il caffè, non l'ufficio
        await pg.evaluate(() => document.querySelector('#luogoRighe button[data-i="0"]').click());
        out.tolto = await leggiLuoghi();
        out.lsTolto = await pg.evaluate(() => JSON.parse(localStorage.getItem('boom:pois') || 'null'));
        await pg.fill('#luogoQ', 'nulla da fare', { timeout: 10000 });
        await pg.waitForFunction(() => /Nothing found/.test(document.getElementById('luogoSug').textContent), null, { timeout: 10000 }).catch(() => {});
        await quiete();
        out.nulla = await leggiLuoghi();
        out.i2 = await iniezione();
      }
    } catch (e) { out.errore = String(e && e.message || e).split('\n')[0]; }
    await ctx.close();
    return out;
  };

  const V = await sondaLuoghi('/apartment-detail.html');
  for (const e of V.errori) errs.push('luoghi ' + e);
  const riga = (r, nome) => r && r.cls === 'luogo' && r.b === nome && r.aria === 'Remove ' + nome && r.figli === 'B,I,BUTTON'
    && /min/.test(r.t || '');
  await check('i tuoi luoghi: il posto salvato nel localStorage si legge com\'è scritto — nome e «Remove …» del ✕ — col suo tempo, e dentro la riga solo <b>, <i>, <button>', () =>
    V.r1 && V.r1.righe.length === 1 && riga(V.r1.righe[0], SALVATO) ? true : JSON.stringify({ r1: V.r1, errore: V.errore }));
  await check('i tuoi luoghi: i suggerimenti di Photon («<img onerror>», virgolette, «&», markup nella zona) si leggono com\'è scritto — nome, zona e data-n — e il tasto contiene solo <b> e <span>', () => {
    const [a, b] = (V.s1 && V.s1.sug) || [];
    return V.cercate.includes('Sant') && V.s1.sug.length === 2
      && a.tag === 'BUTTON' && a.b === F_NOME && a.s === F_ZONA + ', ' + F_CITTA && a.n === F_NOME && a.figli === 'B,SPAN'
      && a.lat === '41.8986' && a.lng === '12.4776'
      && b.tag === 'BUTTON' && b.b === F_VIA && b.s === 'Ponte, Roma' && b.n === F_VIA && b.figli === 'B,SPAN'
      ? true : JSON.stringify({ s1: V.s1, cercate: V.cercate, errore: V.errore });
  });
  await check('i tuoi luoghi: un suggerimento con coordinate che non sono numeri non si offre (né entra in un attributo), gli altri sì', () =>
    V.s1 && V.s1.sug.length === 2 && !V.s1.sug.some((x) => /Coordinate finte/.test(x.testo)) ? true : JSON.stringify(V.s1));
  await check('i tuoi luoghi: il suggerimento scelto si salva com\'è scritto (le virgolette restano: prima sparivano) e torna testo dal localStorage, anche dopo il ricaricamento', () => {
    const ls = V.ls || [], dopo = (x) => x && x.righe.length === 2 && riga(x.righe[0], F_NOME) && riga(x.righe[1], SALVATO);
    return ls.length === 2 && ls[0].name === F_NOME && ls[0].lat === 41.8986 && ls[0].lng === 12.4776 && ls[1].name === SALVATO
      && V.campo === '' && V.scelta.sug.length === 0 && dopo(V.scelta) && dopo(V.ricarica)
      ? true : JSON.stringify({ ls, scelta: V.scelta, ricarica: V.ricarica, errore: V.errore });
  });
  await check('i tuoi luoghi: il ✕ toglie la riga giusta (data-i scritto coi nodi) e il localStorage lo segue', () => {
    const r = V.tolto && V.tolto.righe, ls = V.lsTolto || [];
    return r && r.length === 1 && riga(r[0], SALVATO) && ls.length === 1 && ls[0].name === SALVATO
      ? true : JSON.stringify({ tolto: V.tolto, ls, errore: V.errore });
  });
  await check('i tuoi luoghi: una risposta di Photon senza un posto valido (niente geometria, null, fuori scala) dice «Nothing found», non «needs the live site»', () => {
    const n = V.nulla && V.nulla.sug;
    return n && n.length === 1 && n[0].tag === 'P' && n[0].cls === 'luoghi-vuota'
      && n[0].testo === 'Nothing found — try the street or the campus name.' && n[0].figli === ''
      ? true : JSON.stringify({ nulla: V.nulla, errore: V.errore });
  });
  await check('i tuoi luoghi: in tutto il giro nessun nodo è entrato dai nomi (img, script, b, i), nessun attributo on*, nessun gestore è partito', () =>
    [V.i1, V.i2].every((i) => i && !i.nodi.length && !i.estranei && !i.gestori.length && !i.partito)
      ? true : JSON.stringify({ i1: V.i1, i2: V.i2, errore: V.errore }));

  // LA MUTAZIONE nel browser: la stessa pagina con le due funzioni com'erano
  const D = P['apartment-detail.html'];
  let MUTANTE = null, senzaAppiglio = null;
  try { MUTANTE = muta(muta(D, estrai(D, 'righeGiu'), VECCHI_LUOGHI.righeGiu), estrai(D, 'sugGiu'), VECCHI_LUOGHI.sugGiu); }
  catch (e) { senzaAppiglio = e.message; }
  const M = MUTANTE ? await sondaLuoghi('/apartment-detail-mutante.html', { mutante: MUTANTE, giro: false }) : {};
  await check('mutazione: la stessa sonda sulla pagina col vecchio innerHTML (righeGiu e sugGiu) vede l\'iniezione — nodi dal nome salvato e da Photon, attributi on*, un onerror partito — e il nome non si legge più com\'è scritto', () => {
    if (!MUTANTE) return 'il mutante non si costruisce: ' + senzaAppiglio;
    const i = M.i1 || { nodi: [], gestori: [] }, r = (M.r1 && M.r1.righe[0]) || {};
    return ['pwnS', 'pwnF', 'pwnB', 'pwnX'].every((id) => i.nodi.includes(id)) && i.gestori.length > 0 && i.partito
      && r.b !== SALVATO ? true : JSON.stringify({ i, r, sug: M.s1 && M.s1.sug.map((x) => x.testo), errori: M.errori, errore: M.errore });
  });
}

await check('zero errori di pagina', () => (errs.length ? errs.join(' | ') : true));
await browser.close();
server.close();
console.log(fail ? `\nCATALOGO VETRINA: ${fail} GUASTI su ${pass + fail}` : `\nCATALOGO VETRINA: TUTTO VERDE (${pass} check)`);
process.exit(fail ? 1 : 0);
