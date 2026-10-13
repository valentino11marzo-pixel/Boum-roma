// api/telegram/_palazzo.js — /palazzo su Telegram: il mese di un palazzo in tasca.
//
// La stessa domanda della pagina (quali interni sono pieni, chi ha pagato,
// chi no), dallo STESSO motore (js/palazzo-engine.js): il bot non può dire
// una cosa diversa da ciò che l'operatore e la proprietaria vedono nel
// portal. Sola lettura, solo per la chat dell'operatore (il webhook la
// filtra), e mai un recapito degli inquilini nel messaggio: per chiamare
// c'è la scheda dell'interno.
//
//   /palazzo            → i palazzi con almeno 3 interni (al più 3, i più grandi)
//   /palazzo prenestino → il palazzo il cui indirizzo contiene il testo
//
// Letture limitate al palazzo: immobili (una lista), poi contratti, rate e
// proposte SOLO dei suoi interni (`IN` a blocchi di 30, il tetto di
// Firestore), e i profili di proprietaria e inquilini per nome. Una rata
// senza propertyId si ritrova dal contratto, come fa il motore. Una lettura
// che tocca il suo tetto non è "tutto l'archivio": il messaggio lo DICE
// (opts.partial del motore), invece di contare come assente ciò che non ha letto.

import PALAZZO from '../../js/palazzo-engine.js';
import { fsList, fsGetMany } from '../homie/_lib.js';

const BASE = process.env.PUBLIC_BASE_URL || 'https://www.boomrome.com';
const MIN_UNITS = 3;
const MAX_BUILDINGS = 3;
const LIMITS = { properties: 600, contracts: 400, payments: 1500, preAgreements: 200, maintenance: 400 };
const LABEL = { properties: 'immobili', contracts: 'contratti', payments: 'rate', preAgreements: 'proposte', maintenance: 'manutenzione' };

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const eur = v => PALAZZO.eur(v || 0);
const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const unitName = u => (u.interno ? 'int. ' + u.interno : u.name);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const itDate = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
const giorni = n => n + (n === 1 ? ' giorno' : ' giorni');

// Che cosa è una riga del debito: canone, deposito/saldo deposito, altro
// addebito. La STESSA regola di rowKind/itemsText in js/palazzo.js (la
// scheda del portal): dal telefono il saldo del deposito non deve sembrare
// un canone non pagato («2 rate» quando una è il deposito). Esportate: il
// test le confronta con quelle della pagina.
export function rowKind(r) {
  if (!r || r.isRent !== false) return 'rent';
  return /^deposit(-balance)?$/.test(String(r.type || '').toLowerCase()) ? 'deposit' : 'other';
}
export function rowName(r) {
  const k = rowKind(r);
  return k === 'deposit' ? (String(r.type || '').toLowerCase() === 'deposit' ? 'Deposito' : 'Saldo deposito') : k === 'other' ? 'Altro addebito' : '';
}
export function itemsText(rows) {
  if (!Array.isArray(rows)) return '';
  const extra = rows.filter(r => rowKind(r) !== 'rent');
  if (!extra.length) return '';
  const rentN = rows.length - extra.length, names = [];
  extra.forEach(r => { const nm = rowName(r).toLowerCase(); if (names.indexOf(nm) < 0) names.push(nm); });
  return (rentN ? rentN + (rentN === 1 ? ' rata + ' : ' rate + ') : '') + names.join(' + ');
}
// Il pezzo «che cosa e da quanto» di una riga di chi non ha pagato.
function debtWhat(d) {
  const label = itemsText(d.rows) || (d.count > 1 ? d.count + ' rate' : '');
  const age = d.count > 1 && d.oldestDays ? ', la più vecchia da ' + giorni(d.oldestDays) : d.oldestDays ? ' · ' + giorni(d.oldestDays) : '';
  return label ? ' · ' + label + age : age;
}

async function listIn(collection, field, values, limit, cut) {
  const out = [];
  for (const part of chunk(values.filter(Boolean), 30)) {
    const got = await fsList(collection, { filter: { field, op: 'IN', value: part }, limit });
    if (cut && got.length >= limit) cut.add(LABEL[collection] || collection);
    out.push(...got);
  }
  return out;
}

