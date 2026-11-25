# Agent prompt: build the Talent Tree Workplace Personality Profile (candidate-private research pilot)

Repository: `Mumoxa/tt-website`. Start from branch `claude/hpis-rebuild-spec` and work on a new branch, `claude/workplace-personality-profile`. Do not merge to `main` and do not deploy.

## 0. Read first, in this order

1. `AGENTS.md`, then `Mumoxa/agent-instructions/AGENTS.md` (canonical). Rule zero: no invented facts, files, test results or deployment status.
2. `DESIGN.md` and the token block at the top of `src/styles.css`. These are the only source of truth for colour, type, spacing, radius and shadow.
3. `docs/assessments/HPIS_REBUILD_SPEC.md`. Read the whole file, and especially:
   - §2 design principles
   - §3 module P01
   - §4 inventory scoring
   - §5–7 data, switches and API
   - §8 candidate flow
   - §10 fairness
   - §11 tests
   - §14 governance gates
   - Appendices B, C, F1, G and H1–H3
4. The existing assessment code in `src/assessments/`, `functions/api/assessment/`, `functions/api/admin/` and `migrations/assessments/`, and `docs/assessments/DEPLOYMENT_RUNBOOK.md`, `PRIVACY_AND_CONTENT_APPROVAL_DRAFT.md` and `PRODUCT_HANDOFF.md`. Reuse their auth, consent, encryption, audit, admin and result-email patterns. Do not duplicate them.

## 1. Facts you must not get wrong

- **Nothing is implemented in this repo yet.** The branch holds only the spec document. You are building the module, not finishing one.
- **Stack mismatch.** The spec's appendix code is vanilla JS written for a different platform. This repo is React + Vite (`src/main.jsx`), with Cloudflare Pages Functions and D1. Port the logic and contracts; do not paste the vanilla views.
  - Server-side catalogue, scoring and validation (Appendices B and C) can be ported almost verbatim.
  - The front end must be React components that follow the existing `src/assessments/` conventions.
- **What the Workplace Personality Profile is.** It is module **P01**: the 50-item IPIP representation of Goldberg's Big-Five markers.
  - The items are public domain, and must be used verbatim, in the same order and with the same keys. Keep the provenance file (Appendix G) under `docs/assessments/provenance/`.
  - Self-description only. Show the five factor means (1–5) with "neither end is better".
  - Never show types, archetypes, pass or fail, percentiles, norms, "fit" or a composite.
- **Candidate-private.** No employer, client or admin view of any individual answer or result. Do not include results in the existing result emails, which go to recruiters. This is the most important difference from the current AP and AR assessments; check every email and notification path.
- **Legal gate.** The registered industrial psychologist review (Employment Equity Act s8 / HPCSA) and the POPIA legal review are **human gates that you cannot complete**. Ship everything behind switches that default to `"false"`, and say plainly in the handoff that nobody may take the questionnaire until those sign-offs exist.

## 2. What to build (the candidate-private flow and safeguards)

1. **Migration** (number it after the existing assessment migrations). Create the `hpi_research_attempts` table with the `form_variant` column, plus `hpi_research_invites` (Appendix A). Skip the fairness table unless you build §2.8.
2. **Server.**
   - Port `_hpi_catalog.js`, keeping only P01. Keep `VERSION`, notice ids and item ids.
   - Port the inventory paths of `_hpi_engine.js`: `publicForm`, `normalizeAnswers`, inventory `score` and `assertCatalogue`.
   - Port the handler routes `/status`, `/catalogue`, `/attempts`, `/start`, `/save`, `/submit`, `/export` and `/erase`, with exactly the check order in spec §7.
   - Reproduce these safeguards:
     - feature switches
     - eligibility (invite or cohort; open enrolment off)
     - the existing candidate auth and consent gate
     - rate limiting
     - AES-GCM encryption of answers and results, using this repo's existing encryption helper and salt
     - optimistic `revision` compare-and-set
     - one attempt per candidate, module and version
     - 90-day expiry, plus a retention sweep
     - audit events with metadata only
     - export and erase that work even with every switch off
     - account erasure and permanent-delete hooks
3. **Switches.** Add `ENABLE_HPI_RESEARCH` and `ENABLE_HPI_PERSONALITY` (both `"false"`) and `HPI_OPEN_ENROLMENT` (`"false"`) to `wrangler.toml`, with the explanatory comments. Document them in the runbook.
4. **Consent.** Ask once, before the first screen. Use four plain bullets:
   - optional and private
   - no effect on hiring or on what clients see
   - kept up to 90 days, and you can download or delete it
   - staff see that you took part, never your answers

   Add the full notice behind a disclosure. Rewrite the notice text for Talent Tree, keeping every claim; do not add claims the system does not enforce. If you change the wording, bump the notice id.
