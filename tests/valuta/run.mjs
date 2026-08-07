// tests/valuta/run.mjs — la valutazione proprietari: i numeri sono del
// motore, l'onestà è del campione, e la macchina da inquilini TACE.
//
// Tre promesse:
// 1. LA PAGINA PUBBLICA E IL FASCICOLO NON POSSONO DIVERGERE: la stima usa
//    js/canone-engine.js (lo stesso dell'attestazione ARPE). Qui non si
//    ricontrolla l'aritmetica del motore (ha la sua suite): si controlla che
//    l'endpoint restituisca ESATTAMENTE ciò che il motore calcola.
// 2. SOTTO CAMPIONE NIENTE NUMERI: marketStats con asked.ok=false non deve
//    far uscire nemmeno un €/mq — "campione in costruzione" non è un numero
//    debole, è l'assenza dichiarata del numero.
// 3. UN PROPRIETARIO NON RICEVE MAI LA RISPOSTA DA INQUILINO: il lead entra
//    con leadType landlord, il Commerciale si astiene (guardia PRIMA della
//    bozza), e il WhatsApp precompilato parla del SUO immobile — mai un link
//    al catalogo. La guardia copre anche le porte già esistenti (canone-lead
//    scrive leadType landlord dal 2026, owners.html scrive intent 'owner').
//
// Run: node tests/valuta/run.mjs

import { readFileSync } from 'node:fs';
import CANONE from '../../js/canone-engine.js';
import { isOwnerLead, ownerReplyText, isReunion } from '../../api/_market.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
};
const r10 = v => Math.round(v / 10) * 10;

