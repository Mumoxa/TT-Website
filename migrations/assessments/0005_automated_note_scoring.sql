-- Every point is awarded by the server.
--
-- 0004 introduced reviewer marking: a person gave 0, 1 or 2 on four anchors for a written handoff and
-- the attempt stayed pending_review until they did. That is retired. A handoff is now scored
-- automatically from the evidence markers in its key, on the same zero-or-full rule as every other
-- field, so an attempt is final the moment it is submitted.
--
-- Additive only: nothing is dropped and no score is rewritten.
--   * A handoff score is part of the normal graded result, so it lives in `results` with everything
--     else. Old attempts that were waiting for a human are re-graded on their next read by the
--     existing gradeAndStore path, which now scores notes automatically.
--   * Marks recorded by a person under the old workflow stay readable and immutable, marked as such.
--   * The hiring decision (a human judgement, never a score) keeps its table unchanged.

ALTER TABLE assessment_reviews ADD COLUMN source TEXT NOT NULL DEFAULT 'automated';

-- Marks recorded by a person under 0004 are not automatic and are never used for scoring.
UPDATE assessment_reviews SET source = 'reviewer' WHERE source = 'automated';

-- A handoff awarded zero points still needs its evidence for audit, so the criterion rows are kept
-- with the result that produced them. This table is written by the grader, not by a person.
CREATE TABLE IF NOT EXISTS assessment_note_scores (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  item_id TEXT NOT NULL,
  earned INTEGER NOT NULL CHECK (earned >= 0),
  max_points INTEGER NOT NULL CHECK (max_points > 0),
  criteria_json TEXT NOT NULL,       -- per-criterion award and the marker that matched
  scoring_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(attempt_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_note_scores_attempt ON assessment_note_scores(attempt_id);
