// api/fiscal/invoices.js — il registro fatture di Egidi (admin).
//
// UNA collection, `invoices`, e un ciclo di vita che segue la realtà:
//
//   incasso senza fattura ──emetti──> fattura numerata ──SDI──> emessa
//   (statoSdi NON_INVIATA,            (numero + dataFattura,     (CONSEGNATO /
//    nessun numero)                    NON_INVIATA)               MANCATA_CONSEGNA /
//                                                                 SCARTATO)
//
// Sono lo stesso oggetto in tre momenti diversi, non tre entità: tenerli
// separati costringerebbe a copiare importi da una collection all'altra, ed
// è esattamente lì che si perdono i centesimi. La liquidazione ignora da sé
// chi non ha ancora una data fattura, quindi la coda non inquina l'IVA.
//
// POST { op }
//   state    → registro + coda + liquidazione + diagnostica + impostazioni
//   import   → { csv } i due CSV reali (registro emesse / coda incassi).
//              Id deterministici: reimportare lo stesso file è un no-op.
//   issue    → { ids[], dataFattura } assegna i progressivi e data fattura
//   patch    → { id, updates } stato SDI, incasso, anagrafica cliente
//   remove   → { id } solo su righe di coda mai numerate
//   settings → { regimeIva, ... } su settings/fatturazione
//   export   → { anno?, ids?, scope } CSV nell'ordine dei campi TIC
//
// Tutti gli importi passano da js/invoice-engine.js: nessuna aritmetica
// monetaria vive in questo file.

import crypto from 'node:crypto';
import E from '../../js/invoice-engine.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { fsList, fsGet, fsCreate, fsPatch, fsDelete, logActivity } from '../homie/_lib.js';

const SETTINGS_DOC = 'settings/fatturazione';
const MAX_INVOICES = 1000;

/* L'emittente. Costanti server-side, NON in `settings/` — quella collection
   è leggibile da chiunque per regola (firestore.rules), ed è esattamente il
   motivo per cui le coordinate del canone vivono in `payout/`. L'IBAN sta su
   ogni fattura che il cliente riceve, ma metterlo in un documento pubblico
   (o in un bundle JS servito al browser) è un'altra cosa. */
const EMITTENTE = {
  ragioneSociale: 'Egidi Immobiliare S.r.l.',
  piva: '17322991005',
  indirizzo: 'Viale Liegi 42, 00198 Roma',
  email: 'valentino@egidimmobiliare.it',
  banca: 'Banca Sella',
  iban: 'IT54O0326803200052861450580',
};

// Id deterministici: la stessa fattura reimportata due volte resta UNA.
const idEmessa = (r) => `inv_${r.anno}_${String(r.numero).padStart(4, '0')}`;
const idCoda = (r) => {
  const seed = `${r.dataIncasso}|${r.lordo.toFixed(2)}|${(r.email || r.clienteNome || '').toLowerCase().trim()}`;
  return 'enc_' + crypto.createHash('sha1').update(seed).digest('hex').slice(0, 20);
};

async function loadSettings() {
  const s = await fsGet(SETTINGS_DOC).catch(() => null);
  return {
    // Il regime è un'ASSUNZIONE finché la commercialista non conferma
    // (§2.3): la console lo dice invece di far credere che sia un dato.
    regimeIva: s?.regimeIva || E.REGIME.TRIMESTRALE,
    regimeConfermato: !!s?.regimeConfermato,
    // §4.3 — un rimborso spese può essere fuori campo IVA (art. 15 DPR
    // 633/72, anticipazioni in nome e per conto) oppure imponibile 22%.
    // Sono trattamenti opposti e la risposta è della commercialista: finché
    // non arriva, `null` significa "da decidere", non un default silenzioso.
    rimborsiSpeseImponibili: s?.rimborsiSpeseImponibili ?? null,
    emittente: EMITTENTE,
    updatedAt: s?.updatedAt || null,
  };
}

async function loadAll() {
  const raw = await fsList('invoices', { limit: MAX_INVOICES }).catch(() => []);
  return raw.map((d) => E.normalize(d));
}

// `normalize` porta con sé il documento sorgente per chi deve ispezionarlo;
// nella risposta HTTP sarebbe solo peso doppio.
const slim = (i) => { const { _raw, ...rest } = i; return rest; };

