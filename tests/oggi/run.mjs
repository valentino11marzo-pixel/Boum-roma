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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const E = require(join(ROOT, 'js', 'oggi-engine.js'));
const app = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');
const html = readFileSync(join(ROOT, 'portal.html'), 'utf8');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');

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
    // ── Registrazioni RLI (30gg dalla stipula): i cinque stati veri ──
    // firmato 3gg fa: c'e' tempo, ma la pratica esiste e si vede
    { id: 'c3', status: 'active', propertyId: 'x1', tenantId: 't1', signatureStatus: 'complete', fullySignedAt: '2026-08-16T10:00:00Z' },
    // firmato 45gg fa e mai registrato: termine SFORATO, ogni giorno costa
    { id: 'c4', status: 'active', propertyId: 'x2', tenantId: 't2', signatureStatus: 'complete', fullySignedAt: '2026-07-05T10:00:00Z' },
    // mandato ad ASPI ieri: sta lavorando lui, non e' una decisione
    { id: 'c5', status: 'active', propertyId: 'x1', tenantId: 't1', signatureStatus: 'complete', fullySignedAt: '2026-08-14T10:00:00Z', aspiRequestedAt: '2026-08-18T09:00:00Z', aspiRequestKind: 'completo' },
    // mandato 10gg fa e ancora niente: sollecito, con l'azione che CHIUDE il giro
    { id: 'c6', status: 'active', propertyId: 'x2', tenantId: 't2', signatureStatus: 'complete', fullySignedAt: '2026-08-07T10:00:00Z', aspiRequestedAt: '2026-08-09T10:00:00Z', aspiRequestKind: 'registrazione' },
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

// ── 2b. Registrazioni RLI: il termine di legge guida la coda ───────────
// L'unico ritardo con un prezzo scritto in legge (sanzione + cedolare a
// rischio): il punteggio deve DORMIRE quando c'e' tempo e SCAVALCARE
// quando il termine e' passato. E mentre il referente ha la pratica in
// mano non e' una decisione: si tace.
ok(ids.includes('rli_c3'), 'un contratto firmato e non registrato entra in coda');
ok(ids.includes('rli_c4'), 'un contratto oltre i 30gg entra (e resta finche\' non e\' registrato)');
ok(!ids.includes('rli_c5'), 'appena mandato ad ASPI: SILENZIO — sta lavorando il referente, non e\' una decisione');
ok(ids.includes('rli_c6'), 'mandato da 10gg e ancora niente: torna come sollecito');
ok(!ids.includes('rli_c7'), 'gia\' registrato: fuori dalla coda');
ok(!ids.includes('rli_c2'), 'una firma a META\' non e\' da registrare (si registra un atto perfezionato)');
const rli3 = r.decisions.find((d) => d.id === 'rli_c3');
const rli4 = r.decisions.find((d) => d.id === 'rli_c4');
const rli6 = r.decisions.find((d) => d.id === 'rli_c6');
ok(/RLI tra 27gg/.test(rli3.sub), 'la riga dice quanto manca al termine, in giorni veri');
ok(/SCADUTA da 15gg/.test(rli4.sub) && rli4.tint === 'red', 'la scaduta lo DICE e si veste di rosso');
ok(rli4.score > 90 && pos('rli_c4') < pos('pay_all'), 'una RLI scaduta scavalca perfino il quadro degli incassi in ritardo');
ok(rli3.score < 50 && pos('rli_c3') > pos('rli_c4'), 'una appena firmata dorme in fondo: c\'e\' tempo, non e\' un allarme');
ok(rli3.actions[0].fn === 'openAspi' && rli3.actions[0].primary, 'da registrare → il tap primario e\' l\'invio ad ASPI');
ok(rli6.actions[0].fn === 'markRliRegistered', 'in attesa → il tap primario CHIUDE il giro (conferma la registrazione)');
ok(/In attesa di ASPI da 10gg/.test(rli6.title) && /solo registrazione/.test(rli6.sub), 'il sollecito dice da quanto aspetta e cosa e\' stato chiesto');

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
ok(/preAgreements/.test(opg) && /S\._paLoading/.test(opg) && !/await/.test(opg),
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
const gestione = app.slice(app.indexOf('>Gestione<'), app.indexOf('>Tools<'));
ok(gestione.includes("goTo('burocrazia')"), 'Burocrazia vive in GESTIONE, accanto ai Contratti — non sepolta in Tools');
ok(gestione.indexOf("goTo('contracts')") < gestione.indexOf("goTo('burocrazia')"), 'e sta subito DOPO Contratti: il percorso mentale e\' quello');
ok(/const daRegistrare = \(S\.contracts \|\| \[\]\)/.test(app) && /daRegistrare\?/.test(app),
  'il badge si conta dai CONTRATTI (disponibili al boot), non da una collection che arriva dopo');

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `La coda dice il vero — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
