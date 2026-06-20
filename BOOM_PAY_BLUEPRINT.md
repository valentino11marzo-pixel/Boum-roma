# BOOM Pay — Blueprint

*Rent rails for the BOOM operating system. The euro finally flows through you.*

---

## 0. The one-sentence thesis

You already built the entire lifecycle of a rent payment — schedule generation, status
machine, overdue detection, wallet-pass live updates, recovery surfacing. **BOOM Pay
attaches a real money rail to a `payments` doc you already designed perfectly.** Tenant →
Stripe → landlord, BOOM takes its cut automatically, and every surface you already built
(`reminder-cron`, the tenant Wallet pass, the recovery panel, the Money dashboard) lights
up with real money instead of bookkeeping.

This is the move that turns BOOM from a *system of record* into a *system of money* — with
the recurring revenue and the proprietary dataset that make the Operator, the Rental Graph,
and Verified all possible.

---

## 1. What you already have (and must not rebuild)

Studied from your live code:

| Asset | Where | What it gives BOOM Pay |
|---|---|---|
| `payments` schedule auto-gen on signature | `api/magic-sign/submit.js` (e) | One doc per month already exists: `pay_<contractId>_<YYYY-MM>` with `amount`, `dueDate`, `month`, `status:pending`. |
| Status machine `pending → paid → overdue` | `portal.html` (auto-overdue ~L3824, L3888) | The states a rail needs already exist and self-advance. |
| Wallet live-updates | `reminder-cron.js` L172–219 | `passDueSoonPushed` / `passOverduePushed` / `passPaidPushed` already push "Prossima rata" and "Pagato ✓" to `tenant-<cid>` / `silver-<cid>`. |
| Recovery panel + overdue totals | `portal.html` Money dashboard (~L5522, L5597) | The collections UI exists — it just has nothing to *act* on yet. |
| Stripe (one-time) | `create-checkout.js`, `stripe-webhook.js` | Stripe is already wired, keyed, and writing to Firestore via admin REST. We extend it, we don't add a vendor. |
| Firestore-REST-under-admin pattern | `stripe-webhook.js` `writeDoc()` | Exact pattern to mark a payment `paid` from a webhook — already written. |
| `ricevuta` generation | `portal.html` L1962 (IT/EN) | Auto-receipt on payment feeds the existing taxpack engine — compliance for free. |

**Design rule for the whole project: never fork the data model. A `payments` doc is the unit
of money. BOOM Pay makes that doc collect itself.**

---

## 2. The rail decision (the most important choice)

Rent in Italy moves by *bonifico* (SEPA credit transfer) and occasionally RID/SDD. Cards for
rent are rare and expensive (~1.5%+). The right primary rail is **SEPA Direct Debit (SDD)**:
the tenant authorises a mandate **once**, and rent is pulled automatically every month at
~€0.35 flat — not a percentage. That is the "rent that pays itself."

### Recommended architecture: **Stripe Connect + SEPA Direct Debit**

```
                         ┌──────────────────────────────────────────┐
   Tenant signs lease →  │  SEPA mandate captured once (magic-sign   │
   (magic-sign flow)     │  onboarding) → saved on a Stripe Customer │
                         └──────────────────────────────────────────┘
                                          │
        every due date (cron)             ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  PaymentIntent off the saved mandate, ONE per `payments` doc     │
   │  amount = rent · application_fee_amount = BOOM cut               │
   │  transfer_data.destination = landlord's Connect account         │
   └─────────────────────────────────────────────────────────────────┘
          │ tenant → Stripe                 │ Stripe → landlord IBAN
          ▼                                 ▼
   payment doc → `paid`                landlord payout (auto)
   Wallet flips "Pagato ✓"            owner-dashboard ledger updates
```

**Why this exact shape:**

1. **One PaymentIntent per `payments` doc** (not a Stripe Billing subscription). Your schedule
   already exists; a subscription would fight it. PaymentIntent-per-doc maps 1:1 onto your
   model, gives per-month control (skip, adjust, partial, pause), and keeps your beautiful
   schedule as the source of truth.

