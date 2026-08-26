/* ============================================================================
   TALENT TREE - CANDIDATE DATA VALIDATOR
   ----------------------------------------------------------------------------
   ISOMORPHIC. Pure function, no I/O.

     import { validate } from './validate.js';
     const { ok, errors, warnings } = validate(candidateJson);

   Uniformity does not come from the prompt. It comes from checking the output
   of the prompt. This enforces every house rule that can be checked
   mechanically, so a consultant only checks what needs judgement.

   In the CV builder: run on blur and on submit. Errors block the download;
   warnings surface as amber notes beside the field they belong to. Every entry
   carries a `field` path, so the UI can attach it to the right input.
   ========================================================================== */

import { flagsOf, ageBand } from './redact.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const MONTH = `(?:${MONTHS.join('|')})`;
const RANGE = new RegExp(`^${MONTH} \\d{4} \u2013 (?:Present|${MONTH} \\d{4})$`);
const YEAR = /^\d{4}$/;
const YEAR_RANGE = /^\d{4} – (?:Present|\d{4})$/;

/* Openers that are not action verbs. The house rule is that every bullet starts
   with one, and these are the phrases that most often slip through. */
const WEAK_OPENERS = [
  'responsible for', 'responsibilities included', 'duties included',
  'tasked with', 'in charge of', 'helped', 'worked on', 'involved in',
  'assisted with', 'was ', 'were ', 'my ', 'the ', 'a ', 'an ',
];

/* Anything that could identify or contact the candidate directly. */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /(?:\+?\d[\d\s()-]{7,}\d)/;
const URL = /(?:https?:\/\/|www\.)\S+/i;

/* Per-call state, reset by validate(), so the module is safe to reuse across
   requests in a long-running server process. */
let errors = [];
let warns = [];
const err = (where, msg) => errors.push({ field: where, message: msg, level: 'error' });
const warn = (where, msg) => warns.push({ field: where, message: msg, level: 'warning' });

/* ────────────────────────────────────────────────────────────── helpers ── */

const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;

function monthIndex(s) {
  const m = s.match(new RegExp(`^(${MONTH}) (\\d{4})`));
  if (!m) return null;
  return parseInt(m[2], 10) * 12 + MONTHS.indexOf(m[1]);
}

/** Start of a range, for chronological ordering. */
function rangeStart(range) {
  return isFilled(range) ? monthIndex(range) : null;
}

function checkRange(where, value, { allowEmpty = false } = {}) {
  if (!isFilled(value)) {
    if (!allowEmpty) err(where, 'duration is missing');
    return;
  }
  if (value.includes(' - ') || value.includes(' -- ')) {
    err(where, `uses a hyphen, not an en dash \u2013 \u2014 "${value}"`);
    return;
  }
  if (YEAR_RANGE.test(value.trim())) {
    warn(where, `months were not stated in the source, so the year-only tenure was preserved \u2014 "${value}"`);
    return;
  }
  if (!RANGE.test(value.trim())) {
    err(where, `duration must read "Month YYYY \u2013 Month YYYY", "Month YYYY \u2013 Present", or preserve a source year-only range such as "2019 \u2013 2021" \u2014 got "${value}"`);
    return;
  }
  /* The shape can be right and the tenure still impossible. Ordering checks
     and tenure bands both consume these endpoints, so a reversed range has to
     be caught before either of them reads it. */
  const [from, to] = value.trim().split(' \u2013 ');
  if (to !== 'Present') {
    const a = monthIndex(from);
    const b = monthIndex(to);
    if (a !== null && b !== null && b < a) {
      err(where, `ends before it starts \u2014 "${value}"`);
    }
  }
}

function checkContactLeak(where, text) {
  if (!isFilled(text)) return;
  if (EMAIL.test(text)) err(where, 'contains an email address \u2014 candidate contact details must not appear');
  if (PHONE.test(text)) err(where, 'contains what looks like a phone number \u2014 candidate contact details must not appear');
  if (URL.test(text)) warn(where, 'contains a URL \u2014 confirm it belongs in a Talent Tree profile');
}

