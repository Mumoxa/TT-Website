/** Pure, bounded spreadsheet evaluator. No eval(). Shared by the browser and the server so
 *  grading uses exactly the values the candidate sees.
 *
 *  Addressing: A1..J40 on the default sheet, or Sheet!A1 on a named sheet (ranges: A1:B3, Sheet!A1:B3).
 *  Operators:  + - * / & (text join), comparisons = <> < > <= >=, unary minus, parentheses.
 *  Functions:  SUM MIN MAX ABS ROUND SUMIF COUNTIF IF IFERROR VLOOKUP INDEX MATCH.
 *  Values:     numbers, text, TRUE/FALSE, blanks. Errors are #VALUE! #DIV/0! #REF! #N/A #NAME? #FORMULA!.
 *
 *  Not supported (documented, returns errors rather than guessing): array formulas,
 *  MATCH with match_type -1, VLOOKUP/MATCH approximate mode on unsorted data (results are
 *  undefined by design), structured references, external workbooks. */

export const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
export const ROWS = 40;
export const CELL_REF = /^[A-J](?:[1-9]|[1-3][0-9]|40)$/;
export const QUALIFIED_REF = /^(?:[A-Za-z][A-Za-z0-9_]{0,15}!)?[A-J](?:[1-9]|[1-3][0-9]|40)$/;
const MAX_TOKENS = 400;
const MAX_RANGE_CELLS = 400;
const MAX_DEPTH = 60;
const FUNCTIONS = new Set(['SUM', 'ABS', 'MIN', 'MAX', 'ROUND', 'SUMIF', 'COUNTIF', 'IF', 'IFERROR', 'VLOOKUP', 'INDEX', 'MATCH']);

/* ---- references ---------------------------------------------------------- */

/* Splits 'Sheet!B3' into { sheet: 'Sheet', cell: 'B3' }. Unqualified refs have sheet ''. */
export function splitRef(ref) {
  const s = String(ref);
  const i = s.lastIndexOf('!');
  return i < 0 ? { sheet: '', cell: s } : { sheet: s.slice(0, i), cell: s.slice(i + 1) };
}

const canonKey = (sheet, cell) => (sheet ? sheet.toLowerCase() + '!' : '') + cell.toUpperCase();

/* ---- tokenizer ------------------------------------------------------------ */

const RULES = [
  ['ws', /\s+/y],
  ['str', /"((?:[^"]|"")*)"/y],
  ['num', /(?:\d+(?:\.\d+)?|\.\d+)/y],
  ['ref', /(?:([A-Za-z][A-Za-z0-9_]{0,15})!)?([A-J](?:40|[1-3][0-9]|[1-9]))(?![A-Za-z0-9_!(.])/y],
  ['name', /[A-Za-z][A-Za-z0-9.]*/y],
  ['op', /<>|<=|>=|[-+*/&(),:<>=]/y],
];

function tokenize(source) {
  const tokens = [];
  let offset = 0;
  while (offset < source.length) {
    let matched = false;
    for (const [kind, rule] of RULES) {
      rule.lastIndex = offset;
      const m = rule.exec(source);
      if (!m || m.index !== offset) continue;
      matched = true;
      offset = rule.lastIndex;
      if (kind === 'ws') break;
      if (kind === 'str') tokens.push({ t: 'str', v: m[1].replace(/""/g, '"') });
      else if (kind === 'num') tokens.push({ t: 'num', v: Number(m[0]) });
      else if (kind === 'ref') tokens.push({ t: 'ref', sheet: m[1] || '', cell: m[2].toUpperCase() });
      else if (kind === 'name') tokens.push({ t: 'name', v: m[0].toUpperCase() });
      else tokens.push({ t: 'op', v: m[0] });
      break;
    }
    if (!matched) throw new Error('#FORMULA!');
    if (tokens.length > MAX_TOKENS) throw new Error('#FORMULA!');
  }
  return tokens;
}

/* ---- parser: recursive descent to a small syntax tree ----------------------- */

