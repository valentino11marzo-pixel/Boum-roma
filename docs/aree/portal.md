# Portal e portali — Portal 2.0, mobile/desktop, dati aziendali, fascicolo immobile, accesso e Safari

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### Portal 2.0 — l'esecuzione dell'audit (2026-08, vedi `PORTAL_AUDIT_2026-08.md`)
Un giro solo, otto interventi, 33 suite verdi:
- **`POST /api/notify/send`** — il ponte email del portal. `sendBoomEmail()`
  (stessa firma, 16 chiamanti intatti) ora POSTa qui con Bearer admin/owner/
  landlord; il server veste il vecchio template "notification" nel design
  system condiviso e spedisce via Nodemailer. **EmailJS browser-side è
  RITIRATO**: SDK rimosso da portal.html e book.html, `emailjs.*` non esiste
  più nel portal. Rate 30/min/uid, escape HTML, time-box 12s.
- **M1 "Portal in tasca"** (blocco in coda a `css/portal.css`): safe-area
  ovunque (PWA standalone), header che non sfora più i 390px, footer modali
  a 2 colonne con target 44px, patch `repeat(5/6/7)` + `.stats-grid
  !important`, input 16px fino a 900px, colonna Azioni delle tabelle STICKY
  a destra, sidebar `100dvh`, scroll-lock modali (`body.modal-open`),
  bottone 🔍 che apre la ricerca globale come overlay (su mobile non
  esisteva affatto), `#boomBridge` largo `min(360px, 100vw-32px)`.
