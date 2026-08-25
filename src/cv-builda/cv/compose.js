/* ============================================================================
   TALENT TREE — CANDIDATE PROFILE COMPOSER
   ----------------------------------------------------------------------------
   ISOMORPHIC. Pure function, no I/O.

     import { compose, fileNameFor } from './compose.js';
     const blob = await Packer.toBlob(compose(candidateJson));

   Turns a validated record into the .docx a client receives. The layout is
   fixed on purpose: two consultants working on two candidates produce
   documents that match exactly, and that sameness is the product.

   THE IDENTITY IS NOT THE WEBSITE'S. The page at /cv-builda is warm cream,
   Fraunces and teal because it is part of talenttree.co.za. The document is
   navy, cyan, Calibri and Consolas because it is Talent Tree's candidate
   profile, read in Word by someone who has never seen the site. Two brands,
   two jobs — do not unify them.

   Redaction runs here, at compose time, never at save time. The record keeps
   the real employer, the real dates and the real person; a blind profile is
   the same record rendered through redact(). See redact.js.
   ========================================================================== */

import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeightRule, ImageRun,
  LevelFormat, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType,
  TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';

import { redact, flagsOf, ageBand } from './redact.js';
import { logoBytes, LOGO_WIDTH, LOGO_HEIGHT } from './logo.js';

/* ─────────────────────────────────────────────────────────────── palette ── */

const DEEP = '071E2E';   // cover spine, display type
const NAVY = '0E3A57';   // section labels, chip text, consultant name
const CYAN = '12B5E5';   // the signal: current role, eyebrows, bullets, rules
const INK = '2B3944';    // body text
const MUTED = '7C8B97';  // labels, institutions, past dates
const LINE = 'C3D5E0';   // the vertical rule beside every section
const HAIR = 'E4EDF3';   // employer-context rule, header underline
const CHIP = 'EFF5F9';   // capability chip fill

const SANS = 'Calibri';
const DISPLAY = 'Calibri Light';
const MONO = 'Consolas';

/* Half-points, because that is what OOXML counts in. */
const SZ = {
  name: 76, employer: 26, role: 24, lead: 24, body: 22, mono: 22,
  small: 19, date: 17, contact: 18, eyebrow: 15,
};

/* A4, and the two page geometries the document uses. */
const PAGE = { width: 11906, height: 16838 };
const COVER_MARGIN = { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0, gutter: 0 };
const BODY_MARGIN = { top: 1100, right: 1134, bottom: 1000, left: 1418, header: 620, footer: 460, gutter: 0 };

/* Content width inside the body margins: 11906 - 1418 - 1134. */
const CONTENT = 9354;
const LABEL_COL = 2400;
const GUTTER_COL = 420;
const BODY_COL = CONTENT - LABEL_COL - GUTTER_COL;

const CONFIDENTIALITY =
  'To ensure absolute confidentiality, no contact may be made with any Referee or Employer '
  + 'without the express permission of the Candidate. In order to protect a Candidate’s personal '
  + 'data no CV’s may be forwarded to any third party without our express written permission. '
  + 'All electronic copies of CV’s are to be securely stored (e.g. password protected) with any '
  + 'printed copies secured as confidential information. Acceptance of this CV constitutes '
  + 'acceptance of the Standard Terms and Conditions of Talent Tree, additional copies of which '
  + 'are available upon request.';

/* ─────────────────────────────────────────────────────────────── helpers ── */

const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;
const clean = (v) => (isFilled(v) ? v.trim() : '');

const NONE = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const NO_CELL_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const NO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 };

/** Every table in this document is invisible scaffolding, never a grid. */
function table(columnWidths, rows, width) {
  return new Table({
    columnWidths,
    width: { size: width || columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: NO_BORDERS,
    layout: TableLayoutType.FIXED,
    rows,
  });
}

function cell(width, children, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: opts.borders || NO_CELL_BORDERS,
    margins: opts.margins || NO_MARGINS,
    verticalAlign: opts.verticalAlign || VerticalAlign.TOP,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' } : undefined,
    children: children.length ? children : [blank()],
  });
}

