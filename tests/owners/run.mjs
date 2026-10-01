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

console.log('\n\x1b[1m▸ il riaffitto: il secondo passo ha la sua porta e la sua voce\x1b[0m');
{
  const r = await call({ ...OWNER, goal: 'relet', freeFrom: 'rented' });
  ok('«riaffittarla» arriva come chiave chiusa, dichiarata e non verificata', r.lead.owner.goal === 'relet'
    && /chiede: riaffitto \(si dichiara già cliente BOOM — verificare\)/.test(r.lead.message), r.lead.message);
  const it = ownerReplyText({ name: 'Laura Bianchi', owner: { goal: 'relet', freeFrom: 'rented', lang: 'it' } });
  ok('la voce dice «riaffittare» e chiede di QUALE casa e QUANDO esce l\'inquilino', /per riaffittare il suo immobile/.test(it)
    && /di quale immobile si tratta/.test(it) && /quando esce l'inquilino attuale/.test(it), it);
  ok('...non chiede se è arredata (la conosciamo), non scrive prezzi, dà del Lei', !/arredat/.test(it) && !/€/.test(it)
    && !/\b(tuo|tua|ti torno)\b/i.test(it) && /condizioni del riaffitto/.test(it), it);
  // La pagina, a «oggi è affittata», chiede di scrivere la scadenza nelle note:
  // chi l'ha scritta non se la vede richiedere.
  const told = ['Il contratto attuale scade il 31/10/2026', 'esce a fine novembre', 'lease ends 30 Nov']
    .map(note => ownerReplyText({ name: 'Laura', owner: { goal: 'relet', freeFrom: 'rented', zone: 'Prati', lang: 'it', note } }));
  ok('...e se la scadenza l\'ha già scritta nelle note, non la richiede', told.every(t => !/quando esce/.test(t)), told);
  const en = ownerReplyText({ name: 'Laura', language: 'en', owner: { goal: 'relet', zone: 'Prati', freeFrom: 'soon', lang: 'en' } });
  ok('...anche in inglese, senza richiedere la zona che ha scritto', /re-letting your property in Prati/.test(en) && !/which property/.test(en) && !/furnished/.test(en), en);
  const full = ownerReplyText({ name: 'Marco', owner: { zone: 'Monti', lang: 'it' } });
  ok('fuori dal riaffitto la voce è quella di prima', /del suo immobile a Monti/.test(full) && /se è arredato/.test(full), full);
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
const ldText0 = () => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]).join(' ');
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
  // Una garanzia coi limiti nascosti dietro «nei termini» è un'omissione
  // (Cod. cons. artt. 21-22): i limiti si NOMINANO — massimale e durata — e
  // la clausola appartiene al passo 3, il mandato su misura.
  ok('la garanzia nomina i suoi limiti (massimale, durata) e sta nel mandato su misura',
    /entro il massimale e la durata scritti nel mandato/.test(vis) && /entro il massimale e la durata del mandato/.test(vis)
    && /within the cap and the period written in the mandate/.test(vis) && /nel mandato su misura/.test(vis), null);
  ok('...e non promette più «nei termini» senza dire quali', !/nei termini (scritti )?(nel|del) mandato/.test(vis));
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
console.log('\n\x1b[1m▸ la scala: tre passi, ogni prezzo legato al codice\x1b[0m');
{
  // I due prezzi delle pratiche sono gli ASPI_DEFAULTS: la pagina pubblica
  // ciò che la fattura ASPI incassa (tests/aspi pinna quei numeri). Se
  // cambiano lì senza cambiare qui, questo test cade.
  const aspi = read('api/fiscal/_aspi.js');
  const reg = +(aspi.match(/prezzoRegistrazione:\s*(\d+)/) || [])[1];
  const ass = +(aspi.match(/prezzoAsseverazione:\s*(\d+)/) || [])[1];
  const eu = n => '€' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  ok(`le pratiche pubblicate sono quelle del codice (${eu(reg)}, ${eu(ass)}, ${eu(reg + ass)})`,
    reg > 0 && ass > 0 && [eu(reg), eu(ass), eu(reg + ass)].every(x => vis.includes(x)), { reg, ass });
  const costi = html.slice(html.indexOf('<section id="costi"'), html.indexOf('</section>', html.indexOf('<section id="costi"')));
  const cv = costi.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok('tre passi, in ordine', cv.indexOf('Passo 1') > -1 && cv.indexOf('Passo 1') < cv.indexOf('Passo 2') && cv.indexOf('Passo 2') < cv.indexOf('Passo 3'));
  ok('...in un elenco ordinato, che resta un elenco anche su Safari (role="list")', /<ol class="ladder" role="list">/.test(costi)
    && /<div class="lmini">[\s\S]*?<ol role="list">/.test(html));
  // L'esempio si ricalcola: mezza mensilità di 1400 + IVA 22% = 854; con
  // l'attestazione 854 + ass. Un numero scritto a mano che diverge cade qui.
  const half = 1400 / 2, tot = Math.round(half * 1.22);
  ok(`l'esempio torna: mezza mensilità di €1.400 = ${eu(half)} + IVA, ${eu(tot)} in tutto; ${eu(tot + ass)} con l'attestazione`,
    cv.includes(`${eu(half)} + IVA`) && cv.includes(eu(tot)) && cv.includes(eu(tot + ass)) && cv.includes(eu(reg + ass)), null);
  ok('«+ IVA» sulla mezza mensilità ha il totale accanto (mai + IVA nudo)', new RegExp(`${eu(half)} \\+ IVA, ${eu(tot)} in tutto`).test(cv));
  ok('l\'IVA è dichiarata in italiano e in inglese', /IVA inclusa/.test(cv) && /VAT included/.test(cv) && /Amounts include VAT/.test(cv));
  ok('il Pacchetto resta la corsia laterale di chi ha già l\'inquilino', /Ha già l'inquilino/.test(cv) && /€349/.test(cv));
  ok('la cedolare toglie registro e bollo, non il concordato; e vale per la persona fisica', /persona fisica/.test(cv) && /A parità di canone/.test(cv));
  // Stessa evidenza: dove c'è «€0 di provvigione» c'è anche il prezzo delle
  // pratiche, nello STESSO elemento (Cod. cons. art. 22 c.4; AGCM PS12313).
  const trust = (html.match(/<div class="trust h-4">[\s\S]*?<\/div>/) || [''])[0];
  const first = (html.match(/<li class="pc first">[\s\S]*?<\/li>/) || [''])[0];
  const brief = (html.match(/<dt><span class="l-it">Costi<\/span>[\s\S]*?<\/dd>/) || [''])[0];
  const mini = (html.match(/<div class="lmini">[\s\S]*?<\/li>/) || [''])[0];
  const faq1 = (html.match(/Quanto costa affidarvi la casa\?<\/span>[\s\S]*?<\/div>/) || [''])[0];
  const same = { trust, first, brief, mini, faq1 };
  // Lingua per lingua: l'inglese che porta il prezzo non copre l'italiano
  // che l'ha perso (la mutazione che l'ha dimostrato: via €89 dal chip IT).
  const part = (t, l) => [...t.matchAll(new RegExp(`<span class="l-${l}">([\\s\\S]*?)</span>`, 'g'))].map(m => m[1]).join(' ');
  const price = new RegExp(`(€${reg}\\b|\\b${reg} euro)`);
  const lone = Object.entries(same).flatMap(([k, t]) => [
    /provvigione/.test(part(t, 'it')) && price.test(part(t, 'it')) ? null : k + ':it',
    /commission/.test(part(t, 'en')) && price.test(part(t, 'en')) ? null : k + ':en',
  ]).filter(Boolean);
  ok('«€0 di provvigione» porta sempre accanto il prezzo delle pratiche', lone.length === 0, lone);
  // Il prezzo NORMALE in testa: quasi ogni contratto BOOM a Roma segue
  // l'Accordo e l'attestazione è ciò che apre la cedolare al 10% — il default
  // di fatturazione ASPI è «completo». €89 è l'eccezione, e si dice così.
  const lead278 = t => { const a = t.indexOf('€' + (reg + ass)), b = t.indexOf('€' + reg); return a > -1 && b > -1 && a < b; };
  const pr1 = (first.match(/<span class="pr">[\s\S]*?<\/span><\/span>/) || [''])[0];
  ok(`il prezzo normale (${eu(reg + ass)}) viene prima dell'eccezione (${eu(reg)}), in pagina e accanto alla porta`,
    ['it', 'en'].every(l => lead278(part(pr1, l)) && lead278(part(mini, l))), { pr1: part(pr1, 'it'), mini: part(mini, 'it') });
  ok('...e accanto alla porta l\'IVA è dichiarata, in italiano e in inglese', /IVA inclusa/.test(part(mini, 'it')) && /VAT included/.test(part(mini, 'en')));
  const lmini = (html.match(/<div class="lmini">[\s\S]*?<\/div>/) || [''])[0];
  ok('...e il link non fa pensare che i prezzi sopra siano senza IVA', !/con l'IVA|with VAT/.test(lmini) && /Tutti i passi, nel dettaglio/.test(lmini));
  // La gestione durante il contratto è DICHIARATA (è ciò che la macchina fa
  // per ogni contratto: rendiconto il 1°, incasso, manutenzioni coordinate).
  ok('la gestione durante il contratto è scritta nel passo 1 e nella FAQ, in entrambe le lingue',
    /per tutta la durata del contratto/.test(part(first, 'it')) && /for the whole lease/.test(part(first, 'en'))
    && /Per tutta la durata del contratto/.test(part(faq1, 'it')) && /For the whole lease/.test(part(faq1, 'en')));
  ok('mai «spese escluse» (si legge «più le spese») né «va a registrare»', !/spese escluse|service charges excluded|va a registrare|goes for registration/.test(vis + ldText0()));
  // Mai «gratis» dove c'è un costo (art. 23 lett. v) — sulla pagina, nei dati
  // strutturati, nella riga contestuale e in llms.txt. «Valutazione
  // gratuita» e il calcolatore restano: quelli sono gratis davvero.
  const ldText = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]).join(' ');
  const hint = (html.match(/var HINT=\{[\s\S]*?\n\};/) || [''])[0];
  const llmsOwn = (read('llms.txt').match(/## BOOM for property owners[\s\S]*?(?=\n## )/) || [''])[0];
  // Le altre superfici che parlano ai proprietari: la FAQ generale del sito
  // (diceva «1 month rent OR 10%» e «guaranteed rent») e i modelli di
  // outreach (solo i blocchi da copiare: le note interne possono NOMINARE
  // le frasi vietate per vietarle).
  const faqHtml = read('faq.html');
  const faqOwn = (faqHtml.match(/<div class="group-head" data-g="owners">[\s\S]*?<\/section>/) || [''])[0].replace(/<[^>]+>/g, ' ');
  const outreach = [...read('docs/owner-outreach.md').matchAll(/```\n([\s\S]*?)```/g)].map(m => m[1]).join(' ');
  const GRATIS = /\bgratis\b|a costo zero|senza (alcun )?cost[oi]|\bno fee\b|la nostra parte la paga|prima locazione (è )?(completamente )?gratuit|\bfree (first )?letting|first letting (is )?free|at no cost|reddito sicuro|zero pensieri|reliable income|zero stress|guaranteed rent|1 month rent or 10%|won'?t stay empty|resta(?:rà)? mai vuota|average:? \d+ days/i;
  const hits = Object.entries({ vis, ldText, hint, llmsOwn, faqOwn, outreach }).filter(([, t]) => GRATIS.test(t)).map(([k, t]) => k + ': ' + t.match(GRATIS)[0]);
  ok('mai «gratis» / «no fee» / «reddito sicuro» / «guaranteed rent» — pagina, dati, riga, llms, FAQ del sito, outreach', hits.length === 0, hits);
  ok('la FAQ generale del sito dice la stessa scala (€0 con le pratiche, 61%, link a /owners#costi)',
    /€0 commission/.test(faqOwn) && faqOwn.includes('€' + reg) && faqOwn.includes('€' + (reg + ass)) && /61% of one month/.test(faqOwn) && /\/owners#costi|boomrome\.com\/owners/.test(faqHtml));
  ok('i modelli di outreach, dove dicono «senza provvigione», dicono anche il prezzo delle pratiche',
    [...read('docs/owner-outreach.md').matchAll(/```\n([\s\S]*?)```/g)].map(m => m[1])
      .filter(t => /provvigione|commission/.test(t)).every(t => t.includes('€' + reg + '–' + (reg + ass))));
  // «+ IVA» mai nudo (Cod. cons. art. 22 c.4): fuori dalla scala — dove la
  // card porta il suo totale — ogni mezza mensilità + IVA ha il totale entro
  // poche parole: il 61% di un canone o la cifra su €1.400.
  const noCosti = html.slice(0, html.indexOf('<section id="costi"')) + html.slice(html.indexOf('</section>', html.indexOf('<section id="costi"')));
  // ogni meta a sé, separata da '¦': il totale di twitter:description non
  // copre un og:description che l'ha perso
  const metas = [...html.matchAll(/<meta (?:name|property)="(?:description|og:description|twitter:description)" content="([^"]*)"/g)].map(m => m[1]).join(' ¦ ');
  // '¦' al confine di ogni <span>: il totale va cercato nella STESSA lingua
  // (il 61% dell'inglese non copre l'italiano che l'ha perso).
  const flat = t => t.replace(/<!--[\s\S]*?-->|<style[\s\S]*?<\/style>/g, ' ').replace(/<\/span>/g, ' ¦ ').replace(/<[^>]+>/g, ' ').replace(/\\'/g, "'").replace(/\s+/g, ' ');
  const naked = [];
  for (const [k, t] of Object.entries({ page: flat(noCosti), metas, llmsOwn: flat(llmsOwn), faqOwn: flat(faqOwn), faqLd: (faqHtml.match(/How much commission do you charge owners\?[\s\S]*?"\}\}/) || [''])[0] })) {
    const re = /(mezza mensilità|half a month(?:'s rent)?|half the agreed monthly rent|half a month's agreed rent)[^.;¦]{0,130}?(\+ IVA|più IVA|\+ VAT|plus VAT)/gi;
    for (const m of t.matchAll(re)) {
      const after = t.slice(m.index + m[0].length, m.index + m[0].length + 110).split('¦')[0];
      if (!/61%|854/.test(after)) naked.push(k + ': …' + m[0].slice(-40) + after.slice(0, 40));
    }
  }
  ok('ogni «mezza mensilità + IVA» fuori dalla scala ha il totale accanto (pagina, meta, dati, riga, llms, FAQ del sito)', naked.length === 0, naked);
  ok('la riga contestuale usa gli stessi prezzi della scala', hint.includes('€' + reg) && hint.includes('€' + (reg + ass)) && /mezza mensilità \+ IVA/.test(hint) && hint.includes('€349'));
  // Voce per voce, lingua per lingua: la riga che il proprietario legge al
  // momento della scelta rispetta le stesse regole della scala.
  const H = new Function(hint.replace(/^var HINT=/, 'return ').replace(/;\s*$/, ''))();
  const hv = ['it', 'en'].flatMap(l => Object.entries(H[l]).map(([k, v]) => [l + '.' + k, v]));
  const hint0 = hv.filter(([, v]) => /€0|provvigione|commission/.test(v) && !(v.includes('€' + reg) && v.includes('€' + (reg + ass)))).map(([k]) => k);
  ok('ogni riga con «€0» porta le pratiche accanto (€' + reg + ' e €' + (reg + ass) + ')', hint0.length === 0, hint0);
  const hintHalf = hv.filter(([, v]) => /mezza mensilità|half a month/.test(v) && !/61%/.test(v)).map(([k]) => k);
  ok('ogni riga con la mezza mensilità porta il totale (61% di un canone, IVA inclusa)', hintHalf.length === 0, hintHalf);
  ok('il Pacchetto nella riga dice che la tariffa dell\'organizzazione è a parte', /a parte/.test(H.it.concordato) && /extra/.test(H.en.concordato));
  ok('«affittarla e farla gestire» ha la SUA riga, che dice la gestione compresa',
    /incasso/.test(H.it.full) && /rendiconto/.test(H.it.full) && /rent collection/.test(H.en.full)
    && /var t=g==='full'\?H\.full:g==='find'\?H\.first/.test(html));
  ok('la riga resta nell\'albero di accessibilità (mai hidden: aria-live non annuncerebbe)',
    /<p class="fhint" id="fHint" aria-live="polite"><\/p>/.test(html) && !/el\.hidden/.test(html) && /\.fhint:empty\{/.test(html));
  ok('...ed è dichiarata PRIMA della IIFE che chiama setLang', html.indexOf('var HINT=') > -1 && html.indexOf('var HINT=') < html.indexOf("setLang(q||saved||'it',true)"));
  ok('il prezzo sta accanto alla porta (non più solo il €349 laterale)', /<div class="lmini">/.test(html) && html.indexOf('<div class="lmini">') < html.indexOf('<section id="metodo"'));
}
{
  // I dati strutturati dicono la stessa scala, senza inventare prezzi.
  const ld = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map(m => JSON.parse(m[1]));
  const graph = (ld.find(d => d['@graph']) || {})['@graph'] || [];
  const ges = graph.find(n => n['@id'] === 'https://www.boomrome.com/owners#gestione') || {};
  const offers = ges.offers || [];
  ok('#gestione ha tre offerte, con identità distinte', offers.length === 3 && new Set(offers.map(o => o['@id'])).size === 3, offers.map(o => o['@id']));
  ok('...nessuna col prezzo «0» e nessun prezzo inventato per la mezza mensilità', offers.every(o => o.price !== '0' && o.price !== 0) && !offers[1].price && !offers[1].priceSpecification);
  const aspi = read('api/fiscal/_aspi.js');
  const reg = +(aspi.match(/prezzoRegistrazione:\s*(\d+)/) || [])[1], ass = +(aspi.match(/prezzoAsseverazione:\s*(\d+)/) || [])[1];
  const ps = offers[0].priceSpecification || {};
  ok('la prima locazione dichiara il range delle pratiche, IVA inclusa', ps.minPrice === reg && ps.maxPrice === reg + ass && ps.valueAddedTaxIncluded === true, ps);
  const org = graph.find(n => n['@id'] === 'https://www.boomrome.com/#organization') || {};
  const pk = read('pacchetto-concordato.html');
  ok('l\'entità è la stessa di /pacchetto-concordato (RealEstateAgent «BOOM Rome»)', org['@type'] === 'RealEstateAgent' && org.name === 'BOOM Rome'
    && /"@id":"https:\/\/www\.boomrome\.com\/#organization","name":"BOOM Rome"/.test(pk), org['@type']);
  // La risposta che il motore cita è quella che il proprietario legge: il
  // FAQPage non è una seconda copia, è generato dalla pagina.
  const faq = ld.find(d => d['@type'] === 'FAQPage');
  const norm = t => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const diverge = (faq ? faq.mainEntity : []).filter(q => {
    const m = html.match(new RegExp(`<summary><span class="l-it">${q.name.replace(/[?()+.*]/g, '\\$&')}</span>[\\s\\S]*?<div class="a"><span class="l-it">([\\s\\S]*?)</span><span class="l-en">`));
    return !m || norm(m[1]) !== q.acceptedAnswer.text;
  }).map(q => q.name);
  ok('ogni risposta del FAQPage è la risposta visibile, parola per parola', faq && faq.mainEntity.length >= 11 && diverge.length === 0, diverge);
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
      {
        // La riga giusta al momento giusto: il riaffitto riceve il SUO prezzo
        // sotto le tendine, la lingua la segue, «affittata» apre i dettagli.
        const pg = await br.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const errs = []; pg.on('pageerror', e => errs.push(e.message));
        let sent = null;
        await pg.route('**/*', async r => {
          const u = r.request().url();
          if (u.includes('/api/owner-lead')) { sent = JSON.parse(r.request().postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"x"}' }); }
          return u.startsWith(`http://localhost:${port}`) ? r.continue() : r.abort();
        });
        await pg.goto(`http://localhost:${port}/owners`, { waitUntil: 'load' });
        const hidden0 = (await pg.isHidden('#fHint')) && (await pg.textContent('#fHint')) === '';
        await pg.selectOption('#fGoal', 'relet');
        const h1 = await pg.textContent('#fHint');
        ok('[it] nessuna riga prima della scelta; «riaffittarla» mostra mezza mensilità e la prima locazione',
          hidden0 && (await pg.isVisible('#fHint')) && /mezza mensilità del canone \+ IVA/.test(h1) && /prima locazione/.test(h1), h1);
        await pg.selectOption('#fFree', 'rented');
        const h2 = await pg.textContent('#fHint');
        const open = await pg.evaluate(() => document.getElementById('fMore').open);
        const ph = await pg.getAttribute('#fMsg', 'placeholder');
        ok('[it] «oggi è affittata» chiede la scadenza e apre il campo dove scriverla', /Quando scade il contratto attuale/.test(h2) && open && /scade il/.test(ph), { h2, open, ph });
        // a 390px l'interruttore sta nel menu: si chiama la stessa funzione del bottone
        await pg.evaluate(() => setLang('en'));
        const h3 = await pg.textContent('#fHint');
        ok('[en] la riga segue la lingua senza perdere la scelta', /half a month's rent \+ VAT/.test(h3) && (await pg.inputValue('#fGoal')) === 'relet', h3);
        await pg.evaluate(() => setLang('it'));
        await pg.fill('#fName', 'Laura Bianchi'); await pg.fill('#fContact', '+39 333 765 4321');
        await pg.click('#fGo'); await pg.waitForTimeout(250);
        ok('[it] il riaffitto arriva alla porta come goal:relet', sent && sent.goal === 'relet' && sent.freeFrom === 'rented', sent);
        const wide = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        ok('[it] a 390px niente scorrimento laterale, nessun errore JS', wide <= 0 && errs.length === 0, { wide, errs });
        await pg.close();
      }
    } finally { await br.close(); srv.close(); }
  }
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}${pass} ok, ${fail} ko\x1b[0m`);
process.exit(fail ? 1 : 0);
