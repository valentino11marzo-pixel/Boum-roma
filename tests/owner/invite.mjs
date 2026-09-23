// tests/owner/invite.mjs — l'ingresso del proprietario, blindato (pacchetto C).
//
// Si guida l'HANDLER VERO (api/owner/invite.js) sulla rete finta di
// tests/owner/_harness.mjs (Firestore, Identity Toolkit, Storage in memoria);
// nodemailer è il mock della suite notify (loader). LE REGOLE:
//   · solo un admin invita; il PIANO (preview) non scrive e non crea account;
//   · la scala dell'email è users → landlords → immobile → contratto;
//   · l'invito esegue SOLO il piano visto (hash) e in un commit atomico:
//     una gara in mezzo = 409 e nessun immobile collegato a metà;
//   · un immobile di un ALTRO proprietario non si riassegna mai (mutazione);
//   · le vecchie schede con la stessa email diventano alias (claim), i buchi
//     di landlords/<uid> si riempiono senza toccare ciò che c'è, le schede
//     vecchie restano intatte;
//   · un account senza prova non si indovina (auth_without_profile), un
//     invito a metà si recupera dal segno lasciato prima del commit;
//   · il claim di una vecchia scheda chiede una prova FORTE dell'account: col
//     solo lastLogin resta blocked claim_needs_proof, niente alias (23/09);
//   · l'uscita del proprietario vero è la conferma ESPLICITA dell'admin
//     (confirmAccount:true, solo su proof 'weak'): nell'hash del piano,
//     elencata come conseguenza, scritta nello stesso commit (authUid +
//     accountConfirmedAt/By) e nel registro; la spunta della finestra è
//     spenta di default e un cambio d'email la spegne. Mutazioni (23/09):
//     flag ignorato · flag onorato fuori dall'hash · timbro fuori dal commit ·
//     spunta accesa di default · conferma che segue l'email — tutte rosse;
//   · la finestra non invia mai un piano vecchio: email cambiata → «Invia»
//     spento e «Ricalcola il piano»; l'invito porta l'email mostrata (23/09);
//   · un invito ripetuto non crea account, non aggiunge storia, non rimanda
//     l'email (salvo resend); l'email non porta indirizzi, importi, né l'email
//     del destinatario nella query del link;
//   · /login: il primo accesso manda il link di reset verso /proprietario con
//     UN solo messaggio, senza un secondo <form>;
//   · benvenuto, rendiconto, verbale: il bottone all'archivio solo a chi è
//     stato invitato o è già entrato, mai il link tokenizzato al locatore.
//
//   node tests/owner/invite.mjs
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHarness } from './_harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0, failed = 0; const bad = [];
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; bad.push(name); console.log('  ✗ ' + name); }
}
function section(t) { console.log('\n' + t); }
const mails = () => globalThis.__mails || [];
const mailTo = (a) => mails().filter((m) => String(m.to).toLowerCase() === a.toLowerCase());

const ADMIN = { 'users/adm': { role: 'admin', name: 'Valentino', email: 'valentino@boom-rome.com' } };

let handler, INV, current = null;
async function boot(opts) {
  if (current) current();
  globalThis.__mails = [];
  const h = createHarness({ ...opts, seed: { ...ADMIN, ...(opts.seed || {}) } });
  current = h.install();
  if (!handler) { INV = await import('../../api/owner/invite.js'); handler = INV.default; }
  return h;
}
const post = (h, body, uid = 'adm') => h.call(handler, { method: 'POST', uid, body });
const preview = (h, body) => post(h, { op: 'preview', ...body });
const writesOf = (h, snap) => h.diff(snap).filter((d) => !d.path.startsWith('activityLog/'));
const signUpCalls = (h) => h.fetchLog.filter((f) => f.url.includes('accounts:signUp')).length;

// ═══ 1. Porta: solo admin, metodo, corpo ═════════════════════════════════
section('1. la porta');
{
  const h = await boot({ seed: { 'users/L9': { role: 'landlord', email: 'l9@x.it' }, 'properties/p1': { ownerId: null, address: 'Via Cavour 12', ownerEmail: 'n@x.it' } } });
  const snap = h.snapshot();
  const r1 = await post(h, { op: 'preview', propertyIds: ['p1'] }, 'L9');
  ok('un landlord → 403 forbidden', r1.statusCode === 403 && r1.body.error === 'forbidden');
  const r2 = await h.call(handler, { method: 'POST', body: { op: 'preview', propertyIds: ['p1'] } });
  ok('senza token → 401', r2.statusCode === 401);
  const r3 = await h.call(handler, { method: 'GET', uid: 'adm', body: {} });
  ok('GET → 405', r3.statusCode === 405);
  const r4 = await post(h, { op: 'preview', propertyIds: ['../x'] });
  const r5 = await post(h, { op: 'preview', propertyIds: [] });
  const r6 = await post(h, { op: 'boh', propertyIds: ['p1'] });
  const r7 = await post(h, { op: 'preview', propertyIds: Array.from({ length: 11 }, (_, i) => 'p' + i) });
  ok('id malformato / vuoto / op ignota / >10 immobili → 400 bad_request', [r4, r5, r6, r7].every((r) => r.statusCode === 400 && r.body.error === 'bad_request'));
  const r8 = await post(h, { op: 'preview', propertyIds: ['nope'] });
  ok('immobile inesistente → 404 property_not_found {ids}', r8.statusCode === 404 && r8.body.error === 'property_not_found' && r8.body.ids[0] === 'nope');
  const r9 = await post(h, { op: 'invite', propertyIds: ['p1'] });
  ok('invite senza previewHash → 400 preview_required', r9.statusCode === 400 && r9.body.error === 'preview_required');
  ok('nessuna di queste ha scritto', writesOf(h, snap).length === 0 && signUpCalls(h) === 0);
}

// ═══ 2. Il piano: non scrive, non crea account, la scala dell'email ══════
section('2. il piano (preview)');
{
  const seed = {
    'properties/p1': { ownerId: 'L1', address: 'Via Cavour 12', ownerEmail: 'prop@x.it', ownerName: 'Da Immobile' },
    'users/L1': { role: 'landlord', name: 'Mario Rossi', email: 'mario@x.it' },
    'landlords/L1': { name: 'Mario (CRM)', email: 'crm@x.it' },
    'contracts/c1': { propertyId: 'p1', landlordEmail: 'old@x.it', startDate: '2024-01-01' },
    'contracts/c2': { propertyId: 'p1', landlordEmail: 'new@x.it', landlordPhone: '+39 333 1112222', startDate: '2025-06-01' },
  };
  const h = await boot({ seed });
  const snap = h.snapshot();
  const r = await preview(h, { propertyIds: ['p1'] });
  ok('200 op preview', r.statusCode === 200 && r.body.ok === true && r.body.op === 'preview');
  ok('scala 1: users/<ownerId>.email', r.body.owner.email === 'mario@x.it' && r.body.owner.emailSource === 'users');
  ok('forma: account, properties, aliases, consequences, willSendEmail, previewHash',
    r.body.account && Array.isArray(r.body.properties) && Array.isArray(r.body.aliases) && Array.isArray(r.body.consequences)
    && r.body.willSendEmail === true && /^[0-9a-f]{64}$/.test(r.body.previewHash));
  ok('account assente (nessun Auth con quella email)', r.body.account.state === 'absent' && r.body.account.usersDocId === null);
  ok('la vecchia scheda L1 è un alias e p1 si RIUNISCE (claim)', r.body.aliases.some((a) => a.key === 'L1') && r.body.properties[0].action === 'claim');
  ok('telefono dal contratto più recente', r.body.owner.phone === '+39 333 1112222');
  delete h.DB.get('users/L1').email;
  const r2 = await preview(h, { propertyIds: ['p1'] });
  ok('scala 2: landlords/<ownerId>.email', r2.body.owner.email === 'crm@x.it' && r2.body.owner.emailSource === 'landlords');
  delete h.DB.get('landlords/L1').email;
  const r3 = await preview(h, { propertyIds: ['p1'] });
  ok('scala 3: property.ownerEmail', r3.body.owner.email === 'prop@x.it' && r3.body.owner.emailSource === 'property.ownerEmail');
  delete h.DB.get('properties/p1').ownerEmail;
  const r4 = await preview(h, { propertyIds: ['p1'] });
  ok('scala 4: il contract.landlordEmail PIÙ RECENTE', r4.body.owner.email === 'new@x.it' && r4.body.owner.emailSource === 'contract.landlordEmail');
  const r5 = await preview(h, { propertyIds: ['p1'], email: 'Scelta@X.it' });
  ok('email nel corpo: vince, fonte manual', r5.body.owner.email === 'Scelta@X.it' && r5.body.owner.emailSource === 'manual');
  const r6 = await preview(h, { propertyIds: ['p1'], email: 'non-una-email' });
  ok('email manuale malformata → 400 bad_email', r6.statusCode === 400 && r6.body.error === 'bad_email');
  for (const c of ['contracts/c1', 'contracts/c2']) delete h.DB.get(c).landlordEmail;
  const r7 = await preview(h, { propertyIds: ['p1'] });
  ok('nessuna email da nessuna parte → 409 no_email', r7.statusCode === 409 && r7.body.error === 'no_email');
  // la diff si prende sui soli documenti che il TEST non ha toccato a mano
  const wrote = h.diff(snap).filter((d) => d.kind !== 'changed' || !['users/L1', 'landlords/L1', 'properties/p1', 'contracts/c1', 'contracts/c2'].includes(d.path));
  ok('il piano non scrive NIENTE', wrote.length === 0);
  ok('il piano non chiama MAI signUp', signUpCalls(h) === 0 && h.signUps.length === 0);
  ok('lo stato account si chiede a createAuthUri', h.fetchLog.some((f) => f.url.includes('accounts:createAuthUri')));
}

