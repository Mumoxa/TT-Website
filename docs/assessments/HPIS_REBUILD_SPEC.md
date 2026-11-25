# Human Potential Intelligence System (HPIS): complete rebuild specification

**Purpose of this document.** It lets another agent rebuild the HPIS assessment exactly (same modules, items, keys, scoring, data model, API, candidate flow, admin analytics, fairness screen, tests and governance gates) for a different brand. Read every section before writing code. The appendices hold the verbatim reference source, with the brand replaced by placeholders. Where this narrative and the appendix source disagree, **the source wins**.

**Placeholders used throughout**

| Placeholder | Replace with |
|---|---|
| `{{BRAND}}` | Display name of the new brand, e.g. "Acme Talent" |
| `{{brand}}` | Lower-case slug for identifiers, file names, salts and cookies, e.g. `acmetalent` |
| `{{BRAND_DOMAIN}}` | Production domain, e.g. `acmetalent.co.za` |
| `{{OWNER}}/{{REPO}}` | Git repository of the new brand |

**Status of what you are rebuilding (read this first).** HPIS is an **implementation candidate for research only**. It is *not* a validated psychometric product. No module has validity, reliability, norm or fairness evidence. It must not be used for selection, ranking, employer visibility, proof badges, marketplace gates or eligibility. Every switch ships **off**. Copy this posture exactly; do not "upgrade" any claim while rebranding. Section 14 lists the gates that have to be passed before real candidates are invited.

---

## 1. Platform assumptions (port these first)

The original runs on:

- **Cloudflare Pages** (static `public/`) plus **Pages Functions** (`functions/api/[[path]].js` catch-all router) and a **D1** (SQLite) database bound as `env.DB`.
- **Vanilla JS ES modules**, no framework or build-time bundler for the portal. Node 22 for tests (`node:assert/strict`, in-memory D1 harness).
- An existing candidate platform that already has: users with roles (`candidate`, client roles, admin roles) and statuses (`suspended`, `rejected`, `deleted` and others), sessions, `candidate_profiles` (with `candidate_code`, encrypted `gender`, `ee_classification`, `age`), `audit_events`, `rate_limit_events`, a consent system (`candidateConsentGate(env,user,"assessment_start")`), `assessment_accommodations` (`request_type='extended_time'`, `status='approved'`), account export, account erasure, admin permanent delete, and a scheduled retention sweep.

If the target brand lacks any of these, build an equivalent with **the same contract** before building HPIS:

