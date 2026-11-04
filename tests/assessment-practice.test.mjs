import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_ITEMS, PRACTICE_SOURCE, practiceFeedback } from '../src/assessments/practice.js';
import { assertPracticeIsolation } from '../functions/lib/practice-isolation.js';
import { SYNTHETIC_BATTERY, SYNTHETIC_BATTERY_KEY, SYNTHETIC_SHEETS_BATTERY, SYNTHETIC_SHEETS_KEY } from './fixtures/synthetic-battery.mjs';

test('public practice has exactly three unscored formats and exact choice feedback', () => {
  assert.deepEqual(PRACTICE_ITEMS.map(i => i.type), ['single', 'multi', 'cell']);
  assert.ok(PRACTICE_ITEMS.every(i => !('points' in i)));
  assert.equal(practiceFeedback('practice-shelter', 'o1').correct, true);
  assert.equal(practiceFeedback('practice-shelter', 'o2').correct, false);
  assert.match(practiceFeedback('practice-shelter', '').answer, /Umbrella/);
  assert.equal(practiceFeedback('practice-music', ['o3', 'o1']).correct, true);
  assert.equal(practiceFeedback('practice-music', ['o1', 'o2', 'o3']).correct, false);
});
test('formula feedback uses workbook engine and requires a formula', () => {
  assert.equal(practiceFeedback('practice-tokens', '=SUM(C2:C3)').correct, true);
  assert.equal(practiceFeedback('practice-tokens', '=C2+C3').correct, true);
  for (const value of ['601.85', '=SUM(C2:C4)+1', '=1/0', '']) assert.equal(practiceFeedback('practice-tokens', value).correct, false);
  assert.match(practiceFeedback('practice-tokens', '').answer, /601\.85/);
});
test('existing synthetic batteries do not collide despite shared opaque option IDs', () => {
  assert.doesNotThrow(() => assertPracticeIsolation(SYNTHETIC_BATTERY, SYNTHETIC_BATTERY_KEY));
  assert.doesNotThrow(() => assertPracticeIsolation(SYNTHETIC_SHEETS_BATTERY, SYNTHETIC_SHEETS_KEY));
});
function collision(mutate) {
  const payload = structuredClone(SYNTHETIC_BATTERY), key = structuredClone(SYNTHETIC_BATTERY_KEY);
  mutate(payload, key);
  assert.throws(() => assertPracticeIsolation(payload, key), /Practice content overlaps/);
}
test('isolation rejects normalized prompts, option texts and resolved correct choices', () => {
  collision(p => { p.sections[0].items[0].prompt = '  ' + PRACTICE_ITEMS[0].prompt.toUpperCase() + '  '; });
  collision(p => { p.sections[0].items[0].options[1].text = 'UMBRELLA'; });
  collision((p, k) => { p.sections[0].items[1].type = 'text'; k.items.k2.answer = ' violin '; });
  collision((p, k) => { k.items.r1.answer = 601.85; });
});
test('isolation rejects whole source table reuse and permits incidental values', () => {
  collision(p => { p.workbook.source = { ...PRACTICE_SOURCE }; });
  const p = structuredClone(SYNTHETIC_BATTERY);
  p.workbook.source.A8 = '173.25';
  assert.doesNotThrow(() => assertPracticeIsolation(p, SYNTHETIC_BATTERY_KEY));
});
test('isolation fails closed on missing published content/key', () => {
  assert.throws(() => assertPracticeIsolation(null, null));
  assert.throws(() => assertPracticeIsolation(SYNTHETIC_BATTERY, {}));
});