// Registro = tutto ciò che ha una data fattura. Coda = incassi che non
// l'hanno ancora (il resto è la stessa cosa).
const isQueue = (i) => !i.dataFattura;

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const body = req.body || {};
  const op = String(body.op || 'state');

  try {
    switch (op) {
      case 'state':    return await opState(req, res, body);
      case 'import':   return await opImport(req, res, body, actor);
      case 'issue':    return await opIssue(req, res, body, actor);
      case 'patch':    return await opPatch(req, res, body, actor);
      case 'remove':   return await opRemove(req, res, body, actor);
      case 'settings': return await opSettings(req, res, body, actor);
      case 'export':   return await opExport(req, res, body);
      default:         return res.status(400).json({ ok: false, error: 'op sconosciuta: ' + op });
    }
  } catch (e) {
    console.error('[fiscal/invoices]', op, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ─── state ────────────────────────────────────────────────────────────
async function opState(req, res, body) {
  const anno = Number(body.anno) || new Date().getFullYear();
  const today = E.isoDate(new Date());
  const [all, settings] = await Promise.all([loadAll(), loadSettings()]);

  const registro = all.filter((i) => !isQueue(i));
  const coda = all.filter(isQueue);
  const audit = E.registryAudit(registro, anno, coda, today);

  // Gli anni presenti nel registro: la console non deve indovinarli.
  const anni = [...new Set(registro.map((i) => i.anno).filter(Boolean))].sort((a, b) => b - a);

  return res.status(200).json({
    ok: true,
    anno, anni, today, settings,
    registro: registro.sort(cmpRegistro).map(slim),
    coda: audit.queue.items.map(slim),
    ledger: slimLedger(audit.ledger),
    numbering: audit.numbering,
    alerts: audit.alerts,
    totali: {
      codaLordo: audit.queue.totali.lordo,
      codaIva: audit.queue.totali.iva,
      codaCount: audit.queue.count,
      creditoAperto: audit.creditoAperto,
      ricaviAnno: audit.ledger.total.imponibile,
      ivaAnno: audit.ledger.total.iva,
    },
  });
}
// Il registro si legge come lo si stampa: anno e numero decrescenti.
const cmpRegistro = (a, b) => (b.anno - a.anno) || ((b.numero || 0) - (a.numero || 0));

// La liquidazione viaggia coi soli ID delle fatture per trimestre: la
// console ha già il registro completo e non serve mandarglielo quattro volte.
function slimLedger(led) {
  const byQuarter = {};
  for (const q of [1, 2, 3, 4]) {
    const { invoices, ...rest } = led.byQuarter[q];
    byQuarter[q] = { ...rest, ids: invoices.map((i) => i.id) };
  }
  const { invoices: exInv, ...esclusi } = led.esclusi;
  return { ...led, byQuarter, esclusi: { ...esclusi, ids: exInv.map((i) => i.id) } };
}

// ─── import ───────────────────────────────────────────────────────────
async function opImport(req, res, body, actor) {
  const csv = String(body.csv || '');
  if (csv.length < 10) return res.status(400).json({ ok: false, error: 'csv mancante' });
  if (csv.length > 2_000_000) return res.status(400).json({ ok: false, error: 'csv troppo grande (max ~2MB)' });

  const parsed = E.parseInvoiceCsv(csv);
  if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error, header: parsed.header });
  if (!parsed.rows.length) return res.status(400).json({ ok: false, error: 'nessuna riga valida nel file' });

  const existing = await loadAll();
  const byId = new Map(existing.map((i) => [i.id, i]));

  const isReg = parsed.kind === 'emesse';
  let created = 0, skipped = 0;
  const errors = [];
  const todo = [];
  for (const row of parsed.rows) {
    if (isReg && (!row.anno || !row.numero)) { errors.push('riga senza anno/numero'); continue; }
    if (!isReg && !row.dataIncasso) { errors.push('riga senza data incasso'); continue; }
    const id = isReg ? idEmessa(row) : idCoda(row);
    if (byId.has(id)) { skipped++; continue; }
    todo.push([id, row]);
  }

  /* Scritture a piccoli gruppi: l'import iniziale è ~80 documenti e in
     sequenza sono altrettanti round-trip. Il parallelismo è sicuro perché
     `fsCreate` con docId è un compare-and-set (Firestore risponde 409 su
     documento esistente), non un "leggi poi scrivi": due richieste sullo
     stesso id non possono duplicare, una delle due perde e conta skipped. */
  const importedAt = new Date().toISOString();
  const source = isReg ? 'import-registro' : 'import-coda';
  const POOL = 5;
  for (let i = 0; i < todo.length; i += POOL) {
    await Promise.all(todo.slice(i, i + POOL).map(async ([id, row]) => {
      try {
        await fsCreate('invoices', { ...row, importedAt, importedBy: actor, source }, id);
        created++;
      } catch (e) {
        if (e.exists) skipped++;
        else errors.push(`${id}: ${e.message}`);
      }
    }));
  }

  await logActivity('Fatture importate', 'fiscal',
    { kind: parsed.kind, created, skipped, errors: errors.length }, actor);
  return res.status(200).json({
    ok: true, kind: parsed.kind, letti: parsed.rows.length, created, skipped,
    errors: errors.concat(parsed.errors || []).slice(0, 20),
  });
}

