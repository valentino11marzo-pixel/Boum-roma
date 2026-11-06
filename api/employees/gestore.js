// api/employees/gestore.js — IL GESTORE (cron giornaliero)
//
// The property-manager employee. It doesn't just detect problems (risk.scan
// already does that on demand) — it PREPARES the fix and queues it for a
// one-tap approval:
//
//   • Canone in ritardo ≥3gg  → drafts the polite reminder email to the
//     tenant and proposes it in action_queue (Tier 2). The existing
//     Telegram loop pings the operator with Approva/Rifiuta; approving
//     sends via agent/messages.send. Re-proposes at most once a week
//     while unpaid (contextHash per ISO-week).
//   • Firma mancante ≥3gg     → drafts the nudge to the missing signer
//     with their personal Magic-Sign link (/sign?sign=<token>).
//   • Provvigione (fattura `prov_<paId>`, dovuta all'ingresso) scaduta da
//     ≥3gg e ancora pagabile → sollecito col link di pagamento stabile,
//     stessa coda e stesso ritmo settimanale dei canoni. Ingresso entro 10gg
//     con provvigione all'ingresso e NESSUN link preparato → riga nel digest
//     (la fattura la emette l'operatore dal 💶 della console, mai il Gestore).
//   • Rinnovi ≤90gg, burocrazia (compliance-rules) scaduta/in scadenza,
//     manutenzioni aperte >48h → daily Telegram digest (decisions, not
//     sendable drafts).
//
// Every run: teamReports doc + teamHealth heartbeat. Quiet day = no message.
// Auth: cron secret / X-Homie-Secret / admin ID token. `?dry=1` = read-only.

import COMPLIANCE from '../../js/compliance-rules.js';
import { real } from '../_demo.js';
import { knobs, rejectedLine } from '../_squadra.js';
import { readSignTokens } from '../sign/_tokens.js';
import RENT from '../../js/rent-engine.js';
import { payLink } from '../payments/_token.js';
import { feeOf, feeBlock, feeInvoiceId } from '../preagreement/_fee.js';
import {
  requireCronOrAdmin, fsList, fsGet, logActivity, tgNotify, proposeAction,
  reportEmployeeHealth, saveReport, daysUntil, isoWeek, euro, esc, propLabel,
} from './_lib.js';

