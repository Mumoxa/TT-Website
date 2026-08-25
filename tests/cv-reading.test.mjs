/* Reading a candidate's own CV: the bytes of a file in, a draft record out.

   The parser is allowed to be wrong — a consultant checks it against the
   original, which is what the editor is for. What it is not allowed to do is
   invent a fact to satisfy a house rule, so most of these tests are about the
   line between reading and inventing. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { extractText } from '../src/cv-builda/cv/extract.js';
import { parseCv } from '../src/cv-builda/cv/parse.js';
import { validate } from '../src/cv-builda/cv/validate.js';

const bytes = (path) => new Uint8Array(fs.readFileSync(new URL(path, import.meta.url)));
const utf8 = (s) => new TextEncoder().encode(s);

/* ── extraction ─────────────────────────────────────────────────────────── */

test('a Word document gives up its text, its bullets and its table rows', async () => {
  const { text, format } = await extractText(
    bytes('../src/cv-builda/samples/Steyn_JJ_TalentTree_CV.docx'), 'x.docx',
  );
  assert.equal(format, 'docx');
  assert.match(text, /Jacob Johannes Steyn/);
  assert.match(text, /^• Own the 5-year retail credit portfolio model$/m,
    'list paragraphs keep a bullet marker');
  assert.match(text, /October 2024 – Present\tCredit Risk Analyst III/,
    'a two-cell table row reads as one tab-separated line');
});

test('a layout table does not collapse the whole document into one line', async () => {
  const { text } = await extractText(
    bytes('../src/cv-builda/samples/Steyn_JJ_TalentTree_CV.docx'), 'x.docx',
  );
  const longest = text.split('\n').reduce((a, b) => (a.length > b.length ? a : b));
  assert.ok(longest.length < 600, `longest line was ${longest.length} characters`);
});

test('the format is sniffed from the bytes, not the extension', async () => {
  const { format } = await extractText(
    bytes('../src/cv-builda/samples/Steyn_JJ_TalentTree_CV.docx'), 'mislabelled.doc',
  );
  assert.equal(format, 'docx');
});

test('rich text is unwrapped', async () => {
  const rtf = '{\\rtf1\\ansi Thandiwe Mokoena\\par Financial Analyst\\par}';
  const { text, format } = await extractText(utf8(rtf), 'cv.rtf');
  assert.equal(format, 'rtf');
  assert.match(text, /Thandiwe Mokoena/);
  assert.match(text, /Financial Analyst/);
});

test('a Google Docs shortcut says what to do instead of failing obscurely', async () => {
  const pointer = utf8(JSON.stringify({ doc_id: 'abc', email: 'x@y.z' }));
  await assert.rejects(
    () => extractText(pointer, 'Thandi CV.gdoc'),
    /File → Download → Microsoft Word/,
  );
});

test('a file with no text in it is refused rather than half-read', async () => {
  await assert.rejects(() => extractText(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), 'x.bin'), /could not be read/);
  await assert.rejects(() => extractText(new Uint8Array(0), 'empty.txt'), /empty/);
});

/* ── parsing ────────────────────────────────────────────────────────────── */

const CLASSIC = `Thandiwe Nomsa Mokoena
thandi@example.com
082 447 9921
14 Rosebank Road, Claremont, Cape Town

PERSONAL DETAILS
Nationality: South African
Date of Birth: 04/11/1990
Notice Period: One calendar month

PROFESSIONAL SUMMARY
Financial analyst with eight years in retail banking and treasury reporting.

WORK EXPERIENCE

Standard Bank Group
Senior Financial Analyst
March 2021 - Present
• Prepare monthly liquidity risk reporting
Key Achievements
• Reduced month-end close from nine days to four

Nedbank Limited
Financial Analyst
January 2018 - February 2021
• Produced management accounts for the retail division
Reason for leaving: Sought broader treasury exposure

EDUCATION
2017\tBCom Honours in Financial Management\tUniversity of Cape Town

REFERENCES
Available on request.`;

test('the candidate, the roles and the dates come off a plain CV', () => {
  const { cv } = parseCv(CLASSIC);
  assert.equal(cv.personal.fullName, 'Thandiwe Nomsa Mokoena');
  assert.equal(cv.personal.citizenship, 'South African');
  assert.equal(cv.personal.dateOfBirth, '4 November 1990');
  assert.equal(cv.personal.areaOfResidence, 'Claremont, Cape Town');
  assert.equal(cv.meta.targetRole, 'Senior Financial Analyst');

  assert.equal(cv.experience.length, 2);
  assert.equal(cv.experience[0].employer, 'Standard Bank Group');
  assert.equal(cv.experience[0].duration, 'March 2021 – Present');
  assert.equal(cv.experience[0].titles[0].title, 'Senior Financial Analyst');
  assert.deepEqual(cv.experience[0].achievements, ['Reduced month-end close from nine days to four']);
  assert.deepEqual(cv.experience[0].responsibilities, ['Prepare monthly liquidity risk reporting']);
  assert.equal(cv.experience[1].employer, 'Nedbank Limited');
  assert.equal(cv.experience[1].reasonForLeaving, 'Sought broader treasury exposure');

  assert.equal(cv.qualifications[0].name, 'BCom Honours in Financial Management');
  assert.equal(cv.qualifications[0].institution, 'University of Cape Town');
  assert.equal(cv.qualifications[0].year, '2017');
});

