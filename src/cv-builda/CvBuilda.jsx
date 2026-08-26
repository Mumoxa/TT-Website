import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validate } from './cv/validate.js';
import { visibleText } from './cv/list-text.js';
import { REDACTION_DEFAULTS } from './cv/redact.js';
import { synthesizeProfile, mergeCvRecords, standardizeCv } from './cv/parse.js';
import { parseCvSmart } from './cv/smart-parse.js';
import {
  DEFAULT_AI_MODEL,
  requestLocalInterpretation,
} from './cv/ai.js';
import './cv-builda.css';

/* ══════════════════════════════════════════════════════════════════════════
   CV-BUILDA  ·  talenttree.co.za/cv-builda

   Turns a candidate's raw CV into a Talent Tree candidate profile.

   Document reading and generation stay in the browser. Extracted candidate text
   is sent only to Talent Tree's controlled same-origin parsing service, which
   relays it to the private Oracle/n8n/Ollama stack for structured extraction.

   Supports multi-column PDFs, LinkedIn profile PDFs, multi-document merging,
   structured AI extraction with deterministic fallback, automated profile
   synthesis, and one-click data standardization.
   ══════════════════════════════════════════════════════════════════════════ */

const EMPTY = {
  meta: { targetRole: '', fileName: '', mode: 'agency', reference: '' },
  redact: { ...REDACTION_DEFAULTS },
  personal: {
    fullName: '', citizenship: '', languages: '', dateOfBirth: '',
    areaOfResidence: '', availability: '', driversLicence: '', ownTransport: '',
    eeStatus: '', email: '', phone: '', areaAlias: '',
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
const CV_PARSE_ENDPOINT = import.meta.env.VITE_CV_PARSE_ENDPOINT || '/api/cv-parse';

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
  const [sources, setSources] = useState([]);
  const [showSuppModal, setShowSuppModal] = useState(false);
  const [suppPaste, setSuppPaste] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [aiEndpoint, setAiEndpoint] = useState(() => import.meta.env.VITE_CV_AI_ENDPOINT || '');
  const [aiModel, setAiModel] = useState(() => import.meta.env.VITE_CV_AI_MODEL || DEFAULT_AI_MODEL);
  const [aiProvider, setAiProvider] = useState('ollama');
  const [aiState, setAiState] = useState({ status: 'idle', suggestions: [], warnings: [], error: '' });
  const aiRunRef = useRef(0);

  const report = useMemo(() => validate(cv), [cv]);
  const loaded = Boolean(cv.personal.fullName.trim());
  const direct = cv.meta.mode === 'direct';
  const R = cv.redact || {};
  const anonymous = Object.values(R).some(Boolean);

  useEffect(() => { document.title = 'CV-Builda — Talent Tree'; }, []);

  const clearAiSuggestions = useCallback(() => {
    aiRunRef.current += 1;
    setAiState((current) => (current.status !== 'idle' || current.suggestions.length
      ? { status: 'idle', suggestions: [], warnings: [], error: '' }
      : current));
  }, []);

  const update = useCallback((path, value) => {
    setCv((c) => setIn(c, path, value));
    clearAiSuggestions();
  }, [clearAiSuggestions]);

  const updateList = useCallback((path, text) => {
    setCv((c) => setIn(c, path, text.split('\n').map((s) => s.trim()).filter(Boolean)));
    clearAiSuggestions();
  }, [clearAiSuggestions]);

  const push = useCallback((path, item) => {
    setCv((c) => setIn(c, path, [...(getIn(c, path) || []), clone(item)]));
    clearAiSuggestions();
  }, [clearAiSuggestions]);

  const removeAt = useCallback((path, index) => {
    setCv((c) => setIn(c, path, (getIn(c, path) || []).filter((_, i) => i !== index)));
    clearAiSuggestions();
  }, [clearAiSuggestions]);

  const land = useCallback((record, notes, source, sourceFiles = [], extractedText = '') => {
    aiRunRef.current += 1;
    setCv(record);
    setGaps(notes);
    setSourceText(extractedText);
    setAiState({ status: 'idle', suggestions: [], warnings: [], error: '' });
    setStep('edit');
    if (sourceFiles.length) setSources(sourceFiles);
    setNote(source ? { tone: 'good', text: source } : null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /* ── a saved data file, or the output of the conversion prompt ────────── */
  const ingestJson = useCallback((text, fileName = '') => {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0) throw new Error('No JSON object found.');
    const parsed = JSON.parse(text.slice(start, end + 1));
    const base = clone(EMPTY);
    const merged = { ...base, ...parsed };
    ['meta', 'personal', 'consultant', 'redact'].forEach((k) => {
      merged[k] = { ...base[k], ...(parsed[k] || {}) };
    });
    delete merged.referees;
    if (merged.meta.mode !== 'direct') merged.meta.mode = 'agency';
    const trailing = text.slice(end + 1).replace(/^\s*GAPS:\s*/i, '').trim();
    land(
      merged,
      trailing ? [trailing] : [],
      '',
      [{ name: fileName || 'candidate_data.json', format: 'json' }],
      JSON.stringify(parsed, null, 2),
    );
  }, [land]);

  const parseCandidateText = useCallback(async (text, fileName = '', mode = 'agency') => (
    parseCvSmart(text, {
      fileName,
      mode,
      endpoint: CV_PARSE_ENDPOINT,
      fallback: true,
    })
  ), []);

  /* ── the candidate's own CV, in whatever they wrote it in ─────────────── */
  const ingestCv = useCallback(async (text, label, fileName = '', format = 'text') => {
    const result = await parseCandidateText(text, fileName);
    const parserNote = result.parser === 'structured-ai'
      ? 'Structured AI extraction completed. Review only the highlighted exceptions before building.'
      : 'The AI service was unavailable, so the legacy parser was used. Review the extracted fields carefully.';
    land(
      result.cv,
      result.gaps,
      `${label} ${parserNote}`,
      [{ name: fileName || 'Pasted CV text', format, parser: result.parser }],
      text,
    );
  }, [land, parseCandidateText]);

  /* ── primary file upload (single or multiple) ─────────────────────────── */
  const onFile = useCallback(async (fileList) => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);
    const firstFile = files[0];
    setBusy(`Reading ${firstFile.name}\u2026`);
    setNote(null);
    aiRunRef.current += 1;
    setSourceText('');
    setAiState({ status: 'idle', suggestions: [], warnings: [], error: '' });
    try {
      if (/\.json$/i.test(firstFile.name)) {
        ingestJson(await firstFile.text(), firstFile.name);
      } else {
        const { extractFromFile } = await import('./cv/extract.js');
        const { text, format, notes } = await extractFromFile(firstFile);
        const parsedResult = await parseCandidateText(text, firstFile.name);
        const parsed = parsedResult.cv;
        const found = parsedResult.gaps;

        let currentRecord = parsed;
        const extractedSources = [`--- ${firstFile.name} ---\n${text}`];
        const loadedSources = [{ name: firstFile.name, format, parser: parsedResult.parser }];
        const extractionGaps = [...found, ...(notes || [])];

        /* If multiple files were dropped together (e.g. CV + LinkedIn PDF), merge them */
        if (files.length > 1) {
          for (let i = 1; i < files.length; i++) {
            const extraFile = files[i];
            setBusy(`Merging ${extraFile.name}\u2026`);
            const { text: extraText, format: extraFormat, notes: extraNotes } = await extractFromFile(extraFile);
            const extraResult = await parseCandidateText(extraText, extraFile.name, currentRecord.meta.mode);
            const incomingCv = extraResult.cv;
            const extraGaps = extraResult.gaps;
            const { merged, notes: mergeNotes } = mergeCvRecords(currentRecord, incomingCv);
            currentRecord = merged;
            extractedSources.push(`--- ${extraFile.name} ---\n${extraText}`);
            extractionGaps.push(...extraGaps, ...(extraNotes || []));
            loadedSources.push({
              name: extraFile.name,
              format: extraFormat,
              parser: extraResult.parser,
              mergedCount: mergeNotes.length,
            });
          }
        }

        land(
          currentRecord,
          extractionGaps,
          `Loaded ${loadedSources.map((s) => s.name).join(' & ')} successfully.`,
          loadedSources,
          extractedSources.join('\n\n'),
        );
      }
    } catch (e) {
      setNote({ tone: 'bad', text: e.message || String(e) });
    }
    setBusy('');
  }, [ingestJson, land, parseCandidateText]);

  /* Pasted text is a data file if it looks like one and a CV if it does not. */
  const onPaste = useCallback(async (text) => {
    setBusy('Reading the text\u2026');
    setNote(null);
    try {
      if (/^\s*[{[]/.test(text)) ingestJson(text, 'pasted_data.json');
      else await ingestCv(text, 'Read from pasted text.', 'Pasted Text');
    } catch (e) {
      setNote({ tone: 'bad', text: e.message || String(e) });
    }
    setBusy('');
  }, [ingestJson, ingestCv]);

  /* ── supplementary document merge ─────────────────────────────────────── */
  const onSupplementaryFile = useCallback(async (file) => {
    if (!file) return;
    aiRunRef.current += 1;
    setBusy(`Reading supplementary document: ${file.name}\u2026`);
    setNote(null);
    try {
      let incomingCv = null;
      let incomingSource = '';
      let format = 'text';
      if (/\.json$/i.test(file.name)) {
        incomingSource = await file.text();
        incomingCv = JSON.parse(incomingSource);
        format = 'json';
      } else {
        const { extractFromFile } = await import('./cv/extract.js');
        const extracted = await extractFromFile(file);
        incomingSource = extracted.text;
        format = extracted.format;
        const parsed = await parseCandidateText(extracted.text, file.name, cv.meta.mode);
        incomingCv = parsed.cv;
      }
      const { merged, notes: mergeNotes } = mergeCvRecords(cv, incomingCv);
      setCv(merged);
      setSourceText((current) => current
        ? `${current}\n\n--- supplementary: ${file.name} ---\n${incomingSource}`
        : incomingSource);
      setAiState({ status: 'idle', suggestions: [], warnings: [], error: '' });
      setSources((s) => [...s, { name: file.name, format, mergedCount: mergeNotes.length }]);
      setShowSuppModal(false);
      setNote({
        tone: 'good',
        text: `Merged data from ${file.name}: ${mergeNotes.length ? mergeNotes.join('; ') : 'All fields synced.'}`,
      });
    } catch (e) {
      setNote({ tone: 'bad', text: `Could not merge document: ${e.message || String(e)}` });
    }
    setBusy('');
  }, [cv, parseCandidateText]);

  const onSupplementaryPaste = useCallback(async (text) => {
    if (!text.trim()) return;
    aiRunRef.current += 1;
    setBusy('Merging text\u2026');
    setNote(null);
    try {
      let incomingCv = null;
      if (/^\s*[{[]/.test(text)) {
        incomingCv = JSON.parse(text);
      } else {
        const parsed = await parseCandidateText(text, 'Pasted Supplementary Text', cv.meta.mode);
        incomingCv = parsed.cv;
      }
      const { merged, notes: mergeNotes } = mergeCvRecords(cv, incomingCv);
      setCv(merged);
      setSourceText((current) => current
        ? `${current}\n\n--- supplementary pasted details ---\n${text}`
        : text);
      setAiState({ status: 'idle', suggestions: [], warnings: [], error: '' });
      setSources((s) => [...s, { name: 'Pasted supplementary details', format: 'text', mergedCount: mergeNotes.length }]);
      setShowSuppModal(false);
      setSuppPaste('');
      setNote({
        tone: 'good',
        text: `Merged pasted data: ${mergeNotes.length ? mergeNotes.join('; ') : 'All fields synced.'}`,
      });
    } catch (e) {
      setNote({ tone: 'bad', text: `Could not merge text: ${e.message || String(e)}` });
    }
    setBusy('');
  }, [cv, parseCandidateText]);

  /* ── 1-click auto synthesis & standardization ─────────────────────────── */
  const handleAutoSynthesize = useCallback(() => {
    const bullets = synthesizeProfile(cv);
    setCv((c) => setIn(c, 'professionalSummary', bullets));
    clearAiSuggestions();
    setNote({ tone: 'good', text: 'Professional summary auto-synthesized from candidate experience, skills, and qualifications.' });
  }, [clearAiSuggestions, cv]);

  const handleStandardize = useCallback(() => {
    const cleaned = standardizeCv(cv);
    setCv(cleaned);
    clearAiSuggestions();
    setNote({ tone: 'good', text: 'Formatting standardized: converted date dashes to en-dashes, cleaned bullet capitalization and punctuation, and formatted job titles.' });
  }, [clearAiSuggestions, cv]);

  const handleAutoAliases = useCallback(() => {
    setCv((c) => {
      const next = clone(c);
      (next.experience || []).forEach((r, i) => {
        if (!r.alias?.trim()) {
          const emp = (r.employer || '').toLowerCase();
          if (/bank|investec|fnb|absa|nedbank|standard\s+bank|capitec/i.test(emp)) r.alias = 'Major South African banking group';
          else if (/vodacom|mtn|telkom|cell\s+c/i.test(emp)) r.alias = 'Telecommunications enterprise';
          else if (/retail|shoprite|pick\s+n\s+pay|woolworths|tfg|foschini|mr\s+price/i.test(emp)) r.alias = 'JSE-listed retail group';
          else if (/insurance|discovery|sanlam|old\s+mutual|momentum|liberty/i.test(emp)) r.alias = 'Financial services and insurance group';
          else if (/consulting|deloitte|pwc|ey|kpmg|mckinsey|accenture|bcg/i.test(emp)) r.alias = 'Global management consulting firm';
          else if (/tech|software|derivco|entelect|bbd|amazon|google|microsoft/i.test(emp)) r.alias = 'Technology and software enterprise';
          else r.alias = `Enterprise employer (${i + 1})`;
        }
      });
      (next.qualifications || []).forEach((q) => {
        if (q.institution && !q.institutionAlias?.trim()) {
          const inst = q.institution.toLowerCase();
          if (/uct|cape\s+town|wits|witwatersrand|stellenbosch|pretoria|up|uj|johannesburg|kzn|ukzn|rhodes|nwu|unisa/i.test(inst)) {
            q.institutionAlias = 'Leading South African university';
          } else {
            q.institutionAlias = 'Accredited tertiary institution';
          }
        }
      });
      return next;
    });
    clearAiSuggestions();
    setNote({ tone: 'good', text: 'Auto-populated blind profile descriptors for employers and institutions.' });
  }, [clearAiSuggestions]);

  const handleAiInterpret = useCallback(async () => {
    const runId = ++aiRunRef.current;
    if (!sourceText.trim()) {
      setAiState({ status: 'error', suggestions: [], warnings: [], error: 'There is no extracted CV text to review. Load a document first.' });
      return;
    }
    setAiState({ status: 'running', suggestions: [], warnings: [], error: '' });
    try {
      const result = await requestLocalInterpretation(sourceText, cv, {
        endpoint: aiEndpoint,
        model: aiModel,
        provider: aiProvider,
      });
      if (runId !== aiRunRef.current) return;
      const suggestions = result.suggestions.map((suggestion) => ({
        ...suggestion,
        baseValue: getIn(cv, suggestion.field) ?? '',
      }));
      setAiState({ status: suggestions.length ? 'ready' : 'done', suggestions, warnings: result.warnings, error: '' });
      setNote({
        tone: 'good',
        text: suggestions.length
          ? `Local AI found ${suggestions.length} reviewable suggestion${suggestions.length === 1 ? '' : 's'}. Nothing was applied.`
          : 'Local AI found no safe changes to suggest. Nothing was changed.',
      });
    } catch (error) {
      if (runId !== aiRunRef.current) return;
      setAiState({
        status: 'error',
        suggestions: [],
        warnings: [],
        error: error?.code
          ? error.message
          : 'The local AI could not complete the review. The normal CV workflow is still available.',
      });
    }
  }, [aiEndpoint, aiModel, aiProvider, cv, sourceText]);

  const applyAiSuggestion = useCallback((suggestion) => {
    const currentValue = getIn(cv, suggestion.field) ?? '';
    if (currentValue !== suggestion.baseValue) {
      setNote({ tone: 'bad', text: 'That suggestion is stale because the field changed. Run the local review again.' });
      setAiState((state) => ({
        ...state,
        suggestions: state.suggestions.filter((item) => item.id !== suggestion.id),
      }));
      return;
    }
    setCv((current) => setIn(current, suggestion.field, suggestion.proposedValue));
    setAiState((state) => ({
      ...state,
      status: state.suggestions.length > 1 ? 'ready' : 'done',
      suggestions: state.suggestions.filter((item) => item.id !== suggestion.id),
    }));
    setNote({ tone: 'good', text: `Applied the reviewed suggestion to ${suggestion.field}.` });
  }, [cv]);

  const rejectAiSuggestion = useCallback((suggestion) => {
    setAiState((state) => ({
      ...state,
      status: state.suggestions.length > 1 ? 'ready' : 'done',
      suggestions: state.suggestions.filter((item) => item.id !== suggestion.id),
    }));
  }, []);

  const applyAllAiSuggestions = useCallback(() => {
    let applied = 0;
    let stale = 0;
    let next = cv;
    aiState.suggestions.forEach((suggestion) => {
      if ((getIn(next, suggestion.field) ?? '') !== suggestion.baseValue) {
        stale += 1;
        return;
      }
      next = setIn(next, suggestion.field, suggestion.proposedValue);
      applied += 1;
    });
    setCv(next);
    setAiState((state) => ({ ...state, status: 'done', suggestions: [] }));
    setNote({
      tone: stale ? 'bad' : 'good',
      text: stale
        ? `${applied} suggestion${applied === 1 ? '' : 's'} applied; ${stale} stale suggestion${stale === 1 ? '' : 's'} discarded. Review the remaining fields.`
        : `Applied ${applied} reviewed suggestion${applied === 1 ? '' : 's'}.`,
    });
  }, [aiState.suggestions, cv]);

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

  const ctx = {
    cv, update, updateList, push, removeAt, issueFor, issueUnder, direct, R, anonymous,
    onAutoSynthesize: handleAutoSynthesize, onAutoAliases: handleAutoAliases,
  };

  const workRef = useRef(null);
  useEffect(() => {
    if (step === 'edit') workRef.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div className="cvb">
      <Hero
        step={step}
        loaded={loaded}
        onRestart={() => {
          aiRunRef.current += 1;
          setCv(clone(EMPTY));
          setStep('start');
          setGaps([]);
          setSourceText('');
          setAiState({ status: 'idle', suggestions: [], warnings: [], error: '' });
          setNote(null);
          setSources([]);
        }}
      />

      {note && (
        <div className={`cvb-note cvb-note--${note.tone}`} role={note.tone === 'bad' ? 'alert' : 'status'}>
          {note.text}
        </div>
      )}

      {step === 'start' ? (
        <StartPanel
          paste={paste}
          setPaste={setPaste}
          onLoad={() => onPaste(paste)}
          onFile={onFile}
          busy={busy}
          onBlank={() => {
            aiRunRef.current += 1;
            setCv({ ...clone(EMPTY), personal: { ...EMPTY.personal, fullName: 'New candidate' } });
            setSourceText('');
            setAiState({ status: 'idle', suggestions: [], warnings: [], error: '' });
            setStep('edit');
            setSources([{ name: 'Blank Template', format: 'form' }]);
          }}
        />
      ) : (
        <div className="cvb-work" ref={workRef} tabIndex={-1} aria-label="Candidate editor">
          <div className="cvb-form">
            <IngestionScorecard
              cv={cv}
              sources={sources}
              onOpenSupp={() => setShowSuppModal(true)}
              onStandardize={handleStandardize}
              onAutoSynthesize={handleAutoSynthesize}
            />

            <AiAssistPanel
              cv={cv}
              sourceText={sourceText}
              state={aiState}
              endpoint={aiEndpoint}
              setEndpoint={setAiEndpoint}
              model={aiModel}
              setModel={setAiModel}
              provider={aiProvider}
              setProvider={setAiProvider}
              busy={Boolean(busy)}
              onRun={handleAiInterpret}
              onApply={applyAiSuggestion}
              onReject={rejectAiSuggestion}
              onApplyAll={applyAllAiSuggestions}
            />

            {showSuppModal && (
              <SupplementaryModal
                busy={busy}
                onClose={() => setShowSuppModal(false)}
                onFile={onSupplementaryFile}
                paste={suppPaste}
                setPaste={setSuppPaste}
                onPaste={() => onSupplementaryPaste(suppPaste)}
              />
            )}

            {gaps.length > 0 && (
              <div className="cvb-gaps">
                <p className="cvb-eyebrow">Raised while reading the CV</p>
                <ul>
                  {gaps.map((gap, i) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
                <div className="cvb-gaps-actions">
                  <button className="cvb-btn cvb-btn--tiny" onClick={() => setShowSuppModal(true)}>
                    + Add LinkedIn PDF / Supplementary document to auto-fill
                  </button>
                  <button className="cvb-btn cvb-btn--tiny" onClick={handleStandardize}>
                    ⚡ Quick-standardize formatting
                  </button>
                </div>
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
            <button
              className="cvb-btn cvb-btn--primary"
              onClick={build}
              disabled={!report.ok || !loaded || Boolean(busy)}
            >
              {busy || 'Download the profile (.docx)'}
            </button>
            <button className="cvb-btn" onClick={exportJson}>
              Save the data file (.json)
            </button>
            <button className="cvb-btn cvb-btn--ghost" onClick={() => setShowSuppModal(true)}>
              + Add Supplementary Document
            </button>
            <button className="cvb-btn cvb-btn--ghost" onClick={handleStandardize} title="Standardize hyphens, title casing and bullet punctuation">
              ⚡ Standardize all
            </button>
            <span className="cvb-status">
              {!report.ok
                ? `${report.errors.length} error${report.errors.length === 1 ? '' : 's'} to fix`
                : report.warnings.length
                  ? `${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'} to consider`
                  : 'Clean — ready to build'}
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
        <li>
          <span>01</span>
          <h3>Upload</h3>
          <p>Drop the candidate&rsquo;s CV in &mdash; Word (.docx), PDF, LinkedIn profile export, rich text or plain text. You can even drop multiple documents together.</p>
        </li>
        <li>
          <span>02</span>
          <h3>Auto-Extract</h3>
          <p>The parser automatically extracts candidate details, roles, dates, qualifications, skills, and synthesizes house-standard profile bullets instantly.</p>
        </li>
        <li>
          <span>03</span>
          <h3>Build & Download</h3>
          <p>Preview, fine-tune or merge extra documents, and download the exact Talent Tree branded .docx candidate profile.</p>
        </li>
      </ol>

      <div className="cvb-panel">
        <h2>Load a candidate</h2>

        <div
          className={`cvb-drop${over ? ' is-over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files?.length) onFile(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        >
          Drop the CV here, or choose file(s)
          <em>.docx &middot; .pdf &middot; LinkedIn PDF export &middot; .rtf &middot; .txt &middot; .json</em>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".docx,.pdf,.rtf,.txt,.md,.doc,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => { if (e.target.files?.length) onFile(e.target.files); e.target.value = ''; }}
        />

        <label className="cvb-field">
          <span>Or paste CV / LinkedIn profile text</span>
          <textarea
            rows={7}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'Paste the whole CV or LinkedIn profile text here \u2014 name, summary, experience, education, skills, the lot.'}
          />
        </label>

        <div className="cvb-actions">
          <button className="cvb-btn cvb-btn--primary" onClick={onLoad} disabled={!paste.trim() || Boolean(busy)}>
            {busy || 'Load candidate'}
          </button>
          <button className="cvb-btn" onClick={onBlank} disabled={Boolean(busy)}>Start from blank</button>
        </div>
        <p className="cvb-hint">
          Supports 2-column resumes, Canva PDFs, and LinkedIn PDF exports. If any details are missing on the CV, you can add a supplementary document or LinkedIn profile at any time.
        </p>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════ local AI assistant ══ */

function AiAssistPanel({
  cv,
  sourceText,
  state,
  endpoint,
  setEndpoint,
  model,
  setModel,
  provider,
  setProvider,
  busy,
  onRun,
  onApply,
  onReject,
  onApplyAll,
}) {
  const hasSource = Boolean(sourceText.trim());
  const running = state.status === 'running';
  const statusText = running
    ? 'Reviewing the extracted text…'
    : state.status === 'error'
      ? 'Local review failed'
      : state.status === 'done'
        ? 'Review complete'
        : state.status === 'ready'
          ? `${state.suggestions.length} suggestion${state.suggestions.length === 1 ? '' : 's'} waiting for review`
          : 'Optional';

  return (
    <section className="cvb-ai" aria-labelledby="cvb-ai-title">
      <div className="cvb-ai-head">
        <div>
          <p className="cvb-eyebrow cvb-eyebrow--accent">Interpretation layer</p>
          <h2 id="cvb-ai-title">Ask a local AI to review the draft</h2>
        </div>
        <span className={`cvb-ai-status is-${state.status}`}>{statusText}</span>
      </div>

      <p className="cvb-hint">
        This is an optional second pair of eyes for messy layouts and misplaced fields. It returns
        small, traceable suggestions for you to approve — it never rewrites or applies the profile.
      </p>

      <div className="cvb-ai-boundary">
        <strong>No paid API is built in.</strong> Use a self-hosted Ollama-compatible model or a
        same-origin relay that you control. The original CV stays in this tab unless you press
        the review button; when you do, its extracted text is sent to the endpoint below.
        No API key is stored or requested here.
      </div>

      <div className="cvb-ai-settings">
        <label className="cvb-field">
          <span>Provider format</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="ollama">Ollama JSON chat</option>
            <option value="openai">OpenAI-compatible JSON chat</option>
          </select>
          <em className="cvb-inline">The provider must be reachable from this browser and allow the site origin.</em>
        </label>
        <label className="cvb-field">
          <span>Endpoint</span>
          <input
            type="url"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="/api/cv-ai or https://your-ai-server.example/api/chat"
            autoComplete="off"
            spellCheck="false"
          />
          <em className="cvb-inline">Use a server/LAN URL or same-origin path, not a paid provider key.</em>
        </label>
        <label className="cvb-field">
          <span>Installed model</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="qwen2.5:3b"
            autoComplete="off"
            spellCheck="false"
          />
          <em className="cvb-inline">The model name must already exist on that service.</em>
        </label>
      </div>

      <div className="cvb-ai-actions">
        <button
          className="cvb-btn cvb-btn--primary"
          type="button"
          onClick={onRun}
          disabled={!hasSource || !endpoint.trim() || running || busy}
        >
          {running ? 'Interpreting locally…' : 'Interpret & suggest formatting'}
        </button>
        <span className="cvb-ai-meta">
          {hasSource ? `${sourceText.length.toLocaleString()} extracted characters ready` : 'Load a CV to enable review'}
        </span>
      </div>

      {state.error && (
        <p className="cvb-ai-error" role="alert">{state.error}</p>
      )}

      {state.warnings.length > 0 && (
        <div className="cvb-ai-warnings" role="status">
          <strong>Review notes</strong>
          <ul>
            {state.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </div>
      )}

      {state.suggestions.length > 0 && (
        <div className="cvb-ai-results" aria-live="polite">
          <div className="cvb-ai-results-head">
            <div>
              <h3>Suggestions to approve</h3>
              <p>Compare each change with the source before applying it.</p>
            </div>
            <button className="cvb-btn cvb-btn--tiny" type="button" onClick={onApplyAll}>
              Approve all shown
            </button>
          </div>
          <div className="cvb-ai-list">
            {state.suggestions.map((suggestion) => {
              const currentValue = getIn(cv, suggestion.field) ?? '';
              const stale = currentValue !== suggestion.baseValue;
              return (
                <article className={`cvb-ai-suggestion${stale ? ' is-stale' : ''}`} key={suggestion.id}>
                  <div className="cvb-ai-suggestion-top">
                    <span className="cvb-ai-kind">{suggestion.kind}</span>
                    <code>{suggestion.field}</code>
                    <span className="cvb-ai-confidence">{suggestion.confidence} confidence</span>
                  </div>
                  <div className="cvb-ai-values">
                    <div>
                      <span>Current draft</span>
                      <p>{currentValue || '— empty —'}</p>
                    </div>
                    <div>
                      <span>Suggested</span>
                      <p>{suggestion.proposedValue}</p>
                    </div>
                  </div>
                  <p className="cvb-ai-reason">{suggestion.reason}</p>
                  <p className="cvb-ai-source"><span>Source evidence</span> <q>{suggestion.sourceQuote}</q></p>
                  {stale && <p className="cvb-ai-stale">This field changed after the review. Run it again instead of overwriting the new value.</p>}
                  <div className="cvb-ai-suggestion-actions">
                    <button className="cvb-btn cvb-btn--tiny cvb-btn--primary" type="button" onClick={() => onApply(suggestion)}>
                      Approve
                    </button>
                    <button className="cvb-btn cvb-btn--tiny" type="button" onClick={() => onReject(suggestion)}>
                      Reject
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {state.status === 'done' && !state.suggestions.length && !state.error && (
        <p className="cvb-ai-complete" role="status">No pending AI changes. The deterministic checker and manual editor remain the source of truth.</p>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════ scorecard & helpers ══ */

function IngestionScorecard({ cv, sources, onOpenSupp, onStandardize, onAutoSynthesize }) {
  const name = cv.personal?.fullName || 'Not specified';
  const role = cv.meta?.targetRole || 'Not specified';
  const expCount = (cv.experience || []).length;
  const qualCount = (cv.qualifications || []).length;
  const skillCount = (cv.technicalSkills || []).flatMap((g) => g.items || []).length;
  const summaryCount = (cv.professionalSummary || []).length;

  return (
    <div className="cvb-scorecard">
      <div className="cvb-scorecard-header">
        <div>
          <span className="cvb-eyebrow cvb-eyebrow--accent">Extracted Profile</span>
          <h2 className="cvb-scorecard-title">{name}</h2>
          <p className="cvb-scorecard-sub">{role}</p>
        </div>
        <div className="cvb-scorecard-actions">
          <button className="cvb-btn cvb-btn--tiny" onClick={onOpenSupp}>
            + Add Document / LinkedIn PDF
          </button>
          <button className="cvb-btn cvb-btn--tiny cvb-btn--ghost" onClick={onStandardize} title="Fix dashes, title cases and bullet full stops">
            ⚡ Standardize
          </button>
        </div>
      </div>

      <div className="cvb-badges">
        <span className="cvb-badge"><strong>{expCount}</strong> Employer{expCount === 1 ? '' : 's'}</span>
        <span className="cvb-badge"><strong>{qualCount}</strong> Qualification{qualCount === 1 ? '' : 's'}</span>
        <span className="cvb-badge"><strong>{skillCount}</strong> Skill{skillCount === 1 ? '' : 's'}</span>
        <span className="cvb-badge"><strong>{summaryCount}</strong> Summary Bullets</span>
      </div>

      {sources && sources.length > 0 && (
        <div className="cvb-sources-list">
          <span className="cvb-sources-label">Sources:</span>
          {sources.map((s, idx) => (
            <span key={idx} className="cvb-source-tag">
              📄 {s.name} <small>({s.format})</small>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplementaryModal({ busy, onClose, onFile, paste, setPaste, onPaste }) {
  const fileRef = useRef(null);
  const [over, setOver] = useState(false);

  return (
    <div className="cvb-modal-backdrop" onClick={onClose}>
      <div className="cvb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cvb-modal-head">
          <h3>Add Supplementary Document or LinkedIn Profile</h3>
          <button className="cvb-x" onClick={onClose}>&#10005;</button>
        </div>
        <p className="cvb-hint">
          Upload an additional document (e.g., LinkedIn Profile PDF, updated CV, certificates, or reference doc).
          Missing information will be intelligently merged into this candidate profile without overwriting existing data.
        </p>

        <div
          className={`cvb-drop cvb-drop--small${over ? ' is-over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
          }}
        >
          Choose or drop supplementary file
          <em>.pdf &middot; .docx &middot; LinkedIn profile PDF &middot; .txt</em>
        </div>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".docx,.pdf,.rtf,.txt,.md,.doc,.json"
          onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ''; }}
        />

        <label className="cvb-field">
          <span>Or paste additional text / LinkedIn content</span>
          <textarea
            rows={4}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste LinkedIn experience, skills, or education here to merge..."
          />
        </label>

        <div className="cvb-actions">
          <button className="cvb-btn cvb-btn--primary" onClick={onPaste} disabled={!paste.trim() || Boolean(busy)}>
            {busy || 'Merge Pasted Text'}
          </button>
          <button className="cvb-btn cvb-btn--ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ fields ══ */

const anchorId = (path) => `cvb-${String(path).replace(/[^\w]+/g, '-')}`;

function Field({ path, label, hint, mono, area, rows = 3, placeholder, issueFor, update, cv }) {
  const issue = issueFor(path);
  const messageId = `${anchorId(path)}-msg`;
  const described = issue || hint ? messageId : undefined;
  const wiring = {
    'aria-invalid': issue?.level === 'error' ? 'true' : undefined,
    'aria-describedby': described,
    placeholder,
    onChange: (e) => update(path, e.target.value),
  };
  return (
    <label className="cvb-field" data-anchor={path}>
      <span>{label}</span>
      {area ? (
        <textarea
          rows={rows}
          value={getIn(cv, path) ?? ''}
          className={issue ? `is-${issue.level}` : ''}
          {...wiring}
        />
      ) : (
        <input
          type="text"
          value={getIn(cv, path) ?? ''}
          className={`${mono ? 'is-mono ' : ''}${issue ? `is-${issue.level}` : ''}`}
          {...wiring}
        />
      )}
      {issue && <em id={messageId} className={`cvb-inline is-${issue.level}`}>{issue.message}</em>}
      {!issue && hint && <em id={messageId} className="cvb-inline">{hint}</em>}
    </label>
  );
}

/* ── South African Employment Equity designations ────────────────────── */
const EE_OPTIONS = [
  { value: '', label: '— Select —' },
  { value: 'African Male', label: 'African Male' },
  { value: 'African Female', label: 'African Female' },
  { value: 'Coloured Male', label: 'Coloured Male' },
  { value: 'Coloured Female', label: 'Coloured Female' },
  { value: 'Indian Male', label: 'Indian Male' },
  { value: 'Indian Female', label: 'Indian Female' },
  { value: 'White Male', label: 'White Male' },
  { value: 'White Female', label: 'White Female' },
  { value: 'Chinese Male', label: 'Chinese Male' },
  { value: 'Chinese Female', label: 'Chinese Female' },
];

function SelectField({ path, label, options, hint, issueFor, update, cv }) {
  const issue = issueFor(path);
  const messageId = `${anchorId(path)}-msg`;
  return (
    <label className="cvb-field" data-anchor={path}>
      <span>{label}</span>
      <select
        value={getIn(cv, path) ?? ''}
        className={issue ? `is-${issue.level}` : ''}
        aria-invalid={issue?.level === 'error' ? 'true' : undefined}
        aria-describedby={issue ? messageId : undefined}
        onChange={(e) => update(path, e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {issue && <em id={messageId} className={`cvb-inline is-${issue.level}`}>{issue.message}</em>}
      {!issue && hint && <em id={messageId} className="cvb-inline">{hint}</em>}
    </label>
  );
}

function ListField({ path, label, placeholder, cv, updateList, issueUnder }) {
  const stored = (getIn(cv, path) || []).join('\n');
  const [draft, setDraft] = useState(stored);
  const issue = issueUnder(path);

  useEffect(() => {
    setDraft((current) => visibleText(current, stored));
  }, [stored]);

  const messageId = `${anchorId(path)}-msg`;
  return (
    <label className="cvb-field" data-anchor={path}>
      <span>{label} <i>one per line</i></span>
      <textarea
        rows={Math.max(3, draft.split('\n').length + 1)}
        value={draft}
        placeholder={placeholder}
        className={issue ? `is-${issue.level}` : ''}
        aria-invalid={issue?.level === 'error' ? 'true' : undefined}
        aria-describedby={issue ? messageId : undefined}
        onChange={(e) => { setDraft(e.target.value); updateList(path, e.target.value); }}
        onBlur={() => setDraft(stored)}
      />
      {issue && <em id={messageId} className={`cvb-inline is-${issue.level}`}>{issue.message}</em>}
    </label>
  );
}

/* ═════════════════════════════════════════════════════════════════ editor ══ */

function Editor(ctx) {
  const { cv, push, removeAt, update, direct, R, onAutoSynthesize, onAutoAliases } = ctx;
  const F = (p) => <Field {...ctx} {...p} />;
  const SF = (p) => <SelectField {...ctx} {...p} />;

  return (
    <>
      <Block title="Positioning">
        <ModeSwitch mode={cv.meta.mode} onChange={(m) => update('meta.mode', m)} />
        <div className="cvb-two">
          <Field
            {...ctx}
            path="meta.targetRole"
            label="Target role"
            placeholder="Credit Risk Analyst"
            hint="The role this CV is positioned for — not always the current title."
          />
          <Field
            {...ctx}
            path="meta.fileName"
            label="File name"
            mono
            placeholder="Steyn_JJ_TalentTree_CV"
          />
        </div>
      </Block>

      <RedactionBlock {...ctx} onAutoAliases={onAutoAliases} />

      <Block title="Personal" note="No phone number, email, street address or ID number. The client contacts the consultant.">
        <div className="cvb-two">
          {F({ path: 'personal.fullName', label: 'Full name and surname' })}
          {F({ path: 'personal.citizenship', label: 'Citizenship', placeholder: 'South African' })}
        </div>
        <div className="cvb-two">
          {F({ path: 'personal.languages', label: 'Languages', placeholder: 'English, Afrikaans' })}
          {F({ path: 'personal.dateOfBirth', label: 'Date of birth', mono: true, placeholder: '18 March 1985' })}
        </div>
        <div className="cvb-two">
          {SF({ path: 'personal.eeStatus', label: 'Employment Equity (EE) status', options: EE_OPTIONS })}
          {F({ path: 'personal.areaOfResidence', label: 'Area of residence', placeholder: 'Northern Suburbs, Cape Town' })}
          {R.areaOfResidence && F({ path: 'personal.areaAlias', label: 'Shown instead of the area', placeholder: 'Cape Town' })}
          {F({ path: 'personal.availability', label: 'Availability', placeholder: '30 days / 1 calendar month' })}
        </div>
        <div className="cvb-two">
          {F({ path: 'personal.driversLicence', label: 'Driver’s licence', placeholder: 'Yes / Code B' })}
          {F({ path: 'personal.ownTransport', label: 'Own transport', placeholder: 'Yes' })}
        </div>
        {direct && (
          <div className="cvb-two">
            {F({ path: 'personal.email', label: 'Email address (candidate direct)' })}
            {F({ path: 'personal.phone', label: 'Contact number (candidate direct)' })}
          </div>
        )}
      </Block>

      {!direct && (
        <Block title="Presented by" note="Printed on the cover. This is who the client contacts about the candidate.">
          <div className="cvb-two">
            {F({ path: 'consultant.contactPerson', label: 'Consultant' })}
            {F({ path: 'consultant.contactNumber', label: 'Contact number', mono: true })}
          </div>
          {F({ path: 'consultant.emailAddress', label: 'Email address' })}
        </Block>
      )}

      <Block
        title="Profile"
        note="The first line is the lead. It prints large and has to stand alone. The house minimum is 4 bullets."
        headerAction={
          <button className="cvb-btn cvb-btn--tiny" onClick={onAutoSynthesize} title="Synthesize or refresh 4 summary bullets from experience">
            ✨ Auto-Synthesize Profile
          </button>
        }
      >
        <ListField {...ctx} path="professionalSummary" label="Profile bullets" />
        <ListField {...ctx} path="careerSummary" label="Career summary (usually empty)" />
      </Block>

      <Block title="Qualifications" onAdd={() => push('qualifications', blank.qualification)} addLabel="qualification">
        {cv.qualifications.map((q, i) => (
          <Card key={i} onRemove={() => removeAt('qualifications', i)}>
            <div className="cvb-row">
              <div className="cvb-narrow">
                {F({ path: `qualifications[${i}].year`, label: 'Year', mono: true, placeholder: '2019' })}
              </div>
              {F({ path: `qualifications[${i}].name`, label: 'Qualification' })}
              {F({ path: `qualifications[${i}].institution`, label: 'Institution' })}
            </div>
            {R.institutions && F({ path: `qualifications[${i}].institutionAlias`,
              label: 'Shown instead of the institution', placeholder: 'Leading South African university' })}
            <ListField {...ctx} path={`qualifications[${i}].notes`} label="Notes"
              placeholder="e.g. Specialisation in Financial Management" />
          </Card>
        ))}
      </Block>

      <Block title="Certifications" onAdd={() => push('certifications', blank.certification)} addLabel="certification">
        {cv.certifications.map((c, i) => (
          <Card key={i} onRemove={() => removeAt('certifications', i)}>
            <div className="cvb-row">
              <div className="cvb-narrow">
                {F({ path: `certifications[${i}].year`, label: 'Year', mono: true, placeholder: '2021' })}
              </div>
              {F({ path: `certifications[${i}].name`, label: 'Certification' })}
              {F({ path: `certifications[${i}].institution`, label: 'Provider' })}
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
          <Card
            key={i}
            live={(r.duration || '').endsWith('Present')}
            heading={r.employer || 'New employer'}
            onRemove={() => removeAt('experience', i)}
          >
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
                <button
                  className="cvb-x"
                  title="Remove title"
                  onClick={() => removeAt(`experience[${i}].titles`, j)}
                >
                  &#10005;
                </button>
              </div>
            ))}
            <button
              className="cvb-btn cvb-btn--tiny"
              onClick={() => push(`experience[${i}].titles`, blank.title)}
            >
              + title
            </button>

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

function RedactionBlock({ cv, update, R, anonymous, onAutoAliases, ...rest }) {
  const on = (id) => Boolean(R[id]);
  const toggle = (id) => update(`redact.${id}`, !on(id));
  const count = REDACTIONS.filter((r) => on(r.id)).length;

  return (
    <Block
      title="Blind profile"
      note="Tick what the client should not see. Nothing is deleted — the record keeps the real detail, and the same candidate can be sent open or blind without re-keying anything."
      headerAction={
        anonymous && (
          <button className="cvb-btn cvb-btn--tiny" onClick={onAutoAliases} title="Auto-fill employer and university descriptors">
            Auto-generate descriptors
          </button>
        )
      }
    >
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
            <Field
              cv={cv}
              update={update}
              {...rest}
              R={R}
              anonymous={anonymous}
              path="meta.reference"
              label="Reference shown instead of the name"
              mono
              placeholder="Candidate TT-4821"
            />
          )}
        </>
      )}
    </Block>
  );
}

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
          <input
            type="radio"
            name="cvb-mode"
            value={o.id}
            checked={mode === o.id}
            onChange={() => onChange(o.id)}
          />
          <span>
            <strong>{o.label}</strong>
            <em>{o.note}</em>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Block({ title, note, children, onAdd, addLabel, headerAction }) {
  return (
    <section className="cvb-block">
      <div className="cvb-block-head">
        <h2>{title}</h2>
        {headerAction && <div className="cvb-block-action">{headerAction}</div>}
      </div>
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
      || document.querySelector(`[data-anchor^="${field}"]`)
      || document.querySelector('.cvb-field:has(.is-error), .cvb-field:has(.is-warning)');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector('input, textarea')?.focus({ preventScroll: true });
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
