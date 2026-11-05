/* Assessment battery, format 'battery-v2' (pure logic; no D1, no network).
   Used by assessment-core.js dispatch and the admin report.

   A battery has sections of items. Item types:
     single  multiple choice, one correct option
     multi   select all correct options (exact set match)
     text    typed text (normalised: case and spacing ignored)
     cell    answer read from a WORKBOOK CELL the candidate calculates (server-evaluated)

   Every item belongs to a category: 'knowledge' (out of 40) or 'reconciliation' (out of 60),
   matching the results table bounds. Scoring is deterministic and all-or-nothing per item.
   Answer keys are only in scoring_key_json (never returned to the candidate). */

import { calculateCell, CELL_REF, QUALIFIED_REF, splitRef } from '../../src/assessments/formulas.js';

export const BATTERY_FORMAT = 'battery-v2';
export const BATTERY_ENGINE = 'ap-battery-v2';
export const CATEGORY_WEIGHT = { knowledge: 40, reconciliation: 60 };
const ITEM_TYPES = new Set(['single', 'multi', 'text', 'cell']);
const DEFAULT_PASS_PERCENT = 75;
const MAX_ITEMS = 30;
const MAX_SECTIONS = 6;
const MAX_SOURCE_CELLS = 300;
const MAX_PACKAGE_BYTES = 60_000;
const ID = /^[a-z][a-z0-9_-]{0,31}$/;
const SHEET_NAME = /^[A-Za-z][A-Za-z0-9_]{0,15}$/;
const MAX_SHEETS = 4;
// Canonical form for comparing references: sheet names are case-insensitive, cells are upper case.
export const canonRef = (ref) => {
  const { sheet, cell } = splitRef(ref);
  return (sheet ? sheet.toLowerCase() + '!' : '') + String(cell).toUpperCase();
};
// Option ids are sent to the candidate, so they must not reveal meaning (e.g. 'o_correct'). Use o1, o2, ...
const OPAQUE_ID = /^o[1-8]$/;

export class BatteryError extends Error {}
const bad = (message) => { throw new BatteryError(message); };
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const normaliseText = (s) => String(s).trim().replace(/\s+/g, ' ').toUpperCase();

