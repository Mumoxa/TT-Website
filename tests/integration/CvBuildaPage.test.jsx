import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import CvBuildaPage from '../../src/cv-builda/CvBuildaPage';
import { createEmptyDraft } from '../../src/cv-builda/model/createDraft';

const fragment = {
  id: 'f1',
  text: 'Original supplied fact',
  originalText: 'Original supplied fact',
  coverage: 'unreviewed',
  location: { order: 1 },
};

const loaded = () => ({
  ...createEmptyDraft(),
  file: { name: 'candidate.docx' },
  fragments: [fragment],
  personal: { name: 'Ada Lovelace', contact: 'ada@example.test', details: [] },
});

beforeEach(() => {
  vi.stubGlobal('confirm', () => true);
});

describe('CV Builda review workflow', () => {
  it('assigns every source fragment before enabling export', async () => {
    const user = userEvent.setup();
    render(<CvBuildaPage initialState={loaded()} />);

    const download = screen.getByRole('button', { name: 'Download editable Word CV' });
    expect(download.disabled).toBe(true);

    await user.selectOptions(screen.getByLabelText('Destination'), 'skills');
    await user.click(screen.getByRole('button', { name: 'Assign source' }));

    expect(screen.queryByDisplayValue('Original supplied fact')).not.toBeNull();
    expect(download.disabled).toBe(false);
  });

  it('supports adding, editing, and removing complete work records', async () => {
    const user = userEvent.setup();
    render(<CvBuildaPage initialState={loaded()} />);

    await user.click(screen.getByRole('button', { name: 'Add work experience' }));
    await user.type(screen.getByLabelText('Employer'), 'Analytical Engines');
    await user.type(screen.getByLabelText('Duration'), '1842 – 1843');
    await user.type(screen.getByLabelText('Title'), 'Programmer');
    await user.type(screen.getByLabelText('Responsibilities'), 'Wrote supplied notes');

    const preview = screen.getByLabelText('CV preview');
    expect(within(preview).getAllByText('Analytical Engines · Programmer · 1842 – 1843')).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.queryByDisplayValue('Analytical Engines')).toBeNull();
  });

  it('keeps optional suggestions separate until staff approval', async () => {
    const user = userEvent.setup();
    const transport = vi.fn().mockResolvedValue({
      task: 'classify_notes',
      suggestions: [
        {
          fragmentId: 'note-1',
          destination: 'summary',
          proposedText: 'Candidate supplied note',
          reason: 'Fits summary',
          confidence: 'medium',
          warnings: [],
        },
      ],
    });

    render(
      <CvBuildaPage
        initialState={{
          ...loaded(),
          fragments: [{ ...fragment, coverage: 'excluded' }],
          notes: [{ id: 'note-1', text: 'Candidate supplied note', status: 'pending' }],
        }}
        suggestionTransport={transport}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Suggest destinations' }));
    expect(screen.queryByText('Candidate supplied note', { selector: '.preview p' })).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'Approve suggestion' }));
    expect(screen.queryByText('Candidate supplied note', { selector: '.preview p' })).not.toBeNull();
  });

  it('never accesses persistent browser storage', () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    render(<CvBuildaPage initialState={loaded()} />);
    expect(local).not.toHaveBeenCalled();
    local.mockRestore();
  });
});
