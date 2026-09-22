#!/bin/bash
# install_locale.sh — I MODELLI LOCALI sul Mac, in UN comando.
#
# Dal Mac mini (Terminal):
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/valentino11marzo-pixel/Boum-roma/main/bot/install_locale.sh)"
#
# oppure, da un checkout del repo:  bash bot/install_locale.sh
#
# Cosa fa (ed è SICURO rilanciarlo: aggiorna lo script, non tocca mai un
# .env esistente se non per aggiungere chiavi mancanti):
#   1. legge chip e memoria del Mac e sceglie il modello (LOCALE_MODEL nel
#      .env vince, se lo hai già scelto tu)
#   2. Ollama: lo installa se manca (brew), lo tiene ACCESO (LaunchAgent
#      com.boom.ollama, o l'app se c'è), scarica il modello, e gli dà
#      contesto lungo + modello sempre caricato (OLLAMA_CONTEXT_LENGTH /
#      OLLAMA_KEEP_ALIVE) — senza, la prima chiamata dopo un'ora di silenzio
#      supera il tetto di 20 s del server
#   3. installa il PONTE con la serratura (boom_locale.py + LaunchAgent
#      KeepAlive) e genera LOCAL_AI_TOKEN se manca
#   4. espone il ponte con Tailscale Funnel (https stabile, senza dominio)
#   5. stampa le righe da incollare su Vercel e prova il giro
#
# Prerequisiti, una volta:
#   · Ollama: NIENTE, se c'è Homebrew — lo installa questo script (formula,
#     senza finestra) e lo tiene su come LaunchAgent. In alternativa l'app
#     da https://ollama.com/download (aprila una volta): lo script usa quella.
#   · Tailscale, in UNA delle due forme:
#       - senza schermo (SSH, il caso del Mac mini): il demone Homebrew —
#           brew install tailscale
#           sudo tailscaled install-system-daemon
#           sudo tailscale set --operator="$USER"
#           tailscale login          ← stampa un link: aprilo da qualsiasi browser
#       - con lo schermo del Mac: l'app da https://tailscale.com/download/mac
#         (la prima apertura chiede di approvare l'estensione di rete in
#         Impostazioni di Sistema → Privacy e sicurezza, poi si accede).
#     Questo script usa quello che RISPONDE, non il primo file che trova.

set -euo pipefail

RAW_BASE='https://raw.githubusercontent.com/valentino11marzo-pixel/Boum-roma/main/bot'
DIR="$HOME/boom-locale"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PORT="${LOCALE_PORT:-8088}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n✗ %s\n' "$*" >&2; exit 1; }
ask() { # ask "Domanda" default -> risposta in $REPLY
  local q="$1" def="${2:-}"
  if [ -r /dev/tty ]; then
    printf '   %s%s: ' "$q" "${def:+ [$def]}" > /dev/tty
    IFS= read -r REPLY < /dev/tty || REPLY=''
  else
    REPLY=''
  fi
  [ -n "$REPLY" ] || REPLY="$def"
}

[ "$(uname)" = "Darwin" ] || die "Questo installer è per il Mac (launchd)."
[ "$(uname -m)" = "arm64" ] || die "Serve un Mac con chip Apple (M1 o successivo): su Intel un modello locale non ha accelerazione utile."

say "I MODELLI LOCALI — installazione"

# ── 0. Python e script ───────────────────────────────────────────────────────
PY=/Library/Frameworks/Python.framework/Versions/3.13/bin/python3
if [ ! -x "$PY" ]; then
  PY="$(command -v python3 || true)"
  [ -n "$PY" ] || die "Python 3 non trovato. Installa da python.org e rilancia."
fi
note "Python: $PY ($("$PY" -V 2>&1))"
mkdir -p "$DIR" "$AGENTS_DIR"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-/nonexistent}")" 2>/dev/null && pwd || true)"
if [ -n "$SRC_DIR" ] && [ -f "$SRC_DIR/boom_locale.py" ]; then
  cp "$SRC_DIR/boom_locale.py" "$DIR/boom_locale.py"
else
  curl -fsSL "$RAW_BASE/boom_locale.py" -o "$DIR/boom_locale.py" || die "download di boom_locale.py fallito"
  [ "$(wc -c < "$DIR/boom_locale.py")" -gt 2000 ] || die "boom_locale.py scaricato troppo corto — riprova"
fi
note "boom_locale.py → $DIR"

