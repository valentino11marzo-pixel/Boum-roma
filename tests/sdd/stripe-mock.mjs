// Mock del pacchetto 'stripe' per la suite SDD. Registra ogni chiamata in
// globalThis.__sdd così i test asseriscono ESATTAMENTE cosa è partito verso
// Stripe (importo, idempotency key, mandato). constructEvent fa solo il
// parse: la firma è responsabilità di Stripe, i test coprono la NOSTRA logica.
const S = () => (globalThis.__sdd ||= {
  pis: [], sessions: [], customers: [], detached: [],
  failPI: false, setupIntent: null,
});

export default class Stripe {
  constructor() {
    this.checkout = {
      sessions: {
        create: async (opts) => {
          S().sessions.push(opts);
          return { id: 'cs_setup_' + S().sessions.length, url: 'https://stripe.test/setup' };
        },
      },
    };
    this.customers = {
      create: async (opts) => { S().customers.push(opts); return { id: 'cus_test_' + S().customers.length }; },
    };
    this.paymentIntents = {
      create: async (opts, extra) => {
        if (S().failPI) throw new Error('sepa_declined_stub');
        S().pis.push({ opts, idempotencyKey: extra && extra.idempotencyKey });
        return { id: 'pi_test_' + S().pis.length };
      },
      retrieve: async () => ({ latest_charge: { receipt_url: 'https://stripe.test/receipt' } }),
    };
    this.setupIntents = { retrieve: async () => S().setupIntent };
    this.charges = {
      retrieve: async () => ({ receipt_url: 'https://stripe.test/receipt', balance_transaction: { fee: 35 } }),
    };
    this.paymentMethods = { detach: async (id) => { S().detached.push(id); return {}; } };
    this.webhooks = { constructEvent: (rawBody) => JSON.parse(rawBody.toString()) };
  }
}
