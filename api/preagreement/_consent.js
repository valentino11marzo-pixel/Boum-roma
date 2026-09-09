// api/preagreement/_consent.js — i testi che il cliente FIRMA sulla proposta,
// in una copia sola: la pagina li mostra, submit li registra con l'hash, il
// PDF li ristampa, il contratto li eredita. Cambiare una parola qui cambia
// l'hash: un consenso registrato ieri non combacia più con quello di oggi —
// ed è giusto così, perché è un'altra dichiarazione.
//
// Tre atti, tre testi:
//  · CONSENT  — l'accettazione della proposta (identità, termini, condizioni)
//               che copre ANCHE la scheda di calcolo del canone (Allegato
//               2/B dell'accordo territoriale): la scheda dichiara che le
//               informazioni "sono state fornite dalle parti" e la firmano
//               le parti — qui il conduttore la firma con lo stesso atto,
//               così dopo la firma del contratto esce già completa.
//  · MANDATE  — il mandato con rappresentanza a BOOM per sottoscrivere il
//               contratto in nome del cliente, SOLO ai termini accettati qui
//               (art. 1703 ss. c.c.; contenuto predeterminato → nessun
//               conflitto d'interessi ex art. 1395 c.c.). Facoltativo,
//               spunta a parte, revocabile per iscritto fino alla firma.
import crypto from 'node:crypto';

export const PA_CONSENT_TEXT = 'I confirm my details are correct and I accept this pre-agreement, including the general conditions above. With this acceptance I also sign the rent calculation sheet of the Rome territorial agreement (Allegato 2/B) that accompanies the lease: the information about the property used for that sheet was provided by the parties.';

export const PA_MANDATE_TEXT = 'MANDATE TO SIGN. I appoint Egidi Immobiliare S.r.l. (BOOM), Via dei Coronari 181/184, 00186 Rome, as my representative to sign the lease agreement in my name and on my behalf, on exactly the terms accepted in this pre-agreement (property, rent, term, deposit, contract model of the Rome territorial agreement), with no changes. The mandate is free of charge and revocable in writing until the lease is signed. I will receive the signed lease and its signing certificate by email. I acknowledge that BOOM also assists the landlord: since the terms are fully predetermined here, no conflict of interest arises (art. 1395 Italian Civil Code).';

export const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
export const PA_CONSENT_HASH = sha256(PA_CONSENT_TEXT);
export const PA_MANDATE_HASH = sha256(PA_MANDATE_TEXT);
