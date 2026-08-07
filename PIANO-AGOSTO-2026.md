# BOOM · Piano Operativo Agosto 2026 — v2 (aggiornato al 7 agosto)

**Il documento di rotta della finestra di definizione (1–20 agosto).**
La v1 (14 luglio) è nella history di git. Questa versione parte dalla
retrospettiva di quello che è successo davvero — 350 commit su main tra il
14 luglio e il 7 agosto — e ridisegna i giorni rimanenti (~13) su ciò che
conta adesso.

Il principio non cambia:

> **Portale e agenzia allo stesso livello.** Ogni casa su BOOM è verificata,
> vera, sincera. Il cliente paga volentieri perché il problema sparisce.
> Artigianale non vuol dire lento: vuol dire che niente esce senza cura.

---

## 0 · Retrospettiva onesta (14 luglio → 7 agosto)

Il piano v1 prevedeva quattro fasi. La realtà le ha in parte superate, in
parte ignorate. Fase per fase:

### Fase 1 «Chiudere» — ✅ in gran parte fatta, per un'altra strada
- Redesign detail/discovery **andato live** (PR #119–#125), pagina annuncio
  che chiude (slot visita reali, fit personale), Safari/spinner risolto,
  portale splittato (shell 50KB), SW v10, auth unificata su /login.
- **Nato quello che non era previsto e vale di più**: CI su GitHub + **48
  suite di test che passano** (soldi idempotenti, rules su emulatore, smoke
  auth). "Nessun test automatico" non è più vero: è il salto di
  professionalità più grande del mese.
- ❌ Non fatto: pruning delle preview (ancora 34 pagine), PFS portal v1.

### Fase 2 «Manuale Operativo» — ⚠️ trasformata, non scritta
Il manuale su carta non esiste. Al suo posto è nata **La Squadra**: i
dipendenti AI dentro il portale (Contabile, Gestore, Commerciale, poi
Perito, Pubblicista, Regista, Smistatore, Recupero, Lead Brain) con console
/team, confini dichiarati e test dedicati. È l'organigramma della Struttura
**incarnato in software** — più di quanto il piano chiedesse. Ma la parte
scritta resta necessaria: i processi che collegano Squadra + umano (chi
approva cosa, SLA, cosa fare quando un agente sbaglia) vivono ancora solo
nella tua testa.

### Fase 3 «Playbook Città» — ✅ superata dai fatti
**La Réunion è il secondo mercato reale**: landing bilingue, tre percorsi
(affitto/gestione/acquisto con la linea rossa della carte T), SEO/GEO
dedicata, la macchina romana che sa tacere fuori dal suo continente. Il
playbook scritto non c'è, ma l'esperimento vivo vale di più: quando sarà il
momento della terza città, si estrae il playbook DA La Réunion.

### Fase 4 «Campagna e Brand» — ⚠️ armata, non sparata
- **Prodotti con nome: fatto oltre le attese.** Canone via BOOM, La Scheda,
  Fascicolo Fiscale, Pack Registrazione, la 1590 Letter, Deposit Recovery
  (€99), Contract Check Express (€49), Pacchetto Concordato, Remote Move
  Pack — più tutta La Squadra.
- **Università: email PRONTE** con contatti verificati
  (`docs/outreach-settembre-2026.md`) — ma **non ancora inviate**. È l'unica
  cosa con scadenza esterna: gli uffici decidono ORA le liste di settembre.
- Recensioni Google collegate, partner in pipeline, percorsi di vendita dei
  servizi riparati (l'audit ha scoperto che /canone era orfana e i Services
  2.0 non avevano MAI venduto — non per prezzo, per percorsi).

### I numeri veri (audit 2 agosto, `docs/audit-2026-08.md`)
€15.232 incassati su Stripe in totale; **luglio 2026 da solo €7.732 — 5,5×**
la media dei nove mesi precedenti. Il motore: PFS €350 (22 vendite, 22%
conversione) + pre-agreement (5 pagati a luglio). La macchina ha svoltato,
e la svolta ha un nome: i contratti.

### Quello che NON è successo (i tre buchi)
1. **Il livello strategico non è mai andato in produzione**: Protocollo,
   Struttura, piano e ponte Homie⇄Claude sono rimasti su questo branch.
2. **Homie è ancora sentinella**: 2.718 heartbeat e zero azioni negli ultimi
   7 giorni. Il ponte contesto non è mai stato acceso (mai deployato).
3. **Il manuale scritto** — vedi Fase 2.

---

## 1 · I giorni rimanenti (7 → 20 agosto)

Cinque mosse, in ordine. Niente sistemi nuovi: la Squadra basta e avanza.

### Mossa 1 — Mergiare il livello strategico (oggi, 30 minuti)
Questo branch è aggiornato su main (348 commit assorbiti, 48/48 suite
verdi). Il merge porta in produzione: Protocollo + Struttura dentro
CLAUDE.md (ogni sessione futura li eredita), il ponte `context.push`/
`context.pack`, e questo piano.

### Mossa 2 — Inviare le email università (8–9 agosto, poi 1h/giorno)
`docs/outreach-settembre-2026.md`: AUR e LUISS hanno indirizzi verificati —
si parte da lì; JCU e IES dopo la conferma indirizzo (10 minuti). LUISS ha
già partner housing: non chiedi un rapporto nuovo, chiedi di entrare in una
lista che esiste. Follow-up quotidiano fino a fine mese.

### Mossa 3 — Accendere Homie (10–12 agosto)
Setup dal `docs/homie-claude-bridge.md` (10 minuti sul Mac): cron serale
`context.push` + comando Telegram "context pack". Poi, in ordine di valore:
messaggi WhatsApp → Inbox (`/api/homie/message`), lead automatici
(`leads.create`), proposte tier 2. La Squadra lavora DENTRO il portale;
Homie è l'unico che vede WhatsApp — finché tace, il canale più caldo
d'Italia resta fuori dalla macchina.

### Mossa 4 — Scrivere il Manuale Operativo, versione 2026 (13–17 agosto)
Più facile di un mese fa: metà dei processi ORA È la Squadra. Per ognuno dei
9 processi (lead, viewing, deal, firma, verifica casa, PFS, fiscale, tenant
care, rituali): una pagina — trigger → chi agisce (umano / Squadra / Homie
tier 1/2) → SLA → cosa fare quando fallisce. Assegnare ogni dipendente AI
al suo desk della Struttura. Output: `docs/manuale-operativo.md`.

### Mossa 5 — Igiene e chiusura (18–20 agosto)
- Pruning delle 34 `preview-*` (la decisione design è già stata presa dai
  fatti: sono live le pagine nuove — le preview sono residui).
- Retrospettiva finale: aggiornare questo file, scrivere il piano di
  settembre in UNA pagina (settembre = arrivi: campagna + conversione,
  zero cantieri).

**Fuori scope fino a settembre**: terza città, nuovi servizi, nuovi agenti.

---

## 2 · Metriche (aggiornate ai numeri veri)

Da guardare ogni lunedì:

- **North Star: € incassati/mese** (luglio: €7.732 — battere luglio ad
  agosto/settembre) e **tempo mediano lead→firma**
- **Supply: nuove case verificate/mese**
- **Pipeline: lead qualificati/settimana per fonte** — e da Mossa 3 in poi:
  quanti arrivano da WhatsApp/Homie (oggi: zero)
- **Partner: risposte università** (target: 3 uffici in lista entro il 15/9)
- **Qualità: % deal senza problemi post-firma**

---

## 3 · Le regole d'oro del mese (invariate)

1. **Chiudere batte iniziare.**
2. **Una decisione al giorno, per iscritto.**
3. **Le università non aspettano** — un'ora al giorno, ogni giorno.
4. **Nessun sistema nuovo.** Le idee si parcheggiano qui sotto e si
   rileggono il 1° settembre.
5. **La verifica di persona non si delega e non si salta. È il prodotto.**
6. **Scrivere tutto come se domani dovessi formare qualcuno.**

---

## 4 · Parcheggio idee (riaprire a settembre)

- Tenant Passport (dallo studio servizi: il sì rimandato)
- Playbook città estratto da La Réunion
- PFS portal v1 (8 stadi passwordless)

---

*v2 — 7 agosto 2026, branch `claude/boum-operational-planning-i1fi2m`,
dopo merge di main (350 commit) e suite completa verde (48/48). Fonti:
git log, `docs/audit-2026-08.md`, `docs/outreach-settembre-2026.md`, log
di produzione Vercel. Prossimo aggiornamento: retrospettiva del 20 agosto.*
