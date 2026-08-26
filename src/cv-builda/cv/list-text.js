/* ============================================================================
   TALENT TREE — WHAT A LIST FIELD SHOWS WHILE IT IS BEING EDITED
   ----------------------------------------------------------------------------
   The bullets in a record are trimmed, with blank lines dropped. That is right
   for what gets stored and wrong for what someone is typing into: applied to
   the textarea on every keystroke it eats the space at the end of a word and
   swallows the blank line that begins the next bullet, so a section can only
   ever hold one run-together bullet.

   These two functions are the whole of that distinction, kept out of the
   component so the rule can be tested rather than clicked.
   ========================================================================== */

/** The stored form: one bullet per line, trimmed, no blanks. */
const tidy = (text) => String(text ?? '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .join('\n');

/**
 * What the textarea should display.
 *
 * The draft wins whenever it is merely an untidy version of what is stored —
 * a trailing space, a blank line waiting for the next bullet. It loses only
 * when the record has changed from somewhere else: a candidate loaded, a card
 * removed. That is the difference between "you are mid-word" and "this field
 * is now showing something else".
 *
 * @param {string} draft   what the field currently holds
 * @param {string} stored  the record's bullets, newline-joined
 * @returns {string}
 */
const visibleText = (draft, stored) => (tidy(draft) === stored ? draft : stored);

export { tidy, visibleText };
