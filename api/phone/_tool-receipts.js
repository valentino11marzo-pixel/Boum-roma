// api/phone/_tool-receipts.js — prove chiuse dei tool telefonici ElevenLabs.
//
// Il testo pronunciato dall'agente ("la trasferisco") non prova un effetto.
// Solo tool_calls/tool_results del payload HMAC possono produrre una ricevuta.
// Conserviamo una whitelist minima e mai params/result grezzi: possono portare
// numeri, credenziali o altri dettagli che il Centralino non deve duplicare.

const TOOL = 'transfer_to_number';
const MAX_EVENTS = 80;
const MAX_RECEIPTS = 20;
const MAX_REQUEST_ID = 160;

function seconds(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 24 * 60 * 60
    ? Math.round(n * 1000) / 1000 : null;
}

function requestId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= MAX_REQUEST_ID && /^[A-Za-z0-9_.:-]+$/.test(id) ? id : null;
}

function resultText(result) {
  return [result && result.error_type, result && result.raw_error_message, result && result.result_value]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

function failureReason(result) {
  const value = resultText(result);
  if (/missing[^\n]{0,40}sip[^\n]{0,40}credential|sip[^\n]{0,40}credential[^\n]{0,40}missing/.test(value)) return 'missing_sip_credentials';
  if (/\bbusy\b|\bsip\s*486\b/.test(value)) return 'busy';
  if (/no[- ]?answer|not answer|unanswered|\bsip\s*(408|480)\b/.test(value)) return 'no_answer';
  if (/declin|reject|\bsip\s*603\b/.test(value)) return 'declined';
  if (/unreachable|\bsip\s*(404|410|484)\b/.test(value)) return 'unreachable';
  if (/timeout|timed out|\bsip\s*504\b/.test(value)) return 'timeout';
  if (result && result.is_blocked === true) return 'blocked';
  return 'provider_error';
}

function explicitlyConnected(result) {
  if (!result || result.is_error !== false || result.tool_has_been_called !== true) return false;
  const value = typeof result.result_value === 'string' ? result.result_value.toLowerCase() : '';
  if (!value || /\b(fail(?:ed|ure)?|error|unable|not transferred|could not|couldn't)\b/.test(value)) return false;
  return /\bsuccessfully\s+(?:connected|transferred)\b/.test(value)
    || /\b(?:call|caller|user)\b[^\n]{0,50}\b(?:connected|transferred)\s+successfully\b/.test(value)
    || /\btransfer(?:red)?\s+(?:was\s+)?(?:successful|succeeded|completed)\b/.test(value);
}

function outcome(result) {
  if (!result) return { status: 'unknown' };
  if (result.is_error === true || result.is_blocked === true) {
    return { status: 'failed', reason: failureReason(result) };
  }
  if (explicitlyConnected(result)) return { status: 'connected' };
  return { status: 'unknown' };
}

/**
 * Build bounded receipts from the authenticated post-call transcript.
 * No transcript text, tool params, destination, result body or raw error is
 * returned. `unknown` is deliberate whenever the provider does not explicitly
 * attest either failure or a completed connection.
 */
export function buildPhoneToolReceipts(rawTurns) {
  const receipts = [];
  const byRequest = new Map();
  let events = 0;
  let truncated = false;

  const add = (id, timeInCallSec) => {
    if (receipts.length >= MAX_RECEIPTS) {
      truncated = true;
      return null;
    }
    const receipt = {
      tool: TOOL,
      provider: 'elevenlabs',
      evidence: 'tool_call',
      status: 'unknown',
      ...(timeInCallSec != null ? { requestedAtSec: timeInCallSec } : {}),
    };
    receipts.push(receipt);
    if (id && !byRequest.has(id)) byRequest.set(id, receipt);
    return receipt;
  };

  outer: for (const turn of Array.isArray(rawTurns) ? rawTurns : []) {
    if (!turn || typeof turn !== 'object') continue;
    const timeInCallSec = seconds(turn.time_in_call_secs);
    for (const call of Array.isArray(turn.tool_calls) ? turn.tool_calls : []) {
      if (!call || call.tool_name !== TOOL) continue;
      if (++events > MAX_EVENTS) { truncated = true; break outer; }
      const id = requestId(call.request_id);
      add(id, timeInCallSec);
    }
    for (const result of Array.isArray(turn.tool_results) ? turn.tool_results : []) {
      if (!result || result.tool_name !== TOOL) continue;
      if (++events > MAX_EVENTS) { truncated = true; break outer; }
      const id = requestId(result.request_id);
      let receipt = id ? byRequest.get(id) : null;
      if (!receipt || receipt.evidence === 'tool_result') receipt = add(id, null);
      if (!receipt) continue;
      const resultAtSec = seconds(turn.time_in_call_secs);
      const latencySec = seconds(result.tool_latency_secs);
      Object.assign(receipt, outcome(result), {
        evidence: 'tool_result',
        ...(resultAtSec != null ? { resultAtSec } : {}),
        ...(latencySec != null && latencySec <= 300 ? { latencySec } : {}),
      });
    }
  }

  return {
    receipts,
    status: receipts.length
      ? (truncated || receipts.some((receipt) => receipt.status === 'unknown') ? 'partial' : 'complete')
      : 'unavailable',
    truncated,
  };
}

export const PHONE_TOOL_RECEIPT_LIMITS = Object.freeze({
  tool: TOOL,
  maxEvents: MAX_EVENTS,
  maxReceipts: MAX_RECEIPTS,
});
