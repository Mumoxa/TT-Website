import { PRACTICE_TABLES, AP_PRACTICE } from '../../src/assessments/practice-tables.js';

const normalize = value => String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const canonicalAnswer = value => typeof value === 'number' || (String(value).trim() !== '' && Number.isFinite(Number(value)))
  ? `number:${Number(value)}` : `text:${normalize(value)}`;
const fingerprint = source => JSON.stringify(Object.entries(source).map(([ref, value]) => [normalize(ref), normalize(value)]).sort(([a], [b]) => a.localeCompare(b)));

// Checks a battery against ONE practice table: complete-content comparison, not shared format
// identifiers, formula names or incidental cells. Scope is a practice table ({items, source}).
// Errors deliberately never include private prompts, options, keys or table contents.
function overlapsTable(payload, key, table) {
  if (!payload || !Array.isArray(payload.sections) || !key?.items || !payload.workbook?.source) {
    throw new Error('Published practice isolation requires a complete battery payload and scoring key.');
  }
  const prompts = new Set(table.items.map(item => normalize(item.prompt)));
  const options = new Set(table.items.flatMap(item => (item.options || []).map(option => normalize(option.text))));
  const answers = new Set(table.items.flatMap(item => item.type === 'cell' ? [canonicalAnswer(item.answer)] : item.answer.map(id => canonicalAnswer(item.options.find(option => option.id === id).text))));
  const overlap = () => { throw new Error('Practice content overlaps the published battery.'); };
  for (const section of payload.sections) {
    if (!Array.isArray(section.items)) throw new Error('Invalid published battery content.');
    for (const item of section.items) {
      const scoring = key.items[item.id];
      if (!scoring) throw new Error('Incomplete published scoring key.');
      // A reviewer-marked note carries no answer to leak, so it cannot overlap practice answers.
      // Every other type must have an answer, or the guard fails closed.
      if (item.type === 'note') continue;
      if (!Object.hasOwn(scoring, 'answer')) throw new Error('Incomplete published scoring key.');
      if (prompts.has(normalize(item.prompt))) overlap();
      if ((item.options || []).some(option => options.has(normalize(option.text)))) overlap();
      const values = Array.isArray(scoring.answer) ? scoring.answer : [scoring.answer];
      for (const value of values) {
        let text = value;
        if (item.type === 'single' || item.type === 'multi') {
          const option = item.options?.find(candidate => candidate.id === value);
          if (!option) throw new Error('Invalid published choice key.');
          text = option.text;
        }
        if (answers.has(canonicalAnswer(text))) overlap();
      }
    }
  }
  if (fingerprint(payload.workbook.source) === fingerprint(table.source)) overlap();
  return true;
}

/* Compares a published battery with the practice table for its own assessment.
   `scope` defaults to the Accounts Payable table, so existing callers and the existing
   assessment behave exactly as before. A slug-scoped practice table is passed for new families,
   so an Accounts Receivable battery is checked against receivable practice, not payable practice. */
export function assertPracticeIsolation(payload, key, scope = AP_PRACTICE) {
  return overlapsTable(payload, key, scope);
}

// Fails if ANY public practice table is reused, for callers that do not know the family.
export function assertNoPracticeReuse(payload, key) {
  for (const table of PRACTICE_TABLES) overlapsTable(payload, key, table);
  return true;
}
