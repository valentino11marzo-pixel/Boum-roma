// The one-message transport binds the exact bytes approved for one action.
// This is independent of Segretaria's wider approval/content fingerprints.
import crypto from 'node:crypto';

export const SINGLE_PROTOCOL = 'homie-wa-single-v1';
export const SINGLE_ACTION_ID = /^sgreply_[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function singlePayloadHash({ actionId, phone, text }) {
  return crypto.createHash('sha256').update(JSON.stringify([actionId, phone, text]), 'utf8').digest('hex');
}

// No trimming or shortening: what the owner approved is what the Mac receives.
export function singleActionMessage(actionId, action) {
  const phone = action?.payload?.phone, text = action?.payload?.body || action?.payload?.draft;
  return SINGLE_ACTION_ID.test(actionId || '') && typeof phone === 'string' && phone.length > 0
    && typeof text === 'string' && !/^[\s\u001c-\u001f\u0085]*$/u.test(text) && !text.includes('\u0000')
    && [...text].length <= 10000 && Buffer.from(text, 'utf8').toString('utf8') === text
    ? { actionId, phone, text } : null;
}

export function validSingleSelection(selection) {
  return !!selection && selection.protocol === SINGLE_PROTOCOL
    && typeof selection.revision === 'string' && selection.revision.length > 0
    && selection.revision.length <= 256 && !/[\u0000-\u001f\u007f]/.test(selection.revision)
    && Buffer.from(selection.revision, 'utf8').toString('utf8') === selection.revision
    && typeof selection.payloadHash === 'string' && SHA256.test(selection.payloadHash);
}

export function singleSelectionMatches(actionId, action, selection) {
  const message = singleActionMessage(actionId, action);
  return validSingleSelection(selection) && !!message
    && action?.segretaria?.proposalRevision === selection.revision
    && singlePayloadHash(message) === selection.payloadHash;
}

export function sameSingleSelection(a, b) {
  return validSingleSelection(a) && validSingleSelection(b)
    && a.protocol === b.protocol && a.revision === b.revision && a.payloadHash === b.payloadHash;
}

export function validSingleRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.protocol !== SINGLE_PROTOCOL
      || typeof body.actionId !== 'string' || !SINGLE_ACTION_ID.test(body.actionId)) return false;
  const keys = ['protocol', 'op', 'actionId'];
  if (body.op !== 'inspect') {
    if (!['claim', 'ack'].includes(body.op) || !validSingleSelection(body)) return false;
    keys.push('revision', 'payloadHash');
  }
  if (body.op === 'ack') {
    if (typeof body.ok !== 'boolean') return false;
    keys.push('ok');
    if (!body.ok) {
      if (!['send_outcome_unknown', 'send_not_started'].includes(body.error)) return false;
      keys.push('error');
    }
  }
  return Object.keys(body).every(key => keys.includes(key));
}
