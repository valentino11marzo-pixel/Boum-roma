// scripts/vetrina-riallinea.mjs
// LE QUATTRO PAGINE DELLA VETRINA SONO LA LORO RICOSTRUZIONE.
//
// IL REPERTO (16/10/2026). apartments, index, apartment-detail e board
// nascono dai builder di design/ (costruisci-ad/-portale/-ld/-kiosk.py) su
// frammenti HTML — ma per due mesi le correzioni sono andate sulle PAGINE e
// non sui frammenti: il contratto di scorrimento, boom-track, le riserve del
// CLS, l'innesto della vetrina (window.__muroInnesta), la scheda del giro GEO
// del 15/10 (corsie, casa irraggiungibile, apply confermato dal server,
// noindex del template), tutto il tabellone vivo di /board. Misurato: una
// ricostruzione «sito» toglieva 320 righe alla vetrina, 143 alla home, 677
// alla scheda e 353 al tabellone, senza un errore. E stampava sulla home un
// totale d'ingresso SENZA l'IVA sotto l'etichetta «fee incl. VAT».
//
// La regola, da qui: una pagina della vetrina è la ricostruzione dei suoi
// frammenti, a meno dei DATI. I dati (le carte, i CASE, i conteggi, le date
// di build, l'ItemList) sono la fotografia del catalogo e del giorno in cui
// la build è girata: si rinnovano con una build piena o con
// scripts/catalogo-nomi.mjs, mai a mano. Tutto il resto — stile, markup,
// script — è dei frammenti.
//
//   node scripts/vetrina-riallinea.mjs            ricostruisce in una cartella
//        temporanea (mai sopra le pagine vere) e riscrive nelle pagine SOLO
//        le parti che non sono dati
//   node scripts/vetrina-riallinea.mjs --check    lo stesso senza scrivere:
//        esce 1 se una pagina non è la sua ricostruzione
//   node scripts/vetrina-riallinea.mjs --dry      dice cosa cambierebbe
//
// Il flusso di lavoro: si corregge il FRAMMENTO (o il builder), poi si lancia
// questo script e si committano frammento e pagina insieme. Una correzione
// scritta solo nella pagina fa cadere tests/catalogo/vetrina.mjs, che chiama
// confronta() su tutte e quattro.
//
// I DATI, uno per uno, sono le «maschere» qui sotto: per ogni pagina i posti
// in cui il builder scrive il catalogo o la data. Una maschera copre il
// minimo — un numero, una stringa JSON, il muro delle carte — e mai uno
// stile o uno script: ciò che resta fuori dalle maschere deve coincidere
// byte per byte. Limite dichiarato: la GRAMMATICA delle carte (il markup
// dentro #muro e .settimana) è dato anch'essa, e cambia solo con una build
// piena; la vigila tests/catalogo/vetrina.mjs (le carte dicono la
// fotografia, per id) e tests/vetrina (l'innesto parla la stessa lingua).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rigenera as rigeneraItemList } from './catalogo-schema.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// pagina → il builder che la scrive, e il file che il builder produce
export const COSTRUITE = {
  'apartments.html': { builder: 'costruisci-ad.py', uscita: 'boom-discovery-sito.html' },
  'index.html': { builder: 'costruisci-portale.py', uscita: 'boom-portale-sito.html' },
  'apartment-detail.html': { builder: 'costruisci-ld.py', uscita: 'boom-casa-p-sito.html' },
  'board.html': { builder: 'costruisci-kiosk.py', uscita: 'boom-kiosk-sito.html' },
};
// cio' che i builder leggono FUORI da design/: il contratto di scorrimento
// (testa.scroll()) e la foto del fondatore (costruisci-portale.py)
export const FUORI_DA_DESIGN = ['css/boom-scroll.css', 'js/boom-scroll.js', 'img/founder.jpg'];

export const PYTHON = ['python3', 'python'].find((p) =>
  spawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0) || null;

