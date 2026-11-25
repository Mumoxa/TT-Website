// Public practice tables, one per assessment family. Practice content is deliberately about an
// unrelated subject so trying the formats cannot hint at an answer. Each table is checked against
// the published assessment it belongs to (functions/lib/practice-isolation.js).
import { PRACTICE_ITEMS, PRACTICE_SOURCE } from './practice.js';
import { AR_PRACTICE_ITEMS, AR_PRACTICE_SOURCE } from './practice-ar.js';
import { HR_PRACTICE_ITEMS, HR_PRACTICE_SOURCE } from './practice-hr.js';

export const AP_PRACTICE = Object.freeze({
  items: PRACTICE_ITEMS, source: PRACTICE_SOURCE,
  docTitle: 'Museum token desk', docHeaders: ['Batch', 'Tokens issued'],
});
export const AR_PRACTICE = Object.freeze({
  items: AR_PRACTICE_ITEMS, source: AR_PRACTICE_SOURCE,
  docTitle: 'Nursery seedling counter', docHeaders: ['Session', 'Seedlings sold'],
});

export const HR_PRACTICE = Object.freeze({
  items: HR_PRACTICE_ITEMS, source: HR_PRACTICE_SOURCE,
  docTitle: 'Community library loans', docHeaders: ['Branch', 'Books lent'],
});

// Every table, for checks that must cover all of them.
export const PRACTICE_TABLES = Object.freeze([AP_PRACTICE, AR_PRACTICE, HR_PRACTICE]);

// Slug-driven, never title-driven: an assessment slug states its family.
// Accounts Payable slugs (including every existing published slug) and older invitation flows
// fall back to the payable table, so that assessment keeps exactly the practice it has today.
export function practiceForSlug(slug) {
  if (typeof slug === 'string' && /^ar-/.test(slug)) return AR_PRACTICE;
  if (typeof slug === 'string' && /^hr-/.test(slug)) return HR_PRACTICE;
  return AP_PRACTICE;
}
