/* Candidate-facing offer endpoints.
   Route: /api/offer/<secure-token>[/accept|/access|/download]
   - GET  /api/offer/:token            offer meta + acceptance state (logs OFFER_LINK_OPENED)
   - POST /api/offer/:token/accept     records CONFIDENTIALITY_ACCEPTED server-side
   - GET  /api/offer/:token/access     verifies acceptance, logs OFFER_ACCESSED
   - GET  /api/offer/:token/download   streams the private PDF (logs OFFER_DOWNLOADED)

   The PDF lives in a private R2 bucket. It is only ever streamed from here,
   after server-side confirmation that the confidentiality undertaking was
   accepted. There is no public or predictable path to the file.
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

function notAvailable(reason) {
  const status = reason === 'expired' ? 410 : 404;
  return unavailable(reason, status);
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const segments = (params && params.path) || [];
  const token = Array.isArray(segments) ? segments[0] : undefined;
  const action = Array.isArray(segments) ? segments[1] : undefined;

  if (!token) return json({ ok: false, message: 'Not found.' }, 404);
  const { ip, ua } = clientMeta(request);

  /* --- offer meta (landing page) ------------------------------------------ */
  if (action === undefined || action === '') {
    if (request.method !== 'GET') return json({ ok: false, message: 'Method not allowed.' }, 405);
    if (rateLimited(`open:${ip}`, 120)) return json({ ok: false, message: 'Too many requests. Please try again shortly.' }, 429);

    const offer = await getOfferByToken(env, token);
    const state = offer ? offerState(offer) : { reason: 'not_found' };
    await logEvent(env, offer ? offer.id : null, 'OFFER_LINK_OPENED', ip, ua);
    if (!state.ok) return notAvailable(state.reason);

    const acceptance = await latestAcceptance(env, offer.id);
    return json({
      ok: true,
      offer: {
        candidate_name: offer.candidate_name,
        position_title: offer.position_title,
        client_name: offer.client_name,
        expires_at: offer.expires_at,
      },
      accepted: acceptance
        ? { accepted: true, accepted_at: acceptance.accepted_at, terms_version: acceptance.terms_version }
        : null,
    });
  }

  /* --- confidentiality acceptance ------------------------------------------ */
  if (action === 'accept') {
    if (request.method !== 'POST') return json({ ok: false, message: 'Method not allowed.' }, 405);
    if (rateLimited(`accept:${ip}`, 20)) return json({ ok: false, message: 'Too many requests. Please try again shortly.' }, 429);

    const offer = await getOfferByToken(env, token);
    const state = offer ? offerState(offer) : { reason: 'not_found' };
    if (!state.ok) return notAvailable(state.reason);

    const body = await request.json().catch(() => null);
    if (!body || body.accepted !== true) {
      return json({ ok: false, error: 'accepted_required', message: 'You must agree to the confidentiality undertaking before continuing.' }, 400);
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

    const offer = await getOfferByToken(env, token);
    const state = offer ? offerState(offer) : { reason: 'not_found' };
    if (!state.ok) return notAvailable(state.reason);

    const acceptance = await latestAcceptance(env, offer.id);
    if (!acceptance) return json({ ok: false, error: 'not_accepted' }, 403);

    await logEvent(env, offer.id, 'OFFER_ACCESSED', ip, ua);
    return json({ ok: true, download: `/api/offer/${offer.secure_token}/download` });
  }

  /* --- protected PDF download ---------------------------------------------- */
  if (action === 'download') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ ok: false, message: 'Method not allowed.' }, 405);
    }
    if (rateLimited(`download:${ip}`, 90)) return json({ ok: false, message: 'Too many requests. Please try again shortly.' }, 429);

    const offer = await getOfferByToken(env, token);
    const state = offer ? offerState(offer) : { reason: 'not_found' };
    if (!state.ok) return notAvailable(state.reason);

    const acceptance = await latestAcceptance(env, offer.id);
    if (!acceptance) return json({ ok: false, error: 'not_accepted' }, 403);

    const object = await env.PDF_BUCKET.get(offer.pdf_key);
    if (!object) return json({ ok: false, message: 'The offer document could not be retrieved. Please contact your Talent Tree consultant.' }, 404);

    await logEvent(env, offer.id, 'OFFER_DOWNLOADED', ip, ua);

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
