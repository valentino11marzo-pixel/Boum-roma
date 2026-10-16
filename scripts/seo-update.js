#!/usr/bin/env node
/**
 * BOOM Rome — SEO updater.
 *
 * Reads scripts/seo-config.js and rewrites the <head> of each public page:
 *   - canonical, title, description, keywords, robots
 *   - Open Graph (title/description/image/url/type/locale/site_name)
 *   - Twitter Card (summary_large_image)
 *   - theme-color, color-scheme
 *   - JSON-LD structured data (Organization, WebSite, BreadcrumbList,
 *     plus per-page type — Apartment, FAQPage, BlogPosting, Service, …)
 *
 * Idempotent: a `BOOM_SEO` sentinel block is replaced on each run.
 *
 * Run:
 *   node scripts/seo-update.js              # process all pages
 *   node scripts/seo-update.js apartments   # process matching files
 *   node scripts/seo-update.js --dry        # show diffs only
 */

const fs = require('fs');
const path = require('path');
const { SITE, PAGES } = require('./seo-config');

const ROOT = path.resolve(__dirname, '..');
const SENTINEL_OPEN = '<!-- BOOM_SEO:START -->';
const SENTINEL_CLOSE = '<!-- BOOM_SEO:END -->';
const JSONLD_OPEN = '<!-- BOOM_JSONLD:START -->';
const JSONLD_CLOSE = '<!-- BOOM_JSONLD:END -->';
const JSONLD_SLOT = '<!-- BOOM_JSONLD:SLOT -->';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const filterArg = args.find((a) => !a.startsWith('--'));

/* ────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function absoluteUrl(p) {
  if (!p) return SITE.ORIGIN;
  if (/^https?:/.test(p)) return p;
  return SITE.ORIGIN + (p.startsWith('/') ? p : '/' + p);
}

function buildKeywords(arr) {
  if (!arr || !arr.length) return '';
  return arr.join(', ');
}

/* ────────────────────────────────────────────────────────────────────────
 * Common JSON-LD building blocks
 * ──────────────────────────────────────────────────────────────────────── */

function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': SITE.ORIGIN + '/#organization',
    name: SITE.BRAND,
    legalName: 'Egidi Immobiliare S.r.l.',
    vatID: 'IT17322991005',
    telephone: '+39-331-325-1961',
    url: SITE.ORIGIN,
    logo: {
      '@type': 'ImageObject',
      url: SITE.ORIGIN + '/android-chrome-512x512.png',
      width: 512,
      height: 512,
    },
    image: SITE.DEFAULT_OG_IMAGE,
    description:
      'Premium mid-term apartment rentals in Rome with full property management, legal contracts, and 48-hour move-in.',
    sameAs: [
      'https://www.instagram.com/boomrome',
      'https://www.linkedin.com/company/boomrome',
      'https://wa.me/393313251961',
    ],
    // La sede legale vera, nello stesso ordine di chiavi che le pagine
    // pubblicano (ORG-FIX): un indirizzo inventato qui tornerebbe su ogni
    // pagina al primo giro del generatore.
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Via dei Coronari 181/184',
      postalCode: '00186',
      addressLocality: 'Roma',
      addressRegion: 'RM',
      addressCountry: 'IT',
    },
    areaServed: { '@type': 'City', name: 'Rome' },
    priceRange: '€€-€€€',
  };
}

function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE.ORIGIN + '/#website',
    url: SITE.ORIGIN,
    name: SITE.BRAND,
    publisher: { '@id': SITE.ORIGIN + '/#organization' },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: SITE.ORIGIN + '/apartments?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
    inLanguage: ['en', 'it'],
  };
}

function breadcrumbJsonLd(items) {
  if (!items || !items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: absoluteUrl(b.url),
    })),
  };
}

