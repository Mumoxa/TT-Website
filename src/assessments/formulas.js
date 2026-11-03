/** Pure bounded Excel-style evaluator and cell-reference engine. No eval(). Shared by the
 *  browser and the server so grading uses exactly the values the candidate sees.
 *  Supported: numbers, cell refs (A1..J40), + - * / parentheses, unary minus,
 *  SUM, MIN, MAX, ABS, ROUND, SUMIF, COUNTIF, and ranges (A1:B3) as function arguments.
 *  Criteria strings: "text" (equals, case-insensitive), ">n", "<n", ">=n", "<=n", "=n", "<>text". */
export const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
export const ROWS = 40;
export const CELL_REF = /^[A-J](?:[1-9]|[1-3][0-9]|40)$/;
const MAX_TOKENS = 400;
const MAX_RANGE_CELLS = 400;
const FUNCTIONS = new Set(['SUM', 'ABS', 'MIN', 'MAX', 'ROUND', 'SUMIF', 'COUNTIF']);

// Full precision is kept so dependent cells compute exactly as before (1/3*3 = 1).
// Use ROUND() for money presentation.
const pretty = (number) => (Number.isFinite(number) ? String(number) : '#NUM!');

function tokenize(source) {
  const tokens = [];
  const scanner = /\s*(?:"[^"]*"|\d+(?:\.\d+)?|\.\d+|[A-J](?:40|[1-3][0-9]|[1-9])(?![A-Za-z0-9])|[A-Za-z]+|<>|<=|>=|[()+\-*/,:<>=])/y;
  let offset = 0;
  while (offset < source.length) {
    if (/^\s*$/.test(source.slice(offset))) break;
    scanner.lastIndex = offset;
    const match = scanner.exec(source);
    if (!match) throw new Error('#FORMULA!');
    const raw = match[0].trimStart();
    tokens.push(raw.startsWith('"') ? { type: 'str', value: raw.slice(1, -1) } : { type: 'op', value: raw.toUpperCase() });
    offset = scanner.lastIndex;
    if (tokens.length > MAX_TOKENS) throw new Error('#FORMULA!');
  }
  return tokens;
}

function cellNumber(value) {
  const v = String(value ?? '').trim();
  if (!v) return 0;
  const n = Number(v.replace(/,/g, ''));
  if (!Number.isFinite(n)) throw new Error('#VALUE!');
  return n;
}

/* Row-major list of refs in a rectangular range. Both ends must be valid cell refs. */
function rangeRefs(from, to) {
  if (!CELL_REF.test(from) || !CELL_REF.test(to)) throw new Error('#REF!');
  const c1 = COLS.indexOf(from[0]), c2 = COLS.indexOf(to[0]);
  const r1 = Number(from.slice(1)), r2 = Number(to.slice(1));
  const refs = [];
  for (let row = Math.min(r1, r2); row <= Math.max(r1, r2); row++) {
    for (let col = Math.min(c1, c2); col <= Math.max(c1, c2); col++) refs.push(COLS[col] + row);
  }
  if (refs.length > MAX_RANGE_CELLS) throw new Error('#REF!');
  return refs;
}

/* Criteria matcher for SUMIF / COUNTIF. Returns a predicate over a cell's calculated text. */
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

