# BOOM · POP — home candidate

Work-in-progress homepage. Not wired into the site yet: nothing here is served,
`index.html` is untouched. This directory is the reproducible source of the
build, kept so the work survives the session container.

## What it is

Art Déco discipline (black lacquer, burnished brass, Helvetica Neue 300,
engraved type) at manifesto scale, with one thing the current home doesn't do:
**it opens up the PFS radar**. Until now Property Finding was a €350 line in a
price list. Here the machine is shown — the cron schedule it runs on, the real
scoring weights, the real threshold and the rules that throw work away.

Sections: the manifesto (headline + Solari board of homes free right now +
brass number band) → the catalogue → **the radar** → four moves → the full
price list → questions → close.

## Build

```
cd design/home-pop
python3 costruisci-pop.py artefatto   # photos inlined as base64 — preview only
python3 costruisci-pop.py sito        # photos from Firebase Storage URLs
```

Output: `boom-pop.html` / `boom-pop-sito.html` — a single self-contained file
(no bundler, matching the rest of the project). Assembled from `pd-css.html` +
`pd-body.html` + `solari-engine.html` + `pd-js.html`.

To ship it, the `sito` build is what goes to `index.html`.

## Data

`live-rows.json` is a snapshot of the `listings` collection (26 docs, 18
available/waitlist) taken from the public Firestore REST endpoint, plus
`address`, `avail`, `video`, `la`, `lo`. `foto-map.json` maps listing id →
Storage cover URL. Both are snapshots for offline building; the shipped page
should read the catalogue live, exactly as `apartments.html` does.

The base64 photo bank used by the `artefatto` mode is deliberately not
committed — it is 1.2 MB of duplicated image data and is regenerated from
Storage when a preview is needed.

## Numbers on the page, and where they come from

Everything in the radar section is read out of this repository, not invented:

| On the page | Source |
|---|---|
| scan every 15 min, market 2×/h, rebuild 04:00, brief 06:00 | `vercel.json` crons for `api/pfs/*` |
| budget 50 / bedrooms 30 / district 20 | `api/homie/_match.js` → `scoreMatch()` |
| threshold 60 | `api/homie/_match.js` → `DEFAULT_THRESHOLD` |
| over budget = hard veto | `scoreMatch()` → `reject: 'over_budget'` |
| agency listings stored, never pushed | `api/pfs/_ingest.js` advertiser policy |
| duplicates merged on the source URL | `api/pfs/_ingest.js` → `sha1(sourceUrl)` |

The three-listing cycle in the scoring panel is an **illustration** — the panel
says so in its own footer. The weights, threshold and veto driving it are the
production ones.

## Open items before this could ship

- Pigneto Palace's cover is a **.HEIC**: Chrome and Firefox will not render it.
  It needs re-uploading as JPEG. (Affects the live site today, not just this
  page.)
- `videoUrl` is empty on 17 of 18 listings, so no walk-through can be promised
  per home yet.
- The page reads a snapshot; wire it to the live Firestore read before shipping.
