// tests/pfs/markets.mjs — IL RADAR PER MERCATO, le regole pure.
//
// Il difetto che lo ha fatto nascere, riprodotto qui sotto (§0): un
// appartamento di Madrid prendeva 100/100 contro una cliente romana con zona
// 'centro' e sarebbe entrato nel suo mazzo. Qui si fissano le regole che lo
// impediscono — la città di un annuncio, quella di un cliente, i lessici delle
// zone, la lettura dei prezzi spagnoli — e che Roma resta byte-identica
// (confronto con l'uscita del codice di prima, salvata in
// fixtures/rome-baseline.json il 25/10/2026).
//
// Tutto sintetico: id fittizi, email costruite dai formati verificati (vedi
// fixtures/idealista-es.mjs per cosa è verificato e cosa no).
//
// node tests/pfs/markets.mjs

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../../api/pfs/_alertparse.js';
import * as S from '../../api/pfs/_searchurls.js';
import * as M from '../../api/homie/_match.js';
import { CITY_MARKETS } from '../../api/_market.js';
import * as F from './fixtures/rome-samples.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
const RM = req(join(here, '..', '..', 'js', 'radar-markets.js'));
const R = req(join(here, '..', '..', 'js', 'radar-engine.js'));
const BASE = req('./fixtures/rome-baseline.json');

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 260) : '')); }
}
const J = (x) => JSON.stringify(x);

console.log('\n── 0. Il difetto di partenza ────────────────────────────────');
{
  const flat = { price: 1400, bedrooms: 1, title: 'Piso en Calle de Atocha, Centro, Madrid', market: 'madrid' };
  const romeWithZone = { budget: 1500, zone: 'centro', bedrooms: '1' };
  const r1 = M.scoreMatch(flat, romeWithZone);
  ok('un piso di Madrid contro una cliente romana con zona "centro" → other_market (prima: 100)', r1.reject === 'other_market' && r1.score === 0, r1);
  const r2 = M.scoreMatch(flat, { budget: 1500, bedrooms: '1' });
  ok('…e contro una cliente romana senza zona → other_market (prima: 60 = soglia)', r2.reject === 'other_market', r2);
  const r3 = M.scoreMatch({ price: 1300, bedrooms: 1, title: 'Bilocale Centro Storico' }, { market: 'madrid', budget: 1500, bedrooms: '1' });
  ok('…e nell\'altra direzione: un annuncio romano a una cliente di Madrid → other_market', r3.reject === 'other_market', r3);
  const r4 = M.scoreMatch({ ...flat }, { market: 'madrid', budget: 1500, zone: 'Centro', bedrooms: '1' });
  ok('stessa città → si punteggia come sempre', !r4.reject && r4.score === 100, r4);
  ok('cliente con mercato scritto male → non riceve niente', M.scoreMatch(flat, { market: 'madird', budget: 1500 }).reject === 'other_market');
  ok('punteggi romani identici al codice di prima', J(F.ROME_SCORES.map(([p, c]) => M.scoreMatch(p, c))) === J(BASE.scores));
}

console.log('\n── 1. Il registro delle città ───────────────────────────────');
{
  const enabled = RM.enabledIds();
  ok('Roma, Madrid e Barcellona accese; Amsterdam dichiarata ma spenta',
    enabled.join(',') === 'roma,madrid,barcelona' && RM.MARKETS.amsterdam && RM.MARKETS.amsterdam.enabled === false, enabled);
  for (const id of enabled.filter((k) => k !== 'roma')) {
    ok(`anti-deriva: ${id} è un desk di CITY_MARKETS che vende (mode search)`,
      CITY_MARKETS[id] && CITY_MARKETS[id].mode === 'search', CITY_MARKETS[id]);
  }
  ok('valuta EUR ovunque', Object.values(RM.MARKETS).every((m) => m.currency === 'EUR'));
  ok('Roma scarta le agenzie (drop), le città le segnalano (flag)',
    RM.MARKETS.roma.agencyPolicy === 'drop' && RM.MARKETS.madrid.agencyPolicy === 'flag' && RM.MARKETS.barcelona.agencyPolicy === 'flag');
  ok('clientMarket: assente → roma', RM.clientMarket({}) === 'roma' && RM.clientMarket({ market: '' }) === 'roma');
  ok('clientMarket: "Madrid " → madrid', RM.clientMarket({ market: 'Madrid ' }) === 'madrid');
  ok('clientMarket: città spenta o sconosciuta → null (fail closed)',
    RM.clientMarket({ market: 'paris' }) === null && RM.clientMarket({ market: 'amsterdam' }) === null && RM.clientMarket({ market: 42 }) === null);
}

