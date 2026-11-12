# Desk kit — the reusable pieces of a paid desk case

The playbook is the skill `.claude/skills/desk-case/SKILL.md`. This folder holds what the playbook points to. It is outside the deploy (`/tools/` and every `*.md` are in `.vercelignore`).

**No personal data here, ever.** A client's name, ID, passport, IBAN, address, email or documents stay in the session scratchpad and in Gmail. The sample data is fictitious.

| File | What it is |
|---|---|
| `lease-checklist-es.md` | Spain (LAU): what to read in a residential lease, clause by clause, and what to ask |
| `anexo_inventario.py` | The one-page handover inventory (Anexo I), built from a small JSON. Spanish and English labels |
| `sample-case.json` | The fields the generator reads, with fictitious values |
| `templates/client-email-en.md` | The review email to the client: verdict first |
| `templates/client-whatsapp-en.md` | The five-line WhatsApp that goes with it |
| `templates/landlord-email-es.md` | The tenant's email to the landlord, in Spanish: corrections + documents before paying |
| `templates/before-you-pay-en.md` | The three checks, the signing table, the transfers |
| `templates/after-move-in-en.md` | The first weeks in the flat, and how to leave |

## The inventory generator
```
python3 tools/desk-kit/anexo_inventario.py tools/desk-kit/sample-case.json /tmp/anexo.pdf
```
Needs `reportlab` (`pip install reportlab`). One A4 page, compressed and deterministic (same input → same bytes), so it can travel as a small email attachment. Fields: see `sample-case.json`; `lang` is `es` or `en`; `rooms` replaces the default list when the flat is not a standard two-bedroom.

## Adding a country
The first case was Madrid, so the checklist and the landlord email are Spanish. For another desk: start from that desk's `checks` in `cities/<slug>.json` and from the held rows in `cities/_hub.json` (`rules.hold`: not settled, never state them as law), write `lease-checklist-<cc>.md` and `templates/landlord-email-<cc>.md` during the first case there, and add the label set to `LABELS` in the generator.
