# CV-Builda structured parser service

Status: **Frontend wired on draft branch; n8n deployment still requires import/activation**

## Architecture

```text
CV/PDF/DOCX
   |
   v
existing browser extract.js
   |
   v
POST /api/cv-parse
Cloudflare Pages Function
   |
   | X-CV-Parser-Key (server-side only)
   v
n8n webhook on Oracle
   |
   v
Ollama /api/chat
   |
   v
schema-constrained JSON
   |
   v
n8n structural guard
   |
   v
smart-parse.js validation
   |
   +--> structured candidate record
   |
   +--> deterministic parseCv fallback if the service fails
```

The browser never receives the n8n shared secret and Ollama must not be exposed directly to the internet.

## Files implemented

- `src/cv-builda/cv/smart-parse.js` — structured parser client, normalization, structural guards and fallback.
- `src/cv-builda/CvBuilda.jsx` — all raw CV ingestion paths now call `parseCvSmart`.
- `functions/api/cv-parse.js` — same-origin Cloudflare Pages relay.
- `automation/n8n/cv-builda-parser.workflow.json` — importable n8n/Ollama workflow.
- `tests/cv-smart-parse.test.mjs` — structured parser tests including the Bomikazi failure pattern.
- `tests/cv-parser-relay.test.mjs` — same-origin relay tests.
- `scripts/test-cv-parser.mjs` — live endpoint regression runner.

## Current model for first proof

The workflow uses `llama3.2:3b` because that is the model already installed on the Oracle host from the existing setup.

This is an initial architecture/accuracy proof, not a claim that 3B is the final model. Once the pipeline is working, benchmark it against `qwen3.5:4b` before choosing the production model.

Ollama structured output is requested with:

- `stream: false`
- `temperature: 0`
- a full JSON Schema in `format`
- `num_ctx: 32768`

## Deploy the n8n workflow

Import:

`automation/n8n/cv-builda-parser.workflow.json`

The imported workflow is intentionally inactive.

### 1. Protect the webhook

Open **CV Parse Webhook** and create/select a Header Auth credential:

- Header name: `X-CV-Parser-Key`
- Header value: generate a long random secret

Do not commit this value to Git.

The Pages Function will send the same value from the server-side `CV_PARSE_TOKEN` secret.

### 2. Verify n8n can reach Ollama

The imported HTTP Request node starts with:

`http://host.containers.internal:11434/api/chat`

The Oracle setup uses rootless Podman, so this is the preferred first host route, but it has **not yet been runtime-verified from inside the n8n container**.

Use the HTTP Request node's test action. If it cannot resolve/reach Ollama, change only this internal URL to the correct Podman host route. Do not expose port 11434 publicly as the fix.

### 3. Activate the workflow

After Header Auth and the Ollama request test succeed, activate the workflow and copy the **production** webhook URL.

Expected path:

`/webhook/cv-parse`

The intended n8n hostname from the existing Oracle setup is `n8n.mumoxa.co.za`, but use the actual production URL shown by the n8n UI rather than assuming it.

## Configure the Cloudflare Pages relay

The `/functions` directory is at the root of the project, so Cloudflare Pages can deploy `functions/api/cv-parse.js` as `/api/cv-parse`.

Set these **production and preview** runtime values in the TT-Website Pages project:

### CV_PARSE_UPSTREAM

The activated n8n production webhook URL, for example:

`https://n8n.mumoxa.co.za/webhook/cv-parse`

### CV_PARSE_TOKEN

The same random value configured in the n8n Header Auth credential.

Store this as a secret, not a Vite/browser environment variable.

No `VITE_CV_PARSE_ENDPOINT` value is required for production because CV-Builda defaults to the same-origin path `/api/cv-parse`.

## Privacy controls

CV text contains personal information.

The implementation therefore:

- keeps the n8n secret server-side;
- does not expose Ollama directly;
- limits source text to 60,000 characters;
- uses HTTPS for the Pages-to-n8n hop;
- does not log CV bodies in application code;
- configures the supplied n8n workflow with `saveDataSuccessExecution: none` and `saveDataErrorExecution: none`;
- strips email/phone from the agency-mode candidate profile;
- falls back locally when the service is unavailable.

Verify n8n instance-level execution/log settings as part of deployment as well.

## Model extraction rules

The first model pass is factual extraction, not CV marketing copy.

- Extract source-supported facts only.
- Empty is preferable to guessing.
- Never invent months for year-only dates.
- Never infer EE status, citizenship, availability, licence, transport, DOB or location.
- Never treat headings, spaced headings, contact details or qualification text as employers.
- Keep qualifications separate from experience.
- Keep employer/title boundaries intact.
- Keep multiple titles under one employer where supported.
- Capture reasons for leaving only when stated.
- Return short exact evidence quotes for important fields.
- Do not create a new marketing summary in this extraction pass.

## Bomikazi regression

The broken CV-Builda result proves that the legacy parser incorrectly classified these values as employers:

- `E D U C`
- `NDip Industrial`
- `W O R K E X P E R I E N C E`
- `Bomikazi.mditshwa@gmail.com`

The structured parser tests now explicitly reject all four.

The **original raw Bomikazi CV/source text is not currently stored in this repository or available in the attached-file history**. The only available artifact is the broken CV-Builda output. Therefore a true end-to-end model accuracy result must wait until the raw CV or the 2,780-character extracted source text is supplied again.

Once it is available:

```bash
npm run cv:parser:test -- ./bomikazi-extracted.txt https://talenttree.co.za/api/cv-parse
```

or test n8n directly:

```bash
CV_PARSE_TOKEN='<temporary shell value>' \
npm run cv:parser:test -- ./bomikazi-extracted.txt https://n8n.mumoxa.co.za/webhook/cv-parse
```

The runner fails if a known structural heading/contact/qualification pattern is returned as an employer.

## Request contract

```json
{
  "schemaVersion": 1,
  "sourceText": "full extracted CV text",
  "fileName": "candidate.pdf",
  "mode": "agency"
}
```

## Response contract

```json
{
  "cv": {
    "meta": {},
    "personal": {},
    "professionalSummary": [],
    "careerSummary": [],
    "qualifications": [],
    "certifications": [],
    "technicalSkills": [],
    "experience": [],
    "earlyCareer": []
  },
  "gaps": [],
  "evidence": [
    {
      "field": "experience[0].employer",
      "quote": "Exact source quote",
      "confidence": "high"
    }
  ]
}
```

## Safe failure behaviour

If Pages, n8n or Ollama fails, `parseCvSmart` automatically returns the existing deterministic parser result and adds a visible warning that the legacy parser was used.

DOCX composition, blind-profile logic and redaction are unchanged.
