# Accounts Receivable assessment — duplicate of the payable assessment

Status: **platform verified locally; AR content rebuilt to the Talza Assessment Blueprint and privately authored; every point scored automatically; not published, not piloted, not validated.**
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
  "Talent Tree", 20-minute server-enforced limit, 6 sections).
- No invitation is needed; the existing optional invitation links keep working.
- Recruiter: `/admin/assessments` — the candidate list, report, printable PDF and result email are
  the same surfaces, filtered by assessment.

**Nothing is published.** The catalogue shows the AR assessment only after the owner publishes an
approved version (section 5). Until then `/assessments/ar-clerk-v1` correctly reports that the
assessment is not open.

## 2a. Conformance to the Talza Assessment Blueprint

The content is authored against the blueprint supplied by the owner (A.0.2, 5 November 2026). The
blueprint is a specification, not evidence: where it states a rule it is implemented, and where it
states something that only local evidence can settle (timing, weights, difficulty labels, cut score)
this document records the gap in section 6 instead of asserting a result.

| Blueprint requirement | How the build satisfies it |
| --- | --- |
| Component weights A 20 / B 60 / C 20 | Four scoring components: A Foundations 20, B Work sample 60 (B1 16, B2 24, B3 20), C Controls and handoff 20 (C1 12, C2 8). A section's `cap` is now a point weight, and the validator refuses a section whose authored points do not equal its cap, so a component cannot drift away from its share. |
| Named tasks A1–A6, B1–B3, C1–C3 | Item ids carry the blueprint task: `a1`–`a6`, `b1a`–`b1d`, `b2a`–`b2f`, `b3a`–`b3e`, `c2a`–`c2c`, `c2d`. |
| 25 fields, 12 scored tasks | 25 activities in 6 sections worth **100** points. All 25 are scored by the server; none waits for a person. |
| Wording tiers and difficulty labels | Items carry `level`: 25 points foundation, 59 core, 16 stretch, exactly the blueprint's authored mix. The level is a quiet label in the candidate UI, never a hint or a score. |
| Unsigned amounts as exact cents | Amount fields are `format: "rand"`. `cleanBatteryWorkbook` refuses a minus sign or brackets on entry, so a signed figure never becomes a wrong answer. `R2 300,00`, `2,300.00` and `2300` all parse to the same cents. |
| A reference field takes a single document code | New item type `ref`, compared on letters and digits only (`GRN-77` = `GRN 77` = `grn77`). An amount typed in a code box scores zero, and the box warns before submission. |
| Zero or full points per field; a blank submitted field is 0 | Unchanged engine behaviour; a blank is scored as wrong rather than skipped, so a submitted form is always out of the full mark. |
| Written handoff on four anchors | New item type `note`, **scored automatically**. The four anchors (facts, status, next action with owner, timing) are encoded as evidence markers in the scoring key, never in the candidate payload. Each criterion is worth 2 points, all or nothing within that criterion, so a compliant note earns 8 and a note that misses the timing loses exactly 2. Negation is understood: "do not release the refund" satisfies the status criterion, "release it" fails it. |
| Every point automated, no manual marking | There is no reviewer route, no pending state and no way for a person to set a score. The per-criterion award and the marker that matched are reported, so the mark is auditable without being editable. |
| Manual decisions kept separate from the score | `assessment_decisions` records `advance` / `hold` / `not_advance` with an author and a reason, and never writes to a score column. |
| A decision is not a score | `assessment_decisions` records `advance` / `hold` / `not_advance` with an author and a reason, and never writes to a score column. |
| A submitted attempt is always final | `combineScores` now always returns `status: "scored"` with a total, because every item is scored on submission. The old `pending_review` state is retired. |
| No cascading errors | Reference, disposition and result are separate fields, the two adjusted balances are separate dependent fields, and no field borrows another exhibit's figure. |
| No keys, anchors or rationale in the candidate payload | `publicBattery` emits id, type, prompt, level, instructions, options, cell ref, and amount format only. A test asserts the words `rubric` and `anchors` never appear in the candidate payload. |
| Rejects a 70 % convention as a cut score | No cut score is applied or displayed. `passed` / `pass_percent` remain computed and unsurfaced (see section 7). |
| AR is a later expansion profile needing its own matrix, form version and validation record | This form is version `ar-clerk-v1` with its own content, its own practice table and its own approval record; it makes no claim to inherit the AP form's validity. |
| An owner decision supersedes the blueprint's human handoff | The blueprint expects the handoff to be marked by a trained reviewer. The owner has directed that **all scoring be automated**, so the handoff is machine-scored instead (see deviation 4). |

