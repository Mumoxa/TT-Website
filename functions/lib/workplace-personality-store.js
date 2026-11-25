// Unmounted P01 persistence layer for the AP/AR attempt model. Not an HTTP API.
// Callers must check the feature gate, session ownership and the approved notice.
// Do not wire this to an endpoint until start, email, consent and the UI are integrated.
import {encryptId, decryptPrivate, identityHash} from './candidate-privacy.js';
import {VERSION, normalizePersonalityAnswers, scorePersonality} from './hpi-personality.js';

export const NOTICE_VERSION = 'wpp-recruiter-notice-draft-1';
const iso = () => new Date().toISOString();
const pack = async (env, value) => 'enc:' + await encryptId(env, JSON.stringify(value));
async function unpack(env, value) {
  if (typeof value !== 'string' || !value.startsWith('enc:')) throw new Error('Personality content unavailable.');
  return JSON.parse(await decryptPrivate(env, value.slice(4)));
}

// Hash scope includes both the AP/AR definition and form version. The caller must
// validate the ID with validateIdNumber before calling this helper.
export const personalityIdentityHash = (env, definitionId, idNumber) => identityHash(env, `${definitionId}:${VERSION}`, idNumber);

export async function createPersonalityAttempt(env, {attemptId, candidateId, identityHash: hash, noticeVersion}) {
  if (noticeVersion !== NOTICE_VERSION || !/^[a-f0-9]{64}$/.test(hash || '')) return {error:'invalid'};
  // Reject missing encryption configuration before creating a draft.
  await pack(env, {});
  const db = env.ASSESSMENT_DB, at = iso(), auditId = crypto.randomUUID(), mutation = crypto.randomUUID();
  const [inserted] = await db.batch([
    db.prepare("INSERT INTO workplace_personality_attempts (attempt_id,candidate_id,identity_hash,form_version,notice_version,created_at,updated_at,mutation_id) SELECT a.id,a.candidate_id,?,?,?,?,?,? FROM attempts a WHERE a.id=? AND a.candidate_id=? AND a.status='active' ON CONFLICT DO NOTHING")
      .bind(hash, VERSION, noticeVersion, at, at, mutation, attemptId, candidateId),
    db.prepare("INSERT INTO audit_events (id,actor_type,actor_id,attempt_id,event_type,safe_metadata_json,created_at) SELECT ?,'candidate',candidate_id,attempt_id,'wpp.started',?,? FROM workplace_personality_attempts WHERE attempt_id=? AND mutation_id=?")
      .bind(auditId, JSON.stringify({form_version:VERSION,notice_version:noticeVersion}), at, attemptId, mutation),
  ]);
  return inserted.meta?.changes === 1 ? {ok:true,revision:0} : {error:'unavailable'};
}

// Server validates the session and passes its bound candidate and attempt IDs. This
// layer never returns a result to the candidate; scores are only read by the recruiter
// notification path once that path has been implemented and authorised.
export async function writePersonalityAttempt(env, {attemptId, candidateId, revision, answers: input, submit = false}) {
  if (!Number.isSafeInteger(revision) || revision < 0) return {error:'invalid'};
  const db=env.ASSESSMENT_DB;
  const row=await db.prepare('SELECT status,revision,form_version FROM workplace_personality_attempts WHERE attempt_id=? AND candidate_id=?').bind(attemptId,candidateId).first();
  if (!row) return {error:'unavailable'};
  if (row.status !== 'draft' || row.revision !== revision || row.form_version !== VERSION) return {error:'conflict'};
  let answers;
  try { answers=normalizePersonalityAnswers(input); } catch { return {error:'invalid'}; }
  if (submit && !Object.values(answers).some(value => value !== null)) return {error:'empty'};
  const encryptedAnswers=await pack(env, answers);
  const encryptedResult=submit ? await pack(env, scorePersonality(answers)) : null;
  const at=iso(), mutation=crypto.randomUUID(), event=submit?'wpp.submitted':'wpp.saved';
  const [updated]=await db.batch([
    db.prepare("UPDATE workplace_personality_attempts SET answers_encrypted=?,result_encrypted=?,status=?,revision=revision+1,mutation_id=?,updated_at=?,submitted_at=? WHERE attempt_id=? AND candidate_id=? AND status='draft' AND revision=? AND form_version=? AND EXISTS (SELECT 1 FROM attempts a WHERE a.id=workplace_personality_attempts.attempt_id AND a.candidate_id=workplace_personality_attempts.candidate_id AND a.status='active')")
      .bind(encryptedAnswers,encryptedResult,submit?'submitted':'draft',mutation,at,submit?at:null,attemptId,candidateId,revision,VERSION),
    db.prepare("INSERT INTO audit_events (id,actor_type,actor_id,attempt_id,event_type,safe_metadata_json,created_at) SELECT ?,'candidate',candidate_id,attempt_id,?,?,? FROM workplace_personality_attempts WHERE attempt_id=? AND mutation_id=?")
      .bind(crypto.randomUUID(),event,JSON.stringify({form_version:VERSION}),at,attemptId,mutation),
  ]);
  return updated.meta?.changes === 1 ? {ok:true,revision:revision+1,status:submit?'submitted':'draft'} : {error:'conflict'};
}

// This function must only be used by the server-side recruiter notification path.
export async function readPersonalityResultForNotification(env, attemptId) {
  const row=await env.ASSESSMENT_DB.prepare("SELECT result_encrypted FROM workplace_personality_attempts WHERE attempt_id=? AND status='submitted'").bind(attemptId).first();
  return row ? unpack(env,row.result_encrypted) : null;
}
