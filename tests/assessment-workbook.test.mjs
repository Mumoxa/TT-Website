import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editCell,pasteCells,scenarioWorkingCells,workbookHistory} from '../src/assessments/workbook.js';
test('cleared prefilled cells stay empty on recovery',()=>{
 const base=scenarioWorkingCells({supplier:[{ref:'S1',amount:12}],ledger:[]});
 const saved=editCell(base,'B2','');assert.equal({...base,...saved}.B2,'');
});
test('tabular paste clips at F20 and preserves explicit empty cells',()=>{
 const result=pasteCells({A1:'keep',F20:'old'},'F20','1\t2\n3\t4');
 assert.deepEqual(result,{A1:'keep',F20:'1'});
 assert.equal(pasteCells({B2:'old'},'B2','\t2').B2,'');
});
test('undo restores the preceding workbook and redo restores the edit',()=>{
 let h={past:[],present:{A1:'first'},future:[]};
 h=workbookHistory(h,{type:'edit',cells:{A1:'second'}});
 h=workbookHistory(h,{type:'undo'});assert.equal(h.present.A1,'first');
 h=workbookHistory(h,{type:'redo'});assert.equal(h.present.A1,'second');
 h=workbookHistory(h,{type:'undo'});h=workbookHistory(h,{type:'edit',cells:{A1:'third'}});assert.equal(h.future.length,0);
});
test('a trailing clipboard newline does not erase the following row',()=>{
 assert.deepEqual(pasteCells({B3:'keep'},'B2','1\n'),{B2:'1',B3:'keep'});
});
