/**
 * Talent Tree AP assessments: pure validation, scoring, and payload safeguards.
 * Production question payloads + correct answers are PRIVATE D1 records.
 * Never commit or ship a live answer key in this public repository.
 */
import { canPersistAttempt, expiryForStart } from './assessment-deadlines.js';

export const ASSESSMENT_COOKIE = 'tt_assessment_session';
export const SESSION_SECONDS = 60 * 60; // absolute attempt expiry remains 600s
export const MAX_BODY_BYTES = 90_000;
export const MAX_WORKBOOK_BYTES = 48_000;
export const MAX_ANSWER_ITEMS = 100;
const ID = /^[a-zA-Z0-9][\w.-]{0,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function apiJson(value, status = 200, more = {}) {
  return new Response(JSON.stringify(value), {
    status, headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      ...more,
    },
  });
}

export function failure(message, status = 400) {
  return apiJson({ ok: false, message }, status);
}

export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false; // all browser writes carry Origin
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

export async function requestJson(request) {
  const rawLength = Number(request.headers.get('content-length') || 0);
  if (rawLength > MAX_BODY_BYTES) throw new Error('Request too large.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new Error('Request too large.');
  try { return JSON.parse(raw); } catch { throw new Error('Invalid JSON.'); }
}

export function normalizeIdentity(details) {
  const first = typeof details?.first_name === 'string' ? details.first_name.trim().replace(/\s+/g, ' ') : '';
  const surname = typeof details?.surname === 'string' ? details.surname.trim().replace(/\s+/g, ' ') : '';
  const email = typeof details?.email === 'string' ? details.email.trim().toLowerCase() : '';
  if (first.length < 2 || first.length > 100 || surname.length < 2 || surname.length > 100 || !EMAIL.test(email) || email.length > 254) {
    throw new Error('Please enter a valid first name, surname and email address.');
  }
  if (details?.consent_acknowledged !== true) throw new Error('You must acknowledge the assessment privacy notice.');
  return { first_name: first, surname, email };
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('');
}
export async function tokenHash(token) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
export function isToken(token) { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token); }
export function id() { return crypto.randomUUID(); }
export function nowIso() { return new Date().toISOString(); }

export function cookieHeader(request, token) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return ASSESSMENT_COOKIE + '=' + token + '; HttpOnly; SameSite=Strict; Path=/api/assessment; Max-Age=' + SESSION_SECONDS + secure;
}
export function getCookie(request) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(ASSESSMENT_COOKIE + '='));
  const value = cookie ? cookie.slice(ASSESSMENT_COOKIE.length + 1) : '';
  return isToken(value) ? value : null;
}

