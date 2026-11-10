import { PRACTICE_ITEMS, PRACTICE_SOURCE } from '../../src/assessments/practice.js';

const normalize = value => String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const canonicalAnswer = value => typeof value === 'number' || (String(value).trim() !== '' && Number.isFinite(Number(value)))
  ? `number:${Number(value)}` : `text:${normalize(value)}`;
const fingerprint = source => JSON.stringify(Object.entries(source).map(([ref, value]) => [normalize(ref), normalize(value)]).sort(([a], [b]) => a.localeCompare(b)));

// Compare complete content, not shared format identifiers, formula names or incidental cells.
// Errors deliberately never include private prompts, options, keys or table contents.
export function assertPracticeIsolation(payload, key) {
  if (!payload || !Array.isArray(payload.sections) || !key?.items || !payload.workbook?.source) {
    throw new Error('Published practice isolation requires a complete battery payload and scoring key.');
  }
  const prompts = new Set(PRACTICE_ITEMS.map(item => normalize(item.prompt)));
  const options = new Set(PRACTICE_ITEMS.flatMap(item => (item.options || []).map(option => normalize(option.text))));
  const answers = new Set(PRACTICE_ITEMS.flatMap(item => item.type === 'cell' ? [canonicalAnswer(item.answer)] : item.answer.map(id => canonicalAnswer(item.options.find(option => option.id === id).text))));
  const overlap = () => { throw new Error('Practice content overlaps the published battery.'); };
  for (const section of payload.sections) {
    if (!Array.isArray(section.items)) throw new Error('Invalid published battery content.');
    for (const item of section.items) {
      const scoring = key.items[item.id];
      if (!scoring || !Object.hasOwn(scoring, 'answer')) throw new Error('Incomplete published scoring key.');
      if (prompts.has(normalize(item.prompt))) overlap();
      if ((item.options || []).some(option => options.has(normalize(option.text)))) overlap();
      if (item.type === 'match') {
        // Line matching: check the choice wording and the line wording against practice content.
        if ((item.choices || []).some(choice => options.has(normalize(choice.text)) || answers.has(canonicalAnswer(choice.text)))) overlap();
        if ((item.lines || []).some(line => prompts.has(normalize(line.detail)))) overlap();
        continue;
      }
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
  if (fingerprint(payload.workbook.source) === fingerprint(PRACTICE_SOURCE)) overlap();
  return true;
}
