import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/assessment/[[path]].js';
import {buildResultEmail} from '../functions/lib/assessment-email.js';
import {integritySummary, integrityLine, INTEGRITY_STATEMENT_VERSION} from '../src/assessments/integrity.js';
import {database} from './helpers/assessment-db.mjs';
import {SYNTHETIC_BATTERY, SYNTHETIC_BATTERY_KEY} from './fixtures/synthetic-battery.mjs';
import {screeningFixture} from './helpers/screening-fixture.mjs';

/* Integrity checks (owner decision 2026-11-27): honesty statement, page-leave recording, outside pastes and blocked
   copies. On for ar-clerk-v1 only. Synthetic content only (public repository). */
const origin = 'https://assessment.example';

async function setup() {
  const db = database(), at = new Date().toISOString();
  for (const slug of ['ar-clerk-v1', 'ap-clerk-v2']) {
    db.sqlite.prepare('INSERT INTO assessment_definitions VALUES (?,?,?,?,1200,?,?,?,?)').run('def-' + slug, slug, 'Talent Tree', 'Synthetic integrity test ' + slug, 'v-' + slug, 'published', at, at);
    db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)').run('v-' + slug, 'def-' + slug, 'v1', JSON.stringify(SYNTHETIC_BATTERY), JSON.stringify(SYNTHETIC_BATTERY_KEY), 'battery-v2', at, at);
  }
  const env = {ASSESSMENT_DB: db, ASSESSMENT_ADMIN_KEY: 'synthetic-admin', ASSESSMENT_ID_HASH_KEY: 'synthetic-key-with-at-least32-characters-for-tests', ASSESSMENT_PII_KEY: btoa('0'.repeat(32))};
  async function call(path, data, cookie, admin = false) {
    const response = await onRequest({env, waitUntil() {}, request: new Request(origin + '/api/assessment/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {Origin: origin, ...(cookie ? {Cookie: cookie} : {}), ...(admin ? {'x-tt-assessment-admin': '1'} : {}), 'CF-Connecting-IP': '192.0.2.9'},
      body: data === undefined ? undefined : JSON.stringify(data)})});
    return {status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0]};
  }
  const fields = (slug, seed, extra = {}) => ({assessment_slug: slug, first_name: 'Synthetic', surname: 'Candidate', email: `integrity${seed}@example.invalid`, consent_acknowledged: true, ...screeningFixture(seed), ...extra});
  const row = (attemptId) => db.sqlite.prepare('SELECT integrity_json j, integrity_statement_version v FROM attempts WHERE id=?').get(attemptId);
  return {db, env, call, fields, row};
}

function withClock(start) {
  const real = Date.now; let now = start;
  Date.now = () => now;
  return {advance(ms) { now += ms; }, restore() { Date.now = real; }};
}

test('the honesty statement is required where integrity checks are on, and only there', async () => {
  const t = await setup();
  const refused = await t.call('start', t.fields('ar-clerk-v1', 1));
  assert.equal(refused.status, 400);
  assert.match(refused.data.message, /honesty statement/);
  assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM attempts').get().n, 0);
  const wrong = await t.call('start', t.fields('ar-clerk-v1', 1, {integrity_statement_version: 'old'}));
  assert.equal(wrong.status, 400);
  const ok = await t.call('start', t.fields('ar-clerk-v1', 1, {integrity_statement_version: INTEGRITY_STATEMENT_VERSION}));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.integrity_checks, true);
  assert.equal(t.row(ok.data.attempt_id).v, INTEGRITY_STATEMENT_VERSION);
  const me = await t.call('me', undefined, ok.cookie);
  assert.equal(me.data.integrity_checks, true);
  // AP is unchanged: no statement needed, no checks.
  const ap = await t.call('start', t.fields('ap-clerk-v2', 2));
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  assert.equal(ap.data.integrity_checks, undefined);
  const catalogue = (await t.call('catalog')).data;
  assert.equal(catalogue.find((c) => c.slug === 'ar-clerk-v1').integrity_checks, true);
  assert.equal(catalogue.find((c) => c.slug === 'ap-clerk-v2').integrity_checks, undefined);
});

test('page leaves are timed by the server; repeats, other events and other assessments are handled', async () => {
  const t = await setup();
  const s = await t.call('start', t.fields('ar-clerk-v1', 3, {integrity_statement_version: INTEGRITY_STATEMENT_VERSION}));
  const ev = (event, cookie = s.cookie, attempt_id = s.data.attempt_id) => t.call('integrity', {attempt_id, event}, cookie);
  const clock = withClock(Date.now());
  try {
    assert.equal((await ev('back')).data.recorded, false); // nothing open
    assert.equal((await ev('left')).data.recorded, true);
    assert.equal((await ev('left')).data.recorded, false); // already away: one leave
    clock.advance(45000);
    assert.equal((await ev('back')).data.recorded, true);
    assert.equal((await ev('left')).data.recorded, true);
    clock.advance(5000);
    await ev('back');
    await ev('paste'); await ev('paste'); await ev('copy');
    assert.equal((await ev('typing')).status, 400);
    assert.equal((await ev('left', s.cookie, 'another-attempt')).status, 409);
    const summary = integritySummary(t.row(s.data.attempt_id).j, {statementVersion: t.row(s.data.attempt_id).v});
    assert.deepEqual({...summary, basis: undefined}, {statement_accepted: true, leaves: 2, long_leaves: 1, away_seconds: 50, longest_away_seconds: 45, away_at_close: false, outside_pastes: 2, copy_blocked: 1, basis: undefined});
    // Another assessment records nothing.
    const ap = await t.call('start', t.fields('ap-clerk-v2', 4));
    assert.equal((await ev('left', ap.cookie, ap.data.attempt_id)).data.recorded, false);
    assert.equal(t.row(ap.data.attempt_id).j, null);
    // Without a session nothing is recorded.
    assert.equal((await t.call('integrity', {attempt_id: s.data.attempt_id, event: 'left'})).status, 401);
  } finally { clock.restore(); }
});

