# APARTMENTS.HTML — Renewal Proposal

**Author**: Claude Code for BOOM Rome
**Date**: April 2026
**Scope**: Complete audit + strategic redesign of the apartments listing page

---

## 1. AUDIT — Current State Problems

### 1.1 Design Inconsistencies

| Problem | Where | Impact |
|---------|-------|--------|
| Gold color is `#FFD700` on apartments but `#D4AF37` in portal/proppass | CSS `:root` | Brand fragmentation. Portal uses the correct muted gold, apartments uses bright yellow-gold |
| Font is Inter, not Helvetica Neue 300 | CSS `font-family` | Portal/proppass use Helvetica Neue 300 as primary. Apartments uses Inter. Different personality |
| Logo SVG is 80x80 with heavy glow filter | Nav `.logo-svg` | Other pages use smaller, cleaner logo. This feels dated |
| Background is `#000` not `#08080A` | CSS `--pure-black` | Subtle but different from the brand standard `#08080A` |

### 1.2 UX Flow Problems

| Problem | Impact |
|---------|--------|
| **No inline inquiry/contact on listing cards.** User must click through to detail page, then find a CTA. Two clicks minimum to express interest | Lost leads. High-intent users bounce |
| **Filter system is binary** (All / Available / Coming Soon). No search by zone, price range, rooms, or move-in date | Users can't find what they need. Especially bad with 15+ listings |
| **"Not finding what you need?" section links to external Firebase URL** (`boom-property-dashboards.web.app/onboarding.html`) instead of inline intake form | Domain switch kills trust. User leaves boomrome.com |
| **No price range context.** Listings show price but no "from €X" or comparison to market | Users can't judge if BOOM is expensive or affordable |
| **Listing cards don't show availability date** prominently. It's a small text at bottom | Critical info for expats — they need to know WHEN they can move in |
| **Video showcase section** takes significant vertical space but may not convert. YouTube embed is heavy | 2MB+ iframe load for a feature that may get skipped |

### 1.3 Performance Issues

| Problem | Metric |
|---------|--------|
| All CSS is inline (~15KB minified). No caching between pages | Every page load re-downloads identical nav/footer styles |
| Images loaded via `background-image` CSS — no lazy loading, no srcset, no WebP | LCP likely 3-5s on mobile. No responsive images |
| Firebase SDK loaded synchronously in body (firestore-compat.js ~150KB) | Render-blocking |
| Google Fonts (Inter) preconnected but not display:swap | FOIT possible |
| No image optimization pipeline. Listings use raw Firestore Storage URLs | Could be 1-5MB per image |
| Video showcase loads YouTube iframe even if user never scrolls to it | Wasted bandwidth. ~500KB overhead |

### 1.4 SEO Weaknesses

| Problem | Fix Priority |
|---------|-------------|
| **No sitemap.xml** — Google can't efficiently discover pages | Critical |
| **No robots.txt** — No crawl guidance | Critical |
| **No canonical tag** — Duplicate content risk if accessed via www vs non-www, or with query params | High |
| **No JSON-LD schema** — Listings not eligible for rich results (RealEstateAgent, ApartmentComplex, Product) | High |
| **h1 is generic**: "Apartments in Rome" — No keyword differentiation | High |
| **No h2/h3 structure** in listings section — all flat, no semantic hierarchy | Medium |
| **Page title** is decent but could include "for Expats" or "Furnished" for long-tail | Medium |
| **No internal linking strategy** — listings don't link back to blog articles about their neighborhoods | Medium |
| **Static apartment pages** (`apartment_navona.html` etc.) exist but aren't linked. Wasted SEO assets | Medium |
| **No alt text on listing images** (CSS background-image, not `<img>`) | High — images invisible to Google |

### 1.5 Accessibility Gaps

| Problem |
|---------|
| Listing cards are `<a>` tags but contain complex interactive children — keyboard navigation unclear |
| Filter buttons don't have `aria-pressed` state |
| Mobile hamburger has no `aria-label` or `aria-expanded` |
| Gold-on-black contrast ratio may be below 4.5:1 for small text |
| No skip-to-content link |

### 1.6 Mobile Responsiveness

| Problem |
|---------|
| Single breakpoint at 768px — no tablet-specific layout (768-1024px renders awkwardly) |
| Card min-width 340px means 1 column on most phones, but on iPad landscape shows 2 columns too wide |
| Nav hamburger touch target is only the 3 spans, no padding wrapper |
| Footer 4-column grid doesn't have intermediate 2-column step |

### 1.7 Code Quality

| Problem |
|---------|
| Two Firebase projects referenced: `boomrome-b5c4a` (portal) and `boom-property-dashboards` (apartments). This means listings data and portal data are in DIFFERENT Firestore databases |
| Inline JS at bottom mixes DOM manipulation, Firebase queries, and UI logic — no separation |
| `cardHTML()` function builds strings with template literals but no escaping of user-provided fields (listing names, zones) |
| Old static apartment pages (`apartment_*.html`) are dead weight — not used by the dynamic system |

