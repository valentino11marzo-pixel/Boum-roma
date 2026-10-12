# Sito pubblico — Réunion, Executive, Meteo, SEO/GEO, foto, scorrimento, anteprime

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### BOOM La Réunion (`/reunion` + `api/reunion-lead.js` + `api/_market.js`)
Il secondo mercato. Landing **francese** (toggle EN, `?lang=en`) che serve TRE
pubblici — propriétaires, locataires e **acheteurs** — con un selettore che
riscrive metà pagina senza ricaricare (`body[data-aud]`, CSS puro: si
NASCONDONO gli altri due, mai `display:revert`, che trasformerebbe un `.frow`
in blocco e romperebbe il form). Il francese **non** si deduce da
`navigator.language`: servire inglese sotto una canonical dichiarata `fr`
significa darlo anche al crawler. `?role=owner|tenant|buyer` apre già dal lato
giusto (per condividere un link mirato).
- **Il terzo binario (acquisto)** è l'unico dove la parte più preziosa è anche
  la più regolamentata: in Francia ricerca per conto dell'acquirente e
  trattativa sono **transaction** e richiedono la **carte T** (più severa
  della carte G della gestione). Quindi la pagina vende ciò che è davvero
  erogabile oggi — andare a VEDERE il bene che il cliente ha già trovato,
  visita video in diretta, compte rendu scritto, lettura di diagnostics e
  documenti di condominio — e la ricerca/negoziazione resta dentro `lg-*`,
  che compare solo cambiando `data-legal`. `budgetKind:'purchase'` distingue
  il budget d'acquisto dal canone: stampare "320 000 €/mese" sarebbe la
  prova, mandata al cliente, che nessuno ha capito la sua richiesta.
- `POST /api/reunion-lead` — pubblico, stesso irrigidimento di `canone-lead`
  (honeypot, rate limit per IP, campi clippati) e **stesso schema `leads`**:
  il lead sale nella macchina esistente (Lead Brain → notify-pending →
  Commerciale) senza costruire nulla di nuovo. `leadType` landlord|tenant è
  l'unica cosa che l'operatore legge prima di rispondere, quindi viene fissato
  alla porta E ripetuto in testa al riassunto (`PROPRIÉTAIRE —` / `LOCATAIRE —`).
  Marca `market:'reunion'`.
- **`api/_market.js` — la macchina romana tace invece di sbagliare.** Tutta
  l'automazione BOOM è tarata su Roma: il messaggio WhatsApp precompilato di
  `notify-pending` è firmato "BOOM Roma" e linka `/apartments`, il Commerciale
  scrive la prima risposta con un SYSTEM prompt che descrive il mercato romano
  e rilancia con "stai ancora cercando casa a Roma?". Senza guardia, il primo
  proprietario di Saint-Pierre riceve **una mail in inglese che gli propone una
  casa a Roma**. `isReunion()` (market | sourceRef | intent) è letta da
  `notify-pending` (card 🇷🇪 + messaggio già scritto **in francese** via
  `reunionReplyText`, mai una firma inventata) e da `commerciale.js`, che
  **esce prima di redigere**: un'automazione che sbaglia mercato è peggio di
  nessuna automazione, perché l'operatore ci mette la firma sotto.
- **L'interruttore loi Hoguet** (`<body data-legal="pending|card|partner">`):
  in Francia gestione locativa e transazione richiedono carta professionale +
  garanzia finanziaria. Finché lo status non è deciso la pagina **non rivendica
  nulla** e lo dice (che è vero, ed è coerente con il resto della pagina);
  quando la carta o il partner esistono si cambia UN attributo e compaiono le
  frasi giuste — FAQ e mentions légales insieme, invece di una caccia alle
  formulazioni nel file. I campi `[NUMÉRO]`/`[SIREN]`/`[PARTENAIRE]` vanno
  riempiti PRIMA di cambiare l'attributo.