| Helper | Contract HPIS relies on |
|---|---|
| `now()` | `new Date().toISOString()` |
| `id(prefix)` | `` `${prefix}_${crypto.randomUUID()}` `` (HPIS uses prefix `hpi`; the counterbalancing variant is derived from the UUID's hex) |
| `json(data,status)` / `bad(error,status=400)` | JSON response; `bad` returns `{ok:false,error}` |
| `hasRole(user,["candidate"])` | Role check |
| `piiKey(env)` | `env.PII_ENCRYPTION_KEY \|\| null` |
| `encryptField(str,secret)` | AES-GCM 256, key from PBKDF2-SHA256 (100,000 iterations, salt `"{{brand}}-pii-v1"`), random 12-byte IV, output `"enc:" + base64(iv‖ciphertext)`; refuses to run without a secret |
| `decryptField(str,secret)` | Inverse. **Returns the input unchanged on failure**, so callers compare output to input to detect failure (HPIS does) |
| `audit(env,request,user,event,targetType,targetId,metadata)` | Inserts into `audit_events` (records IP and user agent). Never throws |
| `checkRateLimit(env,request,scope,identifier,limit,windowSeconds,{perIp})` | Counting limiter on `rate_limit_events`; returns `false` when over the limit or on error |
| `candidateConsentGate(env,user,feature)` | `null` when consents are satisfied, otherwise a 403 response |
| Admin `requireAdmin(env,request)` → `{ok,user,response}` and `adminError(env,error)` | Admin auth for `functions/api/admin/*.js` file routes |

Front end: the candidate portal is a hash-routed single-page app (`public/candidate/`) with helpers `html` (an escaping tagged template), `raw`, `plural`, `registerActions` (delegated `data-action` / `data-change` handlers), `runAction(btn,busyLabel,fn)`, `runtime` (`api.get/post`, `reload`, `rerender({focus})`, `current.model`, `guard.set/clear` for leave protection, `signedOut()`), `page({title,crumbs,intro})`, `statusTag(group,state,{label})`, `confirmDialog({title,body,confirmLabel,cancelLabel,startOn,onConfirm})`, `toast(msg,tone)`. The admin app (`public/admin/`) has `pageHeader`, `section`, `errorState` and `dataTable({caption,columns,rows,rowKey})`. Port or map these one to one.

---

## 2. Design principles (non-negotiable)

1. **Separate from occupational proof.** Its own table, API namespace (`/api/hpi/*`), and catalogue. It never reads or writes the occupational `assessment_attempts`, `proof_badges`, profile score or employer visibility. Tests assert that the counts in those tables are unchanged after HPIS use.
2. **Optional and candidate-private.** Results go only to the candidate. Admins see that a candidate took part (audit metadata), never answers or results, plus anonymised aggregates only.
3. **Fixed, versioned forms.** `VERSION = "hpi-2026-pilot-2"`. Never edit a published form in place. Any item change means a new version string, and old data is never silently rescored.
4. **Server-only keys.** `publicForm()` whitelists the fields sent to the browser. Keys, `before` constraints, `oldKey(s)`, feedback, factors and signs never leave the server, except practice-trial keys for the timed module (phase 0 only).
5. **Encryption at rest.** Answers and results are stored only as `enc:` AES-GCM blobs.
6. **No hidden telemetry.** No answer-level timing, mouse paths or keystrokes. The only timing captured is per-block active time in the opt-in timed module, and it is disclosed in the notice.
7. **Blanks allowed.** They are reported as "not answered", never as wrong. Attempted and total are shown separately.
8. **No composite, norms, IQ, percentile, type, cut-off or "potential" score.** Every result carries `status:"research_only"`, `selectionAllowed:false`, `precision:"not_established"`, `norms:"not_established"`.
9. **Data rights always work.** Export, erasure and fairness withdrawal work even when every feature switch is off and even when the migration has not run (a missing table is treated as "no data").
10. **Epistemic labels in docs.** Use **Confirmed / Inference / Hypothesis / Unknown** in all review documents.

---

## 3. Module register (16 IDs: 14 implemented, 2 gated)

| ID | Title | Kind | Items | Catalogue minutes | Construct (verbatim intent) | Notes |
|---|---|---|---|---|---|---|
| C01 | Numerical reasoning | task | 8 choice | 8 | Interpret quantities, rates and data; not arithmetic speed | **Core** |
| C02 | Verbal reasoning | task | 8 choice | 8 | Conclusions supported by written information; language-specific | True / False / Cannot determine style |
| C03 | Abstract and inductive reasoning | task | 8 text + 6 visual matrices = 14 | 7 | Unfamiliar symbolic relationships | Matrices generated and verified by `_hpi_visual.js` |
| C04 | Deductive reasoning | task | 6 choice + 2 order | 7 | Apply explicit rules, satisfy constraints | Order items scored by precedence constraints |
| C05 | Critical thinking | task | 5 choice | 8 | Evidence, assumptions, alternative explanations | Keys provisional |
| E01 | Perceptual accuracy | task | 10 record comparisons | 5 | Exact record discrepancies; no timing | **Core**. Fixed Match=o1 / Different=o2; key derived from data |
| E02 | Processing efficiency (timed) | timed | 6 practice + 40 + 40 | 4 | Accuracy under a time limit; speed withheld | Gate `ENABLE_HPI_PROCESSING` |
| E03 | Planning and organization | task | 4 choice + 1 order | 8 | Feasible plans under explicit requirements | |
| J01 | Practical problem-solving | task | 5 | 8 | Actions supported by supplied information | Finance/admin scenarios |
| J02 | Situational judgment | task | 5 | 8 | Contextually appropriate actions | Keys need SME review |
| J03 | Risk and ethical judgment | task | 5 | 6 | Recognize controls and escalation routes, **not honesty as a trait** | **Core**; rewritten in pilot-2 with plausible distractors |
| L01 | Learning and transfer experiment | staged | 3 stages × 4 binary | 10 | Examples → explanation → new context | Earlier stages lock; chance = 50% |
| L02 | Rule change | staged | 4 + 6 binary | 6 | Rule then changed rule; obsolete-rule responses counted | Counterbalanced variants A and B |
| P01 | Workplace personality (self-description) | inventory | 50 (IPIP-50) | 8 | Big-Five self-description; no better or worse | Gate `ENABLE_HPI_PERSONALITY` |
| S01 | Interpersonal judgment | task | 5 | 8 | Communication actions in work contexts | |
| M01 | Work preferences | preferences | 5 | 5 | Self-reported; no score | **Core** |

E02 and P01 were "reserved" in pilot-1 and are implemented behind gates in pilot-2. A gated module whose switch is off is listed with `status:"planned"`, its `gateReason`, `core:false`, and `stageCount:1`.

**Core set:** `CORE = ["C01","E01","J03","M01"]`, `CORE_ESTIMATE_MINUTES = 15` (a design hypothesis, to be replaced by the pilot median). The core set was chosen for relevance to junior finance and admin roles and for low burden.

Item content, keys and feedback are in **Appendix B** (`_hpi_catalog.js`), verbatim. Copy it unchanged apart from the brand. Localise only currency (`R` = South African rand) if the market requires it; doing so means a **new VERSION** and a re-run of the independent key test.

### 3.1 Item builders (catalogue DSL)

- `q(id,domain,prompt,labels[],keyIndex,feedback)` → choice item; option ids `o1..oN`; `key:"o"+(keyIndex+1)`.
- `order(id,domain,prompt,labels[],keyIndices[],feedback,beforePairs[])` → order item. `key` is one reference solution. `before:[[a,b],…]` means option a must come before option b. Any permutation that satisfies every pair is credited.
- `chk(id,original,captured)` → E01 item. Prompt `"Original: X | Captured: Y"`, options Match(o1) and Different(o2), key **computed** as `original===captured?"o1":"o2"`.
- `m(id,title,minutes,construct,items)` → `kind:"task"`, `status:"research"`.
- E02 trials come from a deterministic LCG (seed `20261124`, `seed=(seed*1103515245+12345)%2^31`). Each record has the format `INV|ORD|ACC|REF` + `-` + 6 digits + 1 letter from `ABCDEFGHJKLMNPRSTUVWXYZ`. Each trial is identical with probability 0.5, has one character altered (positions 4–10) with probability 0.25, or has an adjacent transposition (positions 4–8) with probability 0.25. 86 trials: `x1–x6` practice (phase 0), `y1–y40` block 1, `z1–z40` block 2. Prompt `original + "  |  " + captured` (two spaces either side; the runner splits on that exact string).
- L01 items `t1–t12` get `phase = floor(index/4)`.
- L02 is built in an IIFE: codes `[72,18,63,31,87,24,64,59,12,33]`; the first 4 are phase 0, the rest phase 1. Size rule: `n>50 → Batch A`. Parity rule: `even → Batch A`. Variant A runs size then parity; variant B runs parity then size. Each item carries `keys:{A,B}`, and phase-1 items carry `oldKeys:{A,B}`. `resolveModule(m,variant)` materialises `phases`, `key` and `oldKey` for the stored variant; an unknown or absent variant means the first variant.
- P01 items `b1–b50` use `domain:"factor_N"`, `factor`, `sign` (`+`/`-`) and five options Very Inaccurate…Very Accurate (`o1..o5`). There is no `key`.
- M01 items have no `key`.
- `MODULES` is frozen. Variant modules are stored resolved to their default variant (`variant:undefined`), and `getModule(id,variant)` re-resolves them.

### 3.2 Visual matrices (C03 m1–m6), `_hpi_visual.js`

- A cell is `{shape: circle|square|triangle, count: 1..3, fill: solid|outline|striped}`. Patterns are never carried by colour.
- Each attribute follows one rule family over the 3×3 grid: `all` (0), `row` (r), `col` (c), `latin1` ((r+c)%3) or `latin2` ((r+2c)%3), with a value per class.
- `verifyMatrix` evaluates **every** family consistent with the 8 visible cells. It rejects the item if any consistent family leaves the missing cell undetermined, if families disagree, or if the authored answer does not follow. This guarantees a unique answer.
- `balancedOptions(answer,seed)`: answer plus 3 distractors. Each distractor differs from the answer in exactly 2 attributes, and each of the answer's attribute values appears in exactly 2 of the 4 options, so "pick the most common features" fails. The options are rotated by `seed%4`. `matrixItem` also asserts that no distractor fits the grid.
- The screen-reader `description` lists all 8 cells in words, e.g. "Row 1, column 1: two outlined squares", and then "Row 3, column 3: missing."
- Front-end SVG (`cellSvg`): viewBox 90×90; a faint frame; fixed non-touching layouts for counts 1, 2 and 3; radius 18, 13 or 11; striped fill = a 45° rotated 6×6 pattern; colour follows `currentColor`. The missing cell shows "?".

---

## 4. Scoring engine (`_hpi_engine.js`, `ENGINE = "hpi-raw-v2"`)

- `orderViolations(item,answer)` counts the unmet `before` pairs. Without `before` it falls back to exact match. Correct means 0 violations.
- `catalogue(gates)` strips `items`, `phases`, `variantPhases`, `factors`, `instructions`, `gate` and `gateReason`. It adds `core`, `itemCount` and `stageCount`.
- `publicForm(id,phase,variant)` returns null for non-research modules or invalid phases. It returns `{id,title,construct,version,kind,phase,stages,stage,instructions,blockMs?,items:[{id,domain,kind,prompt,options,visual?,practiceKey? (timed phase 0 only)}]}` and includes only the items of the current phase.
- `normalizeAnswers(id,input,phase,variant)` rejects unknown item ids. Each answer must be null, a valid option id (choice), or a full permutation of option ids (order). Missing answers become null.
- `normalizeTiming(t)`: `activeMs` from 0 to 3,600,000, integer `interruptions` from 0 to 1000, `modality ∈ pointer|touch|keyboard|mixed|unknown`, `viewport ∈ small|medium|large` (other values become `unknown`).
- `score(id,answers,variant,timing)` always returns the base `{moduleId,variant?,version,engine,status:"research_only",selectionAllowed:false,attempted,total,precision,norms,interpretation}`, then by kind:
  - **inventory**: a per-factor `mean` of the answered items (reverse-keyed items scored `6-v`, rounded to 2 dp), plus `sum` only when every item of the factor is answered, with `answered` and `total`.
  - **preferences**: a list of `{domain,choice label}`.
  - **timed**: `practice` tally, plus `blocks[1,2]` with `{reached,correct,incorrect,available,accuracy (3 dp),timing}` and `researchOnly:{status:"withheld",correctPerMinute}`. The rate is computed only when timing is valid, not unlimited, and ≥10 s; it is never shown.
  - **staged**: `chanceLevel:0.5`, `stages` (per-domain counts). For L02 it adds `ruleChange:{conflictTrials, obsoleteRuleResponses, afterChangeSequence}` (1/0/null per post-change trial).
  - **task**: `credited`, `observations` per domain `{domain,total,attempted,credited}`, and `practice` (domains with a wrong answer, presented as "topics, not proven weaknesses"). E01 adds `checking:{hits,misses,falseAlarms,correctRejections,omitted}` (signal detection, with "Different" as the signal). Modules with order items add `constraintViolations`.
- `assertCatalogue()` runs as a test. It checks for duplicate modules, items, option ids and labels; that choice keys exist; that order keys are full permutations with non-empty `before` that the reference satisfies and ≤7 options (exhaustively verifiable); that inventory items have no key, a valid sign and factor, and 5 options; that preferences have no key; and that each E01 key agrees with its data.

---

## 5. Data model (D1 migrations; renumber to fit the target repository)

Verbatim in **Appendix A**.

1. `hpi_research_attempts`: id, candidate_user_id (FK users, ON DELETE CASCADE), module_id, form_version, notice_version, `status ∈ {draft,submitted}`, `revision ≥ 0`, `phase_index ≥ 0`, answers_encrypted, result_encrypted, created_at, updated_at, expires_at. It is `UNIQUE(candidate_user_id,module_id,form_version)`, with CHECK draft⇒no result and submitted⇒both answers and result. Index on `expires_at`.
2. `hpi_research_invites` (candidate_user_id PK, invited_by, invited_at).
3. `ALTER TABLE hpi_research_attempts ADD COLUMN form_variant TEXT` (NULL = first variant).
4. `hpi_fairness_consents` (candidate_user_id PK, notice_version, granted_at).

Retention: **90 days from creation** (`expires_at`). Expired rows are invisible to reads and deleted by the retention sweep (`sweepHpi`, reported as `hpi_research_deleted`).

---

## 6. Configuration switches (`wrangler.toml` `[vars]`, all `"false"`)

| Switch | Effect |
|---|---|
| `ENABLE_HPI_RESEARCH` | Master switch. When off, only export, erase and fairness withdrawal work |
| `HPI_OPEN_ENROLMENT` | Offer to every candidate. Requires the legal, privacy and professional sign-off |
| `HPI_RESEARCH_COHORT` | Optional comma-separated user ids (legacy; prefer admin invitations) |
| `ENABLE_HPI_PERSONALITY` | Opens P01 |
| `ENABLE_HPI_PROCESSING` | Opens E02 |
| `ENABLE_HPI_FAIRNESS_RESEARCH` | Opens the fairness opt-in and the DIF screen |

`PII_ENCRYPTION_KEY` (a secret) is required. Without it, `/hpi/status` returns `available:false` and other routes return 503.

**Eligibility** = `ENABLE_HPI_RESEARCH==="true"` AND (open enrolment OR the user is in the cohort list OR a row exists in `hpi_research_invites`).

---

## 7. Candidate API (`functions/api/_handlers/hpi.js`, mounted in the router after authentication)

All routes are candidate-only (403 otherwise). Evaluation order matters; reproduce it exactly:

1. `GET /hpi/export` → `{attempts (with decrypted answers and results; unreadable payloads → payload_unavailable:"encrypted_content_unreadable"), fairness_consent}`.
2. `POST /hpi/fairness {grant:false}` → withdraw (deletes the row; audit `hpi.fairness.withdrawn`).
3. `POST /hpi/erase {confirm:"DELETE HPI"}` → deletes attempts and the fairness consent (the invitation is kept); audit `hpi.research.erased`.
4. `GET /hpi/status` → never errors. `{available:false}` unless the candidate is eligible, the key is present and the consent gate passes. Otherwise `{available:true,core:{total,submitted (distinct core modules submitted in any unexpired version),estimate_minutes}}`.
5. Then: not eligible → 404 "The optional research pilot is not available."; no key → 503; consent gate (`assessment_start`) → 403; rate limit `hpi` 180 requests/hour per user (not per IP) → 429.
6. `GET /hpi/fairness` → `{available,granted (current notice only),notice_version,notice}`. `POST {grant:true,notice_version}` requires the switch and the current notice; it upserts the row and audits `hpi.fairness.granted`.
7. `GET /hpi/catalogue` → `{version,notice_version,notice,core_estimate_minutes,modules}`.
8. `GET /hpi/attempts` → unexpired rows with decrypted results and no answers.
9. `POST /hpi/start {module_id,notice_version (must equal NOTICE),consent:true}`. The gate must be open. It deletes an expired row for the same module and version, then inserts a draft (`INSERT … SELECT … WHERE user active … ON CONFLICT DO NOTHING`), so a resume returns the same row. **Variant** = `parseInt(last 2 hex chars of the id,16) % variants.length`. Audit `hpi.research.started` (only when a row was inserted). Returns `{form (current phase), attempt (answers re-keyed to the current phase items), untimed? (timed modules: true when an approved extended_time accommodation exists, read only, never consumed)}`.
10. `POST /hpi/save | /hpi/advance | /hpi/submit {attempt_id,revision,answers,timing?}`:
    - The row must belong to the user, be unexpired, be a `draft`, match `revision` and match the current `VERSION`; otherwise 409.
    - The gate must still be open (409 "Your saved answers are kept").
    - `advance` is allowed only before the last phase and `submit` only on the last phase (409 "Complete the stages in order.").
    - Timed blocks (phase ≥1 of a timed module) reject plain `save`, and require `timing`. The server sets `unlimited` (accommodation) and `valid = activeMs ≤ wall+2000 && (unlimited || activeMs ≤ blockMs+1500)`, where wall = now − `updated_at` (block issue time).
    - Non-timed advance and submit require ≥1 non-null answer in the phase.
    - It merges the previous answers with this phase's answers and stores `_timing` in the answers for timed modules. Submit scores the attempt. Everything is encrypted. A compare-and-set `UPDATE … WHERE status='draft' AND revision=? AND expires_at>? AND user active` increments `revision`; 0 changes → 409.
    - Audit `hpi.research.saved` / `.stage_advanced` / `.submitted` with metadata `{module_id,form_version,phase_index}` only.
    - Returns `{revision,result,form?,phase_index?}`.

**Account integrations:** account export adds `hpi_research: await exportHpi(...)`. Account erasure calls `eraseHpi` and `eraseHpiInvite`. Admin permanent delete lists `hpi_research_attempts`, `hpi_research_invites` and `hpi_fairness_consents` **explicitly** (not only through the FK cascade). The retention sweep calls `sweepHpi`. Seed-teardown scripts must delete HPIS rows for synthetic users.

**Notices (verbatim in Appendix B and E, with the brand substituted):** `NOTICE="hpi-research-notice-2"`, `STATS_NOTICES=["hpi-research-notice-2"]`, `FAIRNESS_NOTICE="hpi-fairness-notice-1"`. Only attempts made under a notice in `STATS_NOTICES` enter the statistics.

---

## 8. Candidate experience (portal)

**Routes:** `#/human-potential` (overview) and `#/human-potential/:id` (runner). The legacy standalone page `/candidate/human-potential/index.html` is a `noindex` meta-refresh redirect to the portal route.

**Home page:**
- Load `/api/hpi/status` alongside the other home data (`Promise.allSettled`). Show nothing if it is unavailable.
- "Where you stand": the go-live score **unchanged**, then "Human Potential (optional): n of 4" with a progress bar, then "Full Human Potential profile" = `round(profile×0.65 + coreDone/coreTotal×100×0.35)`. Caption: "Your profile score counts 65% and the optional exercises 35%. Only your profile score decides when you go live." It counts **completion only**, never results.
- An "Human Potential (optional)" card **below** the go-live tasks and never in "Your next step". Copy: "About 15 minutes of short exercises on numbers, checking records, workplace controls and your work preferences. n of 4 done." plus the privacy line, and a Start / Continue / See your exercises button.
- Status tags for `hpi`: done "Completed" (good), progress "In progress" (info), todo "Not started" (**neutral**, never the warning tone), soon "In development" (neutral), unreadable "Cannot be read" (warn).

**Overview (`human-potential.js`):**
- Page intro: "Short exercises about how you work with information, solve problems and make decisions. Optional, untimed unless marked, and private to you…"
- Consent card, shown until consent is given **once**. It has four plain bullets (optional and private; does not change score, badges or visibility; kept up to 90 days, download or delete any time; staff see that you took part, never your answers), a "Read the full notice" disclosure, and a required checkbox "I choose to take part in these optional exercises." with an inline error. Consent is remembered in memory for the page session. A candidate who has any attempt under the current notice counts as consented. Module links are disabled until consent is given.
- "Start here · about 15 minutes" card: core n of 4 with a `<progress>` and the four core modules as a task list (title link, hint, status tag). Hints: "N questions · about M minutes", "Your answers are saved", "Private result", "You completed an earlier version. A new version is available.", or the gate reason.
- "More exercises" card inside a `<details>` that opens automatically if any non-core attempt exists.
- Fairness card (only when the switch is on or consent was granted): notice text, status, and an agree or withdraw button.
- Data card: "Download my answers" (JSON file `{{brand}}-human-potential.json`) and "Delete my Human Potential data" (a confirm dialog that starts on Cancel; posts `{confirm:"DELETE HPI"}`).

**Runner (`human-potential-run.js`):** the same flow as the occupational proof runner.
- Load: catalogue + attempts. If consent is missing, show a "Read the notice first" page. Otherwise `POST /start`. Stage = `result` if submitted, `timed` if E02, else `questions` if any answer exists or phase > 0 (jump to the first blank), else `intro`.
- **Intro:** the stage line "Stage k of n: title" with its instruction, the P01 instruction, and bullets: count, one to a screen (five for the inventory); no time limit; answers save when you move; blanks allowed; "Once you finish a stage you cannot go back to it."; for the inventory, "no right or wrong answers".
- **Questions:** a sticky run bar with save status ("Saving…", "All answers saved", "Changes not saved yet", plus an alert when a save fails: "your answers are still on this page") and "Save and leave". A numbered question index with done and current states and screen-reader names. One item per screen (P01: five per screen, under the heading "How accurately does each statement describe you?"). Radio choices carry letters A–D (none for the inventory). "Clear this answer". Order items use Up/Down buttons per row, and focus follows the moved row; "Use this order" accepts the default order. Visual items render a `role="img"` grid with the full description and SVG options with visually hidden labels. Previous / Next / Review.
- **Autosave** runs on every navigation (`/save` only when dirty), with revision tracking; a 401 means signed out. The leave guard is active while there are unsaved answers.
- **Review:** "n of N answered"; the blanks are listed as links (up to 12); Finish is disabled until ≥1 answer. A non-final stage asks to confirm "Finish this stage? You cannot go back." and calls `/advance`, then shows the next stage intro. The final stage calls `/submit` and shows the result.
- **Result ("Your private feedback"):**
  - Inventory: factor means to 1 dp, "Neither end is better".
  - Preferences: a list, "nothing here is scored".
  - Timed: block correct of reached and % accuracy; "timing could not be confirmed" when invalid.
  - Task and staged: "Matched the provisional key: x of N", per-area lines using friendly labels (Appendix H `LABELS`), the E01 signal-detection line, the L02 obsolete-rule sentence, the chance caveat, and "Areas you could practise… topics, not proven weaknesses".
  - Always shown: the interpretation or research disclaimer.
- **Timed E02:**
  - Practice: untimed, immediate "Correct." / "Not quite" feedback.
  - Blocks: a Start button, then one comparison at a time in a monospace `dl` (Original / Captured) with buttons "Match (M)" and "Different (D)" and keyboard M/D.
  - Active time comes from `performance.now()` and pauses on `visibilitychange` (each pause counts as an interruption). The modality is recorded from pointer and keyboard events (`mixed` if both). Viewport class: <600 small, <1024 medium, else large.
  - A countdown runs every 250 ms. The block ends at `blockMs` (60,000) or when the trials run out. An accommodation makes the block untimed and shows a "Finish block" button.
  - Leaving mid-block asks for confirmation (the block's answers are not saved). The block answers and timing are posted once, at the end. On failure it shows a retry button and keeps the answers.

**CSS:** see Appendix H. Key rules: the 3×72 px grid, the 2-column visual choices, the order rows, the trial card with monospace 1.25 rem and 0.06 em letter-spacing. **Dialog overlay z-index must sit above the analytics/cookie banner** (the original used 10000 against a banner at 9999). A mobile test found every bottom-sheet dialog hidden behind the banner; add a regression test that compares the two values.

**Accessibility requirements (tested in the original with Playwright at 390 px):** no horizontal overflow; focus moves to the heading on every screen change; keyboard reordering keeps focus; `aria-current="step"`; `role="alert"` for errors; nothing carried by colour alone.

---

## 9. Admin: "HPIS research" (`/api/admin/hpi-research`, admin nav → Oversight)

**GET (audited as `admin.hpi.research_stats_viewed` with the submission count):**
- Reads submitted rows of the current VERSION under `STATS_NOTICES`, unexpired, `LIMIT 5000` (it reports `truncated`), and decrypts them (counting `unreadable`).
- Per module (`moduleStats`): submissions, and the median start-to-submit minutes (calendar time). It is **suppressed below `MIN_CELL = 10`**. Per item: answered, omitted and the option label counts. For scored kinds it adds `facility` (proportion correct out of all n, using each submission's own variant keys) and the corrected **item-rest Pearson r** (the item against the total minus that item, 3 dp; null when n<3 or variance is 0).
- L02 obsolete-rule distribution (count of candidates per number of obsolete responses), only at ≥10.
- The invite list (candidate code and date). Flags. A caveat string.
- Never returns ids, names or individual answers.

**UI flags (prompts, not rules):** facility ≥0.90 "Very easy", ≤0.20 "Very hard", item-rest r <0.15 "Low discrimination".

**POST `{action:"invite"|"revoke",candidate_code}`:** the code is upper-cased and truncated to 40 characters. It must belong to an active candidate. Inserts are idempotent. Audit `admin.hpi.pilot_invited` / `pilot_revoked`. Revoking leaves the existing research data unchanged.

---

## 10. Fairness research (`_hpi_fairness.js`)

- A separate purpose and a separate opt-in. Demographics (profile gender, employment-equity group, age band: under 25 / 25 to 34 / 35 and over) are read **only at analysis time**, only for consenting candidates, and are **never copied** into HPIS rows or used in scoring. A test fails if the catalogue, engine or visual generator mentions demographic fields.
- **Mantel-Haenszel DIF.** Records are `{scores:{item:0|1},group}`. Groups with fewer than `MIN_GROUP = 30` are dropped. If fewer than 2 groups remain, the result is `suppressed`. The reference group is the largest group, and every other group is compared with it.
- Candidates are stratified by **rest score** (matching items minus the studied item), in up to `MAX_STRATA = 5` quantile bands.
- `alpha_MH = Σ(A·D/N) / Σ(B·C/N)` and `MH D-DIF = −2.35·ln(alpha)`, to 2 dp.
- Complete separation is reported as `extreme: favours_reference|favours_focal`.
- The flag is `|D| ≥ 1.5` (the ETS "large" magnitude band) or any extreme result.
- **Two-stage purification:** flagged items are removed from the matching score, and every item is then re-screened (the studied item is always included in its own match).
- A module enters the screen only when it has ≥ 2×30 consenting submissions. Only `task` and `staged` modules are screened.
- It is a magnitude screen only, with no significance test and no multiplicity correction. A flag prompts expert review and is not proof of bias.

---

## 11. Tests (`npm run test:hpi`, also part of `npm test`)

| File | What it proves |
|---|---|
| `hpi-research.test.js` | Catalogue integrity (`assertCatalogue`), public form whitelisting per phase (later L01 instructions withheld until advance), answer normalisation, scoring shapes per kind |
| `hpi-api.test.js` (in-memory D1) | Unauthenticated, other candidate (404), employer and admin (403); absent consent, cohort, key or flag; wrong revision (409); duplicate submit; expiry; staged lock and advance order; timed timing validation and accommodation (never consumed); export, erase and account export; audit events carry no answers; proof, badge and profile tables unchanged; encrypted storage |
| `hpi-independent-key.test.js` | **Non-circular key audit.** Each of the 86 keyed items is either recomputed from item content (arithmetic, string compare, parity, exhaustive constraint search, the matrix solver) or matched **by label** against a second reviewer's hand-solved key; `validOrders` checks that each order item has exactly one valid order, plus a synthetic 3-solution item. (The original review also ran a one-off mutation check, corrupting n3's key, which the test caught. That check is not committed as a test; add one.) |
| `hpi-home-card.test.js` | Home card placement and copy, the 65/35 full-profile formula, and that the go-live score is unchanged |
| `hpi-research-stats.test.js` | Facility and item-rest maths, MIN_CELL suppression, variant-aware keys, notice filtering, no ids in the output, admin-only access, invite and revoke audit |
| `hpi-fairness.test.js` | MH computation on synthetic data, suppression below 30, purification, extremes, consent grant and withdraw, and that no demographic field is referenced in scoring modules |
| `candidate-dialog-above-banner.test.js` | Dialog overlay z-index > cookie banner z-index |

Also update any account-export key snapshot test and the seed-teardown contract.

---

## 12. Build order (how the original was built; follow it)

1. **Phase 0, independent review** of any inherited draft. Solve every key by hand, re-derive the computable keys in code, check `npm test`, check security (ownership, key leakage, audit, export resilience, purge list, IP-logging truth in docs) and write `PHASE0_REVIEW.md` with Confirmed / Inference / Hypothesis / Unknown labels.
2. **Pilot-2 fixes found in that review:**
   - Replace C03 a5, which was solvable by surface cue (it was the only 3-letter option).
   - Give E01 a fixed Match/Different mapping (alternating the button order confounded the construct) and derive its keys from the data.
   - Score order items by precedence constraints.
   - Rewrite J03 with plausible distractors.
   - Make audit metadata-only.
   - Make account export resilient to an unreadable key.
   - List HPIS tables explicitly in admin purge.
3. **Product decision D1** (prominent, optional, candidate-private, core-first). Explicitly reject "compulsory" until the legal and validity gates pass.
4. **D2:** admin-managed invitations (migration).
5. **Gap bridging:**
   - L02 counterbalancing (the `form_variant` migration).
   - C03 visual matrix generator and verifier.
   - P01 IPIP-50 verbatim, with a provenance JSON.
   - E02 timed protocol (speed withheld).
   - Fairness opt-in and DIF (migration).
6. **D5:** move HPIS into the portal shell (routes, runner mirroring the proof runner, Home bars). Not part of the go-live score.
7. Pilot statistics endpoint and admin view; `PILOT_PROTOCOL.md`.
8. Verification on every change: `npm run test:hpi`, `npm test`, `npm run build`, `npm run test:behaviour` (local wrangler and local D1 only, with a throwaway key), and a mobile browser run (390 px) of the full journey. **Never** test against a production D1 binding. The original work stopped at "pushed to a branch, nothing deployed".

---

## 13. Documentation to recreate (rebranded)

- `docs/HPI_IMPLEMENTATION.md`: status, scope, measurement register (construct, observation, what must be established), API contract, setup and verification, scientific validation programme, open work and stop conditions.
- `docs/hpis/DECISIONS.md`: D1–D5 as above.
- `docs/hpis/PHASE0_REVIEW.md`: your own review of your build (do not copy the original's findings as if they were yours; re-run them).
- `docs/hpis/PILOT_PROTOCOL.md`: purpose (burden, completion, item quality, key review, comprehension), scope, the cohort-size precision table (facility ±0.18/0.14/0.10/0.07 and item-rest r ±0.33/0.26/0.18/0.13 at n = 30/50/100/200; recommend ≥100 per core module), review signals, stop conditions, the go/no-go checklist, fairness expectations.
- `docs/hpis/provenance/ipip-50-big-five-markers.json` (Appendix G).

---

## 14. Governance gates (jurisdiction: South Africa in the original; re-check for the new brand's market)

Before any real candidate is invited:
- A legal and privacy review of the research notice and the lawful basis (POPIA; for fairness, special personal information and purpose limitation).
- A registered industrial psychologist's view on Employment Equity Act s8 and HPCSA classification, even for optional, candidate-private exercises on a recruitment platform. (Inference from the Act as amended in 2013: psychological tests of applicants are prohibited unless shown to be valid and reliable, fair, unbiased and certified. Verify with counsel.)
- SME review of the provisional judgment keys (C05, J01–J03, S01; at minimum J03).
- A screen-reader pass (NVDA or VoiceOver) of one full core exercise.
- A named support contact; production authorisation for the migrations and `ENABLE_HPI_RESEARCH=true` with `HPI_OPEN_ENROLMENT=false`.

**Stop conditions:** a privacy or security incident; a complaint suggesting HPIS affects hiring or is compulsory; systematic accessibility failures; an offensive or culturally loaded item.

**Known open issues to carry over honestly:**
- Many C05, J01, J02 and S01 distractors are implausible (ceiling risk).
- L01 "transfer" restates the rule, so it measures re-application, not transfer.
- L02 items restate the rule.
- No key-rotation re-encryption path.
- No separate research-consent record (withdrawal = erase).
- Concurrency races not exercised against real D1.
- Backup retention of deleted rows unknown.
- The equivalence of the screen-reader description to the visual matrices is not established.
- Striped fills on small triangles need a legibility check on low-end phones.

---

## 15. Rebrand checklist

1. Replace every placeholder. In particular, the encryption salt `"{{brand}}-pii-v1"` must match the target platform's existing salt if it already encrypts PII; never change the salt on live data.
2. Keep every identifier that is not a brand identifier (`hpi_*` tables, `/api/hpi/*`, module ids, item ids, notice ids) so the tests port unchanged. If you rename notices, bump them (`…-notice-1` for a new brand is fine, but keep `STATS_NOTICES` consistent).
3. In the notice texts, replace "{{BRAND}} staff" and "{{BRAND}}'s audit log", and keep the content of every claim.
4. Currency and localisation changes mean a new `VERSION` and a re-run of the independent key test.
5. The export file name is `{{brand}}-human-potential.json`. The legacy page title is "Human Potential | {{BRAND}}".
6. In the appendix tests, candidate codes use the prefix `CAND-`. Change it to the target platform's candidate-code prefix.
7. Run the full verification in §12. Do not deploy. Hand over with the §14 checklist unchecked.

---

# Appendices: reference source (verbatim, brand replaced)

Apply these files at the paths shown. Shared platform helpers are not included; see §1 for their contracts.

## Appendix A1: `migrations/0095_hpi_research.sql`

```sql
-- Separate from assessment_attempts, proof_badges, profile_score and employer visibility.
CREATE TABLE hpi_research_attempts (
  id TEXT PRIMARY KEY,
  candidate_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  form_version TEXT NOT NULL,
  notice_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','submitted')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  phase_index INTEGER NOT NULL DEFAULT 0 CHECK(phase_index>=0),
  answers_encrypted TEXT,
  result_encrypted TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(candidate_user_id,module_id,form_version),
  CHECK((status='draft' AND result_encrypted IS NULL) OR
        (status='submitted' AND answers_encrypted IS NOT NULL AND result_encrypted IS NOT NULL))
);
CREATE INDEX hpi_research_expiry ON hpi_research_attempts(expires_at);

```

## Appendix A2: `migrations/0096_hpi_research_invites.sql`

```sql
-- HPIS pilot invitations managed by admins (replaces redeploying HPI_RESEARCH_COHORT for each invitee).
-- An invitation only makes the optional research available; it never affects proof, profile or employers.
CREATE TABLE IF NOT EXISTS hpi_research_invites (
  candidate_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  invited_by TEXT,
  invited_at TEXT NOT NULL
);

```

## Appendix A3: `migrations/0097_hpi_form_variant.sql`

```sql
-- Counterbalanced HPIS forms (e.g. L02 rule order): the variant shown is stored with the attempt so
-- scoring never has to infer it. NULL means the module's first variant (rows created before 0097).
ALTER TABLE hpi_research_attempts ADD COLUMN form_variant TEXT;

```

## Appendix A4: `migrations/0098_hpi_fairness_consents.sql`

```sql
-- HPIS fairness research opt-in. Separate from every other consent: it allows {{BRAND}} to read the candidate's
-- existing profile gender, employment-equity group and age ONLY at analysis time, ONLY into anonymised group
-- totals that check whether HPIS questions work equally for different groups. Never copied into HPIS, never
-- used to score anyone, never shown to employers. Withdrawal deletes the row.
CREATE TABLE IF NOT EXISTS hpi_fairness_consents (
  candidate_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notice_version TEXT NOT NULL,
  granted_at TEXT NOT NULL
);

```

## Appendix B: `functions/api/_hpi_catalog.js`

```js
// Original {{BRAND}} research items. No proprietary test items or norms.
// Fixed form. Never modify a published form in place: add a new version and retain old forms.
import { matrixItem } from "./_hpi_visual.js";
export const VERSION = "hpi-2026-pilot-2";
// pilot-2 (unreleased revision of pilot-1): order items scored by precedence constraints, E01 keys derived
// from the record data with a fixed Match/Different response mapping, item a5 replaced (surface-cue defect),
// J03 rewritten with plausible alternatives (keys provisional; SME review required).
// Core set offered to every new candidate (product decision 2026-11-24: prominent, optional, candidate-private).
// Chosen for junior finance/admin relevance and low burden. The estimate is a design hypothesis: replace it with
// the pilot's observed median (created_at to submission time) once measured.
export const CORE = Object.freeze(["C01","E01","J03","M01"]);
export const CORE_ESTIMATE_MINUTES = 15;
// notice-2 adds anonymised aggregate analysis; only attempts made under notice-2 enter research statistics.
export const NOTICE = "hpi-research-notice-2";
export const STATS_NOTICES = Object.freeze(["hpi-research-notice-2"]);
export const RESEARCH_NOTICE = "Optional research exercises. Your answers and results are private to you, encrypted, and kept for up to 90 days. They do not affect your profile score, proof badges, marketplace visibility or hiring, and employers cannot see them. {{BRAND}} staff can see that you took part and when (kept in {{BRAND}}'s audit log), but never your answers or results; for research they see only anonymised totals across many candidates to check and improve the questions. In the optional timed exercise we also record active time, pauses, input type (mouse, touch or keyboard) and a rough screen-size class, only to check whether timing is fair across devices. You can stop at any time, export your data, or delete it. These exercises are not validated psychometric tests.";
const q=(id,domain,prompt,options,key,feedback)=>({id,domain,kind:"choice",prompt,options:options.map((label,i)=>({id:"o"+(i+1),label})),key:"o"+(key+1),feedback});
// before: [earlierIndex, laterIndex] pairs. Any order satisfying every pair is credited; key is one reference solution.
const order=(id,domain,prompt,options,key,feedback,before)=>({id,domain,kind:"order",prompt,options:options.map((label,i)=>({id:"o"+(i+1),label})),key:key.map(i=>"o"+(i+1)),before:before.map(([a,b])=>["o"+(a+1),"o"+(b+1)]),feedback});
// Record comparison: fixed response mapping (Match, Different) and a key derived from the data, not authored.
const chk=(id,original,captured)=>({id,domain:"checking",kind:"choice",prompt:"Original: "+original+" | Captured: "+captured,original,captured,options:[{id:"o1",label:"Match"},{id:"o2",label:"Different"}],key:original===captured?"o1":"o2",feedback:original===captured?"These records are identical.":"Compare each character position."});
const m=(id,title,minutes,construct,items)=>({id,title,minutes,construct,kind:"task",items,status:"research"});
const pending=(id,title,minutes,construct,reason)=>({id,title,minutes,construct,status:"planned",reason});
// E02: processing efficiency research protocol. Practice (unscored, immediate feedback) then two scored blocks,
// each capped at E02_BLOCK_MS of ACTIVE time measured in the browser (paused while the page is hidden) and checked
// server-side against elapsed wall time. One comparison at a time, fixed Match/Different mapping. Records are
// generated deterministically; each key is derived from the data. Speed is stored for research and withheld.
export const E02_BLOCK_MS = 60000;
const e02Trials=(()=>{
  let seed=20261124;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  const pick=xs=>xs[Math.floor(rnd()*xs.length)];
  const digits="0123456789",letters="ABCDEFGHJKLMNPRSTUVWXYZ";
  const make=()=>{const kind=pick(["INV","ORD","ACC","REF"]);return kind+"-"+Array.from({length:6},()=>pick(digits)).join("")+pick(letters);};
  const alter=c=>{const i=4+Math.floor(rnd()*7),ch=c[i],pool=/\d/.test(ch)?digits:letters;let n=ch;while(n===ch)n=pick(pool);return c.slice(0,i)+n+c.slice(i+1);};
  const swap=c=>{const i=4+Math.floor(rnd()*5);return c[i]===c[i+1]?alter(c):c.slice(0,i)+c[i+1]+c[i]+c.slice(i+2);};
  return Array.from({length:86},()=>{const o=make(),r=rnd();return [o,r<0.5?o:(r<0.75?alter(o):swap(o))];});
})();
const e02Item=(id,phase,[original,captured])=>({id,domain:["practice","block_1","block_2"][phase],kind:"choice",prompt:original+"  |  "+captured,original,captured,phase,options:[{id:"o1",label:"Match"},{id:"o2",label:"Different"}],key:original===captured?"o1":"o2",feedback:""});
const modules=[
m("C01","Numerical reasoning",8,"Interpret quantities, rates and data; not arithmetic speed.",[
q("n1","proportion","A batch contains 120 records; 18 need correction. What percentage needs correction?",["12%","15%","18%","20%"],1,"Divide errors by the total and multiply by 100."),
q("n2","data","Team A: 96 correct out of 120. Team B: 85 correct out of 100. Which team has the higher accuracy?",["A","Equal","B","Cannot determine"],2,"Compare rates rather than counts."),
q("n3","rate","A supplier charges R480 for 12 units. At the same unit price, what do 17 units cost?",["R640","R720","R600","R680"],3,"Find the unit price, then multiply."),
q("n4","data","Revenue: North R80,000, South R60,000. Costs: North R60,000, South R42,000. Which has the larger profit margin?",["South","North","Equal","Cannot determine"],0,"Divide profit by revenue."),
q("n5","change","A monthly count increases from 250 to 300, then decreases to 270. What is the net percentage change from the original?",["20% increase","10% decrease","8% increase","12% increase"],2,"Use the original count as the denominator."),
q("n6","rate","One machine completes 36 items in 9 minutes at a constant rate. How many in 15 minutes?",["45","60","54","72"],1,"Calculate items per minute first."),
q("n7","data","A store sold 30 units Monday, 45 Tuesday and 75 Wednesday. What fraction of all three days' sales occurred Wednesday?",["One third","Two fifths","Three quarters","One half"],3,"Compare Wednesday with the three-day total."),
q("n8","proportion","A budget of R2,400 allocates 35% to materials. How much remains for other costs?",["R1,560","R840","R1,440","R1,680"],0,"Subtract the allocated share from the budget.")
]),
m("C02","Verbal reasoning",8,"Draw conclusions supported by written information; language-specific, not general intelligence.",[
q("v1","inference","Policy: All returns must have a receipt. Online returns also require an order number. Statement: Every online return requires a receipt.",["Cannot determine","False","True"],2,"Apply the general rule to the subset."),
q("v2","inference","The office closes at 16:00 on Fridays. The notice says nothing about Saturdays. Statement: The office is closed on Saturdays.",["True","Cannot determine","False"],1,"Absence of information is not evidence of closure."),
q("v3","instruction","Send the weekly report to the supervisor only after the totals have been checked. The totals are unchecked. What is the next step?",["Check totals","Send the report","Delete the report","Ask a customer"],0,"Follow the stated prerequisite."),
q("v4","inference","Some deliveries were late; every late delivery was recorded. Statement: No late delivery was recorded.",["Cannot determine","True","False"],2,"The statement contradicts the information."),
q("v5","synthesis","Notice A: requests before noon are processed today. Notice B: incomplete requests wait until the missing information arrives. A complete request arrives at 11:30. When should it be processed?",["Tomorrow","Today","Next week","Cannot determine"],1,"Combine the two conditions."),
q("v6","inference","All archived files are read-only. File K can be edited. Statement: File K is archived.",["False","Cannot determine","True"],0,"An editable file contradicts the archive rule."),
q("v7","inference","Most orders were delivered on time. Statement: Order 514 was delivered on time.",["False","True","Cannot determine"],2,"A group pattern does not identify an individual case."),
q("v8","instruction","A cancellation must be logged before notifying the customer. The cancellation has been logged. Which listed step is now permitted?",["Delete the record","Notify the customer","Change the original order","Ignore the cancellation"],1,"Identify the step authorized by the procedure.")
]),
m("C03","Abstract and inductive reasoning",7,"Discover unfamiliar symbolic relationships. Text sequences are only one item family.",[
q("a1","sequence","Complete: A B B C C C D D D ?",["E","C","D","B"],2,"Each successive letter appears one more time."),
q("a2","sequence","Complete: 2, 5, 11, 23, ?",["46","47","35","48"],1,"Double the preceding number and add one."),
q("a3","transformation","If AB becomes BA and PQ becomes QP, what does XY become?",["YX","XX","YY","XY"],0,"Reverse the two symbols."),
q("a4","sequence","Complete: 1, 4, 2, 8, 3, 12, ?",["16","6","9","4"],3,"The sequence interleaves consecutive numbers and their multiples of four."),
q("a5","classification","Which group follows a different rule from the others?",["HJL","KMN","BDF","PRT"],1,"Three groups move forward two alphabet positions at each step; KMN moves two, then one."),
q("a6","transformation","Rule examples: ABC → BCA; PQR → QRP. Apply the rule to XYZ.",["ZXY","YZX","ZYX","XZY"],1,"Move the first symbol to the end."),
q("a7","sequence","Complete: 3, 6, 5, 10, 9, 18, ?",["17","19","16","36"],0,"Alternate multiplying by two and subtracting one."),
q("a8","sequence","Complete: AB, BC, CD, DE, ?",["DF","FE","EF","EG"],2,"Shift both letters one position forward."),
// Original visual matrices (functions/api/_hpi_visual.js): each is verified unambiguous at load time.
matrixItem("m1",{shape:["row",["circle","square","triangle"]],count:["col",[1,2,3]],fill:["all",["solid","solid","solid"]]},4,"Shape changes by row; number increases across each row."),
matrixItem("m2",{shape:["latin1",["square","triangle","circle"]],count:["all",[2,2,2]],fill:["row",["outline","striped","solid"]]},2,"Each row contains each shape once; fill changes by row."),
matrixItem("m3",{shape:["col",["triangle","circle","square"]],count:["latin1",[1,3,2]],fill:["all",["striped","striped","striped"]]},3,"Shape changes by column; each row contains each number once."),
matrixItem("m4",{shape:["latin2",["circle","triangle","square"]],count:["col",[3,1,2]],fill:["row",["solid","outline","striped"]]},8,"Three rules at once: shape cycles, number by column, fill by row."),
matrixItem("m5",{shape:["latin1",["triangle","square","circle"]],count:["latin2",[2,1,3]],fill:["col",["outline","solid","striped"]]},6,"Shape and number each appear once per row and column in different orders; fill by column."),
matrixItem("m6",{shape:["latin2",["square","circle","triangle"]],count:["latin1",[3,2,1]],fill:["latin1",["striped","outline","solid"]]},7,"All three features cycle; number and fill move together, shape in the opposite direction.")
]),
m("C04","Deductive reasoning",7,"Apply explicit rules and satisfy constraints; score validity, not response speed.",[
order("d1","sequencing","A must precede C; B follows C; D follows B. Put the tasks in a valid order.",["B","D","A","C"],[2,3,0,1],"Follow the dependency chain.",[[2,3],[3,0],[0,1]]),
q("d2","condition","If a file is approved it receives a seal. File X has no seal. Which conclusion follows?",["X is approved","X is a draft","X is not approved","X is missing"],2,"The stated rule makes the seal necessary for approval."),
q("d3","constraints","Three desks: Ana cannot sit at 1; Ben must sit at 3; each person has one desk. Where must Ana sit?",["1","2","3","Cannot determine"],1,"Eliminate the occupied and prohibited positions."),
order("d4","sequencing","Receive before inspect; inspect before label; label before store.",["Store","Inspect","Receive","Label"],[2,1,3,0],"Apply each prerequisite.",[[2,1],[1,3],[3,0]]),
q("d5","condition","Only authorized staff may open a vault. Lee opened the vault following the rule. What follows?",["Lee is a manager","Lee owns the vault","Lee knows every code","Lee is authorized"],3,"The rule establishes authorization, not seniority."),
q("d6","constraints","A meeting needs exactly two people. If A attends, B cannot attend. C must attend. A is attending. Who else attends?",["C","B","A again","Cannot determine"],0,"C is required and B is prohibited."),
q("d7","constraints","Boxes X and Y together weigh 10 kg. X weighs more than Y. Which combination is possible?",["X 4; Y 6","X 5; Y 5","X 6; Y 4","X 7; Y 4"],2,"Both the total and the inequality must hold."),
q("d8","condition","Every approved request is logged. Some logged requests are not approved. A request is logged. What can be concluded about approval?",["Always approved","Cannot determine","Always not approved","Logging is prohibited"],1,"Logging is necessary but not sufficient for approval.")
]),
m("C05","Critical thinking",8,"Evaluate evidence, assumptions and alternative explanations.",[
q("c1","causal","After new software was installed in March, invoices processed per clerk rose 20%. In the same month two experienced clerks joined and an old backlog was cleared. What does this evidence support?",["The software increased productivity by about 20%", "The new clerks explain the increase, not the software", "The increase cannot be attributed to any single change from this data", "The software had no effect, because staffing changed as well"],2,"Several changes happened together, so this comparison cannot separate their effects."),
q("c2","evidence","HR wants to claim that most staff support a new leave policy. Which evidence would best support that claim?",["Positive comments from the 12 staff who volunteered feedback", "An anonymous survey of a random sample of staff across all departments", "Approval from all five department heads", "No complaints in the month after the announcement"],1,"A representative, anonymous sample supports a claim about most staff; volunteers, managers and silence do not."),
q("c3","assumption","A team argues: 'Our new 12-step checklist will reduce capture errors because it is more thorough than the old 6-step one.' Which assumption does the argument depend on?",["The added steps target the causes of the capture errors", "The old checklist was never used", "Capture errors are the team's most important problem", "Longer checklists are always better than shorter ones"],0,"Extra thoroughness only reduces errors if it addresses what causes them; 'always' is stronger than the argument needs."),
q("c4","evidence","Two reports give different debtor totals for June: R1.2m from a ledger export run on 3 July, and R1.35m from a manager's undated spreadsheet. What is the best next step?",["Use the ledger figure, because system data is always right", "Use the average of the two until the difference is resolved", "Check the date, source and definition behind each figure before choosing", "Use the higher figure to be conservative"],2,"Establish what each figure measures and when before relying on either."),
q("c5","calibration","A three-week pilot with 8 clerks found errors fell from 12 to 9. The difference could easily be due to chance. What is the most accurate conclusion?",["The new method reduces errors by 25%", "The new method does not work", "The result is encouraging but not conclusive; a larger or longer trial is needed", "The method should be rolled out, because any improvement is worth having"],2,"A small, noisy result neither proves nor disproves an effect.")
]),
m("E01","Perceptual accuracy",5,"Identify exact record discrepancies; no timing inference.",[
chk("e1","IN-049182","IN-049128"),
chk("e2","782-044-19","782-044-19"),
chk("e3","1358.40","1358.04"),
chk("e4","REF-7KX2","REF-7KX2"),
chk("e5","ORD-90318","ORD-90381"),
chk("e6","A4-7716-B","A4-7716-B"),
chk("e7","24/08/2026","24/08/2026"),
chk("e8","67002031","67000231"),
chk("e9","ZT-11800","ZT-11800"),
chk("e10","3,402.18","3,420.18")
]),
{id:"E02",title:"Processing efficiency (timed)",minutes:4,construct:"Accurate record comparison under a time limit. Accuracy is reported; speed is recorded for research and not shown or interpreted until timing is shown to be comparable across devices.",status:"research",kind:"timed",gate:"ENABLE_HPI_PROCESSING",
gateReason:"Timed exercise under research review: device and accessibility equivalence of timing is not yet established.",
blockMs:E02_BLOCK_MS,
phases:[{title:"Practice",instruction:"Six practice comparisons. Choose Match if the two records are exactly the same, Different if any character differs. You will see whether each answer was right. Practice is not scored or timed."},
{title:"Block 1 of 2",instruction:"Compare as many records as you can accurately in one minute of active time. Accuracy matters more than speed. The clock pauses if you leave this page."},
{title:"Block 2 of 2",instruction:"Same task, one more minute. The clock pauses if you leave this page."}],
items:[...e02Trials.slice(0,6).map((t,i)=>e02Item("x"+(i+1),0,t)),...e02Trials.slice(6,46).map((t,i)=>e02Item("y"+(i+1),1,t)),...e02Trials.slice(46,86).map((t,i)=>e02Item("z"+(i+1),2,t))]},
m("E03","Planning and organization",8,"Build feasible plans under explicit requirements.",[
order("p1","planning","Collect the files before checking them; correct errors after checking; send only corrected files.",["Send","Correct","Collect","Check"],[2,3,1,0],"Respect all prerequisites.",[[2,3],[3,1],[1,0]]),
q("p2","constraints","Two tasks must finish today. A takes 40 minutes; B takes 30 minutes. You have 75 minutes. Which plan is feasible?",["A and B sequentially","A twice","B then a 60-minute task","Neither task"],0,"Check the total duration against the available time."),
q("p3","planning","A report needs two inputs. One is due at 10:00, one at 15:00; the report is due at 16:00 and takes 30 minutes. What is the earliest completion if work starts only after both inputs?",["10:30","15:00","15:30","16:30"],2,"Start after the later dependency."),
q("p4","constraints","A room holds 8 people. There are 11 attendees. What satisfies the limit?",["Seat everyone in the room","Split into groups of 6 and 5","Split into groups of 9 and 2","Cancel without checking"],1,"Respect the maximum group size."),
q("p5","planning","Two files must be verified separately by different reviewers. Which arrangement meets the rule?",["One reviewer does both","No verification","The same reviewer signs twice","Reviewer A checks file 1; reviewer B checks file 2"],3,"Assign separate reviewers.")
]),
m("J01","Practical problem-solving",8,"Choose actions supported by supplied information in practical scenarios.",[
q("j1","diagnosis","A customer says they paid invoice INV-204 for R4,500, but it shows as unpaid. The bank statement shows a R4,500 receipt that day with the reference 'INV-240'. What do you do first?",["Allocate the receipt to INV-240, as the reference says", "Check whether INV-240 exists and whose it is, then confirm with the customer before allocating", "Allocate it to INV-204, because the customer says they paid it", "Leave it unallocated until month-end"],1,"A likely transposed reference needs checking against both invoices and the customer before allocation."),
q("j2","diagnosis","This month's sales report total is exactly double last month's, the number of orders is unchanged, and a second data source was added to the report this month. What is the most useful first check?",["Ask sales whether prices increased", "Check whether the new data source repeats orders already in the original source", "Compare the total with the same month last year", "Remove the new data source and re-send the report"],1,"Test the most specific explanation the evidence points to before acting."),
q("j3","verification","The purchase order and the supplier invoice are both for 60 boxes, but the delivery note shows 50 received. What should happen before payment is approved?",["Pay for 60, because the invoice matches the purchase order", "Pay for 50 without telling the supplier", "Query the 10-box difference with receiving and the supplier, and hold the invoice until resolved", "Ask the supplier for a new invoice for 50 boxes"],2,"Resolve the three-way mismatch before paying; the remaining boxes may be short-delivered or still in transit."),
q("j4","verification","After a system update, VAT is calculated wrongly on some invoices but not others. What is the best way to find the cause?",["Re-enter the affected invoices manually", "Compare the VAT settings and calculation on an affected and an unaffected invoice", "Stop all invoicing until IT fixes it", "Correct the VAT on each invoice as you find it"],1,"A controlled comparison isolates what differs between failing and working cases."),
q("j5","diagnosis","A shared spreadsheet shows two different totals for the same cost centre on different tabs. What do you do first?",["Use the total on the summary tab", "Ask the person who last edited the file which one is right", "Trace both totals back to their formulas and source ranges", "Rebuild the spreadsheet from scratch"],2,"Trace each result to its inputs before choosing or rebuilding.")
]),
m("J02","Situational judgment",8,"Recognize contextually appropriate actions; proposed keys require SME review.",[
q("s1","escalation","It is Tuesday. A report your manager needs on Friday will be late because a data source has not arrived. What is the best response?",["Work late to try to finish, and tell your manager only if you miss Friday", "Tell your manager now, explain the delay and offer options such as a partial report on Friday", "Ask the data owner to hurry and wait to see whether it arrives in time", "Send the report on Friday with estimates for the missing data, without flagging them"],1,"Early notice with options lets your manager decide while there is still time."),
q("s2","accountability","You notice an error affecting one figure in a report you sent to finance yesterday. What do you do?",["Correct it in your copy and mention it next time you speak", "Wait to see whether anyone notices before raising it", "Tell the recipients now and send a corrected, checked version", "Send a corrected version without saying what changed"],2,"Correct the record openly and promptly so nobody relies on the wrong figure."),
q("s3","prioritization","Your manager asked for a supplier list by noon. At 11:00 the finance director asks for urgent help with a payment error that will stop today's payroll. What do you do?",["Finish the supplier list first, because it was requested first", "Help the finance director and tell your manager the list may be late", "Help the finance director without telling your manager", "Ask the finance director to wait until after noon"],1,"Act on the greater, time-critical impact and keep your manager informed."),
q("s4","information","A manager asks you for 'a quick cost estimate' for a new project but gives no details. What do you do?",["Give a rough figure based on a similar past project", "Ask a few questions about scope and timing, then give an estimate with your assumptions stated", "Say you cannot estimate without a full brief", "Give a very wide range so the estimate cannot be wrong"],1,"Brief clarification plus stated assumptions makes a quick estimate useful."),
q("s5","handoff","You are going on leave and handing over a supplier invoice dispute that is still open. What should the handover include?",["The email thread, forwarded to your colleague", "A note of the issue, what has been done, what is outstanding and who to contact", "A request to the supplier to wait until you return", "A brief verbal update to your colleague"],1,"A complete written handover lets someone else act without guessing.")
]),
m("J03","Risk and ethical judgment",6,"Recognize stated controls and escalation routes, not honesty as a trait.",[
q("r1","verification","An email from a regular supplier asks you to update their bank details before tomorrow's payment run. Policy requires independent verification of any bank-detail change. What do you do first?",["Phone the supplier on the number given in the email to confirm","Ask your manager to approve the change so the payment run is not delayed","Call the supplier on the number already held in the verified supplier file, before changing anything","Update the details and hold the payment until the supplier confirms by reply email"],2,"Verify through a channel the requester does not control; the email itself may be fraudulent."),
q("r2","privacy","A sales colleague who is not on the access list asks for a customer's account statement, saying the customer asked them to pass it on. What is the best response?",["Send it to the colleague, since the customer asked for it","Send it to the colleague with the banking details removed","Send the statement to the customer's contact on file and let the colleague know it was sent","Decline and take no further action"],2,"Meet the customer's need through the authorised route without widening access."),
q("r3","conflict","You are asked to compare three supplier quotes. The cheapest is from your cousin's company. What do you do?",["Recommend the cheapest quote, because price is objective","Remove your cousin's quote so nobody can suspect bias","Complete the comparison carefully and mention the relationship if anyone asks","Declare the relationship to your manager and follow their instruction on who evaluates the quotes"],3,"Disclose first; let someone without the conflict decide how the evaluation proceeds."),
q("r4","accountability","Payments above R50,000 need two approvals. A R62,000 payment has one; the second approver is on leave until Monday, and the supplier says deliveries stop if it is not paid by Friday. What do you do?",["Process it, because one approver has already reviewed it","Split it into two payments below R50,000","Escalate to the person authorised to approve in the approver's absence, and tell the supplier when payment is expected","Wait until Monday without raising it"],2,"Keep the control intact and use the authorised escalation route; communicate the expected timing."),
q("r5","privacy","An external debt collector needs details for three overdue accounts. Your age analysis lists all 200 customers with ID and phone numbers. What do you send?",["The full report, since the collector is a contracted service provider","The full report, password-protected","The report with ID numbers removed","Only the details of the three accounts needed for collection, through the approved channel"],3,"Share the minimum personal information the purpose needs.")
]),
{id:"L01",title:"Learning and transfer experiment",minutes:10,construct:"Performance on unfamiliar examples, after a standardized explanation, and when applying the principle in a new context without restatement; no validated learning-rate estimate.",status:"research",kind:"staged",
phases:[
{title:"Explore the examples",instruction:"A fictional sorting system labels 2–B as K, 3–B as M, 2–C as M, and 3–C as K. Work out the pattern from these examples. You will not receive scores between stages."},
{title:"Learn the rule",instruction:"The first position is a number and the second is a letter with an alphabet position (A=1, B=2, C=3…). If both have the same parity (both even or both odd), the label is K. If one is even and the other odd, the label is M. For example, 4–D is K and 4–E is M."},
{title:"New context",instruction:"A different sorting system labels pairs of whole numbers. It uses the same underlying principle you have just learned. Classify each pair."}],
items:[
q("t1","baseline","Classify 4–B.",["K","M"],0,"Both even."),
q("t2","baseline","Classify 5–C.",["K","M"],0,"Both odd."),
q("t3","baseline","Classify 4–C.",["K","M"],1,"Mixed parity."),
q("t4","baseline","Classify 7–B.",["K","M"],1,"Mixed parity."),
q("t5","application","Classify 6–D.",["K","M"],0,"Both even."),
q("t6","application","Classify 7–D.",["K","M"],1,"Mixed parity."),
q("t7","application","Classify 7–E.",["K","M"],0,"Both odd."),
q("t8","application","Classify 2–E.",["K","M"],1,"Mixed parity."),
q("t9","transfer","Classify the pair 8 and 12.",["K","M"],0,"Both even."),
q("t10","transfer","Classify the pair 11 and 8.",["K","M"],1,"Mixed parity."),
q("t11","transfer","Classify the pair 9 and 15.",["K","M"],0,"Both odd."),
q("t12","transfer","Classify the pair 14 and 3.",["K","M"],1,"Mixed parity.")
].map((item,index)=>({...item,phase:Math.floor(index/4)}))},
// L02: two-stage rule switch, counterbalanced. Variant A: size rule, then parity rule. Variant B: parity
// rule, then size rule. The same codes give the same four conflict trials after the switch in both
// variants (old and new rule disagree); oldKeys record the obsolete-rule answer. Variant is assigned per
// attempt and stored (form_variant), so scoring never depends on guessing which order was shown.
(()=>{
  const size=n=>n>50?"o1":"o2", parity=n=>n%2===0?"o1":"o2";
  const SIZE="if the number is greater than 50, choose Batch A; otherwise choose Batch B.";
  const PARITY="if the number is even, choose Batch A; if it is odd, choose Batch B.";
  const rules={A:[size,parity],B:[parity,size]};
  const text={A:[SIZE,PARITY],B:[PARITY,SIZE]};
  const variantPhases=Object.fromEntries(Object.entries(text).map(([v,[first,second]])=>[v,[
    {title:"First rule",instruction:"Sort each batch code. Rule: "+first},
    {title:"The rule has changed",instruction:"From now on, ignore the earlier rule. New rule: "+second}]]));
  const codes=[72,18,63,31,87,24,64,59,12,33];
  const items=codes.map((n,index)=>{
    const phase=index<4?0:1;
    const keys=Object.fromEntries(Object.entries(rules).map(([v,r])=>[v,r[phase](n)]));
    const oldKeys=phase===1?Object.fromEntries(Object.entries(rules).map(([v,r])=>[v,r[0](n)])):undefined;
    return {...q("f"+(index+1),phase===0?"original_rule":"after_change","Code "+n,["Batch A","Batch B"],0,"Apply the rule for this stage."),phase,keys,...(oldKeys?{oldKeys}:{})};
  });
  return {id:"L02",title:"Rule change",minutes:6,construct:"Applying a rule, then a changed rule; obsolete-rule responses after the change are counted. Rule order is counterbalanced. Not a validated flexibility trait.",status:"research",kind:"staged",variants:["A","B"],variantPhases,items};
})(),
// P01: 50-item IPIP representation of Goldberg's (1992) Big-Five factor markers. Public domain
// (https://ipip.ori.org/newPermission.htm). Items, order and keys verbatim from
// https://ipip.ori.org/new_ipip-50-item-scale.htm (retrieved 2026-11-24); provenance and the one edit to the
// respondent instruction in docs/hpis/provenance/ipip-50-big-five-markers.json. Self-description only: no
// types, no pass/fail, no norms, no "better" direction. Gated separately (ENABLE_HPI_PERSONALITY) pending
// review by a registered industrial psychologist.
{id:"P01",title:"Workplace personality (self-description)",minutes:8,construct:"Self-described tendencies on five broad dimensions (IPIP Big-Five factor markers). Not a test: there are no right answers and no better or worse scores.",status:"research",kind:"inventory",gate:"ENABLE_HPI_PERSONALITY",
gateReason:"Awaiting review by a registered industrial psychologist before this self-description questionnaire is offered.",
instructions:"Describe yourself as you generally are now, not as you wish to be in the future. Describe yourself as you honestly see yourself, in relation to other people you know of roughly your same age. For each statement, choose how accurately it describes you.",
factors:{1:"Extraversion",2:"Agreeableness",3:"Conscientiousness",4:"Emotional Stability",5:"Intellect/Imagination"},
items:[
[1,"Am the life of the party.",1,"+"],
[2,"Feel little concern for others.",2,"-"],
[3,"Am always prepared.",3,"+"],
[4,"Get stressed out easily.",4,"-"],
[5,"Have a rich vocabulary.",5,"+"],
[6,"Don't talk a lot.",1,"-"],
[7,"Am interested in people.",2,"+"],
[8,"Leave my belongings around.",3,"-"],
[9,"Am relaxed most of the time.",4,"+"],
[10,"Have difficulty understanding abstract ideas.",5,"-"],
[11,"Feel comfortable around people.",1,"+"],
[12,"Insult people.",2,"-"],
[13,"Pay attention to details.",3,"+"],
[14,"Worry about things.",4,"-"],
[15,"Have a vivid imagination.",5,"+"],
[16,"Keep in the background.",1,"-"],
[17,"Sympathize with others' feelings.",2,"+"],
[18,"Make a mess of things.",3,"-"],
[19,"Seldom feel blue.",4,"+"],
[20,"Am not interested in abstract ideas.",5,"-"],
[21,"Start conversations.",1,"+"],
[22,"Am not interested in other people's problems.",2,"-"],
[23,"Get chores done right away.",3,"+"],
[24,"Am easily disturbed.",4,"-"],
[25,"Have excellent ideas.",5,"+"],
[26,"Have little to say.",1,"-"],
[27,"Have a soft heart.",2,"+"],
[28,"Often forget to put things back in their proper place.",3,"-"],
[29,"Get upset easily.",4,"-"],
[30,"Do not have a good imagination.",5,"-"],
[31,"Talk to a lot of different people at parties.",1,"+"],
[32,"Am not really interested in others.",2,"-"],
[33,"Like order.",3,"+"],
[34,"Change my mood a lot.",4,"-"],
[35,"Am quick to understand things.",5,"+"],
[36,"Don't like to draw attention to myself.",1,"-"],
[37,"Take time out for others.",2,"+"],
[38,"Shirk my duties.",3,"-"],
[39,"Have frequent mood swings.",4,"-"],
[40,"Use difficult words.",5,"+"],
[41,"Don't mind being the center of attention.",1,"+"],
[42,"Feel others' emotions.",2,"+"],
[43,"Follow a schedule.",3,"+"],
[44,"Get irritated easily.",4,"-"],
[45,"Spend time reflecting on things.",5,"+"],
[46,"Am quiet around strangers.",1,"-"],
[47,"Make people feel at ease.",2,"+"],
[48,"Am exacting in my work.",3,"+"],
[49,"Often feel blue.",4,"-"],
[50,"Am full of ideas.",5,"+"]
].map(([n,text,factor,sign])=>({id:"b"+n,domain:"factor_"+factor,kind:"choice",prompt:text,factor,sign,options:["Very Inaccurate","Moderately Inaccurate","Neither Accurate Nor Inaccurate","Moderately Accurate","Very Accurate"].map((label,i)=>({id:"o"+(i+1),label}))}))},
m("S01","Interpersonal judgment",8,"Choose appropriate communication actions in stated work contexts.",[
q("i1","communication","A colleague keeps sending you incomplete capture batches, which you then have to fix. What is the best first step?",["Fix them quietly to avoid conflict", "Report it to your manager straight away", "Talk to the colleague privately, show examples and agree what a complete batch needs", "Send the batches back without comment"],2,"Address it directly and specifically before escalating."),
q("i2","conflict","Two colleagues disagree about which task to do first and ask you to decide. You are not their manager. What do you do?",["Choose the option you think is right", "Help them compare deadlines and dependencies, and suggest they check with their manager if still unsure", "Stay out of it", "Tell their manager they are arguing"],1,"Help them use shared criteria while respecting who has authority to decide."),
q("i3","communication","A customer asks when their refund will arrive. Finance has not confirmed a date. What do you say?",["That it will arrive within a few days, to reassure them", "That they should contact finance themselves", "That it is with finance, when you will update them, and then follow up", "That you cannot help with refunds"],2,"Be honest about what is known and take ownership of the next update."),
q("i4","handoff","A new team member seems stuck on a task but has not asked for help. What do you do?",["Leave them to work it out; they will learn more", "Ask how it is going and what they have tried, and offer help", "Do the task for them to save time", "Mention it to the manager"],1,"Check in and offer support without taking over."),
q("i5","feedback","Your manager says your reports have had small errors recently. What is the most constructive response?",["Explain that you have had too much work", "Ask for examples, check them, and agree how to prevent them", "Accept the comment and move on", "Ask whether others make the same errors"],1,"Understand the specific errors and agree a fix.")
]),
{id:"M01",title:"Work preferences",minutes:5,construct:"Self-reported preferences; no right answer or score.",status:"research",kind:"preferences",items:[
["w1","Work structure","Which working arrangement do you currently prefer?",["Clearly defined procedures","Some guidelines and discretion","Broad discretion","No preference"]],
["w2","Interaction","Which interaction pattern do you prefer?",["Mostly independent work","A mixture","Frequent collaboration","No preference"]],
["w3","Variety","Which task pattern do you prefer?",["Predictable work","Some variety","Frequent novelty","No preference"]],
["w4","Feedback","Which feedback arrangement do you prefer?",["Frequent feedback","Scheduled feedback","Feedback when needed","No preference"]],
["w5","Development","What do you currently prioritize?",["Deepening existing skills","Exploring new skills","A mixture","No preference"]]
].map(([id,domain,prompt,options])=>({id,domain,prompt,kind:"choice",options:options.map((label,i)=>({id:"o"+(i+1),label}))}))}
];
export const MODULES = Object.freeze(modules.map(m=>m.variants?{...resolveModule(m),variant:undefined}:m));
// Resolve a module for a stored form variant (counterbalanced modules). Unknown or absent variant means
// the first variant, so older rows without a variant score exactly as before.
export function resolveModule(m,variant){
  if(!m?.variants)return m;
  const v=m.variants.includes(variant)?variant:m.variants[0];
  return {...m,variant:v,phases:m.variantPhases[v],items:m.items.map(i=>({...i,key:i.keys[v],...(i.oldKeys?{oldKey:i.oldKeys[v]}:{})}))};
}
export const getModule = (id,variant) => resolveModule(MODULES.find(m=>m.id===id),variant);

```

## Appendix C: `functions/api/_hpi_engine.js`

```js
import { MODULES, VERSION, CORE, getModule } from "./_hpi_catalog.js";
export const ENGINE = "hpi-raw-v2";
// Order responses are credited when they satisfy every stated precedence constraint, so a valid
// sequence different from the author's reference sequence is never marked wrong.
export function orderViolations(item,answer){
  if(!Array.isArray(item.before))return JSON.stringify(answer)===JSON.stringify(item.key)?0:1;
  const pos=new Map(answer.map((v,i)=>[v,i]));
  return item.before.filter(([a,b])=>!(pos.get(a)<pos.get(b))).length;
}
const correctAnswer=(item,answer)=>answer!==null&&(item.kind==="order"?orderViolations(item,answer)===0:answer===item.key);
function permutations(list){if(list.length<=1)return [list];return list.flatMap((x,i)=>permutations([...list.slice(0,i),...list.slice(i+1)]).map(p=>[x,...p]));}
export function validOrders(item){return permutations(item.options.map(o=>o.id)).filter(p=>orderViolations(item,p)===0);}
// gates: names of env switches that are on. A gated module whose switch is off is listed as planned.
export function catalogue(gates=[]) {
  return MODULES.map(({items,phases,variantPhases,factors,instructions,gate,gateReason,...m})=>
    gate&&!gates.includes(gate)?{...m,status:"planned",reason:gateReason,core:false,itemCount:items?.length||0,stageCount:1}
    :({...m,core:CORE.includes(m.id),itemCount:items?.length||0,stageCount:phases?.length||1}));
}
export const moduleGate = id => MODULES.find(m=>m.id===id)?.gate||null;
export function publicForm(id,phase=0,variant) {
  const m=getModule(id,variant);
  if(!m||m.status!=="research") return null;
  const stages=m.phases?.length||1;
  if(!Number.isInteger(phase)||phase<0||phase>=stages)return null;
  return {id:m.id,title:m.title,construct:m.construct,version:VERSION,kind:m.kind,phase,stages,stage:m.phases?.[phase]||null,instructions:m.instructions||null,...(m.blockMs?{blockMs:m.blockMs}:{}),
    // Practice trials of a timed module carry their key so the browser can give immediate feedback; scored trials never do.
    items:m.items.filter(i=>!m.phases||i.phase===phase).map(({id,domain,kind,prompt,options,visual,key})=>({id,domain,kind,prompt,options,...(visual?{visual}:{}),...(m.kind==="timed"&&phase===0?{practiceKey:key}:{})}))};
}
export function normalizeAnswers(id, input, phase=null, variant) {
  const m=getModule(id,variant);
  if(!m||m.status!=="research"||!input||typeof input!=="object"||Array.isArray(input)) throw new Error("Invalid answers.");
  const items=phase===null?m.items:m.items.filter(i=>!m.phases||i.phase===phase);
  if(!items.length)throw new Error("Invalid phase.");
  const valid=new Set(items.map(x=>x.id));
  if(Object.keys(input).some(k=>!valid.has(k))) throw new Error("Unknown item.");
  const answers=Object.create(null);
  for(const item of items){
    const v=Object.hasOwn(input,item.id)?input[item.id]:null;
    const ids=item.options.map(o=>o.id);
    if(v===null){answers[item.id]=null;continue;}
    if(item.kind==="choice" && typeof v==="string" && ids.includes(v)){answers[item.id]=v;continue;}
    if(item.kind==="order" && Array.isArray(v) && v.length===ids.length && new Set(v).size===ids.length && v.every(x=>typeof x==="string"&&ids.includes(x))){answers[item.id]=v.slice();continue;}
    throw new Error("Invalid response.");
  }
  return answers;
}
// Client-reported timing for one timed block, shape-checked. The server adds valid/unlimited itself.
const MODALITIES=["pointer","touch","keyboard","mixed","unknown"],VIEWPORTS=["small","medium","large"];
export function normalizeTiming(t){
  if(!t||typeof t!=="object"||Array.isArray(t))return null;
  const activeMs=Number(t.activeMs),interruptions=Number(t.interruptions);
  if(!Number.isFinite(activeMs)||activeMs<0||activeMs>3600000||!Number.isInteger(interruptions)||interruptions<0||interruptions>1000)return null;
  return {activeMs:Math.round(activeMs),interruptions,modality:MODALITIES.includes(t.modality)?t.modality:"unknown",viewport:VIEWPORTS.includes(t.viewport)?t.viewport:"unknown"};
}
export function score(id,input,variant,timing={}){
  const m=getModule(id,variant),answers=normalizeAnswers(id,input,null,variant);
  const attempted=m.items.filter(i=>answers[i.id]!==null).length;
  const out={moduleId:id,...(m.variant?{variant:m.variant}:{}),version:VERSION,engine:ENGINE,status:"research_only",selectionAllowed:false,attempted,total:m.items.length,precision:"not_established",norms:"not_established",interpretation:"Observed performance on this fixed research form only; no percentile, trait inference, cutoff or hiring recommendation."};
  if(m.kind==="inventory"){
    // IPIP scoring: + keyed 1..5, - keyed 5..1 (6 - position). Mean of answered items per factor; the sum only
    // when every item of the factor is answered. No norms, percentiles, types or cut-offs.
    const factors=Object.entries(m.factors).map(([f,name])=>{
      const its=m.items.filter(i=>String(i.factor)===f),vals=its.filter(i=>answers[i.id]!==null).map(i=>{const v=Number(answers[i.id].slice(1));return i.sign==="-"?6-v:v;});
      return {factor:Number(f),name,answered:vals.length,total:its.length,mean:vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100:null,sum:vals.length===its.length?vals.reduce((a,b)=>a+b,0):null};
    });
    return {...out,scale:"1-5 (mean of item scores)",interpretation:"Your self-description on five broad dimensions. These are not abilities and there is no better or worse position. No norms, types or job-fit judgments are made.",factors};
  }
  if(m.kind==="preferences")return {...out,preferences:m.items.filter(i=>answers[i.id]!==null).map(i=>({domain:i.domain,choice:i.options.find(o=>o.id===answers[i.id]).label}))};
  const byDomain=Object.create(null);
  let correct=0,violations=0;
  for(const item of m.items){
    const answer=answers[item.id];
    const ok=correctAnswer(item,answer);
    if(item.kind==="order"&&answer!==null)violations+=orderViolations(item,answer);
    const d=byDomain[item.domain]??={domain:item.domain,total:0,attempted:0,credited:0};
    d.total++; if(answer!==null)d.attempted++; if(ok){correct++;d.credited++;}
  }
  if(m.kind==="timed"){
    const tally=p=>{const its=m.items.filter(i=>i.phase===p),reached=its.filter(i=>answers[i.id]!==null),correct=reached.filter(i=>answers[i.id]===i.key).length;return {reached:reached.length,correct,incorrect:reached.length-correct,available:its.length};};
    const blocks=[1,2].map(p=>{const t=timing?.[p]||null,c=tally(p);return {block:p,...c,accuracy:c.reached?Math.round(c.correct/c.reached*1000)/1000:null,timing:t};});
    return {...out,interpretation:"Accuracy on each one-minute block. Speed is recorded for research but not shown or interpreted: timing has not been shown to be comparable across devices, input methods and accessibility needs.",
      practice:tally(0),blocks,
      // Research-only throughput: null unless timing was valid, limited (not accommodated) and long enough.
      researchOnly:{status:"withheld",correctPerMinute:blocks.map(b=>b.timing?.valid&&!b.timing.unlimited&&b.timing.activeMs>=10000?Math.round(b.correct/(b.timing.activeMs/60000)*10)/10:null)}};
  }
  if(m.kind==="staged"){
    const staged={...out,interpretation:"Counts at each research stage; differences may reflect instruction, task difficulty, familiarity or practice. Each item has two options, so chance is 50%. No learning-rate, flexibility or potential score.",chanceLevel:0.5,stages:Object.values(byDomain)};
    const conflict=m.items.filter(i=>i.oldKey&&i.oldKey!==i.key);
    if(conflict.length){
      // Obsolete-rule responses: answers on conflict trials that follow the old rule. Plus the post-change
      // trial sequence (1 correct, 0 incorrect, null blank) for recovery analysis.
      staged.ruleChange={conflictTrials:conflict.length,obsoleteRuleResponses:conflict.filter(i=>answers[i.id]===i.oldKey).length,
        afterChangeSequence:m.items.filter(i=>i.oldKey).map(i=>answers[i.id]===null?null:(answers[i.id]===i.key?1:0))};
    }
    return staged;
  }
  if(id==="E01"){
    const counts={hits:0,misses:0,falseAlarms:0,correctRejections:0,omitted:0};
    for(const i of m.items){const response=answers[i.id];if(response===null){counts.omitted++;continue;}const actual=i.options.find(o=>o.id===i.key).label==="Different";const flagged=i.options.find(o=>o.id===response).label==="Different";counts[actual?(flagged?"hits":"misses"):(flagged?"falseAlarms":"correctRejections")]++;}
    out.checking=counts;
  }
  if(m.items.some(i=>i.kind==="order"))out.constraintViolations=violations;
  return {...out,credited:correct,observations:Object.values(byDomain),practice:[...new Set(m.items.filter(i=>answers[i.id]!==null&&!correctAnswer(i,answers[i.id])).map(i=>i.domain))]};
}
export function assertCatalogue(){
 const ids=new Set();
 for(const m of MODULES){
  if(ids.has(m.id))throw new Error("Duplicate module");ids.add(m.id);
  if(m.status!=="research")continue;
  const items=new Set();
  for(const i of m.items){
   if(items.has(i.id))throw new Error("Duplicate item");items.add(i.id);
   const opts=i.options.map(o=>o.id);
   if(new Set(opts).size!==opts.length||new Set(i.options.map(o=>o.label)).size!==opts.length)throw new Error("Duplicate option");
   if(m.kind==="preferences"){if("key" in i)throw new Error("Preference key");continue;}
   if(m.kind==="inventory"){if("key" in i||!["+","-"].includes(i.sign)||!m.factors[i.factor]||opts.length!==5)throw new Error("Invalid inventory item");continue;}
   if(i.kind==="choice"&&!opts.includes(i.key))throw new Error("Invalid key");
   if(i.kind==="order"){
    if(!Array.isArray(i.key)||new Set(i.key).size!==opts.length||i.key.length!==opts.length||!i.key.every(k=>opts.includes(k)))throw new Error("Invalid order key");
    if(!Array.isArray(i.before)||!i.before.length||!i.before.every(p=>Array.isArray(p)&&p.length===2&&p[0]!==p[1]&&p.every(k=>opts.includes(k))))throw new Error("Order item needs precedence constraints");
    if(orderViolations(i,i.key)!==0)throw new Error("Reference order violates its constraints");
    if(opts.length>7)throw new Error("Order item too large to verify exhaustively");
   }
   if(i.kind==="choice"&&"original" in i&&i.key!==(i.original===i.captured?"o1":"o2"))throw new Error("Record comparison key disagrees with data");
  }
 }
 return true;
}

```

## Appendix D: `functions/api/_hpi_visual.js`

```js
// Original visual matrix items for C03 (no third-party content). Pure and deterministic.
//
// A cell is {shape, count, fill}: shape circle|square|triangle, count 1..3, fill solid|outline|striped.
// Patterns are carried by shape, number and fill pattern, never by colour alone.
//
// Each attribute follows one rule over the 3x3 grid, expressed as a class function g(row, col) -> 0..2 with
// a value per class: "all" (one value), "row", "col", "latin1" ((r+c)%3) or "latin2" ((r+2c)%3).
// verifyMatrix() rejects an item unless EVERY rule family consistent with the eight visible cells predicts
// the same missing cell (no alternative reading of the visible cells gives a different answer).
//
// Options: the answer plus three distractors, each differing from the answer in exactly two attributes and
// arranged so that, for every attribute, the answer's value appears in exactly two of the four options. Picking
// the option with the most common features therefore cannot find the answer without reading the matrix.

export const ATTRS = Object.freeze({ shape: ["circle", "square", "triangle"], count: [1, 2, 3], fill: ["solid", "outline", "striped"] });
export const FAMILIES = Object.freeze({
  all: () => 0, row: (r) => r, col: (r, c) => c, latin1: (r, c) => (r + c) % 3, latin2: (r, c) => (r + 2 * c) % 3,
});
const WORDS = { 1: "one", 2: "two", 3: "three" };
export function describe(cell) {
  const noun = cell.shape + (cell.count > 1 ? "s" : "");
  return `${WORDS[cell.count]} ${cell.fill === "outline" ? "outlined" : cell.fill} ${noun}`;
}

// rules: {shape:[family, [v0,v1,v2]], count:[...], fill:[...]} with values indexed by class.
export function buildGrid(rules) {
  const grid = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const cell = {};
    for (const [attr, [fam, values]] of Object.entries(rules)) cell[attr] = values[FAMILIES[fam](r, c)];
    grid.push(cell);
  }
  return grid;
}

// For one attribute: every family consistent with the visible cells, and what each predicts for (2,2).
export function predictions(visible, attr) {
  const out = [];
  for (const [name, g] of Object.entries(FAMILIES)) {
    const byClass = new Map();
    let consistent = true;
    for (let i = 0; i < 8; i++) {
      const k = g(Math.floor(i / 3), i % 3), v = visible[i][attr];
      if (byClass.has(k) && byClass.get(k) !== v) { consistent = false; break; }
      byClass.set(k, v);
    }
    if (!consistent) continue;
    const k = g(2, 2);
    out.push({ family: name, value: byClass.has(k) ? byClass.get(k) : undefined });
  }
  return out;
}

export function verifyMatrix(grid) {
  const visible = grid.slice(0, 8), answer = grid[8];
  for (const attr of Object.keys(ATTRS)) {
    const p = predictions(visible, attr);
    if (!p.length) throw new Error(`no rule explains ${attr}`);
    if (p.some(x => x.value === undefined)) throw new Error(`${attr}: a consistent rule leaves the answer undetermined`);
    if (new Set(p.map(x => x.value)).size !== 1) throw new Error(`${attr}: consistent rules disagree`);
    if (p[0].value !== answer[attr]) throw new Error(`${attr}: answer does not follow the rule`);
  }
  return true;
}

const other = (attr, v, seed) => { const vals = ATTRS[attr].filter(x => x !== v); return vals[seed % vals.length]; };
export function balancedOptions(answer, seed) {
  const [a, b, c] = ["shape", "count", "fill"];
  const alt = { [a]: other(a, answer[a], seed), [b]: other(b, answer[b], seed + 1), [c]: other(c, answer[c], seed + 2) };
  const d1 = { ...answer, [a]: alt[a], [c]: alt[c] };
  const d2 = { ...answer, [b]: alt[b], [c]: alt[c] };
  const d3 = { ...answer, [a]: alt[a], [b]: alt[b] };
  const opts = [answer, d1, d2, d3];
  // Deterministic rotation so the answer position varies across items.
  const shift = seed % 4;
  return opts.slice(shift).concat(opts.slice(0, shift)).map(o => ({ ...o }));
}

const same = (x, y) => x.shape === y.shape && x.count === y.count && x.fill === y.fill;
// One item: {id, prompt, visual:{cells (answer cell null)}, options:[{id,label,visual}], key}
export function matrixItem(id, rules, seed, feedback) {
  const grid = buildGrid(rules);
  verifyMatrix(grid);
  const answer = grid[8];
  const opts = balancedOptions(answer, seed);
  if (opts.filter(o => same(o, answer)).length !== 1) throw new Error(`${id}: answer not unique among options`);
  for (const o of opts) if (!same(o, answer) && grid.slice(0, 8).length && (() => { try { verifyMatrix([...grid.slice(0, 8), o]); return true; } catch { return false; } })()) throw new Error(`${id}: a distractor also fits`);
  const options = opts.map((o, i) => ({ id: "o" + (i + 1), label: describe(o), visual: o }));
  return {
    id, domain: "matrix", kind: "choice",
    prompt: "Which picture completes the grid? Each row and column follows a pattern in shape, number and fill.",
    visual: { cells: grid.slice(0, 8).concat([null]), description: grid.slice(0, 8).map((cell, i) => `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${describe(cell)}`).join(". ") + ". Row 3, column 3: missing." },
    options, key: options.find(o => same(o.visual, answer)).id, feedback,
  };
}

```

## Appendix E: `functions/api/_hpi_fairness.js`

```js
// HPIS fairness research: Mantel-Haenszel differential item functioning (DIF) screen. Pure functions.
//
// Input records are {scores: {itemId: 0|1}, group: label|null} for candidates who opted in. Demographics are
// passed in by the caller at analysis time only; nothing here is used by, or imported into, HPIS scoring.
//
// For each item, candidates are stratified by their rest score (module total minus that item, in up to
// MAX_STRATA bands) and the reference group (largest) is compared with each focal group:
//   alpha_MH = sum(A*D/N) / sum(B*C/N), MH D-DIF = -2.35 * ln(alpha_MH)
// The matching score is purified in two stages (flagged items removed), then each item is re-screened.
// where A,B = reference correct/incorrect and C,D = focal correct/incorrect in a stratum. |D-DIF| >= 1.5 is
// flagged for expert review (the ETS "large" magnitude band). This is a magnitude screen only: no significance
// test, no correction for multiple comparisons. A flag is a prompt to look at an item, not proof of bias.

// Fairness opt-in notice (kept here, not in the scoring catalogue).
export const FAIRNESS_NOTICE = "hpi-fairness-notice-1";
export const FAIRNESS_TEXT = "Optional, separate from everything else. If you agree, {{BRAND}} may use the gender, employment-equity group and age already in your profile, only inside anonymised totals of at least 30 people per group, to check whether these exercises work equally fairly for different groups. It is never used to score you, never shown to employers and never copied into your exercise results. You can withdraw at any time.";
export const MIN_GROUP = 30;
export const MAX_STRATA = 5;
export const FLAG_ABS_D = 1.5;

function strataOf(rest) {
  const sorted = [...new Set(rest)].sort((a, b) => a - b);
  if (sorted.length <= MAX_STRATA) return v => sorted.indexOf(v);
  const cuts = Array.from({ length: MAX_STRATA - 1 }, (_, i) => sorted[Math.floor(((i + 1) * sorted.length) / MAX_STRATA)]);
  return v => cuts.filter(c => v >= c).length;
}

export function mhDif(itemId, itemIds, records, refLabel, focalLabel, matchIds = itemIds) {
  const rows = records.filter(r => r.group === refLabel || r.group === focalLabel);
  const rest = rows.map(r => matchIds.reduce((t, id) => t + (id === itemId ? 0 : r.scores[id] || 0), 0));
  const stratum = strataOf(rest);
  const cells = new Map();
  rows.forEach((r, i) => {
    const k = stratum(rest[i]);
    const c = cells.get(k) || { A: 0, B: 0, C: 0, D: 0 };
    const right = r.scores[itemId] === 1;
    if (r.group === refLabel) right ? c.A++ : c.B++; else right ? c.C++ : c.D++;
    cells.set(k, c);
  });
  let num = 0, den = 0;
  for (const { A, B, C, D } of cells.values()) { const N = A + B + C + D; if (!N) continue; num += (A * D) / N; den += (B * C) / N; }
  // Complete separation within strata makes the odds ratio infinite: that is the most extreme DIF, not "no DIF".
  if (num && !den) return { d: null, extreme: "favours_reference" };
  if (!num && den) return { d: null, extreme: "favours_focal" };
  if (!num && !den) return { d: null, extreme: null };
  return { d: Math.round(-2.35 * Math.log(num / den) * 100) / 100, extreme: null };
}

const flagged = ({ d, extreme }) => !!extreme || (d !== null && Math.abs(d) >= FLAG_ABS_D);
// Two-stage purification: items flagged in stage 1 are removed from the matching score in stage 2 (a biased item
// in the matching criterion otherwise distorts the comparison for every other item).
function purified(itemIds, records, ref, focal) {
  const stage1 = new Map(itemIds.map(id => [id, mhDif(id, itemIds, records, ref, focal)]));
  const clean = itemIds.filter(id => !flagged(stage1.get(id)));
  return itemIds.map(id => {
    const r = mhDif(id, itemIds, records, ref, focal, clean.includes(id) ? clean : [...clean, id]);
    return { item_id: id, mh_d_dif: r.d, ...(r.extreme ? { extreme: r.extreme } : {}), flag: flagged(r), purified_match_items: clean.length };
  });
}
// One grouping variable over one module. Returns null when fewer than two groups reach MIN_GROUP.
export function difScreen(itemIds, records, variable) {
  const counts = new Map();
  for (const r of records) if (r.group) counts.set(r.group, (counts.get(r.group) || 0) + 1);
  const groups = [...counts.entries()].filter(([, n]) => n >= MIN_GROUP).sort((a, b) => b[1] - a[1]);
  if (groups.length < 2) return { variable, suppressed: true, reason: `Fewer than two groups with at least ${MIN_GROUP} people.` };
  const [ref, refN] = groups[0];
  return {
    variable, suppressed: false, reference: { label: ref, n: refN },
    comparisons: groups.slice(1).map(([focal, n]) => ({
      focal: { label: focal, n },
      items: purified(itemIds, records, ref, focal),
    })),
  };
}

export const ageBand = age => (!Number.isFinite(age) ? null : age < 25 ? "Under 25" : age < 35 ? "25 to 34" : "35 and over");

```

## Appendix F1: `functions/api/_handlers/hpi.js`

```js
import { json,bad,now,id,hasRole,piiKey,checkRateLimit,candidateConsentGate,audit } from "./_shared.js";
import { encryptField,decryptField } from "../_crypto.js";
import { VERSION,NOTICE,RESEARCH_NOTICE,CORE,CORE_ESTIMATE_MINUTES,getModule } from "../_hpi_catalog.js";
import { FAIRNESS_NOTICE,FAIRNESS_TEXT } from "../_hpi_fairness.js";
import { catalogue,publicForm,normalizeAnswers,score,moduleGate,normalizeTiming } from "../_hpi_engine.js";
const TABLE="hpi_research_attempts";
const missingTable=e=>/no such table.*hpi_research_attempts/i.test(String(e?.message));
const expiry=()=>new Date(Date.now()+90*86400000).toISOString();
const active="EXISTS (SELECT 1 FROM users WHERE id=? AND status NOT IN ('suspended','rejected','deleted'))";
async function decode(v,key){if(v===null)return null;if(!key||!v.startsWith("enc:"))throw new Error("HPI encrypted data unavailable");const p=await decryptField(v,key);if(p===v)throw new Error("HPI decryption failed");return JSON.parse(p);}
const fields="id,module_id,form_version,form_variant,notice_version,status,revision,phase_index,answers_encrypted,result_encrypted,created_at,updated_at,expires_at";
async function serialize(row,key,includeAnswers=false){
 const {answers_encrypted,result_encrypted,...metadata}=row;
 return {...metadata,result:await decode(result_encrypted,key),...(includeAnswers?{answers:await decode(answers_encrypted,key)}:{})};
}
// Data rights must work even when the pilot flag is disabled or the migration has not run.
export async function exportHpi(env,userId){
 try {
  const rows=await env.DB.prepare("SELECT "+fields+" FROM "+TABLE+" WHERE candidate_user_id=? ORDER BY created_at").bind(userId).all();
  // An unreadable payload (missing or rotated key) must not abort the whole account export: return the
// metadata and say explicitly that the encrypted content could not be read.
return Promise.all((rows.results||[]).map(r=>serialize(r,piiKey(env),true).catch(()=>{const {answers_encrypted,result_encrypted,...metadata}=r;return {...metadata,result:null,answers:null,payload_unavailable:"encrypted_content_unreadable"};})));
 }catch(e){if(missingTable(e))return [];throw e;}
}
async function fairnessConsent(env,userId){
  try{return await env.DB.prepare("SELECT notice_version,granted_at FROM hpi_fairness_consents WHERE candidate_user_id=?").bind(userId).first();}
  catch(e){if(/no such table/i.test(String(e?.message)))return null;throw e;}
}
async function eraseFairness(env,userId){
  try{await env.DB.prepare("DELETE FROM hpi_fairness_consents WHERE candidate_user_id=?").bind(userId).run();}
  catch(e){if(!/no such table/i.test(String(e?.message)))throw e;}
}
export async function eraseHpi(env,userId){
  await eraseFairness(env,userId);
 try{await env.DB.prepare("DELETE FROM "+TABLE+" WHERE candidate_user_id=?").bind(userId).run();}
 catch(e){if(!missingTable(e))throw e;}
}
export async function sweepHpi(env){
 try{return (await env.DB.prepare("DELETE FROM "+TABLE+" WHERE expires_at<=?").bind(now()).run())?.meta?.changes||0;}
 catch(e){if(missingTable(e))return 0;throw e;}
}
// Eligibility: the research flag AND either the invite cohort or open enrolment. Open enrolment
// (HPI_OPEN_ENROLMENT=true) offers HPIS to every candidate; it stays off until the legal, privacy and
// professional review in docs/hpis/DECISIONS.md is complete. Participation is always optional.
// An approved extended-time accommodation (existing assessment_accommodations) makes timed HPIS blocks untimed.
// It is read, never consumed: HPIS must not use up an occupational-assessment accommodation.
async function untimedAccommodation(env,userId){
  try{return !!(await env.DB.prepare("SELECT 1 AS x FROM assessment_accommodations WHERE candidate_user_id=? AND request_type='extended_time' AND status='approved' LIMIT 1").bind(userId).first());}
  catch(e){if(/no such table/i.test(String(e?.message)))return false;throw e;}
}
// Module-level switches (e.g. P01 personality) on top of the research switch.
const GATES=["ENABLE_HPI_PERSONALITY","ENABLE_HPI_PROCESSING"];
const openGates=env=>GATES.filter(g=>env[g]==="true");
const gateOpen=(env,moduleId)=>{const g=moduleGate(moduleId);return !g||env[g]==="true";};
export async function hpiEligible(env,user){
  if(env.ENABLE_HPI_RESEARCH!=="true")return false;
  if(env.HPI_OPEN_ENROLMENT==="true")return true;
  if(String(env.HPI_RESEARCH_COHORT||"").split(",").map(x=>x.trim()).includes(user.id))return true;
  // Admin-managed pilot invitations (migration 0096). A missing table means no invitations.
  try{return !!(await env.DB.prepare("SELECT 1 AS x FROM hpi_research_invites WHERE candidate_user_id=?").bind(user.id).first());}
  catch(e){if(/no such table/i.test(String(e?.message)))return false;throw e;}
}
// Account erasure and permanent deletion remove the invitation too; a candidate deleting only their
// research data keeps it, so they can take part again.
export async function eraseHpiInvite(env,userId){
  try{await env.DB.prepare("DELETE FROM hpi_research_invites WHERE candidate_user_id=?").bind(userId).run();}
  catch(e){if(!/no such table/i.test(String(e?.message)))throw e;}
}
export async function handleHpi(path,request,env,user,data){
 if(!path.startsWith("/hpi/"))return null;
 if(!hasRole(user,["candidate"]))return bad("Candidate access only.",403);
 const method=request.method;
 if(path==="/hpi/export"&&method==="GET")return json({ok:true,attempts:await exportHpi(env,user.id),fairness_consent:await fairnessConsent(env,user.id)});
 // Withdrawing fairness consent is a data right: it works even when research is switched off.
if(path==="/hpi/fairness"&&method==="POST"&&data?.grant===false){await eraseFairness(env,user.id);await audit(env,request,user,"hpi.fairness.withdrawn","user",user.id,{});return json({ok:true,granted:false});}
if(path==="/hpi/erase"&&method==="POST"){
  if(data?.confirm!=="DELETE HPI")return bad("Confirm DELETE HPI.");
  await eraseHpi(env,user.id);await audit(env,request,user,"hpi.research.erased","user",user.id,{});return json({ok:true});
 }
 // Explicit feature flag AND invite list. No automatic employer use, even when enabled.
 // Lightweight prompt for the candidate home: never an error for ineligible candidates, never results.
// Progress counts core modules completed in any unexpired form version, so a new version does not look like lost work.
if(path==="/hpi/status"&&method==="GET"){
  if(!(await hpiEligible(env,user))||!piiKey(env))return json({ok:true,available:false});
// Same consent gate as every other HPIS route, so Home never invites a candidate into a refusal.
if(await candidateConsentGate(env,user,"assessment_start"))return json({ok:true,available:false});
  let done=0;
  try{done=(await env.DB.prepare("SELECT count(DISTINCT module_id) AS n FROM "+TABLE+" WHERE candidate_user_id=? AND status='submitted' AND expires_at>? AND module_id IN ("+CORE.map(()=>"?").join(",")+")").bind(user.id,now(),...CORE).first())?.n||0;}
  catch(e){if(!missingTable(e))throw e;return json({ok:true,available:false});}
  return json({ok:true,available:true,core:{total:CORE.length,submitted:Number(done),estimate_minutes:CORE_ESTIMATE_MINUTES}});
}
if(!(await hpiEligible(env,user)))return bad("The optional research pilot is not available.",404);
 if(!piiKey(env))return bad("Research storage is unavailable.",503);
 const gate=await candidateConsentGate(env,user,"assessment_start");if(gate)return gate;
 if(!await checkRateLimit(env,request,"hpi",user.id,180,3600,{perIp:false}))return bad("Please try again later.",429);
 // Fairness research opt-in (separate switch and consent). Withdrawal deletes the consent row.
if(path==="/hpi/fairness"&&method==="GET"){const c=await fairnessConsent(env,user.id);return json({ok:true,available:env.ENABLE_HPI_FAIRNESS_RESEARCH==="true",granted:!!c&&c.notice_version===FAIRNESS_NOTICE,notice_version:FAIRNESS_NOTICE,notice:FAIRNESS_TEXT});}
if(path==="/hpi/fairness"&&method==="POST"){
  if(typeof data?.grant!=="boolean")return bad("Choose to agree or withdraw.");
  if(data.grant){
    if(env.ENABLE_HPI_FAIRNESS_RESEARCH!=="true")return bad("Fairness research is not open.",404);
    if(data.notice_version!==FAIRNESS_NOTICE)return bad("Please read the current notice.");
    await env.DB.prepare("INSERT INTO hpi_fairness_consents (candidate_user_id,notice_version,granted_at) VALUES (?,?,?) ON CONFLICT(candidate_user_id) DO UPDATE SET notice_version=excluded.notice_version,granted_at=excluded.granted_at").bind(user.id,FAIRNESS_NOTICE,now()).run();
    await audit(env,request,user,"hpi.fairness.granted","user",user.id,{notice_version:FAIRNESS_NOTICE});
  }else{await eraseFairness(env,user.id);await audit(env,request,user,"hpi.fairness.withdrawn","user",user.id,{});}
  return json({ok:true,granted:data.grant});
}
if(path==="/hpi/catalogue"&&method==="GET")return json({ok:true,version:VERSION,notice_version:NOTICE,notice:RESEARCH_NOTICE,core_estimate_minutes:CORE_ESTIMATE_MINUTES,modules:catalogue(openGates(env))});
 if(path==="/hpi/attempts"&&method==="GET"){
  const a=await env.DB.prepare("SELECT "+fields+" FROM "+TABLE+" WHERE candidate_user_id=? AND expires_at>? ORDER BY created_at").bind(user.id,now()).all();
  return json({ok:true,attempts:await Promise.all((a.results||[]).map(r=>serialize(r,piiKey(env)).catch(()=>{const {answers_encrypted,result_encrypted,...metadata}=r;return {...metadata,result:null,payload_unavailable:"encrypted_content_unreadable"};})))});
 }
 if(path==="/hpi/start"&&method==="POST"){
  const form=typeof data?.module_id==="string"?publicForm(data.module_id):null;
  if(!form||data.notice_version!==NOTICE||data.consent!==true||!gateOpen(env,form.id))return bad("Select an available module and accept the research notice.");
  await env.DB.prepare("DELETE FROM "+TABLE+" WHERE candidate_user_id=? AND module_id=? AND form_version=? AND expires_at<=?").bind(user.id,form.id,VERSION,now()).run();
  const t=now();
  const newId=id("hpi");
// Counterbalancing: variant from the attempt id (random UUID), stored with the row.
const mod=getModule(form.id);const variant=mod.variants?mod.variants[parseInt(newId.replace(/[^0-9a-f]/gi,"").slice(-2)||"0",16)%mod.variants.length]:null;const inserted=await env.DB.prepare("INSERT INTO "+TABLE+" (id,candidate_user_id,module_id,form_version,form_variant,notice_version,status,created_at,updated_at,expires_at) SELECT ?,?,?,?,?,?,'draft',?,?,? WHERE "+active+" ON CONFLICT(candidate_user_id,module_id,form_version) DO NOTHING").bind(newId,user.id,form.id,VERSION,variant,NOTICE,t,t,expiry(),user.id).run();
// Audit metadata only: never answers or results.
if(inserted?.meta?.changes===1)await audit(env,request,user,"hpi.research.started","hpi_research_attempt",newId,{module_id:form.id,form_version:VERSION,notice_version:NOTICE});
  const row=await env.DB.prepare("SELECT "+fields+" FROM "+TABLE+" WHERE candidate_user_id=? AND module_id=? AND form_version=? AND expires_at>?").bind(user.id,form.id,VERSION,now()).first();
  if(!row)return bad("Attempt unavailable.",409);
  const current=publicForm(row.module_id,row.phase_index,row.form_variant);
  if(!current)return bad("Assessment version is unavailable.",409);
  let attempt;try{attempt=await serialize(row,piiKey(env),true);}catch{return bad("Your saved answers for this exercise can no longer be read. Delete your research data to start again.",409);}
  if(attempt.answers)attempt.answers=Object.fromEntries(current.items.map(i=>[i.id,attempt.answers[i.id]??null]));
  return json({ok:true,form:current,attempt,...(getModule(row.module_id).kind==="timed"?{untimed:await untimedAccommodation(env,user.id)}:{})});
 }
 if((path==="/hpi/save"||path==="/hpi/submit"||path==="/hpi/advance")&&method==="POST"){
  if(typeof data?.attempt_id!=="string"||data.attempt_id.length>80||!Number.isSafeInteger(data.revision)||data.revision<0)return bad("Invalid attempt.");
  const row=await env.DB.prepare("SELECT "+fields+" FROM "+TABLE+" WHERE id=? AND candidate_user_id=? AND expires_at>?").bind(data.attempt_id,user.id,now()).first();
  if(!row)return bad("Attempt unavailable.",404);
  if(row.status!=="draft"||row.revision!==data.revision||row.form_version!==VERSION)return bad("Attempt changed or is already submitted. Reopen it.",409);
  const form=publicForm(row.module_id,row.phase_index,row.form_variant);
  if(!form)return bad("Assessment version is unavailable.",409);
  if(!gateOpen(env,row.module_id))return bad("This exercise is not available at the moment. Your saved answers are kept.",409);
  let phaseAnswers;try{phaseAnswers=normalizeAnswers(row.module_id,data.answers,row.phase_index,row.form_variant);}catch{return bad("Invalid assessment responses.");}
  const advance=path==="/hpi/advance",submitted=path==="/hpi/submit";
  const last=row.phase_index===form.stages-1;
  if((advance&&last)||(submitted&&!last))return bad("Complete the stages in order.",409);
  const mod=getModule(row.module_id,row.form_variant),timedBlock=mod.kind==="timed"&&row.phase_index>=1;
  // A timed block is submitted once at its end: a mid-block save would move the issue time the timing check uses.
  if(timedBlock&&!(advance||submitted))return bad("Timed blocks are saved when the block ends.",409);
  if((advance||submitted)&&!timedBlock&&!Object.values(phaseAnswers).some(v=>v!==null))return bad("Answer at least one question in this stage.");
  const {_timing:prevTiming,...previous}=(await decode(row.answers_encrypted,piiKey(env)))||{};
  const timing={...(prevTiming||{})};
  if(timedBlock){
    const t=normalizeTiming(data.timing);
    if(!t)return bad("Timing information is missing or invalid.");
    // Server-side checks: active time cannot exceed wall time since this block was issued (row.updated_at), nor the
    // block limit unless an approved extended-time accommodation makes the block untimed.
    const unlimited=await untimedAccommodation(env,user.id),wall=Date.now()-Date.parse(row.updated_at);
    timing[row.phase_index]={...t,unlimited,valid:t.activeMs<=wall+2000&&(unlimited||t.activeMs<=mod.blockMs+1500)};
  }
  const answers={...previous,...phaseAnswers};
  const result=submitted?score(row.module_id,answers,row.form_variant,timing):null;
  const nextPhase=row.phase_index+(advance?1:0);
  const encrypted=await encryptField(JSON.stringify(mod.kind==="timed"?{...answers,_timing:timing}:answers),piiKey(env));
  const encryptedResult=result?await encryptField(JSON.stringify(result),piiKey(env)):null;
  const r=await env.DB.prepare("UPDATE "+TABLE+" SET answers_encrypted=?,result_encrypted=?,status=?,phase_index=?,revision=revision+1,updated_at=? WHERE id=? AND candidate_user_id=? AND status='draft' AND revision=? AND expires_at>? AND "+active).bind(encrypted,encryptedResult,submitted?"submitted":"draft",nextPhase,now(),row.id,user.id,row.revision,now(),user.id).run();
  if(r?.meta?.changes!==1)return bad("Attempt changed. Reopen it.",409);
await audit(env,request,user,submitted?"hpi.research.submitted":advance?"hpi.research.stage_advanced":"hpi.research.saved","hpi_research_attempt",row.id,{module_id:row.module_id,form_version:row.form_version,phase_index:nextPhase});
  return json({ok:true,revision:row.revision+1,result,...(advance?{form:publicForm(row.module_id,nextPhase,row.form_variant),phase_index:nextPhase}:{})});
 }
 return bad("Not found.",404);
}

```

## Appendix F2: `functions/api/admin/hpi-research.js`

```js
// HPIS research statistics for item calibration (admin only).
//
// Aggregate only: no candidate ids, codes, names or individual answers leave this endpoint. Only attempts
// made under a research notice that discloses aggregate analysis (STATS_NOTICES) are included, and per-item
// detail for a module is suppressed until it has MIN_CELL submissions. Classical test theory only: item
// facility (proportion matching the key) and corrected item-rest correlation. These are descriptive pilot
// statistics on a self-selected sample, not norms, reliability evidence or calibrated IRT parameters.
import { requireAdmin, json, bad, adminError, now } from "./_shared.js";
import { audit, piiKey } from "../_handlers/_shared.js";
import { decryptField } from "../_crypto.js";
import { MODULES, VERSION, STATS_NOTICES, getModule } from "../_hpi_catalog.js";
import { difScreen, ageBand, MIN_GROUP, FLAG_ABS_D, FAIRNESS_NOTICE } from "../_hpi_fairness.js";
import { score as scoreModule, orderViolations } from "../_hpi_engine.js";

export const MIN_CELL = 10;
const MAX_ROWS = 5000;

const correct = (item, answer) => answer != null && (item.kind === "order" ? orderViolations(item, answer) === 0 : answer === item.key);
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function pearson(x, y) {
  const n = x.length; if (n < 3) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
const round = (v, d = 3) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

export function moduleStats(module, submissions) {
  const n = submissions.length;
  const minutes = submissions.map(s => s.minutes).filter(v => Number.isFinite(v) && v >= 0);
  const base = { module_id: module.id, title: module.title, kind: module.kind, submissions: n, median_minutes_start_to_submit: n >= MIN_CELL ? round(median(minutes), 1) : null };
  if (n < MIN_CELL) return { ...base, suppressed: true, reason: `Fewer than ${MIN_CELL} submissions under the current notice.` };
  const items = module.items.map(item => {
    const answers = submissions.map(s => s.answers?.[item.id] ?? null);
    const answered = answers.filter(a => a !== null).length;
    const options = Object.fromEntries(item.options.map(o => [o.label, 0]));
    for (const a of answers) if (typeof a === "string") { const o = item.options.find(x => x.id === a); if (o) options[o.label]++; }
    if (module.kind === "preferences" || module.kind === "inventory") return { item_id: item.id, answered, omitted: n - answered, options };
    // Correctness per submission uses that submission's variant (counterbalanced forms have variant-specific keys).
    const scores = submissions.map((s, i) => (correct(getModule(module.id, s.variant).items.find(x => x.id === item.id), answers[i]) ? 1 : 0));
    return { item_id: item.id, domain: item.domain, answered, omitted: n - answered, facility: round(scores.reduce((a, b) => a + b, 0) / n), ...(item.kind === "order" ? {} : { options }), _scores: scores };
  });
  if (module.kind !== "preferences" && module.kind !== "inventory") {
    const totals = submissions.map((_, i) => items.reduce((t, it) => t + it._scores[i], 0));
    for (const it of items) { it.item_rest_r = round(pearson(it._scores, totals.map((t, i) => t - it._scores[i]))); delete it._scores; }
  }
  return { ...base, suppressed: false, items };
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;
  try {
    let rows = [];
    try {
      rows = (await env.DB.prepare(`SELECT candidate_user_id, module_id, form_variant, notice_version, answers_encrypted, created_at, updated_at FROM hpi_research_attempts WHERE status='submitted' AND form_version=? AND expires_at>? AND notice_version IN (${STATS_NOTICES.map(() => "?").join(",")}) LIMIT ${MAX_ROWS}`).bind(VERSION, now(), ...STATS_NOTICES).all()).results || [];
    } catch (e) { if (!/no such table/i.test(String(e?.message))) throw e; }
    const key = piiKey(env);
    let unreadable = 0;
    const byModule = new Map();
    for (const r of rows) {
      let answers = null;
      try { const p = key && r.answers_encrypted?.startsWith("enc:") ? await decryptField(r.answers_encrypted, key) : null; answers = p && p !== r.answers_encrypted ? JSON.parse(p) : null; } catch { answers = null; }
      if (!answers) { unreadable++; continue; }
      const minutes = (Date.parse(r.updated_at) - Date.parse(r.created_at)) / 60000;
      if (!byModule.has(r.module_id)) byModule.set(r.module_id, []);
      byModule.get(r.module_id).push({ answers, minutes, variant: r.form_variant, uid: r.candidate_user_id });
    }
    const modules = MODULES.filter(m => m.status === "research").map(m => moduleStats(m, byModule.get(m.id) || []));
    // Rule-change observation for L02, aggregated (count of candidates by obsolete-rule responses).
    const l02 = byModule.get("L02") || [];
    const ruleChange = l02.length >= MIN_CELL ? { conflict_trials: scoreModule("L02", {}).ruleChange.conflictTrials, distribution: l02.reduce((acc, s) => { const k = String(scoreModule("L02", s.answers, s.variant).ruleChange.obsoleteRuleResponses); acc[k] = (acc[k] || 0) + 1; return acc; }, {}) } : null;
    // Fairness research (separate switch and opt-in): group totals only, never ids, never per-candidate values.
    let fairness = null;
    if (env.ENABLE_HPI_FAIRNESS_RESEARCH === "true") {
      let consented = [];
      try { consented = (await env.DB.prepare("SELECT f.candidate_user_id AS uid, p.gender, p.ee_classification, p.age FROM hpi_fairness_consents f JOIN candidate_profiles p ON p.user_id=f.candidate_user_id WHERE f.notice_version=?").bind(FAIRNESS_NOTICE).all()).results || []; }
      catch (e) { if (!/no such table/i.test(String(e?.message))) throw e; }
      const groups = new Map();
      const plain = async v => { if (!v) return null; const d = v.startsWith?.("enc:") ? await decryptField(v, key) : v; return d && !String(d).startsWith("enc:") ? String(d).trim() || null : null; };
      for (const c of consented) groups.set(c.uid, { gender: await plain(c.gender), ee_classification: await plain(c.ee_classification), age_band: ageBand(Number(c.age)) });
      fairness = { opted_in: consented.length, min_group: MIN_GROUP, flag_abs_d: FLAG_ABS_D, modules: [] };
      for (const m of MODULES.filter(x => x.status === "research" && ["task", "staged"].includes(x.kind))) {
        const subs = (byModule.get(m.id) || []).filter(s => groups.has(s.uid));
        if (subs.length < 2 * MIN_GROUP) continue;
        const ids = m.items.map(i => i.id);
        const scored = subs.map(s => { const mod = getModule(m.id, s.variant); return { uid: s.uid, scores: Object.fromEntries(mod.items.map(i => [i.id, correct(i, s.answers[i.id] ?? null) ? 1 : 0])) }; });
        fairness.modules.push({ module_id: m.id, title: m.title, n: subs.length,
          variables: ["gender", "ee_classification", "age_band"].map(v => difScreen(ids, scored.map(r => ({ scores: r.scores, group: groups.get(r.uid)[v] })), v)) });
      }
    }
    let invites = [];
    try { invites = (await env.DB.prepare("SELECT p.candidate_code, i.invited_at FROM hpi_research_invites i LEFT JOIN candidate_profiles p ON p.user_id=i.candidate_user_id ORDER BY i.invited_at DESC LIMIT 500").all()).results || []; }
    catch (e) { if (!/no such table/i.test(String(e?.message))) throw e; }
    await audit(env, request, auth.user, "admin.hpi.research_stats_viewed", "hpi_research", VERSION, { submissions: rows.length - unreadable });
    return json({ ok: true, invites, fairness, research_enabled: env.ENABLE_HPI_RESEARCH === "true", open_enrolment: env.HPI_OPEN_ENROLMENT === "true", form_version: VERSION, notices: STATS_NOTICES, min_cell: MIN_CELL, unreadable, truncated: rows.length >= MAX_ROWS, modules, l02_obsolete_rule_distribution: ruleChange,
      caveat: "Descriptive pilot statistics on a self-selected sample. Not norms, reliability or validity evidence. Minutes are calendar time from start to submission (includes breaks), not processing speed." });
  } catch (error) {
    return adminError(env, error);
  }
}

// Pilot invitations by candidate code. Invitation makes the optional research available to that
// candidate (when ENABLE_HPI_RESEARCH is on); it changes nothing else about their account.
export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(env, request);
  if (!auth.ok) return auth.response;
  try {
    const data = await request.json().catch(() => ({}));
    const action = data?.action, code = typeof data?.candidate_code === "string" ? data.candidate_code.trim().toUpperCase().slice(0, 40) : "";
    if (!["invite", "revoke"].includes(action) || !code) return bad("Choose invite or revoke and give a candidate code.");
    const cand = await env.DB.prepare("SELECT u.id FROM candidate_profiles p JOIN users u ON u.id=p.user_id WHERE UPPER(p.candidate_code)=? AND u.role='candidate' AND u.status NOT IN ('deleted','suspended','rejected')").bind(code).first();
    if (!cand) return bad("No active candidate has that code.", 404);
    const r = action === "invite"
      ? await env.DB.prepare("INSERT INTO hpi_research_invites (candidate_user_id, invited_by, invited_at) VALUES (?, ?, ?) ON CONFLICT(candidate_user_id) DO NOTHING").bind(cand.id, auth.user.id, now()).run()
      : await env.DB.prepare("DELETE FROM hpi_research_invites WHERE candidate_user_id=?").bind(cand.id).run();
    const changed = (r?.meta?.changes || 0) > 0;
    if (changed) await audit(env, request, auth.user, action === "invite" ? "admin.hpi.pilot_invited" : "admin.hpi.pilot_revoked", "user", cand.id, { candidate_code: code });
    return json({ ok: true, changed, message: changed ? (action === "invite" ? `${code} is invited to the HPIS pilot.` : `${code} is no longer invited. Their existing research data is unchanged.`) : (action === "invite" ? `${code} was already invited.` : `${code} was not invited.`) });
  } catch (error) {
    return adminError(env, error);
  }
}

```

## Appendix G: `docs/hpis/provenance/ipip-50-big-five-markers.json`

```json
{
 "instrument": "50-item IPIP representation of Goldberg's (1992) Big-Five factor markers",
 "source_url": "https://ipip.ori.org/new_ipip-50-item-scale.htm",
 "scoring_url": "https://ipip.ori.org/newScoringInstructions.htm",
 "permission_url": "https://ipip.ori.org/newPermission.htm",
 "permission_text": "Because the IPIP has been placed in the public domain, permission has already been automatically granted for any person to use IPIP items, scales, and inventories for any purpose, commercial or non-commercial.",
 "retrieved": "2026-11-24",
 "factors": {
  "1": "Extraversion",
  "2": "Agreeableness",
  "3": "Conscientiousness",
  "4": "Emotional Stability",
  "5": "Intellect/Imagination"
 },
 "response_scale": [
  "Very Inaccurate",
  "Moderately Inaccurate",
  "Neither Accurate Nor Inaccurate",
  "Moderately Accurate",
  "Very Accurate"
 ],
 "scoring": "+ keyed: 1..5 for Very Inaccurate..Very Accurate; - keyed: 5..1. Sum per factor.",
 "{{brand}}_edits": [
  "Respondent instruction: removed 'of the same sex as you are' and the source's confidentiality sentence ({{BRAND}}'s own research notice applies). Item wording, order and keys unchanged."
 ],
 "items": [
  {
   "n": 1,
   "text": "Am the life of the party.",
   "factor": 1,
   "key": "+"
  },
  {
   "n": 2,
   "text": "Feel little concern for others.",
   "factor": 2,
   "key": "-"
  },
  {
   "n": 3,
   "text": "Am always prepared.",
   "factor": 3,
   "key": "+"
  },
  {
   "n": 4,
   "text": "Get stressed out easily.",
   "factor": 4,
   "key": "-"
  },
  {
   "n": 5,
   "text": "Have a rich vocabulary.",
   "factor": 5,
   "key": "+"
  },
  {
   "n": 6,
   "text": "Don't talk a lot.",
   "factor": 1,
   "key": "-"
  },
  {
   "n": 7,
   "text": "Am interested in people.",
   "factor": 2,
   "key": "+"
  },
  {
   "n": 8,
   "text": "Leave my belongings around.",
   "factor": 3,
   "key": "-"
  },
  {
   "n": 9,
   "text": "Am relaxed most of the time.",
   "factor": 4,
   "key": "+"
  },
  {
   "n": 10,
   "text": "Have difficulty understanding abstract ideas.",
   "factor": 5,
   "key": "-"
  },
  {
   "n": 11,
   "text": "Feel comfortable around people.",
   "factor": 1,
   "key": "+"
  },
  {
   "n": 12,
   "text": "Insult people.",
   "factor": 2,
   "key": "-"
  },
  {
   "n": 13,
   "text": "Pay attention to details.",
   "factor": 3,
   "key": "+"
  },
  {
   "n": 14,
   "text": "Worry about things.",
   "factor": 4,
   "key": "-"
  },
  {
   "n": 15,
   "text": "Have a vivid imagination.",
   "factor": 5,
   "key": "+"
  },
  {
   "n": 16,
   "text": "Keep in the background.",
   "factor": 1,
   "key": "-"
  },
  {
   "n": 17,
   "text": "Sympathize with others' feelings.",
   "factor": 2,
   "key": "+"
  },
  {
   "n": 18,
   "text": "Make a mess of things.",
   "factor": 3,
   "key": "-"
  },
  {
   "n": 19,
   "text": "Seldom feel blue.",
   "factor": 4,
   "key": "+"
  },
  {
   "n": 20,
   "text": "Am not interested in abstract ideas.",
   "factor": 5,
   "key": "-"
  },
  {
   "n": 21,
   "text": "Start conversations.",
   "factor": 1,
   "key": "+"
  },
  {
   "n": 22,
   "text": "Am not interested in other people's problems.",
   "factor": 2,
   "key": "-"
  },
  {
   "n": 23,
   "text": "Get chores done right away.",
   "factor": 3,
   "key": "+"
  },
  {
   "n": 24,
   "text": "Am easily disturbed.",
   "factor": 4,
   "key": "-"
  },
  {
   "n": 25,
   "text": "Have excellent ideas.",
   "factor": 5,
   "key": "+"
  },
  {
   "n": 26,
   "text": "Have little to say.",
   "factor": 1,
   "key": "-"
  },
  {
   "n": 27,
   "text": "Have a soft heart.",
   "factor": 2,
   "key": "+"
  },
  {
   "n": 28,
   "text": "Often forget to put things back in their proper place.",
   "factor": 3,
   "key": "-"
  },
  {
   "n": 29,
   "text": "Get upset easily.",
   "factor": 4,
   "key": "-"
  },
  {
   "n": 30,
   "text": "Do not have a good imagination.",
   "factor": 5,
   "key": "-"
  },
  {
   "n": 31,
   "text": "Talk to a lot of different people at parties.",
   "factor": 1,
   "key": "+"
  },
  {
   "n": 32,
   "text": "Am not really interested in others.",
   "factor": 2,
   "key": "-"
  },
  {
   "n": 33,
   "text": "Like order.",
   "factor": 3,
   "key": "+"
  },
  {
   "n": 34,
   "text": "Change my mood a lot.",
   "factor": 4,
   "key": "-"
  },
  {
   "n": 35,
   "text": "Am quick to understand things.",
   "factor": 5,
   "key": "+"
  },
  {
   "n": 36,
   "text": "Don't like to draw attention to myself.",
   "factor": 1,
   "key": "-"
  },
  {
   "n": 37,
   "text": "Take time out for others.",
   "factor": 2,
   "key": "+"
  },
  {
   "n": 38,
   "text": "Shirk my duties.",
   "factor": 3,
   "key": "-"
  },
  {
   "n": 39,
   "text": "Have frequent mood swings.",
   "factor": 4,
   "key": "-"
  },
  {
   "n": 40,
   "text": "Use difficult words.",
   "factor": 5,
   "key": "+"
  },
  {
   "n": 41,
   "text": "Don't mind being the center of attention.",
   "factor": 1,
   "key": "+"
  },
  {
   "n": 42,
   "text": "Feel others' emotions.",
   "factor": 2,
   "key": "+"
  },
  {
   "n": 43,
   "text": "Follow a schedule.",
   "factor": 3,
   "key": "+"
  },
  {
   "n": 44,
   "text": "Get irritated easily.",
   "factor": 4,
   "key": "-"
  },
  {
   "n": 45,
   "text": "Spend time reflecting on things.",
   "factor": 5,
   "key": "+"
  },
  {
   "n": 46,
   "text": "Am quiet around strangers.",
   "factor": 1,
   "key": "-"
  },
  {
   "n": 47,
   "text": "Make people feel at ease.",
   "factor": 2,
   "key": "+"
  },
  {
   "n": 48,
   "text": "Am exacting in my work.",
   "factor": 3,
   "key": "+"
  },
  {
   "n": 49,
   "text": "Often feel blue.",
   "factor": 4,
   "key": "-"
  },
  {
   "n": 50,
   "text": "Am full of ideas.",
   "factor": 5,
   "key": "+"
  }
 ]
}
```

## Appendix H1: `public/candidate/js/models/hpi.js`

```js
// Human Potential (HPIS) in the candidate portal: pure helpers shared by the overview and the runner.
// No DOM except the SVG builder at the end, which draws picture items from a structured spec (never markup strings).

// Consent given on the overview in THIS page session (never stored). A candidate with an attempt under the current
// notice has already agreed; anyone else is sent back to the overview to read the notice first.
let consentedNotice = null;
export const rememberConsent = notice => { consentedNotice = notice; };
export const hasConsent = (catalog, attempts) => consentedNotice === catalog.notice_version || attempts.some(a => a.notice_version === catalog.notice_version);

// Readable names for the observation groups the server reports.
const LABELS = { proportion: "Percentages and proportions", data: "Reading data", rate: "Rates", change: "Change over time", inference: "What follows from the text", instruction: "Following instructions", synthesis: "Combining information", sequence: "Sequences", transformation: "Transformations", classification: "Odd one out", matrix: "Picture grids", sequencing: "Putting steps in order", condition: "If-then rules", constraints: "Working within limits", causal: "Cause and effect", evidence: "Weighing evidence", assumption: "Hidden assumptions", calibration: "How sure to be", checking: "Record checking", planning: "Planning", diagnosis: "Finding the cause", information: "Missing information", verification: "Checking before acting", escalation: "Raising issues early", accountability: "Owning mistakes", prioritization: "Priorities", handoff: "Handing over work", privacy: "Personal information", conflict: "Conflicts", communication: "Communication", feedback: "Feedback", baseline: "Stage 1: from examples", application: "Stage 2: after the explanation", transfer: "Stage 3: new context", original_rule: "Before the rule changed", after_change: "After the rule changed" };
export const label = d => LABELS[d] || String(d).replace(/_/g, " ");

export const isAnswered = (answers, id) => answers[id] !== undefined && answers[id] !== null;
export const answeredCount = (form, answers) => form.items.filter(i => isAnswered(answers, i.id)).length;

// Inventory (P01) is paged five statements to a screen; everything else is one question to a screen.
export const pageSize = form => (form.kind === "inventory" ? 5 : 1);
export const pageCount = form => Math.ceil(form.items.length / pageSize(form));
export const pageItems = (form, page) => form.items.slice(page * pageSize(form), (page + 1) * pageSize(form));

// Status for an overview card.
export function cardState(module, attempt) {
  if (module.status !== "research") return { tag: "In development", action: null };
  if (attempt?.payload_unavailable) return { tag: "Saved answers can no longer be read", action: null };
  if (attempt?.status === "submitted") return { tag: "Completed", action: "View result" };
  if (attempt) return { tag: "In progress", action: "Continue" };
  return { tag: `${module.itemCount} ${module.itemCount === 1 ? "question" : "questions"}`, action: "Start" };
}

// "Full Human Potential profile" (product decision 2026-11-24): the go-live profile score counts 65% and the optional
// core exercises 35%. Shown beside the go-live score, never instead of it, and never used to gate anything.
export const HPI_SHARE = 0.35;
export function fullProfile(profileScore, coreDone, coreTotal) {
  const p = Math.max(0, Math.min(100, Number(profileScore) || 0)), c = coreTotal ? Math.min(coreDone, coreTotal) / coreTotal : 0;
  return Math.round(p * (1 - HPI_SHARE) + c * 100 * HPI_SHARE);
}

// ── Picture items (C03) ───────────────────────────────────────────────────────
const NS = "http://www.w3.org/2000/svg";
let seq = 0;
const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
// Patterns are carried by shape, number and fill pattern; colour follows the text colour, so nothing depends on colour.
export function cellSvg(spec, size = 72) {
  const svg = svgEl("svg", { viewBox: "0 0 90 90", width: size, height: size, "aria-hidden": "true", focusable: "false", class: "hpi-cell" });
  svg.append(svgEl("rect", { x: 1, y: 1, width: 88, height: 88, fill: "none", stroke: "currentColor", "stroke-opacity": "0.25" }));
  if (!spec) { const t = svgEl("text", { x: 45, y: 57, "text-anchor": "middle", "font-size": 36, fill: "currentColor" }); t.textContent = "?"; svg.append(t); return svg; }
  const pid = "hpi-stripe-" + (++seq);
  if (spec.fill === "striped") { const defs = svgEl("defs", {}), pat = svgEl("pattern", { id: pid, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }); pat.append(svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "currentColor", "stroke-width": 3 })); defs.append(pat); svg.append(defs); }
  const fill = spec.fill === "solid" ? "currentColor" : spec.fill === "striped" ? `url(#${pid})` : "none";
  // Fixed layouts with clear gaps so separate shapes never touch (three squares must not read as one bar).
  const LAYOUT = { 1: [[45, 45]], 2: [[26, 45], [64, 45]], 3: [[45, 24], [24, 64], [66, 64]] }, r = spec.count === 1 ? 18 : spec.count === 2 ? 13 : 11;
  for (const [cx, cy] of LAYOUT[spec.count] || []) {
    const common = { fill, stroke: "currentColor", "stroke-width": 3 };
    if (spec.shape === "circle") svg.append(svgEl("circle", { cx, cy, r, ...common }));
    else if (spec.shape === "square") svg.append(svgEl("rect", { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, ...common }));
    else svg.append(svgEl("polygon", { points: `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`, ...common }));
  }
  return svg;
}

```

## Appendix H2: `public/candidate/js/views/human-potential.js`

```js
// Human Potential overview (#/human-potential): optional, private exercises in the portal's own layout. Consent once, a
// short "Start here" set first, everything else folded away, data rights at the end. Results never reach employers.
import { html, raw, plural } from "../core/format.js";
import { registerActions, runAction } from "../core/actions.js";
import { page } from "../ui/page.js";
import { statusTag } from "../ui/status-tag.js";
import { confirmDialog } from "../ui/dialog.js";
import { toast } from "../ui/toast.js";
import { runtime } from "../app/runtime.js";
import { hasConsent, rememberConsent, label } from "../models/hpi.js";

export const title = "Human Potential";

export async function load() {
  const api = runtime.api;
  const [catalog, attempts, fairness] = await Promise.all([api.get("/api/hpi/catalogue"), api.get("/api/hpi/attempts"), api.get("/api/hpi/fairness").catch(() => null)]);
  return { catalog, attempts: attempts.attempts || [], fairness, focusId: null };
}

const attemptFor = (m, mod) => m.attempts.find(a => a.module_id === mod.id && a.form_version === m.catalog.version);
const earlierDone = (m, mod) => m.attempts.some(a => a.module_id === mod.id && a.form_version !== m.catalog.version && a.status === "submitted");
function stateOf(m, mod) {
  const a = attemptFor(m, mod);
  if (mod.status !== "research") return { status: "soon", hint: mod.reason };
  if (a?.payload_unavailable) return { status: "unreadable", hint: "Your saved answers can no longer be read. Delete your Human Potential data below to start again." };
  if (a?.status === "submitted") return { status: "done", href: true, hint: "Private result" };
  if (a) return { status: "progress", href: true, hint: "Your answers are saved" };
  if (earlierDone(m, mod)) return { status: "todo", href: true, hint: "You completed an earlier version. A new version is available." };
  return { status: "todo", href: true, hint: `${plural(mod.itemCount, "question", "questions")} · about ${mod.minutes} minutes` };
}

function moduleList(m, mods, idPrefix, consented) {
  return html`<ul class="tasks" aria-label="${idPrefix === "core" ? "Start here" : "More exercises"}">${mods.map((mod, i) => {
    const s = stateOf(m, mod), link = s.href && consented;
    return html`<li class="task">
      <div class="task__main">
        ${link ? html`<a class="task__name" href="#/human-potential/${mod.id}" aria-describedby="${idPrefix}-${i}-status">${mod.title}</a>` : html`<span class="task__name">${mod.title}</span>`}
        <span class="task__hint">${s.hint}</span>
      </div>
      <span id="${idPrefix}-${i}-status">${statusTag("hpi", s.status)}</span>
    </li>`;
  })}</ul>`;
}

function consentCard(m) {
  return html`<section class="card" aria-labelledby="hpi-consent-h"><h2 id="hpi-consent-h" tabindex="-1">Before you start</h2>
    <ul>
      <li>Optional and private to you. Employers never see it.</li>
      <li>It does not change your profile score, proof badges or marketplace visibility.</li>
      <li>Kept for up to 90 days. Download or delete it at any time.</li>
      <li>{{BRAND}} staff can see that you took part, never your answers.</li>
    </ul>
    <details class="reveal"><summary>Read the full notice</summary><p>${m.catalog.notice}</p></details>
    <form data-action="hpi-consent" novalidate>
      <label class="choice" for="hpi-agree"><input type="checkbox" id="hpi-agree" name="agree" required><span>I choose to take part in these optional exercises.</span></label>
      <p class="field__error" id="hpi-agree-error" hidden>Tick the box to continue, or leave this page. Nothing changes if you do not take part.</p>
      <div class="btn-row"><button type="submit" class="btn btn--primary">Continue</button></div>
    </form></section>`;
}

function fairnessCard(m) {
  const f = m.fairness;
  if (!f || !(f.available || f.granted)) return "";
  return html`<section class="card" aria-labelledby="hpi-fair-h"><h2 id="hpi-fair-h" tabindex="-1">Fairness research (optional)</h2>
    <p>${f.notice}</p>
    <p>${statusTag("hpi", f.granted ? "done" : "todo", { label: f.granted ? "You agreed" : "Not agreed" })}</p>
    <div class="btn-row">${f.granted
      ? html`<button type="button" class="btn btn--secondary" data-action="hpi-fair" data-grant="0">Withdraw from fairness research</button>`
      : html`<button type="button" class="btn btn--secondary" data-action="hpi-fair" data-grant="1" data-notice="${f.notice_version}">I agree to fairness research</button>`}</div></section>`;
}

export function render(m) {
  const consented = hasConsent(m.catalog, m.attempts);
  const core = m.catalog.modules.filter(x => x.core), more = m.catalog.modules.filter(x => !x.core);
  const done = core.filter(x => attemptFor(m, x)?.status === "submitted" || earlierDone(m, x)).length;
  const open = more.filter(x => x.status === "research").length;
  return html`${page({ title: "Human Potential", crumbs: [{ label: "Home", href: "#/" }, { label: "Human Potential" }],
      intro: "Short exercises about how you work with information, solve problems and make decisions. Optional, untimed unless marked, and private to you: they never change your profile score, proof badges or what employers see." })}
    ${consented ? "" : consentCard(m)}
    <section class="card" aria-labelledby="hpi-core-h">
      <h2 id="hpi-core-h" tabindex="-1">${done === core.length ? "Start here · complete" : `Start here · about ${m.catalog.core_estimate_minutes} minutes`}</h2>
      <div class="stand__score"><span>Core exercises</span><span class="num">${done} of ${core.length}</span></div>
      <progress max="${core.length}" value="${done}" aria-label="${done} of ${core.length} core exercises completed"></progress>
      <p class="muted">Numbers, checking records, workplace controls and your work preferences. Each one saves as you go, so you can stop and come back.</p>
      ${moduleList(m, core, "core", consented)}
    </section>
    <section class="card" aria-labelledby="hpi-more-h">
      <h2 id="hpi-more-h" tabindex="-1">More exercises</h2>
      <p class="muted">${open} more are available. Take any of them when it suits you. None is required.</p>
      <details class="reveal"${m.catalog.modules.some(x => !x.core && attemptFor(m, x)) ? raw(" open") : ""}><summary>Show more exercises</summary>
        ${moduleList(m, more, "more", consented)}
      </details>
    </section>
    ${fairnessCard(m)}
    <section class="card" aria-labelledby="hpi-data-h"><h2 id="hpi-data-h" tabindex="-1">Your Human Potential data</h2>
      <p>Download everything you have answered, or delete it. Deleting it does not affect your {{BRAND}} account, profile or proof.</p>
      <div class="btn-row"><button type="button" class="btn btn--secondary" data-action="hpi-export">Download my answers</button>
        <button type="button" class="btn btn--danger" data-action="hpi-erase">Delete my Human Potential data</button></div>
    </section>`;
}

export function afterRender(m) { if (m.focusId) document.getElementById(m.focusId)?.focus(); m.focusId = null; }
const model = () => runtime.current?.model;
const again = async focusId => { await runtime.reload(); const m = model(); if (m && focusId) { m.focusId = focusId; afterRender(m); } };

registerActions({
  "hpi-consent": form => {
    const m = model(); if (!m) return;
    const box = form.querySelector("#hpi-agree"), err = form.querySelector("#hpi-agree-error");
    if (!box.checked) { err.hidden = false; box.setAttribute("aria-describedby", "hpi-agree-error"); box.focus(); return; }
    rememberConsent(m.catalog.notice_version);
    m.focusId = "hpi-core-h"; runtime.rerender({ focus: false });
  },
  "hpi-fair": async btn => {
    const grant = btn.dataset.grant === "1";
    await runAction(btn, grant ? "Saving…" : "Withdrawing…", async () => {
      try { await runtime.api.post("/api/hpi/fairness", grant ? { grant: true, notice_version: btn.dataset.notice } : { grant: false }); toast(grant ? "Thank you. You can withdraw at any time." : "You have withdrawn from fairness research."); await again("hpi-fair-h"); }
      catch (e) { toast(e?.message || "That did not work. Nothing was changed.", "bad"); }
    });
  },
  "hpi-export": async btn => {
    await runAction(btn, "Preparing…", async () => {
      try {
        const data = await runtime.api.get("/api/hpi/export");
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = "{{brand}}-human-potential.json"; a.click(); URL.revokeObjectURL(url);
        toast("Your download is ready.");
      } catch (e) { toast(e?.message || "That did not work.", "bad"); }
    });
  },
  "hpi-erase": async () => {
    const ok = await confirmDialog({
      title: "Delete your Human Potential data?",
      body: html`<p>This deletes every Human Potential answer and result, and your fairness research agreement. It cannot be undone. Your {{BRAND}} account, profile and proof are not affected.</p>`,
      confirmLabel: "Delete", startOn: "cancel",
      onConfirm: () => runtime.api.post("/api/hpi/erase", { confirm: "DELETE HPI" }),
    });
    if (ok) { toast("Your Human Potential data is deleted."); await again("hpi-core-h"); }
  },
});
export { label };

```

## Appendix H3: `public/candidate/js/views/human-potential-run.js`

```js
// Human Potential runner (#/human-potential/:id). Same flow as the proof runner: an intro, one question to a screen with a
// numbered index, autosave whenever you move, a review page before you finish, then the result. Blank answers are allowed.
// Staged exercises show each stage's instructions before its questions; the timed exercise (E02) runs its blocks in place.
import { html, raw, plural } from "../core/format.js";
import { registerActions, runAction } from "../core/actions.js";
import { confirmDialog } from "../ui/dialog.js";
import { toast } from "../ui/toast.js";
import { runtime } from "../app/runtime.js";
import { hasConsent, label, isAnswered, answeredCount, pageSize, pageCount, pageItems, cellSvg } from "../models/hpi.js";

export const title = "Human Potential";
const BACK = "#/human-potential";

export async function load(ctx) {
  const api = runtime.api, id = String(ctx.args?.id || "");
  const [catalog, att] = await Promise.all([api.get("/api/hpi/catalogue"), api.get("/api/hpi/attempts")]);
  const mod = catalog.modules.find(x => x.id === id);
  if (!mod || mod.status !== "research") return { missing: true };
  if (!hasConsent(catalog, att.attempts || [])) return { needsConsent: true };
  const r = await api.post("/api/hpi/start", { module_id: id, notice_version: catalog.notice_version, consent: true });
  const a = r.attempt, answers = { ...(a.answers || {}) };
  const m = { id, mod, form: r.form, attemptId: a.id, revision: a.revision, answers, page: 0, untimed: !!r.untimed, dirty: false, save: "saved", result: a.result, focusId: null, error: null };
  if (a.status === "submitted") m.stage = "result";
  else if (m.form.kind === "timed") m.stage = "timed";
  else {
    const started = answeredCount(m.form, answers) > 0 || m.form.phase > 0;
    m.stage = started ? "questions" : "intro";
    if (started) { const first = m.form.items.findIndex(i => !isAnswered(answers, i.id)); m.page = first < 0 ? pageCount(m.form) - 1 : Math.floor(first / pageSize(m.form)); }
  }
  return m;
}

// ── Pieces ────────────────────────────────────────────────────────────────────
const letter = i => String.fromCharCode(65 + i);
const stageLine = f => (f.stage ? `Stage ${f.phase + 1} of ${f.stages}: ${f.stage.title}` : "");
const saveText = m => (m.save === "saving" ? "Saving…" : m.save === "failed" ? "Not saved yet. Check your connection; your answers are still on this page." : m.dirty ? "Changes not saved yet" : "All answers saved");

function head(m) {
  return html`<div class="page-head"><nav aria-label="Breadcrumb"><ol class="crumbs"><li><a href="#/">Home</a></li><li><a href="${BACK}">Human Potential</a></li><li><span aria-current="page">${m.mod.title}</span></li></ol></nav>
    <h1 id="page-title" tabindex="-1">${m.mod.title}</h1><p class="page-head__intro">${m.mod.construct}</p></div>`;
}

function introCard(m) {
  const f = m.form, n = f.items.length;
  return html`<section class="card" aria-labelledby="hpi-intro-h"><h2 id="hpi-intro-h" tabindex="-1">${f.stage ? stageLine(f) : "Before you begin"}</h2>
    ${f.stage ? html`<p>${f.stage.instruction}</p>` : ""}
    ${f.instructions ? html`<p class="notice">${f.instructions}</p>` : ""}
    <ul>
      <li>${plural(n, f.kind === "inventory" ? "statement" : "question", f.kind === "inventory" ? "statements" : "questions")}${f.stage ? " in this stage" : ""}${f.kind === "inventory" ? ", five to a screen" : ", one to a screen"}.</li>
      <li>No time limit. Your answers save each time you move to another question.</li>
      <li>You may leave a question blank. ${f.stage && f.phase < f.stages - 1 ? "Once you finish a stage you cannot go back to it." : "You can review everything before you finish."}</li>
      ${f.kind === "inventory" ? html`<li>There are no right or wrong answers here, and no better or worse result.</li>` : ""}
    </ul>
    <div class="btn-row"><button type="button" class="btn btn--primary" data-action="hpi-begin">${f.stage && f.phase > 0 ? "Start this stage" : "Start"}</button>
      <a class="btn btn--secondary" href="${BACK}">Back to Human Potential</a></div></section>`;
}

function runBar(m) {
  return html`<div class="run-bar run-bar--sticky run-bar--page run-bar--question"><p class="muted" id="hpi-save" aria-live="off">${saveText(m)}</p>
    <p class="notice notice--bad" id="hpi-save-alert" role="alert"${m.save === "failed" ? "" : raw(" hidden")}>${m.save === "failed" ? saveText(m) : ""}</p></div>
    <div class="run-bar__more"><div class="btn-row run-bar__actions"><button type="button" class="btn btn--ghost" data-action="hpi-leave">Save and leave</button></div></div>`;
}

function indexNav(m) {
  const f = m.form, pages = pageCount(f);
  return html`<nav aria-label="Questions"><ol class="qindex">${Array.from({ length: pages }, (_, p) => {
    const its = pageItems(f, p), done = its.every(i => isAnswered(m.answers, i.id)), here = m.stage === "questions" && m.page === p;
    const name = pageSize(f) > 1 ? `Statements ${p * pageSize(f) + 1} to ${p * pageSize(f) + its.length}` : `Question ${p + 1}`;
    return html`<li><button type="button" class="qindex__btn${done ? " qindex__btn--done" : ""}" data-action="hpi-goto" data-page="${p}"${here ? raw(' aria-current="step"') : ""}><span aria-hidden="true">${p + 1}</span><span class="visually-hidden">${name}, ${done ? "answered" : "not answered"}${here ? ", current" : ""}</span></button></li>`;
  })}</ol><p class="qindex__legend muted" id="hpi-progress">${answeredCount(f, m.answers)} of ${f.items.length} answered</p></nav>`;
}

function itemControl(m, item, n) {
  const v = m.answers[item.id];
  if (item.kind === "order") {
    const order = Array.isArray(v) ? v : item.options.map(o => o.id), set = Array.isArray(v);
    return html`<fieldset class="field"><legend class="visually-hidden">Order for question ${n}</legend>
      <ol class="hpi-order">${order.map((oid, i) => { const o = item.options.find(x => x.id === oid); return html`<li class="hpi-order__row"><span>${o.label}</span>
        <button type="button" class="btn btn--ghost" data-action="hpi-move" data-item="${item.id}" data-from="${i}" data-to="${i - 1}"${i === 0 ? raw(" disabled") : ""} aria-label="Move ${o.label} up">Up</button>
        <button type="button" class="btn btn--ghost" data-action="hpi-move" data-item="${item.id}" data-from="${i}" data-to="${i + 1}"${i === order.length - 1 ? raw(" disabled") : ""} aria-label="Move ${o.label} down">Down</button></li>`; })}</ol>
      ${set ? html`<p class="muted">Order saved as shown.</p>` : html`<button type="button" class="btn btn--secondary" data-action="hpi-move" data-item="${item.id}" data-from="0" data-to="0">Use this order</button>`}</fieldset>`;
  }
  const visual = !!item.options[0]?.visual;
  return html`<fieldset class="field run-choices${visual ? " hpi-visual-choices" : ""}"><legend class="visually-hidden">Answer for ${pageSize(m.form) > 1 ? "statement" : "question"} ${n}</legend>
    ${item.options.map((o, i) => html`<label class="choice" for="hpi-${item.id}-${i}"><input type="radio" id="hpi-${item.id}-${i}" name="hpi-${item.id}" value="${o.id}" data-change="hpi-answer" data-item="${item.id}"${v === o.id ? raw(" checked") : ""}>
      ${visual ? html`<span class="hpi-opt" data-hpi-option="${item.id}:${i}"></span><span class="visually-hidden">${o.label}</span>` : html`<span>${m.form.kind === "inventory" ? "" : html`<span class="choice__letter" aria-hidden="true">${letter(i)}</span> `}${o.label}</span>`}</label>`)}
  </fieldset>`;
}

function questionCard(m) {
  const f = m.form, its = pageItems(f, m.page), last = m.page === pageCount(f) - 1, size = pageSize(f);
  return html`<section class="card run-q" aria-labelledby="q-h">
      <p class="muted">${stageLine(f) ? `${stageLine(f)} · ` : ""}${size > 1 ? `Screen ${m.page + 1} of ${pageCount(f)}` : `Question ${m.page + 1} of ${f.items.length}`}</p>
      ${size > 1 ? html`<h2 id="q-h" tabindex="-1">How accurately does each statement describe you?</h2>` : ""}
      ${its.map((item, k) => html`<div class="hpi-item">
        ${size > 1 ? html`<p class="hpi-item__prompt"><strong>${item.prompt}</strong></p>` : html`<h2 id="q-h" tabindex="-1">${item.prompt}</h2>`}
        ${item.visual ? html`<div class="hpi-grid" role="img" aria-label="Grid of nine pictures. ${item.visual.description}" data-hpi-grid="${item.id}"></div>` : ""}
        ${itemControl(m, item, m.page * size + k + 1)}
        ${isAnswered(m.answers, item.id) && item.kind !== "order" ? html`<button type="button" class="btn btn--link" data-action="hpi-clear" data-item="${item.id}">Clear this answer</button>` : ""}
      </div>`)}
    </section>
    <div class="btn-row run-nav">
      <button type="button" class="btn btn--secondary" data-action="hpi-prev"${m.page === 0 ? raw(" disabled") : ""}>Previous</button>
      ${last ? html`<button type="button" class="btn btn--primary" data-action="hpi-review">Review your answers</button>` : html`<button type="button" class="btn btn--primary" data-action="hpi-next">Next</button><button type="button" class="btn btn--ghost" data-action="hpi-review">Review your answers</button>`}
    </div>`;
}

function reviewCard(m) {
  const f = m.form, blanks = f.items.map((i, k) => ({ i, k })).filter(x => !isAnswered(m.answers, x.i.id)), lastStage = !f.stage || f.phase === f.stages - 1;
  return html`<section class="card" aria-labelledby="review-h"><h2 id="review-h" tabindex="-1">Review your answers${f.stage ? ` · ${f.stage.title}` : ""}</h2>
    <p>${answeredCount(f, m.answers)} of ${f.items.length} answered.${blanks.length ? " Blank answers are allowed; they are reported as not answered, not as wrong." : ""}</p>
    ${blanks.length ? html`<ul class="plain">${blanks.slice(0, 12).map(x => html`<li><button type="button" class="linkish" data-action="hpi-goto" data-page="${Math.floor(x.k / pageSize(f))}">${pageSize(f) > 1 ? "Statement" : "Question"} ${x.k + 1}<span class="visually-hidden">, not answered. Go to it.</span></button></li>`)}${blanks.length > 12 ? html`<li class="muted">and ${blanks.length - 12} more</li>` : ""}</ul>` : ""}
    ${m.error ? html`<p class="notice notice--bad" id="hpi-error" role="alert" tabindex="-1">${m.error} Your answers are still here.</p>` : ""}
    <div class="btn-row"><button type="button" class="btn btn--secondary" data-action="hpi-goto" data-page="${pageCount(f) - 1}">Back to the questions</button>
      <button type="button" class="btn btn--primary" data-action="hpi-finish"${answeredCount(f, m.answers) ? "" : raw(" disabled")}>${lastStage ? "Finish and see your feedback" : "Finish this stage"}</button></div>
    ${answeredCount(f, m.answers) ? "" : html`<p class="muted">Answer at least one question to finish.</p>`}</section>`;
}

function resultCard(m) {
  const r = m.result || {};
  const rows = [];
  if (r.factors) {
    rows.push(html`<p>Your self-description on five broad dimensions, from 1 (very inaccurate) to 5 (very accurate). Neither end is better.</p>`);
    for (const f of r.factors) rows.push(html`<div class="stand__score"><span>${f.name}</span><span class="num">${f.mean == null ? "Not answered" : f.mean.toFixed(1)}</span></div><p class="muted">${f.answered} of ${f.total} statements answered</p>`);
  } else if (r.preferences) {
    rows.push(html`<p>Your preferences. There are no right answers and nothing here is scored.</p><ul>${r.preferences.map(p => html`<li><strong>${p.domain}:</strong> ${p.choice}</li>`)}</ul>`);
  } else if (r.blocks) {
    rows.push(html`<p>${r.interpretation}</p>`);
    for (const b of r.blocks) rows.push(html`<div class="stand__score"><span>Block ${b.block}</span><span class="num">${b.correct} of ${b.reached}</span></div><p class="muted">${b.accuracy == null ? "No comparisons" : `${Math.round(b.accuracy * 100)}% accurate`}${b.timing && !b.timing.valid ? " · timing could not be confirmed" : ""}</p>`);
  } else {
    if (r.credited != null) rows.push(html`<div class="stand__score"><span>Matched the provisional key</span><span class="num">${r.credited} of ${r.total}</span></div><p class="muted">${r.attempted} of ${r.total} answered</p>`);
    for (const d of r.observations || r.stages || []) rows.push(html`<p><strong>${label(d.domain)}:</strong> ${d.credited} of ${d.total} matched (${d.attempted} answered)</p>`);
    if (r.checking) rows.push(html`<p>Errors found ${r.checking.hits} · missed ${r.checking.misses} · false alarms ${r.checking.falseAlarms} · correct matches ${r.checking.correctRejections} · blank ${r.checking.omitted}</p>`);
    if (r.ruleChange) rows.push(html`<p>After the rule changed, ${r.ruleChange.obsoleteRuleResponses} of ${r.ruleChange.conflictTrials} answers on the codes where the two rules disagree followed the old rule.</p>`);
    if (r.chanceLevel) rows.push(html`<p class="muted">Each question had two options, so about half could be matched by guessing. Compare stages with care.</p>`);
    if (r.practice?.length) rows.push(html`<p class="muted">Areas you could practise: ${r.practice.map(label).join(", ")}. These are topics, not proven weaknesses.</p>`);
  }
  return html`<section class="card" aria-labelledby="result-h"><h2 id="result-h" tabindex="-1">Your private feedback</h2>
    ${rows}
    <p class="notice">${r.interpretation && !r.blocks ? r.interpretation : "This is a research exercise. It is not a validated test, and it does not affect your profile score, proof badges or what employers see."}</p>
    <div class="btn-row"><a class="btn btn--primary" href="${BACK}">Back to Human Potential</a></div></section>`;
}

export function render(m) {
  if (m.missing) return html`<div class="page-head"><h1 id="page-title" tabindex="-1">Exercise not available</h1></div><section class="card"><p>This exercise is not open at the moment.</p><p><a class="btn btn--primary" href="${BACK}">Back to Human Potential</a></p></section>`;
  if (m.needsConsent) return html`<div class="page-head"><h1 id="page-title" tabindex="-1">Read the notice first</h1></div><section class="card"><p>Please read the short notice about these optional exercises before you start one.</p><p><a class="btn btn--primary" href="${BACK}">Go to the notice</a></p></section>`;
  const body = m.stage === "intro" ? introCard(m) : m.stage === "review" ? reviewCard(m) : m.stage === "result" ? resultCard(m)
    : m.stage === "timed" ? html`<section class="card" aria-labelledby="hpi-timed-h"><h2 id="hpi-timed-h" tabindex="-1">${stageLine(m.form)}</h2><p>${m.form.stage.instruction}</p><div id="hpi-timed"></div></section>`
    : questionCard(m);
  const running = m.stage === "questions" || m.stage === "review";
  return html`${head(m)}${running ? runBar(m) : ""}${m.stage === "questions" ? indexNav(m) : ""}${body}`;
}

// ── After render: pictures, the timed block, focus, the leave guard ──────────────
export function afterRender(m) {
  if (!m || m.missing || m.needsConsent) return;
  for (const el of document.querySelectorAll("[data-hpi-grid]")) { const item = m.form.items.find(i => i.id === el.dataset.hpiGrid); el.replaceChildren(...item.visual.cells.map(c => cellSvg(c))); }
  for (const el of document.querySelectorAll("[data-hpi-option]")) { const [id, i] = el.dataset.hpiOption.split(":"); el.replaceChildren(cellSvg(m.form.items.find(x => x.id === id).options[Number(i)].visual, 64)); }
  if (m.stage === "timed") mountTimed(m, document.getElementById("hpi-timed"));
  runtime.guard.set(() => m.dirty && m.stage !== "result");
  const focus = m.focusId && document.getElementById(m.focusId);
  if (focus) focus.focus(); m.focusId = null;
}

// ── Saving ────────────────────────────────────────────────────────────────────
const model = () => runtime.current?.model;
const stay = (m, focusId = "q-h") => { m.focusId = focusId; runtime.rerender({ focus: false }); };
function setSave(m, state) {
  m.save = state;
  const s = document.getElementById("hpi-save"), a = document.getElementById("hpi-save-alert");
  if (s) s.textContent = saveText(m);
  if (a) { a.hidden = state !== "failed"; a.textContent = state === "failed" ? saveText(m) : ""; }
}
const phaseAnswers = m => Object.fromEntries(m.form.items.map(i => [i.id, m.answers[i.id] ?? null]));
async function save(m) {
  if (!m.dirty) return true;
  setSave(m, "saving");
  try { const r = await runtime.api.post("/api/hpi/save", { attempt_id: m.attemptId, revision: m.revision, answers: phaseAnswers(m) }); m.revision = r.revision; m.dirty = false; setSave(m, "saved"); return true; }
  catch (e) { if (e?.status === 401) runtime.signedOut(); setSave(m, "failed"); return false; }
}
async function move(m, page, stage = "questions") { await save(m); m.page = Math.max(0, Math.min(page, pageCount(m.form) - 1)); m.stage = stage; m.error = null; stay(m, stage === "review" ? "review-h" : "q-h"); }

registerActions({
  "hpi-begin": () => { const m = model(); if (!m) return; m.stage = "questions"; m.page = 0; stay(m); },
  "hpi-answer": el => { const m = model(); if (!m) return; m.answers[el.dataset.item] = el.value; m.dirty = true; setSave(m, "unsaved"); const p = document.getElementById("hpi-progress"); if (p) p.textContent = `${answeredCount(m.form, m.answers)} of ${m.form.items.length} answered`; },
  "hpi-clear": btn => { const m = model(); if (!m) return; m.answers[btn.dataset.item] = null; m.dirty = true; stay(m); },
  "hpi-move": btn => {
    const m = model(); if (!m) return;
    const item = m.form.items.find(i => i.id === btn.dataset.item), cur = Array.isArray(m.answers[item.id]) ? [...m.answers[item.id]] : item.options.map(o => o.id);
    const from = Number(btn.dataset.from), to = Number(btn.dataset.to);
    if (to !== from) [cur[from], cur[to]] = [cur[to], cur[from]];
    m.answers[item.id] = cur; m.dirty = true;
    // Keep focus on the moved item's button in its new position so keyboard users can keep moving it.
    const dir = to < from ? "up" : "down", o = item.options.find(x => x.id === cur[to]);
    runtime.rerender({ focus: false });
    const next = [...document.querySelectorAll(`[data-action="hpi-move"][data-item="${item.id}"]`)].find(b => b.getAttribute("aria-label") === `Move ${o.label} ${dir}` && !b.disabled)
      || [...document.querySelectorAll(`[data-action="hpi-move"][data-item="${item.id}"]`)].find(b => b.getAttribute("aria-label")?.startsWith(`Move ${o.label}`) && !b.disabled);
    next?.focus();
  },
  "hpi-next": () => { const m = model(); if (m) move(m, m.page + 1); },
  "hpi-prev": () => { const m = model(); if (m) move(m, m.page - 1); },
  "hpi-goto": btn => { const m = model(); if (m) move(m, Number(btn.dataset.page)); },
  "hpi-review": () => { const m = model(); if (m) move(m, m.page, "review"); },
  "hpi-leave": async btn => { const m = model(); if (!m) return; await runAction(btn, "Saving…", async () => { if (await save(m)) { runtime.guard.clear(); location.hash = BACK; } }); },
  "hpi-finish": async btn => {
    const m = model(); if (!m) return;
    const f = m.form, last = !f.stage || f.phase === f.stages - 1;
    if (!last) {
      const ok = await confirmDialog({ title: "Finish this stage?", body: html`<p>You cannot go back to this stage once you finish it.</p>`, confirmLabel: "Finish stage", startOn: "cancel" });
      if (!ok) return;
    }
    await runAction(btn, last ? "Finishing…" : "Saving…", async () => {
      try {
        const r = await runtime.api.post(last ? "/api/hpi/submit" : "/api/hpi/advance", { attempt_id: m.attemptId, revision: m.revision, answers: phaseAnswers(m) });
        m.revision = r.revision; m.dirty = false; m.error = null;
        if (last) { m.result = r.result; m.stage = "result"; stay(m, "result-h"); }
        else { m.form = r.form; m.page = 0; m.stage = "intro"; stay(m, "hpi-intro-h"); }
      } catch (e) { if (e?.status === 401) return runtime.signedOut(); m.error = e?.message || "That did not reach {{BRAND}}."; stay(m, "hpi-error"); }
    });
  },
});

// ── Timed protocol (E02) ────────────────────────────────────────────────────────
// Active time comes from performance.now() and pauses while the page is hidden; the server checks it against elapsed
// time. Recorded: active ms, interruptions, input type and a coarse screen-size class. Nothing about mouse paths or
// keystroke timing.
function mountTimed(m, area) {
  if (!area) return;
  const f = m.form, practice = f.phase === 0, untimed = m.untimed, items = f.items, answers = {};
  let i = 0, activeMs = 0, startedAt = null, interruptions = 0, modality = null, ticker = null, ended = false;
  const viewport = innerWidth < 600 ? "small" : innerWidth < 1024 ? "medium" : "large";
  const note = k => { modality = modality && modality !== k ? "mixed" : k; };
  const elapsed = () => activeMs + (startedAt === null ? 0 : performance.now() - startedAt);
  const handleVisibility = () => { if (practice || ended) return; if (document.hidden && startedAt !== null) { activeMs += performance.now() - startedAt; startedAt = null; interruptions++; } else if (!document.hidden && startedAt === null && ticker) startedAt = performance.now(); };
  const handlePointer = e => note(e.pointerType === "touch" ? "touch" : "pointer");
  const handleKeyInput = e => { if (["Enter", " ", "m", "M", "d", "D", "Tab"].includes(e.key)) note("keyboard"); };
  const handleKey = e => { if (ended || e.repeat) return; const k = e.key.toLowerCase(), opt = k === "m" ? "o1" : k === "d" ? "o2" : null; const b = opt && area.querySelector(`[data-option="${opt}"]`); if (b) { e.preventDefault(); b.click(); } };
  const cleanup = () => { clearInterval(ticker); document.removeEventListener("visibilitychange", handleVisibility); document.removeEventListener("keydown", handleKey); removeEventListener("pointerdown", handlePointer, true); removeEventListener("keydown", handleKeyInput, true); };
  document.addEventListener("visibilitychange", handleVisibility); addEventListener("pointerdown", handlePointer, true); addEventListener("keydown", handleKeyInput, true); document.addEventListener("keydown", handleKey);
  runtime.guard.set(() => !ended && ticker !== null, { ask: () => confirmDialog({ title: "Leave this timed block?", body: html`<p>The block ends if you leave. Answers in this block are not saved.</p>`, confirmLabel: "Leave", cancelLabel: "Stay" }) });
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const btn = (text, fn, cls = "btn btn--primary") => { const b = el("button", text, cls); b.type = "button"; b.addEventListener("click", fn); return b; };
  const clock = el("p", "", "run-timer"); clock.setAttribute("aria-live", "off");
  async function finish() {
    if (ended) return; ended = true; cleanup();
    const timing = practice ? undefined : { activeMs: Math.round(elapsed()), interruptions, modality: modality || "unknown", viewport };
    const last = f.phase === f.stages - 1;
    const send = async () => {
      area.replaceChildren(el("p", "Saving this block…"));
      try {
        const r = await runtime.api.post(last ? "/api/hpi/submit" : "/api/hpi/advance", { attempt_id: m.attemptId, revision: m.revision, answers, ...(timing ? { timing } : {}) });
        m.revision = r.revision; runtime.guard.clear();
        if (last) { m.result = r.result; m.stage = "result"; stay(m, "result-h"); } else { m.form = r.form; stay(m, "hpi-timed-h"); }
      } catch (e) { const p = el("p", `${e?.message || "That did not reach {{BRAND}}."} Your answers for this block are kept on this page.`, "notice notice--bad"); p.setAttribute("role", "alert"); area.replaceChildren(p, btn("Try again", send)); }
    };
    await send();
  }
  function show() {
    if (i >= items.length) return finish();
    const item = items[i], [orig, cap] = item.prompt.split("  |  ");
    const card = el("div", null, "hpi-trial"), pair = el("dl");
    pair.append(el("dt", "Original"), el("dd", orig), el("dt", "Captured"), el("dd", cap));
    const row = el("div", null, "btn-row");
    for (const o of item.options) { const b = btn(`${o.label} (${o.label[0]})`, () => choose(o.id)); b.dataset.option = o.id; row.append(b); }
    const choose = id => {
      answers[item.id] = id;
      if (!practice) { i++; return show(); }
      const ok = id === item.practiceKey, fb = el("p", ok ? "Correct." : `Not quite: these records ${item.practiceKey === "o1" ? "match" : "differ"}.`, ok ? "notice notice--good" : "notice notice--warn");
      card.replaceChildren(pair, fb, btn(i + 1 < items.length ? "Next" : "Go to the timed blocks", () => { i++; show(); }));
      card.querySelector("button").focus();
    };
    card.append(el("p", `${i + 1} of ${items.length}`, "muted"), pair, row);
    area.replaceChildren(...(practice ? [] : [clock]), card);
    row.querySelector("button").focus();
  }
  if (practice) { area.replaceChildren(el("p", "Practice is not scored or timed. Use the buttons, or press M for Match and D for Different.")); show(); return; }
  const intro = el("p", untimed ? "Your approved extended-time arrangement applies: this block has no time limit." : "When you press start, comparisons appear one at a time for one minute of active time. Use the buttons, or press M and D.");
  area.replaceChildren(intro, btn(untimed ? "Start block" : "Start the one-minute block", () => {
    startedAt = performance.now();
    ticker = setInterval(() => { clock.textContent = untimed ? "No time limit" : `Time left: ${Math.max(0, Math.ceil((f.blockMs - elapsed()) / 1000))} s`; if (!untimed && elapsed() >= f.blockMs) finish(); }, 250);
    show();
    if (untimed) area.after(btn("Finish block", finish, "btn btn--secondary"));
  }));
}

```

## Appendix H4: `public/admin/js/views/hpi-research.js`

```js
// HPIS research (#/hpi-research): aggregate pilot statistics for checking and calibrating the
// Human Potential exercises. Never individual candidates or answers (see functions/api/admin/hpi-research.js).
import { html } from "../core/format.js";
import { pageHeader, section, errorState } from "../ui/page.js";
import { dataTable } from "../ui/table.js";
import { registerActions, runAction } from "../core/actions.js";
import { runtime } from "../app/runtime.js";
import { toast } from "../ui/toast.js";

export async function load(api) {
  try { return { data: await api.get("/api/admin/hpi-research") }; }
  catch (e) { return { error: e.message }; }
}
const num = v => (v == null ? "—" : String(v));
// Rough flags for item review, not decision rules: very easy/hard items and items that do not move with the rest.
function flag(it) {
  const f = [];
  if (it.facility != null && it.facility >= 0.9) f.push("Very easy");
  if (it.facility != null && it.facility <= 0.2) f.push("Very hard");
  if (it.item_rest_r != null && it.item_rest_r < 0.15) f.push("Low discrimination");
  return f.join(", ") || "—";
}
function moduleBody(m) {
  if (m.suppressed) return html`<p class="muted">${m.submissions} submission${m.submissions === 1 ? "" : "s"}. ${m.reason}</p>`;
  const head = html`<p class="muted">${m.submissions} submissions · median ${num(m.median_minutes_start_to_submit)} minutes from start to submission (calendar time, includes breaks).</p>`;
  if (m.kind === "preferences") {
    return html`${head}${dataTable({ caption: `${m.title}: answers`, columns: [
      { key: "i", label: "Item", render: r => r.item_id },
      { key: "o", label: "Choices", render: r => Object.entries(r.options).map(([k, v]) => `${k}: ${v}`).join(" · ") },
      { key: "m", label: "Blank", numeric: true, render: r => r.omitted },
    ], rows: m.items, rowKey: r => r.item_id })}`;
  }
  return html`${head}${dataTable({ caption: `${m.title}: item statistics`, columns: [
    { key: "i", label: "Item", render: r => r.item_id },
    { key: "d", label: "Area", render: r => r.domain },
    { key: "f", label: "Facility", numeric: true, render: r => num(r.facility) },
    { key: "r", label: "Item-rest r", numeric: true, render: r => num(r.item_rest_r) },
    { key: "m", label: "Blank", numeric: true, render: r => r.omitted },
    { key: "x", label: "Review flag", render: flag },
  ], rows: m.items, rowKey: r => r.item_id })}`;
}
export function render(m) {
  if (m.error) return html`${pageHeader({ title: "HPIS research" })}${errorState({ title: "Couldn't load research statistics", message: `${m.error} Nothing was changed.` })}`;
  const d = m.data;
  return html`${pageHeader({ title: "HPIS research" })}
${section({ title: "About these numbers", body: html`<p>${d.caveat}</p>
  <p class="muted">Form ${d.form_version}. Only attempts made under a notice that discloses anonymised analysis are counted. Modules with fewer than ${d.min_cell} submissions show the count only.${d.unreadable ? ` ${d.unreadable} attempt(s) could not be decrypted and were excluded.` : ""}${d.truncated ? " The row limit was reached; totals are incomplete." : ""}</p>
  <p class="muted">Facility is the share of all submissions matching the provisional key. Item-rest r is the correlation between an item and the rest of its module. Flags are prompts for expert review, not decisions.</p>` })}
${section({ title: "Pilot invitations", body: html`<p>Research is <strong>${d.research_enabled ? "on" : "off"}</strong>${d.open_enrolment ? " with open enrolment (every candidate)" : ""}. Invited candidates see the optional Human Potential exercises only while research is on.</p>
  <form class="inline-form" novalidate><label for="hpi-code">Candidate code</label> <input id="hpi-code" name="candidate_code" autocomplete="off" required>
  <button type="submit" class="btn btn--primary" data-action="hpi-invite" data-mode="invite">Invite</button> <button type="button" class="btn btn--secondary" data-action="hpi-invite" data-mode="revoke">Revoke</button></form>
  <p class="muted">${d.invites.length} invited.${d.invites.length ? " " + d.invites.slice(0, 50).map(i => i.candidate_code || "(deleted)").join(", ") + (d.invites.length > 50 ? ", …" : "") : ""}</p>` })}
${section({ title: "Submissions by module", body: dataTable({ caption: "Submissions by module", columns: [
    { key: "m", label: "Module", render: r => `${r.module_id} · ${r.title}` },
    { key: "n", label: "Submissions", numeric: true, render: r => r.submissions },
    { key: "s", label: "Item statistics", render: r => (r.suppressed ? `Hidden until ${d.min_cell}` : "Shown below") },
  ], rows: d.modules, rowKey: r => r.module_id }) })}
${d.modules.filter(mod => !mod.suppressed).map(mod => section({ title: `${mod.module_id} · ${mod.title}`, body: moduleBody(mod) }))}
${d.fairness ? section({ title: "Fairness research (DIF screen)", body: html`<p>${d.fairness.opted_in} candidates opted in. Groups need at least ${d.fairness.min_group} people; smaller groups are not shown. Mantel-Haenszel D-DIF with a purified matching score; |D| at least ${d.fairness.flag_abs_d}, or complete separation, is flagged for expert review. A flag is not proof of bias, and no significance test is applied.</p>
  ${d.fairness.modules.length ? d.fairness.modules.map(m => html`<h3>${m.module_id} · ${m.title} (${m.n})</h3>${m.variables.map(v => v.suppressed ? html`<p class="muted">${v.variable}: ${v.reason}</p>` : v.comparisons.map(c => dataTable({ caption: `${v.variable}: ${c.focal.label} (${c.focal.n}) vs ${v.reference.label} (${v.reference.n})`, columns: [
    { key: "i", label: "Item", render: r => r.item_id }, { key: "d", label: "MH D-DIF", numeric: true, render: r => (r.extreme ? r.extreme.replace("_", " ") : num(r.mh_d_dif)) }, { key: "f", label: "Review", render: r => (r.flag ? "Flagged" : "—") },
  ], rows: c.items, rowKey: r => r.item_id })))}`) : html`<p class="muted">No module has enough opted-in submissions yet (at least ${2 * d.fairness.min_group}).</p>`}` }) : ""}
${d.l02_obsolete_rule_distribution ? section({ title: "L02 rule change: obsolete-rule responses", body: html`<p>${Object.entries(d.l02_obsolete_rule_distribution.distribution).map(([k, v]) => `${k} of ${d.l02_obsolete_rule_distribution.conflict_trials}: ${v} candidates`).join(" · ")}</p>` }) : ""}`;
}

registerActions({
  "hpi-invite": async el => {
    const input = document.getElementById("hpi-code");
    const code = input?.value.trim();
    if (!code) { toast("Enter a candidate code.", "bad"); input?.focus(); return; }
    await runAction(el, el.dataset.mode === "invite" ? "Inviting…" : "Revoking…", async () => {
      try { const r = await runtime.api.post("/api/admin/hpi-research", { action: el.dataset.mode, candidate_code: code }); toast(r.message); await runtime.reload(); }
      catch (e) { toast(e.message, "bad"); }
    });
  },
});

```

## Appendix H5: portal CSS (HPIS rules from `public/candidate/portal.css`)

```css
.hpi-item + .hpi-item { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-default); }
.hpi-item__prompt { margin: 0 0 8px; }
.hpi-grid { display: grid; grid-template-columns: repeat(3, 72px); gap: 6px; margin: 8px 0 16px; color: var(--text-primary); }
.hpi-cell { display: block; }
.hpi-visual-choices { display: grid; grid-template-columns: repeat(2, minmax(0, max-content)); gap: 8px 12px; }
.hpi-visual-choices .choice { align-items: center; margin: 0; color: var(--text-primary); }
.hpi-order { list-style: decimal; padding-left: 24px; margin: 0 0 12px; }
.hpi-order__row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-default); }
.hpi-order__row > span { flex: 1; font-weight: 700; }
.hpi-trial { max-width: 32rem; padding: 16px; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: var(--surface-primary); }
.hpi-trial dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 8px 0 16px; font: 700 1.25rem/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.hpi-trial dt { font: 500 0.9375rem/1.4 inherit; font-family: inherit; color: var(--text-muted); align-self: center; }
.hpi-trial dd { margin: 0; letter-spacing: 0.06em; overflow-wrap: anywhere; }
.hpi-trial .btn-row .btn { min-width: 9rem; }
.hpi-bar + .hpi-bar { margin-top: 12px; }
```

## Appendix H6: Home integration (excerpt from `public/candidate/js/views/home.js`)

```js
// Beside the go-live score, never instead of it: optional Human Potential progress and the wider "full profile" figure
// (profile score 65%, core exercises 35%). Only the profile score decides going live (product decision 2026-11-24).
function hpiBars(score, c) {
  const full = fullProfile(score, c.submitted, c.total);
  return html`<div class="hpi-bar"><div class="stand__score"><span>Human Potential (optional)</span><span class="num">${c.submitted} of ${c.total}</span></div>
      <progress max="${c.total}" value="${c.submitted}" aria-label="Human Potential core exercises: ${c.submitted} of ${c.total} done"></progress></div>
    <div class="hpi-bar"><div class="stand__score"><span>Full Human Potential profile</span><span class="num">${full}%</span></div>
      <progress max="100" value="${full}" aria-label="Full Human Potential profile ${full} out of 100"></progress>
      <p class="muted">Your profile score counts 65% and the optional exercises 35%. Only your profile score decides when you go live.</p></div>`;
}

