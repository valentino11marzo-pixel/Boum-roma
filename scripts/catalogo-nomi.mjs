// scripts/catalogo-nomi.mjs
// I NOMI DALL'INDIRIZZO VERO, E LE CAMERE GIUSTE, SU OGNI PAGINA CHE LE FOTOGRAFA.
//
// IL REPERTO (15/10/2026). Vetrina, home, scheda, /try, /your-money e il
// tabellone di /board sono FOTOGRAFIE di build: ogni pagina porta cotti il
// nome e le camere di ogni casa. Tre annunci si chiamavano «Bilocale
// Centro», due «Bilocale Trieste», due «Trilocale Pigneto» — nomi del bot,
// uguali fra case diverse; e le camere uscivano dalla regola sbagliata
// (`beds || bedrooms`: il PRIMO numero del testo libero), quindi «Capri 2
// Bed» era in vetrina come «1 bed» e il bilocale di Via dei Cappellari come
// «3 bed».
//
// Qui nome e camere si riscrivono PER ID, mai cercando il testo del vecchio
// nome: tre case diverse si chiamavano allo stesso modo, e un cerca-e-
// sostituisci avrebbe battezzato la casa sbagliata. L'id sta nella carta
// (data-id, href /listing/<id>), negli array CASE, nei pulsanti di /try.
// Dove la build non l'ha scritto (/your-money, il tabellone di /board) si
// ricava con la STESSA regola del builder che ha scelto quelle case, e si
// verifica contro zona e prezzo stampati: un solo disaccordo e la pagina non
// si tocca. Poi l'id resta scritto in pagina, e il giro dopo non indovina.
//
// La verità — NESSUNA di default: chi lancia lo script dice da dove la prende
// (senza, il messaggio d'uso ed exit 2). Le camere sono SEMPRE lette da
// FACTS.bedroomsOf (js/listing-facts.js): UNA regola.
//   · --from-firestore: gli annunci pubblici VERI (lettura anonima, nessuna
//     chiave). È la fonte del lavoro normale: dopo l'«Applica» dell'admin su
//     /catalogo, un solo comando riallinea le pagine, anche ai nomi e alle
//     camere che l'admin ha scelto diversi dalla mappa;
//   · --dalla-mappa: la migrazione una tantum del 15/10 — js/catalogo-
//     correzioni.js (il nome nuovo) sul fixture di quel giorno coi campi
//     `fix` (beds, bedrooms) applicati.
// Nello stesso giro si rifà l'ItemList di /apartments (catalogo-schema) e si
// aggiornano le due fotografie da cui i builder rifanno le pagine
// (design/pages-deco/case-full.json, design/home-live-deco/live-rows.json):
// una ricostruzione futura non riporta i nomi vecchi, e i test leggono LÌ
// cosa le pagine devono dire (veritaDallaFotografia).
//
// Idempotente: il secondo giro non cambia niente. --dry stampa le modifiche
// senza scrivere; --check fa lo stesso ed esce 1 se ce ne sarebbero, o se
// qualcosa in pagina non si può allineare (avvisi, case che la fonte non
// conosce): una pagina così non è «allineata».
//
//   node scripts/catalogo-nomi.mjs (--from-firestore | --dalla-mappa) [--dry|--check] [--root <cartella>]

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rigenera as rigeneraItemList } from './catalogo-schema.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const FACTS = require('../js/listing-facts.js');
const FIX = require('../js/catalogo-correzioni.js');

export const FIXTURE = path.join(REPO, 'tests/catalogo/fixture-listings-2026-10-15.json');
export const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/'
  + 'boom-property-dashboards/databases/(default)/documents/listings';
export const PAGINE = ['apartments.html', 'index.html', 'apartment-detail.html',
  'try.html', 'your-money.html', 'board.html'];
export const FOTOGRAFIE = { caseFull: 'design/pages-deco/case-full.json',
  liveRows: 'design/home-live-deco/live-rows.json' };

