/* Versioned, deterministic editorial interpretation. This module never scores items.
 * The wording is a discussion aid, not a normative classification or selection tool.
 * Rules and interpretations require professional review before operational use.
 */
export const INTERPRETATION_VERSION = 'tt-wpp-interpretation-1.0.0-draft';
export const TEMPLATE_VERSION = 'tt-wpp-dossier-1.0.0-draft';
export const DIMENSIONS = [
  {name:'Extraversion', left:'Reserved', right:'Outgoing', short:'Social engagement and expression', definition:'Self-reported social engagement, expressiveness and interpersonal stimulation.', low:'a more reserved orientation in social situations', high:'a more outgoing orientation in social situations', discuss:'Discuss how the individual prefers to receive information and participate in conversations.', limit:'This does not establish communication effectiveness or a preference for working alone.', question:'Give an example of a situation where your communication approach needed to change to suit a particular stakeholder.'},
  {name:'Agreeableness', left:'Questioning', right:'Accommodating', short:'Cooperation and consideration', definition:'Self-reported interpersonal cooperation, consideration and concern for others.', low:'a more questioning interpersonal orientation', high:'a more accommodating interpersonal orientation', discuss:'Explore how the individual handles disagreement and balances independent judgement with cooperation.', limit:'This does not establish empathy, conflict behaviour or teamwork.', question:'Tell me about a professional disagreement where you balanced your perspective with other people’s views.'},
  {name:'Conscientiousness', left:'Spontaneous', right:'Structured', short:'Organisation and persistence', definition:'Self-reported tendencies involving organisation, persistence and dependability.', low:'a more spontaneous orientation to organisation', high:'a more structured orientation to organisation', discuss:'Explore how the individual plans work, checks progress and manages competing deadlines.', limit:'This does not establish accuracy, productivity or dependability at work.', question:'Describe how you managed competing deadlines and checked that the work was completed.'},
  {name:'Emotional Stability', left:'Emotionally responsive', right:'Even-tempered', short:'Responses to emotional demands', definition:'Self-reported emotional responses and ease under everyday pressures.', low:'greater emotional responsiveness', high:'a more even-tempered self-description', discuss:'Ask about demanding situations, uncertainty, feedback and useful support.', limit:'This does not establish clinical status, stress tolerance or resilience.', question:'Describe a demanding work situation. What actions helped you maintain the quality of your work?'},
  {name:'Intellect/Imagination', left:'Concrete-oriented', right:'Exploratory', short:'Ideas and imagination', definition:'Self-reported interest in ideas, imagination and abstract information.', low:'a more concrete-oriented response pattern', high:'an orientation toward ideas and intellectual exploration', discuss:'Explore interest in unfamiliar ideas and how the individual approaches new information.', limit:'This does not establish IQ, creativity, technical skill or learning speed.', question:'Tell me about an unfamiliar problem and how you explored alternative ways of solving it.'},
];
export const EVIDENCE_GAPS = ['Cognitive reasoning','Numerical intelligence','Verbal reasoning','Practical problem-solving','Occupational competence','Processing efficiency','Learning agility','Leadership effectiveness','Job performance potential'];
export function spectrumPosition(score) {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 1 || score > 5) throw new Error('Invalid personality score.');
  return (score - 1) / 4;
}
function orientation(score) {
  const delta = score - 3;
  // Editorial display rules only; not thresholds derived from norms or validity data.
  if (Math.abs(delta) <= 0.1000001) return 'midpoint';
  return (delta < 0 ? 'low' : 'high') + (Math.abs(delta) < 0.5 ? '-slight' : '');
}
function dimensionInterpretation(def, score, answered, total) {
  if (score == null || answered !== total) return 'This dimension is unavailable or incomplete; no directional interpretation is offered.';
  const o=orientation(score);
  if (o === 'midpoint') return 'Responses sit near the scale midpoint and do not indicate a clear overall direction.';
  return `Responses suggest ${o.endsWith('-slight') ? 'a slight lean toward ' : ''}${o.startsWith('low') ? def.low : def.high}.`;
}
const QUESTION_VARIANTS = {
  Extraversion: {low:'Describe a time you prepared for a conversation or meeting with unfamiliar stakeholders. What did you do?', high:'Describe a time you adapted an active discussion to ensure different stakeholders were heard.', midpoint:'Give an example of a situation where your communication approach needed to change to suit a particular stakeholder.'},
  Agreeableness: {low:'Tell me about a disagreement where you assessed different perspectives before reaching a decision.', high:'Tell me about a time you worked toward agreement while raising an important concern.', midpoint:'Tell me about a professional disagreement where you balanced your perspective with other people’s views.'},
  Conscientiousness: {low:'Describe how you organised an unfamiliar task when a detailed plan was not available.', high:'Describe how you adjusted a work plan when priorities or deadlines changed.', midpoint:'Describe how you managed competing deadlines and checked that the work was completed.'},
  'Emotional Stability': {low:'Describe a demanding work situation. What actions and resources helped you maintain the quality of your work?', high:'Describe a demanding work situation and how you checked what support or information was needed.', midpoint:'Describe a demanding work situation. What actions helped you maintain the quality of your work?'},
  'Intellect/Imagination': {low:'Describe a time you used concrete information to address an unfamiliar problem and considered other approaches.', high:'Tell me about an unfamiliar problem and how you explored alternative ways of solving it.', midpoint:'Describe a time you encountered a new idea at work. How did you decide what to do next?'},
};
function questionFor(def, score) {
  const position = score === null ? 'midpoint' : orientation(score).split('-')[0];
  return QUESTION_VARIANTS[def.name][position];
}
const formatDate = value => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'UTC'}).format(date)+' UTC';
};
export function buildPersonalityReport(report) {
  if (!report || typeof report !== 'object') throw new Error('Invalid report data.');
  const p=report.personality || {}, factors=p.factors;
  if (factors != null && !Array.isArray(factors)) throw new Error('Invalid personality factors.');
  const byName = new Map();
  for (const f of factors || []) {
    if (!f || !DIMENSIONS.some(d=>d.name===f.name) || byName.has(f.name)) throw new Error('Invalid personality factor.');
    if (!Number.isInteger(f.answered) || !Number.isInteger(f.total) || f.total !== 10 || f.answered < 0 || f.answered > f.total) throw new Error('Invalid personality completion.');
    if (f.mean !== null && f.mean !== undefined) spectrumPosition(f.mean);
    if ((f.answered === 0 && f.mean != null) || (f.answered > 0 && f.mean == null)) throw new Error('Inconsistent personality score.');
    byName.set(f.name,f);
  }
  if (p.attempted != null && (!Number.isInteger(p.attempted) || p.attempted < 0 || p.attempted > 50)) throw new Error('Invalid total completion.');
  if (byName.size === 5 && p.attempted != null && [...byName.values()].reduce((sum,f)=>sum+f.answered,0)!==p.attempted) throw new Error('Inconsistent total completion.');
  const dimensions=DIMENSIONS.map(def=>{
    const f=byName.get(def.name);
    const complete=!!f && f.answered===f.total && f.mean!=null;
    return {...def, score: complete ? f.mean : null, partial:!!f && f.answered>0 && !complete,
      answered:f?.answered ?? null,total:f?.total ?? null, position:complete?spectrumPosition(f.mean):null,
      interpretation:dimensionInterpretation(def,complete?f.mean:null,f?.answered,f?.total), question:questionFor(def,complete?f.mean:null)};
  });
  const complete=dimensions.filter(d=>d.score!==null);
  const highest=complete.length?Math.max(...complete.map(d=>d.score)):null;
  const top=complete.filter(d=>d.score===highest).map(d=>d.name);
  const midpoint=complete.filter(d=>Math.abs(d.score-3)<=0.1+1e-7).map(d=>d.name);
  const farthest=complete.length?Math.max(...complete.map(d=>Math.abs(d.score-3))):null;
  const explore=complete.filter(d=>Math.abs(d.score-3)===farthest && farthest>0.1+1e-7).map(d=>d.name);
  const candidate=[report.candidate?.first_name,report.candidate?.surname].filter(v=>typeof v==='string' && v.trim()).join(' ').trim() || 'Name not recorded';
  // Reasoning counts (form wpp-2026-v2 onwards). Raw counts only; anything malformed is dropped, never guessed.
  const reasoning = p.reasoning && typeof p.reasoning === 'object' ? Object.entries(p.reasoning).flatMap(([id, r]) =>
    r && typeof r.title === 'string' && [r.correct, r.attempted, r.total].every(n => Number.isInteger(n) && n >= 0) && r.correct <= r.attempted && r.attempted <= r.total
      ? [{id, title: r.title, correct: r.correct, attempted: r.attempted, total: r.total}] : []) : [];
  const answers = Number.isInteger(p.attempted) && p.attempted>=0 && p.attempted<=50 ? p.attempted : null;
  const parts = complete.length ? [
    top.length===5 ? 'All five dimensions share the highest numerical mean; the results are not ranked strengths.' : `${top.join(', ')} ${top.length===1?'has':'have'} the highest numerical ${top.length===1?'mean':'means'}; these are not ranked strengths.`,
    midpoint.length===5 ? 'All five dimensions sit near the midpoint, which does not establish a clear direction.' : midpoint.length ? `${midpoint.join(', ')} ${midpoint.length===1?'is':'are'} near the scale midpoint, which does not establish a clear overall direction.` : 'The completed dimensions do not sit near the scale midpoint.',
    ...complete.filter(d=>d.name==='Intellect/Imagination'||d.name==='Emotional Stability'||d.name==='Agreeableness').map(d=>`${d.name}: ${d.interpretation}`),
    'These are self-reported responses, not established capabilities or limitations. Explore them alongside independent evidence and the individual’s own account.',
  ] : ['A directional interpretation is not available because no complete dimension scores are available. This questionnaire describes self-reported tendencies rather than abilities; explore the individual’s own account and independent evidence.'];
  return {
    contract_version:'tt-wpp-report-data-1', interpretation_version:INTERPRETATION_VERSION, template_version:TEMPLATE_VERSION,
    candidate, attempt_id:report.attempt?.id || null, attempt_number:report.attempt?.attempt_number ?? null,
    submitted_at:formatDate(p.submitted_at), form_version:report.assessment?.form_version ?? null, scoring_version:report.assessment?.scoring_version ?? null,
    assessment_version:report.assessment?.version ?? null, administration:'Not recorded', validation_status:'Pilot / not validated for employment selection',
    status:p.unreadable?'Unavailable':p.status==='submitted'?'Submitted':p.status==='draft'?'In progress':'Unavailable',
    unreadable:!!p.unreadable, answered:answers, total:50, dimensions, reasoning, summary:parts.join(' '),
    highlights:{top,midpoint,explore}, permissions:'Authorised recruiter access only; sharing requires approved policy.',
  };
}
