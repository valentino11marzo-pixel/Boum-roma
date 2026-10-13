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
//   • Rinnovi ≤90gg, burocrazia (compliance-rules) scaduta/in scadenza,
//     manutenzioni aperte >48h → daily Telegram digest (decisions, not
//     sendable drafts).
//
// Every run: teamReports doc + teamHealth heartbeat. Quiet day = no message.
// Auth: cron secret / X-Homie-Secret / admin ID token. `?dry=1` = read-only.

import COMPLIANCE from '../../js/compliance-rules.js';
import RENT from '../../js/rent-engine.js';
import CS from '../../js/contract-state.js';
import { rataLink } from '../payments/rata.js';
import { real } from '../_demo.js';
import { knobs, rejectedLine } from '../_squadra.js';
import { readSignTokens } from '../sign/_tokens.js';
import {
  requireCronOrAdmin, fsList, fsListAll, fsListOpenPayments, logActivity, tgNotify, proposeAction,
  reportEmployeeHealth, saveReport, daysUntil, isoWeek, euro, euroFor, esc, propLabel,
} from './_lib.js';

const EMPLOYEE = 'gestore';
const BASE = 'https://www.boomrome.com';
// Un sollecito (email dal portal, link della rata via WhatsApp dal Palazzo)
// mandato negli ultimi N giorni basta: un secondo messaggio la settimana
// stessa, da un altro canale, è il modo più rapido per irritare chi paga.
const RECENT_REMINDER_DAYS = 7;

// Mesi in parole, DETERMINISTICI (mai toLocaleDateString: con l'ICU ridotta
// del runtime 'it-IT' ricade sull'inglese o su "M10").
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthWords(ym, lang) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return '';
  return (lang === 'it' ? MESI : MONTHS)[+m[2] - 1] + ' ' + m[1];
}
export function dayWords(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return +m[3] + ' ' + (lang === 'it' ? MESI : MONTHS)[+m[2] - 1] + ' ' + m[1];
}

// La lingua di chi legge: l'inquilino BOOM è un expat, quindi inglese salvo
// un italiano DICHIARATO (profilo o contratto).
export function tenantLang(tenant, contract) {
  const v = String((tenant && (tenant.language || tenant.lang || tenant.preferredLanguage)) || (contract && (contract.tenantLanguage || contract.language)) || '').toLowerCase();
  return /^it/.test(v) ? 'it' : 'en';
}

