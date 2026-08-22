# STUDIO ARSENALE — cosa costruire, cosa uccidere, cosa rifare (2026-08-19)

Richiesta del fondatore: *«ripensa profondamente e con max IQ scaltrezza e
brutalmente onesto tutte le opzioni di nuovi tool che puoi creare o sezioni
che ad oggi puoi ricreare»*.

La risposta onesta comincia da una misura, non da un'idea.

---

## 1 · Il metro: i cinque numeri che comandano

Ogni tool si giudica su UN criterio: quale di questi numeri muove, di
quanto, con che rischio. Tutto il resto è decorazione.

| # | Numero | Perché comanda |
|---|---|---|
| 1 | **Case in portafoglio** (mandati) | Il collo di bottiglia di un gestore non sono i lead: sono le case. I lead si comprano, le case si conquistano. |
| 2 | **Giorni-vuoto per casa** | Ogni settimana vuota = canone perso per sempre. È l'unico costo che non si recupera mai. |
| 3 | **Ore lead → firma** | A Roma un buon transitorio si brucia in ore. La velocità È il prodotto. |
| 4 | **€ incassati puntuali** | Già ben coperto (carta, SEPA, bonifico, solleciti a scala, riconciliazione). |
| 5 | **Ore/settimana dell'operatore** | L'unica risorsa non scalabile. Oggi (la coda) lavora qui. |

---

## 2 · La scoperta: il portale non ha bisogno di più tool. Ha bisogno del machete.

La sidebar admin ha **28 sezioni**. Censite una per una:

- **TRE centri di comando**: ⚡ Oggi (nuovo), 📊 Studio, ⚡ Command Center.
- **QUATTRO radar**: Property Radar e Property Finder nel portal, più
  `/radar` (la Centrale, quella vera) e `/pfs-command` (la plancia vera).
- **DUE "intelligence"**: Zone Intelligence e Market Intelligence,
  client-side — mentre l'unica intelligence VERA (il Perito, marketStats
  sui canoni firmati) vive server-side e si legge in `/radar`.
