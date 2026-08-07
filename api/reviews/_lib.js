// api/reviews/_lib.js
// LA RECENSIONE, CHIESTA NEL MOMENTO GIUSTO E DAL CANALE GIUSTO.
//
// Le recensioni Google sono il segnale di fiducia che decide se uno
// sconosciuto manda un bonifico a un'agenzia straniera — e per BOOM sono la
// leva più forte che resta (dominio giovane, pochi backlink: il local pack si
// vince con le recensioni, non con i meta tag).
//
// Il journey chiede già a T+3 via EMAIL. Questo modulo copre il canale che
// converte di più — WhatsApp, il giorno dopo le chiavi — e soprattutto
// rispetta la regola di docs/reviews.md: **si chiede solo a chi è contento**.
// Perciò qui non si manda niente da soli: si prepara il messaggio e
// l'operatore tocca. Una richiesta di massa brucia il profilo; una richiesta
// mirata lo costruisce.

const FALLBACK = 'https://www.google.com/search?q=BOOM+Rome+boomrome.com+reviews';

/**
 * Il link deve aprire la SCATOLA DELLE STELLE, non il profilo: da un link
 * "condividi" (share.google / maps.app.goo.gl) circa metà delle persone non
 * trova il bottone per scrivere. Quindi si valida, e un valore sbagliato non
 * parte mai in silenzio dentro un messaggio a un cliente.
 * (Stessa regola di api/journey/_run.js — vive qui perché ora la usano in due.)
 */
export function reviewUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const ok = /^https:\/\/g\.page\/r\/[A-Za-z0-9_-]+\/review\/?$/.test(v)
    || /^https:\/\/search\.google\.com\/local\/writereview\?placeid=[A-Za-z0-9_-]+$/.test(v);
  if (!ok) {
    console.warn('[reviews] REVIEW_URL ignorato — non è un link "scrivi recensione" '
      + '(atteso g.page/r/<id>/review o search.google.com/local/writereview?placeid=<id>):', v);
    return null;
  }
  return v;
}

/** Il link da usare adesso: quello vero se configurato, altrimenti la ricerca. */
export function activeReviewUrl(env = process.env) {
  return reviewUrl(env.REVIEW_URL) || FALLBACK;
}

/** true quando il link buono è configurato — il bot lo dice all'operatore
 *  invece di far credere che stia mandando il link one-tap. */
export const hasRealReviewLink = (env = process.env) => !!reviewUrl(env.REVIEW_URL);

/**
 * Il messaggio pre-compilato. Prima si CHIEDE COM'È ANDATA, poi si manda il
 * link: chiedere la recensione a chi ha un problema aperto è il modo più
 * veloce per prendersi una stella.
 * @param {'it'|'en'} lang  la lingua di chi legge, non la nostra
 */
export function reviewAskText(name, lang, url) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  if (lang === 'it') {
    return `Ciao ${first}! Come va la casa? Se è filato tutto liscio, ci aiuteresti tantissimo con due righe di recensione su Google — per un'agenzia giovane come noi vale davvero:\n${url}\n\nE se invece c'è qualcosa che non va, dimmelo prima a me: lo sistemiamo.`.trim();
  }
  return `Hi ${first}! How's the apartment treating you? If everything went smoothly, a couple of lines on Google would genuinely help us — we're a young agency and it matters more than you'd think:\n${url}\n\nAnd if something isn't right, tell me first: we'll fix it.`.trim();
}

/** wa.me one-tap: l'operatore tocca e ha la chat aperta col testo già dentro. */
export function reviewWaUrl(phone, name, lang, url) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  const text = encodeURIComponent(reviewAskText(name, lang, url));
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

/**
 * Chi ha senso ringraziare oggi. La regola del playbook è "move-in +48h",
 * quindi: contratto attivo, trasloco avvenuto da almeno 2 giorni e non più di
 * 45 (oltre, la richiesta suona fuori tempo), e a cui non è già stato chiesto.
 * Esportata e testata: è la riga che decide chi riceve un messaggio: sbagliarla
 * significa scrivere a chi non ha ancora le chiavi.
 */
export function reviewCandidates(contracts, todayIso, opts = {}) {
  const minDays = opts.minDays != null ? opts.minDays : 2;
  const maxDays = opts.maxDays != null ? opts.maxDays : 45;
  const today = new Date(String(todayIso).slice(0, 10) + 'T00:00:00Z');
  const out = [];
  for (const c of contracts || []) {
    if (!c || c.reviewAskedAt) continue;                     // già chiesto: mai due volte
    if (c.status && ['cancelled', 'draft'].includes(c.status)) continue;
    const start = String(c.startDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    const days = Math.round((today - new Date(start + 'T00:00:00Z')) / 86400000);
    if (days < minDays || days > maxDays) continue;
    if (!c.tenantPhone && !c.tenantEmail) continue;           // irraggiungibile
    out.push({
      id: c.id,
      name: c.tenantName || '',
      phone: c.tenantPhone || '',
      email: c.tenantEmail || '',
      lang: c.tenantLanguage === 'it' ? 'it' : 'en',
      property: c.propertyAddress || c.propertyName || '',
      days,
    });
  }
  // il più fresco per primo: la gratitudine cala col passare dei giorni
  return out.sort((a, b) => a.days - b.days);
}
