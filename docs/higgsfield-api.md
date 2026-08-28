# Higgsfield Platform API — appunti raccolti (per api/marketing/_higgsfield.js)

Come per `docs/feed-immobiliare.md`: la documentazione ufficiale
(docs.higgsfield.ai) è pubblica ma **il sandbox di build non raggiunge il
dominio** (egress proxy). Qui stanno i fatti raccolti da fonti secondarie e
dagli SDK ufficiali, con i punti ancora da confermare DICHIARATI. Il client
(`api/marketing/_higgsfield.js`) isola tutto in un file: una verifica sui
docs ufficiali da un browser normale e, se un nome di campo differisce, si
tocca un file solo.

## Confermato (fonti multiple concordanti)

- **Base URL**: `https://api.higgsfield.ai` (override: env
  `HIGGSFIELD_API_BASE`).
- **Auth**: header `Authorization: Key <KEY_ID>:<KEY_SECRET>` —
  server-side SOLO, mai Bearer, mai nel browser. Coppia di chiavi dalla
  dashboard higgsfield.ai (sezione API).
- **SDK ufficiali**: `higgsfield-ai/higgsfield-client` (Python, env
  `HF_API_KEY`/`HF_API_SECRET` o `HF_KEY="key:secret"`),
  `higgsfield-ai/higgsfield-js` (Node/TS, `{ apiKey, apiSecret }`).
  Noi NON li installiamo: REST nuda come per Stripe/Firestore (la lezione
  del bundler Vercel — meno dipendenze nelle funzioni, meglio è).
- **Flusso asincrono a job-set**: il submit risponde subito con l'id di un
  job set; si fa polling (o si riceve un webhook) finché ogni job è in
  stato terminale. Stati osservati: `queued`, `in_progress`, `completed`,
  `failed`, `nsfw` (il filtro contenuti conta come esito terminale).
- **Modelli video** (famiglia DoP, image-to-video cinematografico) su fasce
  di costo: lite / standard / turbo. Il modello si sceglie per request.
- **A crediti**: ogni generazione scala credito dal piano API. Da qui i
  tetti del Creativo (per giro + settimanale) contati su Firestore.

## Da confermare sui docs ufficiali (una passata da browser normale)

La forma esatta dei payload — il client la incapsula in `submitBody()` e
`jobSetStatus()`, entrambe esportate e testate, così la correzione è un
edit puntuale:

- [ ] Path submit image-to-video: assunto `POST /v1/image2video`.
- [ ] Shape del body: assunto
      `{ params: { model, prompt, input_images: [{ type: 'image_url',
      image_url }], enhance_prompt, seed }, webhook?: { url, secret } }`.
- [ ] Path polling: assunto `GET /v1/job-sets/<id>`; risposta
      `{ id, jobs: [{ id, status, results: { raw: { url }, min: { url } } }] }`.
- [ ] Nomi esatti dei modelli DoP correnti e costo in crediti per clip.
- [ ] Durata/aspect ratio configurabili per request (per la FASE 1 i
      formati 9:16 / 1:1 / 16:9).
- [ ] Rate limit e scadenza degli URL dei risultati (il Creativo scarica
      subito e ricarica su Storage NOSTRO proprio per non dipendere da
      URL effimeri — qualunque sia la scadenza, siamo coperti).

## Env

```
HIGGSFIELD_API_KEY        # KEY_ID dalla dashboard
HIGGSFIELD_API_SECRET     # KEY_SECRET
HIGGSFIELD_API_BASE       # opzionale, default https://api.higgsfield.ai
HIGGSFIELD_VIDEO_MODEL    # opzionale, default nel client (fascia economica)
```

Senza le prime due il Creativo non è rotto: gira, calcola la worklist e
dice UNA volta su Telegram cosa gli manca (pattern "blocked ≠ guasta").
