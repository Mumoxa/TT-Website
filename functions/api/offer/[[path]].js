/* Candidate-facing offer endpoints.
   Route: /api/offer/<token>[/accept|/access|/download]
   - GET  /api/offer/:token            offer meta + acceptance state (logs OFFER_LINK_OPENED)
   - POST /api/offer/:token/accept     records CONFIDENTIALITY_ACCEPTED server-side
   - GET  /api/offer/:token/access     verifies acceptance, logs OFFER_ACCESSED
   - GET  /api/offer/:token/download   streams the private PDF (logs OFFER_DOWNLOADED)

   Real offers live in D1 + R2 (64-hex secure tokens, PDFs in private R2 bucket,
   acceptance recorded in D1). A small set of well-known/demo offers (e.g.
   /offer/1) are served as a live preview so that public short URLs resolve —
   their acceptance lives in a short-lived HttpOnly cookie and their PDF is a
   static demo document bundled with the site.
*/

import {
  json,
  unavailable,
  clientMeta,
  logEvent,
  offerState,
  getOfferByToken,
  latestAcceptance,
  rateLimited,
  nowIso,
  TERMS_VERSION,
} from '../../lib/core.js';

const PDF_FILENAME = 'Talent-Tree-Employment-Offer.pdf';
const DEMO_PDF_FILENAME = 'Talent-Tree-Demo-Offer.pdf';
const DEMO_ACCEPT_COOKIE = 'tt_demo_offer_accepted';
const DEMO_ACCEPT_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function notAvailable(reason) {
  const status = reason === 'expired' ? 410 : 404;
  return unavailable(reason, status);
}

function setCookie(headerValue) {
  return { 'Set-Cookie': headerValue };
}