test('a leave still open when time runs out counts up to the close, and later events are refused', async () => {
  const t = await setup();
  const s = await t.call('start', t.fields('ar-clerk-v1', 5, {integrity_statement_version: INTEGRITY_STATEMENT_VERSION}));
  const expires = t.db.sqlite.prepare('SELECT expires_at_ms e FROM attempts WHERE id=?').get(s.data.attempt_id).e;
  const clock = withClock(expires - 60000);
  try {
    await t.call('integrity', {attempt_id: s.data.attempt_id, event: 'left'}, s.cookie);
    clock.advance(120000);
    assert.equal((await t.call('integrity', {attempt_id: s.data.attempt_id, event: 'back'}, s.cookie)).data.recorded, false);
    await t.call('me', undefined, s.cookie); // closes the attempt as timed out
    const admin = (await t.call('admin/login', {key: t.env.ASSESSMENT_ADMIN_KEY})).cookie;
    const report = await t.call('admin/report/' + s.data.attempt_id, undefined, admin, true);
    assert.equal(report.status, 200, JSON.stringify(report.data));
    assert.equal(report.data.attempt.status, 'timed_out');
    assert.equal(report.data.integrity.leaves, 1);
    assert.equal(report.data.integrity.away_at_close, true);
    assert.equal(report.data.integrity.away_seconds, 60);
    assert.equal(report.data.integrity.statement_accepted, true);
  } finally { clock.restore(); }
});

test('the report and email show the record, and an attempt without checks shows none', async () => {
  const t = await setup();
  const admin = (await t.call('admin/login', {key: t.env.ASSESSMENT_ADMIN_KEY})).cookie;
  const ap = await t.call('start', t.fields('ap-clerk-v2', 6));
  await t.call('submit', {attempt_id: ap.data.attempt_id, save_revision: 0, mcq: {}, structured: {}, workbook: {}}, ap.cookie);
  assert.equal((await t.call('admin/report/' + ap.data.attempt_id, undefined, admin, true)).data.integrity, null);
  const line = integrityLine(integritySummary('{"leaves":3,"away_ms":95000,"longest_ms":70000,"long_leaves":1,"pastes":1,"copy_blocked":4}', {statementVersion: INTEGRITY_STATEMENT_VERSION}));
  assert.equal(line, 'Left the assessment page 3 times, 1 min 35 s in total (longest 1 min 10 s; 1 longer than 30 s); pasted from outside 1 time; copy attempts blocked 4; honesty statement accepted.');
  assert.equal(integrityLine(integritySummary(null)), 'Did not leave the assessment page; pasted from outside 0 times; copy attempts blocked 0; honesty statement not recorded.');
  const base = {candidate: {first_name: 'Synthetic', surname: 'Candidate', email: 'x@example.invalid'}, title: 'Synthetic', clientName: 'Talent Tree', status: 'completed', result: {overall_score: 50, knowledge_score: 20, reconciliation_score: 30, breakdown: {}, critical_flags: [], interpretation: 'Synthetic.'}, mcqReview: [], gradedAt: 'now', isBattery: true};
  const withRecord = buildResultEmail({...base, integrity: integritySummary('{"leaves":1,"away_ms":4000,"longest_ms":4000}', {statementVersion: INTEGRITY_STATEMENT_VERSION})});
  assert.match(withRecord.text, /Page integrity: Left the assessment page 1 time, 4 s in total/);
  assert.match(withRecord.html, /Page integrity/);
  const without = buildResultEmail(base);
  assert.doesNotMatch(without.text + without.html, /Page integrity/);
});

test('an attempt started before the checks existed shows no record rather than a clean one', async () => {
  const t = await setup();
  const s = await t.call('start', t.fields('ar-clerk-v1', 7, {integrity_statement_version: INTEGRITY_STATEMENT_VERSION}));
  t.db.sqlite.prepare('UPDATE attempts SET integrity_statement_version=NULL, integrity_json=NULL WHERE id=?').run(s.data.attempt_id);
  await t.call('submit', {attempt_id: s.data.attempt_id, save_revision: 0, mcq: {}, structured: {}, workbook: {}}, s.cookie);
  const admin = (await t.call('admin/login', {key: t.env.ASSESSMENT_ADMIN_KEY})).cookie;
  assert.equal((await t.call('admin/report/' + s.data.attempt_id, undefined, admin, true)).data.integrity, null);
});
