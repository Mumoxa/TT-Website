/**
 * Specs Generator - Industry Descriptor & Editable Preview Regression Suite
 *
 * Guards:
 *  - the "Construction" industry descriptor exists in the UI dropdown list
 *  - every listed descriptor template stays generic (no client-identifying text)
 *  - the download pipeline handles the editable preview correctly:
 *      a) auto-generated preview text (with "About Our Client" + descriptor
 *         already prepended) does NOT duplicate the About section when the
 *         customization settings are still passed through
 *      b) manually-edited preview text is used verbatim when the settings
 *         are passed as null (edits must never be overwritten by templates)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_DESCRIPTORS, DESCRIPTOR_TEMPLATES, COMPANY_MAP } from '../src/specs/lib/companyMap.js';
import { generatePlainText } from '../src/specs/lib/docGenerator.js';

// ── Descriptor list ──────────────────────────────────────────────────────────

test('"Construction" is available in the Industry Descriptor list', () => {
  assert.ok(ALL_DESCRIPTORS.includes('Construction'), 'Construction missing from ALL_DESCRIPTORS');
});

test('descriptors are unique', () => {
  assert.equal(new Set(ALL_DESCRIPTORS).size, ALL_DESCRIPTORS.length);
});

test('"Construction" has a candidate-facing description template', () => {
  const tpl = DESCRIPTOR_TEMPLATES['Construction'];
  assert.ok(tpl, 'Construction template missing');
  assert.ok(tpl.startsWith('Our client is a'), `unexpected template: ${tpl}`);
});

test('descriptor templates stay generic (no real client names leak)', () => {
  for (const [descriptor, template] of Object.entries(DESCRIPTOR_TEMPLATES)) {
    // Skip generic phrases that legitimately appear in the map itself
    // (e.g. "International automotive manufacturer" maps to itself).
    for (const [company] of COMPANY_MAP) {
      if (descriptor.includes(company)) continue;
      // Word-boundary match; very short keys (e.g. "EY", "Pep") only guard
      // as standalone words to avoid false hits inside ordinary words.
      const re = new RegExp(`\\b${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      assert.ok(
        !re.test(template),
        `template for "${descriptor}" leaks company name "${company}"`
      );
    }
    assert.ok(!/talenttree/i.test(template), `template for "${descriptor}" mentions TalentTree`);
  }
});

// ── Download path for the editable preview ───────────────────────────────────

const SANITIZED = [
  'FINANCIAL ACCOUNTANT',
  'H&I HEAD OFFICE',
  '',
  'ABOUT THE POSITION:',
  'We are currently seeking a highly organized and proactive Financial Accountant.',
].join('\n');

const DESCRIPTION = 'Our client is a well-established construction company delivering building and infrastructure projects.';

// Simulates the auto-generated preview: description + descriptor prepended.
const AUTO_PREVIEW = `About Our Client\n${DESCRIPTION}\n\nConstruction\n\n${SANITIZED}`;

test('auto-generated preview text does not duplicate the About section on download', () => {
  const out = generatePlainText(AUTO_PREVIEW, {
    jobTitle: 'Financial Accountant',
    customDescriptor: 'Construction',
    customCompanyDescription: DESCRIPTION,
  });
  const headings = out.split('\n').filter(l => l.trim() === 'ABOUT OUR CLIENT');
  assert.equal(headings.length, 1, `expected one About heading, got ${headings.length}\n${out}`);
  assert.ok(out.includes(DESCRIPTION), 'description content missing from output');
});

test('manually-edited preview text is used verbatim (settings passed as null)', () => {
  const edited = AUTO_PREVIEW.replace(
    DESCRIPTION,
    'Our client is a respected construction and civil engineering group (edited by reviewer).'
  );
  const out = generatePlainText(edited, {
    jobTitle: 'Financial Accountant',
    customDescriptor: null,
    customCompanyDescription: null,
  });
  assert.ok(
    out.includes('(edited by reviewer)'),
    `manual edit lost in download:\n${out}`
  );
  assert.ok(
    !out.includes(DESCRIPTION),
    'pristine template text overrode the manual edit'
  );
});
