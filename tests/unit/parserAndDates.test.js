import { describe, expect, it } from 'vitest';
import { parseCvFragments } from '../../src/cv-builda/parsing/parseCv';
import { normaliseDateRange, sortWorkExperience } from '../../src/cv-builda/model/dates';

const fragments = (...text) => text.map((value, index) => ({ id: `f${index}`, text: value }));

describe('conservative CV parsing', () => {
  it('preserves unknown material for review and never creates a summary', () => {
    const parsed = parseCvFragments(fragments('Ada Lovelace', 'Unlabelled factual note'));
    expect(parsed.summary).toBe('');
    expect(parsed.unclassified.map((item) => item.text)).toEqual(['Ada Lovelace', 'Unlabelled factual note']);
  });

  it('preserves summary wording and only splits explicitly delimited skills', () => {
    const parsed = parseCvFragments(fragments('Professional Summary', 'Exact supplied wording.', 'Technical Skills', 'Node.js; SQL, COBOL'));
    expect(parsed.summary).toBe('Exact supplied wording.');
    expect(parsed.skills).toEqual(['Node.js', 'SQL', 'COBOL']);
  });

  it('creates experience only from an explicit, sufficiently complete record', () => {
    const parsed = parseCvFragments(fragments('Work Experience', 'Analytical Engines | Programmer | 1842 - 1843', 'Built supplied algorithms'));
    expect(parsed.experience).toEqual([expect.objectContaining({ employer: 'Analytical Engines', title: 'Programmer', duration: '1842 - 1843', responsibilities: ['Built supplied algorithms'] })]);
  });

  it('leaves ambiguous experience unclassified', () => {
    const parsed = parseCvFragments(fragments('Work Experience', 'Analytical Engines', 'Programmer'));
    expect(parsed.experience).toEqual([]);
    expect(parsed.unclassified.map((item) => item.text)).toEqual(['Analytical Engines', 'Programmer']);
  });
});

describe('date handling', () => {
  it('preserves year-only dates and normalises Current without inventing months', () => {
    expect(normaliseDateRange('2020 - Current')).toMatchObject({ value: '2020 - Present', start: 202000, end: Infinity, comparable: true });
  });

  it('sorts reliable dates and preserves source order if any record is unsafe', () => {
    const old = { id: 'old', duration: '2018 - 2020' };
    const current = { id: 'current', duration: '2021 - Present' };
    expect(sortWorkExperience([old, current]).records.map((record) => record.id)).toEqual(['current', 'old']);
    const unsafe = { id: 'unsafe', duration: 'Spring 2020' };
    expect(sortWorkExperience([old, unsafe, current])).toEqual({ records: [old, unsafe, current], warnings: ['Some dates could not be safely compared; source order was preserved.'] });
  });
});
