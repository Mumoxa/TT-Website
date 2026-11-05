// Public examples only. Never used for assessment scoring or candidate persistence.
import { calculateCell } from './formulas.js';

export const PRACTICE_SOURCE = Object.freeze({
  A1: 'Museum token desk', B1: 'Batch', C1: 'Tokens issued',
  A2: 'Morning visitors', B2: 'MORNING', C2: '173.25',
  A3: 'Afternoon visitors', B3: 'AFTERNOON', C3: '428.60',
  A5: 'Combined tokens',
});
export const PRACTICE_ITEMS = [
  { id: 'practice-shelter', type: 'single', prompt: 'Which object is designed to shelter you from rain?',
    options: [{ id: 'o1', text: 'Umbrella' }, { id: 'o2', text: 'Pencil sharpener' }, { id: 'o3', text: 'Chessboard' }], answer: ['o1'] },
  { id: 'practice-music', type: 'multi', prompt: 'Which two objects are musical instruments?',
    options: [{ id: 'o1', text: 'Violin' }, { id: 'o2', text: 'Garden rake' }, { id: 'o3', text: 'Clarinet' }], answer: ['o1', 'o3'] },
  { id: 'practice-tokens', type: 'cell', prompt: 'Using the table, how many tokens did the museum desk issue in total? Type the amount in the box.', ref: 'C5', answer: 601.85, example: '173.25 + 428.60' },
];

export function practiceFeedback(id, response) {
  const item = PRACTICE_ITEMS.find(value => value.id === id);
  if (!item) throw new Error('Unknown practice item.');
  if (item.type === 'cell') {
    // A typed amount or a formula both count, as in the assessment's answer boxes.
    const entry = String(response ?? '').trim();
    const calculated = entry ? calculateCell({ ...PRACTICE_SOURCE, [item.ref]: entry.replace(/^R\s*/i, '').replace(/\s+/g, '') }, item.ref) : '';
    return { correct: entry !== '' && Math.abs(Number(calculated) - item.answer) < 0.000001,
      answer: `${item.example} = ${item.answer.toFixed(2)}.` };
  }
  const selected = item.type === 'single' ? [response] : Array.isArray(response) ? response : [];
  return { correct: selected.length === item.answer.length && new Set(selected).size === selected.length && item.answer.every(value => selected.includes(value)),
    answer: item.answer.map(value => item.options.find(option => option.id === value).text).join(' and ') };
}
