/* Multi-sheet workbook for battery-v2 assessments (candidate and recruiter replay).
   Sheets are tabs. A read-only sheet shows source records that cannot be edited. Writable sheets
   hold the candidate's working cells. Keys are sheet-qualified ('Reconciliation!B21') except on a
   single default sheet, where keys are plain ('B21'), matching the battery format.
   onChange receives only candidate cells on writable sheets, so the saved snapshot can never
   contain source data. The server enforces the same rule. */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './spreadsheet.css';
import { calculateCell, COLS, ROWS, QUALIFIED_REF, splitRef } from './formulas.js';
import { editCell, pasteKeys, workbookHistory } from './workbook.js';

const keyFor = (sheet, cell) => (sheet ? sheet + '!' + cell : cell);

// Numbers align right. Cell height is measured from the rendered text, so a cell shows its whole value.
const isNumeric = (text) => String(text ?? '').trim() !== '' && Number.isFinite(Number(text));

export function Workbook({ sheets = null, source = {}, cells = {}, onChange, readOnly = false, focusRequest = null }) {
  const tabs = sheets && sheets.length ? sheets : [{ name: '', writable: true }];
  const sourceKeys = useMemo(() => new Set(Object.keys(source)), [source]);
  const writableSheet = (name) => !readOnly && (tabs.find((t) => t.name === name)?.writable ?? false);
  const [active, setActive] = useState(() => (tabs.find((t) => t.writable) || tabs[0]).name);
  const [selected, setSelected] = useState(() => keyFor(active, 'A1'));
  const [editing, setEditing] = useState(null);
  const inputRefs = useRef({});
  const history = useRef({ past: [], present: null, future: [] });
  const [, renderHistory] = useState(0);
  // A focus request (from a question's "Go to cell" link) selects the cell, switches to its tab and focuses it.
  const pendingFocus = useRef(null);
  useEffect(() => {
    if (!focusRequest) return;
    const { sheet, cell } = splitRef(focusRequest.key);
    const target = tabs.find((t) => t.name === (sheet || ''));
    if (!target) return;
    pendingFocus.current = keyFor(target.name, cell);
    setActive(target.name);
    setSelected(pendingFocus.current);
    setEditing(null);
  }, [focusRequest?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  // After every render, each cell grows to fit its wrapped text. Measured, not estimated, so narrow columns are handled.
  useLayoutEffect(() => {
    for (const el of Object.values(inputRefs.current)) {
      if (el && el.tagName === 'TEXTAREA') { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
    }
  });
  useEffect(() => {
    const key = pendingFocus.current;
    const el = key && inputRefs.current[key];
    if (el) { pendingFocus.current = null; el.focus({ preventScroll: true }); // Side-by-side layout: the workbook is already on screen, so move as little as possible.
      // Stacked layout: bring the cell to the middle of the screen.
      const sideBySide = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1100px)').matches;
      el.scrollIntoView(sideBySide ? { block: 'nearest', inline: 'nearest' } : { block: 'center', inline: 'nearest' }); }
  });

  // Candidate cells only, without any source keys, so an edit can never write source data.
  const candidateOnly = (map) => Object.fromEntries(Object.entries(map).filter(([k]) => !sourceKeys.has(k)));
  const merged = useMemo(() => ({ ...candidateOnly(cells), ...source }), [cells, source, sourceKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const computed = useMemo(() => {
    const cache = new Map();
    const out = {};
    for (const t of tabs) for (const col of COLS) for (let i = 1; i <= ROWS; i++) {
      const key = keyFor(t.name, col + i);
      out[key] = calculateCell(merged, key, new Set(), cache);
    }
    return out;
  }, [merged]); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetOf = (key) => splitRef(key).sheet;
  const isEditable = (key) => writableSheet(sheetOf(key)) && !sourceKeys.has(key);

  function commit(next) {
    if (readOnly) return;
    history.current = workbookHistory({ ...history.current, present: merged }, { type: 'edit', cells: next });
    onChange?.(candidateOnly(next));
    renderHistory((n) => n + 1);
  }
  function travel(type) {
    if (readOnly) return;
    history.current = workbookHistory({ ...history.current, present: merged }, { type });
    onChange?.(candidateOnly(history.current.present));
    renderHistory((n) => n + 1);
  }
  function update(key, value) {
    if (!isEditable(key) || !QUALIFIED_REF.test(key)) return;
    commit(editCell(merged, key, value));
  }
  function move(key, dCol, dRow) {
    const { sheet, cell } = splitRef(key);
    const col = COLS.indexOf(cell[0]), row = Number(cell.slice(1)) - 1;
    const nc = Math.max(0, Math.min(COLS.length - 1, col + dCol));
    const nr = Math.max(0, Math.min(ROWS - 1, row + dRow));
    const dest = keyFor(sheet, COLS[nc] + (nr + 1));
    setSelected(dest);
    setEditing(null);
    requestAnimationFrame(() => inputRefs.current[dest]?.focus());
  }
  function paste(key, text) {
    if (!isEditable(key)) return false;
    if (!text.includes('\t') && !text.includes('\n')) return false;
    commit(pasteKeys(merged, key, text));
    return true;
  }

  const activeKey = selected;
  const activeSheet = sheetOf(activeKey) || active;
  const editable = writableSheet(active);
  const current = String(merged[activeKey] ?? '');

  return (
    <section className="tta-sheet" aria-label="Workbook" onKeyDown={(e) => {
      if (!readOnly && (e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
        e.preventDefault(); travel(e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo');
      }
    }}>
      <div className="tta-sheet-tabs" role="tablist" aria-label="Workbook sheets">
        {tabs.map((t) => (
          <button type="button" role="tab" key={t.name || 'default'} aria-selected={active === t.name}
            className={active === t.name ? 'tta-sheet-active' : ''}
            onClick={() => { setActive(t.name); setSelected(keyFor(t.name, 'A1')); setEditing(null); }}>
            {t.name || 'Worksheet'}{!t.writable && t.name ? <span className="tta-tab-lock"><span className="tta-sr-only"> (read-only)</span><span aria-hidden="true">read-only</span></span> : null}
          </button>
        ))}
      </div>
      {editable && <div className="tta-sheet-toolbar">
        <button type="button" disabled={!history.current.past.length} onClick={() => travel('undo')}>Undo</button>
        <button type="button" disabled={!history.current.future.length} onClick={() => travel('redo')}>Redo</button>
      </div>}
      <div className="tta-formula-bar">
        <output className="tta-cell-address" aria-label="Selected cell">{splitRef(activeKey).cell}</output>
        <span aria-hidden="true">fx</span>
        <input aria-label={'Formula or value for ' + splitRef(activeKey).cell} value={current}
          disabled={!isEditable(activeKey)} onChange={(e) => update(activeKey, e.target.value)}
          placeholder="Type a value or formula, e.g. =SUM(B2:B8) or =VLOOKUP(A2,Ledger!F2:I9,4,FALSE)" />
      </div>
      <p className="tta-scroll-hint">Swipe sideways to see more columns.</p>
      <div className="tta-grid-scroll">
        <table className={'tta-working-grid' + (editable ? '' : ' tta-grid-readonly')} aria-label={(activeSheet || 'Worksheet') + ' grid'}>
          <thead><tr><th aria-label="Row" />{COLS.map((col) => <th scope="col" key={col}>{col}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, row) => (
              <tr key={row}>
                <th scope="row">{row + 1}</th>
                {COLS.map((col) => {
                  const cell = col + (row + 1);
                  const key = keyFor(active, cell);
                  const locked = !isEditable(key);
                  return <td key={key} className={(selected === key ? 'tta-cell-selected ' : '') + (sourceKeys.has(key) ? 'tta-source-cell' : '')}>
                    <textarea ref={(el) => { inputRefs.current[key] = el; }}
                      rows={1}
                      className={'tta-cell-input' + (isNumeric(computed[key]) ? ' tta-cell-num' : '')}
                      aria-label={(active ? active + ' cell ' : 'Cell ') + cell}
                      value={editing === key ? String(merged[key] ?? '') : String(computed[key] ?? '')}
                      disabled={locked}
                      onFocus={() => { setSelected(key); setEditing(key); }}
                      onChange={(e) => update(key, e.target.value)}
                      onBlur={() => setEditing((prev) => (prev === key ? null : prev))}
                      onPaste={(e) => { if (paste(key, e.clipboardData?.getData('text/plain') ?? '')) e.preventDefault(); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); move(key, 0, 1); }
                        else if (e.key === 'Tab') { e.preventDefault(); move(key, e.shiftKey ? -1 : 1, 0); }
                        else if (e.key === 'ArrowUp' && e.currentTarget.selectionStart === 0) { e.preventDefault(); move(key, 0, -1); }
                        else if (e.key === 'ArrowDown' && e.currentTarget.selectionStart === 0) { e.preventDefault(); move(key, 0, 1); }
                      }}
                    ></textarea>
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tta-sheet-help">
        {tabs.some((t) => !t.writable) ? 'Grey cells are source records and cannot be edited. ' : ''}
        Formulas: SUM, ROUND, SUMIF, COUNTIF, IF, IFERROR, VLOOKUP, INDEX, MATCH and more. Refer to another tab as Ledger!A1.
      </p>
    </section>
  );
}
