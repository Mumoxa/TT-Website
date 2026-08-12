import { suggestionResponseSchema } from '../shared/cvSuggestionsContract.js';

const url = process.env.CV_SUGGESTION_API_URL;
const token = process.env.CV_SUGGESTION_API_TOKEN;
if (!url || !token) {
  console.error('Set CV_SUGGESTION_API_URL and CV_SUGGESTION_API_TOKEN. Values are never printed.');
  process.exit(2);
}

const protectedToken = 'REF-4827';
const body = { task: 'refine_bullet', fragments: [{ id: 'synthetic-1', text: `Coordinated synthetic project ${protectedToken}.` }] };
const response = await fetch(new URL('/v1/suggestions', url), {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'X-Client-Key': 'release-smoke', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`Smoke request failed with HTTP ${response.status}.`);
const result = suggestionResponseSchema.parse(await response.json());
const output = JSON.stringify(result);
const outputTokens = output.match(/\b[A-Z]{2,}-\d{3,}\b/g) ?? [];
if (outputTokens.some((value) => value !== protectedToken)) throw new Error('Response invented a protected identifier.');
for (const suggestion of result.suggestions) {
  if ('proposedText' in suggestion && !suggestion.proposedText.includes(protectedToken)) {
    throw new Error('Response changed or removed the synthetic protected identifier.');
  }
}
console.log(`Suggestion API smoke passed: ${result.suggestions.length} schema-valid suggestion(s).`);
