import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './helpers/assessment-db.mjs';
import {startHpi, saveHpi, exportHpi, eraseHpi, eraseHpiInvite, sweepHpi} from '../functions/lib/hpi-storage.js';

function fixture(migrate = true) {
  const db = database();
  if (migrate) db.sqlite.exec(readFileSync(new URL('../migrations/assessments/0006_hpi_research.sql', import.meta.url), 'utf8'));
  const at = '2026-01-01T00:00:00.000Z';
  const insert = db.sqlite.prepare('INSERT INTO candidates (id,first_name,surname,email,privacy_notice_version,consent_recorded_at,created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const id of ['one', 'two']) insert.run(id, 'Test', 'Candidate', `${id}@example.invalid`, 'test', at, at);
  return {db, env: {ASSESSMENT_DB: db, ASSESSMENT_PII_KEY: Buffer.alloc(32, 7).toString('base64')}};
}
const time = Date.parse('2026-02-01T00:00:00.000Z');

test('encrypted storage, candidate isolation, compare-and-set, submission and data rights', async () => {
  const {db, env} = fixture();
  const counts = () => ['attempts', 'results', 'audit_events'].map(table => db.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
  const before = counts();
  const first = await startHpi(env, 'one', 'test-notice', time);
  assert.equal(first.inserted, true);
  const id = first.attempt.id;
  assert.equal((await startHpi(env, 'one', 'test-notice', time)).attempt.id, id);
  assert.deepEqual(await saveHpi(env, 'two', id, 0, {b1: 'o2'}, false, time), {error: 'not_found'});
  assert.equal((await saveHpi(env, 'one', id, 0, {b1: 'o2'}, false, time)).revision, 1);
  const stored = db.sqlite.prepare('SELECT answers_encrypted,result_encrypted FROM hpi_research_attempts WHERE id=?').get(id);
  assert.match(stored.answers_encrypted, /^enc:v1\./);
  assert(!stored.answers_encrypted.includes('"b1":"o2"'));
  assert.equal(stored.result_encrypted, null);
  assert.deepEqual(await saveHpi(env, 'one', id, 0, {b1: 'o3'}, false, time), {error: 'conflict'});
  const final = await saveHpi(env, 'one', id, 1, {b1: 'o2', b6: 'o1'}, true, time);
  assert.equal(final.revision, 2);
  assert.equal(final.result.selectionAllowed, false);
  assert.match(db.sqlite.prepare('SELECT result_encrypted FROM hpi_research_attempts WHERE id=?').get(id).result_encrypted, /^enc:v1\./);
  assert.deepEqual(await saveHpi(env, 'one', id, 2, {b1: 'o2'}, true, time), {error: 'conflict'});
  const exported = await exportHpi(env, 'one');
  assert.equal(exported[0].answers.b1, 'o2');
  assert.equal(exported[0].result.attempted, 2);
  assert.equal((await exportHpi({...env, ASSESSMENT_PII_KEY: Buffer.alloc(32, 9).toString('base64')}, 'one'))[0].payload_unavailable, 'encrypted_content_unreadable');
  assert.deepEqual(await exportHpi(env, 'two'), []);
  await eraseHpi(env, 'one');
  assert.deepEqual(await exportHpi(env, 'one'), []);
  assert.deepEqual(counts(), before);
  db.sqlite.close();
});

test('enforces key, one non-blank submission, expiry and retention', async () => {
  const {db, env} = fixture();
  await assert.rejects(() => startHpi({...env, ASSESSMENT_PII_KEY: ''}, 'one', 'test', time));
  const {attempt} = await startHpi(env, 'one', 'test', time);
  assert.deepEqual(await saveHpi(env, 'one', attempt.id, 0, {}, true, time), {error: 'empty'});
  const expired = time + 90 * 86400000;
  assert.deepEqual(await saveHpi(env, 'one', attempt.id, 0, {b1:'o1'}, false, expired), {error:'not_found'});
  assert.equal(await sweepHpi(env, expired), 1);
  assert.equal(await sweepHpi(env, expired), 0);
  db.sqlite.close();
});

test('data-rights primitives tolerate a missing migration and isolate invitations', async () => {
  const {db, env} = fixture(false);
  assert.deepEqual(await exportHpi(env, 'one'), []);
  await eraseHpi(env, 'one'); await eraseHpiInvite(env, 'one');
  assert.equal(await sweepHpi(env), 0);
  db.sqlite.close();
  const fx = fixture();
  fx.db.sqlite.prepare('INSERT INTO hpi_research_invites VALUES (?, ?, ?)').run('one', 'admin', new Date(time).toISOString());
  await eraseHpi(fx.env, 'one');
  assert.equal(fx.db.sqlite.prepare('SELECT count(*) AS n FROM hpi_research_invites').get().n, 1);
  await eraseHpiInvite(fx.env, 'one');
  assert.equal(fx.db.sqlite.prepare('SELECT count(*) AS n FROM hpi_research_invites').get().n, 0);
  fx.db.sqlite.close();
});
