/* Shared core for the Talent Tree confidential offer API (Cloudflare Pages Functions).
   Pure JS — no dependencies. Runs on workerd (Cloudflare) and Node >= 22. */

export const TERMS_VERSION = '2026-09-08-v1';
export const TOKEN_RE = /^[0-9a-f]{64}$/;         // 64 hex chars = 256 bits of entropy
export const MAX_PDF_BYTES = 20 * 1024 * 1024;    // 20 MB upload cap
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // admin session lifetime
export const COOKIE_NAME = 'tt_offer_admin';

export const nowIso = () => new Date().toISOString();

/* ---- small response + request helpers ------------------------------------ */

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

/* Friendly copy shared by the API and shown by the UI (UI also keeps a literal copy). */
export const UNAVAILABLE_MESSAGE =
  'This offer link is no longer available. Please contact your Talent Tree consultant.';

export function unavailable(reason, status = 404) {
  // Only ever echo a short status label back to the client — never row data.
  const safe = typeof reason === 'string' && reason.length <= 24 ? reason : 'unavailable';
  return json({ ok: false, reason: safe, message: UNAVAILABLE_MESSAGE }, status);
}

export function clientMeta(request) {
  const ip = (
    request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  ).slice(0, 64);
  const ua = (request.headers.get('user-agent') || '').slice(0, 500);
  return { ip, ua };
}

/* ---- token + offer state -------------------------------------------------- */

export function newSecureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Resolve offer state against the clock. Returns { ok:true } or { reason }. */
export function offerState(row, now = Date.now()) {
  if (!row) return { reason: 'not_found' };
  if (row.status !== 'active') return { reason: 'unavailable' };
  if (row.expires_at && Date.parse(row.expires_at) <= now) return { reason: 'expired' };
  return { ok: true };
}

export async function getOfferByToken(env, token) {
  if (!TOKEN_RE.test(token)) return null;
  return env.DB.prepare(
    `SELECT id, secure_token, candidate_name, candidate_email, client_name,
            position_title, pdf_key, expires_at, status, created_at
       FROM offers WHERE secure_token = ?1`
  ).bind(token).first();
}

export async function getOfferById(env, id) {
  return env.DB.prepare(
    `SELECT id, secure_token, candidate_name, candidate_email, client_name,
            position_title, pdf_key, expires_at, status, created_at
       FROM offers WHERE id = ?1`
  ).bind(id).first();
}

export async function latestAcceptance(env, offerId) {
  return env.DB.prepare(
    `SELECT id, accepted, accepted_at, terms_version
       FROM offer_confidentiality_acceptances
      WHERE offer_id = ?1 AND accepted = 1
      ORDER BY id DESC LIMIT 1`
  ).bind(offerId).first();
}

/* ---- audit events --------------------------------------------------------- */

const EVENT_TYPES = new Set([
  'OFFER_CREATED',
  'OFFER_LINK_OPENED',
  'CONFIDENTIALITY_ACCEPTED',
  'OFFER_ACCESSED',
  'OFFER_DOWNLOADED',
]);

export async function logEvent(env, offerId, eventType, ip, ua) {
  if (!EVENT_TYPES.has(eventType) || !offerId) return;
  await env.DB.prepare(
    `INSERT INTO offer_events (offer_id, event_type, created_at, ip_address, user_agent)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(offerId, eventType, nowIso(), ip || null, ua || null).run();
}

/* ---- minimal per-IP rate limiting (per-isolate; coarse but useful) -------- */

const buckets = new Map();
const WINDOW_MS = 60_000;

export function rateLimited(key, limit) {
  const now = Date.now();
  if (buckets.size > 4000) {
    for (const [k, v] of buckets) if (now - v.started > WINDOW_MS * 2) buckets.delete(k);
  }
  const entry = buckets.get(key);
  if (!entry || now - entry.started > WINDOW_MS) {
    buckets.set(key, { started: now, hits: 1 });
    return false;
  }
  entry.hits += 1;
  return entry.hits > limit;
}
