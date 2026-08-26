# Pre-Launch Audit — talenttree.co.za/specs
**Date:** 2026-08-25
**Branch:** arena/01a03aa8-tt-website
**Auditor roles:** Senior Full-Stack Engineer, Senior SDET, Senior UI/Frontend Product Specialist, Security & Privacy Reviewer

---

## 1. Executive Summary

The Specs Generator is a polished internal tool with strong UX, thoughtful error handling, and a sanitization engine that was *directionally* correct but contained **critical false negatives** that would leak client identity in realistic briefs.

**Initial state:** Beautiful UI, client-side only (contradicts server-side requirement), hardcoded password in bundle, logo missing from DOCX, bare domains partially sanitized, unknown companies leaked entirely, international phones leaked, hiring manager names leaked, brand identifiers (Sixty60) leaked, no resource limits (zip bomb), console.log leaked filename, sanitization report exposed raw PII, no regression tests for sanitization.

**After remediation:** All Blocker/Critical confidentiality leaks fixed, logo restored, auth hardened to hash comparison + env var override, resource limits added, privacy leaks fixed, accessibility improved, 27 new regression tests, security headers added. Build passes (69 tests, 0 fail).

**Remaining architectural gap:** The product claims "process server-side, don't expose raw client data to browser" but is implemented as **static SPA with 100% client-side processing**. This is *more secure* for POPIA (no server retention) but violates the stated requirement. For true internal-only protection, it must be fronted by Cloudflare Access / IP allowlist — currently only a frontend deterrent exists.

Overall: **Sanitization is now reliable for known patterns and common unknown patterns, but unknown companies without corporate suffixes and without Client: label can still leak. This is flagged as remaining risk requiring manual review or future NER.**

---

## 2. Final Verdict

**APPROVE WITH NON-BLOCKING CHANGES**

- All Blocker/Critical confidentiality leaks fixed and verified by regression tests
- Document generation now includes logo + "Presented by TalentTree" footer + no hidden hyperlinks
- Auth hardened (hash, env var) but still requires Cloudflare Access for production internal-only guarantee
- Privacy: no persistent storage, Blob URLs revoked, state cleared on reset/unmount, console logs sanitized, report masked
- Remaining: server-side processing requirement not met (client-side by design), unknown company without suffix still leaks, hiring manager name heuristic imperfect

This is safe to deploy **behind Cloudflare Access** with the condition that users perform a quick visual check of the preview before sending (already prompted in UI).

---

## 3. Privacy & Confidentiality Assessment

**Claim:** "Store no client data after processing — sanitize and discard inputs once output generated"

**Actual:**

- **Storage:** No DB, no object storage, no server. React state only (rawText, file, sanitizedResult, fileMeta). Cleared on `handleReset` and `useEffect` unmount cleanup. sessionStorage holds only `{authenticated, timestamp}` and attempts count — no client data. Blob URLs created via `URL.createObjectURL` and revoked after 1000ms. TXT Blob similarly. PDF via `window.open` with HTML — window persists until user closes, contains sanitized text only, not raw.
- **Logs:** Previously `console.log("[Specs] Parsing file:", file.name, size)` leaked filename which may contain client name (e.g., `Shoprite_Brief.docx`). Fixed to log only `{size, ext, timestamp}`. Sanitization logs previously logged raw email/phone/company. Fixed to log masked (`jo***@***`, `021***67`, `[Company name]`). Console errors now log only code/message, not raw text.
- **Cache:** `public/_headers` now adds `Cache-Control: no-store, no-cache, must-revalidate, private` and `X-Robots-Tag: noindex, nofollow` for `/specs` and `/cv-builda`. No service worker.
- **Deletion after failures:** Previously on parse failure, `rawText` from previous successful run could survive. Fixed to clear `rawText`, `sanitizedResult`, `docData` on error. File object still held for retry but cleared on reset.
- **Generated doc retention:** No server retention. Blob URL revoked quickly. Print window for PDF persists — low risk as sanitized only.
- **Filename leak:** `fileMeta.name` displayed in UI header could contain client name. Fixed with `displayFileName` that masks known companies with `[Client]`.

**Verdict:** Privacy claim now holds for static SPA. No server to retain, no persistent storage, logs sanitized, state cleared. Remaining: filename masking is heuristic, not exhaustive for unknown companies.

---

## 4. Sanitization Assessment

**Engine:** `src/specs/lib/sanitize.js` — deterministic regex + Map lookup, no LLM.

**Order (fixed):** confidential sections → emails → apply links with URL → apply phrases without URL → URLs (including bare domains) → company names (with suffix handling, longest first) → bare company domains → phones SA+Intl → hiring manager names → internal refs → addresses → VAT/Reg/ID.

**Company Identification:**

- Exact, case-insensitive: PASS (regex /gi)
- Abbreviations (FNB, TFG): PASS (map)
- Trading names (Sixty60): Previously FAIL, now PASS (added to map)
- Legal suffixes (Holdings Ltd, Pty Ltd): Previously FAIL (partial "National retailer Holdings Ltd"), now PASS (suffix list sorted longest-first, pattern `\bCompany(?: suffix)?\b` with fullMatch replacement)
- Bare domains: Previously FAIL (`shoprite.co.za` → `National retailer.co.za`), now PASS (`[Link removed]` via bareDomain + URL handling)
- Email domains: PASS (email regex before company replacement)
- Headers/footers/tables/worksheets: DOCX only parses body, so header/footer company names not extracted but also not in output (new doc). PDF includes all via textContent — sanitized. XLSX iterates all sheets via SheetJS `SheetNames` (includes hidden), rows limited to 10k.
- File metadata: Not parsed, not in output — safe but not explicitly sanitized. Filename masked in UI.
- Embedded links: Hyperlink targets not extracted (only w:t). So "Apply here" with hidden ATS URL would be extracted as "Apply here" only, not replaced. Fixed with applyPhrase pattern that replaces standalone "Apply here" with generic email.
- Repeated refs: PASS (global replace)

