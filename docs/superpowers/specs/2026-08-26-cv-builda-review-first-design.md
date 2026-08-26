# CV-Builda review-first extraction design

Date: 2026-08-26
Status: Design for review
Repository: `Mumoxa/TT-Website`

## 1. Problem

CV-Builda currently makes the consultant repair too much of the parser's work after uploading a CV. The visible failure is not simply that a few fields are missed. The workflow treats parser uncertainty, source formatting differences and house-format differences as blocking data errors.

A representative failure is a PDF whose visual section headings extract as spaced letters such as `E D U C A T I O N` and `W O R K E X P E R I E N C E`. The current heading detector recognises normal `EDUCATION` and `WORK EXPERIENCE`, but not the spaced variants. Date ranges inside the misclassified education block can then be picked up by the employment fallback scanner. The result is structurally wrong records such as `E D U C A T I O N` being treated as an employer, qualifications being treated as roles, and real employment content receiving dozens of repair warnings.

The second problem is workflow design. A CV stating `2013 – 2016` has supplied a valid fact with year-level precision. Requiring the consultant to enter months before the document can be built converts a formatting preference into unnecessary manual data entry. The source did not contain the months, so the system should preserve the stated precision rather than force the consultant to create or research additional facts unless the consultant specifically wants to enrich the record.

The desired job-to-be-done is therefore:

> Upload the candidate's CV once. CV-Builda should extract and structure everything the source supports, preserve the source facts faithfully, and ask the consultant to review only genuinely uncertain or missing information before downloading the Talent Tree profile.

The consultant should review a draft, not reconstruct the CV.

## 2. Design principles

### 2.1 Source first

The uploaded CV is the primary source of truth. Existing structured data, supplementary documents and explicit consultant edits may add to it, but parser defaults and formatting rules may not overwrite or fabricate source facts.

### 2.2 Structure may be inferred; facts may not

CV-Builda may infer that a heading is an education heading, that two lines belong to one employer block, or that a bullet belongs under responsibilities. These are structural interpretations of supplied content.

It may not infer an unstated start month, performance level, quantified impact, expertise level, reason for leaving, demographic status, licence status, transport status or other candidate fact.

### 2.3 Preserve precision

`2013 – 2016` remains `2013 – 2016`. `March 2022 – Present` remains month precise. A year-only source is not invalid merely because the house template can display months.

### 2.4 Section boundaries are hard constraints

Once a line is confidently inside Education, it must not become an employer. Once inside Skills, it must not become a responsibility. A recognised section heading can never itself become candidate data.

### 2.5 Review uncertainty, not completeness theatre

The system must distinguish:

- **Extracted** — supported directly by source material and structurally confident.
- **Review** — supported by source material but structurally ambiguous or low-confidence.
- **Missing** — useful or required information that is not present in the source.
- **Derived** — calculated only from stated facts using a deterministic, auditable rule.

These states must not all appear as red blocking errors.

### 2.6 No unsupported flattering language

Profile generation may condense, reorder or rewrite supplied facts. It may not introduce claims such as "proven track record", "high impact", "strong expertise", "measurable outcomes" or similar language unless the source contains evidence supporting that claim.

### 2.7 The final Talent Tree document remains stable

This project redesigns ingestion, normalization, review and validation. It does not redesign the established Talent Tree DOCX visual identity or remove agency/direct and blind-profile capabilities.

## 3. Approaches considered

### Approach A — Patch individual parser regexes

Add support for spaced headings, more employer hints, more qualification patterns and additional special cases.

**Advantages:** small immediate change; low implementation cost.

**Disadvantages:** continues the current architecture where each new CV layout becomes another exception; does not solve the consultant workflow; still conflates source precision with validation errors; difficult to reason about cross-section contamination.

**Decision:** insufficient as the primary solution. Some regex fixes will still be required inside the chosen architecture.

### Approach B — Replace the browser parser with a remote AI CV parser

Upload the CV to a server/model and return structured data.

