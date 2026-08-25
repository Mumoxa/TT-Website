/* ============================================================================
   TALENT TREE — CV TEXT TO CANDIDATE RECORD
   ----------------------------------------------------------------------------
   ISOMORPHIC. Pure function, no I/O.

     const { cv, gaps } = parseCv(text);

   Reads a candidate's own CV — whatever shape they wrote it in — and fills as
   much of the record as the text actually supports.

   WHAT IT WILL NOT DO. It never invents a value to satisfy a house rule. A CV
   that gives "2019 – 2021" gives years, and no amount of parsing turns that
   into months; the range is kept as written, raised as a gap, and the
   validator blocks the build until a person resolves it with the candidate.
   That friction is the house rule working, not a parser failing.

   Everything it produces is a first draft for the editor. The consultant reads
   it against the original — the part no parser can do — which is why every
   uncertainty comes back in `gaps` rather than being quietly resolved.
   ========================================================================== */

import { REDACTION_DEFAULTS } from './redact.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const MONTH_INDEX = new Map();
MONTHS.forEach((name, i) => {
  MONTH_INDEX.set(name.toLowerCase(), i);
  MONTH_INDEX.set(name.slice(0, 3).toLowerCase(), i);
});
MONTH_INDEX.set('sept', 8);

const NOW = /^(?:present|current|to date|ongoing|now|date)$/i;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /(?:\+?\d[\d\s()-]{7,}\d)/;
/* South African identity numbers are 13 digits. They must never reach a
   profile, so they are found in order to be dropped. */
const SA_ID = /\b\d{13}\b/;

/* ────────────────────────────────────────────────────────────── headings ── */

const SECTIONS = [
  ['profile', /^(?:professional\s+)?(?:profile|summary|career\s+summary|professional\s+summary|executive\s+summary|personal\s+summary|about\s+me|career\s+objective|objective|synopsis)$/],
  ['qualifications', /^(?:tertiary\s+|academic\s+|formal\s+)?(?:education|qualifications?|academic\s+(?:record|history)|educational\s+background)$/],
  ['certifications', /^(?:certifications?|certificates?|courses|short\s+courses|professional\s+development|training|accreditations?|licences|licenses)$/],
  ['skills', /^(?:technical\s+|core\s+|key\s+|it\s+|computer\s+)?(?:skills|competenc(?:y|ies)|capability|capabilities|proficiencies|systems|software|technologies|tools)$/],
  ['experience', /^(?:work\s+|professional\s+|employment\s+|career\s+|relevant\s+)?(?:experience|history|employment|record)$/],
  ['earlyCareer', /^(?:early\s+career|earlier\s+(?:career|roles|positions)|previous\s+(?:employment|positions|roles)|other\s+experience)$/],
  ['referees', /^(?:referees?|references?|contactable\s+referees?)$/],
  ['personal', /^(?:personal\s+(?:details|information|particulars)|contact\s+(?:details|information)|biographical\s+(?:details|information))$/],
  ['ignore', /^(?:interests|hobbies|activities|declaration|signature|attachments|table\s+of\s+contents|index)$/],
];

/* Words that make a line an employer rather than a job title. */
const EMPLOYER_HINTS = /\b(?:\(pty\)|pty|ltd|limited|inc|incorporated|plc|group|holdings|bank|insurance|consulting|consultancy|solutions|services|technologies|systems|university|college|institute|municipality|department|council|agency|partners|associates|corporation|corp|company|co\.)\b/i;

/* Words that make a line a job title rather than an employer. */
const TITLE_HINTS = /\b(?:analyst|manager|engineer|developer|consultant|officer|specialist|administrator|assistant|coordinator|director|head|lead|supervisor|technician|accountant|actuary|scientist|architect|designer|advisor|adviser|controller|auditor|clerk|intern|graduate|trainee|executive|president|principal|associate|partner|representative|agent|planner|strategist|programmer|tester|writer|editor|nurse|teacher|attorney|paralegal|broker|underwriter|buyer|foreman|artisan|operator|driver)\b/i;