// Optional and private: sits below the go-live tasks so it never competes with what gets a profile in front of employers.
function hpiCard(m) {
  const c = m.hpi;
  if (!c) return "";
  const complete = c.submitted >= c.total;
  return section("hpi", "Human Potential (optional)", html`<p>${complete
      ? "You have completed the core exercises. More are available if you want them."
      : `About ${c.estimate_minutes} minutes of short exercises on numbers, checking records, workplace controls and your work preferences. ${c.submitted} of ${c.total} done.`}</p>
    <p class="muted">Private research. Results are shown only to you and do not affect your profile score, proof badges or what employers see.</p>
    <p><a class="btn btn--secondary" href="#/human-potential">${complete ? "See your exercises" : c.submitted ? "Continue" : "Start"}</a></p>`);
}
```

## Appendix H7: status tags (excerpt from `public/candidate/js/core/status.js`)

```js
  // Checklist and task-list states (_candidate_progress.js visibilityChecklist status)
  // Human Potential exercises are optional: "not started" is neutral, never the warning tone of a required task.
  hpi: {
    done: S("Completed", "good", "check-circle"),
    progress: S("In progress", "info", "hourglass"),
    todo: S("Not started", "neutral", "circle"),
    soon: S("In development", "neutral", "prohibit"),
    unreadable: S("Cannot be read", "warn", "warning"),
  },
