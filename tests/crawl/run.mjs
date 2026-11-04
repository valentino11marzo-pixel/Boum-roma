// tests/crawl/run.mjs — LA PORTA DEI CRAWLER (suite `crawl`).
//
// Quattro file decidono che cosa un motore di ricerca o un motore di
// risposta vede del sito, e nessuno li confrontava fra loro:
//
//   robots.txt   bloccava /api/meteo, cioè la fonte dati che /meteo carica e
//                che llms.txt e il Dataset JSON-LD indicano come «raw source»:
//                il renderer di Google e i fetcher delle AI non potevano
//                leggerla. Bloccava anche /login, /pre-arrival, /thank-you…
//                pagine noindex linkate da pagine pubbliche: Google legge un
//                noindex SOLO su una pagina che può scaricare, quindi il
//                blocco le teneva «indicizzate senza contenuto». E i gruppi
//                AhrefsBot/SemrushBot/MJ12bot portavano solo Crawl-delay:
//                per RFC 9309 un crawler obbedisce SOLO al gruppo che lo
//                nomina, quindi quei tre perdevano ogni Disallow.
//   sitemap.xml  dichiarava sette /listing/* scritti a mano (uno affittato),
//                il template /apartment-detail, lo strumento interno /deals e
//                hreflang verso URL ?lang= che si canonicalizzano altrove;
//                mancava /apartments-in/ponte-milvio; i lastmod erano fermi.
//   vercel.json  /pfs e /apartments/<id> rispondevano 404; gli alias di
//                /reunion e /executive erano 307 (temporanei). Poi
//                /apartments/<id> prendeva anche /apartments/trastevere e lo
//                mandava alla scheda 404 «no longer listed»: i quartieri con
//                la loro pagina vanno a /apartments-in/<zona>.
//   gemelli      il file legacy `owner-dashboard` (senza estensione) si
//                contendeva /owner-dashboard con owner-dashboard.html.
//   .vercelignore  sorgenti, studi e copie storiche venivano SERVITI: le
//                pagine in scripts/legacy promettevano «Guaranteed rent» e
//                «24/7» con un 200 indicizzabile. E /.github/workflows/ci.yml
//                e /storage.rules rispondevano 200; i .md (CLAUDE.md porta
//                dati di persone reali) li scartava solo un default di Vercel
//                mai scritto da nessuna parte.
//   indice git   Vercel deploya solo ciò che è nel commit: due moduli
//                importati dalle porte dei lead e da /listing/<id> esistevano
//                solo sul disco (§5).
//
// Questa suite tiene i quattro allineati. Il parser robots è lo stesso della
// regola 0 di tests/seo (longest match, Allow vince a parità di peso, `$`
// ancora la fine): due interpretazioni diverse dello stesso file sarebbero
// due verità.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const R = path.resolve(new URL('../..', import.meta.url).pathname);
let ok = 0, ko = 0;
const bene = (t) => { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); };
const male = (t) => { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const check = (cond, t, dettaglio = '') => (cond ? bene(t) : male(t + (dettaglio ? '\n      ' + dettaglio : '')));
const elenco = (righe, max = 12) => '\n      ' + righe.slice(0, max).join('\n      ')
  + (righe.length > max ? `\n      … e altre ${righe.length - max}` : '');
const leggi = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const esiste = (rel) => { try { return fs.statSync(path.join(R, rel)).isFile(); } catch { return false; } };

console.log('\n\x1b[1m▸ crawl\x1b[0m  robots, sitemap, redirect e deploy dicono la stessa cosa');

// ════════════════════════════════════════════════════════════════════════
// 1 · robots.txt
// ════════════════════════════════════════════════════════════════════════
const robots = leggi('robots.txt');

// I gruppi secondo RFC 9309 §2.1: righe User-agent consecutive aprono UN
// gruppo, le regole che seguono gli appartengono fino al prossimo
// User-agent che viene DOPO una regola. Le righe vuote e i commenti non
// chiudono niente.
function gruppi(testo) {
  const out = [];
  let cur = null, inRegole = false;
  for (const raw of testo.split(/\r?\n/)) {
    const riga = raw.replace(/#.*$/, '').trim();
    if (!riga) continue;
    const m = riga.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const campo = m[1].toLowerCase(), valore = m[2].trim();
    if (campo === 'user-agent') {
      if (!cur || inRegole) { cur = { agenti: [], regole: [], altro: [] }; out.push(cur); inRegole = false; }
      cur.agenti.push(valore.toLowerCase());
    } else if (campo === 'allow' || campo === 'disallow') {
      if (!cur) continue;
      inRegole = true;
      cur.regole.push(`${campo === 'allow' ? 'Allow' : 'Disallow'}: ${valore}`);
    } else if (cur && campo !== 'sitemap') {
      inRegole = true;
      cur.altro.push(`${campo}: ${valore}`);
    }
  }
  return out;
}
const tutti = gruppi(robots);
const generico = tutti.find((g) => g.agenti.includes('*'));
check(!!generico, 'robots.txt ha il gruppo «User-agent: *»');

// Lo stesso motore della regola 0 di tests/seo.
const compila = (righe) => righe.map((r) => {
  const i = r.indexOf(':');
  const tipo = r.slice(0, i), modello = r.slice(i + 1).trim();
  const finale = modello.endsWith('$');
  const corpo = finale ? modello.slice(0, -1) : modello;
  return {
    allow: tipo === 'Allow',
    modello,
    peso: corpo.replace(/\*/g, '').length,
    re: new RegExp('^' + corpo.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (finale ? '$' : '')),
  };
}).filter((r) => r.modello !== '');
const regoleGeneriche = compila(generico ? generico.regole : []);
const decide = (regole, percorso) => {
  const compatibili = regole.filter((r) => r.re.test(percorso));
  if (!compatibili.length) return { allow: true, regola: null };
  compatibili.sort((a, b) => b.peso - a.peso || Number(b.allow) - Number(a.allow));
  return { allow: compatibili[0].allow, regola: compatibili[0].modello };
};
const consente = (p) => decide(regoleGeneriche, p).allow;

check(consente('/api/meteo'), '/api/meteo è leggibile (la fonte che /meteo carica e llms.txt cita)',
  `bloccata da ${decide(regoleGeneriche, '/api/meteo').regola}`);
check(consente('/api/meteo?zone=prati'), '…anche con i parametri');
for (const p of ['/api/listings', '/api/listing', '/api/owner-lead', '/portal', '/portal.html', '/admin', '/admin.html']) {
  check(!consente(p), `${p} resta fuori dalla scansione`);
}
// `Allow: /api/meteo` vale come PREFISSO (senza `$`, così passano anche i
// parametri): è sicuro finché nessun'altra funzione nasce con quel nome.
const omonime = fs.readdirSync(path.join(R, 'api')).filter((f) => /^meteo/i.test(f) && f !== 'meteo.js');
check(!omonime.length, 'l\'eccezione apre soltanto /api/meteo: nessun\'altra funzione in api/ comincia con «meteo»',
  `${omonime.join(', ')} — Allow: /api/meteo le renderebbe scansionabili`);
check(consente('/sitemap.xml') && consente('/listings-sitemap.xml'), 'le due sitemap sono leggibili');
check(/^Sitemap:\s*https:\/\/www\.boomrome\.com\/sitemap\.xml\s*$/m.test(robots)
   && /^Sitemap:\s*https:\/\/www\.boomrome\.com\/listings-sitemap\.xml\s*$/m.test(robots),
  'robots.txt dichiara entrambe le sitemap');

// Le pagine noindex linkate da pagine pubbliche NON si bloccano: Google
// legge il noindex solo su ciò che può scaricare. Ma lasciarle aperte è
// sicuro SOLO se il noindex c'è davvero, nella pagina e nell'header.
const vercel = JSON.parse(leggi('vercel.json'));
const headerNoindex = (vercel.headers || []).filter((h) => (h.headers || []).some((x) =>
  /^x-robots-tag$/i.test(x.key) && /noindex/i.test(x.value)));
// La sintassi di Vercel (path-to-regexp): `:nome` = un segmento, `:nome*` = il
// resto, `:nome(a|b)` = un segmento fra quelli elencati. I parametri diventano
// gruppi CON NOME, così la destinazione si ricompone (`/listing/:id`). Prima
// `:nome(a|b)` diventava `([^/]+)(a|b)`: una regola che qui non combaciava mai.
const sorgenteRe = (src) => new RegExp('^' + src
  .replace(/:([A-Za-z_]\w*)\(((?:[^()]|\([^()]*\))*)\)/g, '(?<$1>$2)')
  .replace(/:([A-Za-z_]\w*)\*/g, '(?<$1>.*)')
  .replace(/:([A-Za-z_]\w*)/g, '(?<$1>[^/]+)') + '$');
const haHeaderNoindex = (p) => headerNoindex.some((h) => sorgenteRe(h.source).test(p));
const APERTE_NOINDEX = ['login', 'client-portal', 'owner-dashboard', 'onboarding', 'pre-arrival', 'precheck',
  'thank-you', 'proppass', 'pass-delivery', 'form-tenant', 'form-landlord'];
const testaDi = (s) => s.slice(0, Math.max(s.indexOf('</head>'), 4000));
const noindexMeta = (s) => /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(testaDi(s))
  || /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(testaDi(s));
const malAperte = [];
for (const p of APERTE_NOINDEX) {
  const perche = [];
  if (!consente('/' + p)) perche.push(`robots la blocca (${decide(regoleGeneriche, '/' + p).regola})`);
  if (!consente('/' + p + '.html')) perche.push('robots blocca il .html');
  if (!esiste(p + '.html')) perche.push('file assente');
  else if (!noindexMeta(leggi(p + '.html'))) perche.push('manca il meta noindex');
  if (!haHeaderNoindex('/' + p) || !haHeaderNoindex('/' + p + '.html')) perche.push('manca X-Robots-Tag noindex in vercel.json');
  if (perche.length) malAperte.push(`/${p} — ${perche.join('; ')}`);
}
check(!malAperte.length, `le ${APERTE_NOINDEX.length} pagine noindex linkate sono scaricabili E dichiarano noindex (meta + header)`,
  malAperte.length ? elenco(malAperte).trim() : '');

// RFC 9309: un crawler obbedisce SOLO al gruppo che lo nomina. Ogni gruppo
// nominato deve quindi ripetere, nello stesso ordine, tutte le regole di *.
const nominati = tutti.filter((g) => !g.agenti.includes('*'));
const attesi = ['ahrefsbot', 'semrushbot', 'mj12bot'];
const gruppoSeo = nominati.find((g) => attesi.every((a) => g.agenti.includes(a)));
check(!!gruppoSeo, 'AhrefsBot, SemrushBot e MJ12bot stanno in UN gruppo',
  `gruppi nominati: ${nominati.map((g) => g.agenti.join('+')).join(' | ') || 'nessuno'}`);
if (gruppoSeo) {
  check(gruppoSeo.altro.some((x) => /^crawl-delay:\s*10$/i.test(x)), '…rallentato con Crawl-delay: 10');
}
const divergenti = nominati.filter((g) => JSON.stringify(g.regole) !== JSON.stringify(generico ? generico.regole : []));
check(!divergenti.length, 'ogni gruppo nominato ripete esattamente le Allow/Disallow di «*», nello stesso ordine',
  divergenti.map((g) => {
    const a = new Set(g.regole), b = new Set(generico ? generico.regole : []);
    const manca = [...b].filter((x) => !a.has(x)), extra = [...a].filter((x) => !b.has(x));
    return `${g.agenti.join('+')}: manca ${manca.join(', ') || '—'}; in più ${extra.join(', ') || '—'}`
      + (!manca.length && !extra.length ? ' (ordine diverso)' : '');
  }).join('\n      '));
const AI_BOT = /gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|claude-searchbot|anthropic|perplexitybot|perplexity-user|google-extended|ccbot|bytespider|applebot-extended|meta-externalagent|amazonbot|cohere/i;
const aiNominati = nominati.filter((g) => g.agenti.some((a) => AI_BOT.test(a)));
check(!aiNominati.length, 'nessun crawler AI ha un gruppo suo: seguono «*» (perderebbero ogni Disallow)',
  aiNominati.map((g) => g.agenti.join('+')).join(', '));
check(/Includes \/api\/meteo, the public market data feed\./.test(robots), 'il commento AI dice che /api/meteo è incluso');

// ════════════════════════════════════════════════════════════════════════
// 2 · sitemap.xml
// ════════════════════════════════════════════════════════════════════════
const sitemap = leggi('sitemap.xml');
const blocchi = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
const voci = blocchi.map((b) => ({
  loc: (b.match(/<loc>([^<]+)<\/loc>/) || [])[1] || '',
  lastmod: (b.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || '',
}));
check(voci.length > 0 && voci.every((v) => v.loc), `sitemap.xml: ${voci.length} voci, ognuna con la sua <loc>`);
check(new Set(voci.map((v) => v.loc)).size === voci.length, 'nessuna <loc> ripetuta');
check(voci.some((v) => v.loc === 'https://www.boomrome.com/apartments-in/ponte-milvio'),
  '/apartments-in/ponte-milvio è dichiarata');
const vietate = voci.map((v) => v.loc).filter((u) => /\/listing\/|\/apartment-detail(?:$|[/?])|\/deals(?:$|[/?])|\?lang=/.test(u));
check(!vietate.length, 'nessuna /listing/* scritta a mano, né /apartment-detail, /deals o ?lang=', vietate.join(', '));
check(!/\?lang=/.test(sitemap) && !/<xhtml:link/.test(sitemap), 'nessun alternate hreflang verso un ?lang= (stesso file, canonical altrove)');

const fileDi = (loc) => {
  const rel = new URL(loc).pathname.replace(/^\//, '').replace(/\/$/, '');
  const cand = rel === '' ? ['index.html'] : [rel + '.html', rel + '/index.html', rel];
  return cand.find(esiste) || null;
};
const senzaFile = voci.filter((v) => !fileDi(v.loc)).map((v) => v.loc);
check(!senzaFile.length, 'ogni <loc> corrisponde a un file del repo (o all\'index della cartella)', senzaFile.join(', '));

// Una pagina noindex dentro la sitemap è un'istruzione contraddittoria.
const contraddette = voci.filter((v) => {
  const f = fileDi(v.loc);
  return f && noindexMeta(leggi(f));
}).map((v) => v.loc);
check(!contraddette.length, 'nessuna pagina della sitemap dichiara noindex', contraddette.join(', '));
// Lo stesso noindex può arrivare dall'HEADER (vercel.json), invisibile nel file:
// si controlla sia il percorso pulito sia la sua forma .html.
const conHeader = voci.map((v) => new URL(v.loc).pathname)
  .filter((p) => haHeaderNoindex(p) || haHeaderNoindex(p === '/' ? '/index.html' : p.replace(/\/$/, '') + '.html'));
check(!conHeader.length, 'nessuna pagina della sitemap riceve X-Robots-Tag noindex da vercel.json', conHeader.join(', '));

// lastmod: data vera del calendario, mai nel futuro. «Oggi» è il giorno più
// avanzato sulla Terra (UTC+14): una data non è futura se da qualche parte
// è già arrivata — così il test non cade alle 23 di Roma su un runner UTC.
const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date());
const dataVera = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
};
const lastmodMale = voci.filter((v) => !dataVera(v.lastmod) || v.lastmod > oggi)
  .map((v) => `${v.loc} → «${v.lastmod || 'assente'}»`);
check(!lastmodMale.length, `ogni <lastmod> è una data YYYY-MM-DD valida e non oltre oggi (${oggi})`, lastmodMale.join('\n      '));

// La sitemap non dichiara URL che il sito redirige altrove.
const redirect = vercel.redirects || [];
const redirette = voci.filter((v) => {
  const p = new URL(v.loc).pathname;
  return redirect.some((r) => sorgenteRe(r.source).test(p));
}).map((v) => v.loc);
check(!redirette.length, 'nessuna <loc> viene rediretta da vercel.json', redirette.join(', '));

// Nessuna Disallow colpisce un link interno di una pagina della sitemap:
// un link pubblico verso una pagina bloccata è un noindex che Google non
// può leggere («indicizzata, anche se bloccata da robots.txt»).
const colpiti = [];
for (const v of voci) {
  const f = fileDi(v.loc);
  if (!f) continue;
  const s = leggi(f);
  for (const m of s.matchAll(/href\s*=\s*["']((?:https?:\/\/(?:www\.)?boomrome\.com)?\/[^"'\s]*)["']/gi)) {
    let h = m[1].replace(/^https?:\/\/(?:www\.)?boomrome\.com/i, '') || '/';
    if (h.startsWith('//') || h.includes('${')) continue;
    h = h.split('#')[0];
    if (!h || h.includes('?') || h.startsWith('/api/')) continue;
    const d = decide(regoleGeneriche, h);
    if (!d.allow) colpiti.push(`${f} → ${h} (${d.regola})`);
  }
}
check(!colpiti.length, 'nessuna Disallow colpisce un link interno delle pagine della sitemap', elenco([...new Set(colpiti)]).trim());

// ════════════════════════════════════════════════════════════════════════
// 3 · vercel.json
// ════════════════════════════════════════════════════════════════════════
bene('vercel.json si legge (JSON valido)');
const trova = (src) => redirect.find((r) => r.source === src);
const pfs = trova('/pfs');
check(pfs && pfs.destination === '/property-finding' && pfs.permanent === true, '/pfs → /property-finding, permanente');
const apt = trova('/apartments/:id');
check(apt && apt.destination === '/listing/:id' && apt.permanent === true, '/apartments/:id → /listing/:id, permanente');
for (const src of ['/(la-reunion|reunion-island|974)', '/(executive-rentals|executive-stays|relocation-rome)', '/(tr|turkiye|turkey)']) {
  const r = trova(src);
  check(r && r.permanent === true, `alias ${src} → ${r ? r.destination : '?'} è permanente (308)`);
}
// Come Vercel: i redirect si provano IN ORDINE e vince il primo che combacia;
// la destinazione riceve i parametri del sorgente.
const segui = (p) => {
  for (const r of redirect) {
    const m = sorgenteRe(r.source).exec(p);
    if (!m) continue;
    const g = m.groups || {};
    return { r, dest: String(r.destination).replace(/:([A-Za-z_]\w*)\*?/g, (x, n) => (n in g ? g[n] : x)) };
  }
  return null;
};

// I quartieri. /apartments/:id manda a /listing/:id QUALSIASI segmento, anche
// il nome di una zona che una persona o un crawler scrive a mano:
// /apartments/trastevere arrivava alla scheda 404 «This home is no longer
// listed — It may have been rented or withdrawn», falsa per un URL che nomina
// un quartiere con la sua pagina vera (/apartments-in/trastevere). La regola
// dei quartieri sta PRIMA di quella generica (vince la prima).
// L'eccezione è un fatto, non una preferenza: uno slug di zona che è ANCHE
// l'id di una scheda vera resta alla scheda. Le pagine /apartments-in in
// produzione collegavano ogni card a /apartments/<id della scheda> (anche nel
// JSON-LD), e `pigneto` è l'id di «Pigneto Terrace» (listings/pigneto: nella
// fotografia del catalogo, sulla vetrina e nei redirect storici
// /apartment_pigneto.html → /listing/pigneto): /apartments/pigneto è
// l'indirizzo vecchio di quella casa, non del quartiere. Gli id si leggono
// dal repo, mai da un elenco a mano.
const ZONE = fs.readdirSync(path.join(R, 'apartments-in'))
  .filter((f) => /\.html$/.test(f) && f !== 'index.html').map((f) => f.replace(/\.html$/, '')).sort();
const ID_SCHEDE = new Set();
for (const r of redirect) {
  const m = String(r.destination || '').match(/^\/listing\/([A-Za-z0-9_-]+)$/);
  if (m) ID_SCHEDE.add(m[1]);
}
if (esiste('apartments.html')) for (const m of leggi('apartments.html').matchAll(/\/listing\/([A-Za-z0-9_-]+)/g)) ID_SCHEDE.add(m[1]);
if (esiste('design/pages-deco/case-full.json')) {
  try {
    for (const d of JSON.parse(leggi('design/pages-deco/case-full.json'))) {
      const id = d && (d._id || d.id);
      if (typeof id === 'string' && id) ID_SCHEDE.add(id);
    }
  } catch {}
}
const zonaRegola = redirect.find((r) => /^\/apartments\/:[A-Za-z_]\w*\(/.test(r.source));
const iZona = redirect.indexOf(zonaRegola), iApt = redirect.indexOf(apt);
check(!!zonaRegola && zonaRegola.destination === '/apartments-in/:zone' && zonaRegola.permanent === true,
  '/apartments/<quartiere> → /apartments-in/<quartiere>, permanente',
  zonaRegola ? `${zonaRegola.source} → ${zonaRegola.destination} (permanent: ${zonaRegola.permanent})` : 'regola assente');
check(iZona >= 0 && iApt >= 0 && iZona < iApt, '…e sta PRIMA di /apartments/:id (vince la prima che combacia)',
  `posizioni: quartieri ${iZona}, generica ${iApt}`);
const viaTrastevere = segui('/apartments/trastevere');
check(viaTrastevere && viaTrastevere.dest === '/apartments-in/trastevere' && viaTrastevere.r.permanent === true,
  '/apartments/trastevere → /apartments-in/trastevere (non più la scheda 404 «no longer listed»)',
  viaTrastevere ? `arriva a ${viaTrastevere.dest}` : 'nessun redirect');
const zoneMale = [];
for (const z of ZONE) {
  const atteso = ID_SCHEDE.has(z) ? `/listing/${z}` : `/apartments-in/${z}`;
  const s = segui(`/apartments/${z}`);
  if (!s || s.dest !== atteso || s.r.permanent !== true) zoneMale.push(`/apartments/${z} → ${s ? s.dest : 'nessun redirect'} (atteso ${atteso})`);
  const giro = segui(`/apartments-in/${z}`);
  if (giro) zoneMale.push(`/apartments-in/${z} viene a sua volta rediretta a ${giro.dest}`);
}
check(ZONE.length > 0 && !zoneMale.length,
  `ognuna delle ${ZONE.length} pagine /apartments-in ha il suo /apartments/<zona> (le zone che sono anche id di una scheda restano alla scheda: ${ZONE.filter((z) => ID_SCHEDE.has(z)).join(', ') || 'nessuna'})`,
  elenco(zoneMale).trim());
// Ogni nome nella regola ha la sua pagina e non è l'id di una scheda: un
// quartiere senza pagina sarebbe un redirect verso un 404.
const nomiRegola = zonaRegola ? ((zonaRegola.source.match(/\(([^()]*)\)/) || [])[1] || '').split('|').filter(Boolean) : [];
const nomiMale = nomiRegola.filter((z) => !esiste(`apartments-in/${z}.html`) || ID_SCHEDE.has(z))
  .map((z) => `${z}${ID_SCHEDE.has(z) ? ' (è l\'id di una scheda)' : ' (nessuna apartments-in/' + z + '.html)'}`);
check(nomiRegola.length > 0 && !nomiMale.length, `i ${nomiRegola.length} quartieri della regola hanno tutti la loro pagina e nessuno è l'id di una scheda`,
  nomiMale.join(', '));
const viaId = segui('/apartments/OLLVsiKhPrhpT1fx8XmB'), viaPrefisso = segui('/apartments/trastevere-loft');
check(viaId && viaId.dest === '/listing/OLLVsiKhPrhpT1fx8XmB' && viaPrefisso && viaPrefisso.dest === '/listing/trastevere-loft',
  '…mentre un id di scheda (anche se COMINCIA col nome di una zona) va ancora a /listing/<id>',
  `${viaId ? viaId.dest : '—'} · ${viaPrefisso ? viaPrefisso.dest : '—'}`);
check(!segui('/apartments/trastevere/x'), '/apartments/<zona>/<altro> non combacia con nessun redirect (un segmento solo)');

// I tre redirect nuovi non mangiano rotte vere.
const mangiate = ['/pfs-command', '/pfs-command.html', '/apartments', '/apartments.html', '/apartments-in',
  '/apartments-in/prati', '/property-finding']
  .filter((p) => [pfs, apt, zonaRegola].filter(Boolean).some((r) => sorgenteRe(r.source).test(p)));
check(!mangiate.length, 'né /pfs né /apartments/:id né /apartments/<quartiere> coprono /pfs-command, /apartments o /apartments-in', mangiate.join(', '));
check(apt && sorgenteRe(apt.source).test('/apartments/abc123') && !sorgenteRe(apt.source).test('/apartments/a/b'),
  '/apartments/<id> prende un solo segmento');
const gruppoFollow = headerNoindex.find((h) => (h.headers || []).some((x) => /^x-robots-tag$/i.test(x.key) && x.value === 'noindex, follow')
  && /\(dashboard\|/.test(h.source));
check(!!gruppoFollow && /[(|]deals[|)]/.test(gruppoFollow.source),
  'il gruppo «noindex, follow» comprende deals');
check(haHeaderNoindex('/deals') && haHeaderNoindex('/deals.html') && !haHeaderNoindex('/deal-assistance'),
  '…e colpisce /deals e /deals.html, mai /deal-assistance');

// ════════════════════════════════════════════════════════════════════════
// 4 · .vercelignore — sorgenti e copie storiche non si servono
// ════════════════════════════════════════════════════════════════════════
const ignore = leggi('.vercelignore').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const CARTELLE = ['scripts', 'design', 'tests', 'bot', 'homie-bridge', 'reference', 'docs'];
const FILE = ['index-classic.html', 'apartments-classic.html', 'apartment-detail-classic.html',
  'property-finding-classic.html', 'header.html', '.journey-preview.html'];
const mancanti = [...CARTELLE.map((d) => `/${d}/`), ...FILE].filter((x) => !ignore.includes(x));
check(!mancanti.length, `.vercelignore esclude ${CARTELLE.length} cartelle di sorgenti e ${FILE.length} copie storiche`, mancanti.join(', '));

// Semantica gitignore, ridotta a ciò che il file usa: `/x/` cartella
// ancorata, `a/b` ancorato, nome nudo a qualsiasi profondità, `*` dentro un
// segmento.
const regoleIgnore = ignore.map((pat) => {
  const dir = pat.endsWith('/');
  let p = dir ? pat.slice(0, -1) : pat;
  const ancorato = p.startsWith('/') || p.includes('/');
  p = p.replace(/^\//, '');
  const re = p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  return new RegExp((ancorato ? '^' : '(?:^|/)') + re + (dir ? '/' : '$'));
});
const ignorato = (rel) => regoleIgnore.some((re) => re.test(rel));
check(ignorato('scripts/legacy/faq_page.html') && ignorato('design/pages-deco/case-full.json')
   && ignorato('index-classic.html') && ignorato('.journey-preview.html'),
  'le copie storiche verificate il 14/10 (scripts/legacy/…) non vengono deployate');
check(!ignorato('index.html') && !ignorato('apartments-in/index.html') && !ignorato('api/meteo.js')
   && !ignorato('js/boom-portal.js') && !ignorato('apartment-detail.html') && !ignorato('property-finding.html'),
  '…e nessuna pagina o funzione viva è esclusa per sbaglio');

// I documenti interni non si servono. CLAUDE.md porta nomi e indirizzi di
// persone reali (proprietari, inquilini, il referente ASPI); gli audit di
// sicurezza descrivono i punti deboli. Misurato il 15/10/2026: Vercel scarta
// già i .md da solo (/docs/i18n-plan.md e /design-language-study.md → 404,
// nessun .md nel sorgente del deploy) — ma era un default non scritto. E
// /.github/workflows/ci.yml e /storage.rules rispondevano 200. La regola
// guarda TUTTI i .md del repo, non un elenco: il prossimo studio scritto a
// mano è quello che sfuggirebbe.
const INTERNI = ['CLAUDE.md', 'AGENTS.md', 'LOGIN_SECURITY_AUDIT.md', 'MAGIC_SIGN_AUDIT.md', 'PORTAL_AUDIT_2026-08.md',
  'AUDIT_BOOM_2026-08-18.md', 'STUDIO_EXECUTIVE_ROMA.md', 'api/WALLET.md', 'api/agent/README.md', 'bot/HOMIE.md',
  '.github/workflows/ci.yml', 'firestore.rules', 'storage.rules', 'firebase.json', 'firestore.indexes.json'];
const internoServito = INTERNI.filter((f) => !ignorato(f));
check(!internoServito.length, `.vercelignore esclude i documenti e la configurazione interna (${INTERNI.length} campioni, CLAUDE.md compreso)`,
  internoServito.join(', '));
const mdServiti = [];
(function giroMd(dir) {
  for (const e of fs.readdirSync(path.join(R, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.name === '.git' || e.name === 'node_modules') continue;
    if (e.isDirectory()) { giroMd(rel); continue; }
    if (/\.md$/i.test(e.name) && !ignorato(rel)) mdServiti.push(rel);
  }
})('');
check(!mdServiti.length, 'nessun file .md del repo arriva al deploy', elenco(mdServiti).trim());
check(!ignorato('llms.txt') && !ignorato('robots.txt') && !ignorato('sitemap.xml') && !ignorato('vercel.json')
   && !ignorato('site.webmanifest') && !ignorato('api/package.json') && !ignorato('api/_attribution.js')
   && !ignorato('js/listing-facts.js'),
  '…e llms.txt, robots, sitemap, vercel.json, il manifest, api/package.json e i moduli condivisi restano dentro');

// Un file SENZA estensione accanto al suo <nome>.html si contende lo stesso
// URL pulito: con cleanUrls /owner-dashboard può essere servito da
// owner-dashboard.html (la pagina viva, noindex) o dal file `owner-dashboard`
// — un «Owner Portal V2.0» legacy da 64 KB senza meta robots — e quale dei
// due esca non è definito (il controllo del filesystem viene prima della
// rewrite /owner-dashboard → /owner-dashboard.html). Questa suite guardava
// solo il noindex di owner-dashboard.html, quindi poteva passare mentre
// veniva servito l'altro. La regola guarda tutto l'albero deployato (radice
// compresa), non un elenco: il prossimo gemello è quello che sfuggirebbe.
const gemelli = [];
(function giroGemelli(dir) {
  for (const e of fs.readdirSync(path.join(R, dir || '.'), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.name === '.git' || e.name === 'node_modules') continue;
    if (e.isDirectory()) { if (!ignorato(rel + '/')) giroGemelli(rel); continue; }
    if (!e.isFile() || e.name.includes('.') || ignorato(rel)) continue;
    const html = `${rel}.html`;
    if (esiste(html) && !ignorato(html)) gemelli.push(`${rel} ↔ ${html}`);
  }
})('');
check(!gemelli.length, 'nessun file senza estensione deployato condivide il nome (e l\'URL pulito) con un <nome>.html deployato',
  elenco(gemelli).trim());
check(ignorato('owner-dashboard') && !ignorato('owner-dashboard.html'),
  '…in particolare il legacy `owner-dashboard` è escluso e owner-dashboard.html (la pagina noindex) resta l\'unica a servire /owner-dashboard');

const deployati = [];
(function giro(dir) {
  for (const e of fs.readdirSync(path.join(R, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.name === '.git' || e.name === 'node_modules') continue;
    if (e.isDirectory()) { if (!ignorato(rel + '/')) giro(rel); continue; }
    if (!ignorato(rel) && /\.(html|js|mjs|cjs|css|json)$/.test(e.name)) deployati.push(rel);
  }
})('');
const ALT = CARTELLE.join('|');
const NOMI = FILE.map((f) => f.replace(/\.html$/, '').replace(/[.]/g, '\\.')).join('|');
const RIF = [
  // src/href (assoluti o relativi) verso una cartella esclusa
  new RegExp(`(?:src|href)\\s*=\\s*["'](?:https?://(?:www\\.)?boomrome\\.com)?(?:\\.{0,2}/)*(?:${ALT})/`, 'i'),
  // import / require / fetch verso una cartella esclusa
  new RegExp(`(?:from\\s*|import\\(\\s*|require\\(\\s*|fetch\\(\\s*)["'\`](?:\\.{1,2}/)+(?:${ALT})/`),
  new RegExp(`(?:fetch|importScripts)\\(\\s*["'\`]/(?:${ALT})/`),
  // link verso una copia storica esclusa
  new RegExp(`(?:src|href)\\s*=\\s*["'](?:https?://(?:www\\.)?boomrome\\.com)?/?(?:${NOMI})(?:\\.html)?["'#?]`, 'i'),
  // link o fetch verso un documento/configurazione interna (ora esclusi)
  new RegExp(`(?:src|href|fetch\\(|import\\(|from)\\s*=?\\s*["'\`](?:https?://(?:www\\.)?boomrome\\.com)?(?![a-z][a-z0-9+.-]*:|//)[^"'\`#?\\s]*(?:\\.md|\\.github/[^"'\`#?\\s]*|(?:firestore|storage)\\.rules|firebase\\.json|firestore\\.indexes\\.json)["'\`#?]`, 'i'),
];
const riferimenti = [];
for (const f of deployati) {
  const s = leggi(f);
  for (const re of RIF) {
    const m = s.match(re);
    if (m) riferimenti.push(`${f} → ${m[0]}`);
  }
}
for (const [nome, fn] of Object.entries(vercel.functions || {})) {
  const inc = fn && fn.includeFiles;
  if (inc && (ignorato(inc) || new RegExp(`^(?:\\./)?(?:${ALT})/`).test(inc))) riferimenti.push(`vercel.json functions["${nome}"].includeFiles → ${inc}`);
}
check(!riferimenti.length, `nessuno dei ${deployati.length} file deployati (HTML, JS, CSS, api) né includeFiles punta a ciò che è escluso`,
  elenco(riferimenti).trim());

// ════════════════════════════════════════════════════════════════════════
// 5 · Ciò che il deploy usa è nel commit
// ════════════════════════════════════════════════════════════════════════
// Vercel deploya SOLO i file di git. Un modulo che esiste sul disco ma non
// nell'indice passa ogni test in locale e in produzione è
// ERR_MODULE_NOT_FOUND: il 15/10/2026 api/_attribution.js (importato in cima
// da otto porte dei lead: apply, owner, canone, executive, reunion, web,
// slots, homie/_lead — lead persi) e js/listing-facts.js (/listing/<id>,
// /llms-listings.txt, ask-listing) erano NON tracciati, insieme a quindici
// cartelle di suite registrate in tests/run-all.mjs (CI rossa). Si guarda
// l'INDICE (`git ls-files`): un file aggiunto con `git add` conta già, quindi
// la suite diventa verde nel momento giusto, prima del commit. E il
// contrario: nell'indice non entra node_modules né un collegamento simbolico
// verso un percorso assoluto (qui node_modules è proprio questo, e
// `.gitignore` con `node_modules/` ignora solo le cartelle, non i link).
let indice = null, gitPerche = '';
try {
  const out = execFileSync('git', ['-C', R, 'ls-files', '-z', '--cached'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  indice = new Set(out.split('\0').filter(Boolean));
  if (!indice.size) { gitPerche = 'indice vuoto'; indice = null; }
} catch (e) { gitPerche = String((e && e.message) || e).split('\n')[0]; }

if (!indice) {
  console.log(`  \x1b[33m·\x1b[0m §5 saltata: nessun indice git leggibile (${gitPerche}) — fuori da un checkout non c'è commit da verificare`);
} else {
  const fileSuDisco = (rel) => { try { return fs.lstatSync(path.join(R, rel)).isFile(); } catch { return false; } };
  // Da un riferimento scritto in un file a un file del repo. Solo ciò che
  // ESISTE sul disco conta: un URL che non è un file (/apartments, una
  // rewrite) non è materia di questa regola.
  const risolvi = (da, spec) => {
    let s = String(spec || '').trim().replace(/[?#].*$/, '');
    const host = s.match(/^https?:\/\/(?:www\.)?boomrome\.com(\/.*)?$/i);
    if (host) s = host[1] || '/';
    if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return null;
    let rel;
    try { s = decodeURI(s); } catch {}
    if (s.startsWith('/')) rel = s.slice(1);
    else rel = path.posix.join(path.posix.dirname(da), s);
    rel = path.posix.normalize(rel).replace(/^\.\//, '');
    if (rel === '.' || rel === '') rel = '/';
    if (rel.startsWith('..')) return null;
    if (rel === '/') return fileSuDisco('index.html') ? 'index.html' : null;
    const cand = rel.endsWith('/') ? [rel + 'index.html']
      : /\.[a-z0-9]+$/i.test(rel) ? [rel]
      : [rel, rel + '.js', rel + '.mjs', rel + '.html', rel + '/index.js', rel + '/index.html'];
    return cand.find(fileSuDisco) || null;
  };
  const RIF_JS = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimportScripts\s*\(\s*['"]([^'"]+)['"]/g,
  ];
  // Percorsi locali assoluti dentro stringhe (fetch, precache del service
  // worker, `<script src>` composti): solo con estensione o sotto /api/.
  const RIF_STRINGHE = [
    /['"`](\/[A-Za-z0-9_\-./]+\.(?:js|mjs|cjs|css|html|json|png|svg|jpe?g|webp|gif|ico|woff2?|xml|txt|webmanifest|pdf|mp4))['"`?#]/g,
    /['"`](\/api\/[A-Za-z0-9_\-./]+)['"`?#]/g,
  ];
  const RIF_HTML = [/(?:\bsrc|\bhref|\bposter|\bdata-src)\s*=\s*["']([^"']+)["']/gi];
  const RIF_CSS = [/url\(\s*['"]?([^'")]+)['"]?\s*\)/g];
  const riferimentiDi = (rel, testo, soloRelativi) => {
    const pat = /\.(?:m|c)?js$/.test(rel) ? [...RIF_JS, ...(soloRelativi ? [] : RIF_STRINGHE)]
      : /\.html?$/.test(rel) ? [...RIF_HTML, ...RIF_JS, ...RIF_STRINGHE]
      : /\.css$/.test(rel) ? RIF_CSS : [];
    const out = new Set();
    for (const re of pat) for (const m of testo.matchAll(re)) {
      if (soloRelativi && !/^\.{1,2}\//.test(m[1])) continue;
      out.add(m[1]);
    }
    return [...out];
  };

  const fuori = new Map(); // file non nell'indice → chi lo usa
  const visto = new Set();
  const coda = [];
  const visita = (rel, soloRelativi) => { const k = rel + (soloRelativi ? '|t' : ''); if (!visto.has(k)) { visto.add(k); coda.push([rel, soloRelativi]); } };
  // Partenza: tutto ciò che il deploy porta ed è già nel commit, più le due
  // liste che nominano file da fuori del codice (sitemap, vercel.json).
  for (const f of deployati) if (indice.has(f)) visita(f, false);
  const daLista = (chi, spec) => {
    const t = risolvi('', spec);
    if (t && !ignorato(t) && !indice.has(t)) fuori.set(t, (fuori.get(t) || []).concat(chi));
  };
  for (const m of sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) daLista('sitemap.xml', m[1]);
  for (const r of [...(vercel.rewrites || []), ...(vercel.redirects || [])]) {
    if (r && typeof r.destination === 'string' && !/[:(*$]/.test(r.destination)) daLista('vercel.json', r.destination);
  }
  // Le suite registrate: CI le lancia tutte, quindi stanno nel commit, e con
  // loro ciò che importano (anche fuori da tests/, es. scripts/).
  const runAll = leggi('tests/run-all.mjs');
  const suite = [...runAll.matchAll(/\bfile:\s*'([^']+)'/g)].map((m) => m[1]);
  for (const f of suite) {
    if (!fileSuDisco(f)) continue;
    if (!indice.has(f)) fuori.set(f, (fuori.get(f) || []).concat('tests/run-all.mjs'));
    visita(f, true);
  }
  while (coda.length) {
    const [rel, soloRelativi] = coda.shift();
    let testo = '';
    try { testo = leggi(rel); } catch { continue; }
    for (const spec of riferimentiDi(rel, testo, soloRelativi)) {
      const t = risolvi(rel, spec);
      if (!t || t === rel) continue;
      if (!soloRelativi && ignorato(t)) continue; // escluso dal deploy: è materia del §4
      if (!indice.has(t)) fuori.set(t, (fuori.get(t) || []).concat(rel));
      if (/\.(?:m|c)?js$|\.html?$|\.css$/.test(t)) visita(t, soloRelativi);
    }
  }
  const righeFuori = [...fuori].map(([f, chi]) => `${f}  ← ${[...new Set(chi)].slice(0, 3).join(', ')}${new Set(chi).size > 3 ? ', …' : ''}`).sort();
  check(!righeFuori.length,
    `ogni file che il deploy o la CI usano è nell'indice git (${visto.size} file seguiti fra pagine, moduli e suite)`,
    righeFuori.length ? elenco(righeFuori, 25).trim() + `\n      → git add ${[...fuori.keys()].sort().join(' ')}` : '');

  // Il sintomo concreto, nominato: le porte dei lead e la scheda.
  const vitali = ['api/_attribution.js', 'js/listing-facts.js'].filter((f) => fileSuDisco(f) && !indice.has(f));
  check(!vitali.length, 'i moduli importati dalle porte dei lead e da /listing/<id> sono nel commit', vitali.join(', '));

  // Il contrario: nel commit non entra ciò che vive solo su questa macchina.
  const nm = [...indice].filter((f) => f === 'node_modules' || f.startsWith('node_modules/') || /\/node_modules(\/|$)/.test(f));
  check(!nm.length, 'node_modules non è nell\'indice git (né come cartella né come collegamento)', elenco(nm).trim());
  let linkFuori = [];
  try {
    const stage = execFileSync('git', ['-C', R, 'ls-files', '-s', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
    for (const voce of stage.split('\0').filter(Boolean)) {
      const m = voce.match(/^120000 [0-9a-f]+ \d+\t(.+)$/);
      if (!m) continue;
      let dest = '';
      try { dest = fs.readlinkSync(path.join(R, m[1])); } catch { dest = '(illeggibile)'; }
      if (path.isAbsolute(dest) || path.posix.normalize(path.posix.join(path.posix.dirname(m[1]), dest)).startsWith('..')) linkFuori.push(`${m[1]} → ${dest}`);
    }
  } catch {}
  check(!linkFuori.length, 'nessun collegamento simbolico nell\'indice punta fuori dal repo', elenco(linkFuori).trim());
  // Avviso, non errore: oggi node_modules è un collegamento non ignorato, e
  // un `git add -A` lo prenderebbe — la regola qui sopra se ne accorgerebbe
  // al giro dopo, ma meglio dirlo prima.
  try {
    fs.lstatSync(path.join(R, 'node_modules'));
    let ignorata = true;
    try { execFileSync('git', ['-C', R, 'check-ignore', '-q', 'node_modules'], { stdio: 'ignore' }); } catch { ignorata = false; }
    if (!ignorata) console.log('  \x1b[33m·\x1b[0m avviso: node_modules esiste ma git non lo ignora (è un collegamento? `node_modules/` in .gitignore copre solo le cartelle) — aggiungi una riga `node_modules` a .gitignore e non usare `git add -A`');
  } catch {}
}

console.log(ko ? `  \x1b[31mLa porta dei crawler non è in ordine\x1b[0m — ${ok} passed, ${ko} failed`
               : `  \x1b[32mLa porta dei crawler è in ordine\x1b[0m — ${ok} passed, 0 failed`);
process.exit(ko ? 1 : 0);