### Deviations and open items against the blueprint

Recorded rather than papered over:

1. **No cut score, no pilot, no Angoff study.** The blueprint asks for independent South African SMEs
   and a 100–200 attempt pilot per stable form. Neither exists. The form is labelled **draft/pilot**
   and no validity claim is made anywhere in the product.
2. **Timing is unproven.** 25 fields in 20 minutes is a design assumption, not a measurement. The
   blueprint's own ~28-minute figure is a design target; this form keeps the platform's existing
   20-minute limit and needs a timed pilot before either number is repeated as fact.
3. **The difficulty mix is now exactly 25/59/16**, matching the blueprint. The item-review bands
   (foundation .75–.95, core .45–.80, stretch .30–.65) still cannot be applied until real responses
   exist, so the labels remain author intent.
4. **The handoff is machine-scored, not human-marked.** This is a deliberate departure from the
   blueprint at the owner's direction. It buys full automation and removes the operational step, and
   it costs something that must be stated plainly: a written answer is now judged on the presence of
   evidence, not on the quality of the reasoning or the accuracy of the figures quoted. A candidate
   who writes "INV-8841 is on hold, bank detail unverified, I will call the contact, update by 13:55"
   earns 8 even if the surrounding explanation is poor; a candidate who explains the situation
   beautifully but forgets to promise an update time loses 2. The markers are tuned to the facts the
   note is asked to contain, and every mark names the marker that produced it, so the trade-off is
   visible rather than hidden. **If the owner ever wants a judgement of quality rather than content,
   that is the point where a human mark has to return.**
5. **The handoff is C2 only.** The blueprint's handoff is a single written note worth 8 points on the
   four anchors. It is one item, not one per component.
6. **B1's documents are restated inside the prompts.** The workbook has one documents tab, so the
   purchase order, goods-received note and invoice for B1 appear in the task text rather than as a
   separate sheet. This is a presentation compromise, not a change to the task.

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

6. **Automatic handoff scoring** (`functions/lib/assessment-review.js`, `migrations/assessments/0005_automated_note_scoring.sql`).
   A `note` is scored by matching the candidate's own words against evidence markers in the key, on a
   whole-word and negation-aware basis, two points per criterion and all-or-nothing within each. The
   per-criterion award and the matched marker are reported with the result so the mark can be audited.
   **Reviewer marking has been removed**: the `admin/review` route is gone (404) and `0005` marks any
   mark recorded by a person under `0004` as `source = 'reviewer'`, never used for scoring.
7. **Hiring decision** (`assessment_decisions`, `admin/decision/<id>`). Admin-only, audited, needs a
   reason, and never writes to a score column.
7. **Level and format payload** (`functions/lib/battery.js`). The candidate payload now carries an
   item's `level` and optional `hint`; neither is key material. `practice-isolation.js` now treats a
   `note` item as carrying no answer to leak, instead of failing the key as incomplete.

**Migrations 0004 and 0005 must be applied** to `tt-assessments` (`node scripts/assessment-local.mjs
migrate`, or `wrangler d1 migrations apply`). `0005` adds the note-evidence table and the `source`
column; until both are applied, the decision route returns a 500 and the report cannot list handoff
evidence. Nothing else was touched: no binding, secret, `wrangler.toml` entry or offers code changed.
Both migrations are additive and are safe to apply before anything is published.

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

Draft shape (25 activities in 6 sections, 92 auto-scored points plus an 8-point written handoff):

| Section | Blueprint task | Weight | Activities |
| --- | --- | --- | --- |
| Part A · Foundations | A1–A6 | 20 | 6 single-choice (credit purchase, 14-day terms, VAT inside a gross amount, a possible duplicate, a cut-off exception, a credit note) |
| B1 · Check an invoice against delivery | B1 | 16 | 3 typed results (units received, undelivered value, document code) and 1 disposition |
| B2 · Reconcile a supplier statement | B2 | 24 | 4 typed amounts (invoice value, claimed discount, discount allowed by the terms, balance outstanding), 1 disposition, 1 document choice |
| B3 · Reconcile the ledger to the cashbook | B3 | 20 | 4 typed amounts (ledger total, 61–90 bucket, 2 % provision, misallocated receipt) and 1 typed count |
| C1 · Payment controls and priority | C1–C3 | 12 | 3 single-choice (bank-detail change, verification evidence, what comes first before a payment run locks) |
| C2 · Written handoff | C2 | 8 | 1 written note, scored automatically on four evidence anchors |

