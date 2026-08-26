# CV Builda central defect register

## Status legend

- **Open — confirmed:** reproduction and root cause are recorded; no fix has been attempted in this discovery-only session.
- **Open — requirement conflict:** behaviour is confirmed, but the campaign mandate conflicts with an existing encoded house rule; resolution must be explicit before implementation.
- Severity follows the hardening mandate. In particular, invented candidate facts and candidate data loss are P0 release blockers.

## Summary

| ID | Title | Subsystem | Severity | Status |
| --- | --- | --- | --- | --- |
| CVB-001 | Parser automatically invents unsupported professional-profile claims | Parsing/content transformation | P0 | Open — confirmed |
| CVB-002 | Early-career responsibilities disappear before state and export | Parsing/schema/composition | P0 | Open — confirmed |
| CVB-003 | Supplied references are deliberately discarded | Parsing/schema/composition | P1 | Open — requirement conflict |
| CVB-004 | Malformed email values pass direct-mode validation | Validation | P2 | Open — confirmed |
| CVB-005 | Malformed imported skill structure crashes validation | Validation/import | P2 | Open — confirmed |
| CVB-006 | Non-string parser input causes an uncontrolled TypeError | Parsing/import | P2 | Open — confirmed |

---

## CVB-001 — Parser automatically invents unsupported professional-profile claims

- **Subsystem:** Parsing and content transformation
- **Severity:** P0 — invented candidate facts are an explicit release blocker
- **Environment:** Node.js v24.15.0, direct `parseCv()`/`synthesizeProfile()` probe on branch `work`
- **Exact reproduction:** Parse a source containing only candidate identity, a Payroll Administrator role at Named Employer, the responsibilities `Processed payroll` and `Supervised two staff`, and the skill `Excel`, with no profile, performance claim, metric, expertise level or professional-development claim.
- **Expected behaviour:** The absent profile remains absent, or the user is asked for supported information. Any generated wording must be traceable solely to supplied facts.
- **Actual behaviour:** Four profile claims are inserted automatically, including `proven track record of excellence and high-impact delivery`, `strong domain expertise`, `complex mandate delivery`, `delivering measurable outcomes`, `ethical practice`, and `highest standard of execution`.
- **Evidence:** The deterministic inline Node probe reproduced the claims both from `synthesizeProfile()` and in `parseCv()` output. The parsed employment facts themselves remained `Processed payroll` and `Supervised two staff`, proving the stronger assertions were not in the input.
- **Source material:** Factual-integrity trap described above; no achievements, proficiency, measurable outcome, compliance, budget or strategy facts were supplied.
- **Suspected cause:** Confirmed.
- **Confirmed root cause:** `parseCv()` unconditionally fills any profile shorter than four bullets. `synthesizeProfile()` uses hard-coded accomplishment, excellence, impact, expertise, measurable-outcome and ethical-practice assertions, including when source evidence is absent. Partial source profiles are also padded with these assertions.
- **Affected files:** `src/cv-builda/cv/parse.js`, `src/cv-builda/CvBuilda.jsx`, and tests that currently assert a synthesized four-bullet minimum.
- **Regression test:** Not yet created. Required: a source-to-normalized factual-integrity trap that fails on every unsupported phrase/claim and confirms an absent profile is not manufactured.
- **Fix commit:** None.
- **Verification status:** Reproduced; root cause confirmed; unfixed. Existing full tests pass but currently encode the conflicting synthesis behaviour.
- **Content-integrity impact:** Critical misrepresentation of candidate performance, expertise and impact.
- **Client-readiness impact:** Generated CV cannot be sent to a client safely.

## CVB-002 — Early-career responsibilities disappear before state and export

- **Subsystem:** Parsing, normalized schema, editor and DOCX composition
- **Severity:** P0 — supplied candidate data is silently lost
- **Environment:** Node.js v24.15.0 parser and generated-DOCX OOXML probes on branch `work`
- **Exact reproduction:** Parse an `EARLY CAREER` record for Accounts Assistant at Beta Ltd, 2019–2021, followed by `Captured invoices` and `Helped customers with account queries`. Also compose a normalized record containing `earlyCareer[0].responsibilities = ['Captured invoices']` and inspect document XML.
- **Expected behaviour:** Both responsibilities remain associated with the Beta Ltd role through normalized state, preview and export.
- **Actual behaviour:** The parsed record retains only title, employer, duration and alias. Both responsibility lines disappear without a gap or warning. A supplied `earlyCareer[].responsibilities` value is also absent from generated DOCX XML.
- **Evidence:** Deterministic parser and DOCX OOXML probes reproduced the loss. Existing focused tests passed, demonstrating missing regression coverage rather than correctness.
- **Source material:** Explicit early-career role and two factual duty lines as stated above.
- **Suspected cause:** Confirmed.
- **Confirmed root cause:** `readEarlyCareer()`, the editor model and `earlyCareerSection()` only model/render title, employer, duration and alias; duty lines have no preserved schema path.
- **Affected files:** `src/cv-builda/cv/parse.js`, `src/cv-builda/CvBuilda.jsx`, `src/cv-builda/cv/compose.js`.
- **Regression test:** Not yet created. Required: source → normalized state → readable DOCX fact-preservation test for multiple early-career duties.
- **Fix commit:** None.
- **Verification status:** Reproduced; root cause confirmed; unfixed.
- **Content-integrity impact:** Material factual responsibilities are removed.
- **Client-readiness impact:** Employment history is incomplete and can misrepresent the candidate's experience.

## CVB-003 — Supplied references are deliberately discarded

