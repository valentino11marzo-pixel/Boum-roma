# STUDIO — Il Reparto Marketing (Higgsfield × Claude × l'ecosistema BOOM)

**Data**: 2026-08-28 · **Stato**: FASE 0 in build (questo branch)
**Mandato del fondatore**: *"integrare Higgsfield con Claude e tutto
l'ecosistema per creare un vero reparto Marketing che lavori anche in
autonomia"*.

---

## 1. Il punto di partenza: BOOM ha una macchina, non ha una voce

L'ecosistema oggi copre l'intero ciclo: la vetrina si cura da sola (il
Fotografo riscrive copertine e gallerie di notte, il Copywriter riempie le
schede mute), la Pagella vota ogni annuncio il lunedì, i lead entrano da
sette porte (portali, WhatsApp, telefono, moduli web, Stripe recovery,
referral, réunion/executive) e vengono lavorati da Brain → Centralino →
Commerciale. Ma **la domanda la generiamo quasi solo di rimbalzo**: portali
(a pagamento, per giunta con l'attivazione del feed ferma al Support) e SEO
organico. Non esiste chi PRODUCE materiale di marketing — video, creatività
social, campagne — né chi lo distribuisce e ne misura il ritorno.

Il buco è già misurato dalla macchina stessa:

- **La Pagella dà al video 3 punti su 10** — il singolo fattore più pesante
  della qualità di un annuncio — e ogni lunedì elenca gli annunci senza
  video. Nessuno ha il tempo di girarli: il buco resta aperto da mesi.
- Il **Media Studio** sa già pubblicare un reel (`videoUrl`, Storage
  `listings/enhanced/<id>/video/`, apartment-detail lo rende col suo
  `<video>`), generare copy AI e Media Kit — ma è uno strumento MANUALE:
  ottimo per la cura fine, inservibile come reparto.
- Il **Pubblicista** propaga già foto/video/descrizione ai portali quando
  cambiano (`coreContent` → hash → coda): ogni miglioria alla vetrina si
  distribuisce da sola. Il canale c'è; manca chi lo alimenta.

## 2. Perché Higgsfield

[Higgsfield](https://higgsfield.ai) è la suite AI-native per creatività
video (image-to-video cinematografico, ad generation, formati social) con
una **API di piattaforma** pensata esattamente per questo uso: si manda una
foto + un prompt di regia, si riceve un video. I fatti verificati (fonti in
`docs/higgsfield-api.md`, coi punti ancora da confermare dichiarati):

- Base `https://api.higgsfield.ai`, auth server-side
  `Authorization: Key <KEY_ID>:<KEY_SECRET>` — mai nel browser.
- Flusso **asincrono a job-set**: submit → `job_set_id` → poll (o webhook)
  → risultato con URL del video. Stati: queued / in_progress / completed /
  failed / nsfw.
- SDK ufficiali Python e Node (`higgsfield-ai/higgsfield-client`,
  `higgsfield-ai/higgsfield-js`); noi usiamo la REST nuda (zero dipendenze,
  come per Stripe/Firestore — la lezione del bundler Vercel).
- A crediti: ogni generazione costa. **Quindi tetti di spesa per
  costruzione**, non per buona volontà (pattern del Lead Brain: cap
  contato su Firestore, non in memoria).

La divisione dei mestieri: **Claude pensa** (brief, copy, decisioni — è già
in casa: caption, describe, brief PFS), **Higgsfield renderizza** (pixel e
movimento), **i binari BOOM approvano, pubblicano e misurano** (Telegram,
action_queue-pattern, Pubblicista, teamHealth). Nessun canale nuovo di
approvazione: la lezione de La Squadra.

## 3. Il principio che regge tutto: genera da solo, pubblica MAI da solo

Un reparto marketing che sbaglia in autonomia costa reputazione, non solo
crediti. La riga che non si attraversa in nessuna fase:

> **La vetrina e i canali pubblici si toccano solo con un tap
> dell'operatore.** Il Creativo genera, parcheggia e propone; `videoUrl`
> lo scrive l'operatore (il comando `/video <id> <url>` del bot esiste già
> — riusiamo QUEL binario, zero superfici nuove). Un post social parte
> solo col pattern del Contatto: un messaggio, un tap.

E la seconda, gemella della regola del Copywriter: **mai un fatto
inventato**. Il prompt visivo si costruisce solo dai dati veri
dell'annuncio, e **il prezzo non entra MAI nei pixel** — un prezzo cotto
dentro un video invecchia alla prima trattativa e resta in giro per
sempre.

## 4. Le fasi

### FASE 0 — Il Creativo (questo branch)
Il quarto membro della Vetrina, primo del reparto **Marketing**
nell'organigramma. Chiude il buco che la Pagella misura da mesi:

- `js/marketing-engine.js` (puro, UMD `BOOM_MARKETING`, testato senza
  rete): chi ha bisogno di un reel (disponibile, senza video, con una
  galleria vera — ≥3 foto NOSTRE), in che ordine (gallerie ricche prima,
  la lezione `sweepOrder`), con quali tetti (per giro e per settimana ISO,
  le submission contano anche se falliscono: la spesa c'è stata), e ogni
  esclusione DICE perché (un'esclusione silenziosa è indistinguibile da
  un bug).
- `api/marketing/_higgsfield.js`: il client isolato in un file solo —
  base URL, auth, submit image2video, lettura job-set normalizzata. Se
  l'API cambia un nome di campo, si tocca UN file.
- `api/marketing/creativo.js` (cron ogni 30'): completa i job in volo
  (scarica l'MP4 → Storage `listings/enhanced/<id>/video/` — il path del
  Media Studio, rules già deployate, sweep-safe) e sottomette i nuovi
  entro i tetti. Reel pronto → card Telegram con anteprima e il comando
  di pubblicazione. Higgsfield non configurato → lo dice UNA volta
  (pattern blocked del radar), mai un errore ripetuto.
- Manopole in Direzione (`settings/squadra.creativo`): reel per giro,
  tetto settimanale. Kill switch `settings/marketing {enabled:false}`.
- Salute: `teamHealth/creativo`, allerta Telegram dopo 3 run falliti,
  card in `/team` e nell'organigramma via registro (una copia sola).

**Effetto composto già cablato**: reel pubblicato → +3 in pagella →
`videoUrl` entra in `coreContent` del Pubblicista → l'update ai portali si
mette in coda da solo. Il primo giro del volano non richiede NIENTE di
nuovo.

### FASE 1 — La produzione completa
- Reel multi-scena (le prime 3-5 foto della galleria curata → clip
  concatenate; Higgsfield o ffmpeg-side sul Mac).
- Formati per canale: 9:16 (Reels/TikTok), 1:1, 16:9 — il Media Studio ha
  già la grammatica dei formati; il Creativo la eredita.
- Caption nella lingua giusta via `/api/media/caption` (già in
  produzione), Media Kit ZIP automatico per ogni annuncio nuovo.
- Anteprima nel portal (sezione Marketing) accanto a Telegram.

### FASE 2 — La distribuzione
- Account social business (IG/TikTok) col **braccio sul Mac** (profilo
  persistente Playwright, ritmo umano, captcha = STOP e rapporto blocked
  — il mandato del Pubblicista, porta B). Ogni post approvato UNO PER UNO
  (pattern del Contatto: il tap è la firma).
- Calendario editoriale derivato dal catalogo (annuncio nuovo → reel →
  post; annuncio in `ahead` → post "si libera il …" — la corsia del
  pre-blocco è già il gancio narrativo perfetto).
- Il blog e `welcome-to-rome` (l'asset virale) entrano nel calendario.

### FASE 3 — La misura (il reparto diventa vero)
- **UTM alla porta**: ogni link pubblicato porta `utm_source`; i moduli
  pubblici (`apply-lead`, `canone-lead`, …) già scrivono `source` sul
  lead — si estende con la campagna, e il funnel lead→visita→firma per
  canale esce GRATIS dai dati esistenti (la disciplina della Miniera:
  misurare prima di scegliere).
- Report settimanale del reparto (pattern Pagella: il lunedì, silenzioso
  se non c'è niente da dire): reel prodotti, pubblicati, lead per fonte,
  costo credito / lead.
- Solo QUI si decide se aumentare l'autonomia (es. pubblicazione
  automatica dei reel sugli annunci nuovi): con la scala della fiducia
  dei numeri, mai per entusiasmo.

## 5. Le righe rosse (valgono in ogni fase)

1. **Mai pubblicare da solo.** Né `videoUrl`, né un post, né una story.
2. **Mai un fatto inventato**, mai il prezzo dentro i pixel.
3. **Mai spesa senza tetto contato su Firestore** (un cap in memoria non
   sopravvive ai redeploy).
4. **Mai aggirare un blocco** (captcha/ban social = STOP e rapporto).
5. **Mai una superficie di approvazione nuova**: Telegram + i binari che
   l'operatore già usa.
6. **Mai foto non nostre** in una creatività (le foto dei portali altrui
   non sono materiale di marketing BOOM).

## 6. Attivazione (cosa serve dall'operatore)

1. Account su higgsfield.ai → sezione API → coppia di chiavi.
2. Env su Vercel: `HIGGSFIELD_API_KEY`, `HIGGSFIELD_API_SECRET`
   (opzionale `HIGGSFIELD_API_BASE` se mai servisse).
3. Crediti sul piano API (il Creativo parte con tetto 5 reel/settimana:
   spesa piccola e visibile prima di alzare).
4. Una passata di verifica sui campi esatti dell'API (il sandbox di build
   non raggiunge docs.higgsfield.ai — stessa storia del feed Immobiliare):
   la checklist è in `docs/higgsfield-api.md`.

Senza le chiavi il reparto non è rotto: il Creativo gira, dice UNA volta
cosa gli manca, e la worklist resta visibile in `/team`.

## 7. La misura del successo

- Pagella: catalogo a 10/10 sulla voce video senza che l'operatore giri
  un solo clip.
- Tempo operatore per reel: **un tap** (la pubblicazione), zero per la
  produzione.
- FASE 3: % lead con `utm_source` marketing, costo per lead per canale —
  i numeri che decidono la FASE successiva, mai il contrario.
