// api/sign/_finalize.js
// Runs once a standard contract is FULLY signed (called server-side by
// api/magic-sign/submit on completion). It:
//   1. generates the full post-signature obligations (fiscal + procedural —
//      see POST_SIGNATURE_OBLIGATIONS.md);
//   2. builds a tamper-evident FES signing certificate PDF (signatures + audit)
//      server-side and stores it on the contract;
//   3. issues the tenant magic link server-side (single-use, 72h);
//   4. sends branded tenant + landlord welcome emails (with the certificate).
// Idempotent via contract.finalizedAt.
//
// Note: the RLI registration deadline + monthly payments are created by
// api/magic-sign/submit; finalize adds everything else.

import crypto from 'node:crypto';
// pdf-lib is imported statically: a lazy `await import('pdf-lib')` is not
// traced by Vercel's bundler and fails at runtime in production.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fsCreate, fsPatch, fsGet, getAdminToken } from '../homie/_lib.js';
import { sendWelcomeEmails, sendCafDossier } from './_notify.js';
import { buildFascicolo } from '../fiscal/fascicolo.js';
import { buildRegistrationPack } from './_pack.js';
// pdf-lib is imported lazily inside buildCertificate so a load failure only
// skips the certificate — obligations, magic link and welcome emails still run.

const BASE = 'https://www.boomrome.com';
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const MS_CONSENT = 'I confirm my identity and accept all lease terms. This digital signature is legally valid (FES — Art. 21 CAD).';

const EU_KEYS = ['ital','franc','german','tedesc','spagn','spain','portog','portug','paesi bassi','oland','netherl','dutch','belg','austri','irland','ireland','grec','greece','hellen','svez','swed','danim','denmark','danish','finland','finlandi','poland','polon','polish','cech','czech','slovacch','slovak','sloven','ungher','hungar','magyar','romen','romania','romanian','bulgar','croat','eston','letton','latvia','lituan','lithuan','lussemburg','luxembourg','malt','cipr','cypr','norv','norway','island','iceland','liechtenstein','svizz','switzerl','swiss','europe'];
function isEU(nat){
  if(!nat) return false;
  const n = String(nat).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  if(!n) return false;
  return EU_KEYS.some(k => n.indexOf(k) !== -1);
}
const ymd = (d) => new Date(d).toISOString().split('T')[0];
const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return ymd(d); };
const money = (v) => (v == null || v === '') ? '' : '€' + Number(v).toLocaleString('it-IT');
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

