# BOOM Rome — Rent Payments: Economics & Architecture

> Decision-grade design for collecting **monthly rent** through the tenant portal,
> "for real" — built so the **fee reality is solved**, not absorbed silently.
> Status: **Phase 1 built in Stripe test mode** (`api/payments/*` +
> `pay-rent-test.html`), live-locked until `RENT_PAYMENTS_LIVE=true`. See §5b.
> Prototype: `preview-tenant.html` (Affitto tab) reflects this design.

---

## 1. TL;DR — the decision

**Collect rent by SEPA Direct Debit, not card.** On a €1,800 rent, a card costs
~€27–59 *per month*; SEPA Direct Debit is capped at **~€6**. Over a year that's
**€72 vs €327–705 per unit.** Card-first rent quietly destroys margin.

- **Primary rail:** SEPA Direct Debit (one-time mandate → frictionless recurring).
- **Fallback:** card, only for tenants without an EU IBAN (e.g. some foreigners).
- **Autopay:** off-session SEPA debit on the due date, with the legally-required
  pre-notification email 1–2 days prior.
- **Who pays the ~€6:** **BOOM absorbs it** (netted from the management fee). The
  tenant sees *commissione €0*. €6 is noise against the management fee.
- **Money flow (decided):** **collect into BOOM's account, BOOM remits to the
  landlord by ordinary SEPA credit transfer — which is free.** So there is **no
  fee on the owner payout**; optionally a small management fee if the owner wants
  BOOM to manage/track. **No Stripe Connect** — forcing an Italian landlord to
  onboard to Stripe is unacceptable friction. BOOM stays in control of the flow.

---

## 2. The fee reality (verified, June 2026)

| Rail | Fee | On €1,800 rent | × 12 months |
|---|---|---|---|
| **SEPA Direct Debit** | 0.8% + €0.30, **capped €6.00** | **≈ €6.00** | **≈ €72** |
| EEA card (IT/EU) | 1.5% + €0.25 | €27.25 | €327 |
| UK card | 2.5% + €0.25 | €45.25 | €543 |
| Non-EEA / intl card | 3.25% + €0.25 | €58.75 | €705 |

The SEPA **cap** is the whole game: a percentage fee on a high, recurring ticket
like rent is punishing, and the €6 cap removes it. (Cap mechanics to be
re-confirmed in the live dashboard for the IT account; treat €6 as the planning
figure.)

**Implication:** any "pay rent by card" flow should be a deliberate, rare
fallback — never the default — and ideally nudged away from.

---

## 3. Risks & regulatory implications — *solved, not hand-waved*

These are the things that bite if you ship SEPA naively. Each has a mitigation.

1. **SEPA refund window (the big one).** Under SEPA Core, the payer can claw back
   a debit **for any reason within 8 weeks**, and up to **13 months** if
   unauthorized. A tenant *could* reverse rent.
   - *Mitigation:* hold the **signed mandate + lease** as proof; a no-reason
     reversal of legitimate rent is a lease breach, and the **deposit** backs it.
     **Do not pay the landlord out the instant Stripe says `succeeded`** — hold a
     short buffer (a few business days) so early returns are absorbed before
     remittance. SEPA B2B (no refund right) is *not* available for residential
     consumers, so we accept and operationally manage the window.

2. **Settlement is not instant.** SEPA debits confirm over ~**3–5 business days**
   and can fail (insufficient funds) inside that window.
   - *Mitigation:* model a real **`processing` → `paid`** state. The tenant sees
     *"in elaborazione · accredito in 1–2 giorni"*; the owner payout fires after
     settlement + buffer. (Card path is near-instant by contrast.)

3. **PSD2 / SCA.** Mandate setup may trigger a one-time bank authentication;
   subsequent off-session debits are SCA-exempt → **recurring rent is
   frictionless**. (Cards need SCA at setup and proper MIT flagging for
   off-session — more friction, another reason SEPA wins for recurring.)