- **Subsystem:** Parsing, validation, schema and composition
- **Severity:** P1 — material supplied content is removed; final implementation is blocked by an explicit requirement conflict
- **Environment:** Node.js v24.15.0 parser probe and existing automated tests
- **Exact reproduction:** Parse a CV containing a `REFERENCES` section with `Jane Nkosi, Manager, 082 111 2222`.
- **Expected behaviour under the campaign mandate:** Supported reference data remains represented unless the user explicitly removes it, it is an exact duplicate, or it is corrupt. Privacy-sensitive presentation must be deliberate and consistently verified.
- **Actual behaviour:** No reference data is stored; a gap states that the section was left out. The composer omits references and existing tests require the omission.
- **Evidence:** Parser probe reproduced an absent references field and the omission gap. `tests/cv-builda.test.mjs` explicitly verifies that composed documents contain no referees section.
- **Source material:** Explicit reference record stated above.
- **Suspected cause:** Confirmed.
- **Confirmed root cause:** The current product implements a house rule that intentionally segments and drops references, warns on legacy `referees` data, and never composes the section. This conflicts with the new explicit preservation and required references-flow mandate.
- **Affected files:** `src/cv-builda/cv/parse.js`, `src/cv-builda/cv/validate.js`, `src/cv-builda/cv/compose.js`, `src/cv-builda/CvBuilda.jsx`, `tests/cv-builda.test.mjs`.
- **Regression test:** None pending requirement resolution. A resolution must define supported reference fields, privacy rules and agency/direct export behaviour without invention.
- **Fix commit:** None.
- **Verification status:** Behaviour and root cause confirmed; no fix attempted because silently choosing between conflicting rules would invent product behaviour.
- **Content-integrity impact:** Supplied reference facts are lost.
- **Client-readiness impact:** Output is incomplete relative to supplied information and the mandated supported flow.

## CVB-004 — Malformed email values pass direct-mode validation

- **Subsystem:** Validation
- **Severity:** P2 — incorrect validation with a manual workaround
- **Environment:** Node.js v24.15.0 direct `validate()` probe
- **Exact reproduction:** Use a valid direct-mode record with phone empty and set `personal.email` to `good@example.com trailing` or `x@y.z<script>`; call `validate()`.
- **Expected behaviour:** A whole-field email validation error is returned.
- **Actual behaviour:** No `personal.email` error is returned because a valid-looking substring matches.
- **Evidence:** Both malformed values passed; `not-an-email` was rejected in the same probe.
- **Source material:** Not applicable.
- **Suspected cause:** Confirmed.
- **Confirmed root cause:** Whole-field validation calls `.test()` with an unanchored email-scanning expression suited to finding addresses inside prose, rather than a full-value expression.
- **Affected files:** `src/cv-builda/cv/validate.js`.
- **Regression test:** Not yet created; required for trailing text/markup and valid control values.
- **Fix commit:** None.
- **Verification status:** Reproduced; root cause confirmed; unfixed.
- **Content-integrity impact:** None demonstrated.
- **Client-readiness impact:** Invalid contact data can reach a direct CV.

## CVB-005 — Malformed imported skill structure crashes validation

- **Subsystem:** Validation and malformed import handling
- **Severity:** P2 — meaningful reliability failure on malformed imported data
- **Environment:** Node.js v24.15.0 direct `validate()` probe
- **Exact reproduction:** Set `technicalSkills` to `[{ group: 'Tools', items: 'Excel' }]` in an otherwise valid record and call `validate()`.
- **Expected behaviour:** Validation reports that `items` has an unsupported type without throwing.
- **Actual behaviour:** Validation throws `TypeError: items.forEach is not a function`.
- **Evidence:** Deterministic direct probe reproduced the uncaught exception.
- **Source material:** Malformed JSON-like imported structure.
- **Suspected cause:** Confirmed for this structure; other list paths were not exhaustively probed.
- **Confirmed root cause:** Validation defaults only falsy values to `[]` and assumes every truthy `items` value is an array before calling `.forEach()`.
- **Affected files:** `src/cv-builda/cv/validate.js`; JSON ingestion boundary in `src/cv-builda/CvBuilda.jsx` is related.
- **Regression test:** Not yet created; required for malformed type and controlled error reporting.
- **Fix commit:** None.
- **Verification status:** Reproduced; root cause confirmed; unfixed.
- **Content-integrity impact:** No corruption demonstrated, but validation cannot protect the malformed state.
- **Client-readiness impact:** Editing/export workflow can terminate unexpectedly after malformed import.

## CVB-006 — Non-string parser input causes an uncontrolled TypeError

- **Subsystem:** Parsing/import boundary
- **Severity:** P2 — malformed input is not rejected cleanly
- **Environment:** Node.js v24.15.0 direct `parseCv()` probe
- **Exact reproduction:** Call `parseCv(123)`.
- **Expected behaviour:** Return a controlled unsupported-input error or a documented empty parse result.
- **Actual behaviour:** Throws `TypeError: rawText.split is not a function`.
- **Evidence:** Deterministic direct probe reproduced the exception.
- **Source material:** Malformed imported input.
- **Suspected cause:** Confirmed.
- **Confirmed root cause:** `parseCv()` accepts any truthy input as `rawText` and immediately calls `.split()` without validating that it is a string.
- **Affected files:** `src/cv-builda/cv/parse.js`; import callers in `src/cv-builda/CvBuilda.jsx` are related.
- **Regression test:** Not yet created; required for controlled non-string rejection.
- **Fix commit:** None.
- **Verification status:** Reproduced; root cause confirmed; unfixed.
- **Content-integrity impact:** None demonstrated.
- **Client-readiness impact:** Malformed import can interrupt the workflow.
