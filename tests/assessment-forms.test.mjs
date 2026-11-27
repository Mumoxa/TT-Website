import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/assessment/[[path]].js';
import {chooseForm, formShape} from '../functions/lib/assessment-forms.js';
import {database} from './helpers/assessment-db.mjs';
import {SYNTHETIC} from './fixtures/synthetic-assessment.mjs';
import {SYNTHETIC_BATTERY, SYNTHETIC_BATTERY_KEY} from './fixtures/synthetic-battery.mjs';
import {screeningFixture} from './helpers/screening-fixture.mjs';

/* Parallel forms (owner decision 2026-11-27): a person is never given the same form twice, and has 2 attempts.
   Synthetic content only (public repository). */
const origin = 'https://assessment.example';

test('chooseForm draws only from untaken forms and says when none is left', () => {
  const forms = [{form_label: 'A', version_id: 'va'}, {form_label: 'B', version_id: 'vb'}, {form_label: 'C', version_id: 'vc'}];
  assert.deepEqual(chooseForm([], []), {none: true});
  assert.deepEqual(chooseForm(forms, ['A', 'B', 'C']), {exhausted: true});
  for (const r of [0, 0.5, 0.999]) assert.notEqual(chooseForm(forms, ['B'], () => r).form.form_label, 'B');
  assert.equal(chooseForm(forms, ['A', 'C'], () => 0.7).form.form_label, 'B');
  // Every untaken form is reachable.
  assert.deepEqual(new Set([0, 0.4, 0.8].map((r) => chooseForm(forms, [], () => r).form.form_label)), new Set(['A', 'B', 'C']));
});

test('formShape ignores wording and answers but not the blueprint', () => {
  const b = structuredClone(SYNTHETIC_BATTERY);
  b.sections[0].items[0].prompt = 'A different synthetic prompt with other figures.';
  b.sections[0].items[0].options = b.sections[0].items[0].options.map((o, i) => ({...o, text: 'Other ' + i}));
  assert.equal(formShape(b), formShape(SYNTHETIC_BATTERY));
  const fewer = structuredClone(SYNTHETIC_BATTERY);
  fewer.sections[0].items.pop();
  assert.notEqual(formShape(fewer), formShape(SYNTHETIC_BATTERY));
  const morePoints = structuredClone(SYNTHETIC_BATTERY);
  morePoints.sections[0].items[0].points += 1;
  assert.notEqual(formShape(morePoints), formShape(SYNTHETIC_BATTERY));
});

async function setup(labels = ['A', 'B', 'C']) {
  const db = database(), at = new Date().toISOString();
  db.sqlite.prepare('INSERT INTO assessment_definitions VALUES (?,?,?,?,600,?,?,?,?)').run('def', 'ar-clerk-v1', 'Talent Tree', 'Synthetic forms test', 'v-A', 'published', at, at);
  for (const label of labels) {
    db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)').run('v-' + label, 'def', 'v' + label, JSON.stringify(SYNTHETIC.question_payload), JSON.stringify(SYNTHETIC.scoring_key), 'test', at, at);
    db.sqlite.prepare('INSERT INTO assessment_forms (definition_id,version_id,form_label,active,created_at) VALUES (?,?,?,1,?)').run('def', 'v-' + label, label, at);
  }
  const env = {ASSESSMENT_DB: db, ASSESSMENT_ADMIN_KEY: 'synthetic-admin', ASSESSMENT_ID_HASH_KEY: 'synthetic-key-with-at-least32-characters-for-tests', ASSESSMENT_PII_KEY: btoa('0'.repeat(32))};
  async function call(path, data, cookie, admin = false) {
    const response = await onRequest({env, request: new Request(origin + '/api/assessment/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {Origin: origin, ...(cookie ? {Cookie: cookie} : {}), ...(admin ? {'x-tt-assessment-admin': '1'} : {}), 'CF-Connecting-IP': '192.0.2.7'},
      body: data === undefined ? undefined : JSON.stringify(data)})});
    return {status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0]};
  }
  const fields = (seed) => ({assessment_slug: 'ar-clerk-v1', first_name: 'Synthetic', surname: 'Candidate', email: `forms${seed}@example.invalid`, consent_acknowledged: true, ...screeningFixture(seed)});
  const formOf = (attemptId) => db.sqlite.prepare('SELECT f.form_label FROM attempts a JOIN assessment_forms f ON f.version_id=a.version_id WHERE a.id=?').get(attemptId).form_label;
  return {db, env, call, fields, formOf};
}

test('a person never gets the same form twice, and the second attempt is the last', async () => {
  const t = await setup();
  for (let seed = 1; seed <= 12; seed += 1) {
    const first = await t.call('start', t.fields(seed));
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const second = await t.call('start', t.fields(seed));
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.notEqual(t.formOf(first.data.attempt_id), t.formOf(second.data.attempt_id), `seed ${seed} repeated a form`);
    const third = await t.call('start', t.fields(seed));
    assert.equal(third.status, 403);
    assert.match(third.data.message, /second attempt is final/);
  }
  // Across people, every form is used.
  const used = t.db.sqlite.prepare('SELECT DISTINCT f.form_label l FROM attempts a JOIN assessment_forms f ON f.version_id=a.version_id').all().map((r) => r.l).sort();
  assert.deepEqual(used, ['A', 'B', 'C']);
});

