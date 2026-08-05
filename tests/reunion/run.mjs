// tests/reunion/run.mjs — BOOM La Réunion : le lead, et le marché qui ne se
// trompe pas de continent.
//
// Deux promesses tenues ici, et la seconde est la plus coûteuse à casser.
//
// 1. LE LEAD DIT DE QUEL CÔTÉ IL EST. La page sert deux publics opposés :
//    un propriétaire qui a un bien vide et un locataire qui cherche. C'est la
//    SEULE chose que l'opérateur lit avant de répondre. Un lead qui perd son
//    côté en route produit une réponse à côté de la plaque, sur le premier
//    contact — celui qui décide s'il y en aura un deuxième.
//
// 2. LA MACHINE ROMAINE SE TAIT. Toute l'automatisation de BOOM est calibrée
//    sur Rome : le message WhatsApp pré-rempli est signé « BOOM Roma » et
//    pointe vers /apartments, le Commerciale rédige sa première réponse avec
//    un prompt qui décrit le marché romain, et sa relance demande « stai
//    ancora cercando casa a Roma ? ». Sans garde-fou, le tout premier
//    propriétaire de Saint-Pierre reçoit un mail EN ANGLAIS qui lui propose de
//    trouver un logement à Rome. Une automatisation qui se trompe de marché
//    est pire que pas d'automatisation : l'opérateur signe la bêtise.
//
// Run: node tests/reunion/run.mjs

import { readFileSync } from 'node:fs';
import { isReunion, isReunionOwner, reunionReplyText, REUNION_URL } from '../../api/_market.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
};

