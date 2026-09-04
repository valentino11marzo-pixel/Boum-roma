# BOOM · Audit SEO & Conversione organica — dove intervenire (file per file)

**Obiettivo:** far sì che BOOM converta **organicamente**, senza Google Ads.
Questo rapporto nasce da un audit reale di 47 pagine indicizzabili (titoli,
description, H1, canonical, structured data, profondità contenuti, link interni,
hreflang, strutture di conversione). Le voci sono ordinate per **impatto ×
sforzo**, con i file precisi su cui agire.

---

## 🔴 P0 — Bloccanti ad alto impatto / basso sforzo (questa settimana)

### 1. Blog = isole isolate (la perdita organica più grave)
**Evidenza:** i 7 `blog-*.html` hanno **0 nav, 0 footer, ~4 link interni** e
nessun percorso di conversione coerente. Chi arriva da Google su un articolo
non ha menu, non passa link-equity alle pagine commerciali, non trova una CTA.
**Azione:** ricostruire i blog sul design system condiviso (nav + footer +
reading bar + CTA + sezione "articoli correlati" + link a `/apartments` e ai
servizi). Risultato: ~40+ link interni/pagina, equity verso le money pages,
conversione del traffico informazionale.
**File:** `blog-scam-bible, blog-cost-calculator, blog-47-steps,
blog-neighborhood-guide, blog-tenant-rights, blog-contract-types, blog-visa-residency`.

### 2. `how-it-works.html` → 0 structured data
**Evidenza:** pagina chiave, **nessun JSON-LD**.
**Azione:** aggiungere `Organization` + `Service` + `HowTo` (i 7 step) + `FAQPage`.
Abilita rich result "passi" e citazioni AI.

### 3. `partners.html` → manca l'H1 + schema povero
**Evidenza:** **NO H1** (solo `h2.section-title`), solo `Organization`+`Breadcrumb`.
**Azione:** trasformare il titolo hero in `<h1>`; aggiungere `Service` + `FAQPage`.

