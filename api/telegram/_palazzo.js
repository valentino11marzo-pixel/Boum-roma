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
// senza propertyId si ritrova dal contratto, come fa il motore.

import PALAZZO from '../../js/palazzo-engine.js';
import { fsList, fsGetMany } from '../homie/_lib.js';

const BASE = process.env.PUBLIC_BASE_URL || 'https://www.boomrome.com';
const MIN_UNITS = 3;
const MAX_BUILDINGS = 3;

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const eur = v => '€' + String(Math.round(v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const unitName = u => (u.interno ? 'int. ' + u.interno : u.name);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

async function listIn(collection, field, values, limit) {
  const out = [];
  for (const part of chunk(values.filter(Boolean), 30)) {
    out.push(...await fsList(collection, { filter: { field, op: 'IN', value: part }, limit }));
  }
  return out;
}

// Il messaggio di UN palazzo, dal modello del motore. Pura: si testa.
export function palazzoSummary(m) {
  if (!m || !m.building) return '';
  const lines = ['🏛 <b>' + esc(m.building.label) + '</b>' + (m.owner && m.owner.name ? ' · ' + esc(m.owner.name) : '')];
  PALAZZO.brief(m).forEach(s => lines.push(esc(s)));
  const late = m.units.filter(u => u.month.state === 'late').sort((a, b) => b.month.lateDays - a.month.lateDays);
  if (late.length) {
    lines.push('', '🔴 <b>Non hanno pagato</b>');
    late.forEach(u => lines.push('• ' + esc(unitName(u)) + (u.month.tenants.length ? ' · ' + esc(u.month.tenants[0]) : '') + ' · ' + eur(u.month.lateAmount) +
      (u.month.lateDays ? ' · ' + u.month.lateDays + (u.month.lateDays === 1 ? ' giorno' : ' giorni') : '')));
  }
  const leaving = m.units.filter(u => u.month.leaving && u.month.leaseEnd).sort((a, b) => a.month.leaseEnd.localeCompare(b.month.leaseEnd));
  if (leaving.length) {
    lines.push('', '⌛ <b>In scadenza entro 90 giorni</b>');
    leaving.forEach(u => { const d = days(m.today, u.month.leaseEnd); lines.push('• ' + esc(unitName(u)) + ' · ' + (d <= 0 ? 'scade oggi' : 'tra ' + d + (d === 1 ? ' giorno' : ' giorni'))); });
  }
  const broken = m.units.filter(u => u.maintenance && u.maintenance.open.length).sort((a, b) => b.maintenance.urgent - a.maintenance.urgent);
  if (broken.length) {
    lines.push('', '🔧 <b>Manutenzione aperta</b>');
    const PRI = { urgent: 'emergenza', high: 'urgente', medium: 'normale', low: 'non urgente' };
    broken.forEach(u => u.maintenance.open.forEach(x => lines.push('• ' + esc(unitName(u)) + ' · ' + esc(x.title) + ' · ' + PRI[x.priority] + (x.createdAt ? ' · dal ' + x.createdAt.slice(8, 10) + '/' + x.createdAt.slice(5, 7) : ''))));
  }
  const unreg = m.issues.find(i => i.code === 'unregistered');
  if (unreg) {
    const names = unreg.ids.map(id => m.units.find(u => u.id === id)).filter(Boolean).map(unitName);
    lines.push('', '📄 <b>Registrazione da segnare</b> (oltre 30 giorni dalla decorrenza): ' + esc(names.join(', ')));
  }
  const other = m.issues.filter(i => i.code !== 'unregistered').length;
  if (other) lines.push('', '🧰 Da sistemare nel portal: ' + other + (other === 1 ? ' voce' : ' voci') + '.');
  return lines.join('\n');
}

export async function palazzoMessage(query, { now } = {}) {
  const properties = await fsList('properties', { limit: 600 });
  const ctx0 = PALAZZO.context({ properties, now });
  const q = norm(query);
  let list = PALAZZO.buildings(ctx0).filter(b => b.key !== 'x:senza-indirizzo');
  list = q ? list.filter(b => norm(b.label).includes(q)) : list.filter(b => b.units >= MIN_UNITS);
  const keyboard = { inline_keyboard: [[{ text: '🏛 Apri il Palazzo', url: BASE + '/portal#palazzo' }]] };
  if (!list.length) {
    return { msg: q ? 'Nessun palazzo il cui indirizzo contiene «' + esc(query) + '». /palazzo da solo elenca quelli con almeno ' + MIN_UNITS + ' interni.'
      : 'Nessun palazzo con almeno ' + MIN_UNITS + ' interni in archivio: gli interni allo stesso civico diventano un palazzo.', keyboard };
  }
  const shown = list.slice(0, MAX_BUILDINGS);
  const blocks = [];
  for (const b of shown) {
    const ids = b.propertyIds;
    const contracts = await listIn('contracts', 'propertyId', ids, 400);
    const byProp = await listIn('payments', 'propertyId', ids, 1500);
    const byContract = await listIn('payments', 'contractId', contracts.map(c => c.id), 1500);
    const seen = new Set(), payments = [];
    for (const p of [...byProp, ...byContract]) { if (!seen.has(p.id)) { seen.add(p.id); payments.push(p); } }
    // Le proposte fanno di un libero un "in arrivo" (come nella pagina
    // dell'operatore); i profili danno i nomi di proprietaria e inquilini.
    const preAgreements = await listIn('preAgreements', 'propertyId', ids, 200).catch(() => []);
    const userIds = [...new Set([...ids.map(id => (properties.find(p => p.id === id) || {}).ownerId), ...contracts.map(c => c.tenantId)]
      .filter(x => typeof x === 'string' && /^[\w.-]{1,80}$/.test(x)))];
    const uMap = userIds.length ? await fsGetMany(userIds.map(u => 'users/' + u)).catch(() => new Map()) : new Map();
    const users = [...uMap.entries()].filter(([, d]) => d).map(([k, d]) => ({ ...d, id: k.split('/')[1] }));
    const maintenance = await listIn('maintenance', 'propertyId', ids, 400).catch(() => []);
    const ctx = PALAZZO.context({ properties, contracts, payments, users, preAgreements, maintenance, now });
    blocks.push(palazzoSummary(PALAZZO.model(ctx, b.key, ctx.month, { strip: false })));
  }
  const more = list.length - shown.length;
  return { msg: blocks.join('\n\n— — —\n\n') + (more > 0 ? '\n\n…e altri ' + more + ': /palazzo <i>via</i> per uno solo.' : ''), keyboard };
}
