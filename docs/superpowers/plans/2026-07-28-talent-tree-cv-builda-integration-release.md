# Talent Tree CV Builda Integration and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the browser builder and suggestion service, verify the full system on Cloudflare Pages and the Oracle server, and release it with evidence-backed privacy, Word-output, smoke-test, and rollback checks.

**Architecture:** The React/Vite site and `/functions` relay deploy through the existing Cloudflare Pages project. The stateless CV suggestion API deploys separately behind the existing Oracle reverse proxy and local Ollama. Release proceeds through local verification, Cloudflare preview, Oracle verification, production deployment, and post-release smoke testing.

**Tech Stack:** GitHub Actions, React/Vite, Cloudflare Pages and Pages Functions, Wrangler, FastAPI, Podman Compose, Nginx Proxy Manager, Ollama, Microsoft Word, Vitest, Playwright, pytest.

## Global Constraints

- Complete the frontend plan before this release plan.
- Complete the suggestion-service plan before enabling AI in production.
- Do not merge/deploy with failing tests, sensitive-log findings, unresolved source coverage, or unverified Word output.
- Do not claim production readiness from a local build or screenshots alone.
- Keep AI optional; Oracle outage must not block manual review or Word export.
- No authentication is included by explicit decision; document residual public-access risk.
- Do not expose Ollama or the FastAPI container port directly to the public internet.
- Record the previous known-good Cloudflare deployment and Git commit before production release.
- Candidate data must not persist after reset, refresh, or close.
- Documentation must label states as planned, locally verified, preview verified, or production verified.

---

## Planned Files

```text
.github/workflows/verify.yml
README.md
DEPLOYMENT.md
SECURITY.md
docs/cv-builda/{architecture,data-flow,operations-runbook,privacy-checklist,word-acceptance-record,release-checklist}.md
scripts/{inspect-docx,smoke-suggestion-api,verify-no-browser-secrets}.mjs
```

---

### Task 1: Add CI for JavaScript, Python, containers, E2E, and secret scanning

**Files:** Create GitHub Actions workflow and secret scanner; update package scripts/README.

- [ ] `scripts/verify-no-browser-secrets.mjs` recursively scans `dist` and fails on secret variable names, bearer-token literals, or an optional exact `FORBIDDEN_SECRET_MARKER`.
- [ ] Add scripts:

```json
{
  "verify:frontend": "npm run fixtures && npm run test && npm run build && node scripts/verify-no-browser-secrets.mjs && npm run test:e2e",
  "verify:functions": "npm run test:functions",
  "verify": "npm run verify:frontend && npm run verify:functions"
}
```

- [ ] GitHub Actions jobs:
  1. Node LTS: `npm ci`, Chromium install, fixtures, tests, build, secret scan, E2E;
  2. Python 3.12: install `./services/cv-suggestion-api[test]`, run pytest and `pip check`;
  3. Container: Docker-build the service without pushing.
- [ ] Use `permissions: contents: read`; no production secrets in PR jobs.
- [ ] Run the CI-equivalent commands locally and commit: `ci: verify CV Builda web and suggestion services`.

---

### Task 2: Document implemented architecture and exact data flow

**Files:** Create architecture, data-flow, privacy-checklist docs; update README.

- [ ] Document `/`, `/cv-builda`, local extraction, memory-only state, fragment ledger, shared approved view model, preview/Word generation, Cloudflare relay, Oracle FastAPI/Ollama, and absence of database/drafts.
- [ ] Mark each component `Implemented`, `Partially implemented`, or `Needs verification` from actual code/runtime evidence.
- [ ] Add a sequence diagram showing:

```text
Staff -> Browser: upload file
Browser -> Browser: local extraction/review/Word generation
Staff -> Browser: request suggestion for selected text
Browser -> Cloudflare Function -> Oracle API -> Ollama
Ollama -> Oracle -> Cloudflare -> Browser: structured suggestion
Staff -> Browser: approve/edit/reject
```