**Advantages:** potentially higher tolerance for messy layouts and unusual CV language.

**Disadvantages:** candidate documents leave the browser; introduces infrastructure, privacy, security, cost, model-evaluation and hallucination concerns; does not remove the need for deterministic source preservation and review states.

**Decision:** not required for this redesign. The browser-first architecture remains. A future model-assisted interpretation layer could be added behind the same evidence contract if explicitly approved.

### Approach C — Evidence-preserving deterministic parser plus review-first UX

Add a normalization stage before segmentation, enforce section ownership, attach provenance/confidence metadata during parsing, loosen validation where the source is legitimately less precise, and make the primary editor a review queue rather than the entire form.

**Advantages:** directly solves the current failure mode; keeps CVs local; makes uncertainty auditable; reduces manual re-entry; creates a stable boundary for later parser improvements or optional AI assistance.

**Disadvantages:** broader change than a regex patch; requires parser, schema, validator and UI work plus stronger regression fixtures.

**Decision:** selected.

## 4. Target user flow

### Step 1 — Upload

The consultant drops a PDF, DOCX, RTF, supported legacy document or pasted CV text into CV-Builda.

The system extracts text locally as it does today.

### Step 2 — Normalize and classify

Before field parsing, Builda runs a deterministic document-normalization pass. It corrects extraction artefacts that affect structure without changing candidate facts.

Examples:

- `E D U C A T I O N` -> structural heading token `EDUCATION` while preserving the original display/source string in evidence metadata.
- `W O R K   E X P E R I E N C E` -> `WORK EXPERIENCE` for heading matching.
- decorative pipes, repeated separators and layout-only characters are removed from heading candidates;
- obvious contact masthead fragments are prevented from becoming responsibility bullets;
- PDF visual line wraps may be rejoined only where the join is layout-derived and wording is not changed.

### Step 3 — Parse into section-owned records

The normalized document is segmented before detailed parsing.

Each source line receives a section owner, for example:

- head/personal
- profile
- education
- certifications
- skills
- experience
- early career
- references/ignored according to current product policy

Employment extraction may consume only experience/early-career content, except for a deliberately bounded fallback when no experience heading exists. The fallback must exclude blocks already classified as education, skills, profile, personal or references.

### Step 4 — Build an evidence-aware record

The candidate record retains the current business fields, but ingestion also produces provenance metadata for populated and unresolved values.

Illustrative shape:

```js
{
  cv: { ...currentCandidateRecord },
  evidence: {
    "personal.fullName": {
      status: "extracted",
      source: "Bomikazi CV.PDF",
      lines: [1, 2],
      raw: "Bomikazi Mditshwa",
      confidence: "high"
    },
    "experience[0].duration": {
      status: "extracted",
      raw: "2019 – 2023",
      precision: "year",
      confidence: "high"
    }
  },
  reviewItems: [ ... ]
}
```

The exact internal shape may differ, but provenance must be available without polluting the exported Talent Tree profile JSON unless intentionally included in the saved working-data format.

### Step 5 — Show the review summary

After upload the consultant lands on a concise summary rather than a wall of fields.

Example:

> 92% extracted · 3 items to review · 2 optional missing details

The percentage is not an AI confidence score. It is a deterministic completion indicator based on populated source-supported profile fields. If a percentage risks misleading users during implementation, use counts only: `31 fields extracted · 3 to review · 2 optional missing`.

### Step 6 — Resolve the review queue

The primary interaction is a list of only the items requiring judgement.

Examples:

- **Education** — `2018 – 2019` detected as a qualification period. Keep years as supplied or edit.
- **Work history** — `Industrial Engineer` may be a title rather than an employer. Choose from the nearby source lines.
- **Responsibilities** — 32 source lines were grouped under one role. Review grouping.
- **Availability** — not stated in the CV. Optional to add.

Each item shows enough nearby source text to make the decision without opening the original separately where technically practical.

### Step 7 — Full edit remains available

