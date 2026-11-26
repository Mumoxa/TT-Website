import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/assessment/[[path]].js';
import {notifyPendingPersonality} from '../functions/lib/workplace-personality-flow.js';
import {personalitySpec, scorePersonality} from '../functions/lib/hpi-personality.js';
import {buildPersonalityResultEmail} from '../functions/lib/assessment-email.js';
import {buildPersonalityReport} from '../src/assessments/personality-report-model.js';
import {screeningFixture} from './helpers/screening-fixture.mjs';
import {personalityDatabase} from './helpers/personality-db.mjs';
import {SYNTHETIC_V2_PAYLOAD, SYNTHETIC_V2_KEY} from './fixtures/synthetic-wpp-v2.mjs';
import {PERSONALITY_NOTICE_VERSION} from '../src/assessments/personality-notice.js';

const base = 'https://assessment.example', slug = 'workplace-personality-profile';
const mail = {RESEND_API_KEY: 'key', ASSESSMENT_FROM_EMAIL: 'sender@example.invalid', ASSESSMENT_RESULTS_TO: 'recruiter@example.invalid'};
function client(env) {
  let cookie = ''; const tasks = [];
  const call = async (path, body) => {
    const response = await onRequest({env, request: new Request(base + '/api/assessment/' + path, {method: body === undefined ? 'GET' : 'POST', headers: {Origin: base, ...(cookie ? {Cookie: cookie} : {})}, body: body === undefined ? undefined : JSON.stringify(body)}), waitUntil(t) { tasks.push(t); }});
    const set = response.headers.get('Set-Cookie'); if (set) cookie = set.split(';')[0];
    return {status: response.status, body: await response.json()};
  };
  call.settle = () => Promise.all(tasks.splice(0));
  return call;
}
const start = seed => ({assessment_slug: slug, first_name: 'Synthetic', surname: 'Candidate', email: 'c@example.invalid', consent_acknowledged: true, personality_notice_version: PERSONALITY_NOTICE_VERSION, ...screeningFixture(seed)});
const statements = Object.fromEntries(Array.from({length: 50}, (_, i) => ['b' + (i + 1), 'o4']));

test('personalitySpec fails closed when the private keys do not match the questions', () => {
  assert.equal(personalitySpec({}, {}).reasoning, null);
  assert.equal(personalitySpec(SYNTHETIC_V2_PAYLOAD, SYNTHETIC_V2_KEY).formVersion, 'wpp-2026-v2');
  assert.throws(() => personalitySpec(SYNTHETIC_V2_PAYLOAD, {reasoning: {n1: {answer: 'o2'}}}));
  assert.throws(() => personalitySpec(SYNTHETIC_V2_PAYLOAD, {reasoning: {...SYNTHETIC_V2_KEY.reasoning, n1: {answer: 'o9'}}}));
  assert.throws(() => personalitySpec({...SYNTHETIC_V2_PAYLOAD, reasoning: [{...SYNTHETIC_V2_PAYLOAD.reasoning[0], section: 'nope'}]}, SYNTHETIC_V2_KEY));
});

test('v2 full cycle: keys never reach the browser; reasoning is scored from the private key and emailed once', async () => {
  const {db, env} = personalityDatabase({publish: true, v2: true});
  const call = client({...env, ENABLE_HPI_PERSONALITY: 'true'});
  const list = await (await onRequest({env: {...env, ENABLE_HPI_PERSONALITY: 'true'}, request: new Request(base + '/api/assessment/catalog')})).json();
  assert.equal(list[0].item_count, 53); assert.equal(list[0].duration_minutes, 20);
  assert.doesNotMatch(JSON.stringify(list), /Synthetic: what is/);
  const started = await call('start', start(11));
  assert.equal(started.status, 200);
  assert.equal(started.body.assessment.reasoning.length, 3);
  assert.equal(started.body.assessment.version, 'wpp-2026-v2');
  assert.doesNotMatch(JSON.stringify(started.body), /"answer"|scoring_key|"key"/);
  assert.equal(Math.round((started.body.expires_at_ms - started.body.started_at_ms) / 1000), 1200);
  const id = started.body.attempt_id;
  assert.equal((await call('save', {attempt_id: id, save_revision: 0, answers: {n1: 'o9'}})).status, 400);
  const saved = await call('save', {attempt_id: id, save_revision: 0, answers: {...statements, n1: 'o2'}});
  assert.equal(saved.status, 200);
  assert.equal((await call('me')).body.personality.answers.n1, 'o2');
  // n1 correct, n2 wrong, c1 blank.
  const done = await call('submit', {attempt_id: id, save_revision: 1, answers: {...statements, n1: 'o2', n2: 'o3'}});
  assert.equal(done.status, 200); assert.equal(done.body.candidate_result, null);
  assert.doesNotMatch(JSON.stringify(done.body), /correct|reasoning/i);
  assert.equal(db.sqlite.prepare('SELECT form_version FROM workplace_personality_attempts WHERE attempt_id=?').get(id).form_version, 'wpp-2026-v2');
  await call.settle();
  const sent = [];
  await notifyPendingPersonality({...env, ...mail}, db, async (_u, init) => { sent.push(JSON.parse(init.body)); return new Response('{}'); });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Numeric reasoning: 1 of 2 correct \(2 answered\)/);
  assert.match(sent[0].text, /Cognitive reasoning: 0 of 1 correct \(0 answered\)/);
  assert.match(sent[0].text, /must not be used as a cut-off/);
  db.sqlite.close();
});

