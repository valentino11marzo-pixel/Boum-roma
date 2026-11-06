// api/_cityterms.js — the ORDER TERMS of the desks that charge at signing
// (Paris, Berlin). ONE copy, pure: no npm dependency and no I/O (node:crypto
// only, for the hash; no clock: every date comes from the caller). Read by
// the server — the order email and its PDF (renderOrderTerms), the order
// record (city.order.termsV + termsHash), the 409 `terms_changed` when a page
// posts an older termsV — and by the build (ORDER_TERMS_V in the page config
// of a signing desk). Spec v1.8 §3.6; what the document must contain: the
// law-first design §5.4.
//
// Why each clause is there, one line each:
//   · parties, number, date and time (Rome): the order IS the contract (Paris:
//     the written, numbered search mandate; Berlin: the search order in text
//     form);
//   · object, fee and trigger PER FARE (D4): a fee is owed only for the lease
//     the fare covers, signed by both parties; Paris Full Search states the
//     extra viewings at €149, charged only with its fee (D14); Berlin Full
//     Search states the Bestellerprinzip scope and that nothing is charged
//     alongside it (D3, D15); Berlin AP/AV are for a home the client found,
//     with no dealing with the landlord (O18);
//   · "Nothing is due or paid before a lease is signed; if no such lease is
//     signed, nothing is due." and "BOOM holds no client money, deposit or
//     rent": no sum moves before the lease (Hoguet art. 6, WoVermRG §2(4));
//   · collection: an invoice with a secure payment link when the fee becomes
//     due, payable within 7 days; no card at the order (D1);
//   · duration: Paris six months, renewed only by a new order, not exclusive
//     (D5); Berlin until a lease is signed or the client stops it;
//   · the Start-now choice as ticked (only `true` is ticked);
//   · withdrawal: Annex I(A) adapted — 14 days from the order, online, by
//     email, by post or with the form, an acknowledgement for the online
//     route, "nothing has been paid and nothing will be due", and NO
//     proportional-amount sentence (nothing is ever owed before a lease) —
//     then the model form of Annex I(B);
//   · the governing-law line of Terms §12 (the protections line of
//     terms.html#city-desks, word for word in its second half);
//   · the text hash: added by the renderer, since it cannot sit inside the
//     text it hashes.
// NEVER in it: a licence, a permit, a card number, the name of a register of
// agents or a trade register, a partner (D20: the pages claim nothing, and
// neither does the contract). tests/cityterms/run.mjs refuses each. "Our
// register of mandates" is the order's own numbering (décret 72-678 art. 72,
// the Paris register NUMBER the spec requires), not a register of agents.
//
// THE SHAPE. ORDER_TERMS[city] = { v, title, en: [...], fr: [...] (Paris) }.
// Each list is the document, paragraph by paragraph, in reading order. A
// paragraph is
//   · a string — printed on every order;
//   · { plan, text } — printed only on an order for that fare;
//   · { startNow: true|false, text } — printed only on an order whose
//     Start-now tick matches.
// Placeholders, filled by renderOrderTerms: {number} {name} {email}
// {orderedAt} {expiresOn} {withdrawalEndsOn} {workFrom}. No paragraph holds a
// line break or starts with "[" or "{". Every character is one the PDF font
// prints (api/_pdfbrand.js wa() keeps it): no "œ", no narrow no-break space.
// Paris is the French text with its English translation: a document prints
// `fr` first; the email may carry `en` alone, the PDF carries both.
//
// THE CANONICAL TEXT (what termsHash hashes; anyone can recompute it):
//     BOOM ORDER TERMS
//     city: <city>
//     v: <v>
//     title: <title>
//     [en]
//     <one line per en paragraph>
//     [fr]                                   (Paris only)
//     <one line per fr paragraph>
// A paragraph line is its text, prefixed by "{plan:<id>} " for a fare
// paragraph and by "{start:yes} " / "{start:no} " for a Start-now paragraph.
// Every line ends with "\n". The whole is Unicode NFC, hashed as UTF-8 with
// SHA-256, hex. The placeholders stay unfilled: the hash names the TEXT an
// order was placed on, not one order.
//
// AN EDIT IS A NEW VERSION. Any change to a word here (or to a constant
// below) changes the hash: bump `v` (par-2026-11-2) and the pinned hashes in
// tests/cityterms/run.mjs. An order keeps the termsV and termsHash it was
// placed on, and a page posts its own termsV: an old page is refused with
// 409 terms_changed, never silently given new terms.