// ── i piccoli attrezzi ─────────────────────────────────────────────────
const pulisci = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const escTesto = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escTesto(s).replace(/"/g, '&quot;');
// nel <script> la stessa stringa JSON dei builder; «</» spezzato per non
// chiudere il tag (un nome non lo porta, ma la porta resta chiusa)
const jsonStr = (s) => JSON.stringify(String(s)).replace(/<\//g, '<\\/');
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
function decodifica(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const euro = (n) => '€' + Math.round(n).toLocaleString('en-US');
// la voce della riga «zona · m² · camere», nella grammatica dei builder
const voceLetti = (n) => (n === 0 ? 'Studio' : n ? n + ' bed' : '');

// la sostituzione della TESTA di un testo («<nome>, <zona> — …»): vince il
// candidato più lungo che la apre, così «Levico» → «Levico Garden» non
// diventa «Levico Garden Garden» al secondo giro. Senza un candidato che la
// apra non si indovina: null, e chi chiama lo dice.
function testaNuova(testo, nuovo, vecchi, sep, basso) {
  const t = basso ? testo.toLowerCase() : testo;
  const forma = (x) => (basso ? x.toLowerCase() : x);
  const tutti = [{ n: nuovo, nuovo: true }, ...vecchi.map((v) => ({ n: v, nuovo: false }))]
    .filter((c) => c.n)
    .sort((a, b) => b.n.length - a.n.length);
  for (const c of tutti) {
    const k = forma(c.n);
    if (t === k || t.startsWith(k + sep)) {
      return c.nuovo ? testo : forma(nuovo) + testo.slice(k.length);
    }
  }
  return null;
}

// ── la verità ──────────────────────────────────────────────────────────
// una voce = { name?, bedrooms?, campi? }: `bedrooms` undefined vuol dire
// «non lo so, non toccare»; null vuol dire «il documento dice qualcosa che
// non si legge: meglio tacere». `campi` sono i valori grezzi da riportare
// nelle fotografie dei builder.
export function leggiFixture(f = FIXTURE) {
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

// i campi grezzi delle camere di un documento, come stanno: se ne porta
// UNO, l'altro è null (assente) — una fotografia che tenesse il `bedrooms`
// vecchio accanto al `beds` nuovo direbbe un'altra cosa delle pagine
function campiCamere(d) {
  if (d.bedrooms == null && d.beds == null) return {};
  return { beds: d.beds == null ? null : d.beds, bedrooms: d.bedrooms == null ? null : d.bedrooms };
}

// LA FOTOGRAFIA come verità: ciò che le pagine devono dire è ciò che
// case-full.json porta (nome + FACTS.bedroomsOf), perché lo script aggiorna
// pagine e fotografia nello stesso giro. È il riferimento dei test (le
// pagine = la fotografia, per id), non una fonte della riga di comando.
export function veritaDallaFotografia(docs) {
  const out = new Map();
  for (const d of docs || []) {
    if (!d || !d._id) continue;
    const campi = campiCamere(d);
    out.set(d._id, { name: pulisci(d.name) || undefined,
      bedrooms: Object.keys(campi).length ? FACTS.bedroomsOf(d) : undefined, campi });
  }
  return out;
}

export function veritaDallaMappa(fixture = leggiFixture()) {
  const perId = new Map(fixture.map((d) => [d._id, d]));
  const out = new Map();
  for (const [id, m] of Object.entries(FIX.LISTINGS)) {
    const doc = perId.get(id);
    const campi = {};
    for (const k of ['beds', 'bedrooms']) {
      if (m.fix && Object.prototype.hasOwnProperty.call(m.fix, k)) campi[k] = m.fix[k];
    }
    const casa = Object.assign({}, doc || {}, campi);
    const ha = casa.bedrooms != null || casa.beds != null;
    out.set(id, { name: pulisci(m.name) || undefined,
      bedrooms: ha ? FACTS.bedroomsOf(casa) : undefined, campi });
  }
  return out;
}

function valoreRest(x) {
  if (!x || typeof x !== 'object') return null;
  if ('stringValue' in x) return x.stringValue;
  if ('integerValue' in x) return Number(x.integerValue);
  if ('doubleValue' in x) return Number(x.doubleValue);
  if ('booleanValue' in x) return x.booleanValue;
  if ('timestampValue' in x) return x.timestampValue;
  if ('nullValue' in x) return null;
  if ('arrayValue' in x) return ((x.arrayValue && x.arrayValue.values) || []).map(valoreRest);
  if ('mapValue' in x) {
    const o = {};
    for (const [k, v] of Object.entries((x.mapValue && x.mapValue.fields) || {})) o[k] = valoreRest(v);
    return o;
  }
  return null;
}

// gli annunci veri, pagina per pagina (300 alla volta, come l'idrante)
export async function veritaDaFirestore(fetchImpl = globalThis.fetch) {
  const docs = [];
  let token = '';
  for (let giro = 0; giro < 20; giro++) {
    const url = FIRESTORE + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    const r = await fetchImpl(url);
    if (!r || !r.ok) throw new Error('Firestore ha risposto ' + (r ? r.status : 'niente'));
    const j = await r.json();
    for (const d of (j && j.documents) || []) docs.push(d);
    token = (j && j.nextPageToken) || '';
    if (!token) break;
  }
  if (!docs.length) throw new Error('Firestore non ha restituito nessun annuncio: non tocco niente');
  const out = new Map();
  for (const d of docs) {
    const id = String(d.name || '').split('/').pop();
    if (!id) continue;
    const f = {};
    for (const [k, v] of Object.entries(d.fields || {})) f[k] = valoreRest(v);
    const campi = campiCamere(f);
    out.set(id, { name: pulisci(f.name) || undefined,
      bedrooms: Object.keys(campi).length ? FACTS.bedroomsOf(f) : undefined, campi });
  }
  return out;
}

// ── il registro di cosa cambia (è anche il diff di --dry) ──────────────
class Registro {
  constructor() { this.cambi = []; this.avvisi = []; this.ignoti = new Set(); }
  cambio(file, id, campo, da, a) { this.cambi.push({ file, id, campo, da: String(da), a: String(a) }); }
  avviso(file, id, testo) { this.avvisi.push({ file, id, testo }); }
  ignoto(file, id) { this.ignoti.add(file + ' · ' + id); }
}

// i nomi che quella casa può avere ADESSO in pagina: quello stampato, il
// vecchio della mappa, il nuovo della mappa (se Firestore ne dice un terzo)
function vecchiDi(id, stampato, nuovo) {
  const m = FIX.LISTINGS[id] || {};
  return [...new Set([stampato, pulisci(m.from), pulisci(m.name)])]
    .filter((x) => x && x !== nuovo);
}

// ── le carte della vetrina e della home: <a class="casa-p" …> ─────────
function riscriviCarta(b, id, file, verita, reg) {
  const v = verita.get(id);
  if (!v) { reg.ignoto(file, id); return b; }
  const mNome = b.match(/<span class="nome">([^<]*)<\/span>/);
  const stampato = mNome ? pulisci(decodifica(mNome[1])) : '';
  if (v.name) {
    const vecchi = vecchiDi(id, stampato, v.name);
    if (mNome && stampato !== v.name) {
      b = b.replace(mNome[0], () => '<span class="nome">' + escTesto(v.name) + '</span>');
      reg.cambio(file, id, 'nome', stampato, v.name);
    }
    b = b.replace(/(<img\b[^>]*?\balt=")([^"]*)(")/, (tutto, a, alt, z) => {
      const t = decodifica(alt);
      const n = testaNuova(t, v.name, vecchi, ', ', false);
      if (n == null) { reg.avviso(file, id, 'alt senza il nome in testa: «' + t + '»'); return tutto; }
      if (n === t) return tutto;
      reg.cambio(file, id, 'alt', t, n);
      return a + escAttr(n) + z;
    });
    b = b.replace(/(\bdata-cerca=")([^"]*)(")/, (tutto, a, cerca, z) => {
      const t = decodifica(cerca);
      const n = testaNuova(t, v.name, vecchi, ' ', true);
      if (n == null) { reg.avviso(file, id, 'data-cerca senza il nome in testa: «' + t + '»'); return tutto; }
      if (n === t) return tutto;
      reg.cambio(file, id, 'data-cerca', t, n);
      return a + escAttr(n) + z;
    });
  }
  if (v.bedrooms !== undefined) {
    const n = v.bedrooms;
    b = b.replace(/\bdata-letti="([^"]*)"/, (tutto, x) => {
      // camere ignote = attributo VUOTO, mai «0»: «0» è un monolocale, e il
      // filtro Studio della vetrina lo prenderebbe per tale
      const nuovo = n == null ? '' : String(n);
      if (x === nuovo) return tutto;
      reg.cambio(file, id, 'data-letti', x, nuovo);
      return 'data-letti="' + nuovo + '"';
    });
    b = b.replace(/(<div class="riga2">)([\s\S]*?)(<\/div>)/, (tutto, a, dentro, z) => {
      const pezzi = dentro.split(' <i>·</i> ');
      let k = -1;
      pezzi.forEach((p, i) => { if (/^\s*(\d+ bed|Studio)\s*$/.test(p)) k = i; });
      const voce = voceLetti(n);
      const prima = k >= 0 ? pezzi[k].trim() : '';
      if (prima === voce) return tutto;
      if (k >= 0 && voce) pezzi[k] = voce;
      else if (k >= 0) pezzi.splice(k, 1);
      else pezzi.push(voce);
      reg.cambio(file, id, 'camere', prima || '—', voce || '—');
      return a + pezzi.join(' <i>·</i> ') + z;
    });
  }
  return b;
}

