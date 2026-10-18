# STUDIO · BOOM Cities, the experience (STUDIO_CITIES_ESPERIENZA)

Date: 15 Oct 2026 · Status: **v1 · research for the redesign of the city pages** (second writing, same day, after the completeness critic) · Owner: Valentino Egidi · Readers: the designer and the engineer who build v2, and the founder who approves it. Contract it serves: `BOOM_CITIES_BRIEF.md` v1.2. Sibling studies it extends: `STUDIO_EXECUTIVE_CONVERSIONE.md` (one door, eight blocks, proof first) and `STUDIO_EXECUTIVE_UIX.md` (gold `#FFD700`, Helvetica/Inter 300, the quiet technical layer).

**Method, stated before the findings.** Five research passes ran on 15 Oct 2026 (audience, competitors, behavioural science and EU law, technology and motion, a measured critique of the built pages), then three gap-fill passes (source verification, competitor first screens, persona rent bands and quotes) after the first writing of this document was read by a completeness critic. Every external citation below is a URL that one of those passes saw in a search result. **No external host other than `raw.githubusercontent.com` and `registry.npmjs.org` was reachable from this sandbox at any point today**: the egress proxy answers 403 on CONNECT for every publisher, regulator, competitor and archive host tried (23 of 25 spot-check URLs, plus web.archive.org, data.europa.eu, eur-lex, edpb, legislation.gov.uk, developer.mozilla.org, web.dev, caniuse.com), WebFetch resolves no DNS, and the shared web-search budget was exhausted before the gap-fill passes started. Consequence, stated once and carried through: **every market, competitor, behavioural and regulator figure in this document is a search snippet, not an opened page.** The only external facts verified against primary data today are the browser-support facts read from MDN `browser-compat-data` 8.1.6 and `web-features` 3.43.0 (both published 15 Oct 2026). Repository files, built pages, the four full-page captures and the scratchpad measurements were read directly; page measurements come from headless Chromium 1194 runs in this repo, with the method stated where the number appears. §10.0 is the verification ledger: every external figure, where it is used, its status, who verifies it and by when, and the release gate that keeps an unverified figure off a live page.

**Three house rules of this document**: no exclamation marks, no em-dashes (a quoted page string that contains one is rendered here with a comma or a colon and marked [dash normalised]), no figure without a source or an [unverified] label. The one word this genre of brief tends to ask for appears twice below, both times to be refused and replaced.

---

## 0. Decision summary

