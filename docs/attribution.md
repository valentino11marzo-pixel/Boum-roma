# BOOM · Attribution playbook — "know your source for every lead"

The #1 fix before spending a euro: **know where every lead comes from.** The site
now does most of this automatically. This doc is how to use it + the small manual
habits that close the loop.

---

## 1) What's already automatic (shipped in `js/boom-track.js`, site-wide)

Every visitor gets a **first-touch source** detected in this order:
1. `utm_source` (+medium/campaign) from the URL → e.g. `instagram/cpc/fall2025`
2. else the **referrer** → `google`, `instagram`, `reddit`, `linkedin`, `facebook`, `ref:<site>`
3. else `direct`

That source is then:
- **Stamped into every form** as hidden fields `boom_source` + `boom_landing` →
  so every **web3forms** lead email (PFS, Virtual Viewing, Deal Assistance,
  Contact, Owners, Concierge) arrives with the channel attached.
- **Added to the WhatsApp message** the lead pre-sends →
  `"Hi BOOM! I am interested — Apartments (ref: instagram)"`.
  You read the channel right inside the chat. Zero friction.
- **Sent to GA4** on every event as `source_channel`.

GA4 events firing: `whatsapp_click`, `begin_checkout` (Stripe), `cta_intent`,
`generate_lead` (form submit).

---

## 2) GA4 — mark these as **Key events** (conversions)
GA4 → Admin → Events → toggle **"Mark as key event"** on:
- `generate_lead`  ← form submitted
- `whatsapp_click` ← primary CTA
- `begin_checkout` ← Stripe (VV/DAS/PFS paid)

Then GA4 → Reports → Realtime to confirm they fire, and
Reports → Acquisition → Traffic acquisition to see leads by channel.
Add `source_channel` as a **custom dimension** (Admin → Custom definitions) to
slice conversions by our own label too.

Also: connect **Google Search Console** + **Google Business Profile** to GA4.

---

## 3) UTM convention (use ALWAYS on any link you post or pay for)
Format: `?utm_source=<where>&utm_medium=<type>&utm_campaign=<what>`

| source | medium | campaign (example) |
|---|---|---|
| `instagram` | `bio` / `story` / `reel` / `paid` | `sep25` |
| `google` | `cpc` | `search-rome-apts` |
| `reddit` | `post` / `comment` | `scam-guide` |
| `university` | `referral` | `luiss` / `jcu` / `aur` |
| `esn` | `referral` | `roma` |
| `whatsapp` | `broadcast` | `oct-students` |
| `email` | `newsletter` | `fall-intake` |

### Ready-to-paste tagged links
- Instagram bio →
  `https://www.boomrome.com/?utm_source=instagram&utm_medium=bio&utm_campaign=profile`
- Google Ads (set final URL) →
  `https://www.boomrome.com/apartments?utm_source=google&utm_medium=cpc&utm_campaign=search-rome-apts`
- LUISS housing page link →
  `https://www.boomrome.com/?utm_source=university&utm_medium=referral&utm_campaign=luiss`
- John Cabot →
  `https://www.boomrome.com/?utm_source=university&utm_medium=referral&utm_campaign=jcu`
- ESN Roma →
  `https://www.boomrome.com/?utm_source=esn&utm_medium=referral&utm_campaign=roma`
- Reddit scam-guide comment →
  `https://www.boomrome.com/blog-scam-bible?utm_source=reddit&utm_medium=comment&utm_campaign=scam-guide`

Tip: give each university its **own** campaign tag → you'll see exactly which
partnership produces leads (and renew/expand only those).

---

## 4) The one manual habit (closes the loop)
For WhatsApp leads where `ref:` is missing or `direct`, the operator asks **once**:
> "Quick one — how did you find us?"
…and logs the answer. Two minutes, and your data is complete.

### Lead log (a simple sheet — one row per lead)
`date | name | channel (from ref/ask) | page (boom_landing) | service | status | value`

Review weekly: **which channel returns the most placements per euro/hour.**
Then pour effort/budget only into the winners. That's the whole game.
