import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/assessment/[[path]].js';
import {practiceForSlug, AP_PRACTICE, AR_PRACTICE, PRACTICE_TABLES} from '../src/assessments/practice-tables.js';
import {practiceFeedbackFor, PRACTICE_ITEMS} from '../src/assessments/practice.js';
import {assertPracticeIsolation, assertNoPracticeReuse} from '../functions/lib/practice-isolation.js';
import {cleanBatteryWorkbook, gradeBattery, parseAmount, publicBattery, validateBattery, BATTERY_ENGINE} from '../functions/lib/battery.js';
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

/* ---------------------------------------------------------------- blueprint rules
 * The Talza blueprint's scoring rules, exercised on synthetic items only:
 * weighted sections, foundation/core/stretch levels, a single-document reference field,
 * a reviewer-marked handoff that is never auto-scored, and format errors before submission. */

const BLUEPRINT_KEY = { items: {
  ba1: { answer: 'o2' },
  ba2: { answer: 'GRN-77' },
  bb1: { answer: 800, tolerance: 0.005 },
  bb2: { answer: 'o2' },
  // A written handoff is scored by the server from these markers. No answer, no human, no exact
  // wording: the criteria are the marking scheme.
  bc1: { criteria: [
    { id: 'r1', label: 'Facts', all: ['INV-8841', 'bank detail'], any: ['unverified', 'not verified'] },
    { id: 'r2', label: 'Status', any: ['hold', 'held', 'holding', 'withhold'], none: ['release the refund', 'release it'] },
    { id: 'r3', label: 'Next action', all: ['will'], any: ['call', 'contact', 'verify', 'confirm'] },
    { id: 'r4', label: 'Timing', all: ['update'], any: ['13:55', '14:00', '15:00'] },
  ] },
} };

const BLUEPRINT_SHAPE = {
  format: 'battery-v2',
  instructions: 'Synthetic blueprint battery. Every figure is invented.',
  sections: [
    { id: 'part-a', title: 'A · Foundations', cap: 8, items: [
      { id: 'ba1', type: 'single', level: 'foundation', category: 'knowledge', points: 4,
        prompt: 'Which document proves the goods arrived?', options: [{ id: 'o1', text: 'The order' }, { id: 'o2', text: 'The delivery note' }] },
      { id: 'ba2', type: 'ref', level: 'core', category: 'reconciliation', points: 4,
        prompt: 'Type the ONE document code for the delivery.', instructions: 'Code only, no amount.' },
    ] },
    { id: 'part-b', title: 'B · Work sample', cap: 16, items: [
      { id: 'bb1', type: 'cell', level: 'core', category: 'reconciliation', points: 10, ref: 'Working!B2', format: 'rand',
        prompt: 'Working!B2: the invoice value outstanding.' },
      { id: 'bb2', type: 'single', level: 'stretch', category: 'reconciliation', points: 6,
        prompt: 'Which action follows a short payment?', options: [{ id: 'o1', text: 'Write it off' }, { id: 'o2', text: 'Query it and hold credit' }] },
    ] },
    { id: 'part-c', title: 'C · Written handoff', cap: 8, items: [
      // The marking scheme lives in the scoring key, never in the candidate payload.
      { id: 'bc1', type: 'note', level: 'core', category: 'reconciliation', points: 8,
        prompt: 'Write the handoff note for the finance lead.' },
    ] },
  ],
  workbook: {
    sheets: [{ name: 'Statement', writable: false }, { name: 'Working', writable: true }],
    display: 'documents',
    documents: [{ title: 'Synthetic statement', range: 'Statement!A1:B3' }],
    source: { 'Statement!A1': 'Ref', 'Statement!B1': 'Amount (R)', 'Statement!A2': 'INV-1', 'Statement!B2': '1200', 'Statement!A3': 'INV-2', 'Statement!B3': '800' },
    writable: ['Working!A1', 'Working!B1', 'Working!B2'],
  },
  activities: [
    { id: 'ba1', section: 'part-a' }, { id: 'ba2', section: 'part-a' },
    { id: 'bb1', section: 'part-b' }, { id: 'bb2', section: 'part-b' }, { id: 'bc1', section: 'part-c' },
  ],
  answer_labels: { 'Working!A1': 'Working note', 'Working!B1': 'Answer', 'Working!B2': 'Outstanding on the invoice' },
};

