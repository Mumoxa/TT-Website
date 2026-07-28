# Talent Tree CV Builda Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the complete browser-based Talent Tree CV Builda workflow to the existing React/Vite website, including local Word/PDF extraction, factual review, source coverage, two previews, and editable `.docx` export.

**Architecture:** Keep the existing JavaScript React/Vite application. Move the current marketing page into its own component and route `/cv-builda` with a small pathname switch rather than adding a routing framework. Candidate files and drafts stay in React memory only. A single approved CV view model feeds both live preview and Word generation.

**Tech Stack:** React, Vite, JavaScript with JSDoc, Mammoth.js, PDF.js, docx, Zod, Vitest, React Testing Library, Playwright, axe-core, JSZip, pdf-lib.

## Global Constraints

- Read the target repository and canonical Mumoxa `AGENTS.md` files before coding.
- Preserve source information; do not invent, infer, summarise away, inflate, or silently discard facts.
- Accept `.docx` and text-based `.pdf` only, maximum 10 MB.
- Reject `.doc`, image-only PDFs, corrupt/password-protected files, and empty files with actionable messages.
- Produce editable `.docx` only.
- All Word text, including headings and candidate name, must be Calibri 11.
- No visible lines, paragraph borders, table borders, or decorative dividers.
- No `localStorage`, `sessionStorage`, IndexedDB, service-worker candidate caching, or saved drafts.
- AI suggestions remain optional, separate, and unapplied until staff approve them.
- Standard and Executive templates contain identical approved text.
- Keep the existing marketing copy and appearance unchanged except for the new `CV Builda` link.

---

## Planned Files

```text
src/App.jsx
src/site/MarketingSite.jsx
src/cv-builda/CvBuildaPage.jsx
src/cv-builda/cv-builda.css
src/cv-builda/model/{types,createDraft,reducer,selectors,sourceLedger,dates,validation}.js
src/cv-builda/extraction/{extractCvFile,extractDocx,extractPdf,pdfWorker}.js
src/cv-builda/parsing/{headings,parseCv,parsePersonalInfo,parseExperience}.js
src/cv-builda/suggestions/suggestionClient.js
src/cv-builda/components/*.jsx
src/cv-builda/document/{buildApprovedViewModel,createDocx,standardTemplate,executiveTemplate,wordStyles,downloadBlob}.js
shared/cvSuggestionsContract.js
tests/{unit,integration,document,e2e}/
playwright.config.js
```

---

### Task 1: Add test tooling and split the route shell

**Files:** Modify `package.json`, `vite.config.js`, `src/main.jsx`, `src/styles.css`; create `src/App.jsx`, `src/site/MarketingSite.jsx`, `src/App.test.jsx`, `tests/setup.js`, and a temporary `src/cv-builda/CvBuildaPage.jsx`.

**Interfaces:** `App()` renders `MarketingSite` at `/` and `CvBuildaPage` at `/cv-builda`.

- [ ] Install runtime packages:

```bash
npm install mammoth pdfjs-dist docx zod
npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test @axe-core/playwright jszip pdf-lib
```

- [ ] Add scripts: `test`, `test:watch`, `test:e2e`, and `verify`.
- [ ] Configure Vitest with `jsdom` and `tests/setup.js` importing `@testing-library/jest-dom/vitest`.
- [ ] Write failing tests proving `/` retains the current site and includes a `/cv-builda` link, while direct `/cv-builda` renders `Talent Tree CV Builda`.
- [ ] Move existing site JSX/data from `src/main.jsx` into `src/site/MarketingSite.jsx` without copy changes.
- [ ] Implement `src/App.jsx`:

```jsx
import { lazy, Suspense } from 'react';
import MarketingSite from './site/MarketingSite';

const CvBuildaPage = lazy(() => import('./cv-builda/CvBuildaPage'));

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/cv-builda') {
    return <Suspense fallback={<main aria-live="polite">Loading CV Builda…</main>}><CvBuildaPage /></Suspense>;
  }
  return <MarketingSite />;
}
```

- [ ] Run:

```bash
npm test -- src/App.test.jsx
npm run build
```

- [ ] Commit: `test: establish CV Builda route and test harness`.

---

### Task 2: Define the factual CV model and memory-only reducer

**Files:** Create `model/types.js`, `createDraft.js`, `sourceLedger.js`, `reducer.js`, `selectors.js`, plus reducer/ledger unit tests.

**Interfaces:**

```js
createEmptyDraft()
cvReducer(state, action)
createSourceFragment(input)
selectUnreviewedFragments(state)
selectPendingNotes(state)
selectPendingSuggestions(state)
selectApprovedDraft(state)
```

