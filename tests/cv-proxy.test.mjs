import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest } from '../functions/api/cv-parse.js';

const makeRequest = (body, options = {}) => new Request(
  options.url || 'https://talenttree.co.za/api/cv-parse',
  {
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.origin ? { Origin: options.origin } : {}),
    },
    body: options.method === 'GET' ? undefined : JSON.stringify(body),
  },
);

test('the CV proxy fails closed when private parser settings are missing', async () => {
  const response = await onRequest({
    request: makeRequest({ task: 'talent-tree-cv-extraction', sourceText: 'Jane Doe' }),
    env: {},
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Semantic parser unavailable' });
});

test('the CV proxy rejects a cross-origin browser request', async () => {
  const response = await onRequest({
    request: makeRequest(
      { task: 'talent-tree-cv-extraction', sourceText: 'Jane Doe' },
      { origin: 'https://evil.example' },
    ),
    env: {
      CV_N8N_ENDPOINT: 'https://n8n.example.test/webhook/cv-builda-parse',
      CV_N8N_TOKEN: 'secret',
    },
  });
  assert.equal(response.status, 403);
});

test('the CV proxy forwards only the validated request with server-side auth', async () => {
  const realFetch = globalThis.fetch;
  let called;
  globalThis.fetch = async (url, options) => {
    called = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      cv: { personal: { fullName: 'Jane Doe' }, experience: [] },
      gaps: [],
      evidence: [],
      engine: 'test',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await onRequest({
      request: makeRequest({ task: 'talent-tree-cv-extraction', sourceText: 'Jane Doe' }),
      env: {
        CV_N8N_ENDPOINT: 'https://n8n.example.test/webhook/cv-builda-parse',
        CV_N8N_TOKEN: 'secret-token',
      },
    });
    assert.equal(response.status, 200);
    assert.equal(called.url, 'https://n8n.example.test/webhook/cv-builda-parse');
    assert.equal(called.options.headers['X-CV-Builda-Token'], 'secret-token');
    assert.equal(called.body.sourceText, 'Jane Doe');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  } finally {
    globalThis.fetch = realFetch;
  }
});
