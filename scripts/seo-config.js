/**
 * BOOM Rome — SEO master configuration.
 *
 * Drives scripts/seo-update.js. Edit values here, then run:
 *   node scripts/seo-update.js
 *
 * Adding a page: append an entry keyed by its filename. Required fields are
 * `path` (the canonical URL path, no domain) and `title`. Everything else
 * has sensible defaults.
 */

const ORIGIN = 'https://www.boomrome.com';
const BRAND = 'BOOM Rome';
// og-home.png ESISTE ed e' generata dal repo (design/pages-deco/
// genera-og-home.py). BOOMsocialprofile.png non e' mai esistito: 50
// pagine pubbliche lo dichiaravano come og:image, cioe' ogni inoltro
// su WhatsApp mostrava una card vuota. Il default non puo' essere un
// file che non c'e'.
const DEFAULT_OG_IMAGE = `${ORIGIN}/og-home.png`;
const FALLBACK_OG_IMAGE = `${ORIGIN}/android-chrome-512x512.png`;
const THEME_COLOR = '#08080A';
const GOLD = '#D4AF37';
const TWITTER_HANDLE = '@boomrome';
const PUBLISHER_NAME = 'BOOM Rome';

const SITE = {
  ORIGIN,
  BRAND,
  DEFAULT_OG_IMAGE,
  FALLBACK_OG_IMAGE,
  THEME_COLOR,
  GOLD,
  TWITTER_HANDLE,
  PUBLISHER_NAME,
  DEFAULT_LOCALE: 'en_US',
  ALT_LOCALES: ['it_IT'],
};

/* ────────────────────────────────────────────────────────────────────────
 * Page registry. Order roughly mirrors the navigation / sitemap priority.
 * ──────────────────────────────────────────────────────────────────────── */
