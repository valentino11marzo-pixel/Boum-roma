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
  if (String(lead.source || '').toLowerCase() === 'partner') return true;
  if (String(lead.leadType || '').toLowerCase() === 'company') return true;
  return /^partner-/.test(String(lead.intent || '').toLowerCase());
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

  if (b2bSide(lead) === 'owner') {
    return en
      ? (`Hi${first ? ' ' + first : ''}, Valentino here from BOOM Roma 👋 Thanks for telling us about your property.\n` +
         `To give you a straight answer: which zone, when does it free up, furnished or not? ` +
         `I'll come back today with what we'd do and the numbers in writing.`)
      : (`Ciao${first ? ' ' + first : ''}, sono Valentino di BOOM Roma 👋 Grazie per averci scritto del tuo immobile.\n` +
         `Per darti una risposta seria: che zona, da quando è libero, arredato o no? ` +
         `Ti torno in giornata con cosa faremmo e i numeri per iscritto.`);
  }
  return en
    ? (`Hi${first ? ' ' + first : ''}, Valentino here from BOOM Roma 👋 Thanks for reaching out about housing for your people.\n` +
       `To move fast: how many people, from when, and for roughly how long? ` +
       `I'll come back today with real options and the right lease setup for each stay.\n${url}`)
    : (`Ciao${first ? ' ' + first : ''}, sono Valentino di BOOM Roma 👋 Grazie per il contatto: sistemare le vostre persone a Roma è esattamente il nostro lavoro.\n` +
       `Per fare presto: quante persone, da quando e per quanto tempo? ` +
       `Ti torno in giornata con opzioni reali e la forma contrattuale giusta per ogni soggiorno.\n${url}`);
}
