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

// Con BOOM si affitta da 3 mesi in su (decisione del fondatore, 15/10/2026).
// Il modulo non offre piu' «1–3 mesi»; il server pero' deve continuare ad
// accettare un valore vecchio (pagina in cache, POST a mano) — un contatto non
// si perde per una durata — e deve DIRLO all'operatore prima che risponda.
console.log('\n\x1b[1m▸ la durata: da 3 mesi in su, anche per un valore vecchio\x1b[0m');
{
  const { belowMinimum, MIN_MONTHS } = await import('../../api/executive-lead.js');
  ok('il minimo del server è 3 mesi', MIN_MONTHS === 3, MIN_MONTHS);
  ok('«1-3», «2» e «0-3» partono sotto il minimo; «3-6», «12-18», vuoto e testo no',
    belowMinimum('1-3') && belowMinimum('2') && belowMinimum(' 0-3') && !belowMinimum('3-6') && !belowMinimum('12-18')
    && !belowMinimum('') && !belowMinimum(null) && !belowMinimum('sei mesi'));
  const r = await call({ ...EXEC, duration: '1-3' });
  ok('un «1-3» storico entra comunque (200, lead scritto)', r.code === 200 && !!r.lead, r.code);
  ok('...e il riassunto lo segnala all\'operatore', /1-3 mesi \(sotto il minimo BOOM di 3 mesi: da chiarire\)/.test(String(r.lead && r.lead.message)), r.lead && r.lead.message);
  ok('...anche nel dato del lead (executive.belowMinimum)', r.lead && r.lead.executive && r.lead.executive.belowMinimum === true);
  const { replyLang } = await import('../../api/_lang.js');
  ok('...e la nota in italiano non sposta la lingua della risposta: resta inglese', r.lead && replyLang(r.lead) === 'en', r.lead && r.lead.message);
  const r2 = await call({ ...EXEC, duration: '3-6' });
  ok('«3-6» non è sotto il minimo: nessuna segnalazione', /3-6 mesi/.test(String(r2.lead.message)) && !/sotto il minimo/.test(String(r2.lead.message))
    && r2.lead.executive.belowMinimum === false, r2.lead.message);
}
{
  const page = readFileSync(new URL('../../executive.html', import.meta.url), 'utf8');
  // Le durate del modulo vivono nel dizionario PH (inglese e italiano): si
  // leggono le coppie [valore, etichetta] che la pagina mette nel <select>.
  const liste = [...page.matchAll(/duration:(\[\[[^\n]*?\]\])/g)].map((m) => JSON.parse(m[1].replace(/'/g, '"')));
  const valori = liste.map((l) => l.map(([v]) => v).filter(Boolean));
  ok('il modulo ha la durata in due lingue', liste.length === 2, liste.length);
  ok('...con le stesse fasce in entrambe', valori.length === 2 && valori[0].join() === valori[1].join(), valori);
  ok('...e nessuna fascia parte sotto i 3 mesi: la prima è il minimo vero', valori.every((l) => l.length && l.every((v) => !belowMinimumPage(v)) && /^3-/.test(l[0])), valori);
  ok('le etichette dicono le stesse fasce dei valori («3–6 months» / «3–6 mesi»)',
    liste.every((l) => l.filter(([v]) => v).every(([v, t]) => t.replace('–', '-').startsWith(v))), liste);
  ok('la scheda e la FAQ dicono «3–18» in inglese e in italiano, mai «1–18»',
    /on assignment for <b>3–18 months<\/b>/.test(page) && /con un incarico da <b>3 a 18 mesi<\/b>/.test(page)
    && /residential lease: 3 to 18 months with BOOM/.test(page) && /con BOOM da 3 a 18 mesi/.test(page)
    && !/\b1\s*(?:–|-|to|a)\s*18\s*(?:months|mesi|MONTHS)|1–18 <span/.test(page));
}
function belowMinimumPage(v) { const m = String(v).match(/^\s*(\d{1,2})/); return !!m && Number(m[1]) < 3; }

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
  // Col LEI: la dottrina delle risposte rapide, famiglia `pr` («sempre col
  // LEI — è il cliente che ci affida un bene»). Il vecchio «Ciao Giulia» dava
  // del tu a chi ci affida una casa (vedi tests/owners).
  ok('al proprietario si chiede del SUO immobile, in italiano e col Lei', /zona/.test(own) && /^Buongiorno Giulia/.test(own) && /suo immobile/.test(own), own);
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

  // LA CARD DICE LA DURATA DELLA PAGINA (15/10/2026). La card vecchia, fatta
  // fuori dal repo, diceva «Transitional lease · 1–18 months» accanto
  // all'og:description gia' corretta in «3–18», e nessun test poteva vederlo:
  // un PNG non si cerca col grep. Ora la genera il repo
  // (design/pages-deco/genera-og-executive.py), che legge la fascia
  // dall'og:description e scrive nel PNG il testo che ha stampato (chunk iTXt
  // «Description» e «Software»): una card fatta a mano, senza firma, qui cade.
  const scritte = {};
  for (let i = 8; i + 12 <= og.length;) {
    const len = og.readUInt32BE(i), tipo = og.toString('latin1', i + 4, i + 8), d = og.subarray(i + 8, i + 8 + len);
    if (tipo === 'iTXt') {
      const z = d.indexOf(0);
      let p = d.indexOf(0, z + 3) + 1;          // chiave \0 · compressione · metodo · lingua \0
      p = d.indexOf(0, p) + 1;                  // chiave tradotta \0
      if (z > 0 && d[z + 1] === 0) scritte[d.toString('latin1', 0, z)] = d.toString('utf8', p);
    }
    i += 12 + len;
  }
  const generatore = 'design/pages-deco/genera-og-executive.py';
  let sorgente = '';
  try { sorgente = readFileSync(new URL(generatore, root), 'utf8'); } catch { /* resta vuota: il check sotto cade */ }
  ok('la card l\'ha generata il repo, e dice da quale sorgente', scritte.Software === generatore && sorgente.length > 0,
    scritte.Software || '(nessuna firma nel PNG: card fatta fuori dal repo)');
  const ogDesc = (page.match(/<meta property="og:description" content="([^"]*)"/) || [])[1] || '';
  const fasciaPagina = (ogDesc.match(/\((\d{1,2})\s*[–-]\s*(\d{1,2}) months\)/) || []).slice(1).map(Number);
  const fasceCard = [...String(scritte.Description || '').matchAll(/(\d{1,2})\s*[–-]\s*(\d{1,2})\s*months/gi)]
    .map((m) => [Number(m[1]), Number(m[2])]);
  ok('la card dice la fascia del transitorio della pagina, e parte da 3 mesi',
    fasciaPagina.length === 2 && fasciaPagina[0] >= 3 && fasceCard.length === 1
    && fasceCard[0][0] === fasciaPagina[0] && fasceCard[0][1] === fasciaPagina[1],
    { pagina: fasciaPagina, card: fasceCard });
  ok('...e nessuna durata sotto i 3 mesi nel resto del suo testo', !!scritte.Description
    && !/\b(?:1|2|one|two|a)\s*(?:[–\-−]|to)\s*\d{1,2}\s*-?months?\b|\b(?:from|minimum)\s+(?:1|one|a)\s+month/i.test(scritte.Description),
    scritte.Description);
  ok('la sorgente della card legge la durata dalla pagina e non la scrive a mano',
    /og:description/.test(sorgente) && /int\(fascia\.group\(1\)\) < 3/.test(sorgente)
    && !/\b\d{1,2}\s*[–-]\s*\d{1,2}\s*months\b/i.test(sorgente));

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

console.log('\n\x1b[1m▸ cosa la pagina promette: vero, uguale nei dati e in pagina\x1b[0m');
{
  const root = new URL('../../', import.meta.url);
  const page = readFileSync(new URL('executive.html', root), 'utf8');
  const parsed = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));

  // Il contratto è il modello ufficiale italiano, spiegato in inglese: in
  // inglese sono proposta, pagina di firma, ricevute e assistenza. Un motore
  // che cita «English-language lease» promette un documento che non esiste.
  const claims = page.match(/.{0,40}(English-language|anche in inglese|English contract).{0,30}/gi) || [];
  ok('nessuna promessa di un contratto in inglese (meta, dati, pagina)', claims.length === 0, claims.slice(0, 3));
  ok('il contratto è detto per quello che è: modello italiano, spiegato in inglese',
    /registered Italian lease \(the official standard form, walked through with you in English\) plus the English pre-agreement that fixes its terms/.test(page)
    && /il modello ufficiale italiano, spiegato in inglese/.test(page));

  // Il FAQPage è la pagina: ogni risposta marcata è la risposta inglese
  // visibile, parola per parola (tag tolti).
  const faq = parsed.find(b => b && b['@type'] === 'FAQPage');
  const strip = t => String(t).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const diverge = (faq ? faq.mainEntity : []).filter(q => {
    const m = page.match(new RegExp(`<summary><span class="l-en">${esc(q.name)}</span>[\\s\\S]*?<div class="a"><span class="l-en">([\\s\\S]*?)</span><span class="l-it">`));
    return !m || strip(m[1]) !== q.acceptedAnswer.text;
  }).map(q => q.name);
  ok('ogni risposta del FAQPage è la risposta inglese visibile, parola per parola', faq && faq.mainEntity.length >= 8 && diverge.length === 0, diverge);

  // La provvigione è quella che il codice calcola (api/preagreement/create.js:
  // 10% di un'annualità + IVA 22%): l'IVA si dice, sempre.
  const cost = (faq ? faq.mainEntity : []).find(q => q.name === 'What does it cost?');
  ok('il costo dichiara la provvigione col 22% di IVA (dati strutturati)', cost && /10% of one year's rent plus 22% VAT/.test(cost.acceptedAnswer.text), cost && cost.acceptedAnswer.text);
  const costIt = page.match(/<summary><span class="l-en">What does it cost\?<\/span>[\s\S]*?<span class="l-it">([\s\S]*?)<\/span><\/div>/);
  ok('...e la versione italiana anche (IVA al 22%)', costIt && /10% di un'annualità più IVA al 22%/.test(costIt[1]));
  const create = readFileSync(new URL('api/preagreement/create.js', root), 'utf8');
  ok('...che è ciò che il codice applica davvero (10% + IVA 22% di default)', /num\(m\.feePct, 10\)/.test(create) && /num\(m\.feeVatPct, 22\)/.test(create));

  // L'uscita anticipata la decide il contratto: sul transitorio BOOM
  // (js/contract-pdf.js, Allegato B art. 10) il conduttore recede per GRAVI
  // MOTIVI con tre mesi di preavviso per raccomandata; fuori da lì serve
  // l'accordo del locatore. Nessun «costo di uscita» è noto dal primo giorno.
  const exitClaims = page.match(/.{0,40}(exact cost of leaving|quanto costa esattamente andare via).{0,30}/gi) || [];
  ok('nessuna promessa di un «costo esatto» per andare via prima', exitClaims.length === 0, exitClaims.slice(0, 2));
  const early = (faq ? faq.mainEntity : []).find(q => /cut short/.test(q.name));
  const tpl = readFileSync(new URL('js/contract-pdf.js', root), 'utf8');
  ok('l\'uscita anticipata è detta come la scrive il contratto (gravi motivi, 3 mesi, raccomandata), IT compreso',
    early && /withdraw for serious reasons \(gravi motivi\) with 3 months' notice by registered letter/.test(early.acceptedAnswer.text)
    && /si può recedere per gravi motivi con tre mesi di preavviso per raccomandata/.test(page)
    && /facoltà di recedere per gravi motivi dal contratto previo avviso da recapitarsi mediante lettera raccomandata almeno tre mesi prima/.test(tpl),
    early && early.acceptedAnswer.text);

  // L'entità è la stessa di tutto il sito.
  const graph = (parsed.find(b => b && Array.isArray(b['@graph'])) || {})['@graph'] || [];
  const org = graph.find(n => n['@id'] === 'https://www.boomrome.com/#organization') || {};
  ok('#organization è il RealEstateAgent «BOOM Rome» di Egidi Immobiliare S.r.l.',
    org['@type'] === 'RealEstateAgent' && org.name === 'BOOM Rome' && org.legalName === 'Egidi Immobiliare S.r.l.'
    && org.vatID === 'IT17322991005' && org.telephone === '+39-331-325-1961', org);
  ok('...con la sede vera', org.address && org.address.streetAddress === 'Via dei Coronari 181/184' && org.address.postalCode === '00186'
    && org.address.addressLocality === 'Roma' && org.address.addressCountry === 'IT', org.address);
  ok('...e senza voti o recensioni nei dati', !/AggregateRating|"Review"/.test(page));

  // /executive?lang=it è lo STESSO file e si canonicalizza su /executive.
  ok('canonical inglese, nessun hreflang verso un URL ?lang= che si canonicalizza altrove',
    page.includes('<link rel="canonical" href="https://www.boomrome.com/executive">') && !/hreflang="[^"]+" href="[^"]*\?lang=/.test(page));
  ok('...og:locale en_US con l\'alternate it_IT restano', page.includes('<meta property="og:locale" content="en_US">') && page.includes('<meta property="og:locale:alternate" content="it_IT">'));

  // Il voto rimanda alla scheda Google, senza cambiare i numeri.
  ok('il voto ★ 4.9 · 47 è un link a Google, tracciato',
    /<a href="https:\/\/share\.google\/xikmVxQCRuKOdWcND" target="_blank" rel="noopener"[^>]*onclick="boomTrack\('reviews_view',\{source_page:'executive'\}\)"><span>★ <b>4\.9<\/b> <span class="l-en">on Google · 47 reviews<\/span>/.test(page));

  // Conversione CONFERMATA solo dove il server ha risposto ok.
  const sub = page.slice(page.indexOf("fetch('/api/executive-lead'"));
  const okBranch = sub.slice(sub.indexOf('if(!j||!j.ok)throw'), sub.indexOf('.catch('));
  const errBranch = sub.slice(sub.indexOf('.catch('), sub.indexOf('});', sub.indexOf('.catch(')));
  ok('boom-conversion «Executive lead sent» parte nel ramo di successo...',
    sub.indexOf('if(!j||!j.ok)throw') > -1 && /dispatchEvent\(new CustomEvent\('boom-conversion',\{detail:\{label:'Executive lead sent',section:'form'\}\}\)\)/.test(okBranch));
  ok('...e mai nel ramo d\'errore (un solo punto di emissione)', !/boom-conversion/.test(errBranch) && (page.match(/boom-conversion/g) || []).length === 1);
}

console.log('\n\x1b[1m▸ in un browser vero: la conversione parte solo a lead arrivato\x1b[0m');
{
  const { loadChromium, launchOptions } = await import('../_browser.mjs');
  const chromium = await loadChromium();
  if (!chromium) console.log('  SKIP: playwright non disponibile — la prova in browser non gira');
  else {
    const http = await import('node:http');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const R = new URL('../../', import.meta.url).pathname;
    const srv = http.createServer((rq, rs) => {
      let u = rq.url.split('?')[0]; if (u === '/executive') u = '/executive.html';
      const f = path.join(R, u);
      fs.readFile(f, (e, d) => e ? (rs.statusCode = 404, rs.end())
        : (rs.setHeader('content-type', f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : 'text/html'), rs.end(d)));
    }).listen(0);
    const port = srv.address().port;
    const br = await chromium.launch(await launchOptions());
    try {
      for (const [mode, status, body] of [['ok', 200, '{"ok":true,"id":"x"}'], ['errore', 500, '{"ok":false,"error":"server"}']]) {
        const pg = await br.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const errs = []; pg.on('pageerror', e => errs.push(e.message));
        await pg.addInitScript(() => { window.__conv = []; addEventListener('boom-conversion', e => window.__conv.push(e.detail)); });
        let hits = 0;
        await pg.route('**/*', async r => {
          const u = r.request().url();
          if (u.includes('/api/executive-lead')) { hits++; return r.fulfill({ status, contentType: 'application/json', body }); }
          return u.startsWith(`http://localhost:${port}`) ? r.continue() : r.abort();
        });
        await pg.goto(`http://localhost:${port}/executive`, { waitUntil: 'load' });
        await pg.click('#fGo');
        const before = await pg.evaluate(() => window.__conv.length);
        await pg.fill('#fName', 'Anna Keller'); await pg.fill('#fEmail', 'anna@example.com');
        await pg.click('#fGo'); await pg.waitForTimeout(250);
        const conv = await pg.evaluate(() => window.__conv);
        if (mode === 'ok') {
          ok('[ok] modulo vuoto: nessuna conversione; risposta ok: UNA conversione confermata',
            before === 0 && hits === 1 && conv.length === 1 && conv[0].label === 'Executive lead sent' && conv[0].section === 'form'
            && (await pg.isVisible('#fDone')) && errs.length === 0, { before, hits, conv, errs });
        } else {
          ok('[errore] la porta risponde 500: il modulo lo dice e NESSUNA conversione',
            hits === 1 && conv.length === 0 && (await pg.isVisible('#exForm')) && (await pg.isVisible('#fErr')), { hits, conv });
        }
        await pg.close();
      }
    } finally { await br.close(); srv.close(); }
  }
}

console.log(`\n${fail === 0 ? '\x1b[32m\x1b[1m' : '\x1b[31m\x1b[1m'}Executive: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