import { createHash } from 'node:crypto';

const PLAN_IDS = ['full-search', 'application-pack', 'attended-viewing'];
const LANGS = ['en', 'fr'];
// the order number's prefix and the order's length in months, per desk. The
// registry (api/_market.js CITY_MARKETS.<slug>.order, at the flip) must say
// the same: tests/cityterms/run.mjs compares them once it does.
const PREFIX = { paris: 'PAR', berlin: 'BER' };
const TERM_MONTHS = { paris: 6, berlin: null };

const CO = 'Egidi Immobiliare S.r.l.';
const ADDR_EN = 'Via dei Coronari 181/184, 00186 Roma, Italy';
const ADDR_FR = 'Via dei Coronari 181/184, 00186 Roma, Italie';
const IDS_EN = 'REA RM-1710623, VAT IT17322991005';
const IDS_FR = 'REA RM-1710623, TVA IT17322991005';
const EMAIL = 'hello@boom-rome.com';
const PHONE = '+39 331 325 1961';
const TERMS_URL = 'https://www.boomrome.com/terms#city-desks';
const withdrawUrl = (desk) => 'https://www.boomrome.com/withdrawal?desk=' + desk + '#online';

// Annex I(B), filled with the trader's details: the SAME string the six
// desks' confirmation emails carry (api/stripe-webhook.js
// WITHDRAWAL_FORM_TEXT; the test refuses a drift).
const FORM_EN = 'MODEL WITHDRAWAL FORM (complete and return this form only if you wish to withdraw from the contract): '
  + '— To Egidi Immobiliare S.r.l. (BOOM), Via dei Coronari 181/184, 00186 Roma, Italy, e-mail hello@boom-rome.com: '
  + '— I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract for the provision of the following service (*), '
  + '— Ordered on (*)/received on (*), — Name of consumer(s), — Address of consumer(s), '
  + '— Signature of consumer(s) (only if this form is notified on paper), — Date. (*) Delete as appropriate.';

// THE FRENCH TEXT IS UNVERIFIED until counsel reads it (spec §16 O17,
// Toubon): drafted on the official French model withdrawal information and
// form (Code de la consommation, annexes to articles R221-3 and R221-1), not
// by a French lawyer. Which language prevails is not stated.
const FORM_FR = 'MODÈLE DE FORMULAIRE DE RÉTRACTATION (veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat) : '
  + "— À l'attention d'Egidi Immobiliare S.r.l. (BOOM), Via dei Coronari 181/184, 00186 Roma, Italie, e-mail hello@boom-rome.com : "
  + '— Je/nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat pour la prestation de services (*) ci-dessous : '
  + '— Commandé le (*)/reçu le (*) : — Nom du (des) consommateur(s) : — Adresse du (des) consommateur(s) : '
  + '— Signature du (des) consommateur(s) (uniquement en cas de notification du présent formulaire sur papier) : — Date : (*) Rayez la mention inutile.';

const ALONE_EN = 'We act for you alone: we do not represent landlords and take nothing from landlords, their agents or platforms.';
const SIGNED_EN = 'A lease counts as signed when both you and the landlord have signed it. Nothing is due or paid before a lease is signed; if no such lease is signed, nothing is due.';
const MONEY_EN = 'BOOM holds no client money, deposit or rent: we never receive your rent, your deposit or any sum meant for the landlord.';
const COLLECT_EN = `When a fee becomes due, ${CO} emails you an invoice, VAT included, with a secure payment link; it is payable within 7 days. No card is taken when you order.`;
const START_YES_EN = 'You ticked “Start now”: you asked BOOM to begin before your 14-day withdrawal period ends, and acknowledged that once the service is fully performed you can no longer withdraw. We begin in the desk\'s first open hour.';
const START_NO_EN = 'You did not tick “Start now”: we begin on {workFrom}, the first working day after your 14-day withdrawal period. To start sooner, ask us in writing.';
const AV_OBJECT_EN = 'Attended Viewing: a BOOM person attends a viewing in your place, with a live video walkthrough, a written report (light, noise, damp, neighbours, commute) and a straight recommendation.';

