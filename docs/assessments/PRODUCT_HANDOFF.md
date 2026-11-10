# Assessment product handoff — source of truth and status

Audience: any AI assistant or maintainer who picks up the candidate assessment.
Last updated: 2026-11-05 (after v5, the 20-minute limit and the side-by-side workbook), from checks made on that date. Each claim below is labelled with its evidence:
**Verified** (checked on 2026-11-05 against code, the live site or the admin API), **Implemented** (in code, not re-checked today),
**Needs verification**, **Unknown**, or **Decision needed** (an owner decision is outstanding).

This repository is **public**. Do not commit live question wording, answer options, correct answers, the marking key, candidate data, invitation tokens or secret values here.

## 0. Read first, in this order

1. The repository `AGENTS.md`, and the canonical `Mumoxa/agent-instructions/AGENTS.md` it names.
2. This document.
3. [OPEN_START_HANDOFF.md](OPEN_START_HANDOFF.md): the current policy (open starts, retained results, repeat attempts, privacy fields).
4. [BATTERY_V2.md](BATTERY_V2.md): the battery format and grading rules. Parts are out of date; see section 9.
5. [TALENT_TREE_AP_ASSESSMENT_V1.md](TALENT_TREE_AP_ASSESSMENT_V1.md): the original build contract. It is historical, but its security and acceptance intent still applies.

## 1. What the product is

- A short, timed, practical screening exercise for an accounts payable clerk role, run for Talent Tree.
- Public entry points (verified):
  - `https://talenttree.co.za/assessments`: catalogue.
  - `https://talenttree.co.za/assessments/ap-clerk-v1`: welcome page for the live assessment.
- Live assessment: slug `ap-clerk-v1`, title "Accounts Payable Clerk Assessment", client "Talent Tree".
- Shape (verified against the live catalogue on 2026-11-05, after v4): 6 sections, 23 items, 20-minute limit enforced by the server (`DEFAULT_ASSESSMENT_SECONDS` in `functions/lib/assessment-deadlines.js`).
- No invitation is needed. Anyone with the link can start. The practice mode writes no records.
- Scoring: two categories, knowledge (weight 40) and reconciliation (weight 60), giving an overall score out of 100. Marking runs on the server. Formulas are re-evaluated on the server and client-reported values are never trusted.

## 2. Product rules (owner decisions)

These are decisions the owner has made. Do not change them without the owner.

1. **Brand.** Talent Tree only. The former client name must never appear in the repository, the UI, emails or documents. A test scans tracked files for it. Do not write that name in this document or any other.
2. **Results are retained.** There is no automatic deletion, and the product has no delete action in the admin API (verified: the admin routes are login, session, list, draft, draft/<id>, publish, invite and report).
3. **Repeat attempts are limited to 3 per person.** Owner decision on 2026-11-05 (previously unlimited). The limit is per South African ID number per assessment, and every start counts, including unsubmitted and timed-out ones (`MAX_ATTEMPTS_PER_ID` in `functions/api/assessment/[[path]].js`). A fourth start is refused with a message pointing to hello@talenttree.co.za. Each attempt is still numbered ("Attempt 2" and so on) in candidate results, recruiter lists, reports and result emails.
4. **Start throttling is off** (`START_THROTTLE_ENABLED = false` in `functions/api/assessment/[[path]].js`, verified). Rate limits remain on invitation creation and admin login.
5. **Candidates see percentages only**: an overall percentage, percentages by section, and feedback text. They see no pass or fail, no answer keys, no item review and no marking detail.
6. **Candidate fields**: first name, surname, email, contact number, South African ID number (checksum-validated, stored encrypted, masked in reports), earliest first day (a weekday from tomorrow, within 90 days), travel mode and description, own transport, two-month availability, and a privacy acknowledgement. The assessment front end gives `hello@talenttree.co.za` as the contact.
7. **Timer.** The 20-minute limit (raised from 10 on 2026-11-05 by owner approval) starts when the server commits the start. Since PR #57 the start is committed only after the candidate clicks OK on the "Before the timer starts" dialog, which shows the assessment's instruction text. Refresh, reload and duplicate tabs do not extend it. Work saved before expiry is kept.
8. **Candidate-visible instructions** may point to where to look (tabs, rows, cells). They must not reveal or hint at the answer. As of v7, only 4 workbook tasks carry instructions, by owner decision on 2026-11-05.
9. **Live content stays out of the repository.** Question wording, options, answers and the marking key live only in the protected database (see section 3).

