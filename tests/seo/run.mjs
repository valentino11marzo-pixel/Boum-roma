// tests/seo/run.mjs
// LA GUARDIA SEO — otto regole, tutte nate da un difetto vero trovato in
// produzione, mai da una lista di buone pratiche copiata.
//
// Il reperto che l'ha fatta nascere: property-finding.html e board.html,
// due pagine LIVE, non avevano <!doctype>, <html lang> ne' <meta charset>.
// Risultato misurato in Chromium: quirks mode, nessuna lingua dichiarata e
// il browser che indovina windows-1252 — cioe' «â‚¬350» al posto di «€350»,
// «Â§4.2» al posto di «§4.2» e le stelle ★ della recensione sparite. Su una
// pagina che vende. Non e' una svista di stile: e' il documento che smette
// di essere un documento.
//
// Le pagine pubbliche si DEDUCONO da sitemap.xml, mai da una lista scritta
// a mano (stessa disciplina di tests/media/hosts.mjs): una lista a mano
// invecchia e il giorno che invecchia la guardia diventa decorativa.

import fs from 'node:fs';
import path from 'node:path';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const elenco = (righe, max = 12) => '\n      ' + righe.slice(0, max).join('\n      ')
  + (righe.length > max ? `\n      … e altre ${righe.length - max}` : '');

const sitemap = fs.readFileSync(path.join(R, 'sitemap.xml'), 'utf8');
const loc = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const pubbliche = [];
for (const u of loc) {
  const rel = u.replace(/^https?:\/\/[^/]+\/?/, '').replace(/\/$/, '');
  const f = rel === '' ? 'index.html' : (rel.endsWith('.html') ? rel : rel + '.html');
  if (fs.existsSync(path.join(R, f))) pubbliche.push([f, u]);
}

console.log('\n\x1b[1m▸ seo\x1b[0m  la casa e in ordine: '
  + `${pubbliche.length} pagine pubbliche dedotte dalla sitemap`);

const testa = (s) => s.slice(0, Math.max(s.indexOf('</head>'), 4000));
const attr = (s, re) => { const m = s.match(re); return m ? m[1] : ''; };

// ── 1 · il documento e' un documento ────────────────────────────────────
const monchi = [];
for (const [f] of pubbliche) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const capo = s.slice(0, 600).toLowerCase();
  const manca = [];
  if (!capo.includes('<!doctype html')) manca.push('doctype (quirks mode)');
  if (!/<html[^>]+\blang=/i.test(s.slice(0, 800))) manca.push('html lang');
  if (!/<meta[^>]+charset/i.test(s.slice(0, 4000))) manca.push('meta charset');
  if (manca.length) monchi.push(`${f} → ${manca.join(' · ')}`);
}
monchi.length
  ? male(`${monchi.length} pagine non sono documenti completi:` + elenco(monchi)
      + '\n      Senza charset il browser indovina windows-1252 e stampa â‚¬350 invece di €350.')
  : bene('ogni pagina pubblica ha doctype, lingua e charset');

// ── 2 · un'entita' sola per pagina ──────────────────────────────────────
// Un secondo nodo Organization o Service sulla stessa pagina non e' "piu'
// SEO": sono due entita' in concorrenza per la stessa cosa, e chi legge il
// markup deve sceglierne una.
// Il doppione e' due entita' con lo STESSO tipo e la STESSA identita'
// (url o @id). Piu' Service sulla stessa pagina non sono un difetto se
// descrivono offerte diverse: /reunion ne dichiara tre — proprietario,
// inquilino, acquirente — con url distinti, ed e' una scelta voluta. Una
// regola che li contasse come errore avrebbe insegnato a ignorarla.
const UNICI = new Set(['Organization', 'RealEstateAgent', 'LocalBusiness',
  'WebSite', 'BreadcrumbList', 'FAQPage', 'Service', 'Product', 'WebPage']);
const doppi = [], rotti = [];
for (const [f, url] of pubbliche) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const conta = {};
  for (const m of s.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
    let d;
    try { d = JSON.parse(m[1]); } catch { rotti.push(f); continue; }
    for (const n of (d['@graph'] || [d])) {
      for (const t of [].concat(n['@type'] || [])) {
        if (!UNICI.has(t)) continue;
        const chiave = t + '@' + (n['@id'] || n.url || url);
        conta[chiave] = (conta[chiave] || 0) + 1;
      }
    }
  }
  const d2 = Object.entries(conta).filter(([, n]) => n > 1);
  if (d2.length) doppi.push(`${f} → ${d2.map(([k, n]) => `${k.split('@')[0]}×${n} sullo stesso url`).join(', ')}`);
}
rotti.length ? male(`JSON-LD che non parsa: ${[...new Set(rotti)].join(', ')}`)
             : bene('ogni blocco JSON-LD e valido');
