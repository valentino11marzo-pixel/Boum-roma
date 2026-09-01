// tests/kiosk/run.mjs — IL TABELLONE /board
//
// Il tabellone Solari da vetrina aveva tre difetti che nessuno vedeva se
// non passando davanti al vetro: il rullo non conosceva l'apostrofo (su
// «CONCA D'ORO» la cella restava MUTA per sempre — indexOf -1, nessun
// passo), la zona si troncava a metà parola («VITTORIO VENE», «CENTRO
// STORIC»), e il prezzo tagliato a 6 caratteri stampava «€10,00» per
// €10,000 — un numero DIVERSO in vetrina. In più la pagina viveva in
// quirks mode (niente doctype), l'og:image puntava a un PNG che non
// esiste nel repo, e il motore Solari inline era una copia VECCHIA di
// solari-engine.html, senza il fix Safari dell'animationend.
//
// Qui si morde: il motore puro delle righe (js/kiosk-engine.js) col VERO
// dispo-engine — le corsie di dispo valgono anche sul tabellone: una casa
// fuori mercato non sale, una data illeggibile scrive ASK e MAI NOW, una
// affittata mostra il rilascio solo se lo dice il CONTRATTO — e le
// giunzioni sulla SORGENTE: pagina, motore condiviso e builder python non
// possono divergere.
//
//   node tests/kiosk/run.mjs

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const K = require(join(RADICE, 'js', 'kiosk-engine.js'));
const D = require(join(RADICE, 'js', 'dispo-engine.js'));

let pass = 0, fail = 0;
const ok = (c, what) => { if (c) { pass++; console.log(`  ✓ ${what}`); } else { fail++; console.log(`  ✗ ${what}`); } };

const OGGI = '2026-08-28';
const opts = { dispo: D, oggi: OGGI };
const nelRullo = (s) => [...String(s)].every((ch) => K.DRUM.includes(ch));

console.log('\n▸ il rullo conosce ogni glifo che il motore può emettere');
ok(K.DRUM.includes("'"), "l'apostrofo è nel rullo (CONCA D'ORO non è più mezza muta)");
ok(K.DRUM.includes('-'), 'il trattino è nel rullo');
{
  const r = K.riga({ status: 'available', price: 1750, bedrooms: 1, zone: "Conca d'Oro" }, opts);
  ok(r && r.zona === "CONCA D'ORO", `Conca d'Oro conserva l'apostrofo (${r && r.zona})`);
}
{
  // un catalogo cattivo apposta: accenti, apostrofi, prezzi enormi, testo libero
  const cattivo = [
    { status: 'available', price: 1200, zone: 'Città Giardino', beds: '2 BR' },
    { status: 'available', price: 999999, zone: "Sant'Agnese/Annibaliano" },
    { status: 'waitlist', price: 1500, zone: 'Vittorio Veneto', availableDate: '1 Sept 2027' },
    { status: 'available', price: 900, zone: 'Torre Maura è qui', availableDate: 'boh' },
  ];
  const righe = cattivo.map((l) => K.riga(l, opts)).filter(Boolean);
  ok(righe.length === 4, `il catalogo cattivo produce 4 righe (${righe.length})`);
  ok(righe.every((r) => Object.values(r).every(nelRullo)),
    'OGNI glifo emesso esiste nel rullo — mai più una cella muta');
}

console.log('\n▸ la zona si ABBREVIA, mai mozzata a metà parola');
ok(K.zonaCorta('Vittorio Veneto') === 'V. VENETO', `Vittorio Veneto → V. VENETO (${K.zonaCorta('Vittorio Veneto')})`);
ok(K.zonaCorta('Centro Storico') === 'CENTRO', `Centro Storico → CENTRO (${K.zonaCorta('Centro Storico')})`);
ok(K.zonaCorta('Città Giardino') === 'C. GIARDINO', `Città Giardino → C. GIARDINO, senza accento (${K.zonaCorta('Città Giardino')})`);
ok(K.zonaCorta('Ponte Milvio') === 'PONTE MILVIO', 'quello che entra resta intero');
ok(K.zonaCorta('') === 'ROMA' && K.zonaCorta(null) === 'ROMA', 'zona assente → ROMA');
ok(K.zonaCorta('Trastevere/Monteverde') === 'TRASTEVERE', 'la barra tiene solo il primo nome');
{
  const lunghe = ['Vittorio Veneto', 'Centro Storico', 'Monteverde Vecchio', 'Villaggio Olimpico',
    'Una Zona Con Un Nome Chilometrico Davvero'];
  ok(lunghe.every((z) => K.zonaCorta(z).length <= K.W.zona), 'nessuna zona supera le 13 celle');
  ok(lunghe.every((z) => nelRullo(K.zonaCorta(z))), 'e tutte stanno nel rullo');
}

