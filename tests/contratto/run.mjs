// tests/contratto/run.mjs — IL DIZIONARIO DEL CONTRATTO, blindato.
//
// Copre le regole del capitolo «templates · Scheda che si adatta · le due
// email a Valentino»:
//   1. anti-deriva: OGNI lettura di js/contract-pdf.js è dichiarata nel
//      dizionario (o nell'allowlist motivata qui sotto) e ogni voce
//      dichiarata è letta davvero — un campo nuovo nel modello senza voce
//      fa fallire la CI, una voce morta pure;
//   2. le tre letture che divergevano fra i due modelli (cedolare, tipo di
//      documento, tabelle) sono UNA (mutazione: la vecchia `=== true` non
//      può tornare);
//   3. completezza per modello (B vs C), per owner (anche dinamico:
//      l'esigenza è di chi la dichiara), per natura del locatore (società),
//      per cittadinanza (extra-UE), per co-conduttori (una riga RLI ciascuno)
//      e per durata di legge;
//   4. la Scheda che si adatta: askFor mostra SOLO ciò che manca a QUELLA
//      parte (riempi un campo → sparisce), mai i campi dell'altra;
//   5. applyAnswers: un token scrive solo i campi del suo owner, i valori
//      invalidi non entrano, le mappe annidate non perdono ciò che c'era, il
//      catasto strutturato ricompone il blob, «vivo da solo» non cancella i
//      co-conduttori;
//   6. il messaggio che NOMINA i mancanti (collassa i gruppi, porta il link);
//   7. i numeri del modello RLI (totale per durata < 12 mesi, scadenza da
//      min(stipula, decorrenza), imponibile 70% senza cedolare);
//   8. i lettori che guardavano solo il contratto ora risalgono la catena
//      users (hydrateParties);
//   9. gli handler VERI su Firestore in memoria: lookup/submit per tenant,
//      landlord (che scrive l'immobile) e co-conduttore (che scrive SOLO la
//      sua riga), link.js con messaggi, e il foglio: 401 senza admin, email
//      pulita con l'admin.
// Uso: node tests/contratto/run.mjs
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-contratto';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CAF_EMAIL;
delete process.env.REGISTRATION_EMAIL;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const mails = () => globalThis.__mails || [];

const F = (await import('../../js/contract-fields.js')).default;
const PDF = (await import('../../js/contract-pdf.js')).default;
const SRC = readFileSync(new URL('../../js/contract-pdf.js', import.meta.url), 'utf8');

// ═══ 1. ANTI-DERIVA: il dizionario ⇄ il modello ═══
{
  const reads = (re) => [...new Set([...SRC.matchAll(re)].map(m => m[1]))];
  const cReads = reads(/\bcontract\.([A-Za-z_]+)/g);
  const pReads = reads(/\bproperty\.([A-Za-z_]+)/g);
  const tReads = reads(/\btenant\.([A-Za-z_]+)/g);
  const lReads = reads(/\blandlord\.([A-Za-z_]+)/g);
  // Letture del modello che NON sono dati da raccogliere (motivate):
  const ALLOW = {
    contract: {
      tenantSignature: 'firma grafica — nasce dalla firma, non da una domanda',
      landlordSignature: 'idem',
      coTenants: 'co-conduttori: identità gestita per riga (cotenantMissing), non un campo piatto',
      durationMonths: 'derivato da start/end (legacy)',
      fullySignedAt: 'timestamp della firma completa',
      signatureDate: 'data di firma (default = oggi)',
      installmentAmount: 'derivato: canone × cadenza',
      otherClauses: 'clausole aggiuntive scritte dall\'operatore nel PA (testo libero, mai una domanda al cliente)',
      propertyExtra: 'mappa: sicurezzaImpianti + tabelleMillesimali (le tabelle sono nel dizionario, campo per campo)',
    },
    property: { safetyImplants: 'testo libero legacy della clausola impianti (impiantiClause); il dato raccolto è impiantiStato' },
    tenant: {}, landlord: {},
  };
  const declared = F.READS;
  const missingDecl = [];
  const dead = [];
  for (const [who, list] of [['contract', cReads], ['property', pReads], ['tenant', tReads], ['landlord', lReads]]) {
    list.forEach(k => { if (!declared[who].includes(k) && !ALLOW[who][k]) missingDecl.push(who + '.' + k); });
    // Una voce è "letta" anche dentro un helper (cedolareOn legge c.cedolareSecca,
    // formatCadastral legge p.foglio): basta che il path compaia nel modello.
    declared[who].forEach(k => { if (!list.includes(k) && !new RegExp('\\.' + k + '\\b').test(SRC)) dead.push(who + '.' + k); });
  }
  check('anti-deriva: ogni lettura di contract-pdf.js è dichiarata (o motivata)' + (missingDecl.length ? ' — NON dichiarate: ' + missingDecl.join(', ') : ''), missingDecl.length === 0);
  check('anti-deriva: nessuna voce dichiarata senza lettura nel modello' + (dead.length ? ' — morte: ' + dead.join(', ') : ''), dead.length === 0);
  // Ogni key con need 'contract' deve corrispondere a una lettura VERA del modello.
  const contractKeysNoRead = F.FIELDS.filter(f => {
    const n = ['B', 'C'].some(t => (typeof f.needs === 'function' ? f.needs(t) : f.needs).includes('contract'));
    if (!n) return false;
    const tag = f.key;
    // chiavi che leggono un path del contratto/immobile: basta che il path esista nelle letture
    const paths = [f.write && f.write.path, f.write && f.write.also && f.write.also.path].filter(Boolean).map(p => p.split('.')[0]);
    return !paths.some(p => cReads.includes(p) || pReads.includes(p) || new RegExp('\\.' + p + '\\b').test(SRC)) && !/Upload$/.test(tag);
  }).map(f => f.key);
  check('anti-deriva: ogni need "contract" scrive dove il modello legge' + (contractKeysNoRead.length ? ' — ' + contractKeysNoRead.join(', ') : ''), contractKeysNoRead.length === 0);
}

