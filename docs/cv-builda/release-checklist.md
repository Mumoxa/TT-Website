# CV Builda release checklist

This is a release gate, not a claim of readiness. Record exact commands, results, timestamps, Git SHA, preview/deployment identifiers, and non-sensitive evidence.

- [ ] Local frontend, Function, Python, container, E2E and accessibility verification passed.
- [ ] Diff matches the approved design and excludes persistence, inference, PDF export, authentication, and unrelated site changes.
- [ ] Cloudflare project settings, production branch, previous deployment, preview direct-route refresh, Function routing and asset secret scan verified.
- [ ] Oracle baseline, previous immutable tag, private networking, health/auth/rate-limit/outage/recovery and sanitized logs verified.
- [ ] Original bytes stayed local; selected text only transited the suggestion path; no candidate marker appeared in any inspected log/store.
- [ ] Both DOCX templates have identical approved text and pass package inspection.
- [ ] Microsoft Word desktop and keyboard/screen-reader acceptance recorded.
- [ ] Draft PR contains screenshots, synthetic artifacts where available, exact verification results, risks, remaining manual/deployment checks, and rollback target.
- [ ] Production deployment is explicitly authorized; Oracle is deployed before Pages.
- [ ] Production synthetic smoke and rollback decision recorded.

External Oracle, Cloudflare preview/production, Microsoft Word, and production smoke checks remain `Not run` until executed with direct evidence. Do not merge or deploy based on this checklist alone.
