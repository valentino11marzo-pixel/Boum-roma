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
// (Sprint 1: il tipo vive in cvType, calcolato UNA volta nel modale e messo
//  nel body da cvBody() — lo stesso body del preflight e della conversione.)
ok(/var cvType=\/student\/i\.test\(_lt\)\?'studenti':\/3\\s\*\\\+\\s\*2\/i\.test\(_lt\)\?'3\+2':'transitorio';/.test(cons) && /var b=\{id:id,type:cvType\};/.test(cons),
  'la conversione PASSA il tipo (prima non lo faceva mai) — studenti, 3+2 o transitorio');
ok(/_lt=String\(\(d\.lease\|\|\{\}\)\.type/.test(cons), 'il tipo si deduce dal Tipo scelto sulla proposta, non da un default');
ok(/3\+2 Canone concordato \(Allegato A\)/.test(cons), 'la console pre-accordo OFFRE anche il 3+2');

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
ok(/type: data\.type === 'studenti' \? 'studenti' : data\.type === '3\+2' \? '3\+2' : 'transitorio'/.test(upd), 'updateContract SALVA il tipo (altrimenti il campo sarebbe finto) — anche il 3+2');
ok(/3\+2 canone concordato — Allegato A/.test(edit), 'il modale Modifica offre anche il 3+2 (Allegato A)');
ok(/is32\(env\.contract\) \? buildAllegatoA\(env\)/.test(cpdf), 'il dispatcher manda il 3+2 all\'Allegato A');
ok(leaseType('3+2', {}) === '3+2' && leaseType(undefined, { type: '3+2 Canone concordato (Allegato A)' }) === '3+2' && leaseType(undefined, { type: 'Transitional Lease' }) === 'transitorio',
  'leaseType: il 3+2 esplicito e quello letto dalla proposta; il transitorio resta transitorio');
// IL BUCO CHE IL CAMPO TIPO APRIVA: passando a «studenti» il blocco coi dati
// dell'Allegato C non c'era nemmeno nel modale (era reso solo se il contratto
// era GIÀ studenti) — si cambiava modello e il PDF nasceva coi puntini.
ok(/id="eStudentiFields"/.test(edit) && /eStudentiFields'\);if\(b\)b\.style\.display/.test(edit),
  'scegliendo «Studenti» i campi corso/università compaiono nello stesso modale');
ok(/const _isStudenti = \(data\.type \|\| _existingContract\.type\) === 'studenti'/.test(upd),
  'la verifica guarda il tipo SCELTO ORA, non quello con cui il contratto è nato');

// ── 3. La firma in prima persona ────────────────────────────────────────
// Il pannello ha DUE card (delega del proprietario + mandato del conduttore):
// la finestra copre l'intera funzione, fino a setDelega.
const fo = app.slice(app.indexOf('function openFirmaOra'), app.indexOf('async function setDelega'));
ok(fo.length > 500 && /window\.openFirmaOra/.test(app), 'il pannello 🖊 Firma ora esiste ed è globale');
ok(/tenantSignToken/.test(fo) && /landlordSignToken/.test(fo), 'apre il link VERO di ciascuna parte (firma in presenza)');
ok(/boomOpen\(/.test(fo), 'usa la consegna unica (niente window.open crudo)');
ok(/non si firma mai/.test(fo) && /firma falsa/.test(fo), 'la riga rossa è SCRITTA nel pannello: al posto del conduttore non si firma');
ok(/🖊 Firma ora/.test(app), 'il bottone è sulla riga contratto');

// (la finestra copre setDelega intero: col mandato del proprietario la funzione è cresciuta)
const sd = app.slice(app.indexOf('async function setDelega'), app.indexOf('async function setDelega') + 3600);
ok(/landlordSignature\) return toast\('error'/.test(sd), 'delega bloccata se il locatore ha GIÀ firmato (un atto firmato non si riscrive)');
ok(/landlordDelegate: payload/.test(sd) && /onBehalfOf/.test(sd), 'scrive la delega nello schema che il rail firma già legge');
ok(/logActivity\(on \? 'delega_attivata'/.test(sd), 'la delega lascia traccia nel registro attività');
// il rail di firma la legge davvero: senza, il pannello sarebbe una bugia
ok(/landlordDelegate/.test(src('api/magic-sign/lookup.js')) && /landlordDelegate/.test(src('api/magic-sign/submit.js')),
  'lookup e submit leggono la delega: il documento dirà «per conto di»');
ok(/landlordDelegate/.test(src('sign.html')), 'la pagina di firma mostra la delega al firmatario');

// ── 4. La console VEDE la firma (12/09/2026, il caso Inês) ──────────────
// La console pre-agreement leggeva solo la proposta e nessuno le scriveva
// che il contratto era firmato: il deal restava «paid · 🖊 Reinvia Magic
// Sign» per sempre. Il giro vero (submit → stampa → send-sign onesto) è in
// tests/notify/run.mjs §1f; qui le giunzioni sulla sorgente della console.
const sub = src('api/magic-sign/submit.js');
const ss = src('api/preagreement/send-sign.js');
ok(/preAgreements\/' \+ paId/.test(sub) && /contractSignatureStatus: upd\.signatureStatus/.test(sub), 'submit STAMPA lo stato firma sulla proposta');
ok(/precondition: \{ exists: true \}/.test(sub) && /currentDocument = \{ exists: true \}/.test(src('api/magic-sign/_shared.js')),
  '… solo su una proposta che esiste: mai una proposta fantasma');
const iSigned = ss.indexOf('if (sig.tenantSigned)'), iMail = ss.indexOf('await sendContractSignEmail(');
ok(iSigned > -1 && iMail > -1 && iSigned < iMail, 'send-sign: il check «già firmato» sta PRIMA dell\'email (ordine)');
ok(/alreadySigned: true/.test(ss) && /emailed: false/.test(ss), 'send-sign risponde lo stato invece di rimandare un link morto');
ok(/function watchContract\(/.test(cons) && /collection\('contracts'\)\.doc\(id\)/.test(cons) && /onSnapshot\(take/.test(cons) && /get\(\{source:'server'\}\)\.then\(take\)/.test(cons),
  'la console ascolta il contratto di ogni proposta convertita (realtime + fallback get)');
ok(/if\(d\.contractId\)watchContract\(d\.contractId\)/.test(cons), '… agganciato all\'arrivo dei deal');
ok(/function sigOfContract\(/.test(cons) && /function sigState\(/.test(cons) && /contractSignatureStatus/.test(cons),
  'lo stato si deriva dalle FIRME presenti e ricade sulla stampa della proposta');
const row = cons.slice(cons.indexOf('function paRow('), cons.indexOf('/* filters + search + KPIs */'));
ok(/var sig=sigState\(d\)/.test(row) && /chip signed">✓ firmato/.test(row) && /chip signing">✍ firmato inquilino/.test(row), 'la riga dice chi ha firmato');
const prim = row.slice(row.indexOf("(sig.status==='complete'"), row.indexOf('Reinvia Magic Sign'));
ok(prim.length > 0 && /:\(sig\.tenantSigned\s*\?/.test(prim), '🖊 Reinvia Magic Sign NON compare quando l\'inquilino ha già firmato');
ok(/📥 Contratto firmato/.test(row) && /🖊 Controfirma per delega/.test(row), 'a firma avvenuta: PDF firmato / controfirma per delega al posto dell\'invito');
ok(/function nextStepLine\(/.test(cons) && /L’inquilino ha firmato/.test(cons) && /Contratto firmato da entrambi/.test(cons), 'il prossimo passo è scritto dal punto in cui il deal È');
ok(/data-f="signed"/.test(cons) && /FILTER==='signed'\)return sigState\(d\)\.status==='complete'/.test(cons), 'filtro Firmati sulle firme, non sull\'etichetta');
ok(/j\.alreadySigned/.test(cons) && /ha già firmato/.test(cons), 'sendSign() dice «ha già firmato» invece di ✓ Inviato');
const fasc = cons.slice(cons.indexOf('window.fascicoloPA'), cons.indexOf('DOSSIER_SLOTS.forEach'));
ok(/signedOk=sigF\.status==='complete'/.test(fasc) && !/\(contract\.signingCertificateUrl\|\|contract\.generatedPDF\)\|\|null/.test(fasc),
  'Fascicolo ARPE: «Contratto firmato» spuntato SOLO a firme complete, non sul PDF generato');

// ── 5. LE SCRITTURE DOPO LA RISPOSTA SI PERDONO (13/09/2026) ──────────
// Su Vercel la funzione può essere congelata appena `res.json` parte: una
// fsPatch lanciata senza await un attimo prima muore in volo. Il backup di
// produzione lo dimostrava: la proposta di Inês senza signSentAt dopo un 🖊
// andato a buon fine, quella di Léa senza contractId con il contratto firmato
// da un mese. Regola di CLASSE, verificata scandagliando i tre rail: nessuna
// scrittura di stato o ping può stare a inizio istruzione senza `await`.
import { readdirSync, statSync } from 'node:fs';
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((n) => {
  const p = join(dir, n);
  return statSync(join(ROOT, p)).isDirectory() ? walk(p) : (n.endsWith('.js') ? [p] : []);
});
const railFiles = ['api/preagreement', 'api/magic-sign', 'api/sign'].flatMap(walk);
const loose = [];
for (const f of railFiles) {
  src(f).split('\n').forEach((line, i) => {
    if (/^\s*(fsPatch|fsCreate|commitWrites|logActivity|tgSend|tgNotify)\(/.test(line)) loose.push(`${f}:${i + 1}`);
  });
}
ok(railFiles.length > 20, 'la scansione copre i tre rail (preagreement, magic-sign, sign)');
ok(loose.length === 0, 'nessuna scrittura/ping fire-and-forget a inizio istruzione nei rail' + (loose.length ? ' — ' + loose.join(', ') : ''));
ok(/async function backlinkPa\(/.test(conv) && /await backlinkPa\(\{ paId, pa, contractId, tenantSignToken: c\.tenantSignToken/.test(conv),
  'convert: il ramo «contratto esiste già» ricuce il back-link della proposta orfana (atteso)');
ok(/match \/viewings\/\{x\}/.test(src('firestore.rules')), 'firestore.rules: `viewings` ha una regola (prima: default-deny → 403 anche per l\'admin)');
ok(/fsList\('viewingRequests', \{ limit: 600 \}\)/.test(src('api/leads/_richiamo.js')) && /fsList\('viewingRequests', \{ limit: 2000 \}\)/.test(src('api/homie/miniera.js')),
  'Richiamo e Miniera leggono la collection VERA delle visite (viewingRequests)');
ok(/sweepFinalizeDuplicates/.test(src('api/reminder-cron.js')) && /getUTCHours\(\) === 4/.test(src('api/reminder-cron.js')),
  'la bonifica delle scadenze doppie gira dal cron, una volta al giorno');

// ── 6. La console si ripara da sola e dice i binari morti ─────────────
ok(/function contractIdOf\(/.test(cons) && /CONTRACTS\['pa_'\+d\.id\]/.test(cons), 'contractIdOf: il contratto dichiarato, o quello adottato da contracts/pa_<id>');
ok(/watchContract\('pa_'\+d\.id,d\.id\)/.test(cons) && /update\(\{contractId:id,contractAdoptedAt/.test(cons), 'proposta senza contractId: si guarda contracts/pa_<id> e, se c\'è, si riscrive il back-link');
ok(/data-f="nocontract"/.test(cons) && /FILTER==='nocontract'\)return paidOf\(d\)&&!contractIdOf\(d\)/.test(cons), 'filtro «Da contratto»: i pagati senza contratto, il binario morto reso visibile');
ok(/contratto NON ancora creato nel sistema/.test(cons), 'la riga del pagato senza contratto lo DICE, con la mossa');
ok(/!gotMoney&&!cid&&st!=='paid'\?'<button class="pbtn warn" onclick="revokePA/.test(cons) && /ACCETTATA \(non pagata\)/.test(cons), 'Revoca anche su accettato non pagato (con conferma), mai su pagato o contrattualizzato');

// ── 7. Sprint 1 — le giunzioni sulla sorgente ──────────────────────────
// 1.1 l'immobile dalla proposta, 1.2 la guardia sovrapposizioni, 1.3 «per
// mandato» esplicito, 2.3 il cliente firma dalla sua pagina, 3.3 il preflight.
const convS = src('api/preagreement/convert.js');
ok(/export function propertyFromPa\(/.test(convS) && /export const propertyIdForPa = \(paId\) => 'prop_pa_' \+ paId;/.test(convS) && /createProperty === true && canCreate/.test(convS),
  '1.1 convert: l\'immobile nasce dalla proposta con id deterministico, solo su richiesta esplicita (createProperty) e solo con un indirizzo');
ok(/error: 'no_property', canCreate/.test(convS) && /\.\.\.\(propertyId \? \{ propertyId \} : \{\}\)/.test(convS),
  '1.1 convert: no_property dichiara canCreate; il back-link riporta propertyId sulla proposta');
ok(/'__new__'/.test(cons) && /Crea l’immobile da questa proposta/.test(cons) && /b\.createProperty=true/.test(cons) && /j\.propertyCreated\?/.test(cons),
  '1.1 console: l\'opzione «＋ Crea l’immobile da questa proposta» nel modale → createProperty:true, e il risultato lo dice');
ok(!/crealo prima da Immobili/.test(cons) && /lo crei dalla proposta con un tap/.test(cons) && /lo crea dalla proposta con un tap/.test(cons),
  '1.1 console: nessuna riga rimanda più a «crealo prima da Immobili»');
ok(/export function overlapConflict\(/.test(convS)
  && convS.indexOf("existing = await fsGet('contracts/' + contractId)") < convS.indexOf('const overlap = await findOverlap(')
  && convS.indexOf('const overlap = await findOverlap(') < convS.indexOf("await fsCreate('contracts', contract, contractId);")
  && /if \(overlap && force !== true && !dryRun\) return \{ ok: false, error: 'overlap', overlap \};/.test(convS),
  '1.2 convert: la guardia sovrapposizioni DOPO il riconoscimento dell\'orfana (un contratto vicino non può bloccare il SUO) e PRIMA della creazione, scavalcabile solo con force:true, mai in dryRun');
ok(/out\.error === 'overlap' \? 409/.test(convS) && /out\.error === 'overlap' \? 409/.test(src('api/preagreement/send-sign.js')) && /contract\.overlap_blocked/.test(src('api/preagreement/_auto.js')),
  '1.2: 409 overlap dalla porta HTTP e da send-sign; il contratto automatico bloccato AVVISA (agentNotifications)');
ok(/^\s+unit,$/m.test(convS) && /const unit = clip\(\(pa\.property \|\| \{\}\)\.unit, 40\) \|\| '';/.test(convS), '1.2 convert: l\'interno viaggia sul contratto (due stanze si distinguono)');
ok(/cvForce/.test(cons) && /body\.force=true/.test(cons) && /j\.error==='overlap'/.test(cons) && /Crea comunque/.test(cons),
  '1.2 console: la sovrapposizione si mostra, e «Crea comunque» è una spunta esplicita → force:true');
ok(/const asDelegate = body\.asDelegate === true;/.test(src('api/magic-sign/submit.js')), '1.3 submit: «per mandato» solo con asDelegate:true nel body');
ok(/&delegate=1/.test(app) && /qs\.get\('delegate'\) === '1'/.test(src('sign.html')), '1.3: il flag nasce dal link del pannello Firma ora e sign.html lo legge dall\'URL');
const lookS = src('api/preagreement/lookup.js');
ok(/export async function contractStatus\(/.test(lookS) && /const unlocked = paidOnRecord\(data\) \|\| dueAtSigning\(data\) === 0;/.test(lookS)
  && /tenantSignUrl: \(unlocked && !tenantSigned && c\.tenantSignToken\)/.test(lookS) && !/landlordSignToken/.test(lookS),
  '2.3 lookup: il link di firma del conduttore SOLO a soldi ricevuti (o dovuto zero) e SOLO se non ha firmato; il token del locatore non esce mai');
ok(/id="ctcard"/.test(src('pre-agreement.html')) && /Sign your contract now/.test(src('pre-agreement.html')), '2.3 pagina: la card «Sign your contract now» esiste');
ok(/dryRun: b\.dryRun === true/.test(convS) && convS.indexOf('if (dryRun) {') < convS.indexOf("await fsCreate('contracts', contract, contractId);") && /if \(!dryRun\) try \{/.test(convS),
  '3.3 convert: dryRun esce PRIMA di ogni scrittura (profilo, contratto) e dopo la costruzione del contratto');
ok(/function preflightOf\(/.test(convS) && /FIELDS\.completeness\(ctx, \{ level: 'registration' \}\)/.test(convS) && /FIELDS\.hydrateParties\(contract, tenantUser/.test(convS),
  '3.3 convert: il preflight passa dal dizionario (completeness + hydrateParties), non da una lista a mano');
ok(/async function signPreflight\(d,tok\)/.test(cons) && cons.indexOf('var pre=d?await signPreflight(d,tok):null;') < cons.indexOf("fetch('/api/preagreement/send-sign'")
  && /dryRun:true,propertyId:d\.propertyId/.test(cons) && /fetch\('\/api\/profile\/link'/.test(cons) && /if\(pre&&pre\.stop\)/.test(cons),
  '3.3 console 🖊: il preflight (dryRun senza contratto, profile/link col contratto) PRIMA di send-sign, e l\'operatore può fermarsi');
ok(/window\.cvPreflight=async function/.test(cons) && /onchange="cvPreflight\(\)"/.test(cons) && /Object\.assign\(cvBody\(\),\{dryRun:true\}\)/.test(cons) && /function preflightLines\(j\)/.test(cons),
  '3.3 console → Contratto: il preflight al cambio immobile, in parole (preflightLines), prima del tap');
ok(/function ask\(msg\)\{return \(typeof confirm==='function'\)\?confirm\(msg\):true;\}/.test(cons), 'console: la conferma è guardata (in Node non esiste confirm)');

// ── 8. I PUNTINI (13/09/2026) — solo dove il dato è dovuto, e il dato arriva ──
ok(/const NONE = '—';/.test(cpdf) && /\$\{propScala \? ', scala ' \+ propScala : ''\}/.test(cpdf) && /consegnaStato \|\| 'quanto risulta dal verbale di consegna sottoscritto/.test(cpdf) && /property\.rooms\)\s+\|\| dot/.test(cpdf) && /property\.accessories\) \|\| NONE/.test(cpdf),
  'puntini: scala omessa se ignota, accessori/tabelle «—», consegna che rinvia al verbale — i vani (dovuti) restano puntini');
const cpS = src('api/sign/_contractpdf.js');
ok(/export async function resolveLandlord\(/.test(cpS) && /landlord = await resolveLandlord\(contract, property\)/.test(cpS) && /!\(opts && opts\.force\) && contract\.generatedPDF/.test(cpS)
  && cpS.indexOf('opts && opts.force') < cpS.indexOf('if (hasAnySignature(contract)) return contract.generatedPDF || null;'),
  'puntini: il PDF risolve il locatore da users+landlords (anche per email) e accetta force — la firma viva vince sempre (guardia dopo il force)');
const ps = src('api/profile/submit.js');
ok(/if \(!hasAnySignature\(contract\)\) \{/.test(ps) && /ensureContractPdf\(contractId, null, \{ force: true \}\)/.test(ps) && /pdfRegenerated/.test(ps), 'puntini: la Scheda rigenera il PDF quando nessuno ha firmato');
const ms = src('api/magic-sign/submit.js');
ok(ms.indexOf("if (role === 'tenant' && !hasAnySignature(contract)) {") < ms.indexOf('// ── 3. Re-read FRESH') && /ensureContractPdf\(contractId, \{ \.\.\.contract, \.\.\.idOnly \}, \{ force: true \}\)/.test(ms) && !/idOnly\['tenantSignature'\]/.test(ms),
  'puntini: prima della PRIMA firma il PDF si rifà con la SOLA identità dichiarata, poi si rilegge (precondizione intatta)');
const fin = src('api/sign/_finalize.js');
ok(/identityLines\('tenant', c\)/.test(fin) && /identityLines\('landlord', c\)/.test(fin) && /import \{ wa \} from '\.\.\/_pdfbrand\.js';/.test(fin), 'puntini: la pagina delle firme stampa nascita/residenza/documento dichiarati, WinAnsi-safe');
const ss8 = src('api/preagreement/send-sign.js');
ok(ss8.indexOf('await askLandlordScheda(') < ss8.indexOf('await sendContractSignEmail(') && /landlordAsked: landlordAsk\.asked === true/.test(ss8) && /landlordAsked\?' · dati chiesti al proprietario'/.test(cons),
  'puntini: a 🖊 la Scheda del locatore parte con l\'invito, la risposta e la console lo dicono');
const ask = src('api/preagreement/_askscheda.js');
ok(/if \(contract\.landlordSignature\) return \{ asked: false, why: 'signed' \};/.test(ask) && /if \(!missing\.length\) return \{ asked: false, why: 'complete' \};/.test(ask) && /why: 'no_email'/.test(ask) && /FIELDS\.missingMessage\('landlord', missing/.test(ask),
  'puntini: la richiesta al locatore NON parte se ha firmato, se non manca niente o senza email; il testo è quello del dizionario');
ok(/sel\('tIdDocType','ID document type',''\)/.test(src('pre-agreement.html')) && /idDocType: docCode\(/.test(src('api/preagreement/submit.js')) && /docType: t\.idDocType \|\| ''/.test(convS) && /transitionalDocs: uploads\.some\(u => u && u\.kind === 'extra'\)/.test(convS),
  'puntini: tipo di documento e attestazione dell\'esigenza viaggiano dalla proposta al contratto');

console.log(`\n${fail ? '✗' : '✓'} firma: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
