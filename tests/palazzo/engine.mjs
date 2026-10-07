// IL PALAZZO — il motore. Tre domande per qualunque mese (chi è dentro, chi
// ha pagato, chi no) su un palazzo sintetico di 13 interni che copre ogni
// stato, più le giunzioni sulla sorgente del portal. Nessuna rete.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildFixture } from './fixture.mjs';

const require = createRequire(import.meta.url);
const P = require('../../js/palazzo-engine.js');
const RENT = require('../../js/rent-engine.js');
let n = 0;
const ok = (label, cond, info) => { assert.ok(cond, label + (info !== undefined ? ' · ' + JSON.stringify(info) : '')); n++; console.log('✓ ' + label); };
const eq = (label, a, b) => { assert.deepEqual(a, b, label); n++; console.log('✓ ' + label); };

// ── 1. Il civico: lo stesso palazzo comunque sia scritto ──────────────
eq('int., CAP e città non cambiano il palazzo', P.streetKey('Viale Provenzale 12, int. 4, 00197 Roma'), 'viale provenzale 12');
eq('scala e interno dopo il civico', P.streetKey('Viale Provenzale, 12 - Scala B int 7'), 'viale provenzale 12');
eq('abbreviazione v.le e lettera del civico', P.streetKey('V.le Provenzale 12/A'), 'viale provenzale 12a');
eq('"Via della Scala" resta una via (non scala 5)', P.streetKey('Via della Scala 5, int 2'), 'via della scala 5');
eq('"Via Roma" tiene la sua Roma', P.streetKey('Via Roma 123, 00100 Roma'), 'via roma 123');
eq('la città in testa si toglie', P.streetKey('Roma, Via Cavour 10'), 'via cavour 10');
eq('p.zza e sc. A', P.streetKey('p.zza Navona 4 sc. A'), 'piazza navona 4');
eq('n. davanti al civico', P.streetKey('Piazza di Spagna n. 31'), 'piazza di spagna 31');
eq('un palazzo scritto a mano vince sull\'indirizzo', P.buildingKeyOf({ address: 'Via X 1', palazzo: 'Palazzo Provenzale' }), 'b:palazzo provenzale');

// ── 2. Il piano: letto, mai indovinato ────────────────────────────────
const floors = { '3° / 5': 3, '3° con ascensore': 3, '2nd Floor': 2, 'Ground Floor': 0, 'PT': 0, 'T': 0, 'rialzato': 0, 'primo piano': 1, 'piano 4': 4, '-1': -1, 'seminterrato': -1, '10': 10 };
for (const [raw, want] of Object.entries(floors)) eq('piano "' + raw + '" → ' + want, P.parseFloor(raw), { n: want });
eq('attico = in cima', P.parseFloor('Attico'), { top: true });
for (const raw of ['ultimo', 'mezzanino', '', null]) eq('piano illeggibile "' + raw + '" → null (da collocare)', P.parseFloor(raw), null);
eq('numero 2 → 2', P.parseFloor(2), { n: 2 });
eq('interno dal nome se manca il campo', P.unitOf({ name: 'Viale X 12 int. 7' }), '7');
eq('interno "Int. 4" senza prefisso', P.unitOf({ unit: 'Int. 4' }), '4');

