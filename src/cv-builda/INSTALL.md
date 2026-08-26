# CV-Builda · talenttree.co.za/cv-builda

Installed. The page is served at `/cv-builda` and nothing further needs doing
to reach it — this file is now a description of how it is wired rather than a
list of steps.

## How it is wired

| | |
|---|---|
| `src/cv-builda/` | the page, the composer, the checker, the worked example and optional local AI bridge |
| `src/main.jsx` | imports `CvBuilda` and renders it when the path is `/cv-builda` |
| `public/_redirects` | tells Cloudflare Pages to serve the SPA shell for every path, so `/cv-builda` reaches the app instead of 404ing. Vite copies `public/` into `dist/` verbatim |
| `package.json` | `docx@^9` as a dependency; `npm run cv:samples` rebuilds the sample documents |

The site has no router and does not need one. `Root()` in `src/main.jsx` is
four lines and picks between two pages:

```jsx
function Root() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/cv-builda') return <CvBuilda />;
  return <App />;
}
```

Add a third page and that becomes a router; until then it would be ceremony.

## Linking to it

The page is a working tool, not a marketing page, so it is deliberately not in
the primary nav. If it ever should be:

```jsx
<a className="nav-link" href="/cv-builda">CV-Builda</a>
```

## Reading a CV

The page takes the candidate's own CV. There is no conversion step and no JSON
to handle — drop the file in and a draft profile comes back.

| Format | How it is read |
|---|---|
| `.docx` | The zip is opened and `word/document.xml` read directly. Paragraphs become lines, list paragraphs keep their bullet, and a table row becomes one tab-separated line |
| `.pdf` | pdf.js, loaded only when a PDF actually arrives. Text runs are grouped into lines by baseline, and a wide horizontal gap becomes a tab, which is how a PDF renders a date column |
| `.rtf` | Control words stripped, `\par` and `\tab` honoured |
| `.txt`, `.md` | As they are |
| `.doc` | Word 97–2003 hides its text behind a piece table. The readable runs are pulled out and the result is checked before it is accepted; if it is not readable the page says to save as `.docx` rather than showing rubbish |
| `.json` | A data file saved earlier from this page, so a candidate can be reopened |

Two things it cannot read, and says so plainly rather than failing oddly: a
`.gdoc` on a desktop, which is a link rather than a document (File → Download →
Microsoft Word first), and a scanned PDF, which has no text in it at all.

### What the parser will not do

`cv/parse.js` fills what the text supports and reports the rest. It never
invents a value to satisfy a house rule. A CV that says "2019 – 2021" has given
years; no amount of parsing turns that into months, so the range is kept as
written, the gap is raised for the consultant, and the validator blocks the
build until a person resolves it with the candidate. That friction is the house
rule working.

The one place it derives rather than reads is arithmetic over stated facts. An
employer dated "2019 – Present" whose title rows start "Jul 2019" has a tenure
the CV already states, only lower down; that is read off the rows, and only when
the derived years match the stated ones exactly.

Everything else that could not be resolved comes back in the panel above the
editor: a missing profile section, an employer with no title against it, a
referees section that was dropped, an ID number that was found and not copied.
Nothing on that list is fixed silently.

### Accuracy

The parser reads a CV the way a person skims one: headings tell it where it is,
a date range opens an employment block, and the lines above a date are the
employer and the title. It handles the layouts South African CVs actually use —
labelled personal details, tabbed date columns, promotions listed under one
employer, bullets under sub-headings.

It will still be wrong sometimes, and the editor exists for that. The check to
run when changing it is `npm test`: `tests/cv-reading.test.mjs` reads a Talent
Tree profile back through the whole path and asserts the record it produces
passes the validator with no errors.

## Optional local AI (zero budget)

The builder now has an optional interpretation layer in `cv/ai.js`. It has no
paid-provider SDK and no API key: it sends extracted text only after the user
presses the review button, to an operator-supplied Ollama-compatible endpoint
or same-origin relay. The deterministic parser, editor, validator,
standardizer and Word download remain usable without AI.

The panel defaults to the small `qwen2.5:3b` model name but does not download or
host a model. A self-hosted service must be configured separately. See
[`docs/cv-builda-ai.md`](../../docs/cv-builda-ai.md) for the zero-subscription
setup, request limits, safety checks and the exact privacy boundary.

## Design

The page uses your existing tokens from `styles.css` — `--ink`, `--paper`,
`--accent`, `--serif`, `--sans`, `--line`, `--ease`. It defines no colours of
its own; the fallbacks in `cv-builda.css` exist only so the page still renders
if it is ever loaded outside the site shell. Change the site palette and the
builder follows.

Note the deliberate split: the **page** is warm cream, Fraunces and teal,
because it is part of talenttree.co.za. The **document it generates** is the
TRACE identity — navy spine, cyan signal, Calibri and Consolas — because that
is Talent Tree's candidate profile, not its website. Two brands, two jobs.

## No referees section

A formal recruitment profile ends at the career history. There is no
`Referees` heading and no "available on request" line: the client asks the
consultant, who asks the candidate, so the line states a fact the reader had
already assumed and spends a heading doing it.

The rule is enforced in three places, and all three matter:

| Where | What it does |
|---|---|
| `CvBuilda.jsx` | The empty record has no `referees` field, and `ingest()` deletes one arriving in an older data file |
| `cv/validate.js` | Warns if a record still carries `referees`, so the field is removed rather than silently dropped |
| `cv/compose.js` | Emits no referees heading and no referees paragraph |

