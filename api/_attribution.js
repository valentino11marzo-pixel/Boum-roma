// api/_attribution.js — da dove arriva un lead, in una riga, in una copia sola.
//
// js/boom-track.js, SOLO dopo il consenso analitico, timbra il primo
// contatto non interno («ai:gemini · /faq», «google · /», «newsletter · /owners»)
// nel cookie di prima parte `boom_attr` (90 giorni) e nel campo nascosto
// `boom_source` dei moduli. Le porte che scrivono lead e visite lo leggono
// qui: prima il valore mandato dalla pagina (`body.attribution`), poi il
// cookie. Senza consenso non c'è né l'uno né l'altro, e il campo resta null.
//
// Tre regole:
//  1. È una STRINGA corta, mai un oggetto e mai una query: niente ?email=…
//     che una pagina potrebbe portarsi dietro nel percorso.
//  2. Non blocca e non fa fallire MAI una scrittura: ogni errore → null.
//  3. Passa solo la grammatica del tracker (15/10/2026). Il campo è pubblico
//     — qualunque chiamante può mandarlo — e finisce in `leads` e
//     `viewingRequests`: tagliarlo a 120 caratteri non bastava, ci passavano
//     HTML, indirizzi email, U+2028 e i controlli bidi (U+202E), e un oggetto
//     annidato diventava «[object Object] · /a,/b». Ora, dopo il taglio:
//     lettere, cifre, spazio e `_ . : · / -` (la forma di «ai:gemini · /faq»
//     e di «outreach/email/owners_2026»), spazi collassati. Un valore con la
//     forma di un'email o di un numero di telefono non è una fonte, è un dato
//     personale → null (si guarda PRIMA della lista bianca, che toglierebbe
//     la @ e lascerebbe «mario.rossigmail.com»).

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

const keep = s => s.replace(/[^\p{L}\p{N} _.:·\/\-]/gu, '').replace(/\s+/g, ' ').trim();

const EMAILISH = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONEISH = /(?:\d[ .\-]?){9,}/;

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function attributionOf(a) {
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    // la forma oggetto vale solo con stringhe vere e proprie: un canale
    // annidato, un percorso-array o un campo ereditato non diventano testo
    const ch = own(a, 'channel') ? a.channel : undefined;
    const ld = own(a, 'landing') ? a.landing : undefined;
    if (typeof ch !== 'string' || !(ld == null || typeof ld === 'string')) return null;
    a = clip(ch, 60) + (ld ? ' · ' + clip(ld, 120) : '');
  }
  if (typeof a !== 'string') return null;
  const s = clip(a.split(/[?#]/)[0], 120);
  if (EMAILISH.test(s) || PHONEISH.test(s)) return null;
  return keep(s) || null;
}

export function attributionFromReq(req, body) {
  try {
    const b = attributionOf(body && body.attribution);
    if (b) return b;
    const c = String((req && req.headers && req.headers.cookie) || '');
    const m = c.match(/(?:^|;\s*)boom_attr=([^;]*)/);
    return m ? attributionOf(decodeURIComponent(m[1])) : null;
  } catch { return null; }
}