const PAGES = {
  // ════════════════════════════════════════════════════════════════════
  // CORE PUBLIC PAGES
  // ════════════════════════════════════════════════════════════════════
  // TESTA SCRITTA A MANO: la home dichiara da sé entita', FAQPage e
  // WebPage. La descrizione qui e' quella della pagina, copiata alla lettera
  // (la sitemap e i test la leggono); il generatore la salta.
  'index.html': {
    path: '/',
    manualHead: true,
    title: 'BOOM Rome — Premium Apartment Rentals | 48-Hour Move-In',
    description:
      'Verified mid-term apartment rentals in Rome for internationals — English-first, legal contracts, 48-hour move-in. Your landing in Rome, handled.',
    keywords: [
      'apartments for rent Rome',
      'rent apartment Rome',
      'mid-term rental Rome',
      'Rome rental expats',
      'apartment Rome long term',
      'Rome property management',
      'expat housing Rome',
    ],
    type: 'website',
    priority: 1.0,
    changefreq: 'weekly',
    breadcrumbs: [{ name: 'Home', url: '/' }],
    schemas: ['FAQPage:home'],
  },

  'apartments.html': {
    path: '/apartments',
    manualHead: true,
    title: 'Apartments in Rome — walked in person, ready to move in | BOOM',
    description:
      'Browse 19 verified apartments for rent in Rome — every home walked in person by BOOM. 5 available now, 4 to reserve with a date. Filter by zone, budget, move-in.',
    keywords: [
      'apartments Rome',
      'flats for rent Rome',
      'apartments Trastevere',
      'apartments Centro Storico',
      'rent flat Rome',
      'Rome apartments expat',
      'short-term apartment Rome',
    ],
    type: 'website',
    priority: 0.95,
    changefreq: 'daily',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Apartments', url: '/apartments' },
    ],
    schemas: ['CollectionPage:apartments'],
  },

  'apartment-detail.html': {
    path: '/apartment-detail',
    manualHead: true,
    title: 'Apartment Details — Rome Verified Rental | BOOM',
    description:
      'Verified apartment details, photos, location and amenities in Rome. Book a video viewing or apply in minutes. Legal contract, transparent fees, BOOM-managed.',
    keywords: [
      'verified apartment Rome',
      'Rome apartment details',
      'rent apartment Rome',
    ],
    type: 'website',
    robots: 'noindex, follow',
    priority: 0.7,
    changefreq: 'daily',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Apartments', url: '/apartments' },
      { name: 'Listing', url: '/apartment-detail' },
    ],
    // Apartment-specific JSON-LD is injected client-side from Firestore.
    schemas: ['DynamicApartment'],
  },

  // Per-listing SEO now served dynamically by api/listing.js (SSR from Firestore)
  // Legacy static apartment_*.html config archived with the files in scripts/legacy/

  // ════════════════════════════════════════════════════════════════════
  // INFORMATIONAL PAGES
  // ════════════════════════════════════════════════════════════════════
  'about.html': {
    path: '/about',
    title: 'About BOOM Rome — Built in Rome, For Renters | Our Story',
    description:
      "BOOM was born from frustration with Rome's broken rental market. Helping internationals since 2019, a registered agency since 2023: renting in Rome that works.",
    keywords: ['about BOOM Rome', 'Rome rental agency', 'expat rental service Rome', 'BOOM story'],
    type: 'website',
    priority: 0.7,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'About', url: '/about' },
    ],
    schemas: ['AboutPage'],
  },

  'contact.html': {
    path: '/contact',
    title: 'Contact BOOM Rome — Talk to a Real Person | WhatsApp + Email',
    description:
      'Reach BOOM Rome on WhatsApp or by email: clear, written answers about apartments, contracts and moving to Rome, from a registered Italian agency.',
    keywords: ['contact BOOM', 'BOOM Rome contact', 'Rome rental contact', 'expat help Rome'],
    type: 'website',
    priority: 0.7,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Contact', url: '/contact' },
    ],
    schemas: ['ContactPage'],
  },

  'faq.html': {
    path: '/faq',
    title: 'FAQ — Renting in Rome with BOOM | Contracts, Fees, Move-In',
    description:
      'Everything you need to know about renting in Rome with BOOM. Property Finding, contracts, payments, move-in, deposits, codice fiscale, and full support.',
    keywords: ['Rome rental FAQ', 'how to rent Rome', 'BOOM FAQ', 'codice fiscale apartment', 'Italian rental contract questions'],
    type: 'website',
    priority: 0.85,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'FAQ', url: '/faq' },
    ],
    // Nessun FAQPage dal generatore: quello della pagina lo DERIVA
    // scripts/faq-schema.mjs dalle card visibili. Il FAQPage generico
    // (le cinque domande della home) qui sarebbe un secondo FAQPage con
    // domande che /faq non pone.
  },

  'how-it-works.html': {
    path: '/how-it-works',
    manualHead: true,
    title: 'How BOOM works — portal, agency, concierge | BOOM Rome',
    description:
      'Half portal, half agency, then a concierge: a live catalogue with real dates, video viewings, a registered contract signed from your phone, and a named human.',
    keywords: ['how to rent Rome', 'BOOM process', 'Rome rental steps', 'apartment Rome process'],
    type: 'website',
    priority: 0.8,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'How It Works', url: '/how-it-works' },
    ],
    schemas: ['HowTo'],
  },

  // ════════════════════════════════════════════════════════════════════
  // SERVICE PAGES
  // ════════════════════════════════════════════════════════════════════
  'concierge.html': {
    path: '/concierge',
    manualHead: true,
    title: 'Relocation Concierge Rome — Codice Fiscale & More',
    description:
      'The whole landing handled: codice fiscale before you arrive, utilities, SIM, residency and healthcare. One dedicated human on WhatsApp for your first month.',
    keywords: ['concierge Rome', 'expat concierge Rome', 'Rome relocation services', 'codice fiscale help'],
    type: 'website',
    priority: 0.7,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Concierge', url: '/concierge' },
    ],
    schemas: ['Service:concierge'],
  },

  'deal-assistance.html': {
    path: '/deal-assistance',
    manualHead: true,
    title: 'Rome Rental Contract Review in English — €249 | BOOM',
    description:
      'Found a Rome apartment? We review the Italian rental contract clause by clause, in plain English, verify the landlord and negotiate. €249; first review in 24 hours.',
    keywords: ['Rome rental contract review', 'Italian lease review English', 'landlord verification Rome', 'rental negotiation Rome'],
    type: 'website',
    priority: 0.75,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Deal Assistance', url: '/deal-assistance' },
    ],
    schemas: ['Service:dealAssistance'],
  },

  'property-finding.html': {
    path: '/property-finding',
    manualHead: true,
    title: 'Property Finder Rome — Apartment Search Service €350 | BOOM',
    description:
      'Need an apartment in Rome? A local property finder searches every portal and off-market homes, vets matches and negotiates. €350, refunded if we miss.',
    keywords: ['property finder Rome', 'property finder Roma', 'apartment finding service Rome', 'apartment search service Rome'],
    type: 'website',
    priority: 0.8,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Property Finding', url: '/property-finding' },
    ],
    schemas: ['Service:propertyFinding'],
  },

  'virtual-viewing.html': {
    path: '/virtual-viewing',
    manualHead: true,
    title: 'Virtual Apartment Viewing Rome — Live Video Tour €89 | BOOM',
    description:
      'Tour any Rome apartment remotely: a BOOM agent walks it live on video, checks red flags and sends HD photos plus an honest report. €89, within 48 hours.',
    keywords: ['virtual apartment viewing Rome', 'Rome live apartment tour', 'apartment video tour Rome', 'remote apartment viewing'],
    type: 'website',
    priority: 0.7,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Virtual Viewing', url: '/virtual-viewing' },
    ],
    schemas: ['Service:virtualViewing'],
  },

  // Strumento INTERNO (pratiche di canone concordato), non una pagina di
  // offerte: fuori dall'indice e dalla sitemap.
  'deals.html': {
    ...noindex(
      '/deals',
      'Pratiche canone concordato — BOOM (interno)',
      'Strumento interno BOOM per la preparazione delle pratiche di canone concordato.'
    ),
    robots: 'noindex, nofollow',
  },

  'book.html': {
    path: '/book',
    title: 'Book a Rome Apartment Viewing — In Person or Live Video | BOOM',
    description:
      'Pick a time, see the apartment — in person or live video. Free, no commitment. BOOM verifies every listing before you visit.',
    keywords: ['book apartment viewing Rome', 'schedule viewing Rome', 'BOOM viewing booking'],
    type: 'website',
    priority: 0.85,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Book a Viewing', url: '/book' },
    ],
    schemas: ['ReserveAction'],
  },

  'booking.html': {
    path: '/booking',
    robots: 'noindex, follow',
    title: 'Apply for a Rome Apartment — Secure Application Form | BOOM',
    description:
      'Apply for a BOOM-verified Rome apartment: secure form and document upload. A person reviews it and replies on WhatsApp during office hours (Rome time).',
    keywords: ['apartment application Rome', 'apply rental Rome', 'BOOM apartment application'],
    type: 'website',
    priority: 0.6,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Apply', url: '/booking' },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // OWNERS / LANDLORDS
  // ════════════════════════════════════════════════════════════════════
  // TESTA SCRITTA A MANO (30/09/2026), come /executive e /reunion: la
  // pagina e' bilingue (it canonica + en con ?lang=en) e stripExisting()
  // cancellerebbe l'alternate inglese e i tre JSON-LD della pagina (FAQPage,
  // WebPage con speakable, Service). `manualHead` fa saltare la riscrittura;
  // la voce resta qui per il generatore della sitemap.
  'owners.html': {
    path: '/owners',
    manualHead: true,
    title: 'Proprietari a Roma: prima locazione senza provvigione — BOOM',
    description:
      'Affittiamo la sua casa a Roma a chi viene per lavoro e studio. Prima locazione senza provvigione, pratiche €89–278; ogni riaffitto il 61% di un canone. IVA inclusa.',
    keywords: ['gestione affitti Roma', 'affittare casa Roma', 'property management Roma', 'canone concordato Roma', 'affittare casa senza provvigione Roma', 'riaffittare casa agenzia'],
    type: 'website',
    lang: 'it',
    locale: 'it_IT',
    ogImage: 'https://www.boomrome.com/og-owners.png',
    priority: 0.85,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Proprietari', url: '/owners' },
    ],
  },
  // /istanbul (25/10/2026): chi si trasferisce a Roma da İstanbul. Pagina in
  // TURCO con l'inglese a scelta (?lang=en), testa scritta a mano come
  // /owners e /executive (FAQPage generato da scripts/owner-faq.mjs, la frase
  // sulla lingua delle risposte da scripts/istanbul-replies.mjs): il
  // generatore la salta. Titolo e descrizione copiati alla lettera.
  'istanbul.html': {
    path: '/istanbul',
    manualHead: true,
    title: "Roma'da kiralık daire, İstanbul'dan seç | BOOM",
    description:
      "İstanbul'dan Roma'ya taşınanlar için: evi canlı videoda gör, İtalya'nın resmî kira sözleşmesini İngilizce açıklamayla imzala. Komisyon tek seferlik, tutarı yazılı.",
    keywords: ["Roma'da kiralık daire", 'Roma kiralık oda', 'İtalya öğrenci vizesi konaklama', 'konaklama taahhütnamesi', 'kayda geçirilmiş kira sözleşmesi', 'DSU bursu kira sözleşmesi'],
    type: 'website',
    lang: 'tr',
    locale: 'tr_TR',
    ogImage: 'https://www.boomrome.com/og-istanbul.png',
    priority: 0.8,
    changefreq: 'monthly',
  },

  'owner.html': {
    path: '/owner',
    title: 'Owner Portal — Login for BOOM Property Owners',
    description:
      'Secure login for BOOM property owners. Track contracts, payments, maintenance, and tenant updates from one dashboard.',
    keywords: ['BOOM owner login', 'property owner portal'],
    type: 'website',
    robots: 'noindex, follow',
    priority: 0.3,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Owner Portal', url: '/owner' },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // TENANT
  // ════════════════════════════════════════════════════════════════════
  'tenant.html': {
    path: '/tenant',
    title: 'Tenant Portal — Login for BOOM Tenants',
    description:
      'Secure login for BOOM tenants. View your contract, payments, maintenance requests, and documents.',
    keywords: ['BOOM tenant login', 'tenant portal Rome'],
    type: 'website',
    robots: 'noindex, follow',
    priority: 0.3,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Tenant Portal', url: '/tenant' },
    ],
  },

  'tenant-registration.html': {
    path: '/tenant-registration',
    title: 'Create a BOOM Tenant Account — Free, Secure, 2 Minutes',
    description:
      'Create your BOOM tenant account to apply for verified Rome apartments, save listings, and track your rental.',
    keywords: ['BOOM tenant registration', 'tenant signup Rome'],
    type: 'website',
    robots: 'noindex, follow',
    priority: 0.3,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Sign Up', url: '/tenant-registration' },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // BLOG
  // ════════════════════════════════════════════════════════════════════
  'blog.html': {
    path: '/blog',
    title: 'BOOM Blog — Rome Rental Guides, Tips & Expat Advice',
    description:
      'Expert guides for renting in Rome. Neighborhood breakdowns, scam protection, cost calculators, tenant rights, contracts, visa, and step-by-step walkthroughs.',
    keywords: ['Rome rental blog', 'expat blog Rome', 'how to rent Rome', 'Rome rental guide'],
    type: 'website',
    priority: 0.85,
    changefreq: 'weekly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Blog', url: '/blog' },
    ],
    schemas: ['Blog'],
  },

  // Stesso ordine delle card in blog.html: il Blog elenca i suoi articoli
  // (blogPost) in quest'ordine.
  'blog-neighborhood-guide.html': blogPost({
    slug: 'blog-neighborhood-guide',
    title: 'Rome Neighborhood Guide — Where to Actually Live',
    headline: 'The Real Rome Neighborhood Guide — Where to Actually Live',
    description:
      "Honest, no-BS guide to Rome's 12 best neighborhoods for expats. Interactive map with scam risk ratings, rent prices and insider tips from a Rome rental agency.",
    keywords: ['best neighborhoods Rome expat', 'where to live Rome', 'Rome neighborhood guide'],
    datePublished: '2026-02-26',
    dateModified: '2026-10-15',
  }),

  'blog-scam-bible.html': blogPost({
    slug: 'blog-scam-bible',
    title: 'The Rome Rental Scam Bible — Every Trick They\'ll Try | BOOM',
    description:
      '7 rental scams that cost expats thousands in Rome. Real cases, 35+ red flags, and the exact protection rules BOOM uses to keep clients safe.',
    keywords: ['Rome rental scams', 'apartment scams Italy', 'expat scams Rome', 'avoid scam apartment Rome'],
    datePublished: '2026-02-26',
    dateModified: '2026-10-15',
  }),

  'blog-cost-calculator.html': blogPost({
    slug: 'blog-cost-calculator',
    title: 'What Renting in Rome Really Costs — Calculator | BOOM',
    headline: 'What Renting in Rome Actually Costs — Interactive Calculator',
    description:
      'Interactive cost calculator for renting in Rome. Real monthly and year-one costs by neighborhood, contract type, and budget. Hidden fees exposed.',
    keywords: ['cost of renting Rome', 'Rome rental cost calculator', 'Rome apartment hidden fees'],
    datePublished: '2026-02-26',
    dateModified: '2026-10-15',
  }),

  'blog-47-steps.html': blogPost({
    slug: 'blog-47-steps',
    title: '47 Steps Between You and Your Rome Keys — Full Guide',
    headline: '47 Steps Between You and Your Keys — Complete Rome Rental Guide',
    description:
      'The complete 47-step guide to renting an apartment in Rome. Every document, deadline, and trap — with interactive progress tracking.',
    keywords: ['rent apartment Rome step by step', 'Rome rental checklist', 'how to rent Rome'],
    datePublished: '2026-02-26',
    dateModified: '2026-10-15',
  }),

  'blog-tenant-rights.html': blogPost({
    slug: 'blog-tenant-rights',
    title: 'Your Rights as a Tenant in Rome — Legal Cheat Sheet | BOOM',
    description:
      'Complete guide to Italian tenant rights for expats in Rome. Deposits, eviction, maintenance, contract termination — with exact legal references and BOOM advice.',
    keywords: ['tenant rights Italy', 'Italian rental law', 'tenant deposit Rome', 'eviction rules Italy'],
    datePublished: '2026-02-27',
    dateModified: '2026-10-15',
  }),

  'blog-visa-residency.html': blogPost({
    slug: 'blog-visa-residency',
    title: 'Rome Visa & Residency — Codice Fiscale to Residenza',
    headline: 'Rome Visa & Residency Cheat Sheet — Codice Fiscale to Residenza',
    description:
      'The complete expat guide to Italian bureaucracy: codice fiscale, permesso di soggiorno, residenza, anagrafe. Step-by-step timelines, documents, and tips.',
    keywords: ['codice fiscale Rome', 'permesso di soggiorno', 'residency Italy expat', 'Rome visa guide'],
    datePublished: '2026-03-01',
    dateModified: '2026-10-15',
  }),

  'blog-contract-types.html': blogPost({
    slug: 'blog-contract-types',
    title: '4+4 Contract Italy: Transitorio, 3+2 & Lease Guide | BOOM',
    headline: '4+4 Contract Italy: Transitorio, 3+2 and Lease Guide',
    crumb: '4+4 Contract Italy and Transitorio',
    description:
      'What is a 4+4 contract in Italy? Compare 4+4, transitorio, 3+2, student and foresteria leases: duration, renewal, rent caps, notice and tax.',
    keywords: ['4+4 contract Italy', 'what is 4+4 contract in Italy', 'contratto transitorio', 'Italian rental contract', '3+2 contract'],
    datePublished: '2026-03-01',
    dateModified: '2026-10-15',
  }),

  // ════════════════════════════════════════════════════════════════════
  // LEGAL
  // ════════════════════════════════════════════════════════════════════
  'privacy.html': {
    path: '/privacy',
    title: 'Privacy Policy — BOOM Rome',
    description:
      'How BOOM Rome collects, processes and protects your personal data: what we store, why, for how long, and the GDPR rights you can exercise at any time.',
    keywords: ['BOOM privacy policy', 'GDPR Rome rental'],
    type: 'website',
    priority: 0.3,
    changefreq: 'yearly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Privacy', url: '/privacy' },
    ],
  },

  'terms.html': {
    path: '/terms',
    title: 'Terms of Service — BOOM Rome',
    description:
      'BOOM Rome terms of service for tenants, landlords and platform users: fees, refunds, cancellations and obligations, under Italian law. Plain English.',
    keywords: ['BOOM terms', 'BOOM Rome terms of service'],
    type: 'website',
    priority: 0.3,
    changefreq: 'yearly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Terms', url: '/terms' },
    ],
  },

  // ════════════════════════════════════════════════════════════════════
  // UTILITY / TRANSACTIONAL (noindex)
  // ════════════════════════════════════════════════════════════════════
  'login.html': noindex('/login', 'Login — BOOM Rome', 'Secure login for tenants, landlords and admins.'),
  'dashboard.html': noindex('/dashboard', 'Dashboard — BOOM Rome', 'Your BOOM dashboard.'),
  'client-portal.html': noindex('/client-portal', 'Client Portal — BOOM Rome', 'Your property search portal.'),
  'form-tenant.html': noindex('/form-tenant', 'Tenant Application — BOOM Rome', 'Apply for a BOOM-verified Rome apartment.'),
  'form-landlord.html': noindex('/form-landlord', 'List Your Property — BOOM Rome', 'List your Rome property with BOOM.'),
  'onboarding.html': noindex('/onboarding', 'Onboarding — BOOM Rome', 'Complete your BOOM onboarding.'),
  'pre-arrival.html': noindex('/pre-arrival', 'Pre-Arrival Checklist — BOOM Rome', 'Everything to do before you move into your BOOM apartment.'),
  'precheck.html': noindex('/precheck', 'Apartment Pre-Check — BOOM Rome', 'BOOM pre-check verification.'),
  'thank-you.html': noindex('/thank-you', 'Thank You — BOOM Rome', 'Thanks — we\'ll be in touch shortly.'),
  '404.html': noindex('/404', 'Page Not Found — BOOM Rome', 'We couldn\'t find that page. Browse verified apartments instead.'),
  'owner-dashboard.html': noindex('/owner-dashboard', 'Owner Dashboard — BOOM Rome', 'BOOM owner dashboard.'),
  'proppass.html': noindex('/proppass', 'PropPass — BOOM Rome', 'BOOM PropPass generator.'),
  // Testa propria (theme-color dello scalo, font dentro il blocco SEO): il
  // generatore la cancellerebbe.
  'pass-delivery.html': { ...noindex('/pass-delivery', 'Pass Delivery — BOOM Rome', 'Your BOOM pass.'), manualHead: true },
};

