import React, { useEffect, useMemo, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import { ReconciliationSpreadsheet } from './Spreadsheet.jsx';
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
        <span><strong>Talent Tree</strong><small>Assessment intelligence</small></span>
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
      await request('/api/admin/login', { login: true, method: 'POST', body: { key } });
      setKey('');
      onSuccess();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="tta-admin-login">
    <h1>Recruiter sign-in</h1>
    <p>Enter your existing Talent Tree admin key. Assessment results are private.</p>
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
      <span className="tta-admin-kicker">Talent Tree | Assessment evidence</span>
      <h1>{report.candidate.first_name} {report.candidate.surname}</h1>
      <p>{report.assessment.title} · {report.assessment.client_name}</p>
      <p className="tta-admin-muted">{report.candidate.email} · {formattedTime(a.started_at_ms)} · {a.status}</p>
    </div>
    <div className="tta-admin-score-row">
      <div><small>Overall</small><strong>{score == null ? 'Pending' : score + '/100'}</strong></div>
      <div><small>Technical knowledge</small><strong>{r?.knowledge_score ?? '—'}/40</strong></div>
      <div><small>Reconciliation</small><strong>{r?.reconciliation_score ?? '—'}/60</strong></div>
      <div><small>Duration</small><strong>{a.closed_at_ms ? Math.min(600, Math.max(0, Math.round((a.closed_at_ms - a.started_at_ms) / 1000))) + ' sec' : '—'}</strong></div>
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
        {Object.entries(r.breakdown).map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, ' ')}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>}
    <section className="tta-admin-panel">
      <h2>Technical knowledge — question review</h2>
      <div className="tta-admin-table-scroll"><table className="tta-admin-table">
        <thead><tr><th>Question</th><th>Candidate's answer</th><th>Expected answer</th><th>Outcome</th></tr></thead>
        <tbody>{(report.question_review || []).map((q, i) => <tr key={i}>
          <td>{q.prompt}</td><td>{q.chosen}</td><td>{q.expected}</td><td>{q.correct ? 'Correct' : 'Incorrect'}</td>
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
      <ReconciliationSpreadsheet scenario={report.assessment.scenario} cells={workbook} readOnly />
      <p className="tta-admin-muted">Last saved: {formattedTime(a.last_saved_at_ms)}</p>
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
  async function publish(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = JSON.parse(packageJson);
      const result = await request('publish', { method: 'POST', body: data });
      setMessage('Published private assessment ' + result.version_label + '. Live answers remain in D1, not GitHub.');
      setPackageJson('');
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
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
      <div className="tta-admin-table-scroll"><table className="tta-admin-table">
        <thead><tr><th>Candidate</th><th>Assessment</th><th>Started</th><th>Status</th><th>Overall</th><th>Recon</th><th>Report</th></tr></thead>
        <tbody>{visible.length ? visible.map((a) => <tr key={a.id}>
          <td><strong>{a.first_name} {a.surname}</strong><small>{a.email}</small></td>
          <td>{a.client_name}<small>{a.title}</small></td>
          <td>{formattedTime(a.started_at_ms)}</td><td>{a.status}</td>
          <td>{a.overall_score ?? '—'}</td><td>{a.reconciliation_score ?? '—'}</td>
          <td><button disabled={busy} className="tta-admin-textbutton" onClick={() => openReport(a.id)}>View</button></td>
        </tr>) : <tr><td colSpan={7}>No candidate attempts found.</td></tr>}</tbody>
      </table></div>
    </section>}
    {tab === 'invitations' && <section className="tta-admin-panel">
      <h2>Create candidate invitation</h2>
      <p>Invitations are individual and valid for seven days by default. A fresh invitation is needed for a retake.</p>
      <form onSubmit={invitation} className="tta-admin-form">
        <label>Published assessment
          <select value={selectedDefinition} onChange={(e) => setSelectedDefinition(e.target.value)} required>
            <option value="">Choose assessment</option>
            {records.definitions.filter((d) => d.status === 'published').map((d) =>
              <option value={d.id} key={d.id}>{d.client_name} — {d.title}</option>)}
          </select>
        </label>
        <label>Candidate email (recommended)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="candidate@example.com" />
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
      <h2>Publish a private assessment version</h2>
      <p>The assessment JSON must contain five technical questions, a practical scenario, and its private scoring key. This form saves the package directly to the protected assessment database. Never commit live answers in GitHub.</p>
      <form onSubmit={publish} className="tta-admin-form">
        <label>Assessment package (JSON)
          <textarea value={packageJson} onChange={(e) => setPackageJson(e.target.value)}
            rows={15} placeholder={'{\n  "slug": "saturc-ap",\n  "client_name": "SATURC",\n  "title": "Accounts Payable Competency Assessment",\n  "question_payload": { "questions": [], "scenario": {} },\n  "scoring_key": { "mcq": {}, "discrepancies": [], "actions": {}, "corrected_balance": 0 }\n}'} required />
        </label>
        <button type="submit" disabled={busy || !packageJson.trim()}>Validate and publish</button>
      </form>
      <p className="tta-admin-muted">Publishing a new version does not change the questions already assigned to an existing attempt. The real assessment package must be prepared and approved privately first.</p>
    </section>}
  </main>;
}

export default function AssessmentAdmin() {
  const [signedIn, setSignedIn] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store' })
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
}
