import { apiJson, failure, requestJson, tokenHash } from './assessment-core.js';
const COOKIE = 'tt_assessment_admin';
const TTL = 60 * 60 * 1000;
async function signature(value, key) {
  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, encoder.encode(value)))].map(n => n.toString(16).padStart(2,'0')).join('');
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i=0;i<a.length;i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export async function assessmentAdmin(request, env) {
  if (!env.ASSESSMENT_ADMIN_KEY) return false;
  const value = (request.headers.get('Cookie') || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1) || '';
  const [issued, provided = ''] = value.split('.');
  if (!/^\d{13}$/.test(issued) || !/^[a-f0-9]{64}$/.test(provided)) return false;
  const age = Date.now()-Number(issued);
  return age >= 0 && age < TTL && equal(provided, await signature(issued,env.ASSESSMENT_ADMIN_KEY));
}
export async function assessmentLogin(request, env) {
  if (!env.ASSESSMENT_ADMIN_KEY) return failure('Assessment admin access is not configured.',503);
  const data = await requestJson(request);
  if (typeof data.key !== 'string' || data.key.length > 256 || !equal(await tokenHash(data.key),await tokenHash(env.ASSESSMENT_ADMIN_KEY))) return failure('Invalid admin key.',401);
  const issued = String(Date.now());
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const cookie = COOKIE+'='+issued+'.'+await signature(issued,env.ASSESSMENT_ADMIN_KEY)+'; HttpOnly; SameSite=Strict; Path=/api/assessment; Max-Age=3600'+secure;
  return apiJson({ok:true},200,{'Set-Cookie':cookie});
}
