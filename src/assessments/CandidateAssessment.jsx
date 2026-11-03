import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssessmentWelcome, AssessmentRunnerLayout, AssessmentComplete, AssessmentFrame,
} from './AssessmentApp.jsx';
import { ReconciliationSpreadsheet } from './Spreadsheet.jsx';
import './candidate.css';

const BASE = '/api/assessment';
const blankAnswers = () => ({
  mcq: {},
  structured: { discrepancies: [], actions: {}, corrected_balance: null },
  workbook: {},
});
async function api(path, payload, method = 'POST') {
  const response = await fetch(BASE + '/' + path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({ ok: false, message: 'Invalid server response.' }));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || 'Assessment request failed.');
    error.status = response.status;
    error.conflict = data.conflict === true;
    throw error;
  }
  return data;
}
const inviteFromUrl = () => new URLSearchParams(window.location.search).get('invite') || '';

export default function CandidateAssessment() {
  const invitationToken = useRef(inviteFromUrl());
  const [phase, setPhase] = useState('loading');
  const [client, setClient] = useState({ client_name: 'SATURC', title: 'Accounts Payable Competency Assessment', duration_seconds: 600 });
  const [attempt, setAttempt] = useState(null);
  const [draft, setDraft] = useState(blankAnswers);
  const [section, setSection] = useState('questions');
  const [isStarting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('All changes saved');
  const [submitting, setSubmitting] = useState(false);
  const draftRef = useRef(blankAnswers());
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const attemptRef = useRef(null);

  const activate = useCallback((data) => {
    attemptRef.current = data;
    revisionRef.current = Number(data.save_revision) || 0;
    const saved = data.responses || blankAnswers();
    const state = {
      mcq: saved.mcq || {},
      structured: { discrepancies: [], actions: {}, corrected_balance: null, ...(saved.structured || {}) },
      workbook: saved.workbook || {},
    };
    draftRef.current = state;
    dirtyRef.current = false;
    setDraft(state);
    setAttempt(data);
    setClient({ client_name: data.client_name, title: data.title, duration_seconds: 600 });
    setPhase(data.status === 'active' ? 'active' : 'complete');
    setSaveStatus('All changes saved');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // If a new invitation is present, start with its own welcome screen
        // even when this browser has a completed older attempt cookie.
        if (invitationToken.current) {
          const meta = await api('invite?token=' + encodeURIComponent(invitationToken.current), undefined, 'GET');
          if (cancelled) return;
          setClient(meta);
          setPhase('welcome');
          return;
        }
        const session = await api('me', undefined, 'GET');
        if (!cancelled) activate(session);
      } catch (e) {
        if (!cancelled) {
          setError(invitationToken.current ? e.message : 'Your recruiter must provide an individual assessment invitation link.');
          setPhase('welcome');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activate]);

  function patchDraft(update) {
    const next = update(draftRef.current);
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    setSaveStatus('Changes not saved yet');
  }

  const save = useCallback(async () => {
    if (savingRef.current || !dirtyRef.current || !attemptRef.current || attemptRef.current.status !== 'active') return;
    savingRef.current = true;
    dirtyRef.current = false;
    const answers = draftRef.current;
    const revision = revisionRef.current;
    setSaveStatus('Saving…');
    try {
      const result = await api('save', { ...answers, save_revision: revision });
      revisionRef.current = result.save_revision;
      setSaveStatus(dirtyRef.current ? 'Changes not saved yet' : 'All changes saved');
    } catch (e) {
      dirtyRef.current = true;
      if (e.conflict) {
        // Fetch the latest revision without overwriting still-unsaved local edits.
        try {
          const fresh = await api('me', undefined, 'GET');
          revisionRef.current = Number(fresh.save_revision) || 0;
          if (fresh.status !== 'active') {
            attemptRef.current = fresh;
            setAttempt(fresh);
            setPhase('complete');
            return;
          }
        } catch { /* keep local draft and retry after connection recovery */ }
      }
      setSaveStatus('Not saved — retrying');
      setError(e.message);
    } finally {
      savingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (phase !== 'active') return undefined;
    const timer = window.setInterval(() => { void save(); }, 1250);
    return () => window.clearInterval(timer);
  }, [phase, save]);

  useEffect(() => {
    if (phase !== 'active') return undefined;
    const beforeLeave = (event) => {
      if (!dirtyRef.current && !savingRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeLeave);
    return () => window.removeEventListener('beforeunload', beforeLeave);
  }, [phase]);

  async function start(info) {
    if (isStarting) return;
    if (!invitationToken.current) {
      setError('The invitation token is missing. Open the individual link supplied by your recruiter.');
      return;
    }
    setStarting(true);
    setError('');
    try {
      const started = await api('start', { ...info, invitation_token: invitationToken.current });
      // Remove the bearer token from the address bar after it has been redeemed.
      window.history.replaceState(null, '', '/assessment');
      invitationToken.current = '';
      activate(started);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }

  const refreshStatus = useCallback(async () => {
    try {
      const updated = await api('me', undefined, 'GET');
      if (updated.status !== 'active') {
        attemptRef.current = updated;
        setAttempt(updated);
        setPhase('complete');
        return;
      }
      setAttempt(updated);
    } catch (e) {
      setError('Could not confirm the assessment status. ' + e.message);
    }
  }, []);

  async function submit() {
    if (submitting || phase !== 'active') return;
    setSubmitting(true);
    setError('');
    try {
      // Allow any earlier save request to finish before the final write.
      while (savingRef.current) await new Promise((r) => window.setTimeout(r, 75));
      if (dirtyRef.current) await save();
      if (dirtyRef.current) throw new Error('Your changes have not been saved. Please retry before the deadline.');
      const result = await api('submit', { ...draftRef.current, save_revision: revisionRef.current });
      attemptRef.current = { ...attemptRef.current, status: result.status };
      setAttempt((a) => ({ ...a, status: result.status }));
      setPhase('complete');
    } catch (e) {
      if (e.status === 409) await refreshStatus();
      else setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const remainingExpiry = useMemo(() => {
    if (!attempt) return new Date(Date.now()).toISOString();
    const offset = Number(attempt.server_now_ms || Date.now()) - Date.now();
    return new Date(Number(attempt.expires_at_ms) - offset).toISOString();
  }, [attempt?.expires_at_ms, attempt?.server_now_ms]);

  if (phase === 'loading') {
    return <AssessmentFrame client="SATURC"><main className="tta-shell tta-loading" role="status">Opening assessment…</main></AssessmentFrame>;
  }
  if (phase === 'welcome') {
    return <AssessmentWelcome client={client.client_name} assessmentTitle={client.title}
      durationMinutes={Math.round(Number(client.duration_seconds) / 60) || 10}
      onStart={start} isStarting={isStarting} error={error} />;
  }
  if (phase === 'complete') {
    return <AssessmentComplete client={client.client_name}
      candidateName={(attempt?.first_name || '') + ' ' + (attempt?.surname || '')}
      timedOut={attempt?.status === 'timed_out'} />;
  }

  const assessment = attempt.assessment;
  const scenario = assessment.scenario;
  const refs = [...new Set([...scenario.supplier, ...scenario.ledger].map((row) => row.ref))].sort();
  const chosen = draft.structured.discrepancies || [];

  return (
    <AssessmentRunnerLayout client={client.client_name}
      candidateName={attempt.first_name + ' ' + attempt.surname}
      sectionLabel={section === 'questions' ? 'Technical knowledge' : 'Practical reconciliation'}
      sectionNumber={section === 'questions' ? 1 : 2}
      expiresAt={remainingExpiry}
      onExpired={refreshStatus}
      saveStatus={saveStatus}>
      <div className="tta-section-header">
        <div className="tta-kicker">Section {section === 'questions' ? '01' : '02'}</div>
        <h2>{section === 'questions' ? 'Accounting decisions' : 'Supplier reconciliation'}</h2>
        <p>{section === 'questions'
          ? 'Choose the best action in each situation. All five questions are compulsory.'
          : 'Compare the records, use the live worksheet for your calculations and identify the transactions that explain the difference.'}</p>
      </div>
      {section === 'questions' ? (
        <div className="tta-questions">
          {assessment.questions.map((q, index) => (
            <fieldset key={q.id} className="tta-question">
              <legend><span>{String(index + 1).padStart(2, '0')}</span> {q.prompt}</legend>
              {q.options.map((option) => (
                <label className={'tta-choice' + (draft.mcq[q.id] === option.id ? ' tta-choice-selected' : '')} key={option.id}>
                  <input type="radio" name={q.id} value={option.id}
                    checked={draft.mcq[q.id] === option.id}
                    onChange={() => patchDraft((old) => ({ ...old, mcq: { ...old.mcq, [q.id]: option.id } }))} />
                  <span>{option.text}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      ) : (
        <div className="tta-practical">
          {scenario.instructions && <p className="tta-scenario-instructions">{scenario.instructions}</p>}
          <ReconciliationSpreadsheet scenario={scenario} cells={draft.workbook}
            onChange={(workbook) => patchDraft((old) => ({ ...old, workbook }))} />
          <div className="tta-recon-response">
            <h3>1. Identify the discrepancies</h3>
            <p>Choose the transaction references requiring investigation. Incorrect selections affect your score.</p>
            <div className="tta-reference-list">
              {refs.map((ref) => <label key={ref} className={chosen.includes(ref) ? 'tta-reference-selected' : ''}>
                <input type="checkbox" checked={chosen.includes(ref)} onChange={(e) => {
                  const discrepancies = e.target.checked ? [...chosen, ref] : chosen.filter((r) => r !== ref);
                  patchDraft((old) => ({ ...old, structured: { ...old.structured, discrepancies } }));
                }} />
                {ref}
              </label>)}
            </div>
            <h3>2. Choose the corrective action</h3>
            <p>For each discrepancy you selected, choose the most appropriate next step.</p>
            {chosen.length ? chosen.map((ref) => (
              <label key={ref} className="tta-recon-action">
                <strong>{ref}</strong>
                <select value={draft.structured.actions?.[ref] || ''}
                  onChange={(e) => patchDraft((old) => ({
                    ...old, structured: { ...old.structured, actions: { ...old.structured.actions, [ref]: e.target.value } },
                  }))}>
                  <option value="">Select the corrective action</option>
                  {scenario.action_options.map((o) => <option value={o.id} key={o.id}>{o.text}</option>)}
                </select>
              </label>
            )) : <p className="tta-inline-help">First select the discrepancy references above.</p>}
            <h3>3. Corrected outstanding balance</h3>
            <label className="tta-balance-field">
              <span>Enter the corrected balance (R)</span>
              <input type="number" inputMode="decimal" step="0.01" placeholder="0.00"
                value={draft.structured.corrected_balance ?? ''}
                onChange={(e) => patchDraft((old) => ({
                  ...old, structured: { ...old.structured, corrected_balance: e.target.value },
                }))} />
            </label>
          </div>
        </div>
      )}
      {error && <div className="tta-error" role="alert">{error}</div>}
      <div className="tta-run-actions">
        {section === 'questions' ? (
          <button type="button" className="tta-submit" onClick={() => setSection('workbook')}>Continue to reconciliation <span aria-hidden="true">→</span></button>
        ) : (
          <>
            <button type="button" className="tta-back" onClick={() => setSection('questions')}>Back to questions</button>
            <button type="button" className="tta-submit" disabled={submitting || saveStatus.startsWith('Not saved')}
              onClick={submit}>{submitting ? 'Submitting…' : 'Submit assessment'} <span aria-hidden="true">→</span></button>
          </>
        )}
      </div>
    </AssessmentRunnerLayout>
  );
}