The weight is the section's points, and the validator enforces `sum(item points) == section cap`, so
the composite is a plain sum out of 100 rather than a ratio that can drift. Composite = A/20 + B/60 +
C/20 exactly as the blueprint specifies, and all 100 points are awarded on submission.

Item types, opaque option ids (`o1`…`o8`), per-item instructions, `format: "rand"` / `"count"` answer
boxes, the amount read-back, and `display: "documents"` all mirror the AP battery. The scenario uses
fictional customers, a fictional supplier and a fictional ledger; it shares no prompt, option, table or
answer with the live AP content, and reuses the blueprint's own fictional task scenarios, which were
written for this form. The practice guard enforces non-overlap with the public practice items.

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
| `npm test` | **350 passed, 0 failed** |
| `npm run build` | Pass |
| Migrations | `0004` and `0005` apply cleanly to a fresh SQLite database; checked by executing every migration in order |
| Private package self-check (`build.mjs`) | Validator pass; weights 20/60/20 enforced; perfect sheet = **100/100** with no critical flag and nothing pending; handoff checks: compliant 8, no time 6, no owner 6, releases the refund 6, blank 0; a signed amount is refused; `R2 300,00`, `2,300.00` and `2300` all read to the same cents; the candidate payload leaks no criterion |
| Private end-to-end (`verify-local.mjs`) | **PASS, 26 checks** — sign-in, draft, read-back identical to the intended payload and key, publish, catalogue metadata only, start, 20-minute server deadline, no key material in the candidate payload, opaque option ids, autosave, submit, **100/100 with nothing pending**, an amount typed as `R 6410,00` still scores, the candidate is not told how the handoff is marked, the report reproduces 100/100 and lists the handoff's four criteria with the markers that earned them, a paper with a vague handoff scores 92 with only the handoff losing points, **marking by hand returns 404**, a hiring decision is recorded without moving the score (100/100), and a decision without a real reason is refused |
| Rendering (React `renderToStaticMarkup`, real components) | AR practice renders the receivable table and **not** the payable one; AP practice renders its three original items unchanged; the runner renders the written-handoff textarea, the single-code input and the level labels, and tells the candidate the note is checked for facts, action and time rather than style; no key material in the DOM |
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
  pass/fail or predictive cut-off; the 75% figure in the key is unused by any view. The blueprint's
  modified-Angoff study and its 100–200 attempt pilot have not been done, so no cut score may be set.
- **No reviewer workflow rehearsal.** Marking was exercised by the local verifier and the unit tests,
  not by a real reviewer on a real attempt. The admin marking and decision panels render, but no
  browser run confirmed them end to end.
- **Result email** for an AR attempt was not sent through a live provider.

## 7. Risks and decisions needed

1. **Content quality is the main risk.** 24 auto-scored fields and one written handoff were written
   without SME review, including VAT inside a gross amount and settlement-discount treatment under
   South African practice. Three points need a decision: the 2 % provision rate is an exercise rate
   (the task says so), the settlement discount depends on a written agreement that the advice restates
   rather than the ledger recording, and the reviewer anchors for "timing" must be read the same way by
   every reviewer. All three are on the `APPROVAL.md` checklist.
2. **Time limit.** 25 fields in 20 minutes is a design assumption. The written handoff alone will take
   several minutes. Time a real attempt before relying on the limit, and consider 25 minutes if the
   pilot shows the handoff is rushed.
3. **The handoff now measures content, not quality.** Automation removed the operational step and
   the risk of inconsistent marking, but a machine can see whether a note names the invoice, states a
   hold, names an action with an owner and gives a time; it cannot see whether the reasoning is sound
   or the figures quoted are right. Read the handoff when the score matters. The evidence report makes
   that cheap: it shows the matched marker per criterion next to what the candidate wrote.
4. **Two assessments share one catalogue and one admin list.** Recruiters must filter. If that becomes
   a problem, an explicit filter control in `/admin/assessments` is a small follow-up; the API already
   returns the assessment per attempt.
5. **Party names can collide with the live AP assessment.** The first draft of this content
   independently chose customer names that the live AP assessment already uses (the AP versions are
   recorded in `PRODUCT_HANDOFF.md` section 4), which would have shown the same organisations in two
   assessments in one catalogue. They were renamed. Anyone drafting a further family should read that
   table first: the AP battery is not in git, but its party names are described there in the change
   log.
6. **Practice content is public and non-financial by design.** If the owner prefers finance-flavoured
   practice for AR, change `practice-ar.js` — but re-run the isolation guard, because practice may not
   overlap the published battery.
7. **Retention, privacy wording and test records** carry over unchanged from the AP assessment and
   remain open decisions in `PRODUCT_HANDOFF.md` section 8.
