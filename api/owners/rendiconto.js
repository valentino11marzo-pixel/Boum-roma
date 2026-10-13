// api/owners/rendiconto.js — IL RENDICONTO PROPRIETARIO (cron mensile)
//
// Il 1° del mese ogni proprietario riceve il rendiconto del mese chiuso:
// per ogni suo interno chi abita, il contratto, la rata del mese (pagata,
// non pagata, in verifica), gli altri incassi e gli arretrati, le
// manutenzioni. UN PDF nel design BOOM + email in italiano. È il prodotto
// che fa rinnovare i mandati: il proprietario VEDE il lavoro.
//
// LA LEZIONE DEL 12 OTTOBRE 2026 (l'audit prima della prima cliente vera):
// il primo documento che la proprietaria avrebbe ricevuto senza che nessuno
// lo guardasse diceva «Nessun arretrato» con due interni che non avevano
// pagato (la rata scaduta del mese chiuso finiva fra le «in attesa»),
// contava come arretrato un bonifico già segnalato dall'inquilino, stampava
// «€0/mese» per un contratto non ancora in archivio, intitolava cinque
// sezioni «Piazzale Prenestino 42, Roma» senza l'interno, e partiva anche
// per un mese che BOOM non aveva gestito. Ora:
//  - lo stato di ogni rata viene da BOOM_RENT.paymentState, attraverso lo
//    STESSO motore del Palazzo (context · unitMonth · arrearsOf): il
//    rendiconto non può dire una cosa diversa dalla pagina che lei vede;
//  - arretrati = rate scadute e non pagate AD OGGI, mese chiuso compreso;
//    un bonifico segnalato è «in verifica da BOOM», mai un arretrato;
//  - i mesi prima di `gestioneDal` non esistono (né sezioni né arretrati);
//  - un contratto non in archivio è «in arrivo da BOOM», mai un canone a 0;
//  - ogni sezione ha il SUO nome (interno, scala, piano), canone e oneri
//    sono righe distinte, il canale di pagamento è in italiano, gli euro e
//    le date sono scritti senza toLocaleString (deterministici);
//  - quando il locatore dei contratti è una società diversa dalla persona
//    dell'account, il documento lo dice («Locatore: … · alla c.a. di …»).
//
// LA MODALITÀ PER PROPRIETARIO (`users/<ownerId>.rendicontoMode`):
//   off     → niente;
//   preview → il PDF va SOLO all'operatore (oggetto «ANTEPRIMA — …»), mai
//             alla proprietaria;
//   auto    → il PDF va al proprietario.
// Assente = 'auto' per chi non ha interni presi in carico dalla tabella del
// Palazzo (il comportamento di sempre), 'preview' per chi ne ha anche uno
// solo: il primo mese di una gestione nuova lo guarda l'operatore prima.
// Un valore sconosciuto vale 'preview' (mai un invio per un refuso).
//
// L'INVIO NON SI PERDE (prima il segnaposto di idempotenza nasceva PRIMA
// dell'invio: un guasto di Gmail o di Storage lasciava il mese «già
// inviato» per sempre, e fermava anche i proprietari dopo). Ora il doc
// `rendiconti/<ownerId>_<YYYY-MM>` ha uno stato:
//   sending → sent      solo DOPO l'invio riuscito;
//   failed              errore certo (il motivo è scritto): il giro dopo riprova;
//   uncertain           l'email è partita e la risposta no (timeout): NON si
//                       ritenta da solo — un doppio rendiconto si evita
//                       guardando la posta inviata, poi ?force=1;
//   sending «vecchio»   la funzione è morta a metà: se stava già spedendo è
//                       incerto, altrimenti si riprova.
// Ogni proprietario ha il suo try/catch: un guasto non ferma gli altri. Se
// lo stato d'invio non si riesce a SCRIVERE (Firestore giù, regole, una
// risposta persa) l'email NON parte: senza lo stato il giro dopo la
// rispedirebbe (prima si procedeva lo stesso, e un 503 momentaneo bastava
// per due rendiconti dello stesso mese). È un «non partito» come gli altri.
// Un'anteprima non conta come invio: passando ad 'auto' il mese parte.
//
// IL TEMPO (revisione del 13/10): prima ogni proprietario prenotava il caso
// peggiore intero (30s) PRIMA di cominciare, e un giro smetteva di prendere
// proprietari a 24s su 60 — con 12 proprietari e Gmail a 3s ne partivano 8.
// Ora si chiede il tempo a ogni passo, quando serve: poco per le letture,
// poi — prima dello stato d'invio e di nuovo subito prima di archivio ed
// email — quanto basta per l'email (`EMAIL_MS` + margine). Se dopo lo stato
// il tempo non c'è più, il mese resta `failed` col motivo «tempo» e il giro
// dopo lo riprende; chi non è nemmeno cominciato è «rimandato», senza stato
// scritto, e dal primo rimandato in poi non si legge più nessuno (il tempo
// non torna). L'archivio su Storage ha il tetto di quello che resta oltre
// l'email (il PDF viaggia comunque in allegato). Il recap dice «riprova
// domani da solo» SOLO se domani c'è un giro (`CRON_DAYS`, legato a
// vercel.json da un test).
//
// LETTURE MIRATE: prima si leggevano 400 immobili, 800 contratti, 3000 rate
// e 600 manutenzioni SENZA ordine — oltre il tetto le rate di un palazzo
// sparivano in silenzio. Ora gli immobili si leggono tutti (a pagine), e per
// ogni proprietario contratti, rate e manutenzioni dei SUOI interni
// (`IN` a blocchi di 30, a pagine), come fa /palazzo su Telegram.
//
// Auth: cron Vercel (Bearer CRON_SECRET), X-Homie-Secret, o un ADMIN
// Firebase (bottone "Esegui ora"; un proprietario non può lanciarlo — prima
// bastava il ruolo landlord e la risposta portava email e numeri di tutti).
// Query: ?dry=1 (calcola, non scrive né spedisce) · ?month=YYYY-MM (default:
// il mese scorso, ora di Roma) · ?ownerId=<id> · ?force=1 (rimanda anche ciò
// che risulta inviato o incerto — solo cron/admin) · ?preview=1 (anteprima
// all'operatore per questo giro, qualunque sia la modalità — solo cron/admin;
// non tocca lo stato d'invio del mese).

import { PDFDocument, rgb } from 'pdf-lib';
import PALAZZO from '../../js/palazzo-engine.js';
import RENT from '../../js/rent-engine.js';
import CS from '../../js/contract-state.js';
import {
  requireCronOrAdmin, fsGet, fsList, fsCreate, fsPatch, logActivity, tgNotify,
  reportEmployeeHealth, saveReport, esc,
} from '../employees/_lib.js';
import { fsGetMany, fsGetVersioned, fsCommit } from '../homie/_lib.js';
import { storageUpload, sendEmail } from '../agent/_lib.js';
import { shell, para, fine, btn, rule, tiles } from '../preagreement/_notify.js';
import { wa, brandAssets, masthead, stampFooters, INK, GREY, FAINT, GOLD, HAIR, RED } from '../_pdfbrand.js';
import { runBudget } from '../_budget.js';

const EMPLOYEE = 'rendiconto';
const MODES = ['off', 'preview', 'auto'];
const EMAIL_MS = Number(process.env.RENDICONTO_EMAIL_MS) > 0 ? Number(process.env.RENDICONTO_EMAIL_MS) : 15000;
const UPLOAD_MS = 10000;
const STALE_SENDING_MS = 3 * 60 * 1000;   // la funzione vive al più 60s: dopo 3' un 'sending' è morto
const READ_COST_MS = 6000;                // letture mirate di un proprietario + il rendiconto puro
const SEND_MARGIN_MS = 5000;              // stato + PDF + archivio (col tetto di ciò che resta) + `sent`
// I giorni del mese in cui il cron gira («10 6 <giorni> * *» in vercel.json).
// Il recap promette un nuovo tentativo automatico solo se domani è fra
// questi: tests/rendiconto/tempo.mjs li confronta col file vero, così la
// frase non può dire «riprova domani» con un cron mensile.
export const CRON_DAYS = [1];
const adminEmail = () => process.env.ADMIN_NOTIFY_EMAIL || process.env.GMAIL_USER || 'valentino@boom-rome.com';

