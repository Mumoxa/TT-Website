import test from 'node:test';
import assert from 'node:assert/strict';
import {personalityForm, personalityCatalogue, assertPersonalityCatalogue, normalizePersonalityAnswers, scorePersonality} from '../functions/lib/hpi-personality.js';

test('catalogue is valid and personality is planned by default', () => {
  assert.equal(assertPersonalityCatalogue(), true);
  assert.equal(personalityCatalogue()[0].status, 'planned');
  assert.equal(personalityCatalogue(true)[0].status, 'research');
  assert(!JSON.stringify(personalityCatalogue()).includes('"sign"'));
});

 test('P01 public projection contains 50 statements and no scoring directions', () => {
  const form = personalityForm();
  assert.equal(form.items.length, 50);
  assert.equal(new Set(form.items.map(i => i.id)).size, 50);
  assert.equal(form.stage, null);
  for (const item of form.items) {
    assert.deepEqual(Object.keys(item), ['id', 'domain', 'kind', 'prompt', 'options']);
    assert.equal(item.options.length, 5);
    assert.equal(item.domain, 'self_description');
    assert(!('key' in item) && !('sign' in item) && !('factor' in item));
  }
  form.items[0].options[0].label = 'changed';
  assert.equal(personalityForm().items[0].options[0].label, 'Very Inaccurate');
});

test('validates answers and treats omissions as unanswered, not incorrect', () => {
  for (const invalid of [null, [], {'b1': 'o6'}, {'b1': undefined}, {'b51': 'o1'}, {'b1': 1}]) {
    assert.throws(() => normalizePersonalityAnswers(invalid));
  }
  const result = scorePersonality({b1: 'o1', b6: 'o1'}); // b1 positive, b6 reverse keyed; both factor 1
  assert.equal(result.attempted, 2);
  assert.equal(result.total, 50);
  assert.deepEqual(result.factors[0], {factor: 1, name: 'Extraversion', answered: 2, total: 10, mean: 3, sum: null});
  assert.equal(result.factors[1].mean, null);
  assert.equal(result.selectionAllowed, false);
  assert.equal(result.status, 'research_only');
  assert.equal(result.norms, 'not_established');
  assert.equal(result.precision, 'not_established');
});

test('completed factors include sums, no composite or selection outputs', () => {
  const answers = Object.fromEntries(personalityForm().items.map(item => [item.id, 'o3']));
  const result = scorePersonality(answers);
  for (const factor of result.factors) {
    assert.equal(factor.answered, 10);
    assert.equal(factor.mean, 3);
    assert.equal(factor.sum, 30);
  }
  assert(!Object.keys(result).some(key => /percentile|type|pass|fail|composite|band/i.test(key)));
});