console.log('\n▸ il prezzo non viene MAI corrotto in silenzio');
ok(K.prezzoCorto(1500) === '€1,500', `€1,500 (${K.prezzoCorto(1500)})`);
ok(K.prezzoCorto(900) === '€900', `€900 (${K.prezzoCorto(900)})`);
ok(K.prezzoCorto(10000) === '€10000', `€10,000 → €10000, MAI "€10,00" (${K.prezzoCorto(10000)})`);
ok(K.prezzoCorto(10000) !== '€10,00', 'il vecchio taglio [:6] avrebbe stampato un numero diverso');
ok([899, 1500, 9999, 10000, 99999, 100000, 1500000, 25000000]
  .every((n) => K.prezzoCorto(n).length <= K.W.prezzo), 'ogni prezzo sta nelle 6 celle');

console.log('\n▸ le corsie di dispo-engine valgono anche sul tabellone');
{
  const r = K.riga({ status: 'rented', price: 1200, zone: 'Trieste', availableDate: 'Feb 1' }, opts);
  ok(r === null, 'REGOLA C: affittata con la sola availableDate (testo residuo) NON sale sul tabellone');
}
{
  const r = K.riga({ status: 'rented', price: 1200, zone: 'Trieste', availableFrom: '2027-02-01' }, opts);
  ok(r && r.ora === '1FEB' && r.stato === 'LIST',
    `affittata col rilascio da CONTRATTO → si prenota: 1FEB · LIST (${r && (r.ora + ' · ' + r.stato)})`);
}
{
  const r = K.riga({ status: 'available', price: 990, zone: 'Monti', availableDate: 'chi lo sa' }, opts);
  ok(r && r.ora === 'ASK', `REGOLA 1: data illeggibile → ASK, MAI NOW (${r && r.ora})`);
  ok(r && r.ora !== 'NOW', 'il difetto storico della vetrina non torna sul tabellone');
}
{
  const r = K.riga({ status: 'waitlist', price: 1500, zone: 'Prati' }, opts);
  ok(r && r.stato === 'LIST' && r.ora === 'ASK',
    `waitlist senza data → LIST · ASK, una promessa più debole ma vera (${r && (r.stato + ' · ' + r.ora)})`);
}
{
  const r = K.riga({ status: 'waitlist', price: 1300, zone: 'Prati', availableDate: '1 Sept 2027' }, opts);
  ok(r && r.ora === '1SEP' && r.stato === 'LIST', `waitlist con data → la data si VEDE (${r && r.ora})`);
}
ok(K.riga({ status: 'reserved', price: 1500, zone: 'Prati' }, opts) === null, 'riservata → giù dal tabellone');
ok(K.riga({ status: 'rented', price: 1500, zone: 'Prati' }, opts) === null, 'affittata senza data → giù dal tabellone');
ok(K.riga({ status: 'available', zone: 'Prati' }, opts) === null, 'senza prezzo non si stampa');
{
  const adesso = +new Date(OGGI);
  const fresca = K.riga({ status: 'available', price: 1600, zone: 'Pigneto', createdMs: adesso - 5 * 864e5 }, opts);
  const vecchia = K.riga({ status: 'available', price: 1600, zone: 'Pigneto', createdMs: adesso - 40 * 864e5 }, opts);
  ok(fresca && fresca.stato === 'NEW', `nata da 5 giorni → NEW (${fresca && fresca.stato})`);
  ok(vecchia && vecchia.stato === 'FREE', `nata da 40 giorni → FREE (${vecchia && vecchia.stato})`);
}

console.log('\n▸ senza il motore dispo non si indovina');
ok(K.riga({ status: 'available', price: 1500, zone: 'Prati' }, { oggi: OGGI, dispo: null }) === null,
  'riga() senza dispo → null, mai una corsia inventata');