function evaluate(formula, resolve) {
  const tokens = tokenize(formula.startsWith('=') ? formula.slice(1) : formula);
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const isOp = (t, value) => t && t.type === 'op' && t.value === value;
  const expect = (value) => { if (!isOp(next(), value)) throw new Error('#FORMULA!'); };
  const isCell = (t) => t && t.type === 'op' && CELL_REF.test(t.value);
  const isRangeAhead = () => isCell(peek()) && isOp(tokens[p + 1], ':');

  function readRange() {
    const start = next(); next(); const end = next();
    if (!isCell(start) || !end || end.type !== 'op' || !CELL_REF.test(end.value)) throw new Error('#REF!');
    return rangeRefs(start.value, end.value);
  }

  function expression() {
    let n = term();
    while (isOp(peek(), '+') || isOp(peek(), '-')) n = next().value === '+' ? n + term() : n - term();
    return n;
  }
  function term() {
    let n = factor();
    while (isOp(peek(), '*') || isOp(peek(), '/')) {
      const op = next().value, d = factor();
      if (op === '/' && d === 0) throw new Error('#DIV/0!');
      n = op === '*' ? n * d : n / d;
    }
    return n;
  }
  function factor() {
    const t = next();
    if (!t) throw new Error('#FORMULA!');
    if (t.type === 'str') throw new Error('#VALUE!');
    if (t.value === '-') return -factor();
    if (t.value === '+') return factor();
    if (t.value === '(') { const n = expression(); expect(')'); return n; }
    if (/^[\d.]/.test(t.value)) return Number(t.value);
    if (CELL_REF.test(t.value)) return cellNumber(resolve(t.value));
    if (!FUNCTIONS.has(t.value)) throw new Error('#FORMULA!');
    return callFunction(t.value);
  }
  function callFunction(name) {
    expect('(');
    if (name === 'SUMIF' || name === 'COUNTIF') {
      if (!isRangeAhead()) throw new Error('#REF!');
      const criteriaRange = readRange();
      expect(',');
      const criteria = next();
      if (!criteria || criteria.type !== 'str') throw new Error('#FORMULA!');
      let sumRange = criteriaRange;
      if (name === 'SUMIF' && isOp(peek(), ',')) {
        next();
        if (!isRangeAhead()) throw new Error('#REF!');
        sumRange = readRange();
      }
      expect(')');
      if (sumRange.length !== criteriaRange.length) throw new Error('#VALUE!');
      const matches = criteriaMatcher(criteria.value);
      let total = 0, count = 0;
      criteriaRange.forEach((ref, i) => {
        const value = resolve(ref);
        if (!matches(value)) return;
        count += 1;
        if (name === 'SUMIF') {
          // Like Excel, text and blank cells in the sum range contribute nothing.
          const text = String(resolve(sumRange[i]) ?? '').trim();
          if (text !== '' && Number.isFinite(Number(text.replace(/,/g, '')))) total += Number(text.replace(/,/g, ''));
        }
      });
      return name === 'COUNTIF' ? count : total;
    }
    const args = [];
    if (!isOp(peek(), ')')) {
      do {
        if (isRangeAhead()) {
          // Ranges ignore text and blank cells, as spreadsheet ranges do (headings are common).
          for (const ref of readRange()) {
            const text = String(resolve(ref) ?? '').trim();
            if (text !== '' && Number.isFinite(Number(text.replace(/,/g, '')))) args.push(Number(text.replace(/,/g, '')));
          }
        }
        else args.push(expression());
        if (!isOp(peek(), ',')) break;
        next();
      } while (args.length <= 120);
    }
    expect(')');
    if (name === 'ABS') return Math.abs(args[0] || 0);
    if (name === 'ROUND') {
      const digits = Math.min(10, Math.max(0, Math.trunc(args[1] ?? 0)));
      const factorPow = 10 ** digits;
      return Math.round((args[0] || 0) * factorPow) / factorPow;
    }
    if (name === 'MIN') return args.length ? Math.min(...args) : 0;
    if (name === 'MAX') return args.length ? Math.max(...args) : 0;
    return args.reduce((sum, n) => sum + n, 0);
  }

  const result = expression();
  if (p !== tokens.length) throw new Error('#FORMULA!');
  return pretty(result);
}

export function calculateCell(cells, ref, stack = new Set(), cache = new Map()) {
  if (cache.has(ref)) return cache.get(ref);
  if (!CELL_REF.test(ref)) return '#REF!';
  if (stack.has(ref)) return '#CYCLE!';
  const raw = cells[ref] ?? '';
  if (!String(raw).trim().startsWith('=')) return String(raw);
  const nextStack = new Set(stack);
  nextStack.add(ref);
  try {
    const calculated = evaluate(String(raw), (referenced) => {
      const result = calculateCell(cells, referenced, nextStack, cache);
      if (result.startsWith('#')) throw new Error(result);
      return result;
    });
    cache.set(ref, calculated);
    return calculated;
  } catch (error) {
    const msg = String(error?.message || '');
    const result = msg.startsWith('#') ? msg : '#FORMULA!';
    cache.set(ref, result);
    return result;
  }
}
