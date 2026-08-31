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
//  3. E IL TIPO NON BASTAVA MANDARLO DALLA CONSOLE. Delle tre strade che
//     creano un contratto, DUE non passavano il tipo affatto: la conversione
//     AUTOMATICA (_auto.js — quella che scatta da sola quando l'immobile è
//     collegato, cioè il caso normale) e il tasto 🖊 Magic Sign
//     (send-sign.js). Uno studente che chiudeva il deal da solo riceveva
//     comunque l'Allegato B. Il tipo ora si LEGGE dalla proposta dentro
//     convert, quindi nessun chiamante può sbagliarlo. E i dati che
//     l'Allegato C nomina — corso di studi e università — si raccolgono
//     sulla proposta, altrimenti il PDF giusto stampa i puntini.
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
const crea = src('api/preagreement/create.js');
const { leaseType } = await import('../../api/preagreement/convert.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. Il tipo arriva fino al modello ───────────────────────────────────
ok(/contract\.type === 'studenti'\) \? buildAllegatoC/.test(cpdf), 'il dispatcher sceglie il modello dal tipo');
// il tipo NON dipende da chi chiama: si guida la funzione vera, esportata
ok(leaseType('studenti', {}) === 'studenti' && leaseType('transitorio', {}) === 'transitorio',
  'il chiamante esplicito vince (la console conferma quello che ha scelto)');
ok(leaseType(undefined, { type: 'Student Housing (Allegato C)' }) === 'studenti',
  'SENZA parametro il tipo si legge dalla proposta — è la strada di _auto.js e send-sign.js');
ok(leaseType(undefined, { type: 'Transitional Lease' }) === 'transitorio'
   && leaseType(undefined, {}) === 'transitorio' && leaseType(undefined, null) === 'transitorio',
  'in mancanza di prove resta transitorio (mai un Allegato C indovinato)');
// LA REGRESSIONE CHE COSTA: queste due strade non mandano il tipo, e sono
// quelle che l'operatore usa davvero. Se un domani qualcuno rimettesse la
// derivazione nel chiamante, qui si accorge che le altre due restano cieche.
ok(!/type:/.test(src('api/preagreement/_auto.js').slice(src('api/preagreement/_auto.js').indexOf('convertPaToContract({'), src('api/preagreement/_auto.js').indexOf('convertPaToContract({') + 200)),
  'la conversione automatica NON manda il tipo: deve bastare la proposta');
ok(/leaseType\(type, le\)/.test(conv), 'convert deriva il tipo con la regola condivisa, non con un ternario locale');
ok(/Student Housing \(Allegato C\)/.test(cons), 'la console pre-accordo OFFRE il contratto studenti');
const call = cons.slice(cons.indexOf("fetch('/api/preagreement/convert'") - 600, cons.indexOf("fetch('/api/preagreement/convert'") + 400);
ok(/type:\s*isStud\s*\?\s*'studenti'\s*:\s*'transitorio'/.test(call), 'la conversione PASSA il tipo (prima non lo faceva mai)');
ok(/\/student\/i\.test\(String\(\(d\.lease/.test(call), 'il tipo si deduce dal Tipo scelto sulla proposta, non da un default');

// ── 1b. I dati che l'Allegato C nomina arrivano fin lì ──────────────────
// Il modello dell'associazione scrive corso di studi e università DENTRO la
// clausola: senza, esce il documento giusto con i puntini al posto dei fatti.
ok(/studenti: studentBlock\(l\.studenti\)/.test(crea), 'create accetta i dati dello studente sulla proposta');
ok(/corsoStudi: clip\(x\.corsoStudi/.test(crea) && /annoAccademico: clip\(x\.annoAccademico/.test(crea),
  'i campi passano dalla lista bianca (mai un campo libero verso Firestore)');
ok(/return Object\.keys\(out\)\.some\(\(k\) => out\[k\]\) \? out : null;/.test(crea),
  'blocco vuoto → null: non si scrive un oggetto di stringhe vuote');
ok(/corsoStudi: stud\.corsoStudi \|\| ''/.test(conv) && /universitaIndirizzo: stud\.universitaIndirizzo/.test(conv),
  'convert porta i dati dello studente sul contratto');
ok(/courseName: cType === 'studenti'/.test(conv) && /universityName: cType === 'studenti'/.test(conv),
  'su un transitorio i campi universitari restano vuoti (niente rumore sul documento)');
ok(/id="fStudCourse"/.test(cons) && /id="fStudUni"/.test(cons) && /id="fStudYear"/.test(cons),
  'la console pre-accordo CHIEDE corso, università e anno accademico');
ok(/studenti:readStud\(\)/.test(cons), 'e li manda con la proposta');
ok(/if\(!isStud\(\)\)return null/.test(cons), 'su un contratto non-studenti non si spediscono dati universitari');
ok(/onchange="syncStud\(\)"/.test(cons) && /_st\.corsoStudi/.test(cons),
  'i campi compaiono col tipo giusto e si ricompilano in ✎ Modifica (stesso link)');

// ── 2. Il contratto sbagliato si corregge ───────────────────────────────
const edit = app.slice(app.indexOf("if (type === 'editContract')"), app.indexOf("if (type === 'editContract')") + 9000);
ok(/name="type"/.test(edit) && /Studenti universitari — Allegato C/.test(edit), 'il modale Modifica ha il campo Tipo');
const upd = app.slice(app.indexOf('async function updateContract'), app.indexOf('async function updateContract') + 5200);
ok(/type: data\.type === 'studenti' \? 'studenti' : 'transitorio'/.test(upd), 'updateContract SALVA il tipo (altrimenti il campo sarebbe finto)');
// IL BUCO CHE IL CAMPO TIPO APRIVA: passando a «studenti» il blocco coi dati
// dell'Allegato C non c'era nemmeno nel modale (era reso solo se il contratto
// era GIÀ studenti) — si cambiava modello e il PDF nasceva coi puntini.
ok(/id="eStudentiFields"/.test(edit) && /eStudentiFields'\);if\(b\)b\.style\.display/.test(edit),
  'scegliendo «Studenti» i campi corso/università compaiono nello stesso modale');
ok(/const _isStudenti = \(data\.type \|\| _existingContract\.type\) === 'studenti'/.test(upd),
  'la verifica guarda il tipo SCELTO ORA, non quello con cui il contratto è nato');

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