```

## Appendix T (test): `tests/hpi-research.test.js`

```js
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { MODULES,VERSION } from "../functions/api/_hpi_catalog.js";
import { assertCatalogue,catalogue,publicForm,score,normalizeAnswers } from "../functions/api/_hpi_engine.js";
assert(assertCatalogue());
assert.equal(MODULES.length,16);
for(const m of MODULES){
 const f=publicForm(m.id);
 if(m.status==="planned"){assert.equal(f,null);continue;}
 assert.equal(f.version,VERSION);
 assert(f.items.every(i=>!Object.hasOwn(i,"key")&&!Object.hasOwn(i,"feedback")));
 const all=Object.fromEntries(m.items.map(i=>[i.id,m.kind==="preferences"||m.kind==="inventory"?i.options[0].id:i.key]));
 const result=score(m.id,all);
 assert.equal(result.selectionAllowed,false);
 assert.equal(result.precision,"not_established");
 assert.equal(result.attempted,m.items.length);
 if(m.kind==="task")assert.equal(result.credited,m.items.length);
 else assert.equal(result.credited,undefined);
 if(m.kind==="staged"){
  assert.equal(result.stages.length,m.phases.length);assert.equal(result.stages.reduce((n,d)=>n+d.credited,0),m.items.length);assert.equal(result.chanceLevel,0.5);
  for(let p=0;p<m.phases.length;p++){const ids=publicForm(m.id,p).items.map(i=>i.id);assert.deepEqual(ids,m.items.filter(i=>i.phase===p).map(i=>i.id));
   const later=m.items.find(i=>i.phase===p+1);if(later)assert.throws(()=>normalizeAnswers(m.id,{[later.id]:"o1"},p),"later-stage answers rejected");}
 }
 assert.equal(score(m.id,{}).attempted,0);
 assert.throws(()=>normalizeAnswers(m.id,{bad:"o1"}));
 assert.throws(()=>normalizeAnswers(m.id,{[m.items[0].id]:"wrong"}));
}
assert(catalogue().every(m=>!Object.hasOwn(m,"items")&&!Object.hasOwn(m,"phases")));
assert(!JSON.stringify(catalogue()).includes("both positions have the same parity"));
assert(!JSON.stringify(publicForm("L01",0)).includes("both positions have the same parity"));
// L01 stage 3 must not restate the rule (otherwise it measures re-reading, not transfer).
assert(!/parity|even|odd/i.test(JSON.stringify(publicForm("L01",2).stage)));
// L02: the new rule is not revealed in stage 1; obsolete-rule responses counted only on conflict trials.
assert(!/even/i.test(JSON.stringify(publicForm("L02",0,"A"))));
const rc=score("L02",{f5:"o1",f6:"o2",f7:"o1",f10:"o2"},"A").ruleChange;
assert.equal(rc.conflictTrials,4);assert.equal(rc.obsoleteRuleResponses,2);assert.deepEqual(rc.afterChangeSequence,[0,0,1,null,null,1]);
// Counterbalanced variant B reverses the rule order: the same answers are now new-rule correct on f5/f6.
const rcB=score("L02",{f5:"o1",f6:"o2",f7:"o1",f10:"o2"},"B").ruleChange;
assert.equal(rcB.conflictTrials,4);assert.equal(rcB.obsoleteRuleResponses,0);assert.deepEqual(rcB.afterChangeSequence,[1,1,1,null,null,1]);
assert(/even/i.test(JSON.stringify(publicForm("L02",0,"B").stage))&&!/greater than 50/i.test(JSON.stringify(publicForm("L02",0,"B").stage)));
assert.equal(score("L02",{},"B").variant,"B");assert.equal(score("L02",{}).variant,"A");
assert(!JSON.stringify(publicForm("L02",1)).includes("oldKey"));
assert.deepEqual(score("E01",{}).checking,{hits:0,misses:0,falseAlarms:0,correctRejections:0,omitted:10});
assert.throws(()=>normalizeAnswers("C04",{d1:["o1","o1","o2","o3"]}));
assert.equal(score("C01",{n1:"o2"}).credited,1);
assert.equal(score("C01",{n1:"o1"}).credited,0);
const db=new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT);");
db.exec(readFileSync(new URL("../migrations/0095_hpi_research.sql",import.meta.url),"utf8"));
db.exec("INSERT INTO users VALUES ('u','active');");
db.exec("INSERT INTO hpi_research_attempts(id,candidate_user_id,module_id,form_version,notice_version,status,created_at,updated_at,expires_at) VALUES ('a','u','C01','v','n','draft','1','1','2');");
assert.throws(()=>db.exec("UPDATE hpi_research_attempts SET status='submitted' WHERE id='a'"));
db.exec("DELETE FROM users WHERE id='u'");
assert.equal(db.prepare("SELECT count(*) AS n FROM hpi_research_attempts").get().n,0);
db.close();
// P01: verbatim IPIP-50 from the stored provenance record, reverse scoring per IPIP instructions, gated.
{
 const src=JSON.parse(readFileSync(new URL("../docs/hpis/provenance/ipip-50-big-five-markers.json",import.meta.url),"utf8"));
 const p01=MODULES.find(m=>m.id==="P01");
 assert.equal(src.items.length,50);assert.equal(p01.items.length,50);
 src.items.forEach((it,i)=>{const c=p01.items[i];assert.equal(c.prompt,it.text);assert.equal(c.factor,it.factor);assert.equal(c.sign,it.key);assert.equal(c.id,"b"+it.n);});
 assert.deepEqual(p01.items[0].options.map(o=>o.label),src.response_scale);
 // Independent scoring: random responses, recomputed with the IPIP rule (- keyed = 6 - value).
 let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
 const answers={},vals={};for(const it of src.items){const v=1+Math.floor(rnd()*5);answers["b"+it.n]="o"+v;(vals[it.factor]??=[]).push(it.key==="-"?6-v:v);}
 delete answers.b50;vals[5].pop(); // item 50 is + keyed factor 5 and the last factor-5 item
 const res=score("P01",answers);
 for(const f of res.factors){const v=vals[f.factor];assert.equal(f.answered,v.length);assert.equal(f.mean,Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100);assert.equal(f.sum,f.factor===5?null:v.reduce((a,b)=>a+b,0));}
 assert(!Object.keys(res).some(k=>/percentile|type|pass|fail|band|norm_?score/i.test(k))&&res.selectionAllowed===false);assert(res.factors.every(f=>Object.keys(f).every(k=>["factor","name","answered","total","mean","sum"].includes(k))));
 assert.equal(catalogue().find(m=>m.id==="P01").status,"planned");
 assert.equal(catalogue(["ENABLE_HPI_PERSONALITY"]).find(m=>m.id==="P01").status,"research");
 assert(!JSON.stringify(publicForm("P01")).includes('"sign"')&&!JSON.stringify(publicForm("P01")).includes('"factor"'),"keys not exposed");
}
// Visual generator accepts a rule-following grid and rejects grids whose missing cell breaks the rule.
{
 const {buildGrid,verifyMatrix}=await import("../functions/api/_hpi_visual.js");
 const g=buildGrid({shape:["row",["circle","square","triangle"]],count:["col",[1,2,3]],fill:["all",["solid","solid","solid"]]});
 assert(verifyMatrix(g));
 assert.throws(()=>verifyMatrix([...g.slice(0,8),{...g[8],count:1}]),/count/);
 // Shape is constant by row in the visible cells (row 3 = square) but the missing cell is a circle: rejected.
 const amb=[{shape:"circle",count:1,fill:"solid"},{shape:"circle",count:2,fill:"solid"},{shape:"circle",count:3,fill:"solid"},
  {shape:"circle",count:1,fill:"solid"},{shape:"circle",count:2,fill:"solid"},{shape:"circle",count:3,fill:"solid"},
  {shape:"circle",count:1,fill:"solid"},{shape:"circle",count:2,fill:"solid"},{shape:"circle",count:3,fill:"solid"}];
 assert(verifyMatrix(amb));
 const vis=[...amb.slice(0,6),{shape:"square",count:1,fill:"solid"},{shape:"square",count:2,fill:"solid"},{shape:"circle",count:3,fill:"solid"}];
 assert.throws(()=>verifyMatrix(vis),/shape/);
}
console.log("HPI catalogue, scoring, public projection and isolated migration contracts passed.");

