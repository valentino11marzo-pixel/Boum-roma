# STUDY — The first hire · October 2026
### Decisions, not options. The founder's question is inside.

*7 October 2026. From next week a person starts working with Valentino:
Italian, speaks English, has a car, wants to learn. The question: how do I
let her work, what does she do, what environment and tools does she get —
the portal, or her own version of it — and how does this actually raise
BOOM's efficiency and quality instead of adding work?*

*This study is in English because the conversation was. Appendix A, the
field manual, is in Italian because it is for her.*

---

## 0 · The answer in six lines

1. **Her first job is already measured, and it is the catalog.** Read today
   from the live Firestore catalog: 27 listings, 19 on the market, **none
   complete**. **18 of 19 have no video, 10 have one photo.** Average score
   on the existing Monday report ("pagella"): **3.6 out of 10.** Someone with
   a car can fix that in two weeks, it needs little supervision, and the
   Monday report already measures whether it worked.
2. **Her real job is the field**: viewings, handovers, filming, and
   *delivering the products BOOM already sells and almost never offers*
   (Virtual Viewing €89, Move-in Pack €149, Cleaning Premium €119). This is
   what the August study said (`STUDIO_ORGANICO_2026-08.md` §4), and it is
   the one bucket software cannot do.
3. **Do not give her the admin role.** In this codebase admin means: signing
   contracts on behalf of clients, changing the IBAN printed on invoices,
   deleting data, approving messages to clients, and seeing every ID card
   and tax code. Give her a `staff` role and one page built for her job.
4. **She does not touch client conversations for the first 60 days.** The
   client chats run on your *personal* WhatsApp (the repo says so). That is
   a separate decision, not something to solve by sharing your phone.
5. **Autonomy is earned on evidence, the same rule you already apply to the
   AI agents.** Watch, then do it with you there, then do it alone and
   report, then decide within limits. You move a task up one level when the
   evidence says so, not because a week has passed.
6. **The first month costs you time.** About an hour a day in week 1, half
   an hour in weeks 2-4. If you cannot spend that, start her on the catalog
   only, because it is the one lane that checks itself.

---

## 1 · What the data says before deciding

### The catalog (measured 7/10/2026, public `listings` collection)

| | Count |
|---|---|
| Listings in Firestore | 27 (9 available · 10 waitlist · 8 rented) |
| On the market (available + waitlist) | 19 |
| Complete on the pagella (10/10) | **0** |
| No video tour | **18 of 19** |
| Fewer than 8 photos | 13 of 19 (**10 have exactly one**) |
| No deposit months | 19 of 19 |
| Canone concordato yes/no unknown | 13 of 19 |
| Average pagella score | **3.6 / 10** |

The pagella (`api/wizard/video-radar.js`, `gradeListing()`) gives video 3
points out of 10. It is the biggest gap, and you need a person in the
apartment to close it. The **9 available** listings come first: they can be
let today, and 8 of them have no video. The 10 waitlist listings are mostly
**occupied**: filming an occupied home shows the current tenant's things
and needs their consent. Film those at turnover, not now.

Deposit months and concordato are facts only you or the contracts hold.
That is 20 minutes of *your* time on Telegram (`/deposito`, `/modifica`).
Do not turn it into her research project.

### What the earlier studies decided, and where this hire differs

- **August (`STUDIO_ORGANICO`)**: no secretary (that is software), no
  general "operational arm". Yes to a field operator, **paid per task, hired
  once field hours pass ~12-15 a week**, with no admin access.
- **September (`STUDIO_CARICO`)**: the problem is *activation*, not missing
  software. The levers exist and are switched off.

**You are hiring before measuring, and you are hiring a learner rather than
a contractor paid per task.** That can work, but only if you start
measuring on her first day, so that by day 60 you know whether the hire
pays off. The numbers to watch are in §8.

---

## 2 · Stress test: five ways this goes wrong