console.log('\n▸ la lettura del REST di Firestore (la stessa dell\'idrante)');
{
  const docs = [
    { createTime: '2026-07-01T10:00:00Z', fields: { status: { stringValue: 'available' }, price: { integerValue: '1200' }, zone: { stringValue: 'Trieste' }, beds: { stringValue: '1 BR' } } },
    { createTime: '2026-08-27T10:00:00Z', fields: { status: { stringValue: 'available' }, price: { stringValue: '1500' }, bedrooms: { doubleValue: 2 }, zone: { stringValue: 'Pigneto' } } },
    { createTime: '2026-08-20T10:00:00Z', fields: { status: { stringValue: 'rented' }, price: { integerValue: '2000' }, zone: { stringValue: 'Prati' } } },
  ];
  const righe = K.daFirestore(docs, opts);
  ok(righe.length === 2, `3 documenti → 2 righe (l'affittata scende) (${righe.length})`);
  ok(righe[0].zona === 'PIGNETO', `le più recenti in testa (${righe[0].zona})`);
  ok(righe[0].tipo === '2BR' && righe[1].tipo === '1BR', 'letti da stringValue e doubleValue');
  ok(K.daFirestore(docs, { oggi: OGGI, dispo: null }).length === 0, 'senza dispo → righe vuote (resta la build)');
  ok(K.daFirestore([], opts).length === 0 && K.daFirestore(null, opts).length === 0, 'catalogo vuoto → vuoto, senza esplodere');
}

/* ── le giunzioni sulla SORGENTE ─────────────────────────────────────── */
const board = readFileSync(join(RADICE, 'board.html'), 'utf-8');
const motore = readFileSync(join(RADICE, 'design', 'pages-deco', 'solari-engine.html'), 'utf-8');
const builder = readFileSync(join(RADICE, 'design', 'pages-deco', 'costruisci-kiosk.py'), 'utf-8');
const engineJs = readFileSync(join(RADICE, 'js', 'kiosk-engine.js'), 'utf-8');

console.log('\n▸ la pagina esce dal quirks mode e dice la verità nei meta');
ok(/^<!doctype html>/i.test(board.trim()), 'board.html apre col doctype (prima: quirks mode)');
ok(board.includes('<meta charset="utf-8">'), 'charset dichiarato (la pagina è piena di € e ·)');
ok(board.includes('<html lang="en">'), 'lang dichiarata');
ok(/html\s*\{[^}]*height:100%/.test(board), 'html{height:100%} — in standards mode body{height:100%} da solo non basta');
{
  const og = board.match(/property="og:image" content="https:\/\/www\.boomrome\.com\/([^"]+)"/);
  ok(!!og && existsSync(join(RADICE, og[1])), `l'og:image esiste nel repo (${og && og[1]}) — BOOMsocialprofile.png era un 404`);
}
ok(!board.includes('BOOMsocialprofile'), 'il PNG fantasma non è più citato');

console.log('\n▸ un rullo solo, una grammatica sola');
{
  const drumPagina = board.match(/var DRUM = "([^"]+)"/);
  ok(!!drumPagina && drumPagina[1] === K.DRUM, 'il DRUM della pagina è IDENTICO a quello del motore');
  const drumBuilder = builder.match(/DRUM = "([^"]+)"/);
  ok(!!drumBuilder && drumBuilder[1] === K.DRUM, 'il DRUM del builder python è IDENTICO a quello del motore');
}
{
  const m = board.match(/var CASE = (\[.*?\]);/s);
  const baked = m ? JSON.parse(m[1]) : null;
  const COLONNE = ['ora', 'zona', 'tipo', 'prezzo', 'stato'];
  ok(!!baked && baked.length > 0, `la CASE della build si legge (${baked && baked.length} righe)`);
  ok(!!baked && baked.every((c) => COLONNE.every((k) => nelRullo(c[k]))),
    'ogni glifo delle COLONNE della build esiste nel rullo (CONCA D\'ORO compresa; l\'id non passa dalle palette)');
  ok(!!baked && !baked.some((c) => c.zona === 'VITTORIO VENE' || c.zona === 'CENTRO STORIC'),
    'le zone mozzate a metà parola sono sparite dalla build');
  ok(!!baked && baked.every((c) => c.zona.length <= K.W.zona && c.prezzo.length <= K.W.prezzo
    && c.ora.length <= K.W.ora && c.stato.length <= K.W.stato && c.tipo.length <= K.W.tipo),
    'ogni valore della build sta nelle sue celle');
  ok(!!baked && baked.every((c) => typeof c.id === 'string' && c.id.length > 0),
    'ogni riga della build porta il suo id: la riga è una PORTA, non solo teatro');
}

