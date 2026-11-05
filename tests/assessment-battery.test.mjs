import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBattery, publicBattery, cleanBatterySubmission, cleanBatteryWorkbook, batteryWorkbookRules, gradeBattery, parseLooseNumber, BatteryError,
} from '../functions/lib/battery.js';
import { SYNTHETIC_BATTERY, SYNTHETIC_BATTERY_KEY, SYNTHETIC_SHEETS_BATTERY, SYNTHETIC_SHEETS_KEY } from './fixtures/synthetic-battery.mjs';

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

test('workbook saves reject writes to read-only source cells (default sheet)', () => {
  const rules = { sourceCanon: new Set(['A1', 'B2']), writableSheets: null };
  assert.throws(() => cleanBatteryWorkbook({ B2: '5' }, rules), /read-only/);
  assert.deepEqual(cleanBatteryWorkbook({ B12: '=SUM(B2:B4)' }, rules), { B12: '=SUM(B2:B4)' });
});

test('three-tab workbook: statement and ledger are read-only, only the reconciliation tab accepts saves', () => {
  const p = pkg();
  p.question_payload.workbook = {
    sheets: [{ name: 'Supplier', writable: false }, { name: 'Ledger', writable: false }, { name: 'Reconciliation', writable: true }],
    source: { 'Supplier!A1': 'Ref', 'Supplier!D2': '100', 'Ledger!I2': '100' },
  };
  p.question_payload.sections[1].items[0].ref = 'Reconciliation!B12';
  p.question_payload.sections[1].items[1].ref = 'Reconciliation!B13';
  const v = validateBattery(p);
  const rules = batteryWorkbookRules(publicBattery(v.question_payload));
  assert.deepEqual(cleanBatteryWorkbook({ 'Reconciliation!B5': '=SUM(Supplier!D2:D2)' }, rules), { 'Reconciliation!B5': '=SUM(Supplier!D2:D2)' });
  assert.throws(() => cleanBatteryWorkbook({ 'Supplier!D3': '5' }, rules), /read-only/);
  assert.throws(() => cleanBatteryWorkbook({ 'Ledger!J9': '5' }, rules), /read-only/);
  assert.throws(() => cleanBatteryWorkbook({ 'Reconciliation!a1': '1' }, rules), /Invalid workbook cell/);
  assert.throws(() => cleanBatteryWorkbook({ 'Supplier!A1': 'x' }, rules), /read-only/);
  assert.throws(() => cleanBatteryWorkbook({ 'Nope!B1': '5' }, rules), /read-only/);
});

test('a battery item may not write to a read-only sheet, and sheet names must be declared', () => {
  const p = pkg();
  p.question_payload.workbook = { sheets: [{ name: 'Supplier', writable: false }, { name: 'Recon', writable: true }], source: { 'Supplier!A1': 'x' } };
  p.question_payload.sections[1].items[0].ref = 'Supplier!B12';
  assert.throws(() => validateBattery(p), /writable sheet/);
  p.question_payload.sections[1].items[0].ref = 'Recon!B12';
  p.question_payload.workbook.source = { 'Mystery!A1': 'x' };
  assert.throws(() => validateBattery(p), /unknown sheet/);
});

test('loose number parsing accepts thousands separators and rejects locale-ambiguous forms', () => {
  assert.equal(parseLooseNumber('12,345.67'), 12345.67);
  assert.equal(parseLooseNumber('-3200'), -3200);
  assert.equal(parseLooseNumber('#VALUE!'), null);
  assert.equal(parseLooseNumber('12.345,67'), null);
  assert.equal(parseLooseNumber('1,2345'), null);
});

test('two-tab synthetic battery grades cross-tab formulas, lookups and IF', () => {
  const v = validateBattery({ question_payload: structuredClone(SYNTHETIC_SHEETS_BATTERY), scoring_key: structuredClone(SYNTHETIC_SHEETS_KEY) });
  const g = gradeBattery({ payload: v.question_payload, key: v.scoring_key }, {
    mcq: { p1: 'o1' }, structured: {},
    workbook: { 'Working!B2': '=SUM(Supplier!B2:B4)', 'Working!B3': '=VLOOKUP("S-2",Supplier!A2:B4,2,FALSE)', 'Working!B4': '=IF(Working!B2=400,"AGREES","DIFFERS")' },
  });
  assert.equal(g.overall_score, 100);
  assert.equal(g.breakdown.items_correct, 4);
});

