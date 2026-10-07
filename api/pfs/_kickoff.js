// Paid PFS kickoff. Firestore is the queue: a client stays `pending` until
// both BOOM searches and the operator's Casafari setup task exist. Every
// write has a stable ID, so Stripe retries and the sync cron can repair a
// partial attempt without creating a second task or resetting manual knobs.
import { fsCreate, fsPatch } from '../homie/_lib.js';
import { autoTaskId, ensureTask } from '../regista/_tasks.js';
import { romeDateKey } from '../viewings/_avail.js';
import { buildSearchUrls } from './_searchurls.js';

export const FIRST_REVIEW_HOURS = 48;

export function firstReviewDueAt(paidAt) {
  const at = new Date(paidAt);
  if (!Number.isFinite(at.getTime())) throw new Error('invalid_paid_at');
  return new Date(at.getTime() + FIRST_REVIEW_HOURS * 3600_000).toISOString();
}

function romeTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}

export async function syncClientSearches(client, now = new Date()) {
  const created = [], updated = [], errors = [];
  for (const s of buildSearchUrls(client)) {
    const docId = `pfs_${client.id}_${s.portal}`;
    const base = {
      name: `PFS · ${client.name || client.id} · ${s.portal}`,
      portal: s.portal,
      searchUrl: s.url,
      label: s.label,
      zoneName: s.zone || null,
      clientId: client.id,
      clientName: client.name || null,
      auto: true,
      syncedAt: now,
    };
    try {
      // Create-only first: a simultaneous manual disable/URL override cannot
      // be overwritten by a stale read from this worker.
      await fsCreate('radarSearches', { ...base, enabled: true, createdAt: now }, docId);
      created.push(docId);
    } catch (e) {
      if (!e.exists) { errors.push({ docId, error: e.message }); continue; }
      try {
        await fsPatch('radarSearches/' + docId, base);
        updated.push(docId);
      } catch (err) { errors.push({ docId, error: err.message }); }
    }
  }
  return { created, updated, errors };
}

export async function ensurePfsKickoff(client, now = new Date()) {
  if (!client?.id || client.pfsKickoffStatus !== 'pending') return { skipped: true, created: [], updated: [], errors: [] };
  const searches = await syncClientSearches(client, now);
  const errors = [...searches.errors];
  try {
    await ensureTask({
      id: autoTaskId('pfs_casafari', client.id),
      kind: 'auto', source: 'pfs-kickoff', createdBy: 'pfs-kickoff',
      title: `Attiva alert Casafari per ${client.name || client.id}`,
      note: `Apri PFS Command, copia i criteri e salva l'alert nell'account Casafari. Verifica poi le prime opzioni per la shortlist interna entro ${client.firstShortlistDueAt || '48 ore dal pagamento'}. La creazione del task non prova che l'alert sia attivo.`,
      // Stable across retries (including retries after midnight). If setup
      // failed for a day, the task should be overdue, never silently moved.
      due: romeDateKey(new Date(client.paid_at || now)), calendarize: false,
    });
  } catch (e) { errors.push({ step: 'casafari_task', error: e.message }); }

  try {
    const dueAt = new Date(client.firstShortlistDueAt || firstReviewDueAt(client.paid_at || now));
    await ensureTask({
      id: autoTaskId('pfs_shortlist', client.id),
      kind: 'auto', source: 'pfs-kickoff', createdBy: 'pfs-kickoff',
      title: `Rivedi prima shortlist PFS per ${client.name || client.id}`,
      note: `Target interno a 48 ore dal pagamento (${dueAt.toISOString()}). Verifica disponibilità, qualità, fonte e permesso di condivisione prima di proporre immobili al cliente. La promessa email al cliente resta 72 ore.`,
      due: romeDateKey(dueAt), dueTime: romeTime(dueAt), calendarize: false,
    });
  } catch (e) { errors.push({ step: 'shortlist_task', error: e.message }); }

  try {
    await fsPatch('pfsClients/' + client.id, errors.length
      ? { pfsKickoffStatus: 'pending', pfsKickoffError: errors[0].error, pfsKickoffCheckedAt: now }
      : { pfsKickoffStatus: 'searches_ready', pfsKickoffError: null, pfsKickoffCheckedAt: now });
  } catch (e) { errors.push({ step: 'client_status', error: e.message }); }
  return { ...searches, errors, ok: errors.length === 0 };
}
