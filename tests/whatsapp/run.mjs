// tests/whatsapp/run.mjs — la chiave di volta: da WhatsApp a lead, senza AI.
//
// Questo è il pezzo che permette a Homie di SMETTERE di pensare. Se sbaglia,
// sbaglia in uno dei due modi che costano davvero:
//   · troppo permissivo → la pipeline si riempie di 👍 e di inquilini che
//     chiedono della caldaia, e l'operatore smette di guardare i ping
//   · troppo severo     → un cliente vero sparisce, ed è la cosa peggiore che
//     questo software possa fare
// Quindi si testano entrambe le direzioni, sul comportamento reale del
// handler (Firestore finto in memoria), non solo sulle funzioni pure.
//
// Esegui: node tests/whatsapp/run.mjs

import { isNoise, matchListing, mergeMessage, buildLead, MAX_MESSAGE } from '../../api/homie/_lead.js';
import crypto from 'node:crypto';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

// ── 1. il rumore, e SOLO il rumore ─────────────────────────────────────────
for (const junk of ['👍', '🙏', 'ok', 'OK!', 'va bene', 'grazie', 'grazie mille', 'thanks', 'Thank you',
                    'perfetto', 'ricevuto', '✅', '...', '!!!', ' ', 'a', 'ciao', 'Hello', 'Buongiorno']) {
  ok(`rumore scartato: ${JSON.stringify(junk)}`, isNoise(junk));
}
for (const real of [
  'Ciao, cercavo un bilocale a Pigneto per settembre',
  'Hello! Is the apartment in Trastevere still available?',
  'buongiorno, vorrei visitare la casa di via Cavour',
  'ok ma quanto è il deposito?',
  'grazie, posso vederla giovedì?',
  'Salve, sono di Berlino e mi trasferisco a Roma a ottobre',
  '1400 euro sono trattabili?',
]) {
  ok(`messaggio vero tenuto: ${JSON.stringify(real.slice(0, 40))}`, !isNoise(real));
}

// ── 2. la casa di cui parlano, senza tirare a indovinare ───────────────────
const CATALOG = [
  { id: 'l1', name: 'Trilocale Pigneto', zone: 'Pigneto', address: 'Via del Pigneto 42', price: 1400 },
  { id: 'l2', name: 'Bilocale Trastevere', zone: 'Trastevere', address: 'Vicolo del Cinque 3', price: 1600 },
  { id: 'l3', name: 'Monolocale Ostiense', zone: 'Ostiense', address: 'Via Ostiense 210', price: 850 },
];
ok('aggancia dalla zona', (matchListing('cercavo qualcosa a Pigneto', CATALOG) || {}).id === 'l1');
ok('aggancia dalla via', (matchListing('quella di vicolo del Cinque', CATALOG) || {}).id === 'l2');
ok('nessun aggancio → null', matchListing('cerco casa a Milano', CATALOG) === null);
ok('un pareggio non produce un match', matchListing('appartamento a roma', CATALOG) === null);
ok('catalogo vuoto non esplode', matchListing('Pigneto', []) === null);
ok('testo vuoto non esplode', matchListing('', CATALOG) === null);

// ── 3. il messaggio che cresce con la conversazione ────────────────────────
ok('primo messaggio', mergeMessage('', 'ciao') === 'ciao');
ok('si accumula', mergeMessage('ciao', 'cercavo un bilocale') === 'ciao\ncercavo un bilocale');
ok('non duplica una ripetizione', mergeMessage('cercavo un bilocale', 'un bilocale') === 'cercavo un bilocale');
ok('ignora il vuoto', mergeMessage('ciao', '   ') === 'ciao');
ok('non cresce all\'infinito', mergeMessage('x'.repeat(MAX_MESSAGE), 'ancora').length === MAX_MESSAGE);