### 4. Titoli SERP troppo lunghi (>62 char → troncati)
**Evidenza:** `partners 76, blog-contract-types 75, blog-visa-residency 74,
concierge 73, ostiense 70, san-lorenzo 70, blog-47-steps 70, research 69,
deal-assistance 68, blog-cost-calculator 67, property-finding 66, testaccio 66,
trastevere 66, esquilino 65, neighborhood-guide 64, index 63`.
**Azione:** riscrivere a **≤60 char**, keyword in testa (es. "Affitti Roma per
expat — mid-term verificati | BOOM").

### 5. Meta description troppo lunghe (>165 → troncate)
**Evidenza:** `research 282, corporate 245, universities 226, partners 216,
how-it-works 195, apartments-in/index 193, property-finding 178, index 178,
virtual-viewing 170, san-lorenzo 169, apartments 168`.
**Azione:** 150–160 char, con beneficio + verbo d'azione ("…Prenota una visita
video in 24h.").

### 6. FAQPage schema mancante su pagine ad alta intenzione
**Evidenza FAQ assente:** `apartments, apartment-detail, how-it-works, about,
concierge, owners` + tutti i blog.
**Azione:** aggiungere `FAQPage` (3–6 Q&A reali). È il modo più rapido per
ottenere rich result e farsi citare da Google AI / ChatGPT.

---

## 🟠 P1 — Alto impatto / sforzo medio (settimane 2–3)

### 7. Contenuti blog troppo sottili per posizionarsi
**Evidenza (parole):** `scam-bible 313, cost-calculator 335, 47-steps 337,
neighborhood-guide 391, tenant-rights 422`. Sotto la soglia per query competitive.
(Buoni: `contract-types 1688, visa-residency 2102`.)
**Azione:** espandere a **1.000–1.500 parole** con sottotitoli H2/H3, FAQ,
esempi, link interni. Sono i contenuti che intercettano le ricerche "come
affittare a Roma", "truffe affitti Roma", "codice fiscale per affitto".

### 8. Strutture di conversione sulle pagine d'ingresso organico
**Evidenza:** le 11 `apartments-in/*` (ottime per SEO, 800+ parole, FAQ) e i blog
**non hanno un form**: solo WhatsApp.
**Azione:** aggiungere un blocco di conversione coerente (mini-form "Trova casa
in [zona]" + CTA + WhatsApp con prefill) a fondo di ogni pagina-zona e articolo.
Così il traffico organico diventa lead tracciati (`generate_lead`).

### 9. Internal linking / topic cluster
**Azione:** collegare blog → pagine servizio → `/apartments`; pagine-zona ↔
`/apartments?zona=…`; ogni articolo a 3 correlati. Distribuisce equity e guida
alla conversione. (Oggi i blog sono scollegati, vedi #1.)

### 10. Prova sociale (recensioni) vicino alle CTA, ovunque
**Evidenza:** social proof presente solo su `apartment-detail`.
**Azione:** badge rating Google 4.9 + 1–2 testimonianze reali vicino alle CTA di
`apartments`, pagine-servizio, pagine-partner, home. **Serve il link `g.page/r/.../review`**
(in sospeso) per chiudere il flywheel recensioni (`docs/reviews.md`).

---

## 🟡 P2 — Compounding / internazionale (settimane 3–6)

### 11. Internazionalizzazione EN/IT (hreflang assente)
**Evidenza:** `hreflang` di fatto assente (solo `owners.html`); `lang` misto
(en/it). Il pubblico è bilingue ma Google non sa quale versione servire.
**Azione:** dichiarare `lang` corretto, aggiungere `hreflang en / it / x-default`,
e creare **landing IT** per le query italiane ad alto volume:
`affitto roma stranieri, stanze studenti roma, affitti brevi roma, casa roma expat`.

### 12. Nuove landing money-intent (SEO programmatico)
**Azione:** pagine dedicate per le ricerche reali oggi non coperte da una pagina
ottimizzata:
- `/mid-term-rentals-rome`, `/monthly-rentals-rome`, `/furnished-apartments-rome`
- `/rent-in-rome-without-scams` (anti-truffa = il tuo posizionamento unico)
- guide pilastro: "Renting in Rome — complete guide", "Codice fiscale guide".

### 13. Pagine-zona × pubblico (programmatico)
**Azione:** combinare le 11 zone con i segmenti: "student housing in Trastevere",
"[zona] for expats" — alto volume long-tail, bassa concorrenza in inglese.

---

## ⚪ P3 — Igiene tecnica

### 14. Stub sottili indicizzabili
**Evidenza:** `deals.html` (7 parole, no H1), `book/booking` (no H1).
**Azione:** `noindex` finché non hanno contenuto, oppure costruirle. Pagine vuote
indicizzate abbassano la qualità percepita del dominio.

### 15. Già a posto (confermato)
Sitemap completa + sitemap dinamica annunci, robots con policy crawler AI,
`llms.txt`, GBP in `sameAs`, JSON-LD valido sulle pagine principali, preconnect
LCP, lazy/decoding immagini, OG/Twitter ovunque.

---

## Roadmap d'esecuzione consigliata

| Fase | Cosa | Perché |
|---|---|---|
| **P0** | Titoli/description, schema how-it-works, H1+schema partners, FAQPage su 6 pagine | Massima resa SERP/AEO, poche ore |
| **P1** | Ricostruzione blog sul design system + espansione contenuti + blocco conversione su zone/blog + social proof | Trasforma il traffico organico in lead |
| **P2** | hreflang + landing IT + nuove money pages + topic cluster | Crescita organica composta |
| **P3** | noindex stub, pagine programmatiche zona×pubblico | Igiene + coda lunga |

**Nota:** P0 + P1 da soli rendono il sito "auto-convertente" dall'organico —
P0 porta clic, P1 li converte. Gli Ads diventano un acceleratore opzionale,
non una necessità.

---

## Esecuzione 2026-08-27 — la passata "masterpiece" (e le guardie che la fissano)

Un giro solo, tutto verificabile con `node tests/seo/run.mjs` (in `npm test`
come suite `seo`). Cosa è stato TROVATO oltre all'audit sopra, e cosa è
stato fatto:

1. **Il registro era andato alla deriva** — `scripts/seo-config.js` conosceva
   ~40 pagine mentre il sito ne serviva 60: rigenerare la sitemap avrebbe
   CANCELLATO canone, services, executive, reunion, le guide moving-to-rome
   e welcome-to-rome. Ora ogni pagina indicizzabile è registrata (le teste
   curate a mano portano `metaManaged:false` e `seo-update.js` NON le tocca:
   la sentinella `BOOM_SEO` è il consenso, senza si salta — `--adopt` per la
   prima iniezione). Il test rende meccanico il futuro: pagina nuova senza
   voce = suite rossa.
2. **La sitemap è tornata una proiezione** (`scripts/seo-sitemap.js`):
   lastmod dall'ultimo commit git (mai "oggi" finto), hreflang dichiarate
   per reunion (fr/en) ed executive (en/it), /booking TOLTA (era in sitemap
   E bloccata da robots.txt — la contraddizione che Search Console segnala),
   /welcome-to-rome e /apartments-in/ponte-milvio DENTRO (mancavano), gli
   annunci /listing/* lasciati alla sitemap dinamica.
3. **FAQ: lo schema segue lo schermo, su TUTTO il sito.** 20 pagine
   dichiaravano nel FAQPage domande che la pagina non mostrava (la frase
   dello schema divergeva dal testo visibile). Nuovo strumento
   `scripts/seo-faq-sync.mjs`: estrae le FAQ VISIBILI (i 3 pattern del
   sito) e riscrive il blocco perché le rispecchi parola per parola; mai
   inventa un blocco su una pagina senza FAQ. faq.html aveva DUE blocchi
   FAQPage divergenti → uno solo, con le 38 domande vere. Su services,
   about, partners e owners le domande (buone) sono state PORTATE in pagina.
4. **Igiene dell'indice**: le copie `*-classic`, `header.html` e
   `.journey-preview.html` (title duplicati, zero link entranti) sono fuori
   dal deploy via `.vercelignore`; deals e booking (gusci sottili) sono
   `noindex` e fuori sitemap; portal/boom_doc_parser/seed-listings hanno il
   meta noindex di cintura.
5. **Teste completate**: skyline (canonical+OG+JSON-LD+H1), board e
   property-finding (erano SENZA doctype/html/head — quirks mode — e senza
   charset), welcome-to-rome (Article+Breadcrumb, era il "viral asset" senza
   structured data), how-it-works (HowTo sui 6 passi VISIBILI), book (H1).
   Titoli >65 e description fuori 50–168 rientrati ovunque.
6. **llms.txt**: sezione Guide coi 7 articoli del blog e il Welcome to Rome
   Kit (prima invisibili ai motori di risposta); il test verifica che ogni
   link boomrome.com risolva a una rotta VERA del repo.

**Restano aperti** (P1/P2 dell'audit sopra): blocco di conversione su
pagine-zona, landing IT (`affitto roma stranieri`…), altre money pages
(`/mid-term-rentals-rome`, `/furnished-apartments-rome`), zone × pubblico.

---

## Esecuzione 2026-08-28 — la fase contenuti (P1 #7 + P2 #12, primo colpo)

1. **I blog "sottili" non erano sottili: erano INVISIBILI.** Il contenuto
   vero viveva in array JS renderizzati client-side — 7 truffe complete,
   tutti i 47 passi, 15 risposte legali con gli articoli del Codice, 12
   schede quartiere. Un crawler senza JS (e i motori di risposta) leggeva
   ~300 parole. `scripts/blog-ssg.mjs` proietta GLI STESSI dati in un
   blocco statico (regione `BOOM_SSG`); il JS lo rimuove al boot, quindi
   l'utente vede la versione interattiva e il crawler quella completa.
   Parole visibili: scam-bible 313→2040, 47-steps 337→2454, tenant-rights
   422→2249, neighborhood-guide 391→1559, cost-calculator 335→794 (più la
   tabella costi di riferimento, che resta visibile anche col JS acceso).
   Provato in Chromium vero nei due stati (JS on/off). Il test confronta
   proiezione e dati: non possono divergere.
2. **tenant-rights ha ora il FAQPage schema** sincronizzato dalle 15
   domande visibili (è di fatto una FAQ legale — il markup ora lo dice).
3. **`/rent-in-rome-without-scams`** — la money page del posizionamento
   unico anti-truffa: 5 regole + visura catastale da €5 + blocco "in
   brief" citabile + 5 FAQ visibili e sincronizzate, ~1.040 parole rese,
   guscio boom-2026 (marchio e footer byte-per-byte da moving-to-rome).
   Registrata nel registry, in sitemap (61 URL), in llms.txt ("Renting
   safely", con la frase per i motori di risposta), linkata da
   moving-to-rome e dalla proiezione della scam bible.

---

## Esecuzione 2026-09-04 — conversione sulle zone + le landing di intento (P1 #8, P2 #11–12)

1. **Il blocco di conversione sulle 11 pagine-zona** (P1 #8). Il builder
   `scripts/neighborhoods-build.js` emette il modulo "Find a home in
   [zona]" (nome, email, WhatsApp, mese di ingresso, budget, note)
   cablato su `/api/leads/web` con `form: zone-<slug>`: nuova famiglia
   `zone` in `FORMS` (intento contatto, etichetta "Trova casa in zona"),
   zona nel campo dedicato + in testa al messaggio, honeypot. I link
   `/book?zone=<slug>` — che le pagine avevano a mano e il builder no —
   ora vivono nel builder: la build è tornata deterministica
   (build + `seo-update.js --adopt apartments-in` = pagine committate).
   Provato in Chromium: POST reale con form/zona/budget, senza honeypot.
   `tests/webforms/run.mjs` +6 check.
2. **`/mid-term-rentals-rome`** (P2 #12, 1.249 parole): il prodotto
   spiegato per la query di testa — transitorio art. 5 L. 431/98 in
   quattro mosse, tabella costi 2026, la sezione onesta su "monthly
   rentals" (piattaforma turistica ≠ affitto vero), chi affitta mid-term,
   il processo da remoto, 5 FAQ sincronizzate, JSON-LD Service.
3. **`/furnished-apartments-rome`** (P2 #12, 1.109 parole): "arredato" è
   una clausola, non una foto — l'inventario che protegge il deposito
   (art. 1590), i 5 controlli, il premio del 10–20%, costi per zona,
   griglia zone, l'inventario dal video di BOOM. 5 FAQ sincronizzate.
4. **`/affitto-transitorio-roma`** (P2 #11, la prima landing italiana,
   942 parole): doppio binario proprietari (canone concordato, cedolare
   10%, IMU −25%, attestazione, pacchetto €349) e inquilini; passo per
   passo fino alla registrazione RLI; esempio coi numeri (15.000 €/anno →
   1.650 € risparmiati); 6 FAQ. `lang=it`, hreflang it + x-default (NON
   `en` verso mid-term: non sono traduzioni). Linkata dal calcolatore
   canone (nuova FAQ visibile, schema sincronizzato).
5. Tutte e tre: registry, rewrite, sitemap (64 URL), llms.txt (sezione
   "Mid-term and furnished rentals" con le frasi per i motori di
   risposta), smoke in Chromium (H1, FAQ, marchio, footer, zero errori).

**Restano aperti**: `/monthly-rentals-rome` (deciso di NON farla: la
query è coperta dalla sezione dedicata di mid-term — una pagina a parte
si cannibalizzerebbe), zone × pubblico (P2 #13), altre landing IT
(`affitto roma stranieri`, `stanze studenti roma`), CWV/Lighthouse,
Search Console dopo il merge.