// the three withdrawal paragraphs (Annex I(A) adapted) for one desk; `it` is
// what the client placed ("mandate" in Paris, "order" in Berlin)
const withdrawalEn = (desk, it) => [
  `Right of withdrawal. You have the right to withdraw from this ${it} within 14 days without giving any reason. The period runs for 14 days from the day you placed it and, if the 14th day is a Saturday, Sunday or public holiday, ends on the next working day: for this ${it}, on {withdrawalEndsOn}.`,
  `To withdraw, inform us of your decision by an unequivocal statement: online at ${withdrawUrl(desk)} (“Withdraw from contract here”, then “Confirm withdrawal”), by email to ${EMAIL}, or by post to ${CO} (BOOM), ${ADDR_EN} (telephone ${PHONE}). You may use the model withdrawal form below, but it is not obligatory. If you withdraw online, we send you an acknowledgement of receipt by email without delay. To meet the deadline, it is enough to send your statement before the period ends.`,
  `Effects of withdrawal. If you withdraw, this ${it} ends: nothing has been paid and nothing will be due.`,
];
const lawEn = (it) => `Italian law governs this ${it}, as it governs BOOM's terms (${TERMS_URL}); nothing in them removes the mandatory protections of the law of the country where you live, or your right to bring proceedings in its courts.`;

const PARIS_EN = [
  'Register number (our register of mandates, in date order): {number}.',
  `Between {name} ({email}), the client, and ${CO} (BOOM Paris), ${ADDR_EN}, ${IDS_EN}, ${EMAIL}, the agent.`,
  'Mandate placed on {orderedAt}, on the BOOM Paris page.',
  ALONE_EN,
  { plan: 'full-search', text: 'Full Search: every working day we search SeLoger, PAP, Leboncoin and agencies for homes that fit your brief; we prepare your French-format rental dossier and a one-page presentation, and apply as listings appear; one attended viewing is included; we check the rent against the rent cap (encadrement des loyers) where it applies, check the lease and read the charges.' },
  { plan: 'full-search', text: 'Fee: €500, VAT included. One attended viewing is included; each further attended viewing you ask for costs €149, VAT included, and is charged only with the Full Search fee, when that fee is due. The fee is due only if, while this mandate runs, you sign the lease of a home we found or brought to you.' },
  { plan: 'application-pack', text: 'Application Pack: your French-format rental dossier (dossier locatif) within one working day of receiving your papers, a guarantor or Visale strategy, a one-page presentation in French, and a review of the lease before you sign.' },
  { plan: 'application-pack', text: 'Fee: €199, VAT included, due only if you sign the lease of a home you applied to with our dossier.' },
  { plan: 'attended-viewing', text: AV_OBJECT_EN },
  { plan: 'attended-viewing', text: 'Fee: €149, VAT included, for each attended viewing of the home whose lease you sign; due only if you sign the lease of a home we viewed for you.' },
  SIGNED_EN,
  MONEY_EN,
  "The landlord's agent may charge you its capped share (loi 89-462 art. 5), separately: it is not part of our fee, and we never collect it.",
  COLLECT_EN,
  'This mandate runs for six months from the day it is placed, up to and including {expiresOn}, and ends sooner if you sign a lease it covers or ask us to stop. It is renewed only by a new order. It is not exclusive: you remain free to search on your own and to use other agents. No fee is due for a lease signed after it ends.',
  { startNow: true, text: START_YES_EN },
  { startNow: false, text: START_NO_EN },
  ...withdrawalEn('Paris', 'mandate'),
  FORM_EN,
  lawEn('mandate'),
];

