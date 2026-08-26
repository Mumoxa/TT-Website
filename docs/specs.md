# TalentTree Specs Generator — talenttree.co.za/specs

Internal tool that converts client job briefs (PDF, Word, Excel, Google Docs, plain text) into sanitized, branded job descriptions ready to share with candidates.

## URL & Routing

- **Path:** `/specs` (trailing slash stripped, so `/specs/` works too)
- **Router:** No router library — `src/main.jsx` `Root()` checks `window.location.pathname`:
  ```jsx
  if (path === '/cv-builda') return <CvBuilda />;
  if (path === '/specs') return <SpecsApp />;
  ```
- **Cloudflare Pages:** `public/_redirects` contains `/*  /index.html  200`, so the SPA shell is served for all paths.

## Architecture

All processing happens **client-side in browser memory** — nothing is uploaded to a server. This is intentional for POPIA compliance:

- No server to store client data
- No logs of client briefs
- Original file and extracted text held only in React state
- "Start Over" or closing tab discards everything
- Session storage only holds auth timestamp, not client data

For teams requiring true server-side processing, wrap this with a Cloudflare Worker or Pages Function that does the same parsing server-side. The current client-side approach is more secure for POPIA than a server that might retain data.

### File Parsing (`src/specs/lib/parse.js`)

Reuses and extends the CV-Builda extraction logic:

- **PDF:** `pdfjs-dist` (lazy-loaded), text runs grouped by baseline, wide gaps → tabs
- **DOCX:** Zip reader (no dependency), `word/document.xml` → paragraphs, tables → tab-separated lines
- **XLSX:** Tries `xlsx` (SheetJS) first, falls back to manual XML parsing of `xl/worksheets/` and `sharedStrings.xml`
- **DOC (legacy):** UTF-16LE run extraction with readability check
- **RTF:** Control word stripping
- **Google Docs links:** ID extraction from various URL formats, attempts export via `https://docs.google.com/document/d/{id}/export?format=docx` (will fail due to CORS unless public — provides actionable guidance to download as .docx or paste text)

