import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validate } from './cv/validate.js';
import { visibleText } from './cv/list-text.js';
import { REDACTION_DEFAULTS } from './cv/redact.js';
import './cv-builda.css';

/* ══════════════════════════════════════════════════════════════════════════
   CV-BUILDA  ·  talenttree.co.za/cv-builda

   Turns a candidate's raw CV into a Talent Tree candidate profile.

   The document is generated in the browser. Nothing is uploaded, which is the
   honest answer to the POPIA question a candidate or client will ask.

   `docx` and the composer are loaded lazily on first build, so this page adds
   nothing to the main site bundle until someone actually presses Download.
   ══════════════════════════════════════════════════════════════════════════ */

const EMPTY = {
  meta: { targetRole: '', fileName: '', mode: 'agency', reference: '' },
  redact: { ...REDACTION_DEFAULTS },
  personal: {
    fullName: '', citizenship: '', languages: '', dateOfBirth: '',
    areaOfResidence: '', availability: '', driversLicence: '', ownTransport: '',
    email: '', phone: '', areaAlias: '',
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

const blank = {
  qualification: { year: '', name: '', institution: '', institutionAlias: '', notes: [] },
  certification: { year: '', name: '', institution: '', institutionAlias: '' },
  skillGroup: { group: '', items: [] },
  earlyRole: { title: '', employer: '', duration: '', alias: '' },
  title: { title: '', duration: '' },
  employer: {
    employer: '', duration: '', alias: '', titles: [{ title: '', duration: '' }],
    context: '', reasonForLeaving: '', responsibilities: [], achievements: [],
  },
};

const FORMATS = {
  docx: 'a Word document',
  pdf: 'a PDF',
  doc: 'a Word 97\u20132003 document',
  rtf: 'rich text',
  text: 'plain text',
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/* ── immutable path helpers: "experience[0].titles[1].title" ─────────────── */
const parsePath = (p) => p.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);

function getIn(obj, path) {
  return parsePath(path).reduce((a, k) => (a == null ? a : a[k]), obj);
}

function setIn(obj, path, value) {
  const keys = parsePath(path);
  const next = Array.isArray(obj) ? obj.slice() : { ...obj };
  let cursor = next;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) { cursor[k] = value; return; }
    cursor[k] = Array.isArray(cursor[k]) ? cursor[k].slice() : { ...cursor[k] };
    cursor = cursor[k];
  });
  return next;
}

/* ══════════════════════════════════════════════════════════════ the page ══ */

