/* ============================================================================
   TALENT TREE — DOCUMENT TEXT EXTRACTION
   ----------------------------------------------------------------------------
   ISOMORPHIC. Takes the bytes of a CV and returns its text.

     const { text, format, notes } = await extractText(bytes, 'Steyn CV.docx');

   Everything here runs where the file is opened. Nothing is uploaded, which is
   the honest answer to the POPIA question and the reason no cloud conversion
   service appears anywhere in this module.

   What comes back is plain text with the structure a reader would see: one
   line per paragraph, a bullet marker on paragraphs the document itself made
   into list items, tabs between table cells. parse.js reads that structure, so
   losing it costs accuracy later — preserve it when adding a format.
   ========================================================================== */

const DECODER = new TextDecoder('utf-8');

/* File signatures, checked rather than trusting the extension — a .doc that is
   really a .docx is common enough to be worth handling silently. */
const SIGS = [
  { format: 'docx', bytes: [0x50, 0x4b, 0x03, 0x04] },   // any zip; confirmed below
  { format: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },    // %PDF
  { format: 'doc', bytes: [0xd0, 0xcf, 0x11, 0xe0] },    // OLE compound file
  { format: 'rtf', bytes: [0x7b, 0x5c, 0x72, 0x74] },    // {\rt
];

function sniff(bytes) {
  for (const sig of SIGS) {
    if (sig.bytes.every((b, i) => bytes[i] === b)) return sig.format;
  }
  return 'text';
}

/**
 * @param {Uint8Array} bytes    the file
 * @param {string} [fileName]   used for messages and for .gdoc detection
 * @returns {Promise<{text: string, format: string, notes: string[]}>}
 */
async function extractText(bytes, fileName = '') {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!input.length) throw new ExtractError('That file is empty.');

  const name = String(fileName || '');
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const notes = [];
  let format = sniff(input);

  /* A .gdoc on disk is a pointer, not a document — a few lines of JSON naming
     a file that lives in Google's cloud. There is nothing in it to read. */
  if (ext === 'gdoc' || (format === 'text' && looksLikeGdocPointer(input))) {
    throw new ExtractError(
      'That is a Google Docs shortcut, which holds a link rather than the document. '
      + 'In Google Docs choose File → Download → Microsoft Word (.docx) and load that.',
    );
  }

  if (format === 'docx') {
    if (typeof DecompressionStream === 'undefined') {
      /* Only .docx needs it. A browser this old can still take a PDF, rich
         text, or the CV pasted into the box, so the message points there
         rather than leaving a bare "DecompressionStream is not defined". */
      throw new ExtractError(
        'This browser is too old to open a Word file here. Update it, or save the CV '
        + 'as a PDF, or paste the text into the box below.',
      );
    }
    let parts;
    try {
      parts = await unzip(input);
    } catch (e) {
      if (e instanceof ExtractError) throw e;
      throw new ExtractError('That Word file could not be opened — it may be corrupt. Try re-saving it from Word.');
    }
    if (parts.has('word/document.xml')) {
      return { text: fromWordXml(DECODER.decode(parts.get('word/document.xml'))), format: 'docx', notes };
    }
    if ([...parts.keys()].some((k) => k.startsWith('content.xml'))) {
      throw new ExtractError(
        'That looks like an OpenDocument file (.odt). Save it as .docx or PDF and load that.',
      );
    }
    throw new ExtractError('That zip does not contain a Word document.');
  }

  if (format === 'pdf') {
    try {
      return { text: await fromPdf(input), format: 'pdf', notes };
    } catch (e) {
      /* pdf.js throws its own exception types (InvalidPDFException, and others)
         whose messages read like library internals. Its own guidance —
         a scanned PDF, the original .docx — is the useful part, so an
         ExtractError we raised passes through and anything else is reworded. */
      if (e instanceof ExtractError) throw e;
      throw new ExtractError(
        'That PDF could not be read — it may be corrupt or password-protected. '
        + 'Try the original .docx, or re-export the PDF.',
      );
    }
  }

  if (format === 'doc') {
    const text = fromLegacyDoc(input);
    if (!readable(text)) {
      throw new ExtractError(
        'That is a Word 97–2003 file (.doc), and its text could not be read reliably. '
        + 'Open it in Word and use File → Save As → .docx, then load that.',
      );
    }
    notes.push(
      'Read from a Word 97–2003 (.doc) file, where formatting is not recoverable — '
      + 'check the sections carefully, and prefer .docx next time.',
    );
    return { text, format: 'doc', notes };
  }

  if (format === 'rtf') {
    return { text: fromRtf(DECODER.decode(input)), format: 'rtf', notes };
  }

  const text = DECODER.decode(input);
  if (!readable(text)) {
    throw new ExtractError(
      `That file could not be read as a document${ext ? ` (.${ext})` : ''}. `
      + 'CV-Builda reads .docx, .pdf, .rtf and plain text.',
    );
  }
  return { text: normalise(text), format: 'text', notes };
}

