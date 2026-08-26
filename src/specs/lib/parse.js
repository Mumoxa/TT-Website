/**
 * File parsing for Specs Generator
 * Supports PDF, DOCX, XLSX, TXT, RTF, DOC, Google Docs links
 */

const DECODER = new TextDecoder("utf-8");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DECOMPRESSED_SIZE = 20 * 1024 * 1024; // 20MB decompressed limit to prevent zip bomb
const MAX_PDF_PAGES = 100;
const MAX_XLSX_SHEETS = 20;
const MAX_XLSX_ROWS = 10000;
const SUPPORTED_EXTENSIONS = ["pdf", "docx", "xlsx", "xls", "txt", "md", "rtf", "doc"];

class ParseError extends Error {
  constructor(message, code, guidance) {
    super(message);
    this.name = "ParseError";
    this.code = code;
    this.guidance = guidance;
  }
}

// ── Signature sniffing ────────────────────────────────────────────────────

const SIGS = [
  { format: "docx", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { format: "xlsx", bytes: [0x50, 0x4b, 0x03, 0x04] }, // same as docx, differentiated by content
  { format: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { format: "doc", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { format: "rtf", bytes: [0x7b, 0x5c, 0x72, 0x74] },
];

function sniff(bytes) {
  for (const sig of SIGS) {
    if (sig.bytes.every((b, i) => bytes[i] === b)) return sig.format;
  }
  return "text";
}

function validateFile(file) {
  if (!file) throw new ParseError("No file provided", "NO_FILE", "Please select a file to upload.");

  if (file.size === 0) {
    throw new ParseError("File is empty", "EMPTY_FILE", "The selected file contains no data.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new ParseError(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      "FILE_TOO_LARGE",
      `Maximum file size is ${MAX_FILE_SIZE / 1024 / 1024}MB. Try compressing the file or paste the text directly.`
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (ext && !SUPPORTED_EXTENSIONS.includes(ext) && !["gdoc", "csv"].includes(ext)) {
    throw new ParseError(
      `Unsupported format: .${ext}`,
      "UNSUPPORTED_FORMAT",
      `Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}. For Google Docs, use the link input instead.`
    );
  }

  return { ext, size: file.size };
}

// ── Core extraction ───────────────────────────────────────────────────────

export async function extractFromFile(file) {
  validateFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return extractText(bytes, file.name, ext);
}

export async function extractText(bytes, fileName = "", extHint = "") {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!input.length) throw new ParseError("File is empty", "EMPTY_FILE", "Please provide a file with content.");

  const name = String(fileName || "");
  const ext = extHint || (name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
  const notes = [];
  let format = sniff(input);

  // Differentiate docx vs xlsx (both are zips)
  if (format === "docx" || format === "xlsx") {
    const parts = await unzip(input);
    const hasWordDoc = parts.has("word/document.xml");
    const hasWorkbook = [...parts.keys()].some(k => k.includes("xl/workbook.xml") || k.includes("xl/worksheets/"));
    
    if (hasWorkbook) {
      format = "xlsx";
      return { text: await fromXlsx(parts, input), format, notes };
    }
    if (hasWordDoc) {
      format = "docx";
      return { text: fromWordXml(DECODER.decode(parts.get("word/document.xml"))), format, notes };
    }
    if ([...parts.keys()].some(k => k.startsWith("content.xml"))) {
      throw new ParseError(
        "OpenDocument format detected",
        "ODT_FORMAT",
        "Please save as .docx or PDF: File → Save As → Word Document"
      );
    }
    // Might be xlsx without workbook marker but with sheet
    if ([...parts.keys()].some(k => k.includes("worksheets"))) {
      return { text: await fromXlsx(parts, input), format: "xlsx", notes };
    }
    throw new ParseError("Unrecognized zip contents", "INVALID_ZIP", "The file doesn't contain a readable document.");
  }

  if (ext === "gdoc" || (format === "text" && looksLikeGdocPointer(input))) {
    throw new ParseError(
      "Google Docs shortcut",
      "GDOC_SHORTCUT",
      "This is a Google Docs link file, not the document itself. In Google Docs: File → Download → Microsoft Word (.docx), then upload that file. Or paste the share link in the Google Docs tab."
    );
  }

  if (format === "pdf") {
    return { text: await fromPdf(input), format: "pdf", notes };
  }

  if (format === "doc") {
    const text = fromLegacyDoc(input);
    if (!readable(text)) {
      throw new ParseError(
        "Legacy Word file unreadable",
        "LEGACY_DOC_UNREADABLE",
        "This .doc file couldn't be read reliably. Open in Word → File → Save As → .docx, then upload the .docx."
      );
    }
    notes.push("Read from legacy .doc - check formatting carefully");
    return { text, format: "doc", notes };
  }

  if (format === "rtf") {
    return { text: fromRtf(DECODER.decode(input)), format: "rtf", notes };
  }

  // Plain text fallback
  const text = DECODER.decode(input);
  if (!readable(text)) {
    throw new ParseError(
      `Cannot read as document${ext ? ` (.${ext})` : ""}`,
      "UNREADABLE",
      "Supported: PDF, DOCX, XLSX, TXT, RTF, DOC. If this is a scanned PDF, it needs OCR first."
    );
  }
  return { text: normalise(text), format: "text", notes };
}

// ── Zip handling ──────────────────────────────────────────────────────────

async function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map();

  let end = bytes.length - 22;
  const floor = Math.max(0, bytes.length - 22 - 0xffff);
  while (end >= floor && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < floor) throw new ParseError("Invalid zip structure", "INVALID_ZIP", "File appears corrupted.");

  let entry = view.getUint32(end + 16, true);
  const count = view.getUint16(end + 10, true);

  // Prevent zip bomb via too many entries
  if (count > 1000) {
    throw new ParseError("Zip contains too many entries", "ZIP_TOO_MANY_ENTRIES", "File appears to be malformed or a zip bomb.");
  }

  let totalDecompressed = 0;

  for (let i = 0; i < count; i++) {
    if (view.getUint32(entry, true) !== 0x02014b50) break;
    const method = view.getUint16(entry + 10, true);
    const compressedSize = view.getUint32(entry + 20, true);
    const uncompressedSize = view.getUint32(entry + 24, true);
    const nameLength = view.getUint16(entry + 28, true);
    const extraLength = view.getUint16(entry + 30, true);
    const commentLength = view.getUint16(entry + 32, true);
    const localOffset = view.getUint32(entry + 42, true);
    const name = DECODER.decode(bytes.subarray(entry + 46, entry + 46 + nameLength));

    // Zip bomb check: uncompressed size too large
    if (uncompressedSize > MAX_DECOMPRESSED_SIZE) {
      throw new ParseError("File too large when decompressed", "ZIP_BOMB", "Decompressed size exceeds limit, possible zip bomb.");
    }
    totalDecompressed += uncompressedSize;
    if (totalDecompressed > MAX_DECOMPRESSED_SIZE * 2) {
      throw new ParseError("Total decompressed size too large", "ZIP_BOMB", "File too large when decompressed.");
    }

    const shouldInflate =
      name === "word/document.xml" ||
      name === "content.xml" ||
      name.includes("xl/") ||
      name.includes("workbook") ||
      name.includes("sharedStrings") ||
      name.includes("worksheets/");

    if (shouldInflate) {
      try {
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const raw = bytes.subarray(start, start + compressedSize);
        const inflated = method === 0 ? raw : await inflateRaw(raw);
        // Check inflated size
        if (inflated.length > MAX_DECOMPRESSED_SIZE) {
          throw new ParseError("Decompressed entry too large", "ZIP_BOMB", "A file inside the archive is too large.");
        }
        files.set(name, inflated);
      } catch (e) {
        if (e instanceof ParseError) throw e;
        files.set(name, new Uint8Array(0));
      }
    } else {
      files.set(name, new Uint8Array(0));
    }
    entry += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

async function inflateRaw(bytes) {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    // Fallback for environments without DecompressionStream
    return bytes;
  }
}

// ── DOCX ──────────────────────────────────────────────────────────────────

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (s) =>
  s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, code) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? m;
    const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });

function fromWordXml(xml) {
  const body = xml.slice(xml.indexOf("<w:body"));
  const lines = [];
  const rows = [];
  const emit = (line) => {
    if (rows.length) rows[rows.length - 1].cells.push(line);
    else lines.push(line);
  };

  const TOKEN = /<w:tr[ >]|<\/w:tr>|<w:tc[ >]|<\/w:tc>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;
  for (const token of body.matchAll(TOKEN)) {
    const tag = token[0];
    if (tag.startsWith("<w:tr")) {
      rows.push({ cells: [], cellCount: 0, simple: true });
    } else if (tag === "</w:tr>") {
      const row = rows.pop();
      if (!row) continue;
      const oneEach = row.simple && row.cells.length === row.cellCount;
      const filled = row.cells.filter((c) => c.trim());
      if (!filled.length) continue;
      if (oneEach) emit(filled.join("\t"));
      else filled.forEach(emit);
    } else if (tag.startsWith("<w:tc")) {
      const row = rows[rows.length - 1];
      if (row) {
        row.cellCount++;
        row.cellsAtStart = row.cells.length;
      }
    } else if (tag === "</w:tc>") {
      const row = rows[rows.length - 1];
      if (row && row.cells.length - (row.cellsAtStart ?? 0) > 1) row.simple = false;
    } else {
      emit(paragraphText(tag));
    }
  }
  return normalise(lines.join("\n"));
}

function paragraphText(block) {
  const parts = [];
  const RUN = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g;
  for (const token of block.matchAll(RUN)) {
    if (token[1] !== undefined) parts.push(unescapeXml(token[1]));
    else if (token[0].startsWith("<w:tab")) parts.push("\t");
    else parts.push("\n");
  }
  const line = parts.join("").replace(/[ \t]+$/gm, "");
  return /<w:numPr[ >]/.test(block) && line.trim() ? `• ${line.trim()}` : line;
}

// ── PDF ───────────────────────────────────────────────────────────────────

async function fromPdf(bytes) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;

  if (doc.numPages > MAX_PDF_PAGES) {
    await doc.destroy();
    throw new ParseError(
      `PDF has too many pages (${doc.numPages})`,
      "PDF_TOO_MANY_PAGES",
      `Maximum ${MAX_PDF_PAGES} pages allowed. Split the document or paste text directly.`
    );
  }

  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(linesFromItems(content.items).join("\n"));
    page.cleanup();
  }
  await doc.destroy();

  const text = normalise(pages.join("\n"));
  if (!readable(text)) {
    throw new ParseError(
      "Scanned PDF - no text found",
      "SCANNED_PDF",
      "This PDF appears to be a scan. Please run through OCR first, or upload the original Word document."
    );
  }
  return text;
}

