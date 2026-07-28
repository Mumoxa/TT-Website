# Talent Tree CV Builda Design

**Status:** Planned

**Date:** 2026-07-28

**Repository:** `Mumoxa/TT-Website`

## 1. Purpose

Talent Tree CV Builda is an internal-purpose CV formatting tool added to the existing Talent Tree website. It allows Talent Tree staff to upload a candidate CV, review and correct the extracted information, add separately supplied information, approve cautious wording suggestions, and download a client-presentable Microsoft Word CV.

The product is a format changer rather than a content-amending processor. It must protect factual accuracy, preserve source content, and prevent silent information loss.

Although the first version is intended for internal Talent Tree use, it will not require a login, password, private link, or other access gate. This means “internal” describes the intended use, not an enforceable security boundary. The CV Builda link will be visible on the Talent Tree website.

## 2. Confirmed product decisions

- The builder is integrated into the existing React/Vite website rather than deployed as a separate application.
- The website remains available at `/`.
- The builder is available at `/cv-builda`.
- The main website navigation includes a `CV Builda` link.
- No authentication or login is included.
- Accepted input formats are `.docx` and text-based `.pdf`.
- Legacy `.doc` files are not accepted.
- Scanned or image-only PDFs are not processed in version one.
- The output format is editable `.docx` only.
- Staff review and edit extracted information before export.
- Staff can add information directly into structured fields.
- Staff can paste additional candidate or recruiter notes.
- Ollama suggests where pasted notes belong, but staff must approve, edit, redirect, or reject each suggestion.
- Responsibility bullets may receive minor wording changes to start with action verbs, provided the meaning and factual content remain unchanged.
- No candidate data or drafts are retained after the active browser session ends.
- Two Word layouts are provided: Standard Talent Tree and Executive Talent Tree.
- Both templates contain the same approved information. The executive layout must not shorten, summarise, remove, or invent content.
- CV extraction happens locally in the browser first.
- AI assistance uses self-hosted Ollama on the existing Oracle server.
- No external AI provider receives candidate CV content.
- AI suggestions are optional and the full workflow remains usable when Ollama is unavailable.

## 3. Existing project context

The target repository is a small React/Vite website with the main site currently rendered from `src/main.jsx` and styled in `src/styles.css`. It is deployed through Cloudflare Pages from the `main` branch using `npm run build` and the `dist` output directory.

The uploaded CV builder prototype provides a useful visual and workflow reference. It also contains functions that conflict with this product’s requirements, including browser persistence, candidate storage, analytics, brand management, automatic summary generation, inferred skills, automatic bullet strengthening, and simulated document workflows. Those functions are not carried into this implementation.

Useful elements to retain or adapt from the prototype are:

- Talent Tree navy-and-gold visual direction;
- a guided multi-step workflow;
- drag-and-drop upload;
- responsive layouts;
- clear loading, empty, error, warning, and success states;
- a live document preview;
- accessible, reusable controls.

## 4. Scope

### 4.1 Included

- Website navigation link to the builder.
- Dedicated `/cv-builda` page.
- Direct-route support on Cloudflare Pages.
- Local `.docx` text extraction.
- Local text-based `.pdf` extraction.
- Deterministic section recognition and source-fragment tracking.
- Structured CV review and editing.
- Direct addition of supplied information.
- Pasted-note classification suggestions through Ollama.
- Optional action-verb wording suggestions through Ollama.
- Date consistency checks.
- Duplicate-content flags.
- Source coverage validation.
- Standard and executive live previews.
- `.docx` generation and download.
- Session reset and automatic loss of state on refresh or close.
- Unit, integration, document-output, accessibility, and end-to-end tests.

### 4.2 Excluded from version one

- Authentication, accounts, roles, or permissions.
- Candidate database or saved drafts.
- Browser `localStorage`, IndexedDB, or persistent browser caching of CV content.
- Analytics containing candidate data.
- OCR for scanned PDFs.
- Legacy `.doc` extraction.
- PDF export.
- Emailing or sending CVs from the builder.
- Candidate tracking, submissions, or CRM features.
- Brand Studio or template-building tools.
- AI-written professional summaries created from assumptions.
- AI-inferred skills, achievements, qualifications, dates, employers, technologies, scope, metrics, or responsibilities.
- Automatic application of AI suggestions.
- One-page summarisation or content removal.

## 5. User flow

### Step 1: Upload CV

The staff member opens `/cv-builda` and uploads a `.docx` or text-based `.pdf` by drag-and-drop or file picker.

The interface shows:

- selected file name;
- file type;
- file size;
- extraction progress;
- success or actionable error message;
- replace-file control.