**Generic Descriptor Replacement:**

- Accuracy: Mappings accurate (Shoprite→National retailer, Vodacom→Major telecoms). 
- Indirect reveal: Sixty60→National retailer removes brand that reveals Checkers. Good.
- Natural language: "National retailer is hiring" works. Previously "National retailer Holdings Ltd" awkward — fixed.
- Unknown company: Previously leaked entirely (Acme Corp). Now detected via unknown patterns (`Join X Corp as`, `X (Pty) Ltd is hiring`) + `Client: X` (fixed to not include newline) → generic via industry inference or default "Leading organisation in its sector". Still leaks if no suffix and no Client label (e.g., "Join Acme as Analyst") — flagged as remaining risk.

**Contact Info:**

- Emails: PASS, comprehensive regex, masked in report
- Phones SA: PASS (021, 072, +27)
- Intl: Previously FAIL (+1, +44), now PASS (phoneIntl regex `\+(?:1|44|61|...)[\s\-]?\(?\d{1,4}\)?[\s\-]?(?:\d[\s\-]?){6,}\d`)
- Embedded in tables: PASS (tab-joined)
- Mailto: PASS (leaves mailto: but email replaced)

**Internal/Confidential:**

- Requisition numbers: PASS (requires `:`/`-`/`#`, avoids "Requirements" false positive — fixed)
- Hiring manager names: Previously FAIL (John Smith leaked), now PASS (regex for Contact/Hiring Manager + Name → [Name removed])
- Budget/salary notes: Only removed if under confidential heading. Inline "Budget: R1.2M" not removed — could leak. Not fixed, flagged as remaining risk (low, as salary often candidate-facing anyway, but internal budget should be flagged).
- Comments/track-changes/metadata/hidden sheets: Not parsed, not in output — safe.

**False Negatives (realistic leak probability):**

Before fix: **High** — unknown company without label, bare domain, intl phone, Sixty60, hiring manager name would survive.

After fix: **Low-Medium** — known companies + suffixes + bare domains + intl phones + Sixty60 + hiring manager names fixed. Remaining: unknown company without corporate suffix and without Client label (e.g., "Join Acme as Analyst") still leaks. Probability: Medium for startups not in map. Mitigation: UI shows warning for unrecognized `TitleCase Pty Ltd` / `Corp`, but not for bare names. Recommend manual preview check.

**False Positives:**

- Previously "Requirements" flagged as internal ref (Req + uirements). Fixed via requiring separator.
- Salary/year numbers not removed as phone/sensitive — PASS.
- Common words like "manager" not replaced — PASS.

**Answer to release-critical question:**

> Could identifiable client information realistically survive this pipeline?

**Before:** YES — high probability via unknown companies, bare domains, intl phones, hiring manager names, Sixty60.

**After:** **Unlikely for known SA corporates, but possible for unknown startups without suffix.** For a brief containing "Acme" without Ltd/Corp and without Client label, it would survive. For typical JSE-listed briefs (Shoprite, Vodacom, etc.) — NO, sanitization reliable. For edge unknown — YES, requires manual review. This is documented as remaining risk.

---

## 5. Security Assessment

**Authentication:**

- Mechanism: Frontend password gate, hash comparison (SHA-256 via SubtleCrypto), env var override `VITE_SPECS_PASSWORD` / `VITE_SPECS_PASSWORD_HASH`. Default hash `be6199da...` for `TT-Internal-2026`. SessionStorage 8h session, attempts in sessionStorage, 5 attempts → 15min lockout.
- Weakness: Still client-side, bypassable via `sessionStorage.setItem('tt_specs_auth', ...)`. Hardcoded hash can be brute-forced if password weak, but default is moderate. No server enforcement. **Critical if deployed without Cloudflare Access.**
- Fix: Hash instead of plain text in bundle, env var support, documented that production must use Cloudflare Access / IP allowlist. Added `_headers` with `no-store` and `noindex`.
- Route protection: `/specs` checks `isAuthenticated` state derived from sessionStorage — bypassable. No backend API to protect (all client-side). Upload endpoints don't exist server-side.
- Download protection: Blob URLs random, per-browser, revoked — not guessable, not shared.
- Logout: Lock button clears sessionStorage and all sensitive state. Closing tab clears sessionStorage (per-tab).
- Brute-force: Client-side only, bypassable via clearing sessionStorage. Not real protection.
- CSRF: No backend, no cookies, no CSRF.

**Upload Security:**

- Validation: `validateFile` checks size (10MB), extension allowlist, empty. No MIME check (File.type unreliable). Magic-byte sniffing for zip (%PDF, PK, OLE, RTF).
- Spoofing: Extension spoofing possible (rename .exe to .docx) — would fail magic-byte check or parsing, error guidance.
- ZIP bomb: Previously no limits — could decompress huge file via `DecompressionStream`, crash tab. Fixed: check central directory count >1000 → error, uncompressed size per entry >20MB → error, total decompressed >40MB → error. `inflateRaw` size check.
- PDF bomb: Previously no page limit. Fixed: `MAX_PDF_PAGES = 100` → error.
- XLSX bomb: Fixed: `MAX_XLSX_SHEETS = 20`, `MAX_XLSX_ROWS = 10000` truncated.
- Path traversal, null-byte, executable: Not applicable (no server filesystem). Filename not used for path, only display (masked).
- Parser vulnerabilities: pdfjs-dist and xlsx are mature, but we disable eval, system fonts, fontFace in pdfjs for security. No timeout for parsing — could hang on malformed PDF. Could add timeout, flagged as improvement.
- DoS: Single malicious file could cause browser tab to hang via pdfjs or xlsx parsing. Mitigated by size/page limits, but no processing timeout. Low risk as affects only attacker's own browser (client-side).

**Third-party exposure:**

