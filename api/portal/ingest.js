// api/portal/ingest.js — L'INNESTO: da documento/testo a dati strutturati.
//
// Prende quello che l'operatore ha DAVVERO in mano (il PDF del contratto, la
// foto della carta d'identità, il messaggio WhatsApp del proprietario, due
// righe scritte a mano) e ne ricava una PROPOSTA nello schema esatto del
// portale: proprietario, immobile, inquilino, contratto.
//
// Non scrive NIENTE su Firestore. Restituisce solo la proposta: la creazione
// avviene nel portale, dopo che l'operatore l'ha vista, corretta e confermata.
// Questo è deliberato — un import che scrive da solo è un import che sporca
// l'archivio senza che nessuno se ne accorga.
//
// Auth: Firebase ID token (admin/owner/landlord) come le altre superfici
// chiamate dal browser loggato. La chiave Anthropic resta lato server.

import { requireRole } from '../_auth.js';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TEXT = 60000;      // ~15k token di testo incollato
const MAX_B64 = 8 * 1024 * 1024;

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

// Lo schema che il portale sa salvare. Elencato esplicitamente nel prompt:
// un campo inventato non verrebbe letto da nessuna pagina.
const SCHEMA = `{
  "landlord": { "name": "", "email": "", "phone": "", "codiceFiscale": "", "iban": "",
                "address": "", "birthDate": "AAAA-MM-GG", "birthPlace": "" },
  "tenant":   { "name": "", "email": "", "phone": "", "codiceFiscale": "",
                "address": "", "birthDate": "AAAA-MM-GG", "birthPlace": "", "nationality": "" },
  "property": { "name": "", "address": "", "rent": 0, "sqm": 0, "rooms": 0, "bathrooms": 0,
                "floor": "", "scala": "", "interno": "", "cadastralData": "", "energyClass": "",
                "propertyType": "apartment" },
  "contract": { "type": "transitorio|studenti|ordinaria", "startDate": "AAAA-MM-GG",
                "endDate": "AAAA-MM-GG", "rent": 0, "deposit": 0, "depositMonths": 0,
                "paymentDay": 5, "installmentMonths": 1, "accessoryCharges": 0,
                "cedolareSecca": true, "transitionalReason": "", "notes": "" }
}`;