const str = (v) => (v == null ? '' : String(v).trim());
const clip = (v, n = 120) => str(v).slice(0, n);
const norm = (v) => str(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Numeri e date all'italiana, deterministici ────────────────────────────
// toLocaleString con ICU ridotta stampa "1600" invece di "1.600" (la lezione
// già pagata su /executive e sul fascicolo): qui si scrive a mano.
export function eur(n) {
  const v = round2(Number(n) || 0), neg = v < 0;
  const [i, d] = Math.abs(v).toFixed(2).split('.');
  return (neg ? '-' : '') + '€' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d === '00' ? '' : ',' + d);
}
// Il numero degli arretrati: la somma, «da verificare» quando ci sono rate
// scadute ma nessun importo leggibile — mai «€0» con una rata non pagata.
export function arrearsText(t) {
  if (!t || !t.arrearsCount) return eur(0);
  return t.arrears > 0 ? eur(t.arrears) : 'da verificare';
}
export const itDate = (v) => { const x = PALAZZO.day(v); return x ? `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}` : ''; };
const dm = (v) => { const x = PALAZZO.day(v); return x ? `${x.slice(8, 10)}/${x.slice(5, 7)}` : ''; };
const mese = (m) => PALAZZO.monthLabel(m).toLowerCase();          // «ottobre 2026»
const Mese = (m) => PALAZZO.monthLabel(m);                        // «Ottobre 2026»

// Il canale, in parole (mai «stripe», «bank», «dichiarato» grezzi).
const VIA = {
  bonifico: 'bonifico', bank: 'bonifico', contanti: 'contanti', cash: 'contanti',
  stripe: 'carta, tramite BOOM', card: 'carta, tramite BOOM', carta: 'carta, tramite BOOM',
  sepa: 'addebito SEPA, tramite BOOM', dichiarato: 'dichiarato dalla proprietà',
};
const EVIDENCE = {
  'estratto-conto-locatore': "visto sull'estratto conto del locatore", 'ricevuta-inquilino': "ricevuta dell'inquilino",
  'conferma-proprietaria': 'confermato dalla proprietà', 'banca-boom': 'visto sul conto BOOM',
};
export function viaText(p) {
  const v = VIA[norm(p && p.paidVia)] || '', e = EVIDENCE[norm(p && p.paidEvidence)] || '';
  if (e && v && /proprieta/.test(norm(e)) && /proprieta/.test(norm(v))) return v;
  return [v, e].filter(Boolean).join(' · ');
}

// ── Modalità per proprietario ─────────────────────────────────────────────
export function resolveMode(user, imported) {
  const raw = norm(user && user.rendicontoMode);
  if (MODES.includes(raw)) return { mode: raw, source: 'scelta' };
  if (raw) return { mode: 'preview', source: 'valore non valido', invalid: clip(user.rendicontoMode, 30) };
  return { mode: imported ? 'preview' : 'auto', source: imported ? 'predefinita: ha interni presi in carico dalla tabella' : 'predefinita' };
}

// ── Il rendiconto di UN proprietario, puro (si testa senza rete) ──────────
function contractRent(c) {
  if (!c) return null;
  const v = RENT.amount(c.rent);
  if (v != null) return v;
  return c.canone ? RENT.amount(c.canone.monthly != null ? c.canone.monthly : c.canone.amount) : null;
}
function payLabel(r) {
  const p = r.payment || {}, type = norm(p.type);
  if (type === 'deposit-balance') return 'saldo del deposito cauzionale';
  if (type === 'deposit') return 'deposito cauzionale';
  if (!r.isRent) return clip(p.description || p.label || p.type, 60) || 'altro addebito';
  let s = r.month ? 'rata di ' + mese(r.month) : 'rata';
  if (r.coversTo && r.month && r.coversTo > r.month) s = `rata da ${mese(r.month)} a ${mese(r.coversTo)}`;
  // Il periodo di contratto quando non coincide col mese di calendario
  // (un contratto dal 15/09 paga «15/09–14/10»), o quando è parziale.
  const pf = PALAZZO.day(p.periodFrom), pt = PALAZZO.day(p.periodTo);
  if (pf && pt && (pf.slice(8) !== '01' || p.prorated === true)) s += ` (${dm(pf)}–${dm(pt)})`;
  return s;
}
function splitOf(r) {
  const p = r.payment || {}, ra = RENT.amount(p.rentAmount), oa = RENT.amount(p.oneriAmount);
  if (ra == null || oa == null || !(oa > 0) || r.amount == null || Math.abs(ra + oa - r.amount) > 0.01) return null;
  return { rent: ra, oneri: oa };
}
function reminderOf(r) {
  const p = r.payment || {};
  let d = PALAZZO.day(p.lastReminderDate);
  if (!d && Array.isArray(p.dunningHistory)) {
    d = p.dunningHistory.map((x) => PALAZZO.day(x && x.at)).filter(Boolean).sort().pop() || '';
  }
  // Un link della rata o un sollecito mandato dal Palazzo: in entrambi i casi
  // BOOM ha chiesto il pagamento, e la proprietaria lo deve leggere.
  return d ? ` · pagamento chiesto all'inquilino il ${itDate(d)}` : '';
}
// Tutto ciò che non è pagato, scaduto o da pagare: in verifica da BOOM, col
// perché quando lo si sa (un bonifico segnalato, un pagamento in corso).
function reviewText(r) {
  const p = r.payment || {};
  if (r.state === 'reported') {
    const d = PALAZZO.day(p.tenantReportDate || p.tenantReportedAt);
    return `bonifico segnalato dall'inquilino${d ? ' il ' + itDate(d) : ''}, in verifica da BOOM`;
  }
  if (r.state === 'processing') return 'pagamento in corso (carta o addebito SEPA), in verifica da BOOM';
  return 'in verifica da BOOM';
}
function unitNames(p) {
  const interno = PALAZZO.unitOf(p), scala = PALAZZO.scalaOf(p), f = PALAZZO.floorOf(p);
  const fl = f ? (f.top ? 'attico' : PALAZZO.floorLabel(f.n)) : '';
  const address = clip(p.address, 90), name = clip(p.name, 80);
  if (interno) {
    return { title: ['Int. ' + interno, scala ? 'scala ' + scala : '', fl].filter(Boolean).join(' · '),
      subtitle: address || name, short: 'int. ' + interno + (scala ? ' scala ' + scala : '') };
  }
  const t = name || address || 'Immobile';
  return { title: [t, fl].filter(Boolean).join(' · '), subtitle: name && address && norm(name) !== norm(address) ? address : '', short: t };
}
// Due sezioni con lo stesso titolo non si distinguono: mai (cinque
// «Piazzale Prenestino 42, Roma» erano il difetto). Si aggiunge l'indirizzo,
// e se non basta un numero d'ordine.
function dedupeNames(items, key, extra) {
  const seen = new Map();
  items.forEach((it) => seen.set(it[key], (seen.get(it[key]) || 0) + 1));
  items.forEach((it) => { if (seen.get(it[key]) > 1 && extra(it)) it[key] = it[key] + ' — ' + extra(it); });
  const again = new Map();
  items.forEach((it) => { const k = it[key], n = (again.get(k) || 0) + 1; again.set(k, n); });
  const idx = new Map();
  items.forEach((it) => { const k = it[key]; if (again.get(k) > 1) { const n = (idx.get(k) || 0) + 1; idx.set(k, n); it[key] = k + ' (' + n + ')'; } });
}
// L'ordine della pagina del Palazzo: via, scala, interno (in numero, non in
// testo: 5 prima di 13). Così la proprietaria trova l'interno dove lo cerca.
function byPlace(a, b) {
  const sa = PALAZZO.streetKey(a.address) || norm(a.address), sb = PALAZZO.streetKey(b.address) || norm(b.address);
  if (sa !== sb) return sa.localeCompare(sb, 'it');
  const nat = (x, y) => String(x || '').localeCompare(String(y || ''), 'it', { numeric: true, sensitivity: 'base' });
  return nat(PALAZZO.scalaOf(a), PALAZZO.scalaOf(b)) || nat(PALAZZO.unitOf(a), PALAZZO.unitOf(b)) || nat(a.name, b.name);
}