- [ ] Write failing tests for new fragments starting `unreviewed`, assignment retaining original text, explicit exclusion, approved suggestions remaining separate until approval, immutable record operations, and full reset.
- [ ] Define JSDoc types for `Provenance`, `CoverageState`, `SourceFragment`, `ProvenancedValue`, `Qualification`, `Certification`, `WorkExperience`, `AdditionalNote`, `Suggestion`, and `CvDraft`.
- [ ] Use provenance values `source`, `staff`, and `approved-suggestion`; fragment states `unreviewed`, `assigned`, and `excluded`.
- [ ] `createEmptyDraft()` must create fresh arrays/objects and contain no persistence identifiers.
- [ ] Implement reducer actions for extraction load, field changes, add/remove/reorder, fragment assignment/exclusion/restoration, note splitting and decisions, suggestion receipt/approval/edit/rejection, template selection, warning acknowledgement, generation status, and reset.
- [ ] Run unit tests and commit: `feat: add factual CV state and source ledger`.

---

### Task 3: Extract DOCX and PDF locally

**Files:** Create extraction modules, fixture generator, and extractor tests.

**Interface:**

```js
extractCvFile(file): Promise<{ fragments: SourceFragment[], warnings: ExtractionWarning[] }>
```

Typed error codes: `unsupported_type`, `file_too_large`, `empty_file`, `corrupt_file`, `password_protected`, `image_only_pdf`, `unreadable_order`.

- [ ] Generate synthetic fixtures with `docx` and `pdf-lib`: representative DOCX, two-page text PDF, image-only PDF, empty DOCX, and corrupt DOCX. Mock PDF.js password exceptions in unit tests.
- [ ] Validate extension and size before parsing; do not trust MIME type alone.
- [ ] DOCX: use Mammoth `convertToHtml({ arrayBuffer })`, parse with `DOMParser`, read `textContent` only, and create ordered paragraph/heading/table-row fragments. Never render Mammoth HTML.
- [ ] PDF: configure `pdfjs-dist/build/pdf.worker.min.mjs?url`, call `getTextContent()` per page, group text by Y position, sort X positions, preserve page number and order, and flag uncertain ordering.
- [ ] Reject documents with no meaningful text.
- [ ] Run fixture and extractor tests, then commit: `feat: extract DOCX and text PDF files locally`.

---

### Task 4: Parse conservatively, normalise dates, and block information loss

**Files:** Create heading, personal-info, experience, and main parser modules; date and validation modules; unit tests.

**Interfaces:**

```js
parseCvFragments(fragments)
normaliseDateRange(input)
sortWorkExperience(records)
validateForExport(state)
```

- [ ] Write failing tests for agreed heading variants, top-of-CV contact detection, unclassified fragments, year-only dates, `Current` to `Present`, reverse chronology, unsafe date comparison, and export blocking.
- [ ] Recognise only conservative section aliases for profile/summary, career summary, education/qualifications, certifications, skills, and work experience.
- [ ] Preserve summary paragraphs verbatim; do not add a summary when absent.
- [ ] Split skills only on explicit delimiters.
- [ ] Create work records only when employer/title/date structure is sufficiently clear; otherwise leave fragments unclassified.
- [ ] Never add `generateSummary`, inferred-skills, or achievement-generation functions.
- [ ] Preserve year-only dates; never invent months. Sort comparable records and preserve source order with a warning when not safely comparable.
- [ ] `validateForExport()` blocks unreviewed source fragments, undecided notes, and structurally invalid records; acknowledged overlap warnings need not block.
- [ ] Run tests and commit: `feat: parse CV sections without silent information loss`.

---

### Task 5: Build upload, review, editing, and source-coverage UI

**Files:** Implement `CvBuildaPage.jsx`, styling, header, stepper, upload, editors, source-coverage panel, dialogs/status components, and integration tests.

**Test seams:** `CvBuildaPage({ initialState, suggestionTransport })` accepts optional test injection; production defaults to `createEmptyDraft()` and the real suggestion client.

- [ ] Write workflow tests for file upload, errors, extraction progress, editing every section, adding/removing/reordering records, viewing original text, explicit exclusion, Start Over, and zero browser-storage calls.
- [ ] Use `useReducer`; do not add persistence effects.
- [ ] Release object URLs and parsed objects on replacement/reset/unmount.
- [ ] Upload input must support drag/drop, keyboard activation, `.docx,.pdf`, visible progress, replace action, and actionable failure messages.
- [ ] Structured fields:
  - Personal information and contact details;
  - Professional Summary;
  - Qualifications: year, qualification, institution, supplied detail;
  - Certifications;
  - Technical Skills;
  - Work Experience: Employer, Duration, Title, Reason for leaving, Responsibilities.
- [ ] Source Coverage shows original fragment, source location, destination selector, assign action, and explicit exclude-with-confirmation.
- [ ] Desktop uses editor/preview columns; mobile uses a one-column Editor/Preview switch.
- [ ] Add semantic labels, `aria-live`, visible focus, reduced-motion support, accessible dialogs, and no colour-only status.
- [ ] Run integration tests and manual keyboard/mobile checks; commit: `feat: add CV upload and factual review workspace`.

---

### Task 6: Add additional information and approval-based suggestion controls

