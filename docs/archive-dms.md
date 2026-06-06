# BOOM — Archivio Documentale (DMS)

Single source of truth per ogni documento prodotto o caricato nel portale.
Obiettivo: trovare qualunque documento in pochi secondi e poterne elaborare i
dati, senza più "scarica e dimentica".

## Il problema che risolve

Prima, i documenti vivevano in 4 silos scollegati:

1. **Generatore Template & Modulistica** (`portal.html` → `templatesPage` /
   `generateTemplatePDF`): 22 documenti bilingue IT/EN, ma il PDF finiva solo in
   `doc.save()` → scaricato sul Mac, mai archiviato, non più ritrovabile.
2. **Documenti caricati** (`documents` collection): upload manuali per-utente.
3. **Contratti** (`contracts` collection): Allegato B/C CAF verbatim, PDF su
   Storage (`generatedPDF`), workflow registrazione in `burocrazia`.
4. **Bozze RLI** (`rli_draft` in `documents`): già auto-archiviate da Magic Sign.

L'Archivio unifica tutto sopra la collection `documents`, più una vista
read-only dei `contracts`.

## Flusso

```
Operatore apre Template → compila → "Genera PDF"
  → generateTemplatePDF()
      → archiveGeneratedPDF(doc, {type, title, ref, data})   ① archivia
          → Storage:  documents/archive/<type>/<ref>.pdf
          → Firestore: documents/<id>  (record indicizzato, vedi schema)
      → doc.save(filename)                                    ② scarica copia locale
  → compare in: Archivio (admin) + portale della controparte (se assegnato)
```

L'archiviazione è **best-effort**: se Storage/Firestore falliscono, il download
locale avviene comunque e l'operatore viene avvisato (toast "non archiviato").

## Schema record `documents` (documenti generati)

| Campo | Tipo | Note |
|---|---|---|
| `name` | string | `"<Titolo> — <Soggetto>"` |
| `type` | string | bucket legacy: `contract` \| `receipt` \| `id` \| `utility` \| `other` (compreso dai filtri esistenti) |
| `category` | string | categoria ricca: `locazione` \| `ricevuta` \| `servizio` \| `gestione` \| `verbale` \| `proposta` \| `incarico` |
| `source` | string | `generated` \| `upload` \| `contract` (sintetico) |
| `templateType` | string | tipo template d'origine (es. `rental_transitorio`) |
| `refCode` | string | codice `Rif:` già stampato sul PDF (es. `RENTALTRANSITORIO-AB12CD`) |
| `lang` | string | `IT` \| `EN` (lingua di generazione) |
| `version` | number | 1 (riservato a versioning futuro) |
| `hash` | string | SHA-256/16 di `ref|type|subject|size` — sigillo anti-manomissione |
| `userId` | string\|null | controparte primaria (vedi *Visibilità*) |
| `clientId` / `tenantId` / `landlordId` / `propertyId` | string\|null | link alle entità |
| `shared` | bool | true → visibile a tutti gli utenti collegati all'immobile |
| `fileUrl` / `fileName` / `fileSize` | — | PDF su Storage |
| `uploadedBy` | string | id operatore |
| `createdAt` | Timestamp | server |

## Visibilità (ACL) — `resolveDocAudience(type, data)`

Derivata dai record che l'operatore **seleziona** al momento della generazione:

- **Inquilino scelto dal menu** (`tenantId`/`payerId`) → `userId = tenant`. Se è
  un contratto (presenti anche `landlordId` + `propertyId`) → `shared = true`,
  così il **proprietario** lo vede per corrispondenza immobile.
- **Solo proprietario scelto** (`landlordId`) → `userId = landlord`.
- **Nome digitato a mano** (lead / una-tantum, nessun id) → **solo-admin**.
- **Servizi PFS/DAS/VV** (solo `clientId` CRM, no utente portale) → **solo-admin**.

La distribuzione ai portali landlord/tenant riusa il pipeline esistente
(`getMyDocuments`): nessuna modifica a `myDocumentsPage`. L'operatore può sempre
ri-assegnare o condividere a posteriori via `editDocModal`.

## Vista Archivio (`documentsPage`)

Unisce `documents` (upload + generati) + `contracts` con `generatedPDF`
(read-only). Ricerca testuale (nome, persona, immobile, rif, categoria) e filtri
per provenienza/tipo: **Generati**, **Contratti**, Ricevute, ID, Utenze,
Condivisi, Deal Archive. Export CSV con provenienza/rif/lingua.

## Roadmap (fasi successive)

- **Versioning reale** (`version` + storico) e firma/lock dei documenti finali.
- **Template come dati**: estrarre i 22 corpi da `generateTemplatePDF` in una
  collection `templates` versionata, con editor — niente più testo nel codice.
- **Ricerca/estrazione AI**: indicizzare i PDF e interrogarli via Claude
  (`/api/parse-docs`) — es. "estrai canone e scadenza di tutti i transitori 2025".
- **Aggancio Homie**: l'agente (`api/agent/contracts.draft.js`) può scrivere
  documenti direttamente in archivio con lo stesso schema.
