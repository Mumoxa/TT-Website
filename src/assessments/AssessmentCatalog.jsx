import React from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import {AssessmentFrame} from './AssessmentApp.jsx';
import CandidateAssessment from './CandidateAssessment.jsx';
import {useAssessmentCatalog} from './catalog-client.js';

const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);
const ICONS = {
  sections: <Icon><path d="M4 6h16M4 12h10M4 18h7" /><circle cx="19" cy="12" r="2" /></Icon>,
  workbook: <Icon><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M3 14h18M9 4v16M15 4v16" /></Icon>,
  practice: <Icon><path d="M5 12l4 4 10-10" /></Icon>,
  autosave: <Icon><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></Icon>,
  timer: <Icon><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></Icon>,
  results: <Icon><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Icon>,
};

const FEATURES = [
  { icon: 'sections', title: 'Shows the scope up front', body: 'Each assessment lists its time, format and number of questions before you enter any details.' },
  { icon: 'workbook', title: 'Explains the format', body: 'Assessments can include questions, practical tasks or questionnaires. Check the instructions for the one you choose.' },
  { icon: 'practice', title: 'Offers practice where available', body: 'Where an assessment has practice items, try them before you start. Practice is never scored or saved.' },
  { icon: 'autosave', title: 'Saves your work as you go', body: 'Saved answers can be recovered if you reload or reconnect.' },
  { icon: 'timer', title: 'Shows timing before you start', body: 'Read the instructions first. If your assessment has a timer, it starts when you confirm and cannot be paused.' },
  { icon: 'results', title: 'Sends your work to our recruiters', body: 'Talent Tree recruiters review your assessment with your application. Some assessments also show you a summary when you finish.' },
];

const FAQS = [
  ['Do I need an invitation?', 'No. Open an assessment, read its instructions and start when you are ready. If a recruiter sent you a link, that link still works.'],
  ['How long does an assessment take?', 'The time and instructions are shown on each assessment’s own page.'],
  ['Does my result decide whether I get the job?', 'An assessment is one source of information. Recruiters can consider it alongside your experience, references and conversations with you.'],
  ['Can I pause or restart?', 'A running timer cannot be paused. Check the assessment instructions for its time and attempt limits; saved answers can be recovered after a reload.'],
  ['Can I take an assessment again?', 'Each assessment states how many times it can be taken with one ID number. Every start counts, so begin when you are ready.'],
  ['Who sees my answers?', 'The privacy notice for each assessment explains what information is collected and who can receive it.'],
  ['What should I have ready?', 'A stable connection and your South African ID number. Check the assessment instructions for any other requirements or permitted materials.'],
  ['How do I ask about my information?', 'Email hello@talenttree.co.za to see, correct or delete it.'],
];

function Hero({ status, assessments }) {
  // At most four rows, so the hero stays one screen however many assessments are open.
  const open = status === 'ready' ? assessments : [];
  const shown = open.slice(0, 4), more = open.length - shown.length;
  return (
    <section className="ca-hero" aria-labelledby="ca-hero-title">
      <div className="ca-shell ca-hero-grid">
        <div className="ca-enter">
          <p className="ca-eyebrow">Talent Tree · Candidate assessments</p>
          <h1 id="ca-hero-title">Assessments <em>for candidates.</em></h1>
          <p className="ca-lead">Explore the assessments available through Talent Tree. Each one has its own purpose, format and instructions, so you can prepare before you begin.</p>
          <div className="ca-hero-actions">
            <a className="ca-btn ca-btn--light" href="#assessments">See the assessments <span className="ca-arrow" aria-hidden="true">→</span></a>
            <a className="ca-btn ca-btn--ghost-dark" href="#how-it-works">See how it works</a>
          </div>
          <p className="ca-hero-note">Specialist recruiters in South Africa since 2013. No invitation needed.</p>
        </div>
        <div className="ca-glass ca-glass-card ca-enter" aria-labelledby="ca-open-heading">
          <h2 id="ca-open-heading">Open now</h2>
          {shown.length
            ? shown.map((item) => (
              <a className="ca-glass-row ca-glass-link" key={item.slug} href={'/assessments/' + encodeURIComponent(item.slug)}>
                <span>{item.kind === 'personality' ? 'Questionnaire' : 'Skills assessment'}</span>
                <strong>{item.title}</strong>
              </a>
            ))
            : <div className="ca-glass-row"><span>{status === 'loading' ? 'Loading' : 'Assessments'}</span><strong>{status === 'loading' ? 'One moment…' : 'See the list below'}</strong></div>}
          {more > 0 && <a className="ca-glass-row ca-glass-link" href="#assessments"><span>And more</span><strong>{more} more open</strong></a>}
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <section className="ca-trust" aria-label="Why candidates can trust these assessments">
      <ul className="ca-shell ca-trust-list">
        <li><strong>Blue-chip employers</strong><span>We recruit for leading companies across South Africa, and have since 2013.</span></li>
        <li><strong>Clear instructions</strong><span>Review the format and timing for each assessment before you start.</span></li>
        <li><strong>Privacy information</strong><span>Read how your information is handled before you begin.</span></li>
        <li><strong>Saved as you go</strong><span>Your saved answers can be recovered after a reload or reconnection.</span></li>
      </ul>
    </section>
  );
}

