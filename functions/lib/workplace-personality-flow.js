// Workplace personality profile (P01) inside the AP/AR attempt model.
// The candidate registers with the same identity and screening details as AP/AR, answers the
// 50 statements and sees a thank-you screen. Factor results go only to the recruiter email and
// the admin report. Item responses never leave the server except to the candidate's own session.
import {personalityForm, PERSONALITY_SLUG, PERSONALITY_FLOW_READY, VERSION} from './hpi-personality.js';
import {decryptPrivate, publicScreening} from './candidate-privacy.js';
import {buildPersonalityResultEmail, sendResultEmail} from './assessment-email.js';
import {finalizeClosedPersonalityDrafts, readPersonalityDraft, NOTICE_VERSION} from './workplace-personality-store.js';

export const PERSONALITY_FORMAT = 'personality-v1';
// Generous window so the questionnaire is effectively untimed; most people need about 10 minutes.
export const PERSONALITY_SECONDS = 3600;
// One start per ID number for this form version (the store also enforces one record per ID).
export const PERSONALITY_MAX_ATTEMPTS = 1;
export const PERSONALITY_ATTEMPT_MESSAGE = 'You have already started the workplace personality profile with this ID number. If you think this is a mistake, email hello@talenttree.co.za.';
export {NOTICE_VERSION as PERSONALITY_NOTICE_VERSION};

export const isPersonalityPayload = payload => payload?.format === PERSONALITY_FORMAT;
export const personalityOpen = env => PERSONALITY_FLOW_READY && env?.ENABLE_HPI_PERSONALITY === 'true';
export const isPersonalitySlug = slug => slug === PERSONALITY_SLUG;

// The browser form: statements and the response scale only. No factor, sign or key.
export function publicPersonalityAssessment() {
  const form = personalityForm();
  return {format: PERSONALITY_FORMAT, version: form.version, instructions: form.instructions,
    items: form.items.map(item => ({id: item.id, prompt: item.prompt, options: item.options.map(o => ({id: o.id, label: o.label}))}))};
}

export async function personalityDraftView(env, attemptId, candidateId) {
  const draft = await readPersonalityDraft(env, attemptId, candidateId);
  return draft ? {status: draft.status, revision: draft.revision, answers: draft.answers || {}} : null;
}

const unpack = async (env, value) => {
  if (typeof value !== 'string' || !value.startsWith('enc:')) throw new Error('Personality content unavailable.');
  return JSON.parse(await decryptPrivate(env, value.slice(4)));
};

export async function personalityReportData(env, db, attemptId) {
  const row = await db.prepare(
    'SELECT w.status AS wpp_status, w.result_encrypted, w.submitted_at, w.notice_version, w.form_version, w.notified_at, w.notify_status, ' +
    'a.id, a.status, a.started_at_ms, a.expires_at_ms, a.closed_at_ms, a.last_saved_at_ms, COALESCE((SELECT h.attempt_number FROM assessment_identity_attempts h WHERE h.candidate_id=c.id),1) AS attempt_number, ' +
    'c.first_name, c.surname, c.email, c.contact_number, c.id_number_masked, c.earliest_start_date, c.first_day_confirmed, c.travel_mode, c.travel_description, c.own_transport, c.assignment_available, c.assignment_note, ' +
    'd.client_name, d.title, v.version_label ' +
    'FROM attempts a JOIN candidates c ON c.id=a.candidate_id JOIN assessment_definitions d ON d.id=a.definition_id JOIN assessment_versions v ON v.id=a.version_id ' +
    'LEFT JOIN workplace_personality_attempts w ON w.attempt_id=a.id WHERE a.id=?'
  ).bind(attemptId).first();
  if (!row) return null;
  let result = null, unreadable = false;
  if (row.wpp_status === 'submitted') { try { result = await unpack(env, row.result_encrypted); } catch { unreadable = true; } }
  const events = await db.prepare('SELECT event_type,actor_type,created_at FROM audit_events WHERE attempt_id=? ORDER BY created_at, rowid LIMIT 300').bind(attemptId).all();
  return {
    ok: true,
    audit_events: events.results || [],
    candidate: {first_name: row.first_name, surname: row.surname, email: row.email},
    screening: publicScreening(row),
    assessment: {client_name: row.client_name, title: row.title, version: row.version_label, format: PERSONALITY_FORMAT, form_version: row.form_version || VERSION, notice_version: row.notice_version || null},
    attempt: {id: row.id, attempt_number: row.attempt_number || 1, status: row.status, started_at_ms: row.started_at_ms, expires_at_ms: row.expires_at_ms, closed_at_ms: row.closed_at_ms, last_saved_at_ms: row.last_saved_at_ms},
    personality: {status: row.wpp_status || 'not_started', submitted_at: row.submitted_at || null, unreadable, notified_at: row.notified_at || null,
      factors: result ? result.factors.map(f => ({name: f.name, mean: f.mean, answered: f.answered, total: f.total})) : null,
      attempted: result ? result.attempted : null, total: 50},
    result: null,
  };
}

