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
eq('lo stato di ogni interno nel mese', states, { 1: 'paid', 2: 'vacant', 3: 'late', 4: 'paid', 5: 'due', 6: 'review', 7: 'paid', 8: 'norate', 9: 'incoming', 10: 'paid', 11: 'paid', 12: 'late', 13: 'vacant' });
const t = m.totals;
eq('pieni/liberi/in arrivo', [t.units, t.occupied, t.vacant, t.incoming], [13, 10, 2, 1]);
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

// ── 7. Invarianti (ognuna è un difetto possibile) ────────────────────
for (const u of m.units) {
  if (u.month.state === 'norate') ok('int. ' + u.interno + ' senza rata: niente incassato, niente ritardo', u.month.collected === 0 && u.month.lateAmount === 0);
  if (u.month.state === 'vacant') ok('int. ' + u.interno + ' libero: nessun inquilino inventato', u.month.tenants.length === 0 && !u.month.occupied);
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

console.log(`\n${n} check passati — palazzo sintetico, nessuna rete.`);
