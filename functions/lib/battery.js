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
import { scoreNote } from './assessment-review.js';

export const BATTERY_FORMAT = 'battery-v2';
// Stored as results.scoring_version. Family-neutral, because the same engine grades every
// battery (payable, receivable or any later one); the assessment slug identifies the family.
export const BATTERY_ENGINE = 'battery-v2';
export const CATEGORY_WEIGHT = { knowledge: 40, reconciliation: 60 };
// ref: a document reference (a single code such as ABC-123). note: a short written handoff, scored
// by the server from evidence markers in its key, on the same zero-or-full rule as any other field.
const ITEM_TYPES = new Set(['single', 'multi', 'text', 'cell', 'ref', 'note', 'match']);
// Cognitive demand. Only used for reporting and item-analysis targets; it never changes a score.
const LEVELS = new Set(['foundation', 'core', 'stretch']);
// 'match': the candidate classifies each listed line (for example every statement and ledger line) with one of a
// few shared choices. One point per line, so the result shows the reasoning line by line.
const LINE_ID = /^l[0-9]{1,2}$/;
const MAX_MATCH_LINES = 12;
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

/* Reads an amount or count the way a person types it, so a correct value is never marked wrong
   for its formatting. Accepted:
   - currency marks before or after the number: R, ZAR, rand, rands (any case, with or without a space);
   - thousands marks: spaces (including non-breaking), apostrophes, and full stops or commas in groups of 3;
   - decimal marks: a full stop or a comma;
   - endings such as ",-" or ".-" (R26 050,-), and a trailing full stop;
   - negatives: a leading minus (- or −), or the value in brackets;
   - whole numbers written as words from zero to twenty (for counts).
   Separators: when both a full stop and a comma appear, the last one is the decimal mark. When only one
   kind appears once, it is a decimal mark if 1 or 2 digits follow it and a thousands mark if exactly 3
   digits follow (rand amounts never carry three decimals). Repeated, it is a thousands mark.
   Returns null when the text is not a number. */
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export function parseAmount(value) {
  let text = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (!text) return null;
  const word = NUMBER_WORDS.indexOf(text.replace(/[.!]$/, ''));
  if (word >= 0) return word;
  let negative = false, minusSigns = 0;
  const flip = () => { negative = !negative; minusSigns += 1; return ''; };
  if (/^\(.*\)$/.test(text)) { negative = true; minusSigns += 1; text = text.slice(1, -1).trim(); }
  text = text.replace(/[−‒–—]/g, '-');
  // Currency words and marks, before or after the number, in any order with a minus sign.
  for (let i = 0; i < 3; i += 1) {
    text = text.replace(/^-\s*/, flip)
      .replace(/^(zar|rands?|r)\s*/, '')
      .replace(/\s*(zar|rands?|r)$/, '')
      .trim();
  }
  text = text.replace(/[.,]-$/, '').replace(/-$/, flip);
  if (minusSigns > 1) return null;
  text = text.replace(/[\s'‘’ʼ`]/g, '');
  if (text.endsWith('.') || text.endsWith(',')) text = text.slice(0, -1);
  if (!/^[\d.,]*\d[\d.,]*$/.test(text) && !/^[.,]\d+$/.test(text)) return null;
  const dots = (text.match(/\./g) || []).length, commas = (text.match(/,/g) || []).length;
  let intPart = text, decimals = '';
  // Thousands groups: 1 to 3 digits first, then exactly 3 digits after each mark.
  const groupsOk = (s, sep) => s.split(sep).every((g, i) => (i === 0 ? /^\d{1,3}$/.test(g) : /^\d{3}$/.test(g)));
  if (dots && commas) {
    const decimalSep = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    const at = text.lastIndexOf(decimalSep);
    intPart = text.slice(0, at); decimals = text.slice(at + 1);
    if (intPart.includes(decimalSep) || !/^\d+$/.test(decimals) || !groupsOk(intPart, thousandsSep)) return null;
    intPart = intPart.split(thousandsSep).join('');
  } else if (dots + commas === 1) {
    const sep = dots ? '.' : ',';
    const [a, b] = text.split(sep);
    if (b.length === 3 && a.length >= 1 && a.length <= 3) { intPart = a + b; }
    else { intPart = a || '0'; decimals = b; }
  } else if (dots + commas > 1) {
    const sep = dots ? '.' : ',';
    if (!groupsOk(text, sep)) return null;
    intPart = text.split(sep).join('');
  }
  if (!/^\d+$/.test(intPart) || (decimals && !/^\d+$/.test(decimals))) return null;
  const n = Number(intPart + (decimals ? '.' + decimals : ''));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/* Display mode for the source records. 'grid' (default) is the spreadsheet; 'documents' shows the
   listed ranges as plain read-only tables and hides the grid, so candidates answer in the boxes only. */
const DOCUMENT_RANGE = /^([A-Za-z][A-Za-z0-9_]{0,15})!([A-J](?:[1-9]|[1-3][0-9]|40)):([A-J](?:[1-9]|[1-3][0-9]|40))$/;
function validateDisplay(workbook, sheetNames, writableSheets) {
  if (workbook.display === undefined || workbook.display === 'grid') {
    if (workbook.documents !== undefined) bad('Documents are only used with display "documents".');
    return;
  }
  if (workbook.display !== 'documents') bad('Workbook display must be "grid" or "documents".');
  if (!sheetNames) bad('Documents need named sheets.');
  const docs = workbook.documents;
  if (!Array.isArray(docs) || docs.length < 1 || docs.length > 8) bad('Documents need 1–8 entries.');
  for (const doc of docs) {
    if (!isObj(doc) || typeof doc.title !== 'string' || doc.title.trim().length < 3 || doc.title.length > 120) bad('Invalid document title.');
    const m = DOCUMENT_RANGE.exec(typeof doc.range === 'string' ? doc.range : '');
    if (!m) bad('Invalid document range.');
    const sheet = m[1].toLowerCase();
    if (!sheetNames.has(sheet) || writableSheets.has(sheet)) bad('A document must show a read-only sheet.');
  }
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
  validateDisplay(payload.workbook, sheetNames, writableSheets);
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
    const sectionLimit = section.answer_table === undefined ? 12 : 18;
    if (!Array.isArray(section.items) || section.items.length < 1 || section.items.length > sectionLimit) bad(`Each section needs 1–${sectionLimit} items.`);
    if (section.answer_table !== undefined) {
      const table = section.answer_table;
      if (payload.workbook.display !== 'documents' || !isObj(table) || typeof table.caption !== 'string' || table.caption.trim().length < 3 || table.caption.length > 120 || !Array.isArray(table.rows) || table.rows.length < 1 || table.rows.length > 8) bad('Invalid answer table.');
      const byId = new Map(section.items.filter(isObj).map(item => [item.id, item]));
      const used = new Set(), refs = new Set();
      for (const row of table.rows) {
        if (!isObj(row) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 120 || used.has(row.side) || used.has(row.amount) || row.side === row.amount) bad('Invalid answer table row.');
        const side = byId.get(row.side), amount = byId.get(row.amount);
        if (!side || side.type !== 'single' || !Array.isArray(side.options) || side.options.length !== 2 || side.options.map(o => String(o?.text).trim().toLowerCase()).sort().join('|') !== 'credit|debit' || !amount || amount.type !== 'cell' || amount.format !== 'rand' || typeof amount.ref !== 'string' || !QUALIFIED_REF.test(amount.ref) || refs.has(canonRef(amount.ref))) bad('Answer table requires unique rand cells and debit/credit choices in the same section.');
        if (typeof key.items[amount.id]?.answer !== 'number' || !Number.isFinite(key.items[amount.id].answer) || key.items[amount.id].answer <= 0) bad('Answer table amounts require positive numeric keys; zero-balance rows need another format.');
        refs.add(canonRef(amount.ref)); used.add(row.side); used.add(row.amount);
      }
    }
    if (section.cap !== undefined && (!Number.isInteger(section.cap) || section.cap < 1 || section.cap > 100)) bad('Section cap must be a whole number of 1–100.');
    for (const item of section.items) {
      if (!isObj(item) || !ID.test(item.id) || seen.has(item.id)) bad('Invalid or duplicate item id.');
      seen.add(item.id);
      count += 1;
      if (!ITEM_TYPES.has(item.type)) bad('Unknown item type.');
      if (item.type === 'match') {
        if (!Array.isArray(item.lines) || item.lines.length < 2 || item.lines.length > MAX_MATCH_LINES) bad(`Match ${item.id} needs 2–${MAX_MATCH_LINES} lines.`);
        if (item.points !== item.lines.length) bad(`Match ${item.id} scores one point per line, so its points must equal its line count.`);
      } else if (!Number.isInteger(item.points) || item.points < 1 || item.points > 10) bad('Item points must be 1–10.');
      if (!['knowledge', 'reconciliation'].includes(item.category)) bad('Item category must be knowledge or reconciliation.');
      categories.add(item.category);
      if (item.level !== undefined && !LEVELS.has(item.level)) bad('Item level must be foundation, core or stretch.');
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
      } else if (item.type === 'match') {
        if (!Array.isArray(item.choices) || item.choices.length < 2 || item.choices.length > 6) bad(`Match ${item.id} needs 2–6 choices.`);
        const choiceIds = new Set();
        for (const c of item.choices) {
          if (!isObj(c) || !OPAQUE_ID.test(c.id) || choiceIds.has(c.id) || typeof c.text !== 'string' || !c.text.trim() || c.text.length > 80) bad('Invalid match choice.');
          choiceIds.add(c.id);
        }
        const lineIds = new Set();
        for (const l of item.lines) {
          if (!isObj(l) || !LINE_ID.test(l.id) || lineIds.has(l.id)) bad('Invalid match line id.');
          for (const f of ['doc', 'ref', 'detail']) if (typeof l[f] !== 'string' || !l[f].trim() || l[f].length > 160) bad('Invalid match line.');
          if (l.amount !== undefined && (typeof l.amount !== 'string' || l.amount.length > 40)) bad('Invalid match line amount.');
          lineIds.add(l.id);
        }
        const validMap = (m) => isObj(m) && Object.keys(m).every((lid) => lineIds.has(lid)) && Object.values(m).every((cid) => choiceIds.has(cid));
        if (!validMap(k.answer) || Object.keys(k.answer).length !== lineIds.size) bad(`Match answer for ${item.id} must classify every line.`);
        // Alternatives: equally correct readings for some lines (for example which of two identical entries is the duplicate).
        if (k.alternatives !== undefined && (!Array.isArray(k.alternatives) || k.alternatives.length > 4 || !k.alternatives.every(validMap))) bad(`Match alternatives for ${item.id} are invalid.`);
      } else if (item.type === 'text') {
        if (typeof k.answer !== 'string' || !k.answer.trim() || k.answer.length > 100) bad(`Text answer for ${item.id} is invalid.`);
      } else if (item.type === 'ref') {
        // A document code is matched as normalised text. Only the formatting rule can vary.
        if (typeof k.answer !== 'string' || !k.answer.trim() || k.answer.length > 60) bad(`Reference answer for ${item.id} is invalid.`);
      } else if (item.type === 'note') {
        // A written handoff: scored from evidence markers, all or nothing per criterion, so it needs
        // no answer. Each criterion is worth two points and the criteria must add up to the item.
        if (k.answer !== undefined) bad(`A note item is scored from its criteria and must not carry an answer (${item.id}).`);
        if (!Array.isArray(k.criteria) || k.criteria.length < 1 || k.criteria.length > 8) bad(`Note criteria for ${item.id} must be 1–8 entries.`);
        const criterionIds = new Set();
        for (const criterion of k.criteria) {
          if (!isObj(criterion) || typeof criterion.id !== 'string' || !ID.test(criterion.id) || criterionIds.has(criterion.id)) bad('Invalid note criterion.');
          criterionIds.add(criterion.id);
          if (typeof criterion.label !== 'string' || criterion.label.trim().length < 3 || criterion.label.length > 160) bad('Invalid note criterion label.');
          // Every marker must be a plain phrase. An empty or overlong marker would match everything
          // or nothing, so it is a build error rather than a silent mis-score.
          const markers = [criterion.all, criterion.any, criterion.none];
          // A criterion needs a POSITIVE marker to be earnable. Disqualifiers alone would award the
          // points to any text that avoids the wrong word, including text that says nothing.
          const positive = [criterion.all, criterion.any].some((list) => Array.isArray(list) && list.length);
          if (!positive) bad(`Note criterion ${criterion.id} needs at least one positive marker (all or any).`);
          for (const list of markers) {
            if (list === undefined) continue;
            if (!Array.isArray(list) || list.length > 24) bad(`Invalid marker list for ${criterion.id}.`);
            for (const term of list) {
              if (typeof term !== 'string' || term.trim().length < 2 || term.length > 60) bad(`Invalid marker for ${criterion.id}.`);
            }
          }
        }
        if (k.criteria.length * 2 !== item.points) bad(`Note ${item.id} is worth ${item.points} points but has ${k.criteria.length} criteria at 2 points each.`);
      } else if (item.type === 'cell') {
        if (!QUALIFIED_REF.test(item.ref)) bad(`Invalid cell reference for ${item.id}.`);
        const { sheet: itemSheet } = splitRef(item.ref);
        if (sheetNames ? !writableSheets.has(itemSheet.toLowerCase()) : itemSheet !== '') bad(`${item.id} must point at a writable sheet.`);
        if (sourceCanon.has(canonRef(item.ref))) bad(`${item.id} points at a read-only source cell.`);
        const numericAnswer = typeof k.answer === 'number' && Number.isFinite(k.answer);
        const textAnswer = typeof k.answer === 'string' && k.answer.trim().length > 0 && k.answer.length <= 100;
        if (!numericAnswer && !textAnswer) bad(`Cell answer for ${item.id} must be a number or short text.`);
        if (k.tolerance !== undefined && (typeof k.tolerance !== 'number' || k.tolerance < 0 || k.tolerance > 1)) bad('Tolerance must be 0–1.');
        // Optional answer format: tells the answer box what to expect ('rand' amount or whole-number 'count').
        if (item.format !== undefined && !['rand', 'count'].includes(item.format)) bad(`Answer format for ${item.id} must be "rand" or "count".`);
      }
    }
  }
  // A table answer must not silently share its workbook cell with any other item.
  const tableRefs = new Set();
  for (const section of payload.sections) for (const row of section.answer_table?.rows || []) {
    const amount = section.items.find(item => item.id === row.amount);
    const ref = canonRef(amount.ref);
    if (tableRefs.has(ref)) bad('Answer table cells must be unique.');
    tableRefs.add(ref);
  }
  for (const ref of tableRefs) {
    const uses = payload.sections.flatMap(section => section.items).filter(item => item.type === 'cell' && canonRef(item.ref) === ref);
    if (uses.length !== 1) bad('Answer table cells must be unique.');
  }
  if (count < 3 || count > MAX_ITEMS) bad('Battery needs 3–30 items.');
  // A declared cap is the component weight, so the authored points must add up to it exactly.
  for (const section of payload.sections) {
    if (!Number.isInteger(section.cap)) continue;
    const authored = section.items.reduce((n, item) => n + item.points, 0);
    if (authored !== section.cap) bad(`Section "${section.title}" declares a cap of ${section.cap} but its items total ${authored}.`);
  }
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
      ...(s.answer_table ? { answer_table: { caption: s.answer_table.caption, rows: s.answer_table.rows.map(row => ({ label: row.label, side: row.side, amount: row.amount })) } } : {}),
      items: s.items.map((item) => {
        const base = { id: item.id, type: item.type, prompt: item.prompt };
        if (item.level) base.level = item.level;
        if (item.hint) base.hint = item.hint;
        if (typeof item.instructions === 'string' && item.instructions.trim()) base.instructions = item.instructions.trim();
        if (item.type === 'single' || item.type === 'multi') base.options = item.options.map((o) => ({ id: o.id, text: o.text }));
        if (item.type === 'match') {
          base.choices = item.choices.map((c) => ({ id: c.id, text: c.text }));
          base.lines = item.lines.map((l) => ({ id: l.id, doc: l.doc, ref: l.ref, detail: l.detail, ...(l.amount ? { amount: l.amount } : {}) }));
        }
        if (item.type === 'cell') { base.ref = item.ref; if (item.format === 'rand' || item.format === 'count') base.format = item.format; }
        return base;
      }),
    })),
    workbook: {
      sheets: Array.isArray(payload.workbook.sheets) ? payload.workbook.sheets.map((s) => ({ name: s.name, writable: s.writable })) : null,
      source: Object.fromEntries(Object.entries(payload.workbook.source).map(([ref, v]) => [ref, String(v).slice(0, 200)])),
      ...(payload.workbook.display === 'documents' ? {
        display: 'documents',
        documents: payload.workbook.documents.map((d) => ({ title: d.title, range: d.range })),
      } : {}),
    },
  };
}

