/* js/contract-fields.js — IL DIZIONARIO DEL CONTRATTO (una copia sola).
 *
 * Ogni dato che i due modelli (js/contract-pdf.js: Allegato B transitorio,
 * Allegato C studenti — CAF verbatim) STAMPANO, più ciò che la registrazione
 * RLI e la macchina pretendono, dichiarato UNA volta con:
 *   - owner: chi lo SA, quindi chi lo compila (tenant · landlord · operator;
 *     può dipendere dal contesto: l'esigenza transitoria è di chi la dichiara);
 *   - templates: su quale modello compare (B, C o entrambi);
 *   - needs: 'contract' (il PDF lo stampa — vuoto = puntini), 'registration'
 *     (RLI/AdE/ASPI lo pretendono), 'operations' (la macchina: contatti, IBAN,
 *     dati dell'attestazione) — anche in funzione del modello;
 *   - required: se vuoto conta come MANCANTE (bool o funzione del contesto:
 *     il documento dell'esigenza solo oltre 30 giorni, ente e data di
 *     rilascio solo sull'Allegato C che li stampa, nascita solo per una
 *     persona fisica, permesso di soggiorno solo per un extra-UE);
 *   - read: la STESSA catena di fallback di contract-pdf.js (contratto →
 *     immobile → users schema sign → users schema wizard), così "manca"
 *     qui significa "il PDF stamperebbe i puntini" e non un'opinione;
 *   - write: dove atterra la risposta del cliente (contract / property /
 *     user, anche più d'uno: i fatti dell'immobile vanno in MEMORIA
 *     sull'immobile e sul contratto che il PDF legge), con la lista bianca
 *     per owner applicata in applyAnswers.
 *
 * Da qui derivano: la completezza (portal, email a Valentino), la Scheda
 * che si ADATTA (chiede solo ciò che manca a QUELLA parte), il messaggio
 * che nomina i mancanti, il controllo dei puntini prima di generare il PDF,
 * i numeri del modello RLI (rliFacts) e le tre letture che prima
 * divergevano (cedolare, documento, catasto).
 *
 * REGOLE DURE
 *  1. Nessuna key inventata: ogni lettura di contract-pdf.js è dichiarata in
 *     READS qui sotto o nell'allowlist motivata del test anti-deriva
 *     (tests/contratto/run.mjs). Un campo nuovo nel modello senza voce nel
 *     dizionario fa fallire la CI; una voce senza lettura nel modello pure.
 *  2. Puro: niente Firestore, niente Date.now nelle decisioni, niente DOM.
 *  3. Un token pubblico scrive SOLO i campi del suo owner: applyAnswers
 *     scarta il resto e lo DICHIARA (rejected), mai in silenzio.
 *  4. Le mappe annidate (propertyExtra, studenti, tabelleMillesimali) si
 *     riscrivono INTERE partendo dal dato esistente: fsPatch fa updateMask sul
 *     primo livello e una patch parziale cancellerebbe il resto della mappa.
 *
 * UMD come contract-pdf.js: <script> → window.BOOM_CONTRACT_FIELDS,
 * import ESM da api/** (root package.json è commonjs).
 */