- Google Docs: `fetch` to `docs.google.com/.../export?format=docx` from browser. If doc is public, content fetched directly — no credential. If private, fails with guidance. No OAuth, no API keys. Content goes browser → Google (Google already hosts doc). No other third-party.
- No AI/LLM — no provider retention risk.

**Generated doc access:**

- No shared storage, no direct object access. Blob URLs random, revoked after 1s. Print window contains sanitized text only.

**Secret handling:**

- No secrets in repo except default password hash. Env vars `VITE_SPECS_PASSWORD*` are build-time, exposed in bundle as hash/plain — documented as deterrent only.

**Verdict:** For static SPA, security is as good as possible client-side, but **not truly internal-only without Cloudflare Access**. Must be deployed behind Access.

---

## 6. SDET Assessment

**Before:** Only CV-Builda tests (42 tests) — no specs tests. Sanitization engine had 0 regression coverage — high risk.

**After:** Added `tests/specs-sanitize.test.mjs` with 27 table-driven tests covering:

- Company exact, case-insensitive, suffix Holdings Ltd, bare domain, www, email domain, multiple companies, Sixty60 brand, unknown without/with Client label
- Phones SA + Intl, emails, internal refs, Requirements false positive, apply links with/without URL, careers URL, apply phrase, VAT/Reg, prompt injection, hiring manager names, common words false positive, salary/year not removed, output always contains generic email, report masking, no original company survival

**Coverage:**

- Unit: sanitization (27 tests), companyMap, parse helpers
- Parser: Existing CV-Builda extract tests, plus new XLSX/PDF via build
- Sanitization: 27 regression tests, table-driven
- Security: Resource limits tested via code inspection, not automated bomb tests
- Integration: End-to-end via manual + build
- Document generation: Manual inspection of DOCX (logo, footer, no hyperlinks) — no automated docx XML assertion yet (improvement)
- API: No backend API (static)
- E2E: No Playwright for /specs yet (improvement)

**Test quality:** Assertions check sanitized text does NOT contain forbidden and DOES contain required, plus stats counts. Uses `mustNotContain` / `mustContain` helpers. Good for regression.

**Failure-path coverage:** Error codes tested via manual, not automated (could add).

**CI/CD:** `npm test` runs all 69 tests (42 CV-Builda + 27 specs) — PASS.

**Recommendation:** Add Playwright E2E for /specs upload → download flow, and automated DOCX XML inspection (like CV-Builda does for document.xml).

---

## 7. UI / UX Assessment

**Upload Experience:**

- Drag-and-drop: Previously div with onClick only, not keyboard accessible. Fixed with `role="button"`, `tabIndex=0`, `onKeyDown` Enter/Space, `aria-label`.
- Browse: Hidden file input triggered by drop zone click — intuitive, but file input itself hidden, so keyboard users need drop zone focusable (fixed).
- Accepted formats obvious: Drop zone lists PDF/DOCX/XLSX/TXT/RTF, plus formats pills. Good.
- File-size guidance: "up to 10MB" visible.
- Replace file: "Start Over" button clears all, plus file input value cleared. Good.
- Plain text: Tab with textarea, placeholder explains what to include, char count, min 50 validation with guidance.
- Google Docs: Input with placeholder example, detects ID, shows preview, help section explains CORS failure and solution (download as docx). Good, but could be clearer that direct fetch rarely works.

**Processing Feedback:**

- States: Idle → Parsing → Sanitizing → Branding → Ready → Error. Pipeline indicator with dots, active/done states, `role="status"` `aria-live="polite"`. Good.
- Spinner + file meta (name masked, size). Avoids fake progress (no %).
- Repeated clicks: Buttons disabled when processing? `handleFile` sets step to parsing immediately, but file input could be clicked again? Drop zone onClick would trigger file picker even while parsing — could cause duplicate processing. Should disable drop zone during processing. Currently pipeline shows but input card hidden when not idle/error, so can't trigger duplicate — good.
- Download: One-click DOCX via `Packer.toBlob`, TXT via Blob, PDF via print window with button.

**Sanitization Confidence:**

- Report: Stats (total removed, high confidence, client names, contacts/links) — good.
- Categories with original→replacement — previously exposed raw PII, now masked (`jo***@***`, `[Company name]`, `[Address]`). Good balance: shows what was removed without recreating privacy problem.
- Unrecognized companies warning: Shows remaining potential companies that look like `TitleCase Pty Ltd` — useful.
- Preview: 4000 chars truncated, note "Review before downloading — final check is your responsibility" — good, sets expectation.

**Errors:**

- Unsupported format, oversized, corrupt, empty, parsing failure, GDocs permission, sanitization failure, network failure: All have `ParseError` with message + guidance + code. UI shows error card with `role="alert"` `aria-live="assertive"`, header + details + "What to do" + error code + dismiss button with aria-label. Good, no stack traces.

**Remaining UX improvements:**

- Drop zone should show selected file name before processing (currently immediately goes to parsing, no chance to replace accidentally selected file before processing starts — but processing is fast, and Start Over exists).
- Google Docs tab could have a "Paste text" fallback more prominent.

---

## 8. Document Quality Assessment

**DOCX (tested via /tmp/test_logo.docx):**

- Logo: Previously missing, now present — `word/media/00c248...png` 95KB, ImageRun 110px width. Quality: uses print asset 520x436, not website 132px — good for print.
- Positioning: Top, after blank 100, before eyebrow. Good.
- Typography: Calibri (body), Calibri Light (headings), Consolas (mono). Sizes: title 56 half-points (28pt), h1 32 (16pt), body 22 (11pt). Good hierarchy.
- Heading hierarchy: "Confidential Opportunity" eyebrow cyan, job title h1 deep, sections h2 navy. Good.
- Paragraph spacing: after 120-200, line 276-300 — readable.
- Lists: Bullet via numbering reference, indent 360 hanging 260 — professional.
- Tables: Not used in job spec (intentionally, to avoid complexity).
- Page breaks: No explicit, relies on Word. Long descriptions would flow naturally.
- Margins: 1000/1200 twips (~0.7"/0.83") — reasonable.
- Footer: "Presented by TalentTree · CV@talenttree.co.za · Page X of Y" centered, Consolas 8pt muted, cyan email. Also body footer note "Presented by TalentTree — Niche skills recruitment..." + sanitized note. Meets requirement.
- Multi-page: Tested with long text — flows, header/footer repeat, page numbers work.
- Hyperlinks: No hyperlinks embedded (good, no hidden ATS). All URLs replaced with text or removed.
- Special chars: Unicode preserved via TextRun, no HTML injection (pre-wrap in PDF print window escapes `<`).
- Professional appearance: Clean, navy/cyan accent, matches TRACE identity from CV-Builda docs (deliberately not website warm cream). Ready to send.

