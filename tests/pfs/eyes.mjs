// tests/pfs/eyes.mjs — gli occhi di Homie sul radar PFS.
//
// Il radar scopre gli immobili QUANDO IL PORTALE MANDA L'EMAIL, perché il
// server prende 403 dai portali (scritto in api/pfs/_fetch.js). Homie, da IP
// residenziale con sessioni vere, può guardare direttamente — ma solo se sa
// COSA guardare, e solo se qualcuno se ne accorge quando smette.
//
// Qui si testa quel contratto: la lista di lavoro non deve mai contenere
// ricerche spente, di clienti non più attivi, o URL inservibili — e un giro
// in cui i portali hanno bloccato tutto NON deve passare per un giro riuscito
// con zero risultati (che è indistinguibile da un mercato fermo, ed è il modo
// esatto in cui un radar muore in silenzio).
//
// Esegui: node tests/pfs/eyes.mjs

import { activeSearches, runVerdict, SUGGESTED_INTERVAL_MINUTES } from '../../api/homie/searches.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

const CLIENTS = new Map([
  ['c1', { id: 'c1', name: 'Sophie K' }],
  ['c2', { id: 'c2', name: 'Marco R' }],
]);

// ── 1. cosa entra nella lista di lavoro ────────────────────────────────────
{
  const rows = [
    { id: 's1', portal: 'immobiliare', searchUrl: 'https://www.immobiliare.it/affitto-case/roma/?prezzoMax=1200', label: 'Pigneto ≤1200', clientId: 'c1', enabled: true },
    { id: 's2', portal: 'idealista', searchUrl: 'https://www.idealista.it/affitto-case/roma/', label: 'Roma', clientId: 'c2', enabled: true },
    { id: 's3', portal: 'idealista', searchUrl: 'https://www.idealista.it/vecchia', clientId: 'c9', enabled: false },   // spenta
    { id: 's4', portal: 'immobiliare', searchUrl: null, clientId: 'c1', enabled: true },                                 // senza URL
    { id: 's5', portal: 'immobiliare', searchUrl: 'non-un-url', clientId: 'c1', enabled: true },                        // URL rotto
  ];
  const out = activeSearches(rows, CLIENTS);
  ok('solo le ricerche utilizzabili', out.length === 2, out.map(s => s.id));
  ok('la spenta resta fuori', !out.some(s => s.id === 's3'));
  ok('senza URL resta fuori', !out.some(s => s.id === 's4'));
  ok('un URL non valido resta fuori', !out.some(s => s.id === 's5'), out);
  ok('il nome del cliente arriva a Homie', out[0].clientName === 'Sophie K', out[0]);
  ok('portale e label viaggiano', out[0].portal === 'immobiliare' && out[0].label === 'Pigneto ≤1200', out[0]);
}

// ── 2. la manopola manuale vince sempre ────────────────────────────────────
// urlOverride è ciò che l'operatore scrive quando la URL auto-generata non
// rende bene; sync-searches ha cura di non sovrascriverla mai. Se qui la
// ignorassimo, Homie andrebbe a guardare la ricerca sbagliata e nessuno se ne
// accorgerebbe: i risultati arriverebbero, solo che sarebbero quelli di prima.
{
  const out = activeSearches([{
    id: 's9', portal: 'idealista', enabled: true, clientId: 'c1',
    searchUrl: 'https://www.idealista.it/auto-generata',
    urlOverride: 'https://www.idealista.it/scritta-a-mano-dall-operatore',
  }], CLIENTS);
  ok('urlOverride batte searchUrl', out[0].url.includes('scritta-a-mano'), out[0].url);
}

// ── 3. robustezza sui dati veri ────────────────────────────────────────────
{
  ok('lista vuota → nessun errore', activeSearches([], CLIENTS).length === 0);
  ok('null → nessun errore', activeSearches(null).length === 0);
  ok('righe malformate non fanno saltare il giro', activeSearches([null, undefined, {}], CLIENTS).length === 0);
  const noName = activeSearches([{ id: 'x', enabled: true, searchUrl: 'https://a.it/x', clientId: 'ignoto' }], CLIENTS);
  ok('cliente sconosciuto → la ricerca resta, senza nome', noName.length === 1 && noName[0].clientName === null, noName);
  // `enabled` assente = attiva: i doc creati a mano non devono sparire
  ok('enabled mancante conta come attiva',
    activeSearches([{ id: 'y', searchUrl: 'https://a.it/y' }], CLIENTS).length === 1);
}

// ── 4. la cadenza è un compromesso dichiarato, non un caso ────────────────
{
  ok('intervallo suggerito ragionevole',
    SUGGESTED_INTERVAL_MINUTES >= 5 && SUGGESTED_INTERVAL_MINUTES <= 30, SUGGESTED_INTERVAL_MINUTES);
  // il punto dell'intera funzionalità: molto più veloce del digest email,
  // che è la fonte portante di oggi
  ok('molto più veloce di un digest email', SUGGESTED_INTERVAL_MINUTES <= 15);
}

// ── 5. il rapporto: un radar cieco non deve sembrare un mercato fermo ─────
// Si guida la funzione VERA (runVerdict, esportata): riprodurla qui
// significherebbe testare una copia che può divergere dal codice in
// produzione — cioè esattamente non testare niente.
{
  const verdict = runVerdict;
  ok('giro pulito → ok', verdict({ searches: 6, found: 12, ingested: 3, blocked: 0 }));
  ok('un portale che blocca ogni ricerca → NON ok',
    !verdict({ searches: 6, found: 0, ingested: 0, blocked: 6 }));
  ok('blocchi parziali → ancora ok (l\'altro portale ha risposto)',
    verdict({ searches: 6, found: 4, ingested: 1, blocked: 2 }));
  ok('zero risultati ma nessun blocco → ok, è solo un mercato fermo',
    verdict({ searches: 6, found: 0, ingested: 0, blocked: 0 }));
  ok('Homie dichiara un fallimento → NON ok', !verdict({ ok: false, searches: 6, blocked: 0 }));
  ok('rapporto vuoto (giro morto) → NON ok', !verdict({}));
}

console.log(fails ? `\n${fails} FALLITI` : '\nTutto verde.');
process.exit(fails ? 1 : 0);
