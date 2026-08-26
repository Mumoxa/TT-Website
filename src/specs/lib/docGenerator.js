/**
 * Document generation for sanitized job specs
 * Produces professional DOCX and PDF-ready outputs
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
  WidthType,
  VerticalAlign,
  ShadingType,
  ImageRun,
  PageNumber,
} from "docx";

// Logo handling - synchronous import of base64 logo (same as cv-builda)
import { logoBytes as getLogoBytes, LOGO_WIDTH as LOGO_W, LOGO_HEIGHT as LOGO_H } from "../../cv-builda/cv/logo.js";

// Branding links (intentional — our own brand, never client data)
const APPLY_EMAIL = "CV@talenttree.co.za";
const APPLY_EMAIL_HREF = `mailto:${APPLY_EMAIL}`;
// Capture group is REQUIRED: String.split only returns the match itself at
// odd indices when the pattern captures it (without, matches are deleted).
const APPLY_EMAIL_SPLIT_RE = /(CV@talenttree\.co\.za)/gi;
const SITE_URL = "https://talenttree.co.za";

const LOGO_WIDTH = LOGO_W;
const LOGO_HEIGHT = LOGO_H;

function getLogo() {
  try {
    const bytes = getLogoBytes();
    if (bytes && bytes.length > 100) {
      return { bytes, width: LOGO_WIDTH, height: LOGO_HEIGHT };
    }
  } catch {}
  return null;
}

// ── Design tokens ─────────────────────────────────────────────────────────
const COLORS = {
  deep: "071E2E",
  navy: "0E3A57",
  cyan: "12B5E5",
  ink: "2B3944",
  muted: "7C8B97",
  line: "C3D5E0",
  hair: "E4EDF3",
  paper: "F5F2EB",
};

const FONTS = {
  sans: "Calibri",
  display: "Calibri Light",
  mono: "Consolas",
  serif: "Cambria",
};

const SIZES = {
  title: 56,
  h1: 32,
  h2: 26,
  h3: 22,
  body: 22,
  small: 18,
  tiny: 16,
  mono: 18,
};

const PAGE = { width: 11906, height: 16838 };
const MARGINS = { top: 1000, right: 1200, bottom: 1000, left: 1200, header: 500, footer: 500, gutter: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────

const NONE = { style: BorderStyle.NONE, size: 0, color: "auto" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const NO_CELL_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };

function blank(after = 0, line = 240) {
  return new Paragraph({ spacing: { after, before: 0, line }, children: [] });
}

function run(text, style = {}) {
  return new TextRun({
    text,
    font: style.font || FONTS.sans,
    size: style.size || SIZES.body,
    color: style.color || COLORS.ink,
    bold: Boolean(style.bold),
    italics: Boolean(style.italics),
    allCaps: Boolean(style.caps),
    characterSpacing: style.spacing,
    ...(style.underline ? { underline: {} } : {}),
  });
}

// Split text on the application email so every occurrence becomes a
// clickable mailto: hyperlink. Splitting with a capture keeps the matched
// text at odd indices, preserving its original casing in the display.
function textChildren(text, style = {}) {
  const parts = String(text).split(APPLY_EMAIL_SPLIT_RE);
  const children = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      if (part) children.push(run(part, style));
    } else {
      children.push(
        new ExternalHyperlink({
          link: APPLY_EMAIL_HREF,
          children: [run(part, { ...style, color: COLORS.cyan, underline: true })],
        })
      );
    }
  });
  return children;
}

// Paragraph whose text is plain, except the site name which links to the
// TalentTree website (used for the logo fallback).
function siteLink(text, style = {}, pPr = {}) {
  return new Paragraph({
    spacing: { after: pPr.after ?? 120, before: pPr.before ?? 0, line: pPr.line ?? 276 },
    children: [
      new ExternalHyperlink({
        link: SITE_URL,
        children: [run(text, style)],
      }),
    ],
  });
}

function para(text, style = {}, pPr = {}) {
  if (!text || !text.trim()) return blank(pPr.after || 0);
  return new Paragraph({
    spacing: { after: pPr.after ?? 120, before: pPr.before ?? 0, line: pPr.line ?? 276 },
    alignment: pPr.alignment,
    indent: pPr.indent,
    border: pPr.border,
    children: textChildren(text.trim(), style),
  });
}

function eyebrow(text, color = COLORS.muted, opts = {}) {
  return para(text, { font: FONTS.mono, size: SIZES.tiny, color, caps: true, spacing: 60 },
    { after: opts.after ?? 60, before: opts.before ?? 0, line: 240 });
}

function heading(text, level = 2) {
  const sizes = { 1: SIZES.title, 2: SIZES.h1, 3: SIZES.h2 };
  const colors = { 1: COLORS.deep, 2: COLORS.navy, 3: COLORS.navy };
  return para(text, 
    { font: FONTS.display, size: sizes[level] || SIZES.h2, color: colors[level] || COLORS.navy, bold: level <= 2 },
    { after: level === 1 ? 200 : 140, before: level === 1 ? 0 : 280, line: level === 1 ? 600 : 320 }
  );
}

function bodyPara(text) {
  return para(text, { size: SIZES.body, color: COLORS.ink }, { after: 140, line: 300 });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80, line: 276 },
    indent: { left: 360, hanging: 260 },
    children: textChildren(text, { size: SIZES.body, color: COLORS.ink }),
  });
}

function rule(color = COLORS.line, size = 4, after = 200) {
  return new Paragraph({
    spacing: { after, before: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size, color, space: 0 } },
    children: [],
  });
}

// ── Content structuring ───────────────────────────────────────────────────

function structureContent(sanitizedText, customCompanyDesc = null, customDescriptor = null) {
  const lines = sanitizedText.split("\n").map(l => l.trim()).filter(Boolean);
  const sections = [];
  let currentSection = { title: "Overview", content: [] };
  
  const headingPatterns = [
    { pattern: /^(?:about\s+(?:the\s+)?(?:company|client|organisation|organization|business|role))[:\-]?\s*$/i, title: "About Our Client" },
    { pattern: /^(?:role|position|job)\s+(?:overview|summary|description)[:\-]?\s*$/i, title: "Role Overview" },
    { pattern: /^(?:key\s+)?responsibilities[:\-]?\s*$/i, title: "Key Responsibilities" },
    { pattern: /^(?:requirements|qualifications|what\s+we'?re\s+looking\s+for|ideal\s+candidate|you\s+will\s+have)[:\-]?\s*$/i, title: "Requirements" },
    { pattern: /^(?:skills|experience|competencies)[:\-]?\s*$/i, title: "Skills & Experience" },
    { pattern: /^(?:benefits|what\s+we\s+offer|offer|package|remuneration)[:\-]?\s*$/i, title: "What We Offer" },
    { pattern: /^(?:location|work\s+arrangement|employment\s+type)[:\-]?\s*$/i, title: "Location & Type" },
    { pattern: /^(?:how\s+to\s+apply|application|apply|to\s+apply)[:\-]?\s*$/i, title: "How to Apply" },
  ];

  // Try to detect sections by headings
  for (const line of lines) {
    const isHeading = headingPatterns.find(h => h.pattern.test(line));
    if (isHeading) {
      if (currentSection.content.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: isHeading.title, content: [] };
    } else {
      currentSection.content.push(line);
    }
  }
  if (currentSection.content.length > 0) {
    sections.push(currentSection);
  }

  let structured = sections.length <= 1 && lines.length > 10 ? intelligentStructure(lines) : sections;

  // Inject custom company description if provided
  if (customCompanyDesc && customCompanyDesc.trim()) {
    const aboutIdx = structured.findIndex(s => s.title === "About Our Client");
    const customContent = customCompanyDesc.trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (aboutIdx >= 0) {
      // Replace existing About section with custom
      structured[aboutIdx] = { title: "About Our Client", content: customContent };
    } else {
      // Insert after title/overview
      const insertAt = structured.findIndex(s => s.isTitle) >= 0 ? 1 : 0;
      structured.splice(insertAt, 0, { title: "About Our Client", content: customContent });
    }
  }

  // If custom descriptor provided and no About section exists, create one from template or descriptor
  if (customDescriptor && !structured.some(s => s.title === "About Our Client") && !customCompanyDesc) {
    structured.splice(1, 0, { 
      title: "About Our Client", 
      content: [`${customDescriptor} with a strong market presence and commitment to excellence.`] 
    });
  }

  return structured;
}

function intelligentStructure(lines, customCompanyDesc = null, customDescriptor = null) {
  // Heuristic: first 1-2 lines = title, next paragraph = company, rest = role
  const sections = [];
  let title = lines[0] || "Confidential Opportunity";
  
  // Clean title
  title = title.replace(/^(?:job\s*title|position|role)\s*[:\-]\s*/i, "").trim();
  if (title.length > 100) title = title.slice(0, 100) + "...";
  
  sections.push({ title: "Role", content: [title], isTitle: true });

  // Find company description (usually after title, contains client descriptor)
  const clientIndex = lines.findIndex(l => 
    /(?:leading|national|major|global).*?(?:retailer|provider|company|group|organisation)/i.test(l)
  );
  
  if (customCompanyDesc && customCompanyDesc.trim()) {
    sections.push({ title: "About Our Client", content: customCompanyDesc.trim().split("\n").map(l=>l.trim()).filter(Boolean) });
  } else if (clientIndex > 0) {
    const companyContent = lines.slice(clientIndex, clientIndex + 4).join(" ");
    if (companyContent.length > 20) {
      sections.push({ title: "About Our Client", content: [companyContent] });
    }
  } else if (customDescriptor) {
    sections.push({ title: "About Our Client", content: [`${customDescriptor} with a strong market presence and commitment to excellence.`] });
  }

  // Remaining content
  const remainingStart = clientIndex > 0 ? clientIndex + 4 : 1;
  const remaining = lines.slice(remainingStart);
  
  if (remaining.length > 0) {
    // Try to split remaining into responsibilities and requirements by keywords
    const respKeywords = ["responsib", "duties", "you will", "role will", "key tasks"];
    const reqKeywords = ["require", "qualif", "experience", "skills", "must have", "essential", "desirable"];
    
    let respSection = [];
    let reqSection = [];
    let otherSection = [];
    let currentBucket = otherSection;

    for (const line of remaining) {
      const lower = line.toLowerCase();
      if (respKeywords.some(k => lower.includes(k)) && line.length < 80) {
        if (respSection.length === 0 && otherSection.length > 0) {
          respSection = [...otherSection];
          otherSection = [];
        }
        currentBucket = respSection;
        if (line.length < 80) continue;
      } else if (reqKeywords.some(k => lower.includes(k)) && line.length < 80) {
        currentBucket = reqSection;
        if (line.length < 80) continue;
      }
      currentBucket.push(line);
    }

    if (respSection.length > 0 || otherSection.length > 0) {
      sections.push({ 
        title: "Key Responsibilities", 
        content: respSection.length > 0 ? respSection : otherSection 
      });
    }
    if (reqSection.length > 0) {
      sections.push({ title: "Requirements", content: reqSection });
    }
    if (otherSection.length > 0 && respSection.length > 0) {
      sections.push({ title: "Additional Information", content: otherSection });
    }
  }

  // Always ensure How to Apply
  sections.push({
    title: "How to Apply",
    content: [
      "To apply for this opportunity, please send your CV to CV@talenttree.co.za",
      "All applications will be treated with strict confidentiality. Only shortlisted candidates will be contacted.",
    ]
  });

  return sections;
}