console.log('\n── 2. La città di un annuncio ───────────────────────────────');
{
  const res = (o) => RM.resolveListingMarket(o);
  const ES_URL = 'https://www.idealista.com/inmueble/100000001/';
  ok('idealista.it → roma (dominio)', J(res({ sourceUrl: 'https://www.idealista.it/immobile/1/', source: 'idealista' })) === J({ market: 'roma', via: 'domain' }));
  ok('immobiliare.it → roma (dominio)', res({ sourceUrl: 'https://www.immobiliare.it/annunci/1/' }).market === 'roma');
  ok('idealista.com + alias madrid → madrid (alias)', J(res({ sourceUrl: ES_URL, aliasMarket: 'madrid' })) === J({ market: 'madrid', via: 'alias' }));
  ok('idealista.com + testo "…, Madrid" → madrid (testo)', J(res({ sourceUrl: ES_URL, text: 'Piso en Calle X, Chamberí, Madrid' })) === J({ market: 'madrid', via: 'text' }));
  ok('idealista.com, il testo nomina le due città → null market_unknown',
    J(res({ sourceUrl: ES_URL, text: 'Piso en Avinguda de Madrid, Sants, Barcelona' })) === J({ market: null, reason: 'market_unknown' }));
  ok('alias madrid ma testo di Barcellona → market_conflict', res({ sourceUrl: ES_URL, aliasMarket: 'madrid', text: 'Pis al Clot, Barcelona' }).reason === 'market_conflict');
  ok('idealista.com senza alias né città → market_unknown', res({ sourceUrl: ES_URL, text: 'Piso luminoso' }).reason === 'market_unknown');
  ok('fonte storica con URL manuale → roma (legacy)', J(res({ sourceUrl: 'manual://test-1', source: 'manual' })) === J({ market: 'roma', via: 'legacy' }));
  ok('subito/whatsapp/casafari → roma (legacy)', ['subito', 'whatsapp', 'casafari'].every((s) => res({ sourceUrl: 'https://x.example/1', source: s }).market === 'roma'));
  ok('fonte nuova sconosciuta → market_unknown (mai indovinata)', res({ sourceUrl: 'https://www.fotocasa.es/x', source: 'fotocasa' }).market === null);
  // Il dominio TACE (casafari.com, una fonte a mano): l'alias e il testo
  // vengono PRIMA della regola storica "è Roma" (il difetto della revisione:
  // un Casafari a +radar-madrid finiva nel mazzo romano).
  const CF = 'https://www.casafari.com/property/98765432';
  ok('casafari + alias madrid → madrid (alias), non Roma legacy', J(res({ sourceUrl: CF, source: 'casafari', aliasMarket: 'madrid' })) === J({ market: 'madrid', via: 'alias' }));
  ok('casafari + testo "…, Madrid" → madrid (testo)', J(res({ sourceUrl: CF, source: 'casafari', text: 'Piso en Calle de Ponzano, Chamberí, Madrid' })) === J({ market: 'madrid', via: 'text' }));
  ok('casafari + alias madrid + testo di Barcellona → market_conflict', res({ sourceUrl: CF, source: 'casafari', aliasMarket: 'madrid', text: 'Pis al Clot, Barcelona' }).reason === 'market_conflict');
  ok('casafari + "Via Madrid, Roma" (due città) → da verificare, mai Roma per difetto', J(res({ sourceUrl: CF, source: 'casafari', text: 'Bilocale in Via Madrid, Roma' })) === J({ market: null, reason: 'market_unknown' }));
  ok('casafari senza alias né città → roma (legacy, come prima)', J(res({ sourceUrl: CF, source: 'casafari', text: 'Bilocale luminoso' })) === J({ market: 'roma', via: 'legacy' }));
  const FC = 'https://www.fotocasa.es/es/alquiler/vivienda/madrid-capital/ascensor/187654321/d';
  ok('Fotocasa a mano con "…, Madrid" → madrid (testo)', J(res({ sourceUrl: FC, source: 'manual', text: 'Piso en Calle de Atocha, Centro, Madrid' })) === J({ market: 'madrid', via: 'text' }));
  ok('Fotocasa a mano SENZA città → market_unknown (un portale spagnolo non è Roma)', J(res({ sourceUrl: FC, source: 'manual', text: 'Piso luminoso' })) === J({ market: null, reason: 'market_unknown' }));
  ok('i portali spagnoli: il dominio chiede la città', ['https://www.fotocasa.es/x', 'https://www.habitaclia.com/x', 'https://www.pisos.com/x', 'https://agencia.example.es/x', 'https://pis.example.cat/x'].every((u) => RM.marketOfUrl(u) === 'needs_city'));
  ok('dichiarata contro il dominio (idealista.it "madrid") → market_conflict', res({ sourceUrl: 'https://www.idealista.it/immobile/1/', explicit: 'madrid' }).reason === 'market_conflict');
  ok('dichiarata e coerente → explicit', J(res({ sourceUrl: ES_URL, explicit: 'barcelona', text: 'Pis a Gràcia, Barcelona' })) === J({ market: 'barcelona', via: 'explicit' }));
  ok('Amsterdam spenta: pararius → null', RM.marketOfUrl('https://www.pararius.com/apartment-for-rent/amsterdam/948e1ee4/aalsmeerweg') === null);

  ok('alias: +radar-madrid', RM.marketOfRecipients(['Valentino <valentino+radar-madrid@boom-rome.com>']) === 'madrid');
  ok('alias: indirizzo alternativo radar-barcelona@', RM.marketOfRecipients(['radar-barcelona@boom-rome.com']) === 'barcelona');
  ok('alias: due città → null', RM.marketOfRecipients(['a+radar-madrid@x.it', 'a+radar-barcelona@x.it']) === null);
  ok('alias: nessun tag → null', RM.marketOfRecipients(['valentino@boom-rome.com']) === null);
  ok('alias: città spenta (amsterdam) → null', RM.marketOfRecipients(['valentino+radar-amsterdam@boom-rome.com']) === null);
}

