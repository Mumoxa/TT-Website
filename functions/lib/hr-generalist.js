/* Talent Tree HR Generalist assessment (HR-GEN-001, Form A, pilot/unvalidated).
 * Pure validation, public projection, cleaning and deterministic grading.
 * No D1, no network, no AI. Scoring keys live only in private D1 records.
 * This file contains scoring LOGIC only — never real answer values.
 * Synthetic fixtures for tests live in tests/fixtures/synthetic-hr.mjs.
 */
import { calculateCell, simpleFormulaReferences } from '../../src/assessments/formulas.js';
import { parseAmount } from './battery.js';

export const HR_FORMAT = 'hr-generalist-v1';
export const HR_ENGINE = 'hr-generalist-v1';
export const HR_ASSESSMENT_ID = 'HR-GEN-001';
export const HR_RUBRIC_ID = 'HR04-EMAIL-V1';
export const HR_MAX_SECONDS = 1200;
export const HR_INTRO_SECONDS = 60;
export const HR_OBJECTIVE_MAX = 85;
export const HR_HUMAN_MAX = 15;
export const HR_TOTAL_MAX = 100;

const MODULE_ORDER = ['HR01', 'HR02', 'HR03', 'HR04', 'HR05'];
const MODULE_SECONDS = { HR01: 240, HR02: 240, HR03: 240, HR04: 240, HR05: 180 };
const MODULE_POINTS = { HR01: 25, HR02: 25, HR03: 20, HR04: 15, HR05: 15 };
const RENDERERS = {
  HR01: 'record_verification',
  HR02: 'situational_judgement',
  HR03: 'applied_reasoning',
  HR04: 'audio_to_email',
  HR05: 'spreadsheet_reconciliation',
};
const MAX_PACKAGE_BYTES = 80_000;
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const EMP_ID_RE = /^EMP-\d{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMPLOYMENT_TYPES = new Set(['Permanent', 'Fixed-term']);
const DOCS = new Set(['signed_contract', 'identity_verification', 'banking_confirmation']);
const FILE_STATUSES = new Set(['complete', 'incomplete']);

export class HrError extends Error {}
const bad = (m) => { throw new HrError(m); };
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const normText = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const normSurname = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function isHrPayload(p) {
  return isObj(p) && p.format === HR_FORMAT;
}

function validDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function checkText(v, min, max, label) {
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) bad(`Invalid ${label}.`);
}

/* ---- validation ----------------------------------------------------------- */

export function validateHrGeneralist(pkg) {
  const payload = pkg?.question_payload;
  const key = pkg?.scoring_key;
  if (!isHrPayload(payload)) bad('Not an hr-generalist-v1 package.');
  if (JSON.stringify(pkg).length > MAX_PACKAGE_BYTES) bad('Assessment package too large.');
  if (payload.assessment_id !== HR_ASSESSMENT_ID) bad('Assessment ID must be HR-GEN-001.');
  if (payload.form_id !== 'A') bad('Form must be A.');
  if (payload.status !== 'pilot') bad('Status must be pilot.');
  if (payload.validation_status !== 'unvalidated') bad('Validation status must be unvalidated.');
  if (payload.max_standard_seconds !== HR_MAX_SECONDS) bad('Standard limit must be 1200 seconds.');
  if (payload.intro_seconds !== HR_INTRO_SECONDS) bad('Intro must be 60 seconds.');
  if (!Array.isArray(payload.modules) || payload.modules.length !== 5) bad('HR assessment needs 5 modules.');
  if (!isObj(key) || !isObj(key.modules)) bad('Scoring key requires modules.');
  if (key.rubric_id !== HR_RUBRIC_ID) bad('Rubric ID must be HR04-EMAIL-V1.');

  let totalSeconds = HR_INTRO_SECONDS;
  let totalPoints = 0;
  payload.modules.forEach((m, i) => {
    const want = MODULE_ORDER[i];
    if (!isObj(m) || m.id !== want) bad(`Module ${i + 1} must be ${want}.`);
    if (m.renderer !== RENDERERS[want]) bad(`Module ${want} renderer mismatch.`);
    if (m.seconds !== MODULE_SECONDS[want]) bad(`Module ${want} seconds mismatch.`);
    if (m.max_points !== MODULE_POINTS[want]) bad(`Module ${want} points mismatch.`);
    totalSeconds += m.seconds;
    totalPoints += m.max_points;
    checkText(m.title, 3, 120, `module ${want} title`);
    checkText(m.instructions, 20, 1500, `module ${want} instructions`);
  });
  if (totalSeconds !== HR_MAX_SECONDS) bad('Module seconds must sum with intro to 1200.');
  if (totalPoints !== HR_TOTAL_MAX) bad('Module points must sum to 100.');

  validateHr01(payload.modules[0], key.modules.HR01);
  validateHr02(payload.modules[1], key.modules.HR02);
  validateHr03(payload.modules[2], key.modules.HR03);
  validateHr04(payload.modules[3], key.modules.HR04);
  validateHr05(payload.modules[4], key.modules.HR05);

  return {
    question_payload: payload,
    scoring_key: { ...key, format: HR_FORMAT, engine: HR_ENGINE },
    engine: HR_ENGINE,
  };
}

