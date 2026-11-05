import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/assessment/[[path]].js';
import {practiceForSlug, AP_PRACTICE, AR_PRACTICE, PRACTICE_TABLES} from '../src/assessments/practice-tables.js';
import {practiceFeedbackFor, PRACTICE_ITEMS} from '../src/assessments/practice.js';
import {assertPracticeIsolation, assertNoPracticeReuse} from '../functions/lib/practice-isolation.js';
import {gradeBattery, parseAmount, validateBattery, BATTERY_ENGINE} from '../functions/lib/battery.js';
import {database} from './helpers/assessment-db.mjs';
import {screeningFixture} from './helpers/screening-fixture.mjs';

/* Accounts Receivable duplicate: the same battery-v2 platform, a second assessment family.
 * Every figure here is synthetic and trivial. No live question, option or key may enter this file
 * (the repository is public); the real package is verified privately by
 * private/assessments/ar-clerk-v1/verify-local.mjs. */

const origin = 'https://assessment.example';

// Two-family fixture: a read-only source tab, a writable working tab, and one document.
export const AR_SHAPE = {
  format: 'battery-v2',
  instructions: 'Synthetic receivable battery for automated tests. Read the statement and answer every task in the box.',
  sections: [
    { id: 'ar-knowledge', title: '1. Synthetic receivable knowledge', items: [
      { id: 'ak1', type: 'single', category: 'knowledge', points: 2, prompt: 'Synthetic receivable question: which option settles the account?',
        options: [{ id: 'o1', text: 'Arbor' }, { id: 'o2', text: 'Basalt' }, { id: 'o3', text: 'Cinder' }] },
      { id: 'ak2', type: 'text', category: 'knowledge', points: 2, prompt: 'Synthetic receivable text question: type the word LEDGER.' },
    ] },
    { id: 'ar-practical', title: '2. Synthetic receivable practical', items: [
      { id: 'ar1', type: 'cell', category: 'reconciliation', points: 3, ref: 'Working!B2', format: 'rand',
        prompt: 'Working!B2: total of the statement amounts.', instructions: 'Add the amount column.' },
      { id: 'ar2', type: 'cell', category: 'reconciliation', points: 3, ref: 'Working!B3', format: 'rand',
        prompt: 'Working!B3: the statement total less the receipt.' },
    ] },
  ],
  workbook: {
    sheets: [{ name: 'Statement', writable: false }, { name: 'Working', writable: true }],
    display: 'documents',
    documents: [{ title: 'Synthetic statement', range: 'Statement!A1:B4' }],
    source: {
      'Statement!A1': 'Ref', 'Statement!B1': 'Amount (R)',
      'Statement!A2': 'T-1', 'Statement!B2': '100',
      'Statement!A3': 'T-2', 'Statement!B3': '250',
      'Statement!A4': 'T-3', 'Statement!B4': '50',
      'Working!A1': 'Task', 'Working!B1': 'Answer',
      'Working!A2': 'Total', 'Working!A3': 'After receipt',
    },
  },
};
export const AR_SHAPE_KEY = {
  format: 'battery-v2', pass_percent: 75,
  items: { ak1: { answer: 'o2' }, ak2: { answer: 'ledger' }, ar1: { answer: 400, tolerance: 0.005 }, ar2: { answer: 320, tolerance: 0.005 } },
};

/* ---- practice selection: slug-driven, and the payable assessment is untouched ---- */

test('practice is selected by assessment slug and the payable default is unchanged', () => {
  assert.equal(practiceForSlug('ar-clerk-v1'), AR_PRACTICE);
  assert.equal(practiceForSlug('ap-clerk-v1'), AP_PRACTICE);
  // Every existing published payable slug and an unknown/empty slug keep today's practice.
  for (const slug of ['accounts-payable-clerk', 'open-browser-123', '', null, undefined, 'AR-clerk']) {
    assert.equal(practiceForSlug(slug), AP_PRACTICE, String(slug));
  }
  assert.equal(AR_PRACTICE.items.length, 3);
  assert.deepEqual(AR_PRACTICE.items.map(i => i.type), ['single', 'multi', 'cell']);
  assert.ok(AR_PRACTICE.items.every(i => !('points' in i)));
});

