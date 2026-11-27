import { DEFAULT_ASSESSMENT_SECONDS } from '../../functions/lib/assessment-deadlines.js';
import { formatDuration } from '../../functions/lib/speed-accuracy.js';
import React, { useEffect, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import { ReconciliationSpreadsheet } from './Spreadsheet.jsx';
import { Workbook } from './Workbook.jsx';
import { PersonalityDossier } from './PersonalityDossier.jsx';
import './admin-assessments.css';

async function request(path, { method = 'GET', body, login = false } = {}) {
  const response = await fetch(login ? path : '/api/assessment/admin/' + path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : {
      'Content-Type': 'application/json',
      ...(!login ? { 'x-tt-assessment-admin': '1' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ ok: false, message: 'Unexpected server response.' }));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

const formattedTime = (value) => value ? new Date(value).toLocaleString('en-ZA') : '—';

function AdminHeader() {
  return <header className="tta-admin-topbar">
    <div className="tta-admin-shell tta-admin-head-inner">
      <a href="/" className="tta-admin-brand" aria-label="Talent Tree homepage">
        <img src={talentTreeLogo} alt="Talent Tree Consulting" />
        <span><strong>Talent Tree</strong><small>Assessments</small></span>
      </a>
      <span className="tta-admin-private">Private recruitment workspace</span>
    </div>
  </header>;
}

function Login({ onSuccess }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await request('login', { method: 'POST', body: { key } });
      setKey('');
      onSuccess();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="tta-admin-login">
    <h1>Recruiter sign-in</h1>
    <p>Enter your assessment admin key. This access is separate from confidential offers.</p>
    <form onSubmit={login}>
      <label htmlFor="tta-admin-key">Admin access key</label>
      <input id="tta-admin-key" type="password" value={key} onChange={(e) => setKey(e.target.value)}
        autoComplete="current-password" required />
      <button type="submit" disabled={busy || !key}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    {error && <p className="tta-admin-error" role="alert">{error}</p>}
  </section>;
}

/* The written handoff is scored by the server, so this shows the evidence behind the mark rather
   than asking anyone to set it. Nothing here is editable. */
/* Speed and accuracy, shown next to the score so a recruiter can tell a careful candidate who ran out of time
   from a fast one who guessed. Computed by the server; it never changes the score. */
export function SpeedAccuracy({ report }) {
  const sa = report.speed_accuracy;
  if (!sa) return null;
  return <section className="tta-admin-panel" aria-labelledby="tta-speed-accuracy">
    <h2 id="tta-speed-accuracy">Speed and accuracy</h2>
    <p className="tta-admin-mark-total"><strong>{sa.profile.label}</strong></p>
    <dl className="tta-admin-score-breakdown">
      <div><dt>Accuracy on answered work</dt><dd>{sa.accuracy_percent === null ? 'No answered work' : sa.accuracy_percent + '%'}</dd></div>
      <div><dt>Activities answered</dt><dd>{sa.answered} of {sa.total} ({sa.completion_percent}%)</dd></div>
      <div><dt>Time used</dt><dd>{formatDuration(sa.time_used_seconds)} of {formatDuration(sa.time_limit_seconds)}{sa.time_used_percent === null ? '' : ' (' + sa.time_used_percent + '%)'}</dd></div>
      <div><dt>Average time per answered activity</dt><dd>{sa.seconds_per_answer === null ? '—' : formatDuration(sa.seconds_per_answer)}</dd></div>
    </dl>
    <p className="tta-admin-muted">Accuracy counts only the activities the candidate answered, so it is separate from the score. {sa.basis}</p>
  </section>;
}

/* Page integrity: how often and how long the candidate left the assessment page, pastes from outside and blocked
   copies. Recorded by the server; it never changes a score and is not proof of misconduct. */
export function IntegrityRecord({ report }) {
  const r = report.integrity;
  if (!r) return null;
  const level = r.long_leaves > 0 || r.away_seconds >= 60 || r.outside_pastes > 0 ? 'Ask about this' : r.leaves > 0 || r.copy_blocked > 0 ? 'Minor' : 'Nothing recorded';
  return <section className="tta-admin-panel" aria-labelledby="tta-integrity">
    <h2 id="tta-integrity">Page integrity</h2>
    <p className="tta-admin-mark-total"><strong>{level}</strong></p>
    <dl className="tta-admin-score-breakdown">
      <div><dt>Left the assessment page</dt><dd>{r.leaves} time{r.leaves === 1 ? '' : 's'}{r.long_leaves ? ` (${r.long_leaves} longer than 30 s)` : ''}</dd></div>
      <div><dt>Time away in total</dt><dd>{formatDuration(r.away_seconds)}{r.leaves ? ` · longest ${formatDuration(r.longest_away_seconds)}` : ''}{r.away_at_close ? ' · was away when the time ran out' : ''}</dd></div>
      <div><dt>Pasted text from outside the assessment</dt><dd>{r.outside_pastes}</dd></div>
      <div><dt>Copy attempts blocked</dt><dd>{r.copy_blocked}</dd></div>
      <div><dt>Honesty statement</dt><dd>{r.statement_accepted ? 'Accepted before starting' : 'Not recorded'}</dd></div>
    </dl>
    <p className="tta-admin-muted">{r.basis}</p>
  </section>;
}

export function HandoffEvidence({ report }) {
  const notes = report.result?.review?.notes || [];
  if (!notes.length) return null;
  return <section className="tta-admin-panel">
    <h2>Written handoff — scored automatically</h2>
    <p className="tta-admin-muted">This activity was scored by the server against published evidence markers, on the same zero-or-full rule as every other field. Each criterion is worth two points and shows the marker that earned it.</p>
    {notes.map((note) => <div key={note.id} className="tta-handoff-evidence">
      <p className="tta-admin-mark-total"><strong>{note.earned}</strong> of {note.points} points · {note.id}</p>
      <ul className="tta-criteria-list">
        {(note.criteria || []).map((c, index) => <li key={c.id} className={c.points ? 'is-earned' : ''}>
          <span className="tta-criteria-mark">{c.points}/{2}</span>
          <span className="tta-criteria-label">Criterion {index + 1}</span>
          {c.matched ? <span className="tta-admin-muted">· matched “{c.matched}”</span> : null}
          {!c.points && c.missing?.length ? <span className="tta-admin-muted">· no evidence of: {c.missing.join(', ')}</span> : null}
          {!c.points && c.blocked_by ? <span className="tta-admin-muted">· the note says “{c.blocked_by}”, which contradicts the criterion</span> : null}
        </li>)}
      </ul>
      <details><summary>What the candidate wrote</summary>
        <pre className="tta-handoff-note">{report.question_review?.find((q) => q.id === note.id)?.chosen || 'Nothing was written for this activity.'}</pre>
      </details>
    </div>)}
  </section>;
}

/* The hiring decision is a separate record from the score, with its own reason and author. */
function DecisionPanel({ report, attemptId, onRecorded }) {
  const current = report.result?.decision;
  const [decision, setDecision] = useState(current?.decision || '');
  const [reason, setReason] = useState('');
  const [decidedBy, setDecidedBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      await request('decision/' + attemptId, { method: 'POST', body: { decision, reason: reason.trim(), decided_by: decidedBy.trim() } });
      setMessage('Decision recorded.');
      if (onRecorded) await onRecorded();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="tta-admin-panel no-print">
    <h2>Hiring decision</h2>
    <p className="tta-admin-muted">The decision is recorded separately and never changes a score. Current: {current ? <><strong>{current.decision.replace('_', ' ')}</strong> by {current.decided_by}</> : 'not recorded'}</p>
    {current && <p className="tta-admin-muted">{current.reason}</p>}
    <div className="tta-marking-form">
      <label>Decision<select value={decision} onChange={(e) => setDecision(e.target.value)}>
        <option value="">Select</option><option value="advance">Advance to interview</option>
        <option value="hold">Hold</option><option value="not_advance">Not advance</option>
      </select></label>
      <label>Reason<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="At least 8 characters" /></label>
      <label>Decided by<input value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} maxLength={120} /></label>
      {error && <p className="tta-admin-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button type="button" onClick={save} disabled={busy || !decision || reason.trim().length < 8 || decidedBy.trim().length < 2}>{busy ? 'Saving…' : 'Record decision'}</button>
    </div>
  </section>;
}

function ResultReport({ report, onBack, onRecorded }) {
  if (report.assessment?.format === 'personality-v1') return <PersonalityDossier report={report} onBack={onBack} />;
  const r = report.result, a = report.attempt;
  // Wording follows the assessment that was taken, never a hard-coded product family.
  const receivable = /receivable|debtor/i.test(report.assessment?.title || '');
  const hr = /\bHR\b|human resources/i.test(report.assessment?.title || '');
  const score = r?.overall_score;
  function printReport() { window.print(); }
  const workbook = report.responses?.workbook || {};
  const savedCells = Object.entries(workbook).filter(([, value]) => value !== '');
  const actions = Object.entries(report.responses.structured?.actions || {});
  return <article className="tta-admin-report">
    <div className="tta-admin-action-row no-print">
      <button onClick={onBack} className="tta-admin-outline">← All results</button>
      <button onClick={printReport}>Print / Save PDF</button>
    </div>
    <div className="tta-admin-report-heading">
      <img className="tta-report-logo" src={talentTreeLogo} alt="Talent Tree Consulting"/>
      <span className="tta-admin-kicker">Confidential · Assessment evidence</span>
      <h1>{report.candidate.first_name} {report.candidate.surname}</h1>
      <p className="tta-report-subtitle">{report.assessment.title} · {report.assessment.client_name}</p>
      <p className="tta-report-attempt">Attempt {a.attempt_number||1}{a.form_label ? ' · Form ' + a.form_label : ''}</p>
      <p className="tta-admin-muted">{report.candidate.email} · {formattedTime(a.started_at_ms)} · {a.status}</p>
    </div>
    <div className="tta-report-summary-label">Assessment overview</div>
    <div className="tta-admin-score-row">
      <div><small>Overall</small><strong>{score == null ? 'Pending' : score + '/100'}</strong></div>
      <div><small>Knowledge</small><strong>{r?.knowledge_score ?? '—'}/40</strong></div>
      <div><small>Practical work</small><strong>{r?.reconciliation_score ?? '—'}/60</strong></div>
      <div><small>Time used</small><strong>{report.speed_accuracy ? formatDuration(report.speed_accuracy.time_used_seconds) + ' of ' + formatDuration(report.speed_accuracy.time_limit_seconds) : a.closed_at_ms ? formatDuration(Math.min(DEFAULT_ASSESSMENT_SECONDS, Math.max(0, Math.round((a.closed_at_ms - a.started_at_ms) / 1000)))) : '—'}</strong></div>
    </div>
    <section className="tta-admin-panel"><h2>Screening details</h2>
      <dl className="tta-admin-score-breakdown">{[
        ['Contact number',report.screening?.contact_number_masked],['South African ID number',report.screening?.id_number_masked],['Earliest start date',report.screening?.earliest_start_date],['First day confirmed',report.screening?.first_day_confirmed==null?'Not recorded':(report.screening.first_day_confirmed?'Yes':'No')],['Travel mode',report.screening?.travel_mode?.replace(/_/g,' ')],['Route description',report.screening?.travel_description],['Own transport',report.screening?.own_transport],
        // Asked only before 2026-11-24; shown for candidates who answered it.
        ...(report.screening?.assignment_available ? [['Available for a 2-month assignment',report.screening.assignment_available],['Availability note',report.screening.assignment_note]] : [])
      ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not recorded'}</dd></div>)}</dl>
    </section>
    <SpeedAccuracy report={report} />
    <IntegrityRecord report={report} />
    <HandoffEvidence report={report} />
    <section className="tta-admin-panel tta-report-keep-together">
      <h2>Assessment interpretation</h2>
      <p>{r?.interpretation || 'The assessment has not yet been scored.'}</p>
      <p className="tta-admin-muted">{hr
        ? 'A timed work sample is screening evidence, not independent proof of HR competence. Verify practical experience, HR and payroll systems usage and references.'
        : <>A timed work sample is screening evidence, not independent proof of full-function {receivable ? 'accounts receivable' : 'accounts payable'} competence. Verify practical experience, {receivable ? 'debtors ledger and collections systems' : 'Sage 300 and creditor systems'} usage and references.</>}</p>
      {!!r?.critical_flags?.length && <div className="tta-admin-flags">
        {r.critical_flags.map((f, i) => <span key={i}>{f}</span>)}
      </div>}
    </section>
    {r?.breakdown && <section className="tta-admin-panel">
      <h2>Scoring breakdown</h2>
      <dl className="tta-admin-score-breakdown">
        {breakdownRows(r.breakdown).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>}
    <section className="tta-admin-panel">
      <h2>Activity review — knowledge and practical work</h2>
      <div className="tta-admin-table-scroll"><table className="tta-admin-table">
        <thead><tr><th>Question</th><th>Candidate's answer</th><th>Expected answer</th><th>Outcome</th></tr></thead>
        <tbody>{(report.question_review || []).map((q, i) => <tr key={i}>
          {q.lines
            ? <><td>{q.prompt}</td>
                <td><ul className="tta-admin-lines">{q.lines.map((l) => <li key={l.id} className={l.ok ? undefined : 'is-wrong'}>{l.ref}: {l.given || 'Not answered'}{l.ok ? '' : ' ✗'}</li>)}</ul></td>
                <td><ul className="tta-admin-lines">{q.lines.map((l) => <li key={l.id}>{l.ref}: {l.correct}</li>)}</ul></td>
                <td>{q.awarded} of {q.lines.length} lines correct</td></>
            : <><td>{q.prompt}</td><td>{q.chosen}</td><td>{q.expected}</td><td>{q.correct ? 'Correct' : 'Incorrect'}</td></>}
        </tr>)}</tbody>
      </table></div>
    </section>
    <section className="tta-admin-panel tta-report-keep-together">
      <h2>Candidate's reconciliation decisions</h2>
      <p>Selected discrepancy references: {(report.responses.structured?.discrepancies || []).join(', ') || 'None recorded'}</p>
      <p>Corrective actions:</p>
      {actions.length ? <dl className="tta-admin-score-breakdown">
        {actions.map(([ref, value]) => <div key={ref}><dt>{ref}</dt><dd>{report.assessment.scenario?.action_options?.find((o) => o.id === value)?.text || value}</dd></div>)}
      </dl> : <p className="tta-admin-muted">None recorded.</p>}
      <p>Entered corrected balance: R{report.responses.structured?.corrected_balance ?? '—'}</p>
    </section>
    <section className="tta-admin-panel">
      <h2>Saved spreadsheet working</h2>
      <p className="tta-admin-muted no-print">Read-only replay of the candidate's last saved cells and formulas; source tabs are reconstructed from the published assessment scenario.</p>
      <p className="tta-admin-muted tta-report-print-only">The interactive spreadsheet replay is available in the online report. Saved cell entries and calculated values are listed below.</p>
      {report.assessment.format === 'battery-v2'
        ? <Workbook sheets={report.assessment.sheets || null} source={report.workbook_source || {}} cells={workbook} readOnly />
        : <ReconciliationSpreadsheet scenario={report.assessment.scenario} cells={workbook} readOnly />}
      <p className="tta-admin-muted">Last saved: {formattedTime(a.last_saved_at_ms)} · {report.workbook_save_history?.length || 0} saved workbook revisions</p>
      {!!report.workbook_save_history?.length && <details className="tta-admin-save-history no-print">
        <summary>View saved revision timeline</summary>
        <ol>{report.workbook_save_history.map((rev) => <li key={rev.revision}>Revision {rev.revision} — {formattedTime(rev.saved_at_ms)}</li>)}</ol>
      </details>}
    </section>
    <section className="tta-admin-panel">
      <h2>Saved cells and formulas</h2>
      <p>Raw entries and independently recalculated values. Empty cells are omitted; source copies remain editable working only.</p>
      {savedCells.length ? <table className="tta-admin-evidence"><thead><tr><th>Cell</th><th>Saved entry / formula</th><th>Calculated value</th></tr></thead><tbody>
        {savedCells.map(([ref,value])=><tr key={ref}><th>{ref}</th><td>{value}</td><td>{report.workbook_values?.[ref]}</td></tr>)}
      </tbody></table> : <p className="tta-admin-muted">No saved cell entries recorded.</p>}
    </section>
    <section className="tta-admin-panel">
      <h2>Reconciliation marking evidence</h2>
      <p>Expected corrected balance: R{report.reconciliation_review?.expected_balance ?? '—'}</p>
      {(report.reconciliation_review?.expected_discrepancies||[]).map(ref=><p key={ref}>{ref}: {report.assessment.scenario?.action_options?.find(o=>o.id===report.reconciliation_review.expected_actions?.[ref])?.text || 'Review private rubric'}</p>)}
    </section>
    <section className="tta-admin-panel">
      <h2>Audit records</h2>
      <ol>{(report.audit_events||[]).map((event,i)=><li key={i}>{formattedTime(event.created_at)} — {event.event_type} ({event.actor_type})</li>)}</ol>
    </section>
    <DecisionPanel report={report} attemptId={a.id} onRecorded={onRecorded} />
    <section className="tta-admin-panel no-print">
      <h2>Structured response evidence</h2>
      <pre className="tta-admin-json">{JSON.stringify(report.responses, null, 2)}</pre>
    </section>
  </article>;
}

function Workspace({ onExpired }) {
  const [records, setRecords] = useState({ definitions: [], attempts: [] });
  const [activeReport, setActiveReport] = useState(null);
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState('');
  const [selectedDefinition, setSelectedDefinition] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [packageJson, setPackageJson] = useState('');
  const [draftVersion,setDraftVersion]=useState('');
  const [contentApproved,setContentApproved]=useState(false);
  const [privacyApproved,setPrivacyApproved]=useState(false);
  const [approvalReference,setApprovalReference]=useState('');
  const [tab, setTab] = useState('results');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const data = await request('list');
      setRecords(data);
      setSelectedDefinition((old) => old || data.definitions[0]?.id || '');
    } catch (e) {
      if (e.status === 401) { onExpired(); return; }
      setError(e.message);
    }
  }
  useEffect(() => { void load(); }, []);

  async function invitation(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage(''); setGeneratedLink('');
    try {
      const data = await request('invite', { method: 'POST',
        body: { assessment_id: selectedDefinition, intended_email: email.trim(), valid_days: 7 } });
      setGeneratedLink(data.invitation_url);
      setMessage('Invitation link created. Copy and send it securely to the candidate.');
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function saveDraft(e) {
    e.preventDefault();if(busy)return;
    setBusy(true);setError('');setMessage('');
    try {
      const result=await request('draft',{method:'POST',body:JSON.parse(packageJson)});
      setDraftVersion(result.version_id);setContentApproved(false);setPrivacyApproved(false);setApprovalReference('');
      setMessage('Draft saved privately. Approval is required before publishing.');await load();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  // Imports a private package file (never a public one) straight into the JSON field, so a real
  // assessment does not have to be pasted by hand. The file is read in the browser only.
  async function importPackage(e) {
    const file=e.target.files?.[0];if(!file)return;
    setError('');setMessage('');
    try {
      const parsed=JSON.parse(await file.text());
      if(!parsed.question_payload||!parsed.scoring_key||!parsed.slug)throw new Error('That file is not an assessment package.');
      setPackageJson(JSON.stringify(parsed,null,2));setDraftVersion('');
      setMessage('Loaded '+file.name+'. Check the slug and title, then save the private draft.');
    }catch(err){setError('Could not read that package: '+err.message);}
    finally{e.target.value='';}
  }
  async function loadDraft(versionId) {
    setBusy(true);setError('');
    try {const result=await request('draft/'+versionId);setPackageJson(JSON.stringify(result.package,null,2));setDraftVersion(versionId);setContentApproved(false);setPrivacyApproved(false);setApprovalReference('');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function publish() {
    if(busy)return;setBusy(true);setError('');setMessage('');
    try {
      const result=await request('publish',{method:'POST',body:{version_id:draftVersion,content_approved:contentApproved,privacy_approved:privacyApproved,approval_reference:approvalReference}});
      setMessage('Published private assessment '+result.version_label+'.');setDraftVersion('');setPackageJson('');await load();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function openReport(id) {
    setBusy(true); setError('');
    try {
      setActiveReport(await request('report/' + encodeURIComponent(id.trim())));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const visible = records.attempts.filter((a) =>
    [a.first_name, a.surname, a.email, a.client_name, a.title].join(' ').toLowerCase().includes(search.toLowerCase()));

  if (activeReport) return <main className="tta-admin-shell">
    <ResultReport report={activeReport}
      onBack={() => { setActiveReport(null); void load(); }}
      onRecorded={async () => { setActiveReport(await request('report/' + activeReport.attempt.id)); }} />
  </main>;

  return <main className="tta-admin-shell tta-admin-main">
    <div className="tta-admin-intro">
      <div><span className="tta-admin-kicker">Private recruiter reporting</span>
        <h1>Assessment results</h1>
        <p>Objective technical and reconciliation results. Candidate records are visible only after secure admin sign-in.</p>
      </div>
      <button onClick={() => void load()} className="tta-admin-outline">Refresh results</button>
    </div>
    <div className="tta-admin-nav">
      {[
        ['results', 'Results'],
        ['invitations', 'Candidate invitations'],
        ['publish', 'Assessment setup'],
      ].map(([key, name]) => <button key={key} className={tab === key ? 'active' : ''}
        onClick={() => { setTab(key); setMessage(''); setError(''); }}>{name}</button>)}
    </div>
    {error && <div role="alert" className="tta-admin-error">{error}</div>}
    {message && <div role="status" className="tta-admin-success">{message}</div>}
    {tab === 'results' && <section className="tta-admin-panel">
      <div className="tta-admin-filter">
        <h2>Candidate attempts</h2>
        <input aria-label="Search assessment results" placeholder="Search candidate, email or client…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="tta-admin-table-scroll"><table className="tta-admin-table tta-results-table">
        <thead><tr><th>Candidate</th><th>Attempt</th><th>Status</th><th>Score</th><th>Started</th><th>Report</th></tr></thead>
        <tbody>{visible.length ? visible.map((a) => <tr key={a.id}>
          <td><strong>{a.first_name} {a.surname}</strong><small>{a.email}</small></td>
          <td><span className="tta-mobile-label" aria-hidden="true">Attempt</span>{a.attempt_number||1}{a.form_label ? ' · Form ' + a.form_label : ''}</td>
          <td><span className="tta-mobile-label" aria-hidden="true">Status</span>{a.status}</td>
          <td><span className="tta-mobile-label" aria-hidden="true">Score</span>{a.overall_score ?? '—'}</td>
          <td><span className="tta-mobile-label" aria-hidden="true">Started</span>{formattedTime(a.started_at_ms)}</td>
          <td><button disabled={busy} className="tta-admin-textbutton" onClick={() => openReport(a.id)}>View</button></td>
        </tr>) : <tr><td colSpan={6}>No candidate attempts found.</td></tr>}</tbody>
      </table></div>
    </section>}
    {tab === 'invitations' && <section className="tta-admin-panel">
      <h2>Create candidate invitation</h2>
      <p>Invitations are individual and valid for seven days by default. Candidates can also start from the public assessment link. Repeat attempts are numbered. Each ID number can start at most 2 times, the second is final, and nobody is given the same form twice.</p>
      <form onSubmit={invitation} className="tta-admin-form">
        <label>Published assessment
          <select value={selectedDefinition} onChange={(e) => setSelectedDefinition(e.target.value)} required>
            <option value="">Choose assessment</option>
            {records.definitions.filter((d) => d.status === 'published').map((d) =>
              <option value={d.id} key={d.id}>{d.client_name} — {d.title}</option>)}
          </select>
        </label>
        <label>Candidate email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="candidate@example.com" required />
        </label>
        <button type="submit" disabled={busy || !selectedDefinition}>Generate secure link</button>
      </form>
      {generatedLink && <div className="tta-admin-generated">
        <p><strong>One-time invitation:</strong></p>
        <code>{generatedLink}</code>
        <button onClick={() => navigator.clipboard?.writeText(generatedLink)}>Copy link</button>
        <p>Copy it now. Only a hash is stored; the raw invitation link cannot be recovered later.</p>
      </div>}
    </section>}
    {tab === 'publish' && <section className="tta-admin-panel">
      <h2>Author a private assessment draft</h2>
      <p>The assessment JSON must either use the v1 structure (five technical questions, a practical scenario and its private scoring key) or the battery-v2 format (format: "battery-v2", sections, workbook.source and a private scoring key). This form saves the package directly to the protected assessment database. Never commit live answers in GitHub.</p>
      <div className="tta-admin-form">
        {records.definitions.map(d=><button type="button" key={d.id} onClick={()=>loadDraft(d.latest_version_id)} disabled={busy||!d.latest_version_id}>Edit latest: {d.client_name} — {d.title}</button>)}
      </div>
      <p>Each question needs an id, prompt, and four options with id/text. scenario requires instructions, supplier and ledger rows (ref, amount, description), and action_options (id/text). The private scoring_key requires mcq answer ids, exactly three discrepancy refs, actions by ref, corrected_balance and optional unsafe_actions. Amounts use signed debits/credits as explained in your instructions. Save a new immutable version after editing.</p>
      <form onSubmit={saveDraft} className="tta-admin-form">
        <label>Import a private package file
          <input type="file" accept="application/json,.json" onChange={importPackage} disabled={busy}/>
        </label>
        <p className="tta-admin-muted">Load a package kept outside this repository (for example under <code>private/assessments/</code>, which is git-ignored). Never paste live questions into a tracked file.</p>
        <label>Assessment package (JSON)
          <textarea value={packageJson} onChange={(e) => {setPackageJson(e.target.value);setDraftVersion('');}}
            rows={15} placeholder={'{\n  "slug": "ap-clerk-v1",\n  "client_name": "Talent Tree",\n  "title": "Accounts Payable Clerk Assessment",\n  "question_payload": { "questions": [], "scenario": {} },\n  "scoring_key": { "mcq": {}, "discrepancies": [], "actions": {}, "corrected_balance": 0 }\n}'} required />
        </label>
        <button type="submit" disabled={busy || !packageJson.trim()}>Save private draft</button>
      </form>
      {draftVersion && <section className="tta-admin-form" aria-label="Publishing approval">
        <p>Publishing makes this version available from its public assessment link. Do not approve synthetic tests as a real Talent Tree assessment.</p>
        <label><input type="checkbox" checked={contentApproved} onChange={e=>setContentApproved(e.target.checked)}/> The client-approved content and private marking key have been reviewed.</label>
        <label><input type="checkbox" checked={privacyApproved} onChange={e=>setPrivacyApproved(e.target.checked)}/> The privacy notice, retention period and employer disclosure have human approval.</label>
        <label>Approval reference<input value={approvalReference} onChange={e=>setApprovalReference(e.target.value)} maxLength={200} placeholder="Internal approval reference; no candidate information"/></label>
        <button type="button" onClick={publish} disabled={busy||!contentApproved||!privacyApproved||approvalReference.trim().length<8}>Publish approved version</button>
      </section>}
      <p className="tta-admin-muted">Publishing a new version does not change the questions already assigned to an existing attempt. The real assessment package must be prepared and approved privately first.</p>
    </section>}
  </main>;
}

export default function AssessmentAdmin() {
  const [signedIn, setSignedIn] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/assessment/admin/session', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json()).then((v) => { if (live) setSignedIn(!!v.loggedIn); })
      .catch(() => { if (live) setSignedIn(false); });
    return () => { live = false; };
  }, []);
  return <div className="tta-admin-page">
    <AdminHeader />
    {signedIn === null ? <main className="tta-admin-shell tta-admin-loading">Checking access…</main>
      : signedIn ? <Workspace onExpired={() => setSignedIn(false)} />
        : <Login onSuccess={() => setSignedIn(true)} />}
  </div>;
}// Flattens either breakdown shape into label/value rows. v1 breakdowns are flat numbers;
// battery-v2 breakdowns nest categories and sections.
function breakdownRows(b) {
  if (b && b.categories) {
    const cat = (c, label) => [label, `${c.earned} / ${c.max} points (${c.percent}%)`];
    return [
      cat(b.categories.knowledge, 'Knowledge'),
      cat(b.categories.reconciliation, 'Practical work'),
      ['Items correct', `${b.items_correct} / ${b.items_total}`],
      ...(b.sections || []).map((s) => [s.title, `${s.earned} / ${s.max} (${s.percent}%)`]),
    ];
  }
  return Object.entries(b || {}).map(([key, value]) => [key.replace(/_/g, ' '), String(value)]);
}


