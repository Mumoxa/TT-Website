/* Talent Tree Accounts Payable assessment deadline rules.
 * Server-side source of truth. Never use a client-submitted timestamp for saves.
 * These helpers do not depend on the browser or expose assessment answers.
 */
// 20 minutes. Raised from 10 on 2026-11-05: 23 items with a workbook did not fit in 10 minutes.
export const DEFAULT_ASSESSMENT_SECONDS = 1200;

export function expiryForStart(startedAtMs, seconds = DEFAULT_ASSESSMENT_SECONDS) {
  if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0) throw new TypeError('Invalid start timestamp');
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 7200) throw new RangeError('Invalid duration');
  return startedAtMs + seconds * 1000;
}

export function secondsRemaining(expiresAtMs, serverNowMs) {
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(serverNowMs)) throw new TypeError('Invalid timestamp');
  return Math.max(0, Math.ceil((expiresAtMs - serverNowMs) / 1000));
}

export function canPersistAttempt(attempt, serverNowMs) {
  if (!attempt || attempt.status !== 'active') return false;
  if (!Number.isSafeInteger(serverNowMs)) throw new TypeError('Invalid server timestamp');
  const expiry = Number(attempt.expires_at_ms);
  return Number.isSafeInteger(expiry) && serverNowMs < expiry;
}

export function nextAttemptStatus(attempt, serverNowMs) {
  if (!attempt) return 'not_found';
  if (attempt.status !== 'active') return attempt.status;
  return canPersistAttempt(attempt, serverNowMs) ? 'active' : 'timed_out';
}

/*
 * IMPORTANT: the eventual D1 save must ALSO perform an atomic conditional
 * update with WHERE status='active' AND expires_at_ms > <serverNowMs>.
 * This precheck alone is not sufficient to prevent cross-request races.
 */