// ── Firestore finto : on intercepte la fetch REST, comme les autres suites ──
let written = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit') || u.includes('securetoken')) {
    return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin' }) };
  }
  if (u.includes('firestore.googleapis.com')) {
    if ((opts.method || 'GET') === 'POST') {
      written.push({ url: u, body: JSON.parse(opts.body || '{}') });
      return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/leads/re123' }) };
    }
    return { ok: true, status: 200, json: async () => ({ documents: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const handler = (await import('../../api/reunion-lead.js')).default;

// Firestore REST encodes values as {stringValue}/{integerValue}/… — on relit
// le document tel qu'il sera VRAIMENT écrit, pas l'objet qu'on a construit.
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
  const w = written.find(x => x.url.includes('leads'));
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
  // IP différente à chaque appel par défaut : la limite par IP est réelle et
  // se testerait toute seule au sixième cas si on ne le faisait pas.
  const headers = { 'x-forwarded-for': ip || `10.0.0.${++ipSeq}` };
  return handler({ method: 'POST', headers, body, socket: {} }, res)
    .then(() => ({ code, payload, lead: leadDoc(), writes: [...written] }));
}

const OWNER = { role: 'owner', name: 'Marie Payet', email: 'marie@example.re', commune: 'Saint-Pierre', propertyKind: 'T3 68 m²', message: 'Mon bien est libre depuis juin, je vis à Lyon.' };
const TENANT = { role: 'tenant', name: 'Jean Hoarau', email: 'jean@example.re', commune: 'Saint-Denis', budget: '900', moveIn: 'septembre 2026', message: 'Je suis muté en septembre.' };

console.log('\n\x1b[1m▸ la porte : ce qui entre et ce qui n\'entre pas\x1b[0m');
{
  const r = await call({ ...OWNER, company: 'bot inc' });
  ok('le pot de miel ne dit pas au robot qu\'il a été vu', r.code === 200 && r.payload.ok === true);
  ok('...et surtout n\'écrit rien', r.writes.length === 0, r.writes.length);
}
{
  const r = await call({ ...OWNER, name: '' });
  ok('sans nom : refusé', r.code === 400 && r.payload.error === 'name_required');
  ok('un refus n\'écrit jamais un lead à moitié', r.writes.length === 0);
}
{
  const r = await call({ role: 'tenant', name: 'Anonyme' });
  ok('sans email ni téléphone : refusé (on ne pourrait pas répondre)', r.code === 400 && r.payload.error === 'contact_required');
}
{
  const r = await call({ role: 'tenant', name: 'Jean', phone: '+262 692 12 34 56' });
  ok('le téléphone seul suffit', r.code === 200 && r.lead && r.lead.phone === '+262 692 12 34 56');
}
{
  const r = await call({ ...OWNER, email: 'pas-une-adresse' });
  ok('un email invalide sans téléphone ne passe pas', r.code === 400);
}

console.log('\n\x1b[1m▸ de quel côté est cette personne\x1b[0m');
{
  const r = await call(OWNER);
  ok('propriétaire → leadType landlord', r.lead.leadType === 'landlord', r.lead.leadType);
  ok('propriétaire → intent reunion_owner', r.lead.intent === 'reunion_owner');
  ok('le résumé le CRIE en première position', /^PROPRIÉTAIRE/.test(r.lead.message), r.lead.message);
  ok('la commune voyage', r.lead.zone === 'Saint-Pierre');
  ok('le bien décrit est gardé', String(r.lead.message).includes('T3 68 m²'));
  ok('un propriétaire n\'a pas de budget de recherche', r.lead.budget === null);
  ok('ses mots à lui sont dans le résumé', String(r.lead.message).includes('je vis à Lyon'));
}
{
  const r = await call(TENANT);
  ok('locataire → leadType tenant', r.lead.leadType === 'tenant', r.lead.leadType);
  ok('locataire → intent reunion_tenant', r.lead.intent === 'reunion_tenant');
  ok('le résumé le CRIE aussi', /^LOCATAIRE/.test(r.lead.message), r.lead.message);
  ok('le budget devient un nombre, pas une chaîne', r.lead.budget === 900, r.lead.budget);
  ok('la date d\'emménagement voyage', r.lead.moveIn === 'septembre 2026');
}
{
  const r = await call({ ...TENANT, budget: 'environ 1 200 €' });
  ok('un budget écrit à la main est quand même lu', r.lead.budget === 1200, r.lead.budget);
}
{
  const r = await call({ ...TENANT, role: 'n\'importe quoi' });
  ok('un rôle inconnu retombe côté locataire, jamais dans le vide', r.lead.leadType === 'tenant');
}

console.log('\n\x1b[1m▸ le lead entre dans la machine qui existe déjà\x1b[0m');
{
  const r = await call(OWNER);
  ok('schéma `leads` : source web', r.lead.source === 'web');
  ok('schéma `leads` : status new (sinon le Brain ne le voit pas)', r.lead.status === 'new');
  ok('marché marqué', r.lead.market === 'reunion');
  ok('l\'opérateur est prévenu tout de suite', r.writes.some(w => w.url.includes('agentNotifications')));
  const notif = r.writes.find(w => w.url.includes('agentNotifications'));
  ok('la notification dit le côté et le drapeau', /🇷🇪/.test(plain(notif.body.fields.summary)) && /PROPRIÉTAIRE/.test(plain(notif.body.fields.summary)));
  ok('une notification ratée ne peut pas annuler le lead (lead écrit en premier)',
    r.writes.findIndex(w => w.url.includes('leads')) < r.writes.findIndex(w => w.url.includes('agentNotifications')));
}
{
  const r = await call(OWNER);
  ok('langue par défaut : français', r.lead.language === 'fr');
}
{
  const r = await call({ ...OWNER, lang: 'en' });
  ok('l\'anglais est respecté quand il est demandé', r.lead.language === 'en');
}
{
  const r = await call({ ...OWNER, lang: 'xx' });
  ok('une langue inventée retombe sur le français, pas sur l\'italien', r.lead.language === 'fr');
}

console.log('\n\x1b[1m▸ la limite par IP existe vraiment\x1b[0m');
{
  const ip = '203.0.113.99';
  let last = null;
  for (let i = 0; i < 7; i++) last = await call({ ...OWNER, name: `Test ${i}` }, ip);
  ok('le 7e envoi depuis la même IP est refusé', last.code === 429, last.code);
  ok('et n\'écrit rien', last.writes.length === 0);
}

console.log('\n\x1b[1m▸ le marché : Rome n\'écrit pas en français, La Réunion n\'écrit pas sur Rome\x1b[0m');
{
  ok('reconnu par market', isReunion({ market: 'reunion' }));
  ok('reconnu par sourceRef', isReunion({ sourceRef: 'reunion' }));
  ok('reconnu par intent', isReunion({ intent: 'reunion_tenant' }));
  ok('MAJUSCULES comprises', isReunion({ market: 'REUNION' }));
  // La régression qui coûterait le plus cher : un lead romain traité comme
  // réunionnais recevrait une réponse en français avec un lien vers /reunion.
  ok('un lead romain n\'est PAS réunionnais', !isReunion({ source: 'web', service: 'Canone Check', intent: 'canone_check' }));
  ok('un lead WhatsApp romain non plus', !isReunion({ source: 'whatsapp', message: 'ciao cerco casa a Roma' }));
  ok('un objet vide ne casse rien', !isReunion({}) && !isReunion(null) && !isReunion(undefined));
  ok('le côté propriétaire est lisible depuis le lead', isReunionOwner({ leadType: 'landlord' }) && !isReunionOwner({ leadType: 'tenant' }));
}
{
  const owner = reunionReplyText({ name: 'Marie Payet', leadType: 'landlord', zone: 'Saint-Pierre' });
  const tenant = reunionReplyText({ name: 'Jean', leadType: 'tenant' });
  ok('le message est en français', /Bonjour/.test(owner) && /Bonjour/.test(tenant));
  ok('il appelle la personne par son prénom, pas par son nom complet', owner.includes('Bonjour Marie,') && !owner.includes('Payet'));
  ok('il parle du bien du propriétaire', /votre bien/.test(owner) && /Saint-Pierre/.test(owner));
  ok('il demande au locataire ce qu\'il faut pour avancer', /budget/.test(tenant));
  ok('les deux versions diffèrent vraiment', owner !== tenant);
  ok('il renvoie vers /reunion', owner.includes(REUNION_URL) && tenant.includes(REUNION_URL));
  ok('il ne renvoie JAMAIS vers le catalogue romain', !/apartments|boomrome\.com\/listing/.test(owner + tenant));
  ok('il ne parle pas de Rome', !/Roma|Rome/.test(owner + tenant));
  // Personne ne signe à la place de quelqu'un d'autre : la personne sur l'île
  // n'est pas celle qui signe les messages de Rome.
  ok('il n\'invente aucune signature', !/Valentino/.test(owner + tenant));
  ok('sans nom, la formule reste correcte', reunionReplyText({ leadType: 'tenant' }).startsWith('Bonjour, ici'));
}

console.log('\n\x1b[1m▸ les gardes sont posées dans le code qui envoie\x1b[0m');
{
  // Assertions sur la SOURCE : ces deux fichiers font des appels réseau (IA,
  // Telegram) qu'on ne rejoue pas ici, mais la garde doit être AVANT eux —
  // c'est l'ordre qui compte, pas la présence de la ligne.
  const com = readFileSync(new URL('../../api/employees/commerciale.js', import.meta.url), 'utf8');
  ok('le Commerciale importe la règle de marché', /import\s*\{[^}]*isReunion[^}]*\}\s*from\s*'\.\.\/_market\.js'/.test(com));
  const guard = com.indexOf('if (isReunion(lead)) continue;');
  const firstDraft = com.indexOf('proposeFirstReply(lead');
  ok('le Commerciale sort AVANT de rédiger quoi que ce soit', guard > -1 && firstDraft > -1 && guard < firstDraft, { guard, firstDraft });

  const notif = readFileSync(new URL('../../api/telegram/notify-pending.js', import.meta.url), 'utf8');
  ok('la carte Telegram importe la règle', /import\s*\{[^}]*isReunion[^}]*\}\s*from\s*'\.\.\/_market\.js'/.test(notif));
  ok('le message pré-rempli passe par la version française', /isReunion\(l\)\s*\?\s*reunionReplyText\(l\)/.test(notif));
}

