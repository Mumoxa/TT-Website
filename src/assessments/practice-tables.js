// Public practice tables, one per assessment family. Practice content is deliberately about an
// unrelated subject so trying the formats cannot hint at an answer. Each table is checked against
// the published assessment it belongs to (functions/lib/practice-isolation.js).
import { PRACTICE_ITEMS, PRACTICE_SOURCE } from './practice.js';
import { AR_PRACTICE_ITEMS, AR_PRACTICE_SOURCE } from './practice-ar.js';

export const AP_PRACTICE = Object.freeze({
  items: PRACTICE_ITEMS, source: PRACTICE_SOURCE,
  docTitle: 'Museum token desk', docHeaders: ['Batch', 'Tokens issued'],
});
export const AR_PRACTICE = Object.freeze({
  items: AR_PRACTICE_ITEMS, source: AR_PRACTICE_SOURCE,
  docTitle: 'Nursery seedling counter', docHeaders: ['Session', 'Seedlings sold'],
});

// Every table, for checks that must cover all of them.
export const PRACTICE_TABLES = Object.freeze([AP_PRACTICE, AR_PRACTICE]);

// Slug-driven, never title-driven: an assessment slug states its family.
// Accounts Payable slugs (including every existing published slug) and older invitation flows
// fall back to the payable table, so that assessment keeps exactly the practice it has today.
export function practiceForSlug(slug) {
  return typeof slug === 'string' && /^ar-/.test(slug) ? AR_PRACTICE : AP_PRACTICE;
}
