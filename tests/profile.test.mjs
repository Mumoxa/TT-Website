import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const profile = fs.readFileSync(new URL('../src/profile/ProfileApp.jsx', import.meta.url), 'utf8');
const profileCss = fs.readFileSync(new URL('../src/profile/profile.css', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
const robots = fs.readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');

test('/profile is routed, lazy-loaded and linked from the marketing site', () => {
  assert.match(main, /const ProfileApp = lazy\(\(\) => import\('\.\/profile\/ProfileApp\.jsx'\)\)/);
  assert.match(main, /if \(path === '\/profile'\) return withFallback\(<ProfileApp \/>\)/);
  assert.match(main, /href="\/profile"/);
});

test('the profile excludes candidate contact content and the fees chapter', () => {
  assert.doesNotMatch(profile, /Candidates and confidential conversations/);
  assert.doesNotMatch(profile, /Start a confidential chat/);
  assert.doesNotMatch(profile, /CV@talenttree\.co\.za/);
  assert.doesNotMatch(profile, /id=\"fees\"|>Fees<|fee-calculator/i);
  assert.doesNotMatch(profile, /15% of annual CTC|25–35%|annual cost to company/);
});

test('the profile keeps client contact routes wired to a real address', () => {
  assert.match(profile, /const EMAIL = 'hello@talenttree\.co\.za';/);
  assert.match(profile, /mailto:\$\{EMAIL\}\?subject=/);
  assert.match(profile, /href=\"\/#contact\"/);
  assert.doesNotMatch(profile, /href=\"#\"|href=\"\"|TODO|Lorem/i);
});

test('the profile is interactive: chapters, filters, accordions and stepper', () => {
  assert.match(profile, /aria-current=\{activeChapter === id \? 'true' : undefined\}/);
  assert.match(profile, /aria-pressed=\{mandateFilter === filter\}/);
  assert.match(profile, /aria-expanded=\{expanded\}/);
  assert.match(profile, /role=\"tablist\"/);
  assert.match(profile, /role=\"tabpanel\"/);
  assert.match(profile, /aria-controls=\{`tp-step-panel-\$\{index\}`\}/);
  assert.doesNotMatch(profile, /FeeCalculator|fee-calculator/);
});

test('the profile keeps the brand palette: tokens only, no hard-coded new colours', () => {
  // Every colour must resolve to a src/styles.css token or an existing brand value.
  const allowedLiterals = new Set(['#9cc9da']); // the hero eyebrow tint already used in styles.css
  const hexes = profileCss.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  hexes.forEach((hex) => {
    assert.ok(allowedLiterals.has(hex.toLowerCase()), `unexpected raw colour ${hex} in profile.css`);
  });
  ['--ink', '--paper', '--accent', '--accent-bright', '--muted-on-dark', '--serif', '--sans'].forEach((token) => {
    assert.ok(profileCss.includes(`var(${token})`), `profile.css should consume ${token}`);
  });
});

test('the profile honours the accessibility and motion contract', () => {
  assert.match(profileCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(profileCss, /@media print/);
  assert.match(profile, /className="skip-link"/);
  assert.match(profile, /aria-live="polite"/);
});

test('client identities stay anonymised by descriptor', () => {
  assert.doesNotMatch(profile, /Milkor|Shoprite|Capitec|Discovery|Standard Bank/i);
  assert.match(profile, /JSE-listed retail group/);
});

test('the profile is publicly discoverable and internal tools stay excluded', () => {
  assert.match(sitemap, /https:\/\/talenttree\.co\.za\/profile/);
  assert.match(robots, /Sitemap: https:\/\/talenttree\.co\.za\/sitemap\.xml/);
  ['/specs', '/cv-builda', '/admin', '/offer'].forEach((path) => {
    assert.ok(robots.includes(`Disallow: ${path}`), `${path} must stay out of search indexes`);
  });
  const headers = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.doesNotMatch(headers, /\/profile/);
});