async function loadPdfJs() {
  if (typeof window === "undefined") return import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
  }
  return pdfjs;
}

function linesFromItems(items) {
  const lines = [];
  let current = null;

  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const y = Math.round(item.transform[5] * 10) / 10;
    const x = item.transform[4];
    if (!current || Math.abs(current.y - y) > 2.5) {
      current = { y, runs: [] };
      lines.push(current);
    }
    current.runs.push({ x, str: item.str, width: item.width || 0 });
    if (item.hasEOL) current = null;
  }

  return lines
    .map(({ runs }) => {
      runs.sort((a, b) => a.x - b.x);
      let out = "";
      let cursor = null;
      for (const run of runs) {
        if (cursor !== null && run.x - cursor > 12) out += "\t";
        else if (out && !/\s$/.test(out) && !/^\s/.test(run.str)) out += " ";
        out += run.str;
        cursor = run.x + run.width;
      }
      return out.trim();
    })
    .filter((l) => l.length);
}

// ── XLSX ──────────────────────────────────────────────────────────────────

async function fromXlsx(parts, rawBytes) {
  // Try using xlsx library if available (lazy load)
  try {
    const XLSX = await import("xlsx").catch(() => null);
    if (XLSX) {
      const workbook = XLSX.read(rawBytes, { type: "array" });
      if (workbook.SheetNames.length > MAX_XLSX_SHEETS) {
        throw new ParseError(
          `Spreadsheet has too many sheets (${workbook.SheetNames.length})`,
          "XLSX_TOO_MANY_SHEETS",
          `Maximum ${MAX_XLSX_SHEETS} sheets allowed.`
        );
      }
      let allText = "";
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (json.length > MAX_XLSX_ROWS) {
          console.warn(`Sheet ${sheetName} has ${json.length} rows, truncating to ${MAX_XLSX_ROWS}`);
        }
        const limitedJson = json.slice(0, MAX_XLSX_ROWS);
        const lines = limitedJson
          .map(row => row.filter(cell => cell != null && String(cell).trim() !== "").join("\t"))
          .filter(line => line.trim().length > 0);
        if (lines.length > 0) {
          allText += `\n--- Sheet: ${sheetName} ---\n` + lines.join("\n") + "\n";
        }
      }
      if (readable(allText)) return normalise(allText);
    }
  } catch (e) {
    if (e instanceof ParseError) throw e;
    console.warn("XLSX library parsing failed, falling back to XML parsing", e);
  }

  // Fallback: parse XML manually
  return fromXlsxManual(parts);
}