// ═══ 2. LE LETTURE UNIFICATE (mutazione: il vecchio `=== true` non torna) ═══
{
  check('cedolare: il modello non legge più `cedolareSecca === true`', !/cedolareSecca === true/.test(SRC));
  check('cedolare: B e C passano dalla stessa funzione', (SRC.match(/cedolareOn\(contract\)/g) || []).length >= 2);
  check('cedolare: \'si\' senza canone → sì; \'no\' → no; assente → sì; canone.false → no',
    PDF.cedolareOn({ cedolareSecca: 'si' }) === true && PDF.cedolareOn({ cedolareSecca: 'no' }) === false
    && PDF.cedolareOn({}) === true && PDF.cedolareOn({ canone: { cedolareSecca: false } }) === false
    && F.cedolareOn({ cedolareSecca: 'si' }) === PDF.cedolareOn({ cedolareSecca: 'si' }));
  check('documento: sul contratto va l\'italiano, da codice o da etichetta', PDF.docTypeLabel('passport') === 'passaporto' && PDF.docTypeLabel('Carta d’identità') === 'carta d’identità' && F.docTypeCode('Permesso di soggiorno') === 'permit');
  check('tabelle: la memoria dell\'immobile vale quando il contratto non le porta', JSON.stringify(PDF.tabelleOf({}, { tabelleMillesimali: { acqua: 12 } })) === '{"acqua":12}' && PDF.tabelleOf({ propertyExtra: { tabelleMillesimali: { acqua: 5 } } }, { tabelleMillesimali: { acqua: 12 } }).acqua === 5);
  check('impianti: contract.impiantiStato → property.impiantiStato → default', /non dispongono di certificazione/.test(PDF.impiantiClause({}, { impiantiStato: 'non_certificati' })) && /conformi alla normativa/.test(PDF.impiantiClause({ impiantiStato: 'conformi' }, { impiantiStato: 'non_certificati' })));
  // I due modelli si impaginano ancora (jsPDF reale)
  const jspdfNS = await import('jspdf');
  const jsPDF = jspdfNS.jsPDF || jspdfNS.default || jspdfNS;
  const base = { startDate: '2026-09-01', endDate: '2027-06-30', rent: 900, deposit: 1800, cedolareSecca: 'si', tenantName: 'A', landlordName: 'B', tenantDocType: 'passport', tenantDocNum: '1' };
  const b = PDF.build({ jsPDF, contractId: 'x', contract: { ...base, type: 'transitorio' }, property: { address: 'Via X 1', tabelleMillesimali: { acqua: 12 } }, tenant: null, landlord: null });
  const c = PDF.build({ jsPDF, contractId: 'x', contract: { ...base, type: 'studenti' }, property: { address: 'Via X 1' }, tenant: null, landlord: null });
  check('i due modelli si impaginano (B + C) con le letture unificate', !!b.doc && !!c.doc && b.sigAnchors.length >= 2 && c.sigAnchors.length >= 2);
  check('tabelle: ENTRAMBI i modelli leggono «proprieta» senza accento (la chiave che la Scheda scrive) oltre a «proprietà»', (SRC.match(/tab\['proprieta'\] \|\| tab\['proprietà'\]/g) || []).length === 2);
  check('cedolare assente → NON è un puntino (il PDF stampa il ramo cedolare): niente «mancante» finto per l\'invito di firma', !F.completeness({ contract: { type: 'transitorio' }, property: {} }).dots.some(d => d.key === 'cedolareSecca') && F.read('cedolareSecca', { contract: {} }) === 'si' && F.read('type', { contract: {} }) === 'transitorio');
  check('numeri: «1.250» = 1250 (migliaia), «1.250,30» = 1250.3, «12,5» = 12.5, «12.5» = 12.5', F.parseItNumber('1.250') === 1250 && F.parseItNumber('1.250,30') === 1250.3 && F.parseItNumber('12,5') === 12.5 && F.parseItNumber('12.5') === 12.5);
}

// ═══ 3. COMPLETEZZA ═══
const T_ID = { tenantName: 'Anna Smith', tenantCF: 'RSSMRA85T10A562S', tenantDob: '1998-05-04', tenantPob: 'Boston, USA', tenantAddress: 'Via Roma 1', tenantDocType: 'passport', tenantDocNum: 'USA991', tenantNationality: 'Italian' };
const L_ID = { landlordName: 'Giulia Bianchi', landlordCF: 'BNCGLI70A41H501A', landlordDob: '1970-01-01', landlordPob: 'Roma', landlordAddress: 'Via dei Coronari 8' };
const PROP = { address: 'Via Levico 12', floor: '3', interno: '7', rooms: 3, furnished: true, foglio: '123', particella: '45', sub: '6', categoria: 'A/2', renditaCatastale: 512.3, energyClass: 'E' };
const TERMS = { startDate: '2026-09-01', endDate: '2027-06-30', rent: 900, deposit: 1800, cedolareSecca: 'si' };
const DOCS = { identityDocs: [{ url: 'https://storage.example/t.jpg', role: 'tenant' }, { url: 'https://storage.example/l.jpg', role: 'landlord' }, { url: 'https://storage.example/x.pdf', kind: 'extra' }] };
{
  const B = { contract: { type: 'transitorio', ...TERMS, ...T_ID, ...L_ID, transitionalReason: 'Lavoro', transitionalDocs: 'Lettera', cohabitants: 'nessuno', ...DOCS }, property: PROP, tenant: {}, landlord: {} };
  const cB = F.completeness(B);
  check('B completo → contratto e registrazione pronti', cB.ready.contract && cB.ready.registration && cB.missingKeys.length === 0);
  const C = { ...B, contract: { ...B.contract, type: 'studenti' } };
  const cC = F.completeness(C);
  check('stesso dato su C → mancano rilascio del documento e dati del corso (che C stampa), NON l\'esigenza', cC.ready.contract === false
    && ['tenantDocIssuer', 'tenantDocIssueDate', 'studCorsoStudi', 'studUniversita'].every(k => cC.missingKeys.includes(k)) && !cC.missingKeys.includes('transitionalReason'));
  check('C: indirizzo del conduttore non è un puntino (domiciliato nei locali) e tipo iscrizione non è mai in dots', !cC.dots.some(d => d.key === 'tenantAddress') && !cC.dots.some(d => d.key === 'studTipoIscrizione'));
  const B30 = F.completeness({ ...B, contract: { ...B.contract, endDate: '2026-09-20', transitionalDocs: '' } });
  check('esigenza: documento richiesto SOLO oltre 30 giorni', !B30.missingKeys.includes('transitionalDocs') && F.completeness({ ...B, contract: { ...B.contract, transitionalDocs: '' } }).missingKeys.includes('transitionalDocs'));
  const BL = F.completeness({ ...B, contract: { ...B.contract, esigenzaDi: 'locatore', transitionalReason: '' } });
  check('esigenza del LOCATORE → il motivo manca al locatore, non al conduttore', BL.byOwner.landlord.missing.some(m => m.key === 'transitionalReason') && !BL.byOwner.tenant.missing.some(m => m.key === 'transitionalReason'));
  const G = F.completeness({ ...B, contract: { ...B.contract, landlordKind: 'giuridica', landlordCF: '12345678903', landlordDob: '', landlordPob: '', landlordPIva: '' } });
  check('locatore società: CF a 11 cifre accettato, nascita non richiesta, P.IVA richiesta', !G.missingKeys.includes('landlordCF') && !G.missingKeys.includes('landlordDob') && G.missingKeys.includes('landlordPIva'));
  const NE = F.completeness({ ...B, contract: { ...B.contract, tenantNationality: 'American' } });
  check('conduttore extra-UE → estremi del permesso richiesti (registrazione), non per un italiano', NE.missingKeys.includes('tenantPermessoScadenza') && !cB.missingKeys.includes('tenantPermessoScadenza'));
  const CO = F.completeness({ ...B, contract: { ...B.contract, coTenants: [{ name: 'Bob Lee', cf: '' }] } });
  check('co-conduttore senza CF → registrazione NON pronta (una riga RLI ciascuno), contratto sì', CO.ready.contract === true && CO.ready.registration === false && CO.cotenants[0].missing.some(m => m.key === 'cotenant.cf'));
  const LONG = F.completeness({ ...B, contract: { ...B.contract, endDate: '2028-12-31' } });
  check('durata di legge: transitorio oltre 18 mesi → nota e registrazione non pronta', LONG.legal[0].ok === false && LONG.ready.registration === false);
  check('durata di legge: studenti sotto 6 mesi → nota', F.completeness({ ...C, contract: { ...C.contract, endDate: '2026-12-31' } }).legal[0].ok === false);
  check('catasto: dal blob legacy si leggono foglio/particella/sub (fallback dichiarato)', F.read('catFoglio', { property: { cadastralData: 'Fg. 12, part. 345, sub 7' } }) === '12' && F.read('catSub', { property: { cadastralData: 'Fg. 12, part. 345, sub 7' } }) === '7');
  check('printCheck: i puntini del PDF, opzionali compresi, dichiarati', F.printCheck({ contract: { type: 'transitorio' }, property: {} }).some(d => d.key === 'propertyScala' && d.required === false));
}

