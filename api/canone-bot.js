// api/canone-bot.js — Vercel serverless function per BOOM Scheda Canone (modalità Chat)
// Richiede env var: ANTHROPIC_API_KEY (Settings > Environment Variables su Vercel)
// Modello: Haiku — costo trascurabile, coerente con l'architettura a tre livelli di Homie.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { messages, campiNoti, zone } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages mancanti' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'no-key', detail: 'ANTHROPIC_API_KEY non configurata nelle Environment Variables di Vercel' });

  const system = `Sei l'assistente BOOM per la pre-verifica del canone concordato (Accordo territoriale Roma).
Il tuo UNICO compito è estrarre dai messaggi dell'utente i campi necessari al calcolo e chiedere quelli mancanti, UNO alla volta, in italiano informale e diretto.
NON calcolare mai tu il canone: il calcolo lo fa il motore deterministico del tool. Tu raccogli input.

Campi da riempire (chiave: tipo):
- indirizzo: string
- zona: string — DEVE essere una tra: ${ (zone||[]).join(' | ') || 'nessuna zona configurata' }
- tipo: "stud" | "trans" | "32"
- mq: number (calpestabili)
- mqBal: number (balconi/terrazze/cantine, 0 se assenti)
- mqBox: number (box/posto auto esclusivo, 0 se assente)
- parametri: array di numeri 1-20 tra questi (spuntali se menzionati o deducibili):
  1 Posto auto, 2 Cortile/area verde comune, 3 Cantina, 4 Terrazzo o balcone, 5 Area verde di pertinenza,
  6 Aria condizionata, 7 Ascensore, 8 Bagno con finestra o doppi servizi, 9 Porta blindata, 10 Doppi vetri,
  11 Portierato, 12 Stabile ristrutturato, 13 Allarme, 14 Cucina abitabile con finestra, 15 Videocitofono,
  16 Antenna centralizzata, 17 Riscaldamento autonomo, 18 Stabile max 4 piani, 19 No barriere architettoniche, 20 Terrazzo condominiale
- maggiorazioni: array tra: "arr" (ammobiliato), "sem" (seminterrato), "asc" (senza ascensore), "att" (attico), "clA" (classe A/B/C), "eco", "sis", "clD" (classe D/E/F)
- prop: number (canone proposto €/mese)

Campi già noti (non richiederli): ${JSON.stringify(campiNoti||{})}

Rispondi SOLO con JSON valido, nessun testo fuori dal JSON, formato:
{"campi": { ...solo i campi nuovi o aggiornati... }, "completo": true|false, "domanda": "prossima domanda se completo=false, altrimenti frase di conferma"}
"completo" è true solo quando zona, tipo, mq e prop sono tutti noti.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system,
        messages,
      }),
    });
    const data = await r.json();
    if (!r.ok || data.error) return res.status(502).json({ error: 'anthropic', detail: (data.error && data.error.message) || ('HTTP ' + r.status) });
    const txt = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
    const clean = txt.replace(/```json|```/g,'').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { parsed = { campi:{}, completo:false, domanda:"Non ho capito, puoi ripetere con più dettagli?" }; }
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: 'API error', detail: String(e) });
  }
}