/** Browser convenience: takes a File straight from an input or a drop. */
async function extractFromFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return extractText(bytes, file.name);
}

class ExtractError extends Error {}

/* ─────────────────────────────────────────────────────────────────── zip ── */

/**
 * Reads a zip without a dependency. DecompressionStream is in every browser
 * the site supports and in Node 18+, so the only thing missing is the central
 * directory walk.
 *
 * @returns {Promise<Map<string, Uint8Array>>}
 */
async function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map();

  /* End-of-central-directory, scanned backwards past any zip comment. */
  let end = bytes.length - 22;
  const floor = Math.max(0, bytes.length - 22 - 0xffff);
  while (end >= floor && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < floor) throw new ExtractError('That file looks like a zip but has no directory.');

  let entry = view.getUint32(end + 16, true);
  const count = view.getUint16(end + 10, true);

  for (let i = 0; i < count; i++) {
    if (view.getUint32(entry, true) !== 0x02014b50) break;
    const method = view.getUint16(entry + 10, true);
    const compressedSize = view.getUint32(entry + 20, true);
    const nameLength = view.getUint16(entry + 28, true);
    const extraLength = view.getUint16(entry + 30, true);
    const commentLength = view.getUint16(entry + 32, true);
    const localOffset = view.getUint32(entry + 42, true);
    const name = DECODER.decode(bytes.subarray(entry + 46, entry + 46 + nameLength));

    /* Only the parts we read are inflated; a .docx carries fonts and images
       that would cost more to decompress than the text is worth. */
    if (name === 'word/document.xml' || name === 'content.xml') {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = bytes.subarray(start, start + compressedSize);
      files.set(name, method === 0 ? raw : await inflateRaw(raw));
    } else {
      files.set(name, new Uint8Array(0));
    }
    entry += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ────────────────────────────────────────────────────────────────── docx ── */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const unescapeXml = (s) => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, code) => {
  if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? m;
  const n = code[1] === 'x' || code[1] === 'X'
    ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
  return Number.isFinite(n) ? String.fromCodePoint(n) : m;
});

/**
 * Word's XML, reduced to the structure a reader sees. Paragraphs become lines,
 * list paragraphs keep a bullet marker, and a table row becomes one
 * tab-separated line — a CV that lays its dates out in a table is common, and
 * the tab is what tells parse.js the date and the title belong together.
 *
 * A row only collapses to one line when every cell holds a single paragraph.
 * Layout tables — a heading in a narrow cell beside a cell holding half the
 * document — keep their paragraphs, or the whole CV would arrive as four very
 * long lines.
 */
function fromWordXml(xml) {
  const body = xml.slice(xml.indexOf('<w:body'));
  const lines = [];

  /* Cells being filled, innermost last. Tables nest, so this is a stack
     rather than a pair of variables. */
  const rows = [];
  const emit = (line) => {
    if (rows.length) rows[rows.length - 1].cells.push(line);
    else lines.push(line);
  };

  const TOKEN = /<w:tr[ >]|<\/w:tr>|<w:tc[ >]|<\/w:tc>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;
  for (const token of body.matchAll(TOKEN)) {
    const tag = token[0];

    if (tag.startsWith('<w:tr')) {
      rows.push({ cells: [], cellCount: 0, simple: true });
    } else if (tag === '</w:tr>') {
      const row = rows.pop();
      if (!row) continue;
      /* One paragraph per cell means a data row: it reads as a line. */
      const oneEach = row.simple && row.cells.length === row.cellCount;
      const filled = row.cells.filter((c) => c.trim());
      if (!filled.length) continue;
      if (oneEach) emit(filled.join('\t'));
      else filled.forEach(emit);
    } else if (tag.startsWith('<w:tc')) {
      const row = rows[rows.length - 1];
      if (row) { row.cellCount++; row.cellsAtStart = row.cells.length; }
    } else if (tag === '</w:tc>') {
      const row = rows[rows.length - 1];
      if (row && row.cells.length - (row.cellsAtStart ?? 0) > 1) row.simple = false;
    } else {
      emit(paragraphText(tag));
    }
  }

  return normalise(lines.join('\n'));
}

function paragraphText(block) {
  const parts = [];
  /* Order matters: text, tabs and breaks interleave inside a paragraph. */
  const RUN = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g;
  for (const token of block.matchAll(RUN)) {
    if (token[1] !== undefined) parts.push(unescapeXml(token[1]));
    else if (token[0].startsWith('<w:tab')) parts.push('\t');
    else parts.push('\n');
  }
  const line = parts.join('').replace(/[ \t]+$/gm, '');
  return /<w:numPr[ >]/.test(block) && line.trim() ? `\u2022 ${line.trim()}` : line;
}

/* ─────────────────────────────────────────────────────────────────── pdf ── */

