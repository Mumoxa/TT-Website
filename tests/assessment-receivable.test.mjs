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
  // Never auto-scored: a reviewer marks 0/1/2 on each criterion. Two points per criterion.
  bc1: { rubric: [
    { id: 'r1', label: 'Facts', anchors: ['Wrong fact', 'Partly right', 'Facts restated correctly'] },
    { id: 'r2', label: 'Status', anchors: ['No status', 'Vague', 'Clear status'] },
    { id: 'r3', label: 'Next action', anchors: ['None', 'Action without owner', 'Action with owner'] },
    { id: 'r4', label: 'Timing', anchors: ['No time', 'Vague time', 'Specific time'] },
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
      // The rubric lives in the scoring key, never in the candidate payload.
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

// validateBattery takes a package and returns the key that will be published.
const blueprintPackage = (shape = BLUEPRINT_SHAPE, key = BLUEPRINT_KEY) => ({ question_payload: shape, scoring_key: key });
let cached = null;
const validated = () => (cached ??= validateBattery(blueprintPackage()));
const grade = (answers) => gradeBattery({ payload: BLUEPRINT_SHAPE, key: validated().scoring_key }, answers);
const ANSWERS = { mcq: { ba1: 'o2', bb2: 'o2' }, structured: { text: { ba2: 'GRN-77' }, multi: {} }, workbook: { 'Working!B2': '800' } };
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

test('the rubric never reaches the candidate payload', () => {
  const body = JSON.stringify(publicBattery(BLUEPRINT_SHAPE));
  assert.ok(!/rubric/.test(body));
  assert.ok(!/anchors/.test(body));
});

test('a ref field scores the document code only, and an amount in that box scores zero', () => {
  assert.equal(grade(ANSWERS).items.find((i) => i.id === 'ba2').awarded, 4);
  assert.equal(grade(withText({ ba2: '1200' })).items.find((i) => i.id === 'ba2').awarded, 0);
  // One code, written either way, still scores.
  for (const typed of ['grn-77', 'GRN 77', ' GRN-77 ', 'grn77']) {
    assert.equal(grade(withText({ ba2: typed })).items.find((i) => i.id === 'ba2').awarded, 4, typed);
  }
});

test('the reviewer-marked handoff is pending, never auto-scored, and never inflates the auto total', () => {
  const graded = grade(withText({ bc1: 'A perfectly reasonable note.' }));
  assert.equal(graded.pending_review_points, 8);
  assert.equal(graded.auto_scored_max, 24);
  assert.equal(graded.overall_score, 24, 'a written note must not add points on its own');
  assert.equal(graded.items.find((i) => i.id === 'bc1').pending_review, true);
  assert.equal(graded.items.find((i) => i.id === 'bc1').awarded, 0);
});

test('field points are all-or-nothing: a near miss earns zero, not part marks', () => {
  const graded = gradeBattery({ payload: BLUEPRINT_SHAPE, key: validated().scoring_key },
    { ...ANSWERS, workbook: { 'Working!B2': '801' } });
  assert.equal(graded.items.find((i) => i.id === 'bb1').awarded, 0);
});

test('a signed amount is refused on entry, so it can never reach the score', () => {
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

/* ---------------------------------------------------------------- reviewer marking
 * The handoff rubric is marked by a person. These tests pin the rules that stop a mark from being
 * invented, silently rounded up, or allowed to replace the original record. */

import {combineScores, cleanNoteText, noteRubric, validateReview, ReviewError} from '../functions/lib/assessment-review.js';

const REVIEW_KEY = validated().scoring_key;
const reviewPayload = validated().question_payload;
const FULL_MARKS = { bc1: { r1: 2, r2: 2, r3: 2, r4: 2 } };

test('the rubric a reviewer sees carries labels and all three anchors per criterion', () => {
  const [note] = noteRubric(reviewPayload, REVIEW_KEY);
  assert.equal(note.item_id, 'bc1');
  assert.equal(note.points, 8);
  assert.equal(note.criteria.length, 4);
  for (const criterion of note.criteria) assert.equal(criterion.anchors.length, 3);
});

test('every criterion must be marked, with 0, 1 or 2 only', () => {
  const ok = validateReview(reviewPayload, REVIEW_KEY, { marks: FULL_MARKS });
  assert.equal(ok.earned, 8);
  assert.equal(ok.max, 8);
  assert.throws(() => validateReview(reviewPayload, REVIEW_KEY, { marks: { bc1: { r1: 2, r2: 2, r3: 2 } } }), ReviewError);
  assert.throws(() => validateReview(reviewPayload, REVIEW_KEY, { marks: { bc1: { r1: 2, r2: 3, r3: 2, r4: 2 } } }), /0, 1 or 2/);
  assert.throws(() => validateReview(reviewPayload, REVIEW_KEY, { marks: { bc1: { r1: 1.5, r2: 2, r3: 2, r4: 2 } } }), /0, 1 or 2/);
  assert.throws(() => validateReview(reviewPayload, REVIEW_KEY, { marks: { bc1: { r1: 2, r2: 2, r3: 2, r4: 2, r9: 2 } } }), /Unknown criterion/);
  assert.throws(() => validateReview(reviewPayload, REVIEW_KEY, { marks: { bc1: { r1: 2 } } }), ReviewError);
});

test('a pending handoff has no total until it is marked', () => {
  const graded = grade(ANSWERS);
  const pendingResult = combineScores(graded, null);
  assert.equal(pendingResult.status, 'pending_review');
  assert.equal(pendingResult.total, null, 'a pending attempt must not show a final total');
  assert.equal(pendingResult.partial_total, 24);

  const marked = combineScores(graded, { earned: 6, max: 8 });
  assert.equal(marked.status, 'scored');
  assert.equal(marked.total, 30);
  assert.equal(marked.total_max, 32);
  assert.equal(marked.percent, 93.8);
});

test('a form without reviewer-marked items is scored immediately', () => {
  const combined = combineScores({ overall_score: 40, auto_scored_max: 50, pending_review_points: 0 }, null);
  assert.equal(combined.status, 'scored');
  assert.equal(combined.total, 40);
});

test('candidate prose is trimmed but keeps the lines the reviewer needs', () => {
  assert.equal(cleanNoteText('  first\r\nsecond  '), 'first\nsecond');
  assert.equal(cleanNoteText(undefined), '');
  assert.equal(cleanNoteText('x'.repeat(2000)).length, 1200);
});

/* ---------------------------------------------------------------- reviewer routes
 * The two write routes are admin-only, audited, and separate: a decision never edits a score. */

// The review routes need a genuinely published version, so this harness starts from an empty
// database and publishes the blueprint fixture through the admin API.
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

// Publish the blueprint fixture, submit a perfect answer sheet, and return the attempt id.
async function markedAttempt() {
  const t = await emptyHarness();
  const login = await t.call('admin/login', { key: t.env.ASSESSMENT_ADMIN_KEY });
  const cookie = login.cookie;
  const draft = await t.call('admin/draft', {
    ...blueprintPackage(), slug: 'ar-marked-v1', client_name: 'Talent Tree', title: 'Synthetic Marked Handoff Assessment',
  }, cookie, true);
  const published = await t.call('admin/publish', { version_id: draft.data.version_id, content_approved: true, privacy_approved: true, approval_reference: 'synthetic only' }, cookie, true);
  assert.equal(published.status, 200, JSON.stringify(published.data));
  const started = await t.call('start', { ...t.fields, assessment_slug: 'ar-marked-v1' });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  const withHandoff = { ...ANSWERS, structured: { ...ANSWERS.structured, text: { ...ANSWERS.structured.text, bc1: 'A perfectly reasonable note: the invoice is held, the run is 14:00, I will call by 13:55.' } } };
  const submitted = await t.call('submit', { ...withHandoff, attempt_id: started.data.attempt_id, save_revision: 0 }, started.cookie);
  assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
  return { ...t, cookie, attemptId: started.data.attempt_id };
}

test('marking and deciding require an admin session', async () => {
  const t = await markedAttempt();
  const noCookie = await t.call('admin/review/' + t.attemptId, { reviewer: 'x', marks: { bc1: { r1: 2, r2: 2, r3: 2, r4: 2 } } }, null, true);
  assert.equal(noCookie.status, 401);
  // A session cookie alone is not enough: the admin header is also required.
  const noHeader = await t.call('admin/review/' + t.attemptId, { reviewer: 'x', marks: { bc1: { r1: 2, r2: 2, r3: 2, r4: 2 } } }, t.cookie, false);
  assert.equal(noHeader.status, 403);
  const decisionNoAuth = await t.call('admin/decision/' + t.attemptId, { decision: 'hold', reason: 'synthetic reason', decided_by: 'x' }, null, true);
  assert.equal(decisionNoAuth.status, 401);
});

test('a marked handoff completes the report without changing the automatic award', async () => {
  const t = await markedAttempt();
  const before = await t.call('admin/report/' + t.attemptId, undefined, t.cookie);
  assert.equal(before.status, 200, JSON.stringify(before.data));
  assert.equal(before.data.result.score_status, 'pending_review');
  assert.equal(before.data.result.review.combined.total, null, 'a pending handoff must not show a total');
  assert.equal(before.data.result.review.combined.partial_total, 24);
  assert.equal(before.data.result.review.combined.auto_max, 24);
  assert.equal(before.data.result.review.rubric[0].criteria.length, 4);

  const marks = await t.call('admin/review/' + t.attemptId, { reviewer: 'Synthetic Reviewer', marks: { bc1: { r1: 2, r2: 1, r3: 1, r4: 1 } }, rationale: 'Covers the hold and the timing.' }, t.cookie, true);
  assert.equal(marks.status, 200, JSON.stringify(marks.data));
  assert.equal(marks.data.earned, 5);

  const after = await t.call('admin/report/' + t.attemptId, undefined, t.cookie);
  assert.equal(after.data.result.score_status, 'scored');
  assert.equal(after.data.result.overall_score, 24, 'the automatic score must not move');
  assert.equal(after.data.result.review.combined.total, 29);
  assert.equal(after.data.result.review.combined.total_max, 32);
  assert.equal(after.data.result.review.combined.auto_score, 24);
  // The reviewer sees the candidate's own words, and only this candidate's words.
  const note = after.data.question_review.find((q) => q.id === 'bc1');
  assert.match(String(note.chosen), /reasonable note/);
});

test('a correction replaces a mark only with a recorded reason, and keeps the history', async () => {
  const t = await markedAttempt();
  const full = { bc1: { r1: 2, r2: 2, r3: 2, r4: 2 } };
  await t.call('admin/review/' + t.attemptId, { reviewer: 'First Reviewer', marks: full }, t.cookie, true);

  const noReason = await t.call('admin/review/' + t.attemptId, { reviewer: 'Second Reviewer', marks: { bc1: { r1: 2, r2: 2, r3: 2, r4: 1 } } }, t.cookie, true);
  assert.equal(noReason.status, 400, JSON.stringify(noReason.data));

  const corrected = await t.call('admin/review/' + t.attemptId, { reviewer: 'Second Reviewer', marks: { bc1: { r1: 2, r2: 2, r3: 2, r4: 1 } }, reason: 'Timing anchor re-read against the note' }, t.cookie, true);
  assert.equal(corrected.status, 200, JSON.stringify(corrected.data));
  assert.equal(corrected.data.earned, 7);
  const reported = await t.call('admin/report/' + t.attemptId, undefined, t.cookie);
  assert.equal(reported.data.result.review.marks.revision, 2, 'the live mark moves to revision 2');
  assert.equal(reported.data.result.review.marks.earned, 7);
  // The original mark is not overwritten: it is an appended revision in the audit history.
  // One row per replaced mark: the first mark is copied into the history before the live row moves on.
  const history = t.db.sqlite.prepare('SELECT revision, earned, reason FROM assessment_review_revisions WHERE attempt_id=? ORDER BY revision').all(t.attemptId);
  assert.equal(history.length, 1);
  assert.equal(history[0].revision, 1);
  assert.equal(history[0].earned, 8, 'the superseded award is kept exactly');
  assert.match(history[0].reason, /Timing anchor/);
});

test('an incomplete or invented mark is refused with a 400, not a silent zero', async () => {
  const t = await markedAttempt();
  const incomplete = await t.call('admin/review/' + t.attemptId, { reviewer: 'R', marks: { bc1: { r1: 2 } } }, t.cookie, true);
  assert.equal(incomplete.status, 400);
  const invented = await t.call('admin/review/' + t.attemptId, { reviewer: 'R', marks: { bc1: { r1: 2, r2: 2, r3: 2, r4: 2, r8: 2 } } }, t.cookie, true);
  assert.equal(invented.status, 400);
  const three = await t.call('admin/review/' + t.attemptId, { reviewer: 'R', marks: { bc1: { r1: 3, r2: 2, r3: 2, r4: 2 } } }, t.cookie, true);
  assert.equal(three.status, 400);
});

test('the decision is recorded separately from the score and needs a reason', async () => {
  const t = await markedAttempt();
  const short = await t.call('admin/decision/' + t.attemptId, { decision: 'advance', reason: 'ok', decided_by: 'Synthetic' }, t.cookie, true);
  assert.equal(short.status, 400);
  const bad = await t.call('admin/decision/' + t.attemptId, { decision: 'maybe', reason: 'Adequate reasoning here', decided_by: 'Synthetic' }, t.cookie, true);
  assert.equal(bad.status, 400);
  const ok = await t.call('admin/decision/' + t.attemptId, { decision: 'advance', reason: 'Reconciliation evidence is strong', decided_by: 'Synthetic Lead' }, t.cookie, true);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const reported = await t.call('admin/report/' + t.attemptId, undefined, t.cookie);
  assert.equal(reported.data.result.decision.decision, 'advance');
  assert.equal(reported.data.result.decision.decided_by, 'Synthetic Lead');
  // The score is still pending, because a decision is not a mark.
  assert.equal(reported.data.result.score_status, 'pending_review');
});

test('a candidate cannot reach the reviewer routes at all', async () => {
  const t = await markedAttempt();
  const started = await t.call('start', { ...t.fields, assessment_slug: 'ar-marked-v1' });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  const attempt = await t.call('admin/review/' + started.data.attempt_id, { reviewer: 'x', marks: { bc1: { r1: 2, r2: 2, r3: 2, r4: 2 } } }, started.cookie, true);
  assert.ok([401, 403].includes(attempt.status), String(attempt.status));
  assert.equal(t.attemptId === started.data.attempt_id, false);
});
