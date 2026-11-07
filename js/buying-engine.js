/* BOOM buying enquiries: one vocabulary for the page, API and operator.
 * A destination is a REQUEST, never evidence of a local office or mandate.
 * Budget is total purchase funds, in its original currency, never rent. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_BUYING = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var countries = {
    AL:['Albania','Albania'], AD:['Andorra','Andorra'], AM:['Armenia','Armenia'], AT:['Austria','Austria'], AZ:['Azerbaijan','Azerbaigian'],
    BY:['Belarus','Bielorussia'], BE:['Belgium','Belgio'], BA:['Bosnia and Herzegovina','Bosnia ed Erzegovina'], BG:['Bulgaria','Bulgaria'],
    HR:['Croatia','Croazia'], CY:['Cyprus','Cipro'], CZ:['Czechia','Cechia'], DK:['Denmark','Danimarca'], EE:['Estonia','Estonia'],
    FI:['Finland','Finlandia'], FR:['France','Francia'], GE:['Georgia','Georgia'], DE:['Germany','Germania'], GR:['Greece','Grecia'],
    HU:['Hungary','Ungheria'], IS:['Iceland','Islanda'], IE:['Ireland','Irlanda'], IT:['Italy','Italia'], XK:['Kosovo','Kosovo'],
    LV:['Latvia','Lettonia'], LI:['Liechtenstein','Liechtenstein'], LT:['Lithuania','Lituania'], LU:['Luxembourg','Lussemburgo'],
    MT:['Malta','Malta'], MD:['Moldova','Moldavia'], MC:['Monaco','Monaco'], ME:['Montenegro','Montenegro'], NL:['Netherlands','Paesi Bassi'],
    MK:['North Macedonia','Macedonia del Nord'], NO:['Norway','Norvegia'], PL:['Poland','Polonia'], PT:['Portugal','Portogallo'],
    RO:['Romania','Romania'], RU:['Russia','Russia'], SM:['San Marino','San Marino'], RS:['Serbia','Serbia'], SK:['Slovakia','Slovacchia'],
    SI:['Slovenia','Slovenia'], ES:['Spain','Spagna'], SE:['Sweden','Svezia'], CH:['Switzerland','Svizzera'], TR:['Türkiye','Turchia'],
    UA:['Ukraine','Ucraina'], GB:['United Kingdom','Regno Unito'], VA:['Vatican City','Città del Vaticano']
  };
  var currencies = ['EUR','GBP','CHF','USD','ALL','AMD','AZN','BAM','BYN','CZK','DKK','GEL','HUF','ISK','MDL','MKD','NOK','PLN','RON','RSD','RUB','SEK','TRY','UAH'];
  var purposes = {home:['My home','Abitazione principale'], second_home:['Second home','Seconda casa'], investment:['Investment','Investimento'], undecided:['Still deciding','Da decidere']};
  var timelines = {soon:['Within 3 months','Entro 3 mesi'], six_months:['3–6 months','Tra 3 e 6 mesi'], later:['More than 6 months','Oltre 6 mesi'], exploring:['Exploring options','Sto valutando']};
  var needs = {search:['Find a property','Cercare un immobile'], found:['I already have a listing','Ho già un annuncio'], compare:['Compare destinations','Confrontare destinazioni']};
  var has = function (obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); };
  var clip = function (v, n) { return typeof v === 'string' ? v.trim().slice(0, n) : ''; };
  function parse(body) {
    body = body || {};
    var country = clip(body.country, 80).toUpperCase(), city = clip(body.city, 120);
    if (!has(countries, country)) return {error:'country_required', field:'country'};
    if (city.length < 2) return {error:'city_required', field:'city'};
    var raw = String(body.purchase_budget == null ? '' : body.purchase_budget).trim();
    // HTML number field: no thousands/decimal ambiguity, no silent rounding.
    if (raw && (!/^\d{1,12}$/.test(raw) || +raw < 1)) return {error:'budget_invalid', field:'purchase_budget'};
    var currency = clip(body.currency, 80).toUpperCase();
    if (currencies.indexOf(currency) < 0) return {error:'currency_required', field:'currency'};
    var purpose = has(purposes, body.purpose) ? body.purpose : 'undecided';
    var timeline = has(timelines, body.timeline) ? body.timeline : 'exploring';
    var need = has(needs, body.need) ? body.need : 'search';
    var phone = clip(body.phone, 40);
    if (phone && (!/^\+[1-9][\d ()-]{6,30}$/.test(phone) || !/^\+[1-9]\d{6,14}$/.test(phone.replace(/[ ()-]/g,'')))) return {error:'phone_international', field:'phone'};
    if (body.privacy !== true && body.privacy !== 'yes') return {error:'privacy_required', field:'privacy'};
    return {value:{country:country, countryLabel:countries[country][0], city:city, budget:raw ? +raw : null,
      currency:currency, budgetKind:'total_purchase', purpose:purpose, timeline:timeline, need:need,
      coverageStatus:'to_confirm', mandateStatus:'not_started', feeStatus:'not_quoted',
      privacyAcknowledged:true, phone:phone ? phone.replace(/[ ()-]/g,'') : null}};
  }
  function isBuyer(lead) {
    return !!lead && (lead.leadType === 'buyer' || lead.intent === 'purchase_search' || lead.sourceRef === 'buy-property-europe');
  }
  return {countries:countries, currencies:currencies, purposes:purposes, timelines:timelines, needs:needs, parse:parse, isBuyer:isBuyer};
}));