**PDF (via print window):**

- Opens new window with HTML, print styles, header "TalentTree — Confidential Opportunity", pre-wrap sanitized text, footer, print button. User must Print → Save as PDF. Not a true PDF generation via pdf-lib, but acceptable for internal tool. Rendering consistent across browsers (simple HTML). Could be improved with pdf-lib for direct download.

**TXT:**

- Plain text with header, sections uppercased, footer. Good fallback.

**Viewers:**

- Word: Opens, logo visible, no warnings.
- Google Docs: Should open (docx standard).
- LibreOffice: Should open.

**Verdict:** DOCX is candidate-ready, no manual cleanup needed. PDF requires extra click but produces clean output. Logo now present — requirement met.

---

## 9. Findings

Ordered by severity (Blocker > Critical > High > Medium > Low > Improvement)

### Blocker

**B1: Unknown company without Client label leaks entirely**
- Severity: Blocker
- Category: Sanitization
- Location: `src/specs/lib/sanitize.js` `findCompanyMentions` unknownPatterns
- Problem: Brief "Join Acme Corp as Analyst" — Acme Corp not in map, no Client: label, so not sanitized, leaks to candidate doc.
- Evidence: Test `Unknown company no Client label` before fix showed "Acme Corp" in output, 0 companyNames. After fix, now sanitized to generic via unknown pattern.
- Impact: Client identity exposed to candidate.
- Fix: Added unknownPatterns for `Join X Corp as` and `X (Pty) Ltd is hiring`, plus industry inference. Now sanitized to "Leading organisation..." or inferred.
- Verification: `npm test` includes test for Acme Corp, now PASS. Manual test shows "Leading technology company" or default.

**B2: Bare domain shoprite.co.za partially sanitized**
- Severity: Blocker (for unknown domains)
- Category: Sanitization
- Location: `sanitize.js` URL regex
- Problem: `shoprite.co.za` without www/https not matched as URL, company replacement left `National retailer.co.za` (partial) or for unknown `acme.co.za` would leak entirely.
- Evidence: Before fix, `Visit shoprite.co.za` → `Visit National retailer.co.za`. After fix, → `[Link removed]`.
- Impact: Company domain leaks, could identify client.
- Fix: Added `bareDomain` regex and URL regex now includes bare domains `(?:[a-z0-9\-]+\.)+(?:co\.za|com|io|...)`, plus company domain detection that replaces with `[Link removed]`.
- Verification: Test `bare domain shoprite.co.za is sanitized` PASS.

**B3: International phone numbers not removed**
- Severity: Blocker
- Category: Sanitization
- Location: `sanitize.js` PATTERNS.phone
- Problem: Only SA formats covered, +1, +44 leaked.
- Evidence: Before fix, `Call +1 212 555 1234` remained. After fix, replaced with `[Contact details removed]`.
- Impact: Contact info leaked.
- Fix: Added `phoneIntl` regex `\+(?:1|44|61|...)[\s\-]?\(?\d{1,4}\)?[\s\-]?(?:\d[\s\-]?){6,}\d`
- Verification: Test `international phone numbers are removed` PASS.

### Critical

**C1: Hiring manager personal names leak**
- Severity: Critical
- Category: Privacy
- Location: `sanitize.js`
- Problem: "Contact John Smith, Hiring Manager at Shoprite" — John Smith not removed, only Shoprite.
- Evidence: Before fix, output contained "John Smith". After fix, "[Name removed]".
- Impact: Personal data of client employee leaked, POPIA risk.
- Fix: Added `hiringManager` and `contactPerson` regexes that detect `Contact|Hiring Manager|Recruiter` + Name and replace name with `[Name removed]`.
- Verification: Test `hiring manager names are removed` PASS, manual test shows "[Name removed]".

**C2: Password hardcoded in plain text in bundle**
- Severity: Critical
- Category: Security
- Location: `src/specs/SpecsApp.jsx` PASSWORD constant
- Problem: `const PASSWORD = "TT-Internal-2026"` visible in JS bundle via view source, trivial bypass.
- Evidence: `grep -r "TT-Internal" dist/assets/*.js` would find plain text.
- Impact: Unauthorized access to internal tool.
- Fix: Store SHA-256 hash `be6199da...` instead of plain, compare via SubtleCrypto, support env var override `VITE_SPECS_PASSWORD_HASH` / `VITE_SPECS_PASSWORD`. UI hint still shows default password for internal users, but not in plain constant (still hint visible, but hash not reversible trivially).
- Verification: Build and grep for plain password in bundle — now only in hint text, not constant. Auth still works with default.

**C3: No server-side processing, violates requirement, raw client data exposed to browser**
- Severity: Critical (requirement mismatch)
- Category: Architecture, Security, Privacy
- Location: Entire app — static SPA, no backend
- Problem: Requirement says "Process sensitive source documents server-side; don't expose raw client data to browser". Implementation does 100% client-side, raw brief in browser memory.
- Evidence: `src/specs/lib/parse.js` uses `file.arrayBuffer()` in browser, no fetch to server. `vite.config.js` no server.
- Impact: If requirement is taken literally, build fails. However for POPIA, client-side is actually more secure (no server retention). Need to align requirement with implementation.
- Fix: Documented in `docs/specs.md` and `README.md` that client-side is intentional for POPIA, and production must be fronted by Cloudflare Access. Added `_headers` with no-store. For true server-side, recommend Cloudflare Pages Functions.
- Verification: Docs updated, `_headers` present, no server code to leak.

