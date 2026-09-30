# egidimmobiliare.it — PRD del passo 3 (la home)

Stato: 30/09/2026. La home che realizza questo PRD è in `egidi/index.html`
(anteprima), da commentare. Riprende il brief «Il Fascicolo»
del 29/09 e la proposta del passo 2 (artifact «Rifondazione Egidi
Immobiliare»: sitemap, wireframe, token, redirect). Qui non si ripete il
perché, ma ciò che si costruisce, come lo si giudica e cosa resta a te.
Ogni riga «Default» è ciò che faccio se non dici altro.

## 1. Una sola direzione, non tre
Il brief ha già scelto la direzione: carta calda, inchiostro BOOM, oro come
sigillo, un solo movimento. Tre direzioni diverse costerebbero tre home per
buttarne due, e il gusto non si decide su un PRD: si decide guardando una
pagina vera sul telefono. Quindi al passo 3 c'è **una home vera**, e le sole
varianti sono quelle che il brief lascia aperte:

| Variabile | Varianti in anteprima | Come si confronta |
|---|---|---|
| Titolo | 1 «Prima l'ordine. Poi il mercato.» · 2 «Il tuo immobile, in ordine.» · 3 «Prima controlliamo i documenti. Poi parliamo di prezzo.» | `?h=1`, `?h=2`, `?h=3` sull'URL di anteprima; nessuna barra di scelta nella pagina |
| Fascicolo | composto allo scroll (default) · già composto | `?fermo=1`, che è anche ciò che vede chi riduce il movimento |

Al go-live il codice delle varianti sparisce: resta il titolo scelto, e il
test lo pretende.

## 2. Cosa c'è nella home (dall'alto)
A testata · B tesi e fascicolo · C tre porte · D cosa vuol dire «in ordine»
(le 8 voci del check) · E ponte BOOM · F chi c'è dietro · G contatto · H piè
di pagina. Il dettaglio di ciascuna sta nel wireframe del passo 2.

## 3. Decisioni prese (Default)
1. **Font**: stack di sistema Helvetica Neue / Inter / Arial e monospace di
   sistema. Nessun download: il costo va nell'LCP, non nel carattere.
2. **Immagini**: nessuna foto. Fascicolo, planimetria, ritratto e facciata
   sono SVG a filo, nel markup. Zero richieste esterne per disegnare la pagina.
3. **Movimento**: CSS legato allo scroll (`animation-timeline: view()`).
   Dove manca, e con riduzione del movimento, il fascicolo è già composto. Il
   sigillo d'oro compare una volta. Niente librerie.
4. **Sede operativa**: «Via dei Coronari 181/184», come la privacy di BOOM.
   Se è solo 181, cambio le due pagine insieme (il test le tiene allineate).
5. **Telefono dell'ufficio (+39 06 3974 1471)**: finché non lo confermi,
   compare solo in anteprima, marcato [VERIFICARE]. In produzione resta
   WhatsApp.
6. **[DA FORNIRE]**: un attributo solo (`data-da-fornire`). Visibile quando
   l'host non è `www.egidimmobiliare.it`, nascosto in produzione. Il test
   vieta segnaposto nudi fuori da quell'attributo.
7. **Form contatti**: disegnato e validato nel browser, ma in anteprima non
   invia. L'invio arriva al passo 4 con `/api/egidi-lead` e la guardia
   `isEgidi`, che aspettano il tuo ok. Un form che finge di inviare è peggio
   di nessun form.
8. **Analytics**: banner di consenso italiano e gli eventi `whatsapp_click`,
   `form_submit`, `check_complete`, `handoff_boom` già collegati. GA4 parte
   solo quando c'è l'ID della proprietà Egidi e solo dopo il consenso.
9. **Ritratto di Valentino**: nessuno finché non c'è una foto vera. Un
   ritratto disegnato a mano libera in SVG sembra dilettantesco, e un volto
   finto è la cosa che il brief vieta. Al suo posto una facciata romana a
   filo, dichiarata come disegno generico (non è la facciata dello studio).
   La foto vera la ospito qui, mai da un archivio esterno.

## 4. Criteri di accettazione (li misura `tests/egidi`, non l'occhio)
- **5 secondi**: a 390×844, sopra la piega, si leggono titolo, «studio
  immobiliare a Roma» e «la società dietro BOOM».
- Nessuno scroll orizzontale da 320 a 1440 px; nessun errore JS.
- Senza JavaScript la pagina è intera; il movimento è solo CSS e non dipende da JS.
- Con `prefers-reduced-motion` il fascicolo è composto fin dal primo frame.
- Contrasto AA su ogni coppia di colori usata per del testo; nessun testo
  oro su carta.
- Zero richieste di rete esterne per disegnare la pagina.
- Peso della home sotto i 60 KB compressi, niente che blocchi il rendering.
  Lighthouse mobile ≥ 95 si misura sull'URL di anteprima, non in locale.
- Dati legali invariati e uguali a quelli della privacy di BOOM (test già
  presente).
- Nessun numero, recensione, logo o immobile inventato; nessun «consulenza
  fiscale»; Entratel non citato.

## 5. Dove la vedi
Il progetto Vercel di Egidi si collega al repo solo dopo il merge: prima,
ogni ramo senza `egidi/` fallirebbe la build. Per l'anteprima del passo 3
propongo un deploy dei soli file di `egidi/` in un progetto
`egidi-immobiliare` **senza Git**: un URL `*.vercel.app` protetto dal login
Vercel, che poi diventa il progetto vero. Non tocca DNS, main né boomrome.com.

## 6. Cosa resta a te
| Domanda | Serve per | Default se taci |
|---|---|---|
| Quale titolo, dopo averli visti | passo 3 | nessuno: scegli tu |
| Coronari 181 o 181/184 | passo 3 | 181/184 |
| Il numero dell'ufficio è attivo? | passo 3 | solo WhatsApp |
| Foto vere di te e dello studio | passo 4 | disegni a filo |
| Provvigione di vendita | /vendere | pagina senza cifra, «su richiesta» |
| ID GA4 della proprietà Egidi | go-live | analytics spenti |
| Screenshot DNS e «I miei prodotti» di GoDaddy | passo 5 | nessun cambio DNS |

Invariato dal brief: nessun commit su main e nessun cambio DNS senza la tua
conferma esplicita.
