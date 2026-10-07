// A match for a reviewed PFS client is an internal case, not a portal card.
// One deterministic document per client + listing survives the command
// center's 120-property feed window. Re-observation only updates listing
// facts: it must never reset an operator's review status or actor.
import crypto from 'node:crypto';
import { fsCreate, fsPatch, fsGet } from '../homie/_lib.js';

export const candidateId = (clientId, propertyId) => 'pc_' + crypto.createHash('sha1')
  .update(String(clientId) + '\0' + String(propertyId)).digest('hex');

const httpUrl = value => typeof value === 'string' && /^https?:\/\/[^\s]+$/i.test(value);
const filled = (value, min, max) => typeof value === 'string'
  && value.trim().length >= min && value.trim().length <= max;
const pastIso = value => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < Date.UTC(2020, 0, 1) || time > Date.now() + 5 * 60_000) return null;
  return new Date(time).toISOString();
};

// Approval is an operator's recorded attestation, with enough provenance to
// revisit the source and the two conversations. It is never an auto-send.
export function normalizeApprovalEvidence(input, sourceUrl) {
  if (!input || !httpUrl(sourceUrl) || input.sourceUrl !== sourceUrl
      || input.permissionGranted !== true) return null;
  const availabilityVerifiedAt = pastIso(input.availabilityVerifiedAt);
  const sharingPermissionAt = pastIso(input.sharingPermissionAt);
  if (!availabilityVerifiedAt || !sharingPermissionAt
      || !filled(input.availabilityVerifiedWith, 3, 160)
      || !filled(input.availabilityEvidence, 8, 500)
      || !filled(input.sharingPermissionFrom, 3, 160)
      || !filled(input.sharingPermissionEvidence, 8, 500)) return null;
  return {
    sourceUrl,
    availabilityVerifiedAt,
    availabilityVerifiedWith: input.availabilityVerifiedWith.trim(),
    availabilityEvidence: input.availabilityEvidence.trim(),
    sharingPermissionAt,
    sharingPermissionFrom: input.sharingPermissionFrom.trim(),
    sharingPermissionEvidence: input.sharingPermissionEvidence.trim(),
    permissionGranted: true,
  };
}

export function hasApprovedEvidence(candidate, clientId, propertyId, sourceUrl) {
  const evidence = candidate?.reviewEvidence;
  return candidate?.status === 'approved' && candidate.clientId === clientId
    && candidate.propertyId === propertyId && candidate.sourceUrl === sourceUrl
    && filled(candidate.reviewedBy, 3, 160) && pastIso(candidate.reviewedAt)
    && !!evidence && normalizeApprovalEvidence(evidence, sourceUrl) !== null;
}

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
