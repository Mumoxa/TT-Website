/* ============================================================================
   TALENT TREE — CV-BUILDA ENHANCEMENTS TEST SUITE
   ----------------------------------------------------------------------------
   Verifies advanced parsing, multi-column handling, multi-document merging,
   LinkedIn profile support, auto-synthesis of profile bullets, and quick-clean.
   ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCv, synthesizeProfile, mergeCvRecords, standardizeCv } from '../src/cv-builda/cv/parse.js';
import { validate } from '../src/cv-builda/cv/validate.js';

test('parses a CV with numbered section headings and delimiter variations', () => {
  const text = `LeZaria Khumalo
lezaria.k@example.com
082 123 4567
Johannesburg, South Africa

1. WORK EXPERIENCE
Vodacom Group
Senior Business Analyst
January 2021 - Present
• Led digital transformation initiatives across enterprise billing
• Delivered executive KPI reporting frameworks

2. EDUCATION & QUALIFICATIONS
2018\tBCom Information Systems\tUniversity of Johannesburg

3. TECHNICAL SKILLS & TOOLS
SQL, Python, Agile, Jira, Tableau, PowerBI
`;

  const { cv, gaps } = parseCv(text, { fileName: 'LeZaria_CV_2026.pdf' });
  assert.equal(cv.personal.fullName, 'LeZaria Khumalo');
  assert.equal(cv.meta.targetRole, 'Senior Business Analyst');
  assert.equal(cv.experience.length, 1);
  assert.equal(cv.experience[0].employer, 'Vodacom Group');
  assert.equal(cv.experience[0].duration, 'January 2021 – Present');
  assert.equal(cv.experience[0].titles[0].title, 'Senior Business Analyst');
  assert.equal(cv.qualifications.length, 1);
  assert.equal(cv.qualifications[0].name, 'BCom Information Systems');
  assert.equal(cv.qualifications[0].institution, 'University of Johannesburg');
  assert.ok(cv.technicalSkills[0].items.length >= 5);
  // Auto-synthesized profile bullets should satisfy the 4-bullet minimum
  assert.ok(cv.professionalSummary.length >= 4);
});

test('parses a LinkedIn profile export with standard LinkedIn structure and date markers', () => {
  const linkedin = `Johnathan Mokoena
Senior Data Engineer
Cape Town, Western Cape, South Africa

Contact
jmokoena@example.com
083 999 1234
www.linkedin.com/in/jmokoena

Top Skills
Python
Apache Spark
AWS

Certifications
AWS Certified Data Analytics
Databricks Certified Associate Developer

Summary
Senior Data Engineer with 7 years of experience building petabyte-scale streaming pipelines.

Experience
Discovery Limited
Senior Data Engineer
Jan 2021 - Present · 3 yrs 8 mos
Cape Town, South Africa
• Architected real-time event streaming architectures
• Optimized distributed data warehousing workflows

Standard Bank
Data Engineer
Jan 2018 - Dec 2020 · 3 yrs
• Implemented automated ETL pipelines

Education
University of Cape Town
Bachelor of Science (BSc), Computer Science
2014 - 2017
`;

  const { cv } = parseCv(linkedin);
  assert.equal(cv.personal.fullName, 'Johnathan Mokoena');
  assert.equal(cv.meta.targetRole, 'Senior Data Engineer');
  assert.equal(cv.experience.length, 2);
  assert.equal(cv.experience[0].employer, 'Discovery Limited');
  assert.equal(cv.experience[0].duration, 'January 2021 – Present');
  assert.equal(cv.experience[0].titles[0].title, 'Senior Data Engineer');
  assert.equal(cv.experience[1].employer, 'Standard Bank');
  assert.equal(cv.experience[1].duration, 'January 2018 – December 2020');
  assert.equal(cv.qualifications.length, 1);
  assert.equal(cv.qualifications[0].name, 'Bachelor of Science (BSc), Computer Science');
  assert.equal(cv.qualifications[0].institution, 'University of Cape Town');
  assert.equal(cv.certifications.length, 2);
  assert.ok(cv.technicalSkills[0].items.includes('Python'));
  assert.ok(cv.professionalSummary.length >= 4);
});

test('extracts candidate name from file name when no explicit name heading is present', () => {
  const text = `lezaria@gmail.com
072 000 1122
Johannesburg, South Africa

EXPERIENCE
Nedbank Limited
Risk Consultant
March 2020 - Present
• Risk analysis and compliance
`;

  const { cv } = parseCv(text, { fileName: 'LeZaria CV 2026 (1).pdf' });
  assert.equal(cv.personal.fullName, 'LeZaria');
  assert.equal(cv.experience.length, 1);
  assert.equal(cv.experience[0].employer, 'Nedbank Limited');
});

test('auto-derives date of birth from 13-digit South African ID number without storing ID', () => {
  const text = `Sipho Ndlovu
ID: 9405145800086
Johannesburg, South Africa

EXPERIENCE
Shoprite Group
Store Operations Lead
January 2020 - Present
• Retail inventory management
`;

  const { cv, gaps } = parseCv(text);
  assert.equal(cv.personal.fullName, 'Sipho Ndlovu');
  assert.equal(cv.personal.dateOfBirth, '14 May 1994');
  assert.doesNotMatch(JSON.stringify(cv), /9405145800086/);
  assert.ok(gaps.some((g) => /ID number/i.test(g)));
});

test('parses single-line role headings with delimiters like at, pipe, and dash', () => {
  const text = `Thabo Dlamini
thabo@example.com

EXPERIENCE
Lead Solutions Architect at Takealot
January 2021 - Present
• Designed microservices infrastructure

Senior Software Engineer | Derivco | Jan 2018 - Dec 2020
• Developed high-throughput backend services
`;

  const { cv } = parseCv(text);
  assert.equal(cv.experience.length, 2);
  assert.equal(cv.experience[0].employer, 'Takealot');
  assert.equal(cv.experience[0].titles[0].title, 'Lead Solutions Architect');
  assert.equal(cv.experience[1].employer, 'Derivco');
  assert.equal(cv.experience[1].titles[0].title, 'Senior Software Engineer');
  assert.equal(cv.experience[1].duration, 'January 2018 – December 2020');
});

test('merges supplementary document data seamlessly into existing candidate profile', () => {
  const base = {
    meta: { targetRole: 'Business Analyst', fileName: '', mode: 'agency', reference: '' },
    personal: {
      fullName: 'LeZaria Khumalo', citizenship: '', languages: '', dateOfBirth: '',
      areaOfResidence: 'Johannesburg', availability: '', driversLicence: '', ownTransport: '',
      email: '', phone: '', areaAlias: '',
    },
    professionalSummary: ['Lead profile bullet.', 'Second bullet.', 'Third bullet.', 'Fourth bullet.'],
    qualifications: [{ year: '2018', name: 'BCom Information Systems', institution: 'University of Johannesburg', notes: [] }],
    certifications: [],
    technicalSkills: [{ group: '', items: ['SQL', 'Business Analysis'] }],
    experience: [{
      employer: 'Vodacom Group',
      duration: 'January 2021 – Present',
      alias: '',
      titles: [{ title: 'Senior Business Analyst', duration: 'January 2021 – Present' }],
      context: '',
      reasonForLeaving: '',
      responsibilities: ['Agile delivery'],
      achievements: ['Increased sprint velocity by 25%'],
    }],
    earlyCareer: [],
  };

  const supplementary = {
    meta: { targetRole: 'Senior Business Analyst' },
    personal: {
      fullName: 'LeZaria Khumalo', citizenship: 'South African', languages: 'English, Zulu',
      dateOfBirth: '14 May 1994', areaOfResidence: '', availability: '30 Days',
      driversLicence: 'Code B', ownTransport: 'Yes', email: 'lez@test.com', phone: '0821234567',
    },
    professionalSummary: [],
    qualifications: [],
    certifications: [{ year: '2022', name: 'CBAP Certified Business Analysis Professional', institution: 'IIBA' }],
    technicalSkills: [{ group: 'Tools', items: ['Jira', 'Confluence', 'Tableau'] }],
    experience: [{
      employer: 'Standard Bank',
      duration: 'January 2018 – December 2020',
      titles: [{ title: 'Junior Analyst', duration: 'January 2018 – December 2020' }],
      responsibilities: ['Process documentation'],
      achievements: [],
    }],
    earlyCareer: [{ title: 'Intern', employer: 'Nedbank', duration: '2017' }],
  };

  const { merged, notes } = mergeCvRecords(base, supplementary);

  assert.equal(merged.personal.citizenship, 'South African');
  assert.equal(merged.personal.languages, 'English, Zulu');
  assert.equal(merged.personal.dateOfBirth, '14 May 1994');
  assert.equal(merged.personal.availability, '30 Days');
  assert.equal(merged.personal.driversLicence, 'Code B');
  assert.equal(merged.personal.ownTransport, 'Yes');
  assert.equal(merged.experience.length, 2);
  assert.equal(merged.experience[1].employer, 'Standard Bank');
  assert.equal(merged.certifications.length, 1);
  assert.equal(merged.certifications[0].name, 'CBAP Certified Business Analysis Professional');
  assert.equal(merged.earlyCareer.length, 1);
  assert.ok(notes.length > 5);
});

test('standardizeCv cleans punctuation, hyphens to en-dashes, and uppercase titles', () => {
  const uncleaned = {
    meta: { targetRole: 'SENIOR DATA SCIENTIST' },
    professionalSummary: ['experienced practitioner with strong domain knowledge', 'second bullet'],
    experience: [{
      employer: 'Standard Bank',
      duration: 'March 2021 - Present',
      titles: [{ title: 'SENIOR DATA SCIENTIST', duration: 'March 2021 - Present' }],
      responsibilities: ['managed big data pipeline.', 'lead cross-functional squads;'],
      achievements: ['reduced latency by 40%.'],
    }],
    earlyCareer: [{ title: 'DATA INTERN', employer: 'Discovery', duration: '2019 - 2020' }],
    technicalSkills: [{ group: '', items: ['Python.', 'SQL,'] }],
  };

  const cleaned = standardizeCv(uncleaned);
  assert.equal(cleaned.meta.targetRole, 'Senior Data Scientist');
  assert.equal(cleaned.experience[0].duration, 'March 2021 – Present');
  assert.equal(cleaned.experience[0].titles[0].title, 'Senior Data Scientist');
  assert.equal(cleaned.experience[0].titles[0].duration, 'March 2021 – Present');
  assert.equal(cleaned.experience[0].responsibilities[0], 'Managed big data pipeline');
  assert.equal(cleaned.experience[0].responsibilities[1], 'Lead cross-functional squads');
  assert.equal(cleaned.experience[0].achievements[0], 'Reduced latency by 40%');
  assert.equal(cleaned.earlyCareer[0].duration, '2019 – 2020');
  assert.equal(cleaned.professionalSummary[0], 'Experienced practitioner with strong domain knowledge.');
  assert.equal(cleaned.professionalSummary[1], 'Second bullet.');
  assert.deepEqual(cleaned.technicalSkills[0].items, ['Python', 'SQL']);
});

test('extracts South African Employment Equity status from a CV', () => {
  const labelled = `Thandi Mokoena\nEmployment Equity: African Female\nLanguages: English, Zulu\n\nEXPERIENCE\nVodacom\nAnalyst\nJanuary 2020 - Present\n• Delivered analytics`;
  const { cv } = parseCv(labelled);
  assert.equal(cv.personal.eeStatus, 'African Female');

  const eeAbbrev = `Thabo Dlamini\nEE Status: EE\n\nEXPERIENCE\nDiscovery\nDeveloper\nJanuary 2021 - Present\n• Built tooling`;
  const { cv: cv2 } = parseCv(eeAbbrev);
  assert.equal(cv2.personal.eeStatus, 'EE');

  const raceLabel = `Zanele Nkosi\nRace: Coloured\n\nEXPERIENCE\nShoprite\nLead\nJanuary 2019 - Present\n• Managed teams`;
  const { cv: cv3 } = parseCv(raceLabel);
  assert.equal(cv3.personal.eeStatus, 'Coloured');

  const designation = `Ayesha Patel\nDesignated Group: African Female\n\nEXPERIENCE\nStandard Bank\nConsultant\nFebruary 2020 - Present\n• Advised clients`;
  const { cv: cv4 } = parseCv(designation);
  assert.equal(cv4.personal.eeStatus, 'African Female');
});

test('merges Employment Equity status from a supplementary document without overwriting existing value', () => {
  const base = {
    meta: { targetRole: 'Analyst', fileName: '', mode: 'agency', reference: '' },
    personal: {
      fullName: 'LeZaria Khumalo', citizenship: 'South African', languages: '', dateOfBirth: '',
      areaOfResidence: 'Johannesburg', availability: '', driversLicence: '', ownTransport: '',
      eeStatus: 'African Female', email: '', phone: '', areaAlias: '',
    },
    professionalSummary: ['Lead bullet.', 'Second.', 'Third.', 'Fourth.'],
    qualifications: [], certifications: [],
    technicalSkills: [{ group: '', items: ['SQL'] }],
    experience: [{
      employer: 'Vodacom', duration: 'January 2021 – Present', alias: '',
      titles: [{ title: 'Analyst', duration: 'January 2021 – Present' }],
      context: '', reasonForLeaving: '', responsibilities: ['Analyse'], achievements: ['Improved'],
    }],
    earlyCareer: [],
  };
  const supplementary = {
    meta: { targetRole: 'Analyst' },
    personal: { eeStatus: 'Non-EE' },
    professionalSummary: [],
    qualifications: [], certifications: [],
    technicalSkills: [], experience: [], earlyCareer: [],
  };

  // Existing EE status is preserved (not overwritten)
  const kept = mergeCvRecords(base, supplementary);
  assert.equal(kept.merged.personal.eeStatus, 'African Female');

  // Empty EE status is populated from the supplementary document
  const blank = JSON.parse(JSON.stringify(base));
  blank.personal.eeStatus = '';
  const filled = mergeCvRecords(blank, supplementary);
  assert.equal(filled.merged.personal.eeStatus, 'Non-EE');
  assert.ok(filled.notes.some((n) => /Employment Equity/i.test(n)));
});

test('validator guards Employment Equity status against contact-data leaks', () => {
  const cv = {
    meta: { targetRole: 'Analyst', mode: 'agency', fileName: 'x' },
    redact: {},
    personal: {
      fullName: 'LeZaria Khumalo', citizenship: 'South African', languages: 'English, Zulu',
      dateOfBirth: '14 May 1994', areaOfResidence: 'Johannesburg', availability: '30 Days',
      driversLicence: 'Code B', ownTransport: 'Yes', eeStatus: 'african@example.com',
      email: '', phone: '', areaAlias: '',
    },
    consultant: { contactPerson: 'Graham Glintenkamp', emailAddress: 'CV@talenttree.co.za' },
    professionalSummary: ['One.', 'Two.', 'Three.', 'Four.'],
    qualifications: [], certifications: [],
    technicalSkills: [{ group: '', items: ['SQL'] }],
    experience: [{
      employer: 'Vodacom', duration: 'January 2021 – Present',
      titles: [{ title: 'Analyst', duration: 'January 2021 – Present' }],
      responsibilities: ['Analyse'], achievements: ['Improved'],
    }],
    earlyCareer: [],
  };
  const report = validate(cv);
  assert.ok(report.errors.some((e) => e.field === 'personal.eeStatus' && /email/i.test(e.message)));
});

test('validator surfaces an empty Employment Equity status as a warning', () => {
  const cv = {
    meta: { targetRole: 'Analyst', mode: 'agency', fileName: 'x' },
    redact: {},
    personal: {
      fullName: 'LeZaria Khumalo', citizenship: 'South African', languages: 'English, Zulu',
      dateOfBirth: '14 May 1994', areaOfResidence: 'Johannesburg', availability: '30 Days',
      driversLicence: 'Code B', ownTransport: 'Yes', eeStatus: '',
      email: '', phone: '', areaAlias: '',
    },
    consultant: { contactPerson: 'Graham Glintenkamp', emailAddress: 'CV@talenttree.co.za' },
    professionalSummary: ['One.', 'Two.', 'Three.', 'Four.'],
    qualifications: [], certifications: [],
    technicalSkills: [{ group: '', items: ['SQL'] }],
    experience: [{
      employer: 'Vodacom', duration: 'January 2021 – Present',
      titles: [{ title: 'Analyst', duration: 'January 2021 – Present' }],
      responsibilities: ['Analyse'], achievements: ['Improved'],
    }],
    earlyCareer: [],
  };
  const report = validate(cv);
  assert.ok(report.warnings.some((w) => w.field === 'personal.eeStatus' && /empty/i.test(w.message)));
});