doppi.length
  ? male(`${doppi.length} pagine dichiarano la stessa entita due volte:` + elenco(doppi))
  : bene('nessuna pagina dichiara due volte la stessa entita');

// ── 3 · titolo e descrizione, dentro i limiti e UNICI ───────────────────
// Due pagine con lo stesso titolo competono fra loro nello stesso indice.
const T_MAX = 62, D_MIN = 110, D_MAX = 165;
const fuori = [], vistiT = new Map(), vistiD = new Map(), gemelli = [];
for (const [f] of pubbliche) {
  const h = testa(fs.readFileSync(path.join(R, f), 'utf8'));
  const t = attr(h, /<title>([\s\S]*?)<\/title>/).trim();
  const d = attr(h, /<meta name="description" content="([^"]*)"/);
  if (!t) fuori.push(`${f} → nessun titolo`);
  else if (t.length > T_MAX) fuori.push(`${f} → titolo ${t.length} car (max ${T_MAX})`);
  if (!d) fuori.push(`${f} → nessuna descrizione`);
  else if (d.length < D_MIN || d.length > D_MAX)
    fuori.push(`${f} → descrizione ${d.length} car (${D_MIN}–${D_MAX})`);
  if (t) { if (vistiT.has(t)) gemelli.push(`titolo ripetuto: ${vistiT.get(t)} = ${f}`); else vistiT.set(t, f); }
  if (d) { if (vistiD.has(d)) gemelli.push(`descrizione ripetuta: ${vistiD.get(d)} = ${f}`); else vistiD.set(d, f); }
}
fuori.length ? male(`${fuori.length} titoli/descrizioni fuori misura:` + elenco(fuori))
             : bene(`titoli ≤${T_MAX} e descrizioni ${D_MIN}–${D_MAX} ovunque`);
gemelli.length ? male(`${gemelli.length} pagine si fanno concorrenza da sole:` + elenco(gemelli))
               : bene('nessun titolo o descrizione ripetuto fra pagine');

// ── 4 · la canonical dice la verita' ────────────────────────────────────
const canon = [];
for (const [f, u] of pubbliche) {
  const h = testa(fs.readFileSync(path.join(R, f), 'utf8'));
  const c = attr(h, /<link rel="canonical" href="([^"]+)"/);
  if (!c) canon.push(`${f} → nessuna canonical`);
  else if (!/^https:\/\//.test(c)) canon.push(`${f} → canonical relativa (${c})`);
  else if (c.replace(/\/$/, '') !== u.replace(/\/$/, ''))
    canon.push(`${f} → canonical ${c} ≠ sitemap ${u}`);
}
canon.length ? male(`${canon.length} canonical sbagliate o assenti:` + elenco(canon))
             : bene('ogni canonical e assoluta e concorda con la sitemap');

// ── 5 · l'immagine social esiste davvero ────────────────────────────────
const ogMorte = [];
for (const [f] of pubbliche) {
  const h = testa(fs.readFileSync(path.join(R, f), 'utf8'));
  const img = attr(h, /<meta property="og:image" content="([^"]+)"/);
  if (!img) { ogMorte.push(`${f} → nessuna og:image`); continue; }
  const rel = img.replace(/^https?:\/\/[^/]+\//, '');
  if (!/^https?:/.test(img) || img.includes('boomrome.com')) {
    if (!fs.existsSync(path.join(R, rel))) ogMorte.push(`${f} → og:image assente sul disco (${rel})`);
  }
}
ogMorte.length ? male(`${ogMorte.length} immagini social dichiarate e non consegnate:` + elenco(ogMorte))
               : bene('ogni og:image dichiarata esiste come file');

// ── 6 · llms.txt non promette piu' della pagina ─────────────────────────
// Il file che leggono i motori di risposta portava ancora «the average
// client saves €600+», la media mai misurata che avevamo TOLTO dalla
// pagina: la stessa divergenza fra cio' che si mostra e cio' che si
// dichiara, un piano piu' su.
const llms = fs.existsSync(path.join(R, 'llms.txt'))
  ? fs.readFileSync(path.join(R, 'llms.txt'), 'utf8') : '';
