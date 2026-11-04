# Open assessment handoff

Branch: `feature/assessment-open-start`, based on main `4a139fa`. PR only; no merge, deployment command or remote migration is part of this change.

The current instructions supersede the earlier assessment design documents. The latest user decision retains actual results, removes automatic deletion and permits repeat attempts. The privacy notice and expectations now say that results/attempt history are retained and repeats are numbered. The previous 30-day deletion promise and one-attempt restriction are intentionally absent. No scheduled deletion Worker is included.

## Delivered behavior and files

- `/assessments` and `/assessments/<slug>` open the welcome, public practice and screening form. No invitation is required. Optional older invitation links remain supported. The live slug `ap-clerk-v1` and title `Accounts Payable Clerk Assessment` are unchanged. `AssessmentCatalog.jsx`, `AssessmentApp.jsx`, `CandidateAssessment.jsx`, `ScreeningFields.jsx` and assessment CSS contain this flow; the original logo, colors and fonts remain.
- `src/assessments/screening.js` validates the same fields on client and server. It normalizes South African phone numbers, checks ID date/citizenship/checksum, uses South African calendar dates for tomorrow–90 days and excludes weekends, and enforces travel/availability requirements and text limits. Screening never enters grading.
- Migration `0003_candidate_screening.sql` adds private candidate columns and the assessment-scoped identity/attempt history. Every open start creates an internal redeemed invitation to satisfy the existing non-null foreign key. Candidate, internal invitation, ordinal and attempt commit in one D1 batch. Repeated IDs get separate candidate/attempt rows and consecutive ordinals, including concurrent starts. Existing rows display Attempt 1; their IDs were never collected, so historical attempts cannot be linked retrospectively.
- `candidate-privacy.js` stores the full ID as AES-256-GCM ciphertext with a random 12-byte nonce in `candidates.id_number_encrypted`. A separate HMAC-SHA256 key hashes assessment ID + ID number for matching. No raw ID/hash/ciphertext is returned by candidate or recruiter APIs; no decryption endpoint exists. Full normalized contact is stored in private D1, with only masked contact and first-six/last-four ID in report/email projections. Keep encryption-key access restricted to authorized maintainers and preserve keys securely.
- `practice.js`, `AssessmentPractice.jsx` provide single-choice, multi-select and formula practice in React memory only. Immediate feedback includes the practice answer. No start/save/submit calls occur during practice. `practice-isolation.js` checks prompts/options/resolved answers and whole source-table fingerprints against a private battery; publish/start refuse overlap. Incidental cell values and format/function identifiers do not count as reused tables. `scripts/check-assessment-practice.mjs` accepts a PRIVATE out-of-repository JSON file containing `question_payload` and `scoring_key` and prints only a safe verdict.
- `candidate-results.js` explicitly projects the overall score, section percentages and title/percentage-based feedback. The 75% wording split changes only the tone of feedback; it is not a pass mark, does not affect scores, and produces no pass/fail decision. Completion, refresh and timeout show this projection and the required caveat, without questions, answers, keys, item review, workbook solutions, flags or recruiter interpretation. Attempts are numbered in candidate results, recruiter lists/reports and result emails.
- `assessment-core.js` normalizes authored branding text without rewriting IDs, formulas or candidate evidence. Unconvertible authored identifiers/source content are rejected before Start allocates a timer; the private content owner must review them. Candidate-supplied names/answers do not disable reporting and are not treated as authored branding. The tracked-file test scans every tracked file except `AUDIT_REPORT.md`; the withheld name is constructed from character codes so the scanner itself does not introduce it. Historical assessment documents have been rewritten as Talent Tree/client withheld.
- Existing timer, save, submit transaction, scoring, deadline, independent admin authentication and email delivery/retry logic remain in use. The result email adds masked screening and attempt number while retaining recruiter marking detail. Offers DB/R2/config are unchanged.

## Required setup before any future deployment

Production already has 0001 and 0002 applied and recorded. Apply **only `0003_candidate_screening.sql` and record it in `d1_migrations`**. Do not replay 0001/0002 and do not edit them. Prefer the normal Wrangler D1 migrations apply workflow after confirming it recognizes the recorded first two migrations. Back up and verify the target assessment DB first; do not touch offers data.

Configure separate private Pages secrets for each intended environment before opening starts:

- `ASSESSMENT_ID_HASH_KEY`: stable high-entropy value of at least 32 characters. Changing it breaks matching/number continuity with existing retained attempts.
- `ASSESSMENT_PII_KEY`: base64 encoding of exactly 32 cryptographically random bytes. Keep prior keys recoverable if a future authorized rotation is needed to read existing encrypted IDs; this change provides no rotation/decryption workflow.

Keep existing `ASSESSMENT_ADMIN_KEY` and email configuration. `scripts/assessment-local.mjs` generates isolated local keys in git-ignored `.dev.vars`, without printing them. No production secret was created or changed.

## Verification

The final integrated checks and environment limitations are recorded below. All browser data and committed screenshots are synthetic, with trivial public test content, never the live private battery.

| Command | Outcome |
| --- | --- |
| `npm test` | 302 passed, 0 failed |
| `npm run build` | Pass |
| `node scripts/assessment-local.mjs migrate` | Local migration 0003 passed, 13 statements |
| `CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test tests/browser/open-start.spec.mjs --grep 1280px` | 1 failed to launch: requested executable does not exist |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser` | 19 passed, 0 failed |
| `git diff --check` | Pass before final review |
| `wrangler whoami` (read-only, without printing credentials) | Failed: Cloudflare codes 6003/6111, invalid Authorization-header format |

Screenshots: [welcome 390](screenshots/open-start/welcome-390.png), [form 390](screenshots/open-start/form-390.png), [practice 390](screenshots/open-start/practice-390.png), [results 390](screenshots/open-start/results-390.png); [welcome 1280](screenshots/open-start/welcome-1280.png), [form 1280](screenshots/open-start/form-1280.png), [practice 1280](screenshots/open-start/practice-1280.png), [results 1280](screenshots/open-start/results-1280.png).

## Not verified

- The real published private battery was not read: the configured Cloudflare credential is present, but the API rejected its Authorization-header format. Synthetic isolation tests and the runtime/publish guard pass; actual live-payload isolation must still be checked privately before deployment. No live content/key was put in GitHub or logs.
- Remote account/project bindings, Access protection, production migration, real email delivery and deployed behavior were not verified or changed. No protected preview URL is claimed for this PR-only request.
- The required `/opt/pw-browsers/chromium` binary is unavailable. Browser verification uses the installed `/usr/bin/chromium`; the failed exact-path attempt is reported above.
- Existing local Wrangler warnings about two redirect rules and fallback Request.cf metadata are outside this assessment change. The relevant website regression routes are included in browser checks.