function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function validId(value) { return typeof value === 'string' && ID.test(value); }
export function validateAssessmentPackage(pkg) {
  if (!object(pkg) || !object(pkg.question_payload) || !object(pkg.scoring_key)) throw new Error('Assessment package requires question_payload and scoring_key.');
  const questions = pkg.question_payload.questions;
  const scenario = pkg.question_payload.scenario;
  const key = pkg.scoring_key;
  if (!Array.isArray(questions) || questions.length !== 5 || !object(scenario) ||
    !Array.isArray(scenario.supplier) || !Array.isArray(scenario.ledger) ||
    !Array.isArray(scenario.action_options) || !object(key.mcq) ||
    !Array.isArray(key.discrepancies) || key.discrepancies.length !== 3 ||
    !object(key.actions) || key.corrected_balance === null || key.corrected_balance === '' || !Number.isFinite(Number(key.corrected_balance))) {
    throw new Error('Assessment must contain 5 scenario MCQs and a three-discrepancy reconciliation.');
  }
  const qIds = new Set();
  for (const q of questions) {
    if (!validId(q.id) || typeof q.prompt !== 'string' || q.prompt.length < 15 || q.prompt.length > 900 ||
      !Array.isArray(q.options) || q.options.length !== 4 || qIds.has(q.id)) throw new Error('Invalid question.');
    qIds.add(q.id);
    const oIds = new Set();
    for (const o of q.options) {
      if (!validId(o.id) || oIds.has(o.id) || typeof o.text !== 'string' || !o.text.trim() || o.text.length > 450) throw new Error('Invalid answer option.');
      oIds.add(o.id);
    }
    if (!oIds.has(key.mcq[q.id])) throw new Error('Question has no matching private answer key.');
  }
  const refs = new Set();
  for (const side of [scenario.supplier, scenario.ledger]) {
    if (side.length < 3 || side.length > 19) throw new Error('Reconciliation data must have between 3 and 19 transactions per side.');
    for (const item of side) {
      if (!validId(item.ref) || !Number.isFinite(item.amount) || Math.abs(item.amount) > 1e8) throw new Error('Invalid transaction row.');
      refs.add(item.ref);
    }
  }
  const actionIds = new Set();
  if (scenario.action_options.length < 3 || scenario.action_options.length > 8) throw new Error('Invalid corrective action options.');
  for (const o of scenario.action_options) {
    if (!validId(o.id) || actionIds.has(o.id) || typeof o.text !== 'string' || o.text.length > 300) throw new Error('Invalid corrective action option.');
    actionIds.add(o.id);
  }
  const dis = new Set();
  for (const ref of key.discrepancies) {
    if (!validId(ref) || !refs.has(ref) || dis.has(ref) || !actionIds.has(key.actions[ref])) throw new Error('Invalid discrepancy rubric.');
    dis.add(ref);
  }
  if (JSON.stringify(pkg).length > 45_000) throw new Error('Assessment package too large.');
  return { question_payload: pkg.question_payload, scoring_key: pkg.scoring_key };
}

// The client receives no answer IDs, expected values, or marking notes.
export function publicAssessment(version) {
  const payload = JSON.parse(version.question_payload_json);
  return {
    questions: payload.questions.map((q) => ({
      id: q.id, prompt: q.prompt,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    })),
    // Strict allowlist: prevent accidental answer-key fields inside admin payloads
    // from ever reaching the candidate browser.
    scenario: {
      instructions: typeof payload.scenario.instructions === 'string' ? payload.scenario.instructions.slice(0, 1000) : '',
      supplier: payload.scenario.supplier.map((row) => ({ ref: row.ref, amount: row.amount, description: row.description || '' })),
      ledger: payload.scenario.ledger.map((row) => ({ ref: row.ref, amount: row.amount, description: row.description || '' })),
      action_options: payload.scenario.action_options.map((o) => ({ id: o.id, text: o.text })),
    },
  };
}

export function cleanSubmission(payload, questions) {
  const mcq = object(payload?.mcq) ? payload.mcq : {};
  const actions = object(payload?.structured?.actions) ? payload.structured.actions : {};
  const found = Array.isArray(payload?.structured?.discrepancies) ? payload.structured.discrepancies : [];
  const scenario = questions.scenario;
  const questionIds = new Set(questions.questions.map((q) => q.id));
  const txRefs = new Set([...scenario.supplier, ...scenario.ledger].map((row) => row.ref));
  const optionIds = new Map(questions.questions.map((q) => [q.id, new Set(q.options.map((o) => o.id))]));
  const actionIds = new Set(scenario.action_options.map((o) => o.id));
  if (Object.keys(mcq).length > 5 || found.length > 20 || Object.keys(actions).length > MAX_ANSWER_ITEMS) throw new Error('Too many answers.');
  const m = {};
  for (const [q, answer] of Object.entries(mcq)) {
    if (!questionIds.has(q) || !optionIds.get(q).has(answer)) throw new Error('Invalid question answer.');
    m[q] = answer;
  }
  const d = [];
  for (const ref of found) {
    if (!txRefs.has(ref)) throw new Error('Invalid transaction reference.');
    if (!d.includes(ref)) d.push(ref);
  }
  const a = {};
  for (const [ref, action] of Object.entries(actions)) {
    if (action === '' || action === null) continue; // cleared selection is unanswered, not invalid
    if (!txRefs.has(ref) || !actionIds.has(action)) throw new Error('Invalid transaction action.');
    a[ref] = action;
  }
  const balanceRaw = payload?.structured?.corrected_balance;
  let balance = null;
  if (balanceRaw !== null && balanceRaw !== undefined && balanceRaw !== '') {
    balance = Number(balanceRaw);
    if (!Number.isFinite(balance) || Math.abs(balance) > 1e9) throw new Error('Invalid corrected balance.');
  }
  return { mcq: m, structured: { discrepancies: d, actions: a, corrected_balance: balance } };
}

