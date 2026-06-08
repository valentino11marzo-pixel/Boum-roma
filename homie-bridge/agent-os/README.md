# BOOM Agent OS

Versioned, deployable runtime that turns Homie (the OpenClaw agent on the
BOOM Mac Mini) into a real autonomous system. Single command to install,
self-managed afterwards.

## Filosofia

L'agente LLM (token = €) si sveglia **solo quando c'è valore reale**. Il
resto del tempo lavora un guardiano gratuito che legge WhatsApp da testo
(non da vision) e diffa il portal ogni 15 min senza spendere un cent.
Quando trova un cambiamento vero — un messaggio nuovo, un pagamento scaduto,
un lead dal form sito — sveglia Homie con il **delta preciso**, non a
ri-scansionare tutto. Risultato: 10-20× meno token a parità di reattività.

## Architettura (7 livelli)

```
L6  Memoria         — profilo per contatto, continuità tra sessioni
L5  Osservabilità   — health, telemetria token/€, budget cap, audit
L4  Approvazione    — Tier-2 su Telegram (1 tap) — già live
L3  Azione          — boom (portal) · Sofia (voce) · WhatsApp/email
L2  Decisione       — agente Homie, svegliato solo su eventi
L1  Sense           — pulse.sh, guardiano gratuito (questo package)
L0  Engine          — risk/fiscal/relet/taxpack/underwriting (server)
```

## Componenti

- **`bin/pulse.sh`** — guardiano: ogni 15 min interroga wacli (WhatsApp
  testo) + boom risk (server), diffa con lo stato precedente, sveglia
  l'agente solo sui cambiamenti veri.
- **`bin/health.sh`** — dead-man switch: se Homie non risponde a un ping per
  >5 min, alerta su Telegram e tenta restart del launchd.
- **`bin/telemetry.sh`** — somma quanti token/azioni Homie ha consumato
  oggi, ti scrive su Telegram se supera la soglia.
- **`bin/memory.sh`** — mantiene un profilo .json per contatto (ultimo
  tocco, promesse, sentiment) iniettato come contesto quando Homie
  risponde a quella persona.

- **`lib/common.sh`** — shell helpers comuni (logging, stato, alert).
- **`lib/wacli.sh`** — wrapper su `wacli messages list/show/search`.
- **`lib/portal.sh`** — wrapper su `boom` + diff/hash dei snapshot.

- **`state/`** — file di runtime (last-seen, profili, metriche giornaliere).
  Ignorato dal git, vive solo sul Mini.

## Install sul Mac Mini

```bash
cd ~/Boum-roma && git pull origin main
bash ~/Boum-roma/homie-bridge/agent-os/install.sh
```

L'installer:
1. crea i symlink in `~/agent-os/`
2. registra il launchd `com.boomrome.pulse` (ogni 15 min)
3. registra il launchd `com.boomrome.health` (ogni 2 min)
4. registra il launchd `com.boomrome.telemetry` (ogni ora)
5. fa lo smoke-test di tutti i bin

## Stato attuale del package

- [x] **L1 sense** → `pulse.sh` v0.1 — gate gratuito ogni 15 min
- [x] **L5 affidabilità** → `health.sh` v0.1 — dead-man switch ogni 2 min
- [x] **L5 costi** → `telemetry.sh` v0.1 — digest 09:00 + budget cap
- [x] **L6 memoria** → `memory.sh` v0.1 — profilo per contatto, iniettato in pulse
- [ ] Event-driven realtime (portal → push diretto a pulse)
- [ ] Espansioni future (Sofia inbound, tenant concierge chat, predictive
      re-let, multi-channel inbox, owner onboarding agent — vedi backlog
      idee nei commenti del progetto)

Avanziamo pilastro per pilastro, ogni step testato sul Mini prima del
prossimo.
