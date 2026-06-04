# BOOM — Portal Interface Study (Owners & Clients)

**Author**: Claude Code for BOOM Rome
**Date**: June 2026
**Branch**: `claude/compassionate-sagan-xdMgM`
**Scope**: The best-in-class interface BOOM should give its **owners (landlords)** and **clients (tenants + PFS clients)** inside `portal.html`, benchmarked against leading products and grounded in what BOOM already ships.

> Companion to `MAGIC_SIGN_AUDIT.md` and `APARTMENTS_RENEWAL_PROPOSAL.md`. This is a design-direction study, not a code change. It ends with a prioritized roadmap.

---

## 0. Method

1. Read the live portal: role nav (`buildNav`), `landlordDashboard()`, `tenantDashboard()`, and every `my-*` page.
2. Benchmarked the three personas against best-in-class products (below).
3. Filtered every idea through BOOM's premium dark-gold brand and its real Firestore data model (`properties`/`listings`, `contracts`, `payments`, `maintenance`, `pfsClients`, `users` incl. `taxRegime`).
4. Cross-checked against work in flight on other branches so proposals don't collide.

**Verdict up front:** the owner and tenant portals are already mature and well-built. This is an *elevation* job — consistency, visualization, fiscal intelligence, and lifecycle flows — not a rebuild.

---

## 1. Who we serve — three personas

| Persona | Goal in the portal | Emotional job |
|---|---|---|
| **Owner / Landlord** | "Is my money arriving, are my units full, am I compliant?" | Confidence + zero admin |
| **Tenant** (mostly expat/student) | "When/how do I pay, who fixes things, when does my lease end?" | Reassurance in a foreign system |
| **PFS Client** (pre-tenant, paid search) | "Where is my search, what should I do next?" | Momentum + trust they're being served |

The PFS client already has the new `?pfs=` dashboard (this branch). This study focuses on **Owner** and **Tenant**, and treats the PFS dashboard as the design reference for both.

---

## 2. Benchmark — what the best give each persona

**Landlord / owner platforms** — Buildium, AppFolio, Hemlane, Baselane, Stessa, Landlord Studio. The patterns that matter:
- **Owner statement as the home screen**: money in / money out / net, per-property and portfolio, as a *chart over time*, not just a number.
- **Tax-ready by default**: YTD income, deductible expenses, exportable year-end summary. (For Italy: cedolare secca 21% vs ordinario — a number the owner actually cares about.)
- **Occupancy & lease-expiry calendar**: see vacancies coming before they happen.
- **One-tap statement/report export** (BOOM already has the PDF — good).
- **Self-serve onboarding completeness**: the platform nudges the owner to finish their fiscal/bank data instead of staff chasing.

**Tenant / renter platforms** — Blueground, Spotahome, HousingAnywhere, Nestpick, plus premium PM tenant apps. Patterns:
- **One clear "what do I do now"**: next payment, with a single pay action.
- **Lifecycle, not just status**: move-in → living → renewal/move-out, each with a checklist. Deposit return is the #1 anxiety at move-out.
- **Maintenance with photos + visible SLA/status timeline** (BOOM has photos + statuses — strong).
- **Local-life concierge**: utilities, codice fiscale, residenza, transport — the expat pain. BOOM has the Info Hub + the new Concierge; they should connect.
- **Consistent language**: an expat product that flips between English and Italian mid-screen reads as unfinished.

---

## 3. Where BOOM stands today (from the audit)

**Owner — already shipped:** KPI cards (incassi mese, immobili, occupazione, manutenzioni); priority alerts (signature, overdue, expiring, maintenance); property list with cover images; pending payments; active contracts; maintenance; BOOM contact; **PDF owner report**; `my-properties` (occupancy, income, annual projection), `my-contracts` (signature state, expiry urgency), `my-payments` (`✔ mark paid`), `my-documents`.

**Tenant — already shipped:** KPI + lease-progress bar; alerts (signature/overdue/expiring); payment history; **Stripe pay + "I Paid" with receipt upload**; lease details + contract PDF; IBAN copy; quick actions; maintenance with photos; documents; Info Hub.