const ACHIEVEMENT_HEADING = /^(?:key\s+)?(?:achievements?|accomplishments?|highlights?|key\s+contributions?|key\s+deliverables?)\s*:?$/i;
const RESPONSIBILITY_HEADING = /^(?:key\s+)?(?:responsibilities|duties|role|functions|key\s+duties|main\s+duties|areas\s+of\s+responsibility)\s*:?$/i;
const LEAVING_HEADING = /^reasons?\s+for\s+leaving\s*:?/i;
const CONTEXT_HEADING = /^(?:about\s+the\s+(?:company|employer)|company\s+(?:profile|overview|description)|employer\s+context)\s*:?$/i;

const BULLET = /^[\u2022\u25cf\u25aa\u25e6\u2043\u2219*+\u2013\u2014-]\s+/;

/* ═══════════════════════════════════════════════════════════════════ run ══ */

/**
 * @param {string} text        the CV, as extracted
 * @param {object} [options]   { mode: 'agency' | 'direct' }
 * @returns {{cv: object, gaps: string[]}}
 */
function parseCv(text, options = {}) {
  const gaps = [];
  const lines = (text || '').split('\n').map((l) => l.replace(/\s+$/, ''));
  const blocks = segment(lines);

  const cv = emptyRecord(options.mode === 'direct' ? 'direct' : 'agency');

  readPersonal(cv, blocks, gaps);
  cv.professionalSummary = readProfile(blocks.profile);
  cv.qualifications = readStudy(blocks.qualifications);
  cv.certifications = readStudy(blocks.certifications);
  cv.technicalSkills = readSkills(blocks.skills);
  cv.experience = readExperience(blocks.experience, gaps);
  cv.earlyCareer = readEarlyCareer(blocks.earlyCareer);

  /* A CV nearly always leads with the current title, and the consultant
     re-points it at the role being applied for. */
  cv.meta.targetRole = currentTitle(cv) || '';

  if (blocks.referees.some((l) => l.trim())) {
    gaps.push('The CV had a referees section. It has been left out — a formal '
      + 'recruitment profile carries none, and the client asks you rather than the candidate.');
  }
  if (!cv.professionalSummary.length) {
    gaps.push('No profile section was found. The house minimum is four bullets, so write them '
      + 'from the experience below.');
  }
  if (!cv.experience.length) {
    gaps.push('No employment history could be read. Check the original — if the dates are in a '
      + 'layout the parser could not follow, the roles need entering by hand.');
  }
  if (!cv.personal.fullName) gaps.push('No candidate name was found at the top of the CV.');

  return { cv, gaps };
}

function emptyRecord(mode) {
  return {
    meta: { targetRole: '', fileName: '', mode, reference: '' },
    redact: { ...REDACTION_DEFAULTS },
    personal: {
      fullName: '', citizenship: '', languages: '', dateOfBirth: '',
      areaOfResidence: '', availability: '', driversLicence: '', ownTransport: '',
      email: '', phone: '', areaAlias: '',
    },
    consultant: {
      contactPerson: 'Graham Glintenkamp',
      contactNumber: '072 7400 439',
      emailAddress: 'CV@talenttree.co.za',
    },
    professionalSummary: [],
    careerSummary: [],
    qualifications: [],
    certifications: [],
    technicalSkills: [{ group: '', items: [] }],
    experience: [],
    earlyCareer: [],
  };
}

/* ─────────────────────────────────────────────────────────── segmenting ── */

/** Splits the CV at its own headings. Anything above the first one is the
    masthead, where the name and contact details live. */
function segment(lines) {
  const blocks = {
    head: [], profile: [], qualifications: [], certifications: [], skills: [],
    experience: [], earlyCareer: [], referees: [], personal: [], ignore: [],
  };
  let current = 'head';

  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) { current = heading; continue; }
    blocks[current].push(line);
  }
  return blocks;
}

function headingOf(line) {
  const raw = line.trim();
  if (!raw || raw.length > 64) return null;
  /* A heading with content on the same line is a field, not a heading. */
  const cleaned = raw.replace(/^[\u2022\u25cf*\-\u2013]\s*/, '').replace(/[:\s]+$/, '').toLowerCase();
  if (!cleaned || /[.!?]$/.test(raw)) return null;
  if (cleaned.split(/\s+/).length > 5) return null;

  /* A personal field label is not a section heading, however much
     "Availability" or "Languages" looks like one on its own line. */
  if (FIELDS.some(([, pattern]) => pattern.test(cleaned))) return null;

  for (const [name, pattern] of SECTIONS) {
    if (pattern.test(cleaned)) return name;
  }
  return null;
}

