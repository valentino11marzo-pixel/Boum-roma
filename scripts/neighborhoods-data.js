/**
 * BOOM Rome — Neighborhood landing page data.
 *
 * Drives scripts/neighborhoods-build.js. Edit values here, then run:
 *   node scripts/neighborhoods-build.js
 *
 * Each neighborhood produces /apartments-in/{slug}.html, which Vercel
 * serves at /apartments-in/{slug} via cleanUrls.
 */

const NEIGHBORHOODS = [
  /* ──────────────────────────────────────────────────────── 1. TRASTEVERE */
  {
    slug: 'trastevere',
    name: 'Trastevere',
    eyebrow: 'Rome Neighborhood Guide',
    shortVibe: 'Cobblestone bohemian. Postcard Rome.',
    metaTitle: 'Apartments for Rent in Trastevere, Rome — Verified Listings | BOOM',
    metaDescription:
      'Live in Trastevere — Rome\'s most photogenic district. Verified apartments from €1,400/mo, 48-hour move-in, legal contracts. Bohemian charm, walk-everywhere central.',
    keywords: ['apartment Trastevere', 'rent Trastevere Rome', 'Trastevere apartment expat', 'flats Trastevere'],
    geo: { lat: 41.8896, lng: 12.4695 },
    matchTerms: ['trastevere'],
    stats: {
      rentMin: 1400, rentMax: 2200, walkScore: 10, vibeScore: 10, transitScore: 8,
    },
    audience: ['Couples', 'Creatives', 'Long-stay expats'],
    summary:
      'The Rome you picture before you visit. Ivy-clad palazzi, narrow cobbled streets, every door opens onto a wine bar. Loved by expats; tolerated by locals; loud after midnight.',
    whyLiveHere: [
      'Trastevere is the right bank of the Tiber and the heart of Rome\'s social life. Ten minutes\' walk gets you to Campo de\' Fiori and the historic centre, but you\'re also a tram ride from Gianicolo\'s panoramic park and Monteverde\'s residential calm.',
      'It has the highest restaurant density in the city — Da Enzo for cacio e pepe, Sora Mirella for grattachecca, Antico Forno Roscioli for pizza bianca. The catch: it\'s also where every tourist guidebook sends people for dinner, so the central streets get crowded after 8pm.',
      'Rents are higher than nearby Monteverde or Testaccio, but lower than Centro Storico. You\'re paying for atmosphere — ivy, lanterns, piazzas with fountains — and one of the few central neighborhoods where you can actually meet your neighbors.',
      'Best for: couples wanting the "Roman holiday" experience, creatives, anyone whose social life revolves around food and wine, and long-stay expats who want a strong sense of place.',
    ],
    landmarks: [
      { name: 'Piazza Santa Maria in Trastevere', blurb: 'The neighborhood\'s living room — fountain, basilica, evening crowd.' },
      { name: 'Orto Botanico', blurb: 'Rome\'s botanical garden — a quiet 12-hectare escape.' },
      { name: 'Gianicolo Hill', blurb: 'The panoramic terrace over Rome — sunset view non-negotiable.' },
      { name: 'Mercato di San Cosimato', blurb: 'The local food market — real prices, real produce.' },
      { name: 'Villa Doria Pamphilj', blurb: 'Rome\'s largest landscaped park — a 20-min uphill walk away.' },
    ],
    insiderTips: [
      'Avoid restaurants on Piazza Santa Maria — they\'re tourist-priced. Walk two streets in any direction for the same food at half the price.',
      'Mercato di San Cosimato (mornings, closed Sunday) is where locals shop. Bring cash.',
      'Trams 8 and 3 are your best friends — cars are useless inside Trastevere\'s ZTL.',
      'For coffee: Bar San Calisto for the €2 spritz crowd, Tram Depot for the espresso snobs.',
      'Sunday brunch lines start at 11. Sora Mirella, Pianostrada, and Otaleg sell out fast.',
    ],
    faqs: [
      { q: 'Is Trastevere safe at night?', a: 'Yes — Trastevere is one of Rome\'s safer central neighborhoods. The main streets stay busy until 2–3am. Use normal city common sense: don\'t leave bags unattended at outdoor tables, and avoid the quietest alleys alone after midnight.' },
      { q: 'How much does a 1-bedroom apartment cost in Trastevere?', a: 'Mid-term verified 1-bedrooms typically range €1,400–€2,200/month furnished. Below €1,200 usually means a garden-level or basement unit; above €2,500 means a terrace, a top floor, or a fully renovated luxury flat.' },
      { q: 'Is Trastevere good for families?', a: 'It depends. The piazza-and-restaurant vibe is fun for kids, and there are parks (Gianicolo, Doria Pamphilj). But noise from the bar scene is a real issue on the central streets — families typically prefer the quieter southern edge near Viale Glorioso or Monteverde Vecchio.' },
      { q: 'Can I get around Trastevere without a car?', a: 'Easily. Tram 8 connects to Largo Argentina (15 min), tram 3 runs to Termini and Aventino. Buses fill the gaps. Most apartments are inside the ZTL (limited-traffic zone), so a car is more burden than help.' },
      { q: 'Where in Trastevere is best for expats?', a: 'The quieter pockets: south of Viale Trastevere (around Piazza Mastai, Via di Monte Fiore), the streets behind Santa Cecilia, or the Gianicolo slope. Central Trastevere (around Santa Maria) is more vibrant but noisier.' },
    ],
  },

  /* ─────────────────────────────────────────────────────── 2. CENTRO STORICO */
  {
    slug: 'centro-storico',
    name: 'Centro Storico',
    eyebrow: 'Rome Neighborhood Guide',
    shortVibe: 'UNESCO postcard. Live inside the ancient city.',
    metaTitle: 'Apartments in Centro Storico Rome — Pantheon, Navona | BOOM',
    metaDescription:
      'Apartments for rent in Rome\'s Centro Storico — Pantheon, Piazza Navona, Campo de\' Fiori at your door. Video-verified, legal contracts, from €1,800/mo.',
    keywords: ['apartment Centro Storico', 'apartment Pantheon Rome', 'apartment Piazza Navona', 'historic centre Rome rental'],
    geo: { lat: 41.8989, lng: 12.4769 },
    matchTerms: ['centro storico', 'centro-storico', 'historic centre', 'pantheon', 'navona', 'centro'],
    stats: {
      rentMin: 1800, rentMax: 3500, walkScore: 10, vibeScore: 9, transitScore: 8,
    },
    audience: ['Design-conscious', 'Romantics', 'Senior professionals'],
    summary:
      'Live inside a UNESCO World Heritage Site. Your morning espresso is at Sant\'Eustachio, your evening passeggiata circles the Pantheon. The rent is high; the address is irreplaceable.',
    whyLiveHere: [
      'Centro Storico is the rione network inside the bend of the Tiber — Pantheon, Piazza Navona, Campo de\' Fiori, Trevi, Spanish Steps. It is, literally, ancient Rome with people living in it. Most apartments are inside palazzi that predate the United States.',
      'The trade-off is foot traffic. Day and night, the central piazzas are full of tourists. But Centro is also a real residential quarter — Via dei Coronari, Via di Monserrato, the side streets behind the Pantheon — and once you\'re off the main routes, it\'s eerily quiet.',
      'You\'re paying a 30–50% premium over comparable space in Prati or Monti. What you get is the most walkable lifestyle in Europe, no need for a car, and a view that makes every guest gasp.',
      'Best for: people who already live in a global capital and know what city centres feel like. Designers, executives, anyone for whom architecture matters and rent is not the binding constraint.',
    ],
    landmarks: [
      { name: 'Pantheon', blurb: 'The 2,000-year-old former temple — still standing, still in use, still a wonder.' },
      { name: 'Piazza Navona', blurb: 'Bernini\'s Baroque masterpiece, lined with cafés and street artists.' },
      { name: 'Campo de\' Fiori', blurb: 'Morning fruit market, evening drinks crowd.' },
      { name: 'Trevi Fountain', blurb: 'Crowded, magical, three blocks from the Spanish Steps.' },
      { name: 'Sant\'Eustachio Il Caffè', blurb: 'Many Romans\' candidate for Rome\'s best espresso.' },
    ],
    insiderTips: [
      'Aim for streets behind the main piazzas — Via dei Coronari, Via dell\'Arco della Pace, Vicolo del Bollo. Same Centro, half the foot traffic.',
      'No car. Centro is inside the strict ZTL — non-resident vehicles get fined automatically.',
      'For groceries: Antico Forno Roscioli for bread, Salumeria Roscioli for everything else. Carrefour Express for the basics.',
      'Best gelato debate: Giolitti vs Gelateria del Teatro vs Fatamorgana. Verdict: all three, ranked by mood.',
      'Tourist crowds peak 11am–6pm. Sunday mornings are the secret window — Centro almost empty.',
    ],
    faqs: [
      { q: 'Is Centro Storico noisy at night?', a: 'It varies street by street. The central piazzas (Navona, Campo de\' Fiori) are loud until 1–2am. Residential streets like Via dei Coronari, Via Monserrato, and the area around Piazza Farnese are surprisingly quiet — most palazzi have double-glazed windows.' },
      { q: 'How much does an apartment in Centro Storico cost?', a: 'Mid-term verified 1-bedrooms typically range €1,800–€3,500/month. A renovated 2-bedroom with original beams or a terrace can hit €4,000+. Expect 20–30% premium over Trastevere and 50%+ over Monti for comparable space.' },
      { q: 'Can I have a car in Centro Storico?', a: 'In practice, no. The entire area is inside the ZTL and parking permits are limited to long-term residents (you need residenza, not just a contract). Most expats rent without a car and use taxis or rideshare for trips out of town.' },
      { q: 'Are Centro Storico apartments small?', a: 'Often yes — historic palazzi divide into compact units. Anything over 80m² is rare and priced accordingly. If space matters more than address, Prati or Trieste offer significantly larger floor plans.' },
      { q: 'What\'s the best part of Centro Storico for residents?', a: 'The triangle between Pantheon, Campo de\' Fiori and Piazza Farnese is the residential sweet spot — central, quieter than Navona, walking distance to everything. The area around Via Giulia is one of the most photogenic in the city.' },
    ],
  },

  /* ─────────────────────────────────────────────────────── 3. MONTI */
  {
    slug: 'monti',
    name: 'Monti',
    eyebrow: 'Rome Neighborhood Guide',
    shortVibe: 'The original cool district. Boutiques, wine bars, Colosseum down the street.',
    metaTitle: 'Apartments for Rent in Monti, Rome — Central + Hip | BOOM',
    metaDescription:
      'Live in Monti — Rome\'s most fashionable central rione. Vintage shops, natural-wine bars, steps from the Colosseum. Verified apartments from €1,500/mo, BOOM-managed.',
    keywords: ['apartment Monti Rome', 'rent Monti Rome', 'flats Monti', 'Monti apartment expat'],
    geo: { lat: 41.8946, lng: 12.4926 },
    matchTerms: ['monti', 'rione monti'],
    stats: {
      rentMin: 1500, rentMax: 2400, walkScore: 10, vibeScore: 10, transitScore: 9,
    },
    audience: ['Young professionals', 'Creatives', 'Design crowd'],
    summary:
      'Rome\'s coolest rione — and it knows it. Vintage shops above Roman ruins, natural-wine bars next to the Forum. The neighborhood where every cool restaurant opens first.',
    whyLiveHere: [
      'Monti is the oldest rione (district) of Rome, sandwiched between the Colosseum, the Roman Forum, and Termini. Once a rough working-class quarter, it became the city\'s style headquarters in the 2010s and never let go.',
      'The geography is unfair: a 10-minute walk gets you to the Pantheon, the Colosseum, or Termini Station. Two metro stations (Cavour, line B; Termini, lines A+B) put the whole city on a leash. Buses fill in the rest.',
      'The vibe is independent shops, vintage boutiques, natural-wine bars, third-wave coffee, and a thirty-something crowd that took the day off to spend it at Mercato Monti. Quieter than Trastevere, more residential than Centro Storico.',
      'Best for: young professionals, creatives, designers, anyone who reads Monocle. Not the cheapest area, but not Centro-expensive either — and the best per-euro lifestyle in central Rome.',
    ],
    landmarks: [
      { name: 'Piazza Madonna dei Monti', blurb: 'The social heart — fountain, aperitivo crowd, dog walkers.' },
      { name: 'Basilica di Santa Maria Maggiore', blurb: 'One of Rome\'s four major basilicas — five minutes\' walk.' },
      { name: 'Domus Aurea', blurb: 'Nero\'s buried palace — recently re-opened to guided tours.' },
      { name: 'San Pietro in Vincoli', blurb: 'Home to Michelangelo\'s Moses, around the corner.' },
      { name: 'Mercato Monti', blurb: 'Weekend vintage and design market — Sundays only.' },
    ],
    insiderTips: [
      'Aperitivo strategy: Piazza Madonna dei Monti for the scene, Ai Tre Scalini for the wine list, La Bottega del Caffè for the people-watching.',
      'For coffee, head to Faro Caffè (specialty roast) or Tazza d\'Oro\'s little brother on Via degli Zingari.',
      'Cavour metro stop is more central than it looks — one stop to Colosseo, two to Termini.',
      'Vintage shopping: Pifebo, Le Gallinelle, Twice Vintage. Mercato Monti only on weekends.',
      'Skip Via dei Serpenti for happy hour on summer Fridays — it\'s a tourist conga line.',
    ],
    faqs: [
      { q: 'Is Monti walkable?', a: 'Yes — Monti is one of the most walkable areas in Rome. The Colosseum is 8 minutes on foot, the Pantheon 15, Termini 10. Cavour metro on line B is two stops to anywhere central.' },
      { q: 'How much is rent in Monti?', a: 'A mid-term verified 1-bedroom typically runs €1,500–€2,400/month. Renovated apartments with exposed brick or beams command €2,000+. Studios start around €1,100 in less central pockets.' },
      { q: 'Is Monti safe?', a: 'Very safe by Rome standards. The streets are well-lit, the bar crowd keeps things busy until late, and pickpocket risk is normal-tourist-level only on the Colosseum-facing streets. Solo walking late at night is fine.' },
      { q: 'Is Monti good for remote work?', a: 'Excellent. Strong third-wave coffee scene (Faro, Tazza d\'Oro), reliable fibre internet in most renovated buildings, and several co-working spaces (Talent Garden, Spaces) within 10 minutes. Quieter than Trastevere during weekday work hours.' },
      { q: 'Where in Monti is best for first-time expats?', a: 'Around Via Panisperna, Via Urbana, and Piazza degli Zingari — central, residential, walking distance to everything. Avoid the Termini side after dark if you\'re solo — not unsafe, just less pleasant.' },
    ],
  },

  /* ─────────────────────────────────────────────────────── 4. PRATI */
  {
    slug: 'prati',
    name: 'Prati',
    eyebrow: 'Rome Neighborhood Guide',
    shortVibe: 'Elegant, residential, quietly upscale. Embassies and the Vatican across the river.',
    metaTitle: 'Apartments for Rent in Prati, Rome — Elegant + Central | BOOM',
    metaDescription:
      'Prati apartments for rent — Rome\'s most elegant residential quarter, near the Vatican. Wide grid streets, premium shopping. Verified, BOOM-managed, from €1,600/mo.',
    keywords: ['apartment Prati Rome', 'apartment Vatican Rome', 'flats Prati', 'Prati apartment expat'],
    geo: { lat: 41.9080, lng: 12.4602 },
    matchTerms: ['prati', 'mazzini', 'delle vittorie', 'vatican'],
    stats: {
      rentMin: 1600, rentMax: 2600, walkScore: 9, vibeScore: 8, transitScore: 9,
    },
    audience: ['Families', 'Senior professionals', 'Long stays'],
    summary:
      'The Haussmann of Rome — wide grid streets, plane trees, fin-de-siècle palazzi. Quiet, premium, full of cafés. Vatican is your neighbor across the bridge.',
    whyLiveHere: [
      'Prati was built late (1880s onward) on what used to be papal meadows — hence the rare-in-Rome grid layout, wide boulevards, and uniform 19th-century palazzi. It feels closer to Paris than to medieval Rome.',
      'Everything is on Via Cola di Rienzo: Coin, Castroni, the COIN supermarket, the upscale-everyday shopping. Mercato Trionfale is one of Rome\'s best food markets. Coffee culture is everywhere — Sciascia, Bonci, Pergamino.',
      'Transit is excellent: two metro stops (Ottaviano, Lepanto, line A), the Lungotevere bus arteries, and a bridge walk to Centro Storico (Castel Sant\'Angelo to Piazza Navona is 8 minutes). Vatican Museums are 10 minutes on foot.',
      'Best for: families (real apartments with real rooms), senior professionals, embassy staff, anyone planning a 12-month-plus stay. Quieter than Trastevere, more residential than Centro, better value per square metre than either.',
    ],
    landmarks: [
      { name: 'Vatican City', blurb: 'Saint Peter\'s, the Vatican Museums, the Sistine Chapel — across the river.' },
      { name: 'Castel Sant\'Angelo', blurb: 'Hadrian\'s mausoleum turned papal fortress — sunset terrace.' },
      { name: 'Piazza Cavour', blurb: 'Tree-lined square anchored by the Palace of Justice.' },
      { name: 'Mercato Trionfale', blurb: 'One of Rome\'s best food markets — 200+ stalls, locals only.' },
      { name: 'Via Cola di Rienzo', blurb: 'The shopping spine — from boutiques to bakeries to Bonci pizza.' },
    ],
    insiderTips: [
      'Forget the Vatican-museum lines. Sciatori (Via Cassia) and the Friday-evening late-opening slot are the locals\' tricks.',
      'Mercato Trionfale is open Mon–Sat morning. Stall 240 (Annibale) for fish; Pizzarium-style slices at Bonci\'s parent store.',
      'Sciascia Caffè 1919 — the best cappuccino in Prati. Skip the espresso, get the al cioccolato.',
      'Castel Sant\'Angelo bridge gets you to Piazza Navona in 8 minutes flat — faster than a taxi at rush hour.',
      'Cars: parking is paid but findable. Inside Lepanto/Ottaviano it\'s not a ZTL, so a car is more usable here than in Centro.',
    ],
    faqs: [
      { q: 'Is Prati a good neighborhood for families?', a: 'One of the best in Rome. Wide pavements, family-friendly cafés, several parks (Piazza Mazzini, Lungotevere), top private and state schools, and pediatricians on every corner. The grid layout makes stroller life dramatically easier than in Centro or Trastevere.' },
      { q: 'How much does a 2-bedroom apartment cost in Prati?', a: 'Mid-term verified 2-bedrooms typically range €1,800–€2,800/month. Renovated apartments in palazzi signorili (with concierge, lift, parquet) hit €3,000+. Studios from €900.' },
      { q: 'Is Prati close to the Vatican?', a: 'Yes — Prati borders the Vatican walls. Saint Peter\'s Square is a 5–15 minute walk from most of the neighborhood. The Ottaviano metro (line A) drops you at the Vatican Museums.' },
      { q: 'What\'s the difference between Prati and the Centro Storico?', a: 'Prati is residential, planned, calm; Centro is medieval, dense, touristy. Prati has supermarkets, dry cleaners, hardware stores; Centro has palazzi and piazzas. Prati is a 30% rent discount on Centro for comparable square metres.' },
      { q: 'Is Prati safe?', a: 'Among the safest areas of central Rome. Low petty-crime rates, well-lit streets, a substantial residential population that keeps the area active day and night. Embassy-level safe in the Mazzini/Delle Vittorie sub-area.' },
    ],
  },

  /* ─────────────────────────────────────────────────────── 5. PIGNETO */
  {
    slug: 'pigneto',
    name: 'Pigneto',
    eyebrow: 'Rome Neighborhood Guide',
    shortVibe: 'Rome\'s Brooklyn. Street art, craft cocktails, gentrifying fast.',
    metaTitle: 'Apartments for Rent in Pigneto, Rome — Best Vibe Value | BOOM',
    metaDescription:
      'Live in Pigneto — Rome\'s most authentic creative district. Street art, indie bars, multicultural food scene. Verified apartments from €900/mo, BOOM-managed.',
    keywords: ['apartment Pigneto', 'rent Pigneto Rome', 'Pigneto apartment expat', 'creative neighborhood Rome'],
    geo: { lat: 41.8867, lng: 12.5257 },
    matchTerms: ['pigneto'],
    stats: {
      rentMin: 900, rentMax: 1500, walkScore: 8, vibeScore: 10, transitScore: 8,
    },
    audience: ['Creatives', 'Students', 'Budget-savvy expats'],
    summary:
      'The most authentic Rome you can find under €1,500. Multicultural, packed with nightlife, indie cafés on every corner, and the city\'s densest cluster of street art.',
    whyLiveHere: [
      'Pigneto sits just outside the Aurelian walls, southeast of Termini. Until the 2000s it was a forgotten working-class quarter — Pasolini filmed Accattone here. Today it\'s Rome\'s premier creative hub, dense with craft cocktail bars, vinyl shops, vegan kitchens, and natural-wine importers.',
      'The pedestrianized stretch of Via del Pigneto is the spine: bars spill onto the street, the food market sets up daily, and music drifts from windows. The neighborhood is loud at night and at peace by 11am — perfect rhythm for creative work.',
      'Connections are surprisingly good: tram 5/14 and bus 105 to Termini in 15 minutes, regional trains from Pigneto station, the C metro line opens in 2026 with a stop in the heart of the neighborhood.',
      'Best for: creatives, students, young Italians, expats whose first priority is character over polish. The best rent-to-vibe ratio in Rome — but rents have risen 30% in five years; the window may not stay open.',
    ],
    landmarks: [
      { name: 'Via del Pigneto', blurb: 'The pedestrianized strip — bars, food market, the social spine.' },
      { name: 'Necci dal 1924', blurb: 'Where Pasolini wrote and drank. Still serving, still local.' },
      { name: 'Parco di Centocelle', blurb: 'Rome\'s largest urban park inside the ring road — 130 hectares.' },
      { name: 'Mercato di Piazza dei Condottieri', blurb: 'Daily food market — multicultural, real-prices, no tourists.' },
      { name: 'Pigneto Street Art Trail', blurb: 'One of Rome\'s densest concentrations of murals and stencils.' },
    ],
    insiderTips: [
      'For aperitivo: Co.So. (cocktails), Yeah! Pigneto (vinyl + spritz), Vini e Olii (the wine-shop benches at sunset).',
      'Mercato di Piazza dei Condottieri (mornings, closed Sunday) — best place for fresh produce at real prices.',
      'Tram 5/14 takes 15 minutes to Termini — the quickest car-free route to anywhere central.',
      'For pizza: 180g, Sforno, and Pizzeria Da Remo (in Testaccio but 10 minutes away).',
      'Late-night safety: stick to lit streets near Via del Pigneto. The Casilina-side blocks are quieter and less foot-trafficked.',
    ],
    faqs: [
      { q: 'Is Pigneto safe?', a: 'Generally yes — Pigneto is a busy, populated neighborhood with strong street life until 1–2am. Petty theft happens (bag-snatching from outdoor tables). Use normal city common sense: don\'t flash phones at outdoor restaurants, and stick to lit streets if walking alone after midnight.' },
      { q: 'How much does an apartment in Pigneto cost?', a: 'Mid-term 1-bedrooms typically range €900–€1,500/month. Two-bedroom apartments €1,400–€2,000. The best value in central Rome — rents are 30–40% below Trastevere for similar size.' },
      { q: 'How long does it take to get from Pigneto to the city centre?', a: '15 minutes on the tram 5 or 14 to Termini, then change to any metro. By bike, 20 minutes to the Colosseum. By car, traffic-dependent, typically 20–30 minutes.' },
      { q: 'Is Pigneto good for families?', a: 'Possible, but better suited to childless professionals. Streets are loud at night, pavements are narrow, and parks are limited inside Pigneto itself (though Centocelle is close). Families typically choose Trieste, Prati, or Monteverde instead.' },
      { q: 'What\'s the food scene like in Pigneto?', a: 'Excellent and diverse. Roman classics (Sant\'Agostino, Da Marcello), international (sushi, Ethiopian, Indian, Bangladeshi), pizza (180g, Sforno), natural-wine bars (Vini e Olii), and one of Rome\'s most varied food markets. Lower prices than Centro for the same quality.' },
    ],
  },

  /* ─────────────────────────────────────────────────────── 6. TESTACCIO */
  {
    slug: 'testaccio',
    name: 'Testaccio',
    eyebrow: 'Rome Neighborhood Guide',
    shortVibe: 'Old-school Roman, foodie holy land, zero tourists.',
    metaTitle: 'Apartments for Rent in Testaccio, Rome — Authentic + Foodie | BOOM',
    metaDescription:
      'Testaccio apartments for rent — Rome\'s most genuine working-class quarter. Best food market in the city, original carbonara, no tourists. Verified, from €1,200/mo.',
    keywords: ['apartment Testaccio Rome', 'rent Testaccio', 'Testaccio apartment expat', 'foodie neighborhood Rome'],
    geo: { lat: 41.8782, lng: 12.4753 },
    matchTerms: ['testaccio'],
    stats: {
      rentMin: 1200, rentMax: 1900, walkScore: 9, vibeScore: 9, transitScore: 9,
    },
    audience: ['Foodies', 'Students', 'Young expats'],
    summary:
      'The Roman Romans live here. Best food market in the city, the original carbonara, jazz clubs in old slaughterhouses. No selfie sticks anywhere.',
    whyLiveHere: [
      'Testaccio sits between the Tiber and the artificial hill of Monte dei Cocci, made entirely of broken amphorae from ancient Rome. It was the city\'s slaughterhouse and warehouse district until the 1970s. Today it\'s a tight-knit residential rione with a near-religious devotion to traditional cuisine.',
      'Mercato Testaccio is the headline: 100+ stalls under a modernist roof, the kind of place where you befriend your fishmonger within a week. Da Felice still serves the cacio e pepe that Anthony Bourdain wouldn\'t shut up about. Pizzeria Da Remo has the original Roman-style pizza.',
      'The nightlife is concentrated in the Mattatoio (former slaughterhouse), now home to clubs, a music venue, and MACRO Testaccio (contemporary art). Metro Piramide (line B) is on the eastern edge, 5 minutes to Colosseum, 15 to Termini.',
      'Best for: foodies, students, young expats, anyone who values community over polish. The neighborhood has a strong identity — you become a Testaccino by living here, not a resident.',
    ],
    landmarks: [
      { name: 'Mercato di Testaccio', blurb: 'The food market — 100+ stalls under one roof. Sunday mornings non-negotiable.' },
      { name: 'Cimitero Acattolico', blurb: 'The Non-Catholic Cemetery — Keats, Shelley, Gramsci. Wisteria-covered, profoundly peaceful.' },
      { name: 'Piramide di Caio Cestio', blurb: 'A 36m Roman pyramid from 12 BC. Yes, in Rome.' },
      { name: 'Monte dei Cocci', blurb: 'A hill made of 53 million ancient amphorae fragments.' },
      { name: 'Mattatoio / MACRO Testaccio', blurb: 'Former slaughterhouse, now nightlife and contemporary art district.' },
    ],
    insiderTips: [
      'Mercato Testaccio — go Saturday morning before noon. Stall Mordi e Vai for the trippa panino; Stall Sergio for cheese.',
      'Da Felice (cacio e pepe), Flavio al Velavevodetto (carbonara), Da Remo (pizza). Reserve. Cash usually preferred.',
      'Mattatoio nights: La Casa del Jazz, Caffè Letterario, Goa for clubbing — same complex, different decades of music.',
      'Piramide metro is your gateway: Line B north to Colosseum, south to Ostia (the beach).',
      'Sunday brunch crowd avoids Testaccio — go to Centro or Monti and have the market to yourself.',
    ],
    faqs: [
      { q: 'Is Testaccio safe?', a: 'Very. It\'s a tight-knit residential neighborhood — everyone knows everyone, low petty-crime rate, well-lit streets. The Mattatoio nightlife area gets busy on weekend nights but stays well-managed.' },
      { q: 'How much does an apartment in Testaccio cost?', a: 'Mid-term verified 1-bedrooms typically range €1,200–€1,900/month. Two-bedrooms €1,600–€2,400. Testaccio offers 15–20% better value than Trastevere for similar size and central access.' },
      { q: 'Is Testaccio touristy?', a: 'Almost not at all. The food market draws some food-tourists on weekends, but the residential streets and most restaurants stay locals-only. It\'s the most genuinely Roman of the central neighborhoods.' },
      { q: 'How well-connected is Testaccio?', a: 'Excellent — Piramide metro (line B) on the eastern edge gets you to Colosseum in 5 minutes, Termini in 15. Trams 3 and 8 link to Trastevere and Centro. The bike-share works well over the flat Testaccio geography.' },
      { q: 'What\'s the difference between Testaccio and Ostiense?', a: 'Testaccio is older, more residential, more food-focused. Ostiense (next door, south) is post-industrial, street-art-heavy, more student-aged. Testaccio rents are higher; Ostiense feels rawer.' },
    ],
  },

  /* ─────────────────────────────────────────────────────── 7. OSTIENSE */
  {
    slug: 'ostiense',
    name: 'Ostiense',
    eyebrow: 'Rome Neighborhood Guide',
    shortVibe: 'Industrial-cool. Street art capital, emerging fast.',
    metaTitle: 'Apartments for Rent in Ostiense, Rome — Street Art + Affordable | BOOM',
    metaDescription:
      'Ostiense apartments for rent — Rome\'s post-industrial creative quarter. Legendary street art, warehouse nightlife, Roma Tre university. Verified from €1,000/mo.',
    keywords: ['apartment Ostiense', 'rent Ostiense Rome', 'Ostiense apartment student', 'street art Rome'],
    geo: { lat: 41.8736, lng: 12.4778 },
    matchTerms: ['ostiense', 'garbatella'],
    stats: {
      rentMin: 1000, rentMax: 1600, walkScore: 8, vibeScore: 8, transitScore: 9,
    },
    audience: ['Students', 'Young pros', 'Budget-conscious'],
    summary:
      'Affordable, well-connected, full of street art. The post-industrial belt south of the centre — Eataly, MACRO power-plant museum, warehouse clubs, Roma Tre students.',
    whyLiveHere: [
      'Ostiense was the gas-works and grain-warehouse belt feeding Rome from the river port. Decommissioned in the 1980s, it\'s now Rome\'s most successful post-industrial reinvention: factories turned museums, gasometers turned landmarks, warehouses turned nightlife.',
      'Via del Porto Fluviale and Via Ostiense are open-air galleries — Blu, JB Rock, Sten Lex, Agostino Iacurci have all painted entire building facades here. The Centrale Montemartini puts ancient marble statues inside a former power plant; it\'s one of Rome\'s best museums by ratio.',
      'Roma Tre University and the headquarters of LUISS make Ostiense student-heavy. Metro Piramide and Garbatella (line B) plus Ostiense rail station mean fast access to Centro (5–10 minutes) and Fiumicino airport (30 minutes direct).',
      'Best for: students, recent grads, young professionals, anyone who wants central-Rome connectivity at 30% less rent than Trastevere. Garbatella (Ostiense\'s neighbor) is the foodie sweet spot — old-school trattorie everywhere.',
    ],
    landmarks: [
      { name: 'Centrale Montemartini', blurb: 'Roman statues inside a working former power plant. Surreal and unmissable.' },
      { name: 'Via del Porto Fluviale Street Art', blurb: 'Blu\'s monumental mural of faces — best photographed at golden hour.' },
      { name: 'Eataly Roma Ostiense', blurb: 'The largest Eataly in the world — 17,000m² of Italian food and wine.' },
      { name: 'Basilica di San Paolo Fuori le Mura', blurb: 'One of Rome\'s four major basilicas — mosaics and silence.' },
      { name: 'Gazometro', blurb: 'The 89m Victorian gas tower — Ostiense\'s industrial-romantic landmark.' },
    ],
    insiderTips: [
      'Garbatella (next door) for trattorie: La Brace, Trattoria Pennestri, Cesare al Casaletto. Cheaper than Trastevere, twice as authentic.',
      'Eataly Ostiense — go Tuesday afternoon to avoid the weekend crush. Top-floor restaurant has the best view of Ostiense at sunset.',
      'Nightlife: Rashomon, Goa (in Mattatoio), Vinile, Ex Dogana — all within a 10-minute walk.',
      'Bike-share works perfectly here — flat geography, wide streets, low car traffic.',
      'Ostiense Station = direct train to Fiumicino airport every 15 minutes. Beats the Leonardo Express from Termini in price.',
    ],
    faqs: [
      { q: 'Is Ostiense safe?', a: 'Generally yes — the area is well-populated thanks to the student presence and active nightlife. Some industrial blocks feel desolate at night, so favor streets near Eataly, Via Ostiense, or the Marconi metro. Standard city common sense applies.' },
      { q: 'How much is rent in Ostiense?', a: 'Mid-term verified 1-bedrooms typically range €1,000–€1,600/month. Two-bedrooms €1,400–€2,100. The best central-access value in Rome alongside Pigneto.' },
      { q: 'Is Ostiense good for students?', a: 'Excellent — Roma Tre university campus is here, LUISS is one tram away, and most apartments are within 10–15 minutes of campus. The cafés, libraries, and study-friendly bars are abundant.' },
      { q: 'How connected is Ostiense?', a: 'Very. Metro B (Piramide, Garbatella, Marconi), Ostiense rail station (FL1 to Fiumicino, regional to the rest of Italy), trams 3 and 8, plus reliable bus routes. You can reach almost anywhere in Rome in under 30 minutes.' },
      { q: 'What about Garbatella — same area?', a: 'Garbatella is technically a separate quarter but borders Ostiense. It\'s a small, beloved residential area built in the 1920s with English-garden-city architecture. Quieter, more residential, packed with classic trattorie. Many BOOM clients choose Garbatella for the calm and Ostiense for the access.' },
    ],
  },

  /* ─────────────────────────────────────────────────────── 8. TRIESTE / COPPEDÈ */
  {
    slug: 'trieste-coppede',
    name: 'Trieste & Coppedè',
    eyebrow: 'Rome Neighborhood Guide',
    shortVibe: 'Quiet, elegant, residential. Hidden architectural gems.',
    metaTitle: 'Apartments for Rent in Trieste & Coppedè, Rome | BOOM',
    metaDescription:
      'Trieste & Coppedè apartments for rent — one of Rome\'s most photogenic and peaceful districts. Liberty-style architecture, leafy streets. Verified from €1,200/mo.',
    keywords: ['apartment Trieste Rome', 'apartment Coppedè', 'rent Trieste Rome', 'Coppedè quarter'],
    geo: { lat: 41.9239, lng: 12.5075 },
    matchTerms: ['trieste', 'coppedè', 'coppede', 'salario'],
    stats: {
      rentMin: 1200, rentMax: 1800, walkScore: 7, vibeScore: 8, transitScore: 7,
    },
    audience: ['Remote workers', 'Families', 'Quiet seekers'],
    summary:
      'Rome\'s most photogenic backwater. Liberty-style mansions, leafy streets, the hidden Coppedè quarter. Bourgeois calm with no tourist density.',
    whyLiveHere: [
      'Trieste sits north of Termini and east of Villa Borghese — a planned bourgeois neighborhood built in the 1920s. Wide, tree-lined streets, mansion blocks with caryatids, and almost no foot traffic. The pace is slower than central Rome by a clear margin.',
      'Hidden inside is Quartiere Coppedè — a tiny enclosed enclave by architect Gino Coppedè, who combined Liberty, Art Nouveau, Medieval and Greek styles into a single fairy-tale compound. It\'s one of Rome\'s strangest architectural experiences, and most visitors never find it.',
      'Villa Ada — Rome\'s second-largest park (180 hectares) — borders the neighborhood. Villa Torlonia is on the western edge. The lifestyle is morning runs in the park, lunch at a corner bar, evenings on a quiet terrace.',
      'Best for: remote workers (calm + fibre internet + cafés), families, anyone who values quiet over central nightlife. Bus 80, 92, and 360 reach Centro in 15–20 minutes; metro B1 (Sant\'Agnese) and metro B (Bologna) are walkable.',
    ],
    landmarks: [
      { name: 'Quartiere Coppedè', blurb: 'The enclosed Liberty-style architectural enclave — a city in a city.' },
      { name: 'Villa Ada', blurb: 'Rome\'s second-largest park — 180 hectares of woods, lake, jogging trails.' },
      { name: 'Villa Torlonia', blurb: 'Mussolini\'s former residence, now a museum and a leafy park.' },
      { name: 'Catacombe di Priscilla', blurb: 'One of Rome\'s most important early-Christian catacombs.' },
      { name: 'Auditorium Parco della Musica', blurb: 'Renzo Piano\'s music complex — three concert halls in a park.' },
    ],
    insiderTips: [
      'Quartiere Coppedè\'s entrance is on Via Tagliamento — easy to miss. Look for the chandelier-arch on the southern side.',
      'Villa Ada is jogger heaven — 2.5km outer loop, free outdoor gym near the Salaria entrance.',
      'Best café: Bar Faro (Via Boncompagni) for breakfast, Sciascia (Prati, 10 min by tram) for the cappuccino.',
      'Auditorium has free outdoor jazz concerts in summer. Pre-show aperitivo at the Auditorium\'s café.',
      'Buses 80 and 92 are the connectors — 15 minutes to Termini, 20 to Piazza del Popolo.',
    ],
    faqs: [
      { q: 'Is Trieste a quiet neighborhood?', a: 'Yes — markedly quieter than Trastevere, Centro, or Monti. Tree-lined residential streets, low car traffic, and no nightlife concentration. Ideal for remote workers, families, and anyone who values sleep.' },
      { q: 'How much is rent in Trieste/Coppedè?', a: 'Mid-term verified 1-bedrooms typically range €1,200–€1,800/month. Two-bedrooms €1,600–€2,400. Coppedè-quarter apartments command a premium for the architectural setting (typically +20%).' },
      { q: 'How long does it take to get to Centro from Trieste?', a: '15–25 minutes by bus (80, 92, 360 to Termini or Piazza del Popolo), 20 minutes by metro (Sant\'Agnese B1 → Termini). Walking to Villa Borghese\'s northern edge takes 10 minutes.' },
      { q: 'Is Trieste good for families?', a: 'Excellent. Quiet streets, several parks within walking distance (Villa Ada, Villa Torlonia, Villa Glori), good schools (state and international), pediatricians and pharmacies on most blocks. One of Rome\'s most family-friendly neighborhoods.' },
      { q: 'What\'s special about the Coppedè quarter?', a: 'It\'s a tiny architectural enclave (1916–1927) by Gino Coppedè — Liberty, Art Nouveau, Medieval, Greek motifs in one mash-up. Three streets, a central fountain, gargoyles and chandeliers. Most Romans haven\'t seen it.' },
    ],
  },

  /* ─────────────────────────────────────────────────────── 9. SAN LORENZO */
  {
    slug: 'san-lorenzo',
    name: 'San Lorenzo',
    eyebrow: 'Rome Neighborhood Guide',
    shortVibe: 'University. Cheap. Raucous. Not for the prim.',
    metaTitle: 'Apartments for Rent in San Lorenzo, Rome — Student + Affordable | BOOM',
    metaDescription:
      'San Lorenzo apartments for rent — Rome\'s university district, walking distance from Termini and Sapienza. Cheapest central rents, wild nightlife. Verified, from €800/mo.',
    keywords: ['apartment San Lorenzo Rome', 'rent San Lorenzo', 'Sapienza apartment', 'student apartment Rome'],
    geo: { lat: 41.8993, lng: 12.5147 },
    matchTerms: ['san lorenzo'],
    stats: {
      rentMin: 800, rentMax: 1400, walkScore: 9, vibeScore: 8, transitScore: 8,
    },
    audience: ['Students', 'Budget-tight', 'Night owls'],
    summary:
      'Sapienza is across the street. Rent is the cheapest of any central area. Weekends are loud and not negotiable. Anti-fascist murals on every block.',
    whyLiveHere: [
      'San Lorenzo sits between Termini Station and Sapienza University — Rome\'s largest. The proximity made it the city\'s student quarter since the 1960s, and the demographics still set the tone: cheap rent, packed bars, weekend chaos, political graffiti everywhere.',
      'It\'s also one of Rome\'s most diverse neighborhoods — Eritrean, Chinese, Bangladeshi restaurants alongside Roman trattorie. Pommidoro is the legendary cacio e pepe place where Pasolini ate. Bar San Calisto has spritz for €2. The Verano cemetery is more atmospheric than any park.',
      'Connections are unbeatable: 10 minutes\' walk to Termini (all metro lines, all trains), 5 minutes to Sapienza, tram 19 to Prati, tram 3 to Trastevere. You can live without a car easily.',
      'Best for: students, recent grads, anyone whose budget is the binding constraint. Cheaper than Pigneto and central; the trade-off is weekend noise, political tension, and a neighborhood that doesn\'t pretend to be polished.',
    ],
    landmarks: [
      { name: 'Sapienza University', blurb: 'Italy\'s largest university (110,000 students) — the demographic engine of the neighborhood.' },
      { name: 'Cimitero del Verano', blurb: 'Monumental cemetery — 83 hectares of cypresses, mausoleums, and quiet.' },
      { name: 'Basilica di San Lorenzo fuori le Mura', blurb: 'The neighborhood\'s namesake basilica, 4th century, bomb-damaged WWII, restored.' },
      { name: 'Via dei Volsci', blurb: 'The bar-lined main artery — student aperitivo central.' },
      { name: 'Pastificio Cerere', blurb: 'Former pasta factory turned art-gallery and studio complex.' },
    ],
    insiderTips: [
      'For eating: Pommidoro (cacio e pepe), Tram Depot (pizza al taglio), Said dal 1923 (chocolate factory + café).',
      'Bar San Calisto for cheap spritz, Caffè Letterario Verano for the bookish crowd, Esc Atelier for politics-and-beer.',
      'Termini Station 10 minutes\' walk — all metro lines, all trains. No need for a metro stop inside San Lorenzo.',
      'Avoid the blocks west of Via Tiburtina late at night solo — not unsafe, just less pleasant.',
      'Verano cemetery is open 7:30am–6pm and is more interesting than most Roman parks. Free entry.',
    ],
    faqs: [
      { q: 'Is San Lorenzo safe?', a: 'Mixed — daytime is fine, nightlife streets stay busy until 2am which keeps them safe. But after the bars close, the side streets get quiet and petty-theft risk rises. Solo walking late at night is best on well-lit main arteries. Police presence is increasing.' },
      { q: 'How much is rent in San Lorenzo?', a: 'The cheapest central area — mid-term verified 1-bedrooms typically €800–€1,400/month. Shared rooms from €400. Two-bedrooms €1,200–€1,800. Apartments in the better-maintained palazzi near Via dei Marsi command a premium.' },
      { q: 'Is San Lorenzo good for students?', a: 'Perfect — Sapienza is across the street, LUISS is 15 minutes away by tram, and the entire neighborhood is structured around student life (libraries, study cafés, late-opening copy shops, takeout places open until 3am).' },
      { q: 'How noisy is San Lorenzo on weekends?', a: 'Very. Friday and Saturday nights see thousands of students on Via dei Volsci and Via degli Equi until 2–3am. If you need quiet sleep, choose an apartment one or two streets back from the main bar arteries.' },
      { q: 'Is San Lorenzo good for families?', a: 'Not really — the demographic and rhythm doesn\'t suit. Families looking for similar prices and central access usually prefer Pigneto (calmer) or Trieste (much quieter, slightly more expensive).' },
    ],
  },

  /* ─────────────────────────────────────────────────────── 10. ESQUILINO */
  {
    slug: 'esquilino',
    name: 'Esquilino',
    eyebrow: 'Rome Neighborhood Guide',
    shortVibe: 'Multicultural, gritty, fascinating. Rome\'s real melting pot.',
    metaTitle: 'Apartments for Rent in Esquilino, Rome — Central + Diverse | BOOM',
    metaDescription:
      'Esquilino apartments for rent — Rome\'s most multicultural central district. Termini-adjacent, both metro lines, Santa Maria Maggiore. Verified from €900/mo.',
    keywords: ['apartment Esquilino Rome', 'rent Esquilino', 'Termini apartment Rome', 'central Rome budget'],
    geo: { lat: 41.8954, lng: 12.5021 },
    matchTerms: ['esquilino', 'piazza vittorio', 'termini'],
    stats: {
      rentMin: 900, rentMax: 1500, walkScore: 10, vibeScore: 7, transitScore: 10,
    },
    audience: ['International', 'Budget-conscious', 'Well-traveled'],
    summary:
      'Cheap, central, ridiculously well-connected. Termini = all trains, both metro lines. Asian groceries, African restaurants, the city\'s real melting pot.',
    whyLiveHere: [
      'Esquilino covers the largest of Rome\'s seven hills and surrounds Termini Station. It\'s the most demographically diverse central neighborhood — Chinese, Bangladeshi, Eritrean, Filipino, Romanian, North African communities all rooted here for decades.',
      'The architecture is severe — late-19th-century Umbertine apartment blocks rather than Renaissance palazzi. The trade-off is huge rooms (8m ceilings, original parquet), central postcodes, and rents 30–40% below comparable Centro space.',
      'Connectivity is unbeatable in the entire city: Termini (every train in Italy + both metro lines + every airport bus), Vittorio Emanuele metro (line A), Manzoni (line A), the night-bus hub. You can be on a train to Naples or a metro to the Vatican in 5 minutes.',
      'Best for: well-traveled internationals (the area feels less Italian-claustrophobic than other quarters), budget-conscious workers, anyone whose life involves frequent trains. The grittier blocks west of Termini balance with the calm of the residential Piazza Vittorio side to the east.',
    ],
    landmarks: [
      { name: 'Santa Maria Maggiore', blurb: 'One of Rome\'s four major basilicas — 5th-century mosaics, soaring nave.' },
      { name: 'Piazza Vittorio Emanuele II', blurb: 'Rome\'s largest central piazza — porticoed, leafy, the social heart of Esquilino.' },
      { name: 'Mercato Esquilino', blurb: 'Rome\'s most diverse food market — every cuisine, every spice, every produce in the city.' },
      { name: 'Trofei di Mario', blurb: 'Ancient Roman ruins in the middle of Piazza Vittorio\'s garden.' },
      { name: 'Termini Station', blurb: 'Italy\'s main rail hub — both metro lines, every airport bus, every train south.' },
    ],
    insiderTips: [
      'Mercato Esquilino (Via Mamiani, daily) has Rome\'s widest food selection. Sundays for the international crowd; weekdays for the Italian stalls.',
      'For food: Ristorante Hang Zhou (Sichuan), Trattoria Monti (Marche regional), Doozo (Japanese), Africa (Eritrean).',
      'Choose your block carefully — east of Termini (Piazza Vittorio side) is calm and residential. West of Termini is grittier.',
      'Santa Maria Maggiore interior — go in the morning, light hits the 5th-century mosaics best then.',
      'Termini night-bus hub: routes N1, N2, N5, N7 cover the city all night. Useful if you ever miss the last metro.',
    ],
    faqs: [
      { q: 'Is Esquilino safe?', a: 'It varies by block more than any other central neighborhood. The Piazza Vittorio side (east of Termini) is residential and safe. The blocks immediately west of Termini and around Via Giolitti are grittier and require more attention, especially late at night. BOOM places clients on the safer streets only.' },
      { q: 'How much does an apartment in Esquilino cost?', a: 'Mid-term verified 1-bedrooms typically range €900–€1,500/month. Large 2-bedrooms in the Umbertine palazzi (often 100m²+) €1,400–€2,200. Best size-per-euro ratio in central Rome.' },
      { q: 'How connected is Esquilino?', a: 'The most connected neighborhood in Rome. Termini Station serves every train in Italy and both metro lines. You can be at Fiumicino airport in 32 minutes, Florence in 1h30, the Vatican in 12 minutes by metro.' },
      { q: 'Is Esquilino good for first-time expats?', a: 'It works well for well-traveled, urban-comfortable expats. The diversity and intensity can feel overwhelming for first-time Rome residents — many start in Prati or Trieste before moving to Esquilino once they know the city.' },
      { q: 'What\'s the best part of Esquilino?', a: 'The streets around Piazza Vittorio (Via Carlo Alberto, Via Cairoli, Via Principe Eugenio) — porticoed, leafy, calm. The Umbertine apartments here offer the best floor-plans-per-euro in the central city.' },
    ],
  },
];

module.exports = { NEIGHBORHOODS };