/** An empty paragraph, used as vertical space. */
function blank(after = 0, line = 20) {
  return new Paragraph({ spacing: { after, before: 0, line }, children: [] });
}

/** Word requires a cell to end in a paragraph rather than a table. This one
    carries no spacing of its own, so it closes the cell without adding
    rhythm the layout did not ask for. */
function closer() {
  return new Paragraph({});
}

function run(text, style) {
  return new TextRun({
    text,
    font: style.font || SANS,
    size: style.size || SZ.body,
    color: style.color || INK,
    bold: Boolean(style.bold),
    italics: Boolean(style.italics),
    allCaps: Boolean(style.caps),
    characterSpacing: style.spacing,
  });
}

function para(text, style = {}, pPr = {}) {
  return new Paragraph({
    spacing: { after: pPr.after ?? 0, before: pPr.before ?? 0, line: pPr.line ?? 276 },
    alignment: pPr.alignment,
    indent: pPr.indent,
    border: pPr.border,
    children: isFilled(text) ? [run(text, style)] : [],
  });
}

/** The small letter-spaced Consolas caps used for every label in the document. */
function eyebrow(text, color = MUTED, pPr = {}) {
  return para(text, { font: MONO, size: SZ.eyebrow, color, caps: true, spacing: 60 },
    { after: pPr.after ?? 0, before: pPr.before ?? 0, line: pPr.line ?? 240 });
}

/** A horizontal rule drawn as a paragraph's bottom border, inset from the right. */
function rule(color, size, indentRight, after) {
  return new Paragraph({
    spacing: { after, before: 0 },
    indent: { right: indentRight },
    border: { bottom: { style: BorderStyle.SINGLE, size, color, space: 0 } },
    children: [],
  });
}

const bullet = (text) => new Paragraph({
  numbering: { reference: 'tt-bullets', level: 0 },
  spacing: { after: 70, line: 276 },
  children: [run(text, { size: SZ.body, color: INK })],
});

/* ──────────────────────────────────────────────────────────────── cover ── */

/**
 * Page one of an agency profile: a full-bleed navy spine with a cyan band,
 * the mark, the candidate, and the consultant to contact. The candidate's own
 * details are never on it — that is the whole agency position.
 */
function cover(cv) {
  const p = cv.personal || {};
  const c = cv.consultant || {};
  const spine = table([820], [
    spineBand(5980, DEEP), spineBand(150, CYAN), spineBand(10708, DEEP),
  ]);

  const content = [
    blank(900),
    new Paragraph({
      spacing: { after: 60 },
      children: [new ImageRun({
        data: logoBytes(),
        type: 'png',
        transformation: { width: 132, height: Math.round(132 * LOGO_HEIGHT / LOGO_WIDTH) },
      })],
    }),
    blank(2600),
    eyebrow('Candidate profile', CYAN, { after: 220, line: 276 }),
    para(clean(p.fullName) || 'Candidate profile',
      { font: DISPLAY, size: SZ.name, color: DEEP }, { after: 130, line: 800 }),
    para(clean((cv.meta || {}).targetRole),
      { size: SZ.role, color: NAVY, caps: true, spacing: 70 }, { after: 200, line: 240 }),
    rule(CYAN, 10, 7436, 620),
    metaGrid(cv),
    blank(4700),
    rule(LINE, 4, 5936, 160),
    eyebrow('Presented by', MUTED, { after: 110, line: 276 }),
    para(clean(c.contactPerson), { bold: true, size: SZ.small, color: NAVY }, { after: 30 }),
  ];
  if (isFilled(c.contactNumber)) {
    content.push(para(clean(c.contactNumber), { font: MONO, size: SZ.contact, color: MUTED }, { after: 26 }));
  }
  if (isFilled(c.emailAddress)) {
    content.push(para(clean(c.emailAddress), { font: MONO, size: SZ.contact, color: MUTED }, { after: 26 }));
  }

  return table([820, 11086], [
    new TableRow({
      height: { value: PAGE.height, rule: HeightRule.EXACT },
      children: [
        cell(820, [spine, closer()], { fill: DEEP }),
        cell(11086, content, { margins: { top: 0, bottom: 0, left: 1250, right: 900 } }),
      ],
    }),
  ], PAGE.width);
}

