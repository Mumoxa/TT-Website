# Talent Tree Website

React/Vite website for Talent Tree Consulting.

## Cloudflare Pages settings

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

## Routes

- `/` — Main marketing site
- `/cv-builda` — Internal CV anonymizer (client-side, POPIA compliant)
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

- `/cv-builda` and `/specs` are frontend-only (no data leaves browser) for POPIA compliance
- `/specs` is an unlisted private route with no application password gate; restrict the deployment with Cloudflare Access or an IP allowlist if stronger access control is required
- No client data stored — cleared on reset / tab close

