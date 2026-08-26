/* ============================================================================
   TALENT TREE — CV TEXT TO CANDIDATE RECORD
   ----------------------------------------------------------------------------
   ISOMORPHIC. Pure function, no I/O.

     const { cv, gaps } = parseCv(text, options);

   Reads a candidate's own CV — whatever shape they wrote it in (Word, PDF,
   LinkedIn profile, plain text) — and fills as much of the record as the text
   supports with intelligent structural extraction.

   WHAT IT WILL NOT DO. It never invents dates to satisfy a house rule. A CV
   that gives "2019 – 2021" gives years, and that range is kept as written and
   raised as a gap so a consultant can confirm the months.

   WHAT IT DOES DO. If a CV lacks a profile section (the house minimum is 4
   bullets), it auto-synthesizes an initial draft based on the candidate's
   actual experience and skills so the record is not blocked by blank errors.
   The consultant can review, edit, or regenerate it with one click.
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
   profile, so they are found in order to be dropped and to verify DOB. */
const SA_ID = /\b\d{13}\b/;

/* ────────────────────────────────────────────────────────────── headings ── */

const SECTIONS = [
  ['profile', /^(?:(?:professional|career|executive|personal)\s+)?(?:profile|summary|overview|synopsis|about\s+me|about|introduction|career\s+objective|objective|biography|bio)(?:\s+(?:&|and)\s+(?:profile|summary|overview|highlights))?$/i],
  ['qualifications', /^(?:(?:tertiary|academic|formal|higher|postgraduate)\s+)?(?:education|qualifications?|academic\s+(?:record|history|background)|educational\s+(?:background|history)|degrees?|studies)(?:\s+(?:&|and)\s+(?:qualifications?|education|training|certifications?))?$/i],
  ['certifications', /^(?:certifications?|certificates?|short\s+courses|courses|professional\s+development|training|accreditations?|licen[cs]es|professional\s+certifications?)(?:\s+(?:&|and)\s+(?:courses|training|development|certifications?))?$/i],
  ['skills', /^(?:(?:technical|core|key|it|computer|professional)\s+)?(?:skills|competenc(?:y|ies)|capability|capabilities|proficiencies|systems|software|technologies|tools|areas\s+of\s+expertise|key\s+strengths)(?:\s+(?:&|and)\s+(?:expertise|proficiencies|tools|technologies|competencies|strengths))?$/i],
  ['experience', /^(?:(?:work|professional|employment|career|relevant|historical)\s+)?(?:experience|history|employment|record|background|positions\s+held|employment\s+details)(?:\s+(?:&|and)\s+(?:history|experience|achievements|highlights|background))?$/i],
  ['earlyCareer', /^(?:early\s+career|earlier\s+(?:career|roles|positions)|previous\s+(?:employment|positions|roles)|other\s+experience|historical\s+experience)$/i],
  ['referees', /^(?:referees?|references?|contactable\s+referees?|reference\s+list|testimonials?)$/i],
  ['personal', /^(?:personal\s+(?:details|information|particulars)|contact\s+(?:details|information|info)|biographical\s+(?:details|information|info)|general\s+information)$/i],
  ['ignore', /^(?:interests|hobbies|activities|declaration|signature|attachments|table\s+of\s+contents|index)$/i],
];

/* Words that make a line an employer rather than a job title. */
const EMPLOYER_HINTS = /\b(?:\(pty\)|pty|ltd|limited|inc|incorporated|plc|group|holdings|bank|insurance|consulting|consultancy|solutions|services|technologies|systems|university|college|institute|municipality|department|council|agency|partners|associates|corporation|corp|company|co\.|enterprises|hospital|school|academy|labs|media|studios|telecom|retail)\b/i;

/* Words that make a line a job title rather than an employer. */
const TITLE_HINTS = /\b(?:analyst|manager|engineer|developer|consultant|officer|specialist|administrator|assistant|coordinator|director|head|lead|supervisor|technician|accountant|actuary|scientist|architect|designer|advisor|adviser|controller|auditor|clerk|intern|graduate|trainee|executive|president|principal|associate|partner|representative|agent|planner|strategist|programmer|tester|writer|editor|nurse|teacher|attorney|paralegal|broker|underwriter|buyer|foreman|artisan|operator|driver|specialist|head\s+of|vice\s+president|vp|chief|cto|ceo|cfo|coo|scrum\s+master|product\s+owner)\b/i;

const ACHIEVEMENT_HEADING = /^(?:key\s+)?(?:achievements?|accomplishments?|highlights?|key\s+contributions?|key\s+deliverables?)\s*:?$/i;
const RESPONSIBILITY_HEADING = /^(?:key\s+)?(?:responsibilities|duties|role|functions|key\s+duties|main\s+duties|areas\s+of\s+responsibility)\s*:?$/i;
const LEAVING_HEADING = /^reasons?\s+for\s+leaving\s*:?/i;
const CONTEXT_HEADING = /^(?:about\s+the\s+(?:company|employer)|company\s+(?:profile|overview|description)|employer\s+context)\s*:?$/i;