function validateHr01(m, k) {
  if (!isObj(k) || !isObj(k.expected) || !isObj(k.file_expected)) bad('HR01 key missing.');
  for (const field of ['source', 'initial', 'file_inventory']) {
    if (!Array.isArray(m[field]) || m[field].length !== 5) bad(`HR01 ${field} needs 5 records.`);
  }
  const ids = new Set();
  for (const row of m.source) {
    if (!isObj(row) || !EMP_ID_RE.test(row.id) || ids.has(row.id)) bad('Invalid HR01 source record.');
    ids.add(row.id);
    checkText(row.surname, 2, 100, 'HR01 surname');
    if (!validDate(row.start_date)) bad('Invalid HR01 start date.');
    if (!EMPLOYMENT_TYPES.has(row.employment_type)) bad('Invalid HR01 employment type.');
    if (!Number.isInteger(row.monthly_salary_cents) || row.monthly_salary_cents < 0) bad('Invalid HR01 salary.');
  }
  const initialIds = new Set();
  for (const row of m.initial) {
    if (!isObj(row) || !ids.has(row.id) || initialIds.has(row.id)) bad('Invalid HR01 initial record.');
    initialIds.add(row.id);
    checkText(row.surname, 1, 100, 'HR01 initial surname');
    if (!validDate(row.start_date)) bad('Invalid HR01 initial start date.');
    if (!EMPLOYMENT_TYPES.has(row.employment_type)) bad('Invalid HR01 initial type.');
    if (!Number.isInteger(row.monthly_salary_cents) || row.monthly_salary_cents < 0) bad('Invalid HR01 initial salary.');
  }
  const inventoryIds = new Set();
  for (const row of m.file_inventory) {
    if (!isObj(row) || !ids.has(row.id) || inventoryIds.has(row.id)) bad('Invalid HR01 file inventory.');
    inventoryIds.add(row.id);
    for (const d of ['signed_contract', 'identity_verification', 'banking_confirmation']) {
      if (!['Present', 'Missing'].includes(row[d])) bad('Invalid HR01 file inventory value.');
    }
    const exp = k.expected[row.id];
    const fexp = k.file_expected[row.id];
    if (!isObj(exp) || !isObj(fexp)) bad(`Missing HR01 key for ${row.id}.`);
    if (normSurname(exp.surname).length < 1 || !validDate(exp.start_date)) bad(`Invalid HR01 expected for ${row.id}.`);
    if (!EMPLOYMENT_TYPES.has(exp.employment_type) || !Number.isInteger(exp.monthly_salary_cents)) bad(`Invalid HR01 expected for ${row.id}.`);
    const source = m.source.find((entry) => entry.id === row.id);
    if (normSurname(exp.surname) !== normSurname(source.surname) || exp.start_date !== source.start_date || exp.employment_type !== source.employment_type || exp.monthly_salary_cents !== source.monthly_salary_cents) bad(`HR01 key does not match source for ${row.id}.`);
    if (!FILE_STATUSES.has(fexp.status) || !Array.isArray(fexp.missing)) bad(`Invalid HR01 file expected for ${row.id}.`);
    for (const d of fexp.missing) if (!DOCS.has(d)) bad('Invalid HR01 missing document.');
    if (new Set(fexp.missing).size !== fexp.missing.length) bad('Duplicate missing document.');
    if (fexp.status === 'complete' && fexp.missing.length !== 0) bad('Complete file cannot list missing documents.');
    if (fexp.status === 'incomplete' && fexp.missing.length === 0) bad('Incomplete file must list a missing document.');
    const missing = [...DOCS].filter((doc) => row[doc] === 'Missing').sort();
    if (missing.join('|') !== [...fexp.missing].sort().join('|')) bad(`HR01 file key does not match inventory for ${row.id}.`);
  }
  if (Object.keys(k.expected).length !== 5 || Object.keys(k.file_expected).length !== 5) bad('HR01 key must cover 5 records.');
  const differences = m.source.reduce((count, src) => {
    const init = m.initial.find((row) => row.id === src.id);
    return count + Number(normSurname(init.surname) !== normSurname(src.surname)) + Number(init.start_date !== src.start_date) + Number(init.employment_type !== src.employment_type) + Number(init.monthly_salary_cents !== src.monthly_salary_cents);
  }, 0);
  if (differences !== 6) bad('HR01 requires six seeded discrepancies.');
}

function validateHr02(m, k) {
  if (!isObj(k) || !isObj(k.scenarios) || !isObj(k.priorities)) bad('HR02 key missing.');
  checkText(m.procedure, 20, 1500, 'HR02 procedure');
  if (!Array.isArray(m.scenarios) || m.scenarios.length !== 5) bad('HR02 needs 5 scenarios.');
  const seen = new Set();
  for (const s of m.scenarios) {
    if (!isObj(s) || !ID_RE.test(s.id) || seen.has(s.id)) bad('Invalid HR02 scenario.');
    seen.add(s.id);
    checkText(s.prompt, 15, 900, 'HR02 scenario prompt');
    if (!Array.isArray(s.options) || s.options.length !== 3) bad('HR02 scenario needs 3 options.');
    const oids = new Set();
    for (const o of s.options) {
      if (!isObj(o) || !ID_RE.test(o.id) || oids.has(o.id)) bad('Invalid HR02 option.');
      oids.add(o.id);
      checkText(o.text, 5, 450, 'HR02 option text');
    }
    const sk = k.scenarios[s.id];
    if (!isObj(sk) || !oids.has(sk.answer) || !isObj(sk.option_points)) bad(`Invalid HR02 key for ${s.id}.`);
    if (Object.keys(sk.option_points).length !== oids.size || [...oids].map((id) => sk.option_points[id]).sort().join(',') !== '0,2,4' || sk.option_points[sk.answer] !== 4) bad(`Invalid HR02 option points for ${s.id}.`);
    if (sk.flag_for !== undefined && (!isObj(sk.flag_for) || Object.entries(sk.flag_for).some(([id, v]) => !oids.has(id) || typeof v !== 'string' || !v.trim()))) bad('Invalid HR02 flag mapping.');
  }
  if (!isObj(m.priorities) || !Array.isArray(m.priorities.options) || m.priorities.options.length !== 5) bad('HR02 priorities need 5 options.');
  checkText(m.priorities.prompt, 15, 900, 'HR02 priorities prompt');
  const pids = new Set();
  for (const o of m.priorities.options) {
    if (!isObj(o) || !ID_RE.test(o.id) || pids.has(o.id)) bad('Invalid HR02 priority option.');
    pids.add(o.id);
    checkText(o.text, 5, 450, 'HR02 priority text');
  }
  if (!isObj(k.priorities.points)) bad('HR02 priority points missing.');
  for (const [pid, pts] of Object.entries(k.priorities.points)) {
    if (!pids.has(pid) || !Number.isInteger(pts) || pts < 0 || pts > 5) bad('Invalid HR02 priority points.');
  }
  const prioTotal = Object.values(k.priorities.points).reduce((a, b) => a + b, 0);
  if (prioTotal !== 5) bad('HR02 priority points must sum to 5.');
}

