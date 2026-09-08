/* Internal: audit trail for one offer (used to verify acceptance records). */

import { json } from '../../lib/core.js';
import { verifySession } from '../../lib/admin.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ ok: false, message: 'Method not allowed.' }, 405);

  const session = await verifySession(request, env);
  if (!session.ok) {
    return session.error === 'not_configured'
      ? json({ ok: false, error: 'not_configured', message: 'Admin access is not configured on this deployment yet.' }, 503)
      : json({ ok: false, error: 'unauthorized' }, 401);
  }

  const offerId = (request.url.includes('?') ? new URL(request.url).searchParams.get('offerId') : null) || '';
  if (!offerId) return json({ ok: false, error: 'offer_id_required' }, 400);

  const offer = await env.DB.prepare(
    `SELECT id, candidate_name, candidate_email, client_name, position_title FROM offers WHERE id = ?1`
  ).bind(offerId).first();
  if (!offer) return json({ ok: false, error: 'not_found' }, 404);

  const events = await env.DB.prepare(
    `SELECT event_type, created_at, ip_address, user_agent
       FROM offer_events WHERE offer_id = ?1
      ORDER BY id DESC LIMIT 200`
  ).bind(offerId).all();
  const acceptances = await env.DB.prepare(
    `SELECT accepted, accepted_at, terms_version, ip_address, user_agent
       FROM offer_confidentiality_acceptances WHERE offer_id = ?1
      ORDER BY id DESC LIMIT 10`
  ).bind(offerId).all();

  return json({
    ok: true,
    offer: {
      id: offer.id,
      candidate_name: offer.candidate_name,
      candidate_email: offer.candidate_email,
      client_name: offer.client_name,
      position_title: offer.position_title,
    },
    events: events.results || [],
    acceptances: acceptances.results || [],
  });
}