console.log('\n▸ il tabellone si può CLICCARE (e la vetrina resta vetrina)');
ok(/riga\.viva|\.riga\.viva/.test(board) && board.includes("location.href = '/listing/'"),
  'la riga con id apre /listing/<id>');
ok(board.includes("e.key === 'Enter'") && board.includes("setAttribute('tabindex', '0')"),
  'anche da tastiera: tabindex + Enter');
ok(/body\.kiosk\s*\{\s*cursor:none/.test(board) && /kiosk=1/.test(board),
  'cursor:none è SOLO della vetrina (?kiosk=1) — prima nessuno poteva cliccare');
ok(!/body\s*\{[^}]*cursor:none/.test(board),
  'il body di default ha il cursore (il difetto «I can\'t even click»)');
{
  const eng = readFileSync(join(RADICE, 'js', 'kiosk-engine.js'), 'utf-8');
  ok(/id: String\(l\.id/.test(eng) && /doc\.name/.test(eng),
    'il motore porta l\'id dal documento Firestore fino alla riga');
}
{
  const r = K.riga({ id: 'abc123', status: 'available', price: 1500, zone: 'Prati' }, opts);
  ok(r && r.id === 'abc123', 'riga() conserva l\'id');
  const senza = K.riga({ status: 'available', price: 1500, zone: 'Prati' }, opts);
  ok(senza && senza.id === '', 'senza id la porta resta chiusa, mai un undefined');
}

console.log('\n▸ il motore Solari è UNA copia (e con le guardie)');
{
  const blocco = board.match(/<!-- solari:inizio -->\n([\s\S]*?)\n<!-- solari:fine -->/);
  ok(!!blocco && blocco[1] === motore.trim(),
    'il blocco Solari dentro board.html è BYTE-IDENTICO a solari-engine.html (prima era una copia vecchia, senza il fix Safari)');
  ok(motore.includes('void self.lbEl.offsetWidth'), 'il fix Safari dell\'animationend c\'è (reflow forzato)');
  ok(/glifo\s*=\s*function/.test(motore) && motore.includes("indexOf(ch) >= 0 ? ch : ' '"),
    'un glifo fuori rullo degrada a spazio, mai una cella muta');
  ok(motore.includes('Board.prototype.refit'), 'refit() esiste: dopo un resize la calibrazione si rifà');
  ok(motore.includes('this.host = host'), 'la Board ricorda il suo host (serve al refit)');
}

console.log('\n▸ la regia della pagina: idrante, quiete, risveglio');
ok(board.includes('/js/dispo-engine.js') && board.includes('/js/kiosk-engine.js'),
  'la pagina carica i due motori (corsie e righe)');
ok(board.includes('firestore.googleapis.com') && board.includes('listings?pageSize=300'),
  "l'idrante rilegge il catalogo vero (lettura pubblica, come la vetrina)");
ok(/if \(!window\.BOOM_KIOSK \|\| !window\.BOOM_DISPO/.test(board),
  'senza motori l\'idrante tace: restano i numeri della build, mai una pagina rotta');
ok(board.includes('prefers-reduced-motion'), 'chi chiede quiete ha il tabellone fermo');
ok(/document\.hidden \|\| RIDOTTO \|\| !righe\.length/.test(board),
  'il fremito è guardato: scheda nascosta, quiete, tabellone vuoto');
ok(board.includes('visibilitychange'), 'al risveglio l\'orologio si aggiorna subito');
ok(/resize/.test(board) && /b\.refit\(\)/.test(board), 'al resize ogni Board si ricalibra');
ok(board.includes('<noscript>'), 'un crawler senza JS legge comunque le case');

console.log('\n▸ il builder non può più regredire la pagina');
ok(builder.includes("or 'ASK'"), "il fallback è ASK (l'em-dash «—» non esisteva nel rullo: cella muta)");
ok(!/\[:13\]/.test(builder), 'la zona non si tronca più con [:13]');
ok(builder.includes('zona_corta') && builder.includes('prezzo_corto'), 'zona e prezzo passano dalla grammatica');
ok(builder.includes("board.html"), 'il template del builder È la pagina viva (marker, non una copia)');
ok(board.includes('<!-- case-noscript -->') && board.includes('<!-- /case-noscript -->'),
  'i marker del noscript ci sono (il builder li riempie)');
ok(engineJs.includes('marketLane'), 'il motore righe delega la corsia a dispo-engine, mai un giudizio proprio');

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