// The French text (UNVERIFIED, see FORM_FR): paragraph for paragraph the
// same document as PARIS_EN, same fare and Start-now tags at the same places
// (the test pins the parallel).
const PARIS_FR = [
  "Numéro d'inscription au registre des mandats : {number}.",
  `Entre {name} ({email}), le mandant, et ${CO} (BOOM Paris), ${ADDR_FR}, ${IDS_FR}, ${EMAIL}, le mandataire.`,
  'Mandat passé le {orderedAt}, sur la page BOOM Paris.',
  'Nous agissons uniquement pour vous : nous ne représentons aucun bailleur et ne recevons rien des bailleurs, de leurs agents ni des plateformes.',
  { plan: 'full-search', text: "Recherche complète (Full Search) : chaque jour ouvré, nous recherchons sur SeLoger, PAP, Leboncoin et auprès des agences des logements qui répondent à votre demande ; nous préparons votre dossier locatif au format français et une présentation d'une page, et nous candidatons au fil des annonces ; une visite accompagnée est comprise ; nous vérifions le loyer au regard de l'encadrement des loyers lorsqu'il s'applique, vérifions le bail et lisons les charges." },
  { plan: 'full-search', text: "Honoraires : 500 €, TVA comprise. Une visite accompagnée est comprise ; chaque visite accompagnée supplémentaire que vous demandez coûte 149 €, TVA comprise, et n'est facturée qu'avec les honoraires de recherche, lorsqu'ils sont dus. Ces honoraires ne sont dus que si, pendant la durée du présent mandat, vous signez le bail d'un logement que nous avons trouvé ou que nous vous avons présenté." },
  { plan: 'application-pack', text: "Dossier de candidature (Application Pack) : votre dossier locatif au format français dans un délai d'un jour ouvré à compter de la réception de vos pièces, une stratégie de garant ou Visale, une présentation d'une page en français et la relecture du bail avant votre signature." },
  { plan: 'application-pack', text: "Honoraires : 199 €, TVA comprise, dus uniquement si vous signez le bail d'un logement pour lequel vous avez candidaté avec notre dossier." },
  { plan: 'attended-viewing', text: 'Visite accompagnée (Attended Viewing) : une personne de BOOM visite un logement à votre place, avec une visite vidéo en direct, un compte rendu écrit (lumière, bruit, humidité, voisinage, trajets) et une recommandation franche.' },
  { plan: 'attended-viewing', text: "Honoraires : 149 €, TVA comprise, pour chaque visite accompagnée du logement dont vous signez le bail ; dus uniquement si vous signez le bail d'un logement que nous avons visité pour vous." },
  "Un bail est signé lorsque vous et le bailleur l'avez tous deux signé. Rien n'est dû ni payé avant la signature d'un bail ; si aucun bail de ce type n'est signé, rien n'est dû.",
  'BOOM ne détient aucune somme du client, ni dépôt de garantie, ni loyer : nous ne recevons jamais votre loyer, votre dépôt de garantie ni aucune somme destinée au bailleur.',
  "L'agent du bailleur peut vous facturer sa part plafonnée (loi n° 89-462, art. 5), séparément : elle ne fait pas partie de nos honoraires et nous ne l'encaissons jamais.",
  `Lorsque des honoraires deviennent dus, ${CO} vous adresse par e-mail une facture, TVA comprise, avec un lien de paiement sécurisé ; elle est payable sous 7 jours. Aucune carte n'est demandée à la commande.`,
  "Le présent mandat est conclu pour six mois à compter du jour où il est passé, soit jusqu'au {expiresOn} inclus, et prend fin plus tôt si vous signez un bail qu'il couvre ou si vous nous demandez d'arrêter. Il ne se renouvelle que par une nouvelle commande. Il n'est pas exclusif : vous restez libre de chercher vous-même et de recourir à d'autres intermédiaires. Aucun honoraire n'est dû pour un bail signé après sa fin.",
  { startNow: true, text: "Vous avez coché « Start now » : vous avez demandé à BOOM de commencer avant la fin de votre délai de rétractation de 14 jours, et reconnu qu'une fois le service pleinement exécuté vous ne pourrez plus vous rétracter. Nous commençons dès la première heure d'ouverture du bureau." },
  { startNow: false, text: "Vous n'avez pas coché « Start now » : nous commençons le {workFrom}, premier jour ouvré après votre délai de rétractation de 14 jours. Pour commencer plus tôt, demandez-le-nous par écrit." },
  'Droit de rétractation. Vous avez le droit de vous rétracter du présent mandat sans donner de motif dans un délai de quatorze jours. Ce délai court à compter du jour où vous avez passé le mandat et, si le quatorzième jour est un samedi, un dimanche ou un jour férié, il prend fin le premier jour ouvré suivant : pour ce mandat, le {withdrawalEndsOn}.',
  `Pour exercer ce droit, notifiez-nous votre décision au moyen d'une déclaration dénuée d'ambiguïté : en ligne sur ${withdrawUrl('Paris')} (« Withdraw from contract here », puis « Confirm withdrawal »), par e-mail à ${EMAIL}, ou par courrier à ${CO} (BOOM), ${ADDR_FR} (téléphone ${PHONE}). Vous pouvez utiliser le modèle de formulaire de rétractation ci-dessous, mais ce n'est pas obligatoire. Si vous vous rétractez en ligne, nous vous adressons sans délai un accusé de réception par e-mail. Pour que le délai soit respecté, il suffit que vous transmettiez votre déclaration avant son expiration.`,
  "Effets de la rétractation. Si vous vous rétractez, le présent mandat prend fin : rien n'a été payé et rien ne sera dû.",
  FORM_FR,
  `Le présent mandat est régi par le droit italien, comme les conditions de BOOM (${TERMS_URL}) ; rien n'y prive le mandant de la protection des dispositions impératives de la loi du pays où il réside, ni du droit de saisir les juridictions de ce pays.`,
];

