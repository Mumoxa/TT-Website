# Talent Tree AP assessment — preview and launch runbook

Status: local implementation and synthetic browser validation completed on the
feature branch. Remote Cloudflare settings, existing preview impact and preview
schema are NOT verified from this machine. No remote writes, production migration,
real invitations, deployment or merge have been performed.

## Project and configuration

Project: `tt-website`. Feature branch: `feature/ap-assessment-platform`.
Draft PR: https://github.com/Mumoxa/TT-Website/pull/33.
Candidate `/assessment`; recruiter `/admin/assessments`.

`wrangler.toml` preserves production DB → tt-offers
(`4eafef72-b7cc-4e83-8681-fac4893711fd`) and PDF_BUCKET → tt-offers-private.
Production ASSESSMENT_DB → tt-assessments
(`b8e74387-6b66-4dd1-beab-78a1aac12231`). Explicit `env.preview` binds ONLY
ASSESSMENT_DB → tt-assessments-preview
(`de7ee76a-f8ae-4a39-bae4-d1e135bbec95`) and no R2. Do not deploy this config until
it has been compared with the effective Pages configuration and existing previews.
Other preview offer functionality would be unavailable with these isolated bindings;
that shared-preview impact requires explicit approval before applying a change.
No changes to tallo-db are needed or authorised.

Official documentation checked through Cloudflare's current documentation source:
https://developers.cloudflare.com/pages/functions/wrangler-configuration/ and
https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/functions/wrangler-configuration.mdx.
Wrangler used: 4.129.1. `env.preview.d1_databases` overrides the non-inheritable
binding list; `preview_database_id` alone is not a substitute for Pages environment
configuration. Wrangler configuration becomes deployment source of truth.

## Local reproducible workflow

Use Node 24 and the existing isolated checkout; no new worktree is required.

```sh
npm ci
npm test
npm run assessments:dev
```

The last command builds, applies LOCAL schema only, and serves port 8790. It uses
`.wrangler/assessment-sandbox` as its own Pages/package root, copies build assets,
links existing functions, generates a separate local ASSESSMENT_ADMIN_KEY without
printing it, and persists ONLY the assessment DB in `.wrangler/assessment-state`.
The separate package root is essential: Wrangler resolves the temporary worker's
configuration using the nearest package.json. Do not omit it or silently fall back
to the parent offers config. Inspect reported bindings before testing.

In another terminal, `npm run test:browser`. Chromium defaults to `/usr/bin/chromium`;
set CHROMIUM_PATH if needed. Tests create only synthetic local records and write the
printable report to `.wrangler/browser-results/synthetic-report.pdf`.
`node scripts/assessment-local.mjs verify` lists the eight application tables.
`npm run dev` continues to serve frontend-only development. The existing offers
workflow is unchanged; never use offers migrations to initialize assessments.

## Authentication and controls

Assessment admin now uses ASSESSMENT_ADMIN_KEY and a separate HMAC-signed HttpOnly,
SameSite=Strict cookie scoped to `/api/assessment`, Secure on HTTPS. Existing
ADMIN_KEY and offer cookies grant no assessment access; the assessment cookie grants
no offer access. Store separate production and preview assessment admin keys as Pages
secrets; never put them in TOML, GitHub or VITE variables. Do not rotate or overwrite
existing preview secrets without checking impact and obtaining approval if shared.

Candidate session tokens are random, hashed in D1, and cookie-scoped. Saves are tied
to attempt ID and cookie, use revision compare-and-set and a DB-clock deadline. Final
submission saves and closes atomically; repeated submissions return the same receipt.
The server grades closed saved state, never client scores. A conflict stops automatic
retries until the candidate explicitly loads server work. No localStorage holds PII.

Public invite/start/admin-login requests have a persistent hashed-source 30/minute
limit. This is application protection, not proof of Cloudflare WAF configuration.
Source-IP headers rely on Cloudflare's trusted edge; protect the remote preview with
Access, not this limiter alone. Configure Access for the entire preview hostname,
with explicit reviewers and service tokens if automation needs them. Verify denial
from an unauthenticated browser and allowed reviewer access. Do not enable a global
Pages Access setting without checking its effect on every existing preview.

## Remote preview sequence (not yet executed)

1. Securely supply scoped Cloudflare authentication and allow api.cloudflare.com.
   Inspect account, Pages production branch, deployment configs, secrets NAMES,
   existing preview deployments, Git build triggers, Access applications/policies
   and current D1 bindings. Never print token/secret values or candidate records.
2. Read the effective project via Cloudflare API, or download config in a scratch
   directory: `wrangler pages download config tt-website`. This command overwrites
   config, so NEVER run it in the working checkout. Compare all bindings and flags.
3. Read-only inspect the preview database schema and migration history, explicitly
   selecting `--env preview` and `--remote`; query schema metadata only, not PII.
   There must be eight app tables: assessment_definitions, assessment_versions,
   candidates, invitations, attempts, workbook_snapshots, results, audit_events.
4. Stop for explicit approval if changing shared preview bindings, Access or secrets
   could affect existing previews. Approval of this feature does not authorise
   compromising another preview. Confirm main is the actual production branch before
   selecting any deployment branch. Check Git preview auto-deploy before pushing.
5. Only after safe isolation and Access are verified, configure the preview secret
   using secure input, deploy the feature build with the confirmed nonproduction
   branch using `wrangler pages deploy dist --project-name tt-website --branch
   feature/ap-assessment-platform`, then verify the returned deployment's effective
   bindings. Do not call this a preview merely because of a branch name.
