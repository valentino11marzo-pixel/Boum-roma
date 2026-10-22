// tests/seo/run.mjs
// LA GUARDIA SEO — diciannove regole, tutte nate da un difetto vero trovato
// in produzione, mai da una lista di buone pratiche copiata.
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
// invecchia e il giorno che invecchia la guardia diventa decorativa. Una
// <loc> che finisce in una cartella (/apartments-in) si legge dal suo
// index.html: prima la guardia non la vedeva affatto.
//
// Le regole:
//   0   robots.txt non chiude la porta alla sitemap
//   0b  ogni URL nostro citato da llms.txt e' scaricabile (robots)
//   1   il documento e' un documento (doctype, lingua, charset)
//   1b  nessun foglio di stile con le graffe sbilanciate
//   2   un'entita' sola per pagina (Article/BlogPosting/… contano insieme)
//   2b  un BreadcrumbList solo, e finisce sulla canonical
//   2c  l'#organization e' la societa' vera, mai un #localbusiness
//   3   titolo e descrizione dentro i limiti e unici
//   4   la canonical dice la verita'
//   4b  hreflang solo verso URL canonici della sitemap, mai ?lang=
//   5   l'immagine social esiste
//   6   llms.txt non promette piu' della pagina
//   7   una domanda dichiarata e' testo visibile
//   8   nessuna pagina indicizzabile fuori dalla sitemap (anche apartments-in/)
//   8b  il catalogo dichiara i suoi prezzi
//   9   speakable punta a nodi veri
//   10  link statici: niente dominio nudo, niente /pfs, niente .html, niente
//       /apartments/'+id
//   11  la SearchAction dichiarata e' una ricerca che la pagina esegue
//   12  il creator di un Dataset e' un nodo vero, con un nome
//
// MUTAZIONI (verificate il 15/10/2026 su una copia dell'albero,
// SEO_ROOT=<copia> node tests/seo/run.mjs): per ogni regola nuova o
// estesa si e' rimesso UN difetto e la regola e' diventata rossa —
// 0b `Disallow: /api/` senza l'Allow di /api/meteo; 2 l'`Article` scritto a
// mano rimesso accanto al BlogPosting di blog-47-steps (identita' diverse
// solo per il frammento #article); 2b un secondo BreadcrumbList e l'ultimo
// gradino su un altro URL; 2c legalName «BOOM Rome», un nodo #localbusiness,
// «Via del Corso» nel generatore; 4b un alternate verso /owners?lang=en;
// 8 una zona di apartments-in/ tolta dalla sitemap; 10 un href
// https://boomrome.com/…, un href /pfs, un href /faq.html e un
// '/apartments/'+id in uno script; 11 la lettura di ?q= tolta da
// apartments.html; 12 il creator del Dataset di /meteo puntato a un @id che
// in pagina non c'e'. Ognuna cade da sola; tolta la mutazione, torna verde.

import fs from 'node:fs';
import path from 'node:path';

// SEO_ROOT: solo per le prove di mutazione su una copia dell'albero.
const R = process.env.SEO_ROOT ? path.resolve(process.env.SEO_ROOT)
  : path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
// tests/run-all.mjs stampa solo le righe col ✗: il primo caso dell'elenco
// sale sulla stessa riga, cosi' un rosso in CI dice gia' DOVE.
const male = (t) => {
  ko++;
  const [capo, ...resto] = String(t).split('\n');
  const primo = resto.map((l) => l.trim()).find(Boolean);
  console.log('  \x1b[31m✗\x1b[0m ' + capo.replace(/:$/, '') + (primo ? ' — es. ' + primo : '')
    + (resto.length ? '\n' + resto.join('\n') : ''));
};
const elenco = (righe, max = 12) => '\n      ' + righe.slice(0, max).join('\n      ')
  + (righe.length > max ? `\n      … e altre ${righe.length - max}` : '');

