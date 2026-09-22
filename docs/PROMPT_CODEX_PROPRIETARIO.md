# Prompt d'apertura per Codex — «L'Archivio del Proprietario», Lotto P0

*Da incollare in una chat NUOVA di Codex aperta sul repo
`valentino11marzo-pixel/Boum-roma`, ramo di partenza
`claude/amazing-darwin-rdl1q0` (o `main` dopo il merge).*

---

Lavori nel repo BOOM Roma insieme a Claude, su una sessione condivisa il cui
unico canale è il file `STUDIO_ARCHIVIO_PROPRIETARIO_2026-09.md`. Prima di
tutto leggi `AGENTS.md`, poi lo studio per intero, poi in `CLAUDE.md` le
sezioni «Portals (logged-in surfaces)», «Fascicolo operativo immobile»,
«Rendiconto proprietario», «Il ciclo email del contratto» e «Conventions».

## Il tuo compito ora: Lotto P0 — il confronto. NIENTE codice.

1. **Verifica la misura** (§1, M1–M10): apri ogni riferimento e conferma o
   smentisci. Se un fatto è sbagliato, correggilo nella tabella con la prova
   (file:riga). Aggiungi ciò che manca: in particolare cerca altri punti in
   cui il ruolo `landlord` vede un bottone che le rules o il codice
   rifiutano in silenzio (come M4).
2. **Rispondi a D1–D7** (§8) sotto ogni domanda, con motivo. D7 è
   obbligatoria: almeno un'obiezione concreta allo studio. Se pensi che
   l'architettura del §3 sia sbagliata, proponi l'alternativa e dì cosa
   costa.
3. **Proponi l'interfaccia** fra P1 e P2: la firma di `build()` del motore e
   la forma della risposta di `GET /api/owner/archivio` (JSON d'esempio con
   dati sintetici). Scrivila nel §9 come voce `interfaccia`.
4. **Registra** nel §9 (append-only) cosa hai fatto, cosa contesti, cosa
   aspetti da Claude.

Ramo: `codex/archivio-proprietario-p0`. Tocchi SOLO lo studio. PR verso
`main` con titolo «Archivio proprietario — P0: confronto di Codex»; nella
descrizione le obiezioni principali in tre righe. Claude la rivede e
risponde nel §9; Valentino decide le domande marcate per lui (D4, D6) e
unisce.

## Dopo il P0

Quando lo studio è unito, il tuo lotto successivo è il **P2 — La porta**
(`api/owner/*`), che parte solo dopo che l'interfaccia del §9 è marcata
`decisione` da entrambi. Il P4 (ritiro di `owner-dashboard.html`) viene
dopo il P3 di Claude. Non anticipare lotti: un conflitto di perimetro è un
errore, fermati e scrivilo nel §9.

Regole di sempre: mai inventare (un dato che non trovi è «non misurato»),
nessun segreto nel codice o nei log, non fare merge, non pushare su `main`.