export async function finalizeContract(contract){
  if(!contract || !contract.id) return { ok:false, error:'no_contract' };
  if(contract.finalizedAt) return { ok:true, skipped:true };

  const now = new Date();
  // fullySignedAt lo scrive submit alla firma che completa; i contratti
  // arrivati qui per altre strade (legacy firmati nel portal, refinalize
  // del watchdog) non ce l'hanno — e senza, tre documenti stampavano una
  // data vuota ("Firmato da tutte le parti il", "Stato: COMPLETO —",
  // "Stipulato: da firmare" su un contratto firmato). Si deriva dall'ULTIMA
  // firma apposta: la data di perfezionamento del contratto.
  if (!contract.fullySignedAt) {
    const stamps = [contract.tenantSignedAt, contract.landlordSignedAt,
      ...(Array.isArray(contract.coTenants) ? contract.coTenants.map(x => x && x.signedAt) : [])]
      .map(t => Date.parse(t || '')).filter(n => !isNaN(n));
    if (stamps.length) contract.fullySignedAt = new Date(Math.max(...stamps)).toISOString();
  }
  const signDate = contract.fullySignedAt ? new Date(contract.fullySignedAt) : now;
  const start = contract.startDate ? new Date(contract.startDate) : signDate;

  const property = contract.propertyId ? await fsGet(`properties/${contract.propertyId}`).catch(()=>null) : null;
  const tenant   = contract.tenantId ? await fsGet(`users/${contract.tenantId}`).catch(()=>null) : null;
  const ownerId  = property && property.ownerId;
  const landlord = ownerId ? await fsGet(`users/${ownerId}`).catch(()=>null) : null;

  // cedolareSecca sui contratti reali è la STRINGA 'si'/'no' (portal e
  // convert), non un boolean: il vecchio `=== true` mandava OGNI contratto
  // cedolare nel ramo registro+bollo (obbligazioni sbagliate a scadenzario).
  const cedolare = !(contract.cedolareSecca === false || contract.cedolareSecca === 'no');
  const nationality = contract.tenantNationality || (tenant && tenant.nationality) || '';
  const nonEU = !isEU(nationality);
  const propLabel = (property && (property.address || property.name)) || '';
  const linked = { linkedContractId: contract.id, linkedPropertyId: contract.propertyId || '' };

  // ── Obligations (RLI + payments are created by submit) ──
  const ob = [];
  const add = (title, opts) => ob.push(Object.assign({
    title, type: opts.type || 'obligation', date: opts.date,
    priority: opts.priority || 'medium', category: opts.category || 'fiscal',
    owner: opts.owner || 'admin', legalRef: opts.legalRef || '', notes: opts.notes || '',
    status: 'pending', autoGenerated: true, source: 'finalize', createdAt: now,
  }, linked));

  if (cedolare) {
    add('Cedolare: raccomandata/PEC al conduttore (rinuncia adeguamento ISTAT)', { type:'fiscal', date: addDays(signDate, 20), owner:'landlord', priority:'high', legalRef:'D.Lgs 23/2011 art.3', notes:'Obbligatoria per l’opzione cedolare secca.' });
  } else {
    add('Scelta regime fiscale: Cedolare secca vs Registro + Bollo', { type:'fiscal', date: addDays(signDate, 18), owner:'landlord', priority:'high', legalRef:'D.Lgs 23/2011 art.3' });
    add('Imposta di registro 2% del canone annuo (min €67) – F24 ELIDE', { type:'fiscal', date: addDays(signDate, 30), owner:'landlord', priority:'high', legalRef:'DPR 131/1986', notes:'Ripartibile 50/50 tra le parti.' });
    add('Imposta di bollo €16 (ogni 4 facciate/100 righe, per copia)', { type:'fiscal', date: addDays(signDate, 30), owner:'landlord', priority:'medium', legalRef:'DPR 642/1972' });
  }
  if (nonEU) {
    add('Comunicazione cessione di fabbricato alla Questura/P.S.', { type:'fiscal', date: addDays(start, 2), owner:'landlord', priority:'high', legalRef:'art.7 D.L. 59/1978', notes:'Dovuta entro 48h se il conduttore è extra‑UE — verificare la nazionalità.' });
  }
  add('Denuncia TARI (occupazione) al Comune', { type:'fiscal', date: addDays(start, 30), owner:'tenant', priority:'medium', notes:'Termine secondo regolamento comunale.' });
  add('Voltura / attivazione utenze (luce, gas, acqua)', { type:'procedural', date: addDays(start, 7), owner:'tenant', priority:'medium', category:'procedural' });
  add('Cambio residenza/domicilio – Anagrafe (se applicabile)', { type:'procedural', date: addDays(start, 20), owner:'tenant', priority:'low', category:'procedural', legalRef:'DPR 223/1989' });
  add('Dichiarazione redditi: canone da dichiarare (CU/Redditi PF)', { type:'fiscal', date: ymd(new Date(now.getFullYear()+1, 5, 30)), owner:'landlord', priority:'low' });
  // Signing can happen after the lease start date — don't create the key
  // handover / inventory items already overdue, give them until tomorrow.
  const atLeastTomorrow = (d) => (d < ymd(now) ? addDays(now, 1) : d);
  add('Consegna chiavi + verbale di consegna e lettura contatori', { type:'procedural', date: atLeastTomorrow(ymd(start)), owner:'admin', priority:'high', category:'procedural' });
  add(`Verifica APE allegato + deposito cauzionale incassato${contract.deposit?(' ('+money(contract.deposit)+')'):''}`, { type:'procedural', date: addDays(signDate, 3), owner:'admin', priority:'high', category:'procedural' });
  add('Inventario / stato dei luoghi firmato', { type:'procedural', date: atLeastTomorrow(ymd(start)), owner:'admin', priority:'medium', category:'procedural' });

  // Write obligations in parallel (the admin token is already warm) to keep
  // the signer's wait short.
  const obResults = await Promise.allSettled(ob.map(o => fsCreate('deadlines', o)));
  let created = obResults.filter(r => r.status === 'fulfilled').length;
  obResults.forEach(r => { if (r.status === 'rejected') console.warn('[finalize] obligation failed:', r.reason && r.reason.message); });

  // ── FES signing certificate PDF (server-side, tamper-evident) ──
  // Contracts created by the portal wizard carry no tenantName/landlordName
  // fields — fall back to the user docs so the certificate never prints
  // "Firmatario: -" on a legal document.
  let certUrl = '';
  try {
    const bytes = await buildCertificate({
      ...contract,
      tenantName: contract.tenantName || (tenant && tenant.name) || '',
      landlordName: contract.landlordName || (landlord && landlord.name) || '',
    }, property);
    certUrl = await uploadPdf(`contracts/${contract.id}/signing-certificate.pdf`, Buffer.from(bytes));
  } catch(e){ console.warn('[finalize] certificate failed:', e.message); }

  // ── Contratto firmato (PDF originale + pagina delle firme) ──
  // È QUESTO il documento che viaggia in ALLEGATO alle parti: il PDF del
  // contratto con in coda la pagina firme (immagini, nomi, data/ora, hash,
  // rinvio al certificato). Senza generatedPDF si salta — ma NON più in
  // silenzio: finché il PDF nasce solo nel browser (audit 2026-08, il
  // single point of failure noto), l'operatore DEVE sapere che questo
  // contratto è arrivato a firma completa senza il documento, così lo
  // rigenera e preme 🔄 Rifinalizza. La notifica va su agentNotifications
  // → Telegram entro un minuto (notify-pending), dedupe per contratto.
  if (!contract.generatedPDF && !contract.contractPdfUrl) {
    try {
      await fsCreate('agentNotifications', {
        type: 'contract.no_pdf', status: 'pending', priority: 'high',
        title: '⚠️ Firma completa SENZA contratto PDF',
        body: `Il contratto ${contract.tenantName || contract.id} è firmato da tutti ma non ha il PDF sorgente: le email sono partite col solo certificato. Apri il portal → Rigenera PDF → 🔄 Rifinalizza.`,
        contractId: contract.id, createdAt: new Date().toISOString(),
      }, `nopdf_${contract.id}`); // id deterministico = dedupe gratis (409 al retry)
    } catch (e) { console.warn('[finalize] no-pdf alert:', e.message); }
  }
  let signedPdfUrl = '';
  let timestampUrl = '';
  try {
    const bytes = await buildSignedContract({
      ...contract,
      tenantName: contract.tenantName || (tenant && tenant.name) || '',
      landlordName: contract.landlordName || (landlord && landlord.name) || '',
    }, property);
    if (bytes) {
      const pdfBuf = Buffer.from(bytes);
      signedPdfUrl = await uploadPdf(`contracts/${contract.id}/contratto-firmato.pdf`, pdfBuf);

      // ── Marca temporale RFC3161 sull'hash del contratto firmato ──
      // Una TSA terza attesta che QUESTI byte esistevano a QUESTA data:
      // evidenza di data certa che rafforza la FES a costo zero. La
      // TimeStampReq DER è a lunghezza fissa (SHA-256 + certReq=TRUE).
      // Fail-open totale: una TSA irraggiungibile non tocca mai la firma.
      try {
        const pdfSha = crypto.createHash('sha256').update(pdfBuf).digest();
        const tsq = Buffer.concat([
          Buffer.from('30390201013031300d060960864801650304020105000420', 'hex'),
          pdfSha,
          Buffer.from('0101ff', 'hex'),
        ]);
        const r = await Promise.race([
          fetch('https://freetsa.org/tsr', { method: 'POST', headers: { 'Content-Type': 'application/timestamp-query' }, body: tsq }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('tsa_timeout')), 8000)),
        ]);
        if (r && r.ok) {
          const tsr = Buffer.from(await r.arrayBuffer());
          if (tsr.length > 100) {
            timestampUrl = await uploadPdf(`contracts/${contract.id}/timestamp.tsr`, tsr, 'application/timestamp-reply');
          }
        }
      } catch (e) { console.warn('[finalize] rfc3161:', e.message); }
    }
  } catch(e){ console.warn('[finalize] signed pdf failed:', e.message); }

  // ── Server-issued tenant magic link (single-use, 72h) ──
  let magicId = '';
  try {
    const exp = new Date(now.getTime() + 72*60*60*1000);
    const ml = await fsCreate('magicLinks', {
      contractId: contract.id, tenantId: contract.tenantId || '',
      tenantEmail: (tenant && tenant.email) || contract.tenantEmail || '',
      used: false, expiresAt: exp, issuedBy: 'finalize', createdAt: now,
    });
    magicId = ml.id;
  } catch(e){ console.warn('[finalize] magicLink failed:', e.message); }
  const portalLink = magicId ? `${BASE}/portal.html?postSign=1&magicToken=${magicId}` : `${BASE}/portal.html`;

  // ── Fascicolo Fiscale (scheda canone + dati RLI + scadenzario) ──
  // Dopo le obbligazioni (così lo scadenzario del PDF le vede) e prima
  // delle email (così il CAF riceve il link). Best-effort: se zona o mq
  // mancano, il PDF nasce comunque con le pagine RLI+scadenze e la scheda
  // canone dice esattamente cosa impostare dalla console.
  let fascicoloUrl = '';
  try {
    const fasc = await buildFascicolo(contract.id, { contract, property });
    if (fasc && fasc.ok) fascicoloUrl = fasc.url;
  } catch (e) { console.warn('[finalize] fascicolo:', e.message); }

  // ── Pack Registrazione (ZIP: tutto il necessario per RLI + ARPE) ──
  // Contratto firmato, certificato, fascicolo, visura/planimetria/APE/
  // delega dal dossier immobile, documenti identità, attestazione
  // esigenza + INDICE con checklist. Budget rigido dentro _pack.js: non
  // allunga mai la firma; rigenerabile con 📦 Pack / POST api/fiscal/pack.
  let pack = { url: '', missing: [] };
  try {
    const p = await buildRegistrationPack({
      ...contract,
      tenantName: contract.tenantName || (tenant && tenant.name) || '',
      landlordName: contract.landlordName || (landlord && landlord.name) || '',
    }, property, { signedPdfUrl, certUrl, fascicoloUrl });
    if (p && p.ok) pack = p;
  } catch (e) { console.warn('[finalize] pack:', e.message); }

  // ── Welcome emails + fascicolo CAF (design system condiviso) ──
  // api/sign/_notify.js — tenant EN, landlord IT, CAF → valentino@boom-rome.com.
  // Parallel and internally time-boxed: a stalled SMTP can never push the
  // signer's request past the function limit. The CAF dossier used to live
  // in portal-app.js (EmailJS) and only fired from the legacy in-portal
  // signing path — on /sign it never went out at all.
  // IL SEMAFORO SI ALZA PRIMA DELLE EMAIL. La guardia di idempotenza è
  // contract.finalizedAt, ma finora veniva scritto DOPO l'invio, in un
  // try/catch best-effort: se quel PATCH falliva (rete, quota), il run
  // successivo del watchdog rispediva welcome + fascicolo CAF a tutti.
  // Meglio rischiare un contratto senza email (recuperabile a mano) che un
  // cliente che riceve due volte il suo benvenuto e il CAF due fascicoli.
  try { await fsPatch(`contracts/${contract.id}`, { finalizedAt: now }); }
  catch (e) { console.warn('[finalize] early mark failed:', e.message); }

  const [welcome, caf] = await Promise.all([
    sendWelcomeEmails(contract, property, { portalLink, certUrl, cedolare, nonEU, signedPdfUrl }),
    sendCafDossier(contract, property, { certUrl, fascicoloUrl, signedPdfUrl, packUrl: pack.url, packMissing: pack.missing }),
  ]);
  const tenantEmail = !!(welcome && welcome.tenant);
  const landlordEmail = !!(welcome && welcome.landlord);

  try { await fsPatch(`contracts/${contract.id}`, { finalizedAt: now, magicLinkId: magicId, signingCertificateUrl: certUrl, ...(signedPdfUrl ? { signedPdfUrl } : {}), ...(timestampUrl ? { timestampTsrUrl: timestampUrl } : {}) }); } catch(e){ console.warn('[finalize] mark failed:', e.message); }

  return { ok:true, obligations: created, certificate: !!certUrl, signedPdf: !!signedPdfUrl, timestamp: !!timestampUrl, pack: !!pack.url, packMissing: pack.missing, magicLink: !!magicId, tenantEmail, landlordEmail, caf: !!(caf && caf.ok) };
}