const sitemap = fs.readFileSync(path.join(R, 'sitemap.xml'), 'utf8');
const loc = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const pubbliche = [];
const fileDi = new Map();                 // <loc> senza barra finale → file
const senzaBarra = (u) => String(u || '').replace(/\/$/, '');
for (const u of loc) {
  const rel = u.replace(/^https?:\/\/[^/]+\/?/, '').replace(/\/$/, '');
  let f = rel === '' ? 'index.html' : (rel.endsWith('.html') ? rel : rel + '.html');
  // /apartments-in e' una cartella: la pagina e' apartments-in/index.html.
  if (!fs.existsSync(path.join(R, f)) && rel) f = rel + '/index.html';
  if (fs.existsSync(path.join(R, f))) { pubbliche.push([f, u]); fileDi.set(senzaBarra(u), f); }
}
const leggi = (f) => fs.readFileSync(path.join(R, f), 'utf8');

console.log('\n\x1b[1m▸ seo\x1b[0m  la casa e in ordine: '
  + `${pubbliche.length} pagine pubbliche dedotte dalla sitemap`);

const testa = (s) => s.slice(0, Math.max(s.indexOf('</head>'), 4000));
const attr = (s, re) => { const m = s.match(re); return m ? m[1] : ''; };

// JSON-LD: ogni blocco parsato, i nodi di primo livello (array e @graph
// compresi) e la visita di TUTTI i nodi, annidati inclusi.
const LD = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>\s*([\s\S]*?)\s*<\/script>/gi;
const blocchiLd = (s) => {
  const out = [];
  for (const m of s.matchAll(LD)) { try { out.push(JSON.parse(m[1])); } catch { /* lo dice la regola 2 */ } }
  return out;
};
const nodi = (d) => Array.isArray(d) ? d.flatMap(nodi)
  : (d && typeof d === 'object' && Array.isArray(d['@graph'])) ? d['@graph'].flatMap(nodi)
  : (d && typeof d === 'object') ? [d] : [];
const visita = (x, cb) => {
  if (Array.isArray(x)) { for (const y of x) visita(y, cb); return; }
  if (x && typeof x === 'object') { cb(x); for (const v of Object.values(x)) visita(v, cb); }
};
const tipi = (n) => [].concat(n['@type'] || []);
const idDi = (v) => typeof v === 'string' ? v : (v && typeof v === 'object' && (v['@id'] || v.url)) || '';
// Un nodo che DICHIARA (non un semplice riferimento {"@id": …} o
// {"@type": …, "@id": …}): porta almeno una proprieta' oltre a quelle due.
const dichiara = (n) => Object.keys(n).some((k) => k !== '@id' && k !== '@type');
const canonicalDi = (s) => attr(testa(s), /<link rel="canonical" href="([^"]+)"/);

// ── 0 · robots.txt non chiude la porta alla sitemap ─────────────────────
// `Disallow: /s` sembrava proteggere soltanto la vecchia rotta `/s`, ma il
// Robots Exclusion Protocol confronta prefissi: bloccava anche
// `/sitemap.xml`, `/services` e `/skyline`. Search Console lo mostrava come
// «Impossibile leggere la Sitemap» pur con XML valido e risposta HTTP 200.
const robots = fs.readFileSync(path.join(R, 'robots.txt'), 'utf8');
const gruppoGenerico = robots.match(/^User-agent:[ \t]*\*[ \t]*\r?\n([\s\S]*?)(?=^User-agent:|(?![\s\S]))/mi)?.[1] || '';
const regoleRobots = [...gruppoGenerico.matchAll(/^(Allow|Disallow):\s*(\S+)\s*$/gmi)]
  .map(([, tipo, modello]) => {
    const finale = modello.endsWith('$');
    const corpo = finale ? modello.slice(0, -1) : modello;
    return {
      allow: tipo.toLowerCase() === 'allow',
      modello,
      peso: corpo.replace(/\*/g, '').length,
      re: new RegExp('^' + corpo.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (finale ? '$' : '')),
    };
  });