// Il messaggio di UN palazzo, dal modello del motore. Pura: si testa.
export function palazzoSummary(m) {
  if (!m || !m.building) return '';
  const lines = ['🏛 <b>' + esc(m.building.label) + '</b>' + (m.owner && m.owner.name ? ' · ' + esc(m.owner.name) : '')];
  PALAZZO.brief(m).forEach(s => lines.push(esc(s)));
  // Chi non ha pagato: TUTTE le rate scadute fino a questo mese (anche i
  // mesi prima), il totale e il ritardo più vecchio. Una riga per interno E
  // contratto: nel mese del cambio inquilino il vecchio e la nuova hanno
  // ciascuno la SUA cifra, col suo nome (il debito di uno non va sull'altro).
  const debt = m.debtors || [];
  if (debt.length) {
    lines.push('', '🔴 <b>Non hanno pagato</b>');
    debt.forEach(d => lines.push('• ' + esc(unitName(d)) + (d.tenants.length ? ' · ' + esc(d.tenants[0]) : '') + ' · ' +
      (d.amount > 0 ? eur(d.amount) + (d.unknownAmounts ? ' più un importo da verificare' : '') : 'importo da verificare') +
      debtWhat(d) + (d.previousContract ? ' · contratto precedente' : '')));
  }
  const leaving = m.units.filter(u => u.month.leaving && u.month.leaseEnd).sort((a, b) => a.month.leaseEnd.localeCompare(b.month.leaseEnd));
  if (leaving.length) {
    lines.push('', '⌛ <b>In scadenza entro 90 giorni</b>');
    leaving.forEach(u => { const d = days(m.today, u.month.leaseEnd); lines.push('• ' + esc(unitName(u)) + ' · ' + (d <= 0 ? 'scade oggi' : 'tra ' + giorni(d))); });
  }
  const byId = id => m.units.find(u => u.id === id);
  const notice = m.issues.find(i => i.code === 'noticeDue');
  if (notice) {
    lines.push('', '📅 <b>Disdetta</b>');
    const RENEW = { tacito: 'senza disdetta si rinnova per uguale periodo', proroga: 'senza comunicazione si proroga di due anni', rinnovo: 'senza disdetta si rinnova di quattro anni' };
    notice.items.forEach(x => { const u = byId(x.unitId); lines.push('• ' + esc(u ? unitName(u) : x.unitId) + ' · ' + (x.passed ? 'termine passato il ' : 'entro il ') + itDate(x.by) +
      ' · scade il ' + itDate(x.end) + (RENEW[x.renews] ? ' · ' + RENEW[x.renews] : '') + (x.assumed ? ' (termine ipotizzato: tipo di contratto non indicato)' : '')); });
  }
  // Scaduto senza una chiusura scritta: la domanda dipende dal modello (il
  // transitorio cessa da sé e qui non arriva; lo studenti si rinnova da solo
  // senza disdetta; il 3+2 si proroga di diritto).
  const exp = m.issues.find(i => i.code === 'expiredStillIn');
  if (exp) {
    const ASK = { tacito: 'studenti: senza disdetta si è rinnovato da solo?', proroga: '3+2: prorogato di due anni?', rinnovo: '4+4: rinnovato di quattro anni?' };
    lines.push('', '⚠️ <b>Scaduti senza chiusura</b> (l’inquilino è ancora dentro?)');
    exp.contracts.forEach(x => { const u = byId(x.unitId); lines.push('• ' + esc(u ? unitName(u) : x.unitId) + ' · scaduto il ' + itDate(x.end) +
      (ASK[x.renews] ? ' · ' + ASK[x.renews] : !x.type ? ' · tipo di contratto non indicato: segna la chiusura o il rinnovo' : ' · segna la chiusura o il rinnovo')); });
  }
  const after = m.issues.find(i => i.code === 'afterClose');
  if (after && after.open) lines.push('', '🧾 <b>Rate dopo la chiusura del contratto</b>: ' + after.open + (after.open === 1 ? ' rata da annullare' : ' rate da annullare') + ' (' + esc(after.ids.map(byId).filter(Boolean).map(unitName).join(', ')) + ')');
  // Rate oltre la fine di un contratto ancora attivo: DOVUTE (sono fra i
  // ritardi sopra), mai «da annullare» — si chiede del rinnovo.
  const beyond = m.issues.find(i => i.code === 'beyondEnd');
  if (beyond) {
    lines.push('', '🔁 <b>Rate oltre la scadenza</b> (contratto ancora attivo: rinnovato? aggiorna la fine)');
    beyond.items.forEach(x => { const u = byId(x.unitId); lines.push('• ' + esc(u ? unitName(u) : x.unitId) + ' · scaduto il ' + itDate(x.end) + ' · ' +
      x.count + (x.count === 1 ? ' rata dopo' : ' rate dopo') + (x.open ? ' (' + x.open + (x.open === 1 ? ' aperta' : ' aperte') + ')' : '')); });
  }
  const broken = m.units.filter(u => u.maintenance && u.maintenance.open.length).sort((a, b) => b.maintenance.urgent - a.maintenance.urgent);
  if (broken.length) {
    lines.push('', '🔧 <b>Manutenzione aperta</b>');
    const PRI = { urgent: 'emergenza', high: 'urgente', medium: 'normale', low: 'non urgente' };
    broken.forEach(u => u.maintenance.open.forEach(x => lines.push('• ' + esc(unitName(u)) + ' · ' + esc(x.title) + ' · ' + PRI[x.priority] + (x.createdAt ? ' · dal ' + x.createdAt.slice(8, 10) + '/' + x.createdAt.slice(5, 7) : ''))));
  }
  const unreg = m.issues.find(i => i.code === 'unregistered');
  if (unreg) {
    const names = unreg.ids.map(byId).filter(Boolean).map(unitName);
    lines.push('', '📄 <b>Registrazione da segnare</b> (oltre 30 giorni dalla decorrenza): ' + esc(names.join(', ')));
  }
  const SHOWN = { unregistered: 1, noticeDue: 1, expiredStillIn: 1, afterClose: 1, beyondEnd: 1, partial: 1 };
  const other = m.issues.filter(i => !SHOWN[i.code] || (i.code === 'afterClose' && !i.open)).length;
  if (other) lines.push('', '🧰 Da sistemare nel portal: ' + other + (other === 1 ? ' voce' : ' voci') + '.');
  return lines.join('\n');
}

