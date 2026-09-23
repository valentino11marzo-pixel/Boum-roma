// tests/innesto/render.mjs
// La pagina Innesto si DISEGNA con le card nuove (Lead, Proposta, contratto
// saltato) e con tutti gli stati del lookup della proposta: la sezione
// intera del portal (costanti + funzioni di render) viene montata in Node
// con S/db/finestra finti. Un ReferenceError in una card lascerebbe la
// pagina bianca: qui lo si vede prima dell'operatore.
//
//   node tests/innesto/render.mjs

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const requireCjs = createRequire(import.meta.url);

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

const app = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const start = app.indexOf('    const INNESTO_INLINE_MAX');
const end = app.indexOf('    async function innestoApply');
if (start < 0 || end < 0 || end < start) throw new Error('sezione Innesto non trovata nel portal');
const SECTION = app.slice(start, end);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function mount(setup) {
  const toasts = [];
  const fn = new Function('window', 'S', 'db', 'storage', 'auth', 'toast', 'renderPage', 'goTo', 'esc', 'adeCompressImage', 'document', 'crypto', 'location', 'SETUP',
    SECTION + '\n_innesto = innestoEmpty(); SETUP(_innesto);\nreturn { page: innestoPage(), card: _innesto.proposal ? innestoProposalCard(_innesto.proposal) : "", read: innestoReadCard(), kind: innestoFileKind, icon: innestoFileIcon, media: innestoMediaType, money: innestoMoney, dup: innestoLeadDup, setTarget: innestoSetTarget, targetPayload: innestoTargetPayload, state: () => _innesto, cardOf: (p) => innestoProposalCard(p) };');
  const out = fn(
    { BOOM_DATAOPS: requireCjs('../../js/dataops-engine.js'), location: { hash: '' } },
    { users: [{ id: 'u1', name: 'Anna Rossi', role: 'landlord' }], properties: [{ id: 'p1', name: 'Via Simeto 12', address: 'Via Simeto 12' }], landlords: [], leads: [{ id: 'l1', name: 'Già Presente', email: 'gia@x.com', phone: '' }], profile: { id: 'admin' } },
    { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }), doc: () => ({ get: async () => ({ exists: false }) }) }) },
    { ref: () => ({}) }, { currentUser: { uid: 'admin', getIdToken: async () => 't' } },
    (...a) => toasts.push(a), () => {}, () => {}, esc, async () => null, { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }, { randomUUID: () => 'x' }, { origin: 'https://www.boomrome.com', hash: '' },
    setup
  );
  out.toasts = toasts;
  return out;
}