// ═══ 3. Un proprietario nuovo: un account, un commit, un'email ═══════════
section('3. il proprietario nuovo');
let newUid = null;
{
  const h = await boot({ seed: {
    'properties/p1': { ownerId: null, address: 'Via Cavour 12', name: 'Cavour', ownerEmail: 'anna@x.it', ownerName: 'Anna Neri', ownerPhone: '+39 333 4445555', rent: 1250 },
  } });
  const pv = await preview(h, { propertyIds: ['p1'] });
  ok('piano: bind, account assente, rendiconto_starts', pv.body.properties[0].action === 'bind' && pv.body.account.state === 'absent'
    && pv.body.consequences.includes('rendiconto_starts'));
  // La finestra manda SEMPRE l'email del piano mostrato (revisione 23/09):
  // la stessa email, scritta a mano invece che trovata dalla scala, dà lo
  // STESSO piano — altrimenti ogni invito tornerebbe plan_changed.
  const same = await preview(h, { propertyIds: ['p1'], email: pv.body.owner.email });
  ok('email del piano rimandata a mano → stesso hash (fonte manual)', same.body.previewHash === pv.body.previewHash && same.body.owner.emailSource === 'manual');
  const stale = await post(h, { op: 'invite', propertyIds: ['p1'], previewHash: 'f'.repeat(64) });
  ok('hash vecchio → 409 plan_changed col piano nuovo, zero account', stale.statusCode === 409 && stale.body.error === 'plan_changed'
    && stale.body.preview && stale.body.preview.previewHash === pv.body.previewHash && h.signUps.length === 0);
  const r = await post(h, { op: 'invite', propertyIds: ['p1'], previewHash: pv.body.previewHash });
  ok('200 invite, account creato', r.statusCode === 200 && r.body.ok && r.body.createdAuth === true && r.body.usersDoc === 'created');
  newUid = r.body.uid;
  ok('signUp UNA volta, con quella email', h.signUps.length === 1 && h.signUps[0].email === 'anna@x.it' && newUid === h.signUps[0].localId);
  const u = h.DB.get('users/' + newUid);
  ok('users/<uid>: role landlord, email, invito timbrato', u && u.role === 'landlord' && u.email === 'anna@x.it' && u.ownerInvitedAt && u.ownerInvitedBy === 'adm'
    && u.createdBy === 'owner-invite' && u.name === 'Anna Neri');
  const p = h.DB.get('properties/p1');
  ok('ownerId impostato + storia «invite» da null', p.ownerId === newUid && p.ownerIdHistory.length === 1
    && p.ownerIdHistory[0].from === null && p.ownerIdHistory[0].to === newUid && p.ownerIdHistory[0].reason === 'invite' && p.ownerIdHistory[0].by === 'adm');
  ok('il segno di recupero c\'è, col solo uid', [...h.DB.keys()].some((k) => k.startsWith('heartbeat/owner-invite-') && h.DB.get(k).uid === newUid));
  ok('bound/claimed/kept/blocked nella risposta', JSON.stringify(r.body.bound) === '["p1"]' && !r.body.claimed.length && !r.body.blocked.length);
  const m = mailTo('anna@x.it');
  ok('UNA email a quell\'indirizzo, oggetto giusto', m.length === 1 && m[0].subject === 'Il suo archivio BOOM è attivo');
  const html = m[0] ? m[0].html : '';
  ok('link primo accesso: www, next=/proprietario, primo=1', html.includes('https://www.boomrome.com/login?next=%2Fproprietario&amp;primo=1'));
  ok('l\'email del destinatario SOLO nel frammento (#e=), mai nella query', html.includes('primo=1#e=anna%40x.it') && !/[?&](amp;)?e=anna/.test(html));
  ok('niente indirizzo, niente importi nell\'HTML', !html.includes('Cavour') && !html.includes('1250') && !html.includes('1.250') && !/€\s?\d/.test(html));
  ok('«Lei»: «Attiva il suo archivio» + accessi successivi', /ATTIVA IL SUO ARCHIVIO/.test(html) && html.includes('www.boomrome.com/proprietario'));
  ok('invio timbrato (ownerInviteSentAt) e attività registrata', !!h.DB.get('users/' + newUid).ownerInviteSentAt
    && [...h.DB.keys()].some((k) => k.startsWith('activityLog/') && h.DB.get(k).action === 'owner_invited'));
  ok('risposta: link di accesso SENZA email + testo WhatsApp', r.body.loginUrl === 'https://www.boomrome.com/login?next=%2Fproprietario&primo=1'
    && r.body.portalUrl === 'https://www.boomrome.com/proprietario' && /Gentile Anna Neri/.test(r.body.whatsappText) && !r.body.whatsappText.includes('anna@'));

  // Idempotenza: il secondo invito non crea account, non aggiunge storia, non rimanda.
  const pv2 = await preview(h, { propertyIds: ['p1'] });
  ok('secondo piano: account esistente (provato dall\'invito), p1 già suo', pv2.body.account.state === 'exists'
    && pv2.body.account.usersDocId === newUid && pv2.body.properties[0].action === 'keep' && pv2.body.willSendEmail === false);
  const snap2 = h.snapshot();
  const r2 = await post(h, { op: 'invite', propertyIds: ['p1'], previewHash: pv2.body.previewHash });
  ok('secondo invito: nessun signUp, already_sent, nessuna email', r2.statusCode === 200 && h.signUps.length === 1 && r2.body.createdAuth === false
    && r2.body.emailSkipped === 'already_sent' && r2.body.emailSent === false && mailTo('anna@x.it').length === 1);
  ok('...e nessuna scrittura (solo il registro attività)', writesOf(h, snap2).length === 0 && h.DB.get('properties/p1').ownerIdHistory.length === 1);
  const r3 = await post(h, { op: 'invite', propertyIds: ['p1'], previewHash: pv2.body.previewHash, resend: true });
  ok('resend → una seconda email', r3.body.emailSent === true && mailTo('anna@x.it').length === 2);
}

// ═══ 4. L'immobile di un altro non si riassegna MAI ═══════════════════════
section('4. l\'immobile altrui');
{
  const seed = {
    'properties/p1': { ownerId: null, address: 'Via A 1', ownerEmail: 'nuovo@x.it' },
    'properties/p2': { ownerId: 'OTHER', address: 'Via B 2' },
    'users/OTHER': { role: 'landlord', name: 'Altro', email: 'altro@x.it', lastLogin: '2026-01-01T00:00:00Z' },
  };
  const h = await boot({ seed });
  // Due immobili con proprietari diversi: la scala prenderebbe l'email di
  // OTHER (users/<ownerId> viene prima) — l'operatore scrive quella giusta.
  const pv = await preview(h, { propertyIds: ['p1', 'p2'], email: 'nuovo@x.it' });
  const p2 = pv.body.properties.find((x) => x.id === 'p2');
  ok('piano: p2 blocked owned_by_other', p2.action === 'blocked' && p2.reason === 'owned_by_other' && p2.currentOwnerKind === 'other');
  const r = await post(h, { op: 'invite', propertyIds: ['p1', 'p2'], email: 'nuovo@x.it', previewHash: pv.body.previewHash });
  ok('invito: p2 in blocked, p1 collegato', r.statusCode === 200 && r.body.blocked.some((b) => b.id === 'p2' && b.reason === 'owned_by_other') && r.body.bound.includes('p1'));
  ok('ownerId di p2 INVARIATO, nessuna storia', h.DB.get('properties/p2').ownerId === 'OTHER' && !h.DB.get('properties/p2').ownerIdHistory);

  const h2 = await boot({ seed });
  const snap = h2.snapshot();
  const pv2 = await preview(h2, { propertyIds: ['p2'], email: 'nuovo@x.it' });
  const r2 = await post(h2, { op: 'invite', propertyIds: ['p2'], email: 'nuovo@x.it', previewHash: pv2.body.previewHash });
  ok('solo immobili altrui → 409 nothing_to_bind, zero account, zero scritture', r2.statusCode === 409 && r2.body.error === 'nothing_to_bind'
    && h2.signUps.length === 0 && writesOf(h2, snap).length === 0);

  // Mutazione: la riga di guardia di propertyAction tolta → il controllo DEVE cadere.
  const src = read('api/owner/invite.js');
  const m = /export function propertyAction\(currentOwnerId, uid, aliasSet\) \{([\s\S]*?)\n\}/.exec(src);
  ok('la guardia è marcata nel sorgente', !!m && m[1].includes('/* guard in invite.js */'));
  const clip = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);
  const build = (body) => new Function('clip', 'return function (currentOwnerId, uid, aliasSet) {' + body + '\n}')(clip);
  const neverReassigns = (fn) => fn('OTHER', 'u1', new Set(['L1'])).action === 'blocked' && fn('L1', 'u1', new Set(['L1'])).action === 'claim';
  ok('propertyAction vera: l\'altrui resta blocked', neverReassigns(build(m[1])) && neverReassigns(INV.propertyAction));
  const mutated = m[1].replace(/\/\* guard in invite\.js \*\/\s*\n\s*return \{ action: 'blocked'[^\n]*/, "return { action: 'claim', kind: 'alias', reason: null };");
  ok('MUTAZIONE (guardia tolta): il controllo cade', mutated !== m[1] && !neverReassigns(build(mutated)));
}