function riscriviCarte(s, file, verita, reg) {
  const re = /<a class="casa-p" href="\/listing\/([^"?#/]+)"/g;
  let out = '', ultimo = 0, m;
  while ((m = re.exec(s))) {
    const fine = s.indexOf('</a>', m.index);
    if (fine < 0) break;
    let id = m[1];
    try { id = decodeURIComponent(id); } catch { /* resta com'è */ }
    out += s.slice(ultimo, m.index) + riscriviCarta(s.slice(m.index, fine), id, file, verita, reg);
    ultimo = fine;
    re.lastIndex = fine;
  }
  return out + s.slice(ultimo);
}

// ── gli array CASE incorporati (home, scheda): JSON su una riga ────────
// Si riscrivono SOLO i valori, al loro posto: riserializzare l'array
// cambierebbe la formattazione del builder (e ogni numero 12.0 → 12).
function fineValore(s, i) {
  const c = s[i];
  if (c === '"') {
    for (let j = i + 1; j < s.length; j++) {
      if (s[j] === '\\') j++;
      else if (s[j] === '"') return j + 1;
    }
    throw new Error('stringa JSON non chiusa');
  }
  if (c === '{' || c === '[') {
    let prof = 0;
    for (let j = i; j < s.length; j++) {
      const d = s[j];
      if (d === '"') { j = fineValore(s, j) - 1; continue; }
      if (d === '{' || d === '[') prof++;
      else if (d === '}' || d === ']') { prof--; if (!prof) return j + 1; }
    }
    throw new Error('JSON non chiuso');
  }
  let j = i;
  while (j < s.length && !/[,\]}\s]/.test(s[j])) j++;
  return j;
}
const salta = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };

// le chiavi di primo livello di un oggetto JSON → { chiave: [inizio, fine] }
function chiavi(s, o0, o1) {
  const out = {};
  let j = salta(s, o0 + 1);
  while (j < o1 - 1) {
    if (s[j] === '}') break;
    const k1 = fineValore(s, j);
    const k = JSON.parse(s.slice(j, k1));
    j = salta(s, k1);
    if (s[j] !== ':') throw new Error('JSON: manca «:» dopo ' + k);
    const v0 = salta(s, j + 1), v1 = fineValore(s, v0);
    out[k] = [v0, v1];
    j = salta(s, v1);
    if (s[j] === ',') j = salta(s, j + 1);
  }
  return out;
}

// gli oggetti di un array JSON → [[inizio, fine], …]
function oggetti(s, a0, a1) {
  const out = [];
  let j = salta(s, a0 + 1);
  while (j < a1 - 1) {
    if (s[j] === ',') { j = salta(s, j + 1); continue; }
    if (s[j] === ']') break;
    const f = fineValore(s, j);
    if (s[j] === '{') out.push([j, f]);
    j = salta(s, f);
  }
  return out;
}

function trovaCase(s, prefisso = 'var CASE = ') {
  const i = s.indexOf(prefisso + '[');
  if (i < 0) return null;
  const a0 = i + prefisso.length, a1 = fineValore(s, a0);
  return { a0, a1, voci: JSON.parse(s.slice(a0, a1)), ogg: oggetti(s, a0, a1) };
}

function applica(s, tagli) {
  for (const [i0, i1, testo] of [...tagli].sort((x, y) => y[0] - x[0])) s = s.slice(0, i0) + testo + s.slice(i1);
  return s;
}

function riscriviCase(s, file, verita, reg) {
  const c = trovaCase(s);
  if (!c) return s;
  const tagli = [];
  c.ogg.forEach(([o0, o1], i) => {
    const voce = c.voci[i];
    const v = verita.get(voce && voce.id);
    if (!v) { if (voce && voce.id) reg.ignoto(file, voce.id); return; }
    const k = chiavi(s, o0, o1);
    if (v.name && k.nome && voce.nome !== v.name) {
      tagli.push([k.nome[0], k.nome[1], jsonStr(v.name)]);
      reg.cambio(file, voce.id, 'CASE.nome', voce.nome, v.name);
    }
    if (v.bedrooms !== undefined && k.letti && voce.letti !== v.bedrooms) {
      tagli.push([k.letti[0], k.letti[1], v.bedrooms == null ? 'null' : String(v.bedrooms)]);
      reg.cambio(file, voce.id, 'CASE.letti', voce.letti, v.bedrooms);
    }
  });
  return applica(s, tagli);
}

// la scheda nuda (senza id) mostra CASE[0]: il suo H1 statico è il SUO nome
function riscriviH1Esempio(s, file, verita, reg) {
  const c = trovaCase(s);
  const id = c && c.voci[0] && c.voci[0].id;
  const v = id && verita.get(id);
  if (!v || !v.name) return s;
  return s.replace(/(<h1 id="nomeCasa">)([^<]*)(<\/h1>)/, (tutto, a, t, z) => {
    const ora = pulisci(decodifica(t));
    if (ora === v.name) return tutto;
    if (!vecchiDi(id, c.voci[0].nome, v.name).includes(ora)) {
      reg.avviso(file, id, 'H1 della scheda nuda non è CASE[0]: «' + ora + '»');
      return tutto;
    }
    reg.cambio(file, id, 'h1', ora, v.name);
    return a + escTesto(v.name) + z;
  });
}

