import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCell } from '../src/assessments/formulas.js';

const ledger = {
  'Ledger!F2': 'SYN-PAY', 'Ledger!G2': 'SYN-J1', 'Ledger!I2': '-500',
  'Ledger!F3': 'SYN-CN', 'Ledger!G3': 'SYN-J2', 'Ledger!I3': '320',
  'Ledger!F4': 'SYN-MISS', 'Ledger!G4': '', 'Ledger!I4': '',
  'Ledger!F5': 'SYN-INV', 'Ledger!G5': 'SYN-J3', 'Ledger!I5': '185',
};

test('IF evaluates only the branch taken, so the unused division is not an error', () => {
  assert.equal(calculateCell({ A1: '0', B1: '=IF(A1=0,0,10/A1)' }, 'B1'), '0');
  assert.equal(calculateCell({ A1: '4', B1: '=IF(A1=0,0,10/A1)' }, 'B1'), '2.5');
  assert.equal(calculateCell({ A1: '=IF(1>2,"yes","no")' }, 'A1'), 'no');
  assert.equal(calculateCell({ A1: '=IF(TRUE,"a")' }, 'A1'), 'a');
  assert.equal(calculateCell({ A1: '=IF(FALSE,"a")' }, 'A1'), 'FALSE');
});

test('IFERROR returns the fallback for errors and passes values through', () => {
  assert.equal(calculateCell({ A1: '=IFERROR(1/0,"n/a")' }, 'A1'), 'n/a');
  assert.equal(calculateCell({ A1: '=IFERROR(7,"n/a")' }, 'A1'), '7');
});

test('comparisons, text join and booleans', () => {
  assert.equal(calculateCell({ A1: '=2<=2' }, 'A1'), 'TRUE');
  assert.equal(calculateCell({ A1: '=1="1"' }, 'A1'), 'TRUE');
  assert.equal(calculateCell({ A1: '="INV-"&"1001"' }, 'A1'), 'INV-1001');
  assert.equal(calculateCell({ A1: '="a"<>"A"' }, 'A1'), 'FALSE');
});

test('VLOOKUP exact match returns the requested column and #N/A when absent', () => {
  const cells = { ...ledger, A1: '=VLOOKUP("SYN-PAY",Ledger!F2:I5,4,FALSE)', A2: '=VLOOKUP("NOPE",Ledger!F2:I5,4,FALSE)' };
  assert.equal(calculateCell(cells, 'A1'), '-500');
  assert.equal(calculateCell(cells, 'A2'), '#N/A');
});

test('VLOOKUP returns the first of duplicate keys (the duplicate is found by counting, not lookup)', () => {
  const cells = { ...ledger, A1: '=COUNTIF(Ledger!F2:F5,"SYN-PAY")' };
  assert.equal(calculateCell(cells, 'A1'), '1');
});

test('VLOOKUP approximate match picks the last row not above the key', () => {
  const cells = { A1: '1', A2: '10', A3: '20', B1: 'low', B2: 'mid', B3: 'high', C1: '=VLOOKUP(15,A1:B3,2,TRUE)', C2: '=VLOOKUP(20,A1:B3,2)' };
  assert.equal(calculateCell(cells, 'C1'), 'mid');
  assert.equal(calculateCell(cells, 'C2'), 'high');
});

test('VLOOKUP rejects column indices outside the table', () => {
  assert.equal(calculateCell({ ...ledger, A1: '=VLOOKUP("SYN-PAY",Ledger!F2:I5,5,FALSE)' }, 'A1'), '#REF!');
});

test('INDEX and MATCH: row lookup in a column and position of a key', () => {
  const cells = { ...ledger, A1: '=INDEX(Ledger!I2:I5,2)', A2: '=MATCH("SYN-CN",Ledger!F2:F5,0)', A3: '=INDEX(Ledger!F2:I5,3,4)', A4: '=INDEX(Ledger!I2:I5,9)' };
  assert.equal(calculateCell(cells, 'A1'), '320');
  assert.equal(calculateCell(cells, 'A2'), '2');
  assert.equal(calculateCell(cells, 'A3'), '');
  assert.equal(calculateCell(cells, 'A4'), '#REF!');
});

test('MATCH exact-not-found is #N/A; unsupported match types are refused', () => {
  const cells = { ...ledger, A1: '=MATCH("ZZZ",Ledger!F2:F5,0)', A2: '=MATCH("SYN-CN",Ledger!F2:F5,-1)' };
  assert.equal(calculateCell(cells, 'A1'), '#N/A');
  assert.equal(calculateCell(cells, 'A2'), '#VALUE!');
});

test('sheet-qualified references read other sheets; unqualified references stay on the cell sheet', () => {
  const cells = { 'Supplier!D2': '240', 'Supplier!D3': '-32', 'Recon!B1': '=SUM(Supplier!D2:D3)', 'Recon!B2': '=SUM(D2:D3)', 'Recon!B3': '=Supplier!D2*2' };
  assert.equal(calculateCell(cells, 'Recon!B1'), '208');
  assert.equal(calculateCell(cells, 'Recon!B2'), '0');
  assert.equal(calculateCell(cells, 'Recon!B3'), '480');
});

test('sheet names are case-insensitive and cross-sheet cycles are detected', () => {
  const cells = { 'Recon!A1': '=supplier!A1+1', 'Supplier!A1': '=RECON!A1' };
  assert.equal(calculateCell(cells, 'Recon!A1'), '#CYCLE!');
});

test('a bare range outside a function and unknown names fail safely', () => {
  assert.equal(calculateCell({ A1: '=A1:A2' }, 'A1'), '#VALUE!');
  assert.equal(calculateCell({ A1: '=FOO+1' }, 'A1'), '#FORMULA!');
});

test('cross-sheet SUMIF with a cell criterion (typed criterion from another sheet)', () => {
  const cells = { ...ledger, Recon: '', 'Recon!B1': 'SYN-MISS', 'Recon!C1': '=SUMIF(Ledger!F2:F5,"SYN-MISS",Ledger!I2:I5)', 'Recon!C2': '=COUNTIF(Ledger!F2:F5,B1)' };
  assert.equal(calculateCell(cells, 'Recon!C1'), '0');
  assert.equal(calculateCell(cells, 'Recon!C2'), '1');
});
