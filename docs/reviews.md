# BOOM · Reviews flywheel (Google Business Profile)

**Why this is the highest-leverage free channel after universities:** Google
reviews are the single biggest trust signal for a rental agency. They feed three
engines at once — (1) **local SEO** (the "map pack" ranking for "apartments Rome
expats", "mid-term rental Rome"), (2) **AI search** (LLMs cite businesses with
strong, recent review counts), and (3) **conversion** (a tenant about to wire a
deposit to a stranger in a foreign country checks reviews *first*). Every happy
move-in is a review we didn't ask for — that's leaked trust. This doc makes
asking systematic.

**Goal:** a steady drip of **new, recent, keyword-rich** reviews. Recency and
velocity matter more than raw count — 20 reviews in the last 90 days beats 100
reviews from 2 years ago. Target: **1–3 new reviews/week** during season.

---

## 0. One-time setup (founder, ~10 min) — DO THIS FIRST

The `share.google/...` link in our schema is the *public profile* link, not the
fastest review link. Google offers a **one-tap "write a review" link** that opens
the review box with stars ready. Get it once, reuse it forever:

1. Go to your **Google Business Profile** dashboard → business.google.com
   (or search your business name on Google while signed in as the owner).
2. On the profile, click **"Ask for reviews"** / **"Get more reviews"**.
3. Google gives you a short link shaped like **`https://g.page/r/XXXXXXXX/review`**.
   Copy it. That is the gold link — it lands the customer *directly* on the
   star-rating box.
4. Paste it into:
   - this file (replace the placeholder below),
   - `js/boom-track.js` (optional review-CTA helper, see §4),
   - the WhatsApp/email templates below.

> **Current review link (replace once you have the `g.page/r/.../review` link):**
> `https://share.google/xikmVxQCRuKOdWcND`
> _(works as a fallback — opens the profile; the customer taps "Write a review")_

While you're in the dashboard, also confirm: business category = **"Real estate
rental agency"**, service area = **Rome**, hours, phone (`+39 331 325 1961`),
website = `https://www.boomrome.com`, and 8–10 photos (apartments, the team, the
BOOM pass). A complete profile ranks higher and converts the click.

---

## 1. The ask — timing is everything

Ask when the customer is at **peak happiness**, not at random:

| Moment | Channel | Why |
|---|---|---|
| **Move-in day +48h** | WhatsApp | Keys in hand, relief & gratitude peak. **Best moment.** |
| Virtual viewing → booked | WhatsApp/email | They just avoided a scam-risk apartment hunt. |
| Deal/contract closed (DAS) | Email | Tangible outcome (signed, legal, deposit-protected). |
| Pass delivered (Apple Wallet) | In-flow | Delight moment — natural "this was smooth" reaction. |

**Rule of thumb:** only ask people you're confident are happy. Pre-qualify with a
soft yes/no ("How was everything?") *before* sending the link. Never blast.

---

## 2. WhatsApp templates (primary — highest response rate)

Replace `REVIEW_LINK` with your `g.page/r/.../review` link (see §0).

### EN — post move-in (+48h)
```
Hi {{name}} 👋 Welcome to Rome — hope the apartment feels like home already!
If everything's been smooth, would you mind leaving us a quick Google review?
It genuinely helps other internationals trust us instead of risking a scam.
Takes 20 seconds 🙏 → REVIEW_LINK
Thank you for choosing BOOM 🖤
```

### IT — post move-in (+48h)
```
Ciao {{name}} 👋 Benvenutə a Roma — spero che l'appartamento sia già casa!
Se è andato tutto bene, ci lasceresti una breve recensione su Google?
Aiuta davvero altri a fidarsi di noi invece di rischiare una truffa.
Bastano 20 secondi 🙏 → REVIEW_LINK
Grazie per aver scelto BOOM 🖤
```

### EN — after a smooth virtual viewing / deal
```
So glad we found the right place for you, {{name}}! 🎉
A 30-second Google review would mean the world and helps the next
international tenant find us → REVIEW_LINK 🙏🖤
```

---

## 3. Email templates (secondary — for DAS / contract clients)

**Subject (EN):** One small favour, {{name}}? 🙏
**Subject (IT):** Un piccolo favore, {{name}}? 🙏

### EN body
```
Hi {{name}},

It was a pleasure getting you settled in Rome. If your experience with BOOM
was a good one, would you leave us a quick Google review? Internationals
searching for a safe place to rent rely on these reviews to know who to trust —
your words help someone avoid the scams that are everywhere out here.

👉 REVIEW_LINK   (takes under a minute)

Grazie mille,
The BOOM team
```

### IT body
```
Ciao {{name}},

È stato un piacere aiutarti a sistemarti a Roma. Se la tua esperienza con BOOM
è stata positiva, ci lasceresti una breve recensione su Google? Chi cerca un
posto sicuro dove vivere si affida a queste recensioni per capire di chi fidarsi —
le tue parole aiutano qualcuno a evitare le truffe.

👉 REVIEW_LINK   (meno di un minuto)

Grazie mille,
Il team BOOM
```

---

## 4. Make it effortless (the funnel mechanics)

- **One link, everywhere.** The `g.page/r/.../review` link in: WhatsApp signature,
  email signature, the move-in pass delivery page, the thank-you page.
- **QR code.** Generate a QR for the review link (any free generator) → print it
  on a small card left in each apartment ("Enjoyed your stay? Scan to review 🖤").
  Physical nudge at peak happiness = highest conversion.
- **Reply to every review** within 24h — Google rewards owner engagement and it
  shows prospects you're responsive. Thank 5★; for anything lower, respond calmly,
  publicly, with a fix. Never argue.
- **Seed keywords naturally.** When you reply, use the phrases you want to rank
  for ("Thanks for trusting BOOM for your mid-term rental in Trastevere!"). You
  can't script the customer, but your replies are indexed too.

### Optional: review CTA on-site
Once you have the `g.page/r/.../review` link, we can add a tasteful "Leave a
review" CTA on `thank-you.html` and the pass-delivery page (gold, on-brand),
fired only for completed move-ins. Say the word and I'll wire it with a
`review_click` GA4 event so we can measure the flywheel.

---

## 5. Measure it

- Track review count + average rating weekly (just glance at the dashboard).
- Our schema already exposes `AggregateRating` (currently 4.9 / 47) — **keep the
  `reviewCount` in JSON-LD in sync with reality** as it grows (it's in `index.html`
  and the service pages). Inflated counts that don't match the visible Google
  profile can get rich-result eligibility revoked.
- When we cross ~50 real reviews, revisit the number in schema and consider
  surfacing live testimonials on the homepage and service pages.

---

## 6. What's already wired

- ✅ GBP profile link added to `Organization.sameAs` JSON-LD on **all 40 root
  pages + 11 neighborhood pages** (`apartments-in/*`) — search engines and LLMs
  now connect boomrome.com ↔ the Google profile.
- ✅ `AggregateRating` present in schema (4.9 / 47) on homepage + service pages.
- ⏳ **Founder TODO:** fetch the `g.page/r/.../review` one-tap link (§0) and paste
  it back so we replace the fallback and (optionally) add the on-site CTA.