const EMPLOYEE = 'gestore';
const BASE = 'https://www.boomrome.com';
// Le tre soglie del Gestore non sono più costanti qui: vivono su
// `settings/squadra` e si cambiano dalla scrivania (portale → La Squadra),
// con default e intervalli ammessi dichiarati in js/squadra-registry.js —
// lo stesso file che legge la console, così non possono divergere.
// Cambiare "sollecita dopo 5 giorni invece di 3" non richiede più un deploy.

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[gestore]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry }) {
  // Le soglie in vigore, non quelle di quando il file fu scritto.
  const { k, rejected } = await knobs(EMPLOYEE);
  const now = new Date();
  const week = isoWeek(now);

  const [contracts, payments, properties, users, maintenance, stateDocs] = await Promise.all([
    fsList('contracts', { limit: 300 }).then(real),
    fsList('payments', { limit: 600 }).then(real),
    fsList('properties', { limit: 200 }),
    fsList('users', { limit: 1000 }).catch(() => []),
    fsList('maintenance', { limit: 150 }).catch(() => []),
    fsList('complianceState', { limit: 500 }).catch(() => []),
  ]);
  // Le provvigioni aperte: una lettura che fallisce non ferma il giro.
  const fees = await fsList('invoices', { filter: { field: 'status', op: 'EQUAL', value: 'pending' }, limit: 300 })
    .then(real).then(rows => (rows || []).filter(x => x && /^prov_/.test(String(x.id || ''))))
    .catch(e => { console.warn('[gestore] fees:', e.message); return []; });
  const propById = {}; properties.forEach(p => { propById[p.id] = p; });
  const userById = {}; users.forEach(u => { userById[u.id] = u; });
  const stateById = {}; stateDocs.forEach(d => { stateById[d.id] = d.items || {}; });
  const contractById = {}; contracts.forEach(c => { contractById[c.id] = c; });

  const liveContract = c => !['expired', 'terminated', 'draft'].includes(c.status);
  const tenantOf = c => userById[c.tenantId || c.tenant || c.tenantUid] || {};

  const proposals = [];
  const digest = [];

  // ── 1. Solleciti pagamento (proposta approvabile) ─────────────────────
  for (const p of payments) {
    if (['paid', 'cancelled'].includes(p.status)) continue;
    const d = daysUntil(p.dueDate, now.getTime());
    if (d == null || -d < k.lateAfterDays) continue;
    const late = -d;
    const c = contractById[p.contractId] || {};
    const tenant = tenantOf(c);
    const to = tenant.email || c.tenantEmail || null;
    const name = tenant.name || c.tenantName || '';
    const prop = propLabel(propById, p.propertyId ? p : c);
    if (!to) {
      digest.push(`💸 ${prop} — ${euro(p.amount)} in ritardo ${late}gg (nessuna email inquilino)`);
      continue;
    }
    // month is 'YYYY-MM' for rent installments; deposit docs carry labels
    // like 'saldo deposito' — never feed those to Date (→ 'Invalid Date').
    const monthLabel = /^\d{4}-\d{2}$/.test(String(p.month || ''))
      ? new Date(p.month + '-01T00:00:00Z').toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : (p.month || 'in corso');
    const what = p.type === 'deposit-balance' ? 'il saldo del deposito cauzionale'
      : (p.installmentMonths > 1 ? `la rata di canone ${p.installmentMonths}-mensile (${monthLabel})` : `il canone di ${monthLabel}`);
    const draft =
      `Ciao ${name || ''},\n\n` +
      `ti scriviamo per ${what} relativo a ${prop}: risulta ancora da saldare l'importo di ${euro(p.amount)}, in scadenza il ${p.dueDate}.\n\n` +
      `Se il pagamento è già partito, ignora pure questo messaggio. In caso contrario ti chiediamo di provvedere nei prossimi giorni; per qualsiasi difficoltà siamo qui — basta rispondere a questa email.\n\n` +
      `Grazie,\nIl team BOOM`;
    const r = await maybePropose(dry, {
      leadId: `payment-${p.id}`,
      kind: 'reply',
      summary: `Sollecito canone ${monthLabel} · ${prop} · ${euro(p.amount)} (${late}gg di ritardo)`,
      confidence: 0.85,
      proposedBy: 'gestore',
      payload: { channel: 'email', recipient: to, to, subject: `BOOM · Promemoria canone ${monthLabel} — ${prop}`, draft },
      contextHash: `gestore:payrem:${p.id}:${week}`,
    });
    if (r) proposals.push({ type: 'sollecito', ref: p.id, prop, dedupHit: r.dedupHit });
  }

  // ── 1b. La provvigione dovuta all'ingresso ────────────────────────────
  // Solo finché è pagabile (pagata, in corso o segnalata dal cliente =
  // silenzio). Categoria `gestore:feerem`: la scala della fiducia non la
  // conosce, quindi non parte MAI da sola — sempre il tuo ✅.
  for (const inv of fees) {
    const s = feeReminderDraft(inv, { now, k, contractById, propById, tenantOf });
    if (!s) continue;
    if (!s.to) { digest.push(`💶 ${s.prop} — provvigione ${euro(s.amount)} scaduta da ${s.late}gg (nessuna email inquilino)`); continue; }
    const r = await maybePropose(dry, {
      leadId: `invoice-${inv.id}`,
      kind: 'reply',
      summary: `Sollecito provvigione · ${s.prop} · ${euro(s.amount)} (scaduta da ${s.late}gg)`,
      confidence: 0.85,
      proposedBy: 'gestore',
      payload: { channel: 'email', recipient: s.to, to: s.to, subject: s.subject, draft: s.draft },
      contextHash: `gestore:feerem:${inv.id}:${week}`,
    });
    if (r) proposals.push({ type: 'provvigione', ref: inv.id, prop: s.prop, dedupHit: r.dedupHit });
  }
  // Ingresso vicino, provvigione all'ingresso, link mai preparato: lo dice.
  for (const c of contracts) {
    if (!liveContract(c)) continue;
    const d = daysUntil(c.startDate, now.getTime());
    if (d == null || d < 0 || d > 10) continue;
    const paId = c.preAgreementId || (String(c.id).startsWith('pa_') ? String(c.id).slice(3) : '');
    if (!paId) continue;
    try {
      if (await fsGet('invoices/' + feeInvoiceId(paId))) continue;
      const pa = await fsGet('preAgreements/' + paId);
      const fee = pa && feeOf(pa);
      if (!fee || feeBlock(pa, fee) || fee.due !== 'move-in') continue;
      digest.push(`💶 ${propLabel(propById, c)} — ingresso tra ${d}gg: provvigione ${euro(fee.totalEur)} senza link (console proposte → 💶 Link provvigione)`);
    } catch (e) { console.warn('[gestore] fee check', c.id, e.message); }
  }

  // ── 2. Firme mancanti (nudge col link Magic Sign) ─────────────────────
  for (const c of contracts) {
    if (!liveContract(c)) continue;
    const created = Date.parse(c.createdAt || c.startDate || 0);
    if (created && (now - created) < k.unsignedAfterDays * 86400000) continue;
    if (c.tenantSignature && c.landlordSignature) continue;
    // Il link di firma dal deposito dei token (signTokens, admin-only): il
    // contratto non lo porta più. Solo chi HA già un link riceve il
    // sollecito — qui non si conia nulla (decidere di avviare la firma
    // digitale resta un gesto dell'operatore).
    const toks = await readSignTokens(c.id, c).catch(() => ({}));
    const targets = [];
    if (!c.tenantSignature && toks.tenant) {
      const t = tenantOf(c);
      targets.push({ role: 'inquilino', to: t.email || c.tenantEmail, name: t.name || c.tenantName, token: toks.tenant });
    }
    if (!c.landlordSignature && toks.landlord) {
      const l = userById[c.landlordId] || {};
      targets.push({ role: 'proprietario', to: c.landlordEmail || l.email, name: c.landlordName || l.name, token: toks.landlord });
    }
    for (const t of targets) {
      const prop = propLabel(propById, c);
      if (!t.to) { digest.push(`✍️ ${prop} — firma ${t.role} mancante (nessuna email)`); continue; }
      const link = `${BASE}/sign?sign=${encodeURIComponent(t.token)}`;
      const draft =
        `Ciao ${t.name || ''},\n\n` +
        `il contratto per ${prop} è pronto e manca solo la tua firma. Puoi firmare in un paio di minuti, anche dal telefono, da questo link personale:\n\n${link}\n\n` +
        `Se hai domande sul contratto rispondi pure a questa email.\n\nGrazie,\nIl team BOOM`;
      const r = await maybePropose(dry, {
        leadId: `contract-${c.id}`,
        kind: 'reply',
        summary: `Sollecito firma ${t.role} · ${prop}`,
        confidence: 0.85,
        proposedBy: 'gestore',
        payload: { channel: 'email', recipient: t.to, to: t.to, subject: `BOOM · Manca la tua firma — ${prop}`, draft },
        contextHash: `gestore:sign:${c.id}:${t.role}:${week}`,
      });
      if (r) proposals.push({ type: 'firma', ref: c.id, prop, role: t.role, dedupHit: r.dedupHit });
    }
  }

  // ── 3. Digest: rinnovi, burocrazia, manutenzioni ──────────────────────
  for (const c of contracts) {
    if (!liveContract(c)) continue;
    const d = daysUntil(c.endDate, now.getTime());
    if (d != null && d >= 0 && d <= k.renewalHorizonDays) {
      digest.push(`🔄 ${propLabel(propById, c)} — contratto scade tra ${d}gg: decidere rinnovo/ricollocamento`);
    } else if (d != null && d < 0) {
      digest.push(`🔴 ${propLabel(propById, c)} — contratto SCADUTO da ${Math.abs(d)}gg`);
    }
  }
  for (const c of contracts) {
    if (!liveContract(c)) continue;
    let obligations;
    try { obligations = COMPLIANCE.obligationsFor(c, { tenant: tenantOf(c), today: now }); } catch { continue; }
    for (const it of obligations) {
      const st = COMPLIANCE.statusOf(it, stateById[c.id] || {}, now, 14);
      if (st === 'overdue') digest.push(`🏛️ ${propLabel(propById, c)} — ${it.label} SCADUTA`);
      else if (st === 'due_soon') digest.push(`🏛️ ${propLabel(propById, c)} — ${it.label} in scadenza`);
    }
  }
  for (const m of maintenance) {
    if (!['open', 'new', 'pending'].includes(m.status)) continue;
    const created = Date.parse(m.createdAt || 0);
    if (created && (now - created) > 48 * 3600 * 1000) {
      digest.push(`🔧 ${propLabel(propById, m)} — manutenzione aperta da ${Math.round((now - created) / 86400000)}gg: ${String(m.title || m.description || '').slice(0, 60)}`);
    }
  }

  const fresh = proposals.filter(p => !p.dedupHit);
  const counts = {
    proposals: fresh.length,
    proposalsSkippedDedup: proposals.length - fresh.length,
    digestItems: digest.length,
  };
  const summary = [`${fresh.length} proposte in coda (solleciti/firme/provvigioni) · ${digest.length} punti d'attenzione`, rejectedLine(rejected)].filter(Boolean).join(' — ');

  // Telegram digest — the proposals themselves already arrive as approvable
  // cards via notify-pending; here we only summarize + list watch items.
  let notified = false;
  if (!dry && (fresh.length || digest.length)) {
    const lines = [`🏢 <b>Gestore — rapporto</b>`];
    if (fresh.length) lines.push(`📨 ${fresh.length} bozze pronte in coda approvazione (arrivano qui sotto)`);
    digest.slice(0, 12).forEach(l => lines.push(esc(l)));
    if (digest.length > 12) lines.push(`… e altri ${digest.length - 12} punti — https://boomrome.com/team`);
    notified = await tgNotify(lines.join('\n'));
  }

  const report = { summary, counts, proposals: proposals.slice(0, 20), digest: digest.slice(0, 30), notified };
  if (!dry) {
    await saveReport(EMPLOYEE, report);
    await logActivity('Gestore: run completato', 'employee', counts, EMPLOYEE);
  }
  return { counts, summary, report };
}