/**
 * @param o { ownerId, user, landlord, properties, contracts, payments, maintenance, users, month, now }
 * @returns il rendiconto: sezioni (una per interno con movimenti), liberi, esclusi, totali, righe in breve.
 */
export function ownerReport(o) {
  const month = PALAZZO.monthOf(o.month);
  const ctx = PALAZZO.context({ properties: o.properties, contracts: o.contracts, payments: o.payments, users: o.users, maintenance: o.maintenance, now: o.now });
  const asOf = ctx.today;
  const mEnd = month + '-31';
  const sections = [], vacant = [], before = [];
  let cashIn = 0, unknownAmounts = 0;

  for (const p of ctx.properties.slice().sort(byPlace)) {
    const names = unitNames(p);
    const gd = PALAZZO.monthOf(p.gestioneDal);
    if (gd && month < gd) { before.push({ ...names, gestioneDal: gd }); continue; }
    const um = PALAZZO.unitMonth(ctx, p, month);
    const rows = ctx.paymentsByProperty[str(p.id)] || [];
    const monthIds = new Set(um.rows.map((r) => r.id));
    const other = rows.filter((r) => !monthIds.has(r.id) && r.state !== 'cancelled');
    rows.forEach((r) => { if (r.state === 'paid' && r.paidDate && r.paidDate.slice(0, 7) === month && r.amount != null) cashIn = round2(cashIn + r.amount); });
    const cash = other.filter((r) => r.state === 'paid' && r.paidDate && r.paidDate.slice(0, 7) === month);
    const late = other.filter((r) => r.state === 'overdue');
    // Tutto ciò che non è pagato, scaduto o da pagare è «in verifica»: un
    // bonifico segnalato, un pagamento in corso, uno stato che il motore non
    // sa leggere (una contestazione, un rimborso). Mai taciuto, mai arretrato.
    const review = other.filter((r) => !['paid', 'overdue', 'due', 'cancelled'].includes(r.state) && (!r.month || r.month <= month));
    const maint = ((ctx.maintenanceByProperty && ctx.maintenanceByProperty[str(p.id)]) || []).filter((x) =>
      (x.createdAt && x.createdAt.slice(0, 7) === month) || (x.resolvedAt && x.resolvedAt.slice(0, 7) === month)
      || (x.open && x.createdAt && x.createdAt <= mEnd));
    const lease = um.lease;
    const placeholder = !!(lease && CS.isPlaceholder(lease));
    const active = um.occupied || um.rows.length || cash.length || late.length || review.length || maint.length;
    if (!active) {
      vacant.push({ ...names, incoming: um.state === 'incoming' ? um.leaseStart : '', fromProposal: false });
      continue;
    }

    // ── fatti del contratto ──
    const facts = [];
    const span = (c) => {
      const s = PALAZZO.day(c.startDate), e = c === lease ? um.leaseEnd || PALAZZO.day(c.endDate) : PALAZZO.day(c.endDate);
      return s && e ? `dal ${itDate(s)} al ${itDate(e)}` : s ? `dal ${itDate(s)}` : e ? `fino al ${itDate(e)}` : '';
    };
    const rent = placeholder ? null : contractRent(lease);
    const oneri = placeholder || !lease ? null : RENT.amount(lease.oneriQuota);
    if (lease) {
      if (um.tenants.length) facts.push({ k: um.tenants.length > 1 ? 'Inquilini' : 'Inquilino', v: um.tenants.join(', ') });
      if (placeholder) facts.push({ k: 'Contratto', v: 'in arrivo da BOOM' });
      else {
        if (span(lease)) facts.push({ k: 'Contratto', v: span(lease) });
        facts.push({ k: 'Canone mensile', v: rent != null ? eur(rent) : 'da verificare' });
        if (oneri != null && oneri > 0) facts.push({ k: 'Oneri accessori mensili (acconto)', v: eur(oneri) });
      }
    } else {
      // Libero nel mese, ma con qualcosa da dire (un arretrato dell'inquilino
      // uscito, una manutenzione): mai il canone di un contratto che non c'è.
      facts.push({ k: 'Nel mese', v: 'libero' });
      if (um.incoming) facts.push({ k: 'Nuovo contratto', v: [span(um.incoming), um.tenants.join(', ')].filter(Boolean).join(' · ') || 'in arrivo' });
    }
    const who = (r) => (r.tenantName && !um.tenants.includes(r.tenantName) ? ` (${r.tenantName})` : '');

    // ── la rata del mese ──
    const lines = [];
    let collectedOneri = 0, coverLate = null;
    for (const r of um.rows) {
      const p0 = r.payment || {};
      if (r.amount == null) unknownAmounts++;
      const label = cap(payLabel(r)), split = splitOf(r);
      const sub = split ? `canone ${eur(split.rent)} + oneri accessori ${eur(split.oneri)}` : '';
      if (r.month !== month) {
        // Una rata di più mesi (trimestrale) nata in un altro mese. Pagata o
        // ancora da pagare: basta dire dove sta l'importo. Ma se è SCADUTA o
        // in verifica lo si dice qui come per la rata del mese — prima la
        // sezione mostrava solo «Coperto dalla rata…» in grigio, mentre il
        // riepilogo contava €3.000 di arretrati e diceva «non hanno pagato».
        if (r.state === 'overdue') {
          if (!coverLate) coverLate = { label: payLabel(r), due: r.dueDate };
          lines.push({ text: `${label} · NON PAGATA, scaduta il ${itDate(r.dueDate)}${reminderOf(r)}`, amount: r.amount, tone: 'late', sub });
        } else if (r.state === 'paid' || r.state === 'due') {
          lines.push({ text: `Coperto dalla ${payLabel(r)}${r.state === 'paid' ? ', pagata' : ''} — importo nel rendiconto di ${mese(r.month)}`, amount: null, tone: 'muted' });
        } else {
          lines.push({ text: `${label} · ${reviewText(r)}`, amount: r.amount, tone: 'review', sub });
        }
        continue;
      }
      if (r.state === 'paid') {
        const via = viaText(p0);
        lines.push({ text: `${label} · pagata${r.paidDate ? ' il ' + itDate(r.paidDate) : ''}${via ? ' · ' + via : ''}`, amount: r.amount, tone: 'paid', sub });
        if (split) collectedOneri = round2(collectedOneri + split.oneri);
      } else if (r.state === 'overdue') {
        lines.push({ text: `${label} · NON PAGATA, scaduta il ${itDate(r.dueDate)}${reminderOf(r)}`, amount: r.amount, tone: 'late', sub });
      } else if (r.state === 'due') {
        lines.push({ text: `${label} · da pagare${r.dueDate ? ' entro il ' + itDate(r.dueDate) : ''}`, amount: r.amount, tone: 'due', sub });
      } else {
        lines.push({ text: `${label} · ${reviewText(r)}`, amount: r.amount, tone: 'review', sub });
      }
    }
    if (!um.rows.length && um.occupied && !placeholder) {
      lines.push({ text: `Rata di ${mese(month)} · non ancora registrata, in verifica da BOOM`, amount: null, tone: 'review', noAmount: true });
    }
    // ── gli altri mesi: incassi arrivati nel mese, arretrati, verifiche ──
    let cashOther = 0;
    for (const r of cash) {
      const via = viaText(r.payment), sp = splitOf(r);
      lines.push({ text: `Incassata il ${itDate(r.paidDate)}: ${payLabel(r)}${who(r)}${via ? ' · ' + via : ''}`, amount: r.amount, tone: 'paid',
        sub: sp ? `canone ${eur(sp.rent)} + oneri accessori ${eur(sp.oneri)}` : '' });
      if (r.amount != null) cashOther = round2(cashOther + r.amount);
      if (r.amount == null) unknownAmounts++;
    }
    for (const r of late.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))) {
      lines.push({ text: `Arretrato: ${payLabel(r)}${who(r)}, scaduta il ${itDate(r.dueDate)}${reminderOf(r)}`, amount: r.amount, tone: 'late' });
      if (r.amount == null) unknownAmounts++;
    }
    for (const r of review) {
      const d = PALAZZO.day((r.payment || {}).tenantReportDate || (r.payment || {}).tenantReportedAt);
      lines.push({ text: r.state === 'reported'
        ? `In verifica da BOOM: ${payLabel(r)}${who(r)}, bonifico segnalato dall'inquilino${d ? ' il ' + itDate(d) : ''}`
        : r.state === 'processing' ? `In verifica da BOOM: ${payLabel(r)}${who(r)}, pagamento in corso`
          : `In verifica da BOOM: ${payLabel(r)}${who(r)}`, amount: r.amount, tone: 'review' });
    }
    for (const x of maint) {
      const st = !x.open ? (x.resolvedAt ? 'risolta il ' + itDate(x.resolvedAt) : 'chiusa') : x.inProgress ? 'in lavorazione' : 'aperta' + (x.createdAt ? ' dal ' + itDate(x.createdAt) : '');
      lines.push({ text: `Manutenzione: ${clip(x.title, 60)} — ${st}`, amount: null, tone: 'info' });
    }

    // Gli oneri sono un acconto «salvo conguaglio»: a fine anno serve sapere
    // quanto è stato versato. Rate dell'anno fino al mese, già pagate, con la
    // scomposizione scritta sulla rata (mai dedotta).
    const yr = month.slice(0, 4);
    const oneriYtd = round2(rows.filter((r) => r.state === 'paid' && r.month && r.month.slice(0, 4) === yr && r.month <= month)
      .reduce((a, r) => { const sp = splitOf(r); return a + (sp ? sp.oneri : 0); }, 0));
    if (oneriYtd > 0) facts.push({ k: `Oneri accessori versati nel ${yr}`, v: eur(oneriYtd) });

    const ar = PALAZZO.arrearsOf(ctx, p);
    // Una rata scaduta senza importo leggibile è un arretrato lo stesso: conta
    // nel numero, non nella somma. Serve per non scrivere «Nessun arretrato»
    // accanto a «non hanno pagato» (il totale in euro, da solo, diceva 0).
    const arUnknown = rows.filter((r) => r.state === 'overdue' && r.amount == null).length;
    sections.push({
      id: str(p.id), ...names, address: clip(p.address, 90), interno: PALAZZO.unitOf(p),
      state: um.state, placeholder, tenants: um.tenants, landlordName: placeholder ? '' : clip(lease && lease.landlordName, 90),
      rent, oneri, facts, lines,
      expected: um.expected, collected: um.collected, collectedOneri, cashOther,
      arrears: ar.amount, arrearsCount: ar.count, arrearsUnknown: arUnknown, arrearsOld: round2(ar.amount - (um.lateAmount || 0)),
      dueDate: (um.rows.find((r) => r.month === month && r.dueDate) || {}).dueDate || (coverLate && coverLate.due) || '',
      // Il mese non ha una rata sua ma è coperto da una rata scaduta di più
      // mesi: nel riepilogo si dice QUALE («rata da settembre a novembre»).
      lateCover: !um.rows.some((r) => r.month === month && r.state === 'overdue') && coverLate ? coverLate.label : '',
      reportDate: (() => { const r = um.rows.find((x) => x.state === 'reported'); return r ? PALAZZO.day((r.payment || {}).tenantReportDate || (r.payment || {}).tenantReportedAt) : ''; })(),
    });
  }

  dedupeNames(sections, 'title', (s) => s.subtitle);
  dedupeNames(sections, 'short', (s) => s.address);
  dedupeNames(vacant, 'short', (s) => s.subtitle);

  // ── chi è il locatore: la persona dell'account o la società dei contratti ──
  const ownerName = clip((o.user && o.user.name) || (o.landlord && o.landlord.name)
    || (sections.find((s) => s.landlordName) || {}).landlordName || 'Proprietario', 80);
  const ownerEmail = clip((o.user && o.user.email) || (o.landlord && o.landlord.email)
    || (o.contracts || []).map((c) => str(c && c.landlordEmail)).find(Boolean) || '', 120);
  const lnames = [];
  sections.forEach((s) => { if (s.landlordName && !lnames.some((n) => norm(n) === norm(s.landlordName))) lnames.push(s.landlordName); });
  let landlordLine = '';
  if (lnames.length === 1 && norm(lnames[0]) !== norm(ownerName)) landlordLine = lnames[0];
  if (lnames.length > 1) {
    sections.forEach((s) => { if (s.landlordName && norm(s.landlordName) !== norm(ownerName)) s.facts.unshift({ k: 'Locatore', v: s.landlordName }); });
  }

  // ── gli immobili, per palazzo ──
  const groups = [];
  [...sections, ...vacant].forEach((s) => {
    const k = PALAZZO.streetKey(s.address || s.subtitle) || norm(s.address || s.subtitle || s.title);
    let g = groups.find((x) => x.key === k);
    if (!g) groups.push(g = { key: k, label: clip(s.address || s.subtitle || s.title, 90), units: 0 });
    g.units++;
  });
  const placesText = groups.map((g) => g.units > 1 ? `${g.label} (${g.units} interni)` : g.label).join(' · ');

  const sum = (k) => round2(sections.reduce((a, s) => a + (s[k] || 0), 0));
  const totals = {
    expected: sum('expected'), collected: sum('collected'), collectedOneri: sum('collectedOneri'),
    arrears: sum('arrears'), arrearsCount: sum('arrearsCount'), arrearsUnknown: sum('arrearsUnknown'),
    arrearsOld: sum('arrearsOld'), cashIn, cashOther: sum('cashOther'), unknownAmounts,
    units: sections.length, vacant: vacant.length, before: before.length,
  };
  const pick = (f) => sections.filter(f);
  const lists = {
    paid: pick((s) => s.state === 'paid'),
    late: pick((s) => s.state === 'late'),
    review: pick((s) => s.state === 'review' || s.state === 'unknown' || (s.state === 'norate' && !s.placeholder)),
    due: pick((s) => s.state === 'due'),
    placeholder: pick((s) => s.placeholder),
    arrearsOld: pick((s) => s.arrearsOld > 0),
  };
  const hasOneri = sections.some((s) => (s.oneri || 0) > 0 || s.collectedOneri > 0);
  const viaBoom = sections.some((s) => s.lines.some((l) => /tramite BOOM/.test(l.text)));

  // ── il mese in breve: quello che chiederebbe al telefono ──
  const nm = (s) => s.short;
  const brief = [];
  if (lists.paid.length) brief.push(`Hanno pagato: ${lists.paid.map(nm).join(', ')}.`);
  const lateWhy = (s) => (s.dueDate || s.lateCover ? ` (${[s.lateCover, s.dueDate ? 'scaduta il ' + itDate(s.dueDate) : ''].filter(Boolean).join(', ')})` : '');
  if (lists.late.length) brief.push(`Non hanno pagato la rata di ${mese(month)}: ${lists.late.map((s) => nm(s) + lateWhy(s)).join(', ')}.`);
  if (lists.review.length) brief.push(`In verifica da BOOM: ${lists.review.map((s) => nm(s) + (s.reportDate ? ` (bonifico segnalato il ${itDate(s.reportDate)})` : '')).join(', ')}.`);
  if (lists.due.length) brief.push(`Da pagare entro la scadenza: ${lists.due.map((s) => nm(s) + (s.dueDate ? ` (entro il ${itDate(s.dueDate)})` : '')).join(', ')}.`);
  if (lists.placeholder.length) brief.push(`Contratto in arrivo da BOOM: ${lists.placeholder.map(nm).join(', ')}.`);
  if (lists.arrearsOld.length) brief.push(`Arretrati di altri mesi: ${eur(totals.arrearsOld)} (${lists.arrearsOld.map(nm).join(', ')}).`);
  if (vacant.length) brief.push(`Liberi nel mese: ${vacant.map((v) => v.short + (v.incoming ? ` (nuovo contratto dal ${itDate(v.incoming)})` : '')).join(', ')}.`);
  // «Nessun arretrato» si decide dal NUMERO delle rate scadute, mai dalla
  // somma: una rata scaduta senza importo farebbe 0 euro e una bugia.
  if (!totals.arrearsCount) brief.push(`Nessun arretrato al ${itDate(asOf)}.`);
  else if (!totals.arrears) brief.push(`Arretrati al ${itDate(asOf)}: importo da verificare (${totals.arrearsCount === 1 ? 'una rata scaduta' : totals.arrearsCount + ' rate scadute'} senza importo registrato).`);
  else if (totals.arrearsUnknown) brief.push(`Arretrati al ${itDate(asOf)}: ${eur(totals.arrears)}, più ${totals.arrearsUnknown === 1 ? 'una rata' : totals.arrearsUnknown + ' rate'} con importo da verificare.`);

  const notes = [
    `«Rate di ${mese(month)}»: le rate di competenza del mese; un pagamento arrivato in un altro mese è indicato con la sua data.`,
    `Arretrati: rate scadute e non pagate al ${itDate(asOf)}. Un bonifico segnalato dall'inquilino non è un arretrato: BOOM lo verifica prima di registrarlo.`,
  ];
  if (hasOneri) notes.push(`Gli oneri accessori sono un acconto mensile pagato insieme al canone, salvo conguaglio: non fanno parte del canone. «Oneri accessori versati»: le rate del ${month.slice(0, 4)} fino a ${mese(month)}, già pagate.`);
  if (viaBoom) notes.push('«Tramite BOOM»: il pagamento è arrivato sul conto di BOOM, non su quello del locatore.');
  if (before.length) notes.push(`Interni presi in gestione da BOOM dopo ${mese(month)}, quindi non compresi: ${before.map((b) => b.short).join(', ')}.`);
  if (unknownAmounts) notes.push(unknownAmounts === 1 ? 'Una rata è senza importo registrato: BOOM la sta verificando.' : `${unknownAmounts} rate sono senza importo registrato: BOOM le sta verificando.`);

  return { ownerId: o.ownerId, ownerName, ownerEmail, landlordLine, month, label: Mese(month), asOf, placesText, groups,
    sections, vacant, before, totals, lists, brief, notes, hasOneri };
}

