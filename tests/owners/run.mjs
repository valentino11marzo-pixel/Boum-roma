// tests/owners/run.mjs — la pagina /owners e la sua porta (api/owner-lead.js).
//
// Quattro promesse, in ordine di costo se si rompono.
//
// 1. IL PROPRIETARIO NON FINISCE NELLA MACCHINA INQUILINO. Chi OFFRE una casa
//    deve essere B2B per isB2B(): altrimenti il Commerciale gli redige la
//    prima risposta con la persona dell'inquilino («ti andrebbe una visita?»)
//    e il follow-up «stai ancora cercando casa a Roma?». Era gia' vero per i
//    lead del calcolatore /canone (leadType 'landlord', source 'web'): la
//    regressione e' pinnata qui, insieme alla Réunion che resta fuori.
//
// 2. LA RISPOSTA PRONTA PARLA COL LEI E NON RICHIEDE CIO' CHE SAPPIAMO. La
//    dottrina delle risposte rapide (famiglia `pr`) dice «sempre col LEI»;
//    il vecchio messaggio dava del tu e chiedeva zona/libero/arredato a chi
//    l'aveva appena scritto nel modulo.
//
// 3. UNA CARD, ALLA PORTA, E NESSUNA SCRITTURA DOPO LA RISPOSTA. Il ping
//    Telegram parte dall'endpoint (un proprietario non aspetta il voto del
//    Brain), ogni bottone e' un URL che Telegram accetta (un mailto: fa
//    cadere il messaggio INTERO), il lead e' marcato cosi' notify-pending non
//    lo ripete — e tutto avviene PRIMA di res.json (la lezione del 13/09).
//
// 4. LA PAGINA PROMETTE SOLO CIO' CHE ESISTE, E HA UNA PORTA SOLA. Ogni campo
//    che il modulo manda esiste nell'endpoint, ogni valore delle tendine e'
//    una chiave chiusa del server, le frasi che il codice NON sostiene (la
//    vecchia pagina vendeva «supporto 24/7» e «preventivi approvabili
//    online») non possono tornare, e le domande del FAQPage sono visibili.
//
// Run: node tests/owners/run.mjs

import { readFileSync, existsSync } from 'node:fs';
import { isB2B, b2bSide, b2bReplyText, ownerReplyText, isReunion } from '../../api/_market.js';

