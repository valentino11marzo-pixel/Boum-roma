---
name: desk-case
description: Run a PAID city-desk engagement end to end (Application Pack or Full Search on /madrid, /barcelona, /valencia, /amsterdam, /london, /milan, /paris, /berlin) — a client sends a listing, a draft lease, a landlord's reply, or is about to sign and pay. Produces the contract review, the corrected lease and the email for the landlord, the client email + WhatsApp, the three checks before paying, the handover inventory (Anexo I) and the after-move-in list. Use when the user says a desk client needs a reply, a lease check, "can he sign?", or "prepare the pack for <file BM …>".
---

# A paid desk case, from the first document to the keys

Built from the first paid case (Madrid, 6–15 November 2026: Application Pack → Full Search upgrade → a lease signed in nine days). The reusable pieces are in `tools/desk-kit/` (outside the deploy). **Nothing personal lives in the repo**: names, IDs, passports, IBANs, addresses, emails and the client's documents stay in the session scratchpad and in Gmail. The kit holds structure and wording only, with fictitious sample data.

## 0 · Ground rules
- **Lead with the decision.** First line = what the client should do now (sign / don't sign / send this). The first long email of the first case missed that the client was already printing the lease. Ask "where are they in the process right now?" before writing anything.
- **Say what is checked and what is not.** Asking rents are not signed rents. A law read from a commentary is not a law read from the official gazette (BOE, legislation.gov.uk… are often unreachable from the sandbox: say so, and mark the sentence as unverified in the note to the operator).
- **We work for the tenant, never for the landlord** (the desk's must-state). The landlord-facing document carries no BOOM brand: it is the tenant's proposal, sent by the tenant from their own email, in the landlord's language.
- **Ask the landlord only what is legitimate and proportionate**: what the law gives the tenant, or what protects money about to move. Few asks → a fast yes.
- **Never promise a result, a date of reply by the landlord, or a legal opinion.** The promise the desk prints is its hours (Mon–Fri, desk time) and "within one working day" for our own reading.
- **The operator sends.** Prepare a one-click Gmail draft (only when asked), the WhatsApp text and the files. Never send, never create a draft the user did not ask for.
- Spell the client's name as on the passport, everywhere (the first case had two spellings in two documents).

## 1 · Intake (five minutes, before any document)
Read the order: `leads/svc_<session>` (portal → Leads, or the operator's order email): file number `BM XXXXX`, plan, `startNow`, desk, what was paid, the upgrade credit (`/upgrade BM XXXXX` on the bot). Then collect, in one message, only what is missing:
- who will live there (people, pets), move-in date and the date the current place ends;
- budget ceiling, furnished or not, work address or commute anchor;
- the listing URL(s), the landlord's or agent's name as it will appear on the lease, the draft lease (PDF or Word), every message the landlord sent about money or dates;
- income documents the client can show (contract, payslips, employer letter) — to know what a landlord may ask, not to store them.

What each plan buys (never over-deliver silently; say when something is outside the plan):
- **Application Pack**: the local-format dossier, cover letter, income/guarantor strategy, contract review before signing.
- **Full Search**: the search every working day, applications, one attended viewing (desk rules differ: see `cities/<slug>.json`), negotiation, the checks of that desk, contract check before signing. Runs until they sign or stop.
- The pack fee is credited in full towards Full Search (policy since 12/11/2026, `api/_upgrade.js`): the client's order email carries the personal link.

## 2 · Is the place real, and is the price fair?
- **Use**: the cadastral / land-registry "use" must be a dwelling. A "local" or office sold as a flat is a no (first case: one listing was a ground-floor commercial unit).
- **Price**: 8+ comparable ASKING rents (same area, rooms ±0, size ±20%), the median, and where this one sits. Write "asking, not signed", list the sample size and the date.
- **Who is the landlord**: a person or a company; the company's registry trace; a brand-new email or bank account is a flag, not a verdict.
- Red flags that stop everything: payment before a signed lease, an account whose holder is not the owner, a change of account by email, pressure to sign today.

## 3 · The lease review
Read the draft word by word against the checklist of the country:
- Spain: `tools/desk-kit/lease-checklist-es.md` (LAU; the clauses the first case turned on).
- Other desks: start from that desk's own `checks` in `cities/<slug>.json` (the rules the page already states, with their legal labels) and from `cities/_hub.json rules.hold` (rows still waiting for counsel — never state those as settled). Write a checklist file for the country in `tools/desk-kit/` the first time, so the second case is faster.

Output, in this order:
1. **Verdict** in one sentence (take it / take it corrected / don't).
2. **The essential corrections — six at most.** Each one tied to a law or to money, each with the clause number, the current text, the text we propose. Rule for the client: *if one is refused, don't sign*.
3. **Small things of law** (deposit lodged with the public body, return within the legal term, repairs as the law says, taxes from the right year).
4. **What we leave alone and why**: outdated clauses that cannot hurt this tenant (often void by law anyway). Fewer changes = faster yes.
5. The corrected lease in two forms: redline PDF (for the landlord to see) and clean Word (to sign).

## 4 · The messages
Templates in `tools/desk-kit/templates/`:
- `client-email-en.md` — verdict first, then price, lease, before-you-pay, today's three actions, the plan with dates and the exact amounts.
- `client-whatsapp-en.md` — five lines: verdict, what is in the inbox, the one thing not to do (transfer money).
- `landlord-email-es.md` — polite, numbered, each ask one line; the documents we need before paying; a proposed day and time.
- When the landlord answers: diff his version against ours **word by word** (`wdiff`-style, not by eye), then: what he accepted, what he narrowed (and whether it matters), what to fix **by hand at the table** (date, leftovers, contact details, singular/plural), so no new version is needed.

## 5 · Before any money moves — three checks
`tools/desk-kit/templates/before-you-pay-en.md`. No transfer until all three are done:
1. **Ownership**: the land-registry extract shows the landlord (person or company) as owner, no seizures. Spain: *nota simple* at sede.registradores.org — it needs identification (Cl@ve / eIDAS "Ciudadano UE", or a Spanish certificate): if the operator cannot get it, the landlord provides a recent one or the client orders it. Catastro (use, floor, size) is public without login.
2. **Authority**: who signs can sign — ID equal to the title, or for a company the deed page / commercial-registry extract naming the administrator.
3. **The account**: a bank certificate with the holder = the owner and exactly the IBAN in the lease; a phone call to the landlord to read the IBAN aloud; the payee name the client's bank shows. Never accept a change of account by email.

## 6 · Signing day and payment
- Compare every printed page with the agreed PDF, **including the IBAN**. Hand corrections on both copies, both initial. Both sign every page. Real date.
- If the lease says the landlord "has received" the money, signing and paying are one act: pay at the table, after the checks, by transfer from the client's own account, never cash. Separate transfers with their own reference (deposit · extra guarantee · first rent pro rata). Instant transfers if available; check the daily limit the day before.

## 7 · Keys: the inventory
`python3 tools/desk-kit/anexo_inventario.py <case.json> <out.pdf>` builds the one-page handover inventory (rooms, defects, photo numbers, meters, keys, energy certificate, utilities holders, signatures). `tools/desk-kit/sample-case.json` shows the fields (fictitious). Room by room with dated photos; both sign; the tenant emails the photos to the landlord the same day. The PDF is small and deterministic on purpose: a Gmail draft attachment travels as base64, and a long one gets corrupted (verify the sha256 of the RAW draft after attaching).

## 8 · After move-in, and closing the case
`tools/desk-kit/templates/after-move-in-en.md`: utilities in the tenant's name with the meter readings, home insurance with liability, the receipt of the deposit lodged with the public body, town-hall registration, how to give notice and the earliest exit date, the rent due date.
Then, for the operator:
- the invoice(s) from Egidi Immobiliare S.r.l. for what was paid (pack and upgrade are two payments);
- ask for a Google review and for permission to quote one sentence (never a name without it);
- note in the lead what happened (signed where, when, rent) — in the portal, not in the repo;
- what was new in this case goes back into the kit: a clause, a check, a wording that worked.

## 9 · Files and naming
`BOOM_<FILE>_<n>_<slug>.pdf` for documents to the client (numbered across the whole file, so "document 5" means one thing); landlord-facing files carry no BOOM name. Everything is generated in the scratchpad; the repo gets only kit improvements.
