# BOOM Portal — Security Audit

**Auditor:** Claude (Opus 4.7)
**Date:** 2026-06-04
**Scope:** `portal.html` (25,523 lines), `js/boom-portal.js`, `js/firebase-config.js`, all `/api/*` serverless functions
**Method:** Static code review; no dynamic testing performed.

---

## EXECUTIVE MEMO (for the founder — 250 words)

**Overall risk: CRITICAL.** The portal is functionally a single shared database that 56 HTML pages talk to, with role checks that exist only inside the browser. There are no `firestore.rules` in this repo, which means either rules don't exist at all in the Firebase console or they were never version‑controlled — both are bad. Until rules are written, **every authenticated user (any tenant, any landlord, anyone who can sign up) can read every contract, every payment, every lead, every PFS client, every codice fiscale, every IBAN, and every signed contract image in your entire business.** They just have to open Chrome DevTools and type `S.payments` or `S.pfsClients`. Worse: when a tenant logs in, the portal **deliberately fetches the entire database** (3,645 lines of JS), then hides records by visibility — the data is already on their machine; the UI is the only thing pretending they can't see it. The localStorage cache (line 3,699) writes that full dump to disk, where it persists for 5 minutes even after logout.

There are also several "trust the client" write paths (anyone authenticated can call `deleteRecord('user', 'any-uid')` from the console), one place where the admin password is exposed via a plain `prompt()` dialog, and a parser bearer token stored in a Firestore doc that anyone authenticated can read.

The fix is mostly one file: **write Firestore Security Rules.** Concrete examples are in section 11 below. Estimated work: one focused day. Until then, treat all customer data as effectively public to anyone with a login.

**Severity inventory:** 3 CRITICAL · 6 HIGH · 5 MEDIUM · 4 LOW.

---

## EXECUTIVE SUMMARY

- **No Firestore rules in repo.** `firebase.json`, `firestore.rules`, `firestore.indexes.json` — all absent. A grep for "rules" in `portal.html` turns up two telling comments at lines 2133 and 16675 acknowledging that "rules must allow anon reads" — the team has explicitly delayed hardening Firestore Security Rules.
- **Client-side data filtering only.** `loadDataFresh()` (`portal.html:3639-3771`) does unfiltered `.get()` calls on `users`, `properties`, `contracts`, `payments`, `maintenance`, `documents`, `leads`, `pfsClients`, `pfsProperties`, `pfsActivities`, `landlords`, `activityLog`, `invoices`. The only protection against tenant A seeing tenant B's contract is JS functions like `getMyContracts()` (`portal.html:1957-1965`). Anyone in DevTools bypasses this in seconds.
- **Whole-dataset cache to `localStorage`.** Line 3,699 writes the entire pulled dataset to `boom_data_cache` with a 5-minute TTL. After a tenant uses your portal on a friend's laptop, their browser holds your full database for 5 more minutes.
- **Privileged writes lack role gates.** `deleteRecord()` (line 13,325-13,351) has no `isAdmin()` check — any authenticated user can delete any user, property, contract, or payment by calling it from DevTools. Same for `saveUser()` (line 12,283) — anyone authenticated can create a new user with `role: 'admin'`.
- **Admin-only API endpoints look fine.** `/api/admin/match-test.js` and `/api/agent/*` correctly verify a Firebase ID token + role/email whitelist server-side. `/api/parse-docs.js` is well-hardened. `/api/homie/*` requires the `HOMIE_SECRET` shared secret. The PCI surface (Stripe) is signature-verified.
- **One credential is exposed.** The `parse-docs` bearer token is stored as a plain string in Firestore doc `config/parse_docs` (`boom_doc_parser.html:512`). With wide-open rules, any signed-in user can read it and burn through your Anthropic budget.
- **Admin password re-prompted in cleartext via `prompt()`** at line 13,495 when creating a portal account for a client (because the SDK signs the admin out when it makes the new user).

The Firestore-rules gap is so foundational that fixing it cancels out roughly 60% of every other finding below. Do that first.

---

## FINDINGS TABLE