A secondary `Edit full profile` action opens the current structured editor for consultants who want to change any extracted value.

Fields should carry small source-state indicators such as `From CV`, `Edited`, `Derived`, or `Not stated` rather than presenting all populated fields as equally manual.

### Step 8 — Build

Blocking validation should be limited to conditions that make the document structurally unsafe, contradictory, privacy-breaking or unusable.

Year-only date precision, missing optional fields and review suggestions must not block download.

## 5. Parsing architecture

### 5.1 Layer 1: extraction

`cv/extract.js` remains responsible for turning supported file bytes into ordered text/layout cues. It should not decide candidate semantics.

### 5.2 Layer 2: structural normalization

Introduce a pure normalization stage between extraction and parsing, ideally in a focused module rather than expanding `parse.js` indefinitely.

Responsibilities:

- heading de-spacing;
- heading punctuation/decorative cleanup;
- conservative PDF line reflow where needed;
- contact-line classification helpers;
- preservation of raw source text alongside normalized matching text;
- no candidate fact generation.

A helper for spaced heading text must be conservative. It should collapse character spacing when the tokens are overwhelmingly single letters forming a plausible heading, not rewrite ordinary phrases such as initials or deliberately spaced codes.

### 5.3 Layer 3: segmentation

`segment()` should operate on normalized heading candidates while retaining raw lines for evidence.

A line recognised as a section heading is consumed as structure and cannot later appear as employer, title, qualification or responsibility content.

### 5.4 Layer 4: section parsers

Education, skills, experience and personal parsers consume only their owned blocks.

The experience fallback is changed from "scan unsegmented head for every date range" to "scan only unowned candidate-history blocks when no explicit experience section exists".

The fallback must include negative guards for known education terminology, qualification patterns and recognised section headings.

### 5.5 Layer 5: reconciliation

Supplementary sources continue to merge, but merge behaviour must preserve provenance and must never replace a higher-confidence explicit source value with a lower-confidence guess.

When two sources disagree, create a review item instead of silently choosing unless there is an existing deterministic precedence rule that is explicitly documented.

## 6. Date policy

The data model must support at least these source precisions:

- month: `March 2021 – August 2024`
- year: `2021 – 2024`
- open-ended month: `March 2021 – Present`
- open-ended year: `2021 – Present`
- unknown/unstated

The parser records both the displayed source range and its precision.

The validator checks:

- shape is recognisable;
- end is not before start;
- chronology is sensible where comparable;
- no unsupported dates were fabricated.

It does **not** reject a valid year-level range merely because months are absent.

The composer should print the available precision. It must not manufacture `January` or `December` to make the document look more complete.

If Talent Tree later decides exact months are mandatory for a particular client workflow, that requirement should be an explicit enrichment rule in that workflow, not a universal parser validity rule.

## 7. Review states and validation severity

### Blocking error

Use only when the document cannot safely be sent or built, for example:

- missing candidate identity where the selected mode requires it;
- privacy/redaction leak;
- impossible or malformed data that would corrupt output;
- direct-mode contact contradiction;
- reversed dates where both endpoints are known;
- structurally invalid imported record that cannot be normalized safely.

### Review item

Needs consultant judgement but does not automatically block build unless the unresolved ambiguity would materially misrepresent the candidate.

Examples:

- employer/title ambiguity;
- unclear responsibility/achievement classification;
- conflicting values from two supplied documents;
- a large responsibility block that may cover multiple roles.

### Advisory warning

Useful quality suggestion, not a data defect.

Examples:

- year-only dates;
- long bullet;
- unusually many responsibilities;
- missing blind-profile descriptor when blind mode is not currently selected.

### Optional missing

A field that is not in the CV and is not required to produce a truthful Talent Tree profile.

Examples may include availability, driver's licence or own transport depending on the actual document/output rule.

The UI must say `Not stated in source`, not imply parser failure.

## 8. Profile synthesis policy

Automatic synthesis during initial parsing should stop if it creates wording beyond the evidence.