const BERLIN_EN = [
  'Order number: {number}.',
  `Between {name} ({email}), the client, and ${CO} (BOOM Berlin), ${ADDR_EN}, ${IDS_EN}, ${EMAIL}, the agent.`,
  'Order placed on {orderedAt}, on the BOOM Berlin page.',
  ALONE_EN,
  { plan: 'full-search', text: 'Full Search: we ask landlords to let us offer their home to you alone, and offer you such homes; we prepare your self-disclosure (Selbstauskunft) and German-format application; attended viewings are included; we check the rent against the rent brake (Mietpreisbremse), check the lease and read the Nebenkosten.' },
  { plan: 'full-search', text: "Who pays (Bestellerprinzip): you ordered this search, so you pay for it, and only for a home it brings you. Full Search covers only a home whose landlord, after your order and your ‘Confirmed’, gave us a written go-ahead to offer it to you alone, and which we offer to no one else. It never covers a home the landlord has given to an agent, or one a landlord's agent offers you." },
  { plan: 'full-search', text: "Fee: €500, VAT included, and never more than two months' net cold rent (Nettokaltmiete) plus VAT: if that is lower, the fee is that amount. It is due only if you sign the lease of a home Full Search covers. No other charge alongside Full Search: viewings, the application and the lease check are included, and no Application Pack or Attended Viewing is charged while your Full Search order runs." },
  { plan: 'application-pack', text: 'Application Pack: your German-format rental dossier within one working day of receiving your papers, a SCHUFA and guarantor strategy for newcomers, a self-disclosure and cover note in German, and a review of the lease before you sign.' },
  { plan: 'application-pack', text: "Application Pack is for a home you find yourself: we do not find the home, and we do not negotiate with its landlord or the landlord's agent for you." },
  { plan: 'application-pack', text: 'Fee: €199, VAT included, due only if you sign the lease of a home you applied to with our dossier. It is not charged while you hold a Full Search order with this desk.' },
  { plan: 'attended-viewing', text: AV_OBJECT_EN },
  { plan: 'attended-viewing', text: "Attended Viewing is for a home you find yourself: we do not find the home, and we do not negotiate with its landlord or the landlord's agent for you." },
  { plan: 'attended-viewing', text: 'Fee: €149, VAT included, for each attended viewing of the home whose lease you sign; due only if you sign the lease of a home we viewed for you. It is not charged while you hold a Full Search order with this desk.' },
  SIGNED_EN,
  MONEY_EN,
  COLLECT_EN,
  'This order runs until you sign a lease it covers, or until you ask us to stop. It is not exclusive: you remain free to search on your own and to use other agents. No fee is due for a lease signed after it ends.',
  { startNow: true, text: START_YES_EN },
  { startNow: false, text: START_NO_EN },
  'Please reply ‘Confirmed’ to this email: your reply records this order in text form (Textform), and we approach no landlord for you before we receive it.',
  ...withdrawalEn('Berlin', 'order'),
  FORM_EN,
  lawEn('order'),
];

const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };

export const ORDER_TERMS = deepFreeze({
  paris: { v: 'par-2026-11-1', title: 'Mandat de recherche non exclusif / Non-exclusive search mandate', en: PARIS_EN, fr: PARIS_FR },
  berlin: { v: 'ber-2026-11-1', title: 'Suchauftrag / Search order', en: BERLIN_EN },
});

const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const tagOf = (p) => (typeof p === 'string' ? '' : 'plan' in p ? '{plan:' + p.plan + '} ' : '{start:' + (p.startNow ? 'yes' : 'no') + '} ');
const textOf = (p) => (typeof p === 'string' ? p : p.text);

// the canonical text of a desk's terms (see the header); null for a desk
// that has none (the six desks that charge at the checkout)
export function termsCanonical(city) {
  const T = own(ORDER_TERMS, String(city || ''));
  if (!T) return null;
  const lines = ['BOOM ORDER TERMS', 'city: ' + city, 'v: ' + T.v, 'title: ' + T.title];
  for (const lang of LANGS) {
    if (!T[lang]) continue;
    lines.push('[' + lang + ']');
    for (const p of T[lang]) lines.push(tagOf(p) + textOf(p));
  }
  return lines.map((l) => l + '\n').join('').normalize('NFC');
}

const HASHES = new Map();
// SHA-256 (hex) of the canonical text; null for a desk with no order terms.
// Only the desks that have terms are cached: a city string from a request
// never grows the cache.
export function termsHash(city) {
  const key = String(city || '');
  if (!own(ORDER_TERMS, key)) return null;
  if (!HASHES.has(key)) HASHES.set(key, createHash('sha256').update(termsCanonical(key), 'utf8').digest('hex'));
  return HASHES.get(key);
}

// ── dates: Rome time, month names from fixed tables (never Intl's month names:
// a small-ICU runtime prints "Sept" or the English name in every locale) ──
const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
};
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ROME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const pad = (n) => String(n).padStart(2, '0');

function dayParts(s) {
  const m = DAY_RE.exec(String(s == null ? '' : s));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, mo, d };
}
// an instant: a Date, epoch milliseconds, or an ISO string WITH a time (a
// bare day is not an instant: it would print as one o'clock in Rome)
function toInstant(v) {
  let d = null;
  if (v instanceof Date) d = new Date(v.getTime());
  else if (typeof v === 'number' && Number.isFinite(v)) d = new Date(v);
  else if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v.trim())) d = new Date(v.trim());
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
function romeParts(at) {
  const o = {};
  for (const x of ROME.formatToParts(at)) if (x.type !== 'literal') o[x.type] = Number(x.value);
  return o;
}
const dayWord = (d, lang) => (lang === 'fr' && d === 1 ? '1er' : String(d));
function fmtDay(s, lang) {
  const p = dayParts(s);
  return `${dayWord(p.d, lang)} ${MONTHS[lang][p.mo - 1]} ${p.y}`;
}
function fmtStamp(at, lang) {
  const p = romeParts(at);
  const day = `${dayWord(p.day, lang)} ${MONTHS[lang][p.month - 1]} ${p.year}`;
  const time = `${pad(p.hour)}:${pad(p.minute)}`;
  return lang === 'fr' ? `${day} à ${time} (heure de Rome)` : `${day}, ${time} (Rome time)`;
}

// The last day an order runs, for a desk whose order has a length (Paris:
// six months): the order's day in Rome + N calendar months, the same day of
// the month, or the month's last day when it has none (31 August → 28/29
// February — the French way of counting a period in months). `at` is the
// order's Rome day 'YYYY-MM-DD' or its instant. null for a desk whose order
// runs until signed or stopped (Berlin) and for a desk with no order terms.
export function orderExpiresOn(city, at) {
  const months = own(TERM_MONTHS, String(city || ''));
  if (!months) return null;
  let p = typeof at === 'string' && DAY_RE.test(at) ? dayParts(at) : null;
  if (!p) {
    const i = toInstant(at);
    if (i) { const r = romeParts(i); p = { y: r.year, mo: r.month, d: r.day }; }
  }
  if (!p) throw termsError('bad_order_day', String(at));
  const total = p.mo - 1 + months;
  const y = p.y + Math.floor(total / 12), m0 = total % 12;
  const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return `${y}-${pad(m0 + 1)}-${pad(Math.min(p.d, last))}`;
}

