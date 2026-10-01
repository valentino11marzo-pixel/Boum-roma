/* BOOM · L'area proprietario, il cervello puro (window.BOOM_OWNER).
 *
 * buildVault({ properties, contracts, payments, documents, maintenance,
 *              rendiconti, ownerUid, now, signable }) → la cassaforte del
 * proprietario: per ogni immobile lo stato vero, il contratto, i soldi, le
 * prossime scadenze, cosa ha fatto BOOM (solo fatti datati), cosa manca e
 * — il punto — TUTTI i documenti, in cartelle, ciascuno con la sua data.
 *
 * Perché un motore puro e non una pagina che legge Firestore: i documenti
 * di un proprietario sono sparsi su sei posti (campi del contratto, campi
 * dell'immobile, fascicolo, identityDocs, la collection `documents`, i
 * rendiconti) e la domanda "cosa può vedere" è una REGOLA, non un layout.
 * Qui si testa senza browser e senza Firestore (tests/owner/run.mjs).
 *
 * Le regole dure:
 *  1. Mai un segreto: i token di firma (tenantSignToken, landlordSignToken),
 *     le ricevute interne, i campi dell'operatore non escono di qui. Il solo
 *     link di firma che passa è QUELLO DEL PROPRIETARIO, e solo quando tocca
 *     a lui (`signable`, deciso dal server che conosce i co-conduttori).
 *  2. Mai un URL che non sia nostro: solo https su Firebase Storage o su
 *     boomrome.com. Un campo sporco non diventa un link.
 *  3. I documenti d'identità del conduttore si vedono SOLO a contratto
 *     firmato (o storico già in vigore): a una persona che non ha firmato non
 *     si mostra il passaporto al proprietario. Dopo la firma servono davvero
 *     (cessione di fabbricato per l'extra-UE, registrazione).
 *  4. Dall'archivio `documents` passano solo le categorie del proprietario
 *     (contratto, registrazione, F24, ISTAT, APE, visure, spese…), mai le
 *     fatture o gli estratti conto di BOOM, mai un documento da smistare.
 *  5. La storia è fatta di FATTI con una data: niente date inventate.
 */
