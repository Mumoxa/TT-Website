# Privacy and abuse checklist

Use `Passed`, `Failed`, `Not run`, or `Not applicable`, and attach non-sensitive evidence. Current status is deliberately conservative.

| Check | Status | Evidence required |
|---|---|---|
| Local, Session, IndexedDB and Cache Storage contain no CV data after upload/edit/download/reset/refresh | Not run | Browser DevTools inspection |
| Object URLs are revoked on replacement/reset/unmount | Needs code review | Focused automated test and browser inspection |
| Original upload bytes never leave browser | Not run | Network capture for extraction/review/preview/export |
| Suggestion request contains selected fragments only | Not run | Redacted network inspection |
| Responses are structured and `Cache-Control: no-store` is present | Partially implemented | Function tests plus preview headers |
| Cloudflare, reverse-proxy, API and Ollama logs omit candidate marker | Not run | Search each deployed log source for `PRIVATE-CANDIDATE-MARKER-7391` |
| Container has no candidate-data volume | Implemented in Compose | Deployment configuration and runtime mount inspection |
| Refresh/reset discards the working draft | Not run | E2E/browser inspection |
| Built assets contain no server secret marker | Locally automatable | `FORBIDDEN_SECRET_MARKER=... npm run verify:secrets` |
| Invalid type/body/schema/token/task and rate-limit cases are safe | Partially implemented | Function/API suites and deployed abuse checks |
| Ollama outage returns a safe error and manual export remains usable | Not run | Controlled deployed outage test |

Never paste real candidate content into release evidence. Do not print request bodies, response bodies, prompts, model output, raw IP addresses, credentials, or secret values.