**a · She becomes your second inbox.** Without a defined lane, every hour
she works creates questions for you ("which flat?", "where are the keys?",
"what do I tell the client?"). Your interruptions go up. Since your real
load is fragmentation (half your WhatsApp messages are under 17
characters), that makes things worse. *The fix:* a written lane per week
(§3), one daily 10-minute debrief instead of fifty pings, and a field
manual (Appendix A) that answers the recurring questions before she asks
them.

**b · You give her admin because it is the fastest option.** Here is what
admin unlocks, read from the code, not guessed:
- `api/preagreement/sign-for.js` ("✍️ Firmo io"): signs leases on behalf
  of tenants and landlords under their mandate. Admin only.
- `settings/company`: the IBAN that goes on invoices and late-payment
  reminders.
- Bonifica: bulk deletes.
- `action_queue` approvals: messages that go out to clients under BOOM's
  name.
- `api/payments/link-for.js`: Stripe payment links on any instalment.
- Every `users` / `contracts` record: tax codes, ID scans, IBANs.

None of that is her job. "Reach declared, not inherited" is the rule your
own org chart (`js/squadra-registry.js`) enforces on software agents.
Apply it to people too.

**c · Her job is "help me".** An undefined assistant ends up with your
lowest-value leftovers, learns nothing transferable, and leaves after three
months. A learner stays when she can see her own progress: an apartment
that was 1/10 is now 9/10, she did her first viewing alone, she delivered a
service a client paid for.

**d · The practical traps behind "she has a car".**
- **ZTL.** At least two live listings (Coronari, Ripetta) sit inside the
  ZTL Centro Storico, and every unauthorised entry is a fine. Use the car
  for Ponte Milvio, Trieste/Africano, Marconi, Conca d'Oro, Tiburtina and
  Pigneto. Go on foot or by metro for the centre. Also check her car's Euro
  class against Rome's Fascia Verde rules.
- **Occupied flats.** See §1: film with consent or at turnover.
- **Your personal WhatsApp.** See §5. She does not get access to it.

**e · Legal and admin, to check rather than decide here** (with your
commercialista / consulente del lavoro):
- **Contract form**: internship, apprenticeship, part-time or freelance.
  Each sets what she can be asked to do and what it costs.
- **Mediation**: showing apartments to clients and contacting landlords can
  count as mediation activity, which in Italy has registration requirements
  (L. 39/1989). Check this before she does viewings *without you*.
- **GDPR**: before she sees any client data, a written *autorizzazione al
  trattamento* with instructions (art. 29 GDPR, art. 2-quaterdecies Codice
  privacy). It costs nothing and is mandatory.
- **Car**: per-km reimbursement (ACI tables) needs a trip log, and her
  insurance must cover work use.

---

## 3 · Her job: the letter of hire

The same format every agent in the org chart has: mandate, what she does
alone, what she brings to you, what she never does, and her reach. Four
lanes, opened in this order.

| Lane | What | Why it pays | Measured by |
|---|---|---|---|
| **1 · Catalog** (weeks 1-3) | Video tour + ≥8 photos for every available listing, then waitlist at turnover | The shop window; video is 3/10 on the pagella | Monday pagella (already sent to Telegram): average from 3.6 → ≥8 |
| **2 · Field** (from week 2) | In-person viewings, key handovers with **verbale** + **inventory video**, presence at maintenance | The bucket software cannot do; frees your afternoons | Viewings attended / done alone; handovers with verbale + inventory = 100% |
| **3 · Delivery** (from week 4) | Deliver the services already priced: **Virtual Viewing €89** (live walk-through within 48h, as the page promises), **Move-in Pack €149** (electricity/gas transfers, internet: phone calls in Italian), **Cleaning Premium €119** (coordinate the cleaner) | Products that exist, barely offered (Virtual Viewing was offered once in 180 days of your messages) because nobody had time to deliver them | Services sold and delivered per month, refunds |
| **4 · Data** (month 2) | Chase missing Scheda data, collect landlord documents for the ARPE dossier (visura, floor plan, APE) | Every missing field is a dotted line on a contract and a delay at registration | Missing-field badges in Burocrazia going down |

