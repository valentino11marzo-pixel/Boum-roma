// api/ops/_lotto12.js — LA PASSATA DELLA VERITÀ sul catalogo + lo
// spazzino degli hold €300. Due mestieri piccoli, stessa disciplina:
//
// 1. runOnceLotto12() — le correzioni-dati decise dall'operatore il
//    16/08 applicate UNA volta sola alla fonte (Firestore), via marker
//    `heartbeat/lotto12-catalogo` (fsCreate risponde 409 sul doc
//    esistente → compare-and-set, la lezione propertyLocks). Corregge:
//    il Bilocale Centro in waitlist che dichiarava 3 camere (ne ha 1,
//    parola dell'operatore), le due descrizioni in inglese rotto (il
//    testo umano precedente resta in `descriptionOriginal` — disciplina
//    dello sweep copy), e la cover .HEIC di Pigneto Palace che Chrome e
//    Firefox non renderizzano (il JPG convertito è servito dal sito
//    stesso in /foto-catalogo/; lo sweep enhance notturno la curerà come
//    ogni altra foto raw). MAI le date: quelle passano dal piano con
//    conferma dell'operatore (/api/listings-availability).
//
// 2. sweepHolds() — la pagina promette «€300 takes it off the market for
//    48 hours»: il webhook RESERVE ora blocca davvero la casa (status
//    'reserved' + holdExpiresAt); questo spazzino, dal reminder-cron
//    orario, libera le riserve scadute (torna `statusBeforeHold`) e
//    avvisa l'operatore su Telegram di processare il rimborso. Senza,
//    una riserva dimenticata terrebbe la casa congelata per sempre —
//    stessa ragione d'essere di sweepLocks.

import { fsGet, fsPatch, fsCreate, fsList } from '../homie/_lib.js';
import { tgNotify } from '../pfs/_health.js';

const SITO = 'https://www.boomrome.com';

const CORREZIONI = [
  { id: 'OLLVsiKhPrhpT1fx8XmB', // Bilocale Centro (waitlist, 60mq, €1500)
    patch: { bedrooms: 1 } },
  { id: 'Kz9bXztv5QXmQrNhAcoU', // Ponte Milvio Duplex
    descr: 'A duplex on two levels — ground floor plus an upper plan — '
      + 'inside a condominium BOOM has managed for years, in the heart of '
      + 'Ponte Milvio with its riverside restaurants, a short walk from the '
      + 'Foro Italico and the Olympic Stadium. Air conditioning and Wi-Fi. '
      + 'The unit is newly finished and can be visited.' },
  { id: 'qRRRV7BjXDPqgTpVchnz', // Parioli Double Room with Garden
    descr: 'A generous double room with its own private bathroom in the '
      + 'heart of Parioli, with direct access to the garden. The kitchen is '
      + 'shared and bills are all inclusive. Air conditioning and Wi-Fi. '
      + 'Minutes from the LUISS campus — ideal for students.' },
  { id: '2SwJ8yD3ITXylrEtYIlL', // Pigneto Palace Double Bed — cover .HEIC
    cover: `${SITO}/foto-catalogo/pigneto-palace.jpg` },
];

export async function runOnceLotto12() {
  try {
    await fsCreate('heartbeat',
      { at: new Date().toISOString(), what: 'catalogo lotto 12' },
      'lotto12-catalogo');
  } catch (e) {
    if (e.exists) return { done: 'già applicato' };
    throw e;
  }
  const esiti = [];
  for (const c of CORREZIONI) {
    try {
      const doc = await fsGet('listings/' + c.id);
      if (!doc) { esiti.push(c.id + ': assente'); continue; }
      const patch = { ...(c.patch || {}) };
      if (c.descr) {
        patch.description = c.descr;
        patch.descriptionSource = 'lotto12';
        // il testo dell'operatore non si butta MAI: resta recuperabile
        if (!doc.descriptionOriginal && doc.description)
          patch.descriptionOriginal = doc.description;
      }
      if (c.cover) {
        patch.image = c.cover;
        patch.images = [c.cover];
        // la .HEIC originale resta tracciata (disciplina imagesOriginal
        // di photos/enhance: additiva, mai distruttiva)
        if (!doc.imagesOriginal && doc.image)
          patch.imagesOriginal = [doc.image];
      }
      await fsPatch('listings/' + c.id, patch);
      esiti.push(c.id + ': ok');
    } catch (e) { esiti.push(c.id + ': ' + e.message); }
  }
  return { done: 'applicato', esiti };
}

const HOLD_MS = 48 * 3600 * 1000;

// Chiamata dal webhook RESERVE: blocca la casa per 48 ore. Esportata qui
// (non nel webhook) così lo spazzino e il blocco vivono nello stesso file
// e non possono divergere sul vocabolario dei campi.
export async function placeHold(listingId, leadId) {
  if (!listingId) return null;
  const cur = await fsGet('listings/' + listingId);
  // una casa già affittata non si blocca; una già in hold non si
  // sovrascrive (il primo che paga tiene la presa)
  if (!cur || cur.status === 'rented' || cur.holdExpiresAt) return null;
  const patch = {
    statusBeforeHold: cur.status || 'available',
    status: 'reserved',
    holdExpiresAt: new Date(Date.now() + HOLD_MS).toISOString(),
    holdLeadId: leadId || null,
  };
  await fsPatch('listings/' + listingId, patch);
  return patch;
}

export async function sweepHolds() {
  const now = new Date().toISOString();
  const tutte = await fsList('listings', { limit: 300 });
  const scadute = (tutte || []).filter((l) =>
    l.holdExpiresAt && l.holdExpiresAt < now && l.status === 'reserved');
  const esiti = [];
  for (const l of scadute) {
    try {
      await fsPatch('listings/' + l.id, {
        status: l.statusBeforeHold || 'available',
        statusBeforeHold: null,
        holdExpiresAt: null,
        holdLeadId: null,
      });
      esiti.push(l.id);
      try {
        await tgNotify('⏳ <b>Hold €300 scaduto</b> — «'
          + String(l.name || l.id).replace(/[<>&]/g, '')
          + '» torna in vetrina. Se il deal non è avanzato, processa il '
          + 'rimborso su Stripe (lead ' + (l.holdLeadId || '—') + ').');
      } catch (e) { /* l'avviso non blocca mai la liberazione */ }
    } catch (e) { esiti.push(l.id + ': ' + e.message); }
  }
  return { liberate: esiti.length, esiti };
}