function fromXlsxManual(parts) {
  let text = "";
  const decoder = new TextDecoder();

  // Shared strings
  let sharedStrings = [];
  for (const [name, data] of parts) {
    if (name.includes("sharedStrings.xml") && data.length > 0) {
      try {
        const xml = decoder.decode(data);
        const matches = [...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)];
        sharedStrings = matches.map(m => m[1]);
      } catch {}
    }
  }

  // Worksheets
  for (const [name, data] of parts) {
    if (name.includes("worksheets/") && data.length > 0) {
      try {
        const xml = decoder.decode(data);
        const sheetName = name.split("/").pop()?.replace(".xml", "") || "Sheet";
        text += `\n--- ${sheetName} ---\n`;

        // Extract rows
        const rowMatches = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
        for (const rowMatch of rowMatches) {
          const rowXml = rowMatch[1];
          const cells = [];
          const cellMatches = [...rowXml.matchAll(/<c[^>]*>([\s\S]*?)<\/c>/g)];
          for (const cellMatch of cellMatches) {
            const cellXml = cellMatch[1];
            // Check if shared string
            const isSharedString = cellMatch[0].includes('t="s"');
            const vMatch = cellXml.match(/<v>([^<]*)<\/v>/);
            const tMatch = cellXml.match(/<t[^>]*>([^<]*)<\/t>/);
            
            if (tMatch) {
              cells.push(tMatch[1]);
            } else if (vMatch) {
              if (isSharedString) {
                const idx = parseInt(vMatch[1], 10);
                cells.push(sharedStrings[idx] || vMatch[1]);
              } else {
                cells.push(vMatch[1]);
              }
            }
          }
          if (cells.length > 0 && cells.some(c => c.trim())) {
            text += cells.join("\t") + "\n";
          }
        }
      } catch (e) {
        console.warn("Failed to parse worksheet", name, e);
      }
    }
  }

  if (!readable(text)) {
    throw new ParseError(
      "XLSX appears empty or unreadable",
      "XLSX_EMPTY",
      "The spreadsheet contains no readable text. Check that it has content in cells."
    );
  }

  return normalise(text);
}

