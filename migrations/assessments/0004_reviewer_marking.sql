-- Reviewer marking for written handoffs, and the separated decision record.
-- Additive only: existing rows and the automatic 0-100 result stay valid.

-- One row per attempt and reviewer-marked item. `revision` increments on every correction, and the
-- earlier marks are retained in the revisions table rather than overwritten.
CREATE TABLE IF NOT EXISTS assessment_reviews (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  item_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  earned INTEGER NOT NULL CHECK (earned >= 0),
  max_points INTEGER NOT NULL CHECK (max_points > 0),
  marks_json TEXT NOT NULL,          -- per-criterion awards
  rationale TEXT NOT NULL DEFAULT '',
  reviewer TEXT NOT NULL,            -- reviewer reference, not a candidate identifier
  rubric_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(attempt_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_attempt ON assessment_reviews(attempt_id);

-- Every earlier mark of a reviewer-marked item, so a correction never destroys the original award.
CREATE TABLE IF NOT EXISTS assessment_review_revisions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  item_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  earned INTEGER NOT NULL,
  marks_json TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  reviewer TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(attempt_id, item_id, revision)
);

-- The human hiring decision is a separate record from the score, as the blueprint requires:
-- score status and employment decision must never be conflated.
CREATE TABLE IF NOT EXISTS assessment_decisions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(id),
  decision TEXT NOT NULL CHECK (decision IN ('advance', 'hold', 'not_advance')),
  reason TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