// ── Il PDF ───────────────────────────────────────────────────────────────
const GREEN = rgb(0.12, 0.5, 0.28);
const TONE = { paid: GREEN, late: RED, review: GOLD, due: INK, info: GREY, muted: FAINT };
export async function buildPdf(rep) {
  const pdf = await PDFDocument.create();
  const b = await brandAssets(pdf);
  const W = 595, H = 842, M = 48, BOTTOM = 72;
  let page, y, cont = '';
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = masthead(page, b, { W, H, M, title: 'Rendiconto proprietario', date: rep.label });
    // Una sezione che continua sul foglio dopo ripete il suo nome: una riga
    // di importi senza l'interno a cui appartiene non si legge.
    if (cont) { T(`${cont} (segue)`, M, y, 9.5, b.bold, GOLD); y -= 18; }
  };
  const T = (t, x, yy, size, font, color) => page.drawText(wa(t), { x, y: yy, size, font: font || b.font, color: color || INK });
  const width = (t, size, font) => (font || b.font).widthOfTextAtSize(wa(t), size);
  const wrap = (t, size, maxW, font) => {
    const words = wa(t).split(' '), out = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (cur && width(next, size, font) > maxW) { out.push(cur); cur = w; } else cur = next;
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  };
  const need = (h) => { if (y - h < BOTTOM) newPage(); };
  const para0 = (t, size, color, font, indent = 0) => {
    for (const ln of wrap(t, size, W - 2 * M - indent, font)) { need(size + 4); T(ln, M + indent, y, size, font, color); y -= size + 4; }
  };

  newPage();
  T(`RENDICONTO DI ${rep.label.toUpperCase()}`, M, y, 15, b.bold); y -= 21;
  if (rep.landlordLine) para0(`Locatore: ${rep.landlordLine} · alla c.a. di ${rep.ownerName}`, 9.5, GREY);
  else para0(`Proprietario: ${rep.ownerName}`, 9.5, GREY);
  if (rep.placesText) para0(`Immobili: ${rep.placesText}`, 9.5, GREY);
  para0(`Situazione dei pagamenti al ${itDate(rep.asOf)}`, 9.5, GREY);
  y -= 12;

  // Riepilogo: tre numeri, stessi del Palazzo.
  need(70);
  const t = rep.totals, col = [M, M + 175, M + 340];
  const mm = mese(rep.month);
  T(`RATE DI ${mm.toUpperCase()} · PAGATE`, col[0], y, 7.5, b.bold, GREY);
  T(`RATE DI ${mm.toUpperCase()} · DOVUTE`, col[1], y, 7.5, b.bold, GREY);
  T(`ARRETRATI AL ${itDate(rep.asOf)}`, col[2], y, 7.5, b.bold, GREY); y -= 19;
  T(eur(t.collected), col[0], y, 16, b.bold, GREEN);
  T(eur(t.expected), col[1], y, 16, b.bold, INK);
  T(arrearsText(t), col[2], y, 16, b.bold, t.arrearsCount > 0 ? RED : GREY); y -= 14;
  const subA = [t.arrearsOld > 0 ? `di cui di altri mesi ${eur(t.arrearsOld)}` : '',
    t.arrears > 0 && t.arrearsUnknown > 0 ? `più ${t.arrearsUnknown === 1 ? 'una rata' : t.arrearsUnknown + ' rate'} da verificare` : ''].filter(Boolean);
  if (t.collectedOneri > 0) T(`di cui oneri accessori ${eur(t.collectedOneri)}`, col[0], y, 7.5, b.font, GREY);
  subA.forEach((x, i) => T(x, col[2], y - i * 10, 7.5, b.font, GREY));
  if (t.collectedOneri > 0 || subA.length) y -= 12 + Math.max(0, subA.length - 1) * 10;
  if (round2(t.cashIn) !== round2(t.collected)) {
    para0(`Incassi registrati nel mese, per data di pagamento: ${eur(t.cashIn)}${t.cashOther > 0 ? ' (comprese rate di altri mesi)' : ''}.`, 8, GREY);
  }
  y -= 8;

  const sect = (title, subtitle) => {
    cont = '';
    need(subtitle ? 52 : 40);
    cont = title;
    y -= 6; T(title, M, y, 11, b.bold, GOLD); y -= 5;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.9, color: GOLD }); y -= 14;
    if (subtitle) { T(subtitle, M, y, 8.5, b.font, GREY); y -= 13; }
  };

  // Il mese in breve.
  if (rep.brief.length) {
    sect('Il mese in breve');
    for (const s of rep.brief) {
      const ls = wrap(s, 9.5, W - 2 * M - 14);
      need(ls.length * 13 + 2);
      T('•', M + 2, y, 9.5, b.font, GOLD);
      ls.forEach((ln, i) => { T(ln, M + 14, y, 9.5, b.font, INK); if (i < ls.length - 1) y -= 12.5; });
      y -= 14;
    }
    y -= 4;
  }

  // Un interno, una sezione.
  const VALW = 92;
  for (const s of rep.sections) {
    sect(s.title, s.subtitle);
    for (const f of s.facts) {
      const vs = wrap(f.v, 9.5, W - 2 * M - 180);
      need(vs.length * 12 + 3);
      T(f.k, M + 6, y, 9, b.font, GREY);
      vs.forEach((ln, i) => { T(ln, W - M - 6 - width(ln, 9.5), y, 9.5, b.font, INK); if (i < vs.length - 1) y -= 12; });
      y -= 14;
    }
    if (s.facts.length && s.lines.length) {
      need(30);   // il filo e la prima riga stanno insieme sullo stesso foglio
      page.drawLine({ start: { x: M + 6, y: y + 6 }, end: { x: W - M - 6, y: y + 6 }, thickness: 0.4, color: HAIR }); y -= 4;
    }
    for (const l of s.lines) {
      const ls = wrap(l.text, 9, W - 2 * M - VALW - 18);
      const extra = l.sub ? 11 : 0;
      need(ls.length * 12 + extra + 3);
      const color = TONE[l.tone] || INK;
      const amount = l.amount == null ? (l.noAmount || l.tone === 'info' || l.tone === 'muted' ? '' : 'importo da verificare') : eur(l.amount);
      if (amount) T(amount, W - M - 6 - width(amount, l.amount == null ? 8 : 9.5, l.tone === 'late' ? b.bold : b.font), y, l.amount == null ? 8 : 9.5, l.tone === 'late' ? b.bold : b.font, color);
      ls.forEach((ln, i) => { T(ln, M + 6, y, 9, i === 0 && l.tone === 'late' ? b.bold : b.font, l.tone === 'paid' || l.tone === 'due' ? INK : color); if (i < ls.length - 1) y -= 12; });
      if (l.sub) { y -= 11; T(l.sub, M + 14, y, 7.5, b.font, GREY); }
      y -= 14;
    }
    y -= 4;
  }

  if (rep.vacant.length) {
    sect('Liberi nel mese');
    for (const v of rep.vacant) {
      need(14);
      T(v.title + (v.subtitle ? ' — ' + v.subtitle : ''), M + 6, y, 9, b.font, INK);
      if (v.incoming) { const tx = `nuovo contratto dal ${itDate(v.incoming)}`; T(tx, W - M - 6 - width(tx, 8.5), y, 8.5, b.font, GREY); }
      y -= 14;
    }
    y -= 4;
  }

  // Note: le definizioni, perché un numero senza la sua regola si legge male.
  cont = '';
  y -= 6;
  for (const n of [...rep.notes, 'Importi lordi come da contratto. Documento generato da BOOM Roma — per ogni dettaglio: valentino@boom-rome.com']) {
    para0(n, 7.5, GREY);
    y -= 2;
  }
  stampFooters(pdf, b, { W, M });
  return Buffer.from(await pdf.save());
}