// ── RTF, DOC, etc ─────────────────────────────────────────────────────────

function fromRtf(rtf) {
  let out = rtf
    .replace(/\\\*\\[a-z]+(?:-?\d+)?[ ]?(?:\{[^{}]*\})?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\\par[d]?\b/gi, "\n")
    .replace(/\\line\b/gi, "\n")
    .replace(/\\tab\b/gi, "\t")
    .replace(/\\'([0-9a-f]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\s?\??/g, (m, code) => {
      const n = parseInt(code, 10);
      return String.fromCharCode(n < 0 ? n + 65536 : n);
    })
    .replace(/\\[a-z]+(-?\d+)?[ ]?/gi, "");
  return normalise(out);
}

function fromLegacyDoc(bytes) {
  const runs = [];
  let run = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (code === 13 || code === 7 || code === 11) {
      if (run.length > 2) runs.push(run.join(""));
      run = [];
    } else if (code === 9 || (code >= 32 && code < 0xd800) || code > 0xdfff) {
      run.push(String.fromCharCode(code));
    } else {
      if (run.length > 2) runs.push(run.join(""));
      run = [];
    }
    if (run.length > 4000) {
      runs.push(run.join(""));
      run = [];
    }
  }
  if (run.length > 2) runs.push(run.join(""));

  const text = runs
    .map((line) => line.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter((line) => line.length > 1 && /[A-Za-z]/.test(line))
    .filter((line) => !/^(HYPERLINK|PAGE|MERGEFORMAT|TOC|SYMBOL|EMBED|Normal\.dotm?|Microsoft|Times New Roman|Calibri|Arial)\b/i.test(line))
    .join("\n");

  return normalise(text);
}