Preferred behaviour:

1. If the CV contains a usable profile, preserve it and optionally standardize formatting.
2. If no profile exists, Builda may create a **fact-only draft** from explicit structured facts, but every clause must be traceable to source fields.
3. If a safe four-bullet profile cannot be produced without generic claims, produce fewer bullets and flag `Profile needs review` rather than padding with unsupported language.
4. The `Auto-Synthesize Profile` action must follow the same evidence rule.

Safe examples:

- `Industrial Engineer with experience in production planning and process improvement.` when those functions are explicitly stated.
- `Experienced across Employer A and Employer B` when those employers/roles are stated and agency-mode redaction rules are applied at render time.

Unsafe examples without direct evidence:

- `Proven track record of excellence.`
- `Delivers measurable outcomes.`
- `Highly strategic leader.`
- `Expert in complex transformation.`

The parser/test suite must include negative assertions against unsupported claim classes.

## 9. UI design

### 9.1 Top summary

Show candidate name, target/current role where available, source files and extraction status.

Primary actions:

- Review items
- Edit full profile
- Add supplementary document
- Build profile

### 9.2 Review queue

Each card contains:

- category;
- concise question;
- extracted/current value;
- relevant source excerpt;
- suggested safe action(s);
- `Keep as supplied` where appropriate;
- `Edit`;
- `Not stated / leave blank` for optional missing values.

No card should require the consultant to retype a value that is already clearly present in the source.

### 9.3 Full editor

Retain current sections but collapse them by default after a successful parse.

Each field can show provenance:

- From CV
- From supplementary document
- Derived
- Edited
- Not stated

The current data-check sidebar becomes a quality/review panel rather than an intimidating duplicate error list.

### 9.4 Date fields

Do not render a red validation error beneath `2018 – 2019` solely because months are absent. Show `Source gives years only` as an advisory indicator.

### 9.5 Error language

Avoid messages such as `7 errors to fix` when most items are source limitations or parser review requests.

Use separate counts:

- `1 blocking issue`
- `3 review items`
- `4 advisories`

## 10. Data integrity and privacy

Candidate data is sensitive. This redesign keeps current browser-local extraction and composition.

Requirements:

- no new remote CV upload service;
- no browser-exposed API secret;
- candidate contact details may be read for source understanding but must continue to obey agency/direct output rules;
- ID numbers must never reach client-facing output;
- provenance metadata must not accidentally expose redacted values in a blind client document;
- source snippets shown in the consultant UI remain local and are not composed into client output;
- saved JSON behaviour must be explicit about whether evidence metadata is included.

## 11. Testing strategy

This work requires test-first regression coverage because the current automated suite can pass while real CV layouts still produce structurally wrong records.

### 11.1 Normalization tests

Fixtures/assertions for:

- `E D U C A T I O N` recognised as Education;
- `W O R K E X P E R I E N C E` recognised as Experience;
- ordinary text is not incorrectly de-spaced;
- contact masthead lines are not turned into responsibilities;
- decorative headings are recognised without altering source facts.

### 11.2 Section-isolation tests

- education date ranges never become employers;
- qualification names never become employer records solely because they sit beside years;
- skills cannot become experience bullets;
- recognised section headings never enter candidate data;
- fallback employment scanning excludes classified education/personal/skills blocks.

### 11.3 Date tests

- year-only range parses and validates without blocking error;
- month-level range remains month-level;
- reversed year and month ranges are rejected;
- no month is invented;
- composer emits source precision faithfully.

### 11.4 Factual-integrity tests

Create trap CVs that omit achievements, expertise and performance claims. Assert that parsed and composed output does not introduce unsupported language.

### 11.5 Review-state tests

- confident field -> extracted, no review item;
- ambiguous title/employer -> review item;
- absent optional field -> optional missing, not error;
- conflicting supplementary source -> review item;
- blocking privacy contradiction remains blocking.

### 11.6 End-to-end representative CV fixtures

