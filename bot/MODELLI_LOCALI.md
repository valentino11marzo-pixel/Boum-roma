# I modelli locali sul Mac — la guida semplice

*22 settembre 2026. Il lato server è in `CLAUDE.md` → «La Centrale AI»; lo
studio è `STUDIO_MODELLI_LOCALI_2026-09.md`. Qui c'è solo quello che devi
fare tu, in ordine.*

## Cosa ottieni

Il server continua a lavorare come oggi. In più può mandare alcune
chiamate AI al **Mac mini** invece che al cloud: costa zero token e i
documenti dei clienti restano in casa. Se il Mac è spento o lento, il
cloud riprende da solo. Si accende e si spegne da Telegram.

## Prima di cominciare (sul Mac mini, una volta)

1. **Ollama** — niente da fare, se sul Mac c'è Homebrew: l'installer lo
   installa da solo (la formula, senza finestra) e lo tiene acceso come
   servizio. Se preferisci l'app, scaricala da https://ollama.com/download e
   aprila una volta (icona nella barra dei menu): l'installer usa quella.
2. **Tailscale** — scaricalo da https://tailscale.com/download/mac, apri
   l'app, accedi con Google. Serve per far arrivare il server al Mac in
   https, senza aprire porte sul router.

## L'installazione (un comando)

Apri il Terminale sul Mac mini e incolla:

```
bash -c "$(curl -fsSL https://raw.githubusercontent.com/valentino11marzo-pixel/Boum-roma/main/bot/install_locale.sh)"
```

Cosa fa da solo:
- legge chip e memoria del Mac e **sceglie il modello** (8 GB → piccolo,
  16 GB → medio, da 24 GB anche il modello che vede le foto);
- scarica il modello con Ollama (la prima volta qualche minuto);
- installa il **ponte con la serratura** (`boom_locale.py`): solo chi ha il
  token può parlare col Mac, e solo per le tre rotte che servono;
- accende il tunnel Tailscale e stampa l'indirizzo https;
- **stampa le righe da incollare su Vercel**.

Se Tailscale non è ancora dentro, lo dice e si ferma lì: entri nell'app e
rilanci lo stesso comando (non rifà quello che ha già fatto). La prima
volta Tailscale può chiedere di **abilitare il Funnel** dalla sua console:
il comando stampa il link, si clicca una volta.

## Le righe per Vercel

L'installer le stampa così (i valori sono i tuoi):

```
LOCAL_AI_URL=https://mac-mini-di-boom.<rete>.ts.net
LOCAL_AI_MODEL=qwen3:14b
LOCAL_AI_VISION_MODEL=qwen2.5vl:7b      (solo se il Mac ha memoria)
LOCAL_AI_TOKEN=…
```

Vercel → progetto boum-roma → Settings → Environment Variables →
Production → aggiungi le righe → **Redeploy**.

## Tutto dal terminale (anche via SSH, senza lo schermo del Mac)

Stesse cose di sopra, ma ogni passo è un comando da incollare, in ordine.
**Nei blocchi non ci sono commenti**: la shell del Mac (zsh) non accetta `#`
su una riga interattiva, e il 22/09 un blocco con i commenti ha prodotto
`command not found: #` e file fantasma con i nomi delle parole. Le
spiegazioni stanno fra un blocco e l'altro.

