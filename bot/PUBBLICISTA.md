# Il Pubblicista — il mandato

> Come `HOMIE.md`: questo file è la fonte di verità di cosa il braccio sul
> Mac deve fare per PUBBLICARE il catalogo BOOM sui portali — e di cosa non
> deve fare mai. Il server pensa, il Mac esegue.

## Perché

Il feed 2.0 verso Immobiliare è pronto (`/api/feed/immobiliare.xml`), ma
l'attivazione dipende dal Support tecnico — che non risponde. Idealista apre
il caricamento real-time solo ai software partner (Miogest, Gestim…), senza
specifiche pubbliche. Aspettare una risposta = non pubblicare.

Questo binario è **indipendente dalle loro risposte**: il server calcola
COSA va creato, aggiornato o rimosso (`/api/publisher/queue`) e consegna il
payload completo già normalizzato; il Mac — IP residenziale, browser vero,
sessioni agenzia NOSTRE — fa il gesto meccanico attraverso **qualunque porta
sia aperta**. Quando (se) il Support attiva feed o REST, si cambia SOLO il
trasporto: la coda, lo stato e il diff restano identici. Zero rilavorazione.

## Il contratto

Base URL `https://www.boomrome.com` · header `X-Homie-Secret: <HOMIE_SECRET>`.
Cadenza suggerita: **30 minuti** (la risposta la ripete in
`suggestedIntervalMinutes`). La maggior parte dei giri è vuota e costa una GET.

### 1. Chiedi la worklist

```
GET /api/publisher/queue?portal=immobiliare
GET /api/publisher/queue?portal=idealista
```

Risposta: `{ ok, enabled, stats, actions: [{ op, id, name, hash, remoteId,
remoteUrl, attempts, payload }] }`.

- `enabled:false` → non fare nulla (kill switch dell'operatore).
- Le azioni arrivano **già in ordine**: prima i `remove` (un annuncio online
  per una casa affittata genera lead da rifiutare — è la prima cosa da
  togliere), poi i `create`, poi gli `update`.
- `payload` contiene TUTTO: prezzo, mq, locali, bagni, piano, arredamento,
  deposito, data disponibilità, classe energetica, descrizioni IT+EN, feature
  **già umanizzate** (`featuresLabels.it/.en`), foto in ordine (la prima è la
  copertina), geo con `precision`, `showExactAddress`.
- `remove` non porta payload: serve solo `remoteId`/`remoteUrl` (o la ricerca
  per titolo nel pannello) per trovare l'annuncio da disattivare.

### 2. Esegui — una alla volta, a ritmo umano

Mai in parallelo, mai a raffica: sei l'agenzia che aggiorna i propri annunci,
e a quella velocità lavora.

### 3. Riferisci ogni esito

```
POST /api/publisher/queue
{ "portal": "immobiliare",
  "results": [
    { "id": "lst_pigneto", "op": "create", "hash": "<lo STESSO hash dell'azione>",
      "ok": true, "remoteId": "98123456", "remoteUrl": "https://…", "name": "Bilocale Pigneto" },
    { "id": "lst_x", "op": "update", "hash": "…", "ok": false, "error": "campo mq rifiutato" }
  ] }
```

- **Rimanda l'`hash` ricevuto nell'azione**, sempre: lo stato registra il
  contenuto DAVVERO pubblicato. Se l'operatore edita il listing mentre
  lavori, il giro dopo se ne accorge da solo.
- `remoteId`/`remoteUrl` appena li conosci: rendono i giri futuri (update e
  remove) una ricerca diretta invece che per titolo.
- Sessione scaduta, login richiesto, captcha → **fermati** e manda
  `{ "portal": "…", "blocked": true, "error": "login richiesto su …" }`.
  L'heartbeat (`publisher-<portale>`) distingue "niente da fare" da "occhi
  chiusi": dopo 3 giri bloccati l'operatore riceve l'allerta Telegram da solo.
- Un fallimento ripetuto 3 volte sullo stesso contenuto viene parcheggiato
  dal server: non ci giri a vuoto. Si sblocca quando l'operatore modifica il
  listing.

## Porta A — feed / REST (quando il Support attiva)

- **Batch FTP**: scarica `GET /api/feed/immobiliare.xml?k=<feedKey>&gz=1` e
  caricalo sull'FTP che il Support assegna. La rimozione è implicita: ciò che
  non è nel feed sparisce. Una riga di `launchd` al giorno.
- **REST**: per ogni azione `create`/`update`, scarica il nodo singolo da
  `payload.hints.xmlNodePath` e fallo `PUT` su
  `https://feed.immobiliare.it/…/property/{unique-id}` con HTTP BASIC +
  header `X-IMMO-SOURCE` (credenziali del Support; gli IP pubblici del Mac
  vanno dichiarati — è il motivo per cui consegna il Mac e non Vercel).
  `remove` → `DELETE` sullo stesso path. Leggi il `ServiceResponse`: `code 0`
  = ok, tutto il resto va in `error` nel rapporto, verbatim.

## Il braccio: setup in 10 minuti (`bot/boom_publisher.py`)

Lo script è pronto nel repo — sul Mac mini va DEPOSITATO una volta:

```bash
mkdir -p ~/boom-publisher && cd ~/boom-publisher
# copia boom_publisher.py dal repo + crea .env con:
#   HOMIE_SECRET=<lo stesso del wizard>
pip3 install requests python-dotenv playwright
python3 -m playwright install chromium
python3 boom_publisher.py --login    # login UNA volta su entrambi i pannelli
python3 boom_publisher.py --dry      # guarda la worklist senza toccare nulla
```

**Prerequisito lato server (una volta)**: le rules Firestore con la riga
`portalPubs` devono essere deployate (secret `FIREBASE_TOKEN` su GitHub o
`npx firebase-tools deploy --only firestore:rules,storage`) — senza, il
rapporto POST non può registrare lo stato.

I modi, uno per invocazione:
- `--dry` → stampa la worklist (zero browser, zero rapporti);
- `--login` → apre il profilo persistente sui due pannelli, si fa login, fine;
- `--check` → per launchd (`bot/com.boom.publisher.plist`, ogni 30′):
  interroga le code e NOTIFICA macOS quando c'è lavoro. Mai un browser
  senza operatore davanti;
- `--assist` → la sessione di lavoro di OGGI: apre il pannello, stampa i
  campi già pronti dal payload (feature umanizzate, regola del pin, foto in
  ordine), l'operatore compila nel browser e conferma in terminale con
  l'URL pubblico → il rapporto parte da solo. `b` = bloccato (captcha/
  login), `s` = salta;
