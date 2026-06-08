# BOOM · Growth & Analytics

How BOOM measures growth, and how Claude plugs in as the analysis partner.
Companion to `docs/seo-conversion-audit.md` (organic/SEO) — this file is about
**measurement, the live dashboard, and the growth loop**.

---

## 1. What's instrumented

- **GA4** — measurement id `G-EYCD59RDVJ`, loaded via `gtag` site-wide.
- **`js/boom-track.js`** — the conversion + attribution layer on every public
  page. It does three things:
  - **First-touch attribution** (`utm_*` → referrer → direct), persisted in
    `localStorage` as `boom_src`, and stamped into every form (`boom_source`)
    and WhatsApp prefill (`(ref: instagram)`), so every lead self-reports.
  - **GA4 conversion events**, all carrying `source_channel`:
    | Event | Fires when |
    |---|---|
    | `generate_lead` | any `<form>` submit |
    | `whatsapp_click` | click on a `wa.me` / `api.whatsapp.com` link |
    | `begin_checkout` | click on a `buy.stripe.com` link |
    | `cta_intent` | click to `#form / #booking / #contact / …` anchors |
  - Bilingual WhatsApp prefill (IT/EN) from the page title.

## 2. Tracking audit — coverage

Run `node scripts/ensure-analytics.js` any time; it's idempotent and only tags
pages that are missing GA4 / `boom-track.js`.

**Fixed in this pass** (had `boom-track.js` firing into the void with no GA4, or
were public funnel pages with no tracking at all): `book, booking, deals,
contact, faq, 404, onboarding, canone, match, terms, privacy, precheck,
form-landlord, form-tenant, tenant-registration`.

**Intentionally excluded** (internal `noindex,nofollow` tools, not public):
`compliance, relet, underwriting`. App/portal surfaces (`portal, dashboard,
owner-dashboard, client-portal, …`) are post-conversion and out of scope for
marketing tracking — left as-is.

## 3. The live dashboard — `/growth`

Admin-only page (`growth.html`) → `GET /api/analytics` (admin-gated via Firebase
ID token) → **GA4 Data API**. Shows headline KPIs, the lead funnel (the four
`boom-track` events), a sessions/users trend, acquisition channels, top pages,
and live active users. Range toggle: 7 / 28 / 90 days.

### One-time connection (this is the "connect Claude to GA" step)
The Data API needs read access to the GA4 property via a **service account**:

1. **Google Cloud** → create a service account → create a **JSON key**, download it.
2. **GA → Admin → Property Access Management** → add the service-account email
   with **Viewer**.
3. **GA → Admin → Property Settings** → copy the numeric **Property ID**.
4. **Vercel → Project → Settings → Environment Variables**:
   - `GA_SERVICE_ACCOUNT_JSON` = the full JSON key (raw or base64)
   - `GA4_PROPERTY_ID` = the numeric id
5. Redeploy. `/growth` lights up automatically — until then it shows a setup card.

The Anthropic/Google keys never touch the browser; the service-account JWT is
signed server-side with `node:crypto` (no new npm dependency).

## 4. Two ways Claude analyzes growth

1. **Live** — once the env vars above are set, ask "read `/growth` and tell me
   what's moving." The same data the page renders is available to reason over.
2. **Offline (works today, no setup)** — drop a GA4 export, a Looker/Sheets
   export, or a CSV into **Google Drive**; Claude can read Drive and turn it
   into a growth memo (funnels, channel ROI, drop-offs, ranked experiments).

## 5. Growth metrics framework

- **North star:** qualified viewings booked (and downstream signed contracts) —
  not raw sessions. Proxy until contract data is joined: `generate_lead` +
  `whatsapp_click` weighted by `source_channel` quality.
- **Funnel:** `session → cta_intent → (generate_lead | whatsapp_click) →
  begin_checkout → contract`. Watch the biggest step-to-step drop; that's the
  next thing to fix.
- **Channel ROI:** segment every event by `source_channel`. Instagram vs Google
  vs direct vs referral — optimise spend/effort toward the channel with the best
  lead→contract rate, not the most clicks.
- **Page efficiency:** top pages by views × their `cta_intent` rate surfaces
  which content actually moves people toward booking.

## 6. Suggested first experiments

- **Custom dimension `source_channel`** — register it in GA4 (Admin → Custom
  definitions) so channel attribution shows natively in GA reports, not just in
  the event params.
- **Mark conversions** — flag `generate_lead`, `whatsapp_click`, `begin_checkout`
  as conversions in GA4 so Google's reports/optimisation use them.
- **Weekly growth memo** — optional: extend `api/reminder-cron.js` to call
  `buildOverview()` weekly and email the digest, or have Claude generate it from
  the Drive export on a `/loop`.
