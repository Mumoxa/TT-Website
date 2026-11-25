/* Pure clock model for a future server-authoritative HR pilot integration.
 * NOT a persistence layer: callers must persist transitions atomically with CAS,
 * enforce access control, and use a trusted server clock. No routes call it yet.
 */
const STEPS = Object.freeze([
  Object.freeze({ id: 'INTRO', seconds: 60 }),
  ...['HR01', 'HR02', 'HR03', 'HR04'].map(id => Object.freeze({ id, seconds: 240 })),
  Object.freeze({ id: 'HR05', seconds: 180 }),
]);
const DURATION_MS = 1_200_000;
function time(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Expected a server timestamp in milliseconds.');
  return value;
}
function stepAt(index, startedAt, attemptDeadline) {
  return { id: STEPS[index].id, started_at_ms: startedAt, deadline_at_ms: Math.min(startedAt + STEPS[index].seconds * 1000, attemptDeadline) };
}
export function startHrClock(now) {
  time(now);
  if (!Number.isSafeInteger(now + DURATION_MS)) throw new TypeError('Timestamp out of range.');
  return { status:'active', started_at_ms:now, deadline_at_ms:now + DURATION_MS, index:0, step:stepAt(0,now,now + DURATION_MS), closed:[] };
}
function closeAndAdvance(state, at, reason) {
  const closed = [...state.closed, {...state.step, closed_at_ms:at, reason}];
  const index = state.index + 1;
  if (index === STEPS.length) return {...state, status:'submitted', index, step:null, closed, submitted_at_ms:at};
  return {...state, index, step:stepAt(index,at,state.deadline_at_ms), closed};
}
// Catch up at recorded deadlines rather than granting more time after a reconnect.
export function settleHrClock(state, now) {
  time(now);
  if (state.status !== 'active') return state;
  if (now < state.step.started_at_ms) throw new TypeError('Server time precedes current step.');
  let result = state;
  while (result.status === 'active' && now >= result.step.deadline_at_ms) {
    result = closeAndAdvance(result, result.step.deadline_at_ms, 'expired');
  }
  return result;
}
// expectedStep makes retries harmless after a successful transition, when
// coupled with a persistent version/CAS check in the calling storage layer.
export function advanceHrClock(state, now, expectedStep) {
  const settled = settleHrClock(state, now);
  if (settled.status !== 'active' || settled.step.id !== expectedStep) return settled;
  return closeAndAdvance(settled, now, 'submitted');
}