console.log('\n── 3. Le zone, città per città ──────────────────────────────');
{
  const z = (t, m) => (R.inferZone(t, m) || {}).zone || null;
  ok('Madrid: "Lavapiés-Embajadores" (titolo vero) → Madrid · Centro',
    z('Alquiler de piso en Calle de la Magdalena, Lavapiés-Embajadores, Madrid', 'madrid') === 'Madrid · Centro');
  ok('Madrid: "Malasaña-Universidad" → Madrid · Centro', z('Piso en Calle de Santa Cruz de Marcenado, Malasaña-Universidad, Madrid', 'madrid') === 'Madrid · Centro');
  ok('Madrid: "Calle de Alcalá" da sola → null (maschera, attraversa i distretti)', z('Calle de Alcalá, Madrid', 'madrid') === null);
  ok('Madrid: "Calle de Alcalá, Goya" → Salamanca (la maschera non vuol dire null)', z('Calle de Alcalá, Goya, Madrid', 'madrid') === 'Madrid · Salamanca');
  ok('Madrid: "Lista para entrar a vivir" → mai Salamanca', z('Lista para entrar a vivir, Madrid', 'madrid') === null);
  ok('Madrid: "Centro comercial" non è il Centro', z('Piso junto al centro comercial, Madrid', 'madrid') === null);
  ok('Madrid: "Calle de Fuencarral, Malasaña" → Centro (la via del nord mascherata)', z('Piso en Calle de Fuencarral, Malasaña-Universidad, Madrid', 'madrid') === 'Madrid · Centro');
  ok('Madrid: due distretti → null (ambiguo)', z('Piso entre Chamberí y Tetuán, Madrid', 'madrid') === null);
  ok('Madrid: il lessico romano non conta ("Calle de Trieste" non è Trieste)', z('Piso en Calle de Trieste, Madrid', 'madrid') === null);
  ok('Barcellona: "Passeig de Gràcia" → Eixample (il lungo batte il corto)', z('Passeig de Gràcia, Barcelona', 'barcelona') === 'Barcelona · Eixample');
  ok('Barcellona: "Travessera de Gràcia" → null', z('Travessera de Gràcia, Barcelona', 'barcelona') === null);
  ok('Barcellona: "Gran Via de les Corts Catalanes" → null', z('Gran Via de les Corts Catalanes, Barcelona', 'barcelona') === null);
  ok('Barcellona: "Carrer Gran de Gràcia" → Gràcia', z('Carrer Gran de Gràcia', 'barcelona') === 'Barcelona · Gràcia');
  ok('una città spenta o ignota non ha lessico', z('Oud-Zuid, Amsterdam', 'amsterdam') === null && z('Centro', 'paris') === null);
  ok('Roma: inferZone(t) identica al codice di prima (16 titoli)', J(F.ROME_TITLES.map((t) => R.inferZone(t))) === J(BASE.inferZone));
  ok('Roma: inferZone(t, "roma") = inferZone(t)', J(F.ROME_TITLES.map((t) => R.inferZone(t, 'roma'))) === J(BASE.inferZone));
  ok('gli slug canonici delle città portano la città davanti',
    R.normalizeZone('Madrid · Chamberí') === 'madrid-chamberi' && R.normalizeZone('Barcelona · Eixample') === 'barcelona-eixample');
  ok('…ma il contenimento li avvicina comunque (perciò i controlli espliciti)', R.zoneCompat('centro', R.normalizeZone('Madrid · Centro')) > 0);
}