console.log('\n\x1b[1m▸ la page dit la même chose que le serveur\x1b[0m');
{
  const page = readFileSync(new URL('../../reunion.html', import.meta.url), 'utf8');
  const fr = (page.match(/class="l-fr"/g) || []).length;
  const en = (page.match(/class="l-en"/g) || []).length;
  ok(`chaque phrase existe dans les deux langues (${fr} fr / ${en} en)`, fr === en, { fr, en });
  ok('le formulaire poste bien sur son endpoint', page.includes("fetch('/api/reunion-lead'"));
  ok('le rôle envoyé est celui affiché', page.includes("role:aud"));
  // Le défaut trouvé au rendu : une classe .done partagée masquait la moitié
  // du parcours. L'état du formulaire doit garder son nom à lui.
  ok('l\'état « envoyé » ne réutilise pas la classe .done du parcours', !/class="done" id="fDone"/.test(page) && page.includes('class="sent" id="fDone"'));
  // Le français est la langue de l'URL canonique : le déduire du navigateur
  // servirait de l'anglais au robot de Google sous une page déclarée fr.
  ok('la langue ne se devine pas depuis le navigateur', !page.includes('navigator.language'));
  ok('l\'interrupteur loi Hoguet est en place et au cran prudent', /<body[^>]*data-legal="pending"/.test(page));
  ok('aucun numéro de carte professionnelle n\'est affirmé par défaut',
    !/carte professionnelle n° \d/.test(page.replace(/\[NUMÉRO\]/g, '')));
  ok('une porte de secours existe si le formulaire tombe', page.includes('mailto:hello@boom-rome.com'));
}

console.log(`\n${fail === 0 ? '\x1b[32m\x1b[1m' : '\x1b[31m\x1b[1m'}La Réunion: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
