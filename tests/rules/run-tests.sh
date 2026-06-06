#!/usr/bin/env bash
set -e
cp ../../firestore.rules ./firestore.rules
firebase emulators:exec --only firestore --project demo-boom-rules 'node runner.mjs'
