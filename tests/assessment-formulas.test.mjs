import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateCell } from '../src/assessments/formulas.js';

test('spreadsheet arithmetic and references work without eval()', () => {
  const cells = { A1: '12', B1: '8', C1: '=A1+B1', D1: '=C1/2' };
  assert.equal(calculateCell(cells, 'C1'), '20');
  assert.equal(calculateCell(cells, 'D1'), '10');
});

test('SUM and ABS operate on cell ranges', () => {
  const cells = { A1: '12', A2: '-3', A3: '=SUM(A1:A2)', B1: '=ABS(A2)', C1: '=MIN(A1,A2)', D1: '=MAX(A1,A2)' };
  assert.equal(calculateCell(cells, 'A3'), '9');
  assert.equal(calculateCell(cells, 'B1'), '3');
  assert.equal(calculateCell(cells, 'C1'), '-3');
  assert.equal(calculateCell(cells, 'D1'), '12');
});

test('circular references, malformed expressions and division by zero fail safely', () => {
  assert.equal(calculateCell({ A1: '=A1+1' }, 'A1'), '#CYCLE!');
  assert.equal(calculateCell({ A1: '=1/0' }, 'A1'), '#DIV/0!');
  assert.equal(calculateCell({ A1: '=SUM(A1:Z999999)' }, 'A1'), '#FORMULA!');
  assert.equal(calculateCell({ A1: '=untrusted()' }, 'A1'), '#FORMULA!');
});
