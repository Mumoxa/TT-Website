/* Internal: log in to the offer-creation tool with the shared admin key. */

import { json } from '../../lib/core.js';
import { adminKeyMatches, sessionCookieHeader, sessionValue } from '../../lib/admin.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ ok: false, message: 'Method not allowed.' }, 405);

  if (!env.ADMIN_KEY) {
    return json(
      { ok: false, error: 'not_configured', message: 'Admin access is not configured on this deployment yet.' },
      503
    );
  }

  const matches = await adminKeyMatches(request, env);
  if (!matches) return json({ ok: false, error: 'invalid_key' }, 401);

  const value = await sessionValue(env.ADMIN_KEY);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookieHeader(request, value) });
}
