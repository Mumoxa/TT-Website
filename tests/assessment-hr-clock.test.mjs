import test from 'node:test';
import assert from 'node:assert/strict';
import {startHrClock,settleHrClock,advanceHrClock} from '../functions/lib/hr-generalist-clock.js';

test('early advance forfeits unused time and duplicate transition is harmless',()=>{
  let clock=startHrClock(1000);
  clock=advanceHrClock(clock,11000,'INTRO');
  assert.equal(clock.step.id,'HR01'); assert.equal(clock.step.started_at_ms,11000); assert.equal(clock.step.deadline_at_ms,251000);
  assert.deepEqual(advanceHrClock(clock,11000,'INTRO'),clock);
  clock=advanceHrClock(clock,21000,'HR01');
  assert.equal(clock.step.id,'HR02'); assert.equal(clock.step.deadline_at_ms,261000);
});
test('expiry catch-up uses old deadlines and never refresh time',()=>{
  const clock=settleHrClock(startHrClock(1000),800000);
  assert.equal(clock.step.id,'HR04'); assert.equal(clock.step.started_at_ms,781000); assert.equal(clock.step.deadline_at_ms,1021000);
  assert.deepEqual(clock.closed.map(s=>s.closed_at_ms),[61000,301000,541000,781000]);
  const finished=settleHrClock(clock,2_000_000);
  assert.equal(finished.status,'submitted'); assert.equal(finished.submitted_at_ms,1201000);
  assert.deepEqual(settleHrClock(finished,2_000_001),finished);
});
test('exact cutoff closes step before considering submission',()=>{
  const state=advanceHrClock(startHrClock(0),60000,'INTRO');
  assert.equal(state.step.id,'HR01'); assert.equal(state.closed[0].reason,'expired');
  assert.throws(()=>startHrClock(-1)); assert.throws(()=>settleHrClock(startHrClock(5),4));
});