5. **Candidate UI (React).**
   - Intro: the P01 instruction, the statement count, five statements to a screen, no time limit, "no right or wrong answers".
   - Paged screens of five statements, each on the 5-point scale Very Inaccurate → Very Accurate.
   - A numbered screen index with answered and current states.
   - Autosave on every move, with a visible save status and a failure alert that keeps the answers on the page.
   - "Save and leave", and a leave guard while changes are unsaved.
   - Review page: blanks allowed and listed as links; Finish disabled until at least one answer.
   - Private result: five factor means, the "answered n of 10" line per factor, and the research disclaimer.
   - Download-my-data and delete-my-data actions (confirm dialog defaulting to Cancel).
6. **Admin.** An invite and revoke control by candidate identifier, audited. Aggregate statistics only (option counts and blanks per item), suppressed below 10 submissions. No ids and no individual answers.
7. **Tests** (`node --test tests/*.test.mjs`).
   - Port the relevant parts of the spec's test files (Appendix T): catalogue integrity, the public-form whitelist (no `factor` or `sign` sent to the browser), and reverse-key scoring (`6 - v`).
   - API matrix:
     - unauthenticated
     - another candidate (404)
     - client or admin on candidate routes (403)
     - switches off
     - no invite
     - missing key (503)
     - wrong revision (409)
     - duplicate submit
     - expiry
     - export and erase with switches off
     - audit metadata free of answers
     - existing assessment tables and result emails untouched
   - Add a Playwright run of the full flow at 390 px and at desktop width: no horizontal overflow, focus moves to the heading on each screen, and the whole flow can be completed by keyboard alone.
8. **Optional, only if time remains:** the fairness opt-in and DIF screen (spec §10), behind its own switch that defaults to off.

## 3. Design: Talent Tree brand, using taste-skill

- Install taste-skill for this session from https://github.com/leonxlnx/taste-skill. It is not currently in `.agents/skills/`; do not commit it unless asked. Read its SKILL.md before designing.
- **Precedence:** `DESIGN.md` / `src/styles.css` tokens > this prompt > taste-skill.
  - Use taste-skill for judgment: hierarchy, restraint, spacing rhythm, anti-template checks and micro-interactions.
  - Ignore its stack defaults (Tailwind, Motion, icon packages, stock photos, shaders).
  - taste-skill is written for marketing pages. This is an assessment screen, so favour calm, legible, low-distraction layouts over hero moments.
- **Palette (only these tokens; no new colours):**
  - text `--ink #0e2a3a`
  - dark bands and primary button `--ink-deep #071f2d`
  - surfaces `--paper #f4f1ea` / `--paper-soft #fbf9f4` / `--white`
  - the single accent `--accent #006da3` (on dark, `--accent-bright #5ab9e8`; wash `--accent-soft #d9eaf3`)
  - secondary text `--muted #4f6b7a`
  - hairlines `--line` / `--line-strong`

  The selected scale option uses the accent and a check or shape as well, so the state never depends on colour alone.
- **Type:** Fraunces 500 for headings, Inter for body and controls, `tabular-nums` for the factor means. Radius `--radius: 2px`, only the shadows defined in `DESIGN.md`, one easing curve, and everything disabled under `prefers-reduced-motion`.
- **Logo:** use the existing Talent Tree logo asset. Check `public/logos/`, `src/profile/finance/logos.js` and `src/cv-builda/cv/logo.js` for the canonical one, and do not use the root `Talent Tree Logo 2026 (1).png` if a vector version exists. Place it in the same header pattern the current assessment pages use.
- Match the existing assessment pages (`src/assessments/*.css`) so the profile looks like part of the same product.
- Do not show a results visual that implies ranking (no gauges, no "high/low" colouring, no radar chart that suggests a better shape). Plain labelled 1–5 bars or numbers are enough.
- Every state needs a design: loading, empty or not invited, switch off ("not available yet"), save failed, expired, unreadable data, submitted.

## 4. Verification and handoff

- Run `npm test`, `npm run build`, the assessment local dev flow (`npm run assessments:dev` against local D1 only, never production) and Playwright. Report the actual output, including any failures.
- Before and after screenshots at 390 px and 1280 px.
- Push the branch. Open no pull request unless asked. Do not deploy.
- **Handoff:**
  - files changed
  - verification actually run
  - what was not verified (screen reader, real D1, concurrency)
  - the unchecked go/no-go list from spec §14 (psychologist review, POPIA review, notice sign-off, screen-reader pass, support contact, production authorisation)
  - an explicit statement that the questionnaire must stay switched off until those are done

Label claims in your handoff **Confirmed / Inference / Hypothesis / Unknown**.