Add anonymised or synthetic-layout fixtures that reproduce real layout classes without inventing real candidate facts:

- modern two-column PDF;
- Word table CV;
- spaced uppercase section-heading PDF;
- CV with year-only dates;
- CV without explicit Experience heading;
- CV with multiple titles under one employer;
- LinkedIn PDF plus primary CV merge.

The Bomikazi failure pattern must have a dedicated regression fixture/test based on the structure observed in the reported output. The test must prove that Education and Work Experience headings cannot become employers and that phone/location masthead content cannot become responsibilities.

## 12. Migration and compatibility

Existing saved JSON candidate records must continue to load.

If provenance is stored in saved working data, make it additive and optional. Old files without evidence metadata receive a neutral `legacy/imported` state rather than fabricated source evidence.

The current candidate business schema should remain as compatible as practical so compose/redact functionality does not need a wholesale rewrite.

Year-only dates require validator/composer compatibility changes because the current universal month-range rule is too strict.

## 13. Rollout sequence

### Phase 1 — Parser correctness

- normalization layer;
- spaced-heading recognition;
- section isolation;
- safe fallback changes;
- contact-fragment protection;
- regression fixtures.

No UX claims of improvement until representative fixtures pass.

### Phase 2 — Preserve source precision

- year/month date model;
- validator severity changes;
- composer support;
- chronology tests.

### Phase 3 — Evidence/review model

- provenance output from parse/merge;
- extracted/review/missing/derived states;
- conflict handling;
- saved-data compatibility.

### Phase 4 — Review-first UI

- extraction summary;
- review queue;
- provenance badges;
- full editor as secondary path;
- split blocking/review/advisory counts.

### Phase 5 — Safe profile generation

- remove unsupported automatic filler language;
- evidence-only synthesis;
- factual-integrity traps through parser and DOCX output.

The phases may ship in one PR only if verification remains reviewable. Prefer smaller PRs if the change becomes difficult to verify as a unit.

## 14. Acceptance criteria

The redesign is successful only when all of the following are true:

1. Uploading a CV with spaced section headings does not create section-heading employers or roles.
2. Education content cannot enter employment records merely because it contains a date range.
3. Candidate contact-header fragments cannot become responsibilities.
4. Values clearly present in the CV populate the form without requiring re-entry.
5. A valid year-only tenure is preserved and does not block profile generation.
6. Missing months are never invented.
7. Missing optional details are labelled `Not stated in source`, not parser errors.
8. Ambiguous extracted content is surfaced as a review item with source context.
9. Profile synthesis cannot introduce unsupported performance, expertise or impact claims.
10. Agency-mode candidate contact details remain excluded from client output.
11. Blind-profile redaction remains effective and does not leak through provenance/source snippets.
12. Existing saved candidate JSON remains loadable.
13. Current Talent Tree DOCX branding/layout remains materially unchanged except where date precision requires truthful rendering.
14. Automated tests include the reported spaced-heading failure pattern plus representative PDF/DOCX layouts.
15. Full test suite and production build pass before merge.
16. A real-browser manual check covers upload -> review -> edit -> build at desktop and mobile widths before release.
17. Generated DOCX files are manually inspected for at least a year-only CV, a month-precise CV and a multi-employer CV.

## 15. Out of scope

- moving CV parsing to a hosted AI service;
- changing Talent Tree's public website design;
- changing the core agency/direct presentation model;
- inventing missing candidate information from web research;
- redesigning the DOCX brand identity;
- adding a candidate database or ATS backend;
- automatically filling EE status, date of birth, driver's licence, own transport or availability when not explicitly supplied.

## 16. Expected outcome

For a normal CV, the consultant should spend time on judgement rather than transcription. The ideal upload ends with no blocking issues and only a small review queue.

A strong success measure is not "the parser filled every field". It is:

> Everything the CV clearly states was captured correctly, nothing unsupported was added, and the consultant was asked only about ambiguity or genuinely missing information.
