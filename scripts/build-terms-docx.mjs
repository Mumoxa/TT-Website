#!/usr/bin/env node
/* Generate public/downloads/Talent-Tree-Terms-of-Business.docx from terms.json.

   Companion to scripts/build-terms-pdf.py: same source of truth, same brand
   voice, so the client downloads folder can offer the Terms as both an
   archival PDF and an editable Word copy (for letterhead / mandate variations).

   Run from the repo root:
     node scripts/build-terms-docx.mjs
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from 'docx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const terms = JSON.parse(
  readFileSync(join(ROOT, 'src', 'downloads', 'terms.json'), 'utf8')
);
const OUT_PATH = join(
  ROOT,
  'public',
  'downloads',
  'Talent-Tree-Terms-of-Business.docx'
);

const INK = '0E2A3A';
const INK_DEEP = '071F2D';
const ACCENT = '006DA3';
const MUTED = '4F6B7A';

const track = { size: 11, font: 'Georgia' };

/* Small helper returning a docx Paragraph from plain text + options. */
function para(text, opts = {}) {
  const { size = 11, color = INK, font = 'Georgia', bold = false, italic = false, spacing = {} } = opts;
  return new Paragraph({
    spacing: { after: 180, line: 276, ...spacing },
    children: [
      new TextRun({ text, size, color, font, bold, italic }),
    ],
  });
}

const children = [];

/* — Brand lockup bar (title block) — */
children.push(
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 60 },
    children: [
      new TextRun({ text: 'TALENT TREE CONSULTING', size: 18, bold: true, color: INK_DEEP, font: 'Georgia' }),
    ],
  })
);
children.push(
  new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: terms.title, size: 26, bold: true, color: INK, font: 'Georgia' }),
    ],
  })
);
children.push(
  new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: `Version ${terms.version}  ·  Effective ${terms.effective}`, size: 10, color: ACCENT, bold: true, font: 'Georgia' }),
    ],
  })
);

/* — A horizontal rule paragraph — */
children.push(
  new Paragraph({
    spacing: { after: 260 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
    children: [new TextRun({ text: '', size: 2 })],
  })
);

/* — Preamble — */
for (const p of terms.preamble) children.push(para(p));

/* — Articles — */
for (const article of terms.articles) {
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 260, after: 140 },
      children: [
        new TextRun({ text: `${article.number}.  ${article.title}`, size: 13, bold: true, color: INK_DEEP, font: 'Georgia' }),
      ],
    })
  );
  for (const p of article.paragraphs) children.push(para(p));
}

/* — Closing block — */
children.push(
  new Paragraph({
    spacing: { before: 260, after: 0 },
    children: [
      new TextRun({ text: terms.party, size: 10, bold: true, color: INK_DEEP, font: 'Georgia' }),
    ],
  })
);
children.push(
  new Paragraph({
    spacing: { after: 0 },
    children: [
      new TextRun({ text: terms.email, size: 10, color: ACCENT, font: 'Georgia' }),
    ],
  })
);
children.push(
  new Paragraph({
    spacing: { after: 0 },
    children: [
      new TextRun({ text: terms.site, size: 10, color: MUTED, font: 'Georgia' }),
    ],
  })
);

const doc = new Document({
  creator: terms.party,
  title: terms.title,
  description: `Version ${terms.version}, effective ${terms.effective}.`,
  sections: [
    {
      properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `${terms.title}  —  v${terms.version}`, size: 9, color: MUTED, font: 'Georgia' }),
                new TextRun({ children: ['   ·   Page ', PageNumber.CURRENT], size: 9, color: MUTED, font: 'Georgia' }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(OUT_PATH, buffer);
console.log(`Wrote ${OUT_PATH} (${buffer.length} bytes)`);