console.log('\n── 4. Le gemelle e le vedette non attraversano le città ─────');
{
  const romeL = { id: 'r', source: 'idealista', zone: 'Centro', price: 1400, sqm: 60, bedrooms: 1, title: 'Bilocale centro' };
  const madL = { id: 'm', source: 'idealista_es', market: 'madrid', zone: 'Madrid · Centro', price: 1400, sqm: 60, bedrooms: 1, title: 'Piso centro Madrid' };
  const t = R.twinScore(madL, romeL);
  ok('twinScore: mercati diversi → reject (anche con zona a contenimento, prezzo e mq identici)', t.reject === true && t.why[0] === 'mercati diversi', t);
  ok('…e findTwin non li aggancia', R.findTwin(madL, [romeL]) === null);
  ok('indexEntry porta la città', R.indexEntry('x', madL).market === 'madrid');
  const A = { id: 'a', source: 'idealista_es', market: 'madrid', zone: 'Madrid · Chamberí', price: 1400, sqm: 60, bedrooms: 1, title: 'Piso en Calle de Ponzano, Chamberí, Madrid' };
  const Bv = { ...A, id: 'b', source: 'fotocasa', title: 'Piso en Calle de Santa Engracia, Chamberí, Madrid' };
  ok('Madrid: "Calle de X" vs "Calle de Y" → vie diverse, mai gemelle', R.twinScore(A, Bv).reject === true && /vie diverse/.test(R.twinScore(A, Bv).why[0]), R.twinScore(A, Bv));
  ok('Madrid: stessa via → gemelle', !!R.findTwin({ ...A, id: 'c', source: 'fotocasa', title: 'Piso en Calle de Ponzano, 12, Chamberí' }, [A]));
  ok('Madrid, stessa fonte: "Piso … Chamberí, Madrid" non basta come segnale identitario',
    R.findTwin({ ...A, id: 'd', title: 'Piso en Calle de Fuencarral, Chamberí, Madrid' }, [A]) === null);
  ok('la via spagnola si legge (articoli tolti, civico)', R.streetOf({ title: 'Flat / apartment in Calle de San Dimas, 17, Malasaña' }, 'madrid').street === 'calle san dimas'
    && R.streetOf({ title: 'Flat / apartment in Calle de San Dimas, 17, Malasaña' }, 'madrid').civic === '17'
    && R.streetOf({ title: 'Piso en Carrer de Còrsega, Eixample' }, 'barcelona').street === 'carrer corsega');
  ok('Roma: streetOf senza città è quello di sempre ("Bilocale con camino" non è una via)',
    R.streetOf({ title: 'Bilocale con camino in via del Pigneto 12' }).street === 'via pigneto' && R.streetOf({ title: 'Bilocale con camino' }) === null);
  const w = { enabled: true, createdAt: new Date(Date.now() - 86400e3).toISOString(), criteria: { zones: ['Centro'] } };
  ok('vedetta romana (criteria senza market) non vede Madrid', R.watcherMatch({ ...madL, firstSeenAt: new Date().toISOString() }, w, null).reason === 'altro mercato');
  ok('vedetta di Madrid vede Madrid', R.watcherMatch({ ...madL, firstSeenAt: new Date().toISOString() }, { ...w, criteria: { market: 'madrid', zones: ['Madrid · Centro'] } }, null).match === true);
}

