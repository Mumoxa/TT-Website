/* Admin access for the internal offer-creation tool.
   ADMIN_KEY is read from the environment/secret (never shipped to the client).
   Session = short-lived HttpOnly SameSite=Strict cookie signed with that key. */

import { COOKIE_NAME, SESSION_TTL_MS } from './core.js';

const sha256hex = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

function sign(issuedAt, keyHex) {
  return sha256hex(`${issuedAt}:${keyHex}`);
}

export async function sessionValue(adminKey) {
  const issuedAt = String(Date.now());
  const keyHex = await sha256hex(adminKey);
  return `${issuedAt}.${await sign(issuedAt, keyHex)}`;
}

export async function verifySession(request, env) {
  const key = env.ADMIN_KEY;
  if (!key) return { ok: false, error: 'not_configured' };
  const header = request.headers.get('cookie') || '';
  const cookie = header
    .split(';')
    .map((s) => s.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return { ok: false };
  const value = cookie.slice(COOKIE_NAME.length + 1);
  const dot = value.indexOf('.');
  if (dot <= 0) return { ok: false };
  const issuedAt = value.slice(0, dot);
  const provided = value.slice(dot + 1);
  const keyHex = await sha256hex(key);
  const expected = await sign(issuedAt, keyHex);
  if (provided.length !== expected.length || provided !== expected) return { ok: false };
  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > SESSION_TTL_MS) return { ok: false };
  return { ok: true };
}

export async function adminKeyMatches(request, env) {
  const key = env.ADMIN_KEY;
  if (!key) return false;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== 'string' || !body.key) return false;
  const [a, b] = await Promise.all([sha256hex(body.key.trim()), sha256hex(key)]);
  return a === b;
}

export function isHttpsRequest(request) {
  const fwd = request.headers.get('x-forwarded-proto') || '';
  return request.url.startsWith('https:') || fwd.toLowerCase().includes('https');
}

export function sessionCookieHeader(request, value) {
  const secure = isHttpsRequest(request);
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000
  )}${secure ? '; Secure' : ''}`;
}

export function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