test('a v2 attempt closed at the time limit is scored with its own private key', async () => {
  const {db, env} = personalityDatabase({publish: true, v2: true});
  const call = client({...env, ENABLE_HPI_PERSONALITY: 'true'});
  const started = await call('start', start(12));
  await call('save', {attempt_id: started.body.attempt_id, save_revision: 0, answers: {b1: 'o5', c1: 'o3'}});
  db.sqlite.prepare('UPDATE attempts SET started_at_ms=?, expires_at_ms=? WHERE id=?').run(Date.now() - 5000, Date.now() - 1000, started.body.attempt_id);
  assert.equal((await call('me')).body.status, 'timed_out');
  await call.settle();
  const sent = [];
  await notifyPendingPersonality({...env, ...mail}, db, async (_u, init) => { sent.push(JSON.parse(init.body)); return new Response('{}'); });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Cognitive reasoning: 1 of 1 correct \(1 answered\)/);
  db.sqlite.close();
});

test('an older submission without reasoning still renders in the email and the dossier', () => {
  const result = scorePersonality({b1: 'o1'});
  assert.equal(result.reasoning, undefined);
  const msg = buildPersonalityResultEmail({candidate: {first_name: 'A', surname: 'B'}, result});
  assert.doesNotMatch(msg.text, /Reasoning/);
  const report = buildPersonalityReport({candidate: {first_name: 'A', surname: 'B'}, personality: {status: 'submitted', factors: result.factors, attempted: 1}});
  assert.deepEqual(report.reasoning, []);
  const withReasoning = buildPersonalityReport({candidate: {first_name: 'A', surname: 'B'}, personality: {status: 'submitted', factors: result.factors, attempted: 1, reasoning: {numeric: {title: 'Numeric reasoning', correct: 4, attempted: 5, total: 6}, bad: {title: 'x', correct: 9, attempted: 1, total: 1}}}});
  assert.deepEqual(withReasoning.reasoning.map(r => r.id), ['numeric']);
});

test('advertised time and question counts follow what is enforced, for v1, v2 and invitations', async () => {
  // v1 (no reasoning) with the stale 3600-second column still in the database.
  const v1 = personalityDatabase({publish: true});
  v1.db.sqlite.exec("UPDATE assessment_definitions SET duration_seconds=3600 WHERE slug='workplace-personality-profile'");
  const on1 = {...v1.env, ENABLE_HPI_PERSONALITY: 'true'};
  const [card1] = await (await onRequest({env: on1, request: new Request(base + '/api/assessment/catalog')})).json();
  assert.equal(card1.duration_minutes, 20); assert.equal(card1.item_count, 50);
  v1.db.sqlite.close();
  // v2 through an invitation link: real counts, enforced duration, and still no items.
  const v2 = personalityDatabase({publish: true, v2: true});
  const {tokenHash} = await import('../functions/lib/assessment-core.js');
  const token = 'b'.repeat(64), at = new Date().toISOString(), expires = new Date(Date.now() + 86400000).toISOString();
  v2.db.sqlite.prepare("INSERT INTO invitations (id,definition_id,token_sha256,status,issued_at,expires_at,created_at) VALUES ('inv2','6f1c2a90-9b5e-4c1d-8e3a-0d7b5a2f4c11',?,'issued',?,?,?)").run(await tokenHash(token), at, expires, at);
  const meta = await (await onRequest({env: {...v2.env, ENABLE_HPI_PERSONALITY: 'true'}, request: new Request(base + '/api/assessment/invite?token=' + token)})).json();
  assert.equal(meta.duration_seconds, 1200); assert.equal(meta.item_count, 53); assert.equal(meta.kind, 'personality');
  assert.doesNotMatch(JSON.stringify(meta), /Synthetic: what is/);
  v2.db.sqlite.close();
});