- [ ] State accurately that selected suggestion text transits Cloudflare and Oracle transiently; never say all processing stays on-device.
- [ ] Privacy checklist includes browser storage, network payload, Cloudflare/proxy/FastAPI/Ollama logs, container volumes, object URLs, refresh/reset, secret scan, and abuse controls.
- [ ] Remove unsupported words such as `secure`, `private`, `fully local`, or `production ready` unless narrowly proven.
- [ ] Commit: `docs: document CV Builda architecture and privacy flow`.

---

### Task 3: Prepare Oracle deployment, smoke testing, and rollback

**Files:** Create operations runbook and smoke script; update service deployment docs.

- [ ] Before change, record non-secret evidence:

```bash
uname -a
podman --version
podman compose version
podman network ls
podman ps --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}'
ollama --version
ollama list
systemctl is-active ollama
firewall-cmd --list-ports
```

- [ ] Build the service with immutable Git-SHA tag and record the previous tag for rollback.
- [ ] Start with Compose; verify container health and sanitized logs.
- [ ] Configure Nginx Proxy Manager to route a dedicated HTTPS hostname to the container on its shared network. Do not publish port 8000.
- [ ] `scripts/smoke-suggestion-api.mjs` reads URL/token from environment, sends a harmless synthetic fragment, validates schema, rejects invented protected tokens, and never prints secrets/full content.
- [ ] Controlled outage test: stop/disconnect Ollama, verify safe 503 and recovery after restart.
- [ ] Rollback: restore previous immutable image tag, restart Compose, verify health/authenticated smoke, and record result.
- [ ] Commit: `docs: add CV suggestion operations and rollback runbook`.

---

### Task 4: Configure Cloudflare preview and server-side secrets

**Files:** Create `DEPLOYMENT.md`; update `.dev.vars.example` and release checklist.

- [ ] Verify the actual existing Pages project, production branch, build command, output directory, and last known-good deployment. Expected repository settings are `main`, `npm run build`, `dist`, but confirm in Cloudflare.
- [ ] Generate values outside Git:

```bash
export CV_API_URL="https://cv-api.your-controlled-domain.example"
export CV_RELAY_TOKEN="$(openssl rand -hex 32)"
export CLIENT_KEY_SECRET="$(openssl rand -hex 32)"
```

- [ ] Configure preview variables `ORACLE_CV_API_URL`, `ORACLE_CV_API_TOKEN`, `CLIENT_KEY_SECRET` server-side. Do not prefix with `VITE_`.
- [ ] Create preview deployment from implementation branch and record Git SHA, URL, build result, Function result, and timestamp.
- [ ] Directly open and refresh `/cv-builda`; verify SPA fallback.
- [ ] Confirm static assets do not invoke Functions and `/api/cv-suggestions` does.
- [ ] Scan downloaded preview assets for the exact relay token/client secret; both must be absent.
- [ ] Commit: `docs: add Cloudflare CV Builda deployment steps`.

---

### Task 5: Perform preview and Microsoft Word acceptance

**Files:** Create DOCX inspector, Word acceptance record, and release checklist.

- [ ] Use synthetic, non-sensitive fixtures covering DOCX tables, two-page PDF, year-only dates, current role, overlaps, explicit achievements, no professional summary, unclassified content, additional notes, and prompt-injection text as ordinary data.
- [ ] `scripts/inspect-docx.mjs` unzips output and reports fonts/sizes, headings, border declarations, paragraphs, bullets, and text. Fail if any run resolves outside Calibri 11.
- [ ] For every fixture: upload, review warnings, resolve every fragment, edit/add information, test suggestions/manual fallback, export both templates, reset, and refresh.
- [ ] Build coverage matrix:

```text
Source | Structured editor | Preview | Standard DOCX | Executive DOCX | Excluded with reason
```

- [ ] Open both outputs in Microsoft Word desktop and record Word version/platform, Calibri 11, no visible lines, section order, bullets, page breaks, editability, textual parity, and long-CV pagination.
- [ ] Keyboard/screen-reader acceptance covers upload/status, errors, dialogs, suggestion review, template selection, and download readiness.
- [ ] Commit only synthetic/redacted acceptance evidence: `test: add CV Builda Word acceptance checks`.

