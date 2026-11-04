# AP assessment completion implementation plan

Goal: complete and verify the existing feature branch for isolated preview review.
Architecture: retain React/Vite, Pages Functions and separate assessment D1. Use atomic SQLite state transitions, independent assessment admin authentication, revision conflicts that require recovery, and a bounded spreadsheet with explicit capabilities.
Spec: docs/assessments/TALENT_TREE_AP_ASSESSMENT_V1.md and the user's supplied nine-phase request.

Constraints: exactly 600 seconds; no production writes, merge, real invitations or unapproved publishing. Preserve offers DB/R2 bindings and never connect them to preview. Private questions and keys stay in D1. Use current checkout and preserve ignored local work.

- [x] Server: add real SQLite-backed API tests for timing, duplicate starts, concurrent saves/submits, isolation and leakage. Fix atomic submit, idempotent completion, stale reads, bounded streaming requests, and public rate limits. Separate assessment admin cookie/key from offers.
- [x] Workbook: reproduce paste overflow, clearing prefilled cells, absent undo and formula recomputation issues. Add bounded paste, history, copy, keyboard editing, calculated values and formula evidence in reports.
- [x] Candidate: stop automatic overwriting after revision conflicts; recover explicitly from server; serialize final submission, freeze inputs while submitting/expired and resynchronize time without extending deadlines. Browser-test saved recovery and duplicate tabs.
- [x] Authoring/reporting: private immutable drafts and explicit approval before publishing; individual email invitations; audit history, corrective action evidence and printable full workbook/formula report. Prepare privacy/retention and real-content approval documents without claiming approval.
- [ ] Configuration: preserve production offers bindings; isolate preview ASSESSMENT_DB and remove preview offers bindings. Check current official docs and effective remote config before applying shared preview settings or deploying. Authentication and access-control prerequisites may block remote work.
- [ ] Verification: npm ci, npm test, npm run build; local D1/Pages integration and Chromium candidate/admin/report tests using synthetic data. Read-only review and secret/diff check before commit/push. Recheck branch tip before pushing; inspect CI auto-deploy behavior first.

Review focus: body upload crossing deadline; save racing submission; closed-result repair; lost save response and dirty local edits; spreadsheet paste beyond F20 and formula dependency explosion. Tests must exercise actual SQL and public API seams, not source-text patterns.

## Execution evidence / rulings

- Existing feature branch fetched at c90b072; initial tracked tree was clean. The path in the handoff belonged to another machine. No worktree was created.
- Server, workbook, candidate and private authoring/report slices completed with focused RED→GREEN checks, the full Node suite and real local Pages/D1/Chromium checks.
- Ruling: use an independent assessment admin key/cookie. Reusing offer credentials would share confidential-offer privilege; preview needs a separately configured assessment secret.
- Ruling: a conflicting/lost save response requires explicit Load saved work. Automatic retry with a new revision could overwrite newer server work. Unsaved local edits are discarded only by that explicit action.
- Ruling: preserve immutable draft metadata inside the private version payload, leaving the published definition untouched until publication. No extra D1 migration is required.
- Independent whole-change review found missing recruiter-side repair of interrupted grading and ignored existing-draft metadata edits. Both reproduced in failing SQL API tests and fixed; 22 test files and five browser flows pass after integration.
- Additional regressions fixed: revoked invite race; cross-candidate cookie switch; unselected corrective-action credit; legacy nested metadata; trailing-newline paste.
- Configuration is parsed and locally verified only. Runtime has no Cloudflare login and blocks API egress despite saved requirements and subsequent retries. No remote preview, secret/config update, migration, push or merge was attempted.
- Retention wording remains a human-review proposal. No retention/deletion workflow is claimed or deployed.
- Remaining: effective remote configuration/preview schema/Access checks and safe preview deployment; then push/update PR only after auto-deploy impact is understood.