// LA COSTRUZIONE, in una cartella temporanea: una copia di design/ (i
// frammenti di pages-deco sopra quelli di home-live-deco, come vuole il
// README), i file che i builder leggono fuori da design/, e foto-uri /
// foto-casa vuoti (file di lavoro mai versionati: il modo `sito` non li usa).
// `ritocca(H)` puo' cambiare i frammenti PRIMA della build (le mutazioni dei
// test). Ritorna { d, H, errori, out(nome) }; la cartella la cancella chi
// chiama (rmSync(d)).
export function costruisci({ root = REPO, quali = Object.values(COSTRUITE).map((c) => c.builder),
  ritocca } = {}) {
  if (!PYTHON) throw new Error('python3 non c\'è: i builder di design/ sono python');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-build-'));
  fs.cpSync(path.join(root, 'design'), path.join(d, 'design'), { recursive: true });
  for (const f of FUORI_DA_DESIGN) {
    fs.mkdirSync(path.join(d, path.dirname(f)), { recursive: true });
    fs.copyFileSync(path.join(root, f), path.join(d, f));
  }
  const H = path.join(d, 'design', 'home-live-deco');
  const PD = path.join(d, 'design', 'pages-deco');
  for (const f of fs.readdirSync(PD)) {
    if (fs.statSync(path.join(PD, f)).isFile()) fs.copyFileSync(path.join(PD, f), path.join(H, f));
  }
  fs.writeFileSync(path.join(H, 'foto-uri.json'), '{}');
  fs.writeFileSync(path.join(H, 'foto-casa.json'), '[]');
  // un ritocco che si rompe non lascia la cartella in giro
  if (ritocca) {
    try { ritocca(H); } catch (e) { fs.rmSync(d, { recursive: true, force: true }); throw e; }
  }
  const errori = [];
  for (const b of quali) {
    const x = spawnSync(PYTHON, ['-B', b, 'sito'], { cwd: H, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    if (x.status !== 0) errori.push(b + ': ' + (x.stderr || x.stdout || '').trim().split('\n').pop());
  }
  const out = (n) => fs.readFileSync(path.join(H, n), 'utf8');
  return { d, H, errori, out };
}

// la ricostruzione di UNA pagina come la pagina viva la porta: il builder e,
// per la vetrina, il passo documentato che ne scrive l'ItemList
// (scripts/catalogo-schema.mjs, BOOM_CATALOGO prima di </head>)
export function ricostruita(B, pagina) {
  const h = B.out(COSTRUITE[pagina].uscita);
  if (pagina !== 'apartments.html') return h;
  const r = rigeneraItemList(h);
  if (!r.html) throw new Error('catalogo-schema: solo ' + r.voci.length + ' case nella ricostruzione');
  return r.html;
}

// ── LE MASCHERE: i dati, pagina per pagina ──────────────────────────────
// ogni regex ha TRE gruppi: prima · dato · dopo. Il dato diventa ⟦nome⟧.
const M = (nome, re) => ({ nome, re });
const JSON_RIGA = (nome, prefisso) => M(nome,
  new RegExp('(^' + prefisso.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(\\[.*\\])(;$)', 'm'));
export const MASCHERE = {
  'apartments.html': [
    // la description conta le case («Browse 19 … 5 available now, 4 to reserve»)
    M('descrizione', /(<meta name="description" content=")([^"]*)(">)/),
    M('og-descrizione', /(<meta property="og:description" content=")([^"]*)(">)/),
    M('tw-descrizione', /(<meta name="twitter:description" content=")([^"]*)(">)/),
    // l'immagine social è la foto della prima carta
    M('og-immagine', /(<meta property="og:image" content=")([^"]*)(">)/),
    M('og-immagine-ssl', /(<meta property="og:image:secure_url" content=")([^"]*)(">)/),
    M('tw-immagine', /(<meta name="twitter:image" content=")([^"]*)(">)/),
    M('raccolta-descrizione', /("@type": "CollectionPage".*?"description": ")((?:[^"\\]|\\.)*)(")/),
    M('raccolta-quante', /("@type": "CollectionPage".*?"numberOfItems": )(\d+)(\})/),
    M('itemlist', /(<!-- BOOM_CATALOGO:START -->\n<script type="application\/ld\+json">\n)(.*)(\n<\/script>\n<!-- BOOM_CATALOGO:END -->)/),
    M('libere', /(<div class="hero-eyebrow"><b><\/b>)(\d+)( homes available now<\/div>)/),
    M('zone-libere', /(<div class="zone-piede"><span><b>)(\d+)(<\/b> available now ·)/),
    M('zone-quante', /(\n\s*)((?:top \d+ of \d+|\d+) zones · updated <b>[^<]*)(<\/b><\/span>)/),
    M('muro', /(<div class="muro coro" id="muro">\n)([\s\S]*?)(\n {6}<button type="button" class="skycarta")/),
    M('dotazioni', /(<span>Features<\/span>\n {6})([\s\S]*?)(\n {4}<\/div>\n {4}<div class="foglio-piede">)/),
    JSON_RIGA('zone', '    var ZONE = '),
  ],
  'index.html': [
    M('libere', /(<div class="board-piede"><span><b>)(\d+)(<\/b> homes available now<\/span>)/),
    M('aggiornato', /(<span>Catalogue updated <b>)([^<]*)(<\/b>)/),
    M('settimana', /(<div class="settimana coro">\n)([\s\S]*?)(\n {6}<\/div>\n {4}<\/div>)/),
    // la scena dell'apparecchio: la casa eletta e le due vicine, vere
    // le due vicine (prima e terza figura) e la casa eletta in mezzo
    M('scena-foto-vicine', /(<figure class="s1-casa"><img loading="lazy" decoding="async" src=")([^"]*)(" alt="")/),
    M('scena-zona-2', /(decoding="async"><figcaption>)([^<]*)(<\/figcaption><\/figure>\n {14}<figure class="s1-casa s1-eletta">)/),
    M('scena-foto', /(<figure class="s1-casa s1-eletta"><img loading="lazy" decoding="async" src=")([^"]*)(")/),
    M('scena-nome', /(<figcaption>)([^<]*)(<\/figcaption><\/figure>\n {14}<figure class="s1-casa"><img)/),
    M('scena-zona-3', /(decoding="async"><figcaption>)([^<]*)(<\/figcaption><\/figure>\n {12}<\/div>)/),
    M('scena-totale', /(<div class="sc-totale"><span>[^<]*<\/span>\n\s*<b>)([^<]*)(<\/b>)/),
    M('scena-pass', /(<div class="s4-pass"><b>[\s\S]*?<\/b><span>)([^<]*)(<\/span>)/),
    JSON_RIGA('tabellone', '  var RIGHE = '),
    JSON_RIGA('conta', '    var CONTA = '),
    JSON_RIGA('giorno', '    var CASE_G = '),
    JSON_RIGA('skyline', '  var CASE = '),
  ],
  'apartment-detail.html': [
    M('h1', /(<h1 id="nomeCasa">)([^<]*)(<\/h1>)/),
    M('dove', /(<p class="dove" id="doveCasa">)([^<]*)(<\/p>)/),
    JSON_RIGA('case', '  var CASE = '),
  ],
  'board.html': [
    JSON_RIGA('righe', '  var CASE = '),
  ],
};

const TOKEN = (nome) => '⟦' + nome + '⟧';

// il testo con i dati al posto loro (⟦nome⟧) e i dati, nell'ordine
export function maschera(pagina, testo) {
  const dati = [];
  let t = testo;
  for (const { nome, re } of MASCHERE[pagina] || []) {
    const g = new RegExp(re.source, re.flags.replace('g', '') + 'g');
    t = t.replace(g, (m, prima, dato, dopo) => {
      dati.push([nome, dato]);
      return prima + TOKEN(nome) + dopo;
    });
  }
  return { testo: t, dati };
}

// il contrario: rimette i dati, maschera per maschera, nell'ordine
export function smaschera(testo, dati) {
  const perNome = new Map();
  for (const [n, v] of dati) (perNome.get(n) || perNome.set(n, []).get(n)).push(v);
  let t = testo;
  for (const [n, valori] of perNome) {
    const pezzi = t.split(TOKEN(n));
    if (pezzi.length - 1 !== valori.length) {
      throw new Error(`il dato «${n}»: ${pezzi.length - 1} posti, ${valori.length} valori`);
    }
    t = pezzi.reduce((acc, p, i) => acc + valori[i - 1] + p);
  }
  return t;
}

const conta = (dati) => dati.reduce((m, [n]) => m.set(n, (m.get(n) || 0) + 1), new Map());

// pagina viva e ricostruzione, a meno dei dati: [] se coincidono, altrimenti
// i guai (quali dati mancano, e dove il testo diverge: prima e ultima riga)
export function confronta(pagina, viva, ricostruzione) {
  const v = maschera(pagina, viva), r = maschera(pagina, ricostruzione);
  const guai = [];
  const cv = conta(v.dati), cr = conta(r.dati);
  for (const { nome } of MASCHERE[pagina] || []) {
    if ((cv.get(nome) || 0) !== (cr.get(nome) || 0)) {
      guai.push(`${pagina}: il dato «${nome}» ${cv.get(nome) || 0} volte nella pagina, ${cr.get(nome) || 0} nella ricostruzione`);
    }
  }
  if (v.testo === r.testo) return guai;
  const a = v.testo.split('\n'), b = r.testo.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const taglia = (s) => (s == null ? '(niente)' : '«' + s.trim().slice(0, 90) + '»');
  guai.push(`${pagina}: diversa dalla ricostruzione dalla riga ${i + 1} (pagina ${a.length - j - i} righe, `
    + `ricostruzione ${b.length - j - i}) — pagina ${taglia(a[i])} / ricostruzione ${taglia(b[i])}`);
  return guai;
}

// la pagina viva con le parti NON-dato della ricostruzione: i dati restano
// quelli della pagina (la fotografia del catalogo non cambia qui)
export function riallinea(pagina, viva, ricostruzione) {
  const v = maschera(pagina, viva), r = maschera(pagina, ricostruzione);
  const cv = conta(v.dati), cr = conta(r.dati);
  for (const [n, k] of cr) {
    if ((cv.get(n) || 0) !== k) throw new Error(`${pagina}: il dato «${n}» ${cv.get(n) || 0} volte nella pagina, ${k} nella ricostruzione — non si riallinea a occhi chiusi`);
  }
  return smaschera(r.testo, v.dati);
}

// ── il comando ───────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const ignoti = args.filter((a) => !['--check', '--dry'].includes(a));
  if (ignoti.length) {
    console.error('uso: node scripts/vetrina-riallinea.mjs [--check | --dry]\n  argomento sconosciuto: ' + ignoti.join(' '));
    process.exit(2);
  }
  const CHECK = args.includes('--check'), DRY = CHECK || args.includes('--dry');
  if (!PYTHON) { console.error('python3 non c\'è: i builder di design/ sono python'); process.exit(2); }
  const B = costruisci();
  let codice = 0;
  try {
    if (B.errori.length) { console.error('i builder non girano:\n  ' + B.errori.join('\n  ')); process.exit(1); }
    for (const pagina of Object.keys(COSTRUITE)) {
      const fp = path.join(REPO, pagina);
      const viva = fs.readFileSync(fp, 'utf8');
      const nuova = riallinea(pagina, viva, ricostruita(B, pagina));
      if (nuova === viva) { console.log(`= ${pagina}: è già la sua ricostruzione (a meno dei dati)`); continue; }
      const a = viva.split('\n').length, b = nuova.split('\n').length;
      if (CHECK) {
        codice = 1;
        console.log(`✗ ${pagina}: NON è la sua ricostruzione — ` + confronta(pagina, viva, nuova).join(' · '));
      } else {
        console.log(`${DRY ? '~' : '✓'} ${pagina}: ${a} → ${b} righe${DRY ? ' (niente scritto)' : ''}`);
        if (!DRY) fs.writeFileSync(fp, nuova);
      }
    }
  } finally { fs.rmSync(B.d, { recursive: true, force: true }); }
  process.exit(codice);
}
