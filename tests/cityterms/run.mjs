// tests/cityterms/run.mjs — the order terms of the desks that charge at
// signing (api/_cityterms.js): the text the Paris search mandate and the
// Berlin search order carry, in the order email and its PDF.
//
// What breaks if this goes red:
//   - a word of the terms changed without a new version: an order recorded
//     with termsV par-2026-11-1 would point to a text that no longer exists
//     (the pinned hashes below);
//   - a clause the order must carry is missing: the fee and its trigger per
//     fare, "Nothing is due or paid before a lease is signed; if no such lease
//     is signed, nothing is due.", "BOOM holds no client money, deposit or
//     rent", the collection by invoice within 7 days, the six months of the
//     Paris mandate, the Bestellerprinzip scope and the ‘Confirmed’ reply in
//     Berlin, the withdrawal instructions and the model form;
//   - the terms claim a licence, a permit, a card number, a register of agents
//     or a partner, or carry the six desks' refund rule or a proportional
//     amount on withdrawal;
//   - the terms drift from the rest of the system: the prices of CITY_PLANS,
//     the company of cities/_shared.json, the model form the six desks' emails
//     carry, the protections line of Terms §12, the registry's order prefix
//     and months once the flip writes them;
//   - one order's document prints the wrong fare, the wrong Start-now choice,
//     a date in the wrong time zone, or a {placeholder} left unfilled;
//   - the PDF font would drop a character (api/_pdfbrand.js wa() keeps every
//     one).
// Pure Node: no browser, no network.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ORDER_TERMS, termsCanonical, termsHash, renderOrderTerms, orderExpiresOn } from '../../api/_cityterms.js';
import { CITY_PLANS, CITY_MARKETS } from '../../api/_market.js';
import { wa } from '../../api/_pdfbrand.js';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MOD = path.join(R, 'api/_cityterms.js');
// the webhook builds a Stripe client at load: a dummy key, no request is ever made
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_for_import';
const { WITHDRAWAL_FORM_TEXT } = await import('../../api/stripe-webhook.js');

let ok = 0, ko = 0;
const check = (cond, t, why = '') => { if (cond) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + t); } else { ko++; console.log('  \x1b[31m✗\x1b[0m ' + t + (why ? ` — ${why}` : '')); } };
const section = (t) => console.log('\n  \x1b[1m' + t + '\x1b[0m');
const throwsCode = (fn, code) => { try { fn(); return 'no error'; } catch (e) { return e && e.code === code ? true : String(e && (e.code || e.message)); } };
// matching ignores case, spacing and the typographic quotes
const norm = (s) => String(s).normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const textOf = (p) => (typeof p === 'string' ? p : p.text);
const langText = (city, lang) => ORDER_TERMS[city][lang].map(textOf).join('\n');
const PLAN_IDS = Object.keys(CITY_PLANS);
const CITIES = ['paris', 'berlin'];
const DESK = { paris: 'Paris', berlin: 'Berlin' };

// AN EDIT TO THE TERMS IS A NEW VERSION. Change a word in api/_cityterms.js →
// bump its `v` (par-2026-11-2), then pin the new hash here:
//   node --input-type=module -e "import('./api/_cityterms.js').then(m => console.log(m.termsHash('paris'), m.termsHash('berlin')))"
// Never re-pin without bumping `v`: an order keeps the termsV it was placed
// on, and that version must keep naming one text.
const PINNED = {
  paris: { v: 'par-2026-11-1', hash: '081cf45c4037c0ddd9b6fecdc92ec41cea95e8a5b34dbb42920781ea6438c3d6' },
  berlin: { v: 'ber-2026-11-1', hash: '4abc6b15dcf179c978ee3e6712a6d7ce4eba038312eb746389eb077cf0fb92ab' },
};

// one order, used by sections 5, 6, 8 and 9 (a Paris Full Search, Start now not ticked)
const SAMPLE_BASE = { name: 'Anna Keller', email: 'anna@example.com', orderedAt: '2026-11-04T13:07:00Z', withdrawalEndsOn: '2026-11-18', workFrom: '2026-11-19' };
const SAMPLE = { ...SAMPLE_BASE, city: 'paris', plan: 'full-search', number: 'PAR-2026-0007', expiresOn: '2027-05-04', startNow: false };

console.log('\n\x1b[1m▸ cityterms\x1b[0m  the order terms of Paris and Berlin: versions, the hash, every clause, nothing claimed, one order rendered');

