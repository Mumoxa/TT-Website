import React, { useEffect, useRef, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import './assessment.css';
import './candidate-ui.css';
import {useAssessmentCatalog} from './catalog-client.js';
import ScreeningFields, {emptyScreening} from './ScreeningFields.jsx';
import {normalizeScreening} from './screening.js';
import {AssessmentPractice} from './AssessmentPractice.jsx';

/**
 * Candidate-facing assessment UI. Behaviour (validation, Start payload, timer, autosave,
 * submission) is unchanged from the previous release; this file only changes presentation
 * and the two pieces of copy that previously hard-coded the assessment's shape.
 * The on-screen timer is display-only; the server-side timer enforces the deadline.
 */

/* Sticky navigation for the public catalogue (landing page). Transparent over the hero,
   becomes a dark glass bar after 16px of scroll (DESIGN.md, header & navigation). */
function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return (
    <header className={'ca-nav' + (scrolled ? ' is-scrolled' : '')}>
      <div className="ca-shell ca-nav-inner">
        <a className="ca-brand" href="/assessments" aria-label="Talent Tree assessments home">
          <img src={talentTreeLogo} alt="" width="42" height="42" />
          <span>Talent Tree<small>Assessments</small></span>
        </a>
        <nav aria-label="Assessments site">
          <a href="#assessments">Assessments</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faq">FAQ</a>
          <a className="ca-btn ca-btn--light ca-btn--sm ca-nav-cta" href="#assessments">Choose an assessment</a>
        </nav>
      </div>
    </header>
  );
}

export function AssessmentFrame({ children, eyebrow = 'Candidate assessment', client = '', title = '', timer, variant = 'default' }) {
  if (variant === 'landing') {
    return (
      <div className="tta-page ca-page ca-page--landing">
        <LandingNav />
        {children}
      </div>
    );
  }
  return (
    <div className={'tta-page ca-page' + (timer ? ' tta-page--runner' : '')}>
      <header className="tta-topbar ca-topbar">
        <div className="tta-shell tta-topbar-inner">
          <a className="tta-brand" href="/assessments" aria-label="Talent Tree assessments">
            <img className="tta-logo" src={talentTreeLogo} alt="Talent Tree Consulting" />
            <span>Talent Tree</span>
          </a>
          <div className="tta-topbar-context"><span>{title || eyebrow}</span>{client && <small>{client}</small>}</div>
          {timer}
        </div>
      </header>
      {children}
    </div>
  );
}

function AssessmentPrivacyNotice() {
  return <section className="ca-privacy" aria-labelledby="tta-privacy-heading">
    <h2 id="tta-privacy-heading">How we use your information</h2>
    <p>Talent Tree Consulting collects your first name, surname, email address, contact number, South African ID number, earliest available start date, travel and availability details. We use them to assess your practical accounting skills for this assignment and to arrange your start if you are selected.</p>
    <p>Recruiters at Talent Tree see these details. We retain your assessment results and attempt history. Your ID number is used to link your attempts and is masked in reports.</p>
    <p>You can ask us to see, correct or delete your information at <a href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a>.</p>
    <p>Ticking the box below means you agree to this processing.</p>
  </section>;
}
const cleanName = value => value.trim().replace(/\s+/g, ' ');

