import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SEMANTIC_ENDPOINT,
  badEmployer,
  buildRequest,
  normaliseSemanticResponse,
  requestSemanticParse,
} from '../src/cv-builda/cv/semantic.js';

const FALLBACK = {
  meta: { targetRole: '', fileName: 'candidate_cv', mode: 'agency', reference: '' },
  redact: {},
  personal: {
    fullName: '', citizenship: '', languages: '', dateOfBirth: '', areaOfResidence: '',
    availability: '', driversLicence: '', ownTransport: '', eeStatus: '', email: '', phone: '', areaAlias: '',
  },
  consultant: { contactPerson: 'Talent Tree', contactNumber: '', emailAddress: '' },
  professionalSummary: [],
  careerSummary: [],
  qualifications: [],
  certifications: [],
  technicalSkills: [{ group: '', items: [] }],
  experience: [],
  earlyCareer: [],
};

test('the browser contract sends facts-only rules and no provider credentials', () => {
  const request = buildRequest('Jane Doe\nWORK EXPERIENCE\nAcme Ltd', { fileName: 'Jane.pdf' });
  assert.equal(request.task, 'talent-tree-cv-extraction');
  assert.equal(request.rules.factsOnly, true);
  assert.equal(request.rules.neverInventMonths, true);
  assert.equal(request.sourceText.includes('WORK EXPERIENCE'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(request, 'apiKey'), false);
  assert.equal(DEFAULT_SEMANTIC_ENDPOINT, '/api/cv-parse');
});

test('obvious headings and email addresses are not valid employers', () => {
  assert.equal(badEmployer('WORK EXPERIENCE'), true);
  assert.equal(badEmployer('Education'), true);
  assert.equal(badEmployer('person@example.com'), true);
  assert.equal(badEmployer('Adcock Ingram'), false);
});

test('semantic response is normalised into the existing CV-Builda shape', () => {
  const result = normaliseSemanticResponse({
    cv: {
      meta: { targetRole: 'Financial Manager' },
      personal: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '082 000 0000',
      },
      experience: [
        { employer: 'WORK EXPERIENCE', duration: '', titles: [] },
        {
          employer: 'Acme Holdings',
          duration: '2019 – 2021',
          titles: [{ title: 'Accountant', duration: '2019 – 2021' }],
          responsibilities: ['Prepared management accounts'],
        },
      ],
    },
  }, FALLBACK);

  assert.equal(result.cv.personal.fullName, 'Jane Doe');
  assert.equal(result.cv.personal.email, '', 'agency mode never carries candidate email');
  assert.equal(result.cv.experience.length, 1);
  assert.equal(result.cv.experience[0].employer, 'Acme Holdings');
  assert.equal(result.cv.experience[0].duration, '2019 – 2021');
  assert.ok(result.gaps.some((gap) => /invalid employer/i.test(gap)));
});

test('requestSemanticParse accepts a clean n8n response', async () => {
  let called;
  const result = await requestSemanticParse('Jane Doe\nAcme Holdings', {
    endpoint: 'https://example.test/webhook/cv-builda-parse',
    fallbackCv: FALLBACK,
    fetchImpl: async (url, options) => {
      called = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          cv: {
            personal: { fullName: 'Jane Doe' },
            experience: [{ employer: 'Acme Holdings', duration: '2020 – Present', titles: [{ title: 'Manager', duration: '2020 – Present' }] }],
          },
        }),
      };
    },
  });

  assert.equal(called.url, 'https://example.test/webhook/cv-builda-parse');
  assert.equal(called.options.headers['Content-Type'], 'application/json');
  assert.equal(result.cv.experience[0].employer, 'Acme Holdings');
});
