/* ============================================================================
   TALENT TREE — REDACTION
   ----------------------------------------------------------------------------
   ISOMORPHIC. Pure function, no I/O.

     const { redact, tenureBand, ageBand } = require('./redact');
     const anonymous = redact(cv);        // -> a new object, cv untouched

   THE PRINCIPLE
   Redaction happens at COMPOSE time, never at save time. The stored record
   always holds the real employer names, the real dates and the real person.
   A blind profile is a *view* of that record.

   This matters. If redaction were destructive, sending a client the blind
   version and then the open version would mean re-keying the CV, and the two
   documents would drift. Here they are the same record rendered twice.

   WHAT IT DOES NOT DO
   It never invents a replacement. Where a substitute has to carry meaning —
   an employer descriptor, an institution descriptor — a human writes it and
   the validator refuses to build until they have. The only values this module
   generates are arithmetic: an age band from a date of birth, a tenure band
   from two dates. Arithmetic is not invention.
   ========================================================================== */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const clone = (o) => JSON.parse(JSON.stringify(o));
const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;

/* ────────────────────────────────────────────────────────────────── bands ── */

/** "January 2019" -> months since year 0, for arithmetic only. */
function monthIndex(s) {
  const m = String(s).trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const i = MONTHS.indexOf(m[1]);
  return i < 0 ? null : Number(m[2]) * 12 + i;
}

const BANDS = [
  [12, 'Under 1 year'],
  [24, '1 \u2013 2 years'],
  [48, '2 \u2013 4 years'],
  [84, '4 \u2013 7 years'],
  [120, '7 \u2013 10 years'],
  [Infinity, '10+ years'],
];

/**
 * "January 2019 – Present" -> "6 – 7 years"
 * Returns null when the range cannot be parsed, so the caller can leave the
 * original value alone rather than print something wrong.
 */
function tenureBand(range, now = new Date()) {
  if (!isFilled(range)) return null;
  const parts = String(range).split('\u2013').map((s) => s.trim());
  if (parts.length !== 2) return null;

  const from = monthIndex(parts[0]);
  if (from == null) return null;

  const to = /^present$/i.test(parts[1])
    ? now.getFullYear() * 12 + now.getMonth()
    : monthIndex(parts[1]);
  if (to == null) return null;

  const months = Math.max(0, to - from);
  return (BANDS.find(([limit]) => months < limit) || BANDS[BANDS.length - 1])[1];
}

/** "18 March 1985" -> "40 \u2013 45". Five-year bands. */
function ageBand(dob, now = new Date()) {
  if (!isFilled(dob)) return null;
  const m = String(dob).trim().match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]);
  if (month < 0) return null;

  const born = new Date(Number(m[3]), month, Number(m[1]));
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday = now.getMonth() < born.getMonth()
    || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  if (age < 0 || age > 100) return null;

  const lower = Math.floor(age / 5) * 5;
  return `${lower} \u2013 ${lower + 5}`;
}

/** "Jacob Johannes Steyn" -> "J.J.S." */
function initials(name) {
  return String(name || '').trim().split(/\s+/)
    .filter(Boolean).map((w) => w[0].toUpperCase() + '.').join('');
}

/* ───────────────────────────────────────────────────────────── the flags ── */

const DEFAULTS = {
  candidateName: false,   // -> meta.reference, or initials
  dateOfBirth: false,     // -> age band
  areaOfResidence: false, // -> removed, or personal.areaAlias
  employerNames: false,   // -> experience[].alias
  institutions: false,    // -> qualifications[].institutionAlias
  dates: false,           // -> tenure bands
  qualificationYears: false,
};

const flagsOf = (cv) => ({ ...DEFAULTS, ...((cv && cv.redact) || {}) });
const anyFlag = (cv) => Object.values(flagsOf(cv)).some(Boolean);

/* ────────────────────────────────────────────────────────────────── apply ── */

/**
 * @param {object} cv   a candidate record
 * @param {Date}   now  injectable for deterministic tests
 * @returns {object}    a new record with the redactions applied
 */
function redact(cv, now = new Date()) {
  const f = flagsOf(cv);
  if (!anyFlag(cv)) return cv;

  const out = clone(cv);
  const p = out.personal || (out.personal = {});

  if (f.candidateName) {
    p.fullName = isFilled(out.meta && out.meta.reference)
      ? out.meta.reference.trim()
      : (initials(p.fullName) || 'Candidate profile');
  }

  if (f.dateOfBirth) {
    const band = ageBand(cv.personal && cv.personal.dateOfBirth, now);
    p.dateOfBirth = '';
    p.ageBand = band || '';
  }

  if (f.areaOfResidence) {
    p.areaOfResidence = isFilled(p.areaAlias) ? p.areaAlias.trim() : '';
  }

  /* Contact details are never carried into a redacted profile, whatever the
     mode says. An anonymous CV with a phone number on it is not anonymous. */
  if (f.candidateName) { p.email = ''; p.phone = ''; }

  (out.experience || []).forEach((r) => {
    if (f.employerNames) r.employer = isFilled(r.alias) ? r.alias.trim() : '';
    if (f.dates) {
      r.duration = tenureBand(r.duration, now) || r.duration;
      (r.titles || []).forEach((t) => {
        t.duration = tenureBand(t.duration, now) || t.duration;
      });
    }
  });

  (out.earlyCareer || []).forEach((r) => {
    if (f.employerNames) r.employer = isFilled(r.alias) ? r.alias.trim() : '';
    if (f.dates) r.duration = tenureBand(r.duration, now) || r.duration;
  });

  (out.qualifications || []).forEach((q) => {
    if (f.institutions) q.institution = isFilled(q.institutionAlias) ? q.institutionAlias.trim() : '';
    if (f.qualificationYears) q.year = '';
  });

  (out.certifications || []).forEach((q) => {
    if (f.institutions) q.institution = isFilled(q.institutionAlias) ? q.institutionAlias.trim() : '';
    if (f.qualificationYears) q.year = '';
  });

  return out;
}

export { redact, tenureBand, ageBand, initials, flagsOf, anyFlag, DEFAULTS as REDACTION_DEFAULTS };
