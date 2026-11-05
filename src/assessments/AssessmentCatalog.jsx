import React, { useEffect, useRef } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import {AssessmentFrame} from './AssessmentApp.jsx';
import CandidateAssessment from './CandidateAssessment.jsx';
import {useAssessmentCatalog} from './catalog-client.js';

/* Scroll reveal: an element fades up once it is 12% visible. Reduced motion and browsers
   without IntersectionObserver show content immediately. */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-in');
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { node.classList.add('is-in'); observer.disconnect(); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useReveal();
  return (
    <Tag ref={ref} className={('ca-reveal ' + className).trim()} style={delay ? { '--ca-delay': delay + 'ms' } : undefined} {...rest}>
      {children}
    </Tag>
  );
}

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
  { icon: 'sections', title: 'Sections you can see first', body: 'Each welcome page lists the sections and number of activities, so you know the scope before the timer starts.' },
  { icon: 'workbook', title: 'Practical tasks with workplace documents', body: 'Read documents such as a supplier statement and a ledger, then type each answer in the box under the task. No spreadsheet skills are needed.' },
  { icon: 'practice', title: 'Practice before you start', body: 'Try the public practice items before you enter any details. Practice is not scored or saved, and the timer stays off.' },
  { icon: 'autosave', title: 'Answers save as you go', body: 'Changes save automatically. If you reload, your saved work returns and the timer keeps running.' },
  { icon: 'timer', title: 'A clear timer', body: 'You read the instructions first. The timer starts only when you click OK, and you cannot pause or restart an attempt once it has begun.' },
  { icon: 'results', title: 'Results when you submit', body: 'You see an overall score and a percentage for each section. There are no answer keys and no pass or fail label.' },
];

const BENEFITS = [
  { title: 'Know the scope before you start', body: 'The welcome page shows the time limit, the number of sections and the number of activities, so nothing is a surprise.' },
  { title: 'Practise the formats first', body: 'Public practice items show you how choosing and typing answers works. Practice is not scored or saved.' },
  { title: 'Results you can read', body: 'Your overall score and each section’s percentage are shown on screen. The results explain what was tested, not your overall ability.' },
  { title: 'Your privacy, stated plainly', body: 'The privacy notice sits before the form: who sees your details, that results and attempts are kept, and how to contact us.' },
];

const FAQS = [
  ['Do I need an invitation?', 'No. Open the assessment, read the instructions and start when you are ready. If you were sent an invitation link, that link still works.'],
  ['How long does it take?', 'Each assessment states its time limit on its welcome page. The timer starts only when you click OK after reading the instructions.'],
  ['Can I pause or restart?', 'No. Once you start, the timer runs. Your answers save automatically, and if you reload, your saved work returns with the timer still running.'],
  ['What do I see when I submit?', 'Your overall score and a percentage for each section. You do not see answer keys, and there is no pass or fail label.'],
  ['Who sees my answers and results?', 'Recruiters at Talent Tree. We retain your results and attempt history. Your ID number is used to link your attempts and is masked in reports.'],
  ['Can I take an assessment again?', 'Yes. Each repeat attempt is recorded separately and numbered, so earlier attempts are kept.'],
  ['What should I have ready?', 'A desktop or laptop, a stable connection and your South African ID number. You may use a calculator and scrap paper. No documents need uploading.'],
  ['Do I need spreadsheet or Excel skills?', 'No. Practical tasks show the documents you need on screen, and you type each answer in a box. Amounts can be typed with or without R, with spaces, commas or full stops, and you see how each answer was read.'],
  ['How do I ask about my information?', 'Email hello@talenttree.co.za to see, correct or delete it.'],
];