export function AssessmentWelcome({client='',assessmentTitle='Assessment',durationMinutes=10,sectionTitles,itemCount,onStart,isStarting=false,error=''}) {
  const catalogue=useAssessmentCatalog(!sectionTitles);
  const matching=catalogue.assessments.find(item=>item.title===assessmentTitle && item.client_name===client);
  const sections=sectionTitles || matching?.section_titles || ['Technical knowledge','Practical reconciliation'];
  const activities = itemCount ?? matching?.item_count;
  const [view,setView]=useState('welcome');
  const [firstName,setFirstName]=useState(''),[surname,setSurname]=useState(''),[email,setEmail]=useState('');
  const [consent,setConsent]=useState(false),[screening,setScreening]=useState(emptyScreening),[validation,setValidation]=useState('');
  const canStart=Boolean(onStart && !isStarting && cleanName(firstName).length>=2 && cleanName(surname).length>=2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && consent);
  function handleSubmit(event) {
    event.preventDefault();if(!canStart)return;
    try {const normalized=normalizeScreening(screening);setValidation('');onStart({...normalized,first_name:cleanName(firstName),surname:cleanName(surname),email:email.trim().toLowerCase(),consent_acknowledged:true});}
    catch(e){setValidation(e.message);}
  }
  if(view==='practice')return <AssessmentFrame><AssessmentPractice onContinue={()=>setView('form')} onBack={()=>setView('welcome')}/></AssessmentFrame>;
  return <AssessmentFrame client={client}>
    <main className="ca-welcome" id="main-content">
      <div className="ca-welcome-intro">
        <h1>{assessmentTitle}</h1>
        <dl className="ca-facts">
          <div><dt>Time</dt><dd>{durationMinutes} min</dd></div>
          <div><dt>Sections</dt><dd>{sections.length}</dd></div>
          {activities!=null && <div><dt>Questions</dt><dd>{activities}</dd></div>}
        </dl>
        <section aria-labelledby="ca-expect-heading">
          <h2 id="ca-expect-heading">What to expect</h2>
          <ul className="ca-checklist">
            <li>The timer starts when you press Start. It keeps running if you reload or close the page.</li>
            <li>Choose answers, and use the workbook for calculations. Formulas such as =SUM(B2:B5) work.</li>
            <li>Answers save automatically. You see your results when you submit.</li>
            <li>Use a laptop or desktop and have your ID number ready.</li>
          </ul>
        </section>
      </div>
      <section className="tta-registration ca-registration ca-panel" aria-label={view==='form'?'Candidate details':'Before starting'}>
        {!onStart ? <><p role="status">Choose an assessment to begin.</p><a className="ca-link" href="/assessments">View assessments <span aria-hidden="true">→</span></a></> : view==='welcome' ? <>
          <div className="ca-welcome-actions">
            <button className="ca-btn ca-btn--primary" type="button" onClick={()=>setView('form')}>Continue to details</button>
            <button className="ca-btn ca-btn--quiet" type="button" onClick={()=>setView('practice')}>Try the practice</button>
          </div>
          <p className="tta-form-note">Practice has three untimed questions. It is not scored or saved.</p>
          <AssessmentPrivacyNotice/>
          {error && <p className="tta-error" role="alert">{error}</p>}
        </> : <>
          <h2>Your details</h2>
          <button className="ca-link tta-practice-link" type="button" onClick={()=>setView('practice')}>Try the practice</button>
          <form onSubmit={handleSubmit}>
            <label htmlFor="tta-first-name">First name</label><input id="tta-first-name" value={firstName} onChange={e=>setFirstName(e.target.value)} autoComplete="given-name" maxLength={100} required/>
            <label htmlFor="tta-last-name">Surname</label><input id="tta-last-name" value={surname} onChange={e=>setSurname(e.target.value)} autoComplete="family-name" maxLength={100} required/>
            <label htmlFor="tta-email">Email address</label><input id="tta-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" maxLength={254} required/>
            <ScreeningFields value={screening} onChange={setScreening}/>
            <AssessmentPrivacyNotice/>
            <label className="tta-consent"><input type="checkbox" checked={consent} required onChange={e=>setConsent(e.target.checked)}/><span>I agree to this processing.</span></label>
            {(validation||error) && <p className="tta-error" role="alert">{validation||error}</p>}
            <button className="ca-btn ca-btn--primary ca-btn--block" type="submit" disabled={!canStart}>{isStarting?'Starting assessment…':'Start assessment'} <span className="ca-arrow" aria-hidden="true">↗</span></button>
            <p className="tta-form-note">The timer has not started. You cannot reset it once the assessment begins.</p>
          </form>
        </>}
      </section>
    </main>
  </AssessmentFrame>;
}

