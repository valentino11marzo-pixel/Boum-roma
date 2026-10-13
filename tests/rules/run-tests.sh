#!/usr/bin/env bash
set -e
cp ../../firestore.rules ./firestore.rules
# L'emulatore Storage legge le regole solo dentro la cartella del progetto:
# la copia è temporanea (non va nel repo) e sparisce all'uscita.
cp ../../storage.rules ./storage.rules
trap 'rm -f ./storage.rules' EXIT
firebase emulators:exec --only firestore --project demo-boom-rules 'node runner.mjs'
firebase emulators:exec --only firestore,storage --project demo-boom-rules 'node storage.mjs'
