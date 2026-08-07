// tests/reverse/run.mjs — la ricerca rovesciata: chi cercava questa casa.
//
// Il valore è ovvio (una lista calda invece del traffico freddo). Il RISCHIO
// no: mandare la casa sbagliata alla persona sbagliata non è un'occasione
// mancata, è credibilità bruciata — e su WhatsApp, col tuo numero.
//
// Quindi si testa soprattutto CHI NON DEVE ESSERE DISTURBATO: i morti, gli
// inquilini, chi ha già chiesto quella casa, chi è già stato avvisato, e chi
// riceverebbe una casa fuori budget.
//
// Esegui: node tests/reverse/run.mjs

import {
  leadCriteria, scoreLeadForListing, rankLeadsForListing, vetoFor,
  bedsFromText, budgetFromText, zonesFromText, freshnessFactor,
  outreachText, waLink, MATCH_THRESHOLD,
} from '../../api/leads/_reverse.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

const NOW = Date.parse('2026-08-10T12:00:00Z');
const ago = d => new Date(NOW - d * 86400000).toISOString();

const CATALOG = [
  { id: 'l1', name: 'Trilocale Pigneto', zone: 'Pigneto', address: 'Via del Pigneto 42', price: 1400, beds: 2 },
  { id: 'l2', name: 'Bilocale Trastevere', zone: 'Trastevere', address: 'Vicolo del Cinque 3', price: 1200, beds: 1 },
  { id: 'l3', name: 'Monolocale Ostiense', zone: 'Ostiense', address: 'Via Ostiense 210', price: 800, beds: 0 },
  { id: 'l4', name: 'Attico Parioli', zone: 'Parioli', address: 'Viale Parioli 9', price: 3200, beds: 3 },
];
const BY_ID = new Map(CATALOG.map(l => [l.id, l]));
const ZONES = CATALOG.map(l => l.zone);

// ── 1. leggere le parole di una persona vera ───────────────────────────────
{
  ok('bilocale → 1 camera', bedsFromText('cercavo un bilocale a Trastevere') === 1);
  ok('monolocale → 0', bedsFromText('un monolocale va benissimo') === 0);
  ok('"due camere" → 2', bedsFromText('mi serve con due camere da letto') === 2);
  ok('"2 bedroom" (inglese) → 2', bedsFromText('looking for a 2 bedroom flat') === 2);
  ok('niente taglia → null', bedsFromText('salve, cerco casa') === null);

  ok('"sotto i 1200"', JSON.stringify(budgetFromText('sotto i 1200 al mese')) === JSON.stringify({ min: 0, max: 1200 }));
  ok('"max 1300"', (budgetFromText('max 1300 euro') || {}).max === 1300);
  ok('"fino a 1100"', (budgetFromText('fino a 1100') || {}).max === 1100);
  ok('"up to 1500" (inglese)', (budgetFromText('budget up to 1500') || {}).max === 1500);
  ok('intervallo "1000-1200"', JSON.stringify(budgetFromText('tra 1000 e 1200')) === JSON.stringify({ min: 1000, max: 1200 }));
  ok('un numero a caso non è un budget', budgetFromText('abito al civico 42 da 3 anni') === null,
    budgetFromText('abito al civico 42 da 3 anni'));

  ok('zone dal catalogo vero', zonesFromText('cerco a Pigneto o Ostiense', ZONES).sort().join(',') === 'Ostiense,Pigneto');
  ok('zona non in catalogo → ignorata', zonesFromText('cerco a Milano', ZONES).length === 0);
}

// ── 2. LA CASA CHIESTA È IL BRIEFING ───────────────────────────────────────
// È il cuore dell'idea: chi ha scritto per un trilocale da €1.400 a Pigneto
// sta cercando quello, anche se non ha compilato nessun modulo.
{
  const lead = { id: 'a', name: 'Sophie', phone: '+393331', propertyId: 'l1', propertyTitle: 'Trilocale Pigneto', message: 'Hi, is this still available?', createdAt: ago(5) };
  const c = leadCriteria(lead, BY_ID, ZONES);
  ok('la zona della casa chiesta diventa criterio', c.zones.includes('Pigneto'), c.zones);
  ok('le camere della casa chiesta diventano criterio', c.beds === 2, c.beds);
  ok('il prezzo chiesto diventa una fascia', c.budget && c.budget.max >= 1400 && c.budget.min <= 1400, c.budget);
  ok('…derivata, non inventata', c.budget.from === 'asked', c.budget);

  // le sue PAROLE battono la casa chiesta
  const talky = { ...lead, message: 'in realtà cercavo un bilocale sotto i 1200' };
  const c2 = leadCriteria(talky, BY_ID, ZONES);
  ok('le parole battono il prezzo dedotto', c2.budget.max === 1200, c2.budget);
  ok('le parole battono le camere dedotte', c2.beds === 1, c2.beds);
  ok('…ma la zona chiesta resta', c2.zones.includes('Pigneto'), c2.zones);
}

