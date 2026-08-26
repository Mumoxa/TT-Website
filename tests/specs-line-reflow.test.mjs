import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewText } from '../src/specs/lib/textReviewer.js';
import { sanitizeDocument } from '../src/specs/lib/sanitize.js';

test('reviewText rejoins soft-wrapped prose before generation', () => {
  const input = [
    'The organisation is in the early stages of a major strategic initiative involving',
    'the establishment of a new e-',
    'commerce operation.',
    '',
    'While the business case is still under refinement, workforce planning has already begun, and the organisation',
    'is proactively mapping senior talent for a potential HR leadership role in support of this planned operation.',
  ].join('\n');

  assert.equal(
    reviewText(input),
    [
      'The organisation is in the early stages of a major strategic initiative involving the establishment of a new e-commerce operation.',
      '',
      'While the business case is still under refinement, workforce planning has already begun, and the organisation is proactively mapping senior talent for a potential HR leadership role in support of this planned operation.',
    ].join('\n')
  );
});

test('reviewText preserves structural boundaries while reflowing wrapped body copy', () => {
  const input = [
    'Role Overview',
    'This position will serve as the most senior HR figure within the e-commerce division and will play a pivotal role',
    'in shaping and scaling the people strategy for a warehousing, logistics, and distribution-heavy business model.',
    '',
    'Key Focus Areas',
    '1. People Strategy and Organisational Design',
    'Build a scalable and high-performance organisational structure aligned with operational needs and',
    'business growth objectives.',
    '2. HR Operations, Policies, and Compliance',
    'Drive the development and execution of compliant HR policies, processes, and industrial relations',
    'practices across a blue-collar workforce.',
    '',
    '• Lead workforce planning and talent acquisition strategies',
    '• Position the operation as an employer of choice',
  ].join('\n');

  const output = reviewText(input);

  assert.ok(output.includes('Role Overview\nThis position will serve'), output);
  assert.ok(output.includes('pivotal role in shaping and scaling the people strategy'), output);
  assert.ok(output.includes('Key Focus Areas\n1. People Strategy and Organisational Design\nBuild a scalable'), output);
  assert.ok(output.includes('operational needs and business growth objectives.'), output);
  assert.ok(output.includes('industrial relations practices across a blue-collar workforce.'), output);
  assert.ok(output.includes('• Lead workforce planning and talent acquisition strategies\n• Position the operation as an employer of choice'), output);
});

test('sanitizeDocument does not leave lowercase mid-sentence continuation lines', () => {
  const input = [
    'E-commerce HR Lead',
    '',
    'Role Overview',
    'The ideal profile is someone with a deep understanding of blue-collar workforce environments, including',
    'experience in compliance, labour relations, and high-volume operations.',
    '',
    '5. Learning, Development, and Succession Planning',
    'Design and deliver a pipeline for training, leadership development, and succession planning to support',
    'sustainable growth.',
  ].join('\n');

  const { sanitizedText } = sanitizeDocument(input);

  assert.ok(sanitizedText.includes('including experience in compliance'), sanitizedText);
  assert.ok(sanitizedText.includes('succession planning to support sustainable growth.'), sanitizedText);
  assert.ok(!/\n(?:experience|sustainable)\b/.test(sanitizedText), sanitizedText);
});
