import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBattery, publicBattery, cleanBatterySubmission, cleanBatteryWorkbook, gradeBattery, parseLooseNumber, BatteryError,
} from '../functions/lib/battery.js';
import { SYNTHETIC_BATTERY, SYNTHETIC_BATTERY_KEY } from './fixtures/synthetic-battery.mjs';

const pkg = () => ({ question_payload: structuredClone(SYNTHETIC_BATTERY), scoring_key: structuredClone(SYNTHETIC_BATTERY_KEY) });
const perfect = () => ({
  mcq: { k1: 'o1', r3: 'o1' },
  structured: { text: { k2: 'synthetic' }, multi: { k3: ['o3', 'o1'] } },
  workbook: { B12: '=SUM(B2:B4)', B13: '=COUNTIF(C2:C4,"open")' },
});
const version = () => { const v = validateBattery(pkg()); return { payload: v.question_payload, key: v.scoring_key }; };

test('synthetic battery validates and reports its engine version', () => {
  const v = validateBattery(pkg());
  assert.equal(v.engine, 'ap-battery-v2');
  assert.equal(v.scoring_key.pass_percent, 75);
});

test('a key that answers an item the battery does not contain is refused', () => {
  const p = pkg(); p.scoring_key.items.ghost = { answer: 'x' };
  assert.throws(() => validateBattery(p), BatteryError);
});

test('a cell item may not point at a read-only source cell', () => {
  const p = pkg(); p.question_payload.sections[1].items[0].ref = 'B2';
  assert.throws(() => validateBattery(p), /read-only source cell/);
});

test('single-category batteries are refused (both categories are required)', () => {
  const p = pkg(); p.question_payload.sections[1].items = p.question_payload.sections[1].items.map((i) => ({ ...i, category: 'knowledge' }));
  assert.throws(() => validateBattery(p), /knowledge and reconciliation/);
});

test('public payload exposes no answers, tolerances, unsafe options or weights', () => {
  const text = JSON.stringify(publicBattery(validateBattery(pkg()).question_payload));
  for (const forbidden of ['"answer"', '"tolerance"', '"unsafe"', '"points"', '"category"']) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
});

test('a perfect submission scores 100 with both categories full', () => {
  const g = gradeBattery(version(), perfect());
  assert.equal(g.overall_score, 100);
  assert.equal(g.knowledge_score, 40);
  assert.equal(g.reconciliation_score, 60);
  assert.equal(g.passed, true);
  assert.equal(g.breakdown.items_correct, 6);
});

test('empty submission scores zero and is not a pass', () => {
  const g = gradeBattery(version(), { mcq: {}, structured: {}, workbook: {} });
  assert.equal(g.overall_score, 0);
  assert.equal(g.passed, false);
  assert.ok(g.items.every((i) => i.correct === null));
});

test('cell answers are read from the calculated workbook, so typed formulas are graded', () => {
  const g = gradeBattery(version(), { ...perfect(), workbook: { B12: '=SUM(B2:B4)', B13: '=COUNTIF(C2:C4,"OPEN")' } });
  assert.equal(g.items.find((i) => i.id === 'r1').correct, true);
  const wrong = gradeBattery(version(), { ...perfect(), workbook: { B12: '999', B13: '2' } });
  assert.equal(wrong.items.find((i) => i.id === 'r1').correct, false);
});

test('unsafe choices are flagged without changing the items score', () => {
  const g = gradeBattery(version(), { ...perfect(), mcq: { k1: 'o1', r3: 'o2' } });
  assert.deepEqual(g.critical_flags, ['Unsafe choice selected in Synthetic workbook']);
  assert.equal(g.items.find((i) => i.id === 'r3').correct, false);
});

test('multi-select needs the exact set, not a subset', () => {
  const g = gradeBattery(version(), { ...perfect(), structured: { text: { k2: 'synthetic' }, multi: { k3: ['o1'] } } });
  assert.equal(g.items.find((i) => i.id === 'k3').correct, false);
});

test('text answers ignore case and spacing', () => {
  const g = gradeBattery(version(), { ...perfect(), structured: { text: { k2: '  SYNTHETIC ' }, multi: { k3: ['o1', 'o3'] } } });
  assert.equal(g.items.find((i) => i.id === 'k2').correct, true);
});

test('submission cleaning rejects unknown items and invalid options', () => {
  const pub = publicBattery(validateBattery(pkg()).question_payload);
  assert.throws(() => cleanBatterySubmission({ mcq: { nope: 'o_alpha' } }, pub), BatteryError);
  assert.throws(() => cleanBatterySubmission({ mcq: { k1: 'o9' } }, pub), BatteryError);
  assert.throws(() => cleanBatterySubmission({ structured: { multi: { k3: ['o9'] } } }, pub), BatteryError);
  const ok = cleanBatterySubmission({ mcq: { k1: 'o2' }, structured: { text: { k2: '  hi ' }, multi: { k3: ['o1', 'o1'] } } }, pub);
  assert.deepEqual(ok, { mcq: { k1: 'o2' }, structured: { text: { k2: 'hi' }, multi: { k3: ['o1'] } } });
});

test('workbook saves reject writes to read-only source cells', () => {
  const readOnly = new Set(['A1', 'B2']);
  assert.throws(() => cleanBatteryWorkbook({ B2: '5' }, readOnly), /read-only/);
  assert.deepEqual(cleanBatteryWorkbook({ B12: '=SUM(B2:B4)' }, readOnly), { B12: '=SUM(B2:B4)' });
});

test('loose number parsing accepts thousands separators and rejects locale-ambiguous forms', () => {
  assert.equal(parseLooseNumber('22,050.00'), 22050);
  assert.equal(parseLooseNumber('-3200'), -3200);
  assert.equal(parseLooseNumber('#VALUE!'), null);
  assert.equal(parseLooseNumber('22.050,00'), null);
  assert.equal(parseLooseNumber('1,2345'), null);
});