4. **Pre-notification.** SEPA rules require notifying the payer before each debit
   (amount + date). Standard 14 days, **reducible by mandate terms** to ~1 day.
   - *Mitigation:* reuse `reminder-cron.js` to send a pre-notification 1–2 days
     before each autopay run; the mandate text states the reduced notice.

5. **Money transmission / licensing (decided: collect-into-BOOM, no Connect).**
   Rent lands in BOOM's own Stripe account; BOOM remits to the owner by ordinary
   **SEPA credit transfer (free)** under its management mandate. BOOM briefly
   holds funds and stays in control. **Stripe Connect was rejected** — onboarding
   each Italian landlord to Stripe is ultra-friction, and the free credit
   transfer already gives a zero-fee payout. The owner can opt into a small
   management fee; otherwise they receive the rent in full.
   - *Action:* confirm the hold-and-remit model with the accountant/legal (an
     agency collecting rent under mandato is normal; keep clean records). Revisit
     Connect only if scale ever makes per-landlord onboarding worth it — not now.

6. **Receipts / tax (IT).** Residential rent is generally **VAT-exempt** and often
   under **cedolare secca** (already modelled in `fiscal-engine.js`). Generate a
   *ricevuta di pagamento* on settlement (tenant keeps it; owner's tax pack picks
   it up). Keep rent (exempt) **separate** from BOOM's management fee, which is a
   **taxable service (IVA 22%)** invoiced to the landlord — never conflate them on
   one document.

---

## 4. Architecture — on the existing stack (no new patterns)

Everything below reuses what `api/stripe-webhook.js` already does: `import Stripe`,
raw-body `constructEvent`, route by `metadata.service`, `firebaseIdToken()` +
idempotent Firestore-REST writes (409 = already written), EmailJS notifications.

### Endpoints (new — `api/payments/`)
| File | Method | Purpose |
|---|---|---|
| `setup-mandate.js` | POST | Create a SetupIntent (`payment_method_types:['sepa_debit']`) for a tenant → `client_secret`. Browser confirms IBAN + mandate via Stripe Elements. Persist `customerId`, `sepaPmId`, `mandateId`, masked IBAN on the contract. |
| `pay-rent.js` | POST | Create a PaymentIntent for one period. `on_session` for the "Paga ora" button, `off_session` for autopay. **Idempotency-Key = `${contractId}_${period}`** to make double-taps and retries safe. `metadata:{service:'RENT', contractId, period}`. |
| `autopay-run.js` | CRON | Monthly: for each contract with a mandate + `autopay:true`, fire an off-session PaymentIntent for the due period. Sends the SEPA pre-notification first. |
| `connect-onboard.js` | POST | *(Phase 3)* Create an Express account + onboarding link for a landlord. |

### Webhook
Extend the existing `stripe-webhook.js` (or a sibling `api/payments/webhook.js`)
to handle, for `service:'RENT'`:
`payment_intent.processing` · `payment_intent.succeeded` ·
`payment_intent.payment_failed` · `charge.refunded` · `mandate.updated`.
On `succeeded`: write the receipt, advance the ledger, queue the owner payout
(after buffer). On `failed`: start dunning.

### Data model (Firestore)
- **`contracts/{id}`** gains:
  `payment:{ stripeCustomerId, sepaPmId, mandateId, ibanLast4, status }`,
  `autopay:boolean`,
  `paymentSchedule:[{ period, dueDate, amount, status, paymentIntentId, settledAt, receiptUrl }]`.
- **`rentPayments/{contractId}_{period}`** — idempotent ledger row:
  `amount, fee, net, status(created|processing|paid|failed|refunded),
  stripePaymentIntent, period, dueDate, settledAt, payoutStatus`.
  Tenant reads own; owner portal aggregates; admin reconciles.

### Reuse
- **Dunning + pre-notification:** `reminder-cron.js` (already every 15 min).
- **Receipts in the tax pack:** `taxpack-engine.js` / `fiscal-engine.js`.
- **Owner visibility:** owner portal "Rendite & Pagamenti" reads the ledger.