Removing the field alone was not enough — the composer is what a client sees,
so that is where the section had to be absent. `tests/cv-builda.test.mjs`
builds a record that still carries the field and asserts neither the heading
nor the line reaches the document.

## Where the work happens

Reading the CV and building the document both run in the browser tab. Uploading,
editing, standardizing and downloading do not make a network request. The
optional AI review is the one explicit exception: pressing its button sends the
extracted text to the endpoint configured in the AI panel. The endpoint is
operator-supplied, so use a self-hosted service or a controlled same-origin
relay and verify its logs do not retain request bodies.

AI suggestions are separate from the record. They are limited to existing field
paths, must cite source text and preserve protected facts, and are displayed
for approval rather than applied automatically. Editing the draft clears them.
The AI path is optional and the validator, manual editor and Word build do not
depend on it.

## Tests

`npm test` runs the repository suite, which includes
`tests/cv-builda.test.mjs` — the rules that decide what a client is allowed to
receive. A regression there does not break a page, it sends a candidate's
employer or contact details to someone who was never meant to have them.

The browser and the CLI run the same `compose()`, so the documents they
produce are identical part for part apart from `docProps/core.xml`, which
carries the timestamp. If those two ever diverge in `word/document.xml`, the
guarantee that every profile comes out the same has broken.

`npm run cv:samples` rebuilds `src/cv-builda/samples/` — run it after any
change to the composer. A stale sample is worse than none.

## Two modes, because the page is public

`/cv-builda` is reachable by anyone, so the page asks who is sending the CV
before anything else. The answer changes the document, not just the wording.

| | **Agency** (default) | **Direct** |
|---|---|---|
| Sent by | Talent Tree, on the candidate's behalf | The candidate |
| Page one | Navy cover, logo, candidate details | Masthead: name, role, contact line |
| Contact shown | The consultant's | The candidate's own |
| Confidentiality notice | Yes | No |
| Candidate's email/phone | **Blocked** — the validator errors | **Required** — the validator errors if absent |
| Hiding the candidate's name | Allowed | **Blocked** — see below |

The validator inverts on this setting, which is the part worth understanding.
In agency mode a candidate email anywhere in the file is an error, because
Talent Tree's whole position is that the client contacts the consultant. In
direct mode the absence of an email *and* a phone number is an error, because
the document would be undeliverable. Same function, opposite rule, driven by
one field: `meta.mode`.

The two settings meet in one place, and it is a contradiction. Direct mode has
no consultant block, and hiding the candidate's name strips their email and
phone with it — a document with neither reaches a reader who has no way to
answer it. The validator errors rather than letting it build: a candidate
cannot send an anonymous CV about themselves.

`samples/Steyn_JJ_TalentTree_CV.docx` and `samples/Steyn_JJ_CV_direct.docx`
are the same candidate in both modes.

## Blind profiles

Independent of mode, a panel of seven checkboxes controls what the client sees.
Tick what to hide:

| Checkbox | What the document shows instead |
|---|---|
| Candidate name | Your reference, e.g. `Candidate TT-4821`, or initials. Also strips email and phone |
| Date of birth | A five-year age band, worked out from the date |
| Area of residence | A broader area you supply, e.g. `Western Cape` |
| Employer names | A descriptor you write per employer, e.g. `JSE-listed retail group` |
| Institution names | A descriptor, e.g. `South African university` |
| Exact dates | Every tenure as a band — `4 – 7 years` instead of the months |
| Qualification years | Nothing. Years of study date a candidate as precisely as a birth date |

`samples/TT4821_Anonymous_Profile.docx` is Mr Steyn's record with six of the
seven on.
Talent Tree's contact block stays on the cover, because a blind profile is still
an agency profile.

### Redaction is a view, never a deletion

This is the part worth understanding before you rely on it. Ticking a box does
not change the record. `redact()` runs at compose time and returns a new object;
the stored JSON keeps the real employer, the real dates and the real person.

That means the open and blind versions of a candidate are **one record rendered
twice**. Send a client the blind profile, they ask to see the name, untick two
boxes and rebuild — no re-keying, and no chance of the two documents drifting
apart. If redaction were destructive you would be maintaining two files per
candidate and they would diverge within a month.

### The leak check

A redacted header is worthless if the prose still names the employer, and this
is the failure mode blind CVs actually have in practice. The validator builds a
token list from every hidden name and walks every line a reader sees — profile
bullets, employer context, responsibilities, achievements, job titles, reason
for leaving — and raises an **error**, not a warning, for each place a hidden
name survives:

```
✗ professionalSummary[0]: still contains "TFG" — the employer name is
  redacted, so this reveals it. Reword the line.
```

The build stays blocked until they are gone. When this ran against Mr Steyn's
file it found three leaks the redaction had missed entirely — one in the profile,
one in the employer context, one in the first responsibility.

Note what the fix is: reword the line. "Own TFG's 5-year retail credit portfolio
model" becomes "Own the 5-year retail credit portfolio model", which is a better
bullet in the open version too, since the employer is already named in the
header. The check improves the record rather than forking it.

### What it will not do

It never invents a substitute. Where a replacement has to carry meaning — an
employer descriptor, an institution descriptor, a broader area — a human writes
it, and the validator refuses to build until they have. The only values the
system generates are arithmetic: an age band from a date of birth, a tenure band
from two dates. Arithmetic is not invention.

### If you only ever want one of them

Delete the `<ModeSwitch>` line in `Editor()` and set `mode` in `EMPTY`. The
validator and composer keep working; the choice just stops being visible.
