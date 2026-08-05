# BOOM · LA HOME — the live homepage, re-executed Déco Solari

This candidate does NOT reinvent the homepage. It IS boomrome.com's current
index.html — same twelve sections in the same order, same goals, same copy
verbatim, same fonts (Inter body + Helvetica Neue display), same tokens
(#FFD700 gold on #030303, the exact text/border alphas) — re-executed with
the Art Déco Solari finish:

- **DAYS on a real split-flap board** inside the hero headline ("GET YOUR
  ROME APARTMENT IN DAYS, NOT WEEKS."), with an occasional flutter
- corner-ticked hairline gold frames (hero, device, PF instrument, callouts)
- the hero stats and PF/About numbers **count up** on first sight
- "Move in this week" generated from the live catalogue (3 homes, 3 zones,
  photo-verified), rents composed on small Solari boards
- the pinned **How BOOM Works** story rebuilt at full quality: same four
  steps, same four app scenes (listing grid with LIVE 360° from real
  catalogue photos, application form that types itself, contract + Stripe
  €2.770, keys with the move-in stamp), scroll-driven exactly like the live
  page's howPinWrap
- Property Finding keeps its exact promise/checklist/stats; a radar sweep
  turns while the six checkmarks engrave in
- all emoji replaced with 1.3px-stroke gold line icons; everything else
  (trust bar, More Ways We Help, Concierge grid, Organisations, Why We
  Exist, About with Valentino's quote, Ready for Rome?, footer) verbatim

## Build

    cd design/home-live-deco
    python3 costruisci-home.py artefatto   # Inter + photos inline (preview)
    python3 costruisci-home.py sito        # Google Fonts + Storage URLs (80 KB)

Single self-contained file assembled from lh-css + lh-body + solari-engine +
lh-js. The `sito` build is the one that would replace index.html — ideally
switched to a live Firestore read for the "Move in this week" row.

Behaviour verified with Playwright: DAYS composes, pin steps 0→3 across the
wrap, flap rents settle on the true prices, counters fire once, mobile menu
and reduced-motion complete states, no horizontal overflow at 1440/390.