const robotsConsente = (percorso) => {
  const compatibili = regoleRobots.filter((r) => r.re.test(percorso));
  if (!compatibili.length) return true;
  compatibili.sort((a, b) => b.peso - a.peso || Number(b.allow) - Number(a.allow));
  return compatibili[0].allow;
};
const daScansionare = ['/sitemap.xml', ...loc.map((u) => {
  const x = new URL(u);
  return x.pathname + x.search;
})];
const bloccateDaRobots = [...new Set(daScansionare)].filter((p) => !robotsConsente(p));
bloccateDaRobots.length
  ? male(`robots.txt blocca la sitemap o URL che essa dichiara:` + elenco(bloccateDaRobots)
      + '\n      Una regola corta vale come prefisso: /s blocca anche /sitemap.xml, /services e /skyline.')
  : bene('robots.txt consente la sitemap e ogni URL che essa dichiara');

// ── 0b · cio' che llms.txt indica, un motore lo puo' scaricare ─────────
// robots.txt bloccava /api/meteo, cioe' proprio la fonte dati che llms.txt
// e il Dataset di /meteo indicano come «raw source»: il file che parla ai
// motori di risposta li mandava verso una porta chiusa. Ogni URL nostro
// citato in llms.txt (punteggiatura finale tolta: «…/api/meteo.») deve
// passare il robots, e /api/meteo lo deve passare in ogni caso.
const llmsTesto = fs.existsSync(path.join(R, 'llms.txt')) ? leggi('llms.txt') : '';
const citatiLlms = [...llmsTesto.matchAll(/https:\/\/www\.boomrome\.com[^\s)\]>"'`<]*/g)]
  .map((m) => m[0].replace(/[.,;:!?*_]+$/, ''));
const portaChiusa = [];
for (const u of new Set([...citatiLlms, 'https://www.boomrome.com/api/meteo'])) {
  let p;
  try { const x = new URL(u); p = (x.pathname || '/') + x.search; } catch { portaChiusa.push(`${u} (URL illeggibile)`); continue; }
  if (!robotsConsente(p)) portaChiusa.push(p);
}
portaChiusa.length
  ? male(`llms.txt indica URL che robots.txt blocca:` + elenco(portaChiusa)
      + '\n      Un motore che segue llms.txt trova la porta chiusa: Allow esplicito, piu lungo del Disallow.')
  : bene(`ogni URL citato da llms.txt (${citatiLlms.length}) e /api/meteo passano robots.txt`);

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

// ── 1b · un foglio di stile con le graffe sbilanciate ───────────────────
// LA LEZIONE DEL 28 AGOSTO 2026, e l'ho pagata io. Aggiungendo un
// `min-height` a `.board` ho spezzato la regola e lasciato un `@media`
// APERTO: da quel punto in poi TUTTO il resto del foglio della home e'
// finito dentro `(min-width:640px)`, cioe' spento sul telefono. Effetto
// misurato: una griglia da sei voci passava da 362px a 2503px e la home
// da 14,5 a 18,2 schermate — con la pagina che sembrava solo «un po'
// lunga», non rotta. Il browser non protesta, nessun test di layout se
// ne accorge, e la cosa e' andata in produzione.
// Costa un conteggio di parentesi. Da oggi si conta.
const sbilanciati = [];
for (const [f] of pubbliche) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  let i = 0;
  for (const m of s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    i++;
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
    const apre = (css.match(/\{/g) || []).length;
    const chiude = (css.match(/\}/g) || []).length;
    if (apre !== chiude) {
      sbilanciati.push(`${f} → blocco <style> n.${i}: ${apre} graffe aperte, ${chiude} chiuse`);
    }
  }
}
sbilanciati.length
  ? male(`${sbilanciati.length} fogli di stile con le graffe sbilanciate — da li in `
      + 'poi le regole finiscono dentro il blocco sbagliato e spariscono in '
      + 'silenzio:' + elenco(sbilanciati))
  : bene('ogni foglio di stile ha le graffe bilanciate');