```

## Appendix T (test): `tests/hpi-api.test.js`

```js
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshD1} from "./_sqlite-d1.js";
import {handleHpi,exportHpi,eraseHpi,sweepHpi} from "../functions/api/_handlers/hpi.js";
import {NOTICE,VERSION} from "../functions/api/_hpi_catalog.js";
const {sqlite,DB}=freshD1(), ts=new Date().toISOString();
const uids=["hpi_alice","hpi_bob","hpi_no_consent","hpi_not_invited"];
for(const uid of uids){
 sqlite.prepare("INSERT INTO users (id,name,email,email_hash,email_verified_hash,password_hash,password_salt,role,status,created_at,updated_at) VALUES (?,'N',?,?,?,'x','s','candidate','active',?,?)").run(uid,uid+"@test.invalid",uid,uid,ts,ts);
 if(uid!=="hpi_no_consent")sqlite.prepare("INSERT INTO candidate_consents (id,candidate_user_id,consent_type,consent_version,is_granted,accepted_at,created_at,updated_at) VALUES (?,?,'data_processing','v1',1,?,?,?)").run("cc_"+uid,uid,ts,ts,ts);
}
const env={DB,PII_ENCRYPTION_KEY:"local-hpi-fixture-only",ENABLE_HPI_RESEARCH:"true",HPI_RESEARCH_COHORT:uids.slice(0,3).join(",")};
const call=(name,data,uid=uids[0],role="candidate",override={})=>handleHpi("/hpi/"+name,new Request("https://{{brand}}.test/api/hpi/"+name,{method:data===undefined?"GET":"POST"}),{...env,...override},{id:uid,role,status:"active"},data);
async function success(r){assert.equal(r.status,200);return r.json();}
assert.equal((await call("catalogue",undefined,uids[0],"candidate",{ENABLE_HPI_RESEARCH:"false"})).status,404);
assert.equal((await call("catalogue",undefined,uids[0],"candidate",{PII_ENCRYPTION_KEY:""})).status,503);
assert.equal((await call("catalogue",undefined,uids[0],"client")).status,403);
assert.equal((await call("catalogue",undefined,uids[3])).status,404);
assert.equal((await call("catalogue",undefined,uids[2])).status,403);
const catalogue=await success(await call("catalogue"));
assert.equal(catalogue.modules.length,16);
const start={module_id:"C01",notice_version:NOTICE,consent:true};
assert.equal((await call("start",{...start,consent:false})).status,400);
const a=await success(await call("start",start));assert.equal(a.form.items[0].key,undefined);
const a2=await success(await call("start",start));assert.equal(a.attempt.id,a2.attempt.id);
const data={attempt_id:a.attempt.id,revision:0,answers:{n1:"o2"}};
assert.equal((await call("save",data,uids[1])).status,404);
assert.equal((await call("save",{...data,answers:{x:"o1"}})).status,400);
assert.equal((await success(await call("save",data))).revision,1);
assert.equal((await call("submit",data)).status,409);
const draft=sqlite.prepare("SELECT answers_encrypted,result_encrypted FROM hpi_research_attempts WHERE id=?").get(a.attempt.id);assert(draft.answers_encrypted.startsWith("enc:"));assert.equal(draft.result_encrypted,null);
const submitted=await success(await call("submit",{...data,revision:1}));assert.equal(submitted.result.credited,1);assert.equal(submitted.result.selectionAllowed,false);
assert.equal((await call("submit",{...data,revision:2})).status,409);
const exports=await success(await call("export",undefined,uids[0],"candidate",{ENABLE_HPI_RESEARCH:"false"}));assert.equal(exports.attempts[0].answers.n1,"o2");assert.equal(exports.attempts[0].result.credited,1);
assert.equal((await exportHpi(env,uids[1])).length,0);
const l=await success(await call("start",{...start,module_id:"L01"}));assert.equal(l.form.phase,0);assert.equal(l.form.items.length,4);
const d={attempt_id:l.attempt.id,revision:0,answers:{t1:"o2"}};
assert.equal((await call("submit",d)).status,409);
assert.equal((await call("advance",{...d,answers:{t5:"o1"}})).status,400);
const p=await success(await call("advance",d));assert.equal(p.form.phase,1);assert.equal(p.form.items[0].id,"t5");
assert.equal((await call("save",{...d,revision:1})).status,400);
const p2=await success(await call("advance",{...d,revision:1,answers:{t5:"o1"}}));assert.equal(p2.form.phase,2);
const end=await success(await call("submit",{...d,revision:2,answers:{t9:"o1"}}));assert.equal(end.result.stages.length,3);assert.equal(end.result.credited,undefined);
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM assessment_attempts WHERE candidate_user_id=?").get(uids[0]).n,0);
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM proof_badges WHERE candidate_user_id=?").get(uids[0]).n,0);
sqlite.prepare("UPDATE hpi_research_attempts SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(a.attempt.id);
assert.equal(await sweepHpi(env),1);
await success(await call("erase",{confirm:"DELETE HPI"},uids[0],"candidate",{ENABLE_HPI_RESEARCH:"false"}));
assert.equal((await exportHpi(env,uids[0])).length,0);
await success(await call("start",start));
await eraseHpi(env,uids[0]);assert.equal((await exportHpi(env,uids[0])).length,0);
// Status prompt: no error for ineligible candidates; open enrolment reaches non-cohort candidates only when switched on.
const st=async(uid,o={})=>(await success(await call("status",undefined,uid,"candidate",o)));
assert.deepEqual(await st(uids[3]),{ok:true,available:false});
assert.deepEqual(await st(uids[0],{ENABLE_HPI_RESEARCH:"false"}),{ok:true,available:false});
assert.deepEqual(await st(uids[0],{PII_ENCRYPTION_KEY:""}),{ok:true,available:false});
assert.equal((await st(uids[3],{HPI_OPEN_ENROLMENT:"true"})).available,true);
assert.equal((await call("catalogue",undefined,uids[3],"candidate",{HPI_OPEN_ENROLMENT:"true"})).status,200);
assert.equal((await call("catalogue",undefined,uids[3],"candidate",{HPI_OPEN_ENROLMENT:"true",ENABLE_HPI_RESEARCH:"false"})).status,404);
const core=(await st(uids[0])).core;assert.equal(core.total,4);assert.equal(typeof core.submitted,"number");
// Progress survives a form-version change: an earlier-version submission still counts.
const j3=await success(await call("start",{...start,module_id:"J03"}));
await success(await call("submit",{attempt_id:j3.attempt.id,revision:0,answers:{r1:"o3"}}));
const beforeBump=(await st(uids[0])).core.submitted;assert(beforeBump>=1);
sqlite.prepare("UPDATE hpi_research_attempts SET form_version='hpi-earlier' WHERE candidate_user_id=? AND module_id='J03' AND status='submitted'").run(uids[0]);
assert.equal((await st(uids[0])).core.submitted,beforeBump);
sqlite.prepare("UPDATE hpi_research_attempts SET form_version=? WHERE candidate_user_id=? AND module_id='J03' AND form_version='hpi-earlier'").run(VERSION,uids[0]);
assert.equal((await call("status",undefined,uids[0],"client")).status,403);
// Status applies the same consent gate as the other routes (Home never invites into a refusal).
assert.deepEqual(await st(uids[2]),{ok:true,available:false});
// The client only treats consent as given for the CURRENT notice version.
{const {hasConsent,rememberConsent}=await import("../public/candidate/js/models/hpi.js");const cat={notice_version:"n2"};assert.equal(hasConsent(cat,[{notice_version:"n1"}]),false,"older notice is not consent to the current one");assert.equal(hasConsent(cat,[{notice_version:"n2"}]),true);rememberConsent("n2");assert.equal(hasConsent(cat,[]),true);}
// Audit trail: every HPI mutation is logged with metadata only (no answers or results).
const auditRows=sqlite.prepare("SELECT event_type,metadata_json FROM audit_events WHERE event_type LIKE 'hpi.research.%'").all();
for(const t of ["hpi.research.started","hpi.research.saved","hpi.research.submitted","hpi.research.stage_advanced","hpi.research.erased"])assert(auditRows.some(r=>r.event_type===t),"missing audit "+t);
assert(auditRows.every(r=>!/"answers"|"result"|"o[0-9]"/.test(r.metadata_json)),"audit metadata must not carry responses");
// Export survives an unreadable payload (missing/rotated key) instead of failing the whole account export.
const kept=await success(await call("start",{...start,module_id:"C02"},uids[1]));
await success(await call("save",{attempt_id:kept.attempt.id,revision:0,answers:{v1:"o3"}},uids[1]));
const unreadable=await exportHpi({...env,PII_ENCRYPTION_KEY:"a-different-key"},uids[1]);
assert.equal(unreadable.length,1);assert.equal(unreadable[0].payload_unavailable,"encrypted_content_unreadable");assert.equal(unreadable[0].answers,null);
assert.equal((await exportHpi(env,uids[1]))[0].answers.v1,"o3");
// Unreadable payloads (rotated/missing key): attempts lists them as unavailable; start explains instead of a 500.
const sub=await success(await call("start",{...start,module_id:"C05"},uids[1]));
await success(await call("submit",{attempt_id:sub.attempt.id,revision:0,answers:{c1:"o3"}},uids[1]));
const rotated={PII_ENCRYPTION_KEY:"rotated-key-not-the-original"};
const listed=await success(await call("attempts",undefined,uids[1],"candidate",rotated));
assert.equal(listed.attempts.find(x=>x.module_id==="C05").payload_unavailable,"encrypted_content_unreadable");
assert.equal((await call("start",{...start,module_id:"C05"},uids[1],"candidate",rotated)).status,409);
assert.equal((await call("start",{...start,module_id:"C03"},uids[1],"candidate",rotated)).status,200);
// P01 is gated separately: refused while ENABLE_HPI_PERSONALITY is off, available when on; saves refused if switched off mid-way.
assert.equal((await call("start",{...start,module_id:"P01"},uids[1])).status,400);
const pOn={ENABLE_HPI_PERSONALITY:"true"};
const p01=await success(await call("start",{...start,module_id:"P01"},uids[1],"candidate",pOn));
assert.equal(p01.form.items.length,50);assert(p01.form.instructions.includes("Describe yourself"));
assert.equal((await call("save",{attempt_id:p01.attempt.id,revision:0,answers:{b1:"o5"}},uids[1])).status,409);
const pRes=await success(await call("submit",{attempt_id:p01.attempt.id,revision:0,answers:{b1:"o5",b6:"o5"}},uids[1],"candidate",pOn));
assert.equal(pRes.result.factors.find(f=>f.factor===1).mean,3);
// E02 timed protocol: gated; practice keys only; timing validated server-side; speed withheld.
{
 const eOn={ENABLE_HPI_PROCESSING:"true"};
 assert.equal((await call("start",{...start,module_id:"E02"},uids[1])).status,400);
 const e=await success(await call("start",{...start,module_id:"E02"},uids[1],"candidate",eOn));
 assert.equal(e.untimed,false);assert.equal(e.form.items.length,6);assert(e.form.items.every(i=>i.practiceKey));assert.equal(e.form.blockMs,60000);
 const b1=await success(await call("advance",{attempt_id:e.attempt.id,revision:0,answers:{x1:e.form.items[0].practiceKey}},uids[1],"candidate",eOn));
 assert(b1.form.items.every(i=>!("practiceKey" in i)),"scored trials carry no key");
 const id=e.attempt.id;
 assert.equal((await call("save",{attempt_id:id,revision:1,answers:{y1:"o1"}},uids[1],"candidate",eOn)).status,409);
 assert.equal((await call("advance",{attempt_id:id,revision:1,answers:{y1:"o1"}},uids[1],"candidate",eOn)).status,400,"timing required");
 // Claiming 30 s of active time 0 s after the block was issued is marked invalid (not rejected).
 const t={activeMs:30000,interruptions:1,modality:"keyboard",viewport:"large"};
 await success(await call("advance",{attempt_id:id,revision:1,answers:{y1:"o1"},timing:t},uids[1],"candidate",eOn));
 // Block 2 issued 70 s ago: a 55 s claim is valid; then score.
 sqlite.prepare("UPDATE hpi_research_attempts SET updated_at=? WHERE id=?").run(new Date(Date.now()-70000).toISOString(),id);
 const fin=await success(await call("submit",{attempt_id:id,revision:2,answers:{z1:"o1",z2:"o2"},timing:{...t,activeMs:55000}},uids[1],"candidate",eOn));
 const [bl1,bl2]=fin.result.blocks;
 assert.equal(bl1.timing.valid,false);assert.equal(bl2.timing.valid,true);assert.equal(bl2.reached,2);assert.equal(bl2.timing.unlimited,false);
 assert.equal(fin.result.researchOnly.status,"withheld");assert.equal(fin.result.researchOnly.correctPerMinute[0],null);
 assert.equal(typeof fin.result.researchOnly.correctPerMinute[1],"number");
 // Over the cap without an accommodation: invalid. With an approved extended-time accommodation: untimed, speed null.
 sqlite.prepare("INSERT INTO assessment_accommodations (id,candidate_user_id,request_type,status,created_at) VALUES ('acc1',?,'extended_time','approved',?)").run(uids[0],ts);
 const e0=await success(await call("start",{...start,module_id:"E02"},uids[0],"candidate",eOn));
 assert.equal(e0.untimed,true);
 await success(await call("advance",{attempt_id:e0.attempt.id,revision:0,answers:{x1:"o1"}},uids[0],"candidate",eOn));
 sqlite.prepare("UPDATE hpi_research_attempts SET updated_at=? WHERE id=?").run(new Date(Date.now()-200000).toISOString(),e0.attempt.id);
 const a1=await success(await call("advance",{attempt_id:e0.attempt.id,revision:1,answers:{y1:"o1"},timing:{...t,activeMs:150000}},uids[0],"candidate",eOn));
 assert(a1.form.phase===2);
 assert.equal(sqlite.prepare("SELECT used_at FROM assessment_accommodations WHERE id='acc1'").get().used_at,null,"HPIS never consumes the accommodation");
 const t0=(await exportHpi(env,uids[0])).find(x=>x.module_id==="E02").answers._timing[1];
 assert.equal(t0.unlimited,true);assert.equal(t0.valid,true);
 // No accommodation, 200 s elapsed, 90 s claimed against a 60 s cap: stored but invalid.
 const open={...eOn,HPI_OPEN_ENROLMENT:"true"};
 sqlite.prepare("INSERT INTO candidate_consents (id,candidate_user_id,consent_type,consent_version,is_granted,accepted_at,created_at,updated_at) VALUES ('cc_e02',?,'data_processing','v1',1,?,?,?)").run(uids[3],ts,ts,ts);
 const e3=await success(await call("start",{...start,module_id:"E02"},uids[3],"candidate",open));
 await success(await call("advance",{attempt_id:e3.attempt.id,revision:0,answers:{x1:"o1"}},uids[3],"candidate",open));
 sqlite.prepare("UPDATE hpi_research_attempts SET updated_at=? WHERE id=?").run(new Date(Date.now()-200000).toISOString(),e3.attempt.id);
 await success(await call("advance",{attempt_id:e3.attempt.id,revision:1,answers:{y1:"o1"},timing:{...t,activeMs:90000}},uids[3],"candidate",open));
 const t3=(await exportHpi(env,uids[3])).find(x=>x.module_id==="E02").answers._timing[1];
 assert.equal(t3.unlimited,false);assert.equal(t3.valid,false);
}
// Admin permanent deletion names the research table explicitly rather than relying on the FK cascade.
assert(/table: "hpi_research_attempts", sql: "DELETE FROM hpi_research_attempts WHERE candidate_user_id=\?"/.test(readFileSync(new URL("../functions/api/admin/candidates.js",import.meta.url),"utf8")));
sqlite.close();
console.log("HPI API ownership, opt-in, encryption, immutable submission, staged learning, expiry and erasure contracts passed.");

```

## Appendix T (test): `tests/hpi-independent-key.test.js`

```js
// Independent answer-key review for the HPI research forms.
//
// The catalogue's own keys are NOT used to derive the expected answers here. Each expected answer is
// either recomputed from the item's content (arithmetic, string comparison, parity, exhaustive
// constraint search) or taken from a second reviewer's hand-solved key written by option LABEL.
// Matching is by label, so an authored option-id mistake cannot hide behind a matching id.
//
// Limits, stated plainly: the second-reviewer judgment keys (C05, J01–J03, S01, some C02/C04/E03
// items) are one more reviewer's reading, not subject-matter-expert consensus or empirical keying.
import assert from "node:assert/strict";
import { MODULES, getModule } from "../functions/api/_hpi_catalog.js";
import { score, validOrders, publicForm } from "../functions/api/_hpi_engine.js";

const pct = (part, whole) => `${(part / whole) * 100}%`;
const rand = (n) => `R${n.toLocaleString("en-US")}`;
const alpha = (ch) => ch.charCodeAt(0) - 64;
const parity = (a, b) => (a % 2 === b % 2 ? "K" : "M");

// Computed from the prompt's numbers / symbols.
const computed = {
  n1: pct(18, 120),
  n2: 96 / 120 > 85 / 100 ? "A" : 96 / 120 < 85 / 100 ? "B" : "Equal",
  n3: rand((480 / 12) * 17),
  n4: (80000 - 60000) / 80000 > (60000 - 42000) / 60000 ? "North" : "South",
  n5: `${((270 - 250) / 250) * 100}% increase`,
  n6: String((36 / 9) * 15),
  n7: 75 / (30 + 45 + 75) === 0.5 ? "One half" : null,
  n8: rand(2400 - 2400 * 0.35),
  a1: "D", // A×1 B×2 C×3 D×4: the fourth D follows D D D.
  a2: String(23 * 2 + 1),
  a3: "YX",
  a4: "4", // pairs (k, 4k): 1,4 | 2,8 | 3,12 | 4,…
  a6: "YZX",
  a7: String(18 - 1),
  a8: "EF",
  // Exhaustively check the classification item: exactly one group breaks the +2,+2 step rule.
  a5: (() => {
    const groups = ["HJL", "KMN", "BDF", "PRT"];
    const odd = groups.filter((g) => !(alpha(g[1]) - alpha(g[0]) === 2 && alpha(g[2]) - alpha(g[1]) === 2));
    assert.equal(odd.length, 1, "a5 must have exactly one odd group");
    assert(groups.every((g) => !/[AEIOU]/.test(g)), "a5: no competing vowel rule");
    return odd[0];
  })(),
  d3: "2",
  d7: "X 6; Y 4",
  p2: 40 + 30 <= 75 ? "A and B sequentially" : null,
  p3: "15:30",
  t1: parity(4, alpha("B")), t2: parity(5, alpha("C")), t3: parity(4, alpha("C")), t4: parity(7, alpha("B")),
  t5: parity(6, alpha("D")), t6: parity(7, alpha("D")), t7: parity(7, alpha("E")), t8: parity(2, alpha("E")),
  t9: parity(8, 12), t10: parity(11, 8), t11: parity(9, 15), t12: parity(14, 3),
  // L02: stage 1 "greater than 50 → A"; stage 2 "even → A".
  ...Object.fromEntries([[1, 72], [2, 18], [3, 63], [4, 31]].map(([i, n]) => ["f" + i, n > 50 ? "Batch A" : "Batch B"])),
  ...Object.fromEntries([[5, 87], [6, 24], [7, 64], [8, 59], [9, 12], [10, 33]].map(([i, n]) => ["f" + i, n % 2 === 0 ? "Batch A" : "Batch B"])),
};

// Second reviewer's hand-solved key (by label) for items that need reading or judgment.
const reviewed = {
  v1: "True", v2: "Cannot determine", v3: "Check totals", v4: "False", v5: "Today",
  v6: "False", v7: "Cannot determine", v8: "Notify the customer",
  d2: "X is not approved", d5: "Lee is authorized", d6: "C", d8: "Cannot determine",
  c1: "The increase cannot be attributed to any single change from this data",
  c2: "An anonymous survey of a random sample of staff across all departments",
  c3: "The added steps target the causes of the capture errors",
  c4: "Check the date, source and definition behind each figure before choosing",
  c5: "The result is encouraging but not conclusive; a larger or longer trial is needed",
  p4: "Split into groups of 6 and 5",
  p5: "Reviewer A checks file 1; reviewer B checks file 2",
  j1: "Check whether INV-240 exists and whose it is, then confirm with the customer before allocating",
  j2: "Check whether the new data source repeats orders already in the original source",
  j3: "Query the 10-box difference with receiving and the supplier, and hold the invoice until resolved",
  j4: "Compare the VAT settings and calculation on an affected and an unaffected invoice",
  j5: "Trace both totals back to their formulas and source ranges",
  s1: "Tell your manager now, explain the delay and offer options such as a partial report on Friday",
  s2: "Tell the recipients now and send a corrected, checked version",
  s3: "Help the finance director and tell your manager the list may be late",
  s4: "Ask a few questions about scope and timing, then give an estimate with your assumptions stated",
  s5: "A note of the issue, what has been done, what is outstanding and who to contact",
  r1: "Call the supplier on the number already held in the verified supplier file, before changing anything",
  r2: "Send the statement to the customer's contact on file and let the colleague know it was sent",
  r3: "Declare the relationship to your manager and follow their instruction on who evaluates the quotes",
  r4: "Escalate to the person authorised to approve in the approver's absence, and tell the supplier when payment is expected",
  r5: "Only the details of the three accounts needed for collection, through the approved channel",
  i1: "Talk to the colleague privately, show examples and agree what a complete batch needs",
  i2: "Help them compare deadlines and dependencies, and suggest they check with their manager if still unsure",
  i3: "That it is with finance, when you will update them, and then follow up",
  i4: "Ask how it is going and what they have tried, and offer help",
  i5: "Ask for examples, check them, and agree how to prevent them",
};

// Order items: constraints re-read from the prompt (by label), solved by exhaustive search here.
const orderConstraints = {
  d1: [["A", "C"], ["C", "B"], ["B", "D"]],
  d4: [["Receive", "Inspect"], ["Inspect", "Label"], ["Label", "Store"]],
  p1: [["Collect", "Check"], ["Check", "Correct"], ["Correct", "Send"]],
};
const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

let checked = 0;
for (const m of MODULES) {
  if (m.status !== "research" || m.kind === "preferences" || m.kind === "inventory") continue;
  for (const item of m.items) {
    const label = (oid) => item.options.find((o) => o.id === oid).label;
    if (item.kind === "order") {
      const pairs = orderConstraints[item.id];
      assert(pairs, `${item.id}: no independent constraints recorded`);
      const labels = item.options.map((o) => o.label);
      const solutions = perms(labels).filter((p) => pairs.every(([a, b]) => p.indexOf(a) < p.indexOf(b)));
      const engine = validOrders(item).map((p) => p.map(label));
      assert.deepEqual(engine.map(String).sort(), solutions.map(String).sort(), `${item.id}: engine constraints disagree with the prompt`);
      checked++;
      continue;
    }
    if (item.visual) continue;
    let expected;
    if ("original" in item) expected = item.original === item.captured ? "Match" : "Different";
    else expected = computed[item.id] ?? reviewed[item.id];
    assert(expected != null, `${item.id}: every scored item needs an independent key`);
    assert(item.options.some((o) => o.label === expected), `${item.id}: independent answer "${expected}" is not an option`);
    assert.equal(label(item.key), expected, `${item.id}: catalogue key disagrees with independent key`);
    checked++;
  }
}
assert.equal(checked, 180, "every scored text research item reviewed (incl. 86 E02 trials, keys from data)");

// L02 variant B (counterbalanced): stage 1 parity rule, stage 2 size rule, recomputed here.
const l02b = getModule("L02", "B");
const codesB = [72, 18, 63, 31, 87, 24, 64, 59, 12, 33];
for (const [i, item] of l02b.items.entries()) {
  const n = codesB[i], parityLabel = n % 2 === 0 ? "Batch A" : "Batch B", sizeLabel = n > 50 ? "Batch A" : "Batch B";
  const lab = oid => item.options.find(o => o.id === oid).label;
  assert.equal(item.prompt, "Code " + n);
  assert.equal(lab(item.key), i < 4 ? parityLabel : sizeLabel, `L02-B ${item.id}`);
  if (i >= 4) assert.equal(lab(item.oldKey), parityLabel, `L02-B ${item.id} obsolete-rule answer`);
}
// C03 visual matrices: solved from the PUBLIC form only (what the candidate sees), by an independent brute
// force: an option is correct if, for every feature, some simple grid rule explains all nine cells with it.
{
  const fams = [() => 0, r => r, (r, c) => c, (r, c) => (r + c) % 3, (r, c) => (r + 2 * c) % 3];
  const fits = (cells, f) => fams.some(g => { const m = new Map(); return cells.every((cell, i) => { const k = g(Math.floor(i / 3), i % 3); if (m.has(k) && m.get(k) !== cell[f]) return false; m.set(k, cell[f]); return true; }); });
  const pub = publicForm("C03").items.filter(i => i.visual);
  assert.equal(pub.length, 6);
  for (const item of pub) {
    const ok = item.options.filter(o => ["shape", "count", "fill"].every(f => fits([...item.visual.cells.slice(0, 8), o.visual], f)));
    assert.equal(ok.length, 1, `${item.id}: exactly one option completes the grid`);
    const internal = MODULES.find(m => m.id === "C03").items.find(i => i.id === item.id);
    assert.equal(ok[0].id, internal.key, `${item.id}: key matches independent solution`);
    // Option-only strategy (most common feature values) must not single out the answer.
    const counts = f => item.options.reduce((acc, o) => ((acc[o.visual[f]] = (acc[o.visual[f]] || 0) + 1), acc), {});
    const scoreOpt = o => ["shape", "count", "fill"].reduce((t, f) => t + counts(f)[o.visual[f]], 0);
    const best = Math.max(...item.options.map(scoreOpt));
    assert(item.options.filter(o => scoreOpt(o) === best).length > 1, `${item.id}: answer findable without the grid`);
    assert(!("key" in item) && item.visual.cells[8] === null);
    checked++;
  }
  assert.equal(checked, 186, "every scored research item reviewed, including matrices");
}
// E01: fixed response mapping on every trial, so a response-position error cannot masquerade as a
// perceptual one.
const e01 = MODULES.find((m) => m.id === "E01");
assert(e01.items.every((i) => i.options[0].label === "Match" && i.options[1].label === "Different"));

// Constraint scoring accepts every valid order, not only the author's reference order.
const synthetic = { id: "x", domain: "seq", kind: "order", options: ["a", "b", "c"].map((l, i) => ({ id: "o" + (i + 1), label: l })), key: ["o1", "o2", "o3"], before: [["o1", "o3"]] };
assert.equal(validOrders(synthetic).length, 3); // abc, bac, acb
const c04 = MODULES.find((m) => m.id === "C04");
const d1Valid = validOrders(c04.items.find((i) => i.id === "d1"))[0];
const d1Wrong = ["o1", "o2", "o3", "o4"];
assert.equal(score("C04", { d1: d1Valid }).credited, 1);
const wrong = score("C04", { d1: d1Wrong });
assert.equal(wrong.credited, 0);
assert(wrong.constraintViolations > 0);

console.log(`HPI independent answer-key review passed (${checked} scored items; judgment keys are second-reviewer, not SME-validated).`);

```

## Appendix T (test): `tests/hpi-home-card.test.js`

```js
// Candidate Home: the optional Human Potential card renders only when the server offers it, sits below
// the go-live tasks (never in "Your next step"), and promises nothing about employers or scores.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "../public/candidate/js/views/home.js";

const base = {
  stand: { tag: { group: "admin", value: "draft_incomplete" }, sentence: "Your profile is not live yet.", score: 40, floor: 75, adminStatus: "draft_incomplete" },
  hasProfile: true, next: { label: "Finish your profile", href: "#/profile" }, availability: null,
  yourTasks: [{ key: "profile_floor", label: "Profile 75% complete", status: "todo", owner: "you" }], {{brand}}Checks: [],
  notifications: { items: [], unread: 0 }, card: null, activity: [],
};
const text = (m) => String(render(m));

assert(!text({ ...base, hpi: null }).includes("Human Potential"), "no card when not offered");
const html = text({ ...base, hpi: { total: 4, submitted: 1, estimate_minutes: 15 } });
assert(html.includes("Human Potential (optional)"));
assert(html.includes("1 of 4 done") && html.includes("About 15 minutes"));
assert(html.includes('href="#/human-potential"') && html.includes(">Continue<"));
assert(html.indexOf("Your next step") < html.indexOf("What you need to do"));
const cardAt = html.indexOf('id="hpi-h"');
assert(cardAt > 0 && html.indexOf("What you need to do") < cardAt, "card sits below the go-live tasks");
// Beside the score: optional progress and the full-profile figure (profile 65% + core 35%), never replacing the score.
const { fullProfile } = await import("../public/candidate/js/models/hpi.js");
assert.equal(fullProfile(40, 1, 4), Math.round(40 * 0.65 + 25 * 0.35));
assert(html.indexOf("Full Human Potential profile") > 0 && html.indexOf("Full Human Potential profile") < html.indexOf("Your next step"), "shown in Where you stand");
assert(html.includes(`<span class="num">${fullProfile(40, 1, 4)}%</span>`));
assert(html.includes("Only your profile score decides when you go live"));
assert(html.includes('<span class="num">40%</span>'), "go-live score still shown unchanged");
assert(!text({ ...base, hpi: null }).includes("Full Human Potential profile"));
assert(/do not affect your profile score, proof badges or what employers see/.test(html));
assert(text({ ...base, hpi: { total: 4, submitted: 4, estimate_minutes: 15 } }).includes("completed the core exercises"));

// load(): status is fetched with the other reads under allSettled and any failure or unavailability hides the card.
const src = readFileSync(new URL("../public/candidate/js/views/home.js", import.meta.url), "utf8");
assert(/api\.get\("\/api\/hpi\/status"\),?\s*\]\);/.test(src));
assert(src.includes('hpi.status === "fulfilled" && hpi.value?.available ? hpi.value.core : null'));
console.log("HPI home card contract passed.");