// ─────────────────────────────────────────────────────────────────────────
section('1 · the shape and the two versions');
check(JSON.stringify(Object.keys(ORDER_TERMS).sort()) === '["berlin","paris"]', 'two desks have order terms, Paris and Berlin, and no other', JSON.stringify(Object.keys(ORDER_TERMS)));
for (const city of CITIES) check(ORDER_TERMS[city].v === PINNED[city].v, `${city}: version ${PINNED[city].v}`, ORDER_TERMS[city].v);
check(ORDER_TERMS.paris.title === 'Mandat de recherche non exclusif / Non-exclusive search mandate', 'Paris: titled «Mandat de recherche non exclusif / Non-exclusive search mandate»', ORDER_TERMS.paris.title);
check(ORDER_TERMS.berlin.title === 'Suchauftrag / Search order', 'Berlin: titled «Suchauftrag / Search order»', ORDER_TERMS.berlin.title);
check(Array.isArray(ORDER_TERMS.paris.fr) && Array.isArray(ORDER_TERMS.paris.en), 'Paris: the French text with its English translation');
check(Array.isArray(ORDER_TERMS.berlin.en) && !('fr' in ORDER_TERMS.berlin), 'Berlin: English only');
const allFrozen = (o) => Object.isFrozen(o) && Object.values(o).every((v) => !v || typeof v !== 'object' || allFrozen(v));
check(allFrozen(ORDER_TERMS), 'the terms are deep-frozen: no caller can change the text behind its hash');

