// api/_demo.js
// I DATI DI PROVA NON DEVONO FINIRE NELL'AUTOMAZIONE.
//
// Un inquilino di prova serve a guardare /casa con i propri occhi. Ma un
// contratto e delle rate dentro le collezioni vere vengono letti da tutto il
// resto: il journey manderebbe email a un indirizzo finto (compresa la
// richiesta di recensione su Google), il Gestore proporrebbe solleciti, il
// Contabile conterebbe quegli incassi nel fatturato, lo scadenzario
// inventerebbe adempimenti fiscali su un immobile che non esiste.
//
// Due difese, non una:
//
// 1. IL CONTRATTO DEMO HA `status:'demo'`, non 'active'. Tutte le query che
//    filtrano su status=='active' (il journey, per esempio) lo saltano da sole,
//    senza che nessuno debba ricordarsene. /casa lo mostra comunque, perché
//    prende il primo attivo OPPURE il primo della lista.
// 2. OGNI DOCUMENTO PORTA `demo:true`, e chi legge in blocco lo filtra con
//    `real()`. Serve per le rate, che restano 'pending' come quelle vere.
//
// Regola per il futuro: un endpoint nuovo che legge contracts o payments in
// blocco e AGISCE (email, soldi, notifiche) passa da real(). Se solo mostra
// dati a un admin, può anche mostrarli.

export const isDemo = (d) => !!(d && (d.demo === true || d.status === 'demo'));

// Toglie i documenti di prova da una lista.
export const real = (rows) => (rows || []).filter((d) => !isDemo(d));

// Marchio da applicare a ogni documento creato per la prova.
export const DEMO_MARK = { demo: true };