```

## Appendix T (test): `tests/hpi-research-stats.test.js`

```js
// Admin HPIS research statistics: aggregate only, notice-gated, small-cell suppression, admin-only, audited.
import assert from "node:assert/strict";
import { adminFixture, iso } from "./_admin-fixture.js";
import { onRequestGet as statsGet, MIN_CELL, moduleStats } from "../functions/api/admin/hpi-research.js";
import { handleHpi } from "../functions/api/_handlers/hpi.js";
import { NOTICE, getModule } from "../functions/api/_hpi_catalog.js";

const ids = Array.from({ length: 12 }, (_, i) => "hpi_stat_" + i);
const fx = await adminFixture({ ENABLE_HPI_RESEARCH: "true", HPI_RESEARCH_COHORT: ids.join(",") });
const { run, sqlite, env, fileGet, auditCount } = fx;
for (const uid of ids) {
  run("INSERT INTO users (id,name,email,email_hash,email_verified_hash,password_hash,password_salt,role,status,created_at,updated_at) VALUES (?,'N',?,?,?,'x','s','candidate','active',?,?)", uid, uid + "@test.invalid", uid, uid, iso(0), iso(0));
  run("INSERT INTO candidate_consents (id,candidate_user_id,consent_type,consent_version,is_granted,accepted_at,created_at,updated_at) VALUES (?,?,'data_processing','v1',1,?,?,?)", "cc_" + uid, uid, iso(0), iso(0), iso(0));
}
const call = (uid, name, data) => handleHpi("/hpi/" + name, new Request("https://{{brand}}.test/api/hpi/" + name, { method: "POST" }), env, { id: uid, role: "candidate", status: "active" }, data);
async function submit(uid, moduleId, answers) {
  const s = await (await call(uid, "start", { module_id: moduleId, notice_version: NOTICE, consent: true })).json();
  const r = await call(uid, "submit", { attempt_id: s.attempt.id, revision: 0, answers });
  assert.equal(r.status, 200);
}
// C01: 12 candidates; the first half answer n1 correctly. E01: 3 candidates (below MIN_CELL).
for (const [i, uid] of ids.entries()) await submit(uid, "C01", { n1: i < 6 ? "o2" : "o1", n2: "o3" });
for (const uid of ids.slice(0, 3)) await submit(uid, "E01", { e1: "o2" });
// L02 for 10 candidates: half follow the old rule on every conflict trial.
for (const [i, uid] of ids.slice(0, 10).entries()) {
  const st = await (await call(uid, "start", { module_id: "L02", notice_version: NOTICE, consent: true })).json();
  await call(uid, "advance", { attempt_id: st.attempt.id, revision: 0, answers: { f1: "o1" } });
  // Answer by the stage-1 rule of THIS attempt's variant (old) or its stage-2 rule (new).
  const old = i < 5, variant = st.attempt.form_variant;
  assert(["A", "B"].includes(variant));
  const size = n => (n > 50 ? "o1" : "o2"), parity = n => (n % 2 === 0 ? "o1" : "o2");
  const rule = old ? (variant === "A" ? size : parity) : (variant === "A" ? parity : size);
  assert.equal((await call(uid, "submit", { attempt_id: st.attempt.id, revision: 1, answers: { f5: rule(87), f6: rule(24), f8: rule(59), f9: rule(12) } })).status, 200);
}
// An attempt made under the old notice is excluded from statistics.
sqlite.prepare("UPDATE hpi_research_attempts SET notice_version='hpi-research-notice-1' WHERE candidate_user_id=? AND module_id='C01'").run(ids[11]);

