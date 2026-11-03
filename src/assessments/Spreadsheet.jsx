import React, { useMemo, useRef, useState } from 'react';
import './spreadsheet.css';

/**
 * Browser spreadsheet MVP: an editable 6 x 20 worksheet with a formula bar,
 * cell references, arithmetic, SUM/ABS/MIN/MAX, clipboard paste, and arrow/Tab
 * navigation. Source sheets are view-only. No eval() or remote spreadsheet API.
 * This is an Excel-LIKE working area, not the Microsoft Excel application.
 *
 * The submitted snapshot includes only the working cells. The backend rebuilds
 * all read-only scenario tables from the private assessment version.
 */
const COLS = ['A', 'B', 'C', 'D', 'E', 'F'];
const ROWS = 20;
const CELL_REF = /^[A-F](?:[1-9]|1[0-9]|20)$/;
const pretty = (number) => Number.isFinite(number) ? String(Math.round(number * 100000) / 100000) : '#NUM!';

function tokenize(expression) {
  const tokens = [];
  const source = expression.replace(/\s+/g, '');
  const scanner = /\d+(?:\.\d+)?|[A-F](?:20|1[0-9]|[1-9])|[a-z]+|[()+\-*/,:]/giy;
  let offset = 0, match;
  while (offset < source.length) {
    scanner.lastIndex = offset;
    match = scanner.exec(source);
    if (!match || match.index !== offset) throw new Error('#FORMULA!');
    tokens.push(match[0].toUpperCase());
    offset = scanner.lastIndex;
    if (tokens.length > 250) throw new Error('#FORMULA!');
  }
  return tokens;
}

function cellNumber(value) {
  const v = String(value ?? '').trim();
  if (!v) return 0;
  const n = Number(v.replace(/,/g, ''));
  if (!Number.isFinite(n)) throw new Error('#VALUE!');
  return n;
}

function rangeValues(from, to, resolve) {
  if (!CELL_REF.test(from) || !CELL_REF.test(to)) throw new Error('#REF!');
  const c1 = COLS.indexOf(from[0]), c2 = COLS.indexOf(to[0]);
  const r1 = Number(from.slice(1)), r2 = Number(to.slice(1));
  const values = [];
  for (let row = Math.min(r1, r2); row <= Math.max(r1, r2); row++) {
    for (let col = Math.min(c1, c2); col <= Math.max(c1, c2); col++) {
      values.push(cellNumber(resolve(COLS[col] + row)));
    }
  }
  return values;
}

function evaluate(formula, resolve) {
  const tokens = tokenize(formula.startsWith('=') ? formula.slice(1) : formula);
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const expect = (item) => { if (next() !== item) throw new Error('#FORMULA!'); };
  function expression() {
    let n = term();
    while (peek() === '+' || peek() === '-') {
      n += next() === '+' ? term() : -term();
    }
    return n;
  }
  function term() {
    let n = factor();
    while (peek() === '*' || peek() === '/') {
      const op = next(), d = factor();
      if (op === '/' && d === 0) throw new Error('#DIV/0!');
      n = op === '*' ? n * d : n / d;
    }
    return n;
  }
  function factor() {
    const t = next();
    if (!t) throw new Error('#FORMULA!');
    if (t === '-') return -factor();
    if (t === '+') return factor();
    if (t === '(') { const n = expression(); expect(')'); return n; }
    if (/^\d/.test(t)) return Number(t);
    if (CELL_REF.test(t)) return cellNumber(resolve(t));
    if (['SUM', 'ABS', 'MIN', 'MAX'].includes(t)) {
      expect('(');
      const args = [];
      if (peek() !== ')') {
        do {
          // A1:B3 is allowed as an argument only, never as a scalar value.
          if (CELL_REF.test(peek()) && tokens[p + 1] === ':') {
            const start = next(); next();
            const end = next();
            args.push(...rangeValues(start, end, resolve));
          } else args.push(expression());
          if (peek() !== ',') break;
          next();
        } while (args.length <= 120);
      }
      expect(')');
      if (t === 'ABS') return Math.abs(args[0] || 0);
      if (t === 'MIN') return args.length ? Math.min(...args) : 0;
      if (t === 'MAX') return args.length ? Math.max(...args) : 0;
      return args.reduce((sum, n) => sum + n, 0);
    }
    throw new Error('#FORMULA!');
  }
  const result = expression();
  if (p !== tokens.length) throw new Error('#FORMULA!');
  return pretty(result);
}

export function calculateCell(cells, ref, stack = new Set()) {
  if (!CELL_REF.test(ref)) return '#REF!';
  if (stack.has(ref)) return '#CYCLE!';
  const raw = cells[ref] ?? '';
  if (!String(raw).trim().startsWith('=')) return String(raw);
  const nextStack = new Set(stack);
  nextStack.add(ref);
  try {
    return evaluate(String(raw), (referenced) => {
      const result = calculateCell(cells, referenced, nextStack);
      if (result.startsWith('#')) throw new Error(result);
      return result;
    });
  } catch (error) {
    const msg = String(error?.message || '');
    return msg.startsWith('#') ? msg : '#FORMULA!';
  }
}