function checkBullet(where, text, { sentence = false } = {}) {
  if (!isFilled(text)) { err(where, 'is empty'); return; }
  const s = text.trim();

  if (!/^[A-Z0-9(]/.test(s)) err(where, `must start with a capital letter \u2014 "${s.slice(0, 50)}"`);

  const lower = s.toLowerCase();
  if (!sentence) {
    const weak = WEAK_OPENERS.find((w) => lower.startsWith(w));
    if (weak) warn(where, `does not open with an action verb ("${weak.trim()}") \u2014 "${s.slice(0, 60)}"`);
    if (s.endsWith('.')) warn(where, 'ends with a full stop \u2014 responsibility and achievement bullets are fragments, no terminal punctuation');
  } else if (!s.endsWith('.')) {
    warn(where, 'profile bullets are complete sentences and should end with a full stop');
  }

  if (s.length > 320) warn(where, `is very long (${s.length} chars) \u2014 check it is one point, not two`);
  checkContactLeak(where, s);
}

/* ───────────────────────────────────────────────────── anonymity checks ── */

/* Words too generic to identify an employer. Matching on these would flag
   every second bullet and train people to ignore the warnings. */
const STOP = new Set(['the', 'and', 'for', 'group', 'holdings', 'ltd', 'pty', 'limited',
  'inc', 'plc', 'company', 'corporation', 'services', 'solutions', 'south', 'africa',
  'african', 'international', 'global', 'consulting', 'consultancy', 'technologies',
  'university', 'universiteit', 'college', 'institute', 'institution', 'academy',
  'school', 'technikon', 'faculty']);

/** "The Foschini Group (TFG)" -> ["Foschini", "TFG"] */
function nameTokens(name) {
  if (!isFilled(name)) return [];
  const out = new Set();
  (String(name).match(/\(([^)]+)\)/g) || [])
    .forEach((x) => { const v = x.replace(/[()]/g, '').trim(); if (v.length >= 2) out.add(v); });
  String(name).replace(/\([^)]*\)/g, '').split(/[^A-Za-z0-9&]+/)
    .forEach((w) => { if (w.length >= 3 && !STOP.has(w.toLowerCase())) out.add(w); });
  return [...out];
}

const mentions = (text, token) =>
  isFilled(text) && new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);

/**
 * A redacted header is worthless if the prose still names the employer. This
 * walks every free-text field and reports each place the name survives.
 */