Validation rules:

- maximum file size: 10 MB;
- accepted extensions: `.docx`, `.pdf`;
- reject empty files;
- reject password-protected or corrupt files;
- reject `.doc` with guidance to resave as `.docx`;
- identify PDFs with no usable text and explain that OCR is not included.

### Step 2: Extract and organise

The browser extracts source text without sending the original file to the Oracle server.

The extractor creates ordered source fragments. Each fragment receives a stable ID and retains source metadata such as page, paragraph, table cell, or document order where available.

A deterministic parser proposes placement into the agreed CV structure. Low-confidence or unmatched fragments go into `Unclassified Information` rather than being discarded.

### Step 3: Review information

The staff member reviews a structured editor and a live preview.

The editor supports:

- changing extracted text;
- adding new entries;
- deleting entries with confirmation;
- reordering repeatable entries;
- correcting field placement;
- viewing original extracted text where a value was normalised;
- seeing warnings for uncertain dates, missing labels, duplicate content, and unclassified source fragments.

### Step 4: Add supplied information

Staff can add candidate or recruiter-supplied information in two ways:

1. directly into the relevant structured fields; and
2. by pasting notes into `Additional Candidate Information`.

Direct additions are marked as `Staff-added content`.

Pasted notes are divided into reviewable fragments and sent to the suggestion service only when the staff member requests placement suggestions.

### Step 5: Approve suggestions

Each suggestion is displayed separately from approved CV content.

For note placement, the interface shows:

- original note;
- suggested section and record;
- suggested wording, when applicable;
- brief reason;
- confidence indication;
- approve, edit, change destination, or reject controls.

For wording changes, the interface shows original and suggested text side by side.

No suggestion changes the CV until staff approval.

### Step 6: Select template

Staff chooses either:

- `Standard Talent Tree`; or
- `Executive Talent Tree`.

Both use exactly the same approved content and section coverage. The selection changes presentation only.

### Step 7: Final validation and preview

Before export, Builda checks:

- no unreviewed source fragment remains;
- no pasted-note fragment remains undecided;
- required fields and section entries are structurally valid;
- work experience is reverse chronological where dates allow sorting;
- unclear dates have been acknowledged or corrected;
- output contains every included source fragment and staff-approved addition;
- no pending suggestion is silently applied.

The staff member reviews the full document preview and can return to editing.

### Step 8: Download Word CV

Builda generates an editable `.docx` file in the browser and downloads it.

The download does not save the candidate to a server or browser database.

### Step 9: Clear session

`Start Over` asks for confirmation and then clears the file, extracted fragments, structured draft, notes, suggestions, and generated document object from memory.

Refreshing or closing the page also clears the working state.

## 6. CV information structure

The final document uses this section order:

1. candidate name and contact information at the top;
2. `Personal Information`;
3. `PROFESSIONAL SUMMARY`;
4. `Career Summary`;
5. `QUALIFICATIONS`;
6. `CERTIFICATIONS`;
7. `TECHNICAL SKILLS`;
8. `WORK EXPERIENCE`.

The list markers in the original formatting instruction describe structure and are not printed before section headings.

### 6.1 Personal Information

The editor provides clear fields for information found in or added to the CV, including:

- full name;
- telephone number;
- email address;
- location or address;
- LinkedIn or other candidate-supplied professional link;
- other personal information present in the source CV.

Builda must not infer missing personal details.

### 6.2 Professional Summary

- Preserve an existing summary.
- Do not generate a new summary when none exists.
- Staff may add a summary supplied by the candidate or recruiter.
- Optional wording suggestions must retain all facts and require approval.

### 6.3 Career Summary

Career Summary is generated from approved work-experience fields and contains only:

- employer;
- job title;
- duration.

It does not infer seniority, achievements, or responsibilities.

### 6.4 Qualifications

Each qualification supports:

- year completed, when supplied;
- qualification name;
- institution;
- additional verbatim detail from the source.

If only a year is supplied, retain the year. If no year is supplied, do not invent one.

### 6.5 Certifications

Certifications are retained as supplied and may include a supplied year, issuer, identifier, or status. Missing details are not inferred.

### 6.6 Technical Skills

Skills are retained from the source CV or added by staff. Builda does not infer skills from job titles or responsibilities.

### 6.7 Work Experience

Each record contains:

- `Employer:`;
- `Duration:`;
- `Title:`;
- `Reason for leaving`;
- `Responsibilities`.

Duration is displayed as `Month Year – Month Year` when months are present in the source or supplied by staff. If the source provides years only, keep years only. Current employment is standardised to `Present`.