function demoAcceptanceFromCookie(request, offerId) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = cookieHeader.split(';').reduce((acc, piece) => {
    const eq = piece.indexOf('=');
    if (eq === -1) return acc;
    acc[piece.slice(0, eq).trim()] = decodeURIComponent(piece.slice(eq + 1).trim());
    return acc;
  }, {});
  const raw = cookies[DEMO_ACCEPT_COOKIE];
  if (!raw) return null;
  // value shape: <offerId>|<acceptedAt>|<version>
  const parts = raw.split('|');
  if (parts.length !== 3) return null;
  if (parts[0] !== offerId) return null;
  return { accepted: true, accepted_at: parts[1], terms_version: parts[2] };
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const segments = (params && params.path) || [];
  const token = Array.isArray(segments) ? segments[0] : undefined;
  const action = Array.isArray(segments) ? segments[1] : undefined;

  if (!token) return json({ ok: false, message: 'Not found.' }, 404);
  const { ip, ua } = clientMeta(request);

  const offer = await getOfferByToken(env, token);
  const state = offer ? offerState(offer) : { reason: 'not_found' };
  const isDemo = !!(offer && offer.is_demo);

  /* --- offer meta (landing page) ------------------------------------------ */
  if (action === undefined || action === '') {
    if (request.method !== 'GET') return json({ ok: false, message: 'Method not allowed.' }, 405);
    if (rateLimited(`open:${ip}`, 120)) return json({ ok: false, message: 'Too many requests. Please try again shortly.' }, 429);

    if (!isDemo) await logEvent(env, offer ? offer.id : null, 'OFFER_LINK_OPENED', ip, ua);
    if (!state.ok) return notAvailable(state.reason);

    let accepted = null;
    if (isDemo) {
      const c = demoAcceptanceFromCookie(request, offer.id);
      accepted = c ? { accepted: true, accepted_at: c.accepted_at, terms_version: c.terms_version } : null;
    } else {
      const row = await latestAcceptance(env, offer.id);
      accepted = row
        ? { accepted: true, accepted_at: row.accepted_at, terms_version: row.terms_version }
        : null;
    }

    return json({
      ok: true,
      demo: isDemo,
      offer: {
        candidate_name: offer.candidate_name,
        position_title: offer.position_title,
        client_name: offer.client_name,
        expires_at: offer.expires_at,
      },
      accepted,
    });
  }

  /* --- confidentiality acceptance ------------------------------------------ */
  if (action === 'accept') {
    if (request.method !== 'POST') return json({ ok: false, message: 'Method not allowed.' }, 405);
    if (rateLimited(`accept:${ip}`, 20)) return json({ ok: false, message: 'Too many requests. Please try again shortly.' }, 429);

    if (!state.ok) return notAvailable(state.reason);

    const body = await request.json().catch(() => null);
    if (!body || body.accepted !== true) {
      return json({ ok: false, error: 'accepted_required', message: 'You must agree to the confidentiality undertaking before continuing.' }, 400);
    }

    if (isDemo) {
      const existing = demoAcceptanceFromCookie(request, offer.id);
      if (existing) {
        return json({ ok: true, accepted_at: existing.accepted_at });
      }
      const acceptedAt = nowIso();
      const cookieVal = `${offer.id}|${acceptedAt}|${TERMS_VERSION}`;
      const cookieHeader =
        `${DEMO_ACCEPT_COOKIE}=${encodeURIComponent(cookieVal)}; ` +
        `Path=/; Max-Age=${DEMO_ACCEPT_MAX_AGE}; HttpOnly; SameSite=Lax; Secure`;
      // Demo offers don't write to D1 (they don't have a real row).
      return json({ ok: true, accepted_at: acceptedAt }, 200, setCookie(cookieHeader));
    }

    const existing = await latestAcceptance(env, offer.id);
    if (existing) {
      // Idempotent — repeated agreement must not duplicate the acceptance record.
      return json({ ok: true, accepted_at: existing.accepted_at });
    }

    const acceptedAt = nowIso();
    await env.DB.prepare(
      `INSERT INTO offer_confidentiality_acceptances
         (offer_id, accepted, accepted_at, terms_version, ip_address, user_agent)
       VALUES (?1, 1, ?2, ?3, ?4, ?5)`
    ).bind(offer.id, acceptedAt, TERMS_VERSION, ip, ua).run();
    await logEvent(env, offer.id, 'CONFIDENTIALITY_ACCEPTED', ip, ua);

    return json({ ok: true, accepted_at: acceptedAt });
  }

  /* --- post-acceptance access (confirmation screen gate) ------------------- */
  if (action === 'access') {
    if (request.method !== 'GET') return json({ ok: false, message: 'Method not allowed.' }, 405);
    if (rateLimited(`access:${ip}`, 60)) return json({ ok: false, message: 'Too many requests. Please try again shortly.' }, 429);

    if (!state.ok) return notAvailable(state.reason);

    let accepted;
    if (isDemo) {
      accepted = demoAcceptanceFromCookie(request, offer.id);
    } else {
      accepted = await latestAcceptance(env, offer.id);
    }
    if (!accepted) return json({ ok: false, error: 'not_accepted' }, 403);

    if (!isDemo) await logEvent(env, offer.id, 'OFFER_ACCESSED', ip, ua);
    return json({ ok: true, download: `/api/offer/${offer.secure_token}/download` });
  }

  /* --- protected PDF download ---------------------------------------------- */
  if (action === 'download') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ ok: false, message: 'Method not allowed.' }, 405);
    }
    if (rateLimited(`download:${ip}`, 90)) return json({ ok: false, message: 'Too many requests. Please try again shortly.' }, 429);

    if (!state.ok) return notAvailable(state.reason);

    let accepted;
    if (isDemo) {
      accepted = demoAcceptanceFromCookie(request, offer.id);
    } else {
      accepted = await latestAcceptance(env, offer.id);
    }
    if (!accepted) return json({ ok: false, error: 'not_accepted' }, 403);

    if (!isDemo) await logEvent(env, offer.id, 'OFFER_DOWNLOADED', ip, ua);

    if (isDemo) {
      // Serve the bundled demo PDF from the site's static assets.
      const url = new URL(request.url);
      const demoUrl = `${url.origin}/demo-offer-1.pdf`;
      let demoResp;
      try {
        // ASSETS is the Pages static-asset binding; fall back to fetching self.
        if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
          demoResp = await env.ASSETS.fetch(new Request(demoUrl, { method: request.method, headers: request.headers }));
        } else {
          demoResp = await fetch(demoUrl);
        }
      } catch {
        return json({ ok: false, message: 'The demo document could not be retrieved.' }, 500);
      }
      if (!demoResp || !demoResp.ok) {
        return json({ ok: false, message: 'The demo document could not be retrieved.' }, 404);
      }
      const headers = new Headers(demoResp.headers);
      headers.set('Content-Type', 'application/pdf');
      headers.set('Content-Disposition', `inline; filename="${DEMO_PDF_FILENAME}"`);
      headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      if (request.method === 'HEAD') return new Response(null, { headers });
      return new Response(demoResp.body, { headers });
    }

    const object = await env.PDF_BUCKET.get(offer.pdf_key);
    if (!object) return json({ ok: false, message: 'The offer document could not be retrieved. Please contact your Talent Tree consultant.' }, 404);

    const headers = {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${PDF_FILENAME}"`,
      'Content-Length': String(object.size),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (request.method === 'HEAD') return new Response(null, { headers });
    return new Response(object.body, { headers });
  }

  return json({ ok: false, message: 'Not found.' }, 404);
}