function validateHr03(m, k) {
  if (!isObj(k) || !isObj(k.items)) bad('HR03 key missing.');
  if (!Array.isArray(m.items) || m.items.length !== 6) bad('HR03 needs 6 foundational items.');
  if (!isObj(m.procedure) || !Array.isArray(m.procedure.codes) || m.procedure.codes.length !== 4) bad('HR03 procedure needs 4 codes.');
  const codes = new Set();
  for (const c of m.procedure.codes) {
    if (!isObj(c) || !/^[A-D]$/.test(c.code) || codes.has(c.code)) bad('Invalid HR03 procedure code.');
    codes.add(c.code);
    checkText(c.label, 3, 160, 'HR03 procedure label');
  }
  checkText(m.procedure.restriction, 10, 600, 'HR03 procedure restriction');
  if (!Array.isArray(m.rule_items) || m.rule_items.length !== 3) bad('HR03 needs 3 rule items.');
  const seen = new Set();
  const all = [...m.items, ...m.rule_items];
  for (const item of all) {
    if (!isObj(item) || !ID_RE.test(item.id) || seen.has(item.id)) bad('Invalid HR03 item.');
    seen.add(item.id);
    checkText(item.prompt, 10, 900, 'HR03 item prompt');
    if (!['single', 'text', 'integer'].includes(item.type)) bad('Invalid HR03 item type.');
    if (item.type === 'single') {
      if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 6) bad('Invalid HR03 options.');
      const oids = new Set();
      for (const o of item.options) {
        if (!isObj(o) || !ID_RE.test(o.id) || oids.has(o.id)) bad('Invalid HR03 option.');
        oids.add(o.id);
        checkText(o.text, 1, 300, 'HR03 option text');
      }
    }
    const sk = k.items[item.id];
    if (!isObj(sk) || !Number.isInteger(sk.points) || sk.points < 1 || sk.points > 4) bad(`Invalid HR03 key for ${item.id}.`);
    if (item.type === 'single' && !item.options.some((o) => o.id === sk.answer)) bad(`HR03 answer for ${item.id} is not an option.`);
    if (item.type === 'integer' && !Number.isInteger(sk.answer)) bad(`HR03 integer answer for ${item.id} invalid.`);
    if (item.type === 'text' && (typeof sk.answer !== 'string' || !sk.answer.trim())) bad(`HR03 text answer for ${item.id} invalid.`);
  }
  const foundational = m.items.reduce((n, it) => n + k.items[it.id].points, 0);
  const rule = m.rule_items.reduce((n, it) => n + k.items[it.id].points, 0);
  if (foundational !== 12) bad('HR03 foundational points must sum to 12.');
  if (rule !== 8) bad('HR03 rule points must sum to 8.');
  for (const id of Object.keys(k.items)) if (!seen.has(id)) bad(`HR03 key has unknown item ${id}.`);
}

function validateHr04(m, k) {
  checkText(m.recipient, 2, 120, 'HR04 recipient');
  if (!isObj(m.audio) || typeof m.audio.asset_id !== 'string' || !m.audio.asset_id.trim()) bad('HR04 audio asset missing.');
  if (!Number.isInteger(m.audio.duration_seconds) || m.audio.duration_seconds < 5 || m.audio.duration_seconds > 120) bad('Invalid HR04 audio duration.');
  if (m.audio.replays_allowed !== 1) bad('HR04 replays must be 1.');
  if (m.audio.max_subject_chars !== 500 || m.audio.max_body_chars !== 4000) bad('HR04 length limits mismatch.');
  if (!isObj(k) || !Array.isArray(k.criteria) || k.criteria.length !== 9) bad('HR04 rubric needs 9 criteria.');
  const seen = new Set();
  let sum = 0;
  for (const c of k.criteria) {
    if (!isObj(c) || !ID_RE.test(c.id) || seen.has(c.id)) bad('Invalid HR04 criterion.');
    seen.add(c.id);
    checkText(c.label, 3, 160, 'HR04 criterion label');
    if (!Number.isInteger(c.max) || c.max < 1 || c.max > 2) bad('Invalid HR04 criterion max.');
    if (!Array.isArray(c.allowed) || c.allowed.length < 2) bad('Invalid HR04 allowed points.');
    for (const p of c.allowed) if (!Number.isInteger(p) || p < 0 || p > c.max) bad('Invalid HR04 allowed point.');
    if (!c.allowed.includes(0) || !c.allowed.includes(c.max)) bad('HR04 allowed must include 0 and max.');
    sum += c.max;
  }
  if (sum !== 15) bad('HR04 rubric must sum to 15.');
  if (typeof k.transcript !== 'string' || !k.transcript.trim()) bad('HR04 transcript missing from private key.');
}

