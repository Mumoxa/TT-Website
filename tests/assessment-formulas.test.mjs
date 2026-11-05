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
  assert.equal(calculateCell({ A1: '=SUM(A1:Z999999)' }, 'A1'), '#REF!');
  assert.equal(calculateCell({ A1: '=untrusted()' }, 'A1'), '#FORMULA!');
});

test('dependent formulas preserve precision and sum ranges ignore text headings',()=>{
 assert.equal(calculateCell({A1:'=1/3',B1:'=A1*3'},'B1'),'1');
 assert.equal(calculateCell({A1:'Heading',A2:'12',A3:'3',B1:'=SUM(A1:A3)'},'B1'),'15');
 assert.equal(calculateCell({A1:'=.5+1.25'},'A1'),'1.75');
});
test('repeated dependency graphs complete without exponential evaluation',()=>{
 const cells={A1:'1'};for(let r=2;r<=20;r++)cells['A'+r]='=SUM('+Array(6).fill('A'+(r-1)).join(',')+')';
 assert.ok(Number.isFinite(Number(calculateCell(cells,'A20'))));
});

test('absolute references ($A$1, A$1, $A1) resolve like plain references', () => {
  const cells = { 'Ledger!A2': 'X-1', 'Ledger!A3': 'X-2', 'Sheet!B1': '5', 'Sheet!B2': '7' };
  cells['Sheet!C1'] = '=IFERROR(VLOOKUP("X-2",Ledger!$A$2:$A$3,1,FALSE),"MISSING")';
  assert.equal(calculateCell(cells, 'Sheet!C1'), 'X-2');
  cells['Sheet!C2'] = '=SUM($B$1:B$2)+$B1';
  assert.equal(calculateCell(cells, 'Sheet!C2'), '17');
  cells['Sheet!C3'] = '=$$B1';
  assert.equal(calculateCell(cells, 'Sheet!C3'), '#FORMULA!');
});
