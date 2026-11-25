import React from 'react';
import logo from '../../Talent Tree Logo 2026 (1).png';
// Include the extended Latin, Greek and Cyrillic subsets for names in PDFs.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import {buildPersonalityReport, EVIDENCE_GAPS} from './personality-report-model.js';
import './personality-dossier.css';

function Masthead({page, label}) {
  return <header className="pi-mast"><div className="pi-brand"><img src={logo} alt="Talent Tree"/><div><strong>TALENT TREE</strong><span>HUMAN INTELLIGENCE</span></div></div><div className="pi-mast-right"><b>WORKPLACE PERSONALITY PROFILE</b><span>{label} / {String(page).padStart(2,'0')}</span></div></header>;
}
function Footer({page}) {return <footer className="pi-footer"><span>CONFIDENTIAL · AUTHORISED USE ONLY</span><span>SELF-REPORT · PILOT / NOT VALIDATED</span><span>{String(page).padStart(2,'0')} / 04</span></footer>;}
function Page({page,label,children}) {return <section className={'pi-page pi-page-'+page} aria-label={`Page ${page}: ${label}`}><Masthead page={page} label={label}/><div className="pi-content">{children}</div><Footer page={page}/></section>;}
function Kicker({children}) {return <div className="pi-kicker">{children}</div>;}
export function PersonalitySpectrum({dimension,mini=false}) {
  const value=dimension.score, plotted=value!==null;
  const accessible=plotted ? `${dimension.name}: ${value.toFixed(2)} on a 1 to 5 scale, midpoint 3.` : `${dimension.name}: ${dimension.partial?'incomplete':'unavailable'}.`;
  return <div className={'pi-spectrum'+(mini?' pi-spectrum-mini':'')} role="img" aria-label={accessible}>
    {!mini && <div className="pi-spectrum-title"><div><strong>{dimension.name}</strong><span>{dimension.short}</span></div><b>{plotted ? value.toFixed(2) : dimension.partial?'Incomplete':'Unavailable'}{plotted && <small> / 5</small>}</b></div>}
    <div className="pi-spectrum-scale" aria-hidden="true"><span className="pi-axis-line"/><i className="pi-tick pi-tick-start"/><i className="pi-tick pi-tick-middle"/><i className="pi-tick pi-tick-end"/>{plotted && <i className="pi-marker" style={{left:`${dimension.position*100}%`}}/>}</div>
    {!mini && <div className="pi-ends"><span>{dimension.left} <b>1</b></span><span>3 <em>midpoint</em></span><span><b>5</b> {dimension.right}</span></div>}
  </div>;
}
const list = values => values.length === 5 ? 'All five dimensions' : values.length ? values.join(', ') : 'None identified';
function Intro({data}) {return <Page page={1} label="Executive overview">
  <div className="pi-overline"><span>01 / EXECUTIVE PERSONALITY OVERVIEW</span><span>CONFIDENTIAL</span></div>
  <h1>Workplace<br/><em>Personality Profile</em></h1>
  <p className="pi-subtitle">Behavioral tendencies <b>·</b> Working preferences <b>·</b> Professional development</p>
  <div className={'pi-identity'+(data.candidate.length>80?' pi-identity-long':'')}><div><small>PREPARED FOR</small><strong>{data.candidate}</strong></div><div><small>SUBMITTED</small><b>{data.submitted_at}</b></div><div><small>COMPLETION</small><b>{data.answered==null?'Not recorded':`${data.answered} / ${data.total} statements`}</b></div></div>
  <div className="pi-summary"><Kicker>THE PROFILE IN CONTEXT</Kicker><p>{data.summary}</p></div>
  <div className="pi-section-head"><div><Kicker>THE FIVE DIMENSIONS</Kicker><h2>Personality spectrum</h2></div><p>Self-reported means on a common 1–5 scale.<br/>Neither end represents a better result.</p></div>
  <div className="pi-spectra">{data.dimensions.map(d=><PersonalitySpectrum dimension={d} key={d.name}/>)}</div>
  <div className="pi-highlights"><div><small>HIGHEST NUMERICAL MEAN</small><b>{list(data.highlights.top)}</b></div><div><small>NEAR THE MIDPOINT</small><b>{list(data.highlights.midpoint)}</b></div><div><small>EXPLORE IN CONTEXT</small><b>{list(data.highlights.explore)}</b></div></div>
  <p className="pi-science-line">Self-reported personality tendencies. No population percentile or validated job-fit interpretation is available.</p>
</Page>;}
function DeepDive({data}) {return <Page page={2} label="Understanding the individual">
  <div className="pi-overline"><span>02 / DIMENSION BY DIMENSION</span><span>DESCRIPTIVE, NOT DIAGNOSTIC</span></div>
  <div className="pi-title-row"><div><Kicker>READING THE PROFILE</Kicker><h2>Understanding<br/><em>the individual</em></h2></div><p>Each mean is a summary of self-description. Context, situation and independent evidence matter.</p></div>
  <div className="pi-dimensions">{data.dimensions.map((d,i)=><section className="pi-dimension" key={d.name}>
    <div className="pi-dim-aside"><span className="pi-index">0{i+1}</span><h3>{d.name}</h3><div className="pi-dim-score">{d.score===null?(d.partial?'Incomplete':'Unavailable'):<>{d.score.toFixed(2)} <small>/ 5</small></>}</div><PersonalitySpectrum dimension={d} mini/><div className="pi-mini-ends"><span>{d.left}</span><span>{d.right}</span></div></div>
    <div className="pi-dim-copy"><p><strong>Measures.</strong> {d.definition} <strong>Responses.</strong> {d.interpretation}</p><p><strong>Explore.</strong> {d.discuss} <strong>Limit.</strong> {d.limit}</p></div>
  </section>)}</div>
  <p className="pi-note">Small differences around the midpoint are treated cautiously. Endpoint labels simplify a broad construct; they are not separately validated subscales.</p>
</Page>;}
const guidance = [
  {n:'01',title:'Communication',factor:0,lead:'DISCUSS',text:'Ask how information is best shared, how ideas are discussed and how concerns can be raised.'},
  {n:'02',title:'Working environment',factor:0,lead:'EXPLORE',text:'Discuss conditions that help the individual focus, connect and contribute. The questionnaire does not establish an ideal environment.'},
  {n:'03',title:'Autonomy & structure',factor:2,lead:'CONSIDER',text:'Explore approaches to instructions, planning, independent responsibility and checking progress.'},
  {n:'04',title:'Learning & development',factor:4,lead:'DISCUSS',text:'Ask about intellectual interests and engagement with unfamiliar ideas. Learning agility has not been measured.'},
  {n:'05',title:'Feedback & pressure',factor:3,lead:'EXPLORE',text:'Discuss feedback preferences, demanding deadlines and support that may be useful, without assuming vulnerability.'},
  {n:'06',title:'Collaboration & disagreement',factor:1,lead:'CONSIDER',text:'Ask how differing opinions are worked through and how decisions are made with others.'},
];
function Operating({data}) {return <Page page={3} label="Personal operating profile">
  <div className="pi-overline"><span>03 / PERSONAL OPERATING PROFILE</span><span>CONVERSATION GUIDE</span></div>
  <div className="pi-title-row"><div><Kicker>AN INVITATION TO CONVERSATION</Kicker><h2>Working With<br/><em>This Individual</em></h2></div><p>Potential interaction considerations based on self-reported tendencies.</p></div>
  <div className="pi-quote">“The most useful insight begins with a question, not an assumption.”<small>Use the prompts below to understand the person’s own perspective.</small></div>
  <div className="pi-guidance">{guidance.map(g=>{const d=data.dimensions[g.factor];return <section className="pi-guidance-item" key={g.n}><div className="pi-guidance-header"><span>{g.n}</span><h3>{g.title}</h3></div><p className="pi-evidence">{d.name} · {d.score===null?'No complete score':`${d.score.toFixed(2)} / 5`}</p><p><strong>{g.lead}.</strong> {g.text}</p><p className="pi-guidance-caution">{d.interpretation}</p></section>;})}</div>
  <div className="pi-bottom-callout"><b>Evidence required</b><span>These are starting points, not confirmed preferences or instructions for managing someone. Invite the individual to agree, disagree or add context.</span></div>
</Page>;}
function Evidence({data}) {return <Page page={4} label="Evidence and development guide">
  <div className="pi-overline"><span>04 / EVIDENCE, INTERVIEW & DEVELOPMENT</span><span>BEYOND THE QUESTIONNAIRE</span></div>
  <div className="pi-title-row pi-title-compact"><div><Kicker>QUESTIONS WORTH ASKING</Kicker><h2>From profile<br/><em>to perspective</em></h2></div><p>Use these questions to gather independent examples—not to confirm an assumed personality classification.</p></div>
  <div className="pi-page4-grid"><section className="pi-questions"><h3>Structured conversation</h3>{data.dimensions.map((d,i)=><div className="pi-question" key={d.name}><span>0{i+1}</span><div><b>{d.name}</b><p>{d.question}</p></div></div>)}<p className="pi-note">For recruitment, use standardised, job-relevant questions and appropriate professional oversight.</p></section>
  <section className="pi-evidence-matrix"><h3>Evidence coverage</h3><div className="pi-matrix-row pi-matrix-head"><span>EVIDENCE AREA</span><span>STATUS</span></div><div className="pi-matrix-row"><span>Self-reported personality tendencies</span><b>{data.answered===50 && data.dimensions.every(d=>d.score!==null)?'Questionnaire completed':data.answered===null?'Unavailable':`${data.answered} / 50 answered`}</b></div>{EVIDENCE_GAPS.map((x,i)=><div className="pi-matrix-row" key={x}><span>{x}</span><b>{i===EVIDENCE_GAPS.length-1?'Not established':'Not measured'}</b></div>)}</section></div>
  <section className="pi-method"><Kicker>ASSESSMENT METHODOLOGY</Kicker><div className="pi-method-grid"><p><b>Instrument</b> IPIP-50 Big-Five Factor Markers, public-domain items. 50 statements; 10 per dimension. Positively and negatively keyed responses are scored in the same direction. Complete scores shown are means on a 1–5 scale.</p><p><b>Record</b> {data.submitted_at} · attempt {data.attempt_number ?? 'not recorded'} · {data.status}. Form {data.form_version || 'not recorded'}; assessment {data.assessment_version || 'not recorded'}; scoring {data.scoring_version || 'not recorded'}. Administration conditions: {data.administration}.</p></div><p className="pi-method-versions">INTERPRETATION {data.interpretation_version} · TEMPLATE {data.template_version}<br/>SOURCE: ipip.ori.org/newBigFive5broadKey.htm · ipip.ori.org/newScoringInstructions.htm</p></section>
  <div className="pi-disclaimer"><b>Important limitations</b><p>This report describes responses to a personality self-description questionnaire. It does not establish intelligence, occupational competence, clinical status, job suitability or future job performance. Talent Tree has not established local employment-selection validity for this implementation. No population norms, percentile rankings or validated hiring thresholds are provided. Results must not be used as a selection instrument until appropriate scientific, professional and legal requirements have been satisfied.</p></div>
</Page>;}
export function PersonalityDossier({report,onBack}) {
  let data;
  try {data=buildPersonalityReport(report);} catch {return <div className="pi-error" role="alert"><h2>Report unavailable</h2><p>The supplied personality results are invalid. Do not use or print this report; contact the assessment administrator.</p>{onBack && <button onClick={onBack}>Back to results</button>}</div>;}
  if (data.unreadable) return <div className="pi-error" role="alert"><h2>Report unavailable</h2><p>The stored result could not be read. Check the encryption key configuration.</p>{onBack && <button onClick={onBack}>Back to results</button>}</div>;
  return <article className="pi-document"><div className="pi-toolbar no-print"><button onClick={onBack} className="tta-admin-outline">← All results</button><span>Confidential · recruiter access</span><button onClick={()=>window.print()}>Print / Save PDF</button></div><Intro data={data}/><DeepDive data={data}/><Operating data={data}/><Evidence data={data}/></article>;
}
