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
