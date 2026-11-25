// Isolated persistence primitives for the research pilot. NOT an HTTP handler.
// Callers must establish a candidate identity, consent, rate limits and audit before use.
// Nothing in the current application mounts these functions or collects HPI data.
import {encryptId, decryptPrivate} from './candidate-privacy.js';
import {VERSION, normalizePersonalityAnswers, scorePersonality} from './hpi-personality.js';

const TABLE = 'hpi_research_attempts';
const fields = 'id,module_id,form_version,form_variant,notice_version,status,revision,phase_index,answers_encrypted,result_encrypted,created_at,updated_at,expires_at';
const missing = (error, table) => new RegExp(`no such table: (?:main\\.)?${table}\\b`, 'i').test(String(error?.message));
const date = ms => new Date(ms).toISOString();
const enc = async (env, value) => 'enc:' + await encryptId(env, JSON.stringify(value));
async function dec(env, value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.startsWith('enc:')) throw new Error('Invalid research data envelope.');
  return JSON.parse(await decryptPrivate(env, value.slice(4)));
}
async function serialize(env, row, answers = false) {
  const {answers_encrypted, result_encrypted, ...metadata} = row;
  return {...metadata, result: await dec(env, result_encrypted), ...(answers ? {answers: await dec(env, answers_encrypted)} : {})};
}

// Export deliberately includes expired rows until they are swept. A key rotation or
// missing key must not prevent a candidate obtaining the remaining metadata.
export async function exportHpi(env, candidateId) {
  try {
    const rows = await env.ASSESSMENT_DB.prepare(`SELECT ${fields} FROM ${TABLE} WHERE candidate_id=? ORDER BY created_at`).bind(candidateId).all();
    return await Promise.all((rows.results || []).map(row => serialize(env, row, true).catch(() => {
      const {answers_encrypted, result_encrypted, ...metadata} = row;
      return {...metadata, answers: null, result: null, payload_unavailable: 'encrypted_content_unreadable'};
    })));
  } catch (error) { if (missing(error, TABLE)) return []; throw error; }
}
export async function eraseHpi(env, candidateId) {
  try { await env.ASSESSMENT_DB.prepare(`DELETE FROM ${TABLE} WHERE candidate_id=?`).bind(candidateId).run(); }
  catch (error) { if (!missing(error, TABLE)) throw error; }
}
export async function eraseHpiInvite(env, candidateId) {
  try { await env.ASSESSMENT_DB.prepare('DELETE FROM hpi_research_invites WHERE candidate_id=?').bind(candidateId).run(); }
  catch (error) { if (!missing(error, 'hpi_research_invites')) throw error; }
}
export async function sweepHpi(env, now = Date.now()) {
  try { return (await env.ASSESSMENT_DB.prepare(`DELETE FROM ${TABLE} WHERE expires_at<=?`).bind(date(now)).run()).meta?.changes || 0; }
  catch (error) { if (missing(error, TABLE)) return 0; throw error; }
}

// These functions deliberately do not perform authentication or consent. Never mount
// them directly as routes; the required platform adapter is not yet implemented.
export async function startHpi(env, candidateId, noticeVersion, now = Date.now()) {
  // Refuse to create even an empty draft without a working encryption key.
  await encryptId(env, '{}');
  const db = env.ASSESSMENT_DB, at = date(now);
  await db.prepare(`DELETE FROM ${TABLE} WHERE candidate_id=? AND module_id='P01' AND form_version=? AND expires_at<=?`).bind(candidateId, VERSION, at).run();
  const id = `hpi_${crypto.randomUUID()}`;
  const inserted = await db.prepare(`INSERT INTO ${TABLE} (id,candidate_id,module_id,form_version,notice_version,status,created_at,updated_at,expires_at) VALUES (?,?,'P01',?,?,'draft',?,?,?) ON CONFLICT(candidate_id,module_id,form_version) DO NOTHING`)
    .bind(id, candidateId, VERSION, noticeVersion, at, at, date(now + 90 * 86400000)).run();
  const row = await db.prepare(`SELECT ${fields} FROM ${TABLE} WHERE candidate_id=? AND module_id='P01' AND form_version=? AND expires_at>?`).bind(candidateId, VERSION, at).first();
  if (!row) throw new Error('Research attempt unavailable.');
  return {inserted: inserted.meta?.changes === 1, attempt: await serialize(env, row, true)};
}
export async function saveHpi(env, candidateId, attemptId, revision, input, submit = false, now) {
  if (!Number.isSafeInteger(revision) || revision < 0) return {error: 'invalid'};
  const db = env.ASSESSMENT_DB, at = date(now ?? Date.now());
  const row = await db.prepare(`SELECT ${fields} FROM ${TABLE} WHERE id=? AND candidate_id=? AND expires_at>?`).bind(attemptId, candidateId, at).first();
  if (!row) return {error: 'not_found'};
  if (row.status !== 'draft' || row.revision !== revision || row.form_version !== VERSION) return {error: 'conflict'};
  const answers = normalizePersonalityAnswers(input);
  if (submit && !Object.values(answers).some(v => v !== null)) return {error: 'empty'};
  const result = submit ? scorePersonality(answers) : null;
  const encryptedAnswers = await enc(env, answers);
  const encryptedResult = result ? await enc(env, result) : null;
  const updated = await db.prepare(`UPDATE ${TABLE} SET answers_encrypted=?,result_encrypted=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND candidate_id=? AND status='draft' AND revision=? AND form_version=? AND expires_at>?`)
    .bind(encryptedAnswers, encryptedResult, submit ? 'submitted' : 'draft', date(now ?? Date.now()), attemptId, candidateId, revision, VERSION, date(now ?? Date.now())).run();
  return updated.meta?.changes === 1 ? {revision: revision + 1, result} : {error: 'conflict'};
}