/** Display-only clock. The backend MUST reject updates after expiresAt. */
export function AssessmentTimer({ expiresAt, onExpired }) {
  const expiryMs = Date.parse(expiresAt);
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, expiryMs - Date.now()));
  const didExpire = useRef(false);
  const expiryCallback=useRef(onExpired);expiryCallback.current=onExpired;
  useEffect(() => {
    didExpire.current = false;
    const initialRemaining=Math.max(0,expiryMs-Date.now());
    const anchor=performance.now();
    const tick = () => {
      const ms = Math.max(0, initialRemaining-(performance.now()-anchor));
      setRemainingMs(ms);
      if (ms === 0 && !didExpire.current) {
        didExpire.current = true;
        expiryCallback.current?.();
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [expiryMs]);
  const seconds = Math.ceil(remainingMs / 1000);
  const [announcement, setAnnouncement] = useState('');
  const lastMinute = useRef(null);
  useEffect(() => {
    const minute = Math.ceil(seconds / 60);
    if (lastMinute.current !== null && minute < lastMinute.current && minute > 0) {
      setAnnouncement(minute === 1 ? 'One minute remaining. This is the final minute.' : minute + ' minutes remaining.');
    }
    lastMinute.current = minute;
  }, [seconds]);
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return (
    <div className={'tta-timer' + (seconds <= 60 ? ' tta-timer-urgent' : '')}
      role="timer" aria-label={'Time remaining: ' + mins + ' minutes and ' + secs + ' seconds'}>
      <span className="tta-timer-label">Time remaining</span>
      <strong aria-hidden="true">{mins}:{secs}</strong>
      <span className="tta-sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
    </div>
  );
}

export function AssessmentRunnerLayout({
  client = '',
  candidateName,
  assessmentTitle = 'Assessment',
  sectionLabel,
  sectionNumber = 1,
  totalSections = 2,
  expiresAt,
  onExpired,
  saveStatus = 'Saving automatically',
  progress: activityProgress = null,
  children,
}) {
  const sectionPercent = Math.min(100, Math.max(0, sectionNumber / totalSections * 100));
  const activityPercent = activityProgress && activityProgress.total ? Math.round(activityProgress.answered / activityProgress.total * 100) : 0;
  return (
    <AssessmentFrame client={client} title={assessmentTitle} eyebrow="Live assessment" timer={<AssessmentTimer expiresAt={expiresAt} onExpired={onExpired} />}>
      <main className="ca-runner" id="main-content">
        <aside className="ca-runner-side" aria-label="Assessment progress">
          <h1 className="tta-sr-only">{assessmentTitle}</h1>
          <p className="ca-candidate">{candidateName}</p>
          {activityProgress ? (
            <div className="ca-progress">
              <span>{activityProgress.sections} sections · {activityProgress.total} activities</span>
              <strong>Answered {activityProgress.answered} of {activityProgress.total}</strong>
              <div className="ca-progress-track" aria-hidden="true"><div style={{ width: activityPercent + '%' }} /></div>
            </div>
          ) : (
            <div className="ca-progress">
              <span>{sectionLabel}</span>
              <strong>Section {sectionNumber} of {totalSections}</strong>
              <div className="ca-progress-track" aria-hidden="true"><div style={{ width: sectionPercent + '%' }} /></div>
            </div>
          )}
          <p className="ca-save" role="status">{saveStatus}</p>
        </aside>
        <section className="ca-runner-main" aria-label={sectionLabel}>{children}</section>
      </main>
    </AssessmentFrame>
  );
}

export function AssessmentComplete({ client = '', timedOut = false, candidateName, result, attemptNumber=1 }) {
  const sections = result?.sections || [];
  return (
    <AssessmentFrame client={client} eyebrow="Assessment submitted">
      <main className="ca-complete" id="main-content">
        <div className="ca-shell ca-complete-grid">
          <header className="ca-complete-head ca-enter">
            <p className="ca-eyebrow">Submission received</p>
            <h1>{timedOut ? 'Your time has expired.' : 'Assessment complete.'}</h1>
            <p className="ca-lead">{candidateName ? candidateName + ', your ' : 'Your '}
              {timedOut ? 'saved work' : 'assessment'} has been submitted. Talent Tree will review your results as part of the recruitment process.
            </p>
            <ul className="ca-complete-meta">
              <li>Attempt {attemptNumber}</li>
              <li>{client || 'Talent Tree'}</li>
            </ul>
          </header>

          {result ? (
            <section className="ca-result-card" aria-labelledby="ca-results-heading">
              <div className="ca-result-hero">
                <p className="ca-score-label">Overall score</p>
                <p className="ca-score"><strong>{result.overall_score}</strong> <span>/ 100</span></p>
              </div>
              <h2 id="ca-results-heading">Your assessment results</h2>
              <ul className="ca-result-sections">
                {sections.map((section, index) => {
                  const percent = Math.max(0, Math.min(100, Number(section.percentage) || 0));
                  return (
                    <li key={index}>
                      <div className="ca-result-head"><h3>{section.title}</h3><strong>{percent}%</strong></div>
                      <div className="ca-bar" role="img" aria-label={section.title + ': ' + percent + ' percent'}><span style={{ width: percent + '%' }} /></div>
                      <p>{section.feedback}</p>
                    </li>
                  );
                })}
              </ul>
              <p className="ca-result-caveat">{result.caveat}</p>
            </section>
          ) : (
            <p role="status" className="ca-state">Your results are being prepared. Reload this page to check again.</p>
          )}

          <aside className="ca-complete-side" aria-label="Next steps">
            <h2>What happens next</h2>
            <p>Your recruiter will contact you regarding next steps. You may now close this window.</p>
            <p>Need to try again? Open the assessment from the catalogue and start a new attempt. Each attempt is recorded and numbered.</p>
            <a className="ca-btn ca-btn--quiet ca-btn--block" href="/assessments">Back to assessments</a>
          </aside>
        </div>
      </main>
    </AssessmentFrame>
  );
}