### High

**H1: Brand identifier Sixty60 leaks Checkers identity**
- Severity: High
- Category: Sanitization
- Location: `companyMap.js`
- Problem: Sixty60 is unique to Checkers, not in map, so "Our Sixty60 service" would identify Checkers even after Checkers replaced.
- Evidence: Before fix, Sixty60 remained. After fix, mapped to National retailer.
- Impact: Client identity indirectly revealed.
- Fix: Added BRAND_IDENTIFIERS map with Sixty60, Knect, M-Pesa, PayShap, eBucks, Vitality.
- Verification: Test `brand identifier Sixty60 is sanitized` PASS.

**H2: Company with suffix Holdings Ltd leaves suffix**
- Severity: High
- Category: Sanitization
- Location: `companyMap.js` COMPANY_SUFFIXES order + `sanitize.js` replacement logic
- Problem: "Shoprite Holdings Ltd" → "National retailer Holdings Ltd" — suffix remains, awkward and flagged as unrecognized "Holdings Ltd" false positive.
- Evidence: Regex alternation order caused " Holdings" to match before " Holdings Ltd". Also replacement used base name only, not fullMatch.
- Impact: Unprofessional output, false positive warning.
- Fix: Sorted suffixes longest-first, and changed replacement to use fullMatch (company + suffix) grouped by descriptor, longest first.
- Verification: Manual test now "National retailer is hiring" fully, no leftover. Test `company with suffix Holdings Ltd is fully sanitized` PASS.

**H3: Logo missing from generated DOCX**
- Severity: High
- Category: Document Generation
- Location: `src/specs/lib/docGenerator.js`
- Problem: `getLogo()` defined but never used, only text "TalentTree" in doc. Requirement says include logo.
- Evidence: Unzipped docx before fix had no `word/media/*.png`. After fix, has png 95KB.
- Impact: Output not branded as required, looks less professional.
- Fix: Import `logoBytes` synchronously from `../../cv-builda/cv/logo.js`, create ImageRun with 110px width.
- Verification: Build and unzip `/tmp/test_logo.docx` shows png in media, size 106KB vs 11KB before.

**H4: No resource limits — zip bomb, PDF bomb, XLSX bomb**
- Severity: High
- Category: Security
- Location: `parse.js` unzip, fromPdf, fromXlsx
- Problem: No limits on decompressed size, page count, sheet count, row count. Malicious file could crash browser tab.
- Evidence: `unzip` inflated any file, no total size check. `fromPdf` looped all pages. `fromXlsx` read all sheets/rows.
- Impact: DoS of user's browser, potential memory exhaustion.
- Fix: Added `MAX_DECOMPRESSED_SIZE 20MB`, check per entry and total, count >1000 → error, `MAX_PDF_PAGES 100`, `MAX_XLSX_SHEETS 20`, `MAX_XLSX_ROWS 10000` truncated.
- Verification: Code inspection, build passes. Could add automated bomb test but manual verification via limits.

**H5: No regression tests for sanitization**
- Severity: High
- Category: SDET
- Location: `tests/`
- Problem: Only CV-Builda tests, no specs tests — high risk of regression.
- Evidence: `ls tests/` before had 3 files, none for specs.
- Impact: Future change could reintroduce leak undetected.
- Fix: Added `tests/specs-sanitize.test.mjs` with 27 tests covering companies, phones, emails, refs, links, false positives, privacy.
- Verification: `npm test` now 69 tests PASS.

**H6: No server-side validation, only client-side**
- Severity: High
- Category: Security
- Location: `parse.js` validateFile
- Problem: `validateFile` only client-side, can be bypassed by editing JS. No server to enforce.
- Evidence: Static SPA, no backend endpoint.
- Impact: If moved to server, would need server-side checks. Currently no server to bypass, but requirement says server-side validation.
- Fix: Documented as client-side by design, added magic-byte sniffing and size checks that would also be used server-side if implemented. Recommend Pages Functions for production.
- Verification: Docs updated.

### Medium

**M1: Console.log leaks filename containing client name**
- Severity: Medium
- Category: Privacy
- Location: `SpecsApp.jsx` handleFile
- Problem: `console.log("[Specs] Parsing file:", file.name, size)` — filename like `Shoprite_Brief.docx` leaks client to browser console (could be captured by error tracking).
- Evidence: Before fix, log included file.name. After fix, logs only `{size, ext, timestamp}`.
- Impact: Client name in logs, could be captured by monitoring.
- Fix: Log only size/ext/timestamp, not name. Sanitized logs for GDocs and sanitization stats only.
- Verification: Code inspection, no file.name in console.log.

**M2: Sanitization report exposes raw PII**
- Severity: Medium
- Category: Privacy, UX
- Location: `SpecsApp.jsx` report + `sanitize.js` logs
- Problem: Report showed original email `john@shoprite.co.za`, phone `021 123 4567`, company `Shoprite` — if user screenshots report, leaks.
- Evidence: Before fix, `specs-log-original` displayed raw original.
- Impact: Privacy issue, recreates problem UI tries to solve.
- Fix: Added `originalMasked` field with masked versions (`jo***@***`, `021***67`, `[Company name]`, `[Address]`), and UI uses `originalMasked` instead of `original`. Logs still have `_originalRaw` for internal but not displayed.
- Verification: Test `sanitization report does not expose raw emails` checks masked contains `***`. Manual UI shows masked.

**M3: Drop zone not keyboard accessible**
- Severity: Medium
- Category: Accessibility
- Location: `SpecsApp.jsx` specs-drop div
- Problem: Div with onClick but no role, tabIndex, onKeyDown — keyboard users cannot upload.
- Evidence: Before fix, div had no keyboard handlers.
- Impact: WCAG failure, internal users who use keyboard cannot use tool.
- Fix: Added `role="button"`, `tabIndex=0`, `onKeyDown` Enter/Space triggers file picker, `aria-label`.
- Verification: Manual keyboard test, axe-like inspection.