- **Essere trovati e essere CITATI** (il giro SEO/GEO): immagine social
  dedicata `og-reunion.png` **generata dal repo** (card HTML → screenshot
  headless → crop PNG senza dipendenze, `tests/` ne asserisce i 1200×630 —
  prima la pagina condivideva su WhatsApp la card di Roma); title 51 car. e
  description 155; **quattro blocchi JSON-LD** (Organization, Breadcrumb,
  FAQPage, `@graph` con WebPage+speakable e i **tre Service** con
  `audience`/`areaServed`/`url` del proprio volet — è ciò che permette a un
  motore di rispondere "sì, anche per un acquirente"); il blocco **« en bref »**
  scritto per essere citato (fatti a plat, compresa la riga che dice cosa NON
  facciamo — una fonte che dichiara i propri limiti è una fonte che si cita);
  `llms.txt` con la sezione del secondo mercato, i tre `?role=` e la nota
  Hoguet, così un'AI non promette per noi più di quanto facciamo.
  **Invariante testata**: ogni domanda nel FAQPage deve esistere come
  `<summary>` VISIBILE (markup che afferma ciò che la pagina non mostra è
  contenuto nascosto: Google lo sanziona e un motore cita una frase
  introvabile), e i selettori `speakable` devono puntare a nodi reali.
- Test: `node tests/reunion/run.mjs` (117 check) — la porta (honeypot, rifiuti
  che non scrivono mai un lead a metà, limite per IP), il lato che non si perde
  mai, la lingua che non ricade sull'italiano, **il lead romano che non diventa
  réunionnais** (la regressione più cara: risposte in francese ai clienti di
  Roma) e le due guardie asserite sulla SORGENTE, perché conta l'ORDINE — la
  guardia deve stare prima della chiamata che spende e spedisce. Più il terzo
  binario: gli alias del ruolo, il budget d'acquisto che non diventa MAI un
  canone mensile, e la riserva carte T scritta invece che sottintesa.

