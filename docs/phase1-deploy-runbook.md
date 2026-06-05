# Phase 1 — Security hardening: deploy runbook

This branch (`claude/audit-boomrome-site-S81sz`) closes the CRITICAL findings
from `docs/portal-security-audit.md`. The code is in the repo but the
Firestore rules are **not yet live** on Firebase. Follow this order exactly —
the sequence matters.

## What's in Phase 1

| Commit | Change |
|---|---|
| `523f6d3` | `firestore.rules` + role-scoped `loadDataFresh()` + uid-tagged cache + role gates on delete/saveUser |
| `6832296` | User creation on a detached app (no admin sign-out / password prompt) |
| (this)   | Automated rules test suite (39 assertions, all green) + this runbook |

## ⚠️ The sequencing rule

`firestore.rules` and the `portal.html` query refactor must go live
**together**:

- Rules live **before** the new portal.html → landlord/tenant logins break
  (old code issues unconstrained queries the rules reject).
- New portal.html live **before** rules → the data is still wide open.

So: **merge the branch first** (Vercel ships the new portal.html), then
**deploy the rules**.

## Step 0 — Test the rules (already done, re-run any time)

```bash
cd tests/rules
./run-tests.sh
# → Result: 39 passed, 0 failed
```

## Step 1 — Merge the branch to main

Merge `claude/audit-boomrome-site-S81sz` → `main` (PR or direct).
Vercel auto-deploys the updated `portal.html`, `client-portal.html`, the
Homie bridge endpoints, and `js/boom-portal.js`. **Nothing about data
exposure changes yet** — portal.html now *also* sends scoped queries, but
without rules the DB is still readable. That's fine for a few minutes.

## Step 2 — Deploy the Firestore rules

```bash
npm install -g firebase-tools          # if not already
firebase login                         # use the Google account that owns
                                       # the boom-property-dashboards project
firebase use boom-property-dashboards
firebase deploy --only firestore:rules
```

The moment this completes, the database is locked: every user sees only
what their role allows.

## Step 3 — Smoke test on the live site (5 minutes)

1. **As admin (you):** open `portal.html`, confirm dashboard, properties,
   contracts, payments, leads, PFS pipeline all load as before.
2. **As a tenant** (use a real or test tenant login): confirm you see your
   property, your contract, your payments — and that "report payment" and
   "open maintenance request" still work.
3. **As a landlord** (if you have one): confirm you see only your own
   properties.
4. **DevTools check:** as the tenant, open the console and type
   `JSON.stringify(S.leads)` → should be `[]`. Type `S.users.length` → should
   be `1` (just themselves). Before Phase 1 this returned the whole database.

## Step 4 — Lock the Firebase API key (manual, 2 min)

In Google Cloud Console → APIs & Services → Credentials → the Browser key:
- Application restrictions → **HTTP referrers**
- Add: `*.boomrome.com/*`, `boomrome.com/*`, `localhost`

This stops anyone who scrapes the (public-by-design) API key from burning
your Firebase quota.

## Rollback

If a legitimate user is wrongly blocked after Step 2:

```bash
# Revert to permissive rules TEMPORARILY while we diagnose
# (paste the previous rules in the Firebase console → Firestore → Rules,
#  or redeploy a known-good firestore.rules)
firebase deploy --only firestore:rules
```

Then capture the exact denied operation (the browser console logs the rule
line number) and we fix the rule + add a test for it.

## Still open (later phases — not blocking deploy)

- ~~Magic-Sign anonymous contract read → server endpoint (audit #6)~~ ✅ shipped
  as `/api/magic-sign/lookup` + `/api/magic-sign/submit`. The browser no
  longer touches Firestore as anonymous during contract signing.
- CSP header in `vercel.json` + `esc()` sweep (audit #12)
- Backend Firestore auth → service account JSON (audit #13)
- Wire `logActivity()` into every mutation (audit #11)