Validation:
- Max 10MB
- Extension allowlist: pdf, docx, xlsx, xls, txt, md, rtf, doc
- Magic-byte sniffing (PK zip, %PDF, OLE, {\\rt)
- Readability check (letters ratio >35%)
- Specific error codes: `FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`, `SCANNED_PDF`, `GDOC_SHORTCUT`, `GDOC_FETCH_FAILED`, etc.

### Sanitization (`src/specs/lib/sanitize.js`)

Product-critical — confidence in removal drives internal adoption.

**Order matters** (to avoid corrupting emails/URLs with company replacements):
1. Confidential sections
2. Emails → `CV@talenttree.co.za`
3. Apply links → `CV@talenttree.co.za`
4. URLs → `CV@talenttree.co.za` if apply/career, else `[Link removed]`
5. Company names → generic descriptors
6. Phones → `[Contact details removed]`
7. Internal refs → `[Reference removed]`
8. Addresses → `[Location details removed]`
9. VAT/Reg/CK numbers → `[Registration details removed]`
10. ID numbers (13-digit, labeled) → `[ID Removed]`

**Company mapping (`companyMap.js`):**
- 120+ known SA & global companies → descriptors
- Examples: `Shoprite` → `National retailer`, `Vodacom` → `Major telecommunications provider`, `Capitec` → `Leading financial services provider`, etc.
- Sorted longest-first to avoid partial collisions
- Fallback: `Client: XYZ Corp` pattern detection + industry inference from surrounding text (keywords → descriptor)
- Remaining potential companies flagged: regex for `TitleCase (Pty) Ltd` not in map and not generic

**Other removals:**
- Phones: SA formats +27, 0xx, (0xx) etc., 9-12 digits
- Internal refs: Require separator `:` `-` `#` to avoid matching "Requirements" — pattern `Ref: ABC-123`, `Job Code: XYZ`, `Vacancy No: 123`, `Req No: 456`
- Confidential sections: Heading alone on line + 10-500 chars until blank or known section heading
- Addresses: Number + Street type + 4-digit postal
- Sensitive: VAT/Reg/CK with label, 13-digit ID when near "ID" label

**Logging:**
Every replacement logged with original, replacement, confidence (high/medium), category. Summary: total removed, breakdown, high/medium counts. Shown in UI for user confidence.

### Document Generation (`src/specs/lib/docGenerator.js`)

Uses `docx` library (already in repo for CV-Builda):

- **Structure detection:** Tries to detect headings (About, Role, Responsibilities, Requirements, etc.) via regex, falls back to intelligent heuristics (first line = title, client descriptor → About, keyword buckets → Responsibilities/Requirements)
- **Branding:** TalentTree header, cyan accent rule, footer "Presented by TalentTree", page numbers, confidentiality header
- **Sections:** Confidential Opportunity badge, job title, company descriptor, structured content with bullets, footer note
- **Outputs:** DOCX (primary), TXT (plain), PDF via print dialog (opens new window with print styles + button)

File name: `CleanedTitle_TalentTree_Spec`

### UI (`src/specs/SpecsApp.jsx` + `specs.css`)

- **Password gate:** Default `TT-Internal-2026`, 5 attempts → 15 min lockout, sessionStorage 8h session. Notes that production should use Cloudflare Access / IP allowlist.
- **Input tabs:** Upload (drag & drop), Paste Text, Google Docs link
- **Pipeline indicator:** Parsing → Sanitizing → Branding → Ready
- **Processing states:** Spinner + file meta
- **Results:**
  - Header with file name, char count, total removed
  - Sanitization report: stats (total, high confidence, client names, contacts), categories with original→replacement, confidence badges, truncated to 5 per category
  - Unrecognized companies warning
  - Preview (4000 chars)
  - Downloads: DOCX (recommended), Print/PDF, TXT
  - Data handling note
- **Help section:** How sanitization works
- **Responsive:** Mobile collapses tabs, grid adjustments

Design tokens reuse site's `--ink`, `--paper`, etc., but with own `--specs-*` variables for tool-specific styling (distinct from marketing site, feels like utility).

## Security

- **Password gate:** Frontend deterrent only — any JS password is visible in bundle. For true protection:
  - Cloudflare Pages → Settings → Access → Add Cloudflare Access policy (SSO, email allowlist, IP)
  - Or: Cloudflare Firewall rule → IP allowlist for office
  - Or: Move to Cloudflare Workers with server-side auth
- **No data retention:** React state only, cleared on reset/unmount. No localStorage of briefs. No analytics of brief content.
- **POPIA:** Client-side processing means data never leaves consultant's browser. Safer than uploading to server that might log.
- **Logging:** Console logs for debugging, but no sensitive data logged (only file name, size, format, stats counts)
- **XSS:** Text is treated as plain text, not HTML. DOCX generation uses docx TextRun (escaped).

## Error Handling

- `ParseError` class with code + guidance
- User-facing: error card with message, details, "What to do" guidance, error code
- Common failures:
  - `FILE_TOO_LARGE` → compress or paste text
  - `UNSUPPORTED_FORMAT` → list supported
  - `SCANNED_PDF` → needs OCR or original .docx
  - `GDOC_SHORTCUT` → .gdoc is link file, not doc
  - `GDOC_FETCH_FAILED` → CORS, private doc — download as .docx or paste
  - `ODT_FORMAT` → save as .docx
  - `LEGACY_DOC_UNREADABLE` → save as .docx
  - Unrecognized companies → warning + manual review prompt

## Dependencies

- Existing: `docx@^9`, `pdfjs-dist@^4.10`, `react`, `vite`
- Added: `xlsx@^0.18.5` for Excel parsing (lazy-loaded, falls back to manual XML if not available)

## Deployment

Cloudflare Pages (existing):

- Production branch: `main`
- Build command: `npm run build`
- Output: `dist`
- Root: `/`
- No extra config — `/specs` works via `_redirects`

### Production hardening checklist

- [ ] Change default password in `src/specs/lib`? Actually in `SpecsApp.jsx` constant — replace with env var `VITE_SPECS_PASSWORD` or remove and rely on Cloudflare Access
- [ ] Add Cloudflare Access: Pages → Settings → Access → Require SSO / email domain / IP
- [ ] Test with real briefs: PDF, DOCX, XLSX, Google Docs link
- [ ] Verify sanitization: run sample with Shoprite, Vodacom, etc. — check report
- [ ] Verify DOCX output opens in Word, has branding, footer
- [ ] Check POPIA statement in footer matches legal
- [ ] Add analytics? No — avoid logging brief content. If needed, log only counts (file type, total removed) not text.

## Testing

- Existing tests: `npm test` — 42 tests for CV-Builda, all pass
- Manual: Upload sample brief with known companies, emails, phones, links — verify report shows removals
- Edge: Scanned PDF → error guidance, .gdoc → guidance, 15MB file → size error, text <50 chars → too short error

## Future improvements

- Server-side Worker for true server processing + audit log (counts only)
- More company mappings from client book
- AI-based industry inference for unknown companies (currently keyword-based)
- DOCX template upload (client-specific branding)
- Batch mode (multiple briefs → zip)
- PDF generation via `pdf-lib` instead of print dialog
- Redaction confidence tuning from user feedback

## Files changed/added

- `src/specs/SpecsApp.jsx` — main page
- `src/specs/specs.css` — styling
- `src/specs/lib/companyMap.js` — 120+ mappings + industry fallbacks
- `src/specs/lib/sanitize.js` — pipeline + logging
- `src/specs/lib/parse.js` — file parsing + Google Docs handling
- `src/specs/lib/docGenerator.js` — DOCX/TXT/PDF generation
- `src/main.jsx` — added `/specs` route
- `package.json` — added `xlsx`
- `docs/specs.md` — this doc