const R = new URL('../../', import.meta.url).pathname;
const read = f => readFileSync(R + f, 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`); }
};

// ── rete finta: Firestore REST + Telegram, con l'ORDINE delle chiamate ──
let calls = [];
let tgMode = 'ok';          // 'ok' | 'fail'
let respondedAt = null;     // indice della prima chiamata DOPO res.json
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = opts.method || 'GET';
  calls.push({ u, method, body: opts.body ? JSON.parse(opts.body) : null });
  if (u.includes('identitytoolkit') || u.includes('securetoken')) {
    return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin' }) };
  }
  if (u.includes('api.telegram.org')) {
    if (tgMode === 'fail') return { ok: true, status: 200, json: async () => ({ ok: false, description: 'Bad Request: BUTTON_URL_INVALID' }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 4242 } }) };
  }
  if (u.includes('firestore.googleapis.com')) {
    if (method === 'POST') return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/leads/own123' }), text: async () => '' };
    if (method === 'PATCH') return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    return { ok: true, status: 200, json: async () => ({ documents: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const mod = await import('../../api/owner-lead.js');
const handler = mod.default;
const { FREE_FROM, GOALS, ROOMS, FURNISHED, splitContact, ownerSummary, ownerCard } = mod;

const plain = v => {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) { const o = {}; for (const [k, val] of Object.entries(v.mapValue.fields || {})) o[k] = plain(val); return o; }
  return v;
};
const docOf = c => { const o = {}; for (const [k, v] of Object.entries((c && c.body && c.body.fields) || {})) o[k] = plain(v); return o; };

let ipSeq = 0;
async function call(body, ip) {
  calls = []; respondedAt = null;
  let code = 0, payload = null;
  const res = {
    setHeader() {}, status(c) { code = c; return this; },
    json(j) { payload = j; respondedAt = calls.length; return this; }, end() { respondedAt = calls.length; return this; },
  };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': ip || `10.9.0.${++ipSeq}`, 'user-agent': 'test' }, body }, res);
  const create = calls.find(c => c.method === 'POST' && c.u.includes('/leads'));
  return {
    code, payload, lead: create ? docOf(create) : null,
    writes: calls.filter(c => c.u.includes('firestore') && c.method !== 'GET'),
    tg: calls.filter(c => c.u.includes('api.telegram.org')),
    patches: calls.filter(c => c.method === 'PATCH' && c.u.includes('/leads/')),
    after: respondedAt == null ? null : calls.length - respondedAt,
  };
}

const OWNER = {
  name: 'Giulia Rossi', contact: '+39 333 123 4567', zone: 'Prati',
  freeFrom: 'now', goal: 'full', sqm: '65', rooms: '2', furnished: 'yes', rent: '1.450',
  message: '', lang: 'it', attribution: 'outreach/email/owners_2026',
};

console.log('\n\x1b[1m▸ la porta: chi entra e chi no\x1b[0m');
{
  const r = await call({ ...OWNER, company: 'bot srl' });
  ok('il pot di miele risponde 200 senza dire nulla al bot', r.code === 200 && r.payload.ok === true);
  ok('...e non scrive niente, non manda niente', r.writes.length === 0 && r.tg.length === 0);
}
{
  const r = await call({ ...OWNER, name: '' });
  ok('senza nome: rifiutato', r.code === 400 && r.payload.error === 'name_required');
  ok('un rifiuto non scrive mai un lead a metà', r.writes.length === 0);
}
{
  const r = await call({ ...OWNER, contact: 'domani' });
  ok('senza un recapito vero: rifiutato (non potremmo rispondere)', r.code === 400 && r.payload.error === 'contact_required');
}
{
  const a = splitContact('giulia.rossi@example.it');
  const b = splitContact('+39 333 123 4567');
  const c = splitContact('giulia@example.it — 333 1234567');
  ok('il campo unico: un\'email resta un\'email', a.email === 'giulia.rossi@example.it' && !a.phone, a);
  ok('...un numero resta un numero', b.phone === '+39 333 123 4567' && !b.email, b);
  ok('...ed entrambi nello stesso campo si salvano entrambi', c.email === 'giulia@example.it' && /333 ?1234567/.test(c.phone || ''), c);
}
{
  const r = await call({ ...OWNER, contact: 'giulia@example.it' });
  ok('l\'email da sola basta', r.code === 200 && r.lead.email === 'giulia@example.it' && r.lead.phone === null, r.lead);
}
{
  const r = await call({ ...OWNER, rent: '350000', sqm: '3', freeFrom: 'domani', goal: 'vendere', rooms: '9', furnished: 'boh' });
  const o = r.lead.owner;
  ok('un prezzo di vendita nel campo del canone NON diventa «€350.000/mese»', o.rent === null && !/350\.000/.test(r.lead.message), o);
  ok('metri impossibili → null, mai un numero inventato', o.sqm === null);
  ok('valori fuori dalle liste chiuse → null, mai un\'etichetta inventata',
    o.freeFrom === null && o.goal === null && o.rooms === null && o.furnished === null, o);
}
{
  const ip = '10.99.99.99';
  let last;
  for (let i = 0; i < 7; i++) last = await call(OWNER, ip);
  ok('il limite per IP scatta al settimo invio in dieci minuti', last.code === 429 && last.writes.length === 0, last.code);
}

console.log('\n\x1b[1m▸ il lead: un PROPRIETARIO, con l\'immobile in una riga\x1b[0m');
{
  const r = await call(OWNER);
  const l = r.lead;
  ok('leadType landlord e intent owner', l.leadType === 'landlord' && l.intent === 'owner', { t: l.leadType, i: l.intent });
  ok('mercato roma, sorgente web, stato new', l.market === 'roma' && l.source === 'web' && l.status === 'new');
  ok('il budget resta vuoto: è un concetto dell\'inquilino', l.budget === null);
  ok('il riassunto comincia da PROPRIETARIO — Roma', /^PROPRIETARIO — Roma · Prati/.test(l.message), l.message);
  ok('...e porta mq, locali, arredo, disponibilità e richiesta',
    ['65 mq', 'bilocale', 'arredato', 'libero da subito', 'chiede: affitto + gestione completa'].every(x => l.message.includes(x)), l.message);
  ok('«1.450» è 1450 euro, non un euro e mezzo', l.owner.rent === 1450 && l.message.includes('€1.450/mese'), l.owner.rent);
  ok('la fonte della campagna viaggia sul lead', l.attribution === 'outreach/email/owners_2026');
  ok('lingua: quella della pagina scelta (it)', l.language === 'it');
  const en = await call({ ...OWNER, lang: 'en' });
  ok('...e en quando la pagina era in inglese', en.lead.language === 'en');
}
{
  const s = ownerSummary({ zone: null });
  ok('un riassunto vuoto resta onesto, senza segnaposto', s === 'PROPRIETARIO — Roma.', s);
}

console.log('\n\x1b[1m▸ la voce: il proprietario non riceve mai la voce dell\'inquilino\x1b[0m');
{
  const r = await call(OWNER);
  ok('il lead della pagina è B2B (il Commerciale TACE)', isB2B(r.lead));
  ok('...dal lato owner', b2bSide(r.lead) === 'owner');
  ok('...e non è réunionnais', !isReunion(r.lead));
  // La regressione di classe: i lead del calcolatore /canone.
  const canone = { source: 'web', leadType: 'landlord', intent: 'canone_check', service: 'Canone Check', message: 'Richiesta calcolo certificato canone concordato — Zona: Prati.' };
  ok('il lead del calcolatore /canone è B2B (prima riceveva la voce inquilino)', isB2B(canone) && b2bSide(canone) === 'owner');
  ok('la Réunion resta fuori: ha la SUA guardia', !isB2B({ market: 'reunion', leadType: 'landlord', intent: 'reunion_owner' }));
  ok('un inquilino resta un inquilino', !isB2B({ source: 'web', leadType: 'tenant', intent: 'apply' }));
}
{
  const txt = b2bReplyText({ name: 'Giulia Rossi', leadType: 'landlord', intent: 'owner', language: 'it',
    owner: { zone: 'Prati', sqm: 65, furnished: 'yes', freeFrom: 'now', lang: 'it', note: null } });
  ok('col LEI: «Buongiorno», «suo immobile»', /^Buongiorno Giulia/.test(txt) && /suo immobile/.test(txt), txt);
  ok('...mai del tu', !/\b(tuo|tua|ti torno|darti|scritto del tuo)\b/i.test(txt), txt);
  ok('non richiede ciò che ha già scritto (zona, libero, arredo)', !/in che zona|da quando|se è arredat/.test(txt), txt);
  ok('...lo riconosce invece', /Prati/.test(txt) && /65 mq, arredato, libero da subito/.test(txt), txt);
  ok('firmato Valentino, coi numeri per iscritto in giornata', /Valentino/.test(txt) && /numeri per iscritto/.test(txt));
  const partial = ownerReplyText({ name: 'Marco', owner: { zone: 'Monti', lang: 'it' } });
  ok('chiede SOLO ciò che manca', /da quando è libero e se è arredato/.test(partial) && !/in che zona/.test(partial), partial);
  const en = ownerReplyText({ name: 'John Smith', language: 'en', owner: { zone: 'Monti', lang: 'en' } });
  ok('in inglese se la pagina era inglese e non ha scritto parole sue', /^Hi John/.test(en), en);
  const theirs = ownerReplyText({ name: 'John', language: 'en', owner: { lang: 'en', note: 'Buongiorno, vorrei affittare il mio appartamento a Monti.' } });
  ok('...ma le SUE parole battono la pagina', /^Buongiorno John/.test(theirs), theirs);
  const noOwner = b2bReplyText({ name: 'Giulia', source: 'partner', intent: 'owner', partner: { kind: 'owner' }, message: 'Salve, vorrei proporvi il mio appartamento, sono disponibile quando volete.' });
  ok('un proprietario dal vecchio modulo partner riceve la stessa voce', /^Buongiorno Giulia/.test(noOwner) && /in che zona/.test(noOwner), noOwner);
}

console.log('\n\x1b[1m▸ la card alla porta: una sola, valida, prima della risposta\x1b[0m');
process.env.TELEGRAM_CHAT_ID = '123';
process.env.TELEGRAM_BOT_TOKEN = 'tok';
{
  tgMode = 'ok';
  // Telefono E email: ogni ramo della card deve girare, anche quello che
  // tenterebbe un bottone email (mailto:, che Telegram rifiuta).
  const r = await call({ ...OWNER, contact: 'giulia@example.it — +39 333 123 4567' });
  ok('una card Telegram, subito', r.tg.length === 1, r.tg.length);
  ok('...con entrambi i recapiti nel testo', /333 123 4567/.test(r.tg[0].body.text) && /giulia@example\.it/.test(r.tg[0].body.text), r.tg[0].body.text);
  const body = r.tg[0] && r.tg[0].body;
  const btns = ((body && body.reply_markup && body.reply_markup.inline_keyboard) || []).flat();
  ok('ogni bottone è un URL https (un mailto: farebbe cadere il messaggio intero)',
    btns.length > 0 && btns.every(b => /^https:\/\//.test(b.url || '')), btns.map(b => b.url && b.url.slice(0, 20)));
  const wa = btns.find(b => /wa\.me/.test(b.url || ''));
  ok('il WhatsApp porta il messaggio già scritto col Lei', wa && decodeURIComponent(wa.url).includes('Buongiorno Giulia'), wa && wa.url.slice(0, 80));
  ok('il numero nazionale diventa internazionale nel link', wa && /wa\.me\/393331234567\?/.test(wa.url), wa && wa.url.slice(0, 40));
  ok('la card dice chi è e cosa chiede', /Proprietario: Giulia Rossi/.test(body.text) && /affitto \+ gestione completa/.test(body.text), body.text);
  ok('il lead viene marcato: notify-pending non lo ripete', r.patches.some(p => p.u.includes('/leads/own123') && 'telegramNotifiedAt' in ((p.body || {}).fields || {})));
  ok('NESSUNA chiamata dopo la risposta (le scritture dopo res.json si perdono)', r.after === 0, r.after);
}
{
  tgMode = 'fail';
  const r = await call(OWNER);
  ok('Telegram giù: il proprietario riceve comunque il suo 200', r.code === 200 && r.payload.ok === true);
  ok('...e il lead NON viene marcato: notify-pending lo recupera', !r.patches.some(p => 'telegramNotifiedAt' in ((p.body || {}).fields || {})));
  tgMode = 'ok';
}
{
  const c = ownerCard({ id: 'x', name: '<b>Evil</b>', email: 'e@x.it', phone: null, owner: { note: '<script>' } });
  ok('la card fa l\'escape dell\'HTML (parse_mode HTML)', !c.text.includes('<b>Evil') && c.text.includes('&lt;script&gt;'), c.text);
  ok('senza telefono nessun bottone WhatsApp morto', !c.buttons.flat().some(b => /wa\.me/.test(b.url)));
}

console.log('\n\x1b[1m▸ le guardie stanno dove si spende\x1b[0m');
{
  const np = read('api/telegram/notify-pending.js');
  ok('la card lead dice «proprietario», non «ente / azienda»', /b2bSide\(l\) === 'owner' \? '🔑 proprietario'/.test(np));
  ok('un proprietario/ente non finisce mai nel riepilogo dei C', /ldLight = ldToNotify\.filter\(l => l\.grade === 'C' && !isB2B\(l\)\)/.test(np));
  const com = read('api/employees/commerciale.js');
  ok('il Commerciale tace sui B2B PRIMA di redigere', com.indexOf('if (isB2B(lead)) continue;') > -1
    && com.indexOf('if (isB2B(lead)) continue;') < com.indexOf('proposeFirstReply(lead'));
  const src = read('api/owner-lead.js');
  const i = src.indexOf("return res.status(200).json({ ok: true, id });");
  const before = src.slice(0, i);
  ok('ogni scrittura dell\'endpoint è ATTESA prima della risposta',
    /await fsCreate\('leads'/.test(before) && /await logActivity\(/.test(before) && /await fsPatch\(`leads\/\$\{id\}`/.test(before));
  // Una chiamata a inizio istruzione senza await e' fire-and-forget; dentro
  // Promise.race([...]) e' attesa (la riga prima apre l'array).
  const righe = src.split('\n');
  const nude = righe.filter((r, i) => /^\s*(fsCreate|fsPatch|logActivity|tgSend)\(/.test(r)
    && !/\[\s*$/.test(righe.slice(0, i).reverse().find(x => x.trim()) || ''));
  ok('nessuna scrittura lanciata senza await (fire-and-forget)', nude.length === 0, nude);
}

console.log('\n\x1b[1m▸ la pagina: una porta, promesse vere\x1b[0m');
const html = read('owners.html');
const vis = html.replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ');
{
  ok('il modulo scrive alla porta dei proprietari', /fetch\('\/api\/owner-lead'/.test(html));
  ok('...e non più al modulo partner (zona infilata nel campo dell\'ente)', !/partners\/submit/.test(html));
  const m = html.match(/body:JSON\.stringify\(\{([\s\S]*?)\}\)\}\)/);
  const keys = m ? [...m[1].matchAll(/(?:^|[,{\s])(\w+):/g)].map(x => x[1]) : [];
  const accepted = ['name', 'contact', 'zone', 'freeFrom', 'goal', 'sqm', 'rooms', 'furnished', 'rent', 'message', 'lang', 'attribution', 'company'];
  ok('ogni campo che la pagina manda, l\'endpoint lo legge', keys.length >= 10 && keys.every(k => accepted.includes(k)), keys);
  const esrc = read('api/owner-lead.js');
  ok('...e l\'endpoint li legge davvero tutti', accepted.every(k => esrc.includes('body.' + k)), accepted.filter(k => !esrc.includes('body.' + k)));
  const vals = (id) => {
    const sel = html.match(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`));
    const inHtml = sel ? [...sel[1].matchAll(/value="([^"]*)"/g)].map(x => x[1]).filter(Boolean) : [];
    const inJs = [...html.matchAll(new RegExp(`${id}:\\[([\\s\\S]*?)\\]\\]`, 'g'))].flatMap(mm => [...mm[1].matchAll(/\['([^']*)',/g)].map(x => x[1]).filter(Boolean));
    return [...new Set([...inHtml, ...inJs])];
  };
  const pairs = [['fFree', FREE_FROM], ['fGoal', GOALS], ['fRooms', ROOMS], ['fFurn', FURNISHED]];
  for (const [id, map] of pairs) {
    const v = vals(id);
    ok(`le scelte di ${id} sono le chiavi chiuse del server`, v.length > 0 && v.every(x => x in map) && Object.keys(map).every(k => v.includes(k)), { v, keys: Object.keys(map) });
  }
}
{
  // UNA porta: ogni invito all'azione porta al modulo o lo invia, e dice
  // la stessa cosa (STUDIO_EXECUTIVE_CONVERSIONE R1).
  const ctas = [...html.matchAll(/<a\b[^>]*>/g)].map(m => m[0])
    .filter(t => /class="(?:paybtn|nav-cta|go|mobile-menu-cta)"/.test(t))
    .map(t => (t.match(/href="([^"]+)"/) || [])[1]);
  ok('ogni CTA porta alla porta (#contact)', ctas.length >= 4 && ctas.every(h => h === '#contact'), ctas);
  const labels = [...html.matchAll(/class="(?:nav-cta|go|mobile-menu-cta)"[^>]*><span class="l-it">([^<]+)</g)].map(m => m[1]);
  ok('...con la stessa etichetta ovunque', labels.length >= 3 && new Set(labels).size === 1 && labels[0] === 'Valutazione gratuita', labels);
  ok('il bottone del modulo dice la stessa cosa', /id="fGo"[\s\S]{0,700}<b><span class="l-it">Valutazione gratuita/.test(html));
  const forms = (html.match(/<form\b/g) || []).length;
  ok('un solo modulo in pagina', forms === 1, forms);
}
{
  // Le frasi che il codice NON sostiene. La vecchia pagina vendeva un
  // portale con «approvazione preventivi online» e «supporto 24/7», e un
  // cruscotto che mostrava «€0» e «0%» come canone e occupazione.
  const vietate = [/24\/7/, /preventiv\w* (approvabili )?online/i, /approvazione preventivi/i,
    /parola per parola/i, /sempre la stessa/i, /garantiamo il canone/i, /zero sfitto/i, /fuso orario/i];
  const trovate = vietate.filter(re => re.test(vis)).map(String);
  ok('nessuna promessa che il codice non mantiene', trovate.length === 0, trovate);
  ok('il rendiconto d\'esempio è dichiarato tale', /numeri di fantasia/.test(vis) && /example figures/.test(vis));
  ok('la garanzia rinvia ai termini del mandato, non promette oltre', /nei termini scritti nel mandato/.test(vis) && /nei termini del mandato/.test(vis));
  const cat = read('api/_catalog.js');
  const eur = (cat.match(/'concordato-pack':\s*\{\s*eur:\s*(\d+)/) || [])[1];
  ok('il prezzo del Pacchetto è quello del catalogo', eur && vis.includes('€' + eur) && !/€3[0-9]{2}\b/.test(vis.split('€' + eur).join('')), eur);
}
{
  // Il registro: col proprietario si dà del Lei (dottrina `pr`).
  const itText = [...html.matchAll(/<span class="l-it">([\s\S]*?)<\/span>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ')).join(' ');
  const tu = itText.match(/\b(tuo|tua|tuoi|tue|puoi|vuoi|scrivici|contattaci|ti torniamo|affidaci)\b/gi) || [];
  ok('in italiano si dà del Lei, mai del tu', tu.length === 0, tu);
  ok('...e il Lei c\'è davvero', /\bLei riceve\b/.test(itText) && /\bsua casa\b/.test(itText));
}
{
  // ~60–90 parole prima della porta (R3): il corridoio, non il saggio.
  const hero = html.slice(html.indexOf('<header class="hero">'), html.indexOf('id="contact"'));
  const itWords = [...hero.matchAll(/<span class="l-it">([\s\S]*?)<\/span>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ')).join(' ').split(/\s+/).filter(Boolean).length;
  ok(`parole prima della porta (it): ${itWords} ≤ 100`, itWords > 30 && itWords <= 100, itWords);
}
{
  // GEO: le domande dichiarate sono visibili, speakable punta a nodi veri.
  const ld = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map(m => JSON.parse(m[1]));
  const faq = ld.find(d => d['@type'] === 'FAQPage');
  const qs = faq ? faq.mainEntity.map(q => q.name) : [];
  ok('il FAQPage dichiara le domande', qs.length >= 6, qs.length);
  ok('...e ognuna è un <summary> visibile, parola per parola', qs.every(q => html.includes(`<summary><span class="l-it">${q}</span>`)), qs.filter(q => !html.includes(`<summary><span class="l-it">${q}</span>`)));
  const graph = (ld.find(d => d['@graph']) || {})['@graph'] || [];
  const page = graph.find(n => n['@type'] === 'WebPage');
  const sels = (page && page.speakable && page.speakable.cssSelector) || [];
  ok('speakable punta a .hero .sub e .enbref, che esistono', sels.includes('.hero .sub') && sels.includes('.enbref')
    && /<header class="hero">[\s\S]*?<p class="sub/.test(html) && /class="enbref"/.test(html), sels);
  const svc = graph.filter(n => n['@type'] === 'Service');
  ok('due Service con identità distinte (gestione + pacchetto)', svc.length === 2 && new Set(svc.map(s => s['@id'])).size === 2);
  const offer = (svc.find(s => /pacchetto/.test(s['@id'])) || {}).offers || {};
  ok('l\'offerta del Pacchetto dichiara il prezzo del catalogo', offer.price === '349' && offer.priceCurrency === 'EUR', offer);
  ok('«in breve» dichiara cosa NON facciamo', /Cosa non facciamo/.test(vis) && /Non subaffittiamo/.test(vis));
}
{
  ok('canonical italiana, alternate inglese, x-default',
    html.includes('<link rel="canonical" href="https://www.boomrome.com/owners">')
    && html.includes('hreflang="en" href="https://www.boomrome.com/owners?lang=en"')
    && html.includes('hreflang="x-default" href="https://www.boomrome.com/owners"'));
  ok('<html lang="it"> — la lingua non si deduce dal browser', /<html lang="it">/.test(html) && !/navigator\.language/.test(html));
  const sm = read('sitemap.xml');
  ok('la sitemap porta l\'alternate inglese', sm.includes('hreflang="en" href="https://www.boomrome.com/owners?lang=en"'));
  const png = readFileSync(R + 'og-owners.png');
  ok('la card social esiste ed è 1200×630', png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630);
  ok('la pagina usa la SUA card, non quella della home', /og:image" content="https:\/\/www\.boomrome\.com\/og-owners\.png"/.test(html));
  const cfg = read('scripts/seo-config.js');
  const upd = read('scripts/seo-update.js');
  ok('lo script SEO non riscrive la testa bilingue', /'owners\.html':\s*\{[\s\S]{0,700}manualHead: true/.test(cfg) && /if \(cfg\.manualHead\)/.test(upd));
  const llms = read('llms.txt');
  ok('llms.txt racconta la pagina proprietari', /\(https:\/\/www\.boomrome\.com\/owners\)/.test(llms) && /does not sublet/.test(llms));
  const ids = ['metodo', 'inquilini', 'costi', 'faq', 'contact'];
  ok('ogni ancora della nav esiste', ids.every(id => html.includes(`id="${id}"`)), ids.filter(id => !html.includes(`id="${id}"`)));
  ok('il contratto di scorrimento è inline', html.includes('<!-- BOOM_SCROLL:START -->'));
  ok('ogni link interno punta a una pagina che esiste', ['/canone', '/pacchetto-concordato', '/login', '/privacy', '/terms', '/apartments']
    .every(p => existsSync(R + p.slice(1) + '.html')));
}

console.log('\n\x1b[1m▸ in un browser vero: il modulo arriva alla porta, in entrambe le lingue\x1b[0m');
{
  const { loadChromium, launchOptions } = await import('../_browser.mjs');
  const chromium = await loadChromium();
  if (!chromium) console.log('  SKIP: playwright non disponibile — la prova in browser non gira');
  else {
    const http = await import('node:http');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const srv = http.createServer((rq, rs) => {
      let u = rq.url.split('?')[0]; if (u === '/owners') u = '/owners.html';
      const f = path.join(R, u);
      fs.readFile(f, (e, d) => e ? (rs.statusCode = 404, rs.end())
        : (rs.setHeader('content-type', f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : 'text/html'), rs.end(d)));
    }).listen(0);
    const port = srv.address().port;
    const br = await chromium.launch(await launchOptions());
    try {
      for (const lang of ['it', 'en']) {
        const pg = await br.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const errs = []; pg.on('pageerror', e => errs.push(e.message));
        let sent = null;
        await pg.route('**/*', async r => {
          const u = r.request().url();
          if (u.includes('/api/owner-lead')) { sent = JSON.parse(r.request().postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"x"}' }); }
          return u.startsWith(`http://localhost:${port}`) ? r.continue() : r.abort();
        });
        await pg.goto(`http://localhost:${port}/owners${lang === 'en' ? '?lang=en' : ''}`, { waitUntil: 'load' });
        await pg.click('#fGo');
        const vuoto = await pg.textContent('#fErr');
        await pg.fill('#fName', 'Giulia Rossi'); await pg.fill('#fContact', 'domani'); await pg.click('#fGo');
        const senzaRecapito = await pg.textContent('#fErr');
        ok(`[${lang}] il modulo vuoto non parte e dice perché`, sent === null && vuoto.length > 10 && senzaRecapito !== vuoto, { vuoto, senzaRecapito });
        await pg.fill('#fContact', '+39 333 123 4567'); await pg.fill('#fZone', 'Prati');
        await pg.selectOption('#fFree', 'soon'); await pg.selectOption('#fGoal', 'concordato');
        await pg.click('.more summary'); await pg.fill('#fSqm', '70'); await pg.selectOption('#fFurn', 'partial');
        await pg.click('#fGo'); await pg.waitForTimeout(250);
        ok(`[${lang}] arriva alla porta con le chiavi stabili e la lingua della pagina`, sent && sent.freeFrom === 'soon' && sent.goal === 'concordato'
          && sent.furnished === 'partial' && sent.sqm === '70' && sent.lang === lang && sent.company === '', sent);
        ok(`[${lang}] boom-track timbra la fonte nel modulo`, sent && typeof sent.attribution === 'string' && sent.attribution.length > 0, sent && sent.attribution);
        ok(`[${lang}] «fascicolo aperto» al posto del modulo, nessun errore JS`, (await pg.isVisible('#fDone')) && !(await pg.isVisible('#owForm')) && errs.length === 0, errs);
        await pg.close();
      }
    } finally { await br.close(); srv.close(); }
  }
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}${pass} ok, ${fail} ko\x1b[0m`);
process.exit(fail ? 1 : 0);
