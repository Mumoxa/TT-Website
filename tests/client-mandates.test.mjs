import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/* The client book is data-driven, so the regression checks read the arrays in
   src/main.jsx rather than a browser: they lock the uniform card shape, the
   anonymisation rule and the shared CSS language between the two tiers. */
function entriesOf(name) {
  const block = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
  assert.ok(block, `src/main.jsx declares const ${name} = [...]`);
  return [...block[1].matchAll(/\n {2}\{([\s\S]*?)\n {2}\},(?=\n {2}\{|\n\]|$)/g)].map((match) => match[1]);
}

function field(entry, key) {
  const match = entry.match(new RegExp(`\\n\\s*${key}: '((?:[^'\\\\]|\\\\.)*)'`));
  return match ? match[1] : null;
}

function focusOf(entry) {
  const match = entry.match(/\n\s*focus: \[([^\]]*)\]/);
  if (!match) return null;
  return [...match[1].matchAll(/'([^']*)'/g)].map((item) => item[1]);
}

const MANDATE_FIELDS = ['number', 'tag', 'client', 'meta', 'lead', 'note'];
const APPROVED_TAGS = ['Specialist talent partner', 'Trusted talent partner', 'Trusted partner · Executive search'];
const flagships = entriesOf('flagships');
const mandates = entriesOf('mandateBook');

test('the client section renders flagship cards and a wider mandate book', () => {
  assert.ok(flagships.length === 3, 'three flagship mandates are declared');
  assert.equal(mandates.length, 10, 'ten wider-book mandates are declared');
  assert.match(source, /className="mandate-grid"/);
  assert.match(source, /\{mandateBook\.map\(/);
  assert.match(source, /className="mandate-book-head"/);
});

test('every mandate card carries the same uniform fields', () => {
  mandates.forEach((entry, index) => {
    MANDATE_FIELDS.forEach((key) => {
      const value = field(entry, key);
      assert.ok(value && value.trim() === value && value.length > 0, `mandate ${index + 1} has a trimmed "${key}"`);
      assert.ok(!value.endsWith(' '), `mandate ${index + 1} "${key}" has no trailing space`);
    });
    const focus = focusOf(entry);
    assert.ok(Array.isArray(focus) && focus.length > 0, `mandate ${index + 1} lists at least one focus area`);
    focus.forEach((area) => {
      assert.ok(area.trim() === area && area.length > 1, `mandate ${index + 1} focus chip "${area}" is clean`);
    });
  });
});

test('mandate copy follows one voice: no double spaces, no Oxford comma, no straight quotes', () => {
  mandates.forEach((entry, index) => {
    [...MANDATE_FIELDS.map((key) => field(entry, key)), ...(focusOf(entry) || [])].filter(Boolean).forEach((text) => {
      assert.doesNotMatch(text, / {2,}/, `mandate ${index + 1} "${text.slice(0, 32)}…" has single spacing`);
      assert.doesNotMatch(text, /,\s+and\s/, `mandate ${index + 1} follows site style with no Oxford comma`);
      assert.doesNotMatch(text, /"/, `mandate ${index + 1} avoids straight double quotes`);
    });
  });
});

test('mandate numbers continue the flagship ledger without gaps', () => {
  const flagshipNumbers = flagships.map((entry) => Number(field(entry, 'number')));
  const mandateNumbers = mandates.map((entry) => Number(field(entry, 'number')));
  const sequence = [...flagshipNumbers, ...mandateNumbers];
  assert.deepEqual(sequence, sequence.map((_, i) => i + 1), 'client ledger runs 01 → 13 in order');
});

test('openings are varied so no two mandates read the same', () => {
  const openers = mandates.map((entry) => field(entry, 'lead').split(' ')[0]);
  assert.equal(new Set(openers).size, openers.length, `opening words are unique: ${openers.join(', ')}`);
  assert.ok(!openers.every((word) => word === 'Serving'), 'mandates do not all open the same way');
});

test('relationship tags stay inside the approved vocabulary', () => {
  mandates.forEach((entry, index) => {
    assert.ok(APPROVED_TAGS.includes(field(entry, 'tag')), `mandate ${index + 1} tag is approved`);
  });
});

test('client identities stay anonymised in the public client book', () => {
  const book = source.slice(source.indexOf('const mandateBook'), source.indexOf('const stats'));
  [
    'Old Mutual', 'Bonitas', 'PaxLife', 'Discovery', 'Capitec', 'Shoprite', 'Massmart', 'Checkers',
    'Teampower', 'CloudWare', 'GeoTerra', 'Vodacom', 'MTN', 'Standard Bank', 'Absa', 'Tiger Brands',
    'PPC', 'AfriSam', 'Afrisam',
  ].forEach((name) => {
    assert.ok(!book.includes(name), `"${name}" is not named on the public site`);
  });
});

test('the mandate book reuses the flagship card language and the token palette', () => {
  assert.match(styles, /\.flagship, \.mandate \{/);
  assert.match(styles, /\.flagship-tag, \.mandate-tag \{/);
  assert.match(styles, /\.flagship-note, \.mandate-note \{/);
  const block = styles.slice(styles.indexOf('/* — The wider book'), styles.indexOf('.clients-tail {'));
  assert.ok(block.length > 200, 'the wider-book styles exist');
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'no raw colour values — tokens only');
});
