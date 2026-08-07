// Mock del pacchetto 'stripe' per i test dei percorsi soldi.
// Registra ogni checkout.sessions.create in globalThis.__stripeCalls;
// constructEvent fa il parse del raw body senza verificare la firma
// (la verifica è di Stripe, non nostra — i test coprono la NOSTRA logica).
export default class Stripe {
  constructor() {
    this.checkout = {
      sessions: {
        create: async (opts) => {
          (globalThis.__stripeCalls ||= []).push(opts);
          return { id: 'cs_test_' + (globalThis.__stripeCalls.length), url: 'https://stripe.test/session' };
        },
      },
    };
    this.webhooks = {
      constructEvent: (rawBody) => JSON.parse(rawBody.toString()),
    };
    this.paymentIntents = {
      retrieve: async () => ({ latest_charge: { receipt_url: 'https://stripe.test/receipt' } }),
    };
  }
}
