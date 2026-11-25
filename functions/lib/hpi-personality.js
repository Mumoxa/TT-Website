// P01 (IPIP-50) items, public form and scoring. Used by the workplace personality profile flow
// (workplace-personality-flow.js); the flow opens only when ENABLE_HPI_PERSONALITY is "true".
// IPIP-50 is public domain; see docs/assessments/provenance/ipip-50-big-five-markers.json.
// Keep this module server-side. Never send scoring directions with the form.
// Wrangler 3's Pages bundler does not parse JSON import attributes. Keep the
// executable data in a JS module and test it against the provenance record.
import source from './hpi-personality-source.js';

export const PERSONALITY_SLUG = 'workplace-personality-profile';
// The runner, notice, encrypted submit and recruiter mail queue are integrated (2026-11-25).
// ENABLE_HPI_PERSONALITY remains the launch switch.
export const PERSONALITY_FLOW_READY = true;
export const VERSION = 'hpi-2026-pilot-2';
export const ENGINE = 'hpi-raw-v2';
const options = source.response_scale.map((label, i) => ({id: `o${i + 1}`, label}));

export function personalityCatalogue(personalityEnabled = false) {
  return [{id: 'P01', title: 'Workplace personality (self-description)', minutes: 8,
    construct: 'Self-described tendencies on five broad dimensions (IPIP Big-Five factor markers). Not a test: there are no right answers and no better or worse scores.',
    status: personalityEnabled ? 'research' : 'planned', kind: 'inventory', core: false,
    itemCount: 50, stageCount: 1,
    ...(!personalityEnabled ? {reason: 'This questionnaire is not available yet.'} : {})}];
}

export function assertPersonalityCatalogue() {
  if (source.items.length !== 50 || Object.keys(source.factors).length !== 5 || source.response_scale.length !== 5) throw new Error('Invalid personality catalogue.');
  const seen = new Set();
  for (const item of source.items) {
    if (!Number.isInteger(item.n) || item.n < 1 || item.n > 50 || seen.has(item.n) || typeof item.text !== 'string' || !item.text || !source.factors[item.factor] || !['+', '-'].includes(item.key)) throw new Error('Invalid personality item.');
    seen.add(item.n);
  }
  for (let factor = 1; factor <= 5; factor++) if (source.items.filter(item => item.factor === factor).length !== 10) throw new Error('Invalid personality factor.');
  return true;
}

export function personalityForm() {
  return {
    id: 'P01', title: 'Workplace personality (self-description)',
    construct: 'Self-described tendencies on five broad dimensions (IPIP Big-Five factor markers). Not a test: there are no right answers and no better or worse scores.',
    version: VERSION, kind: 'inventory', phase: 0,
    stages: 1, stage: null,
    instructions: 'Describe yourself as you generally are now, not as you wish to be in the future. Describe yourself as you honestly see yourself, in relation to other people you know of roughly your same age. For each statement, choose how accurately it describes you.',
    items: source.items.map(item => ({id: `b${item.n}`, domain: 'self_description', kind: 'choice', prompt: item.text, options: options.map(o => ({...o}))})),
  };
}

export function normalizePersonalityAnswers(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid answers');
  const validIds = new Set(source.items.map(item => `b${item.n}`));
  for (const [key, value] of Object.entries(input)) {
    if (!validIds.has(key) || (value !== null && !options.some(option => option.id === value))) throw new Error('Invalid answer');
  }
  return Object.fromEntries(source.items.map(item => [`b${item.n}`, input[`b${item.n}`] ?? null]));
}

export function scorePersonality(input) {
  const answers = normalizePersonalityAnswers(input);
  const factors = Object.entries(source.factors).map(([factor, name]) => {
    const items = source.items.filter(item => String(item.factor) === factor);
    const values = items.filter(item => answers[`b${item.n}`] !== null).map(item => {
      const value = Number(answers[`b${item.n}`].slice(1));
      return item.key === '-' ? 6 - value : value;
    });
    const sum = values.reduce((a, b) => a + b, 0);
    return {factor: Number(factor), name, answered: values.length, total: items.length,
      mean: values.length ? Math.round(sum / values.length * 100) / 100 : null,
      sum: values.length === items.length ? sum : null};
  });
  return {moduleId: 'P01', version: VERSION, engine: ENGINE, status: 'research_only',
    selectionAllowed: false, attempted: Object.values(answers).filter(value => value !== null).length,
    total: source.items.length, precision: 'not_established', norms: 'not_established',
    scale: '1-5 (mean of item scores)',
    interpretation: 'Your self-description on five broad dimensions. These are not abilities and there is no better or worse position. No norms, types or job-fit judgments are made.', factors};
}
