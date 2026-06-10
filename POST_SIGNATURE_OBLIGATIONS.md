# Post-Signature Flow & Obligations — Magic Sign

_What must happen the moment a BOOM lease is fully signed: fiscal obligations
(impegni fiscali), procedural duties (adempimenti di rito), and the tenant
onboarding. This drives `api/sign/_finalize.js`._

> ⚠️ Legal note: BOOM leases are **contratto transitorio** / **per studenti**
> (L. 431/1998 art. 5). The amounts/deadlines below are the standard national
> rules; a **commercialista / CAF** must confirm comune-specific items (TARI,
> canone concordato aliquota) and the cedolare choice per contract. The
> generator is conservative and tags every item with who/when/why.

---

## 1. The moment both parties sign (atomic, server-side)

When `/api/magic-sign/submit` records the **second** signature (`signatureStatus =
complete`), it runs, in order:

1. **Contract activation** — `status: active`, `fullySignedAt` (already done in submit).
2. **Core schedule** — RLI registration deadline + monthly rent `payments`
   (already done in submit).
3. **`finalizeContract()`** (this work), idempotent via `contract.finalizedAt`:
   - generates the **full obligations set** below (fiscal + procedural), tailored
     to the contract (cedolare? tenant EU/non-EU? deposit?);
   - **issues the tenant magic link server-side** (single-use, 72 h) — closes
     the old client-issued-link security hole;
   - sends the **tenant welcome email** (one-tap portal link **and** an account
     set-up CTA) and the **landlord welcome email** (active + obligations digest);
   - marks `finalizedAt` so it never double-fires.

Passes (Wallet) and the rendered signed-PDF remain a follow-up step (they can be
added to `finalizeContract` later); the obligations + onboarding are the legally
material part and are done here.

---

## 2. Fiscal obligations (impegni fiscali)

| # | Obligation | Who | When | Legal ref / notes |
|---|---|---|---|---|
| F1 | **Registrazione contratto** – Agenzia Entrate, Mod. **RLI** | Admin/Landlord | ≤ **30 gg** from sign (we set a 25-gg buffer) | DPR 131/1986. *(created by submit as the RLI deadline)* |
| F2 | **Scelta regime: Cedolare secca vs Registro+Bollo** (decision) | Landlord/Admin | before F1 | D.Lgs 23/2011 art. 3 |
| F3a | **Imposta di registro 2%** del canone annuo (min €67), F24 ELIDE | split 50/50 | ≤ 30 gg (at F1) | *only if regime ordinario* |
| F3b | **Imposta di bollo €16** ogni 4 facciate / 100 righe, per copia | split | at F1 | *only if regime ordinario* |
| F4 | **Cedolare: raccomandata/PEC al conduttore** – rinuncia aggiornamento ISTAT | Landlord | before/at F1 | *only if cedolare secca chosen* — required for the option |
| F5 | **Comunicazione cessione di fabbricato** alla Questura/P.S. | Landlord | ≤ **48 h** from consegna | art. 7 D.L. 59/1978 — *only if tenant **extra-UE*** |
| F6 | **Denuncia TARI** (occupazione) al Comune | Tenant | per comune (≈ entro l'anno) | comune-specific |
| F7 | **Voltura/attivazione utenze** (luce, gas, acqua) | Tenant | ~ start date | — |
| F8 | **Cambio residenza/domicilio** – Anagrafe | Tenant | optional (transitori = spesso domicilio) | DPR 223/1989 |
| F9 | **Dichiarazione redditi**: canone da dichiarare (CU/730/Redditi PF) | Landlord | anno successivo | — |

## 3. Procedural duties (adempimenti di rito)

| # | Duty | Who | When |
|---|---|---|---|
| R1 | **Consegna chiavi + verbale di consegna & lettura contatori** | Admin | start date |
| R2 | **Verifica APE allegato + deposito cauzionale incassato** | Admin | ≤ 3 gg from sign |
| R3 | **Inventario / stato dei luoghi** firmato | Admin + Tenant | start date |
| R4 | **Welcome + portale + pass** al conduttore | Auto (this flow) | immediate |

Conditional logic in `finalizeContract`:
- `cedolareSecca === true` → add **F4**, skip **F3a/F3b**; else add **F3a/F3b**, **F2** as a decision.
- tenant `nationality` not recognised as **EU/EEA** → add **F5** (better to over-remind a legal duty than miss it; tagged "se conduttore extra-UE").
- `deposit > 0` → R2 references the amount.

---

## 4. Tenant onboarding — two interchangeable paths

The tenant gets their account **either** way (both supported):

**A. Self-service, right after signing** — on `/sign` the success screen offers
"Activate your portal" (email + password). Implemented.

**B. From the welcome email** — `finalizeContract` emails the tenant a
**one-tap magic link** (`/portal.html?postSign=1&magicToken=…`, single-use, 72 h,
server-issued) that signs them in; the portal then prompts a password to make it
permanent. The same email has a fallback "Set your password" CTA.

So a tenant who closes the tab still receives everything by email and can finish
in one tap — and a tenant who stays finishes inline. No dead ends.

---

## 5. Where each item surfaces
- **Fiscal/procedural items** → `deadlines` (date-driven) + `tasks` (actions),
  linked by `linkedContractId`, tagged `category`, `owner`, `legalRef` →
  visible in the admin portal (and the relevant ones to landlord/tenant).
- **Magic link** → `magicLinks` doc (server-issued).
- **Emails** → Nodemailer (existing `api/agent/_lib.js → sendEmail`).
- **Idempotency** → `contract.finalizedAt`; re-running is a no-op.

This makes the post-signature moment a single, reliable, legally-complete event
the admin can trust and the tenant experiences as effortless.