function CatalogueSection({ status, assessments }) {
  let body;
  if (status === 'loading') {
    body = <p className="ca-state" role="status">Loading assessments…</p>;
  } else if (status !== 'ready') {
    body = <div className="ca-state" role="alert"><p>Assessments could not be loaded. Please try again.</p><a className="ca-link" href={window.location.pathname}>Try again</a></div>;
  } else if (!assessments.length) {
    body = <div className="ca-state"><p role="status">No assessments are open right now.</p></div>;
  } else {
    body = <ul className="ca-cards" role="list">
      {assessments.map((item) => (
        <li key={item.slug}>
          <article className="ca-card">
            <p className="ca-card-client">{item.client_name}</p>
            <h3>{item.title}</h3>
            {item.kind === 'personality' ? <ul className="ca-chips">
              <li className="ca-chip">About {item.estimated_minutes || 10} minutes</li>
              <li className="ca-chip">{item.item_count} statements</li>
              <li className="ca-chip">No right or wrong answers</li>
            </ul> : <ul className="ca-chips">
              <li className="ca-chip">{item.duration_minutes} minutes, timed</li>
              <li className="ca-chip">{item.section_titles.length} sections</li>
              <li className="ca-chip">{item.item_count} questions</li>
            </ul>}
            <div className="ca-card-foot">
              <span>{item.kind === 'personality' ? 'Self-description questionnaire' : 'View details and instructions'}</span>
              <a className="ca-card-link" href={'/assessments/' + encodeURIComponent(item.slug)} aria-label={'Open ' + item.title}>Open <span className="ca-arrow" aria-hidden="true">→</span></a>
            </div>
          </article>
        </li>
      ))}
    </ul>;
  }
  return (
    <section className="ca-section" id="assessments" aria-labelledby="ca-assessments-heading">
      <div className="ca-shell">
        <div className="ca-section-head">
          <p className="ca-eyebrow">Assessments</p>
          <h2 id="ca-assessments-heading">Assessments open now</h2>
          <p>Each assessment shows its time, format and instructions before you start. Choose the one your recruiter asked for, or the one that fits the role.</p>
        </div>
        {body}
      </div>
    </section>
  );
}