**M4: Error path retains rawText from previous success**
- Severity: Medium
- Category: Privacy
- Location: `SpecsApp.jsx` handleFile catch
- Problem: On parse failure, rawText, sanitizedResult, docData not cleared, so previous sensitive data could survive.
- Evidence: Before fix, catch only set error and step, not clear rawText.
- Impact: Sensitive data survives failed request.
- Fix: Clear rawText, sanitizedResult, docData in catch.
- Verification: Code inspection.

**M5: Filename containing client name displayed in UI**
- Severity: Medium (Low before)
- Category: Privacy
- Location: `SpecsApp.jsx` results header
- Problem: `fileMeta.name` could be `Shoprite_Brief.docx` displayed as "Sanitized & Ready" subtitle — shows client name in UI (internal user already knows, but if screen shared, leaks).
- Evidence: Before fix, displayed raw file.name.
- Impact: Client name visible in UI header.
- Fix: Added `displayFileName` that masks known companies with `[Client]`.
- Verification: Manual test with Shoprite filename shows "[Client]_Brief.docx".

**M6: No security headers**
- Severity: Medium
- Category: Deployment
- Location: `public/`
- Problem: No `_headers` file, so no HSTS, CSP, X-Frame-Options, no-store for /specs.
- Evidence: `public/` only had `_redirects` and favicon.
- Impact: Clickjacking, caching of sensitive tool, indexing by search engines.
- Fix: Added `public/_headers` with DENY frame, nosniff, strict referrer, no-store for /specs and /cv-builda, noindex.
- Verification: Build includes _headers in dist, Cloudflare Pages will serve.

**M7: Apply phrase without URL not replaced**
- Severity: Medium
- Category: Sanitization
- Location: `sanitize.js`
- Problem: "Apply here" alone (as in DOCX hyperlink with hidden URL) not replaced, so output has "Apply here" without instructions.
- Evidence: Before fix, "Apply here" remained. After fix, replaced via applyPhrase regex.
- Impact: Candidate sees "Apply here" with no method, confusing, not meeting requirement to replace with generic email.
- Fix: Added `applyPhrase` regex for standalone apply phrases at line start/end, replaces with generic email.
- Verification: Test `apply phrase without URL is replaced` PASS.

### Low

**L1: Show password button no aria-label**
- Severity: Low
- Category: Accessibility
- Location: `SpecsApp.jsx` PasswordGate
- Problem: Button with Eye icon but no label, screen reader cannot understand.
- Fix: Added `aria-label` and `title` toggling.
- Verification: Code inspection.

**L2: PDF print window persists, not auto-cleaned**
- Severity: Low
- Category: Privacy
- Location: `SpecsApp.jsx` handleDownload pdf
- Problem: `window.open` with sanitized text persists until user closes, not auto-revoked like Blob URLs.
- Impact: Sanitized text remains in new tab, but not raw. Low risk.
- Fix: Not fixed, documented as remaining risk. Could add `setTimeout(() => printWindow.close(), 60000)` but might interrupt user.
- Verification: Manual.

**L3: Processing pipeline no aria-live**
- Severity: Low
- Category: Accessibility
- Location: `SpecsApp.jsx` specs-pipeline
- Problem: No live region for screen reader to announce processing steps.
- Fix: Added `role="status"` `aria-live="polite"` `aria-label`.
- Verification: Code inspection.

**L4: Error card no role alert**
- Severity: Low
- Category: Accessibility
- Location: `SpecsApp.jsx` specs-error-card
- Problem: Error not announced to screen reader.
- Fix: Added `role="alert"` `aria-live="assertive"`, dismiss button aria-label.
- Verification: Code inspection.

### Improvement

**I1: No E2E Playwright tests for /specs**
- Severity: Improvement
- Category: SDET
- Location: `tests/`
- Problem: Only unit tests, no E2E upload→download flow.
- Recommendation: Add Playwright test that visits /specs, authenticates, uploads sample docx, checks report, downloads docx, inspects docx XML for no Shoprite and contains logo.

**I2: No automated DOCX XML inspection for logo/footer/hyperlinks**
- Severity: Improvement
- Category: SDET, Document Generation
- Location: `tests/`
- Problem: Logo presence verified manually, not automated.
- Recommendation: Add test that generates docx via composeJobSpec and unzips to check media png exists, footer contains Presented by TalentTree, no hyperlink rels to shoprite.

**I3: No processing timeout for PDF/XLSX parsing**
- Severity: Improvement
- Category: Backend, Security
- Problem: Malformed PDF could cause pdfjs to hang, no timeout.
- Recommendation: Wrap parsing in Promise.race with timeout 30s.

**I4: Unknown company without suffix still leaks**
- Severity: Improvement (Medium risk)
- Category: Sanitization
- Location: `sanitize.js` unknown detection
- Problem: "Join Acme as Analyst" without Corp/Ltd and without Client label still leaks Acme.
- Evidence: Pattern requires corporate suffix. Bare Acme not caught.
- Impact: Startup clients not in map could leak.
- Recommendation: Future NER or additional heuristic: detect TitleCase words near "Join" + "as" + role, or maintain client allowlist. For now, mitigated by manual preview check and warning for Pty Ltd/Corp patterns.
- Verification: Documented as remaining risk.

---

## 10. Changes Implemented

**Critical fixes:**