// ── Google Docs ───────────────────────────────────────────────────────────

export function parseGoogleDocsUrl(url) {
  if (!url) return null;
  const trimmed = url.trim();
  
  // Various Google Docs URL formats
  const patterns = [
    /docs\.google\.com\/document\/d\/([a-zA-Z0-9\-_]+)/,
    /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/,
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9\-_]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9\-_]+)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        id: match[1],
        isSpreadsheet: trimmed.includes("spreadsheets"),
        originalUrl: trimmed,
      };
    }
  }

  // Direct ID
  if (/^[a-zA-Z0-9\-_]{20,}$/.test(trimmed)) {
    return {
      id: trimmed,
      isSpreadsheet: false,
      originalUrl: trimmed,
    };
  }

  return null;
}

export async function fetchGoogleDoc(url) {
  const parsed = parseGoogleDocsUrl(url);
  if (!parsed) {
    throw new ParseError(
      "Invalid Google Docs link",
      "INVALID_GDOC_URL",
      "Please provide a valid Google Docs or Google Drive link. Example: https://docs.google.com/document/d/.../edit"
    );
  }

  // Try to fetch via export URL - this will likely fail due to CORS unless doc is public
  // We attempt it and provide clear guidance on failure
  const exportFormats = parsed.isSpreadsheet
    ? [
        `https://docs.google.com/spreadsheets/d/${parsed.id}/export?format=xlsx`,
        `https://docs.google.com/spreadsheets/d/${parsed.id}/export?format=csv`,
      ]
    : [
        `https://docs.google.com/document/d/${parsed.id}/export?format=docx`,
        `https://docs.google.com/document/d/${parsed.id}/export?format=txt`,
      ];

  let lastError;
  for (const exportUrl of exportFormats) {
    try {
      const response = await fetch(exportUrl, { mode: "cors", credentials: "omit" });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Document is not publicly accessible");
        }
        continue;
      }
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length === 0) continue;
      
      // Try to parse based on format
      const format = exportUrl.includes("docx") ? "docx" : exportUrl.includes("xlsx") ? "xlsx" : "text";
      if (format === "docx" || format === "xlsx") {
        const result = await extractText(bytes, `gdoc-export.${format}`, format);
        return { ...result, source: "google_docs", docId: parsed.id };
      } else {
        const text = DECODER.decode(bytes);
        if (readable(text)) {
          return { text: normalise(text), format: "text", notes: ["Fetched from Google Docs"], source: "google_docs", docId: parsed.id };
        }
      }
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  // If all fetches failed, provide actionable guidance
  throw new ParseError(
    "Cannot fetch Google Doc directly (CORS / permissions)",
    "GDOC_FETCH_FAILED",
    `The document could not be fetched automatically. This is expected due to Google's security.\n\n` +
    `To proceed:\n` +
    `1. Open the document in Google Docs\n` +
    `2. File → Download → Microsoft Word (.docx) for docs, or Microsoft Excel (.xlsx) for sheets\n` +
    `3. Upload the downloaded file here\n\n` +
    `Alternatively, make the document "Anyone with the link can view" and try again, or copy-paste the text into the "Paste Text" tab.\n\n` +
    `Doc ID detected: ${parsed.id}\n` +
    `Original error: ${lastError?.message || "CORS blocked"}`
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────

function readable(text) {
  if (!text || text.trim().length < 20) return false;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  return letters / text.length > 0.35;
}

function normalise(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .trim();
}

function looksLikeGdocPointer(bytes) {
  if (bytes.length > 2048) return false;
  const text = DECODER.decode(bytes.subarray(0, 2048));
  return /"doc_id"|docs\.google\.com/.test(text) && /^\s*\{/.test(text);
}

export { ParseError, validateFile, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS };
