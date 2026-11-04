import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

const app = readFileSync(new URL('../src/assessments/AssessmentApp.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/assessments/assessment.css', import.meta.url), 'utf8');
const site = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('assessment UI uses the real current Talent Tree logo asset', () => {
  assert.match(app, /Talent Tree Logo 2026 \(1\)\.png/);
  assert.equal(existsSync(new URL('../Talent Tree Logo 2026 (1).png', import.meta.url)), true);
  assert.match(app, /alt="Talent Tree Consulting"/);
});

test('assessment inherits Talent Tree typography and design tokens', () => {
  for (const token of ['--paper', '--paper-soft', '--ink', '--ink-deep', '--accent', '--muted', '--serif', '--sans']) {
    assert.ok(site.includes(token + ':'), 'site defines ' + token);
    assert.ok(css.includes('var(' + token + ')'), 'assessment consumes ' + token);
  }
  assert.match(css, /\.tta-welcome-layout/);
  assert.match(css, /\.tta-run-layout/);
  assert.match(css, /@media \(max-width: 560px\)/);
});

test('assessment components are presentation-only until secure API is built', () => {
  assert.doesNotMatch(app, /fetch\(['"]\/api\/assessment/);
  assert.match(app, /onStart/);
  assert.match(app, /server-side timer/);
});