/* ────────────────────────────────────────────────────────────────────────
 * Helper factories
 * ──────────────────────────────────────────────────────────────────────── */
function apartmentPage({ slug, name, neighborhood, landmark, tagline, size, bedrooms, rentMin, rentMax, geo, seoTitle, seoDescription, keywords }) {
  return {
    path: `/${slug}`,
    title: seoTitle,
    description: seoDescription,
    keywords,
    type: 'website',
    priority: 0.8,
    changefreq: 'weekly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Apartments', url: '/apartments' },
      { name, url: `/${slug}` },
    ],
    schemas: [`Apartment:${slug}`],
    apartmentData: { name, neighborhood, landmark, tagline, size, bedrooms, rentMin, rentMax, geo },
  };
}

// `title` e' il <title> che la pagina pubblica; `headline` e `crumb` sono il
// titolo dell'articolo e la voce di breadcrumb dei suoi dati strutturati,
// che possono essere piu' lunghi del <title> (≤62 caratteri). Senza, si
// derivano dal titolo come prima.
function blogPost({ slug, title, headline, crumb, description, keywords, datePublished, dateModified }) {
  const head = headline || title.split(' | ')[0];
  return {
    path: `/${slug}`,
    title,
    description,
    keywords,
    type: 'article',
    priority: 0.85,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Blog', url: '/blog' },
      { name: crumb || head.split(' — ')[0].split(' | ')[0], url: `/${slug}` },
    ],
    schemas: ['BlogPosting'],
    article: { headline: head, datePublished, dateModified },
  };
}

