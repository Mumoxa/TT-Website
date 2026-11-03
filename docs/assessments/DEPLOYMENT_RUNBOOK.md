# Talent Tree AP Assessment — Cloudflare launch runbook

Branch: feature/ap-assessment-platform
Draft PR: https://github.com/Mumoxa/TT-Website/pull/33
Target: https://talenttree.co.za/assessment
Admin: https://talenttree.co.za/admin/assessments

STATUS: Code implemented only on draft GitHub feature branch. Not production ready.

## Verified existing environment

- React/Vite, Cloudflare Pages Functions and Cloudflare Pages production deployment.
- Current DB binding: DB -> tt-offers; R2 binding: PDF_BUCKET -> tt-offers-private.
- Existing ADMIN_KEY secret and signed admin cookie from /api/admin/login.
- Real Talent Tree logo imported from root PNG; colour tokens and Fraunces/Inter fonts from src/styles.css.
- Mumoxa/TT-Website is PUBLIC. Live questions, marking keys, private tokens or candidate data must NEVER be committed to GitHub.

## Human Cloudflare operator checklist

1. Confirm correct Cloudflare account/Pages project and back up existing offers state before changes.
2. Check out the feature branch locally. Run npm ci, npm test, npm run build.
3. Create dedicated production and preview D1 databases:

    npx wrangler d1 create tt-assessments
    npx wrangler d1 create tt-assessments-preview

4. Add to wrangler.toml while preserving the existing bindings:

    [[d1_databases]]
    binding = "ASSESSMENT_DB"
    database_name = "tt-assessments"
    database_id = "<REAL_D1_ID>"
    preview_database_id = "<REAL_PREVIEW_D1_ID>"
    migrations_dir = "migrations/assessments"

   REPLACE the placeholder IDs with the actual Wrangler output BEFORE committing this config. Never guess IDs. Also configure the binding in Pages dashboard where the current deployment requires dashboard-managed bindings.

5. Apply to isolated preview D1 and inspect:

    npx wrangler d1 migrations apply tt-assessments --preview
    npx wrangler d1 execute tt-assessments --preview --command "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"

6. When ready, apply against production D1:

    npx wrangler d1 migrations apply tt-assessments --remote
    npx wrangler d1 execute tt-assessments --remote --command "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"

   Expected tables: assessment_definitions, assessment_versions, candidates, invitations, attempts, workbook_snapshots, results, audit_events.

7. Confirm ADMIN_KEY remains a secret configured in Cloudflare, never a browser or GitHub value. Add Cloudflare Access/other strong policy for dashboard and /api/assessment/admin/* as defense in depth; rate limit public start/invite verification paths.
8. Review/approve candidate privacy notice, retention/deletion policy, employer disclosure, accommodations, support contact and abuse protections.
9. Privately author and publish the real SATURC five-question + reconciliation assessment via the protected /admin/assessments setup page. Its marking key is stored only in D1. Never check it into GitHub. Do not reuse the synthetic test fixture as a real exam.
10. Create test invitations for qualified AP staff and less experienced processors. Test exact 600-second expiry, sheet calculations, undo/edits, autosave, refresh, duplicate tabs, submission conflicts, candidate identity and final report.
11. Verify Cloudflare Pages preview build, full D1 integration, PDF print layout, admin access protection and that candidate APIs never leak correct answers.
12. Pilot/cross-check thresholds with actual AP experts. Only then deliberately approve/merge the PR to main and issue production invitations.

## Candidate experience

- /assessment?invite=<random-once-token>, name/surname/email/acknowledgement, start button.
- Exactly 600 seconds from server-committed start, not registration. Browser countdown is informative only.
- Five applied technical questions plus a live spreadsheet-like reconciliation with formula bar, basic formulas, paste and read-only source records.
- Autosave / refresh uses a revision number. Backend rejects edits after expiry and scores last saved state.
- One invitation authorises a single attempt, with recruiter-issued new token for retake.

## Private reporting

- Existing Talent Tree admin login, private results table, secure invitations, assessment version publishing, response breakdown and read-only workbook replay.
- Browser Print/Save PDF from detailed report. Email is OPTIONAL and not implemented in this first version.
- Candidate never receives correct answer keys or their score via public API.

## Explicit limitations

- The V1 workbook is an Excel-LIKE calculation grid, not Microsoft Excel or a full spreadsheet editor. It supports 6 columns x 20 rows, formulas with SUM/ABS/MIN/MAX, arithmetic/cell references and tabular paste. Full Univer integration is not installed; if required before launch, integrate @univerjs/presets and @univerjs/preset-sheets-core together with matching npm lockfile and browser testing.
- No production D1 or Pages binding has yet been created by this draft branch.
- Tests currently cover pure scoring, time-limit boundaries, formula maths, branding and input safeguards, but not end-to-end Cloudflare/D1 integration.
- An unsupervised ten-minute work sample is preliminary evidence, not conclusive proof of independent full-function Accounts Payable ability.
- A candidate's entered name and email are not identity verification.
