// tests/firma/run.mjs — IL MODELLO GIUSTO E LA FIRMA IN PRIMA PERSONA.
//
// Due difetti segnalati insieme dal fondatore (28/08), con la stessa radice:
// una cosa dichiarata da qualche parte non arrivava dove serviva.
//
//  1. IL TEMPLATE CHE NON ERA QUELLO. Il generatore sceglie l'Allegato C
//     (studenti) solo se contract.type === 'studenti' — ma la console
//     pre-accordo non offriva nemmeno l'opzione «studenti» e NON passava
//     mai il tipo a convert: ogni contratto nasceva 'transitorio' e usciva
//     l'Allegato B, anche per uno studente. E il modale «Modifica
//     contratto» non aveva il campo Tipo: una volta sbagliato, per sempre.
//  2. FIRMARE, NON SOLO SOLLECITARE. La delega del proprietario si poteva
//     decidere SOLO alla creazione del contratto.
//
// La riga rossa che questa suite difende: al posto del CONDUTTORE non si
// firma mai — il pannello offre la firma IN PRESENZA (è lui che firma, sul
// tuo dispositivo), mai una firma per suo conto.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');
const app = src('js/portal-app.js');
const cons = src('pre-agreement-admin.html');
const cpdf = src('js/contract-pdf.js');
const conv = src('api/preagreement/convert.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. Il tipo arriva fino al modello ───────────────────────────────────
ok(/contract\.type === 'studenti'\) \? buildAllegatoC/.test(cpdf), 'il dispatcher sceglie il modello dal tipo');
ok(/type === 'studenti' \? 'studenti' : 'transitorio'/.test(conv), 'convert normalizza il tipo');
ok(/Student Housing \(Allegato C\)/.test(cons), 'la console pre-accordo OFFRE il contratto studenti');
const call = cons.slice(cons.indexOf("fetch('/api/preagreement/convert'") - 600, cons.indexOf("fetch('/api/preagreement/convert'") + 400);
ok(/type:\s*isStud\s*\?\s*'studenti'\s*:\s*'transitorio'/.test(call), 'la conversione PASSA il tipo (prima non lo faceva mai)');
ok(/\/student\/i\.test\(String\(\(d\.lease/.test(call), 'il tipo si deduce dal Tipo scelto sulla proposta, non da un default');

// ── 2. Il contratto sbagliato si corregge ───────────────────────────────
const edit = app.slice(app.indexOf("if (type === 'editContract')"), app.indexOf("if (type === 'editContract')") + 9000);
ok(/name="type"/.test(edit) && /Studenti universitari — Allegato C/.test(edit), 'il modale Modifica ha il campo Tipo');
const upd = app.slice(app.indexOf('async function updateContract'), app.indexOf('async function updateContract') + 3000);
ok(/type: data\.type === 'studenti' \? 'studenti' : 'transitorio'/.test(upd), 'updateContract SALVA il tipo (altrimenti il campo sarebbe finto)');

// ── 3. La firma in prima persona ────────────────────────────────────────
const fo = app.slice(app.indexOf('function openFirmaOra'), app.indexOf('function openFirmaOra') + 6000);
ok(fo.length > 500 && /window\.openFirmaOra/.test(app), 'il pannello 🖊 Firma ora esiste ed è globale');
ok(/tenantSignToken/.test(fo) && /landlordSignToken/.test(fo), 'apre il link VERO di ciascuna parte (firma in presenza)');
ok(/boomOpen\(/.test(fo), 'usa la consegna unica (niente window.open crudo)');
ok(/non si firma mai/.test(fo) && /firma falsa/.test(fo), 'la riga rossa è SCRITTA nel pannello: al posto del conduttore non si firma');
ok(/🖊 Firma ora/.test(app), 'il bottone è sulla riga contratto');

const sd = app.slice(app.indexOf('async function setDelega'), app.indexOf('async function setDelega') + 1800);
ok(/landlordSignature\) return toast\('error'/.test(sd), 'delega bloccata se il locatore ha GIÀ firmato (un atto firmato non si riscrive)');
ok(/landlordDelegate: payload/.test(sd) && /onBehalfOf/.test(sd), 'scrive la delega nello schema che il rail firma già legge');
ok(/logActivity\(on \? 'delega_attivata'/.test(sd), 'la delega lascia traccia nel registro attività');
// il rail di firma la legge davvero: senza, il pannello sarebbe una bugia
ok(/landlordDelegate/.test(src('api/magic-sign/lookup.js')) && /landlordDelegate/.test(src('api/magic-sign/submit.js')),
  'lookup e submit leggono la delega: il documento dirà «per conto di»');
ok(/landlordDelegate/.test(src('sign.html')), 'la pagina di firma mostra la delega al firmatario');

console.log(`\n${fail ? '✗' : '✓'} firma: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
