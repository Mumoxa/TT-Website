-- Research data is separate from occupational results. Do not enable collection until
-- candidate authentication, data rights and retention scheduling are implemented.
CREATE TABLE hpi_research_attempts (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL CHECK (module_id = 'P01'),
  form_version TEXT NOT NULL,
  form_variant TEXT,
  notice_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  phase_index INTEGER NOT NULL DEFAULT 0 CHECK (phase_index = 0),
  answers_encrypted TEXT,
  result_encrypted TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (candidate_id, module_id, form_version),
  CHECK ((status = 'draft' AND result_encrypted IS NULL) OR
         (status = 'submitted' AND answers_encrypted IS NOT NULL AND result_encrypted IS NOT NULL))
);
CREATE INDEX hpi_research_expiry ON hpi_research_attempts(expires_at);

CREATE TABLE hpi_research_invites (
  candidate_id TEXT PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  invited_by TEXT,
  invited_at TEXT NOT NULL
);
