import { parseCv } from './parse.js';
import { REDACTION_DEFAULTS } from './redact.js';

const DEFAULT_ENDPOINT = '/api/cv-parse';
const MAX_SOURCE_CHARS = 60_000;
const REQUEST_TIMEOUT_MS = 90_000;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/i;
const SECTION_LABEL = /^(?:work\s+experience|professional\s+experience|employment\s+history|career\s+history|education|qualifications?|academic\s+history|skills|technical\s+skills|profile|professional\s+profile|summary|references?|referees?|personal\s+details)$/i;
const SPACED_HEADING = /^(?:[A-Za-z]\s+){2,}[A-Za-z]$/;
const QUALIFICATION_LIKE_EMPLOYER = /\b(?:ndip|national\s+diploma|diploma|degree|bcom|bsc|btech|mtech|phd|matric|grade\s*12)\b/i;

class SmartParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SmartParseError';
    this.code = code;
  }
}

function clean(value, max = 5000) {
  return typeof value === 'string' ? value.replace(/\r/g, '').trim().slice(0, max) : '';
}

function cleanList(value, maxItems = 80, maxLength = 2000) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => clean(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function baseRecord(mode = 'agency') {
  return {
    meta: { targetRole: '', fileName: '', mode: mode === 'direct' ? 'direct' : 'agency', reference: '' },
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

function normalizeStudy(entry, withNotes) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const item = {
    year: clean(entry.year, 80),
    name: clean(entry.name, 300),
    institution: clean(entry.institution, 300),
    institutionAlias: clean(entry.institutionAlias, 300),
  };
  if (withNotes) item.notes = cleanList(entry.notes, 20, 1000);
  if (!item.year && !item.name && !item.institution) return null;
  return item;
}

function normalizeExperience(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const employer = clean(entry.employer, 300);
  if (!employer) return null;
  if (EMAIL.test(employer) || SECTION_LABEL.test(employer) || SPACED_HEADING.test(employer) || QUALIFICATION_LIKE_EMPLOYER.test(employer)) {
    throw new SmartParseError('AI_STRUCTURAL_ERROR', `The AI returned an invalid employer value: ${employer}`);
  }
  const titles = Array.isArray(entry.titles)
    ? entry.titles
      .filter((title) => title && typeof title === 'object' && !Array.isArray(title))
      .map((title) => ({ title: clean(title.title, 300), duration: clean(title.duration, 120) }))
      .filter((title) => title.title || title.duration)
      .slice(0, 20)
    : [];
  return {
    employer,
    duration: clean(entry.duration, 120),
    alias: clean(entry.alias, 300),
    titles,
    context: clean(entry.context, 1500),
    reasonForLeaving: clean(entry.reasonForLeaving, 500),
    responsibilities: cleanList(entry.responsibilities, 80, 2000),
    achievements: cleanList(entry.achievements, 50, 2000),
  };
}

function normalizeCv(rawCv, { mode = 'agency', fileName = '' } = {}) {
  if (!rawCv || typeof rawCv !== 'object' || Array.isArray(rawCv)) {
    throw new SmartParseError('AI_INVALID_RECORD', 'The AI parser did not return a candidate record.');
  }

  const base = baseRecord(mode);
  const cv = {
    ...base,
    meta: { ...base.meta, ...(rawCv.meta || {}) },
    personal: { ...base.personal, ...(rawCv.personal || {}) },
    consultant: base.consultant,
    redact: { ...base.redact, ...(rawCv.redact || {}) },
  };

  cv.meta.mode = mode === 'direct' ? 'direct' : 'agency';
  cv.meta.targetRole = clean(cv.meta.targetRole, 300);
  cv.meta.fileName = clean(fileName || cv.meta.fileName, 300);
  cv.meta.reference = clean(cv.meta.reference, 120);

  Object.keys(base.personal).forEach((key) => {
    cv.personal[key] = clean(cv.personal[key], key === 'email' || key === 'phone' ? 200 : 500);
  });
  if (cv.meta.mode !== 'direct') {
    cv.personal.email = '';
    cv.personal.phone = '';
  }

  cv.professionalSummary = cleanList(rawCv.professionalSummary, 12, 1200);
  cv.careerSummary = cleanList(rawCv.careerSummary, 30, 1200);
  cv.qualifications = (Array.isArray(rawCv.qualifications) ? rawCv.qualifications : [])
    .map((entry) => normalizeStudy(entry, true)).filter(Boolean).slice(0, 30);
  cv.certifications = (Array.isArray(rawCv.certifications) ? rawCv.certifications : [])
    .map((entry) => normalizeStudy(entry, false)).filter(Boolean).slice(0, 40);
  cv.technicalSkills = (Array.isArray(rawCv.technicalSkills) ? rawCv.technicalSkills : [])
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({ group: clean(entry.group, 120), items: cleanList(entry.items, 100, 120) }))
    .filter((entry) => entry.group || entry.items.length)
    .slice(0, 20);
  if (!cv.technicalSkills.length) cv.technicalSkills = [{ group: '', items: [] }];

  cv.experience = (Array.isArray(rawCv.experience) ? rawCv.experience : [])
    .map(normalizeExperience).filter(Boolean).slice(0, 60);
  cv.earlyCareer = (Array.isArray(rawCv.earlyCareer) ? rawCv.earlyCareer : [])
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      title: clean(entry.title, 300),
      employer: clean(entry.employer, 300),
      duration: clean(entry.duration, 120),
      alias: clean(entry.alias, 300),
    }))
    .filter((entry) => entry.title || entry.employer || entry.duration)
    .slice(0, 60);

  if (!cv.personal.fullName && !cv.experience.length && !cv.qualifications.length) {
    throw new SmartParseError('AI_EMPTY_RECORD', 'The AI parser returned no usable candidate information.');
  }

  return cv;
}

