import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateResult, sectionFeedback } from '../functions/lib/candidate-results.js';

test('section feedback is banded and never re-cases the section title', () => {
 assert.equal(sectionFeedback(80), 'A strong result in this section.');
 assert.equal(sectionFeedback(60), 'A reasonable result. There is room to improve in this section.');
 assert.equal(sectionFeedback(20), 'This section needs more practice.');
 const row = { overall_score: 40, knowledge_score: 0, reconciliation_score: 0, breakdown_json: JSON.stringify({ sections: [{ title: '2. Invoices, VAT and accruals', percent: 25 }] }) };
 const result = candidateResult(row);
 assert.equal(result.sections[0].title, '2. Invoices, VAT and accruals');
 assert.doesNotMatch(result.sections[0].feedback, /vat|invoices|At \d/);
});