# ── 1. Chip, memoria, modello ────────────────────────────────────────────────
say "Il Mac"
PICK="$("$PY" "$DIR/boom_locale.py" --pick-model || true)"
MEM="$(printf '%s' "$PICK" | "$PY" -c 'import sys,json; print(json.load(sys.stdin).get("memGb",0))' 2>/dev/null || echo 0)"
CHIP="$(printf '%s' "$PICK" | "$PY" -c 'import sys,json; print(json.load(sys.stdin).get("chip",""))' 2>/dev/null || echo '')"
PICK_TEXT="$(printf '%s' "$PICK" | "$PY" -c 'import sys,json; print(json.load(sys.stdin).get("text") or "")' 2>/dev/null || echo '')"
PICK_VISION="$(printf '%s' "$PICK" | "$PY" -c 'import sys,json; print(json.load(sys.stdin).get("vision") or "")' 2>/dev/null || echo '')"
PICK_NOTE="$(printf '%s' "$PICK" | "$PY" -c 'import sys,json; print(json.load(sys.stdin).get("note") or "")' 2>/dev/null || echo '')"
note "chip: ${CHIP:-?} · memoria: ${MEM} GB"
[ -n "$PICK_TEXT" ] || die "Memoria insufficiente per un modello locale ($PICK_NOTE)."
ENV_FILE="$DIR/.env"
touch "$ENV_FILE"
envget() { sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | tr -d '"' | tr -d "'"; }
ensure_env() { grep -q "^$1=" "$ENV_FILE" || printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"; }
MODEL="$(envget LOCALE_MODEL)"; [ -n "$MODEL" ] || MODEL="$PICK_TEXT"
VISION="$(envget LOCALE_VISION_MODEL)"; [ -n "$VISION" ] || VISION="$PICK_VISION"
note "modello testo: $MODEL$( [ -n "$VISION" ] && printf ' · visione: %s' "$VISION")"
note "($PICK_NOTE)"

# ── 2. Ollama ────────────────────────────────────────────────────────────────
say "Ollama"
# Due forme, come per Tailscale: l'APP (Ollama.app gestisce da sé il server
# e vuole una sessione grafica per aprirsi) o la FORMULA Homebrew (solo il
# binario: il server lo teniamo su NOI con un LaunchAgent, senza finestra —
# il caso del Mac mini via SSH, 22/09, dove Ollama non c'era affatto e
# "scaricalo da ollama.com, apri l'app" non era una via percorribile).
# Un solo server su :11434, e chi lo gestisce è deciso qui, non dal caso.
OLLAMA_APP=/Applications/Ollama.app
OLLAMA_BIN="$(command -v ollama || true)"
if [ -z "$OLLAMA_BIN" ] && [ -x "$OLLAMA_APP/Contents/Resources/ollama" ]; then
  OLLAMA_BIN="$OLLAMA_APP/Contents/Resources/ollama"
fi
if [ -z "$OLLAMA_BIN" ]; then
  if command -v brew >/dev/null 2>&1; then
    note "non trovato: lo installo con Homebrew (la formula, senza finestra: va bene via SSH)…"
    brew install ollama || die "brew install ollama fallito"
    OLLAMA_BIN="$(command -v ollama || true)"
    [ -n "$OLLAMA_BIN" ] || OLLAMA_BIN="$(brew --prefix 2>/dev/null)/bin/ollama"
  fi
  [ -x "${OLLAMA_BIN:-/nonexistent}" ] || die "Ollama non trovato. Con Homebrew: brew install ollama — oppure scaricalo da https://ollama.com/download, apri l'app una volta, poi rilancia questo comando."
fi
note "binario: $OLLAMA_BIN"
ollama_alive() { curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; }
ollama_wait()  { for _ in $(seq 1 30); do ollama_alive && return 0; sleep 1; done; ollama_alive; }
if [ -d "$OLLAMA_APP" ]; then
  # L'app: le variabili passano da launchctl setenv (come dice la doc di
  # Ollama) e valgono per le app aperte DOPO, quindi si riavvia. NON
  # sopravvivono a un riavvio del Mac: dopo un reboot l'app riparte col
  # contesto di default (dichiarato, non risolto — il ramo formula non ha
  # il problema perché le variabili stanno nel plist).
  launchctl setenv OLLAMA_CONTEXT_LENGTH 16384
  launchctl setenv OLLAMA_KEEP_ALIVE -1
  osascript -e 'quit app "Ollama"' >/dev/null 2>&1 || true
  sleep 2; open -a Ollama 2>/dev/null || true
  ollama_wait || die "Ollama.app non risponde su :11434. Aprila dalla cartella Applicazioni (serve una sessione grafica) e rilancia."
  note "app · contesto 16k · modello sempre in memoria (fino al prossimo riavvio del Mac) ✓"
else
  # La formula: il server è un LaunchAgent NOSTRO, con le variabili nel
  # plist (sopravvivono al riavvio) e legato a 127.0.0.1 (la serratura è il
  # ponte: Ollama non si espone). Se :11434 è già occupato da un altro
  # ollama (brew services, un `ollama serve` a mano) lo fermiamo prima: due
  # server sulla stessa porta = il nostro in crash loop.
  if ollama_alive && ! launchctl list 2>/dev/null | grep -q 'com\.boom\.ollama$'; then
    note "un altro server Ollama occupa :11434 — lo fermo (da ora lo tiene su launchd)"
    brew services stop ollama >/dev/null 2>&1 || true
    pkill -x ollama 2>/dev/null || true
    sleep 2
  fi
  cat > "$AGENTS_DIR/com.boom.ollama.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.boom.ollama</string>
    <key>ProgramArguments</key>
    <array>
        <string>$OLLAMA_BIN</string>
        <string>serve</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>$HOME</string>
        <key>OLLAMA_HOST</key>
        <string>127.0.0.1:11434</string>
        <key>OLLAMA_CONTEXT_LENGTH</key>
        <string>16384</string>
        <key>OLLAMA_KEEP_ALIVE</key>
        <string>-1</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>15</integer>
    <key>StandardOutPath</key>
    <string>$DIR/ollama.log</string>
    <key>StandardErrorPath</key>
    <string>$DIR/ollama.err.log</string>
</dict>
</plist>
PLIST
  launchctl unload "$AGENTS_DIR/com.boom.ollama.plist" 2>/dev/null || true
  launchctl load "$AGENTS_DIR/com.boom.ollama.plist"
  ollama_wait || die "Ollama non risponde su :11434 — guarda $DIR/ollama.err.log"
  note "com.boom.ollama · sempre acceso · contesto 16k · modello sempre in memoria ✓"
fi
say "Scarico $MODEL (la prima volta sono alcuni GB: qualche minuto)…"
"$OLLAMA_BIN" pull "$MODEL" || die "ollama pull $MODEL fallito"
if [ -n "$VISION" ]; then
  say "Scarico il modello con visione $VISION…"
  "$OLLAMA_BIN" pull "$VISION" || { note "⚠ visione non scaricata: le immagini restano in cloud"; VISION=''; }
fi

# ── 3. Il ponte con la serratura ─────────────────────────────────────────────
say "Il ponte (boom_locale.py)"
TOKEN="$(envget LOCAL_AI_TOKEN)"
if [ -z "$TOKEN" ]; then
  TOKEN="$(openssl rand -hex 24)"
  ensure_env LOCAL_AI_TOKEN "$TOKEN"
  note "LOCAL_AI_TOKEN generato ✓"
else
  note "LOCAL_AI_TOKEN già presente ✓ (non lo cambio)"
fi
ensure_env LOCALE_MODEL "$MODEL"
[ -n "$VISION" ] && ensure_env LOCALE_VISION_MODEL "$VISION"
ensure_env OLLAMA_URL "http://127.0.0.1:11434"
ensure_env LOCALE_PORT "$PORT"
# HOMIE_SECRET (solo per --smoke): dai bracci già installati. Il ponte di
# Homie lo scrive in ~/.boom/env come `export HOMIE_SECRET="…"` (sh da
# sorgere), gli altri come KEY=VALUE: si accettano entrambe le forme.
if [ -z "$(envget HOMIE_SECRET)" ]; then
  for f in "$HOME/boom-scout/.env" "$HOME/boom-contatto/.env" "$HOME/boom-publisher/.env" "$HOME/boom-listing-wizard/.env" "$HOME/.boom/env"; do
    [ -f "$f" ] || continue
    v="$(sed -n -E 's/^(export[[:space:]]+)?HOMIE_SECRET=//p' "$f" | head -1 | tr -d '"' | tr -d "'")"
    if [ -n "$v" ]; then ensure_env HOMIE_SECRET "$v"; note "HOMIE_SECRET ritrovato da un braccio già installato ✓"; break; fi
  done
fi
chmod 600 "$ENV_FILE"

cat > "$AGENTS_DIR/com.boom.locale.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.boom.locale</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PY</string>
        <string>$DIR/boom_locale.py</string>
        <string>--serve</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$DIR</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>15</integer>
    <key>StandardOutPath</key>
    <string>$DIR/locale.log</string>
    <key>StandardErrorPath</key>
    <string>$DIR/locale.err.log</string>
</dict>
</plist>
PLIST
launchctl unload "$AGENTS_DIR/com.boom.locale.plist" 2>/dev/null || true
launchctl load "$AGENTS_DIR/com.boom.locale.plist"
# 30 s, non 10: il 22/09 dopo un pull da 5 GB il primo avvio ne ha voluti
# di più e l'installer ha dichiarato morto un ponte che era vivo (PID, porta
# in ascolto, log vuoto). Se non risponde, si dice DOVE guardare.
for _ in $(seq 1 30); do sleep 1; curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; done
curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 || die "il ponte non risponde su :$PORT dopo 30 s — guarda $DIR/locale.err.log e 'launchctl list | grep com.boom.locale' (un trattino al posto del PID = non parte; un PID = sta partendo, rilancia fra un minuto)"
note "com.boom.locale · sempre acceso ✓"

say "Prova in locale (la prima completion carica il modello: può volerci un minuto)"
(cd "$DIR" && "$PY" boom_locale.py --test) || note "⚠ una prova è fallita: leggi le righe KO qui sopra prima di andare avanti"

# ── 4. Il tunnel (Tailscale Funnel) ──────────────────────────────────────────
say "Il tunnel https (Tailscale Funnel)"
# Due Tailscale possibili sullo stesso Mac: l'app (GUI: la prima apertura
# vuole lo schermo per approvare l'estensione di rete e per accedere) e il
# demone Homebrew (headless: `tailscale login` stampa un link da aprire da
# qualsiasi browser). Si sceglie quello che RISPONDE a `status` (demone su
# e dentro), non il primo file che esiste: il 22/09 l'app era installata da
# SSH senza schermo, quindi inerte, e avrebbe vinto solo per l'ordine.
HEADLESS='brew install tailscale && sudo tailscaled install-system-daemon && sudo tailscale set --operator="$USER" && tailscale login'
TS=""; TS_ANY=""
for c in "$(command -v tailscale || true)" /Applications/Tailscale.app/Contents/MacOS/Tailscale; do
  [ -n "$c" ] && [ -x "$c" ] || continue
  [ -n "$TS_ANY" ] || TS_ANY="$c"
  if "$c" status >/dev/null 2>&1; then TS="$c"; break; fi
done
URL=""
if [ -z "$TS" ]; then
  if [ -z "$TS_ANY" ]; then
    note "Tailscale non trovato. Senza schermo (SSH), dal terminale:"
  else
    note "Tailscale c'è ($TS_ANY) ma non risponde o non sei dentro."
    case "$TS_ANY" in
      /Applications/*) note "  È l'app: vuole lo schermo del Mac (approva l'estensione in Impostazioni di Sistema → Privacy e sicurezza, poi accedi)."
                       note "  Senza schermo usa il demone, dal terminale:" ;;
      *) note "  Il demone non è su o non sei dentro; dal terminale:" ;;
    esac
  fi
  note "  $HEADLESS"
  note "  (tailscale login stampa un link: aprilo da qualsiasi browser e accedi con Google)"
  note "Poi rilancia questo comando: il resto è già installato e non si ripete."
else
  {
    if "$TS" funnel --bg "$PORT" 2>&1 | sed 's/^/   /'; then
      HOSTN="$("$TS" status --json 2>/dev/null | "$PY" -c 'import sys,json; d=json.load(sys.stdin); print((d.get("Self") or {}).get("DNSName","").rstrip("."))' 2>/dev/null || true)"
      [ -n "$HOSTN" ] && URL="https://$HOSTN"
    fi
    if [ -z "$URL" ]; then
      note "⚠ Funnel non attivo. Di solito va ABILITATO una volta dalla console Tailscale:"
      note "  il comando qui sopra stampa il link (Access Controls → Funnel). Poi rilancia."
    else
      note "URL pubblico: $URL"
      if curl -fsS --max-time 15 "$URL/health" >/dev/null 2>&1; then note "raggiungibile da internet ✓"; else note "⚠ $URL/health non risponde ancora (il DNS può volerci un minuto)"; fi
    fi
  }
fi

# ── 5. Le righe per Vercel ───────────────────────────────────────────────────
say "Da incollare su Vercel → boum-roma → Settings → Environment Variables (Production), poi Redeploy:"
echo
"$PY" - "$URL" "$TOKEN" "$MODEL" "$VISION" <<'PYB'
import sys
url, token, model, vision = sys.argv[1:5]
print('LOCAL_AI_URL=' + (url or '<URL del Funnel: appare quando il tunnel è attivo>'))
print('LOCAL_AI_MODEL=' + model)
if vision: print('LOCAL_AI_VISION_MODEL=' + vision)
print('LOCAL_AI_TOKEN=' + token)
PYB
echo
note "Poi su Telegram: /ai → «🟢 Accendi il locale» → per ogni scopo il bottone fino a «shadow»."
note "Verifica dal Mac quando vuoi:  cd ~/boom-locale && $PY boom_locale.py --smoke"
note "Spegnere tutto: Telegram /ai → «Spegni il locale» (il cloud riprende da solo)."