// ── Firebase Storage upload (admin token) ──
async function uploadPdf(path, bytes, contentType = 'application/pdf'){
  const token = await getAdminToken();
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;
  const r = await fetch(url, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':contentType }, body: bytes });
  if (!r.ok) throw new Error('storage_' + r.status + ': ' + (await r.text()).slice(0,200));
  const meta = await r.json().catch(()=>({}));
  const dt = (meta.downloadTokens || '').split(',')[0];
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media${dt ? ('&token=' + dt) : ''}`;
}

// ── Contratto firmato: il PDF del contratto + la pagina delle firme ──
// Scarica generatedPDF (creato dal portal alla creazione del contratto),
// gli APPENDE una pagina A4 con le firme grafiche di entrambe le parti,
// data/ora, hash e rinvio al certificato FES, e restituisce i byte del
// documento unico. Ritorna null se il contratto non ha un PDF sorgente
// (legacy): il chiamante allega allora solo il certificato.
async function buildSignedContract(c, property){
  const src = c.generatedPDF || c.contractPdfUrl || '';
  if (!src) return null;
  const r = await Promise.race([
    fetch(src),
    new Promise((_, rej) => setTimeout(() => rej(new Error('pdf_fetch_timeout')), 10000)),
  ]);
  if (!r || !r.ok) throw new Error('pdf_fetch_' + (r ? r.status : 'ko'));
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw new Error('pdf_empty');

  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });

  // ── LE FIRME SUL CONTRATTO, dove il documento le aspetta ──
  // Il generatore del portal registra le ancore delle righe-firma
  // (sigAnchors: rapporti sulla pagina, indipendenti dall'unità jsPDF).
  // Qui le firme grafiche si stampano ESATTAMENTE lì: la copia via email
  // esce come un originale firmato, e la pagina firme in coda resta come
  // addendum probatorio. PDF legacy senza ancore: solo l'addendum.
  const anchorBlocks = (c.sigAnchors && Array.isArray(c.sigAnchors.blocks)) ? c.sigAnchors.blocks : [];
  if (anchorBlocks.length) {
    const embFor = {};
    const embedSig = async (key, sig) => {
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(String(sig || ''));
      if (!m) return;
      try {
        const b = Buffer.from(m[2], 'base64');
        embFor[key] = m[1].toLowerCase().startsWith('jp') ? await pdf.embedJpg(b) : await pdf.embedPng(b);
      } catch (e) { console.warn('[finalize] sig embed', key, e.message); }
    };
    await embedSig('tenant', c.tenantSignature);
    await embedSig('landlord', c.landlordSignature);
    const coT = Array.isArray(c.coTenants) ? c.coTenants : [];
    for (let i = 0; i < coT.length; i++) if (coT[i] && coT[i].signature) await embedSig('cotenant:' + i, coT[i].signature);
    const pages = pdf.getPages();
    for (const a of anchorBlocks) {
      const im = a.role === 'cotenant' ? embFor['cotenant:' + (Number(a.coIndex) || 0)] : embFor[a.role];
      const pg = pages[(Number(a.page) || 1) - 1];
      if (!im || !pg) continue;
      const { width: W, height: H } = pg.getSize();
      const boxW = Math.max(20, (a.wr || 0) * W), boxH = Math.max(10, (a.hr || 0) * H);
      // yr è misurato dal bordo ALTO (convenzione jsPDF); pdf-lib dal basso.
      const x = (a.xr || 0) * W, yTop = (a.yr || 0) * H;
      const ar = im.width / im.height;
      let fw = boxW, fh = fw / ar;
      if (fh > boxH) { fh = boxH; fw = fh * ar; }
      try { pg.drawImage(im, { x, y: H - yTop - boxH + (boxH - fh) / 2, width: fw, height: fh }); } catch (e) {}
    }
  }

  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.05,0.05,0.06), gold = rgb(0.72,0.55,0.05), grey = rgb(0.42,0.42,0.45);
  const T = (t,x,y,sz,f,col)=>page.drawText(String(t==null?'':t),{x,y,size:sz,font:f||font,color:col||dark});

  page.drawRectangle({ x:0, y:792, width:595, height:50, color:dark });
  T('BOOM', 40, 810, 18, bold, rgb(1,1,1));
  T('ROMA', 96, 812, 10, font, rgb(0.91,0.78,0.41));
  T('Signature page', 360, 818, 9, font, rgb(0.8,0.8,0.8));
  T('Pagina delle firme', 360, 805, 9, font, rgb(0.8,0.8,0.8));

  let y = 758;
  T('PAGINA DELLE FIRME — SIGNATURE PAGE', 40, y, 13, bold, gold);
  page.drawLine({ start:{x:40,y:y-8}, end:{x:555,y:y-8}, thickness:1, color:gold });
  y -= 26;
  T('Parte integrante del contratto che precede / An integral part of the preceding contract.', 40, y, 9, font, grey);
  y -= 24;
  const row = (label, val) => { T(label, 40, y, 9, bold, grey); T(val, 180, y, 10, font, dark); y -= 18; };
  row('Contratto', c.id || '');
  row('Immobile', (property && (property.address || property.name)) || '');
  // Solo caratteri WinAnsi (la lezione del certificato: la freccia U+2192
  // non è codificabile con gli StandardFonts e fa fallire l'intero PDF).
  row('Periodo', (c.startDate ? new Date(c.startDate).toLocaleDateString('it-IT') : '-') + '   -   ' + (c.endDate ? new Date(c.endDate).toLocaleDateString('it-IT') : '-'));
  row('Firmato da tutte le parti il', c.fullySignedAt ? new Date(c.fullySignedAt).toLocaleString('it-IT') : '-');
  y -= 10;

  const block = async (title, name, cf, sig, at, x) => {
    let yy = y;
    T(title, x, yy, 10, bold, gold); yy -= 16;
    T('Firmatario: ' + (name || '-'), x, yy, 9); yy -= 13;
    T('Codice Fiscale: ' + (cf || '-'), x, yy, 9); yy -= 13;
    T('Data/ora: ' + (at ? new Date(at).toLocaleString('it-IT') : '-'), x, yy, 9); yy -= 14;
    page.drawRectangle({ x, y: yy-58, width:230, height:56, borderColor:grey, borderWidth:0.5, color:rgb(0.99,0.99,0.98) });
    if (sig) {
      try {
        const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(sig);
        if (m) { const b = Buffer.from(m[2], 'base64'); const im = m[1].toLowerCase().startsWith('jp') ? await pdf.embedJpg(b) : await pdf.embedPng(b);
          const ar = im.width / im.height; let w = 200, h = w / ar; if (h > 46) { h = 46; w = h * ar; }
          page.drawImage(im, { x: x + (230 - w)/2, y: yy - 56 + (52 - h)/2, width: w, height: h }); }
      } catch(e){}
    }
  };
  await block('IL CONDUTTORE (Tenant)', c.tenantName, c.tenantCF, c.tenantSignature, c.tenantSignedAt, 40);
  await block('IL LOCATORE (Landlord)', c.landlordName, c.landlordCF, c.landlordSignature, c.landlordSignedAt, 320);

  // CO-FIRMA: blocchi firma anche per i co-conduttori (fino a 2 in pagina).
  const coSigList = (Array.isArray(c.coTenants) ? c.coTenants : []).filter(x => x && x.name);
  if (coSigList.length) {
    y -= 150;
    const shown = coSigList.slice(0, 2);
    for (let i = 0; i < shown.length; i++) {
      const cv = shown[i];
      await block(`IL CO-CONDUTTORE ${i + 1} (Co-tenant)`, cv.name, cv.cf, cv.signature, cv.signedAt, i % 2 === 0 ? 40 : 320);
    }
    if (coSigList.length > 2) T('+ ' + (coSigList.length - 2) + ' ulteriori co-conduttori — firme registrate a sistema.', 40, Math.max(160, y - 150), 8, font, grey);
  }

  const docHash = sha256([c.id, c.rent, c.startDate, c.endDate, c.tenantSignedAt, c.landlordSignedAt, c.tenantConsentHash, c.landlordConsentHash, ...coSigList.map(x => (x.signedAt || '') + (x.consentHash || ''))].join('|'));
  page.drawLine({ start:{x:40,y:150}, end:{x:555,y:150}, thickness:0.5, color:grey });
  T('Document hash (SHA-256): ' + docHash, 40, 136, 7, font, grey);
  T('Firma Elettronica Semplice ai sensi dell’art. 21 D.Lgs 82/2005 (CAD). Il certificato di firma con audit', 40, 122, 8, font, grey);
  T('completo (IP, consenso, hash) accompagna questo documento / The full signing certificate travels with this document.', 40, 110, 8, font, grey);
  T('BOOM Rome · boomrome.com · Generato il ' + new Date().toLocaleString('it-IT'), 40, 82, 7, font, grey);
  T('BOOM® è un marchio dell\'Unione europea registrato (MUE 019317594) di Egidi Immobiliare S.r.l.', 40, 68, 7, font, grey);
  T('Egidi Immobiliare S.r.l. - Via dei Coronari 181/184, 00186 Roma - Sede legale: Viale Liegi 42, 00198 Roma - P.IVA 17322991005', 40, 56, 7, font, grey);
  return await pdf.save();
}

// ── FES signing certificate (one A4 page, signatures + audit trail) ──
async function buildCertificate(c, property){
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.05,0.05,0.06), gold = rgb(0.72,0.55,0.05), grey = rgb(0.42,0.42,0.45);
  const T = (t,x,y,sz,f,col)=>page.drawText(String(t==null?'':t),{x,y,size:sz,font:f||font,color:col||dark});

  page.drawRectangle({ x:0, y:792, width:595, height:50, color:dark });
  T('BOOM', 40, 810, 18, bold, rgb(1,1,1));
  T('ROMA', 96, 812, 10, font, rgb(0.91,0.78,0.41));
  T('Electronic Signature Certificate', 360, 818, 9, font, rgb(0.8,0.8,0.8));
  T('Attestazione di Firma Elettronica', 360, 805, 9, font, rgb(0.8,0.8,0.8));

  let y = 758;
  T('ATTESTAZIONE DI FIRMA — FES (Art. 21 CAD)', 40, y, 13, bold, gold);
  page.drawLine({ start:{x:40,y:y-8}, end:{x:555,y:y-8}, thickness:1, color:gold });
  y -= 30;
  const row = (label, val) => { T(label, 40, y, 9, bold, grey); T(val, 180, y, 10, font, dark); y -= 18; };
  row('Contratto', c.id || '');
  row('Immobile', (property && (property.address || property.name)) || '');
  row('Tipo', c.type === 'studenti' ? 'Per studenti' : 'Transitorio');
  row('Canone / Deposito', (money(c.rent) || '-') + '   /   ' + (money(c.deposit) || '-'));
  // Solo caratteri WinAnsi: la freccia "→" (U+2192) non è codificabile con
  // gli StandardFonts di pdf-lib e faceva fallire l'INTERO certificato.
  row('Periodo', (c.startDate ? new Date(c.startDate).toLocaleDateString('it-IT') : '-') + '   -   ' + (c.endDate ? new Date(c.endDate).toLocaleDateString('it-IT') : '-'));
  row('Stato', c.fullySignedAt ? 'COMPLETO — firmato da tutte le parti il ' + new Date(c.fullySignedAt).toLocaleString('it-IT') : 'COMPLETO');
  y -= 8;

  const block = async (title, name, cf, sig, at, ip, hash, x) => {
    let yy = y;
    T(title, x, yy, 10, bold, gold); yy -= 16;
    T('Firmatario: ' + (name || '-'), x, yy, 9); yy -= 13;
    T('Codice Fiscale: ' + (cf || '-'), x, yy, 9); yy -= 13;
    T('Data/ora: ' + (at ? new Date(at).toLocaleString('it-IT') : '-'), x, yy, 9); yy -= 13;
    T('IP: ' + (ip || '-'), x, yy, 9); yy -= 14;
    page.drawRectangle({ x, y: yy-58, width:230, height:56, borderColor:grey, borderWidth:0.5, color:rgb(0.99,0.99,0.98) });
    if (sig) {
      try {
        const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(sig);
        if (m) { const b = Buffer.from(m[2], 'base64'); const im = m[1].toLowerCase().startsWith('jp') ? await pdf.embedJpg(b) : await pdf.embedPng(b);
          const ar = im.width / im.height; let w = 200, h = w / ar; if (h > 46) { h = 46; w = h * ar; }
          page.drawImage(im, { x: x + (230 - w)/2, y: yy - 56 + (52 - h)/2, width: w, height: h }); }
      } catch(e){}
    }
    yy -= 70;
    T('Consent hash: ' + String(hash || '').slice(0, 40), x, yy, 7, font, grey);
  };
  await block('CONDUTTORE (Tenant)', c.tenantName, c.tenantCF, c.tenantSignature, c.tenantSignedAt, c.tenantSignedIP, c.tenantConsentHash, 40);
  await block('LOCATORE (Landlord)', c.landlordName, c.landlordCF, c.landlordSignature, c.landlordSignedAt, c.landlordSignedIP, c.landlordConsentHash, 320);

  // CO-FIRMA: i co-conduttori hanno il LORO blocco (firma, CF, data/ora,
  // IP, hash del consenso) — fino a 2 in pagina; oltre, la riga li conta
  // e le firme restano comunque registrate a sistema.
  const coList = (Array.isArray(c.coTenants) ? c.coTenants : []).filter(x => x && x.name);
  if (coList.length) {
    y -= 170;
    const coShown = coList.slice(0, 2);
    for (let i = 0; i < coShown.length; i++) {
      const cv = coShown[i];
      await block(`CO-CONDUTTORE ${i + 1} (Co-tenant)`, cv.name, cv.cf, cv.signature, cv.signedAt, cv.signedIP, cv.consentHash, i % 2 === 0 ? 40 : 320);
    }
    if (coList.length > 2) T('+ ' + (coList.length - 2) + ' ulteriori co-conduttori — firme registrate a sistema.', 40, Math.max(150, y - 170), 8, font, grey);
  }

  const docHash = sha256([c.id, c.rent, c.startDate, c.endDate, c.tenantSignedAt, c.landlordSignedAt, c.tenantConsentHash, c.landlordConsentHash, ...coList.map(x => (x.signedAt || '') + (x.consentHash || ''))].join('|'));
  page.drawLine({ start:{x:40,y:132}, end:{x:555,y:132}, thickness:0.5, color:grey });
  T('Document hash (SHA-256): ' + docHash, 40, 118, 7, font, grey);
  T('Consenso accettato: ' + MS_CONSENT, 40, 104, 7, font, grey);
  T('Firma Elettronica Semplice ai sensi dell’art. 21 D.Lgs 82/2005 (CAD) — BOOM Rome · boomrome.com', 40, 66, 8, font, grey);
  T('Generato il ' + new Date().toLocaleString('it-IT'), 40, 52, 7, font, grey);
  T('BOOM® è un marchio dell\'Unione europea registrato (MUE 019317594) di Egidi Immobiliare S.r.l.', 40, 38, 7, font, grey);
  T('Egidi Immobiliare S.r.l. - Via dei Coronari 181/184, 00186 Roma - Sede legale: Viale Liegi 42, 00198 Roma - P.IVA 17322991005', 40, 28, 7, font, grey);
  return await pdf.save();
}