console.log('\n\x1b[1mLa pagina vuota\x1b[0m');
let o = mount(() => {});
check('si disegna senza proposta: drop zone, accept aperto, parole nuove', /innestoDrop/.test(o.page) && /accept="application\/pdf,image\/\*,\.pdf,\.heic/.test(o.page) && /Word, Excel, email, testo/.test(o.page) && /nessun limite di formato/.test(o.page), o.page.slice(0, 200));
check('intake: pdf/immagine/testo riconosciuti anche dal solo nome; il resto no', o.kind({ name: 'a.PDF', type: '' }) === 'pdf' && o.kind({ name: 'IMG_1.heic', type: '' }) === 'image' && o.kind({ name: 'x.docx', type: 'application/octet-stream' }) === 'text' && o.kind({ name: 'mail.eml', type: '' }) === 'text' && o.kind({ name: 'foto.jpg', type: 'image/jpeg' }) === 'image' && o.kind({ name: 'setup.exe', type: 'application/octet-stream' }) === '');
check('icone per tipo', o.icon({ name: 'rate.xlsx', type: '' }) === '📊' && o.icon({ name: 'm.eml', type: '' }) === '✉️' && o.icon({ name: 'c.docx', type: '' }) === '📝' && o.icon({ name: 'c.pdf', type: 'application/pdf' }) === '📄');
check('mediaType dal nome quando il browser tace', o.media({ name: 'm.eml', type: '' }) === 'message/rfc822' && o.media({ name: 'c.docx', type: 'application/octet-stream' }) === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && o.media({ name: 'x.jpg', type: 'image/jpeg' }) === 'image/jpeg');
check('innestoMoney: 1.100,00 · 1100 · 250.5 · 1.100 · €900', o.money('1.100,00') === 1100 && o.money('1100') === 1100 && o.money('250.5') === 250.5 && o.money('1.100') === 1100 && o.money('€ 900') === 900 && o.money('') === null);
check('dedupe lead per email (qualunque maiuscola)', !!o.dup({ email: 'GIA@x.com' }) && !o.dup({ email: 'nuova@x.com', phone: '' }));

console.log('\n\x1b[1m«Riguarda» — il bersaglio dichiarato (22/09)\x1b[0m');
check('la riga Riguarda si disegna con le tre tendine (immobile con indirizzo, proprietario, inquilino) dai pool veri', /Riguarda/.test(o.page) && /innestoSetTarget\('property'/.test(o.page) && /innestoSetTarget\('landlord'/.test(o.page) && /innestoSetTarget\('tenant'/.test(o.page) && /<option value="p1"[^>]*>Via Simeto 12<\/option>/.test(o.page) && /<option value="u1"[^>]*>Anna Rossi<\/option>/.test(o.page), o.page.slice(o.page.indexOf('Riguarda') - 50, o.page.indexOf('Riguarda') + 400));
o = mount((st) => { st.target.property = 'p1'; });
check('un bersaglio scelto resta selezionato dopo un ridisegno, e il payload per il server porta nome e indirizzo (mai il solo id)', /<option value="p1" selected>/.test(o.page) && JSON.stringify(o.targetPayload()) === JSON.stringify({ property: { name: 'Via Simeto 12', address: 'Via Simeto 12' } }), JSON.stringify(o.targetPayload()));
o = mount((st) => { st.target.property = 'p1'; st.links.property = 'p1'; st.proposal = { material: 'immobile', property: { name: 'Via Simeto 12', address: 'Via Simeto 12', foglio: '545', particella: '120', sub: '4', categoria: 'A/3', renditaCatastale: 645.57, cadastralData: 'foglio 545, particella 120, sub 4, categoria A/3' } }; st.evMap['property.foglio'] = { quote: 'Fg. 545', file: null, page: null }; });
check('catasto letto + immobile dichiarato = LA MODIFICA PROPOSTA sul record che c\'è già: «già in archivio — scelto dall\'archivio», righe che RIEMPIONO foglio/particella/sub, riepilogo «aggiornerà immobile»', /🏠 Immobile/.test(o.card) && /già in archivio — scelto dall&#39;archivio/.test(o.card) && /riempie/.test(o.card) && /<b>545<\/b>/.test(o.card) && /❝ Fg\. 545 ❞/.test(o.card) && /aggiornerà immobile \(\d+ campi\)/.test(o.card) && !/creerà [^<]*immobile/.test(o.card) && !/Contratto NON creabile/.test(o.card), o.card.slice(o.card.indexOf('🏠 Immobile'), o.card.indexOf('🏠 Immobile') + 600));
check('…e il bersaglio scelto a proposta aperta cambia l\'aggancio subito (setTarget → links)', (() => { o.setTarget('property', ''); const s1 = o.state(); const gone = s1.links.property === undefined; o.setTarget('property', 'p1'); return gone && o.state().links.property === 'p1'; })());
o = mount((st) => { st.target.property = 'p1'; st.links.property = 'p1'; st.proposal = { material: 'altro', tenant: { name: 'Marta Neri' } }; });
check('immobile dichiarato ma NON letto (e nessun contratto): la card lo dice — «Dichiarato in «Riguarda» … niente da scrivere» — invece di sparire', /🏠 Immobile/.test(o.card) && /Dichiarato in «Riguarda»/.test(o.card) && /✓ agganciato dall'archivio/.test(o.card), o.card.slice(0, 500));

console.log('\n\x1b[1mLe card nuove\x1b[0m');
const PROPOSAL = {
  material: 'proposta',
  landlord: { name: 'Anna Rossi', email: 'anna@x.com' },
  tenant: { name: 'Marta Neri', email: 'marta@x.com', codiceFiscale: '' },
  property: { name: 'Via Simeto 12', address: 'Via Simeto 12', rent: 1100 },
  contract: { type: 'transitorio', startDate: '2026-10-01', endDate: '2027-09-30', rent: 1100, depositMonths: 2, paymentDay: 5, installmentMonths: 1, cedolareSecca: 'si' },
  lead: { name: 'Marta Neri', email: 'marta@x.com', phone: '+393331234567', request: 'cerco bilocale', zone: 'Trastevere', budget: 1200, language: 'en', side: 'tenant', household: 'couple' },
  preagreement: { ref: 'BOOM-3K9F2A', isBoom: 'yes', status: 'accepted', feePct: 10, feeDue: 'signing', dueAtSigning: 1100, depositSplitPct: 50, validUntil: '2026-10-15', extras: 'Pulizia finale: 150' },
};
o = mount((st) => { st.proposal = structuredClone(PROPOSAL); st.filesRead = [{ index: 1, name: 'proposta.pdf', kind: 'proposta', label: 'Proposta / pre-accordo', legible: true, pages: 3, format: 'PDF' }, { index: 2, name: 'rate.xlsx', kind: 'altro', label: 'Documento', legible: true, isText: true, format: 'Excel', chars: 240 }]; st.summary = 'Proposta BOOM-3K9F2A'; st.confidence = 90; });
check('card Lead: spunta accesa, campi con etichette del dizionario, select per lingua e chi scrive', /💬 Lead/.test(o.card) && /crea il lead/.test(o.card) && /Richiesta \(parole del cliente\)/.test(o.card) && /<option value="en" selected>Inglese/.test(o.card) && /<option value="tenant" selected>Cerca casa/.test(o.card), o.card.slice(o.card.indexOf('💬 Lead'), o.card.indexOf('💬 Lead') + 300));
check('card Proposta (nessun lookup ancora): spunta SPENTA per creare nel console, riferimento e stato mostrati', /📝 Proposta \/ pre-accordo/.test(o.card) && /crea la proposta nel console/.test(o.card) && /value="BOOM-3K9F2A"/.test(o.card) && /<option value="accepted" selected>/.test(o.card) && !/checked onchange="_innesto\.create\.preagreement/.test(o.card));
check('il contratto resta creabile (nessuna proposta trovata) e il riepilogo promette lead + contratto', /📋 Contratto/.test(o.card) && /creerà .*contratto \+ piano rate/.test(o.card) && /creerà [^<]*lead/.test(o.card) && !/proposta nel console/.test(o.card.slice(o.card.indexOf('Pronto:'))));
check('la card «cosa ho letto» dice il materiale e il formato/caratteri dell\'Excel', /proposta \/ pre-accordo · sicurezza 90%/.test(o.read) && /Excel, 240 caratteri/.test(o.read) && /3 pagine/.test(o.read), o.read.replace(/\s+/g, ' ').slice(0, 400));

o = mount((st) => { st.proposal = structuredClone(PROPOSAL); st.pa = { key: 'BOOM-3K9F2A', loading: false, found: { id: 'pa_1', ref: 'BOOM-3K9F2A', status: 'paid', contractId: null }, error: '' }; st.skipContract = true; });
check('proposta TROVATA senza contratto: bottone «→ Contratto dalla proposta», contratto saltato con la via per crearlo comunque, riepilogo senza contratto', /già nel console — BOOM-3K9F2A · paid/.test(o.card) && /innestoConvertPa\('pa_1'\)/.test(o.card) && /non creato da qui/.test(o.card) && /Crealo comunque da qui/.test(o.card) && !/creerà [^<]*contratto \+ piano rate/.test(o.card) && !/Contratto NON creabile/.test(o.card));
o = mount((st) => { st.proposal = structuredClone(PROPOSAL); st.pa = { key: 'BOOM-3K9F2A', loading: false, found: { id: 'pa_1', ref: 'BOOM-3K9F2A', status: 'signed', contractId: 'pa_1' }, error: '' }; st.skipContract = true; });
check('proposta TROVATA con contratto: «contratto creato», nessun bottone convert, nessuna via per un secondo contratto', /contratto creato/.test(o.card) && !/innestoConvertPa/.test(o.card) && /esiste già/.test(o.card) && !/Crealo comunque/.test(o.card));
o = mount((st) => { st.proposal = structuredClone(PROPOSAL); st.pa = { key: 'BOOM-3K9F2A', loading: true, found: null, error: '' }; });
check('lookup in corso: lo dice', /cerco la proposta nel console/.test(o.card));
o = mount((st) => { st.proposal = structuredClone(PROPOSAL); st.pa = { key: 'BOOM-3K9F2A', loading: false, found: null, error: 'permission-denied' }; st.create.preagreement = true; });
check('lookup fallito: errore e riprova sono visibili, la creazione resta bloccata prima di un possibile doppione', /Ricerca nel console non riuscita \(permission-denied\)/.test(o.card) && /Riprova la ricerca/.test(o.card) && /disabled[^>]*onclick="innestoApply\(\)"/.test(o.card) && !/Pronto:/.test(o.card));
o = mount((st) => { st.proposal = { material: 'messaggio', lead: { name: 'Già Presente', email: 'gia@x.com', phone: '', request: 'ciao' } }; });
check('lead già in archivio: la card lo dice, niente spunta, il riepilogo non promette nulla di nuovo', /già fra i lead — Già Presente/.test(o.card) && !/crea il lead/.test(o.card) && /solo collegamenti/.test(o.card), o.card.slice(o.card.indexOf('Pronto'), o.card.indexOf('Pronto') + 120));
o = mount((st) => { st.proposal = { material: 'messaggio', lead: { name: 'Nuovo Cliente', email: 'nuovo@x.com', phone: '', request: 'cerco casa' } }; });
check('solo un lead: nessuna card contratto/immobile, il riepilogo promette il lead', !/📋 Contratto/.test(o.card) && !/🏠 Immobile/.test(o.card) && /creerà lead/.test(o.card));

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mLa pagina si disegna in ogni stato, con le card nuove.\x1b[0m');
