import React from 'react';
import {AssessmentFrame} from './AssessmentApp.jsx';
import CandidateAssessment from './CandidateAssessment.jsx';
import {useAssessmentCatalog} from './catalog-client.js';

export default function AssessmentCatalog({slug = ''}) {
  const {status, assessments} = useAssessmentCatalog();
  const selected = assessments.find(item => item.slug === slug);

  if (status !== 'ready') return <AssessmentFrame>
    <main className="tta-shell tta-catalog">
      <h1>Assessments</h1>
      {status === 'loading'
        ? <p role="status">Loading assessments…</p>
        : <div role="alert"><p>Assessments could not be loaded. Please try again.</p><a className="tta-text-link" href={window.location.pathname}>Try again</a></div>}
    </main>
  </AssessmentFrame>;

  if (slug) {
    if (!selected) return <AssessmentFrame><main className="tta-shell tta-catalog">
      <h1>Assessment unavailable</h1><p role="status">This assessment is not open right now.</p>
      <a className="tta-text-link" href="/assessments">View assessments</a>
    </main></AssessmentFrame>;
    return <CandidateAssessment catalogItem={selected} />;
  }

  return <AssessmentFrame>
    <main className="tta-shell tta-catalog" id="main-content">
      <div className="tta-kicker">Talent Tree</div>
      <h1>Assessments</h1>
      <p className="tta-intro">Choose an assessment to read the instructions, try practice and start.</p>
      {assessments.length ? <div className="tta-catalog-list">
        {assessments.map(item => <article className="tta-catalog-card" key={item.slug}>
          <div><p className="tta-kicker">{item.client_name}</p><h2>{item.title}</h2>
            <p className="tta-card-meta">{item.duration_minutes} minutes, timed <span aria-hidden="true">·</span> {item.section_titles.length} sections</p>
          </div>
          <a className="tta-view-link" href={'/assessments/' + encodeURIComponent(item.slug)} aria-label={'View ' + item.title}>View <span aria-hidden="true">→</span></a>
        </article>)}
      </div> : <p className="tta-empty" role="status">No assessments are open right now.</p>}
    </main>
  </AssessmentFrame>;
}