/* ───────────────────────────────────────────────────────────── personal ── */

const FIELDS = [
  ['fullName', /^(?:full\s+)?names?(?:\s+(?:and|&)\s+surnames?)?$/],
  ['citizenship', /^(?:citizenship|nationality|citizen)$/],
  ['languages', /^(?:languages?|language\s+proficiency|home\s+language)$/],
  ['dateOfBirth', /^(?:date\s+of\s+birth|d\.?o\.?b\.?|birth\s?date|born)$/],
  ['areaOfResidence', /^(?:address|residential\s+address|area(?:\s+of\s+residence)?|location|residence|city|suburb|based\s+in)$/],
  ['availability', /^(?:availability|available(?:\s+from)?|notice(?:\s+period)?|start\s+date)$/],
  ['driversLicence', /^(?:driver'?s?\s+licen[cs]e|licen[cs]e|drivers?)$/],
  ['ownTransport', /^(?:own\s+transport|transport|vehicle)$/],
  ['email', /^(?:e-?mail(?:\s+address)?)$/],
  ['phone', /^(?:cell(?:phone)?(?:\s+(?:number|no\.?))?|mobile(?:\s+(?:number|no\.?))?|tel(?:ephone)?(?:\s+(?:number|no\.?))?|phone(?:\s+(?:number|no\.?))?|contact(?:\s+(?:number|no\.?))?)$/],
];

function readPersonal(cv, blocks, gaps) {
  const p = cv.personal;
  const source = [...blocks.head, ...blocks.personal];

  /* "Date of birth: 18 March 1985", "Date of birth<tab>18 March 1985", and a
     label on its own line above its value all read the same way. */
  for (let i = 0; i < source.length; i++) {
    const line = source[i].trim();
    if (!line) continue;

    const split = line.match(/^([^:\t]{2,40})[:\t]\s*(.+)$/);
    const label = (split ? split[1] : line).trim().replace(/[:\s]+$/, '').toLowerCase();
    let value = split ? split[2].trim() : '';
    if (!value && i + 1 < source.length) {
      const next = (source[i + 1] || '').trim();
      /* Only when the next line is a value rather than another label. */
      if (next && !FIELDS.some(([, re]) => re.test(next.replace(/[:\s]+$/, '').toLowerCase()))) {
        value = next;
      }
    }
    if (!value) continue;

    for (const [field, pattern] of FIELDS) {
      if (!pattern.test(label) || p[field]) continue;
      p[field] = cleanValue(field, value);
      break;
    }
  }

  const joined = source.join('\n');
  if (!p.email) p.email = (joined.match(EMAIL) || [''])[0];
  if (!p.phone) {
    const candidate = joined.split('\n').map((l) => (l.match(PHONE) || [''])[0]).find(Boolean);
    if (candidate && !SA_ID.test(candidate.replace(/\D/g, ''))) p.phone = candidate.trim();
  }
  if (!p.fullName) p.fullName = guessName(blocks.head);

  if (!p.dateOfBirth && SA_ID.test(joined)) {
    gaps.push('The CV carries a South African ID number. It has not been copied across — a '
      + 'profile never shows one — but it means the date of birth can be confirmed from the '
      + 'original rather than asked for.');
  }

  /* In agency mode the client contacts the consultant, so the validator
     rejects a candidate's own details. They are found and dropped here rather
     than left to fail the check later. */
  if (cv.meta.mode !== 'direct' && (p.email || p.phone)) {
    p.email = '';
    p.phone = '';
    gaps.push('The candidate\u2019s email and phone number were left out: on an agency profile '
      + 'the client contacts the consultant. Switch to "the candidate sends it themselves" if '
      + 'this CV is theirs to send.');
  }

  /* Most CVs put the address under the name with no label at all. */
  if (!p.areaOfResidence) {
    const pieces = blocks.head.flatMap((raw) => raw.split(/\s*[|\u2022\u25cf]\s*/));
    const inline = pieces.find((piece) => {
      const part = piece.trim();
      if (!part || part.length > 60 || part === p.fullName) return false;
      if (EMAIL.test(part) || PHONE.test(part)) return false;
      return part.split(',').length === 2 && /^[A-Z]/.test(part) && !TITLE_HINTS.test(part);
    });
    if (inline) p.areaOfResidence = inline.trim();
  }

  if (!p.areaOfResidence) {
    const address = blocks.head.find((raw) => {
      const line = raw.trim();
      if (!line || line.length > 90 || line === p.fullName) return false;
      if (EMAIL.test(line) || /^\+?\d[\d\s()-]{6,}$/.test(line)) return false;
      return line.split(',').length >= 2
        && /\b(?:street|road|avenue|drive|lane|close|crescent|way|park|bay|town|city|ville|burg|dorp|kloof|fontein|view|heights|suburbs?)\b/i.test(line);
    });
    if (address) p.areaOfResidence = address.trim();
  }
  if (p.areaOfResidence) p.areaOfResidence = suburbAndCity(p.areaOfResidence);
}

function cleanValue(field, value) {
  const text = value.replace(/^[\s:\u2013\u2014-]+/, '').trim();
  if (field === 'dateOfBirth') return tidyDate(text);
  if (field === 'driversLicence' || field === 'ownTransport') return tidyYesNo(text);
  return text;
}

const tidyYesNo = (v) => (/^(y|yes|true)$/i.test(v.trim()) ? 'Yes'
  : /^(n|no|none|false)$/i.test(v.trim()) ? 'No' : v.trim());

/** "18/03/1985" and "1985-03-18" become "18 March 1985"; anything else is
    left exactly as the candidate wrote it. */
function tidyDate(value) {
  const dmy = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const month = MONTHS[Number(m) - 1];
    if (month) return `${Number(d)} ${month} ${fullYear(y)}`;
  }
  const ymd = value.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (ymd) {
    const month = MONTHS[Number(ymd[2]) - 1];
    if (month) return `${Number(ymd[3])} ${month} ${ymd[1]}`;
  }
  return value;
}

const fullYear = (y) => (y.length === 4 ? y : Number(y) > 30 ? `19${y}` : `20${y}`);

/** A profile carries suburb and city, never a street address. */
function suburbAndCity(value) {
  const parts = value.split(/,|\n/).map((s) => s.trim()).filter(Boolean);
  const kept = parts.filter((part) => !/^\d/.test(part)
    && !/\b(street|road|avenue|drive|lane|close|crescent|boulevard|way|unit|flat|apartment|erf|plot)\b/i.test(part)
    && !/^\d{4}$/.test(part));
  return (kept.length ? kept : parts).slice(-2).join(', ');
}

/**
 * The name is the first line that reads like one: two to four capitalised
 * words, no digits, not a document title.
 */
function guessName(head) {
  const NOT_A_NAME = /^(?:curriculum\s+vitae|cv|r[ée]sum[ée]|personal\s+details|profile|confidential)/i;
  for (const raw of head.slice(0, 12)) {
    const line = raw.trim().replace(/^(?:full\s+)?names?\s*[:\t]\s*/i, '');
    if (!line || line.length > 60 || NOT_A_NAME.test(line)) continue;
    if (/[\d@]/.test(line)) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) continue;
    if (!words.every((w) => /^[A-Z\u00c0-\u00de]/.test(w) || /^(?:van|der|den|de|du|le|la|von|bin|al)$/i.test(w))) continue;
    if (TITLE_HINTS.test(line)) continue;
    return line.replace(/\s+/g, ' ');
  }
  return '';
}

