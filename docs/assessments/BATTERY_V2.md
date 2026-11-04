# Assessment battery — format `battery-v2`

Status: **implemented and tested with synthetic data. Not validated. No real content is in this repository.**

## What it is

A battery is one timed assessment (600 seconds, server-enforced) made of sections. Each section holds items; a shared workbook sits alongside. The format is chosen by `question_payload.format = "battery-v2"`. The original v1 format (five MCQs, three discrepancies) still works and is unchanged.

Item types:

| Type | Candidate action | Graded by |
|---|---|---|
| `single` | choose one option | exact option id |
| `multi` | choose all correct options | exact set match (no partial credit) |
| `text` | type a short answer | normalised text (case and spacing ignored) |
| `cell` | enter a formula or value in a workbook cell | server-evaluated cell value, with tolerance |

Every item has `category`: `knowledge` (scored out of 40) or `reconciliation` (out of 60; the name is kept for the existing results table and covers all practical workbook items). Overall score = knowledge + reconciliation, out of 100. Pass threshold: `scoring_key.pass_percent` (default 75). This threshold was supplied by the client, not validated.

## Workbook (sheets)

- A battery may declare `workbook.sheets` (1–4 tabs), each `{name, writable}`. Without `sheets`, the battery uses one default sheet with plain references (`B21`), as before.
- `workbook.source` holds read-only cells. Keys are sheet-qualified (`Supplier!D2`) when sheets are declared. Read-only tabs can only contain source cells.
- Cell items must reference a writable tab (`Reconciliation!B21`). Candidate saves to a read-only tab are rejected (400).
- Grid per tab: columns A–J, rows 1–40.
- Formulas: `+ - * /`, `&` (text join), comparisons (`= <> < > <= >=`), TRUE/FALSE, parentheses, and ranges such as `Ledger!A2:E7`.
- Functions: `SUM MIN MAX ABS ROUND SUMIF COUNTIF IF IFERROR VLOOKUP INDEX MATCH`.
  - `IF` and `IFERROR` evaluate only the branch taken, as Excel does.
  - `VLOOKUP` and `MATCH` support exact match (`FALSE` / `0`) and ascending approximate match (`TRUE` / `1`, the default). Column indices outside the table return `#REF!`.
  - Text and blank cells are ignored by `SUM`, `MIN`, `MAX` and `SUMIF` ranges. Lookups skip nothing: a key is matched on its displayed text.
- Not supported, and returns an error rather than guessing: `XLOOKUP`, `MATCH` with match type -1, array formulas, structured references, external workbooks, and references to tabs that do not exist (`#REF!`).
- Items may have text answers (for example `IF(...)` returning `AGREES`). Text cell answers compare like typed text.
- The server re-evaluates every formula. Client-reported values are never trusted.
- `ROUND` is the way to fix money precision. Intermediate values keep full precision.

## Security and integrity

- Answer keys stay in `scoring_key_json`. The candidate payload is an allowlist: no `answer`, `tolerance`, `unsafe`, `points` or `category`.
- **Option ids must be opaque** (`o1`…`o8`). Option ids are sent to the candidate, so a descriptive id such as `o_verify` would reveal the correct answer. The validator enforces this.
- Multi-select and text answers are checked server-side against the stored key.
- Unsafe choices (declared per item in the key) raise a critical flag. They do not change the item's score.
- Submissions are graded once, at finalisation, from the last server-saved state.

## Verification run (2026-11-03)

- Unit tests: `tests/assessment-battery.test.mjs` (validation, public-payload leakage, cleaning, sheet rules, grading rules, number parsing); `tests/assessment-formulas.test.mjs` and `tests/assessment-sheets.test.mjs` (functions, lookups, lazy IF, cross-tab references, cycles). Full suite: 270 passing.
- API end to end (local, isolated D1): draft → publish → invite → start → save → submit → admin report, using a private battery. Perfect answers score 100/100 and the item-level review matches. A deliberately wrong cell is marked wrong.
- Browser (Playwright, local): `tests/browser/battery.spec.mjs` covers the candidate runner (sections, live cell values, locked source cells, submission) and the recruiter report (saved formula replay). `tests/browser/sheets.spec.mjs` covers tab switching, a locked read-only tab and cross-tab formulas. All 7 browser tests pass.
- API end to end with a four-tab private battery (Supplier, Ledger, Aged, Reconciliation): all 23 items correct score 100, a write to a read-only tab returns 400.

Defects found and fixed during this work:
- Grading at submission read the attempt without the workbook column, so every cell item scored zero. The report recomputed it correctly, which hid the bug until the stored and recomputed scores were compared.
- Admin breakdown rendered nested objects directly and crashed the page (React error #31).
- Battery validation errors returned 500 instead of 400.
- Option ids named after their meaning would have leaked answers.

## Not done / needs decisions

- **Real content.** The battery content is a drafted private package (scratchpad, not committed). It needs expert review of every answer, a pilot against the 600-second limit (21 items is a lot for 10 minutes), and content and privacy approval before publication.
- **Validity.** Nothing here shows that a score predicts job performance. The thresholds, category weights and skill bands are design choices, not validated cut scores.
- **Spreadsheet.** The contract's three-tab layout is built for battery-v2. Excel parity is not: no XLOOKUP, no structured references, and only the functions listed above. Real Excel behaviour on edge cases (text-number coercion, locale formats) is not verified against Excel itself.
- **Email and secrets.** Result email needs the Resend API key, the verified sender domain, and the Pages secrets (see the runbook).
