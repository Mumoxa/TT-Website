// Deliberately generic data, not assessment content or an accounting answer key.
import { SYNTHETIC_SHEETS_BATTERY } from './synthetic-battery.mjs';
export function syntheticTablePackage() {
  const payload = structuredClone(SYNTHETIC_SHEETS_BATTERY);
  payload.workbook.display = 'documents';
  payload.workbook.documents = [{ title: 'Synthetic source', range: 'Supplier!A1:B4' }];
  const key = { format: 'battery-v2', items: {} };
  let n = 0;
  function choice(points, category) {
    const id = `item${++n}`;
    key.items[id] = { answer: 'o1' };
    return { id, type: 'single', category, points, prompt: `Synthetic question ${n}: choose the first option.`, options: [{ id: 'o1', text: 'First' }, { id: 'o2', text: 'Second' }] };
  }
  const section = (id, items) => ({ id, title: `Synthetic ${id}`, items });
  const trial = section('trial-balance', []);
  trial.answer_table = { caption: 'Synthetic response table', rows: [] };
  for (let i = 0; i < 8; i++) {
    const side = choice(2, 'reconciliation');
    side.prompt = `Synthetic row ${i + 1}: choose the side.`;
    side.options = [{ id: 'o1', text: 'Debit' }, { id: 'o2', text: 'Credit' }];
    const id = `item${++n}`;
    const amount = { id, type: 'cell', category: 'reconciliation', points: 2, ref: `Working!B${i + 1}`, format: 'rand', prompt: `Synthetic row ${i + 1}: enter the amount.` };
    key.items[id] = { answer: 100 + i };
    trial.items.push(side, amount);
    trial.answer_table.rows.push({ label: `Synthetic row ${i + 1}`, side: side.id, amount: id });
  }
  trial.items.push(choice(6, 'reconciliation'), choice(6, 'reconciliation'));
  payload.sections = [section('principles', Array.from({ length: 5 }, () => choice(4, 'knowledge'))),
    section('journals', Array.from({ length: 3 }, () => choice(4, 'reconciliation'))),
    section('ledger', [choice(4, 'reconciliation')]), trial,
    section('controls', [choice(6, 'knowledge'), choice(7, 'knowledge'), choice(7, 'knowledge')])];
  return { slug: 'bookkeeping-to-trial-balance', client_name: 'Synthetic', title: 'Synthetic table', question_payload: payload, scoring_key: key };
}