**Alone** (once she has earned it, §4): filming, uploading photos and video
(additive: originals are never lost), arriving at and running a viewing,
the handover walk-through, filling in the viewing outcome.

**Brings to you** (`porta`): anything a client asks about price, dates,
deposit, discounts, contract terms or exceptions. Replacing an existing
video or cover photo. Any damage found at a handover. Any landlord who
mentions wanting management.

**Never** (`mai`): negotiates or promises a price, date or condition. Signs
anything for anyone. Touches money (payment links, marking an instalment
paid). Writes to clients from your number. Deletes data.

**Reach**: listings (read, plus photos/video), viewings (her day's list),
contracts starting this week (handover only), maintenance (open tickets).
No settings, no money, no identity documents beyond what a handover needs.

**What stays yours**, now with the time to do it: negotiations, landlord
mandates (supply is the real ceiling: 27 listings is the size of the
business), Executive/B2B, and checking her work.

---

## 4 · The ladder: autonomy earned per task, not per calendar

| Level | Meaning | Moves up when |
|---|---|---|
| **0 · Watch** | Shadows you | She can explain the task back in her own words |
| **1 · With you** | Does it, you are there | 3-5 clean repetitions |
| **2 · Alone, reports** | Does it alone, logs the outcome the same day | 2-3 weeks with no correction that mattered |
| **3 · Decides within limits** | Handles exceptions inside written limits | You stop reading her reports in full |

Starting points: filming is level 1 from day 2, because it is low risk and
the output can be checked. Viewings start at level 0 and reach level 2
only after the mediation question in §2e is answered. Handovers go 0 → 1
→ 2 with the verbale and the inventory, which leave a written record either
way. Price conversations never go above level 0.

This is the trust scale (`js/fiducia-engine.js`) applied to a human:
promotion on the record, demotion on one serious error. Tell her this
rule on day one. A learner wants to know how she grows.

---

## 5 · Tools: what she gets, week by week

### Week 1: zero new software (and that is deliberate)

Building before you have watched her work for five days means building for
a job you imagine, not the one she will actually do. Week 1 runs on what
exists:

- **Her own `name@boom-rome.com`** (one Workspace seat). It is needed for
  the calendar, the future login and a professional identity with clients
  and landlords.
- **Your Google Calendar shared with her account** (Calendar → Settings →
  Share). The viewing invites already land in your calendar, and sharing is
  revocable in one click. **Do NOT give her the `/api/viewings/feed?key=`
  URL**: its key is derived from `HOMIE_SECRET`, so revoking it means
  rotating the secret that also signs every client's Scheda link, viewing
  link and co-signing link.
- **A BOOM field SIM** (a basic Italian plan), so clients get "I'm at the
  door" from a BOOM number that is neither yours nor hers.
- **A shared Drive folder** for raw photos and video, one folder per
  listing. In week 1 you publish them through Media Studio. Reviewing her
  first shoots *is* the training.
- **`/watermark-studio`**: it works with no login at all.
- **The field manual** (Appendix A), printed or saved on her phone.
- **`/welcome-to-rome`** and **`/book`**: public pages she should know
  cold, because clients will ask her about them.

### Week 2: build `/campo` and the `staff` role (Appendix B)

Her "home version of the portal": **one page for her job**, not a slice of
your 21,000-line admin app. It is server-mediated (the same pattern as
`/scheda` and `/sign`), so the Firestore rules stay admin-only and she sees
only what each task needs. Every action is stamped with her name. About 1.5
to 2 days of work with tests. Build it after her first week, when what she
actually needs is visible.

### Do not build

A chat inbox for her, Telegram access (the bot authorises **one** chat ID:
adding her to a group means she can tap Approve on everything), a CRM, or
a second admin.

### The WhatsApp question (the real blocker for anything conversational)

Client chats live on your personal number, and the whole pipeline (Homie,
wacli, Postino, Segretaria) is wired to it. There are two clean paths:
**(a)** she never touches client conversations, and logistics go through
the field SIM. **(b)** BOOM gets its own WhatsApp Business number, shared
across devices, and clients migrate over time. That is a project with its
own study. **Recommendation: (a) for 60 days, then decide on (b) using
what you have seen.**

---

## 6 · Rhythm and ambiance

Ambiance in a two-person company is not décor. It is clarity, respect for
her time, and visible progress.

- **Monday, 30 minutes**: the pagella and the week's viewings decide the
  week's lane. One written goal.
- **Every day, 10 minutes at the end** (call or voice note): one line per
  viewing (did they like it, what worried them, how likely they are). This
  fills the "esito visita" task the Regista already creates for every
  completed viewing, and that feedback is currently lost.
- **Friday, 20 minutes**: one thing she learned, one thing she would
  change. Act on the second one at least every other week, or stop asking.
- **Visible progress**: the pagella going up is *her* score. Show it to
  her every Monday.
- **Pay mileage promptly** and never send her into the ZTL by car.
- **Later, a product touch**: her name and photo on the viewing
  confirmation ("Your BOOM host: …"). For an expat about to send a deposit
  to strangers, knowing who will open the door is trust. Build this only
  once she does viewings alone.

---

## 7 · What changes for you

Your job moves from *doing* to *defining and checking*. The trap for a
founder hiring person number one is to keep doing everything and explain
it too, which costs double. The test that it is working: by week 6 your
**field hours per week** (readable from your calendar and the Regista's
daily sheet) are down. The hours you get back go to the only things nobody
else can do: landlord mandates (supply), negotiations and B2B.

---

## 8 · 30 / 60 / 90

| Day | Target |
|---|---|
| **30** | All 9 available listings at ≥8/10 (video + ≥8 photos). An outcome logged for 100% of viewings she attends. Field manual corrected with what reality taught. `/campo` live. |
| **60** | Viewings alone (after the §2e check). Every handover with verbale + inventory. First Virtual Viewings and Move-in Packs delivered by her. **Your** field hours per week measurably down. WhatsApp path (a/b) decided. |
| **90** | Decision on the hire with numbers: field hours moved, services delivered (€), pagella held at ≥8, viewings she attended → contracts. |

---

## 9 · Decisions only you can make

1. **Contract form** (§2e). This sets everything else.
2. **Mediation check** before solo viewings.
3. **WhatsApp**: path (a) now, (b) later? Field SIM yes or no?
4. **Budget**: Workspace seat + SIM + mileage.
5. **Go for `/campo`** in week 2, to the spec in Appendix B.

---

## Appendix A · Manuale di campo (per lei, in italiano)

> Due pagine. Si legge una volta, si rilegge prima di ogni cosa nuova.
> Quando la realtà smentisce il manuale, si corregge il manuale.

### Le tre regole
1. **Non prometti mai** prezzo, date, deposito, sconti, condizioni del
   contratto. La frase è sempre: *"Te lo conferma Valentino entro oggi."*
2. **Quello che vedi lo scrivi lo stesso giorno.** Una visita senza esito
   scritto non è successa.
3. **Nel dubbio, foto e domanda.** Meglio un messaggio in più che un danno
   non segnalato.

### La ripresa di un appartamento (corsia 1)
- **Prima**: luci accese tutte, tapparelle su, letti fatti, niente oggetti
  personali in vista, WC chiuso. Se la casa è abitata: niente riprese
  senza il consenso dell'inquilino.
- **Video**: telefono **orizzontale**, 60–90 secondi, un piano sequenza
  lento dalla porta d'ingresso: soggiorno → cucina → camere → bagno →
  balcone/vista. Niente musica, niente zoom, niente commento.
- **Foto**: minimo 8, **orizzontali**, dall'angolo della stanza ad altezza
  petto, una per stanza più i dettagli che vendono (vista, cucina
  attrezzata, lavatrice, armadi). La migliore del soggiorno è la candidata
  copertina.
- **Consegna**: cartella Drive con il nome dell'annuncio, entro sera.

### La visita (corsia 2)
- Arrivo **10 minuti prima**: chiavi, luci, finestre, aria.
- Mostra: luce, silenzio, la cosa migliore della casa, i mezzi vicini.
- Ascolta: quando entrano, per quanto, chi abita, cosa li preoccupa.
- Lingua: quella del cliente. Inglese di default.
- **Dopo**: l'esito in una riga (*interessato / ci pensa / no + perché*) a
  Valentino entro la fine della giornata.
- Ritardo tuo o del cliente: messaggio dal numero BOOM, mai silenzio.

### La consegna chiavi (corsia 2)
- Contatori: **foto con la lettura leggibile** (luce, gas, acqua).
- Inventario: giro della casa col video in `/inventario`; l'elenco lo
  propone il sistema, **tu lo correggi**. "Buono stato" lo scrivi solo se
  l'hai guardato tu.
- Verbale su `/verbale`: chiavi contate, firme sul telefono di entrambi.
- Un danno o una mancanza: **foto + messaggio subito**, non a fine giornata.

### Emergenze
- Acqua, gas, elettricità, porta bloccata: **chiama prima Valentino**, poi
  agisci come ti dice. Odore di gas: fuori, nessun interruttore, 112.
- Mai pagare un tecnico di tasca tua senza conferma.

### In macchina
- **Centro storico = a piedi o metro** (ZTL: ogni varco è una multa).
- Annota data e indirizzi dei giri per il rimborso chilometrico.

---

## Appendix B · `/campo` + `staff` role (spec for week 2)

> **Built 8/10/2026 (v1)** at the founder's request, before her first week: role `staff`, `/campo`, `/api/campo` (viewings, people, handovers, maintenance, keys notes, outcome to Telegram). Not in v1: media upload (point 3) and verbale/inventory for staff (point 5). See CLAUDE.md, «La porta di campo».

**Principle**: no Firestore rule changes. All collections stay admin-only,
and a staff user reads and writes **only through `/api/campo/*`**
(`requireRole(['admin','staff'])`), exactly as `/scheda` and `/sign` serve
outsiders without opening the database. Users cannot change their own role
(already enforced at `firestore.rules` line 63).

1. **Role**: `users/<uid>.role = 'staff'`. `/login` sends staff to
   `/campo`, never to `/portal`.
2. **`GET /api/campo/today`**: today's and tomorrow's viewings (time,
   address with Maps link, mode, client first name, language, phone for
   delays), with travel between stops from `_avail.travelGapMinutes` (the
   same geometry as the booking grid and the Regista); keys to prepare
   (Regista `task_prep_*`); contracts starting within 7 days (handover);
   open maintenance tickets (no costs); the pagella of available listings
   with the exact gap per listing.
3. **`POST /api/campo/media`**: photos are **additive** onto a listing
   (preserve `imagesOriginal` union; the nightly Fotografo curates order and
   cover). Video sets `videoUrl` **only if empty**; replacing one is a
   `porta` item for admin. Stamp `photosAddedBy: 'staff:<email>'`.
4. **`POST /api/campo/esito`**: viewing outcome
   (`interested|thinking|no` + note) on the viewing doc, closing the
   Regista's `task_esito_*`.
5. **Verbale and inventory**: add `'staff'` to `requireRole` in
   `api/contracts/verbale.js` and `api/contracts/inventario.js`, scoped to
   contracts with a handover within ±7 days, stamped with her email.
6. **Everything** writes `activityLog` with `by: 'staff:<email>'`. No
   deletes, no money, no signatures, no outbound client messages.
7. **Tests**: a staff token gets 403 on `sign-for`, `link-for`,
   `settings/*` and `notify/send`; `/campo/today` never returns tax codes,
   ID scans or IBANs; media upload never removes an existing photo; verbale
   outside the window gets 403.
