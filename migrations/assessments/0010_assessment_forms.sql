-- Parallel forms (owner decision 2026-11-27).
--
-- Repeat attempts on the same questions raised scores by memory, not skill (one candidate scored 39, 65 and 96
-- on the same form within an hour). An assessment may now hold several parallel forms (A, B, C): the same
-- blueprint with different figures, parties and answer positions. A start draws at random from the active
-- forms this person (by ID hash) has not taken for this assessment, so nobody sees the same form twice.
--
-- A form keeps its label when its content is corrected: a new version of form B deactivates the old B row and
-- adds the new one, and "already taken" is decided by label, so a correction never re-exposes a form.
-- An assessment with no rows here keeps the old behaviour (its current version for every start).
-- Additive only.

CREATE TABLE IF NOT EXISTS assessment_forms (
  definition_id TEXT NOT NULL REFERENCES assessment_definitions(id),
  version_id TEXT NOT NULL REFERENCES assessment_versions(id),
  form_label TEXT NOT NULL CHECK (form_label IN ('A', 'B', 'C', 'D', 'E')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (definition_id, version_id)
);

-- At most one active version per form label in an assessment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_forms_active_label
  ON assessment_forms(definition_id, form_label) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_assessment_forms_version ON assessment_forms(version_id);