const emptyGrid = () => ({});
export function ReconciliationSpreadsheet({ scenario, cells = emptyGrid(), onChange, readOnly = false }) {
  const [tab, setTab] = useState('work');
  const [selected, setSelected] = useState('A1');
  const [editing, setEditing] = useState(null);
  const inputRefs = useRef({});
  const computed = useMemo(() => {
    const out = {};
    for (const col of COLS) for (let i = 1; i <= ROWS; i++) {
      const ref = col + i;
      out[ref] = calculateCell(cells, ref);
    }
    return out;
  }, [cells]);

  function update(ref, value) {
    if (readOnly || !CELL_REF.test(ref)) return;
    const updated = { ...cells };
    if (value === '') delete updated[ref]; else updated[ref] = value.slice(0, 200);
    onChange?.(updated);
  }

  function navigate(ref, key) {
    const col = COLS.indexOf(ref[0]), row = Number(ref.slice(1)) - 1;
    const delta = key === 'ArrowRight' || key === 'Tab' ? [1, 0] :
      key === 'ArrowLeft' ? [-1, 0] : key === 'ArrowUp' ? [0, -1] : [0, 1];
    const newCol = Math.max(0, Math.min(COLS.length - 1, col + delta[0]));
    const newRow = Math.max(0, Math.min(ROWS - 1, row + delta[1]));
    const destination = COLS[newCol] + (newRow + 1);
    setSelected(destination);
    setEditing(null);
    requestAnimationFrame(() => inputRefs.current[destination]?.focus());
  }

  function pasteRange(ref, value) {
    const rows = value.replace(/\r/g, '').split('\n').filter((r, i, a) => i < a.length - 1 || r);
    if (rows.length <= 1 && !value.includes('\t')) return false;
    const startRow = Number(ref.slice(1)) - 1;
    const startCol = COLS.indexOf(ref[0]);
    const updated = { ...cells };
    rows.forEach((line, rowIndex) => {
      line.split('\t').forEach((item, colIndex) => {
        const r = startRow + rowIndex, c = startCol + colIndex;
        if (r >= ROWS || c >= COLS) return;
        const target = COLS[c] + (r + 1);
        const clean = item.slice(0, 200);
        if (clean) updated[target] = clean; else delete updated[target];
      });
    });
    onChange?.(updated);
    return true;
  }

  const current = String(cells[selected] ?? '');
  return (
    <section className="tta-sheet" aria-label="Live reconciliation spreadsheet">
      <div className="tta-sheet-tabs" role="tablist" aria-label="Workbook worksheets">
        {[
          ['supplier', 'Supplier statement'],
          ['ledger', 'Company ledger'],
          ['work', 'Your working'],
        ].map(([key, label]) => (
          <button type="button" role="tab" key={key} aria-selected={tab === key}
            className={tab === key ? 'tta-sheet-active' : ''} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === 'work' ? (
        <>
          <div className="tta-formula-bar">
            <output className="tta-cell-address" aria-label="Selected cell">{selected}</output>
            <span aria-hidden="true">fx</span>
            <input aria-label={'Formula or value for ' + selected} value={current} disabled={readOnly}
              onChange={(e) => update(selected, e.target.value)} placeholder="Type a value or formula, e.g. =SUM(B2:B8)" />
          </div>
          <div className="tta-grid-scroll">
            <table className="tta-working-grid" aria-label="Editable reconciliation worksheet">
              <thead><tr><th aria-label="Row" />{COLS.map((col) => <th scope="col" key={col}>{col}</th>)}</tr></thead>
              <tbody>
                {Array.from({ length: ROWS }, (_, row) => (
                  <tr key={row}>
                    <th scope="row">{row + 1}</th>
                    {COLS.map((col) => {
                      const ref = col + (row + 1);
                      return <td key={ref} className={selected === ref ? 'tta-cell-selected' : ''}>
                        <input ref={(el) => { inputRefs.current[ref] = el; }}
                          aria-label={'Cell ' + ref}
                          value={editing === ref ? String(cells[ref] ?? '') : computed[ref]}
                          disabled={readOnly}
                          onFocus={() => { setSelected(ref); setEditing(ref); }}
                          onChange={(e) => update(ref, e.target.value)}
                          onBlur={() => setEditing((prev) => prev === ref ? null : prev)}
                          onPaste={(e) => {
                            if (readOnly) return;
                            const text = e.clipboardData.getData('text/plain');
                            if (pasteRange(ref, text)) e.preventDefault();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault(); navigate(ref, e.key);
                            } else if (['ArrowUp', 'ArrowDown'].includes(e.key) && e.currentTarget.selectionStart === 0) {
                              e.preventDefault(); navigate(ref, e.key);
                            }
                          }}
                        />
                      </td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tta-sheet-help">Live formulas: =A1+B1, =SUM(A1:A8), =ABS(A1-B1), =MIN(A1:B2). You can paste rows or columns from Excel. Your working cells are saved automatically.</p>
        </>
      ) : (
        <div className="tta-grid-scroll">
          <table className="tta-source-grid">
            <thead><tr><th>Reference</th><th>Description</th><th>Amount (R)</th></tr></thead>
            <tbody>
              {(tab === 'supplier' ? scenario?.supplier : scenario?.ledger)?.map((item, index) => (
                <tr key={item.ref + '-' + index}>
                  <td>{item.ref}</td><td>{item.description || 'Supplier transaction'}</td>
                  <td>{Number(item.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th colSpan={2}>Closing balance</th>
              <td>{(tab === 'supplier' ? scenario?.supplier : scenario?.ledger)?.reduce((sum, i) => sum + Number(i.amount), 0)
                .toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr></tfoot>
          </table>
          <p className="tta-sheet-help">Source records are read-only. Use the Your working tab to calculate and investigate differences.</p>
        </div>
      )}
    </section>
  );
}
