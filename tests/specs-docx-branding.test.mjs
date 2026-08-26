/**
 * Specs Generator - DOCX Branding Hyperlinks Regression Suite
 *
 * Verifies the generated DOCX branding:
 *  - every CV@talenttree.co.za occurrence in the document body is a
 *    mailto: hyperlink (with its display text preserved)
 *  - the logo image is wrapped in a hyperlink to https://talenttree.co.za
 *  - the footer email is a mailto: hyperlink
 *  - no other external hyperlink targets exist (no client links leak)
 *  - plain TXT output is unchanged (no markup possible there)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { Packer } from 'docx';
import { composeJobSpec, generatePlainText } from '../src/specs/lib/docGenerator.js';

// ── Minimal zip entry reader (central directory based) ─────────────────────

function readZipEntry(buf, entryName) {
  let offset = 0;
  while (offset + 46 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      offset += 1;
      continue;
    }
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOff = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
    if (name === entryName) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      return method === 8 ? inflateRawSync(data) : Buffer.from(data);
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// Regexes are built via RegExp constructor + template strings so backslash
// handling stays unambiguous.
const HYPERLINK_RE = new RegExp('<w:hyperlink [^>]*r:id="([^"]+)"[^>]*>[\\s\\S]*?</w:hyperlink>', 'g');
const W_T_RE = /<w:t[^>]*>([^<]*)<\/w:t>/g;
const SITE_TARGET = 'Target="https://talenttree.co.za"';
const MAILTO_TARGET = 'Target="mailto:CV@talenttree.co.za"';
const SITE_RID_IN_RELS = /Id="(rId[^"]+)"[^>]*https:\/\/talenttree\.co\.za/g;
const MAILTO_RID_IN_RELS = /Id="(rId[^"]+)"[^>]*mailto:CV@talenttree\.co\.za/g;

// ── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_TEXT = [
  'Senior Retail Analyst',
  '',
  'A leading organisation offering market-leading benefits.',
  '',
  'Requirements',
  '• 5 years retail experience',
  '• CRM, SQL and stakeholder leadership',
  '',
  'How to Apply',
  'To apply, please send your CV to CV@talenttree.co.za',
  'Apply via CV@talenttree.co.za',
].join('\n');

async function buildDoc() {
  const { doc } = composeJobSpec(SAMPLE_TEXT, {
    originalFileName: 'brief.docx',
    sanitizationLogs: [],
    companyDescriptor: 'National retailer',
  });
  return Packer.toBuffer(doc);
}

// ── Tests ───────────────────────────────────────────────────────────────────

test('document rels register both brand links (mailto + site)', async () => {
  const buf = await buildDoc();
  const rels = readZipEntry(buf, 'word/_rels/document.xml.rels');
  assert.ok(rels, 'word/_rels/document.xml.rels missing');
  const xml = rels.toString('utf8');
  assert.ok(xml.includes(MAILTO_TARGET), 'mailto rel missing');
  assert.ok(xml.includes(SITE_TARGET), 'site rel missing');
});

test('logo image is wrapped in a hyperlink to talenttree.co.za', async () => {
  const buf = await buildDoc();
  const rels = readZipEntry(buf, 'word/_rels/document.xml.rels').toString('utf8');
  const docXml = readZipEntry(buf, 'word/document.xml').toString('utf8');

  const siteRid = [...rels.matchAll(SITE_RID_IN_RELS)].map(m => m[1])[0];
  assert.ok(siteRid, 'site rId not found in rels');

  // An <w:hyperlink> with that rId must contain a drawing (the logo image)
  const imageLink = new RegExp(
    `<w:hyperlink [^>]*r:id="${siteRid}"[^>]*>[\\s\\S]*?<w:drawing>[\\s\\S]*?</w:hyperlink>`
  );
  assert.ok(imageLink.test(docXml), 'no w:hyperlink wrapping a w:drawing for the site link');

  // ...and the drawing must embed a media image
  const imageRid = [...docXml.matchAll(/<a:blip[^>]*r:embed="(rId[^"]+)"/g)].map(m => m[1])[0];
  assert.ok(imageRid, 'no embedded image blip rId found');
  const imageRel = rels.match(new RegExp(`Id="${imageRid}"[^>]*Target="([^"]*media[^"]*)"`));
  assert.ok(imageRel, 'image rId not mapped to a media target');
});

test('every CV@talenttree.co.za in the body is a mailto hyperlink with its text', async () => {
  const buf = await buildDoc();
  const rels = readZipEntry(buf, 'word/_rels/document.xml.rels').toString('utf8');
  const docXml = readZipEntry(buf, 'word/document.xml').toString('utf8');

  const mailtoRids = new Set([...rels.matchAll(MAILTO_RID_IN_RELS)].map(m => m[1]));
  assert.ok(mailtoRids.size >= 1, 'no mailto relationship registered');

  // Every email display occurrence must sit inside a mailto hyperlink
  const emailLinks = [...docXml.matchAll(HYPERLINK_RE)].filter(m =>
    m[0].includes('CV@talenttree.co.za'));
  assert.ok(emailLinks.length >= 2, `expected >=2 email hyperlinks in body, found ${emailLinks.length}`);
  for (const m of emailLinks) {
    assert.ok(mailtoRids.has(m[1]), `email hyperlink rId ${m[1]} is not a mailto relationship`);
    // display text preserved inside the hyperlink
    const texts = [...m[0].matchAll(W_T_RE)].map(t => t[1]);
    assert.ok(texts.includes('CV@talenttree.co.za'), `email hyperlink lost its text: ${texts}`);
  }
});

test('footer email is a mailto hyperlink', async () => {
  const buf = await buildDoc();
  const footerParts = [];
  for (let i = 1; i <= 4; i++) {
    const xml = readZipEntry(buf, `word/footer${i}.xml`);
    if (xml) footerParts.push(xml.toString('utf8'));
  }
  assert.ok(footerParts.length >= 1, 'no footer part found');
  const footerIdx = footerParts.findIndex(f => f.includes('CV@talenttree.co.za'));
  assert.ok(footerIdx >= 0, 'no footer contains CV@talenttree.co.za');
  const footer = footerParts[footerIdx];

  const emailLinks = [...footer.matchAll(HYPERLINK_RE)].filter(m =>
    m[0].includes('CV@talenttree.co.za'));
  assert.ok(emailLinks.length >= 1, 'footer email is not inside a w:hyperlink');

  const footerRels = readZipEntry(buf, `word/_rels/footer${footerIdx + 1}.xml.rels`);
  assert.ok(footerRels, `word/_rels/footer${footerIdx + 1}.xml.rels missing`);
  const relsXml = footerRels.toString('utf8');
  for (const m of emailLinks) {
    assert.ok(
      relsXml.includes(`Id="${m[1]}"`) && relsXml.includes(MAILTO_TARGET),
      'footer hyperlink does not resolve to mailto:CV@talenttree.co.za'
    );
  }
});

test('no client hyperlinks leak (only the two brand targets)', async () => {
  const buf = await buildDoc();
  const rels = readZipEntry(buf, 'word/_rels/document.xml.rels').toString('utf8');
  const links = [...rels.matchAll(/TargetMode="External"[^>]*Target="([^"]+)"/g)]
    .map(m => m[1]);
  const allowed = new Set(['mailto:CV@talenttree.co.za', 'https://talenttree.co.za']);
  for (const target of links) {
    assert.ok(allowed.has(target), `unexpected external hyperlink target: ${target}`);
  }
});

test('plain TXT output still carries the plain address (no markup)', () => {
  const txt = generatePlainText(SAMPLE_TEXT, {
    jobTitle: 'Senior Retail Analyst',
    customDescriptor: null,
    customCompanyDescription: null,
    companyDescriptor: 'National retailer',
  });
  assert.ok(txt.includes('CV@talenttree.co.za'), 'address missing from TXT');
  assert.ok(!txt.includes('<a '), 'TXT must not contain markup');
});

test('generated DOCX only bullets lines that were explicitly bullets in the reviewed text', async () => {
  const buf = await buildDoc();
  const docXml = readZipEntry(buf, 'word/document.xml').toString('utf8');
  const bulletParagraphs = [...docXml.matchAll(/<w:numPr>/g)].length;

  assert.equal(
    bulletParagraphs,
    2,
    'short prose or numbered focus-area text must not be converted into bullets'
  );
});