---

## 2. STRATEGIC VISION

### What This Page Needs to BE

The apartments page is **BOOM's storefront**. It's the first thing an expat Googles, the page an agent shares on WhatsApp, the link in every Instagram bio. It needs to:

1. **Rank on Google** for "apartments for rent in Rome for expats", "furnished apartments Rome", "canone concordato Rome english"
2. **Convert browsers to leads** — every scroll position should have a low-friction way to express interest
3. **Cross-sell BOOM services** — Property Finding, Deal Assistance, Virtual Viewing, BOOM Shield, PropPass
4. **Build trust immediately** — verified badges, tenant count, response time, real reviews
5. **Work as a landing page per zone** — `/apartments#trastevere` should feel like a dedicated page for that neighborhood

### The 3-Second Test

When an expat lands on this page, within 3 seconds they should understand:
- "This is real apartments I can rent in Rome"
- "These people speak English and help expats"
- "I can move in within weeks, not months"
- "There's a way to get help if I can't find what I want"

---

## 3. SOLUTIONS — Grouped by Phase

### Quick Wins (Ship Today)

| Fix | What | Effort |
|-----|------|--------|
| **Brand colors** | Replace `#FFD700` with `#D4AF37`, `#000` with `#08080A` | 5 min |
| **Add canonical** | `<link rel="canonical" href="https://www.boomrome.com/apartments">` | 1 min |
| **Add robots.txt** | Basic allow-all with sitemap reference | 2 min |
| **Create sitemap.xml** | List all public pages (index, apartments, about, contact, blog-*, apartment-detail) | 15 min |
| **Fix intake link** | Change `boom-property-dashboards.web.app/onboarding.html` to `boomrome.com/portal.html?intake=pfs` | 2 min |
| **Add WhatsApp floating button** | Fixed bottom-right WhatsApp icon on mobile | 10 min |
| **Image alt text** | Switch from CSS `background-image` to `<img>` with `alt` and `loading="lazy"` | 30 min |

### Phase 1 (This Week)

| Feature | What |
|---------|------|
| **Smart filters** | Add: Zone dropdown, Price range (€500-€800, €800-€1200, €1200+), Rooms (1-3+), Move-in date |
| **Inline lead capture** | "Can't find what you need?" inline form at bottom of listings: name, email, budget, zone — submits to `leads` collection directly, no redirect |
| **Trust bar** | Below hero: "500+ tenants helped / 48h average response / 4.9 Google rating / Video-verified" |
| **Listing card upgrade** | Add: prominent move-in date, WhatsApp quick-inquiry button, neighborhood tag with link |
| **JSON-LD schema** | Add `RealEstateAgent` and `ItemList` with `ListItem` for each apartment |
| **Unify Firebase project** | Both pages should read from the same Firestore. Either sync `listings` between projects or switch apartments.html to `boomrome-b5c4a` |

### Phase 2 (Next Sprint)

| Feature | What |
|---------|------|
| **Zone landing sections** | Collapsible sections per zone (Trastevere, Prati, Centro, Pigneto...) with neighborhood description, average price, transport links |
| **Listing Scout integration** | "X new listings added this week" dynamic counter from Firestore |
| **Map view** | Toggle between grid and map view using Google Maps embed or Mapbox |
| **Comparison tool** | Select up to 3 apartments to compare side-by-side |
| **Blog integration** | Each zone section links to relevant blog article ("Guide to Living in Trastevere") |
| **Service banner rotation** | Rotate between PFS, DAS, VV, BOOM Shield based on user behavior |

---

## 4. NEW FEATURES — Conversion Engine

### 4.1 Smart Filtering

```
[Zone ▾] [€ Budget ▾] [Rooms ▾] [Move-in ▾] [🔍 Search]
```

- Zone: Dropdown with all unique zones from listings + "All Rome"
- Budget: Slider or preset ranges (€500-800, €800-1200, €1200-1800, €1800+)
- Rooms: 1 / 2 / 3+ / Any
- Move-in: This month / Next month / Flexible
- Filters update URL params: `/apartments?zone=trastevere&budget=1200&rooms=2`
- SEO benefit: zone-filtered URLs become crawlable landing pages

### 4.2 Availability Signals

- **Green pulse dot** on available listings (animated CSS)
- **"Just listed"** badge for listings added in last 7 days
- **"X people viewing"** social proof (optional, simulated or real from analytics)
- **Countdown** "Available from March 1st — 12 days" on each card

### 4.3 Trust Indicators

- **Trust bar**: Fixed below header or as part of hero
  - "500+ expats helped since 2020"
  - "48h average response time"
  - "4.9/5 on Google Reviews"
  - "Every apartment video-verified"
