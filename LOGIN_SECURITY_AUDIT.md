# BOOM Rome — Login Redesign + Infrastructure & Efficiency Audit

_Date: 2026-06-03 · Scope: `login.html`, `vercel.json`, `/api/*`, `sw.js`, Firebase auth surface_

This document covers two things:

1. **The login page rebuild** — what changed and why.
2. **A cyber-security + "digital highways" (network/performance) audit** of the
   surrounding infrastructure, with severity and concrete fixes.

---

## 1 · Login page — rebuilt to a premium standard

`login.html` was rewritten end-to-end while keeping the **exact same working
Firebase email/password flow**. No behavioural regression: same SDK (compat
9.22.0), same `signInWithEmailAndPassword`, same persistence + Safari delay,
same `?next=` redirect contract, same WhatsApp/forgot-password actions.

### Design / UX upgrades
- **Brand-aligned palette** — switched to the live site's real tokens (`#FFD700`
  gold + `#635BFF` violet accent, refined neutrals from `index.html`). The old
  page used an off-brand `#F5A623`.
- **Atmospheric background** — dual drifting gold/violet orbs, masked tech-grid,
  and a fine film-grain layer, matching the homepage's premium depth.
- **Glass card** — layered shadow, gold top-hairline, blur, spring entrance.
- **Iconed inputs** — mail/lock glyphs, gold focus ring, hover states.
- **Password reveal toggle** — accessible eye button (`aria-pressed`).
- **Caps-Lock warning** — live hint while typing the password.
- **Inline SVG icons** for messages, the WhatsApp button, and a trust badge
  ("Encrypted · Firebase Auth"). Zero extra network requests.
- **Accessibility** — `role="alert"` + `aria-live` messages, real `<label>`s,
  `:focus-visible` rings everywhere, `prefers-reduced-motion` disables all
  animation, `min-height: 100svh` + safe-area insets for mobile.

