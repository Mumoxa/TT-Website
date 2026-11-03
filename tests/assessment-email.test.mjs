import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResultEmail, escapeHtml, notifyPendingResults, sendResultEmail } from '../functions/lib/assessment-email.js';
import { database } from './helpers/assessment-db.mjs';
import { SYNTHETIC } from './fixtures/synthetic-assessment.mjs';

const result = {
  overall_score: 72, knowledge_score: 24, reconciliation_score: 48,
  breakdown: { identified: 2, identification_points: 20, incorrect_selections: 0, action_points: 20, balance_points: 8 },
  critical_flags: [], interpretation: 'Synthetic interpretation',
};
const base = {
  candidate: { first_name: '<img src=x onerror=alert(1)>', surname: 'Candidate', email: 'c@example.invalid' },
  title: 'Demo', clientName: 'Client', status: 'completed', gradedAt: '2026-11-03T10:00:00Z', result,
  mcqReview: [{ prompt: 'Q & A?', chosen: '<b>x</b>', expected: 'y', correct: false }],
};

test('escapeHtml neutralises markup and quotes', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('result email shows total, reports question answers and escapes candidate data', () => {
  const msg = buildResultEmail(base);
  assert.match(msg.subject, /72\/100/);
  assert.match(msg.html, /Total: 72 \/ 100/);
  assert.match(msg.html, /Q &amp; A\?/);
  assert.doesNotMatch(msg.html, /<img src=x/);
  assert.doesNotMatch(msg.html, /<b>x<\/b>/);
  assert.match(msg.text, /Candidate: <b>x<\/b>/); // plain-text part is not HTML
});

test('no configuration means nothing is sent and no network call is made', async () => {
  let called = false;
  const out = await sendResultEmail({}, buildResultEmail(base), async () => { called = true; return new Response('', { status: 200 }); });
  assert.deepEqual(out, { ok: false, reason: 'not_configured' });
  assert.equal(called, false);
});

test('sends to the configured recipient through the provider with the API key', async () => {
  const calls = [];
  const env = { RESEND_API_KEY: 'k', ASSESSMENT_FROM_EMAIL: 'from@example.invalid', ASSESSMENT_RESULTS_TO: 'christo@talenttree.co.za' };
  const out = await sendResultEmail(env, buildResultEmail(base), async (url, init) => { calls.push({ url, init }); return new Response('{}', { status: 200 }); });
  assert.equal(out.ok, true);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ['christo@talenttree.co.za']);
});

function seedGradedAttempt(db) {
  const now = new Date().toISOString();
  db.sqlite.prepare('INSERT INTO assessment_definitions (id,slug,client_name,title,duration_seconds,current_version_id,status,created_at,updated_at) VALUES (?,?,?,?,600,?,?,?,?)').run('d1', 'synthetic', 'Client', 'Demo', 'v1', 'published', now, now);
  db.sqlite.prepare('INSERT INTO assessment_versions (id,definition_id,version_label,question_payload_json,scoring_key_json,scoring_engine_version,created_at) VALUES (?,?,?,?,?,?,?)').run('v1', 'd1', 'v1', JSON.stringify(SYNTHETIC.question_payload), JSON.stringify(SYNTHETIC.scoring_key), 'v1', now);
  db.sqlite.prepare('INSERT INTO candidates (id,first_name,surname,email,privacy_notice_version,consent_recorded_at,created_at) VALUES (?,?,?,?,?,?,?)').run('c1', 'Synthetic', 'Candidate', 'synthetic@example.invalid', 'assessment-v1', now, now);
  db.sqlite.prepare('INSERT INTO invitations (id,definition_id,token_sha256,status,issued_at,expires_at,created_at) VALUES (?,?,?,?,?,?,?)').run('i1', 'd1', 'h'.repeat(64), 'redeemed', now, now, now);
  db.sqlite.prepare('INSERT INTO attempts (id,invitation_id,candidate_id,definition_id,version_id,session_token_sha256,status,started_at_ms,expires_at_ms,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run('a1', 'i1', 'c1', 'd1', 'v1', 's'.repeat(64), 'completed', 1, 600001, now, now);
  db.sqlite.prepare('INSERT INTO results (id,attempt_id,scoring_version,overall_score,knowledge_score,reconciliation_score,breakdown_json,critical_flags_json,interpretation,graded_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('r1', 'a1', 'v1', 50, 16, 34, '{}', '[]', 'Synthetic', now);
}

test('pending results are emailed once and marked sent; failures are retried with a cap', async () => {
  const db = database();
  seedGradedAttempt(db);
  const env = { RESEND_API_KEY: 'k', ASSESSMENT_FROM_EMAIL: 'from@example.invalid', ASSESSMENT_RESULTS_TO: 'christo@talenttree.co.za' };
  let sends = 0;
  await notifyPendingResults(env, db, async () => { sends += 1; return new Response('{}', { status: 200 }); });
  await notifyPendingResults(env, db, async () => { sends += 1; return new Response('{}', { status: 200 }); });
  assert.equal(sends, 1);
  assert.equal(db.sqlite.prepare("SELECT notify_status FROM results WHERE id='r1'").get().notify_status, 'sent');

  const db2 = database();
  seedGradedAttempt(db2);
  for (let i = 0; i < 7; i += 1) await notifyPendingResults(env, db2, async () => new Response('', { status: 500 }));
  const row = db2.sqlite.prepare("SELECT notify_attempts, notify_status FROM results WHERE id='r1'").get();
  assert.equal(row.notify_attempts, 5);
  assert.equal(row.notify_status, 'http_500');
});

test('missing configuration does not consume the retry budget', async () => {
  const db = database();
  seedGradedAttempt(db);
  for (let i = 0; i < 8; i += 1) await notifyPendingResults({}, db);
  const row = db.sqlite.prepare("SELECT notify_attempts, notify_status FROM results WHERE id='r1'").get();
  assert.equal(row.notify_attempts, 0);
  assert.equal(row.notify_status, 'not_configured');
});