const PLACEHOLDERS = new Set(['number', 'name', 'email', 'orderedAt', 'expiresOn', 'withdrawalEndsOn', 'workFrom']);
const kindOf = (p) => (typeof p === 'string' ? 'all' : 'plan' in p ? 'plan:' + p.plan : 'start:' + p.startNow);
for (const city of CITIES) for (const lang of ['en', 'fr']) {
  const items = ORDER_TERMS[city][lang];
  if (!items) continue;
  const tag = `${city}/${lang}`;
  const badShape = items.filter((p) => !(typeof p === 'string' || (p && typeof p.text === 'string' && (
    (Object.keys(p).sort().join() === 'plan,text' && PLAN_IDS.includes(p.plan))
    || (Object.keys(p).sort().join() === 'startNow,text' && typeof p.startNow === 'boolean')))));
  check(badShape.length === 0, `${tag}: every paragraph is a string, a { plan, text } of a real fare or a { startNow, text }`, JSON.stringify(badShape).slice(0, 200));
  const texts = items.map(textOf);
  check(texts.every((t) => !/[\r\n\u2028\u2029]/.test(t) && t === t.trim() && t.length > 0), `${tag}: no paragraph is empty or holds a line break (the canonical text is one line each)`);
  check(texts.every((t) => !/^[[{]/.test(t)), `${tag}: no paragraph starts with "[" or "{" (they would read as a language or a tag)`);
  const unknown = [...new Set(texts.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].filter((k) => !PLACEHOLDERS.has(k));
  check(unknown.length === 0, `${tag}: placeholders only from {number} {name} {email} {orderedAt} {expiresOn} {withdrawalEndsOn} {workFrom}`, unknown.join(', '));
  const dropped = texts.filter((t) => wa(t) !== t);
  check(dropped.length === 0, `${tag}: every character survives the PDF font (wa() keeps it: no «œ», no narrow space)`, dropped.map((t) => t.slice(0, 60)).join(' | '));
  const need = city === 'berlin' ? 3 : 2;
  for (const plan of PLAN_IDS) {
    const n = items.filter((p) => p.plan === plan).length;
    check(n === need, `${tag}: ${plan} has its own ${need} paragraphs (what we do${city === 'berlin' ? ', its scope' : ''}, the fee and its trigger)`, String(n));
  }
  check(items.filter((p) => p.startNow === true).length === 1 && items.filter((p) => p.startNow === false).length === 1, `${tag}: one paragraph for "Start now" ticked, one for not ticked`);
  check(new Set(texts).size === texts.length, `${tag}: no paragraph is printed twice`);
}
check(ORDER_TERMS.paris.en.length === ORDER_TERMS.paris.fr.length
  && ORDER_TERMS.paris.en.every((p, i) => kindOf(p) === kindOf(ORDER_TERMS.paris.fr[i])),
  'Paris: the English is paragraph for paragraph the French (same fares and Start-now choices at the same places)');

// ─────────────────────────────────────────────────────────────────────────
section('2 · the canonical text and its hash');
// the format documented in the header of api/_cityterms.js, written again here
const byHand = (city) => {
  const T = ORDER_TERMS[city];
  let s = `BOOM ORDER TERMS\ncity: ${city}\nv: ${T.v}\ntitle: ${T.title}\n`;
  for (const lang of ['en', 'fr']) {
    if (!T[lang]) continue;
    s += `[${lang}]\n`;
    for (const p of T[lang]) s += (typeof p === 'string' ? '' : 'plan' in p ? `{plan:${p.plan}} ` : `{start:${p.startNow ? 'yes' : 'no'}} `) + textOf(p) + '\n';
  }
  return s.normalize('NFC');
};
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
for (const city of CITIES) {
  check(termsCanonical(city) === byHand(city), `${city}: termsCanonical is exactly the documented format`);
  check(termsHash(city) === sha(byHand(city)), `${city}: termsHash is the SHA-256 of that text, hex`);
  check(termsHash(city) === PINNED[city].hash, `${city}: the hash is the pinned one — the text of ${PINNED[city].v} has not moved`,
    `got ${termsHash(city)}: an edit to the terms is a NEW VERSION — bump v in api/_cityterms.js, then re-pin`);
  check(termsHash(city) === termsHash(city) && /^[0-9a-f]{64}$/.test(termsHash(city)), `${city}: the same hash on every call, 64 hex`);
}
check(termsHash('paris') !== termsHash('berlin'), 'the two desks hash differently');
check(['amsterdam', 'madrid', 'rome', '', 'constructor', '__proto__', 'toString'].every((c) => termsHash(c) === null && termsCanonical(c) === null),
  'a desk with no order terms (the six that charge at the checkout, Rome, a prototype name) has no text and no hash');
// one character moves the hash (the pin above is what catches an edit)
check(sha(byHand('paris').replace('within 7 days', 'within 8 days')) !== termsHash('paris'), 'one character changed → another hash');

// ─────────────────────────────────────────────────────────────────────────
section('3 · every clause the order must carry');
const missing = (text, list) => list.filter(([, needle]) => !norm(text).includes(norm(needle))).map(([label]) => label);
const BOTH_EN = (city) => [
  ['the company', 'Egidi Immobiliare S.r.l.'],
  ['its address', 'Via dei Coronari 181/184, 00186 Roma'],
  ['its REA', 'REA RM-1710623'],
  ['its VAT number', 'VAT IT17322991005'],
  ['the client', '{name} ({email}), the client'],
  ['the order number', '{number}'],
  ['the date and time of the order', 'placed on {orderedAt}'],
  ['the both-parties rule', 'A lease counts as signed when both you and the landlord have signed it.'],
  ['nothing before a lease', 'Nothing is due or paid before a lease is signed; if no such lease is signed, nothing is due.'],
  ['no client money', 'BOOM holds no client money, deposit or rent'],
  ['the collection', 'emails you an invoice, VAT included, with a secure payment link; it is payable within 7 days'],
  ['no card at the order', 'No card is taken when you order.'],
  ['not exclusive', 'It is not exclusive'],
  ['no fee after the order ends', 'No fee is due for a lease signed after it ends.'],
  ['Start now ticked', 'You ticked “Start now”: you asked BOOM to begin before your 14-day withdrawal period ends, and acknowledged that once the service is fully performed you can no longer withdraw.'],
  ['Start now not ticked', 'You did not tick “Start now”: we begin on {workFrom}'],
  ['the right of withdrawal', 'within 14 days without giving any reason'],
  ['its end date', 'on {withdrawalEndsOn}'],
  ['online withdrawal', `online at https://www.boomrome.com/withdrawal?desk=${DESK[city]}#online (“Withdraw from contract here”, then “Confirm withdrawal”)`],
  ['by email', 'by email to hello@boom-rome.com'],
  ['the trader\'s telephone', 'telephone +39 331 325 1961'],
  ['the model form, not obligatory', 'You may use the model withdrawal form below, but it is not obligatory.'],
  ['the online acknowledgement', 'If you withdraw online, we send you an acknowledgement of receipt by email without delay.'],
  ['the deadline rule', 'it is enough to send your statement before the period ends'],
  ['nothing owed on withdrawal', 'nothing has been paid and nothing will be due'],
  ['the model form', 'MODEL WITHDRAWAL FORM'],
  ['the governing law', 'Italian law governs this'],
  ['the protections line', 'nothing in them removes the mandatory protections of the law of the country where you live, or your right to bring proceedings in its courts.'],
  ['AP trigger', 'Fee: €199, VAT included, due only if you sign the lease of a home you applied to with our dossier.'],
  ['AV trigger', 'Fee: €149, VAT included, for each attended viewing of the home whose lease you sign; due only if you sign the lease of a home we viewed for you.'],
  ['the AV object', 'Attended Viewing: a BOOM person attends a viewing in your place'],
];
const REQUIRED = {
  'paris/en': [...BOTH_EN('paris'),
    ['the register number line', 'Register number (our register of mandates, in date order): {number}.'],
    ['six months', 'This mandate runs for six months from the day it is placed, up to and including {expiresOn}'],
    ['renewed only by a new order', 'It is renewed only by a new order.'],
    ['the landlord\'s agent\'s capped share (F12)', "The landlord's agent may charge you its capped share (loi 89-462 art. 5), separately"],
    ['FS object', 'Full Search: every working day we search SeLoger, PAP, Leboncoin and agencies'],
    ['FS fee and the extra viewings (D14)', 'Fee: €500, VAT included. One attended viewing is included; each further attended viewing you ask for costs €149, VAT included, and is charged only with the Full Search fee, when that fee is due.'],
    ['FS trigger (D4)', 'The fee is due only if, while this mandate runs, you sign the lease of a home we found or brought to you.'],
    ['AP object', 'Application Pack: your French-format rental dossier'],
  ],
  'paris/fr': [
    ['la société', 'Egidi Immobiliare S.r.l.'],
    ['REA et TVA', 'REA RM-1710623, TVA IT17322991005'],
    ['le numéro du registre', "Numéro d'inscription au registre des mandats : {number}."],
    ['le mandant', '{name} ({email}), le mandant'],
    ['date et heure', 'Mandat passé le {orderedAt}'],
    ['rien avant un bail', "Rien n'est dû ni payé avant la signature d'un bail ; si aucun bail de ce type n'est signé, rien n'est dû."],
    ['aucun fonds', 'BOOM ne détient aucune somme du client, ni dépôt de garantie, ni loyer'],
    ['la part plafonnée', "L'agent du bailleur peut vous facturer sa part plafonnée (loi n° 89-462, art. 5), séparément"],
    ['six mois', 'Le présent mandat est conclu pour six mois'],
    ['non exclusif', "Il n'est pas exclusif"],
    ['la facture sous 7 jours', 'elle est payable sous 7 jours'],
    ['FS honoraires', 'Honoraires : 500 €, TVA comprise.'],
    ['AP honoraires', 'Honoraires : 199 €, TVA comprise'],
    ['AV honoraires', 'Honoraires : 149 €, TVA comprise'],
    ['Start now coché', 'Vous avez coché « Start now »'],
    ['Start now pas coché', "Vous n'avez pas coché « Start now » : nous commençons le {workFrom}"],
    ['le droit de rétractation', 'sans donner de motif dans un délai de quatorze jours'],
    ['la rétractation en ligne', '(« Withdraw from contract here », puis « Confirm withdrawal »)'],
    ['accusé de réception', 'accusé de réception'],
    ['rien dû en cas de rétractation', "rien n'a été payé et rien ne sera dû"],
    ['le formulaire', 'MODÈLE DE FORMULAIRE DE RÉTRACTATION'],
    ['le droit applicable', 'régi par le droit italien'],
  ],
  'berlin/en': [...BOTH_EN('berlin'),
    ['the order number line', 'Order number: {number}.'],
    ['until signed or stopped', 'This order runs until you sign a lease it covers, or until you ask us to stop.'],
    ['the Bestellerprinzip scope', 'Who pays (Bestellerprinzip): you ordered this search, so you pay for it'],
    ['the go-ahead home (D3)', 'gave us a written go-ahead to offer it to you alone'],
    ['never an agent\'s home', 'It never covers a home the landlord has given to an agent'],
    ['the legal cap', "never more than two months' net cold rent (Nettokaltmiete) plus VAT"],
    ['no other charge alongside Full Search (D15)', 'No other charge alongside Full Search'],
    ['viewings included', 'attended viewings are included'],
    ['the ‘Confirmed’ reply (D18)', 'Please reply ‘Confirmed’ to this email'],
    ['AP/AV for a home the client finds (O18)', 'is for a home you find yourself: we do not find the home, and we do not negotiate with its landlord'],
    ['AP/AV not alongside Full Search', 'It is not charged while you hold a Full Search order with this desk.'],
  ],
};
for (const [key, list] of Object.entries(REQUIRED)) {
  const [city, lang] = key.split('/');
  const gone = missing(langText(city, lang), list);
  check(gone.length === 0, `${key}: all ${list.length} clauses present`, 'missing: ' + gone.join(' · '));
}
const fsBerlin = ORDER_TERMS.berlin.en.filter((p) => p.plan === 'full-search').map(textOf).join(' ');
check(!/\(more:|€149/.test(fsBerlin), 'Berlin Full Search names no extra viewing price (D15: viewings included)');
check(ORDER_TERMS.berlin.en.filter((p) => p.plan && p.plan !== 'full-search' && /is for a home you find yourself/.test(textOf(p))).length === 2, 'Berlin: both Application Pack and Attended Viewing say they are for a home the client finds (O18)');
// the clause check bites: a mutated text loses exactly the clause it changed
check(JSON.stringify(missing(langText('paris', 'en').replace('nothing is due.', 'nothing is owed.'), REQUIRED['paris/en'])) === '["nothing before a lease"]', 'mutation: rewording "nothing is due" is caught by name');
check(JSON.stringify(missing(langText('berlin', 'en').replace('reply ‘Confirmed’', 'answer'), REQUIRED['berlin/en'])) === '["the ‘Confirmed’ reply (D18)"]', 'mutation: dropping the ‘Confirmed’ reply is caught by name');

// ─────────────────────────────────────────────────────────────────────────
section('4 · nothing claimed, nothing the six desks say');
const FORBIDDEN = [
  [/licen[cs]|lizenz/i, 'a licence'],
  [/permit/i, 'a permit'],
  [/erlaubnis|zulassung|§\s*34|\b34\s?c\b|\bgewo\b/i, 'a German permit or its statute'],
  [/carte\s+(professionnelle|[tg]\b)|card number|kartennummer/i, 'a professional card or a card number'],
  [/partner|partenaire/i, 'a partner'],
  [/raicv|aicat|registro de agentes|registre d.agents|registre des agents|handelsregister|registre du commerce|\brcs\b|kamer van koophandel|\bkvk\b|\bihk\b|\bcci\b|chambre de commerce|chamber of commerce|vermittlerregister|gewerberegister/i, 'the name of a register of agents or a trade register'],
  [/garantie financière|financial guarantee|\blps\b/i, 'a Hoguet guarantee or declaration'],
  [/accredit|certifi|agréé|habilit|titulaire|member of|membre d|regulated|réglementé|registered/i, 'a status claim'],
  [/refund|rembours/i, 'a refund (the six desks\' rule: here nothing is ever paid before a lease)'],
  [/work already done|travail déjà|in proportion|proportionnel|minus/i, 'a proportional amount on withdrawal'],
  [/stripe/i, 'the payment provider'],
  [/guaranteed|garanti\b/i, 'a guarantee of result'],
  [/boom\s+s\.?r\.?l|gmbh|\bsarl\b|\bsas\b/i, 'another company'],
];
const forbiddenHits = (text) => FORBIDDEN.filter(([re]) => re.test(text)).map(([, label]) => label);
for (const city of CITIES) {
  const hits = forbiddenHits(termsCanonical(city));
  check(hits.length === 0, `${city}: no licence, permit, card number, register of agents, partner, refund, proportional amount or provider`, hits.join(' · '));
}
check(!/percent/i.test(termsCanonical('berlin')), 'Berlin: no percentage line (D2: "No percentage" is banned on Berlin)');
check(/register of mandates/.test(termsCanonical('paris')) && /registre des mandats/.test(termsCanonical('paris')), 'Paris: the register named is our own register of mandates (the number the décret asks for), never a register of agents');
// the guard bites
check(forbiddenHits(termsCanonical('paris') + ' Opening with a licensed partner.').length === 2, 'mutation: «licensed partner» appended is caught twice (licence, partner)');
check(forbiddenHits('Carte professionnelle n° CPI 7501 2026 000 000 001').length === 1 && forbiddenHits('§34c GewO').length === 1 && forbiddenHits('Registered with the Generalitat').length === 1,
  'mutation: a card number, §34c and «registered» are each caught');

// ─────────────────────────────────────────────────────────────────────────
section('5 · the terms agree with the rest of the system');
for (const city of CITIES) for (const lang of ['en', 'fr']) {
  const items = ORDER_TERMS[city][lang];
  if (!items) continue;
  for (const plan of PLAN_IDS) {
    const eur = CITY_PLANS[plan].eur;
    const price = lang === 'fr' ? `${eur} €` : `€${eur}`;
    check(items.filter((p) => p.plan === plan).some((p) => p.text.includes(price)), `${city}/${lang}: ${plan} states ${price}, the price of CITY_PLANS`);
  }
  const amounts = [...langText(city, lang).matchAll(/€\s?(\d+(?:[.,]\d+)*)|(\d+(?:[.,]\d+)*)\s?€/g)].map((m) => Number(m[1] || m[2]));
  check(amounts.length > 0 && amounts.every((n) => [500, 199, 149].includes(n)), `${city}/${lang}: no amount but the three fares`, amounts.join(', '));
}
const SHARED = JSON.parse(fs.readFileSync(path.join(R, 'cities/_shared.json'), 'utf8'));
for (const city of CITIES) {
  const c = termsCanonical(city);
  const want = [SHARED.entity.legalName, SHARED.entity.address, 'RM-1710623', 'IT' + SHARED.entity.vat, SHARED.contact.email, SHARED.contact.phoneDisplay];
  check(SHARED.entity.rea === 'RM-1710623' && want.every((s) => c.includes(s)), `${city}: the company, its address, REA, VAT, email and phone are cities/_shared.json's`, want.filter((s) => !c.includes(s)).join(' · '));
  check(ORDER_TERMS[city].en.includes(WITHDRAWAL_FORM_TEXT), `${city}: the model withdrawal form is word for word the one the six desks' emails carry`);
}
const TERMS_HTML = fs.readFileSync(path.join(R, 'terms.html'), 'utf8');
const PROTECT = 'removes the mandatory protections of the law of the country where you live, or your right to bring proceedings in its courts.';
check(/id="city-desks"/.test(TERMS_HTML), 'Terms has the #city-desks section the governing-law line links to');
check(TERMS_HTML.includes(PROTECT), 'Terms §12 still says the protections line the order terms repeat',
  'Terms §12 changed it: re-word the order terms (a new version) or keep the line');
for (const city of CITIES) check(termsCanonical(city).includes(PROTECT) && termsCanonical(city).includes('https://www.boomrome.com/terms#city-desks'), `${city}: the governing-law line repeats Terms §12 and links to it`);
// the registry: today Paris and Berlin are waitlists; the flip writes order: { prefix, months } (spec §3.1)
for (const city of CITIES) {
  const o = (CITY_MARKETS[city] || {}).order;
  if (!o) { console.log(`    · ${city}: the registry has no order block yet (waitlist until the flip): prefix and months checked from the flip on`); continue; }
  check(throwsCode(() => renderOrderTerms({ ...SAMPLE_BASE, city, plan: 'application-pack', number: `${o.prefix}-2026-0001`, startNow: true }), 'none') === 'no error',
    `${city}: the registry's prefix ${o.prefix} is the one the terms accept`);
  const exp = orderExpiresOn(city, '2026-11-04');
  check(o.months == null ? exp === null : exp === `${2026 + Math.floor((10 + o.months) / 12)}-${String((10 + o.months) % 12 + 1).padStart(2, '0')}-04`,
    `${city}: the registry's ${o.months == null ? 'open-ended order' : o.months + ' months'} is the length the terms print`, String(exp));
}

// ─────────────────────────────────────────────────────────────────────────
section('6 · one order, rendered');
const parisFs = renderOrderTerms(SAMPLE);
const has = (list, s) => list.some((p) => p.includes(s));
const starts = (list, s) => list.some((p) => p.startsWith(s));
const leftover = (r) => [...(r.en || []), ...(r.fr || [])].filter((p) => /\{[A-Za-z]+\}/.test(p));
check(parisFs.city === 'paris' && parisFs.v === 'par-2026-11-1' && parisFs.hash === termsHash('paris') && parisFs.title === ORDER_TERMS.paris.title,
  'Paris Full Search: the render carries the version, the hash and the title the order record stores');
check(parisFs.en[0] === 'Register number (our register of mandates, in date order): PAR-2026-0007.', 'the register number line opens the mandate', parisFs.en[0]);
check(has(parisFs.en, 'Between Anna Keller (anna@example.com), the client, and Egidi Immobiliare S.r.l. (BOOM Paris)'), 'the parties, the client by name and email');
check(has(parisFs.en, 'Mandate placed on 4 November 2026, 14:07 (Rome time)'), 'the date and time in Rome (13:07 UTC = 14:07 CET)');
check(has(parisFs.en, 'up to and including 4 May 2027'), 'the six months end on the order record\'s expiresOn');
check(has(parisFs.en, 'for this mandate, on 18 November 2026') && has(parisFs.en, 'we begin on 19 November 2026'), 'the end of the 14 days and the first working day after it');
check(starts(parisFs.en, 'Full Search: every working day') && has(parisFs.en, 'each further attended viewing you ask for costs €149'), 'the ordered fare: Full Search, its object, fee and the extra viewings');
check(!starts(parisFs.en, 'Application Pack:') && !starts(parisFs.en, 'Attended Viewing:') && !has(parisFs.en, 'Fee: €199') && !has(parisFs.en, 'Fee: €149'), 'the other two fares are not printed');
check(has(parisFs.en, 'You did not tick “Start now”') && !has(parisFs.en, 'You ticked “Start now”'), 'the Start-now choice as made (not ticked)');
check(parisFs.en.includes(WITHDRAWAL_FORM_TEXT), 'the model form is in the document');
check(parisFs.en[parisFs.en.length - 1] === `Terms version par-2026-11-1; SHA-256 of the terms text: ${termsHash('paris')}.`, 'the last line names the version and the text hash', parisFs.en[parisFs.en.length - 1]);
check(Array.isArray(parisFs.fr) && parisFs.fr.length === parisFs.en.length, 'the French text, as long as the English');
check(parisFs.fr[0] === "Numéro d'inscription au registre des mandats : PAR-2026-0007.", 'FR: le numéro du registre', parisFs.fr[0]);
check(has(parisFs.fr, 'Mandat passé le 4 novembre 2026 à 14:07 (heure de Rome)') && has(parisFs.fr, "jusqu'au 4 mai 2027 inclus") && has(parisFs.fr, 'le 18 novembre 2026') && has(parisFs.fr, 'nous commençons le 19 novembre 2026'),
  'FR: dates in French, from the fixed month table');
check(parisFs.fr[parisFs.fr.length - 1] === `Version des conditions par-2026-11-1 ; empreinte SHA-256 du texte des conditions : ${termsHash('paris')}.`, 'FR: the last line names the version and the hash');
check(leftover(parisFs).length === 0, 'no {placeholder} left unfilled', leftover(parisFs).join(' | ').slice(0, 200));
check([...parisFs.en, ...parisFs.fr].every((p) => wa(p) === p), 'every rendered character survives the PDF font');

const parisAv = renderOrderTerms({ ...SAMPLE_BASE, city: 'paris', plan: 'attended-viewing', number: 'PAR-2026-0008', startNow: true, workFrom: undefined });
check(starts(parisAv.en, 'Attended Viewing: a BOOM person') && has(parisAv.en, 'Fee: €149, VAT included, for each attended viewing') && !starts(parisAv.en, 'Full Search:'), 'Paris Attended Viewing: its own fare only');
check(has(parisAv.en, 'You ticked “Start now”') && !has(parisAv.en, 'You did not tick') && has(parisAv.fr, 'Vous avez coché « Start now »'), 'ticked: the Start-now acknowledgement, in both languages');
check(has(parisAv.en, 'up to and including 4 May 2027'), 'expiresOn omitted → the order day in Rome + six months (orderExpiresOn)');

const berlinFs = renderOrderTerms({ ...SAMPLE_BASE, name: 'Lena Vogt', email: 'lena@example.de', city: 'berlin', plan: 'full-search', number: 'BER-2026-0001', startNow: false });
check(berlinFs.en[0] === 'Order number: BER-2026-0001.' && !('fr' in berlinFs), 'Berlin Full Search: the order number, English only', berlinFs.en[0]);
check(has(berlinFs.en, 'Who pays (Bestellerprinzip)') && has(berlinFs.en, 'No other charge alongside Full Search') && has(berlinFs.en, "two months' net cold rent"), 'the Bestellerprinzip scope, the cap and no stacking');
check(has(berlinFs.en, 'Please reply ‘Confirmed’ to this email'), 'the ‘Confirmed’ reply');
check(!has(berlinFs.en, 'six months') && !has(berlinFs.en, 'up to and including'), 'no six months in Berlin: until signed or stopped');
check(leftover(berlinFs).length === 0 && berlinFs.en[berlinFs.en.length - 1].includes(termsHash('berlin')), 'no {placeholder} left, the Berlin hash on the last line');

const berlinAp = renderOrderTerms({ ...SAMPLE_BASE, city: 'berlin', plan: 'application-pack', number: 'BER-2026-0002', startNow: true });
check(starts(berlinAp.en, 'Application Pack: your German-format rental dossier') && has(berlinAp.en, 'Application Pack is for a home you find yourself') && has(berlinAp.en, 'It is not charged while you hold a Full Search order with this desk.'),
  'Berlin Application Pack: its object, the client-found scope and no stacking');
check(!has(berlinAp.en, 'Bestellerprinzip') && !starts(berlinAp.en, 'Full Search:'), 'the Full Search scope is not printed on an Application Pack order');

// every render is free of forbidden words too
for (const [label, r] of [['Paris FS', parisFs], ['Paris AV', parisAv], ['Berlin FS', berlinFs], ['Berlin AP', berlinAp]]) {
  const hits = forbiddenHits([...r.en, ...(r.fr || [])].join('\n'));
  check(hits.length === 0, `${label}: nothing claimed in the rendered document`, hits.join(' · '));
}

// ─────────────────────────────────────────────────────────────────────────
section('7 · dates: Rome time, months from a table, six months counted the French way');
const stampOf = (orderedAt, lang = 'en') => renderOrderTerms({ ...SAMPLE, orderedAt })[lang][2];
check(stampOf('2026-07-01T10:00:00Z').includes('1 July 2026, 12:00 (Rome time)'), 'summer: 10:00 UTC is 12:00 in Rome (CEST)', stampOf('2026-07-01T10:00:00Z'));
check(stampOf('2026-11-04T23:30:00Z').includes('5 November 2026, 00:30 (Rome time)'), 'past midnight in Rome: the next day', stampOf('2026-11-04T23:30:00Z'));
check(stampOf('2026-11-30T23:30:00Z', 'fr').includes('1er décembre 2026 à 00:30 (heure de Rome)'), 'FR: the first of the month is «1er»', stampOf('2026-11-30T23:30:00Z', 'fr'));
check(stampOf(Date.UTC(2026, 10, 4, 13, 7)).includes('4 November 2026, 14:07') && stampOf(new Date('2026-11-04T13:07:00Z')).includes('4 November 2026, 14:07'), 'an instant as epoch milliseconds or a Date reads the same');
check(orderExpiresOn('paris', '2026-11-04') === '2027-05-04', 'Paris: 4 Nov 2026 + six months = 4 May 2027 (the spec\'s example)');
check(orderExpiresOn('paris', '2026-08-31') === '2027-02-28' && orderExpiresOn('paris', '2027-08-31') === '2028-02-29' && orderExpiresOn('paris', '2026-12-31') === '2027-06-30',
  'a day the sixth month lacks ends on that month\'s last day (28/29 February, 30 June)');
check(orderExpiresOn('paris', '2026-08-31T22:30:00Z') === '2027-03-01', 'an instant counts from its Rome day (22:30 UTC on 31 Aug is 1 Sep in Rome)', orderExpiresOn('paris', '2026-08-31T22:30:00Z'));
check(orderExpiresOn('berlin', '2026-11-04') === null && orderExpiresOn('amsterdam', '2026-11-04') === null, 'Berlin runs until signed or stopped; a desk with no terms has no end');
check(throwsCode(() => orderExpiresOn('paris', 'soon'), 'bad_order_day') === true, 'an order day that is not a day is refused');

// ─────────────────────────────────────────────────────────────────────────
section('8 · what cannot be rendered truthfully is refused');
const refuse = (patch, code, label) => check(throwsCode(() => renderOrderTerms({ ...SAMPLE, ...patch }), code) === true, label, String(throwsCode(() => renderOrderTerms({ ...SAMPLE, ...patch }), code)));
refuse({ city: 'amsterdam' }, 'unknown_city', 'a desk that charges at the checkout has no order terms');
refuse({ city: 'constructor' }, 'unknown_city', 'a prototype name is not a desk');
refuse({ plan: 'virtual-viewing' }, 'unknown_plan', 'a fare the desks do not sell');
refuse({ number: '' }, 'number_required', 'no order number');
refuse({ number: 'BER-2026-0007' }, 'number_mismatch', 'a Berlin number on a Paris mandate');
refuse({ number: 'PAR-26-7' }, 'number_mismatch', 'a number that is not <prefix>-<year>-<0000>');
refuse({ name: '  ' }, 'name_required', 'no client name');
refuse({ email: 'anna.example.com' }, 'email_required', 'no client email');
refuse({ orderedAt: 'yesterday' }, 'bad_orderedAt', 'an order time that is not a time');
refuse({ orderedAt: '2026-11-04' }, 'bad_orderedAt', 'a bare day is not an instant (it would print as 01:00 in Rome)');
refuse({ withdrawalEndsOn: '2026-02-30' }, 'bad_withdrawalEndsOn', 'a withdrawal end that is not a real day');
refuse({ workFrom: undefined }, 'workFrom_required', 'not ticked and no start day');
refuse({ expiresOn: '2027-13-01' }, 'bad_expiresOn', 'an expiry that is not a real day');
const strTrue = renderOrderTerms({ ...SAMPLE, startNow: 'true' });
check(has(strTrue.en, 'You did not tick “Start now”'), 'startNow "true" (a string) is not a tick: only the boolean true is');
const injected = renderOrderTerms({ ...SAMPLE, name: 'Eve {number}\nX', email: 'eve@example.com' });
check(has(injected.en, 'Between Eve number X (eve@example.com)') && !has(injected.en, 'Eve PAR-2026-0007'), 'a name cannot fill another placeholder or break a line');

// ─────────────────────────────────────────────────────────────────────────
section('9 · pure and deterministic');
const src = fs.readFileSync(MOD, 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const imports = [...code.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
check(JSON.stringify(imports) === '["node:crypto"]', 'the module imports node:crypto and nothing else (no npm dependency, no sibling with side effects)', JSON.stringify(imports));
check(!/\bprocess\.|\bfetch\(|Date\.now|Math\.random|readFileSync|\brequire\(|new Date\(\s*\)/.test(code), 'no environment, network, clock or randomness in the module');
const childCode = `import { termsHash, renderOrderTerms } from ${JSON.stringify(pathToFileURL(MOD).href)};
console.log(JSON.stringify({ p: termsHash('paris'), b: termsHash('berlin'), r: renderOrderTerms(${JSON.stringify(SAMPLE)}) }));`;
let child = null;
try {
  child = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', childCode], {
    encoding: 'utf8', env: { ...process.env, TZ: 'Pacific/Auckland', LANG: 'fr_FR.UTF-8', LC_ALL: 'fr_FR.UTF-8' },
  }));
} catch (e) { child = { error: String(e.message).slice(0, 200) }; }
check(child && child.p === PINNED.paris.hash && child.b === PINNED.berlin.hash, 'a fresh process in another time zone and locale computes the same two hashes', JSON.stringify(child).slice(0, 200));
check(child && JSON.stringify(child.r) === JSON.stringify(parisFs), 'and renders the same order to the same paragraphs (Rome time, not the machine\'s)');

console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
