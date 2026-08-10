// tests/executive/run.mjs — BOOM Executive: il lead di alto livello entra
// nella macchina GIUSTA, e la voce B2B non scrive mai a un inquilino.
//
// Tre promesse tenute qui, in ordine di costo se si rompono.
//
// 1. IL PROFESSIONISTA È UN TENANT. La tentazione era marcare "executive"
//    come categoria speciale e biforcare la macchina. No: chi cerca casa per
//    sé — anche con la FAO nella firma — è il tenant più qualificato che Roma
//    riceva, e Brain → Telegram → Commerciale sono ESATTAMENTE la macchina
//    giusta per lui. Il lead deve quindi restare leadType 'tenant' e non
//    diventare mai B2B per sbaglio.
//
// 2. IL DATORE DI LAVORO NON È UN HONEYPOT. La pagina chiede l'azienda (è
//    metà del contesto: "Country Manager, Acme GmbH" decide la risposta), ma
//    il campo trappola di TUTTI gli endpoint pubblici si chiama `company`.
//    Un executive che dichiara il suo datore nel campo visibile (`employer`)
//    non deve essere inghiottito in silenzio come un bot — la lezione già
//    pagata in tests/webforms.
//
// 3. LA VOCE B2B TACE COL TENANT E PARLA CON L'ENTE. isB2B copre i moduli
//    partner (università, aziende, ricerca, proprietari): a loro il
//    Commerciale — persona "ti va di fissare una visita?" — non scrive MAI,
//    e la card Telegram porta il messaggio business. L'ordine nel sorgente
//    conta più della presenza della riga: la guardia deve stare PRIMA della
//    chiamata che spende e propone.
//
// Run: node tests/executive/run.mjs

import { readFileSync } from 'node:fs';
import { isB2B, b2bSide, b2bReplyText, isReunion } from '../../api/_market.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
};