### BOOM Executive (`/executive` + `api/executive-lead.js` + `STUDIO_EXECUTIVE_ROMA.md`)
La nuova stagione: sfondare oltre gli studenti sui **lavoratori stranieri di
alto livello in trasferta a Roma** (transitori 1–18 mesi) e, di conseguenza,
sulle aziende. La Réunion resta il laboratorio del PATTERN (pagina bilingue →
lead nello schema esistente → guardia che zittisce la macchina sbagliata);
questo è il pattern applicato al mercato primario. Lo studio di settore —
i sei flussi veri di Roma (agenzie ONU FAO/WFP/IFAD, doppio corpo diplomatico
Italia+Santa Sede, secondment aziendali, ricerca/ERC, sanità, produzioni
Cinecittà), il varco competitivo, il playbook 90 giorni e le righe rosse da
non promettere — sta in `STUDIO_EXECUTIVE_ROMA.md`.
- **`executive.html` (`/executive`)** — EN-first con toggle IT (`?lang=it`,
  mai dedotta dal browser: la canonical dichiara en). **Pagina di
  CONVERSIONE, non brochure** — quarta iterazione, dopo tre bocciature del
  fondatore (v1 = layout clonato dalla Réunion; v2 = marca estranea
  serif/carta; v3 = stile BOOM giusto ma "chaotic, dispersive,
  overwhelming": 2.003 parole prima del form, 3 CTA nel solo hero). I due
  studi che la governano: **`STUDIO_EXECUTIVE_UIX.md`** (le espressioni
  vere del brand: boom-2026.css con oro **#FFD700** — mai il #D4AF37 del
  portal — layer tech di index, lockup `BOOM │ EXECUTIVE ROMA` unico
  elemento di marca nuovo) e **`STUDIO_EXECUTIVE_CONVERSIONE.md`**
  (benchmark sui convertitori veri: Blueground/Homelike/Spotahome +
  modello relocation → UNA porta, prodotto/prova subito, ≤8 blocchi, form
  ≤5 campi, B2B su binario separato). Architettura: **il form È l'hero**
  ("Get options today", 5 campi visibili + "More details" a scomparsa —
  l'attribuzione `sector` non si perde, si nasconde), ~89 parole prima del
  form, prova subito (★4.9 · registrati · *serving people at FAO · WFP ·
  IFAD · embassies…*), macchina sussurrata in UNA riga mono, sei flussi
  in griglia compatta (ancore `#seg-un`…), contratto compatto con striscia
  Magic Sign, il corporate SOLO in fam strip/footer/una riga (lezione
  Homelike: il B2B non inquina il flusso persona). Reveal `.rv` con rete
  `<noscript>` + fallback senza IO. GEO: blocco "in brief" citabile, FAQ
  visibili = FAQPage JSON-LD, @graph con DUE Service (persona →
  /executive, azienda → /corporate), og `og-executive.png` generata dal
  repo (headless_shell — il chromium "vecchio" headless perde il footer a
  630px esatti). Alias redirect: `/executive-rentals`, `/executive-stays`,
  `/relocation-rome`.
- **`POST /api/executive-lead`** — porta pubblica irrigidita (honeypot
  `company`, rate limit IP, clip/num con separatori migliaia: "2.500" è
  2500, mai due euro e mezzo — e formattazione €2.500 deterministica, MAI
  toLocaleString che con small-ICU degrada in silenzio). Il professionista È
  un tenant: `leadType:'tenant'`, `intent:'executive_relocation'`,
  `market:'roma'`, lingua default **en** — la macchina esistente (Brain →
  notify-pending → Commerciale) lo lavora al completo. In testa al riassunto:
  `EXECUTIVE — Roma · <settore> · <datore> · zona · ~€X/mese · arrivo ·
  durata` (settore da select chiusa `SECTORS`, mai testo libero inventato —
  l'attribuzione per flusso è gratis dal giorno uno). **Il campo visibile del
  datore si chiama `employer`**: la lezione webforms, un executive che
  dichiara l'azienda non è un bot.
- **La voce B2B (`api/_market.js`: `isB2B`/`b2bSide`/`b2bReplyText`)** —
  l'ALTRO asse rispetto a isReunion: non "che mercato" ma "che voce". I
  moduli partner (università/aziende/ricerca/proprietari, source `partner`),
  leadType `company` e intent `partner-*` sono enti: il **Commerciale TACE**
  (guardia PRIMA di proposeFirstReply, come la guardia Réunion — la persona
  "ti va una visita?" a un HR è la figuraccia che brucia il canale) e
  **notify-pending** porta la card 🏢 col messaggio business già scritto
  (EN/IT da replyLang, org vs owner — al proprietario non si chiede "quante
  persone", firmato Valentino perché qui il mercato È Roma). Il lead
  executive NON è B2B per costruzione: la macchina inquilino resta accesa.
- Agganci: sitemap (hreflang en/it), llms.txt (sezione BOOM Executive per i
  motori di risposta), index (card For Organisations + footer), rimando
  reciproco `/corporate` ⇄ `/executive` (niente doppioni: la persona su
  /executive, l'azienda su /corporate).
- Test: `node tests/executive/run.mjs` (95 check — porta, employer ≠
  honeypot, schema tenant, testa del riassunto, budget coi separatori,
  lingua che non ricade sull'italiano, isB2B/b2bReplyText, guardie asserite
  sull'ORDINE nel sorgente, invarianti SEO/GEO della pagina, reciprocità dei
  link).

### GET `/api/meteo` + `meteo.html` (`/meteo`) — IL METEO DEL MERCATO
Il bollettino PUBBLICO del mercato romano (STUDIO_AVIATION, W2), zona per
zona, servito dagli aggregati del Perito (`marketStats/<slug>` — che resta
admin-only nelle rules: la porta ripubblica SOLO aggregati, con whitelist
esplicita campo per campo — mai un annuncio, un URL sorgente o un
contatto). Mediana/p25–p75 del CHIESTO, assorbimento (SOLO morti provate),
ribassi 30gg, conteggi campione. La disciplina del Perito passa intatta:
zona sotto `minSample` → nell'elenco `measuring`, col solo nome, MAI un
numero. Cache CDN 30'. `/meteo` è la pagina citabile (indicizzata, EN,
lingua dello scalo, chip zona da scalo-codes, Dataset JSON-LD che punta a
`/api/meteo`, «in brief» coi numeri veri della zona più campionata, blocco
metodo che dichiara fonti e limiti); in sitemap e llms.txt. La plancia PFS
ha anche lo SWEEP (W3): le 💎 di `radarState/occasioni` come blip — raggio
= quanto sotto la mediana (centro = più forte), angolo = SOLO disposizione
(dichiarato nel title), click → la card nella strip. Og social generate
dal repo (`design/scalo/genera-og-scalo.py` → `og-board.png`,
`og-meteo.png`, headless_shell 1200×630). Test: `node tests/scalo/run.mjs`.

### POST `/api/media/caption`
Public, rate-limited (8/min/IP) copywriter for media-studio.html. Body:
`{ tipo: 'ig-post'|'ig-story'|'portale'|'breve', lingua: 'it'|'en', zona,
prezzo, locali, mq, extra }`. The prompt is built entirely server-side from
length-capped fields (no general proxying possible); model pinned to haiku,
max_tokens 500. CORS: boomrome.com + *.vercel.app previews. Returns `{ text }`.
## Le foto sono nostre + il percorso critico (api/media/rehost.js · tests/media/hosts.mjs)

Agosto 2026: sei pagine PUBBLICHE — corporate, partners, universities,
research, virtual-viewing e le schede storiche — servivano le proprie
immagini da **i.imgur.com**. Una pagina che chiede a un expat di fidarsi
prima di mandare un deposito dipendeva, per la prova visiva, da un host di
terzi: se blocca l'hotlink o cancella il file, la pagina non da' errore —
resta in piedi a vendere con i riquadri vuoti, e nessun allarme suona.
- `api/media/rehost.js` (auth come i cron PFS) scarica l'originale,
  **verifica i byte** (imgur risponde 200 con una placeholder quando il
  file non c'e' piu': senza guardare la firma l'avremmo copiata e servita
  come se fosse la foto vera), carica su Storage sotto `site/` con cache
  immutabile. Chiave **derivata** dall'URL di partenza → rieseguire non
  duplica mai, e la mappa e' ricostruibile senza stato.
- `scripts/rehost-images.mjs` riscrive i file dalla mappa. Il download non
  lo fa lo script perche' l'ambiente di sviluppo puo' non raggiungere
  l'host di partenza; il server si'.
  `BOOM_BASE=… HOMIE_SECRET=… node scripts/rehost-images.mjs --apply`
- **`tests/media/hosts.mjs` e' la parte che vale** (5 regole): un'immagine
  esterna NUOVA fa fallire; una voce sparita dall'elenco
  (`fuori-casa.json`) fa fallire pure, cosi' l'elenco non invecchia in
  silenzio e aggiornarlo E' il momento in cui si vede il progresso; le
  pagine pubbliche si deducono da `sitemap.xml`, mai da una lista a mano.
  Piu' due regole nate misurando:
  · **budget per RUOLO** (pagina 200 KB · card social 120 · pass Wallet
    400 — le strisce dei pass viaggiano dentro il .pkpass e vanno viste a
    retina: un numero unico avrebbe rovinato i pass o mancato la foto da
    295 KB nella griglia). `foto-catalogo/pigneto-palace.jpg` era
    1500×2000/295 KB per una card larga ~380px in un riquadro 4:3: sei
    volte i pixel, quasi tutti ritagliati via, ed era l'oggetto piu' pesante
    di apartments.html — piu' dell'HTML. A 800px/48 KB la pagina e' passata
    da **591 KB a 343 KB** senza toccare una riga di markup. Idem
    og-login.png 211→44 KB e og-home.png 171→49 KB.
  · **il motore d'ambiente resta fuori dal percorso critico.** I 103 KB di
    `js/boom-ambient.js` costano, misurati in Chromium con CPU a 1/4
    (telefono di fascia media, 4 misure concordi), **~420ms di thread
    principale prima che la pagina sia interattiva** e ~600ms sul load —
    senza toccare la prima pittura, cioe' lavoro nel posto sbagliato. Su 21
    pagine il `<script src>` nudo e' diventato uno **stub inline** che mette
    in coda `mount`/`mood` e carica il motore dopo `load`, riversandogli
    dentro la coda: **nessuna pagina ha dovuto cambiare la propria
    configurazione**. DCL ~950→~600ms. LA TRAPPOLA: boom-ambient.js comincia
    con `if (window.BoomAmbient) return;` — uno stub con quel nome lo
    farebbe uscire all'istante e l'ambiente sparirebbe da 21 pagine SENZA UN
    ERRORE; percio' lo stub si `delete` un attimo prima di iniettare.
    Verificato che il canvas dipinga davvero, prima e dopo.
- 15 **preconnect morti** tolti (i.imgur.com su sette file,
  tiles.openfreemap.org su apartments/how-it-works/try/your-money): una
  risoluzione DNS + TCP + TLS regalata a ogni caricamento verso un host da
  cui non si scarica niente. La regola e' stretta apposta — morto = l'host
  non compare DA NESSUN'ALTRA PARTE nel file — perche' cercarlo solo fra le
  immagini segnalava i tile di skyline.html, che una libreria chiede via JS
  e il cui preconnect e' corretto.

## L'anteprima E' la pagina (design/pages-deco/anteprima.py + test-anteprima.cjs)

Le anteprime pubblicate come artifact sono state **HTML nudo per un giro
intero**: il costruttore consegnava il corpo senza `<head>`, come vuole il
guscio dell'artifact, e con l'head se ne andavano tutti i fogli di stile.
Su desktop passava per una pagina strana; da telefono era illeggibile, ed e'
cosi' che l'abbiamo scoperto — dall'utente, che e' il posto sbagliato.
Tre trappole, tutte pagate in un pomeriggio e tutte scritte accanto al
codice che le evita: (1) gli stili si portano DENTRO il corpo (`<style>` in
body e' valido); (2) cio' che si inlina esce di scena dietro un segnaposto
PRIMA che si riscrivano gli URL locali — quella riscrittura entrava dentro
il codice e trasformava una regex letterale `(/fonts\./)` in
`(https://boomrome.com/fonts\./)`, con l'errore laconico *"missing ) after
argument list"*; (3) il vestito si raccoglie NELL'ORDINE DEL DOCUMENTO —
raccolto per tipo invertiva la cascata e la striscia dei servizi risaliva di
60px sotto la nav. `test-anteprima.cjs` apre la pagina VERA e la sua
anteprima nello stesso Chromium a 390px e 1440px e pretende stesso fondo,
stesso carattere, stessa geometria (±2px), stesso contenuto, zero errori JS.

## La casa in ordine — SEO/GEO (tests/seo/run.mjs)

Undici regole su **60 pagine dedotte dalla sitemap**, non da una lista a
mano. Ognuna nata da un difetto VERO trovato in produzione, non da una
checklist di buone pratiche:
- **Il robots non chiude la porta alla sitemap.** `Disallow: /s` era una
  regola per una vecchia rotta, ma nel protocollo robots vale come prefisso:
  bloccava anche `/sitemap.xml`, `/services` e `/skyline`. Search Console
  riportava «Impossibile leggere la Sitemap» con XML valido e HTTP 200.
  La guardia ora verifica la sitemap stessa e ogni URL che essa dichiara.
  Ha trovato anche `/booking`: il modulo resta pubblico e seguibile, ma è
  `noindex` e non viene più dichiarato nella sitemap.
- **Il documento e' un documento.** `property-finding.html` e `board.html`,
  due pagine LIVE, non avevano `<!doctype>`, `<html lang>` ne'
  `<meta charset>`. Misurato in Chromium: **quirks mode**, nessuna lingua
  dichiarata, e il browser che indovina `windows-1252` — cioe' «â‚¬350» al
  posto di «€350», «Â§4.2» al posto di «§4.2» e le stelle ★ della recensione
  sparite. Sulla pagina di punta. Il guscio e' stato aggiunto e il layout
  verificato prima/dopo (l'uscita dal quirks mode cambia il box model).
- **Le card social esistevano solo nel markup.** 50 pagine pubbliche
  dichiaravano `BOOMsocialprofile.png`, **un file mai esistito nel repo**:
  ogni inoltro su WhatsApp/LinkedIn/Slack mostrava una card vuota — per
  un'attivita' che cresce passando di telefono in telefono, il difetto piu'
  caro del sito. Ora `design/pages-deco/genera-og-servizi.py` genera **otto
  card dal repo** (le sei servizio + Property Finding + Welcome to Rome),
  ognuna col proprio prezzo LETTO da `api/_catalog.js` — la card non puo'
  dire un numero diverso dalla pagina. Il default della pipeline e
  `api/listing.js` non ricadono piu' sul fantasma.
- **Nessuna entita' dichiarata due volte.** Tre pagine portavano un intero
  blocco SEO duplicato (seconda `RealEstateAgent`, secondo `WebSite`, secondo
  `BreadcrumbList`, secondo `Service` con `serviceType:"Legal"` — che
  contraddiceva il disclaimer della pagina stessa, «agenzia, non studio
  legale»). La regola guarda l'IDENTITA', non il tipo: i tre `Service` di
  `/reunion` hanno url diversi ed e' una scelta voluta.
- **Una domanda dichiarata deve ESSERE in pagina.** `faq.html` dichiarava
  DUE `FAQPage` con nove domande, di cui **sei inesistenti come testo
  visibile**: parafrasi ottimizzate per il motore di domande che la pagina
  pone con altre parole. E' contenuto nascosto. `scripts/faq-schema.mjs`
  ora **deriva** il FAQPage dalle card visibili (9 → **38 domande**) e sulle
  altre pagine taglia alle domande vere: 53 fantasmi tolti, 10 FAQPage
  senza una sola domanda reale rimossi (services.html ne dichiarava quattro
  **senza avere una FAQ**).
- Piu': titoli ≤62 e descrizioni 110–165 (21 riscritte), nessun titolo
  ripetuto fra pagine, canonical assoluta e concorde con la sitemap,
  nessuna pagina indicizzabile fuori dalla sitemap (ci mancava
  `welcome-to-rome`, cioe' proprio «the viral asset»), `llms.txt` allineato
  ai prezzi di `api/_catalog.js` e senza promesse non dimostrabili, e ogni
  `speakable` che punta a nodi reali.
- Il 5 ottobre 2026 Search Console ha misurato PFS (58 impressioni, posizione
  18,3), DAS (43, posizione 8,5, zero clic) e VV (91, posizione 16,2). Title,
  H1, risposta breve e schema `Service` ora rispondono alle query reali
  «property finder», «rental contract review» e «virtual apartment viewing».
  Da `services.html` e' sparito anche «clients save €600+ on average»: non era
  una misura disponibile, quindi non puo' essere una promessa pubblica.

**Il blocco «in brief»** (`.breve`, dal motore della console) e' la parte
GEO: fatti a plat — cos'e', prezzo esatto, cosa comprende, **cosa NON e'**,
per chi, e chi lo eroga con partita IVA. La riga dei limiti e' quella che
conta: una fonte che dichiara cosa non fa e' una fonte che un motore di
risposta cita, e protegge dal cliente che arriva aspettandosi altro. Il nodo
`WebPage` con `speakable` punta al registro e a questo blocco.

**Il titolo segue la domanda che Google mostra davvero** (5/10). Search
Console, tre mesi: `/canone` 773 impressioni, CTR 1,2%, query dominante
«calcolo canone concordato»; `/blog-contract-types` 417 impressioni, CTR
0,5%, posizione media 7,7, query dominante «4+4 contract Italy». Title,
description, H1 e risposta breve visibile ora aprono con quelle domande;
JSON-LD e `scripts/seo-config.js` riportano la stessa promessa e la stessa
data di modifica. Test: `node tests/seo/run.mjs`.

## Lo scorrimento — un contratto solo (css/boom-scroll.css + js/boom-scroll.js)

Misurato in Chromium su 60 pagine, non supposto. Quattro difetti veri:
- **45 fra pagine e viewport portavano il lettore SOTTO la barra fissa.**
  Un link interno e il titolo finiva dietro la nav: si atterrava a meta'
  frase (su `apartment-detail` erano sei ancore su sei). La causa:
  `scroll-margin`/`scroll-padding` usati SEI volte in tutto il sito, con
  numeri a mano (86, 104, 150px) mentre la barra vera va da **71 a 99px**
  secondo pagina e larghezza.
- **index.html saltava di 78px al caricamento** (CLS 0,058, tutto a y=0 —
  cioe' sotto gli occhi di chi ha appena iniziato a leggere): la parola
  DAYS del titolo e' un tabellone a palette costruito dal JS a ~600ms,
  **cinque caselle per quattro lettere = 4,55em contro i 2,65em** del testo
  (rapporto identico misurato a 390/1024/1280/1440px), che mandava il
  titolo su una riga in piu'.
- **apartments.html saltava di 119px**: `.zone-quadro` nasce alto 130px e
  si riempie a ~460ms.
- **owners.html e board.html scorrevano di lato** (72px e 42px): una
  scritta decorativa fuori quadro, e cinque colonne coi minimi che
  sommavano 410px dentro una finestra da 390.

La riparazione non e' quarantacinque pezze: **`scroll-padding-top`
sull'elemento che scorre copre tutto in una proprieta'** — frammento
`#sezione`, `scrollIntoView()` e `:target` — e il valore non si indovina,
lo **misura il browser**. `js/boom-scroll.js` (~500 byte) legge
`elementsFromPoint(x, 2)` — costa quanto la profondita' dell'albero, non
quanto il numero di nodi — al caricamento, al primo scorrimento e al
ridimensionamento, e scrive `--boom-barra`. Inline su ogni pagina pubblica
fra i marcatori `BOOM_SCROLL`. Per il resto **lo spazio si riserva PRIMA**:
`min-height` misurato sui due tabelloni, e larghezza+altezza in `em`
riservate al tabellone del titolo — ma solo con JS attivo, perche' senza
JS il tabellone non arriva mai e riservargli spazio lascerebbe un buco.
Per ritagliare si usa `overflow-x: clip` e mai `hidden`: hidden creerebbe
un contenitore di scorrimento e spegnerebbe gli sticky interni.

`tests/scroll/run.mjs` tiene la linea in un browser vero — tutto il sito a
390px, le pagine che vendono anche a 1440. **La regola misura il primo
TESTO, non il bordo della scatola**: su `/executive` il `<main>` comincia a
y=0 ma ha 172px di padding e il titolo sta a 178, cioe' libero — guardare
la scatola avrebbe segnalato come rotto un caso sano, e una guardia che
grida al lupo si smette di ascoltarla. Soglia CLS 0,02, dieci volte sotto
il «buono» di Google. Il test blocca ogni richiesta non locale: un test di
layout non deve dipendere dalla rete.

## Il catalogo dichiara i suoi prezzi (scripts/catalogo-schema.mjs)

Su `/apartments` il canone e' un tabellone a palette: bello, e leggibile da
un umano — ma nel LIVELLO DI TESTO la pagina esponeva **cinque prezzi in
tutto** su 19 case, perche' le cifre stanno dentro le palette e non in un
nodo di testo. L'`aria-label` c'e' (i lettori di schermo sono a posto) e
`data-p` pure, ma i dati strutturati contenevano `CollectionPage` e basta:
**zero `Offer`, zero prezzi**. Le SCHEDE singole li dichiarano da sempre
(`api/listing.js`, Offer completa con `priceCurrency` e `unitText` MONTH);
la vetrina — la pagina che un motore mostra per «apartments for rent in
Rome» — no.

L'`ItemList` si **deriva** dalle card che ci sono gia' (href, data-prezzo,
data-zona, data-letti, data-mq, nome): nessun dato inventato e nessuna
seconda fonte da tenere allineata. La disponibilita' segue la disciplina di
`dispo-engine`: `InStock` solo su «Available now», `PreOrder` su «Free from
<data>», e su tutto il resto NIENTE — una casa che non sappiamo quando si
libera non si promette a un motore. Il campo camere resta `numberOfBedrooms`
**come lo dichiara gia' `api/listing.js`**: divergere avrebbe prodotto due
dichiarazioni in contraddizione sullo stesso annuncio, che e' peggio del
dubbio. Regola in `tests/seo/run.mjs`: l'ItemList deve coprire TUTTE le card
di build, o e' invecchiata e va rigenerata.

**Nota sui dati** (Firestore, non codice): due annunci su 19 dichiarano un
numero di camere incoerente col proprio nome — «Bilocale Centro» con 3
camere, «Trilocale Pigneto» con 3. Va corretto alla fonte, non nel markup.