// ─── issue — la coda diventa registro ─────────────────────────────────
/* Assegna i progressivi e la data fattura. Il numero si prende da
   `nextNumero`, che conta anche i numeri BRUCIATI dalle scartate: un numero
   scartato non si riusa mai. Un solo operatore alla volta usa questa
   console, ma i numeri vengono comunque da una lettura FRESCA e non
   dall'elenco che il browser aveva in mano — bastano due schede aperte per
   emettere due fatture con lo stesso numero. */
async function opIssue(req, res, body, actor) {
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).slice(0, 200) : [];
  if (!ids.length) return res.status(400).json({ ok: false, error: 'nessuna riga selezionata' });
  const dataFattura = E.isoDate(body.dataFattura);
  if (!dataFattura) return res.status(400).json({ ok: false, error: 'data fattura non valida' });

  const anno = E.yearOf(dataFattura);
  const all = await loadAll();
  const byId = new Map(all.map((i) => [i.id, i]));
  let numero = E.nextNumero(all, anno);

  const issued = [], errors = [];
  for (const id of ids) {
    const inv = byId.get(id);
    if (!inv) { errors.push(`${id}: non trovata`); continue; }
    if (inv.numero != null) { errors.push(`${id}: ha già il numero ${inv.numero}`); continue; }
    const patch = {
      anno, numero, dataFattura,
      statoSdi: E.SDI.NON_INVIATA,
      // §2.4 — la dicitura di competenza la scrive il motore, una volta.
      descrizione: E.descrizioneCompleta({ ...inv, anno, dataFattura }),
      issuedAt: new Date().toISOString(),
      issuedBy: actor,
    };
    try {
      await fsPatch('invoices/' + id, patch);
      issued.push({ id, numero, clienteNome: inv.clienteNome, lordo: inv.lordo });
      numero++;
    } catch (e) {
      errors.push(`${id}: ${e.message}`);
    }
  }

  const proiezione = E.projectVat(
    issued.map((i) => byId.get(i.id)).filter(Boolean),
    dataFattura,
  );
  await logActivity('Fatture numerate', 'fiscal',
    { count: issued.length, dataFattura, da: issued[0]?.numero, a: issued[issued.length - 1]?.numero }, actor);
  return res.status(200).json({ ok: true, issued, errors, proiezione });
}

// ─── patch ────────────────────────────────────────────────────────────
const PATCHABLE = new Set([
  'statoSdi', 'dataInvioSdi', 'incassato', 'dataIncasso', 'dataFattura',
  'clienteNome', 'pagante', 'email', 'paese', 'paeseRegime', 'pivaCliente',
  'indirizzo', 'descrizione', 'tipoServizio', 'canale', 'competenzaAnno',
  'note', 'lordo', 'aliquota', 'needsReview',
]);

