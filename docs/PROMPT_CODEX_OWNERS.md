# Mandato per Codex — la pagina `/owners` rifatta (23/09/2026)

Incolla questo testo a Codex (o a qualunque secondo revisore) dentro il repo
`valentino11marzo-pixel/boum-roma`, sul branch `claude/gifted-cannon-c12xbg`.
Il lavoro di scrittura è fatto; il tuo è **smontarlo**. Non riscrivere la
pagina da zero: ogni modifica che proponi deve rispondere a un difetto che
sai nominare.

## Cosa è cambiato e perché

`owners.html` è stata rifatta sulla grammatica di `/executive` v4
(`STUDIO_EXECUTIVE_CONVERSIONE.md`): una porta sola (il modulo «Valuta la
tua casa» nell'hero), prova subito, pochi blocchi, sistema
`css/boom-2026.css`, oro `#FFD700`.

La regola più dura non è grafica: **ogni frase deve avere un file dietro**.
La versione precedente prometteva cose che il codice non mantiene:

| Promessa di prima | Realtà nel repo |
|---|---|
| «Garanzia di solvibilità scritta nel mandato, vincolante per legge» | Il mandato che il portale genera (`js/portal-app.js`, `mandato_gestione`) non ha alcuna clausola di garanzia. |
| Dashboard «in tempo reale» con «Marco R. · solvibilità garantita BOOM» | Mockup con dati inventati. |
| «Supporto prioritario 24/7», «ispezioni semestrali», «preventivi approvabili online» | Nessuna di queste funzioni esiste. |
| «18-24 mesi per uno sfratto», «0% responsabilità agenzie», «12+ adempimenti» | Nessuna fonte. |
| «Rapporto reddito/affitto minimo 3:1» | Nessuna regola del genere nel codice. |

## Cosa verificare (in quest'ordine)

1. **Ogni affermazione della pagina contro il codice.** Per ciascuna frase
   di `owners.html` trova il file che la rende vera (rendiconto:
   `api/owners/rendiconto.js`; verbale: `api/contracts/verbale.js`;
   inventario: `api/contracts/inventario.js` + `js/inventario-engine.js`;
   modelli contratto: `js/contract-pdf.js`; firma: `api/magic-sign/*`;
   registrazione/ASPI: `api/fiscal/registra.js`; ricerca rovesciata:
   `api/leads/match-listing.js`; prezzo pacchetto: `api/_catalog.js`;
   area proprietari: ruolo `landlord` in `js/portal-app.js`). Se una frase
   non ha un file, segnalala: o si toglie o si dimostra.
2. **I numeri del conto concordato.** 14.400 € × 21% = 3.024 €; × 10% =
   1.440 €; differenza 1.584 €. IMU ridotta al 75% (L. 208/2015 c. 53). Se
   trovi un errore normativo, citalo.
3. **Il modulo.** Invia a `/api/partners/submit` con `kind:'owner'`. Da
   oggi per il proprietario basta il telefono (≥ 8 cifre) — ente/università
   restano obbligati all'email. Il lead porta `leadType:'landlord'` e
   `zone`. Verifica che `notify-pending` e il Commerciale lo trattino come
   proprietario (`api/_market.js` `isB2B`/`b2bSide`) e che nessun altro
   lettore di `leads` si rompa con `email: null`.
4. **Telefono vero.** Apri la pagina a 390 px e a 1440 px in Chromium:
   nessuno scroll orizzontale, nessun titolo sotto la barra fissa, niente
   zoom sui campi a un tocco, errore visibile senza nome o senza contatto,
   schermata di conferma dopo l'invio. Le suite: `npm test -- seo scroll
   telefono webforms growth`.
5. **Conversione.** Il modulo ha 5 campi visibili: sono troppi? Il titolo
   («La tua casa a Roma, affittata e documentata.») vende a un proprietario
   romano di 55 anni? Proponi alternative *con il perché*, non gusti.

## Decisioni che NON spettano a te (e nemmeno a Claude)

Le ha solo il titolare, Valentino. Segnalale, non risolverle:

- **La garanzia sui canoni.** La pagina ora dice che BOOM «non assicura i
  canoni». Se una garanzia esiste davvero, va scritta nel mandato *prima*
  di tornare sulla pagina (e una garanzia professionale sul pagamento di
  terzi potrebbe richiedere una forma assicurativa o fideiussoria: da
  verificare con un legale).
- **«Prima locazione: 0 € di provvigione».** È la promessa della pagina
  vecchia, mantenuta. Va confermata.
- **Il compenso della gestione** non ha un numero pubblico.
- **L'immagine social** usa ancora `og-home.png`; una card dedicata si
  genera come le altre (`design/pages-deco/genera-og-servizi.py`).

## Come consegnare

Un commit per difetto, sul branch indicato, con il test che lo prova. Nel
messaggio di commit: cosa era sbagliato, come l'hai verificato.