function apartmentJsonLd(data, canonicalUrl) {
  if (!data) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Apartment',
    name: data.name,
    description: data.tagline,
    url: canonicalUrl,
    numberOfBedrooms: data.bedrooms,
    floorSize: { '@type': 'QuantitativeValue', value: data.size, unitCode: 'MTK' },
    address: {
      '@type': 'PostalAddress',
      streetAddress: data.neighborhood,
      addressLocality: 'Rome',
      addressRegion: 'Lazio',
      addressCountry: 'IT',
    },
    geo: data.geo
      ? { '@type': 'GeoCoordinates', latitude: data.geo.lat, longitude: data.geo.lng }
      : undefined,
    containedInPlace: { '@type': 'Place', name: data.neighborhood, address: { '@type': 'PostalAddress', addressLocality: 'Rome', addressCountry: 'IT' } },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'EUR',
      price: data.rentMin,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: data.rentMin,
        priceCurrency: 'EUR',
        unitText: 'MONTH',
        ...(data.rentMax && data.rentMax > data.rentMin
          ? { maxPrice: data.rentMax, minPrice: data.rentMin }
          : {}),
      },
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
      seller: { '@id': SITE.ORIGIN + '/#organization' },
    },
  };
}

function blogPostingJsonLd(cfg, canonicalUrl) {
  const a = cfg.article || {};
  // Stesso nodo che le pagine pubblicano: @id stabile (il Blog lo elenca),
  // autore = l'entita' vera, non un secondo "Organization" senza @id.
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': canonicalUrl + '#article',
    headline: a.headline || cfg.title.split(' | ')[0],
    description: cfg.description,
    image: SITE.DEFAULT_OG_IMAGE,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    datePublished: a.datePublished || undefined,
    dateModified: a.dateModified || a.datePublished || undefined,
    author: { '@id': SITE.ORIGIN + '/#organization' },
    publisher: { '@id': SITE.ORIGIN + '/#organization' },
    inLanguage: 'en',
    isPartOf: { '@id': SITE.ORIGIN + '/blog#blog' },
  };
}

// Le cinque domande della home, parola per parola come index.html le
// mostra e le dichiara: una risposta che il generatore riscrivesse a modo suo
// (commissione negata, codice fiscale «in 24–48 ore», 4+4 e foresteria) sarebbe
// una frase che la pagina non dice.
function faqPageJsonLd() {
  const QA = [
    [
      'How fast can I move into a BOOM apartment in Rome?',
      'Move-in can be as fast as 48 hours from approval on a home that is free now, once the lease is signed and the amount due at signing has arrived. Cases with visas or many documents take longer.',
    ],
    [
      'Does BOOM charge broker fees?',
      "BOOM charges one agency fee: 10% of one year's rent plus 22% VAT (12.2% of a year's rent in all), charged once and written into your pre-agreement before a single euro moves. The optional Property Finding Service is a flat €350, deducted from the agency fee on success and refunded in full if we don't present at least 3 matching options within 15 days.",
    ],
    [
      'What contracts does BOOM use in Rome?',
      'Fully legal Italian contracts — transitorio (1–18 months), rent-controlled 3+2 and student formats. Every contract is registered with the Agenzia delle Entrate.',
    ],
    [
      'Can I view a Rome apartment remotely before signing?',
      'Yes. Live video viewings of BOOM homes are free — you ask the questions, we walk the flat. You can sign remotely from your phone with the Magic Sign system.',
    ],
    [
      'Do I need a codice fiscale to rent in Rome?',
      "Yes — every legal rental contract in Italy requires a codice fiscale. It is free at any Agenzia delle Entrate office (form AA4/8, usually the same day), and non-EU citizens can often get it from the Italian consulate before leaving. If you'd rather not queue, BOOM's Concierge can obtain it remotely before you land.",
    ],
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: QA.map(([name, text]) => ({
      '@type': 'Question',
      name,
      acceptedAnswer: { '@type': 'Answer', text },
    })),
  };
}

function howToJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to rent a verified apartment in Rome with BOOM',
    description:
      'Three steps from search to keys: browse verified listings, book a viewing, sign legally — move in as fast as 48 hours from approval when the home is free.',
    totalTime: 'P2D',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Browse verified apartments',
        text:
          'Search BOOM\'s database of video-verified apartments by neighborhood, budget, and contract type.',
        url: SITE.ORIGIN + '/apartments',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Book a viewing',
        text:
          'Choose an in-person or live video viewing. BOOM\'s team confirms the apartment exactly matches the listing.',
        url: SITE.ORIGIN + '/book',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Sign and move in',
        text:
          'Sign a registered Italian contract online with BOOM magic-sign. Receive keys: as fast as 48 hours from approval when the home is free.',
        url: SITE.ORIGIN + '/how-it-works',
      },
    ],
  };
}

function serviceJsonLd(serviceKey, canonicalUrl) {
  const M = {
    concierge: {
      name: 'BOOM Rome Concierge',
      description:
        'Airport pickups, bureaucracy navigation, household setup, codice fiscale, and daily expat support in Rome.',
      type: 'Concierge',
    },
    dealAssistance: {
      name: 'Rome Rental Contract Review in English — Deal Assistance',
      description:
        'A clause-by-clause review in English of an Italian rental contract, with landlord and ownership verification and negotiation before signing. €249; first review within 24 hours.',
      type: 'Rome rental contract review and negotiation',
      price: '249',
    },
    propertyFinding: {
      name: 'Property Finder Rome — Apartment Search Service',
      description:
        'A local property finder searches every portal and off-market Rome homes, vets each match and negotiates. €350 flat fee; at least 3 matching options within 15 days or a full refund.',
      type: 'Property finding and apartment search',
      price: '350',
    },
    virtualViewing: {
      name: 'Virtual Apartment Viewing Rome — Live Video Tour',
      description:
        'A BOOM agent walks any Rome apartment live on video while the client directs the tour, then sends HD photos and an honest report with red-flag checks.',
      type: 'Virtual apartment viewing in Rome',
      price: '89',
    },
    propertyManagement: {
      name: 'Premium Property Management',
      description:
        'End-to-end property management for Rome landlords: tenant screening, legal contracts, rent collection, maintenance.',
      type: 'PropertyManagement',
    },
  };
  const s = M[serviceKey];
  if (!s) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: s.type,
    name: s.name,
    description: s.description,
    url: canonicalUrl,
    provider: { '@id': SITE.ORIGIN + '/#organization' },
    areaServed: { '@type': 'City', name: 'Rome' },
    ...(s.price
      ? {
          offers: {
            '@type': 'Offer',
            price: s.price,
            priceCurrency: 'EUR',
            url: canonicalUrl,
          },
        }
      : {}),
  };
}

function collectionPageJsonLd(canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: canonicalUrl,
    name: 'Apartments for rent in Rome',
    description:
      'Video-verified apartments for rent in Rome across Centro Storico, Trastevere, Pigneto, Monti, Prati and more.',
    isPartOf: { '@id': SITE.ORIGIN + '/#website' },
    about: { '@type': 'Place', name: 'Rome' },
  };
}

function aboutPageJsonLd(canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    url: canonicalUrl,
    name: 'About BOOM Rome',
    mainEntity: { '@id': SITE.ORIGIN + '/#organization' },
  };
}

function contactPageJsonLd(canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    url: canonicalUrl,
    name: 'Contact BOOM Rome',
    mainEntity: { '@id': SITE.ORIGIN + '/#organization' },
  };
}

function blogIndexJsonLd(canonicalUrl) {
  // blogPost: gli @id degli articoli, derivati dal registro (ogni voce con
  // schema BlogPosting) — mai una lista a mano che invecchia al primo post.
  const blogPost = Object.values(PAGES)
    .filter((c) => (c.schemas || []).includes('BlogPosting'))
    .map((c) => ({ '@id': absoluteUrl(c.path) + '#article' }));
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': SITE.ORIGIN + '/blog#blog',
    url: canonicalUrl,
    name: 'BOOM Blog',
    description: 'Rome rental guides, expat advice, scam protection, contracts and bureaucracy.',
    inLanguage: 'en',
    publisher: { '@id': SITE.ORIGIN + '/#organization' },
    blogPost,
  };
}

