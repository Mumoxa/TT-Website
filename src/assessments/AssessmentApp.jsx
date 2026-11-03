import React, { useEffect, useRef, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import './assessment.css';

/**
 * Assessment UI primitives only — do not expose the route to candidates until
 * the server-side timer, D1, workbook scoring and admin reporting are complete.
 * This imports the same actual 2026 logo and site-wide CSS tokens as the live site.
 */
export function AssessmentFrame({ children, eyebrow = 'Candidate assessment', client = 'SATURC' }) {
  return (
    <div className="tta-page">
      <header className="tta-topbar">
        <div className="tta-shell tta-topbar-inner">
          <a className="tta-brand" href="/" aria-label="Talent Tree Consulting — homepage">
            <img className="tta-logo" src={talentTreeLogo} alt="Talent Tree Consulting" />
            <span className="tta-brand-copy"><strong>Talent Tree</strong><small>Niche skills · Executive search</small></span>
          </a>
          <span className="tta-topbar-context">{eyebrow} <span aria-hidden="true">/</span> {client}</span>
        </div>
      </header>
      {children}
      <footer className="tta-footer">
        <div className="tta-shell tta-footer-inner">
          <span>Talent Tree Consulting · Established 2013 · South Africa</span>
          <a href="mailto:hello@talenttree.co.za">Need assistance?</a>
        </div>
      </footer>
    </div>
  );
}

const cleanName = (value) => value.trim().replace(/\s+/g, ' ');

export function AssessmentWelcome({
  client = 'SATURC',
  assessmentTitle = 'Accounts Payable Competency Assessment',
  durationMinutes = 10,
  onStart,
  isStarting = false,
  error = '',
}) {
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const canStart = Boolean(
    onStart && !isStarting && cleanName(firstName).length >= 2 &&
    cleanName(surname).length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && consent
  );
  function handleSubmit(event) {
    event.preventDefault();
    if (!canStart) return;
    onStart({
      first_name: cleanName(firstName),
      surname: cleanName(surname),
      email: email.trim().toLowerCase(),
      consent_acknowledged: true,
    });
  }
  return (
    <AssessmentFrame client={client}>
      <main className="tta-shell tta-welcome-layout" id="main-content">
        <div className="tta-hero-copy">
          <div className="tta-kicker"><span className="tta-kicker-line" /> Talent Tree skills assessment</div>
          <h1>Welcome to your <em>assessment.</em></h1>
          <p className="tta-intro">
            You have been selected to complete the {assessmentTitle} for <strong>{client}</strong>.
            This short, practical exercise helps us understand how you work with supplier accounts and reconciliations.
          </p>
          <div className="tta-metrics" aria-label="Assessment information">
            <div><strong>{durationMinutes}:00</strong><span>Minutes</span></div>
            <div><strong>2</strong><span>Sections</span></div>
            <div><strong>1</strong><span>Practical workbook</span></div>
          </div>
          <div className="tta-instructions">
            <h2>Before you begin</h2>
            <ol>
              <li>You will answer applied Accounts Payable questions and complete a live spreadsheet reconciliation.</li>
              <li>The countdown begins only after you select <strong>Start assessment</strong>.</li>
              <li>Work is saved as you go. When time expires, the assessment closes automatically.</li>
              <li>Use a laptop or desktop computer where possible. Keep this page open and ensure your connection is stable.</li>
            </ol>
          </div>
        </div>
        <section className="tta-registration" aria-labelledby="tta-register-heading">
          <div className="tta-card-topline">Candidate registration <span>01 / 02</span></div>
          <h2 id="tta-register-heading">Your details</h2>
          <p>Enter the information your Talent Tree recruiter will use to identify your assessment.</p>
          <form onSubmit={handleSubmit}>
            <label htmlFor="tta-first-name">First name</label>
            <input id="tta-first-name" name="first_name" value={firstName}
              onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name"
              maxLength={100} required placeholder="Your first name" />
            <label htmlFor="tta-last-name">Surname</label>
            <input id="tta-last-name" name="surname" value={surname}
              onChange={(e) => setSurname(e.target.value)} autoComplete="family-name"
              maxLength={100} required placeholder="Your surname" />
            <label htmlFor="tta-email">Email address</label>
            <input id="tta-email" name="email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="email"
              maxLength={254} required placeholder="you@example.com" />
            <label className="tta-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I understand that Talent Tree will record my answers and assessment results for recruitment screening, and may share the report with the hiring client. I have read the privacy notice supplied with my invitation.</span>
            </label>
            {error && <p className="tta-error" role="alert">{error}</p>}
            <button className="tta-submit" type="submit" disabled={!canStart}>
              {isStarting ? 'Starting assessment…' : 'Start assessment'} <span aria-hidden="true">↗</span>
            </button>
            <p className="tta-form-note">The timer has not started. You cannot reset it once the assessment begins.</p>
          </form>
        </section>
      </main>
    </AssessmentFrame>
  );
}

/** Display-only clock. The backend MUST reject updates after expiresAt. */
export function AssessmentTimer({ expiresAt, onExpired }) {
  const expiryMs = Date.parse(expiresAt);
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, expiryMs - Date.now()));
  const didExpire = useRef(false);
  useEffect(() => {
    didExpire.current = false;
    const tick = () => {
      const ms = Math.max(0, expiryMs - Date.now());
      setRemainingMs(ms);
      if (ms === 0 && !didExpire.current) {
        didExpire.current = true;
        if (onExpired) onExpired();
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [expiryMs, onExpired]);
  const seconds = Math.ceil(remainingMs / 1000);
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return (
    <div className={'tta-timer' + (seconds <= 60 ? ' tta-timer-urgent' : '')}
      role="timer" aria-label={'Time remaining: ' + mins + ' minutes and ' + secs + ' seconds'}>
      <span className="tta-timer-label">Time remaining</span>
      <strong aria-hidden="true">{mins}:{secs}</strong>
    </div>
  );
}

export function AssessmentRunnerLayout({
  client = 'SATURC',
  candidateName,
  sectionLabel,
  sectionNumber = 1,
  totalSections = 2,
  expiresAt,
  onExpired,
  saveStatus = 'Saving automatically',
  children,
}) {
  return (
    <AssessmentFrame client={client} eyebrow="Live assessment">
      <main className="tta-shell tta-run-layout" id="main-content">
        <aside className="tta-run-meta" aria-label="Assessment progress">
          <span className="tta-kicker">Accounts Payable</span>
          <h1>Competency <em>assessment.</em></h1>
          <p>{candidateName}</p>
          <AssessmentTimer expiresAt={expiresAt} onExpired={onExpired} />
          <div className="tta-run-progress">
            <span>{sectionLabel}</span>
            <strong>Section {sectionNumber} of {totalSections}</strong>
            <div className="tta-progress-track" aria-hidden="true">
              <div style={{ width: String(Math.min(100, Math.max(0, sectionNumber / totalSections * 100))) + '%' }} />
            </div>
          </div>
          <p className="tta-save-status" role="status">{saveStatus}</p>
        </aside>
        <section className="tta-run-workspace" aria-label={sectionLabel}>{children}</section>
      </main>
    </AssessmentFrame>
  );
}

export function AssessmentComplete({ client = 'SATURC', timedOut = false, candidateName }) {
  return (
    <AssessmentFrame client={client} eyebrow="Assessment submitted">
      <main className="tta-shell tta-complete" id="main-content">
        <span className="tta-kicker">Submission received</span>
        <h1>{timedOut ? 'Your time has expired.' : 'Assessment complete.'}</h1>
        <p>{candidateName ? candidateName + ', your ' : 'Your '}
          {timedOut ? 'saved work' : 'assessment'} has been submitted.
          Talent Tree will review your results as part of the recruitment process.
        </p>
        <p className="tta-complete-note">You may now close this window. Your recruiter will contact you regarding next steps.</p>
      </main>
    </AssessmentFrame>
  );
}
