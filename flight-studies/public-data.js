(() => {
  'use strict';
  // Presentation only. Commercial copy stays in the generated public manifest.
  const origin = 'https://www.boomrome.com';
  const cities = ['amsterdam', 'barcelona', 'berlin', 'london', 'madrid', 'milan', 'paris', 'valencia'];
  const plans = ['full-search', 'application-pack', 'attended-viewing'];
  let pending;
  function normalize(source) {
    if (!source || typeof source.cities !== 'object') throw new Error('Public desk configuration unavailable');
    const result = { refund: source.refund || {}, cities: {} };
    for (const slug of cities) {
      const city = source.cities[slug];
      if (!city?.live || !city.city || !['EUR', 'GBP'].includes(city.currency) || !['checkout', 'signing'].includes(city.chargeAt)) continue;
      const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: city.currency, maximumFractionDigits: 0 });
      const offers = (city.pricing?.plans || []).filter(plan => plans.includes(plan.id) && Number.isFinite(plan.price) && plan.price >= 0 && plan.label && Array.isArray(plan.includes)).map(plan => ({
        ...plan,
        url: `${origin}/${slug}#fare-${plan.id}`,
        priceDisplay: formatter.format(plan.price),
        paymentNote: [city.pricing.sub, plan.trigger].filter(Boolean).join(' '),
        refundNote: city.chargeAt === 'checkout' && plan.id === 'full-search' ? source.refund?.rule || '' : ''
      }));
      result.cities[slug] = {
        ...city,
        name: city.city,
        url: `${origin}/${slug}`,
        termsUrl: `${origin}/terms#city-desks`,
        tenantSideNote: 'Tenant-side rental support.',
        pricing: { ...city.pricing, plans: offers }
      };
    }
    return result;
  }
  window.BoomStudyPublicData = Object.freeze({
    load() {
      if (!pending) pending = fetch('/assets/boom-desks-public.json').then(response => {
        if (!response.ok) throw new Error('Public desk configuration unavailable');
        return response.json();
      }).then(normalize);
      return pending;
    }
  });
})();
