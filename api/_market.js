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

// ─── L'ALTRO lato, stesso principio: non solo QUALE mercato, ma QUALE
// mestiere. Tutta la macchina romana (SYSTEM del Commerciale, messaggio
// WhatsApp precompilato con link ad /apartments) parla a chi CERCA casa.
// Un proprietario che offre la sua — dal form di owners.html o dalla
// valutazione /valuta — riceverebbe "stai ancora cercando casa a Roma?":
// la prova, firmata, che nessuno ha letto il suo messaggio. Stessa regola
// della Réunion: la macchina tarata sull'inquilino SI ASTIENE, e il
// messaggio pronto in Telegram parla del SUO immobile. ───────────────────

/**
 * Questo lead è un PROPRIETARIO che offre un immobile (mercato di Roma o no)?
 * Tre porte lo scrivono: /api/owners/valuta (leadType landlord, intent
 * valuta_owner), il form owners.html via /api/partners/submit (intent
 * 'owner', storicamente senza leadType) e la Réunion lato bailleur
 * (leadType landlord — lì però parla prima isReunion, in francese).
 * @param {object} lead
 * @returns {boolean}
 */
export function isOwnerLead(lead = {}) {
  if (!lead || typeof lead !== 'object') return false;
  if (String(lead.leadType || '').toLowerCase() === 'landlord') return true;
  const i = String(lead.intent || '').toLowerCase();
  return i === 'owner' || i === 'valuta_owner';
}

/**
 * Il messaggio WhatsApp già scritto per un proprietario ROMANO: parla del
 * SUO immobile, mai del catalogo (un link ad /apartments qui direbbe
 * "cercati casa da solo"). Italiano di default — il proprietario romano è
 * quasi sempre italiano — inglese solo se le SUE parole lo sono.
 * @param {object} lead
 * @returns {string}
 */
export function ownerReplyText(lead = {}) {
  const first = String(lead.name || '').trim().split(/\s+/)[0] || '';
  const zone = String(lead.zone || '').trim();
  // Default ITALIANO — l'inverso della regola di casa (inglese per gli
  // inquilini expat): il proprietario romano è quasi sempre italiano, e un
  // lead owner senza testo non deve cadere sul fallback inglese di
  // replyLang. Le parole VERE della persona vincono comunque (un "Hello, I
  // would like to rent out my flat" resta inglese).
  const en = replyLang({ ...lead, language: lead.language || 'it' }) !== 'it';
  if (en) {
    return `Hi${first ? ' ' + first : ''}, Valentino from BOOM here 👋 ` +
      `Thanks for reaching out about your property${zone ? ` in ${zone}` : ''}. ` +
      `I have the numbers in front of me — up for a 10-minute call? ` +
      `I'll tell you the rent I'd put it on the market at and how we manage it end to end. ` +
      `Just tell me when suits you.`;
  }
  return `Ciao${first ? ' ' + first : ''}, sono Valentino di BOOM 👋 ` +
    `Grazie per la richiesta sul tuo immobile${zone ? ` a ${zone}` : ''}. ` +
    `Ho i numeri davanti: ti va una chiamata di 10 minuti? ` +
    `Ti dico a che canone lo metterei a reddito e come lo gestiamo dalla A alla Z. ` +
    `Dimmi tu quando preferisci.`;
}
