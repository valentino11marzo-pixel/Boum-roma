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
  const missing = [];
  if (!zone) missing.push(relet ? (en ? 'which property it is' : 'di quale immobile si tratta')
    : (en ? 'which area it is in' : 'in che zona si trova'));
  if (relet && o.freeFrom === 'rented') missing.push(en ? 'when the current tenant moves out' : 'quando esce l\'inquilino attuale');
  else if (!o.freeFrom) missing.push(en ? 'when it frees up' : 'da quando è libero');
  if (!o.furnished && !relet) missing.push(en ? 'whether it is furnished' : 'se è arredato');
  const join = (arr, and) => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' ' + and + ' ' + arr[arr.length - 1];

  if (en) {
    return [
      relet
        ? `Hi${first ? ' ' + first : ''}, Valentino here from BOOM Roma — thank you for writing to us about re-letting your property${zone ? ' in ' + zone : ''}.`
        : `Hi${first ? ' ' + first : ''}, Valentino here from BOOM Roma — thank you for telling us about your property${zone ? ' in ' + zone : ''}.`,
      known.length ? `I've noted: ${known.join(', ')}.` : null,
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
    missing.length ? `Per darle una risposta seria, mi dice ${join(missing, 'e')}?` : null,
    relet ? `Le torno in giornata con il nuovo canone e le condizioni del riaffitto, per iscritto.`
      : `Le torno in giornata con cosa faremmo e i numeri per iscritto.`,
  ].filter(Boolean).join('\n');
}