/* Parses a workbook value for numeric comparison. Accepts 1234.5 and 1,234.50 only. */
export function parseLooseNumber(value) {
  const text = String(value ?? '').trim();
  // Plain numbers, or comma thousands grouping (22,050.00). Anything else, including
  // 22.050,00 (decimal comma), is ambiguous and refused rather than guessed.
  if (!/^-?(\d+(\.\d+)?|\d{1,3}(,\d{3})+(\.\d+)?)$/.test(text)) return null;
  const n = Number(text.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function isBatteryPayload(payload) {
  return isObj(payload) && payload.format === BATTERY_FORMAT;
}

/* ---- validation ----------------------------------------------------------- */

/* Sheets: optional. Without sheets the battery uses one default sheet (unqualified refs), as before.
   With sheets, every reference must be qualified with a declared sheet name. */
export function workbookSheets(workbook) {
  if (!workbook || workbook.sheets === undefined) return { sheetNames: null, writableSheets: null };
  const list = workbook.sheets;
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_SHEETS) bad('Workbook needs 1–4 sheets.');
  const names = new Set(), writable = new Set();
  for (const sheet of list) {
    if (!isObj(sheet) || typeof sheet.name !== 'string' || !SHEET_NAME.test(sheet.name) || typeof sheet.writable !== 'boolean') bad('Invalid sheet definition.');
    const key = sheet.name.toLowerCase();
    if (names.has(key)) bad('Sheet names must be unique.');
    names.add(key);
    if (sheet.writable) writable.add(key);
  }
  if (writable.size < 1) bad('At least one sheet must be writable.');
  return { sheetNames: names, writableSheets: writable };
}

export function validateBattery(pkg) {
  const payload = pkg.question_payload;
  const key = pkg.scoring_key;
  if (!isObj(payload) || payload.format !== BATTERY_FORMAT) bad('Not a battery-v2 package.');
  if (JSON.stringify(pkg).length > MAX_PACKAGE_BYTES) bad('Assessment package too large.');
  if (typeof payload.instructions !== 'string' || payload.instructions.trim().length < 20 || payload.instructions.length > 1500) bad('Instructions must be 20–1500 characters.');
  if (!isObj(payload.workbook) || !isObj(payload.workbook.source)) bad('Battery requires workbook.source (read-only cells).');
  const source = payload.workbook.source;
  const sourceRefs = Object.keys(source);
  const { sheetNames, writableSheets } = workbookSheets(payload.workbook);
  const sourceCanon = new Set(sourceRefs.map(canonRef));
  if (sourceRefs.length < 1 || sourceRefs.length > MAX_SOURCE_CELLS) bad('Source cell count out of range.');
  for (const ref of sourceRefs) {
    if (!QUALIFIED_REF.test(ref)) bad('Invalid source cell reference.');
    const { sheet } = splitRef(ref);
    if (sheetNames ? !sheetNames.has(sheet.toLowerCase()) : sheet !== '') bad('Source cell names an unknown sheet.');
    const v = source[ref];
    if ((typeof v !== 'string' && typeof v !== 'number') || String(v).length > 200) bad('Invalid source cell value.');
  }
  if (!Array.isArray(payload.sections) || payload.sections.length < 2 || payload.sections.length > MAX_SECTIONS) bad('Battery needs 2–6 sections.');
  if (!isObj(key) || !isObj(key.items)) bad('Scoring key requires items.');
  const passPercent = key.pass_percent ?? DEFAULT_PASS_PERCENT;
  if (!Number.isFinite(passPercent) || passPercent < 50 || passPercent > 100) bad('pass_percent must be 50–100.');

  const seen = new Set();
  const categories = new Set();
  let count = 0;
  for (const section of payload.sections) {
    if (!isObj(section) || !ID.test(section.id) || typeof section.title !== 'string' || section.title.trim().length < 3 || section.title.length > 120) bad('Invalid section.');
    if (!Array.isArray(section.items) || section.items.length < 1 || section.items.length > 12) bad('Each section needs 1–12 items.');
    for (const item of section.items) {
      if (!isObj(item) || !ID.test(item.id) || seen.has(item.id)) bad('Invalid or duplicate item id.');
      seen.add(item.id);
      count += 1;
      if (!ITEM_TYPES.has(item.type)) bad('Unknown item type.');
      if (!Number.isInteger(item.points) || item.points < 1 || item.points > 10) bad('Item points must be 1–10.');
      if (!['knowledge', 'reconciliation'].includes(item.category)) bad('Item category must be knowledge or reconciliation.');
      categories.add(item.category);
      if (typeof item.prompt !== 'string' || item.prompt.trim().length < 15 || item.prompt.length > 900) bad('Prompt must be 15–900 characters.');
      if (item.instructions !== undefined && (typeof item.instructions !== 'string' || item.instructions.trim().length > 600)) bad('Instructions must be text of at most 600 characters.');
      const k = key.items[item.id];
      if (!isObj(k)) bad(`Missing answer key for ${item.id}.`);
      if (item.type === 'single' || item.type === 'multi') {
        if (!Array.isArray(item.options) || item.options.length < (item.type === 'single' ? 2 : 3) || item.options.length > 8) bad('Invalid option count.');
        const optionIds = new Set();
        for (const o of item.options) {
          if (!isObj(o) || !OPAQUE_ID.test(o.id) || optionIds.has(o.id) || typeof o.text !== 'string' || !o.text.trim() || o.text.length > 450) bad('Invalid option.');
          optionIds.add(o.id);
        }
        if (item.type === 'single') {
          if (!optionIds.has(k.answer)) bad(`Answer for ${item.id} is not an option.`);
        } else {
          if (!Array.isArray(k.answer) || k.answer.length < 1 || k.answer.length >= item.options.length || k.answer.some((o) => !optionIds.has(o))) bad(`Multi answer for ${item.id} is invalid.`);
        }
        if (k.unsafe !== undefined && (!Array.isArray(k.unsafe) || k.unsafe.some((o) => !optionIds.has(o)))) bad(`Unsafe options for ${item.id} are invalid.`);
      } else if (item.type === 'text') {
        if (typeof k.answer !== 'string' || !k.answer.trim() || k.answer.length > 100) bad(`Text answer for ${item.id} is invalid.`);
      } else if (item.type === 'cell') {
        if (!QUALIFIED_REF.test(item.ref)) bad(`Invalid cell reference for ${item.id}.`);
        const { sheet: itemSheet } = splitRef(item.ref);
        if (sheetNames ? !writableSheets.has(itemSheet.toLowerCase()) : itemSheet !== '') bad(`${item.id} must point at a writable sheet.`);
        if (sourceCanon.has(canonRef(item.ref))) bad(`${item.id} points at a read-only source cell.`);
        const numericAnswer = typeof k.answer === 'number' && Number.isFinite(k.answer);
        const textAnswer = typeof k.answer === 'string' && k.answer.trim().length > 0 && k.answer.length <= 100;
        if (!numericAnswer && !textAnswer) bad(`Cell answer for ${item.id} must be a number or short text.`);
        if (k.tolerance !== undefined && (typeof k.tolerance !== 'number' || k.tolerance < 0 || k.tolerance > 1)) bad('Tolerance must be 0–1.');
      }
    }
  }
  if (count < 3 || count > MAX_ITEMS) bad('Battery needs 3–30 items.');
  // A sheet that is not writable is read-only; every source cell must sit in a declared sheet.
  if (!categories.has('knowledge') || !categories.has('reconciliation')) bad('Battery needs knowledge and reconciliation items.');
  for (const id of Object.keys(key.items)) if (!seen.has(id)) bad(`Key has an answer for unknown item ${id}.`);
  return {
    question_payload: payload,
    scoring_key: { ...key, format: BATTERY_FORMAT, pass_percent: passPercent },
    engine: BATTERY_ENGINE,
  };
}

/* ---- candidate-facing payload (allowlist; no keys, no weights) ----------- */

export function publicBattery(payload) {
  return {
    format: BATTERY_FORMAT,
    instructions: payload.instructions.slice(0, 1500),
    sections: payload.sections.map((s) => ({
      id: s.id,
      title: s.title,
      items: s.items.map((item) => {
        const base = { id: item.id, type: item.type, prompt: item.prompt };
        if (typeof item.instructions === 'string' && item.instructions.trim()) base.instructions = item.instructions.trim();
        if (item.type === 'single' || item.type === 'multi') base.options = item.options.map((o) => ({ id: o.id, text: o.text }));
        if (item.type === 'cell') base.ref = item.ref;
        return base;
      }),
    })),
    workbook: {
      sheets: Array.isArray(payload.workbook.sheets) ? payload.workbook.sheets.map((s) => ({ name: s.name, writable: s.writable })) : null,
      source: Object.fromEntries(Object.entries(payload.workbook.source).map(([ref, v]) => [ref, String(v).slice(0, 200)])),
    },
  };
}

/* ---- submission cleaning (client data is untrusted) ---------------------- */

export function cleanBatterySubmission(payload, publicBat) {
  const byId = new Map();
  for (const s of publicBat.sections) for (const item of s.items) byId.set(item.id, item);
  const mcq = {}, text = {}, multi = {};
  const data = isObj(payload?.mcq) ? payload.mcq : {};
  for (const [id, value] of Object.entries(data)) {
    const item = byId.get(id);
    if (!item || item.type !== 'single' || !item.options.some((o) => o.id === value)) bad('Invalid single-choice answer.');
    mcq[id] = value;
  }
  const structured = isObj(payload?.structured) ? payload.structured : {};
  for (const [id, value] of Object.entries(isObj(structured.text) ? structured.text : {})) {
    const item = byId.get(id);
    if (!item || item.type !== 'text' || typeof value !== 'string') bad('Invalid text answer.');
    const trimmed = value.trim().slice(0, 200);
    if (trimmed) text[id] = trimmed;
  }
  for (const [id, value] of Object.entries(isObj(structured.multi) ? structured.multi : {})) {
    const item = byId.get(id);
    if (!item || item.type !== 'multi' || !Array.isArray(value) || value.length > item.options.length) bad('Invalid multi-select answer.');
    const valid = new Set(item.options.map((o) => o.id));
    const chosen = [...new Set(value)];
    if (chosen.some((o) => !valid.has(o))) bad('Invalid multi-select option.');
    if (chosen.length) multi[id] = chosen;
  }
  return { mcq, structured: { text, multi } };
}

/* Rules the server enforces on saves, derived from the published battery (candidate-facing). */
export function batteryWorkbookRules(publicBat) {
  const sheets = publicBat.workbook.sheets;
  return {
    sourceCanon: new Set(Object.keys(publicBat.workbook.source).map(canonRef)),
    writableSheets: sheets ? new Set(sheets.filter((s) => s.writable).map((s) => s.name.toLowerCase())) : null,
  };
}

/* Workbook: only candidate working cells on writable sheets. Source cells are rejected, not dropped. */
export function cleanBatteryWorkbook(cells, rules) {
  if (!isObj(cells) || Object.keys(cells).length > 400) bad('Invalid workbook cells.');
  const safe = {};
  for (const [ref, raw] of Object.entries(cells)) {
    if (!QUALIFIED_REF.test(ref)) bad('Invalid workbook cell.');
    const { sheet } = splitRef(ref);
    if (rules.writableSheets ? !rules.writableSheets.has(sheet.toLowerCase()) : sheet !== '') bad('That sheet is read-only.');
    if (rules.sourceCanon.has(canonRef(ref))) bad('Source cells are read-only.');
    if (typeof raw !== 'string' && typeof raw !== 'number') bad('Invalid cell value.');
    const value = String(raw);
    if (value.length > 200) bad('Cell content is too long.');
    safe[ref] = value;
  }
  if (JSON.stringify(safe).length > 48_000) bad('Workbook too large.');
  return safe;
}

/* ---- grading --------------------------------------------------------------- */

function gradeItem(item, key, answers, merged) {
  const given = answers;
  let correct = false;
  let givenText = null;
  let correctText = '';
  if (item.type === 'single') {
    const option = item.options.find((o) => o.id === given.single);
    givenText = option ? option.text : null;
    correct = given.single === key.answer;
    correctText = item.options.find((o) => o.id === key.answer)?.text || '';
  } else if (item.type === 'multi') {
    const chosen = given.multi || [];
    givenText = chosen.length ? chosen.map((c) => item.options.find((o) => o.id === c)?.text || c).join('; ') : null;
    const want = [...key.answer].sort().join('|');
    correct = chosen.length > 0 && [...chosen].sort().join('|') === want;
    correctText = key.answer.map((c) => item.options.find((o) => o.id === c)?.text || c).join('; ');
  } else if (item.type === 'text') {
    givenText = given.text ?? null;
    correct = givenText !== null && normaliseText(givenText) === normaliseText(key.answer);
    correctText = key.answer;
  } else {
    const shown = calculateCell(merged, item.ref);
    givenText = shown === '' ? null : shown;
    if (typeof key.answer === 'string') {
      // Text cell answers (e.g. IF(...) returning a word) compare like typed text.
      correct = givenText !== null && normaliseText(givenText) === normaliseText(key.answer);
    } else {
      const n = parseLooseNumber(shown);
      correct = n !== null && Math.abs(n - key.answer) <= (key.tolerance ?? 0.005) + 1e-9;
    }
    correctText = String(key.answer);
  }
  const unsafeHit = (item.type === 'single' && Array.isArray(key.unsafe) && key.unsafe.includes(given.single))
    || (item.type === 'multi' && Array.isArray(key.unsafe) && (given.multi || []).some((o) => key.unsafe.includes(o)));
  return { correct, givenText, correctText, unsafeHit };
}

/* Full grading. `answers` = { mcq, structured:{text,multi}, workbook } as stored. */
export function gradeBattery(version, answers) {
  const payload = version.payload;
  const key = version.key;
  const passPercent = key.pass_percent ?? DEFAULT_PASS_PERCENT;
  const source = payload.workbook.source;
  const merged = { ...Object.fromEntries(Object.entries(source).map(([r, v]) => [r, String(v)])), ...(answers.workbook || {}) };
  const flags = [];
  const totals = { knowledge: { earned: 0, max: 0 }, reconciliation: { earned: 0, max: 0 } };
  const sectionRows = [];
  const items = [];

  for (const section of payload.sections) {
    const row = { id: section.id, title: section.title, earned: 0, max: 0 };
    for (const item of section.items) {
      const k = key.items[item.id];
      const given = {
        single: answers.mcq?.[item.id],
        multi: answers.structured?.multi?.[item.id],
        text: answers.structured?.text?.[item.id],
      };
      const g = gradeItem(item, k, given, merged);
      const awarded = g.correct ? item.points : 0;
      if (g.unsafeHit) flags.push(`Unsafe choice selected in ${section.title}`);
      totals[item.category].earned += awarded;
      totals[item.category].max += item.points;
      row.earned += awarded;
      row.max += item.points;
      items.push({
        id: item.id, section: section.title, category: item.category, type: item.type, prompt: item.prompt,
        given: g.givenText, correctAnswer: g.correctText, correct: g.givenText === null ? null : g.correct,
        awarded, points: item.points, ref: item.type === 'cell' ? item.ref : undefined,
      });
    }
    sectionRows.push(row);
  }

  const k = totals.knowledge, r = totals.reconciliation;
  if (k.max <= 0 || r.max <= 0) bad('Both categories must carry points.');
  const knowledgeScore = Math.round((CATEGORY_WEIGHT.knowledge * k.earned) / k.max);
  const reconciliationScore = Math.round((CATEGORY_WEIGHT.reconciliation * r.earned) / r.max);
  const exactPercent = (CATEGORY_WEIGHT.knowledge * k.earned) / k.max + (CATEGORY_WEIGHT.reconciliation * r.earned) / r.max;
  const overall = knowledgeScore + reconciliationScore;
  const pct = (e, m) => Math.round((e / m) * 1000) / 10;

  return {
    engine: BATTERY_ENGINE,
    overall_score: overall,
    knowledge_score: knowledgeScore,
    reconciliation_score: reconciliationScore,
    passed: exactPercent >= passPercent,
    pass_percent: passPercent,
    breakdown: {
      categories: {
        knowledge: { earned: k.earned, max: k.max, percent: pct(k.earned, k.max) },
        reconciliation: { earned: r.earned, max: r.max, percent: pct(r.earned, r.max) },
      },
      sections: sectionRows.map((s) => ({ ...s, percent: s.max ? pct(s.earned, s.max) : 0 })),
      items_correct: items.filter((i) => i.correct === true).length,
      items_total: items.length,
    },
    critical_flags: [...new Set(flags)],
    interpretation: `Overall ${overall}/100 (knowledge ${knowledgeScore}/40, reconciliation ${reconciliationScore}/60). `
      + `This is short practical screening evidence for the tested items only; it does not establish job performance.`,
    items,
    workbook_values: Object.fromEntries(Object.keys(merged).map((ref) => [ref, calculateCell(merged, ref)])),
  };
}
