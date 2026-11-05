/* Source records shown as plain read-only documents (battery display 'documents').
   Each document is a rectangular range of read-only source cells. The first row of the range is the
   header. Columns whose header ends in "(R)" are shown as rand amounts with two decimals. */
import React from 'react';
import { COLS } from './formulas.js';

const RANGE = /^([A-Za-z][A-Za-z0-9_]{0,15})!([A-J])(\d{1,2}):([A-J])(\d{1,2})$/;

export function documentTable(source, range) {
  const m = RANGE.exec(range || '');
  if (!m) return null;
  const [, sheet, c1, r1, c2, r2] = m;
  const cols = COLS.slice(COLS.indexOf(c1), COLS.indexOf(c2) + 1);
  const rows = [];
  for (let r = Number(r1); r <= Number(r2); r += 1) rows.push(cols.map((c) => String(source[`${sheet}!${c}${r}`] ?? '')));
  const [header = [], ...body] = rows;
  return { header, body: body.filter((row) => row.some((v) => v.trim() !== '')) };
}

const isAmountColumn = (title) => /\(R\)\s*$/.test(title);
const formatAmount = (value) => {
  const n = Number(value);
  if (value.trim() === '' || !Number.isFinite(n)) return value;
  const text = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? '−' + text : text;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatCell = (value) => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return d ? `${Number(d[3])} ${MONTHS[Number(d[2]) - 1]} ${d[1]}` : value;
};
const isWrapColumn = (title) => /description/i.test(title);

export function Documents({ source = {}, documents = [] }) {
  return (
    <div className="tta-docs">
      {documents.map((doc) => {
        const table = documentTable(source, doc.range);
        if (!table) return null;
        const amount = table.header.map(isAmountColumn);
        const wrap = table.header.map(isWrapColumn);
        const cls = (i) => (amount[i] ? 'is-amount' : wrap[i] ? 'is-wrap' : undefined);
        return (
          <section key={doc.range} className="tta-doc" aria-label={doc.title}>
            <h3>{doc.title}</h3>
            <div className="tta-doc-scroll">
              <table>
                <thead><tr>{table.header.map((h, i) => <th key={i} scope="col" className={cls(i)}>{h}</th>)}</tr></thead>
                <tbody>
                  {table.body.map((row, r) => (
                    <tr key={r}>{row.map((v, i) => <td key={i} className={cls(i)}>{amount[i] ? formatAmount(v) : formatCell(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
