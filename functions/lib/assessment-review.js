/* Reviewer marking for written handoffs (battery item type 'note').
 *
 * A note is never auto-scored. A trained reviewer gives 0, 1 or 2 on each published criterion
 * anchor, and the award is stored separately from the automatic score so that:
 *   - the composite is final only after marking,
 *   - reviewer identity, rationale and every revision are kept,
 *   - a correction appends a revision instead of overwriting the original mark.
 *
 * Pure logic only: no D1 and no network, so the rules can be unit-tested directly.
 */

export const REVIEW_CRITERION_POINTS = 2;
const MAX_NOTE = 1200;

export class ReviewError extends Error {}

export const noteItems = (payload) => (payload?.sections || [])
  .flatMap((section) => (section.items || []).filter((item) => item.type === 'note'));

/* The marking form a reviewer sees: criterion labels and anchors, never any other candidate's work. */
export function noteRubric(payload, key) {
  return noteItems(payload).map((item) => ({
    item_id: item.id,
    prompt: item.prompt,
    points: item.points,
    criteria: (key?.items?.[item.id]?.rubric || []).map((c) => ({
      id: c.id, label: c.label, anchors: [...c.anchors],
    })),
  }));
}

/* Validates a reviewer's marks against the published rubric. Every criterion must be marked; a mark
   of 0, 1 or 2 only; no criterion may be missing or invented. Returns the normalised decision. */
export function validateReview(payload, key, submission) {
  const rubrics = noteRubric(payload, key);
  if (!rubrics.length) throw new ReviewError('This assessment has no reviewer-marked item.');
  const marks = submission && typeof submission === 'object' ? submission.marks : null;
  if (!marks || typeof marks !== 'object') throw new ReviewError('Marks are required.');
  const out = [];
  let total = 0;
  for (const note of rubrics) {
    const given = marks[note.item_id];
    if (!given || typeof given !== 'object') throw new ReviewError(`Marks are required for ${note.item_id}.`);
    const criteria = [];
    for (const criterion of note.criteria) {
      const value = given[criterion.id];
      if (!Number.isInteger(value) || value < 0 || value > REVIEW_CRITERION_POINTS) {
        throw new ReviewError(`Each criterion needs 0, 1 or 2 points (${note.item_id} / ${criterion.id}).`);
      }
      criteria.push({ id: criterion.id, points: value });
    }
    const extra = Object.keys(given).filter((id) => !note.criteria.some((c) => c.id === id));
    if (extra.length) throw new ReviewError(`Unknown criterion for ${note.item_id}.`);
    const earned = criteria.reduce((n, c) => n + c.points, 0);
    if (earned > note.points) throw new ReviewError(`Marks for ${note.item_id} exceed its ${note.points} points.`);
    total += earned;
    out.push({ item_id: note.item_id, criteria, earned, max: note.points });
  }
  const rationale = typeof submission?.rationale === 'string' ? submission.rationale.trim().slice(0, 1000) : '';
  return { notes: out, earned: total, max: rubrics.reduce((n, r) => n + r.points, 0), rationale };
}

/* Combines the automatic award with an optional reviewer award. `status` drives the reporting rule
   that a pending or invalidated attempt can never be shown as a completed score. */
export function combineScores(grade, review) {
  const auto = Number(grade?.overall_score) || 0;
  const autoMax = Number(grade?.auto_scored_max) || 100;
  const pendingPoints = Number(grade?.pending_review_points) || 0;
  if (!review) {
    return {
      status: pendingPoints ? 'pending_review' : 'scored',
      auto_score: auto, auto_max: autoMax,
      review_score: null, review_max: pendingPoints || null,
      total: pendingPoints ? null : auto, total_max: autoMax,
      partial_total: auto, partial_max: autoMax,
    };
  }
  const reviewEarned = Number(review.earned) || 0;
  const reviewMax = Number(review.max) || pendingPoints || 0;
  const total = auto + reviewEarned;
  const totalMax = autoMax + reviewMax;
  return {
    status: 'scored',
    auto_score: auto, auto_max: autoMax,
    review_score: reviewEarned, review_max: reviewMax,
    total, total_max: totalMax,
    // A 0–100 view keeps the existing results table meaningful across forms of different sizes.
    percent: totalMax ? Math.round((total / totalMax) * 1000) / 10 : 0,
    partial_total: auto, partial_max: autoMax,
  };
}

/* Trims candidate prose for review without altering its meaning. Newlines are kept so the reviewer
   sees the bullets the candidate wrote. */
export function cleanNoteText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_NOTE);
}