export default function CvBuilda() {
  const [cv, setCv] = useState(() => clone(EMPTY));
  const [step, setStep] = useState('start');       // start | edit
  const [gaps, setGaps] = useState([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const [paste, setPaste] = useState('');

  const report = useMemo(() => validate(cv), [cv]);
  const loaded = Boolean(cv.personal.fullName.trim());
  const direct = cv.meta.mode === 'direct';
  const R = cv.redact || {};
  const anonymous = Object.values(R).some(Boolean);

  useEffect(() => { document.title = 'CV-Builda — Talent Tree'; }, []);

  const update = useCallback((path, value) => setCv((c) => setIn(c, path, value)), []);

  const updateList = useCallback((path, text) => {
    setCv((c) => setIn(c, path, text.split('\n').map((s) => s.trim()).filter(Boolean)));
  }, []);

  const push = useCallback((path, item) => {
    setCv((c) => setIn(c, path, [...(getIn(c, path) || []), clone(item)]));
  }, []);

  const removeAt = useCallback((path, index) => {
    setCv((c) => setIn(c, path, (getIn(c, path) || []).filter((_, i) => i !== index)));
  }, []);

  const land = useCallback((record, notes, source) => {
    setCv(record);
    setGaps(notes);
    setStep('edit');
    setNote(source ? { tone: 'good', text: source } : null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /* ── a saved data file, or the output of the conversion prompt ────────── */
  const ingestJson = useCallback((text) => {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0) throw new Error('No JSON object found.');
    const parsed = JSON.parse(text.slice(start, end + 1));
    /* Merge one level deep. A shallow spread would drop defaults inside
       meta and personal — data files written before a field existed would
       arrive with it undefined, which is how meta.mode went missing. */
    const base = clone(EMPTY);
    const merged = { ...base, ...parsed };
    ['meta', 'personal', 'consultant', 'redact'].forEach((k) => {
      merged[k] = { ...base[k], ...(parsed[k] || {}) };
    });
    /* A formal recruitment profile carries no referees section — the client
       asks the consultant, who asks the candidate. Data files written before
       that rule still carry the field, so it is dropped on the way in rather
       than left to reappear in the document. */
    delete merged.referees;
    if (merged.meta.mode !== 'direct') merged.meta.mode = 'agency';
    const trailing = text.slice(end + 1).replace(/^\s*GAPS:\s*/i, '').trim();
    land(merged, trailing ? [trailing] : [], '');
  }, [land]);

  /* ── the candidate's own CV, in whatever they wrote it in ─────────────── */
  const ingestCv = useCallback(async (text, label) => {
    const { parseCv } = await import('./cv/parse.js');
    const { cv: parsed, gaps: found } = parseCv(text);
    land(parsed, found, `${label} Read every field against the original before you build — that is the part no parser can do.`);
  }, [land]);

  const onFile = useCallback(async (file) => {
    if (!file) return;
    setBusy(`Reading ${file.name}\u2026`);
    setNote(null);
    try {
      if (/\.json$/i.test(file.name)) {
        ingestJson(await file.text());
      } else {
        const { extractFromFile } = await import('./cv/extract.js');
        const { text, format, notes } = await extractFromFile(file);
        await ingestCv(text, [`Read ${file.name} as ${FORMATS[format] || format}.`, ...notes].join(' '));
      }
    } catch (e) {
      setNote({ tone: 'bad', text: e.message || String(e) });
    }
    setBusy('');
  }, [ingestJson, ingestCv]);

  /* Pasted text is a data file if it looks like one and a CV if it does not. */
  const onPaste = useCallback(async (text) => {
    setBusy('Reading the text\u2026');
    setNote(null);
    try {
      if (/^\s*[{[]/.test(text)) ingestJson(text);
      else await ingestCv(text, 'Read from pasted text.');
    } catch (e) {
      setNote({ tone: 'bad', text: e.message || String(e) });
    }
    setBusy('');
  }, [ingestJson, ingestCv]);

  /* ── build ────────────────────────────────────────────────────────────── */
  const build = useCallback(async () => {
    setBusy('Building the document…');
    try {
      const [{ Packer }, { compose, fileNameFor }] = await Promise.all([
        import('docx'),
        import('./cv/compose.js'),
      ]);
      const blob = await Packer.toBlob(compose(cv));
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: url, download: `${fileNameFor(cv)}.docx`,
      });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNote({ tone: 'good', text: 'Document downloaded. Check the page breaks before you send it.' });
    } catch (e) {
      setNote({ tone: 'bad', text: `Could not build the document. ${e.message}` });
    }
    setBusy('');
  }, [cv]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(cv, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const name = (cv.meta.fileName || cv.personal.fullName.replace(/\W+/g, '_') || 'candidate');
    const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [cv]);

  const issueFor = useCallback(
    (path) => report.all.find((i) => i.field === path),
    [report],
  );
  const issueUnder = useCallback(
    (path) => report.all.find((i) => i.field === path || i.field.startsWith(`${path}[`)),
    [report],
  );

  const ctx = { cv, update, updateList, push, removeAt, issueFor, issueUnder, direct, R, anonymous };

  return (
    <div className="cvb">
      <Hero step={step} loaded={loaded} onRestart={() => { setCv(clone(EMPTY)); setStep('start'); setGaps([]); setNote(null); }} />

      {note && <div className={`cvb-note cvb-note--${note.tone}`} role="status">{note.text}</div>}

      {step === 'start' ? (
        <StartPanel paste={paste} setPaste={setPaste} onLoad={() => onPaste(paste)} onFile={onFile} busy={busy}
          onBlank={() => { setCv({ ...clone(EMPTY), personal: { ...EMPTY.personal, fullName: 'New candidate' } }); setStep('edit'); }} />
      ) : (
        <div className="cvb-work">
          <div className="cvb-form">
            {gaps.length > 0 && (
              <div className="cvb-gaps">
                <p className="cvb-eyebrow">Raised while reading the CV</p>
                <ul>{gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>
                <p className="cvb-hint">Resolve these with the candidate. Never fill them in yourself.</p>
              </div>
            )}
            <Editor {...ctx} />
          </div>
          <Sidebar report={report} />
        </div>
      )}

      {step === 'edit' && (
        <div className="cvb-bar">
          <div className="cvb-bar-inner">
            <button className="cvb-btn cvb-btn--primary" onClick={build}
              disabled={!report.ok || !loaded || Boolean(busy)}>
              {busy || 'Download the profile'}
            </button>
            <button className="cvb-btn" onClick={exportJson}>Save the data file</button>
            <span className="cvb-status">
              {!report.ok
                ? `${report.errors.length} error${report.errors.length === 1 ? '' : 's'} to fix`
                : report.warnings.length
                  ? `${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'} to consider`
                  : 'Clean'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ hero ══ */

function Hero({ step, loaded, onRestart }) {
  return (
    <header className="cvb-hero">
      <span className="cvb-numeral" aria-hidden="true">CV</span>
      <div className="cvb-hero-inner">
        <p className="cvb-eyebrow cvb-eyebrow--accent">Talent Tree</p>
        <h1>CV&#8209;Builda</h1>
        <p className="cvb-lede">
          Turns a candidate&rsquo;s CV into a Talent Tree candidate profile &mdash; the same
          document, the same structure, every time. Drop in a Word file, a PDF or plain text;
          reading it and building the profile both happen in this browser tab.
        </p>
        {step === 'edit' && loaded && (
          <button className="cvb-btn cvb-btn--ghost" onClick={onRestart}>Start another candidate</button>
        )}
      </div>
    </header>
  );
}

/* ══════════════════════════════════════════════════════════════════ start ══ */

function StartPanel({ paste, setPaste, onLoad, onFile, onBlank, busy }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  return (
    <section className="cvb-start">
      <ol className="cvb-steps">
        <li><span>01</span><h3>Load</h3>
          <p>Drop the candidate&rsquo;s CV in &mdash; Word, PDF, rich text or plain text.
            It is read here in your browser and turned into a draft profile.</p></li>
        <li><span>02</span><h3>Check</h3>
          <p>Read the draft against the original. Every house rule that can be checked
            mechanically is checked as you type &mdash; dates, ordering, contact details,
            gaps in the timeline &mdash; and anything the reader could not resolve is listed
            for you.</p></li>
        <li><span>03</span><h3>Build</h3>
          <p>Download the profile. The layout is fixed, so two consultants working on two
            candidates produce documents that match exactly.</p></li>
      </ol>

      <div className="cvb-panel">
        <h2>Load a candidate</h2>

        <div
          className={`cvb-drop${over ? ' is-over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        >
          Drop the CV here, or choose a file
          <em>.docx &middot; .pdf &middot; .rtf &middot; .txt &middot; or a saved .json</em>
        </div>
        <input ref={inputRef} type="file" hidden
          accept=".docx,.pdf,.rtf,.txt,.md,.doc,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => onFile(e.target.files[0])} />

        <label className="cvb-field">
          <span>Or paste the CV text</span>
          <textarea rows={7} value={paste} onChange={(e) => setPaste(e.target.value)}
            placeholder={'Paste the whole CV here \u2014 name, contact details, employment history, the lot.'} />
        </label>

        <div className="cvb-actions">
          <button className="cvb-btn cvb-btn--primary" onClick={onLoad} disabled={!paste.trim() || Boolean(busy)}>
            {busy || 'Load candidate'}
          </button>
          <button className="cvb-btn" onClick={onBlank} disabled={Boolean(busy)}>Start from blank</button>
        </div>
        <p className="cvb-hint">
          A Google Doc needs <strong>File &rarr; Download &rarr; Microsoft Word (.docx)</strong> first &mdash;
          the <code>.gdoc</code> on your desktop is a link, not the document. A scanned PDF has no text
          in it to read, so it needs the original or an OCR pass.
        </p>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════ fields ══ */

function Field({ path, label, hint, mono, area, rows = 3, placeholder, issueFor, update, cv }) {
  const issue = issueFor(path);
  return (
    <label className="cvb-field">
      <span>{label}</span>
      {area ? (
        <textarea rows={rows} value={getIn(cv, path) ?? ''} placeholder={placeholder}
          className={issue ? `is-${issue.level}` : ''}
          onChange={(e) => update(path, e.target.value)} />
      ) : (
        <input type="text" value={getIn(cv, path) ?? ''} placeholder={placeholder}
          className={`${mono ? 'is-mono ' : ''}${issue ? `is-${issue.level}` : ''}`}
          onChange={(e) => update(path, e.target.value)} />
      )}
      {issue && <em className={`cvb-inline is-${issue.level}`}>{issue.message}</em>}
      {!issue && hint && <em className="cvb-inline">{hint}</em>}
    </label>
  );
}

/**
 * A list of bullets, one per line.
 *
 * The record holds them trimmed with blank lines dropped, which is right for
 * what is stored and wrong for what is being typed. Applying it to the
 * textarea on every keystroke ate the space at the end of a word and
 * swallowed the blank line that begins the next bullet, so a section could
 * only ever hold one run-together bullet. The field keeps its own text and
 * the record gets the tidy version.
 */
function ListField({ path, label, placeholder, cv, updateList, issueUnder }) {
  const stored = (getIn(cv, path) || []).join('\n');
  const [draft, setDraft] = useState(stored);
  const issue = issueUnder(path);

  /* Resync only when the record changed from somewhere else — a candidate
     loaded, a card removed — never in reply to this field's own edit, which
     is what tidy() equalling the stored value tells us. */
  useEffect(() => {
    setDraft((current) => visibleText(current, stored));
  }, [stored]);

  return (
    <label className="cvb-field">
      <span>{label} <i>one per line</i></span>
      <textarea rows={Math.max(3, draft.split('\n').length + 1)} value={draft} placeholder={placeholder}
        className={issue ? `is-${issue.level}` : ''}
        onChange={(e) => { setDraft(e.target.value); updateList(path, e.target.value); }}
        onBlur={() => setDraft(stored)} />
      {issue && <em className={`cvb-inline is-${issue.level}`}>{issue.message}</em>}
    </label>
  );
}

/* ═════════════════════════════════════════════════════════════════ editor ══ */

function Editor(ctx) {
  const { cv, push, removeAt, update, direct, R } = ctx;
  const F = (p) => <Field {...ctx} {...p} />;

  return (
    <>
      <Block title="Positioning">
        <ModeSwitch mode={cv.meta.mode} onChange={(m) => update('meta.mode', m)} />
        <div className="cvb-two">
          <Field {...ctx} path="meta.targetRole" label="Target role" placeholder="Credit Risk Analyst"
            hint="The role this CV is positioned for — not always the current title." />
          <Field {...ctx} path="meta.fileName" label="File name" mono placeholder="Steyn_JJ_TalentTree_CV" />
        </div>
      </Block>

      <RedactionBlock {...ctx} />

      <Block title="Personal"
        note={direct
          ? 'The candidate sends this themselves, so their own contact details belong on it.'
          : 'No phone number, email, street address or ID number. The client contacts the consultant.'}>
        <div className="cvb-two">
          <Field {...ctx} path="personal.fullName" label="Full name and surname" />
          <Field {...ctx} path="personal.citizenship" label="Citizenship" />
          <Field {...ctx} path="personal.languages" label="Languages" placeholder="English, Afrikaans" />
          <Field {...ctx} path="personal.dateOfBirth" label="Date of birth" placeholder="18 March 1985" />
          <Field {...ctx} path="personal.areaOfResidence" label="Area of residence" placeholder="Suburb, City" />
          <Field {...ctx} path="personal.availability" label="Availability" placeholder="Calendar month" />
          <Field {...ctx} path="personal.driversLicence" label="Driver’s licence" />
          <Field {...ctx} path="personal.ownTransport" label="Own transport" />
          {direct && <Field {...ctx} path="personal.email" label="Email address" mono />}
          {direct && <Field {...ctx} path="personal.phone" label="Phone number" mono />}
          {R.areaOfResidence && (
            <Field {...ctx} path="personal.areaAlias" label="Shown instead of the area"
              placeholder="Western Cape" hint="Left blank, the area is simply omitted." />
          )}
        </div>
      </Block>

      {!direct && (
        <Block title="Presented by"
          note="Printed on the cover. This is who the client contacts about the candidate.">
          <div className="cvb-two">
            <Field {...ctx} path="consultant.contactPerson" label="Consultant" />
            <Field {...ctx} path="consultant.contactNumber" label="Contact number" mono />
            <Field {...ctx} path="consultant.emailAddress" label="Email address" mono />
          </div>
        </Block>
      )}

      <Block title="Profile" note="The first line is the lead. It prints large and has to stand alone.">
        <ListField {...ctx} path="professionalSummary" label="Profile bullets"
          placeholder="Complete sentences, ending in a full stop." />
        <ListField {...ctx} path="careerSummary" label="Career summary (usually empty)" />
      </Block>

      <Block title="Qualifications" onAdd={() => push('qualifications', blank.qualification)} addLabel="qualification">
        {cv.qualifications.map((q, i) => (
          <Card key={i} onRemove={() => removeAt('qualifications', i)}>
            <div className="cvb-row">
              <div className="cvb-narrow">{F({ path: `qualifications[${i}].year`, label: 'Year', mono: true, placeholder: '2018' })}</div>
              {F({ path: `qualifications[${i}].name`, label: 'Qualification' })}
              {F({ path: `qualifications[${i}].institution`, label: 'Institution' })}
            </div>
            {R.institutions && (
              <Field {...ctx} path={`qualifications[${i}].institutionAlias`}
                label="Shown instead of the institution" placeholder="South African university" />
            )}
            <ListField {...ctx} path={`qualifications[${i}].notes`} label="Notes" placeholder="Specialisation: …" />
          </Card>
        ))}
      </Block>

      <Block title="Certifications" onAdd={() => push('certifications', blank.certification)} addLabel="certification">
        {cv.certifications.map((q, i) => (
          <Card key={i} onRemove={() => removeAt('certifications', i)}>
            <div className="cvb-row">
              <div className="cvb-narrow">{F({ path: `certifications[${i}].year`, label: 'Year', mono: true })}</div>
              {F({ path: `certifications[${i}].name`, label: 'Certification' })}
              {F({ path: `certifications[${i}].institution`, label: 'Institution' })}
            </div>
            {R.institutions && F({ path: `certifications[${i}].institutionAlias`,
              label: 'Shown instead of the institution', placeholder: 'Accredited training provider' })}
          </Card>
        ))}
      </Block>

      <Block title="Capability" onAdd={() => push('technicalSkills', blank.skillGroup)} addLabel="group"
        note="Leave the group blank for an ungrouped list. Keep each skill under 38 characters.">
        {cv.technicalSkills.map((g, i) => (
          <Card key={i} onRemove={() => removeAt('technicalSkills', i)}>
            <div className="cvb-narrow">
              {F({ path: `technicalSkills[${i}].group`, label: 'Group (blank = ungrouped)' })}
            </div>
            <ListField {...ctx} path={`technicalSkills[${i}].items`} label="Skills" />
          </Card>
        ))}
      </Block>

      <Block title="Experience" onAdd={() => push('experience', blank.employer)} addLabel="employer">
        {cv.experience.map((r, i) => (
          <Card key={i} live={(r.duration || '').endsWith('Present')}
            heading={r.employer || 'New employer'} onRemove={() => removeAt('experience', i)}>
            <div className="cvb-row">
              {F({ path: `experience[${i}].employer`, label: 'Employer' })}
              <div className="cvb-wide">
                {F({ path: `experience[${i}].duration`, label: 'Tenure', mono: true, placeholder: 'January 2019 – Present' })}
              </div>
            </div>

            {R.employerNames && F({ path: `experience[${i}].alias`,
              label: 'Shown instead of the employer', placeholder: 'JSE-listed retail group' })}

            <p className="cvb-eyebrow cvb-sub">Titles held — most recent first</p>
            {(r.titles || []).map((t, j) => (
              <div className="cvb-row cvb-row--tight" key={j}>
                <div className="cvb-wide">
                  {F({ path: `experience[${i}].titles[${j}].duration`, label: 'From – to', mono: true })}
                </div>
                {F({ path: `experience[${i}].titles[${j}].title`, label: 'Title' })}
                <button className="cvb-x" title="Remove title"
                  onClick={() => removeAt(`experience[${i}].titles`, j)}>&#10005;</button>
              </div>
            ))}
            <button className="cvb-btn cvb-btn--tiny"
              onClick={() => push(`experience[${i}].titles`, blank.title)}>+ title</button>

            <div className="cvb-sub">
              {F({ path: `experience[${i}].context`, label: 'Employer context (optional, max 3 sentences)', area: true })}
              {F({ path: `experience[${i}].reasonForLeaving`, label: 'Reason for leaving (only if stated)' })}
              <ListField {...ctx} path={`experience[${i}].achievements`} label="Key achievements"
                placeholder="Only if the source frames it as an outcome." />
              <ListField {...ctx} path={`experience[${i}].responsibilities`} label="Responsibilities"
                placeholder="Action verb, no full stop." />
            </div>
          </Card>
        ))}
      </Block>

      <Block title="Early career" onAdd={() => push('earlyCareer', blank.earlyRole)} addLabel="early role">
        {cv.earlyCareer.map((r, i) => (
          <Card key={i} onRemove={() => removeAt('earlyCareer', i)}>
            <div className="cvb-row">
              {F({ path: `earlyCareer[${i}].title`, label: 'Title' })}
              {F({ path: `earlyCareer[${i}].employer`, label: 'Employer' })}
              <div className="cvb-wide">
                {F({ path: `earlyCareer[${i}].duration`, label: 'Duration', mono: true })}
              </div>
            </div>
            {R.employerNames && F({ path: `earlyCareer[${i}].alias`,
              label: 'Shown instead of the employer', placeholder: 'Actuarial consultancy' })}
          </Card>
        ))}
      </Block>
    </>
  );
}

const REDACTIONS = [
  { id: 'candidateName', label: 'Candidate name',
    note: 'Replaced by the reference below, or initials if none is given. Also strips any email and phone.' },
  { id: 'dateOfBirth', label: 'Date of birth', note: 'Replaced by a five-year age band, worked out from the date.' },
  { id: 'areaOfResidence', label: 'Area of residence', note: 'Replaced by a broader area you supply.' },
  { id: 'employerNames', label: 'Employer names', note: 'Replaced by a descriptor you write for each employer.' },
  { id: 'institutions', label: 'Institution names', note: 'Universities and training providers become a descriptor.' },
  { id: 'dates', label: 'Exact dates', note: 'Every tenure becomes a band — "4 – 7 years" instead of the months.' },
  { id: 'qualificationYears', label: 'Qualification years', note: 'Years of study can date a candidate as precisely as a birth date.' },
];

/**
 * BLIND PROFILE CONTROLS.
 * Ticking a box changes what the document shows, never what is stored. The
 * record keeps the real employer, the real dates and the real person, so the
 * open and blind versions of a candidate are one record rendered twice and
 * can never drift apart.
 */
function RedactionBlock({ cv, update, R, anonymous, ...rest }) {
  const on = (id) => Boolean(R[id]);
  const toggle = (id) => update(`redact.${id}`, !on(id));
  const count = REDACTIONS.filter((r) => on(r.id)).length;

  return (
    <Block title="Blind profile"
      note="Tick what the client should not see. Nothing is deleted — the record keeps the real detail, and the same candidate can be sent open or blind without re-keying anything.">
      <div className="cvb-redactions">
        {REDACTIONS.map((r) => (
          <label key={r.id} className={`cvb-check${on(r.id) ? ' is-on' : ''}`}>
            <input type="checkbox" checked={on(r.id)} onChange={() => toggle(r.id)} />
            <span><strong>{r.label}</strong><em>{r.note}</em></span>
          </label>
        ))}
      </div>

      {anonymous && (
        <>
          <p className="cvb-redaction-count">
            {count} of {REDACTIONS.length} hidden. The checker will refuse to build while any
            hidden name still appears in the profile text or the bullets.
          </p>
          {on('candidateName') && (
            <Field cv={cv} update={update} {...rest} R={R} anonymous={anonymous}
              path="meta.reference" label="Reference shown instead of the name" mono
              placeholder="Candidate TT-4821" />
          )}
        </>
      )}
    </Block>
  );
}

/**
 * Who is sending this CV. It changes the document, not just the wording:
 * agency gets the cover page, the consultant block and the confidentiality
 * notice; direct gets a masthead with the candidate's own contact details and
 * none of the three. The validator inverts its contact rules to match.
 */
function ModeSwitch({ mode, onChange }) {
  const options = [
    { id: 'agency', label: 'Talent Tree presents this candidate',
      note: 'Cover page, consultant contact, confidentiality notice. The candidate’s own details never appear.' },
    { id: 'direct', label: 'The candidate sends it themselves',
      note: 'Masthead with their own contact details. No cover page and no confidentiality notice.' },
  ];
  return (
    <fieldset className="cvb-modes">
      <legend className="cvb-eyebrow">Who is sending this</legend>
      {options.map((o) => (
        <label key={o.id} className={`cvb-mode${mode === o.id ? ' is-on' : ''}`}>
          <input type="radio" name="cvb-mode" value={o.id} checked={mode === o.id}
            onChange={() => onChange(o.id)} />
          <span>
            <strong>{o.label}</strong>
            <em>{o.note}</em>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Block({ title, note, children, onAdd, addLabel }) {
  return (
    <section className="cvb-block">
      <h2>{title}</h2>
      {note && <p className="cvb-hint">{note}</p>}
      {children}
      {onAdd && <button className="cvb-btn cvb-btn--tiny" onClick={onAdd}>+ {addLabel}</button>}
    </section>
  );
}

function Card({ heading, live, onRemove, children }) {
  return (
    <div className={`cvb-card${live ? ' is-live' : ''}`}>
      <div className="cvb-card-head">
        {heading && <h3>{heading}</h3>}
        <button className="cvb-btn cvb-btn--tiny cvb-btn--danger" onClick={onRemove}>remove</button>
      </div>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ sidebar ══ */

function Sidebar({ report }) {
  const goto = (field) => {
    const el = document.querySelector(`[data-anchor="${field}"]`)
      || document.querySelector('.cvb-field .is-error, .cvb-field .is-warning');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <aside className="cvb-side">
      <h2 className="cvb-eyebrow">Data check</h2>
      <p className="cvb-tally">
        {report.errors.length} error{report.errors.length === 1 ? '' : 's'}
        {' · '}
        {report.warnings.length} warning{report.warnings.length === 1 ? '' : 's'}
      </p>

      {report.all.length === 0 ? (
        <p className="cvb-clean">
          Nothing mechanical left to fix. Now read the data against the original CV —
          that is the part no checker can do.
        </p>
      ) : (
        report.all.map((issue, i) => (
          <button key={i} className={`cvb-issue is-${issue.level}`} onClick={() => goto(issue.field)}>
            <code>{issue.field}</code>{issue.message}
          </button>
        ))
      )}
    </aside>
  );
}
