/** Pure bounded Excel-style arithmetic and cell-reference engine. No eval(). */
export const COLS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const ROWS = 20;
export const CELL_REF = /^[A-F](?:[1-9]|1[0-9]|20)$/;
const pretty = (number) => Number.isFinite(number) ? String(number) : '#NUM!';

function tokenize(expression) {
  const tokens = [];
  const source = expression.replace(/\s+/g, '');
  const scanner = /(?:\d+(?:\.\d+)?|\.\d+)|[A-F](?:20|1[0-9]|[1-9])|[a-z]+|[()+\-*/,:]/giy;
  let offset = 0, match;
  while (offset < source.length) {
    scanner.lastIndex = offset;
    match = scanner.exec(source);
    if (!match || match.index !== offset) throw new Error('#FORMULA!');
    tokens.push(match[0].toUpperCase());
    offset = scanner.lastIndex;
    if (tokens.length > 250) throw new Error('#FORMULA!');
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

function rangeValues(from, to, resolve) {
  if (!CELL_REF.test(from) || !CELL_REF.test(to)) throw new Error('#REF!');
  const c1 = COLS.indexOf(from[0]), c2 = COLS.indexOf(to[0]);
  const r1 = Number(from.slice(1)), r2 = Number(to.slice(1));
  const values = [];
  for (let row = Math.min(r1, r2); row <= Math.max(r1, r2); row++) {
    for (let col = Math.min(c1, c2); col <= Math.max(c1, c2); col++) {
      const value = resolve(COLS[col] + row);
      // SUM/MIN/MAX ranges ignore text headings, like spreadsheet ranges.
      const text=String(value ?? '').trim();
      if (!text || Number.isFinite(Number(text.replace(/,/g,'')))) values.push(cellNumber(value));
    }
  }
  return values;
}

function evaluate(formula, resolve) {
  const tokens = tokenize(formula.startsWith('=') ? formula.slice(1) : formula);
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const expect = (item) => { if (next() !== item) throw new Error('#FORMULA!'); };
  function expression() {
    let n = term();
    while (peek() === '+' || peek() === '-') {
      n += next() === '+' ? term() : -term();
    }
    return n;
  }
  function term() {
    let n = factor();
    while (peek() === '*' || peek() === '/') {
      const op = next(), d = factor();
      if (op === '/' && d === 0) throw new Error('#DIV/0!');
      n = op === '*' ? n * d : n / d;
    }
    return n;
  }
  function factor() {
    const t = next();
    if (!t) throw new Error('#FORMULA!');
    if (t === '-') return -factor();
    if (t === '+') return factor();
    if (t === '(') { const n = expression(); expect(')'); return n; }
    if (/^[\d.]/.test(t)) return Number(t);
    if (CELL_REF.test(t)) return cellNumber(resolve(t));
    if (['SUM', 'ABS', 'MIN', 'MAX'].includes(t)) {
      expect('(');
      const args = [];
      if (peek() !== ')') {
        do {
          // A1:B3 is allowed as an argument only, never as a scalar value.
          if (CELL_REF.test(peek()) && tokens[p + 1] === ':') {
            const start = next(); next();
            const end = next();
            args.push(...rangeValues(start, end, resolve));
          } else args.push(expression());
          if (peek() !== ',') break;
          next();
        } while (args.length <= 120);
      }
      expect(')');
      if (t === 'ABS') return Math.abs(args[0] || 0);
      if (t === 'MIN') return args.length ? Math.min(...args) : 0;
      if (t === 'MAX') return args.length ? Math.max(...args) : 0;
      return args.reduce((sum, n) => sum + n, 0);
    }
    throw new Error('#FORMULA!');
  }
  const result = expression();
  if (p !== tokens.length) throw new Error('#FORMULA!');
  return pretty(result);
}

export function calculateCell(cells, ref, stack = new Set(), cache = new Map()) {
  if(cache.has(ref))return cache.get(ref);
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
    cache.set(ref,calculated);
    return calculated;
  } catch (error) {
    const msg = String(error?.message || '');
    return msg.startsWith('#') ? msg : '#FORMULA!';
  }
}

