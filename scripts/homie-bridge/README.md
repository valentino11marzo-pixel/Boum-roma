# BOOM × Homie — Mac bridge

Accende e mantiene **viva e costante** la connessione tra il runtime Homie (sul tuo Mac) e il portale.

Il portale ascolta in realtime il documento Firestore `heartbeat/mac`. Quando il bridge invia un ping a `POST /api/agent/heartbeat`, quel documento si aggiorna e il pallino **"Homie connesso"** nel **Command Center** (e nel Cockpit) diventa verde. Senza ping → resta grigio/"offline".

> Nota onesta: questo bridge è **il tubo**, non il cervello. Il ragionamento di Homie gira sul Mac. Lo script tiene aperta la connessione (heartbeat) e ti dà un punto d'innesto per inoltrare eventi (`lead`). Il resto dell'API agente è già pronto e documentato in [`../../api/agent/README.md`](../../api/agent/README.md).

## Prerequisiti (una volta sola)

1. **Variabili d'ambiente su Vercel** (Project → Settings → Environment Variables), già usate da `/api/homie/*`:
   - `HOMIE_SECRET` — un secret a tua scelta (lo stesso che metterai sul Mac)
   - `FIREBASE_API_KEY`, `FIREBASE_ADMIN_EMAIL`, `FIREBASE_ADMIN_PASS`, `FIREBASE_PROJECT_ID`
   Dopo averle impostate, fai un redeploy così `/api/agent/heartbeat` le vede.

2. **Test che l'endpoint sia vivo** (da qualsiasi macchina):
   ```bash
   curl -i -X POST https://boomrome.com/api/agent/heartbeat \
     -H 'Content-Type: application/json' \
     -H 'X-Homie-Secret: IL_TUO_SECRET' \
     -d '{"status":"live"}'
   ```
   Atteso: `200` con `{"ok":true,...}`. Se torna `401 invalid_auth` il secret non combacia; se `500 server_misconfigured` manca `HOMIE_SECRET` su Vercel.

## Setup sul Mac (2 minuti)

```bash
cd scripts/homie-bridge
cp homie-bridge.env.example homie-bridge.env
# apri homie-bridge.env e incolla HOMIE_SECRET (= quello su Vercel)
chmod +x boom-homie-bridge.sh

./boom-homie-bridge.sh ping     # test: deve stampare "OK — heartbeat accettato"
```

Apri il **Command Center** nel portale: entro ~2 minuti il pallino diventa **verde "Homie connesso"**.

## Connessione costante (sempre attiva)

Opzione A — tieni un terminale aperto:
```bash
./boom-homie-bridge.sh run
```

Opzione B — **launchd** (riparte al login, si auto-riavvia): consigliata.
```bash
# 1. apri com.boom.homie-bridge.plist e sostituisci __ABSOLUTE_PATH__
#    con il percorso reale di questa cartella, es:
#    /Users/tuonome/Boum-roma/scripts/homie-bridge
# 2. installa:
cp com.boom.homie-bridge.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.boom.homie-bridge.plist
# log:   tail -f /tmp/boom-homie-bridge.log
# stop:  launchctl unload -w ~/Library/LaunchAgents/com.boom.homie-bridge.plist
```

## Inoltrare un lead (esempio)

```bash
./boom-homie-bridge.sh lead '{"source":"whatsapp","name":"Mario Rossi","phone":"+39333...","note":"cerca bilocale Trastevere"}'
```
Scrive nella collection `leads`; compare nel Dashboard del portale (sezione Lead & Pipeline). Per gli altri tool (viewings, contracts, messages, documents…) vedi `../../api/agent/README.md` e `GET /api/agent/spec`.

## Soglie del pallino (uguali al Cockpit)

| Ultimo ping | Stato |
|---|---|
| < 2 min | 🟢 connesso |
| 2–5 min | 🟠 inattivo |
| 5–15 min | 🔴 in ritardo |
| > 15 min / mai | ⚪ offline |

Con `HB_INTERVAL=30` resti comodamente in verde.
