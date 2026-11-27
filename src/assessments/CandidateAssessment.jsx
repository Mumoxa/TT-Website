import { DEFAULT_ASSESSMENT_SECONDS } from '../../functions/lib/assessment-deadlines.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssessmentWelcome, AssessmentRunnerLayout, AssessmentComplete, AssessmentFrame, AssessmentTimer,
} from './AssessmentApp.jsx';
import PersonalityQuestions from './PersonalityQuestions.jsx';
import { ReconciliationSpreadsheet } from './Spreadsheet.jsx';
import { BatteryPanels } from './BatteryPanels.jsx';
import './candidate.css';

/* An activity counts as answered once it holds a value. Cell activities are answered in the
   shared workbook at item.ref. */
function batteryItemAnswered(item, draft) {
  if (item.type === 'single') return Boolean(draft.mcq?.[item.id]);
  if (item.type === 'multi') return (draft.structured?.multi?.[item.id] || []).length > 0;
  // text, ref (a document code) and note (a written handoff) all keep their answer in structured.text.
  if (['text', 'ref', 'note'].includes(item.type)) return String(draft.structured?.text?.[item.id] ?? '').trim() !== '';
  // Line matching counts as answered once every line is classified.
  if (item.type === 'match') { const m = draft.structured?.match?.[item.id] || {}; return (item.lines || []).every((l) => m[l.id]); }
  return String(draft.workbook?.[item.ref] ?? '').trim() !== '';
}

/* Submitting ends the attempt and uses one of a candidate's three starts, so one click must not do it.
   The dialog shows what is still unanswered, defaults to going back, and stays open with 'Submitting…'
   until the server confirms, so the candidate always sees that the click did something. */
function SubmitConfirm({ answered, total, submitting, onConfirm, onCancel, attemptNumber = 1 }) {
  const backRef = useRef(null);
  useEffect(() => { backRef.current?.focus(); }, []);
  const missing = total == null ? 0 : total - answered;
  return (
    <div className="ca-modal-backdrop" onKeyDown={(e) => { if (e.key === 'Escape' && !submitting) onCancel(); }}>
      <div className="ca-modal" role="dialog" aria-modal="true" aria-labelledby="ca-submit-title" aria-describedby="ca-submit-text">
        <h2 id="ca-submit-title">Submit your assessment?</h2>
        <div id="ca-submit-text">
          {total != null && <p>You have answered <strong>{answered} of {total}</strong> activities.</p>}
          {missing > 0 && <p className="ca-modal-note">{missing === 1 ? '1 activity is' : missing + ' activities are'} still unanswered. Unanswered activities score zero.</p>}
          <p>After you submit you cannot change your answers. {attemptNumber >= 2 ? 'This is your second and final attempt.' : 'This counts as the first of your 2 attempts.'}</p>
        </div>
        <div className="ca-modal-actions">
          <button ref={backRef} type="button" className="ca-btn ca-btn--quiet" onClick={onCancel} disabled={submitting}>Back to the assessment</button>
          <button type="button" className="ca-btn ca-btn--primary" onClick={onConfirm} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit now'}</button>
        </div>
      </div>
    </div>
  );
}

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

