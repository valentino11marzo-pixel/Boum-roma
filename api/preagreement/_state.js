// api/preagreement/_state.js
// LO STATO DI UNA PROPOSTA — una lettura sola, condivisa da chi accetta
// (submit), da chi incassa (pay) e da chi ripara (resolve).
//
// IL DIFETTO CHE HA GENERATO QUESTO FILE (agosto 2026, caso reale).
// `submit.js` considerava terminale il solo stato `accepted`: un documento
// GIÀ PAGATO che riceveva un secondo invio del modulo veniva riscritto ad
// `accepted` — con un protocollo nuovo e una SECONDA Checkout Stripe aperta.
// E se nel frattempo il lucchetto dell'immobile era passato a un'altra
// proposta, quel documento finiva in `reserve`: da lì → Contratto, Magic Sign
// e ✉ Reinvia copia rispondono tutti 409 `not_accepted_yet`, cioè il deal si
// pianta e la console lo mostra come non pagato. Un secondo invio non è un
// caso di laboratorio: la pagina resta aperta per giorni con la bozza in
// localStorage, il tasto indietro da Stripe la ripesca dal bfcache, e su
// mobile un tap ripetuto su rete ballerina rispedisce la stessa POST.
//
// LA REGOLA. Lo stato non è l'etichetta, è il FATTO: i soldi incassati
// stanno sul documento (paidAt / paidSessionId / paidEur) e nessun percorso
// pubblico può scavalcarli. `paidOnRecord` è quel fatto; ogni porta che
// scrive o incassa lo chiede PRIMA di muovere lo status.

// Il pagamento è a registro? Si guarda la prova, non solo l'etichetta: un
// documento degradato da un vecchio giro porta ancora paidAt/paidSessionId
// con status 'accepted' o 'reserve', e va trattato come pagato.
export function paidOnRecord(pa) {
  const p = pa || {};
  return !!(p.paidAt || p.paidSessionId || p.status === 'paid' || Number(p.paidEur) > 0);
}

// Il dovuto alla firma, add-on compresi quando già scelti dal cliente.
export function dueAtSigning(pa) {
  const p = pa || {};
  const base = Math.round(Number((p.money || {}).dueAtSigning) || 0);
  const addons = Math.round(Number(p.addonsEur) || 0);
  return Math.max(0, base + addons);
}

// Il verdetto che la console mostra e che `resolve.js` esegue.
//
//   'ok'            → niente da sistemare
//   'payment_lost'  → i soldi ci sono ma lo status dice altro (il guasto qui
//                     sopra): va riportato a `paid`, altrimenti ogni passo
//                     successivo resta chiuso
//   'reserve'       → ha firmato mentre l'immobile era tenuto da un'altra
//                     proposta e non l'ha mai sbloccato nessuno
//   'unpaid'        → accettata, c'è un dovuto, il pagamento non risulta
//                     (stato legittimo — non è un guasto, è un'attesa)
export function stateVerdict(pa) {
  const p = pa || {};
  const status = String(p.status || 'sent');
  const paid = paidOnRecord(p);
  if (paid && status !== 'paid') {
    return { kind: 'payment_lost', paid: true, status, repairable: true };
  }
  if (status === 'reserve') {
    return { kind: 'reserve', paid: false, status, repairable: true, heldBy: p.reserveOf || null };
  }
  if (status === 'accepted' && dueAtSigning(p) > 0) {
    return { kind: 'unpaid', paid: false, status, repairable: false };
  }
  return { kind: 'ok', paid, status, repairable: false };
}
