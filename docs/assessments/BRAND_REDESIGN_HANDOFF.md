# Assessment brand redesign handoff — 4 November 2026

Historical document. Current open-start behavior and retained-results policy: [OPEN_START_HANDOFF.md](OPEN_START_HANDOFF.md).

Branch: `feature/assessment-brand-redesign`, based on `main` commit `51b06c6`.
Prepared for pull-request integration. The PR and Git history record the commit and merge status. No direct deployment or Cloudflare settings change was performed.

## Delivered

- Public `/assessments` catalogue and `/assessments/<slug>` welcome pages with loading, error, empty and unavailable states.
- New GET `/api/assessment/catalog` returns a bare array; every item contains only `slug`, `title`, `client_name`, `duration_minutes`, `section_titles` and `item_count`. It lists published definitions with published current versions only. Questions, options, answers, workbook data and keys are not returned.
- Original logo and existing CSS tokens, Fraunces headings and Inter body/tables/timer; assessment-specific chrome replaces marketing text and the footer. Candidate client/title are dynamic.
- Invitation-only Start remains at `/assessment?invite=...` and works from slug URLs with invitations. Without an invite, no form is rendered and the required recruiter message appears. Both existing POPIA paragraphs are unchanged.
- Sticky header timer, 16px mobile gutters, visible focus rings and minute-only live announcements. The countdown computation and expiry callback are unchanged.
- Recruiter sign-in/results restyled, with candidate/status/score/started/View columns, search and responsive rows. Branded print tables/headings and the existing print workflow remain.

## Verification commands and outcomes

Final checks:

| Command | Result |
| --- | --- |
| `npm test` (baseline) | `ℹ tests 25` / `ℹ pass 25` / `ℹ fail 0` / `ℹ skipped 0` |
| `node tests/assessment-catalog.test.mjs` | `ℹ tests 4` / `ℹ pass 4` / `ℹ fail 0` / `ℹ skipped 0` |
| `npm test` (final) | `ℹ tests 26` / `ℹ pass 26` / `ℹ fail 0` / `ℹ skipped 0` |
| `npm run build` | Exit 0; `✓ built in 464ms`. Build has no test count. |
| `CHROMIUM_PATH=/usr/bin/chromium npx playwright test` | `16 passed` / 0 failed / 0 skipped |
| `CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test` | `16 failed`: executable is absent; none reached application assertions. |
| `git diff --check` | Exit 0, no whitespace errors. |
| Protected-file diff check | Exit 0: scoring, auth, deadlines, email, schema, security headers, Cloudflare config, dependencies and workbook calculations unchanged. |

There is no decrease in existing tests: baseline 25 → final 26 unit test files; seven existing browser workflows retained and nine new browser cases added.

Intermediate failures were investigated and fixed: the catalogue tests initially failed because the endpoint was absent (three failed); a legacy nested-metadata regression failed before the strict format/type allowlist fix (then four passed); an existing branding source-format assertion failed before CSS spacing was restored; the first installed-browser full run reported `13 passed` and `1 failed` because its virtual clock disagreed with the real status poll. The clock-controlled test then reported `1 passed`. Independent review reproduced two presentation issues (long-word mobile overflow and a slug/invitation metadata mismatch); both regression tests initially reported `2 failed` and both pass in the final 16-test suite. The initial new-tests-only run using the requested unavailable binary reported `7 failed` for the same launch-path issue.

The requested `/opt/pw-browsers/chromium` path does not exist. `/opt` is root-owned, the current user cannot create the path, and sudo is unavailable. The installed `/usr/bin/chromium` successfully ran every browser test. This environment limitation remains explicit; no binary-path fallback was hidden in repository configuration.

## Scope checks

Direct comparison with main confirms byte-for-byte preservation of registration validation/Start payload, candidate save/autosave/conflict/status/submission code, timer calculations/callback and both POPIA paragraphs. Existing API response shapes were not edited; the API dispatcher diff only imports and registers the new catalogue handler. No schema, scoring, admin credential/session, workbook formula implementation, security headers, lockfile or Cloudflare file changed.

An independent read-only review checked these boundaries and catalogue leakage. Its two findings were fixed with failing-then-passing browser coverage. All data used in browser runs and screenshots is synthetic local data; the catalogue screenshots use controlled public metadata. No real content was added and no screenshots or data fixtures were committed.

## Screenshots and artifacts

Twelve screenshots (catalogue, welcome, runner, recruiter sign-in, results and report at both 390 px and 1280 px) were captured with deviceScaleFactor 2. PNG widths are 780 px and 2560 px respectively. They are exported outside the checkout to:

`/workspace/artifacts/assessment-brand-redesign/`

- `index.html`: linked screenshot gallery.
- `screenshots.zip`: all 12 PNGs, gallery and synthetic print report.
- `synthetic-report.pdf`: output from the unchanged browser print workflow.
- Verification logs for baseline/final unit runs, build, successful browser run and requested-path failure.

Screenshot files: `catalogue-390.png`, `catalogue-1280.png`, `welcome-390.png`, `welcome-1280.png`, `runner-390.png`, `runner-1280.png`, `admin-sign-in-390.png`, `admin-sign-in-1280.png`, `admin-results-390.png`, `admin-results-1280.png`, `admin-report-390.png`, `admin-report-1280.png`.

## Decisions and remaining limits

- `/assessment` stays available and is never redirected to the catalogue. Starting remains invitation-only.
- Catalogue content comes from published D1 definitions, not a hardcoded live assessment. No real assessment is seeded by this change. An empty database deliberately shows the requested empty state.
- Battery section titles/counts come from the published version. The legacy work sample has two sections and counts its practical reconciliation as one activity in addition to its technical questions.
- A valid invitation is authoritative if its metadata differs from the URL slug. The form validation and Start request are unchanged.
- The existing relative import in nested assessment files is `../../Talent Tree Logo 2026 (1).png`; it resolves to exactly the same original asset as the `../` import in `src/main.jsx`. No asset was copied or altered.
- No document-level horizontal overflow at 390 px or 1280 px. The workbook retains its existing internal scroll area to preserve spreadsheet controls.
- The only unfulfilled command detail is the unavailable requested Chromium binary path; equivalent installed Chromium verification passed. No production verification is claimed or requested.

## Files changed

- `docs/assessments/BRAND_REDESIGN_HANDOFF.md`
- `functions/api/assessment/[[path]].js`
- `functions/lib/assessment-catalog.js`
- `src/assessments/AssessmentAdmin.jsx`
- `src/assessments/AssessmentApp.jsx`
- `src/assessments/AssessmentCatalog.jsx`
- `src/assessments/CandidateAssessment.jsx`
- `src/assessments/admin-assessments.css`
- `src/assessments/assessment.css`
- `src/assessments/catalog-client.js`
- `src/main.jsx`
- `tests/assessment-catalog.test.mjs`
- `tests/browser/assessment-design.spec.mjs`
