# Agent prompt 2: finish the Workplace Personality Profile on the AP/AR candidate model

Repository: `Mumoxa/tt-website`. Build on commit `6d16480` (branch `arena/4c3409fc-tt-website`). Work on a new branch from it. Do not merge to `main` and do not deploy.

Read `AGENTS.md` and `Mumoxa/agent-instructions/AGENTS.md`, then `DESIGN.md`, `docs/assessments/HPIS_REBUILD_SPEC.md` (sections on P01, scoring, encryption, switches and tests) and `WPP_AGENT_PROMPT.md` (design rules). Where this prompt differs from either earlier document, **this prompt wins**: the product owner has changed the access model and the result recipient.

## 1. Product decisions (made by the product owner; do not reopen them)

1. **No login and no candidate accounts.** The candidate flow copies the AP/AR assessments exactly:
   - The candidate enters first name, surname, a valid South African ID number and a contact number, through the existing screening and identity path.
   - The existing ID validation, `identityHash`, `encryptId` / `maskId` and attempt-scoped session apply.
   - The candidate takes the questionnaire in one sitting, and the result is produced. That is the full cycle.
2. **Recipients: recruiters only.** Factor results go to Talent Tree recruiters through the existing result-email path (`functions/lib/assessment-email.js`, `ASSESSMENT_RESULTS_TO`, plus an optional `ASSESSMENT_RESULTS_TO_<FAMILY>`). The candidate sees a thank-you screen, not their scores.

This replaces the spec's "candidate-private research" design. Remove or redirect the parts that assume it:
- the candidate result screen
- candidate export and erase buttons
- invitations, the cohort list and `HPI_OPEN_ENROLMENT`
- the 65/35 "full profile" figure
- the research-notice wording that says employers or recruiters cannot see results

## 2. What to keep from the spec (non-negotiable)

- **Instrument fidelity.** P01 is the IPIP-50 Big-Five markers, verbatim, in the same order and with the same keys. Keep the provenance file. Scoring: `+` items score 1–5, `-` items score `6 - v`. Report the mean per factor, and the sum only when every item of the factor is answered.
- **Never** produce or email types, archetypes, pass/fail, percentiles, norms, rankings, "fit", recommendations or a composite score.
- The recruiter email must show these, verbatim in substance:
  - the five factor means (1–5) with "n of 10 answered" for each
  - "This is a self-description questionnaire. It has not been validated for selection at Talent Tree. There is no better or worse score. Do not use it alone, or as a cut-off, in any hiring decision."
- Answers and results are encrypted at rest with the existing `encryptId` / `decryptPrivate` envelope. Keys stay server-only (no `factor` or `sign` in the browser payload).
- Every write is audited, with metadata only, never answers.
- One attempt per ID number per form version, using the same rule and attempt counter as AP/AR.

## 3. Build

1. **Catalogue entry** for the personality profile, in the same structure the AP/AR definitions use. Reuse `functions/lib/hpi-personality.js` for items, projection and scoring.
2. **API.** Mount P01 inside the existing `functions/api/assessment/[[path]].js` flow. Do not create a parallel auth path. On submit:
   - score the answers
   - store them encrypted
   - send the recruiter email
   - return only a completion acknowledgement to the browser, never scores

   Reuse the existing once-only email guard (the AP/AR concurrency fix). Decide whether `functions/lib/hpi-storage.js` and the `0006` migration still fit, or whether P01 should use the existing attempts tables. Choose the option that duplicates the least code, and justify the choice in the handoff.
3. **Consent screen** before the first question, required checkbox. Rewrite it for the new purpose, in plain language:
   - what is collected
   - that the answers and the self-description are sent to Talent Tree recruiters and may be considered in recruitment
   - that it is a self-description, not a test, with no right or wrong answers
   - how long it is kept (use the same retention period as AP/AR; state it, do not invent one)
   - how to ask Talent Tree for access, correction or deletion (POPIA), using the same contact route AP/AR use
   - that taking part is voluntary

   Give the notice a new version id, and store that id with each attempt. Mark the wording **draft pending legal review** in the runbook.
4. **Candidate UI (React)**, in the existing `src/assessments/` conventions and Talent Tree design (rules in `WPP_AGENT_PROMPT.md` §3; use taste-skill for judgment only, with `DESIGN.md` tokens taking precedence):
   - screening, then consent, then intro
   - 10 screens of 5 statements, each on the Very Inaccurate → Very Accurate scale
   - a progress index
   - blanks allowed
   - a review screen
   - submit, then a thank-you screen
   - loading, error, "not available yet" and already-completed states

   Keyboard accessible; selection never shown by colour alone; no layout overflow at 390 px.
5. **Fix the public card from `6d16480`.** Show the personality card only when `ENABLE_HPI_PERSONALITY === "true"` (read it from the catalogue API, never hard-coded). Restore the original empty-state behaviour.
6. **Switches.** Keep `ENABLE_HPI_PERSONALITY = "false"` as the single gate. Remove `HPI_OPEN_ENROLMENT`, and remove `ENABLE_HPI_RESEARCH` if it no longer does anything. Document both changes in the runbook.
7. **Tests** (`npm test`).
   - Scoring and reverse keys.
   - Payload whitelist.
   - Switch off: the catalogue hides the card, and start is refused.
   - ID validation and the one-attempt rule.
   - The submit response contains no scores.
   - The recruiter email contains factor means plus the disclaimer, and no type, percentile or composite.
   - The email is sent exactly once under concurrent submits.
   - Audit metadata contains no answers.
   - Existing AP/AR tests unchanged.
   - Playwright full flow at 390 px and 1280 px. The last run failed for lack of `libnspr4.so`. Use `executablePath: '/opt/pw-browsers/chromium'` where available, or install the missing system library; report what actually ran.

## 4. Handoff

Cover:
- files changed
- the verification actually run, with its output
- what was not verified
- the migration decision and its justification

Label claims Confirmed / Inference / Hypothesis / Unknown. State plainly that `ENABLE_HPI_PERSONALITY` must stay `"false"` until all of these are done:
- [ ] a registered industrial psychologist has reviewed using IPIP-50 results in recruitment (Employment Equity Act s8 / HPCSA classification)
- [ ] a POPIA review of the consent notice, lawful basis and retention
- [ ] the notice wording is signed off
- [ ] a screen-reader pass
- [ ] a named contact for candidate data requests
- [ ] production authorisation
