import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { expiryForStart, secondsRemaining, canPersistAttempt, nextAttemptStatus } from '../functions/lib/assessment-deadlines.js';

test('600 seconds begins only at committed server start', () => {
  const started = Date.parse('2026-11-03T10:00:00Z');
  const expiry = expiryForStart(started);
  assert.equal(expiry - started, 600000);
  assert.equal(secondsRemaining(expiry, started), 600);
  assert.equal(secondsRemaining(expiry, started + 599999), 1);
  assert.equal(secondsRemaining(expiry, started + 600000), 0);
});

test('save and submit access ends at, not after, exactly ten minutes', () => {
  const start = 1800000000000;
  const attempt = { status: 'active', expires_at_ms: expiryForStart(start) };
  assert.equal(canPersistAttempt(attempt, start + 599999), true);
  assert.equal(canPersistAttempt(attempt, start + 600000), false);
  assert.equal(canPersistAttempt(attempt, start + 600001), false);
  assert.equal(nextAttemptStatus(attempt, start + 600000), 'timed_out');
});

test('attempt cannot be reopened by a client status or local clock', () => {
  const attempt = { status: 'completed', expires_at_ms: 1000000 };
  assert.equal(canPersistAttempt(attempt, 0), false);
  assert.equal(nextAttemptStatus(attempt, 0), 'completed');
  const abandoned = { status: 'abandoned', expires_at_ms: 1000000 };
  assert.equal(canPersistAttempt(abandoned, 999999), false);
});

test('invalid durations and timestamps fail closed', () => {
  assert.throws(() => expiryForStart(-1), TypeError);
  assert.throws(() => expiryForStart(100, 0), RangeError);
  assert.throws(() => expiryForStart(100, 99999), RangeError);
  assert.equal(canPersistAttempt({ status: 'active', expires_at_ms: 'not-a-time' }, 100), false);
});
