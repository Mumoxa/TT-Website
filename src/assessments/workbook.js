import {COLS,ROWS,CELL_REF,QUALIFIED_REF,splitRef} from './formulas.js';
export function scenarioWorkingCells(scenario) {
  const base = { A1: 'Supplier reference', B1: 'Statement amount', D1: 'Ledger reference', E1: 'Ledger amount' };
  (scenario?.supplier || []).slice(0, 19).forEach((row, i) => {
    base['A' + (i + 2)] = row.ref;
    base['B' + (i + 2)] = String(row.amount);
  });
  (scenario?.ledger || []).slice(0, 19).forEach((row, i) => {
    base['D' + (i + 2)] = row.ref;
    base['E' + (i + 2)] = String(row.amount);
  });
  return base;
}

export function editCell(cells,ref,value) {
  if (!QUALIFIED_REF.test(ref)) return cells;
  return {...cells,[ref]:String(value).slice(0,200)};
}
// Paste onto a qualified or unqualified anchor cell. Clipped at the grid's bottom-right corner.
export function pasteKeys(cells,ref,value) {
  const {sheet,cell}=splitRef(ref);
  const prefix=sheet?sheet+'!':'';
  const updated={...cells};
  const startRow=Number(cell.slice(1))-1,startCol=COLS.indexOf(cell[0]);
  value.replace(/\r/g,'').replace(/\n$/,'').split('\n').slice(0,ROWS-startRow).forEach((line,r)=>{
    line.split('\t').slice(0,COLS.length-startCol).forEach((item,c)=>{
      updated[prefix+COLS[startCol+c]+(startRow+r+1)]=item.slice(0,200);
    });
  });
  return updated;
}
export function pasteCells(cells,ref,value) {
  const updated={...cells};
  const startRow=Number(ref.slice(1))-1,startCol=COLS.indexOf(ref[0]);
  value.replace(/\r/g,'').replace(/\n$/,'').split('\n').slice(0,ROWS-startRow).forEach((line,r)=>{
    line.split('\t').slice(0,COLS.length-startCol).forEach((item,c)=>{
      updated[COLS[startCol+c]+(startRow+r+1)]=item.slice(0,200);
    });
  });
  return updated;
}
export function workbookHistory(state,action) {
  if(action.type==='undo') {
    if(!state.past.length)return state;
    return {past:state.past.slice(0,-1),present:state.past.at(-1),future:[state.present,...state.future]};
  }
  if(action.type==='redo') {
    if(!state.future.length)return state;
    return {past:[...state.past,state.present],present:state.future[0],future:state.future.slice(1)};
  }
  return {past:[...state.past.slice(-99),state.present],present:action.cells,future:[]};
}