function validateHr05(m, k) {
  if (!isObj(k) || !isObj(k.cells) || !isObj(k.payroll)) bad('HR05 key missing.');
  if (!isObj(m.workbook) || !isObj(m.workbook.source)) bad('HR05 workbook missing.');
  const source = m.workbook.source;
  for (const ref of ['E2', 'E3', 'E4', 'E5']) if (Object.hasOwn(source, ref)) bad('HR05 answer cells must be editable.');
  for (const row of [2, 3, 4]) for (const col of ['B', 'C', 'D']) {
    const value = source[col + row];
    if (value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value))) bad('HR05 source requires numeric leave values.');
  }
  if (Object.keys(k.cells).length !== 4) bad('HR05 key must contain exactly four cells.');
  for (const ref of ['E2', 'E3', 'E4', 'E5']) {
    if (!Object.hasOwn(k.cells, ref)) bad(`HR05 cell key missing for ${ref}.`);
    const c = k.cells[ref];
    if (!Number.isFinite(c.value) || !Number.isInteger(c.value_points) || !Number.isInteger(c.formula_points)) bad(`Invalid HR05 cell key for ${ref}.`);
    if (c.value_points < 0 || c.formula_points < 0) bad(`Invalid HR05 cell points for ${ref}.`);
  }
  const valueSum = Object.values(k.cells).reduce((n, c) => n + c.value_points, 0);
  const formulaSum = Object.values(k.cells).reduce((n, c) => n + c.formula_points, 0);
  if (valueSum !== 5 || formulaSum !== 5) bad('HR05 value/formula points must each sum to 5.');
  if (!isObj(m.payroll) || !Number.isFinite(m.payroll.approved) || !Number.isFinite(m.payroll.draft)) bad('HR05 payroll amounts missing.');
  if (!Array.isArray(m.payroll.items)) bad('HR05 payroll items missing.');
  const action = m.payroll.items.find((item) => item.id === 'PAY03');
  if (!action || !Array.isArray(action.options) || action.options.length < 2 || action.options.some((option) => !isObj(option) || !ID_RE.test(option.id) || typeof option.text !== 'string')) bad('Invalid PAY03 options.');
  if (new Set(action.options.map((option) => option.id)).size !== action.options.length) bad('Duplicate PAY03 option.');
  for (const id of ['PAY01', 'PAY02', 'PAY03']) {
    if (!isObj(k.payroll[id])) bad(`HR05 payroll key missing for ${id}.`);
  }
  if (!Number.isInteger(k.payroll.PAY01.answer_cents) || k.payroll.PAY01.points !== 2) bad('Invalid PAY01 key.');
  if (!Number.isFinite(k.payroll.PAY02.answer_percent) || k.payroll.PAY02.points !== 2) bad('Invalid PAY02 key.');
  if (k.payroll.PAY03.points !== 1 || !action.options.some((option) => option.id === k.payroll.PAY03.answer)) bad('Invalid PAY03 key.');
}

/* ---- public projection (allowlist; no keys, no rubric, no transcript) ----- */

export function publicHrGeneralist(payload) {
  return {
    format: HR_FORMAT,
    assessment_id: payload.assessment_id,
    form_id: payload.form_id,
    status: payload.status,
    validation_status: payload.validation_status,
    max_standard_seconds: payload.max_standard_seconds,
    intro_seconds: payload.intro_seconds,
    instructions: typeof payload.instructions === 'string' ? payload.instructions.slice(0, 1500) : '',
    modules: payload.modules.map((m) => {
      const base = { id: m.id, renderer: m.renderer, seconds: m.seconds, max_points: m.max_points, title: m.title, instructions: m.instructions };
      if (m.id === 'HR01') {
        base.source = m.source.map((r) => ({ id: r.id, surname: r.surname, start_date: r.start_date, employment_type: r.employment_type, monthly_salary_cents: r.monthly_salary_cents }));
        base.initial = m.initial.map((r) => ({ id: r.id, surname: r.surname, start_date: r.start_date, employment_type: r.employment_type, monthly_salary_cents: r.monthly_salary_cents }));
        base.file_inventory = m.file_inventory.map((r) => ({ id: r.id, signed_contract: r.signed_contract, identity_verification: r.identity_verification, banking_confirmation: r.banking_confirmation }));
      }
      if (m.id === 'HR02') {
        base.procedure = m.procedure;
        base.scenarios = m.scenarios.map((s) => ({ id: s.id, prompt: s.prompt, options: s.options.map((o) => ({ id: o.id, text: o.text })) }));
        base.priorities = { prompt: m.priorities.prompt, options: m.priorities.options.map((o) => ({ id: o.id, text: o.text })) };
      }
      if (m.id === 'HR03') {
        base.items = m.items.map((it) => ({ id: it.id, prompt: it.prompt, type: it.type, ...(it.options ? { options: it.options.map((o) => ({ id: o.id, text: o.text })) } : {}) }));
        base.procedure = { codes: m.procedure.codes.map((c) => ({ code: c.code, label: c.label })), restriction: m.procedure.restriction };
        base.rule_items = m.rule_items.map((it) => ({ id: it.id, prompt: it.prompt, type: it.type, ...(it.options ? { options: it.options.map((o) => ({ id: o.id, text: o.text })) } : {}) }));
      }
      if (m.id === 'HR04') {
        base.recipient = m.recipient;
        base.audio = { asset_id: m.audio.asset_id, duration_seconds: m.audio.duration_seconds, replays_allowed: m.audio.replays_allowed, max_subject_chars: m.audio.max_subject_chars, max_body_chars: m.audio.max_body_chars };
      }
      if (m.id === 'HR05') {
        base.workbook = { source: Object.fromEntries(Object.entries(m.workbook.source).map(([r, v]) => [r, String(v).slice(0, 200)])) };
        base.payroll = { approved: m.payroll.approved, draft: m.payroll.draft, items: (m.payroll.items || []).map((it) => ({ id: it.id, prompt: it.prompt, type: it.type, ...(it.options ? { options: it.options.map((o) => ({ id: o.id, text: o.text })) } : {}) })) };
      }
      return base;
    }),
  };
}

// Future candidate endpoints must expose only the active step, never future
// modules or already-closed work. This projection is not an access check.
export function publicHrStep(payload, stepId) {
  const visible = publicHrGeneralist(payload);
  if (stepId === 'INTRO') return { ...visible, modules: [] };
  const module = visible.modules.find((item) => item.id === stepId);
  if (!module) bad('Invalid HR step.');
  return { ...visible, modules: [module] };
}

/* ---- submission cleaning -------------------------------------------------- */

