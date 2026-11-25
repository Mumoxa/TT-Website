/* Internal D1 persistence primitives for the unfinished HR pilot.
 * Not a route or an authorisation boundary: the caller MUST authenticate and
 * scope the attempt, use only reviewed immutable versions, and never expose
 * stored answers to other candidates. No production endpoint calls this file.
 * A single row holds the clock and last accepted snapshot so a revision CAS
 * prevents a late or concurrent save from changing an already-closed step.
 */
import { startHrClock, settleHrClock, advanceHrClock } from './hr-generalist-clock.js';
import { HR_FORMAT, publicHrGeneralist, cleanHrSubmission } from './hr-generalist.js';

const DB_NOW = "(strftime('%s','now')*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
const MAX_SNAPSHOT_BYTES = 48_000;
const ACTIVE_PARENT = " AND EXISTS (SELECT 1 FROM attempts a WHERE a.id=hr_pilot_attempt_state.attempt_id AND a.status='active' AND a.version_id=hr_pilot_attempt_state.version_id)";
export class HrStateError extends Error {}
const fail = message => { throw new HrStateError(message); };
const changes = result => Number(result?.meta?.changes || 0);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

async function rowFor(db, attemptId) {
  return db.prepare('SELECT h.*, a.status AS parent_status, a.version_id AS parent_version_id, v.question_payload_json, ' + DB_NOW + ' AS now_ms FROM hr_pilot_attempt_state h JOIN attempts a ON a.id=h.attempt_id JOIN assessment_versions v ON v.id=h.version_id WHERE h.attempt_id=?')
    .bind(attemptId).first();
}
function parseRow(row) {
  if (!row) fail('HR attempt not found.');
  let clock, responses, workbook, payload;
  try {
    clock = JSON.parse(row.clock_json); responses = JSON.parse(row.responses_json);
    workbook = JSON.parse(row.workbook_json); payload = JSON.parse(row.question_payload_json);
  } catch { fail('Stored HR attempt is invalid.'); }
  if (payload?.format !== HR_FORMAT || row.version_id !== row.parent_version_id || row.status !== clock.status || row.step_id !== (clock.step?.id ?? null) || row.step_deadline_ms !== (clock.step?.deadline_at_ms ?? null)) fail('Stored HR attempt is inconsistent.');
  if (row.status === 'active' && row.parent_status !== 'active') fail('HR attempt is not active.');
  return { clock, responses, workbook, payload, revision: Number(row.revision), last_saved_at_ms: row.last_saved_at_ms, now: Number(row.now_ms) };
}
function view(state) {
  return {clock:state.clock, responses:state.responses, workbook:state.workbook, revision:state.revision, last_saved_at_ms:state.last_saved_at_ms, server_now_ms:state.now};
}
function cleanWorkbook(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid HR workbook.');
  const result = {};
  for (const [ref, raw] of Object.entries(value)) {
    if (!['E2','E3','E4','E5'].includes(ref) || (typeof raw !== 'string' && typeof raw !== 'number') || String(raw).length > 200) fail('Invalid HR workbook cell.');
    result[ref] = String(raw);
  }
  return result;
}

// Caller creates and authorises the parent attempt through a future gated flow.
// Never create a state for an unrelated engine, version or nonstandard timer.
export async function initialiseHrState(db, attemptId) {
  const row = await db.prepare("SELECT a.id, a.version_id, a.started_at_ms, a.expires_at_ms, a.status, v.question_payload_json FROM attempts a JOIN assessment_versions v ON v.id=a.version_id WHERE a.id=?")
    .bind(attemptId).first();
  if (!row || row.status !== 'active' || Number(row.expires_at_ms) - Number(row.started_at_ms) !== 1_200_000) fail('HR attempt cannot be initialised.');
  let payload;
  try { payload = JSON.parse(row.question_payload_json); } catch { fail('Invalid HR version.'); }
  if (payload?.format !== HR_FORMAT) fail('Invalid HR version.');
  const clock = startHrClock(Number(row.started_at_ms));
  await db.prepare("INSERT INTO hr_pilot_attempt_state (attempt_id,version_id,status,step_id,step_deadline_ms,clock_json) SELECT a.id,a.version_id,'active',?,?,? FROM attempts a WHERE a.id=? AND a.version_id=? AND a.status='active' AND a.started_at_ms=? AND a.expires_at_ms=? ON CONFLICT(attempt_id) DO NOTHING")
    .bind(clock.step.id,clock.step.deadline_at_ms,JSON.stringify(clock),attemptId,row.version_id,row.started_at_ms,row.expires_at_ms).run();
  return readHrState(db, attemptId);
}