## 3. Where each kind of truth lives

| Kind of truth | Where it lives | Notes |
|---|---|---|
| Live question content and marking key | Production D1 database `tt-assessments`, table `assessment_versions` | **Not in git.** Current live version: `v13` (verified 2026-11-05). |
| Candidate and recruiter behaviour | `functions/api/assessment/[[path]].js`, `functions/lib/*.js`, `src/assessments/*` | The code is the behaviour. |
| Battery format and grading | `functions/lib/battery.js` (format `battery-v2`) | `gradeBattery` grades on the server. |
| Current policy | `docs/assessments/OPEN_START_HANDOFF.md` | Partly superseded; see section 9. |
| Secrets | Cloudflare Pages secrets | Names only: `ASSESSMENT_ADMIN_KEY` (the code also reads `ADMIN_KEY`; which one is set is **Needs verification**), `ASSESSMENT_ID_HASH_KEY`, `ASSESSMENT_PII_KEY`, `RESEND_API_KEY`. Values are never written in the repository or in documents. |
| Configuration | Pages environment variables | `ASSESSMENT_FROM_EMAIL`, `ASSESSMENT_RESULTS_TO`. |
| Schema | `migrations/assessments/0001_schema.sql`, `0002_result_notifications.sql`, `0003_candidate_screening.sql` | Recorded as applied on production and preview in the 2026-11-05 session. **Needs verification** against `d1_migrations`. |
| Deployment | GitHub `main` deploys to Cloudflare Pages project `tt-website` (production branch `main`) | Verified from the deployments list on 2026-11-05. |
| Offers data | D1 database `tt-offers` (binding `DB`) | **Never touch.** Not part of this product. |

## 4. Current status

