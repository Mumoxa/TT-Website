# Accounts Receivable assessment — duplicate of the payable assessment

Status: **platform verified locally; AR content drafted and privately authored; not published, not piloted, not validated.**
Last updated: 2026-11-05.

This document describes how the accounts receivable (AR) assessment was produced by duplicating the
existing accounts payable (AP) assessment, what was reused, what had to change, and what is still
outstanding. Read [PRODUCT_HANDOFF.md](PRODUCT_HANDOFF.md) first: the product rules there (brand,
retained results, numbered attempts, open starts, candidate-visible percentages only, content lives
only in the protected database) apply unchanged to the AR assessment.

**This repository is public.** No AR question wording, option text, marked answer or marking key is
in git. The draft package is generated from a private builder that is git-ignored (see section 4).

## 1. What was duplicated, and how

The AP assessment is not a self-contained unit: it is (a) a shared candidate/admin platform and
(b) one private content package published into it. Duplicating the whole platform would have created
a second copy of timing, atomic save/submit, grading, screening, privacy, email and reporting — the
exact duplication `AGENTS.md` rule 3 forbids. The duplicate therefore reuses the platform and adds a
second content package plus the small number of places that were hard-coded to one family.

| Layer | Reused as-is | Made family-aware |
| --- | --- | --- |
| Routing (`/assessments`, `/assessments/<slug>`, `/assessment`, `/admin/assessments`) | yes — already slug-driven | — |
| Start/save/submit, deadlines, atomic state, revision conflicts | yes | — |
| Grading (`battery-v2`, server-side, server-re-evaluated formulas) | yes | stored engine name is now `battery-v2` (was `ap-battery-v2`) |
| Screening, ID encryption/masking, attempt numbering, privacy notice | yes | — |
| Result email, recruiter report, catalogue | yes | two hard-coded AP labels removed, see section 3 |
| Public practice (three formats, untimed) | yes | selects its table from the assessment slug |
| Content: questions, documents, marking key | new for AR | — |
| Database | same `ASSESSMENT_DB` (`tt-assessments`), slug `ar-clerk-v1` | — |

## 2. Entry points

- Catalogue: `/assessments` now lists both published assessments.
- Welcome: `/assessments/ar-clerk-v1` (title "Accounts Receivable Clerk Assessment", client
  "Talent Tree", 20-minute server-enforced limit, 5 sections).
- No invitation is needed; the existing optional invitation links keep working.
- Recruiter: `/admin/assessments` — the candidate list, report, printable PDF and result email are
  the same surfaces, filtered by assessment.

**Nothing is published.** The catalogue shows the AR assessment only after the owner publishes an
approved version (section 5). Until then `/assessments/ar-clerk-v1` correctly reports that the
assessment is not open.

## 3. What had to change in shared code

Small, and each was required for correctness rather than preference:

1. **Practice selection** (`src/assessments/practice-tables.js`, `practice.js`, `practice-ar.js`).
   Practice content is checked against the published assessment for reuse, and the guard compares
   *one* practice table. Publishing an AR battery against the AP practice table would therefore be
   both wrong (AR practice would be payable-flavoured) and trivially collision-prone. Practice is now
   chosen by slug: `ar-*` uses the receivable table, everything else — including every existing AP
   slug and older invitation links — uses the payable table unchanged. The evaluator is shared, not
   copied (`practiceFeedbackFor`).
2. **Practice scope on the server** (`functions/lib/practice-isolation.js`, start and publish routes).
   `assertPracticeIsolation` takes the assessment's own scope; a new `assertNoPracticeReuse` checks
   every table for callers that do not know the family. The start route now also selects `d.slug`.
3. **Family-neutral wording** (`AssessmentAdmin.jsx`, `assessment-email.js`). The report said
   "not independent proof of full-function **AP** competence … verify **Sage 300** usage" and the
   score columns said "Technical knowledge / Reconciliation". The caveat now follows the assessment
   title, and the columns read "Knowledge / Practical work", which is accurate for both families
   (the reconciliation column has always held every practical activity, not only reconciliation).
4. **Catalogue sample** (`AssessmentCatalog.jsx`). The illustrative task on the public catalogue —
   labelled a sample — was payable-specific on a page that now lists two families. It is unchanged
   in substance, sourced from one constant.
5. **Stored engine name** (`functions/lib/battery.js`). `ap-battery-v2` → `battery-v2`, because the
   same engine grades every family. History is unaffected: the value is only written to new rows.

No database migration was needed. No binding, secret, `wrangler.toml` entry or offers code was
touched.

## 4. Where the AR content lives

Private, git-ignored (`.gitignore` → `private/`):

```
private/assessments/ar-clerk-v1/
  build.mjs          # draft wording, documents and marking key; computes every marked figure
  package.json       # generated package (import through the admin form)
  build-summary.json # generated structure and marking figures
  verify-local.mjs   # end-to-end proof through the real API, prints verdicts only
  APPROVAL.md        # SME review checklist and sign-off table
```

Why a builder rather than a hand-written package: every marked number (totals, buckets, the
provision, the short payments, the post-application balance) is computed from the same source records
that the candidate reads, so a key cannot drift from its documents. The builder then runs the
production validator, grades a perfect answer sheet (must score 100 with no critical flag) and a
deliberately wrong one (must score lower and raise a flag), and refuses to write the package if
either check fails.

```sh
node private/assessments/ar-clerk-v1/build.mjs        # rebuild + self-check
node private/assessments/ar-clerk-v1/verify-local.mjs # end-to-end through the real function
```

Draft shape (26 activities in 5 sections, two answer formats, documents rather than an editable grid):

