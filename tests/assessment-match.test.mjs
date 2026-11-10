import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBattery, publicBattery, cleanBatterySubmission, gradeBattery, BatteryError } from '../functions/lib/battery.js';
import { assertPracticeIsolation } from '../functions/lib/practice-isolation.js';

// Synthetic line-matching battery (no live content).
const CHOICES = [{ id: 'o1', text: 'Agrees' }, { id: 'o2', text: 'Missing from ledger' }, { id: 'o3', text: 'Posted incorrectly' }, { id: 'o4', text: 'Timing difference' }];
const LINES = [
  { id: 'l1', doc: 'Statement', ref: 'S-100', detail: 'Synthetic invoice', amount: 'R100.00' },
  { id: 'l2', doc: 'Statement', ref: 'S-200', detail: 'Synthetic invoice not in ledger', amount: 'R200.00' },
  { id: 'l3', doc: 'Ledger', ref: 'J-1', detail: 'Synthetic payment', amount: '−R50.00' },
  { id: 'l4', doc: 'Ledger', ref: 'J-2', detail: 'Synthetic payment repeated', amount: '−R50.00' },
  { id: 'l5', doc: 'Ledger', ref: 'J-3', detail: 'Synthetic payment after cut-off', amount: '−R30.00' },
];
function pkg() {
  return structuredClone({
    question_payload: {
      format: 'battery-v2', instructions: 'Synthetic battery for line matching tests.',
      sections: [
        { id: 's1', title: 'Synthetic knowledge', items: [
          { id: 'k1', type: 'single', category: 'knowledge', points: 2, prompt: 'Synthetic knowledge question here', options: [{ id: 'o1', text: 'Alpha choice' }, { id: 'o2', text: 'Beta choice' }] },
          { id: 'k2', type: 'single', category: 'knowledge', points: 2, prompt: 'Second synthetic knowledge question', options: [{ id: 'o1', text: 'Gamma choice' }, { id: 'o2', text: 'Delta choice' }] },
        ] },
        { id: 's2', title: 'Synthetic practical', items: [
          { id: 'mx', type: 'match', category: 'reconciliation', points: LINES.length, prompt: 'Classify every synthetic line below.', choices: CHOICES, lines: LINES },
        ] },
      ],
      workbook: { sheets: [{ name: 'Src', writable: false }, { name: 'W', writable: true }], source: { 'Src!A1': 'x' } },
    },
    scoring_key: { items: { k1: { answer: 'o1' }, k2: { answer: 'o2' }, mx: { answer: { l1: 'o1', l2: 'o2', l3: 'o1', l4: 'o3', l5: 'o4' }, alternatives: [{ l3: 'o3', l4: 'o1' }] } } },
  });
}
const empty = { mcq: {}, structured: { text: {}, multi: {} }, workbook: {} };
const grade = (match) => gradeBattery({ payload: pkg().question_payload, key: pkg().scoring_key }, { ...empty, structured: { ...empty.structured, match: { mx: match } } });

test('a valid line-matching item validates and its public form has no key', () => {
  assert.doesNotThrow(() => validateBattery(pkg()));
  const item = publicBattery(pkg().question_payload).sections[1].items[0];
  assert.deepEqual(item.choices, CHOICES);
  assert.deepEqual(item.lines, LINES);
  assert.doesNotMatch(JSON.stringify(item), /answer|alternatives|points/);
});

test('invalid line-matching items are refused', () => {
  const broken = [
    (p) => { p.question_payload.sections[1].items[0].points = 4; },
    (p) => { p.question_payload.sections[1].items[0].lines = [LINES[0]]; p.question_payload.sections[1].items[0].points = 1; },
    (p) => { p.question_payload.sections[1].items[0].choices = [CHOICES[0]]; },
    (p) => { p.question_payload.sections[1].items[0].lines[0].id = 'x1'; },
    (p) => { delete p.scoring_key.items.mx.answer.l5; },
    (p) => { p.scoring_key.items.mx.answer.l1 = 'o9'; },
    (p) => { p.scoring_key.items.mx.alternatives = [{ l9: 'o1' }]; },
  ];
  for (const f of broken) { const p = pkg(); f(p); assert.throws(() => validateBattery(p), BatteryError, f.toString()); }
});

test('submissions keep only valid lines and choices', () => {
  const pub = publicBattery(pkg().question_payload);
  const clean = cleanBatterySubmission({ mcq: {}, structured: { match: { mx: { l1: 'o1', l5: 'o4' } } } }, pub);
  assert.deepEqual(clean.structured.match, { mx: { l1: 'o1', l5: 'o4' } });
  assert.throws(() => cleanBatterySubmission({ structured: { match: { mx: { l9: 'o1' } } } }, pub), BatteryError);
  assert.throws(() => cleanBatterySubmission({ structured: { match: { mx: { l1: 'o7' } } } }, pub), BatteryError);
  assert.throws(() => cleanBatterySubmission({ structured: { match: { k1: { l1: 'o1' } } } }, pub), BatteryError);
});

test('one point per correct line, and either duplicate reading counts', () => {
  const all = grade({ l1: 'o1', l2: 'o2', l3: 'o1', l4: 'o3', l5: 'o4' });
  const it = all.items.find((i) => i.id === 'mx');
  assert.equal(it.awarded, 5); assert.equal(it.correct, true);
  const swapped = grade({ l1: 'o1', l2: 'o2', l3: 'o3', l4: 'o1', l5: 'o4' }).items.find((i) => i.id === 'mx');
  assert.equal(swapped.awarded, 5, 'the other copy may be called the duplicate');
  const partial = grade({ l1: 'o1', l2: 'o3', l5: 'o1' }).items.find((i) => i.id === 'mx');
  assert.equal(partial.awarded, 1); assert.equal(partial.correct, false);
  assert.deepEqual(partial.lines.map((l) => l.ok), [true, false, false, false, false]);
  assert.match(partial.given, /S-100: Agrees/); assert.match(partial.given, /J-2: No answer/);
  const none = grade({}).items.find((i) => i.id === 'mx');
  assert.equal(none.awarded, 0); assert.equal(none.correct, null);
  assert.equal(all.breakdown.categories.reconciliation.max, 5);
});

test('line matching passes practice isolation', () => {
  assert.doesNotThrow(() => assertPracticeIsolation(pkg().question_payload, pkg().scoring_key));
});