function checkAnonymity(cv) {
  const f = flagsOf(cv);
  if (!Object.values(f).some(Boolean)) return;

  const tokens = [];

  if (f.employerNames) {
    [...(cv.experience || []), ...(cv.earlyCareer || [])].forEach((r, i) => {
      nameTokens(r.employer).forEach((t) => tokens.push({ token: t, what: 'employer name' }));
    });
    (cv.experience || []).forEach((r, i) => {
      if (!isFilled(r.alias)) {
        err(`experience[${i}].alias`,
          `employer names are redacted but this employer has no descriptor \u2014 add one, e.g. "JSE-listed retail group"`);
      }
    });
    (cv.earlyCareer || []).forEach((r, i) => {
      if (!isFilled(r.alias)) {
        warn(`earlyCareer[${i}].alias`, 'employer names are redacted but this role has no descriptor \u2014 the employer will be blank');
      }
    });
  }

  if (f.candidateName) {
    nameTokens(cv.personal && cv.personal.fullName)
      .forEach((t) => tokens.push({ token: t, what: "candidate's name" }));
    if (!isFilled(cv.meta && cv.meta.reference)) {
      warn('meta.reference', 'no reference supplied \u2014 the profile will fall back to initials, which are weaker anonymity');
    }
  }

  if (f.institutions) {
    /* A training provider's name is frequently a technology's name too \u2014
       "SAS Institute" against a candidate who lists SAS as a skill. Tokens the
       candidate claims as capability are dropped, or the check flags every
       second line and trains people to ignore it. */
    const skills = new Set();
    (cv.technicalSkills || []).forEach((g) => (g.items || []).forEach((item) => {
      if (!isFilled(item)) return;
      String(item).split(/[^A-Za-z0-9&]+/).forEach((w) => { if (w) skills.add(w.toLowerCase()); });
    }));
    [...(cv.qualifications || []), ...(cv.certifications || [])].forEach((q) => {
      nameTokens(q.institution).forEach((t) => {
        if (!skills.has(t.toLowerCase())) tokens.push({ token: t, what: 'institution name' });
      });
    });
    (cv.qualifications || []).forEach((q, i) => {
      if (isFilled(q.institution) && !isFilled(q.institutionAlias)) {
        warn(`qualifications[${i}].institutionAlias`, 'institutions are redacted but no descriptor was given \u2014 the institution will be blank');
      }
    });
    (cv.certifications || []).forEach((q, i) => {
      if (isFilled(q.institution) && !isFilled(q.institutionAlias)) {
        warn(`certifications[${i}].institutionAlias`, 'institutions are redacted but no descriptor was given \u2014 the provider will be blank');
      }
    });
  }

  if (f.dateOfBirth && isFilled(cv.personal && cv.personal.dateOfBirth)) {
    if (!ageBand(cv.personal.dateOfBirth)) {
      warn('personal.dateOfBirth', 'cannot be read as a date, so no age band can be worked out \u2014 the age will be blank');
    }
  }

  if (f.areaOfResidence && isFilled(cv.personal && cv.personal.areaOfResidence)
      && !isFilled(cv.personal && cv.personal.areaAlias)) {
    warn('personal.areaAlias', 'location is redacted but no broader area was given \u2014 it will be blank');
  }

  if (!tokens.length) return;

  /* Every field a reader actually reads. */
  const fields = [];
  (cv.professionalSummary || []).forEach((t, i) => fields.push([`professionalSummary[${i}]`, t]));
  (cv.careerSummary || []).forEach((t, i) => fields.push([`careerSummary[${i}]`, t]));
  if (cv.meta) fields.push(['meta.targetRole', cv.meta.targetRole]);
  (cv.qualifications || []).forEach((q, i) => {
    (q.notes || []).forEach((n, j) => fields.push([`qualifications[${i}].notes[${j}]`, n]));
  });
  (cv.experience || []).forEach((r, i) => {
    fields.push([`experience[${i}].context`, r.context]);
    fields.push([`experience[${i}].reasonForLeaving`, r.reasonForLeaving]);
    (r.responsibilities || []).forEach((b, j) => fields.push([`experience[${i}].responsibilities[${j}]`, b]));
    (r.achievements || []).forEach((b, j) => fields.push([`experience[${i}].achievements[${j}]`, b]));
    (r.titles || []).forEach((t, j) => fields.push([`experience[${i}].titles[${j}].title`, t.title]));
  });

  const seenField = new Set();
  fields.forEach(([path, text]) => {
    tokens.forEach(({ token, what }) => {
      if (seenField.has(path)) return;
      if (mentions(text, token)) {
        seenField.add(path);
        err(path, `still contains "${token}" \u2014 the ${what} is redacted, so this reveals it. Reword the line.`);
      }
    });
  });
}

/* ────────────────────────────────────────────────────────────── the run ── */

