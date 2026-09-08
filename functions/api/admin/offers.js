/* Internal: create offers (multipart: fields + PDF file) and list recent offers.
   Every request must carry the admin session cookie (SameSite=Strict) and,
   for POSTs, the custom header below (blocks cross-site form CSRF). */

import { json, clientMeta, logEvent, nowIso, rateLimited, newSecureToken, MAX_PDF_BYTES } from '../../lib/core.js';
import { verifySession } from '../../lib/admin.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CREATE_HEADER = 'x-tt-offer-admin';

async function requireSession(request, env) {
  const session = await verifySession(request, env);
  if (!session.ok) {
    return session.error === 'not_configured'
      ? json({ ok: false, error: 'not_configured', message: 'Admin access is not configured on this deployment yet.' }, 503)
      : json({ ok: false, error: 'unauthorized' }, 401);
  }
  return null;
}

function cleanField(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function onRequest(context) {
  const { request, env } = context;
  const { ip, ua } = clientMeta(request);

  const denied = await requireSession(request, env);
  if (denied) return denied;

  /* ---- list recent offers -------------------------------------------------- */
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT o.id, o.secure_token, o.candidate_name, o.candidate_email, o.client_name,
              o.position_title, o.status, o.expires_at, o.created_at,
              (SELECT accepted_at FROM offer_confidentiality_acceptances a
                WHERE a.offer_id = o.id AND a.accepted = 1
                ORDER BY a.id DESC LIMIT 1) AS accepted_at
         FROM offers o
        ORDER BY o.created_at DESC
        LIMIT 50`
    ).all();
    const offers = (rows.results || []).map((o) => ({
      id: o.id,
      token: o.secure_token,
      url: `/offer/${o.secure_token}`,
      candidate_name: o.candidate_name,
      candidate_email: o.candidate_email,
      client_name: o.client_name,
      position_title: o.position_title,
      status: o.status,
      expires_at: o.expires_at,
      created_at: o.created_at,
      accepted_at: o.accepted_at,
    }));
    return json({ ok: true, offers });
  }

  /* ---- create an offer ------------------------------------------------------ */
  if (request.method === 'POST') {
    if (request.headers.get(CREATE_HEADER) !== '1') {
      return json({ ok: false, error: 'invalid_request' }, 403);
    }
    if (rateLimited(`admin-create:${ip}`, 20)) {
      return json({ ok: false, message: 'Too many requests. Please try again shortly.' }, 429);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ ok: false, error: 'invalid_form' }, 400);
    }

    const candidate_name = cleanField(form.get('candidateName'));
    const candidate_email = cleanField(form.get('candidateEmail'), 254).toLowerCase();
    const client_name = cleanField(form.get('clientName'));
    const position_title = cleanField(form.get('positionTitle'));
    const expiresRaw = typeof form.get('expiresAt') === 'string' ? form.get('expiresAt').trim() : '';
    const pdf = form.get('pdf');

    if (!candidate_name || !candidate_email || !client_name || !position_title || !expiresRaw) {
      return json({ ok: false, error: 'required_fields', message: 'All fields are required.' }, 400);
    }
    if (!EMAIL_RE.test(candidate_email)) {
      return json({ ok: false, error: 'invalid_email', message: 'Please enter a valid candidate email address.' }, 400);
    }
    const expiresMs = Date.parse(expiresRaw);
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
      return json({ ok: false, error: 'invalid_expiry', message: 'Expiry must be a future date and time.' }, 400);
    }

    if (!pdf || typeof pdf === 'string') {
      return json({ ok: false, error: 'pdf_required', message: 'Please attach the offer PDF.' }, 400);
    }
    const looksLikePdf =
      pdf.type === 'application/pdf' || (typeof pdf.name === 'string' && /\.pdf$/i.test(pdf.name));
    if (!looksLikePdf) {
      return json({ ok: false, error: 'pdf_type', message: 'The offer document must be a PDF file.' }, 400);
    }
    if (pdf.size < 1 || pdf.size > MAX_PDF_BYTES) {
      return json({ ok: false, error: 'pdf_size', message: 'The offer PDF must be between 1 byte and 20 MB.' }, 400);
    }

    const id = crypto.randomUUID();
    const secure_token = newSecureToken();
    const pdf_key = `offers/${id}.pdf`;
    const expires_at = new Date(expiresMs).toISOString();
    const created_at = nowIso();

    try {
      await env.DB.prepare(
        `INSERT INTO offers
           (id, secure_token, candidate_name, candidate_email, client_name,
            position_title, pdf_key, expires_at, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9)`
      )
        .bind(id, secure_token, candidate_name, candidate_email, client_name, position_title, pdf_key, expires_at, created_at)
        .run();
      await env.PDF_BUCKET.put(pdf_key, pdf.stream(), {
        httpMetadata: { contentType: 'application/pdf' },
      });
    } catch (err) {
      // Best-effort rollback so a failed creation never leaves a dangling offer.
      await env.DB.prepare('DELETE FROM offers WHERE id = ?1').bind(id).run().catch(() => {});
      await env.PDF_BUCKET.delete(pdf_key).catch(() => {});
      return json({ ok: false, error: 'storage_error', message: 'The offer could not be saved. Please try again.' }, 500);
    }

    await logEvent(env, id, 'OFFER_CREATED', ip, ua);

    return json({
      ok: true,
      offer: {
        id,
        token: secure_token,
        url: `/offer/${secure_token}`,
        candidate_name,
        candidate_email,
        client_name,
        position_title,
        expires_at,
      },
    }, 200);
  }

  return json({ ok: false, message: 'Method not allowed.' }, 405);
}