function noindex(path, title, description) {
  return {
    path,
    title,
    description,
    keywords: [],
    type: 'website',
    robots: 'noindex, follow',
    priority: 0,
    breadcrumbs: [],
    skipSitemap: true,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Neighborhood landing pages — generated by scripts/neighborhoods-build.js
 * Their SEO is also managed by this config so the unified pipeline (meta,
 * sitemap, JSON-LD) treats them like every other public page.
 * ──────────────────────────────────────────────────────────────────────── */
try {
  const { NEIGHBORHOODS } = require('./neighborhoods-data');

  // Hub
  PAGES['apartments-in/index.html'] = {
    path: '/apartments-in',
    title: 'Rome Neighborhoods — Where to Rent an Apartment | BOOM',
    description:
      'Pick a Rome neighborhood: verified apartments and local guides for Trastevere, Monti, Prati, Pigneto, Testaccio, San Lorenzo and more, managed by BOOM.',
    keywords: [
      'Rome neighborhoods',
      'where to live Rome',
      'best neighborhood Rome expat',
      'Rome districts guide',
      'rent apartment Rome neighborhood',
    ],
    type: 'website',
    priority: 0.9,
    changefreq: 'weekly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Neighborhoods', url: '/apartments-in' },
    ],
    schemas: ['CollectionPage:neighborhoods'],
  };

  // Per-neighborhood pages
  for (const n of NEIGHBORHOODS) {
    PAGES[`apartments-in/${n.slug}.html`] = {
      path: `/apartments-in/${n.slug}`,
      title: n.metaTitle,
      description: n.metaDescription,
      keywords: n.keywords,
      type: 'website',
      priority: 0.88,
      changefreq: 'weekly',
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'Neighborhoods', url: '/apartments-in' },
        { name: n.name, url: `/apartments-in/${n.slug}` },
      ],
      schemas: [`Neighborhood:${n.slug}`, `FAQPage:${n.slug}`],
      neighborhoodData: n,
    };
  }
} catch (e) {
  // Neighborhoods file missing — non-fatal for the rest of the config.
  console.warn('[seo-config] could not load neighborhoods-data:', e.message);
}

module.exports = { SITE, PAGES };
