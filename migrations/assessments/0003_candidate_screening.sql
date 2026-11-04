-- Candidate screening is private and never contributes to grading.
-- Legacy rows remain valid with null screening fields.
ALTER TABLE candidates ADD COLUMN contact_number TEXT;
ALTER TABLE candidates ADD COLUMN id_number_encrypted TEXT;
ALTER TABLE candidates ADD COLUMN id_number_masked TEXT;
ALTER TABLE candidates ADD COLUMN earliest_start_date TEXT;
ALTER TABLE candidates ADD COLUMN first_day_confirmed INTEGER;
ALTER TABLE candidates ADD COLUMN travel_mode TEXT;
ALTER TABLE candidates ADD COLUMN travel_description TEXT NOT NULL DEFAULT '';
ALTER TABLE candidates ADD COLUMN own_transport TEXT;
ALTER TABLE candidates ADD COLUMN assignment_available TEXT;
ALTER TABLE candidates ADD COLUMN assignment_note TEXT NOT NULL DEFAULT '';

-- Keyed hashes link repeat attempts within one assessment; results are retained.
CREATE TABLE assessment_identity_attempts (
  definition_id TEXT NOT NULL REFERENCES assessment_definitions(id),
  id_hash TEXT NOT NULL,
  candidate_id TEXT NOT NULL UNIQUE REFERENCES candidates(id),
  created_at_ms INTEGER NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  PRIMARY KEY (definition_id, id_hash, attempt_number)
);
CREATE INDEX idx_identity_candidate ON assessment_identity_attempts(candidate_id);