test('receivable practice gives correct feedback and never borrows payable items', () => {
  const [single, multi, cell] = AR_PRACTICE.items;
  assert.equal(practiceFeedbackFor(AR_PRACTICE, single.id, 'o1').correct, true);
  assert.equal(practiceFeedbackFor(AR_PRACTICE, single.id, 'o2').correct, false);
  assert.equal(practiceFeedbackFor(AR_PRACTICE, multi.id, ['o3', 'o1']).correct, true);
  assert.equal(practiceFeedbackFor(AR_PRACTICE, multi.id, ['o1', 'o2']).correct, false);
  assert.equal(practiceFeedbackFor(AR_PRACTICE, cell.id, '311.75').correct, true);
  assert.equal(practiceFeedbackFor(AR_PRACTICE, cell.id, 'R311,75'.replace(',', '.')).correct, true);
  assert.equal(practiceFeedbackFor(AR_PRACTICE, cell.id, '311').correct, false);
  // A payable id is unknown in the receivable table, and the reverse, so ids cannot cross tables.
  assert.throws(() => practiceFeedbackFor(AR_PRACTICE, PRACTICE_ITEMS[0].id, 'o1'), /Unknown practice item/);
  assert.throws(() => practiceFeedbackFor(AP_PRACTICE, AR_PRACTICE.items[0].id, 'o1'), /Unknown practice item/);
});

test('practice content is fingerprinted, not shared, between the two families', () => {
  for (const table of PRACTICE_TABLES) {
    const other = table === AP_PRACTICE ? AR_PRACTICE : AP_PRACTICE;
    const prompts = new Set(table.items.map(i => i.prompt.toLowerCase()));
    assert.ok(other.items.every(i => !prompts.has(i.prompt.toLowerCase())));
    assert.notDeepEqual(table.source, other.source);
  }
});

test('practice isolation is scoped to the family and covers every table when asked', () => {
  // A receivable battery is not compared with payable practice and vice versa.
  assert.doesNotThrow(() => assertPracticeIsolation(AR_SHAPE, AR_SHAPE_KEY, AR_PRACTICE));
  assertNoPracticeReuse(AR_SHAPE, AR_SHAPE_KEY);
  // But reuse of its own practice IS refused, in prompts, option text, resolved answers and tables.
  const reuse = (mutate) => { const p = structuredClone(AR_SHAPE), k = structuredClone(AR_SHAPE_KEY); mutate(p, k); return p; };
  const withPrompt = reuse((p) => { p.sections[0].items[0].prompt = '  ' + AR_PRACTICE.items[0].prompt.toUpperCase() + ' '; });
  assert.throws(() => assertPracticeIsolation(withPrompt, AR_SHAPE_KEY, AR_PRACTICE), /overlaps/);
  const withOption = reuse((p) => { p.sections[0].items[0].options[1].text = 'FERN'; });
  assert.throws(() => assertPracticeIsolation(withOption, AR_SHAPE_KEY, AR_PRACTICE), /overlaps/);
  const withAnswer = reuse(() => {});
  withAnswer.sections[1].items[1].type = 'text';
  const answerReuse = structuredClone(AR_SHAPE_KEY); answerReuse.items.ar2 = { answer: ' 311.75 ' };
  assert.throws(() => assertPracticeIsolation(withAnswer, answerReuse, AR_PRACTICE), /overlaps/);
  const withTable = reuse((p) => { p.workbook.source = { ...AR_PRACTICE.source }; });
  assert.throws(() => assertPracticeIsolation(withTable, AR_SHAPE_KEY, AR_PRACTICE), /overlaps/);
  // Cross-family reuse is caught by the unscoped check.
  const payableReuse = structuredClone(AR_SHAPE);
  payableReuse.sections[0].items[0].prompt = AP_PRACTICE.items[0].prompt;
  assert.throws(() => assertNoPracticeReuse(payableReuse, AR_SHAPE_KEY), /overlaps/);
});

