import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = [
  '../src/main.jsx',
  '../src/landing/ExecutiveSections.jsx',
].map((path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

test('uses the supplied logo as a bundled asset without alternate logo treatments', () => {
  assert.match(source, /import\s+talentTreeLogo\s+from\s+['"]\.\.\/Talent Tree Logo 2026 \(1\)\.png['"]/);
  assert.doesNotMatch(source, /about-monogram|hero-scene|tree-line|tree-dot/);
});

test('removes invented case studies and decorative brand-like graphics', () => {
  assert.doesNotMatch(source, /const\s+cases\s*=|Selected work|case-visual|visual-shape/);
});

test('provides accessible mobile navigation and keyboard-operated capability tabs', () => {
  assert.match(source, /aria-controls="primary-navigation"/);
  assert.match(source, /aria-expanded=\{menuOpen\}/);
  assert.match(source, /service-toggle/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /aria-selected=\{activeService === index\}/);
  assert.match(source, /aria-controls=\{`service-panel-\$\{index\}`\}/);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /onKeyDown=\{\(event\) => onKeyDown\(event, index\)\}/);
});

test('keeps the about section to restrained verified facts', () => {
  assert.match(source, /Established/);
  assert.match(source, /2013/);
  assert.match(source, /South Africa/);
  assert.doesNotMatch(source, /senior attention|South Africa & beyond/);
});

test('direct contact uses a real email link without implying a message was sent', () => {
  assert.match(source, /className="ex-email" href="mailto:hello@talenttree\.co\.za"/);
  assert.doesNotMatch(source, /formStatus|Message received|setSent/);
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