export function cleanHrSubmission(payload, publicHr) {
  const hr = isObj(payload?.structured?.hr) ? payload.structured.hr : {};
  const byId = Object.fromEntries(publicHr.modules.map((m) => [m.id, m]));
  const out = {};

  // HR01
  const m1 = byId.HR01;
  const empIds = new Set(m1.source.map((r) => r.id));
  const hr01 = {};
  for (const [id, v] of Object.entries(isObj(hr.HR01) ? hr.HR01 : {})) {
    if (!empIds.has(id) || !isObj(v)) bad('Invalid HR01 response.');
    const row = {};
    if (v.surname !== undefined) {
      if (typeof v.surname !== 'string' || v.surname.length > 100) bad('Invalid HR01 surname.');
      row.surname = v.surname;
    }
    if (v.start_date !== undefined) {
      if (!validDate(v.start_date)) bad('Invalid HR01 start date.');
      row.start_date = v.start_date;
    }
    if (v.employment_type !== undefined) {
      if (!EMPLOYMENT_TYPES.has(v.employment_type)) bad('Invalid HR01 employment type.');
      row.employment_type = v.employment_type;
    }
    if (v.monthly_salary_cents !== undefined) {
      if (!Number.isInteger(v.monthly_salary_cents) || v.monthly_salary_cents < 0 || v.monthly_salary_cents > 1_000_000_000) bad('Invalid HR01 salary.');
      row.monthly_salary_cents = v.monthly_salary_cents;
    }
    if (v.reviewed !== undefined) {
      if (typeof v.reviewed !== 'boolean') bad('Invalid HR01 reviewed flag.');
      row.reviewed = v.reviewed;
    }
    if (v.file_status !== undefined && v.file_status !== null) {
      if (!FILE_STATUSES.has(v.file_status)) bad('Invalid HR01 file status.');
      row.file_status = v.file_status;
    } else if (v.file_status === null) row.file_status = null;
    if (v.missing_documents !== undefined) {
      if (!Array.isArray(v.missing_documents) || v.missing_documents.length > 3) bad('Invalid HR01 missing documents.');
      const seen = new Set();
      for (const d of v.missing_documents) {
        if (!DOCS.has(d) || seen.has(d)) bad('Invalid HR01 missing document.');
        seen.add(d);
      }
      row.missing_documents = [...v.missing_documents];
    }
    hr01[id] = row;
  }
  out.HR01 = hr01;

  // HR02
  const m2 = byId.HR02;
  const scenIds = new Set(m2.scenarios.map((s) => s.id));
  const hr02 = { scenarios: {}, priorities: [] };
  for (const [id, v] of Object.entries(isObj(hr.HR02?.scenarios) ? hr.HR02.scenarios : {})) {
    const scen = m2.scenarios.find((s) => s.id === id);
    if (!scen || !scenIds.has(id)) bad('Invalid HR02 scenario.');
    if (v === null || v === undefined || v === '') continue;
    if (!scen.options.some((o) => o.id === v)) bad('Invalid HR02 option.');
    hr02.scenarios[id] = v;
  }
  const prio = hr.HR02?.priorities;
  if (prio !== undefined && prio !== null) {
    if (!Array.isArray(prio) || prio.length > 2) bad('HR02 priorities allow at most two selections.');
    const valid = new Set(m2.priorities.options.map((o) => o.id));
    const seen = new Set();
    for (const p of prio) {
      if (!valid.has(p) || seen.has(p)) bad('Invalid HR02 priority selection.');
      seen.add(p);
    }
    hr02.priorities = [...prio];
  }
  out.HR02 = hr02;

  // HR03
  const m3 = byId.HR03;
  const allItems = [...m3.items, ...m3.rule_items];
  const hr03 = {};
  for (const [id, v] of Object.entries(isObj(hr.HR03) ? hr.HR03 : {})) {
    const item = allItems.find((it) => it.id === id);
    if (!item) bad('Invalid HR03 item.');
    if (item.type === 'single') {
      if (!item.options.some((o) => o.id === v)) bad('Invalid HR03 option.');
      hr03[id] = v;
    } else if (item.type === 'integer') {
      const n = typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : null);
      if (n === null || !Number.isInteger(n) || Math.abs(n) > 1_000_000) bad('Invalid HR03 integer answer.');
      hr03[id] = n;
    } else {
      if (typeof v !== 'string' || v.length > 200) bad('Invalid HR03 text answer.');
      if (v.trim()) hr03[id] = v.trim();
    }
  }
  out.HR03 = hr03;

  // HR04
  const m4 = byId.HR04;
  const hr04 = { subject: '', body: '' };
  if (hr.HR04 !== undefined && hr.HR04 !== null) {
    if (!isObj(hr.HR04)) bad('Invalid HR04 response.');
    const subj = hr.HR04.subject ?? '';
    const body = hr.HR04.body ?? '';
    if (typeof subj !== 'string' || subj.length > m4.audio.max_subject_chars) bad('HR04 subject too long.');
    if (typeof body !== 'string' || body.length > m4.audio.max_body_chars) bad('HR04 body too long.');
    hr04.subject = subj;
    hr04.body = body;
  }
  out.HR04 = hr04;

  // HR05 payroll (workbook cells cleaned separately via battery rules)
  const hr05 = { payroll: {} };
  const pay = isObj(hr.HR05?.payroll) ? hr.HR05.payroll : {};
  for (const [id, v] of Object.entries(pay)) {
    if (!['PAY01', 'PAY02', 'PAY03'].includes(id)) bad('Invalid HR05 payroll item.');
    if (id === 'PAY03') {
      const item = byId.HR05.payroll.items.find((it) => it.id === id);
      if (!item?.options?.some((o) => o.id === v)) bad('Invalid PAY03 option.');
      hr05.payroll[id] = v;
    } else {
      if (v === null || v === undefined || v === '') continue;
      if (typeof v !== 'string' && typeof v !== 'number') bad('Invalid HR05 numeric answer.');
      const s = String(v).trim();
      if (s.length > 30) bad('HR05 numeric answer too long.');
      const numeric = id === 'PAY02' ? s.replace(/%$/, '').trim() : s;
      if (!numeric || !/^-?[\d.,\s]+$/.test(numeric) || parseAmount(numeric) === null) bad('Invalid HR05 numeric answer.');
      hr05.payroll[id] = s;
    }
  }
  out.HR05 = hr05;

  return out;
}