/* ---- submission cleaning (client data is untrusted) ---------------------- */

export function cleanBatterySubmission(payload, publicBat) {
  const byId = new Map();
  for (const s of publicBat.sections) for (const item of s.items) byId.set(item.id, item);
  const mcq = {}, text = {}, multi = {}, match = {};
  const data = isObj(payload?.mcq) ? payload.mcq : {};
  for (const [id, value] of Object.entries(data)) {
    const item = byId.get(id);
    if (!item || item.type !== 'single' || !item.options.some((o) => o.id === value)) bad('Invalid single-choice answer.');
    mcq[id] = value;
  }
  const structured = isObj(payload?.structured) ? payload.structured : {};
  // text, ref and note answers share one map. The type decides how the server treats the entry.
  for (const [id, value] of Object.entries(isObj(structured.text) ? structured.text : {})) {
    const item = byId.get(id);
    if (!item || !['text', 'ref', 'note'].includes(item.type) || typeof value !== 'string') bad('Invalid written answer.');
    const trimmed = value.trim().slice(0, item.type === 'note' ? 1200 : 200);
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
  for (const [id, value] of Object.entries(isObj(structured.match) ? structured.match : {})) {
    const item = byId.get(id);
    if (!item || item.type !== 'match' || !isObj(value)) bad('Invalid line-matching answer.');
    const lines = new Set(item.lines.map((l) => l.id)), choices = new Set(item.choices.map((c) => c.id));
    const clean = {};
    for (const [lid, cid] of Object.entries(value)) {
      if (!lines.has(lid) || !choices.has(cid)) bad('Invalid line-matching choice.');
      clean[lid] = cid;
    }
    if (Object.keys(clean).length) match[id] = clean;
  }
  return { mcq, structured: { text, multi, ...(Object.keys(match).length ? { match } : {}) } };
}

/* Rules the server enforces on saves, derived from the published battery (candidate-facing). */
export function batteryWorkbookRules(publicBat) {
  const sheets = publicBat.workbook.sheets;
  // Amount answer boxes (format: 'rand') refuse a signed figure on entry.
  const amountRefs = new Set();
  if (Array.isArray(publicBat.sections)) {
    for (const section of publicBat.sections) {
      for (const item of section.items || []) {
        const ref = item.ref || publicBat.activities?.find((act) => act.id === item.id)?.ref;
        if (item.format === 'rand' && ref) amountRefs.add(canonRef(ref));
      }
    }
  }
  return {
    sourceCanon: new Set(Object.keys(publicBat.workbook.source).map(canonRef)),
    writableSheets: sheets ? new Set(sheets.filter((s) => s.writable).map((s) => s.name.toLowerCase())) : null,
    amountRefs,
  };
}

/* Workbook: only candidate working cells on writable sheets. Source cells are rejected, not dropped. */
export function cleanBatteryWorkbook(cells, rules) {
  if (!isObj(cells) || Object.keys(cells).length > 400) bad('Invalid workbook cells.');
  // A signed figure is refused on entry, not silently marked wrong at the end (blueprint rule).
  if (rules.amountRefs) {
    for (const [ref, raw] of Object.entries(cells)) {
      const text = String(raw ?? '').trim();
      if (!rules.amountRefs.has(canonRef(ref)) || !text) continue;
      if (/^-/.test(text) || /^[−‒–—]/.test(text) || /^\(.*\)$/.test(text)) {
        bad(`Enter ${ref} as a positive amount, without a minus sign or brackets.`);
      }
    }
  }
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

/* A document code is compared as normalised text. A code mixed with an amount is not a code, so it
   is reported as a format problem rather than silently marked wrong. */
const REF_CODE = /^[A-Za-z]{2,6}-?\d{1,6}[A-Za-z]?$/;
export function parseReference(value) {
  const text = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, '');
  if (!text) return null;
  return REF_CODE.test(text) ? text.toUpperCase() : null;
}

/* A code is compared on its letters and digits only, so GRN-77, GRN 77 and grn77 are the same
   document. The punctuation of a real document number is not something to examine. */
const refKey = (value) => String(value ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');

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
  } else if (item.type === 'match') {
    const chosen = isObj(given.match) ? given.match : {};
    const label = (lid, cid) => { const l = item.lines.find((x) => x.id === lid); const c = item.choices.find((x) => x.id === cid); return `${l ? l.ref : lid}: ${c ? c.text : 'No answer'}`; };
    const keys = [key.answer, ...(Array.isArray(key.alternatives) ? key.alternatives.map((alt) => ({ ...key.answer, ...alt })) : [])];
    const score = (k) => item.lines.reduce((n, l) => n + (chosen[l.id] && chosen[l.id] === k[l.id] ? 1 : 0), 0);
    let best = keys[0];
    for (const k of keys) if (score(k) > score(best)) best = k;
    const linesRight = score(best);
    const answeredLines = item.lines.filter((l) => chosen[l.id]).length;
    givenText = answeredLines ? item.lines.map((l) => label(l.id, chosen[l.id])).join('; ') : null;
    correct = linesRight === item.lines.length;
    correctText = item.lines.map((l) => label(l.id, best[l.id])).join('; ');
    return { correct, givenText, correctText, unsafeHit: false, awarded: linesRight, lines: item.lines.map((l) => ({ id: l.id, ref: l.ref, doc: l.doc, given: chosen[l.id] ? item.choices.find((c) => c.id === chosen[l.id])?.text : null, correct: item.choices.find((c) => c.id === best[l.id])?.text, ok: chosen[l.id] === best[l.id] })) };
  } else if (item.type === 'text') {
    givenText = given.text ?? null;
    correct = givenText !== null && normaliseText(givenText) === normaliseText(key.answer);
    correctText = key.answer;
  } else if (item.type === 'ref') {
    // Normalise the same way the parser does, so "GRN 77" and "GRN-77" are the same code.
    givenText = String(given.text ?? '').normalize('NFKC').trim().replace(/\s+/g, '') || null;
    const parsed = givenText === null ? null : parseReference(givenText);
    correct = parsed !== null && refKey(parsed) === refKey(key.answer);
    correctText = key.answer;
  } else if (item.type === 'note') {
    // Scored by the server from the item's evidence markers. Never keyed on exact wording, so a
    // candidate is credited for what they said rather than how they said it.
    givenText = given.text ?? null;
    const note = scoreNote(key, givenText);
    return {
      correct: note.blank ? null : note.earned === note.max,
      givenText, correctText: 'Scored on published evidence markers',
      unsafeHit: false, note,
    };
  } else {
    const shown = calculateCell(merged, item.ref);
    givenText = shown === '' ? null : shown;
    if (typeof key.answer === 'string') {
      // Text cell answers (e.g. IF(...) returning a word) compare like typed text.
      correct = givenText !== null && normaliseText(givenText) === normaliseText(key.answer);
    } else {
      // A typed entry is read as a person writes amounts; a formula result is a plain computed number.
      const raw = String(merged[item.ref] ?? '').trim();
      const n = raw.startsWith('=') ? parseLooseNumber(shown) : parseAmount(raw);
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
        match: answers.structured?.match?.[item.id],
      };
      const g = gradeItem(item, k, given, merged);
      // Line matching earns one point per correct line. A written handoff earns its criteria independently:
      // two points per criterion, all or nothing within that criterion. Every other field is all or nothing.
      const awarded = item.type === 'match' ? g.awarded : g.note ? g.note.earned : (g.correct ? item.points : 0);
      if (g.unsafeHit) flags.push(`Unsafe choice selected in ${section.title}`);
      totals[item.category].earned += awarded;
      totals[item.category].max += item.points;
      row.earned += awarded;
      row.max += item.points;
      items.push({
        id: item.id, section: section.title, category: item.category, type: item.type, prompt: item.prompt,
        level: item.level || null,
        given: g.givenText, correctAnswer: g.correctText,
        // A note keeps the per-criterion evidence so a recruiter can see why it scored what it did.
        correct: g.givenText === null ? null : (g.note ? g.note.earned === g.note.max : g.correct),
        awarded, points: item.points, ref: item.type === 'cell' ? item.ref : undefined,
        ...(item.type === 'match' ? { lines: g.lines } : {}),
        ...(g.note ? { note: g.note } : {}),
      });
    }
    // A declared section cap is the component weight, and the authored points must already add up to
    // it (enforced by validateBattery). The composite is therefore a plain sum of points.
    if (Number.isInteger(section.cap)) {
      row.cap = section.cap;
      row.auto_max = row.max;
    }
    sectionRows.push(row);
  }

  const pct = (e, m) => (m ? Math.round((e / m) * 1000) / 10 : 0);

  // With declared caps the composite is a plain sum of points across the components; without them it
  // keeps the historic 40/60 category weighting. Every item is scored by the server, so the total is
  // final on submission.
  const capped = sectionRows.some((s) => Number.isInteger(s.cap));
  let autoEarned, autoMax;
  if (capped) {
    autoEarned = sectionRows.reduce((total, s) => total + s.earned, 0);
    autoMax = sectionRows.reduce((total, s) => total + s.max, 0);
  } else {
    const k = totals.knowledge, r = totals.reconciliation;
    if (k.max <= 0 || r.max <= 0) bad('Both categories must carry points.');
    autoEarned = Math.round((CATEGORY_WEIGHT.knowledge * k.earned) / k.max) + Math.round((CATEGORY_WEIGHT.reconciliation * r.earned) / r.max);
    autoMax = CATEGORY_WEIGHT.knowledge + CATEGORY_WEIGHT.reconciliation;
  }
  const exactPercent = autoMax ? (autoEarned / autoMax) * 100 : 0;
  // Category scores keep their published 40/60 meaning, scaled from the same awards.
  const k2 = totals.knowledge, r2 = totals.reconciliation;
  const knowledgeScore = k2.max ? Math.round((CATEGORY_WEIGHT.knowledge * k2.earned) / k2.max) : 0;
  const reconciliationScore = r2.max ? Math.round((CATEGORY_WEIGHT.reconciliation * r2.earned) / r2.max) : 0;
  const overall = autoEarned;

  return {
    engine: BATTERY_ENGINE,
    overall_score: overall,
    auto_scored_max: autoMax,
    knowledge_score: knowledgeScore,
    reconciliation_score: reconciliationScore,
    passed: exactPercent >= passPercent,
    pass_percent: passPercent,
    breakdown: {
      categories: {
        knowledge: { earned: k2.earned, max: k2.max, percent: pct(k2.earned, k2.max) },
        reconciliation: { earned: r2.earned, max: r2.max, percent: pct(r2.earned, r2.max) },
      },
      sections: sectionRows.map((s) => ({ ...s, percent: pct(s.earned, s.max) })),
      items_correct: items.filter((i) => i.correct === true).length,
      items_total: items.length,
      levels: ['foundation', 'core', 'stretch'].reduce((out, level) => {
        const rows = items.filter((i) => i.level === level);
        if (rows.length) out[level] = { earned: rows.reduce((n, i) => n + i.awarded, 0), max: rows.reduce((n, i) => n + i.points, 0) };
        return out;
      }, {}),
    },
    critical_flags: [...new Set(flags)],
    interpretation: `Scored ${overall}/${autoMax}`
      + '. '
      + 'This is short practical screening evidence for the tested items only; it does not establish job performance.',
    items,
    workbook_values: Object.fromEntries(Object.keys(merged).map((ref) => [ref, calculateCell(merged, ref)])),
  };
}