const CLAIM_STALE_MS = 10 * 60 * 1000;
const MAX_RETRIES = 5;

// Same once-only claim pattern as the occupational result queue (assessment-email.js): only the request
// whose conditional update changes the row may send.
export async function notifyPendingPersonality(env, db, fetchImpl = fetch, limit = 5) {
  await finalizeClosedPersonalityDrafts(env);
  const now = Date.now();
  const pending = await db.prepare(
    "SELECT w.attempt_id, w.notify_status FROM workplace_personality_attempts w JOIN attempts a ON a.id=w.attempt_id " +
    "WHERE w.status='submitted' AND w.notified_at IS NULL AND w.notify_attempts < ? AND a.status IN ('completed','timed_out') " +
    "AND (w.notify_status NOT LIKE 'sending:%' OR CAST(substr(w.notify_status, 9) AS INTEGER) < ?) ORDER BY w.submitted_at LIMIT ?"
  ).bind(MAX_RETRIES, now - CLAIM_STALE_MS, limit).all();
  for (const row of pending?.results || []) {
    const claimed = await db.prepare('UPDATE workplace_personality_attempts SET notify_status=? WHERE attempt_id=? AND notified_at IS NULL AND notify_status=?')
      .bind('sending:' + now, row.attempt_id, row.notify_status).run();
    if (!claimed?.meta?.changes) continue;
    try {
      const data = await personalityReportData(env, db, row.attempt_id);
      const src = await db.prepare('SELECT w.result_encrypted, c.contact_number, c.id_number_masked, c.earliest_start_date, c.first_day_confirmed, c.travel_mode, c.travel_description, c.own_transport, c.assignment_available, c.assignment_note FROM workplace_personality_attempts w JOIN attempts a ON a.id=w.attempt_id JOIN candidates c ON c.id=a.candidate_id WHERE w.attempt_id=?').bind(row.attempt_id).first();
      const result = await unpack(env, src.result_encrypted);
      const message = buildPersonalityResultEmail({candidate: data.candidate, result, screening: src, attemptNumber: data.attempt.attempt_number,
        submittedAt: data.personality.submitted_at ? data.personality.submitted_at.slice(0, 16).replace('T', ' ') + ' UTC' : '', status: data.attempt.status});
      const sent = await sendResultEmail(env, message, fetchImpl, PERSONALITY_SLUG);
      if (sent.ok) await db.prepare("UPDATE workplace_personality_attempts SET notified_at=?, notify_status='sent' WHERE attempt_id=?").bind(new Date().toISOString(), row.attempt_id).run();
      else if (sent.reason === 'not_configured') await db.prepare("UPDATE workplace_personality_attempts SET notify_status='not_configured' WHERE attempt_id=?").bind(row.attempt_id).run();
      else await db.prepare('UPDATE workplace_personality_attempts SET notify_attempts=notify_attempts+1, notify_status=? WHERE attempt_id=?').bind(sent.reason, row.attempt_id).run();
    } catch {
      await db.prepare("UPDATE workplace_personality_attempts SET notify_attempts=notify_attempts+1, notify_status='pending' WHERE attempt_id=?").bind(row.attempt_id).run();
    }
  }
}