- **Tenant quote carousel** (3-4 real quotes)
- **"As seen in"** logos if applicable (Wanted in Rome, The Local, etc.)

### 4.4 Service Cross-Sells

Each listing card could have a subtle banner:
- "Need help negotiating? Try Deal Assistance →"
- "Can't visit in person? Book a Virtual Viewing →"
- After scrolling past all listings: "BOOM Property Finding — We search 50+ sources daily so you don't have to. [Start for €350 →]"

### 4.5 Lead Capture Moments

Three capture points on the page:
1. **Top**: Inline search/filter bar that doubles as a lead form ("Tell us what you're looking for")
2. **Middle**: After every 4th listing card, an inline CTA card ("Not finding the perfect fit? Our agents search 50+ sources")
3. **Bottom**: Full lead capture form (name, email, WhatsApp, budget, zone) — submits to `leads` collection with `source: 'apartments_page'`

---

## 5. TECHNICAL ARCHITECTURE

### 5.1 Data Source

**Current**: apartments.html reads from Firebase project `boom-property-dashboards` collection `listings`.
**Portal**: reads from project `boomrome-b5c4a` collection `listings` (via adminflatsPage sync).

**Problem**: Two separate Firestore databases. Listings edited in portal don't appear on apartments page unless synced.

**Fix**: Either:
- (A) Switch apartments.html to use `boomrome-b5c4a` config (same as portal) — simplest
- (B) Use a Cloud Function to sync `listings` between projects on write
- Recommendation: **(A)** — one source of truth

### 5.2 Listing Data Model

Current fields in `listings` collection:
```
name, price, zone, address, image, photos[], beds, sqm, floor, type,
tags[], status, availableDate, videoUrl, youtubeUrl, description,
features[], propertyId
```

**Proposed additions** for SEO and UX:
```
slug (URL-friendly name: "coronari-classic-centro"),
metaTitle, metaDescription (per-listing SEO),
neighborhood (structured: { name, slug, lat, lng }),
nearestMetro, nearestBus,
walkScore, transitScore,
floorPlan (image URL),
virtualTourUrl,
listingScoutSource (immobiliare/idealista/manual),
lastUpdated, firstListed,
viewCount, inquiryCount
```

### 5.3 Listing Scout Integration

Listing Scout (already in boomToolsPage) scrapes Immobiliare.it, Idealista, Subito, Casafari. When a property is added via Smart Link Generator:
- Auto-populate `listings` collection
- Set `listingScoutSource` field
- Show "X new this week" badge on apartments page
- Auto-generate slug for SEO URL

### 5.4 Future City Scaling

For "BOOM in a Box" franchise model:
- Listings should have a `city` field (default: `rome`)
- Filter by city: `db.collection('listings').where('city', '==', 'rome')`
- URL structure: `/apartments?city=rome` or `/rome/apartments`
- Each city gets its own zone taxonomy, neighborhood descriptions, blog content

---

## 6. SEO MASTERPLAN

### 6.1 Current State

| Element | Status | Grade |
|---------|--------|-------|
| Meta title | "Apartments in Rome — BOOM" | B (missing keywords) |
| Meta description | Good but generic | B |
| h1 | "Apartments in Rome" | C (no differentiation) |
| h2/h3 structure | Minimal | D |
| Schema markup | None | F |
| Sitemap | Missing | F |
| Robots.txt | Missing | F |
| Canonical | Missing | D |
| Internal links | Minimal | D |
| Image SEO | No alt text (CSS bg-image) | F |
| Page speed | Unoptimized | D |
| Core Web Vitals | Unknown, likely poor (no lazy loading, large JS) | D |

### 6.2 Target Keywords

**Primary (high volume, high competition)**:
- "apartments for rent in Rome"
- "furnished apartments Rome"
- "apartments for expats in Rome"

**Secondary (medium volume, medium competition)**:
- "canone concordato Rome English"
- "short term rental Rome furnished"
- "mid-term apartment rental Rome"
- "Rome apartment for students English"

**Long-tail per zone (low competition, high intent)**:
- "apartment for rent Trastevere expats"
- "furnished apartment Prati Rome"
- "studio apartment Pigneto Rome"
- "apartment Monteverde Rome English"
- "cheap apartment Testaccio Rome"
- "luxury apartment Centro Storico Rome"
- "apartment near Sapienza university Rome"
- "apartment near LUISS Rome"

### 6.3 Proposed Meta Tags

```html
<title>Apartments for Rent in Rome | Furnished, Verified, 48h Move-in — BOOM</title>
<meta name="description" content="Browse verified furnished apartments for rent in Rome. Perfect for expats & students. Canone concordato available. Move in within 48 hours. No hidden fees.">
<link rel="canonical" href="https://www.boomrome.com/apartments">
```

