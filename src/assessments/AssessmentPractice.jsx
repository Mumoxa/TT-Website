import React, { useState } from 'react';
import { PRACTICE_ITEMS, PRACTICE_SOURCE, practiceFeedback } from './practice.js';
import { calculateCell } from './formulas.js';
import './spreadsheet.css';

export function AssessmentPractice({ onContinue, onBack }) {
  const [responses, setResponses] = useState({});
  const [checked, setChecked] = useState({});
  function answer(id, value) {
    setResponses(old => ({ ...old, [id]: value }));
    setChecked(old => ({ ...old, [id]: true }));
  }
  const formula = responses['practice-tokens'] || '';
  return <main className="tta-shell tta-battery tta-practice">
    <div className="tta-section-header"><div className="tta-kicker">Before you start</div><h1>Try the question formats</h1>
      <p>Three practice items. These are not scored or saved. Your assessment timer has not started.</p></div>
    {PRACTICE_ITEMS.map((item, index) => {
      const chosen = responses[item.id];
      const feedback = checked[item.id] ? practiceFeedback(item.id, chosen) : null;
      return <section key={item.id} className="tta-battery-section">
        {item.type !== 'cell' ? <fieldset className="tta-question">
          <legend><span className="tta-qnum">{index + 1}</span> {item.prompt}</legend>
          {item.type === 'multi' && <p className="tta-sheet-help">Select all that apply.</p>}
          {item.options.map(option => {
            const selected = item.type === 'single' ? chosen === option.id : (chosen || []).includes(option.id);
            return <label key={option.id} className={'tta-choice' + (selected ? ' tta-choice-selected' : '')}>
              <input type={item.type === 'single' ? 'radio' : 'checkbox'} name={item.id} value={option.id} checked={selected}
                onChange={event => answer(item.id, item.type === 'single' ? option.id : event.target.checked ? [...(chosen || []), option.id] : (chosen || []).filter(id => id !== option.id))} />
              <span>{option.text}</span>
            </label>;
          })}
        </fieldset> : <div className="tta-question">
          <h2><span className="tta-qnum">{index + 1}</span> Practice workbook</h2><p>{item.prompt}</p>
          <div className="tta-sheet">
            <div className="tta-formula-bar"><label className="tta-cell-address" htmlFor="practice-formula">C5 <span aria-hidden="true">fx</span></label>
              <input id="practice-formula" aria-label="Formula for C5" placeholder="Enter a formula beginning with =" value={formula} maxLength={2000} onChange={event => answer(item.id, event.target.value)} autoComplete="off" spellCheck={false} /></div>
            <div className="tta-grid-scroll"><table className="tta-source-grid" aria-label="Practice museum token table"><thead><tr><th scope="col">Row</th>{['A', 'B', 'C'].map(col => <th scope="col" key={col}>{col}</th>)}</tr></thead>
              <tbody>{[1, 2, 3, 4, 5].map(row => <tr key={row}><th scope="row">{row}</th>{['A', 'B', 'C'].map(col => <td key={col}>{col === 'C' && row === 5 ? <output aria-label="Current value of C5">{calculateCell({ ...PRACTICE_SOURCE, C5: formula }, 'C5') || '—'}</output> : PRACTICE_SOURCE[col + row] || ''}</td>)}</tr>)}</tbody></table></div>
            <p className="tta-sheet-help">Edit C5 in the formula bar. The source cells stay fixed.</p>
          </div>
        </div>}
        <p role="status" aria-live="polite">{feedback ? <><strong>{feedback.correct ? 'Correct.' : 'Incorrect.'}</strong> Right answer: {feedback.answer}</> : 'Choose an answer or enter a formula to see feedback.'}</p>
      </section>;
    })}
    <div className="tta-run-actions">{onBack && <button type="button" className="tta-back" onClick={onBack}>Back</button>}
      <button type="button" className="tta-submit" onClick={onContinue}>Continue to your details <span aria-hidden="true">→</span></button></div>
  </main>;
}