// ── 3. Il palazzo sintetico, mese corrente ────────────────────────────
const NOW = new Date('2026-10-07T10:00:00Z');
const F = buildFixture(NOW);
const ctx = P.context({ ...F.state, now: NOW });
const all = P.buildings(ctx);
eq('due palazzi, il più grande per primo', all.map(b => [b.label, b.units]), [['Viale Esempio 12', 13], ['Via Altra 3', 2]]);
ok('il proprietario prevalente è la proprietaria con il profilo', all[0].owner && all[0].owner.id === 'owner-demo');
const m = P.model(ctx, all[0].key, F.month);
const st = id => m.units.find(u => u.id === id).month;
const states = Object.fromEntries(m.units.map(u => [u.interno, u.month.state]));
eq('lo stato di ogni interno nel mese', states, { 1: 'paid', 2: 'vacant', 3: 'late', 4: 'paid', 5: 'due', 6: 'review', 7: 'paid', 8: 'norate', 9: 'incoming', 10: 'paid', 11: 'paid', 12: 'late', 13: 'incoming' });
const t = m.totals;
eq('pieni/liberi/in arrivo (int. 13 riservato da una proposta pagata)', [t.units, t.occupied, t.vacant, t.incoming], [13, 10, 1, 2]);
eq('pagati/in ritardo/da pagare/in verifica/senza rata', [t.paid, t.late, t.due, t.review, t.norate], [5, 2, 1, 1, 1]);
eq('atteso e incassato nel mese (la trimestrale non si conta qui)', [t.expected, t.collected, t.lateAmount], [8950, 5000, 1800]);
eq('arretrati di tutti i mesi, deposito compreso', t.arrears, 4200);
eq('occupazione', t.occupancy, 77);
ok('in scadenza entro 90 giorni: int. 7', st('u7').leaving && t.leaving === 1);
ok('in arrivo: int. 9 con la data di ingresso', st('u9').leaseStart === F.M(1) + '-01');
eq('i nomi: titolare e co-conduttrice', st('u11').tenants, ['Inquilino 11 Demo', 'Coinquilina Demo']);
ok('ritardo in giorni dalla scadenza', st('u12').lateDays === 6, st('u12').lateDays);

// ── 4. Rate trimestrali, contratti chiusi, mesi passati ───────────────
for (const k of [-1, 0, 1]) eq('la trimestrale colora ' + F.M(k), P.unitMonth(ctx, ctx.properties.find(p => p.id === 'u10'), F.M(k)).state, 'paid');
const q = [-1, 0, 1].map(k => P.unitMonth(ctx, ctx.properties.find(p => p.id === 'u10'), F.M(k)).expected);
eq('...ma il suo importo conta UNA volta', q, [3900, 0, 0]);
const u2 = ctx.properties.find(p => p.id === 'u2');
eq('int. 2 tre mesi fa: c\'era l\'inquilino (senza rata = da sistemare)', P.unitMonth(ctx, u2, F.M(-3)).state, 'norate');
eq('int. 2 oggi: chiuso in anticipo, libero', P.unitMonth(ctx, u2, F.M(0)).state, 'vacant');
eq('int. 3 due mesi fa: lo stato "overdue" rinominato dal portal è un ritardo', P.unitMonth(ctx, ctx.properties.find(p => p.id === 'u3'), F.M(-2)).state, 'late');
const past = P.model(ctx, all[0].key, F.M(-1));
eq('il mese scorso: int. 3 in ritardo, int. 6 pagato', [past.units.find(u => u.id === 'u3').month.state, past.units.find(u => u.id === 'u6').month.state], ['late', 'paid']);
eq('la linea del tempo: 12 mesi fino a oggi', [m.series.length, m.series[11].month, m.series[0].month], [12, F.month, F.M(-11)]);
eq('la serie del mese corrente = i totali del mese', [m.series[11].totals.paid, m.series[11].totals.late], [t.paid, t.late]);
eq('la striscia di un interno: 12 mesi, l\'ultimo è questo', [m.units[0].strip.length, m.units[0].strip[11].month], [12, F.month]);

// ── 5. Piani e cose da sistemare ──────────────────────────────────────
eq('piani dal basso: PT, 1, 2, 3, Attico', m.floors.map(f => f.label), ['Piano terra', '1° piano', '2° piano', '3° piano', 'Attico']);
eq('al 3° piano anche l\'interno non collegato', m.floors[3].units.map(u => u.interno), ['9', '10', '13']);
eq('senza piano: nel cortile, mai indovinato', m.unplaced.map(u => u.interno), ['12']);
const codes = Object.fromEntries(m.issues.map(i => [i.code, i.ids]));
eq('da collocare', codes.unplaced, ['u12']);
eq('non collegato al profilo della proprietaria (lei non lo vede)', codes.owner, ['u13']);
eq('contratto "attivo" ma scaduto', codes.staleActive, ['c13']);
eq('occupato senza rata', codes.norate, ['u8']);
ok('nessun falso allarme sul profilo: la proprietaria ce l\'ha', !codes.ownerProfile);

