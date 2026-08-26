# Talent Tree Website

React/Vite website for Talent Tree Consulting.

## Cloudflare Pages settings

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

## Routes

- `/` — Main marketing site
- `/cv-builda` — Internal CV formatter/anonymizer with automatic private semantic parsing and deterministic fallback; see `docs/cv-builda-semantic-parser.md`
- `/specs` — Internal job brief sanitizer (talenttree.co.za/specs) — converts client briefs (PDF, DOCX, XLSX, Google Docs, TXT) into sanitized, branded specs with client names replaced by generic descriptors, contacts removed, links replaced with CV@talenttree.co.za, and TalentTree branding. See `docs/specs.md`.

## Local development

```bash
npm install
npm run dev
# Open http://localhost:5173/specs for the private specs generator
```

## Production build

```bash
npm run build
npm test
```

## Security for internal tools

- `/cv-builda` extracts document text in the browser, then sends the extracted text through the same-origin `/api/cv-parse` Pages Function to Talent Tree's private self-hosted parser. The original PDF/DOCX bytes are not forwarded by this semantic parsing flow.
- `/specs` remains frontend-only. Both internal tools should be restricted with Cloudflare Access or an equivalent access control.
- CV-Builda parser secrets stay server-side in Cloudflare environment bindings. Do not expose the n8n webhook token in Vite variables or browser code.
- Candidate CV text is sensitive data. Production use requires verified n8n execution-data retention/pruning and access controls; see `docs/cv-builda-semantic-parser.md`.