test('the employer above a date line is not mistaken for the one below it', () => {
  /* The failure this guards against put the second employer's name on the
     first role, because the name arrives after the first role's bullets. */
  const { cv } = parseCv(CLASSIC);
  assert.equal(cv.experience[0].employer, 'Standard Bank Group');
  assert.ok(!cv.experience[0].achievements.some((a) => /Financial Analyst/.test(a)),
    'a heading must not land in the bullets of the role above it');
});

test('a referees section is dropped and reported, never carried through', () => {
  const { cv, gaps } = parseCv(CLASSIC);
  assert.equal(cv.referees, undefined);
  assert.ok(gaps.some((g) => /referees section/i.test(g)));
});

test('agency mode strips the candidate contact details it finds', () => {
  const { cv, gaps } = parseCv(CLASSIC);
  assert.equal(cv.personal.email, '');
  assert.equal(cv.personal.phone, '');
  assert.ok(gaps.some((g) => /client contacts the consultant/i.test(g)));
});

test('direct mode keeps them, because the reader needs a way to reply', () => {
  const { cv } = parseCv(CLASSIC, { mode: 'direct' });
  assert.equal(cv.personal.email, 'thandi@example.com');
  assert.match(cv.personal.phone, /082/);
});

test('a street address is reduced to suburb and city', () => {
  const { cv } = parseCv(CLASSIC);
  assert.doesNotMatch(cv.personal.areaOfResidence, /Rosebank Road|14/);
});

/* ── the line between reading and inventing ─────────────────────────────── */

test('years-only dates are kept as written and raised as a gap', () => {
  const { cv, gaps } = parseCv(`EMPLOYMENT
Acme Holdings
Operations Manager
2019 - 2021
• Ran the depot`);
  assert.equal(cv.experience[0].duration, '2019 – 2021');
  assert.ok(gaps.some((g) => /years only/i.test(g)), 'the consultant is told to ask');
  /* And the validator still blocks the build, because the house format is
     months. Parsing does not get to waive a house rule. */
  assert.ok(validate(cv).errors.some((e) => /^experience\[0\]\.duration$/.test(e.field)));
});

test('a tenure stated only in the title rows is read off them', () => {
  /* "2019 - Present" against titles starting "Jul 2019" is a fact the CV
     states, only lower down. Reading it is arithmetic, not invention. */
  const { cv, gaps } = parseCv(`EMPLOYMENT HISTORY
Discovery Limited
2019 - Present
\tMar 2023 - Present\tPrincipal Software Engineer
\tJul 2019 - Feb 2023\tSoftware Engineer`);
  assert.equal(cv.experience[0].duration, 'July 2019 – Present');
  assert.equal(cv.experience[0].titles.length, 2);
  assert.ok(!gaps.some((g) => /years only/i.test(g)));
});

test('a derived tenure is refused when it would move the stated years', () => {
  const { cv } = parseCv(`EMPLOYMENT HISTORY
Discovery Limited
2015 - Present
\tMar 2023 - Present\tPrincipal Software Engineer`);
  assert.equal(cv.experience[0].duration, '2015 – Present', 'the CV said 2015; the titles do not');
});

test('an ID number is never copied into the record', () => {
  const { cv, gaps } = parseCv(`Thandiwe Mokoena
ID Number: 9011045800086

EXPERIENCE
Acme Ltd
Operations Manager
January 2019 - March 2021`);
  const serialised = JSON.stringify(cv);
  assert.doesNotMatch(serialised, /9011045800086/);
  assert.ok(gaps.some((g) => /ID number/i.test(g)));
});

/* ── the whole path ─────────────────────────────────────────────────────── */

test('a Talent Tree profile read back in rebuilds itself cleanly', async () => {
  /* The strongest check available: our own output is a CV like any other, so
     reading one back should reproduce a record that passes the validator. */
  const { text } = await extractText(
    bytes('../src/cv-builda/samples/Steyn_JJ_TalentTree_CV.docx'), 'x.docx',
  );
  const { cv } = parseCv(text);

  assert.equal(cv.personal.fullName, 'Jacob Johannes Steyn');
  assert.equal(cv.personal.dateOfBirth, '18 March 1985');
  assert.equal(cv.personal.areaOfResidence, 'Northern Suburbs, Cape Town');
  assert.equal(cv.professionalSummary.length, 5);
  assert.equal(cv.qualifications.length, 3);
  assert.equal(cv.certifications.length, 4);
  assert.equal(cv.experience.length, 1);
  assert.equal(cv.experience[0].employer, 'The Foschini Group (TFG)');
  assert.equal(cv.experience[0].duration, 'January 2019 – Present');
  assert.equal(cv.experience[0].titles.length, 4);
  assert.equal(cv.earlyCareer.length, 1);
  assert.equal(cv.earlyCareer[0].employer, 'ARGEN Actuarial Solutions');

  assert.deepEqual(validate(cv).errors, [], 'a round-tripped profile should build');
});