function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const expectOp = (v) => { if (!isOp(v)) throw new Error('#FORMULA!'); p++; };

  function expression() {
    const left = concat();
    const t = peek();
    if (t && t.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.v)) {
      p++;
      return { t: 'bin', op: t.v, a: left, b: concat() };
    }
    return left;
  }
  function concat() {
    let n = additive();
    while (isOp('&')) { p++; n = { t: 'bin', op: '&', a: n, b: additive() }; }
    return n;
  }
  function additive() {
    let n = multiplicative();
    while (isOp('+') || isOp('-')) { const op = tokens[p++].v; n = { t: 'bin', op, a: n, b: multiplicative() }; }
    return n;
  }
  function multiplicative() {
    let n = unary();
    while (isOp('*') || isOp('/')) { const op = tokens[p++].v; n = { t: 'bin', op, a: n, b: unary() }; }
    return n;
  }
  function unary() {
    if (isOp('-')) { p++; return { t: 'neg', a: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    return primary();
  }
  function primary() {
    const t = peek();
    if (!t) throw new Error('#FORMULA!');
    if (t.t === 'num') { p++; return { t: 'lit', v: t.v }; }
    if (t.t === 'str') { p++; return { t: 'lit', v: t.v }; }
    if (t.t === 'op' && t.v === '(') { p++; const n = expression(); expectOp(')'); return n; }
    if (t.t === 'ref') {
      p++;
      if (isOp(':')) {
        p++;
        const end = peek();
        if (!end || end.t !== 'ref') throw new Error('#REF!');
        p++;
        return { t: 'range', sheet: t.sheet, from: t.cell, to: end.cell, toSheet: end.sheet };
      }
      return { t: 'ref', sheet: t.sheet, cell: t.cell };
    }
    if (t.t === 'name') {
      p++;
      if (isOp('(')) {
        if (!FUNCTIONS.has(t.v)) throw new Error('#FORMULA!');
        p++;
        const args = [];
        if (!isOp(')')) {
          do { args.push(expression()); if (!isOp(',')) break; p++; } while (args.length <= 20);
        }
        expectOp(')');
        return { t: 'call', name: t.v, args };
      }
      if (t.v === 'TRUE') return { t: 'lit', v: true };
      if (t.v === 'FALSE') return { t: 'lit', v: false };
      throw new Error('#FORMULA!');
    }
    throw new Error('#FORMULA!');
  }

  const tree = expression();
  if (p !== tokens.length) throw new Error('#FORMULA!');
  return tree;
}

/* ---- values ----------------------------------------------------------------- */

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;
const numericFromText = (text) => {
  const cleaned = String(text).trim().replace(/,/g, '');
  return NUMERIC_TEXT.test(cleaned) ? Number(cleaned) : null;
};

/* Stored cell text -> value. Blank -> null; numbers -> number; TRUE/FALSE -> boolean; else text. */
function toValue(text) {
  const s = String(text ?? '');
  if (s === '') return null;
  const n = numericFromText(s);
  if (n !== null) return n;
  if (s.toUpperCase() === 'TRUE') return true;
  if (s.toUpperCase() === 'FALSE') return false;
  return s;
}

function toNumber(v) {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = numericFromText(v);
  if (n === null) throw new Error('#VALUE!');
  return n;
}

function toText(v) {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return pretty(v);
  return v;
}

function truthy(v) {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  throw new Error('#VALUE!');
}

function equalValues(a, b) {
  if (a === null && b === null) return true;
  if (typeof a === 'string' || typeof b === 'string') {
    return toText(a).toUpperCase() === toText(b).toUpperCase();
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return toNumber(a) === toNumber(b) && typeof a === typeof b;
  return toNumber(a) === toNumber(b);
}

function compareValues(a, b) {
  if (typeof a === 'string' || typeof b === 'string') {
    const x = toText(a).toUpperCase(), y = toText(b).toUpperCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = toNumber(a), y = toNumber(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

// Full precision is kept so dependent cells compute exactly as before (1/3*3 = 1).
// Use ROUND() for money presentation.
const pretty = (number) => (Number.isFinite(number) ? String(number) : '#NUM!');

/* Criteria matcher for SUMIF / COUNTIF. Returns a predicate over a cell's displayed text. */
export function criteriaMatcher(criteria) {
  const text = String(criteria ?? '').trim();
  const op = /^(<>|<=|>=|<|>|=)?(.*)$/s.exec(text);
  const operator = op[1] || '=';
  const operand = op[2].trim();
  const numericOperand = operand !== '' && Number.isFinite(Number(operand.replace(/,/g, '')));
  return (value) => {
    const v = String(value ?? '').trim();
    if (numericOperand) {
      const n = Number(v.replace(/,/g, ''));
      const target = Number(operand.replace(/,/g, ''));
      const numeric = v !== '' && Number.isFinite(n);
      if (operator === '<>') return !numeric || n !== target;
      if (!numeric) return false;
      if (operator === '=') return n === target;
      if (operator === '<') return n < target;
      if (operator === '>') return n > target;
      if (operator === '<=') return n <= target;
      if (operator === '>=') return n >= target;
      return false;
    }
    const same = v.toUpperCase() === operand.toUpperCase();
    return operator === '<>' ? !same : same;
  };
}

/* ---- evaluation ---------------------------------------------------------------- */

/* Builds the environment for one top-level calculation: canonical raw cells + memo + cycle stack. */
function makeEnv(cells, cache, stack) {
  const raw = new Map();
  for (const [key, value] of Object.entries(cells || {})) {
    const { sheet, cell } = splitRef(key);
    if (!CELL_REF.test(cell.toUpperCase())) continue;
    raw.set(canonKey(sheet, cell), String(value ?? ''));
  }
  return { raw, cache, stack, depth: 0 };
}

function cellText(env, sheet, cell) {
  const key = canonKey(sheet, cell);
  if (!CELL_REF.test(cell)) throw new Error('#REF!');
  if (!env.raw.has(key)) return '';
  const text = env.raw.get(key);
  if (!String(text).trim().startsWith('=')) return text;
  return computeKey(env, key, sheet);
}

/* Returns the displayed text of a formula cell, memoised, with cycle detection. */
function computeKey(env, key, sheet) {
  if (env.cache.has(key)) return env.cache.get(key);
  if (env.stack.has(key)) return '#CYCLE!';
  if (env.stack.size >= MAX_DEPTH) return '#FORMULA!';
  const formula = env.raw.get(key);
  const nextStack = new Set(env.stack).add(key);
  const scoped = { ...env, stack: nextStack, depth: env.depth + 1 };
  let result;
  try {
    const tree = parse(tokenize(String(formula).trim().slice(1)));
    result = toText(evaluateNode(tree, scoped, sheet));
  } catch (error) {
    const msg = String(error?.message || '');
    result = msg.startsWith('#') ? msg : '#FORMULA!';
  }
  env.cache.set(key, result);
  return result;
}

/* A cell's value as the formula sees it. Error cells throw so the error propagates. */
function cellValue(env, sheet, cell) {
  const text = cellText(env, sheet, cell);
  if (String(text).startsWith('#')) throw new Error(String(text).split(/\s/)[0]);
  return toValue(text);
}

/* Range -> { rows, cols, cells: [{ value }|{ error }] } in row-major order. Errors are kept as
   markers so only the functions that must propagate them (SUM, lookups) throw. */
function rangeOf(node, env, sheet) {
  const targetSheet = node.sheet || sheet;
  const toSheet = node.toSheet || node.sheet || sheet;
  if (targetSheet.toLowerCase() !== toSheet.toLowerCase()) throw new Error('#REF!');
  const from = node.from, to = node.to;
  if (!CELL_REF.test(from) || !CELL_REF.test(to)) throw new Error('#REF!');
  const c1 = COLS.indexOf(from[0]), c2 = COLS.indexOf(to[0]);
  const r1 = Number(from.slice(1)), r2 = Number(to.slice(1));
  const rowMin = Math.min(r1, r2), rowMax = Math.max(r1, r2), colMin = Math.min(c1, c2), colMax = Math.max(c1, c2);
  const rows = rowMax - rowMin + 1, cols = colMax - colMin + 1;
  if (rows * cols > MAX_RANGE_CELLS) throw new Error('#REF!');
  const cells = [];
  for (let r = rowMin; r <= rowMax; r++) {
    for (let c = colMin; c <= colMax; c++) {
      const text = cellText(env, targetSheet, COLS[c] + r);
      if (String(text).startsWith('#')) cells.push({ error: String(text).split(/\s/)[0] });
      else cells.push({ value: toValue(text) });
    }
  }
  return { rows, cols, cells };
}

function at(range, row, col) {
  return range.cells[row * range.cols + col];
}

function unwrap(entry) {
  if (entry.error) throw new Error(entry.error);
  return entry.value;
}

function evaluateNode(node, env, sheet) {
  if (++env.depth > 2000) throw new Error('#FORMULA!');
  switch (node.t) {
    case 'lit': return node.v;
    case 'ref': return cellValue(env, node.sheet || sheet, node.cell);
    case 'range': throw new Error('#VALUE!'); // a bare range is only valid as a function argument
    case 'neg': return -toNumber(evaluateNode(node.a, env, sheet));
    case 'bin': {
      const a = evaluateNode(node.a, env, sheet);
      const b = evaluateNode(node.b, env, sheet);
      switch (node.op) {
        case '+': return toNumber(a) + toNumber(b);
        case '-': return toNumber(a) - toNumber(b);
        case '*': return toNumber(a) * toNumber(b);
        case '/': { const d = toNumber(b); if (d === 0) throw new Error('#DIV/0!'); return toNumber(a) / d; }
        case '&': return toText(a) + toText(b);
        case '=': return equalValues(a, b);
        case '<>': return !equalValues(a, b);
        case '<': return compareValues(a, b) < 0;
        case '>': return compareValues(a, b) > 0;
        case '<=': return compareValues(a, b) <= 0;
        case '>=': return compareValues(a, b) >= 0;
        default: throw new Error('#FORMULA!');
      }
    }
    case 'call': return callFunction(node, env, sheet);
    default: throw new Error('#FORMULA!');
  }
}

function rangeArg(node, env, sheet, name) {
  if (node.t !== 'range') throw new Error('#VALUE!');
  if (!node.sheet && node.toSheet === undefined && !sheet) throw new Error('#REF!');
  return rangeOf(node, env, sheet);
}

function callFunction(node, env, sheet) {
  const { name, args } = node;
  const need = (n) => { if (args.length < n) throw new Error('#VALUE!'); };
  switch (name) {
    case 'IF': {
      need(2);
      const cond = truthy(evaluateNode(args[0], env, sheet));
      if (cond) return evaluateNode(args[1], env, sheet);
      return args.length > 2 ? evaluateNode(args[2], env, sheet) : false;
    }
    case 'IFERROR': {
      need(2);
      try {
        return evaluateNode(args[0], env, sheet);
      } catch (error) {
        if (String(error?.message || '').startsWith('#')) return evaluateNode(args[1], env, sheet);
        throw error;
      }
    }
    case 'SUM':
    case 'MIN':
    case 'MAX': {
      const values = [];
      for (const arg of args) {
        if (arg.t === 'range') {
          for (const entry of rangeArg(arg, env, sheet).cells) {
            const v = unwrap(entry);
            if (typeof v === 'number') values.push(v); // text, blanks and booleans in ranges are ignored
          }
        } else values.push(toNumber(evaluateNode(arg, env, sheet)));
      }
      if (name === 'SUM') return values.reduce((s, n) => s + n, 0);
      if (!values.length) return 0;
      return name === 'MIN' ? Math.min(...values) : Math.max(...values);
    }
    case 'ABS': need(1); return Math.abs(toNumber(evaluateNode(args[0], env, sheet)));
    case 'ROUND': {
      need(1);
      const x = toNumber(evaluateNode(args[0], env, sheet));
      const digits = Math.min(10, Math.max(0, Math.trunc(args[1] ? toNumber(evaluateNode(args[1], env, sheet)) : 0)));
      const f = 10 ** digits;
      return Math.round(x * f) / f;
    }
    case 'SUMIF':
    case 'COUNTIF': {
      need(2);
      if (args[0].t !== 'range') throw new Error('#REF!');
      const criteriaRange = rangeArg(args[0], env, sheet);
      const criteria = toText(evaluateNode(args[1], env, sheet));
      const sumRange = name === 'SUMIF' && args[2] ? rangeArg(args[2], env, sheet) : criteriaRange;
      if (sumRange.cells.length !== criteriaRange.cells.length) throw new Error('#VALUE!');
      const matches = criteriaMatcher(criteria);
      let total = 0, count = 0;
      criteriaRange.cells.forEach((entry, i) => {
        const v = unwrap(entry);
        if (!matches(toText(v))) return;
        count += 1;
        if (name === 'SUMIF') {
          const s = unwrap(sumRange.cells[i]);
          if (typeof s === 'number') total += s;
        }
      });
      return name === 'COUNTIF' ? count : total;
    }
    case 'VLOOKUP': {
      need(3);
      const key = evaluateNode(args[0], env, sheet);
      if (args[1].t !== 'range') throw new Error('#REF!');
      const table = rangeArg(args[1], env, sheet);
      const col = Math.trunc(toNumber(evaluateNode(args[2], env, sheet)));
      if (col < 1 || col > table.cols) throw new Error('#REF!');
      const approx = args[3] ? truthy(evaluateNode(args[3], env, sheet)) : true;
      const row = findRow(table, key, approx);
      if (row < 0) throw new Error('#N/A');
      return unwrap(at(table, row, col - 1));
    }
    case 'INDEX': {
      need(2);
      if (args[0].t !== 'range') throw new Error('#REF!');
      const range = rangeArg(args[0], env, sheet);
      const a = Math.trunc(toNumber(evaluateNode(args[1], env, sheet)));
      const b = args[2] ? Math.trunc(toNumber(evaluateNode(args[2], env, sheet))) : null;
      let r = a, c = b;
      if (b === null) { // one index: positional down a single column or across a single row
        if (range.cols === 1) { c = 1; } else if (range.rows === 1) { r = 1; c = a; } else throw new Error('#REF!');
      }
      if (r < 1 || c < 1 || r > range.rows || c > range.cols) throw new Error('#REF!');
      return unwrap(at(range, r - 1, c - 1));
    }
    case 'MATCH': {
      need(2);
      const key = evaluateNode(args[0], env, sheet);
      if (args[1].t !== 'range') throw new Error('#REF!');
      const range = rangeArg(args[1], env, sheet);
      if (range.rows !== 1 && range.cols !== 1) throw new Error('#REF!');
      const type = args[2] ? Math.trunc(toNumber(evaluateNode(args[2], env, sheet))) : 1;
      if (type !== 0 && type !== 1) throw new Error('#VALUE!');
      const list = range.cells.map(unwrap);
      if (type === 0) {
        const i = list.findIndex((v) => equalValues(v, key));
        if (i < 0) throw new Error('#N/A');
        return i + 1;
      }
      let last = -1;
      list.forEach((v, i) => { if (v !== null && typeof v === typeof key && compareValues(v, key) <= 0) last = i; });
      if (last < 0) throw new Error('#N/A');
      return last + 1;
    }
    default:
      throw new Error('#FORMULA!');
  }
}

/* Row index in the table whose first column matches key (exact), or the last row whose first
   column is <= key (approximate, ascending). Returns -1 when nothing matches. */
function findRow(table, key, approx) {
  if (!approx) {
    for (let r = 0; r < table.rows; r++) {
      const v = unwrap(at(table, r, 0));
      if (v !== null && equalValues(v, key)) return r;
    }
    return -1;
  }
  let found = -1;
  for (let r = 0; r < table.rows; r++) {
    const v = unwrap(at(table, r, 0));
    if (v !== null && typeof v === typeof key && compareValues(v, key) <= 0) found = r;
  }
  return found;
}

/* Public: calculated text of a cell. `ref` may be 'B3' (default sheet) or 'Sheet!B3'. */
export function calculateCell(cells, ref, stack = new Set(), cache = new Map()) {
  const { sheet, cell } = splitRef(ref);
  if (!CELL_REF.test(String(cell).toUpperCase())) return '#REF!';
  const env = makeEnv(cells, cache, stack);
  const key = canonKey(sheet, String(cell).toUpperCase());
  if (stack.has(key)) return '#CYCLE!';
  if (!env.raw.has(key)) return '';
  const raw = env.raw.get(key);
  if (!String(raw).trim().startsWith('=')) return String(raw);
  return computeKey(env, key, sheet);
}
