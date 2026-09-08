-- Talent Tree confidential employment-offer delivery — schema v1 (2026-09-08)
-- D1 / SQLite. All timestamps are ISO-8601 UTC text.

CREATE TABLE IF NOT EXISTS offers (
  id              TEXT PRIMARY KEY,             -- crypto.randomUUID()
  secure_token    TEXT NOT NULL UNIQUE,         -- 64 hex chars, generated server-side
  candidate_name  TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  client_name     TEXT NOT NULL,
  position_title  TEXT NOT NULL,
  pdf_key         TEXT NOT NULL,                -- R2 object key inside the private bucket
  expires_at      TEXT NOT NULL,                -- ISO-8601 UTC
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TEXT NOT NULL                 -- ISO-8601 UTC
);

CREATE TABLE IF NOT EXISTS offer_confidentiality_acceptances (
  id            INTEGER PRIMARY KEY,
  offer_id      TEXT NOT NULL REFERENCES offers(id),
  accepted      INTEGER NOT NULL DEFAULT 1,
  accepted_at   TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  ip_address    TEXT,
  user_agent    TEXT
);

CREATE TABLE IF NOT EXISTS offer_events (
  id          INTEGER PRIMARY KEY,
  offer_id    TEXT NOT NULL REFERENCES offers(id),
  event_type  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_offers_token ON offers(secure_token);
CREATE INDEX IF NOT EXISTS idx_accept_offer ON offer_confidentiality_acceptances(offer_id, id);
CREATE INDEX IF NOT EXISTS idx_events_offer ON offer_events(offer_id, id);