function validate(cv) {
  errors = [];
  warns = [];

  /* Mode inverts several rules, so it is resolved first.
       agency (default) - Talent Tree presents the candidate. The candidate's
         own contact details must NOT appear anywhere; the consultant's must.
       direct - the candidate sends the CV themselves. Their contact details
         are required, and there is no consultant. */
  const mode = (cv.meta && cv.meta.mode) === 'direct' ? 'direct' : 'agency';
  const direct = mode === 'direct';

  /* The one combination the two settings cannot both have. Direct mode has no
     consultant block, and hiding the candidate's name strips their email and
     phone with it, so the document would reach a reader with no way to answer
     it. A candidate cannot send an anonymous CV about themselves. */
  if (direct && flagsOf(cv).candidateName) {
    err('redact.candidateName',
      'cannot be hidden in direct mode \u2014 the candidate is sending this themselves, and hiding the name removes their contact details too, leaving the reader no way to reply');
  }

  /* --- meta ------------------------------------------------------------- */
  if (!cv.meta || !isFilled(cv.meta.targetRole)) {
    err('meta.targetRole', 'is required \u2014 it prints under the name on the cover');
  }
  if (cv.meta && isFilled(cv.meta.targetRole) && cv.meta.targetRole === cv.meta.targetRole.toUpperCase()) {
    warn('meta.targetRole', 'is in capitals \u2014 write it in sentence case, the template applies the caps');
  }
  if (cv.meta && isFilled(cv.meta.mode) && !['agency', 'direct'].includes(cv.meta.mode)) {
    err('meta.mode', `must be "agency" or "direct" \u2014 got "${cv.meta.mode}"`);
  }
  if (!cv.meta || !isFilled(cv.meta.fileName)) {
    warn('meta.fileName', 'is missing \u2014 one will be derived from the name');
  }

  /* --- personal --------------------------------------------------------- */
  const p = cv.personal || {};
  if (!isFilled(p.fullName)) err('personal.fullName', 'is required');
  ['fullName', 'citizenship', 'languages', 'dateOfBirth', 'areaOfResidence',
    'availability', 'driversLicence', 'ownTransport', 'eeStatus'].forEach((k) => {
    checkContactLeak(`personal.${k}`, p[k]);
  });

  if (direct) {
    /* The candidate is sending this themselves, so a reader needs a way to
       reach them. Without one the document is undeliverable. */
    if (!isFilled(p.email) && !isFilled(p.phone)) {
      err('personal.email', 'direct mode needs an email address or a phone number \u2014 the reader has no other way to make contact');
    }
    if (isFilled(p.email) && !EMAIL.test(p.email)) {
      err('personal.email', `does not look like an email address \u2014 "${p.email}"`);
    }
    if (isFilled(p.phone) && !PHONE.test(p.phone)) {
      warn('personal.phone', `does not look like a phone number \u2014 "${p.phone}"`);
    }
  } else {
    if (isFilled(p.email)) err('personal.email', 'must be empty in agency mode \u2014 the client contacts the consultant');
    if (isFilled(p.phone)) err('personal.phone', 'must be empty in agency mode \u2014 the client contacts the consultant');
  }
  if (isFilled(p.areaOfResidence) && /\d{1,4}\s+\w+\s+(street|road|avenue|drive|lane|close)/i.test(p.areaOfResidence)) {
    err('personal.areaOfResidence', 'looks like a street address \u2014 use suburb and city only');
  }
  ['citizenship', 'languages', 'areaOfResidence', 'availability', 'eeStatus'].forEach((k) => {
    if (!isFilled(p[k])) warn(`personal.${k}`, 'is empty \u2014 confirm the source genuinely does not state it');
  });

  /* --- consultant ------------------------------------------------------- */
  const c = cv.consultant || {};
  if (!direct) {
    if (!isFilled(c.contactPerson)) err('consultant.contactPerson', 'is required');
    if (!isFilled(c.emailAddress)) err('consultant.emailAddress', 'is required');
  }

  /* --- profile ---------------------------------------------------------- */
  const ps = cv.professionalSummary || [];
  if (ps.length < 4) err('professionalSummary', `has ${ps.length} bullets \u2014 the house minimum is 4`);
  if (ps.length > 6) warn('professionalSummary', `has ${ps.length} bullets \u2014 the house maximum is 6`);
  ps.forEach((b, i) => checkBullet(`professionalSummary[${i}]`, b, { sentence: true }));
  if (ps[0] && ps[0].length > 330) {
    warn('professionalSummary[0]', 'is the lead paragraph and prints large \u2014 keep it under about 300 characters');
  }

  (cv.careerSummary || []).forEach((b, i) =>
    checkBullet(`careerSummary[${i}]`, b, { sentence: true }));

  /* --- qualifications and certifications -------------------------------- */
  [['qualifications', cv.qualifications], ['certifications', cv.certifications]].forEach(([key, list]) => {
    (list || []).forEach((q, i) => {
      const w = `${key}[${i}]`;
      if (!isFilled(q.name)) err(w, 'name is missing');
      if (!isFilled(q.year)) warn(w, 'year is missing \u2014 leave it empty only if the source does not state it');
      else if (!YEAR.test(q.year.trim())) err(w, `year must be four digits \u2014 got "${q.year}"`);
      if (!isFilled(q.institution)) warn(w, 'institution is missing');
    });
    const years = (list || []).map((q) => parseInt(q.year, 10)).filter((n) => !Number.isNaN(n));
    for (let i = 1; i < years.length; i++) {
      if (years[i] > years[i - 1]) { warn(key, 'is not in reverse chronological order'); break; }
    }
  });

  /* --- capability ------------------------------------------------------- */
  const seen = new Map();
  (cv.technicalSkills || []).forEach((g, gi) => {
    const items = g.items || [];
    if (!items.length) warn(`technicalSkills[${gi}]`, 'has no items');
    items.forEach((s, si) => {
      const w = `technicalSkills[${gi}].items[${si}]`;
      if (!isFilled(s)) { err(w, 'is empty'); return; }
      const key = s.trim().toLowerCase();
      if (seen.has(key)) warn(w, `duplicates "${seen.get(key)}"`);
      else seen.set(key, s.trim());
      if (s.trim().length > 38) warn(w, `is ${s.trim().length} chars \u2014 chips over about 38 wrap awkwardly, shorten it`);
      if (s.trim().endsWith('.')) warn(w, 'ends with a full stop \u2014 chips take no punctuation');
    });
  });

  /* --- experience ------------------------------------------------------- */
  const exp = cv.experience || [];
  if (!exp.length) err('experience', 'has no entries');

  exp.forEach((r, i) => {
    const w = `experience[${i}]`;
    if (!isFilled(r.employer)) err(w, 'employer is missing');
    checkRange(`${w}.duration`, r.duration);

    const titles = r.titles || [];
    if (!titles.length) err(w, 'has no titles');
    titles.forEach((t, ti) => {
      const tw = `${w}.titles[${ti}]`;
      if (!isFilled(t.title)) err(tw, 'title is missing');
      checkRange(`${tw}.duration`, t.duration, { allowEmpty: titles.length === 1 });
      if (isFilled(t.title) && t.title === t.title.toUpperCase() && t.title.length > 4) {
        warn(tw, 'title is in capitals \u2014 write it in sentence case');
      }
    });

    /* Reverse chronological order within the employer. */
    const starts = titles.map((t) => rangeStart(t.duration)).filter((n) => n !== null);
    for (let k = 1; k < starts.length; k++) {
      if (starts[k] > starts[k - 1]) { err(`${w}.titles`, 'must be in reverse chronological order, most recent first'); break; }
    }

    /* A current employer must have a current title. */
    if (isFilled(r.duration) && r.duration.endsWith('Present')) {
      const anyPresent = titles.some((t) => isFilled(t.duration) && t.duration.endsWith('Present'));
      if (!anyPresent && titles.length) {
        err(`${w}.titles[0]`, 'employer duration ends "Present" but no title does \u2014 the current role will not be marked');
      }
    }

    /* The single-title case the template depends on. */
    if (titles.length === 1 && isFilled(titles[0].duration) && isFilled(r.duration)
        && titles[0].duration !== r.duration) {
      warn(`${w}.titles[0]`, 'is the only title but its duration differs from the employer duration \u2014 if they are the same tenure, make them identical so the redundant date row is suppressed');
    }

    /* Rendered free text, so the agency-mode contact rule applies here exactly
       as it does to the bullets. */
    checkContactLeak(`${w}.context`, r.context);
    checkContactLeak(`${w}.reasonForLeaving`, r.reasonForLeaving);

    if (isFilled(r.context) && r.context.trim().length > 600) {
      warn(`${w}.context`, `is ${r.context.trim().length} chars \u2014 keep the employer description to about 3 sentences`);
    }
    if (isFilled(r.context) && !/\.$/.test(r.context.trim())) {
      warn(`${w}.context`, 'should be a complete sentence ending in a full stop');
    }

    const resp = r.responsibilities || [];
    const achv = r.achievements || [];
    if (!resp.length && !achv.length) err(w, 'has no responsibilities or achievements');
    resp.forEach((b, bi) => checkBullet(`${w}.responsibilities[${bi}]`, b));
    achv.forEach((b, bi) => checkBullet(`${w}.achievements[${bi}]`, b));

    const all = [...resp, ...achv].map((s) => s.trim().toLowerCase());
    all.forEach((s, si) => {
      if (all.indexOf(s) !== si) warn(w, `has a duplicated bullet: "${s.slice(0, 60)}"`);
    });

    if (resp.length > 30) warn(`${w}.responsibilities`, `has ${resp.length} bullets \u2014 confirm none are achievements`);
  });

  /* Employers in reverse chronological order. */
  const empStarts = exp.map((r) => rangeStart(r.duration)).filter((n) => n !== null);
  for (let k = 1; k < empStarts.length; k++) {
    if (empStarts[k] > empStarts[k - 1]) { err('experience', 'must be in reverse chronological order, most recent first'); break; }
  }

  /* --- early career ----------------------------------------------------- */
  (cv.earlyCareer || []).forEach((r, i) => {
    const w = `earlyCareer[${i}]`;
    if (!isFilled(r.title)) err(w, 'title is missing');
    if (!isFilled(r.employer)) err(w, 'employer is missing');
    checkRange(`${w}.duration`, r.duration);
  });

  /* --- referees --------------------------------------------------------- */
  /* A formal recruitment profile carries no referees section. The client asks
     the consultant, who asks the candidate, and a line promising referees on
     request says nothing the reader did not already assume. Older data files
     still carry the field, so it is reported rather than silently ignored. */
  if (isFilled(cv.referees)) {
    warn('referees', 'is no longer part of the profile \u2014 a formal recruitment CV carries no referees section. Remove it from the data file');
  }

  /* --- anonymity -------------------------------------------------------- */
  checkAnonymity(cv);

  /* --- gaps in the timeline -------------------------------------------- */
  const spans = [...exp, ...(cv.earlyCareer || [])]
    .map((r) => r.duration)
    .filter(isFilled)
    .map((d) => {
      const parts = d.split(' \u2013 ');
      if (parts.length !== 2) return null;               // malformed — already reported above
      const [from, to] = parts;
      return { from: monthIndex(from), to: to === 'Present' ? Infinity : monthIndex(to), label: d };
    })
    .filter((s) => s && s.from !== null && s.to !== null)
    .sort((a, b) => a.from - b.from);

  for (let i = 1; i < spans.length; i++) {
    const gap = spans[i].from - spans[i - 1].to;
    if (spans[i - 1].to !== Infinity && gap > 4) {
      warn('timeline', `about ${Math.round(gap / 12 * 10) / 10} years unaccounted for between "${spans[i - 1].label}" and "${spans[i].label}" \u2014 ask the candidate before sending`);
    }
  }
}

/* -------------------------------------------------------------- export -- */

/**
 * @param {object} cv candidate data
 * @returns {{ok:boolean, errors:Array, warnings:Array, all:Array}}
 *          each entry is { field, message, level }
 */
function run(cv) {
  validate(cv);
  return {
    ok: errors.length === 0,
    errors: errors.slice(),
    warnings: warns.slice(),
    all: [...errors, ...warns],
  };
}

export { run as validate };