function neighborhoodJsonLd(n, canonicalUrl) {
  if (!n) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    '@id': canonicalUrl + '#place',
    name: n.name,
    description: n.summary,
    url: canonicalUrl,
    address: {
      '@type': 'PostalAddress',
      streetAddress: n.name,
      addressLocality: 'Rome',
      addressRegion: 'Lazio',
      addressCountry: 'IT',
    },
    ...(n.geo ? { geo: { '@type': 'GeoCoordinates', latitude: n.geo.lat, longitude: n.geo.lng } } : {}),
    containedInPlace: { '@type': 'City', name: 'Rome' },
    additionalProperty: [
      // Fascia indicativa del CHIESTO, dichiarata tale (come la pagina e
      // le FAQ): la misura vera sta in /meteo. Dove il catalogo BOOM smentisce
      // la forchetta (rentRangeUnreliable) il Place non la dichiara affatto:
      // la pagina dice «Varies by building», e un motore legge questo nodo
      // come un dato.
      ...(n.rentRangeUnreliable ? [] : [
        { '@type': 'PropertyValue', name: 'Indicative asking rent (1-bed, EUR/month), not a measured statistic', minValue: n.stats.rentMin, maxValue: n.stats.rentMax, unitText: 'EUR' },
      ]),
      { '@type': 'PropertyValue', name: 'Walkability', value: `${n.stats.walkScore}/10` },
      { '@type': 'PropertyValue', name: 'Vibe', value: `${n.stats.vibeScore}/10` },
      { '@type': 'PropertyValue', name: 'Transit', value: `${n.stats.transitScore}/10` },
    ],
  };
}

