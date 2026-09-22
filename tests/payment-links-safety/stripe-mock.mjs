export default class Stripe {
  constructor() {
    this.checkout = { sessions: {
      create: async opts => {
        const state = globalThis.__checkout;
        state.calls.push(opts);
        const id = 'cs_test_' + state.calls.length;
        const session = { id, url: 'https://checkout.stripe.test/' + id, status: 'open', payment_status: 'unpaid',
          currency: 'eur', amount_total: opts.line_items.reduce((n, item) => n + item.price_data.unit_amount * item.quantity, 0), metadata: opts.metadata };
        state.sessions.set(id, session);
        return session;
      },
      retrieve: async id => {
        if (globalThis.__checkout.readError) throw new Error('stripe_unavailable');
        const session = globalThis.__checkout.sessions.get(id);
        if (!session) throw Object.assign(new Error('not_found'), { code: 'resource_missing' });
        return session;
      },
      expire: async id => {
        globalThis.__checkout.expired.push(id);
        const session = globalThis.__checkout.sessions.get(id);
        if (session.status !== 'open') throw new Error('not_open');
        session.status = 'expired';
        return session;
      },
    } };
  }
}
