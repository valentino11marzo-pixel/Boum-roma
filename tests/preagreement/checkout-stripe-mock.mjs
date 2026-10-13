// Stripe transport only; every payment decision remains in the real handlers.
export default class Stripe {
  constructor() {
    this.checkout = { sessions: { create: async params => {
      globalThis.paCheckoutIO.checkouts.push(structuredClone(params));
      if (globalThis.paCheckoutIO.failStripe) throw Error('synthetic_checkout_failure');
      return { id: 'cs_test_' + globalThis.paCheckoutIO.checkouts.length, url: 'https://stripe.test/checkout' };
    } } };
  }
}
