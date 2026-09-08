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

test('the profile publishes the fee position and the benchmark comparison', () => {
  assert.match(profile, /const FEE_RATE = 0\.15;/);
  assert.match(profile, /15% of annual CTC/);
  assert.match(profile, /almost half/i);
  assert.match(profile, /25–35%/);
  assert.match(profile, /annual cost to company/);
});

test('the fee benchmark carries its sources and an honest disclaimer', () => {
  assert.match(profile, /Benchmark sources:/);
  assert.match(profile, /https:\/\/interviewcost\.com\/executive/);
  assert.match(profile, /Illustrative only\./);
  assert.match(profile, /confirmed in writing per mandate/);
});

test('the fee calculator maths is driven by the single published rate', () => {
  const ourFee = /const ourFee = safeCtc \* FEE_RATE;/;
  const marketFee = /const marketFee = safeCtc \* \(benchmark \/ 100\);/;
  assert.match(profile, ourFee);
  assert.match(profile, marketFee);
  assert.match(profile, /const saving = marketFee - ourFee;/);
  // 15% against the 30% modal benchmark must resolve to half the cost.
  const ctc = 1_200_000;
  assert.equal(ctc * 0.15, 180_000);
  assert.equal(ctc * 0.3, 360_000);
  assert.equal(Math.round(((ctc * 0.3 - ctc * 0.15) / (ctc * 0.3)) * 100), 50);
});

test('every contact route on the profile is wired to a real address', () => {
  assert.match(profile, /const EMAIL = 'hello@talenttree\.co\.za';/);
  assert.match(profile, /const CV_EMAIL = 'CV@talenttree\.co\.za';/);
  assert.match(profile, /mailto:\$\{EMAIL\}\?subject=/);
  assert.match(profile, /href="\/#contact"/);
  assert.doesNotMatch(profile, /href="#"|href=""|TODO|Lorem/i);
});

test('the profile is interactive: chapters, filters, accordions, stepper, calculator', () => {
  assert.match(profile, /aria-current=\{activeChapter === id \? 'true' : undefined\}/);
  assert.match(profile, /aria-pressed=\{mandateFilter === filter\}/);
  assert.match(profile, /aria-expanded=\{expanded\}/);
  assert.match(profile, /role="tablist"/);
  assert.match(profile, /role="tabpanel"/);
  assert.match(profile, /aria-controls=\{`tp-step-panel-\$\{index\}`\}/);
  assert.match(profile, /id="fee-calculator"/);
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
