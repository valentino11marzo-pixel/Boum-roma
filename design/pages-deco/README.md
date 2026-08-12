# BOOM · pages-deco — Property Finding, Apartments e il Kiosk in preview

Tre anteprime che estendono il linguaggio di `design/home-live-deco/` (token
del sito live: Inter + Helvetica Neue, oro #FFD700 su #030303) ad altre
superfici. Niente è servito: `property-finding.html` e `apartments.html`
live sono intatti.

## Build (dalla cartella design/home-live-deco, che ha css e dati condivisi)

    cp design/pages-deco/* design/home-live-deco/ && cd design/home-live-deco
    python3 costruisci-pf.py artefatto     # → boom-pf.html
    python3 costruisci-ap.py artefatto     # → boom-ap.html
    python3 costruisci-kiosk.py            # → boom-kiosk.html

(modo `sito`: foto da Storage e Inter da Google Fonts.)

## Cosa sono

- **boom-pf.html** — property-finding.html rieseguita: copy live verbatim
  (l'esperto personale, off-market, €350 dedotti, honest timeline), con due
  sole aggiunte: l'apparecchio del finder che recita brief → scansione →
  risultati curati, e la sezione "The engine behind your expert" con i numeri
  di produzione (pesi 50/30/20, soglia 60, cron, regole oneste incluse la
  finestra +20%).
- **boom-ap.html** — la testata nuova per apartments.html: il muro Solari
  (libere adesso, una zona per riga) sopra una barra filtri funzionante
  (budget, camere, video, zone) sulla griglia del catalogo, e il salva-ricerca
  spiegato com'è davvero (controllo 3×/giorno, digest max 6, unsubscribe a un
  click — /api/search/save esiste già). È un'anteprima della testata/atrio,
  non un rifacimento dell'app live (date, mappa 3D, confronto restano loro).
- **boom-kiosk.html** — il tabellone da vetrina: schermo intero, tutto il
  catalogo a rotazione (6 righe per pagina, cambio ogni 14s con giro delle
  ante), orologio di Roma, fremiti casuali. Pensato per uno schermo in
  Via dei Coronari; 20 KB, nessuna dipendenza.

## Contenuti pronti per te (nella scratchpad della sessione)

- `pigneto-palace-cover.jpg` — la cover HEIC convertita (1500×2000, 295 KB),
  da ricaricare dal portale su Pigneto Palace Double Bed.
- `video-mancanti.md` — le 16 case attive senza `videoUrl`, ordinate per zona.
