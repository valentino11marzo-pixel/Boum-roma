# LO SCATTO + IL CONTATTO — i due bracci del PFS sul Mac

*Il ciclo che mancava, per intero: la ricerca del cliente si scansiona da
sola ogni ~10 minuti, l'annuncio compare in plancia coi segnali del radar,
l'operatore lo rivede e con UN tap il messaggio scelto parte nella chat del
portale. Il server pensa, il Mac esegue (la regola di HOMIE.md e del
Pubblicista). Nessuna delle due braccia decide niente da sola.*

## Perché sul Mac
I portali rifiutano gli IP dei datacenter (documentato in `api/pfs/_fetch.js`):
da Vercel la scansione diretta è impossibile PER COSTRUZIONE, e la chat del
portale vive dentro un account loggato. Il Mac mini (IP residenziale, browser
vero, profili persistenti) è l'unico posto da cui questo lavoro si può fare.

## LO SCATTO (`boom_scout.py` + `com.boom.scout.plist`, ogni 10')
1. `GET /api/homie/searches` → le ricerche VIVE, auto-generate dai criteri di
   ogni cliente attivo (`pfs/sync-searches`). Mai hardcodare un URL.
2. Apre ogni ricerca nel browser (profilo `~/.boom/chrome-scout`), estrae gli
   URL annuncio, tiene un registro locale dei già visti (il dedupe VERO è del
   server: nel dubbio manda).
3. Apre le schede NUOVE (tetto per giro), legge i fatti (JSON-LD prima,
   regex poi — mai inventare), classifica l'inserzionista SOLO con prova:
   ricerca `/da-privati/` → private per costruzione; marker in pagina →
   quello che dicono; altrimenti `unknown` ESPLICITO.
4. `POST /api/homie/property` per ogni annuncio → l'ingestione condivisa fa
   tutto: dedupe, punteggio clienti, mazzi, radar (impronta+fiuto+vedette),
   Telegram istantaneo. Il privato ha priorità totale per costruzione: le
   agenzie si archiviano, MAI nei mazzi.
5. `POST /api/homie/searches` col rapporto = il battito
   (`pfsRadarHealth/homie-eyes`). `blocked` è il campo che conta: un radar
   cieco non deve mai sembrare un mercato fermo.

Modalità: `--once` (default, launchd) · `--dry` · `--login` (cookie/login una
volta) · `--state`. Default headless; se un portale lo blocca:
`BOOM_SCOUT_HEADED=1` nel `.env` e si riprova.

## IL CONTATTO (`boom_contatto.py` + `com.boom.contatto.plist`, ogni 5')
Il tap dell'operatore in plancia È l'approvazione: il doc entra in
`outreachQueue` con lo stile scelto e il testo ESATTO letto in anteprima.
Il Mac è solo il postino:
1. `GET /api/outreach/queue` → i job approvati (max 6, lease anti-doppio-invio;
   `?peek=1` per guardare senza prendere).
2. Apre l'annuncio, scrive il testo INTATTO nella chat/form del portale
   (una parola cambiata = una parola mai approvata), ritmo umano 20-40s.
3. Esiti, tutti riportati: `ok` (conferma visibile) → l'annuncio in plancia
   passa da solo a "contattato"; `esito_incerto` (submit senza conferma) →
   parcheggiato SUBITO, mai un retry cieco (un doppio messaggio allo stesso
   proprietario è peggio di uno perso); campo non trovato → tentativi,
   al 3° parcheggio; captcha/login → STOP del giro, rapporto `blocked`.
4. Il rapporto è il battito (`pfsRadarHealth/contatto`), anche a coda vuota.

Modalità: `--run` (default, launchd) · `--dry` (peek) · `--login` ·
`--assist` (per i parcheggiati: pagina aperta + messaggio negli appunti,
l'operatore incolla e conferma l'esito).

## Le regole d'oro (comuni, non negoziabili)
- **Mai inventare.** Un dato che non c'è si omette; un inserzionista non
  provato è `unknown`.
- **Ritmo umano.** Una pagina alla volta, pause con jitter, tetti per giro.
- **Captcha/2FA/login = STOP e rapporto `blocked`.** Mai aggirare: il
  server distingue "bloccata" da "guasta" e allerta con misura.
- **Ogni esito riferito.** Il rapporto è il battito; il giro a vuoto è
  salute, il silenzio è il guasto.
- **Il giudizio sta sul server.** Qui si riportano fatti.
- **Un contatto per annuncio, per costruzione** (id = `outreachKey`), e
  l'invio parte SOLO da un'approvazione umana per singolo messaggio.
- **Niente dati personali del cliente** nel testo (il motore lo rifiuta
  alla porta se contiene un telefono).

## Setup completo (Mac, una volta)
```bash
PY=/Library/Frameworks/Python.framework/Versions/3.13/bin/python3
$PY -m pip install playwright requests python-dotenv
$PY -m playwright install chromium

# Lo Scatto
mkdir -p ~/boom-scout && cp bot/boom_scout.py ~/boom-scout/
printf 'HOMIE_SECRET=<lo stesso degli altri bracci>\n' > ~/boom-scout/.env
cd ~/boom-scout && $PY boom_scout.py --login     # accetta i cookie
cp bot/com.boom.scout.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.boom.scout.plist

# Il Contatto
mkdir -p ~/boom-contatto && cp bot/boom_contatto.py ~/boom-contatto/
printf 'HOMIE_SECRET=<idem>\nBOOM_CONTACT_NAME=<nome per i form>\nBOOM_CONTACT_EMAIL=<email>\nBOOM_CONTACT_PHONE=<telefono>\n' > ~/boom-contatto/.env
cd ~/boom-contatto && $PY boom_contatto.py --login   # login sui portali
cp bot/com.boom.contatto.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.boom.contatto.plist

launchctl list | grep com.boom   # devono comparire scout e contatto
```
Verifica dal telefono: la chip "Occhi Homie" e la chip "Contatto" nella
plancia (`/pfs-command`) diventano verdi al primo giro. Kill switch del
Contatto: doc Firestore `settings/outreach` → `{ enabled: false }`.

Test della logica pura (senza bot, senza rete):
`python3 tests/scout/runner.py` · `python3 tests/contatto/runner.py`
