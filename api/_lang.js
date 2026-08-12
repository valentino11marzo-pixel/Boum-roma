// api/_lang.js — one honest answer to "what language does this person speak?"
//
// BOOM's audience is international: English is the house language, Italian is
// the exception we switch to when the person actually wrote in Italian.
// Getting this backwards is not cosmetic — a German client relocating to Rome
// receiving an Italian WhatsApp reads as "they didn't even look at my message".
//
// The bug this replaces: the portal-email extractor stored `language: 'it'`
// whenever the model didn't explicitly say "en", so almost every lead looked
// Italian and every pre-filled reply came out in Italian.

// Function words that essentially never appear in English text, plus the
// accented letters Italian uses. Deliberately narrow: false Italian is worse
// than a missed detection (English is the safe default).
const IT_WORDS = /\b(sono|vorrei|salve|buongiorno|buonasera|grazie|gentilmente|disponibile|disponibilit[àa]|appartamento|affitto|affittare|visitare|visita|informazioni|cerco|cercando|abbiamo|vorremmo|possibile|quando|quanto|perch[ée]|anche|molto|nostro|nostra|mio|mia|siamo|potrei|potrebbe|ciao)\b/i;
const EN_WORDS = /\b(hello|hi|dear|thanks|thank you|regards|available|availability|apartment|flat|rent|renting|viewing|interested|looking for|would like|could you|please|when|how much|i am|we are|my name)\b/i;

/**
 * @param {object} src  { language?, message?, name? } — a lead, a viewing…
 * @returns {'it'|'en'} the language to WRITE IN
 */
export function replyLang(src = {}) {
  const text = String(src.message || src.notes || '');
  const declared = String(src.language || '').toLowerCase();

  // The text itself is the strongest evidence — it is what they actually typed.
  if (text.trim().length >= 12) {
    const it = IT_WORDS.test(text);
    const en = EN_WORDS.test(text);
    if (it && !en) return 'it';
    if (en && !it) return 'en';
    if (it && en) return /[àèéìòù]/i.test(text) ? 'it' : 'en';
  }
  // No usable text: trust an explicit declaration, otherwise speak English.
  if (declared === 'it') return 'it';
  return 'en';
}

export const isItalian = src => replyLang(src) === 'it';