/* ---- the duplicate actually runs through the public API ---- */

test('receivable battery validates, grades server-side and reports family-neutral engine', () => {
  const validated = validateBattery({ question_payload: AR_SHAPE, scoring_key: AR_SHAPE_KEY });
  assert.equal(validated.engine, BATTERY_ENGINE);
  assert.equal(BATTERY_ENGINE, 'battery-v2');
  const perfect = gradeBattery({ payload: AR_SHAPE, key: validated.scoring_key }, {
    mcq: { ak1: 'o2' }, structured: { text: { ak2: 'LEDGER' }, multi: {} },
    workbook: { 'Working!B2': '400', 'Working!B3': '=B2-80' },
  });
  assert.equal(perfect.overall_score, 100);
  assert.deepEqual(perfect.critical_flags, []);
  // A typed amount and a formula both grade, because the server evaluates the cell.
  assert.equal(parseAmount('R400,00'.replace(',', '.')), 400);
  const wrong = gradeBattery({ payload: AR_SHAPE, key: validated.scoring_key }, { mcq: { ak1: 'o1' }, structured: {}, workbook: { 'Working!B2': '399' } });
  assert.ok(wrong.overall_score < 100);
  assert.equal(wrong.items.find(i => i.id === 'ar1').correct, false);
});

async function setup(slug = 'ar-clerk-v1') {
  const db = database(), at = new Date().toISOString();
  db.sqlite.prepare('INSERT INTO assessment_definitions VALUES (?,?,?,?,600,?,?,?,?)')
    .run('ar', slug, 'Talent Tree', 'Accounts Receivable Clerk Assessment', 'arv1', 'published', at, at);
  db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)')
    .run('arv1', 'ar', 'v1', JSON.stringify(AR_SHAPE), JSON.stringify(AR_SHAPE_KEY), 'battery-v2', at, at);
  const env = { ASSESSMENT_DB: db, ASSESSMENT_ADMIN_KEY: 'synthetic-admin', ASSESSMENT_ID_HASH_KEY: 'synthetic-key-with-at-least32-characters-for-tests', ASSESSMENT_PII_KEY: btoa('0'.repeat(32)) };
  async function call(path, data, cookie, admin = false) {
    const response = await onRequest({ env, request: new Request(origin + '/api/assessment/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(admin ? { 'x-tt-assessment-admin': '1' } : {}), 'CF-Connecting-IP': '192.0.2.5' },
      body: data === undefined ? undefined : JSON.stringify(data),
    }) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const fields = { assessment_slug: slug, first_name: 'Synthetic', surname: 'Candidate', email: 'ar@example.invalid', consent_acknowledged: true, ...screeningFixture() };
  return { db, env, call, fields };
}

test('catalogue lists the receivable assessment with its own sections and no answer material', async () => {
  const t = await setup();
  const catalog = await t.call('catalog?slug=ar-clerk-v1');
  assert.equal(catalog.status, 200);
  const [item] = catalog.data;
  assert.equal(item.slug, 'ar-clerk-v1');
  assert.equal(item.title, 'Accounts Receivable Clerk Assessment');
  assert.deepEqual(item.section_titles, AR_SHAPE.sections.map(s => s.title));
  assert.equal(item.item_count, 4);
  // Public metadata only: no prompt, option text, resolved key value, weight or tolerance.
  const body = JSON.stringify(catalog.data);
  for (const secret of ['Arbor', 'Cinder', 'tolerance', 'points', 'category', 'scoring', 'prompt', 'options']) {
    assert.equal(body.includes(secret), false, secret);
  }
});

test('a receivable candidate starts, resumes, autosaves and is graded from the last saved state', async () => {
  const t = await setup();
  const started = await t.call('start', t.fields);
  assert.equal(started.status, 200, JSON.stringify(started.data));
  assert.equal(started.data.title, 'Accounts Receivable Clerk Assessment');
  // The candidate payload carries documents and answer cells, never keys or weights.
  assert.equal(started.data.assessment.workbook.display, 'documents');
  const startBody = JSON.stringify(started.data.assessment);
  for (const secret of ['tolerance', 'pass_percent', 'unsafe', 'category', 'points', 'scoring_key']) {
    assert.equal(startBody.includes(secret), false, secret);
  }
  // The correct choices ('o2', 'ledger') must not be reachable from the candidate payload.
  const blank = started.data.responses;
  assert.deepEqual(blank.mcq, {});
  assert.deepEqual(blank.workbook, {});
  assert.ok(Object.values(blank.structured || {}).every(v => v === undefined || Object.keys(v).length === 0 || v === null));

  const attemptId = started.data.attempt_id;
  const saved = await t.call('save', {
    attempt_id: attemptId, save_revision: 0,
    mcq: { ak1: 'o2' }, structured: { text: { ak2: 'ledger' }, multi: {} },
    workbook: { 'Working!B2': '400', 'Working!B3': '320' },
  }, started.cookie);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));

  // The client posts its whole draft on submit, as CandidateAssessment does.
  const submitted = await t.call('submit', {
    attempt_id: attemptId, save_revision: saved.data.save_revision,
    mcq: { ak1: 'o2' }, structured: { text: { ak2: 'ledger' }, multi: {} },
    workbook: { 'Working!B2': '400', 'Working!B3': '320' },
  }, started.cookie);
  assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
  assert.equal(submitted.data.candidate_result.overall_score, 100);
  assert.equal(submitted.data.candidate_result.sections.length, 2);
  // Candidates still see percentages only.
  const json = JSON.stringify(submitted.data);
  for (const hidden of ['question_review', 'correctAnswer', 'scoring_key', 'interpretation', 'workbook_source']) {
    assert.equal(json.includes(hidden), false, hidden);
  }
});

