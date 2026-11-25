import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPersonalityResultEmail, sendResultEmail} from '../functions/lib/assessment-email.js';
import {scorePersonality} from '../functions/lib/hpi-personality.js';

test('recruiter email renders only factor aggregates and the mandatory caveat', async () => {
  const result = scorePersonality({b1:'o1', b6:'o1'});
  const msg = buildPersonalityResultEmail({candidate:{first_name:'<img>', surname:'Candidate'},result:{...result, responses:{secret:'DO_NOT_EMAIL'}}});
  assert.match(msg.html, /&lt;img&gt;/);
  assert.doesNotMatch(msg.html, /<img>/);
  assert.match(msg.text, /Extraversion: 3\.00 \/ 5 \(2 of 10 answered\)/);
  assert.match(msg.text, /Agreeableness: Not answered \(0 of 10 answered\)/);
  assert.match(msg.text, /not been validated for selection at Talent Tree/);
  assert.match(msg.text, /There is no better or worse score/);
  assert.match(msg.text, /Do not use it alone, or as a cut-off, in any hiring decision/);
  assert.doesNotMatch(msg.text + msg.html, /DO_NOT_EMAIL|percentile|archetype|composite|pass\/fail/i);
  let request;
  await sendResultEmail({RESEND_API_KEY:'key',ASSESSMENT_FROM_EMAIL:'sender@example.invalid',ASSESSMENT_RESULTS_TO:'recruiter@example.invalid',ASSESSMENT_RESULTS_TO_WORKPLACE:'other@example.invalid'}, msg, async (_url,init) => {request=JSON.parse(init.body); return new Response('{}');}, 'workplace-personality-profile');
  assert.deepEqual(request.to, ['recruiter@example.invalid', 'other@example.invalid']);
  assert.throws(() => buildPersonalityResultEmail({candidate:{}, result:{factors:[]}}));
});