// la home: la casa protagonista della demo (figura «eletta» + pass Wallet)
function riscriviProtagonista(s, file, verita, reg) {
  const fig = s.match(/<figure class="s1-casa s1-eletta">[\s\S]*?<\/figure>/);
  if (!fig) return s;
  const daFoto = (fig[0].match(/listings%2Fenhanced%2F([A-Za-z0-9_-]+)%2F/) || [])[1];
  const daCarta = (s.match(/<div class="settimana[^"]*">\s*<a class="casa-p" href="\/listing\/([^"?#/]+)"/) || [])[1];
  if (daFoto && daCarta && daFoto !== daCarta) {
    reg.avviso(file, daFoto, 'la protagonista della demo non è la prima carta (' + daCarta + '): non tocco');
    return s;
  }
  const id = daFoto || daCarta;
  const v = id && verita.get(id);
  if (!v || !v.name) { if (id) reg.ignoto(file, id); return s; }
  // il nome che la demo stampa ADESSO (didascalia «<nome> · €1,600/mo»):
  // il pass Wallet della stessa scena deve portare lo stesso
  const mCap = fig[0].match(/<figcaption>([^<]*)<\/figcaption>/);
  const stampato = mCap ? pulisci(decodifica(mCap[1]).split(' · ')[0]) : '';
  const noti = vecchiDi(id, stampato, v.name);
  const nuovaFig = fig[0].replace(/(<figcaption>)([^<]*)(<\/figcaption>)/, (tutto, a, t, z) => {
    const ora = decodifica(t);
    const n = testaNuova(ora, v.name, noti, ' · ', false);
    if (n == null) { reg.avviso(file, id, 'didascalia della demo senza il nome: «' + ora + '»'); return tutto; }
    if (n === ora) return tutto;
    reg.cambio(file, id, 'demo.didascalia', ora, n);
    return a + escTesto(n) + z;
  });
  s = s.replace(fig[0], () => nuovaFig);
  return s.replace(/(<div class="s4-pass"><b>[\s\S]*?<\/b><span>)([^<]*)(<\/span>)/, (tutto, a, t, z) => {
    const ora = pulisci(decodifica(t));
    if (ora === v.name) return tutto;
    if (!noti.includes(ora)) {
      reg.avviso(file, id, 'il pass della demo non porta il nome della protagonista: «' + ora + '»');
      return tutto;
    }
    reg.cambio(file, id, 'demo.pass', ora, v.name);
    return a + escTesto(v.name) + z;
  });
}

// /try: i tre pulsanti dell'atto 1, con data-id
function riscriviTry(s, file, verita, reg) {
  return s.replace(/<button type="button" class="pv-casa" data-id="([^"]+)"[\s\S]*?<\/button>/g, (b, idEsc) => {
    const id = decodifica(idEsc);
    const v = verita.get(id);
    if (!v) { reg.ignoto(file, id); return b; }
    if (v.name) {
      const mN = b.match(/\bdata-nome="([^"]*)"/);
      const stampato = mN ? pulisci(decodifica(mN[1])) : '';
      if (mN && stampato !== v.name) {
        b = b.replace(mN[0], () => 'data-nome="' + escAttr(v.name) + '"');
        reg.cambio(file, id, 'data-nome', stampato, v.name);
      }
      b = b.replace(/(<span class="info"><b>)([^<]*)(<\/b>)/, (tutto, a, t, z) => {
        const ora = pulisci(decodifica(t));
        if (ora === v.name) return tutto;
        reg.cambio(file, id, 'nome', ora, v.name);
        return a + escTesto(v.name) + z;
      });
    }
    if (v.bedrooms !== undefined) {
      b = b.replace(/(<span class="info"><b>[^<]*<\/b><span>)([^<]*)(<\/span>)/, (tutto, a, t, z) => {
        const ora = decodifica(t);
        const pezzi = ora.split(' · ');
        let k = -1;
        pezzi.forEach((p, i) => { if (/^(\d+ bed|Studio)$/.test(p.trim())) k = i; });
        const voce = voceLetti(v.bedrooms);
        const prima = k >= 0 ? pezzi[k].trim() : '';
        if (prima === voce) return tutto;
        if (k >= 0 && voce) pezzi[k] = voce;
        else if (k >= 0) pezzi.splice(k, 1);
        else pezzi.push(voce);
        reg.cambio(file, id, 'camere', prima || '—', voce || '—');
        return a + escTesto(pezzi.join(' · ')) + z;
      });
    }
    return b;
  });
}

// ── /your-money e /board: l'id non c'era, lo ricava la regola del builder ─
const zonaDi = (z) => pulisci(z == null || z === '' ? 'Roma' : z).split('/')[0].trim();
const prezzoDi = (p) => parseInt(String(p == null ? '' : p).replace(/[^\d]/g, ''), 10) || 0;

// costruisci-soldi.py: fra le case `available` con nome e prezzo, ordinate
// per prezzo (ordinamento stabile), la più economica, la mediana, la più cara
export function presetSoldi(caseFull) {
  const vive = caseFull
    .filter((r) => r.status === 'available' && r.name && prezzoDi(r.price))
    .map((r, i) => ({ id: r._id, zona: zonaDi(r.zone), p: prezzoDi(r.price), i }))
    .sort((a, b) => a.p - b.p || a.i - b.i);
  if (vive.length < 3) return null;
  return [vive[0], vive[Math.floor(vive.length / 2)], vive[vive.length - 1]];
}

function riscriviSoldi(s, file, verita, reg, caseFull) {
  const box = s.match(/(<div class="soldi-preset"[^>]*>)([\s\S]*?)(<\/div>)/);
  if (!box) return s;
  const re = /<button type="button"( data-id="([^"]*)")?><b>([^<]*)<\/b><span>([^<]*)<\/span><\/button>/g;
  const tasti = [...box[2].matchAll(re)];
  if (!tasti.length) return s;
  let ids = tasti.map((t) => (t[2] ? decodifica(t[2]) : null));
  if (ids.some((x) => !x)) {
    // l'id non c'è: la regola del builder, verificata su zona e prezzo
    const preset = caseFull && presetSoldi(caseFull);
    const ok = preset && preset.length === tasti.length && preset.every((p, i) =>
      decodifica(tasti[i][4]) === p.zona + ' · ' + euro(p.p) + '/mo');
    if (!ok) {
      reg.avviso(file, '—', 'i tasti di /your-money non corrispondono alla regola del builder: non tocco');
      return s;
    }
    ids = preset.map((p) => p.id);
  }
  let i = 0;
  const dentro = box[2].replace(re, (tutto, haId, idEsc, nomeEsc, riga) => {
    const id = ids[i++];
    const v = verita.get(id);
    const stampato = pulisci(decodifica(nomeEsc));
    let nome = stampato;
    if (!v) reg.ignoto(file, id);
    else if (v.name && v.name !== stampato) { nome = v.name; reg.cambio(file, id, 'nome', stampato, v.name); }
    if (!haId) reg.cambio(file, id, 'data-id', '—', id);
    return '<button type="button" data-id="' + escAttr(id) + '"><b>'
      + (nome === stampato ? nomeEsc : escTesto(nome)) + '</b><span>' + riga + '</span></button>';
  });
  return s.replace(box[0], () => box[1] + dentro + box[3]);
}