- **TRE studi foto**: Photo Studio (sezione portal), `/photo-lab`,
  `/media-studio` (il superset, l'unico completo).
- AdminFlats e Immobili (nomi che non dicono chi fa cosa), Landlord DB,
  "Rischio" (underwriting), "Zero" (relet), Inbox (conversations,
  desktop-only, superata dal cambio di mandato di Homie).

**Il danno non è estetico.** Ogni sezione morta o doppia: (a) ruba
credibilità a quelle vive — se Zone Intelligence mostra dati stantii,
l'operatore impara a non fidarsi delle pagine, comprese quelle giuste;
(b) rende ogni ricerca nel Prontuario più rumorosa; (c) costa parse e
manutenzione. **Il primo "nuovo tool" è il machete.**

### Kill list (fondi, reindirizza o parcheggia)

| Sezione | Verdetto | Perché |
|---|---|---|
| Command Center | → redirect a **Oggi** | Oggi È il command center, con le azioni dentro |
| Zone Intelligence | ✂ elimina | La verità di zona è marketStats del Perito → `/radar` |
| Market Intelligence | ✂ elimina | Idem — un'intelligence client-side su dati vecchi è disinformazione |
| Property Radar (portal) | → redirect a `/radar` | La Centrale è l'erede dichiarato |
| Property Finder (portal) | → redirect a `/pfs-command` | La plancia PFS è l'erede dichiarato |
| Photo Studio (portal) | → redirect a `/media-studio` | Il superset con publish rails |
| Inbox | fold in Lead/persona | Le conversations arrivano già come lead (homie/message) |
| Landlord DB / Rischio / Zero | parcheggio dietro Console | Da verificare uso reale; se muti in 30gg → elimina |
| AdminFlats | rinomina «Vetrina» | Il nome deve dire il mestiere: è il catalogo boomrome.com |

Da 28 voci a ~15. **Meno superficie = più fiducia = più velocità.**

---

## 3 · I tool nuovi — TUTTE le opzioni pensate, comprese le scartate

### TIER 1 — muovono un numero, costo basso, si fanno ora

**A. Il Tabellone del Vuoto** *(muove #2 — il numero che nessuna pagina
oggi mostra)*
Per ogni casa sfitta: giorni di vuoto × canone = **€ già persi**, contatore
che sale. E le azioni DENTRO la riga, tutte già costruite altrove:
«chi la cercava?» (`/api/leads/match-listing` — la ricerca rovesciata),
«richiama» (`/api/leads/richiamo`), stato Pubblicista (portalPubs),
«fuori fascia?» (Valutatore radar: asking vs fascia zona + assorbimento).
Il vuoto smette di essere invisibile e diventa una coda di lavoro.
*Effort: basso. Dati già in S + 3 API esistenti.*

**B. La Proposta al Proprietario** *(muove #1 — il più strategico)*
Il Radar Mandati già trova i privati fermi oltre l'assorbimento di zona.
Manca il colpo: **un tap → dossier di valutazione** — fascia canone dal
Valutatore (corretta sui FIRMATI, il dato che Casafari non ha),
assorbimento della zona, cosa fa BOOM, fee — impaginato PDF (pdf-lib,
design system esistente) + messaggio WhatsApp pronto. Da "card che guardi"
a "macchina che conquista case". *Effort: medio. Valutatore + marketStats +
pdf-lib esistono; serve il template e la porta.*

**C. Oggi si completa** *(muove #5, e chiude € fermi)*
1. Le **Proposte** entrano in coda: il portal non carica `preAgreements`
   (verificato: 0 riferimenti) — caricarle e mostrare «accettata, da
   incassare» / «pagata, da convertire». Sono soldi fermi tra due stati.
2. I **task del Regista** entrano in coda con ✓ Fatta / ⏰ +1g
   (`operatorTasks` è admin-only: il portal admin può leggerli e
   scriverli client-side, zero API nuove).
*Effort: basso.*

### TIER 2 — comfort quotidiano, dopo il Tier 1

**D. «Scrivi a…» universale** — da ⌘K: persona → compositore
WhatsApp/email col contesto (contratto, rata, visita) già dentro. Il gesto
più frequente dell'operatore, oggi sparso in dieci bottoni per sezione.

**E. Pagella prezzo in vetrina** — sulla riga listing: «asking +18% sopra
fascia · assorbimento zona 41gg». In parte assorbita dal Tabellone (A).

### TIER 3 — strutturali, valgono molto e costano molto

**F. Persona 360 unificata** — `leads` + `users` + `clienti` + `pfsClients`
sono quattro modi di dire "persona" (l'audit lo segnala da giorni). Una
spina dorsale unica con timeline (Miniera ha già lo storico WhatsApp
ridotto). È il lavoro che rende ogni tool futuro più semplice.

**G. Owner portal vero** — `owner-dashboard.html` oggi è una pagina
STATICA (CLAUDE.md lo dichiara). Vale non per gli owner attuali ma come
**arma di vendita mandati**: "ecco cosa vedrà lei, live". Si fa DOPO B,
quando c'è una pipeline proprietari da chiudere.

### SCARTATI — e perché (la parte brutale)

| Idea | Perché NO |
|---|---|
| Grafico cash-flow 30/90gg | Con ~20 contratti non cambia nessuna decisione: la striscia di Oggi basta. Bello ≠ utile. |
| Notifiche push PWA | Telegram già suona. Un secondo canale = stesso avviso due volte = entrambi ignorati. |
| Analytics estesa / funnel | Vanity finché il volume è questo. La Miniera già misura ciò che decide (latenza→conversione). |
| Chat AI "parla col portale" | ⌘K + Prontuario è PIÙ VELOCE di una chat, e il bot Telegram già parla in naturale. Una chat nel portale è teatro. |
| Altri radar/intelligence | Il problema è l'opposto: ce ne sono quattro. Vedi machete. |
| CRM kanban stile Pipedrive | I deal BOOM vivono già in pipeline vere (PA console, PFS command). Un kanban generico è un giocattolo. |

---

## 4 · La sequenza consigliata

1. **Il machete** (½ giornata) — kill list §2: redirect, rinomina, parcheggi.
2. **Il Tabellone del Vuoto** (A) — il numero invisibile diventa una coda.
3. **Oggi completa** (C) — proposte + task in coda.
4. **La Proposta al Proprietario** (B) — la macchina dei mandati.
5. **«Scrivi a…»** (D).
6. Poi il Tier 3, cominciando da Persona 360 (F).

La regola che tiene tutto: *un tool nuovo entra solo se muove uno dei
cinque numeri e se al suo posto ne muore almeno uno finto.*
