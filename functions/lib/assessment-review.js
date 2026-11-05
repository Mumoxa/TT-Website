/* Scoring for a written handoff (battery item type 'note').
 *
 * Every point in this assessment is awarded by the server. A handoff is scored by matching the
 * candidate's own words against evidence markers that the item keys define, so the mark is
 * reproducible and a marker can never inflate or withhold it:
 *   - each criterion is all-or-nothing, 2 points or 0, on the same zero-or-full rule as any field;
 *   - a criterion states what must be present (`all`), what earns it alone (`any`) and what
 *     disqualifies it (`none`), so "hold the refund" cannot earn a criterion that requires a time;
 *   - the matched term is recorded with the mark, which is what makes the award auditable;
 *   - an empty answer earns nothing, and every mark names the marker it matched.
 *
 * Reviewer marking is retired (see migrations/assessments/0005_automated_note_scoring.sql). The
 * helpers for it are kept only where they still describe a human decision, which is never a score.
 *
 * Pure logic only: no D1 and no network, so the rules can be unit-tested directly.
 */

export const REVIEW_CRITERION_POINTS = 2;
const MAX_NOTE = 1200;

export const noteItems = (payload) => (payload?.sections || [])
  .flatMap((section) => (section.items || []).filter((item) => item.type === 'note'));

/* Text is compared case- and punctuation-insensitively, on whole words, so a marker cannot match
   inside another word ("hold" must not fire on "household"). */
const normalise = (value) => String(value ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\u2019\u2018]/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const escapeTerm = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termPattern = (term) => new RegExp('(^|[^a-z0-9])' + escapeTerm(term) + '($|[^a-z0-9])');

/* A negation immediately before a marker reverses it: "will not release the refund" must not be read
   as "release the refund". Only the disqualifying markers need this, but the rule is shared. */
const NEGATORS = /\b(not|never|no|without|don't|doesn't|won't|cannot|can't|isn't|aren't|avoid|stop)\b/;

/* Finds a marker that is not negated, so a candidate who says NOT to do the wrong thing is not
   penalised for naming it. */
export function matchUnnegated(text, markers) {
  const haystack = normalise(text);
  if (!haystack) return null;
  for (const term of (markers || []).map((t) => normalise(t)).filter(Boolean)) {
    const pattern = new RegExp('(^|[^a-z0-9])' + escapeTerm(term) + '($|[^a-z0-9])', 'g');
    let match;
    while ((match = pattern.exec(haystack)) !== null) {
      const before = haystack.slice(Math.max(0, match.index - 28), match.index);
      if (!NEGATORS.test(before)) return term;
      if (pattern.lastIndex === match.index) pattern.lastIndex += 1;
    }
  }
  return null;
}

/* Which marker produced the mark, if any. Returns the first marker that matched, so the report can
   show the reviewer of the evidence why a criterion was awarded. */
export function matchMarker(text, marker) {
  const haystack = normalise(text);
  if (!haystack) return null;
  const terms = (marker || []).map((t) => normalise(t)).filter(Boolean);
  return terms.find((term) => termPattern(term).test(haystack)) || null;
}

/* Scores one criterion, all or nothing. `all` must all be present, `any` must contribute at least
   one, and any `none` term disqualifies the criterion outright. */
export function scoreCriterion(criterion, text) {
  const haystack = normalise(text);
  if (!haystack) return { id: criterion.id, points: 0, matched: null, missing: [] };
  const disqualified = matchUnnegated(haystack, criterion.none || []);
  if (disqualified) return { id: criterion.id, points: 0, matched: null, blocked_by: disqualified };
  const missing = (criterion.all || []).filter((term) => !matchMarker(haystack, [term]));
  if (missing.length) return { id: criterion.id, points: 0, matched: null, missing };
  const anyMatched = (criterion.any || []).length ? matchMarker(haystack, criterion.any) : null;
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

/* The criteria an item is scored against, with their markers, for validation and for the audit note.
   Never returned to a candidate. */
export const noteCriteria = (payload, key) => (payload?.sections || [])
  .flatMap((section) => (section.items || []).filter((item) => item.type === 'note'))
  .map((item) => ({ item_id: item.id, points: item.points, criteria: key?.items?.[item.id]?.criteria || [] }));

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