// A note that satisfies all four criteria, and variants that miss exactly one.
const GOOD_NOTE = 'The refund on INV-8841 is on hold: the bank detail change is unverified. I will call the contact on record. I will update you by 13:55.';

const blueprintPackage = (shape = BLUEPRINT_SHAPE, key = BLUEPRINT_KEY) => ({ question_payload: shape, scoring_key: key });
let cached = null;
const validated = () => (cached ??= validateBattery(blueprintPackage()));
const grade = (answers) => gradeBattery({ payload: BLUEPRINT_SHAPE, key: validated().scoring_key }, answers);
const ANSWERS = { mcq: { ba1: 'o2', bb2: 'o2' }, structured: { text: { ba2: 'GRN-77', bc1: GOOD_NOTE }, multi: {} }, workbook: { 'Working!B2': '800' } };
const withText = (extra) => ({ ...ANSWERS, structured: { ...ANSWERS.structured, text: { ...ANSWERS.structured.text, ...extra } } });

test('the blueprint battery validates with weighted sections and a 32-point total', () => {
  const out = validated();
  const sections = out.question_payload.sections;
  assert.equal(sections.map((s) => s.cap).join('/'), '8/16/8');
  assert.equal(sections.flatMap((s) => s.items).reduce((n, i) => n + i.points, 0), 32);
  // The cap is a weight, so every section's authored points must equal it exactly.
  for (const section of sections) assert.equal(section.items.reduce((n, i) => n + i.points, 0), section.cap);
});

test('section weights are point caps, so a section that does not add up is rejected', () => {
  const wrong = structuredClone(BLUEPRINT_SHAPE);
  wrong.sections[0].cap = 12;
  assert.throws(() => validateBattery(blueprintPackage(wrong)), /cap of 12 but its items total 8/);
});

test('a level outside foundation, core and stretch is rejected', () => {
  const wrong = structuredClone(BLUEPRINT_SHAPE);
  wrong.sections[0].items[0].level = 'expert';
  assert.throws(() => validateBattery(blueprintPackage(wrong)), /level/i);
});

test('the marking scheme never reaches the candidate payload', () => {
  const body = JSON.stringify(publicBattery(BLUEPRINT_SHAPE));
  for (const secret of ['criteria', 'markers', 'anchors']) assert.ok(!new RegExp('"' + secret + '"').test(body), secret);
});

test('a ref field scores the document code only, and an amount in that box scores zero', () => {
  assert.equal(grade(ANSWERS).items.find((i) => i.id === 'ba2').awarded, 4);
  assert.equal(grade(withText({ ba2: '1200' })).items.find((i) => i.id === 'ba2').awarded, 0);
  // One code, written either way, still scores.
  for (const typed of ['grn-77', 'GRN 77', ' GRN-77 ', 'grn77']) {
    assert.equal(grade(withText({ ba2: typed })).items.find((i) => i.id === 'ba2').awarded, 4, typed);
  }
});

test('the whole form is scored on submission, with nothing left pending', () => {
  const graded = grade(ANSWERS);
  assert.equal(graded.auto_scored_max, 32, 'every point, including the handoff, is automatic');
  assert.equal(graded.overall_score, 32);
  assert.equal(graded.pending_review_points, undefined);
  assert.equal(graded.items.find((i) => i.id === 'bc1').awarded, 8);
});