/* ---- grading ---------------------------------------------------------------- */

function gradeHr01(module, key, answers, elapsedSeconds) {
  const initialById = Object.fromEntries(module.initial.map((r) => [r.id, r]));
  let fieldsCorrectVerified = 0, fieldsReviewed = 0, corrected = 0, introduced = 0, filesCorrect = 0, reviewedRecords = 0;
  const rows = [];
  for (const src of module.source) {
    const id = src.id;
    const init = initialById[id];
    const exp = key.expected[id];
    const fexp = key.file_expected[id];
    const ans = answers?.[id] || {};
    // Final values default to initial when unedited (candidate sees initial).
    const finSurname = ans.surname !== undefined ? ans.surname : init.surname;
    const finDate = ans.start_date !== undefined ? ans.start_date : init.start_date;
    const finType = ans.employment_type !== undefined ? ans.employment_type : init.employment_type;
    const finSalary = ans.monthly_salary_cents !== undefined ? ans.monthly_salary_cents : init.monthly_salary_cents;
    const reviewed = ans.reviewed === true;
    if (reviewed) reviewedRecords += 1;
    const checks = [
      { field: 'surname', ok: normSurname(finSurname) === normSurname(exp.surname) },
      { field: 'start_date', ok: finDate === exp.start_date },
      { field: 'employment_type', ok: finType === exp.employment_type },
      { field: 'monthly_salary_cents', ok: finSalary === exp.monthly_salary_cents },
    ];
    for (const c of checks) {
      if (reviewed) {
        fieldsReviewed += 1;
        if (c.ok) fieldsCorrectVerified += 1;
      }
      const initVal = c.field === 'surname' ? init.surname : c.field === 'start_date' ? init.start_date : c.field === 'employment_type' ? init.employment_type : init.monthly_salary_cents;
      const expVal = c.field === 'surname' ? exp.surname : c.field === 'start_date' ? exp.start_date : c.field === 'employment_type' ? exp.employment_type : exp.monthly_salary_cents;
      const finVal = c.field === 'surname' ? finSurname : c.field === 'start_date' ? finDate : c.field === 'employment_type' ? finType : finSalary;
      const initOk = c.field === 'surname' ? normSurname(initVal) === normSurname(expVal) : initVal === expVal;
      const finOk = c.field === 'surname' ? normSurname(finVal) === normSurname(expVal) : finVal === expVal;
      if (!initOk && finOk && reviewed) corrected += 1;
      if (initOk && !finOk) introduced += 1;
    }
    // File check: independent of reviewed.
    const status = ans.file_status ?? null;
    const missing = Array.isArray(ans.missing_documents) ? [...ans.missing_documents].sort() : null;
    const wantMissing = [...fexp.missing].sort();
    const fileOk = status === fexp.status && missing !== null && missing.join('|') === wantMissing.join('|');
    if (fileOk) filesCorrect += 1;
    rows.push({ id, reviewed, fields: checks, file_status: status, file_ok: fileOk });
  }
  const points = fieldsCorrectVerified + filesCorrect;
  const rate = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0
    ? Math.round((fieldsCorrectVerified * 60 / elapsedSeconds) * 100) / 100 : null;
  return {
    points, max: 25,
    evidence: {
      fields_correct_verified: fieldsCorrectVerified, fields_reviewed: fieldsReviewed,
      discrepancies_corrected: corrected, discrepancies_present: 6,
      introduced_errors: introduced, files_checked_correctly: filesCorrect,
      reviewed_records: reviewedRecords, correct_verified_fields_per_minute: rate,
      elapsed_seconds: elapsedSeconds ?? null,
    },
    rows,
  };
}

function gradeHr02(module, key, answers) {
  let points = 0;
  const flags = [];
  const rows = [];
  for (const scen of module.scenarios) {
    const sk = key.scenarios[scen.id];
    const chosen = answers?.scenarios?.[scen.id] ?? null;
    const ok = chosen === sk.answer;
    const earned = chosen ? (sk.option_points[chosen] ?? 0) : 0;
    points += earned;
    const flag = chosen ? (sk.flag_for?.[chosen] ?? null) : null;
    if (flag) flags.push({ code: flag, item_id: scen.id, selected: chosen, expected: sk.answer, status: 'open' });
    rows.push({ id: scen.id, chosen, expected: sk.answer, ok, points: earned, flag });
  }
  let prioPoints = 0;
  for (const pid of (answers?.priorities || [])) prioPoints += key.priorities.points[pid] || 0;
  points += prioPoints;
  return { points, max: 25, evidence: { scenario_points: points - prioPoints, priority_points: prioPoints }, flags, rows };
}

function gradeHr03(module, key, answers) {
  let reasoning = 0, rule = 0;
  const rows = [];
  const gradeOne = (item) => {
    const sk = key.items[item.id];
    const given = answers?.[item.id] ?? null;
    let ok = false;
    if (item.type === 'single') ok = given === sk.answer;
    else if (item.type === 'integer') ok = given === sk.answer;
    else ok = given !== null && normText(given) === normText(sk.answer);
    const pts = ok ? sk.points : 0;
    rows.push({ id: item.id, given, expected: sk.answer, ok, points: pts, max: sk.points });
    return pts;
  };
  for (const it of module.items) reasoning += gradeOne(it);
  for (const it of module.rule_items) rule += gradeOne(it);
  return { points: reasoning + rule, max: 20, evidence: { reasoning, rule_application: rule }, rows };
}

