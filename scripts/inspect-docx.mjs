import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const paths = process.argv.slice(2);
if (!paths.length) { console.error('Usage: node scripts/inspect-docx.mjs FILE.docx [...]'); process.exit(2); }
let failed = false;
for (const path of paths) {
  const zip = await JSZip.loadAsync(await readFile(path));
  const documentXml = await zip.file('word/document.xml')?.async('string');
  const stylesXml = await zip.file('word/styles.xml')?.async('string');
  if (!documentXml || !stylesXml) throw new Error(`${path}: incomplete Word package`);
  const combined = `${stylesXml}\n${documentXml}`;
  const fonts = [...combined.matchAll(/w:(?:ascii|hAnsi|cs|eastAsia)="([^"]+)"/g)].map((m) => m[1]);
  const sizes = [...combined.matchAll(/<w:sz(?:Cs)? w:val="([^"]+)"/g)].map((m) => m[1]);
  const borders = [...combined.matchAll(/<w:(?:pBdr|tblBorders|top|bottom|left|right|insideH|insideV)\b/g)].length;
  const paragraphs = [...documentXml.matchAll(/<w:p[ >]/g)].length;
  const bullets = [...documentXml.matchAll(/<w:numPr>/g)].length;
  const text = [...documentXml.matchAll(/<w:t(?: [^>]*)?>(.*?)<\/w:t>/g)].map((m) => m[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'));
  const invalidFonts = [...new Set(fonts.filter((font) => font.toLowerCase() !== 'calibri'))];
  const invalidSizes = [...new Set(sizes.filter((size) => size !== '22'))];
  console.log(JSON.stringify({ path, fonts: [...new Set(fonts)], halfPointSizes: [...new Set(sizes)], paragraphs, bullets, borderDeclarations: borders, text }, null, 2));
  if (!fonts.length || !sizes.length || invalidFonts.length || invalidSizes.length || borders) {
    console.error(`${path}: failed formatting policy (Calibri 11, no border declarations).`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