**Who.** Internationals moving to Amsterdam, Berlin, Madrid, Barcelona and Paris, researching from abroad in their own evening, scam-primed before they arrive (Dutch rental-fraud reports 311 in the first half of 2026 against 161 a year earlier, [Fraudehelpdesk](https://www.fraudehelpdesk.nl/wp-content/uploads/2026/09/Persbericht-halfjaarcijfers-final-03092026.pdf) [unverified, ledger A1]; Berlin police cases 779 in 2020 to 1,529 in 2023, [t-online](https://berlin.t-online.de/region/berlin/id_100678946/mietbetrug-in-berlin-expertin-verraet-wie-sie-sich-schuetzen.html) [unverified, A2]), competing against 45 other replies per Amsterdam free-sector listing ([Huurwoningen.nl](https://www.huurwoningen.nl/nieuws/de-krapte-op-de-huurmarkt-neemt-toe-middeninkomens-zitten-klem/) [unverified, A3]), 92 families per Barcelona ad ([idealista](https://www.idealista.com/news/inmobiliario/vivienda/2026/10/15/918818-los-interesados-que-compiten-por-cada-vivienda-en-alquiler-crecen-un-16-en-el) [unverified, A4]) or 300 requests a day on a Berlin listing ([Berliner Zeitung](https://www.berliner-zeitung.de/article/wohnungssuche-in-berlin-angebote-bekommen-mehr-als-300-anfragen-pro-tag-2211329) [unverified, A6]). Phone-first on the Dutch and Spanish desks, laptop-heavy on the German and French ones (§1.4). On the Spanish desks a large share speak Spanish or Italian, not English (§1.1).

**The thesis.** The page should behave like a diagnostic that ends in something the visitor owns, not a brochure that ends in a form. The hypothesis this study works from (§1.5, to be tested, not asserted) is that the visitor's first five questions are, in order: who pays you, can you do it while I am abroad, what if you find nothing, who answers and when, is this company real. The Check-in already answers the first two in three taps and can print the third on the ticket; the entity, the refund rule and a named person answer the last two. Everything else on the page is proof and depth, and belongs below.

**The loop (honest by construction).** Arrive (search, a forwarded link, an ad) → three taps → a ticket that is a rule, not a guess, resolved by the second tap at the latest (§3.2) → the eight papers the city's landlord asks for, credited only for what the visitor truly holds → an artifact (the pass, the link) → one door, the free file first, the till second → an end state that says what happens in the next 24 hours → return by the same link, with the checklist the desk keeps updating → the real variable reward after purchase: new listings each morning, the viewing report. The science behind each step and the law around it are in §3.

**Non-negotiables for v2** (each argued in §3 to §6):
1. One action label per desk, identical everywhere it appears; the free file is the primary door, the till the second step.
2. The refund rule ("Full Search is refunded in full if we decline the search in the first call") printed beside every €500, never weaker than in the checkout sheet.
3. Legal entity, VAT number and Stripe named beside every price, on sell desks and waitlist desks alike (today the sell-desk hero chips carry bare numbers and no "VAT included", §2.4); Rome proof ("4.9 · 47 reviews", "500+ housed") labelled as Rome or moved to a "Born in Rome" strip; the VAT place-of-supply question (brief §4) closed with the commercialista before the first `live:true`.
4. No timers, no counters, no "x people viewing", no pre-selected plan chip, no confirmshaming, no reminder nagging, no drip pricing.
5. State lives in the URL (`#checkin=`), never in device storage beyond the session; the one `localStorage` write that bypasses consent today is audited (§5.4).
6. The Check-in result must render on the screen the visitor is looking at; the `[hidden]` defeat (§4.1) ships fixed before anything else, with a geometry test.
7. A no-JS reading path and a reduced-motion path remain complete; without JS the Check-in stays hidden (brief v1.2) and the page reads whole; the city word is legible within 600 ms of first paint and never re-spins.
8. First-party weight ≤ 90 KB gzipped without a web font (≤ 140 KB with the optional Inter file, which has its own ≤ 50 KB cap), JavaScript ≤ 30 KB gzipped, no long task over 100 ms after load, every interaction under 100 ms of main-thread work, CLS 0 (§5.2).
9. Word budgets as pinned in `tests/cities/run.mjs:160` (hero column ≤ 60, door ≤ 110, plate ≤ 50, checks ≤ 170, body ≤ 950, Check-in ≤ 230) stay or shrink; the slices move with the architecture (§7.1), the ceilings do not.
10. Brief v1.1 stays in force on waitlist desks: list prices under the service chips, on each plate's price line, in the fees row of the fact sheet and in the schema (`PreOrder`), each with its **per-desk, per-plan condition string** (Berlin Full Search: due only once a lease is signed; the other waitlist plans: charged only when the desk opens). What changes is weight, not places: the hero leads with what exists today, and the Solari boards are proposed to stay only on the ticket and the end states, which is a brief v1.3 item for the founder (§9 Q4, Q12).
11. A real person with a name on the page; no stock face; "opening" state said honestly where there is no city operator yet.
12. No forecast numbers (days to find, success rate) for any city until that city has measured searches; no external statistic on a page until its source has been opened, dated and recorded (§10.0 gate).

**What we refuse.** The "addiction" frame: this is a service bought once every few years for €149 to €500; there is no habit to feed, the variable-reward slot of a sales page is empty, and the Digital Fairness Act now being drafted names manipulative and compulsive design patterns as its target ([EP legislative train](https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act); [Dentons, June 2026](https://www.dentons.com/en/insights/articles/2026/june/9/the-digital-fairness-act-dark-patterns-addictive-designs-and-influencer-marketing)) [both unverified, ledger L-series]. The replacement is **resumption and ownership**: fast first progress, a finished artifact, a saved link, a strong ending. We also refuse libraries for motion (Lottie, Rive, three.js: each heavier than the whole page, §5.3), WebGL, badges, vibration as meaning, device-persisted state, and any statistic without an opened source and a date.

**The decision (16 Oct).** The panel of §11 chose Architecture A with the grafts of D, E and B; §11 is the spec the v2 pages are built from, and §11.11 lists what it amends in the brief.

**What this second writing changed.** Fifteen gaps named by the critic are closed or declared: the verification ledger and release gate (§10.0); the two undeclared contradictions with brief v1.1 (waitlist prices, §7.3 and Q4) and v1.2 (where the Check-in lives, §7.1 and Q1) are now declared as brief amendments with their consequences on numbering, rail, section title and the test slices; Berlin's condition string is carried as data through chip, plate, ticket, fees row and schema (§7.5); the live-ticket policy is defined from the rules as they exist, including the step reorder that makes it a rule rather than a guess (§3.2); partial deep links have a format, a docs rule, landing copy and tests (§7.6); every architecture has a 1440 composition (§7.1 to §7.3); the 1440 "blank lower third" was re-measured over HTTP and is a capture artefact, not a defect (§2.4); Architecture A's no-JS path follows v1.2 (§7.1); the personas lost their invented numbers (§1.7); ES and FR toggles have mechanics, a cost and a verdict (§6, principle 11, Q6); `<input type=month>` has its row and its server consequence (§5.3, §7.7); the legal table names the UCPD basis for nagging and the VAT question, with an owner (§3.4, Q13); competitor first screens are declared unseen, with BOOM's own first screen as the one verified row (§2.1); and the proof assets have owners and dates (§3.5).

---

## 1. WHO: personas, numbers, the moment, the device, the doubts

Every figure in §1.1 to §1.4 and §1.6 is a search snippet (ledger A-series and C-series in §10.0). They are printed here because a designer needs the shape of the market to design; none of them goes on a page until the gate in §10.0 is passed.

### 1.1 Who moves there

**Amsterdam.** 39,533 people arrived in the city from abroad in 2024 against 25,549 departures ([Amsterdamse Sorteermachine, CBS preliminary](https://www.amsterdamsorteermachine.nl/en/voorlopige-cijfers-2024)). The metro region's knowledge workers come first from India and the UK, are mostly 25 to 45, and half of recent immigrants have been in the country three years or less ([Migratiemonitor MRA 2023](https://www.metropoolregioamsterdam.nl/wp-content/uploads/2023/12/Migratiemonitor-MRA-2023.pdf); [Monitor Internationals 2024](https://download.iamsterdam.com/s4gf5oaarlo-mra-update-monitor-internationals-2024-definitief.pdf)). The national knowledge-migrant inflow is shrinking: 16,000 in 2024, down 26% ([CBS](https://www.cbs.nl/nl-nl/nieuws/2025/26/minder-immigratie-in-2024-vooral-minder-kennismigranten)); IND "Kennis en Talent" applications fell from 21,730 (2024) to 19,490 (2025), top origins India, Turkey, China ([IND 2025](https://ind.nl/nl/documenten/02-2026/ind-jaarcijfers-2025.pdf)). English is not the barrier: the Netherlands tops the EF index ([iamsterdam](https://www.iamsterdam.com/en/business/netherlands-tops-global-english-proficiency-index-for-the-sixth-year-in-a-row)).

**Berlin.** 186,222 moves in and 159,115 out in 2024; the whole net gain comes from abroad (+41,862) while Berlin loses people to other Länder ([Amt für Statistik 106/2025](https://www.statistik-berlin-brandenburg.de/106-2025/)). Largest foreign nationalities by stock: Turkey 114k, Ukraine 76k, Poland 62k, Syria 47k, Russia 37k, India 33k ([Statista/Destatis](https://de.statista.com/statistik/daten/studie/1094889/umfrage/anzahl-der-auslaender-in-berlin-nach-staatsangehoerigkeit)). Germany issued about 42,600 Blue Cards in 2024, India first ([Mediendienst Integration](https://mediendienst-integration.de/arbeitsmarkt/auslaendische-arbeitskraefte/eu-aufenthalt-fuer-hochqualifizierte-die-blaue-karte/)); Berlin hosts about 40,800 international students ([Erudera/DAAD](https://erudera.com/statistics/germany/germany-international-student-statistics/)).

**Madrid.** 3,527,924 registered residents on 1 Jan 2025, 20% foreign, foreigners up 48,000 in 2024, new residents mainly from Venezuela, Colombia, Peru, Ecuador and Argentina ([El Diario de Madrid](https://www.eldiariodemadrid.es/articulo/economia/madrid-supera-35-millones-habitantes-primera-vez-marca-record-historico-poblacion/20250514113409099853.html)). Italians are one of the fastest-growing nationalities in the region, 40,462 ([Comunidad de Madrid, Sept 2025](https://gestiona3.madrid.org/bvirtual/BVCM007955-2025-09.pdf)).

**Barcelona.** 457,245 foreign nationals, 26.4% of the city, up 5.7% in a year; 35.4% born abroad ([Ajuntament](https://ajuntament.barcelona.cat/premsa/2025/05/31/barcelona-estabilitza-la-poblacio-en-17m-de-residents-el-valor-mes-elevat-dels-darrers-quaranta-anys/); [infobarcelona](https://www.barcelona.cat/infobarcelona/ca/nou-record-el-264-de-la-poblacio-de-barcelona-es-de-nacionalitat-estrangera_1523532.html)); by nationality Italians lead with 50,754 ([TOT Barcelona](https://www.totbarcelona.cat/societat/nacionalitats-estrangeres-nombroses-barcelona-514646/)). Over 30% of Spain's 2024 digital-nomad permits went to people settling around Barcelona, almost double Madrid; top origins UK, Mexico, US, Colombia ([Genbeta](https://www.genbeta.com/laboral/33-gente-que-pidio-visados-nomada-digital-2024-fueron-a-vivir-a-barcelona-casi-doble-que-eligieron-madrid)) [unverified: the 2024 total was cut off in the snippet].

**Paris.** Immigrants are 21.2% of the city's population ([INSEE](https://www.insee.fr/fr/statistiques/3633212)); France received 313,000 immigrants in 2024 ([INSEE Première 2107](https://www.insee.fr/en/statistiques/9008774)) and hosts 443,500 foreign students ([AEF/Campus France](https://www.aefinfo.fr/depeche/736941-en-2024-2025-la-france-a-accueilli-pres-de-445-000-etudiants-etrangers-soit-3-de-plus-que-lan-passe-campus-france)). No city-level annual inflow figure was found [unverified]. France and Spain sit in EF's "moderate" English band ([EF EPI 2025](https://www.ef.com/assetscdn/WIBIwq6RdJvcD9bc8RMd/cefcom-epi-site/reports/2025/ef-epi-2025-english.pdf)): language is a real barrier on three of the five desks and marginal on two.

**Design consequence.** The English-first page is right for Amsterdam and Berlin, and brief §8 says EN only, no hreflang, for v1. For Madrid and Barcelona the plurality of newcomers are Spanish speakers from Latin America plus Italians; for Paris the buyer speaks English but the landlord's dossier does not. v2 ships EN only (the decision and its mechanics are in §6, principle 11); what v2 does carry on every desk is the landlord's vocabulary (werkgeversverklaring, SCHUFA, nómina, aval, Visale) untranslated, glossed once.

### 1.2 The concrete pain, per market

| Desk | The wall, with its number | Source | Ledger |
|---|---|---|---|
| Amsterdam | Free-sector supply down 36.4% year on year (Q2 2025); 57 responses per listing nationally in Q2, 42 in Q3, 18 days online | [Pararius Q2](https://www.pararius.nl/nieuws/schaarste-op-vrije-sector-huurmarkt-neemt-toe), [Pararius Q3](https://www.pararius.nl/nieuws/vrije-sector-huurmarkt-steeds-verder-op-slot) | A5 |
| Amsterdam | 45 responses per free-sector home, 425 per mid-rent home (Q1 2025); €27.75/m²; only 2% of 2025 lettings were mid-rent | [Huurwoningen.nl](https://www.huurwoningen.nl/nieuws/de-krapte-op-de-huurmarkt-neemt-toe-middeninkomens-zitten-klem/), [Huurwoningen.nl](https://www.huurwoningen.nl/nieuws/de-huurmarkt-blijft-krap/), [PropertyNL](https://propertynl.com/Nieuws/Middenhuur-verdampt-in-Amsterdam/ecb7ffb6-cb47-41fb-9ddd-64881ca251fb) | A3 |
| Amsterdam | Income rule 3 to 4 times rent; deposit capped at two months since 1 July 2023; 75% of international students saw "no internationals" ads | [amsterdamrelocation](https://amsterdamrelocation.com/blog/income-required-to-rent-amsterdam.html), [Rijksoverheid](https://www.rijksoverheid.nl/onderwerpen/woning-verhuren/vraag-en-antwoord/nieuwe-regels-voor-verhuurders-en-verhuurbemiddelaars-1-juli-2023), [IamExpat/ResearchNed](https://www.iamexpat.nl/education/education-news/internationals-happy-studying-netherlands-except-housing-challenges) | A9 |
| Amsterdam | Fraud: 244 rental-fraud reports in 2024, €223k lost; 311 in H1 2026 vs 161 a year earlier; 191 of 268 housing-fraud reports from 16 to 35-year-olds | [Woonbond](https://www.woonbond.nl/nieuws/honderden-gemelde-zaken-van-verhuurfraude/), [Fraudehelpdesk](https://www.fraudehelpdesk.nl/wp-content/uploads/2026/09/Persbericht-halfjaarcijfers-final-03092026.pdf), [Delta TU Delft](https://delta.tudelft.nl/en/article/room-scams-are-more-and-more-convincing-this-room-was-too-good-to-be-true) | A1 |
| Berlin | Market-active vacancy 0.3% (balanced would be 2 to 3%); asking rent €15.79/m²; the most-wanted listings draw 300+ requests a day | [CBRE/Berlin Hyp](https://www.cbre.de/press-releases/berlin-hyp-und-cbre-wohnmarktreport-berlin-2026), [Immobilienmanager](https://www.immobilienmanager.de/wohnmarktreport-mieten-in-berlin-steigen-weiter-kraeftig-19052025), [Scout24](https://www.scout24.com/news-medien/news/detail/die-meistgesuchte-mietwohnung-deutschlands-2024) | A6 |
| Berlin | 79% of Berlin expats disagree that housing is easy to find, against 34% globally | [InterNations 2024 via Scribd](https://www.scribd.com/document/827956656/Expat-Insider-2024-the-Best-Worst-Cities-to-Get-Started-Abroad-InterNations) [Scribd copy, not internations.org] | A7 |
| Berlin | No registered address, no SCHUFA; deposit at most three net cold rents in three instalments | [farawayhome](https://www.farawayhome.com/en/magazine/rent-apartment-without-schufa-berlin), [Sparkasse](https://www.sparkasse.de/pk/ratgeber/wohnen/mieten/mietkaution.html) | A9 |
| Madrid and Barcelona | 43 contacts per listing nationally (Q3 2026), Barcelona 92, Madrid 49; 36% of Barcelona lets and 9% of Madrid lets close the same day; Barcelona supply down 28% in five months after the seasonal-rental law | [idealista](https://www.idealista.com/news/inmobiliario/vivienda/2026/10/15/918818-los-interesados-que-compiten-por-cada-vivienda-en-alquiler-crecen-un-16-en-el), [Merca2](https://www.merca2.es/2026/08/14/alquiler-vivienda-espana-idealista-24-horas-2436101/), [El Debate/CPUB](https://www.eldebate.com/espana/cataluna/barcelona/20260206/fracaso-restricciones-vivienda-psc-cae-28-oferta-alquiler-barcelona_382219.html) | A4 |
| Madrid and Barcelona | Without a Spanish payslip "almost no landlord will accept you without additional backing"; banks may freeze 6 to 12 months of rent for an aval; housing cyber-fraud proceedings rose from 19,646 to 22,614 (national) | [barcelonarenthelp](https://barcelonarenthelp.com/rent-barcelona-without-spanish-work-contract/), [getprio](https://getprio.io/blog/documents-rent-apartment-spain/), [Público/Fiscalía](https://www.publico.es/economia/vivienda/anuncios-pisos-baratos-existen-crisis-vivienda-dispara-estafas-inmobiliarias.html) | A9 |
| Paris | 33 candidates per listing in H1 2025 (2.6 times the national figure), 41 in H1 2026, 15 days to let; a furnished student studio drew 743 applications | [Manda 2025](https://www.manda.fr/ressources/articles/barometre-de-la-tension-locative-au-premier-semstre-2025), [Manda 2026](https://www.manda.fr/ressources/articles/barometre-tension-locative-1er-semestre-2026), [Meilleurtaux](https://www.meilleurtaux.com/credit-immobilier/actualites/2025-septembre/etudiants-victimes-tension-locative-sans-precedent-paris.html) | A8 |
| Paris | The dossier is a closed legal list; landlords want about 3 times rent in euros and often will not assess foreign-language payslips; Garantme costs 3.5% of annual rent; DossierFacile passed 2 million accounts | [Légifrance 2015-1437](https://legifrance.gouv.fr/loda/id/JORFTEXT000031444493/2019-10-06), [relocation-in-paris](https://relocation-in-paris.fr/en/blog/rental-application-paris-documents-needed), [The American in Paris](https://theamericaninparis.com/2026/06/18/how-to-find-an-apartment-in-france-as-an-american/), [DossierFacile](https://www.dossierfacile.logement.gouv.fr/blog/2-millions-comptes-dossierfacile) | A9 |

The brief (§5.3) allows statistics only with a source and a date, and §9 says every number has a source. Two or three per city, printed with their source line, are the strongest honest answer to "why not do it myself"; this table is the shortlist, and none of its rows may be printed until the row's page has been opened and dated (§10.0). **Rent bands per city are deliberately absent.** The two €/m² figures above (Amsterdam €27.75, Berlin €15.79) are snippet-level averages with unknown scope (median or mean, furnished or not), and a furnished 1-bed or 2-bed band must never be manufactured by multiplying a €/m² figure by an assumed surface; brief §6 keeps Module A (budget reality check) unbuilt for exactly this reason. The only budget numbers that are repo facts are the form's own bands per city (`cities/*.json`, read 15 Oct): Amsterdam under 1,500 / 1,500 to 2,000 / 2,000 to 2,500 / 2,500 to 3,500 / 3,500+; Berlin under 1,000 / 1,000 to 1,500 / 1,500 to 2,200 / 2,200 to 3,000 / 3,000+ (warm); Madrid and Barcelona under 1,000 / 1,000 to 1,500 / 1,500 to 2,000 / 2,000 to 3,000 / 3,000+; Paris under 1,200 / 1,200 to 1,800 / 1,800 to 2,500 / 2,500 to 3,500 / 3,500+. Those are product choices, usable as such, not market claims.

### 1.3 How they search today, and what they say

Portals: Pararius, Funda, Kamernet; ImmoScout24, WG-Gesucht, Kleinanzeigen; idealista, Fotocasa, Habitaclia; Leboncoin, which outdraws SeLoger 14M to 6.7M unique visitors ([Pretto](https://www.pretto.fr/recherche-immobiliere/trouver-bien-immobilier/meilleur-site-immobilier/)). Furnished platforms are the from-abroad default: Spotahome claims 70% international bookings (vendor claim, [Spotahome landlord page](https://plans.spotahome.com/)). Facebook groups are the real alternative channel and the main scam vector: the Amsterdam housing group has about 178,500 members ([MumExpat](https://mumexpat.com/en/facebook-groups/)); half of US rental-scam reports start with a Facebook ad ([FTC 2025](https://search.ftc.gov/system/files/ftc_gov/pdf/rental-scams-spotlight-2025.pdf)); a Prague ring posted fake flats in expat groups ([Expats.cz](https://www.expats.cz/czech-news/article/new-investigation-exposes-facebook-scam-targeting-expat-apartment-hunters)). Positioning follows: BOOM competes with "the group", not with the portals, and wins on verification.

In their own words. Reddit was unreachable (the search API refuses reddit.com for this agent; direct fetch is blocked); these are Hacker News, Trustpilot, Expat.com, The Local, TU Delft and first-person blogs, the same genre, not a Reddit sample. **Wording is as it appeared in search snippets; no thread page was opened, so no quote is confirmed verbatim, and the only dates known are the ones in URL paths** (ledger Q1 to Q9). Each is tagged with the persona in §1.7 that it anchors.

- Q1 · "never receiving one email response or telephone callback despite dozens of inquiries" ([Daft Americans](https://daftamericans.substack.com/p/guide-to-finding-housing-in-netherlands), date not in URL) · anchors persona P1
- Q2 · "applications sent in German got 10 times more responses even though the landlord could speak English" ([Hacker News 26319875](https://news.ycombinator.com/item?id=26319875), thread id suggests early 2021, inference) · anchors P2
- Q3 · "three months of salary slips and a French guarantor, which is hard for non-French residents to find" ([Hacker News 17734289](https://news.ycombinator.com/item?id=17734289), id suggests 2018, inference) · anchors P4
- Q4 · "agents immediately eliminate us because we do not yet have our NIE" ([Expat.com](https://www.expat.com/en/forum/europe/spain/1057003-renting-through-idealista.html), date unknown) · anchors P3
- Q5 · Helna, developer from India, one of 26 applicants, asked for €4,066 upfront, scammed ([The Local, 10 Aug 2023](https://www.thelocal.de/20230810/interview-how-i-was-scammed-out-of-e4000-for-a-berlin-apartment)); a Polish couple lost €7,000 in Neukölln ([The Local, 8 Mar 2024](https://www.thelocal.de/20240308/complete-shock-how-sophisticated-scammers-are-targeting-desperate-berlin-tenants)); reported speech, not first-person quotes · anchors P2
- Q6 · "agencies often go silent instead of sending a rejection" ([The American in Paris, 18 Jun 2026](https://theamericaninparis.com/2026/06/18/how-to-find-an-apartment-in-france-as-an-american/); a guide author's line, not a searcher's post) · anchors P4
- Q7 · A Paris family with a French guarantor plus Garantme and SmartGarant still "struggled to get visits" ([Substack](https://maddyodom.substack.com/p/what-to-know-about-renting-an-apartment), date unknown) · anchors P4
- Q8 · Found a flat "in 2 weeks, before even arriving to the city" ([Trustpilot, RentSlam](https://www.trustpilot.com/review/rentslam.com), date unknown; a vendor testimonial) · anchors P5
- Q9 · Guides' consensus: do not try to rent an unfurnished apartment from abroad, it is "nearly impossible and invites scams" ([expats.de](https://expats.de/en/bureaucracy/rent-apartment-germany/)) · anchors P1 and P2. This is the exact gap Attended Viewing fills; name it as the anti-scam product.

Coverage against the four themes the gap-fill asked for: scam (Q5, Q9), dossier or guarantor rejection (Q3, Q4, Q7), agencies not replying (Q1, Q6), and what people would pay someone to do (none found; Q8 is the nearest and it is a vendor review). No source states the device or the hour of the searcher.

### 1.4 Device and moment

Mobile share of web traffic: Netherlands about 66%, Spain about 58%, France about 46 to 48%, Germany about 43% ([StatCounter NL](https://gs.statcounter.com/platform-market-share/desktop-mobile/netherlands/2021), [ES](https://gs.statcounter.com/platform-market-share/desktop-mobile/spain), [FR](https://gs.statcounter.com/platform-market-share/desktop-mobile-/france), [DE](https://gs.statcounter.com/platform-market-share/desktop-mobile-tablet/germany)) [unverified: the page date labels are inconsistent; treat as recent readings, not annual averages]. Private landlords in Germany post mostly on Sundays between 11 and 18 ([ImmoScout24](https://www.immobilienscout24.de/wissen/mieten/wohnungssuche-wann-gibt-es-die-meisten-angebote.html)): "apply within the hour" is a Sunday-afternoon promise. The buyer is typically still abroad; evenings at home are CET+3.5 to +4.5 from India and CET−6 to −9 from the Americas [inference from origin countries; no platform publishes tenant search-time data], which is why "same working day" needs its timezone stated and WhatsApp named as the asynchronous channel. Paying a foreign company is normal (40% of EU e-shoppers bought cross-border in 2024, [Ecommerce Europe](https://ecommerce-europe.eu/wp-content/uploads/2024/10/CMI2024_Complete_light_v1.pdf)); paying before any human has replied, for housing, is the scam pattern they have been warned about.

Browser mix in the five markets (caniuse regional data, 2026-09, computed by the technology pass from the data repository, [caniuse data](https://github.com/Fyrd/caniuse)): Android Chrome 36 to 56%, iOS Safari 13 to 16%, Samsung Internet 2.5 to 4.5%, Firefox 1.7 to 7.2%. The design target is a mid-range Android on 4G for Amsterdam, Madrid and Barcelona, and a 1440 laptop for Berlin and Paris in addition. The `clock_shown` event in §8.2 replaces the timezone inference with a measurement after the first week.

### 1.5 What they must learn in the first 20 seconds: a hypothesis, with its test

The ordering below is not research; it is the study's working hypothesis, assembled from the doubts in §1.3 and the law facts in §1.2. It is testable with two events already planned in §8.2: `faq_open` (which doubt the page failed to answer earlier, by question index) and `checkin_abandon` (where the three taps break). After the first measured month the order is rewritten from those two events.

1. **Do you work for me or for the landlord.** In the Netherlands dual fees are forbidden by BW 7:417(4) and the ACM enforces it ([ACM commitment 2014](https://www.acm.nl/sites/default/files/old_publication/publicaties/13348_toezegging-direct-wonen-verhuur-makelaars-2014-07-29.pdf); [ACM order 2019](https://acm.nl/sites/default/files/documents/2019-09/last-onder-dwangsom-goeth-vastgoed-voor-rekenen-van-verboden-bemiddelingskosten.pdf)) [unverified, L1]; in Spain Ley 12/2023 puts agency costs on the landlord; in Germany the Bestellerprinzip says whoever orders pays ([Immodo](https://immodo-berlin.de/blog/en/maklervertrag-berlin-expat-guide/)) [unverified]. Verifiable legal facts, stronger than any trust adjective, once counsel has confirmed them (brief §4: every line is "verify", not "fact").
2. **Can you do it while I am abroad.** Video, written report, remote signing.
3. **What if you find nothing.** First-call decline, full refund (BOOM policy, confirmed by the founder 15 Oct).
4. **Who answers and when.** A named person, a CET window, WhatsApp.
5. **Is this company real.** Registered entity, VAT, Google reviews: today's "4.9 · 47" are Rome reviews and must say so.

Objections to pre-empt near the form, not only in the FAQ: "is this a scam" (they have read Helna's story); "why not do it myself" (answer with the competition numbers once verified, and the document list, not adjectives); "you are Italian, what do you know about Berlin" (answer with the city's law facts and the partner line); "what do I get on a waitlist desk" (the file, the dossier readiness, the six checks).

### 1.6 Price anchors they already carry

RentSlam's human tiers: Rental Assistant €995 one-time, Rental Agent €195 intake plus €1,995 success fee ([RentSlam](https://rentslam.com/en/rental-agent/)) [C8]; Amsterdam aanhuurmakelaars at one month's rent plus 21% VAT, no cure no pay ([Your Expat Broker](https://yourexpatbroker.nl/en-gb/35-f30e/housing-rental-agent-for-expats-in-amsterdam)) [C8]; Berlin €1,599 plus VAT ([Anders Relocation](https://www.anders-relocation.de/10-tipps-fuer-die-wohnungssuche-berlin/)) or about two net cold rents plus VAT on signing ([quininvestment](https://quininvestment.com/lohnt-sich-ein-makler-bei-der-wohnungssuche-in-berlin/)); Paris chasseurs €800 to €3,000 ([Avant Garde](https://avantgardetransaction.fr/chasseur-location-appartement)), Flat Me one month's rent with a €2,500 minimum ([Flat Me](https://www.flat-me.fr/honoraires)), Apparte fixed €1,490 or €1,990 ([Apparte](https://apparte.fr/chasseur-location-paris-et-idf/)); Spain one month's rent to 10% of annual rent plus VAT, with agencies rebranding the now-illegal "agency month" as "personal shopper" ([Rubirent](https://rubirent.com/post/honorarios-de-la-agencia-inmobiliaria-en-el-alquiler-qui%C3%A9n-paga-la-comisi%C3%B3n-tras-la-ley-de-vivienda/), [elDiario.es](https://www.eldiario.es/politica/estudio-viabilidad-personal-shopper-tretas-inmobiliarias-saltarse-ley-cobrar-honorarios-inquilino_1_10280373.html)). All provider prices are as they appeared in snippets of the providers' own or secondary pages, none opened, none checked against a live price list [unverified, C-series].

€500 is below every anchor seen. The risk is "too cheap to be real", not "too expensive": the invoice entity, VAT, Stripe and the refund rule must sit next to the price. A dated market norm ("one month's rent plus 21% VAT is the Amsterdam norm, source and date") is an effective comparison and legal in principle as long as it names no competitor and states its date, but it needs the opened source and counsel's view on comparative advertising per country (§9 Q8, Q13) before it is printed.

### 1.7 Personas, stripped to what is known

The first writing gave each persona an age, an employer, a device and a euro budget. None of those had a source (gap-fill, 15 Oct: "authored, no source; should be stripped or pinned"), so they are gone. What remains per persona is the direction of travel, the role the doubt comes from, the quote from §1.3 that anchors the doubt, and the form band that the product offers them; the device and the hour are the §1.4 inference, labelled as such.

- **P1 · a knowledge worker from India to Amsterdam** (the metro region's first origin for knowledge workers, §1.1). Doubt: nobody will accept me without BRP, a Dutch bank account or Dutch payslips; can your dossier fix that, and if not, do I get the €500 back. Anchor: Q1, Q9. Likely a phone in the IST evening (inference). Form bands: Amsterdam.
- **P2 · a Blue Card holder from the UK or India to Berlin, with a partner.** Knows "SCHUFA" and "Anmeldung" from guides; has read a scam story. Doubt: Berlin is a waitlist; what do you actually do for me this month, and when exactly would I owe anything. Anchor: Q2, Q5, Q9. Laptop share higher in Germany (§1.4). Form bands: Berlin (warm).
- **P3 · a Spanish speaker from Latin America (or an Italian) to Barcelona**, startup job, no NIE yet, no nómina. Doubt: list prices on a desk that is not open; is this real, and will you charge me. Anchor: Q4. Phone-first market (§1.4). Prefers Spanish copy (§1.1), which v2 does not yet carry (principle 11). Form bands: Barcelona.
- **P4 · an academic couple from the US to Paris**, income in dollars, no French guarantor. Doubt: can you solve the garant problem, or is this another dossier that gets ignored. Anchor: Q3, Q6, Q7. Desktop in the CET−6 evening (inference). Form bands: Paris.
- **P5 · a remote worker on Spain's digital-nomad visa to Madrid**, Spanish speaker. Doubt: I speak the language; why pay you instead of idealista alerts. Anchor: Q8 (the only "it worked, from abroad" line found, and it is a vendor review). Form bands: Madrid. The answer is speed and the file, stated as facts, which is why the sell-desk ticket must carry the within-the-hour rule and the refund rule, not adjectives.

Searches last weeks to months (RentSlam reviewers two to three weeks, [Trustpilot](https://www.trustpilot.com/review/rentslam.com) [unverified]; a Berlin thread reports 1.5 years, [Hacker News](https://news.ycombinator.com/item?id=30968721) [unverified]). The page therefore needs a return loop, not a one-visit conversion.

---

## 2. The market as it is: competitor teardown and the gap

**Caveat that governs the whole section.** No competitor page was opened by any pass today. The dedicated gap-fill pass (15 Oct, 18:16 to 18:18 UTC) requested thirteen competitor URLs and every one was refused at the egress gateway with CONNECT 403; no cached competitor HTML exists in the session (the critique pass had logged `000ERR` for rentslam.com and spotahome.com); no headless browser could reach them. **Every first-screen cell in §2.1 is therefore a reconstruction from cached titles, app-store listings and third-party snippets, not a screenshot; no CTA label, H1 or price placement below is quoted verbatim from a competitor page.** The designer has no visual of any competitor's first screen from this study. The one verified row is BOOM's own (§2.1, last row). The protocol to close the gap from a machine with egress is in §10.0 (item C0, about 30 minutes).

### 2.1 Teardown

| Family | Who | What the first screen sells (reconstructed) | Price display (snippet) | Proof mechanism (snippet) | Return loop | Dated or weak | Ledger |
|---|---|---|---|---|---|---|---|
| Marketplaces | HousingAnywhere | "Rent Easy. Live Free.", 150+ cities ([App Store](https://apps.apple.com/us/app/-/id6738123016)) | 25 to 40% of first month outside NL, €175 minimum ([pricing](https://housinganywhere.com/pricing/tenants)); whether it is "buried" is a layout judgement nobody here has seen | "Tenant Protection": first month held 48h after move-in ([secure payments](https://housinganywhere.com/secure-payments)) | Account, saved searches | City counters contradict each other across channels | C1 |
| Marketplaces | Spotahome | Rent without seeing in person; Homecheckers film ([App Store](https://apps.apple.com/us/app/spotahome-apartments-rooms/id1304349562)) | Fee visible only via promo sites | "You will only be charged if the landlord confirms" ([how it works](https://www.spotahome.com/how-it-works)); 24h check window ([guarantees](https://www.spotahome.com/tenant-guarantees)) | Account | Promo codes on a trust product | C2 |
| Marketplaces | Blueground | "Show up. Start living." ([profile](https://www.startupranking.com/blueground)); one line, one search box, product within two scrolls (`STUDIO_EXECUTIVE_CONVERSIONE` §3, itself from snippets) | On listings | 24/7 support ([expatsi](https://expatsi.com/housing-blueground)) | Account | n/a | C3 |
| Marketplaces | Wunderflats | "Rent furnished apartments", steps spelled out: request, accept, verify, pay ([homepage](https://prod1.wunderflats.com/)) | Service fee at booking | Anmeldung via the landlord's Wohnungsgeberbestätigung ([relocate.me](https://relocate.me/relocation-company/wunderflats)) | Account | Trustpilot anger over deposits ([Trustpilot](https://www.trustpilot.com/review/wunderflats.com)) | C3 |
| Aggregators | Nestpick | "1 million+ properties, 200+ cities" ([FAQ](https://www.nestpick.com/faqs/)) | None (redirects) | None | Alerts | Owns no step of the journey | C3 |
| NL alert tools | RentSlam | Search "every 30 seconds"; houses shown to non-users "with a two hour delay" ([RentSlam](https://rentslam.com/en/rentals/amsterdam/)) | €19.98/month, 14-day money-back; agent tiers €995 or €195 + €1,995 ([pricing](https://rentslam.com/en/rental-agent/)) | Speed as mechanism | Daily alerts | Information scarcity sold as a feature; trial terms conflict across sites | C8 |
| NL alert tools | Rentola | €1 for 14 days, then €39 every 28 days, auto-renew ([terms](https://rentola.nl/en/terms-and-conditions)) | Hidden in terms | None | Billing | Trustpilot is a wall of billing complaints ([Trustpilot](https://uk.trustpilot.com/review/rentola.nl?page=3)); the pattern BOOM must visibly not be | C4 |
| NL alert tools | Rentbird, Stekkies | Bots scan "1,400+ sites", WhatsApp "within seconds", a "Speed Score" ([Awin](https://ui.awin.com/merchant-profile/69422), [Uprent](https://uprent.nl/rental-platform-overview/rentbird)) | Monthly, conflicting across sites | Demonstrated cadence | WhatsApp | n/a | C4 |
| DE platform add-on | ImmoScout24 MieterPlus | A verified digital Bewerbermappe, listings up to 24h before public, a "Chancen-Check" ([MieterPlus](https://www.immobilienscout24.de/lp/mieterplus-info.html), [Bewerben](https://www.immobilienscout24.de/suchen-finden-einziehen/bewerben.html)) | About €30/month, two-month minimum ([Expath](https://www.expath.de/how-do-you-find-a-flat-in-berlin/), secondary) | The dossier as a product | Subscription | Platform-side only, German only | C5 |
| Tenant-side agents, NL | Your Expat Broker, HBhousing, HPS, Rotsvast, Expat2Holland, WE4EXPATS, Xpats-Service | "No cure no pay" | One month + 21% VAT ([Your Expat Broker](https://yourexpatbroker.nl/en-gb/35-f30e/housing-rental-agent-for-expats-in-amsterdam)); "we agree a rate with you" ([Rotsvast FAQ](https://www.rotsvast.nl/faq/wat-zijn-de-kosten-voor-expat-verhuur-via-rotsvast/)); €250 + VAT commitment deposit ([WE4EXPATS](https://www.we4expats.nl/housing-in-amsterdam/)); €2,950 single / €4,950 family ([Xpats-Service](https://www.xpats-service.com/)) | Years in business, stars | None | Price absent or "agreed", a phone form, landlord and tenant copy on one domain (all from snippets) | C8 |
| Tenant-side agents, FR | Flat Me, Apparte, Flatsearch, Detect | Chasseur de location | One month HC, min €2,500 ([Flat Me](https://www.flat-me.fr/honoraires)); €1,490 / €1,990 ([Apparte](https://apparte.fr/chasseur-location-paris-et-idf/)); from €1,800 ([Flatsearch](https://www.flatsearch.fr/tarif-chasseur-immobilier-paris)) | Credentials: FCI, carte T, Google ≥ 4.5 ([HomeSelect](https://www.homeselect.paris/blog/comment-choisir-le-meilleur-chasseur-d-appartement-a-paris-guide-complet-et-conseils-pratiques)) | None | n/a | C9 |
| Tenant-side agents, ES | Barcelona Home Hunter, Remoters, Relomar | Rental search for expats | €300 + IVA retainer, one month + IVA on success ([BHH](https://barcelonahomehunter.com/rental-search-relocation-support-barcelona/)); €550 to €800 ([Remoters](https://www.remoters.io/en/rentals/barcelona)) | Stars | None | A tiny category; guides warn "pay nothing before you sign" ([Expat Info Desk](https://www.expatinfodesk.com/destinations/barcelona/accommodation/finding-a-home/)) | C9 |
| Tenant-side agents, DE | **BerlinRelo** | Operating numbers on the homepage: "53 day search on average, 4.4 viewings, 2.38 apps"; refuses searches forecast over 80 days; a free calculator (income + flat type → projected days, built on about 350 searches) ([BerlinRelo](https://www.berlinrelo.de/), [The Local, 19 Feb 2026](https://www.thelocal.de/20260219/is-your-flat-search-in-berlin-realistic)) | About €1,600 to €1,700 + VAT | Numbers and a refusal rule | The calculator | **Every cell in this row is single-source and unverified, the numbers, the refusal rule, the calculator and the fee alike**; 2.38 is dashboard-grain vendor precision that will drift; whether the calculator is on the first screen is unknown | C7 |
| Relocation | Expath, Faraway, Crown | Hours-based coaching, packages from €800, a "Move Manager" ([Expath](https://www.expath.de/relocation/), [Faraway](https://www.farawayhome.com/en/berlin/expat-relocation-guide), [Crown](https://www.crownrelo.com/office/amsterdam)) | Absent or packaged | Years | None | n/a | C9 |
| **BOOM, as built (verified 15 Oct from `amsterdam.html`, `barcelona.html` and the captures)** | boomrome.com/amsterdam | H1 "Your home in AMSTERDAM / Found by someone on your side." (the city word is the split-flap board); first sentence "A Dutch-format dossier in 24 hours, applications within the hour, a BOOM person at every viewing." then "Paid by you, never by landlords." [dash normalised] | At 1440: the four radio chips "Full Search €500 · Application Pack €199 · Attended Viewing €149 · per viewing · Not sure yet, advise me" above the fold, **bare numbers, no "VAT included" in the sell-desk hero** (the words appear in the hero only on waitlist desks: "List prices, VAT included, charged only when the desk opens." [dash normalised]). At 390: chips at y ≈ 1,000 to 1,110, below an 844-px fold; the only price in the first viewport is the fixed pay bar "Full Search · €500 / pay now · Stripe · the work starts today / Start →" | "★ 4.9 on Google · 47 reviews" and "✓ 500+ internationals housed" above the form (unlinked, unlabelled as Rome); at 1440 also "SEARCHING DAILY ON: PARARIUS · FUNDA · AGENCIES · OFF-MARKET" [dash normalised] | No account, login, alert or newsletter in the DOM; loops are WhatsApp (`wa.me/393313251961`, an Italian number), mailto, the `#checkin=` link with Copy link / Save image / Share, and the pass PNG | Same CTA three times on one 1440 screen (nav "START MY SEARCH", form "✈ Start my search", rail "START MY SEARCH"); the diagnostic is in section 02, not on the first screen; `fold-1440.png` caught the board mid-roll reading "AMSTERDAL" | verified |

Pattern across the agents, BOOM's true category, as far as snippets show it: price absent or "agreed with you", a phone or email form, proof equals years or stars, no artifact, no return loop, both sides of the table on one domain. These are plausible and unobserved; v2 is built so that none of its decisions depends on them. The first writing claimed that BOOM's hero chips were "the most explicit price display in the category": that claim is withdrawn, twice over. No competitor first screen was seen, and the built sell-desk chips show numbers without "VAT included" (verified). What can be said: BOOM prints three flat prices in the hero, and v2 should print them the way the waitlist hero already does, with "VAT included" and the entity beside them.

### 2.2 Quiz funnels and progressive disclosure the audience already knows

All from snippets and secondary write-ups (ledger B-series):

- **Noom**: up to 113 screens, a progress indicator shown early, micro-feedback after sensitive answers, a projection that updates every few screens ([RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel); [Growth Waves](https://www.growthwaves.io/p/the-113-screen-onboarding-that-doesnt); [Growth Models](https://growthmodels.co/noom-marketing/)). The honest-sized version is three taps; what BOOM lacks is the live projection, because the ticket appears only at the end.
- **Lemonade**: one question at a time through Maya ([UXReactor](https://uxreactor.com/lemonade-ai-disrupts-insurance-industry/)); the "90 seconds" claim is marketing nobody timed.
- **Hims**: consultation before checkout, an intent fork around question three, proof shown during the wait ([Propel](https://www.trypropel.ai/resources/blogs/hims-and-hers-customer-retention-strategy-glp1); [ConvertFlow](https://www.convertflow.com/campaigns/hims-full-funnel-marketing-examples-templates)).
- **Duolingo**: lesson before signup, a "building your course" screen ([Gummble](https://gummble.com/blog/duolingo-onboarding-flow-analysis)); the UXologist is right that these are ordinary progressive disclosure, not proven commitment devices ([The UXologist](https://theuxologist.com/case-studies/habit-forming-within-onboarding)). Do not fake a loading state.
- **Revolut**: email and phone first, verification, then personal details ([Revolut legal](https://www.revolut.com/en-HU/legal/remote-eletronic-onboarding-process/)).
- **Spotify Wrapped**: cards read as identity, not data; a share button on every card, not only the finale ([unilink](https://www.unilink.us/blog/how-does-spotify-wrapped-work); [aadilsyed](https://aadilsyed.medium.com/the-wrapped-phenomenon-how-we-learned-to-love-sharing-our-data-6392034f995f)); 227M people engaged in 2023 ([Spotify Newsroom](https://newsroom.spotify.com/?p=32167)).
- **Linear, Vercel, Stripe**: near-black, one accent, one primary action per section ([awesome-design-md](https://github.com/voltagent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md); [rauno.me](https://rauno.me/craft/vercel), which also names Vercel's 1080 grid and 360-px columns); Stripe's bento tiles as progressive disclosure, animation deliberately held back ([Summify](https://summify.io/discover/how-stripe-built-their-new-website-ypzNhw/)).
- **Airbnb**: Where → Check in → Check out → Who; the field order is the action sequence and the prompts are signifiers ([Pratt critique](https://ixd.prattsi.org/2021/09/design-critique-airbnb-website/)).
- Evidence to keep: Typeform's own data, 47% average completion, six questions or fewer best, email first +9% ([Typeform help](https://help.typeform.com/hc/en-us/articles/360029615911-What-s-the-average-completion-rate-of-a-typeform); [Typeform blog](https://www.typeform.com/blog/survey-response-rate)) [vendor data, B5]; Nunes and Drèze 2006, 34% vs 19% redemption with two of ten stamps pre-given ([Knowledge@Wharton](https://knowledge.wharton.upenn.edu/?p=5630)) [secondary write-up of the JCR paper, B4].

### 2.3 The gap: what nobody does, and what is stealable and legal

1. **A plan recommender that can say no.** BerlinRelo is reported to decline searches forecast over 80 days (single-source, C7); BOOM needs no competitor fact for this, because the policy exists: first-call decline, full refund. Put the refusal on the ticket for the `zero` + `soon` path as a sentence ("Four weeks is tight. If we decline the search in the first call, the €500 comes back whole."), and cite nobody. No forecast numbers until Amsterdam has measured searches.
2. **The dossier as a shareable, city-specific artifact.** Only ImmoScout is reported to sell a Bewerbermappe, platform-side, in German. No tenant-side service found publishes the eight papers a Dutch, Spanish, French or German landlord asks for as a structured, forkable checklist. BOOM's "n of 8" plus pass is unique as far as snippets show; it is the GEO object ("What documents do I need to rent in Amsterdam?") and should be shareable per card, not only as the final pass (§7.6).
3. **Progress you arrive with.** A `#checkin=` deep link with partial answers should land as "1 of 3 answered, from the link you received", not on a blank step one: endowed progress with a true reason, the condition under which Nunes and Drèze found it works. Format and rules in §7.6.
4. **A live ticket, as a rule.** Update the ticket after each tap instead of revealing it at the end; keep the split-flap as the feedback; no artificial delay. The policy that makes this a rule rather than a guess is §3.2.
5. **Field order as sequence; price as mechanism.** HousingAnywhere is reported to name its mechanism ("Tenant Protection, 48h hold"). Name BOOM's: "First-call refund" on the Full Search plate and the ticket, not only in the FAQ.
6. **Truthful comparison instead of an abstract "flat fee".** "One month's rent plus 21% VAT" is €2,420 on a €2,000 rent; RentSlam's agent is €195 plus €1,995. Shown as a dated market norm with its opened source, never as a competitor name; gated by §10.0 and counsel (Q8, Q13).
7. **Show the cadence, not the adjective.** Alert tools win on "every 30 seconds". BOOM can state only what it does: the hours the desk checks the portals, the within-the-hour rule. Measured, never a counter.
8. **One action per screen.** Verified today: at 1440 the hero shows the nav button, the form button and the rail label with the same words; on the phone the pay bar frames €500 before the Check-in has recommended anything.
9. **Progressive disclosure for the six checks.** Tile → detail on tap keeps the word budget while the GEO text exists in the DOM.

### 2.4 Three observations on the current builds that belong here

- **The 1440 "blank lower third" is a capture artefact, measured twice.** The gap-fill pass and then this writing re-ran the check over HTTP (`scratchpad/tallcheck.mjs`, Chromium 1194, `amsterdam.html` served from the repo with both stylesheets loading). At 1440×900 without scrolling, `#method`, `#faq`, `.band`, `.flow` and `.sib` sit at opacity 0 below the fold (their tops at 1,785 to 4,348 px; the `.rv` rule in `css/boom-2026.css:182`, expected); after one scroll to the bottom every one carries `.rv.in` at opacity 1; at a 1440×6000 viewport from load all are `.rv.in` at opacity 1 after 2.5 s; reduced motion is identical. A first run from `file://` had shown opacity 1 everywhere because `/css/boom-2026.css` cannot load under `file://`; the HTTP run is the valid one. Consequences: Q14's answer changes from "release blocker" to "the capture pipeline must scroll before `fullPage`", the four reference captures in `scratchpad/current/` are misleading and must be regenerated before the judge panel (task #8) looks at them, and `tests/cities/ui.mjs` gains a 1440×900 check that a scroll reveals every `.rv` block (so the reveal cannot regress unseen).
- **Rome proof under a Barcelona H1.** "4.9 on Google · 47 reviews" and "500+ internationals housed" sit under every city H1 without a Rome qualifier (`hero.trust` in every `cities/*.json`). The brief permits the numbers; the UCPD requires that they not read as Barcelona results.
- **"VAT included" is missing from the sell-desk hero.** The waitlist desks print "List prices, VAT included, charged only when the desk opens" under the chips; Amsterdam and Madrid print the bare chips. Non-negotiable 3 closes this.

---

## 3. The honest engagement loop

### 3.1 The science, translated into mechanics we can defend

All citations in this subsection are snippets or secondary write-ups (ledger B-series); the mechanics do not depend on the exact figures, only on the direction of the findings, and none of the figures goes on a page.

**Fogg (behaviour = motivation × ability × prompt).** Ability is the cheapest lever ([Stanford Behavior Design Lab](https://behaviordesign.stanford.edu/resources/fogg-behavior-model)). For a €149 to €500 purchase made from abroad, motivation is already high and anxious; the page's job is ability (three taps, one door) and a facilitating prompt. Do not add fear or urgency sparks: they are the regulated category.

**Hook (trigger → action → variable reward → investment).** The model describes products used daily. A home search happens once every few years; there is no habit to form and the variable-reward slot of a landing page is empty. The only honest investment is the dossier the client assembles. This is where the second and last "addiction" of this document is refused: it is the wrong frame for a once-in-years professional service and the precise behaviour the Digital Fairness Act is being drafted to restrict ([EP legislative train](https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act); [Dentons](https://www.dentons.com/en/insights/articles/2026/june/9/the-digital-fairness-act-dark-patterns-addictive-designs-and-influencer-marketing)). Replacement: resumption and ownership.

**Zeigarnik versus Ovsiankina.** "Unfinished tasks are remembered better" did not survive a 2025 meta-analysis; what holds is a robust tendency to resume interrupted tasks ([Ghibellini and Meier 2025](https://ideas.repec.org/a/pal/palcom/v12y2025i1d10.1057_s41599-025-05000-w.html); [overview](https://en.wikipedia.org/wiki/Zeigarnik_effect)). Design for resumption, not for nagging: a link that lands on the same ticket (`#checkin=`, already built) is the mechanic; "you left your check-in unfinished" emails are the one to refuse.

**Endowed progress and the goal gradient.** Car-wash cards with two free stamps on ten were redeemed by 34% against 19% for eight empty stamps, and the effect needed a stated reason for the head start ([Knowledge@Wharton on Nunes and Drèze 2006](https://knowledge.wharton.upenn.edu/?p=5630)); purchase accelerates as the goal nears ([Kivetz, Urminsky and Zheng 2006](https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf)). Form research gives the shape: fast early progress reduces break-off, slow early progress increases it ([Conrad, Couper, Tourangeau](https://rti.org/publication/effectiveness-progress-indicators-web-surveys-front-counts); meta-analysis: constant bars no effect, fast-to-slow helps, slow-to-fast hurts, [City Research Online](https://openaccess.city.ac.uk/id/eprint/14427/)). Translation: "n of 8 in hand" credits papers the person really holds (a passport is a genuine 1 of 8), says why it counts, and the first tap must visibly move the ticket. Never pre-tick, never invent a stamp.

**Foot-in-the-door.** Real but small (Freedman and Fraser 1966, [PubMed](https://pubmed.ncbi.nlm.nih.gov/5969145/); meta-analytic r about 0.17 per a secondary review, [atticusli](https://www.atticusli.com/replication-crisis/foot-in-the-door/) [unverified]). Three taps before the form is the right size of first ask; the escalation stays transparent: the answers prefill the door, nothing else.

**IKEA effect.** Self-made things are valued more, only if completed ([Norton, Mochon and Ariely 2012](https://dash.harvard.edu/handle/1/12136084)). The pass with the client's name and origin is their artifact; let them finish it in two optional fields, never gated behind the lead.

**Self-relevant feedback.** Moderate self-referencing raises persuasion when arguments are strong; too much backfires ([Burnkrant and Unnava 1995](https://ideas.repec.org/a/oup/jconrs/v22y1995i1p17-26.html)). The plan's "why" line that names the visitor's situation is the right dose. Guard against Barnum flattery: the rules are four and public; the FAQ "Which service is mine?" is derived from them, so the feedback is a rule, not a horoscope. §3.2 keeps the live ticket on the right side of that line.

**Peak-end.** Retrospective judgement tracks the worst moment and the end, not the duration ([Redelmeier and Kahneman 1996](https://synapsesocial.com/papers/W2038007153); randomised follow-up, n = 682, [York record](https://yorkspace.library.yorku.ca/items/1237abd1-7e5a-4a48-bb27-c6e37bac1c34)). The page's end is the OPEN or PAID board. Spend design there: who writes, when, what to prepare; and land the Stripe return on the same clear state.

**Variable reward.** Variable-ratio schedules give the highest, most extinction-resistant responding ([Ferster and Skinner 1957](https://www.bfskinner.org/wp-content/uploads/2015/05/Schedules_of_Reinforcement_PDF.pdf)). On a sales page there is no legitimate use. The honest variable reward exists after purchase: new listings each morning, the viewing report arriving. It belongs in the service, not the funnel.

**Identity artifacts.** Wrapped works because it reflects the user's own data back; the boarding pass does the same with declared answers only, honest by construction.

### 3.2 The live ticket as a rule: the partial-state policy

The first writing promised "plan and price on tap 1, refined on taps 2 and 3". Read against `cities/amsterdam.json` (identical rule shapes in the other four files, read 15 Oct), that promise is not implementable as stated: the rules are `{stage: zero} → full-search`, `{stage: found} → application-pack`, `{stage: shortlist, where: abroad} → attended-viewing`, `{stage: shortlist, where: here} → application-pack`; `when` never changes the plan (it only selects the note), and the steps are ordered `stage → when → where`. So a visitor who taps "I have a shortlist" has no plan until tap 3, and a ticket that showed one at tap 1 would be the horoscope §3.1 refuses.

**Decision: reorder the steps to `stage → where → when`, and make resolution a computed property of the rules.** With that order every path resolves by tap 2 (`zero` and `found` at tap 1, `shortlist` at tap 2), and tap 3 (`when`) only adds the note and, for `soon`, the refusal sentence. Nothing in the rules changes; the step order in `checkin.steps` changes, the hash slot order follows (§7.6), and the `whenNotes` keep their role.

| After tap | State | What the ticket shows | What it does not show |
|---|---|---|---|
| 1 (`stage`) | resolved (`zero`, `found`) | Plan, price, the plan's condition string (§7.5), the rule's "why" line, the refund rule on Full Search | The "when" note, the papers |
| 1 (`stage`) | unresolved (`shortlist`) | "Two plans fit, one more answer decides: Attended Viewing if you are abroad, Application Pack if you are here", both names, no price, no board flip | A plan, a price, a "why" line |
| 2 (`where`) | resolved, always | Plan, price, condition, "why", refund rule; the board flips once | The "when" note |
| 3 (`when`) | complete | Adds the note; for `soon` on `zero` the refusal sentence; the papers unfold | Nothing withheld |

Build rule to add: compute `resolvesAt(stage)` for every stage from `checkin.rules` and refuse a rule set in which any path resolves later than the second step, or in which the step that resolves it is not the second step of `checkin.steps`. The existing refusal (every stage × where must resolve, `build-cities.mjs:145-149`) stays. Test: for each of the three stages, the ticket text after tap 1 and tap 2 is pinned (`tests/cities/ui.mjs`), and a mutated rule set that moves resolution to the third step fails the build.

**Fallback if the founder keeps today's order** (`stage → when → where`): the unresolved state above persists through tap 2 for `shortlist` ("still two plans; the last answer decides"), and only tap 3 resolves. Honest, but the ticket is late for one visitor in three; the reorder is recommended.

### 3.3 The loop, step by step

| Step | What happens | Science it leans on | What makes it honest |
|---|---|---|---|
| Arrive | Search result, forwarded `#checkin=` link, an ad, a WhatsApp from a friend | Endowed progress (a partial deep link lands as "1 of 3 answered, from the link you received") | Head start only when real answers travelled; papers never travel on a shared link (§7.6) |
| Tap 1, 2, 3 | Where you are · where you are now · when you move | Fogg ability; foot-in-the-door at honest size | Three taps, no account, no email yet |
| Live ticket | Resolved on tap 1 or 2 per §3.2; the refund rule and the first fix print on it | Fast early progress; self-relevant feedback | Rules are public (JSON); the derived FAQ says the same; the unresolved state names both candidates and no price |
| Papers | The eight documents the city's landlord asks for; "n of 8 in hand", missing by name, what BOOM fixes first | Endowed progress on real items; goal gradient | Credit only what the visitor ticks; never pre-tick |
| Artifact | Pass (PNG 1080×1920) and link; share per card | IKEA (two optional fields, completion); identity artifact | User-declared data only; no account |
| Door | Free file, prefilled from the ticket; till as the second step on sell desks | One primary action | Equal-weight "Not sure yet"; total price, VAT, entity, Stripe, refund, condition string beside it |
| End state | OPEN or PAID: who writes, when (with timezone), what to prepare in the next 24 hours | Peak-end | Same screen on Stripe return; no second ask |
| Return | The same link; one email with the checklist if asked; the desk updates the checklist as papers arrive | Ovsiankina resumption | No reminder sequence; one desk-opening notice on waitlist desks, never a date |
| After purchase | Morning listings, viewing report PDF and video | The only honest variable reward | Lives in the service, not on the page |

### 3.4 ALLOWED versus BANNED, with citations and the basis

Scope first. DSA Article 25 binds providers of online platforms and carves out what the UCPD and GDPR already cover ([text](https://www.springlex.eu/en/packages/dsa/dsa-regulation/article-25/)); an Amsterdam court applied it in 2025 ([DLA Piper](https://www.dlapiper.com/insights/blogs/mse-today/2025/the-amsterdam-court-putting-the-dsa-into-practice)). A static service page is not a platform, so the operative rules are the UCPD (misleading actions and omissions, Articles 6 and 7; aggressive practices, Articles 8 and 9; the Annex I blacklist), the Consumer Rights Directive, their national transpositions and the ACM guidelines ([ACM guidelines, ICPEN copy](https://www.icpen.org/sites/default/files/2020-03/2020%20-%20acm-guidelines-on-the-protection-of-the-online-consumer.pdf); [2022 update](https://www.acm.nl/en/publications/acm-publishes-update-rules-regarding-online-deception)). **Nothing in this table cites DSA 25 as a basis for a static page.** Enforcement appetite: the Commission's 2022 study found a dark pattern on 97% of popular EU sites ([summary](https://deceptive.design/articles/behavioural-study-on-unfair-commercial-practices-in-the-digital-environment-dark-patterns-and-manipulative-personalisation)); the January 2023 CPC sweep found 148 of 399 shops non-compliant, 42 with fake countdowns ([IP/23/418](https://ec.europa.eu/commission/presscorner/api/files/document/print/en/ip_23_418/IP_23_418_EN.pdf)); the October 2024 Fitness Check priced the detriment at €7.9bn a year and names fake urgency and confirmshaming ([Arthur Cox](https://arthurcox.com/knowledge/eu-digital-fairness-fitness-check-shines-light-on-deceptive-patterns)) [figure from law-firm summaries]. The DFA is not yet proposed: consultation ran 17 July to 24 October 2025 and the work programme says Q4 2026 ([digitalfairnessact.com](https://digitalfairnessact.com/); [The European Post, Oct 2026](https://theeuropeanpost.eu/research-analysis/digital-fairness-act-targets-dark-patterns-before-2027/)). Build to the UCPD today and the page is already inside the DFA's likely perimeter.

| ALLOWED (with the condition that keeps it honest) | BANNED (rule and citation; statutory texts from memory until counsel pastes them, ledger L-series) |
|---|---|
| A real deadline stated as a fact ("the desk opens with partner X; we tell you the day"), only if the thing actually ends or changes | Countdown timers that reset or whose offer survives zero. UCPD Annex I point 7; ACM: timers "must have actual consequences", 41 resets found in the 2023 sweep ([ACM](https://www.acm.nl/en/publications/acm-confronts-online-stores-using-misleading-countdown-timers-their-practices)); Epic fined €562,500 in 2024 ([ACM](https://acm.nl/en/node/25515); [Stibbe](https://www.stibbe.com/publications-and-insights/game-over-for-dark-patterns-acm-fines-epic-for-unfairly-targeting)); LG Hanau 2025 ([vzbv](https://www.vzbv.de/urteile/mobilfunk-countdown-fuer-angeblich-befristetes-sonderangebot-war-irrefuehrend)); LG Bochum ([IT-Recht Kanzlei](https://www.it-recht-kanzlei.de/vorsicht-bei-countdown-angeboten-irrefuehrende-uhr.html)); LG Deggendorf 2026 went the other way where the clock claimed nothing about a later price, appeals pending ([shopbetreiber-blog](https://shopbetreiber-blog.de/lg-deggendorf-countdown-uhr-im-online-shop-allein-nicht-irrefuehrend)) |
| Capacity statements that are true and specific ("the Amsterdam desk takes N searches a month"), only if the cap is real and enforced | "Only 2 left" or spots counters without a real, specific basis. ACM: scarcity not based on actual availability "can turn into deception" ([ACM guidelines](https://www.icpen.org/sites/default/files/2020-03/2020%20-%20acm-guidelines-on-the-protection-of-the-online-consumer.pdf)); Booking.com had to confine "last room" claims ([commitments](https://www.hospitalitynet.org/external/4068258.html)). Brief v1's spots counter was right to go |
| Endowed progress on real items with the reason shown ("passport ✓, you hold 1 of 8") | Pre-checked boxes or preselection that bind a payment or consent. CRD Article 22 ([e-Justice](https://webgate.ec.europa.eu/e-justice/639/EN/consumer_rights_directive_201183)); preselection among the most common patterns in the 2022 study |
| One neutral decline ("Not sure yet · advise me", equal visual weight) | Confirmshaming ("No, I like overpaying rent"). Named in the Fitness Check; treated as a UCPD misleading or aggressive practice ([BEUC CPC alert](https://storage02.forbrukerradet.no/media/2025/06/beuc-l-2025-070-cpc-external-alert-on-unfair-commercial-practices-by-fast-fashion-trader-shein.pdf)) |
| Total price up front, VAT included, per plan, with its condition string (§7.5), and a free door beside the till | Drip pricing or fees revealed at checkout. UCPD Article 7(4)(c) (price inclusive of taxes in an invitation to purchase); Airbnb forced to show the total including service fees ([deceptive.design case](https://www.deceptive.design/cases/airbnb-s-assessment-by-the-consumer-protection-cooperation-network); [Euronews](https://www.euronews.com/my-europe/2018/09/20/airbnb-complies-with-eu-consumer-regulation-demands)) |
| A single factual resumption link (the hash URL; one email if asked for) | Nagging (repeated prompts for a choice already made). Basis: UCPD aggressive practices (Articles 8 and 9) and Annex I point 26, persistent and unwanted solicitations by remote media [text from memory, counsel to confirm]; among the top patterns in the EC 2022 study. Not DSA 25: that article does not bind this page |
| Genuine reviews attributed to Rome, linked to the real Google profile | Unattributed or inflated proof ("500+ housed" on an Amsterdam page without "in Rome"): UCPD Article 6, misleading as to the trader's attributes and track record |
| A boarding pass or share that carries only user-declared data | False "time-limited" framing of a standing price ("today only" when €500 is the list price): Annex I point 7 as read in the [Maastricht chapter](https://pubpub.maastrichtuniversitypress.nl/pub/chapter-6-dark-patterns-as-infringements-of-eu-consumer-law); DGCCRF classes countdowns and urgency messages as dark patterns and can refer to the prosecutor ([DGCCRF dossier](https://www.economie.gouv.fr/files/files/directions_services/dgccrf/documentation/publications/dossier_de_presse/dossier-de-presse-dgccrf-e-commerce.pdf)); French penalties for misleading practice reach two years and €300,000 ([Kohen Avocats](https://kohenavocats.fr/2026/05/07/amende-dgccrf-pratique-commerciale-trompeuse-controle-ddpp-recours/)) |
| A dated market norm as comparison ("one month's rent + 21% VAT is the Amsterdam norm, source, date") | Comparative claims that name a competitor or are undated [counsel to confirm the national comparative-advertising rules] |

**Counsel items, with an owner and a date.** Owner: the founder engages counsel (one firm per desk country, or one EU firm with correspondents); deadline: closed before the first `live:true` of any desk, and the closure recorded in the brief (v1.3). Items: (1) verbatim text of UCPD Annex I points 7 and 26 and Article 7(4)(c), and the transpositions (NL BW 6:193a ff., FR Code de la consommation L.121-2 and L.121-4, DE UWG §5 and Anhang, ES LCD); (2) CRD Articles 7(3), 8(8), 16(a) and 22 for a till that sells "the work starts today" to a consumer abroad: the checkout sheet must carry the express request to begin within the withdrawal period and the acknowledgement of losing the right once the service is performed; (3) Rome I Article 6(1) and (2): the consumer's home-country mandatory rules may apply to an Italian trader directing activity there, per desk; (4) the comparative-advertising rule per country for the market-norm line; (5) the VAT place of supply for a property-related service rendered in NL, ES, FR or DE by an Italian S.r.l. to consumers (brief §4 open item; the commercialista, not counsel), which decides whether "VAT included" means 21%, 22% or another figure on each desk; (6) the EDPB 2/2023 reading of `localStorage` for the one write in §5.4. The gap-fill pass reproduced the statutory texts from memory as drafts for counsel to replace from the ELI links (`http://data.europa.eu/eli/dir/2005/29/oj`, `http://data.europa.eu/eli/dir/2011/83/oj`, `http://data.europa.eu/eli/reg/2008/593/oj`); they are not reproduced here because a draft in a design study tends to become the text nobody checks.

### 3.5 Honest proof BOOM already owns, and the proof assets that do not exist yet

Owned today:
1. The refund rule, verbatim, wherever money is taken, and nowhere weaker (`checkoutCopy.fine` in the sell-desk JSON, the FAQ, the Stripe product `CITY_PLANS`).
2. The entity: Egidi Immobiliare S.r.l., P.IVA 17322991005, REA RM-1710623, EUTM 019317594 (`cities/_shared.json`). Printed, it is the anti-"generated site" signal.
3. The tenant-only structure as a legal fact in the Netherlands (BW 7:417(4), ACM enforcement, citations in §1.5, counsel to confirm).
4. Rome reviews and "500+ housed": true, but printed in every city hero without origin. Label them "in Rome since 2020" or move them to a "Born in Rome" strip. On a Berlin page unlabelled they read as Berlin track record.
5. Framing without a city track record: say the true thing ("First desk: Rome, 2020. Amsterdam desk: opened [month]. Same rules, written down."), the executive study's lesson ("Serving" became "Built for" until there were real clients).

**Proof assets v2 depends on and that do not exist in the repo** (brief §9 assigns copy to the founder; without these the proof block of v2 can be neither built nor tested):

| Asset | Why v2 needs it | Owner | Needed by |
|---|---|---|---|
| A sample written viewing report (a real Rome viewing, anonymised, labelled "sample · Rome") as a PDF under `/assets/samples/` | The one proof that moves a €500 decision (§4.1.5, principle 5); Attended Viewing is sold on it | Founder (content), engineer (page) | Before the design freeze that ends task #8 |
| A sample dossier in the Dutch format (a template with placeholder data, labelled "template") | Shows what "Dutch-format dossier in 24 hours" produces; the Application Pack is sold on it | Founder | Same |
| The named person per desk, and the decision on a photograph | Non-negotiable 11; the anti-fake-site signal (§1.5 item 5) | Founder (Q2) | Same |
| The Google profile link for "4.9 · 47" (`REVIEW_URL` exists in env for Rome; nothing on the city pages links it) | A rating that cannot be clicked is an assertion; linked and labelled "Rome" it is proof | Engineer, one line in `_shared.json` | Task #9 |
| The real month for "Amsterdam desk: opened [month]" and the equivalent line per waitlist desk ("opening with partner X") | Honest framing without a city track record (item 5 above) | Founder (Q12) | Before the first `live:true` |
| Two real testimonials (brief §5.11) or the explicit decision to ship without them | Brief acceptance says placeholders block a `live:true` build | Founder | Before the first `live:true` |

---

## 4. The page as it is

Method: four full-page captures (390 and 1440, Amsterdam and Barcelona, `scratchpad/current/`, misleading at 1440 for the reason in §2.4), the built HTML, `assets/boom-city.css` (40,140 bytes), `assets/boom-city.js` (40,316 bytes), the five `cities/*.json`, and three headless-Chromium runs by the critique pass (Android UA, 390×844, Lighthouse's slow-4G preset of 150 ms RTT and 1.6 Mbps plus 4× CPU; scripts and outputs in `scratchpad/critique/`). Numbers below are measured there unless a repo line is cited. These are the only numbers in this document that are not snippets.

### 4.1 Top 10 problems, by conversion impact

1. **The Check-in result is unreachable after the tap.** `show()` sets `stepsBox.hidden = true` (`assets/boom-city.js:393`), but `.ck-steps{display:grid}` (`assets/boom-city.css:321`) outranks the UA `[hidden]` rule; there is a `.ck-step[hidden]` rule (`:323`) and none for `.ck-steps`. Measured after "Show my plan": `#ckSteps` has `hidden=true`, computed display grid, height 1,021 px; the ticket lands at y = 1,249 in an 844-px viewport because `root.scrollIntoView` (`:396`) parks the viewport on the answered steps. The visitor taps the gold button and sees the questions they just answered (`scratchpad/critique/after-show-390.png`, `ticket-390.png`). The suite is green because `vis()` (`tests/cities/ui.mjs:407`) returns false as soon as `e.hidden` is true and never reaches its computed-style clause for `#ckSteps`. Second defect in the same block: `#checkin` has no `scroll-margin-top` (only `section[id],#contact`, `css:48`), so after the scroll the block's header sits under the 125 px of fixed chrome. Fix: `.ck-steps[hidden]{display:none}`, a `scroll-margin-top` on `#checkin`, and a test that measures `getBoundingClientRect().height`, not the attribute.
2. **The order is inverted.** The form asks "What do you need?" with priced chips at about y = 975 on the phone, while the diagnostic built to answer that question sits at y = 2,497, three screens lower, 293 px tall, 39 words, under a 9.5-px eyebrow at 2.2:1 contrast. A stranger self-diagnoses between €500, €199 and €149 before any evidence of competence.
3. **No action is visible in the first phone viewport.** Fixed chrome is 125 px (nav 77 + family strip 49); the submit button sits at y = 1,195 to 1,266; the nav CTA lives inside the burger; the pay bar is suppressed until the hero leaves (y > 1,394). On a real first visit the consent card lands over the name and email fields at about 0.7 s (`js/boom-consent.js` opens 700 ms after DOMContentLoaded).
4. **The two facts that must be read instantly are animated into illegibility.** The city word reads "AL", "AMRS", "AMSTEQC" and settles 1.98 s after navigation start (2.27 s at 4× CPU), then re-spins every 19 s (`assets/boom-city.js:53`); each price board takes about 1 s to settle when a plate enters view. One board once is delight; six boards plus a ticket board plus OPEN/PAID reads as a slot machine. 22 animations run at rest, 41 after the Check-in result; the idle frame cost is fine (16.6 ms average at 4× CPU, no long frames), so this is an attention problem, not a GPU one. Third-party auto-captures can catch the mid-roll frame: `fold-1440.png` reads "AMSTERDAL".
5. **Trust is thin.** Zero `<img>`; "4.9 on Google · 47 reviews" is a `<span>`, not a link; "500+ internationals housed" is Rome's number without "in Rome"; no face, no name on screen (Valentino Egidi exists only in the JSON-LD); no operator card or testimonial, which brief §5.10 and §5.11 required; no sample of the deliverable (§3.5 table). The pulsing green dot and "OPERATIONAL" are status-page semiotics on a static file.
6. **The mobile pay bar is a €500 demand following a cold visitor.** From y > 1,394 to the footer it sells the FEATURED plan regardless of the Check-in verdict or the chosen chip; with nav and family strip, 192 px (23%) of the screen is fixed chrome while reading the six checks or the FAQ. It is not a dark pattern (no timer, no scarcity) but it is the only persistent action, and the free "Open my file" has none.
7. **Eight labels for one act.** "Start my search", "Start my search · €500", "Start →", "Pay & start", "Pay & start now", "Open my file", "Show my plan", "Get the pack" / "Book a viewing", against R1 of the conversion study (one label everywhere); at 1440 the same label appears three times on one screen (verified, §2.1).
8. **Micro-type carries meaning at 2.2:1.** `--t4` (white at .26) measures 2.18:1 on `#060607` and is used for the refline (9 px, `css:86`), the machine line (9.5 px, `css:158`), "FLAT · INCL. VAT" (10 px, `css:183`), the consent line and its WhatsApp link (10.5 px, `css:126`; the link box is about 50×13 px), the ticket code, the pass labels (8 px), `.flow .at` (9 px, `css:227`). 38 targets are under 44 px at 390 (`.ck-opt` 37 px, plate buttons 36 to 43 px, family pills 32 px, share pills about 30 px, consent links 13 px). The H1's accessible name is polluted by drum letters because the `aria-label` sits on a `<span>` without a role and the `<b>` cells are not `aria-hidden`.
9. **Card soup.** About 30 bordered boxes on one phone page, five of them gold-bordered "most important" things (file card, Check-in, featured plate, ticket, truth band); 9,123 px tall (10.8 viewports), 1,148 words at 390. The type stack ships zero web fonts (`document.fonts` is empty); on Android none of Helvetica Neue, Helvetica, Inter or SF Mono exist, so the 100 and 200-weight hierarchy and the monospace "technical layer" are Apple-only effects.
10. **Waitlist desks are priced like shops with the shutters down, and one of them states the wrong fee rule.** Honest in words ("charged only when the desk opens", `CHECKOUT:false`, the server refuses) but wrong in weight: three price boards, priced chips and a priced ticket on a desk that cannot sell; "Ask for a viewing" on a desk that cannot legally attend one; "opening with a registered local partner" with no partner name, no horizon, and no answer to "what do I get today" above the FAQ. And Berlin, read in `cities/berlin.json` on 15 Oct: the plate line for Full Search says "flat · incl. VAT · on signing" (correct, WoVermRG §2 and §3 as brief v1.1 states it), but `form.service.priceNote` under the chips and `checkin.result.ctaFileSub` on the ticket both say "charged only when the desk opens" for every plan, Full Search included. Two surfaces state a fee rule that the statute makes different. §7.5 fixes the class, not the instance.

### 4.2 Top 10 assets to keep

1. **Weight and speed.** 7 requests, 203.8 KB uncompressed, 62 KB gzipped first-party (measured in this repo today with gzip -9: `amsterdam.html` 22.3 KB, `boom-city.js` 12.2 KB, `boom-city.css` 10.3 KB), zero web fonts, zero images in the document; throttled FCP 1.10 s, LCP 1.40 to 1.91 s, CLS 0, TBT under 200 ms (two runs by two passes; gtag was blocked in both).
2. **Legal and voice hygiene.** No counters, timers or pre-checks; the refund stated; a waitlist desk cannot charge by construction (build and server both refuse).
3. **The Check-in rules engine**, one copy for UI, FAQ and schema (`checkin.rules` in each JSON; the build refuses a stage × where that does not resolve, `build-cities.mjs:145-149`; a hand-written answer on the derived FAQ item is refused, `:208`).
4. **URL-carried state** (`#checkin=stage.when.where.docs`) and native share with a file (`canShare → share → download`, `boom-city.js:534-552`).
5. **The six checks and "what's wrong with it"**: the law facts, in the landlord's vocabulary.
6. **The file card's discipline**: autocomplete, human error copy, no third-party form service, "Prefer to talk first? Open a file, no payment" in the checkout sheet.
7. **Real no-JS and reduced-motion paths** (1,095 words without JS, prices as text, the Check-in and the rail hidden by `<noscript>`, `cities/_template.html:51`, pinned by `tests/cities/run.mjs:726` and `ui.mjs:542`).
8. **The a11y scaffolding**: skip link, fieldset and legend per step, focus-visible rings, `aria-live` result, 48-px inputs, 56-px chips, 16-px inputs on coarse pointers.
9. **The GEO plumbing**: FAQPage from the visible FAQ, Offers with the VAT flag and `audience` from the rules, Organization with VAT ID, the fact sheet, `areaServed` derived from the live desks.
10. **The brand**: gold on black, the lockup, the pass craft (real mark via `Path2D`, 1080×1920).

### 4.3 The delete list, and what it touches in the brief

Deletions that touch nothing in the brief: `.machine` route line · `.tline` strip · `.serving` · `.refline` · the pulsing dot and eyebrow (the lockup says it twice already) · `.fam` strip on the phone · `.rail` · `.scroll-progress` · mouse glow, orbs, grain · the drum's 19-second re-spin · the duplicated price in plate buttons · "Gate", "Seat", "Status", the barcode, "Flying in from" on the pass · the `#method` truth band (fold its four flags into the six checks) · the visible fact sheet (keep for machines, collapse for humans) · the bottom band (a second hero) · FAQ "I'm moving from Rome with BOOM" · Barcelona's "Ask for a viewing".

Deletions that **amend the brief or the suite and need the founder's sign-off** (v1.3): the three plate price boards (brief v1.2 describes "the price on its own Solari board" for the ticket and CLAUDE.md records the plates' boards; `tests/cities/run.mjs` checks that every price sits on a board and in its chip). The proposal is prices as text on the plates, the board kept on the ticket and the two end states; the price line, the chip, the fees row and the schema stay exactly where v1.1 put them. Q4.

### 4.4 What a 2026 visitor expects and does not find

Feedback while typing; a month picker for move-in (today `<input id="fMoveIn" name="moveIn">`, a free-text field with the placeholder "February 2027", `cities/_template.html:150`); a saved draft or return path beyond the Check-in hash; a WhatsApp-first door for a WhatsApp-native audience (today a 13-px link); a bookable 20-minute call (step 1 of the product has no calendar; the viewing engine `api/viewings/_avail.js` already books slots for Rome); a sample report; "the next 24 hours" before committing, not only after; a daylight-readable mode (`color-scheme: dark` only); a human.

---

## 5. The tech and motion menu, with verdicts and the performance budget

Support data was read from MDN `browser-compat-data` (8.1.6, published 15 Oct 2026) and `web-features` (3.43.0, published 15 Oct 2026) on `raw.githubusercontent.com`, the two hosts that answered, plus a caniuse data snapshot saved on 13 Oct (regions 2026-09); library sizes were measured on the npm tarballs with gzip -9; timings on the built `amsterdam.html` in headless Chromium at 390×844 under Lighthouse's mobile profile (4× CPU, 150 ms RTT, 1.6 Mbps, [Lighthouse throttling docs](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md)). Regional percentages are the technology pass's own computation from caniuse region files, not figures caniuse publishes [unverified at the tenths]. Two corrections from the gap-fill verification against primary data are applied below: the same-document View Transitions Baseline date is 14 Oct 2025 (the Firefox 144 release date in BCD; `web-features` `baseline_low_date: 2025-10-14`), not 16 Oct; and Firefox 159, the first Firefox with scroll-driven animations in BCD, is beta with a release date of 27 Oct 2026, so `web-features` still lists the feature as `baseline: false` with no Firefox entry.

### 5.1 What the page costs today

- First-party, compressed: HTML 22.3 KB (Solari engine and scroll contract inlined), CSS 16.2 KB (`boom-2026` 6.0 + `boom-city` 10.3), JS 19.9 KB (`boom-city` 12.2 + `boom-track` 5.0 + `boom-consent` 2.7), favicons 3.8 KB: about 62 KB. The only third party is `gtag/js`, consent default denied; its size could not be measured here [unverified, commonly around 100 KB gzipped].
- Throttled: DCL 1.40 s, LCP 1.40 s (text), CLS 0.000, 975 DOM nodes, three long tasks (112 + 195 + 55 ms), script 57 ms against layout 397 ms and style recalc 303 ms. The cost is rendering (split-flap cells and a long single page), not JavaScript.
- Check-in taps: under 25 ms each.
- `passBlob()` (`boom-city.js:515`, 1080×1920 canvas to PNG): 388 ms on the main thread throttled, 106 ms unthrottled, output 860 KB. The one interaction that can breach INP's 200 ms line on a mid-range phone. Chromium can encode WebP from a canvas; Safari cannot and silently falls back to PNG ([BCD HTMLCanvasElement](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLCanvasElement.json)).

### 5.2 The budget to design against, with the font inside or outside it stated

Core Web Vitals at the 75th percentile: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 ([web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds)) [unverified, host blocked; standard figures]. Lighthouse's mobile profile is "roughly the bottom 25% of 4G". Alex Russell's budgets (about 150 KiB HTML, CSS and fonts plus 300 to 350 KiB JS in 2023; about 100 KiB JS for a markup-heavy page at a 5 s target in 2024) are the right frame ([2023](https://infrequently.org/2022/12/performance-baseline-2023); [2024](https://www.infrequently.org/page/2/) [snippet only]).

Hard budget for v2, two numbers so the test can pin one of them depending on the font decision (Q10): **≤ 90 KB gzipped first-party total without a web font; if the optional Inter Variable latin file ships, it has its own cap of ≤ 50 KB and the total cap becomes ≤ 140 KB.** In both cases: ≤ 30 KB gzipped first-party JavaScript, no image in the critical path, no long task over 100 ms after load, every interaction under 100 ms of main-thread work, CLS 0. The page today (62 KB) sits inside the no-font budget; 62 + 48.3 = 110.3 KB sits inside the with-font budget. Brief §8's Lighthouse targets (≥ 95 / 100 / 100 / 100, total weight under 400 KB) remain.

### 5.3 The menu

**Tier A: use now, 0 kB, engines already shipped or native.**

| Item | Support | Use for | Fallback |
|---|---|---|---|
| Scroll-driven animations (`animation-timeline: view()`) | Chrome 115, Safari 26; Firefox from 159, **beta at the time of writing (release 27 Oct 2026), so not Baseline** ([BCD animation-timeline](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/animation-timeline.json); [BCD firefox.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/browsers/firefox.json); [web-features](https://raw.githubusercontent.com/web-platform-dx/web-features/main/features/scroll-driven-animations.yml.dist)); about 88% global, 86 to 93% in the five markets (snapshot); WebKit's compositor-thread note for 26.4 [unverified, webkit.org blocked; only the 26.4 release date, 24 Mar 2026, is in BCD] | Entrances; extend to the Check-in meter | **Mandatory, not optional**: `@supports (animation-timeline: view())` plus the IntersectionObserver reveal already in `boom-city.js` |
| Same-document View Transitions | Chrome 111, Safari 18, Firefox 144; **Baseline newly available since 14 Oct 2025** ([web-features](https://raw.githubusercontent.com/web-platform-dx/web-features/main/features/view-transitions.yml.dist)); 92.9% global in the 13 Oct caniuse snapshot, 95 to 97% in-market. The `types` option reached Baseline only on 13 Jan 2026 (Chrome 125 / Firefox 147 / Safari 18.2) and `view-transition-name: match-element` needs Chrome 137 / Safari 18.4: use the plain `startViewTransition(callback)` form | Step → ticket → pass; OPEN/PAID end states; ≤ 300 ms, scoped to the Check-in card | Feature-detect `document.startViewTransition` and fall back to a plain DOM update; off under reduced motion |
| Cross-document View Transitions | Chrome 126, Safari 18.2, Firefox partial ([BCD view-transition at-rule](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/view-transition.json)) | Maybe: Amsterdam ↔ Madrid ↔ home | Pure CSS at-rule; nothing else |
| `@property` typed custom properties | Chrome 85, Safari 16.4, Firefox 128; about 95.5% ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/property.json)) | The "n of 8" meter, a price count-up, the gold lamina as numbers in CSS, no JS counters | Final value renders statically |
| `:has()`, size container queries | About 95.9% and 95.8% (snapshot) | File card, ticket and plates respond to their column at 1440 (§7.1 composition) | Viewport queries |
| `<dialog>`, `popover` | 97.1%; 93.6% with iOS light-dismiss fixed in 18.3 ([BCD global attributes](https://raw.githubusercontent.com/mdn/browser-compat-data/main/html/global_attributes.json)) | Replace the hand-rolled `#ov` checkout sheet with `dialog.showModal()` (free focus trap, Esc, inert backdrop); popover for "Copy link / WhatsApp" | Current class toggle |
| `content-visibility: auto` | Chrome 85, Safari 18, Firefox 125; about 94.4% | FAQ, fact sheet, footer with `contain-intrinsic-size`: it cuts exactly the layout and style cost the trace shows | Nothing happens; test that it does not fight the reveal observer |
| `Intl.DateTimeFormat` | Effectively universal ([MDN source](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/view_transition_api/index.md) is the only MDN page opened today; the Intl page was not, standard API) | An origin-clock / desk-clock line ("it is 21:40 where you are; the desk writes between 09:00 and 19:00 CET"), paired with the Check-in's "where are you now" and overridable | Static CET window |
| CSS over Web Animations API | Both about 97% | CSS by default; `element.animate()` only to pause, reverse or scrub the drum and the plane | n/a |
| **`<input type="month">`** (the control §4.4 and §7.7 add; new row) | **Desktop Firefox: never implemented (`version_added: false`, bugzil.la/888320); desktop Safari: the type is recognised but there is no month-specific control; Chrome 20, Edge 12, iOS Safari ≤ 11.3, Firefox Android 18** ([BCD input/month](https://raw.githubusercontent.com/mdn/browser-compat-data/main/html/elements/input/month.json)). MDN's own page source: in unsupporting browsers "the control degrades gracefully to `<input type="text">`" and support is "patchy, with only Chromium browsers on desktop and mobile browsers having usable implementations" ([mdn/content](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/html/reference/elements/input/month/index.md)) | Not as the move-in field: on the laptop-heavy German and French desks (§1.4) a `type=month` is a text box in Safari and Firefox whose value is not normalised to `YYYY-MM` | **Decision: a `<select>` of the next 18 months (value `YYYY-MM`, label "February 2027"), native on every platform; `type=month` is not used.** Server consequence in §7.7 |

**Tier B: use with the fallback already in place.**

| Item | Support | Verdict |
|---|---|---|
| Web Share with files | About 93% global, 91 to 97% in-market; absent in Android WebView (in-app browsers) and Firefox desktop; needs transient activation ([BCD Navigator](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json)) | Keep `canShare → share → download`, keep "Copy link" as the universal path |
| Speculation Rules (prefetch) | Chromium only, about 75%; Safari behind a flag ([BCD script](https://raw.githubusercontent.com/mdn/browser-compat-data/main/html/elements/script.json)) | Prefetch sister cities and home with `eagerness: moderate`; `<link rel=prefetch>` fallback; no prerender (double-counts analytics, wastes 4G data) |
| OffscreenCanvas + Worker for the pass | Chrome 69, Safari 16.4, Firefox 105; about 96% | Use: moves the 388 ms encode off the main thread; about 1 kB; synchronous path behind a busy state as fallback |
| `navigator.vibrate` | Chromium and Samsung only, about 76%; never on iPhone, disabled on Firefox Android ([BCD Navigator](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json)) | At most one 10 ms pulse when the ticket resolves; it can never carry meaning |
| `size-adjust`, `font-display` | 95.6% / 97.2% ([BCD font-face](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/font-face.json)) | Only if a web font ships (§5.5) |

**Tier C: avoid for this page.**

| Item | Measured cost | Why not |
|---|---|---|
| Lottie / dotLottie / Rive | `lottie_light.min.js` 46.4 KB gz (full 76.1 KB); dotLottie-web 32.9 KB JS + 496 KB WASM; Rive canvas-lite 109 KB JS + 315 KB WASM ([lottie-web 5.13.0](https://registry.npmjs.org/lottie-web/-/lottie-web-5.13.0.tgz); [dotlottie-web 0.81.0](https://registry.npmjs.org/@lottiefiles/dotlottie-web/-/dotlottie-web-0.81.0.tgz); [rive canvas-lite 2.44.2](https://registry.npmjs.org/@rive-app/canvas-lite/-/canvas-lite-2.44.2.tgz)) | Each is 0.75 to 7 times the whole page; the plane, the tick and the lamina already exist in 1 to 3 KB of SVG and CSS |
| three.js / WebGL / WebGPU | three 0.186.1 WebGL build 189 KB gz, WebGPU build 296 KB gz ([three 0.186.1](https://registry.npmjs.org/three/-/three-0.186.1.tgz)); WebGPU about 86% plus 4% partial, iOS only from 26 (snapshot) | The founder's "3D" is already delivered by `perspective` + `rotateX/Y` + `preserve-3d`, 0 kB, off on touch and under reduced motion; brief v1.2 reached this conclusion and the numbers confirm it |
| Badging API | Installed web apps only; no Android Chrome ([BCD Navigator](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json)) | Real reach is the handful who install the page |
| Service worker offline | 97% support, but the city pages do not register `sw.js`, and the artifact that must survive offline (the pass) is already a PNG in the camera roll plus a URL that carries the state | Maybe later, if the brief §9 guides ship and are worth caching |

### 5.4 Storage, consent and the honesty constraints

ePrivacy Article 5(3) is technology-neutral: EDPB Guidelines 2/2023 v2.0 (7 Oct 2024) cover storage in terminal equipment generally, which includes `localStorage` ([EDPB](https://www.edpb.europa.eu/documents/guideline/guidelines-22023-on-technical-scope-of-art-53-of-eprivacy-directive_en)) [exact wording not opened, counsel item 6]. Session-scoped state for the step the visitor is completing is defensible under the "strictly necessary" exemption; persisting answers for days so the page "remembers you" is a convenience that would need an unticked opt-in. The cleanest answer is the one already built: the state lives in `#checkin=`, the link is the memory, nothing touches the device. Today's code writes `boom:consent` (exempt, it records the choice, `js/boom-consent.js:12`), `boom:source` and `boom:sid` only after consent (`js/boom-track.js`), and one purchase-deduplication key `boom:paid:<session>` in `localStorage` on the `?paid=` return (`assets/boom-city.js:253-254`) regardless of consent state. Audit that last write: either gate it on consent or move it to `sessionStorage` (a double-counted `purchase` on a refresh within one session is the only thing it prevents).

### 5.5 Fonts: what Android actually renders

Helvetica Neue exists only on Apple systems. AOSP's `fonts.xml` aliases `helvetica` and `arial` to `sans-serif`, which is Roboto ([AOSP fonts.xml](https://github.com/aosp-mirror/platform_frameworks_base/blob/main/data/fonts/fonts.xml)); Windows gets Arial unless Inter is installed. The measurable fact: the page ships zero web fonts, and the 100 and 200-weight hierarchy depends on whatever thin cuts the device has [how a given Android build renders weight 100 is unverified]. Options: (a) accept it, 0 KB, current; (b) ship Inter Variable latin, measured 48.3 KB woff2 (static 300/400/500 about 24 KB each, [@fontsource-variable/inter 5.3.0](https://registry.npmjs.org/@fontsource-variable/inter/-/inter-5.3.0.tgz)), self-hosted under `/assets`, preloaded, `font-display: swap`, with a `size-adjust` fallback face tuned to Roboto so the swap keeps CLS at 0. Verdict: founder's call (Q10), with the two budgets of §5.2 ready for either answer; never Google Fonts on the critical path. Independent of the choice: no weight below 300 on the phone, and the monospace "technical layer" either ships a face or stops pretending.

### 5.6 Images and the pass

The document ships no images and should stay that way; if photos ever arrive, `<picture>` AVIF then WebP. For the pass: sniff `blob.type` after `toBlob('image/webp')` (Safari returns PNG silently), or encode JPEG at q0.92 where the design has no alpha; move the export to a Worker; keep the save-or-share split. The two sample PDFs of §3.5 are documents, not images, linked and not inlined.

### 5.7 What v2 takes from this menu

Keep every 0 kB engine in place; add `@property` counters, `<dialog>` for the till, `content-visibility` below the fold, a scoped same-document view transition on the Check-in, prefetch rules for sister cities, a Worker for the pass, an optional origin-and-desk clock, a native `<select>` for the move-in month. Reject libraries, WebGL and WebGPU, badges, vibration as meaning, device-persisted state, `type=month`. Net effect: about +2 to 4 KB gzipped, fewer long tasks, INP under 200 ms on the one interaction that breaks it today.

---

## 6. Design principles for v2

1. **The diagnostic is the hero.** Three taps before any form field: the visitor's first question is "which service, what does it cost", and the page should answer it before asking anything (§4.1 problem 2; Fogg ability). This amends brief v1.2's placement of the Check-in inside section 02; the amendment and its consequences are declared in §7.1 and Q1.
2. **The ticket is alive from the first tap, as a rule.** Resolved on tap 1 for `zero` and `found`, on tap 2 for `shortlist`, never a guess in between (§3.2); nothing waits for the end (Noom's one honest lesson; fast early progress reduces break-off).
3. **One label, one door, one till.** The free file is primary and prefilled; the till is a second step for the decided; the label is identical in nav, ticket, plates, sheet and pay bar (R1; §4.1 problem 7).
4. **Price never travels alone.** Beside every €500: VAT included, Egidi Immobiliare S.r.l. and P.IVA, Stripe, the first-call refund, and the plan's condition string on a waitlist desk (§1.6; §7.5; UCPD 7(4)(c)).
5. **Proof before promise, and proof that is a mechanism.** A named person, the entity, the law fact ("in NL dual fees are illegal: BW 7:417(4)"), a sample report, two or three dated market numbers with their opened source; never an adjective (§1.5; §2.3 items 5 and 6; §3.5 table for what must exist first).
6. **Rome is Rome.** Reviews and "500+ housed" labelled with their city, linked to the real profile, or moved to a "Born in Rome" strip (§3.5).
7. **Credit only what is real.** The ticket moves for a paper the visitor holds; no pre-ticks, no invented stamps, no head start without a reason (§3.1 endowed progress).
8. **The visitor owns the artifact.** Pass and link complete in two optional fields, never gated behind the lead, shareable per card, regenerable from the URL, no account (IKEA effect; Wrapped).
9. **The URL is the memory.** State in `#checkin=`, nothing on the device beyond the session; one resumption link, no reminder sequence; papers never travel on a shared link (Ovsiankina; ePrivacy 5(3); §7.6).
10. **Motion is feedback, never decoration.** A board flips once, when a fact changes under the visitor's hand (ticket resolves, file opens, payment lands); the city word is legible at first paint; nothing re-spins; one thing moves at a time (§4.1 problem 4).
11. **The landlord's vocabulary, glossed once; English only in v2.** werkgeversverklaring, SCHUFA, nómina, aval, Visale printed as the landlord prints them. ES and FR versions of Madrid, Barcelona and Paris are wanted (§1.1) and not in v2: brief §8 says EN only and no hreflang; a static build with one JSON per city has no `?lang=` path, so a second language is a second JSON per desk (`cities/<slug>.es.json`) built to a second page (`/<slug>/es`) with an `hreflang` pair, its own FAQPage and Offers, its own word-budget run (the ceilings hold per language or the test fails) and about 1,100 words of copy per desk written by the founder (brief §9), roughly 3,300 words for three desks, plus `llms.txt` and `sitemap.xml` entries. That is a project, not a toggle; it opens after the first measured month (Q6).
12. **Depth lives where it does not weigh.** Six checks as tiles with detail on tap, FAQ folded, fact sheet collapsed for humans and whole for machines; the word budgets hold (§2.3 item 9; brief R3).
13. **The end is designed.** OPEN and PAID say who writes, when (with timezone), what to prepare in the next 24 hours; the Stripe return lands on the same state (peak-end).
14. **A waitlist desk sells what exists today, and prints its prices where the brief says, with their condition.** The hero leads with the file, the dossier readiness and the six checks; the chips, the plate price line, the fees row and the schema keep their list prices (brief v1.1); each price carries its own condition string, Berlin's Full Search "due only once you sign a lease" (§7.5); the Solari boards move to the ticket only, which is a brief v1.3 item (Q4).
15. **Phone-first, laptop-whole.** Designed at 390 on a throttled Android, then composed for 1440 with container queries (§7.1); no desktop-only decoration (tilt, orbs, rail, glow) that a thumb never sees (§1.4; §4.3).
16. **Nothing ships that the suite cannot see.** Every rendering claim is tested by geometry (`getBoundingClientRect`), not by attribute; the reveal is tested at 1440×900 with a scroll (§2.4); the capture pipeline scrolls before `fullPage` (§4.1 problem 1).
17. **Nothing ships that nobody opened.** No external statistic on a page without an opened source, a date and an entry in the ledger (§10.0); the build refuses a `live:true` page whose stats lack `verifiedAt`.

---

## 7. Candidate experience architectures

Three architectures, described so they can be judged. Each keeps the brief's eight-block ceiling, the GEO plumbing, the no-JS and reduced-motion paths, the budgets of §5.2 and the condition strings of §7.5. Each states its first screen at 390 and at 1440, where the Check-in and the form sit, what persists, what is shared, what moves, what it amends in the brief and in the suite, and its risks. The judge panel (task #8) decides; the recommendation closes the section.

### 7.1 Architecture A: the diagnostic is the hero

**First screen, 390.** Lockup `BOOM | AMSTERDAM · TENANT SIDE` (the family strip gone from the phone), a static H1 with the city word legible at first paint, one line of lead (≤ 20 words), then the first Check-in question as the first interactive element: "Where are you in the search?", three chips. Under it, in 10.5 px that passes 4.5:1, the proof line: "Tenant-side only, by Dutch law (BW 7:417(4)) · Egidi Immobiliare S.r.l. · Born in Rome, 4.9 on Google there". A single quiet link "Skip the check-in, open a file" for the visitor who wants to write. The ticket card appears under the chips on tap 1 (resolved or "two plans fit", §3.2) and pushes the proof line down; the viewport follows the ticket by `scrollIntoView` only when it would otherwise be out of view, measured by geometry.

**First screen, 1440.** A 12-column grid on a 1,080-px content width (the Vercel reference the conversion study already follows: 1080 grid, 360-px columns). **Left column, 7 of 12 (about 600 px): the lockup, the static H1, the lead, the three Check-in steps shown one at a time as a 3-up chip row, then the papers after the resolving tap.** **Right column, 5 of 12 (about 432 px), sticky from the top of the hero while the left column unfolds: the ticket card** (plan, price board, condition string, the "why" line, the refund rule, the meter once the papers exist), and **directly under it the door**, three fields (name, email or phone, move-in month select) with the chosen plan as a read-only line and "change", one gold action, the equal-weight "Not sure yet" line. The proof line spans the full width under both columns. There is one action on the screen: the door's. The nav carries the same label as a text link, not a button; the rail is gone. On tap 1 the ticket flips once; nothing on the left re-renders except the step. Container queries size the ticket and the door to the 432-px column; below 880 px the two columns stack in the 390 order.

**Order of blocks.** 1 Hero = Check-in + ticket + door (the door keeps `id="contact"`) → 01 How it works, three steps with the person's name and the CET window → 02 Services and fees: three plates as text (price, condition string, four ticks, the refund line on Full Search; boards only if Q4 says so) → 03 Before you sign: six checks as bento tiles with the truth band's four flags folded in → 04 Questions (visible FAQ, FAQPage) → fact sheet (collapsed for humans, whole for machines) → footer with entity and tenant-side statement. Seven blocks plus the footer; the bottom band is gone. The numbering 01 to 04 and section 02's title "Flat fees" are unchanged; the rail (if kept at ≥ 1260 px) keeps its five anchors `#contact`, `#how`, `#services`, `#checks`, `#faq` (`build-cities.mjs:425-431`), because `#contact` is now the door inside the hero.

**Where the ticket lives.** Inside block 1, updating per §3.2; after the third tap it carries plan, price, condition, first fix, the refund rule, the "n of 8" meter and the share row. The pass is a card inside the ticket ("Save as image" and "Share"), with two optional fields.

**What persists.** The URL: `#checkin=stage.where.when.docs[.via]` (§7.6). A partial deep link lands on the next unanswered step with "1 of 3 answered, from the link you received"; papers never arrive from a shared link. Nothing on the device beyond the session.

**What is shared.** Per card: the plan card, the papers card, the pass, each with its own string and `via` marker (§7.6). The share text names the city and the plan, never a price promise.

**Motion.** One view transition per step (≤ 300 ms, plain callback form); the ticket's price board flips once when the plan resolves and once more only if the plan changes; the meter animates with `@property`; the OPEN/PAID board at the end; everything else static. Reduced motion: instant swaps, boards show their final word.

**No JS, decided per brief v1.2.** The hero is the H1, the lead and the door; the Check-in and the rail are hidden by the existing `<noscript>` rule (`cities/_template.html:51`, pinned by `tests/cities/ui.mjs:542`); the rules remain readable without JS as the derived FAQ answer in 04 ("Full Search (€500) if you haven't started. …", `build-cities.mjs:174-190`). The hero word budget (≤ 60) therefore applies to the no-JS hero as today; the first writing's "three questions as a static list with the four rules written out" is withdrawn, since it would put about 55 words of rules into a 60-word hero and contradict v1.2.

**What A amends in the brief and in the suite (the founder signs v1.3 or A is not built).**
- Brief v1.2: "It sits inside section 02 before the plates, the block count stays eight, it is not a ninth block" becomes "It is the hero, with the door; the block count is seven plus the footer." The derived FAQ, the Offer `audience` and the eight-document rule are untouched.
- `tests/cities/run.mjs:160-179`: the `hero` slice (from the `header.hero` opening tag to the `THE DOOR` HTML comment) would swallow the Check-in; the build emits a `/CHECK-IN` HTML comment after the block and `checkinOf()` (`:162`) slices from `<div class="checkin" id="checkin"` to that marker instead of to `<div class="sibs plates">`; the hero slice subtracts `checkinOf()`; the Check-in's own ceiling (≤ 230) and the body subtraction stay as they are.
- `tests/cities/ui.mjs`: the `#checkin` geometry checks move with it; a new check asserts the ticket's `getBoundingClientRect()` is inside the viewport after each resolving tap at 390×844 and at 1440×900.
- `build-cities.mjs`: the `resolvesAt` rule of §3.2 and the condition-string rule of §7.5.

**Risks.** (1) A page whose first screen is an interactive block can read as a widget to a crawler: the static H1, the lead and the derived FAQ in prose keep the rules in the DOM, and the fact sheet stays whole for machines. (2) The visitor who arrived to write loses one tap: the skip link is mandatory and measured (`checkin_skip` in §8.2). (3) Three choices before any brand story: the proof line under the chips carries the weight that the hero sub carried before. (4) The largest rewrite of the template and the suite of the three.

### 7.2 Architecture B: two doors on one screen

**First screen, 390.** Lockup, H1, lead, then a short file card with three fields (name, contact, move-in month select) and, in the place of today's priced chips, one line: "Which service? Check in, 20 seconds" that opens the Check-in inline as a `<dialog>` sheet; the ticket writes the plan back into the card as a chip. "Not sure yet" stays as the equal-weight default.

**First screen, 1440.** Left column 7 of 12: lockup, H1, lead, the two proof chips labelled Rome. Right column 5 of 12: the file card with the "Check in, 20 seconds" line as its first row; the Check-in opens as a centred `<dialog>` of 560 px over a dimmed page and returns the plan to the card. One action on the screen. The prices sit in the card as text under the chosen plan, with the condition string.

**Order of blocks.** 1 Hero with the short door → 01 How → 02 Services (plates; the Check-in is also reachable from a secondary line under the plates, where v1.2 placed it) → 03 Checks → 04 FAQ → fact sheet → footer.

**Persistence and sharing.** As in A; the sheet's state is in the URL and a deep link opens the sheet on the right step.

**Motion.** Dialog open and close as a view transition; the ticket board once; end-state board.

**What B amends.** Nothing in brief v1.2's text if the Check-in's DOM position stays in section 02 and the sheet merely presents it; the suite's `checkinOf()` slice keeps working. The only sign-off is the plate boards (Q4), common to all three.

**Risks.** (1) Two things still compete on the first screen (a form and a prompt to open a diagnostic), and the diagnostic remains one tap away: the discoverability problem of today in a lighter form. (2) A sheet on a phone with the consent card at 0.7 s is a stack of overlays. (3) It is the smallest change from today and therefore the smallest chance of changing the result.

### 7.3 Architecture C: the ticket page, with a desk-aware first screen

**First screen, 390, sell desk.** If the URL carries a complete `#checkin=`, the page opens on the ticket itself (plan, price, condition, refund rule, "from a link you received", "change my answers", papers empty). Otherwise, as in A.

**First screen, 390, waitlist desk (Barcelona, Paris, Berlin).** The lockup, the H1, and one line that says what is true today: "Opening with a registered partner. Today: your file, your dossier readiness, the six checks before you sign." Then the Check-in as in A. The ticket shows the plan, its list price and **its own condition string** (Barcelona and Paris: "list price, charged only when the desk opens"; Berlin Full Search: "list price, due only once you sign a lease"; Berlin's other two: "at opening"); its only door is the free file. **Brief v1.1 is kept in full**: the chips under the door carry the list prices with the per-plan condition, section 02 keeps the three plates with their price lines ("at opening" or "on signing"), the fees row of the fact sheet is derived from the plans, the schema carries `PreOrder` Offers with the condition in the description. The first writing's "What exists today" block in place of the plates is withdrawn: it would have removed two of the four places v1.1 names. The difference from A on a waitlist desk is the hero line, the ticket's door and the absence of a till; the difference from today is weight (no boards on the plates if Q4 agrees, no "Ask for a viewing", no pay bar with a price).

**First screen, 1440.** As A, with two deltas: on a waitlist desk the right column's door is the free file only and carries the hero line's three facts as its sub-line; on a sell desk arriving by a complete deep link the right column opens on the resolved ticket and the left column opens on "change my answers" collapsed, so the visitor reads the plan first and the questions second.

**Order of blocks.** As A on every desk; no block is replaced.

**Persistence, sharing, motion.** As A, plus the `landing_state` dimension in analytics (cold, deeplink_partial, deeplink_complete) and the `via` marker.

**What C amends.** As A (the hero placement), plus the waitlist hero line, which amends nothing (brief §4 "must-state" lines are kept verbatim and the new line is added).

**Risks.** (1) Two first screens per template to maintain and to test. (2) A ticket-first landing from a forwarded link shows a plan before the visitor has answered anything themselves: "change my answers" must be one tap, and papers never arrive from a link (§7.6).

### 7.4 Recommendation to the panel

A for the sell desks, with C's deep-link landing and C's waitlist first screen; B kept as the fallback if the panel judges the crawler risk of A too high or the founder declines the v1.2 amendment. Reasons: A is the only architecture that fixes problem 2 of §4.1 (order inverted) rather than softening it; C's waitlist first screen is the only one that answers "what do I get today" above the fold without touching v1.1; B fixes neither at the root. The measurement in §8 is designed so the three can be compared on the same events if the panel prefers to run two of them on two cities.

### 7.5 The condition string: one datum, five readers, Berlin's variant carried

Today the per-plan line exists only on the plate (`pricing.plans[].per`: Amsterdam "flat · incl. VAT", Berlin Full Search "flat · incl. VAT · on signing", Berlin's other plans and all Barcelona and Paris plans "flat · incl. VAT · at opening"), while the chip note (`form.service.priceNote`) and the ticket's file-door sub-line (`checkin.result.ctaFileSub`) are desk-level strings that say "charged only when the desk opens" for every plan, which is wrong for Berlin's Full Search (§4.1 problem 10).

Spec: each plan carries `condition` (a short form for chips and price lines, today's `per`) and `conditionLong` (a sentence for the ticket, the fees row and the Offer description). Berlin: Full Search `condition: "incl. VAT · on signing"`, `conditionLong: "List price. Due only once you sign a lease; nothing before."`; Application Pack and Attended Viewing `condition: "incl. VAT · at opening"`, `conditionLong: "List price. Charged only when the desk opens."`. Barcelona and Paris: all three "at opening" with the same long form. Amsterdam and Madrid: `condition: "incl. VAT"`, `conditionLong: "VAT included. Invoice from Egidi Immobiliare S.r.l."` and, on Full Search, the refund sentence appended. Readers: the chip (`<small>`), the plate price line, the ticket (`#ckPer` and the door sub-line, per plan, not per desk), the fees row of the fact sheet (derived, one entry per plan), the Offer description and `availability`. The desk-level `priceNote` under the chips becomes "List prices, VAT included. Each plan says when it is charged." on waitlist desks and disappears on sell desks. Build rules: refuse a waitlist plan without `condition` and `conditionLong`; refuse a Berlin Full Search whose strings do not contain "sign"; refuse a sell-desk plan whose `conditionLong` lacks "VAT". Tests: the five readers print the same string for the same plan on every desk (parity across chip, plate, ticket, fees row, schema), and a mutated Berlin file that says "at opening" on Full Search fails.

### 7.6 Partial deep links: format, the docs rule, landing copy, markers, tests

Today `readHash()` (`assets/boom-city.js:312-324`) accepts only `#checkin=stage.when.where.(hex|-)` with all three answers present and valid; a missing or unknown answer returns `false` and the page opens on step one blank (`tests/cities/ui.mjs:506`). The "lands as 1 of 3 answered" mechanic needs the following.

- **Format.** `#checkin=<stage>.<where>.<when>.<docs>[.<via>]` in the new step order (§3.2). Each answer slot is a known value or `-` (absent). `docs` is the hex mask or `-`. `via` is optional, one letter: `l` (copy link, the visitor's own memory), `w` (WhatsApp from the ticket), `c` (the plan card's share), `d` (the papers card's share), `p` (the pass). Old four-slot links exist only on `live:false` previews and are not honoured; the parser treats a four-slot hash with a known second slot as the old order for 30 days and then drops that branch [the only migration, because no public link has ever been issued].
- **Unknown value.** A slot whose value is not a known option (for example `nowhere`) is treated as absent, not as an error: the page lands on the first unanswered step with the known answers ticked. The current "broken link opens the first step, nothing pre-ticked" case (`ui.mjs:506`) becomes "the unknown slot is empty, the known slots stay".
- **Papers on a forwarded link.** Papers are personal. "Copy link" (`via=l`) keeps the mask, because it is the visitor's own resumption link. Every share meant for someone else (`w`, `c`, `d`, `p`) strips the mask to `-`. On landing, a mask is honoured only with `via=l` or no `via`; with any other marker it is ignored even if present.
- **Landing copy.** Partial: "1 of 3 answered, from the link you received. Two taps to your plan." (or "2 of 3 answered … One tap"). Complete, with `via` other than `l`: "Your friend's answers. Change any of them, then your plan is yours." Complete with `via=l` or none: today's ticket-first landing. Partial and complete deep links fire `deeplink_landing{answered, docs_present, via}` (§8.2).
- **Share strings, one per card, each ≤ 120 characters before the URL** (WhatsApp previews truncate; the current `K.result.share.text` is the pass string): plan card, "BOOM {city}: a rental agent on the tenant's side, flat fees. My plan in three taps: {url}"; papers card, "The eight papers a {city} landlord asks for, and what to fix first: {url}"; pass, today's string. None names a price.
- **Tests.** `#checkin=zero.-.-.-` lands on step 2 with "1 of 3 answered" and `zero` ticked; `#checkin=shortlist.abroad.-.-` lands on step 3 with the ticket already resolved to Attended Viewing (§3.2); `#checkin=zero.abroad.soon.ff.w` lands complete with the meter empty and no doc ticked (mask ignored); `#checkin=zero.abroad.soon.ff.l` lands complete with eight ticked; `#checkin=zero.nowhere.soon.-` lands on step 2 with `zero` ticked and nothing else; each share button writes the right `via` and the pass and WhatsApp strings carry `-` for docs; `deeplink_landing` fires with the right `answered` and `via`.

### 7.7 The move-in field and what it touches on the server

The field becomes a `<select id="fMoveIn" name="moveIn">` with 18 options, the next 18 months from the build date (value `YYYY-MM`, label "February 2027"), plus "Not sure yet" (value empty). The Check-in's prefill, which today writes a phrase ("In 1–3 months", asserted in `tests/cities/ui.mjs:489`), maps `soon` to the current month plus one, `months` to plus two, `later` to "Not sure yet", and the operator still receives the phrase through the `checkin` hidden field. `api/city-lead.js` clips `moveIn` to 40 characters and prints it as text in the summary and the Telegram card (`:105`, `:121`, `:183`); it accepts both forms, and for a `YYYY-MM` value prints the label ("move-in February 2027") so the operator's line reads as before. No schema change on the lead document (`moveIn` stays a string); a test posts both forms and asserts the summary. Without JS the select is native and the value posts as `YYYY-MM`.

---

## 8. Measurement

### 8.1 What exists today

`assets/boom-city.js` already fires, through `boomTrack` (`:22`, which calls `gtag` only when it exists, and `gtag` loads only after consent): `page_view_market` (`:687`), `select_item` (a plate's button), `begin_checkout`, `add_payment_info`, `generate_lead`, `sign_up`, `purchase` once per Stripe session id (`:255`), `checkin_answer` with step and value (`:571`), `checkin_result` with plan, stage, when, where and docs count (`:397`), `share` with the method (`:531-576`). `js/boom-track.js` records, after consent, anonymous journeys: sections seen with first-seen times, scroll depth, CTA clicks classified by label and `data-analytics-kind`, exit type, posted to `/api/analytics/collect` into `webJourneys` for 90 days and read by `/behavior` (CLAUDE.md, Behavior Intelligence). The brief's §7 Plausible plan was superseded by this consent-gated gtag plus first-party journey layer. The server prints `checkin` and `dossier` on the operator's summary (`api/city-lead.js:124-125`).

### 8.2 What to add (names in the GA4 idiom already used)

| Event | Parameters | Why |
|---|---|---|
| `checkin_start` | `market`, `landing_state` (cold / deeplink_partial / deeplink_complete), `ms_since_load` | Time to first commitment; the deep-link head start measured, not assumed |
| `checkin_step_view` | `step`, `visible` (IntersectionObserver, not attribute) | Proves the step rendered where the visitor was looking; the §4.1 bug would have shown as result fired without view |
| `checkin_result_view` | `plan`, `resolved_at_tap` (1 or 2), `in_viewport_within_ms` | The ticket actually seen (fires only when ≥ 60% of the ticket is in the viewport); the §3.2 policy measured |
| `checkin_abandon` | `last_step`, `docs_ticked`, `unresolved` (true if abandoned on the "two plans fit" state) | Where the three taps break; the §1.5 ordering hypothesis tested |
| `checkin_skip` | `market` | How many visitors take the skip link in A |
| `door_prefill` | `from` (checkin / plate / paybar / none), `plan` | Share of files opened with a plan already chosen by the rules |
| `pass_save`, `pass_share` | `method` (files / url / download / copy), `fields_filled` (0 to 2) | Artifact completion (IKEA) and the real share channel per market |
| `link_copy` | `where` (ticket / papers / pass) | Per-card sharing |
| `deeplink_landing` | `answered` (0 to 3), `docs_present`, `via` (l / w / c / d / p / none) | Return loop and virality, measured at the receiving end, per card |
| `faq_open` | `question_index` | Which doubt the page did not answer earlier (the §1.5 test) |
| `plate_view` | `plan`, `price_visible_ms` | Replaces the board settle time as a quality metric |
| `paybar_click` | `plan`, `section_at_click` | Whether the persistent action helps or follows |
| `form_error` | `field`, `kind` | Field-level friction (today errors are shown only on submit); zero expected on move-in after §7.7 |
| `clock_shown` | `visitor_offset_hours` | Where in the day the audience really is (replaces the §1.4 inference) |
| Web Vitals | `lcp`, `inp`, `cls`, `inp_target` via `PerformanceObserver` inline (no library) | §5.2 budget in the field, per market and device class |

Server side, add the two hidden fields to the lead document so the reply rate and the conversion to paid can be read per plan and per "n of 8".

### 8.3 What success looks like

The budget is about €100 of ads per city, 50 to 70 clicks and 3 to 10 leads (brief §0): a direction test, not a significance test. Success is therefore defined as ratios that can be compared across cities and architectures, plus three absolute checks:

- **Absolute.** Field INP ≤ 200 ms at p75 on Android for `pass_save`; `checkin_result_view` fires for ≥ 95% of `checkin_result` (the ticket is seen; the §4.1 class of bug cannot recur unseen); zero `form_error` on the move-in field; every `live:true` page passes the §10.0 gate (no stat without `verifiedAt`).
- **Ratios to read weekly.** Check-in start rate (starts / page views); Check-in completion (results / starts; Typeform's 47% average for forms of this length is the only external reference and it is vendor data, [Typeform](https://help.typeform.com/hc/en-us/articles/360029615911-What-s-the-average-completion-rate-of-a-typeform) [unverified, B5]); share of results resolved at tap 1 versus tap 2 (§3.2); prefilled-door share (`door_prefill` from checkin / `generate_lead`); lead rate (`generate_lead` / page views) by landing state; artifact rate (`pass_save` + `pass_share` + `link_copy` / results); return rate (`deeplink_landing` with `answered` ≥ 1 / results), by `via`; purchase per lead on sell desks and refund rate (operations, from Stripe); same-working-day reply rate (operations, from the lead timestamps and the first outbound in `messages`).
- **Qualitative.** WhatsApp replies that quote the ticket or the missing papers by name: the sign that the artifact did the explaining.

---

## 9. Open questions for the founder

1. **Architecture, and a brief amendment.** A with C's deep link and waitlist screen, or B as the conservative step: the panel judges, you decide. A and C **amend brief v1.2** ("inside section 02 before the plates") by making the Check-in the hero with the door; the consequences (numbering unchanged, rail anchors unchanged, section 02 title unchanged, `checkinOf()` and the hero slice rewritten, geometry tests added) are in §7.1. Is a first screen that opens with a question acceptable for the brand, and do you sign v1.3 with that line.
2. **The named person.** Who is the name on each desk today (Valentino on all five until a city operator exists), and may a real photograph of you appear, or only the name. Deadline in §3.5: before the design freeze.
3. **Rome proof.** "Born in Rome · 4.9 on Google · 500+ housed since 2020" labelled as Rome in the hero, or moved to a strip below the first screen; and the Google profile linked (`REVIEW_URL`).
4. **The price boards, a brief v1.3 item.** Boards only on the ticket and the end states, prices as text on the plates (chips, plate price line, fees row and schema unchanged, as v1.1 requires), the city word static after a single settle at first paint and never re-spun. `tests/cities/run.mjs` currently pins a board for every price; the test changes with your yes.
5. **The pay bar.** Keep it on sell desks with the label of the chosen plan, or replace it with a persistent free-door action and no price.
6. **Languages.** ES on Madrid and Barcelona, FR on Paris: v2 ships EN only, as brief §8 says; the mechanics and the cost of a second language (a second JSON and page per desk, hreflang pair, schema, budgets per language, about 3,300 words of your copy) are in principle 11. Confirm "after the first measured month", or reprioritise.
7. **The month select and a bookable call.** The move-in field becomes a native month select (§7.7); may step 1 ("a 20-minute call") be bookable from the page through the existing viewing-slot engine, with your real availability, or does that promise more than the desk can keep in the first weeks.
8. **The market norm line.** "One month's rent + 21% VAT is the Amsterdam norm" with its opened source and date, beside €500: yes or no, and counsel's view on comparative advertising per country.
9. **The refusal on the ticket, and the step order.** For `zero` + `soon`, print the policy as a sentence ("Four weeks is tight. If we decline the search in the first call, the €500 comes back whole."): confirm the wording. And confirm the step reorder `stage → where → when` (§3.2), which is what makes the live ticket a rule.
10. **Fonts.** Accept Roboto on Android (0 KB, budget 90 KB) or ship Inter Variable latin (48 KB, CLS-safe with a fallback face, budget 140 KB with the font capped at 50 KB).
11. **The one email.** After the file opens, one email that carries the link and the eight-paper checklist, updated by the desk as papers arrive: is the desk ready to maintain that checklist, and from which tool (the portal's lead document or a new field).
12. **Waitlist desks.** Partner names and a horizon are the two facts that would change those pages most; when can either be stated, and until then is "opening with a registered partner" plus the "today you get" line (§7.3) enough on the first screen. Confirm Berlin's two condition strings (§7.5).
13. **Legal and tax before live, with an owner.** You engage counsel and the commercialista; the six items and the deadline (before the first `live:true`) are in §3.4: UCPD texts and transpositions, CRD 8(8)/16(a) wording in the till, Rome I per desk country, comparative advertising, **the VAT place of supply that decides what "VAT included" means on each desk**, EDPB 2/2023 on the one storage write.
14. **The capture pipeline and the verification session.** Two tasks for a machine with egress, both owned by you or a delegate: (a) regenerate the reference captures with a scroll before `fullPage` and add the 1440×900 reveal test (§2.4; the blank lower third was an artefact, not a release blocker); (b) run the §10.0 verification session (about two hours: 25 load-bearing pages plus the 13 competitor first screens) so that the ledger's U rows become V or D before any statistic is printed on a page.
15. **Proof assets.** The sample viewing report, the Dutch-format dossier template, the two testimonials or the decision to ship without them, the real "opened [month]" line (§3.5 table): who produces each and by the design freeze.

---

## 10. Sources

All external URLs were seen in search results by the research passes on 15 Oct 2026; none could be opened from this sandbox except the `raw.githubusercontent.com` and `registry.npmjs.org` items in §10.5. Repo paths are read directly.

### 10.0 The verification ledger and the release gate

**Status key.** V verified against an opened primary page or dataset · D figure differs from the source (real figure given) · U page unreachable today, figure is a snippet · M memory, no page, counsel to replace. **Owner** of every U and M row: the founder or a delegate on a machine with egress (the operator's laptop or a CI runner), running one session per family: the 25 load-bearing URLs of the first spot-check list (A, B, C8, L1 to L3), then the 13 competitor first screens (C0) with the protocol below. **Deadline**: the A and C rows before any statistic from them is printed on a page, and in any case before the first `live:true`; the C0 protocol before the judge panel (task #8) if its verdict is to rest on the competitor comparison, otherwise before task #9; the L and M rows with counsel before the first `live:true` (§3.4).

**The gate, mechanical.** Brief §5.3 already asks for a `source` field per stat. v2 adds: every statistic printed on a page lives in the city JSON as `{ value, source, publishedAt, verifiedAt, verifiedBy }`; `build-cities.mjs` refuses a `live:true` page whose stats lack `verifiedAt` or whose `verifiedAt` is older than 180 days, and prints "verified <date>" with the source line on the page; `tests/cities/run.mjs` pins the refusal by mutation. A statistic in this study without a V in the ledger is not a statistic the page may print.

| # | Claim, where used | Source | Status, 15 Oct | What a V needs |
|---|---|---|---|---|
| A1 | 311 vs 161 rental-fraud reports H1 2026; 244 in 2024 (§0, §1.2) | Fraudehelpdesk PDF; Woonbond | U (CONNECT 403) | Open the PDF; confirm figure, period, definition |
| A2 | Berlin police rental-fraud cases 779 (2020) to 1,529 (2023) (§0) | t-online | U | Open; confirm the police source named |
| A3 | 45 / 425 responses per listing Q1 2025; €27.75/m² (§0, §1.2) | Huurwoningen.nl | U | Open; confirm period, city scope, median or mean |
| A4 | 43 / 92 / 49 contacts per listing Q3 2026; 36% / 9% same-day lets (§0, §1.2) | idealista 15 Oct 2026; Merca2 14 Aug 2026 | U | Open both; confirm figures and dates |
| A5 | Supply −36.4% Q2 2025; 57 and 42 responses; 18 days online (§1.2) | Pararius Q2, Q3 2025 | U | Open; confirm national vs city scope |
| A6 | Vacancy 0.3%; €15.79/m²; 300+ requests a day (§0, §1.2) | CBRE/Berlin Hyp 2026; Immobilienmanager; Scout24; Berliner Zeitung | U | Open; confirm which figure is the report's and which the paper's |
| A7 | 79% of Berlin expats disagree housing is easy (§1.2) | InterNations 2024 via Scribd | U | Open internations.org, not Scribd |
| A8 | 33 and 41 candidates per listing; 15 days; 743 applications (§1.2) | Manda 2025, 2026; Meilleurtaux | U | Open; confirm Paris scope |
| A9 | Law and practice facts: deposit caps NL and DE, income rules, SCHUFA loop, aval, Visale, DossierFacile 2M (§1.2) | Rijksoverheid, Sparkasse, guides, Légifrance, DossierFacile | U | Open the government pages; guides are secondary and stay secondary |
| A10 | Population and migration figures (§1.1) | CBS, IND, AfS, INSEE, Ajuntament, Comunidad de Madrid and others | U | Open the statistical offices' pages |
| A11 | Mobile shares (§1.4) | StatCounter | U, date labels inconsistent | Open; record the period shown |
| Q1 to Q9 | The nine quotes (§1.3) | Substack, Hacker News, Expat.com, The Local, Trustpilot, expats.de | U, wording unconfirmed, dates from URL paths only | Open each thread; copy ≤ 40 words verbatim with the post date; drop any that differ |
| B1 to B6 | Behavioural findings (§3.1): Fogg, Zeigarnik meta-analysis, Nunes and Drèze 34/19, Kivetz, Conrad and Couper, Freedman and Fraser r ≈ 0.17, IKEA, Burnkrant, peak-end n = 682, Skinner, Wrapped 227M, Typeform 47% | As listed in §10.4 | U (Wharton and Typeform 403 on the spot check) | Open; the mechanics stand on direction, the figures must still be confirmed before any is printed |
| C0 | Competitor first screens, 13 URLs (§2.1) | berlinrelo.de, rentslam.com (2), housinganywhere.com (2), spotahome.com (2), yourexpatbroker.nl, flat-me.fr, apparte.fr, barcelonahomehunter.com, immobilienscout24.de, rentola.nl | U (all CONNECT 403, 18:16 to 18:18 UTC) | Playwright, two contexts (390×844 Android UA, 1440×900), page language, dismiss the cookie banner, fold and full-page screenshots, record verbatim: H1, first paragraph, every button above the fold with its label and y, any price text above the fold, rating or trust text, presence of a form or calculator and its labels, any landlord-side copy, any login or alert or WhatsApp loop; ISO timestamp per row; PNGs committed beside this study; then re-grade §2.1 |
| C1 to C9 | Competitor prices and mechanisms (§2.1, §1.6) | As listed in §10.3 | U | Open the provider's own page; record date; mark affiliate or promo figures as such |
| C7 | BerlinRelo 53 days, 4.4 viewings, 2.38 applications, 80-day refusal, calculator, fee €1,600 to €1,700 + VAT | berlinrelo.de; The Local 19 Feb 2026 | U, single-source for every cell | Open both; nothing from this row is reused on a page in any case (§2.3 item 1) |
| L1 | BW 7:417(4), ACM 2014 commitment and 2019 order (§1.5) | acm.nl PDFs | U | Counsel item 1; open the ACM PDFs |
| L2 | ACM timers "actual consequences", 41 resets; Epic €562,500 (§3.4) | acm.nl | U | Open; confirm figures |
| L3 | EDPB 2/2023 v2.0 on local storage (§5.4) | edpb.europa.eu | U | Counsel item 6; open the guideline |
| M1 | UCPD Annex I points 7 and 26, Article 7(4)(c); CRD Articles 7(3), 8(8), 16(a), 22; Rome I Article 6 (§3.4) | EUR-Lex via ELI | M (drafted from memory by the gap-fill pass, not reproduced here) | Counsel pastes from the ELI links |
| M2 | National transpositions and comparative-advertising rules per desk country | Légifrance, gesetze-im-internet, BOE, wetten.nl | M | Counsel |
| M3 | DSA 25(3) guidelines status; DFA proposal status Q4 2026 | Osborne Clarke (441 days old); EP legislative train; European Post | U | Open the EP page; record its last-updated date |
| T1 | Same-document View Transitions: Chrome 111 / Safari 18 / Firefox 144 | web-features 3.43.0, BCD 8.1.6 | **V** | Done; Baseline date corrected to 14 Oct 2025 (**D** against the first writing's 16 Oct) |
| T2 | Scroll-driven animations: Chrome 115 / Safari 26 / Firefox 159 | BCD 8.1.6, web-features | **V with caveat**: Firefox 159 is beta (27 Oct 2026); `baseline: false` | Done; the fallback is mandatory |
| T3 | `<input type=month>` on desktop Safari and Firefox falls back to text | BCD input/month; mdn/content source | **V** | Done; the move-in field is a select (§7.7) |
| T4 | caniuse 92.9% global for view transitions | caniuse snapshot 13 Oct | V (snapshot) | Refresh the snapshot monthly |
| T5 | web.dev CWV thresholds; WebKit 26.4 compositor note; Alex Russell's 2024 figures | web.dev, webkit.org, infrequently.org | U (hosts blocked); standard figures | Open when possible; nothing on a page depends on them |
| T6 | Library sizes, page timings, regional percentages | npm tarballs (V), local Chromium (V as relative indicators), caniuse computation (own) | V / own computation | None needed for the page; re-measure on the built v2 |
| R1 | The 1440 reveal | `scratchpad/tallcheck.mjs`, Chromium 1194 over HTTP, two runs | **V**: capture artefact | Regenerate the captures with a scroll; add the ui test (§2.4) |
| R2 | The `[hidden]` defeat, the fold measurements, the contrast and target counts (§4) | critique scripts in `scratchpad/critique/` | V (measured) | Re-measure on v2 |

### 10.1 Repository and measurements
- `BOOM_CITIES_BRIEF.md` v1.2 · `STUDIO_EXECUTIVE_CONVERSIONE.md` · `STUDIO_EXECUTIVE_UIX.md` · `cities/_shared.json` · `cities/amsterdam.json` · `cities/berlin.json` · `cities/barcelona.json` · `cities/paris.json` · `cities/madrid.json` · `cities/_template.html` · `build-cities.mjs` · `assets/boom-city.css` · `assets/boom-city.js` · `css/boom-2026.css` · `js/boom-consent.js` · `js/boom-track.js` · `tests/cities/run.mjs` · `tests/cities/ui.mjs` · `tests/_browser.mjs` · `api/city-lead.js` · built `amsterdam.html`, `barcelona.html`
- Captures: `/tmp/claude-0/-home-user-Boum-roma/b9127e09-85ed-5e2c-8cec-2829dc40ddaa/scratchpad/current/` (amsterdam and barcelona at 390 and 1440; the 1440 pair misleading per §2.4), `scratchpad/critique/` (fold-390, after-show-390, ticket-390, pass-390, fold-1440, checkin-1440, nojs-390, metrics.json, a11y.mjs, ckbug.mjs, solari.mjs, consent.mjs), `scratchpad/tallcheck.mjs` and `scratchpad/tall-900-fullpage.png`
- Lighthouse throttling preset: https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md
- Agent proxy status (policy-denial evidence): http://127.0.0.1:45157/__agentproxy/status

### 10.2 Audience
- https://www.amsterdamsorteermachine.nl/en/voorlopige-cijfers-2024
- https://onderzoek.amsterdam.nl/artikel/bevolkingsprognose-2025-2055
- https://www.metropoolregioamsterdam.nl/wp-content/uploads/2023/12/Migratiemonitor-MRA-2023.pdf
- https://download.iamsterdam.com/s4gf5oaarlo-mra-update-monitor-internationals-2024-definitief.pdf
- https://www.cbs.nl/nl-nl/nieuws/2025/26/minder-immigratie-in-2024-vooral-minder-kennismigranten
- https://ind.nl/nl/documenten/02-2026/ind-jaarcijfers-2025.pdf
- https://www.kroesadvocaten.nl/en/dalende-trend-aantal-kenniswerkers-naar-nederland/
- https://www.statistik-berlin-brandenburg.de/106-2025/
- https://www.statistik-berlin-brandenburg.de/a-iii-2-j/
- https://de.statista.com/statistik/daten/studie/1094889/umfrage/anzahl-der-auslaender-in-berlin-nach-staatsangehoerigkeit
- https://mediendienst-integration.de/arbeitsmarkt/auslaendische-arbeitskraefte/eu-aufenthalt-fuer-hochqualifizierte-die-blaue-karte/
- https://erudera.com/statistics/germany/germany-international-student-statistics/
- https://www.eldiariodemadrid.es/articulo/economia/madrid-supera-35-millones-habitantes-primera-vez-marca-record-historico-poblacion/20250514113409099853.html
- https://gestiona3.madrid.org/bvirtual/BVCM007955-2025-09.pdf
- https://www.study.eu/press/spain-increasingly-popular-with-international-students-new-survey
- https://ajuntament.barcelona.cat/premsa/2025/05/31/barcelona-estabilitza-la-poblacio-en-17m-de-residents-el-valor-mes-elevat-dels-darrers-quaranta-anys/
- https://www.barcelona.cat/infobarcelona/ca/nou-record-el-264-de-la-poblacio-de-barcelona-es-de-nacionalitat-estrangera_1523532.html
- https://www.totbarcelona.cat/societat/nacionalitats-estrangeres-nombroses-barcelona-514646/
- https://www.genbeta.com/laboral/33-gente-que-pidio-visados-nomada-digital-2024-fueron-a-vivir-a-barcelona-casi-doble-que-eligieron-madrid
- https://www.insee.fr/fr/statistiques/3633212
- https://www.insee.fr/en/statistiques/9008774
- https://www.aefinfo.fr/depeche/736941-en-2024-2025-la-france-a-accueilli-pres-de-445-000-etudiants-etrangers-soit-3-de-plus-que-lan-passe-campus-france
- https://www.iamsterdam.com/en/business/netherlands-tops-global-english-proficiency-index-for-the-sixth-year-in-a-row
- https://www.ef.com/assetscdn/WIBIwq6RdJvcD9bc8RMd/cefcom-epi-site/reports/2025/ef-epi-2025-english.pdf
- https://www.pararius.nl/nieuws/schaarste-op-vrije-sector-huurmarkt-neemt-toe
- https://www.pararius.nl/nieuws/vrije-sector-huurmarkt-steeds-verder-op-slot
- https://www.huurwoningen.nl/nieuws/de-krapte-op-de-huurmarkt-neemt-toe-middeninkomens-zitten-klem/
- https://www.huurwoningen.nl/nieuws/de-huurmarkt-blijft-krap/
- https://propertynl.com/Nieuws/Middenhuur-verdampt-in-Amsterdam/ecb7ffb6-cb47-41fb-9ddd-64881ca251fb
- https://amsterdamrelocation.com/blog/income-required-to-rent-amsterdam.html
- https://www.rijksoverheid.nl/onderwerpen/woning-verhuren/vraag-en-antwoord/nieuwe-regels-voor-verhuurders-en-verhuurbemiddelaars-1-juli-2023
- https://www.iamexpat.nl/education/education-news/internationals-happy-studying-netherlands-except-housing-challenges
- https://www.iamexpat.nl/expat-info/dutch-news/internationals-enjoy-dutch-work-life-balance-dislike-housing-challenges
- https://www.woonbond.nl/nieuws/honderden-gemelde-zaken-van-verhuurfraude/
- https://www.fraudehelpdesk.nl/wp-content/uploads/2026/09/Persbericht-halfjaarcijfers-final-03092026.pdf
- https://delta.tudelft.nl/en/article/room-scams-are-more-and-more-convincing-this-room-was-too-good-to-be-true
- https://www.cbre.de/press-releases/berlin-hyp-und-cbre-wohnmarktreport-berlin-2026
- https://www.immobilienmanager.de/wohnmarktreport-mieten-in-berlin-steigen-weiter-kraeftig-19052025
- https://www.scout24.com/news-medien/news/detail/die-meistgesuchte-mietwohnung-deutschlands-2024
- https://www.berliner-zeitung.de/article/wohnungssuche-in-berlin-angebote-bekommen-mehr-als-300-anfragen-pro-tag-2211329
- https://www.scribd.com/document/827956656/Expat-Insider-2024-the-Best-Worst-Cities-to-Get-Started-Abroad-InterNations
- https://berlin.t-online.de/region/berlin/id_100678946/mietbetrug-in-berlin-expertin-verraet-wie-sie-sich-schuetzen.html
- https://www.farawayhome.com/en/magazine/rent-apartment-without-schufa-berlin
- https://www.sparkasse.de/pk/ratgeber/wohnen/mieten/mietkaution.html
- https://www.idealista.com/news/inmobiliario/vivienda/2026/10/15/918818-los-interesados-que-compiten-por-cada-vivienda-en-alquiler-crecen-un-16-en-el
- https://www.eleconomista.es/vivienda-inmobiliario/noticias/14021178/10/26/la-odisea-de-alquilar-piso-en-espana-la-competencia-se-desborda-con-hasta-137-interesados-por-cada-vivienda.html
- https://www.merca2.es/2026/08/14/alquiler-vivienda-espana-idealista-24-horas-2436101/
- https://www.eldebate.com/espana/cataluna/barcelona/20260206/fracaso-restricciones-vivienda-psc-cae-28-oferta-alquiler-barcelona_382219.html
- https://barcelonarenthelp.com/rent-barcelona-without-spanish-work-contract/
- https://getprio.io/blog/documents-rent-apartment-spain/
- https://www.publico.es/economia/vivienda/anuncios-pisos-baratos-existen-crisis-vivienda-dispara-estafas-inmobiliarias.html
- https://www.manda.fr/ressources/articles/barometre-de-la-tension-locative-au-premier-semstre-2025
- https://www.manda.fr/ressources/articles/barometre-tension-locative-1er-semestre-2026
- https://www.meilleurtaux.com/credit-immobilier/actualites/2025-septembre/etudiants-victimes-tension-locative-sans-precedent-paris.html
- https://legifrance.gouv.fr/loda/id/JORFTEXT000031444493/2019-10-06
- https://relocation-in-paris.fr/en/blog/rental-application-paris-documents-needed
- https://theamericaninparis.com/2026/06/18/how-to-find-an-apartment-in-france-as-an-american/
- https://www.dossierfacile.logement.gouv.fr/blog/2-millions-comptes-dossierfacile
- https://cms.in-cdn.net/cdn/file/cms-media/public/2022-11/Expat-Insider_City-Ranking-Report-2022_0.pdf
- https://www.pretto.fr/recherche-immobiliere/trouver-bien-immobilier/meilleur-site-immobilier/
- https://plans.spotahome.com/
- https://mumexpat.com/en/facebook-groups/
- https://search.ftc.gov/system/files/ftc_gov/pdf/rental-scams-spotlight-2025.pdf
- https://www.expats.cz/czech-news/article/new-investigation-exposes-facebook-scam-targeting-expat-apartment-hunters
- https://daftamericans.substack.com/p/guide-to-finding-housing-in-netherlands
- https://news.ycombinator.com/item?id=26319875
- https://news.ycombinator.com/item?id=30968721
- https://news.ycombinator.com/item?id=17734289
- https://www.expat.com/en/forum/europe/spain/1057003-renting-through-idealista.html
- https://uk.trustpilot.com/review/idealista.com
- https://www.thelocal.de/20230810/interview-how-i-was-scammed-out-of-e4000-for-a-berlin-apartment
- https://www.thelocal.de/20240308/complete-shock-how-sophisticated-scammers-are-targeting-desperate-berlin-tenants
- https://maddyodom.substack.com/p/what-to-know-about-renting-an-apartment
- https://ie.trustpilot.com/reviews/6967a948541a4c8404cd2893
- https://www.trustpilot.com/review/rentslam.com
- https://www.iamexpat.de/expat-info/germany-news/berlin-and-hamburg-expats-are-among-unhappiest-world-2023
- https://www.thestudentroom.co.uk/showthread.php?t=5899368
- https://www.trustpilot.com/review/www.spotahome.com
- https://expats.de/en/bureaucracy/rent-apartment-germany/
- https://gs.statcounter.com/platform-market-share/desktop-mobile/netherlands/2021
- https://gs.statcounter.com/platform-market-share/desktop-mobile/spain
- https://gs.statcounter.com/platform-market-share/desktop-mobile-/france
- https://gs.statcounter.com/platform-market-share/desktop-mobile-tablet/germany
- https://www.immobilienscout24.de/wissen/mieten/wohnungssuche-wann-gibt-es-die-meisten-angebote.html
- https://ecommerce-europe.eu/wp-content/uploads/2024/10/CMI2024_Complete_light_v1.pdf
- https://rentslam.com/en/rental-agent/
- https://yourexpatbroker.nl/en-gb/35-f30e/housing-rental-agent-for-expats-in-amsterdam
- https://www.anders-relocation.de/10-tipps-fuer-die-wohnungssuche-berlin/
- https://quininvestment.com/lohnt-sich-ein-makler-bei-der-wohnungssuche-in-berlin/
- https://avantgardetransaction.fr/chasseur-location-appartement
- https://rubirent.com/post/honorarios-de-la-agencia-inmobiliaria-en-el-alquiler-qui%C3%A9n-paga-la-comisi%C3%B3n-tras-la-ley-de-vivienda/
- https://www.eldiario.es/politica/estudio-viabilidad-personal-shopper-tretas-inmobiliarias-saltarse-ley-cobrar-honorarios-inquilino_1_10280373.html

### 10.3 Competitors and patterns (all unopened; C0 protocol in §10.0)
- https://housinganywhere.com/pricing/tenants
- https://housinganywhere.com/secure-payments
- https://housinganywhere.com/introducing-tenant-protection
- https://apps.apple.com/us/app/-/id6738123016
- https://ie.trustpilot.com/review/housinganywhere.com?page=3
- https://www.spotahome.com/how-it-works
- https://www.spotahome.com/tenant-guarantees
- https://apps.apple.com/us/app/spotahome-apartments-rooms/id1304349562
- https://www.vitepromo.com/en/voyage-loisirs/code-promo-spotahome
- https://www.startupranking.com/blueground
- https://expatsi.com/housing-blueground
- https://prod1.wunderflats.com/
- https://wunderflats.com/en/help/post/75000062964
- https://relocate.me/relocation-company/wunderflats
- https://www.trustpilot.com/review/wunderflats.com
- https://www.crunchbase.com/organization/homelike
- https://www.nestpick.com/faqs/
- https://renthunter.nl/the-ultimate-guide-to-using-nestpick-com-for-apartment-hunting/
- https://rentslam.com/en/rentals/amsterdam/
- https://rentslam.com/en/rentals/amsterdam/houses/
- https://findify.nl/alternatives/rentslam/
- https://rentola.nl/en/terms-and-conditions
- https://rentola.nl/en/how-it-works
- https://uk.trustpilot.com/review/rentola.nl?page=3
- https://ui.awin.com/merchant-profile/69422
- https://uprent.nl/rental-platform-overview/rentbird
- https://ca.trustpilot.com/review/rentbird.nl
- https://www.nlcompass.com/guides/rental-alert-tools-netherlands
- https://daisycon.com/no/kampanjer/17650-huurwoningen-nl
- https://www.immobilienscout24.de/lp/mieterplus-info.html
- https://www.immobilienscout24.de/suchen-finden-einziehen/bewerben.html
- https://www.expath.de/how-do-you-find-a-flat-in-berlin/
- https://www.hbhousing.nl/en/rent-property/
- https://www.pararius.com/real-estate-agents/amsterdam/hps-rentals
- https://www.rotsvast.nl/faq/wat-zijn-de-kosten-voor-expat-verhuur-via-rotsvast/
- https://www.rotsvast.nl/diensten/expats-relocation-service/
- http://expat2holland.com/
- https://www.we4expats.nl/housing-in-amsterdam/
- https://www.xpats-service.com/
- https://www.housingnco.com/relocation-to-amsterdam
- https://www.wooninfo.nl/nieuws/2015/04/how-to-reclaim-unjust-agency-fees/
- https://acm.nl/en/publications/publication/14170/ACM-sees-positive-developments-in-rental-agency-market
- https://www.flat-me.fr/honoraires
- https://apparte.fr/chasseur-location-paris-et-idf/
- https://www.flatsearch.fr/tarif-chasseur-immobilier-paris
- https://www.detectimmobilier.com/honoraires-chasseur-immobilier-paris
- https://www.homeselect.paris/blog/comment-choisir-le-meilleur-chasseur-d-appartement-a-paris-guide-complet-et-conseils-pratiques
- https://fgrelocation.com/expatriation-garant-france-visale/
- https://barcelonahomehunter.com/rental-search-relocation-support-barcelona/
- https://www.remoters.io/en/rentals/barcelona
- https://relocation.madrid/en/relocation/home-search/
- https://blogprofesional.fotocasa.es/personal-shopper-inmobiliario/
- https://immotecnics.com/servicios/personal-shopper-inmobiliario/
- https://www.expatinfodesk.com/destinations/barcelona/accommodation/finding-a-home/
- https://www.thelocal.de/20260219/is-your-flat-search-in-berlin-realistic
- https://www.berlinrelo.de/
- https://www.trustpilot.com/review/www.berlinrelo.de
- https://immodo-berlin.de/blog/en/maklervertrag-berlin-expat-guide/
- https://freakbob.blog/mietmakler/
- https://www.expath.de/relocation/
- https://www.farawayhome.com/en/berlin/expat-relocation-guide
- https://www.crownrelo.com/office/amsterdam
- https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel
- https://www.growthwaves.io/p/the-113-screen-onboarding-that-doesnt
- https://growthmodels.co/noom-marketing/
- https://lemonade.com/nl/en
- https://uxreactor.com/lemonade-ai-disrupts-insurance-industry/
- https://www.insurancethoughtleadership.com/customer-experience/lemonades-marketing-genius
- https://www.trypropel.ai/resources/blogs/hims-and-hers-customer-retention-strategy-glp1
- https://www.convertflow.com/campaigns/hims-full-funnel-marketing-examples-templates
- https://typebot.com/blog/quiz-funnel-examples
- https://gummble.com/blog/duolingo-onboarding-flow-analysis
- https://theuxologist.com/case-studies/habit-forming-within-onboarding
- https://www.revolut.com/en-HU/legal/remote-eletronic-onboarding-process/
- https://raw.studio/blog/how-revolut-uses-4-onboarding-ux-tactics/
- https://aadilsyed.medium.com/the-wrapped-phenomenon-how-we-learned-to-love-sharing-our-data-6392034f995f
- https://www.unilink.us/blog/how-does-spotify-wrapped-work
- https://thebrandhopper.com/brand/a-case-study-on-spotify-wrapped-the-storytelling-phenomenon/
- https://github.com/voltagent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md
- https://landdding.com/blog/minimal-landing-page-design-examples
- https://rauno.me/craft/vercel
- https://summify.io/discover/how-stripe-built-their-new-website-ypzNhw/
- https://skift.com/2025/11/06/airbnb-is-testing-a-what-box-for-natural-language-search/
- https://ixd.prattsi.org/2021/09/design-critique-airbnb-website/
- https://techbuzzireland.com/2025/05/14/redesigned-airbnb-app-now-available/
- https://help.typeform.com/hc/en-us/articles/360029615911-What-s-the-average-completion-rate-of-a-typeform
- https://www.typeform.com/blog/survey-response-rate
- https://coglode.com/nuggets/endowed-progress-effect
- https://knowledge.wharton.upenn.edu/podcast/knowledge-at-wharton-podcast/the-lowdown-on-customer-loyalty-programs-which-are-the-most-effective-and-why/

### 10.4 Behavioural science and law (all unopened)
- https://behaviordesign.stanford.edu/resources/fogg-behavior-model
- https://ideas.repec.org/a/pal/palcom/v12y2025i1d10.1057_s41599-025-05000-w.html
- https://en.wikipedia.org/wiki/Zeigarnik_effect
- https://knowledge.wharton.upenn.edu/?p=5630
- https://siliconcanals.com/t-car-wash-loyalty-cards-endowed-progress/
- https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf
- https://rti.org/publication/effectiveness-progress-indicators-web-surveys-front-counts
- https://openaccess.city.ac.uk/id/eprint/14427/
- https://pubmed.ncbi.nlm.nih.gov/5969145/
- https://www.atticusli.com/replication-crisis/foot-in-the-door/
- https://dash.harvard.edu/handle/1/12136084
- https://ideas.repec.org/a/oup/jconrs/v22y1995i1p17-26.html
- https://synapsesocial.com/papers/W2038007153
- https://yorkspace.library.yorku.ca/items/1237abd1-7e5a-4a48-bb27-c6e37bac1c34
- https://www.bfskinner.org/wp-content/uploads/2015/05/Schedules_of_Reinforcement_PDF.pdf
- https://www.simplypsychology.org/schedules-of-reinforcement.html
- https://newsroom.spotify.com/?p=32167
- https://www.springlex.eu/en/packages/dsa/dsa-regulation/article-25/
- https://www.dlapiper.com/insights/blogs/mse-today/2025/the-amsterdam-court-putting-the-dsa-into-practice
- https://pubpub.maastrichtuniversitypress.nl/pub/chapter-6-dark-patterns-as-infringements-of-eu-consumer-law
- https://www.osborneclarke.com/insights/digital-fairness-act-unpacked-dark-patterns
- https://www.europarl.europa.eu/RegData/etudes/ATAG/2025/767191/EPRS_ATA(2025)767191_EN.pdf
- https://www.icpen.org/sites/default/files/2020-03/2020%20-%20acm-guidelines-on-the-protection-of-the-online-consumer.pdf
- https://www.acm.nl/en/publications/acm-publishes-update-rules-regarding-online-deception
- https://www.mondaq.com/dodd-frank-consumer-protection-act/1296420/update-guide-to-online-consumer-protection-acm
- https://www.acm.nl/en/publications/acm-confronts-online-stores-using-misleading-countdown-timers-their-practices
- https://acm.nl/en/node/25515
- https://www.stibbe.com/publications-and-insights/game-over-for-dark-patterns-acm-fines-epic-for-unfairly-targeting
- https://ec.europa.eu/commission/presscorner/api/files/document/print/en/ip_23_418/IP_23_418_EN.pdf
- https://deceptive.design/articles/behavioural-study-on-unfair-commercial-practices-in-the-digital-environment-dark-patterns-and-manipulative-personalisation
- https://uoc.edu/en/news/2022/217-unfair-online-commercial-practices
- https://arthurcox.com/knowledge/eu-digital-fairness-fitness-check-shines-light-on-deceptive-patterns
- https://www.beuc.eu/sites/default/files/publications/BEUC-X-2025-110_Towards_the_Digital_Fairness_Act.pdf
- https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act
- https://digitalfairnessact.com/
- https://theeuropeanpost.eu/research-analysis/digital-fairness-act-targets-dark-patterns-before-2027/
- https://www.dentons.com/en/insights/articles/2026/june/9/the-digital-fairness-act-dark-patterns-addictive-designs-and-influencer-marketing
- https://webgate.ec.europa.eu/e-justice/639/EN/consumer_rights_directive_201183
- https://www.deceptive.design/cases/airbnb-s-assessment-by-the-consumer-protection-cooperation-network
- https://www.euronews.com/my-europe/2018/09/20/airbnb-complies-with-eu-consumer-regulation-demands
- https://www.hospitalitynet.org/external/4068258.html
- https://storage02.forbrukerradet.no/media/2025/06/beuc-l-2025-070-cpc-external-alert-on-unfair-commercial-practices-by-fast-fashion-trader-shein.pdf
- https://www.economie.gouv.fr/files/files/directions_services/dgccrf/documentation/publications/dossier_de_presse/dossier-de-presse-dgccrf-e-commerce.pdf
- https://www.modernisation.gouv.fr/files/2023-06/Rapport_de_diagnostic_lutter_contre_les_pratiques_commerciales_d%C3%A9loyales_en_ligne_0.pdf
- https://kohenavocats.fr/2026/05/07/amende-dgccrf-pratique-commerciale-trompeuse-controle-ddpp-recours/
- https://www.vzbv.de/urteile/mobilfunk-countdown-fuer-angeblich-befristetes-sonderangebot-war-irrefuehrend
- https://shopbetreiber-blog.de/lg-deggendorf-countdown-uhr-im-online-shop-allein-nicht-irrefuehrend
- https://www.it-recht-kanzlei.de/vorsicht-bei-countdown-angeboten-irrefuehrende-uhr.html
- https://www.sbs-legal.de/blog/countdown-werbung-zwischen-zulaessigkeit-und-irrefuehrung
- https://arxiv.org/pdf/1907.07032
- https://www.acm.nl/sites/default/files/old_publication/publicaties/13348_toezegging-direct-wonen-verhuur-makelaars-2014-07-29.pdf
- https://acm.nl/sites/default/files/documents/2019-09/last-onder-dwangsom-goeth-vastgoed-voor-rekenen-van-verboden-bemiddelingskosten.pdf
- https://www.legislation.gov.uk/ukpga/2024/13/schedule/20/paragraph/7
- https://asa.org.uk/rulings/uppholdings-ltd-a23-1200152-uppholdings-ltd.html
- https://democracy.york.gov.uk/%28S%28er5fig3cbkjmjx55ekdxrgfc%29%29/documents/s11846/Annex%202.pdf
- ELI links for counsel (not opened): http://data.europa.eu/eli/dir/2005/29/oj · http://data.europa.eu/eli/dir/2011/83/oj · http://data.europa.eu/eli/reg/2008/593/oj

### 10.5 Technology and motion
Opened today (primary data): 
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/animation-timeline.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/html/elements/input/month.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/browsers/firefox.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/browsers/safari.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/browsers/chrome.json
- https://raw.githubusercontent.com/web-platform-dx/web-features/main/features/view-transitions.yml.dist
- https://raw.githubusercontent.com/web-platform-dx/web-features/main/features/view-transitions.yml
- https://raw.githubusercontent.com/web-platform-dx/web-features/main/features/scroll-driven-animations.yml.dist
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/html/reference/elements/input/month/index.md
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/view_transition_api/index.md
- https://registry.npmjs.org/web-features
- https://registry.npmjs.org/@mdn%2Fbrowser-compat-data
- https://raw.githubusercontent.com/GoogleChrome/webdev-infra/main/README.md (confirms web.dev content left GitHub, so the Baseline blog post has no raw mirror)
Read by the technology pass from the same hosts or from a 13 Oct snapshot:
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Document.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/view-transition.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/property.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/html/global_attributes.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/html/elements/script.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLCanvasElement.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/font-face.json
- https://github.com/Fyrd/caniuse
- https://github.com/aosp-mirror/platform_frameworks_base/blob/main/data/fonts/fonts.xml
- https://registry.npmjs.org/lottie-web/-/lottie-web-5.13.0.tgz
- https://registry.npmjs.org/@lottiefiles/dotlottie-web/-/dotlottie-web-0.81.0.tgz
- https://registry.npmjs.org/@rive-app/canvas-lite/-/canvas-lite-2.44.2.tgz
- https://registry.npmjs.org/@rive-app/canvas/-/canvas-2.44.2.tgz
- https://registry.npmjs.org/three/-/three-0.186.1.tgz
- https://registry.npmjs.org/@fontsource-variable/inter/-/inter-5.3.0.tgz
Seen in snippets only (hosts blocked):
- https://caniuse.com/view-transitions · https://caniuse.com/cross-document-view-transitions
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share · https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate · https://developer.mozilla.org/en-US/docs/Web/API/Badging_API · https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob · https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API · https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using · https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions
- https://web.dev/articles/defining-core-web-vitals-thresholds · https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available · https://web.dev/blog/popover-api · https://web.dev/articles/files/share-files · https://web.dev/blog/webgpu-supported-major-browsers · https://web.dev/articles/css-size-adjust
- https://developer.chrome.com/blog/view-transitions-in-2025 · https://developer.chrome.com/blog/prerender-pages · https://developer.chrome.com/docs/capabilities/web-apis/badging-api
- https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ · https://webkit.org/blog/17862/webkit-features-for-safari-26-4/ · https://webkit.org/blog/17938/webkit-features-for-safari-26-5/ · https://webkit.org/blog/17818/announcing-interop-2026/ · https://webkit.org/blog/14112/badging-for-home-screen-web-apps/
- https://shopify.dev/docs/storefronts/themes/best-practices/performance/reduce-cls-font-swapping · https://www.infrequently.org/page/2/ · https://infrequently.org/2022/12/performance-baseline-2023 · https://rive.app/docs/runtimes/web/canvas-vs-webgl
- https://www.edpb.europa.eu/documents/guideline/guidelines-22023-on-technical-scope-of-art-53-of-eprivacy-directive_en · https://www.taylorwessing.com/fr/insights-and-events/insights/2020/10/french-data-protection-authority-publishes-new-guidelines · https://acm.nl/en/node/23838 · https://www.mintlify.com/lochie/web-haptics/advanced/browser-support

### 10.6 Unverified, with the reason (the short list; the ledger in §10.0 is the authority)
- Every market, competitor, behavioural and regulator page: read via search-result snippets only (ledger A, B, C, L, M rows); verified today only the T rows (browser data) and the R rows (repo measurements).
- Reddit quotes: not retrievable (search API refuses reddit.com; direct fetch blocked); substituted with Hacker News, Trustpilot, Expat.com, The Local, TU Delft and blogs, none opened, wording unconfirmed.
- Rent bands per city: not obtained for any city and deliberately not derived (§1.2); the two €/m² figures are snippet-level averages of unknown scope.
- Persona ages, employers, devices and budgets: removed in this writing as unsourced; what remains is labelled inference.
- Competitor first screens: none seen (13 URLs refused at CONNECT); BerlinRelo's row is single-source in every cell; Homelike's status unresolved; Spotahome fee from promo sites; RentSlam trial, Rentbird and Stekkies prices conflict across sites; Huurwoningen Premium price from undated affiliate pages.
- Statutory wording of UCPD Annex I points 7 and 26, Article 7(4)(c), CRD Articles 7(3), 8(8), 16(a), 22, Rome I Article 6, the national transpositions, Commission Notice 2021/C 526/01 §4.2.7, CJEU Planet49, Price Indication Directive Article 6a, EDPB 2/2023 v2.0 wording: memory or secondary; counsel items 1 to 6 (§3.4).
- DSA 25(3) guidelines status (Osborne Clarke, about 441 days old); Commissioner McGrath's October 2026 statement (secondary outlet); the €7.9bn Fitness Check figure (law-firm summaries); LG Deggendorf and LG Hanau appeal outcomes (pending as reported).
- Nunes and Drèze figures, Freedman and Fraser percentages and r ≈ 0.17, Conrad et al. 2010 abstract, peak-end 2003 details, Spotify Wrapped 2024 figures, Lemonade's 90 seconds, Noom and Duolingo lifts, Typeform completion data: secondary or vendor.
- gtag/js size on these pages: host blocked; not measured.
- Per-country caniuse percentages, the Samsung Internet to Chromium mapping, the WebKit 26.4 compositor note, Alex Russell's 2024 figures, the web.dev CWV page, the iOS "switch checkbox" haptics workaround, Safari ITP's 7-day eviction: the technology pass's own computation or memory.
- All millisecond figures: headless Chromium on a Linux sandbox with emulated throttling, served uncompressed; relative indicators, not device measurements. Library sizes: gzip -9, not Brotli; three.js minified with esbuild.
- Whether `content-visibility: auto` interferes with the reveal observer or with `animation-timeline: view()` on this page: not tested. Whether GA4 defers hits for prerendered pages: not checked; prerender is recommended against regardless.
- Dutch, Catalan, French and German legal facts quoted on the pages (deposit caps, AICAT, loi Hoguet, §34c GewO, WoVermRG): consistent with brief §4, unverified here (government hosts blocked); brief §4 says every line is "verify".
- WCAG thresholds applied in the critique (4.5:1, 3:1, 24×24 px target size; Apple 44 pt, Material 48 dp): standard figures cited from memory.
- The Google rating "4.9 · 47" and "500+ housed": not checked against Google or BOOM records; the finding is only that they are unlinked and unqualified on a city page.

---

## 11. The v2 spec, decided by the panel (15 to 16 Oct 2026)

**How it was decided.** Four architectures were written to build-ready depth by four independent agents (A "the diagnostic is the hero" from §7.1 with C's deep-link landing and waitlist first screen; B "two doors on one screen" from §7.2; D "the immersive flight", a new concept written to take the founder's words as far as the honesty rules allow; E "the plain file", the no-waste control). Four judges scored them independently: conversion for this audience, honesty and law and brand, feasibility and performance in this repo, and the founder's eye (his documented approvals and rejections). Tally out of 40: A 31.5, D 27.5, E 25.5, B 24. All four judges named A the winner; three of the four said the same thing about it: A's skeleton, D's artifact and desk block, E's five facts, B's write-back and consent guard. The synthesis agents of the panel hit the account's session limit twice; this section is written by the engineer from the four concepts and the four verdicts, which are kept verbatim in the session's workflow journal. The adversarial check of the spec runs on the built diff (task #10) instead of on the prose.

### 11.1 What the page becomes

One DOM for the five desks. The first screen is a question, not a form: the lockup, a two-line H1 with the city word legible at first paint (cells settle once, never re-spun), one lead line, the Check-in's first question, then the five facts a scam-primed visitor needs before any tap, then the door. The ticket is the boarding pass: one live card that lands under the answered step on tap 1 at 390 and sits blank in the sticky right column at 1440 ("Your plan prints here as you answer"), resolving as a rule the JSON declares, never a guess (§3.2: the steps become stage → where → when, so `zero` and `found` resolve on tap 1, `shortlist` on tap 2; the third tap adds the note, the refusal line on zero plus soon, the eight papers and the share row). The free file is the one door, "Open my file" everywhere; the till is the second step beside the refund rule on sell desks. Prices on the plates are text; boards only on the title, the pass and the OPEN and PAID states. The rail, the family strip in the chrome, the route line, the timeline, the truth band, the bottom band, the orbs' drift, the grain, the glow, the scroll progress, the tilt, the parallax and the floating pass are gone. The static technical grid and the static orbs stay: the page is still a BOOM page.

### 11.2 The first screen, 390 × 844

Nav (lockup `BOOM │ AMSTERDAM · TENANT SIDE`, burger) · H1 "Your home in / AMSTERDAM" · lead (sell: "Found by someone on your side. Three taps say which service fits, and what it costs."; waitlist: "Opening with a registered local partner. Today: your file, your dossier readiness, the six checks before you sign.") · the Check-in card: `CHECK-IN · 1 OF 3`, "Where are you in the search?", three options with their pass code · the five facts as a run-in list: **Paid by** the brief's §4 must-state verbatim ("We work exclusively for you; never paid by landlords." on Amsterdam, "You hire us; we do not act for the landlord." on Madrid, the "Launching with…" line on the waitlist desks) · **From abroad** ("Yes. Live video at the viewing, a written report.") · **If we find nothing** (sell: the refund rule verbatim; Berlin: "Due only once you sign a lease. If we decline the search in the first call, nothing is owed."; Barcelona and Paris: "Charged only when the desk opens. If we decline the search in the first call, nothing is owed.") · **Who answers** (derived from the desk block: the person, "same working day", the desk hours in CET, and a live line "it is 18:10 there, 21:40 for you" with JS) · **The company** (derived from `_shared.json`: legal name, P.IVA, "4.9 on Google in Rome, 47 reviews", linked to the review profile when the founder supplies the URL) · the skip link "Rather write first? Open a file" · the door's top edge. After tap 1 the answered step collapses to one line with "change", the next question appears, and the pass card enters under it: plan, price on its board, condition, the rule's why, the refund rule on Full Search, inside the viewport (measured by geometry; `scrollIntoView` only when the card's bottom would fall below the fold).

### 11.3 The first screen, 1440 × 900

Left 7 of 12: H1, lead, the Check-in card (options in one row), the facts, the skip link. Right 5 of 12, sticky: the pass card blank from load, the door under it. One action on screen: the door's. The nav carries "Open my file" as a text link. A `ResizeObserver` releases the sticky column when it grows taller than the viewport. Below 920 px the two wrappers become `display: contents` and the items take the 390 order.

### 11.4 The pass card

Lamina, route `<from> ✈ <IATA>`, the city on cells, PLAN, PRICE (board, flipped once per plan), the plan's condition, the why line, the refund rule (Full Search, sell desks), the when note and the refusal line (after tap 3), the eight papers with the `@property` meter and the ready line (after tap 3; nothing pre-ticked; untouched papers read "Tap the papers you hold", never "0 of 8"), the doors ("Open my file" → `#contact` with `data-service`; sell desks: "Pay and start · €500" as the second, outlined button, `data-pay`), the share row (WhatsApp, Copy link), the passenger and origin fields and Save/Share. Pending state after a `shortlist` tap: "TWO PLANS FIT" and the sentence derived from the rules, no price, no board. Export: 1080 × 1920 through an `OffscreenCanvas` in a blob Worker built from the same `drawPass` source (one copy), WebP where the browser encodes it (`blob.type` sniffed; Safari returns PNG), main thread behind a busy state otherwise. Gate, Seat, Status and the barcode are gone.

### 11.5 The door and the end states

Five visible fields: name, email, phone or WhatsApp (optional), move-in as a native `<select>` of the next 20 months from `_shared.json.moveInFrom` (value `YYYY-MM`, label "February 2027", first option "Not sure yet"; the JS hides months already passed; the build warns when the anchor is older than two months), budget. The service: `details.planline` wrapping today's radio chips, open when no plan is written, closed with the summary "Full Search · €500 · incl. VAT · Egidi Immobiliare S.r.l. · change" once the Check-in writes one; with no plan the summary says "Which service? Three taps tell you ↑". The chips print price and short condition; under them, on sell desks, the refund rule, so €500 never stands alone. "More details" folds situation, neighbourhoods and message. Hidden `checkin` and `dossier`, the honeypot, one gold button "Open my file · free · same-day reply", the consent line at 11.5 px. OPEN: the tick, the OPEN board, "Your file is open.", then three lines: the reply window computed from the desk block against the desk clock ("By 19:00 CET today" · "Tomorrow from 09:00 CET" · "Monday from 09:00 CET"; "Same working day" without JS), "Nothing to prepare: keep this link, your ticket and papers live in it", "Nothing by tomorrow? Write to hello@boom-rome.com"; on sell desks the offer to pay for the chosen plan with the refund rule under it. PAID: as today, plus the same recourse line. The paid dedupe key moves to `sessionStorage`. The till is `dialog#ov` opened with `showModal()` (fallback: the `open` attribute in place where `showModal` is absent).

### 11.6 The waitlist variant

Lead as in 11.2; every plan carries its own `condition` and `conditionLong` read by chip, plate, pass, fees row and Offer description (Berlin Full Search: "incl. VAT · on signing" / "List price. Due only once you sign a lease; nothing before."; every other waitlist plan: "incl. VAT · at opening" / "List price. Charged only when the desk opens."); the note under the chips becomes "List prices, VAT included. Each plan says when it is charged."; one door on the pass; no dialog, no `data-pay`, `CHECKOUT:false`; the refusal line in the waitlist wording. The brief v1.1 places (chips, plate price line, fees row, PreOrder Offers) are kept in full.

### 11.7 Motion, every item with its fallback

Load → the city word settles once (≤ 600 ms; reduced motion: set still; no JS: text). Step answered → the answered step collapses and the next appears inside a scoped same-document view transition (≤ 300 ms, plain `startViewTransition(callback)`, skipped when the document is hidden; without the API a synchronous swap; reduced motion: instant). Plan resolves → the price board flips once (re-flips only when the plan changes; reduced motion: final digits). Paper ticked → the meter moves through a typed custom property (450 ms; reduced motion: instant). Blocks enter → opacity and a 16 px rise, children one beat apart (IntersectionObserver; without it, shown; `<noscript>` shows all; reduced motion: static). Plates and checks entering where `@supports (animation-timeline: view())` holds → a scroll-bound lift (otherwise the reveal; reduced motion: none). Submit in flight → the plane glides on the button. Lead accepted or Stripe return → the tick draws and the small board spells OPEN or PAID. The till → the dialog rises 300 ms. Deep-link landing → nothing moves; the pass is present at first paint. Nothing loops at rest: no 19-second re-spin, no 7-second plane, no float, no infinite lamina sweep, no orb drift, no pulsing dots.

### 11.8 What persists, what is shared, what is measured

The URL is the memory: `#checkin=<stage>.<where>.<when>.<docs>[.<via>]`, rewritten with `replaceState` on every answer so a reload or a tab reopened the next evening resumes the ticket. Partial links land on the first unanswered step with the known answers ticked and the banner "1 of 3 answered, from the link you received"; a complete link from someone else lands on the ticket with "Your friend's answers. Change any of them, then your plan is yours." Papers travel only on the visitor's own Copy link (`via=l`); WhatsApp and the pass share strip the mask. `sessionStorage` holds the paid dedupe key; `localStorage` is touched only by the consent script, which now waits while a dialog is open and, on the city pages, until the first scroll or tap or eight seconds, so the plate never lands over the first question. Events added per §8.2: `checkin_start`, `checkin_step_view`, `checkin_result_view`, `checkin_abandon`, `checkin_skip`, `door_prefill`, `pass_save`, `pass_share`, `link_copy`, `deeplink_landing`, `faq_open`, `paybar_click`, `form_error`, `clock_shown`.

### 11.9 Type, colour, budget

Gold `#FFD700` only; the four text steps with `--t4` retired from anything that carries meaning (micro labels at 11 px minimum in `--t3`); no weight below 300 at or under 640 px; zero web fonts; targets 44 px or more. First-party weight ≤ 90 KB gzipped (HTML, city CSS, city JS) and city JS ≤ 30 KB gzipped, computed by the build with `node:zlib` and refused above; CLS 0 (the title reserves its cells only with JS, as today); the pass export off the main thread.

### 11.10 Data, build rules, tests

Per city JSON: `hero.lead` (≤ 20 words) replaces `eyebrow`, `h1Em`, `sub`, `trust`, `servingLead`, `servingNames`; `facts` holds the three authored rows (`paid`, `abroad`, `nothing`), the fourth and fifth are derived; `desk { person, role, timeZone, tzLabel, hours { from, to }, days }`; `door { label, sub }` replaces `nav.cta`, `form.submit`, `form.submitSub`, `paybar`, `plans[].cta`, `checkin.result.ctaFile*`; `till.label` on sell desks replaces `checkoutCopy.btn`, `offer.cta`, `result.ctaSearch`; `plans[].condition` and `conditionLong` replace `per`; `form.moveIn.unsure` replaces the placeholder; `checkin.steps` in the order stage, where, when; `checkin.refusal`, `checkin.landing { partial, friend }`, `checkin.share { plan, papers, pass }`; `checks.items[].flag` absorbs the truth band; `machine`, `how.tline`, `how.tlineLand`, `truth`, `band`, `footer.status` and the FAQ item "I'm moving from Rome with BOOM" are removed. `_shared.json`: `refund.rule`, `rome { rating, reviews, since, reviewUrl }` (the URL is the founder's; empty until he supplies it, and a `live:true` sell desk is refused without it), `moveInFrom`. Build rules added: steps order and `resolvesAt` by the second step; both condition strings on every plan, "sign" on Berlin Full Search, "VAT" on sell desks; the refund rule in the same block as every visible €500 on a sell desk (door, Full Search plate, pass template, sheet, fees row) and absent on waitlist desks; one label; Rome proof labelled with the word Rome and linked when the URL exists; the desk block valid (`Intl` accepts the time zone, HH:MM, from before to, days 0 to 6); the month select from the anchor; no `flap-prezzo`; share strings ≤ 120 characters before the URL and price-free; no "€" in the strip; the gzip gate; `hero.lead` ≤ 20 words; the removed keys refused as leftovers. Tests: `tests/cities/run.mjs` slices move (hero = H1 + lead, facts on their own ceiling ≤ 70, the Check-in to its `/CHECK-IN` marker, the door without `<option>` text), the new rules pinned with their mutations; `tests/cities/ui.mjs` measures the pass by geometry after each resolving tap at 390 and 1440, the pending state, the papers and the meter, the deep links with `via`, the strip, the dialog, the clock, the no-JS and reduced-motion paths, and the worker export.

### 11.11 Brief v1.3 amendments (the founder signs them by approving the preview)

1. The Check-in is the hero, with the door; seven blocks plus the footer (v1.2 said "inside section 02").
2. Step order stage → where → when; the ticket is live and resolves by the second tap.
3. Boards only on the title (one settle), the pass and the end states; plate prices as text (v1.2 and CLAUDE.md recorded boards on the plates).
4. The family strip leaves the fixed chrome: the suite is a derived footer column and the mobile menu.
5. One label, "Open my file"; the till's label "Pay and start · €N"; the pay bar carries no price.
6. Rome proof labelled Rome; "500+ housed" leaves the city pages; a named person on every desk (name only).
7. The move-in field is a native month select; the lead API prints the month label.
8. The depth list of v1.2 (tilt, parallax, float, rail) is withdrawn; scroll-driven entrances and the pass perspective stay.
9. Each plan carries its own condition string; Berlin's Full Search says "sign" on every reader.
10. Fonts: zero web fonts recorded as the v2 decision; the 90/30 KB budget pinned by the build.

### 11.12 What needs the founder's facts, not his signature

The Google review URL for Rome (`_shared.json.rome.reviewUrl`); a photograph, or the decision to stay name-only; the desk hours and days as they are really kept (the pages ship 09:00 to 19:00 CET, Monday to Friday, as the desk block, visible on every page so the promise is the desk's own); the partner names and horizons on Barcelona, Paris and Berlin; the VAT place of supply and the counsel items of §3.4 before any `live:true`; the sample viewing report and the Dutch dossier template (§3.5).

### 11.13 As built (16 Oct, after the suites)

Five things the build taught that the spec did not say, recorded so the next reader does not re-derive them:

1. **The consent plate arms on the reader's own move, never on the scroll event.** The page scrolls itself to land the pass after the first tap; a `scroll` listener armed the plate 600 ms into the diagnostic. The signal is a wheel turn, a finger scroll (`touchmove`), a tap outside the diagnostic, the pass and the door, or a key. Ceiling 8 s. An open `<dialog>` holds it back.
2. **The pass lands by layout geometry.** A `getBoundingClientRect` read during the entrance animation (translateY −12px, rotateX 10°) put the ticket a dozen pixels under the fold on a 390 × 844 screen. The landing uses the `offsetTop` chain, subtracts the strip when it shows, and never scrolls the pass under the fixed bar.
3. **The facts ceiling is 85 words, not 70.** The §11.8 number was written before the two derived rows existed; measured, the five rows run 73 to 80 (Berlin longest, its legal wording). The ceiling sits just above, like every other budget.
4. **`[hidden]` is the truth of a state.** The pass's four bodies carry `hidden` in the markup and the first CSS rule makes it win over every state rule; the JS toggles the attribute on each render. The first build showed a resolved plan box that stayed hidden — the same class of defeat as v1.2's, caught by the smoke before the suite.
5. **Per step, a "change" tag, inline.** "Change my answers" as a full line under each answered chip read as three identical buttons; the control is the word "change" beside the chosen chip, inside the chip row.


### 11.14 After the adversarial review (17 Oct)

Forty-nine agents read the v2 commit across seven lenses; fourteen findings were confirmed in Chromium, twenty-eight could not be refuted (the refuters hit the weekly subagent ceiling) and were read one by one. Nearly all were closed in one commit; what the review changed in the design itself, as opposed to the code:

1. **The DOM order is the phone's order, pass included.** §11.1 said "one DOM, reordered with `display:contents` + `order`". The pass was printed after the facts and moved up by CSS, so Tab and a screen reader met it after the skip link and the facts, 1,500 px below where it appeared. The build now prints the pass right after the Check-in; at ≥920 the JS moves the node to the top of the right column. A node move keeps state and listeners; `order` only ever moves pixels.
2. **A chip the reader chose is theirs, by record not by intention.** The form remembers who wrote the chip (`data-plan-from`: checkin · chip · plate). The Check-in writes only where nothing or itself wrote, and only when its plan changed — a paper tick is a re-render, not a new plan.
3. **The consent plate waits while the reader is at work.** The first-move rule (§11.13.1) was not enough: on a 375 px phone the 8 s ceiling put the plate on the Check-in's options, and after a tap it covered the ticket's own door. It now also waits while the unanswered Check-in or the ticket is on the screen, 45 s at most. Nothing is stored before the choice, so the wait costs the reader nothing.
4. **Boards are decorative; the fact is text.** A Solari cell holds every glyph twice (top and bottom flap): the price board read "€ € 5 5 0 0 0 0" and the title "A A M M S S …". Every board is `aria-hidden`; the amount and the city sit beside them as visually hidden text. One small live region announces the plan once per plan; the plan box, with sixteen controls, is not live.
5. **The page's promises follow the desk clock.** The days are printed ("desk Mon–Fri 09:00 to 19:00"), the zone label follows Intl (CEST seven months a year), "free · same-day reply" becomes the window when the desk is closed, "Nothing by tomorrow?" became "Nothing by then?", and the paid state promises "within its first open hour", not "within the hour" at Saturday 23:00. Berlin says one thing about when it charges.
6. **The sticky column never goes static.** On every laptop the column (pass + door) is taller than the viewport, so the "release when tall" rule meant no sticky at all. It now sticks by its bottom (a negative `top`), the standard pattern for tall sidebars.
7. **The live-ticket guard checks sameness, not existence.** `resolvesAt` returned 1 for a stage-only rule even when an earlier `where` rule shadowed part of it; the ticket would have printed a plan on tap 1 and switched it on tap 2. Tap 1 now requires every `where` to land on the same rule.

Left open, on purpose: the strip still sells the featured plan on the phone (the pass has its own button); the `#checkin=` fragment still carries the papers mask for the visitor's own resume (GA no longer receives the fragment: `page_location` is set without it); the checkout dialog's copy promises "the same working day", which the founder may want to tie to the desk clock as the OPEN card is.

### 11.15 The second verification (18 Oct)

After merging main (which had rewritten the consent script: the plate born hidden on a phone, 5 s, lifted above the bottom bar), a second verification found fourteen candidates; the refuters again hit the weekly ceiling, so each was read and closed by hand. Three change the design:

1. **No sticky column.** §11.14.6 is withdrawn. Measured at 1440 px the right column (pass + door) is taller than the left (1021 vs 719 px), so sticky had nowhere to move, and where it could, it hid the foot of the door. The CSS and the negative-`top` JS are gone; the test measures both heights.
2. **The live region lives in the Check-in.** On a phone the pass is `display:none` until the first tap, and a live region that appears together with its text misses its first announcement. The plan is announced from the Check-in; the third tap's note follows it.
3. **The plate waits only for what it would cover.** §11.14.3 measured the whole screen. It now measures its own box where `show()` would put it (after `lift()`) against the Check-in and the ticket: under a whole ticket it comes. Time spent in the till does not spend the 45 s.

The rest is code: one POST helper that gives up after 20 s (door and till never lock), the desk promise re-checked every minute, the contact error focusing the field actually filled, the pass entering once, a silent worker retired, the closing menu still under reduced motion, print forced black on white.