| Area | Status | Evidence |
|---|---|---|
| Live content: revised wording for question 2.4 (VAT) | Implemented and live (v2) | Admin readback matched the owner's wording exactly. |
| Live content: instructions on all 23 items, including the c5 instruction | Implemented and live (v3) | Admin readback, 2026-11-05. Catalogue returns HTTP 200 with 23 items and 5 sections. |
| Question 3.6 (c5) renders on the live site | Verified | A test attempt on 2026-11-05 showed four options, none selected, instructions present and no horizontal overflow at 1280px or 390px. |
| Reference codes such as INV-2214 stay on one line | Implemented and live (PR #43, merged as `0676194`) | Live asset check, and the live screenshot of question 3.6. |
| Amount reading for marking, and read-back | Implemented and live (PR #61) | `parseAmount` accepts R/ZAR/rand before or after, spaces, apostrophes, comma or full stop as thousands or decimal mark (last mark is decimal when both appear; a single mark followed by exactly 3 digits is thousands), ,- endings, brackets or minus for negatives, and counts as words (zero to twenty). Formula results stay strict. Candidates see "Read as R…" under rand and count boxes. Check of all real attempts on 2026-11-05: no submitted answer had been marked wrong for formatting. |
| Line-matching question type (`match`) | Implemented (this PR) | Each listed line (statement and ledger) is classified with one shared choice (for Version 2: Agrees, Missing from ledger, Posted incorrectly, Timing difference). One point per correct line; `points` must equal the line count (max 12). Key `answer` maps every line; optional `alternatives` give equally correct readings (the best-scoring reading is used), for example which of two identical ledger entries is the duplicate. Submissions are stored in `structured.match`. Unit and browser tests cover validation, key privacy, cleaning, partial credit, alternatives, save and reload. |
| Version 2 (`ap-clerk-v2`) | In review on the preview database only | Owner request 2026-11-10: keep Version 1 (`ap-clerk-v1`) live and unchanged; develop Version 2 with the line-matching step. Version 2 is Version 1's v13 content with 5.3 (which items need correcting) and 5.4 (how many are missing) replaced by one 11-line matching step, 22 questions, 22 knowledge and 41 practical points. Published to `tt-assessments-preview` only; not on production. |
| Live content v13 (start dialog lists documents) | Implemented and live; verified | Published 2026-11-05. Only the instruction text changed: it lists the four documents by their on-screen titles, says where they appear, and explains amount formats and the read-back. Live browser check (TEST Review, not submitted) confirmed the dialog list and read-backs (R26.050,00 → R26,050.00; 1'700 → R1,700.00; one → 1; 22 050 rand → R22,050.00). Eleven TEST Review attempts now exist on production. |
| Answer box examples by format | Implemented and live (PR #59) | Cell tasks may set `format: "rand"` (example "For example R12 500.00") or `"count"` ("A whole number, for example 4", numeric keypad). No effect on marking. |
| Live content v12 (follow-ups, formats) | Implemented and live; verified | Published 2026-11-05. Section 5 follow-ups name Karee Packaging; the "does it reconcile" choice (m2) moved to the end of section 5 (after the corrected balance); 6.3 names a supplier not used elsewhere (Highveld Office Supplies); rand and count formats set. Keys and points unchanged. The v11-to-v12 change set was checked to reproduce the validated file. Live browser check (TEST Review, not submitted) confirmed order, wording and box examples. Ten TEST Review attempts now exist on production. |
| Start dialog: timer starts only on OK | Implemented and live (PR #57); verified | Live browser check 2026-11-05: dialog shown, no `/start` request and no timer before OK, Back closes it, OK starts a 20-minute timer. Catalogue and invitation metadata now include the battery `instructions` text (no questions or keys). |
| Live content v11 (supplier named) | Implemented and live; verified | Published 2026-11-05. The reconciliation supplier is named "Karee Packaging (Pty) Ltd" (fictional) in 5.1, 5.2, 5.4, 5.8 and the two document titles; the aged listing is titled "(other suppliers)". Marking unchanged from v10. Verified in a live browser run (TEST Review, not submitted). Nine TEST Review attempts now exist on production. |
| Documents display instead of the spreadsheet | Implemented and live (PR #55) | `workbook.display: "documents"` shows the listed read-only ranges as plain tables and hides the grid; answers go in the box under each task. Marking reads typed amounts with `parseAmount` (R 26 050, R26,050.00 and 26050,00 all count). Practice item 3 asks for a typed total. Grid mode remains the default for other batteries. |
| Live content v10 (documents, no spreadsheet) | Implemented and live; verified | Published 2026-11-05 after real candidates scored 41–95% on knowledge but 0–13% on the workbook (11 submitted attempts). Item 5.5 (m2) changed from an AGREES/DIFFERS formula cell to a single-choice question (key o1); all other keys unchanged. Built with `json_set` on the v9 row; the change set was checked to reproduce the validated file exactly. A live start (TEST Review, not submitted) returned 1,200,000 ms and a payload byte-identical to the validated package. Seven TEST Review attempts now exist on production. Scores from v10 are not comparable with earlier versions. |
| Answer box under each workbook task | Implemented and live (PR #53) | Each cell task has an input under it that writes to the task's workbook cell; marking still reads the cell. Answer cells are tinted and tagged with the task number in the grid. |
| Live content v9 (opening instruction only) | Implemented and live; verified | Published 2026-11-05. Identical to v8 except the battery instruction now tells candidates to type each answer in the box under the task. Built with `json_set` on `$.instructions`. A live start (TEST Review, not submitted) returned 1,200,000 ms and a payload byte-identical to the validated package. Six TEST Review attempts now exist on production, none submitted. |
| Live content v8 (workplace wording, sections 1 to 4) | Implemented and live; verified | Published 2026-11-05 on owner instruction. The 12 knowledge prompts are reworded as workplace situations; options, answer key and workbook are identical to v7. Built in D1 with `json_set` on the v7 row, so no other text was retyped; stored length matched the validated file. A live start (TEST Review, not submitted) returned 1,200,000 ms and a payload byte-identical to the validated package. |
| Live content v7 (no definitions in sections 1 to 4) | Implemented and live; verified | Published 2026-11-05 on owner instruction. Identical to v6 except the term definitions under the 12 questions in sections 1 to 4 are removed. Built in D1 with `json_remove` on the v6 row, so no text was retyped. A live start (TEST Review, not submitted) returned 1,200,000 ms and a payload byte-identical to the validated package. Rule 8 in section 2 now applies in the stricter sense: only workplace facts a clerk would have (sign convention, bank confirmation of PMT-5530, rand to two decimals, use a formula) remain as instructions. |
| Live content v6 (wording of sections 5 and 6) | Implemented and live; verified | Published 2026-11-05 on owner instruction: workbook tasks rewritten as workplace requests from a finance lead, without step-by-step method hints (no column/row directions, no VLOOKUP helper formula, no sign hint for the payment in transit). Options, cells, answer key and workbook are identical to v5 (checked in D1). A live start (TEST Review, not submitted) returned 1,200,000 ms and a payload byte-identical to the validated package. Expect section 5 and 6 scores to be lower than on v4/v5, because less method is given. |
| Live content v5 (order only) | Implemented and live; verified | Published 2026-11-05 on owner instruction. Same items, answer key and workbook as v4 (checked in D1). Knowledge sections first (1 to 4), then the two workbook sections (5 statement reconciliation; 6 aged creditors, accruals and VAT). The VAT cell item moved into section 6. A live start (TEST Review, not submitted) returned 1,200,000 ms and a payload byte-identical to the validated package. |
| Live content v4 | Implemented and live; verified | Published 2026-11-05 on owner instruction ("approve all recommendations"). Changes from v3: m2 wording fixed (literal reading of v3 scored a correct method as wrong); m1 helper instruction corrected; diagnostic labels removed from the c4 options, Ledger D3/D6 and the c6 prompt; c4 states PMT-5530 left the bank once; b1, d3 and e2 replaced by section 6 "Group companies" (g1–g3). The admin key was unavailable, so the rows were written to D1 in the same form the admin draft and publish routes write, with both audit events. Verification: stored lengths matched the validated file; a live start (TEST Review, test@example.com, not submitted) returned a 1,200,000 ms window and a candidate payload byte-identical to the validated package, with no key fields. |
| 20-minute limit | Implemented and live (PR #45) | Live catalogue shows 20 minutes; live start returned 1,200,000 ms. |
| Formula engine accepts `$` absolute references (`$A$2:$A$7`) | Implemented and live (PR #45) | Before this, `$` references returned `#FORMULA!`. Unit test added. |
| Unit tests | Implemented; 312 passing on the branch before the merge | `npm test`. Re-run before any change. |
| Browser tests | Partly verified | 11 of 11 pass in Chromium (battery, workbook and layout suites), run against a local harness on 2026-11-05. Firefox and WebKit have not been run since the last full cross-engine run, which predates later changes. |
| Candidate flow end to end on production | Partly verified | Earlier live runs covered the welcome, form, timer, autosave, submit and results. A full run after the latest changes has not been repeated. |
| Result email delivery | **Needs verification** | Live delivery has not been checked in this work. |
| Physical devices, screen readers, real-profile autofill | **Not verified** | No testing done. |
| Scoring validity | **Unknown** | No pilot has been run and no cut-off has been validated. Do not describe results as predicting job performance. |
| Test records on production | Decision needed | Verification runs created attempts under the test name "TEST Review" with `test@example.com`, some submitted. Nothing in the product removes them. |

## 5. How to change the live content

Publishing content is an owner action. Make no change without the owner's explicit approval for that exact text.

1. Draft: `POST /api/assessment/admin/draft` with `slug`, `client_name`, `title`, `question_payload` and `scoring_key`. This creates a new immutable version.
2. Publish: `POST /api/assessment/admin/publish` with `version_id`, `content_approved: true`, `privacy_approved: true` and an `approval_reference` of at least 8 characters. The reference is written to the audit log.
3. Read back: `GET /api/assessment/admin/draft/<version_id>` and compare every item with the payload you intended to publish.
4. Check the public catalogue: `GET /api/assessment/catalog?slug=ap-clerk-v1`.

Before publishing, check the payload:

- The item count and section count match what the owner approved.
- Every item has candidate instructions no longer than 600 characters, and none reveals the answer.
- No former client name appears anywhere in the payload.
- The marking key uses the same item ids as the payload.

Keep the approved payload and the marking key in an owner-held private store, not in git (see section 8).

Running a Node script against the live site from this sandbox needs `NODE_USE_ENV_PROXY=1`. Node's built-in `fetch` ignores the sandbox proxy without it. Do not turn off TLS verification to get around this.

## 6. How to deploy a code change

1. Start from the latest `main`. Work on a feature branch. Do not reuse a branch whose pull request has already merged.
2. Run the checks in section 7.
3. Open a pull request into `main` only when the owner asks. The GitHub Actions `verify` job and the Cloudflare Pages preview must pass before merging.
4. Merging into `main` deploys production. Check the deployment: the Pages deployments API for `tt-website` should show the production deployment for the merge commit with every stage successful.
5. Check that the live site has the change. A plain request for the HTML can be served from cache, so fetch it with a cache-busting query string, and confirm the bundle names match the build.

Schema changes: apply migrations to the named assessment database only, after a backup. Never run ad-hoc `DELETE` statements on production.

## 7. How to verify

- `npm test`: unit tests (`tests/*.test.mjs`).
- `npm run build`: production build into `dist/`.
- The GitHub Actions workflow `corrective-verify.yml` (job `verify`) runs `npm ci`, `npm test` and `npm run build` on each pull request.
- There is no lint script in this repository.
- Local harness: `npm run assessments:dev` serves `127.0.0.1:8790` with a local D1 under `.wrangler/`. The harness copies `dist/` into `.wrangler/assessment-sandbox/` when it starts. After a rebuild, refresh that copy or restart the harness, or you will test old code.
- Browser tests: `CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test <files>` with the harness running. The suites are in `tests/browser/`.
- **Live checks create records.** Each start of an attempt creates a permanent record. Use `test@example.com` and a synthetic name, do not submit, and get the owner's approval first.

## 8. Risks and gaps (recommended actions)

1. **The only full copy of the approved content is in production D1.** Working copies made during this work were kept in a session scratch folder that does not persist. Recommendation: the owner should keep an offline, encrypted backup of the approved payload and marking key, exported through the admin readback. **Decision needed.**
2. **Retention conflict.** The privacy draft proposes deleting unsuccessful candidates' data 90 days after the assignment closes. The owner's decision is to retain results and not to delete automatically. The product has no delete action. Recommendation: the owner decides the policy in writing; if deletion is needed, build and test a narrow workflow with an audit trail on the preview database first. **Decision needed.**
3. **Privacy notice wording.** The draft wording names "Talent Tree Consulting" and tells candidates to contact their Talent Tree recruiter. The notice shown in the live assessment front end (under `src/assessments/`) has not been compared with the approved wording. Recommendation: confirm the approved wording, the privacy contact and the lawful basis, and record the approval outside git. **Decision needed.**
4. **Approval records.** Approvals so far are the owner's chat instructions, cited as approval references such as "Talent Tree instruction in chat, 2026-11-05". Recommendation: keep a formal approval record for each published version outside git.
5. **Admin key strength.** The admin key set during setup is short and easy to guess. Recommendation: replace it with a long random value, store it in a password manager, and confirm which of `ASSESSMENT_ADMIN_KEY` and `ADMIN_KEY` is set and remove the unused one. **Decision needed.**
6. **Test records on production.** Verification runs left test attempts behind. Recommendation: the owner decides whether to keep or remove them. A future change could add a documented "test" flag or an audited admin delete. Do not remove them with an ad-hoc statement.
7. **Pass threshold still present in code.** `gradeBattery` computes a `passed` flag against `pass_percent` (default 75), and the scoring keys carry that field. The flag is not written to the results table and no candidate or recruiter view reads it (verified 2026-11-05). Recommendation: remove the field, or document it as unused, so that nobody later shows a pass or fail.
8. **Time for the battery.** Raised to 20 minutes on 2026-11-05. Section 6 (group companies) content was written without a finance SME review. Recommendation: have a finance SME review g1–g3, and pilot the full exercise with experienced accounts payable staff before relying on the time limit or the scores.
9. **Scoring validity.** Nothing shows that the score predicts job performance. Recommendation: pilot, review the score distribution, and only then discuss cut-offs.
10. **Browser and device coverage.** Firefox and WebKit were not run after the latest changes. No physical-device or screen-reader testing has been done. Recommendation: run the full cross-browser suite and a short manual accessibility check before the next material change.
11. **Result email.** Live delivery is unverified. Recommendation: send one result email to a test address the owner controls, and check the content and the attempt numbering.

## 9. Stale documents to update or mark

- `BATTERY_V2.md` says 21 items, gives a pass threshold of 75 as a live setting, and says no real content is in the repository. The live battery has 23 items and the pass threshold is not shown to anyone.
- `OPEN_START_HANDOFF.md` says to apply migration `0003` and says "PR only". Migration `0003` is already applied and the pull request has merged. The policy text itself is current.
- `DEPLOYMENT_RUNBOOK.md` has a status log from 2026-11-03 and describes launch steps that have since happened. Mark its status log as historical.
- `TALENT_TREE_AP_ASSESSMENT_V1.md` is historical. It names `/assessment` as the target URL; the live URLs are under `/assessments`.

## 10. Do not

- Commit live question wording, options, answers, the marking key, candidate data or any secret value to this repository. It is public.
- Print or log the admin key, the encryption keys or the marking key.
- Touch the `tt-offers` database or the `DB` binding.
- Publish, merge, deploy or create live attempts without the owner's explicit approval for that action.
- Submit test attempts. Leave them to expire.
- Use the former client name anywhere.
- State validity, pass or fail, or predictive power for scores.
- Run ad-hoc `DELETE` or `UPDATE` statements on production data.

## 11. Glossary

- **Battery**: one timed assessment, format `battery-v2`, made of sections, items and a shared workbook.
- **Section**: a group of items. The live battery has five.
- **Item**: one question or task. Types are `single` (choose one), `multi` (choose all that apply), `text` (short answer) and `cell` (a formula or value in a workbook cell).
- **Activity**: the name used in the candidate interface for an item.
- **Version**: an immutable published snapshot of content and marking key. Attempts keep the version they started on.
- **Attempt**: one candidate's timed run. Repeat attempts are numbered.
- **Source tab**: a read-only workbook tab holding supplier or ledger records.
- **Working tab**: the writable tab where candidates enter formulas and values.
- **Practice**: an untimed, unrecorded exercise for candidates to try the controls.

## 12. Keeping this document current

Update the "Last updated" date and the status table whenever content, deployment or policy changes. Record what was checked, how, and on which date. Use the labels in the header. Do not record secrets, live content or candidate data. Keep the owner decisions in section 8 until they are answered.
