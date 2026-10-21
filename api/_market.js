// api/_market.js — "de quel marché vient cette personne ?", en un seul endroit.
//
// BOOM a longtemps eu un seul marché, donc toute la machine dit « Rome » sans
// se poser la question : le message WhatsApp pré-rempli de la carte Telegram
// est signé « BOOM Roma » et pointe vers /apartments, et le Commerciale écrit
// une première réponse dont le prompt entier décrit le marché romain.
//
// Le jour où /reunion ouvre, ce défaut cesse d'être invisible : le tout
// premier propriétaire réunionnais recevrait un mail EN ANGLAIS proposant de
// « trouver le bon logement à Rome ». Ce n'est pas une maladresse cosmétique —
// c'est la preuve, envoyée au client, que personne n'a lu son message.
//
// Une automatisation qui se trompe de marché est PIRE que pas d'automatisation
// du tout : sans elle l'opérateur répond lui-même, avec elle il envoie une
// bêtise sous sa propre signature. D'où la règle ici : on reconnaît le marché,
// et les employés IA calibrés sur Rome S'ABSTIENNENT au lieu d'improviser.

import { replyLang } from './_lang.js';

export const REUNION_URL = 'https://www.boomrome.com/reunion';

/**
 * Un lead vient-il de La Réunion ?
 * Trois indices, parce que trois portes écrivent le lead (le formulaire de la
 * page, une reprise manuelle depuis le portail, un import) et qu'aucune ne
 * doit pouvoir faire retomber la personne dans la machine romaine.
 * @param {object} lead
 * @returns {boolean}
 */
export function isReunion(lead = {}) {
  if (!lead || typeof lead !== 'object') return false;
  if (String(lead.market || '').toLowerCase() === 'reunion') return true;
  if (String(lead.sourceRef || '').toLowerCase() === 'reunion') return true;
  return String(lead.intent || '').toLowerCase().startsWith('reunion_');
}

/**
 * De quel côté est cette personne — la seule chose que l'opérateur lit avant
 * de répondre. Trois métiers qui n'ont rien à voir : mettre en location,
 * chercher à louer, acheter.
 * @returns {'owner'|'tenant'|'buyer'}
 */
export function reunionSide(lead = {}) {
  const t = String(lead && lead.leadType || '');
  const i = String(lead && lead.intent || '');
  if (t === 'buyer' || i === 'reunion_buyer') return 'buyer';
  if (t === 'landlord' || i === 'reunion_owner') return 'owner';
  return 'tenant';
}

/** Raccourci historique — un acheteur n'est PAS un propriétaire bailleur. */
export const isReunionOwner = lead => reunionSide(lead) === 'owner';

/**
 * Le message WhatsApp déjà écrit, en français, pour un lead réunionnais.
 * Il n'est signé d'aucun prénom : la personne sur l'île n'est pas celle qui
 * signe les messages de Rome, et inventer une signature est le genre de
 * détail qui se paie au premier appel.
 * @param {object} lead
 * @returns {string}
 */