// ── L'email (IT, design system, PDF in allegato) ─────────────────────────
function greeting(name) {
  const n = str(name);
  if (!n || n === 'Proprietario') return 'Gentile proprietario,';
  if (/\b(s\.?\s?r\.?\s?l|s\.?\s?p\.?\s?a|s\.?\s?a\.?\s?s|s\.?\s?n\.?\s?c|srls|societ|immobiliare|holding)\b/i.test(n)) return `Spett.le ${esc(n)},`;
  return `Gentile ${esc(n.split(' ')[0])},`;
}
export function emailFor(rep, { preview = false, url = '', mode = null, modeSource = '', ownerEmail = '' } = {}) {
  const t = rep.totals, mm = mese(rep.month);
  const short = (arr) => arr.map((s) => esc(s.short)).join(', ');
  let body = '';
  if (preview) {
    body += para(`<strong>ANTEPRIMA per l'operatore — non inviato alla proprietaria.</strong>`)
      + fine(`Proprietaria: ${esc(rep.ownerName)} · ${ownerEmail ? esc(ownerEmail) : 'nessuna email in archivio'} · modalità del rendiconto: ${esc(mode === 'preview' ? 'anteprima' : mode || 'anteprima')}${modeSource ? ' — ' + esc(modeSource) : ''}.`)
      + fine("Per mandarlo a lei: nel Palazzo imposta il rendiconto su «automatico», poi «Esegui ora»: parte solo ciò che non le è ancora arrivato. Qui sotto, esattamente l'email che riceverebbe.")
      + rule();
  }
  body += para(greeting(rep.ownerName))
    + para(`in allegato il <strong>rendiconto di ${esc(mm)}</strong> per ${esc(rep.placesText || 'i suoi immobili')}.`
      + (rep.landlordLine ? `<br>Locatore: ${esc(rep.landlordLine)}${/\.$/.test(rep.landlordLine) ? '' : '.'}` : ''))
    + tiles([
      { k: `Rate di ${mm} pagate`, v: esc(eur(t.collected)), sub: t.collectedOneri > 0 ? `di cui oneri ${esc(eur(t.collectedOneri))}` : '' },
      { k: 'Dovute nel mese', v: esc(eur(t.expected)) },
      { k: `Arretrati al ${itDate(rep.asOf)}`, v: esc(arrearsText(t)),
        sub: t.arrears > 0 && t.arrearsUnknown > 0 ? `più ${t.arrearsUnknown === 1 ? 'una rata' : t.arrearsUnknown + ' rate'} da verificare` : '' },
    ]);
  const L = rep.lists;
  const lateWhy = (s) => (s.dueDate || s.lateCover ? ` (${[s.lateCover, s.dueDate ? 'scaduta il ' + itDate(s.dueDate) : ''].filter(Boolean).map(esc).join(', ')})` : '');
  if (L.late.length) body += fine(`⚠️ <strong>Non hanno pagato la rata di ${esc(mm)}</strong> — ${L.late.map((s) => esc(s.short) + lateWhy(s)).join(', ')}`);
  if (L.arrearsOld.length) body += fine(`⚠️ <strong>Arretrati di altri mesi</strong> — ${esc(eur(t.arrearsOld))}: ${short(L.arrearsOld)}`);
  if (L.review.length) body += fine(`🔎 <strong>In verifica da BOOM</strong> — ${L.review.map((s) => esc(s.short) + (s.reportDate ? ` (bonifico segnalato il ${itDate(s.reportDate)})` : '')).join(', ')}`);
  if (L.placeholder.length) body += fine(`📄 <strong>Contratto in arrivo da BOOM</strong> — ${short(L.placeholder)}`);
  if (!t.arrearsCount) body += fine(`✅ <strong>Nessun arretrato</strong> al ${itDate(rep.asOf)}`);
  else if (!t.arrears) body += fine(`⚠️ <strong>Arretrati: importo da verificare</strong> — ${t.arrearsCount === 1 ? 'una rata scaduta' : t.arrearsCount + ' rate scadute'} senza importo registrato, BOOM ${t.arrearsCount === 1 ? 'la' : 'le'} sta verificando`);
  body += rule()
    + (url ? btn(url, 'Apri il rendiconto') : '')
    + fine('Il rendiconto arriva il 1° di ogni mese. Per qualsiasi domanda basta rispondere a questa email.');
  const where = rep.groups.length === 1 ? rep.groups[0].label : rep.groups.length > 1 ? `${rep.groups[0].label} e altri ${rep.groups.length - 1}` : '';
  const subject = (preview ? 'ANTEPRIMA — ' : '📒 ') + `Rendiconto di ${rep.label}${where ? ' — ' + clip(where, 70) : ''}`;
  return { subject, html: shell(body, `Rendiconto di ${rep.label} — rate pagate ${eur(t.collected)} di ${eur(t.expected)}`) };
}

