import React, { useEffect, useRef, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import './assessment.css';
import {useAssessmentCatalog} from './catalog-client.js';
import ScreeningFields, {emptyScreening} from './ScreeningFields.jsx';
import {normalizeScreening} from './screening.js';
import {AssessmentPractice} from './AssessmentPractice.jsx';

/**
 * Assessment UI primitives only — do not expose the route to candidates until
 * the server-side timer, D1, workbook scoring and admin reporting are complete.
 * This imports the same actual 2026 logo and site-wide CSS tokens as the live site.
 */
export function AssessmentFrame({ children, eyebrow = 'Candidate assessment', client = '', title = '', timer }) {
  return (
    <div className={'tta-page' + (timer ? ' tta-page--runner' : '')}>
      <header className="tta-topbar">
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
  return <section className="tta-privacy-notice" aria-labelledby="tta-privacy-heading">
    <h2 id="tta-privacy-heading">Before you start</h2>
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
    <main className="tta-shell tta-welcome-layout" id="main-content">
      <div className="tta-hero-copy">
        <div className="tta-kicker"><span className="tta-kicker-line"/> Talent Tree skills assessment</div>
        <h1>{assessmentTitle}</h1>
        <p className="tta-intro">A practical assessment of your skills. Read the instructions before you begin.</p>
        <dl className="tta-metrics"><div><dt>Duration</dt><dd>{durationMinutes} minutes</dd></div><div><dt>Sections</dt><dd>{sections.length}</dd></div>{(itemCount??matching?.item_count)!=null && <div><dt>Activities</dt><dd>{itemCount??matching.item_count}</dd></div>}</dl>
        <section className="tta-instructions"><h2>What to expect</h2>
          <p>10 minutes, timed. The timer starts only when you press Start and continues if you reload.</p>
          <p>Two parts: accounting questions (single and multiple choice) and a practical workbook where you calculate with formulas, for example =SUM(B2:B5) or =VLOOKUP(...).</p>
          <p>Answers save automatically. You cannot pause or restart. Repeat attempts are recorded separately and numbered.</p>
          <p>You will see your results when you submit. The Talent Tree recruiter will contact you about next steps.</p>
          <p>What to have ready: a desktop or laptop, a stable connection, and your ID number. No documents need uploading.</p>
          <ol>{sections.map((title,index)=><li key={index}>{title}</li>)}</ol>
        </section>
      </div>
      <section className="tta-registration" aria-label={view==='form'?'Candidate details':'Before starting'}>
        <AssessmentPrivacyNotice/>
        {!onStart ? <><p role="status">Choose an assessment to begin.</p><a className="tta-text-link" href="/assessments">View assessments</a></> : view==='welcome' ? <>
          <h2>Try the formats first</h2><p>Three public practice items give immediate feedback. Practice is not scored or saved, and the timer stays off.</p>
          <button className="tta-submit" onClick={()=>setView('practice')}>Try the practice <span aria-hidden="true">→</span></button>
          <button className="tta-text-link tta-practice-link" onClick={()=>setView('form')}>Continue to details</button>
          {error && <p className="tta-error" role="alert">{error}</p>}
        </> : <>
          <div className="tta-card-topline">Candidate details</div><h2>Your details</h2>
          <button className="tta-text-link tta-practice-link" type="button" onClick={()=>setView('practice')}>Try the practice</button>
          <form onSubmit={handleSubmit}>
            <label htmlFor="tta-first-name">First name</label><input id="tta-first-name" value={firstName} onChange={e=>setFirstName(e.target.value)} autoComplete="given-name" maxLength={100} required/>
            <label htmlFor="tta-last-name">Surname</label><input id="tta-last-name" value={surname} onChange={e=>setSurname(e.target.value)} autoComplete="family-name" maxLength={100} required/>
            <label htmlFor="tta-email">Email address</label><input id="tta-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" maxLength={254} required/>
            <ScreeningFields value={screening} onChange={setScreening}/>
            <label className="tta-consent"><input type="checkbox" checked={consent} required onChange={e=>setConsent(e.target.checked)}/><span>I agree to this processing.</span></label>
            {(validation||error) && <p className="tta-error" role="alert">{validation||error}</p>}
            <button className="tta-submit" type="submit" disabled={!canStart}>{isStarting?'Starting assessment…':'Start assessment'} <span aria-hidden="true">↗</span></button>
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
  children,
}) {
  return (
    <AssessmentFrame client={client} title={assessmentTitle} eyebrow="Live assessment" timer={<AssessmentTimer expiresAt={expiresAt} onExpired={onExpired} />}>
      <main className="tta-shell tta-run-layout" id="main-content">
        <aside className="tta-run-meta" aria-label="Assessment progress">
          <span className="tta-kicker">In progress</span>
          <h1>{assessmentTitle}</h1>
          <p>{candidateName}</p>
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

export function AssessmentComplete({ client = '', timedOut = false, candidateName, result, attemptNumber=1 }) {
  return (
    <AssessmentFrame client={client} eyebrow="Assessment submitted">
      <main className="tta-shell tta-complete" id="main-content">
        <span className="tta-kicker">Submission received</span>
        <h1>{timedOut ? 'Your time has expired.' : 'Assessment complete.'}</h1>
        <p>{candidateName ? candidateName + ', your ' : 'Your '}
          {timedOut ? 'saved work' : 'assessment'} has been submitted.
          Talent Tree will review your results as part of the recruitment process.
        </p>
        {result ? <section className="tta-candidate-results" aria-label="Your assessment results">
          <h2>Your assessment results</h2><p>Attempt {attemptNumber}</p><p className="tta-result-overall">{result.overall_score} <span>/ 100</span></p>
          {result.sections.map((section,index)=><article key={index}><h3>{section.title} <span>{section.percentage}%</span></h3><p>{section.feedback}</p></article>)}
          <p className="tta-result-caveat">{result.caveat}</p>
        </section> : <p role="status">Your results are being prepared. Reload this page to check again.</p>}
        <p className="tta-complete-note">You may now close this window. Your recruiter will contact you regarding next steps.</p>
      </main>
    </AssessmentFrame>
  );
}