// ── Document composition ──────────────────────────────────────────────────

export function composeJobSpec(sanitizedText, metadata = {}) {
  const {
    originalFileName = "Job Brief",
    sanitizationLogs = [],
    companyDescriptor = null,
    customCompanyDescription = null,
    customDescriptor = null,
  } = metadata;

  const sections = structureContent(sanitizedText, customCompanyDescription, customDescriptor || companyDescriptor);
  
  // Extract title from first section or metadata
  const titleSection = sections.find(s => s.isTitle) || sections[0];
  const jobTitle = titleSection ? titleSection.content[0] : originalFileName.replace(/\.[^.]+$/, "");
  
  const docChildren = [];

  // ── Header branding ──
  docChildren.push(blank(100));

  // Logo + text branding — logo (and its text fallback) links to the site
  const logo = getLogo();
  const logoTextStyle = { font: FONTS.display, size: SIZES.h1, color: COLORS.navy, bold: true };
  if (logo && logo.bytes) {
    try {
      const imgData = typeof logo.bytes === "function" ? logo.bytes() : logo.bytes;
      // docx ImageRun expects Uint8Array
      const data = imgData instanceof Uint8Array ? imgData : new Uint8Array(imgData);
      docChildren.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new ExternalHyperlink({
              link: SITE_URL,
              children: [
                new ImageRun({
                  data,
                  type: "png",
                  transformation: { width: 110, height: Math.round(110 * logo.height / logo.width) },
                }),
              ],
            }),
          ],
        })
      );
    } catch (e) {
      console.warn("[Specs] Logo failed", e);
      docChildren.push(siteLink("TalentTree", logoTextStyle, { after: 60 }));
    }
  } else {
    docChildren.push(siteLink("TalentTree", logoTextStyle, { after: 60 }));
  }
  docChildren.push(eyebrow("Niche skills recruitment · Executive search · Est. 2013", COLORS.muted, { after: 200 }));

  docChildren.push(rule(COLORS.cyan, 8, 300));
  docChildren.push(blank(200));

  // Confidential badge
  docChildren.push(eyebrow("Confidential Opportunity", COLORS.cyan, { after: 100 }));
  
  // Job title
  docChildren.push(heading(jobTitle, 1));
  
  if (companyDescriptor) {
    docChildren.push(para(companyDescriptor, { size: SIZES.h3, color: COLORS.muted, italics: true }, { after: 200 }));
  }

  docChildren.push(rule(COLORS.line, 3, 400));
  docChildren.push(blank(200));

  // ── Content sections ──
  for (const section of sections) {
    if (section.isTitle) continue; // Already used as main title

    docChildren.push(heading(section.title, 2));
    
    for (const line of section.content) {
      if (!line.trim()) continue;

      // Preserve source intent: only explicit bullet markers become DOCX bullets.
      // Short prose and numbered focus-area labels remain normal paragraphs.
      const bulletMatch = line.match(/^[•\-\*]\s+(.+)$/);
      if (bulletMatch) {
        docChildren.push(bullet(bulletMatch[1].trim()));
      } else {
        docChildren.push(bodyPara(line));
      }
    }
    
    docChildren.push(blank(200));
  }

  // ── Footer note ──
  docChildren.push(blank(300));
  docChildren.push(rule(COLORS.hair, 3, 300));
  docChildren.push(blank(200));
  docChildren.push(
    para(
      "Presented by TalentTree — Niche skills recruitment and executive search, South Africa. Established 2013.",
      { font: FONTS.mono, size: SIZES.tiny, color: COLORS.muted },
      { after: 80 }
    )
  );
  docChildren.push(
    para(
      "This document has been sanitized to protect client confidentiality. All applications to CV@talenttree.co.za",
      { font: FONTS.mono, size: SIZES.tiny, color: COLORS.muted, italics: true },
      { after: 0 }
    )
  );

  // ── Document definition ──
  const doc = new Document({
    creator: "TalentTree Specs Generator",
    title: `${jobTitle} — Presented by TalentTree`,
    description: "Sanitized job description generated by TalentTree internal tool",
    styles: {
      default: {
        document: {
          run: { font: FONTS.sans, size: SIZES.body, color: COLORS.ink },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: PAGE,
            margin: MARGINS,
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                spacing: { after: 0, line: 240 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.hair, space: 1 } },
                children: [
                  new TextRun({ text: "TalentTree", font: FONTS.mono, size: SIZES.tiny, color: COLORS.navy, bold: true }),
                  new TextRun({ text: "  ·  Confidential", font: FONTS.mono, size: SIZES.tiny, color: COLORS.muted }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                spacing: { after: 0 },
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Presented by TalentTree  ·  ", font: FONTS.mono, size: SIZES.tiny, color: COLORS.muted }),
                  new ExternalHyperlink({
                    link: APPLY_EMAIL_HREF,
                    children: [new TextRun({ text: "CV@talenttree.co.za", font: FONTS.mono, size: SIZES.tiny, color: COLORS.cyan, underline: {} })],
                  }),
                  new TextRun({ text: "  ·  Page ", font: FONTS.mono, size: SIZES.tiny, color: COLORS.muted }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONTS.mono, size: SIZES.tiny, color: COLORS.muted }),
                  new TextRun({ text: " of ", font: FONTS.mono, size: SIZES.tiny, color: COLORS.muted }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONTS.mono, size: SIZES.tiny, color: COLORS.muted }),
                ],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  });

  return { doc, jobTitle, sections };
}