Responsibilities use bullets. Minor wording changes may start bullets with action verbs, but may not add or change facts.

## 7. Provenance and no-information-loss model

Every content item has provenance:

- `source`: extracted from the uploaded CV;
- `staff`: directly entered or pasted by staff;
- `approved-suggestion`: accepted after the original and suggested wording were shown;
- `excluded`: deliberately removed by staff with an explicit review action.

Each extracted source fragment has one of these coverage states:

- assigned to an included CV field;
- retained in `Unclassified Information` awaiting review;
- intentionally excluded by staff.

Export remains blocked while any source fragment is unreviewed.

Editing extracted text does not remove the original fragment record during the active session. The review interface can show the original and current value.

## 8. Local extraction and parsing

### 8.1 DOCX

Use a browser-compatible DOCX extractor that preserves ordered paragraph and table content. Formatting is treated as a clue, not as factual content. All extracted text must enter the source-fragment ledger.

### 8.2 PDF

Use a browser-compatible PDF text extractor. Preserve page numbers and item order where available. Apply conservative line grouping and heading recognition.

PDF extraction can produce unreliable reading order. When ordering confidence is low, fragments must be flagged for review rather than rearranged silently.

### 8.3 Parser behaviour

The parser is deterministic and conservative. It may recognise headings and repeated patterns, but it must not generate missing facts.

Recognised and alternate heading labels may include equivalents of:

- profile, professional profile, executive summary, professional summary;
- career summary, employment summary;
- education, academic background, qualifications;
- certifications, professional certifications;
- technical skills, skills, technologies;
- employment history, professional experience, work experience;
- reason for leaving;
- responsibilities, duties, key functions, achievements.

Achievements are retained in the work record when explicitly present. They are not invented or promoted from ordinary responsibilities without staff action.

## 9. AI suggestion architecture

### 9.1 Public contract

The browser calls a same-origin endpoint:

`POST /api/cv-suggestions`

The request contains only the minimum text needed for the chosen suggestion task. The original uploaded file is never sent.

Supported task types are:

- `classify_notes`;
- `refine_bullet`;
- `review_dates`;
- `flag_duplicates`;
- `refine_existing_summary`.

### 9.2 Cloudflare relay

A Cloudflare Pages Function provides the same-origin endpoint and forwards validated requests to the Oracle CV suggestion API.

The relay:

- accepts JSON only;
- applies request-size limits;
- validates task type and schema;
- does not persist request or response bodies;
- does not include candidate content in logs;
- adds a server-side proxy credential that is never exposed to browser code;
- applies abuse and rate controls appropriate to an ungated public endpoint;
- returns structured errors without echoing sensitive content.

Candidate text therefore transits Cloudflare and the Oracle server transiently. It is not sent to an external AI model provider.

### 9.3 Oracle API

The Oracle service:

- accepts calls only from the trusted relay credential;
- validates payload size and structure;
- rate limits requests;
- sends the approved task prompt to local Ollama;
- requires structured JSON output;
- validates the model response before returning it;
- holds request and response content in memory only;
- avoids candidate content in access, application, exception, and model logs;
- applies timeouts and safe failure responses;
- exposes a health check that contains no candidate information.

### 9.4 Suggestion contract

Every suggestion response must include:

- task type;
- original text or a stable client-side fragment reference;
- proposed destination or wording;
- reason;
- confidence category;
- warnings when the model cannot decide safely.

The model instruction explicitly prohibits adding:

- facts;
- dates;
- qualifications;
- certifications;
- skills;
- employers;
- job titles;
- technologies;
- achievements;
- numbers;
- scope;
- outcomes;
- reasons for leaving.

Invalid, incomplete, or schema-breaking model output is rejected and shown as an unavailable suggestion rather than applied.

## 10. Date rules

- Display full dates as `Month Year – Month Year`.
- Standardise `Current`, `To date`, and equivalent current-role wording to `Present`.
- Preserve year-only dates as years only.
- Never invent a month or day.
- Sort work experience reverse chronologically using the available date precision.
- When dates cannot be compared safely, preserve source order and flag the records.
- Flag end dates before start dates.
- Flag unexplained overlapping dates as a review item without treating them as an error.
- Keep the original extracted date visible during correction.

## 11. Word template rules

### 11.1 Shared rules

Both templates must:

- produce `.docx` only;
- use Calibri 11 for all editable document text, including headings;
- use bold, case, indentation, and spacing for hierarchy;
- contain no horizontal lines, paragraph borders, table borders, or decorative dividers;
- place candidate name and contact information prominently at the top;
- use the agreed section order;
- include all approved content;
- use bullet points for responsibilities;
- avoid splitting an employer heading from its first responsibility where Word pagination controls allow;
- use consistent margins, paragraph spacing, bullet indentation, and heading spacing;
- remain editable in Microsoft Word;
- avoid shrinking or deleting content to force a page count.