**Real gaps:**
- No **charts** in owner/tenant views (Chart.js is loaded but used only by the admin dashboard).
- No **fiscal position** for owners (`taxRegime` is stored but never surfaced).
- No **self-serve data-completeness** nudge for owners (admin has `landlordCompleteness` + `sendLandlordDataRequest`; the owner's own portal stays silent).
- **Language inconsistency** in tenant/landlord pages — a full i18n system exists (`setLang`/`S.lang`/`t()`) but the `my-*` pages bypass it with hardcoded `isTenant() ? EN : IT` and mix the two.
- No **move-out / deposit-return** flow and no in-app **renewal request**.

---

## 4. The Owner Portal we should give

**Design principles**
- **The dashboard is an owner statement.** Lead with money over time, not a static figure.
- **Compliance is a feature, not a chore.** Surface the fiscal number and the missing data inline.
- **Every number is a door.** KPI → drill-down (already partly true).

**Concrete modules (in priority order)**
1. **Income & occupancy chart (12 months).** Rent collected vs expected per month + occupancy line. Reuses the already-loaded Chart.js. Delivers the "6-month chart" the public `owners` page promises but the logged-in product doesn't.
2. **Fiscal tile + year export.** YTD collected, estimated tax by `taxRegime` (cedolare secca 21% / ordinario / forfettario), and a one-click year summary (extend the existing PDF). Turns BOOM into the owner's tax-prep ally.
3. **Profile-completeness banner (self-serve).** If `landlordCompleteness(u)` is incomplete, show a gold banner with inline edit for P.IVA/PEC/SDI/regime/IBAN — the data BOOM needs for fatturazione + registrazione. Cuts staff chasing.
4. **Lease-expiry & vacancy strip.** A compact timeline of upcoming expiries and current vacancies — the supply-side radar. (Coordinate with the **Re-let Engine** on `eloquent-galileo`.)
5. **Per-property mini-P&L** (later): rent in − maintenance/costs out, net per unit.

**Brand**: dark `#08080A`, gold `#D4AF37`, Helvetica Neue 300; charts in muted gold/green/red on transparent backgrounds; no bright `#FFD700`.

---

## 5. The Client / Tenant Portal we should give

**Design principles**
- **Always answer "what now?" first.** Next payment + single action above the fold (already close).
- **Lifecycle over status.** Make move-in → living → renewal/move-out explicit, mirroring the PFS journey timeline.
- **One language, theirs.** Route every tenant page through the existing i18n.

**Concrete modules (in priority order)**
1. **Language consistency.** Move `my-*` pages onto `S.lang`/`t()` so the 🇮🇹/🇬🇧 toggle actually governs them; default expats to EN. Pure polish, high perceived quality.
2. **Move-out & deposit-return flow.** A checklist (notice given, final readings, cleaning, keys) + a visible deposit-return status. Resolves the biggest end-of-lease anxiety, especially on transitorio/student leases.
3. **One-tap "Request renewal."** Turn the passive "contact your landlord" expiry alert into an action that notifies admin + owner (reuse `createNotification`).
4. **Concierge + Info Hub fusion.** Embed the new BOOM Concierge inside the Info Hub (and offer it on the tenant dashboard) so codice-fiscale/residenza/utilities questions get answered 24/7 in-context.
5. **Payment clarity.** Keep Stripe + "I Paid"; add a small "receipts" shelf and a next-payment countdown chip.

---

## 6. Cross-cutting (applies to both)

- **Visualization**: promote Chart.js into both role dashboards (it's already loaded lazily).
- **i18n**: one system, applied everywhere; never mix languages on a screen.
- **Mobile-first**: owners and tenants are phone users — the sidebar already collapses; verify KPI grids reflow to 2-up on mobile.
- **Accessibility & motion**: keep `prefers-reduced-motion` discipline (already used elsewhere).
- **Brand**: single gold token `#D4AF37`, dark surfaces, generous letter-spacing.

---

## 7. Coordination with parallel work (other chats)

Snapshot at time of writing — flag overlaps before building:

| Branch / PR | What it does | Touch-point with this study |
|---|---|---|
| `main` ← **PR #21 (merged)** | B2B pricing ladder + nav + outreach engine | None (marketing) |
| **PR #22** `great-mccarthy` | Homepage "For Organisations" + `/partners` hub | None (marketing) |
| **PR #9** `beautiful-lovelace` | Login redesign + security hardening + `LOGIN_SECURITY_AUDIT.md` | Shares the portal entry point; align brand tokens (it standardizes gold). |
| `eloquent-galileo` | **Zero-Vacancy Re-let Engine** | **Direct overlap** — feeds the owner "vacancy/expiry strip" (§4.4). Build on top, don't duplicate. |
| `audit-boomrome-site` | PFS admin test harness for Homie + match reasons | **Overlap with our PFS admin work** — both touch `pfsClients`/PFS detail. Coordinate before editing the same modal. |
| `epic-keller` | Apartments v2 incl. **"concierge match"** | **Overlap with our Concierge** — both touch the concierge surface. Align on the `/api/concierge` contract. |
| `relaxed-carson` | Full Quality/Innovation/Conversion audit (docs) | Cross-reference its findings into the roadmap. |
| `sprint/master-2026-05-02` (PR #1, draft) | Tickets/Payments/Atlas/Lab master sprint; **Maintenance → Tickets refactor** | **Heads-up**: if maintenance becomes "Tickets", build §5.2/§4 on the new model, not the old one. |

**Rule**: anything touching `pfsClients`, the PFS detail modal, the concierge endpoint, or the maintenance/tickets model must be checked against the branches above before merge to avoid stepping on parallel work.

---

## 8. Prioritized roadmap

**P0 — high value, low risk, no collisions**
- Tenant language consistency (§5.1)
- Owner income & occupancy chart (§4.1)
- Owner profile-completeness banner (§4.3)

**P1 — high value, coordinate first**
- Owner fiscal tile + year export (§4.2)
- Tenant move-out + deposit-return + renewal request (§5.2–5.3) — *confirm maintenance/Tickets direction with sprint PR #1*
- Concierge ↔ Info Hub fusion (§5.4) — *align with `epic-keller`*

**P2 — later**
- Owner vacancy/expiry strip (§4.4) — *build on `eloquent-galileo`*
- Per-property mini-P&L (§4.5)

---

## 9. What I can start immediately

The three **P0** items are self-contained in `portal.html`, touch no files other branches are editing, and reuse infrastructure that already exists (Chart.js, the i18n system, `landlordCompleteness`). Recommended first build: **Owner income/occupancy chart + profile-completeness banner** (visible value for owners) and **tenant language pass** (perceived quality for clients).
