# Open assessment implementation plan

Latest user decision: retain actual results, remove automatic deletion, allow repeat attempts and display their ordinal. This supersedes the initial 30-day deletion and one-attempt requirements; privacy copy must reflect this policy.

1. Validate screening in shared browser/server code; preserve timing, saving, grading and session boundaries.
2. Add migration 0003 only. Create a redeemed internal invitation per open start. Encrypt ID using AES-256-GCM; link attempts using an assessment-scoped keyed hash. Allocate ordinal in an atomic D1 batch.
3. Open catalogue links, display expectations/privacy, separate public practice, validate the candidate form.
4. Project candidate results to overall score and section percentages/feedback only.
5. Add masked screening and ordinal to recruiter reports/emails without changing scoring or email delivery.
6. Remove withheld client branding, enforce a tracked-file scan and runtime response filtering.
7. Adapt existing tests without dropping coverage; add integration/browser checks, check practice against the private published battery, build and capture mobile/desktop screens.
8. Review the integrated diff, document fresh evidence and operational requirements, open a PR. Do not merge or deploy.