// ── 6. La proprietaria vede SOLO il suo ──────────────────────────────
const mine = P.model(ctx, '', F.month, { filter: p => p.ownerId === 'owner-demo' });
eq('dal suo accesso: un palazzo, 12 interni (il 13 non è collegato)', [mine.buildings.length, mine.units.length], [1, 12]);
ok('...e nessun interno di un altro proprietario', mine.units.every(u => u.property.ownerId === 'owner-demo'));
const noProfile = P.model(P.context({ ...F.state, now: NOW, properties: F.state.properties.map(p => p.id.startsWith('u') ? { ...p, ownerId: null } : p) }), all[0].key, F.month);
ok('nessun interno collegato a un profilo → avviso ownerProfile', noProfile.issues.some(i => i.code === 'ownerProfile'));

// ── 6b. Proposte e annunci: cosa succede a un interno libero ─────────
const pip = id => m.units.find(u => u.id === id).pipeline;
eq('int. 2: proposta vista = in trattativa, con chi e da quando', [pip('u2').proposal.kind, pip('u2').proposal.tenant, pip('u2').proposal.startDate], ['negotiating', 'Candidata Demo', F.M(1) + '-01']);
ok('int. 2: la proposta revocata non conta', pip('u2').proposal.id === 'pa2');
ok('int. 2: pubblicato sul sito', pip('u2').listing && pip('u2').listing.published && pip('u2').listing.url === '/listing/lst2');
eq('int. 13: proposta pagata senza contratto = riservato, in arrivo', [pip('u13').proposal.kind, pip('u13').proposal.paid, st('u13').state, st('u13').tenants[0]], ['reserved', true, 'incoming', 'Prenotata Demo']);
ok('int. 4: la proposta già diventata contratto tace (parla il contratto)', pip('u4').proposal === null && st('u4').state === 'paid');
const blind = P.model(P.context({ ...F.state, now: NOW, preAgreements: undefined }), all[0].key, F.month);
ok('senza proposte (il proprietario non le legge) int. 13 resta libero, mai inventato', blind.units.find(u => u.id === 'u13').month.state === 'vacant');

// ── 6c. Il tempo: puntualità, sfitto, scadenze ────────────────────────
const tm = id => m.units.find(u => u.id === id).time;
eq('int. 1: paga in media 1,8 giorni prima, sempre puntuale', [tm('u1').avgDelay, tm('u1').onTime, tm('u1').paidCount], [-1.8, 6, 6]);
eq('int. 5: una rata pagata 7 giorni dopo la scadenza', [tm('u5').paidCount, tm('u5').onTime, tm('u5').avgDelay], [1, 0, 7]);
eq('int. 2: occupato 10 mesi su 12, libero dal giorno dopo la chiusura', [tm('u2').occupiedMonths, tm('u2').vacantSince, tm('u2').vacantDays], [10, F.M(-2) + '-16', 53]);
const A = m.analytics;
eq('palazzo: 30 rate pagate, 29 puntuali (97%)', [A.paidCount, A.onTime, A.onTimePct], [30, 29, 97]);
eq('incassato su SCADUTO negli ultimi 12 mesi (la rata non ancora scaduta non pesa)', [A.collected12, A.expected12, A.collectionPct], [39050, 44050, 89]);
eq('occupazione dei 12 mesi', A.occupancy12, 88);
eq('contratti che finiscono entro un anno: int. 7', A.expiries.map(e => e.interno), ['7']);
eq('liberi dal più vecchio, con la loro storia', A.vacant.map(v => [v.interno, v.days]), [['13', 99], ['2', 53], ['9', null]]);
eq('12 mesi di incassi per il grafico', [A.months.length, A.months[11].month, A.months[11].collected], [12, F.month, 5000]);

// ── 6d. La frase del mese ─────────────────────────────────────────────
eq('il mese in parole, dai numeri', m.brief, [
  'Ottobre 2026: 10 interni su 13 sono pieni, 1 libero, 2 in arrivo.',
  '5 hanno pagato su 9 (€5.000 di €8.950).',
  '2 sono in ritardo per €1.800: int. 12, int. 3.',
  "1 deve ancora pagare, entro l'11 ottobre.",
  '1 pagamento è da verificare.',
  '1 interno occupato non ha la rata registrata.',
  'Arretrati di tutti i mesi: €4.200.']);