/* Formula logic: restricted parsed dependencies and counterfactual evaluation; no eval. */
function evalWithSource(source, workbook, ref) {
  const merged = { ...source, ...workbook };
  return calculateCell(merged, ref);
}
function numOf(text) {
  if (text === null || text === undefined || !String(text).trim() || String(text).startsWith('#')) return null;
  const n = Number(String(text).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function checkFormulaLogic(cellRef, candidateRaw, source, workbook, expectedFn, fixtures) {
  const raw = String(candidateRaw ?? '').trim();
  if (!raw.startsWith('=')) return { formula_points: 0, is_formula: false };
  // Require precisely the intended cells, once each, in a supported expression.
  const intended = cellRef === 'E5' ? ['E2', 'E3', 'E4'] : ['B', 'C', 'D'].map((col) => col + cellRef.slice(1));
  const refs = simpleFormulaReferences(raw);
  if (!refs || refs.length !== intended.length || [...refs].sort().join('|') !== intended.sort().join('|')) return { formula_points: 0, is_formula: true };
  // Fixtures: array of source overrides; expectedFn(source, workbook) => expected number.
  for (const fx of fixtures) {
    const src = { ...source, ...fx.source };
    const wb = { ...workbook, ...(fx.workbook || {}) };
    // Remove the cell under test from workbook so its own old value doesn't leak.
    const wbClean = { ...wb };
    delete wbClean[cellRef];
    // Re-evaluate with candidate formula injected.
    const withFormula = { ...wbClean, [cellRef]: raw };
    const got2 = numOf(evalWithSource(src, withFormula, cellRef));
    const want = expectedFn(src, wbClean);
    if (got2 === null || Math.abs(got2 - want) > 0.005 + 1e-9) return { formula_points: 0, is_formula: true };
  }
  return { formula_points: null, is_formula: true }; // caller maps to points
}

function gradeHr05(module, key, answers, workbook) {
  const source = module.workbook.source;
  const wb = workbook || {};
  const cells = {};
  let valuePoints = 0, formulaPoints = 0;
  // Counterfactual fixtures for row balances: vary B/C/D.
  const rowFixtures = [
    { source: {} },
    ...['B', 'C', 'D'].map((col) => ({ source: Object.fromEntries([2, 3, 4].flatMap((row) => ['B', 'C', 'D'].map((c) => [c + row, c === col ? '1' : '0']))) })),
    { source: { B2: '0', C2: '0', D2: '0', B3: '0', C3: '0', D3: '0', B4: '0', C4: '0', D4: '0' } },
  ];
  const rowExpected = (ref) => (src) => {
    const b = Number(src[ref.replace('E', 'B')]), c = Number(src[ref.replace('E', 'C')]), d = Number(src[ref.replace('E', 'D')]);
    return b + c - d;
  };
  for (const ref of ['E2', 'E3', 'E4']) {
    const k = key.cells[ref];
    const raw = String(wb[ref] ?? '');
    const shown = evalWithSource(source, wb, ref);
    const val = numOf(shown);
    const valueOk = val !== null && Math.abs(val - k.value) <= 0.005 + 1e-9;
    if (valueOk) valuePoints += k.value_points;
    let formulaOk = false;
    if (raw.trim().startsWith('=')) {
      const check = checkFormulaLogic(ref, raw, source, wb, rowExpected(ref), rowFixtures);
      formulaOk = check.formula_points === null;
    }
    if (formulaOk) formulaPoints += k.formula_points;
    cells[ref] = { value: val, expected: k.value, value_ok: valueOk, formula_ok: formulaOk, raw };
  }
  // E5: sum of E2:E4 (expected values as inputs for method check).
  {
    const ref = 'E5';
    const k = key.cells[ref];
    const raw = String(wb[ref] ?? '');
    const shown = evalWithSource(source, wb, ref);
    const val = numOf(shown);
    const valueOk = val !== null && Math.abs(val - k.value) <= 0.005 + 1e-9;
    if (valueOk) valuePoints += k.value_points;
    let formulaOk = false;
    if (raw.trim().startsWith('=')) {
      const fixtures = [
        { workbook: { E2: '10.25', E3: '7.25', E4: '11.25' } },
        ...['E2', 'E3', 'E4'].map((ref) => ({ workbook: Object.fromEntries(['E2', 'E3', 'E4'].map((cell) => [cell, cell === ref ? '1' : '0'])) })),
        { workbook: { E2: '0', E3: '0', E4: '0' } },
      ];
      const expectedFn = (src, w) => Number(w.E2) + Number(w.E3) + Number(w.E4);
      const check = checkFormulaLogic(ref, raw, source, wb, expectedFn, fixtures);
      formulaOk = check.formula_points === null;
    }
    if (formulaOk) formulaPoints += k.formula_points;
    cells[ref] = { value: val, expected: k.value, value_ok: valueOk, formula_ok: formulaOk, raw };
  }
  // Payroll
  const flags = [];
  let payrollPoints = 0;
  const pay = answers?.payroll || {};
  const payRows = {};
  // PAY01: rand overstatement, compare cents.
  {
    const k = key.payroll.PAY01;
    const raw = pay.PAY01 ?? null;
    let ok = false;
    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      const n = parseAmount(String(raw));
      if (n !== null && Math.round(n * 100) === k.answer_cents) ok = true;
    }
    if (ok) payrollPoints += k.points;
    payRows.PAY01 = { given: raw, ok, points: ok ? k.points : 0 };
  }
  // PAY02: percent overstatement, compare numeric percent (10, not 0.10).
  {
    const k = key.payroll.PAY02;
    const raw = pay.PAY02 ?? null;
    let ok = false;
    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      const s = String(raw).trim().replace(/%$/, '').trim();
      const n = parseAmount(s);
      if (n !== null && Math.abs(n - k.answer_percent) <= 0.005 + 1e-9) ok = true;
    }
    if (ok) payrollPoints += k.points;
    payRows.PAY02 = { given: raw, ok, points: ok ? k.points : 0 };
  }
  // PAY03: action choice.
  {
    const k = key.payroll.PAY03;
    const chosen = pay.PAY03 ?? null;
    const ok = chosen === k.answer;
    if (ok) payrollPoints += k.points;
    if (chosen && k.flag_for && k.flag_for[chosen]) flags.push({ code: k.flag_for[chosen], item_id: 'PAY03', selected: chosen, expected: k.answer, status: 'open' });
    payRows.PAY03 = { given: chosen, ok, points: ok ? k.points : 0 };
  }
  const points = valuePoints + formulaPoints + payrollPoints;
  return {
    points, max: 15,
    evidence: { value_points: valuePoints, formula_points: formulaPoints, payroll_points: payrollPoints, cells, payroll: payRows },
    flags,
  };
}

