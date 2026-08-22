#!/bin/bash
# install_scatto_contatto.sh — LO SCATTO + IL CONTATTO sul Mac, in UN comando.
#
# Dal Mac mini (Terminal):
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/valentino11marzo-pixel/Boum-roma/main/bot/install_scatto_contatto.sh)"
#
# oppure, da un checkout del repo:  bash bot/install_scatto_contatto.sh
#
# Cosa fa (ed è SICURO rilanciarlo: aggiorna gli script, non tocca mai un
# .env esistente se non per aggiungere chiavi mancanti):
#   1. trova Python 3 (preferisce il 3.13 già usato dagli altri bracci)
#   2. installa playwright + chromium (se mancano)
#   3. RITROVA HOMIE_SECRET dai bracci già installati (publisher / wizard) —
#      lo chiede solo se non lo trova da nessuna parte
#   4. copia boom_scout.py / boom_contatto.py in ~/boom-scout e ~/boom-contatto
#   5. scrive i .env (senza sovrascrivere i tuoi valori)
#   6. installa i LaunchAgent (ogni 10' lo Scatto, ogni 5' il Contatto)
#   7. ti guida nei due --login (cookie portali; una volta sola)
#
# Regole d'oro invariate (bot/SCATTO_CONTATTO.md): il server pensa, il Mac
# esegue; captcha = STOP; ogni messaggio del Contatto parte SOLO da un tuo tap.

set -euo pipefail

RAW_BASE='https://raw.githubusercontent.com/valentino11marzo-pixel/Boum-roma/main/bot'
SCOUT_DIR="$HOME/boom-scout"
CONTATTO_DIR="$HOME/boom-contatto"
AGENTS_DIR="$HOME/Library/LaunchAgents"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n✗ %s\n' "$*" >&2; exit 1; }

# I prompt leggono da /dev/tty, così il copione funziona anche dentro
# `bash -c "$(curl …)"` dove stdin non è la tastiera.
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

say "LO SCATTO + IL CONTATTO — installazione"

# ── 1. Python ────────────────────────────────────────────────────────────────
PY=/Library/Frameworks/Python.framework/Versions/3.13/bin/python3
if [ ! -x "$PY" ]; then
  PY="$(command -v python3 || true)"
  [ -n "$PY" ] || die "Python 3 non trovato. Installa da python.org e rilancia."
  note "Python 3.13 pinnato assente — uso $PY"
fi
note "Python: $PY ($("$PY" -V 2>&1))"

# ── 2. Dipendenze ────────────────────────────────────────────────────────────
say "Dipendenze (playwright, requests, python-dotenv)…"
"$PY" -m pip install --quiet --disable-pip-version-check playwright requests python-dotenv
"$PY" -m playwright install chromium > /dev/null 2>&1 || "$PY" -m playwright install chromium
note "ok"

# ── 3. HOMIE_SECRET dai bracci esistenti ─────────────────────────────────────
find_secret() {
  local f
  for f in "$SCOUT_DIR/.env" "$CONTATTO_DIR/.env" \
           "$HOME/boom-publisher/.env" "$HOME/boom-listing-wizard/.env" \
           "$HOME/.boom/env"; do
    [ -f "$f" ] || continue
    local v
    v="$(sed -n 's/^HOMIE_SECRET=//p' "$f" | head -1 | tr -d '"' | tr -d "'")"
    if [ -n "$v" ]; then printf '%s' "$v"; return 0; fi
  done
  return 1
}
SECRET="$(find_secret || true)"
if [ -n "$SECRET" ]; then
  say "HOMIE_SECRET: ritrovato da un braccio già installato ✓ (non lo ristampo)"
else
  say "HOMIE_SECRET non trovato sul Mac."
  note "È lo stesso segreto degli altri bracci (variabile HOMIE_SECRET su Vercel)."
  ask "Incollalo qui" ""
  SECRET="$REPLY"
  [ -n "$SECRET" ] || die "Senza HOMIE_SECRET i bracci non possono parlare col server."
fi

