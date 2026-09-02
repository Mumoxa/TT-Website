import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCv,
  normalizeServiceResponse,
  parseCvSmart,
  SmartParseError,
} from '../src/cv-builda/cv/smart-parse.js';

test('normalizeCv keeps year-only dates and valid employers', () => {
  const cv = normalizeCv({
    personal: { fullName: 'Example Candidate' },
    qualifications: [{ year: '2013 – 2016', name: 'NDip Industrial Engineering', institution: 'Example University' }],
    experience: [{
      employer: 'Adcock Ingram',
      duration: '2019 – 2021',
      titles: [{ title: 'Planner', duration: '2019 – 2021' }],
      responsibilities: ['Planned production schedules'],
      achievements: [],
    }],
  }, { mode: 'agency', fileName: 'candidate.pdf' });

  assert.equal(cv.qualifications[0].year, '2013 – 2016');
  assert.equal(cv.experience[0].duration, '2019 – 2021');
  assert.equal(cv.experience[0].employer, 'Adcock Ingram');
  assert.equal(cv.meta.fileName, 'candidate.pdf');
});

test('normalizeCv rejects an email address as an employer', () => {
  assert.throws(() => normalizeCv({
    personal: { fullName: 'Example Candidate' },
    experience: [{ employer: 'candidate@example.com', duration: '', titles: [] }],
  }), (error) => error instanceof SmartParseError && error.code === 'AI_STRUCTURAL_ERROR');
});

test('normalizeCv rejects a section heading as an employer', () => {
  assert.throws(() => normalizeCv({
    personal: { fullName: 'Example Candidate' },
    experience: [{ employer: 'WORK EXPERIENCE', duration: '', titles: [] }],
  }), (error) => error instanceof SmartParseError && error.code === 'AI_STRUCTURAL_ERROR');
});

test('agency mode strips candidate email and phone from the profile record', () => {
  const cv = normalizeCv({
    personal: {
      fullName: 'Example Candidate',
      email: 'candidate@example.com',
      phone: '082 000 0000',
    },
  }, { mode: 'agency' });

  assert.equal(cv.personal.email, '');
  assert.equal(cv.personal.phone, '');
});

test('service response accepts cv, gaps and evidence', () => {
  const result = normalizeServiceResponse({
    cv: { personal: { fullName: 'Example Candidate' } },
    gaps: ['Availability not stated'],
    evidence: { 'personal.fullName': { quote: 'Example Candidate' } },
  }, { mode: 'agency' });

  assert.equal(result.cv.personal.fullName, 'Example Candidate');
  assert.deepEqual(result.gaps, ['Availability not stated']);
  assert.equal(result.evidence['personal.fullName'].quote, 'Example Candidate');
});

test('parseCvSmart falls back to the deterministic parser when AI is disabled', async () => {
  const result = await parseCvSmart(`Example Candidate\n\nWORK EXPERIENCE\nAdcock Ingram\nPlanner\n2019 – 2021`, {
    ai: false,
    fileName: 'candidate.txt',
  });

  assert.equal(result.parser, 'deterministic');
  assert.equal(result.aiError, null);
});


test('Bomikazi regression rejects spaced headings and qualification text as employers', () => {
  for (const employer of ['E D U C', 'NDip Industrial', 'W O R K E X P E R I E N C E', '✉ Bomikazi.mditshwa@gmail.com']) {
    assert.throws(() => normalizeCv({
      personal: { fullName: 'Bomikazi Mditshwa' },
      experience: [{ employer, duration: '', titles: [] }],
    }), (error) => error instanceof SmartParseError && error.code === 'AI_STRUCTURAL_ERROR');
  }
});

test('service response converts evidence arrays into field-keyed provenance', () => {
  const result = normalizeServiceResponse({
    cv: { personal: { fullName: 'Bomikazi Mditshwa' } },
    gaps: [],
    evidence: [
      { field: 'personal.fullName', quote: 'Bomikazi Mditshwa', confidence: 'high' },
    ],
  }, { mode: 'agency' });

  assert.equal(result.evidence['personal.fullName'].quote, 'Bomikazi Mditshwa');
  assert.equal(result.evidence['personal.fullName'].confidence, 'high');
});