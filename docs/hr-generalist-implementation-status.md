# HR Generalist Form A — implementation status

**Incomplete, not deployable or approved for use.** Pilot / unvalidated. This note contains no restricted Form A content, transcript or production scoring keys. Do not invite candidates or use these foundations for hiring.

## Inventory and boundaries

- Existing Pages API: `functions/api/assessment/[[path]].js`; private version payloads/keys and attempts use the assessment D1 binding. Existing attempt expiry, revision checks and invitation handling can inform the HR integration, but currently implement a single overall attempt clock rather than the required fixed individual module windows.
- Existing React candidate/admin interfaces: `src/assessments/CandidateAssessment.jsx`, `BatteryPanels.jsx`, `Spreadsheet.jsx`, and `AssessmentAdmin.jsx`. These do not render or review HR Generalist.
- Existing spreadsheet evaluator: `src/assessments/formulas.js`; this change adds a restricted reference-extraction helper for eventual HR formula method scoring. Its general evaluation behavior is unchanged.
- New isolated foundations: `functions/lib/hr-generalist.js` contains draft validation, public projection, response cleaning, scoring and human-review helpers. `functions/lib/hr-generalist-clock.js` models deadlines. `functions/lib/hr-pilot-store.js` and migration `0008_hr_pilot_state.sql` add an isolated SQL-backed clock and per-step snapshots with revision/deadline guards. **None is connected to a route, candidate UI, or reviewer UI.** The storage primitives rely on a future caller to authenticate and scope attempts; they are not themselves an access-control boundary. These helpers still need design and security review before integration.
- `tests/fixtures/synthetic-hr.mjs` is unrelated synthetic test data, not the supplied draft Form A. Tests cover selected grading, validation, formula and timing cases; they do not establish validity or end-to-end readiness.

## Remaining work / requirement mapping

1. **Private authored content and versioning:** implement a git-ignored private builder from the restricted handover and protected D1 version storage; verify keys, transcript and candidate data cannot enter public assets, logs, URLs or source control. Verify the full draft and all scoring rules against the handover; current tests do not do this. Do not load real data.
2. **Lifecycle and timing:** integrate and review the isolated state table and CAS primitives with invitation redemption, immutable versions and parent-attempt finalisation. A bounded expiry-sweep function exists but has no scheduler; lazy and scheduled finalisation, failure handling and audit need integration. Existing global attempt logic must not prematurely close or grade HR attempts. Implement preflight, support/accommodation workflow, technical interruption handling and audit history. Do not silently extend time.
3. **Five candidate tasks:** implement accessible, responsive task renderers and autosave/error states; add protected audio delivery and persistent replay entitlement. Confirm supported devices, keyboard and assistive technology access. No candidate route exists for HR yet.
4. **Review and reports:** protect reviewer-only transcript, candidate email, rubric and evidence; add authenticated human review, flag moderation, score/report revisions, audit and one-page employer report. Do not release a total before required review and moderation. No report currently exists.
5. **Verification:** add integration and browser tests for interrupted, partial, expired and concurrent attempts, security/access control and privacy, report revision, audio handling and accessibility. Review scoring, formula edge cases, fairness, privacy, security, content and legal/commercial release gates with appropriate specialists. No psychometric validation is claimed.

## Migration and rollback

Migration `0008_hr_pilot_state.sql` adds an isolated table and due index. `npm run assessments:migrate` applied it to the isolated local D1 sandbox only. No remote D1 write, deployment, invitation or live data change was made. The migration does not enable this feature. Before any remote application, independently review the schema, privacy/retention, transactional integration and release plan. Rollback of a deployed version should first disable the HR route and sweep job, preserve all candidate/audit records under the approved retention policy, and deploy the prior application; do not drop production tables or delete evidence. This additive table can remain unused until an approved data-retention and migration plan exists.

## Reproduction and decisions

Run `node --test tests/assessment-hr-clock.test.mjs tests/assessment-hr-generalist.test.mjs tests/assessment-hr-store.test.mjs` for the synthetic foundation tests, `npm test` for the full suite, and `npm run build` for the website build. There is no HR staging/local URL or sample employer report yet. A future integration must record and obtain approval for substantive content/scoring departures from the handover, and preserve the fixed 20-minute standard limit, generalist emphasis, entry-level accessibility and evidence-based reporting.