const cat = fs.readFileSync(path.join(R, 'api/_catalog.js'), 'utf8');
const prezzi = {};
for (const m of cat.matchAll(/'([a-z-]+)':\s*\{\s*eur:\s*(\d+)/g)) prezzi[m[1]] = m[2];
const bugie = [];
if (!llms) bugie.push('llms.txt assente');
if (/average client saves|€600\+/i.test(llms))
  bugie.push('llms.txt promette una media che non abbiamo mai misurato (€600+)');
for (const [k, eur] of Object.entries(prezzi)) {
  const riga = llms.split('\n').find((l) => l.includes('/' + k + ')'));
  if (riga && !riga.includes('€' + eur))
    bugie.push(`llms.txt: ${k} non cita €${eur} (catalogo) — ${riga.slice(0, 70)}…`);
}
bugie.length ? male(`llms.txt non e allineato:` + elenco(bugie))
             : bene('llms.txt cita i prezzi veri e nessuna promessa non dimostrabile');

// ── 7 · una domanda dichiarata deve ESSERE in pagina ───────────────────
// La regola che ha smascherato faq.html: dichiarava nove domande di cui SEI
// non esistevano come testo visibile — parafrasi ottimizzate per il motore
// di domande che la pagina pone con altre parole. E' contenuto nascosto, e
// Google lo sanziona; per un motore di risposta e' peggio ancora, perche'
// cita una frase che il lettore poi non trova.
const fantasmi = [];
for (const [f] of pubbliche) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const vis = s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
  for (const m of s.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
    let d; try { d = JSON.parse(m[1]); } catch { continue; }
    for (const nodo of (d['@graph'] || [d])) {
      if (nodo['@type'] !== 'FAQPage') continue;
      for (const q of (nodo.mainEntity || [])) {
        if (!vis.includes(q.name)) fantasmi.push(`${f} → «${q.name}»`);
      }
    }
  }
}
fantasmi.length
  ? male(`${fantasmi.length} domande dichiarate che la pagina non pone:` + elenco(fantasmi))
  : bene('ogni domanda dichiarata esiste come testo visibile');

// ── 8 · nessuna pagina pubblica orfana ─────────────────────────────────
// Una pagina che vende e non e' nella sitemap si scopre solo per caso.
const inSitemap = new Set(pubbliche.map(([f]) => f));
const orfane = [];
for (const f of fs.readdirSync(R)) {
  if (!f.endsWith('.html') || f.startsWith('preview-')) continue;
  if (inSitemap.has(f)) continue;
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  if (/noindex/i.test(s.slice(0, 4000))) continue;            // scelta esplicita
  const c = (s.slice(0, 4000).match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  if (!c) continue;                                           // non e' una pagina pubblica
  // Una copia storica che canonicalizza alla versione VIVA e' gestita
  // bene, non orfana: le -classic e -legacy puntano tutte all'originale.
  // Orfana e' solo chi dichiara se' stesso e non e' nella sitemap.
  const mia = 'https://www.boomrome.com/' + f.replace(/\.html$/, '').replace(/^index$/, '');
  if (c.replace(/\/$/, '') !== mia.replace(/\/$/, '')) continue;
  orfane.push(f);
}
orfane.length
  ? male(`${orfane.length} pagine indicizzabili fuori dalla sitemap:` + elenco(orfane)
      + '\n      O entrano in sitemap.xml, o dichiarano noindex. Restare a meta e la strada per farsi indicizzare male.')
  : bene('nessuna pagina indicizzabile e fuori dalla sitemap');

// ── 9 · speakable che punta a nodi VERI ────────────────────────────────
// Dichiarare «questa parte va letta ad alta voce» indicando un selettore
// che in pagina non esiste e' una promessa non mantenuta al motore: il
// contrario di cio' per cui il blocco esiste.
const muti = [];
for (const [f] of pubbliche) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  for (const m of s.matchAll(/"cssSelector"\s*:\s*\[([^\]]*)\]/g)) {
    for (const sel of m[1].split(',').map((x) => x.trim().replace(/^"|"$/g, ''))) {
      if (!sel) continue;
      // Un selettore discendente («.hero .sub») si verifica pezzo per
      // pezzo. Limite dichiarato: si controlla che ogni parte ESISTA nel
      // documento, non che stiano davvero una dentro l'altra — per quello
      // servirebbe un browser, e il costo non vale la differenza. Il
      // guasto vero che questa regola deve prendere e' il selettore che
      // nomina qualcosa che in pagina non c'e' affatto.
      const parti = sel.split(/\s+/).filter(Boolean);
      const manca = parti.filter((q) => {
        if (q.startsWith('#')) return !new RegExp(`id="${q.slice(1)}"`).test(s);
        if (q.startsWith('.')) return !new RegExp(`class="[^"]*\\b${q.slice(1)}\\b`).test(s);
        return !new RegExp(`<${q}[\\s>]`).test(s);
      });
      if (manca.length) muti.push(`${f} → ${sel} (manca ${manca.join(', ')})`);
    }
  }
}
muti.length
  ? male(`${muti.length} selettori speakable che non esistono in pagina:` + elenco(muti))
  : bene('ogni speakable punta a un nodo che esiste davvero');

console.log(ko ? `  \x1b[31mLa casa non e ancora in ordine\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mLa casa e in ordine\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
