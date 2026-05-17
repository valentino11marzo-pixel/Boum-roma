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
const DEFAULT_OG_IMAGE = `${ORIGIN}/BOOMsocialprofile.png`;
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
  'index.html': {
    path: '/',
    title: 'BOOM Rome — Premium Apartment Rentals in Rome | 48-Hour Move-In',
    description:
      'Find verified apartments for rent in Rome. Premium mid-term rentals with 48-hour move-in, full property management, and legal contracts. Trusted by 500+ expats. Zero hidden fees.',
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
    schemas: ['LocalBusiness', 'FAQPage:home'],
  },

  'apartments.html': {
    path: '/apartments',
    title: 'Apartments for Rent in Rome — Video-Verified Listings | BOOM',
    description:
      'Browse video-verified apartments for rent in Rome. Centro Storico, Trastevere, Pigneto, Monti and more. 48-hour move-in, no broker fees, legal contracts. Updated daily.',
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
    title: 'Apartment Details — Rome Verified Rental | BOOM',
    description:
      'Verified apartment details, photos, location and amenities in Rome. Book a video viewing or apply in minutes. Legal contract, transparent fees, BOOM-managed.',
    keywords: [
      'verified apartment Rome',
      'Rome apartment details',
      'rent apartment Rome',
    ],
    type: 'website',
    robots: 'index, follow',
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

  // ════════════════════════════════════════════════════════════════════
  // STATIC APARTMENT PAGES — rich Apartment schema per property
  // ════════════════════════════════════════════════════════════════════
  'apartment_navona.html': apartmentPage({
    slug: 'apartment-navona',
    name: 'Coronari Classic',
    neighborhood: 'Centro Storico',
    landmark: 'Piazza Navona',
    tagline: 'Elegant apartment in the heart of Rome near Piazza Navona',
    size: 70,
    bedrooms: 1,
    rentMin: 2000,
    rentMax: 2400,
    geo: { lat: 41.8992, lng: 12.4731 },
    seoTitle: 'Apartment Near Piazza Navona — Coronari Classic, Rome | BOOM',
    seoDescription:
      'Elegant 70m² apartment in Rome\'s Centro Storico, steps from Piazza Navona. Video-verified, legal contract, from €2,000/mo. Book a viewing online.',
    keywords: ['apartment Piazza Navona', 'apartment Centro Storico Rome', 'rent apartment Coronari', 'Rome historic centre rental'],
  }),

  'apartment_ripetta.html': apartmentPage({
    slug: 'apartment-ripetta',
    name: 'Ripetta Terrace',
    neighborhood: 'Centro Storico',
    landmark: 'Tiber River',
    tagline: 'Panoramic terrace apartment overlooking the Tiber River',
    size: 100,
    bedrooms: 2,
    rentMin: 2300,
    rentMax: 2760,
    geo: { lat: 41.9091, lng: 12.4769 },
    seoTitle: 'Terrace Apartment Rome Centro — Ripetta with Tiber View | BOOM',
    seoDescription:
      '100m² panoramic terrace apartment in Rome\'s Centro Storico overlooking the Tiber. Video-verified, BOOM-managed, from €2,300/mo. Book a virtual viewing.',
    keywords: ['terrace apartment Rome', 'apartment with view Rome', 'Via di Ripetta apartment', 'Centro Storico rental'],
  }),

  'apartment_pigneto.html': apartmentPage({
    slug: 'apartment-pigneto',
    name: 'Pigneto Terrace',
    neighborhood: 'Pigneto',
    landmark: 'Pigneto',
    tagline: 'Live like a local in Rome\'s trendiest neighborhood',
    size: 80,
    bedrooms: 2,
    rentMin: 1700,
    rentMax: 2040,
    geo: { lat: 41.8867, lng: 12.5257 },
    seoTitle: '2-Bed Apartment Pigneto Rome — Terrace, Local Vibe | BOOM',
    seoDescription:
      '80m² two-bedroom apartment with terrace in Pigneto, Rome\'s most authentic district. Video-verified, mid-term contract, from €1,700/mo.',
    keywords: ['apartment Pigneto', 'rent Pigneto Rome', 'Pigneto 2 bedroom apartment', 'Rome trendy neighborhood rental'],
  }),

  'apartment_angelico.html': apartmentPage({
    slug: 'apartment-angelico',
    name: 'Angelico Loft',
    neighborhood: 'Mazzini / Delle Vittorie',
    landmark: 'Prati',
    tagline: 'Modern loft-style apartment in elegant Mazzini district',
    size: 65,
    bedrooms: 1,
    rentMin: 2000,
    rentMax: 2400,
    geo: { lat: 41.9171, lng: 12.4632 },
    seoTitle: 'Loft Apartment Prati Rome — Angelico, Mazzini District | BOOM',
    seoDescription:
      '65m² modern loft in Mazzini / Delle Vittorie, walking distance to Vatican and Prati. Video-verified, fully managed, from €2,000/mo.',
    keywords: ['apartment Prati Rome', 'loft apartment Rome', 'apartment Mazzini', 'Vatican area apartment'],
  }),

  'apartment_levico.html': apartmentPage({
    slug: 'apartment-levico',
    name: 'Levico Garden Floor',
    neighborhood: 'Trieste / Coppedè',
    landmark: 'Quartiere Coppedè',
    tagline: 'Charming garden-level studio near Coppedè',
    size: 40,
    bedrooms: 0,
    rentMin: 1200,
    rentMax: 1200,
    geo: { lat: 41.9234, lng: 12.5076 },
    seoTitle: 'Studio Apartment Rome Coppedè — Levico Garden Floor | BOOM',
    seoDescription:
      'Charming 40m² studio in Trieste/Coppedè, one of Rome\'s most photogenic districts. Mid-term lease from €1,200/mo, BOOM-verified.',
    keywords: ['studio apartment Rome', 'apartment Trieste Rome', 'Coppedè rental', 'Rome studio expat'],
  }),

  'apartment_piemonte.html': apartmentPage({
    slug: 'apartment-piemonte',
    name: 'Piemonte Attic',
    neighborhood: 'Vittorio Veneto',
    landmark: 'Via Veneto',
    tagline: 'Stunning renovated attic in the heart of Rome',
    size: 55,
    bedrooms: 1,
    rentMin: 1300,
    rentMax: 1560,
    geo: { lat: 41.9090, lng: 12.4896 },
    seoTitle: 'Attic Apartment Rome — Piemonte near Via Veneto | BOOM',
    seoDescription:
      '55m² renovated attic apartment near Via Veneto, walking distance to Villa Borghese. Video-verified, from €1,300/mo, legal contract.',
    keywords: ['attic apartment Rome', 'apartment Via Veneto', 'apartment Villa Borghese', 'Rome penthouse rental'],
  }),

  'apartment-marconi.html': apartmentPage({
    slug: 'apartment-marconi',
    name: 'Marconi Shared',
    neighborhood: 'Marconi',
    landmark: 'Roma Tre University',
    tagline: 'Spacious private room in shared 3-bedroom apartment',
    size: 110,
    bedrooms: 3,
    rentMin: 750,
    rentMax: 900,
    geo: { lat: 41.8593, lng: 12.4661 },
    seoTitle: 'Shared Room Rome — Marconi Student Apartment, €750/mo | BOOM',
    seoDescription:
      'Private room in 110m² shared apartment in Marconi, near Roma Tre University. €750/mo all-in, legal student contract, BOOM-managed.',
    keywords: ['shared apartment Rome', 'student room Rome', 'Marconi apartment', 'Roma Tre accommodation'],
  }),

  // ════════════════════════════════════════════════════════════════════
  // INFORMATIONAL PAGES
  // ════════════════════════════════════════════════════════════════════
  'about.html': {
    path: '/about',
    title: 'About BOOM Rome — Built in Rome, For Renters | Our Story',
    description:
      'BOOM was born from frustration with Rome\'s broken rental market. 6+ years of local expertise, 500+ happy tenants, a mission to make renting in Rome actually work.',
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
      'Reach BOOM Rome in seconds. WhatsApp, email, or book a call. Fast, transparent answers about apartments, contracts, and moving to Rome.',
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
    schemas: ['FAQPage'],
  },

  'how-it-works.html': {
    path: '/how-it-works',
    title: 'How BOOM Works — Apartment in Rome in 3 Steps | 48h Move-In',
    description:
      'Search verified listings, book a video viewing, sign legally — move into your Rome apartment in 48 hours. Transparent, regulated, no hidden fees.',
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
    title: 'Rome Concierge Services — Airport, Bureaucracy & Daily Support | BOOM',
    description:
      'Your personal support system in Rome. Airport pickups, codice fiscale, bureaucracy navigation, household setup — BOOM handles the details so you enjoy la dolce vita.',
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
    title: 'Deal Assistance Rome — Contract Review & Negotiation €249 | BOOM',
    description:
      'Found an apartment in Rome? We close the deal safely. Contract review, negotiation, legal registration, end-to-end support for €249. BOOM-protected.',
    keywords: ['Rome rental contract review', 'apartment deal assistance Rome', 'lease negotiation Rome', 'BOOM deal service'],
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
    title: 'Property Finding Service Rome — We Find Your Apartment €350 | BOOM',
    description:
      'Tell us what you need. BOOM\'s local team finds, vets and negotiates your Rome apartment for €350 — refundable if no match. 7-day average move-in.',
    keywords: ['property finder Rome', 'apartment finding service Rome', 'BOOM property finder', 'apartment search Rome'],
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
    title: 'Virtual Apartment Viewings Rome — Live Video Tours | BOOM',
    description:
      'Can\'t visit Rome? We\'ll be your eyes. Live video viewings of apartments with professional verification, honest feedback, and live Q&A.',
    keywords: ['virtual viewing Rome', 'remote apartment viewing', 'video apartment tour Rome', 'BOOM virtual viewing'],
    type: 'website',
    priority: 0.7,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Virtual Viewing', url: '/virtual-viewing' },
    ],
    schemas: ['Service:virtualViewing'],
  },

  'deals.html': {
    path: '/deals',
    title: 'Deals & Offers — BOOM Rome Rental Promotions',
    description:
      'Current BOOM deals: free first viewing, refundable property finding fee, referral credits, and limited-time apartment offers in Rome.',
    keywords: ['BOOM deals Rome', 'Rome apartment deals', 'rental offers Rome'],
    type: 'website',
    priority: 0.6,
    changefreq: 'weekly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Deals', url: '/deals' },
    ],
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
    title: 'Apply for a Rome Apartment — Secure Application Form | BOOM',
    description:
      'Apply for a BOOM-verified Rome apartment. Secure form, document upload, fast review. We respond within 24 hours.',
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
  'owners.html': {
    path: '/owners',
    title: 'Proprietari — Gestione Immobiliare Premium a Roma | BOOM',
    description:
      'Affida il tuo immobile a chi ne risponde legalmente. Prima locazione gratuita, garanzia di solvibilità, screening rigoroso e portale esclusivo per proprietari.',
    keywords: ['gestione immobiliare Roma', 'property management Rome', 'affittare casa Roma sicuro', 'proprietari Roma'],
    type: 'website',
    lang: 'it',
    locale: 'it_IT',
    priority: 0.8,
    changefreq: 'monthly',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Per Proprietari', url: '/owners' },
    ],
    schemas: ['Service:propertyManagement'],
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

  'blog-47-steps.html': blogPost({
    slug: 'blog-47-steps',
    title: '47 Steps Between You and Your Keys — Complete Rome Rental Guide | BOOM',
    description:
      'The complete 47-step guide to renting an apartment in Rome. Every document, deadline, and trap — with interactive progress tracking.',
    keywords: ['rent apartment Rome step by step', 'Rome rental checklist', 'how to rent Rome'],
    datePublished: '2026-03-14',
    dateModified: '2026-04-22',
  }),

  'blog-contract-types.html': blogPost({
    slug: 'blog-contract-types',
    title: 'Transitorio vs 4+4 — Which Italian Rental Contract Is Right for You? | BOOM',
    description:
      'Complete guide to Italian rental contracts: transitorio, 4+4, cedolare secca, uso foresteria. What each means, who it\'s for, what landlords won\'t explain.',
    keywords: ['contratto transitorio', 'contratto 4+4', 'cedolare secca', 'Italian rental contract types'],
    datePublished: '2026-03-21',
    dateModified: '2026-04-19',
  }),

  'blog-cost-calculator.html': blogPost({
    slug: 'blog-cost-calculator',
    title: 'What Renting in Rome Actually Costs — Interactive Calculator | BOOM',
    description:
      'Interactive cost calculator for renting in Rome. Real monthly and year-one costs by neighborhood, contract type, and budget. Hidden fees exposed.',
    keywords: ['cost of renting Rome', 'Rome rental cost calculator', 'Rome apartment hidden fees'],
    datePublished: '2026-02-08',
    dateModified: '2026-04-29',
  }),

  'blog-neighborhood-guide.html': blogPost({
    slug: 'blog-neighborhood-guide',
    title: 'The Real Rome Neighborhood Guide — Where to Actually Live | BOOM',
    description:
      'Honest, no-BS guide to Rome\'s 12 best neighborhoods for expats. Interactive map with scam risk ratings, rent prices, and insider tips from 500+ rental deals.',
    keywords: ['best neighborhoods Rome expat', 'where to live Rome', 'Rome neighborhood guide'],
    datePublished: '2026-01-19',
    dateModified: '2026-05-04',
  }),

  'blog-scam-bible.html': blogPost({
    slug: 'blog-scam-bible',
    title: 'The Rome Rental Scam Bible — Every Trick They\'ll Try | BOOM',
    description:
      '7 rental scams that cost expats thousands in Rome. Real cases, 35+ red flags, and the exact protection rules BOOM uses to keep clients safe.',
    keywords: ['Rome rental scams', 'apartment scams Italy', 'expat scams Rome', 'avoid scam apartment Rome'],
    datePublished: '2026-02-26',
    dateModified: '2026-05-10',
  }),

  'blog-tenant-rights.html': blogPost({
    slug: 'blog-tenant-rights',
    title: 'Your Rights as a Tenant in Rome — Legal Cheat Sheet | BOOM',
    description:
      'Complete guide to Italian tenant rights for expats in Rome. Deposits, eviction, maintenance, contract termination — with exact legal references and BOOM advice.',
    keywords: ['tenant rights Italy', 'Italian rental law', 'tenant deposit Rome', 'eviction rules Italy'],
    datePublished: '2026-04-02',
    dateModified: '2026-05-09',
  }),

  'blog-visa-residency.html': blogPost({
    slug: 'blog-visa-residency',
    title: 'Rome Visa & Residency Cheat Sheet — Codice Fiscale to Residenza | BOOM',
    description:
      'The complete expat guide to Italian bureaucracy: codice fiscale, permesso di soggiorno, residenza, anagrafe. Step-by-step timelines, documents, and tips.',
    keywords: ['codice fiscale Rome', 'permesso di soggiorno', 'residency Italy expat', 'Rome visa guide'],
    datePublished: '2026-04-12',
    dateModified: '2026-05-13',
  }),

  // ════════════════════════════════════════════════════════════════════
  // LEGAL
  // ════════════════════════════════════════════════════════════════════
  'privacy.html': {
    path: '/privacy',
    title: 'Privacy Policy — BOOM Rome',
    description:
      'How BOOM Rome collects, processes and protects your personal data. GDPR-compliant privacy policy.',
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
      'BOOM Rome terms of service for tenants, landlords and platform users. Italian-law compliant.',
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
  'pass-delivery.html': noindex('/pass-delivery', 'Pass Delivery — BOOM Rome', 'Your BOOM pass.'),
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

function blogPost({ slug, title, description, keywords, datePublished, dateModified }) {
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
      { name: title.split(' — ')[0].split(' | ')[0], url: `/${slug}` },
    ],
    schemas: ['BlogPosting'],
    article: { datePublished, dateModified },
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
      'Pick a Rome neighborhood. Verified apartments in Trastevere, Centro Storico, Monti, Prati, Pigneto, Testaccio, Ostiense, Trieste, San Lorenzo, Esquilino. Local guides, real rents, BOOM-managed.',
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
