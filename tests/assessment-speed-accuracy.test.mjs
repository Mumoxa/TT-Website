import test from 'node:test';
import assert from 'node:assert/strict';
import {speedAccuracy, formatDuration} from '../functions/lib/speed-accuracy.js';

/* Synthetic graded items only (the repository is public): { given, awarded, points }. */
const item = (given, awarded, points = 2) => ({ given, awarded, points });
const MIN = 60_000;
const base = { startedAtMs: 1_000_000, limitSeconds: 1200 };

test('accuracy is measured on answered work only, separately from the score', () => {
  const items = [item('a', 2), item('b', 2), item('c', 0), item(null, 0), item(null, 0)];
  const r = speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 10 * MIN, items });
  assert.equal(r.answered, 3);
  assert.equal(r.total, 5);
  assert.equal(r.completion_percent, 60);
  // 4 of 6 points on answered items; the score (4 of 10) would hide that the answered work was mostly right.
  assert.equal(r.accuracy_percent, 66.7);
  assert.equal(r.time_used_seconds, 600);
  assert.equal(r.time_used_percent, 50);
  assert.equal(r.seconds_per_answer, 200);
  assert.equal(r.profile.key, 'incomplete');
});

test('a partly answered line-matching item counts as answered and keeps its partial credit', () => {
  const r = speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 5 * MIN, items: [item('l1: Agrees', 5, 7), item('x', 3, 3)] });
  assert.equal(r.answered, 2);
  assert.equal(r.accuracy_percent, 80);
});

test('profiles: accurate and efficient, accurate but slow, fast and error-prone, low accuracy', () => {
  const all = (earned) => Array.from({ length: 10 }, (_, i) => item('x', i < earned ? 2 : 0));
  assert.equal(speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 12 * MIN, items: all(9) }).profile.key, 'accurate_efficient');
  assert.equal(speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 19 * MIN, items: all(9) }).profile.key, 'accurate_full_time');
  assert.equal(speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 7 * MIN, items: all(7) }).profile.key, 'mostly_accurate');
  assert.equal(speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 6 * MIN, items: all(4) }).profile.key, 'fast_error_prone');
  assert.equal(speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 18 * MIN, items: all(4) }).profile.key, 'low_accuracy');
});

test('time is clamped to the limit, and an open attempt has no speed measure', () => {
  const items = [item('x', 2)];
  const late = speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 25 * MIN, items });
  assert.equal(late.time_used_seconds, 1200);
  assert.equal(late.time_used_percent, 100);
  assert.equal(speedAccuracy({ ...base, closedAtMs: null, items }), null);
  assert.equal(speedAccuracy({ ...base, closedAtMs: base.startedAtMs + MIN, items: [] }), null);
});

test('nothing answered gives no accuracy figure rather than 0 %', () => {
  const r = speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 20 * MIN, items: [item(null, 0), item(null, 0)] });
  assert.equal(r.accuracy_percent, null);
  assert.equal(r.seconds_per_answer, null);
  assert.equal(r.profile.key, 'incomplete');
});

test('the profile states that its thresholds are provisional', () => {
  const r = speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 12 * MIN, items: [item('x', 2)] });
  assert.match(r.basis, /provisional/i);
  assert.match(r.basis, /not normed/i);
});

test('durations read as minutes and seconds', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(1200), '20:00');
  assert.equal(formatDuration(null), '—');
});

test('the result email carries the speed and accuracy profile when one exists, and omits it otherwise', async () => {
  const {buildResultEmail} = await import('../functions/lib/assessment-email.js');
  const speed = speedAccuracy({ ...base, closedAtMs: base.startedAtMs + 12 * MIN, items: [item('x', 2), item('y', 2)] });
  const args = { candidate: { first_name: 'Test', surname: 'Person', email: 't@example.test' }, title: 'Synthetic battery', clientName: 'Talent Tree',
    status: 'completed', gradedAt: '2026-01-01', isBattery: true, mcqReview: [], attemptNumber: 1,
    result: { overall_score: 100, knowledge_score: 40, reconciliation_score: 60, breakdown: {}, critical_flags: [], interpretation: 'Synthetic.' } };
  const withSpeed = buildResultEmail({ ...args, speed });
  assert.match(withSpeed.text, /Speed and accuracy: Accurate and efficient: 100% accurate on answered work, 2 of 2 activities answered, 12:00 of 20:00 used/);
  assert.match(withSpeed.html, /Speed and accuracy/);
  assert.match(withSpeed.html, /not normed/);
  const without = buildResultEmail(args);
  assert.doesNotMatch(without.text, /Speed and accuracy/);
});