// ── 3. il punteggio ────────────────────────────────────────────────────────
{
  const crit = { budget: { min: 1000, max: 1300 }, beds: 1, zones: ['Trastevere'], askedId: null };
  const fresh = { createdAt: ago(3) };
  const perfect = scoreLeadForListing(crit, CATALOG[1], fresh, NOW);      // Bilocale Trastevere 1200
  ok('incastro perfetto → punteggio alto', perfect.score >= 95, perfect);
  ok('…e dice perché', perfect.reasons.some(r => r.includes('zona ✓')) && perfect.reasons.some(r => r.includes('budget ✓')), perfect.reasons);

  const tooDear = scoreLeadForListing(crit, CATALOG[3], fresh, NOW);      // Attico 3200
  ok('molto fuori budget → zero, mai proposta', tooDear.score === 0, tooDear);
  ok('…e lo dice', tooDear.reasons.some(r => r.includes('fuori budget')), tooDear.reasons);

  const other = scoreLeadForListing(crit, CATALOG[2], fresh, NOW);        // Monolocale Ostiense 800
  ok('sotto budget e altra zona → punteggio basso', other.score < MATCH_THRESHOLD, other);
}

// ── 4. il tempo pesa, ma non cancella ──────────────────────────────────────
{
  ok('scritto ieri → pieno', freshnessFactor(ago(1), NOW) === 1);
  ok('un mese fa → un po\' meno', freshnessFactor(ago(30), NOW) === 0.85);
  ok('tre mesi fa → molto meno', freshnessFactor(ago(85), NOW) === 0.6);
  ok('un anno fa → poco, mai zero', freshnessFactor(ago(400), NOW) > 0, freshnessFactor(ago(400), NOW));
  ok('senza data → neutro', freshnessFactor(null, NOW) === 0.5);

  const crit = { budget: { min: 1000, max: 1300 }, beds: 1, zones: ['Trastevere'] };
  const a = scoreLeadForListing(crit, CATALOG[1], { createdAt: ago(2) }, NOW);
  const b = scoreLeadForListing(crit, CATALOG[1], { createdAt: ago(90) }, NOW);
  ok('chi ha scritto ieri viene prima', a.score > b.score, { a: a.score, b: b.score });

  // TRE MESTIERI SEPARATI: la freschezza ORDINA, non esclude. Un match
  // perfetto di due mesi fa resta un match perfetto — solo, più in basso.
  ok('il calzare (base) non lo tocca il tempo', a.base === b.base, { a: a.base, b: b.base });
  const LEADS = [{ id: 'old', name: 'Vecchio', phone: '+393339999999', status: 'new',
    message: 'cerco bilocale a Trastevere sotto 1300', createdAt: ago(90) }];
  ok('…quindi il match vecchio resta in lista',
    rankLeadsForListing(CATALOG[1], LEADS, BY_ID, ZONES, NOW).length === 1,
    rankLeadsForListing(CATALOG[1], LEADS, BY_ID, ZONES, NOW));

  // …ma oltre l'orizzonte commerciale è un VETO esplicito, non un punteggio
  // che sfuma: chi cercava a marzo ha già firmato altrove.
  const ancient = [{ ...LEADS[0], id: 'ancient', createdAt: ago(200) }];
  ok('oltre 120 giorni → veto esplicito',
    rankLeadsForListing(CATALOG[1], ancient, BY_ID, ZONES, NOW).length === 0);
  ok('…e il veto dice perché', /oltre \d+ giorni/.test(vetoFor(ancient[0], CATALOG[1], NOW) || ''),
    vetoFor(ancient[0], CATALOG[1], NOW));
}

// ── 5. I VETI — la parte che protegge la reputazione ───────────────────────
{
  const L = CATALOG[1];
  ok('lead morto → mai', vetoFor({ grade: 'dead', phone: '+39333' }, L) !== null);
  ok('già inquilino → mai', vetoFor({ status: 'converted', phone: '+39333' }, L) !== null);
  ok('senza recapito → mai', vetoFor({ name: 'X' }, L) !== null);
  ok('la casa che aveva già chiesto → mai',
    vetoFor({ phone: '+39333', propertyId: 'l2' }, L) === 'è già diventato inquilino' ? false
      : vetoFor({ phone: '+39333', propertyId: 'l2' }, L) !== null);
  ok('già avvisato per questa casa → mai',
    vetoFor({ phone: '+39333', notifiedListings: ['l2'] }, L) !== null);
  ok('una persona vera e raggiungibile → nessun veto',
    vetoFor({ phone: '+393331234567', grade: 'B', status: 'new' }, L) === null);
}