// costruisci-kiosk.py: le case `available`/`waitlist` con nome e prezzo,
// dalla più nuova (`when`) alla più vecchia, ordinamento stabile
function quando(r) {
  const t = String(r.when || '').replace('Z', '+00:00').replace('+00:00+00:00', '+00:00')
    .replace(/(\.\d{3})\d+/, '$1');
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? Date.UTC(2020, 0, 1) : d.getTime();
}
export function righeKiosk(liveRows) {
  return liveRows
    .filter((r) => (r.status === 'available' || r.status === 'waitlist') && r.nome && r.price)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => quando(b.r) - quando(a.r) || a.i - b.i)
    .map((x) => x.r)
    .filter((r) => prezzoDi(r.price))
    .map((r) => ({ id: r.id,
      zona: zonaDi(r.zona).toUpperCase().slice(0, 13),
      prezzo: euro(prezzoDi(r.price)).slice(0, 6) }));
}
// la grammatica del tabellone: STU / 1BR / FLT
const tipoKiosk = (n) => (n === 0 ? 'STU' : n ? n + 'BR' : 'FLT');

function riscriviBoard(s, file, verita, reg, liveRows) {
  const c = trovaCase(s);
  if (!c || !c.voci.length) return s;
  let ids = c.voci.map((r) => r.id || null);
  const tagli = [];
  if (ids.some((x) => !x)) {
    const righe = liveRows && righeKiosk(liveRows);
    const ok = righe && righe.length === c.voci.length && righe.every((r, i) =>
      r.zona === c.voci[i].zona && r.prezzo === c.voci[i].prezzo);
    if (!ok) {
      reg.avviso(file, '—', 'le righe del tabellone non corrispondono alla regola del builder: non tocco');
      return s;
    }
    ids = righe.map((r) => r.id);
    c.ogg.forEach(([o0], i) => {
      if (c.voci[i].id) return;
      tagli.push([o0 + 1, o0 + 1, '"id": ' + jsonStr(ids[i]) + ', ']);
      reg.cambio(file, ids[i], 'id', '—', ids[i]);
    });
  }
  c.ogg.forEach(([o0, o1], i) => {
    const v = verita.get(ids[i]);
    if (!v) { reg.ignoto(file, ids[i]); return; }
    if (v.bedrooms === undefined) return;
    const k = chiavi(s, o0, o1);
    const nuovo = tipoKiosk(v.bedrooms);
    if (k.tipo && c.voci[i].tipo !== nuovo) {
      tagli.push([k.tipo[0], k.tipo[1], jsonStr(nuovo)]);
      reg.cambio(file, ids[i], 'tipo', c.voci[i].tipo, nuovo);
    }
  });
  return applica(s, tagli);
}