// ═══ 4. LA SCHEDA CHE SI ADATTA ═══
{
  const ctx = { contract: { type: 'studenti', ...TERMS, ...T_ID, tenantDocIssuer: 'US', tenantDocIssueDate: '2020-01-01', coTenants: [{ name: 'Bob Lee' }] }, property: PROP, tenant: {}, landlord: {} };
  const a = F.askFor('tenant', ctx);
  const keys = a.sections.flatMap(s => s.fields.map(f => f.key));
  check('tenant su C: chiede corso/università/conviventi/email, MAI immobile o catasto', keys.includes('studCorsoStudi') && keys.includes('cohabitants') && keys.includes('tenantEmail')
    && !keys.some(k => /^property|^cat|^tab|^landlord/.test(k)) && a.identityMissing.length === 0);
  check('people porta i co-conduttori già sul contratto', a.sections.find(s => s.key === 'uso').fields[0].cotenants[0] === 'Bob Lee');
  const a2 = F.askFor('tenant', { ...ctx, contract: { ...ctx.contract, studenti: { corsoStudi: 'Economia', universita: 'LUISS' }, cohabitants: 'nessuno' } });
  const keys2 = a2.sections.flatMap(s => s.fields.map(f => f.key));
  check('mutazione: riempito corso/università/conviventi → non li chiede più (restano solo gli opzionali)', !keys2.includes('studCorsoStudi') && !keys2.includes('cohabitants') && keys2.includes('studAnnoAccademico'));
  const l = F.askFor('landlord', { ...ctx, property: { address: 'Via Levico 12' } });
  const lk = l.sections.flatMap(s => s.fields.map(f => f.key));
  check('landlord: chiede catasto + immobile + tabelle + contatti, MAI i campi del conduttore', lk.includes('catFoglio') && lk.includes('propertyFloor') && lk.includes('tabAcqua') && lk.includes('landlordIban')
    && !lk.some(k => /^tenant|^stud|^cohab/.test(k)) && l.identityMissing.includes('landlordCF') && l.lang === 'it');
  check('required prima degli opzionali dentro la sezione', l.sections.find(s => s.key === 'property').fields[0].required === true);
}

