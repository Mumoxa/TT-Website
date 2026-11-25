-- Additive, isolated foundation only. No routes use this table. Apply only to
-- the assessment D1 database after change review; no assessment is enabled.
CREATE TABLE IF NOT EXISTS hr_pilot_attempt_state (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id),
  version_id TEXT NOT NULL REFERENCES assessment_versions(id),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'submitted')),
  step_id TEXT,
  step_deadline_ms INTEGER,
  clock_json TEXT NOT NULL,
  responses_json TEXT NOT NULL DEFAULT '{}',
  workbook_json TEXT NOT NULL DEFAULT '{}',
  last_saved_at_ms INTEGER,
  CHECK ((status = 'active' AND step_id IS NOT NULL AND step_deadline_ms IS NOT NULL) OR
         (status = 'submitted' AND step_id IS NULL AND step_deadline_ms IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_hr_pilot_state_due ON hr_pilot_attempt_state(status, step_deadline_ms);
