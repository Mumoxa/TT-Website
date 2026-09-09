import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/downloads/DownloadsApp.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/downloads/downloads.css', import.meta.url), 'utf8');
const terms = JSON.parse(fs.readFileSync(new URL('../src/downloads/terms.json', import.meta.url), 'utf8'));
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
const pdfPath = new URL('../public/downloads/Talent-Tree-Terms-of-Business.pdf', import.meta.url);

test('/downloads is routed, lazy-loaded and linked from the marketing site', () => {
  assert.match(main, /const DownloadsApp = lazy\(\(\) => import\('\.\/downloads\/DownloadsApp\.jsx'\)\)/);
  assert.match(main, /if \(path === '\/downloads'\) return withFallback\(<DownloadsApp \/>\)/);
  assert.match(main, /href="\/downloads"/);
});

test('the library points at a real PDF in public/downloads/', () => {
  assert.equal(terms.href, '/downloads/Talent-Tree-Terms-of-Business.pdf');
  assert.equal(terms.fileName, 'Talent-Tree-Terms-of-Business.pdf');
  assert.ok(fs.existsSync(pdfPath), 'missing terms of business PDF');
  const stat = fs.statSync(pdfPath);
  assert.ok(stat.size > 4000, `PDF looks empty (${stat.size} bytes)`);
  const magic = Buffer.alloc(5);
  const fd = fs.openSync(pdfPath, 'r');
  fs.readSync(fd, magic, 0, 5, 0);
  fs.closeSync(fd);
  assert.equal(magic.toString('utf8'), '%PDF-');
});

test('the folder offers the terms as a real PDF and an editable Word copy', () => {
  for (const name of ['Talent-Tree-Terms-of-Business.pdf', 'Talent-Tree-Terms-of-Business.docx']) {
    const file = new URL(`../public/downloads/${name}`, import.meta.url);
    assert.ok(fs.existsSync(file), `missing ${name}`);
    const stat = fs.statSync(file);
    assert.ok(stat.size > 2000, `${name} looks empty (${stat.size} bytes)`);
  }
  assert.match(app, /DOCX_HREF = '\/downloads\/Talent-Tree-Terms-of-Business\.docx'/);
  // The terms accordion was retired for a download-first page; confirm it is gone.
  assert.doesNotMatch(app, /aria-expanded/);
});

test('terms content is complete and does not invent fee rates or placeholder copy', () => {
  assert.equal(terms.party, 'Talent Tree Consulting');
  assert.equal(terms.email, 'hello@talenttree.co.za');
  assert.ok(terms.articles.length >= 16, 'expected the full clause set');
  assert.ok(terms.articles.every((article) => article.number && article.title && article.paragraphs.length));
  const blob = JSON.stringify(terms);
  assert.doesNotMatch(blob, /TODO|Lorem|15%|25–35%|CIPC|registration number/i);
  assert.match(app, /download=\{terms\.fileName\}/);
  assert.doesNotMatch(app, /href="#"|href=""|TODO|Lorem/i);
});

test('the downloads page keeps the brand palette: tokens only', () => {
  const allowedLiterals = new Set(['#9cc9da']);
  const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  hexes.forEach((hex) => {
    assert.ok(allowedLiterals.has(hex.toLowerCase()), `unexpected raw colour ${hex} in downloads.css`);
  });
  ['--ink', '--paper', '--accent', '--accent-bright', '--muted-on-dark', '--serif', '--sans', '--ease'].forEach(
    (token) => assert.ok(css.includes(`var(${token})`), `downloads.css should consume ${token}`)
  );
});

test('the downloads page honours the accessibility and motion contract', () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media print/);
  assert.match(app, /className="skip-link"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /aria-hidden="true"/);
  // Both the header nav and the folder file list expose state/roles accessibly.
  assert.match(app, /aria-current=\{activeChapter === id \? 'true' : undefined\}/);
  assert.match(app, /role="list"/);
  assert.match(app, /role="listitem"/);
  // Every download target is a real, announced static file.
  assert.match(app, /download=\{terms\.fileName\}/);
  assert.match(app, /download=\{DOCX_NAME\}/);
});

test('the downloads library is publicly discoverable', () => {
  assert.match(sitemap, /https:\/\/talenttree\.co\.za\/downloads/);
  assert.match(sitemap, /https:\/\/talenttree\.co\.za\/downloads\/Talent-Tree-Terms-of-Business\.pdf/);
});
