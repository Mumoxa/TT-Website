# WPP v2 — work in progress, not release-ready

This branch does **not** complete the v2 assessment or authorize its use. No real reasoning items or keys are included. The proposed items and keys on `claude/wpp-reasoning` were already present in a public repository and must be treated as exposed, not reused for a live test. Replacement content and keys must be independently reviewed, provisioned privately and rotated under the owner's security procedures. Do not enter private content into Git, logs, screenshots or chat.

## Implemented foundation

- `functions/lib/wpp-v2-reasoning.js` validates a privately provisioned package, projects only public fields, normalizes answers, computes raw counts and provides an HMAC for future internal snapshot binding. Its errors do not echo input. The `WPP_REASONING_PACKAGE` environment binding is a proposed server-side secret interface; **no production route reads it yet**.
- The question component understands a projected synthetic `reasoning.sections` shape and has 14 pages, section-specific review links and 62-item progress when this shape is supplied. Existing 50-statement form remains the default. No route currently supplies the new shape.
- Question legends have been moved within their cards; the selected state uses the radio as well as colour. At narrower widths response labels stack. Samples and screenshots are synthetic only.

## Mandatory work still outstanding

1. Secure storage and lifecycle: define authorized provisioning and versioning, persist an encrypted immutable package snapshot bound to each attempt, handle key rotation and missing snapshots without silent rescoring or data loss, and ensure no secret or answer key appears in responses, logs, Git or client bundles. A private environment secret alone is not an immutable historical snapshot. Do not add a public fallback. The package fingerprint is server-only and must never be used as a public identifier.
2. Integrate version-aware creation, read/resume, save, timeout finalization and submit; existing v1 drafts must remain saveable and be scored by their original engine. Fail closed before creating or consuming an attempt if the v2 package/configuration is missing. Maintain a release gate defaulting off, and secure the notice/version and session ownership.
3. Implement the 20-minute v2 timing, catalogue, notice, briefing, recruiter email and dossier reasoning outputs, and verify backward compatibility for historical records. Do not claim the existing production questionnaire is 20 minutes: this work has not been done.
4. Add full-cycle security, concurrency, immutable version, old-draft, legacy-result, failure and scoring tests using synthetic content only; perform a complete catalogue-to-submission audit at the four specified sizes, including keyboard-only, timer, tap targets, contrast and screen reader review. The current component audit is **not** the requested end-to-end audit.
5. Complete scientific, legal/POPIA, fairness, accessibility and release approvals before enabling live assessment/report use or production D1 changes. Do not merge or deploy this partial work as a completed release.

## Verification of this partial work

- `npm test`: 425 passed. `npm run build`: passed. `npx wrangler pages functions build functions --outdir .wrangler/ci-functions-v4`: passed.
- `scripts/audit-wpp-v2-component.mjs` used an isolated synthetic React harness at 1440×900, 1024×768, 768×1024 and 390×844. Three component rounds checked 14 screen transitions, heading focus, legend bounds, horizontal overflow and review navigation. It did not test the live route, server, timer, full keyboard journey, contrast or screen reader. A legacy v1 component smoke check showed ten screens.
- Visual checks of representative screenshots found selected text wrapping awkwardly at 768px; responses were changed to stack at widths up to 850px and the component audit was rerun. Screenshots are in `deliverables/wpp-v2-component-audit/`.
- `npm ci` reported eight high-severity npm audit findings; no dependency remediation has been performed. The temporary Chromium install used for local QA is not a project dependency.