export function generateFileName(jobTitle, originalName) {
  const cleanTitle = (jobTitle || originalName || "Job Spec")
    .replace(/[^a-zA-Z0-9\s\-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 50)
    .replace(/_+$/, "");
  
  return `${cleanTitle}_TalentTree_Spec`;
}

// ── Plain text output ─────────────────────────────────────────────────────

export function generatePlainText(sanitizedText, metadata = {}) {
  const { jobTitle, customCompanyDescription, customDescriptor, companyDescriptor } = metadata;
  const sections = structureContent(sanitizedText, customCompanyDescription, customDescriptor || companyDescriptor);
  
  let output = "";
  output += "TALENTTREE — CONFIDENTIAL OPPORTUNITY\n";
  output += "========================================\n\n";
  
  if (jobTitle) {
    output += `${jobTitle.toUpperCase()}\n\n`;
  }

  for (const section of sections) {
    if (section.isTitle) continue;
    output += `${section.title.toUpperCase()}\n`;
    output += `${"-".repeat(section.title.length)}\n`;
    for (const line of section.content) {
      if (line.trim()) {
        output += `${line}\n`;
      }
    }
    output += "\n";
  }

  output += "\n";
  output += "----------------------------------------\n";
  output += "Presented by TalentTree\n";
  output += "Niche skills recruitment & Executive search — Est. 2013\n";
  output += "Apply: CV@talenttree.co.za\n";
  output += "This document has been sanitized to protect client confidentiality.\n";

  return output;
}
