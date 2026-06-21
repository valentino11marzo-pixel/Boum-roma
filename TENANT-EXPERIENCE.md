# BOOM Rome — The Perfect Tenant Experience (study)

> The brief: *"study how the tenant can live the perfect experience."* This is the
> thinking that drives the upgraded `preview-tenant.html`. Grounded in how the
> best rental platforms work (sources at the end), filtered through BOOM's
> premium, agency-managed positioning.

---

## 1. The thesis

A tenant doesn't want a "portal." They want to feel three things, always:

> **At home. In control. Cared for.**

Everything else is mechanics. The perfect experience removes the three quiet
anxieties of renting:

1. **"Did my rent go through / will my deposit come back?"** → money is effortless and transparent.
2. **"Something broke and nobody's listening."** → help is instant and visibly handled.
3. **"Who do I even ask?"** → one place, one team, proactive — the tenant never chases.

BOOM's edge: it's **agency-managed**. A perfect BOOM tenant experience feels less
like software and more like a **concierge that happens to live in your phone**.

---

## 2. The tenant lifecycle (where experience is won or lost)

| Phase | The tenant's emotional job | What "perfect" looks like |
|---|---|---|
| **Move-in** (first 48h) | "Is this really mine? What do I need to know?" | Warm digital welcome, keys/access, **condition report with photos** (protects them), meter readings, wifi/utilities, building rules, emergency contacts — a guided checklist, not a PDF dump. |
| **Living** (the long middle) | "I just want things to work." | One-tap rent (autopay), 10-second issue reporting **with a photo**, live status, documents always there, a human a tap away. |
| **Relationship** (ongoing) | "Do they actually care?" | **Proactive** notices (boiler service booked, building notice), Rome concierge, a manager who reaches out *first*. |
| **Renewal / move-out** | "Will this be fair and easy?" | Early **renewal** offer, clear notice flow, **move-out inspection** vs the move-in one, transparent **deposit return**, a reference. |

The middle is frequent; the edges are **emotional**. A great move-in and a fair
deposit return are what tenants *tell people about*.

---

## 3. Principles of the perfect experience

1. **Zero-anxiety money.** Autopay + reminders, every payment a receipt, the
   **deposit visible and protected**. Never a surprise. *(45% want online pay; the
   best portals do autopay + reminders.)*
2. **Effortless help, visibly handled.** Report in 10 seconds with a photo →
   live status timeline → **a satisfaction check when it's fixed**. The tenant is
   never left wondering. *(Best portals log every update + run a follow-up survey.)*
3. **One place, proactively.** Rent, maintenance, documents, contacts, building
   notices — consolidated, and the system **pushes** what matters before they ask.
4. **Human, premium, local.** A name and a face, fast replies, and a Rome
   concierge layer that makes them feel they chose well.
5. **Lifecycle-aware.** The app knows where they are (just moved in vs lease
   ending) and surfaces the right moment — welcome, then renewal, then a clean exit.
6. **Calm by design.** Dark, quiet, gold-accented; one clear action per screen;
   nothing shouts. Premium = restraint.

---

## 4. Feature map → gap vs today's preview

Current `preview-tenant.html` already nails the **Living** middle: pay rent (SEPA),
maintenance with status, documents + Wallet, chat + concierge. The gaps are the
**emotional edges** and the **proactive** layer:

| Capability | Status | Perfect-experience upgrade |
|---|---|---|
| Pay rent (SEPA, €0 fee) | ✅ | + **deposit tracker** (amount, protected, return forecast) |
| Maintenance report + status | ✅ | + **photo**, + **"how did we do?" rating** on resolved, + scheduled-visit clarity |
| Documents + Wallet pass | ✅ | + **condition report**, + renewal docs |
| Chat + concierge | ✅ | + **building notices / announcements** (proactive push) |
| **Move-in / welcome** | ❌ | **NEW** — guided checklist: access, condition photos, meters, wifi, rules |
| **Deposit** | ❌ | **NEW** — held amount, protection, expected return |
| **Lease & renewal** | ❌ | **NEW** — days left, **renew** CTA, notice flow |
| **Profile & settings** | ❌ | **NEW** — household, emergency contact, notification prefs |

---

## 5. Design upgrade direction

- **Richer, calmer hierarchy** — a proper home hero, "what needs you" surfaced
  first, one primary action per card.
- **Lifecycle-aware home** — a dismissible **move-in welcome** when new; a
  **renewal** moment when the lease nears its end; **important dates** at a glance.
- **Proactive strip** — building notices / agency updates the tenant didn't ask for.
- **Micro-interactions** — the pay → *processing → settled* arc, satisfaction
  rating, smooth sheets; small moments that feel cared-for.
- **Profile from the avatar** — keep 5 clean tabs; settings/household live behind
  the header avatar.

The result: not "more buttons," but an app that **anticipates** the tenant —
quiet when nothing's needed, present at the moments that matter.

---

### Sources
- ManageCasa — best apartment apps, landlord & renter guide: https://managecasa.com/articles/best-apps-for-apartments-a-landlord-and-renter-guide
- DoorLoop — property management software with a tenant portal: https://www.doorloop.com/blog/5-best-property-management-software-with-a-tenant-portal
- Buildium — best tenant management software (renewals, move-in inspections): https://www.buildium.com/blog/best-tenant-management-software/
- TenantCloud — landlord-tenant communication tools (58% prefer text/email): https://www.tenantcloud.com/blog/top-communication-tools
