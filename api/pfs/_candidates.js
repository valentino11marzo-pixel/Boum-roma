// A match for a reviewed PFS client is an internal case, not a portal card.
// One deterministic document per client + listing survives the command
// center's 120-property feed window. Re-observation only updates listing
// facts: it must never reset an operator's review status or actor.
import crypto from 'node:crypto';
import { fsCreate, fsPatch, fsGet } from '../homie/_lib.js';

export const candidateId = (clientId, propertyId) => 'pc_' + crypto.createHash('sha1')
  .update(String(clientId) + '\0' + String(propertyId)).digest('hex');

export async function ensureCandidate({ client, propertyId, property, score, reasons, now = new Date() }) {
  if (!client?.id || !propertyId || !property?.sourceUrl) throw new Error('invalid_candidate');
  const id = candidateId(client.id, propertyId);
  const observedAt = now.toISOString();
  const facts = {
    clientId: client.id,
    clientName: client.name || null,
    propertyId,
    sourceUrl: property.sourceUrl,
    source: property.source || null,
    title: property.title || null,
    address: property.address || null,
    zone: property.zone || null,
    price: property.price,
    bedrooms: property.bedrooms ?? null,
    sqm: property.sqm ?? null,
    advertiser: property.advertiser || 'unknown',
    score,
    reasons: Array.isArray(reasons) ? reasons.slice(0, 12) : [],
    lastSeenAt: observedAt,
  };
  try {
    await fsCreate('pfsCandidateReviews', {
      ...facts,
      status: 'pending',
      firstSeenAt: observedAt,
      createdAt: observedAt,
    }, id);
    return { id, created: true, status: 'pending' };
  } catch (e) {
    if (!e.exists) throw e;
  }
  // fsPatch uses an update mask. These facts cannot overwrite status,
  // reviewedAt, reviewedBy or any future evidence fields, even if a cron and
  // an operator act concurrently.
  await fsPatch('pfsCandidateReviews/' + id, facts);
  const current = await fsGet('pfsCandidateReviews/' + id);
  if (!current) throw new Error('candidate_disappeared');
  return { id, existed: true, status: current.status || 'unknown' };
}
