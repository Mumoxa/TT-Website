// Synthetic test data only. Trivial prompts with obvious answers. Never publish as a real assessment.
export const SYNTHETIC_BATTERY = {
  format: 'battery-v2',
  instructions: 'Synthetic battery for automated tests. Answer every item in the workbook and the questions.',
  sections: [
    { id: 'synthetic-knowledge', title: 'Synthetic knowledge', items: [
      { id: 'k1', type: 'single', category: 'knowledge', points: 2, prompt: 'Synthetic question one: pick option alpha.', options: [{ id: 'o1', text: 'Alpha' }, { id: 'o2', text: 'Beta' }, { id: 'o3', text: 'Gamma' }] },
      { id: 'k2', type: 'text', category: 'knowledge', points: 2, prompt: 'Synthetic text question: type the word SYNTHETIC.' },
      { id: 'k3', type: 'multi', category: 'knowledge', points: 2, prompt: 'Synthetic multi question: select the two even numbers.', options: [{ id: 'o1', text: 'Two' }, { id: 'o2', text: 'Three' }, { id: 'o3', text: 'Four' }] },
    ] },
    { id: 'synthetic-workbook', title: 'Synthetic workbook', items: [
      { id: 'r1', type: 'cell', category: 'reconciliation', points: 3, ref: 'B12', prompt: 'Synthetic cell one: total of B2:B4 (source values).' },
      { id: 'r2', type: 'cell', category: 'reconciliation', points: 3, ref: 'B13', prompt: 'Synthetic cell two: count of rows whose source status is OPEN.' },
      { id: 'r3', type: 'single', category: 'reconciliation', points: 2, prompt: 'Synthetic action choice: pick the safe option.', options: [{ id: 'o1', text: 'Safe' }, { id: 'o2', text: 'Unsafe' }] },
    ] },
  ],
  workbook: {
    source: {
      A1: 'Ref', B1: 'Amount', C1: 'Status',
      A2: 'S-1', B2: '100', C2: 'OPEN',
      A3: 'S-2', B3: '250', C3: 'CLOSED',
      A4: 'S-3', B4: '50', C4: 'OPEN',
    },
  },
};

export const SYNTHETIC_BATTERY_KEY = {
  format: 'battery-v2',
  pass_percent: 75,
  items: {
    k1: { answer: 'o1' },
    k2: { answer: 'synthetic' },
    k3: { answer: ['o1', 'o3'] },
    r1: { answer: 400, tolerance: 0.005 },
    r2: { answer: 2, tolerance: 0 },
    r3: { answer: 'o1', unsafe: ['o2'] },
  },
};