test('a handoff earns two points per criterion, and loses only the criterion it misses', () => {
  const awarded = (text) => grade(withText({ bc1: text })).items.find((i) => i.id === 'bc1').awarded;
  assert.equal(awarded(GOOD_NOTE), 8);
  assert.equal(awarded('The INV-8841 refund is on hold: the bank detail change is unverified. I will call the contact.'), 6, 'no time given');
  assert.equal(awarded('The INV-8841 refund: the bank detail change is unverified, hold it. Update by 13:55.'), 6, 'no owner action');
  // Releasing the refund loses the status criterion; "I will update you" also names no action, so
  // this variant loses two and the test pins exactly that.
  assert.equal(awarded('The INV-8841 refund: the bank detail change is unverified, so release the refund. I will update you by 13:55.'), 4, 'released the refund, no action');
  assert.equal(awarded('The INV-8841 refund: the bank detail change is unverified, so release it. I will call the customer and update you by 13:55.'), 6, 'released the refund');
  assert.equal(awarded(''), 0, 'a blank handoff earns nothing');
  assert.equal(awarded('It is fine, will handle it.'), 0, 'one vague sentence earns nothing');
});

test('a negative instruction is not read as the wrong decision', () => {
  const awarded = (text) => grade(withText({ bc1: text })).items.find((i) => i.id === 'bc1').awarded;
  // "do not release the refund" is the correct outcome, so the disqualifier must not fire on it.
  assert.equal(awarded('INV-8841 refund stays on hold: the bank detail change is unverified. I will contact the customer. I will not release the refund before 13:55. I will update you by 13:55.'), 8);
});

test('a handoff mark names the marker that produced it, so the score can be audited', () => {
  const note = grade(ANSWERS).items.find((i) => i.id === 'bc1').note;
  assert.equal(note.earned, 8);
  assert.equal(note.max, 8);
  for (const criterion of note.criteria) assert.equal(criterion.points, 2, `${criterion.id} earned ${criterion.points}`);
  assert.ok(note.criteria.every((c) => c.matched), 'every criterion records what matched');
});

test('a criterion without markers, or with too many points, is refused at build time', () => {
  const noMarkers = structuredClone(BLUEPRINT_KEY);
  noMarkers.items.bc1 = { criteria: [
    { id: 'r1', label: 'Facts' }, { id: 'r2', label: 'Status', any: ['hold'] },
    { id: 'r3', label: 'Next', any: ['call'] }, { id: 'r4', label: 'Timing', any: ['13:55'] },
  ] };
  assert.throws(() => validateBattery(blueprintPackage(BLUEPRINT_SHAPE, noMarkers)), /needs at least one positive marker/);
  // Disqualifiers alone are refused too: they would award the points to any text that avoids the word.
  const noneOnly = structuredClone(BLUEPRINT_KEY);
  noneOnly.items.bc1 = { criteria: [
    { id: 'r1', label: 'Facts', none: ['wrong'] }, { id: 'r2', label: 'Status', any: ['hold'] },
    { id: 'r3', label: 'Next', any: ['call'] }, { id: 'r4', label: 'Timing', any: ['13:55'] },
  ] };
  assert.throws(() => validateBattery(blueprintPackage(BLUEPRINT_SHAPE, noneOnly)), /positive marker/);

  const imbalance = structuredClone(BLUEPRINT_KEY);
  imbalance.items.bc1 = { criteria: [{ id: 'r1', label: 'Facts', any: ['hold'] }, { id: 'r2', label: 'Rest', any: ['call'] }] };
  assert.throws(() => validateBattery(blueprintPackage(BLUEPRINT_SHAPE, imbalance)), /worth 8 points but has 2 criteria/);
});

test('field points are all-or-nothing: a near miss earns zero, not part marks', () => {
  const graded = gradeBattery({ payload: BLUEPRINT_SHAPE, key: validated().scoring_key },
    { ...ANSWERS, workbook: { 'Working!B2': '801' } });
  assert.equal(graded.items.find((i) => i.id === 'bb1').awarded, 0);
});