// Il sollecito della provvigione, puro (si testa senza Firestore). In
// inglese, come il messaggio del 💶 della console: il cliente è un expat.
export function feeReminderDraft(inv, { now, k, contractById = {}, propById = {}, tenantOf = () => ({}) }) {
  if (!inv || !/^prov_/.test(String(inv.id || ''))) return null;
  if (RENT.paymentBlockReason(inv, 'invoice') || inv.tenantReported === true) return null;
  const amount = Math.round(Number(inv.amount) * 100) / 100;
  if (!(amount > 0)) return null;
  const d = daysUntil(inv.dueDate, (now instanceof Date ? now : new Date(now)).getTime());
  if (d == null || -d < k.lateAfterDays) return null;
  const c = contractById[inv.contractId] || {};
  const tenant = tenantOf(c) || {};
  const to = inv.recipientEmail || tenant.email || c.tenantEmail || null;
  const name = String(inv.recipientName || tenant.name || c.tenantName || '').trim().split(/\s+/)[0];
  const prop = propLabel(propById, inv.propertyId ? inv : c);
  const due = String(inv.dueDate).slice(0, 10);
  const eurEn = '€' + amount.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 });
  const url = payLink('inv', inv.id);
  const draft =
    `Hi${name ? ' ' + name : ''},\n\n` +
    `The BOOM agency fee agreed in your proposal${inv.preAgreementRef ? ' ' + inv.preAgreementRef : ''} for ${prop} — ${eurEn}, VAT included — was due on ${due} and is still open.\n\n` +
    `You can pay it by card here (the receipt arrives by email automatically):\n${url}\n\n` +
    `If you have already paid, just ignore this message. Any question — simply reply.\n\n` +
    `Thank you,\nThe BOOM team`;
  return { to, prop, amount, late: -d, url, subject: `BOOM · Agency fee — ${prop}`, draft };
}

async function maybePropose(dry, action) {
  if (dry) return { id: null, dedupHit: false, dry: true };
  return proposeAction(action);
}