// ═══ 5. APPLY ANSWERS — la lista bianca per owner ═══
{
  const ctx = { contract: { type: 'transitorio', ...TERMS, propertyExtra: { sicurezzaImpianti: 'custom', tabelleMillesimali: { proprieta: 5 } }, coTenants: [{ name: 'Bob Lee' }], cohabitants: 'Bob Lee, nato/a a Roma' }, property: { cadastralData: 'foglio 1, particella 2, sub 3' } };
  const t = F.applyAnswers('tenant', { propertyFloor: '3', catFoglio: '9', landlordCF: 'X', cohabitants: { alone: true }, transitionalReason: 'Lavoro', tenantCF: 'RSSMRA85T10A562X', foo: 1, tenantIdDoc: 'x' }, ctx);
  check('tenant: immobile, catasto e campi del locatore SCARTATI con motivo; cf sbagliato scartato; key ignota; upload-only',
    t.rejected.find(r => r.key === 'propertyFloor').why === 'not_yours' && t.rejected.find(r => r.key === 'catFoglio').why === 'not_yours'
    && t.rejected.find(r => r.key === 'landlordCF').why === 'not_yours' && t.rejected.find(r => r.key === 'tenantCF').why === 'cf_invalid'
    && t.rejected.find(r => r.key === 'foo').why === 'unknown' && t.rejected.find(r => r.key === 'tenantIdDoc').why === 'upload_only'
    && Object.keys(t.property).length === 0);
  check('tenant: «vivo da solo» con co-conduttori → resta la loro riga, non «nessuno»', t.contract.cohabitants === 'Bob Lee, nato/a a Roma' && t.applied.includes('transitionalReason'));
  const t2 = F.applyAnswers('tenant', { cohabitants: { text: 'Carla Verdi; Bob Lee' } }, ctx);
  check('tenant: conviventi dichiarati si accodano ai co-conduttori senza doppioni', t2.contract.cohabitants === 'Bob Lee, nato/a a Roma; Carla Verdi');
  const l = F.applyAnswers('landlord', { catFoglio: '123', catParticella: '45', catSub: '6', tabAcqua: '12,5', propertyRendita: '1.250,30', landlordCF: '12345678903', impiantiStato: 'conformi', propertyFurnished: 'yes', tenantCF: 'RSSMRA85T10A562S', studCorsoStudi: 'x', esigenzaDi: 'locatore' }, ctx);
  check('landlord: catasto strutturato + blob ricomposto (immobile E contratto)', l.property.foglio === '123' && l.property.sub === '6' && l.property.cadastralData === 'foglio 123, particella 45, sub 6' && l.contract.cadastral === l.property.cadastralData);
  check('landlord: tabelle su ENTRAMBI senza perdere sicurezzaImpianti né proprietà', l.contract.propertyExtra.sicurezzaImpianti === 'custom' && l.contract.propertyExtra.tabelleMillesimali.proprieta === 5 && l.contract.propertyExtra.tabelleMillesimali.acqua === 12.5 && l.property.tabelleMillesimali.acqua === 12.5);
  check('landlord: numeri all\'italiana, rendita su immobile e contratto, impianti su entrambi, arredato booleano', l.property.renditaCatastale === 1250.3 && l.contract.renditaCatastale === 1250.3 && l.contract.impiantiStato === 'conformi' && l.property.impiantiStato === 'conformi' && l.property.furnished === true);
  check('landlord: CF a 11 cifre (società) accettato e specchiato sul profilo; campi del conduttore e termini scartati (not_yours)',
    l.contract.landlordCF === '12345678903' && l.user.codiceFiscale === '12345678903'
    && l.rejected.find(r => r.key === 'tenantCF').why === 'not_yours' && l.rejected.find(r => r.key === 'studCorsoStudi').why === 'not_yours' && l.rejected.find(r => r.key === 'esigenzaDi').why === 'not_yours');
  check('tenant su B: un campo studenti è not_on_template (il suo, ma non su questo modello)', F.applyAnswers('tenant', { studCorsoStudi: 'x' }, ctx).rejected[0].why === 'not_on_template');
  check('validazioni: data non ISO, select fuori lista, IBAN e P.IVA sbagliati → scartati', F.applyAnswers('landlord', { landlordDob: '01/01/1970', impiantiStato: 'boh', landlordIban: 'IT00X', landlordPIva: '12345678901' }, ctx).rejected.length === 4);
  // Il link è intercettabile: ciò che decide DOVE arriva la firma o i soldi
  // si riempie solo se vuoto, e non tocca mai il profilo di accesso.
  const fo = F.applyAnswers('tenant', { tenantEmail: 'attacker@evil.example' }, { ...ctx, contract: { ...ctx.contract, tenantEmail: 'anna@expat.com' } });
  check('email: fill-only sul contratto (già presente → already_set) e MAI sul profilo users', fo.rejected[0].why === 'already_set' && Object.keys(F.applyAnswers('tenant', { tenantEmail: 'anna@expat.com' }, ctx).user).length === 0);
  check('email: se manca sul contratto ma c\'è sul profilo, non si chiede e non si riscrive', F.applyAnswers('tenant', { tenantEmail: 'x@y.z' }, { ...ctx, tenant: { email: 'anna@expat.com' } }).rejected[0].why === 'already_set');
  const ib = F.applyAnswers('landlord', { landlordIban: 'IT60X0542811101000000123456' }, { ...ctx, landlord: { iban: 'IT60X0542811101000000123456' } });
  check('IBAN: uguale a quello esistente passa (idempotente); uno DIVERSO su un IBAN esistente è already_set; il primo è marcato sensibile', ib.applied.includes('landlordIban')
    && F.applyAnswers('landlord', { landlordIban: 'IT07X0542811101000000654321' }, { ...ctx, landlord: { iban: 'IT60X0542811101000000123456' } }).rejected[0].why === 'already_set'
    && (F.applyAnswers('landlord', { landlordIban: 'IT60X0542811101000000123456' }, ctx).sensitive || [])[0].key === 'landlordIban');
  check('indirizzo dell\'immobile: fill-only (un locatore non lo riscrive da un link)', F.applyAnswers('landlord', { propertyAddress: 'Via Falsa 999' }, { ...ctx, property: { address: 'Via Levico 12' } }).rejected[0].why === 'already_set');
  check('CF: il conduttore è una persona fisica — un 11 cifre Luhn-valido è cf_invalid; per il locatore è ammesso', F.applyAnswers('tenant', { tenantCF: '12345678903' }, ctx).rejected[0].why === 'cf_invalid' && F.applyAnswers('landlord', { landlordCF: '12345678903' }, ctx).applied.includes('landlordCF') && F.validCFFor('tenant', '12345678903') === false);
}

// ═══ 6. IL MESSAGGIO CHE NOMINA I MANCANTI ═══
{
  const ctx = { contract: { type: 'transitorio', ...TERMS, endDate: '2026-09-20', ...T_ID, tenantNationality: 'American' }, property: {}, tenant: {}, landlord: {} };
  const mT = F.missingMessage('tenant', F.missingFor('tenant', ctx), { name: 'Anna Smith', url: 'https://x/t', propLabel: 'Via Levico 12' });
  check('tenant EN: nomina motivo, permesso, conviventi, documento e porta il link', /^Hi Anna,/.test(mT) && /reason for the temporary stay/.test(mT) && /residence permit/.test(mT) && /people living with you|who will live/.test(mT) && /copy of your ID/.test(mT) && mT.includes('https://x/t'));
  const many = F.missingMessage('tenant', F.missingFor('tenant', { ...ctx, contract: { ...ctx.contract, endDate: '2027-06-30' } }), { name: 'Anna', url: 'u' });
  check('tenant EN: oltre sei voci → «and N more», mai un muro', /and \d+ more/.test(many) && many.split('\n')[1].length < 300);
  const mL = F.missingMessage('landlord', F.missingFor('landlord', ctx), { name: 'Giulia Bianchi', url: 'https://x/l', propLabel: 'Via Levico 12' });
  check('landlord IT: i gruppi con ≥3 mancanti collassano («i dati anagrafici», «i dati catastali», «i dati dell’immobile»)', /^Gentile Giulia,/.test(mL) && /i dati anagrafici/.test(mL) && /dati catastali/.test(mL) && /dati dell’immobile/.test(mL) && mL.includes('https://x/l') && mL.split('\n')[1].length < 260);
  check('niente da chiedere → «tutto a posto», mai un elenco vuoto', /complete — nothing else to do/.test(F.missingMessage('tenant', [], { name: 'Anna' })) && !/we still need/.test(F.missingMessage('tenant', [])));
}