const res = await fileGet(statsGet, "/api/admin/hpi-research");
assert.equal(res.status, 200);
const body = res.body, text = JSON.stringify(body);
for (const uid of ids) assert(!text.includes(uid), "no candidate ids in statistics");
assert(!/"answers"|"o[0-9]"/.test(text), "no raw answers or option ids");
const c01 = body.modules.find(m => m.module_id === "C01");
assert.equal(c01.submissions, 11); assert.equal(c01.suppressed, false);
const n1 = c01.items.find(i => i.item_id === "n1");
assert.equal(n1.facility, Math.round((6 / 11) * 1000) / 1000);
assert.equal(n1.options["15%"], 6);
assert.equal(c01.items.find(i => i.item_id === "n3").omitted, 11);
const e01 = body.modules.find(m => m.module_id === "E01");
assert.equal(e01.suppressed, true); assert.equal(e01.items, undefined); assert.equal(e01.submissions, 3);
assert.deepEqual(body.l02_obsolete_rule_distribution, { conflict_trials: 4, distribution: { "0": 5, "4": 5 } });
assert.equal(auditCount("admin.hpi.research_stats_viewed"), 1);

// Admin only.
const anon = await statsGet({ request: new Request("https://{{BRAND_DOMAIN}}/api/admin/hpi-research"), env });
assert.equal(anon.status, 401);