// ── 2 · un'entita' sola per pagina ──────────────────────────────────────
// Un secondo nodo Organization o Service sulla stessa pagina non e' "piu'
// SEO": sono due entita' in concorrenza per la stessa cosa, e chi legge il
// markup deve sceglierne una.
// Il doppione e' due entita' con lo STESSO tipo e la STESSA identita'
// (url o @id). Piu' Service sulla stessa pagina non sono un difetto se
// descrivono offerte diverse: /reunion ne dichiara tre — proprietario,
// inquilino, acquirente — con url distinti, ed e' una scelta voluta. Una
// regola che li contasse come errore avrebbe insegnato a ignorarla.
// Gli ARTICOLI contano insieme: Article, BlogPosting, NewsArticle e
// TechArticle sono la stessa entita' per chi legge (le guide portavano un
// `Article` scritto a mano accanto al `BlogPosting` generato: due articoli,
// due editori, due date). Per un articolo l'identita' e' la PAGINA di cui e'
// l'entita' principale: il frammento (#article) non distingue due articoli
// sulla stessa pagina, quindi lo si toglie.
const ARTICOLI = new Set(['Article', 'BlogPosting', 'NewsArticle', 'TechArticle']);
const UNICI = new Set(['Organization', 'RealEstateAgent', 'LocalBusiness',
  'WebSite', 'BreadcrumbList', 'FAQPage', 'Service', 'Product', 'WebPage',
  'Article', 'Blog', 'Dataset']);
