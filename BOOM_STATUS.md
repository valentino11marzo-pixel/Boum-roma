## 22/04/2026 — PFS Checkout end-to-end

Complete migration from static Stripe Payment Link + Web3Forms to a fully 
integrated payment + onboarding flow.

### What was built
- api/create-checkout.js — dynamic Stripe Checkout Session with form metadata
- api/stripe-webhook.js — signature-verified webhook: writes pfsClients/{id} 
  to Firestore via REST API (email/password auth), sends 2 branded emails 
  via EmailJS REST API
- property-finding.html — form submit now calls /api/create-checkout and 
  redirects to dynamic session.url (metadata survives payment)
- EmailJS template boom_notification used as universal template (saves 
  against free plan 2-template limit)

### New Firestore fields on pfsClients/{id}
service, status (paid), stage (payment_confirmed), all intake form fields, 
stripe_session_id, amount_paid, currency, portal_token (for future passwordless 
dashboard access), paid_at, created_at.

### Dependencies
Added: stripe@22.0.2
Removed: nodemailer (initially added, then replaced by EmailJS)

### Env vars required on Vercel
STRIPE_SECRET_KEY (live), STRIPE_WEBHOOK_SECRET, EMAILJS_PRIVATE_KEY.
Existing: FIREBASE_API_KEY, FIREBASE_ADMIN_EMAIL, FIREBASE_ADMIN_PASS, 
FIREBASE_PROJECT_ID.

### Stripe config
Live webhook endpoint: https://www.boomrome.com/api/stripe-webhook
Events: checkout.session.completed

### Side discovery
Web3Forms access_key audit revealed 3 different keys in the repo. Two were 
wrong (8d4c9378-* and f2a0e600-*), sending leads to unrelated accounts. 
14 forms fixed in total: PFS, DAS, VV, contact, concierge, owners, 
pre-arrival, and 7 blog forms — all now routing to valentino@boom-rome.com.

### Still open / next
- Portal PFS v1 view (Session 2): passwordless access via ?pfs=TOKEN, 
  progress line with 8 stages, intake summary, shortlist manual-admin, 
  next-step block
- Admin portal tab "PFS Clients" to manage stage, shortlist, next_step
- property-finding.html page redesign (deferred, Session 3+)
- Rotate Stripe webhook secret (secret was exposed in session chat)

### Test validation
Signed webhook test with WHSEC confirmed STATUS 200 + Firestore write + 
both EmailJS deliveries. Real payment flow not yet tested in production 
(avoided to save fees). Recommended: first real PFS lead will be the 
production validation.
