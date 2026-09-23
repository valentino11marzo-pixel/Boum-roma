# Mandato per un secondo revisore — `/owners` V1 «la pianta che si alza» (23/09/2026)

Incolla questo testo a Codex (o a qualunque secondo revisore) dentro il repo
`valentino11marzo-pixel/boum-roma`, sul branch `claude/gifted-cannon-c12xbg`.
Il lavoro di scrittura è fatto; il tuo è **smontarlo**. Non riscrivere la
pagina da zero: ogni modifica che proponi deve rispondere a un difetto che sai
nominare, con il file e la riga.

## Cosa c'è

- `owners.html`: la pagina. Una casa d'esempio disegnata come pianta tecnica
  (70 m², zona C40 Prati) che fa da immagine, da indice e da chiusura; in ogni
  stanza una carta vera, dove sta la paura che risolve. Testo scritto a mano;
  tutto ciò che sta fra i marcatori `<!-- …:START/END -->` lo scrive
  `node design/owners/costruisci-owners.mjs` (idempotente, `--check`).
- `js/owner-offer.js`: l'offerta ai proprietari in UNA copia (prezzi, cancelli).
- `design/owners/pianta.json|mjs|css` + `js/owners-pianta.js`: la pianta e la sua
  salita (proiezione ortografica calcolata alla build, solo su un gesto).
- `design/owners/genera-fascicolo.mjs` → `carte/`: i PDF d'esempio fatti coi
  builder di produzione, timbrati «ESEMPIO — dati inventati», miniature, ZIP.
- `js/owners-app.js`: la pagina viva (cartiglio, targhetta Solari, modulo,
  barra mobile). `js/owners-foglio.js`: il foglio del canone, solo a cancello
  aperto.
- `STUDIO_PROPRIETARI_2026-09.md`: perché, cosa si può dire, cosa manca.

## Cosa verificare (in quest'ordine)

1. **Ogni frase contro il codice.** Per ciascuna affermazione di `owners.html`
   trova il file che la rende vera (la tabella al §3 dello studio è un punto di
   partenza, non una prova). Se non lo trovi, la frase è un difetto.
2. **Le carte.** Apri ogni PDF in `carte/`: è stato davvero generato dal
   builder di produzione che dichiara `carte/manifest.json`? La «riga che
   conta» trascritta in pagina è identica a quella stampata? I dati inventati
   sono coerenti fra i documenti (stessa casa, stesse parti, stesso canone
   1.200 €, date tutte nel passato)? C'è qualcosa che un proprietario potrebbe
   scambiare per un documento reale?
3. **I prezzi.** 0 € prima locazione (la paga l'inquilino, 10% annuo + IVA),
   ½ o 1 mensilità dalla seconda, pluriennale su preventivo, 89 € e 189 € di
   pratiche, «IVA compresa» nella tabella: coincidono con `owner-offer`,
   `api/fiscal/_aspi.js` e `api/_catalog.js`? E con il mandato che il portale
   genera oggi (`mandato_gestione` in `js/portal-app.js`)? **Oggi non
   coincidono**: il mandato dice «10% sul canone o fisso €/mese» — è il P0 n. 3
   dello studio. Proponi il testo minimo del mandato che rende vera la pagina,
   senza inventare clausole legali.
4. **I cancelli.** Con `OFFER.canone.verificato === false` la pagina non deve
   contenere nessun tetto del concordato; con i campi `null` niente giorni di
   riversamento, polizza, referente, recesso, ★. Prova ad accenderli uno per
   volta (`tests/owners/run.mjs` lo fa in memoria) e controlla che la frase che
   esce sia vera e completa.
5. **La salita.** Su un iPhone vero (iOS 17, 18, 26): la pianta si alza solo col
   gesto, niente frame > 50 ms, etichette nitide, memoria di compositing ≤ 16 MB
   (Web Inspector › Layers). Se non regge, la via d'uscita documentata è
   `RISE='dissolvenza'`.
6. **L'accessibilità.** Ordine del DOM = ordine della camminata, etichette
   della pianta ≥ 44 px senza sovrapposizioni a 320/390 px, le luci spente dette
   a parole e non col solo colore, «⏸ Ferma animazioni» che funziona e resta.
7. **Il modulo.** Solo telefono basta; email sbagliata → errore sull'email;
   429 e 5xx con il telefono in chiaro; il lead arriva `leadType:'landlord'`,
   `language:'it'`, con la zona e — se spuntata — «Garanzia: interessato».

## Le righe rosse (non si attraversano)

- Nessuna garanzia sui canoni finché `OFFER.garanzia.stato !== 'attiva'`.
- Nessuna cifra esterna (sfratti, Censis, domanda) senza la fonte primaria
  aperta e una data.
- Nessuna ★ senza il link al profilo.
- Nessun «parola per parola» sul transitorio: il confronto automatico copre
  solo studenti e 3+2.
- Nessun tetto del concordato finché il cancello P0-canone è chiuso.

## Come rispondere

Un elenco di difetti, ognuno con file:riga, perché è un difetto, e la
correzione minima. Poi i test che hai lanciato (`node tests/owners/run.mjs`,
`node tests/owners/ui.mjs`, `npm test -- seo scroll telefono testata media`)
con l'esito.
