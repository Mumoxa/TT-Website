# HPIS integration review — historical foundation

**Confirmed:** The access model described below has been superseded by `docs/assessments/WPP_AGENT_PROMPT_2.md`. The owner now requests recruiter-only results using the AP/AR candidate model. The private-account and 90-day design notes below are retained as historical context, not current requirements.

## Confirmed
- The reference blueprint is on `claude/hpis-rebuild-spec`, not main. This review is based on its `docs/assessments/HPIS_REBUILD_SPEC.md`.
- Talent Tree's existing assessments are a React/Vite experience backed by the `ASSESSMENT_DB` D1 binding. Its candidate sessions are tied to occupational attempts. The blueprint assumes a separate authenticated candidate account, consent system and portal; those contracts are not present in the inspected assessment schema and router.
- The existing occupational assessment stores candidate attempts and results for recruiter access. Reusing that flow for HPIS would conflict with the blueprint's candidate-private, separate research requirements.
- The repository is public and its `.gitignore` and assessment schema explicitly prohibit committing live occupational questions and keys. The blueprint branch itself includes the provisional HPIS keys. This foundation includes only the publicly available IPIP-50 material, not the keyed occupational-style forms, and exposes no API or UI.
- The P01 calculation and public-form projection are implemented as isolated pure functions. The source record and its sign keys are public-domain material; the projection does not contain signs or factor properties. A separate storage layer and migration exist, but are not connected to any route, identity, retention scheduler or candidate interface.

## Inference
- A dedicated candidate identity/session and data-rights lifecycle, or an independently reviewed equivalent, is needed before research attempts can be offered safely. An occupational attempt cookie alone does not establish the required account-level privacy and rights contracts.
- Publishing keyed research forms in this public repository can compromise the integrity of later research. Agree on private form distribution before porting the remaining forms.

## Hypothesis
- A separate research namespace and storage, rather than extending the existing recruiter-visible assessment results, is the safer integration boundary. This requires design and security review.

## Unknown
- Legal basis, HPCSA classification, validation, fairness and reliability; industrial psychologist and legal/privacy review are required before inviting real candidates.
- Candidate account ownership, scheduled retention sweeps, audit, consent, account export/erasure hooks, encryption key management, accommodations, admin-only aggregate reporting and deployment arrangements for HPIS have not been implemented or verified here. The unmounted storage primitives are not a substitute for those integrations.
- Independent review of all keyed HPIS items and a screen-reader/mobile journey have not been performed.

## Status and next steps
This is **partial, unexposed research infrastructure**, not a usable assessment. Do not enable, invite, use for selection, or advertise it as validated. Next: resolve identity and private-content architecture; implement the blueprint's complete encrypted, isolated API and data-rights lifecycle; then candidate/admin interfaces, independent key review, fairness and end-to-end tests. Obtain the blueprint's governance approvals before any real candidate is invited.
