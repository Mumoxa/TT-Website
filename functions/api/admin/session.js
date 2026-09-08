/* Internal: session check for the offer-creation tool. */

import { json } from '../../lib/core.js';
import { verifySession } from '../../lib/admin.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ ok: false, message: 'Method not allowed.' }, 405);
  const session = await verifySession(request, env);
  if (!session.ok) return json({ ok: false, loggedIn: false }, session.error === 'not_configured' ? 503 : 401);
  return json({ ok: true, loggedIn: true });
}
