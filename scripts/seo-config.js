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

  // Per-listing SEO now served dynamically by api/listing.js (SSR from Firestore)
  // Legacy static apartment_*.html config archived with the files in scripts/legacy/

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
    // Niente 'FAQPage' qui: la pagina porta il SUO blocco, sincronizzato
    // dalle domande visibili con scripts/seo-faq-sync.mjs — il blocco
    // generico del registro direbbe cose che la pagina non mostra.
    schemas: [],
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
    title: 'Rome Concierge — Bureaucracy & Daily Support | BOOM',
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
    title: 'Deal Assistance Rome — Contract Review & Negotiation | BOOM',
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

  // Audit SEO 2026-08-27: guscio client-side vuoto per i crawler (thin
  // content) — noindex finché non ha contenuto statico, come da audit P3.
  'deals.html': {
    path: '/deals',
    title: 'Deals & Offers — BOOM Rome Rental Promotions',
    description:
      'Current BOOM deals: free first viewing, refundable property finding fee, referral credits, and limited-time apartment offers in Rome.',
    keywords: ['BOOM deals Rome', 'Rome apartment deals', 'rental offers Rome'],
    type: 'website',
    robots: 'noindex, follow',
    skipSitemap: true,
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

  // Audit SEO 2026-08-27: robots.txt la blocca già ("legacy, slated for
  // removal") — una URL bloccata non può stare in sitemap, e il noindex
  // meta è la cintura per qualunque crawler che ignori robots.txt.
  'booking.html': {
    path: '/booking',
    title: 'Apply for a Rome Apartment — Secure Application Form | BOOM',
    description:
      'Apply for a BOOM-verified Rome apartment. Secure form, document upload, fast review. We respond within 24 hours.',
    keywords: ['apartment application Rome', 'apply rental Rome', 'BOOM apartment application'],
    type: 'website',
    robots: 'noindex, follow',
    skipSitemap: true,
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
    title: '47 Steps Between You and Your Keys — Rome Rental Guide | BOOM',
    description:
      'The complete 47-step guide to renting an apartment in Rome. Every document, deadline, and trap — with interactive progress tracking.',
    keywords: ['rent apartment Rome step by step', 'Rome rental checklist', 'how to rent Rome'],
    datePublished: '2026-03-14',
    dateModified: '2026-08-28',
  }),

  'blog-contract-types.html': blogPost({
    slug: 'blog-contract-types',
    title: 'Transitorio vs 4+4 — Italian Rental Contracts Explained | BOOM',
    description:
      'Complete guide to Italian rental contracts: transitorio, 4+4, cedolare secca, uso foresteria. What each means, who it\'s for, what landlords won\'t explain.',
    keywords: ['contratto transitorio', 'contratto 4+4', 'cedolare secca', 'Italian rental contract types'],
    datePublished: '2026-03-21',
    dateModified: '2026-04-19',
  }),

  'blog-cost-calculator.html': blogPost({
    slug: 'blog-cost-calculator',
    title: 'What Renting in Rome Actually Costs — Calculator | BOOM',
    description:
      'Interactive cost calculator for renting in Rome. Real monthly and year-one costs by neighborhood, contract type, and budget. Hidden fees exposed.',
    keywords: ['cost of renting Rome', 'Rome rental cost calculator', 'Rome apartment hidden fees'],
    datePublished: '2026-02-08',
    dateModified: '2026-08-28',
  }),

  'blog-neighborhood-guide.html': blogPost({
    slug: 'blog-neighborhood-guide',
    title: 'The Real Rome Neighborhood Guide — Where to Actually Live | BOOM',
    description:
      'Honest, no-BS guide to Rome\'s 12 best neighborhoods for expats. Interactive map with scam risk ratings, rent prices, and insider tips from 500+ rental deals.',
    keywords: ['best neighborhoods Rome expat', 'where to live Rome', 'Rome neighborhood guide'],
    datePublished: '2026-01-19',
    dateModified: '2026-08-28',
  }),

  'blog-scam-bible.html': blogPost({
    slug: 'blog-scam-bible',
    title: 'The Rome Rental Scam Bible — Every Trick They\'ll Try | BOOM',
    description:
      '7 rental scams that cost expats thousands in Rome. Real cases, 35+ red flags, and the exact protection rules BOOM uses to keep clients safe.',
    keywords: ['Rome rental scams', 'apartment scams Italy', 'expat scams Rome', 'avoid scam apartment Rome'],
    datePublished: '2026-02-26',
    dateModified: '2026-08-28',
  }),

  'blog-tenant-rights.html': blogPost({
    slug: 'blog-tenant-rights',
    title: 'Your Rights as a Tenant in Rome — Legal Cheat Sheet | BOOM',
    description:
      'Complete guide to Italian tenant rights for expats in Rome. Deposits, eviction, maintenance, contract termination — with exact legal references and BOOM advice.',
    keywords: ['tenant rights Italy', 'Italian rental law', 'tenant deposit Rome', 'eviction rules Italy'],
    datePublished: '2026-04-02',
    dateModified: '2026-08-28',
  }),

  'blog-visa-residency.html': blogPost({
    slug: 'blog-visa-residency',
    title: 'Rome Visa & Residency Cheat Sheet for Expats | BOOM',
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
 * Pagine con la testa CURATA A MANO — il registro le conosce (sitemap,
 * test anti-deriva) ma seo-update.js NON le tocca: `metaManaged: false`.
 *
 * LA LEZIONE DEL 2026-08-27: questo registro era fermo a ~40 voci mentre
 * il sito ne serviva 65 — rigenerare la sitemap avrebbe CANCELLATO canone,
 * services, executive, reunion, le guide moving-to-rome e welcome-to-rome
 * dall'indice. Un registro che non conosce le pagine vive è più pericoloso
 * di nessun registro, perché i suoi strumenti sembrano ancora affidabili.
 * Da qui in avanti tests/seo/run.mjs pretende che OGNI pagina indicizzabile
 * in produzione sia registrata: una pagina nuova senza voce = test rosso.
 * ──────────────────────────────────────────────────────────────────────── */
function handcrafted(path, title, opts = {}) {
  return {
    path,
    title,
    metaManaged: false,
    type: 'website',
    priority: opts.priority != null ? opts.priority : 0.7,
    changefreq: opts.changefreq || 'monthly',
    ...(opts.lang ? { lang: opts.lang } : {}),
    ...(opts.alternates ? { alternates: opts.alternates } : {}),
    ...(opts.skipSitemap ? { skipSitemap: true } : {}),
  };
}

Object.assign(PAGES, {
  'canone.html': handcrafted('/canone', 'Calcolo Canone Concordato Roma 2026 — Gratis', { priority: 0.92, lang: 'it' }),
  'services.html': handcrafted('/services', 'BOOM Services Rome — Every Price Upfront', { priority: 0.88 }),
  'deposit-letter.html': handcrafted('/deposit-letter', 'Free Deposit Demand Letter Italy — Art. 1590 c.c.', { priority: 0.86 }),
  'pacchetto-concordato.html': handcrafted('/pacchetto-concordato', 'Canone Concordato Roma — Pacchetto Chiavi in Mano', { priority: 0.85, lang: 'it' }),
  'reunion.html': handcrafted('/reunion', 'Gestion locative & location à La Réunion — BOOM', {
    priority: 0.85,
    alternates: [
      { hreflang: 'fr', href: '/reunion' },
      { hreflang: 'en', href: '/reunion?lang=en' },
    ],
  }),
  'executive.html': handcrafted('/executive', 'Executive rentals in Rome for professionals — BOOM', {
    priority: 0.88,
    alternates: [
      { hreflang: 'en', href: '/executive' },
      { hreflang: 'it', href: '/executive?lang=it' },
    ],
  }),
  'remote-move-pack.html': handcrafted('/remote-move-pack', 'Rent in Rome From Abroad — Remote Move Pack €299', { priority: 0.8 }),
  'match.html': handcrafted('/match', "Trova la tua zona a Roma vicino all'università | BOOM Match", { priority: 0.9, lang: 'it' }),
  'try.html': handcrafted('/try', 'Try BOOM — the 90-second rental | BOOM Rome', { priority: 0.8 }),
  'universities.html': handcrafted('/universities', 'Student Housing in Rome for Universities | BOOM', { priority: 0.8 }),
  'corporate.html': handcrafted('/corporate', 'Corporate Relocation & Employee Housing in Rome | BOOM', { priority: 0.8 }),
  'research.html': handcrafted('/research', 'Housing for ERC & Marie-Curie Researchers in Rome | BOOM', { priority: 0.8 }),
  'partners.html': handcrafted('/partners', 'Partner with BOOM — Housing for Organisations in Rome', { priority: 0.7 }),
  'contract-check.html': handcrafted('/contract-check', 'Free Rome Rental Contract Check | BOOM', { priority: 0.8 }),
  'contract-check-express.html': handcrafted('/contract-check-express', 'Contract Check Rome — Verdict in 24h, €49', { priority: 0.7 }),
  'deposit-recovery.html': handcrafted('/deposit-recovery', 'Deposit Recovery Rome — Get Your Deposit Back', { priority: 0.7 }),
  'refer.html': handcrafted('/refer', 'Refer a Friend to BOOM — Give €50, Get €50', { priority: 0.6 }),
  'moving-to-rome.html': handcrafted('/moving-to-rome', 'Moving to Rome in 2026 — The Complete Relocation Guide | BOOM', { priority: 0.9 }),
  'rent-in-rome-without-scams.html': handcrafted('/rent-in-rome-without-scams', 'Rent in Rome Without Scams — The Verified Way | BOOM', { priority: 0.85 }),
  'moving-to-rome-from-us.html': handcrafted('/moving-to-rome-from-us', 'Moving to Rome from the US (2026) — Visas, Costs, Homes | BOOM', { priority: 0.85 }),
  'moving-to-rome-from-uk.html': handcrafted('/moving-to-rome-from-uk', 'Moving to Rome from the UK (2026) — Post-Brexit Guide | BOOM', { priority: 0.85 }),
  'moving-to-rome-from-germany.html': handcrafted('/moving-to-rome-from-germany', 'Moving to Rome from Germany (2026) — EU Citizen Guide | BOOM', { priority: 0.85 }),
  'your-money.html': handcrafted('/your-money', 'Your money at BOOM — every euro, in the open | BOOM Rome', { priority: 0.7 }),
  'board.html': handcrafted('/board', 'BOOM · Rome — Live Board', { priority: 0.6, changefreq: 'daily' }),
  'skyline.html': handcrafted('/skyline', 'BOOM Skyline — rent Rome from the sky', { priority: 0.85, changefreq: 'weekly' }),
  'welcome-to-rome.html': handcrafted('/welcome-to-rome', 'Welcome to Rome Kit — the expat survival guide | BOOM Roma', { priority: 0.85 }),
});

// Anche queste cinque stanno nel registro dalla prima ora, ma la loro testa
// è stata ricostruita a mano dopo l'ultima passata di seo-update (le
// sentinelle BOOM_SEO non ci sono più): il registro resta la fonte per la
// sitemap, l'updater non deve più riscriverle.
for (const f of ['index.html', 'apartments.html', 'apartment-detail.html', 'how-it-works.html', 'property-finding.html']) {
  if (PAGES[f]) PAGES[f].metaManaged = false;
}

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
      'Pick a Rome neighborhood. Verified apartments in Trastevere, Centro Storico, Monti, Prati, Pigneto, Testaccio and more. Local guides, real rents.',
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