/* ────────────────────────────────────────────────────────────── profile ── */

function readProfile(lines) {
  return rewrap(lines)
    .map((l) => l.replace(BULLET, '').trim())
    .filter((l) => l.length > 20)
    .map((l) => (/[.!?]$/.test(l) ? l : `${l}.`));
}

/**
 * A PDF wraps a paragraph across several lines. A line that does not end a
 * sentence, followed by one that does not start one, is the same sentence.
 */
function rewrap(lines) {
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { out.push(''); continue; }
    const previous = out[out.length - 1];
    const continues = previous
      && previous !== ''
      && !BULLET.test(line)
      && !/[.!?:]$/.test(previous)
      && /^[a-z(,]/.test(line);
    if (continues) out[out.length - 1] = `${previous} ${line}`;
    else out.push(line);
  }
  return out.filter(Boolean);
}

/* ─────────────────────────────────────────────── study and certificates ── */

const YEAR = /\b(19[5-9]\d|20[0-4]\d)\b/;
const INSTITUTION_HINT = /\b(?:university|universiteit|college|institute|academy|school|technikon|tvet|unisa|sacap|damelin|varsity|seta|saica|saipa|cima|acca)\b/i;

/**
 * Qualifications arrive in every arrangement there is — year first, year last,
 * year on its own line, institution on the next. This reads an entry at a
 * time and decides which part is which by what it looks like, not by position.
 */
