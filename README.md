# Talent Tree Website

React/Vite website for Talent Tree Consulting.

## Cloudflare Pages settings

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

## Routes

- `/` — Main marketing site
- `/profile` — Public interactive company profile (talenttree.co.za/profile): chaptered profile with scrollspy navigation, animated figures, filterable mandate book, an interactive fee calculator (≈15% of annual CTC vs the 25–35% retained executive search benchmark), accordions and a print/PDF stylesheet. Linked from the site header and footer, listed in `public/sitemap.xml`.
- `/profile/finance` — Public Accounting & Finance search capability profile (talenttree.co.za/profile/finance): proactive-search positioning, professional-pathway tabs (CA(SA), AGA(SA), SAIPA, CIMA/CGMA, ACCA), a six-step search-method stepper, a named client track record with sector filters and a print/PDF stylesheet. Listed in `public/sitemap.xml`.
- `/clients/Milkor` — Public client-facing Milkor sourcing intelligence profile
- `/cv-builda` — Internal CV formatter/anonymizer (client-side by default, with an optional zero-cost self-hosted AI review; see `docs/cv-builda-ai.md`)
- `/specs` — Internal job brief sanitizer (talenttree.co.za/specs) — converts client briefs (PDF, DOCX, XLSX, Google Docs, TXT) into sanitized, branded specs with client names replaced by generic descriptors, contacts removed, links replaced with CV@talenttree.co.za, and TalentTree branding. See `docs/specs.md`.
- `/offer/<secure-token>` — Confidential employment offer delivery for candidates (secure link; PDF released only after the confidentiality undertaking is accepted). See `docs/confidential-offers.md`.
- `/admin/offers` — Internal offer creation + acceptance verification tool (ADMIN_KEY gate). See `docs/confidential-offers.md`.

## Local development

```bash
npm install
npm run dev
# Open http://localhost:5173/specs for the private specs generator
```

The offer flow needs the Cloudflare Functions simulator (D1 + R2 + ADMIN_KEY):

```bash
npm run offers:migrate   # apply D1 schema to the local simulator
npm run offers:dev       # build, then serve site + offer API on http://localhost:8788
```

`ADMIN_KEY` for local use lives in `.dev.vars` (gitignored). In production it is
a secret on the Cloudflare Pages project — see `docs/confidential-offers.md`.

## Production build

```bash
npm run build
npm test
```

## Security for internal tools

- `/cv-builda` and `/specs` are frontend-only (no data leaves browser) for POPIA compliance
- `/specs` is an unlisted private route with no application password gate; restrict the deployment with Cloudflare Access or an IP allowlist if stronger access control is required
- No client data stored — cleared on reset / tab close
- `/admin/offers` is gated by a server-side `ADMIN_KEY` (HttpOnly SameSite=Strict session); offer PDFs sit in a private R2 bucket and are only streamed after the candidate accepts the confidentiality undertaking
- `/offer*`, `/admin*` and `/api/*` send `no-store` + `noindex` headers
