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

## Workbook

- `workbook.source` holds read-only cells, shown on the same grid as the candidate's working cells.
- Grid: columns A–J, rows 1–40. Formulas: `+ - * /`, parentheses, `SUM`, `MIN`, `MAX`, `ABS`, `ROUND`, `SUMIF`, `COUNTIF`, ranges, and criteria strings (`"text"`, `">60"`, `"<>x"`).
- The server rejects any save that writes to a source cell (400 "Source cells are read-only").
- The server re-evaluates every formula. Client-reported values are never trusted.
- Text and blank cells are ignored in `SUM`/`SUMIF` ranges, as in spreadsheets.
- `ROUND` is the way to fix money precision. Intermediate values keep full precision.

## Security and integrity

- Answer keys stay in `scoring_key_json`. The candidate payload is an allowlist: no `answer`, `tolerance`, `unsafe`, `points` or `category`.
- **Option ids must be opaque** (`o1`…`o8`). Option ids are sent to the candidate, so a descriptive id such as `o_verify` would reveal the correct answer. The validator enforces this.
- Multi-select and text answers are checked server-side against the stored key.
- Unsafe choices (declared per item in the key) raise a critical flag. They do not change the item's score.
- Submissions are graded once, at finalisation, from the last server-saved state.

## Verification run (2026-11-03)

- Unit tests: `tests/assessment-battery.test.mjs` (validation, public-payload leakage, cleaning, read-only enforcement, grading rules, number parsing); `tests/assessment-formulas.test.mjs` (SUMIF/COUNTIF/ROUND, criteria, ranges). Full suite: 253 passing.
- API end to end (local, isolated D1): draft → publish → invite → start → save → submit → admin report, using a private battery. Perfect answers score 100/100 and the item-level review matches. A deliberately wrong cell is marked wrong.
- Browser (Playwright, local): `tests/browser/battery.spec.mjs` covers the candidate runner (sections, live cell values, locked source cells, submission) and the recruiter report (saved formula replay). All 6 browser tests pass.

Defects found and fixed during this work:
- Grading at submission read the attempt without the workbook column, so every cell item scored zero. The report recomputed it correctly, which hid the bug until the stored and recomputed scores were compared.
- Admin breakdown rendered nested objects directly and crashed the page (React error #31).
- Battery validation errors returned 500 instead of 400.
- Option ids named after their meaning would have leaked answers.

## Not done / needs decisions

- **Real content.** The battery content is a drafted private package (scratchpad, not committed). It needs expert review of every answer, a pilot against the 600-second limit (21 items is a lot for 10 minutes), and content and privacy approval before publication.
- **Validity.** Nothing here shows that a score predicts job performance. The thresholds, category weights and skill bands are design choices, not validated cut scores.
- **Scope of the spreadsheet.** No lookups (`VLOOKUP`/`INDEX`), no `IF`, no multiple sheets. The contract's three-tab workbook is not built.
- **Email and secrets.** Result email needs the Resend API key, the verified sender domain, and the Pages secrets (see the runbook).
