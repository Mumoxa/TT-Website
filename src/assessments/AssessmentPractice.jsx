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
        </fieldset> : <div className="tta-question tta-cell-item">
          <label htmlFor="practice-amount"><span className="tta-qnum">{index + 1}</span> {item.prompt}</label>
          <div className="tta-doc"><h3>Museum token desk</h3><div className="tta-doc-scroll"><table aria-label="Practice museum token table">
            <thead><tr><th scope="col">Batch</th><th scope="col" className="is-amount">Tokens issued</th></tr></thead>
            <tbody>{[2, 3].map(row => <tr key={row}><td>{PRACTICE_SOURCE['A' + row]}</td><td className="is-amount">{PRACTICE_SOURCE['C' + row]}</td></tr>)}</tbody>
          </table></div></div>
          <div className="tta-answer-row"><span className="tta-answer-prefix" aria-hidden="true">Answer</span>
            <input id="practice-amount" className="tta-answer-input" inputMode="decimal" placeholder="For example 12 500.00" value={formula} maxLength={200}
              onChange={event => answer(item.id, event.target.value)} autoComplete="off" spellCheck={false} /></div>
        </div>}
        <p role="status" aria-live="polite">{feedback ? <><strong>{feedback.correct ? 'Correct.' : 'Incorrect.'}</strong> Right answer: {feedback.answer}</> : 'Choose or type an answer to see feedback.'}</p>
      </section>;
    })}
    <div className="tta-run-actions">{onBack && <button type="button" className="tta-back" onClick={onBack}>Back</button>}
      <button type="button" className="tta-submit" onClick={onContinue}>Continue to your details <span aria-hidden="true">→</span></button></div>
  </main>;
}
