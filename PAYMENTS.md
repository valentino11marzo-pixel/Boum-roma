# BOOM Rome — Rent Payments: Economics & Architecture

> Decision-grade design for collecting **monthly rent** through the tenant portal,
> "for real" — built so the **fee reality is solved**, not absorbed silently.
> Status: **design approved-in-principle, implementation pending go-live sign-off.**
> Prototype: `preview-tenant.html` (Affitto tab) already reflects this design.

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
- **Money flow:** ship Phase 1 collecting into BOOM's existing Stripe account
  (manual landlord remittance); migrate to **Stripe Connect** (auto landlord
  payout, BOOM never holds client funds) as the scalable target.

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

5. **Money transmission / licensing.** Collecting rent and remitting to owners is
   sensitive. Two clean models:
   - **Phase 1 (fast):** rent lands in BOOM's own Stripe account; BOOM remits to
     the owner by SEPA credit transfer under its management mandate. Simple,
     reuses today's setup, BOOM briefly holds funds.
   - **Phase 3 (clean/scalable):** **Stripe Connect** — each landlord is a
     connected (Express) account; a *destination charge* with
     `application_fee_amount` = BOOM's fee routes rent straight to the landlord.
     **BOOM never holds client money**, sidestepping payment-institution
     licensing concerns.
   - *Action:* confirm the Phase 1 hold-and-remit model with the
     accountant/legal; Connect is the target once volume justifies per-landlord
     KYC onboarding.

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

- **Phase 1 — real, minimal.** SEPA mandate setup + manual **"Paga ora"** debit
  into BOOM's account → webhook writes receipt + ledger → tenant & owner see it.
  Landlord remitted manually. *No Connect.* Ships real money movement fastest.
- **Phase 2 — autopay.** Monthly cron + pre-notification + failed-payment dunning.
- **Phase 3 — Connect.** Destination charges → automatic landlord payout +
  application fee + per-landlord KYC onboarding.
- **Phase 4 — card fallback.** SCA card for non-IBAN tenants; Apple/Google Pay.

**Always build & validate in Stripe _test mode_ first**, then flip live after one
real SEPA debit against your own IBAN settles end-to-end.

---

## 6. Open decisions (need your call before I write live code)

1. **Fee bearer** — confirm **BOOM absorbs the ~€6** (netted from the mgmt fee),
   tenant pays €0. *(Recommended.)*
2. **Money flow for Phase 1** — confirm **collect-into-BOOM + manual remittance**
   to start, Connect later. *(Recommended.)* Or go Connect-first.
3. **Same Stripe account?** Confirm the account behind `STRIPE_SECRET_KEY` is the
   one that should hold/route rent (it currently takes PFS + reservation
   payments).
4. **Go-live gate** — writing `api/payments/*` touches real money, so I'll build
   it in **test mode**, you validate, then we flip live together.

---

### Sources
- Stripe pricing (IT/EU): https://stripe.com/en-it/pricing
- Stripe local payment methods pricing: https://stripe.com/pricing/local-payment-methods
- SEPA Direct Debit June 2024 pricing update (disputes vs failures): https://support.stripe.com/questions/june-2024-pricing-update-for-sepa-direct-debit
- SEPA Direct Debit disputes (8-week / 13-month windows): https://support.stripe.com/questions/sepa-direct-debit-payment-disputes
