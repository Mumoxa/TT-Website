# Talent Tree Website

React/Vite website for Talent Tree Consulting.

## Cloudflare Pages settings

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## CV Builda

The browser-based CV formatting workflow is available at `/cv-builda`. Source files are extracted locally and working candidate data is held in React memory; staff may explicitly send selected text through the optional suggestion relay. See [architecture](docs/cv-builda/architecture.md), [data flow](docs/cv-builda/data-flow.md), [privacy checks](docs/cv-builda/privacy-checklist.md), and [deployment steps](DEPLOYMENT.md).

```bash
npm run verify              # complete web and Function verification
npm run test:e2e             # desktop and mobile Chromium E2E/accessibility checks
npm run verify:secrets      # scan built browser assets
npm run inspect:docx -- FILE.docx
```

The Python API has its own tests and container build under `services/cv-suggestion-api`. Cloudflare, Oracle, and Microsoft Word checks must be recorded separately; a local build does not prove deployment readiness.