---

## 5. Phased rollout

- **Phase 1 — real, minimal.** ✅ *Built (test mode).* SEPA mandate setup +
  manual **"Paga ora"** debit into BOOM's account → webhook writes the ledger →
  tenant & owner see it. Landlord remitted by free SEPA credit transfer. No
  Connect.
- **Phase 2 — autopay.** Monthly cron + pre-notification + failed-payment
  dunning. *(Next.)*
- **Phase 3 — receipts & owner reconciliation.** Auto *ricevuta* PDF on
  settlement, owner payout tracking in the portal.
- **Phase 4 — card fallback.** SCA card for non-IBAN tenants; Apple/Google Pay.

*(Stripe Connect intentionally not planned — see §3.5.)*

**Always validate in Stripe _test mode_ first** (the code refuses to use a live
key unless `RENT_PAYMENTS_LIVE=true`), then flip live after one real SEPA debit
against your own IBAN settles end-to-end.

---

## 5b. What's built (test mode) — files, env, test plan

**Endpoints (`api/payments/`)** — all default to Stripe test; a live key is used
only when `RENT_PAYMENTS_LIVE=true` and `STRIPE_SECRET_KEY` is `sk_live_…`.

| File | What it does |
|---|---|
| `_lib.js` | Safe key resolution (test-first + live guard), test-secret gate, idempotent ledger id, fee estimate |
| `config.js` | `GET` → `{ mode, publishableKey }` for Stripe.js |
| `setup-mandate.js` | `POST` → Customer + SEPA SetupIntent `client_secret` |
| `pay-rent.js` | `POST` → rent PaymentIntent (manual or off-session autopay), opens the ledger row; idempotent on `contractId+period` |
| `webhook.js` | Dedicated rent webhook (own secret) → advances `rentPayments/<id>`, persists the mandate on the contract. **Separate from the live `stripe-webhook.js` so it can't disturb PFS/reservations.** |

**Harness:** `pay-rent-test.html` (noindex) — set up a mandate + debit a period
with a Stripe test IBAN and watch the ledger move.

**Firestore:** `rentPayments/{contractId}_{period}` (ledger) and
`contracts/{id}.payment` (`stripeCustomerId, sepaPmId, mandateId, ibanLast4,
status`) + `lastPaidPeriod`.

**Env to add (test):**
```
RENT_PAYMENTS_LIVE          (leave unset / not "true" for test)
STRIPE_SECRET_KEY_TEST      sk_test_…
STRIPE_PUBLISHABLE_KEY_TEST pk_test_…
STRIPE_RENT_WEBHOOK_SECRET  whsec_…   (from the test webhook endpoint below)
PAY_TEST_SECRET             any long random string (guards the harness)
```

**Test plan:**
1. Add the env vars above on Vercel (Preview/Production for this branch).
2. In the Stripe **test** dashboard, add a webhook → URL `…/api/payments/webhook`,
   events: `setup_intent.succeeded`, `payment_intent.processing`,
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `charge.refunded`. Copy its signing secret into `STRIPE_RENT_WEBHOOK_SECRET`.
3. Open `/pay-rent-test.html`, paste `PAY_TEST_SECRET`, set up a mandate with a
   test IBAN (`DE89370400440532013000`), then **Paga affitto**.
4. Confirm `rentPayments/test-contract-01_2026-07` goes `processing → paid` and
   `contracts/test-contract-01.payment.status = active`. (Test SEPA settles after
   a short delay; you can also advance it from the Stripe test dashboard.)
5. Only after a clean test run: set `RENT_PAYMENTS_LIVE=true` with the live keys
   and a live webhook, and do one real debit on your own IBAN before launch.

---

## 6. Decisions & remaining gates

**Decided:**
- ✅ **SEPA Direct Debit first**, card only as non-IBAN fallback.
- ✅ **BOOM absorbs the ~€6** (netted from the mgmt fee); tenant pays €0.
- ✅ **Collect-into-BOOM + free SEPA credit-transfer payout**; **no Connect**.