function buildPrompt(context) {
  const known = context && context.known ? context.known : {};
  const lines = [
    'Sei un assistente di back-office immobiliare a Roma. Dal materiale che segue estrai i dati per il gestionale.',
    '',
    'REGOLE NON NEGOZIABILI:',
    '1. NON INVENTARE MAI. Se un dato non è scritto nel materiale, lascia "" (stringa vuota) o ometti il campo.',
    '   Un campo vuoto è corretto; un campo inventato è un danno (finisce in un contratto registrato).',
    '2. Includi SOLO le sezioni per cui hai trovato dati reali. Se non c\'è un inquilino, ometti "tenant".',
    '3. Date sempre in formato AAAA-MM-GG. Importi come numeri puri in euro (1100, non "€ 1.100,00").',
    '4. Il canone è quello MENSILE. Se il documento dà un totale annuo, dividilo per 12 e segnalalo in "notes".',
    '5. "installmentMonths" è la cadenza di pagamento: 1 mensile, 3 trimestrale, 6 semestrale, 12 annuale.',
    '6. Per i contratti transitori (L.431/98 art.5) riporta la motivazione in "transitionalReason".',
    '',
    'Rispondi SOLO con un oggetto JSON di questa forma (nessun testo prima o dopo):',
    SCHEMA,
    '',
    'Aggiungi anche:',
    '  "confidence": 0-100 (quanto sei sicuro complessivamente),',
    '  "notes": ["osservazione utile all\'operatore", ...]  — in italiano, es. "il deposito non è indicato",',
    '           "la data di fine è dedotta dalla durata di 12 mesi".',
    '',
    'COME SI LEGGE UN CONTRATTO DI LOCAZIONE ITALIANO (il materiale è quasi sempre questo):',
    '- "Locatore" / "parte locatrice" / "concedente" = landlord. "Conduttore" / "parte conduttrice"',
    '  / "locatario" / "inquilino" = tenant. Non confonderli: sono in cima al documento, nell\'ordine',
    '  locatore-poi-conduttore, ma verifica sempre dalle etichette, non dalla posizione.',
    '- Il canone è spesso scritto in lettere E in cifre ("euro millecento/00 (€ 1.100,00)"): usa la cifra.',
    '- "canone annuo" diviso 12 dà il mensile. Se il documento indica il canone annuo, mettilo comunque',
    '  mensile in "rent" e scrivilo nelle note.',
    '- Cadenza: "rate mensili anticipate" = 1, "trimestrali" = 3, "semestrali" = 6, "annuale" = 12.',
    '- "deposito cauzionale pari a n. X mensilità" → depositMonths X, e deposit = X × canone mensile',
    '  se l\'importo non è scritto esplicitamente.',
    '- "entro il giorno X di ogni mese" → paymentDay X.',
    '- Tipo: "transitorio" (L.431/98 art.5 c.1, durata 1-18 mesi) → "transitorio"; "per studenti',
    '  universitari" (art.5 c.2-3) → "studenti"; "4+4" o "3+2" o "a canone concordato/libero" → "ordinaria".',
    '- Per il transitorio la motivazione dell\'esigenza ("esigenza di transitorietà", "per motivi di',
    '  lavoro/studio/salute") va in transitionalReason.',
    '- "cedolare secca" con opzione esercitata → cedolareSecca true; "si applica IRPEF ordinaria" o',
    '  opzione non esercitata → false.',
    '- "oneri accessori" / "spese condominiali" a carico del conduttore → accessoryCharges (mensili).',
    '- Dati catastali ("foglio X, particella Y, subalterno Z", "categoria A/2") → cadastralData',
    '  in una sola stringa. "classe energetica" o "APE classe X" → energyClass.',
    '- L\'indirizzo dell\'immobile è quello dopo "sito in" / "posto in" / "ubicato in", NON la residenza',
    '  delle parti (che sta accanto ai loro nomi, dopo "residente in").',
    '- Se il nome dell\'immobile non è indicato, componilo dall\'indirizzo (es. "Via Cavour 12, int. 5").',
    '- Un documento d\'identità o una carta d\'identità dà solo i dati anagrafici di UNA persona:',
    '  compila solo tenant o landlord, mai il contratto.',
  ];
  // I nomi già in archivio: servono a NON creare doppioni. L'AI non decide
  // l'aggancio (lo fa findMatch lato client, deterministico) ma sapere che
  // "Egidi" esiste già la aiuta a scrivere il nome nella stessa forma.
  if (known.landlords && known.landlords.length) {
    lines.push('', 'Proprietari già presenti in archivio (usa la stessa grafia se è la stessa persona): '
      + known.landlords.slice(0, 60).join(' · '));
  }
  if (known.properties && known.properties.length) {
    lines.push('Immobili già presenti: ' + known.properties.slice(0, 60).join(' · '));
  }
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });
  }

  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '';
  const base64 = typeof body.base64 === 'string' ? body.base64.replace(/^data:[^;]+;base64,/, '') : '';
  const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';

  if (!text.trim() && !base64) {
    return res.status(400).json({ ok: false, error: 'text_or_file_required' });
  }
  if (base64 && base64.length > MAX_B64) {
    return res.status(413).json({ ok: false, error: 'file_too_large' });
  }
  if (base64 && !/^(application\/pdf|image\/(png|jpe?g|webp|heic))$/i.test(mediaType)) {
    return res.status(400).json({ ok: false, error: 'unsupported_media_type' });
  }

  const content = [];
  if (base64) {
    content.push(/pdf/i.test(mediaType)
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType.toLowerCase(), data: base64 } });
  }
  if (text.trim()) {
    content.push({ type: 'text', text: 'MATERIALE DA ELABORARE:\n\n' + text });
  }
  content.push({ type: 'text', text: buildPrompt(body.context) });

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error('[portal/ingest] anthropic', resp.status, t.slice(0, 300));
      return res.status(502).json({ ok: false, error: 'ai_provider_error' });
    }
    const data = await resp.json();
    const raw = (data.content && data.content[0] && data.content[0].text) || '';
    let parsed;
    try {
      parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    } catch (_) {
      console.error('[portal/ingest] risposta non JSON:', raw.slice(0, 200));
      return res.status(502).json({ ok: false, error: 'ai_bad_json' });
    }

    // Whitelist dura: un campo che il portale non salva non esce da qui.
    // (La normalizzazione dei valori la fa dataops-engine lato client, così
    // le stesse regole valgono per l'import manuale.)
    const pick = (obj, keys) => {
      if (!obj || typeof obj !== 'object') return null;
      const out = {};
      let any = false;
      keys.forEach((k) => {
        const v = obj[k];
        if (v === undefined || v === null || v === '') return;
        out[k] = typeof v === 'object' ? '' : v;
        any = true;
      });
      return any ? out : null;
    };

    const proposal = {
      landlord: pick(parsed.landlord, ['name', 'email', 'phone', 'codiceFiscale', 'iban', 'address', 'birthDate', 'birthPlace']),
      tenant: pick(parsed.tenant, ['name', 'email', 'phone', 'codiceFiscale', 'address', 'birthDate', 'birthPlace', 'nationality']),
      property: pick(parsed.property, ['name', 'address', 'rent', 'sqm', 'rooms', 'bathrooms', 'floor', 'scala', 'interno', 'cadastralData', 'energyClass', 'propertyType']),
      contract: pick(parsed.contract, ['type', 'startDate', 'endDate', 'rent', 'deposit', 'depositMonths', 'paymentDay', 'installmentMonths', 'accessoryCharges', 'cedolareSecca', 'transitionalReason', 'notes']),
    };
    Object.keys(proposal).forEach((k) => { if (!proposal[k]) delete proposal[k]; });

    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((n) => typeof n === 'string').slice(0, 12).map((n) => n.slice(0, 300))
      : [];
    const confidence = Number.isFinite(Number(parsed.confidence))
      ? Math.max(0, Math.min(100, Math.round(Number(parsed.confidence)))) : null;

    if (!Object.keys(proposal).length) {
      return res.status(200).json({ ok: true, proposal: {}, notes, confidence,
        empty: true, message: 'Nessun dato riconoscibile nel materiale fornito.' });
    }
    return res.status(200).json({ ok: true, proposal, notes, confidence });
  } catch (e) {
    console.error('[portal/ingest]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