export function reunionReplyText(lead = {}) {
  const first = String(lead.name || '').trim().split(/\s+/)[0] || '';
  const hi = `Bonjour${first ? ' ' + first : ''}, ici l'équipe BOOM 👋`;
  const where = lead.zone ? ` à ${lead.zone}` : '';
  const side = reunionSide(lead);
  if (side === 'owner') {
    return `${hi} Merci pour votre message au sujet de votre bien${where}.\n` +
      `Pour qu'on aille droit au but : le logement est libre à partir de quand, et est-il meublé ou vide ? ` +
      `On peut aussi en parler de vive voix, dites-moi quand ça vous arrange.\n${REUNION_URL}`;
  }
  if (side === 'buyer') {
    // Un acheteur à distance a une question avant toutes les autres : est-ce
    // que quelqu'un peut aller VOIR. On répond à celle-là, pas au reste.
    return `${hi} Merci pour votre message${where ? ` — vous regardez du côté de ${lead.zone}` : ''}.\n` +
      `Si vous avez déjà repéré une annonce, envoyez-la : on peut aller voir le bien et vous le faire visiter en direct, ` +
      `avec un compte rendu écrit de ce qu'on a vu. Dites-moi ce que vous cherchez et pour quel usage.\n${REUNION_URL}?role=buyer`;
  }
  return `${hi} Merci pour votre message.\n` +
    `Pour aller vite : quelle commune, quel budget et à partir de quand ? ` +
    `Si vous n'êtes pas encore sur l'île, on peut visiter en direct en visio.\n${REUNION_URL}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// L'ALTRO ASSE: non da quale MERCATO viene il lead, ma con quale VOCE gli si
// risponde. Stessa disciplina della guardia Réunion, difetto diverso.
//
// Il Commerciale ha UNA persona: l'assistente che risponde a chi cerca casa
// ("ti andrebbe di fissare una visita?"). I moduli partner (università,
// aziende, centri di ricerca, proprietari — api/partners/submit) e la porta
// corporate scrivono nello stesso `leads`, quindi senza guardia l'ufficio
// housing di una università o l'HR di un'azienda riceve una bozza che gli
// propone di visitare un bilocale. Non è goffaggine: è la prova, mandata al
// canale che vale una coorte di inquilini l'anno, che nessuno l'ha letto.
//
// La regola è la stessa di isReunion: la macchina calibrata sull'inquilino
// SI ASTIENE, il lead esce comunque su Telegram entro un minuto con il
// messaggio giusto già scritto (b2bReplyText), e la prima voce vera è
// l'operatore. Meglio nessuna bozza che una bozza con la voce sbagliata.

export const CORPORATE_URL   = 'https://www.boomrome.com/corporate';
export const EXECUTIVE_URL   = 'https://www.boomrome.com/executive';
export const UNIVERSITIES_URL = 'https://www.boomrome.com/universities';
export const RESEARCH_URL    = 'https://www.boomrome.com/research';

/**
 * Questo lead è un ente, non una persona che cerca casa per sé?
 * Tre indizi perché tre porte scrivono: i quattro moduli partner
 * (source 'partner'), qualunque porta futura che marchi leadType 'company',
 * e gli intent partner-*. Il professionista della pagina /executive NON è
 * B2B: cerca casa per sé, la macchina inquilino è quella giusta per lui.
 * @param {object} lead
 * @returns {boolean}
 */
export function isB2B(lead = {}) {
  if (!lead || typeof lead !== 'object') return false;
  // La Réunion ha la SUA guardia (isReunion, sempre valutata prima): un
  // propriétaire di Saint-Pierre non è un proprietario romano.
  if (isReunion(lead)) return false;
  if (String(lead.source || '').toLowerCase() === 'partner') return true;
  if (String(lead.leadType || '').toLowerCase() === 'company') return true;
  // IL PROPRIETARIO ROMANO (30/09/2026). Il calcolatore /canone scrive
  // `leadType:'landlord'` da mesi con `source:'web'`, e questa funzione non
  // lo vedeva: il Commerciale redigeva per lui la prima risposta con la
  // persona dell'INQUILINO («ti andrebbe di fissare una visita?») e il
  // follow-up «stai ancora cercando casa a Roma?» — a chi una casa la OFFRE.
  // Ora anche la pagina /owners scrive qui (api/owner-lead.js): chi offre un
  // immobile parla con la voce del proprietario, mai con quella dell'inquilino.
  if (String(lead.leadType || '').toLowerCase() === 'landlord') return true;
  const intent = String(lead.intent || '').toLowerCase();
  if (intent === 'owner') return true;
  return /^partner-/.test(intent);
}

/**
 * Da che parte sta l'ente: un ufficio che sistema le SUE persone (org) o un
 * proprietario che offre il SUO immobile (owner). Due conversazioni opposte —
 * chiedere "quante persone dovete alloggiare?" a chi offre una casa è
 * l'equivalente romano del "votre bien est libre quand ?" all'acheteur.
 * @returns {'org'|'owner'}
 */
export function b2bSide(lead = {}) {
  const intent = String(lead && lead.intent || '').toLowerCase();
  const kind = String(lead && lead.partner && lead.partner.kind || '').toLowerCase();
  if (intent === 'owner' || kind === 'owner' || String(lead && lead.leadType || '') === 'landlord') return 'owner';
  return 'org';
}

/**
 * Il messaggio WhatsApp già scritto per un lead B2B, nella lingua delle SUE
 * parole (replyLang — la casa parla inglese, l'italiano è l'eccezione vera).
 * Firmato Valentino: qui il mercato È Roma, la firma è quella giusta.
 * @param {object} lead
 * @returns {string}
 */
export function b2bReplyText(lead = {}) {
  const first = String(lead.name || '').trim().split(/\s+/)[0] || '';
  const en = replyLang(lead) !== 'it';
  const kind = String(lead && lead.partner && lead.partner.kind || '').toLowerCase();
  const url = kind === 'university' ? UNIVERSITIES_URL : kind === 'research' ? RESEARCH_URL : CORPORATE_URL;

  if (b2bSide(lead) === 'owner') return ownerReplyText(lead);
  return en
    ? (`Hi${first ? ' ' + first : ''}, Valentino here from BOOM Roma 👋 Thanks for reaching out about housing for your people.\n` +
       `To move fast: how many people, from when, and for roughly how long? ` +
       `I'll come back today with real options and the right lease setup for each stay.\n${url}`)
    : (`Ciao${first ? ' ' + first : ''}, sono Valentino di BOOM Roma 👋 Grazie per il contatto: sistemare le vostre persone a Roma è esattamente il nostro lavoro.\n` +
       `Per fare presto: quante persone, da quando e per quanto tempo? ` +
       `Ti torno in giornata con opzioni reali e la forma contrattuale giusta per ogni soggiorno.\n${url}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// IL TERZO MERCATO: LE CITTÀ (BOOM_CITIES_BRIEF.md — Amsterdam, Madrid,
// Barcellona, Parigi, Berlino: la lista chiusa è CITY_MARKETS qui sotto). Stessa lezione della
// Réunion, in un'altra lingua: un lead che arriva da /amsterdam cerca casa ad
// AMSTERDAM, e il Commerciale — con il suo SYSTEM prompt sul mercato romano,
// il catalogo `listings` che consulta e il follow-up «stai ancora cercando
// casa a Roma?» — gli scriverebbe una prima risposta che parla di un'altra
// città. La card Telegram, senza guardia, gli manderebbe il link
// /apartments di Roma.
//
// La regola è la stessa: si riconosce il mercato dalla porta (`market` o
// `sourceRef` scritti da api/city-lead.js), il Commerciale SI ASTIENE, e la
// card porta il messaggio giusto già scritto — in inglese, firmato Valentino
// perché il numero WhatsApp da cui parte è il suo.

// `mode` is the desk's state (BOOM_CITIES_BRIEF.md §4), read by the lead
// door: 'search' = the desk takes searches today; 'waitlist' = the desk opens
// with a registered local partner (AICAT in Catalonia, carte professionnelle
// in France) and the lead is a FILE OPENED, not a search started. The city
// JSON carries the same word; tests/cities keeps the two from drifting.
// THE PRICE GRID OF THE CITY DESKS — the one copy the server trusts
// (api/service-checkout.js charges from HERE, never from the browser; the
// page JSON prints the same numbers and tests/cities pins the two together).
// The founder's decision of 14/10 (BOOM_CITIES_BRIEF.md, v1.1): every desk
// shows the same list prices, waitlist desks included — shown, not charged:
// a waitlist city never opens a checkout (the build refuses it), the list
// price is what the client will pay when the desk opens. Berlin's Full
// Search is due only once a lease is signed (WoVermRG §2, §3: fee on a
// concluded lease, cap two net cold months + VAT, no advances). The Full
// Search refund rule in the product description is BOOM POLICY (the
// founder, 15/10): refunded in full if BOOM declines the search in the
// first call — the sheet, the FAQ and the build's guard say the same.
export const CITY_PLANS = {
  'full-search':      { eur: 500, label: 'Full Search',      per: 'flat',
    desc: 'Search on the tenant\'s side: local-format dossier within one working day of your papers, applications sent as listings appear, one attended viewing with live video and written report, negotiation, contract checked before you sign. Refunded in full if we decline the search in the first call.' },
  'application-pack': { eur: 199, label: 'Application Pack', per: 'flat',
    desc: 'The dossier that wins applications: local format within one working day of your papers, cover letter, income and guarantor strategy, contract review before you sign.' },
  'attended-viewing': { eur: 149, label: 'Attended Viewing', per: 'per viewing',
    desc: 'A BOOM person attends the viewing in your place: live video walkthrough, written report (light, noise, damp, neighbours, commute) and a straight recommendation.' },
};

// `checkout: true` = the page sells the plans with a Stripe Checkout (the
// Rome Services 2.0 rail: api/service-checkout.js → the SERVICE webhook
// branch, lead with market = the city). Only a 'search' desk may carry it;
// cityOffer() refuses everything else, so a waitlist city cannot be charged
// even by a hand-made POST.
export const CITY_MARKETS = {
  amsterdam: { label: 'Amsterdam', flag: '🇳🇱', country: 'nl', url: 'https://www.boomrome.com/amsterdam', mode: 'search', checkout: true, plans: CITY_PLANS },
  madrid:    { label: 'Madrid',    flag: '🇪🇸', country: 'es', url: 'https://www.boomrome.com/madrid',    mode: 'search', checkout: true, plans: CITY_PLANS },
  barcelona: { label: 'Barcelona', flag: '🇪🇸', country: 'es', url: 'https://www.boomrome.com/barcelona', mode: 'waitlist', partner: 'a registered local partner', plans: CITY_PLANS },
  paris:     { label: 'Paris',     flag: '🇫🇷', country: 'fr', url: 'https://www.boomrome.com/paris',     mode: 'waitlist', partner: 'a licensed partner', plans: CITY_PLANS },
  berlin:    { label: 'Berlin',    flag: '🇩🇪', country: 'de', url: 'https://www.boomrome.com/berlin',    mode: 'waitlist', partner: 'a licensed partner', plans: CITY_PLANS },
};

/**
 * What a city page may SELL right now, by plan id — or why not.
 * Returns { ok:true, city, plan, eur, label, name, desc, url } or
 * { ok:false, error: 'unknown_city' | 'checkout_closed' | 'unknown_service' }.
 * 'checkout_closed' covers a waitlist desk and a search desk that has not
 * opened its checkout: in both cases the page shows the price and takes the
 * file, and nobody is charged.
 * @param {string} cityKey
 * @param {string} planId
 */
export function cityOffer(cityKey, planId) {
  const k = String(cityKey || '').toLowerCase().trim();
  const c = CITY_MARKETS[k];
  if (!c) return { ok: false, error: 'unknown_city' };
  if (c.mode !== 'search' || c.checkout !== true) return { ok: false, error: 'checkout_closed' };
  const id = String(planId || '').toLowerCase().trim();
  const p = (c.plans || {})[id];
  if (!p) return { ok: false, error: 'unknown_service' };
  return { ok: true, city: k, plan: id, eur: p.eur, label: p.label, per: p.per, desc: p.desc, name: `BOOM ${c.label} — ${p.label}`, url: c.url };
}

/**
 * The desk a WhatsApp message names. Every WhatsApp link on a city page opens
 * with a prefilled line ("Hi BOOM Amsterdam, I'm moving to Amsterdam.",
 * build-cities.mjs waHref): it is the only trace a chat carries of the page
 * it came from, consent or not. Returns the CITY_MARKETS key or null — a
 * Rome message never names a desk, so it stays in the Rome machine.
 * @param {string} text
 * @returns {string|null}
 */
const CITY_TEXT_RE = new RegExp(`\\bBOOM (${Object.values(CITY_MARKETS).map((c) => c.label).join('|')})\\b`, 'i');
export function cityFromText(text) {
  const m = CITY_TEXT_RE.exec(String(text || ''));
  if (!m) return null;
  const label = m[1].toLowerCase();
  return Object.keys(CITY_MARKETS).find((k) => CITY_MARKETS[k].label.toLowerCase() === label) || null;
}

/**
 * A phone typed on a city page, as E.164, read with the DESK's country — or
 * null when it cannot be read. WhatsApp delivers E.164 ('+31612345678'): a
 * number stored as typed ('+31 6 12345678', '06 12345678', '612 345 678')
 * never matched the client's reply, which then became a NEW Rome lead, and
 * the Italian guess of the Rome machine turned '06…' into '+39…'.
 * '+…' and '00…' are international as typed; a national number takes the
 * desk's country code (the trunk 0 dropped, as NL/FR/DE dial it).
 * @param {string} raw
 * @param {string} cityKey
 * @returns {string|null}
 */
const DIAL = { nl: '31', es: '34', fr: '33', de: '49' };
export function cityPhone(raw, cityKey) {
  let s = String(raw || '').trim().replace(/[\s().\-\/]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) {
    const d = s.slice(1).replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15 ? '+' + d : null;
  }
  const d = s.replace(/\D/g, '');
  const c = CITY_MARKETS[String(cityKey || '').toLowerCase()];
  const cc = c && DIAL[c.country];
  if (!cc || d.length < 8 || d.length > 13) return null;
  // typed with the country code but without '+' (e.g. 31612345678)
  if (d.startsWith(cc) && d.length >= cc.length + 9) return '+' + d;
  return '+' + cc + d.replace(/^0/, '');
}

/**
 * Why a lead is NOT a Rome tenant, or null. The Rome re-engagement tools
 * (the reverse search after each publication, /richiama) and the Segretaria
 * speak of Rome homes, Rome viewings and Rome services: an Amsterdam or
 * Madrid client, a Réunion owner, an organisation or a Rome landlord must
 * never receive them. One copy of the veto, read by every Rome-only tool.
 * @param {object} lead
 * @returns {string|null}
 */
export function notRomeTenant(lead = {}) {
  if (isCityMarket(lead)) return `cerca casa a ${CITY_MARKETS[cityMarketOf(lead)].label}, non a Roma`;
  if (isReunion(lead)) return 'La Réunion, non Roma';
  if (isB2B(lead)) return b2bSide(lead) === 'owner' ? 'è un proprietario, non un inquilino' : 'è un ente o un\'azienda, non un inquilino';
  return null;
}

/** 'search' | 'waitlist' — the state of the city's desk; 'search' for a lead that is not a city's. */
export function cityMode(lead = {}) {
  const k = cityMarketOf(lead);
  return k && CITY_MARKETS[k].mode === 'waitlist' ? 'waitlist' : 'search';
}

/**
 * Da quale città (fuori Roma) viene questo lead — la chiave di CITY_MARKETS
 * o null. Due indizi perché due campi lo portano: `market` (la porta) e
 * `sourceRef` `city-<slug>` (ripresa manuale, import). Roma e la Réunion
 * non sono città di questa lista: restano nelle loro macchine.
 * @param {object} lead
 * @returns {string|null}
 */
export function cityMarketOf(lead = {}) {
  if (!lead || typeof lead !== 'object') return null;
  const m = String(lead.market || '').toLowerCase();
  if (CITY_MARKETS[m]) return m;
  const ref = /^city-([a-z]+)$/.exec(String(lead.sourceRef || '').toLowerCase());
  if (ref && CITY_MARKETS[ref[1]]) return ref[1];
  return null;
}

/** Il lead cerca casa in una città BOOM fuori Roma? */
export const isCityMarket = lead => cityMarketOf(lead) !== null;

/** «🇳🇱 Amsterdam» per la card Telegram; stringa vuota se non è una città. */
export function cityLabel(lead = {}) {
  const k = cityMarketOf(lead);
  return k ? `${CITY_MARKETS[k].flag} ${CITY_MARKETS[k].label}` : '';
}

/**
 * Il messaggio WhatsApp già scritto per un lead di città: in inglese (la
 * pagina è in inglese e la persona si sta trasferendo da fuori), con le SOLE
 * domande che il modulo non ha già risposto, e il link della SUA pagina —
 * mai /apartments di Roma.
 * @param {object} lead
 * @returns {string}
 */
export function cityReplyText(lead = {}) {
  const k = cityMarketOf(lead);
  const c = k ? CITY_MARKETS[k] : { label: 'your city', url: 'https://www.boomrome.com' };
  const first = String(lead.name || '').trim().split(/\s+/)[0] || '';
  const asks = [];
  if (!lead.moveIn) asks.push('when do you land');
  if (!(lead.budgetBand || lead.budget)) asks.push("what's the monthly budget");
  if (!(lead.city && lead.city.situation)) asks.push("who's moving");
  // A PAID order (the page's checkout, written by the SERVICE webhook with
  // market = the city): the money is in, the reply says so and names the next
  // step — never a second "thanks for your message".
  if (lead.paid === true) {
    const plan = (lead.city && lead.city.serviceLabel) || 'your order';
    // They did NOT tick “Start now”: the work starts when the 14-day
    // withdrawal period ends (Dir. 2011/83/EU art. 7(3)/8(8)). The reply
    // repeats the day they were promised by email — never “today”.
    if (lead.city && lead.city.startNow === false && lead.city.workFromLabel) {
      return `Hi${first ? ' ' + first : ''}, Valentino here from BOOM 👋 Payment received for ${plan} in ${c.label} — thank you. ` +
        `As you chose at checkout, we start on ${lead.city.workFromLabel}, the day after your 14-day withdrawal period ends. ` +
        `Want us to start sooner? Reply here asking us to start now: you can still withdraw within the 14 days, paying only for the work already done, and once the service is fully performed the right to withdraw ends.\n${c.url}`;
    }
    return `Hi${first ? ' ' + first : ''}, Valentino here from BOOM 👋 Payment received for ${plan} in ${c.label} — thank you. ` +
      `I'm opening your file now and I'll come back today with the next step and what I need from you.\n${c.url}`;
  }
  // A checkout started and not finished (api/payments/recover-checkouts.js):
  // they chose the plan and stopped at the card. The reply names the plan and
  // asks what stopped them — never a second sales pitch, never a price.
  if (lead.city && lead.city.abandoned === true) {
    const plan = lead.city.serviceLabel || 'the service';
    return `Hi${first ? ' ' + first : ''}, Valentino here from BOOM 👋 I saw you started ${plan} for ${c.label} and stopped at the payment. ` +
      `Anything I can answer before you decide? Happy to do a quick call.\n${c.url}`;
  }
  const q = asks.length
    ? `To set up the search properly: ${asks.join(', ')}? `
    : 'I have your dates, budget and situation. ';
  // A waitlist desk never promises a search it cannot run yet: the reply says
  // where the desk stands and what can be done today.
  const next = cityMode(lead) === 'waitlist'
    ? `The ${c.label} desk is opening with ${c.partner || 'a licensed partner'}, so I can't start a search there yet. I'll come back today with where we stand and what we can already do for you.`
    : "I'll come back today with how we'd run it and the next step.";
  return `Hi${first ? ' ' + first : ''}, Valentino here from BOOM 👋 Thanks for your message about your move to ${c.label}.\n` +
    `${q}${next}\n${c.url}`;
}

/**
 * Il messaggio WhatsApp già scritto per un PROPRIETARIO romano.
 *
 * Due regole della dottrina delle risposte rapide (js/whatsapp-replies.js,
 * famiglia `pr`): «Sempre in italiano e sempre col LEI — è il cliente che ci
 * affida un bene», e la prova è un meccanismo, mai un aggettivo. Più una
 * regola nuova, nata con la pagina /owners: NON si richiede ciò che il
 * proprietario ha già scritto nel modulo. La vecchia versione chiedeva «che
 * zona, da quando è libero, arredato o no?» a chi l'aveva appena detto.
 *
 * La lingua: le SUE parole (la nota nel modulo, o il messaggio) battono la
 * dichiarazione; senza parole vale la lingua della pagina che ha scelto.
 * @param {object} lead
 * @returns {string}
 */
export function ownerReplyText(lead = {}) {
  const o = (lead && lead.owner) || {};
  const first = String(lead.name || '').trim().split(/\s+/)[0] || '';
  const langSrc = o.note != null || lead.owner
    ? { message: o.note || '', language: o.lang || lead.language }
    : lead;
  const en = replyLang(langSrc) !== 'it';
  const zone = o.zone || lead.zone || null;
  const FREE = {
    it: { now: 'libero da subito', soon: 'libero entro tre mesi', later: 'libero più avanti', rented: 'oggi affittato' },
    en: { now: 'free now', soon: 'free within three months', later: 'free later on', rented: 'currently let' },
  };
  const FURN = {
    it: { yes: 'arredato', partial: 'parzialmente arredato', no: 'vuoto' },
    en: { yes: 'furnished', partial: 'part-furnished', no: 'unfurnished' },
  };
  const L = en ? 'en' : 'it';
  const known = [];
  if (o.sqm) known.push(`${Math.round(o.sqm)} ${en ? 'sqm' : 'mq'}`);
  if (o.furnished && FURN[L][o.furnished]) known.push(FURN[L][o.furnished]);
  if (o.freeFrom && FREE[L][o.freeFrom]) known.push(FREE[L][o.freeFrom]);
  // Il riaffitto (secondo passo della scala di /owners): la casa la
  // conosciamo già, quindi NON si chiede se è arredata; si chiede DI QUALE
  // casa si tratta e quando esce l'inquilino. Il prezzo non si scrive qui:
  // un messaggio già pronto non deve impegnare BOOM su una cifra.
  const relet = o.goal === 'relet';
  // Il proprietario che ha fatto il conto su /canone: la risposta CITA il
  // conto (zona, metri, massimo, il PDF) e non richiede nulla di ciò che il
  // conto sa già — né la zona, né i metri, né se è arredata (l'arredo non
  // alza il massimo concordato). Si chiede solo se la casa è libera, se non
  // l'ha detto, e si propone la verifica delle dotazioni a voce.
  // Chi ha chiesto di affittarla, trovare l'inquilino o riaffittare riceve la
  // risposta del SUO passo: il conto si cita in una riga, non la sostituisce.
  const askedService = ['full', 'find', 'relet'].indexOf(o.goal) !== -1;
  if (o.conto && o.conto.zone && !askedService) return contoReply(o, first, en);
  const missing = [];
  if (!zone) missing.push(relet ? (en ? 'which property it is' : 'di quale immobile si tratta')
    : (en ? 'which area it is in' : 'in che zona si trova'));
  // La pagina, a «oggi è affittata», chiede di scrivere la scadenza nelle
  // note: se l'ha scritta, il messaggio non gliela richiede.
  const saysWhen = /\b\d{1,2}\s*[\/.\-]\s*\d{1,2}\b|\b\d{1,2}\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|jan|jun|jul|aug|sep|oct|dec)|\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|january|february|march|april|june|july|august|september|october|november|december)\b|\bscad|\bexpir|\bfino al\b|\buntil\b|\bends?\b/i
    .test(String(o.note || ''));
  if (relet && o.freeFrom === 'rented') { if (!saysWhen) missing.push(en ? 'when the current tenant moves out' : 'quando esce l\'inquilino attuale'); }
  else if (!o.freeFrom) missing.push(en ? 'when it frees up' : 'da quando è libero');
  if (!o.furnished && !relet) missing.push(en ? 'whether it is furnished' : 'se è arredato');
  const join = (arr, and) => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' ' + and + ' ' + arr[arr.length - 1];

  if (en) {
    return [
      relet
        ? `Hi${first ? ' ' + first : ''}, Valentino here from BOOM Roma — thank you for writing to us about re-letting your property${zone ? ' in ' + zone : ''}.`
        : `Hi${first ? ' ' + first : ''}, Valentino here from BOOM Roma — thank you for telling us about your property${zone ? ' in ' + zone : ''}.`,
      known.length ? `I've noted: ${known.join(', ')}.` : null,
      o.conto && o.conto.zone ? `I also saw your calculation: on agreed rent the maximum is ${contoRange(o.conto, true)} a month${o.conto.pdfUrl ? ' (PDF: ' + o.conto.pdfUrl + ')' : ''}.` : null,
      missing.length ? `So I can give you a straight answer, could you tell me ${join(missing, 'and')}?` : null,
      relet ? `I'll come back today with the new rent and the re-letting terms, in writing.`
        : `I'll come back today with what we would do and the numbers in writing.`,
    ].filter(Boolean).join('\n');
  }
  return [
    relet
      ? `Buongiorno${first ? ' ' + first : ''}, sono Valentino di BOOM — Egidi Immobiliare. Grazie per averci scritto per riaffittare il suo immobile${zone ? ' a ' + zone : ''}.`
      : `Buongiorno${first ? ' ' + first : ''}, sono Valentino di BOOM — Egidi Immobiliare. Grazie per averci scritto del suo immobile${zone ? ' a ' + zone : ''}.`,
    known.length ? `Ho annotato: ${known.join(', ')}.` : null,
    o.conto && o.conto.zone ? `Ho visto anche il conto che ha fatto: a canone concordato il massimo è ${contoRange(o.conto, false)} al mese${o.conto.pdfUrl ? ' (PDF: ' + o.conto.pdfUrl + ')' : ''}.` : null,
    missing.length ? `Per darle una risposta seria, mi dice ${join(missing, 'e')}?` : null,
    relet ? `Le torno in giornata con il nuovo canone e le condizioni del riaffitto, per iscritto.`
      : `Le torno in giornata con cosa faremmo e i numeri per iscritto.`,
  ].filter(Boolean).join('\n');
}