// ── le fotografie dei builder ──────────────────────────────────────────
// stesso formato dei file di Python: case-full con indent 1, live-rows su
// una riga con ", " e ": " e i caratteri non ASCII scritti \uXXXX
const pyStr = (x) => JSON.stringify(x).replace(/[\u007f-\uffff]/g,
  (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
function pyDumps(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(pyDumps).join(', ') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).map((k) => pyStr(k) + ': ' + pyDumps(v[k])).join(', ') + '}';
  if (typeof v === 'string') return pyStr(v);
  return JSON.stringify(v);
}
const comeTesto = (x) => (x == null ? x : String(x));
// la fotografia non è uniforme (un `bedrooms` è il numero 1, gli altri
// stringhe): un valore uguale COME TESTO non si riscrive, così il tipo che
// c'era resta e il diff dice solo ciò che è cambiato davvero. Assente e
// null sono la stessa cosa (un campo che non c'è non si aggiunge «null»)
const diverso = (vecchio, nuovo) => (vecchio == null || nuovo == null
  ? !(vecchio == null && nuovo == null) : String(vecchio) !== String(nuovo));

function riscriviCaseFull(testo, file, verita, reg) {
  const docs = JSON.parse(testo);
  for (const d of docs) {
    const v = verita.get(d._id);
    if (!v) continue;
    if (v.name && pulisci(d.name) !== v.name) { reg.cambio(file, d._id, 'name', pulisci(d.name), v.name); d.name = v.name; }
    for (const [k, x] of Object.entries(v.campi || {})) {
      const nuovo = comeTesto(x);
      if (!diverso(d[k], nuovo)) continue;
      reg.cambio(file, d._id, k, d[k] ?? '—', nuovo ?? '—');
      // un campo che la fonte non porta più si toglie (null), mai una
      // stringa «null» al suo posto
      d[k] = nuovo == null ? null : nuovo;
    }
  }
  return JSON.stringify(docs, null, 1);
}

function riscriviLiveRows(testo, file, verita, reg) {
  const righe = JSON.parse(testo).map((r) => {
    const v = verita.get(r.id);
    if (!v) return r;
    const o = {};
    for (const k of Object.keys(r)) {
      o[k] = r[k];
      if (k === 'beds' && !Object.prototype.hasOwnProperty.call(r, 'bedrooms')) o.bedrooms = r.bedrooms;
    }
    if (v.name && pulisci(o.nome) !== v.name) { reg.cambio(file, r.id, 'nome', pulisci(o.nome), v.name); o.nome = v.name; }
    if (v.campi && v.campi.beds !== undefined && diverso(o.beds, comeTesto(v.campi.beds))) {
      reg.cambio(file, r.id, 'beds', o.beds ?? '—', comeTesto(v.campi.beds) ?? '—');
      o.beds = comeTesto(v.campi.beds);
    }
    // il campo strutturato accanto al testo libero: i builder lo leggono
    // quando il testo non ha cifre, e lo leggeranno PER PRIMO (FACTS)
    if (v.bedrooms !== undefined) {
      const nuovo = v.bedrooms == null ? null : String(v.bedrooms);
      if (o.bedrooms !== nuovo) { reg.cambio(file, r.id, 'bedrooms', o.bedrooms ?? '—', nuovo ?? 'null'); o.bedrooms = nuovo; }
    } else if (o.bedrooms === undefined) delete o.bedrooms;
    return o;
  });
  return pyDumps(righe);
}

// ── il giro intero ─────────────────────────────────────────────────────
// la fonte va DETTA: `verita` (una Map già pronta: i test), `fromFirestore`
// o `dallaMappa`. Senza, si rifiuta: un default silenzioso (com'era, la
// mappa del 15/10) riporterebbe i nomi di quel giorno sopra quelli che
// l'admin ha scelto dopo.
export const FONTE_MANCANTE = 'nessuna fonte: --from-firestore (gli annunci veri) oppure --dalla-mappa (la migrazione del 15/10)';
export async function allinea(opz = {}) {
  const root = opz.root || REPO;
  const reg = new Registro();
  if (!opz.verita && opz.fromFirestore && opz.dallaMappa) {
    throw new Error('una fonte sola: --from-firestore OPPURE --dalla-mappa');
  }
  let verita = opz.verita;
  if (!verita && opz.fromFirestore) verita = await veritaDaFirestore(opz.fetch);
  else if (!verita && opz.dallaMappa) verita = veritaDallaMappa(opz.fixture ? leggiFixture(opz.fixture) : undefined);
  if (!verita) throw new Error(FONTE_MANCANTE);
  const leggi = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : null);
  const caseFullTesto = leggi(FOTOGRAFIE.caseFull);
  const liveRowsTesto = leggi(FOTOGRAFIE.liveRows);
  // le regole dei builder si applicano alle fotografie COME ERANO (l'id
  // si ricava dalla fotografia da cui la pagina è stata costruita)
  const caseFull = caseFullTesto ? JSON.parse(caseFullTesto) : null;
  const liveRows = liveRowsTesto ? JSON.parse(liveRowsTesto) : null;

  const nuovi = {};
  for (const f of PAGINE) {
    const prima = leggi(f);
    if (prima == null) continue;
    let s = prima;
    if (f === 'apartments.html' || f === 'index.html') s = riscriviCarte(s, f, verita, reg);
    // l'H1 prima del CASE: si confronta col nome che CASE[0] porta adesso
    if (f === 'apartment-detail.html') s = riscriviH1Esempio(s, f, verita, reg);
    if (f === 'index.html' || f === 'apartment-detail.html') s = riscriviCase(s, f, verita, reg);
    if (f === 'index.html') s = riscriviProtagonista(s, f, verita, reg);
    if (f === 'try.html') s = riscriviTry(s, f, verita, reg);
    if (f === 'your-money.html') s = riscriviSoldi(s, f, verita, reg, caseFull);
    if (f === 'board.html') s = riscriviBoard(s, f, verita, reg, liveRows);
    if (f === 'apartments.html') {
      // l'ItemList ripete nome e camere delle card: si rifà nello stesso giro
      const it = rigeneraItemList(s);
      if (it.html) {
        if (it.html !== s) reg.cambio(f, '—', 'ItemList', 'dalle card di prima', 'dalle card di adesso');
        s = it.html;
      } else reg.avviso(f, '—', 'ItemList non rigenerato: troppe poche card estratte');
    }
    if (s !== prima) nuovi[f] = s;
  }
  if (caseFullTesto) {
    const t = riscriviCaseFull(caseFullTesto, FOTOGRAFIE.caseFull, verita, reg);
    if (t !== caseFullTesto) nuovi[FOTOGRAFIE.caseFull] = t;
  }
  if (liveRowsTesto) {
    const t = riscriviLiveRows(liveRowsTesto, FOTOGRAFIE.liveRows, verita, reg);
    if (t !== liveRowsTesto) nuovi[FOTOGRAFIE.liveRows] = t;
  }
  if (!opz.dry) for (const [f, t] of Object.entries(nuovi)) fs.writeFileSync(path.join(root, f), t);
  return { cambi: reg.cambi, avvisi: reg.avvisi, ignoti: [...reg.ignoti], file: Object.keys(nuovi), nuovi };
}

