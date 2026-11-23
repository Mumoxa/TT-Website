/* Speed and accuracy profile for a submitted attempt (pure logic; no D1, no network).
 *
 * The score answers "how much of the work was right". It does not separate a careful candidate who ran
 * out of time from a fast one who guessed, and a hiring manager needs to know which. This profile reports
 * the two things separately, from data the server already holds:
 *   - speed: time used, from the server's own start and close timestamps (never a client clock), and the
 *     time per answered activity;
 *   - completion: how many activities were answered at all;
 *   - accuracy: points earned on the activities the candidate answered, out of the points those activities
 *     carry. Unanswered activities lower completion, not accuracy.
 *
 * It never changes a score. The thresholds that name a profile are design assumptions, stated in `basis`,
 * because no norm group exists yet: re-set them from pilot data before describing a profile as typical.
 */

const PROVISIONAL = 'Provisional thresholds, not normed: finished means at least 80% of activities answered; '
  + 'accurate means at least 85% of the answered work correct, mostly accurate at least 65%; '
  + 'quick means at most 75% of the time limit used. Set from pilot data before comparing candidates on it.';

const PROFILES = {
  incomplete: 'Did not finish',
  accurate_efficient: 'Accurate and efficient',
  accurate_full_time: 'Accurate, used most of the time',
  mostly_accurate: 'Mostly accurate',
  fast_error_prone: 'Fast but error-prone',
  low_accuracy: 'Low accuracy',
};

const round1 = (n) => Math.round(n * 10) / 10;

/* items: graded items as returned by gradeBattery ({ given, awarded, points }). `given` is null when the
   candidate left the activity blank; a line-matching item with any line answered counts as answered. */
export function speedAccuracy({ items, startedAtMs, closedAtMs, limitSeconds }) {
  if (!Array.isArray(items) || !items.length || !Number.isFinite(startedAtMs) || !Number.isFinite(closedAtMs)) return null;
  const limit = Number.isFinite(limitSeconds) && limitSeconds > 0 ? limitSeconds : null;
  const elapsed = Math.max(0, Math.round((closedAtMs - startedAtMs) / 1000));
  const used = limit ? Math.min(limit, elapsed) : elapsed;
  const answeredItems = items.filter((i) => i.given !== null && i.given !== undefined && i.given !== '');
  const answered = answeredItems.length;
  const answeredPoints = answeredItems.reduce((n, i) => n + (Number(i.points) || 0), 0);
  const answeredEarned = answeredItems.reduce((n, i) => n + (Number(i.awarded) || 0), 0);
  const accuracy = answeredPoints ? round1((answeredEarned / answeredPoints) * 100) : null;
  const completion = round1((answered / items.length) * 100);
  const timePercent = limit ? round1((used / limit) * 100) : null;

  let key;
  if (completion < 80 || accuracy === null) key = 'incomplete';
  else if (accuracy >= 85) key = timePercent !== null && timePercent <= 75 ? 'accurate_efficient' : 'accurate_full_time';
  else if (accuracy >= 65) key = 'mostly_accurate';
  else key = timePercent !== null && timePercent <= 50 ? 'fast_error_prone' : 'low_accuracy';

  return {
    time_used_seconds: used,
    time_limit_seconds: limit,
    time_used_percent: timePercent,
    answered,
    total: items.length,
    completion_percent: completion,
    accuracy_percent: accuracy,
    seconds_per_answer: answered ? Math.round(used / answered) : null,
    profile: { key, label: PROFILES[key] },
    basis: PROVISIONAL,
  };
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* One line a recruiter can read at a glance, used by the result email. */
export function speedAccuracySummary(sa) {
  if (!sa) return 'Not available';
  const accuracy = sa.accuracy_percent === null ? 'no answered work' : `${sa.accuracy_percent}% accurate on answered work`;
  const time = sa.time_limit_seconds ? `${formatDuration(sa.time_used_seconds)} of ${formatDuration(sa.time_limit_seconds)}` : formatDuration(sa.time_used_seconds);
  return `${sa.profile.label}: ${accuracy}, ${sa.answered} of ${sa.total} activities answered, ${time} used`;
}
