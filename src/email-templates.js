// src/email-templates.js
// Single source of truth for transactional emails sent by BOOM.
//
// CONVENTIONS (Master Sprint 2026-05-02 — registry-only in Phase 1):
//
// 1. EmailJS plan stays free tier (2-template limit). All NEW emails reuse
//    'boom_notification' parametrized via the rich `template_params` schema
//    (heading / subheading / card_title / card_color / r1..r4_icon|label|value /
//    closing / cta_text / portal_link / attachment_url). Existing
//    'boom_signature_request' is the only other template ID and stays for
//    Magic Sign emails (legacy).
//
// 2. Each entry has `legacyMigrationTarget` set to either:
//      - { file, line, fnName, plannedPhase } when there's an existing
//        call-site in portal.html or api/* that this entry documents.
//        Phase 6.A migrates the call-site to import this builder.
//      - null when this entry is NEW (Phase 3 tickets / Phase 4 payments)
//        and the call-site doesn't exist yet — the builder IS the spec.
//
// 3. paramsBuilder(ctx) is a PURE FUNCTION returning the EmailJS
//    template_params object. No I/O, no Firebase, no DOM. Pure shaping.
//
// 4. For LEGACY entries the paramsBuilder is intentionally stub-shaped or
//    omitted — the canonical params live at the call-site referenced by
//    legacyMigrationTarget. Phase 6.A inlines the params here as part of
//    the migration. Use grep on legacyMigrationTarget for the migration
//    inventory (`grep "plannedPhase: '6.A'" src/email-templates.js`).
//
// 5. For NEW entries the paramsBuilder is fully implemented and ready to be
//    imported by Phase 3 / Phase 4 call-sites in portal.html or api/*.
//
// Last updated: 2026-05-03 (Phase 1 of Master Sprint 2026-05-02).

const EMAILJS_TEMPLATE_NOTIFICATION = 'boom_notification';
const EMAILJS_TEMPLATE_SIGNATURE_REQUEST = 'boom_signature_request';

const ADMIN_EMAIL = 'valentino@boom-rome.com';
const FROM_NAME_BOOM = 'BOOM Rome';
const PORTAL_LINK_DEFAULT = 'https://www.boomrome.com/portal.html';

// Helpers shared by builders. Keep small and pure.
const firstName = (full) => ((full || '').toString().split(' ')[0] || '');
const fmtEur = (n) => {
  const v = Number(n || 0);
  return '€' + (Math.round(v * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 });
};
const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(iso); }
};

// ---------------------------------------------------------------------------
// REGISTRY
// ---------------------------------------------------------------------------