const eurIt = n => '€' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const eurEn = n => '€' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function contoRange(c, en) {
  const E = en ? eurEn : eurIt;
  if (c.declared) return E(c.max);
  if (!c.fasce.C) return E(c.fasce.A);
  return en ? `between ${E(c.fasce.A)} and ${E(c.fasce.C)}` : `tra ${E(c.fasce.A)} e ${E(c.fasce.C)}`;
}
function contoReply(o, first, en) {
  const c = o.conto;
  const E = en ? eurEn : eurIt;
  const where = `${c.zone.label}, ${Math.round(c.mq)} ${en ? 'sqm' : 'mq'}`;
  let num;
  if (c.declared) {
    num = en ? `on the agreed-rent tables the maximum is ${E(c.max)} a month (band ${c.fascia})`
      : `sulle tabelle dell'Accordo il massimo a canone concordato è ${E(c.max)} al mese (fascia ${c.fascia})`;
  } else if (!c.fasce.C) {
    num = en ? `on the agreed-rent tables the maximum is ${E(c.fasce.A)} a month (band A)`
      : `sulle tabelle dell'Accordo il massimo a canone concordato è ${E(c.fasce.A)} al mese (fascia A)`;
  } else {
    num = en ? `on the agreed-rent tables the maximum is between ${E(c.fasce.A)} and ${E(c.fasce.C)} a month, depending on its features`
      : `sulle tabelle dell'Accordo il massimo a canone concordato è tra ${E(c.fasce.A)} e ${E(c.fasce.C)} al mese, secondo le dotazioni`;
  }
  const free = o.freeFrom;
  const ask = !free ? (en ? 'Is the home free at the moment, or already let?' : 'La casa oggi è libera o già affittata?') : null;
  const next = free === 'rented'
    ? (en ? 'If the tenant is already there, the concordato is paperwork: lease, attestation and registration. I can tell you exactly what is needed.'
      : 'Se l\'inquilino c\'è già, il concordato è una questione di carte: contratto, attestazione e registrazione. Le dico esattamente cosa serve.')
    : (en ? 'If you like, I can call you to go through the features together: they decide the band, and they must hold up at the attestation.'
      : 'Se vuole, la chiamo per verificare insieme le dotazioni: decidono la fascia, e devono reggere all\'attestazione.');
  return [
    en ? `Hi${first ? ' ' + first : ''}, Valentino here from BOOM Roma. I saw the calculation you ran for your home in ${where}: ${num}.`
      : `Buongiorno${first ? ' ' + first : ''}, sono Valentino di BOOM — Egidi Immobiliare. Ho visto il conto che ha fatto per la sua casa a ${where}: ${num}.`,
    c.pdfUrl ? (en ? `Here it is in PDF: ${c.pdfUrl}` : `Glielo lascio in PDF: ${c.pdfUrl}`) : null,
    ask,
    next,
  ].filter(Boolean).join('\n');
}
