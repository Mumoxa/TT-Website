-- Draft integration for the recruiter-recipient P01 flow. Separate from the legacy
-- candidate-private research tables in 0006; never apply remotely without approval.
-- Identity hashes and encrypted content are server-only. Existing assessment attempts
-- provide the session and candidate association, but occupational results are untouched.
CREATE TABLE workplace_personality_attempts (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id),
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  identity_hash TEXT NOT NULL,
  form_version TEXT NOT NULL,
  notice_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  answers_encrypted TEXT,
  result_encrypted TEXT,
  mutation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  notify_status TEXT NOT NULL DEFAULT 'pending',
  notified_at TEXT,
  notify_attempts INTEGER NOT NULL DEFAULT 0 CHECK(notify_attempts >= 0),
  UNIQUE(identity_hash, form_version),
  CHECK((status='draft' AND result_encrypted IS NULL AND submitted_at IS NULL) OR
        (status='submitted' AND answers_encrypted IS NOT NULL AND result_encrypted IS NOT NULL AND submitted_at IS NOT NULL))
);
CREATE INDEX workplace_personality_notifications ON workplace_personality_attempts(status, notified_at, notify_attempts);
