// Invented reasoning items for tests only. Not the private production items or keys.
export const SYNTHETIC_V2_PAYLOAD = {
  format: 'personality-v1', form_version: 'wpp-2026-v2',
  reasoning_sections: [
    { id: 'numeric', title: 'Numeric reasoning', instruction: 'Synthetic numeric instruction.' },
    { id: 'cognitive', title: 'Cognitive reasoning', instruction: 'Synthetic cognitive instruction.' },
  ],
  reasoning: [
    { id: 'n1', section: 'numeric', prompt: 'Synthetic: what is 2 + 2?', options: [{ id: 'o1', label: '3' }, { id: 'o2', label: '4' }, { id: 'o3', label: '5' }, { id: 'o4', label: '6' }] },
    { id: 'n2', section: 'numeric', prompt: 'Synthetic: what is 3 × 3?', options: [{ id: 'o1', label: '9' }, { id: 'o2', label: '6' }, { id: 'o3', label: '12' }, { id: 'o4', label: '8' }] },
    { id: 'c1', section: 'cognitive', prompt: 'Synthetic: next letter after A, B, C?', options: [{ id: 'o1', label: 'E' }, { id: 'o2', label: 'F' }, { id: 'o3', label: 'D' }, { id: 'o4', label: 'G' }] },
  ],
  _metadata: { title: 'Workplace Personality Profile', client_name: 'Talent Tree' },
};
export const SYNTHETIC_V2_KEY = { reasoning: { n1: { answer: 'o2' }, n2: { answer: 'o1' }, c1: { answer: 'o3' } } };