// ── Letture mirate ───────────────────────────────────────────────────────
// A pagine per nome documento: nessun tetto che taglia in silenzio. Il
// rifiltro dopo la query è una cintura: la porta non si fida della risposta.
async function listAll(collection, opts = {}, { page = 500, maxPages = 40 } = {}) {
  const out = []; let after = null, truncated = false;
  for (let i = 0; ; i++) {
    if (i >= maxPages) { truncated = true; break; }
    const docs = await fsList(collection, { ...opts, limit: page, afterId: after });
    out.push(...docs);
    if (docs.length < page) break;
    const last = docs[docs.length - 1] && docs[docs.length - 1].id;
    if (!last || last === after) break;   // nessun progresso: mai un giro infinito
    // Un id che il cursore non accetta: ci si ferma e si DICE (troncato),
    // invece di far cadere il giro intero.
    if (!/^[\w.-]{1,180}$/.test(last) || ['.', '..'].includes(last)) { truncated = true; break; }
    after = last;
  }
  return { docs: out, truncated };
}
async function listIn(collection, field, values) {
  const vals = [...new Set((values || []).filter((v) => typeof v === 'string' && v))];
  const out = new Map(); let truncated = false;
  for (let i = 0; i < vals.length; i += 30) {
    const part = vals.slice(i, i + 30);
    const r = await listAll(collection, { filter: { field, op: 'IN', value: part } });
    truncated = truncated || r.truncated;
    for (const d of r.docs) if (d && part.includes(d[field])) out.set(d.id, d);
  }
  return { docs: [...out.values()], truncated };
}
const okId = (x) => typeof x === 'string' && /^[\w.-]{1,80}$/.test(x);
async function loadOwner(ownerId, props) {
  const ids = props.map((p) => p.id);
  const [cs, pp, mt] = await Promise.all([listIn('contracts', 'propertyId', ids), listIn('payments', 'propertyId', ids), listIn('maintenance', 'propertyId', ids)]);
  const pc = await listIn('payments', 'contractId', cs.docs.map((c) => c.id));
  const payments = new Map();
  [...pp.docs, ...pc.docs].forEach((p) => payments.set(p.id, p));
  const tenantIds = [...new Set(cs.docs.map((c) => c.tenantId).filter(okId))];
  const paths = [...(okId(ownerId) ? ['users/' + ownerId, 'landlords/' + ownerId] : []), ...tenantIds.map((t) => 'users/' + t)];
  const got = paths.length ? await fsGetMany(paths) : new Map();
  let user = got.get('users/' + ownerId) || null, landlord = got.get('landlords/' + ownerId) || null;
  if (!okId(ownerId)) {
    user = await fsGet('users/' + encodeURIComponent(ownerId)).catch(() => null);
    landlord = await fsGet('landlords/' + encodeURIComponent(ownerId)).catch(() => null);
  }
  const users = tenantIds.map((t) => got.get('users/' + t)).filter(Boolean);
  return { contracts: cs.docs, payments: [...payments.values()], maintenance: mt.docs, user, landlord, users,
    truncated: cs.truncated || pp.truncated || pc.truncated || mt.truncated };
}

