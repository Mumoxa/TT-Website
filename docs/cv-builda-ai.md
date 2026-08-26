# CV-Builda local AI assistant

## Why this costs zero in the website

CV-Builda does **not** call OpenAI, Anthropic, Gemini, Hugging Face, or any other
paid hosted model. There is no API key field and no provider secret in the
browser bundle.

The optional interpretation layer in `src/cv-builda/cv/ai.js` sends extracted
text only when a staff member presses **Interpret & suggest formatting**. The
endpoint is configured by the operator and can be:

- a self-hosted Ollama-compatible service; or
- a same-origin relay that the organisation controls.

The static site itself does not supply a model or an AI server. If the endpoint
is empty or unavailable, the normal parser, editor, validator, standardizer and
Word download continue to work. This is intentional: AI must never become a
paid dependency or a single point of failure.

## Recommended no-subscription setup

Install Ollama on a machine/server that the staff browser can reach, then pull a
small local model. The model name is editable in the CV-Builda panel; the
current default is `qwen2.5:3b`.

```text
ollama pull qwen2.5:3b
```

Expose the Ollama-compatible `/api/chat` endpoint through a controlled HTTPS
URL or a same-origin relay and configure that URL in the panel. The browser
must be allowed by the endpoint's CORS policy. A hosted preview must not point
at `localhost` or `127.0.0.1`; use a server/LAN URL or a same-origin relay.

For a build where the endpoint is already known, the non-secret Vite settings
are optional:

```text
VITE_CV_AI_ENDPOINT=https://your-controlled-ai-host.example/api/chat
VITE_CV_AI_MODEL=qwen2.5:3b
```

These settings identify a public endpoint/model only. They are not a security
mechanism and must never contain a token or password. Do not put a relay token
in a `VITE_` variable.

## What the assistant is allowed to do

1. The deterministic parser extracts the CV first and the original extracted
   text remains in memory for the active tab.
2. The assistant receives the extracted text and a candidate-facing snapshot of
   the current draft. Consultant details are not included in the AI context.
3. The model can suggest a destination for an explicit source phrase or a small
   formatting change to an existing field.
4. Every accepted suggestion must use an existing field path, cite a source
   quote found in the loaded text, and preserve protected numbers, dates,
   acronyms, URLs and contact tokens.
5. Suggestions are shown as current-versus-proposed values. Nothing is changed
   until a staff member approves it. Editing the draft clears pending
   suggestions; a stale suggestion cannot overwrite a newer manual edit.

The model is instructed to treat CV text as untrusted data, so text such as
“Ignore previous instructions” is data rather than an instruction. The client
also validates the response and drops unsafe or unverifiable suggestions. A
human still checks the original CV before export.

The request is bounded to 12,000 extracted characters and 24 suggestions. The
client uses JSON mode, temperature zero, a request timeout, generic error
messages, and does not log request or response bodies.

## Privacy boundary

- File extraction and Word generation remain in the browser.
- No candidate data is sent merely by uploading, editing, standardizing or
  downloading.
- Pressing the AI button is an explicit network boundary: extracted text then
  transits the configured endpoint.
- The repository contains no AI server, database, draft persistence, API key or
  model weights.
- Use a controlled/self-hosted endpoint if candidate data is not allowed to
  leave the organisation. Check that endpoint, reverse proxy and model logs do
  not record request bodies.

## Verification

The request/response and safety boundary is covered by
`tests/cv-ai.test.mjs`. Run:

```bash
npm test
npm run build
```

The tests mock the provider; they do not claim that a real Ollama service is
installed or reachable. A real deployment still needs a connectivity, CORS,
model-availability and log-retention check using synthetic CV data.
