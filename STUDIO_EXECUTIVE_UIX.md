# STUDIO UX/UI — le espressioni di BOOM e l'elevazione Executive (2026-08)

Due tentativi sulla pagina `/executive` hanno prodotto due errori speculari, e
questo studio esiste perché non succedano più:
- **v1** riusava il *layout* della landing Réunion → giusto il vestito,
  sbagliato il taglio: "un template".
- **v2** inventava una *marca* (serif Didot, carta bianca, skyline
  illustrata, oro spento `#D4AF37`) → bello, ma non BOOM.

La regola che ne esce: **BOOM Executive si costruisce col vocabolario
ESISTENTE del prodotto, composto a un grado più alto.** "Un aumento di
qualità", non un'altra voce. Qui sotto: l'inventario delle espressioni reali
(coi file sorgente), le due voci tipografiche, le regole dell'elevazione, i
set-piece concessi alla pagina.

---

## 1. L'inventario delle espressioni (dove vive lo stile di BOOM)

### 1.1 Le fondamenta — `css/boom-2026.css` (il sistema condiviso)
Un file governa token e componenti di TUTTE le pagine prodotto/servizio
("Change here → every page follows"). È la definizione operativa di "stile
BOOM":
- **Token**: oro `#FFD700` (luce `#FFE5A0`) — **NON** `#D4AF37`, che è la
  palette del portal admin; void `#060607`, card `#0C0C0E`, surface
  `#111114`, input `#17171B`; linee `rgba(255,255,255,.09/.05)` e
  `rgba(255,215,0,.28)`; testo a 4 gradini; verde live `#3ddc97`; rosso
  `#ff7a6e`; ease firma `cubic-bezier(.16,1,.3,1)`.
- **Componenti**: `.eyebrow` oro tracciato; `.hero` 2 colonne con `h1`
  **weight 100** ed `em` oro flat; `.sub`; `.proof` (pillole con ✓ verdi);
  `.sec-h` col `.num`; `.steps` col punto oro luminoso; `.g-it` (griglia
  valore, hover lift); `.trio` (card **tratteggiate** oro); `.truth` (banda
  onestà con radiale oro e ⚑ **rosse**); `.faq` a card; `.band` finale;
  `.paybtn` — **LA firma**: piastra oro con icona quadrata, titolo+riga
  piccola, importo, **sheen automatica ogni 4.2s**; checkout `.sheet`;
  `.paybar` mobile; `.fam` — la striscia di famiglia prodotti agganciata
  sotto la nav; footer classico con **status dot verde** "Operational";
  reveal `.rv`.

### 1.2 Il layer tech — `index.html` (la home viva)
La home porta un livello ambientale che le pagine prodotto possono montare:
- **noise** film-grain fisso (opacità ~0.012, feTurbulence data-URI);
- **tech-orb ×3** — sfere sfocate 80px in deriva 20s: oro, **violetto
  `#635BFF`** (l'accento Stripe — il tocco fintech), oro chiaro;
- **tech-grid** — griglia oro 1px mascherata con radiale (svanisce ai bordi);
- **radar** — 3 anelli che si espandono su 6s + centro pulsante: il battito
  del sito;
- **hero-frame** — angoli a L oro (solo top-left e bottom-right);
- **mouse-glow** interattivo (desktop), **scroll-progress** oro in cima;
- **hero-stats** — striscia 4 statistiche: valore display oro + label 10px
  maiuscola; **reveal / reveal-stagger** (cascata 50ms).

### 1.3 I device di prodotto — `virtual-viewing.html` e famiglia Services 2.0
Il modo BOOM di *mostrare il software*: la **finestra** (`.dbar` coi tre
puntini e l'URL), lo `stage` scuro, il chip **REC** col punto verde che
lampeggia, gli **hot-spot** oro pulsanti, le `chip` pillole, la barra
`scrub` oro, ken-burns sulle foto. Regola implicita: il prodotto si
dimostra con **frammenti di interfaccia veri**, mai con illustrazione.

### 1.4 Le due voci tipografiche
- **index (istituzionale)**: display MAIUSCOLO, weight 200, tracking
  negativo.
- **pagine prodotto 2026**: sentence-case **weight 100**, `em` oro, corpo
  Helvetica/Inter 300.
`/executive` è una pagina di prodotto flagship → **parla la voce prodotto**.

---

## 2. Le regole dell'elevazione Executive ("aumento di qualità")

1. **L'identità è il lockup** — `BOOM │ EXECUTIVE ROMA` (marchio + filetto
   verticale + desk su due righe) in nav e footer: l'unico elemento di marca
   NUOVO concesso. Tutto il resto è vocabolario esistente.
2. **Più aria, meno parole** — sezioni più distanziate del normale, un
   concetto per schermo; la qualità si sente dal ritmo prima che dal testo.
3. **La densità tech si ALZA** (il "farlo capire in ultra tech"): layer di
   index sempre presente (orbi + griglia + noise + radar sottovoce + angoli
   a L), **linguaggio di stato in monospace** (LIVE, REGISTERED · RLI,
   T-24H), LED verdi/oro con glow: la macchina — slot istantanei, e-sign,
   registrazione, Wallet, ricevute — **si vede**, non si racconta.
4. **I numeri si muovono** — count-up sulle statistiche al reveal,
   `tabular-nums`, sempre spegnibile con `prefers-reduced-motion`.
5. **VIETATO**: serif, superfici carta chiare, ori spenti (`#D4AF37`),
   illustrazione figurativa (skyline, scene), qualunque componente che non
   derivi dai file del §1.
6. **GEO intoccabile** (il canale organico via AI): blocco « in brief »
   citabile, FAQ visibili = FAQPage JSON-LD, `speakable` su `.hero .sub` e
   `.enbref`, llms.txt, sitemap/hreflang. Un redesign non tocca MAI questi
   ganci — sono asseriti da `tests/executive/run.mjs`.

---

## 3. I set-piece concessi alla pagina (i "device" inline, dottrina 2026)

1. **La console di sistema** (hero, colonna destra): finestra `.dbar` +
   stage con le righe di stato della pipeline VERA — slot con conferma
   istantanea, pre-agreement e-signed, LEASE registrato RLI, Wallet pass,
   ricevute mensili — LED e monospace. È il pitch ultra-tech: il prodotto
   che lavora, in diretta.
2. **Il tabellone ARRIVALS** (i sei flussi): board di sistema su card 2026 —
   indici romani, meta mono (permanenza · documento), scanline oro lenta.
3. **Il contratto come oggetto digitale**: card scura con testata mono
   `CONTRATTO · USO TRANSITORIO — ART. 5, L. 431/98`, righe di verifica
   (termine, esigenza=lettera d'incarico, canone in fascia ATTESTATO,
   uscita scritta, RLI), striscia e-sign con hash — mai carta bianca: il
   contratto in BOOM È un oggetto digitale (Magic Sign).
4. **Il fascicolo** (form): dentro `paywrap` bordo oro, refline mono
   `NEW FILE — EXECUTIVE · ROMA`, submit come `.paybtn` ("Open my file",
   riga piccola "same-day reply · no commitment").

Tutto il resto — steps, g-it, trio, truth, faq, band, footer, paybar — è
sistema 2026 liscio.