function spineBand(height, fill) {
  return new TableRow({
    height: { value: height, rule: HeightRule.EXACT },
    children: [cell(820, [blank()], { fill })],
  });
}

/**
 * The facts a client screens on, two to a row. Which facts appear depends on
 * the record and on redaction: a hidden date of birth becomes an age band,
 * because a band is arithmetic rather than invention.
 */
function metaGrid(cv) {
  const p = cv.personal || {};
  const f = flagsOf(cv);
  const pairs = [];
  const add = (label, value) => { if (isFilled(value)) pairs.push([label, value.trim()]); };

  add('Citizenship', p.citizenship);
  add('Languages', p.languages);
  if (f.dateOfBirth) add('Age', p.ageBand || ageBand(p.dateOfBirth) || '');
  else add('Date of birth', p.dateOfBirth);
  add('Area of residence', p.areaOfResidence);
  add('Availability', p.availability);
  add('Driver’s licence', p.driversLicence);
  add('Own transport', p.ownTransport);
  /* Direct mode only: in agency mode the validator blocks these outright. */
  add('Email', p.email);
  add('Phone', p.phone);

  const rows = [];
  for (let i = 0; i < pairs.length || i === 0; i += 2) {
    rows.push(new TableRow({
      children: [
        cell(4218, metaField(pairs[i])),
        cell(500, [blank(0, 276)]),
        cell(4218, metaField(pairs[i + 1])),
      ],
    }));
  }
  return table([4218, 500, 4218], rows);
}

function metaField(pair) {
  if (!pair) return [blank(0, 276)];
  return [
    eyebrow(pair[0], MUTED, { after: 50, line: 240 }),
    para(pair[1], { size: SZ.small, color: INK }, { after: 0, line: 240 }),
  ];
}

/**
 * Page one of a direct profile. No cover and no consultant: the candidate is
 * sending this themselves, so the masthead carries their own contact line.
 */
function masthead(cv) {
  const p = cv.personal || {};
  const contact = [clean(p.email), clean(p.phone), clean(p.areaOfResidence)].filter(Boolean);
  return [
    para(clean(p.fullName), { font: DISPLAY, size: 52, color: DEEP }, { after: 60, line: 560 }),
    para(clean((cv.meta || {}).targetRole),
      { size: SZ.small, color: NAVY, caps: true, spacing: 70 }, { after: 140, line: 240 }),
    contact.length
      ? para(contact.join('   ·   '), { font: MONO, size: SZ.contact, color: MUTED }, { after: 200 })
      : blank(200),
    rule(CYAN, 10, 6800, 420),
  ];
}

/* ─────────────────────────────────────────────────────────────── sections ── */

/**
 * Every section is one row: a right-aligned label against a vertical rule,
 * then the content. The rule is the label cell's right border, so it grows
 * with the section instead of being drawn to a guessed length.
 */
function section(label, children) {
  return table([LABEL_COL, GUTTER_COL, BODY_COL], [
    new TableRow({
      cantSplit: false,
      children: [
        cell(LABEL_COL, [
          para(label, { bold: true, size: SZ.small, color: NAVY, caps: true, spacing: 26 },
            { after: 0, line: 240, alignment: AlignmentType.RIGHT }),
        ], {
          borders: { ...NO_CELL_BORDERS, right: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 0 } },
          margins: { top: 40, bottom: 0, left: 0, right: 200 },
        }),
        cell(GUTTER_COL, [blank(0, 276)]),
        cell(BODY_COL, children),
      ],
    }),
  ], CONTENT);
}

const sectionGap = () => blank(380);