const doppi = [], rotti = [];
for (const [f, url] of pubbliche) {
  const s = leggi(f);
  const conta = {};
  for (const m of s.matchAll(LD)) {
    let d;
    try { d = JSON.parse(m[1]); } catch { rotti.push(f); continue; }
    for (const n of nodi(d)) {
      for (const t of new Set(tipi(n).map((x) => (ARTICOLI.has(x) ? 'Article' : x)))) {
        if (!UNICI.has(t)) continue;
        const ident = t === 'Article'
          ? senzaBarra(String(n['@id'] || n.url || idDi(n.mainEntityOfPage) || url).split('#')[0])
          : (n['@id'] || n.url || url);
        const chiave = t + '@' + ident;
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
  : bene('nessuna pagina dichiara due volte la stessa entita (articoli contati insieme)');

// ── 2b · un BreadcrumbList solo, e finisce dove la pagina dice di essere ─
// Le schede /listing ne portavano due, e le guide di quartiere chiudevano
// il percorso su un URL diverso dalla canonical: un motore che mostra il
// percorso nel risultato mostrava un indirizzo che la pagina non rivendica.
const briciole = [];
for (const [f] of pubbliche) {
  const s = leggi(f);
  const liste = [];
  for (const d of blocchiLd(s)) visita(d, (n) => { if (tipi(n).includes('BreadcrumbList')) liste.push(n); });
  if (liste.length > 1) briciole.push(`${f} → ${liste.length} BreadcrumbList`);
  const c = senzaBarra(canonicalDi(s));
  for (const b of liste) {
    const voci = [].concat(b.itemListElement || []);
    const ultima = voci[voci.length - 1];
    const dove = ultima ? idDi(ultima.item) : '';
    if (dove && senzaBarra(dove) !== c) briciole.push(`${f} → l'ultimo gradino e ${dove}, la canonical ${c || '(assente)'}`);
  }
}
briciole.length
  ? male(`${briciole.length} percorsi (BreadcrumbList) doppi o che finiscono altrove:` + elenco(briciole))
  : bene('al piu un BreadcrumbList per pagina, e l\'ultimo gradino e la canonical');

// ── 2c · l'organizzazione e' la societa' vera ──────────────────────────
// Il generatore (scripts/seo-update.js) e alcune pagine dichiaravano la
// ragione sociale «BOOM Rome», un telefono inventato (+39 333 123 4567),
// una sede in «Via del Corso» e un secondo nodo #localbusiness col
// centroide generico di Roma come «sede». Il nodo #organization e' UNO:
// Egidi Immobiliare S.r.l., P.IVA IT17322991005, Via dei Coronari 181/184.
const ORG_ID = /^https?:\/\/(?:www\.)?boomrome\.com\/?#organization$/;
const identita = [];
for (const [f] of pubbliche) {
  for (const d of blocchiLd(leggi(f))) {
    visita(d, (n) => {
      const id = String(n['@id'] || '');
      if (/#localbusiness$/i.test(id)) identita.push(`${f} → nodo ${id}`);
      if (!ORG_ID.test(id) || !dichiara(n)) return;
      if (n.legalName !== 'Egidi Immobiliare S.r.l.') identita.push(`${f} → legalName ${JSON.stringify(n.legalName)}`);
      if (n.vatID != null && n.vatID !== 'IT17322991005') identita.push(`${f} → vatID ${JSON.stringify(n.vatID)}`);
      const via = n.address && typeof n.address === 'object' ? n.address.streetAddress : undefined;
      if (via != null && via !== 'Via dei Coronari 181/184') identita.push(`${f} → streetAddress ${JSON.stringify(via)}`);
    });
  }
}
{
  const gen = fs.existsSync(path.join(R, 'scripts/seo-update.js')) ? leggi('scripts/seo-update.js') : '';
  for (const finto of ["legalName: 'BOOM Rome'", '+39 333 123 4567', 'Via del Corso']) {
    if (gen.includes(finto)) identita.push(`scripts/seo-update.js → ${finto} (un giro del generatore lo rimette su ogni pagina)`);
  }
}
identita.length
  ? male(`${identita.length} dichiarazioni dell'organizzazione non sono la societa vera:` + elenco(identita))
  : bene('ogni #organization e Egidi Immobiliare S.r.l. (P.IVA e sede vere), nessun #localbusiness');

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

// ── 4b · hreflang solo verso URL canonici ───────────────────────────────
// /owners dichiarava un alternate inglese verso /owners?lang=en (e la
// sitemap lo ripeteva per /reunion e /executive): ma ?lang= e' lo STESSO
// file, che si canonicalizza sull'URL nudo. Un hreflang verso un URL che
// dichiara un'altra canonical e' un segnale contraddittorio, e Google lo
// scarta insieme agli altri della pagina. Un alternate vale solo se e' una
// <loc> della sitemap e quella pagina lo dichiara come propria canonical.
const lingue = [];
const hrefDi = (tag) => attr(tag, /\bhref\s*=\s*["']([^"']+)["']/i);
for (const [f] of pubbliche) {
  for (const m of testa(leggi(f)).matchAll(/<link\b[^>]*\bhreflang\s*=[^>]*>/gi)) lingue.push([f, hrefDi(m[0])]);
}
for (const m of sitemap.matchAll(/<xhtml:link\b[^>]*\bhreflang\s*=[^>]*>/gi)) lingue.push(['sitemap.xml', hrefDi(m[0])]);
const lingueStorte = [];
for (const [f, h] of lingue) {
  if (!h) { lingueStorte.push(`${f} → hreflang senza href`); continue; }
  if (h.includes('?lang=')) { lingueStorte.push(`${f} → ${h} (?lang= e lo stesso file, canonicalizzato altrove)`); continue; }
  const dest = fileDi.get(senzaBarra(h));
  if (!dest) { lingueStorte.push(`${f} → ${h} non e una <loc> della sitemap`); continue; }
  const c = canonicalDi(leggi(dest));
  if (senzaBarra(c) !== senzaBarra(h)) lingueStorte.push(`${f} → ${h}, ma ${dest} dichiara canonical ${c || '(assente)'}`);
}
lingueStorte.length
  ? male(`${lingueStorte.length} hreflang verso URL che non sono canonici:` + elenco(lingueStorte))
  : bene(`ogni hreflang (${lingue.length}) punta a una <loc> che si dichiara canonica, nessun ?lang=`);

// ── 5 · l'immagine social esiste davvero ────────────────────────────────
const ogMorte = [];
for (const [f] of pubbliche) {
  const h = testa(fs.readFileSync(path.join(R, f), 'utf8'));
  const img = attr(h, /<meta property="og:image" content="([^"]+)"/);
  if (!img) { ogMorte.push(`${f} → nessuna og:image`); continue; }
  const rel = img.replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
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
// Le guide di quartiere vivono in apartments-in/: la regola guardava solo
// la radice, e /apartments-in/ponte-milvio era pubblicata e indicizzabile
// senza essere nella sitemap.
const inSitemap = new Set(pubbliche.map(([f]) => f));
const orfane = [];
const candidati = [...fs.readdirSync(R),
  ...(fs.existsSync(path.join(R, 'apartments-in'))
    ? fs.readdirSync(path.join(R, 'apartments-in')).map((x) => 'apartments-in/' + x) : [])];
for (const f of candidati) {
  if (!f.endsWith('.html') || path.basename(f).startsWith('preview-')) continue;
  if (inSitemap.has(f)) continue;
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  if (/noindex/i.test(s.slice(0, 4000))) continue;            // scelta esplicita
  const c = (s.slice(0, 4000).match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  if (!c) continue;                                           // non e' una pagina pubblica
  // Una copia storica che canonicalizza alla versione VIVA e' gestita
  // bene, non orfana: le -classic e -legacy puntano tutte all'originale.
  // Orfana e' solo chi dichiara se' stesso e non e' nella sitemap.
  const mia = 'https://www.boomrome.com/' + f.replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  if (c.replace(/\/$/, '') !== mia.replace(/\/$/, '')) continue;
  orfane.push(f);
}
orfane.length
  ? male(`${orfane.length} pagine indicizzabili fuori dalla sitemap:` + elenco(orfane)
      + '\n      O entrano in sitemap.xml, o dichiarano noindex. Restare a meta e la strada per farsi indicizzare male.')
  : bene('nessuna pagina indicizzabile e fuori dalla sitemap');

// ── 8b · il catalogo dichiara i suoi prezzi ────────────────────────────
// Su /apartments il canone e' un tabellone a palette: bellissimo, e
// leggibile da un umano, ma nel livello di TESTO la pagina esponeva cinque
// prezzi in tutto — le cifre stanno dentro le palette. C'e' l'aria-label
// (i lettori di schermo sono a posto) ma i dati strutturati contenevano
// `CollectionPage` e basta: zero Offer. Le SCHEDE singole i prezzi li
// dichiarano da sempre; la vetrina — la pagina che un motore mostra per
// «apartments for rent in Rome» — no. L'ItemList si genera dalle card con
// scripts/catalogo-schema.mjs; questa regola impedisce che invecchi.
{
  const f = 'apartments.html';
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const carte = (s.match(/<a class="casa-p"/g) || []).length;
  let lista = null;
  for (const m of s.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)) {
    try { const d = JSON.parse(m[1]); if (d['@type'] === 'ItemList') lista = d; } catch { /* niente */ }
  }
  const guai = [];
  if (!lista) guai.push('nessun ItemList: i prezzi del catalogo non sono un dato');
  else {
    if (lista.itemListElement.length !== carte)
      guai.push(`ItemList con ${lista.itemListElement.length} voci ma ${carte} case in pagina `
        + '— rilancia scripts/catalogo-schema.mjs');
    const senzaPrezzo = lista.itemListElement.filter((v) => !(v.item && v.item.offers && v.item.offers.price));
    if (senzaPrezzo.length) guai.push(`${senzaPrezzo.length} voci senza prezzo`);
    // nessuna disponibilita' promessa a un motore se la card non la dichiara
    const bugie = lista.itemListElement.filter((v) => {
      const a = v.item && v.item.offers && v.item.offers.availability;
      return a && !/InStock|PreOrder/.test(a);
    });
    if (bugie.length) guai.push(`${bugie.length} voci con una disponibilita non prevista`);
  }
  guai.length ? male('il catalogo non dichiara i suoi prezzi:' + elenco(guai))
              : bene(`il catalogo dichiara ${carte} case con prezzo nei dati strutturati`);
}

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

// ── 10 · i link statici portano dove dicono, al primo colpo ────────────
// Quattro difetti dello stesso giro (ottobre 2026), tutti in href scritti
// a mano: link al dominio NUDO (https://boomrome.com/…, un redirect in
// piu' e un'entita' ambigua per chi indicizza), /pfs che rispondeva 404,
// link interni con «.html» (con cleanUrls ogni clic e' un 308 in piu'), e le
// guide di quartiere che costruivano '/apartments/'+id — una rotta che non
// esiste. Si guardano gli href fuori dagli script (e fuori dai commenti);
// la concatenazione /apartments/'+ si cerca nell'intera sorgente.
const linkStorti = [];
for (const [f] of pubbliche) {
  const sorgente = leggi(f);
  const statico = sorgente.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  for (const m of statico.matchAll(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const h = (m[1] != null ? m[1] : m[2]).trim();
    if (/^https?:\/\/boomrome\.com(?=[/?#:]|$)/i.test(h)) linkStorti.push(`${f} → ${h} (dominio nudo: si scrive https://www.boomrome.com)`);
    else if (/^\/pfs\/?(?:[?#]|$)/.test(h)) linkStorti.push(`${f} → ${h} (rotta morta: /property-finding)`);
    else if (/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\.html(?:[?#]|$)/.test(h)) linkStorti.push(`${f} → ${h} (con cleanUrls e un 308 in piu: senza .html)`);
  }
  if (sorgente.includes("/apartments/'+")) linkStorti.push(`${f} → '/apartments/'+… (rotta inesistente: /listing/<id>)`);
}
linkStorti.length
  ? male(`${linkStorti.length} link che non arrivano al primo colpo:` + elenco(linkStorti))
  : bene('nessun link al dominio nudo, a /pfs, a un .html interno o a /apartments/<id>');

// ── 11 · la ricerca dichiarata e' una ricerca vera ─────────────────────
// Ogni pagina dichiara al motore una SearchAction verso /apartments?q=…
// (il «sitelinks search box»): se /apartments non legge ?q= all'apertura,
// il motore promette una ricerca che atterra sul catalogo intero.
{
  const gen = fs.existsSync(path.join(R, 'scripts/seo-update.js')) ? leggi('scripts/seo-update.js') : '';
  const emessa = /SearchAction[\s\S]{0,600}?\/apartments\?q=/.test(gen)
    || pubbliche.some(([f]) => /SearchAction[\s\S]{0,600}?\/apartments\?q=/.test(leggi(f)));
  const legge = leggi('apartments.html').includes("URLSearchParams(location.search).get('q')");
  !emessa ? bene('nessuna SearchAction verso /apartments?q= dichiarata')
    : legge ? bene('la SearchAction verso /apartments?q= e servita: apartments.html legge ?q= all\'apertura')
    : male('una SearchAction promette /apartments?q=… ma apartments.html non legge ?q= '
        + "(URLSearchParams(location.search).get('q')): la ricerca atterra sul catalogo intero");
}

// ── 12 · chi ha fatto i dati e' un nodo vero ───────────────────────────
// Il Dataset di /meteo e' la risposta citabile per «quanto costa al m² a
// Roma». Un creator che punta a un @id che in pagina non esiste, o a un
// nodo senza nome, lascia il dato senza autore: un motore non sa a chi
// attribuirlo.
const orfaniDati = [];
for (const [f] of pubbliche) {
  const dich = new Map();
  const dataset = [];
  for (const d of blocchiLd(leggi(f))) {
    visita(d, (n) => {
      if (n['@id'] && dichiara(n) && !dich.has(n['@id'])) dich.set(n['@id'], n);
      if (tipi(n).includes('Dataset')) dataset.push(n);
    });
  }
  for (const ds of dataset) {
    const chi = [].concat(ds.creator || []);
    if (!chi.length) { orfaniDati.push(`${f} → Dataset senza creator`); continue; }
    for (const c of chi) {
      if (c && typeof c === 'object' && typeof c.name === 'string' && c.name.trim()) continue;
      const id = idDi(c);
      const nodo = id && dich.get(id);
      if (!(nodo && typeof nodo.name === 'string' && nodo.name.trim()))
        orfaniDati.push(`${f} → creator ${id || JSON.stringify(c)} non e un nodo in pagina con un nome`);
    }
  }
}
orfaniDati.length
  ? male(`${orfaniDati.length} Dataset senza un autore vero:` + elenco(orfaniDati))
  : bene('ogni Dataset ha un creator che e un nodo in pagina con un nome');

console.log(ko ? `  \x1b[31mLa casa non e ancora in ordine\x1b[0m — ${ok} passed, ${ko} failed`
                : `  \x1b[32mLa casa e in ordine\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
