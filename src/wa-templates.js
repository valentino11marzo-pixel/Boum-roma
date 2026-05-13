// src/wa-templates.js
// Single source of truth for WhatsApp messages dispatched via the
// `whatsappQueue` Firestore collection. Server-side code (Vercel
// functions, portal admin actions, cron) writes a queue document; the
// Mac Mini drainer (`wa_queue_drain.py`) polls and sends via wacli.
//
// CONVENTIONS (Master Sprint 2026-05-02 — registry-only in Phase 1):
//
// 1. Italian JID format: '+39NNNNNNNNNN@s.whatsapp.net'. The helper
//    `toJID(phone)` normalises a raw phone string to this form.
//
// 2. Each entry has:
//      - templateKey: stable string used as `whatsappQueue.template`
//      - purpose: human-readable
//      - legacyMigrationTarget: { file, line, fnName, plannedPhase } or null
//      - bodyBuilder(ctx): pure fn returning the final message text
//        (variables already substituted; the queue stores both the
//        rendered body in `variables.body` AND the raw key for audit).
//      - priority: 'low' | 'normal' | 'high' — default queue ordering.
//
// 3. Tenant/landlord pass-delivery messages already exist in
//    portal.html via `buildBoomWaLink` (line 12769). Per founder
//    directive 2026-05-03, that helper STAYS where it is and is
//    referenced as legacy in this registry. Phase 6.A may split it
//    into 4 dedicated builders if still useful then.
//
// 4. Queue document shape (consumed by wa_queue_drain.py):
//      {
//        to:            '+393313251961@s.whatsapp.net',
//        template:      'ticketLandlordCreated',  // = templateKey
//        variables:     { body: '...rendered...', ...originalCtxKeys },
//        scheduledAt:   timestamp,
//        priority:      'normal',
//        status:        'pending',
//        attempts:      0,
//        createdAt:     serverTimestamp,
//        createdBy:     'tickets'
//      }
//
// Last updated: 2026-05-03 (Phase 1 of Master Sprint 2026-05-02).

const ADMIN_PHONE_E164 = '+393313251961';

const firstName = (full) => ((full || '').toString().split(' ')[0] || '');
const fmtEur = (n) => {
  const v = Number(n || 0);
  return '€' + (Math.round(v * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 });
};
const fmtDateIT = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long' });
  } catch { return String(iso); }
};

// Normalize an Italian phone number to wacli JID format.
// Accepts: '+39 331 325 1961', '3313251961', '+393313251961', etc.
// Returns: '+393313251961@s.whatsapp.net' or null if invalid.
export function toJID(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/[^0-9+]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  if (!digits.startsWith('+')) {
    // Heuristic: bare 9-10 digit number → assume Italian
    if (/^\d{9,10}$/.test(digits)) digits = '+39' + digits;
    else return null;
  }
  if (!/^\+\d{10,15}$/.test(digits)) return null;
  return digits + '@s.whatsapp.net';
}

// ---------------------------------------------------------------------------
// REGISTRY
// ---------------------------------------------------------------------------

