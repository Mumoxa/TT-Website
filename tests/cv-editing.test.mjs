/* Typing into a list field.

   The bug these guard against made the Profile section unusable: every
   keystroke tidied the text on its way to the record and the tidied version
   was fed straight back to the textarea, so a space at the end of a word
   disappeared as you typed it and Enter could never start a second bullet.
   "Financial Manager with eight years" arrived as one run-together line. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { tidy, visibleText } from '../src/cv-builda/cv/list-text.js';

test('the stored form is one trimmed bullet per line', () => {
  assert.equal(tidy('  first  \n\n  second \n'), 'first\nsecond');
  assert.equal(tidy(''), '');
});

test('a space being typed at the end of a word survives', () => {
  /* The moment after pressing space in "Financial ". */
  assert.equal(visibleText('Financial ', 'Financial'), 'Financial ');
});

test('the blank line that starts the next bullet survives', () => {
  /* The moment after pressing Enter. Dropping it made a second bullet
     impossible to begin, which is what capped the section at one. */
  assert.equal(visibleText('First bullet.\n', 'First bullet.'), 'First bullet.\n');
  assert.equal(visibleText('First.\n\n', 'First.'), 'First.\n\n');
});

test('a whole paragraph types through unchanged', () => {
  const target = 'Financial Manager with eight years in retail banking.';
  let draft = '';
  for (const character of target) {
    draft += character;
    draft = visibleText(draft, tidy(draft));
  }
  assert.equal(draft, target);
});

test('four bullets stay four bullets', () => {
  const draft = 'One line here.\nTwo line here.\nThree line here.\nFour line here.';
  assert.equal(visibleText(draft, tidy(draft)), draft);
  assert.equal(tidy(draft).split('\n').length, 4);
});

test('a change from elsewhere replaces what the field holds', () => {
  /* Loading a candidate, or removing a card, must win over a stale draft. */
  assert.equal(visibleText('what I was typing', 'a loaded candidate'), 'a loaded candidate');
  assert.equal(visibleText('First.\nSecond.', 'First.'), 'First.');
});