// ═══ 5. Le vecchie schede: claim, buchi riempiti, originali intatti ══════
section('5. alias e riempimento dei buchi');
{
  const seed = {
    'properties/p1': { ownerId: 'L1', address: 'Via Innesto 1', ownerIdHistory: [{ from: null, to: 'L1', at: '2025-01-01', by: 'x', reason: 'innesto' }] },
    'properties/p3': { ownerId: 'L1', address: 'Via Innesto 3' },
    'properties/p4': { ownerId: 'L2', address: 'Via CRM 4' },
    'properties/p9': { ownerId: 'ZZ', address: 'Via Altri 9' },
    'users/L1': { role: 'landlord', name: 'Mario Rossi', email: 'Mario@X.it', codiceFiscale: 'RSSMRA80A01H501U', createdAt: '2025-01-01T00:00:00Z' },
    'landlords/L2': { name: 'Mario (CRM)', email: 'mario@x.it', iban: 'IT60X0542811101000000123456', phone: '+39 333 0000000', rating: 5 },
    'landlords/uid_new_1': { name: 'Mario R. (già scritto)', zones: ['Prati'] },
  };
  const h = await boot({ seed });
  const pv = await preview(h, { propertyIds: ['p1'], email: 'mario@x.it' });
  const ids = pv.body.properties.map((p) => p.id + ':' + p.action).sort().join(',');
  ok('piano: p1, p3 (L1, maiuscole diverse) e p4 (L2) tutti claim; p9 fuori', ids === 'p1:claim,p3:claim,p4:claim'
    && pv.body.properties.find((p) => p.id === 'p3').auto === true);
  ok('alias L1 (users) e L2 (landlords) + alias_merge', pv.body.aliases.some((a) => a.key === 'L1' && a.from === 'users')
    && pv.body.aliases.some((a) => a.key === 'L2' && a.from === 'landlords') && pv.body.consequences.includes('alias_merge'));
  const before = h.snapshot();
  const r = await post(h, { op: 'invite', propertyIds: ['p1'], email: 'mario@x.it', previewHash: pv.body.previewHash });
  const uid = r.body.uid;
  ok('account nuovo (le schede Innesto/CRM non hanno Auth)', r.statusCode === 200 && uid === 'uid_new_1' && r.body.createdAuth === true);
  ok('claimed: p1/p3 da L1, p4 da L2', r.body.claimed.length === 3 && r.body.claimed.some((c) => c.id === 'p4' && c.from === 'L2'));
  const p1 = h.DB.get('properties/p1');
  ok('storia «claim» accodata a quella vecchia', p1.ownerId === uid && p1.ownerIdHistory.length === 2 && p1.ownerIdHistory[1].reason === 'claim'
    && p1.ownerIdHistory[1].from === 'L1' && p1.ownerIdHistory[0].reason === 'innesto');
  ok('p9 (di un altro) intatto', JSON.stringify(h.DB.get('properties/p9')) === JSON.stringify(before['properties/p9']));
  const L = h.DB.get('landlords/' + uid);
  ok('landlords/<uid>: i buchi riempiti (iban, telefono, CF)', L.iban === 'IT60X0542811101000000123456' && L.phone === '+39 333 0000000' && L.codiceFiscale === 'RSSMRA80A01H501U');
  ok('...ciò che c\'era resta (nome, zone), e niente ruolo/date/alias copiati', L.name === 'Mario R. (già scritto)' && L.zones[0] === 'Prati'
    && !('role' in L) && !('createdAt' in L) && !('ownerAliases' in L));
  ok('le schede vecchie NON toccate', JSON.stringify(h.DB.get('users/L1')) === JSON.stringify(before['users/L1'])
    && JSON.stringify(h.DB.get('landlords/L2')) === JSON.stringify(before['landlords/L2']));
  const u = h.DB.get('users/' + uid);
  ok('gli alias vivono su users/<uid>.ownerAliases (un posto solo)', Array.isArray(u.ownerAliases) && u.ownerAliases.includes('L1') && u.ownerAliases.includes('L2'));
}

// ═══ 5b. Il claim chiede una prova FORTE (revisione del 23/09/2026) ═══════
// La scena della revisione (scratchpad poc_invite): un landlord qualsiasi si
// era dato nome ed email di Anna sulla PROPRIA scheda e aveva un lastLogin
// suo. L'invito di Anna lo prendeva per l'account di Anna e gli consegnava
// l'immobile di K_anna, l'IBAN e il telefono, e l'alias per leggere i suoi
// documenti. Ora il solo lastLogin non basta a riunire la scheda di un altro.
section('5b. claim solo con prova forte');
{
  const seed = {
    'landlords/K_anna': { name: 'Anna Rossi', email: 'anna@example.com', phone: '+39 333 1111111', iban: 'IT60X0542811101000000123456' },
    'properties/pA': { ownerId: 'K_anna', name: 'Via Anna 1', address: 'Via Anna 1, Roma' },
    'users/evil': { role: 'landlord', name: 'Anna Rossi', email: 'anna@example.com', lastLogin: '2026-09-20T10:00:00Z' },
  };
  const h = await boot({ seed, authEmails: ['anna@example.com'] });
  const snap = h.snapshot();
  const pv = await preview(h, { propertyIds: ['pA'] });
  const pA = pv.body.properties.find((p) => p.id === 'pA');
  ok('solo lastLogin: pA NON si riunisce — blocked claim_needs_proof, detto nel piano', pv.statusCode === 200 && pv.body.account.usersDocId === 'evil'
    && pA.action === 'blocked' && pA.reason === 'claim_needs_proof' && pA.currentOwnerKind === 'alias'
    && pv.body.consequences.includes('claim_needs_proof') && !pv.body.consequences.includes('alias_merge'));
  const r = await post(h, { op: 'invite', propertyIds: ['pA'], previewHash: pv.body.previewHash });
  ok('...l\'invito → 409 nothing_to_bind, zero scritture: ownerId, IBAN e alias restano dove sono', r.statusCode === 409 && r.body.error === 'nothing_to_bind'
    && writesOf(h, snap).length === 0 && h.DB.get('properties/pA').ownerId === 'K_anna' && !h.DB.get('landlords/evil') && !h.DB.get('users/evil').ownerAliases);

  // Con un immobile SENZA proprietario accanto: bind sì, claim no, e nessun
  // alias né buco riempito dalla scheda di Anna.
  const h2 = await boot({ seed: { ...seed, 'properties/pB': { ownerId: null, address: 'Via Libera 2', ownerEmail: 'anna@example.com' } }, authEmails: ['anna@example.com'] });
  const pv2 = await preview(h2, { propertyIds: ['pA', 'pB'], email: 'anna@example.com' });
  const r2 = await post(h2, { op: 'invite', propertyIds: ['pA', 'pB'], email: 'anna@example.com', previewHash: pv2.body.previewHash });
  ok('solo lastLogin + immobile libero: pB collegato (bind), pA bloccato, niente claim', r2.statusCode === 200 && r2.body.uid === 'evil'
    && r2.body.bound.includes('pB') && r2.body.claimed.length === 0 && r2.body.blocked.some((b) => b.id === 'pA' && b.reason === 'claim_needs_proof'));
  ok('...e né ownerAliases né landlords/<uid> riempito dalla scheda di Anna', h2.DB.get('properties/pA').ownerId === 'K_anna'
    && !h2.DB.get('users/evil').ownerAliases && !h2.DB.get('landlords/evil'));

  // Controllo positivo: con un invito già timbrato (campo che le regole
  // tolgono al titolare) la stessa scena riunisce, come prima.
  const h3 = await boot({ seed: { ...seed, 'users/evil': { ...seed['users/evil'], ownerInvitedAt: '2026-09-01T00:00:00Z' } }, authEmails: ['anna@example.com'] });
  const pv3 = await preview(h3, { propertyIds: ['pA'] });
  const r3 = await post(h3, { op: 'invite', propertyIds: ['pA'], previewHash: pv3.body.previewHash });
  ok('controllo positivo: prova forte (ownerInvitedAt) → claim, alias scritto', pv3.body.properties[0].action === 'claim' && r3.statusCode === 200
    && r3.body.claimed.some((c) => c.id === 'pA') && (h3.DB.get('users/evil').ownerAliases || []).includes('K_anna'));

  const { strongAccountProof } = INV;
  ok('strongAccountProof: account nuovo / segno / authUid uguale / invito / primo accesso sì',
    strongAccountProof({ uid: null }) && strongAccountProof({ uid: 'X', viaMarker: true })
    && strongAccountProof({ uid: 'X', usersDoc: { authUid: 'X' } }) && strongAccountProof({ uid: 'X', usersDoc: { ownerInvitedAt: 't' } })
    && strongAccountProof({ uid: 'X', usersDoc: { ownerPortalFirstAt: 't' } }));
  ok('strongAccountProof: il solo lastLogin, un authUid diverso o la scheda nuda NO',
    !strongAccountProof({ uid: 'X', usersDoc: { lastLogin: 't', email: 'a@b.it' } }) && !strongAccountProof({ uid: 'X', usersDoc: { authUid: 'Y' } })
    && !strongAccountProof({ uid: 'X', usersDoc: null }));
}