test('a signed amount is refused on entry, so it can never reach the score', () => {
  // Amount boxes are keyed by canonRef: lower-case sheet, upper-case cell.
  const rules = { writableSheets: new Set(['working']), sourceCanon: new Set(), amountRefs: new Set(['working!B2']) };
  assert.throws(() => cleanBatteryWorkbook({ 'Working!B2': '-800' }, rules), /positive amount, without a minus/);
  assert.throws(() => cleanBatteryWorkbook({ 'Working!B2': '(−800)' }, rules), /positive amount, without a minus/);
  assert.deepEqual(cleanBatteryWorkbook({ 'Working!B2': '800' }, rules), { 'Working!B2': '800' });
  // A count box is not an amount box, so a plain negative is a wrong answer rather than a format error.
  assert.equal(cleanBatteryWorkbook({ 'Working!A1': '-3' }, { ...rules, amountRefs: new Set() })['Working!A1'], '-3');
});

test('the three accepted amount formats parse to the same cents', () => {
  for (const typed of ['R2 300,00', '2,300.00', '2300']) assert.equal(parseAmount(typed), 2300, typed);
});

/* ---------------------------------------------------------------- the final view
 * The report uses combineScores; every point is automatic, so there is never a pending total. */

import {combineScores, cleanNoteText, scoreNote, scoreCriterion, matchUnnegated} from '../functions/lib/assessment-review.js';

test('a submitted attempt always has a final total', () => {
  const combined = combineScores(grade(ANSWERS));
  assert.equal(combined.status, 'scored');
  assert.equal(combined.total, 32);
  assert.equal(combined.total_max, 32);
  assert.equal(combined.percent, 100);
  assert.equal(combined.review_score, null, 'no human award is part of a total');
});

test('a partial score is a final score, not a pending one', () => {
  const combined = combineScores(grade(withText({ bc1: '' })));
  assert.equal(combined.total, 24);
  assert.equal(combined.total_max, 32);
  assert.equal(combined.status, 'scored');
});

test('markers match whole words only, so a marker cannot fire inside another word', () => {
  assert.equal(scoreCriterion({ id: 'r', any: ['hold'] }, 'the household account is fine').points, 0);
  assert.equal(scoreCriterion({ id: 'r', any: ['hold'] }, 'please hold this payment').points, 2);
  assert.equal(scoreCriterion({ id: 'r', all: ['will'], any: ['call'] }, 'we will call').points, 2);
  assert.equal(scoreCriterion({ id: 'r', all: ['will'], any: ['call'] }, 'call was made').points, 0);
});

test('a negated decision does not earn the criterion it negates', () => {
  const status = { id: 'r', any: ['hold', 'held'], none: ['release it'] };
  // "do not hold it" is not a decision to hold: the marker must be read as negated.
  assert.equal(scoreCriterion(status, 'do not hold it, it can go ahead').points, 0);
  // A negation that RETRACTS an earlier mention in the same breath is a known limit, not a supported
  // case: "hold it? no, do not hold" reads as the first mention. No realistic note is written that
  // way, and the standing instruction is not to fit heuristics to contrived phrasing.
  assert.equal(scoreCriterion(status, 'not only will I hold it, I will call the customer').points, 2, '"not only" is additive');
  assert.equal(scoreCriterion(status, 'we will hold the payment').points, 2);
});

test('a negated disqualifier is not a disqualifier', () => {
  assert.equal(matchUnnegated('we will not release it today', ['release it']), null);
  assert.equal(matchUnnegated('we will release it today', ['release it']), 'release it');
  assert.equal(matchUnnegated('never release it before verification', ['release it']), null);
});

test('a negation in one clause cannot hide a real disqualifier in another', () => {
  // A wide negation window silently suppressed this and awarded the point. It must not.
  const status = { id: 'r', any: ['hold'], none: ['release the refund'] };
  const row = scoreCriterion(status, 'do not touch the ledger, release the refund');
  assert.equal(row.points, 0);
  assert.equal(row.blocked_by, 'release the refund');
  // ...while the same negation in the same clause does suppress it.
  assert.equal(scoreCriterion(status, 'do not release the refund; hold it').points, 2);
});

