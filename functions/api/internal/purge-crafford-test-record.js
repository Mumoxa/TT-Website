// Temporary one-purpose cleanup endpoint for the explicitly identified test offer.
// It can only target the exact Test/Test/Test + crafford1985@gmail.com record.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestGet({ env }) {
  const email = 'crafford1985@gmail.com';

  const rows = await env.DB.prepare(
    `SELECT id, pdf_key, candidate_name, candidate_email, client_name, position_title
       FROM offers
      WHERE lower(candidate_email) = ?1
        AND candidate_name = 'Test'
        AND client_name = 'Test'
        AND position_title = 'Test'`
  ).bind(email).all();

  const matches = rows.results || [];

  if (matches.length === 0) {
    return json({ ok: true, state: 'already_absent', matched: 0 });
  }

  // Refuse to act if the selector is not uniquely identifying one record.
  if (matches.length !== 1) {
    return json({ ok: false, state: 'refused_non_unique_match', matched: matches.length }, 409);
  }

  const offer = matches[0];

  const acceptanceCount = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM offer_confidentiality_acceptances WHERE offer_id = ?1'
  ).bind(offer.id).first();
  const eventCount = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM offer_events WHERE offer_id = ?1'
  ).bind(offer.id).first();

  // Remove the private PDF object for this exact record.
  await env.PDF_BUCKET.delete(offer.pdf_key);

  // Delete only rows related to this exact offer id, then the offer itself.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM offer_confidentiality_acceptances WHERE offer_id = ?1').bind(offer.id),
    env.DB.prepare('DELETE FROM offer_events WHERE offer_id = ?1').bind(offer.id),
    env.DB.prepare(
      `DELETE FROM offers
        WHERE id = ?1
          AND lower(candidate_email) = ?2
          AND candidate_name = 'Test'
          AND client_name = 'Test'
          AND position_title = 'Test'`
    ).bind(offer.id, email),
  ]);

  const verifyOffer = await env.DB.prepare('SELECT id FROM offers WHERE id = ?1').bind(offer.id).first();
  const verifyAcceptances = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM offer_confidentiality_acceptances WHERE offer_id = ?1'
  ).bind(offer.id).first();
  const verifyEvents = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM offer_events WHERE offer_id = ?1'
  ).bind(offer.id).first();

  const clean = !verifyOffer && Number(verifyAcceptances?.n || 0) === 0 && Number(verifyEvents?.n || 0) === 0;

  return json({
    ok: clean,
    state: clean ? 'deleted_and_verified' : 'verification_failed',
    deleted: {
      offer_id: offer.id,
      pdf_key: offer.pdf_key,
      acceptance_rows: Number(acceptanceCount?.n || 0),
      event_rows: Number(eventCount?.n || 0),
    },
    remaining: {
      offer: verifyOffer ? 1 : 0,
      acceptances: Number(verifyAcceptances?.n || 0),
      events: Number(verifyEvents?.n || 0),
    },
  }, clean ? 200 : 500);
}