// ═══ 5c. La conferma dell'admin: l'uscita del proprietario VERO ═══════════
// Gli account landlord creati dal portal portano solo lastLogin (nessuno
// scrive loro authUid): dopo 5b un proprietario vero con gli immobili sotto
// una vecchia scheda landlords/<K> restava bloccato per sempre (409
// nothing_to_bind senza uscita). Ora l'admin può DICHIARARE che l'account è
// suo: confirmAccount:true, mai dedotto, nell'hash, scritto nel commit.
section('5c. confirmAccount: la conferma esplicita dell\'admin');
{
  const seed = {
    'landlords/K_paola': { name: 'Paola Bianchi', email: 'paola@x.it', phone: '+39 333 2222222', iban: 'IT60X0542811101000000123456' },
    'properties/pP': { ownerId: 'K_paola', name: 'Via Paola 1', address: 'Via Paola 1, Roma' },
    'users/Lp': { role: 'landlord', name: 'Paola Bianchi', email: 'paola@x.it', lastLogin: '2026-09-10T08:00:00Z' },
  };
  const commits = (h) => {
    const inner = globalThis.fetch, seen = [];
    globalThis.fetch = (u, o) => { if (String(u).includes(':commit')) { try { seen.push(JSON.parse(o.body)); } catch { seen.push(null); } } return inner(u, o); };
    return { seen, off: () => { globalThis.fetch = inner; } };
  };
  const h = await boot({ seed, authEmails: ['paola@x.it'] });
  const snap = h.snapshot();
  const pv0 = await preview(h, { propertyIds: ['pP'] });
  const p0 = pv0.body.properties[0];
  ok('senza spunta: account weak, non confermato, pP blocked claim_needs_proof (la scena della revisione resta chiusa)', pv0.statusCode === 200
    && pv0.body.account.usersDocId === 'Lp' && pv0.body.account.proof === 'weak' && pv0.body.account.confirmed === false
    && p0.action === 'blocked' && p0.reason === 'claim_needs_proof' && pv0.body.accountConfirmation === null
    && !pv0.body.consequences.includes('account_confirmed'));
  const r0 = await post(h, { op: 'invite', propertyIds: ['pP'], previewHash: pv0.body.previewHash });
  ok('senza spunta l\'invito → 409 nothing_to_bind, zero scritture', r0.statusCode === 409 && r0.body.error === 'nothing_to_bind' && writesOf(h, snap).length === 0);

  const pv1 = await preview(h, { propertyIds: ['pP'], confirmAccount: true });
  const p1 = pv1.body.properties[0];
  ok('con la spunta: pP si riunisce (claim), account confermato', pv1.statusCode === 200 && p1.action === 'claim' && p1.reason === null
    && pv1.body.account.proof === 'weak' && pv1.body.account.confirmed === true);
  ok('il piano ELENCA la conseguenza coi nomi (account e email) — per prima', pv1.body.consequences[0] === 'account_confirmed'
    && pv1.body.consequences.includes('alias_merge') && pv1.body.accountConfirmation
    && pv1.body.accountConfirmation.usersDocId === 'Lp' && pv1.body.accountConfirmation.email === 'paola@x.it');
  ok('l\'hash del piano confermato è un altro, e il piano non scrive niente', pv1.body.previewHash !== pv0.body.previewHash && writesOf(h, snap).length === 0);

  const s1 = await post(h, { op: 'invite', propertyIds: ['pP'], previewHash: pv0.body.previewHash, confirmAccount: true });
  const s2 = await post(h, { op: 'invite', propertyIds: ['pP'], previewHash: pv1.body.previewHash });
  ok('hash senza spunta + invito con spunta → 409 plan_changed (col piano confermato)', s1.statusCode === 409 && s1.body.error === 'plan_changed'
    && s1.body.preview.previewHash === pv1.body.previewHash);
  ok('hash con spunta + invito senza spunta → 409 plan_changed (col piano NON confermato)', s2.statusCode === 409
    && s2.body.error === 'plan_changed' && s2.body.preview.previewHash === pv0.body.previewHash);
  ok('...nessuna delle due ha scritto', writesOf(h, snap).length === 0);

  const cap = commits(h);
  let r;
  try { r = await post(h, { op: 'invite', propertyIds: ['pP'], previewHash: pv1.body.previewHash, confirmAccount: true }); }
  finally { cap.off(); }
  ok('con spunta e SUO hash → 200: pP riunito, niente account nuovo', r.statusCode === 200 && r.body.uid === 'Lp' && r.body.createdAuth === false
    && r.body.claimed.some((c) => c.id === 'pP' && c.from === 'K_paola') && r.body.accountConfirmed === true && h.signUps.length === 0);
  const u = h.DB.get('users/Lp');
  ok('users/Lp: authUid = Lp, accountConfirmedAt, accountConfirmedBy = admin', u.authUid === 'Lp' && typeof u.accountConfirmedAt === 'string'
    && u.accountConfirmedBy === 'adm' && (u.ownerAliases || []).includes('K_paola'));
  ok('pP ora di Lp con la storia claim; landlords/Lp riempito dalla vecchia scheda', h.DB.get('properties/pP').ownerId === 'Lp'
    && h.DB.get('properties/pP').ownerIdHistory.slice(-1)[0].reason === 'claim' && h.DB.get('landlords/Lp').iban === 'IT60X0542811101000000123456');
  const fieldsOf = (w) => (w && w.update && w.update.fields) || {};
  const pathOf = (w) => String((w && w.update && w.update.name) || '').split('/documents/').pop();
  const both = cap.seen.filter((b) => b && (b.writes || []).some((w) => pathOf(w) === 'users/Lp' && fieldsOf(w).authUid && fieldsOf(w).accountConfirmedAt && fieldsOf(w).accountConfirmedBy)
    && (b.writes || []).some((w) => pathOf(w) === 'properties/pP'));
  ok('la conferma e gli immobili nello STESSO commit atomico (con precondizioni)', cap.seen.length === 1 && both.length === 1
    && both[0].writes.every((w) => w.currentDocument));
  const act = [...h.DB.keys()].filter((k) => k.startsWith('activityLog/')).map((k) => h.DB.get(k)).find((a) => a.action === 'owner_invited');
  ok('registro attività: owner_invited con accountConfirmed e chi l\'ha data', !!act && act.details.accountConfirmed === true
    && act.details.accountConfirmedBy === 'adm' && typeof act.details.accountConfirmedAt === 'string' && act.actor === 'adm');
  const pv2 = await preview(h, { propertyIds: ['pP'] });
  ok('dopo: l\'account è FORTE da solo (authUid), pP già suo, nessuna spunta offerta', pv2.body.account.proof === 'strong'
    && pv2.body.account.confirmed === false && pv2.body.properties[0].action === 'keep');
}
{
  // L'attacco della revisione resta chiuso: la spunta non la dà un landlord
  // (la porta è solo admin), e senza spunta il claim resta bloccato (5b).
  const h = await boot({ seed: {
    'landlords/K_anna': { name: 'Anna Rossi', email: 'anna@example.com' },
    'properties/pA': { ownerId: 'K_anna', address: 'Via Anna 1' },
    'users/evil': { role: 'landlord', name: 'Anna Rossi', email: 'anna@example.com', lastLogin: '2026-09-20T10:00:00Z' },
  }, authEmails: ['anna@example.com'] });
  const snap = h.snapshot();
  const r = await post(h, { op: 'preview', propertyIds: ['pA'], confirmAccount: true }, 'evil');
  const r2 = await post(h, { op: 'invite', propertyIds: ['pA'], confirmAccount: true, previewHash: 'a'.repeat(64) }, 'evil');
  ok('un landlord con confirmAccount → 403, zero scritture', r.statusCode === 403 && r2.statusCode === 403 && writesOf(h, snap).length === 0);
  const r3 = await preview(h, { propertyIds: ['pA'], confirmAccount: 'true' });
  const r4 = await preview(h, { propertyIds: ['pA'], confirmAccount: 1 });
  ok('confirmAccount non booleano → 400 bad_request (mai «truthy»)', r3.statusCode === 400 && r3.body.error === 'bad_request' && r4.statusCode === 400);
}
{
  // Il caso che l'hash deve prendere da solo: gli immobili fanno la STESSA
  // cosa con e senza spunta (uno libero, bind) e la conferma cambia solo
  // gli alias da riunire e i timbri. Senza la conferma nell'hash, un piano
  // visto SENZA spunta potrebbe eseguire una conferma mai mostrata.
  const h = await boot({ seed: {
    'landlords/K_old': { name: 'Paola (CRM)', email: 'paola@x.it', iban: 'IT60X0542811101000000123456' },
    'properties/pB': { ownerId: null, address: 'Via Libera 2', ownerEmail: 'paola@x.it' },
    'users/Lp': { role: 'landlord', name: 'Paola Bianchi', email: 'paola@x.it', lastLogin: '2026-09-10T08:00:00Z' },
  }, authEmails: ['paola@x.it'] });
  const snap = h.snapshot();
  const a = await preview(h, { propertyIds: ['pB'] });
  const b = await preview(h, { propertyIds: ['pB'], confirmAccount: true });
  ok('stessi immobili (pB bind) con e senza spunta, ma alias_merge solo con la conferma', a.body.properties[0].action === 'bind' && b.body.properties[0].action === 'bind'
    && a.body.consequences.includes('claim_needs_proof') && b.body.consequences.includes('alias_merge') && b.body.consequences.includes('account_confirmed'));
  ok('...e gli hash sono diversi', a.body.previewHash !== b.body.previewHash);
  const r = await post(h, { op: 'invite', propertyIds: ['pB'], previewHash: a.body.previewHash, confirmAccount: true });
  ok('piano visto SENZA spunta + invito CON spunta → 409 plan_changed, zero scritture (niente authUid, niente alias)', r.statusCode === 409
    && r.body.error === 'plan_changed' && writesOf(h, snap).length === 0 && !h.DB.get('users/Lp').authUid && !h.DB.get('users/Lp').ownerAliases);
  const ok2 = await post(h, { op: 'invite', propertyIds: ['pB'], previewHash: a.body.previewHash });
  ok('lo stesso piano senza spunta si esegue com\'era: bind, nessun timbro di conferma', ok2.statusCode === 200 && ok2.body.bound.includes('pB')
    && ok2.body.accountConfirmed === false && !h.DB.get('users/Lp').authUid && !h.DB.get('users/Lp').accountConfirmedAt);
}
{
  // La spunta dove non serve: account nuovo o già forte → non si applica,
  // l'hash è quello di sempre, nessun timbro di conferma.
  const h = await boot({ seed: { 'properties/pN': { ownerId: null, address: 'Via Nuova 3', ownerEmail: 'nuovo@x.it' } } });
  const a = await preview(h, { propertyIds: ['pN'] });
  const b = await preview(h, { propertyIds: ['pN'], confirmAccount: true });
  ok('account nuovo: la spunta non si applica (proof null, confirmed false, stesso hash)', b.body.account.proof === null && b.body.account.confirmed === false
    && a.body.previewHash === b.body.previewHash && !b.body.consequences.includes('account_confirmed'));
  const r = await post(h, { op: 'invite', propertyIds: ['pN'], previewHash: b.body.previewHash, confirmAccount: true });
  ok('...e l\'invito non timbra alcuna conferma', r.statusCode === 200 && r.body.accountConfirmed === false && !h.DB.get('users/' + r.body.uid).accountConfirmedAt);
  const h2 = await boot({ seed: {
    'properties/pS': { ownerId: 'Ls', address: 'Via Forte 4' },
    'users/Ls': { role: 'landlord', email: 'forte@x.it', lastLogin: 't', authUid: 'OTHER_UID' },
  }, authEmails: ['forte@x.it'] });
  const m = await preview(h2, { propertyIds: ['pS'], confirmAccount: true });
  ok('una scheda con authUid DIVERSO dal suo id (mismatch) non si conferma mai', m.body.account.proof === 'mismatch' && m.body.account.confirmed === false);
  const { planHash, accountProof } = INV;
  const base = { email: 'e@x.it', usersDocId: 'u', usersRole: 'landlord', props: [{ id: 'a', currentOwnerId: null, action: 'bind' }] };
  ok('planHash: senza conferma identico a prima (anteprime aperte restano valide), con conferma diverso',
    planHash(base) === planHash({ ...base, accountConfirmed: false }) && planHash(base) !== planHash({ ...base, accountConfirmed: true }));
  ok('accountProof: null / strong / weak / mismatch', accountProof({ uid: null }) === null && accountProof({ uid: 'X', viaMarker: true }) === 'strong'
    && accountProof({ uid: 'X', usersDoc: { lastLogin: 't' } }) === 'weak' && accountProof({ uid: 'X', usersDoc: { lastLogin: 't', authUid: 'Y' } }) === 'mismatch'
    && accountProof({ uid: 'X', usersDoc: { authUid: 'X' } }) === 'strong');
}