// ── Firestore finto: fetch intercettata come nelle altre suite ──────────────
let written = [];
let statsDocs = {};        // slug -> doc marketStats (fields REST) o assente
const toFs = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, x] of Object.entries(v)) fields[k] = toFs(x);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
};
const plain = v => {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain);
  if ('mapValue' in v) {
    const o = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) o[k] = plain(val);
    return o;
  }
  return v;
};

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit') || u.includes('securetoken')) {
    return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin' }) };
  }
  if (u.includes('firestore.googleapis.com')) {
    const method = opts.method || 'GET';
    if (method === 'GET') {
      const m = u.match(/documents\/(.+)$/);
      const path = m ? decodeURIComponent(m[1]) : '';
      if (path.startsWith('marketStats/')) {
        const slug = path.split('/')[1];
        if (statsDocs[slug]) {
          return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/' + path, fields: toFs(statsDocs[slug]).mapValue.fields }) };
        }
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
    }
    if (method === 'POST') {
      written.push({ url: u, body: JSON.parse(opts.body || '{}') });
      return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/leads/vl123' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }
  // SMTP & co. non passano da fetch: qualunque altra URL risponde vuoto.
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

const handler = (await import('../../api/owners/valuta.js')).default;
const { buildEstimate, zoneSlugCandidates } = await import('../../api/owners/valuta.js');

const leadDoc = () => {
  const w = written.find(x => x.url.includes('/leads'));
  if (!w) return null;
  const o = {};
  for (const [k, v] of Object.entries(w.body.fields || {})) o[k] = plain(v);
  return o;
};

let ipSeq = 0;
function call(body, ip) {
  written = [];
  let code = 0, payload = null;
  const res = {
    setHeader() {}, status(c) { code = c; return this; },
    json(j) { payload = j; return this; }, end() { return this; },
  };
  const headers = { 'x-forwarded-for': ip || `10.1.0.${++ipSeq}` };
  return handler({ method: 'POST', headers, body, socket: {} }, res)
    .then(() => ({ code, payload, lead: leadDoc(), writes: [...written] }));
}

const PIGNETO_STATS = {
  zone: 'pigneto', activeCount: 11,
  asked: { ok: true, sample: 9, medianEurSqm: 15, p25: 12, p75: 18 },
  absorption: { ok: true, sample: 6, medianDays: 14 },
  priceDrops30d: 2,
};

console.log('\n\x1b[1m▸ la stima dice ciò che dice il MOTORE (mai un\'altra aritmetica)\x1b[0m');
{
  statsDocs = {};
  const r = await call({ op: 'estimate', zonaCod: 'C30', zona: 'Pigneto', mq: 80 });
  ok('200 con estimate', r.code === 200 && r.payload.ok && r.payload.estimate, r.payload);
  const c = r.payload.estimate.concordato;
  const zona = CANONE.matchZone('C30');
  const expected = CANONE.computeCanone({ zona, mq: 80, parIdx: [], mag: [] });
  ok('zona riconosciuta dal codice accordo', c && c.zonaCod === 'C30' && /PIGNETO/.test(c.zonaNome));
  ok('fascia = quella del motore (0 parametri → A)', c.fascia === expected.fascia && c.fascia === 'A', c && c.fascia);
  ok('range mensile = motore (±arrotondamento €10)', c.monthlyMin === r10(expected.cMin) && c.monthlyMax === r10(expected.cMax), { c, exp: { min: expected.cMin, max: expected.cMax } });
  ok('€/mq di fascia esposti come nel motore', c.eurMqMin === expected.fMin && c.eurMqMax === expected.fMax);
  ok('nessuna scrittura su un estimate', r.writes.length === 0, r.writes.length);
}
{
  const feats = ['ascensore', 'balcone o terrazzo', 'aria condizionata'];
  const r = await call({ op: 'estimate', zonaCod: 'C30', mq: 80, features: feats });
  const c = r.payload.estimate.concordato;
  const der = CANONE.deriveParametri(feats);
  ok('3 feature vere → 3 parametri → fascia B (soglia sMed)', c.nP === der.parIdx.length && c.nP === 3 && c.fascia === 'B', { nP: c.nP, fascia: c.fascia });
}
{
  const r = await call({ op: 'estimate', zona: 'zona inventata su Marte', mq: 80 });
  ok('zona sconosciuta: 200, concordato assente, MAI un numero inventato', r.code === 200 && r.payload.estimate.concordato === null);
}
{
  const r = await call({ op: 'estimate', zonaCod: 'C30', mq: 4 });
  ok('mq impossibili → 400', r.code === 400 && r.payload.error === 'mq_non_validi');
}

console.log('\n\x1b[1m▸ il mercato del Perito: numeri solo col campione\x1b[0m');
{
  statsDocs = { pigneto: PIGNETO_STATS };
  const r = await call({ op: 'estimate', zonaCod: 'C30', zona: 'Pigneto', mq: 80 });
  const m = r.payload.estimate.market;
  ok('col campione: mediana mensile = €/mq × mq', m.ok === true && m.monthlyMedian === r10(15 * 80), m);
  ok('fascia p25–p75 esposta', m.monthlyP25 === r10(12 * 80) && m.monthlyP75 === r10(18 * 80));
  ok('assorbimento provato esposto', m.absorptionDays === 14 && m.absorptionSample === 6);
  ok('ampiezza campione dichiarata', m.sample === 9 && m.activeCount === 11);
}
{
  statsDocs = { pigneto: { ...PIGNETO_STATS, asked: { ok: false, reason: 'small_sample', sample: 3 }, absorption: { ok: false, sample: 1 } } };
  const r = await call({ op: 'estimate', zonaCod: 'C30', zona: 'Pigneto', mq: 80 });
  const m = r.payload.estimate.market;
  ok('sotto campione: ok=false e il MOTIVO', m.ok === false && m.reason === 'small_sample' && m.sample === 3, m);
  ok('...e NESSUN numero trapela', !('eurMqMedian' in m) && !('monthlyMedian' in m), Object.keys(m));
}
{
  statsDocs = {};
  const r = await call({ op: 'estimate', zonaCod: 'C30', zona: 'Pigneto', mq: 80 });
  ok('zona mai osservata: no_zone_data, non un guasto', r.code === 200 && r.payload.estimate.market.ok === false && r.payload.estimate.market.reason === 'no_zone_data');
}
{
  const cands = zoneSlugCandidates('Salario Trieste', 'SALARIO TRIESTE (Via dei Laghi/Corsica)');
  ok('gli slug provano anche la forma senza parentesi', cands.includes('salario-trieste'), cands);
  ok('e le parole singole', cands.includes('trieste'), cands);
}

console.log('\n\x1b[1m▸ il verdetto sul canone atteso\x1b[0m');
{
  statsDocs = { pigneto: PIGNETO_STATS };
  const zona = CANONE.matchZone('C30');
  const exp = CANONE.computeCanone({ zona, mq: 80, parIdx: [], mag: [] });
  const troppo = Math.round(exp.cMax + 200);
  const r = await call({ op: 'estimate', zonaCod: 'C30', zona: 'Pigneto', mq: 80, canoneAtteso: troppo });
  const p = r.payload.estimate.position;
  ok('sopra il massimo asseverabile: fits=false con lo sforamento esatto', p.concordato.fits === false && p.concordato.excess === troppo - r10(exp.cMax), p.concordato);
  ok('posizione di mercato presente (banda, mai un percentile finto)', p.market && typeof p.market.band === 'string' && typeof p.market.vsMedianPct === 'number', p.market);
}
{
  const r = await call({ op: 'estimate', zonaCod: 'C30', mq: 80, canoneAtteso: 400 });
  ok('dentro la fascia: fits=true', r.payload.estimate.position.concordato.fits === true);
}

console.log('\n\x1b[1m▸ la porta del lead: chi entra, chi no, in che schema\x1b[0m');
const GOOD = { op: 'lead', zonaCod: 'C30', zona: 'Pigneto', mq: 80, camere: 3, name: 'Marco Verdi', email: 'marco@example.it', phone: '333 1234567', address: 'Via del Pigneto 12', message: 'Libero da ottobre.' };
{
  statsDocs = { pigneto: PIGNETO_STATS };
  const r = await call({ ...GOOD, company: 'bot inc' });
  ok('honeypot: 200 e il bot non impara niente', r.code === 200 && r.payload.ok);
  ok('...e ZERO scritture', r.writes.length === 0, r.writes.length);
}
{
  const r = await call({ ...GOOD, name: '' });
  ok('senza nome: rifiutato senza scrivere', r.code === 400 && r.writes.length === 0);
}
{
  const r = await call({ ...GOOD, email: 'non-valida', phone: '12' });
  ok('senza recapito utilizzabile: rifiutato', r.code === 400 && r.payload.error === 'contact_required');
}
{
  statsDocs = { pigneto: PIGNETO_STATS };
  const r = await call(GOOD);
  ok('lead scritto', r.code === 200 && r.lead, r.payload);
  ok('leadType landlord (la guardia del Commerciale lo legge)', r.lead.leadType === 'landlord');
  ok('intent valuta_owner', r.lead.intent === 'valuta_owner');
  ok('schema leads: status new + source web (il Brain lo vede)', r.lead.status === 'new' && r.lead.source === 'web');
  ok('il riassunto GRIDA il lato in prima posizione', /^PROPRIETARIO — Valutazione/.test(r.lead.message), r.lead.message);
  ok('zona e metratura nel riassunto', /PIGNETO/.test(r.lead.message) && /80 mq/.test(r.lead.message));
  ok('la stima viaggia nel riassunto (concordato)', /concordato €/.test(r.lead.message), r.lead.message);
  ok('le SUE parole restano', r.lead.message.includes('Libero da ottobre'));
  ok('indirizzo conservato', r.lead.propertyAddress === 'Via del Pigneto 12');
  ok('lingua: italiano (la pagina è in italiano — la scelta di reunion-lead)', r.lead.language === 'it');
  ok('snapshot stima in raw (per il Commerciale umano)', r.lead.raw && r.lead.raw.estimate && r.lead.raw.estimate.concordato && typeof r.lead.raw.estimate.concordato.max === 'number');
  const iLead = r.writes.findIndex(w => w.url.includes('/leads'));
  const iNotif = r.writes.findIndex(w => w.url.includes('agentNotifications'));
  ok('il lead si scrive PRIMA della notifica (una notifica rotta non lo annulla)', iLead > -1 && iNotif > iLead, { iLead, iNotif });
  const notif = r.writes[iNotif];
  ok('la notifica dice PROPRIETARIO', /PROPRIETARIO/.test(plain(notif.body.fields.summary)));
}
{
  const ip = '203.0.113.77';
  let last = null;
  for (let i = 0; i < 7; i++) last = await call({ ...GOOD, name: `Test ${i}` }, ip);
  ok('la 7ª richiesta dalla stessa IP è rifiutata', last.code === 429, last.code);
  ok('...senza scrivere', last.writes.length === 0);
}

console.log('\n\x1b[1m▸ chi è un proprietario — e chi no\x1b[0m');
{
  ok('leadType landlord → sì (valuta, canone-lead, réunion bailleur)', isOwnerLead({ leadType: 'landlord' }));
  ok('intent owner → sì (form owners.html via partners/submit)', isOwnerLead({ intent: 'owner' }));
  ok('intent valuta_owner → sì', isOwnerLead({ intent: 'valuta_owner' }));
  ok('un inquilino NO', !isOwnerLead({ leadType: 'tenant' }) && !isOwnerLead({ intent: 'apply' }));
  ok('un acheteur réunionnais NO (compra, non affida)', !isOwnerLead({ leadType: 'buyer', intent: 'reunion_buyer' }));
  ok('un lead qualsiasi NO', !isOwnerLead({ source: 'whatsapp', message: 'cerco casa' }) && !isOwnerLead({}) && !isOwnerLead(null));
  ok('un proprietario réunionnais è ANCHE réunionnais (e lì vince la Réunion)', isOwnerLead({ leadType: 'landlord', market: 'reunion' }) && isReunion({ leadType: 'landlord', market: 'reunion' }));
}
{
  const it = ownerReplyText({ name: 'Marco Verdi', leadType: 'landlord', zone: 'PIGNETO' });
  ok('messaggio in italiano, col nome di battesimo', it.startsWith('Ciao Marco,') && !it.includes('Verdi'));
  ok('parla del SUO immobile e della SUA zona', /tuo immobile/.test(it) && /PIGNETO/.test(it));
  ok('MAI un link al catalogo (non gli stiamo vendendo una casa)', !/apartments|boomrome\.com\/listing/.test(it), it);
  ok('firma la voce di Roma (Valentino)', /Valentino/.test(it));
  const en = ownerReplyText({ name: 'John Smith', leadType: 'landlord', message: 'Hello, I would like to rent out my flat in Rome, please contact me.' });
  ok('se le SUE parole sono inglesi, la risposta è inglese', /^Hi John,/.test(en) && /your property/.test(en), en);
  ok('senza nome la formula regge', ownerReplyText({ leadType: 'landlord' }).startsWith('Ciao, sono Valentino'));
}

console.log('\n\x1b[1m▸ le guardie stanno nel codice che spende e spedisce (ordine, non presenza)\x1b[0m');
{
  const com = readFileSync(new URL('../../api/employees/commerciale.js', import.meta.url), 'utf8');
  ok('il Commerciale importa isOwnerLead', /import\s*\{[^}]*isOwnerLead[^}]*\}\s*from\s*'\.\.\/_market\.js'/.test(com));
  const guard = com.indexOf('if (isOwnerLead(lead)) continue;');
  const firstDraft = com.indexOf('proposeFirstReply(lead');
  ok('…ed esce PRIMA di redigere qualunque bozza', guard > -1 && firstDraft > -1 && guard < firstDraft, { guard, firstDraft });

  const notif = readFileSync(new URL('../../api/telegram/notify-pending.js', import.meta.url), 'utf8');
  ok('la card Telegram importa la regola', /isOwnerLead,\s*ownerReplyText/.test(notif));
  const iRe = notif.indexOf('isReunion(l) ? reunionReplyText(l)');
  const iOw = notif.indexOf('isOwnerLead(l) ? ownerReplyText(l)');
  const iGeneric = notif.indexOf(': inThread');
  ok('ordine: Réunion prima (un bailleur réunionnais parla francese), proprietario poi, generico ultimo',
    iRe > -1 && iOw > iRe && iGeneric > iOw, { iRe, iOw, iGeneric });
  ok('la card ha l\'intestazione PROPRIETARIO', /PROPRIETARIO — offre un immobile/.test(notif));
}

console.log('\n\x1b[1m▸ la pagina dice la stessa cosa del server\x1b[0m');
{
  const root = new URL('../../', import.meta.url);
  const page = readFileSync(new URL('valuta.html', root), 'utf8');
  ok('le zone vengono dal MOTORE, non da una copia inline', page.includes('/js/canone-engine.js') && page.includes('BOOM_CANONE.ZONES') && !/const ZONE\s*=\s*\[/.test(page));
  ok('il form posta sul suo endpoint', page.includes("fetch('/api/owners/valuta'"));
  ok('honeypot presente su entrambi i form', (page.match(/name="company"/g) || []).length >= 2);
  const title = (page.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const desc = (page.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  ok(`titolo da SERP (${title.length} car.)`, title.length > 0 && title.length <= 60, title);
  ok(`description da SERP (${desc.length} car.)`, desc.length >= 120 && desc.length <= 165, desc.length);
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  let parsed = [];
  try { parsed = blocks.map(b => JSON.parse(b)); ok('JSON-LD valido', true); }
  catch (e) { ok('JSON-LD valido', false, e.message); }
  const graph = parsed[0] && parsed[0]['@graph'] || [];
  const faq = graph.find(b => b['@type'] === 'FAQPage');
  const summaries = [...page.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const orphans = faq ? faq.mainEntity.filter(q => !summaries.some(s => s.includes(norm(q.name)))) : ['(niente FAQPage)'];
  ok('ogni domanda del markup è VISIBILE in pagina', orphans.length === 0, orphans.map(o => o.name || o));
  const svc = graph.find(b => b['@type'] === 'Service');
  ok('il Service dichiara il pubblico (proprietari) e il prezzo (0)', svc && svc.audience && /Proprietari/.test(svc.audience.audienceType) && svc.offers && svc.offers.price === '0');
  const wp = graph.find(b => b['@type'] === 'WebPage');
  const sels = (wp && wp.speakable && wp.speakable.cssSelector) || [];
  ok('gli speakable puntano a nodi che esistono', sels.length > 0 && sels.every(sel => page.includes(sel.replace('.', 'class="').split(' ')[0]) || page.includes(sel.replace('.', ''))), sels);
  ok('l\'onestà del campione è promessa ANCHE in pagina', /[Cc]ampione (di zona )?in costruzione/.test(page));

  // La card social è un file VERO del repo (BOOMsocialprofile.png, usata da
  // mezzo sito, non esiste su disco: og che 404a — qui non si eredita).
  const og = readFileSync(new URL('og-valuta.png', root));
  const isPng = og.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const w = og.readUInt32BE(16), h = og.readUInt32BE(20);
  ok('og-valuta.png esiste ed è un PNG vero', isPng);
  ok('formato social 1200×630', w === 1200 && h === 630, { w, h });
  ok('la pagina la dichiara (og + twitter)', (page.match(/og-valuta\.png/g) || []).length >= 2);
  ok('non eredita l\'immagine fantasma', !page.includes('BOOMsocialprofile.png'));

  const sitemap = readFileSync(new URL('sitemap.xml', root), 'utf8');
  ok('sitemap la lista', sitemap.includes('https://www.boomrome.com/valuta'));
  const llms = readFileSync(new URL('llms.txt', root), 'utf8');
  ok('llms.txt la presenta (con la regola del campione)', llms.includes('/valuta') && /sample is too small/.test(llms));
  const vercel = readFileSync(new URL('vercel.json', root), 'utf8');
  ok('rewrite /valuta presente', vercel.includes('"source": "/valuta"'));
  ok('la porta italiana /proprietari porta alla landing owners', /"source":\s*"\/proprietari",\s*\n\s*"destination":\s*"\/owners"/.test(vercel));
  const owners = readFileSync(new URL('owners.html', root), 'utf8');
  ok('owners.html manda i proprietari alla valutazione', owners.includes('href="/valuta"'));
}

console.log(`\n${fail === 0 ? '\x1b[32m\x1b[1m' : '\x1b[31m\x1b[1m'}Valutazione proprietari: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
