// tests/oggi/run.mjs — OGGI: la coda delle decisioni dice il vero.
//
// Tre promesse, tre modi di romperle in silenzio:
//  1. il PUNTEGGIO — se l'ordine sbaglia, l'operatore decide le cose
//     sbagliate per prime e la pagina è peggio di niente;
//  2. le AZIONI — ogni {fn} dichiarata dal motore deve esistere in
//     portal-app.js (la disciplina del Prontuario): un bottone che non fa
//     niente insegna a non fidarsi della coda;
//  3. il CABLAGGIO — motore caricato PRIMA dell'uso, router, sidebar,
//     landing admin, service worker.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const E = require(join(ROOT, 'js', 'oggi-engine.js'));
const app = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');
const html = readFileSync(join(ROOT, 'portal.html'), 'utf8');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const engineSource = readFileSync(join(ROOT, 'js/oggi-engine.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

const NOW = '2026-08-19T10:00:00Z';
const S = {
  payments: [
    { id: 'p1', status: 'pending', amount: 900, dueDate: '2026-08-01', month: 'Ago 2026', contractId: 'c1' },
    { id: 'p2', status: 'pending', amount: 2200, dueDate: '2026-07-05', month: 'Lug 2026', contractId: 'c2' },
    { id: 'p3', status: 'paid', amount: 1450, paidDate: '2026-08-02' },
    { id: 'p4', status: 'pending', amount: 980, dueDate: '2026-08-24' },
  ],
  contracts: [
    { id: 'c1', status: 'active', propertyId: 'x1', tenantId: 't1', endDate: '2027-08-31' },
    { id: 'c2', status: 'active', propertyId: 'x2', tenantId: 't2', endDate: '2026-09-10', signatureStatus: 'partial' },
    // ── Promemoria RLI stimati: firma certa e decorrenza posteriore ──
    // firmato 3gg fa: c'e' tempo, ma la pratica esiste e si vede
    { id: 'c3', status: 'active', propertyId: 'x1', tenantId: 't1', signatureStatus: 'complete', fullySignedAt: '2026-08-16T10:00:00Z', startDate: '2026-08-31' },
    // firmato 45gg fa e mai registrato: termine SFORATO, ogni giorno costa
    { id: 'c4', status: 'active', propertyId: 'x2', tenantId: 't2', signatureStatus: 'complete', fullySignedAt: '2026-07-05T10:00:00Z', startDate: '2026-08-31' },
    // mandato ad ASPI ieri: sta lavorando lui, non e' una decisione
    { id: 'c5', status: 'active', propertyId: 'x1', tenantId: 't1', signatureStatus: 'complete', fullySignedAt: '2026-08-14T10:00:00Z', startDate: '2026-08-31', aspiRequestedAt: '2026-08-18T09:00:00Z', aspiRequestKind: 'completo' },
    // mandato 10gg fa e ancora niente: sollecito, con l'azione che CHIUDE il giro
    { id: 'c6', status: 'active', propertyId: 'x2', tenantId: 't2', signatureStatus: 'complete', fullySignedAt: '2026-08-07T10:00:00Z', startDate: '2026-08-31', aspiRequestedAt: '2026-08-09T10:00:00Z', aspiRequestKind: 'registrazione' },
    // gia' registrato: fuori dalla coda per sempre
    { id: 'c7', status: 'active', propertyId: 'x1', tenantId: 't1', signatureStatus: 'complete', fullySignedAt: '2026-07-01', rliRegisteredAt: '2026-07-20' },
  ],
  users: [{ id: 't1', name: 'Emma' }, { id: 't2', name: 'Lucas' }],
  properties: [{ id: 'x1', name: 'Cavour' }, { id: 'x2', name: 'Pigneto' }],
  viewingRequests: [{ id: 'v1', status: 'pending', clientName: 'Sara', propertyName: 'Prati', createdAt: '2026-08-18T09:00:00Z' }],
  leads: [
    { id: 'l1', status: 'new', grade: 'A', name: 'Marco', createdAt: '2026-08-18T20:00:00Z' },
    { id: 'l2', status: 'new', grade: 'C', name: 'Tizio', createdAt: '2026-08-10' },
    { id: 'l3', status: 'contacted', grade: 'A', name: 'GiàSentito' },
  ],
  maintenance: [{ id: 'm1', priority: 'urgent', status: 'open', title: 'Caldaia', propertyId: 'x1', createdAt: '2026-08-17' }],
  actionQueue: [{ id: 'q1', status: 'pending', title: 'Risposta AI a Marco', createdAt: '2026-08-19T08:00:00Z' }],
  preAgreements: [
    // pagata (prova sui campi, non sull'etichetta — la lezione paidOnRecord) e senza contratto: LA più cara da rimandare
    { id: 'pa1', status: 'accepted', paidEur: 2400, paidAt: '2026-08-17T10:00:00Z', ref: 'BOOM-AAA1', tenant: { fullName: 'Julia K' }, property: { address: 'Via Levico 7' } },
    // accettata, niente incasso, niente contratto
    { id: 'pa2', status: 'accepted', acceptedAt: '2026-08-18T09:00:00Z', ref: 'BOOM-BBB2', tenant: { fullName: 'Tom H' }, property: { address: 'Via Cavour 3' } },
    // già convertita: NON è più una decisione
    { id: 'pa3', status: 'paid', paidAt: '2026-08-10', contractId: 'c9', ref: 'BOOM-CCC3' },
    // revocata: fuori
    { id: 'pa4', status: 'revoked', ref: 'BOOM-DDD4' },
    // riserva: da sciogliere
    { id: 'pa5', status: 'reserve', acceptedAt: '2026-08-16', ref: 'BOOM-EEE5', tenant: { fullName: 'Ana P' } },
    // solo inviata: nessuna decisione (sta al cliente)
    { id: 'pa6', status: 'sent', ref: 'BOOM-FFF6' },
  ],
};
const r = E.build(S, NOW);
const ids = r.decisions.map((d) => d.id);

// ── 1. Il contenuto: chi DEVE esserci c'è, chi non deve NO ─────────────
ok(ids.includes('aq_q1'), 'una proposta AI pendente entra in coda');
ok(ids.includes('vw_v1'), 'una visita da confermare entra in coda');
ok(ids.includes('pay_all') && ids.includes('pay_p1') && ids.includes('pay_p2'), 'i ritardi entrano: quadro + peggiori per nome');
ok(!ids.includes('pay_p4'), 'una rata NON scaduta non è una decisione');
ok(ids.includes('lead_l1') && !ids.includes('lead_l3'), 'lead nuovi sì, già contattati no');
ok(ids.includes('mnt_m1'), 'la manutenzione urgente entra');
ok(ids.includes('sig_c2'), 'la firma a metà entra');
ok(ids.includes('exp_c2'), 'il contratto in scadenza ≤30gg entra');
ok(ids.includes('pa_pa1') && ids.includes('pa_pa2'), 'le proposte accettate/pagate senza contratto entrano');
ok(!ids.includes('pa_pa3'), 'una proposta già convertita (contractId) NON è più una decisione');
ok(!ids.includes('pa_pa4') && !ids.includes('pa_pa6'), 'revocate e solo-inviate restano fuori (la palla è del cliente)');
ok(ids.includes('par_pa5'), 'la riserva da sciogliere entra');
const pa1 = r.decisions.find((d) => d.id === 'pa_pa1');
ok(pa1 && /Incassata/.test(pa1.title) && /2\.400|2400/.test(pa1.sub), 'la pagata dice INCASSATA e mostra i soldi veri');
ok(pa1 && pa1.actions[0].args[0] === 'BOOM-AAA1', "l'azione porta il protocollo: la console si apre già filtrata sul deal");

// ── 2. L'ordine è il costo del ritardo ─────────────────────────────────
const pos = (id) => ids.indexOf(id);
ok(pos('aq_q1') < pos('lead_l2'), 'una risposta AI ferma batte un lead C');
ok(pos('vw_v1') < pos('sig_c2'), 'una visita da confermare batte una firma a metà');
ok(pos('pay_p2') < pos('pay_p1'), 'tra i ritardi, giorni×importo comanda (45gg×2200 prima di 18gg×900)');
ok(pos('pa_pa1') < pos('pa_pa2'), 'una proposta INCASSATA batte una solo accettata');
ok(pos('pa_pa1') < pos('sig_c2'), 'soldi incassati senza contratto battono una firma a metà');
ok(r.decisions.every((d, i) => i === 0 || r.decisions[i - 1].score >= d.score), 'la lista è davvero ordinata per punteggio');

// ── 2b. Registrazioni RLI: promemoria stimato da verificare sull'atto ──
// Il punteggio sale con l'età della base verificabile; non certifica un
// ritardo fiscale. L'invio recente resta silenzioso se c'è ancora margine.
ok(ids.includes('rli_c3'), 'un contratto firmato e non registrato entra in coda');
ok(ids.includes('rli_c4'), 'un contratto oltre i 30gg entra (e resta finche\' non e\' registrato)');
ok(!ids.includes('rli_c5'), 'appena mandato ad ASPI: SILENZIO — sta lavorando il referente, non e\' una decisione');
ok(ids.includes('rli_c6'), 'mandato da 10gg e ancora niente: torna come sollecito');
ok(!ids.includes('rli_c7'), 'gia\' registrato: fuori dalla coda');
ok(!ids.includes('rli_c2'), 'una firma a META\' non e\' da registrare (si registra un atto perfezionato)');
const rli3 = r.decisions.find((d) => d.id === 'rli_c3');
const rli4 = r.decisions.find((d) => d.id === 'rli_c4');
const rli6 = r.decisions.find((d) => d.id === 'rli_c6');
ok(/Termine stimato tra 27gg · verifica stipula e decorrenza/.test(rli3.sub), 'il promemoria mantiene 27 giorni e dichiara la stima da verificare');
ok(/Termine stimato superato da 15gg · verifica stipula e decorrenza/.test(rli4.sub) && rli4.tint === 'red', 'il promemoria oltre termine mantiene 15 giorni e dichiara la stima');
ok(!/RLI SCADUTA|RLI scade/.test(rli3.sub + rli4.sub), 'nessuna certificazione di una scadenza fiscale dalla sola firma salvata');
ok(rli4.score > 90 && pos('rli_c4') < pos('pay_all'), 'una RLI scaduta scavalca perfino il quadro degli incassi in ritardo');
ok(rli3.score < 50 && pos('rli_c3') > pos('rli_c4'), 'una appena firmata dorme in fondo: c\'e\' tempo, non e\' un allarme');
ok(rli3.actions[0].fn === 'openAspi' && rli3.actions[0].primary, 'da registrare → il tap primario e\' l\'invio ad ASPI');
ok(rli6.actions[0].fn === 'markRliRegistered', 'in attesa → il tap primario CHIUDE il giro (conferma la registrazione)');
ok(/In attesa di ASPI da 10gg/.test(rli6.title) && /solo registrazione/.test(rli6.sub), 'il sollecito dice da quanto aspetta e cosa e\' stato chiesto');

// ── 2c. PA: backlink incompleto non significa contratto mancante ──────
const proposal = { id: 'proposal-1', ref: 'BOOM-P1', status: 'paid', paidEur: 1800 };
const paSignal = (contracts, extraProposals = [], overrides = {}, engine = E) => engine.build({
  contracts, preAgreements: [{ ...proposal, ...overrides }, ...extraProposals]
}, NOW).decisions.find((d) => d.id === 'pa_proposal-1');
ok(!paSignal([{ id: 'contract-1', preAgreementId: 'proposal-1' }]), 'PA: relazione reverse per ID certa, nessun falso contratto mancante');
ok(!paSignal([{ id: 'contract-1', preAgreementRef: 'BOOM-P1' }]), 'PA: riferimento reverse unico collega il contratto');
ok(!paSignal([{ id: 'pa_proposal-1' }]), 'PA: ID deterministico del convert riconosce il contratto orfano');
ok(!paSignal([], [], { contractId: 'contract-not-loaded' }), 'PA: backlink esplicito conserva la relazione anche fuori snapshot');
const noLink = paSignal([{ id: 'unrelated', propertyId: 'same-home', tenantName: 'same-name' }]);
ok(noLink?.reason === 'proposal_contract_missing' && !noLink.needsVerification, 'PA: nessuna associazione da nome o immobile');
const multipleContracts = [{ id: 'contract-1', preAgreementId: 'proposal-1' }, { id: 'contract-2', preAgreementRef: 'BOOM-P1' }];
const multiple = paSignal(multipleContracts);
ok(multiple?.needsVerification && multiple.reason === 'proposal_contract_ambiguous', 'PA: due contratti reverse restano una verifica visibile');
ok(multiple?.contractIds.length === 2 && multiple.practiceRef === 'preAgreements/proposal-1' && !multiple.contractId,
  'PA: ambiguità espone entrambe le identità senza inventare un contratto canonico');
ok(/verificare/.test(multiple?.title || '') && !/manca il contratto/.test(multiple?.title || '') && /1\.800|1800/.test(multiple?.sub || ''),
  'PA: conflitto non dichiara assenza e mantiene visibile il denaro');
const conflictRows = [{ id: 'contract-1', preAgreementRef: 'BOOM-P1', preAgreementId: 'other-proposal' }];
ok(paSignal(conflictRows)?.reason === 'proposal_contract_conflict', 'PA: ref coincidente non supera un ID reverse contraddittorio');
ok(paSignal([{ id: 'contract-1', preAgreementId: 'proposal-1', preAgreementRef: 'BOOM-OTHER' }])?.needsVerification,
  'PA: ID reverse coincidente non supera un ref contraddittorio');
ok(paSignal([{ id: 'pa_proposal-1', preAgreementId: 'other-proposal' }])?.needsVerification,
  'PA: ID deterministico non supera una relazione contraddittoria');
ok(paSignal([{ id: 'contract-2', preAgreementId: 'proposal-1' }], [], { contractId: 'contract-1' })?.reason === 'proposal_contract_conflict',
  'PA: backlink e reverse diversi restano visibili anche se il backlink non è nello snapshot');
ok(paSignal([{ id: 'contract-1', preAgreementId: 'other-proposal' }], [], { contractId: 'contract-1' })?.needsVerification,
  'PA: backlink verso un contratto assegnato a un’altra proposta non sopprime il conflitto');
ok(paSignal([{ id: 'contract-1', preAgreementRef: 'BOOM-P1' }], [{ id: 'proposal-2', ref: 'BOOM-P1' }])?.reason === 'proposal_contract_ambiguous',
  'PA: ref condiviso da due proposte non è una relazione certa');
ok(paSignal([], [{ id: 'proposal-2', contractId: 'contract-1' }], { contractId: 'contract-1' })?.needsVerification,
  'PA: due proposte che rivendicano lo stesso backlink non vengono nascoste');

// ── 2d. RLI: dati incompleti e storico sono verifiche, mai date inventate ──
const signedContract = { id: 'registration-1', status: 'active', signatureStatus: 'complete', fullySignedAt: '2026-08-16T10:00:00Z', startDate: '2026-08-31' };
const rliSignal = (overrides, engine = E) => engine.build({ contracts: [{ ...signedContract, ...overrides }] }, NOW)
  .decisions.find((d) => d.id === 'rli_registration-1');
const isArchive = (d) => d?.kind === 'archivio' && d.needsVerification === true &&
  !('deadlineAt' in d) && !('daysLeft' in d) && !/Termine stimato|SCADUTA|RLI tra|scade OGGI/.test(d.sub) &&
  d.actions.length === 1 && d.actions[0].fn === 'viewContract';
const noSignatureDate = { fullySignedAt: undefined, startDate: '2020-01-01' };
const noDateSignal = rliSignal(noSignatureDate);
ok(isArchive(noDateSignal) && noDateSignal.reason === 'signature_date_missing', 'RLI: startDate non sostituisce una data firma assente');
ok(noDateSignal?.practiceRef === 'contracts/registration-1' && noDateSignal.contractId === 'registration-1',
  'RLI: verifica archivio ha un percorso certo al contratto');
for (const value of ['not-a-date', '2026-02-30', '2026-08-20T10:00:00Z']) {
  const d = rliSignal({ fullySignedAt: value });
  ok(isArchive(d) && d.reason === 'signature_date_invalid', `RLI: firma ${value} non produce una scadenza`);
}
for (const status of ['terminated', 'expired']) {
  const d = rliSignal({ status, aspiRequestedAt: '2026-08-18T10:00:00Z' });
  ok(isArchive(d) && d.reason === 'contract_historical', `RLI: ${status} resta visibile in archivio anche appena inviato ad ASPI`);
}
ok(isArchive(rliSignal({ endDate: '2026-08-18' })), 'RLI: contratto attivo con fine passata richiede verifica storico');
ok(isArchive(rliSignal({ endDate: '2026-02-30' })), 'RLI: fine impossibile richiede verifica lifecycle');
ok(rliSignal({ endDate: '2026-08-19' })?.kind === 'registrazioni', 'RLI: la data di fine odierna non è già storico');
for (const status of [undefined, 'draft', 'unknown']) {
  const d = rliSignal({ status });
  ok(isArchive(d) && d.reason === 'contract_lifecycle_unverified', `RLI: lifecycle ${status} non diventa implicitamente attivo`);
}
ok(!rliSignal({ status: 'terminated', registrationStatus: 'registered' }), 'RLI: storico con registrazione documentata non genera lavoro');
ok(!rliSignal({ signatureStatus: 'partial' }), 'RLI: contratto non completamente firmato resta fuori dalle registrazioni');
ok(rliSignal({ fullySignedAt: undefined, signatureDate: '2026-08-16T10:00:00Z' })?.daysLeft === 27,
  'RLI: signatureDate esplicita già prevista dallo schema è utilizzabile');
const partyDates = { fullySignedAt: undefined, tenantSignedAt: '2026-08-14T10:00:00Z', landlordSignedAt: '2026-08-15T10:00:00Z',
  coTenants: [{ name: 'Co-tenant', signedAt: '2026-08-16T10:00:00Z' }] };
ok(rliSignal(partyDates)?.daysLeft === 27, 'RLI: ultima firma include cointestatari come il finalizzatore');
ok(isArchive(rliSignal({ ...partyDates, fullySignedAt: 'invalid' })), 'RLI: una data finale esplicita non valida non viene riparata per inferenza');
ok(isArchive(rliSignal({ ...partyDates, coTenants: [{ name: 'Co-tenant', signedAt: 'invalid' }] })), 'RLI: firma legacy non valida non permette di scegliere una data precedente');
for (const missingParty of [{ landlordSignedAt: undefined }, { tenantSignedAt: undefined }, { coTenants: [{ name: 'Co-tenant' }] }]) {
  const d = rliSignal({ ...partyDates, ...missingParty });
  ok(isArchive(d) && d.reason === 'signature_date_missing', 'RLI: senza data finale tutte le parti devono avere la data di firma');
}
ok(rliSignal({ ...partyDates, coTenants: [{ name: '' }, null] })?.daysLeft === 26,
  'RLI: righe co-conduttore vuote non diventano firmatari mancanti');
const currentRli = rliSignal({ fullySignedAt: '2020-01-01' });
ok(currentRli?.kind === 'registrazioni' && currentRli.daysLeft < 0, 'RLI: sola età non archivia un contratto ancora attivo senza fine passata');
ok(rli3.deadlineAt === '2026-09-15T10:00:00.000Z' && rli3.daysLeft === 27 && rli3.deadlineEstimated === true && rli3.deadlineBasis === 'signature',
  'RLI: metadati esportano la medesima stima senza un secondo calcolo UI');
const earlierStart = rliSignal({ startDate: '2026-08-01' });
ok(earlierStart?.kind === 'registrazioni' && earlierStart.deadlineBasis === 'startDate' && earlierStart.deadlineAt === '2026-08-31T00:00:00.000Z'
  && earlierStart.daysLeft === 12 && earlierStart.deadlineEstimated === true, 'RLI: decorrenza anteriore anticipa il promemoria a 12 giorni');
ok(/Termine stimato tra 12gg · verifica stipula e decorrenza/.test(earlierStart?.sub || ''), 'RLI: anche la decorrenza anteriore produce una stima esplicita');
const alreadyLate = rliSignal({ startDate: '2026-07-01', aspiRequestedAt: '2026-08-18T09:00:00Z' });
ok(alreadyLate?.daysLeft < 0 && alreadyLate.tint === 'red' && alreadyLate.deadlineBasis === 'startDate',
  'RLI: decorrenza anteriore già oltre termine non scompare dietro invio ASPI recente');
for (const startDate of [undefined, 'invalid', '2026-02-30']) {
  const d = rliSignal({ startDate });
  ok(isArchive(d) && d.verificationReasons.includes(startDate ? 'contract_start_date_invalid' : 'contract_start_date_missing'),
    `RLI: decorrenza ${startDate} richiede verifica senza scadenza finta`);
}
const bothProblems = rliSignal({ status: 'terminated', fullySignedAt: undefined });
ok(isArchive(bothProblems) && bothProblems.verificationReasons.includes('contract_historical') && bothProblems.verificationReasons.includes('signature_date_missing'),
  'RLI: storico e data assente conservano entrambe le ragioni');
const immutable = { contracts: [{ ...signedContract, status: 'terminated' }], preAgreements: [{ ...proposal }] };
const before = JSON.stringify(immutable);
E.build(immutable, NOW);
ok(JSON.stringify(immutable) === before, 'le verifiche PA/RLI non chiudono né modificano record');

// Mutazioni mirate: queste prove devono fallire se torna il falso allarme.
const mutation = (name, from, to, detects) => {
  const changed = engineSource.replace(from, to);
  if (changed === engineSource) { ok(false, `mutazione applicabile: ${name}`); return; }
  const sandbox = { module: { exports: {} } };
  runInNewContext(changed, sandbox);
  ok(detects(sandbox.module.exports), `mutante respinto: ${name}`);
};
mutation('ignora le relazioni reverse', 'if (link.linked) return;', 'if (pa.contractId) return;',
  (m) => !!paSignal([{ id: 'contract-1', preAgreementId: 'proposal-1' }], [], {}, m));
mutation('nasconde contraddizioni reverse', '!conflict && !ambiguous &&', '!ambiguous &&',
  (m) => !paSignal(conflictRows, [], {}, m));
mutation('nasconde più contratti', 'linked: !conflict && !ambiguous && (!!forward || candidates.length === 1)', 'linked: !conflict && (!!forward || candidates.length > 0)',
  (m) => !paSignal(multipleContracts, [], {}, m));
mutation('inventa la firma da startDate', 'const explicit = c.fullySignedAt || c.signatureDate;', 'const explicit = c.fullySignedAt || c.signatureDate || c.startDate;',
  (m) => !isArchive(rliSignal(noSignatureDate, m)));
mutation('porta storico nel lavoro corrente', 'if (evidence.reasons.length) {', "if (evidence.reasons.some((reason) => reason !== 'contract_historical')) {",
  (m) => !isArchive(rliSignal({ status: 'terminated' }, m)));
mutation('scarta silenziosamente le verifiche', 'if (evidence.reasons.length) {', 'if (evidence.reasons.length) { return;',
  (m) => !rliSignal(noSignatureDate, m));
mutation('data da una sola parte', 'c.tenantSignedAt, c.landlordSignedAt,', 'c.tenantSignedAt,',
  (m) => !isArchive(rliSignal({ fullySignedAt: undefined, tenantSignedAt: '2026-08-16T10:00:00Z' }, m)));
mutation('ignora decorrenza anteriore', 'basisAt: startsEarlier ? startAt : signedAt', 'basisAt: signedAt',
  (m) => rliSignal({ startDate: '2026-08-01' }, m)?.daysLeft !== 12);

// ── 3. Il polso dei soldi fa i conti giusti ────────────────────────────
ok(r.cash.paidMonth === 1450, `incassato mese = 1450 (trovato ${r.cash.paidMonth})`);
ok(r.cash.overdueTotal === 3100 && r.cash.overdueCount === 2, 'ritardi: totale e conteggio esatti');
ok(r.cash.dueMonth === 900 + 980, 'in arrivo nel mese = rate pending con scadenza nel mese');
ok(r.cash.next7 === 980, 'prossimi 7 giorni = solo la rata del 24');

// ── 3b. La lingua del portale: 'overdue' e' 'pending' non pagato ───────
// IL DIFETTO DEL 23 AGOSTO. Il portale, al boot, rietichetta in memoria le
// rate scadute (pending -> overdue) per non scrivere N volte su Firestore.
// Il motore filtrava il solo 'pending': in produzione la specie piu' cara
// della coda non scattava MAI e la striscia diceva "0 in ritardo" con le
// rate scadute a sistema. Questa suite era verde e CIECA, perche' alimenta
// il motore con dati grezzi saltando il boot: qui si usano i dati nella
// forma REALE che il portale consegna.
const asPortal = E.build({
  payments: [
    { id: 'q1', status: 'overdue', amount: 950, dueDate: '2026-08-05', month: 'Ago 2026', contractId: 'k1' },
    { id: 'q2', status: 'paid', amount: 1450, paidDate: '2026-08-04' },
  ],
  contracts: [{ id: 'k1', propertyId: 'z1', tenantId: 'u1' }],
  properties: [{ id: 'z1', name: 'Pigneto' }],
  users: [{ id: 'u1', name: 'Anna' }],
}, NOW);
ok(asPortal.decisions.some((d) => d.id === 'pay_all') && asPortal.decisions.some((d) => d.id === 'pay_q1'),
  "una rata gia' rietichettata 'overdue' dal portale entra comunque in coda");
ok(asPortal.cash.overdueTotal === 950 && asPortal.cash.overdueCount === 1,
  'la striscia dei soldi conta i ritardi VERI, non solo quelli ancora chiamati pending');
ok(asPortal.cash.dueMonth === 950, "in arrivo nel mese: una rata scaduta e' comunque attesa nel mese");
// La prova che il flip esiste davvero: se un domani sparisce, questo test
// resta a spiegare perche' il motore conosce due parole per la stessa cosa.
ok(/p\.status === 'pending' && p\.dueDate && p\.dueDate < today\) p\.status = 'overdue'/.test(app),
  'il portale rietichetta davvero le scadute al boot (la ragione della doppia parola)');
ok(/const unpaid = \(p\) =>[\s\S]{0,80}'overdue'/.test(readFileSync(join(ROOT, 'js/oggi-engine.js'), 'utf8')),
  "il motore ha UNA definizione di 'non pagata', usata da tutte le letture dei soldi");

// ── 4. Robustezza: S vuoto o mancante non esplode mai ──────────────────
const empty = E.build({}, NOW);
ok(empty.decisions.length === 0 && empty.cash.paidMonth === 0, 'snapshot vuoto → coda vuota, zero NaN');
ok(!JSON.stringify(empty).includes('NaN'), 'nessun NaN in uscita');

// ── 5. Ogni azione dichiarata ESISTE in portal-app.js ──────────────────
const fns = [...new Set(r.decisions.flatMap((d) => (d.actions || []).map((a) => a.fn)))];
for (const fn of fns) {
  ok(new RegExp(`function ${fn}\\s*\\(|window\\.${fn}\\s*=`).test(app), `azione "${fn}" è una funzione vera del portale`);
}
ok(r.decisions.every((d) => (d.actions || []).every((a) => (a.args || []).every((v) => typeof v === 'string' || typeof v === 'number'))),
  'gli args sono solo stringhe/numeri: mai codice, mai oggetti da serializzare');

// ── 6. Il cablaggio ────────────────────────────────────────────────────
ok(app.includes("case 'oggi':"), 'router: la sezione oggi esiste');
ok(app.includes("goTo('oggi')"), 'sidebar: la voce ⚡ Oggi esiste');
ok(/isAdmin\(\) \? 'oggi'/.test(app), "landing: l'admin senza hash atterra su Oggi");
ok(/window\.BOOM_OGGI/.test(app) && /return adminDashboard\(\)/.test(app.slice(app.indexOf('function oggiPage'), app.indexOf('function oggiPage') + 600)),
  'oggiPage legge il motore e senza motore ricade sulla dashboard (mai una pagina vuota)');
const iEng = html.indexOf('/js/oggi-engine.js');
ok(iEng > -1 && iEng < html.indexOf('<script src="/js/portal-mobile.js">'), 'portal.html carica il motore');
ok(sw.includes('/js/oggi-engine.js'), 'sw.js: il motore viaggia con gli asset del portale');
// il ponte oggiRun invoca per RIFERIMENTO (disciplina Prontuario)
ok(/window\[a\.fn\]/.test(app) && /f\.apply\(window, a\.args/.test(app), 'oggiRun invoca per riferimento, mai per stringa');
// preAgreements: lazy alla prima apertura (dieta del boot), mai un await sul render
const opg = app.slice(app.indexOf('function oggiPage'), app.indexOf('function oggiPage') + 1200);
ok(/oggiLoadProposals/.test(opg) && /S\._paLoading/.test(opg) && !/await/.test(opg),
  'oggiPage carica le proposte fire-and-forget: niente await sul percorso di render');
// Machete #1-2 (Arsenale): il Command Center è un alias di Oggi, Zone
// Intelligence una lapide che punta alla Centrale — mai due verità di zona.
ok(/case 'command-center': S\.page = 'oggi'/.test(app) && !/goTo\('command-center'\)/.test(app),
  'Machete: Command Center è un alias di Oggi e nessuna voce lo apre più');
ok(/case 'zone-intel':[\s\S]{0,400}tombstonePage/.test(app) && !/goTo\('zone-intel'\)/.test(app),
  'Machete: Zone Intelligence è una lapide gentile');
// La Fonderia (Arsenale II, #4-6): la Caccia ha UNA testa — la plancia.
ok(/case 'property-radar':[\s\S]{0,500}tombstonePage/.test(app) && !/goTo\('property-radar'\)/.test(app),
  'Fonderia: Property Radar è una lapide verso la plancia');
ok(/case 'property-finder':[\s\S]{0,500}tombstonePage/.test(app) && !/goTo\('property-finder'\)/.test(app),
  'Fonderia: Property Finder è una lapide verso la plancia');
const miCase = app.slice(app.indexOf("case 'market-intel':"), app.indexOf("case 'market-intel':") + 900);
ok(/tombstonePage/.test(miCase) && /isLandlord\(\)[\s\S]{0,120}marketIntelPage\(\)/.test(miCase),
  'Fonderia: Market Intelligence — lapide per l\'admin, pagina VIVA per il landlord (non ha accesso alle console)');
ok(!/goTo\('market-intel'\)[\s\S]{0,200}Tools/.test(app.slice(app.indexOf('const activeClients'), app.indexOf('const activeClients') + 4000)),
  'sidebar admin: Market Intelligence non c\'è più (il landlord tiene la sua)');
ok(/function tombstonePage/.test(app), 'la lapide gentile esiste (un segnalibro vecchio non trova mai il vuoto)');
// il deep-link è VERO: la console legge #q= e lo mette nella ricerca
const consoleSrc = readFileSync(join(ROOT, 'pre-agreement-admin.html'), 'utf8');
ok(/#q=\(\.\+\)|#q=/.test(consoleSrc) && /decodeURIComponent\(hq\)/.test(consoleSrc),
  "la console legge #q= — l'argomento dell'azione non è un campo che non fa niente");

// ── 7. Burocrazia si TROVA (il difetto del 23 agosto) ─────────────────
// La pagina delle registrazioni stava in fondo alla sidebar sotto "Tools":
// chi cerca "registrare un contratto" non guarda li'. E il badge leggeva
// contractRegistrationStatus, che si carica solo APRENDO la pagina —
// quindi al boot la sidebar taceva proprio mentre un termine correva.
const gestione = app.slice(app.indexOf('data-nav-group="records"'), app.indexOf('data-nav-group="tools"'));
ok(gestione.includes("goTo('burocrazia')"), 'Burocrazia vive in Documenti e contabilità, prima degli strumenti');
ok(app.indexOf("goTo('contracts')") < app.indexOf("goTo('burocrazia')") && gestione.includes("goTo('documents')"), 'Contratti è una destinazione principale; Burocrazia resta accanto ai documenti');
ok(/const daRegistrare = \(S\.contracts \|\| \[\]\)/.test(app) && /daRegistrare\?/.test(app),
  'il badge si conta dai CONTRATTI (disponibili al boot), non da una collection che arriva dopo');

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `La coda dice il vero — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