// ═══ 6. Conflitti: zero scritture, zero account ════════════════════════════
section('6. conflitti');
{
  const h = await boot({ seed: {
    'properties/p1': { ownerId: null, address: 'Via A 1', ownerEmail: 'giulia@x.it' },
    'users/T1': { role: 'tenant', name: 'Giulia', email: 'giulia@x.it' },
  } });
  const snap = h.snapshot();
  const pv = await preview(h, { propertyIds: ['p1'] });
  ok('email di un inquilino → conflict role_conflict nel piano', pv.body.conflict && pv.body.conflict.error === 'role_conflict' && pv.body.conflict.role === 'tenant');
  const r = await post(h, { op: 'invite', propertyIds: ['p1'], previewHash: pv.body.previewHash });
  ok('invite → 409 role_conflict, zero scritture, zero signUp', r.statusCode === 409 && r.body.error === 'role_conflict'
    && writesOf(h, snap).length === 0 && signUpCalls(h) === 0 && mails().length === 0);
}
{
  // Account Auth esistente, scheda landlord SENZA prova (portal: creato e mai entrato).
  const h = await boot({ authEmails: ['sara@x.it'], seed: {
    'properties/p1': { ownerId: 'S1', address: 'Via A 1' },
    'users/S1': { role: 'landlord', name: 'Sara', email: 'sara@x.it' },
  } });
  const snap = h.snapshot();
  const pv = await preview(h, { propertyIds: ['p1'] });
  ok('Auth sì, prova no, segno no → conflict auth_without_profile', pv.body.account.state === 'exists' && pv.body.conflict && pv.body.conflict.error === 'auth_without_profile');
  const r = await post(h, { op: 'invite', propertyIds: ['p1'], previewHash: pv.body.previewHash });
  ok('invite → 409 auth_without_profile, zero scritture, zero signUp', r.statusCode === 409 && r.body.error === 'auth_without_profile'
    && writesOf(h, snap).length === 0 && signUpCalls(h) === 0);
  // La prova arriva (lastLogin scritto dal SUO browser): ora S1 è l'account.
  h.DB.get('users/S1').lastLogin = '2026-09-01T09:00:00Z';
  const pv2 = await preview(h, { propertyIds: ['p1'] });
  const r2 = await post(h, { op: 'invite', propertyIds: ['p1'], previewHash: pv2.body.previewHash });
  ok('con la prova: uid = S1, p1 già suo (keep), nessun signUp, invito timbrato', r2.statusCode === 200 && r2.body.uid === 'S1'
    && r2.body.kept.includes('p1') && signUpCalls(h) === 0 && !!h.DB.get('users/S1').ownerInvitedAt);
}
{
  const h = await boot({ seed: {
    'properties/p1': { ownerId: null, address: 'Via A 1', ownerEmail: 'doppio@x.it' },
    'users/D1': { role: 'landlord', email: 'doppio@x.it', ownerInvitedAt: '2026-01-01' },
    'users/D2': { role: 'landlord', email: 'doppio@x.it', lastLogin: '2026-02-01' },
  }, authEmails: ['doppio@x.it'] });
  const pv = await preview(h, { propertyIds: ['p1'] });
  ok('due schede provate con la stessa email → ambiguous_profiles', pv.body.conflict && pv.body.conflict.error === 'ambiguous_profiles' && pv.body.conflict.count === 2);
}

// ═══ 7. La gara: 409 e nessun collegamento a metà; il recupero dal segno ═══
section('7. gara e recupero');
{
  const h = await boot({ seed: {
    'properties/p1': { ownerId: null, address: 'Via A 1', ownerEmail: 'gara@x.it' },
    'properties/p2': { ownerId: null, address: 'Via A 2' },
  } });
  const pv = await preview(h, { propertyIds: ['p1', 'p2'] });
  const inner = globalThis.fetch;
  let raced = false;
  globalThis.fetch = async (u, o) => {
    if (!raced && String(u).includes(':commit')) { raced = true; h.VERSIONS.set('properties/p2', 'toccato-da-un-altro'); }
    return inner(u, o);
  };
  const r = await post(h, { op: 'invite', propertyIds: ['p1', 'p2'], previewHash: pv.body.previewHash });
  globalThis.fetch = inner;
  ok('precondizione fallita → 409 plan_changed', raced && r.statusCode === 409 && r.body.error === 'plan_changed');
  ok('NESSUN collegamento a metà: né p1 né p2, né la scheda users', !h.DB.get('properties/p1').ownerId && !h.DB.get('properties/p2').ownerId
    && ![...h.DB.keys()].some((k) => k.startsWith('users/uid_new_')) && mails().length === 0);
  ok('ma l\'account creato ha lasciato il segno (prima del commit)', h.signUps.length === 1
    && [...h.DB.keys()].some((k) => k.startsWith('heartbeat/owner-invite-') && h.DB.get(k).uid === h.signUps[0].localId));
  const pv2 = await preview(h, { propertyIds: ['p1', 'p2'] });
  ok('riprova: Auth esiste, nessuna scheda, il segno ritrova l\'uid', pv2.body.account.state === 'exists' && pv2.body.account.usersDocId === h.signUps[0].localId && !pv2.body.conflict);
  const r2 = await post(h, { op: 'invite', propertyIds: ['p1', 'p2'], previewHash: pv2.body.previewHash });
  ok('...e l\'invito si completa SENZA un secondo account', r2.statusCode === 200 && r2.body.uid === h.signUps[0].localId && h.signUps.length === 1
    && h.DB.get('properties/p1').ownerId === r2.body.uid && h.DB.get('properties/p2').ownerId === r2.body.uid && r2.body.usersDoc === 'created');
  ok('il corpo non accetta un uid scelto a mano (niente recoverUid)', !read('api/owner/invite.js').includes('recoverUid'));
}

// ═══ 8. Le regole pure ════════════════════════════════════════════════════
section('8. regole pure');
{
  const { provenAccount, planHash, gapFill, ownerArchiveOpen, ownerArchiveUrl, whatsappText, markerId } = INV;
  ok('provenAccount: una scheda nuda NON è una prova', !provenAccount({ id: 'X', role: 'landlord', email: 'a@b.it' }));
  ok('provenAccount: authUid uguale / invito / primo accesso / lastLogin sì', provenAccount({ id: 'X', authUid: 'X' })
    && provenAccount({ id: 'X', ownerInvitedAt: 't' }) && provenAccount({ id: 'X', ownerPortalFirstAt: 't' }) && provenAccount({ id: 'X', lastLogin: 't' })
    && !provenAccount({ id: 'X', authUid: 'Y' }));
  const a = planHash({ email: 'e@x.it', usersDocId: 'u', usersRole: 'landlord', props: [{ id: 'b', currentOwnerId: null, action: 'bind' }, { id: 'a', currentOwnerId: 'K', action: 'claim' }] });
  const b = planHash({ email: 'e@x.it', usersDocId: 'u', usersRole: 'landlord', props: [{ id: 'a', currentOwnerId: 'K', action: 'claim' }, { id: 'b', currentOwnerId: null, action: 'bind' }] });
  const c = planHash({ email: 'e@x.it', usersDocId: 'u', usersRole: 'landlord', props: [{ id: 'a', currentOwnerId: 'K', action: 'blocked' }, { id: 'b', currentOwnerId: null, action: 'bind' }] });
  ok('planHash: stabile sull\'ordine, cambia se cambia un\'azione', a === b && a !== c);
  ok('gapFill: solo i buchi, mai ruolo/date/alias', JSON.stringify(gapFill({ name: 'A', iban: '' }, [{ name: 'B', iban: 'IT1', role: 'landlord', createdAt: 'x', ownerAliases: ['z'], lastLogin: 't' }])) === '{"iban":"IT1"}');
  ok('ownerArchiveOpen: invitato o entrato, e landlord', ownerArchiveOpen({ role: 'landlord', ownerInvitedAt: 't' }) && ownerArchiveOpen({ role: 'landlord', ownerPortalFirstAt: 't' })
    && !ownerArchiveOpen({ role: 'landlord' }) && !ownerArchiveOpen({ role: 'tenant', ownerInvitedAt: 't' }) && !ownerArchiveOpen(null));
  ok('ownerArchiveUrl: www, frammento', ownerArchiveUrl('c=ctr1') === 'https://www.boomrome.com/proprietario#c=ctr1');
  ok('whatsappText: link senza email', !whatsappText('Anna').includes('#e=') && whatsappText('Anna').includes('primo=1'));
  // Revisione 23/09/2026: il testo diceva «inserisca la sua email e scelga una
  // password» su una pagina che accetta solo una password ESISTENTE («Email o
  // password non corrette»). Ora nomina il bottone VERO di /login, parola per
  // parola, e dice che la password si sceglie dall'email che arriva.
  const primoBtn = (/<button[^>]*id="primoBtn"[^>]*>([^<]+)<\/button>/.exec(read('login.html')) || [])[1] || '';
  const wa = whatsappText('Anna');
  ok('whatsappText: tocchi il bottone vero di /login e scelga la password dall\'email', !!primoBtn && wa.includes('tocchi “' + primoBtn + '”')
    && wa.includes('scelga la password dall\'email che le arriva') && !/inserisca la sua email e scelga una password/.test(wa));
  ok('markerId: minuscolo e 24 esadecimali', markerId('A@X.it') === markerId('a@x.it') && /^owner-invite-[0-9a-f]{24}$/.test(markerId('a@x.it')));
}