// ═══ 7. I NUMERI DEL MODELLO RLI ═══
{
  const six = F.rliFacts({ startDate: '2026-09-01', endDate: '2027-02-28', rent: 1200, cedolareSecca: 'no', fullySignedAt: '2026-08-20T10:00:00Z' });
  check('RLI: 6 mesi → importo = corrispettivo per la durata (7.200), non canone×12', six.months === 6 && six.amountForRli === 7200 && six.rentAnnual === 14400 && six.tipologia === 'L2');
  check('RLI: scadenza registrazione = 30 gg da min(stipula, decorrenza) → dalla stipula', six.registrationFrom === '2026-08-20' && six.registrationDeadline === '2026-09-19');
  check('RLI: senza cedolare imponibile 70% e registro 2% (min €67), bollo 16', six.imponibileRegistro === 10080 && six.impostaRegistro === 201.6 && six.bollo === 16);
  const y = F.rliFacts({ startDate: '2026-09-01', endDate: '2027-08-31', rent: 1000, canone: { total: 12000 }, cedolareSecca: 'si', fullySignedAt: '2026-09-10T10:00:00Z' });
  check('RLI: 12 mesi → canone annuo; con cedolare imposte 0; decorrenza prima della stipula → dalla decorrenza', y.amountForRli === 12000 && y.impostaRegistro === 0 && y.registrationFrom === '2026-09-01' && y.registrationDeadline === '2026-10-01');
}

// ═══ 8. I LETTORI RISALGONO LA CATENA users ═══
{
  const h = F.hydrateParties({ tenantName: 'A' }, { cf: 'RSSMRA85T10A562S', birthDate: '1985-12-10' }, { codiceFiscale: 'BNCGLI70A41H501A', address: 'Via X' }, { foglio: '1', particella: '2', sub: '3', energyClass: 'E' });
  check('hydrate: CF/nascita del conduttore e CF/residenza del locatore dal profilo; catasto e classe dall\'immobile', h.tenantCF === 'RSSMRA85T10A562S' && h.tenantDob === '1985-12-10' && h.landlordCF === 'BNCGLI70A41H501A' && h.landlordAddress === 'Via X' && h.cadastral === 'foglio 1, particella 2, sub 3' && h.energyClass === 'E');
  check('hydrate: un campo già sul contratto NON viene sovrascritto', F.hydrateParties({ tenantCF: 'AAA' }, { cf: 'BBB' }, {}, {}).tenantCF === 'AAA');
}

// ═══ 9. GLI HANDLER VERI — Firestore in memoria ═══
const store = new Map();
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const toFsFields = (o) => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fromFsFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };
let callerRole = 'admin';
const docTimes = new Map();
let tick = 0;
const bump = (k) => docTimes.set(k, '2026-01-01T00:00:' + String(++tick).padStart(2, '0') + 'Z');
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'caller1', email: 'op@boom.it' }] });
  if (url.startsWith('https://storage.example/')) return new Response(Buffer.from('FILE:' + url.slice(24)), { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  if (url.includes('firebasestorage.googleapis.com')) return okJson({ downloadTokens: 'dltok' });
  if (url.includes('firestore.googleapis.com')) {
    const path = (url.split('/documents')[1] || '').replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (path.startsWith(':runQuery')) return okJson([{}]);
    // :commit con updateMask (merge) e PRECONDIZIONE currentDocument.updateTime
    if (path.startsWith(':commit')) {
      const writes = (JSON.parse(opts.body || '{}') || {}).writes || [];
      for (const w of writes) {
        if (!/^projects\/[^/]+\/databases\/\(default\)\/documents\/.+/.test(String(w.update.name))) {
          return new Response(JSON.stringify({ error: { code: 400, message: `Document name "${w.update.name}" is invalid`, status: 'INVALID_ARGUMENT' } }), { status: 400 });
        }
        const k = (w.update.name.split('/documents/')[1] || '');
        if (w.currentDocument && w.currentDocument.updateTime) {
          const cur = docTimes.get(k) || '2026-01-01T00:00:00Z';
          if (cur !== w.currentDocument.updateTime) return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: 'the stored version does not match' } }), { status: 400 });
        }
        const doc = store.get(k) || {};
        Object.assign(doc, fromFsFields(w.update.fields));
        store.set(k, doc); bump(k);
      }
      return okJson({ writeResults: writes.map(() => ({})) });
    }
    if (opts.method === 'POST') {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = path + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response('conflict', { status: 409 });
      store.set(key, fromFsFields(JSON.parse(opts.body).fields));
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      if (url.includes('currentDocument.exists=false') && store.has(path)) return new Response('exists', { status: 412 });
      const cur = store.get(path) || {};
      Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
      store.set(path, cur); bump(path);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    const doc = store.get(path);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + path, fields: toFsFields(doc), updateTime: docTimes.get(path) || '2026-01-01T00:00:00Z' });
  }
  throw new Error('fetch non stubbata: ' + url);
};
const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
let IP = '7.1.1.1';
const mkReq = (body, headers = {}) => ({ method: 'POST', headers: { 'x-forwarded-for': IP, ...headers }, body, socket: {} });

store.set('users/caller1', { role: 'admin', email: 'op@boom.it' });
store.set('properties/prop1', { ownerId: 'own1', name: 'Levico', address: 'Via Levico 12', cadastralData: 'Fg. 123, part. 45, sub 6' });
store.set('users/t1', { name: 'Anna Smith', email: 'anna@expat.com', cf: 'RSSMRA85T10A562S' });
store.set('users/own1', { name: 'Giulia Bianchi', email: 'giulia@example.com' });
store.set('landlords/own1', { codiceFiscale: 'BNCGLI70A41H501A' });
store.set('contracts/ctrA', { propertyId: 'prop1', tenantId: 't1', type: 'transitorio', ...TERMS, tenantName: 'Anna Smith', landlordName: 'Giulia Bianchi',
  propertyExtra: { sicurezzaImpianti: 'custom' }, coTenants: [{ name: 'Bob Lee', email: 'bob@x.com' }, { name: 'Cleo Ray', signature: 'data:sig', cf: 'RSSMRA85T10A562S' }] });