6. Use synthetic records ONLY in the preview assessment DB for browser/API testing:
   draft/publish a clearly synthetic local-review version, invite a synthetic
   candidate, start/save/refresh/submit, inspect private report and print PDF. Never
   substitute it for the real assessment. Capture actual deployment URL and evidence.
7. Commit/push only reviewed changes to the feature branch after auto-deploy impact
   is understood; update the existing draft PR. Do not merge main.

## Production launch — requires final human approval

Approve real content/rubric and privacy/retention wording in
PRIVACY_AND_CONTENT_APPROVAL_DRAFT.md; implement the approved deletion workflow;
pilot/calibrate scoring; verify Access and account/project/binding configuration;
confirm protected offers remain intact and backups are usable. Set a distinct
production assessment admin secret securely. Only with explicit final approval:
apply the assessment migration to the production ASSESSMENT_DB, deploy/merge the
reviewed feature, privately publish the approved real version, smoke test and issue
real invitations. Never migrate tt-offers, touch PDF_BUCKET or tallo-db.

## Evidence and limits

Local tests cover SQL 599999/600000/600001ms boundaries, saved recovery, concurrent
starts/saves/submits, immutable result idempotency, revoked/expired invites, cookie
and attempt isolation, no public answer-key leakage, streaming size bounds, scoring,
formulas, editing/paste/undo and regression suites. Chromium verifies candidate,
duplicate-tab and admin/report flows against local Pages/D1. Print is browser PDF,
not a server PDF service; raw saved formulas and computed values are included.
The workbook is explicitly a bounded Excel-like 6×20 grid (SUM/ABS/MIN/MAX and
arithmetic), not Excel or a full spreadsheet engine. Expert review must confirm it
fits the approved exercise. Cross-browser/accessibility and expert pilot remain.
Existing redirect-loop and Request.cf-placeholder Wrangler warnings remain outside
this assessment change. Remote Access, secrets, schema and deployment remain unverified
until access is available. Audit snapshots are supplementary; the attempts row is
authoritative. No automated retention/deletion currently runs.

## Result email (added 2026-11-03)

Status: implemented and unit-tested with a stubbed provider. **Not verified against the live provider.**

- Recipient: `ASSESSMENT_RESULTS_TO` in `wrangler.toml` (`christo@talenttree.co.za`). Set in both the top-level `[vars]` and `[env.preview.vars]`.
- Provider: Resend HTTP API (`https://api.resend.com/emails`). Choosing this vendor needs your approval; it is not yet approved.
- Secrets to add on the Pages project (never commit values):
  - `RESEND_API_KEY`
  - `ASSESSMENT_FROM_EMAIL`: a sender address on a domain verified with the provider. The `talenttree.co.za` domain must be verified (DNS records set by you). Not verified here.
- Migration to apply to the assessment database before deploying: `migrations/assessments/0002_result_notifications.sql`.
- Behaviour: one email per graded result. Failures are retried on later API calls, up to 5 times. Missing configuration does not consume retries (`notify_status = 'not_configured'`). Admin panel shows nothing about delivery yet; check `results.notify_status` in D1 if needed.
- Known limitation: if the process dies between the provider accepting the message and the database update, the same result can be sent twice. The provider idempotency key was not used; confirm the provider's duplicate behaviour before relying on this.

## Provisioning assessment content (added 2026-11-03)

Real assessment content and marking keys must not be committed to this public repository (see the warning in `TALENT_TREE_AP_ASSESSMENT_V1.md`).

- Keep each real package as a private file outside the repo, for example in a local, untracked folder.
- Load it through the admin API: `POST /api/assessment/admin/draft` (with the admin session cookie and the `x-tt-assessment-admin: 1` header), then `POST /api/assessment/admin/publish` with `content_approved`, `privacy_approved` and an `approval_reference`.
- The publish step is blocked until both approvals are supplied. Invitations are then issued with `POST /api/assessment/admin/invite`.
- Run the local end-to-end check against a local D1 before any preview or production use. It must not use real candidates.

## Status log (2026-11-03)

- **D1 migrations applied (remote):** `tt-assessments` (production binding `ASSESSMENT_DB`) has 0001 and 0002 applied and recorded in `d1_migrations`. `tt-assessments-preview` has 0001 and 0002 applied. Both checked via the D1 query tool.
- **Resend sending domain created:** `talenttree.co.za` (Resend domain ID `290fc61b-b588-445a-9fd8-984343e3bf7a`, region eu-west-1). Status: not yet verified.
  - Records to add at GoDaddy (DNS only, all on new subdomain names):
    - TXT `resend._domainkey` (DKIM value shown in the Resend dashboard)
    - MX `send` → `feedback-smtp.eu-west-1.amazonses.com`, priority 10
    - TXT `send` → `v=spf1 include:amazonses.com ~all`
    - CNAME `rsend` → `send.forge.rmta.net`
  - Do **not** change the root (`@`) MX, the root SPF TXT, or any existing DKIM selectors. Titan mail depends on them.
  - Only one SPF TXT record may exist per name. The `send` name is new, so this is safe.
- **Local browser tests:** the five Playwright tests in `tests/browser/assessment.spec.mjs` pass against the isolated local Pages project (`CHROMIUM_PATH=/opt/pw-browsers/chromium`).
- **Not yet done:** Pages secrets (`RESEND_API_KEY`, `ASSESSMENT_FROM_EMAIL`, `ASSESSMENT_ADMIN_KEY`), domain verification, live email send, content approval and publication.