**Files:** Create `shared/cvSuggestionsContract.js`, suggestion client, Additional Information panel, Suggestion Queue, and tests.

**Tasks:** exactly `classify_notes`, `refine_bullet`, `review_dates`, `flag_duplicates`, `refine_existing_summary`.

- [ ] Define strict Zod request/response schemas: one to eight fragments, 4,000 characters each, 12,000 characters total, stable fragment IDs, no unknown keys.
- [ ] Write tests proving returned suggestions do not alter approved fields until staff act.
- [ ] Split pasted notes on blank lines/bullets into individually reviewable fragments.
- [ ] Staff may request a destination suggestion or manually place each note.
- [ ] Show original text beside destination/wording, reason, confidence, and warnings.
- [ ] Actions: approve, edit before approval, change destination, reject, retry.
- [ ] Do not provide a global “enhance everything” action.
- [ ] Map timeout, 429, unavailable service, and invalid response into non-blocking messages without echoing candidate text.
- [ ] Run tests and commit: `feat: add approval-based CV suggestions`.

---

### Task 7: Create one approved view model and two live previews

**Files:** Create `buildApprovedViewModel.js`, `CvPreview.jsx`, `TemplateSelector.jsx`, styling, and tests.

**Interface:** `buildApprovedViewModel(state): ApprovedCvViewModel`.

- [ ] Test exact section order, Career Summary derivation, reverse chronology, and identical text across Standard and Executive.
- [ ] Include only source content, staff content, and approved suggestions; exclude pending/rejected/excluded content.
- [ ] Career Summary contains only employer, title, and duration from approved work records.
- [ ] Render semantic React elements, never `dangerouslySetInnerHTML`.
- [ ] Standard uses balanced single-column spacing.
- [ ] Executive changes spacing and typographic emphasis only; explicit achievements may be emphasised only when source-supplied.
- [ ] Add keyboard-accessible template radio cards and mobile preview switching.
- [ ] Run tests and commit: `feat: add standard and executive CV previews`.

---

### Task 8: Generate and inspect editable Word documents

**Files:** Create Word styles, Standard/Executive document builders, generation, download helper, and document-package tests.

**Interfaces:**

```js
createCvDocx(viewModel, templateId): Promise<Blob>
downloadBlob(blob, filename)
```

- [ ] Write failing tests that unzip `.docx` with JSZip and inspect `word/document.xml` and `word/styles.xml`.
- [ ] Assert valid package, required headings in order, bullets, all approved text present, excluded text absent, no visible borders, and textual parity between templates.
- [ ] Define shared runs:

```js
export const WORD_FONT = 'Calibri';
export const WORD_SIZE = 22; // 11 pt in half-points
export const baseRun = { font: WORD_FONT, size: WORD_SIZE };
export const headingRun = { ...baseRun, bold: true, allCaps: true };
```

- [ ] Ensure every paragraph/table cell uses shared run helpers; do not rely only on default styles.
- [ ] Use borderless career summary formatting and `keepNext` where Word supports it.
- [ ] Validate the approved view model before generation.
- [ ] Filename: `Surname_Name_Talent_Tree_CV.docx`, sanitised for filesystems.
- [ ] Revoke download object URLs; do not clear the draft after download.
- [ ] Run document tests/build and commit: `feat: export factual Talent Tree Word CVs`.

---

### Task 9: Add E2E, accessibility, refresh, and no-persistence verification

**Files:** Create Playwright config and E2E tests; update scripts and README.

- [ ] Configure desktop Chromium and iPhone-sized projects.
- [ ] Intercept `/api/cv-suggestions` so frontend E2E is independent of Oracle.
- [ ] Test direct `/cv-builda`, upload, review, resolving unclassified content, adding supplied information, manual fallback, both templates, download, Start Over, and return to website.
- [ ] Refresh after editing and prove the upload screen returns with no candidate text.
- [ ] Assert Local Storage and Session Storage remain empty and no IndexedDB CV database is created.
- [ ] Run axe checks on upload, review, suggestion, and preview states; fail serious/critical issues.
- [ ] Test keyboard upload activation, field navigation, modal focus, and template selection.
- [ ] Run:

```bash
npm ci
npm run fixtures
npm run test
npm run build
npm run test:e2e
```

- [ ] Update README truthfully: original extraction is local; selected suggestion text is transmitted only when requested.
- [ ] Commit: `test: verify CV Builda workflow and privacy behavior`.

---

## Frontend Completion Gate

Automated verification must pass:

```bash
npm ci
npm run fixtures
npm run test
npm run build
npm run test:e2e
```

Manual checks before production claim:

1. Open both outputs in Microsoft Word desktop.
2. Confirm every run displays as Calibri 11.
3. Confirm no visible lines/borders.
4. Confirm page breaks and long responsibilities remain usable.
5. Compare source, editor, preview, Standard, and Executive for coverage.
6. Test a multi-column text PDF and record ordering warnings.

Do not mark the frontend production-ready until manual Word checks are recorded.