async function opPatch(req, res, body, actor) {
  const id = String(body.id || '');
  if (!id) return res.status(400).json({ ok: false, error: 'id mancante' });
  const updates = body.updates || {};

  const patch = {};
  for (const [k, v] of Object.entries(updates)) {
    if (!PATCHABLE.has(k)) continue;
    patch[k] = v;
  }
  if (patch.statoSdi) {
    const s = E.normalizeSdi(patch.statoSdi);
    if (!s) return res.status(400).json({ ok: false, error: 'stato SDI sconosciuto' });
    patch.statoSdi = s;
  }
  /* Correggere il LORDO ricalcola la terna: imponibile e IVA non sono campi
     indipendenti che si possono aggiornare a mano e restare coerenti. È il
     percorso di uscita dai documenti legacy con l'importo ambiguo. */
  if (patch.lordo != null) {
    const m = E.splitVat(patch.lordo, patch.aliquota ?? updates.aliquota ?? E.ALIQUOTA_STD);
    patch.lordo = m.lordo; patch.imponibile = m.imponibile; patch.iva = m.iva; patch.aliquota = m.aliquota;
    patch.needsReview = false;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'nessun campo aggiornabile' });

  patch.updatedAt = new Date().toISOString();
  patch.updatedBy = actor;
  await fsPatch('invoices/' + id, patch);
  await logActivity('Fattura aggiornata', 'fiscal', { id, campi: Object.keys(patch) }, actor);
  return res.status(200).json({ ok: true, id, patch });
}

// ─── remove ───────────────────────────────────────────────────────────
/* Si cancellano SOLO le righe di coda mai numerate. Una fattura numerata è
   un documento fiscale: si annulla con una nota di credito, non con un
   DELETE — e un buco nella numerazione non si spiega al controllo. */
async function opRemove(req, res, body, actor) {
  const id = String(body.id || '');
  if (!id) return res.status(400).json({ ok: false, error: 'id mancante' });
  const doc = await fsGet('invoices/' + id).catch(() => null);
  if (!doc) return res.status(404).json({ ok: false, error: 'non trovata' });
  const inv = E.normalize({ id, ...doc });
  if (inv.numero != null || inv.dataFattura) {
    return res.status(409).json({
      ok: false,
      error: 'fattura già numerata: si annulla con nota di credito, non cancellandola',
    });
  }
  await fsDelete('invoices/' + id);
  await logActivity('Riga coda rimossa', 'fiscal', { id, lordo: inv.lordo }, actor);
  return res.status(200).json({ ok: true, id });
}

// ─── settings ─────────────────────────────────────────────────────────
async function opSettings(req, res, body, actor) {
  const s = body.settings || {};
  const patch = { updatedAt: new Date().toISOString(), updatedBy: actor };
  if (s.regimeIva && [E.REGIME.TRIMESTRALE, E.REGIME.MENSILE].includes(s.regimeIva)) patch.regimeIva = s.regimeIva;
  if (typeof s.regimeConfermato === 'boolean') patch.regimeConfermato = s.regimeConfermato;
  if (s.rimborsiSpeseImponibili === null || typeof s.rimborsiSpeseImponibili === 'boolean') {
    patch.rimborsiSpeseImponibili = s.rimborsiSpeseImponibili;
  }
  await fsPatch(SETTINGS_DOC, patch);
  return res.status(200).json({ ok: true, settings: await loadSettings() });
}

// ─── export ───────────────────────────────────────────────────────────
/* Il collo di bottiglia non è generare i dati: è ricopiarli su TIC una
   fattura alla volta. Questo CSV ha le colonne nell'ORDINE dei campi a
   video, così chi inserisce non deve cercare. */
async function opExport(req, res, body) {
  const all = await loadAll();
  const ids = Array.isArray(body.ids) ? new Set(body.ids) : null;
  const anno = Number(body.anno) || null;
  const scope = String(body.scope || 'coda');

  let rows;
  if (ids) rows = all.filter((i) => ids.has(i.id));
  else if (scope === 'registro') rows = all.filter((i) => !isQueue(i) && (!anno || i.anno === anno)).sort(cmpRegistro);
  else rows = all.filter(isQueue);

  if (!rows.length) return res.status(400).json({ ok: false, error: 'nessuna fattura da esportare' });

  const dataFattura = E.isoDate(body.dataFattura) || null;
  const opts = { dataFattura, banca: EMITTENTE.banca, iban: EMITTENTE.iban };
  const csv = E.toCsvIt(rows.map((r) => E.ticRow(r, opts)), E.TIC_COLUMNS);
  const name = `fatture-tic_${scope}${anno ? '_' + anno : ''}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  return res.status(200).send(csv);
}