const BULLET = /^[\u2022\u25cf\u25aa\u25e6\u2043\u2219*+\u2013\u2014\-▪▫➢✓+>]\s+/;

/* ═══════════════════════════════════════════════════════════════════ run ══ */

/**
 * @param {string} text        the CV text, as extracted
 * @param {object} [options]   { mode: 'agency' | 'direct', fileName?: string }
 * @returns {{cv: object, gaps: string[]}}
 */
function parseCv(text, options = {}) {
  const gaps = [];
  const rawText = text || '';
  const lines = rawText.split('\n').map((l) => l.replace(/\s+$/, ''));
  const blocks = segment(lines);

  const cv = emptyRecord(options.mode === 'direct' ? 'direct' : 'agency');

  readPersonal(cv, blocks, gaps, rawText, options.fileName || '');
  cv.professionalSummary = readProfile(blocks.profile);
  cv.qualifications = readStudy(blocks.qualifications);
  cv.certifications = readStudy(blocks.certifications);
  cv.technicalSkills = readSkills(blocks.skills);
  cv.experience = readExperience(blocks.experience, gaps, blocks.head);
  cv.earlyCareer = readEarlyCareer(blocks.earlyCareer);

  /* Fallback: if qualifications is empty but experience was found, search head/unsegmented */
  if (!cv.qualifications.length && blocks.head.length) {
    const studyFromHead = readStudy(blocks.head.filter((l) => /university|college|bcom|bsc|ba|diploma|degree|matric/i.test(l)));
    if (studyFromHead.length) cv.qualifications = studyFromHead;
  }

  /* Fallback: if skills is empty but found in head */
  if ((!cv.technicalSkills.length || !cv.technicalSkills[0]?.items?.length) && blocks.head.length) {
    const skillsFromHead = readSkills(blocks.head.filter((l) => /python|sql|java|react|excel|agile|aws|cloud/i.test(l)));
    if (skillsFromHead.length && skillsFromHead[0]?.items?.length) cv.technicalSkills = skillsFromHead;
  }

  /* Target role: derived from top experience title, early career, or top lines */
  cv.meta.targetRole = currentTitle(cv) || guessRoleFromHead(blocks.head) || '';

  /* If profile section was missing or has fewer than 4 bullets, auto-synthesize
     high-quality bullets to meet the house minimum (4 bullets) so the consultant
     does not have to draft from scratch. */
  if (cv.professionalSummary.length < 4) {
    const synthesized = synthesizeProfile(cv);
    if (!cv.professionalSummary.length) {
      cv.professionalSummary = synthesized;
      cv.professionalSummary._synthesized = true;
      gaps.push('Profile bullets were automatically drafted from the candidate’s experience and skills. Review and fine-tune them as needed.');
    } else {
      // Append synthesized bullets to reach the 4-bullet house minimum
      const missingCount = 4 - cv.professionalSummary.length;
      synthesized.slice(0, missingCount).forEach((b) => cv.professionalSummary.push(b));
      gaps.push('Profile had fewer than 4 bullets. Additional summary bullets were drafted from the experience to meet the house standard.');
    }
  }

  if (blocks.referees.some((l) => l.trim())) {
    gaps.push('The CV had a referees section. It has been left out — a formal '
      + 'recruitment profile carries none, and the client asks you rather than the candidate.');
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
      eeStatus: '', email: '', phone: '', areaAlias: '',
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
  const raw = (line || '').trim();
  if (!raw || raw.length > 75) return null;

  /* Clean leading numbering (1., 01., A., I.), symbols (•, *, ✦, ■, -, –, |, /, #), and trailing colons */
  const cleaned = raw
    .replace(/^[\u2022\u25cf*\-\u2013\u2014▪▫➢✓+>#|~]+\s*/, '')
    .replace(/^(?:\d{1,2}\.?|[A-Za-z]\.|\([A-Za-z0-9]+\))\s+/, '')
    .replace(/[:\s|~]+$/, '')
    .trim()
    .toLowerCase();

  if (!cleaned || /[.!?]$/.test(raw)) return null;
  if (cleaned.split(/\s+/).length > 6) return null;

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
  ['citizenship', /^(?:citizenship|nationality|citizen|country\s+of\s+citizenship)$/],
  ['languages', /^(?:languages?|language\s+proficiency|home\s+language|languages?\s+spoken)$/],
  ['dateOfBirth', /^(?:date\s+of\s+birth|d\.?o\.?b\.?|birth\s?date|born)$/],
  ['areaOfResidence', /^(?:address|residential\s+address|area(?:\s+of\s+residence)?|location|residence|city|suburb|based\s+in|living\s+in)$/],
  ['availability', /^(?:availability|available(?:\s+from)?|notice(?:\s+period)?|start\s+date)$/],
  ['driversLicence', /^(?:driver'?s?\s+licen[cs]e|licen[cs]e|drivers?)$/],
  ['ownTransport', /^(?:own\s+transport|transport|vehicle|own\s+car)$/],
  /* South African Employment Equity status. It is personal information, so it
     is captured only when a CV actually states it — never inferred. */
  ['eeStatus', /^(?:employment\s+equity(?:\s+status)?|ee(?:\s+status)?|equity\s+status|race|ethnicity|demographic\s+(?:status|group)|designated\s+group|designation)$/],
  ['email', /^(?:e-?mail(?:\s+address)?)$/],
  ['phone', /^(?:cell(?:phone)?(?:\s+(?:number|no\.?))?|mobile(?:\s+(?:number|no\.?))?|tel(?:ephone)?(?:\s+(?:number|no\.?))?|phone(?:\s+(?:number|no\.?))?|contact(?:\s+(?:number|no\.?))?)$/],
];

function readPersonal(cv, blocks, gaps, fullText, fileName) {
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

  const joined = `${source.join('\n')}\n${fullText}`;
  if (!p.email) p.email = (joined.match(EMAIL) || [''])[0];
  if (!p.phone) {
    const candidate = joined.split('\n').map((l) => (l.match(PHONE) || [''])[0]).find(Boolean);
    if (candidate && !SA_ID.test(candidate.replace(/\D/g, ''))) p.phone = candidate.trim();
  }

  /* Candidate name extraction */
  if (!p.fullName) p.fullName = guessName(blocks.head, fullText, fileName);

  /* SA ID Number: derive DOB automatically and drop ID for POPIA compliance */
  if (SA_ID.test(joined)) {
    const idMatch = (joined.match(SA_ID) || [''])[0];
    if (!p.dateOfBirth && idMatch) {
      const derivedDob = dobFromSaId(idMatch);
      if (derivedDob) p.dateOfBirth = derivedDob;
    }
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
        && /\b(?:street|road|avenue|drive|lane|close|crescent|way|park|bay|town|city|ville|burg|dorp|kloof|fontein|view|heights|suburbs?|gauteng|western\s+cape|kwazulu-natal|south\s+africa)\b/i.test(line);
    });
    if (address) p.areaOfResidence = address.trim();
  }
  if (p.areaOfResidence) p.areaOfResidence = suburbAndCity(p.areaOfResidence);
}

function dobFromSaId(id) {
  const clean = id.replace(/\D/g, '');
  if (clean.length !== 13) return null;
  const yy = parseInt(clean.slice(0, 2), 10);
  const mm = parseInt(clean.slice(2, 4), 10);
  const dd = parseInt(clean.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = yy > 30 ? 1900 + yy : 2000 + yy;
  return `${dd} ${MONTHS[mm - 1]} ${year}`;
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
 * Intelligent candidate name extraction from document text, header lines, or file name.
 */
function guessName(head, fullText = '', fileName = '') {
  const NOT_A_NAME = /^(?:curriculum\s+vitae|cv|r[ée]sum[ée]|personal\s+details|contact\s+details|profile|confidential|candidate\s+profile|candidate|presented\s+by|page\s+\d+|experience|education|summary)/i;

  /* 1. Explicit name label (e.g. "Name: John Doe", "Full Name: LeZaria Khumalo") */
  const explicit = head.concat((fullText || '').split('\n').slice(0, 20)).find((line) =>
    /^(?:full\s+)?names?\s*[:\t]\s*([A-Za-z\u00c0-\u00de\s'.-]{2,50})$/i.test(line.trim()));
  if (explicit) {
    const match = explicit.match(/^(?:full\s+)?names?\s*[:\t]\s*([A-Za-z\u00c0-\u00de\s'.-]{2,50})$/i);
    if (match && match[1].trim()) return match[1].trim();
  }

  /* 2. Top lines analysis */
  for (const raw of head.slice(0, 15)) {
    let line = raw.trim()
      .replace(/^(?:full\s+)?names?\s*[:\t]\s*/i, '')
      .replace(/^(?:curriculum\s+vitae\s+(?:of|for)|cv\s+(?:of|for)|resume\s+(?:of|for))\s*/i, '');

    if (!line || line.length > 60 || NOT_A_NAME.test(line)) continue;
    if (/@/.test(line) || /^\+?\d[\d\s()-]{6,}$/.test(line)) continue;

    /* If line has "Name - Title" or "Name | Title", extract the name part */
    if (/\s+[-–—|]\s+/.test(line)) {
      const parts = line.split(/\s+[-–—|]\s+/);
      if (parts.length === 2 && TITLE_HINTS.test(parts[1]) && !TITLE_HINTS.test(parts[0])) {
        line = parts[0].trim();
      }
    }

    if (/[\d]/.test(line)) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 6) continue;

    const validWords = words.every((w) =>
      /^[A-Za-z\u00c0-\u00de'-]+$/.test(w) || /^(?:van|der|den|de|du|le|la|von|bin|al|da|di|dos|st\.?)$/i.test(w));
    if (!validWords) continue;

    if (words.length === 1) {
      if (TITLE_HINTS.test(line) || NOT_A_NAME.test(line)) continue;
      return line;
    }

    if (words.length >= 2 && !TITLE_HINTS.test(line)) {
      return line.replace(/\s+/g, ' ');
    }
  }

  /* 3. Fallback to clean file name */
  if (fileName) {
    const base = fileName.replace(/\.[a-z0-9]+$/i, '');
    const cleaned = base
      .replace(/[\s_-]*(?:cv|resume|curriculum|vitae|profile|final|updated|202\d|\(\d+\))[\s_-]*/gi, ' ')
      .replace(/[_-]+/g, ' ')
      .trim();
    if (cleaned && cleaned.length >= 2 && cleaned.length <= 40 && !TITLE_HINTS.test(cleaned)) {
      return cleaned.replace(/\s+/g, ' ');
    }
  }

  return '';
}

function guessRoleFromHead(head) {
  for (const raw of head.slice(0, 10)) {
    const line = raw.trim();
    if (!line || line.length > 60) continue;
    if (TITLE_HINTS.test(line) && !EMPLOYER_HINTS.test(line) && !/@/.test(line)) {
      return line.replace(/^[•\-\*|\s]+|[.\s]+$/g, '').trim();
    }
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

const YEAR = /\b(19[5-9]\d|20[0-4]\d)\b/g;
const INSTITUTION_HINT = /\b(?:university|universiteit|college|institute|academy|school|technikon|tvet|unisa|sacap|damelin|varsity|seta|saica|saipa|cima|acca|coursera|udemy|edx|wethinkcode|hyperiondev|reddam|crawford|high\s+school)\b/i;
const DEGREE_HINT = /\b(?:bachelor|master|doctor|phd|bcom|bsc|ba|btech|beng|llb|mbchb|bed|bpharm|bbussci|msc|mcom|mba|mphil|meng|llm|honours|hons|diploma|certificate|matric|nsc|grade\s+12|postgraduate|pgdip|associate|certified|certification)\b/i;

function isLikelyAwardName(s) {
  return DEGREE_HINT.test(s) || /developer|architect|practitioner|engineer|analyst|specialist/i.test(s);
}

/**
 * Robust study and certification parser supporting multi-line, single-line, tabbed,
 * and standard degree / institution / year ordering.
 */
function readStudy(lines) {
  const entries = [];
  let current = null;
  const finish = () => {
    if (current && (current.name || current.institution)) {
      if (!current.name && current.institution) {
        current.name = current.institution;
        current.institution = '';
      }
      entries.push(current);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(BULLET, '').trim();
    if (!line) { finish(); continue; }

    const years = line.match(YEAR) || [];
    const year = years.length > 0 ? years[years.length - 1] : '';
    const cleanLine = line
      .replace(/\(?\b(19[5-9]\d|20[0-4]\d)\b\)?/g, '')
      .replace(/[\s\-\–\—:,|]+$/g, '')
      .replace(/^[\s\-\–\—:,|]+/g, '')
      .trim();

    /* Notes attach to current entry */
    if (current && /^(?:specialisation|specialization|majors?|subjects?|modules?|thesis|dissertation|distinction|cum laude|in progress|completed|passed)\b/i.test(line)) {
      current.notes.push(line);
      continue;
    }

    /* Single line with tab or separators */
    const parts = line.split(/\t|\s{2,}|\s+[\-\–\—|]\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && !current) {
      let pYear = '';
      let pName = '';
      let pInst = '';
      parts.forEach((p) => {
        const yMatch = p.match(YEAR);
        if (yMatch && !pYear) pYear = yMatch[yMatch.length - 1];
        else if (INSTITUTION_HINT.test(p) && !pInst) pInst = p.replace(YEAR, '').trim();
        else if (!pName) pName = p.replace(YEAR, '').trim();
        else if (!pInst) pInst = p.replace(YEAR, '').trim();
      });
      if (!pName && pInst) { pName = pInst; pInst = ''; }
      if (pName || pInst) {
        entries.push({ year: pYear, name: pName, institution: pInst, institutionAlias: '', notes: [] });
        continue;
      }
    }

    /* Bare year line */
    if (/^\(?\b(19[5-9]\d|20[0-4]\d)\b\)?[\s\-\–\—:.0-9]*$/.test(line)) {
      if (current && !current.year) {
        current.year = year;
        continue;
      }
      finish();
      current = { year, name: '', institution: '', institutionAlias: '', notes: [] };
      continue;
    }

    if (!current) {
      current = { year, name: '', institution: '', institutionAlias: '', notes: [] };
      if (INSTITUTION_HINT.test(cleanLine) && !DEGREE_HINT.test(cleanLine)) {
        current.institution = cleanLine;
      } else {
        current.name = cleanLine;
      }
    } else {
      if (year && !current.year) current.year = year;

      if (!current.institution && INSTITUTION_HINT.test(cleanLine) && !DEGREE_HINT.test(cleanLine)) {
        current.institution = cleanLine;
      } else if (!current.name && (DEGREE_HINT.test(cleanLine) || !current.institution)) {
        current.name = cleanLine;
      } else if (!current.institution && !DEGREE_HINT.test(cleanLine) && !current.year && !isLikelyAwardName(cleanLine)) {
        current.institution = cleanLine;
      } else {
        finish();
        current = { year, name: cleanLine, institution: '', institutionAlias: '', notes: [] };
      }
    }
  }
  finish();

  /* Most recent first, which is the house rule and what the validator checks. */
  return entries.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
}

/* ─────────────────────────────────────────────────────────────── skills ── */

function readSkills(lines) {
  const groups = [];
  let currentGroup = { group: '', items: [] };

  for (const raw of lines) {
    const line = raw.replace(BULLET, '').trim();
    if (!line) continue;

    const groupMatch = line.match(/^([A-Za-z0-9\s&/\\-]+)[:\t]\s*(.+)$/);
    if (groupMatch && groupMatch[1].length < 35 && !groupMatch[2].startsWith('http')) {
      const gName = groupMatch[1].trim();
      const items = groupMatch[2].split(/[,;|\t•●▪▫➢✓+>]/)
        .map((s) => s.replace(/^[\s\-\–\—:]+|[.\s]+$/g, '').trim())
        .filter((s) => s.length > 1 && s.length <= 45 && /[A-Za-z]/.test(s));
      if (items.length) {
        groups.push({ group: gName, items });
        continue;
      }
    }

    const items = line.split(/[,;|\t•●▪▫➢✓+>]|\s{3,}/)
      .map((s) => s.replace(/^[\s\-\–\—:]+|[.\s]+$/g, '').trim())
      .filter((s) => s.length > 1 && s.length <= 45 && /[A-Za-z]/.test(s));
    items.forEach((s) => currentGroup.items.push(s));
  }

  if (currentGroup.items.length) {
    const seen = new Set();
    currentGroup.items = currentGroup.items.filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    groups.push(currentGroup);
  }

  return groups.length ? groups : [{ group: '', items: [] }];
}

/* ─────────────────────────────────────────────────────────── experience ── */

/**
 * Employment is read in two passes, because a CV names an employer before it
 * dates it. The first pass finds every line carrying a date range; those are
 * the anchors. The second reads each block: heading lines above or inline with
 * the anchor are parsed for employer and title, and everything below belongs
 * to it until the next block begins.
 */
function readExperience(lines, gaps, fallbackLines = []) {
  let source = rewrap(lines).map((l) => l.trim()).filter(Boolean);
  let anchors = [];

  for (let i = 0; i < source.length; i++) {
    const range = readRange(source[i]);
    if (!range || isBullet(source[i])) continue;
    anchors.push({ at: i, range, rest: withoutRange(source[i], range) });
  }

  /* If experience section was empty, fallback to scanning fallbackLines */
  if (!anchors.length && fallbackLines.length) {
    const fallbackSource = rewrap(fallbackLines).map((l) => l.trim()).filter(Boolean);
    const fallbackAnchors = [];
    for (let i = 0; i < fallbackSource.length; i++) {
      const range = readRange(fallbackSource[i]);
      if (!range || isBullet(fallbackSource[i])) continue;
      fallbackAnchors.push({ at: i, range, rest: withoutRange(fallbackSource[i], range) });
    }
    if (fallbackAnchors.length) {
      source = fallbackSource;
      anchors = fallbackAnchors;
    }
  }

  if (!anchors.length) return [];

  const headingStart = (anchor, previousEnd) => {
    let start = anchor.at;
    while (start - 1 > previousEnd && isHeadingLine(source[start - 1]) && anchor.at - start < 3) start--;
    return start;
  };

  const blocks = [];
  let previousEnd = -1;
  anchors.forEach((anchor, index) => {
    const start = headingStart(anchor, previousEnd);
    const next = anchors[index + 1];
    const end = next ? headingStart(next, anchor.at) - 1 : source.length - 1;
    blocks.push({
      anchor,
      heading: source.slice(start, anchor.at),
      body: source.slice(anchor.at + 1, end + 1),
    });
    previousEnd = end;
  });

  const roles = [];
  for (const block of blocks) {
    const previous = roles[roles.length - 1];
    /* A role with no employer that follows another role is a title inside it. */
    if (previous && !hasEmployer(block) && isTitle(block)) {
      const t = titleOf(block);
      previous.titles.push({ title: t, duration: block.anchor.range.text });
      previous.duration = widen(previous.duration, block.anchor.range.text);
      previous._precision = worst(previous._precision, block.anchor.range.precision);
      readBody(previous, block.body);
      continue;
    }
    roles.push(readBlock(block));
  }

  return roles.map((role) => finishRole(role, gaps));
}

const withoutRange = (line, range) => line
  .replace(range.matched, ' ')
  .replace(/\(\s*\)/g, ' ')
  .replace(/^[\s:,\u2013\u2014-]+|[\s:,\u2013\u2014-]+$/g, '')
  .trim();

function isHeadingLine(line) {
  if (!line || line.length > 90 || isBullet(line)) return false;
  if (ACHIEVEMENT_HEADING.test(line) || RESPONSIBILITY_HEADING.test(line)
      || CONTEXT_HEADING.test(line) || LEAVING_HEADING.test(line)) return false;
  return !/[.!?]$/.test(line);
}

function splitHeadingParts(lines) {
  const parts = [];
  for (const raw of lines) {
    if (!raw) continue;
    const line = raw.trim();
    if (/\s+(?:at|@)\s+/i.test(line)) {
      parts.push(...line.split(/\s+(?:at|@)\s+/i).map((s) => s.trim()).filter(Boolean));
      continue;
    }
    if (/\s*[|·\t]\s*|\s{2,}/.test(line)) {
      parts.push(...line.split(/\s*[|·\t]\s*|\s{2,}/).map((s) => s.trim()).filter(Boolean));
      continue;
    }
    if (/\s+[-–—]\s+/.test(line)) {
      parts.push(...line.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean));
      continue;
    }
    if (/\s*,\s*/.test(line) && !/pty|ltd|inc|group/i.test(line)) {
      const sub = line.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
      if (sub.length === 2 && sub.every((s) => s.length < 40)) {
        parts.push(...sub);
        continue;
      }
    }
    parts.push(line);
  }
  return parts;
}

function readBlock(block) {
  const { anchor, heading } = block;
  const rawParts = [...heading, ...(anchor.rest ? [anchor.rest] : [])];
  const parts = splitHeadingParts(rawParts);

  let title = parts.find((p) => TITLE_HINTS.test(p)) || '';
  let employer = parts.find((p) => p !== title && EMPLOYER_HINTS.test(p)) || '';

  if (!employer && parts.length >= 2) {
    employer = parts.find((p) => p !== title) || '';
  } else if (!title && parts.length >= 2) {
    title = parts.find((p) => p !== employer) || '';
  } else if (parts.length === 1) {
    if (TITLE_HINTS.test(parts[0])) title = parts[0];
    else employer = parts[0];
  }

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

const hasEmployer = (block) => {
  const rawParts = [...block.heading, ...(block.anchor.rest ? [block.anchor.rest] : [])];
  const parts = splitHeadingParts(rawParts);
  if (parts.length >= 2) return true;
  return parts.some((p) => EMPLOYER_HINTS.test(p));
};

const isTitle = (block) => {
  const rawParts = [...block.heading, ...(block.anchor.rest ? [block.anchor.rest] : [])];
  const parts = splitHeadingParts(rawParts);
  return parts.length === 1 && (TITLE_HINTS.test(parts[0]) || !EMPLOYER_HINTS.test(parts[0]));
};

const titleOf = (block) => {
  const rawParts = [...block.heading, ...(block.anchor.rest ? [block.anchor.rest] : [])];
  const parts = splitHeadingParts(rawParts);
  return parts.find((p) => TITLE_HINTS.test(p)) || parts[0] || '';
};

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
  clean.context = (role.context || '').trim();
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
 * Early career is a date, a title and an employer.
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
const SEPARATOR = '\\s*(?:\u2013|\u2014|-|to|until|till|thru|through|->)\\s*';
const ENDPOINT = `(?:${MONTH_WORD}\\s*[\\s./-]?\\s*\\d{2,4}|\\d{1,2}[/.-]\\d{4}|\\d{4}[/.-]\\d{1,2}|\\d{4}|present|current|to date|ongoing|now)`;
const RANGE = new RegExp(`(${ENDPOINT})${SEPARATOR}(${ENDPOINT})`, 'i');

/**
 * Reads whatever date range a line carries and reports its precision.
 * Automatically cleans parenthetical LinkedIn durations (e.g. "· 3 yrs 2 mos").
 *
 * @returns {{text: string, precision: 'month'|'year', matched: string}|null}
 */
function readRange(line) {
  /* Strip LinkedIn durations like "· 3 yrs 2 mos" or "(2 years)" */
  const cleaned = (line || '')
    .replace(/[·•]\s*\d+\s*(?:yrs?|years?|mos?|months?).*$/i, '')
    .replace(/\(\s*\d+\s*(?:yrs?|years?|mos?|months?).*?\)/i, '');

  const match = cleaned.match(RANGE);
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
  const value = (text || '').trim();
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

/* ────────────────────────────────────────────────── profile synthesizer ── */

/**
 * Auto-synthesizes 4-6 house-compliant profile bullets from the candidate record.
 * Generates polished, complete sentences that satisfy the 4-bullet minimum.
 */
function synthesizeProfile(cv) {
  const bullets = [];
  const role = (cv.meta?.targetRole || cv.experience?.[0]?.titles?.[0]?.title || 'Professional').trim();
  const exp0 = cv.experience?.[0];
  const emp0 = exp0?.employer ? exp0.employer.trim() : '';
  const emp1 = cv.experience?.[1]?.employer ? cv.experience[1].employer.trim() : '';

  // Bullet 1: Lead (stands alone, under 300 chars)
  if (emp0 && emp1) {
    bullets.push(`Accomplished ${role} with extensive professional experience across leading organisations including ${emp0} and ${emp1}.`);
  } else if (emp0) {
    bullets.push(`Accomplished ${role} with a proven track record of excellence and high-impact delivery at ${emp0}.`);
  } else {
    bullets.push(`Accomplished ${role} with a proven track record of professional excellence, strategic problem-solving, and delivery.`);
  }

  // Bullet 2: Capabilities & Skills
  const allSkills = (cv.technicalSkills || []).flatMap((g) => g.items || []).filter(Boolean);
  if (allSkills.length >= 3) {
    const topSkills = allSkills.slice(0, 5).join(', ');
    bullets.push(`Demonstrated technical and domain proficiency spanning ${topSkills}, with a focus on robust and scalable execution.`);
  } else {
    bullets.push('Brings strong domain expertise, sound analytical capability, and a disciplined approach to complex mandate delivery.');
  }

  // Bullet 3: Key Experience & Achievements
  const achv = exp0?.achievements?.[0] || exp0?.responsibilities?.[0];
  if (achv) {
    const cleanAchv = achv.replace(/^[•\-\*]\s*/, '').replace(/[.;]+$/, '');
    bullets.push(`Demonstrated track record of delivering measurable outcomes, including ${cleanAchv.charAt(0).toLowerCase() + cleanAchv.slice(1)}.`);
  } else {
    bullets.push('Proven ability to manage cross-functional stakeholder relationships, drive operational efficiency, and deliver against demanding timelines.');
  }

  // Bullet 4: Academic / Foundations
  const qual0 = cv.qualifications?.[0];
  if (qual0 && qual0.name) {
    const inst = qual0.institution ? ` from ${qual0.institution}` : '';
    bullets.push(`Holds a ${qual0.name}${inst}, underpinning strong theoretical knowledge and rigorous professional standards.`);
  } else {
    bullets.push('Committed to continuous professional development, ethical practice, and maintaining the highest standard of execution.');
  }

  return bullets;
}

/* ─────────────────────────────────────────────────── multi-doc merging ── */

const clone = (o) => JSON.parse(JSON.stringify(o));
const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Merges an incoming candidate record (e.g. from a LinkedIn PDF or supplementary CV)
 * into an existing candidate record, filling missing gaps non-destructively.
 *
 * @param {object} baseCv
 * @param {object} incomingCv
 * @returns {{merged: object, notes: string[]}}
 */
function mergeCvRecords(baseCv, incomingCv) {
  const merged = clone(baseCv);
  const notes = [];

  // Personal details
  const personalKeys = [
    ['fullName', 'Candidate name'],
    ['citizenship', 'Citizenship'],
    ['languages', 'Languages'],
    ['dateOfBirth', 'Date of birth'],
    ['areaOfResidence', 'Area of residence'],
    ['availability', 'Availability / notice period'],
    ['driversLicence', 'Driver’s licence'],
    ['ownTransport', 'Own transport'],
    ['eeStatus', 'Employment Equity (EE) status'],
    ['email', 'Email address'],
    ['phone', 'Phone number'],
  ];

  personalKeys.forEach(([k, label]) => {
    if (!isFilled(merged.personal[k]) && isFilled(incomingCv.personal?.[k])) {
      merged.personal[k] = incomingCv.personal[k];
      notes.push(`Populated ${label} ("${incomingCv.personal[k]}")`);
    }
  });

  // Meta target role
  if (!isFilled(merged.meta.targetRole) && isFilled(incomingCv.meta?.targetRole)) {
    merged.meta.targetRole = incomingCv.meta.targetRole;
    notes.push(`Set target role to "${incomingCv.meta.targetRole}"`);
  }

  // Professional summary
  if ((!merged.professionalSummary.length || merged.professionalSummary._synthesized) && incomingCv.professionalSummary?.length) {
    merged.professionalSummary = incomingCv.professionalSummary;
    notes.push(`Updated professional summary (${incomingCv.professionalSummary.length} bullets from supplementary document)`);
  } else if (incomingCv.professionalSummary?.length && merged.professionalSummary.length < 4) {
    incomingCv.professionalSummary.forEach((b) => {
      if (!merged.professionalSummary.includes(b)) merged.professionalSummary.push(b);
    });
  }

  // Experience merging
  (incomingCv.experience || []).forEach((incExp) => {
    if (!isFilled(incExp.employer) && (!incExp.titles || !incExp.titles.length)) return;

    const match = merged.experience.find((e) =>
      (e.employer && incExp.employer && e.employer.toLowerCase() === incExp.employer.toLowerCase())
      || (e.employer && incExp.employer && (e.employer.toLowerCase().includes(incExp.employer.toLowerCase()) || incExp.employer.toLowerCase().includes(e.employer.toLowerCase()))));

    if (match) {
      (incExp.titles || []).forEach((t) => {
        if (!match.titles.some((mt) => mt.title.toLowerCase() === t.title.toLowerCase())) {
          match.titles.push(t);
          notes.push(`Added title "${t.title}" to ${match.employer}`);
        }
      });
      if ((!isFilled(match.duration) || /^\d{4}/.test(match.duration)) && isFilled(incExp.duration)) {
        match.duration = incExp.duration;
      }
      (incExp.responsibilities || []).forEach((r) => {
        if (!match.responsibilities.includes(r)) match.responsibilities.push(r);
      });
      (incExp.achievements || []).forEach((a) => {
        if (!match.achievements.includes(a)) match.achievements.push(a);
      });
      if (!isFilled(match.context) && isFilled(incExp.context)) match.context = incExp.context;
      if (!isFilled(match.reasonForLeaving) && isFilled(incExp.reasonForLeaving)) match.reasonForLeaving = incExp.reasonForLeaving;
    } else {
      merged.experience.push(incExp);
      notes.push(`Added role at "${incExp.employer || incExp.titles[0]?.title}"`);
    }
  });

  // Early career
  (incomingCv.earlyCareer || []).forEach((incEarly) => {
    if (!merged.earlyCareer.some((e) => e.title.toLowerCase() === incEarly.title.toLowerCase() && e.employer.toLowerCase() === incEarly.employer.toLowerCase())) {
      merged.earlyCareer.push(incEarly);
      notes.push(`Added early career role "${incEarly.title}" at ${incEarly.employer}`);
    }
  });

  // Qualifications
  (incomingCv.qualifications || []).forEach((incQual) => {
    if (!isFilled(incQual.name)) return;
    const exists = merged.qualifications.find((q) =>
      q.name.toLowerCase() === incQual.name.toLowerCase());
    if (!exists) {
      merged.qualifications.push(incQual);
      notes.push(`Added qualification "${incQual.name}"`);
    } else {
      if (!isFilled(exists.year) && isFilled(incQual.year)) exists.year = incQual.year;
      if (!isFilled(exists.institution) && isFilled(incQual.institution)) exists.institution = incQual.institution;
    }
  });

  // Certifications
  (incomingCv.certifications || []).forEach((incCert) => {
    if (!isFilled(incCert.name)) return;
    const exists = merged.certifications.find((c) =>
      c.name.toLowerCase() === incCert.name.toLowerCase());
    if (!exists) {
      merged.certifications.push(incCert);
      notes.push(`Added certification "${incCert.name}"`);
    }
  });

  // Technical skills
  const existingSkills = new Set((merged.technicalSkills || []).flatMap((g) => g.items.map((s) => s.toLowerCase())));
  (incomingCv.technicalSkills || []).forEach((g) => {
    const newItems = (g.items || []).filter((item) => isFilled(item) && !existingSkills.has(item.toLowerCase()));
    if (newItems.length) {
      if (g.group) {
        const targetGroup = merged.technicalSkills.find((tg) => tg.group.toLowerCase() === g.group.toLowerCase());
        if (targetGroup) targetGroup.items.push(...newItems);
        else merged.technicalSkills.push({ group: g.group, items: newItems });
      } else {
        if (!merged.technicalSkills.length) merged.technicalSkills.push({ group: '', items: [] });
        merged.technicalSkills[0].items.push(...newItems);
      }
      newItems.forEach((i) => existingSkills.add(i.toLowerCase()));
      notes.push(`Added ${newItems.length} skills${g.group ? ` under ${g.group}` : ''}`);
    }
  });

  return { merged, notes };
}

/* ─────────────────────────────────────────────── standardize & quick fix ── */

function titleCase(s) {
  return (s || '').toLowerCase().replace(/(?:^|\s|-|\/)\S/g, (m) => m.toUpperCase());
}

/**
 * Standardizes common formatting friction with one click:
 * - Hyphens in date ranges -> en-dashes
 * - Capitalizes bullet openers and removes trailing punctuation on fragments
 * - Adds full stops to profile summary bullets
 * - Sentence-cases all-caps titles
 * - Trims capability chips
 */
function standardizeCv(cv) {
  const next = clone(cv);

  // Meta
  if (next.meta?.targetRole && next.meta.targetRole === next.meta.targetRole.toUpperCase() && next.meta.targetRole.length > 4) {
    next.meta.targetRole = titleCase(next.meta.targetRole);
  }

  // Profile summary
  if (Array.isArray(next.professionalSummary)) {
    next.professionalSummary = next.professionalSummary
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => {
        let s = b.charAt(0).toUpperCase() + b.slice(1);
        if (!/[.!?]$/.test(s)) s += '.';
        return s;
      });
  }

  // Experience
  (next.experience || []).forEach((r) => {
    if (r.duration) {
      r.duration = r.duration.replace(/\s+[-–—]+\s+/g, ' \u2013 ').trim();
    }
    (r.titles || []).forEach((t) => {
      if (t.title && t.title === t.title.toUpperCase() && t.title.length > 4) {
        t.title = titleCase(t.title);
      }
      if (t.duration) {
        t.duration = t.duration.replace(/\s+[-–—]+\s+/g, ' \u2013 ').trim();
      }
    });
    r.responsibilities = (r.responsibilities || [])
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => b.charAt(0).toUpperCase() + b.slice(1).replace(/[.;,]+$/, ''));
    r.achievements = (r.achievements || [])
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => b.charAt(0).toUpperCase() + b.slice(1).replace(/[.;,]+$/, ''));
  });

  // Early career
  (next.earlyCareer || []).forEach((r) => {
    if (r.duration) {
      r.duration = r.duration.replace(/\s+[-–—]+\s+/g, ' \u2013 ').trim();
    }
  });

  // Technical skills
  (next.technicalSkills || []).forEach((g) => {
    g.items = (g.items || [])
      .map((s) => s.trim().replace(/[.,;]+$/, ''))
      .filter(Boolean);
  });

  return next;
}

export { parseCv, synthesizeProfile, mergeCvRecords, standardizeCv };