function neighborhoodFaqJsonLd(n) {
  if (!n || !n.faqs) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: n.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function neighborhoodsCollectionJsonLd(canonicalUrl, cfg) {
  let items = [];
  try {
    items = require('./neighborhoods-data').NEIGHBORHOODS.map((n, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: n.name,
      url: SITE.ORIGIN + '/apartments-in/' + n.slug,
    }));
  } catch {}
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: canonicalUrl,
    name: 'Rome Neighborhoods — Apartment Rentals',
    description: (cfg && cfg.description) || 'BOOM\'s guides to renting in Rome\'s neighborhoods.',
    isPartOf: { '@id': SITE.ORIGIN + '/#website' },
    about: { '@type': 'Place', name: 'Rome' },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Compose JSON-LD for a single page
 * ──────────────────────────────────────────────────────────────────────── */
function composeJsonLd(file, cfg, canonicalUrl) {
  const blocks = [];
  blocks.push(organizationJsonLd());
  blocks.push(websiteJsonLd());

  if (cfg.breadcrumbs && cfg.breadcrumbs.length > 1) {
    blocks.push(breadcrumbJsonLd(cfg.breadcrumbs));
  }

  for (const schema of cfg.schemas || []) {
    const [type, key] = schema.split(':');
    switch (type) {
      case 'CollectionPage':
        if (key === 'neighborhoods') blocks.push(neighborhoodsCollectionJsonLd(canonicalUrl, cfg));
        else blocks.push(collectionPageJsonLd(canonicalUrl));
        break;
      case 'Neighborhood':
        blocks.push(neighborhoodJsonLd(cfg.neighborhoodData, canonicalUrl));
        break;
      case 'Apartment':
        blocks.push(apartmentJsonLd(cfg.apartmentData, canonicalUrl));
        break;
      case 'FAQPage': {
        // Per-neighborhood FAQs are sourced from neighborhoodData; otherwise
        // fall through to the curated brand FAQ.
        if (cfg.neighborhoodData) {
          const nf = neighborhoodFaqJsonLd(cfg.neighborhoodData);
          if (nf) blocks.push(nf);
        } else {
          blocks.push(faqPageJsonLd());
        }
        break;
      }
      case 'HowTo':
        blocks.push(howToJsonLd());
        break;
      case 'Service':
        blocks.push(serviceJsonLd(key, canonicalUrl));
        break;
      case 'AboutPage':
        blocks.push(aboutPageJsonLd(canonicalUrl));
        break;
      case 'ContactPage':
        blocks.push(contactPageJsonLd(canonicalUrl));
        break;
      case 'Blog':
        blocks.push(blogIndexJsonLd(canonicalUrl));
        break;
      case 'BlogPosting':
        blocks.push(blogPostingJsonLd(cfg, canonicalUrl));
        break;
      case 'DynamicApartment':
        // Injected client-side from Firestore — see apartment-detail.html script.
        break;
      default:
        break;
    }
  }

  return blocks.filter(Boolean);
}

/* ────────────────────────────────────────────────────────────────────────
 * Build the SEO meta block
 * ──────────────────────────────────────────────────────────────────────── */
function buildMetaBlock(file, cfg) {
  const canonical = absoluteUrl(cfg.path);
  const desc = cfg.description || '';
  const lang = cfg.lang || 'en';
  const locale = cfg.locale || SITE.DEFAULT_LOCALE;
  const ogImage = cfg.ogImage || SITE.DEFAULT_OG_IMAGE;
  const robots = cfg.robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  const ogType = cfg.type === 'article' ? 'article' : 'website';

  const lines = [];
  lines.push(SENTINEL_OPEN);
  lines.push(`  <meta name="description" content="${escapeHtml(desc)}">`);
  if (cfg.keywords && cfg.keywords.length) {
    lines.push(`  <meta name="keywords" content="${escapeHtml(buildKeywords(cfg.keywords))}">`);
  }
  lines.push(`  <meta name="robots" content="${robots}">`);
  lines.push(`  <meta name="googlebot" content="${robots}">`);
  lines.push(`  <meta name="author" content="${escapeHtml(SITE.BRAND)}">`);
  lines.push(`  <meta name="publisher" content="${escapeHtml(SITE.PUBLISHER_NAME)}">`);
  lines.push(`  <meta name="theme-color" content="${SITE.THEME_COLOR}">`);
  lines.push(`  <meta name="color-scheme" content="dark">`);
  lines.push(`  <meta name="format-detection" content="telephone=no">`);
  lines.push(`  <meta name="application-name" content="${escapeHtml(SITE.BRAND)}">`);
  lines.push(`  <meta name="apple-mobile-web-app-title" content="BOOM">`);
  lines.push(`  <meta name="apple-mobile-web-app-capable" content="yes">`);
  lines.push(`  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`);
  lines.push(`  <meta name="msapplication-TileColor" content="${SITE.THEME_COLOR}">`);

  // Canonical + alternates
  lines.push(`  <link rel="canonical" href="${canonical}">`);
  if (lang === 'it' || cfg.path === '/owners') {
    lines.push(`  <link rel="alternate" hreflang="it" href="${canonical}">`);
    lines.push(`  <link rel="alternate" hreflang="x-default" href="${canonical}">`);
  }

  // Open Graph
  lines.push(`  <meta property="og:type" content="${ogType}">`);
  lines.push(`  <meta property="og:site_name" content="${escapeHtml(SITE.BRAND)}">`);
  lines.push(`  <meta property="og:locale" content="${locale}">`);
  if (lang === 'it') {
    lines.push(`  <meta property="og:locale:alternate" content="en_US">`);
  } else {
    lines.push(`  <meta property="og:locale:alternate" content="it_IT">`);
  }
  lines.push(`  <meta property="og:title" content="${escapeHtml(cfg.title)}">`);
  lines.push(`  <meta property="og:description" content="${escapeHtml(desc)}">`);
  lines.push(`  <meta property="og:url" content="${canonical}">`);
  lines.push(`  <meta property="og:image" content="${ogImage}">`);
  lines.push(`  <meta property="og:image:secure_url" content="${ogImage}">`);
  lines.push(`  <meta property="og:image:type" content="image/png">`);
  lines.push(`  <meta property="og:image:width" content="1200">`);
  lines.push(`  <meta property="og:image:height" content="630">`);
  lines.push(`  <meta property="og:image:alt" content="${escapeHtml(cfg.title)}">`);
  if (ogType === 'article' && cfg.article) {
    if (cfg.article.datePublished) {
      lines.push(`  <meta property="article:published_time" content="${cfg.article.datePublished}">`);
    }
    if (cfg.article.dateModified) {
      lines.push(`  <meta property="article:modified_time" content="${cfg.article.dateModified}">`);
    }
    lines.push(`  <meta property="article:author" content="${escapeHtml(SITE.BRAND)}">`);
    lines.push(`  <meta property="article:publisher" content="${SITE.ORIGIN}">`);
    lines.push(`  <meta property="article:section" content="Rome Rental Guides">`);
  }

  // Twitter
  lines.push(`  <meta name="twitter:card" content="summary_large_image">`);
  lines.push(`  <meta name="twitter:site" content="${SITE.TWITTER_HANDLE}">`);
  lines.push(`  <meta name="twitter:creator" content="${SITE.TWITTER_HANDLE}">`);
  lines.push(`  <meta name="twitter:title" content="${escapeHtml(cfg.title)}">`);
  lines.push(`  <meta name="twitter:description" content="${escapeHtml(desc)}">`);
  lines.push(`  <meta name="twitter:image" content="${ogImage}">`);
  lines.push(`  <meta name="twitter:image:alt" content="${escapeHtml(cfg.title)}">`);

  // Perf hints
  lines.push(`  <link rel="preconnect" href="https://fonts.googleapis.com">`);
  lines.push(`  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`);
  lines.push(`  <link rel="dns-prefetch" href="https://www.googletagmanager.com">`);
  lines.push(`  <link rel="dns-prefetch" href="https://www.google-analytics.com">`);

  lines.push(SENTINEL_CLOSE);
  return lines.join('\n');
}

function buildJsonLdBlock(blocks) {
  if (!blocks.length) return '';
  const inner = blocks
    .map((b) => `  <script type="application/ld+json">\n${JSON.stringify(b, null, 2)}\n  </script>`)
    .join('\n');
  return `${JSONLD_OPEN}\n${inner}\n${JSONLD_CLOSE}`;
}

/* ────────────────────────────────────────────────────────────────────────
 * Strip existing SEO tags so the new block is the single source of truth
 * ──────────────────────────────────────────────────────────────────────── */
function stripExisting(head) {
  // 1) Remove any prior sentinel block + JSON-LD block
  head = head.replace(
    new RegExp(`${escapeRegex(SENTINEL_OPEN)}[\\s\\S]*?${escapeRegex(SENTINEL_CLOSE)}\\n?`, 'g'),
    ''
  );
  head = head.replace(
    new RegExp(`${escapeRegex(JSONLD_OPEN)}[\\s\\S]*?${escapeRegex(JSONLD_CLOSE)}\\n?`, 'g'),
    ''
  );

  // 2) Remove standalone meta/link tags we will re-emit
  const patterns = [
    /<meta\s+name=["']description["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']keywords["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']robots["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']googlebot["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']author["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']publisher["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']theme-color["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']color-scheme["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']application-name["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']apple-mobile-web-app-title["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']apple-mobile-web-app-capable["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']apple-mobile-web-app-status-bar-style["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']msapplication-TileColor["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']format-detection["'][^>]*>\s*\n?/gi,
    /<meta\s+property=["']og:[^"']+["'][^>]*>\s*\n?/gi,
    /<meta\s+property=["']article:[^"']+["'][^>]*>\s*\n?/gi,
    /<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*\n?/gi,
    /<link\s+rel=["']canonical["'][^>]*>\s*\n?/gi,
    /<link\s+rel=["']alternate["'][^>]*hreflang[^>]*>\s*\n?/gi,
  ];
  for (const re of patterns) head = head.replace(re, '');

  return head;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ────────────────────────────────────────────────────────────────────────
 * Main per-file processor
 * ──────────────────────────────────────────────────────────────────────── */
function processFile(file, cfg) {
  // Una pagina con la testa scritta a mano (bilingue, JSON-LD propri) non si
  // riscrive: stripExisting() ne cancellerebbe hreflang e dati strutturati.
  if (cfg.manualHead) {
    console.log(`[manual] ${file} — testa scritta a mano, saltata`);
    return null;
  }
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) {
    console.warn(`[skip] ${file} — not found`);
    return null;
  }

  const original = fs.readFileSync(fp, 'utf8');

  const headMatch = original.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) {
    console.warn(`[skip] ${file} — no <head>`);
    return null;
  }

  const headOpen = original.match(/<head[^>]*>/i)[0];
  let headContent = headMatch[1];

  // Update <html lang="…"> if a non-default lang is configured
  let result = original;
  if (cfg.lang) {
    result = result.replace(/<html\b[^>]*\blang=["'][^"']*["']/i, `<html lang="${cfg.lang}"`);
    if (!/<html\b[^>]*\blang=/.test(result)) {
      result = result.replace(/<html\b/i, `<html lang="${cfg.lang}"`);
    }
  }

  // Il blocco JSON-LD esistente resta DOV'E' (le pagine hanno altri blocchi
  // dopo, es. BOOM_SCROLL): si marca il posto, si ripulisce, e il blocco
  // nuovo torna in quel posto. Solo una pagina che non l'aveva lo riceve in
  // coda alla <head>.
  const jsonLdRe = new RegExp(`${escapeRegex(JSONLD_OPEN)}[\\s\\S]*?${escapeRegex(JSONLD_CLOSE)}`);
  if (jsonLdRe.test(headContent)) headContent = headContent.replace(jsonLdRe, JSONLD_SLOT);

  // Strip old SEO
  headContent = stripExisting(headContent);

  // Replace <title> with the new canonical title (or insert if absent)
  if (/<title>[\s\S]*?<\/title>/i.test(headContent)) {
    headContent = headContent.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(cfg.title)}</title>`);
  } else {
    headContent = `<title>${escapeHtml(cfg.title)}</title>\n` + headContent;
  }

  // Build new blocks
  const metaBlock = buildMetaBlock(file, cfg);
  const jsonLdBlocks = composeJsonLd(file, cfg, absoluteUrl(cfg.path));
  const jsonLdBlock = buildJsonLdBlock(jsonLdBlocks);

  // Inject SEO block after <title>
  if (/<title>[\s\S]*?<\/title>/i.test(headContent)) {
    headContent = headContent.replace(
      /(<title>[\s\S]*?<\/title>)/i,
      `$1\n${metaBlock}`
    );
  } else {
    headContent = `${metaBlock}\n` + headContent;
  }

  // JSON-LD: al suo posto se c'era, altrimenti in coda alla <head>
  if (headContent.includes(JSONLD_SLOT)) {
    headContent = headContent.replace(JSONLD_SLOT, () => jsonLdBlock);
  } else {
    headContent = headContent.replace(/\n*$/, '') + '\n' + (jsonLdBlock ? jsonLdBlock + '\n' : '');
  }

  // Rebuild
  const newHead = `${headOpen}${headContent}</head>`;
  result = result.replace(/<head[^>]*>[\s\S]*?<\/head>/i, newHead);

  if (result === original) {
    return { file, changed: false };
  }

  if (!DRY) {
    fs.writeFileSync(fp, result, 'utf8');
  }
  return { file, changed: true };
}

/* ────────────────────────────────────────────────────────────────────────
 * Driver
 * ──────────────────────────────────────────────────────────────────────── */
const entries = Object.entries(PAGES);
const filtered = filterArg ? entries.filter(([f]) => f.includes(filterArg)) : entries;

let touched = 0;
let total = 0;
for (const [file, cfg] of filtered) {
  total++;
  const res = processFile(file, cfg);
  if (res && res.changed) {
    touched++;
    console.log(`[✓] ${file}`);
  } else if (res && !res.changed) {
    console.log(`[=] ${file}`);
  }
}

console.log(`\n${touched}/${total} files updated${DRY ? ' (dry run — nothing written)' : ''}.`);
