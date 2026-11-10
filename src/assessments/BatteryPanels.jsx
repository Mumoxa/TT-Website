/* Candidate-facing battery body (format 'battery-v2'): sections of items plus a shared
   workbook. Shares the parent's draft, autosave and submit (CandidateAssessment.jsx).
   A cell item is answered in the box under its task. The box writes to the item's workbook cell, so the
   workbook and the box always show the same entry, and grading (which reads the cell) is unchanged.
   The result shown here is for feedback only: the server re-evaluates every formula. */
import React, { useMemo, useState } from 'react';
import { Workbook } from './Workbook.jsx';
import { Documents } from './Documents.jsx';
import { calculateCell } from './formulas.js';
import { splitReferences } from './reference-text.js';
import { splitRef } from './formulas.js';
import { parseAmount } from '../../functions/lib/battery.js';
import { InstructionText } from './InstructionText.jsx';

const fmt = (value) => (value === '' || value === undefined ? '—' : value);
// Shows how a typed answer will be read for marking, so a formatting mix-up is visible straight away.
const readBack = (item, raw) => {
  if (!raw.trim() || (item.format !== 'rand' && item.format !== 'count')) return null;
  const n = parseAmount(raw);
  if (n === null) return { ok: false, text: item.format === 'rand' ? "This doesn't look like an amount. Use digits, for example R26 050.00." : "This doesn't look like a number. Use digits, for example 4." };
  if (item.format === 'count') return { ok: true, text: 'Read as ' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }) };
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { ok: true, text: 'Read as ' + (n < 0 ? '\u2212R' : 'R') + abs };
};
// Example shown in an empty answer box. Rand answers show an R; counts show a whole number, not an amount.
const placeholderFor = (item, docsMode) => (item.format === 'rand' ? 'For example R12 500.00'
  : item.format === 'count' ? 'A whole number, for example 4'
  : docsMode ? 'Type your answer' : 'Type your answer or a formula');
