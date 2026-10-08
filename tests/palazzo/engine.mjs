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
  '2 segnalazioni di manutenzione aperte (1 urgente).',
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
{
  const gate = view.indexOf('if (!admin) return;');
  const at = a => view.indexOf("if (act === '" + a + "'", view.indexOf('function onClick('));
  ok('le azioni admin nella vista sono bloccate per il proprietario (tutte dopo il cancello)', gate > 0 &&
    ['rent', 'contract', 'dossier', 'edit', 'paylink', 'pdf', 'firma', 'rli', 'aspi', 'fiscale', 'arpe'].every(a => at(a) > gate));
  ok('il CSV e "Scrivi a BOOM" restano alla proprietaria (prima del cancello)', at('csv') > 0 && at('csv') < gate && at('inbox') < gate);
}


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
eq('i toni sono quattro, in quest\'ordine (+ «Prima di BOOM», solo nei mesi prima della gestione)', P.TONES.map(t => t.key), ['pagato', 'ritardo', 'attesa', 'libero', 'prima']);
ok('ogni stato sta in UN tono e uno solo', Object.keys(P.STATES).every(s => P.TONES.filter(t => t.states.includes(s)).length === 1));
eq('toneOf: in verifica e senza rata sono «in attesa», in arrivo è «libero»', ['paid', 'late', 'review', 'norate', 'incoming', 'vacant'].map(P.toneOf), ['pagato', 'ritardo', 'attesa', 'attesa', 'libero', 'libero']);
eq('model espone la data di oggi (la scadenza si conta da qui)', m.today, F.today);
ok('ogni preset ha nome e colore esadecimale', ['intonaco', 'persiane'].every(k => Object.values(P.LOOKS[k]).every(v => v[0] && /^#[0-9A-F]{6}$/i.test(v[1]))));
const css = readFileSync(new URL('../../css/palazzo.css', import.meta.url), 'utf8');
ok('i default neutri sono quelli del foglio di stile', css.includes('var(--wall,' + P.LOOKS.intonaco[P.LOOK_DEFAULT.intonaco][1] + ')') && css.includes('var(--shut,' + P.LOOKS.persiane[P.LOOK_DEFAULT.persiane][1] + ')'));
ok('il salvataggio dell\'aspetto è solo admin, con conferma e campi in lista bianca', /async function palazzoSaveLook\(ids, fields\) \{\s*if \(!isAdmin\(\)\) return false;\s*const allowed = \['palazzoIntonaco', 'palazzoPersiane', 'palazzoNome', 'ultimoPiano'\];[\s\S]{0,1200}confirm\(/.test(app));
ok('la vista non salva un campo che l\'admin non ha toccato', /function lookChanges\(m\)/.test(view) && /validateLook\(lookChanges\(last\.m\), last\.m\)/.test(view));
ok('il libero ha le persiane chiuse, sempre (anche in mezzo a un\'animazione)', /\.plz-win\[data-state="vacant"\] \.plz-shut,[^{]*\{transform:none!important\}/.test(css));

// ── 10. La carta del contratto e il foglio per il commercialista ───────
const paper = id => m.units.find(u => u.id === id).paper;
eq('registrato: la data che BOOM ha segnato', paper('u1').registration, { status: 'registered', at: F.M(-14) + '-20', late: false });
ok('mai segnata e decorrenza di 14 mesi fa: ritardo certo', paper('u5').registration.status === 'todo' && paper('u5').registration.late);
eq('inviato ad ASPI: in registrazione, con la data dell\'invio', [paper('u8').registration.status, paper('u8').registration.at], ['sent', F.M(-13) + '-02']);
ok('decorrenza di oggi: nessun ritardo (il termine non è passato)', !P.paperOf({ startDate: F.today }, F.today).registration.late);
eq('cedolare: sì, no, e non dichiarata resta null (mai il "sì" di default del PDF)', [paper('u1').cedolare, paper('u6').cedolare, paper('u12').cedolare], [true, false, null]);
eq('cedolareDeclared: anche canone.cedolareSecca e "Sì"; ciò che non si legge resta null',
  [P.cedolareDeclared({ canone: { cedolareSecca: true } }), P.cedolareDeclared({ cedolareSecca: 'Sì' }), P.cedolareDeclared({ cedolareSecca: 'forse' }), P.cedolareDeclared({})], [true, true, null, null]);
{
  const un = (m.issues.find(i => i.code === 'unregistered') || { ids: [] }).ids.slice().sort();
  eq('Da sistemare: i contratti IN CORSO senza registrazione segnata oltre 30 giorni (mai un futuro, mai uno registrato)', un, ['u5', 'u8']);
}
{
  const rows = P.csvRows(m), byInt = Object.fromEntries(rows.map(r => [r[1], r]));
  eq('CSV: una riga per interno, intestazione fissa', [rows.length, P.CSV_HEAD.length, rows.every(r => r.length === P.CSV_HEAD.length)], [m.units.length, 14, true]);
  eq('CSV: la riga di un interno pagato, all\'italiana', byInt['1'].slice(2), ['Piano terra', 'Inquilino 1 Demo', 'transitorio', '01/' + F.M(-14).slice(5, 7) + '/' + F.M(-14).slice(0, 4),
    byInt['1'][6], 'Sì', 'Registrato il 20/' + F.M(-14).slice(5, 7) + '/' + F.M(-14).slice(0, 4), '900,00', '900,00', '900,00', byInt['1'][12], 'Pagato']);
  ok('CSV: il libero non ha importi (non 0,00)', byInt['2'][10] === '' && byInt['2'][11] === '' && byInt['2'][13] === 'Libero');
  const sum = rows.reduce((a, r) => a + (r[11] ? Number(r[11].replace(',', '.')) : 0), 0);
  eq('CSV: la somma dell\'incassato è quella della pagina (un foglio solo, un motore solo)', Math.round(sum * 100) / 100, m.totals.collected);
  const own = P.csvRows(m, { owner: true }), byO = Object.fromEntries(own.map(r => [r[1], r]));
  eq('CSV della proprietaria: la sua lingua (mai "Non segnata" né "Senza rata")', [byO['5'][8], byO['8'][13], byInt['5'][8], byInt['8'][13]], ['In verifica da BOOM', 'In verifica da BOOM', 'Non segnata', 'Senza rata']);
  const csv = P.toCsv([['a;b', 'x"y', 'ok']]);
  ok('toCsv: BOM, punto e virgola, CRLF, virgolette dove servono', csv.startsWith('\ufeffMese;Interno;') && csv.includes('\r\n"a;b";"x""y";ok\r\n'));
}

// ── 11. Gestione BOOM dal: prima non è storia di BOOM ──────────────────
{
  // Un contratto di 14 mesi fa entrato con TUTTE le rate (il generatore parte
  // dalla decorrenza): con gestioneDal = mese corrente, quelle vecchie non
  // sono arretrati.
  const GD = F.month;
  const props = F.state.properties.map(p => p.id === 'u3' || p.id === 'u12' ? { ...p, gestioneDal: GD } : p);
  const gctx = P.context({ ...F.state, properties: props, now: NOW });
  const gm = P.model(gctx, all[0].key, F.month);
  const u3 = gm.units.find(u => u.id === 'u3');
  eq('le rate di prima della gestione non sono arretrati (int. 3 aveva 3 rate scadute)', [m.units.find(u => u.id === 'u3').arrears.count, u3.arrears.count], [3, 1]);
  const pre = gm.issues.find(i => i.code === 'preBoom');
  ok('…ma l\'operatore le vede contate a parte (Da sistemare)', pre && pre.ids.includes('u3') && pre.count >= 2, pre);
  const past = P.model(gctx, all[0].key, P.monthAdd(F.month, -1));
  const pu3 = past.units.find(u => u.id === 'u3').month;
  eq('un mese prima della gestione: «Prima di BOOM», importi zero, contratto ancora un fatto', [pu3.state, pu3.expected, pu3.occupied], ['before', 0, true]);
  ok('la frase lo dice invece di contarlo come ritardo', P.brief(past).some(x => /prima della gestione BOOM/.test(x)), P.brief(past));
  eq('il modello dichiara da quando gestisce', gm.gestioneDal, GD);
  eq('toneOf: before ha il suo tono', P.toneOf('before'), 'prima');
  const csvPast = P.csvRows(past).find(r => r[1] === '3');
  eq('CSV: un mese prima di BOOM non ha importi', [csvPast[10], csvPast[11], csvPast[13]], ['', '', 'Prima della gestione BOOM']);
}

// ── 12. La presa in carico: il palazzo da una tabella ──────────────────
{
  const T = ['Interno\tPiano\tInquilino\tTelefono\tEmail\tCanone\tDal\tAl\tTipo\tDeposito\tCedolare\tRegistrato il\tPagato il\tNote',
    '1\tPT\tMario Rossi\t333 123 4567\tMARIO@example.invalid\t1.250,00\t01/09/2025\t31/08/2027\ttransitorio\t2.500\tsì\t20/09/2025\t' + '03/' + F.month.slice(5, 7) + '/' + F.month.slice(0, 4) + '\tok',
    '2\t1°\t\t\t\t900\t\t\t\t\t\t\t\t',
    'int. 3\t2\tAnna Bianchi\t+39 06 1234567\t\t950\t01/' + F.month.slice(5, 7) + '/' + F.month.slice(0, 4) + '\t30/09/2027\t3+2\t\tno\t\tsi\t',
    '4\tboh\tLuca\t12\tnope\tabc\t32/01/2025\t01/01/2027\txx\t\t\t\t\t',
    '1\t3\tDoppio\t\t\t800\t01/01/2026\t31/12/2026\t\t\t\t\t\t'].join('\n');
  const R = P.parseRentRoll(T);
  eq('i titoli si riconoscono (anche con accenti e maiuscole); le colonne ignote si dicono', [R.columns.interno, R.columns.pagato, R.unknown], [0, 12, ['Note']]);
  const r1 = R.rows[0];
  eq('una riga piena all\'italiana', [r1.interno, r1.canone, r1.deposito, r1.dal, r1.al, r1.telefono, r1.email, r1.tipo, r1.cedolare, r1.registrato, r1.pagatoSi],
    ['1', 1250, 2500, '2025-09-01', '2027-08-31', '3331234567', 'mario@example.invalid', 'transitorio', 'si', '2025-09-20', true]);
  eq('«int. 3» è l\'interno 3; «sì» senza data al pagato è pagato', [R.rows[2].interno, R.rows[2].pagatoSi, R.rows[2].pagato, R.rows[2].tipo], ['3', true, '', '3+2']);
  eq('un interno libero non ha errori', R.rows[1].errors, []);
  ok('una riga sbagliata dice TUTTO ciò che non va', ['canone «abc»', 'inizio «32/01/2025»'].every(x => R.rows[3].errors.some(e => e.startsWith(x))) &&
    ['piano «boh»', 'telefono «12»', 'email «nope»', 'tipo «xx»'].every(x => R.rows[3].warnings.some(w => w.startsWith(x))), R.rows[3]);
  ok('un interno ripetuto è un errore (mai due contratti sulla stessa riga del palazzo)', R.rows[4].errors.some(e => /ripetuto/.test(e)));
  eq('senza la colonna Interno non si legge niente', P.parseRentRoll('Nome;Canone\nA;1').errors, ['senza_interno']);
  eq('separatori: punto e virgola, virgola fra virgolette', P.parseRentRoll('Interno;Inquilino;Canone;Dal;Al\n7;"Rossi; Mario";1.000;01/01/2026;31/12/2026').rows[0].inquilino, 'Rossi; Mario');

  const ectx = P.context({ properties: [], now: NOW });
  const good = R.rows.filter(r => !r.errors.length);
  const plan = P.planImport(good, ectx, { address: 'Piazzale Prenestino 42, Roma', ownerId: 'o-chiara', ownerName: 'Chiara', gestioneDal: F.month });
  eq('il piano: interni, contratti, rate', [plan.counts.create, plan.counts.contracts, plan.errors], [3, 2, []]);
  const c1 = plan.contracts.find(c => c.interno === '1');
  ok('il contratto porta i fatti della tabella, firmato su carta, gestito da BOOM dal mese scelto', c1.data.status === 'active' && c1.data.signatureStatus === 'paper' && c1.data.paymentsFrom === F.month &&
    c1.data.rliRegisteredAt === '2025-09-20' && c1.data.registrationStatus === 'registered' && c1.data.cedolareSecca === 'si' && c1.data.tenantPhone === '3331234567');
  const p1 = plan.payments.filter(x => x.interno === '1');
  eq('LE RATE PARTONO DALLA GESTIONE, mai dalla decorrenza del 2025 (niente arretrati inventati)', p1[0].data.month, F.month);
  ok('…fino alla fine del contratto, una al mese, con l\'id del generatore del portal', p1.at(-1).data.month === '2027-08' && p1.every(x => x.id === 'pay_' + c1.id + '_' + x.data.month));
  eq('pagata SOLO quella che la tabella dice pagata, con la data e la fonte dichiarata', [p1[0].data.status, p1[0].data.paidDate, p1[0].data.paidVia, p1[1].data.status],
    ['paid', F.month + '-03', 'dichiarato', 'pending']);
  const p3 = plan.payments.filter(x => x.interno === '3');
  eq('un contratto che inizia nel mese: la prima scadenza non cade prima dell\'ingresso', p3[0].data.dueDate >= p3[0].data.month + '-01', true);
  const prop2 = plan.properties.find(x => x.interno === '2');
  ok('il libero nasce come interno disponibile, della proprietaria, gestito dal mese scelto', !prop2.exists && prop2.data.ownerId === 'o-chiara' && prop2.data.availabilityStatus === 'available' && prop2.data.gestioneDal === F.month);
  eq('senza proprietaria o indirizzo il piano lo dice', [P.planImport(good, ectx, { address: 'Piazzale Prenestino 42', gestioneDal: F.month }).errors, P.planImport(good, ectx, { address: '', ownerId: 'x' }).errors], [['proprietaria'], ['indirizzo']]);

  // Reincollare la stessa tabella quando è già caricata: niente doppioni.
  const loaded = P.context({ now: NOW,
    properties: plan.properties.map(x => ({ id: x.id, ...x.data })),
    contracts: plan.contracts.map(x => ({ id: x.id, ...x.data })),
    payments: plan.payments.map(x => ({ id: x.id, ...x.data })) });
  const again = P.planImport(good, loaded, { address: 'P.le Prenestino 42', ownerId: 'o-chiara', gestioneDal: F.month });
  eq('reincollata: niente da creare né da cambiare (l\'indirizzo scritto in un altro modo è lo stesso palazzo)', [again.counts.create, again.counts.update, again.counts.same, again.counts.contracts, again.counts.payments, again.properties.length], [0, 0, 3, 0, 0, 0]);
  const other = P.planImport(good, loaded, { address: 'Piazzale Prenestino 42', ownerId: 'altro', gestioneDal: F.month });
  ok('un interno già di un altro proprietario non si sposta da qui', other.errors.some(e => e.startsWith('owner:')));
  const lm = P.model(loaded, again.buildingKey, F.month);
  eq('caricato, il Palazzo lo legge: 3 interni, 2 pieni, int. 1 pagato', [lm.units.length, lm.totals.occupied, lm.units.find(u => u.interno === '1').month.state], [3, 2, 'paid']);
  eq('…e il mese prima è «Prima di BOOM», non due arretrati', lm.units.find(u => u.interno === '1').arrears.count, 0);
  ok('il modello da scaricare si rilegge da solo senza errori', P.parseRentRoll(P.RR_TEMPLATE).rows.every(r => !r.errors.length));
}
// ── 12b. Quello che i contratti veri aggiungono (Prenestino, 8/10) ──────
// Due studenti per interno in solido, oneri fissi pagati col canone, un
// locatore che è una società col suo conto. Nomi e numeri inventati.
{
  const mm = F.month.slice(5, 7) + '/' + F.month.slice(0, 4);
  const T = ['Interno\tPiano\tInquilino\tCo-intestatari\tTelefono\tCanone\tOneri\tDal\tAl\tTipo\tDeposito\tCedolare\tLocatore\tIBAN\tMq',
    '7\tsecondo\tAda Uno\tBea Due\t+90 533 000 00 00\t1.600\t120 €/mese\t01/' + mm + '\t30/06/2027\tstudenti\t3200\tno\tAcme S.r.l.\tIT60 X054 2811 1010 0000 0123 456\t48,06',
    '11\tterzo\tCarlo Tre\tDino Quattro / Carlo Tre + Eva Cinque\t+39 351 000 0000\t1500\t120\t01/' + mm + '\t30/06/2027\tstudenti\t3000\tno\tAcme S.r.l.\tIT60X0542811101000000123457\t48',
    '13\t\tElsa Sei\t\t\t1600\tcentoventi\t01/' + mm + '\t30/06/2027\tstudenti\t\t\t\t\t'].join('\n');
  const R = P.parseRentRoll(T);
  eq('i titoli nuovi si riconoscono, nessuna colonna ignorata', [R.columns.coinquilini, R.columns.oneri, R.columns.locatore, R.columns.iban, R.columns.mq, R.unknown], [3, 6, 12, 13, 14, []]);
  const [a, b, c] = R.rows;
  eq('una riga del contratto vero: co-intestatari, oneri «120 €/mese», IBAN con gli spazi, mq con la virgola', [a.coinquilini, a.oneri, a.iban, a.mq, a.locatore, a.errors],
    [['Bea Due'], 120, 'IT60X0542811101000000123456', 48.06, 'Acme S.r.l.', []]);
  eq('i co-intestatari si separano con / + e, senza ripetere l\'intestatario', b.coinquilini, ['Dino Quattro', 'Eva Cinque']);
  ok('un IBAN che non passa il controllo NON si carica e lo si dice', b.iban === '' && b.warnings.some(w => /IBAN .* non valido/.test(w)) && !b.errors.length);
  ok('oneri illeggibili fermano la riga (sbaglierebbero la rata), come il canone', c.errors.some(e => /^oneri «centoventi»/.test(e)));
  const plan = P.planImport([a, b], P.context({ properties: [], now: NOW }), { address: 'Via Prova 9, Roma', ownerId: 'o', gestioneDal: F.month });
  const ca = plan.contracts.find(x => x.interno === '7').data, cb = plan.contracts.find(x => x.interno === '11').data;
  eq('il contratto porta chi firma con lui, gli oneri, il locatore e il conto', [ca.coTenants, ca.oneriQuota, ca.landlordName, ca.landlordIban], [[{ name: 'Bea Due' }], 120, 'Acme S.r.l.', 'IT60X0542811101000000123456']);
  ok('…e senza un IBAN valido il contratto non ne inventa uno', !('landlordIban' in cb));
  const pa = plan.payments.find(x => x.interno === '7').data;
  eq('LA RATA È IL TOTALE che l\'inquilino versa, con le due voci accanto', [pa.amount, pa.rentAmount, pa.oneriAmount], [1720, 1600, 120]);
  eq('l\'interno prende i mq (fill-only)', plan.properties.find(x => x.interno === '7').data.sqm, 48.06);
  const loaded = P.context({ now: NOW,
    properties: plan.properties.map(x => ({ id: x.id, ...x.data })),
    contracts: plan.contracts.map(x => ({ id: x.id, ...x.data, ...(x.interno === '11' ? { oneriQuota: '', coTenants: [{ name: 'Già Scritto' }] } : {}) })),
    payments: plan.payments.map(x => ({ id: x.id, ...x.data })) });
  const b2 = { ...b, iban: 'IT60X0542811101000000123456' };
  const again = P.planImport([a, b2], loaded, { address: 'Via Prova 9', ownerId: 'o', gestioneDal: F.month });
  const upd = again.contracts.filter(x => x.exists);
  eq('reincollata: solo i campi vuoti del contratto, mai i co-intestatari già scritti, nessuna rata nuova', [upd.map(x => [x.interno, x.data]), again.counts.contractUpdates, again.counts.payments],
    [[['11', { oneriQuota: 120, landlordIban: 'IT60X0542811101000000123456' }]], 1, 0]);
  ok('se gli oneri arrivano dopo le rate, il piano lo dice (le rate in archivio non si ricalcolano da qui)', again.notes.includes('oneri:11'));
  const lm = P.model(loaded, again.buildingKey, F.month);
  const u7 = lm.units.find(u => u.interno === '7');
  eq('il Palazzo legge i due intestatari e atteso = canone + oneri', [u7.month.tenants, u7.month.expected, u7.month.rent], [['Ada Uno', 'Bea Due'], 1720, 1600]);
}
// ── 12b-bis. Mesi di CONTRATTO, non di calendario ──────────────────────
{
  const R = P.parseRentRoll('Interno\tInquilino\tCanone\tOneri\tDal\tAl\n7\tAda Uno\t1600\t120\t15/09/2026\t14/08/2027\n8\tBea Due\t1000\t\t01/09/2026\t15/06/2027\n9\tCia Tre\t900\t\t31/01/2027\t29/04/2027\n').rows;
  const pl = P.planImport(R, P.context({ properties: [], now: '2026-09-01T10:00:00Z' }), { address: 'Via Prova 9', ownerId: 'o', gestioneDal: '2026-09' });
  const r7 = pl.payments.filter(x => x.interno === '7').map(x => x.data);
  eq('dal 15/09 al 14/08 sono UNDICI rate (settembre → luglio), mai una dodicesima ad agosto', [r7.length, r7[0].month, r7.at(-1).month, r7.at(-1).periodFrom, r7.at(-1).periodTo, r7.at(-1).amount],
    [11, '2026-09', '2027-07', '2027-07-15', '2027-08-14', 1720]);
  eq('la prima scadenza non cade prima dell\'ingresso', r7[0].dueDate, '2026-09-15');
  const r8 = pl.payments.filter(x => x.interno === '8').map(x => x.data);
  eq('l\'ultimo periodo parziale si paga in proporzione (1–15 giugno = 15/30), dichiarato', [r8.length, r8.at(-1).amount, r8.at(-1).prorated, r8[0].prorated], [10, 500, true, undefined]);
  eq('fine mese tenuto: dal 31/01 il periodo dopo parte il 28/02', pl.payments.filter(x => x.interno === '9').map(x => x.data.periodFrom), ['2027-01-31', '2027-02-28', '2027-03-31']);
}
// ── 12c. Chi abita lì ma il contratto non è ancora arrivato ────────────
{
  const mm = F.month.slice(5, 7) + '/' + F.month.slice(0, 4);
  const R = P.parseRentRoll('Interno\tInquilino\tTelefono\tCanone\tDal\tAl\n14\tGaia Sette\t+39 324 000 0000\t\t\t\n5\tIda Otto\t\t1200\t\t\n');
  const [a, b] = R.rows;
  ok('inquilino senza canone NÉ date: occupato, contratto da caricare (avviso, non errore)', a.senzaContratto && !a.errors.length && a.warnings.some(w => /contratto da caricare/.test(w)));
  ok('…ma un dato a metà (canone senza date) resta un errore', !b.senzaContratto && b.errors.some(e => /inizio mancante/.test(e)));
  const plan = P.planImport([a], P.context({ properties: [], now: NOW }), { address: 'Via Prova 9, Roma', ownerId: 'o', gestioneDal: F.month });
  const c0 = plan.contracts[0];
  eq('nasce l\'interno occupato e un contratto segnaposto: nessuna data, nessuna rata', [plan.properties[0].data.availabilityStatus, c0.id.endsWith('_da-caricare'), c0.data.contractMissing, c0.data.startDate, plan.payments.length, plan.counts.missing],
    ['rented', true, true, undefined, 0, 1]);
  const loaded = P.context({ now: NOW, properties: plan.properties.map(x => ({ id: x.id, ...x.data })), contracts: plan.contracts.map(x => ({ id: x.id, ...x.data })) });
  const lm = P.model(loaded, plan.buildingKey, F.month), u = lm.units[0];
  eq('il Palazzo lo dice com\'è: occupato, senza rata, canone sconosciuto (mai €0), e in Da sistemare', [u.month.occupied, u.month.state, u.month.rent, lm.issues.map(i => i.code)], [true, 'norate', null, ['unplaced', 'nocontract']]);
  eq('reincollato com\'è: niente di nuovo', P.planImport([a], loaded, { address: 'Via Prova 9', ownerId: 'o', gestioneDal: F.month }).contracts.length, 0);
  const full = P.parseRentRoll('Interno\tInquilino\tCanone\tOneri\tDal\tAl\n14\tGaia Sette\t1100\t120\t01/' + mm + '\t30/06/2027\n').rows;
  const done = P.planImport(full, loaded, { address: 'Via Prova 9', ownerId: 'o', gestioneDal: F.month });
  eq('arrivato il contratto: si COMPLETA lo stesso (mai un secondo contratto vivo) e nascono le rate', [done.contracts.length, done.contracts[0].id, done.contracts[0].exists, done.contracts[0].data.contractMissing, done.contracts[0].data.rent, done.payments[0].data.contractId === c0.id, done.payments[0].data.amount],
    [1, c0.id, true, false, 1100, true, 1220]);
}
{
  const app2 = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
  ok('la presa in carico è solo admin, con conferma, e chiede al SERVER cosa esiste prima di scrivere', /async function palazzoImport\(plan\) \{\s*if \(!isAdmin\(\)[\s\S]{0,900}confirm\([\s\S]{0,700}\.get\(\)[\s\S]{0,600}where\('contractId', 'in'/.test(app2));
  ok('scrive solo properties, contracts, payments', !/palazzoImport[\s\S]*?collection\('(?!properties|contracts|payments)[a-zA-Z]+'\)[\s\S]*?async function palazzoSaveLook/.test(app2));
}

// ── 13. Manutenzione e utenze ──────────────────────────────────────────
{
  const mt = id => m.units.find(u => u.id === id).maintenance;
  eq('aperta: la caldaia di /casa («riscaldamento», «emergency», «pending») letta col vocabolario del portal', [mt('u7').open.length, mt('u7').open[0].priority, mt('u7').open[0].category, mt('u7').urgent], [1, 'urgent', 'Caldaia / riscaldamento', 1]);
  ok('in lavorazione resta aperta e lo dice; chi l\'ha segnalata si sa', mt('u11').open[0].inProgress && mt('u11').open[0].reporter === 'owner');
  eq('chiusa: non è aperta, ma si ricorda (ultima chiusa)', [mt('u4').open.length, mt('u4').recentClosed[0].resolvedAt], [0, F.D(-35)]);
  eq('i totali del palazzo contano i guasti aperti e gli urgenti, mai quelli di un altro palazzo', [m.totals.maintOpen, m.totals.maintUrgent], [2, 1]);
  const mine = P.model(ctx, '', F.month, { filter: p => p.ownerId === 'owner-demo' });
  ok('la proprietaria vede i guasti dei suoi interni', mine.units.find(u => u.id === 'u7').maintenance.open.length === 1);
  eq('POD/PDR: puliti e controllati nella forma', [P.utenzeOf({ pod: 'it001e 0000 0001', pdr: '0000-0000-0000-01' }), m.units.find(u => u.id === 'u7').utenze.podOk],
    [{ pod: 'IT001E00000001', pdr: '00000000000001', podOk: true, pdrOk: true }, false]);
  eq('POD a 9 cifre finali vale, uno con lettere no', [P.podOk('IT012E123456789'), P.podOk('IT012X12345678'), P.pdrOk('1234567890123')], [true, false, false]);
  const ur = P.utenzeRows(m), u1 = ur.find(r => r[0] === '1'), u7 = ur.find(r => r[0] === '7');
  eq('il foglio delle utenze per il mediatore: codici e validità, mai un recapito', [P.UTENZE_HEAD.length, u1[4], u1[5], u1[6], u7[5]], [8, 'IT001E00000001', 'sì', '00000000000001', 'da controllare']);
  ok('…e nessun telefono né email nel foglio', !JSON.stringify(ur).includes('+39') && !JSON.stringify(ur).includes('@'));
  const R = P.parseRentRoll('Interno;POD;PDR\n1;IT001E00000099;00000000000099\n2;IT1;\n');
  eq('la tabella porta anche POD e PDR (con l\'avviso se la forma non torna)', [R.rows[0].pod, R.rows[0].pdr, R.rows[1].warnings.some(w => /POD «IT1»/.test(w))], ['IT001E00000099', '00000000000099', true]);
  const loaded = P.context({ now: NOW, properties: [{ id: 'k1', address: 'Via Prova 1', interno: '1', ownerId: 'o', gestioneDal: '2026-01' }, { id: 'k2', address: 'Via Prova 1', interno: '2', ownerId: 'o', pod: 'IT001E00000002' }] });
  const pl = P.planImport(R.rows, loaded, { address: 'Via Prova 1', ownerId: 'o', gestioneDal: F.month });
  eq('aggiornare le utenze di interni esistenti: solo i campi vuoti, mai la gestione già scritta', pl.properties.map(x => [x.id, x.data]),
    [['k1', { pod: 'IT001E00000099', pdr: '00000000000099' }], ['k2', { gestioneDal: F.month }]]);
}

const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
ok('sw.js: motore, vista e foglio del Palazzo viaggiano col portale (network-first)', ['/js/palazzo-engine.js', '/js/palazzo.js', '/css/palazzo.css'].every(f => sw.includes("url.pathname === '" + f + "'")));

console.log(`\n${n} check passati — palazzo sintetico, nessuna rete.`);
