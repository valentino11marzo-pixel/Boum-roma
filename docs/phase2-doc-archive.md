# Phase 2 — Digital Document Archive + Commercialista Mode

Branch: `claude/phase2-doc-archive`. **Depends on Phase 1 (PR #30) being
merged + Firestore rules deployed first** — these changes extend the same
`firestore.rules` file and add `storage.rules`.

## What it delivers

- **Secure file storage** — `storage.rules` (Storage had NO rules before;
  every contract scan / ID / payment proof was world-readable). Owner +
  admin read/write their folders, landlords read files on their properties,
  25 MB cap, pdf|image|zip only.
- **TaxPack engine** (`js/taxpack-engine.js`, pure + 36 unit tests) — encodes
  the Italian rental-tax document set per fiscal year, tuned to regime
  (cedolare 21/10 vs IRPEF) and contract type (transitorio / studenti /
  short-let / foreign tenant). Produces the per-year checklist, income +
  cedolare totals, the cedolare-vs-ordinario comparison, and the zip
  manifest.
- **Commercialista Mode** (portal.html nav → 🧮) — per property + fiscal
  year: totals cards, a live completeness bar, the requirement checklist
  (green PRESENTE / red MANCANTE), a "cosa manca" list, the cedolare
  calculator, and one-click **share-to-accountant**.
- **Share links** — `POST /api/documents/share` mints a tokenized,
  expiring, audit-logged link; `share.html` (public, no login) renders the
  bundle grouped into the 9 TaxPack folders with download-all + watermark;
  `POST /api/share/lookup` resolves it under admin creds and logs each view.
- **AI OCR** — `POST /api/documents/ocr` classifies an uploaded file and
  extracts entities (dates, amounts, CF, IBAN, P.IVA, fiscal year) via
  Claude, server-side. The upload modal auto-fills category + year and
  stores `ocrText` for future full-text / Q&A search.

## Deploy steps (after Phase 1 is live)

```
# 1. Merge this branch to main → Vercel ships portal.html + share.html + APIs

# 2. Deploy the extended rules (firestore now has documentShares/taxPacks,
#    and storage rules are new):
firebase deploy --only firestore:rules,storage

# 3. Confirm ANTHROPIC_API_KEY is set in Vercel (already used by parse-docs)
#    — required by /api/documents/ocr.
```

## Tests

```
node tests/taxpack/test.mjs          # 36/36 — fiscal engine
cd tests/rules && ./run-tests.sh     # 49/49 — incl. documentShares + taxPacks
```

## Smoke test on live

1. Portal → 🧮 Commercialista → pick a property + year → checklist renders,
   completeness bar reflects uploaded docs.
2. Upload a PDF in Documenti → "🤖 Analizza con AI" → category + year
   auto-fill, entities chips show.
3. Commercialista → "Genera link commercialista" → open the `/share.html`
   link in an incognito window (no login) → documents grouped + downloadable.
4. Re-open the share → a second `views[]` entry is appended (audit works).

## Follow-ups (not in this branch)

- Server-side zip generation for "Scarica tutti" as a single archive
  (today it opens each file). Needs a Vercel function with a zip lib.
- `Riepilogo_fiscale_<year>.pdf` auto-generated summary sheet (jsPDF) with
  the Quadro RB figures.
- Full-text search UI over `ocrText`.
- AI Q&A box ("quali contratti scadono nel Q1 2026?") over the archive.
- ISTAT adjustment letter generator (compliance-rules.js already in repo).
- Tenant-facing "download my year of receipts" for their own return.