/**
 * pdf.js is loaded on demand: a consultant who only ever opens .docx files
 * should never download a PDF engine.
 */
async function fromPdf(bytes) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;

  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(linesFromItems(content.items).join('\n'));
    page.cleanup();
  }
  await doc.destroy();

  const text = normalise(pages.join('\n'));
  if (!readable(text)) {
    throw new ExtractError(
      'No text could be read from that PDF. It is most likely a scan, which needs '
      + 'to be run through OCR first, or the original .docx.',
    );
  }
  return text;
}

async function loadPdfJs() {
  /* Outside a browser — the CLI, the test suite — pdf.js needs its legacy
     build, which does not reach for browser APIs. */
  if (typeof window === 'undefined') return import('pdfjs-dist/legacy/build/pdf.mjs');

  const pdfjs = await import('pdfjs-dist');
  /* Vite resolves this to a hashed asset; without it pdf.js falls back to a
     fake worker on the main thread and blocks the page on a long CV. */
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

/**
 * A PDF has no paragraphs, only positioned runs. Items are grouped into lines
 * by their baseline, and a wider-than-usual vertical step is treated as a new
 * block rather than a wrapped line.
 */
function linesFromItems(items) {
  const lines = [];
  let current = null;

  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = Math.round(item.transform[5] * 10) / 10;
    const x = item.transform[4];
    if (!current || Math.abs(current.y - y) > 2.5) {
      current = { y, runs: [] };
      lines.push(current);
    }
    current.runs.push({ x, str: item.str, width: item.width || 0 });
    if (item.hasEOL) current = null;
  }

  return lines.map(({ runs }) => {
    runs.sort((a, b) => a.x - b.x);
    let out = '';
    let cursor = null;
    for (const run of runs) {
      /* A gap much wider than a space is a column boundary, which is how a
         PDF renders the date column of a CV. */
      if (cursor !== null && run.x - cursor > 12) out += '\t';
      else if (out && !/\s$/.test(out) && !/^\s/.test(run.str)) out += ' ';
      out += run.str;
      cursor = run.x + run.width;
    }
    return out.trim();
  }).filter((l) => l.length);
}

/* ─────────────────────────────────────────────────────────────────── rtf ── */

function fromRtf(rtf) {
  let out = rtf
    .replace(/\\\*\\[a-z]+(?:-?\d+)?[ ]?(?:\{[^{}]*\})?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\\par[d]?\b/gi, '\n')
    .replace(/\\line\b/gi, '\n')
    .replace(/\\tab\b/gi, '\t')
    .replace(/\\'([0-9a-f]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\s?\??/g, (m, code) => {
      const n = parseInt(code, 10);
      return String.fromCharCode(n < 0 ? n + 65536 : n);
    })
    .replace(/\\[a-z]+(-?\d+)?[ ]?/gi, '');
  return normalise(out);
}

/* ─────────────────────────────────────────────────────────── legacy .doc ── */

/**
 * Word 97–2003 stores text in an OLE compound file behind a piece table. Rather
 * than implement that format, this pulls the readable runs out and lets the
 * caller judge the result — hence the readable() check at the call site and the
 * warning that goes with a document read this way.
 */
function fromLegacyDoc(bytes) {
  const runs = [];
  let run = [];

  /* Word 97 text is UTF-16LE, so ASCII characters appear as byte, 0x00. */
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (code === 13 || code === 7 || code === 11) {
      if (run.length > 2) runs.push(run.join(''));
      run = [];
    } else if (code === 9 || (code >= 32 && code < 0xd800) || code > 0xdfff) {
      run.push(String.fromCharCode(code));
    } else {
      if (run.length > 2) runs.push(run.join(''));
      run = [];
    }
    if (run.length > 4000) { runs.push(run.join('')); run = []; }
  }
  if (run.length > 2) runs.push(run.join(''));

  const text = runs
    .map((line) => line.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter((line) => line.length > 1 && /[A-Za-z]/.test(line))
    /* Word keeps its own bookkeeping in the same stream; these are its
       markers, not the candidate's CV. */
    .filter((line) => !/^(HYPERLINK|PAGE|MERGEFORMAT|TOC|SYMBOL|EMBED|Normal\.dotm?|Microsoft|Times New Roman|Calibri|Arial)\b/i.test(line))
    .join('\n');

  return normalise(text);
}

/* ───────────────────────────────────────────────────────────────── shared ── */

/** Is this text, or is it the bytes of something that is not? */
function readable(text) {
  if (!text || text.trim().length < 40) return false;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  return letters / text.length > 0.45;
}

function normalise(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();
}

function looksLikeGdocPointer(bytes) {
  if (bytes.length > 2048) return false;
  const text = DECODER.decode(bytes.subarray(0, 2048));
  return /"doc_id"|docs\.google\.com/.test(text) && /^\s*\{/.test(text);
}

export { extractText, extractFromFile, ExtractError };
