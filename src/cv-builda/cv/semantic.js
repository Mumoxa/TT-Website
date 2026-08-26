/*
 * CV-Builda semantic parsing client
 *
 * The browser extracts document text, then sends that text to a server-side
 * n8n workflow. n8n owns the LLM/Ollama details. Recruiters never configure a
 * model, endpoint shape, or API key in the UI.
 *
 * The response is treated as untrusted structured data. It is normalised into
 * the existing CV-Builda record shape and obvious structural mistakes (section
 * headings, email addresses, etc. masquerading as employers) are rejected
 * before the record reaches the editor.
 */

const DEFAULT_SEMANTIC_ENDPOINT =
  'https://n8n.mumoxa.co.za/webhook/cv-builda-parse';

const MAX_SOURCE_CHARS = 80_000;
const MAX_GAPS = 30;
const MAX_LIST_ITEMS = 120;
const MAX_EXPERIENCE = 40;

class SemanticParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SemanticParseError';
    this.code = code;
  }
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/i;
const SECTION_ONLY = /^(?:work\s+experience|professional\s+experience|employment(?:\s+history)?|career\s+history|education|qualifications?|academic\s+(?:history|background)|skills?|technical\s+skills|capabilities|certifications?|courses?|references?|referees?|personal\s+details|contact\s+details|profile|summary)$/i;

const clean = (value, max = 500) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const cleanList = (value, maxItems = MAX_LIST_ITEMS, maxLength = 500) =>
  Array.isArray(value)
    ? value.map((item) => clean(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];

const clone = (value) => JSON.parse(JSON.stringify(value));

function validateEndpoint(endpoint) {
  const value = clean(endpoint, 500);
  if (!value) throw new SemanticParseError('SEMANTIC_ENDPOINT_MISSING', 'The semantic parser endpoint is not configured.');
  if (!/^https:\/\//i.test(value) && !value.startsWith('/')) {
    throw new SemanticParseError('SEMANTIC_ENDPOINT_INVALID', 'The semantic parser endpoint must use HTTPS or a same-origin path.');
  }
  return value.replace(/\/+$/, '');
}

function badEmployer(value) {
  const employer = clean(value, 180);
  if (!employer) return true;
  if (EMAIL.test(employer)) return true;
  if (SECTION_ONLY.test(employer)) return true;
  if (/^(?:e\s*d\s*u\s*c|w\s*o\s*r\s*k\s*e\s*x\s*p\s*e\s*r\s*i\s*e\s*n\s*c\s*e)$/i.test(employer.replace(/[^a-z]/gi, ''))) return true;
  return false;
}

function normaliseStudy(entries, { certification = false } = {}) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, 40).map((entry) => ({
    year: clean(entry?.year, 40),
    name: clean(entry?.name ?? entry?.qualification ?? entry?.certification, 240),
    institution: clean(entry?.institution ?? entry?.provider, 240),
    institutionAlias: clean(entry?.institutionAlias, 240),
    ...(certification ? {} : { notes: cleanList(entry?.notes, 20, 400) }),
  })).filter((entry) => entry.name || entry.institution || entry.year);
}

function normaliseSkills(groups) {
  if (!Array.isArray(groups)) return [{ group: '', items: [] }];
  const result = groups.slice(0, 20).map((group) => ({
    group: clean(group?.group, 120),
    items: cleanList(group?.items ?? group?.skills, 80, 120),
  })).filter((group) => group.group || group.items.length);
  return result.length ? result : [{ group: '', items: [] }];
}

function normaliseExperience(entries, gaps) {
  if (!Array.isArray(entries)) return [];
  const result = [];

  entries.slice(0, MAX_EXPERIENCE).forEach((entry, index) => {
    const employer = clean(entry?.employer, 180);
    if (badEmployer(employer)) {
      if (employer) gaps.push(`Ignored an invalid employer extracted from the CV: "${employer}".`);
      return;
    }

    const titles = Array.isArray(entry?.titles)
      ? entry.titles.slice(0, 20).map((title) => ({
        title: clean(title?.title, 180),
        duration: clean(title?.duration, 80),
      })).filter((title) => title.title || title.duration)
      : [];

    result.push({
      employer,
      duration: clean(entry?.duration, 80),
      alias: clean(entry?.alias, 180),
      titles,
      context: clean(entry?.context, 1200),
      reasonForLeaving: clean(entry?.reasonForLeaving, 500),
      responsibilities: cleanList(entry?.responsibilities, 80, 700),
      achievements: cleanList(entry?.achievements, 80, 700),
    });

    if (!titles.length) gaps.push(`${employer || `Experience entry ${index + 1}`}: no job title was confidently extracted.`);
  });

  return result;
}

function normaliseEarlyCareer(entries, gaps) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, 30).map((entry) => {
    const employer = clean(entry?.employer, 180);
    if (badEmployer(employer)) {
      if (employer) gaps.push(`Ignored an invalid early-career employer extracted from the CV: "${employer}".`);
      return null;
    }
    return {
      title: clean(entry?.title, 180),
      employer,
      duration: clean(entry?.duration, 80),
      alias: clean(entry?.alias, 180),
    };
  }).filter(Boolean);
}

function normaliseSemanticResponse(raw, fallbackCv) {
  const candidate = raw?.cv ?? raw?.candidate ?? raw?.data?.cv ?? raw?.data;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new SemanticParseError('SEMANTIC_INVALID_RESPONSE', 'The semantic parser returned no candidate record.');
  }

  const base = clone(fallbackCv || {});
  const gaps = cleanList(raw?.gaps ?? raw?.review ?? raw?.warnings, MAX_GAPS, 500);

  base.meta = {
    ...(base.meta || {}),
    targetRole: clean(candidate?.meta?.targetRole ?? candidate?.targetRole, 180),
    fileName: clean(candidate?.meta?.fileName, 180) || base?.meta?.fileName || '',
    mode: base?.meta?.mode === 'direct' ? 'direct' : 'agency',
  };

  base.personal = {
    ...(base.personal || {}),
    fullName: clean(candidate?.personal?.fullName, 180),
    citizenship: clean(candidate?.personal?.citizenship, 120),
    languages: clean(candidate?.personal?.languages, 240),
    dateOfBirth: clean(candidate?.personal?.dateOfBirth, 80),
    areaOfResidence: clean(candidate?.personal?.areaOfResidence, 240),
    availability: clean(candidate?.personal?.availability, 180),
    driversLicence: clean(candidate?.personal?.driversLicence, 120),
    ownTransport: clean(candidate?.personal?.ownTransport, 120),
    eeStatus: clean(candidate?.personal?.eeStatus, 120),
    areaAlias: clean(candidate?.personal?.areaAlias, 240),
    email: base?.meta?.mode === 'direct' ? clean(candidate?.personal?.email, 180) : '',
    phone: base?.meta?.mode === 'direct' ? clean(candidate?.personal?.phone, 120) : '',
  };

  base.professionalSummary = cleanList(candidate?.professionalSummary, 12, 700);
  base.careerSummary = cleanList(candidate?.careerSummary, 20, 700);
  base.qualifications = normaliseStudy(candidate?.qualifications);
  base.certifications = normaliseStudy(candidate?.certifications, { certification: true });
  base.technicalSkills = normaliseSkills(candidate?.technicalSkills);
  base.experience = normaliseExperience(candidate?.experience, gaps);
  base.earlyCareer = normaliseEarlyCareer(candidate?.earlyCareer, gaps);

  delete base.referees;

  if (!base.personal.fullName) gaps.push('The semantic parser did not confidently identify the candidate name.');
  if (!base.experience.length) gaps.push('The semantic parser did not confidently identify employment history.');

  return {
    cv: base,
    gaps: [...new Set(gaps)].slice(0, MAX_GAPS),
    evidence: Array.isArray(raw?.evidence) ? raw.evidence.slice(0, 200) : [],
    engine: clean(raw?.engine, 80) || 'semantic',
  };
}

function buildRequest(sourceText, options = {}) {
  if (typeof sourceText !== 'string' || !sourceText.trim()) {
    throw new SemanticParseError('SEMANTIC_NO_SOURCE', 'No extracted CV text is available for semantic parsing.');
  }
  if (sourceText.length > MAX_SOURCE_CHARS) {
    throw new SemanticParseError('SEMANTIC_SOURCE_TOO_LARGE', 'The combined CV source is too large for one semantic parsing request.');
  }

  return {
    version: '1.0',
    task: 'talent-tree-cv-extraction',
    mode: options.mode === 'direct' ? 'direct' : 'agency',
    fileName: clean(options.fileName, 180),
    sourceText,
    rules: {
      factsOnly: true,
      nullWhenMissing: true,
      preserveYearOnlyDates: true,
      neverInventMonths: true,
      neverTreatSectionHeadingsAsEmployers: true,
      neverTreatEmailsOrPhoneNumbersAsEmployers: true,
      omitCandidateContactInAgencyMode: true,
    },
  };
}

async function requestSemanticParse(sourceText, options = {}) {
  const endpoint = validateEndpoint(options.endpoint || DEFAULT_SEMANTIC_ENDPOINT);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new SemanticParseError('SEMANTIC_UNAVAILABLE', 'This browser cannot reach the semantic parser.');
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 35_000, 5_000), 90_000);
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(sourceText, options)),
      signal: controller?.signal,
    });
  } catch (error) {
    if (timer) clearTimeout(timer);
    if (error?.name === 'AbortError') {
      throw new SemanticParseError('SEMANTIC_TIMEOUT', 'The semantic parser took too long to respond.');
    }
    throw new SemanticParseError('SEMANTIC_UNAVAILABLE', 'The semantic parser could not be reached.');
  }
  if (timer) clearTimeout(timer);

  if (!response?.ok) {
    throw new SemanticParseError('SEMANTIC_SERVICE_ERROR', `The semantic parser returned HTTP ${response?.status || 'error'}.`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new SemanticParseError('SEMANTIC_INVALID_RESPONSE', 'The semantic parser did not return JSON.');
  }

  return normaliseSemanticResponse(body, options.fallbackCv);
}

export {
  DEFAULT_SEMANTIC_ENDPOINT,
  MAX_SOURCE_CHARS,
  SemanticParseError,
  badEmployer,
  buildRequest,
  normaliseSemanticResponse,
  requestSemanticParse,
  validateEndpoint,
};