function termsError(code, detail) {
  return Object.assign(new Error('cityterms: ' + code + (detail ? ' (' + detail + ')' : '')), { code });
}
// a value the client typed: no control characters, no line breaks, no
// braces (a name can never fill another placeholder), one space, a cap
const clean = (s, max) => String(s == null ? '' : s).normalize('NFC')
  .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029{}]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, max).trim();

const HASH_LINE = {
  en: (v, hash) => `Terms version ${v}; SHA-256 of the terms text: ${hash}.`,
  fr: (v, hash) => `Version des conditions ${v} ; empreinte SHA-256 du texte des conditions : ${hash}.`,
};

/**
 * The terms of ONE order, as plain paragraphs, for the order email and its PDF.
 *
 * @param order {
 *   city: 'paris'|'berlin', plan: 'full-search'|'application-pack'|'attended-viewing',
 *   number: 'PAR-2026-0007' (the desk's prefix), name, email,
 *   orderedAt: Date | epoch ms | ISO string with a time (printed in Rome time),
 *   withdrawalEndsOn: 'YYYY-MM-DD' (the last day of the 14-day period, as the server computed it),
 *   workFrom: 'YYYY-MM-DD' (the first working day after it; required when startNow is not true),
 *   expiresOn: 'YYYY-MM-DD' (Paris: the order record's; omitted → orderExpiresOn),
 *   startNow: true only when the tick was ticked (anything else is "not ticked") }
 * @returns { city, v, hash, title, en: string[], fr?: string[] (Paris) } — each list
 *   ends with the line that names the terms version and its hash.
 * Throws an Error with `.code` on an input it cannot render truthfully.
 */
export function renderOrderTerms(order = {}) {
  const city = String(order.city || '');
  const T = own(ORDER_TERMS, city);
  if (!T) throw termsError('unknown_city', city);
  const plan = String(order.plan || '');
  if (!PLAN_IDS.includes(plan)) throw termsError('unknown_plan', plan);
  const number = clean(order.number, 40);
  if (!number) throw termsError('number_required');
  if (!new RegExp('^' + PREFIX[city] + '-\\d{4}-\\d{4,}$').test(number)) throw termsError('number_mismatch', number);
  const name = clean(order.name, 120);
  if (!name) throw termsError('name_required');
  const email = clean(order.email, 160);
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw termsError('email_required');
  const at = toInstant(order.orderedAt);
  if (!at) throw termsError('bad_orderedAt', String(order.orderedAt));
  if (!dayParts(order.withdrawalEndsOn)) throw termsError('bad_withdrawalEndsOn', String(order.withdrawalEndsOn));
  const startNow = order.startNow === true;
  if (!startNow && !dayParts(order.workFrom)) throw termsError('workFrom_required', String(order.workFrom));
  let expiresOn = null;
  if (TERM_MONTHS[city]) {
    if (order.expiresOn != null && order.expiresOn !== '') {
      if (!dayParts(order.expiresOn)) throw termsError('bad_expiresOn', String(order.expiresOn));
      expiresOn = order.expiresOn;
    } else expiresOn = orderExpiresOn(city, at);
  }
  const hash = termsHash(city);
  const out = { city, v: T.v, hash, title: T.title };
  for (const lang of LANGS) {
    if (!T[lang]) continue;
    const values = {
      number, name, email,
      orderedAt: fmtStamp(at, lang),
      withdrawalEndsOn: fmtDay(order.withdrawalEndsOn, lang),
      workFrom: startNow ? null : fmtDay(order.workFrom, lang),
      expiresOn: expiresOn ? fmtDay(expiresOn, lang) : null,
    };
    const paragraphs = [];
    for (const p of T[lang]) {
      if (typeof p !== 'string') {
        if ('plan' in p && p.plan !== plan) continue;
        if ('startNow' in p && p.startNow !== startNow) continue;
      }
      // one pass: a filled value is never read again for placeholders
      paragraphs.push(textOf(p).replace(/\{(\w+)\}/g, (m, k) => {
        const v = own(values, k);
        if (v == null) throw termsError('unfilled_placeholder', k);
        return v;
      }));
    }
    paragraphs.push(HASH_LINE[lang](T.v, hash));
    out[lang] = paragraphs;
  }
  return out;
}
