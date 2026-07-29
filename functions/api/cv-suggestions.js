import { suggestionRequestSchema, responseSchemasByTask } from '../../shared/cvSuggestionsContract.js';
import { deriveClientKey } from '../lib/clientKey.js';
import { jsonResponse, safeError } from '../lib/responses.js';
const MAX_BODY = 32 * 1024;
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return safeError(405, 'method_not_allowed');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return safeError(415, 'unsupported_media_type');
  const advertised = Number(request.headers.get('content-length'));
  if (advertised > MAX_BODY) return safeError(413, 'request_too_large');
  if (!env.ORACLE_CV_API_URL || !env.ORACLE_CV_API_TOKEN || !env.CLIENT_KEY_SECRET) return safeError(503, 'configuration_unavailable');
  let raw;
  try { raw = await request.text(); } catch { return safeError(400, 'invalid_request'); }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return safeError(413, 'request_too_large');
  let body;
  try { body = suggestionRequestSchema.parse(JSON.parse(raw)); } catch { return safeError(400, 'invalid_request'); }
  const requestId = crypto.randomUUID();
  const clientKey = await deriveClientKey(request.headers.get('CF-Connecting-IP'), env.CLIENT_KEY_SECRET);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(`${env.ORACLE_CV_API_URL.replace(/\/$/, '')}/v1/suggestions`, { method: 'POST', headers: { Authorization: `Bearer ${env.ORACLE_CV_API_TOKEN}`, 'X-Client-Key': clientKey, 'X-Request-Id': requestId, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get('retry-after');
      return safeError(429, 'rate_limited', retryAfter ? { 'Retry-After': retryAfter } : {});
    }
    if (upstream.status === 422) return safeError(422, 'suggestion_rejected');
    if (!upstream.ok) return safeError(503, 'upstream_unavailable');
    let output;
    try { output = responseSchemasByTask[body.task].parse(await upstream.json()); } catch { return safeError(502, 'invalid_upstream_response'); }
    return jsonResponse(output);
  } catch { return safeError(503, 'upstream_unavailable'); } finally { clearTimeout(timer); }
}
export const onRequestPost = onRequest;
