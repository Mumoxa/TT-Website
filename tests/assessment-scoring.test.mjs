import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  validateAssessmentPackage, publicAssessment, cleanSubmission, cleanWorkbook,
  scoreAssessment, normalizeIdentity,
} from '../functions/lib/assessment-core.js';

import {SYNTHETIC} from './fixtures/synthetic-assessment.mjs';

const run = () => validateAssessmentPackage(SYNTHETIC);
test('five-question assessment schema is validated', () => {
  assert.doesNotThrow(run);
  assert.throws(() => validateAssessmentPackage({ ...SYNTHETIC,
    question_payload: { ...SYNTHETIC.question_payload, questions: [] },
  }), /5 scenario MCQs/i);
});

test('candidate payload never includes assessment key or extra admin fields', () => {
  const v = run();
  const safe = publicAssessment({ question_payload_json: JSON.stringify(v.question_payload), scoring_key_json: JSON.stringify(v.scoring_key) });
  assert.equal(safe.questions.length, 5);
  assert.equal(safe.scenario.private_answer_key, undefined);
  assert.equal(safe.questions[0].options[0].hidden_key_for_test, undefined);
  assert.equal(JSON.stringify(safe).includes('corrected_balance'), false);
  assert.equal(JSON.stringify(safe).includes('DO_NOT_LEAK'), false);
});

test('full score requires independent identification, correct actions and corrected balance', () => {
  const payload = publicAssessment({ question_payload_json: JSON.stringify(run().question_payload) });
  const answers = cleanSubmission({
    mcq: SYNTHETIC.scoring_key.mcq,
    structured: { discrepancies: ['AA3','AA4','DD5'], actions: SYNTHETIC.scoring_key.actions, corrected_balance: '550.00' },
  }, payload);
  const result = scoreAssessment(payload, SYNTHETIC.scoring_key, answers);
  assert.equal(result.overall_score, 100);
  assert.equal(result.knowledge_score, 40);
  assert.equal(result.reconciliation_score, 60);
});

test('false-positive discrepancy and unsafe action reduce score and flag review', () => {
  const payload = publicAssessment({ question_payload_json: JSON.stringify(run().question_payload) });
  const answers = cleanSubmission({
    mcq: { q1: 'b' },
    structured: { discrepancies: ['AA3', 'DD6'], actions: { AA3: 'force' }, corrected_balance: '0' },
  }, payload);
  const result = scoreAssessment(payload, SYNTHETIC.scoring_key, answers);
  assert.equal(result.breakdown.identified, 1);
  assert.equal(result.breakdown.incorrect_selections, 1);
  assert.equal(result.breakdown.identification_points, 2);
  assert.equal(result.reconciliation_score, 2);
  assert.ok(result.critical_flags.includes('Unsafe corrective action selected'));
});

test('workbook sanitiser preserves formulas, rejects oversized or out-of-area cells', () => {
  assert.deepEqual(cleanWorkbook({ A1: '=SUM(B1:B4)', F20: '250' }), { A1: '=SUM(B1:B4)', F20: '250' });
  assert.throws(() => cleanWorkbook({ X1: 'invalid' }), /Invalid workbook cell/);
  assert.throws(() => cleanWorkbook({ A1: 'a'.repeat(201) }), /Cell content is too long/);
});

test('self-declared identity requires populated name, email and privacy acknowledgement', () => {
  assert.deepEqual(normalizeIdentity({ first_name: ' Demo ', surname: ' Candidate ', email: 'DEMO@example.com',
    consent_acknowledged: true }), { first_name: 'Demo', surname: 'Candidate', email: 'demo@example.com' });
  assert.throws(() => normalizeIdentity({ first_name: 'A', surname: 'B', email: 'bad', consent_acknowledged: true }));
  assert.throws(() => normalizeIdentity({ first_name: 'Demo', surname: 'Candidate', email: 'demo@example.com' }));
});

test('an unselected discrepancy cannot earn hidden corrective-action credit',()=>{
 const pkg=run();const questions=publicAssessment({question_payload_json:JSON.stringify(pkg.question_payload)});
 const cleaned=cleanSubmission({structured:{discrepancies:[],actions:pkg.scoring_key.actions}},questions);
 assert.equal(scoreAssessment(questions,pkg.scoring_key,cleaned).breakdown.action_points,0);
});
test('nested transaction metadata cannot carry a marking key into public payloads',()=>{
 const copy=structuredClone(SYNTHETIC);copy.question_payload.scenario.supplier[0].description={private_answer:'never public'};
 assert.throws(()=>validateAssessmentPackage(copy),/description/i);
});
test('public payload discards nested metadata even from legacy stored versions',()=>{
 const copy=structuredClone(SYNTHETIC.question_payload);copy.scenario.supplier[0].description={private_answer:'DO_NOT_LEAK'};
 const payload=publicAssessment({question_payload_json:JSON.stringify(copy)});
 assert.equal(typeof payload.scenario.supplier[0].description,'string');assert.doesNotMatch(JSON.stringify(payload),/DO_NOT_LEAK/);
});