ok('per la proprietaria: "in verifica da BOOM", mai il nome del problema interno', P.brief(m, { owner: true }).includes('2 pagamenti sono in verifica da BOOM.') && !P.brief(m, { owner: true }).some(x => /registrata|da verificare/.test(x)));

// ── 6e. Il palazzo vero non ha buchi ──────────────────────────────────
const gapCtx = P.context({ now: NOW, properties: [
  { id: 'g1', address: 'Via Prova 1', interno: '1', floor: '1', ownerId: 'o' },
  { id: 'g3', address: 'Via Prova 1', interno: '5', floor: '3', ownerId: 'o', ultimoPiano: 5 }], contracts: [], payments: [] });
const gm = P.model(gapCtx, '', F.month);
eq('piani gestiti 1 e 3, ultimo piano il 5°: PT, 2, 4, 5 vuoti', gm.floors.map(f => f.short + (f.ghost ? '·' : '')), ['PT·', 'P1', 'P2·', 'P3', 'P4·', 'P5·']);

const atCtx = P.context({ now: NOW, properties: [
  { id: 'a1', address: 'Via Prova 2', interno: '1', floor: '1', ownerId: 'o' },
  { id: 'a9', address: 'Via Prova 2', interno: '9', floor: 'attico', ownerId: 'o', ultimoPiano: 4 }], contracts: [], payments: [] });
eq('con l\'ultimo piano dichiarato l\'attico sta lassù, non sopra il primo', P.model(atCtx, '', F.month).floors.map(f => f.short + (f.ghost ? '·' : '')), ['PT·', 'P1', 'P2·', 'P3·', 'AT']);

// ── 7. Invarianti (ognuna è un difetto possibile) ────────────────────
for (const u of m.units) {
  if (u.month.state === 'norate') ok('int. ' + u.interno + ' senza rata: niente incassato, niente ritardo', u.month.collected === 0 && u.month.lateAmount === 0);
  if (u.month.state === 'vacant') ok('int. ' + u.interno + ' libero: nessun inquilino inventato', u.month.tenants.length === 0 && !u.month.occupied);
  if (u.month.state === 'incoming') ok('int. ' + u.interno + ' in arrivo: non conta come pieno né come incasso', !u.month.occupied && u.month.expected === 0);
}
ok('pagato = ogni rata del mese pagata (mai una sola su due)', m.units.filter(u => u.month.state === 'paid').every(u => u.month.rows.every(r => r.state === 'paid')));
// Mutazione: se lo stato venisse dalla sola etichetta 'pending' (il difetto
// del portal), la rata "overdue" di int. 3 sparirebbe dai ritardi.
const naive = F.state.payments.filter(p => p.status === 'pending' && p.dueDate < F.today).map(p => p.id);
const real = F.state.payments.filter(p => RENT.paymentState(p, NOW) === 'overdue').map(p => p.id);
ok('mutazione: contare solo "pending" perde la rata già rinominata in "overdue"', real.includes('p3_' + F.M(-2)) && !naive.includes('p3_' + F.M(-2)));
ok('mutazione: ...e conta come ritardo un bonifico già segnalato dall\'inquilino', naive.includes('p6_' + F.M(0)) && !real.includes('p6_' + F.M(0)));

