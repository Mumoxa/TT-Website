const MAX_SOURCE_CHARS = 80_000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== requestUrl.origin) {
    return json({ error: 'Forbidden' }, 403);
  }

  if (!env?.CV_N8N_ENDPOINT || !env?.CV_N8N_TOKEN) {
    return json({ error: 'Semantic parser unavailable' }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (payload?.task !== 'talent-tree-cv-extraction'
      || typeof payload?.sourceText !== 'string'
      || !payload.sourceText.trim()) {
    return json({ error: 'Invalid semantic parse request' }, 400);
  }

  if (payload.sourceText.length > MAX_SOURCE_CHARS) {
    return json({ error: 'CV source is too large' }, 413);
  }

  let upstream;
  try {
    upstream = await fetch(env.CV_N8N_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CV-Builda-Token': env.CV_N8N_TOKEN,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ error: 'Semantic parser unavailable' }, 502);
  }

  if (!upstream.ok) {
    return json(
      { error: upstream.status === 429 ? 'Semantic parser busy' : 'Semantic parser failed' },
      upstream.status === 429 ? 429 : 502,
    );
  }

  let body;
  try {
    body = await upstream.json();
  } catch {
    return json({ error: 'Semantic parser returned invalid JSON' }, 502);
  }

  return json(body);
}