// ── Firestore finto: si intercetta la fetch REST, come le altre suite ──
let written = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit') || u.includes('securetoken')) {
    return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin' }) };
  }
  if (u.includes('firestore.googleapis.com')) {
    if ((opts.method || 'GET') === 'POST') {
      written.push({ url: u, body: JSON.parse(opts.body || '{}') });
      return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/leads/ex123' }) };
    }
    return { ok: true, status: 200, json: async () => ({ documents: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const handler = (await import('../../api/executive-lead.js')).default;
const { SECTORS } = await import('../../api/executive-lead.js');

const plain = v => {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) {
    const o = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) o[k] = plain(val);
    return o;
  }
  return v;
};
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

const EXEC = {
  name: 'Anna Keller', email: 'anna@example.com', phone: '+49 151 1234567',
  employer: 'Acme GmbH', sector: 'corporate', zone: 'Prati',
  budget: '2500', moveIn: 'ottobre 2026', duration: '6-12',
  message: 'Moving to Rome in October for a 12-month posting.',
};

console.log('\n\x1b[1m▸ la porta: chi entra e chi no\x1b[0m');
{
  const r = await call({ ...EXEC, company: 'bot inc' });
  ok('il pot di miele risponde 200 senza dire nulla al bot', r.code === 200 && r.payload.ok === true);
  ok('...e soprattutto non scrive niente', r.writes.length === 0, r.writes.length);
}
{
  // La promessa n.2: il DATORE dichiarato nel campo visibile non è la trappola.
  const r = await call(EXEC);
  ok('un executive col datore compilato ENTRA (employer ≠ honeypot)', r.code === 200 && !!r.lead);
  ok('...e il datore viaggia nel riassunto', String(r.lead.message).includes('Acme GmbH'), r.lead.message);
}
{
  const r = await call({ ...EXEC, name: '' });
  ok('senza nome: rifiutato', r.code === 400 && r.payload.error === 'name_required');
  ok('un rifiuto non scrive mai un lead a metà', r.writes.length === 0);
}
{
  const r = await call({ name: 'Anon', sector: 'un' });
  ok('senza email né telefono: rifiutato (non potremmo rispondere)', r.code === 400 && r.payload.error === 'contact_required');
}
{
  const r = await call({ name: 'Jean', phone: '+33 6 12 34 56 78' });
  ok('il telefono da solo basta', r.code === 200 && r.lead && r.lead.phone === '+33 6 12 34 56 78');
}
{
  const r = await call({ ...EXEC, phone: '', email: 'non-una-email' });
  ok('email invalida senza telefono non passa', r.code === 400);
}

console.log('\n\x1b[1m▸ il lead è un TENANT dentro la macchina esistente\x1b[0m');
{
  const r = await call(EXEC);
  ok('leadType tenant — mai company, mai un ramo speciale', r.lead.leadType === 'tenant', r.lead.leadType);
  ok('intent executive_relocation', r.lead.intent === 'executive_relocation');
  ok('schema leads: source web', r.lead.source === 'web');
  ok('schema leads: status new (sennò il Brain non lo vede)', r.lead.status === 'new');
  ok('mercato Roma, mai Réunion', r.lead.market === 'roma' && !isReunion(r.lead));
  ok('...e NON è B2B: la macchina inquilino resta accesa per lui', !isB2B(r.lead));
  ok('il riassunto APRE con EXECUTIVE — Roma', /^EXECUTIVE — Roma/.test(r.lead.message), r.lead.message);
  ok('il settore è nel riassunto (in chiaro, non in codice)', String(r.lead.message).includes(SECTORS.corporate));
  ok('la zona viaggia', r.lead.zone === 'Prati');
  ok('budget mensile, mai un totale d\'acquisto', r.lead.budget === 2500 && r.lead.budgetKind === 'monthly');
  ok('€/mese leggibile per l\'operatore', /€2\.500\/mese/.test(String(r.lead.message)), r.lead.message);
  ok('arrivo e durata nel riassunto', /arrivo ottobre 2026/.test(r.lead.message) && /6-12 mesi/.test(r.lead.message));
  ok('le sue parole restano', String(r.lead.message).includes('12-month posting'));
  const notif = r.writes.find(w => w.url.includes('agentNotifications'));
  ok('l\'operatore è avvisato subito, con 💼 EXECUTIVE', !!notif && /💼 EXECUTIVE/.test(plain(notif.body.fields.summary)));
  ok('una notifica fallita non può annullare il lead (lead scritto prima)',
    r.writes.findIndex(w => w.url.includes('/leads')) < r.writes.findIndex(w => w.url.includes('agentNotifications')));
}
{
  const r = await call({ ...EXEC, budget: '2.500' });
  ok('"2.500" all\'italiana è 2500, non due euro e mezzo', r.lead.budget === 2500, r.lead.budget);
}
{
  const r = await call({ ...EXEC, budget: '2,500' });
  ok('"2,500" all\'inglese pure', r.lead.budget === 2500, r.lead.budget);
}
{
  const r = await call({ ...EXEC, sector: 'astronauta' });
  ok('un settore inventato cade a null, mai a un\'etichetta finta', r.lead.executive && r.lead.executive.sector === null);
}
{
  const un = await call({ ...EXEC, sector: 'un' });
  ok('il settore ONU stampa l\'etichetta ONU', String(un.lead.message).includes(SECTORS.un));
}
{
  const r = await call(EXEC);
  ok('lingua di default: inglese (la casa parla inglese)', r.lead.language === 'en');
}
{
  const r = await call({ ...EXEC, lang: 'it' });
  ok('l\'italiano è rispettato quando è chiesto', r.lead.language === 'it');
}
{
  const r = await call({ ...EXEC, lang: 'xx' });
  ok('una lingua inventata cade sull\'inglese, MAI sull\'italiano', r.lead.language === 'en');
}

console.log('\n\x1b[1m▸ il limite per IP esiste davvero\x1b[0m');
{
  const ip = '203.0.113.77';
  let last = null;
  for (let i = 0; i < 7; i++) last = await call({ ...EXEC, name: `Test ${i}` }, ip);
  ok('il 7° invio dalla stessa IP è rifiutato', last.code === 429, last.code);
  ok('e non scrive nulla', last.writes.length === 0);
}

console.log('\n\x1b[1m▸ la voce B2B: chi è ente e chi no\x1b[0m');
{
  ok('un modulo partner è B2B (source)', isB2B({ source: 'partner', intent: 'partner-university' }));
  ok('un intent partner-* è B2B anche senza source', isB2B({ intent: 'partner-corporate' }));
  ok('leadType company è B2B (porte future)', isB2B({ leadType: 'company' }));
  ok('il lead executive NON è B2B', !isB2B({ leadType: 'tenant', intent: 'executive_relocation', sourceRef: 'executive' }));
  ok('un tenant romano qualsiasi non è B2B', !isB2B({ source: 'web', leadType: 'tenant', intent: 'apply' }));
  ok('un lead réunionnais non è B2B (ha la SUA guardia)', !isB2B({ market: 'reunion', leadType: 'landlord', intent: 'reunion_owner' }));
  ok('un oggetto vuoto non rompe nulla', !isB2B({}) && !isB2B(null) && !isB2B(undefined));
  ok('il proprietario partner sta dal lato owner', b2bSide({ source: 'partner', intent: 'owner', partner: { kind: 'owner' } }) === 'owner');
  ok('l\'università sta dal lato org', b2bSide({ source: 'partner', intent: 'partner-university', partner: { kind: 'university' } }) === 'org');
}
{
  const hr = b2bReplyText({ name: 'Laura Bianchi', source: 'partner', intent: 'partner-corporate', partner: { kind: 'corporate' }, message: 'We need to relocate three engineers to Rome from January.' });
  ok('all\'HR si parla di PERSONE DA SISTEMARE, non di una visita', /how many people/i.test(hr) && !/viewing\?/i.test(hr));
  ok('in inglese, perché ha scritto in inglese', /^Hi Laura/.test(hr), hr.slice(0, 40));
  ok('firmato Valentino — qui il mercato È Roma', /Valentino/.test(hr));
  ok('rimanda allo sportello corporate', hr.includes('boomrome.com/corporate'));
  const uni = b2bReplyText({ name: 'Mark', source: 'partner', intent: 'partner-university', partner: { kind: 'university' }, message: 'We place students every semester.' });
  ok('all\'università il SUO link, non quello corporate', uni.includes('boomrome.com/universities'));
  const own = b2bReplyText({ name: 'Giulia', source: 'partner', intent: 'owner', partner: { kind: 'owner' }, message: 'Salve, vorrei proporvi il mio appartamento a Prati, sono disponibile quando volete.' });
  ok('al proprietario si chiede del SUO immobile, in italiano', /zona/.test(own) && /^Ciao Giulia/.test(own));
  ok('...mai quante persone deve alloggiare', !/quante persone/.test(own), own);
  ok('le due voci org/owner sono davvero diverse', hr !== own);
}

console.log('\n\x1b[1m▸ le guardie stanno nel codice che spende, PRIMA della spesa\x1b[0m');
{
  const com = readFileSync(new URL('../../api/employees/commerciale.js', import.meta.url), 'utf8');
  ok('il Commerciale importa isB2B dalla regola condivisa', /import\s*\{[^}]*isB2B[^}]*\}\s*from\s*'\.\.\/_market\.js'/.test(com));
  const guard = com.indexOf('if (isB2B(lead)) continue;');
  const firstDraft = com.indexOf('proposeFirstReply(lead');
  ok('il Commerciale esce PRIMA di redigere qualsiasi bozza', guard > -1 && firstDraft > -1 && guard < firstDraft, { guard, firstDraft });

  const notif = readFileSync(new URL('../../api/telegram/notify-pending.js', import.meta.url), 'utf8');
  ok('la card Telegram importa la voce business', /import\s*\{[^}]*b2bReplyText[^}]*\}\s*from\s*'\.\.\/_market\.js'/.test(notif));
  ok('il messaggio pronto per un B2B passa dalla voce business', /isB2B\(l\)\s*\?\s*b2bReplyText\(l\)/.test(notif));
}

