/* CV-Builda: the rules that decide what a client is allowed to receive.
   These are the checks worth having in CI — a regression here does not break
   a page, it sends a candidate's employer or contact details to a client. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Packer } from 'docx';

import { validate } from '../src/cv-builda/cv/validate.js';
import { redact } from '../src/cv-builda/cv/redact.js';
import { compose, fileNameFor } from '../src/cv-builda/cv/compose.js';

const EXAMPLE = JSON.parse(
  fs.readFileSync(new URL('../src/cv-builda/anonymous-example.json', import.meta.url), 'utf8'),
);

const clone = (o) => JSON.parse(JSON.stringify(o));
const open = () => {
  const cv = clone(EXAMPLE);
  Object.keys(cv.redact).forEach((k) => { cv.redact[k] = false; });
  return cv;
};
const issue = (report, field) => report.all.find((i) => i.field === field);

/* ── the worked example is the baseline: it must stay buildable ─────────── */

test('the worked example passes the validator', () => {
  const report = validate(clone(EXAMPLE));
  assert.deepEqual(report.errors, [], 'the shipped example should have no errors');
  assert.ok(report.ok);
});

/* ── no referees ────────────────────────────────────────────────────────── */

test('the composed document carries no referees section', async () => {
  const cv = open();
  cv.referees = 'Available on request.';   // a data file written before the rule
  const xml = await documentXml(cv);
  assert.doesNotMatch(xml, /Referees<\/w:t>/);
  assert.doesNotMatch(xml, /Available on request/);
});

test('a record still carrying referees is reported', () => {
  const cv = open();
  cv.referees = 'Available on request.';
  const found = issue(validate(cv), 'referees');
  assert.ok(found, 'the field should be reported rather than silently ignored');
  assert.equal(found.level, 'warning');
});

/* ── contact details never reach an agency profile ──────────────────────── */

test('agency mode blocks candidate contact details in employer prose', () => {
  const cv = open();
  cv.experience[0].context = 'Email jane@example.com.';
  const report = validate(cv);
  assert.equal(report.ok, false);
  assert.match(issue(report, 'experience[0].context').message, /email address/);
});

test('agency mode blocks a phone number in the reason for leaving', () => {
  const cv = open();
  cv.experience[0].reasonForLeaving = 'Call 072 740 0439';
  assert.match(issue(validate(cv), 'experience[0].reasonForLeaving').message, /phone number/);
});

/* ── a blind profile has to be blind in the prose too ───────────────────── */

test('a redacted institution named in the prose is an error', () => {
  const cv = clone(EXAMPLE);
  cv.professionalSummary[0] = 'Trained at North-West University and now works in credit risk.';
  const report = validate(cv);
  assert.equal(report.ok, false);
  assert.match(issue(report, 'professionalSummary[0]').message, /institution name/);
});

test('a redacted institution named in a qualification note is an error', () => {
  const cv = clone(EXAMPLE);
  cv.qualifications[0].notes = ['Completed at North-West University'];
  assert.match(issue(validate(cv), 'qualifications[0].notes[0]').message, /institution name/);
});

test('a provider name the candidate also lists as a skill is not flagged', () => {
  /* "SAS Institute" against a candidate who works in SAS. Flagging that would
     mark every line naming the tool and train people to ignore the check. */
  const cv = clone(EXAMPLE);
  assert.equal(validate(cv).errors.length, 0);
  assert.ok(cv.professionalSummary.some((l) => /\bSAS\b/.test(l)), 'the example names SAS');
});

/* ── the one combination the settings cannot both have ──────────────────── */

test('direct mode refuses to hide the candidate name', () => {
  const cv = clone(EXAMPLE);
  cv.meta.mode = 'direct';
  cv.personal.email = 'jj.steyn@example.com';
  const report = validate(cv);
  assert.equal(report.ok, false, 'the document would have no way to reach anyone');
  assert.equal(issue(report, 'redact.candidateName').level, 'error');
});

test('direct mode is fine when nothing is hidden', () => {
  const cv = open();
  cv.meta.mode = 'direct';
  cv.personal.email = 'jj.steyn@example.com';
  assert.ok(validate(cv).ok);
});

/* ── dates ──────────────────────────────────────────────────────────────── */

test('a tenure that ends before it starts is rejected', () => {
  const cv = open();
  cv.experience[0].duration = 'January 2025 – January 2020';
  assert.match(issue(validate(cv), 'experience[0].duration').message, /ends before it starts/);
});

/* ── redaction is a view, never a deletion ──────────────────────────────── */

test('redaction returns a new record and leaves the original intact', () => {
  const cv = clone(EXAMPLE);
  const before = cv.experience[0].employer;
  const view = redact(cv);
  assert.equal(cv.experience[0].employer, before, 'the stored record keeps the real employer');
  assert.equal(view.experience[0].employer, cv.experience[0].alias);
  assert.notEqual(view.personal.fullName, cv.personal.fullName);
});

test('a blind document contains neither the name nor the employer', async () => {
  const xml = await documentXml(clone(EXAMPLE));
  assert.doesNotMatch(xml, /Foschini/);
  assert.doesNotMatch(xml, /Jacob Johannes Steyn/);
  assert.match(xml, /Candidate TT-4821/);
});

test('an open document contains both', async () => {
  const xml = await documentXml(open());
  assert.match(xml, /Foschini/);
  assert.match(xml, /Jacob Johannes Steyn/);
});

/* ── the document itself ────────────────────────────────────────────────── */

test('an agency profile has a cover page and a direct one does not', async () => {
  const agency = await documentXml(open());
  /* Two sections: the full-bleed cover, then the body with its margins. */
  assert.equal((agency.match(/<w:sectPr>/g) || []).length, 2);
  assert.match(agency, /Candidate profile/);

  const cv = open();
  cv.meta.mode = 'direct';
  cv.personal.email = 'jj.steyn@example.com';
  const direct = await documentXml(cv);
  assert.equal((direct.match(/<w:sectPr>/g) || []).length, 1);
  assert.doesNotMatch(direct, /Candidate profile/);
});

test('the confidentiality notice is on agency profiles only', async () => {
  const agency = await footerXml(open());
  assert.match(agency, /absolute confidentiality/);

  const cv = open();
  cv.meta.mode = 'direct';
  cv.personal.email = 'jj.steyn@example.com';
  assert.doesNotMatch(await footerXml(cv), /absolute confidentiality/);
});

test('file names are derived when none is set', () => {
  const cv = open();
  cv.meta.fileName = '';
  assert.equal(fileNameFor(cv), 'Steyn_JJ_TalentTree_CV');
  cv.meta.mode = 'direct';
  assert.equal(fileNameFor(cv), 'Steyn_JJ_CV_direct');
  cv.meta.fileName = 'Custom_Name.docx';
  assert.equal(fileNameFor(cv), 'Custom_Name');
});

test('a blind file name never leaks the real name', () => {
  const cv = clone(EXAMPLE);
  cv.meta.fileName = '';
  assert.doesNotMatch(fileNameFor(cv), /Steyn/);
});

/* ── helpers ────────────────────────────────────────────────────────────── */

async function part(cv, name) {
  const buffer = await Packer.toBuffer(compose(cv));
  return readZipEntry(buffer, name);
}

const documentXml = (cv) => part(cv, 'word/document.xml');
const footerXml = (cv) => part(cv, 'word/footer1.xml');

/**
 * A .docx is a zip. Rather than add a dependency to read one part out of it,
 * this walks the central directory and inflates the entry itself.
 */
function readZipEntry(buffer, name) {
  const target = Buffer.from(name, 'utf8');
  let offset = buffer.length - 22;
  while (offset >= 0 && buffer.readUInt32LE(offset) !== 0x06054b50) offset--;
  assert.ok(offset >= 0, 'no end-of-central-directory record');

  let entry = buffer.readUInt32LE(offset + 16);
  const count = buffer.readUInt16LE(offset + 10);
  for (let i = 0; i < count; i++) {
    const nameLength = buffer.readUInt16LE(entry + 28);
    const extraLength = buffer.readUInt16LE(entry + 30);
    const commentLength = buffer.readUInt16LE(entry + 32);
    const localOffset = buffer.readUInt32LE(entry + 42);
    const found = buffer.subarray(entry + 46, entry + 46 + nameLength);

    if (found.equals(target)) {
      const method = buffer.readUInt16LE(entry + 10);
      const compressed = buffer.readUInt32LE(entry + 20);
      const localName = buffer.readUInt16LE(localOffset + 26);
      const localExtra = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      const bytes = buffer.subarray(start, start + compressed);
      return (method === 0 ? bytes : zlib.inflateRawSync(bytes)).toString('utf8');
    }
    entry += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${name} not found in the document`);
}