### Security hardening baked into the page
| Fix | Before | After |
|---|---|---|
| **Account enumeration** | Showed `User not found` vs `Wrong password` — confirmed which emails exist | Single generic _"Incorrect email or password"_; only non-enumerating codes (`too-many-requests`, `network`, `user-disabled`) get specific copy |
| **Password reset leak** | "Reset email sent!" / "Error sending email" revealed registration status | Always _"If an account exists, a reset link is on its way"_; `user-not-found` swallowed |
| **Open redirect** | `?next=` checked for `/`, `//`, `:` | Same + blocks backslash tricks (`/\`, `\`) and caps length at 512 |
| **Reverse tabnabbing** | `target="_blank"` with no `rel` | `rel="noopener noreferrer"` on the WhatsApp link |
| **CSP** | none | Scoped `Content-Security-Policy` meta locking script/connect/frame to Firebase Auth + Google Fonts only |

### Performance upgrades
- Firebase SDK now loads with **`defer`** (was render-blocking) — first paint no
  longer waits on two `gstatic` scripts. Logic runs in `DOMContentLoaded`, after
  the deferred scripts have executed in order, so `firebase` is guaranteed ready.
- **Removed a duplicate** `preconnect` to `fonts.googleapis.com`.
- Trimmed the Inter font request from **6 weights (200–700) → 5 (300–700)**;
  weight 200 was never used.
- Added `preconnect` to `www.gstatic.com` + `identitytoolkit.googleapis.com` and
  `dns-prefetch` to `securetoken.googleapis.com`, so the TLS handshake for the
  auth round-trip starts during page parse instead of after submit.

---

## 2 · Cyber-security audit

### ✅ Strong points (keep these)
- **`vercel.json` headers** are a solid baseline applied site-wide: HSTS
  (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
  a locked-down `Permissions-Policy`, and `noindex/no-store` on admin surfaces.
- **`/api/parse-docs.js`** is genuinely well-built: bearer auth with
  `crypto.timingSafeEqual`, per-IP rate limiting, server-pinned model,
  `max_tokens` ceiling, request-field whitelist, CORS allowlist, payload cap.
- **`/api/stripe-webhook.js`** verifies the signature via `constructEvent`.
- **Open-redirect** protection on `?next=` was already present (now hardened).

### ⚠️ Findings (ranked)

**M1 · `/api/geocode-all` is unauthenticated and amplifiable — _Medium_**
The endpoint loops over every listing, sleeping `1100 ms` per geocode and making
outbound Nominatim calls. It has **no auth**. The `?from=&to=` params change the
edge-cache key, so an attacker can bypass the cache and repeatedly hold open
serverless functions / hammer outbound egress (cost + mild DoS). It also ships a
**hardcoded fallback Firebase API key** (`api/geocode-all.js:12`).
→ _Fix:_ gate behind a shared secret header (reuse the `parse-docs` bearer
pattern) or move it out of the deployed `/api` surface to a local script; drop
the hardcoded key fallback.

**M2 · No site-wide Content-Security-Policy — _Medium_**
There is no CSP header in `vercel.json`. Any XSS (e.g. an unescaped Firestore
field rendered in `portal.html`) has no second line of defence. A scoped CSP is
now shipped on `login.html`; a site-wide policy needs care because content pages
load many CDNs (jsPDF, html2canvas, Chart.js, EmailJS, Stripe, Firestore, maps).
→ _Fix:_ roll out a `Content-Security-Policy-Report-Only` in `vercel.json`
first, enumerate the CDNs from the violation reports, then enforce.

**M3 · Firebase access control rests entirely on Security Rules — _Medium (verify)_**
The web `apiKey` is public **by design** — it is not a secret. That means the
**Firestore + Storage Security Rules are the only real authorization boundary**.
These rules are not in this repo, so they couldn't be audited here.
→ _Fix:_ confirm rules deny-by-default, scope reads/writes per-`uid`/role, and
that collections written by the admin-token path (`leads`, `action_queue`,
`activityLog`, `listings`) aren't world-writable from the client SDK.

**L1 · Non-constant-time secret comparison in webhook auth — _Low_**
`api/homie/_lib.js` (`requireSecret`) and `api/agent/_lib.js` (`guardPost`)
compare the shared secret with plain `!==` / `===`. Timing side-channel is
negligible for a high-entropy secret, but for consistency with `parse-docs`,
use `crypto.timingSafeEqual`.

**L2 · `Access-Control-Allow-Origin: *` on agent endpoints — _Low / Info_**
`guardPost` returns `*`. This is **acceptable** here because those endpoints
authenticate via custom headers (`X-Homie-Secret` / `X-Firebase-Token`), not
cookies, so there's no CSRF exposure — but worth documenting so it isn't copied
onto a future cookie-authenticated endpoint.

---

## 3 · "Digital highways" — network & efficiency audit

### ✅ Good
- Static assets (`png|jpg|svg|woff2|…`) carry `Cache-Control: public, max-age=
  31536000, immutable` — ideal.
- Service worker is **network-first for HTML/API** (always-fresh auth pages,
  no stale-login risk) and cache-first only for declared icons. Correct posture.
- `cleanUrls` + 301 redirects keep canonical URLs tidy (good for caching/SEO).

### ⚠️ Opportunities
**P1 · `portal.html` is ~2.24 MB / ~21k lines — _High impact, app-wide_**
This single file is the heaviest object on the network and the biggest
parse/exec cost. Vercel serves it brotli/gzip-compressed (wire size much
smaller), but decode + execute on mid-range mobile is the real tax.
→ _Fix (future):_ split rarely-used dashboards/analytics into lazy-loaded
modules; defer Chart.js/jsPDF/html2canvas until a chart/export is actually
opened.

**P2 · Third-party libs loaded eagerly via CDN `<script>`** across content
pages (Chart.js, jsPDF, html2canvas, EmailJS). Each is a blocking request on
pages that may never use it.
→ _Fix:_ `defer` them, or lazy-inject on first use (the login rebuild
demonstrates the `defer` pattern for Firebase).

**P3 · Login-page font + SDK blocking** — _fixed_ in this change (see §1).

---

## 4 · Prioritised next steps
1. **M1** — authenticate or retire `/api/geocode-all` (quick, removes a real abuse vector).
2. **M3** — audit & lock Firestore/Storage Security Rules (the actual auth boundary).
3. **M2** — ship `Content-Security-Policy-Report-Only` site-wide, then enforce.
4. **P1/P2** — lazy-load heavy libs and start carving down `portal.html`.
5. **L1** — switch webhook secret checks to `timingSafeEqual`.