test('a formula on the read-only tab is never accepted as a candidate answer', () => {
  const v = validateBattery({ question_payload: structuredClone(SYNTHETIC_SHEETS_BATTERY), scoring_key: structuredClone(SYNTHETIC_SHEETS_KEY) });
  const rules = batteryWorkbookRules(publicBattery(v.question_payload));
  assert.throws(() => cleanBatteryWorkbook({ 'Supplier!B2': '999' }, rules), /read-only/);
  // Source values are the only values on that tab: the grader sees 400 from the source.
  const g = gradeBattery({ payload: v.question_payload, key: v.scoring_key }, { mcq: {}, structured: {}, workbook: { 'Working!B2': '=SUM(Supplier!B2:B4)' } });
  assert.equal(g.items.find((i) => i.id === 'p2').correct, true);
});

test('item instructions are optional, bounded to text, and shown to candidates only when present', () => {
 const withText = pkg();
 withText.question_payload.sections[0].items[0].instructions = '  Choose the option that matches the statement.  ';
 const valid = validateBattery(withText);
 const shown = publicBattery(valid.question_payload).sections[0].items[0];
 assert.equal(shown.instructions, 'Choose the option that matches the statement.');
 const tooLong = pkg(); tooLong.question_payload.sections[0].items[0].instructions = 'x'.repeat(601);
 assert.throws(() => validateBattery(tooLong), BatteryError);
 const notText = pkg(); notText.question_payload.sections[0].items[0].instructions = 42;
 assert.throws(() => validateBattery(notText), BatteryError);
 const plain = validateBattery(pkg());
 assert.equal('instructions' in publicBattery(plain.question_payload).sections[0].items[0], false);
});

test('typed amounts are read the way they appear on South African documents', async () => {
  const { parseAmount } = await import('../functions/lib/battery.js');
  for (const [text, n] of [['26050', 26050], ['26,050.00', 26050], ['R26 050', 26050], ['R 26 050,00', 26050], ['r26050', 26050],
    ['1500,00', 1500], ['1500,5', 1500.5], ['-3 200', -3200], ['-R3 200', -3200], ['R-3200', -3200], ['26 050', 26050]]) {
    assert.equal(parseAmount(text), n, text);
  }
  for (const text of ['1.234,56', '12,34,5', 'R', 'AGREES', '', '#VALUE!']) assert.equal(parseAmount(text), null, text);
});

test('documents display is validated and passed to the candidate without keys', async () => {
  const { SYNTHETIC_SHEETS_BATTERY, SYNTHETIC_SHEETS_KEY } = await import('./fixtures/synthetic-battery.mjs');
  const readOnly = SYNTHETIC_SHEETS_BATTERY.workbook.sheets.find((s) => !s.writable).name;
  const writable = SYNTHETIC_SHEETS_BATTERY.workbook.sheets.find((s) => s.writable).name;
  const withDocs = (workbook) => ({ question_payload: { ...structuredClone(SYNTHETIC_SHEETS_BATTERY), workbook: { ...structuredClone(SYNTHETIC_SHEETS_BATTERY.workbook), ...workbook } }, scoring_key: structuredClone(SYNTHETIC_SHEETS_KEY) });
  const ok = withDocs({ display: 'documents', documents: [{ title: 'Supplier statement', range: readOnly + '!A1:C4' }] });
  assert.doesNotThrow(() => validateBattery(ok));
  const pub = publicBattery(ok.question_payload);
  assert.equal(pub.workbook.display, 'documents');
  assert.deepEqual(pub.workbook.documents, [{ title: 'Supplier statement', range: readOnly + '!A1:C4' }]);
  assert.equal(publicBattery(SYNTHETIC_SHEETS_BATTERY).workbook.display, undefined);
  for (const bad of [
    { display: 'pictures' },
    { display: 'documents' },
    { display: 'documents', documents: [] },
    { display: 'documents', documents: [{ title: 'X', range: readOnly + '!A1:C4' }] },
    { display: 'documents', documents: [{ title: 'Working', range: writable + '!A1:C4' }] },
    { display: 'documents', documents: [{ title: 'Unknown', range: 'Nope!A1:C4' }] },
    { display: 'documents', documents: [{ title: 'Bad range', range: readOnly + '!A1' }] },
    { documents: [{ title: 'Supplier statement', range: readOnly + '!A1:C4' }] },
  ]) assert.throws(() => validateBattery(withDocs(bad)), BatteryError, JSON.stringify(bad));
});
