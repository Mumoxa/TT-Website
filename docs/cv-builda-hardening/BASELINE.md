# CV Builda production-hardening baseline

## Session scope

This document records Wave 1 discovery performed on 26 August 2026. In accordance with the campaign protocol, no production behaviour was changed and no defect was fixed in this session.

The repository-level `AGENTS.md` was read before discovery. Its required canonical follow-on file, `Mumoxa/agent-instructions/AGENTS.md`, is not present in this checkout; `find .. -name AGENTS.md -print` found only the repository-level file. Discovery continued under the repository instructions and the hardening mandate supplied for this campaign, and this missing instruction source remains an environment/process risk.

## Environment

| Item | Observed value |
| --- | --- |
| Working tree | `/workspace/TT-Website`, branch `work` |
| Date | 2026-08-26 (UTC) |
| OS | Linux 6.18.35, x86_64 |
| Node.js | v24.15.0 |
| npm | 11.4.2 |
| Application tooling | Vite 8.1.5; React 19.2.4 |
| Browser automation | Playwright package present, but no browser executable or Playwright configuration/specification was found |

## Baseline commands

| Command | Result | Evidence and warnings |
| --- | --- | --- |
| `npm install` | PASS (exit 0) | Dependencies were already current; 104 packages audited. npm reported two high-severity dependency vulnerabilities and the `http-proxy` environment configuration deprecation warning. No audit fix was run during discovery. |
| `npm test` | PASS (exit 0) | 135 tests passed, 0 failed, 0 skipped. pdf.js printed `Warning: Indexing all PDF objects`. npm also printed the `http-proxy` warning. |
| `npm run build` | PASS (exit 0) | Vite built 44 modules in 2.54 seconds. Warnings: `docx` is both statically and dynamically imported, and the main/minified and worker chunks exceed 500 kB. |
| `node --test tests/cv-reading.test.mjs tests/cv-builda.test.mjs tests/cv-enhancements.test.mjs` | PASS (exit 0) | Focused parsing, extraction, validation, redaction, composition and enhancement suite: 48 passed. |
| `node --test tests/cv-builda.test.mjs tests/cv-enhancements.test.mjs` | PASS (exit 0) | Focused export/content suite: 29 passed. |
| `curl -I http://127.0.0.1:5173/cv-builda` | PASS | Local Vite route returned HTTP 200. This proves route delivery only, not interactive behaviour. |
| `npx playwright install chromium` | BLOCKED | Browser download retries failed with HTTP 403 `Domain forbidden`; no Chromium executable was available. Ubuntu's Chromium package is a Snap transition package, and Snap is unavailable in the environment. |
| `curl -L https://talenttree.co.za/cv-builda` | BLOCKED | The environment proxy rejected the CONNECT tunnel with HTTP 403, so no production health claim is made. |

The passing automated baseline does **not** establish release readiness. Existing tests currently require automatic profile synthesis, which conflicts with the campaign's factual-integrity mandate, and they codify omission of references.

## Application and data-flow map

1. **Route and state:** `src/main.jsx` selects CV Builda for `/cv-builda`. `CvBuilda.jsx` owns one React `cv` state record and local workflow state. Immutable path helpers support field edits; array additions and deletions replace the relevant arrays.
2. **Input:** blank entry starts from `EMPTY`. Pasted text and uploaded files enter handlers in `CvBuilda.jsx`; JSON is merged with shallow schema defaults, while supported source documents are read by `extractFromFile()`.
3. **Extraction:** `cv/extract.js` signature-sniffs and locally extracts text from DOCX, PDF, legacy DOC, RTF and text. It preserves paragraph/list/table hints for parsing and returns controlled errors for tested empty/corrupt inputs.
4. **Parsing and normalization:** `parseCv()` segments extracted text, reads personal, profile, study, skills and career fields, derives selected values, and currently auto-fills short or absent profiles through `synthesizeProfile()`.
5. **Editing/transformation:** `CvBuilda.jsx` edits the normalized record. `standardizeCv()` applies casing, punctuation and date-dash transformations. `mergeCvRecords()` combines supplementary sources. Profile synthesis and automatic anonymity aliases are optional UI actions in addition to the parser's automatic synthesis.
6. **Validation:** `validate(cv)` is memoized over the live record. Errors block document generation; warnings remain advisory.
7. **Preview:** React preview components render from the same live `cv` state, with redaction-related presentation controlled by the record's flags.
8. **Privacy/redaction:** `redact()` clones and transforms the record when privacy flags are active. Validation scans structured and rendered prose for selected disclosure risks.
9. **Composition and export:** the browser dynamically imports `docx` and `compose.js`; `compose()` performs final redaction and builds the DOCX. `Packer.toBlob()` creates a local browser download. JSON export serializes the unredacted editor state by design.

## Discovery coverage completed

- Inspected every file under `src/cv-builda/**` and all existing CV-related tests.
- Ran the mandatory dependency, full-test and production-build baselines.
- Ran focused parsing, extraction, validation, redaction and DOCX composition tests.
- Used deterministic Node probes to compare factual-integrity trap input against parser output and generated DOCX text/XML.
- Started the application and confirmed the local `/cv-builda` route serves successfully.
- Attempted to establish real-browser testing, including installing Chromium through Playwright and the OS package route.

## Coverage not completed and why

No honest interactive desktop or mobile result is recorded. The environment has no installed browser, Playwright browser download is forbidden by the network policy, and the available Ubuntu Chromium package requires unavailable Snap support. Therefore the following remain unverified: primary interactive journey, editing and deletion in a browser, repeated-record UI behaviour, browser import/export, downloaded-file inspection from the browser, desktop/mobile layout, console/runtime warnings, failed browser resources, network hygiene, keyboard accessibility and screenshots.

No production URL testing was performed in this discovery session. No manual DOCX presentation review in Microsoft Word, LibreOffice or equivalent was completed. These are open release-gate items, not passes.

## Baseline conclusion

The baseline is **NO-GO** for progression directly to release. Two confirmed release-blocking factual-integrity defects cause unsupported facts to be generated and supplied early-career facts to be lost. Additional P1/P2 findings and incomplete real-browser evidence are recorded in `DEFECTS.md`. The next session must follow the critical-fix protocol for confirmed P0/P1 items only; no production fixes were made here.
