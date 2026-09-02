const MAX_SOURCE_CHARS = 60_000;
const UPSTREAM_TIMEOUT_MS = 110_000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.CV_PARSE_UPSTREAM || !env.CV_PARSE_TOKEN) {
    return json({ error: 'CV parser service is not configured.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const sourceText = typeof body?.sourceText === 'string' ? body.sourceText.trim() : '';
  if (!sourceText) return json({ error: 'sourceText is required.' }, 400);
  if (sourceText.length > MAX_SOURCE_CHARS) {
    return json({ error: `sourceText exceeds ${MAX_SOURCE_CHARS} characters.` }, 413);
  }

  const payload = {
    schemaVersion: 1,
    sourceText,
    fileName: clean(body?.fileName, 300),
    mode: body?.mode === 'direct' ? 'direct' : 'agency',
  };

  let upstream;
  try {
    upstream = new URL(env.CV_PARSE_UPSTREAM);
  } catch {
    return json({ error: 'CV parser upstream is misconfigured.' }, 503);
  }
  if (upstream.protocol !== 'https:') {
    return json({ error: 'CV parser upstream must use HTTPS.' }, 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(upstream.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CV-Parser-Key': env.CV_PARSE_TOKEN,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error?.name === 'AbortError') {
      return json({ error: 'CV parser service timed out.' }, 504);
    }
    return json({ error: 'CV parser service is unavailable.' }, 502);
  }
  clearTimeout(timer);

  const raw = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: 'CV parser returned invalid JSON.' }, 502);
  }

  if (!response.ok) {
    return json({ error: 'CV parser service rejected the request.' }, response.status >= 400 && response.status < 600 ? response.status : 502);
  }

  return json(parsed, 200);
}

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}
