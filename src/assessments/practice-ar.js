// Public examples for the Accounts Receivable assessment. Never used for scoring or persistence.
// A deliberately unrelated subject (a plant nursery) so that trying the formats cannot hint at any
// receivable answer. Kept separate from the Accounts Payable table so each assessment's practice
// content can be fingerprint-checked against the assessment it belongs to.
export const AR_PRACTICE_SOURCE = Object.freeze({
  A1: 'Seedling counter', B1: 'Session', C1: 'Seedlings sold',
  A2: 'Thursday', B2: 'MORNING', C2: '96.50',
  A3: 'Friday', B3: 'AFTERNOON', C3: '215.25',
  A5: 'Combined seedlings',
});

export const AR_PRACTICE_ITEMS = [
  { id: 'ar-practice-plant', type: 'single', prompt: 'Which of these is a plant?',
    options: [{ id: 'o1', text: 'Fern' }, { id: 'o2', text: 'Kettle' }, { id: 'o3', text: 'Bicycle' }], answer: ['o1'] },
  { id: 'ar-practice-tools', type: 'multi', prompt: 'Which two of these are garden tools?',
    options: [{ id: 'o1', text: 'Spade' }, { id: 'o2', text: 'Cushion' }, { id: 'o3', text: 'Rake' }], answer: ['o1', 'o3'] },
  { id: 'ar-practice-seedlings', type: 'cell', prompt: 'Using the table, how many seedlings were sold in total? Type the amount in the box.',
    ref: 'C5', answer: 311.75, example: '96.50 + 215.25' },
];