- `--auto` → riservato: si accende quando i selettori dei pannelli saranno
  mappati; oggi ricade su `--assist` (mai un click alla cieca).

Test della logica pura (senza rete né browser):
`python3 tests/publisher/runner.py`.

## Porta B — i pannelli agenzia (OGGI)

Playwright/Chromium con **profilo persistente** (es.
`~/.boom/chrome-publisher`): l'operatore fa login UNA volta a mano nei
pannelli (Immobiliare/Getrix e Idealista pro), la sessione resta nel profilo.

Per azione:
- `create` → "nuovo annuncio": riempi i campi DAL payload. Un campo che il
  payload non ha si lascia al default del pannello — **mai inventare**
  (piano, classe energetica, spese: se non ci sono, non ci sono).
- Descrizioni: `descriptionIt` e, dove il pannello ha la lingua,
  `descriptionEn`. Feature: usa `featuresLabels`, mai i codici grezzi.
- Foto: scarica gli URL del payload in un temp dir e caricale IN ORDINE (la
  prima è la copertina scelta dal Photo Lab).
- Indirizzo: compila sempre; il toggle "mostra indirizzo esatto" segue
  `showExactAddress` — su una via senza civico il portone è arbitrario e non
  si spaccia (stessa regola del sito).
- `update` → apri l'annuncio (per `remoteId`/`remoteUrl`, altrimenti cerca il
  titolo), riallinea i campi al payload, salva.
- `remove` → disattiva/archivia l'annuncio (non serve cancellarlo: deve solo
  sparire dal pubblico).
- Dopo il salvataggio cattura l'URL pubblico → `remoteUrl` nel rapporto.
- Errore inaspettato → screenshot in locale, messaggio d'errore verbatim nel
  rapporto, avanti con la prossima azione.

### Le regole d'oro

1. **Mai inventare un dato.** Il payload è la verità; il resto resta vuoto.
2. **Ritmo umano, una cosa alla volta.** Niente retry aggressivi.
3. **Captcha o 2FA = stop.** Rapporto `blocked:true` e si aspetta l'umano.
   Mai aggirare, mai riprovare in loop.
4. **La precisione del pin non si spaccia** (`showExactAddress`).
5. **Ogni esito si riferisce**, anche i fallimenti — un rapporto brutto vale
   più di un silenzio pulito.

## Cosa NON è questo mandato

- Non decide COSA pubblicare: lo decide il server (stessa regola di
  pubblicabilità di vetrina e feed).
- Non riscrive testi, non ritocca foto: arrivano già pronti (Photo Lab,
  sweep descrizioni).
- Non tocca annunci che non siano di BOOM.
