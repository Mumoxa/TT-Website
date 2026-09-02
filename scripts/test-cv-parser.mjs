import fs from 'node:fs/promises';
import process from 'node:process';

const [filePath, endpointArg] = process.argv.slice(2);
if (!filePath) {
  console.error('Usage: node scripts/test-cv-parser.mjs <extracted-cv.txt> [endpoint]');
  process.exit(2);
}

const endpoint = endpointArg || process.env.CV_PARSE_ENDPOINT || 'http://localhost:8788/api/cv-parse';
const sourceText = (await fs.readFile(filePath, 'utf8')).trim();
if (!sourceText) {
  console.error('The supplied CV text file is empty.');
  process.exit(2);
}

const headers = { 'Content-Type': 'application/json' };
if (process.env.CV_PARSE_TOKEN) headers['X-CV-Parser-Key'] = process.env.CV_PARSE_TOKEN;

const response = await fetch(endpoint, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    schemaVersion: 1,
    sourceText,
    fileName: filePath.split(/[\\/]/).pop(),
    mode: 'agency',
  }),
});

const raw = await response.text();
let body;
try {
  body = JSON.parse(raw);
} catch {
  console.error(`Parser returned non-JSON (HTTP ${response.status}).`);
  process.exit(1);
}

if (!response.ok) {
  console.error(`Parser failed (HTTP ${response.status}): ${body?.error || 'unknown error'}`);
  process.exit(1);
}

const cv = body.cv || body.record || body;
const experience = Array.isArray(cv?.experience) ? cv.experience : [];
const invalidEmployer = /^(?:work\s+experience|professional\s+experience|employment\s+history|career\s+history|education|qualifications?|academic\s+history|skills|technical\s+skills|profile|professional\s+profile|summary|references?|referees?|personal\s+details)$/i;
const spacedHeading = /^(?:[A-Za-z]\s+){2,}[A-Za-z]$/;
const qualificationLike = /\b(?:ndip|national\s+diploma|diploma|degree|bcom|bsc|btech|mtech|phd|matric|grade\s*12)\b/i;
const email = /[\w.+-]+@[\w-]+\.[\w.]+/i;

const bad = experience
  .map((entry) => String(entry?.employer || '').trim())
  .filter((employer) => !employer || invalidEmployer.test(employer) || spacedHeading.test(employer) || qualificationLike.test(employer) || email.test(employer));

console.log(JSON.stringify({
  endpoint,
  candidate: cv?.personal?.fullName || '',
  targetRole: cv?.meta?.targetRole || '',
  qualifications: Array.isArray(cv?.qualifications) ? cv.qualifications.length : 0,
  employers: experience.map((entry) => entry.employer),
  gaps: Array.isArray(body.gaps) ? body.gaps : [],
  evidenceCount: Array.isArray(body.evidence)
    ? body.evidence.length
    : body.evidence && typeof body.evidence === 'object'
      ? Object.keys(body.evidence).length
      : 0,
}, null, 2));

if (bad.length) {
  console.error('STRUCTURAL REGRESSION: invalid employer classifications:', bad);
  process.exit(1);
}

console.log('PASS: no structural employer regression detected.');
