import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/profile/finance/FinanceApp.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/profile/finance/finance.css', import.meta.url), 'utf8');
const logos = fs.readFileSync(new URL('../src/profile/finance/logos.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');

test('/profile/finance is routed, lazy-loaded and matched before /profile', () => {
  assert.match(main, /const FinanceApp = lazy\(\(\) => import\('\.\/profile\/finance\/FinanceApp\.jsx'\)\)/);
  assert.match(main, /if \(path === '\/profile\/finance'\) return withFallback\(<FinanceApp \/>\)/);
  const financeIndex = main.indexOf("path === '/profile/finance'");
  const profileIndex = main.indexOf("path === '/profile'");
  assert.ok(financeIndex > -1 && financeIndex < profileIndex, '/profile/finance must be tested first');
});

test('the page carries the supplied finance facts without invention', () => {
  [
    'We don’t wait for the right finance professionals to apply',
    'Specialist finance recruitment experience since 2010',
    'Pepkor Group',
    'Checkers Group',
    'Pick n Pay Group',
    'Novus Holdings',
    'Super Group / Super Group Rent',
    'Lufthansa',
    'Nayax / OTI PetroSmart',
    'Crown National',
    'Old Mutual',
    'Boschendal',
    'Karoo Bioscience',
    'Nonprofit Sector',
  ].forEach((fact) => assert.ok(app.includes(fact), `missing supplied fact: ${fact}`));
  assert.doesNotMatch(app, /href="#"|href=""|TODO|Lorem/i);
});

test('all five professional accounting pathways are represented', () => {
  ['CA(SA)', 'AGA(SA)', 'SAIPA', 'CIMA / CGMA', 'ACCA'].forEach((pathway) => {
    assert.ok(app.includes(pathway), `missing pathway: ${pathway}`);
  });
});

test('the six-step search approach is present and keyboard operable', () => {
  assert.match(app, /role="tablist"/);
  assert.match(app, /role="tabpanel"/);
  assert.match(app, /aria-controls=\{`tf-step-panel-\$\{index\}`\}/);
  assert.match(app, /onKeyDown=\{onStepKeyDown\}/);
  assert.match(app, /onKeyDown=\{onPathwayKeyDown\}/);
  assert.match(app, /aria-expanded=\{expanded\}/);
  assert.match(app, /aria-pressed=\{sector === item\}/);
});

test('the finance page keeps the brand palette: tokens only', () => {
  const allowedLiterals = new Set(['#9cc9da', '#000']); // hero eyebrow tint + mask stop
  const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  hexes.forEach((hex) => {
    assert.ok(allowedLiterals.has(hex.toLowerCase()), `unexpected raw colour ${hex} in finance.css`);
  });
  ['--ink', '--paper', '--accent', '--accent-bright', '--muted-on-dark', '--serif', '--sans', '--ease'].forEach(
    (token) => assert.ok(css.includes(`var(${token})`), `finance.css should consume ${token}`)
  );
});

test('every named client is represented by its real logo asset on disk', () => {
  const expected = [
    'pepkor', 'checkers', 'picknpay', 'novus', 'supergroup', 'lufthansa',
    'fnb', 'nayax', 'otipetrosmart', 'crownnational', 'oldmutual', 'boschendal',
  ];
  expected.forEach((key) => {
    assert.match(logos, new RegExp(`${key}: \\{ src:`), `logos.js should map ${key}`);
    const file = new URL(`../public/logos/clients/${key}.png`, import.meta.url);
    assert.ok(fs.existsSync(file), `missing logo file for ${key}`);
    assert.ok(fs.statSync(file).size > 1000, `logo for ${key} looks empty`);
  });
});

test('replaced clients are fully gone: no Shoprite, no Crown Holdings packaging', () => {
  assert.doesNotMatch(app, /Shoprite/);
  assert.doesNotMatch(app, /Crown Holdings/);
  assert.ok(!fs.existsSync(new URL('../public/logos/clients/shoprite.png', import.meta.url)));
  assert.ok(!fs.existsSync(new URL('../public/logos/clients/crown.png', import.meta.url)));
});

test('the professional body logos are present for the pathway tiles', () => {
  ['saica', 'saipa', 'cima', 'acca'].forEach((key) => {
    assert.match(logos, new RegExp(`${key}: \\{ src:`), `logos.js should map ${key}`);
    const file = new URL(`../public/logos/bodies/${key}.png`, import.meta.url);
    assert.ok(fs.existsSync(file), `missing body logo for ${key}`);
  });
});

test('logos are rendered as real images and never recoloured', () => {
  assert.match(app, /<img src=\{client\.logo\.src\}/);
  assert.match(app, /<img src=\{pathway\.logo\.src\}/);
  // The drawn-monogram disclaimer is gone now that real trademarks are used.
  assert.doesNotMatch(app, /Talent Tree illustrations/);
  // Brand artwork must never be tinted, greyscaled or masked to our palette.
  const logoImgRules = css.match(/\.tf-(client-mark|pathway-mark|pathway-panel-mark|logo-tile) img\s*\{[^}]*\}/g) || [];
  assert.ok(logoImgRules.length > 0, 'expected logo image rules');
  logoImgRules.forEach((rule) => {
    assert.doesNotMatch(rule, /-webkit-mask|mask-image|grayscale|sepia|hue-rotate|invert\(/, `logo artwork recoloured: ${rule}`);
  });
});

test('the finance page honours the accessibility and motion contract', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media print/);
  assert.match(app, /className="skip-link"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /aria-hidden="true"/);
});

test('the finance capability page is publicly discoverable', () => {
  assert.match(sitemap, /https:\/\/talenttree\.co\.za\/profile\/finance/);
});