const isNumericText = (value) => String(value ?? '').trim() !== '' && Number.isFinite(Number(value));
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
  // 'documents': source records are plain tables and answers are typed in the boxes only (no grid).
  const docsMode = assessment.workbook?.display === 'documents';
  const documents = assessment.workbook?.documents || [];
  // On narrow screens, documents appear just before the first section that needs them.
  const firstPracticalSection = assessment.sections.findIndex((section) => section.items.some((item) => item.type === 'cell'));
  // On narrow screens the workbook sits below the questions. After a jump, offer a way straight back.
  const [returnTo, setReturnTo] = useState(null);
  const jumpToWorkbook = () => document.getElementById('tta-workbook')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Answer cells are tagged in the workbook with their task number, e.g. "5.1".
  const answerCells = useMemo(() => {
    const out = {};
    assessment.sections.forEach((section, s) => section.items.forEach((item, i) => { if (item.type === 'cell') out[item.ref] = `${s + 1}.${i + 1}`; }));
    return out;
  }, [assessment]);
  const setCell = (ref, value) => patchDraft((old) => {
    const next = { ...(old.workbook || {}) };
    if (value === '') delete next[ref]; else next[ref] = value;
    return { ...old, workbook: next };
  });
  const goToCell = (item, number) => { setReturnTo({ id: item.id, number }); setFocusRequest({ key: item.ref, nonce: Date.now() + Math.random() }); };
  const backToQuestion = () => {
    const el = returnTo && document.getElementById('q-' + returnTo.id);
    setReturnTo(null);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.querySelector('button, input')?.focus({ preventScroll: true }); }
  };

  return (
    <div className="tta-battery">
      <div className="tta-battery-questions">
      {assessment.instructions && <div className="tta-scenario-instructions"><InstructionText text={assessment.instructions} /></div>}
      {!docsMode && <div className="tta-battery-jump">
        <button type="button" className="tta-jump" onClick={jumpToWorkbook}>Go to the workbook</button>
      </div>}
      {assessment.sections.map((section, sIndex) => (
        <React.Fragment key={section.id}>
        {docsMode && sIndex === firstPracticalSection && (
          <section className="tta-battery-section tta-docs-inline" aria-label="Documents">
            <h2>Documents</h2>
            <Documents source={source} documents={documents} />
          </section>
        )}
        <section className="tta-battery-section" aria-labelledby={'sec-' + section.id}>
          <h2 id={'sec-' + section.id}>{section.title}</h2>
          {section.items.map((item, iIndex) => {
            const number = `${sIndex + 1}.${iIndex + 1}`;
            if (item.type === 'single') {
              return (
                <fieldset key={item.id} id={'q-' + item.id} className="tta-question">
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
                <fieldset key={item.id} id={'q-' + item.id} className="tta-question">
                  <legend><span className="tta-qnum">{number}</span> {keepReferences(item.prompt)}</legend>
                  {instructionsFor(item)}
                  {!/select all that apply/i.test(item.prompt) && <p className="tta-sheet-help">Select all that apply.</p>}
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
            if (item.type === 'match') {
              const chosen = draft.structured?.match?.[item.id] || {};
              const done = item.lines.filter((l) => chosen[l.id]).length;
              const setLine = (lineId, choiceId) => patchDraft((old) => {
                const all = { ...(old.structured?.match || {}) };
                const mine = { ...(all[item.id] || {}) };
                if (choiceId) mine[lineId] = choiceId; else delete mine[lineId];
                all[item.id] = mine;
                return { ...old, structured: { ...old.structured, match: all } };
              });
              let lastDoc = '';
              return (
                <fieldset key={item.id} id={'q-' + item.id} className="tta-question tta-match">
                  <legend><span className="tta-qnum">{number}</span> {keepReferences(item.prompt)}</legend>
                  {instructionsFor(item)}
                  <p className="tta-match-progress" aria-live="polite">{done} of {item.lines.length} lines classified</p>
                  <div className="tta-match-table" role="table" aria-label={'Lines to classify for question ' + number}>
                    {item.lines.map((line) => {
                      const head = line.doc !== lastDoc; lastDoc = line.doc;
                      const selectId = `m-${item.id}-${line.id}`;
                      return (
                        <React.Fragment key={line.id}>
                          {head && <div className="tta-match-doc" role="row"><span role="columnheader">{line.doc}</span></div>}
                          <div className={'tta-match-row' + (chosen[line.id] ? ' is-done' : '')} role="row">
                            <label htmlFor={selectId} className="tta-match-line" role="cell">
                              <span className="tta-ref">{line.ref}</span>
                              <span className="tta-match-detail">{line.detail}</span>
                              {line.amount && <span className="tta-match-amount">{line.amount}</span>}
                            </label>
                            <span role="cell">
                              <select id={selectId} value={chosen[line.id] || ''} onChange={(e) => setLine(line.id, e.target.value)}
                                aria-label={`${line.doc} line ${line.ref}: how does it compare?`}>
                                <option value="">Choose…</option>
                                {item.choices.map((c) => <option key={c.id} value={c.id}>{c.text}</option>)}
                              </select>
                            </span>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </fieldset>
              );
            }
            if (item.type === 'text') {
              return (
                <div key={item.id} id={'q-' + item.id} className="tta-question">
                  <label htmlFor={'t-' + item.id}><span className="tta-qnum">{number}</span> {keepReferences(item.prompt)}</label>
                  {instructionsFor(item)}
                  <input id={'t-' + item.id} type="text" maxLength={200} value={texts[item.id] || ''}
                    onChange={(e) => patchDraft((old) => ({ ...old, structured: { ...old.structured, text: { ...(old.structured?.text || {}), [item.id]: e.target.value } } }))} />
                </div>
              );
            }
            // cell: answered in the box below the task, which writes to the item's workbook cell.
            const raw = String(draft.workbook?.[item.ref] ?? '');
            const value = calculateCell(merged, item.ref);
            const shown = fmt(isNumericText(value) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 }) : value);
            const isFormula = raw.trim().startsWith('=');
            const cellName = splitRef(item.ref).cell;
            return (
              <div key={item.id} id={'q-' + item.id} className="tta-question tta-cell-item">
                <label htmlFor={'cell-' + item.id}><span className="tta-qnum">{number}</span> {keepReferences(item.prompt)}</label>
                {instructionsFor(item)}
                <div className="tta-answer-row">
                  {docsMode && <span className="tta-answer-prefix" aria-hidden="true">Answer</span>}
                  <input id={'cell-' + item.id} className="tta-answer-input" type="text" inputMode={item.format === 'count' ? 'numeric' : docsMode ? 'decimal' : 'text'} autoComplete="off" spellCheck={false}
                    maxLength={200} value={raw} placeholder={placeholderFor(item, docsMode)}
                    onChange={(e) => setCell(item.ref, e.target.value)} />
                  {!docsMode && <button type="button" className="tta-cell-link" onClick={() => goToCell(item, number)}>Show {cellName} in workbook</button>}
                </div>
                {docsMode && readBack(item, raw) && (() => { const rb = readBack(item, raw); return (
                  <p className={'tta-answer-readback' + (rb.ok ? '' : ' is-error')} role={rb.ok ? undefined : 'alert'} aria-live="polite">{rb.text}</p>
                ); })()}
                {!docsMode && <p className="tta-answer-result">
                  {isFormula ? <>Result: </> : <>Saved as: </>}
                  <output aria-label={'Current value of ' + item.ref}>{shown}</output>
                  <span className="tta-answer-where"> · workbook cell {cellName}</span>
                </p>}
              </div>
            );
          })}
        </section>
        </React.Fragment>
      ))}
      </div>
      {docsMode ? (
      <section className="tta-battery-section tta-battery-workbook tta-docs-pane" aria-label="Documents">
        <h2>Documents</h2>
        <Documents source={source} documents={documents} />
      </section>
      ) : (
      <section className="tta-battery-section tta-battery-workbook" id="tta-workbook" aria-label="Shared workbook">
        <h2>Workbook</h2>
        <Workbook sheets={assessment.workbook?.sheets || null} source={source} cells={draft.workbook || {}}
          focusRequest={focusRequest} answerCells={answerCells}
          onChange={(workbook) => patchDraft((old) => ({ ...old, workbook }))} />
      </section>
      )}
      {returnTo && <button type="button" className="tta-return" onClick={backToQuestion}>Back to question {returnTo.number}</button>}
    </div>
  );
}