// ── 4. lo schema del lead: identico a quello che tutto il resto legge ──────
{
  const l = buildLead({
    text: 'Hello, is the Trastevere flat available?', phone: '+393331234567',
    name: 'Sophie K', listing: CATALOG[1], messageId: 'wamid.X', conversationId: 'conv_whatsapp_393331234567',
    at: new Date('2026-08-01T10:00:00Z'),
  });
  ok('source whatsapp', l.source === 'whatsapp');
  ok('status new — entra nella pipeline', l.status === 'new');
  ok('la lingua NON è dichiarata (la deduce replyLang)', l.language === null, l.language);
  ok('la casa viaggia col lead', l.propertyId === 'l2' && l.propertyPrice === 1600);
  ok('il telefono c\'è (è il bottone WhatsApp)', l.phone === '+393331234567');
  ok('la conversazione è ricordata', l.conversationId === 'conv_whatsapp_393331234567');
  ok('il messaggio è quello vero', l.message.startsWith('Hello, is the Trastevere'));

  const anon = buildLead({ text: 'ciao cercavo casa', phone: '+393339999999', name: '', listing: null });
  ok('senza nome usa il numero', anon.name === '+393339999999', anon.name);
  ok('senza casa resta null, non inventa', anon.propertyId === null);
}

// ── 5. il handler vero, con un Firestore in memoria ────────────────────────
// Nessun mock del modulo: si intercetta `fetch`, che è l'unica porta verso
// Firestore in homie/_lib.js. Così si testa il codice che va in produzione.
const DB = new Map();
const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = f => {
  if (!f) return null;
  if ('nullValue' in f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
};
const versions = new Map();
let version = 0;
const toDoc = (path, data) => ({ updateTime: versions.get(path) || '2026-01-01T00:00:00.000Z', name: `projects/p/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });

let autoId = 0;
const media = new Map();
let mediaHits = 0, aiHits = 0, storageHits = 0, aiFails = false, lastPrompt = '', beforeAI = () => {};
let modelProperty = 'pA';
const documentWrites = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });

  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  if (media.has(u)) {
    mediaHits++;
    ok('download allegato con scadenza', !!opts.signal);
    const att = media.get(u);
    if (att.error) throw new Error('download_failed');
    return new Response(att.bytes || '%PDF-1.4 fixture', { headers: {
      'content-type': att.type || 'application/pdf', ...(att.headers || {}),
    } });
  }
  if (u.includes('firebasestorage.googleapis.com')) { storageHits++; return json({ downloadTokens: 'test-download' }); }
  if (u.includes('api.anthropic.com')) {
    beforeAI();
    aiHits++;
    const payload = JSON.parse(opts.body);
    lastPrompt = payload.messages[0].content.find(b => b.type === 'text').text;
    if (aiFails) throw new Error('sensitive-document-text-must-not-be-logged');
    return json({ content: [{ type: 'text', text: JSON.stringify({
      category: 'ape', fiscalYear: 2026, propertyId: modelProperty, summary: 'Fixture APE',
    }) }] });
  }

  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';

  if (u.endsWith(':commit')) {
    const writes = body.writes || [];
    for (const w of writes) {
      const key = w.update?.name?.split('/documents/')[1], condition = w.currentDocument || {};
      if ((condition.exists === false && DB.has(key)) || (condition.exists === true && !DB.has(key))
        || (condition.updateTime && condition.updateTime !== (versions.get(key) || '2026-01-01T00:00:00.000Z')))
        return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
    }
    const results = writes.map(w => {
      const key = w.update.name.split('/documents/')[1];
      const values = Object.fromEntries(Object.entries(w.update.fields || {}).map(([k,v]) => [k,dec(v)]));
      DB.set(key, w.updateMask ? { ...(DB.get(key) || {}), ...values } : values);
      versions.set(key, new Date(Date.parse('2026-01-01T00:00:00Z') + ++version).toISOString());
      return { updateTime: versions.get(key) };
    });
    return json({ writeResults: results });
  }
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    const filter = q.where && q.where.fieldFilter;
    const rows = [...DB.entries()]
      .filter(([k]) => k.startsWith(coll + '/'))
      .map(([k, v]) => [k, v])
      .filter(([, v]) => !filter || String(v[filter.field.fieldPath]) === String(dec(filter.value)));
    return json(rows.map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'PATCH') {
    const key = path;
    const prev = DB.get(key) || {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    DB.set(key, next);
    versions.set(key, new Date(Date.parse('2026-01-01T00:00:00Z') + ++version).toISOString());
    return json(toDoc(key, next));
  }
  if (opts.method === 'POST') {
    const coll = path;
    const id = new URL(u).searchParams.get('documentId') || 'doc' + (++autoId);
    if (DB.has(`${coll}/${id}`)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    if (coll === 'documents') documentWrites.push(Object.fromEntries(Object.entries(body.fields).map(([k, v]) => [k, dec(v)])));
    DB.set(`${coll}/${id}`, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(`${coll}/${id}`, DB.get(`${coll}/${id}`)));
  }
  // GET
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

process.env.HOMIE_SECRET = 'test-secret';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.ANTHROPIC_API_KEY = 'fixture';

// homie/message ora importa (staticamente, la lezione nodemailer) la catena
// della Segretaria → agent/_lib → nodemailer: mock via loader come in notify.
const { register } = await import('node:module');
register('../notify/loader.mjs', import.meta.url);

const { default: handler } = await import('../../api/homie/message.js');

const call = async payload => {
  const req = {
    method: 'POST',
    headers: { 'x-homie-secret': 'test-secret', 'content-type': 'application/json' },
    body: payload,
    on(ev, cb) { if (ev === 'data') cb(Buffer.from(JSON.stringify(payload))); if (ev === 'end') cb(); return this; },
  };
  let out = null, code = 0;
  const res = {
    setHeader() {}, status(c) { code = c; return this; },
    json(o) { out = o; return this; }, end() { return this; },
  };
  await handler(req, res);
  return { code, ...(out || {}) };
};
const leads = () => [...DB.entries()].filter(([k]) => k.startsWith('leads/'));

// il catalogo che il matcher legge
for (const l of CATALOG) DB.set(`listings/${l.id}`, l);

// 5a. sconosciuto che scrive davvero → nasce un lead
{
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567',
    name: 'Sophie K', body: 'Hi! Is the Trastevere flat still available for September?', messageId: 'w1' });
  ok('handler ok', r.ok === true, r);
  ok('sconosciuto → lead creato', !!r.leadCreated && leads().length === 1, r);
  const [, lead] = leads()[0];
  ok('il lead aggancia la casa giusta', lead.propertyId === 'l2', lead.propertyId);
  ok('il lead è nuovo', lead.status === 'new');
  ok('la conversazione ricorda il lead', (DB.get('conversations/conv_whatsapp_393331234567') || {}).leadId === r.leadId);
}

// 5b. lo stesso che riscrive → NON un secondo lead, il primo si arricchisce
{
  const before = leads().length;
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331234567',
    body: 'I can visit next Thursday afternoon', messageId: 'w2' });
  ok('secondo messaggio non duplica il lead', leads().length === before && !!r.leadUpdated, r);
  const [, lead] = leads()[0];
  ok('il messaggio è cresciuto', lead.message.includes('Thursday'), lead.message);
  ok('…senza perdere il primo', lead.message.includes('Trastevere'), lead.message);
}

// 5c. un 👍 non crea niente
{
  const before = leads().length;
  await call({ direction: 'in', channel: 'whatsapp', phone: '+393338888888', body: '👍', messageId: 'w3' });
  ok('un pollice in su non è un cliente', leads().length === before);
}

// 5d. un inquilino che scrive per la caldaia non entra in pipeline
{
  DB.set('users/u9', { id: 'u9', role: 'tenant', name: 'Marco', phone: '+393337777777' });
  const before = leads().length;
  await call({ direction: 'in', channel: 'whatsapp', phone: '+393337777777',
    body: 'Ciao, la caldaia perde acqua, puoi mandare qualcuno?', messageId: 'w4' });
  ok('un inquilino non diventa un lead', leads().length === before);
  ok('…ma la sua conversazione esiste', !!DB.get('conversations/conv_tenant_u9'));
}

// 5e. l'operatore risponde a mano → il Commerciale tace
{
  const r = await call({ direction: 'out', channel: 'whatsapp', phone: '+393331234567',
    body: 'Ciao Sophie, ti mando subito i dettagli!', messageId: 'w5' });
  const [, lead] = leads().find(([, l]) => l.phone === '+393331234567');
  ok('una risposta umana marca il lead contattato', lead.status === 'contacted', lead.status);
  ok('…ed è tracciata', lead.contactedBy === 'whatsapp', r);
}

// 5f. lo stesso numero già in pipeline da un'altra porta → un lead, non due.
// Due percorsi arrivano allo stesso esito e vanno provati entrambi:
//   · numero scritto uguale → lo trova resolveByPhone (ramo "arricchisci")
//   · numero scritto DIVERSO ("3336666666" contro "+393336666666", che è la
//     norma nei dati reali: i portali salvano senza prefisso) → resolveByPhone
//     fallisce e deve intervenire recentLeadByPhone sul numero normalizzato.
//     Senza quel secondo giro, la stessa persona diventa due lead e riceve
//     due risposte diverse.
{
  DB.set('leads/portal1', { id: 'portal1', source: 'immobiliare', phone: '+393336666666',
    message: 'Richiesta dal portale', status: 'new', createdAt: new Date().toISOString() });
  const before = leads().length;
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393336666666',
    body: 'Ciao, ti ho scritto anche dal portale — quando posso vedere casa?', messageId: 'w6' });
  ok('stesso numero, stesso formato → un lead solo', leads().length === before && r.leadId === 'portal1', r);
  ok('e il messaggio WhatsApp si aggiunge', (DB.get('leads/portal1') || {}).message.includes('quando posso vedere'), DB.get('leads/portal1'));

  // IL caso di produzione: il portale ha salvato il NAZIONALE, WhatsApp
  // consegna l'INTERNAZIONALE. Prima nessuno dei due percorsi lo riconosceva.
  DB.set('leads/portal2', { id: 'portal2', source: 'idealista', phone: '3334444444',
    message: 'Richiesta dal portale', status: 'new', createdAt: new Date().toISOString() });
  const before2 = leads().length;
  const r2 = await call({ direction: 'in', channel: 'whatsapp', phone: '+393334444444',
    body: 'Buongiorno, sono io che ho scritto su Idealista per Ostiense', messageId: 'w8' });
  ok('nazionale in archivio + internazionale da WhatsApp → un lead solo',
    leads().length === before2, { n: leads().length, r2 });
  ok('…agganciato a quello che esisteva', r2.leadId === 'portal2', r2);
  ok('…e il messaggio si è aggiunto lì', (DB.get('leads/portal2') || {}).message.includes('Idealista'),
    DB.get('leads/portal2'));
}

// 5g. idempotenza: lo stesso messageId due volte non raddoppia niente
{
  const before = leads().length;
  const r = await call({ direction: 'in', channel: 'whatsapp', phone: '+393335555555',
    body: 'Salve, cercavo un monolocale a Ostiense', messageId: 'w7' });
  const mid = leads().length;
  const r2 = await call({ direction: 'in', channel: 'whatsapp', phone: '+393335555555',
    body: 'Salve, cercavo un monolocale a Ostiense', messageId: 'w7' });
  ok('un rinvio dello stesso messaggio è un no-op', mid === before + 1 && leads().length === mid, { r, r2 });
  ok('…e lo dichiara', r2.dedupHit === true, r2);
}

// 5g-bis. LA FINESTRA DI TRANSIZIONE.
// Mentre Homie cambia mandato, la stessa persona può arrivare da DUE porte:
// l'inoltro grezzo (/api/homie/message, parte all'istante) e il vecchio
// /api/homie/inbound (parte dopo l'analisi, quindi DOPO). Entrambi gli ordini
// devono produrre UN lead solo — altrimenti il cliente riceve due risposte
// diverse proprio nei giorni in cui stiamo spegnendo il vecchio sistema.
{
  const { default: inbound } = await import('../../api/homie/inbound.js');
  const callInbound = async payload => {
    const req = { method: 'POST', headers: { 'x-homie-secret': 'test-secret' }, body: payload,
      on(ev, cb) { if (ev === 'data') cb(Buffer.from(JSON.stringify(payload))); if (ev === 'end') cb(); return this; } };
    let out = null;
    const res = { setHeader() {}, status() { return this; }, json(o) { out = o; return this; }, end() { return this; } };
    await inbound(req, res);
    return out || {};
  };

  // ordine A: prima l'inoltro grezzo, poi l'analisi di Homie
  const beforeA = leads().length;
  await call({ direction: 'in', channel: 'whatsapp', phone: '+393332222222',
    body: 'Ciao, cercavo un trilocale a Pigneto da settembre', messageId: 'wA' });
  const rA = await callInbound({ source: 'whatsapp', name: 'Marco R', phone: '+393332222222',
    message: 'Ciao, cercavo un trilocale a Pigneto da settembre', grade: 'B' });
  ok('inoltro poi analisi → un lead solo', leads().length === beforeA + 1 && rA.deduped === true,
    { n: leads().length - beforeA, rA });

  // ordine B: prima l'analisi (vecchio percorso), poi l'inoltro grezzo
  const beforeB = leads().length;
  await callInbound({ source: 'whatsapp', name: 'Giulia T', phone: '+393331111111',
    message: 'Salve, il monolocale di Ostiense è libero?' });
  const rB = await call({ direction: 'in', channel: 'whatsapp', phone: '+393331111111',
    body: 'Salve, il monolocale di Ostiense è libero?', messageId: 'wB' });
  ok('analisi poi inoltro → un lead solo', leads().length === beforeB + 1, { n: leads().length - beforeB, rB });

  // e il formato del numero non deve rompere nemmeno qui
  const beforeC = leads().length;
  await call({ direction: 'in', channel: 'whatsapp', phone: '+393337000000',
    body: 'Buonasera, cerco casa in zona Pigneto', messageId: 'wC' });
  const rC = await callInbound({ source: 'whatsapp', name: 'Luca P', phone: '3337000000',
    message: 'Buonasera, cerco casa in zona Pigneto' });
  ok('formati diversi fra le due porte → sempre un lead solo',
    leads().length === beforeC + 1 && rC.deduped === true, { n: leads().length - beforeC, rC });
}

// 5h. il buco che chiudeva Homie: un lead vivo dopo un giro completo
{
  const whatsappLeads = leads().filter(([, l]) => l.source === 'whatsapp');
  ok('i lead WhatsApp sono nella pipeline', whatsappLeads.length >= 2, whatsappLeads.length);
  ok('ognuno ha il telefono per il bottone', whatsappLeads.every(([, l]) => !!l.phone));
  ok('nessuno dichiara una lingua inventata', whatsappLeads.every(([, l]) => l.language === null));
}

// ── 6. Le porte: Smistatore VERO, solo media/Anthropic/Storage mockati ─────
const docs = () => [...DB.entries()].filter(([key]) => key.startsWith('documents/'));
const docKey = url => 'documents/wa_' + crypto.createHash('sha1').update(url).digest('hex');
const attachment = (name, opts = {}) => {
  const url = `https://media.example.test/${name}`;
  media.set(url, opts);
  return url;
};
DB.set('properties/pA', { title: 'Cavour', ownerId: 'owner1' });
DB.set('properties/pB', { title: 'Prati', ownerId: 'owner1' });
DB.set('properties/pOther', { title: 'Altrui', ownerId: 'other' });
DB.set('users/docTenant', { role: 'tenant', name: 'Inquilino fixture', phone: '3338000001', email: 'tenant@example.test' });
DB.set('contracts/docContract', { tenantId: 'docTenant', propertyId: 'pA', status: 'active' });
{
  const url = attachment('tenant.pdf');
  await call({ direction: 'in', phone: '+393338000001', body: 'Ecco il documento della casa', mediaUrls: [url], messageId: 'doc-known' });
  const doc = DB.get(docKey(url));
  ok('allegato noto → SUO immobile e SUO contratto', doc?.propertyId === 'pA' && doc?.contractId === 'docContract' && doc?.needsFiling === false, doc);
  ok('origine whatsapp e hint col testo vero', doc?.source === 'whatsapp' && lastPrompt.includes('Ecco il documento della casa'));
}
{
  const url = attachment('unknown.pdf');
  const before = { docs: docs().length, ai: aiHits, storage: storageHits, media: mediaHits };
  const payload = { direction: 'in', phone: '+393338000002', body: 'Vorrei casa, allego il documento', mediaUrls: [url], messageId: 'doc-unknown' };
  const r = await call(payload);
  ok('sconosciuto: messaggio, allegato e lead restano disponibili', r.leadCreated
    && DB.get(`messages/${r.messageId}`)?.attachments?.includes(url) && DB.get(`leads/${r.leadId}`)?.message === payload.body);
  await call({ ...payload, messageId: 'doc-retry-other-id' });
  await call({ ...payload, contactType: 'tenant', contactId: 'docTenant' });
  ok('sconosciuto anche al retry: nessun download, modello, Storage o documento',
    docs().length === before.docs && aiHits === before.ai && storageHits === before.storage && mediaHits === before.media);
}
for (const [type, coll] of [['lead', 'leads'], ['pfs', 'pfsClients'], ['client', 'clients']]) {
  const url = attachment(type + '-excluded.pdf'), id = 'doc-' + type;
  // Un'email uguale a quella del tenant NON scavalca il tipo del contatto.
  DB.set(coll + '/' + id, { phone: '+39333801000' + ({lead: 1, pfs: 2, client: 3}[type]), email: 'tenant@example.test' });
  const before = [docs().length, aiHits, storageHits, mediaHits].join(',');
  const r = await call({ direction: 'in', contactType: type, contactId: id,
    body: 'Allego il documento', mediaUrls: [url], messageId: id });
  ok(`${type}: allegato conservato senza Smistatore anche con email nota`,
    DB.get(`messages/${r.messageId}`)?.attachments?.includes(url)
    && before === [docs().length, aiHits, storageHits, mediaHits].join(','));
}
{
  // Email condivisa con un tenant: non deve promuovere il ruolo admin.
  DB.set('users/docAdmin', { role: 'admin', email: 'tenant@example.test' });
  for (const contactType of ['operator', 'tenant']) {
    const url = attachment('admin-' + contactType + '.pdf');
    const before = [docs().length, aiHits, storageHits, mediaHits].join(',');
    const r = await call({ direction: 'in', contactType, contactId: 'docAdmin',
      email: process.env.FIREBASE_ADMIN_EMAIL, body: 'Documento operatore', mediaUrls: [url], messageId: 'doc-admin-' + contactType });
    ok(`operatore WhatsApp (${contactType} dichiarato): non aggira il vincolo`,
      DB.get(`messages/${r.messageId}`)?.attachments?.includes(url)
      && before === [docs().length, aiHits, storageHits, mediaHits].join(','));
  }
}
{
  const url = attachment('tenant-dedupe.pdf');
  const payload = { direction: 'in', phone: '+393338000001', body: 'Ecco il documento', mediaUrls: [url], messageId: 'doc-known-dedupe' };
  await call(payload);
  const before = [docs().length, aiHits, storageHits, mediaHits].join(',');
  await call({ ...payload, messageId: 'doc-known-dedupe-new-message' });
  await call(payload);
  ok('tenant, stesso URL con messageId diversi: un documento e nessuna seconda spesa',
    DB.has(docKey(url)) && before === [docs().length, aiHits, storageHits, mediaHits].join(','));
}
{
  const url = attachment('failure.pdf');
  const phone = '+393338000001', text = 'Ecco il documento della casa';
  let primaryBeforeFailure = false;
  const initialLeads = leads().length;
  beforeAI = () => {
    primaryBeforeFailure = [...DB.values()].some(m => m.waMessageId === 'doc-fail' && m.body === text && m.attachments?.includes(url));
  };
  aiFails = true;
  const warnings = [], warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  let result;
  try { result = await call({ direction: 'in', phone, body: text, mediaUrls: [url], messageId: 'doc-fail' }); }
  finally { aiFails = false; beforeAI = () => {}; console.warn = warn; }
  ok('errore allegato tenant: messaggio e URL persistiti PRIMA del fallimento', primaryBeforeFailure);
  ok('errore allegato tenant: risposta 200, messaggio salvo e nessun lead creato', result.code === 200
    && DB.get(`messages/${result.messageId}`)?.body === text && leads().length === initialLeads, result);
  ok('errore allegato: nessun contenuto del documento nei log', !warnings.join('').includes('sensitive-document'));
  const recovered = await call({ direction: 'in', phone, body: text, mediaUrls: [url], messageId: 'doc-fail' });
  ok('retry stesso messageId recupera allegato fallito senza duplicare il messaggio', recovered.dedupHit === true
    && DB.has(docKey(url)) && [...DB.values()].filter(m => m.waMessageId === 'doc-fail').length === 1);
}
{
  DB.set('users/owner1', { role: 'landlord', phone: '+393338000004' });
  const url = attachment('owner.png', { type: 'image/png' });
  modelProperty = null;
  await call({ direction: 'in', phone: '+393338000004', body: 'Una bolletta delle mie case', mediaUrls: [url], messageId: 'doc-two-properties' });
  const doc = DB.get(docKey(url));
  ok('proprietario: TUTTI gli immobili, senza default inventato', doc?.needsFiling === true
    && doc?.relatedPropertyIds?.sort().join(',') === 'pA,pB', doc);
  modelProperty = 'pOther';
  DB.set('users/noProperty', { role: 'tenant', phone: '+393338000005' });
  const noProperty = attachment('no-property.pdf');
  await call({ direction: 'in', phone: '+393338000005', body: 'Allego il mio documento', mediaUrls: [noProperty], messageId: 'doc-no-property' });
  ok('contatto noto senza aggancio: mai catalogo libero', DB.get(docKey(noProperty))?.needsFiling === true && DB.get(docKey(noProperty))?.propertyId === null);
  modelProperty = 'pA';
}
{
  const bad = attachment('binary.pdf', { type: 'application/octet-stream' });
  const misleading = attachment('fake.pdf', { type: 'application/pdf-malicious' });
  const large = attachment('large.pdf', { headers: { 'content-length': String(9 * 1024 * 1024) } });
  const streamed = attachment('streamed.pdf', { bytes: Buffer.alloc(8 * 1024 * 1024 + 1) });
  const broken = attachment('broken.pdf', { error: true });
  const valid = attachment('after-broken.pdf');
  const ai = aiHits;
  const r = await call({ direction: 'in', phone: '+393338000001', body: 'Mando i documenti della casa',
    mediaUrls: [bad, misleading, large, streamed, broken, valid], messageId: 'doc-limits' });
  ok('solo PDF/immagini entro 8MB, anche senza Content-Length', [bad, misleading, large, streamed, broken].every(u => !DB.has(docKey(u))) && aiHits === ai + 1);
  ok('un allegato fallito non perde il successivo né il messaggio', DB.has(docKey(valid)) && DB.has(`messages/${r.messageId}`));
  const out = attachment('outbound.pdf');
  await call({ direction: 'out', phone: '+393338000001', body: 'Ecco il documento', mediaUrls: [out] });
  ok('gli allegati in uscita non entrano nello Smistatore', !DB.has(docKey(out)));
}
{
  const realFetch = globalThis.fetch, realNow = Date.now;
  const url = attachment('budget.pdf');
  const payload = { direction: 'in', phone: '+393338000001', body: 'Allego il documento della casa', mediaUrls: [url], messageId: 'doc-budget' };
  globalThis.fetch = async (u, opts) => {
    const response = await realFetch(u, opts);
    if ((String(u).endsWith('/messages') || (String(u).endsWith(':commit')
      && JSON.parse(opts?.body || '{}').writes?.some(w => w.update?.name.includes('/messages/')))) && opts?.method === 'POST') {
      const time = realNow(); Date.now = () => time + 25_000;
    }
    return response;
  };
  let r;
  try { r = await call(payload); } finally { globalThis.fetch = realFetch; Date.now = realNow; }
  ok('budget consumato dal testo: messaggio salvo, allegato rinviato', DB.has(`messages/${r.messageId}`) && !DB.has(docKey(url)));
  await call(payload);
  ok('retry dopo rinvio per budget recupera il documento', DB.has(docKey(url)));
}

{
  const url = attachment('percent-%E0%A4%A.pdf');
  const r = await call({ direction: 'in', phone: '+393338000001', body: 'Nome file malformato', mediaUrls: [url], messageId: 'doc-bad-filename' });
  ok('percent encoding malformato: nome grezzo, documento non perso', r.code === 200
    && DB.get(docKey(url))?.fileName === 'percent-_E0_A4_A.pdf');
}

console.log(fails ? `\n${fails} FALLITI` : '\nTutto verde.');
process.exit(fails ? 1 : 0);