function readStudy(lines) {
  const entries = [];
  let current = null;
  const push = () => { if (current && current.name) entries.push(current); current = null; };

  for (const raw of rewrap(lines)) {
    const line = raw.replace(BULLET, '').trim();
    if (!line) { push(); continue; }

    /* A bare year opens a new entry: the award is on the lines below it. */
    if (/^\(?(19[5-9]\d|20[0-4]\d)\)?[\s:.\u2013\u2014-]*$/.test(line)) {
      push();
      current = { year: (line.match(YEAR) || [''])[0], name: '', institution: '', institutionAlias: '', notes: [] };
      continue;
    }

    const parts = line.split(/\t|\s{2,}|\s+[-\u2013\u2014|]\s+|(?<=[a-z\)])\s*,\s*(?=[A-Z])/)
      .map((s) => s.trim()).filter(Boolean);
    const year = (line.match(YEAR) || [''])[0];

    if (!current || current.name) {
      /* A note attaches to the entry above rather than starting a new one. */
      if (current && /^(?:specialisation|specialization|majors?|subjects?|modules?|thesis|dissertation|distinction|cum laude|in progress|completed)\b/i.test(line)) {
        current.notes.push(line);
        continue;
      }
      /* An institution on its own line belongs to the entry above. */
      if (current && !current.institution && INSTITUTION_HINT.test(line) && parts.length === 1) {
        current.institution = stripYear(line);
        continue;
      }
      push();
      current = { year, name: '', institution: '', institutionAlias: '', notes: [] };
    } else if (year && !current.year) {
      current.year = year;
    }

    const named = parts.map(stripYear).filter(Boolean);
    if (!named.length) continue;

    const institutionAt = named.findIndex((part) => INSTITUTION_HINT.test(part));
    if (institutionAt >= 0 && named.length > 1) {
      current.institution = named[institutionAt];
      current.name = named.filter((_, i) => i !== institutionAt).join(', ');
    } else if (named.length > 1) {
      current.name = named[0];
      current.institution = named.slice(1).join(', ');
    } else {
      current.name = named[0];
    }
  }
  push();

  /* Most recent first, which is the house rule and what the validator checks. */
  return entries.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
}

const stripYear = (s) => s.replace(/\(?\b(19[5-9]\d|20[0-4]\d)\b\)?/g, '').replace(/^[\s:,.\u2013\u2014-]+|[\s:,.\u2013\u2014-]+$/g, '').trim();

/* ─────────────────────────────────────────────────────────────── skills ── */

function readSkills(lines) {
  const items = [];
  for (const raw of lines) {
    const line = raw.replace(BULLET, '').trim();
    if (!line) continue;
    /* Skills come as bullets, comma lists, pipe lists or tab columns. */
    line.split(/[,;|\t\u2022\u25cf]|\s{3,}/)
      .map((s) => s.replace(/^[\s\u2013\u2014-]+|[.\s]+$/g, '').trim())
      .filter((s) => s.length > 1 && s.length <= 60 && /[A-Za-z]/.test(s))
      .forEach((s) => items.push(s));
  }

  const seen = new Set();
  const unique = items.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [{ group: '', items: unique }];
}

/* ─────────────────────────────────────────────────────────── experience ── */

/**
 * Employment is read in two passes, because a CV names an employer before it
 * dates it. The first pass finds every line carrying a date range; those are
 * the anchors. The second reads each block: the one or two lines directly
 * above the anchor are its heading, and everything below belongs to it until
 * the next block's heading begins.
 *
 * Which half of the heading is the employer is decided by what the words look
 * like — "Ltd" or "Group" makes an employer, "Analyst" or "Manager" makes a
 * title — and where neither is obvious the upper line is taken as the
 * employer, which is how most CVs are laid out.
 */
