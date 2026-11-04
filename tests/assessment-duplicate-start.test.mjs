import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorResponse } from '../functions/api/assessment/[[path]].js';

test('a simultaneous duplicate ID start gets a specific 409 message, not the invitation text', async () => {
  const error = new Error('UNIQUE constraint failed: assessment_identity_attempts.definition_id, assessment_identity_attempts.id_hash, assessment_identity_attempts.attempt_number');
  const response = errorResponse(error);
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(body.message, /ID number was just recorded/);
  assert.doesNotMatch(body.message, /invitation/i);
});

test('other unique-constraint failures keep the existing message', async () => {
  const response = errorResponse(new Error('UNIQUE constraint failed: invitations.token_sha256'));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).message, 'This invitation is already in use.');
});
