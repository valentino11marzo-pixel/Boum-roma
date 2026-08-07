# MAGIC SIGN — Audit totale (2026-07-31)

Analisi riga-per-riga di sign.html, api/magic-sign/*, api/sign/* e dei
percorsi contratto dentro il portal (supera l'audit di aprile, che copriva
il vecchio flusso in-portal). Ogni claim è verificato sul codice.
Stato: Fase 0 (blindatura) ESEGUITA in questa stessa sessione.

## FALLE CRITICHE (integrità legale)

**F1 · Nessun congelamento dei termini tra le due firme.**
lookup restituisce canone/date LIVE dal documento; submit non salva alcuno
snapshot; nel repo non esiste `termsHash`/`signedTerms`. Se l'admin modifica
canone o date dopo la firma dell'inquilino, il locatore controfirma
condizioni DIVERSE senza alcuna traccia — e la firma dell'inquilino resta
attaccata al nuovo testo. Aggrava: `updateContract` (portal) non ha alcuna
guardia su `signatureStatus` (modifica consentita anche su `complete`), e
`renewContract` MUTA lo stesso documento (endDate/canone cambiati SOTTO le
firme originali, nessun nuovo giro di firma).
→ Fix: snapshot `signedTerms` + hash alla PRIMA firma; la seconda firma
verifica e rifiuta con `409 terms_changed`; portal blocca l'edit su
contratti firmati/parziali; il rinnovo diventa un CLONE con nuove firme.

**F2 · Race sullo stesso ruolo.** Il controllo "già firmato" è
read-then-write senza precondizione: due POST simultanei passano entrambi e
il secondo sovrascrive firma/IP/timestamp del primo.
→ Fix: precondizione `currentDocument.updateTime` sul patch della firma.

**F3 · Il ramo "già firmato" è codice morto.** Il token viene AZZERATO alla
firma, quindi chi riapre il proprio link non vede "Hai già firmato ✓" (ramo
che esiste in sign.html ma non riceve mai dati): vede "Link not valid".
UX punitiva e telefonate evitabili.
→ Fix: il token non si azzera più; si stampa `SignTokenUsedAt` e lookup
risponde con lo stato firmato (data + prossimi passi).

**F4 · Modal di firma legacy nel portal.** Scrive le firme DIRETTAMENTE su
Firestore client-side: niente certificato FES, niente contratto-firmato,
niente email locatore, niente `finalizedAt` (nasce il chip "⚠ Da
rifinire"). Raggiungibile solo su contratti senza token, MA il gate
`canLandlordSign` include `isAdmin()`: un admin può firmare AL POSTO delle
parti. → Fix: mai firma d'ufficio; il percorso legacy va spento (redirect
al link /sign, che già avviene quando il token esiste).

**F5 · Rigenera-PDF post-firma fa divergere le copie.** `generatedPDF` e
`pdfHash` vengono sovrascritti mentre `contratto-firmato.pdf` resta
congelato: gli allegati e il certificato citano un hash che non corrisponde
più. → Fix: rigenerazione bloccata su contratti `complete`.

**F6 · Email non verificata come identità.** `users.email` viene seminata
da `signerEmail` del body (non verificato) — ed è l'indirizzo a cui parte
il magic-link 72h del portale. → Fix: mai sovrascrivere un'email esistente;
fill solo se vuota.

**F7 · Il server non esige l'identità.** submit valida solo firma+consenso:
un POST diretto salta anagrafica e OTP. CF validato solo client-side.
→ Fix: checksum CF server-side quando presente.

**F8 · finalize fallisce in silenzio.** Contratto `complete` senza
certificato/email, recupero solo manuale (refinalize). → Fix: watchdog nel
reminder-cron che ritenta i `complete` senza `finalizedAt`.

## FALLE DI PROTOCOLLO / MINORI

- **Share Hub bypassa il sequenziale**: offre il link firma del locatore
  anche PRIMA della firma dell'inquilino (il server lo blocca via
  send-link, ma il link copiato via WhatsApp no). → nascosto finché non
  tocca a lui.
- **Zero tracciamento aperture**: nessuno sa se il cliente ha APERTO il
  link (né viewedAt né ping). → lookup logga la prima apertura + Telegram.
- **Token fallback client deboli** (`'tk-'+Date.now()+Math.random`) in due
  punti del portal (i token server sono UUID a 122 bit, non enumerabili).
  → crypto.getRandomValues.
- **depositPayToken non monouso** e visibile nella query del cancel_url.
- **Rate limit per-istanza** (Map in memoria warm): regge SOLO grazie
  all'entropia dei token; da sapere.
- **Pagina /sign solo inglese**: il locatore italiano riceve l'email in
  italiano ("Tocca a Lei") e atterra su una pagina interamente EN.
  → toggle IT/EN come /scheda, default per ruolo.

## OCCASIONI PERSE (prodotto)

1. **Magic Sign universale** — la rotaia ESISTE GIÀ (scoperta in audit):
   `api/sign/custom/*` + collection `signRequests` firmano un PDF
   arbitrario con campi posizionati ed embedding server-side (creazione
   via `api/agent/magicsign.create.js`, UI nel portal; v.
   MAGIC_SIGN_REDESIGN.md). L'occasione vera è il PACKAGING: template
   one-tap per verbale consegna chiavi + inventario, addendum, disdetta,
   delega ARPE, mandato — la rotaia c'è ma non ha ancora prodotti sopra.
2. **Co-firma multi-conduttore** (APPROVATA — in costruzione): due o più
   conduttori firmano davvero, co-intestatari su contratto e certificato;
   il locatore riceve il suo link quando TUTTI hanno firmato.
3. **Marca temporale RFC3161** sull'hash del contratto firmato: evidenza
   FES molto più forte a costo ~zero.
4. **OTP come fattore probatorio**: l'OTP telefonico ESISTE già nel flusso
   ma il server non lo esige — enforced, avvicina la firma alla FEA.
5. **Funnel operativo**: invitato → aperto → firmato con i tempi, nel
   portal e su Telegram ("ha aperto il contratto ora").
6. **Rinnovo come prodotto**: bottone che clona il contratto con nuovi
   termini e fa ripartire il giro di firme (oggi: mutazione in place).

## ROADMAP

- **Fase 0 — Blindatura**: ✅ ESEGUITA (2026-07-31, stessa sessione).
  F1 terms-freeze (signedTermsHash/signedTerms alla prima firma, 409
  terms_changed + ping urgente sulla controfirma; guardia edit nel
  portal; rinnovo di un contratto firmato = CLONE con nuovo giro di
  firme), F2 write condizionato (currentDocument.updateTime), F3 token
  che sopravvive (SignTokenUsedAt, lookup 410 "già firmato" vivo), F4
  niente firma d'ufficio dell'admin, F5 blocco rigenera-PDF su complete,
  F6 email fill-only, F8 watchdog refinalize nel reminder-cron, Share
  Hub sequenziale, prima apertura tracciata (signViewed<Role>At + ping
  Telegram 👀). Test: notify 50→60.
- **Fase 1 — Co-firma multi-conduttore** (approvata, prossima).
- **Fase 2 — Prodotti sulla rotaia Custom** (template one-tap).
- **Fase 3 — Rafforzamento probatorio**: marca temporale RFC3161, OTP
  enforced, pagina IT/EN.