function readExperience(lines, gaps) {
  const source = rewrap(lines).map((l) => l.trim());
  const anchors = [];

  for (let i = 0; i < source.length; i++) {
    const range = readRange(source[i]);
    if (!range || isBullet(source[i])) continue;
    anchors.push({ at: i, range, rest: withoutRange(source[i], range) });
  }
  if (!anchors.length) return [];

  /* How far above the anchor its heading reaches. A heading line is short,
     is not a bullet, does not end a sentence and is not a sub-heading. */
  const headingStart = (anchor, previousEnd) => {
    let start = anchor.at;
    while (start - 1 > previousEnd && isHeadingLine(source[start - 1]) && anchor.at - start < 2) start--;
    return start;
  };

  const blocks = [];
  let previousEnd = -1;
  anchors.forEach((anchor, index) => {
    const start = headingStart(anchor, previousEnd);
    const next = anchors[index + 1];
    const end = next ? headingStart(next, anchor.at) - 1 : source.length - 1;
    blocks.push({ anchor, heading: source.slice(start, anchor.at), body: source.slice(anchor.at + 1, end + 1) });
    previousEnd = end;
  });

  const roles = [];
  for (const block of blocks) {
    const previous = roles[roles.length - 1];
    /* A second range under an open employer, with no employer of its own, is
       another title held there — which is how a promotion reads. */
    if (previous && !block.heading.length && block.anchor.rest
        && TITLE_HINTS.test(block.anchor.rest) && !EMPLOYER_HINTS.test(block.anchor.rest)
        && !sameSpan(previous.duration, block.anchor.range.text)) {
      previous.titles.push({ title: block.anchor.rest, duration: block.anchor.range.text });
      previous.duration = widen(previous.duration, block.anchor.range.text);
      previous._precision = worst(previous._precision, block.anchor.range.precision);
      readBody(previous, block.body);
      continue;
    }
    roles.push(readBlock(block));
  }

  return roles.map((role) => finishRole(role, gaps));
}

const withoutRange = (line, range) => line.replace(range.matched, ' ').replace(/[\t|]+/g, ' ')
  .replace(/^[\s:,\u2013\u2014-]+|[\s:,\u2013\u2014-]+$/g, '').trim();

function isHeadingLine(line) {
  if (!line || line.length > 80 || isBullet(line)) return false;
  if (ACHIEVEMENT_HEADING.test(line) || RESPONSIBILITY_HEADING.test(line)
      || CONTEXT_HEADING.test(line) || LEAVING_HEADING.test(line)) return false;
  return !/[.!?]$/.test(line);
}

function readBlock(block) {
  const { anchor, heading } = block;
  const parts = [...heading, ...(anchor.rest ? [anchor.rest] : [])];

  let employer = parts.find((p) => EMPLOYER_HINTS.test(p)) || '';
  let title = parts.find((p) => p !== employer && TITLE_HINTS.test(p)) || '';
  if (!employer) employer = parts.find((p) => p !== title) || '';

  const role = {
    employer,
    duration: anchor.range.text,
    alias: '',
    titles: title ? [{ title, duration: anchor.range.text }] : [],
    context: '',
    reasonForLeaving: '',
    responsibilities: [],
    achievements: [],
    _precision: anchor.range.precision,
  };
  readBody(role, block.body);
  return role;
}

/** Everything under an employer's heading: sub-headings switch the bucket,
    bullets fill it, and a sentence about the company is context. */
function readBody(role, body) {
  let bucket = 'responsibilities';
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    if (!line) continue;

    if (ACHIEVEMENT_HEADING.test(line)) { bucket = 'achievements'; continue; }
    if (RESPONSIBILITY_HEADING.test(line)) { bucket = 'responsibilities'; continue; }
    if (CONTEXT_HEADING.test(line)) { bucket = 'context'; continue; }
    if (LEAVING_HEADING.test(line)) {
      const inline = line.replace(LEAVING_HEADING, '').replace(/^[\s:\u2013-]+/, '').trim();
      role.reasonForLeaving = inline || (body[i + 1] || '').trim();
      if (!inline) i++;
      continue;
    }

    if (isBullet(line)) {
      role[bucket === 'context' ? 'responsibilities' : bucket].push(line.replace(BULLET, '').trim());
      continue;
    }
    if (bucket === 'context' || (!role.context && looksLikeProse(line))) {
      role.context = role.context ? `${role.context} ${line}` : line;
      if (bucket === 'context') continue;
      continue;
    }
    if (!role.titles.length && TITLE_HINTS.test(line)) {
      role.titles.push({ title: line, duration: role.duration });
      continue;
    }
    if (!role.employer && EMPLOYER_HINTS.test(line)) { role.employer = line; continue; }
    role[bucket === 'context' ? 'responsibilities' : bucket].push(line);
  }
}

