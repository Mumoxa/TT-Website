# Talent Tree | Accounts Payable Assessment Platform — V1 build contract

Historical document. Current open-start behavior and retained-results policy: [OPEN_START_HANDOFF.md](OPEN_START_HANDOFF.md).

Status: **PLANNING / NOT PRODUCTION READY**
Target: **https://talenttree.co.za/assessment**
Brand: **Talent Tree**; client withheld. Accounts Payable / Creditors Clerk
Time limit: **600 seconds, enforced by the server**

## 1. Source-of-truth repositories and boundaries

**Host application**: \`Mumoxa/TT-Website\`, React/Vite, Cloudflare Pages; \`npm run build\` -> \`dist\`. Public URL and visual identity must remain Talent Tree's. Routes are hand-dispatched inside \`src/main.jsx\`. The existing /admin catchall MUST be considered when adding /assessment/admin or /admin/assessments. Existing Cloudflare Pages Functions and \`DB\` binding serve confidential offers.

**Reference implementation only**: private \`Mumoxa/Talza\`; do not import Talza's branding, candidate marketplace, Talza production database, admin cookies, or client data. Inspect/reuse patterns from:
- \`public/candidate/js/models/runner.js\`: run state, resume and autosave;
- \`functions/api/_handlers/assessment.js\`: persisted questions and submission provenance;
- \`functions/api/_formula_engine.js\`: bounded formula evaluation concepts;
- \`migrations/0064_reconciliation_controls.sql\`: transaction matching, supplier-account reconciliation and control-account logic;
- \`migrations/0065_core_finance_work_sample_optimisation.sql\`, \`0066_auto_scored_admin_work_samples.sql\`: structured, deterministically auto-scored tasks;
- \`migrations/0035_assessment_time_limits_and_attempt_cap.sql\`: attempts and time-limit precedent.

**Public repository warning**: `Mumoxa/TT-Website` is a **public** GitHub repository. Real live questions, scenario data, answer keys, scoring thresholds that disclose correct answers, secret invitation lists, and unpublished assessment versions must **NOT** be committed in source code, SQL migration seed files, public fixtures, client bundles or GitHub issues. Store published assessment content and private answer rubrics in protected D1 records, provisioned through authenticated admin tooling or a secure out-of-repository seeding process. Public code may contain only plainly labelled synthetic demos with no overlap with production questions. Assume Git history is accessible even after deletion.

**Security warning**: Talza's examined submit handler flags excessively late submissions rather than strictly rejecting post-deadline writes. This is NOT acceptable for Talent Tree's 10-minute hard stop. Implement new server-validated deadlines, atomic state changes, and finalisation using the last data saved before expiry.

## 2. Non-negotiable visual identity

Reuse the **actual logo** already imported in \`src/main.jsx\`:
\`import talentTreeLogo from '../Talent Tree Logo 2026 (1).png';\`.
Reuse the image itself at all assessment breakpoints; do not invent, replace, restyle or redraw the logo. No unrelated Talent Tree logo from web image search. Talent Tree is displayed as client text unless an approved client logo asset is supplied.

Never hardcode a competing palette. Import \`src/styles.css\` and use the actual site CSS tokens:

| Token | Confirmed current value | Application |
|---|---|---|
| \`--ink\` | \`#0e2a3a\` | Content text |
| \`--ink-deep\` | \`#071f2d\` | Dark hero/header |
| \`--ink-abyss\` | \`#041722\` | Deep surface |
| \`--paper\` | \`#f4f1ea\` | Page background |
| \`--paper-soft\` | \`#fbf9f4\` | Cards/workspaces |
| \`--accent\` | \`#006da3\` | Accent/focus/links |
| \`--accent-bright\` | \`#5ab9e8\` | Accent against dark backgrounds |
| \`--accent-soft\` | \`#d9eaf3\` | Subtle selection and emphasis |
| \`--muted\` | \`#4f6b7a\` | Secondary text |

Fonts: Fraunces for editorial headings, Inter for inputs, tables, timer and body copy. Preserve existing site's restrained lines, radius, spacing and button language. Spreadsheet cells must remain legible in a neutral worksheet surface even if app chrome uses navy/cream. No decorative background photos.

Brand checklist: welcome, timed assessment, expiry/complete and admin report all feature the real logo, typography and tokens. Main website styling and existing offers, CV and specs tools must not regress.

## 3. Candidate experience

1. Visit /assessment (or invited /assessment?invite=...); client title "Talent Tree | Accounts Payable Competency Assessment".
2. Welcome explains: **10 minutes**, 5 scenario questions + practical spreadsheet reconciliation, autosave, timer begins only upon pressing Start, irreversible expiry. Recommend desktop/laptop for workbook; do not block accessible alternative input.
3. Enter **first name, surname and email address**; display concise POPIA-compatible purpose, reviewer, retention and contact notice. An email alone is *not verified identity*. For a controlled first cohort, use a per-candidate invitation capability token; never assume a name/email pair proves identity.
4. Candidate presses Start. Server creates or resumes ONE attempt tied to token, returns server \`started_at\` and \`expires_at\`, plus answer-free question payload. Timer starts at this committed moment, not at initial page load or registration.
5. Main assessment: 5 applied scenario MCQs (3 min suggested) and editable spreadsheet work sample (6 min suggested); reading/submission allowance within the **same** 600-second hard cap. Display sticky remaining time and save status. Accessible layout with full-width spreadsheet on desktop; stack on smaller screens.
6. Autosave answer changes immediately or after a short debounce, preserving latest server-confirmed state. Resume after reload without extending expiry. If save is pending, show "Saving..." rather than "Saved".
7. On reaching 600 seconds, server rejects any further changes. Finalise the last successfully persisted, pre-deadline answers; client shows "Time expired — your saved work has been submitted." Do not rely on browser timer, auto-submit, network connectivity or a scheduled cron to enforce expiry.
8. Final view confirms receipt only, never exposes marking keys or other candidate results. Retakes are admin-controlled.

## 4. Practical workbook requirement

Use a **genuine in-browser spreadsheet component** (evaluate Univer Sheets core in the existing React/Vite build). The assessment is NOT only a set of multiple-choice questions disguised as a sheet.

Workbook tabs:
- **Supplier Statement** — read-only source transactions, debit/credit conventions clearly marked.
- **Company Ledger** — read-only internal transaction list.
- **Reconciliation** — editable working cells, formula bar, basic spreadsheet formulas, cell selection, copy/paste where supported, and task response fields.

The candidate should be able to calculate differences and match references in a sheet, then record which transactions are missing, duplicated, misallocated or timing-related, what should happen next and the corrected outstanding balance. Preserve formulas and final cell values in a versioned workbook snapshot for recruiter review. Define worksheet edit permissions; candidates must never edit source data or get hidden answer sheets. Limit workbook dimensions and saved JSON size. Formulas must be evaluated/validated securely server-side or the results independently checked by deterministic server grading, NOT by trusting client-reported values.

## 5. Scoring contract (provisional; calibrate before hiring use)

Total 100 points:
- 5 technical scenario questions x 8 = 40
- 3 independent discrepancy identifications x 10 = 30
- supported corrective actions = 20
- corrected closing balance = 10

Reconciliation portion carries 60 points. Flag unsafe actions (e.g. pay from unverified bank details, force unsupported balancing journals). The score report must show *what was actually demonstrated*, not assert full AP competence from one short test. A suggested shortlist threshold can be 80/100 with 45/60 on reconciliation, but it is NOT a validated employment-selection threshold. Pilot with experienced AP staff and confirm 600 seconds is realistic. Randomise equivalent scenarios and persist the assessment version and answer-key version used.

Keep answer keys and scoring algorithms on the server only. No public access to another candidate's marked workbook or report. Prefer structured auto-scoring and preserved workings; do not use black-box AI grading or unreviewable subjective scores.

## 6. Backend / database

Use a separate D1 database **\`tt-assessments\`**, bound as **\`ASSESSMENT_DB\`** on the existing Cloudflare Pages project, to isolate candidate result data from confidential offer tables. Do **not** add a fake database_id; create the real D1 instance first and bind with its returned UUID.

Minimum tables:
- \`assessment_definitions\`: client, slug, duration, status and current published version.
- \`assessment_versions\`: immutable question/scenario version and scoring version.
- \`candidates\`: first name, surname, normalised email, timestamps.
- \`invitations\`: opaque token hash, client/assessment, expiry, intended email (if known), redemption state.
- \`attempts\`: id, candidate, invitation, version, started_at, expires_at, status, completed_at, duration; one active attempt per authorised invitation.
- \`responses\`: MCQ and structured discrepancy/action selections.
- \`workbook_snapshots\`: bounded JSON containing editable cell values and formulas plus monotonically increasing version and saved_at.
- \`results\`: score breakdown, integrity flags, deterministic grader version, scored_at.
- \`audit_events\`: immutable important events (created, started, saved, expired, submitted, report viewed, reset).

Use D1 transactions/conditional UPDATE WHERE status='active' AND expires_at > server_now, returning a conflict for expired or closed attempts; avoid races across concurrent save/submit calls. Server MUST not accept an altered \`started_at\`, \`expires_at\`, answer key or score from the browser. Time source is server-side UTC. Run a finalisation pass on attempt GET/POST and admin listing when needed so abandoned/expired attempts still report. Append-only attempt history; don't overwrite completed attempts on retake.

## 7. Authentication, security and POPIA

- Candidate: invitation token + short-lived HttpOnly Secure SameSite cookie, opaque token hash in DB, one-use/attempt policy; rate limit candidate registration and start.
- Admin: protected /admin/assessments page and API using Cloudflare Access or a properly verified existing server-side admin session, NOT merely an unlisted URL or a client-side password check. Reuse existing \`ADMIN_KEY\` only after its access implications and session scope are reviewed; do not expose it to browser code.
- Separate least-privilege database access and no assessment data in GitHub; no real candidate information in fixtures/tests.
- Secrets in Cloudflare secret variables only. Never commit \`.dev.vars\`, credentials, invitation tokens or production data.
- Strong CSP as permitted by spreadsheet library; sanitize report rendering and all candidate-provided text. Bound request body sizes and workbook sizes. Enforce IDOR protection on all read/write endpoints. Use normal data retention/deletion and access logging; obtain documented data processing approval for sharing assessment findings with the employer.
- Identity remains *self-declared* until recruiter verifies, despite email/name fields.

## 8. Recruiter dashboard and reports

At /admin/assessments: private candidate list (name, email, client, timestamp, time spent, status, overall mark, MCQ mark, reconciliation mark, critical flags). Detail report includes selected answers, identified discrepancies, action choices, corrected figure and **read-only replay of saved workbook (including formulas)**. Provide printable Talent Tree-branded PDF, CSV export and optional email notification. Email is a notification, NOT the sole source of results. Report should say "short practical screening evidence" and specify untested areas (production-volume accuracy, systems fluency and independent deadline delivery).

## 9. Engineering file map

Anticipated additions (implementation agent should verify conventions before editing):
- \`src/assessments/AssessmentApp.jsx\`, \`src/assessments/assessment.css\`
- \`src/assessments/Workbook.jsx\` (lazy-load spreadsheet dependencies only in assessment runner)
- \`src/assessments/AssessmentAdmin.jsx\`
- \`functions/api/assessment/[[path]].js\` and \`functions/lib/assessment*.js\`
- \`migrations/assessments/0001_init.sql\` and seeded synthetic versioned fixture.
- \`tests/assessment-*.test.mjs\`.
- Existing \`src/main.jsx\`: add lazy route(s) BEFORE general \`/admin\` catchall.
- Existing \`wrangler.toml\`: add real \`ASSESSMENT_DB\` D1 binding only after creation; keep existing \`DB\` and \`PDF_BUCKET\` bindings untouched.

## 10. Required acceptance tests before production

- Logo visual/alt text verified at every route; same brand tokens and fonts as live Talent Tree.
- Registration validates names/email; unique invite cannot be reused; no result shown to candidate.
- Timer begins only when server accepts Start; refresh, tab close, local clock changes, route changes and duplicate tabs do NOT reset expiry.
- At deadline +1 ms, API refuses any answer mutation. In-flight save that reaches server after expiry is rejected. Last pre-deadline saved workbook is preserved and marked.
- Verify race between save and submit; exactly one final result and version, no double-scoring.
- Multiple MCQ/workbook attempts are isolated; no cross-candidate access.
- Spreadsheet formulas actually work; source tabs read-only; edited formulas and workbook state survive refresh.
- Server-side grading is independent of candidate-reported scores; negative and partial credit rules tested with synthetic fixtures.
- /admin/assessments and report API deny unauthenticated access; access audited. Data export sanitised.
- Build and existing \`npm test\` pass; existing marketing, offers, specs and CV routes unaffected.
- Test on desktop and small screens; screen-reader labels and keyboard navigation; give candidates a reasonable accommodation mechanism without silently extending the standard 10-minute clock.
- Pilot with verified AP experts and a handful of AP processors; review distribution before treating cut-offs as predictive.

## 11. Deployment gate

Do not merge or advertise /assessment to candidates until: D1 created and migrated, binding active in preview and production, server tests pass, spreadsheet integration verified, admin protection verified, privacy notice approved, pilot and scoring calibration completed, and smoke tests pass on a Cloudflare Pages preview deployment. Production launch requires a deliberate merge/deploy decision.
