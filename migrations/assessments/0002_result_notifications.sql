-- Result notification tracking (2026-11-03). Email is sent to the configured results
-- recipient once per graded result. notify_attempts caps automatic retries.
ALTER TABLE results ADD COLUMN notified_at TEXT;
ALTER TABLE results ADD COLUMN notify_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE results ADD COLUMN notify_attempts INTEGER NOT NULL DEFAULT 0;