export async function palazzoMessage(query, { now } = {}) {
  const properties = await fsList('properties', { limit: LIMITS.properties });
  const ctx0 = PALAZZO.context({ properties, now });
  const q = norm(query);
  let list = PALAZZO.buildings(ctx0).filter(b => b.key !== 'x:senza-indirizzo');
  list = q ? list.filter(b => norm(b.label).includes(q)) : list.filter(b => b.units >= MIN_UNITS);
  const keyboard = { inline_keyboard: [[{ text: '🏛 Apri il Palazzo', url: BASE + '/portal#palazzo' }]] };
  const propsCut = properties.length >= LIMITS.properties;
  if (!list.length) {
    return { msg: (q ? 'Nessun palazzo il cui indirizzo contiene «' + esc(query) + '». /palazzo da solo elenca quelli con almeno ' + MIN_UNITS + ' interni.'
      : 'Nessun palazzo con almeno ' + MIN_UNITS + ' interni in archivio: gli interni allo stesso civico diventano un palazzo.') +
      (propsCut ? '\n\n(Letti i primi ' + LIMITS.properties + ' immobili: l’archivio potrebbe averne altri.)' : ''), keyboard };
  }
  const shown = list.slice(0, MAX_BUILDINGS);
  const blocks = [];
  for (const b of shown) {
    const ids = b.propertyIds, cut = new Set(propsCut ? [LABEL.properties] : []);
    const contracts = await listIn('contracts', 'propertyId', ids, LIMITS.contracts, cut);
    const byProp = await listIn('payments', 'propertyId', ids, LIMITS.payments, cut);
    const byContract = await listIn('payments', 'contractId', contracts.map(c => c.id), LIMITS.payments, cut);
    const seen = new Set(), payments = [];
    for (const p of [...byProp, ...byContract]) { if (!seen.has(p.id)) { seen.add(p.id); payments.push(p); } }
    // Le proposte fanno di un libero un "in arrivo" (come nella pagina
    // dell'operatore); i profili danno i nomi di proprietaria e inquilini.
    // Una lettura FALLITA non è un elenco vuoto: "nessuna manutenzione" o
    // "libero" invece di "in trattativa" non si distinguono da un errore, quindi
    // la si dichiara (opts.partial del motore) e si va avanti.
    const unread = what => () => { cut.add(what); return []; };
    const preAgreements = await listIn('preAgreements', 'propertyId', ids, LIMITS.preAgreements, cut).catch(unread('proposte non lette'));
    const userIds = [...new Set([...ids.map(id => (properties.find(p => p.id === id) || {}).ownerId), ...contracts.map(c => c.tenantId)]
      .filter(x => typeof x === 'string' && /^[\w.-]{1,80}$/.test(x)))];
    const uMap = userIds.length ? await fsGetMany(userIds.map(u => 'users/' + u)).catch(() => { cut.add('profili non letti'); return new Map(); }) : new Map();
    const users = [...uMap.entries()].filter(([, d]) => d).map(([k, d]) => ({ ...d, id: k.split('/')[1] }));
    const maintenance = await listIn('maintenance', 'propertyId', ids, LIMITS.maintenance, cut).catch(unread('manutenzione non letta'));
    const ctx = PALAZZO.context({ properties, contracts, payments, users, preAgreements, maintenance, now });
    blocks.push(palazzoSummary(PALAZZO.model(ctx, b.key, ctx.month, { strip: false, partial: cut.size ? [...cut] : false })));
  }
  const more = list.length - shown.length;
  return { msg: blocks.join('\n\n— — —\n\n') + (more > 0 ? '\n\n…e altri ' + more + ': /palazzo <i>via</i> per uno solo.' : ''), keyboard };
}