// ── 6. la classifica, sui dati come sono nella realtà ──────────────────────
{
  const LEADS = [
    { id: 'p1', name: 'Sophie K', phone: '+393331111111', grade: 'A', status: 'new',
      propertyId: 'l1', propertyTitle: 'Trilocale Pigneto',
      message: 'Hi! Actually I was looking for a 1 bedroom around 1200 in Trastevere', createdAt: ago(4) },
    { id: 'p2', name: 'Marco R', phone: '+393332222222', grade: 'B', status: 'new',
      message: 'cerco un bilocale a Trastevere, budget max 1250', createdAt: ago(40) },
    { id: 'p3', name: 'Spammer', phone: '+393333333333', grade: 'dead', message: 'CLICK HERE', createdAt: ago(1) },
    { id: 'p4', name: 'Già inquilino', phone: '+393334444444', status: 'converted',
      message: 'bilocale trastevere 1200', createdAt: ago(2) },
    { id: 'p5', name: 'Chi l\'ha già chiesta', phone: '+393335555555', status: 'new',
      propertyId: 'l2', message: 'è ancora libero?', createdAt: ago(1) },
    { id: 'p6', name: 'Ricco', phone: '+393336666666', status: 'new',
      message: 'cerco attico a Parioli, budget 3000-3500', createdAt: ago(3) },
    { id: 'p7', name: 'Già avvisato', phone: '+393337777777', status: 'new',
      message: 'bilocale trastevere sotto 1300', notifiedListings: ['l2'], createdAt: ago(2) },
  ];
  const r = rankLeadsForListing(CATALOG[1], LEADS, BY_ID, ZONES, NOW);   // Bilocale Trastevere 1200
  const ids = r.map(x => x.lead.id);

  ok('trova le persone giuste', ids.includes('p1') && ids.includes('p2'), ids);
  ok('lo spam resta fuori', !ids.includes('p3'), ids);
  ok('l\'inquilino resta fuori', !ids.includes('p4'), ids);
  ok('chi l\'aveva già chiesta resta fuori', !ids.includes('p5'), ids);
  ok('chi cerca tutt\'altro resta fuori', !ids.includes('p6'), ids);
  ok('chi era già stato avvisato resta fuori', !ids.includes('p7'), ids);
  ok('ordinati per punteggio', r.every((x, i) => i === 0 || r[i - 1].score >= x.score), r.map(x => x.score));
  ok('il più fresco e preciso è primo', ids[0] === 'p1', ids);
  ok('ognuno porta il suo motivo', r.every(x => x.reasons.length > 0));
}

// ── 7. il messaggio già scritto ────────────────────────────────────────────
{
  const en = { lead: { name: 'Sophie Kuhlwein', phone: '+393331111111', propertyTitle: 'Trilocale Pigneto', message: 'Hi, is this still available? I am moving to Rome' }, lang: 'en' };
  const t = outreachText(en, CATALOG[1]);
  ok('inglese a chi scrive inglese', /Hi Sophie/.test(t) && !/Ciao/.test(t), t.slice(0, 60));
  ok('nomina la casa che aveva chiesto', t.includes('Trilocale Pigneto'), t);
  ok('porta il link giusto', t.includes('/listing/l2'), t);
  ok('e il prezzo', t.includes('1.200') || t.includes('1,200'), t);

  const it = { lead: { name: 'Marco Rossi', phone: '3332222222', message: 'buongiorno, cercavo un bilocale' }, lang: 'it' };
  const t2 = outreachText(it, CATALOG[1]);
  ok('italiano a chi scrive italiano', /Ciao Marco/.test(t2), t2.slice(0, 60));
  ok('senza casa chiesta non inventa', !t2.includes('undefined') && !t2.includes('null'), t2);

  const link = waLink(it, CATALOG[1]);
  ok('il numero nazionale diventa internazionale', link.startsWith('https://wa.me/393332222222'), link);
  ok('nessun telefono → nessun link', waLink({ lead: { name: 'X' }, lang: 'it' }, CATALOG[1]) === null);
}

console.log(fails ? `\n${fails} FALLITI` : '\nTutto verde.');
process.exit(fails ? 1 : 0);