test('a criterion must be earnable: disqualifiers alone cannot carry points', () => {
  // Text that says nothing would trip no disqualifier and collect the points by default.
  assert.equal(scoreCriterion({ id: 'r', none: ['release'] }, 'anything at all').points, 0);
  assert.equal(scoreCriterion({ id: 'r' }, 'some text').points, 0);
  assert.equal(scoreCriterion({ id: 'r', none: ['release'] }, 'some text').invalid, 'no positive marker');
});

test('an empty handoff scores zero on every criterion', () => {
  const note = scoreNote(BLUEPRINT_KEY.items.bc1, '');
  assert.equal(note.earned, 0);
  assert.equal(note.blank, true);
  assert.ok(note.criteria.every((c) => c.points === 0));
});

test('candidate prose is trimmed but keeps the lines the candidate wrote', () => {
  assert.equal(cleanNoteText('  first\r\nsecond  '), 'first\nsecond');
  assert.equal(cleanNoteText(undefined), '');
  assert.equal(cleanNoteText('x'.repeat(2000)).length, 1200);
});

/* ---------------------------------------------------------------- the routes
 * Nothing a person does can change a score. The only human record left is the hiring decision. */

async function emptyHarness() {
  const db = database();
  const env = { ASSESSMENT_DB: db, ASSESSMENT_ADMIN_KEY: 'synthetic-admin', ASSESSMENT_ID_HASH_KEY: 'synthetic-key-with-at-least32-characters-for-tests', ASSESSMENT_PII_KEY: btoa('0'.repeat(32)) };
  async function call(path, data, cookie, admin = false) {
    const response = await onRequest({ env, request: new Request(origin + '/api/assessment/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(admin ? { 'x-tt-assessment-admin': '1' } : {}), 'CF-Connecting-IP': '192.0.2.5' },
      body: data === undefined ? undefined : JSON.stringify(data),
    }) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  return { db, env, call, fields: { assessment_slug: 'ar-marked-v1', first_name: 'Synthetic', surname: 'Candidate', email: 'ar@example.invalid', consent_acknowledged: true, ...screeningFixture() } };
}

// Publish the blueprint fixture and submit a perfect sheet, including a compliant handoff.
async function scoredAttempt() {
  const t = await emptyHarness();
  const login = await t.call('admin/login', { key: t.env.ASSESSMENT_ADMIN_KEY });
  const cookie = login.cookie;
  const draft = await t.call('admin/draft', {
    ...blueprintPackage(), slug: 'ar-marked-v1', client_name: 'Talent Tree', title: 'Synthetic Scored Handoff Assessment',
  }, cookie, true);
  const published = await t.call('admin/publish', { version_id: draft.data.version_id, content_approved: true, privacy_approved: true, approval_reference: 'synthetic only' }, cookie, true);
  assert.equal(published.status, 200, JSON.stringify(published.data));
  const started = await t.call('start', t.fields);
  assert.equal(started.status, 200, JSON.stringify(started.data));
  const submitted = await t.call('submit', { ...ANSWERS, attempt_id: started.data.attempt_id, save_revision: 0 }, started.cookie);
  assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
  return { ...t, cookie, attemptId: started.data.attempt_id };
}

test('an attempt is scored the moment it is submitted, handoff included', async () => {
  const t = await scoredAttempt();
  const report = await t.call('admin/report/' + t.attemptId, undefined, t.cookie);
  assert.equal(report.status, 200, JSON.stringify(report.data));
  assert.equal(report.data.result.score_status, 'scored');
  assert.equal(report.data.result.overall_score, 32);
  assert.equal(report.data.result.review.combined.total, 32);
  assert.equal(report.data.result.review.combined.total_max, 32);
  // The handoff evidence is reported so the score can be audited.
  const [note] = report.data.result.review.notes;
  assert.equal(note.id, 'bc1');
  assert.equal(note.earned, 8);
  assert.equal(note.criteria.length, 4);
  assert.match(String(report.data.question_review.find((q) => q.id === 'bc1').chosen), /INV-8841/);
});

test('there is no longer any way to mark a handoff by hand', async () => {
  const t = await scoredAttempt();
  const review = await t.call('admin/review/' + t.attemptId, { reviewer: 'x', marks: { bc1: { r1: 2 } } }, t.cookie, true);
  assert.equal(review.status, 404, 'the reviewer-marking route is retired');
  const scored = await t.call('admin/report/' + t.attemptId, undefined, t.cookie);
  assert.equal(scored.data.result.review.combined.total, 32, 'the score did not move');
});

test('the decision is still recorded separately from the score and needs a reason', async () => {
  const t = await scoredAttempt();
  const short = await t.call('admin/decision/' + t.attemptId, { decision: 'advance', reason: 'ok', decided_by: 'Synthetic' }, t.cookie, true);
  assert.equal(short.status, 400);
  const bad = await t.call('admin/decision/' + t.attemptId, { decision: 'maybe', reason: 'Adequate reasoning here', decided_by: 'Synthetic' }, t.cookie, true);
  assert.equal(bad.status, 400);
  const ok = await t.call('admin/decision/' + t.attemptId, { decision: 'advance', reason: 'Reconciliation evidence is strong', decided_by: 'Synthetic Lead' }, t.cookie, true);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const reported = await t.call('admin/report/' + t.attemptId, undefined, t.cookie);
  assert.equal(reported.data.result.decision.decision, 'advance');
  assert.equal(reported.data.result.score_status, 'scored');
  assert.equal(reported.data.result.review.combined.total, 32, 'a decision never edits a score');
});

test('a candidate cannot reach the decision route', async () => {
  const t = await scoredAttempt();
  const started = await t.call('start', t.fields);
  const attempt = await t.call('admin/decision/' + started.data.attempt_id, { decision: 'advance', reason: 'Synthetic reasoning', decided_by: 'x' }, started.cookie, true);
  assert.ok([401, 403].includes(attempt.status), String(attempt.status));
});

test('a decision is audited against the authenticated admin, not a typed-in name', async () => {
  const t = await scoredAttempt();
  await t.call('admin/decision/' + t.attemptId, {
    decision: 'hold', reason: 'Awaiting a second reference', decided_by: 'Some Name Typed In',
  }, t.cookie, true);
  const row = t.db.sqlite.prepare(
    "SELECT actor_id FROM audit_events WHERE attempt_id=? AND event_type='assessment.decision_recorded'"
  ).get(t.attemptId);
  // A free-text name must never become the audit actor: a caller could write anything there.
  assert.notEqual(row.actor_id, 'Some Name Typed In');
  assert.equal(row.actor_id, 'assessment-admin');
  // The typed name is still recorded where it belongs.
  const decision = t.db.sqlite.prepare('SELECT decided_by FROM assessment_decisions WHERE attempt_id=?').get(t.attemptId);
  assert.equal(decision.decided_by, 'Some Name Typed In');
});

test('audit events keep their insertion order within the same second', async () => {
  const t = await scoredAttempt();
  await t.call('admin/report/' + t.attemptId, undefined, t.cookie);
  await t.call('admin/decision/' + t.attemptId, { decision: 'advance', reason: 'Strong evidence throughout', decided_by: 'Lead' }, t.cookie, true);
  const report = await t.call('admin/report/' + t.attemptId, undefined, t.cookie);
  const events = report.data.audit_events.map((e) => e.event_type);
  // created_at has one-second resolution, so submission and the first report view land in the same
  // second; ordering must not depend on that column alone.
  assert.ok(events.includes('assessment.submitted'));
  assert.ok(events.indexOf('assessment.submitted') < events.indexOf('assessment.decision_recorded'));
});
