# Talent Tree CV Builda Implementation Plan Index

**Status:** Ready for implementation

**Approved design:** `docs/superpowers/specs/2026-07-28-talent-tree-cv-builda-design.md`

The work is deliberately divided into three plans so each subsystem can be implemented, reviewed, and verified independently.

## Execution order

1. **Frontend and Word generation**  
   `docs/superpowers/plans/2026-07-28-talent-tree-cv-builda-frontend.md`

   Builds the `/cv-builda` browser workflow, local DOCX/PDF extraction, source-fragment coverage, structured editing, additional information review, optional suggestion controls, Standard and Executive previews, and `.docx` generation.

2. **Cloudflare and Oracle suggestion service**  
   `docs/superpowers/plans/2026-07-28-talent-tree-cv-builda-suggestion-service.md`

   Builds the shared request contract, Cloudflare Pages Function relay, stateless FastAPI service, self-hosted Ollama integration, authentication between services, rate limiting, safe logging, structured-output validation, and deployment configuration.

3. **Integration and release**  
   `docs/superpowers/plans/2026-07-28-talent-tree-cv-builda-integration-release.md`

   Adds CI, preview deployment, Oracle deployment, privacy verification, Word acceptance testing, production smoke tests, release gates, and rollback procedures.

## Non-negotiable release rules

- Do not invent, infer, inflate, summarise away, or silently discard candidate information.
- Do not export while source fragments or additional notes remain unreviewed.
- Do not use browser or server persistence for candidate CV content.
- Do not send the original uploaded file to Cloudflare, Oracle, or Ollama.
- Do not apply AI suggestions without explicit staff approval.
- Do not claim that all processing stays on-device; selected suggestion text transits Cloudflare and Oracle transiently.
- Do not claim production readiness without passing automated tests, privacy checks, Oracle smoke tests, and manual Microsoft Word review.

## Implementation handoff

Each plan uses task-sized test-driven steps with exact files, interfaces, commands, and commit boundaries. Execute them in order. The suggestion service can be developed in parallel after the shared contract is established, but production integration must wait until the frontend and service completion gates both pass.
