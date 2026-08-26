# CV-Builda semantic parser — Oracle / n8n

## Status

**Partially implemented.** The CV-Builda branch contains the browser client and strict response normalisation. This workflow is the matching n8n server-side contract. It still needs to be imported into the Oracle n8n instance, activated, and runtime-tested before the frontend branch should be merged to production.

## Intended data flow

```
talenttree.co.za/cv-builda
  -> extracted CV text only
  -> https://n8n.mumoxa.co.za/webhook/cv-builda-parse
  -> n8n on Oracle
  -> Ollama on host.containers.internal:11434
  -> schema-valid candidate JSON
  -> browser-side structural checks
  -> existing CV-Builda validator
  -> existing DOCX generator
```

The original PDF/DOCX bytes remain in the browser. The semantic request contains extracted text, file name and mode. No paid-provider API key is used by CV-Builda.

## Import

Import `docs/cv-builda-n8n-workflow.json` into n8n and activate it only after the test webhook succeeds.

The workflow currently targets:

- Ollama: `http://host.containers.internal:11434/api/chat`
- Model: `llama3.2:3b` (the model already known to exist on the Oracle host)
- Production webhook path: `/webhook/cv-builda-parse`

## Recommended model upgrade

Once the workflow is live and the baseline path is verified, pull `qwen3.5:4b` on the Oracle host and change the model in **Build Strict Ollama Request** from `llama3.2:3b` to `qwen3.5:4b`.

Do not make that change until the model is actually installed. The first objective is a working end-to-end path; the second is accuracy benchmarking.

## Security / POPIA checks before activation

1. Keep Ollama private to the Oracle host/container network. CV-Builda must never call port 11434 directly.
2. Put `n8n.mumoxa.co.za` behind valid HTTPS before production use.
3. Restrict CORS to `https://talenttree.co.za`.
4. Do not log `sourceText` in custom Code nodes.
5. Use n8n execution-data retention appropriate for candidate PII. If executions retain request/response payloads, configure pruning or workflow-level settings so CV text is not stored indefinitely.
6. Add a request authentication mechanism before exposing this webhook beyond the Talent Tree site. CORS alone is not authentication.
7. Rate-limit the public webhook at the reverse proxy / Cloudflare layer.
8. Confirm the n8n container can reach `host.containers.internal:11434`.

## Runtime smoke test

The production smoke test should POST a small synthetic CV to:

`https://n8n.mumoxa.co.za/webhook/cv-builda-parse`

Expected response shape:

```json
{
  "cv": {
    "meta": { "targetRole": "..." },
    "personal": { "fullName": "..." },
    "experience": []
  },
  "gaps": [],
  "evidence": [],
  "engine": "ollama:..."
}
```

Do not use a real candidate CV for the first infrastructure smoke test.

## Evaluation before production

Build a benchmark set of real, consented CVs with known-good structured JSON. The minimum checks are:

- employer precision / recall;
- title-to-employer mapping;
- dates preserved exactly;
- qualification/institution mapping;
- responsibilities kept under the correct role;
- zero email/heading-as-employer errors;
- zero fabricated employers, dates, qualifications, skills or metrics.

A missing value should cost review time. A fabricated value is a release blocker.