# ── 4. Script (dal repo locale se ci siamo dentro, altrimenti da GitHub) ─────
say "Copio gli script…"
mkdir -p "$SCOUT_DIR" "$CONTATTO_DIR" "$AGENTS_DIR"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-/nonexistent}")" 2>/dev/null && pwd || true)"
fetch() { # fetch <nomefile> <destinazione>
  if [ -n "$SRC_DIR" ] && [ -f "$SRC_DIR/$1" ]; then
    cp "$SRC_DIR/$1" "$2"
  else
    curl -fsSL "$RAW_BASE/$1" -o "$2" || die "download di $1 fallito"
    [ "$(wc -c < "$2")" -gt 500 ] || die "$1 scaricato troppo corto — riprova"
  fi
}
fetch boom_scout.py    "$SCOUT_DIR/boom_scout.py"
fetch boom_contatto.py "$CONTATTO_DIR/boom_contatto.py"
note "boom_scout.py → $SCOUT_DIR"
note "boom_contatto.py → $CONTATTO_DIR"

# ── 5. .env — mai clobberare, solo completare ────────────────────────────────
ensure_env() { # ensure_env <file> <chiave> <valore>
  local f="$1" k="$2" v="$3"
  touch "$f"
  grep -q "^$k=" "$f" || printf '%s=%s\n' "$k" "$v" >> "$f"
}
ensure_env "$SCOUT_DIR/.env" HOMIE_SECRET "$SECRET"

ensure_env "$CONTATTO_DIR/.env" HOMIE_SECRET "$SECRET"
if ! grep -q '^BOOM_CONTACT_NAME=' "$CONTATTO_DIR/.env"; then
  say "Identità per i form dei portali (solo nei CAMPI del form, mai nel testo)"
  ask "Nome" "Valentino"
  ensure_env "$CONTATTO_DIR/.env" BOOM_CONTACT_NAME "$REPLY"
  ask "Email" ""
  ensure_env "$CONTATTO_DIR/.env" BOOM_CONTACT_EMAIL "$REPLY"
  ask "Telefono" ""
  ensure_env "$CONTATTO_DIR/.env" BOOM_CONTACT_PHONE "$REPLY"
fi

# ── 6. LaunchAgent (path Python e HOME reali, non quelli del repo) ───────────
say "Installo i LaunchAgent…"
write_plist() { # write_plist <label> <dir> <script> <argomento> <intervallo> <log>
  local label="$1" dir="$2" script="$3" arg="$4" every="$5" log="$6"
  cat > "$AGENTS_DIR/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$label</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PY</string>
        <string>$dir/$script</string>
        <string>$arg</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$dir</string>
    <key>StartInterval</key>
    <integer>$every</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$dir/$log.log</string>
    <key>StandardErrorPath</key>
    <string>$dir/$log.err.log</string>
</dict>
</plist>
PLIST
  launchctl unload "$AGENTS_DIR/$label.plist" 2>/dev/null || true
  launchctl load "$AGENTS_DIR/$label.plist"
  note "$label · ogni $((every/60))′ ✓"
}
write_plist com.boom.scout    "$SCOUT_DIR"    boom_scout.py    --once 600 scout
write_plist com.boom.contatto "$CONTATTO_DIR" boom_contatto.py --run  300 contatto

# ── 7. I due login (una volta sola; i cookie restano nei profili) ────────────
say "Login sui portali (si apre un browser; accetta cookie / entra e chiudilo)"
ask "Apro il browser per LO SCATTO? [s/n]" "s"
if [ "$REPLY" = "s" ] || [ "$REPLY" = "S" ]; then
  (cd "$SCOUT_DIR" && "$PY" boom_scout.py --login) || note "⚠ login Scatto saltato — rifallo con: cd ~/boom-scout && $PY boom_scout.py --login"
fi
ask "Apro il browser per IL CONTATTO (serve l'account del portale)? [s/n]" "s"
if [ "$REPLY" = "s" ] || [ "$REPLY" = "S" ]; then
  (cd "$CONTATTO_DIR" && "$PY" boom_contatto.py --login) || note "⚠ login Contatto saltato — rifallo con: cd ~/boom-contatto && $PY boom_contatto.py --login"
fi

# ── Fine ─────────────────────────────────────────────────────────────────────
say "FATTO. Verifica:"
launchctl list 2>/dev/null | grep com.boom | sed 's/^/   /' || true
note ""
note "Entro ~10 minuti le chip «Occhi Homie» e «Contatto» in /pfs-command"
note "diventano verdi. Log: ~/boom-scout/scout.log · ~/boom-contatto/contatto.log"
note "Kill switch del Contatto: Firestore settings/outreach → { enabled: false }"
note "Portale bloccato in headless? BOOM_SCOUT_HEADED=1 in ~/boom-scout/.env"
