/* Candidate-facing battery body (format 'battery-v2'): sections of items plus a shared
   workbook. Shares the parent's draft, autosave and submit (CandidateAssessment.jsx).
   Cell items are answered in the workbook. Each cell item links to its cell, and the live value
   shown here is for feedback only: the server re-evaluates every formula, so it is not trusted for grading. */
import React, { useMemo, useState } from 'react';
import { Workbook } from './Workbook.jsx';
import { calculateCell } from './formulas.js';
import { splitReferences } from './reference-text.js';

const fmt = (value) => (value === '' || value === undefined ? '—' : value);
// Reference codes (INV-2214 and similar) stay on one line; all other text renders as before.
const keepReferences = (text) => splitReferences(text).map((part, i) => (part.isRef
  ? <span key={i} className="tta-ref">{part.text}</span>
  : <React.Fragment key={i}>{part.text}</React.Fragment>));
const instructionsFor = (item) => (item.instructions ? <p className="tta-item-instructions">{keepReferences(item.instructions)}</p> : null);

export function BatteryPanels({ assessment, draft, patchDraft }) {
  const source = assessment.workbook?.source || {};
  const merged = useMemo(() => ({ ...source, ...(draft.workbook || {}) }), [source, draft.workbook]);
  const singles = draft.mcq || {};
  const texts = draft.structured?.text || {};
  const multis = draft.structured?.multi || {};
  const [focusRequest, setFocusRequest] = useState(null);
  const jumpToWorkbook = () => document.getElementById('tta-workbook')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="tta-battery">
      {assessment.instructions && <p className="tta-scenario-instructions">{assessment.instructions}</p>}
      <div className="tta-battery-jump">
        <button type="button" className="tta-jump" onClick={jumpToWorkbook}>Go to the workbook</button>
      </div>
      {assessment.sections.map((section, sIndex) => (
        <section key={section.id} className="tta-battery-section" aria-labelledby={'sec-' + section.id}>
          <h2 id={'sec-' + section.id}>{section.title}</h2>
          {section.items.map((item, iIndex) => {
            const number = `${sIndex + 1}.${iIndex + 1}`;
            if (item.type === 'single') {
              return (
                <fieldset key={item.id} className="tta-question">
                  <legend><span className="tta-qnum">{number}</span> {keepReferences(item.prompt)}</legend>
                  {instructionsFor(item)}
                  {item.options.map((option) => (
                    <label className={'tta-choice' + (singles[item.id] === option.id ? ' tta-choice-selected' : '')} key={option.id}>
                      <input type="radio" name={item.id} value={option.id} checked={singles[item.id] === option.id}
                        onChange={() => patchDraft((old) => ({ ...old, mcq: { ...old.mcq, [item.id]: option.id } }))} />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </fieldset>
              );
            }
            if (item.type === 'multi') {
              const chosen = multis[item.id] || [];
              return (
                <fieldset key={item.id} className="tta-question">
                  <legend><span className="tta-qnum">{number}</span> {keepReferences(item.prompt)}</legend>
                  {instructionsFor(item)}
                  <p className="tta-sheet-help">Select all that apply.</p>
                  {item.options.map((option) => (
                    <label className={'tta-choice' + (chosen.includes(option.id) ? ' tta-choice-selected' : '')} key={option.id}>
                      <input type="checkbox" checked={chosen.includes(option.id)}
                        onChange={(e) => patchDraft((old) => {
                          const current = old.structured?.multi?.[item.id] || [];
                          const next = e.target.checked ? [...current, option.id] : current.filter((o) => o !== option.id);
                          return { ...old, structured: { ...old.structured, multi: { ...(old.structured?.multi || {}), [item.id]: next } } };
                        })} />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </fieldset>
              );
            }
            if (item.type === 'text') {
              return (
                <div key={item.id} className="tta-question">
                  <label htmlFor={'t-' + item.id}><span className="tta-qnum">{number}</span> {keepReferences(item.prompt)}</label>
                  {instructionsFor(item)}
                  <input id={'t-' + item.id} type="text" maxLength={200} value={texts[item.id] || ''}
                    onChange={(e) => patchDraft((old) => ({ ...old, structured: { ...old.structured, text: { ...(old.structured?.text || {}), [item.id]: e.target.value } } }))} />
                </div>
              );
            }
            // cell: the answer lives in the workbook. The link takes the candidate straight to that cell.
            return (
              <div key={item.id} className="tta-question tta-cell-item">
                <p><span className="tta-qnum">{number}</span> {keepReferences(item.prompt)}</p>
                {instructionsFor(item)}
                <div className="tta-cell-ask">
                  <p className="tta-sheet-help">Answer in cell <strong>{item.ref}</strong>. Current value: <output aria-label={'Current value of ' + item.ref}>{fmt(calculateCell(merged, item.ref))}</output></p>
                  <button type="button" className="tta-cell-link" onClick={() => setFocusRequest({ key: item.ref, nonce: Date.now() + Math.random() })}>Go to cell {item.ref}</button>
                </div>
              </div>
            );
          })}
        </section>
      ))}
      <section className="tta-battery-section" id="tta-workbook" aria-label="Shared workbook">
        <h2>Workbook</h2>
        <Workbook sheets={assessment.workbook?.sheets || null} source={source} cells={draft.workbook || {}}
          focusRequest={focusRequest}
          onChange={(workbook) => patchDraft((old) => ({ ...old, workbook }))} />
      </section>
    </div>
  );
}
