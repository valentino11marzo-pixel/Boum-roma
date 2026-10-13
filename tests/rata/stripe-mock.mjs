// Stripe finto per tests/rata/soldi.mjs: registra le sessioni create, sa
// ritrovarle per PaymentIntent (la strada dei rimborsi sulle rate nate prima),
// e restituisce i PaymentIntent con i metadata che la suite gli dà. Nessuna
// rete: tutto vive in globalThis.__rataStripe.
const S = () => (globalThis.__rataStripe ||= { calls: [], sessions: new Map(), expired: [], intents: new Map(), rejectSuffix: false });

export default class Stripe {
  constructor() {
    this.checkout = { sessions: {
      create: async (opts) => {
        const st = S();
        if (st.rejectSuffix && opts.payment_intent_data && opts.payment_intent_data.statement_descriptor_suffix) {
          throw new Error('Invalid statement_descriptor_suffix: the combined statement descriptor is too long');
        }
        st.calls.push(opts);
        const id = 'cs_rata_' + st.calls.length;
        const session = { id, url: 'https://checkout.stripe.test/' + id, status: 'open', payment_status: 'unpaid', currency: 'eur',
          amount_total: opts.line_items.reduce((n, it) => n + it.price_data.unit_amount * it.quantity, 0), metadata: opts.metadata, payment_intent: null };
        st.sessions.set(id, session);
        return session;
      },
      retrieve: async (id) => {
        const s = S().sessions.get(id);
        if (!s) throw Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' });
        return s;
      },
      expire: async (id) => {
        const s = S().sessions.get(id);
        S().expired.push(id);
        if (!s || s.status !== 'open') throw new Error('not_open');
        s.status = 'expired';
        return s;
      },
      list: async ({ payment_intent } = {}) => ({ data: [...S().sessions.values()].filter(s => s.payment_intent && s.payment_intent === payment_intent), has_more: false }),
    } };
    this.paymentIntents = {
      retrieve: async (id) => {
        const pi = S().intents.get(id);
        if (!pi) throw Object.assign(new Error('No such payment_intent'), { code: 'resource_missing' });
        return pi;
      },
    };
    this.webhooks = { constructEvent: (raw) => JSON.parse(raw.toString()) };
  }
}
