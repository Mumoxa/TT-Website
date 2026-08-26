/**
 * Specs Generator - Text Reviewer Regression Suite
 *
 * Guards the "professional spacing" fixes (user-reported 2026-08): broken
 * words from PDF glyph-run splits, stray spaces around hyphens, spaces
 * before punctuation, inconsistent bullets, random blank lines, duplicate
 * apply lines, and the legacy applications@ address.
 *
 * Also guards the sanitize pipeline integration (review step + existing
 * branding removal) end-to-end.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewText } from '../src/specs/lib/textReviewer.js';
import { sanitizeDocument } from '../src/specs/lib/sanitize.js';

// ── Broken words (PDF glyph-run splits) ─────────────────────────────────────

test('"term s" -> "terms"', () => {
  assert.equal(reviewText('We offer standard term s'), 'We offer standard terms');
});

test('"i nsurance" -> "insurance"', () => {
  assert.equal(reviewText('Includes medical i nsurance'), 'Includes medical insurance');
});

test('"Th e" -> "The"', () => {
  assert.equal(reviewText('Th e role is based in Joburg'), 'The role is based in Joburg');
});

test('"interes t" -> "interest"', () => {
  assert.equal(reviewText('A strong interes t in numbers'), 'A strong interest in numbers');
});

test('"Reta il" -> "Retail" (case preserved)', () => {
  assert.equal(reviewText('Reta il experience required'), 'Retail experience required');
});

test('"lead ership" -> "leadership"', () => {
  assert.equal(reviewText('Proven lead ership skills'), 'Proven leadership skills');
});

test('"opportunitie s" -> "opportunities"', () => {
  assert.equal(reviewText('Growth opportunitie s included'), 'Growth opportunities included');
});

test('"stakeholder lead ership" -> "stakeholder leadership" in phrase context', () => {
  const out = reviewText('Strong stakeholder lead ership and CRM knowledge');
  assert.ok(out.includes('stakeholder leadership'), `got: ${out}`);
  assert.ok(!out.includes('lead ership'), `got: ${out}`);
});

test('multiple broken words in one line are all fixed', () => {
  const out = reviewText('The  term s and i nsurance need  review');
  assert.equal(out, 'The terms and insurance need review');
});

// ── Hyphen compounds ─────────────────────────────────────────────────────────

test('"Full - time" -> "Full-time"', () => {
  assert.equal(reviewText('Full - time position available'), 'Full-time position available');
});

test('"part - time" -> "part-time"', () => {
  assert.equal(reviewText('part - time work'), 'part-time work');
});

test('"full - time" / "full- time" / "full -time" all normalise', () => {
  assert.equal(reviewText('full - time'), 'full-time');
  assert.equal(reviewText('full- time'), 'full-time');
  assert.equal(reviewText('full -time'), 'full-time');
});

test('"e - commerce" -> "e-commerce"', () => {
  assert.equal(reviewText('e - commerce background'), 'e-commerce background');
});

test('existing "full-time" is left unchanged', () => {
  assert.equal(reviewText('full-time role'), 'full-time role');
});

test('"full time" (no hyphen) is NOT merged into one word', () => {
  assert.equal(reviewText('full time employee'), 'full time employee');
});

// ── Spaces before punctuation ────────────────────────────────────────────────

test('space before comma: "journeys , CRM" -> "journeys, CRM"', () => {
  assert.equal(reviewText('Sales journeys , CRM systems'), 'Sales journeys, CRM systems');
});

test('space before period/semicolon/question/colon/exclamation', () => {
  const out = reviewText('word . word ; word ? word : word !');
  assert.equal(out, 'word. word; word? word: word!');
});

test('space before punctuation after replacement tokens is fixed', () => {
  const out = reviewText('Send CV to CV@talenttree.co.za , or apply online');
  assert.ok(out.includes('CV@talenttree.co.za,'), `got: ${out}`);
});

// ── Bullets ──────────────────────────────────────────────────────────────────

test('bullet with tab/inconsistent spacing normalises to "• "', () => {
  assert.equal(reviewText('•\tHandle enquiries'), '• Handle enquiries');
  assert.equal(reviewText('•   Multiple spaces'), '• Multiple spaces');
  assert.equal(reviewText('• - leading double marker'), '• leading double marker');
});

test('bullet glyph only line is dropped', () => {
  const out = reviewText('Intro line\n•\nNext line');
  assert.equal(out, 'Intro line\n\nNext line');
});

// ── Blank lines / whitespace ─────────────────────────────────────────────────

test('runs of 3+ blank lines collapse to a single blank line', () => {
  const out = reviewText('a\n\n\n\n\nb');
  assert.equal(out, 'a\n\nb');
});

test('whitespace-only lines are treated as blank lines', () => {
  const out = reviewText('a\n   \n\t\n\n\n\nb');
  assert.equal(out, 'a\n\nb');
});

test('double internal spaces collapse to one', () => {
  assert.equal(reviewText('We value  teamwork'), 'We value teamwork');
});

// ── Duplicate lines ──────────────────────────────────────────────────────────

test('consecutive duplicate lines are dropped (page-break artifact)', () => {
  const out = reviewText('Key skills\nKey skills\nCommunication');
  assert.equal(out, 'Key skills\nCommunication');
});

test('non-consecutive identical lines are kept', () => {
  const out = reviewText('A\nB\nA');
  assert.equal(out, 'A\nB\nA');
});

test('duplicate apply lines (same line repeated) are dropped', () => {
  const out = reviewText('Apply via CV@talenttree.co.za\nApply via CV@talenttree.co.za');
  assert.equal(out, 'Apply via CV@talenttree.co.za');
});

test('two different back-to-back apply instructions collapse to one', () => {
  const out = reviewText(
    'Apply via CV@talenttree.co.za\nEmail your CV to CV@talenttree.co.za'
  );
  const applies = out.split('\n').filter(l => /cv@talenttree\.co\.za/i.test(l));
  assert.equal(applies.length, 1, `got: ${out}`);
});

test('apply lines separated by other content are both kept', () => {
  const out = reviewText('Apply via CV@talenttree.co.za\n\nHow to Apply\nSend your CV to CV@talenttree.co.za');
  const applies = out.split('\n').filter(l => /cv@talenttree\.co\.za/i.test(l));
  assert.equal(applies.length, 2, `got: ${out}`);
});

test('a contact line containing CV@ does not swallow the apply line after it', () => {
  const out = reviewText(
    'Contact: CV@talenttree.co.za or [Contact details removed]\nApply via CV@talenttree.co.za'
  );
  assert.ok(out.includes('Apply via CV@talenttree.co.za'), `apply line lost: ${out}`);
  assert.ok(out.includes('Contact: CV@talenttree.co.za'), `contact line lost: ${out}`);
});

// ── Legacy application address ───────────────────────────────────────────────

test('applications@talenttree.co.za -> CV@talenttree.co.za', () => {
  assert.equal(
    reviewText('Send to applications@talenttree.co.za'),
    'Send to CV@talenttree.co.za'
  );
});

test('case-insensitive legacy address normalisation', () => {
  const out = reviewText('Applications@TalentTree.co.za please');
  assert.equal(out, 'CV@talenttree.co.za please');
});

// ── Safety: no false merges ──────────────────────────────────────────────────

test('"R and D" is NOT merged', () => {
  assert.equal(reviewText('R and D department'), 'R and D department');
});

test('"as sure" is NOT merged into "assure"', () => {
  assert.equal(reviewText('You can be as sure of the date'), 'You can be as sure of the date');
});

test('"in put" is NOT merged into "input"', () => {
  assert.equal(reviewText('in put the details'), 'in put the details');
});

test('"the m anager" -> "the manager" (not "them anager")', () => {
  assert.equal(reviewText('the m anager of sales'), 'the manager of sales');
});

test('digits and mixed tokens are untouched', () => {
  assert.equal(reviewText('R 15 000 per month, 2025 or 2026'), 'R 15 000 per month, 2025 or 2026');
});

test('replacement tokens survive review unchanged', () => {
  const out = reviewText('[Link removed] [Contact details removed] CV@talenttree.co.za');
  assert.equal(out, '[Link removed] [Contact details removed] CV@talenttree.co.za');
});

// ── Idempotency ──────────────────────────────────────────────────────────────

test('reviewText is idempotent on messy input', () => {
  const messy = [
    'Th e  term s include i nsurance',
    '',
    'Reta il lead ership  role , R 15 000',
    'Full - time , R 15 000',
    'R and D dept',
    '•\titem one',
    '•   item two',
    '',
    '',
    '',
    'Send your CV to applications@talenttree.co.za',
    'Send your CV to CV@talenttree.co.za',
    'a . . odd',
  ].join('\n');
  const once = reviewText(messy);
  const twice = reviewText(once);
  assert.equal(once, twice);
});

// ── Integration through sanitizeDocument ─────────────────────────────────────

test('sanitizeDocument fixes broken words end-to-end', () => {
  const result = sanitizeDocument('Shoprite is hiring for term s and i nsurance benefits');
  assert.ok(result.sanitizedText.includes('terms'), `got: ${result.sanitizedText}`);
  assert.ok(result.sanitizedText.includes('insurance'), `got: ${result.sanitizedText}`);
  assert.ok(!result.sanitizedText.toLowerCase().includes('shoprite'));
  assert.ok(!result.sanitizedText.includes('term s'));
});

test('sanitizeDocument canonicalises existing "Talent Tree" branding', () => {
  const result = sanitizeDocument('Talent Tree is pleased to present this role. Talent tree also assists.');
  assert.ok(result.sanitizedText.includes('TalentTree'), `got: ${result.sanitizedText}`);
  assert.ok(!/\bTalent\s+Tree\b/i.test(result.sanitizedText), `got: ${result.sanitizedText}`);
  const brandLog = result.logs.find(l => l.type === 'branding');
  assert.ok(brandLog, 'branding log entry expected');
  assert.equal(brandLog.replacement, 'TalentTree');
});

test('user-reported example: full messy brief comes out clean', () => {
  const brief = [
    'Senior Reta il Analyst',
    '',
    'Th e client is a leading organisation offering term s and conditions that',
    'include medical i nsurance and group l ife. The role offers growth',
    'opportunitie s with a strong stakeholder lead ership environment.',
    '',
    'Requirements',
    '•\t5 years retail experience',
    '•   CRM , SQL and stakeholder lead ership',
    '•   Proven interes t in data',
    '',
    'Full - time , permanent position. R 45 000 p m.',
    'Full - time , permanent position. R 45 000 p m.',
    '',
    'Contact: john.doe@example.com or 082 123 4567',
    'Apply via https://careers.example.com/apply',
    'Email your CV to applications@talenttree.co.za',
    'Apply via CV@talenttree.co.za',
    '',
    '',
    '',
    'Budget: R1.2M (internal)',
  ].join('\n');

  const result = sanitizeDocument(brief);
  const text = result.sanitizedText;

  // Broken words fixed
  assert.ok(!text.includes('Reta il'), 'broken "Reta il" remains');
  assert.ok(text.includes('Retail'), 'Retail missing');
  assert.ok(!text.includes('Th e '), 'broken "Th e" remains');
  assert.ok(text.includes('The client'), 'The client missing');
  assert.ok(!text.includes('term s'), 'broken "term s" remains');
  assert.ok(text.includes('terms'), 'terms missing');
  assert.ok(!text.includes('i nsurance'), 'broken "i nsurance" remains');
  assert.ok(text.includes('insurance'), 'insurance missing');
  assert.ok(!text.includes('opportunitie s'), 'broken "opportunitie s" remains');
  assert.ok(text.includes('opportunities'), 'opportunities missing');
  assert.ok(!text.includes('lead ership'), 'broken "lead ership" remains');
  assert.ok(text.includes('leadership'), 'leadership missing');
  assert.ok(!text.includes('interes t'), 'broken "interes t" remains');

  // Hyphen + punctuation artifacts fixed (strip the correct form first, then
  // assert no spaced-hyphen variant remains)
  assert.ok(
    !/\bfull\s*-\s*time\b/i.test(text.replace(/\bfull-time\b/gi, '')),
    'stray-hyphen "Full - time" remains'
  );
  assert.ok(/Full-time/i.test(text), 'Full-time missing');
  assert.ok(!text.includes('CRM ,'), 'space before comma remains');
  assert.ok(text.includes('CRM,'), 'CRM, missing');

  // Bullet spacing normalised
  assert.ok(!text.includes('•\t'), 'bullet+tab remains');
  assert.ok(text.includes('• 5 years retail experience'), 'normalised bullet missing');

  // Blank lines: no 3+ consecutive newlines anywhere
  assert.ok(!/\n{3,}/.test(text), 'run of 3+ newlines remains');
  // No whitespace-only lines
  assert.ok(!text.split('\n').some(l => l.length > 0 && !l.trim()), 'whitespace-only line remains');

  // Duplicate apply lines collapsed
  const applyLines = text.split('\n').filter(l => /cv@talenttree\.co\.za/i.test(l));
  assert.ok(applyLines.length >= 1, 'apply line missing');
  const consecutiveDupes = text.split('\n').some((l, i, arr) =>
    i > 0 && l.trim() && l.trim().toLowerCase() === arr[i - 1].trim().toLowerCase());
  assert.ok(!consecutiveDupes, 'consecutive duplicate line remains');

  // PII still removed (reviewer must not break sanitization)
  assert.ok(!text.includes('john.doe@example.com'), 'email leak');
  assert.ok(!text.includes('082 123 4567'), 'phone leak');
  assert.ok(!text.includes('careers.example.com'), 'URL leak');
  assert.ok(text.includes('CV@talenttree.co.za'), 'standard apply address missing');
  assert.ok(!text.includes('applications@talenttree.co.za'), 'legacy address remains');
});