// Only editable numeric/text/formula cells from the Reconciliation tab are stored.
// Source sheets are rebuilt from the assessment version on every page load.
export function cleanWorkbook(cells) {
  if (!object(cells) || Object.keys(cells).length > 120) throw new Error('Invalid workbook cells.');
  const safe = {};
  for (const [ref, raw] of Object.entries(cells)) {
    if (!/^[A-F](?:[1-9]|1[0-9]|20)$/.test(ref)) throw new Error('Invalid workbook cell.');
    if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error('Invalid cell value.');
    const value = String(raw);
    if (value.length > 200) throw new Error('Cell content is too long.');
    // Leading equals are supported by the client spreadsheet, but are DATA, never eval'd by server.
    safe[ref] = value;
  }
  if (JSON.stringify(safe).length > MAX_WORKBOOK_BYTES) throw new Error('Workbook too large.');
  return safe;
}

export function scoreAssessment(questions, scoringKey, submission) {
  const mcq = submission.mcq || {};
  const structured = submission.structured || {};
  const correct = questions.questions.reduce((n, q) => n + (mcq[q.id] === scoringKey.mcq[q.id] ? 1 : 0), 0);
  const knowledge = correct * 8;
  const expected = new Set(scoringKey.discrepancies);
  const selected = new Set(structured.discrepancies || []);
  const hits = [...selected].filter((ref) => expected.has(ref)).length;
  const falsePositives = [...selected].filter((ref) => !expected.has(ref)).length;
  const identification = Math.max(0, hits * 10 - falsePositives * 8);
  const actionWeights = [7, 7, 6];
  const actions = scoringKey.discrepancies.reduce(
    (s, ref, i) => s + (structured.actions?.[ref] === scoringKey.actions[ref] ? actionWeights[i] : 0), 0
  );
  const balance = structured.corrected_balance !== null && structured.corrected_balance !== undefined &&
    Number.isFinite(Number(structured.corrected_balance)) &&
    Math.abs(Number(structured.corrected_balance) - Number(scoringKey.corrected_balance)) < 0.005 ? 10 : 0;
  const reconciliation = identification + actions + balance;
  const total = knowledge + reconciliation;
  const flags = [];
  if (falsePositives > 0) flags.push('Incorrect discrepancy selection');
  if (reconciliation < 45) flags.push('Reconciliation score below provisional threshold');
  const unsafe = Array.isArray(scoringKey.unsafe_actions) ? scoringKey.unsafe_actions : [];
  if (Object.values(structured.actions || {}).some((choice) => unsafe.includes(choice))) flags.push('Unsafe corrective action selected');
  return {
    overall_score: total,
    knowledge_score: knowledge,
    reconciliation_score: reconciliation,
    breakdown: { knowledge_correct: correct, knowledge_total: 5, identified: hits, incorrect_selections: falsePositives,
      identification_points: identification, action_points: actions, balance_points: balance },
    critical_flags: flags,
    interpretation: total >= 80 && reconciliation >= 45 && !flags.includes('Unsafe corrective action selected')
      ? 'Strong preliminary work-sample result; confirm production experience and references.'
      : 'Further verification required; this short exercise does not establish independent full-function competence.',
  };
}

export function canAcceptWrite(attempt, when = Date.now()) {
  return canPersistAttempt(attempt, when);
}
export function newAttemptTimes(now = Date.now(), seconds = 600) {
  return { started_at_ms: now, expires_at_ms: expiryForStart(now, seconds) };
}
