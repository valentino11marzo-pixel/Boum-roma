# Magic Sign — Redesign Master Plan

_Audit + architecture for rebuilding the BOOM signing experience: premium, fast,
brand-true, robust — for both the standard contract flow and the tailored-PDF
("drop a custom contract") flow, for clients AND admins._

---

## 1. Where we are today (from the deep audit)

**Two signer flows, both served by the 2.24 MB `portal.html`:**
- **Standard contract** — link `portal.html?sign={token}`. A real 5-step flow:
  review → identity (Codice Fiscale + checksum, DOB/POB/address/doc) → phone OTP
  (Firebase Phone Auth + invisible reCAPTCHA, mandatory for FES Art. 21 CAD) →
  signature pad + consent → success + optional tenant account.
- **Tailored PDF** ("Magic Sign Custom") — admin uploads a PDF, drag-drops
  signature/date/initials field chips per role, saves a `signRequests` doc; signer
  link `portal.html?csign={reqId}&role={role}&t={token}` renders the PDF with field
  overlays, signer draws, `pdf-lib` embeds the PNG at the field ratios, uploads
  `signRequests/{id}/signed.pdf`.

**What hurts (audit findings):**
1. **Weight/speed** — a signer downloads the entire admin app (2.24 MB) just to sign.
2. **5 different token generators** scattered across the file; inconsistent entropy.
3. **No rate-limiting** on token regeneration or reminder resends.
4. **Signed PDF generated client-side** (jsPDF + html2canvas), regenerated per signer,
   fragile on mobile/slow networks; corrupt state if upload fails mid-way.
5. **Tailored-PDF coordinate drift** — fields stored as page-ratios; admin renders at
   1.4×, signer may render differently → signature lands off-target.
6. **Magic link issued client-side** (Firestore-only), not server-authoritative.
7. **PII in plaintext** on the contract doc; signature image not bound to consent hash.
8. **Phone-verify off-by-one** — `phoneVerified=true` set before verification in one path.
9. **No signature status in the contracts list**; no audit trail of sign events.
10. **Custom-PDF signer identity** gated by token only (no email/OTP check).

---

## 2. Design principles (the bar)

> *Easy ≠ simple. Make it feel effortless while doing sophisticated work underneath.*

- **Brand-true** — the BOOM identity: near-black canvas, restrained gold (`#E9C766`),
  Helvetica Neue display, Inter UI, refined motion. Consistent with the new login.
- **Fast** — a signer should load **~30 KB**, not 2.24 MB. Vector/system fonts, deferred
  SDKs, lazy PDF.js only when a tailored PDF is opened.
- **Simple & calm** — one clear action per screen, generous space, reassuring copy,
  no jargon. Trust signals (encryption, audit) shown tastefully, not shouting.
- **Robust** — the fragile post-signature machinery (signed PDF, passes, emails, magic
  link) moves **server-side**, atomic and idempotent.
- **Accessible & mobile-first** — 16px inputs (no iOS zoom), focus-visible, reduced
  motion, real labels, 375px-first layout, touch-tuned signature pad.
- **Admin delight** — status at a glance, one-tap resend, a clean tailored-PDF editor,
  an audit trail, and a single unified token system.

---

## 3. Target architecture

**New standalone signer surface — `/sign`** (`sign.html`), routed by params:
- `?token=…` (or legacy `?sign=…`) → **standard contract** flow.
- `?req=…&role=…&t=…` (or legacy `?csign=…`) → **tailored-PDF** flow.

It consumes server endpoints and carries none of the admin weight:

| Endpoint | Status | Purpose |
|---|---|---|
| `POST /api/sign/get` | ✅ built | Resolve standard contract by token (read mediator) |
| `POST /api/sign/submit` | ✅ built | Record signature + identity + completion automation |
| `POST /api/sign/finalize` | ▢ to build | Post-completion, server-side: signed PDF (pdf-lib), passes, emails, **server-issued magic link** |
| `POST /api/sign/custom/get` | ▢ to build | Resolve a `signRequests` doc by `{req, role, token}`; return fields + original PDF URL |
| `POST /api/sign/custom/submit` | ▢ to build | Store the role's signature; on completion embed all signatures into the PDF server-side |

**Why server-side finalize/embed:** removes ~600 KB of client PDF libs from the signer,
makes the signed artifact reliable and consistent, fixes coordinate drift (the server
renders once with known page dimensions), and lets us bind the signature to the consent
hash + audit metadata.

**Admin** keeps creating/sending from `portal.html`, but:
- link generation points to `/sign?...` (new fast page);
- a single `genSecureToken()` replaces the 5 variants;
- the contracts list shows a signature-status chip + "remind" with a 24 h cooldown;
- a `signatureEvents[]` audit trail records every send/sign/download.

---

## 4. The signer experience (redesigned)

**Standard flow** — same 5 stages, elevated:
1. **Review** — a calm contract summary card (property, rent, term, deposit, parties,
   type), with a "view full PDF" affordance. One primary action: *Continue*.
2. **Identity** — inline-validated fields, CF auto-uppercased with live checksum + a
   format hint; everything pre-filled from the signer record where known; errors shown
   inline, all at once, in plain language.
3. **Phone** — OTP with a real "code sent to …" state, paste-friendly 6-box input,
   resend timer, graceful reCAPTCHA loading.
4. **Sign** — a beautiful signature pad: smoothed strokes, **undo** + clear, a baseline
   guide, min-size enforcement; consent text legible (not 11px grey), the legal
   reference highlighted; an explicit "encrypted · IP + timestamp recorded" trust line.
5. **Done** — confirmation with status, then (tenant) a one-field account activation
   with show/hide password + editable email, and a clear "what happens next" timeline.

**Tailored-PDF flow** — the signer sees the actual document, page by page, with their
fields highlighted and a "next field" guide; they draw once and apply to all their
fields; server embeds and returns the signed PDF. Same brand shell, same trust line.

---

## 5. Rollout (safe, staged — nothing breaks production)

- **Phase A (this work, in PR #28, not deployed):** build `sign.html` (standard flow),
  wire to the existing `get`/`submit`; add `/api/sign/finalize`; CSP + `/sign` rewrite.
- **Phase B:** tailored-PDF support in `sign.html` + `custom/get` + `custom/submit`
  (server-side embed) — fixes coordinate drift.
- **Phase C:** point admin link-generation at `/sign`; unify tokens; contracts-list
  status chip; resend cooldown; `signatureEvents[]` audit trail.
- **Phase D:** lock `contracts/landlords/magicLinks` rules (now safe once `finalize`
  issues the magic link server-side) — see `SECURITY_RULES_DEPLOY.md`.

Each phase is independently testable in staging. The legacy `portal.html?sign=`/`?csign=`
paths keep working as a fallback until `/sign` is verified.

---

## 6. Definition of done
A landlord or tenant opens a link, the page paints in well under a second with the BOOM
identity, the flow feels effortless on a phone, the signature is captured beautifully and
recorded with a tamper-evident audit trail, and the moment both parties sign, the server
produces the signed PDF, the Wallet passes, the welcome emails and the one-tap portal
link — reliably, every time. The admin sees exactly where every signature stands and can
nudge it forward in one tap.