### 6.4 Heading Structure

```
h1: Furnished Apartments for Rent in Rome
  h2: Available Now (X apartments)
    h3: [Zone Name] — X apartments from €XXX
  h2: Coming Soon
  h2: Not Finding What You Need?
    h3: Property Finding Service
    h3: Deal Assistance
  h2: Rome Neighborhoods Guide
    h3: Trastevere
    h3: Prati
    h3: Centro Storico
    ...
  h2: Why Rent with BOOM?
  h2: FAQ
```

### 6.5 JSON-LD Schema Markup

**Page-level** (RealEstateAgent):
```json
{
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  "name": "BOOM Rome",
  "url": "https://www.boomrome.com",
  "logo": "https://www.boomrome.com/BOOMlogogoldicon512.png",
  "description": "Premium rental management for expats in Rome",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Rome",
    "addressCountry": "IT"
  },
  "areaServed": "Rome, Italy",
  "priceRange": "€500 - €2500/month"
}
```

**Per-listing** (Product with Offer):
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Coronari Classic — Centro Storico",
  "description": "Furnished 2-bedroom apartment in Centro Storico, Rome",
  "image": "https://...",
  "offers": {
    "@type": "Offer",
    "price": "1200",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock"
  },
  "brand": { "@type": "Brand", "name": "BOOM Rome" }
}
```

**Listing collection** (ItemList):
```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Apartments for Rent in Rome",
  "numberOfItems": 12,
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "url": "https://www.boomrome.com/apartment-detail?id=xxx" }
  ]
}
```

### 6.6 Technical SEO Files

**robots.txt**:
```
User-agent: *
Allow: /
Disallow: /portal
Disallow: /admin
Disallow: /setup-firebase
Disallow: /seed-listings
Sitemap: https://www.boomrome.com/sitemap.xml
```

**sitemap.xml** — should include:
- All public HTML pages (index, apartments, about, contact, privacy, terms, how-it-works, faq, book, concierge)
- All blog articles (blog-47-steps, blog-contract-types, blog-cost-calculator, blog-neighborhood-guide, blog-scam-bible, blog-tenant-rights, blog-visa-residency)
- Dynamic listing detail pages (would need server-side generation or a cron that updates sitemap)
- Priority: homepage 1.0, apartments 0.9, blog 0.7, other 0.5

### 6.7 Blog Topics for Organic Traffic

**High-intent articles** (bottom of funnel):
- "How to Find an Apartment in Rome as an Expat (2026 Guide)"
- "Canone Concordato Explained in English — Rome Rental Contracts"
- "Rome Apartment Scams: How to Spot and Avoid Them"
- "Codice Fiscale for Renting: What You Need and How to Get It"

**Zone guides** (middle of funnel):
- "Living in Trastevere: Complete Guide for Expats"
- "Prati vs Centro Storico: Which Rome Neighborhood is Right for You?"
- "Student Apartments Near Sapienza: Zone Guide + Prices"
- "Best Neighborhoods in Rome for Remote Workers"

**Top of funnel** (awareness):
- "Cost of Living in Rome 2026: Monthly Budget Breakdown"
- "Moving to Rome from the US/UK/Germany: Everything You Need to Know"
- "Italian Bureaucracy for Expats: A Survival Guide"

### 6.8 Google Business Profile

- Create/optimize Google Business Profile for "BOOM Rome"
- Category: "Real Estate Agent" + "Property Management Company"
- Add all photos, services, business hours
- Request reviews from past tenants
- Post weekly updates with new listings
- Link to apartments page as primary website

### 6.9 Page Speed Optimization

| Action | Expected Impact |
|--------|----------------|
| Convert images to WebP with responsive srcset | LCP -2s |
| Lazy load images with `loading="lazy"` | Initial load -60% |
| Defer Firebase SDK load | FCP -500ms |
| Extract shared CSS to `common.css` (cached across pages) | Repeat visit -15KB |
| Defer YouTube iframe until intersection | TTI -1s |
| Preload hero image | LCP -500ms |
| Add `font-display: swap` to Google Fonts | FOIT eliminated |

---

## Summary: Implementation Roadmap

### Today (Quick Wins)
- Fix brand colors (#D4AF37, #08080A)
- Add canonical, robots.txt, sitemap.xml
- Fix intake form link (use boomrome.com, not external Firebase)
- Switch listing images from CSS background to `<img>` with alt + lazy

### This Week (Phase 1)
- Smart filter bar (zone, price, rooms)
- Inline lead capture form
- Trust bar with stats
- JSON-LD schema markup
- Unify Firebase project
- Optimize images (WebP, srcset)

### Next Sprint (Phase 2)
- Zone landing sections with SEO content
- Map view toggle
- Blog integration per zone
- Listing Scout "new this week" counter
- Google Business Profile setup
- Core Web Vitals optimization pass