/* The brand message and the disclaimer: assessments are a showcase, not a pass mark. */
function WhyWeAssess() {
  return (
    <section className="ca-section ca-section--tint" id="why" aria-labelledby="ca-why-heading">
      <div className="ca-shell ca-why">
        <div>
          <p className="ca-eyebrow">Why we assess</p>
          <h2 id="ca-why-heading" className="ca-why-title">More than one way to learn about you.</h2>
          <p className="ca-why-lead">Different assessments explore different things. Some ask you to work through practical tasks; others invite you to describe your own experiences or preferences.</p>
          <ul className="ca-points">
            <li><strong>Understand the purpose</strong><span>Each assessment explains what it asks you to do before you begin.</span></li>
            <li><strong>Consider the context</strong><span>Assessment responses are one part of a wider conversation about your application.</span></li>
          </ul>
        </div>
        <aside className="ca-promise" aria-labelledby="ca-promise-heading">
          <h3 id="ca-promise-heading">One part of the picture</h3>
          <p>Each assessment has a different purpose. A questionnaire describes your responses; it does not establish your abilities or suitability for a role.</p>
          <p>Your experience, references and conversations also provide important context.</p>
        </aside>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="ca-section" id="how-it-works" aria-labelledby="ca-features-heading">
      <div className="ca-shell">
        <div className="ca-section-head">
          <p className="ca-eyebrow">How it works</p>
          <h2 id="ca-features-heading">What to expect</h2>
          <p>Formats and requirements vary. Each assessment explains its own process before you begin.</p>
        </div>
        <div className="ca-features">
          {FEATURES.map((feature) => (
            <div className="ca-feature" key={feature.title}>
              <span className="ca-feature-icon">{ICONS[feature.icon]}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="ca-section ca-section--tint" id="faq" aria-labelledby="ca-faq-heading">
      <div className="ca-shell">
        <div className="ca-section-head">
          <p className="ca-eyebrow">FAQ</p>
          <h2 id="ca-faq-heading">Questions before you start</h2>
          <p>Still unsure? Email <a className="ca-link" href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a>.</p>
        </div>
        <div className="ca-faq">
          {FAQS.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary>{question}<span className="ca-faq-mark" aria-hidden="true" /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="ca-cta" aria-labelledby="ca-cta-heading">
      <div className="ca-shell ca-cta-grid">
        <div>
          <h2 id="ca-cta-heading">Ready to explore?</h2>
          <p>Choose an assessment, read its instructions and begin when you are ready. Questions? Email <a className="ca-link" href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a>.</p>
        </div>
        <div>
          <a className="ca-btn ca-btn--light" href="#assessments">See the assessments <span className="ca-arrow" aria-hidden="true">→</span></a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="ca-footer">
      <div className="ca-shell">
        <div className="ca-footer-grid">
          <div>
            <p className="ca-brand" style={{ marginBottom: 14 }}>
              <img src={talentTreeLogo} alt="" width="42" height="42" />
              <span style={{ color: 'var(--paper-soft)' }}>Talent Tree</span>
            </p>
            <p>Recruitment for blue-chip companies across South Africa, since 2013.</p>
          </div>
          <nav aria-label="Footer">
            <h2>Assessments</h2>
            <ul>
              <li><a href="#assessments">Assessments open now</a></li>
              <li><a href="#why">Why we assess</a></li>
              <li><a href="#how-it-works">How it works</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </nav>
          <div>
            <h2>Contact</h2>
            <ul>
              <li><a href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a></li>
              <li><a href="https://talenttree.co.za">talenttree.co.za</a></li>
            </ul>
          </div>
        </div>
        <div className="ca-footer-base">
          <span>© {new Date().getFullYear()} Talent Tree</span>
          <span>Your details are handled under the privacy notice shown before you start.</span>
        </div>
      </div>
    </footer>
  );
}

function Landing({ status, assessments }) {
  return (
    <AssessmentFrame variant="landing">
      <main id="main-content">
        <Hero status={status} assessments={assessments} />
        <TrustStrip />
        <CatalogueSection status={status} assessments={assessments} />
        <WhyWeAssess />
        <Features />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </AssessmentFrame>
  );
}

export default function AssessmentCatalog({slug = ''}) {
  const {status, assessments} = useAssessmentCatalog(true, slug);
  const selected = assessments.find(item => item.slug === slug);

  if (slug) {
    if (status !== 'ready') return <AssessmentFrame>
      <main className="ca-welcome ca-state-page" id="main-content">
        {status === 'loading'
          ? <p role="status">Loading assessments…</p>
          : <div role="alert"><p>Assessments could not be loaded. Please try again.</p><a className="ca-link" href={window.location.pathname}>Try again</a></div>}
      </main>
    </AssessmentFrame>;
    if (!selected) return <AssessmentFrame>
      <main className="ca-welcome ca-state-page" id="main-content">
        <h1>Assessment unavailable</h1>
        <p role="status">This assessment is not open right now.</p>
        <a className="ca-link" href="/assessments">View assessments <span aria-hidden="true">→</span></a>
      </main>
    </AssessmentFrame>;
    return <CandidateAssessment catalogItem={selected} />;
  }

  return <Landing status={status} assessments={assessments} />;
}
