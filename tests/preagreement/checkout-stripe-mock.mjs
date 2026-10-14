// Stripe transport only; every payment decision remains in the real handlers.
export default class Stripe {
  constructor() {
    this.checkout = { sessions: { create: async (params,options) => {
      globalThis.paCheckoutIO.checkouts.push(structuredClone(params));
      globalThis.paCheckoutIO.keys?.push(options?.idempotencyKey);
      if (globalThis.paCheckoutIO.failStripe) throw Error('synthetic_checkout_failure');
      const io=globalThis.paCheckoutIO;
      if(!io.idempotent)io.idempotent=new Map();
      const key=options?.idempotencyKey, existing=key&&io.idempotent.get(key);
      if(existing){if(JSON.stringify(existing.params)!==JSON.stringify(params))throw Error('idempotency_parameter_mismatch');return existing.session;}
      const session={ id: 'cs_test_' + io.checkouts.length, url: 'https://stripe.test/checkout', status:'open', payment_status:'unpaid', expires_at:params.expires_at, metadata:params.metadata, currency:'eur', amount_total:params.line_items.reduce((n,row)=>n+row.price_data.unit_amount*row.quantity,0) };
      if(!io.sessions)io.sessions={};io.sessions[session.id]=session;
      if(key)io.idempotent.set(key,{params:structuredClone(params),session});
      if(io.loseResponse){io.loseResponse=false;throw Error('synthetic_response_lost');}
      return session;
    }, retrieve:async id=>{const row=globalThis.paCheckoutIO.sessions?.[id];if(!row)throw Error('synthetic_session_missing');return structuredClone(row);} } };
  }
}
