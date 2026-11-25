import {test} from 'node:test';
import assert from 'node:assert/strict';
import {practiceForSlug, HR_PRACTICE, AP_PRACTICE, AR_PRACTICE} from '../src/assessments/practice-tables.js';
import {practiceFeedbackFor} from '../src/assessments/practice.js';

test('HR slugs get their own unrelated practice set; AP and AR keep theirs', () => {
  assert.equal(practiceForSlug('hr-assistant-v1'), HR_PRACTICE);
  assert.equal(practiceForSlug('ar-clerk-v1'), AR_PRACTICE);
  assert.equal(practiceForSlug('ap-clerk-v2'), AP_PRACTICE);
  assert.equal(practiceForSlug(undefined), AP_PRACTICE);
  assert.equal(practiceFeedbackFor(HR_PRACTICE, 'hr-practice-books', '=C2+C3').correct, true);
  assert.equal(practiceFeedbackFor(HR_PRACTICE, 'hr-practice-fruit', 'o2').correct, true);
  // Practice must stay off-topic: no HR, leave or payroll vocabulary.
  const visible = [HR_PRACTICE.docTitle, ...HR_PRACTICE.docHeaders, ...Object.values(HR_PRACTICE.source),
    ...HR_PRACTICE.items.flatMap(i => [i.prompt, ...(i.options || []).map(o => o.text)])].join(' ');
  assert.doesNotMatch(visible, /leave|payroll|employee|salary|contract|\bHR\b/i);
});