// ── 8. Giunzioni sulla sorgente del portal ───────────────────────────
const app = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../portal.html', import.meta.url), 'utf8');
const view = readFileSync(new URL('../../js/palazzo.js', import.meta.url), 'utf8');
ok('nessun conteggio di ritardo legge più status === \'pending\' && isOverdue', !/status === 'pending' && isOverdue\(/.test(app));
ok('isPaymentLate usa lo stato condiviso di BOOM_RENT', /function isPaymentLate\(p\) \{\s*if \(window\.BOOM_RENT\) return window\.BOOM_RENT\.paymentState\(p\) === 'overdue';/.test(app));
ok('badge del proprietario e dashboard passano da isPaymentLate', (app.match(/filter\(isPaymentLate\)/g) || []).length >= 4);
const tag = f => html.indexOf('<script src="' + f + '"></script>');
const iEngine = tag('/js/palazzo-engine.js'), iView = tag('/js/palazzo.js'), iApp = tag('/js/portal-app.js'), iRent = tag('/js/rent-engine.js');
ok('portal.html: rent-engine → palazzo-engine → palazzo → portal-app', iRent > 0 && iRent < iEngine && iEngine < iView && iView < iApp);
ok('portal.html carica il foglio di stile', html.includes('/css/palazzo.css'));
ok('rotta palazzo solo per admin e proprietario', /case 'palazzo':\s*\n\s*if \(\(isAdmin\(\) \|\| isLandlord\(\)\) && window\.BOOM_PALAZZO_UI\)/.test(app));
ok('il proprietario atterra sul suo palazzo', app.includes("(S.profile?.role === 'landlord' ? 'palazzo' : 'dashboard')"));
ok('voce nel menu per admin e proprietario', (app.match(/goTo\('palazzo'\)"><span class="nav-icon">🏛️<\/span> Il Palazzo/g) || []).length === 2);
ok('la vista non scrive su Firestore', !/\bdb\.|\.update\(|\.set\(|firestore/.test(view));
ok('l\'unica scrittura (collega gli interni) è solo admin e chiede conferma', /async function palazzoLinkOwner\(ids, ownerId\) \{\s*if \(!isAdmin\(\)\) return;[\s\S]{0,700}confirm\(/.test(app));
ok('le azioni admin nella vista sono bloccate per il proprietario', /if \(!admin\) return;\s*\n\s*if \(act === 'rent'/.test(view));


// ── 9. L'aspetto del palazzo: solo ciò che qualcuno ha dichiarato ─────
const lk = m.look;
eq('senza dichiarazione: aspetto neutro, mai persiane verdi per default', [lk.intonaco, lk.persiane, lk.declared], ['pietra', 'grafite', { intonaco: false, persiane: false, topFloor: false }]);
eq('il civico è un fatto: targa e numero dall\'indirizzo', [lk.street, lk.civic], ['Viale Esempio', '12']);
eq('civico con lettera', P.civicOf('Piazzale Prenestino 42a'), { street: 'Piazzale Prenestino', civic: '42A' });
eq('un nome senza numero non inventa un civico', P.civicOf('Palazzo Prenestino'), { street: 'Palazzo Prenestino', civic: '' });
const decl = P.model(P.context({ ...F.state, now: NOW, properties: F.state.properties.map(p => p.id === 'u7' ? { ...p, palazzoIntonaco: 'Ocra', palazzoPersiane: 'verde', palazzoNome: 'Palazzo Esempio', ultimoPiano: 5 } : p) }), all[0].key, F.month);
eq('basta UN interno che lo dichiari (maiuscole indifferenti)', [decl.look.intonaco, decl.look.persiane, decl.look.name, decl.look.topFloor], ['ocra', 'verde', 'Palazzo Esempio', 5]);
ok('ultimo piano dichiarato: il palazzo arriva fin lassù, coi piani vuoti', decl.floors.map(f => f.short).join(' ') === 'PT P1 P2 P3 P4 AT' && decl.floors.find(f => f.short === 'P4').ghost);
const bogus = P.model(P.context({ ...F.state, now: NOW, properties: F.state.properties.map(p => p.id === 'u7' ? { ...p, palazzoIntonaco: 'fucsia', palazzoPersiane: '<b>' } : p) }), all[0].key, F.month);
eq('un colore fuori elenco non passa: resta neutro', [bogus.look.intonaco, bogus.look.persiane, bogus.look.declared.intonaco], ['pietra', 'grafite', false]);
const prev = P.model(ctx, all[0].key, F.month, { topFloor: 6 });
ok('anteprima (opts.topFloor) disegna i piani...', prev.floors.map(f => f.short).join(' ') === 'PT P1 P2 P3 P4 P5 AT');
eq('...ma m.look resta ciò che è SALVATO (il confronto per "cosa è cambiato")', prev.look.topFloor, null);
eq('valida: solo i campi passati, coi nomi del documento', P.validateLook({ intonaco: 'ocra', persiane: 'verde', nome: ' Palazzo Esempio ', ultimoPiano: '5' }, m),
  { ok: true, fields: { palazzoIntonaco: 'ocra', palazzoPersiane: 'verde', palazzoNome: 'Palazzo Esempio', ultimoPiano: 5 }, errors: [] });
eq('rifiuta, mai aggiusta: ultimo piano sotto un interno gestito (P3 + attico → almeno 4)', P.validateLook({ ultimoPiano: 3 }, m).errors, ['ultimoPiano<4']);
eq('rifiuta un ultimo piano non intero o fuori scala', ['2.5', 0, 41, 'tre'].map(v => P.validateLook({ ultimoPiano: v }, m).errors[0]), ['ultimoPiano', 'ultimoPiano', 'ultimoPiano', 'ultimoPiano']);
eq('rifiuta un colore fuori elenco e un nome lungo', P.validateLook({ intonaco: 'fucsia', persiane: 'rosa', nome: 'x'.repeat(61) }, m).errors, ['intonaco', 'persiane', 'nome']);
const noTop = P.model(P.context({ ...F.state, now: NOW, properties: F.state.properties.filter(p => p.id !== 'u11') }), all[0].key, F.month);
eq('senza attico basta il piano più alto gestito', [P.validateLook({ ultimoPiano: 3 }, noTop).ok, P.validateLook({ ultimoPiano: 2 }, noTop).errors], [true, ['ultimoPiano<3']]);
eq('«P.le» è Piazzale: lo stesso palazzo comunque sia scritto', ['P.le Prenestino 42, int. 3', 'Piazzale Prenestino, 42 - 00177 Roma', 'p.zale Prenestino 42 scala A'].map(P.streetKey), Array(3).fill(P.streetKey('Piazzale Prenestino 42')));
ok('…e non si confonde con piazza', P.streetKey('P.za Prenestino 42') !== P.streetKey('P.le Prenestino 42'));
// §10 I quattro toni: otto stati del motore, quattro colori in pagina.
eq('i toni sono quattro, in quest\'ordine', P.TONES.map(t => t.key), ['pagato', 'ritardo', 'attesa', 'libero']);
ok('ogni stato sta in UN tono e uno solo', Object.keys(P.STATES).every(s => P.TONES.filter(t => t.states.includes(s)).length === 1));
eq('toneOf: in verifica e senza rata sono «in attesa», in arrivo è «libero»', ['paid', 'late', 'review', 'norate', 'incoming', 'vacant'].map(P.toneOf), ['pagato', 'ritardo', 'attesa', 'attesa', 'libero', 'libero']);
eq('model espone la data di oggi (la scadenza si conta da qui)', m.today, F.today);
ok('ogni preset ha nome e colore esadecimale', ['intonaco', 'persiane'].every(k => Object.values(P.LOOKS[k]).every(v => v[0] && /^#[0-9A-F]{6}$/i.test(v[1]))));
const css = readFileSync(new URL('../../css/palazzo.css', import.meta.url), 'utf8');
ok('i default neutri sono quelli del foglio di stile', css.includes('var(--wall,' + P.LOOKS.intonaco[P.LOOK_DEFAULT.intonaco][1] + ')') && css.includes('var(--shut,' + P.LOOKS.persiane[P.LOOK_DEFAULT.persiane][1] + ')'));
ok('il salvataggio dell\'aspetto è solo admin, con conferma e campi in lista bianca', /async function palazzoSaveLook\(ids, fields\) \{\s*if \(!isAdmin\(\)\) return false;\s*const allowed = \['palazzoIntonaco', 'palazzoPersiane', 'palazzoNome', 'ultimoPiano'\];[\s\S]{0,1200}confirm\(/.test(app));
ok('la vista non salva un campo che l\'admin non ha toccato', /function lookChanges\(m\)/.test(view) && /validateLook\(lookChanges\(last\.m\), last\.m\)/.test(view));
ok('il libero ha le persiane chiuse, sempre (anche in mezzo a un\'animazione)', /\.plz-win\[data-state="vacant"\] \.plz-shut,[^{]*\{transform:none!important\}/.test(css));

const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
ok('sw.js: motore, vista e foglio del Palazzo viaggiano col portale (network-first)', ['/js/palazzo-engine.js', '/js/palazzo.js', '/css/palazzo.css'].every(f => sw.includes("url.pathname === '" + f + "'")));

console.log(`\n${n} check passati — palazzo sintetico, nessuna rete.`);
