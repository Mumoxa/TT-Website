# Confidential Employment Offer Delivery (MVP)

> Status: **Implemented and verified locally** (2026-09-08). Pages Functions + D1 +
> R2 code is complete and the full flow was exercised against the local
> Cloudflare simulator. **Not yet deployed to production** — see
> [Deploying to production](#deploying-to-production) (needs one-time Cloudflare
> account setup by a human with access).

Delivers confidential client offer PDFs to candidates through a secure,
non-enumerable link (`/offer/<64-hex-token>`). The candidate must accept the
Confidentiality Undertaking before the PDF is released. Every material event is
logged server-side (D1).

## Architecture

- **Frontend:** existing React/Vite SPA. `/offer/<token>` and `/admin/offers`
  are lazy routes (`src/offers/OfferApp.jsx`, `src/offers/AdminApp.jsx`), so a
  candidate never downloads the marketing site or internal CV/specs tooling.
- **API:** Cloudflare Pages Functions in `functions/` (no Node server needed —
  this deploys on the same Cloudflare Pages project as the site).
- **Data:** Cloudflare D1 (SQLite) — `offers`,
  `offer_confidentiality_acceptances`, `offer_events`. Schema:
  `migrations/0001_create_offer_tables.sql`.
- **Storage:** private R2 bucket `tt-offers-private` (binding `PDF_BUCKET`).
  Offer PDFs are stored under `offers/<uuid>.pdf` and are **never** in `public/`
  and never served as static files. They are streamed only by the authenticated
  API after server-side confirmation that the candidate accepted the
  undertaking.
- **Security:** 64-hex-char (256-bit) per-offer tokens; no PII in URLs;
  acceptances and audit events store IP + user agent server-side; admin tool is
  gated by a server-side `ADMIN_KEY` with an HttpOnly SameSite=Strict session
  cookie; `SameSite` + custom header (`x-tt-offer-admin: 1`) on create calls
  block CSRF; no-store/noindex headers on `/offer*`, `/admin*`, `/api/*`.

## API surface

| Route | Purpose |
| --- | --- |
| `GET  /api/offer/:token` | Landing metadata + acceptance state (logs `OFFER_LINK_OPENED`) |
| `POST /api/offer/:token/accept` | Records acceptance (logs `CONFIDENTIALITY_ACCEPTED`) |
| `GET  /api/offer/:token/access` | Post-agreement gate (logs `OFFER_ACCESSED`) |
| `GET  /api/offer/:token/download` | Streams private PDF (logs `OFFER_DOWNLOADED`) |
| `POST /api/admin/login` | Log in with `ADMIN_KEY` |
| `GET  /api/admin/session` | Session check |
| `GET/POST /api/admin/offers` | List / create offers (multipart upload) |
| `GET  /api/admin/events?offerId=` | Audit trail + acceptance record |

## Local development

```bash
npm install
npm run offers:migrate    # applies migrations to the local D1 store
npm run offers:dev        # vite build, then wrangler pages dev on :8788
```

The local simulator uses `.wrangler/` for D1/R2 and reads the single internal
password from `.dev.vars` (`ADMIN_KEY=...`). Open
`http://localhost:8788/admin/offers`, log in with that key, upload a PDF and
walk the candidate link. (`npm run dev` still serves the plain marketing site
without the Functions API.)

## Using it (production or local)

1. Open `/admin/offers` and log in with the internal access key.
2. Enter candidate name + email, client, position, expiry, and upload the
   client's original offer PDF.
3. Click **Create offer & generate secure link**, then **Copy link**.
4. Send the copied URL to the candidate (WhatsApp/email — no email integration
   in the MVP).
5. The candidate sees the branded offer page, must tick the checkbox
   (the button stays disabled until they do), then agrees. The acceptance is
   stored server-side **before** the PDF is released.
6. Verify acceptance on `/admin/offers` → **Audit** on the offer row
   (shows `Confidentiality acceptance` and the full event trail), or with SQL:
   ```bash
   npx wrangler d1 execute tt-offers --remote --command \
     "SELECT o.candidate_name, a.accepted_at, a.terms_version
        FROM offer_confidentiality_acceptances a JOIN offers o ON o.id = a.offer_id
       ORDER BY a.id DESC LIMIT 5;"
   ```

## Deploying to production

The repo deploys to Cloudflare Pages from `main` (git push). The offer
subsystem needs one-time resources, created by someone with Cloudflare access
to the project:

```bash
npx wrangler d1 create tt-offers              # copy the returned database_id
npx wrangler r2 bucket create tt-offers-private
```

1. In `wrangler.toml`, replace the placeholder `database_id` with the real one
   (only needed if deploying with `wrangler pages deploy`).
2. Cloudflare Pages dashboard → project → **Settings → Bindings**:
   - D1 binding `DB` → `tt-offers`
   - R2 binding `PDF_BUCKET` → `tt-offers-private`
   - Secret `ADMIN_KEY` → choose a long random value (e.g.
     `openssl rand -base64 32`) — server-side only, never in the frontend.
3. Apply the schema to the remote database:
   ```bash
   npx wrangler d1 migrations apply tt-offers --remote
   ```
4. Push to `main` (or run `npx wrangler pages deploy dist`). Existing
   `_redirects` SPA fallback and `_headers` rules already cover `/offer*`,
   `/admin*`, `/api/*`.

No candidate data is stored in the repository; D1 and R2 hold all records.

## Known MVP limitations

- Admin creation is a single-key shared login (no per-consultant accounts,
  no audit of who created an offer beyond IP/user agent).
- No email/WhatsApp sending, reminders, or expiry notifications.
- No digital signature — the candidate downloads the client's original PDF,
  signs it normally and returns it to Talent Tree.
- Rate limiting is per-isolate (coarse), not global.
- Repeated downloads/views each append an audit event (no dedupe).
- Not yet deployed to production (needs the Cloudflare setup above).

## Deferred (out of scope for the MVP)

Recruiter dashboard, candidate accounts, complex auth, e-signatures/DocuSign,
email + WhatsApp integration, automatic reminders, counter-offer risk scoring,
resignation/onboarding workflows, analytics, PDF editing/watermarking, client
portal, offer comparison, AI features.
