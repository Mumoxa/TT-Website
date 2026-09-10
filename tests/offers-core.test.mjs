/* Confidential offer delivery — pure core logic (no D1/R2 needed).
   These checks protect the security-critical pieces that can be tested
   without spinning up a Cloudflare Pages environment:
   - token format and entropy
   - offer state (expiry / status) decision
   - the availability payload shape sent to candidates (no row data leaks)
   - the confidentiality terms version used for acceptances */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TERMS_VERSION,
  TOKEN_RE,
  UNAVAILABLE_MESSAGE,
  newSecureToken,
  offerState,
  unavailable,
} from '../functions/lib/core.js';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const offerSource = await readFile(new URL('../src/offers/OfferApp.jsx', import.meta.url), 'utf8');

test('terms version is the agreed 2026-09-08-v1 constant', () => {
  assert.equal(TERMS_VERSION, '2026-09-08-v1');
});

test('/offer/1 renders the offer preview without changing secure-token routes', () => {
  assert.match(appSource, /path === '\/offer\/1'[\s\S]*?<OfferApp token="1" preview/);
  assert.match(appSource, /path\.startsWith\('\/offer\/'\)[\s\S]*?<OfferApp token=\{token\}/);
  assert.match(offerSource, /if \(preview\) return;/);
});

test('secure tokens are 64 lowercase hex chars (256 bits) and unique', () => {
  const seen = new Set();
  for (let i = 0; i < 250; i += 1) {
    const token = newSecureToken();
    assert.match(token, TOKEN_RE);
    assert.equal(token.length, 64);
    seen.add(token);
  }
  assert.equal(seen.size, 250);
});

test('non-hex or wrong-length tokens never match', () => {
  assert.ok(!TOKEN_RE.test(''));
  assert.ok(!TOKEN_RE.test('zz'.repeat(32)));
  assert.ok(!TOKEN_RE.test('a'.repeat(63)));
});

test('offerState handles active, expired and closed offers', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.deepEqual(offerState({ status: 'active', expires_at: future }), { ok: true });
  assert.deepEqual(offerState({ status: 'active', expires_at: past }), { reason: 'expired' });
  assert.deepEqual(offerState({ status: 'closed', expires_at: future }), { reason: 'unavailable' });
  assert.deepEqual(offerState(null), { reason: 'not_found' });
});

test('unavailable payload only ever contains the friendly message and a short label', async () => {
  const res = unavailable({ candidate_name: 'secret', pdf_key: 'offers/x.pdf' });
  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.message, UNAVAILABLE_MESSAGE);
  assert.equal(payload.reason, 'unavailable'); // row data never echoed
  assert.equal(payload.candidate_name, undefined);
  assert.equal(payload.pdf_key, undefined);
});