2. **Stripe Connect (Express), landlord = connected account.** This is also the *compliance*
   answer: under PSD2, whoever collects-and-pays-out rent is providing a payment service. With
   Connect, **Stripe is the regulated money-services provider and the landlord is the merchant
   of record** — BOOM is a platform taking an `application_fee`. You never touch a regulated
   flow of funds or need a payment-institution licence. (Collecting into your own account and
   manually paying landlords would put *you* in that regulated position. Don't.)

3. **`application_fee_amount` = your revenue, taken automatically.** Money splits at the rail.
   No invoicing yourself, no reconciliation.

4. **Manual `bonifico` stays a first-class fallback.** Never force the rail. A landlord/tenant
   who pays by transfer → the existing "mark as paid" path still works. BOOM Pay is the
   *default*, not the *only*.

### Rail options at a glance

| Option | Cost | Recurring | Reversal risk | Verdict |
|---|---|---|---|---|
| **SEPA Direct Debit (Stripe)** | ~€0.35 flat | ✅ mandate | 8wk no-Q / 13mo unauth | ✅ **Primary** |
| Card (Stripe) | ~1.5%+ | ✅ saved card | chargeback | Optional tenant choice (surcharge) |
| Bonifico (manual) | €0 | ❌ manual | none | ✅ Fallback, always available |
| GoCardless | similar SDD | ✅ | same SDD window | ❌ adds a vendor; Stripe already in |

> **SDD reversal window** is the one real risk: a tenant can claw back an SDD for 8 weeks. We
> price this in with the optional **Guaranteed Rent** tier (§6) and by only auto-collecting on
> mandates that have cleared at least one cycle.

---

## 3. Data model (extend, don't fork)

### Extend `payments` (add fields, keep the doc)
```
stripePaymentIntentId   string     // the rail attached to this month
paymentRail             string     // 'sdd' | 'card' | 'manual'
applicationFee          number     // BOOM cut in cents
mandateId               string     // which mandate collected it
attemptCount            number     // dunning attempts
failureReason           string     // last decline/return code
payoutId                string     // landlord payout this fed into
collectedAt             timestamp  // when Stripe confirmed
status                  // + 'processing' | 'failed' | 'refunded' | 'disputed'
```
> `status` gains real-money states alongside your existing `pending/paid/overdue`.

### New collections
```
mandates/<id>           // SEPA mandate: tenantId, contractId, stripeCustomerId,
                        //   stripeMandateId, status, ibanLast4, signedAt, ip
payProfiles/<ownerId>   // landlord Connect: stripeAccountId, onboarded, payoutIban,
                        //   chargesEnabled, payoutsEnabled, feeBps, guaranteedRent
payouts/<id>            // ownerId, amount, fee, periodMonth, paymentIds[],
                        //   stripePayoutId, status, arrivalDate
payEvents/<id>          // immutable ledger: every euro state transition
                        //   (mirrors your activityLog instinct)
```

The `payEvents` ledger is the discipline that matches how you already think (`activityLog` is
append-only). Every collection, fee, payout, retry, dispute → one immutable line. This is your
audit trail *and* the raw material for the Rental Graph's cashflow analytics later.

---

## 4. The autonomous collection engine

Your `reminder-cron.js` **already runs every 15 minutes and already iterates `payments`.** We
graduate it from "push a wallet notification" to "move money." Drop-in extension to the block
at L172–219:

```
for each payments doc:
  T-3 days, mandate active, autopay on   → notify "we'll collect €X on the 5th" (wallet + email)
  due date reached, status=pending       → create PaymentIntent off mandate → status=processing
  webhook payment_intent.succeeded       → status=paid, collectedAt, push "Pagato ✓", queue payout
  webhook payment_intent.payment_failed  → status=failed, attemptCount++, schedule retry
     attempt 1 fail → retry T+2
     attempt 2 fail → retry T+5  + AI dunning draft (agent layer) → recovery queue
     attempt 3 fail → escalate to you, status=overdue, recovery panel lights red
  webhook charge.dispute.created         → status=disputed, freeze payout, alert you
```

**The dunning is AI.** You already built `api/agent/ai.reply.js` and the messaging tools —
a failed collection auto-drafts a warm, firm, bilingual reminder for one-tap approval (or
tier-1 auto-send for the gentle first nudge). **Collection is automatic. Dunning is Claude.
You only ever touch a genuine exception.** This is BOOM Pay as a self-driving subsystem — and
the first real organ of the Operator.

---

## 5. The three beautiful surfaces

### 5a. Tenant — *invisible luxury*
The whole point: the tenant does **nothing**, ever, after one setup.

- **Setup (once):** folded into the magic-sign onboarding they already complete. After
  signature → one elegant screen: *"Set up automatic rent — never think about it again."*
  IBAN + one tap to authorise the SEPA mandate. Gold-on-black, the BOOM aesthetic.
- **Living receipt:** their **Apple Wallet tenant pass becomes real.** It already shows
  "Prossima rata" and flips to "Pagato ✓" — now those states are driven by actual money.
  The pass shows *"Autopay attivo · prossimo addebito 5 luglio"* and silently turns
  "Pagato ✓" the moment SDD clears. No bonifico, no IBAN typing, no late fees, ever.
- **That's it.** The luxury *is* the absence of surface. One status chip: **Autopay attivo.**

### 5b. Landlord — *rent on autopilot, payout you can watch*
In `owner-dashboard.html`, a **BOOM Pay** panel:

- **Onboard once** (~2 min): Stripe Connect Express → IBAN for payouts. `chargesEnabled` /
  `payoutsEnabled` flip green.
- **Cashflow timeline** (the beautiful object): a vertical gold timeline — *Rent collected →
  BOOM fee → Payout to your IBAN → Arrives*, with dates and a running balance. Chart.js (you
  already load it) for the 12-month income curve, now backed by *settled* money.
- **Per-tenant autopay health:** green = mandate active & collecting; amber = retrying; red =
  failed/manual. At a glance, which rents are on rails.
- **Upsell seam:** the **Guaranteed Rent** toggle (§6) lives right here.

### 5c. Admin (you) — *the Collections Command Center*
Extends your Money dashboard + recovery panel into a money cockpit in `portal.html`:

- **This month, live:** Expected · In transit · Collected · Failed · Disputed · Paid out.
- **Rail status board:** mandates active / pending / broken across the whole book.
- **Recovery queue with AI dunning pre-drafted** — each failed collection arrives with a
  Claude-written message ready to approve, plus retry/escalate/forgive actions.
- **Payout calendar:** what lands in which landlord's account, when, minus your fee.
- **You watch money move and only touch exceptions.** Same philosophy as the rest of BOOM.

---

## 6. Revenue & the Guaranteed Rent tier

**Base model — platform fee per collected rent.** Even at a flat **€X or ~1%** per managed
monthly rent via `application_fee_amount`, this is *recurring* revenue that compounds with the
book, taken automatically at the rail. 100 managed flats × €1,200 rent × 1% = €1,200/mo
recurring, climbing every time you sign a contract — on top of the existing service fees.

**Premium — Guaranteed Rent.** Because you'll *own the payment history*, you can price risk
nobody else can. Landlord pays a higher fee (e.g. 3–5%); BOOM fronts the rent on day 1 even if
the tenant's SDD fails, then recovers via the dunning engine. This is the highest-trust,
highest-margin product a brokerage can sell a landlord — and it's only possible *because* of
the data moat BOOM Pay creates. (Underwrite it with the tenant-scoring you already prototype in
`portal.html` underwriting, ~L5352.)

**Compounding — productize.** Once BOOM Pay runs your book, it's the killer feature when you
sell BOOM OS to other Rome landlords (creation #5 in the strategy memo).

---

## 7. Compliance & trust (Italy specifics)

- **PSD2 / money transmission:** solved by Connect (landlord = merchant of record, Stripe =
  PSP). BOOM is a platform with an application fee. **This is the load-bearing compliance
  decision — do not collect into a BOOM-owned account.**
- **SCA / mandate authorisation:** SEPA mandate captured with IP + timestamp + consent (mirror
  your magic-sign signature-capture pattern — you already do this for contracts).
- **SDD reversal window:** mitigated by Guaranteed-Rent pricing + collecting only on
  cleared mandates + holding first-cycle payouts briefly.
- **Receipts / cedolare:** auto-generate the `ricevuta` (you have it, L1962) on every `paid`
  and file it into the taxpack engine — the landlord's compliance happens *for free* as a
  byproduct of collection. This is a genuine wow for the landlord and an unfair advantage.
- **GDPR:** financial data minimised — store Stripe IDs and `ibanLast4`, never full IBANs/PANs.

---

## 8. Phased rollout

| Phase | Scope | Reuses |
|---|---|---|
| **1 — Rails on** | Connect Express onboarding (landlord) · SEPA mandate capture (tenant) · **manual-triggered** PaymentIntent per `payments` doc · webhook → `paid` + payout · owner cashflow panel | existing schedule, webhook, wallet pass |
| **2 — Autopilot** | cron auto-collects on due date · retry ladder · AI dunning · recovery queue wired | `reminder-cron`, agent `ai.reply` |
| **3 — Premium** | Guaranteed Rent · tenant card option · payout calendar · cashflow analytics | underwriting score, Chart.js |
| **4 — Productize** | multi-landlord self-serve onboarding → BOOM OS feature | Connect multi-account |

**Phase 1 is small** precisely because you already built the hard parts. It's: add Connect
onboarding, capture a mandate, attach a PaymentIntent to a doc, handle two new webhook events,
draw one timeline. Everything downstream (status, wallet, recovery, receipts) already reacts.

---

## 9. Build checklist — Phase 1

- [ ] `payProfiles` + Connect Express onboarding link endpoint (`/api/pay/connect-onboard`)
- [ ] Owner-dashboard "BOOM Pay" panel: onboard CTA + status + cashflow timeline (empty-state)
- [ ] `/api/pay/mandate-setup` → Stripe SetupIntent (SEPA) → save `mandates/<id>`
- [ ] Tenant mandate screen folded into magic-sign onboarding
- [ ] `/api/pay/collect` → PaymentIntent off mandate, `application_fee_amount`,
      `transfer_data.destination`; writes `stripePaymentIntentId` + `status:processing`
- [ ] Extend `stripe-webhook.js`: `payment_intent.succeeded|payment_failed`,
      `payout.paid`, `charge.dispute.created`
- [ ] Receipt auto-gen on `paid` → taxpack
- [ ] Env: confirm `STRIPE_SECRET_KEY` is Connect-enabled; add `STRIPE_CONNECT_*` as needed

---

*Build order across the company: BOOM Pay → Autonomous Operator → Rental Graph → Verified →
Productize. Pay is the spine; everything compounds off the euros and the data it puts in motion.*

---

## 10. Build status — shipped

The end-to-end product is implemented (Phases 1 + 2). Backend (additive — live
flows untouched):

- `api/pay/_pay.js` — Stripe client + split-fee math (landlord + tenant portions)
- `api/pay/_collect.js` — shared collection core (one PaymentIntent per `payments` doc)
- `api/pay/collect.js` — manual/admin + cron trigger over the core
- `api/pay/connect.js` — landlord Stripe Connect (Express) onboarding + status
- `api/pay/mandate-setup.js` — tenant SEPA mandate (auto-resolves the tenant's contract)
- `api/pay/summary.js` — landlord cashflow summary
- `api/pay/admin-summary.js` — admin Collections Command Center data
- `api/stripe-webhook.js` — +6 money events (payment_intent.*, setup_intent.succeeded,
  account.updated, payout.paid, charge.dispute.created) → drives docs + `payEvents` ledger
- `api/reminder-cron.js` — **autonomous collection** on the due date, retry ladder
  (0 / +2d / +5d), parks off-rail payments 24h, exhausted → overdue (fail-soft lazy import)

Surfaces (gold/black, `BoomPortal` auth):

- `boom-pay.html` — landlord: activate + cashflow timeline (nav-linked from owner-dashboard)
- `pay-setup.html` — tenant: one-tap SEPA authorisation (Stripe IBAN element)
- `boom-pay-admin.html` — admin: stats, recovery queue (Collect-now + dunning), money ledger

`firestore.rules` — `payProfiles / mandates / payouts / payEvents` (admin-only writes,
scoped reads).

**To go live (Stripe dashboard + Vercel):** enable Connect + SEPA Direct Debit; set
`STRIPE_PUBLISHABLE_KEY` (+ optional `PAY_FEE_LANDLORD_BPS` / `PAY_FEE_TENANT_BPS`,
default 100/100 = 1%+1%); subscribe the webhook to the 6 events above incl. "events on
connected accounts"; `firebase deploy --only firestore:rules`. Then verify with one
test-mode onboarding + one test collection. Next: fold `pay-setup.html` into the
magic-sign onboarding so a tenant activates autopay the moment they sign.
