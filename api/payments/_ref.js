// api/payments/_ref.js
// IL CODICE DA METTERE NELLA CAUSALE — quello che rende il bonifico
// riconoscibile con certezza invece che per indizi.
//
// PERCHÉ. reconcile() in api/banking/_lib.js abbina un movimento a una rata
// per euristiche prudenti: importo esatto, finestra di date, unicità, e un
// nome o un mese che compaia nel testo. Funziona, ma quando è incerta
// preferisce (giustamente) rimandare a un umano — e ogni rinvio è lavoro tuo.
//
// Con un codice nella causale l'abbinamento diventa esatto: il movimento dice
// quale rata sta pagando.
//
// DERIVATO, NON MEMORIZZATO. Come manageToken nelle visite: il codice si
// calcola dall'id della rata, quindi ogni rata già esistente ne ha già uno e
// non serve nessuna migrazione. Non è reversibile, ma non serve: si calcola il
// codice di ogni rata aperta e si confronta col testo del movimento.
//
// ALFABETO SENZA AMBIGUITÀ. Niente I, O, 0, 1: un codice che qualcuno
// ricopia a mano nell'home banking non deve poter essere letto in due modi.

import crypto from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // 32 simboli, nessun sosia
const LEN = 6;                                          // ~1 miliardo di combinazioni

export function payRef(paymentId) {
  const id = String(paymentId || '');
  if (!id) return null;
  const h = crypto.createHash('sha256').update('boom-pay-ref:' + id).digest();
  let out = '';
  for (let i = 0; i < LEN; i++) out += ALPHABET[h[i] % ALPHABET.length];
  return 'BOOM-' + out;
}

// La causale suggerita al cliente: il codice più il periodo, così anche un
// umano che apre l'estratto conto capisce a colpo d'occhio cos'era.
export function payCausale(payment) {
  const p = payment || {};
  const ref = payRef(p.id);
  const period = p.month || String(p.dueDate || '').slice(0, 7);
  return [ref, period ? 'canone ' + period : 'canone'].filter(Boolean).join(' ');
}

// Normalizza per il confronto: le banche cambiano spaziatura, maiuscole e
// punteggiatura della causale. "boom - 7k2mxp" deve trovare "BOOM-7K2MXP".
const squash = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Trova la rata il cui codice compare nel testo del movimento.
// Restituisce null se nessuno o se più di uno combaciano (mai una tirata a
// indovinare: nel dubbio decide reconcile con le sue euristiche).
export function findByRef(text, payments) {
  const hay = squash(text);
  if (hay.length < 10) return null;                     // troppo corto per contenerne uno
  const hits = (payments || []).filter((p) => {
    const r = payRef(p && p.id);
    return r && hay.includes(squash(r));
  });
  return hits.length === 1 ? hits[0] : null;
}