// ═══ 9. /login: il primo accesso ══════════════════════════════════════════
section('9. /login');
{
  const s = read('login.html');
  ok('UN solo <form> (/login resta l\'unica superficie di accesso)', (s.match(/<form\b/g) || []).length === 1);
  ok('reset con ritorno a /proprietario', /sendPasswordResetEmail\(email,\{url:'https:\/\/www\.boomrome\.com\/proprietario'\}\)/.test(s));
  ok('ripiego senza ritorno su unauthorized/invalid-continue-uri', /auth\/unauthorized-continue-uri/.test(s) && /auth\/invalid-continue-uri/.test(s) && /sendPasswordResetEmail\(email\)\)/.test(s));
  const msgs = (s.match(/Se l’email è registrata ti abbiamo scritto: apri il link, scegli la password, poi torna qui\./g) || []).length;
  ok('UN messaggio per ogni esito (dichiarato una volta, mostrato sempre)', msgs === 1 && /showMessage\(RESET_MSG,'success'\)/.test(s)
    && (s.match(/showMessage\(RESET_MSG/g) || []).length === 1);
  ok('primo=1 apre il pannello; l\'email solo dal FRAMMENTO', /get\('primo'\)==='1'/.test(s) && /location\.hash/.test(s) && !/searchParams[^\n]*get\('e'\)/.test(s)
    && !/URLSearchParams\(location\.search\)\.get\('e'\)/.test(s));
  ok('modalità proprietario: titolo e porta verso /owners', s.includes("NEXT_DEST.startsWith('/proprietario')") && s.includes('Il tuo archivio BOOM')
    && s.includes('Non sei ancora proprietario BOOM?') && s.includes('href="/owners"'));
  ok('senza next: il landlord va a /proprietario (e il next esplicito vince)', /if\(HAS_NEXT\|\|!u\) return NEXT_DEST;/.test(s)
    && /stringValue==='landlord'\) return '\/proprietario'/.test(s) && !/window\.location\.href=NEXT_DEST; \}\);\s*\n/.test(s.split('function go(')[0].slice(-400)));
}

