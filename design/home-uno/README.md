# BOOM · UNO — home candidate

Successor to `design/home-pop/`. Not wired into the site: nothing here is
served, `index.html` is untouched. This directory is the reproducible source,
kept so the work survives the session container.

## The thesis: one idea per screen

POP put three objects in the hero and eight blocks in the radar section. UNO is
built around the visitor's attention span instead:

1. **The arrival** — one sentence ("Renting in Rome is brutal. We made it a
   machine."), two CTAs, nothing else. The board peeks under the fold.
2. **The wall** — the Solari departures board at monument scale, full-bleed:
   the homes free right now, from the live catalogue, each row a link.
3. **The homes** — a mosaic: one cover card (hand-curated `COPERTINE` list in
   the builder), five compact ones. Zone-diverse, photo-verified.
4. **The Radar** — the PFS *performed*: a sticky instrument stays on stage
   while scrolling plays four beats — schedule (96 scans/day tape), scoring
   (50/30/20 bars), the veto (red stamp), the threshold (60, and the
   found/pushed/never-sent bar). One truth per beat.
5. The path, the price list, five questions, the closing plate.

Plus: a top progress thread, a fixed chapter rail (≥1320px), and the ⌘K
palette (homes + services + chapters; a number searches by price ceiling).

## Build

```
cd design/home-uno
python3 costruisci-uno.py artefatto   # photos inlined base64 — preview only
python3 costruisci-uno.py sito        # photos from Firebase Storage (92 KB)
```

Single self-contained output (`boom-uno.html` / `boom-uno-sito.html`),
assembled from `un-css.html` + `un-body.html` + `solari-engine.html` +
`un-js.html`. JSON-LD (RealEstateAgent + ItemList) is generated from the
catalogue. To ship: the `sito` build replaces `index.html`, ideally switched
to a live Firestore read like `apartments.html`.

## Truth table — every number on the page has a source

| Claim on the page | Source |
|---|---|
| 96 inbox scans/day, market 2×/h, rebuild 04:00, brief 06:00 | `vercel.json` crons for `api/pfs/*` |
| Budget 50 · bedrooms 30 · district 20, threshold 60 | `api/homie/_match.js` |
| Up to +20% over budget scores half; past that, veto | `scoreMatch()` soft window / `reject:'over_budget'` |
| Agency relistings stored, never pushed | `api/pfs/_ingest.js` advertiser policy |
| "The same listing arriving twice is sent once" | `sha1(sourceUrl)` dedupe on ingest |
| Service prices €350 / €249 / €89 / €99+20% / from €15 | service pages + `api/service-checkout.js` |
| Board rows, counts, districts, prices | `listings` snapshot (`live-rows.json`) |

The scoring panel's three-listing cycle is an **illustrated week** and says so
in its own footer; the weights driving it are the production ones.

This page was reviewed by an adversarial multi-agent pass (5 dimensions,
every finding re-verified); the honesty fixes that came out of it are already
in: the veto copy now states the real +20% soft window, the repost claim was
replaced with what the dedupe actually does, Concierge shows its true €15
floor, Deposit Recovery links to its own page, and the price list openly
names the one price it does not print (the per-deal rental fee).

## Open items before this could ship

- Pigneto Palace's cover is a **.HEIC** — invisible in Chrome/Firefox (affects
  the live site today, not just this page). Re-upload as JPEG.
- `videoUrl` is empty on 17 of 18 listings — no per-home walk-through promise.
- Wire the page to the live Firestore read; the snapshot is for offline builds.
