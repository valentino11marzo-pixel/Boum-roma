/* ============================================================================
 * BOOM Compliance OS — Rule Library
 * ----------------------------------------------------------------------------
 * Pure, dependency-free logic. Works in the browser (window.BOOM_COMPLIANCE)
 * and in Node (module.exports) so it can be unit-tested and later reused by the
 * agent layer (e.g. a `compliance.scan` tool answering "cosa manca per X?").
 *
 * The core export is obligationsFor(contract, opts) → ordered list of legal /
 * fiscal obligations for one residential lease, with computed due dates, the
 * responsible party, severity, the document to produce, and the consequence of
 * missing it. Status is derived separately from a "done map" + today.
 *
 * ⚠️ The amounts/deadlines below encode the standard Italian residential-lease
 *    obligation set. Exact figures and timing must be confirmed with a CAF /
 *    commercialista and versioned per year — but the *engine* never changes,
 *    only this table.
 * ========================================================================== */
(function (root) {
  'use strict';

  // ---- date helpers ----------------------------------------------------------
  const DAY = 86400000;
  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'object') {
      if (typeof v.toDate === 'function') { try { return v.toDate(); } catch (e) {} }
      if ('seconds' in v) return new Date(v.seconds * 1000);
      if ('_seconds' in v) return new Date(v._seconds * 1000);
    }
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}$/.test(v)) return new Date(v + '-01');
      const d = new Date(v); return isNaN(d) ? null : d;
    }
    return null;
  }
  const addDays   = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
  const addYears  = (d, n) => { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; };
  // next yearly anniversary of `from` strictly on/after `today`
  function nextAnniversary(from, today) {
    if (!from) return null;
    let a = new Date(from); a.setFullYear(today.getFullYear());
    if (a < today) a.setFullYear(a.getFullYear() + 1);
    return a;
  }
  // next occurrence of a fixed (month,day) on/after today  (month is 1-12)
  function nextFixed(month, day, today) {
    let d = new Date(today.getFullYear(), month - 1, day);
    if (d < today) d = new Date(today.getFullYear() + 1, month - 1, day);
    return d;
  }

  // ---- contract feature extraction (defensive about field names) -------------
  function featuresOf(contract, opts) {
    const c = contract || {};
    const tenant = (opts && opts.tenant) || {};
    const rawType = String(c.type || c.contractType || c.tipo || '').toLowerCase();
    let type = 'libero';
    if (rawType.includes('transit')) type = 'transitorio';
    else if (rawType.includes('student')) type = 'studenti';
    else if (rawType.includes('concord') || rawType.includes('3+2')) type = 'concordato';
    else if (rawType.includes('comodat')) type = 'comodato';
    else if (rawType.includes('brev') || rawType.includes('turist')) type = 'breve';
    else if (rawType.includes('liber') || rawType.includes('4+4')) type = 'libero';

    const ced = c.cedolareSecca;
    const hasCedolare = ced === true || ced === 'si' || ced === '10' || ced === '21';
    const noCedolare  = ced === false || ced === 'no';
    const cedolareRate = (ced === '21') ? 21 : 10;

    const startDate  = toDate(c.startDate || c.start || (c.durata && c.durata.startDate));
    const endDate    = toDate(c.endDate   || c.end   || (c.durata && c.durata.endDate));
    const stipula    = toDate(c.signedAt || c.stipulaDate || c.landlordSignature || (c.landlordSignature && c.landlordSignature.date)) || startDate;

    let durationDays = (startDate && endDate) ? Math.round((endDate - startDate) / DAY) : null;
    const isMultiYear = durationDays != null ? durationDays > 400
                        : (type === 'libero' || type === 'concordato');

    const isConcordato = type === 'transitorio' || type === 'studenti' || type === 'concordato'
                         || ced === 'si' || ced === '10' || c.canoneConcordato === true
                         || String(c.regime || '').toLowerCase().includes('concord');

    const shortLet = type === 'breve' || c.shortLet === true;

    const docType = String(tenant.idDocType || tenant.documentType || '').toLowerCase();
    const nat = String(tenant.nationality || tenant.nazionalita || '').toLowerCase();
    const foreignTenant = c.tenantForeign === true
      || docType.includes('passaport') || docType.includes('permesso')
      || (nat && !['', 'it', 'ita', 'italia', 'italiana', 'italian'].includes(nat));

    const rent = Number(c.rent ?? c.rentAmount ?? c.monthlyRent ?? c.canone ?? (c.canone && c.canone.monthly) ?? 0) || 0;
    const deposit = Number(c.deposit ?? c.cauzione ?? 0) || 0;

    return { type, hasCedolare, noCedolare, cedolareRate, isConcordato, isMultiYear,
             shortLet, foreignTenant, startDate, endDate, stipula, rent, deposit };
  }

  // ---- the obligation graph --------------------------------------------------
  // Each item: { code, label, cat, owner, severity, dueDate, recurring, docType, note, consequence }
  //   cat:      setup | registrazione | fiscale | ricorrente | ciclo | breve
  //   owner:    admin | landlord | tenant
  //   severity: high | med | low
  //   docType:  null | 'rli' | 'lettera-cedolare' | 'asseverazione' | 'cessione-fabbricato'
  //             | 'disdetta' | 'verbale' | 'ape'   (drives the draft generator)
  function obligationsFor(contract, opts) {
    opts = opts || {};
    const today = toDate(opts.today) || new Date();
    const f = featuresOf(contract, opts);
    const items = [];
    const push = (o) => items.push(o);

    if (f.type === 'comodato') {
      // Comodato d'uso: registration only if in writing; no canone/cedolare.
      push({ code: 'COMODATO_REG', label: 'Registrazione comodato (se scritto)', cat: 'registrazione',
        owner: 'admin', severity: 'med', dueDate: f.stipula ? addDays(f.stipula, 20) : null,
        docType: null, note: 'Il comodato scritto va registrato entro 20 gg (imposta fissa €200).',
        consequence: 'Sanzione per omessa registrazione.' });
      return finalize(items);
    }

    // ── SETUP ────────────────────────────────────────────────────────────────
    push({ code: 'APE', label: 'APE — Attestato Prestazione Energetica allegato', cat: 'setup',
      owner: 'landlord', severity: 'med', dueDate: f.startDate || f.stipula, docType: 'ape',
      note: 'Obbligatorio, da allegare al contratto e citare gli estremi. La classe alimenta anche il pricing.',
      consequence: 'Sanzione 3.000–18.000 € per mancata allegazione/dichiarazione.' });

    // Deposit legality check (≤ 3 mensilità)
    if (f.rent > 0) {
      const overDeposit = f.deposit > f.rent * 3 + 0.5;
      push({ code: 'DEPOSIT_CHECK', label: 'Deposito cauzionale entro 3 mensilità', cat: 'setup',
        owner: 'admin', severity: overDeposit ? 'high' : 'low', dueDate: f.stipula, docType: null,
        check: overDeposit ? 'violato' : 'ok',
        note: overDeposit ? `Deposito €${Math.round(f.deposit)} eccede 3 mensilità (max €${Math.round(f.rent*3)}).`
                          : `OK: €${Math.round(f.deposit)} ≤ €${Math.round(f.rent*3)}.`,
        consequence: 'Clausola nulla; il conduttore può ripetere l\'eccedenza.' });
    }

    // ── REGISTRAZIONE (AdE) ───────────────────────────────────────────────────
    const rliDue = f.stipula ? addDays(f.stipula, 30) : null;
    push({ code: 'RLI_REG', label: 'Registrazione contratto — Modello RLI', cat: 'registrazione',
      owner: 'admin', severity: 'high', dueDate: rliDue, docType: 'rli',
      note: 'Entro 30 giorni dalla stipula, telematica (RLI Web / Desktop Telematico).',
      consequence: 'Sanzione 60–120% dell\'imposta + interessi; rischio nullità opponibilità.' });

    if (f.hasCedolare) {
      push({ code: 'CEDOLARE_OPT', label: `Opzione cedolare secca (${f.cedolareRate}%) in RLI`, cat: 'fiscale',
        owner: 'admin', severity: 'med', dueDate: rliDue, docType: 'rli',
        note: 'Da barrare in fase di registrazione. Esenta imposta di registro e di bollo.',
        consequence: 'Perdita del regime agevolato per l\'annualità.' });
      push({ code: 'CEDOLARE_RACC', label: 'Raccomandata/PEC all\'inquilino — rinuncia aggiornamento ISTAT', cat: 'fiscale',
        owner: 'landlord', severity: 'med', dueDate: rliDue, docType: 'lettera-cedolare',
        note: 'Comunicazione preventiva al conduttore della scelta cedolare e rinuncia agli aumenti.',
        consequence: 'Contestabilità dell\'opzione cedolare.' });
    } else if (f.noCedolare) {
      const reg2 = Math.round(f.rent * 12 * 0.02);
      push({ code: 'REGISTRO_BOLLO', label: `Imposta di registro 2% (≈€${reg2}) + bollo €16/4 facciate`, cat: 'fiscale',
        owner: 'admin', severity: 'high', dueDate: rliDue, docType: null,
        note: 'Dovuta in regime ordinario (no cedolare), all\'atto della registrazione.',
        consequence: 'Sanzioni per omesso/tardivo versamento.' });
    }

    if (f.isConcordato) {
      push({ code: 'ASSEVERAZIONE', label: 'Attestazione / asseverazione canone concordato', cat: 'registrazione',
        owner: 'admin', severity: 'high', dueDate: rliDue, docType: 'asseverazione',
        note: 'Per i contratti non assistiti, attestazione di un\'organizzazione firmataria (CAF/sindacato).',
        consequence: 'Senza attestazione si rischia di perdere cedolare 10% e agevolazioni.' });
    }

    if (f.foreignTenant && f.stipula) {
      push({ code: 'CESSIONE_FABBRICATO', label: 'Comunicazione ospitalità / cessione di fabbricato (Questura)', cat: 'registrazione',
        owner: 'landlord', severity: 'high', dueDate: addDays(f.stipula, 2), docType: 'cessione-fabbricato',
        note: 'Ospitando un cittadino straniero (in particolare extra-UE), comunicazione entro 48 ore.',
        consequence: 'Sanzione amministrativa per omessa comunicazione.' });
    }

    // ── RICORRENTI / ANNUALI ──────────────────────────────────────────────────
    if (f.noCedolare && f.isMultiYear && f.startDate) {
      push({ code: 'REGISTRO_ANNUAL', label: 'Imposta di registro annualità successive', cat: 'ricorrente',
        owner: 'admin', severity: 'med', dueDate: nextAnniversary(f.startDate, today), recurring: true,
        docType: null, note: 'Versamento entro 30 gg dall\'inizio di ogni nuova annualità (regime ordinario).',
        consequence: 'Sanzioni per tardivo versamento.' });
      push({ code: 'ISTAT', label: 'Adeguamento ISTAT del canone', cat: 'ricorrente',
        owner: 'landlord', severity: 'low', dueDate: nextAnniversary(f.startDate, today), recurring: true,
        docType: null, note: 'Aggiornamento annuale (se previsto e non rinunciato col regime cedolare).',
        consequence: 'Mancato adeguamento del canone.' });
    }
    if (f.isConcordato) {
      push({ code: 'IMU_CONCORDATO', label: 'IMU con riduzione 25% (canone concordato)', cat: 'ricorrente',
        owner: 'landlord', severity: 'low', dueDate: nextFixed(6, 16, today), recurring: true,
        docType: null, note: 'Acconto 16/6 e saldo 16/12, con base imponibile ridotta del 25%.',
        consequence: 'Versamento non ottimizzato.' });
    }

    // ── CICLO DI VITA ─────────────────────────────────────────────────────────
    if (f.endDate) {
      const noticeWindow = addMonths(f.endDate, -6);
      push({ code: 'RENEWAL_DECISION', label: 'Finestra disdetta / rinnovo', cat: 'ciclo',
        owner: 'admin', severity: 'med', dueDate: noticeWindow, docType: 'disdetta',
        note: (f.type === 'transitorio' || f.type === 'studenti')
              ? 'Transitorio/studenti: alla scadenza serve disdetta o nuovo accordo (no rinnovo tacito ordinario).'
              : 'Valutare disdetta motivata o rinnovo; rispettare i termini di preavviso.',
        consequence: 'Rinnovo/proroga non voluti o preavvisi mancati.' });
      push({ code: 'DEPOSIT_RETURN', label: 'Riconsegna + restituzione deposito (verbale)', cat: 'ciclo',
        owner: 'admin', severity: 'low', dueDate: f.endDate, docType: 'verbale',
        note: 'Verbale di riconsegna e restituzione del deposito (con eventuali trattenute documentate).',
        consequence: 'Contenzioso sul deposito.' });
    }

    // ── BREVE / TURISTICO ─────────────────────────────────────────────────────
    if (f.shortLet) {
      push({ code: 'CIN', label: 'CIN — Codice Identificativo Nazionale (BDSR)', cat: 'breve',
        owner: 'landlord', severity: 'high', dueDate: f.startDate || f.stipula, docType: null,
        note: 'Obbligatorio per locazioni brevi/turistiche; da esporre nell\'annuncio e nell\'alloggio.',
        consequence: 'Sanzioni rilevanti e rimozione annunci.' });
      push({ code: 'ALLOGGIATI', label: 'Comunicazione Alloggiati Web (Questura)', cat: 'breve',
        owner: 'landlord', severity: 'high', dueDate: f.startDate, recurring: true, docType: null,
        note: 'Comunicazione degli ospiti entro 24 ore dall\'arrivo.',
        consequence: 'Sanzione penale/amministrativa.' });
      push({ code: 'SOGGIORNO', label: 'Imposta di soggiorno (Comune di Roma)', cat: 'breve',
        owner: 'landlord', severity: 'med', dueDate: null, recurring: true, docType: null,
        note: 'Riscossione e riversamento secondo regolamento comunale.',
        consequence: 'Responsabilità per omesso riversamento.' });
    }

    return finalize(items);
  }

  function finalize(items) {
    const sevRank = { high: 0, med: 1, low: 2 };
    return items
      .map(o => Object.assign({ recurring: false, docType: null, owner: 'admin', note: '', consequence: '' }, o))
      .sort((a, b) => {
        const ad = a.dueDate ? +a.dueDate : Infinity, bd = b.dueDate ? +b.dueDate : Infinity;
        if (ad !== bd) return ad - bd;
        return sevRank[a.severity] - sevRank[b.severity];
      });
  }

  // ---- status derivation -----------------------------------------------------
  // doneMap: { CODE: { status:'done'|'na', at } }   soonDays: window for "due soon"
  function statusOf(item, doneMap, today, soonDays) {
    today = toDate(today) || new Date();
    soonDays = soonDays || 14;
    const explicit = doneMap && doneMap[item.code];
    if (explicit && (explicit.status === 'done' || explicit.status === 'na')) return explicit.status;
    if (item.check === 'violato') return 'overdue';   // a failed legality check reads as a red item
    if (item.check === 'ok' && !item.dueDate) return 'done';
    if (!item.dueDate) return 'todo';
    const days = Math.round((toDate(item.dueDate) - today) / DAY);
    if (days < 0) return 'overdue';
    if (days <= soonDays) return 'due_soon';
    return 'todo';
  }

  function rollup(items, doneMap, today) {
    const counts = { overdue: 0, due_soon: 0, todo: 0, done: 0, na: 0 };
    let nextDue = null, worst = null;
    const sevRank = { high: 0, med: 1, low: 2 };
    for (const it of items) {
      const st = statusOf(it, doneMap, today);
      counts[st] = (counts[st] || 0) + 1;
      if ((st === 'overdue' || st === 'due_soon') && (worst === null || sevRank[it.severity] < sevRank[worst])) worst = it.severity;
      if ((st === 'overdue' || st === 'due_soon' || st === 'todo') && it.dueDate) {
        if (!nextDue || toDate(it.dueDate) < toDate(nextDue)) nextDue = it.dueDate;
      }
    }
    const open = items.length - counts.done - counts.na;
    return { counts, open, total: items.length, nextDue, worstSeverity: worst };
  }

  const API = { obligationsFor, featuresOf, statusOf, rollup, toDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_COMPLIANCE = API;
})(typeof window !== 'undefined' ? window : null);
