// api/_catalog.js
// THE service catalog — single source of truth for price and copy of every
// productised service. It lives in its own module (no Stripe client, no env
// dependency) so any endpoint can read prices without evaluating a module
// that constructs the Stripe SDK at load time.
//
// Consumers: api/service-checkout.js (POST, the Services 2.0 pages),
//            api/services/buy.js (GET one-tap buy from emails).

export const CATALOG = {
  'virtual-viewing': {
    eur: 89,
    label: 'Virtual Viewing — live video tour',
    desc: 'We walk the apartment for you, live on video — HD photo set + honest written report, scheduled within 48 hours. Credited to your agency fee if you rent the home with BOOM; refunded in full if we cannot reach the property.',
    cancel: '/virtual-viewing',
  },
  'deal-assistance': {
    eur: 249,
    label: 'Deal Assistance — rent safely',
    desc: 'Clause-by-clause contract review in English, landlord & property verification, and negotiation on the apartment you found. First review within 24 hours of payment.',
    cancel: '/deal-assistance',
  },
  'deposit-recovery': {
    eur: 99,
    label: 'Deposit Recovery — we get it back',
    desc: 'Formal demand under Italian law (art. 1590 c.c.), negotiation with the landlord and escalation path for your withheld deposit. €99 to start; success fee of 20% only on what we actually recover.',
    cancel: '/deposit-recovery',
  },
  'contract-check-express': {
    eur: 49,
    label: 'Contract Check Express — verdict in 24h',
    desc: 'A written traffic-light verdict on your rental contract within 24 hours: what is fine, what is unfair, what is missing. Credited in full if you upgrade to Deal Assistance.',
    cancel: '/contract-check-express',
  },
  'remote-move-pack': {
    eur: 299,
    label: 'Remote Move Pack — close from abroad',
    desc: 'Two live video viewings, clause-by-clause contract review in English, negotiation and arrival setup — everything you need to rent in Rome before you land. Credited toward your agency fee if you rent a BOOM home.',
    cancel: '/remote-move-pack',
  },
  // Landlord-side (Italian audience) — sold from /pacchetto-concordato,
  // fed by the free /canone calculator.
  'concordato-pack': {
    eur: 349,
    label: 'Pacchetto Canone Concordato — chiavi in mano',
    desc: 'Verifica ufficiale del canone, contratto conforme all\'Accordo di Roma, attestazione di rispondenza gestita e registrazione RLI. Rimborso integrale se il tuo immobile non può rientrare in fascia.',
    cancel: '/pacchetto-concordato',
  },
  // Tenant-journey concierge products.
  'movein-pack': {
    eur: 149,
    label: 'Move-in Pack — utilities handled',
    desc: 'Electricity & gas transfers in your name, internet activation, residency registration guide. You arrive, everything works.',
    cancel: '/concierge',
  },
  'cleaning-premium': {
    eur: 119,
    label: 'Cleaning Premium — deep clean',
    desc: 'Professional deep clean of your apartment (kitchen, bathrooms, floors, windows) the day before move-in — hotel-fresh keys-in-hand.',
    cancel: '/concierge',
  },
};

// Only these can be bought from a bare link (email one-tap). The others are
// sold from their own page, which collects the context the service needs
// (the listing to view, the contract to review, the deposit story).
export const EMAIL_BUYABLE = ['movein-pack', 'cleaning-premium'];