export default function CandidateAssessment({catalogItem}) {
  const invitationToken = useRef(inviteFromUrl());
  const [phase, setPhase] = useState('loading');
  const [client, setClient] = useState({ client_name: catalogItem?.client_name || '', title: catalogItem?.title || 'Assessment', duration_seconds: DEFAULT_ASSESSMENT_SECONDS, slug: catalogItem?.slug || '' });
  const [attempt, setAttempt] = useState(null);
  const [draft, setDraft] = useState(blankAnswers);
  const [section, setSection] = useState('questions');
  const [isStarting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('All changes saved');
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [conflicted,setConflicted] = useState(false);
  const [expired,setExpired] = useState(false);
  const blockedRef=useRef(false);
  const submittingRef=useRef(false);
  const draftRef = useRef(blankAnswers());
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const attemptRef = useRef(null);

  const activate = useCallback((data) => {
    blockedRef.current=false;setConflicted(false);setExpired(data.status!=='active');setError('');
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
    setClient({ client_name: data.client_name, title: data.title, duration_seconds: DEFAULT_ASSESSMENT_SECONDS, slug: data.slug || catalogItem?.slug || '' });
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
          let meta;
          try { meta = await api('invite?token=' + encodeURIComponent(invitationToken.current), undefined, 'GET'); }
          catch(e) {
            const resumed=await api('me?invite='+encodeURIComponent(invitationToken.current),undefined,'GET');
            if(!cancelled){window.history.replaceState(null,'','/assessment');invitationToken.current='';activate(resumed);}return;
          }
          if (cancelled) return;
          setClient(meta);
          setPhase('welcome');
          return;
        }
        if(catalogItem){
          // The personality profile can be started once per ID number, so a candidate returning to its page
          // in the same browser resumes the open session instead of being asked to start again.
          if(catalogItem.kind==='personality'){
            try{const session=await api('me',undefined,'GET');if(!cancelled&&session.status==='active'&&session.assessment?.format==='personality-v1'){activate(session);return;}}catch{/* no session: show the welcome */}
          }
          if(!cancelled){setClient({...catalogItem,duration_seconds:catalogItem.kind==='personality'?catalogItem.duration_minutes*60:DEFAULT_ASSESSMENT_SECONDS});setPhase('welcome');}return;
        }
        const session = await api('me', undefined, 'GET');
        if (!cancelled) activate(session);
      } catch (e) {
        if (!cancelled) {
          setError(invitationToken.current ? e.message : '');
          setPhase('welcome');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activate]);

  function patchDraft(update) {
    if(blockedRef.current || submittingRef.current)return;
    const next = update(draftRef.current);
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    setSaveStatus('Changes not saved yet');
  }

  const save = useCallback(async (finalSave = false) => {
    if (blockedRef.current || (submittingRef.current && !finalSave) || savingRef.current || !dirtyRef.current || !attemptRef.current || attemptRef.current.status !== 'active') return;
    savingRef.current = true;
    dirtyRef.current = false;
    const answers = draftRef.current;
    const revision = revisionRef.current;
    setSaveStatus('Saving…');
    try {
      const result = await api('save', { ...answers, attempt_id:attemptRef.current.attempt_id, save_revision: revision });
      revisionRef.current = result.save_revision;
      setSaveStatus(dirtyRef.current ? 'Changes not saved yet' : 'All changes saved');
    } catch (e) {
      dirtyRef.current = true;
      if (e.status===409) {
        try {
          const fresh=await api('me?attempt_id='+attemptRef.current.attempt_id,undefined,'GET');
          if(fresh.status!=='active'){activate(fresh);return;}
        } catch { /* retain local edits without automatically replacing server work */ }
        {blockedRef.current=true;setConflicted(true);setSaveStatus('Save conflict — recovery required');setError('Another tab or an earlier request saved a newer revision. Load saved work to continue; this discards unsaved edits in this tab.');return;}
      }
      setSaveStatus('Not saved — retrying');
      setError(e.message);
    } finally {
      savingRef.current = false;
    }
  }, [activate]);

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
    if (!invitationToken.current && !catalogItem?.slug) {
      setError('Choose an assessment from the catalogue to begin.');
      return;
    }
    setStarting(true);
    setError('');
    try {
      const started = await api('start', { ...info, ...(invitationToken.current ? {invitation_token:invitationToken.current} : {assessment_slug:catalogItem.slug}) });
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
      const updated = await api('me?attempt_id='+attemptRef.current.attempt_id, undefined, 'GET');
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
    if (submittingRef.current || blockedRef.current || phase !== 'active') { setConfirmingSubmit(false); return; }
    submittingRef.current=true;
    setSubmitting(true);
    setError('');
    try {
      // Allow any earlier save request to finish before the final write.
      while (savingRef.current) await new Promise((r) => window.setTimeout(r, 75));
      if (dirtyRef.current) await save(true);
      if (dirtyRef.current) throw new Error('Your changes have not been saved. Please retry before the deadline.');
      const result = await api('submit', { ...draftRef.current, attempt_id:attemptRef.current.attempt_id, save_revision: revisionRef.current });
      attemptRef.current = { ...attemptRef.current, ...result };
      setAttempt((a) => ({ ...a, ...result }));
      setPhase('complete');
    } catch (e) {
      setConfirmingSubmit(false);
      setError(e.message);
      if (e.status === 409) { blockedRef.current=true;setConflicted(true);await refreshStatus(); }
    } finally {
      submittingRef.current=false;setSubmitting(false);
    }
  }

  useEffect(()=>{
    if(phase!=='active')return;
    const timer=window.setInterval(()=>{void refreshStatus();},15000);
    const visible=()=>{if(document.visibilityState==='visible')void refreshStatus();};
    document.addEventListener('visibilitychange',visible);
    return ()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[phase,refreshStatus]);
  async function recover() {
    try {activate(await api('me?attempt_id='+attemptRef.current.attempt_id,undefined,'GET'));}catch(e){setError(e.message);}
  }
  const remainingExpiry = useMemo(() => {
    if (!attempt) return new Date(Date.now()).toISOString();
    const offset = Number(attempt.server_now_ms || Date.now()) - Date.now();
    return new Date(Number(attempt.expires_at_ms) - offset).toISOString();
  }, [attempt?.expires_at_ms, attempt?.server_now_ms]);

  if (phase === 'loading') {
    return <AssessmentFrame><main className="tta-shell tta-loading" role="status">Opening assessment…</main></AssessmentFrame>;
  }
  if (phase === 'welcome') {
    const welcomeItem = catalogItem?.title === client.title && catalogItem?.client_name === client.client_name ? catalogItem : null;
    return <AssessmentWelcome client={client.client_name} assessmentTitle={client.title}
      slug={catalogItem?.slug || client.slug || ''}
      durationMinutes={Math.round(Number(client.duration_seconds) / 60) || 10}
      sectionTitles={welcomeItem?.section_titles} itemCount={welcomeItem?.item_count ?? client.item_count}
      startInstructions={client.instructions || welcomeItem?.instructions} kind={catalogItem?.kind || client.kind || ''}
      hasInvitation={Boolean(invitationToken.current)} onStart={invitationToken.current || catalogItem?.slug ? start : undefined} isStarting={isStarting} error={error} />;
  }
  if (phase === 'complete') {
    return <AssessmentComplete client={client.client_name}
      candidateName={(attempt?.first_name || '') + ' ' + (attempt?.surname || '')}
      timedOut={attempt?.status === 'timed_out'} result={attempt?.candidate_result} attemptNumber={attempt?.attempt_number||1}
      personality={attempt?.format === 'personality-v1' || attempt?.assessment?.format === 'personality-v1' || catalogItem?.kind === 'personality' || client.kind === 'personality'} />;
  }

  const assessment = attempt.assessment;
  if (assessment.format === 'personality-v1') {
    const personality = attempt.personality || { answers: {}, revision: 0 };
    return (
      <AssessmentFrame client={client.client_name} title={client.title} eyebrow="Workplace personality profile"
        timer={<AssessmentTimer expiresAt={remainingExpiry} onExpired={() => { void refreshStatus(); }} />}>
        <PersonalityQuestions key={attempt.attempt_id} form={assessment}
          initialAnswers={personality.answers || {}} initialRevision={Number(personality.revision) || 0}
          onSave={async ({ answers, revision }) => {
            const saved = await api('save', { attempt_id: attempt.attempt_id, save_revision: revision, answers });
            return { revision: saved.save_revision };
          }}
          onSubmit={async ({ answers, revision }) => {
            const done = await api('submit', { attempt_id: attempt.attempt_id, save_revision: revision, answers });
            attemptRef.current = { ...attemptRef.current, ...done };
            setAttempt((a) => ({ ...a, ...done }));
            setPhase('complete');
            return { status: 'submitted' };
          }}
          onLeave={() => { window.location.href = '/assessments'; }} />
      </AssessmentFrame>
    );
  }
  if (assessment.format === 'battery-v2') {
    const batteryItems = assessment.sections.flatMap((section) => section.items);
    const answeredCount = batteryItems.filter((item) => batteryItemAnswered(item, draft)).length;
    return (
      <AssessmentRunnerLayout client={client.client_name} assessmentTitle={client.title}
        candidateName={attempt.first_name + ' ' + attempt.surname}
        sectionLabel="Assessment battery"
        sectionNumber={1}
        progress={{ answered: answeredCount, total: batteryItems.length, sections: assessment.sections.length }}
        expiresAt={remainingExpiry}
        onExpired={()=>{blockedRef.current=true;setExpired(true);void refreshStatus();}}
        saveStatus={saveStatus}>
        {conflicted && <div className="tta-error" role="alert"><p>{error}</p><button type="button" onClick={recover}>Load saved work</button></div>}
        {expired && <p role="status">Time has expired. Confirming receipt of your saved work…</p>}
        <fieldset className="tta-run-fields" disabled={conflicted||expired||submitting}>
          <BatteryPanels assessment={assessment} draft={draft} patchDraft={patchDraft} />
          {error && <div className="tta-error" role="alert">{error}</div>}
          <div className="tta-run-actions">
            <button type="button" className="tta-submit" disabled={submitting || saveStatus.startsWith('Not saved')}
              onClick={() => setConfirmingSubmit(true)}>{submitting ? 'Submitting…' : 'Submit assessment'} <span aria-hidden="true">→</span></button>
          </div>
        </fieldset>
        {confirmingSubmit && !expired && <SubmitConfirm attemptNumber={attempt?.attempt_number||1} answered={answeredCount} total={batteryItems.length} submitting={submitting}
          onConfirm={() => void submit()} onCancel={() => setConfirmingSubmit(false)} />}
      </AssessmentRunnerLayout>
    );
  }
  const scenario = assessment.scenario;
  const refs = [...new Set([...scenario.supplier, ...scenario.ledger].map((row) => row.ref))].sort();
  const chosen = draft.structured.discrepancies || [];

  return (
    <AssessmentRunnerLayout client={client.client_name} assessmentTitle={client.title}
      candidateName={attempt.first_name + ' ' + attempt.surname}
      sectionLabel={section === 'questions' ? 'Technical knowledge' : 'Practical reconciliation'}
      sectionNumber={section === 'questions' ? 1 : 2}
      expiresAt={remainingExpiry}
      onExpired={()=>{blockedRef.current=true;setExpired(true);void refreshStatus();}}
      saveStatus={saveStatus}>
      {conflicted && <div className="tta-error" role="alert"><p>{error}</p><button type="button" onClick={recover}>Load saved work</button></div>}
      {expired && <p role="status">Time has expired. Confirming receipt of your saved work…</p>}
      <fieldset className="tta-run-fields" disabled={conflicted||expired||submitting}>
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
              onClick={() => setConfirmingSubmit(true)}>{submitting ? 'Submitting…' : 'Submit assessment'} <span aria-hidden="true">→</span></button>
          </>
        )}
      </div>
      {confirmingSubmit && !expired && <SubmitConfirm attemptNumber={attempt?.attempt_number||1} answered={null} total={null} submitting={submitting}
        onConfirm={() => void submit()} onCancel={() => setConfirmingSubmit(false)} />}
      </fieldset>
    </AssessmentRunnerLayout>
  );
}