console.log('\n\x1b[1m▸ la pagina dice la stessa cosa del server\x1b[0m');
{
  const page = readFileSync(new URL('../../executive.html', import.meta.url), 'utf8');
  const en = (page.match(/class="l-en"/g) || []).length;
  const it = (page.match(/class="l-it"/g) || []).length;
  ok(`ogni frase esiste in entrambe le lingue (${en} en / ${it} it)`, en === it, { en, it });
  ok('il form posta sul suo endpoint', page.includes("fetch('/api/executive-lead'"));
  ok('il datore ha il SUO campo visibile...', page.includes('id="fEmployer"') && page.includes("employer:v('fEmployer')"));
  ok('...e l\'honeypot resta un campo NASCOSTO diverso', page.includes('id="fCompany"') && /company:document\.getElementById\('fCompany'\)\.value/.test(page));
  ok('il settore viaggia da select chiusa', page.includes('id="fSector"') && page.includes("sector:v('fSector')"));
  ok('la lingua non si indovina dal browser', !page.includes('navigator.language'));
  ok('lo stato "inviato" non riusa la classe .done del percorso', !/class="done" id="fDone"/.test(page) && page.includes('class="sent" id="fDone"'));
  ok('la porta di scorta esiste se il form cade', page.includes('mailto:hello@boom-rome.com'));
  ok('la banda aziende porta allo sportello corporate', page.includes('href="/corporate"'));
  // I sei flussi sono la sostanza della pagina: se ne sparisce uno, la
  // pagina torna un volantino generico.
  for (const seg of ['seg-un', 'seg-diplomatic', 'seg-corporate', 'seg-research', 'seg-medical', 'seg-film']) {
    ok(`il flusso ${seg} è in pagina`, page.includes(`id="${seg}"`));
  }
  ok('FAO, WFP e IFAD chiamate per nome', /FAO/.test(page) && /WFP/.test(page) && /IFAD/.test(page));
  ok('il transitorio è citato con la sua legge', page.includes('431/98'));
}