console.log('\n── 5. Leggere gli alert spagnoli ────────────────────────────');
{
  const table = [['1.400', 1400], ['1,400', 1400], ['1.400,50', 1400], ['950', 950], ['350.000', 350000], ['abc', null], ['', null]];
  ok('parseMoney senza locale: il separatore di 3 cifre è delle migliaia', table.every(([i, o]) => P.parseMoney(i) === o), table.map(([i]) => P.parseMoney(i)));
  const w = (t, o) => P.parseWindowFor('idealista_es', t, o);
  const a = w('Piso en Calle de Santa Cruz de Marcenado, Malasaña-Universidad, Madrid 1.400€/mes 1 hab. 57 m² 1ª planta exterior con ascensor');
  ok('scheda spagnola vera → 1400 / 1 / 57 + titolo', a.price === 1400 && a.bedrooms === 1 && a.sqm === 57 && /^Piso en Calle de Santa Cruz/.test(a.title), a);
  const b = w('Flat / apartment in Calle de San Dimas, 17, Malasaña-Universidad, Madrid 1,400€/month 1 bed. 63 m²');
  ok('scheda inglese vera ("1,400€/month") → 1400 / 1 / 63 (prima: price 1)', b.price === 1400 && b.bedrooms === 1 && b.sqm === 63, b);
  ok('il ribasso non è il canone: "Ha bajado 60 € … 1.690 € /mes" → 1690', w('Ático en Calle X, Chamberí, Madrid Ha bajado 60 € 1.690 € /mes').price === 1690);
  ok('"45 €/día" non è un canone', w('Estudio en Calle Y, Madrid 45 €/día', { single: true }).price === null);
  ok('"350.000 €" (vendita) non è un canone', w('Piso en Calle Z, Madrid 350.000 €', { single: true }).price === null);
  ok('importo nudo solo con UN annuncio e UN importo', w('Piso en Calle A, Madrid 1.300 €', { single: true }).price === 1300 && w('Piso en Calle A, Madrid 1.300 €').price === null);
  ok('Estudio senza camere dichiarate → 0', w('Estudio en Calle de la Luna, Centro, Madrid 800 €/mes').bedrooms === 0);
  ok('il titolo non è mai la frase "en tu búsqueda"', !/b[uú]squeda/.test(String(w('Nuevo piso en tu búsqueda BM1 Chamberí\nPiso en Calle A, Chamberí, Madrid\n1.300 €', { single: true }).title)));
  ok('nessun inserzionista dal corpo ("¿Eres particular?")', !('advertiser' in a));

  const cl = (from, subject, aliasMarket) => P.classifyAlertEmail({ from, subject, aliasMarket });
  ok('oggetto spagnolo da idealista.com → alert idealista_es', J(cl('idealista <noresponder@idealista.com>', 'Nuevo piso en tu búsqueda')) === J({ source: 'idealista_es', isSearchAlert: true, advertiserHint: null }));
  ok('"Nuevo mensaje" → non è un alert', cl('noresponder@idealista.com', 'Nuevo mensaje sobre tu anuncio').isSearchAlert === false);
  ok('"Te ha escrito…" → non è un alert NEANCHE con l\'alias', cl('noresponder@idealista.com', 'Te ha escrito un interesado', 'madrid').isSearchAlert === false);
  ok('alias + oggetto neutro → alert (l\'alias è la prova)', cl('noresponder@idealista.com', 'Novedades para ti', 'madrid').isSearchAlert === true);
  ok('particular nell\'oggetto → suggerimento privato', cl('noresponder@idealista.com', 'Nuevo piso de particular en tu búsqueda').advertiserHint === 'private');
  ok('Roma: classifyAlertEmail identica al codice di prima', J(F.ROME_EMAILS.map((e) => P.classifyAlertEmail({ from: e.from, subject: e.subject }))) === J(BASE.classify));
  ok('Roma: classifyAlertEmail identica anche con un alias acceso (il ramo italiano viene prima)',
    J(F.ROME_EMAILS.slice(0, 3).map((e) => P.classifyAlertEmail({ from: e.from, subject: e.subject, aliasMarket: 'madrid' }))) === J(BASE.classify.slice(0, 3)));

  const ex = P.extractListings('<a href="https://t.example/c?u=https%3A%2F%2Fwww.idealista.com%2Fen%2Finmueble%2F100000002%2F">x</a>' +
    '<a href="https://www.idealista.com/inmueble/100000002/">Flat / apartment in Calle A, Retiro, Madrid</a> 1,250€/month 2 bed.' +
    '<a href="https://www.idealista.com/inmueble/100000003/">Piso en Calle B, Retiro, Madrid</a> 1.300€/mes');
  ok('extractListings: link codificati (%2F), /en/inmueble/, doppioni fusi', ex.length === 2 && ex[0].sourceUrl === 'https://www.idealista.com/inmueble/100000002/' && ex[0].source === 'idealista_es', ex);
  ok('…coi dati di ognuno e il testo intorno per la città', ex[0].price === 1250 && ex[1].price === 1300 && /Madrid/.test(ex[0].windowText), ex);
  ok('il pattern .it non prende .com e viceversa',
    P.extractListings('https://www.idealista.com/immobile/123456/').length === 0 && P.extractListings('https://www.idealista.it/inmueble/123456/').length === 0);
  ok('Roma: extractListings identica al codice di prima (niente windowText sui romani)', J(F.ROME_EMAILS.map((e) => P.extractListings(e.html))) === J(BASE.extract));
}

