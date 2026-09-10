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
  SLUG_RE,
  UNAVAILABLE_MESSAGE,
  WELL_KNOWN_OFFERS,
  newSecureToken,
  offerState,
  unavailable,
  getOfferByToken,
} from '../functions/lib/core.js';

test('terms version is the agreed 2026-09-08-v1 constant', () => {
  assert.equal(TERMS_VERSION, '2026-09-08-v1');
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

test('short slug regex allows alphanumerics, dash and underscore (1–64 chars)', () => {
  assert.ok(SLUG_RE.test('1'));
  assert.ok(SLUG_RE.test('demo'));
  assert.ok(SLUG_RE.test('preview-1'));
  assert.ok(SLUG_RE.test('preview_1'));
  assert.ok(!SLUG_RE.test(''));
  assert.ok(!SLUG_RE.test('a'.repeat(65)));
  assert.ok(!SLUG_RE.test('../etc'));
  assert.ok(!SLUG_RE.test('hello world'));
});

test('well-known offer "1" exists, is active, and is flagged as a demo', () => {
  const one = WELL_KNOWN_OFFERS['1'];
  assert.ok(one, 'well-known offer 1 must exist so /offer/1 is live');
  assert.equal(one.secure_token, '1');
  assert.equal(one.status, 'active');
  assert.equal(one.is_demo, true);
  assert.ok(one.candidate_name && one.position_title && one.client_name);
  // never expires so the public preview stays live
  assert.equal(one.expires_at, null);
});

test('getOfferByToken returns the well-known offer synchronously (no DB needed)', async () => {
  const fakeEnv = { DB: { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('DB must not be hit for well-known slug'); } }) }) } };
  const offer = await getOfferByToken(fakeEnv, '1');
  assert.ok(offer);
  assert.equal(offer.secure_token, '1');
  assert.equal(offer.is_demo, true);
});

test('getOfferByToken rejects unknown short slugs without hitting the DB', async () => {
  let hit = false;
  const fakeEnv = { DB: { prepare: () => ({ bind: () => ({ first: async () => { hit = true; return null; } }) }) } };
  const offer = await getOfferByToken(fakeEnv, '999');
  assert.equal(offer, null);
  assert.equal(hit, false, 'unknown short slugs must not reach the DB (prevents enumeration)');
});