export function gradeHrGeneralist(payload, key, hrAnswers, workbook, elapsedByModule = {}) {
  const byId = Object.fromEntries(payload.modules.map((m) => [m.id, m]));
  const m1 = gradeHr01(byId.HR01, key.modules.HR01, hrAnswers?.HR01, elapsedByModule.HR01 ?? null);
  const m2 = gradeHr02(byId.HR02, key.modules.HR02, hrAnswers?.HR02);
  const m3 = gradeHr03(byId.HR03, key.modules.HR03, hrAnswers?.HR03);
  const m5 = gradeHr05(byId.HR05, key.modules.HR05, hrAnswers?.HR05, workbook || {});
  const objective = m1.points + m2.points + m3.points + m5.points;
  const flags = [...m2.flags, ...m5.flags];
  return {
    engine: HR_ENGINE,
    modules: [
      { id: 'HR01', title: byId.HR01.title, points: m1.points, max: 25, evidence: m1.evidence, rows: m1.rows },
      { id: 'HR02', title: byId.HR02.title, points: m2.points, max: 25, evidence: m2.evidence, rows: m2.rows },
      { id: 'HR03', title: byId.HR03.title, points: m3.points, max: 20, evidence: m3.evidence, rows: m3.rows },
      { id: 'HR04', title: byId.HR04.title, points: null, max: 15, evidence: { status: 'pending_review', rubric_id: HR_RUBRIC_ID } },
      { id: 'HR05', title: byId.HR05.title, points: m5.points, max: 15, evidence: m5.evidence },
    ],
    objective_score: objective, objective_max: HR_OBJECTIVE_MAX,
    human_score: null, human_max: HR_HUMAN_MAX,
    total_score: null, total_max: HR_TOTAL_MAX,
    score_status: 'pending_review',
    critical_flags: flags,
    hr04_email: hrAnswers?.HR04 || { subject: '', body: '' },
  };
}

export function combineHrScores(grade, humanScore) {
  if (humanScore === null || humanScore === undefined) {
    return { ...grade, score_status: 'pending_review', total_score: null };
  }
  if (!Number.isInteger(humanScore) || humanScore < 0 || humanScore > HR_HUMAN_MAX || !Number.isFinite(grade.objective_score) || grade.objective_score < 0 || grade.objective_score > HR_OBJECTIVE_MAX || !Array.isArray(grade.critical_flags)) bad('Invalid score.');
  const flagsReviewed = grade.critical_flags.every((flag) => flag.status === 'reviewed');
  return {
    ...grade,
    human_score: humanScore,
    total_score: flagsReviewed ? grade.objective_score + humanScore : null,
    score_status: flagsReviewed ? 'scored' : 'review_required',
    modules: grade.modules.map((m) => (m.id === 'HR04' ? { ...m, points: humanScore, evidence: { ...m.evidence, status: 'reviewed' } } : m)),
  };
}

export function hrInterviewPrompts(grade) {
  const prompts = [];
  const m1 = grade.modules.find((m) => m.id === 'HR01');
  const m2 = grade.modules.find((m) => m.id === 'HR02');
  const m3 = grade.modules.find((m) => m.id === 'HR03');
  const m4 = grade.modules.find((m) => m.id === 'HR04');
  const m5 = grade.modules.find((m) => m.id === 'HR05');
  if (m1 && m1.evidence.discrepancies_corrected < 6) prompts.push('Walk me through how you would verify employee records before approval.');
  if (grade.critical_flags.some((f) => f.code === 'UNVERIFIED_DISCLOSURE')) prompts.push('How would you establish a manager\'s authority to access salary information?');
  if (m3 && m3.evidence.rule_application < 8) prompts.push('How do you learn a new procedure and check that you have applied it correctly?');
  if (m4 && m4.evidence.status === 'reviewed' && m4.evidence.criteria && m4.evidence.criteria.find((c) => c.id === 'C05')?.points === 0) prompts.push('What steps would you take to confirm and document instructions received verbally?');
  if (m5 && m5.evidence.formula_points < 5) prompts.push('Show how you calculated the leave balance and how you would check the result.');
  return prompts.slice(0, 3);
}

export function validateHrReview(rubric, submission) {
  if (!isObj(submission) || !isObj(submission.criteria)) bad('Review criteria missing.');
  const byId = Object.fromEntries(rubric.map((c) => [c.id, c]));
  const ids = Object.keys(submission.criteria);
  if (ids.length !== 9 || new Set(ids).size !== 9) bad('Review needs all nine criteria.');
  let sum = 0;
  for (const [id, pts] of Object.entries(submission.criteria)) {
    const c = byId[id];
    if (!c) bad(`Unknown criterion ${id}.`);
    if (!Number.isInteger(pts) || !c.allowed.includes(pts)) bad(`Invalid points for ${id}.`);
    sum += pts;
  }
  const rationale = String(submission.rationale || '').trim();
  if (rationale.length < 8 || rationale.length > 2000) bad('Review rationale must be 8–2000 characters.');
  const reviewer = String(submission.reviewer || '').trim();
  if (reviewer.length < 2 || reviewer.length > 120) bad('Reviewer reference required.');
  return { criteria: submission.criteria, earned: sum, rationale, reviewer };
}
