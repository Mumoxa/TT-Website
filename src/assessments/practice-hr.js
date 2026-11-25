// Public examples for the HR Assistant assessment. Never used for scoring or persistence.
// A deliberately unrelated subject (a community library) so that trying the formats cannot hint at
// any HR answer. Kept separate so it can be fingerprint-checked against the HR assessment.
export const HR_PRACTICE_SOURCE = Object.freeze({
  A1: 'Library loans', B1: 'Branch', C1: 'Books lent',
  A2: 'Saturday', B2: 'NORTH', C2: '148.00',
  A3: 'Sunday', B3: 'SOUTH', C3: '93.50',
  A5: 'Combined books',
});

export const HR_PRACTICE_ITEMS = [
  { id: 'hr-practice-fruit', type: 'single', prompt: 'Which of these is a fruit?',
    options: [{ id: 'o1', text: 'Stapler' }, { id: 'o2', text: 'Mango' }, { id: 'o3', text: 'Ladder' }], answer: ['o2'] },
  { id: 'hr-practice-colours', type: 'multi', prompt: 'Which two of these are colours?',
    options: [{ id: 'o1', text: 'Turquoise' }, { id: 'o2', text: 'Saucepan' }, { id: 'o3', text: 'Crimson' }], answer: ['o1', 'o3'] },
  { id: 'hr-practice-books', type: 'cell', prompt: 'Using the table, how many books were lent in total? Type the amount in the box.',
    ref: 'C5', answer: 241.5, example: '148.00 + 93.50' },
];
