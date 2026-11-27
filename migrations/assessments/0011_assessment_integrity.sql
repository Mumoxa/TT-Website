-- Assessment integrity (owner decision 2026-11-27): honesty statement version accepted at start, and a small
-- server-timed record of page leaves, outside pastes and blocked copies. No content, no keystrokes.
ALTER TABLE attempts ADD COLUMN integrity_statement_version TEXT;
ALTER TABLE attempts ADD COLUMN integrity_json TEXT;
