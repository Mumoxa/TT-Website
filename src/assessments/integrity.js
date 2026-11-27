/* Assessment integrity (owner decision 2026-11-27). Shared by the candidate screens and the API.
   On for the assessments listed in INTEGRITY_SLUGS only.
   - The candidate accepts an honesty statement before the timer starts (its version is stored on the attempt).
   - Copying or cutting question text, the right-click menu and dragging text are switched off. The candidate's own
     answer boxes can still be copied and pasted.
   - Leaving the assessment page (another tab, another window, minimising, closing or reloading) is recorded with
     server timestamps, so the time away is measured by the server, not the browser. Pastes into answer boxes whose
     text was not copied inside the assessment are counted.
   These are records of browser events, not proof of misconduct: they cannot see a second device such as a phone. */

export const INTEGRITY_SLUGS = new Set(['ar-clerk-v1']);
export const integrityOn = (slug) => INTEGRITY_SLUGS.has(String(slug || ''));

export const INTEGRITY_STATEMENT_VERSION = 'honesty-statement-2026-11-27';
export const INTEGRITY_STATEMENT = 'I will do this assessment on my own, without help from another person, AI tools such as ChatGPT, or websites. I understand that copying the questions is switched off, and that each time I leave this page (another tab or window, minimising, closing or reloading) the time is recorded and shown to the recruiter.';

// A leave counts as long from this many milliseconds.
export const LONG_LEAVE_MS = 30000;
export const INTEGRITY_EVENTS = ['left', 'back', 'paste', 'copy'];

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const secs = (ms) => Math.round(ms / 1000);

/** Summary for the recruiter report and email. A leave still open when the attempt closed counts up to the close. */
export function integritySummary(raw, { closedAtMs = null, expiresAtMs = null, statementVersion = null } = {}) {
  let r = {};
  try { r = typeof raw === 'string' ? JSON.parse(raw || '{}') || {} : raw || {}; } catch { r = {}; }
  let awayMs = num(r.away_ms), longestMs = num(r.longest_ms), longLeaves = num(r.long_leaves);
  const openSince = num(r.away_since);
  // A timed-out attempt is closed when the server next sees it, so an open leave runs to the deadline at most.
  const end = closedAtMs ? Math.min(Number(closedAtMs), expiresAtMs ? Number(expiresAtMs) : Infinity) : null;
  const openAtClose = Boolean(openSince && end && end > openSince);
  if (openAtClose) {
    const open = end - openSince;
    awayMs += open; longestMs = Math.max(longestMs, open); if (open >= LONG_LEAVE_MS) longLeaves += 1;
  }
  return {
    statement_accepted: statementVersion === INTEGRITY_STATEMENT_VERSION,
    leaves: num(r.leaves), long_leaves: longLeaves,
    away_seconds: secs(awayMs), longest_away_seconds: secs(longestMs),
    away_at_close: openAtClose,
    outside_pastes: num(r.pastes), copy_blocked: num(r.copy_blocked),
    basis: 'Browser events timed by the server. It cannot see a second device, and people also leave a page for innocent reasons. Use it to ask questions, not as proof.',
  };
}

const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);

/** One line for the email and the report heading. */
export function integrityLine(s) {
  if (!s) return '';
  const leaves = s.leaves === 0 ? 'Did not leave the assessment page'
    : `Left the assessment page ${s.leaves} time${s.leaves === 1 ? '' : 's'}, ${dur(s.away_seconds)} in total (longest ${dur(s.longest_away_seconds)}${s.long_leaves ? `; ${s.long_leaves} longer than 30 s` : ''})${s.away_at_close ? '; was away when the time ran out' : ''}`;
  return [leaves, `pasted from outside ${s.outside_pastes} time${s.outside_pastes === 1 ? '' : 's'}`, `copy attempts blocked ${s.copy_blocked}`,
    s.statement_accepted ? 'honesty statement accepted' : 'honesty statement not recorded'].join('; ') + '.';
}
