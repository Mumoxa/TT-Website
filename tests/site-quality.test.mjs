import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('uses the supplied logo as a bundled asset without alternate logo treatments', () => {
  assert.match(source, /import\s+talentTreeLogo\s+from\s+['"]\.\.\/Talent Tree Logo 2026 \(1\)\.png['"]/);
  assert.doesNotMatch(source, /about-monogram|hero-scene|tree-line|tree-dot/);
});

test('removes invented case studies and decorative brand-like graphics', () => {
  assert.doesNotMatch(source, /const\s+cases\s*=|Selected work|case-visual|visual-shape/);
});

test('provides accessible mobile navigation and service detail controls', () => {
  assert.match(source, /aria-controls="primary-navigation"/);
  assert.match(source, /aria-expanded=\{menuOpen\}/);
  assert.match(source, /service-toggle/);
  assert.match(source, /aria-expanded=\{activeService === index\}/);
});

test('keeps the about section to restrained verified facts', () => {
  assert.match(source, /Established/);
  assert.match(source, /2013/);
  assert.match(source, /South Africa/);
  assert.doesNotMatch(source, /senior attention|South Africa & beyond/);
});

test('form status is honest about frontend-only delivery', () => {
  assert.match(source, /frontend-only/i);
  assert.match(source, /CRM|backend/i);
  assert.match(source, /formStatus/);
});

test('logo CSS preserves the original artwork and interaction CSS is accessible', () => {
  const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(styles, /mix-blend-mode|filter:\s*(?:brightness|contrast)|transform:\s*scale|\.logo\{[^}]*overflow:\s*hidden/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /font-variant-numeric:\s*tabular-nums/);
});

test('public copy does not expose internal corrective-design commentary', () => {
  assert.doesNotMatch(source, /This site now|verified facts|invented metrics|decorative logo treatments/i);
});