- **M2 "Portal App"** (`css/portal-mobile.css` + `js/portal-mobile.js`,
  studio in `STUDIO_PORTAL_MOBILE.md`): M1 toglieva il dolore, M2 cambia il
  MODELLO — su telefono (≤920px) il portale si usa come un'app. Tab bar in
  basso (4 sezioni del ruolo + Menu, badge specchiati dalla sidebar VERA —
  mai una seconda lista che diverge), bottom sheet per il menu/le azioni
  riga/i footer-modale da 15 bottoni (righe 52px con l'etichetta vera),
  liste `.list-item`→card con primaria etichettata + ⋯, le 6 `<table>` vere
  →card con data-label, modali lunghe full-screen con tastiere giuste
  (inputmode), e **il wizard sereno dei contratti**: addContract (che è GIÀ
  un wizard, #cPage0..3) ristrutturato con progress+barra fissa che proxy-a
  i bottoni originali (validazione LORO), i modali piatti (editContract 15
  campi, property 22, user 16-19) spezzati in capitoli semantici con
  riepilogo finale e campo ignoto MAI perso ("Altro"). Regole dure: ogni
  azione è un `.click()` sull'originale (zero fork di logica), i nodi si
  SPOSTANO dentro `#mForm` (FormData integra), lo stato visivo vive SOLO in
  classi gated `body.pm-on` (ruotare un iPad oltre i 920px = il modale
  torna desktop da solo), desktop a zero pixel. Kill switch `?classic=1` /
  `?app=1`. Aggancio: MutationObserver su `#main`/`#modals`/`#sidebar` (~60
  modali bypassano openModal — la classe body.modal-open NON è affidabile).
  Test: `node tests/mobile/run.mjs` (151 check sulla sorgente: nomi campo
  WIZ pinnati su portal-app.js, CSS gated, sw, -webkit-) + `node
  tests/mobile/ui.mjs` (35 check in Chromium vero a 390px col
  contractWizardNav REALE estratto).
- **Correzioni admin mobile (20/09/2026)** — M2 conservava i campi soltanto
  dopo averli spostati: un solo capitolo svuotava il form. Ora decide prima;
  email/numeri invalidi e passi saltati riportano al campo visibile prima del salvataggio.
  Menu e modali bloccano lo scroll sottostante; Menu ha Chiudi/Escape e ritorno del focus.
  Testata con notch, finestre/azioni sopra la tastiera, footer e Inbox rispettano lo spazio
  disponibile; Magic Sign conserva il layout dedicato. Test: `tests/mobile/ui.mjs`
  (dati sintetici, geometria e validazione); `--serve` espone la stessa prova locale.
- **Lavoro mobile ridondante (20/09/2026)** — le barre azioni appena create
  provocavano un secondo giro dell'observer; ora si ignorano solo quelle inserzioni
  e si escludono righe/tabelle già adattate. Batch misti e modifiche esterne restano osservati.
  Gli eventi del visual viewport si accorpano per fotogramma e non riscrivono la stessa
  geometria; la rotazione desktop pulisce subito lo stato. Prove: `tests/mobile/ui.mjs`.
- **Chiusura review mobile (20/09/2026)** — Radar e le finestre senza `.modal-body`
  scorrono come pannello intero: con la tastiera il comando finale non viene tagliato.
  Magic Sign conserva il proprio corpo dedicato. Il validatore rispetta i vincoli
  numerici già dichiarati dai form. Regressioni: `tests/mobile/ui.mjs`.
- **OGGI — la coda delle decisioni** (`js/oggi-engine.js` → `window.BOOM_OGGI`
  + `oggiPage()` nel portal, 2026-08-19): la prima schermata dell'admin. La
  macchina lavora da sola e all'operatore restano le DECISIONI — che su
  Telegram scorrono via. Qui persistono: risposte AI da approvare
  (`action_queue`), visite da confermare, ritardi (quadro + 3 peggiori per
  nome con sollecito/link carta/segna-pagata), lead nuovi col grade del
  Brain, manutenzioni urgenti, firme a metà, rinnovi ≤30gg — ordinati per
  COSTO DEL RITARDO (punteggio per specie + età con tetto), con le azioni
  DENTRO la riga. Motore puro (niente Firestore/Date.now, si testa in
  node); le azioni sono `{fn, args}` alla maniera del Prontuario e
  `oggiRun` invoca per RIFERIMENTO — il test pretende che ogni fn esista.
  In testa il polso dei soldi (incassato mese / in arrivo / in ritardo /
  prossimi 7gg). "Nascondi" rinvia a domani (localStorage per-giorno).
  Landing: admin senza hash atterra su `oggi` (deep link vince); la
  Dashboard resta come "Studio". Tab mobile: ⚡ Oggi prima. Senza motore
  caricato la pagina ricade sulla dashboard — mai una schermata vuota.
  Test: `node tests/oggi/run.mjs` (41 check).
- **D2 — i form grandi coi capitoli su desktop** (`sectionizeForm` in
  portal-desktop.js): su telefono i modali piatti diventano wizard (M2);
  su desktop erano muri da 15-22 campi. Pattern console corporate: header
  di capitolo (micro-maiuscole oro, `.pd-form-sec`) tra i gruppi, tutto
  visibile. La mappa è LA STESSA di M2 (`window.BOOM_MOBILE.WIZ` — una
  copia sola); si INSERISCONO header, mai si spostano campi (FormData
  intatta per costruzione); sotto i 920px il CSS li spegne. Form <8 gruppi
  esclusi.
- **La Rifinitura** (`css/portal-finish.css` + composizioni in portal-app.js,
  2026-08-19): il passo di DESIGN sulle superfici interne. Il sistema
  (portal.css) era sano ma le composizioni urlavano: nella riga contratto
  fino a 7 badge a tinta piena + 3 chip con 3 sfondi + emoji nei dati. Ora:
  UNO stato a tinta piena, i segnali secondari nel grappolo quieto
  `.li-flags` (puntino semantico + micro-maiuscole in anello), metadati
  senza emoji (`.li-meta`), le rate in UN metro (`.li-meter`, rosso solo
  col ritardo), canone in cifre tabellari (`.li-money`). Le 5 strisce
  statistiche ad-hoc (contratti/utenti/pagamenti/manutenzione/documenti
  tenant) sono diventate `.stat-card` del sistema; i bottoni-filtro delle
  5 famiglie (`contract/payment/user/maintenance/rules-filter`) sono chip
  (velo oro da attivi — prima il filtro attivo era vestito da azione
  primaria). Regole dure: SOLO token esistenti (mai un colore nuovo), SOLO
  selettori emessi davvero, niente !important, condizioni/handler/data-attr
  della riga IDENTICI (filterContracts e M2 la leggono). Carica dopo
  portal.css e PRIMA dei layer (strutturale batte visivo). Kill switch
  `?nofinish=1`. Test: `node tests/finish/run.mjs` (59 check).
- **D1 "BOOM OS"** (`css/portal-desktop.css` + `js/portal-desktop.js`,
  studio in `STUDIO_BOOM_OS.md`): la faccia DESKTOP del protocollo "un
  motore, due facce" — attiva SOLO sopra i 920px (la STESSA query di M2,
  negata: mai zone doppie), tutto dietro `body.pd-on`. **Command Palette
  ⌘K/Ctrl+K**: sezioni+console dalla sidebar VERA (badge compresi), azioni
  Crea (proxy di openModal, admin-gated) e ricerca entità SOLLEVATA da
  `handleSearch` (si invoca il motore esistente e si adottano le righe di
  #searchResults con la loro onclick — mai un secondo indice). **Tastiera**:
  `g`+lettera naviga, `n`+lettera crea, `/` ricerca, `?` foglio dei tasti —
  mai attiva dentro un input o sopra un modale. **Peek drawer**: le schede
  di sola lettura `lg/xl` (fascicolo contratto, notifiche) arrivano come
  pannello destro; i FORM restano finestre. Rifinitura sobria (header
  vetro, filo d'oro sulla voce attiva, focus-visible, scrollbar). Kill
  switch dedicato `?deskclassic=1` / `?deskapp=1`. Test: `node
  tests/desktop/run.mjs` (48 check: comandi pinnati su portal-app.js,
  query 920 condivisa, motore mai copiato) + `node tests/desktop/ui.mjs`
  (18 check in Chromium a 1440px, col confine dei 920 attraversato nei due
  sensi).
- **Dieta del boot** (portal-app): tetti su TUTTE le query nude (limit
  larghi, MAI orderBy+limit — un orderBy su campo assente nasconderebbe i
  doc legacy), i 7 step lazy in parallelo, rate scadute flippate SOLO in
  memoria (prima: N scritture Firestore a ogni apertura), listener
  contracts admin-only + limit, cache `boom_data_cache` estesa a tutto lo
  stato (badge giusti al boot da cache) con stringify in idle, Chart.js
  caricato solo sulla dashboard.
- **Navigabile**: gruppo "Console" in sidebar (La Squadra, Banca, PFS
  Command, Photo Lab, Manuale Casa, Salute) + Regole & Automazioni in nav.
- **Sicurezza**: `/api/generate-pass` è operator-only (X-Firebase-Token
  admin/owner/landlord o X-Homie-Secret — firmava .pkpass di produzione da
  anonimo; pass-delivery legacy mostra "link expired" invece di 401 nudo);
  `settings/company` (IBAN) escluso dalla lettura pubblica nelle rules;
  `canone-bot` con rate limit + cap sui messaggi; `notify-viewing-created`
  con honeypot + rate limit.
- **CI `deploy-rules`**: push su main → `firebase deploy --only
  firestore:rules,storage`. Nato dal drift che teneva `propertyLocks`
  spento in produzione; risponde anche a Run workflow (workflow_dispatch,
  solo main). **La credenziale è la SERVICE ACCOUNT** (secret
  `FIREBASE_SERVICE_ACCOUNT` = JSON della chiave, montato via
  `GOOGLE_APPLICATION_CREDENTIALS`): i token `login:ci` sono refresh token
  che Google revoca da solo — TRE morti in due settimane (20/08, 31/08,
  05/09), ogni volta con le regole del repo ferme fuori produzione, e il
  31/08 il job diceva pure verde (il `| tee` senza pipefail). La chiave si
  genera da Firebase console → ⚙ Impostazioni progetto → Account di
  servizio → "Genera nuova chiave privata". `FIREBASE_TOKEN` resta come
  ripiego dichiarato (warning in job) finché la chiave non c'è; senza
  nessuna credenziale il job avvisa e salta.
  **22/09/2026 — la chiave non si può generare.** Firebase console: «La
  creazione di chiavi non è consentita per questo service account»: è la
  policy dell'organizzazione Google (`iam.disableServiceAccountKeyCreation`,
  accesa di default sulle org Workspace), e ha ragione — una chiave JSON è
  una password perenne. La credenziale è ora la **federazione** (Workload
  Identity Federation): sul progetto un pool `github` con provider OIDC
  `github` (issuer `token.actions.githubusercontent.com`, mappature
  `google.subject=assertion.sub` e `attribute.repository=assertion.repository`,
  condizione `assertion.repository == "valentino11marzo-pixel/Boum-roma"`),
  «Concedi accesso» verso `firebase-adminsdk-fbsvc@…` col filtro
  `repository`, ruolo Firebase Admin sull'account. Nel job il passo
  `google-github-actions/auth@v2` (provider e account scritti in chiaro:
  non sono segreti, senza il token firmato da GitHub non aprono niente)
  lascia la credenziale di un'ora in `GOOGLE_APPLICATION_CREDENTIALS` e
  il deploy la riconosce (`CRED_KIND=wif`); serve `permissions:
  id-token: write` sul job. Le due vecchie vie restano come ripiego
  dichiarato. L'avvio manuale da un ramo deploya le rules SOLO con la
  spunta `deploy_rules_from_branch`: la produzione Vercel girava sul ramo
  Codex (PR #252, avanti di 8 commit su main) e un merge su main l'avrebbe
  sovrascritta — la spunta è l'uscita, e un ramo vecchio dispatchato per
  sbaglio non può regredire le regole in produzione. La GitHub App di
  Claude non può avviare workflow (403 `Resource not accessible by
  integration`): «Run workflow» lo preme l'operatore, i log li legge
  Claude. **Il primo run federato era verde senza federazione** (letto nel
  log del job, non dedotto): `google-github-actions/auth` senza
  `token_format` scrive solo il file di configurazione e riesce SEMPRE —
  nessuno scambio con Google — e il CLI **preferisce la variabile
  `FIREBASE_TOKEN`** a `GOOGLE_APPLICATION_CREDENTIALS`: il job diceva
  `wif`, il log diceva «Authenticating with FIREBASE_TOKEN is deprecated»,
  e le regole sono uscite col token deprecato (valido quel giorno). Un
  verde che non prova la credenziale è il difetto di classe del 31/08 in
  altra forma. Ora: `token_format: access_token` sul passo federato (lo
  scambio OIDC → STS → impersonazione si fa LÌ, e un pool/provider/«Concedi
  accesso» sbagliato fallisce con l'errore di Google), `unset
  FIREBASE_TOKEN FIREBASE_SERVICE_ACCOUNT` prima del CLI quando la
  federazione c'è, e la seconda prova sul log (avviso del token con
  `CRED_KIND=wif` = errore). I rami service-account/token restano SOLO per
  un job senza il passo federato; una volta verde con la federazione, il
  secret `FIREBASE_TOKEN` va tolto dal repo. **Il secondo e il terzo run
  federato: 403 `iam.serviceAccounts.getAccessToken denied`** — lo scambio
  col pool PASSA (pool, provider, condizione giusti), a mancare è il legame
  sull'account di servizio: nella scheda Autorizzazioni di
  `firebase-adminsdk-fbsvc@…` («Entità con accesso» era VUOTA) serve il
  ruolo **Utente Workload Identity** per l'entità con cui il job si
  presenta. Quella stringa ora si LEGGE nel log, non si scrive a mano: il
  passo «Carta d'identità del job» chiede a GitHub il token OIDC con la
  stessa audience e stampa i soli claim (`sub`, `repository`, `ref`) e le
  due entità che ne derivano — `…/attribute.repository/<repo>` (esige la
  mappatura `attribute.repository` sul provider) e `…/workloadIdentityPools/
  github/*` (tutto il pool: sicuro perché il provider filtra già il repo
  con la condizione). Il token non si stampa mai. Test:
  `tests/finalize/run.mjs` (37 check).
  **Il quarto run federato (23/09/2026, CI #483) è verde CON la
  federazione**, letto nel log: la carta d'identità stampa `sub =
  repo:valentino11marzo-pixel/Boum-roma:ref:refs/heads/<ramo>` e
  `repository = valentino11marzo-pixel/Boum-roma`; il passo federato con
  `token_format: access_token` passa; il deploy dice «credenziale:
  federazione», NESSUN avviso del token, «Deploy complete!». Il legame che
  ha sbloccato tutto è `…/workloadIdentityPools/github/*` col ruolo Utente
  Workload Identity, dato dalla scheda **«Entità con accesso» → «Concedi
  l'accesso»** dell'account (NON «Autorizzazioni → Gestisci accesso», che
  cambia i ruoli dell'account SUL PROGETTO, non chi può impersonarlo). Le
  due righe `…/attribute.repository/…Boum-roma` presenti dalla sera prima
  non hanno mai combaciato (con quelle sole: 403 nei run 477/478) — più
  strette di `*`, innocue, si possono togliere. Con `*` qualunque workflow
  di QUESTO repo può impersonare l'account (il provider filtra il repo);
  per stringere a `main` si userà `attribute.ref`, dopo aver verificato la
  mappatura sul provider — che è ciò che quelle due righe non hanno mai
  provato. Lo stesso giorno alle 17:25 UTC il token `login:ci` è morto per
  la QUARTA volta (push su main, «Your credentials are no longer valid»;
  regole invariate, verificato per diff): il secret `FIREBASE_TOKEN` va
  tolto dal repo — il ramo token del job resta come ripiego dichiarato per
  un job senza il passo federato. Su `main` la federazione entra col merge
  del ramo che la porta (PR #253).
- **Tabella zone canone UNICA**: `scheda-canone.html` ora carica
  `js/canone-engine.js` e semina le zone dal motore (la copia inline che
  poteva divergere dal Fascicolo ARPE è stata rimossa; un edit manuale
  marca `zoneSrc='manual'` e da lì la copia salvata vince).

### Dati aziendali (IBAN) fuori dal codice — `settings/company`
`COMPANY` in `portal-app.js` carried `iban: 'IT00X0000000000000000000000'` with
a never-actioned "⚠️ UPDATE WITH REAL IBAN" comment — and that placeholder was
printed in the **late-payment reminder** sent to tenants and in the generated
**invoice PDF**. Company data now lives in Firestore `settings/company`
(admin-write per the existing rules), is merged over the code defaults at boot
by `BOOM_DATAOPS.mergeCompany()` (field whitelist, values cleaned, empty never
overwrites a good default) and is edited from **Impostazioni → Dati aziendali**
— no deploy to change bank, PEC or address. `isPlaceholderIban()` treats
empty / old placeholder / mod-97 failure alike: while it holds, the reminder
**omits** the IBAN and the invoice prints "IBAN: da comunicare" (a wrong IBAN
is worse than none — the payer tries and the transfer never arrives), the
console shows a red card, and admins get a toast at boot. Saving re-validates
the IBAN before writing. `loadCompanySettings()` is fire-and-forget off the
boot path (Safari-audit rule: nothing awaited on boot).

### Fascicolo operativo immobile — 20 settembre 2026
La scheda admin passa dal modale al percorso `#property/<id>/<sezione>`: situazione, contratti, canoni, documenti e attività; link ricaricabili, ritorno alla ricerca/posizione e apertura dei flussi esistenti; ricerca e filtro di disponibilità ora si combinano. Le viste dei proprietari restano separate.
`property-dossier-engine.js` deriva il fascicolo dai record caricati, riusa BOOM_RENT e non scrive uno stato parallelo. ID diretti prevalgono sui contratti legacy; conflitti e dati mancanti restano espliciti, nessun abbinamento per nome o persona.
`property-dossier.js` e CSS dedicato rendono tutti i contratti attivi, documenti con URL sicuri e cronologia di soli eventi datati/provati. Core e attività lazy hanno stati di lettura separati: un errore conserva attività/scadenze precedenti con avviso persistente, senza aggiornare la data della lettura riuscita; il limite di 800 attività resta esplicito.
La modifica delle attività preserva lo stato remoto (anche una chiusura concorrente): `saveTask` invia lo stato solo alla creazione, con prova `propertytaskedit` e mutazione.
Nessuna lettura massiva aggiuntiva, invio, incasso o chiamata AI all’apertura. Le azioni riusano le autorizzazioni/conferme esistenti. Boot, precedenza Innesto e router hash generale restano invariati.
Da Oggi, «Apri immobile» usa solo un riferimento `properties/<id>` confermato, presente e coerente con la pratica; ricontrolla ruolo e ID al click. Il ritorno attende la lettura dei seguiti e ripristina dettagli, posizione e focus del caso ancora presente, senza ripristinare casi chiusi. Il contesto di navigazione vive solo in memoria.
Prove: `propertymodel` (mutazioni), `propertyload`, `propertyrender`, `propertyui`, `propertyoggitarget` e `propertyoggiui` (1440/390/320px, navigazione e dettagli reali, soli dati sintetici). `sw.js` v25 invalida gli asset precedenti.
La conferma di eliminazione protegge anche l’ultimo passaggio: nome reso come testo, tipo e ID passati con `jsq` al comando finale, compresi apici e caratteri speciali.
`escape` mantiene il minimo di 13 siti: compila tutti gli inline attuali e conta la delega immobile solo dopo aver eseguito il percorso completo fino alla conferma; mutazioni coprono dati HTML e comando finale.
`mandato` verifica Valutazione nel browser dal fascicolo al modulo reale e all’API con Firestore/Storage simulati: immobile esatto senza contratto, annullamento senza generazione e mutazioni di destinazione/handler.

## Portals (logged-in surfaces)

Three role-scoped SPAs sit on top of the same Firestore project. All three
load `/js/boom-portal.js` for shared utilities (auth, realtime, toast,
loader, confirm dialog) — see `BoomPortal.*` API.

| Portal | Role(s) accepted | Collections read/written |
|---|---|---|
| `owner-dashboard.html` | `owner`, `landlord`, `admin` | reads/writes `properties` filtered by `ownerId` |
| `tenant.html` | `tenant` | reads `properties` (own), writes `maintenance` |
| `client-portal.html` | access code on `pfsClients` doc | reads/writes `pfsClients.portalProperties` |

**Single auth surface**: `/login` (login.html) is the ONLY sign-in UI on the
site. portal.html, boom_doc_parser.html and the `BoomPortal.requireAuth` guard
all redirect unauthenticated users to `/login?next=<requested page>` and the
login page returns them there after sign-in. Never add a new inline login
form — redirect to `/login` with a `next` param instead. The login page also
pre-warms the portal.html shell via the service worker while the user types,
so the post-login load is instant. `sw.js` must NOT precache portal.html at
install time (the public site registers the same SW).

Auth gate pattern (use this for any new portal page):

```js
const { user, profile } = await BoomPortal.requireAuth(
  ['owner', 'landlord', 'admin'],   // allowed roles, or null to skip
  { loginUrl: '/login' }            // base only — never bake a ?next= in
);
```

**Safari desktop hardening** (a wedged WebKit used to leave the logged-in
pages on their loader with no signal at all):
- `js/firebase-config.js` — the 12 pages that load it used to call
  `enablePersistence({synchronizeTabs:true})` **synchronously on the boot
  path**. On WebKit that IndexedDB + WebLocks handshake stalls for seconds
  and the auth guard's first read looks hung. Now deferred to an idle
  callback, skipped on iOS, no `synchronizeTabs` on Safari, escape hatch
  `?nopersist=1` / `localStorage.boom_no_persist='1'` — the same treatment
  `js/portal-app.js` already applied to portal.html.
- `BoomPortal.withTimeout(promise, ms)` — a Firestore read that never
  settles is a loader that never leaves. `requireAuth` reads the profile
  under a 7s watchdog, retries `{source:'server'}`, then gives up loudly.
- `BoomPortal.showRecovery()` / `hardReset(signOut)` — instead of an
  eternal spinner: a branded panel with the two moves that actually fix a
  wedged browser (wipe SW caches + registrations + Firestore IndexedDB and
  reload with `?fresh=`, or sign out clean). Query params are preserved.
- `requireAuth` normalizes `loginUrl` (strips `.html` — `cleanUrls` makes
  it a 308 hop — and any pre-baked `?next=`, which used to duplicate the
  param and, on `wrong_role`, bounce straight back to the denied page in a
  loop) and tags the bounce with `?b=1`. `login.html` counts those: twice
  in a minute means the browser is not keeping the session (private mode /
  cookies blocked) and it says so instead of looping forever.
- Realtime lists carry a fallback: a Firestore `onSnapshot` whose channel
  never opens calls **neither** `onData` nor `onError`. `watchPAs()` in
  the console falls back to a one-shot `.get()` after 6s and renders a
  visible error with a recovery button instead of an empty page.
- `BoomPortal.registerServiceWorker()` calls `reg.update()` — Safari does
  not re-check `sw.js` as eagerly as Chrome, so a stale worker could serve
  an old shell for days. Cache version is `boom-v17`. portal.html's inline
  registration does the same.
- `vercel.json` now sends `private, no-store` + `noindex` on every
  logged-in surface (`casa`, `tenant`, `manuale`, `pre-agreement-admin`,
  `pfs-command`, `photo-lab`, `salute`, …), not just the portal group.
- `-webkit-backdrop-filter` is mandatory alongside every `backdrop-filter`
  (older WebKit ignores the unprefixed form and the frosted bars go flat).
- Google-Fonts stylesheets on logged-in pages load **async**
  (`media="print" onload` + `<noscript>` fallback): a synchronous
  stylesheet to fonts.googleapis.com blocks Safari's first paint — the
  spinner included — for the whole cold-connection round trip.
- `sw.js` portal shell fetch is network-first **with a 6s cap**: on a
  wedged Safari connection the fetch used to hang for minutes; now the
  cached copy (from a previous visit or the /login pre-warm) takes over
  while the network response still refreshes the cache in background.
- **PWA, primo ingresso senza cache (21/09):** il ramo dedicato a `/portal`
  e `/portal.html` non passava il limite duro della navigazione: senza una
  copia e con rete appesa restava in attesa. Ora le sole navigazioni HTML
  ricevono la pagina Riprova dopo 20s; restano il fallback in cache a 6s e
  l'aggiornamento della copia quando arriva la rete. Nessun HTML sostitutivo
  per JS/CSS o pre-warm; API escluse. `tests/rete/run.mjs` guida anche il
  fetch handler intero, con timer/rete sintetici e regressione sul ramo.
- Login → portal handoff: login.html uses the same Firebase SDK 10.7.0 as
  the portal (HTTP-cache reuse), lands on `/portal` (never `/portal.html`,
  whose cleanUrls 308 also made the SW refuse to cache the pre-warm), and
  the boot never awaits writes (`lastLogin` is fire-and-forget — an
  awaited write on a stalled WebChannel used to hang the whole boot).
- Portal boot is stale-while-revalidate: a same-user `boom_data_cache`
  snapshot up to 24h old renders instantly while `loadDataFresh(true)`
  re-syncs in background (admin core reads run in ONE concurrent batch —
  the old sequential "batch 1/2/3" + 100ms Safari pauses are gone). The
  25s hard watchdog now enters the app shell when user+profile are
  already in hand instead of bouncing an authenticated user to login.

- **Home non avvia campagne (18/09):** `setupApp` non pianifica più notifiche
  delle scadenze né richieste recensione/referral. Aprire una pagina non è
  un consenso a inviare o modificare record operativi; listener e navigazione restano.
  Le funzioni esplicite restano disponibili all'admin; i solleciti rispettano
  `BOOM_RENT.canPay`, quindi escludono segnalati e pagamenti in corso.
  `lastLogin` resta telemetria separata. Test `portalpassiveboot`: funzioni reali,
  apertura ripetuta, azioni esplicite e quattro mutazioni; nessun invio reale.

- **La scialuppa scattava sull'indizio sbagliato** (lo spinner infinito che
  l'operatore vedeva su Safari, agosto 2026). La via d'uscita a 15s di
  portal.html usciva subito se `window.__portalAppLoaded` era vero — ma quella
  sentinella è la **RIGA 1** di `portal-app.js`: si accende appena il file è
  parsato, prima che il boot faccia alcunché. Il watchdog interno dell'app
  nasce ~2.300 righe più in là, quindi QUALUNQUE eccezione in mezzo spegneva
  l'unica scialuppa armata e non ne creava nessun'altra: spinner per sempre,
  senza uscita. Che su WebKit quelle eccezioni esistano non è teoria — i log
  di `/api/log` ne portano due dai dispositivi dell'operatore
  (`Can't find variable: Notification`, e un rejection IndexedDB
  *"Attempt to get records from database without an in-progress transaction"*).
  Ora il watchdog scatta sul **SINTOMO** (il loader è ancora acceso), mai su un
  indizio: 15s se l'app non ha ancora armato la sua rete
  (`window.__portalBootArmed`, stampata subito dopo il watchdog dei 25s), 30s
  comunque, e un `window.onerror` mentre la rete non è armata accorcia
  l'attesa a 2,5s. Corretti insieme i difetti che ci arrivavano dentro:
  `Notification` letta senza guard (iOS non la espone fuori dalle PWA
  installate), `localStorage` non protetto in `startFirestorePersistence`
  (Safari privato LANCIA invece di restituire vuoto — `firebase-config.js` lo
  avvolgeva già, `portal-app.js` no) e `loadChartJS` che rigettava l'Event
  grezzo senza `.catch()` sul chiamante della dashboard: una CDN lenta
  produceva un rejection non gestito durante il boot, che in telemetria si
  legge `Event` e non dice nulla.
- **`/login`**: `signInWithEmailAndPassword` era atteso senza tetto — su WebKit
  incastrato il bottone girava all'infinito, senza messaggio. Ora c'è un limite
  di 20s con un messaggio che indica la via d'uscita; è sicuro perché
  `onAuthStateChanged` redirige comunque se il login arriva in ritardo. Stesso
  trattamento alle due letture Firestore di `boom_doc_parser.html` (il `catch`
  copriva il rifiuto, non il silenzio).

Regression suite: `node tests/safari/boot.mjs` — fakes Firebase and asserts
that a hung profile read, a mute realtime channel and a normal boot all end
in a usable page, never a spinner. Needs `playwright-core`
(`BOOM_PLAYWRIGHT=/path/to/index.js` if it lives outside the project).
**Copre anche portal.html** — la superficie più grande e l'unica con un boot
proprio invece di `BoomPortal.requireAuth`, che restava fuori mentre la suite
dichiarava "nessuna superficie autenticata resta appesa": verde e cieca sulla
pagina che si piantava davvero. Il caso *"lo script muore dopo la riga 1"*
riproduce lo spinner infinito e pretende la card di uscita.

**Nota**: `owner-dashboard.html` è oggi una pagina STATICA — non carica
Firebase né autentica nessuno, malgrado la tabella dei portali qui sopra lo
descriva come SPA Firestore filtrata per `ownerId`.

**Deal Link** (`/portal#deal=<base64url JSON>`): semina il wizard
"🚀 Nuovo cliente → contratto firmato" con un deal completo — `{tenant,
conviventi[], propertyMatch, landlordName, contract:{type, rent, startDate,
endDate, depositMonths, paymentDay, cohabitants, otherClauses,
transitionalReason, notes, tenantNationality}}`. Il payload viaggia nel
FRAMMENTO (mai al server/log), sopravvive al giro di login via
sessionStorage, ed è solo un PREFILL: nessuna scrittura finché l'admin non
preme 🚀 nel riepilogo. Il wizard ora è idempotente (riusa cliente per
email/CF e contratto per inquilino+immobile+decorrenza), crea le schede
cliente dei conviventi, tira l'anagrafica locatore da `landlords`, genera
scadenze + PDF come saveContract e manda l'invito firma via
`/api/sign/send-link` (sequenziale: il locatore riceve il suo link alla
firma dell'inquilino — prima spediva entrambi i link subito, fuori dal
design system).

**Behavior Intelligence** (`/behavior`, ottobre 2026): `js/boom-track.js` misura
in forma anonima percorsi, sezioni, profondità, CTA e uscite su ogni URL della
sitemap, esclusivamente dopo il consenso. `/api/analytics/collect` valida e
salva `webJourneys` per 90 giorni; il cron cleanup li elimina. La dashboard e
`/api/analytics/summary` sono solo admin e mostrano aggregati, mai dati grezzi.
Regression suite: `npm test -- behavior`.

Firestore listeners with auto-retry / exponential backoff:

```js
const unsub = BoomPortal.listen(
  db.collection('properties').where('ownerId', '==', user.uid),
  (snap) => { /* render */ },
  (err) => { /* optional error handler */ }
);
```
