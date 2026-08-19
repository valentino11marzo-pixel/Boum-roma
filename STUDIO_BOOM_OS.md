# STUDIO — BOOM OS: un motore, due facce

**La domanda del fondatore** (2026-08-18): *"possiamo creare qualcosa di
perfetto, ultra power, con tutti i nostri tool, bot, sito, portale, database —
due versioni: quella mobile appena fatta, e sul desktop tutta un'altra
versione? Voglio un sistema, una macchina, un protocollo di livello
professionale come un software globale top. È possibile?"*

**Risposta: sì — ed è già cominciato.** Ma la parola che tiene in piedi tutto
è UNA: le "due versioni" sono **due facce dello stesso motore**, mai due
software. Il giorno in cui esistessero due codebase (una mobile, una desktop)
BOOM avrebbe due verità sui contratti, due bug diversi sulla stessa rata, due
posti dove dimenticare una modifica. I software globali top (Linear, Stripe,
Superhuman, Notion) fanno esattamente questo: **un solo cervello, esperienze
per superficie**.

---

## 1. Il protocollo (le regole che rendono possibile "ultra power" senza caos)

1. **Un motore.** Dati (Firestore), logica (portal-app.js + `api/**` + La
   Squadra + i bot), regole (firestore.rules) restano in UNA copia. Nessuna
   faccia duplica una decisione: se serve un calcolo, si chiama quello che
   c'è; se non c'è, si aggiunge AL MOTORE, mai alla faccia.
2. **Facce come layer.** Ogni esperienza è un layer di presentazione
   (`js/portal-mobile.js` / `js/portal-desktop.js`) che:
   - si accende su un CONFINE esplicito (la stessa query `max-width:920px`,
     diritta per mobile, negata per desktop — mai zone doppie né terra di
     nessuno, testato attraversandolo nei due sensi);
   - esprime ogni stato visivo in classi gated (`body.pm-on` / `body.pd-on`)
     così ridimensionare la finestra RIPRISTINA da solo;
   - agisce SOLO per proxy: `.click()` sugli elementi originali, chiamate
     alle globali già esposte — la validazione, il salvataggio, i permessi
     restano del motore;
   - ha il suo kill switch (`?classic=1` / `?deskclassic=1`) e i suoi test
     (sorgente + browser vero).
3. **La sidebar è l'indice della macchina.** Tab bar (mobile), Menu sheet,
   Command Palette (desktop) leggono TUTTI le voci dal DOM di `buildNav()`:
   sezioni, console satellite, badge. Aggiungere una superficie alla
   sidebar = comparirà ovunque, gratis, senza drift.
4. **La ricerca è UNA.** `handleSearch` (10 collezioni) è il motore; la
   palette desktop lo invoca e ne ADOTTA le righe già pronte. Mai un secondo
   indice da tenere allineato.
5. **Niente entra senza test.** Ogni promessa di un layer è pinnata sulla
   sorgente del motore (nomi campo, sezioni, tipi modale) e provata in un
   Chromium vero. Oggi: 59 suite, tutte verdi.

Questo è "il sistema/macchina/protocollo": non un prodotto da comprare, una
**disciplina eseguibile** — ed è la stessa già usata dal lato server (la
lezione `_avail.js`: una copia sola, condivisa da ogni superficie).

## 2. Le due facce

### Faccia M — il portale in mano (M2, consegnata)
Tab bar, bottom sheet, liste→card, wizard sereno dei contratti, riepilogo
prima di salvare. Studio dedicato: `STUDIO_PORTAL_MOBILE.md`.

### Faccia D — il cockpit sulla scrivania (D1, consegnata con questo studio)
Il desktop non deve imitare il telefono: deve dare quello che il telefono
non può — **tastiera, densità, contesto**. D1 mette i tre segni distintivi
dei software di grado globale:

1. **Command Palette (⌘K / Ctrl+K)** — il punto di comando di TUTTA la
   macchina: sezioni e console (dalla sidebar vera, badge compresi), azioni
   di creazione (Nuovo contratto/immobile/utente/pagamento/fattura/…, proxy
   di openModal, solo per l'admin), e la ricerca entità sollevata dal
   motore esistente (clienti, immobili, contratti, pagamenti, documenti,
   manutenzioni, lead, task, scadenze). ↑↓ ↵ esc.
2. **La tastiera del portale** — `g` poi lettera per navigare (g c =
   Contratti), `n` poi lettera per creare (n c = Nuovo contratto), `/` =
   ricerca, `?` = il foglio dei tasti. Educata per costruzione: mai attiva
   dentro un campo di testo o sopra un modale aperto.
3. **Peek drawer** — le schede di sola LETTURA (il fascicolo contratto con
   i suoi 15 bottoni, le notifiche, la scheda immobile) si aprono come
   pannello laterale destro: il contesto resta sotto gli occhi. I FORM
   restano finestre: cambiare cornice a metà compilazione disorienta.
   Più una rifinitura sobria: header in vetro, filo d'oro sulla voce
   attiva, focus visibile da tastiera, scrollbar da strumento.

## 3. Perché così e non "un'app nuova da zero"

L'alternativa onesta era riscrivere: un frontend nuovo (React/nativo) sopra
le stesse API. Costo reale: mesi, doppio codice da mantenere per un
operatore solo, e TUTTA la potenza già viva (56 pagine, 23 cron, i bot, le
console) da ricablare. Il valore per il fondatore sta nell'esperienza
percepita e nella velocità operativa — e quelle si conquistano a layer, con
rischio contenuto per costruzione e rollback a un parametro. Quando un
giorno servisse il salto (app store, offline totale), il protocollo regge
comunque: il motore è già separato dalle facce.

## 4. Roadmap — da qui a "software globale top"

| Fase | Cosa | Perché è il prossimo gradino |
|---|---|---|
| **D2** | La "Oggi" desktop come **command deck**: agenda visite coi viaggi, firme in attesa, cassa del giorno, salute Squadra — e le stesse card su mobile in "Oggi" | è il call-sheet che il Regista già scrive su Telegram, portato dentro il portale; i dati sono già tutti in `S` |
| **D3** | **Peek ovunque**: aprire clienti/contratti dai risultati della palette direttamente in drawer, con azioni rapide in testa | trasforma la ricerca in navigazione istantanea |
| **P1** | **Dieta del boot** (audit I1-I2): limit sulle query nude, cache completa, 7 lazy step in parallelo | le facce ora sono degne; il boot da 2,3MB è il collo di bottiglia rimasto |
| **P2** | **Spezzare portal-app.js per pagina** (audit I3, `import()` dinamico senza build) | da 681KB a ~150KB critici: il "tempo-a-utile" da software vero |
| **P3** | PWA piena: icona installata, push (sw.js già pronto), scorciatoie app | il telefono la smette di sembrare un sito |
| **Q** | Le quality-gate del grado globale: error budget su `/api/log`, uptime `salute.html`, versioning visibile del layer | un software top non È top: lo DIMOSTRA in continuo |

## 5. Come si prova (desktop)

Su `/portal` da computer: premere **⌘K** (o Ctrl+K) e scrivere — un nome,
"contratti", "nuovo". Poi `?` per il foglio dei tasti, `g c` per volare sui
Contratti, e aprire un fascicolo contratto: arriva da destra, col resto
della pagina ancora lì. Se qualcosa non convince: `?deskclassic=1` spegne
solo il desktop, `?deskapp=1` lo riaccende (il mobile ha i suoi:
`?classic=1` / `?app=1`).

---

*Studio e implementazione D1 del 2026-08-18. Consegna:
css/portal-desktop.css, js/portal-desktop.js, wiring portal.html/sw.js,
tests/desktop/{run,ui}.mjs (66 check). Batteria completa: 59 suite verdi.
Faccia mobile: STUDIO_PORTAL_MOBILE.md.*