console.log('\n\x1b[1m▸ essere trovati (SEO) ed essere citati (motori di risposta)\x1b[0m');
{
  const root = new URL('../../', import.meta.url);
  const page = readFileSync(new URL('executive.html', root), 'utf8');

  const og = readFileSync(new URL('og-executive.png', root));
  const isPng = og.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const w = og.readUInt32BE(16), h = og.readUInt32BE(20);
  ok('l\'immagine social esiste ed è un vero PNG', isPng);
  ok('nel formato dei social (1200×630)', w === 1200 && h === 630, { w, h });
  ok('la pagina la dichiara (og + twitter)', (page.match(/og-executive\.png/g) || []).length >= 2);

  const title = (page.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const desc = (page.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  ok(`il titolo sta nella SERP (${title.length} car.)`, title.length > 0 && title.length <= 60, title);
  ok(`la description anche (${desc.length} car.)`, desc.length >= 120 && desc.length <= 165, desc.length);

  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  ok(`più blocchi di dati strutturati (${blocks.length})`, blocks.length >= 3);
  let parsed = [];
  try { parsed = blocks.map(b => JSON.parse(b)); ok('tutti i blocchi JSON-LD sono JSON valido', true); }
  catch (e) { ok('tutti i blocchi JSON-LD sono JSON valido', false, e.message); }

  // Una FAQ marcata ma invisibile è contenuto nascosto: Google la sanziona
  // e un motore di risposta cita una frase introvabile.
  const summaries = [...page.matchAll(/<summary>([\s\S]*?)<\/summary>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  const faq = parsed.find(b => b && b['@type'] === 'FAQPage');
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const orphans = faq ? faq.mainEntity.filter(q => !summaries.some(s => s.includes(norm(q.name)))) : ['(niente FAQPage)'];
  ok('ogni domanda marcata è davvero mostrata', orphans.length === 0, orphans.map(o => o.name || o));
  ok('le risposte marcate non sono vuote', faq && faq.mainEntity.every(q => (q.acceptedAnswer.text || '').length > 60));

  const graph = parsed.find(b => b && Array.isArray(b['@graph']));
  const services = graph ? graph['@graph'].filter(n => n['@type'] === 'Service') : [];
  ok('i due servizi sono dichiarati (persona + azienda)', services.length === 2, services.map(s => s.serviceType));
  ok('ognuno dice a chi si rivolge', services.every(s => s.audience && s.audience.audienceType));
  ok('quello corporate punta alla SUA pagina', services.some(s => (s.url || '').endsWith('/corporate')));

  const wp = graph ? graph['@graph'].find(n => n['@type'] === 'WebPage') : null;
  const sels = wp?.speakable?.cssSelector || [];
  ok('i selettori speakable esistono davvero in pagina',
    sels.length > 0 && sels.every(sel => page.includes(sel.split(' ').pop().replace('.', ''))), sels);
  ok('il blocco « in brief » esiste', page.includes('class="enbref"') && page.includes('id="enbref"'));

  ok('link di evitamento e target presenti', page.includes('class="skip"') && page.includes('id="main"'));
  ok('le animazioni si fermano se richiesto', page.includes('prefers-reduced-motion'));
  ok('il focus da tastiera è visibile', page.includes(':focus-visible'));

  const llms = readFileSync(new URL('llms.txt', root), 'utf8');
  ok('llms.txt presenta lo sportello executive', llms.includes('/executive') && /BOOM Executive/.test(llms));
  ok('...coi flussi ONU chiamati per nome', /FAO/.test(llms) && /IFAD/.test(llms));
  ok('...e il transitorio spiegato (mai promettere oltre)', llms.includes('431/98'));

  const robots = readFileSync(new URL('robots.txt', root), 'utf8');
  ok('robots.txt non blocca la pagina', !/^\s*Disallow:\s*\/executive/mi.test(robots));

  const sitemap = readFileSync(new URL('sitemap.xml', root), 'utf8');
  ok('sitemap.xml la elenca', sitemap.includes('https://www.boomrome.com/executive'));

  const index = readFileSync(new URL('index.html', root), 'utf8');
  ok('la home la linka (chi arriva da solo la trova)', index.includes('href="/executive"'));
  const corp = readFileSync(new URL('corporate.html', root), 'utf8');
  ok('lo sportello corporate rimanda il singolo qui (reciprocità)', corp.includes('href="/executive"'));
}

console.log(`\n${fail === 0 ? '\x1b[32m\x1b[1m' : '\x1b[31m\x1b[1m'}Executive: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