test('a read-only source tab and a non-writable reference are refused for the receivable battery', async () => {
  const t = await setup();
  const started = await t.call('start', t.fields);
  const attemptId = started.data.attempt_id;
  const sourceWrite = await t.call('save', { attempt_id: attemptId, save_revision: 0, mcq: {}, structured: {}, workbook: { 'Statement!B2': '999' } }, started.cookie);
  assert.equal(sourceWrite.status, 400);
  assert.match(sourceWrite.data.message, /read-only/i);
  const unknown = await t.call('save', { attempt_id: attemptId, save_revision: 0, mcq: { ak1: 'o9' }, structured: {}, workbook: {} }, started.cookie);
  assert.equal(unknown.status, 400);
});

test('a receivable draft that reuses its own practice cannot be published', async () => {
  const t = await setup();
  const login = await t.call('admin/login', { key: t.env.ASSESSMENT_ADMIN_KEY });
  const draft = await t.call('admin/draft', {
    slug: 'ar-clerk-v2', client_name: 'Talent Tree', title: 'Accounts Receivable Clerk Assessment',
    ...(() => { const p = structuredClone(AR_SHAPE); p.sections[0].items[0].prompt = AR_PRACTICE.items[0].prompt; return { question_payload: p, scoring_key: AR_SHAPE_KEY }; })(),
  }, login.cookie, true);
  assert.equal(draft.status, 200, JSON.stringify(draft.data));
  const publish = await t.call('admin/publish', { version_id: draft.data.version_id, content_approved: true, privacy_approved: true, approval_reference: 'Synthetic test only' }, login.cookie, true);
  assert.equal(publish.status, 400);
  assert.match(publish.data.message, /practice/i);
});