export const EMAIL_TEMPLATES = {

  // ── LEGACY (call-sites unchanged in Phase 1; migrated in Phase 6.A) ────────

  signatureRequest: {
    templateId: EMAILJS_TEMPLATE_SIGNATURE_REQUEST,
    purpose: 'Magic Sign — invio link firma a tenant o landlord',
    legacyMigrationTarget: { file: 'portal.html', line: 13389, fnName: 'sendSignatureEmail', plannedPhase: '6.A' },
    paramsBuilder: null, // see legacyMigrationTarget
  },

  welcomeTenantWithMagicLink: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Post-firma — magic link tenant + Apple Wallet pass URL',
    legacyMigrationTarget: { file: 'portal.html', line: 13466, fnName: 'sendTenantWelcomeWithMagicLink', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  welcomeLandlordWithPass: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Post-firma — pass URL embedded in landlord welcome',
    legacyMigrationTarget: { file: 'portal.html', line: 12741, fnName: 'sendLandlordWelcomeWithPass', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  welcomeContractActivated: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Tenant welcome quando il contratto si attiva (manual finalize path, alternativa a sendTenantWelcomeWithMagicLink)',
    legacyMigrationTarget: { file: 'portal.html', line: 13556, fnName: 'sendWelcomeEmail', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  viewingConfirmedClient: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Conferma viewing al cliente con pass + ICS calendar links',
    legacyMigrationTarget: { file: 'portal.html', line: 12701, fnName: 'sendClientViewingConfirmation', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  viewingAdminNotification: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Notifica admin per ogni cambio stato viewing (created/confirmed/rescheduled/cancelled/completed)',
    legacyMigrationTarget: { file: 'portal.html', line: 12786, fnName: 'sendAdminViewingNotification', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  viewingCreatedAdminNotify: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Notifica admin quando book.html crea una viewing request (server-side)',
    legacyMigrationTarget: { file: 'api/notify-viewing-created.js', line: 44, fnName: 'handler', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  cafRegistration: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Richiesta CAF di registrazione/asseverazione contratto',
    legacyMigrationTarget: { file: 'portal.html', line: 13345, fnName: 'sendCAFEmail', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  pfsClientPaid: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'PFS — conferma pagamento al cliente con timeline 4-step',
    legacyMigrationTarget: { file: 'api/stripe-webhook.js', line: 138, fnName: 'sendEmailJS (client block)', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  pfsAdminPaid: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'PFS — notifica admin con dettagli del cliente pagato',
    legacyMigrationTarget: { file: 'api/stripe-webhook.js', line: 166, fnName: 'sendEmailJS (admin block)', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  paymentReminderLegacy: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Pre-Phase-4 payment reminder helper (likely unused once Phase 4 lands; verify in Phase 6.A and prune)',
    legacyMigrationTarget: { file: 'portal.html', line: 13628, fnName: 'sendPaymentReminderEmail', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  paymentConfirmLegacy: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Pre-Phase-4 payment confirmation helper (likely supplanted by paymentMarkedPaid in Phase 4)',
    legacyMigrationTarget: { file: 'portal.html', line: 13649, fnName: 'sendPaymentConfirmEmail', plannedPhase: '6.A' },
    paramsBuilder: null,
  },

  // ── NEW — Phase 3 (Tickets) ────────────────────────────────────────────────

  ticketLandlordCreated: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'New ticket on your property — to landlord',
    legacyMigrationTarget: null,
    paramsBuilder: (ctx) => ({
      to_email: ctx.landlordEmail,
      from_name: FROM_NAME_BOOM,
      reply_to: ADMIN_EMAIL,
      heading: '🛠 Nuovo ticket sulla tua proprietà',
      subheading: ctx.propertyName || ctx.propertyAddress || '',
      name: firstName(ctx.landlordName),
      intro: `${ctx.tenantName || 'L\'inquilino'} ha aperto un ticket di manutenzione (${ctx.severity || 'medium'}). Apri il link in fondo per leggere i dettagli e commentare.`,
      card_title: (ctx.title || '').toUpperCase(),
      card_color: ctx.severity === 'urgent' ? '#FF3B30' : ctx.severity === 'high' ? '#FF9500' : '#D4AF37',
      r1_icon: '🏠', r1_label: 'Proprietà', r1_value: ctx.propertyAddress || ctx.propertyName || '',
      r2_icon: '📋', r2_label: 'Categoria', r2_value: ctx.category || '—',
      r3_icon: '⚡', r3_label: 'Severità', r3_value: (ctx.severity || 'medium').toUpperCase(),
      r4_icon: '👤', r4_label: 'Inquilino', r4_value: ctx.tenantName || '—',
      closing: ctx.description ? `Descrizione:\n${ctx.description}` : '',
      cta_text: 'Apri ticket →',
      portal_link: ctx.landlordMagicLink || PORTAL_LINK_DEFAULT,
    }),
  },

  ticketTenantConfirm: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Confirmation to tenant that their ticket is open',
    legacyMigrationTarget: null,
    paramsBuilder: (ctx) => ({
      to_email: ctx.tenantEmail,
      from_name: FROM_NAME_BOOM,
      reply_to: ADMIN_EMAIL,
      heading: '✅ Ticket ricevuto',
      subheading: ctx.title || '',
      name: firstName(ctx.tenantName),
      intro: 'Abbiamo ricevuto la tua richiesta. Ti aggiorneremo via email + WhatsApp man mano che procediamo.',
      card_title: 'TICKET APERTO',
      card_color: '#34C759',
      r1_icon: '📋', r1_label: 'Riferimento', r1_value: ctx.ticketId || '—',
      r2_icon: '⚡', r2_label: 'Severità', r2_value: (ctx.severity || 'medium').toUpperCase(),
      r3_icon: '⏱', r3_label: 'SLA target', r3_value: ctx.slaTargetLabel || '—',
      r4_icon: '🏠', r4_label: 'Proprietà', r4_value: ctx.propertyAddress || ctx.propertyName || '',
      closing: 'Conserva questa email — il link sotto ti porta direttamente al ticket per aggiornamenti, foto aggiuntive o commenti.',
      cta_text: 'Apri il tuo ticket →',
      portal_link: ctx.tenantMagicLink || PORTAL_LINK_DEFAULT,
    }),
  },

  ticketStatusUpdate: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Generic ticket status change notification (assigned / in_progress / resolved / closed)',
    legacyMigrationTarget: null,
    paramsBuilder: (ctx) => ({
      to_email: ctx.toEmail,
      from_name: FROM_NAME_BOOM,
      reply_to: ADMIN_EMAIL,
      heading: ctx.newStatus === 'resolved' ? '✅ Ticket risolto' : `🔧 Ticket aggiornato: ${ctx.newStatus}`,
      subheading: ctx.title || '',
      name: firstName(ctx.recipientName),
      intro: ctx.message || `Il tuo ticket è ora in stato "${ctx.newStatus}".`,
      card_title: (ctx.newStatus || '').toUpperCase(),
      card_color: ctx.newStatus === 'resolved' ? '#34C759' : ctx.newStatus === 'in_progress' ? '#0A84FF' : '#D4AF37',
      r1_icon: '📋', r1_label: 'Ticket', r1_value: ctx.ticketId || '—',
      r2_icon: '🔄', r2_label: 'Da → A', r2_value: `${ctx.previousStatus || '—'} → ${ctx.newStatus || '—'}`,
      r3_icon: '🛠', r3_label: 'Vendor', r3_value: ctx.vendorName || '—',
      r4_icon: '📅', r4_label: 'ETA / Quando', r4_value: ctx.vendorEta ? fmtDate(ctx.vendorEta) : (ctx.resolvedAt ? fmtDate(ctx.resolvedAt) : '—'),
      closing: ctx.note || '',
      cta_text: 'Vedi ticket →',
      portal_link: ctx.magicLink || PORTAL_LINK_DEFAULT,
    }),
  },

  // ── NEW — Phase 4 (Rent Payments) ──────────────────────────────────────────

  paymentReminder5d: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'T-5 days rent reminder to tenant',
    legacyMigrationTarget: null,
    paramsBuilder: (ctx) => ({
      to_email: ctx.tenantEmail,
      from_name: FROM_NAME_BOOM,
      reply_to: ADMIN_EMAIL,
      heading: '📅 Affitto in scadenza tra 5 giorni',
      subheading: ctx.period || '',
      name: firstName(ctx.tenantName),
      intro: `Promemoria: il tuo affitto di ${fmtEur(ctx.amount)} per ${ctx.propertyName || 'la tua casa'} è in scadenza il ${fmtDate(ctx.dueDate)}.`,
      card_title: 'PAGAMENTO IN ARRIVO',
      card_color: '#D4AF37',
      r1_icon: '💰', r1_label: 'Importo', r1_value: fmtEur(ctx.amount),
      r2_icon: '📅', r2_label: 'Scadenza', r2_value: fmtDate(ctx.dueDate),
      r3_icon: '🏦', r3_label: 'IBAN', r3_value: ctx.iban || '',
      r4_icon: '📝', r4_label: 'Causale', r4_value: `Affitto ${ctx.period || ''} — ${ctx.propertyName || ''}`,
      closing: 'Effettua il bonifico entro la scadenza per evitare solleciti automatici.',
      cta_text: 'Apri portal →',
      portal_link: ctx.tenantMagicLink || PORTAL_LINK_DEFAULT,
    }),
  },

  paymentReminderDue: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Due-date rent reminder to tenant (T-0)',
    legacyMigrationTarget: null,
    paramsBuilder: (ctx) => ({
      to_email: ctx.tenantEmail,
      from_name: FROM_NAME_BOOM,
      reply_to: ADMIN_EMAIL,
      heading: '🔔 Affitto in scadenza oggi',
      subheading: ctx.period || '',
      name: firstName(ctx.tenantName),
      intro: `L'affitto di ${fmtEur(ctx.amount)} per ${ctx.propertyName || ''} scade oggi.`,
      card_title: 'OGGI È IL GIORNO',
      card_color: '#FF9500',
      r1_icon: '💰', r1_label: 'Importo', r1_value: fmtEur(ctx.amount),
      r2_icon: '📅', r2_label: 'Scadenza', r2_value: fmtDate(ctx.dueDate),
      r3_icon: '🏦', r3_label: 'IBAN', r3_value: ctx.iban || '',
      r4_icon: '📝', r4_label: 'Causale', r4_value: `Affitto ${ctx.period || ''} — ${ctx.propertyName || ''}`,
      closing: 'Se hai già pagato, ignora questa email — la registrazione del bonifico può richiedere 1-2 giorni lavorativi.',
      cta_text: 'Apri portal →',
      portal_link: ctx.tenantMagicLink || PORTAL_LINK_DEFAULT,
    }),
  },

  paymentOverdue3d: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'T+3 overdue notice — to tenant (admin BCC handled separately)',
    legacyMigrationTarget: null,
    paramsBuilder: (ctx) => ({
      to_email: ctx.tenantEmail,
      from_name: FROM_NAME_BOOM,
      reply_to: ADMIN_EMAIL,
      heading: '⚠️ Affitto scaduto da 3 giorni',
      subheading: ctx.period || '',
      name: firstName(ctx.tenantName),
      intro: `Il pagamento di ${fmtEur(ctx.amount)} per ${ctx.propertyName || ''} risulta non ricevuto. Se hai effettuato il bonifico, contattaci per verificare.`,
      card_title: 'PAGAMENTO IN RITARDO',
      card_color: '#FF3B30',
      r1_icon: '💰', r1_label: 'Importo dovuto', r1_value: fmtEur(ctx.amount),
      r2_icon: '📅', r2_label: 'Era scaduto il', r2_value: fmtDate(ctx.dueDate),
      r3_icon: '🏦', r3_label: 'IBAN', r3_value: ctx.iban || '',
      r4_icon: '📞', r4_label: 'Contatto', r4_value: 'Valentino — +39 331 325 1961',
      closing: 'Per evitare un ulteriore sollecito tra 4 giorni, completa il pagamento o rispondi a questa email.',
      cta_text: 'Apri portal →',
      portal_link: ctx.tenantMagicLink || PORTAL_LINK_DEFAULT,
    }),
  },

  paymentEscalation7d: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'T+7 escalation — admin only (no tenant message)',
    legacyMigrationTarget: null,
    paramsBuilder: (ctx) => ({
      to_email: ADMIN_EMAIL,
      from_name: 'BOOM Cron',
      reply_to: ctx.tenantEmail || ADMIN_EMAIL,
      heading: '🚨 Affitto scaduto da 7 giorni — escalation',
      subheading: `${ctx.tenantName || 'Tenant'} · ${ctx.propertyName || ''}`,
      name: 'Valentino',
      intro: 'Pagamento ancora non ricevuto dopo i due solleciti automatici (T+3 + T+0). Subentra azione manuale.',
      card_title: 'ESCALATION',
      card_color: '#FF3B30',
      r1_icon: '👤', r1_label: 'Tenant', r1_value: `${ctx.tenantName || ''} · ${ctx.tenantPhone || ''}`,
      r2_icon: '🏠', r2_label: 'Proprietà', r2_value: ctx.propertyName || ctx.propertyAddress || '',
      r3_icon: '💰', r3_label: 'Importo', r3_value: fmtEur(ctx.amount),
      r4_icon: '📅', r4_label: 'Scaduto il', r4_value: fmtDate(ctx.dueDate),
      closing: `Periodo: ${ctx.period || ''}. Email: ${ctx.tenantEmail || '—'}. paymentId: ${ctx.paymentId || ''}`,
      cta_text: 'Apri payment →',
      portal_link: PORTAL_LINK_DEFAULT,
    }),
  },

  landlordMonthlyStatement: {
    templateId: EMAILJS_TEMPLATE_NOTIFICATION,
    purpose: 'Day-5-of-next-month landlord statement — incassi del mese precedente, forwards, commission',
    legacyMigrationTarget: null,
    paramsBuilder: (ctx) => ({
      to_email: ctx.landlordEmail,
      from_name: FROM_NAME_BOOM,
      reply_to: ADMIN_EMAIL,
      heading: `📊 Estratto mensile — ${ctx.period || ''}`,
      subheading: ctx.propertyName || 'Le tue proprietà',
      name: firstName(ctx.landlordName),
      intro: `Riepilogo dei tuoi incassi BOOM per ${ctx.period || 'il mese scorso'}. PDF dettagliato in allegato.`,
      card_title: 'ESTRATTO PARTNER',
      card_color: '#D4AF37',
      r1_icon: '💰', r1_label: 'Incassato lordo', r1_value: fmtEur(ctx.grossCollected),
      r2_icon: '📤', r2_label: 'Inoltrato a te', r2_value: fmtEur(ctx.forwardedToLandlord),
      r3_icon: '🏠', r3_label: 'Proprietà attive', r3_value: String(ctx.activePropertiesCount || 1),
      r4_icon: '📅', r4_label: 'Periodo', r4_value: ctx.period || '',
      closing: ctx.notes || 'Per dettagli per singola proprietà, apri il PDF in allegato o accedi al portal.',
      cta_text: 'Apri portal landlord →',
      portal_link: ctx.landlordMagicLink || PORTAL_LINK_DEFAULT,
      attachment_url: ctx.statementPdfUrl || '',
    }),
  },
};

// ---------------------------------------------------------------------------
// Default export — convenient lookup
// ---------------------------------------------------------------------------

export default EMAIL_TEMPLATES;

// Convenience: build template_params for a known key.
// Throws if key not found OR if entry is legacy (no paramsBuilder yet).
export function buildEmailParams(key, ctx) {
  const entry = EMAIL_TEMPLATES[key];
  if (!entry) throw new Error(`[email-templates] Unknown key: ${key}`);
  if (typeof entry.paramsBuilder !== 'function') {
    const t = entry.legacyMigrationTarget;
    throw new Error(
      `[email-templates] '${key}' is legacy (no paramsBuilder yet). ` +
      `Call-site lives at ${t ? `${t.file}:${t.line} (${t.fnName})` : 'unknown'} — ` +
      `migrate in Phase ${t ? t.plannedPhase : '?'}.`
    );
  }
  return { templateId: entry.templateId, params: entry.paramsBuilder(ctx) };
}