test('a corrected form keeps its label: someone who took the old version never gets the correction', async () => {
  const t = await setup(['A', 'B']);
  // Find a person whose first attempt was form B.
  let seed = 100, first;
  do { seed += 1; first = await t.call('start', t.fields(seed)); } while (t.formOf(first.data.attempt_id) !== 'B');
  // Replace form B with a corrected version.
  const at = new Date().toISOString();
  t.db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)').run('v-B2', 'def', 'vB2', JSON.stringify(SYNTHETIC.question_payload), JSON.stringify(SYNTHETIC.scoring_key), 'test', at, at);
  t.db.sqlite.prepare("UPDATE assessment_forms SET active=0 WHERE version_id='v-B'").run();
  t.db.sqlite.prepare("INSERT INTO assessment_forms (definition_id,version_id,form_label,active,created_at) VALUES ('def','v-B2','B',1,?)").run(at);
  const second = await t.call('start', t.fields(seed));
  assert.equal(second.status, 200);
  assert.equal(t.formOf(second.data.attempt_id), 'A');
});

test('with fewer forms than attempts, a person who has taken every form is refused rather than given a repeat', async () => {
  const t = await setup(['A']);
  const first = await t.call('start', t.fields(300));
  assert.equal(first.status, 200);
  const second = await t.call('start', t.fields(300));
  assert.equal(second.status, 403);
  assert.match(second.data.message, /every version/);
  assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM attempts').get().n, 1);
});

test('an assessment without forms keeps using its current version', async () => {
  const t = await setup([]);
  t.db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)').run('v-A', 'def', 'vA', JSON.stringify(SYNTHETIC.question_payload), JSON.stringify(SYNTHETIC.scoring_key), 'test', new Date().toISOString(), new Date().toISOString());
  const a = await t.call('start', t.fields(400));
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(t.db.sqlite.prepare('SELECT version_id v FROM attempts').get().v, 'v-A');
});

test('publishing a form checks the blueprint, replaces the same label, and the report names the form', async () => {
  const t = await setup([]);
  const admin = (await t.call('admin/login', {key: t.env.ASSESSMENT_ADMIN_KEY})).cookie;
  const pkg = (payload) => ({slug: 'ar-clerk-v1', client_name: 'Talent Tree', title: 'Synthetic forms test', question_payload: payload, scoring_key: SYNTHETIC_BATTERY_KEY});
  const approve = {content_approved: true, privacy_approved: true, approval_reference: 'Synthetic local approval only'};
  const draftA = await t.call('admin/draft', pkg(SYNTHETIC_BATTERY), admin, true);
  assert.equal((await t.call('admin/publish', {version_id: draftA.data.version_id, form_label: 'A', ...approve}, admin, true)).status, 200);
  const other = structuredClone(SYNTHETIC_BATTERY);
  other.sections[0].items[0].prompt = 'Synthetic parallel prompt with different figures for form B.';
  const draftB = await t.call('admin/draft', pkg(other), admin, true);
  const publishedB = await t.call('admin/publish', {version_id: draftB.data.version_id, form_label: 'B', ...approve}, admin, true);
  assert.equal(publishedB.status, 200, JSON.stringify(publishedB.data));
  // A form with a different blueprint is refused.
  const broken = structuredClone(SYNTHETIC_BATTERY);
  broken.sections[0].items.pop();
  const brokenKey = structuredClone(SYNTHETIC_BATTERY_KEY);
  const removed = SYNTHETIC_BATTERY.sections[0].items.at(-1).id;
  delete brokenKey.items[removed];
  const draftBad = await t.call('admin/draft', {...pkg(broken), scoring_key: brokenKey}, admin, true);
  assert.equal(draftBad.status, 200, JSON.stringify(draftBad.data));
  const refused = await t.call('admin/publish', {version_id: draftBad.data.version_id, form_label: 'C', ...approve}, admin, true);
  assert.equal(refused.status, 400);
  assert.match(refused.data.message, /blueprint/);
  // Republishing B replaces it.
  const draftB2 = await t.call('admin/draft', pkg(other), admin, true);
  await t.call('admin/publish', {version_id: draftB2.data.version_id, form_label: 'B', ...approve}, admin, true);
  const active = t.db.sqlite.prepare('SELECT form_label l, version_id v FROM assessment_forms WHERE active=1 ORDER BY l').all();
  assert.deepEqual(active.map((r) => r.l), ['A', 'B']);
  assert.equal(active[1].v, draftB2.data.version_id);
  // The report names the form the attempt used.
  const started = await t.call('start', t.fields(500));
  assert.equal(started.status, 200, JSON.stringify(started.data));
  const report = await t.call('admin/report/' + started.data.attempt_id, undefined, admin, true);
  assert.match(report.data.attempt.form_label, /^[AB]$/);
  const list = await t.call('admin/list', undefined, admin, true);
  assert.match(list.data.attempts[0].form_label, /^[AB]$/);
});

test('the catalogue says whether a second attempt uses different questions, and nothing else about the forms', async () => {
  const t = await setup(['A', 'B']);
  const one = await t.call('catalog?slug=ar-clerk-v1');
  assert.equal(one.status, 200);
  assert.equal(one.data[0].parallel_forms, true);
  assert.doesNotMatch(JSON.stringify(one.data), /version_id|form_label|"B"/);
  t.db.sqlite.prepare("UPDATE assessment_forms SET active=0 WHERE form_label='B'").run();
  assert.equal((await t.call('catalog?slug=ar-clerk-v1')).data[0].parallel_forms, false);
});
