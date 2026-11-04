-- Talent Tree AP Assessment Platform - separate Cloudflare D1 database.
-- Apply to tt-assessments only; do not run against the existing tt-offers DB.
-- Schema only. Live questions, answer keys and client invite secrets MUST
-- be seeded privately (TT-Website GitHub repository is PUBLIC).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS assessment_definitions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  title TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 600 CHECK (duration_seconds BETWEEN 60 AND 7200),
  current_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pilot', 'published', 'retired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assessment_versions (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES assessment_definitions(id),
  version_label TEXT NOT NULL,
  question_payload_json TEXT NOT NULL, -- private: includes questions and scenarios
  scoring_key_json TEXT NOT NULL,      -- private: NEVER served to the browser
  scoring_engine_version TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(definition_id, version_label)
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  surname TEXT NOT NULL,
  email TEXT NOT NULL,
  privacy_notice_version TEXT NOT NULL,
  consent_recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (length(first_name) BETWEEN 2 AND 100),
  CHECK (length(surname) BETWEEN 2 AND 100),
  CHECK (length(email) BETWEEN 5 AND 254)
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES assessment_definitions(id),
  token_sha256 TEXT NOT NULL UNIQUE,  -- opaque token hash; raw token never persisted
  intended_email TEXT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'redeemed', 'revoked', 'expired')),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL UNIQUE REFERENCES invitations(id),
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  definition_id TEXT NOT NULL REFERENCES assessment_definitions(id),
  version_id TEXT NOT NULL REFERENCES assessment_versions(id),
  session_token_sha256 TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'timed_out', 'abandoned', 'void')),
  started_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  closed_at_ms INTEGER,
  save_revision INTEGER NOT NULL DEFAULT 0,
  last_saved_at_ms INTEGER,
  mcq_answers_json TEXT NOT NULL DEFAULT '{}',
  structured_answers_json TEXT NOT NULL DEFAULT '{}',
  workbook_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (expires_at_ms > started_at_ms)
);

CREATE INDEX IF NOT EXISTS idx_attempts_status_expiry ON attempts(status, expires_at_ms);
CREATE INDEX IF NOT EXISTS idx_attempts_candidate ON attempts(candidate_id, started_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_assessment ON attempts(definition_id, started_at_ms DESC);

-- Optional compact audit snapshots of the candidate's working state.
-- Enforce max workbook bytes and save frequency in server code.
CREATE TABLE IF NOT EXISTS workbook_snapshots (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  revision INTEGER NOT NULL,
  workbook_json TEXT NOT NULL,
  saved_at_ms INTEGER NOT NULL,
  UNIQUE(attempt_id, revision)
);

CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(id),
  scoring_version TEXT NOT NULL,
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  knowledge_score INTEGER NOT NULL CHECK (knowledge_score BETWEEN 0 AND 40),
  reconciliation_score INTEGER NOT NULL CHECK (reconciliation_score BETWEEN 0 AND 60),
  breakdown_json TEXT NOT NULL,
  critical_flags_json TEXT NOT NULL DEFAULT '[]',
  interpretation TEXT NOT NULL,
  graded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('candidate', 'admin', 'system')),
  actor_id TEXT,
  attempt_id TEXT REFERENCES attempts(id),
  event_type TEXT NOT NULL,
  safe_metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invites_assessment_status ON invitations(definition_id, status);
CREATE INDEX IF NOT EXISTS idx_results_score ON results(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_audit_attempt ON audit_events(attempt_id, created_at);