// Expiry advances from the old deadlines, not from reconnect time. Retry CAS
// conflicts because another request may have saved or advanced in the interim.
export async function readHrState(db, attemptId) {
  for (let i=0; i<8; i++) {
    const row = await rowFor(db, attemptId), state = parseRow(row);
    const settled = settleHrClock(state.clock, state.now);
    if (same(settled,state.clock)) return view(state);
    const result = await db.prepare('UPDATE hr_pilot_attempt_state SET clock_json=?,status=?,step_id=?,step_deadline_ms=?,revision=revision+1 WHERE attempt_id=? AND revision=? AND status=\'active\' AND step_deadline_ms <= ' + DB_NOW + ACTIVE_PARENT)
      .bind(JSON.stringify(settled),settled.status,settled.step?.id ?? null,settled.step?.deadline_at_ms ?? null,attemptId,state.revision).run();
    if (!changes(result)) continue;
  }
  fail('HR state is busy; retry.');
}

// This is a bounded sweep primitive, not a scheduler. A future deployment must
// invoke it durably and authorise the invoking job; it is never browser-driven.
export async function sweepDueHrStates(db, limit = 50) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('Invalid sweep limit.');
  const due = await db.prepare('SELECT h.attempt_id FROM hr_pilot_attempt_state h JOIN attempts a ON a.id=h.attempt_id AND a.version_id=h.version_id WHERE h.status=\'active\' AND a.status=\'active\' AND h.step_deadline_ms <= ' + DB_NOW + ' ORDER BY h.step_deadline_ms LIMIT ?').bind(limit).all();
  for (const row of due.results || []) await readHrState(db, row.attempt_id);
  return (due.results || []).length;
}

// Only a complete snapshot for the current module is accepted. Older modules
// and future modules cannot be rewritten, even by a malformed client.
export async function saveHrStep(db, attemptId, expectedRevision, stepId, answers, workbook = {}) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('Invalid revision.');
  const row = await rowFor(db, attemptId), state = parseRow(row);
  if (state.revision !== expectedRevision || state.clock.status !== 'active' || state.clock.step.id !== stepId || state.now >= state.clock.step.deadline_at_ms) return {ok:false, conflict:true, state:await readHrState(db,attemptId)};
  if (!['HR01','HR02','HR03','HR04','HR05'].includes(stepId)) fail('This step does not accept answers.');
  const cleaned = cleanHrSubmission({structured:{hr:{[stepId]:answers}}}, publicHrGeneralist(state.payload));
  const nextResponses = {...state.responses, [stepId]:cleaned[stepId]};
  if (stepId !== 'HR05' && Object.keys(workbook ?? {}).length) fail('Workbook belongs to another step.');
  const nextWorkbook = stepId === 'HR05' ? cleanWorkbook(workbook) : state.workbook;
  const responseJson = JSON.stringify(nextResponses), workbookJson = JSON.stringify(nextWorkbook);
  if (responseJson.length + workbookJson.length > MAX_SNAPSHOT_BYTES) fail('HR response is too large.');
  const result = await db.prepare('UPDATE hr_pilot_attempt_state SET responses_json=?,workbook_json=?,last_saved_at_ms=' + DB_NOW + ',revision=revision+1 WHERE attempt_id=? AND revision=? AND status=\'active\' AND step_id=? AND step_deadline_ms > ' + DB_NOW + ACTIVE_PARENT)
    .bind(responseJson,workbookJson,attemptId,expectedRevision,stepId).run();
  if (!changes(result)) return {ok:false, conflict:true, state:await readHrState(db,attemptId)};
  return {ok:true, state:await readHrState(db,attemptId)};
}

// Advance only after the client has saved and acknowledged the latest revision.
export async function advanceHrStep(db, attemptId, expectedRevision, stepId) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('Invalid revision.');
  const row = await rowFor(db,attemptId), state = parseRow(row);
  if (state.revision !== expectedRevision || state.clock.status !== 'active' || state.clock.step.id !== stepId || state.now >= state.clock.step.deadline_at_ms) return {ok:false, conflict:true, state:await readHrState(db,attemptId)};
  const next = advanceHrClock(state.clock,state.now,stepId);
  const result = await db.prepare('UPDATE hr_pilot_attempt_state SET clock_json=?,status=?,step_id=?,step_deadline_ms=?,revision=revision+1 WHERE attempt_id=? AND revision=? AND status=\'active\' AND step_id=? AND step_deadline_ms > ' + DB_NOW + ACTIVE_PARENT)
    .bind(JSON.stringify(next),next.status,next.step?.id ?? null,next.step?.deadline_at_ms ?? null,attemptId,expectedRevision,stepId).run();
  if (!changes(result)) return {ok:false, conflict:true, state:await readHrState(db,attemptId)};
  return {ok:true, state:await readHrState(db,attemptId)};
}