function normalizeServiceResponse(body, options) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SmartParseError('AI_INVALID_RESPONSE', 'The CV parsing service returned invalid JSON.');
  }
  const rawCv = body.cv || body.record || body;
  const cv = normalizeCv(rawCv, options);
  const gaps = cleanList(body.gaps || body.warnings, 30, 500);
  let evidence = {};
  if (Array.isArray(body.evidence)) {
    evidence = Object.fromEntries(
      body.evidence
        .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        .map((item) => [clean(item.field, 160), {
          quote: clean(item.quote, 500),
          confidence: clean(item.confidence, 20),
        }])
        .filter(([field, item]) => field && item.quote),
    );
  } else if (body.evidence && typeof body.evidence === 'object') {
    evidence = body.evidence;
  }
  return { cv, gaps, evidence };
}

function validateEndpoint(endpoint) {
  const value = clean(endpoint || DEFAULT_ENDPOINT, 500);
  if (!value) throw new SmartParseError('AI_ENDPOINT_MISSING', 'No CV parsing endpoint is configured.');
  if (value.startsWith('/')) return value;
  let url;
  try { url = new URL(value); } catch {
    throw new SmartParseError('AI_ENDPOINT_INVALID', 'The CV parsing endpoint is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SmartParseError('AI_ENDPOINT_INVALID', 'The CV parsing endpoint must use HTTP or HTTPS.');
  }
  return value;
}

async function requestStructuredCv(sourceText, options = {}) {
  const source = typeof sourceText === 'string' ? sourceText.trim() : '';
  if (!source) throw new SmartParseError('AI_NO_SOURCE', 'No extracted CV text was supplied.');
  if (source.length > MAX_SOURCE_CHARS) {
    throw new SmartParseError('AI_SOURCE_TOO_LARGE', `The CV text exceeds ${MAX_SOURCE_CHARS.toLocaleString()} characters.`);
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new SmartParseError('AI_UNAVAILABLE', 'Fetch is unavailable in this browser.');
  const endpoint = validateEndpoint(options.endpoint);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || REQUEST_TIMEOUT_MS, 5_000), 120_000);
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        sourceText: source,
        fileName: clean(options.fileName, 300),
        mode: options.mode === 'direct' ? 'direct' : 'agency',
      }),
      signal: controller?.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new SmartParseError('AI_TIMEOUT', 'The CV parsing service timed out.');
    throw new SmartParseError('AI_UNAVAILABLE', 'The CV parsing service could not be reached.');
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response?.ok) {
    if (response?.status === 429) throw new SmartParseError('AI_BUSY', 'The CV parsing service is busy.');
    throw new SmartParseError('AI_SERVICE_ERROR', `The CV parsing service returned HTTP ${response?.status || 'error'}.`);
  }

  let body;
  try { body = await response.json(); } catch {
    throw new SmartParseError('AI_INVALID_RESPONSE', 'The CV parsing service did not return JSON.');
  }
  return normalizeServiceResponse(body, options);
}

async function parseCvSmart(sourceText, options = {}) {
  const fallback = () => {
    const parsed = parseCv(sourceText, options);
    return { ...parsed, evidence: {}, parser: 'deterministic', aiError: null };
  };

  if (options.ai === false || !options.endpoint) return fallback();

  try {
    const parsed = await requestStructuredCv(sourceText, options);
    return { ...parsed, parser: 'structured-ai', aiError: null };
  } catch (error) {
    if (options.fallback === false) throw error;
    const parsed = fallback();
    return {
      ...parsed,
      aiError: { code: error?.code || 'AI_ERROR', message: error?.message || 'AI parsing failed.' },
      gaps: [
        ...(parsed.gaps || []),
        'AI extraction was unavailable, so CV-Builda used the legacy parser. Review the extracted fields carefully.',
      ],
    };
  }
}

export {
  DEFAULT_ENDPOINT,
  MAX_SOURCE_CHARS,
  SmartParseError,
  normalizeCv,
  normalizeServiceResponse,
  parseCvSmart,
  requestStructuredCv,
  validateEndpoint,
};