function profileSection(cv) {
  const lines = cv.professionalSummary || [];
  if (!lines.length) return null;
  const [lead, ...rest] = lines;
  const children = [para(lead, { size: SZ.lead, color: NAVY }, { after: 200 })];
  rest.forEach((line) => children.push(bullet(line)));
  (cv.careerSummary || []).forEach((line) => children.push(bullet(line)));
  return section('Profile', children);
}

/** Qualifications and certifications share a shape: a year, then the award. */
function studySection(label, list, { italicNotes = true } = {}) {
  if (!list || !list.length) return null;
  const rows = list.map((q) => new TableRow({
    children: [
      cell(900, [para(clean(q.year), { font: MONO, size: SZ.mono, color: MUTED },
        { after: 0, alignment: AlignmentType.RIGHT })]),
      cell(260, [blank(0, 276)]),
      cell(5374, awardLines(q, italicNotes)),
    ],
  }));
  return section(label, [table([900, 260, 5374], rows), closer()]);
}

function awardLines(q, italicNotes) {
  const out = [para(clean(q.name), { bold: true, size: SZ.body, color: INK }, { after: 30 })];
  if (isFilled(q.institution)) {
    out.push(para(clean(q.institution), { size: SZ.small, color: MUTED }));
  }
  (q.notes || []).forEach((n) => {
    if (isFilled(n)) out.push(para(n.trim(), { size: SZ.small, color: MUTED, italics: italicNotes }));
  });
  return out;
}

/** Capability prints as chips, three to a row, with spacer rows between. */
function capabilitySection(cv) {
  const groups = (cv.technicalSkills || []).filter((g) => (g.items || []).some(isFilled));
  if (!groups.length) return null;

  const children = [];
  groups.forEach((g, gi) => {
    if (isFilled(g.group)) {
      children.push(eyebrow(g.group, CYAN, { after: 100, before: gi ? 220 : 0, line: 276 }));
    }
    children.push(chipGrid(g.items.filter(isFilled).map((s) => s.trim())));
  });
  children.push(closer());
  return section('Capability', children);
}

function chipGrid(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 3) {
    if (i) rows.push(chipSpacer());
    const trio = [items[i], items[i + 1], items[i + 2]];
    rows.push(new TableRow({
      children: [
        chip(trio[0]), cell(170, [blank(0, 276)]),
        chip(trio[1]), cell(170, [blank(0, 276)]),
        chip(trio[2]),
      ],
    }));
  }
  return table([2064, 170, 2064, 170, 2064], rows);
}

/** The gap between chip rows, drawn as an empty row rather than cell padding
    so the chips keep their fill height. */
function chipSpacer() {
  return new TableRow({
    children: [2064, 170, 2064, 170, 2064].map((w) => cell(w, [blank(0, 20)])),
  });
}