The first version uses a neutral, client-presentable document treatment. No unverified logo, watermark, footer wording, or extra brand asset is added to the Word output unless an approved asset already exists in the repository or is supplied before implementation.

### 11.2 Standard Talent Tree

The Standard layout is a clear single-column CV for general professional candidates.

It prioritises:

- straightforward reading order;
- balanced spacing;
- detailed work history;
- visible qualifications, certifications, and technical skills;
- reliable editing in Word.

### 11.3 Executive Talent Tree

The Executive layout contains the same content but changes presentation emphasis.

It provides:

- more spacing around name and professional summary;
- more prominent Career Summary;
- stronger typographic emphasis on senior appointments;
- explicit achievements highlighted only when they appear in approved content;
- tighter spacing in long responsibility lists to keep lengthy CVs manageable.

It must not create an executive summary, remove detail, or convert the CV into a one-page document.

## 12. Interface design

The builder follows the Talent Tree navy-and-gold website direction while remaining focused and readable.

The main page includes:

- Talent Tree header and route back to the website;
- workflow progress indicator;
- upload panel;
- structured editor;
- live preview;
- validation and source-coverage panel;
- additional-information panel;
- suggestion review queue;
- template selector;
- final download action;
- Start Over action.

Desktop uses a split editor-and-preview workspace. Mobile and narrow screens use a single-column flow with a clear switch between editor and preview.

Accessibility requirements include:

- semantic headings and form labels;
- keyboard-accessible controls;
- visible focus states;
- accessible contrast;
- screen-reader status updates for extraction and generation;
- no colour-only warning or approval states;
- accessible confirmation dialogs;
- clear error recovery.

## 13. State and privacy

Working state exists in React memory only.

Do not use:

- `localStorage`;
- `sessionStorage`;
- IndexedDB;
- service-worker caches for candidate content;
- server-side candidate storage;
- analytics payloads containing CV content or candidate identifiers.

Object URLs, ArrayBuffers, parsed document objects, and generated blobs must be released when replaced or reset.

The application must not claim that processing “stays on your device,” because approved AI suggestion text is transmitted to the same-origin relay and Oracle-hosted Ollama. The accurate message is that the original file is extracted locally and only staff-requested suggestion text is transmitted transiently.

## 14. Failure handling

### File failures

Provide specific messages for:

- unsupported extension;
- file over 10 MB;
- corrupt file;
- password-protected file;
- empty document;
- scanned or image-only PDF;
- unreadable PDF ordering;
- extraction exception.

### Suggestion failures

Provide non-blocking messages for:

- Oracle service unavailable;
- Ollama unavailable;
- timeout;
- rate limit;
- invalid model response;
- unsupported request;
- network loss.

Manual editing and Word generation remain available.

### Export failures

Keep the reviewed draft in memory and provide retry guidance when Word generation fails. Do not clear the session automatically.

## 15. Security and abuse considerations

Because the builder and suggestion endpoint are ungated, they are publicly reachable even though intended for staff.

Required controls include:

- strict file type and size validation;
- no server-side file upload;
- parser dependency review;
- JSON schema validation;
- maximum text length per suggestion request;
- maximum batch size;
- timeouts;
- rate limiting;
- trusted relay credential between Cloudflare and Oracle;
- Oracle firewall or reverse-proxy restrictions where practical;
- no secrets in Vite browser variables;
- no candidate content in logs;
- safe error messages;
- dependency and supply-chain checks;
- output escaping in the live preview;
- prompt-injection-resistant system instructions that treat CV text as untrusted data rather than instructions.

Accepted residual risk: without authentication, any visitor can open the builder and may attempt to use the public suggestion endpoint. Rate and abuse controls reduce but do not remove this risk.

## 16. Testing and acceptance criteria

### 16.1 Extraction tests

- Extract paragraphs and tables from representative `.docx` files.
- Extract ordered text and page references from representative text PDFs.
- Reject `.doc`.
- Identify image-only PDFs.
- Reject corrupt and password-protected samples.
- Enforce 10 MB limit.

### 16.2 Parsing and data-integrity tests

- Recognise agreed sections and common heading variants.
- Preserve all extracted fragments in the coverage ledger.
- Place uncertain content in `Unclassified Information`.
- Never silently discard a source fragment.
- Preserve year-only dates.
- Never invent months.
- Sort comparable work records reverse chronologically.
- Preserve source order when dates are not safely comparable.
- Generate Career Summary only from approved work records.
- Do not infer skills or create summaries.

