# Deployment guide

Repository defaults describe Cloudflare Pages production branch `main`, build command `npm run build`, and output directory `dist`; verify all settings and the last known-good deployment in Cloudflare before use.

Generate relay values outside Git and store only in Cloudflare server-side variables: `ORACLE_CV_API_URL`, `ORACLE_CV_API_TOKEN`, and `CLIENT_KEY_SECRET`. Never use a `VITE_` prefix. Create a branch preview, recording Git SHA, preview URL, timestamp, build and Function results. Directly open and refresh `/cv-builda`; verify static assets bypass Functions while `/api/cv-suggestions` invokes the relay. Download preview assets and run the exact-marker secret scan.

Oracle deployment and rollback are in [the operations runbook](docs/cv-builda/operations-runbook.md). The API and Ollama ports must not be publicly exposed. Deployments require explicit authorization; this document records steps, not completion.
