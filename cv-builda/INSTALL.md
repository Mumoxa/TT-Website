# CV-Builda → talenttree.co.za/cv-builda

Drops into `Mumoxa/TT-Website` (React + Vite, Cloudflare Pages). One new
dependency, one new folder, two lines changed in `src/main.jsx`.

## 1 · Copy the folder

```bash
cp -R cv-builda src/cv-builda
cp patch/_redirects public/_redirects
npm install docx@^9.0.0
```

`public/_redirects` tells Cloudflare Pages to serve the SPA shell for every
path, so `/cv-builda` reaches your app instead of 404ing. Vite copies anything
in `public/` into `dist/` verbatim, so no build config changes.

## 2 · Route to it

Your site has no router, and it does not need one. Two edits in `src/main.jsx`:

```jsx
// with the other imports at the top
import CvBuilda from './cv-builda/CvBuilda.jsx';
```

```jsx
// replace the last line of the file
function Root() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/cv-builda') return <CvBuilda />;
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
```

That is the whole integration. `npm run dev`, then open `/cv-builda`.

## 3 · Link to it

The page is a working tool, not a marketing page. Whether it belongs in the
primary nav depends on who it is for — see the note at the end.

```jsx
<a className="nav-link" href="/cv-builda">CV-Builda</a>
```

## What it costs the site

Nothing until someone uses it. `docx` and the composer are behind
`await import(...)`, so they compile to separate chunks:

```
dist/assets/index-*.js      216 kB   the site + the builder UI
dist/assets/compose-*.js    139 kB   loaded on first Download
dist/assets/dist-*.js       404 kB   docx, loaded on first Download
```

A visitor who never opens `/cv-builda` downloads none of the last two, and a
visitor who opens it but does not build downloads neither. This is why the
build button is wired to a dynamic import rather than a top-level one — keep
it that way.

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

Removing the field alone is not enough — the composer is what a client sees,
so that is where the section actually has to be absent. Any sample `.docx`
built before this change still ends in `Referees / Available on request.` and
needs rebuilding.

## Privacy

The document is generated in the browser. No candidate data is uploaded and
nothing is stored. That is a real POPIA answer rather than a policy promise,
and it is worth saying on the page — the hero already does.

If you later add server-side conversion (upload a CV, get the JSON back), that
property changes and the wording must change with it.

## Tests

```bash
node test-page.js      # 27 behaviour tests against the React page in jsdom
node test-bundle.js    # browser output is byte-identical to the CLI output
```

The second one matters most. It builds the same candidate through both paths,
unzips the two `.docx` files and diffs `word/document.xml`. If that test ever
fails, the guarantee that every profile comes out identical has broken.

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

The validator inverts on this setting, which is the part worth understanding.
In agency mode a candidate email anywhere in the file is an error, because
Talent Tree's whole position is that the client contacts the consultant. In
direct mode the absence of an email *and* a phone number is an error, because
the document would be undeliverable. Same function, opposite rule, driven by
one field: `meta.mode`.

`Steyn_JJ_TalentTree_CV.docx` and `Steyn_JJ_CV_direct.docx` are the same
candidate in both modes.

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

`TT4821_Anonymous_Profile.docx` is Mr Steyn's record with six of the seven on.
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
