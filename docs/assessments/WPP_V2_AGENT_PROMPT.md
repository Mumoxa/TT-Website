# Agent prompt: Workplace Personality Profile v2 (20 minutes, numeric + cognitive reasoning) and a Playwright front-end audit

Repository `Mumoxa/TT-Website`. Check out branch **`claude/wpp-reasoning`** (based on `main` at `b5ecf57`). Read `AGENTS.md` and `DESIGN.md` first. Do the work, open a PR, get it green, merge it, then do the production step in task 8.

## What the owner asked for

> The Workplace Personality Profile says about 10 minutes, but the limit is set at 60 minutes. The question text renders slightly outside its box. The assessment is missing cognitive and numeric reasoning. Make it a 20-minute assessment that includes cognitive and numeric reasoning. When it's done, run a front-end audit with Playwright, fix the findings, review it again and fix.

## Already done on this branch (commit "WIP")

- `functions/lib/hpi-reasoning.js`:
  - 6 numeric items (`n1`–`n6`) and 6 cognitive items (`c1`–`c6`, three sequences and three deductions), all original content.
  - Their keys, `publicReasoningItems()` (prompts and options only), `validReasoningAnswer()` and `scoreReasoning()`, which returns raw counts per section.
- `functions/lib/hpi-personality.js`:
  - `VERSION = 'wpp-2026-v2'` and `ENGINE = 'hpi-raw-v3'`.
  - `personalityForm()` also returns `reasoning_sections` and `reasoning`.
  - `normalizePersonalityAnswers()` accepts the reasoning ids.
  - `scorePersonality()` adds `reasoning: {numeric:{title,correct,attempted,total}, cognitive:{…}}`. `attempted` still counts only the 50 statements.
  - The one production submission (form `hpi-2026-pilot-2`) has no reasoning. Everything must still render it.

## Remaining work

1. **20 minutes everywhere.**
   - `workplace-personality-flow.js`: set `PERSONALITY_SECONDS` to 1200 and fix its comment.
   - `assessment-catalog.js`: replace the hard-coded `estimated_minutes: 10` with the real 20.
   - `AssessmentApp.jsx`, welcome page: the facts box (it says "About 10 min"), the "What to expect" list (three parts, calculator allowed, a 20-minute timer that starts on OK) and the personality start briefing (it says "about 10 minutes").
   - `AssessmentCatalog.jsx`, personality card: chips such as "20 minutes, timed", "50 statements", "12 reasoning questions".
2. **Candidate notice.** In `src/assessments/personality-notice.js`, mention the reasoning questions and that their results (number correct) go to recruiters with the profile. Bump the version to `wpp-recruiter-notice-draft-2`.
3. **Questionnaire UI** (`src/assessments/PersonalityQuestions.jsx`).
   - **Screens:** 14 in total: 10 statement screens of 5 (unchanged), 2 numeric screens of 3, and 2 cognitive screens of 3.
   - **Reasoning screens:** show the section title as the h1, then the section instruction. Show options as stacked rows labelled A–D, not the 5-column Likert grid.
   - **Intro:** describe the three parts and the 20 minutes, and remove "There is no time limit".
   - **Progress:** count all 62 items.
   - **Review page:** list blanks by part ("Statement 18", "Numeric 2", "Cognitive 4"), and make each one jump to its screen.
   - **Guard:** change it to "50 statements and 12 reasoning items".
   - **Data:** `publicPersonalityAssessment()` in `workplace-personality-flow.js` must also pass `reasoning_sections` and `reasoning`, with no keys.
4. **Overflow bug.** In `personality-questions.css`, `.wpp-question legend` sits on the fieldset's top border, outside the card's padding. Make the question text sit inside the card at every width. For example: `legend{float:left;width:100%;padding:0;margin:0 0 14px}` and `.wpp-options{clear:both}`.
5. **Recruiter outputs.**
   - **Email:** in `assessment-email.js` `buildPersonalityResultEmail`, add a "Reasoning" block, only when `result.reasoning` exists: "Numeric reasoning: X of 6 correct (Y answered)" and the same for cognitive. Add one line saying these are raw counts with no norms, not to be used as a cut-off.
   - **Report data:** in `personalityReportData`, pass `reasoning`.
   - **Recruiter report** (`personality-report-model.js`, `PersonalityDossier.jsx`): add a Reasoning panel. Remove "Cognitive reasoning" and "Numerical intelligence" from `EVIDENCE_GAPS` only when reasoning results exist.
6. **Tests.**
   - **New `tests/hpi-reasoning.test.mjs`:** recompute every computable key (15%, Team B, R680, South, 60, R1 560; 47; 4; YZX; not approved; desk 2; cannot determine). Assert that no `key` appears in `publicPersonalityAssessment()`.
   - **Existing tests:** update the personality, flow, email, gate, report and store tests for the new version, notice and time.
   - **New cases:** a full cycle with reasoning answers produces both email lines; an old-version stored result with no reasoning still renders in the email and the report.
   - **Must all pass:** `npm test`, `npm run build`, and `npx wrangler pages functions build functions --outdir .wrangler/ci-functions-v4`.
7. **Playwright front-end audit (loop until clean, at most 3 rounds).**
   - **Local server:** run `node scripts/assessment-local.mjs migrate`, then `node scripts/assessment-local.mjs dev` (port 8790). Add `ENABLE_HPI_PERSONALITY=true` to `.wrangler/assessment-sandbox/.dev.vars`, and publish the local personality definition.
   - **Journey and widths:** walk catalogue card → welcome → details → briefing → intro → all 14 screens → review → submit → thank-you, at 1440×900, 1024×768, 768×1024 and 390×844.
   - **Check and record:**
     - horizontal overflow;
     - text escaping its container (the question text in its card especially);
     - clipped or overlapping text;
     - tap targets under 44px;
     - focus moves to the h1 on every screen change;
     - the whole journey can be completed with the keyboard alone;
     - console errors;
     - the save status is visible;
     - the timer shows 20:00;
     - the selected radio is visible without relying on colour;
     - muted text has enough contrast.
   - **Each round:** take screenshots and look at them. Fix every finding, rebuild, and re-run the full audit.
   - **Clean up:** stop the server (`pkill -f "wrangler pages dev"`), and run `git checkout -- docs/assessments/screenshots`.
8. **Ship.**
   - Commit with the attribution lines your platform requires, push, and open a PR against `main`.
   - Wait for the `verify` check and the Codex review, fix any real findings, then merge.
   - After the production deploy succeeds, set `duration_seconds = 1200` for slug `workplace-personality-profile` in production D1 (`tt-assessments`, `b8e74387-6b66-4dd1-beab-78a1aac12231`).
   - Confirm on https://talenttree.co.za/assessments/workplace-personality-profile that the welcome page shows 20 minutes. Do not submit a live attempt.

## Rules
- Answer keys never go to the browser. No secrets in commits. No new npm dependencies. Keep the DESIGN.md tokens.
- Report back with:
  - the files changed;
  - test and build output;
  - each audit round's findings and fixes, with screenshots;
  - the PR number and merge commit;
  - the production checks;
  - anything not verified.