| # | Section focus | Activities |
| --- | --- | --- |
| 1 | Debtors ledger and credit control | 5 single |
| 2 | Invoices, VAT and revenue documents | 5 single |
| 3 | Reconciling a customer account | 2 multi-select |
| 4 | Cash application and deductions | 1 short answer, 3 typed amounts, 3 single |
| 5 | Ageing, provision and month-end | 1 typed count, 4 typed amounts, 1 single, 1 multi-select |

Weighting follows AP exactly: knowledge out of 40, practical work out of 60, overall out of 100.
Item types, opaque option ids (`o1`…`o8`), per-item instructions, `format: "rand"` / `"count"` answer
boxes, the amount read-back, and `display: "documents"` all mirror the AP battery. The scenario uses
fictional customers and a fictional ledger; it shares no prompt, option, table or answer with the AP
content (the practice guard enforces the practice overlap only, since the AP package is not in git).

## 5. How to publish (owner action, needs approval)

1. Have a receivables SME work through `private/assessments/ar-clerk-v1/APPROVAL.md` and record a
   decision on each point. Do not publish on the strength of this document alone.
2. Rebuild and verify: `node private/assessments/ar-clerk-v1/build.mjs` then `verify-local.mjs`.
3. Sign in at `/admin/assessments`, open the publish tab, and use **Import a private package file** to
   load `package.json`. Check the slug (`ar-clerk-v1`) and title before saving the draft.
4. Read the draft back (`Edit latest`) and compare the activities with the approved text.
5. Publish with both approval boxes and an approval reference. Publishing is what makes
   `/assessments/ar-clerk-v1` live in the catalogue; there is no separate deploy for content.
6. Check `GET /api/assessment/catalog?slug=ar-clerk-v1` returns the expected section and activity
   counts, and open the welcome page.

Publishing a new AR version never affects attempts already started, which keep the version they began
on. The same is true in reverse: the AP assessment keeps its published version and its practice
content.

## 6. Verification performed (2026-11-05)

| Check | Result |
| --- | --- |
| `npm test` | **327 passed, 0 failed** (318 before this work; 9 new AR tests) |
| `npm run build` | Pass |
| Private package self-check (`build.mjs`) | Validator pass; perfect sheet 100 with no critical flag; wrong cell and unsafe choice both detected; amount read-back `R160 730,00` / `160,730.00` / `R 160730` all read correctly |
| Private end-to-end (`verify-local.mjs`) | **PASS** — admin sign-in, draft, read-back identical to the intended payload and key, publish, catalogue metadata only, start, 20-minute server deadline, no key material in the candidate payload, opaque option ids, autosave, submit, **100/100**, candidate sees percentages only, recruiter list and report reproduce 100/100 across 26 activities, and amounts typed as `R 160 730.00` still score 100 |
| Rendering (React `renderToStaticMarkup`, real components) | AR practice renders the receivable table and **not** the payable one; AP practice renders its three original items unchanged; runner shows 5 sections, documents visible with the grid hidden, 8 rand boxes and 1 count box (numeric keypad), read-back `Read as R160,730.00`, invalid entry announces an alert, no key material in the DOM |
| Cross-family safety | A new AR battery that reuses AR practice cannot be published (400); a battery reusing any practice table is refused by `assertNoPracticeReuse` |

### Not verified — do not claim these

- **No browser run.** Chromium is not installed in this environment and the Playwright browser CDN is
  not reachable, so `tests/browser/*` were not executed for AR. The existing AP browser suites also
  did not run here. Verify the AR welcome, practice, runner, results and report in a real browser
  before publishing.
- **No remote/deployed behaviour.** Nothing was drafted, published, invited or started against
  preview or production D1. No Cloudflare account was used.
- **No real content approval, no SME review, no pilot.** The content is a draft written by an
  engineer, not by a receivables specialist.
- **No validity evidence.** Nothing shows the score predicts job performance. Do not describe it as a
  pass/fail or predictive cut-off; the 75% figure in the key is unused by any view.
- **Result email** for an AR attempt was not sent through a live provider.

## 7. Risks and decisions needed

1. **Content quality is the main risk.** Fifteen knowledge activities and nine practical amounts were
   written without SME review, including VAT and settlement-discount treatment under South African
   practice. Two specific points need a decision: the 2% provision rate is an arbitrary exercise rate
   (say so, or let the task state it — it currently does), and the settlement-discount activity in
   section 4 assumes a written agreement that the ledger does not itself record, which is realistic
   but should be confirmed as fair.
2. **Time limit.** 26 activities in 20 minutes is slightly more than the AP battery's 23. The AP pilot
   evidence suggested the workbook tasks, not the knowledge questions, consumed the time; here the
   practical work is typed amounts rather than computed cells, which is faster, but this is unproven.
   Pilot before relying on it.
3. **Two assessments share one catalogue and one admin list.** Recruiters must filter. If that becomes
   a problem, an explicit filter control in `/admin/assessments` is a small follow-up; the API already
   returns the assessment per attempt.
4. **Party names can collide with the live AP assessment.** The first draft of this content
   independently chose customer names that the live AP assessment already uses (the AP versions are
   recorded in `PRODUCT_HANDOFF.md` section 4), which would have shown the same organisations in two
   assessments in one catalogue. They were renamed. Anyone drafting a further family should read that
   table first: the AP battery is not in git, but its party names are described there in the change
   log.
5. **Practice content is public and non-financial by design.** If the owner prefers finance-flavoured
   practice for AR, change `practice-ar.js` — but re-run the isolation guard, because practice may not
   overlap the published battery.
6. **Retention, privacy wording and test records** carry over unchanged from the AP assessment and
   remain open decisions in `PRODUCT_HANDOFF.md` section 8.