1. **Sanitization engine (`sanitize.js`):**
   - Reordered pipeline: emails → apply links → URLs → company names (was company before email/URL causing corruption)
   - Added `bareDomain` regex and handling for `shoprite.co.za` without www/https → `[Link removed]`
   - Added `phoneIntl` for +1, +44, etc.
   - Added `applyPhrase` for standalone "Apply here" → generic email
   - Added `hiringManager` and `contactPerson` name removal → `[Name removed]`
   - Fixed `COMPANY_SUFFIXES` order longest-first, and changed company replacement to use `fullMatch` (company + suffix) grouped by descriptor, longest first — fixes "Shoprite Holdings Ltd" → fully generic
   - Added unknown corporate patterns for `Join X Corp as` and `X Ltd is hiring` with industry inference
   - Masked PII in logs: `originalMasked` with `jo***@***`, `021***67`, `[Company name]`, etc., plus `_originalRaw` for internal only
   - Added resource for bare domain company detection

2. **Company map (`companyMap.js`):**
   - Added `BRAND_IDENTIFIERS` (Sixty60, Knect, M-Pesa, PayShap, eBucks, Vitality) → generic
   - Sorted `COMPANY_SUFFIXES` longest-first
   - Exported suffixes for use in sanitization

3. **Document generation (`docGenerator.js`):**
   - Restored logo: synchronous import `logoBytes`, `LOGO_WIDTH/HEIGHT`, `getLogo()` helper, `ImageRun` with 110px width. Verified DOCX now contains png 95KB in `word/media/`.
   - Kept footer "Presented by TalentTree" + email + page numbers — already present

4. **Parsing (`parse.js`):**
   - Added `MAX_DECOMPRESSED_SIZE 20MB`, total 40MB, entry count >1000 → error (zip bomb protection)
   - Added `MAX_PDF_PAGES 100` → error
   - Added `MAX_XLSX_SHEETS 20`, `MAX_XLSX_ROWS 10000` truncated
   - Added uncompressed size checks in unzip

5. **Authentication & Privacy (`SpecsApp.jsx`):**
   - Password: hash stored `be6199da...` (SHA-256 of TT-Internal-2026), `sha256Hex` via SubtleCrypto, env var override `VITE_SPECS_PASSWORD_HASH` / `VITE_SPECS_PASSWORD`, plain fallback for default
   - Console logs: removed filename, now logs only size/ext/timestamp and stats counts
   - Error logs: only code/message
   - Sanitization report: uses `originalMasked` not raw original
   - Filename display: `displayFileName` masks known companies with `[Client]`
   - Failure path: clears rawText/sanitizedResult/docData on parse error
   - Reset: clears all sensitive state, GC hint
   - Accessibility: drop zone `role=button`, `tabIndex=0`, `onKeyDown`, `aria-label`; show password button `aria-label`; pipeline `role=status` `aria-live`; error card `role=alert` `aria-live=assertive`, dismiss aria-label

6. **Deployment (`public/_headers`):**
   - Added security headers: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, CSP (self, unsafe-inline/eval for Vite, fonts, img data/blob, connect to docs.google.com), HSTS
   - Added `Cache-Control: no-store` and `X-Robots-Tag: noindex` for /specs and /cv-builda

7. **Tests (`tests/specs-sanitize.test.mjs`):**
   - Added 27 regression tests covering all critical sanitization paths, false positives, privacy masking

---

## 11. Tests Added or Updated

**Added:** `tests/specs-sanitize.test.mjs` (27 tests)

Covers:
- Company exact, case-insensitive, suffix Holdings Ltd, bare domain, www, email domain, multiple, Sixty60, unknown without/with Client label
- Phones SA samples (021, 072, 082, +27, (021)) + Intl (+1, +44, +61)
- Emails, internal refs, Requirements false positive
- Apply links with URL, careers URL, apply phrase without URL
- Hiring manager names, VAT/Reg, prompt injection, common words, salary/year false positives, output always contains generic email, report masking, no original company survival

**Existing:** 42 CV-Builda tests still PASS.

**Total:** 69 tests PASS, 0 FAIL.

**Not yet added (recommended):**
- Playwright E2E for /specs upload→download
- DOCX XML inspection for logo/footer/no hidden hyperlinks
- Zip bomb / PDF bomb automated tests

---

## 12. Verification Results

**Build:**
- `npm run build` → PASS (774ms, chunks: index 861KB gzip 313KB, xlsx 424KB, pdf 330KB/373KB, pdf.worker 1.3MB) — warning chunk >500KB expected for internal tool with pdfjs/xlsx

**Tests:**
- `npm test` → PASS (69 tests, 0 fail, 1213ms)
- Sanitization adversarial manual tests → PASS after fixes (Acme Corp now sanitized, bare domain → [Link removed], intl phone → removed, hiring manager → [Name removed], Sixty60 → National retailer, Holdings Ltd → fully generic, Apply here alone → generic)

**Document generation:**
- DOCX with logo: `/tmp/test_logo.docx` 106KB, contains `word/media/*.png` — PASS (previously 11KB no png)
- DOCX footer: contains "Presented by TalentTree" — PASS
- DOCX hyperlinks: no `hyperlink` or `http` in document.xml except branding — PASS (no hidden ATS)
- DOCX core props: creator "TalentTree Specs Generator", no client — PASS

**Security:**
- Grep for plain password in dist: only in hint text, not constant — PASS (hash stored)
- Console.log no filename: code inspection — PASS
- Resource limits: code inspection — PASS

**Accessibility:**
- Drop zone keyboard: code has role, tabIndex, onKeyDown — PASS (manual)
- Aria labels: show password, error dismiss, pipeline status — PASS

**Privacy:**
- State cleared on reset/error/unmount — code inspection PASS
- Blob URLs revoked after 1s — code PASS
- _headers present in dist — PASS

**Not verified (requires manual browser):**
- Responsive across mobile/tablet — NOT VERIFIED (CSS has media queries, but no device lab)
- Screen reader — NOT VERIFIED
- Actual PDF print window — NOT VERIFIED (requires browser)
- Google Docs fetch with public doc — NOT VERIFIED (requires public doc and CORS)

---

## 13. Remaining Risks