export const WA_TEMPLATES = {

  // ── LEGACY — pass-delivery messages live in portal.html ────────────────────

  passDeliveryGeneric: {
    templateKey: 'passDeliveryGeneric',
    purpose: 'Apple Wallet pass delivery to tenant/landlord/viewing/referral — type-aware',
    legacyMigrationTarget: { file: 'portal.html', line: 12769, fnName: 'buildBoomWaLink', plannedPhase: '6.A (split into 4 dedicated builders if still useful)' },
    priority: 'normal',
    bodyBuilder: null, // see legacyMigrationTarget
  },

  // ── NEW — Phase 3 (Tickets) ────────────────────────────────────────────────

  ticketLandlordCreated: {
    templateKey: 'ticketLandlordCreated',
    purpose: 'New ticket on your property — to landlord',
    legacyMigrationTarget: null,
    priority: 'high',
    bodyBuilder: (ctx) => {
      const sev = (ctx.severity || 'medium').toUpperCase();
      const link = ctx.landlordMagicLink || 'https://www.boomrome.com/portal.html';
      return [
        `🛠 BOOM — Nuovo ticket [${sev}]`,
        '',
        `Proprietà: ${ctx.propertyAddress || ctx.propertyName || ''}`,
        `Inquilino: ${ctx.tenantName || ''}`,
        `Categoria: ${ctx.category || '—'}`,
        `Titolo: ${ctx.title || ''}`,
        '',
        ctx.description ? `«${(ctx.description || '').slice(0, 220)}${ctx.description.length > 220 ? '…' : ''}»` : '',
        '',
        `Apri ticket: ${link}`,
      ].filter(Boolean).join('\n');
    },
  },

  ticketTenantStatusUpdate: {
    templateKey: 'ticketTenantStatusUpdate',
    purpose: 'Status change notification to ticket opener',
    legacyMigrationTarget: null,
    priority: 'normal',
    bodyBuilder: (ctx) => {
      const link = ctx.tenantMagicLink || 'https://www.boomrome.com/portal.html';
      const headline = ctx.newStatus === 'resolved'
        ? '✅ Ticket risolto'
        : ctx.newStatus === 'assigned'
          ? `🛠 Ticket assegnato a ${ctx.vendorName || 'un tecnico'}`
          : `🔧 Ticket aggiornato: ${ctx.newStatus}`;
      return [
        `${headline} — BOOM`,
        '',
        `Riferimento: ${ctx.title || ctx.ticketId || ''}`,
        ctx.vendorEta ? `ETA tecnico: ${fmtDateIT(ctx.vendorEta)}` : '',
        ctx.note ? `Note: ${ctx.note}` : '',
        '',
        `Dettagli: ${link}`,
      ].filter(Boolean).join('\n');
    },
  },

  ticketAdminCreated: {
    templateKey: 'ticketAdminCreated',
    purpose: 'New ticket — admin alert',
    legacyMigrationTarget: null,
    priority: 'high',
    bodyBuilder: (ctx) => {
      const sev = (ctx.severity || 'medium').toUpperCase();
      return [
        `🛠 BOOM admin — nuovo ticket [${sev}]`,
        '',
        `Cliente: ${ctx.tenantName || ''} · ${ctx.tenantPhone || ''}`,
        `Proprietà: ${ctx.propertyAddress || ctx.propertyName || ''}`,
        `Categoria: ${ctx.category || '—'}`,
        `«${(ctx.title || '').slice(0, 120)}»`,
        '',
        `Portal: https://www.boomrome.com/portal.html#/tickets/${ctx.ticketId || ''}`,
      ].join('\n');
    },
  },

  // ── NEW — Phase 4 (Rent Payments) ──────────────────────────────────────────

  paymentReminder5d: {
    templateKey: 'paymentReminder5d',
    purpose: 'T-5 days rent reminder to tenant',
    legacyMigrationTarget: null,
    priority: 'normal',
    bodyBuilder: (ctx) => [
      `📅 BOOM — Affitto in scadenza tra 5 giorni`,
      '',
      `Importo: ${fmtEur(ctx.amount)}`,
      `Scadenza: ${fmtDateIT(ctx.dueDate)}`,
      `IBAN: ${ctx.iban || ''}`,
      `Causale: Affitto ${ctx.period || ''} — ${ctx.propertyName || ''}`,
      '',
      `Portal: ${ctx.tenantMagicLink || 'https://www.boomrome.com/portal.html'}`,
    ].join('\n'),
  },

  paymentOverdue3d: {
    templateKey: 'paymentOverdue3d',
    purpose: 'T+3 overdue rent notice to tenant',
    legacyMigrationTarget: null,
    priority: 'high',
    bodyBuilder: (ctx) => [
      `⚠️ BOOM — Affitto scaduto da 3 giorni`,
      '',
      `${ctx.propertyName || ''} — ${fmtEur(ctx.amount)} non risulta ancora ricevuto.`,
      `Era scaduto il ${fmtDateIT(ctx.dueDate)}.`,
      '',
      'Se hai già pagato, rispondi a questo messaggio per verificare.',
      'Altrimenti effettua il bonifico oggi per evitare un ulteriore sollecito.',
      '',
      `IBAN: ${ctx.iban || ''}`,
      `Contatto: Valentino — +39 331 325 1961`,
    ].join('\n'),
  },

  paymentAdminEscalation7d: {
    templateKey: 'paymentAdminEscalation7d',
    purpose: 'T+7 admin escalation alert',
    legacyMigrationTarget: null,
    priority: 'high',
    bodyBuilder: (ctx) => [
      `🚨 BOOM admin — escalation pagamento`,
      '',
      `${ctx.tenantName || ''} (${ctx.tenantPhone || ''})`,
      `${ctx.propertyName || ctx.propertyAddress || ''}`,
      `${fmtEur(ctx.amount)} · scaduto il ${fmtDateIT(ctx.dueDate)}`,
      `Periodo: ${ctx.period || ''}`,
      '',
      `Portal: https://www.boomrome.com/portal.html#/payments/${ctx.paymentId || ''}`,
    ].join('\n'),
  },
};

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default WA_TEMPLATES;

// Convenience: build a full queue document ready to be inserted into
// `whatsappQueue`. Throws if templateKey unknown OR legacy.
export function buildWaQueueDoc(templateKey, ctx, opts = {}) {
  const entry = WA_TEMPLATES[templateKey];
  if (!entry) throw new Error(`[wa-templates] Unknown templateKey: ${templateKey}`);
  if (typeof entry.bodyBuilder !== 'function') {
    const t = entry.legacyMigrationTarget;
    throw new Error(
      `[wa-templates] '${templateKey}' is legacy (no bodyBuilder yet). ` +
      `Call-site lives at ${t ? `${t.file}:${t.line} (${t.fnName})` : 'unknown'} — ` +
      `migrate in Phase ${t ? t.plannedPhase : '?'}.`
    );
  }
  const to = opts.toJid || toJID(opts.toPhone || ctx.toPhone);
  if (!to) throw new Error(`[wa-templates] Invalid recipient phone for '${templateKey}'`);
  return {
    to,
    template: templateKey,
    variables: { body: entry.bodyBuilder(ctx), ...ctx },
    scheduledAt: opts.scheduledAt || new Date().toISOString(),
    priority: opts.priority || entry.priority || 'normal',
    status: 'pending',
    attempts: 0,
    createdBy: opts.createdBy || 'unknown',
  };
}