function finishRole(role, gaps) {
  const label = role.employer || role.titles[0]?.title || 'a role';

  /* "2019 - Present" against titles that start "Jul 2019" is a tenure the CV
     already states, only in the rows below. Reading it off them is arithmetic
     over stated facts, not a month invented to satisfy the format. */
  if (role._precision === 'year' && role.titles.length) {
    const spans = role.titles.map((t) => t.duration).filter(Boolean);
    const monthly = spans.every((span) => /^[A-Z][a-z]+ \d{4} \u2013 (?:Present|[A-Z][a-z]+ \d{4})$/.test(span));
    if (monthly && spans.length) {
      const derived = spans.reduce((a, b) => widen(a, b));
      if (coversSameYears(role.duration, derived)) {
        role.duration = derived;
        role._precision = 'month';
      }
    }
  }

  if (role._precision === 'year') {
    gaps.push(`${label}: the CV gives years only ("${role.duration}"). Confirm the months with `
      + 'the candidate — the profile prints "Month YYYY \u2013 Month YYYY".');
  } else if (role._precision === 'none') {
    gaps.push(`${label}: no dates could be read. Confirm the tenure with the candidate.`);
  }
  if (!role.employer) {
    gaps.push(`A role dated "${role.duration}" has no employer against it. Check the original.`);
  }
  if (!role.titles.length && role.employer) {
    gaps.push(`${role.employer}: no job title could be read.`);
  }

  const clean = { ...role };
  delete clean._precision;
  delete clean._raw;
  clean.responsibilities = tidyBullets(role.responsibilities);
  clean.achievements = tidyBullets(role.achievements);
  clean.context = role.context.trim();
  return clean;
}

/** House style: a bullet is a fragment opening on a verb, with no full stop. */
const tidyBullets = (list) => list
  .map((b) => b.replace(BULLET, '').replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, ''))
  .filter((b) => b.length > 3)
  .map((b) => b.charAt(0).toUpperCase() + b.slice(1));

const isBullet = (line) => BULLET.test(line);

/** Prose describes the employer; a fragment describes the work. */
const looksLikeProse = (line) => line.length > 90 && /[.]/.test(line) && /\s(?:is|was|are|were|provides|operates|specialises|specializes|offers)\s/i.test(line);

/**
 * Early career is a date, a title and an employer, in whatever order and
 * across however many lines the CV puts them. An entry opens on a date range
 * and takes the lines under it until the next one.
 */