function Hero({ first }) {
  const glassRows = first
    ? [
        ['Duration', `${first.duration_minutes} minutes, timed`],
        ['Sections', String(first.section_titles.length)],
        ['Activities', String(first.item_count)],
      ]
    : [
        ['Timing', 'Timed, from when you click OK'],
        ['Format', 'Questions and practical tasks'],
        ['Results', 'Shown when you submit'],
      ];
  return (
    <section className="ca-hero" aria-labelledby="ca-hero-title">
      <div className="ca-shell ca-hero-grid">
        <div className="ca-enter">
          <p className="ca-eyebrow">Talent Tree · Candidate assessment</p>
          <h1 id="ca-hero-title">Practical skills assessments, <em>step by step.</em></h1>
          <p className="ca-lead">Answer short workplace questions and complete practical tasks using the documents on screen. Your answers save as you go, and you see your results when you submit.</p>
          <div className="ca-hero-actions">
            <a className="ca-btn ca-btn--light" href="#assessments">Choose an assessment <span className="ca-arrow" aria-hidden="true">→</span></a>
            <a className="ca-btn ca-btn--ghost-dark" href="#how-it-works">How it works</a>
          </div>
          <p className="ca-hero-note">No invitation is needed. Open an assessment, read the instructions and start when you are ready.</p>
        </div>
        <div className="ca-glass ca-glass-card ca-enter" aria-label="At a glance">
          <h2>At a glance</h2>
          {glassRows.map(([label, value]) => (
            <div className="ca-glass-row" key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
          <p className="ca-glass-foot">The figures above come from the published assessment, so they always match the welcome page.</p>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <section className="ca-trust" aria-label="Why candidates can trust this assessment">
      <ul className="ca-shell ca-trust-list">
        <li><strong>Specialist recruiters</strong><span>Talent Tree has been recruiting in South Africa since 2013.</span></li>
        <li><strong>The same for everyone</strong><span>Each candidate sees the same assessment, time limit and instructions.</span></li>
        <li><strong>Your ID number is masked</strong><span>Reports show a masked number. Our privacy notice is shown before you start.</span></li>
        <li><strong>Saved as you go</strong><span>Your answers save automatically, so a reload does not lose your work.</span></li>
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
      {assessments.map((item, index) => (
        <Reveal as="li" delay={index * 80} key={item.slug}>
          <article className="ca-card">
            <p className="ca-card-client">{item.client_name}</p>
            <h3>{item.title}</h3>
            <ul className="ca-chips">
              <li className="ca-chip">{item.duration_minutes} minutes, timed</li>
              <li className="ca-chip">{item.section_titles.length} sections</li>
              <li className="ca-chip">{item.item_count} activities</li>
            </ul>
            <div className="ca-card-foot">
              <span>Practice before you start</span>
              <a className="ca-card-link" href={'/assessments/' + encodeURIComponent(item.slug)} aria-label={'View ' + item.title}>View <span className="ca-arrow" aria-hidden="true">→</span></a>
            </div>
          </article>
        </Reveal>
      ))}
    </ul>;
  }
  return (
    <section className="ca-section" id="assessments" aria-labelledby="ca-assessments-heading">
      <div className="ca-shell">
        <Reveal className="ca-section-head">
          <p className="ca-eyebrow">Available assessments</p>
          <h2 id="ca-assessments-heading">Choose an assessment</h2>
          <p>Read the instructions for each assessment, try the practice, then start when you are ready.</p>
        </Reveal>
        {body}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="ca-section ca-section--tint" id="how-it-works" aria-labelledby="ca-features-heading">
      <div className="ca-shell">
        <Reveal className="ca-section-head">
          <p className="ca-eyebrow">How it works</p>
          <h2 id="ca-features-heading">Everything you need, nothing you do not.</h2>
          <p>The assessment is a timed sequence of questions and practical tasks. These are the parts you will use.</p>
        </Reveal>
        <div className="ca-features">
          {FEATURES.map((feature, index) => (
            <Reveal className="ca-feature" delay={index * 70} key={feature.title}>
              <span className="ca-feature-icon">{ICONS[feature.icon]}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// The catalogue lists more than one assessment family, so the illustrative task is not tied to
// payables terminology. It stays an explicitly labelled sample with figures of its own.
const SHOWCASE_SAMPLE = {
  docTitle: 'Statement of account (sample)',
  rows: [['S-1', 'Invoice', '1,200.00'], ['S-2', 'Invoice', '850.00'], ['S-3', 'Credit note', '−150.00']],
  question: 'What balance does this statement show as due?',
};

function Showcase() {
  const sample = SHOWCASE_SAMPLE;
  return (
    <section className="ca-section" aria-labelledby="ca-showcase-heading">
      <div className="ca-shell ca-showcase">
        <Reveal>
          <div className="ca-device" role="group" aria-label="Illustrative practical task with sample figures">
            <div className="ca-device-bar" aria-hidden="true"><i /><i /><i /><span>Practical task</span></div>
            <div className="ca-sheet ca-sample">
              <p className="ca-sample-doc">{sample.docTitle}</p>
              <div className="ca-sheet-scroll">
                <table>
                  <thead><tr><th scope="col">Ref</th><th scope="col">Description</th><th scope="col" className="is-num">Amount (R)</th></tr></thead>
                  <tbody>
                    {sample.rows.map(([ref, description, amount]) => <tr key={ref}><td>{ref}</td><td>{description}</td><td className="is-num">{amount}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <div className="ca-sample-task">
                <p><strong>{sample.question}</strong></p>
                <div className="ca-sample-answer"><span>Answer</span><code>R1 900,00</code></div>
                <p className="ca-sample-read">Read as R1,900.00</p>
              </div>
            </div>
            <p className="ca-caption">Illustrative example with sample figures. This is not a real assessment.</p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <p className="ca-eyebrow">Inside a practical task</p>
          <h2 id="ca-showcase-heading" className="ca-showcase-title">Read the documents. Type the answer.</h2>
          <ul className="ca-points">
            <li><strong>Documents you can read at a glance</strong><span>Statements, ledgers and listings appear as plain tables beside the tasks, like printed paperwork.</span></li>
            <li><strong>Type amounts your way</strong><span>With or without R, with spaces, commas or full stops. Under each box you see how your answer was read.</span></li>
            <li><strong>No spreadsheet needed</strong><span>You may use a calculator and scrap paper. Your answers save as you go.</span></li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section className="ca-section ca-section--tint" aria-labelledby="ca-benefits-heading">
      <div className="ca-shell">
        <Reveal className="ca-section-head">
          <p className="ca-eyebrow">Benefits</p>
          <h2 id="ca-benefits-heading">Clear rules, readable results.</h2>
          <p>Candidates should never have to guess what is expected, how long they have, or what happens to their details.</p>
        </Reveal>
        <div className="ca-benefits">
          {BENEFITS.map((benefit, index) => (
            <Reveal className="ca-benefit" delay={index * 60} key={benefit.title}>
              <span className="ca-benefit-num" aria-hidden="true">0{index + 1}</span>
              <h3>{benefit.title}</h3>
              <p>{benefit.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="ca-section" id="faq" aria-labelledby="ca-faq-heading">
      <div className="ca-shell">
        <Reveal className="ca-section-head">
          <p className="ca-eyebrow">FAQ</p>
          <h2 id="ca-faq-heading">Answers before you start.</h2>
          <p>Still unsure? Email <a className="ca-link" href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a>.</p>
        </Reveal>
        <div className="ca-faq">
          {FAQS.map(([question, answer], index) => (
            <Reveal delay={index * 40} key={question}>
              <details open={index === 0}>
                <summary>{question}<span className="ca-faq-mark" aria-hidden="true" /></summary>
                <p>{answer}</p>
              </details>
            </Reveal>
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
        <Reveal>
          <h2 id="ca-cta-heading">Ready when you are.</h2>
          <p>Choose an assessment, read the instructions and start. There is no invitation to wait for. Questions? Email <a className="ca-link" href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a>.</p>
        </Reveal>
        <Reveal delay={120}>
          <a className="ca-btn ca-btn--light" href="#assessments">Choose an assessment <span className="ca-arrow" aria-hidden="true">→</span></a>
        </Reveal>
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
            <p>Specialist recruitment and executive search in South Africa, established in 2013.</p>
          </div>
          <nav aria-label="Footer">
            <h2>Assessments</h2>
            <ul>
              <li><a href="#assessments">Choose an assessment</a></li>
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
        <Hero first={assessments[0]} />
        <TrustStrip />
        <CatalogueSection status={status} assessments={assessments} />
        <Features />
        <Showcase />
        <Benefits />
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