console.log('\n── 6. Le ricerche per città ─────────────────────────────────');
{
  ok('Roma: buildSearchUrlsFor = buildSearchUrls = il codice di prima', J(F.ROME_CLIENTS.map((c) => S.buildSearchUrlsFor(c))) === J(BASE.urls)
    && J(F.ROME_CLIENTS.map((c) => S.buildSearchUrls(c))) === J(BASE.urls));
  ok('Roma pinnata: prati su immobiliare', BASE.urls[0][0].url === 'https://www.immobiliare.it/affitto-case/roma/prati/da-privati/?criterio=dataModifica&ordine=desc&prezzoMassimo=1500');
  ok('Roma pinnata: prati su idealista.it', BASE.urls[0][1].url === 'https://www.idealista.it/affitto-case/roma/prati-mazzini/prati/con-prezzo_1500/?ordine=da-privati-asc');
  const mad = S.buildSearchUrlsFor({ market: 'madrid', budget: 1500, zone: 'Chamberí, Malasaña' });
  ok('Madrid Chamberí → /alquiler-viviendas/madrid/chamberi/', mad.length === 1 && mad[0].url === 'https://www.idealista.com/alquiler-viviendas/madrid/chamberi/' && mad[0].portal === 'idealista_es' && mad[0].market === 'madrid', mad);
  const usera = S.buildSearchUrlsFor({ market: 'madrid', budget: 1500, zone: 'Usera' });
  ok('distretto senza slug verificato → la città intera (madrid-madrid)', usera[0].url === 'https://www.idealista.com/alquiler-viviendas/madrid-madrid/', usera);
  ok('mai prezzo, camere o ordine nell\'URL (non verificati)', [mad, usera].every((l) => !/precio|dormitorio|ordenado/.test(l[0].url)));
  ok('la label dice di impostare il prezzo sul portale', /filtro prezzo da impostare/.test(mad[0].label));
  ok('Barcellona Gràcia → barcelona/gracia', S.buildSearchUrlsFor({ market: 'barcelona', zone: 'Gràcia' })[0].url === 'https://www.idealista.com/alquiler-viviendas/barcelona/gracia/');
  ok('mercato sconosciuto → nessuna ricerca', S.buildSearchUrlsFor({ market: 'paris' }).length === 0);
}

console.log('\n── 7. Il flusso di una città (salute) ───────────────────────');
{
  const now = Date.parse('2026-10-25T12:00:00Z');
  const v = (o) => RM.marketStreamVerdict({ market: 'madrid', nowMs: now, graceHours: 48, ...o });
  ok('nessun cliente attivo → ok, niente da dire', v({ activeClients: 0 }).ok === true);
  ok('alert visto da 10h → ok', v({ activeClients: 1, lastAlertAt: new Date(now - 10 * 3600e3).toISOString() }).ok === true);
  const stale = v({ activeClients: 2, lastAlertAt: new Date(now - 50 * 3600e3).toISOString() });
  ok('nessun alert da 50h con clienti attivi → guasto, col perché', stale.ok === false && /nessun alert Madrid da 48h con 2 clienti attivi/.test(stale.error), stale);
  ok('mai un alert, ma cliente attivo da 49h → guasto (activeSince)', v({ activeClients: 1, activeSince: new Date(now - 49 * 3600e3).toISOString() }).ok === false);
  ok('cliente appena attivato, nessun alert ancora → ok (si aspetta)', v({ activeClients: 1, activeSince: new Date(now - 2 * 3600e3).toISOString() }).ok === true);
}

console.log(`\n  ${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