// ── Lo stato d'invio del mese ────────────────────────────────────────────
// → { go:true, attempts } oppure { go:false, reason }. Un doc del vecchio
// codice (senza status) è un invio fatto: non si rispedisce.
// Senza stato scritto l'email NON parte (`state_unavailable`): un 503, una
// rete caduta, regole che rifiutano, o una creazione riuscita la cui risposta
// si è persa. Prima si procedeva lo stesso («regole non deployate») e il giro
// dopo — col cron dei giorni 1–5, il giorno dopo da solo — rimandava lo
// stesso mese. Il caso della risposta persa lascia un `sending` che invecchia
// e il giro dopo riprende (fase `building`: l'email non era partita).
async function claim(docId, { mode, force, now }) {
  const base = { ownerId: docId.split('_').slice(0, -1).join('_'), month: docId.split('_').pop() };
  const fields = { ...base, status: 'sending', phase: 'building', mode, startedAt: now.toISOString(), error: null };
  try { await fsCreate('rendiconti', { ...fields, attempts: 1 }, docId); return { go: true, attempts: 1 }; }
  catch (e) {
    if (!e.exists) {
      const m = /\((\d{3})\)/.exec(String(e.message || ''));
      return { go: false, reason: 'state_unavailable', http: m ? Number(m[1]) : 0, error: clip(e.message, 160) };
    }
  }
  const cur = await fsGetVersioned('rendiconti/' + docId);
  if (!cur) return { go: false, reason: 'race' };
  const d = cur.data || {}, st = d.status || 'sent', prevMode = d.mode || 'auto';
  if (!force) {
    if (st === 'sent' && (prevMode !== 'preview' || mode === 'preview')) return { go: false, reason: 'already_sent' };
    if (st === 'uncertain') return { go: false, reason: 'uncertain', error: d.error || '' };
    if (st === 'sending') {
      const age = now - Date.parse(d.startedAt || 0);
      if (age < STALE_SENDING_MS) return { go: false, reason: 'in_progress' };
      if (d.phase === 'emailing') {
        try { await fsPatch('rendiconti/' + docId, { status: 'uncertain', error: 'interrotto durante l\'invio' }); } catch { /* resta sending */ }
        return { go: false, reason: 'uncertain', error: 'interrotto durante l\'invio' };
      }
    }
  }
  try {
    await fsCommit([{ docPath: 'rendiconti/' + docId, fields: { ...fields, attempts: (Number(d.attempts) || 1) + 1 }, precondition: { updateTime: cur.updateTime } }]);
  } catch (e) {
    if (e.conflict) return { go: false, reason: 'in_progress' };
    throw e;
  }
  return { go: true, attempts: (Number(d.attempts) || 1) + 1 };
}
async function mark(docId, fields) {
  for (let i = 0; i < 2; i++) {
    try { await fsPatch('rendiconti/' + docId, fields); return true; } catch (e) { if (i) console.warn('[rendiconto] stato non scritto', docId, e.message); }
  }
  return false;
}
// Il tempo che resta (un budget di prova senza `left` vale «tutto»).
const budgetLeft = (b) => (b && typeof b.left === 'function' ? b.left() : Infinity);
// Domani (ora di Roma) è un giorno di cron? Solo allora il recap promette
// un nuovo tentativo automatico.
export function autoRetryTomorrow(now = new Date()) {
  const today = PALAZZO.day(now);
  if (!today) return false;
  const t = new Date(today + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1);
  return CRON_DAYS.includes(t.getUTCDate());
}
const withTimeout = (p, ms, code) => Promise.race([p, new Promise((_, rej) => setTimeout(() => { const e = new Error(code); e.code = code; rej(e); }, ms))]);

