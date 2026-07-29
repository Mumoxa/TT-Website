export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}
export const safeError = (status, code, headers = {}) => jsonResponse({ error: { code, message: 'Suggestion service unavailable.' } }, status, headers);