### 16.3 Editing tests

- Edit all structured sections.
- Add, remove, and reorder qualifications, certifications, skills, and work records.
- Add a reason for leaving.
- Add responsibilities.
- Paste additional information.
- Change a suggested destination.
- Approve, edit, and reject suggestions.
- Keep original and suggested wording distinct.
- Block export while source fragments or pasted notes remain unreviewed.

### 16.4 AI contract tests

- Reject unsupported tasks.
- Reject oversized requests.
- Reject malformed model JSON.
- Confirm suggestions cannot be applied without a staff action.
- Test prompt-injection text inside a CV as data.
- Confirm unavailable Ollama does not block manual workflow.
- Confirm request and exception logs do not include candidate text.

### 16.5 DOCX output tests

Inspect the generated Word package and confirm:

- output opens as a valid `.docx`;
- all document text styles resolve to Calibri 11;
- required headings appear in order;
- work records appear in approved order;
- responsibility paragraphs use bullets;
- no paragraph or table borders create separator lines;
- every included approved content item appears in the output;
- excluded content does not appear;
- Standard and Executive contain identical approved textual content;
- template differences are presentation-only.

### 16.6 Browser and end-to-end tests

- Directly open `/cv-builda` on the Cloudflare Pages preview deployment.
- Navigate from the website to CV Builda and back.
- Complete upload, review, add information, suggestion approval, template choice, preview, download, and reset.
- Test desktop and mobile layouts.
- Test keyboard-only use.
- Test loading, empty, warning, error, success, and retry states.
- Confirm refresh clears the active draft.
- Confirm the built application contains no use of `localStorage`, `sessionStorage`, or IndexedDB for CV data.

### 16.7 Definition of done

The feature is complete only when:

- both supported source formats work with representative files;
- source coverage prevents silent information loss;
- staff can review and add information;
- AI suggestions remain optional and approval-based;
- both Word templates download successfully;
- Word formatting rules are verified by package inspection and manual Word review;
- candidate content is not retained;
- the production build passes;
- automated tests pass;
- accessibility and manual visual checks are completed;
- deployment and Oracle integration steps are documented truthfully.

## 17. Deployment design

### Website

- Continue using the existing Cloudflare Pages project.
- Add direct-route fallback for `/cv-builda`.
- Add the Pages Function for `/api/cv-suggestions`.
- Store relay credentials in Cloudflare server-side secrets, never in frontend environment variables.

### Oracle server

- Deploy a small CV suggestion API behind HTTPS and the existing reverse-proxy approach.
- Connect the API to local Ollama.
- Configure request limits, timeouts, safe logging, and service health checks.
- Keep the Oracle endpoint inaccessible to arbitrary direct calls by validating the relay credential and applying network restrictions where supported.

Deployment documentation must distinguish planned, locally verified, preview verified, and production verified states.

## 18. Pre-mortem and risk register

### Risk: information silently disappears

**Control:** source-fragment ledger, unclassified queue, export blocking, output coverage tests.

### Risk: AI invents or inflates content

**Control:** narrow task schemas, explicit prohibited additions, original-versus-suggestion review, mandatory staff approval, invalid-response rejection, eval cases.

### Risk: PDF text order corrupts the CV

**Control:** page-aware extraction, conservative grouping, uncertainty flags, source view, manual correction.

### Risk: public endpoint is abused

**Control:** request limits, rate limiting, relay credential, Oracle validation, monitoring without sensitive payloads. Authentication remains the strongest future mitigation but is outside this version by explicit decision.

### Risk: privacy claim is misleading

**Control:** do not claim all processing stays on-device; clearly explain local file extraction and transient suggestion-text transmission.

### Risk: generated Word document differs from preview

**Control:** one shared document model, DOCX package assertions, fixture comparison, and manual Microsoft Word review.

### Risk: Calibri is substituted on a recipient computer

**Control:** set the document font to Calibri 11 throughout. Final rendering still depends on Microsoft Word and the fonts installed on the recipient device; this limitation must not be misrepresented.

### Risk: Ollama outage blocks staff

**Control:** AI is optional; manual placement, editing, validation, and export remain functional.

## 19. Future iterations excluded from this design

Possible future work may include:

- public candidate-facing builder;
- authentication and staff accounts;
- saved drafts;
- approved branded assets;
- OCR;
- PDF export;
- ATS or CRM integration;
- candidate consent records;
- document emailing;
- more templates;
- organisation-specific formatting rules.

Each requires a separate design and privacy review rather than being added implicitly to this version.
