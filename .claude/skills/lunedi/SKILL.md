---
name: lunedi
description: Il resoconto del lunedì di BOOM in 15 righe — soldi della settimana e del mese, stato degli obiettivi di ORA.md, lavoro aperto, guasti in produzione. Usalo quando Valentino scrive /lunedi o chiede «il numero del lunedì».
---

# Il numero del lunedì

Un resoconto, non una sessione di strategia. Solo letture: niente codice,
niente PR, niente proposte nuove. Se un dato non si può leggere, scrivi
«non disponibile» e perché: mai una stima.

## 1 · Leggi `ORA.md`
Gli obiettivi in corso e le date. Il resoconto dice, per ognuno, a che punto
è e con quale fatto lo provi.

## 2 · I soldi (Gmail di valentino@boom-rome.com)
Due finestre: gli ultimi 7 giorni e il mese in corso. Conta e somma gli
importi scritti nell'oggetto (il formato è `€1,200`).

| Voce | Ricerca Gmail | Natura |
|---|---|---|
| Proposte pagate | `subject:"PA PAGATO"` | ricavo BOOM (contiene la provvigione) |
| PFS pagati | `subject:"PAID — PFS"` | ricavo BOOM |
| Fatture incassate | `subject:"FATTURA INCASSATA"` | ricavo BOOM |
| Canoni passati da BOOM | `subject:("CANONE VIA BOOM" OR "CANONE AUTOMATICO")` | soldi dei proprietari: NON è ricavo |
| Payout Stripe | `from:stripe.com subject:(payout OR bonifico)` | flusso di cassa: mescola ricavi e soldi dei proprietari |

Le ricerche restituiscono anteprime: per il conteggio basta l'oggetto. Non
sommare mai canoni o payout ai ricavi.

## 3 · Il lavoro aperto (GitHub, valentino11marzo-pixel/Boum-roma)
- Rami non uniti a `main` (il limite di `ORA.md` è 2).
- PR aperte, con l'età della più vecchia.
- Esito dell'ultima CI su `main`.

## 4 · La produzione (Vercel)
Gruppi di errori degli ultimi 7 giorni: `get_runtime_errors` sul progetto
`boum-roma` (team `valentino-boom`). Il backup notturno arriva ogni giorno
come email «Cassaforte»: se ne manca uno, dillo.

## 5 · La risposta, in questo formato e non più lunga

```
LUNEDÌ <data>
Soldi 7 gg: proposte N · €X | PFS N · €Y | fatture N · €Z
Soldi mese: proposte N · €X | PFS N · €Y | fatture N · €Z
Non ricavi (7 gg): canoni dei proprietari €A · payout Stripe €B
Obiettivi: 1 <stato + fatto> · 2 <…> · 3 <…>
Lavoro aperto: rami N/2 · PR N (la più vecchia: N giorni) · CI main <verde/rossa>
Guasti 7 gg: <nessuno | i gruppi, uno per riga>
Da decidere: <al massimo tre righe, solo se c'è una scadenza di ORA.md>
```

Se un obiettivo è fermo da due lunedì, dillo nella riga «Da decidere».
Mai suggerire lavoro nuovo: ciò che non è in `ORA.md` non entra nel
resoconto.
