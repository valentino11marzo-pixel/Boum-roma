// The pickup window and its read-only receipt must agree. Expiry never requeues.
const MAX_AGE_MS = 48 * 3600 * 1000;

export function whatsappDeliveryWindow(action, now = Date.now()) {
  const at = action?.executedAt ? new Date(action.executedAt).getTime() : NaN;
  if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(now)) return 'invalid';
  return now - at < MAX_AGE_MS ? 'current' : 'expired';
}
