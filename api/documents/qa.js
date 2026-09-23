// api/documents/qa.js
// AI Q&A across the document archive. The admin asks a
// natural-language question; the server gathers the relevant documents'
// metadata + ocrText (already extracted by /api/documents/ocr at upload
// time), packages them with the question, sends to Claude, returns the
// answer + cited document ids. Keeps the Anthropic key server-side.
//
// SOLO ADMIN (22/09/2026). Il ramo landlord raccoglieva TUTTI i documenti
// dei suoi immobili — anagrafiche, documenti d'identità, ricevute degli
// inquilini — e ne passava il testo OCR al modello, che poi lo riassumeva al
// proprietario: una fuga di dati dell'inquilino con in mezzo un modello.
// Il proprietario vede i documenti del suo archivio dalla proiezione pulita
// di /api/owner/archivio, dove la tabella di visibilità decide cosa è suo.
//
// Method:   POST
// URL:      /api/documents/qa
// Headers:  Authorization: Bearer <firebase-id-token>
// Body:     { question, propertyId?, fiscalYear?, maxDocs? }
// Response: { ok, answer, citedDocIds, modelUsed, docsConsidered }

import { fsList, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { ai } from '../_ai.js';

// Il modello sta nel registro: js/ai-registry.js, scopo 'docs.qa'.
const MAX_DOCS_DEFAULT = 30;
const MAX_DOCS_HARD = 60;
const PER_DOC_TEXT_CAP = 6000; // chars

function summarizeDoc(d) {
  const text = (d.ocrText || '').slice(0, PER_DOC_TEXT_CAP);
  const ents = d.ocrEntities || {};
  return {
    id: d.id,
    name: d.name || '',
    type: d.type || null,
    category: d.category || null,
    fiscalYear: d.fiscalYear || null,
    propertyId: d.propertyId || null,
    createdAt: d.createdAt || null,
    entities: {
      dates: (ents.dates || []).slice(0, 8),
      amounts: (ents.amounts || []).slice(0, 8),
      fiscalYear: ents.fiscalYear || null,
    },
    text: text,
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });
  }

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const question = String((body && body.question) || '').trim();
  if (question.length < 3) return res.status(400).json({ ok: false, error: 'question_too_short' });
  if (question.length > 600) return res.status(400).json({ ok: false, error: 'question_too_long' });

  const maxDocs = Math.min(MAX_DOCS_HARD, Math.max(1, Number(body.maxDocs) || MAX_DOCS_DEFAULT));

  // Scope: l'admin vede tutto l'archivio (unico ruolo ammesso, vedi testa).
  let docs = [];
  try {
    docs = await fsList('documents', { limit: maxDocs * 2 });
  } catch (err) {
    console.error('[documents/qa] list', err.message);
    return res.status(500).json({ ok: false, error: 'fetch_failed' });
  }

  if (body.propertyId) docs = docs.filter(d => d.propertyId === body.propertyId);
  if (body.fiscalYear) {
    const y = Number(body.fiscalYear);
    docs = docs.filter(d => !d.fiscalYear || Number(d.fiscalYear) === y);
  }
  docs.sort((a, b) => (b.ocrText ? 1 : 0) - (a.ocrText ? 1 : 0));
  docs = docs.slice(0, maxDocs);

  if (!docs.length) {
    return res.status(200).json({
      ok: true, answer: "Non ho documenti su cui rispondere. Carica documenti prima di fare domande.",
      citedDocIds: [], docsConsidered: 0, modelUsed: null,
    });
  }

  const summaries = docs.map(summarizeDoc);
  const system =
    "Sei l'assistente fiscale di BOOM, una società di property management a Roma. " +
    "Rispondi in italiano, in modo conciso e fattuale, basandoti SOLO sui documenti che ti vengono forniti. " +
    "Se la risposta non si può dedurre dai documenti, dillo apertamente. " +
    "Quando citi importi o date, riporta il valore esatto. " +
    "Termina la risposta con una riga 'Documenti rilevanti:' seguita dagli ID dei documenti che hai usato (formato: doc1, doc2).";
  const userMsg =
    "DOMANDA: " + question + "\n\n" +
    "ARCHIVIO (" + summaries.length + " documenti):\n" +
    summaries.map(s => (
      "─── DOC " + s.id + " ───\n" +
      "Nome: " + s.name + "\n" +
      "Tipo: " + (s.type || '?') + " · Categoria: " + (s.category || '?') + " · Anno: " + (s.fiscalYear || '?') + "\n" +
      (s.entities.dates.length ? "Date: " + s.entities.dates.join(', ') + "\n" : "") +
      (s.entities.amounts.length ? "Importi: " + s.entities.amounts.join(', ') + "\n" : "") +
      "Testo:\n" + (s.text || '(nessun OCR)') + "\n"
    )).join('\n');

  try {
    let resp;
    try {
      resp = await ai({ purpose: 'docs.qa', system, messages: [{ role: 'user', content: userMsg }], maxTokens: 1200, timeoutMs: 30000 });
    } catch (e) {
      console.error('[documents/qa] ' + (e.code || e.message));
      return res.status(502).json({ ok: false, error: 'qa_provider_error' });
    }
    const answer = resp.text || '';

    // Extract cited doc ids from the trailing "Documenti rilevanti:" line.
    let citedDocIds = [];
    const cm = /Documenti\s+rilevanti\s*:\s*([^\n]+)/i.exec(answer);
    if (cm) {
      citedDocIds = cm[1].split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
        .filter(id => summaries.some(s => s.id === id));
    }

    await logActivity('document_qa_asked', 'document', {
      question: question.slice(0, 200), docsConsidered: summaries.length, citedCount: citedDocIds.length,
    }, auth.uid);

    return res.status(200).json({
      ok: true, answer, citedDocIds, modelUsed: resp.model, docsConsidered: summaries.length,
    });
  } catch (e) {
    console.error('[documents/qa]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