// ── Il giro ──────────────────────────────────────────────────────────────
export async function run({ dry = false, monthOverride = null, onlyOwner = null, force = false, previewOnly = false, now = new Date(), budget = runBudget(60_000, 6_000) } = {}) {
  const cur = PALAZZO.day(now).slice(0, 7);
  const month = monthOverride || PALAZZO.monthAdd(cur, -1);
  const label = Mese(month);

  const propsRead = await listAll('properties', onlyOwner ? { filter: { field: 'ownerId', op: 'EQUAL', value: onlyOwner } } : {});
  const byOwner = new Map();
  for (const p of propsRead.docs) {
    const oid = clip(p.ownerId, 80);
    if (!oid || (onlyOwner && oid !== onlyOwner)) continue;
    if (!byOwner.has(oid)) byOwner.set(oid, []);
    byOwner.get(oid).push(p);
  }

  const results = [];
  const counts = { owners: 0, sent: 0, previews: 0, failed: 0, uncertain: 0, deferred: 0, skippedOff: 0, skippedNoEmail: 0,
    skippedNoActivity: 0, alreadySent: 0, inProgress: 0, parked: 0, totalCollected: 0 };

  let outOfTime = false;
  for (const ownerId of [...byOwner.keys()].sort()) {
    counts.owners++;
    // Poco tempo per cominciare: le letture. Il resto si chiede dopo, quando
    // serve davvero (prima si prenotavano 30s a testa e si fermava a 24s).
    if (outOfTime || !budget.afford(dry ? 5000 : READ_COST_MS)) { outOfTime = true; counts.deferred++; results.push({ ownerId, skipped: 'deferred' }); continue; }
    const docId = `${ownerId}_${month}`;
    let claimed = false, phase = 'letture', ownerName = clip((byOwner.get(ownerId)[0] || {}).ownerName, 80);
    try {
      const props = byOwner.get(ownerId);
      const data = await loadOwner(ownerId, props);
      const rep = ownerReport({ ownerId, ...data, properties: props, month, now });
      ownerName = rep.ownerName;
      const imported = props.some((p) => str(p.source) === 'palazzo-import') || data.contracts.some(CS.isImported);
      const m = resolveMode(data.user, imported);
      const mode = previewOnly ? 'preview' : m.mode;
      const base = { ownerId, ownerName: rep.ownerName, month, mode, modeSource: previewOnly ? 'anteprima richiesta' : m.source,
        ...(m.invalid ? { modeInvalid: m.invalid } : {}), ...(data.truncated || propsRead.truncated ? { truncated: true } : {}) };
      const nums = { collected: rep.totals.collected, expected: rep.totals.expected, arrears: rep.totals.arrears, cashIn: rep.totals.cashIn, properties: rep.sections.length };
      if (!rep.sections.length) {
        counts.skippedNoActivity++;
        results.push({ ...base, skipped: rep.before.length && !rep.vacant.length ? 'before_management' : 'no_activity' });
        continue;
      }
      if (mode === 'off') { counts.skippedOff++; results.push({ ...base, skipped: 'off' }); continue; }
      const to = mode === 'preview' ? adminEmail() : rep.ownerEmail;
      if (!to) { counts.skippedNoEmail++; results.push({ ...base, skipped: 'no_email' }); continue; }
      if (dry) {
        results.push({ ...base, ownerEmail: rep.ownerEmail, to, deliverTo: mode === 'preview' ? 'admin' : 'owner', ...nums, dry: true,
          units: rep.sections.map((s) => ({ title: s.title, state: s.state, arrears: s.arrears })), brief: rep.brief });
        continue;
      }

      // Prima di scrivere lo stato: c'è il tempo per l'email? Se no,
      // rimandato senza stato scritto (il giro dopo lo fa da capo).
      if (!budget.afford(EMAIL_MS + SEND_MARGIN_MS)) {
        outOfTime = true; counts.deferred++; results.push({ ...base, skipped: 'deferred' }); continue;
      }

      // Lo stato del mese: un'anteprima chiesta a mano non lo tocca.
      let attempts = 1;
      if (!previewOnly) {
        phase = 'stato';
        const c = await claim(docId, { mode, force, now });
        if (!c.go && c.reason === 'state_unavailable') {
          // Non scritto = non spedito: è un «non partito», il giro dopo riprova.
          counts.failed++;
          results.push({ ...base, failed: `stato: lo stato d'invio non si è potuto scrivere${c.http ? ` (Firestore ${c.http})` : ''}, email non spedita`,
            stateHttp: c.http || 0, error: c.error });
          continue;
        }
        if (!c.go) {
          const key = c.reason === 'already_sent' ? 'alreadySent' : c.reason === 'uncertain' ? 'parked' : 'inProgress';
          counts[key]++;
          results.push({ ...base, skipped: c.reason, ...(c.error ? { error: c.error } : {}) });
          continue;
        }
        claimed = true; attempts = c.attempts;
      }

      phase = 'pdf';
      const pdfBytes = await buildPdf(rep);
      // Dopo lo stato: se il tempo per l'email non c'è più, il mese resta
      // `failed` col motivo «tempo» e il giro dopo lo riprende. Mai un'email
      // avviata a pochi secondi dal kill della piattaforma: sarebbe incerta.
      if (!budget.afford(EMAIL_MS + SEND_MARGIN_MS)) {
        outOfTime = true;
        if (claimed) await mark(docId, { status: 'failed', phase: 'building', error: 'tempo: finito prima dell\'invio, il giro dopo riprova', failedAt: new Date().toISOString() });
        counts.deferred++;
        results.push({ ...base, skipped: 'deferred', after: 'stato' });
        continue;
      }
      phase = 'archivio';
      let url = null, storageWarn = null;
      const path = mode === 'preview' ? `rendiconti/${ownerId}/anteprima_${month}.pdf` : `rendiconti/${ownerId}/rendiconto_${month}.pdf`;
      // L'archivio ha il tempo che resta oltre l'email: col giro stretto si
      // salta (il PDF viaggia comunque in allegato), mai l'email.
      const upMs = Math.min(UPLOAD_MS, budgetLeft(budget) - EMAIL_MS - 1000);
      if (upMs < 1000) storageWarn = 'archivio saltato per mancanza di tempo: il PDF è in allegato';
      else {
        try { url = await withTimeout(storageUpload(path, pdfBytes, 'application/pdf'), upMs, 'storage_timeout'); }
        catch (e) { storageWarn = clip(e.message, 160); }   // il PDF viaggia comunque in allegato
      }

      const mail = emailFor(rep, { preview: mode === 'preview', url, mode, modeSource: base.modeSource, ownerEmail: rep.ownerEmail });
      const att = pdfBytes.length < 8 * 1024 * 1024
        ? [{ filename: `BOOM_Rendiconto_${label.replace(/\s+/g, '_')}${mode === 'preview' ? '_ANTEPRIMA' : ''}.pdf`, content: pdfBytes, contentType: 'application/pdf' }] : undefined;
      phase = 'email';
      if (claimed) await mark(docId, { phase: 'emailing' });
      await withTimeout(sendEmail({ to, subject: mail.subject, html: mail.html, attachments: att }), EMAIL_MS, 'email_timeout');
      if (claimed) await mark(docId, { status: 'sent', phase: 'done', sentAt: new Date().toISOString(), to, url: url || null, error: null });

      if (mode === 'preview') counts.previews++;
      else { counts.sent++; counts.totalCollected = round2(counts.totalCollected + rep.totals.collected); }
      results.push({ ...base, ownerEmail: rep.ownerEmail, to, deliverTo: mode === 'preview' ? 'admin' : 'owner', ...nums, url, attempts,
        ...(storageWarn ? { storageWarn } : {}) });
    } catch (e) {
      // Un proprietario che fallisce non ferma gli altri. Un timeout
      // sull'email è un esito INCERTO: si parcheggia, non si ritenta da solo.
      const uncertain = phase === 'email' && (e.code === 'email_timeout' || e.code === 'ETIMEDOUT' || /timeout/i.test(String(e.code || '')));
      const reason = clip(`${phase}: ${e.message}`, 300);
      console.error('[rendiconto]', ownerId, reason);
      if (claimed) await mark(docId, { status: uncertain ? 'uncertain' : 'failed', error: reason, failedAt: new Date().toISOString() });
      counts[uncertain ? 'uncertain' : 'failed']++;
      results.push({ ownerId, ...(ownerName ? { ownerName } : {}), month, [uncertain ? 'uncertain' : 'failed']: reason });
    }
  }

  const news = counts.sent + counts.previews + counts.failed + counts.uncertain + counts.deferred;
  if (!dry && news) {
    const nameOf = (r) => esc(r.ownerName || r.ownerId);
    // Il nuovo tentativo: «domani da solo» solo se domani c'è un giro del
    // cron; altrimenti è l'operatore che rilancia. Parole, mai parametri.
    const again = autoRetryTomorrow(now)
      ? 'riprova domani da solo, o «Esegui ora» nella Squadra'
      : 'rilancia «Esegui ora» nella Squadra';
    const lines = [`📒 <b>Rendiconti ${esc(label)}</b>`];
    if (counts.sent) lines.push(`✉️ ${counts.sent} inviati ai proprietari · rate pagate ${esc(eur(counts.totalCollected))}`);
    if (counts.previews) lines.push(`👁 ${counts.previews} anteprime all'operatore (NON inviate): ${results.filter((r) => r.deliverTo === 'admin').map(nameOf).join(', ')}`);
    results.filter((r) => r.failed).forEach((r) => lines.push(`⛔ Non partito: ${nameOf(r)} — ${esc(r.failed)} (${again})`));
    results.filter((r) => r.uncertain).forEach((r) => lines.push(`❓ Esito incerto: ${nameOf(r)} — controlla la posta inviata; se non è partito, premi «Rimanda» nel Palazzo`));
    if (counts.deferred) lines.push(`⏳ ${counts.deferred} rimandati per tempo: ${again} (chi l'ha già ricevuto non lo riceve due volte)`);
    if (counts.skippedNoEmail) lines.push(`⚠️ ${counts.skippedNoEmail} senza email: ${results.filter((r) => r.skipped === 'no_email').map(nameOf).join(', ')}`);
    if (results.some((r) => r.stateHttp === 403)) lines.push('⚠️ lo stato d\'invio è rifiutato dalle regole Firestore (rendiconti): finché non si sistemano, i rendiconti non partono');
    if (results.some((r) => r.truncated)) lines.push('⚠️ letture troncate: qualche dato potrebbe mancare');
    if (results.some((r) => r.modeInvalid)) lines.push('⚠️ modalità del rendiconto non valida su qualche proprietario: trattata come anteprima');
    await tgNotify(lines.join('\n'));
    await saveReport(EMPLOYEE, { summary: `${counts.sent} rendiconti ${label} inviati, ${counts.previews} anteprime, ${counts.failed} non partiti`, counts, results: results.slice(0, 20) });
    await logActivity('Rendiconti mensili', 'employee', counts, EMPLOYEE);
  }
  return { month, label, counts, results, ...(propsRead.truncated ? { truncated: true } : {}) };
}

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  // Il guardiano comune lascia passare anche proprietari e locatori col loro
  // token: qui no — la risposta porta email e numeri di TUTTI i proprietari.
  let isAdmin = actor === 'cron';
  if (actor.startsWith('admin:')) {
    const prof = await fsGet('users/' + actor.slice(6)).catch(() => null);
    if (!prof || prof.role !== 'admin') return res.status(403).json({ ok: false, error: 'admin_required' });
    isAdmin = true;
  }
  const q = req.query || {};
  const dry = q.dry === '1', force = q.force === '1', previewOnly = q.preview === '1';
  if ((force || previewOnly) && !isAdmin) return res.status(403).json({ ok: false, error: 'admin_required' });
  const monthOverride = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(q.month || '')) ? q.month : null;
  const onlyOwner = clip(q.ownerId, 80) || null;

  try {
    const out = await run({ dry, monthOverride, onlyOwner, force, previewOnly });
    const c = out.counts;
    if (!dry) await reportEmployeeHealth(EMPLOYEE, c.failed || c.uncertain
      ? { ok: false, stats: c, error: `${c.failed} non partiti, ${c.uncertain} incerti` } : { ok: true, stats: c });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[rendiconto]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}