// Il sollecito di una rata in ritardo, nella lingua dell'inquilino e con il
// modo di pagare DENTRO (prima: italiano, nessun link — «basta rispondere a
// questa email» a uno studente straniero che non sapeva dove pagare).
export function reminderDraft({ lang, name, what, prop, amount, dueDate, link }) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  if (lang === 'it') {
    return `Ciao ${first},\n\n` +
      `ti scriviamo per ${what} relativo a ${prop}: non ci risulta ancora arrivato l'importo di ${amount}, in scadenza il ${dueDate}.\n\n` +
      (link ? `Puoi pagare da qui in un minuto, con carta o bonifico:\n${link}\n\n` : '') +
      `Se hai già pagato, rispondi pure a questa email e lo verifichiamo. Per qualsiasi difficoltà siamo qui.\n\n` +
      `Grazie,\nIl team BOOM`;
  }
  return `Hi ${first},\n\n` +
    `a quick note about ${what} for ${prop}: we haven't received ${amount} yet (due on ${dueDate}).\n\n` +
    (link ? `You can pay here in a minute, by card or bank transfer:\n${link}\n\n` : '') +
    `If you've already paid, just reply to this email and we'll check. If anything isn't right, tell us — we're here.\n\n` +
    `Thanks,\nThe BOOM team`;
}
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

  // Contratti, immobili e rate APERTE letti fino in fondo (a pagine per
  // nome), mai «i primi N»: oltre 600 rate in archivio la vecchia lettura
  // perdeva i ritardi e i bonifici segnalati del Palazzo (id `pay_c_plz_…`,
  // in fondo all'ordine per nome) che il Palazzo invece mostrava. Il
  // Gestore sollecita solo rate aperte: le pagate non servono.
  const [contractsR, paymentsR, propertiesR, users, maintenance, stateDocs] = await Promise.all([
    fsListAll('contracts'),
    fsListOpenPayments(),
    fsListAll('properties'),
    fsList('users', { limit: 1000 }).catch(() => []),
    fsList('maintenance', { limit: 150 }).catch(() => []),
    fsList('complianceState', { limit: 500 }).catch(() => []),
  ]);
  const contracts = real(contractsR.docs), payments = real(paymentsR.docs), properties = propertiesR.docs;
  const partial = [[contractsR, 'contratti'], [paymentsR, 'rate'], [propertiesR, 'immobili']].filter(([r]) => r.truncated).map(([, n]) => n);
  const propById = {}; properties.forEach(p => { propById[p.id] = p; });
  const userById = {}; users.forEach(u => { userById[u.id] = u; });
  const stateById = {}; stateDocs.forEach(d => { stateById[d.id] = d.items || {}; });
  const contractById = {}; contracts.forEach(c => { contractById[c.id] = c; });

  const liveContract = c => !['expired', 'terminated', 'draft'].includes(c.status);
  const tenantOf = c => userById[c.tenantId || c.tenant || c.tenantUid] || {};

  const proposals = [];
  const digest = [];

  // ── 1. Solleciti pagamento (proposta approvabile) ─────────────────────
  // Lo STATO della rata lo decide BOOM_RENT.paymentState, la stessa lettura
  // del Palazzo e dei Canoni (12/10/2026): prima bastava status != paid, e
  // una rata col bonifico SEGNALATO dall'inquilino (con la ricevuta!)
  // riceveva ogni settimana «risulta ancora da saldare». Ora:
  //   · segnalata  → nessun sollecito, una riga «verifica l'incasso»;
  //   · in corso   → (carta/SEPA in volo) niente;
  //   · prima della gestione BOOM (property.gestioneDal) → non è un arretrato;
  //   · già sollecitata negli ultimi giorni (lastReminderDate/dunningHistory,
  //     anche il link mandato dal Palazzo) → niente doppione;
  //   · presa in carico dal Palazzo o senza account → nessuna email: il
  //     Palazzo ha il suo «Sollecita» col link della rata (WhatsApp), e il
  //     digest porta quel link pronto;
  //   · gli altri → email nella lingua dell'inquilino col modo di pagare.
  let skippedRecent = 0;
  for (const p of payments) {
    const c = contractById[p.contractId] || {};
    const property = propById[p.propertyId || c.propertyId] || null;
    const prop = propLabel(propById, p.propertyId ? p : c);
    // Prima della gestione BOOM: la RATA intera (una trimestrale che arriva
    // dentro la gestione è un arretrato vero, come nel Palazzo).
    if (CS.paymentBeforeGestione(p, property)) continue;
    const state = RENT.paymentState(p, now);
    if (state === 'reported') {
      const when = String(p.tenantReportDate || '').slice(0, 10);
      digest.push(`💶 ${prop} — ${euro(p.amount)} bonifico segnalato${when ? ' il ' + when : ''}${p.tenantReportProofUrl || p.proofUrl ? ' (ricevuta allegata)' : ''}: verifica l'incasso e premi Registra incasso`);
      continue;
    }
    if (state !== 'overdue') continue;
    const d = daysUntil(p.dueDate, now.getTime());
    if (d == null || -d < k.lateAfterDays) continue;
    const late = -d;
    if (CS.recentReminder(p, now, RECENT_REMINDER_DAYS)) { skippedRecent++; continue; }
    const tenant = tenantOf(c);
    const lang = tenantLang(tenant, c);
    // month is 'YYYY-MM' for rent installments; deposit docs carry labels
    // like 'saldo deposito' — never feed those to Date (→ 'Invalid Date').
    const mIt = monthWords(p.month, 'it') || (p.month || 'in corso');
    const mLang = monthWords(p.month, lang) || (p.month || (lang === 'it' ? 'in corso' : 'this period'));
    const link = rataLink(p.id);
    if (CS.isImported(c)) {
      // Palazzo preso in carico: nessun account BOOM, il rapporto lo tiene
      // l'operatore col Palazzo (WhatsApp col link della rata). Al telefono
      // dell'operatore arriva il link pronto, nessuna email a nome BOOM.
      digest.push(`💸 ${prop} — ${euro(p.amount)} in ritardo ${late}gg (${mIt}) · manda il link della rata dal Palazzo${link ? ': ' + link : ''}`);
      continue;
    }
    const to = tenant.email || c.tenantEmail || null;
    const name = tenant.name || c.tenantName || '';
    if (!to) {
      digest.push(`💸 ${prop} — ${euro(p.amount)} in ritardo ${late}gg (nessuna email inquilino)${link ? ' · link della rata da mandare su WhatsApp: ' + link : ''}`);
      continue;
    }
    const what = lang === 'it'
      ? (p.type === 'deposit-balance' ? 'il saldo del deposito cauzionale'
        : (p.installmentMonths > 1 ? `la rata di canone ${p.installmentMonths}-mensile (${mLang})` : `il canone di ${mLang}`))
      : (p.type === 'deposit-balance' ? 'the deposit balance'
        : (p.installmentMonths > 1 ? `the ${p.installmentMonths}-month rent instalment (${mLang})` : `the rent for ${mLang}`));
    // Chi ha un account paga dalla sua casa (/casa); il link della rata
    // vale per tutti gli altri, senza login.
    const payUrl = c.tenantId ? `${BASE}/casa` : link;
    // L'importo nella lingua dell'inquilino (€1,600 in inglese, €1.600 in
    // italiano): il riassunto e l'oggetto per l'operatore restano italiani.
    const draft = reminderDraft({ lang, name, what, prop, amount: euroFor(p.amount, lang), dueDate: dayWords(p.dueDate, lang) || p.dueDate, link: payUrl });
    const r = await maybePropose(dry, {
      leadId: `payment-${p.id}`,
      kind: 'reply',
      summary: `Sollecito canone ${mIt} · ${prop} · ${euro(p.amount)} (${late}gg di ritardo)`,
      confidence: 0.85,
      proposedBy: 'gestore',
      payload: {
        channel: 'email', recipient: to, to, lang, draft,
        subject: lang === 'it' ? `BOOM · Promemoria canone ${mIt} — ${prop}` : `BOOM · Rent reminder ${mLang} — ${prop}`,
      },
      contextHash: `gestore:payrem:${p.id}:${week}`,
    });
    if (r) proposals.push({ type: 'sollecito', ref: p.id, prop, dedupHit: r.dedupHit });
  }

  // ── 2. Firme mancanti (nudge col link Magic Sign) ─────────────────────
  for (const c of contracts) {
    if (!liveContract(c)) continue;
    // Firmato su carta, segnaposto (contratto non in archivio) o già
    // completo: non c'è nessuna firma digitale da raccogliere. Un token
    // coniato per sbaglio (un tap su «Firma ora») NON deve far partire un
    // sollecito settimanale su un atto già concluso a penna.
    if (CS.notSignable(c)) continue;
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
    try { obligations = COMPLIANCE.obligationsFor(c, { tenant: tenantOf(c), today: now, property: propById[c.propertyId] }); } catch { continue; }
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

  // Un tetto di sicurezza scattato non è «tutto l'archivio»: si DICE.
  if (partial.length) digest.unshift(`⚠️ archivio letto in parte: ${partial.join(', ')} — solleciti e ritardi qui sotto possono non essere tutti`);

  const fresh = proposals.filter(p => !p.dedupHit);
  const counts = {
    proposals: fresh.length,
    proposalsSkippedDedup: proposals.length - fresh.length,
    remindersSkippedRecent: skippedRecent,
    digestItems: digest.length,
    archivePartial: partial.length,
  };
  const summary = [`${fresh.length} proposte in coda (solleciti/firme) · ${digest.length} punti d'attenzione`, rejectedLine(rejected)].filter(Boolean).join(' — ');

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

  const report = { summary, counts, proposals: proposals.slice(0, 20), digest: digest.slice(0, 30), partial, notified };
  if (!dry) {
    await saveReport(EMPLOYEE, report);
    await logActivity('Gestore: run completato', 'employee', counts, EMPLOYEE);
  }
  return { counts, summary, report };
}

async function maybePropose(dry, action) {
  if (dry) return { id: null, dedupHit: false, dry: true };
  return proposeAction(action);
}
