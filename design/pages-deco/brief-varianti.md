# BRIEF CONDIVISO — varianti della banchina servizi BOOM

Sei un designer d'élite. Costruisci UNA variante completa della sezione
servizi della home di BOOM Roma (dark, premium, ultra-tech ma caldo).
Il file di uscita è una PAGINA HTML standalone completa e autonoma.

## I VINCOLI NON NEGOZIABILI

### 1. Il design system (copia questi token in :root)
```css
:root {
  --gold:#FFD700; --green:#00FF88; --black:#030303; --void:#060607;
  --surface:#0B0B0C; --card:#0E0E10; --text:#FAFAFA;
  --text-2:rgba(250,250,250,.72); --text-3:rgba(250,250,250,.5);
  --text-4:rgba(250,250,250,.48); --line-0:rgba(255,255,255,.04);
  --line:rgba(255,255,255,.08);
  --ease:cubic-bezier(.16,1,.3,1); --molla:cubic-bezier(.3,1.45,.5,1);
  --sans:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
  --display:'Helvetica Neue',Helvetica,Arial,sans-serif;
  --c-vv:#00FF88; --c-pf:#FFD700; --c-da:#9D8CFF; --c-cc:#3ED3FF;
}
body { background:var(--black); color:var(--text); font-family:var(--sans);
  font-weight:300; -webkit-font-smoothing:antialiased; }
```
Carica Inter da Google Fonts. Titoli display: Helvetica Neue peso 200-350.

### 2. LA FIRMA CROMATICA (fissa, mai altri colori)
- Property Finding = ORO `--c-pf` — l'ammiraglia, sempre la più grande/importante
- Virtual Viewing = VERDE `--c-vv` (è LIVE)
- Deal Assistance = VIOLETTO `--c-da` (protezione)
- Contract Check = CIANO `--c-cc` (il verdetto che legge)
Un solo materiale nero-vetro; il colore è la LUCE di ogni servizio.

### 3. LO STRATO VENDITA (identico, mai toccarlo — è lo studio di conversione)
Ogni servizio DEVE avere sotto/accanto all'oggetto:
- nome prodotto + etichetta kind nel colore (Flagship/Live/Protection/Express)
- promessa (1-2 righe, testo ESATTO sotto)
- BOTTONE pieno nel colore del servizio, verbo+prezzo (testo ESATTO sotto)
- riga garanzia con ✓ nel colore (testo ESATTO sotto)
CSS consigliato per lo strato vendita (riusalo pari pari, classi .vendita
.pnome .promessa .compra .rassicura come nel riferimento):
bottone: border-radius:100px; min-height:44px; background:var(--c);
color:#0A0A05; font-weight:700; box-shadow colorata; hover lift.

### 4. I FATTI (testi ESATTI — mai una promessa nuova, mai numeri inventati)
PF · Property Finding · Flagship · €350
  promessa: "Your private hunter on the whole Rome market — off-market
  included, every shortlist walked in person before you see it."
  bottone: "Start the hunt · €350 →"
  garanzia: "Zero risk: deducted on success, refunded in full if we
  don't deliver."
VV · Virtual Viewing · Live · €89
  promessa: "See any home live on video before you fly — the red flags
  said out loud."
  bottone: "Book a live tour · €89 →"
  garanzia: "Credited if you rent with us · BOOM homes: free, always."
DA · Deal Assistance · Protection · €249
  promessa: "Found a home yourself? We verify the landlord and the
  papers — then negotiate for you."
  bottone: "Protect the deal · €249 →"
  garanzia: "Fixed fee — deposit and clauses negotiated, no percentages."
CC · Contract Check · Express · €49
  promessa: "About to sign? A written traffic-light verdict in 24h:
  fine, unfair, missing."
  bottone: "Check my contract · €49 →"
  garanzia: "Credited in full on Deal Assistance."
Link (usa <a href>): /property-finding.html /virtual-viewing.html
/deal-assistance.html /contract-check-express.html

### 5. REGOLE DI MESTIERE
- Movimento = informazione o gesto di prodotto (mai decorazione random).
  Loop ambientali lenti ok; hover = "prendere in mano" il prodotto.
- `@media (prefers-reduced-motion:reduce)` ferma TUTTO su stati finali
  leggibili.
- Mobile (≤580px): colonna singola, tutto leggibile, bottoni full-width.
  Breakpoint intermedio ~1020px: 2 colonne o riorganizzazione sensata.
- L'ammiraglia (PF, oro) domina SEMPRE la gerarchia.
- Niente librerie esterne, niente immagini esterne: solo CSS/SVG/JS inline.
- Icone SVG stroke 1.5-1.6, linecap round (lente: cerchio+manico; camera:
  rect+triangolo; scudo: path; documento: foglio con piega).
- Qualità Apple-level: ombre morbide profonde, radius 18-24, spaziature
  clamp(), niente affollamento.

## VERIFICA OBBLIGATORIA (fai almeno 2 giri)
Screenshot con Playwright (chromium in /opt/pw-browsers/chromium,
require('/opt/node22/lib/node_modules/playwright')):
- desktop 1440×1000 (aspetta 2500ms per le animazioni a metà racconto)
- mobile 390×900
GUARDA gli screenshot (Read del PNG), correggi sovrapposizioni/vuoti/
squilibri, ripeti. Non consegnare mai senza aver guardato.

## CONSEGNA
Scrivi il file finale in
/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad/variante-<CODICE>.html
e gli screenshot come variante-<CODICE>-desk.png / -mob.png nella stessa
cartella. Rispondi SOLO con lo structured output richiesto.