| # | Severity | Finding | File:Line | Recommended fix |
|---|----------|---------|-----------|----------------|
| 1 | **CRITICAL** | No `firestore.rules` in repo. State in production console unknown. | (absent) | Author rules from the example in §11. Commit `firestore.rules` + `firebase.json`. Deploy via `firebase deploy --only firestore:rules`. |
| 2 | **CRITICAL** | `loadDataFresh()` reads every collection with no `where()` filter — tenant browser receives the entire database. | `portal.html:3639-3771` | Replace bulk `.get()` with role-scoped queries: tenants → `where('tenantId','==',uid)`; landlords → `where('ownerId','==',uid)`; admin → unrestricted. Rules in §11 enforce this server-side. |
| 3 | **CRITICAL** | Full dataset cached to `localStorage.boom_data_cache` (5-min TTL). Survives logout on shared devices. | `portal.html:3697-3707, 4598, 4610` | Drop the cache (or scope to the user's own subset only); already cleared on logout but persistence-after-close is the issue. Tag with `S.profile.id` and refuse to load if `uid` differs. |
| 4 | **HIGH** | `deleteRecord(type,id)` issues `db.collection(c).doc(id).delete()` with no role check. Any signed-in user can delete any user, contract, payment, lead by calling from DevTools. | `portal.html:13325-13351` | Add `if (!isAdmin()) return toast('error','Forbidden');` at top. Enforce in Firestore Rules anyway (clients can be tampered with). |
| 5 | **HIGH** | `saveUser()` accepts arbitrary `role` from `<form>` input — any signed-in user could open the addUser modal (or POST programmatically) and self-promote. | `portal.html:12283-12310` | Gate with `if (!isAdmin()) return;` server-side via rules: `allow create: if isAdmin() && request.resource.data.role in ['tenant','landlord','admin'];` |
| 6 | **HIGH** | Anonymous Firestore reads required for Magic Sign — `signInAnonymously()` then `.where('tenantSignToken','==',token).get()` on the whole `contracts` collection. Acknowledged in comment as TODO. | `portal.html:2136, 2184, 16675` | Replace with a Cloud Function that takes the token and returns ONLY the matching contract. Rules: `allow read: if false;` on `contracts` for anon users. |
| 7 | **HIGH** | `parse-docs` bearer token stored as plain string in `config/parse_docs/bearer` Firestore doc. Any signed-in user with read access to `config` collection can exfiltrate. | `boom_doc_parser.html:512-518` | Restrict via rules: `match /config/{doc} { allow read: if isAdmin(); }`. Better: move to a server-side endpoint that proxies and uses the Firebase ID token + role check (mirror what `match-test.js` does). |
| 8 | **HIGH** | Admin password re-entered via `window.prompt()` then immediately used for `signInWithEmailAndPassword`. Plaintext in browser process memory + visible in any screen recording / shoulder surf. | `portal.html:13495-13497` | Use Firebase Admin SDK in a Vercel function: pass `name/email/role`, server creates the user via `auth.createUser()`, no client re-auth needed. Or use `createUserWithEmailAndPassword` on a SECONDARY auth instance (Firebase JS SDK supports this) so the admin session isn't disturbed. |
| 9 | **HIGH** | First-account bootstrap: any newly-signed-up Firebase user with no existing `users/{uid}` doc is auto-assigned `role: 'admin'`. | `portal.html:3553-3560` | Either keep but only when the `users` collection is empty (verify via a tx), or set `role: 'tenant'` and require manual admin promotion. |
| 10 | MEDIUM | `S.profile.role` source-of-truth is good (read from Firestore each session, line 3543, 3545), BUT `loginWithEmail` and magic-link paths trust `localStorage.boomTenantSession` for the `tenantId` (line 3499-3520). If the LS value is swapped, the anon user is auth'd as a different tenant. | `portal.html:3499-3536` | Validate the session by re-reading `magicLinks/{tokenId}` server-side OR include an HMAC in the LS payload. Currently a malicious tenant can hand-edit LS to view another tenant's data (the anon Firestore read still must pass rules — see #2). |
| 11 | MEDIUM | Bulk read of `users` collection on every login (line 3,645). Exposes ALL emails, phones, names, codici fiscali, IBANs, business names, PIVA to every signed-in tenant/landlord. | `portal.html:3645, 12283-12345` | Limit per role with `where('role','in',allowedRolesForViewer)` + corresponding Firestore rule. Tenants should NEVER read other `users`. |
| 12 | MEDIUM | XSS exposure: 309+ template-literal interpolations using free-text fields (names, notes, addresses, messages). `esc()` exists (line 18849) and is used 189 times, but ~120 untracked interpolations remain (`activityLogPage` line 6423-6424 escapes; many ad-hoc UI strings do not — e.g. line 4248 `${n.text}`). | `portal.html` (many) | Audit-and-replace untrusted-input interpolations with `esc()`. Add CSP: `Content-Security-Policy: default-src 'self'; script-src 'self' <trusted>; ...` in `vercel.json`. |
| 13 | MEDIUM | Service-account-equivalent (admin email/password) stored in `FIREBASE_ADMIN_EMAIL` + `FIREBASE_ADMIN_PASS` env vars and used by 8 server functions (`reminder-cron`, `stripe-webhook`, `homie/_lib`, etc.). If the admin's password is rotated, every backend breaks. Also: a leaked admin password = full Firestore + Auth control. | `api/homie/_lib.js:25-45`, `api/reminder-cron.js:18-34`, `api/stripe-webhook.js:14-30` | Switch to a service account JSON (or workload-identity in newer Firebase). Already a known Firebase anti-pattern; documented at top of each file. |
| 14 | MEDIUM | `signRequests`, `magicLinks`, `action_queue`, `notifications`, `messageLog`, `heartbeat` collections — write paths in agent + portal — have no client-side role gate beyond `isAdmin()` UI hides; relies entirely on (absent) Firestore rules. | `portal.html:5673-5697, 16681`; `api/agent/messages.send.js`; `api/agent/execute.js` | Add rules: `allow read,write: if isAdmin();` for admin-only collections; `magicLinks` write should be restricted to authenticated admin or via a Cloud Function. |
| 15 | LOW | `EMAILJS_CONFIG` and Firebase API key are inlined in HTML (line 1370-1379, `js/firebase-config.js:4`). This is by design for Firebase web-config, but the Firebase API key MUST be locked via the GCP Console (Application restrictions → HTTP referrers → `boomrome.com/*`, `www.boomrome.com/*`, `localhost`) to prevent quota theft. | `js/firebase-config.js:4` | Confirm referrer restriction is set on the API key in Google Cloud Console → Credentials. Without it, anyone can scrape the key and burn your quota. |
| 16 | LOW | `notify-viewing-created.js` has zero auth — anyone can POST and trigger admin emails. CORS-locked to `boomrome.com` but trivial to bypass (no Origin check in a curl call). | `api/notify-viewing-created.js:25-40` | Add a same-origin or HMAC check on the body. Or rate-limit per-IP. Low-impact because it only sends an email, but could be used for spam/phishing. |
| 17 | LOW | `reserve-checkout.js` and `create-checkout.js` accept `email/phone/amount` from the body with NO auth. Stripe webhook is signature-verified (good) but the checkout-creation endpoint is open. | `api/reserve-checkout.js:13-67`, `api/create-checkout.js:5-63` | Currently fine since amounts are clamped server-side (line 27-29). Make sure the clamp stays. Add CAPTCHA on the front-end forms. |
| 18 | LOW | Session timeout exists (30 min, line 1293, 1922-1927) but only triggers if the tab stays open and user is idle. A token in localStorage survives until Firebase refreshes it (1h cycle). Not unique to this app but worth knowing. | `portal.html:1293, 1922` | Acceptable. Consider `auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)` so closing the tab logs out. |

---

## DETAILED FINDINGS

### 1. Authentication flow

- Login: Firebase Email/Password (`auth.signInWithEmailAndPassword`, `portal.html:4570`). Magic-link tenant session uses `signInAnonymously()` + a token in `magicLinks/{tokenId}` (line 2136-2168). Single-use, 1h expiry — that part is well-designed.
- `auth.onAuthStateChanged` (`portal.html:3487-3593`) is the single boot path. On signin it fetches `users/{uid}` and writes to `S.profile`.
- Roles recognized: `admin`, `landlord`, `tenant`. Reading `portal.html:1947-1949` and `portal.html:13460-13468`, no other role is treated specially. `owner` appears only in `api/admin/match-test.js:34` as a SYNONYM for admin (alongside `landlord`) — a slight inconsistency: in the portal, landlord ≠ admin.
- **The role is read FROM FIRESTORE on every login**, not from localStorage (good). However, see finding #10 — the magic-link tenant session reads `tenantId` from localStorage, which CAN be tampered with.
- `BoomPortal.requireAuth()` in `js/boom-portal.js:168-211` is solid; it re-fetches the user profile and validates role. But this is used only by `owner-dashboard.html`, `tenant.html`, `client-portal.html` — NOT by `portal.html`, which has its own auth path.
- **Role spoofing risk: LOW** (assuming Firestore rules prevent self-update of `role` field — currently no rules, so HIGH in practice).

### 2. Client-side role enforcement

`portal.html:4760-4820` (`renderPage()`) is a giant switch with `isAdmin() ? page() : accessDenied()` guards on every admin-only route — that part is consistent.

But `accessDenied()` only hides the UI. The data is already in `S.payments`, `S.contracts`, `S.users`, etc. A tenant who types `JSON.stringify(S.users)` in DevTools sees every user record in the system.

The role functions (`isAdmin/isLandlord/isTenant`, line 1947-1949) themselves are correct. The filtering functions (`getMyProperties`, `getMyContracts`, `getMyPayments`, `getMyMaintenance`, `getMyDocuments`, line 1951-1988) correctly slice `S.*` by `ownerId` / `tenantId` — but the slicing happens AFTER the data is loaded.

### 3. Data filtering — the critical question

**Every collection is loaded with `.get()` and no `where()` clause.** Concrete evidence:

```js
// portal.html:3645-3647 — runs for EVERY user
const [users, props, contracts] = await Promise.all([
    db.collection('users').get(),
    db.collection('properties').get(),
    db.collection('contracts').get()
]);
```

```js
// portal.html:3661-3665
const [payments, maint, clients] = await Promise.all([
    db.collection('payments').get(),
    db.collection('maintenance').get(),
    db.collection('clients').get()
]);
```

```js
// portal.html:3685-3689
const [docs, invoices, rules, ruleExecs] = await Promise.all([
    db.collection('documents').get(),
    db.collection('invoices').get(),
    db.collection('rules').get(),
    db.collection('ruleExecutions').orderBy('executedAt', 'desc').limit(50).get()
]);
```

```js
// portal.html:3741-3746
const [pfsClients, pfsProperties, pfsActivities, landlords] = await Promise.all([
    db.collection('pfsClients').get(),
    db.collection('pfsProperties').get(),
    db.collection('pfsActivities').orderBy('timestamp', 'desc').limit(100).get(),
    db.collection('landlords').get()
]);
```

This is the single most important finding. **Without Firestore rules, every tenant who logs in pulls the entire customer database into their browser** — emails, phones, codici fiscali, IBANs, signed contract images (base-64 PNG, line 14238), payment amounts, business notes, lead intelligence, PFS client conversations.

### 4. Write operations

Most writes flow through `S.profile.id` (the signed-in user's UID) as the actor field. Owner ID is supplied as a `<form>` value — not derived from `currentUser` — so a tenant calling `saveProperty()` from DevTools could create a property under another user's `ownerId`. Specific paths:

- `saveProperty(e)` — line 12368-12420 — accepts `data.ownerId` from form, no role check.
- `saveContract(e)` — line 12420+ — writes contracts unrestricted.
- `saveUser(e)` — line 12283-12310 — **creates Firebase auth user + Firestore user with form-supplied role**. NO `isAdmin()` gate on the function itself; the only protection is that the addUser modal is only shown to admins. Defeat: open DevTools, paste `saveUser({target:document.createElement('form'),preventDefault:()=>{}})` with FormData injected, become admin.
- `updateUser` (line 12312-12345) — same shape, can update arbitrary `role` field.
- `deleteRecord` (line 13325-13351) — no role check, deletes any doc in any of 13 collections.
- `db.collection('contracts').doc(c.id).update(...)` (lines 2651, 2890, 2902, 2914, 3868, 13165, 13184, 13205, 14238, 15283, 15650) — none gated by ownership check on the client. Tenant could update a contract belonging to another tenant via DevTools.
- `db.collection('payments').doc(id).update(...)` (lines 9022, 9055, 9199, 9230, 10657, 13222) — same.

### 5. API endpoints — `/api/*`

| File | Auth | Risk |
|---|---|---|
| `/api/generate-pass.js` | None (any browser can request) | Generates `.pkpass` from arbitrary `passType + fields`. Could be abused to spoof BOOM-branded passes for phishing. Recommend Firebase ID-token check + role gate. |
| `/api/parse-docs.js` | Bearer token (constant-time check, rate-limited, hardened) | **Good.** Best-of-class in this codebase. |
| `/api/reminder-cron.js` | Vercel cron (path-based) + admin Firebase login | OK. |
| `/api/homie/inbound.js` | `X-Homie-Secret` shared secret | OK. CORS `*` is acceptable since secret is required. |
| `/api/homie/action.js` | Same | OK. |
| `/api/homie/property.js` | Same | OK. Writes to `pfsClients.portalProperties` for all matching clients — relies on Mac-side scoring; impact bounded by `_match.js`. |
| `/api/admin/match-test.js` | Firebase ID token → role check (`admin/owner/landlord`) | **Good.** Server-side `fsGet('users/'+uid)` then `ADMIN_ROLES.has(profile.role)`. Only one I saw doing it right. |
| `/api/agent/*` (15 files) | Either `X-Homie-Secret` OR `X-Firebase-Token` + `AGENT_ADMIN_EMAILS` whitelist | OK. `guardPost()` in `api/agent/_lib.js:100-121` is the shared gate. |
| `/api/stripe-webhook.js` | Stripe signature (`STRIPE_WEBHOOK_SECRET`) | OK. |
| `/api/create-checkout.js` | None | Acceptable — only creates Stripe Checkout sessions with fixed €350 price. |
| `/api/reserve-checkout.js` | None, but server-side clamps amount to [100,2000] | OK with the clamp. Don't remove it. |
| `/api/notify-viewing-created.js` | CORS allowlist only | LOW: can be curl'd to send admin emails. |
| `/api/get-ip.js` | None, by design | Fine. |
| `/api/listing.js` | None, public SEO renderer | Fine. |
| `/api/sitemap-listings.js` | None, public | Fine. |
| `/api/geocode-all.js` | None | Admin tool, but unauth'd. LOW — Nominatim rate-limit is the constraint. |

**No backend endpoint that writes to Firestore is unauthenticated.** That's a good thing — the rotten parts are all client-side.

### 6. PII exposure

- `S.users` contains: name, email, phone, codiceFiscale, address, birthDate, birthPlace, idDocType, idDocNumber, IBAN, businessName, partitaIva, pecEmail, sdiCode, notes (`portal.html:12289-12306`). **Every signed-in user receives the entire collection.**
- `S.pfsClients` contains: name, email, phone, budget, areas, must-haves, additional notes, `portalProperties` (the swipe-deck), `portalActivity`, Stripe session ID, payment status (`api/stripe-webhook.js:205-224`). Loaded for everyone (`portal.html:3742`).
- `S.contracts` contains tenant signature PNGs (base-64 in `tenantSignature` / `landlordSignature` fields per Magic Sign), IPs, user agents, OTP-verified phones, IDs, complete personal data of both parties. Loaded for everyone (`portal.html:3647`).
- `S.payments` includes amounts, dates, statuses for every contract — financial intel on every BOOM tenant.
- `S.leads` (Homie pipeline) — line 3,719 — every prospect's contact info, intent, grade, message.

**A tenant who knows where to look has more visibility into BOOM's business than most internal employees would in a normal company.**

### 7. Session / auth lifecycle

- `checkSession()` (line 1922-1927) — 30-min idle timeout, fires `logout()`. Good.
- `auth.onAuthStateChanged` is the only auth gate. If a logged-in user's `users/{uid}` doc gets deleted server-side, the next page-load triggers "User profile not found" + redirect — but until then, the cached `S.profile` is still trusted.
- `logout()` (line 4589-4606) clears `boom_data_cache` and calls `auth.signOut()`. Good. BUT the localStorage cache had already been written WHILE the user was logged in, so on a shared machine, a previous user could open DevTools BEFORE clicking logout and dump it.
- `signOut` does NOT clear `localStorage.boomTenantSession`. If a tenant uses a magic link on a shared phone, the session marker stays — next person who visits `/portal.html` may pick up the prior tenant's identity (line 3499-3520 happily reads it).
- Refresh tokens: standard Firebase JS SDK behavior — 1h ID tokens, indefinite refresh tokens stored in IndexedDB. If laptop is stolen, the session is alive until the password is changed AND Firebase tokens are revoked via Cloud Function.

### 8. Audit logging

- `logActivity(action, category, details)` (line 4268-4284) writes to `activityLog`. Called from many places — but **NOT from every mutation.** Examples missing audit: `saveProperty`, `updateUser`, `deleteRecord` (no entry), most `payments` updates, most `contracts` updates. Only ~20% of mutations have a log entry.
- The agent layer (`api/agent/*` + `api/homie/*`) uses `logActivity()` from `_lib.js:216-225` reliably — every Homie/agent action is logged.
- Audit entries are mutable by anyone who can write the collection. With no Firestore rules, a malicious user can `db.collection('activityLog').doc(id).delete()` their own trail.
- No retention policy; the dashboard caps at 200 entries (`portal.html:3725`).

### 9. Cross-tenant data leakage — concrete attack scenarios

1. **Tenant A → all other tenants' contracts.** Sign in. Open DevTools. Type `S.contracts.filter(c => c.tenantId !== S.profile.id)`. Returns every other contract, including signed PNG, rent amount, deposit, tenant name, landlord name, contract type, dates.
2. **Tenant A → all leads (BOOM's sales pipeline).** Type `S.leads`. Returns every Immobiliare/Idealista/WhatsApp lead BOOM has received, with names, phones, intent, internal grades.
3. **Tenant A → all PFS clients.** Type `S.pfsClients`. Returns every paying €350 PFS client with their preferences, budget, must-haves, scored properties, payment data.
4. **Tenant A → all landlord IBANs + PIVA.** Type `S.users.filter(u => u.role === 'landlord')`. Returns IBAN, codice fiscale, partita IVA, PEC, tax regime for every landlord — i.e., enough to commit identity fraud.
5. **Tenant A → free admin account.** Open the addUser modal isn't visible. But: `db.collection('users').doc(auth.currentUser.uid).update({role: 'admin'})` self-promotes if rules allow updates (which without rules, they do). Refresh portal — now an admin.
6. **Tenant A → mass deletion.** `S.contracts.forEach(c => db.collection('contracts').doc(c.id).delete())`. Without rules, nothing stops it.

Whether any of these actually work depends on what's in the Firebase console rules pane today — which we cannot see from the repo. **My recommendation: assume #1-#3 work TODAY, since the team explicitly said rules need hardening.**

### 10. Other red flags

- **`prompt()` for admin password** (line 13,495) — see finding #8. The password ends up in the JS event loop / browser process memory and is briefly visible to any browser extension with `tabs` permission. Replace with a properly designed flow.
- **`eval`, `document.write`, `new Function`**: 0 occurrences. Good.
- **`innerHTML = "...<input>"` with user input**: ~309 template-literal interpolations across the file. `esc()` (line 18849) escapes only `& < > " '`. Used ~189 times. The remaining ~120 interpolations are mostly safe (numbers, dates, internal labels) but some are NOT — e.g., `${n.text}` (line 4248), `${n.message}` (4248), `${m.title}` (line 13884), `${d.name}` (line 10134, 13650). If any of these comes from a user-supplied field, stored XSS is possible. **Audit and route all user-strings through `esc()`.**
- **Firebase API key hardcoded** in `js/firebase-config.js:4` — this is by design (Firebase web config is public), but you MUST set HTTP referrer restrictions in the Google Cloud Console. Same key appears in `api/listing.js:21`, `api/sitemap-listings.js:7`, `api/geocode-all.js:12` as a fallback default — fine.
- **No service-account JSON committed.** Verified.
- **No `.env` committed.** `.gitignore` (97 bytes) presumably excludes them — verify.
- **`http://` vs `https://`** — all references are https; HSTS preload is set in `vercel.json:96`. Good.
- **CSP missing.** No `Content-Security-Policy` header in `vercel.json`. Worth adding — given the inline `<script>` and inline `onclick=` handlers in `portal.html`, you'll need `script-src 'self' 'unsafe-inline' <cdn-list>` initially.
- **The Magic Sign IP-collection field is hardcoded** to the string `'collected'` (per `MAGIC_SIGN_AUDIT.md` line 57) — not the actual IP. Forensic gap, not a security gap, but if you're relying on the audit trail to defend a signature in court, this hurts.

---

## 11. PRIORITIZED FIX-LIST

### TODAY (do not deploy a single line of code before this)

**Write `firestore.rules`** and `firebase.json`. Example tuned to BOOM's schema:

```js
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function uid() { return request.auth.uid; }
    function profile() { return get(/databases/$(database)/documents/users/$(uid())).data; }
    function role() { return profile().role; }
    function isAdmin() { return isSignedIn() && role() == 'admin'; }
    function isLandlord() { return isSignedIn() && role() == 'landlord'; }
    function isTenant() { return isSignedIn() && role() == 'tenant'; }
    function isAnon() { return isSignedIn() && request.auth.token.firebase.sign_in_provider == 'anonymous'; }

    // USERS: a user can read/update only their own doc; admins can do anything;
    // landlords may need to read tenants linked to their properties — defer
    // until you actually need cross-user reads.
    match /users/{userId} {
      allow read:   if isAdmin() || uid() == userId;
      allow create: if isAdmin();
      allow update: if isAdmin() || (uid() == userId
                      && !('role' in request.resource.data.diff(resource.data).affectedKeys()));
      allow delete: if isAdmin();
    }

    // PROPERTIES: admin full; landlord only their own; tenant only the one they rent.
    match /properties/{propId} {
      allow read:   if isAdmin()
                    || (isLandlord() && resource.data.ownerId == uid())
                    || (isTenant() && exists(/databases/$(database)/documents/contracts/$(propId+'_t_'+uid()))); // adjust to actual schema
      allow create, update, delete: if isAdmin();
    }

    // CONTRACTS: admin; landlord (if they own the property); tenant (if they are tenantId).
    match /contracts/{cId} {
      allow read:   if isAdmin()
                    || (isLandlord() && get(/databases/$(database)/documents/properties/$(resource.data.propertyId)).data.ownerId == uid())
                    || (isTenant() && resource.data.tenantId == uid())
                    || (isAnon() && (resource.data.tenantSignToken == request.resource.data.token
                                    || resource.data.landlordSignToken == request.resource.data.token));
      allow create, update, delete: if isAdmin();
      // Tenant can sign their own contract (write only signature fields)
      allow update: if isTenant() && resource.data.tenantId == uid()
                    && request.resource.data.diff(resource.data).affectedKeys()
                       .hasOnly(['tenantSignature','tenantSignedAt','tenantSignedIP','tenantSignedUA','tenantSignToken']);
    }

    // PAYMENTS: admin write; tenant read their own; landlord read for their properties.
    match /payments/{pId} {
      allow read:   if isAdmin()
                    || isPaymentForMe(resource.data.contractId);
      allow create, update, delete: if isAdmin();
    }
    function isPaymentForMe(cId) {
      let c = get(/databases/$(database)/documents/contracts/$(cId)).data;
      return (isTenant() && c.tenantId == uid())
          || (isLandlord() && get(/databases/$(database)/documents/properties/$(c.propertyId)).data.ownerId == uid());
    }

    // LEADS, PFS, ACTIVITY: admin only.
    match /leads/{x}          { allow read, write: if isAdmin(); }
    match /pfsClients/{x}     { allow read, write: if isAdmin(); }
    match /pfsProperties/{x}  { allow read, write: if isAdmin(); }
    match /pfsActivities/{x}  { allow read, write: if isAdmin(); }
    match /landlords/{x}      { allow read, write: if isAdmin(); }
    match /activityLog/{x}    { allow read: if isAdmin(); allow create: if isSignedIn(); allow update, delete: if false; }
    match /action_queue/{x}   { allow read, write: if isAdmin(); }
    match /signRequests/{x}   { allow read, write: if isAdmin(); }
    match /messageLog/{x}     { allow read: if isAdmin(); allow write: if false; }
    match /clients/{x}        { allow read, write: if isAdmin(); }
    match /invoices/{x}       { allow read: if isAdmin() || resource.data.recipientId == uid(); allow write: if isAdmin(); }
    match /rules/{x}          { allow read, write: if isAdmin(); }
    match /deadlines/{x}      { allow read, write: if isAdmin(); }
    match /tasks/{x}          { allow read, write: if isAdmin(); }
    match /viewingRequests/{x}{ allow read, write: if isAdmin(); allow create: if true; } // public form posts here

    // CONFIG: admin only — protects parse_docs bearer.
    match /config/{x}         { allow read, write: if isAdmin(); }

    // DOCUMENTS: per-user, plus shared docs.
    match /documents/{dId} {
      allow read:   if isAdmin() || resource.data.userId == uid()
                    || (resource.data.shared == true && isPropertyMine(resource.data.propertyId));
      allow create: if isSignedIn() && request.resource.data.userId == uid();
      allow update, delete: if isAdmin() || resource.data.userId == uid();
    }
    function isPropertyMine(pId) {
      return (isLandlord() && get(/databases/$(database)/documents/properties/$(pId)).data.ownerId == uid())
          || (isTenant() && exists(/databases/$(database)/documents/contracts/$(pId+'_t_'+uid())));
    }

    // MAINTENANCE: tenant create/read own, landlord read for their properties.
    match /maintenance/{mId} {
      allow read:   if isAdmin()
                    || (isTenant() && resource.data.userId == uid())
                    || (isLandlord() && isPropertyMine(resource.data.propertyId));
      allow create: if isSignedIn() && request.resource.data.userId == uid();
      allow update, delete: if isAdmin();
    }

    // MAGIC LINKS: anon may read its own token and flip used=true once.
    match /magicLinks/{tId} {
      allow read:   if isAdmin() || isAnon();
      allow create: if isAdmin();
      allow update: if isAnon()
                    && resource.data.used == false
                    && request.resource.data.used == true
                    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['used','usedAt']);
      allow delete: if isAdmin();
    }

    // NOTIFICATIONS: per-user.
    match /notifications/{nId} {
      allow read, update, delete: if isAdmin() || resource.data.userId == uid();
      allow create: if isSignedIn();
    }
  }
}
```

```json
// firebase.json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

Deploy: `firebase deploy --only firestore:rules` (requires `firebase login` + `firebase init firestore`).

### THIS WEEK

2. **Refactor `loadDataFresh()`** so each `.get()` query has the correct `where()` clause for the current role. This won't matter once rules are in place (rules reject the unfiltered query), but it makes the app actually work post-rules. Pattern:
   ```js
   const propQ = isAdmin() ? db.collection('properties')
               : isLandlord() ? db.collection('properties').where('ownerId','==',uid)
               : db.collection('properties').where('id','in', myContractPropIds);
   ```
3. **Add `if (!isAdmin()) return;` to every privileged client function** as defense-in-depth: `deleteRecord`, `saveUser`, `updateUser`, `saveProperty`, `saveContract`. The rules already enforce it, but the UI shouldn't even try.
4. **Lock the Firebase API key referrer** in Google Cloud Console (Credentials → API Key → Application restrictions → HTTP referrers → `*.boomrome.com/*`, `localhost`).
5. **Move the parse-docs bearer** out of the `config/parse_docs` Firestore doc. Either (a) restrict via the rules above + only fetch from `boom_doc_parser.html` which is admin-gated, OR (b) move to a serverless function that takes a Firebase ID token and proxies — eliminating the bearer from the browser entirely.
6. **Fix `prompt()` admin re-auth** at line 13,495. Switch to a secondary Firebase auth instance:
   ```js
   const secondary = firebase.initializeApp(firebaseConfig, 'secondary');
   await secondary.auth().createUserWithEmailAndPassword(email, tempPw);
   await secondary.delete();
   ```
   No admin sign-out, no prompt, no leak.

### THIS MONTH

7. **Replace anonymous Firestore reads with a Cloud Function** for Magic Sign (find by token, return the one contract). This eliminates the "anon can read contracts" rule loophole.
8. **Tag the localStorage cache with the UID** and refuse to load if `auth.currentUser.uid` differs. Or simply remove the cache — load times are not so painful that they justify the risk.
9. **Switch backend Firestore auth from admin-email/password to a service account JSON.** Affects: `reminder-cron.js`, `stripe-webhook.js`, `homie/_lib.js`, `agent/_lib.js`. Reduces blast radius if password leaks.
10. **Add CSP header** in `vercel.json` and audit every `innerHTML = \`...${userInput}...\`` for `esc()`.
11. **Wire `logActivity()` into every mutation** (currently only ~20% of writes log). Add to `deleteRecord`, all `saveX/updateX/deleteX` functions.

---

## OUT OF SCOPE (not audited)

- **Dynamic / runtime testing** — I read the code; I did not run it. The actual Firebase console rules state was inferred from the repo (no `firestore.rules`) and from the developer-side comments at lines 2,133 and 16,675. If rules HAVE been written manually in the console, several CRITICAL findings drop to MEDIUM.
- **The other 55 HTML pages** — `apartments.html`, `owner-dashboard.html`, `tenant.html`, `client-portal.html`, `cockpit-preview.html`, `admin.html`, etc. These pages share the same Firestore project; if rules are weak, they share the same risk. Some (owner-dashboard, tenant, client-portal) use `BoomPortal.requireAuth` (`js/boom-portal.js`) which is cleaner — auditing those is recommended next.
- **Firebase Authentication settings** — providers enabled, email-link enabled, anonymous enabled, sign-in domain allowlist, password policy. Inspect the Firebase Console.
- **Firebase Storage rules** — never opened. Documents are uploaded via `storage.ref(path).put()` (line 12,263) into `documents/{uid}/...`. If Storage rules are also open, ID scans and contracts are publicly readable by any signed-in user.
- **EmailJS template security** — the public key is in the client (acceptable per EmailJS design), but the templates themselves can be triggered from any browser. Check rate limits in the EmailJS dashboard.
- **Stripe webhook idempotency** — `stripe-webhook.js` writes to Firestore with `docId = session.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30)`. The dedup is best-effort. If two webhook deliveries land simultaneously, both might succeed before the 409 check. Low-impact (same data).
- **Vercel project access** — who has admin rights, env-var visibility, deployment hooks. Audit out-of-band.
- **PWA service worker (`sw.js`)** — not opened; could cache PII.
- **DDoS / abuse on unauth endpoints** (`get-ip`, `notify-viewing-created`, `listing`, `sitemap-listings`, `geocode-all`) — add Vercel rate-limiting or Cloudflare.

---

**Audit complete. Estimated effort to remediate top 3 (CRITICAL) findings: 1-2 focused engineering days. Estimated to remediate all 18: 5-7 days.**