(function (root) {
  'use strict';

  // ── Helper ────────────────────────────────────────────────────────────
  const str = (v) => (v === undefined || v === null) ? '' : String(v).trim();
  const pick = (...vals) => { for (const v of vals) { const s = str(v); if (s !== '') return s; } return ''; };
  const has = (v) => str(v) !== '';
  const obj = (o) => (o && typeof o === 'object') ? o : {};
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const clone = (o) => JSON.parse(JSON.stringify(obj(o)));

  // ── LE LETTURE UNIFICATE (prima divergevano fra i due modelli) ────────
  // Codice fiscale: 16 caratteri (persona fisica, checksum) OPPURE 11 cifre
  // (persona giuridica — codice fiscale numerico = partita IVA, Luhn mod 10).
  // Il locatore può essere una società («Il/La sig./soc.» sull'Allegato B).
  function validCF16(cf) {
    const s = String(cf || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{16}$/.test(s)) return false;
    const odd = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
    const even = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25 };
    let sum = 0;
    for (let i = 0; i < 15; i++) sum += (i % 2 === 0) ? odd[s[i]] : even[s[i]];
    return String.fromCharCode(65 + (sum % 26)) === s[15];
  }
  function validPIva(p) {
    const s = String(p || '').replace(/\s+/g, '');
    if (!/^\d{11}$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      let d = Number(s[i]);
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return sum % 10 === 0;
  }
  // validCF = una delle due forme; validCFFor(role) = la forma AMMESSA per
  // quel ruolo: il conduttore (e ogni co-conduttore) è una persona fisica,
  // 16 caratteri e basta — un 11 cifre Luhn-valido inquinerebbe l'RLI.
  const validCF = (cf) => validCF16(cf) || validPIva(cf);
  const validCFFor = (role, cf) => role === 'landlord' ? validCF(cf) : validCF16(cf);

  // Cedolare secca: i contratti reali portano la STRINGA 'si'/'no' (portal,
  // convert), il pre-accordo il booleano dentro canone. Assente = sì, come
  // l'Allegato C, _finalize e compliance-rules — l'Allegato B leggeva
  // `=== true` e mandava un 'si' nel regime ordinario (art. 7 sbagliato).
  function cedolareOn(contract) {
    const c = obj(contract);
    const v = (c.cedolareSecca !== undefined && c.cedolareSecca !== null && c.cedolareSecca !== '')
      ? c.cedolareSecca : obj(c.canone).cedolareSecca;
    if (v === false || v === 'no' || v === 'false' || v === 0) return false;
    return true;
  }

  // Tipo di documento: la Scheda scrive CODICI (passport|id|permit|patente),
  // il portal etichette italiane. Una mappa sola, in entrambe le direzioni.
  const DOC_TYPES = [
    { v: 'passport', it: 'Passaporto', en: 'Passport' },
    { v: 'id', it: 'Carta d’identità', en: 'ID card (carta d’identità)' },
    { v: 'permit', it: 'Permesso di soggiorno', en: 'Residence permit (permesso)' },
    { v: 'patente', it: 'Patente', en: 'Driving licence' },
  ];
  function docTypeCode(v) {
    const s = str(v).toLowerCase();
    if (!s) return '';
    if (/^(passport|passaporto|pass)$/.test(s)) return 'passport';
    if (/^(id|ci|c\.i\.|carta d.identit|id card|identity card|carta identit)/.test(s)) return 'id';
    if (/permesso|permit|residence/.test(s)) return 'permit';
    if (/patente|licen[cs]e/.test(s)) return 'patente';
    return s;
  }
  const docTypeIt = (v) => { const c = docTypeCode(v); const d = DOC_TYPES.find(x => x.v === c); return d ? d.it : str(v); };

  // Cittadinanza UE/SEE/CH (per la cessione di fabbricato — art. 7 D.Lgs.
  // 286/98 — un extra-UE va comunicato in Questura entro 48h).
  const EU_WORDS = ['ital', 'austri', 'belg', 'bulgar', 'croat', 'cipr', 'cypr', 'cec', 'czech', 'danim', 'danish', 'denmark', 'dan', 'eston', 'finl', 'finn', 'franc', 'french', 'german', 'tedes', 'deutsch', 'grec', 'greek', 'ungher', 'hungar', 'irland', 'irish', 'lett', 'latvi', 'lituan', 'lithuan', 'lussemb', 'luxemb', 'malt', 'olan', 'dutch', 'netherl', 'polac', 'polish', 'poland', 'portog', 'portug', 'roman', 'slovac', 'slovak', 'sloven', 'spagn', 'spanish', 'spain', 'svedes', 'swed', 'svezia', 'norveg', 'norw', 'island', 'icelan', 'liechten', 'svizz', 'swiss', 'switz', 'eu citizen', 'european'];
  function isEU(nationality) {
    const n = str(nationality).toLowerCase();
    if (!n) return true;                       // ignoto ≠ extra-UE: non si inventa un adempimento
    return EU_WORDS.some(w => n.indexOf(w) >= 0);
  }

  function templateOf(contract) { return (contract && contract.type === 'studenti') ? 'C' : 'B'; }

  function leaseDays(c) {
    c = obj(c);
    const a = new Date(String(c.startDate || '').slice(0, 10) + 'T00:00');
    const b = new Date(String(c.endDate || '').slice(0, 10) + 'T00:00');
    if (isNaN(a) || isNaN(b) || b < a) return 0;
    return Math.round((b - a) / 86400000);
  }
  // Mesi di locazione come li conta il modello (monthsBetween di
  // contract-pdf.js: mesi interi + giorni/30, arrotondato per eccesso).
  function leaseMonths(c) {
    c = obj(c);
    const a = new Date(String(c.startDate || '').slice(0, 10) + 'T00:00');
    const b = new Date(String(c.endDate || '').slice(0, 10) + 'T00:00');
    if (isNaN(a) || isNaN(b) || b < a) return 0;
    let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    let days = b.getDate() - a.getDate();
    if (days < 0) { months -= 1; days += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
    return Math.max(1, Math.ceil(months + days / 30 - 0.001));
  }

  // Documenti d'identità caricati (contract.identityDocs): ruolo dedotto
  // come in api/fiscal/_aspi.js — senza role = conduttore; kind 'extra' =
  // attestazione dell'esigenza (transitoria o iscrizione).
  const idDocs = (c) => (Array.isArray(obj(c).identityDocs) ? c.identityDocs : []).filter(d => d && d.url);
  const tenantDocs = (c) => idDocs(c).filter(d => d.kind !== 'extra' && d.role !== 'landlord');
  const landlordDocs = (c) => idDocs(c).filter(d => d.kind !== 'extra' && d.role === 'landlord');
  const extraDocs = (c) => idDocs(c).filter(d => d.kind === 'extra');
  const coTenantsOf = (c) => (Array.isArray(obj(c).coTenants) ? c.coTenants : []).filter(x => x && x.name);

  // Catasto: il modello e l'RLI vogliono foglio / particella / subalterno
  // SEPARATI (quadro B). Il repo ha scritto per anni un solo blob di testo
  // (`cadastralData`): qui lo si LEGGE come fallback dichiarato, e la Scheda
  // scrive strutturato + ricompone il blob per chi lo legge ancora.
  function parseCadastral(blob) {
    const s = str(blob);
    const g = (re) => { const m = re.exec(s); return m ? m[1] : ''; };
    return {
      foglio: g(/\bf(?:oglio|gl?)\.?\s*[:n°]?\s*(\d+)/i),
      particella: g(/(?:\bpart(?:icella|\.)?|\bp\.lla|\bmappale|\bmapp?\.)\s*[:n°]?\s*(\d+)/i),
      sub: g(/sub(?:alterno)?\.?\s*[:n°]?\s*(\d+)/i),
      categoria: g(/cat(?:egoria|\.)?\s*[:]?\s*([A-Z]\s?\/?\s?\d{1,2})/i).replace(/\s+/g, ''),
      sezione: g(/sez(?:ione)?\.?\s*[:]?\s*([A-Z0-9]{1,4})\b/i),
    };
  }
  function catRead(ctx, key) {
    const p = obj(ctx.property);
    const direct = pick(p[key]);
    if (direct) return direct;
    return parseCadastral(pick(p.cadastralData, obj(ctx.contract).cadastral))[key] || '';
  }
  function composeCadastral(p) {
    p = obj(p);
    const parts = [];
    if (has(p.sezione)) parts.push('sez. ' + str(p.sezione));
    if (has(p.foglio)) parts.push('foglio ' + str(p.foglio));
    if (has(p.particella)) parts.push('particella ' + str(p.particella));
    if (has(p.sub)) parts.push('sub ' + str(p.sub));
    if (has(p.categoria)) parts.push('cat. ' + str(p.categoria));
    return parts.join(', ');
  }

  const YESNO = [{ v: 'yes', it: 'Sì', en: 'Yes' }, { v: 'no', it: 'No', en: 'No' }];
  const IMPIANTI = [
    { v: 'funzionanti', it: 'Funzionanti e idonei (documentazione in possesso)', en: 'Working and fit for use (documents on hand)' },
    { v: 'conformi', it: 'Certificati conformi (D.M. 37/2008)', en: 'Certified compliant (D.M. 37/2008)' },
    { v: 'non_certificati', it: 'Senza certificazione a norma', en: 'No compliance certificate' },
  ];
  const ISCRIZIONE = [
    { v: 'triennale', it: 'Laurea triennale', en: 'Bachelor’s' },
    { v: 'magistrale', it: 'Laurea magistrale', en: 'Master’s' },
    { v: 'ciclo_unico', it: 'Ciclo unico', en: 'Single-cycle degree' },
    { v: 'dottorato', it: 'Dottorato', en: 'PhD' },
    { v: 'master', it: 'Master / specializzazione', en: 'Postgraduate master' },
    { v: 'erasmus', it: 'Erasmus / scambio', en: 'Erasmus / exchange' },
    { v: 'altro', it: 'Altro corso', en: 'Other course' },
  ];
  const CEDOLARE = [{ v: 'si', it: 'Sì — cedolare secca', en: 'Yes — cedolare secca' }, { v: 'no', it: 'No — registro + bollo', en: 'No — registration tax + stamp' }];
  const KIND = [{ v: 'fisica', it: 'Persona fisica', en: 'Private individual' }, { v: 'giuridica', it: 'Società / ente', en: 'Company / entity' }];
  const ESIGENZA_DI = [{ v: 'conduttore', it: 'Del conduttore', en: 'The tenant’s' }, { v: 'locatore', it: 'Del locatore', en: 'The landlord’s' }];

  // Sezioni (ordine = ordine della Scheda). identity resta lo step 1 già
  // esistente della pagina; le altre sono gli step EXTRA che nascono solo
  // se manca qualcosa.
  const SECTIONS = {
    identity:   { it: 'I tuoi dati', en: 'Your details' },
    soggiorno:  { it: 'Permesso di soggiorno', en: 'Residence permit' },
    contact:    { it: 'Contatti', en: 'Contact' },
    catasto:    { it: 'Dati catastali', en: 'Cadastral data' },
    property:   { it: 'L’immobile', en: 'The property' },
    tabelle:    { it: 'Tabelle millesimali', en: 'Condominium shares (millesimi)' },
    terms:      { it: 'Termini del contratto', en: 'Contract terms' },
    esigenza:   { it: 'L’esigenza transitoria', en: 'The temporary need' },
    studenti:   { it: 'Il tuo corso di studi', en: 'Your studies' },
    uso:        { it: 'Chi abiterà la casa', en: 'Who will live in the home' },
    docs:       { it: 'Documenti', en: 'Documents' },
  };

  const isGiuridica = (ctx) => pick(obj(ctx.contract).landlordKind, obj(ctx.landlord).kind, obj(ctx.landlord).businessName ? 'giuridica' : '') === 'giuridica';
  const esigenzaOwner = (ctx) => (pick(obj(ctx.contract).esigenzaDi) === 'locatore') ? 'landlord' : 'tenant';
  const tenantNonEU = (ctx) => { const n = pick(obj(ctx.contract).tenantNationality, obj(ctx.tenant).nationality); return !!n && !isEU(n); };

  // Un campo-parte (conduttore / locatore): contratto → users (schema sign
  // → schema wizard). P = 'tenant' | 'landlord'.
  function partyField(P, suffix, opts) {
    const who = P === 'tenant' ? 'tenant' : 'landlord';
    const userKeys = opts.userKeys || [];
    return Object.assign({
      key: P + suffix, group: opts.group || 'identity', owner: who,
      templates: ['B', 'C'], needs: ['contract', 'registration'], required: true, type: 'text',
      read: (ctx) => pick(obj(ctx.contract)[P + suffix], ...(suffix === 'Email' ? ['email'] : userKeys).map(k => obj(ctx[who])[k])),
      write: { doc: 'contract', path: P + suffix, user: userKeys },
    }, opts);
  }
  const propField = (key, path, opts) => Object.assign({
    key, group: 'property', owner: 'landlord', templates: ['B', 'C'], needs: ['contract'], required: true, type: 'text',
    read: (ctx) => pick(obj(ctx.property)[path]), write: { doc: 'property', path },
  }, opts);
  const tabField = (key, sub, opts) => Object.assign({
    key, group: 'tabelle', owner: 'landlord', templates: ['B', 'C'], needs: ['contract'], required: false, type: 'number',
    read: (ctx) => pick(obj(obj(obj(ctx.contract).propertyExtra).tabelleMillesimali)[sub], sub === 'proprieta' ? obj(obj(obj(ctx.contract).propertyExtra).tabelleMillesimali)['proprietà'] : '', obj(obj(ctx.property).tabelleMillesimali)[sub]),
    write: { doc: 'contract', path: 'propertyExtra.tabelleMillesimali.' + sub, also: { doc: 'property', path: 'tabelleMillesimali.' + sub } },
  }, opts);

  // ── IL DIZIONARIO ─────────────────────────────────────────────────────
  const FIELDS = [
    // ── CONDUTTORE — identità (B: «nato/a il … a …, domiciliato/a in …,
    //    C.F. …, identificato/a mediante …»; C aggiunge «rilasciata da … il
    //    …» e NON stampa il domicilio: «domiciliato/a nei locali») ───────
    partyField('tenant', 'Name', { userKeys: ['name'], label: { it: 'Nome e cognome', en: 'Full name' }, ask: { it: 'Come sul documento', en: 'As printed on your passport or ID' } }),
    partyField('tenant', 'CF', { userKeys: ['cf', 'codiceFiscale'], type: 'cf', label: { it: 'Codice fiscale', en: 'Codice fiscale' }, ask: { it: '16 caratteri — serve per registrare il contratto', en: '16 characters — required to register the contract with the tax office' } }),
    partyField('tenant', 'Dob', { userKeys: ['dob', 'birthDate'], type: 'date', label: { it: 'Data di nascita', en: 'Date of birth' }, ask: { it: '', en: '' } }),
    partyField('tenant', 'Pob', { userKeys: ['pob', 'birthPlace'], label: { it: 'Luogo di nascita', en: 'Place of birth' }, ask: { it: 'Città, Paese', en: 'City, Country' } }),
    partyField('tenant', 'Address', { userKeys: ['address'], needs: (tpl) => tpl === 'B' ? ['contract', 'registration'] : ['operations'], label: { it: 'Residenza attuale', en: 'Current address' }, ask: { it: 'Via, numero, città', en: 'Street, number, city (where you live now)' } }),
    partyField('tenant', 'DocType', { userKeys: ['docType', 'idDocType'], type: 'select', options: DOC_TYPES,
      read: (ctx) => docTypeCode(pick(obj(ctx.contract).tenantDocType, obj(ctx.tenant).docType, obj(ctx.tenant).idDocType)),
      label: { it: 'Documento', en: 'ID document' }, ask: { it: '', en: '' } }),
    partyField('tenant', 'DocNum', { userKeys: ['docNum', 'idDocNumber'], label: { it: 'Numero documento', en: 'Document number' }, ask: { it: '', en: '' } }),
    partyField('tenant', 'DocIssuer', { userKeys: ['docIssuer'], needs: (tpl) => tpl === 'C' ? ['contract', 'registration'] : ['registration'], required: (ctx) => templateOf(ctx.contract) === 'C', label: { it: 'Rilasciato da', en: 'Issued by' }, ask: { it: 'Ente che ha rilasciato il documento', en: 'Issuing authority' } }),
    partyField('tenant', 'DocIssueDate', { userKeys: ['docIssueDate'], type: 'date', needs: (tpl) => tpl === 'C' ? ['contract', 'registration'] : ['registration'], required: (ctx) => templateOf(ctx.contract) === 'C', label: { it: 'Data di rilascio', en: 'Issue date' }, ask: { it: '', en: '' } }),
    partyField('tenant', 'Nationality', { userKeys: ['nationality'], needs: ['registration'], label: { it: 'Nazionalità', en: 'Nationality' }, ask: { it: 'Per un cittadino extra-UE serve la cessione di fabbricato', en: 'Non-EU citizens need a “cessione di fabbricato” filing — we handle it' } }),
    // Extra-UE: la comunicazione in Questura (48h) vuole gli estremi del
    // permesso di soggiorno. Richiesti SOLO quando la nazionalità lo dice.
    partyField('tenant', 'PermessoNumero', { group: 'soggiorno', userKeys: ['permessoNumero'], needs: ['registration'], required: tenantNonEU, label: { it: 'Numero permesso di soggiorno / visto', en: 'Residence permit or visa number' }, ask: { it: 'Se in attesa di rilascio, il numero della ricevuta', en: 'If pending, the receipt number' } }),
    partyField('tenant', 'PermessoScadenza', { group: 'soggiorno', userKeys: ['permessoScadenza'], type: 'date', needs: ['registration'], required: tenantNonEU, label: { it: 'Scadenza del permesso', en: 'Permit expiry date' }, ask: { it: '', en: '' } }),
    // EMAIL: è il recapito del link di FIRMA. Un link /scheda (viaggia su
    // WhatsApp) non deve poterla dirottare: mai sul profilo users (da cui
    // send-link legge il destinatario), e sul contratto SOLO se vuota.
    partyField('tenant', 'Email', { group: 'contact', userKeys: [], fillOnly: true, needs: ['operations'], type: 'email', label: { it: 'Email', en: 'Email' }, ask: { it: 'Dove ricevi il link di firma e il contratto', en: 'Where you’ll receive the signing link and your copy' } }),
    partyField('tenant', 'Phone', { group: 'contact', userKeys: ['phone'], needs: ['operations'], required: false, type: 'tel', label: { it: 'Telefono', en: 'Phone' }, ask: { it: 'Con prefisso', en: 'With country code' } }),

    // ── LOCATORE — identità («Il/La sig./soc. …»: anche una società) ──
    { key: 'landlordKind', group: 'identity', owner: 'landlord', templates: ['B', 'C'], needs: ['registration'], required: false, type: 'select', options: KIND,
      read: (ctx) => pick(obj(ctx.contract).landlordKind, obj(ctx.landlord).kind, obj(ctx.landlord).businessName ? 'giuridica' : ''), write: { doc: 'contract', path: 'landlordKind', user: ['kind'] },
      label: { it: 'Locatore', en: 'Landlord' }, ask: { it: 'Vuoto = persona fisica', en: 'Empty = private individual' } },
    partyField('landlord', 'Name', { userKeys: ['name', 'businessName'], label: { it: 'Nome e cognome / ragione sociale', en: 'Full name / company name' }, ask: { it: 'Come sul documento o in visura', en: 'As on your ID or company registration' } }),
    partyField('landlord', 'CF', { userKeys: ['cf', 'codiceFiscale'], type: 'cfx', label: { it: 'Codice fiscale', en: 'Codice fiscale' }, ask: { it: '16 caratteri (11 cifre per una società)', en: '16 characters (11 digits for a company)' } }),
    { key: 'landlordPIva', group: 'identity', owner: 'landlord', templates: ['B', 'C'], needs: ['registration'], required: isGiuridica, type: 'piva',
      read: (ctx) => pick(obj(ctx.contract).landlordPIva, obj(ctx.landlord).partitaIva), write: { doc: 'contract', path: 'landlordPIva', user: ['partitaIva'] },
      label: { it: 'Partita IVA', en: 'VAT number' }, ask: { it: 'Solo per società o ente', en: 'Companies only' } },
    partyField('landlord', 'Dob', { userKeys: ['dob', 'birthDate'], type: 'date', required: (ctx) => !isGiuridica(ctx), label: { it: 'Data di nascita', en: 'Date of birth' }, ask: { it: '', en: '' } }),
    partyField('landlord', 'Pob', { userKeys: ['pob', 'birthPlace'], required: (ctx) => !isGiuridica(ctx), label: { it: 'Luogo di nascita', en: 'Place of birth' }, ask: { it: 'Comune', en: 'City' } }),
    partyField('landlord', 'Address', { userKeys: ['address'], label: { it: 'Residenza / sede legale', en: 'Residence / registered office' }, ask: { it: 'Via, numero, città', en: 'Street, number, city' } }),
    partyField('landlord', 'DocType', { userKeys: ['docType', 'idDocType'], needs: ['registration'], required: false, type: 'select', options: DOC_TYPES,
      read: (ctx) => docTypeCode(pick(obj(ctx.contract).landlordDocType, obj(ctx.landlord).docType, obj(ctx.landlord).idDocType)),
      label: { it: 'Documento', en: 'ID document' }, ask: { it: '', en: '' } }),
    partyField('landlord', 'DocNum', { userKeys: ['docNum', 'idDocNumber'], needs: ['registration'], required: false, label: { it: 'Numero documento', en: 'Document number' }, ask: { it: '', en: '' } }),
    partyField('landlord', 'DocIssuer', { userKeys: ['docIssuer'], needs: ['registration'], required: false, label: { it: 'Rilasciato da', en: 'Issued by' }, ask: { it: '', en: '' } }),
    partyField('landlord', 'DocIssueDate', { userKeys: ['docIssueDate'], needs: ['registration'], required: false, type: 'date', label: { it: 'Data di rilascio', en: 'Issue date' }, ask: { it: '', en: '' } }),
    partyField('landlord', 'Nationality', { userKeys: ['nationality'], needs: ['registration'], required: false, label: { it: 'Nazionalità', en: 'Nationality' }, ask: { it: '', en: '' } }),
    partyField('landlord', 'Email', { group: 'contact', userKeys: [], fillOnly: true, needs: ['operations'], type: 'email', label: { it: 'Email', en: 'Email' }, ask: { it: 'Dove ricevi il link di firma, il contratto e il rendiconto', en: 'Where you receive the signing link, the contract and statements' } }),
    partyField('landlord', 'Phone', { group: 'contact', userKeys: ['phone'], needs: ['operations'], required: false, type: 'tel', label: { it: 'Telefono', en: 'Phone' }, ask: { it: 'Con prefisso', en: 'With country code' } }),
    // IBAN: è dove l'inquilino paga (/casa lo mostra). Dal link SOLO se
    // vuoto — un IBAN esistente non si cambia da un link intercettabile —
    // e submit avvisa l'operatore ad alta priorità quando viene impostato.
    { key: 'landlordIban', group: 'contact', owner: 'landlord', templates: ['B', 'C'], needs: ['operations'], required: false, type: 'iban', fillOnly: true, sensitive: true,
      read: (ctx) => pick(obj(ctx.contract).landlordIban, obj(ctx.landlord).iban), write: { doc: 'contract', path: 'landlordIban', user: ['iban'] },
      label: { it: 'IBAN per il canone', en: 'IBAN for rent' }, ask: { it: 'Dove BOOM ti gira il canone incassato', en: 'Where BOOM forwards the rent collected' } },

    // ── CATASTO (quadro B dell'RLI: foglio, particella, subalterno) ────
    { key: 'catFoglio', group: 'catasto', owner: 'landlord', templates: ['B', 'C'], needs: ['contract', 'registration'], required: true, type: 'text',
      read: (ctx) => catRead(ctx, 'foglio'), write: { doc: 'property', path: 'foglio', cadastral: true }, label: { it: 'Foglio', en: 'Foglio (sheet)' }, ask: { it: 'Dalla visura catastale', en: 'From the visura catastale' } },
    { key: 'catParticella', group: 'catasto', owner: 'landlord', templates: ['B', 'C'], needs: ['contract', 'registration'], required: true, type: 'text',
      read: (ctx) => catRead(ctx, 'particella'), write: { doc: 'property', path: 'particella', cadastral: true }, label: { it: 'Particella', en: 'Particella (parcel)' }, ask: { it: '', en: '' } },
    { key: 'catSub', group: 'catasto', owner: 'landlord', templates: ['B', 'C'], needs: ['contract', 'registration'], required: true, type: 'text',
      read: (ctx) => catRead(ctx, 'sub'), write: { doc: 'property', path: 'sub', cadastral: true }, label: { it: 'Subalterno', en: 'Subalterno (unit)' }, ask: { it: '', en: '' } },
    { key: 'catCategoria', group: 'catasto', owner: 'landlord', templates: ['B', 'C'], needs: ['registration'], required: false, type: 'text',
      read: (ctx) => catRead(ctx, 'categoria'), write: { doc: 'property', path: 'categoria', cadastral: true }, label: { it: 'Categoria', en: 'Category' }, ask: { it: 'Es. A/2', en: 'e.g. A/2' } },
    { key: 'catSezione', group: 'catasto', owner: 'landlord', templates: ['B', 'C'], needs: ['registration'], required: false, type: 'text',
      read: (ctx) => catRead(ctx, 'sezione'), write: { doc: 'property', path: 'sezione', cadastral: true }, label: { it: 'Sezione urbana', en: 'Urban section' }, ask: { it: 'Solo se presente in visura', en: 'Only if shown on the visura' } },
    { key: 'propertyRendita', group: 'catasto', owner: 'landlord', templates: ['B', 'C'], needs: (tpl) => tpl === 'C' ? ['contract', 'registration'] : ['registration'], required: true, type: 'number',
      read: (ctx) => { const v = pick(obj(ctx.contract).renditaCatastale, obj(ctx.property).renditaCatastale); return (v && Number(v) > 0) ? v : ''; },
      write: { doc: 'property', path: 'renditaCatastale', also: { doc: 'contract', path: 'renditaCatastale' } },
      label: { it: 'Rendita catastale (€)', en: 'Cadastral income (€)' }, ask: { it: 'Dalla visura', en: 'From the visura catastale' } },

    // ── IMMOBILE («posta in … via …, piano …, scala …, int. …, composta di
    //    n. … vani … accessori …, ammobiliata/non» + b) energia c) impianti) ─
    propField('propertyAddress', 'address', { needs: ['contract', 'registration'], fillOnly: true, label: { it: 'Via e numero civico', en: 'Street and number' }, ask: { it: 'Es. Via Levico 12', en: 'e.g. Via Levico 12' } }),
    propField('propertyCity', 'city', { required: false, fillOnly: true, label: { it: 'Comune', en: 'City' }, ask: { it: 'Vuoto = Roma', en: 'Empty = Rome' } }),
    propField('propertyFloor', 'floor', { needs: ['contract', 'registration'], label: { it: 'Piano', en: 'Floor' }, ask: { it: 'Es. 3, oppure T per il piano terra', en: 'e.g. 3, or T for ground floor' } }),
    propField('propertyScala', 'scala', { required: false, label: { it: 'Scala', en: 'Staircase (scala)' }, ask: { it: 'Es. A — scrivi “unica” se non c’è', en: 'e.g. A — write “unica” if there is only one' } }),
    propField('propertyInterno', 'interno', { needs: ['contract', 'registration'], read: (ctx) => pick(obj(ctx.property).interno, obj(ctx.property).unit), label: { it: 'Interno', en: 'Apartment number (interno)' }, ask: { it: 'Es. 7', en: 'e.g. 7' } }),
    propField('propertyRooms', 'rooms', { type: 'number', label: { it: 'Vani (oltre cucina e servizi)', en: 'Rooms (excluding kitchen and bathrooms)' }, ask: { it: 'Es. 3', en: 'e.g. 3' } }),
    propField('propertyAccessories', 'accessories', { required: false, label: { it: 'Accessori', en: 'Accessory spaces' }, ask: { it: 'Cantina, soffitta, posto auto… o “nessuno”', en: 'Cellar, attic, parking… or “none”' } }),
    propField('propertyFurnished', 'furnished', { type: 'yesno',
      read: (ctx) => { const p = obj(ctx.property); return (p.furnished === true || p.furnished === 'yes') ? 'yes' : (p.furnished === false || p.furnished === 'no') ? 'no' : ''; },
      label: { it: 'Ammobiliato', en: 'Furnished' }, ask: { it: 'Come da elenco arredi', en: 'As per the furniture list' } }),
    propField('propertyEnergy', 'energyClass', { needs: ['contract', 'registration'],
      read: (ctx) => pick(obj(ctx.property).energyCert, obj(ctx.property).energyClass, obj(ctx.contract).energyClass),
      write: { doc: 'property', path: 'energyClass', also: { doc: 'contract', path: 'energyClass' } },
      label: { it: 'Classe energetica (APE)', en: 'Energy class (APE)' }, ask: { it: 'Es. E — dall’attestato', en: 'e.g. E — from the APE certificate' } }),
    { key: 'impiantiStato', group: 'property', owner: 'landlord', templates: ['B', 'C'], needs: ['contract'], required: false, type: 'select', options: IMPIANTI,
      read: (ctx) => pick(obj(ctx.contract).impiantiStato, obj(ctx.property).impiantiStato), write: { doc: 'contract', path: 'impiantiStato', also: { doc: 'property', path: 'impiantiStato' } },
      label: { it: 'Sicurezza impianti', en: 'Systems safety (electric, gas)' }, ask: { it: 'Vuoto = “funzionanti e idonei”', en: 'Empty = “working and fit for use”' } },
    tabField('tabProprieta', 'proprieta', { label: { it: 'Millesimi proprietà', en: 'Ownership shares' }, ask: { it: 'Dalla tabella condominiale', en: 'From the condominium table' } }),
    tabField('tabRiscaldamento', 'riscaldamento', { label: { it: 'Millesimi riscaldamento', en: 'Heating shares' }, ask: { it: '', en: '' } }),
    tabField('tabAcqua', 'acqua', { label: { it: 'Millesimi acqua', en: 'Water shares' }, ask: { it: '', en: '' } }),
    tabField('tabAltre', 'altre', { type: 'text', label: { it: 'Altre tabelle', en: 'Other tables' }, ask: { it: 'Es. scale 41, ascensore 38', en: 'e.g. stairs 41, lift 38' } }),

    // ── TERMINI (l'operatore: nascono dalla proposta o dal portal) ────
    { key: 'type', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract', 'registration'], required: true, type: 'select', options: [{ v: 'transitorio', it: 'Transitorio (Allegato B)', en: 'Transitional (Allegato B)' }, { v: 'studenti', it: 'Studenti (Allegato C)', en: 'Students (Allegato C)' }],
      read: (ctx) => pick(obj(ctx.contract).type) || 'transitorio', write: { doc: 'contract', path: 'type' }, label: { it: 'Tipo di contratto', en: 'Contract type' }, ask: { it: '', en: '' } },
    { key: 'startDate', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract', 'registration'], required: true, type: 'date',
      read: (ctx) => pick(obj(obj(ctx.contract).durata).startDate, obj(ctx.contract).startDate), write: { doc: 'contract', path: 'startDate' }, label: { it: 'Decorrenza', en: 'Start date' }, ask: { it: '', en: '' } },
    { key: 'endDate', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract', 'registration'], required: true, type: 'date',
      read: (ctx) => pick(obj(obj(ctx.contract).durata).endDate, obj(ctx.contract).endDate), write: { doc: 'contract', path: 'endDate' }, label: { it: 'Scadenza', en: 'End date' }, ask: { it: '', en: '' } },
    { key: 'rent', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract', 'registration'], required: true, type: 'number',
      read: (ctx) => { const c = obj(ctx.contract); const v = pick(obj(c.canone).monthly, c.rent); return (v && Number(v) > 0) ? v : ''; }, write: { doc: 'contract', path: 'rent' }, label: { it: 'Canone mensile (€)', en: 'Monthly rent (€)' }, ask: { it: '', en: '' } },
    { key: 'deposit', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract'], required: (ctx) => templateOf(ctx.contract) === 'B', type: 'number',
      read: (ctx) => { const d = obj(ctx.contract).deposit; const v = (d && typeof d === 'object') ? d.amount : d; return (v !== undefined && v !== null && v !== '') ? String(v) : ''; }, write: { doc: 'contract', path: 'deposit' }, label: { it: 'Deposito cauzionale (€)', en: 'Security deposit (€)' }, ask: { it: 'Su Allegato C “0” = nessun deposito, dichiarato', en: '' } },
    { key: 'paymentDay', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract'], required: false, type: 'number',
      read: (ctx) => { const c = obj(ctx.contract); return pick(c.paymentDay, obj(c.canone).paymentDay); }, write: { doc: 'contract', path: 'paymentDay' }, label: { it: 'Giorno di pagamento', en: 'Payment day' }, ask: { it: 'Vuoto = 5', en: 'Empty = 5th' } },
    { key: 'paymentMethod', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract'], required: false, type: 'text',
      read: (ctx) => { const c = obj(ctx.contract); return pick(obj(c.canone).paymentMethod, c.paymentMethod); }, write: { doc: 'contract', path: 'paymentMethod' }, label: { it: 'Mezzo di pagamento', en: 'Payment method' }, ask: { it: 'Vuoto = bonifico bancario', en: 'Empty = bank transfer' } },
    { key: 'installmentMonths', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract'], required: false, type: 'select', options: [1, 2, 3, 6, 12].map(n => ({ v: String(n), it: { 1: 'Mensile', 2: 'Bimestrale', 3: 'Trimestrale', 6: 'Semestrale', 12: 'Annuale' }[n], en: { 1: 'Monthly', 2: 'Every 2 months', 3: 'Quarterly', 6: 'Every 6 months', 12: 'Yearly' }[n] })),
      read: (ctx) => pick(obj(ctx.contract).installmentMonths), write: { doc: 'contract', path: 'installmentMonths' }, label: { it: 'Cadenza rate', en: 'Instalment cadence' }, ask: { it: 'Vuoto = mensile', en: 'Empty = monthly' } },
    { key: 'cedolareSecca', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract', 'registration'], required: true, type: 'select', options: CEDOLARE,
      // Assente = sì per TUTTI i lettori (cedolareOn): nessun puntino sul PDF,
      // quindi nessun «mancante» finto che blocchi l'invito di firma.
      read: (ctx) => cedolareOn(obj(ctx.contract)) ? 'si' : 'no',
      write: { doc: 'contract', path: 'cedolareSecca' }, label: { it: 'Cedolare secca', en: 'Cedolare secca (flat tax)' }, ask: { it: 'Decide l’art. 7 (B) / 6 (C) e la registrazione', en: '' } },
    { key: 'oneriQuota', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract'], required: false, type: 'number',
      read: (ctx) => pick(obj(ctx.contract).oneriQuota), write: { doc: 'contract', path: 'oneriQuota' }, label: { it: 'Acconto oneri accessori (€/mese)', en: 'Service charges advance (€/month)' }, ask: { it: 'Vuoto = a consuntivo (B) / “--” (C)', en: '' } },
    { key: 'condoMode', group: 'terms', owner: 'operator', templates: ['B'], needs: ['contract'], required: false, type: 'select', options: [{ v: 'incluso', it: 'Spese incluse nel canone', en: 'Charges included in rent' }, { v: 'consuntivo', it: 'A consuntivo', en: 'Settled on actual costs' }],
      read: (ctx) => pick(obj(ctx.contract).condoMode), write: { doc: 'contract', path: 'condoMode' }, label: { it: 'Regime oneri', en: 'Service charges regime' }, ask: { it: '', en: '' } },
    { key: 'consegnaStato', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract'], required: false, type: 'textarea',
      read: (ctx) => pick(obj(ctx.contract).consegnaStato), write: { doc: 'contract', path: 'consegnaStato' }, label: { it: 'Stato di consegna (art. 1590 c.c.)', en: 'Condition at handover (art. 1590 c.c.)' }, ask: { it: 'Vuoto = rinvia al verbale di consegna', en: '' } },
    { key: 'garanzieAltre', group: 'terms', owner: 'operator', templates: ['C'], needs: ['contract'], required: false, type: 'text',
      read: (ctx) => pick(obj(ctx.contract).garanzieAltre), write: { doc: 'contract', path: 'garanzieAltre' }, label: { it: 'Altre forme di garanzia', en: 'Other guarantees' }, ask: { it: 'Vuoto = “--”', en: '' } },
    { key: 'subentroModalita', group: 'terms', owner: 'operator', templates: ['C'], needs: ['contract'], required: false, type: 'text',
      read: (ctx) => pick(obj(ctx.contract).subentroModalita), write: { doc: 'contract', path: 'subentroModalita' }, label: { it: 'Modalità di subentro', en: 'Replacement of a co-tenant' }, ask: { it: 'Vuoto = “--”', en: '' } },
    { key: 'accessiModalita', group: 'terms', owner: 'operator', templates: ['C'], needs: ['contract'], required: false, type: 'text',
      read: (ctx) => pick(obj(ctx.contract).accessiModalita), write: { doc: 'contract', path: 'accessiModalita' }, label: { it: 'Modalità di accesso per visite', en: 'Access for viewings' }, ask: { it: 'Vuoto = “--”', en: '' } },
    { key: 'signaturePlace', group: 'terms', owner: 'operator', templates: ['B', 'C'], needs: ['contract'], required: false, type: 'text',
      read: (ctx) => pick(obj(ctx.contract).signaturePlace), write: { doc: 'contract', path: 'signaturePlace' }, label: { it: 'Luogo di firma', en: 'Place of signature' }, ask: { it: 'Vuoto = Roma', en: '' } },

    // ── ESIGENZA TRANSITORIA — Allegato B art. 2: «Il locatore/conduttore
    //    … dichiara la seguente esigenza … e che documenta, in caso di
    //    durata superiore a 30 giorni, allegando …». Di chi è l'esigenza lo
    //    decide l'operatore; la domanda e il documento vanno a QUELLA parte.
    { key: 'esigenzaDi', group: 'terms', owner: 'operator', templates: ['B'], needs: ['operations'], required: false, type: 'select', options: ESIGENZA_DI,
      read: (ctx) => pick(obj(ctx.contract).esigenzaDi), write: { doc: 'contract', path: 'esigenzaDi' }, label: { it: 'Esigenza transitoria di', en: 'Temporary need belongs to' }, ask: { it: 'Vuoto = del conduttore', en: 'Empty = the tenant’s' } },
    { key: 'transitionalReason', group: 'esigenza', owner: esigenzaOwner, templates: ['B'], needs: ['contract', 'registration'], required: true, type: 'textarea',
      read: (ctx) => { const c = obj(ctx.contract); return pick(obj(c.motivazioneTransitorieta).esigenza, c.transitionalReason); },
      write: { doc: 'contract', path: 'transitionalReason' },
      label: { it: 'Motivo della transitorietà', en: 'Reason for the temporary stay' }, ask: { it: 'Es. incarico di lavoro a Roma fino a …, corso, cure', en: 'e.g. work assignment in Rome until …, a course, medical care' } },
    { key: 'transitionalDocs', group: 'esigenza', owner: esigenzaOwner, templates: ['B'], needs: ['contract', 'registration'], required: (ctx) => leaseDays(ctx.contract) > 30, type: 'text',
      read: (ctx) => { const c = obj(ctx.contract); return pick(obj(c.motivazioneTransitorieta).documento, c.transitionalDocs); },
      write: { doc: 'contract', path: 'transitionalDocs' },
      label: { it: 'Documento che la prova', en: 'Document proving it' }, ask: { it: 'Es. lettera del datore di lavoro, iscrizione, certificato medico', en: 'e.g. employer letter, enrolment, medical certificate' } },
    { key: 'transitionalDocUpload', group: 'docs', owner: esigenzaOwner, templates: ['B'], needs: ['registration'], required: (ctx) => leaseDays(ctx.contract) > 30, type: 'upload', uploadKind: 'extra',
      read: (ctx) => extraDocs(ctx.contract).length ? 'ok' : '', write: null,
      label: { it: 'Attestazione dell’esigenza (file)', en: 'Proof of the temporary need (file)' }, ask: { it: 'Foto o PDF del documento', en: 'Photo or PDF of the document' } },

    // ── STUDENTI — Allegato C art. 2: «frequentando il corso di studi di …
    //    presso l'Università “…” di Roma». Il resto serve all'attestazione
    //    di iscrizione (ASPI), non al PDF: need 'operations', mai in dots.
    { key: 'studCorsoStudi', group: 'studenti', owner: 'tenant', templates: ['C'], needs: ['contract', 'registration'], required: true, type: 'text',
      read: (ctx) => { const c = obj(ctx.contract); return pick(obj(c.studenti).corsoStudi, c.courseName); }, write: { doc: 'contract', path: 'studenti.corsoStudi', mirror: 'courseName' },
      label: { it: 'Corso di studi', en: 'Degree course' }, ask: { it: 'Es. Economia e Management', en: 'e.g. Economics and Management' } },
    { key: 'studUniversita', group: 'studenti', owner: 'tenant', templates: ['C'], needs: ['contract', 'registration'], required: true, type: 'text',
      read: (ctx) => { const c = obj(ctx.contract); return pick(obj(c.studenti).universita, c.universityName); }, write: { doc: 'contract', path: 'studenti.universita', mirror: 'universityName' },
      label: { it: 'Università', en: 'University' }, ask: { it: 'Es. LUISS Guido Carli', en: 'e.g. LUISS Guido Carli' } },
    { key: 'studUniversitaIndirizzo', group: 'studenti', owner: 'tenant', templates: ['C'], needs: ['operations'], required: false, type: 'text',
      read: (ctx) => pick(obj(obj(ctx.contract).studenti).universitaIndirizzo), write: { doc: 'contract', path: 'studenti.universitaIndirizzo' },
      label: { it: 'Sede dell’università', en: 'University address' }, ask: { it: 'Via e comune della sede frequentata', en: 'Street and city of your campus' } },
    { key: 'studTipoIscrizione', group: 'studenti', owner: 'tenant', templates: ['C'], needs: ['operations'], required: false, type: 'select', options: ISCRIZIONE,
      read: (ctx) => pick(obj(obj(ctx.contract).studenti).tipoIscrizione), write: { doc: 'contract', path: 'studenti.tipoIscrizione' },
      label: { it: 'Tipo di iscrizione', en: 'Enrolment type' }, ask: { it: '', en: '' } },
    { key: 'studAnnoAccademico', group: 'studenti', owner: 'tenant', templates: ['C'], needs: ['operations'], required: false, type: 'text',
      read: (ctx) => pick(obj(obj(ctx.contract).studenti).annoAccademico), write: { doc: 'contract', path: 'studenti.annoAccademico' },
      label: { it: 'Anno accademico', en: 'Academic year' }, ask: { it: 'Es. 2026/2027', en: 'e.g. 2026/2027' } },
    { key: 'iscrizioneDocUpload', group: 'docs', owner: 'tenant', templates: ['C'], needs: ['registration'], required: true, type: 'upload', uploadKind: 'extra',
      read: (ctx) => extraDocs(ctx.contract).length ? 'ok' : '', write: null,
      label: { it: 'Certificato di iscrizione (file)', en: 'Enrolment certificate (file)' }, ask: { it: 'Foto o PDF', en: 'Photo or PDF' } },

    // ── USO — B art. 9 / C art. 8: «del conduttore e delle seguenti persone
    //    attualmente con lui conviventi: …». UNA chiave (cohabitants) letta
    //    da entrambi i modelli; i co-conduttori firmatari ci stanno già
    //    dentro (convert.js) e il token del conduttore non li cancella.
    { key: 'cohabitants', group: 'uso', owner: 'tenant', templates: ['B', 'C'], needs: ['contract'], required: true, type: 'people',
      read: (ctx) => { const c = obj(ctx.contract); return pick(obj(c.uso).conviventi, c.cohabitants); }, write: { doc: 'contract', path: 'cohabitants' },
      label: { it: 'Conviventi', en: 'People living with you' }, ask: { it: 'Nome e cognome di chi vivrà con te — o “vivo da solo/a”', en: 'Full names of anyone living with you — or “just me”' } },

    // ── DOCUMENTI D'IDENTITÀ caricati (registrazione / iter ASPI) ─────
    { key: 'tenantIdDoc', group: 'docs', owner: 'tenant', templates: ['B', 'C'], needs: ['registration'], required: true, type: 'upload', uploadKind: 'id',
      read: (ctx) => tenantDocs(ctx.contract).length ? 'ok' : '', write: null,
      label: { it: 'Copia documento conduttore', en: 'Copy of your ID' }, ask: { it: 'Foto fronte/retro o PDF', en: 'Photo (front/back) or PDF' } },
    { key: 'landlordIdDoc', group: 'docs', owner: 'landlord', templates: ['B', 'C'], needs: ['registration'], required: true, type: 'upload', uploadKind: 'id',
      read: (ctx) => landlordDocs(ctx.contract).length ? 'ok' : '', write: null,
      label: { it: 'Copia documento locatore', en: 'Copy of your ID' }, ask: { it: 'Foto fronte/retro o PDF', en: 'Photo (front/back) or PDF' } },
  ];

  const BY_KEY = {};
  FIELDS.forEach(f => { BY_KEY[f.key] = f; });

  // I campi dell'IMMOBILE che una Scheda (locatore) può scrivere: derivati
  // dalle dichiarazioni write/also del dizionario + il blob catastale che
  // applyAnswers ricompone. La lista bianca di api/profile/submit.js È questa.
  const PROPERTY_WRITE_KEYS = Array.from(new Set(FIELDS.flatMap(f => [
    f.write && f.write.doc === 'property' ? f.write.path.split('.')[0] : null,
    f.write && f.write.also && f.write.also.doc === 'property' ? f.write.also.path.split('.')[0] : null,
  ]).filter(Boolean).concat(['cadastralData'])));

  // Le LETTURE che il dizionario dichiara di coprire in js/contract-pdf.js
  // — il test anti-deriva le confronta con ciò che il file legge davvero,
  // nelle due direzioni (una lettura non dichiarata → CI rossa; una voce
  // senza lettura → CI rossa).
  const READS = {
    contract: ['tenantName', 'tenantCF', 'tenantDob', 'tenantPob', 'tenantAddress', 'tenantDocType', 'tenantDocNum', 'tenantDocIssuer', 'tenantDocIssueDate',
      'landlordName', 'landlordCF', 'landlordDob', 'landlordPob', 'landlordAddress',
      'type', 'startDate', 'endDate', 'rent', 'deposit', 'paymentDay', 'paymentMethod', 'installmentMonths', 'cedolareSecca',
      'oneriQuota', 'condoMode', 'consegnaStato', 'garanzieAltre', 'subentroModalita', 'accessiModalita', 'signaturePlace',
      'transitionalReason', 'transitionalDocs', 'studenti', 'courseName', 'universityName', 'cohabitants', 'uso',
      'renditaCatastale', 'energyClass', 'impiantiStato', 'propertyExtra', 'motivazioneTransitorieta', 'canone', 'durata'],
    property: ['address', 'city', 'floor', 'scala', 'interno', 'unit', 'rooms', 'accessories', 'furnished', 'cadastralData', 'renditaCatastale', 'energyCert', 'energyClass', 'safetyImplants', 'tabelleMillesimali', 'impiantiStato', 'foglio', 'particella', 'sub', 'categoria'],
    tenant: ['name', 'cf', 'codiceFiscale', 'dob', 'birthDate', 'pob', 'birthPlace', 'address', 'docType', 'idDocType', 'docNum', 'idDocNumber', 'docIssuer', 'docIssueDate'],
    landlord: ['name', 'cf', 'codiceFiscale', 'dob', 'birthDate', 'pob', 'birthPlace', 'address'],
  };

  // ── Lettura normalizzata di un campo ──────────────────────────────────
  function needsOf(f, tpl) { return typeof f.needs === 'function' ? f.needs(tpl) : (f.needs || []); }
  function isRequired(f, ctx) { return typeof f.required === 'function' ? !!f.required(ctx) : f.required !== false; }
  function ownerOf(f, ctx) { return typeof f.owner === 'function' ? f.owner(ctx) : f.owner; }
  function onTemplate(f, tpl) { return (f.templates || ['B', 'C']).indexOf(tpl) >= 0; }
  function valueOf(f, ctx) { try { return str(f.read(ctx)); } catch (_) { return ''; } }
  function fieldsFor(tpl) { return FIELDS.filter(f => onTemplate(f, tpl)); }
  const read = (key, ctx) => { const f = BY_KEY[key]; return f ? valueOf(f, ctx) : ''; };

  // Livello di completezza: 'contract' (il PDF), 'registration' (PDF + RLI),
  // 'all' (anche i contatti/IBAN della macchina).
  function inLevel(f, tpl, level) {
    const n = needsOf(f, tpl);
    if (level === 'all') return true;
    if (level === 'registration') return n.indexOf('contract') >= 0 || n.indexOf('registration') >= 0;
    return n.indexOf('contract') >= 0;
  }

  // ── I CO-CONDUTTORI sono conduttori per l'AdE: ogni riga RLI vuole il CF ─
  // Identità piatta di coTenants[i] (schema convert.js: name, cf, dob,
  // birthPlace, address, idDoc, nationality, email, phone + i campi che la
  // Scheda aggiunge: docType, docIssuer, docIssueDate).
  function cotenantIdentity(co) {
    co = obj(co);
    return {
      name: str(co.name), cf: str(co.cf).toUpperCase(), dob: str(co.dob), pob: str(co.birthPlace || co.pob), address: str(co.address),
      docType: docTypeCode(co.docType), docNum: str(co.idDoc || co.docNum), docIssuer: str(co.docIssuer), docIssueDate: str(co.docIssueDate),
      nationality: str(co.nationality), phone: str(co.phone), email: str(co.email),
    };
  }
  const COTENANT_REQ = [['name', 'contract'], ['cf', 'registration'], ['dob', 'registration'], ['pob', 'registration'], ['nationality', 'registration'], ['docNum', 'registration']];
  const COTENANT_LABEL = { name: 'tenantName', cf: 'tenantCF', dob: 'tenantDob', pob: 'tenantPob', nationality: 'tenantNationality', docNum: 'tenantDocNum' };
  function cotenantMissing(co) {
    const d = cotenantIdentity(co);
    return COTENANT_REQ.filter(([k]) => !has(d[k])).map(([k, need]) => ({ key: 'cotenant.' + k, label: BY_KEY[COTENANT_LABEL[k]].label, need }));
  }
  // Ritorna il coTenants[idx] aggiornato con un'identità della Scheda —
  // SOLO quel firmatario, le firme e gli altri restano intatti.
  function applyCotenantIdentity(co, id) {
    co = clone(co); id = obj(id);
    const set = (k, v) => { if (has(v)) co[k] = str(v); };
    set('name', id.name); set('cf', str(id.cf).toUpperCase()); set('dob', id.dob); set('birthPlace', id.pob); set('address', id.address);
    set('idDoc', id.docNum); set('docType', docTypeCode(id.docType)); set('docIssuer', id.docIssuer); set('docIssueDate', id.docIssueDate);
    set('nationality', id.nationality); set('phone', id.phone);
    return co;
  }

  // ── CONFORMITÀ DI LEGGE (non blocca il PDF, spegne ready.registration) ──
  // Transitorio: da 1 a 18 mesi (DM 16/01/2017 art. 2). Studenti: da 6 mesi
  // a 3 anni (art. 3). Nota, non blocco silenzioso: si stampa e si dice.
  function legalChecks(ctx) {
    const c = obj(obj(ctx).contract);
    const tpl = templateOf(c);
    const m = leaseMonths(c);
    const out = [];
    if (!m) return out;
    if (tpl === 'B') out.push({ code: 'durata_transitorio', ok: m >= 1 && m <= 18, months: m, note: { it: 'Transitorio: durata ammessa da 1 a 18 mesi (DM 16/01/2017 art. 2)', en: 'Transitional lease: allowed term 1–18 months' } });
    if (tpl === 'C') out.push({ code: 'durata_studenti', ok: m >= 6 && m <= 36, months: m, note: { it: 'Studenti: durata ammessa da 6 mesi a 3 anni (DM 16/01/2017 art. 3)', en: 'Student lease: allowed term 6–36 months' } });
    return out;
  }

  // ── COMPLETEZZA ──────────────────────────────────────────────────────
  // ctx = { contract, property, tenant, landlord } (users doc del conduttore
  // e del locatore — per il locatore già fuso con landlords/<uid>).
  function completeness(ctx, opts) {
    ctx = ctx || {};
    opts = opts || {};
    const tpl = templateOf(ctx.contract);
    const by = { tenant: { missing: [], optional: [] }, landlord: { missing: [], optional: [] }, operator: { missing: [], optional: [] } };
    const dots = [];
    let regMissing = 0, conMissing = 0;
    fieldsFor(tpl).forEach(f => {
      const v = valueOf(f, ctx);
      if (v !== '') return;
      const n = needsOf(f, tpl);
      const req = isRequired(f, ctx);
      const owner = ownerOf(f, ctx);
      const entry = { key: f.key, label: f.label, group: f.group, owner, needs: n, required: req, type: f.type };
      if (n.indexOf('contract') >= 0) dots.push(entry);
      if (req) {
        if (n.indexOf('contract') >= 0) conMissing++;
        if (n.indexOf('contract') >= 0 || n.indexOf('registration') >= 0) regMissing++;
        by[owner].missing.push(entry);
      } else {
        by[owner].optional.push(entry);
      }
    });
    // Co-conduttori: una riga RLI ciascuno, CF obbligatorio.
    const cotenants = coTenantsOf(ctx.contract).map((co, i) => ({ index: i, name: str(co.name), missing: cotenantMissing(co) }));
    cotenants.forEach(ct => ct.missing.forEach(m => { if (m.need === 'contract') conMissing++; regMissing++; }));
    const legal = legalChecks(ctx);
    const legalOk = legal.every(l => l.ok);
    // Filtro per livello (default 'registration': il PDF + ciò che l'AdE vuole).
    const level = opts.level || 'registration';
    ['tenant', 'landlord', 'operator'].forEach(o => {
      by[o].missing = by[o].missing.filter(e => inLevel(BY_KEY[e.key], tpl, level));
      by[o].optional = by[o].optional.filter(e => inLevel(BY_KEY[e.key], tpl, level));
    });
    return {
      template: tpl,
      byOwner: by,
      cotenants,
      legal,
      ready: { contract: conMissing === 0, registration: regMissing === 0 && legalOk },
      dots,
      missingKeys: ['tenant', 'landlord', 'operator'].reduce((a, o) => a.concat(by[o].missing.map(e => e.key)), []),
    };
  }

  const printCheck = (ctx) => completeness(ctx, { level: 'contract' }).dots;

  // La lista dei mancanti di UN ruolo, con label nella lingua richiesta.
  function missingFor(role, ctx, opts) {
    const c = completeness(ctx, opts);
    const lang = (opts && opts.lang) || (role === 'landlord' ? 'it' : 'en');
    const o = c.byOwner[role] || { missing: [] };
    return o.missing.map(e => ({ key: e.key, label: (e.label && e.label[lang]) || (e.label && e.label.it) || e.key, group: e.group }));
  }

  // ── L'identità di una parte è completa? (una copia — _scheda.js la usa) ─
  // `d` è l'oggetto identità piatto (mergedIdentity): name, cf, dob, … .
  const IDENTITY_KEYS = ['Name', 'CF', 'Dob', 'Pob', 'Address', 'DocType', 'DocNum', 'DocIssuer', 'DocIssueDate', 'Nationality'];
  const IDENT_MAP = { Name: 'name', CF: 'cf', Dob: 'dob', Pob: 'pob', Address: 'address', DocType: 'docType', DocNum: 'docNum', DocIssuer: 'docIssuer', DocIssueDate: 'docIssueDate', Nationality: 'nationality' };
  function identityComplete(d, opts) {
    d = d || {};
    const role = (opts && opts.role) === 'landlord' ? 'landlord' : 'tenant';
    const tpl = (opts && opts.template) || 'B';
    const fake = { contract: { type: tpl === 'C' ? 'studenti' : 'transitorio', landlordKind: d.kind || '' }, landlord: { kind: d.kind || '' }, tenant: { nationality: d.nationality || '' } };
    return IDENTITY_KEYS.every(k => {
      const f = BY_KEY[role + k];
      if (!f || !onTemplate(f, tpl)) return true;
      if (!isRequired(f, fake)) return true;
      if (needsOf(f, tpl).indexOf('contract') < 0 && needsOf(f, tpl).indexOf('registration') < 0) return true;
      return has(d[IDENT_MAP[k]]);
    }) && (!has(d.cf) || validCFFor(role, d.cf));
  }

  // ── LA SCHEDA CHE SI ADATTA ──────────────────────────────────────────
  // Sezioni (oltre all'identità, che la pagina gestisce nel suo step 1)
  // con SOLO i campi vuoti di QUEL ruolo: required prima, poi gli
  // opzionali della stessa sezione. Una sezione senza campi vuoti non esiste.
  function askFor(role, ctx, opts) {
    ctx = ctx || {};
    opts = opts || {};
    const tpl = templateOf(ctx.contract);
    const who = role === 'landlord' ? 'landlord' : 'tenant';
    const lang = opts.lang || (who === 'landlord' ? 'it' : 'en');
    const groups = {};
    const identityMissing = [];
    fieldsFor(tpl).forEach(f => {
      if (ownerOf(f, ctx) !== who) return;
      if (f.type === 'upload') return;                 // gli upload hanno il loro step
      const v = valueOf(f, ctx);
      const req = isRequired(f, ctx);
      const n = needsOf(f, tpl);
      if (f.group === 'identity') { if (v === '' && req && (n.indexOf('contract') >= 0 || n.indexOf('registration') >= 0)) identityMissing.push(f.key); return; }
      if (n.indexOf('contract') < 0 && n.indexOf('registration') < 0 && opts.includeOperations === false) return;
      if (v !== '' && !opts.includeFilled) return;
      const g = groups[f.group] || (groups[f.group] = { key: f.group, title: SECTIONS[f.group] || { it: f.group, en: f.group }, fields: [] });
      const entry = {
        key: f.key, type: f.type, required: req, value: v,
        label: f.label, ask: f.ask || { it: '', en: '' },
        options: f.options ? f.options.map(o => ({ v: o.v, label: { it: o.it, en: o.en } })) : undefined,
      };
      // Conviventi: i co-conduttori firmatari sono già "in casa" — la
      // pagina li mostra e chiede chi c'è OLTRE a loro.
      if (f.type === 'people') entry.cotenants = coTenantsOf(ctx.contract).map(x => str(x.name));
      g.fields.push(entry);
    });
    const order = Object.keys(SECTIONS);
    const sections = order.filter(k => groups[k]).map(k => {
      const g = groups[k];
      g.fields.sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
      return g;
    });
    const missingCount = identityMissing.length + sections.reduce((n, s) => n + s.fields.filter(x => x.required && x.value === '').length, 0);
    return { role: who, template: tpl, lang, identityMissing, sections, missingCount, complete: missingCount === 0 };
  }

  // ── APPLICARE LE RISPOSTE — la lista bianca per owner ────────────────
  // answers = { key: value } dal client. Torna le patch per documento e
  // ciò che è stato SCARTATO con il motivo: un campo di un altro owner, un
  // valore invalido, una key sconosciuta. Mai in silenzio.
  const SENTINEL_NONE = /^(nessuno|nessuna|no|none|nobody|just me|solo io|vivo da sol[oa]|da sol[oa]|alone|-|--)$/i;
  function normalizeAnswer(f, raw) {
    if (raw === undefined || raw === null) return { ok: false, why: 'empty' };
    if (f.type === 'people') {
      if (raw && typeof raw === 'object' && raw.alone) return { ok: true, value: 'nessuno' };
      const s = str(typeof raw === 'object' ? raw.text : raw).replace(/\s+/g, ' ').slice(0, 400);
      if (!s) return { ok: false, why: 'empty' };
      return { ok: true, value: SENTINEL_NONE.test(s) ? 'nessuno' : s };
    }
    const s = str(raw);
    if (s === '') return { ok: false, why: 'empty' };
    switch (f.type) {
      case 'cf': { const cf = s.toUpperCase().replace(/\s+/g, ''); return validCF16(cf) ? { ok: true, value: cf } : { ok: false, why: 'cf_invalid' }; }
      case 'cfx': { const cf = s.toUpperCase().replace(/\s+/g, ''); return validCF(cf) ? { ok: true, value: cf } : { ok: false, why: 'cf_invalid' }; }
      case 'piva': { const p = s.replace(/\s+/g, '').replace(/^IT/i, ''); return validPIva(p) ? { ok: true, value: p } : { ok: false, why: 'piva_invalid' }; }
      case 'date': return ISO_DATE.test(s) ? { ok: true, value: s } : { ok: false, why: 'date_invalid' };
      case 'number': { const n = parseItNumber(s); return (isFinite(n) && n >= 0) ? { ok: true, value: n } : { ok: false, why: 'number_invalid' }; }
      case 'yesno': return /^(yes|si|sì|true|1)$/i.test(s) ? { ok: true, value: true } : /^(no|false|0)$/i.test(s) ? { ok: true, value: false } : { ok: false, why: 'yesno_invalid' };
      case 'select': return (f.options || []).some(o => String(o.v) === s) ? { ok: true, value: s } : { ok: false, why: 'option_invalid' };
      case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { ok: true, value: s.slice(0, 160).toLowerCase() } : { ok: false, why: 'email_invalid' };
      case 'iban': { const ib = s.replace(/\s+/g, '').toUpperCase(); return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(ib) && ibanOk(ib) ? { ok: true, value: ib } : { ok: false, why: 'iban_invalid' }; }
      case 'tel': return { ok: true, value: s.slice(0, 30) };
      case 'textarea': return { ok: true, value: s.slice(0, 600) };
      default: return { ok: true, value: s.slice(0, 200) };
    }
  }
  // «1.250» è milleduecentocinquanta (punto delle migliaia), «1.250,30» pure,
  // «12,5» è dodici e mezzo, «12.5» (tastiera EN) pure: il punto è decimale
  // SOLO quando non è seguito da esattamente tre cifre finali.
  function parseItNumber(raw) {
    let s = String(raw).replace(/\s+/g, '').replace(/€/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    else if (/^-?\d+\.\d{3}$/.test(s)) s = s.replace('.', '');
    return Number(s);
  }
  function ibanOk(iban) {
    const r = iban.slice(4) + iban.slice(0, 4);
    let n = '';
    for (const ch of r) n += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    let rem = 0;
    for (let i = 0; i < n.length; i += 7) rem = Number(String(rem) + n.slice(i, i + 7)) % 97;
    return rem === 1;
  }
  function setPath(target, path, value) {
    const parts = path.split('.');
    let o = target;
    for (let i = 0; i < parts.length - 1; i++) { o = o[parts[i]] = obj(o[parts[i]]); }
    o[parts[parts.length - 1]] = value;
  }
  // Conviventi con co-conduttori firmatari: il token del conduttore non
  // può cancellarli. La stringa esistente (che convert.js ha costruito con
  // la loro anagrafica) resta in testa; «vivo da solo» con co-conduttori
  // presenti = solo loro; una lista dichiarata si accoda senza doppioni.
  function composeCohabitants(contract, declared) {
    const cos = coTenantsOf(contract);
    if (!cos.length) return declared;
    const existing = str(obj(contract).cohabitants);
    const head = existing || cos.map(x => str(x.name)).join('; ');
    if (declared === 'nessuno') return head;
    const parts = declared.split(/\s*[;,]\s*/).filter(Boolean).filter(p => head.toLowerCase().indexOf(p.toLowerCase()) < 0);
    return parts.length ? head + '; ' + parts.join('; ') : head;
  }
  function applyAnswers(role, answers, ctx) {
    ctx = ctx || {};
    const who = role === 'landlord' ? 'landlord' : 'tenant';
    const tpl = templateOf(ctx.contract);
    const out = { contract: {}, property: {}, user: {}, rejected: [], applied: [] };
    const c = obj(ctx.contract);
    const p = obj(ctx.property);
    // Le mappe annidate si riscrivono INTERE partendo dal dato esistente
    // (regola 4 in testa al file).
    const nested = { contract: { propertyExtra: clone(c.propertyExtra), studenti: clone(c.studenti) }, property: { tabelleMillesimali: clone(p.tabelleMillesimali) } };
    let catTouched = false;
    const put = (doc, path, value) => {
      const top = path.split('.')[0];
      if (path.indexOf('.') >= 0) { setPath(nested[doc], path, value); out[doc][top] = nested[doc][top]; }
      else out[doc][path] = value;
    };
    Object.keys(obj(answers)).forEach(key => {
      const f = BY_KEY[key];
      if (!f) { out.rejected.push({ key, why: 'unknown' }); return; }
      if (ownerOf(f, ctx) !== who) { out.rejected.push({ key, why: 'not_yours' }); return; }
      if (!onTemplate(f, tpl)) { out.rejected.push({ key, why: 'not_on_template' }); return; }
      if (!f.write) { out.rejected.push({ key, why: 'upload_only' }); return; }
      const norm = normalizeAnswer(f, answers[key]);
      if (!norm.ok) { out.rejected.push({ key, why: norm.why }); return; }
      // fillOnly: un dato che c'è già non si riscrive da un link pubblico
      // (email di firma, IBAN, indirizzo dell'immobile): si corregge dal portal.
      if (f.fillOnly && valueOf(f, ctx) !== '' && valueOf(f, ctx) !== str(norm.value)) { out.rejected.push({ key, why: 'already_set' }); return; }
      let value = norm.value;
      if (f.sensitive) out.sensitive = (out.sensitive || []).concat([{ key, value: str(value) }]);
      if (f.type === 'people') value = composeCohabitants(c, value);
      const w = f.write;
      put(w.doc, w.path, value);
      if (w.mirror) out.contract[w.mirror] = value;
      if (w.also) put(w.also.doc, w.also.path, value);
      if (w.cadastral) catTouched = true;
      if (w.user && w.user.length) w.user.forEach(k => { out.user[k] = value; });
      out.applied.push(key);
    });
    // Catasto strutturato → il blob per chi lo legge ancora (PDF: formatCadastral
    // legge i campi strutturati per primo, il blob resta la rete).
    if (catTouched) {
      const merged = { sezione: catRead({ property: p, contract: c }, 'sezione'), foglio: catRead({ property: p, contract: c }, 'foglio'), particella: catRead({ property: p, contract: c }, 'particella'), sub: catRead({ property: p, contract: c }, 'sub'), categoria: catRead({ property: p, contract: c }, 'categoria') };
      Object.keys(merged).forEach(k => { if (out.property[k] !== undefined) merged[k] = out.property[k]; });
      out.property.cadastralData = composeCadastral(merged);
      out.contract.cadastral = out.property.cadastralData;
    }
    return out;
  }

  // ── I NUMERI DEL MODELLO RLI (una aritmetica sola) ───────────────────
  // Tipologia L2 per ENTRAMBI i modelli (canone concordato in comune ad
  // alta tensione); importo da indicare = corrispettivo per l'INTERA durata
  // se < 12 mesi, altrimenti il canone annuo; scadenza registrazione = 30
  // giorni da min(stipula, decorrenza); base imponibile del registro = 70%
  // del canone annuo quando NON c'è la cedolare.
  function rliFacts(contract) {
    const c = obj(contract);
    const rent = Number(pick(obj(c.canone).monthly, c.rent)) || 0;
    const months = leaseMonths(c);
    const annual = Math.round(rent * 12 * 100) / 100;
    const totalForTerm = Number(obj(c.canone).total) > 0 ? Number(c.canone.total) : Math.round(rent * months * 100) / 100;
    const cedolare = cedolareOn(c);
    const stipula = str(c.fullySignedAt || c.signatureDate || '').slice(0, 10);
    const decorrenza = str(c.startDate || '').slice(0, 10);
    const from = [stipula, decorrenza].filter(Boolean).sort()[0] || '';
    let deadline = '';
    if (from) { const d = new Date(from + 'T00:00'); if (!isNaN(d)) { d.setDate(d.getDate() + 30); deadline = d.toISOString().slice(0, 10); } }
    const base = cedolare ? 0 : Math.round(annual * 0.7 * 100) / 100;
    return {
      tipologia: 'L2', tipologiaLabel: 'L2 — locazione agevolata ad uso abitativo (canone concordato)',
      article: c.type === 'studenti' ? 'art. 5, comma 2, L. 431/98' : 'art. 5, comma 1, L. 431/98',
      accordo: c.type === 'studenti' ? 'Accordo territoriale Roma Capitale 27/07/2023, prot. RA/2023/0044852' : 'Accordo territoriale Roma Capitale 25/07/2023, prot. QC/82672/2023',
      months, rentMonthly: rent, rentAnnual: annual, totalForTerm,
      amountForRli: months && months < 12 ? totalForTerm : annual,
      amountForRliNote: months && months < 12 ? 'corrispettivo per l’intera durata (contratto inferiore a 12 mesi)' : 'canone annuo',
      cedolare, stipula, decorrenza, registrationFrom: from, registrationDeadline: deadline,
      imponibileRegistro: base, impostaRegistro: cedolare ? 0 : Math.max(67, Math.round(base * 0.02 * 100) / 100),
      bollo: cedolare ? 0 : 16,
      nConduttori: 1 + coTenantsOf(c).length, nLocatori: 1,
    };
  }

  // ── LETTURA DI PARTE (per i lettori RLI che guardavano solo il contratto) ─
  // Il contratto con i campi di parte RIEMPITI dalla catena users, così
  // fascicolo, pack, ASPI e foglio vedono un CF presente solo sul profilo.
  function readParty(role, ctx) {
    const P = role === 'landlord' ? 'landlord' : 'tenant';
    const out = {};
    IDENTITY_KEYS.concat(['Email', 'Phone']).forEach(k => { const f = BY_KEY[P + k]; if (f) out[IDENT_MAP[k] || k.toLowerCase()] = valueOf(f, ctx); });
    return out;
  }
  function hydrateParties(contract, tenant, landlord, property) {
    const ctx = { contract, tenant, landlord, property };
    const out = clone(contract);
    ['tenant', 'landlord'].forEach(P => {
      IDENTITY_KEYS.concat(['Email', 'Phone']).forEach(k => {
        const f = BY_KEY[P + k];
        if (!f) return;
        const v = valueOf(f, ctx);
        if (v && !has(out[P + k])) out[P + k] = v;
      });
    });
    if (!has(out.cadastral)) { const blob = read('catFoglio', ctx) ? composeCadastral({ sezione: read('catSezione', ctx), foglio: read('catFoglio', ctx), particella: read('catParticella', ctx), sub: read('catSub', ctx), categoria: read('catCategoria', ctx) }) : pick(obj(property).cadastralData); if (blob) out.cadastral = blob; }
    if (!has(out.energyClass)) { const e = read('propertyEnergy', ctx); if (e) out.energyClass = e; }
    if (!(Number(out.renditaCatastale) > 0)) { const r = read('propertyRendita', ctx); if (r) out.renditaCatastale = Number(r); }
    return out;
  }

  // ── IL MESSAGGIO CHE NOMINA I MANCANTI ───────────────────────────────
  // role, missing = [{key,label,group}] (da missingFor), opts = { lang,
  // name, url, propLabel }. Corto, coi NOMI, poi il link. Un gruppo con
  // tre o più mancanti si nomina UNA volta («i dati anagrafici», «i dati
  // dell'immobile»): un elenco di dodici campi su WhatsApp non è un invito,
  // è un muro. Vuoto → «tutto a posto», mai un elenco vuoto.
  const GROUP_NAMES = {
    identity:  { it: 'i dati anagrafici', en: 'your personal details' },
    soggiorno: { it: 'gli estremi del permesso di soggiorno', en: 'your residence permit details' },
    contact:   { it: 'i contatti', en: 'your contact details' },
    catasto:   { it: 'i dati catastali (foglio, particella, subalterno)', en: 'the cadastral data (foglio, particella, subalterno)' },
    property:  { it: 'i dati dell’immobile (piano, interno, vani…)', en: 'the property details (floor, unit, rooms…)' },
    tabelle:   { it: 'le tabelle millesimali', en: 'the condominium shares' },
    terms:     { it: 'i termini del contratto', en: 'the contract terms' },
    esigenza:  { it: 'il motivo della transitorietà', en: 'the reason for the temporary stay' },
    studenti:  { it: 'i dati del corso di studi', en: 'your course details' },
    uso:       { it: 'chi abiterà la casa', en: 'who will live with you' },
    docs:      { it: 'la copia del documento', en: 'a copy of your ID' },
  };
  const lowerFirst = (s) => (s.length > 1 && /[A-Z]/.test(s[0]) && /[a-zà-ú]/.test(s[1])) ? s[0].toLowerCase() + s.slice(1) : s;
  function missingNames(missing, lang) {
    const byGroup = {};
    (missing || []).forEach(m => {
      const f = (m && m.key && BY_KEY[m.key]) || null;
      const g = (m && m.group) || (f && f.group) || 'other';
      const label = typeof m === 'string' ? m : ((m.label && typeof m.label === 'object') ? (m.label[lang] || m.label.it) : (m.label || (f && f.label && (f.label[lang] || f.label.it)) || m.key));
      (byGroup[g] = byGroup[g] || []).push(label);
    });
    const out = [];
    Object.keys(SECTIONS).concat(Object.keys(byGroup).filter(k => !SECTIONS[k])).forEach(g => {
      const items = byGroup[g];
      if (!items || !items.length) return;
      if (items.length >= 3 && GROUP_NAMES[g]) out.push(GROUP_NAMES[g][lang] || GROUP_NAMES[g].it);
      else items.forEach(x => out.push(lowerFirst(String(x))));
    });
    return out;
  }
  function missingMessage(role, missing, opts) {
    opts = opts || {};
    const who = role === 'landlord' ? 'landlord' : 'tenant';
    const lang = opts.lang || (who === 'landlord' ? 'it' : 'en');
    const first = str(opts.name).split(' ')[0];
    const prop = str(opts.propLabel);
    const names = missingNames(missing, lang);
    const shown = names.slice(0, 6);
    const more = names.length - shown.length;
    const list = shown.join(', ') + (more > 0 ? (lang === 'it' ? ` e altri ${more}` : ` and ${more} more`) : '');
    const url = str(opts.url);
    if (lang === 'it') {
      const hi = first ? `Gentile ${first},` : 'Gentile cliente,';
      if (!names.length) return `${hi}\ni Suoi dati per il contratto${prop ? ' di ' + prop : ''} sono completi — non deve fare altro. Grazie!\n\n— BOOM Roma`;
      return `${hi}\nper preparare il contratto${prop ? ' di ' + prop : ''} ci mancano ancora: ${list}.\nDue minuti qui, dal telefono: ${url}\n\n— BOOM Roma`;
    }
    const hi = first ? `Hi ${first},` : 'Hi,';
    if (!names.length) return `${hi}\nyour details for${prop ? ' ' + prop : ' your contract'} are complete — nothing else to do. Thank you!\n\n— BOOM Roma`;
    return `${hi}\nto prepare your contract${prop ? ' for ' + prop : ''} we still need: ${list}.\nTwo minutes here, from your phone: ${url}\n\n— BOOM Roma`;
  }

  // Etichette IT/EN di una lista di key (per badge e email).
  function labels(keys, lang) {
    lang = lang || 'it';
    return (keys || []).map(k => { const f = BY_KEY[k]; return f ? ((f.label && (f.label[lang] || f.label.it)) || k) : k; });
  }

  const API = {
    FIELDS, BY_KEY, SECTIONS, DOC_TYPES, READS, GROUP_NAMES, PROPERTY_WRITE_KEYS,
    templateOf, fieldsFor, valueOf, needsOf, isRequired, ownerOf, read,
    completeness, printCheck, missingFor, askFor, applyAnswers, missingMessage, missingNames, labels,
    identityComplete, validCF, validCF16, validCFFor, validPIva, ibanOk, parseItNumber, leaseDays, leaseMonths,
    cedolareOn, docTypeCode, docTypeIt, isEU, parseCadastral, composeCadastral,
    cotenantIdentity, cotenantMissing, applyCotenantIdentity, legalChecks, rliFacts, readParty, hydrateParties,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_CONTRACT_FIELDS = API;
})(typeof window !== 'undefined' ? window : this);