// Item-rest correlation is computed from data and is null when there is no variance.
const m = getModule("C04");
const subs = Array.from({ length: MIN_CELL }, (_, i) => ({ answers: { d2: i % 2 ? "o3" : "o1", d3: i % 2 ? "o2" : "o1" }, minutes: i }));
const st = moduleStats(m, subs);
assert.equal(st.items.find(i => i.item_id === "d2").item_rest_r, 1);
assert.equal(st.items.find(i => i.item_id === "d5").item_rest_r, null);
assert.equal(st.median_minutes_start_to_submit, 4.5);
// Pilot invitations: by candidate code, audited, grant eligibility without the env cohort, removed on erasure.
const { hpiEligible, eraseHpiInvite } = await import("../functions/api/_handlers/hpi.js");
const { onRequestPost: invitePost } = await import("../functions/api/admin/hpi-research.js");
run("INSERT INTO users (id,name,email,email_hash,email_verified_hash,password_hash,password_salt,role,status,created_at,updated_at) VALUES ('pilot_c','N','p@test.invalid','p','p','x','s','candidate','active',?,?)", iso(0), iso(0));
run("INSERT INTO candidate_profiles (id,user_id,candidate_code,created_at,updated_at) VALUES ('pp','pilot_c','CAND-PILOT1',?,?)", iso(0), iso(0));
const noCohort = { ...env, HPI_RESEARCH_COHORT: "" };
assert.equal(await hpiEligible(noCohort, { id: "pilot_c" }), false);
const post = async body => { const r = await invitePost({ request: fx.cookieReq("/api/admin/hpi-research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env }); return { status: r.status, body: await r.json() }; };
assert.equal((await post({ action: "invite", candidate_code: "tal-pilot1" })).body.changed, true);
assert.equal((await post({ action: "invite", candidate_code: "CAND-PILOT1" })).body.changed, false);
assert.equal((await post({ action: "invite", candidate_code: "CAND-NOPE" })).status, 404);
assert.equal((await post({ action: "delete", candidate_code: "CAND-PILOT1" })).status, 400);
assert.equal(await hpiEligible(noCohort, { id: "pilot_c" }), true);
assert.equal(await hpiEligible({ ...noCohort, ENABLE_HPI_RESEARCH: "false" }, { id: "pilot_c" }), false);
assert.equal(auditCount("admin.hpi.pilot_invited"), 1);
assert((await fileGet(statsGet, "/api/admin/hpi-research")).body.invites.some(i => i.candidate_code === "CAND-PILOT1"));
assert.equal((await post({ action: "revoke", candidate_code: "CAND-PILOT1" })).body.changed, true);
assert.equal(await hpiEligible(noCohort, { id: "pilot_c" }), false);
await post({ action: "invite", candidate_code: "CAND-PILOT1" }); await eraseHpiInvite(env, "pilot_c");
assert.equal(await hpiEligible(noCohort, { id: "pilot_c" }), false);
const anonPost = await invitePost({ request: new Request("https://{{BRAND_DOMAIN}}/api/admin/hpi-research", { method: "POST", body: "{}" }), env });
assert.equal(anonPost.status, 401);
sqlite.close();
console.log("HPI research statistics contract passed.");

```

## Appendix T (test): `tests/hpi-fairness.test.js`

```js
// HPIS fairness research: separate opt-in, aggregate-only Mantel-Haenszel DIF screen, never used in scoring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mhDif, difScreen, MIN_GROUP } from "../functions/api/_hpi_fairness.js";
import { adminFixture, iso } from "./_admin-fixture.js";
import { handleHpi, exportHpi, eraseHpi } from "../functions/api/_handlers/hpi.js";
import { onRequestGet as statsGet } from "../functions/api/admin/hpi-research.js";
import { NOTICE } from "../functions/api/_hpi_catalog.js";
import { FAIRNESS_NOTICE } from "../functions/api/_hpi_fairness.js";
import { encryptField } from "../functions/api/_crypto.js";

// 1. Pure DIF screen on synthetic data. Ability 0..4 drives items i1..i4 identically for both groups; item
//    "bias" is answered correctly by group R at ability >= 2 but by group F only at ability 4.
const items = ["i1", "i2", "i3", "i4", "bias"];
const recs = [];
for (const group of ["R", "F"]) for (let k = 0; k < 40; k++) {
  const ability = k % 5, scores = {};
  for (let j = 1; j <= 4; j++) scores["i" + j] = ability >= j ? 1 : 0;
  scores.bias = group === "R" ? (ability >= 2 ? 1 : 0) : (ability >= 4 ? 1 : 0);
  recs.push({ group, scores });
}
// Degenerate case: complete separation must be flagged as extreme, not silently dropped.
let byItem = Object.fromEntries(difScreen(items, recs, "test").comparisons[0].items.map(i => [i.item_id, i]));
assert.equal(byItem.bias.flag, true); assert.equal(byItem.bias.extreme, "favours_reference");
for (const id of ["i1", "i2", "i3"]) assert(!byItem[id].flag, `${id} not flagged`);
// Noisy case: some focal candidates at ability 2-3 also succeed, giving a finite, large negative D-DIF.
recs.forEach((r, k) => { if (r.group === "F" && [2, 3].includes(k % 5) && k % 4 === 0) r.scores.bias = 1; if (r.group === "R" && [2, 3].includes(k % 5) && k % 8 === 3) r.scores.bias = 0; });
byItem = Object.fromEntries(difScreen(items, recs, "test").comparisons[0].items.map(i => [i.item_id, i]));
assert.equal(byItem.bias.flag, true); assert(byItem.bias.mh_d_dif <= -1.5, "finite large negative D-DIF: " + byItem.bias.mh_d_dif);
assert.equal(byItem.bias.extreme, undefined);
assert.equal(difScreen(items, recs.slice(0, MIN_GROUP + 10), "small").suppressed, true, "one group only: suppressed");
assert.deepEqual(mhDif("i1", items, [{ group: "R", scores: { i1: 1 } }], "R", "F"), { d: null, extreme: null });

// 2. Scoring never touches demographics or fairness code.
for (const f of ["_hpi_engine.js", "_hpi_catalog.js", "_hpi_visual.js"]) {
  const src = readFileSync(new URL("../functions/api/" + f, import.meta.url), "utf8");
  assert(!/gender|ee_classification|_hpi_fairness|fairness_consents|date_of_birth/.test(src), `${f} must not reference demographics`);
}

// 3. Opt-in routes, data rights and the admin screen end to end.
const fx = await adminFixture({ ENABLE_HPI_RESEARCH: "true", HPI_OPEN_ENROLMENT: "true" });
const { run, sqlite, env, fileGet } = fx;
const call = (uid, name, data, extra = {}) => handleHpi("/hpi/" + name, new Request("https://{{brand}}.test/api/hpi/" + name, { method: data === undefined ? "GET" : "POST" }), { ...env, ...extra }, { id: uid, role: "candidate", status: "active" }, data);
const on = { ENABLE_HPI_FAIRNESS_RESEARCH: "true" };
const N = 70;
for (let k = 0; k < N; k++) {
  const uid = "fair_" + k;
  run("INSERT INTO users (id,name,email,email_hash,email_verified_hash,password_hash,password_salt,role,status,created_at,updated_at) VALUES (?,'N',?,?,?,'x','s','candidate','active',?,?)", uid, uid + "@t.invalid", uid, uid, iso(0), iso(0));
  run("INSERT INTO candidate_consents (id,candidate_user_id,consent_type,consent_version,is_granted,accepted_at,created_at,updated_at) VALUES (?,?,'data_processing','v1',1,?,?,?)", "c" + uid, uid, iso(0), iso(0), iso(0));
  run("INSERT INTO candidate_profiles (id,user_id,candidate_code,gender,ee_classification,age,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", "p" + uid, uid, "CAND-F" + k,
    await encryptField(k % 2 ? "Female" : "Male", env.PII_ENCRYPTION_KEY), await encryptField("Group " + (k % 3), env.PII_ENCRYPTION_KEY), 22 + (k % 20), iso(0), iso(0));
  const st = await (await call(uid, "start", { module_id: "C01", notice_version: NOTICE, consent: true })).json();
  // n1 correct for everyone at the same rate regardless of gender; the rest vary with k.
  await call(uid, "submit", { attempt_id: st.attempt.id, revision: 0, answers: { n1: k % 4 ? "o2" : "o1", n2: k % 3 ? "o3" : "o1", n3: k % 5 ? "o4" : "o1" } });
}
// Grant requires the switch and the current notice; withdrawal works with everything off.
assert.equal((await call("fair_0", "fairness", { grant: true, notice_version: FAIRNESS_NOTICE })).status, 404);
assert.equal((await call("fair_0", "fairness", { grant: true, notice_version: "old" }, on)).status, 400);
for (let k = 0; k < N - 5; k++) assert.equal((await call("fair_" + k, "fairness", { grant: true, notice_version: FAIRNESS_NOTICE }, on)).status, 200);
assert.equal((await (await call("fair_1", "fairness", undefined, on)).json()).granted, true);
const w = await call("fair_1", "fairness", { grant: false }, { ENABLE_HPI_RESEARCH: "false" });
assert.equal(w.status, 200);
assert.equal((await (await call("fair_1", "export")).json()).fairness_consent, null);
assert((await (await call("fair_2", "export")).json()).fairness_consent.notice_version === FAIRNESS_NOTICE);
await eraseHpi(env, "fair_3");
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM hpi_fairness_consents WHERE candidate_user_id='fair_3'").get().n, 0);
assert.equal(Number(sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE event_type='hpi.fairness.withdrawn'").get().n), 1);

// Admin: section absent when switched off; with it on, aggregate only, opted-in only (N-5 granted, 2 removed).
assert.equal((await fileGet(statsGet, "/api/admin/hpi-research")).body.fairness, null);
const res = await statsGet({ request: fx.cookieReq("/api/admin/hpi-research"), env: { ...env, ...on } });
const body = await res.json(), text = JSON.stringify(body.fairness);
assert.equal(body.fairness.opted_in, N - 5 - 2);
assert(!/fair_\d|CAND-F|\bo[0-9]\b/.test(text), "no ids, codes or raw answers");
const c01 = body.fairness.modules.find(m => m.module_id === "C01");
assert.equal(c01.n, N - 5 - 2);
const g = c01.variables.find(v => v.variable === "gender");
assert.equal(g.suppressed, false);
assert(g.comparisons[0].focal.n >= MIN_GROUP && g.reference.n >= MIN_GROUP);
assert.equal(c01.variables.find(v => v.variable === "ee_classification").suppressed, true, "groups of ~21 suppressed");
sqlite.close();
console.log("HPI fairness research contract passed.");

```

## Appendix T (test): `tests/candidate-dialog-above-banner.test.js`

```js
// Regression (found with the Obscura browser, 2026-11-25): on a phone, while the analytics consent banner was unanswered,
// every bottom-sheet dialog (leave without saving, delete, consent changes) rendered BEHIND the banner. The dialog makes
// the rest of the page inert, so the candidate was left with no visible question and no usable buttons.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../public/candidate/portal.css", import.meta.url), "utf8");
const banner = readFileSync(new URL("../public/analytics-consent.js", import.meta.url), "utf8");
const overlayZ = Number(css.match(/\.overlay\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
const bannerZ = Number(banner.match(/#{{brand}}-analytics-banner\{[^}]*z-index:(\d+)/)?.[1]);
assert(Number.isFinite(overlayZ) && Number.isFinite(bannerZ), "both z-index values found");
assert(overlayZ > bannerZ, `dialog overlay (${overlayZ}) must stack above the analytics banner (${bannerZ})`);
console.log("Candidate dialog stacks above the analytics banner.");

```