---

### Task 6: Conduct privacy, abuse, and failure review

**Files:** Update privacy checklist; create `SECURITY.md`.

- [ ] Browser storage inspection after upload/edit/download/reset/refresh: no CV content in Local Storage, Session Storage, IndexedDB, or Cache Storage; object URLs released.
- [ ] Network inspection: original file bytes never leave browser; no network during extraction/review/preview/Word generation; suggestion payload contains only selected fragments; responses are structured; `Cache-Control: no-store` present.
- [ ] Test invalid content type, oversized body, too many fragments, repeated calls, invalid token, missing client key, unknown task, malformed model output, and network loss.
- [ ] Send `PRIVATE-CANDIDATE-MARKER-7391`; search Cloudflare, Nginx Proxy Manager, container, FastAPI, and Ollama logs. Block release if present.
- [ ] `SECURITY.md` records residual risks:
  - builder/relay publicly reachable because authentication was excluded;
  - rate limiting reduces but does not remove abuse/cost risk;
  - selected text transits Cloudflare and Oracle;
  - model safeguards cannot mathematically guarantee perfection;
  - human approval is the primary content-control boundary;
  - authentication is the strongest future mitigation if abuse occurs.
- [ ] Commit: `docs: record CV Builda security boundaries`.

---

### Task 7: Merge, deploy, smoke test, and retain rollback evidence

**Files:** Update deployment and release records.

- [ ] Run final verification:

```bash
npm ci
npx playwright install chromium
npm run verify
cd services/cv-suggestion-api
python -m venv .venv
. .venv/bin/activate
pip install -e '.[test]'
pytest -q
pip check
podman build -t talent-tree-cv-suggestion-api:release-candidate .
```

- [ ] Review diff against approved design: no persistence, no auto-application, no summary generation from missing content, no inferred skills, no PDF export, no accidental authentication, identical template text, Calibri 11/no lines, no unrelated marketing changes.
- [ ] Open a draft PR linking design and three plans, with files/systems changed, verification, privacy findings, deployment/rollback, Word acceptance, and residual risks.
- [ ] Require successful CI, resolved review, preview acceptance, and Oracle smoke evidence.
- [ ] Deploy Oracle service first using reviewed SHA; verify health, auth rejection, authenticated smoke, Ollama, rate limit, and outage behavior.
- [ ] Configure production Pages variables server-side and record names/timestamp only.
- [ ] Merge and record Cloudflare deployment ID, Git SHA, build output, and previous deployment ID.
- [ ] Production smoke with synthetic CV: website, link/direct route/refresh, DOCX/PDF extraction, editing, one suggestion, manual fallback, two Word downloads, reset/refresh, and log-marker absence.
- [ ] Roll back immediately for source loss, auto-invented content, sensitive storage/logging, browser-secret exposure, broken Word format, route/site regression, unauthenticated Oracle access, or resource exhaustion.
- [ ] Complete release record with `Passed`, `Failed`, `Not run`, or `Not applicable`; never substitute confidence for evidence.
- [ ] Commit final record: `docs: record CV Builda release verification`.

---

## Integration and Release Completion Gate

Release requires actual evidence that:

- Frontend unit/integration/document/E2E/accessibility/build checks pass.
- Function validation, timeout, schema, and secret-leak checks pass.
- FastAPI authentication, rate limiting, prompts, safeguards, logging privacy, and Ollama tests pass.
- Container starts without persistent volumes.
- Oracle rejects unauthenticated direct suggestions.
- Cloudflare preview direct routing and Function routing work.
- Original file bytes remain local.
- Selected suggestion text is limited and transient.
- Browser storage and inspected logs contain no candidate content.
- Standard and Executive contain identical approved text.
- Microsoft Word confirms Calibri 11, no visible lines, section order, editability, and acceptable pagination.
- Rollback target is recorded and usable.
- Production smoke tests pass with synthetic data.

If any item is unverified, label the release accordingly and do not describe it as fully production-ready.
