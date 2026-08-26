import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost } from '../functions/api/cv-parse.js';

function request(body) {
  return new Request('https://talenttree.co.za/api/cv-parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('relay fails closed when server-side parser settings are missing', async () => {
  const response = await onRequestPost({ request: request({ sourceText: 'Candidate' }), env: {} });
  assert.equal(response.status, 503);
});

test('relay rejects an empty CV payload', async () => {
  const response = await onRequestPost({
    request: request({ sourceText: '' }),
    env: {
      CV_PARSE_UPSTREAM: 'https://n8n.example.test/webhook/cv-parse',
      CV_PARSE_TOKEN: 'secret',
    },
  });
  assert.equal(response.status, 400);
});

test('relay forwards only the controlled payload and server-side auth header', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({
      cv: { personal: { fullName: 'Bomikazi Mditshwa' }, experience: [] },
      gaps: [],
      evidence: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await onRequestPost({
      request: request({
        sourceText: 'Bomikazi Mditshwa',
        fileName: 'Bomikazi.pdf',
        mode: 'agency',
        unexpected: 'must not be forwarded',
      }),
      env: {
        CV_PARSE_UPSTREAM: 'https://n8n.example.test/webhook/cv-parse',
        CV_PARSE_TOKEN: 'super-secret-token',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(captured.url, 'https://n8n.example.test/webhook/cv-parse');
    assert.equal(captured.options.headers['X-CV-Parser-Key'], 'super-secret-token');

    const forwarded = JSON.parse(captured.options.body);
    assert.deepEqual(Object.keys(forwarded).sort(), ['fileName', 'mode', 'schemaVersion', 'sourceText']);
    assert.equal(forwarded.unexpected, undefined);
    assert.equal(forwarded.sourceText, 'Bomikazi Mditshwa');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