function readEarlyCareer(lines) {
  const roles = [];
  let current = null;

  const place = (value) => {
    if (!current || !value) return;
    if (!current.title && TITLE_HINTS.test(value)) current.title = value;
    else if (!current.employer && current.title) current.employer = value;
    else if (!current.title) current.title = value;
    else if (!current.employer) current.employer = value;
  };

  for (const raw of rewrap(lines)) {
    const line = raw.replace(BULLET, '').trim();
    if (!line) continue;

    const range = readRange(line);
    if (range) {
      current = { title: '', employer: '', duration: range.text, alias: '' };
      roles.push(current);
      /* The tabs are the column boundaries here, so unlike withoutRange() they
         are kept: they are what separates the title from the employer. */
      line.replace(range.matched, '')
        .split(/\t|\s{2,}|\s+[-\u2013\u2014|]\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach(place);
      continue;
    }
    if (!current) {
      current = { title: '', employer: '', duration: '', alias: '' };
      roles.push(current);
    }
    line.split(/\t|\s{2,}/).map((part) => part.trim()).filter(Boolean).forEach(place);
  }

  return roles.filter((r) => r.title || r.employer);
}

function currentTitle(cv) {
  const first = cv.experience[0];
  if (first && first.titles.length) return first.titles[0].title;
  return first && first.employer ? '' : (cv.earlyCareer[0] || {}).title || '';
}

/* ──────────────────────────────────────────────────────────────── dates ── */

const MONTH_WORD = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const SEPARATOR = '\\s*(?:\u2013|\u2014|-|to|until|till)\\s*';
const ENDPOINT = `(?:${MONTH_WORD}\\s*[\\s./-]?\\s*\\d{2,4}|\\d{1,2}[/.-]\\d{4}|\\d{4}[/.-]\\d{1,2}|\\d{4}|present|current|to date|ongoing|now)`;
const RANGE = new RegExp(`(${ENDPOINT})${SEPARATOR}(${ENDPOINT})`, 'i');

/**
 * Reads whatever date range a line carries and reports how precise it was.
 * Month precision becomes the house format; year precision is passed through
 * untouched, because turning "2019" into "January 2019" would be inventing a
 * fact the CV never stated.
 *
 * @returns {{text: string, precision: 'month'|'year', matched: string}|null}
 */
function readRange(line) {
  const match = line.match(RANGE);
  if (!match) return null;
  const from = readEndpoint(match[1]);
  const to = readEndpoint(match[2]);
  if (!from || !to) return null;

  if (from.month !== null && (to.month !== null || to.present)) {
    return {
      text: `${MONTHS[from.month]} ${from.year} \u2013 ${to.present ? 'Present' : `${MONTHS[to.month]} ${to.year}`}`,
      precision: 'month',
      matched: match[0],
    };
  }
  return { text: match[0].replace(/\s*[-\u2014]\s*/, ' \u2013 ').trim(), precision: 'year', matched: match[0] };
}

function readEndpoint(text) {
  const value = text.trim();
  if (NOW.test(value)) return { present: true, month: null, year: null };

  const worded = value.match(new RegExp(`^(${MONTH_WORD})\\s*[\\s./-]?\\s*(\\d{2,4})$`, 'i'));
  if (worded) {
    const month = MONTH_INDEX.get(worded[1].toLowerCase().slice(0, 4))
      ?? MONTH_INDEX.get(worded[1].toLowerCase().slice(0, 3));
    if (month === undefined) return null;
    return { present: false, month, year: Number(fullYear(worded[2])) };
  }

  const numeric = value.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 12) {
    return { present: false, month: Number(numeric[1]) - 1, year: Number(numeric[2]) };
  }
  const reversed = value.match(/^(\d{4})[/.-](\d{1,2})$/);
  if (reversed && Number(reversed[2]) >= 1 && Number(reversed[2]) <= 12) {
    return { present: false, month: Number(reversed[2]) - 1, year: Number(reversed[1]) };
  }
  if (/^\d{4}$/.test(value)) return { present: false, month: null, year: Number(value) };
  return null;
}

const sameSpan = (a, b) => a && b && a.trim() === b.trim();

/** Only accept a derived tenure that starts and ends in the years the CV
    actually gave, so a missing title cannot silently move an employment date. */
function coversSameYears(stated, derived) {
  const years = (s) => (s.match(/\d{4}/g) || []).map(Number);
  const [statedFrom, statedTo] = years(stated);
  const [derivedFrom, derivedTo] = years(derived);
  if (statedFrom !== derivedFrom) return false;
  const statedPresent = /present/i.test(stated);
  const derivedPresent = /present/i.test(derived);
  if (statedPresent || derivedPresent) return statedPresent && derivedPresent;
  return statedTo === derivedTo;
}
const worst = (a, b) => (a === 'none' || b === 'none' ? 'none' : a === 'year' || b === 'year' ? 'year' : 'month');

/** An employer's tenure spans every title held there. */
function widen(employerRange, titleRange) {
  if (!employerRange) return titleRange;
  const [fromA, toA] = employerRange.split(' \u2013 ');
  const [fromB, toB] = titleRange.split(' \u2013 ');
  const start = order(fromA) <= order(fromB) ? fromA : fromB;
  const end = /present/i.test(toA) || /present/i.test(toB)
    ? 'Present'
    : (order(toA) >= order(toB) ? toA : toB);
  return `${start} \u2013 ${end}`;
}

function order(endpoint) {
  if (!endpoint) return 0;
  if (/present/i.test(endpoint)) return Infinity;
  const match = endpoint.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const month = MONTH_INDEX.get(match[1].toLowerCase()) ?? 0;
    return Number(match[2]) * 12 + month;
  }
  const year = endpoint.match(/\d{4}/);
  return year ? Number(year[0]) * 12 : 0;
}

export { parseCv };