**Remaining gates (yours):**
1. **Stripe account** — confirm whether rent should use the **same** Stripe
   account as PFS/reservations (just add a test key), or a separate one. The
   code reads `STRIPE_SECRET_KEY_TEST` so either works.
2. **Go-live** — code is built **test-mode-locked**. After you run the test plan
   above and it's clean, we set `RENT_PAYMENTS_LIVE=true` together. Nothing
   charges real money until then.
3. **Receipts/IVA detail** — confirm the *ricevuta* format + whether the mgmt fee
   is invoiced separately (Phase 3).
4. **Direct-to-landlord-IBAN** — ✅ built (§7). To validate it you must **enable
   Connect** in the Stripe dashboard (Connect → Get started → Custom). Then run
   `connect-test.html`. Preview of the landlord UX: `preview-owner-payouts.html`.

---

## 7. Direct payout to the landlord's IBAN (Stripe Connect Custom) — ✅ built (test)

The collect-into-BOOM model above ships now with zero landlord friction. This
second model lets rent land **directly on the landlord's bank account**, with
BOOM never holding the funds and its fee taken automatically. **Built in test
mode** alongside Phase 1: `api/payments/connect-onboard.js` (+ `connect-status.js`)
and a `transfer_data` branch in `pay-rent.js`; harness `connect-test.html`. The landlord **does not
create a Stripe account** — BOOM provisions a **Connect _Custom_** account via API
from the IBAN + identity data the landlord provides.

**How it works**
- BOOM enables **Connect** (Custom accounts) in the Stripe dashboard.
- Landlord onboarding (in the BOOM owner portal): enter IBAN + holder →
  `accounts.create({ type:'custom', country:'IT', capabilities:{ sepa_debit_payments, transfers } })`
  with an external bank account = the IBAN.
- **KYC (legally mandatory for direct payout):** Stripe requires the landlord's
  name, DOB, address and usually an ID document before it releases payouts. Done
  once, via Stripe's hosted verification or an embedded flow. *No way around this
  under EU AML — it's the law, not a Stripe quirk.*
- Tenant pays exactly as before; the rent PaymentIntent uses a **destination
  charge**: `transfer_data:{ destination: <landlordAccountId> }` +
  `application_fee_amount: <BOOM fee>`. Stripe routes the net straight to the
  landlord's connected account → their IBAN; BOOM keeps only the fee.

**Trade-offs vs collect-into-BOOM**

| | Direct-to-IBAN (Connect Custom) | Collect-into-BOOM (built) |
|---|---|---|
| Landlord setup | IBAN + 1× ID verification | nothing |
| BOOM holds funds | **No** (cleaner, less licensing exposure) | briefly |
| Payout speed | Stripe payout schedule to landlord | after BOOM remits |
| Build cost | + Connect onboarding, KYC, account mgmt, Connect fees | done |
| Card fee on rent | borne by platform (BOOM) as today | same |

**New env/setup if we add it:** enable Connect in dashboard; no new secret
(same `STRIPE_SECRET_KEY`). New endpoints `api/payments/connect-onboard.js`
(create Custom account + onboarding/KYC link) and a `transfer_data` branch in
`pay-rent.js`; `contracts.payment.landlordAccountId` on the doc.

**Recommendation:** offer **both** — default collect-into-BOOM, opt into
direct-IBAN per landlord. Same tenant button; the only change is whether a
`transfer_data.destination` is attached at charge time.

---

### Sources
- Stripe pricing (IT/EU): https://stripe.com/en-it/pricing
- Stripe local payment methods pricing: https://stripe.com/pricing/local-payment-methods
- SEPA Direct Debit June 2024 pricing update (disputes vs failures): https://support.stripe.com/questions/june-2024-pricing-update-for-sepa-direct-debit
- SEPA Direct Debit disputes (8-week / 13-month windows): https://support.stripe.com/questions/sepa-direct-debit-payment-disputes