const { schedaRef } = await import('../../api/profile/_scheda.js');
const lookup = (await import('../../api/profile/lookup.js')).default;
const submit = (await import('../../api/profile/submit.js')).default;
const link = (await import('../../api/profile/link.js')).default;
{
  let r = mkRes();
  await lookup(mkReq({ t: schedaRef('ctrA', 'tenant') }), r);
  const sec = r.body.ask.sections.map(s => s.key);
  check('lookup tenant: template B, ask con esigenza/uso/contatti, mai immobile; CF prefill dal profilo; complete=false', r.code === 200 && r.body.template === 'B'
    && sec.includes('esigenza') && sec.includes('uso') && !sec.includes('property') && !sec.includes('catasto') && r.body.signer.cf === 'RSSMRA85T10A562S' && r.body.complete === false);
  r = mkRes();
  await lookup(mkReq({ t: schedaRef('ctrA', 'landlord') }), r);
  const secL = r.body.ask.sections.map(s => s.key);
  check('lookup landlord: catasto (dal blob: solo rendita/categoria/sezione vuoti) + immobile + tabelle, lingua IT, CF dal doc landlords', r.code === 200 && secL.includes('catasto') && secL.includes('property') && secL.includes('tabelle')
    && !r.body.ask.sections.find(s => s.key === 'catasto').fields.some(f => f.key === 'catFoglio') && r.body.ask.lang === 'it' && r.body.signer.cf === 'BNCGLI70A41H501A');

  // landlord scrive l'immobile + i suoi dati; il tenant NON può
  IP = '7.1.1.2';
  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctrA', 'landlord'), identity: { name: 'Giulia Bianchi', cf: 'BNCGLI70A41H501A', dob: '1970-01-01', pob: 'Roma', address: 'Via dei Coronari 8', docType: 'id', docNum: 'CA1', nationality: 'Italiana' },
    answers: { propertyFloor: '3', propertyInterno: '7', propertyRooms: '3', propertyFurnished: 'yes', propertyEnergy: 'E', propertyRendita: '512,30', catCategoria: 'A/2', tabAcqua: '12,5', landlordIban: 'IT60X0542811101000000123456', tenantCF: 'RSSMRA85T10A562S' } }), r);
  const p1 = store.get('properties/prop1'), c1 = store.get('contracts/ctrA');
  check('submit landlord: 200, immobile scritto (piano, interno, vani, arredato, classe, rendita, categoria) + blob catastale ricomposto', r.code === 200 && p1.floor === '3' && p1.interno === '7' && p1.rooms === 3 && p1.furnished === true && p1.energyClass === 'E' && p1.renditaCatastale === 512.3 && p1.categoria === 'A/2' && /foglio 123, particella 45, sub 6, cat\. A\/2/.test(p1.cadastralData));
  check('submit landlord: contratto con tabelle SENZA perdere sicurezzaImpianti, rendita/classe/cadastral specchiati, IBAN anche su users e landlords',
    c1.propertyExtra.sicurezzaImpianti === 'custom' && c1.propertyExtra.tabelleMillesimali.acqua === 12.5 && c1.renditaCatastale === 512.3 && c1.energyClass === 'E' && c1.cadastral === p1.cadastralData
    && store.get('users/own1').iban === 'IT60X0542811101000000123456' && store.get('landlords/own1').iban === 'IT60X0542811101000000123456');
  check('submit landlord: il CF del conduttore mandato dal locatore è SCARTATO (not_yours) e non scritto', r.body.rejected.some(x => x.key === 'tenantCF' && x.why === 'not_yours') && !c1.tenantCF);

  IP = '7.1.1.3';
  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctrA', 'tenant'), identity: { name: 'Anna Smith', cf: 'RSSMRA85T10A562S', dob: '1998-05-04', pob: 'Boston, USA', address: 'Via Roma 1', docType: 'passport', docNum: 'USA991', nationality: 'American' },
    answers: { propertyFloor: '9', catFoglio: '999', transitionalReason: 'Incarico di lavoro', transitionalDocs: 'Lettera del datore', cohabitants: { alone: true }, tenantEmail: 'anna@expat.com' } }), r);
  const p2 = store.get('properties/prop1'), c2 = store.get('contracts/ctrA');
  check('submit tenant: immobile e catasto INTATTI (scartati con motivo), esigenza scritta, conviventi = co-conduttori (mai «nessuno» con Bob e Cleo)', r.code === 200 && p2.floor === '3' && p2.foglio === undefined
    && r.body.rejected.filter(x => x.why === 'not_yours').length === 2 && c2.transitionalReason === 'Incarico di lavoro' && c2.cohabitants === 'Bob Lee; Cleo Ray');
  check('submit tenant extra-UE: complete per il PDF, ma missing nomina permesso e documento (registrazione)', r.body.complete === true && r.body.missing.some(m => m.key === 'tenantPermessoScadenza') && r.body.missing.some(m => m.key === 'tenantIdDoc'));

  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctrA', 'tenant'), identity: { name: 'Anna Smith', cf: '00000000000', dob: '1998-05-04', pob: 'B', address: 'x', docType: 'passport', docNum: '1', nationality: 'American' } }), r);
  check('submit tenant: CF a 11 cifre → 400 cf_invalid (mai sull\'RLI)', r.code === 400 && r.body.error === 'cf_invalid' && store.get('contracts/ctrA').tenantCF === 'RSSMRA85T10A562S');
  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctrA', 'tenant'), identity: { name: 'Anna Smith', cf: 'RSSMRA85T10A562S', dob: '1998-05-04', pob: 'Boston, USA', address: 'Via Roma 1', docType: 'passport', docNum: 'USA991', nationality: 'American' }, answers: { tenantEmail: 'attacker@evil.example' } }), r);
  check('submit tenant: l\'email di firma NON si dirotta dal link (users.email intatta, contratto already_set)', r.code === 200 && store.get('users/t1').email === 'anna@expat.com' && store.get('contracts/ctrA').tenantEmail === 'anna@expat.com' && r.body.rejected.some(x => x.key === 'tenantEmail' && x.why === 'already_set'));
  check('submit landlord: l\'IBAN impostato dal link ha acceso una notifica ad ALTA priorità col valore', [...store.keys()].some(k => k.startsWith('agentNotifications/') && store.get(k).type === 'scheda.sensitive' && store.get(k).priority === 'high' && /IT60X0542811101000000123456/.test(store.get(k).summary)));

  // co-conduttore: solo la SUA riga
  IP = '7.1.1.4';
  r = mkRes();
  await lookup(mkReq({ t: schedaRef('ctrA', 'cotenant', 0) }), r);
  check('lookup co-conduttore: rende come tenant, prefill dalla sua riga, nessuna sezione extra, missing = CF/nascita/…', r.code === 200 && r.body.role === 'tenant' && r.body.cosign.index === 0 && r.body.signer.name === 'Bob Lee' && r.body.ask.sections.length === 0 && r.body.missing.some(m => m.key === 'cotenant.cf'));
  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctrA', 'cotenant', 0), identity: { name: 'Bob Lee', cf: 'RSSMRA85T10A562S', dob: '1999-01-01', pob: 'Leeds', address: 'x', docType: 'passport', docNum: 'UK1', nationality: 'British' } }), r);
  const c3 = store.get('contracts/ctrA');
  check('submit co-conduttore: scrive SOLO coTenants[0] (merge: l\'email di Bob resta); Cleo (firmata) intatta con la firma; il conduttore principale intatto', r.code === 200 && r.body.complete === true && c3.coTenants[0].cf === 'RSSMRA85T10A562S' && c3.coTenants[0].birthPlace === 'Leeds' && c3.coTenants[0].idDoc === 'UK1' && c3.coTenants[0].email === 'bob@x.com'
    && c3.coTenants[1].signature === 'data:sig' && c3.coTenants[1].cf === 'RSSMRA85T10A562S' && c3.tenantCF === 'RSSMRA85T10A562S' && c3.tenantName === 'Anna Smith');
  // Un terzo co-conduttore: il token con indice 2 scrive la riga 2, non la 0.
  store.set('contracts/ctrA', { ...store.get('contracts/ctrA'), coTenants: store.get('contracts/ctrA').coTenants.concat([{ name: 'Dan Po', email: 'dan@x.com' }]) });
  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctrA', 'cotenant', 2), identity: { name: 'Dan Po', cf: 'RSSMRA85T10A562S', dob: '2000-02-02', pob: 'Oslo', address: 'y', docType: 'id', docNum: 'NO1', nationality: 'Norwegian' } }), r);
  const c4 = store.get('contracts/ctrA');
  check('submit co-conduttore indice 2: scrive la riga 2 (Dan), la 0 (Bob) e la 1 (Cleo) non cambiano', r.code === 200 && c4.coTenants[2].birthPlace === 'Oslo' && c4.coTenants[2].email === 'dan@x.com' && c4.coTenants[0].birthPlace === 'Leeds' && c4.coTenants[1].signature === 'data:sig');
  check('submit co-conduttore: la scrittura passa da :commit con la PRECONDIZIONE updateTime (mai una PATCH cieca dell\'array)', (() => {
    const src = readFileSync(new URL('../../api/profile/submit.js', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf("if (role === 'cotenant') {"), src.indexOf('const miss = FIELDS.cotenantMissing'));
    return /commitWrites\(/.test(block) && /precondition/.test(block) && !/fsPatch\(/.test(block);
  })());
  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctrA', 'cotenant', 1), identity: { name: 'Cleo Ray', cf: 'BNCGLI70A41H501A' } }), r);
  check('co-conduttore già FIRMATO → 410, la sua riga non cambia', r.code === 410 && store.get('contracts/ctrA').coTenants[1].cf === 'RSSMRA85T10A562S');
  r = mkRes();
  await submit(mkReq({ t: schedaRef('ctrA', 'cotenant', 0), identity: { name: 'Bob Lee', cf: '00000000000' } }), r);
  check('co-conduttore: CF a 11 cifre → 400', r.code === 400 && r.body.error === 'cf_invalid');
  check('token co-conduttore fuori indice → 404', await (async () => { const x = mkRes(); await lookup(mkReq({ t: schedaRef('ctrA', 'cotenant', 5) }), x); return x.code === 404; })());
  // Il documento caricato dal co-conduttore è lato conduttori (role tenant)
  // e porta l'indice della sua riga, così la sua Scheda lo conta.
  const upload = (await import('../../api/profile/upload.js')).default;
  IP = '7.1.1.5';
  r = mkRes();
  await upload(mkReq({ t: schedaRef('ctrA', 'cotenant', 0), base64: 'data:image/jpeg;base64,' + Buffer.from('img').toString('base64'), name: 'bob.jpg' }), r);
  const uDoc = (store.get('contracts/ctrA').identityDocs || []).find(d => /bob\.jpg$/.test(d.name));
  check('upload co-conduttore: role tenant + tenantIndex della sua riga', r.code === 200 && !!uDoc && uDoc.role === 'tenant' && uDoc.tenantIndex === 1);
  r = mkRes();
  await lookup(mkReq({ t: schedaRef('ctrA', 'cotenant', 0) }), r);
  check('lookup co-conduttore: conta il SUO documento', r.body.docsCount === 1);

  // link.js: mancanti + messaggi + scheda dei co-conduttori (admin)
  r = mkRes();
  await link(mkReq({ contractId: 'ctrA' }, { authorization: 'Bearer x' }), r);
  check('link: messaggi pronti per parte, nella lingua giusta, col link /scheda dentro', r.code === 200 && /^Hi Anna,/.test(r.body.messages.tenant) && r.body.messages.tenant.includes('/scheda?t=ctrA.t.')
    && /^Gentile Giulia,/.test(r.body.messages.landlord) && Array.isArray(r.body.missing.tenant) && r.body.template === 'B');
  check('link: ogni co-conduttore ha il SUO link /scheda (c<idx>) e il suo messaggio; il firmato è locked', r.body.cosign.length === 3 && r.body.cosign[0].schedaUrl.includes('/scheda?t=ctrA.c0.') && r.body.cosign[0].message.includes('Bob')
    && r.body.cosign[1].schedaLocked === true && r.body.cosign[0].schedaLocked === false);
}

// ═══ 10. IL FOGLIO DI REGISTRAZIONE — endpoint + contenuto ═══
const foglioEndpoint = (await import('../../api/fiscal/foglio.js')).default;
{
  let r = mkRes();
  await foglioEndpoint(mkReq({ contractId: 'ctrA' }), r);
  check('foglio endpoint: senza token → 401, nessuna email', r.code === 401 && mails().filter(m => /^Registrazione contratto/.test(m.subject)).length === 0);
  store.set('contracts/ctrA', { ...store.get('contracts/ctrA'), fullySignedAt: '2026-08-20T10:00:00Z', signedPdfUrl: 'https://storage.example/signed.pdf', signingCertificateUrl: 'https://storage.example/cert.pdf', identityDocs: [{ url: 'https://storage.example/anna.jpg', role: 'tenant' }], transitionalDocs: 'Lettera <b>del</b> datore' });
  r = mkRes();
  await foglioEndpoint(mkReq({ contractId: 'ctrA' }, { authorization: 'Bearer x' }), r);
  const f = mails().find(m => /^Registrazione contratto/.test(m.subject));
  check('foglio endpoint: con l\'admin → email a valentino, oggetto archiviale, stato stampato', r.code === 200 && r.body.ok && !!f && f.to === 'valentino@boom-rome.com'
    && f.subject === 'Registrazione contratto — Via Levico 12 — Anna Smith — 2026-09-01' && !!store.get('contracts/ctrA').registrationSheetSentAt);
  const txt = f.html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  check('foglio: catasto a caselle dal blob + immobile + entrambe le parti + co-conduttori a righe', /Foglio 123/.test(txt) && /Particella 45/.test(txt) && /Subalterno 6/.test(txt) && /Comune \(codice\) Roma \(H501\)/.test(txt)
    && /Conduttore 1 Nome Anna Smith/.test(txt) && /Conduttore 2 Nome Bob Lee/.test(txt) && /Conduttore 3 Nome Cleo Ray/.test(txt) && /BNCGLI70A41H501A/.test(txt));
  check('foglio: RLI L2, importo per la durata (10 mesi → 9.000), scadenza dalla stipula, extra-UE con cessione', /L2 — locazione agevolata/.test(txt) && /Importo da indicare in RLI € 9\.000,00/.test(txt) && /Registrazione entro 19\/09\/2026/.test(txt) && /Cessione di fabbricato SÌ/.test(txt));
  check('foglio: nessun bottone, nessun link al portal, «non dichiarato» dove manca (mai un\'istruzione)', !/class="bp-btn/.test(f.html) && !/boomrome\.com\/portal/.test(f.html) && /non dichiarato/.test(txt) && !/mancano|rigenera|Share Hub/i.test(txt));
  check('foglio: ogni valore è ESCAPATO (un «<b>» scritto dal cliente non diventa markup) e le date sono deterministiche gg/mm/aaaa', f.html.includes('Lettera &lt;b&gt;del&lt;/b&gt; datore') && !/Lettera <b>del<\/b>/.test(f.html) && /01\/09\/2026/.test(txt));
  check('foglio: allegati veri (contratto firmato, certificato, documento)', (f.attachments || []).some(a => a.filename === 'Contratto_firmato.pdf') && (f.attachments || []).some(a => a.filename === 'Certificato_firma_FES.pdf') && (f.attachments || []).some(a => /^Documento_conduttore_1/.test(a.filename)));
  callerRole = 'tenant';
  store.set('users/caller1', { role: 'tenant' });
  r = mkRes();
  await foglioEndpoint(mkReq({ contractId: 'ctrA' }, { authorization: 'Bearer x' }), r);
  check('foglio endpoint: un non-admin → 403', r.code === 403);
  store.set('users/caller1', { role: 'admin' });
}

// ═══ 11. L'EMAIL COMPLETA porta il link /scheda e il messaggio per chi manca ═══
{
  const { sendCafDossier } = await import('../../api/sign/_notify.js');
  // Bob (0) è completo, Cleo (1) ha firmato con dati mancanti, Eve (3) è nuova e vuota.
  const c = { ...store.get('contracts/ctrA'), id: 'ctrA', tenantNationality: 'American', coTenants: store.get('contracts/ctrA').coTenants.concat([{ name: 'Eve Lin' }]) };
  const before = mails().length;
  const out = await sendCafDossier(c, store.get('properties/prop1'), {});
  const m = mails().slice(before).find(x => /Fascicolo completo/.test(x.subject));
  const txt = m.html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  check('fascicolo completo: verdetto in testa + link /scheda del conduttore + messaggio EN già scritto + blocco del co-conduttore VUOTO col SUO link', out.ok && /Registrazione ✗ incompleta|✗ incompleta/.test(txt)
    && m.html.includes('/scheda?t=ctrA.t.') && /Hi Anna,/.test(txt) && m.html.includes('/scheda?t=ctrA.c3.') && /Co-conduttore 4 — manca/.test(txt));
  check('fascicolo completo: il co-conduttore FIRMATO con dati mancanti non riceve un link morto — «già firmato, dal portal»', /Co-conduttore 2 — già firmato/.test(txt) && !m.html.includes('/scheda?t=ctrA.c1.'));
  // Parte già FIRMATA (Scheda congelata → 410): il link si offre SOLO per i
  // documenti; il resto è dichiarato «dal portal», mai un link morto.
  const before2 = mails().length;
  await sendCafDossier({ ...c, tenantSignature: 'data:sig', landlordSignature: 'data:sig', identityDocs: [] }, store.get('properties/prop1'), {});
  const m2 = mails().slice(before2).find(x => /Fascicolo completo/.test(x.subject));
  const t2 = m2.html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  check('fascicolo completo su firmato: i campi congelati vanno «nel portal», il link resta solo per la copia del documento', /già firmato, da correggere nel portal/.test(t2)
    && /Conduttore — manca: [^]*Copia documento conduttore/.test(t2) && !/we still need:[^.]*permit/i.test(t2) && /già firmato[^]*Numero permesso/.test(t2));
  check('fascicolo completo: le stesse righe del foglio (catasto a caselle) + oggetto stabile', /Subalterno 6/.test(txt) && /^📑 Fascicolo completo — Via Levico 12 — Anna Smith — 2026-09-01$/.test(m.subject));
}

console.log('────────────────────────────────────────────────');
console.log(`Il dizionario del contratto: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED: ' + bad.join(' | ')); process.exit(1); }
console.log('Il contratto si compila da solo, e dove non può lo dice.');
