/* Scoring for a written handoff (battery item type 'note').
 *
 * Every point in this assessment is awarded by the server. A handoff is scored by matching the
 * candidate's own words against evidence markers that the item keys define, so the mark is
 * reproducible and a marker can never inflate or withhold it:
 *   - each criterion is all-or-nothing, 2 points or 0, on the same zero-or-full rule as any field;
 *   - `all` marks a fact that must be present, `any` marks a choice of which one must be present and
 *     un-negated, and `none` disqualifies the criterion. A criterion with no positive marker can never
 *     be earned, and is refused at build time;
 *   - the matched term is recorded with the mark, which is what makes the award auditable;
 *   - an empty answer earns nothing.
 *
 * Reviewer marking is retired (see migrations/assessments/0005_automated_note_scoring.sql), so there
 * is no human award to combine: `combineScores` exists only to present a final total.
 *
 * Pure logic only: no D1 and no network, so the rules can be unit-tested directly.
 */

export const REVIEW_CRITERION_POINTS = 2;
const MAX_NOTE = 1200;

/* Text is compared case- and punctuation-insensitively, on whole words, so a marker cannot match
   inside another word ("hold" must not fire on "household"). */
const normalise = (value) => String(value ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\u2019\u2018]/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const escapeTerm = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* A negation in the same clause reverses a marker: "do not hold it" is not a decision to hold.
   The window is deliberately narrow. A wide window let a negation intended for one phrase silently
   suppress a different phrase ("do not touch the ledger, release the refund" must still fail), which
   is the more dangerous error: it hides a wrong decision rather than over-crediting a correct one. */
/* "not only X" is additive, not a negation, so it must not suppress the marker it precedes. */
const NOT_ONLY = /\bnot only\b/g;
const NEGATORS = /\b(not|never|no|none|without|don't|doesn't|didn't|won't|cannot|can't|isn't|aren't|avoid|avoiding|stop|refuse|refused|decline|declined)\b/;
const CLAUSE_BREAK = /[,.;:!?()\u2014\u2013]|\bbut\b|\bhowever\b|\bso\b|\bthen\b|\bunless\b|\band\b/;

/* True when the marker occurrence at `index` is negated by a negator in the same clause.
   Scope is deliberately narrow, and what it does NOT do is worth knowing: a negation that retracts
   an earlier mention ("hold it? no, do not hold") is not detected, because the negation follows the
   marker. Supporting that needs real candidate phrasing to tune against, not invented examples. */
function isNegated(haystack, index) {
  const before = haystack.slice(Math.max(0, index - 40), index);
  // Only the text after the last clause break can negate this occurrence.
  const clause = (before.split(CLAUSE_BREAK).pop() || '').replace(NOT_ONLY, '');
  return NEGATORS.test(clause);
}

/* Finds a marker that is not negated. Used for BOTH earning and disqualifying markers: a candidate
   who writes "do not hold it" must not earn the hold criterion, and a candidate who writes "we will
   not release the refund" must not be disqualified by the word "release". */
export function matchUnnegated(text, markers) {
  const haystack = normalise(text);
  if (!haystack) return null;
  for (const term of (markers || []).map((t) => normalise(t)).filter(Boolean)) {
    const pattern = new RegExp('(^|[^a-z0-9])' + escapeTerm(term) + '($|[^a-z0-9])', 'g');
    let match;
    while ((match = pattern.exec(haystack)) !== null) {
      // match.index covers the leading boundary character, so the marker itself starts just after it.
      const markerIndex = match.index + (match[1] ? match[1].length : 0);
      if (!isNegated(haystack, markerIndex)) return term;
      if (pattern.lastIndex === match.index) pattern.lastIndex += 1;
    }
  }
  return null;
}

/* Presence only: the first marker found anywhere in the text, negated or not. */
export function matchMarker(text, markers) {
  const haystack = normalise(text);
  if (!haystack) return null;
  return (markers || []).map((t) => normalise(t)).filter(Boolean)
    .find((term) => new RegExp('(^|[^a-z0-9])' + escapeTerm(term) + '($|[^a-z0-9])').test(haystack)) || null;
}

/* Scores one criterion, all or nothing.
   - `all`: every phrase must be PRESENT. Negation does not apply: these are facts and words, so
     "Do not hold the INV-8841 refund" still contains the invoice number it is about.
   - `any`: at least one phrase must be present AND not negated. These are the choices, so
     "do not hold it" must not earn the hold criterion.
   - `none`: any occurrence that is NOT negated disqualifies the criterion.
   A criterion with no positive marker can never be earned: otherwise text that says nothing at all
   would trip no disqualifier and collect the points by default. That case is rejected at build time,
   and refused here as well so a malformed key cannot award marks. */
export function scoreCriterion(criterion, text) {
  const haystack = normalise(text);
  if (!haystack) return { id: criterion.id, points: 0, matched: null, missing: [], blank: true };
  const positives = [...(criterion.all || []), ...(criterion.any || [])];
  if (!positives.length) return { id: criterion.id, points: 0, matched: null, invalid: 'no positive marker' };

  const disqualified = matchUnnegated(haystack, criterion.none || []);
  if (disqualified) return { id: criterion.id, points: 0, matched: null, blocked_by: disqualified };

  // `all` is presence-only: a fact is not reversed by a negation elsewhere in the sentence.
  const missing = (criterion.all || []).filter((term) => !matchMarker(haystack, [term]));
  if (missing.length) return { id: criterion.id, points: 0, matched: null, missing };

  const anyMatched = (criterion.any || []).length ? matchUnnegated(haystack, criterion.any) : null;
  if ((criterion.any || []).length && !anyMatched) return { id: criterion.id, points: 0, matched: null, missing: criterion.any };

  const matched = matchMarker(haystack, criterion.all || []) || anyMatched;
  return { id: criterion.id, points: REVIEW_CRITERION_POINTS, matched };
}

/* Scores the whole handoff against the item's published criteria. Called by the grader, never by the
   candidate: the criteria never leave the server. */
export function scoreNote(keyItem, text) {
  const criteria = Array.isArray(keyItem?.criteria) ? keyItem.criteria : [];
  const answer = normalise(text);
  const rows = criteria.map((criterion) => scoreCriterion(criterion, answer));
  const max = criteria.length * REVIEW_CRITERION_POINTS;
  const earned = rows.reduce((n, r) => n + r.points, 0);
  return { criteria: rows, earned, max, blank: answer.length === 0 };
}

/* The final view of a grade. Every point is awarded automatically, so an attempt is scored the
   moment it is submitted and there is no pending state. */
export function combineScores(grade) {
  const total = Number(grade?.overall_score) || 0;
  const totalMax = Number(grade?.auto_scored_max) || 100;
  return {
    status: 'scored',
    auto_score: total, auto_max: totalMax,
    review_score: null, review_max: null,
    total, total_max: totalMax,
    // A 0–100 view keeps the existing results table meaningful across forms of different sizes.
    percent: totalMax ? Math.round((total / totalMax) * 1000) / 10 : 0,
    partial_total: total, partial_max: totalMax,
  };
}

/* Trims candidate prose without altering its meaning. Newlines are kept so the evidence markers are
   matched against the lines the candidate actually wrote. */
export function cleanNoteText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_NOTE);
}
