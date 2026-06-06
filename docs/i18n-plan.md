# i18n (IT / EN) — plan

## Why this is a plan, not code (yet)
The site is bilingual **by accident**: ~63 pages `lang="en"`, ~6 `lang="it"`
(e.g. `owners.html`, `deals.html`, `form-landlord.html` are Italian), no
language switcher, and hreflang is effectively absent. A switcher with no
translated target pages would be non-functional theatre, and the marketing
pages are mid-redesign on other branches — so shipping i18n now would collide
and/or be hollow. This documents the path so it can be executed **after the
redesign lands**.

## Target model
- **Tenants → EN** (expats/students), **Landlords → IT** (Italian owners). This
  is already the implicit split; make it explicit and correct.
- One canonical URL per language, paired with `hreflang`:
  - EN at the clean path (`/apartments-in/trastevere`)
  - IT at `/it/...` (or `?lang=it`) — decide one scheme and keep it.

## Steps (in order)
1. **Correctness pass** (safe, no new content): ensure each page's `<html lang>`
   matches its actual content language. Several pages are mislabelled.
2. **hreflang infrastructure**: for every page that will have both languages,
   emit reciprocal `<link rel="alternate" hreflang="it|en|x-default">` tags.
   Until a page has a real translation, it should self-reference only.
3. **Switcher component**: a small shared `js/boom-i18n.js` + a header control
   that swaps between the paired URLs (persist choice in `localStorage`,
   default by `navigator.language`). Build once the design system from the
   marketing redesign (`css/boom-svc.css`) is on main, so it matches.
4. **Content**: translate the high-traffic set first — homepage, `apartments`,
   the 11 `apartments-in/*`, top blog posts (EN canonical) + landlord funnel
   (IT canonical). This is the real cost; everything above is cheap.
5. **Sitemap**: list both language URLs; keep the dynamic listings sitemap
   language-aware.

## Sequencing
Do **after** the marketing redesign (`great-mccarthy`) and `epic-keller`
clean-URLs land — both rewrite the exact pages i18n touches. Starting now would
guarantee conflicts and rework.

## Quick win available immediately
Step 1 (the `lang` correctness pass) is the only part safe to do today, and only
on uncontested pages — most of which are already correctly tagged. Not worth a
standalone change; fold it into the redesign PRs that already touch those files.
