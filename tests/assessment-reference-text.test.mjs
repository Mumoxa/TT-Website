import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { splitReferences } from '../src/assessments/reference-text.js';

const refs = (text) => splitReferences(text).filter((part) => part.isRef).map((part) => part.text);

test('a reference code is one part and the text is unchanged', () => {
  const text = 'What is the correct action for INV-2214 (invoice on the supplier statement but missing from the ledger)?';
  assert.deepEqual(refs(text), ['INV-2214']);
  assert.equal(splitReferences(text).map((part) => part.text).join(''), text);
});

test('several reference codes in one sentence are each kept whole', () => {
  assert.deepEqual(refs('Compare JE-88417 with CN-0091 and PMT-5530.'), ['JE-88417', 'CN-0091', 'PMT-5530']);
});

test('text without reference codes is a single plain part', () => {
  assert.deepEqual(
    splitReferences('Enter the VAT amount at 15%, rounded to two decimal places.'),
    [{ text: 'Enter the VAT amount at 15%, rounded to two decimal places.', isRef: false }],
  );
});

test('empty and missing text give no parts', () => {
  assert.deepEqual(splitReferences(''), []);
  assert.deepEqual(splitReferences(undefined), []);
});