// ── il comando ─────────────────────────────────────────────────────────
export const USO = [
  'uso: node scripts/catalogo-nomi.mjs (--from-firestore | --dalla-mappa) [--dry | --check] [--root <cartella>]',
  '  --from-firestore  la fonte: gli annunci pubblici VERI (dopo l\'«Applica» di /catalogo)',
  '  --dalla-mappa     la fonte: la migrazione una tantum del 15/10 — js/catalogo-correzioni.js',
  '                    sul fixture tests/catalogo/fixture-listings-2026-10-15.json (--fixture <file>)',
  '  --dry             stampa le modifiche, non scrive',
  '  --check           come --dry, ed esce 1 se c\'è lavoro o qualcosa che non si può allineare',
  'Nessuna fonte di default: chi lancia lo script dice da dove prende la verità.',
].join('\n');

// cosa il giro può dire di sé: le righe da stampare e il codice d'uscita.
// Un avviso o una casa che la fonte non conosce sono pagine NON allineate:
// mai «nessuna modifica: le pagine dicono già…» sopra di loro, e --check
// esce 1 anche per quelli, non solo per le modifiche da scrivere.
export function riassunto(r, { dry = false, check = false } = {}) {
  const righe = [];
  const perFile = {};
  for (const c of r.cambi) (perFile[c.file] = perFile[c.file] || []).push(c);
  for (const [f, cc] of Object.entries(perFile)) {
    righe.push(f);
    for (const c of cc) {
      righe.push('  ' + c.id.padEnd(22) + ' ' + c.campo.padEnd(15) + ' «' + c.da.slice(0, 70) + '» → «' + c.a.slice(0, 70) + '»');
    }
  }
  for (const a of r.avvisi) righe.push('  ⚠ ' + a.file + ' · ' + a.id + ' — ' + a.testo);
  if (r.ignoti.length) {
    righe.push('  ⚠ case in pagina che la fonte non conosce, lasciate com\'erano (' + r.ignoti.length + '): '
      + r.ignoti.slice(0, 8).join(', ') + (r.ignoti.length > 8 ? ', …' : ''));
  }
  const nonAllineate = r.avvisi.length + r.ignoti.length;
  if (r.cambi.length) {
    righe.push(`${r.cambi.length} modifiche in ${r.file.length} file${dry ? ' (anteprima — niente scritto)' : ''}`);
  }
  if (nonAllineate) {
    righe.push(`⚠ ${nonAllineate} punti che questo giro NON può allineare (qui sopra): le pagine non sono allineate alla fonte`);
  } else if (!r.cambi.length) {
    righe.push('nessuna modifica: le pagine dicono già i nomi e le camere della fonte');
  }
  const codice = check && (r.cambi.length || nonAllineate) ? 1 : 0;
  return { righe, codice };
}

// gli argomenti, controllati: una fonte e una sola, niente sconosciuti (un
// «--chek» scritto male, ignorato, diventerebbe un giro che SCRIVE)
export function argomenti(arg) {
  const NOTI = new Set(['--from-firestore', '--dalla-mappa', '--dry', '--check']);
  const CON_VALORE = new Set(['--root', '--fixture']);
  const o = { fromFirestore: false, dallaMappa: false, dry: false, check: false };
  for (let i = 0; i < arg.length; i++) {
    const a = arg[i];
    if (a === '-h' || a === '--help') return { aiuto: true };
    if (CON_VALORE.has(a)) {
      if (i + 1 >= arg.length || String(arg[i + 1]).startsWith('--')) return { errore: a + ' vuole un valore' };
      o[a === '--root' ? 'root' : 'fixture'] = path.resolve(arg[++i]);
    } else if (NOTI.has(a)) {
      o[{ '--from-firestore': 'fromFirestore', '--dalla-mappa': 'dallaMappa', '--dry': 'dry', '--check': 'check' }[a]] = true;
    } else return { errore: 'argomento sconosciuto: ' + a };
  }
  if (o.fromFirestore && o.dallaMappa) return { errore: 'una fonte sola: --from-firestore OPPURE --dalla-mappa' };
  if (!o.fromFirestore && !o.dallaMappa) return { errore: FONTE_MANCANTE };
  if (o.fixture && !o.dallaMappa) return { errore: '--fixture vale solo con --dalla-mappa' };
  if (o.check) o.dry = true;
  return { opz: o };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const a = argomenti(process.argv.slice(2));
  if (a.aiuto) { console.log(USO); process.exit(0); }
  if (!a.opz) {
    console.error('catalogo-nomi: ' + a.errore);
    console.error(USO);
    process.exit(2);
  }
  try {
    const r = await allinea(a.opz);
    const { righe, codice } = riassunto(r, a.opz);
    for (const l of righe) console.log(l);
    process.exit(codice);
  } catch (e) {
    console.error('catalogo-nomi: ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}
