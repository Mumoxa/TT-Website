# AP assessment delivery evidence — 2026-11-03

Historical document. Current open-start behavior and retained-results policy: [OPEN_START_HANDOFF.md](OPEN_START_HANDOFF.md).

Status: verified locally; remote preview and production launch remain blocked.

## Completed and checked

- `npm ci --no-audit --no-fund`: succeeded using the existing lockfile.
- `npm test`: 22 test files passed, none failed/skipped. New API tests use real SQLite with a D1 adapter (15 API cases).
- `npm run build`: succeeded with Vite 8.1.5. There are no separate lint/typecheck scripts.
- `npx playwright test`: five Chromium workflows passed against isolated LOCAL Pages/D1: workbook calculations/editing/paste/undo/refresh/mobile layout; duplicate-tab recovery; admin sign-in/private draft/report/PDF; lost-save-response recovery; existing website routes and anonymous private-API denial.
- SQL save boundary: accepted at 599999 ms; rejected at 600000 and 600001 ms. Also tested upload crossing expiry, concurrent starts/saves/submits, one final result, interrupted grading repair, revoked/expired invitations and cross-candidate session switches.
- Local schema query confirmed all eight application tables. Local migration rerun is idempotent. No remote schema claim is made.
- Existing LOCAL offers login/list and demo API regression checks passed after restarting the earlier local process. Offers implementation files and migration are unchanged.
- Built JS excludes synthetic question text, leakage sentinels and server-grading interpretation text. Changed-file credential pattern scan and git diff whitespace check passed; these are bounded checks, not a security certification.
- Generated PDF text confirms saved formulas, calculated evidence and audit records; its embedded official logo image was confirmed. Candidate mobile screenshot inspected; no page overflow at 390 px. Artifacts remain ignored under `.wrangler/browser-results/`.

## Review

A separate read-only reviewer identified missing admin repair after interrupted grading and ignored title/client edits in existing drafts. Both have failing-then-passing SQL regressions. New version metadata stays private and immutable. No production writes or merge occurred.

## Remote blockers and approvals

Cloudflare `wrangler whoami` still reports unauthenticated after retry. The active machine has no Cloudflare token binding and its policy still denies api.cloudflare.com; GitHub PR API requests also return Forbidden. Required network domains and a Cloudflare token requirement were saved in the environment draft. Draft persistence is not runtime propagation or publication.

No preview URL exists from this work. Effective Pages configuration, current preview schema, Access policies, remote secrets and impact on other preview deployments are unverified. Do not push yet: Git auto-deploy could affect a shared preview before that impact is known. The local feature commit may be reviewed safely.

The approved Talent Tree questions/marking key are absent. Synthetic fixtures were used only locally. Private authoring is ready; real content, privacy/disclosure/retention wording and an AP expert pilot need human approval. Automated deletion is not implemented. Browser print PDF and the bounded 6×20 Excel-like grid are the supported capabilities; no Microsoft Excel equivalence is claimed.

Production launch steps and safe preview gates: DEPLOYMENT_RUNBOOK.md. Approval draft: PRIVACY_AND_CONTENT_APPROVAL_DRAFT.md. Production assessment migration, main merge/deployment and real invitations require explicit final approval. Existing offers DB/R2 and tallo-db must remain untouched.

## Files changed in this delivery

- `docs/assessments/DEPLOYMENT_RUNBOOK.md`
- `docs/assessments/PRIVACY_AND_CONTENT_APPROVAL_DRAFT.md`
- `docs/assessments/VERIFICATION_REPORT.md`
- `docs/superpowers/plans/2026-11-03-ap-assessment-completion.md`
- `functions/api/assessment/[[path]].js`
- `functions/lib/assessment-admin.js`
- `functions/lib/assessment-core.js`
- `package.json`
- `playwright.config.mjs`
- `scripts/assessment-local.mjs`
- `src/assessments/AssessmentAdmin.jsx`
- `src/assessments/AssessmentApp.jsx`
- `src/assessments/CandidateAssessment.jsx`
- `src/assessments/Spreadsheet.jsx`
- `src/assessments/admin-assessments.css`
- `src/assessments/candidate.css`
- `src/assessments/formulas.js`
- `src/assessments/spreadsheet.css`
- `src/assessments/workbook.js`
- `tests/assessment-api.test.mjs`
- `tests/assessment-formulas.test.mjs`
- `tests/assessment-request.test.mjs`
- `tests/assessment-scoring.test.mjs`
- `tests/assessment-workbook.test.mjs`
- `tests/browser/assessment.spec.mjs`
- `tests/fixtures/synthetic-assessment.mjs`
- `tests/helpers/assessment-db.mjs`
- `wrangler.toml`
