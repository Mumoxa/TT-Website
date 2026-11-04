/* Candidate-facing battery body (format 'battery-v2'): sections of items plus a shared
   workbook. Shares the parent's draft, autosave and submit (CandidateAssessment.jsx).
   Cell items are answered in the workbook; the live value shown here is for feedback only.
   The server re-evaluates every formula, so the displayed value is not trusted for grading. */
import React, { useMemo } from 'react';
import { Workbook } from './Workbook.jsx';
import { calculateCell } from './formulas.js';

const fmt = (value) => (value === '' || value === undefined ? '—' : value);

export function BatteryPanels({ assessment, draft, patchDraft }) {
  const source = assessment.workbook?.source || {};
  const merged = useMemo(() => ({ ...source, ...(draft.workbook || {}) }), [source, draft.workbook]);
  const singles = draft.mcq || {};
  const texts = draft.structured?.text || {};
  const multis = draft.structured?.multi || {};

  return (
    <div className="tta-battery">
      {assessment.instructions && <p className="tta-scenario-instructions">{assessment.instructions}</p>}
      {assessment.sections.map((section, sIndex) => (
        <section key={section.id} className="tta-battery-section" aria-labelledby={'sec-' + section.id}>
          <h2 id={'sec-' + section.id}>{section.title}</h2>
          {section.items.map((item, iIndex) => {
            const number = `${sIndex + 1}.${iIndex + 1}`;
            if (item.type === 'single') {
              return (
                <fieldset key={item.id} className="tta-question">
                  <legend><span className="tta-qnum">{number}</span> {item.prompt}</legend>
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
                  <legend><span className="tta-qnum">{number}</span> {item.prompt}</legend>
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
                  <label htmlFor={'t-' + item.id}><span className="tta-qnum">{number}</span> {item.prompt}</label>
                  <input id={'t-' + item.id} type="text" maxLength={200} value={texts[item.id] || ''}
                    onChange={(e) => patchDraft((old) => ({ ...old, structured: { ...old.structured, text: { ...(old.structured?.text || {}), [item.id]: e.target.value } } }))} />
                </div>
              );
            }
            // cell: the answer lives in the workbook; show the live value for feedback only.
            return (
              <div key={item.id} className="tta-question tta-cell-item">
                <p><span className="tta-qnum">{number}</span> {item.prompt}</p>
                <p className="tta-sheet-help">Answer cell <strong>{item.ref}</strong>. Current value: <output aria-label={'Current value of ' + item.ref}>{fmt(calculateCell(merged, item.ref))}</output></p>
              </div>
            );
          })}
        </section>
      ))}
      <section className="tta-battery-section" aria-label="Shared workbook">
        <h2>Workbook</h2>
        <Workbook sheets={assessment.workbook?.sheets || null} source={source} cells={draft.workbook || {}}
          onChange={(workbook) => patchDraft((old) => ({ ...old, workbook }))} />
      </section>
    </div>
  );
}