(function (root) {
  'use strict';

  var RENT = (root && root.BOOM_RENT) || null;
  if (!RENT && typeof require === 'function') { try { RENT = require('./rent-engine.js'); } catch (_) { RENT = null; } }

  function str(v) { return v == null ? '' : String(v).trim(); }
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }
  function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function num(v) {
    if (RENT && RENT.amount) { var a = RENT.amount(v); return a == null ? 0 : a; }
    var n = Number(v); return Number.isFinite(n) && n >= 0 ? round(n) : 0;
  }

  // Una data (ISO, Firestore timestamp, Date) → 'YYYY-MM-DD' o ''.
  function day(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'string') { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? m[0] : ''; }
    try {
      var d = v instanceof Date ? v : typeof v.toDate === 'function' ? v.toDate()
        : typeof v.seconds === 'number' ? new Date(v.seconds * 1000)
        : typeof v._seconds === 'number' ? new Date(v._seconds * 1000) : null;
      return d && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
    } catch (_) { return ''; }
  }
  function addDays(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  // Regola 2 — solo i NOSTRI host, solo https.
  var SAFE_HOSTS = ['firebasestorage.googleapis.com', 'storage.googleapis.com', 'www.boomrome.com', 'boomrome.com'];
  function safeUrl(u) {
    var s = str(u); if (!s) return '';
    try {
      var x = new URL(s);
      return x.protocol === 'https:' && SAFE_HOSTS.indexOf(x.hostname) >= 0 ? x.href : '';
    } catch (_) { return ''; }
  }

  // ── Il contratto ──────────────────────────────────────────────────────
  var TYPE_LABEL = {
    studenti: 'Transitorio studenti (Allegato C)', '3+2': '3+2 canone concordato',
    '32': '3+2 canone concordato', concordato: '3+2 canone concordato',
    transitorio: 'Transitorio (Allegato B)', '4+4': '4+4 libero',
  };
  function signState(c) {
    if (!c) return 'none';
    var ss = str(c.signatureStatus);
    if (ss === 'complete' || (c.tenantSignature && c.landlordSignature)) return 'complete';
    if (c.tenantSignature || c.landlordSignature || ss === 'partial') return 'partial';
    // Storico firmato su carta: nessun invito a sistema e contratto in vigore.
    var invited = c.signInviteTenantAt || c.signInviteLandlordAt || c.signSentAt;
    if (!invited && ['active', 'ended', 'expired', 'terminated'].indexOf(str(c.status)) >= 0) return 'paper';
    return 'none';
  }
  // Il locatore ha già firmato? (la firma grafica, la data, o un contratto
  // che vincola: in tutti i casi la sua Scheda è chiusa e non firma più)
  function landlordSigned(c) { return !!(c && (c.landlordSignature || c.landlordSignedAt || binding(c))); }
  // Il contratto VINCOLA? (regola 3) — firmato a sistema, o storico in vigore.
  function binding(c) { var s = signState(c); return s === 'complete' || s === 'paper'; }
  function registered(c) {
    return !!(c && (c.rliRegisteredAt || str(c.registrationStatus) === 'registered'));
  }
  function isLive(c, today) {
    if (!c) return false;
    var st = str(c.status);
    if (['cancelled', 'canceled', 'terminated', 'draft_deleted', 'void'].indexOf(st) >= 0) return false;
    var end = day(c.endDate);
    return !end || end >= today;
  }

  // Il contratto «corrente» di un immobile: vivo e più recente; poi uno in firma.
  function pickCurrent(contracts, today) {
    var live = contracts.filter(function (c) { return isLive(c, today); });
    live.sort(function (a, b) { return (day(b.startDate) || '').localeCompare(day(a.startDate) || ''); });
    var started = live.filter(function (c) { var s = day(c.startDate); return !s || s <= today; });
    return started[0] || live[0] || null;
  }

  function contractView(c, today, opts) {
    if (!c) return null;
    var end = day(c.endDate), start = day(c.startDate), ss = signState(c);
    var rent = num(c.rent || (c.canone && c.canone.monthly));
    return {
      id: str(c.id),
      type: str(c.type) || 'transitorio',
      typeLabel: TYPE_LABEL[str(c.type)] || (str(c.type) ? str(c.type) : 'Transitorio (Allegato B)'),
      tenantName: str(c.tenantName) || 'Conduttore',
      coTenants: list(c.coTenants).map(function (x) { return str(x.name); }).filter(Boolean),
      unit: str(c.unit),
      startDate: start, endDate: end,
      daysToEnd: end ? daysBetween(today, end) : null,
      rent: rent,
      deposit: num(c.deposit),
      cadence: [1, 2, 3, 6, 12].indexOf(Number(c.installmentMonths)) >= 0 ? Number(c.installmentMonths) : 1,
      cedolare: !(c.cedolareSecca === false || str(c.cedolareSecca) === 'no'),
      signState: ss,
      tenantSignedAt: day(c.tenantSignedAt), landlordSignedAt: day(c.landlordSignedAt),
      registered: registered(c),
      registeredAt: day(c.rliRegisteredAt),
      // il SOLO link di firma che esce: quello del proprietario, quando tocca a lui
      signUrl: opts && opts.signable && c.landlordSignToken && !landlordSigned(c)
        ? 'https://www.boomrome.com/sign?sign=' + encodeURIComponent(str(c.landlordSignToken)) : '',
      schedaUrl: opts && opts.schedaUrl && !landlordSigned(c) ? safeUrl(opts.schedaUrl) : '',
      delegated: !!(c.landlordDelegate && c.landlordDelegate.name),
      mandateGiven: !!(c.landlordMandate && c.landlordMandate.given),
    };
  }

  // ── I documenti ───────────────────────────────────────────────────────
  // Regola 4: le categorie dell'archivio che appartengono al proprietario.
  // Chiave = testo `category` scritto dallo Smistatore / dai generatori.
  var ARCHIVE = [
    { re: /^contratto locazione$/i, folder: 'contract', kind: 'archive_contract' },
    { re: /^verbale$/i, folder: 'contract', kind: 'verbale' },
    { re: /^inventario$/i, folder: 'contract', kind: 'inventory' },
    { re: /registrazione rli/i, folder: 'tax', kind: 'rli' },
    { re: /cedolare secca/i, folder: 'tax', kind: 'cedolare' },
    { re: /^F24/i, folder: 'tax', kind: 'f24' },
    { re: /adeguamento istat/i, folder: 'tax', kind: 'istat' },
    { re: /ricevuta canone/i, folder: 'tax', kind: 'rent_receipt' },
    { re: /^APE/i, folder: 'property', kind: 'ape' },
    { re: /visura catastale/i, folder: 'property', kind: 'visura' },
    { re: /utility|bolletta|utenza/i, folder: 'property', kind: 'utility' },
    { re: /fattura spese manutenzione/i, folder: 'property', kind: 'expense' },
    { re: /documento identit/i, folder: 'tenant', kind: 'tenant_id', tenant: true },
    { re: /cessione fabbricato/i, folder: 'tenant', kind: 'cessione', tenant: true },
  ];
  function archiveRule(doc) {
    var cat = str(doc.category);
    for (var i = 0; i < ARCHIVE.length; i++) if (ARCHIVE[i].re.test(cat)) return ARCHIVE[i];
    return null;
  }

  var FOLDERS = [
    { key: 'contract', label: 'Contratto' },
    { key: 'tax', label: 'Fiscale e registrazione' },
    { key: 'tenant', label: 'Conduttore' },
    { key: 'property', label: 'Immobile' },
  ];

  var DOSSIER_SLOTS = [
    { slot: 'ape', kind: 'ape', label: 'APE — attestato di prestazione energetica', why: 'Obbligatorio per affittare: numero e classe vanno nel contratto e negli annunci.' },
    { slot: 'visura', kind: 'visura', label: 'Visura catastale', why: 'Serve per la registrazione e per l’attestazione del canone concordato.' },
    { slot: 'planimetria', kind: 'planimetria', label: 'Planimetria catastale', why: 'Serve all’attestazione ARPE e a calcolare la superficie convenzionale.' },
    { slot: 'delega', kind: 'delega', label: 'Delega ARPE firmata', why: 'Permette a BOOM di chiedere l’attestazione di rispondenza per te.' },
  ];

  function docsForProperty(p, contracts, archive, ctx) {
    var items = [], seen = {};
    function push(folder, kind, url, date, extra) {
      var u = safeUrl(url); if (!u || seen[u]) return;
      seen[u] = 1;
      var it = { folder: folder, kind: kind, url: u, date: day(date) };
      if (extra) for (var k in extra) if (extra[k] !== undefined && extra[k] !== '') it[k] = extra[k];
      items.push(it);
    }
    contracts.forEach(function (c) {
      var cid = str(c.id), done = binding(c), extra = { contractId: cid, tenantName: str(c.tenantName) };
      if (c.signedPdfUrl) push('contract', 'contract_signed', c.signedPdfUrl, c.finalizedAt || c.landlordSignedAt || c.tenantSignedAt, extra);
      else if (c.generatedPDF) push('contract', done ? 'contract_pdf' : 'contract_draft', c.generatedPDF, c.pdfGeneratedAt || c.createdAt, extra);
      push('contract', 'signing_cert', c.signingCertificateUrl, c.finalizedAt, extra);
      if (c.verbaleConsegna) push('contract', 'verbale', c.verbaleConsegna.url, c.verbaleConsegna.at, extra);
      if (c.inventario) push('contract', 'inventory_in', c.inventario.url, c.inventario.at, extra);
      if (c.inventarioUscita) push('contract', 'inventory_out', c.inventarioUscita.url, c.inventarioUscita.at, extra);
      if (c.landlordMandate && c.landlordMandate.given) push('contract', 'owner_mandate', c.landlordMandate.docUrl, c.landlordMandate.at, extra);
      push('tax', 'fascicolo', c.fascicoloFiscaleUrl, c.fascicoloFiscaleAt || c.finalizedAt, extra);
      push('tax', 'scheda_arpe', c.schedaCanoneUrl, c.schedaCanoneAt, extra);
      push('tax', 'reg_pack', c.registrationPackUrl, c.registrationPackAt, extra);
      push('tax', 'valutazione', c.valutazioneBoomUrl, c.valutazioneBoomAt, extra);
      // Regola 3: il conduttore si vede solo a contratto che vincola.
      list(c.identityDocs).forEach(function (d) {
        if (str(d.role) === 'landlord') { push('contract', 'owner_id', d.url, d.at, extra); return; }
        if (!done) { ctx.lockedTenantDocs++; return; }
        push('tenant', d.kind === 'extra' ? 'tenant_need' : 'tenant_id', d.url, d.at, Object.assign({ name: str(d.name).slice(0, 80) }, extra));
      });
    });
    var dossier = p.dossier || {};
    DOSSIER_SLOTS.forEach(function (s) {
      var d = dossier[s.slot]; if (d && d.url) push('property', s.kind, d.url, d.at, { name: str(d.name).slice(0, 80) });
    });
    push('tax', 'valutazione', p.valutazioneBoomUrl, p.valutazioneBoomAt);
    if (p.inventario && !contracts.some(function (c) { return c.inventario; })) push('contract', 'inventory_in', p.inventario.url, p.inventario.at);
    var bindingIds = {};
    contracts.forEach(function (c) { if (binding(c)) bindingIds[str(c.id)] = 1; });
    archive.forEach(function (d) {
      if (d.needsFiling || str(d.relationKind) === 'unknown' || d.ownerHidden === true) return;
      var rule = archiveRule(d);
      if (!rule && d.shared !== true) return;
      if (rule && rule.tenant) {
        var visible = d.contractId ? !!bindingIds[str(d.contractId)] : Object.keys(bindingIds).length > 0;
        if (!visible) { ctx.lockedTenantDocs++; return; }
      }
      push(rule ? rule.folder : 'contract', rule ? rule.kind : 'shared', d.fileUrl, d.docDate || d.createdAt,
        { name: str(d.name).slice(0, 90), contractId: str(d.contractId) || undefined, archiveId: str(d.id) });
    });
    items.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var folders = FOLDERS.map(function (f) {
      return { key: f.key, label: f.label, items: items.filter(function (i) { return i.folder === f.key; }) };
    });
    return { folders: folders, count: items.length };
  }

  // ── I soldi ───────────────────────────────────────────────────────────
  function moneyFor(pays, today) {
    var year = today.slice(0, 4), month = today.slice(0, 7);
    var out = { collectedYtd: 0, dueThisMonth: 0, arrears: 0, arrearsCount: 0, reported: 0, next: null, lastPaid: null, rows: [] };
    var state = function (p) { return RENT && RENT.paymentState ? RENT.paymentState(p, today) : (str(p.status) === 'paid' ? 'paid' : 'due'); };
    pays.forEach(function (p) {
      // Solo il canone: il deposito non è un incasso del proprietario (va
      // restituito) e gli altri addebiti non sono suoi.
      if (RENT && RENT.isRentPayment && !RENT.isRentPayment(p)) return;
      var s = state(p), amt = num(p.amount), m = str(p.month) || day(p.dueDate).slice(0, 7);
      if (s === 'paid') {
        var pd = day(p.paidDate) || day(p.dueDate);
        if (pd.slice(0, 4) === year) out.collectedYtd = round(out.collectedYtd + amt);
        if (!out.lastPaid || (pd > out.lastPaid.date)) out.lastPaid = { month: m, date: pd, amount: amt, via: str(p.paidVia) };
      } else if (s === 'overdue') { out.arrears = round(out.arrears + amt); out.arrearsCount++; }
      else if (s === 'reported') { out.reported = round(out.reported + amt); }
      // «atteso» = in arrivo; ciò che è già scaduto sta negli arretrati (mai
      // lo stesso euro contato in due riquadri)
      if ((s === 'due' || s === 'reported' || s === 'processing') && m === month) out.dueThisMonth = round(out.dueThisMonth + amt);
      if ((s === 'due' || s === 'processing' || s === 'reported') && day(p.dueDate) >= today) {
        if (!out.next || day(p.dueDate) < out.next.dueDate) out.next = { month: m, dueDate: day(p.dueDate), amount: amt, state: s };
      }
      if (m) out.rows.push({ month: m, dueDate: day(p.dueDate), amount: amt, state: s, paidDate: day(p.paidDate), type: str(p.type) || 'rent' });
    });
    out.rows.sort(function (a, b) { return (b.month || '').localeCompare(a.month || ''); });
    out.rows = out.rows.slice(0, 24);
    return out;
  }

  // ── Scadenze e storia ─────────────────────────────────────────────────
  function eventsFor(cv, c, money, maint, today) {
    var ev = [];
    if (cv && c) {
      if (cv.signState === 'partial' && c.tenantSignature && !c.landlordSignature) {
        ev.push({ code: cv.signUrl ? 'sign_now' : 'sign_pending', date: today, tone: 'gold', action: cv.signUrl || '' });
      }
      if (binding(c) && !cv.registered) {
        var base = [day(c.landlordSignedAt), day(c.tenantSignedAt), cv.startDate].filter(Boolean).sort()[0] || cv.startDate;
        var due = base ? addDays(base, 30) : '';
        // Oltre il termine e senza la data a sistema NON si dice «in ritardo»:
        // può essere registrato e mai spuntato (✓ RLI registrato). Si dice
        // quello che sappiamo — non confermato — e BOOM verifica.
        if (due && signState(c) !== 'paper') {
          ev.push(due >= today
            ? { code: 'registration', date: due, tone: daysBetween(today, due) < 7 ? 'warn' : 'info' }
            : { code: 'registration_unconfirmed', date: today, tone: 'warn', due: due });
        }
      }
      if (cv.endDate && cv.daysToEnd != null && cv.daysToEnd >= 0 && cv.daysToEnd <= 120) {
        ev.push({ code: cv.daysToEnd <= 90 ? 'renewal_decide' : 'contract_end', date: cv.endDate, tone: cv.daysToEnd <= 60 ? 'warn' : 'info' });
      }
      if (cv.startDate && cv.startDate > today) ev.push({ code: 'move_in', date: cv.startDate, tone: 'info' });
    }
    if (money.arrearsCount) ev.push({ code: 'arrears', date: today, tone: 'red', n: money.arrearsCount, amount: money.arrears });
    if (money.next) ev.push({ code: 'next_rent', date: money.next.dueDate, tone: 'info', amount: money.next.amount });
    var open = maint.filter(function (m) { return ['resolved', 'closed', 'done'].indexOf(str(m.status)) < 0; });
    if (open.length) ev.push({ code: 'maintenance_open', date: today, tone: 'info', n: open.length });
    ev.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    return ev;
  }

  function historyFor(contracts, p) {
    var h = [];
    function add(date, code, extra) { var d = day(date); if (d) h.push(Object.assign({ date: d, code: code }, extra || {})); }
    contracts.forEach(function (c) {
      var who = { tenantName: str(c.tenantName) };
      add(c.tenantSignedAt, 'tenant_signed', who);
      add(c.landlordSignedAt, 'landlord_signed', who);
      add(c.rliRegisteredAt, 'registered', who);
      if (c.verbaleConsegna) add(c.verbaleConsegna.at, 'keys_delivered', Object.assign({ keys: Number(c.verbaleConsegna.keysCount) || 0 }, who));
      if (c.inventario) add(c.inventario.at, 'inventory', who);
      if (c.inventarioUscita) add(c.inventarioUscita.at, 'inventory_out', who);
      if (c.aspiRequestedAt) add(c.aspiRequestedAt, 'aspi_sent', who);
      if (c.landlordMandate && c.landlordMandate.given) add(c.landlordMandate.at, 'mandate_given', who);
    });
    var dz = (p && p.dossier) || {};
    Object.keys(dz).forEach(function (k) { if (dz[k] && dz[k].url) add(dz[k].at, 'dossier_' + k); });
    h.sort(function (a, b) { return b.date.localeCompare(a.date); });
    return h.slice(0, 30);
  }

  // Due livelli, perché la domanda del proprietario è «devo fare qualcosa
  // ADESSO?»: urgente = ciò che blocca un contratto in corso (i suoi dati,
  // l'APE che va scritto nel contratto). Visura, planimetria e delega
  // completano il fascicolo ma non fermano niente: si chiedono con garbo,
  // non con un allarme — nove «cose da fare» ne nasconderebbero una vera.
  function missingFor(p, cv, c, ctx) {
    var miss = [], dz = (p && p.dossier) || {};
    var inProgress = !!(cv && (cv.signState === 'none' || cv.signState === 'partial'));
    DOSSIER_SLOTS.forEach(function (s) {
      if (!(dz[s.slot] && dz[s.slot].url)) miss.push({ code: 'dossier_' + s.slot, slot: s.slot, label: s.label, why: s.why, upload: true, urgent: s.slot === 'ape' && inProgress });
    });
    if (cv && cv.schedaUrl) miss.push({ code: 'owner_scheda', label: 'I tuoi dati per il contratto', why: 'Codice fiscale, residenza e IBAN: senza, il contratto stampa dei puntini.', action: cv.schedaUrl, urgent: true });
    if (ctx.lockedTenantDocs) miss.push({ code: 'tenant_docs_after_sign', info: true, n: ctx.lockedTenantDocs });
    return miss;
  }

  function status(cv, today) {
    if (!cv) return 'free';
    if (cv.signState === 'none' || cv.signState === 'partial') return 'signing';
    if (cv.startDate && cv.startDate > today) return 'incoming';
    if (cv.daysToEnd != null && cv.daysToEnd <= 90) return 'ending';
    return 'occupied';
  }

  function coverOf(p) {
    var photos = list(p.photos).map(function (x) { return typeof x === 'string' ? x : x && x.url; });
    var tries = [p.heroPhoto].concat(photos, [p.image, p.coverImage]);
    for (var i = 0; i < tries.length; i++) { var u = safeUrl(tries[i]); if (u) return u; }
    return '';
  }

  function buildVault(input) {
    var I = input || {};
    var today = day(I.now || new Date()) || new Date().toISOString().slice(0, 10);
    var byProp = function (arr, pid) { return list(arr).filter(function (x) { return str(x.propertyId) === pid; }); };
    var contractsAll = list(I.contracts);
    var props = list(I.properties).map(function (p) {
      var pid = str(p.id);
      var cs = byProp(contractsAll, pid);
      var cids = {}; cs.forEach(function (c) { cids[str(c.id)] = 1; });
      var cur = pickCurrent(cs, today);
      var signable = I.signable && cur ? !!I.signable[str(cur.id)] : false;
      var scheda = I.schedaUrls && cur ? I.schedaUrls[str(cur.id)] : '';
      var cv = contractView(cur, today, { signable: signable, schedaUrl: scheda });
      var pays = list(I.payments).filter(function (x) { return str(x.propertyId) === pid || cids[str(x.contractId)]; });
      var money = moneyFor(pays, today);
      var maint = byProp(I.maintenance, pid);
      var archive = list(I.documents).filter(function (d) { return str(d.propertyId) === pid; });
      var ctx = { lockedTenantDocs: 0 };
      var docs = docsForProperty(p, cs, archive, ctx);
      var past = cs.filter(function (c) { return c !== cur; }).map(function (c) { return contractView(c, today); })
        .sort(function (a, b) { return (b.startDate || '').localeCompare(a.startDate || ''); });
      return {
        id: pid,
        name: str(p.name) || str(p.address) || 'Immobile',
        address: str(p.address), zone: str(p.zone || p.neighborhood), unit: str(p.interno || p.unit),
        sqm: Number(p.sqm) || null,
        // il volto dell'immobile: la foto vera (Photo Studio del portal) se
        // c'è, passata dalla stessa regola dei documenti — mai un host altrui
        cover: coverOf(p),
        status: status(cv, today),
        contract: cv, pastContracts: past,
        money: money,
        events: eventsFor(cv, cur, money, maint, today),
        history: historyFor(cs, p),
        missing: missingFor(p, cv, cur, ctx),
        documents: docs.folders, docCount: docs.count,
        maintenance: maint.map(function (m) {
          return { title: str(m.title || m.description || m.category).slice(0, 90), status: str(m.status) || 'open', date: day(m.createdAt), urgent: str(m.priority) === 'urgent' || str(m.urgency) === 'high' };
        }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }).slice(0, 12),
      };
    });
    props.sort(function (a, b) {
      var rank = { signing: 0, ending: 1, incoming: 2, occupied: 3, free: 4 };
      return (rank[a.status] - rank[b.status]) || a.name.localeCompare(b.name);
    });
    var reports = list(I.rendiconti).map(function (r) { return { month: str(r.month), url: safeUrl(r.url), at: day(r.at) }; })
      .filter(function (r) { return /^\d{4}-\d{2}$/.test(r.month) && r.url; })
      .sort(function (a, b) { return b.month.localeCompare(a.month); });
    var sum = function (k) { return round(props.reduce(function (s, p) { return s + (p.money[k] || 0); }, 0)); };
    var events = [];
    props.forEach(function (p) { p.events.forEach(function (e) { events.push(Object.assign({ propertyId: p.id, propertyName: p.name }, e)); }); });
    var toneRank = { red: 0, gold: 1, warn: 2, info: 3 };
    events.sort(function (a, b) { return (toneRank[a.tone] - toneRank[b.tone]) || (a.date || '').localeCompare(b.date || ''); });
    return {
      today: today,
      portfolio: {
        properties: props.length,
        occupied: props.filter(function (p) { return ['occupied', 'ending'].indexOf(p.status) >= 0; }).length,
        signing: props.filter(function (p) { return p.status === 'signing' || p.status === 'incoming'; }).length,
        free: props.filter(function (p) { return p.status === 'free'; }).length,
        monthlyRent: round(props.reduce(function (s, p) { return s + (p.contract && ['occupied', 'ending'].indexOf(p.status) >= 0 ? p.contract.rent : 0); }, 0)),
        collectedYtd: sum('collectedYtd'), dueThisMonth: sum('dueThisMonth'), arrears: sum('arrears'),
        documents: props.reduce(function (s, p) { return s + p.docCount; }, 0) + reports.length,
        missing: props.reduce(function (s, p) { return s + p.missing.filter(function (m) { return !m.info; }).length; }, 0),
        urgent: props.reduce(function (s, p) { return s + p.missing.filter(function (m) { return m.urgent; }).length + p.events.filter(function (e) { return e.code === 'sign_now'; }).length; }, 0),
      },
      properties: props,
      reports: reports,
      events: events.slice(0, 20),
    };
  }

  var API = { buildVault: buildVault, safeUrl: safeUrl, signState: signState, binding: binding, landlordSigned: landlordSigned, archiveRule: archiveRule, DOSSIER_SLOTS: DOSSIER_SLOTS, FOLDERS: FOLDERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_OWNER = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