**1. Tailscale senza schermo.** Il Mac mini si usa via SSH: l'app Tailscale
(la finestra, l'icona nella barra) vuole lo schermo per approvare
l'estensione di rete e per accedere. Il demone Homebrew no. Se l'app è già
stata installata, prima si toglie (chiede la password di sudo):

```
brew uninstall --cask tailscale-app
```

Poi il demone. L'ultimo comando stampa un link `https://login.tailscale.com/a/…`:
aprilo dal browser del portatile e accedi con Google.

```
brew install tailscale
sudo tailscaled install-system-daemon
sudo tailscale set --operator="$USER"
tailscale login
```

Controllo: `tailscale status` deve stampare il Mac con un indirizzo 100.x.

**2. Ollama.** Niente da fare: se manca, l'installer lo installa con
Homebrew (`brew install ollama`, un minuto) e lo tiene acceso come servizio
`com.boom.ollama`, senza finestra e con il contesto lungo scritto nel
servizio (sopravvive al riavvio). Il 22/09 sul Mac mini non c'era, e la
prima versione di questa guida lo dava per «già installato».

**3. L'installer.** Scarica il modello, mette il ponte, apre il tunnel e
**stampa le 4 righe `LOCAL_AI_*`**. Se dice che il Funnel va abilitato,
clicca il link che stampa e rilancia lo stesso comando (non rifà quello che
ha già fatto).

```
bash -c "$(curl -fsSL https://raw.githubusercontent.com/valentino11marzo-pixel/Boum-roma/main/bot/install_locale.sh)"
```

**4. Vercel dal terminale** (una volta; se manca Node: `brew install node`):

```
npm i -g vercel
vercel login
cd ~/boom-locale && vercel link --yes --scope valentino-boom --project boum-roma
```

**5. Le 4 righe stampate dall'installer**, incollate al posto degli esempi:

```
cat > ~/boom-locale/vercel.env <<'ENV'
LOCAL_AI_URL=https://mac-mini.<rete>.ts.net
LOCAL_AI_MODEL=qwen3:14b
LOCAL_AI_VISION_MODEL=qwen2.5vl:7b
LOCAL_AI_TOKEN=incolla-il-token
ENV
```

**6. Mandarle a Vercel (Production) e far ripartire il deploy:**

```
cd ~/boom-locale && while IFS='=' read -r k v; do
  [ -z "$k" ] && continue
  vercel env rm "$k" production --yes >/dev/null 2>&1
  printf '%s' "$v" | vercel env add "$k" production
done < vercel.env
vercel redeploy https://boum-roma-git-main-valentino-boom.vercel.app
```

Poi su Telegram `/ai` → «🟢 Accendi il locale». Il file `vercel.env`
contiene il token: resta sul Mac, non va condiviso.

## Accendere

Su Telegram: `/ai`. In testa vedi se il server raggiunge il Mac. Premi
**«🟢 Accendi il locale»**. Poi, per ogni voce che ti interessa, premi il
suo bottone finché dice **shadow**: risponde ancora il cloud, ma il Mac
lavora in parallelo e il sistema conta quante volte è d'accordo.

Dopo due settimane `/ai` dice per ogni voce «pronta» o «bocciata». Solo
sulle «pronta» premi ancora: **local**. Da lì risponde il Mac.

Da subito puoi mettere in **local** la trascrizione vocale, quando avrai un
server Whisper (vedi sotto): non ha bisogno dell'ombra.

## Controllare che funzioni

Dal Mac: `cd ~/boom-locale && python3 boom_locale.py --smoke` — prova il
ponte e chiede al server se lo vede. Su Telegram: `/ai`.

Log: `~/boom-locale/locale.log` (solo rotta, stato e millisecondi: mai il
contenuto delle richieste).

## Spegnere

Telegram `/ai` → «⚪ Spegni il locale». Tutto torna in cloud all'istante.
Per togliere il ponte dal Mac: `launchctl unload
~/Library/LaunchAgents/com.boom.locale.plist`.

## Se qualcosa non va

| Sintomo | Causa probabile | Cosa fare |
|---|---|---|
| `/ai` dice «irraggiungibile» | tunnel non attivo o token diverso | sul Mac `tailscale funnel status`; il token su Vercel deve essere IDENTICO a quello in `~/boom-locale/.env` |
| `/ai` dice «non configurato» | mancano le env su Vercel | incolla le righe e fai Redeploy |
| le chiamate ricadono sempre sul cloud (`ricadute` alte in `/ai`) | modello troppo lento per il tetto di 20 s | modello più piccolo: `LOCALE_MODEL=qwen3:8b` nel `.env`, poi rilancia l'installer |
| l'ombra dice «bocciata» | il modello sbaglia su quello scopo | lascia quello scopo in cloud; prova un modello più grande se la memoria lo regge |
| il Mac si riavvia e il ponte non torna | login automatico spento | Impostazioni → Utenti → Login automatico per `boomserver` (come per gli altri bracci) |

## Whisper locale (facoltativo, dopo)

La trascrizione delle note vocali può girare sul Mac con un server
Whisper che parla il dialetto OpenAI (`POST /v1/audio/transcriptions`):
per esempio `speaches`. Quando ce l'hai, in `~/boom-locale/.env` aggiungi
`STT_URL=http://127.0.0.1:8000`, riavvia il ponte (`launchctl unload` +
`load` del plist) e su Vercel `LOCAL_STT_URL` = lo stesso indirizzo del
Funnel. Poi `/ai` → «Trascrizione vocale» → local.

## Cosa NON fare

- Non esporre Ollama direttamente su internet: non ha nessuna password. Il
  ponte esiste per questo.
- Non mettere in `local` le bozze ai clienti (Commerciale, Segretaria)
  senza aver guardato le approvazioni: lì l'ombra non misura.
- Non aspettarti un grande risparmio in euro: la produzione costa decine
  di dollari al mese. Il guadagno è la privacy e un sistema che si misura.