function chip(text) {
  /* A missing third chip keeps the cell but drops the fill, so the row width
     stays fixed and the grid does not reflow on the last line. */
  if (!isFilled(text)) {
    return cell(2064, [para('', { size: SZ.small, color: 'FFFFFF' }, { after: 0, line: 240 })]);
  }
  return cell(2064, [para(text, { size: SZ.small, color: NAVY }, { after: 0, line: 240 })], {
    fill: CHIP,
    margins: { top: 90, bottom: 90, left: 150, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
  });
}

/** One employer: name, tenure, the titles held inside it, then the detail. */
function employerBlock(r, index) {
  const out = [];
  if (index) out.push(blank(320));

  out.push(para(clean(r.employer), { font: DISPLAY, size: SZ.employer, color: DEEP }, { after: 40, line: 240 }));
  out.push(eyebrow(clean(r.duration), MUTED, { after: 150, line: 240 }));

  const titles = (r.titles || []).filter((t) => isFilled(t.title));
  /* A single title spanning the whole tenure would repeat the date line above
     it, so the duration is suppressed and only the title prints. */
  const single = titles.length === 1 && titles[0].duration === r.duration;
  if (titles.length) {
    out.push(table([3200, 260, 3074], titles.map((t, i) => new TableRow({
      children: [
        cell(3200, [para(single ? '' : clean(t.duration),
          { font: MONO, size: SZ.date, color: isCurrent(t.duration) ? CYAN : MUTED },
          { after: 0, alignment: AlignmentType.RIGHT })]),
        cell(260, [blank(0, 276)]),
        cell(3074, [para(clean(t.title),
          { size: SZ.body, color: i === 0 ? NAVY : INK, bold: i === 0 })]),
      ],
    }))));
  }

  if (isFilled(r.context)) {
    out.push(new Paragraph({
      spacing: { after: 60, before: 200, line: 276 },
      indent: { left: 220 },
      border: { left: { style: BorderStyle.SINGLE, size: 6, color: HAIR, space: 0 } },
      children: [run(r.context.trim(), { size: SZ.small, color: MUTED, italics: true })],
    }));
  }

  const achievements = (r.achievements || []).filter(isFilled);
  if (achievements.length) {
    out.push(eyebrow('Key achievements', CYAN, { after: 100, before: 220, line: 276 }));
    achievements.forEach((b) => out.push(bullet(b.trim())));
  }

  const responsibilities = (r.responsibilities || []).filter(isFilled);
  if (responsibilities.length) {
    out.push(eyebrow('Responsibilities', CYAN, { after: 100, before: 220, line: 276 }));
    responsibilities.forEach((b) => out.push(bullet(b.trim())));
  }

  if (isFilled(r.reasonForLeaving)) {
    out.push(eyebrow('Reason for leaving', MUTED, { after: 60, before: 220, line: 276 }));
    out.push(para(r.reasonForLeaving.trim(), { size: SZ.small, color: MUTED }));
  }

  return out;
}

const isCurrent = (duration) => isFilled(duration) && /Present\s*$/.test(duration);

function experienceSection(cv) {
  const list = (cv.experience || []).filter((r) => isFilled(r.employer) || (r.titles || []).length);
  if (!list.length) return null;
  const children = [];
  list.forEach((r, i) => employerBlock(r, i).forEach((el) => children.push(el)));
  return section('Experience', children);
}

/** Early career is a date and a role — no bullets, because nobody reads them. */
function earlyCareerSection(cv) {
  const list = (cv.earlyCareer || []).filter((r) => isFilled(r.title) || isFilled(r.employer));
  if (!list.length) return null;
  const rows = list.map((r) => new TableRow({
    children: [
      cell(3200, [para(clean(r.duration), { font: MONO, size: SZ.date, color: MUTED },
        { after: 0, alignment: AlignmentType.RIGHT })]),
      cell(260, [blank(0, 276)]),
      cell(3074, [
        para(clean(r.title), { bold: true, size: SZ.body, color: INK }, { after: 20 }),
        ...(isFilled(r.employer) ? [para(clean(r.employer), { size: SZ.small, color: MUTED })] : []),
      ]),
    ],
  }));
  return section('Early career', [table([3200, 260, 3074], rows), closer()]);
}

/* ═══════════════════════════════════════════════════════════════ document ══ */

/**
 * @param {object} cv a validated candidate record
 * @returns {Document} ready for Packer
 */
function compose(cv) {
  const data = redact(cv || {});
  const direct = ((data.meta || {}).mode) === 'direct';

  const body = [
    profileSection(data),
    studySection('Qualifications', data.qualifications),
    studySection('Certifications', data.certifications, { italicNotes: false }),
    capabilitySection(data),
    experienceSection(data),
    earlyCareerSection(data),
  ].filter(Boolean);

  /* NO REFEREES SECTION. A formal recruitment profile ends at the career
     history: the client asks the consultant, who asks the candidate, so a
     line promising referees on request spends a heading saying nothing. */

  const children = [];
  if (direct) masthead(data).forEach((el) => children.push(el));
  body.forEach((s, i) => {
    if (i) children.push(sectionGap());
    children.push(s);
  });

  const sections = [];
  if (!direct) {
    sections.push({
      properties: { page: { size: PAGE, margin: COVER_MARGIN } },
      children: [cover(data)],
    });
  }
  sections.push({
    properties: { page: { size: PAGE, margin: BODY_MARGIN }, titlePage: false },
    headers: { default: runningHead(data) },
    footers: { default: pageFooter(direct) },
    children: direct ? children : [blank(380), ...children],
  });

  return new Document({
    creator: 'Talent Tree',
    title: `${clean((data.personal || {}).fullName)} — candidate profile`,
    description: 'Generated by CV-Builda',
    numbering: { config: [bulletDefinition()] },
    styles: { default: { document: { run: { font: SANS, size: SZ.body, color: INK } } } },
    sections,
  });
}

function runningHead(cv) {
  const p = cv.personal || {};
  const role = clean((cv.meta || {}).targetRole);
  return new Header({
    children: [new Paragraph({
      spacing: { after: 0, line: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIR, space: 0 } },
      children: [
        run(clean(p.fullName), { font: MONO, size: SZ.eyebrow, color: NAVY, caps: true, spacing: 60 }),
        ...(role ? [run(`   ·   ${role}`,
          { font: MONO, size: SZ.eyebrow, color: MUTED, caps: true, spacing: 60 })] : []),
      ],
    })],
  });
}