// ═══ 10. Le email esistenti: bottone solo all'invitato, mai il token ══════
section('10. benvenuto, rendiconto, verbale');
{
  const bucket = 'boom-property-dashboards.firebasestorage.app';
  const tokUrl = (p) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(p)}?alt=media&token=dltok`;
  const seedW = (invited) => ({
    'properties/p1': { ownerId: 'L1', address: 'Via Cavour 12' },
    'users/L1': { role: 'landlord', name: 'Mario Rossi', email: 'mario@x.it', ...(invited ? { ownerInvitedAt: '2026-09-01T10:00:00Z' } : {}) },
  });
  const files = { 'contracts/ctr1/signing-certificate.pdf': { bytes: '%PDF-1.4 cert', token: 'dltok' } };
  const contract = { id: 'ctr1', propertyId: 'p1', tenantName: 'Julie', tenantEmail: 'julie@x.fr', signingCertificateUrl: tokUrl('contracts/ctr1/signing-certificate.pdf') };
  const { sendWelcomeEmails } = await import('../../api/sign/_notify.js');

  let h = await boot({ seed: seedW(false), files });
  await sendWelcomeEmails({ ...contract }, null, { cedolare: true });
  let lm = mailTo('mario@x.it')[0];
  ok('benvenuto al locatore NON invitato: niente bottone, la riga, niente link al certificato', !!lm && !lm.html.includes('/proprietario')
    && !lm.html.includes('/portal') && /lo attiviamo noi/.test(lm.html) && !/token=|firebasestorage/.test(lm.html));
  ok('...il certificato resta IN ALLEGATO', (lm.attachments || []).some((a) => a.filename === 'BOOM_Certificato_di_firma.pdf'));
  const tm = mailTo('julie@x.fr')[0];
  ok('il benvenuto del conduttore è invariato (link al certificato ancora lì)', !!tm && /Signing certificate/.test(tm.html));

  h = await boot({ seed: seedW(true), files });
  await sendWelcomeEmails({ ...contract }, null, { cedolare: true });
  lm = mailTo('mario@x.it')[0];
  ok('benvenuto al locatore INVITATO: bottone a /proprietario#c=ctr1, niente token', !!lm && lm.html.includes('https://www.boomrome.com/proprietario#c=ctr1')
    && /APRI IL SUO ARCHIVIO/.test(lm.html) && !/token=|firebasestorage/.test(lm.html));
  void h;

  const notifySrc = read('api/sign/_notify.js');
  const landlordBlock = notifySrc.slice(notifySrc.indexOf('if (g.landlordEmail) {', notifySrc.indexOf('export async function sendWelcomeEmails')), notifySrc.indexOf('// ── IL FASCICOLO COMPLETO'));
  ok('sorgente benvenuto: nel blocco locatore niente certHref e niente /portal, la regola unica', !landlordBlock.includes('certHref')
    && !landlordBlock.includes("'/portal'") && landlordBlock.includes('ownerArchiveOpen(g.landlordU)'));
  const verbSrc = read('api/contracts/verbale.js');
  const vBlock = verbSrc.slice(verbSrc.indexOf('// Locatore — IT'), verbSrc.indexOf('// Admin — copia'));
  ok('sorgente verbale: il locatore senza btn(url…), con la regola unica verso #c=', !vBlock.includes('btn(url') && vBlock.includes('ownerArchiveOpen(landlordU)') && vBlock.includes("'c=' + encodeURIComponent"));
  const rSrc = read('api/owners/rendiconto.js');
  ok('sorgente rendiconto: niente btn(url…), bottone verso #r= con la regola unica', !rSrc.includes('btn(url') && rSrc.includes("ownerArchiveUrl('r=' + month)") && rSrc.includes('ownerArchiveOpen(u)'));
}

// ═══ 11. Il portal: dossier e script ══════════════════════════════════════
section('11. portal');
{
  const portal = read('portal.html');
  ok('portal.html carica owner-invite-ui.js (defer), una volta', (portal.match(/<script defer src="\/js\/owner-invite-ui\.js"><\/script>/g) || []).length === 1);
  const dos = read('js/property-dossier.js');
  ok('dossier: «Invita il proprietario» nella sezione Strumenti', /section\('Strumenti',[^\n]*button\('Invita il proprietario','owner-invite',p\.id\)/.test(dos));
  ok('dossier: «Vista proprietario ↗» solo con ownerId, verso /proprietario?as=', /p\.ownerId\?`<a class="pdos-button" href="\/proprietario\?as=\$\{encodeURIComponent\(p\.ownerId\)\}"/.test(dos));
  ok('dossier: il ramo di dispatch apre BOOM_OWNER_INVITE', dos.includes("else if(kind==='owner-invite' && m.property.id===id) root.BOOM_OWNER_INVITE?.open(id);"));
  const ui = read('js/owner-invite-ui.js');
  ok('UI: token da firebase.auth().currentUser.getIdToken(), solo /api/owner/invite', /fb\.auth\(\)\.currentUser/.test(ui) && /getIdToken\(\)/.test(ui)
    && (ui.match(/fetch\(/g) || []).length === 1 && ui.includes("ENDPOINT = '/api/owner/invite'"));
  ok('UI: niente Firestore dal browser, niente innerHTML senza esc sui dati del server', !/\.collection\(|firestore\(\)/.test(ui) && /esc\(r\.whatsappText\)/.test(ui) && /esc\(p\.label \|\| p\.id\)/.test(ui));
  ok('UI: bottone d\'invio spento su un conflitto', /canSend = !!\(p && p\.previewHash && !p\.conflict/.test(ui));
  ok('UI: claim_needs_proof spiegato (conseguenza e riga dell\'immobile), non come «di un altro proprietario»', /claim_needs_proof: '[^']*NON si riuniscono/.test(ui)
    && /p\.reason === 'claim_needs_proof' \? [^\n]*non si riunisce senza un account provato/.test(ui));
}

// ═══ 12. Nel browser vero: /login proprietario e la finestra d'invito ══════
// Se manca Chromium la sezione lo DICE e si ferma qui (mai «SKIP:», che
// marcherebbe saltata l'intera suite).
section('12. nel browser');
{
  if (current) { current(); current = null; }
  const { loadChromium, launchOptions } = await import('../_browser.mjs');
  const chromium = await loadChromium();
  if (!chromium) console.log('  nota: Chromium assente — verifiche nel browser non eseguite');
  else {
    const browser = await chromium.launch(launchOptions());
    const BASEU = 'https://boom.test';
    // Firebase finto: auth() con reset registrato; «unauth» rifiuta il ritorno.
    const fbStub = (mode) => `(function(){var calls=window.__resetCalls=[];
      var signed=${JSON.stringify(mode)}.indexOf('signed-')===0;
      function auth(){return {setPersistence:function(){return Promise.resolve();},
        onAuthStateChanged:function(cb){if(signed)setTimeout(function(){cb({uid:'L1',getIdToken:function(){return Promise.resolve('IDTOK');}});},10);},
        sendPasswordResetEmail:function(e,st){calls.push({e:e,url:st&&st.url||null});
          if(${JSON.stringify(mode)}==='unauth'&&st)return Promise.reject({code:'auth/unauthorized-continue-uri'});
          if(${JSON.stringify(mode)}==='nouser')return Promise.reject({code:'auth/user-not-found'});return Promise.resolve();},
        signInWithEmailAndPassword:function(){return Promise.reject({code:'auth/wrong-password'});},currentUser:null};}
      auth.Auth={Persistence:{LOCAL:'local',SESSION:'session'}};
      window.firebase={initializeApp:function(){},auth:auth};})();`;
    const loginPage = async (mode, url) => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
      const navs = []; page.__navs = navs;
      await page.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith(BASEU + '/login')) return route.fulfill({ contentType: 'text/html', body: read('login.html') });
        if (u.includes('firebase-app-compat.js')) return route.fulfill({ contentType: 'text/javascript', body: fbStub(mode) });
        if (u.includes('firebase-auth-compat.js') || u.endsWith('/js/boom-err.js')) return route.fulfill({ contentType: 'text/javascript', body: '' });
        if (u.startsWith('https://firestore.googleapis.com/')) {
          navs.push('fs:' + u + '|' + (route.request().headers().authorization || ''));
          const role = mode === 'signed-landlord' ? 'landlord' : 'tenant';
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'x', fields: { role: { stringValue: role } } }) });
        }
        if (route.request().isNavigationRequest()) navs.push(u);
        return route.abort();
      });
      await page.goto(BASEU + url, { waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('primoBox') && !document.getElementById('primoBox').hidden, null, { timeout: 5000 }).catch(() => {});
      return { page, errors, navs };
    };
    const landedOn = async (mode, url) => {
      const { page, navs } = await loginPage(mode, url);
      for (let i = 0; i < 50 && !navs.some((n) => !n.startsWith('fs:') && !n.includes('/login')); i++) await new Promise((r) => setTimeout(r, 50));
      await page.close();
      return navs;
    };
    try {
      const { page, errors } = await loginPage('ok', '/login?next=%2Fproprietario&primo=1#e=anna%40x.it');
      const st = await page.evaluate(() => ({ title: document.querySelector('.a-title').textContent, open: document.getElementById('primoBox').open,
        door: !document.getElementById('ownersDoor').hidden, email: document.getElementById('email').value, hash: location.hash, forms: document.forms.length }));
      ok('browser: modalità proprietario (titolo, pannello aperto da primo=1, porta /owners)', st.title === 'Il tuo archivio BOOM' && st.open && st.door && st.forms === 1);
      ok('browser: l\'email dal frammento precompila il campo, poi il frammento sparisce', st.email === 'anna@x.it' && st.hash === '');
      await page.click('#primoBtn');
      await page.waitForFunction(() => document.getElementById('message').classList.contains('show'), null, { timeout: 5000 });
      const r1 = await page.evaluate(() => ({ calls: window.__resetCalls, msg: document.getElementById('message').textContent }));
      ok('browser: reset con ritorno a /proprietario, messaggio unico', r1.calls.length === 1 && r1.calls[0].url === 'https://www.boomrome.com/proprietario'
        && /Se l’email è registrata ti abbiamo scritto/.test(r1.msg));
      ok('browser: zero errori JS', errors.length === 0);
      await page.close();

      const u = await loginPage('unauth', '/login?next=%2Fproprietario');
      const st2 = await u.page.evaluate(() => ({ open: document.getElementById('primoBox').open }));
      await u.page.fill('#email', 'anna@x.it');
      await u.page.evaluate(() => { document.getElementById('primoBox').open = true; });
      await u.page.click('#primoBtn');
      await u.page.waitForFunction(() => document.getElementById('message').classList.contains('show'), null, { timeout: 5000 });
      const r2 = await u.page.evaluate(() => ({ calls: window.__resetCalls, msg: document.getElementById('message').textContent }));
      ok('browser: senza primo=1 il pannello resta chiuso', st2.open === false);
      ok('browser: ritorno non autorizzato → si rimanda SENZA ritorno, stesso messaggio', r2.calls.length === 2 && r2.calls[0].url && r2.calls[1].url === null
        && r2.msg === r1.msg);
      await u.page.close();

      const n = await loginPage('nouser', '/login?next=%2Fproprietario&primo=1');
      await n.page.fill('#email', 'nessuno@x.it');
      await n.page.click('#primoBtn');
      await n.page.waitForFunction(() => document.getElementById('message').classList.contains('show'), null, { timeout: 5000 });
      const r3 = await n.page.evaluate(() => document.getElementById('message').textContent);
      ok('browser: email senza account → STESSO messaggio (niente enumerazione)', r3 === r1.msg);
      await n.page.close();

      const plain = await loginPage('ok', '/login?next=%2Fportal');
      const st3 = await plain.page.evaluate(() => ({ box: document.getElementById('primoBox').hidden, door: document.getElementById('ownersDoor').hidden, title: document.querySelector('.a-title').textContent }));
      ok('browser: fuori da /proprietario la pagina è quella di sempre', st3.box && st3.door && st3.title === 'Sign in' && plain.errors.length === 0);
      await plain.page.close();

      // Dopo l'accesso: senza next il landlord va al suo archivio; il next vince.
      const n1 = await landedOn('signed-landlord', '/login');
      ok('browser: landlord senza next → /proprietario (ruolo letto col SUO token, solo il campo role)', n1.includes(BASEU + '/proprietario')
        && n1.some((x) => x.startsWith('fs:') && x.includes('/users/L1?mask.fieldPaths=role') && x.endsWith('|Bearer IDTOK')));
      const n2 = await landedOn('signed-tenant', '/login');
      ok('browser: altri ruoli senza next → /portal come sempre', n2.includes(BASEU + '/portal'));
      const n3 = await landedOn('signed-landlord', '/login?next=%2Fportal');   // (il frammento non viaggia nella richiesta)
      ok('browser: con un next esplicito vince lui (nessuna lettura del ruolo)', n3.includes(BASEU + '/portal') && !n3.some((x) => x.startsWith('fs:')));

      // La finestra d'invito, sul modulo vero, con /api/owner/invite finto.
      const ui = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errs = []; ui.on('pageerror', (e) => errs.push(String(e)));
      const posted = [];
      let mode = 'ok';
      const PV = (conflict) => ({ ok: true, op: 'preview', owner: { email: 'anna@x.it', emailSource: 'property.ownerEmail', name: 'Anna <b>Neri</b>', phone: '+39 333 4445555' },
        account: { state: 'absent', usersDocId: null, usersRole: null }, conflict,
        properties: [{ id: 'p1', label: 'Via Cavour 12 <img src=x onerror=alert(1)>', currentOwnerId: null, currentOwnerKind: 'none', action: 'bind', reason: null, emailMismatch: false },
          { id: 'p2', label: 'Via B 2', currentOwnerId: 'OTHER', currentOwnerKind: 'other', action: 'blocked', reason: 'owned_by_other', emailMismatch: false }],
        aliases: [], consequences: ['rendiconto_starts'], willSendEmail: true, previewHash: 'a'.repeat(64) });
      // Un account provato dal solo lastLogin, con la vecchia scheda bloccata
      // (claim_needs_proof): il finto server risponde come il vero, in base a
      // confirmAccount. Hash d… senza conferma, e… con.
      const weakReply = (body) => {
        const conf = body.confirmAccount === true;
        if (body.op === 'invite') return { ok: true, op: 'invite', uid: 'Lp', createdAuth: false, usersDoc: 'existing', bound: [], claimed: conf ? [{ id: 'p1', from: 'K_paola' }] : [],
          kept: [], blocked: [], accountConfirmed: conf, emailSent: true, emailSkipped: null, loginUrl: 'x', portalUrl: 'y', whatsappText: 'Gentile Paola' };
        return { ok: true, op: 'preview', owner: { email: 'paola@x.it', emailSource: 'landlords', name: 'Paola Bianchi', phone: null },
          account: { state: 'exists', usersDocId: 'Lp', usersRole: 'landlord', proof: 'weak', confirmed: conf }, conflict: null,
          properties: [{ id: 'p1', label: 'Via Paola 1', currentOwnerId: 'K_paola', currentOwnerKind: 'alias', action: conf ? 'claim' : 'blocked', reason: conf ? null : 'claim_needs_proof', emailMismatch: false }],
          aliases: [{ key: 'K_paola', from: 'landlords' }], consequences: conf ? ['account_confirmed', 'alias_merge'] : ['claim_needs_proof'],
          accountConfirmation: conf ? { usersDocId: 'Lp', email: 'paola@x.it' } : null, willSendEmail: true, previewHash: (conf ? 'e' : 'd').repeat(64) };
      };
      await ui.route('**/*', async (route) => {
        const rq = route.request(), url = rq.url();
        if (url === BASEU + '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><button id="t">apri</button><script src="/js/owner-invite-ui.js"></script></body></html>' });
        if (url.endsWith('/js/owner-invite-ui.js')) return route.fulfill({ contentType: 'text/javascript', body: read('js/owner-invite-ui.js') });
        if (url.endsWith('/api/owner/invite')) {
          const body = JSON.parse(rq.postData() || '{}'); posted.push({ body, auth: rq.headers().authorization });
          if (mode === 'weak') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(weakReply(body)) });
          if (body.op === 'preview' && mode === 'echo') {
            const em = body.email || 'anna@exmaple.com';
            const pv = PV(null);
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...pv, owner: { ...pv.owner, email: em, emailSource: body.email ? 'manual' : 'property.ownerEmail' }, previewHash: (body.email ? 'c' : 'a').repeat(64) }) });
          }
          if (body.op === 'preview') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(PV(mode === 'conflict' ? { error: 'role_conflict', role: 'tenant' } : null)) });
          if (mode === 'changed') { mode = 'ok'; return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'plan_changed', preview: { ...PV(null), previewHash: 'b'.repeat(64) } }) }); }
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, op: 'invite', uid: 'uid_new_1', createdAuth: true, usersDoc: 'created', bound: ['p1'], claimed: [], kept: [], blocked: [{ id: 'p2', reason: 'owned_by_other' }], emailSent: true, emailSkipped: null, loginUrl: 'x', portalUrl: 'y', whatsappText: 'Gentile Anna, il suo archivio BOOM è attivo' }) });
        }
        return route.abort();
      });
      await ui.goto(BASEU + '/', { waitUntil: 'load' });
      await ui.evaluate(() => { window.firebase = { auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('TOKEN-ADMIN') } }) }; });
      const openUi = async () => { await ui.click('#t'); await ui.evaluate(() => window.BOOM_OWNER_INVITE.open('p1')); await ui.waitForSelector('[data-oinv="send"]'); await ui.waitForFunction(() => !document.querySelector('.oinv').textContent.includes('Calcolo il piano')); };
      await openUi();
      const ui1 = await ui.evaluate(() => ({ text: document.querySelector('.oinv').textContent, send: document.querySelector('[data-oinv="send"]').disabled,
        img: document.querySelectorAll('.oinv img').length, b: document.querySelectorAll('.oinv b').length, email: document.getElementById('oinv-email').value,
        over: document.documentElement.scrollWidth > window.innerWidth }));
      ok('UI: il piano col Bearer, email e fonte, immobile bloccato detto', posted[0].auth === 'Bearer TOKEN-ADMIN' && posted[0].body.op === 'preview'
        && ui1.email === 'anna@x.it' && /scheda immobile/.test(ui1.text) && /Bloccato/.test(ui1.text) && /rendiconto mensile/.test(ui1.text));
      ok('UI: i dati del server NON diventano HTML (niente <img>/<b> iniettati)', ui1.img === 0 && ui1.b === 0 && ui1.text.includes('<img src=x'));
      ok('UI: bottone attivo senza conflitti, niente scroll orizzontale a 390px', ui1.send === false && !ui1.over);
      ok('UI: nessuna spunta di conferma su un piano che non la chiede', await ui.evaluate(() => !document.querySelector('[data-oinv="confirm"]')));
      mode = 'changed';
      await ui.click('[data-oinv="send"]');
      await ui.waitForFunction(() => /Il piano è cambiato/.test(document.querySelector('.oinv').textContent));
      ok('UI: plan_changed → piano nuovo mostrato, niente invito dato per fatto', posted[1].body.op === 'invite' && posted[1].body.previewHash === 'a'.repeat(64)
        && !(await ui.evaluate(() => /Invito registrato/.test(document.querySelector('.oinv').textContent))));
      ok('UI: l\'invito porta SEMPRE l\'email del piano mostrato (anche quella trovata dalla scala)', posted[1].body.email === 'anna@x.it');
      await ui.click('[data-oinv="send"]');
      await ui.waitForFunction(() => /Invito registrato/.test(document.querySelector('.oinv').textContent));
      const ui2 = await ui.evaluate(() => ({ text: document.querySelector('.oinv').textContent, wa: (document.querySelector('.oinv a[href^="https://wa.me/"]') || {}).href || '',
        as: (document.querySelector('.oinv a[href^="/proprietario?as="]') || {}).getAttribute ? document.querySelector('.oinv a[href^="/proprietario?as="]').getAttribute('href') : '' }));
      ok('UI: riconferma col NUOVO hash, risultato e WhatsApp pronto', posted[2].body.previewHash === 'b'.repeat(64) && /Email d’invito inviata/.test(ui2.text)
        && ui2.wa.startsWith('https://wa.me/393334445555?text=') && ui2.as === '/proprietario?as=uid_new_1');
      await ui.keyboard.press('Escape');
      ok('UI: Esc chiude', await ui.evaluate(() => !document.querySelector('.oinv')));
      mode = 'conflict';
      await openUi();
      const ui3 = await ui.evaluate(() => ({ send: document.querySelector('[data-oinv="send"]').disabled, text: document.querySelector('.oinv').textContent }));
      ok('UI: con un conflitto il bottone d\'invio è SPENTO e il perché è scritto', ui3.send === true && /non è un proprietario/.test(ui3.text));

      // Revisione 23/09/2026 (scratchpad s8): l'email trovata ha un refuso,
      // l'operatore la corregge e preme «Invia» senza ricalcolare. Prima
      // l'invito partiva al VECCHIO indirizzo (corpo senza email, hash del
      // piano vecchio) e il campo tornava al refuso. Qui il finto server fa
      // l'eco dell'email chiesta, così si vede a chi andrebbe davvero.
      mode = 'echo';
      await ui.keyboard.press('Escape');
      await openUi();
      const e0 = await ui.evaluate(() => ({ email: document.getElementById('oinv-email').value, send: document.querySelector('[data-oinv="send"]').disabled }));
      ok('UI (email corretta): il piano parte dal refuso, bottone attivo', e0.email === 'anna@exmaple.com' && e0.send === false);
      await ui.fill('#oinv-email', 'anna@example.com');
      const e1 = await ui.evaluate(() => ({ send: document.querySelector('[data-oinv="send"]').disabled, rc: document.querySelector('[data-oinv="recalc"]').textContent,
        dirty: !document.getElementById('oinv-dirty').hidden, email: document.getElementById('oinv-email').value }));
      ok('UI (email corretta): appena il campo cambia «Invia» si spegne e compare «Ricalcola il piano»', e1.send === true && e1.rc === 'Ricalcola il piano'
        && e1.dirty === true && e1.email === 'anna@example.com');
      const before = posted.length;
      // Anche forzando il clic (bottone riacceso a mano) NON parte un invito:
      // si ricalcola il piano per l'email nuova.
      await ui.evaluate(() => { const b = document.querySelector('[data-oinv="send"]'); b.disabled = false; b.click(); });
      await ui.waitForFunction(() => /Partirà a anna@example\.com/.test(document.querySelector('.oinv').textContent), null, { timeout: 5000 }).catch(() => {});
      const forced = posted.slice(before);
      ok('UI (email corretta): il clic forzato ricalcola per la nuova email, nessun invito col piano vecchio', forced.length === 1
        && forced[0].body.op === 'preview' && forced[0].body.email === 'anna@example.com' && !forced.some((x) => x.body.op === 'invite'));
      // (null-safe: con il difetto la finestra è già sul «risultato» e questi
      // nodi non esistono — il controllo deve dire rosso, non far saltare la suite)
      const e2 = await ui.evaluate(() => ({ send: document.querySelector('[data-oinv="send"]')?.disabled, rc: document.querySelector('[data-oinv="recalc"]')?.textContent,
        email: document.getElementById('oinv-email')?.value, dirty: !document.getElementById('oinv-dirty')?.hidden }));
      ok('UI (email corretta): piano nuovo mostrato, campo intatto, «Invia» di nuovo attivo', e2.send === false && e2.rc === 'Ricalcola' && e2.dirty === false && e2.email === 'anna@example.com');
      if (e2.send === false) await ui.click('[data-oinv="send"]');
      await ui.waitForFunction(() => /Invito registrato/.test(document.querySelector('.oinv').textContent), null, { timeout: 5000 }).catch(() => {});
      const inv = posted.filter((x) => x.body.op === 'invite').pop();
      ok('UI (email corretta): l\'invito porta l\'email del piano mostrato e il SUO hash', !!inv && inv.body.email === 'anna@example.com' && inv.body.previewHash === 'c'.repeat(64)
        && await ui.evaluate(() => /Invito registrato/.test(document.querySelector('.oinv').textContent)));
      await ui.keyboard.press('Escape');

      // La conferma dell'account (23/09): la spunta compare solo con proof
      // weak + un immobile fermo per claim_needs_proof, è SPENTA, e ogni
      // cambio ricalcola il piano con (o senza) confirmAccount.
      mode = 'weak';
      const nPosted = posted.length;
      await openUi();
      const w0 = await ui.evaluate(() => { const c = document.querySelector('[data-oinv="confirm"]');
        return { has: !!c, checked: c ? c.checked : null, send: document.querySelector('[data-oinv="send"]').disabled, label: c ? c.parentNode.textContent : '' }; });
      ok('UI (conferma): proof weak + immobile bloccato → la spunta c\'è, SPENTA; «Invia» spento', w0.has && w0.checked === false && w0.send === true
        && /Confermo di conoscere questo proprietario e che l’account è suo/.test(w0.label));
      ok('UI (conferma): il primo piano parte SENZA confirmAccount (mai automatico)', posted.slice(nPosted).length === 1 && !('confirmAccount' in posted[nPosted].body));
      await ui.click('[data-oinv="confirm"]');
      await ui.waitForFunction(() => /L’admin conferma che l’account Lp appartiene a paola@x\.it/.test(document.querySelector('.oinv').textContent), null, { timeout: 5000 }).catch(() => {});
      const w1 = await ui.evaluate(() => ({ checked: (document.querySelector('[data-oinv="confirm"]') || {}).checked, send: document.querySelector('[data-oinv="send"]').disabled,
        text: document.querySelector('.oinv').textContent }));
      const pv1 = posted[posted.length - 1];
      ok('UI (conferma): spuntare ricalcola il piano CON confirmAccount:true', pv1.body.op === 'preview' && pv1.body.confirmAccount === true);
      ok('UI (conferma): il piano confermato dice la conseguenza coi nomi, spunta accesa, «Invia» attivo', w1.checked === true && w1.send === false
        && /L’admin conferma che l’account Lp appartiene a paola@x\.it/.test(w1.text) && /Riunito dalla vecchia scheda/.test(w1.text));
      await ui.click('[data-oinv="confirm"]');
      await ui.waitForFunction(() => document.querySelector('[data-oinv="send"]') && document.querySelector('[data-oinv="send"]').disabled
        && !/L’admin conferma/.test(document.querySelector('.oinv').textContent), null, { timeout: 5000 }).catch(() => {});
      const pv2 = posted[posted.length - 1];
      const w2 = await ui.evaluate(() => ({ has: !!document.querySelector('[data-oinv="confirm"]'), checked: (document.querySelector('[data-oinv="confirm"]') || {}).checked }));
      ok('UI (conferma): togliere la spunta ricalcola SENZA confirmAccount, la spunta resta offerta e spenta', pv2.body.op === 'preview'
        && !('confirmAccount' in pv2.body) && w2.has && w2.checked === false);
      await ui.click('[data-oinv="confirm"]');
      await ui.waitForFunction(() => !document.querySelector('[data-oinv="send"]').disabled, null, { timeout: 5000 }).catch(() => {});
      await ui.click('[data-oinv="send"]');
      await ui.waitForFunction(() => /Invito registrato/.test(document.querySelector('.oinv').textContent), null, { timeout: 5000 }).catch(() => {});
      const inv2 = posted.filter((x) => x.body.op === 'invite').pop();
      ok('UI (conferma): l\'invito porta confirmAccount:true e l\'hash del piano CONFERMATO', !!inv2 && inv2.body.confirmAccount === true
        && inv2.body.previewHash === 'e'.repeat(64));
      ok('UI (conferma): il risultato dice che la conferma è tua e resta scritta', await ui.evaluate(() => /Account confermato da te/.test(document.querySelector('.oinv').textContent)));
      await ui.keyboard.press('Escape');
      // Un'email diversa può portare un altro account: la spunta non la segue.
      await openUi();
      await ui.click('[data-oinv="confirm"]');
      await ui.waitForFunction(() => /L’admin conferma/.test(document.querySelector('.oinv').textContent), null, { timeout: 5000 }).catch(() => {});
      await ui.fill('#oinv-email', 'paola.bianchi@x.it');
      await ui.click('[data-oinv="recalc"]');
      await ui.waitForFunction(() => !/L’admin conferma/.test(document.querySelector('.oinv').textContent), null, { timeout: 5000 }).catch(() => {});
      const pv3 = posted[posted.length - 1];
      ok('UI (conferma): cambiare email SPEGNE la conferma (il piano nuovo parte senza confirmAccount)', pv3.body.op === 'preview'
        && pv3.body.email === 'paola.bianchi@x.it' && !('confirmAccount' in pv3.body)
        && await ui.evaluate(() => (document.querySelector('[data-oinv="confirm"]') || {}).checked === false));
      await ui.keyboard.press('Escape');
      ok('UI: zero errori JS', errs.length === 0);
      await ui.close();
    } finally { await browser.close(); }
  }
}

if (current) current();
console.log(`\nInvito proprietario: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
