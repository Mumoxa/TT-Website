import { DEFAULT_ASSESSMENT_SECONDS } from '../../functions/lib/assessment-deadlines.js';
import React, { useEffect, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import { ReconciliationSpreadsheet } from './Spreadsheet.jsx';
import { Workbook } from './Workbook.jsx';
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

function ResultReport({ report, onBack }) {
  const r = report.result, a = report.attempt;
  const score = r?.overall_score;
  function printReport() { window.print(); }
  const workbook = report.responses?.workbook || {};
  return <article className="tta-admin-report">
    <div className="tta-admin-action-row no-print">
      <button onClick={onBack} className="tta-admin-outline">← All results</button>
      <button onClick={printReport}>Print / Save PDF</button>
    </div>
    <div className="tta-admin-report-heading">
      <img className="tta-report-logo" src={talentTreeLogo} alt="Talent Tree Consulting"/>
      <span className="tta-admin-kicker">Talent Tree | Assessment evidence</span>
      <h1>{report.candidate.first_name} {report.candidate.surname}</h1>
      <p>{report.assessment.title} · {report.assessment.client_name}</p>
      <p>Attempt {a.attempt_number||1}</p>
      <p className="tta-admin-muted">{report.candidate.email} · {formattedTime(a.started_at_ms)} · {a.status}</p>
    </div>
    <section className="tta-admin-panel"><h2>Screening details</h2>
      <dl className="tta-admin-score-breakdown">{[
        ['Contact number',report.screening?.contact_number_masked],['South African ID number',report.screening?.id_number_masked],['Earliest start date',report.screening?.earliest_start_date],['First day confirmed',report.screening?.first_day_confirmed==null?'Not recorded':(report.screening.first_day_confirmed?'Yes':'No')],['Travel mode',report.screening?.travel_mode?.replace(/_/g,' ')],['Route description',report.screening?.travel_description],['Own transport',report.screening?.own_transport],['Available for a 2-month assignment',report.screening?.assignment_available],['Availability note',report.screening?.assignment_note]
      ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not recorded'}</dd></div>)}</dl>
    </section>
    <div className="tta-admin-score-row">
      <div><small>Overall</small><strong>{score == null ? 'Pending' : score + '/100'}</strong></div>
      <div><small>Technical knowledge</small><strong>{r?.knowledge_score ?? '—'}/40</strong></div>
      <div><small>Reconciliation</small><strong>{r?.reconciliation_score ?? '—'}/60</strong></div>
      <div><small>Duration</small><strong>{a.closed_at_ms ? Math.min(DEFAULT_ASSESSMENT_SECONDS, Math.max(0, Math.round((a.closed_at_ms - a.started_at_ms) / 1000))) + ' sec' : '—'}</strong></div>
    </div>
    <section className="tta-admin-panel">
      <h2>Assessment interpretation</h2>
      <p>{r?.interpretation || 'The assessment has not yet been scored.'}</p>
      <p className="tta-admin-muted">A timed work sample is screening evidence, not independent proof of full-function AP competence. Verify practical experience, Sage 300 usage and references.</p>
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
      <h2>Technical knowledge — question review</h2>
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
    <section className="tta-admin-panel">
      <h2>Candidate's reconciliation decisions</h2>
      <p>Selected discrepancy references: {(report.responses.structured?.discrepancies || []).join(', ') || 'None recorded'}</p>
      <p>Corrective actions:</p>
      <dl className="tta-admin-score-breakdown">
        {Object.entries(report.responses.structured?.actions || {}).map(([ref, value]) => <div key={ref}><dt>{ref}</dt><dd>{report.assessment.scenario?.action_options?.find((o) => o.id === value)?.text || value}</dd></div>)}
      </dl>
      <p>Entered corrected balance: R{report.responses.structured?.corrected_balance ?? '—'}</p>
    </section>
    <section className="tta-admin-panel">
      <h2>Saved spreadsheet working</h2>
      <p className="tta-admin-muted">Read-only replay of the candidate's last saved cells and formulas; source tabs are reconstructed from the published assessment scenario.</p>
      {report.assessment.format === 'battery-v2'
        ? <Workbook sheets={report.assessment.sheets || null} source={report.workbook_source || {}} cells={workbook} readOnly />
        : <ReconciliationSpreadsheet scenario={report.assessment.scenario} cells={workbook} readOnly />}
      <p className="tta-admin-muted">Last saved: {formattedTime(a.last_saved_at_ms)} · {report.workbook_save_history?.length || 0} saved workbook revisions</p>
      {!!report.workbook_save_history?.length && <details className="tta-admin-save-history">
        <summary>View saved revision timeline</summary>
        <ol>{report.workbook_save_history.map((rev) => <li key={rev.revision}>Revision {rev.revision} — {formattedTime(rev.saved_at_ms)}</li>)}</ol>
      </details>}
    </section>
    <section className="tta-admin-panel">
      <h2>Saved cells and formulas</h2>
      <p>Raw entries and independently recalculated values. Empty cells are omitted; source copies remain editable working only.</p>
      <table className="tta-admin-evidence"><thead><tr><th>Cell</th><th>Saved entry / formula</th><th>Calculated value</th></tr></thead><tbody>
        {Object.entries(workbook).filter(([,value])=>value!=='').map(([ref,value])=><tr key={ref}><th>{ref}</th><td>{value}</td><td>{report.workbook_values?.[ref]}</td></tr>)}
      </tbody></table>
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
      setActiveReport(await request('report/' + encodeURIComponent(id)));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const visible = records.attempts.filter((a) =>
    [a.first_name, a.surname, a.email, a.client_name, a.title].join(' ').toLowerCase().includes(search.toLowerCase()));

  if (activeReport) return <main className="tta-admin-shell">
    <ResultReport report={activeReport} onBack={() => { setActiveReport(null); void load(); }} />
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
          <td><span className="tta-mobile-label" aria-hidden="true">Attempt</span>{a.attempt_number||1}</td>
          <td><span className="tta-mobile-label" aria-hidden="true">Status</span>{a.status}</td>
          <td><span className="tta-mobile-label" aria-hidden="true">Score</span>{a.overall_score ?? '—'}</td>
          <td><span className="tta-mobile-label" aria-hidden="true">Started</span>{formattedTime(a.started_at_ms)}</td>
          <td><button disabled={busy} className="tta-admin-textbutton" onClick={() => openReport(a.id)}>View</button></td>
        </tr>) : <tr><td colSpan={6}>No candidate attempts found.</td></tr>}</tbody>
      </table></div>
    </section>}
    {tab === 'invitations' && <section className="tta-admin-panel">
      <h2>Create candidate invitation</h2>
      <p>Invitations are individual and valid for seven days by default. Candidates can also start from the public assessment link. Repeat attempts are numbered, and each ID number can start at most 3 times.</p>
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
      cat(b.categories.reconciliation, 'Practical reconciliation'),
      ['Items correct', `${b.items_correct} / ${b.items_total}`],
      ...(b.sections || []).map((s) => [s.title, `${s.earned} / ${s.max} (${s.percent}%)`]),
    ];
  }
  return Object.entries(b || {}).map(([key, value]) => [key.replace(/_/g, ' '), String(value)]);
}