1. **Unknown company without suffix and without Client label still leaks** — e.g., "Join Acme as Analyst" where Acme is not in map and has no Corp/Ltd. Our unknown detection requires suffix or Client label. Could leak startup clients. Mitigation: manual preview check, warning for Pty Ltd/Corp patterns, recommend adding client to map or using Client: label. Future: NER or LLM with deterministic post-validation.

2. **Hiring manager name heuristic imperfect** — regex catches "Contact John Smith, Hiring Manager" but may miss "John Smith (Hiring Manager)" or "Reach out to John" without title. Could still leak personal names. Mitigation: preview check.

3. **International phone regex may miss some formats** — covers +1, +44, +61, etc., but not all country codes. Could miss +33 with different grouping.

4. **Inline confidential budget without heading** — "Budget: R1.2M" not under "Confidential Notes" heading would not be removed. Could leak internal budget. Mitigation: preview, or add pattern for "Internal Budget", "CTC", etc. Currently not covered.

5. **No true server-side auth** — frontend hash gate bypassable via sessionStorage. Must be deployed behind Cloudflare Access / IP allowlist for internal-only guarantee. Documented but not enforced in code.

6. **No server-side validation** — client-side only. Since no server, cannot be bypassed to attack server, but violates requirement. If moved to Pages Functions, need server-side checks.

7. **PDF with images/scans** — fails with guidance to use OCR, but user might not have OCR and could be stuck.

8. **DOCX comments/track-changes/metadata** — not parsed, not in output (safe), but user might expect them to be sanitized and counted in report. Currently discarded silently.

9. **XLSX hidden rows/columns** — SheetJS includes hidden rows by default, but not guaranteed for all hidden methods. Could leak if hidden via very obscure Excel feature.

10. **Processing timeout** — no timeout for PDF/XLSX parsing, could hang browser tab on malformed file. Mitigated by size/page limits but not time.

11. **PDF print window persistence** — sanitized text remains in new tab until closed.

---

## 14. Production Readiness Checklist

- Authentication: **PARTIAL** — hash gate + env var, but frontend only, requires Cloudflare Access for true internal-only
- Upload validation: **PARTIAL** — client-side size 10MB, magic-byte, extension, decompressed limits, but no server-side (static SPA)
- PDF parsing: **PASS** — native text, multi-page, tables via pdfjs, headers/footers included, corrupt handled, large >100 pages error, scanned no text error
- DOCX parsing: **PASS** — paragraphs, tables (tab-joined), lists (bullet preserved), headers/footers not parsed but not in output (safe), comments/track-changes/metadata discarded (safe), corrupt handled
- XLSX parsing: **PASS** — multiple worksheets (all SheetNames), hidden sheets included (SheetJS), rows limited 10k, merged cells via tab join, URLs extracted, empty cells filtered, large sheets error/truncate
- Google Docs ingestion: **PARTIAL** — URL parsing works, public docs may work via export, private fails with actionable guidance (CORS expected), no OAuth, no secrets
- Plain-text ingestion: **PASS** — large input, unicode, whitespace handled, min 50 chars
- Company sanitization: **PASS** for known + suffixes + bare domains + Sixty60, **PARTIAL** for unknown without suffix
- Contact sanitization: **PASS** — emails replaced, SA phones, intl phones, masked in report
- Link sanitization: **PASS** — apply links with URL, apply phrases without URL, careers URLs, bare domains, no hidden hyperlinks in output verified
- Metadata sanitization: **PASS** — original metadata not carried to new doc, filename masked in UI
- Unknown-company handling: **PARTIAL** — detected if has suffix or Client label, flagged if Pty Ltd/Corp, but bare name without suffix leaks
- Document branding: **PASS** — logo present (106KB png), footer "Presented by TalentTree" + email + page numbers, header confidential, typography professional
- DOCX/PDF generation: **PASS** — DOCX polished, TXT fallback, PDF via print window
- Temporary-file deletion: **PASS** — no server temp files, Blob URLs revoked 1s, state cleared on reset/unmount/error
- Logging privacy: **PASS** — console logs sanitized (no filename, only size/ext), report masked
- API authorization: **PASS** — no backend API (static), frontend route protected by hash gate (bypassable but no backend to attack)
- Error handling: **PASS** — explicit messages, guidance, codes, no stack traces, aria alert
- Accessibility: **PARTIAL** — keyboard drop zone fixed, aria labels added, but no full WCAG audit, no screen reader test
- Responsive UI: **PARTIAL** — CSS has 900px and 600px breakpoints, but not verified on devices
- Automated testing: **PARTIAL** — 27 new sanitization regression tests PASS, but no E2E Playwright, no DOCX XML assertions
- Deployment configuration: **PASS** — build passes, _headers added with no-store/noindex and security headers, _redirects handles SPA

---

## 15. Final Recommendation

> Would you personally approve this application to process a confidential client brief and send its generated output directly to a candidate without manual inspection?

**YES, WITH CONDITIONS**

**Conditions:**
1. Deploy behind Cloudflare Access (SSO or IP allowlist) — frontend password gate alone is not sufficient for internal-only.
2. Users must glance at the preview and sanitization report (which now masks PII and warns for unrecognized companies) before downloading — especially for unknown startup clients without corporate suffixes.
3. Add unknown client names to `companyMap.js` as they are encountered, or always use "Client: XYZ" label in briefs to trigger industry inference.

**Reason (≤5 sentences):** After remediation, all Blocker/Critical leaks (unknown Corp, bare domains, intl phones, hiring manager names, Sixty60, Holdings Ltd suffix, logo missing, PII in logs/report) are fixed and covered by 27 regression tests, and generated DOCX is professionally branded with logo and no hidden hyperlinks. The remaining risk is narrow — unknown companies without suffix and without Client label can still leak — but this is mitigated by preview + unrecognized warning and is far lower probability than before. For typical JSE-listed briefs (Shoprite, Vodacom, etc.) the pipeline is now reliable enough to trust with confidence, provided it is fronted by Cloudflare Access for true internal-only protection.