/**
 * The confidentiality notice is an agency statement — it is Talent Tree
 * asking the client not to approach the candidate directly. On a CV the
 * candidate sends themselves it would be nonsense, so direct mode gets the
 * page numbers alone.
 */
function pageFooter(direct) {
  const children = [];
  if (!direct) {
    children.push(new Paragraph({
      spacing: { after: 60, line: 190 },
      alignment: AlignmentType.BOTH,
      children: [run(CONFIDENTIALITY, { size: SZ.eyebrow, color: MUTED })],
    }));
  }
  children.push(new Paragraph({
    spacing: { after: 0 },
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({ children: [PageNumber.CURRENT], font: MONO, size: SZ.eyebrow, color: CYAN }),
      new TextRun({ text: ' / ', font: MONO, size: SZ.eyebrow, color: LINE }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: MONO, size: SZ.eyebrow, color: MUTED }),
    ],
  }));
  return new Footer({ children });
}

/** An en dash in cyan, not a bullet glyph — the same mark the site uses. */
function bulletDefinition() {
  return {
    reference: 'tt-bullets',
    levels: [
      {
        level: 0,
        format: LevelFormat.BULLET,
        text: '–',
        alignment: AlignmentType.LEFT,
        style: {
          run: { font: SANS, size: SZ.body, color: CYAN },
          paragraph: { indent: { left: 300, hanging: 300 } },
        },
      },
      {
        level: 1,
        format: LevelFormat.BULLET,
        text: '·',
        alignment: AlignmentType.LEFT,
        style: {
          run: { font: SANS, size: SZ.body, color: LINE },
          paragraph: { indent: { left: 640, hanging: 280 } },
        },
      },
    ],
  };
}

/* ──────────────────────────────────────────────────────────── file name ── */

/**
 * Steyn_JJ_TalentTree_CV, or the name the consultant set. Derived rather than
 * required, so a record without meta.fileName still downloads sensibly.
 */
function fileNameFor(cv) {
  const meta = (cv && cv.meta) || {};
  if (isFilled(meta.fileName)) return meta.fileName.trim().replace(/\.docx$/i, '');

  const data = redact(cv || {});
  const name = clean((data.personal || {}).fullName) || 'Candidate';
  const parts = name.split(/\s+/).filter(Boolean);
  const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const initials = parts.slice(0, -1).map((w) => w[0].toUpperCase()).join('');
  const stem = [surname, initials].filter(Boolean).join('_').replace(/[^\w]+/g, '_');
  const suffix = (meta.mode === 'direct') ? 'CV_direct' : 'TalentTree_CV';
  return `${stem}_${suffix}`.replace(/_+/g, '_');
}

export { compose, fileNameFor };
