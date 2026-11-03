/**
 * Talent Tree candidate AP assessment + private admin API.
 * Cloudflare Pages Function: /api/assessment/*
 *
 * Intentional isolation: ASSESSMENT_DB is a separate D1 binding; existing
 * offer DB / PDF_BUCKET and offer routes are never modified here.
 *
 * IMPORTANT: Answer keys exist only inside PRIVATE D1 assessment_versions.
 * The public GitHub repository must not contain real candidate test keys.
 */
import { verifySession } from '../../lib/admin.js';
import {
  apiJson, failure, requestJson, sameOrigin, normalizeIdentity, newToken, tokenHash,
  isToken, id, nowIso, cookieHeader, getCookie, publicAssessment,
  cleanSubmission, cleanWorkbook, scoreAssessment, validateAssessmentPackage,
} from '../../lib/assessment-core.js';
import { newAttemptTimes } from '../../lib/assessment-core.js';

const HEADER = 'x-tt-assessment-admin';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_KEYS = 'a.id, a.invitation_id, a.candidate_id, a.definition_id, a.version_id, a.status, a.started_at_ms, a.expires_at_ms, a.closed_at_ms, a.save_revision, a.last_saved_at_ms, a.mcq_answers_json, a.structured_answers_json, a.workbook_json';
const safeParse = (str, fallback) => { try { return JSON.parse(str); } catch { return fallback; } };
const resultRows = (result) => result?.results || [];

function route(request) {
  return new URL(request.url).pathname.replace(/^\/api\/assessment\/?/, '').split('/').filter(Boolean);
}

function requireDatabase(env) {
  return env.ASSESSMENT_DB ? null : failure('The assessment service is not configured.', 503);
}

function blockPublicSearchIndex() {
  return { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store, private' };
}

function errorResponse(error) {
  if (String(error?.message || '').includes('UNIQUE constraint failed')) return failure('This invitation is already in use.', 409);
  if (error instanceof SyntaxError || error?.message?.startsWith('Invalid') ||
    error?.message?.startsWith('Please') || error?.message?.startsWith('Assessment') ||
    error?.message?.startsWith('Question') || error?.message?.startsWith('Too many') ||
    error?.message?.startsWith('Cell') || error?.message?.startsWith('Workbook')) return failure(error.message, 400);
  console.error('assessment_api_error', String(error?.name || 'Error')); // do not log raw candidate data
  return failure('The assessment service could not complete this request.', 500);
}

async function candidateAttempt(request, db) {
  const sessionToken = getCookie(request);
  if (!sessionToken) return null;
  const hash = await tokenHash(sessionToken);
  return db.prepare(
    'SELECT ' + PUBLIC_KEYS + ', c.first_name, c.surname, c.email, d.title, d.client_name, d.duration_seconds, v.question_payload_json, v.scoring_key_json, v.scoring_engine_version ' +
    'FROM attempts a JOIN candidates c ON c.id=a.candidate_id ' +
    'JOIN assessment_definitions d ON d.id=a.definition_id ' +
    'JOIN assessment_versions v ON v.id=a.version_id ' +
    'WHERE a.session_token_sha256=?'
  ).bind(hash).first();
}

function attemptView(a) {
  const version = { question_payload_json: a.question_payload_json };
  return {
    attempt_id: a.id, status: a.status,
    first_name: a.first_name, surname: a.surname,
    client_name: a.client_name, title: a.title,
    started_at_ms: a.started_at_ms, expires_at_ms: a.expires_at_ms,
    save_revision: a.save_revision, last_saved_at_ms: a.last_saved_at_ms,
    server_now_ms: Date.now(),
    responses: {
      mcq: safeParse(a.mcq_answers_json, {}),
      structured: safeParse(a.structured_answers_json, {}),
      workbook: safeParse(a.workbook_json, {}),
    },
    assessment: publicAssessment(version),
  };
}

async function gradeAndStore(db, attemptId) {
  const a = await db.prepare(
    'SELECT a.id, a.mcq_answers_json, a.structured_answers_json, v.question_payload_json, v.scoring_key_json, v.scoring_engine_version ' +
    'FROM attempts a JOIN assessment_versions v ON v.id=a.version_id WHERE a.id=?'
  ).bind(attemptId).first();
  if (!a) return;
  const questions = publicAssessment({ question_payload_json: a.question_payload_json });
  const rubric = safeParse(a.scoring_key_json, {});
  const answers = { mcq: safeParse(a.mcq_answers_json, {}), structured: safeParse(a.structured_answers_json, {}) };
  const score = scoreAssessment(questions, rubric, answers);
  await db.prepare(
    'INSERT INTO results (id, attempt_id, scoring_version, overall_score, knowledge_score, reconciliation_score, breakdown_json, critical_flags_json, interpretation, graded_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(attempt_id) DO NOTHING'
  ).bind(id(), attemptId, a.scoring_engine_version, score.overall_score, score.knowledge_score,
    score.reconciliation_score, JSON.stringify(score.breakdown), JSON.stringify(score.critical_flags),
    score.interpretation, nowIso()).run();
}

async function closeAttempt(db, a, now, requestedStatus) {
  if (!a || a.status !== 'active') return a?.status || 'not_found';
  const expired = now >= Number(a.expires_at_ms);
  if (!expired && requestedStatus !== 'completed') return 'active';
  const status = expired ? 'timed_out' : 'completed';
  const clause = status === 'completed' ? 'AND expires_at_ms > ?' : 'AND expires_at_ms <= ?';
  const changed = await db.prepare(
    'UPDATE attempts SET status=?, closed_at_ms=?, updated_at=? WHERE id=? AND status=? ' + clause
  ).bind(status, now, nowIso(), a.id, 'active', now).run();
  if (changed?.meta?.changes) await gradeAndStore(db, a.id);
  const refreshed = await db.prepare('SELECT status FROM attempts WHERE id=?').bind(a.id).first();
  // Best effort to repair a result missing after a previous failure.
  if (refreshed?.status !== 'active') await gradeAndStore(db, a.id);
  return refreshed?.status || status;
}

async function saveProgress(db, a, data) {
  const publicQuestions = publicAssessment({ question_payload_json: a.question_payload_json });
  const submission = cleanSubmission(data, publicQuestions);
  const workbook = cleanWorkbook(data.workbook || {});
  const expectedRevision = Number(data.save_revision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return failure('Missing or invalid save revision.', 400);
  const now = Date.now();
  const changed = await db.prepare(
    'UPDATE attempts SET mcq_answers_json=?, structured_answers_json=?, workbook_json=?, ' +
    'save_revision=save_revision+1, last_saved_at_ms=?, updated_at=? ' +
    'WHERE id=? AND status=? AND expires_at_ms>? AND save_revision=?'
  ).bind(JSON.stringify(submission.mcq), JSON.stringify(submission.structured), JSON.stringify(workbook),
    now, nowIso(), a.id, 'active', now, expectedRevision).run();

  if (!changed?.meta?.changes) {
    const status = await closeAttempt(db, a, Date.now(), null);
    if (status !== 'active') return failure('Your assessment has closed. Your last saved work was retained.', 409);
    return apiJson({ ok: false, conflict: true, message: 'Another save was completed. Reload your saved answers before continuing.' }, 409);
  }
  return apiJson({ ok: true, save_revision: expectedRevision + 1, saved_at_ms: now, server_now_ms: Date.now() });
}

async function startAttempt(request, db) {
  const data = await requestJson(request);
  const identity = normalizeIdentity(data);
  const inviteToken = data.invitation_token;
  if (!isToken(inviteToken)) return failure('An individual invitation link is required.', 400);
  const hash = await tokenHash(inviteToken);
  const invited = await db.prepare(
    'SELECT i.*, d.client_name, d.title, d.status AS assessment_status, d.duration_seconds, d.current_version_id ' +
    'FROM invitations i JOIN assessment_definitions d ON d.id=i.definition_id WHERE i.token_sha256=?'
  ).bind(hash).first();
  if (!invited || invited.status !== 'issued' || Date.parse(invited.expires_at) <= Date.now() ||
      invited.assessment_status !== 'published' || !invited.current_version_id) {
    return failure('This invitation is unavailable or has expired. Contact your recruiter.', 403);
  }
  if (invited.intended_email && invited.intended_email.toLowerCase() !== identity.email) {
    return failure('Please use the email address associated with your invitation.', 403);
  }
  const start = newAttemptTimes(Date.now(), Number(invited.duration_seconds));
  const candidateId = id(), attemptId = id(), sessionToken = newToken(), sessionHash = await tokenHash(sessionToken);
  const at = nowIso();
  // D1 batch runs as a transaction. A simultaneous second start hits the
  // UNIQUE invitation_id constraint and rolls back rather than creating two attempts.
  await db.batch([
    db.prepare('UPDATE invitations SET status=?, redeemed_at=? WHERE id=? AND status=?')
      .bind('redeemed', at, invited.id, 'issued'),
    db.prepare('INSERT INTO candidates (id, first_name, surname, email, privacy_notice_version, consent_recorded_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(candidateId, identity.first_name, identity.surname, identity.email, 'assessment-v1', at, at),
    db.prepare('INSERT INTO attempts (id, invitation_id, candidate_id, definition_id, version_id, session_token_sha256, status, started_at_ms, expires_at_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(attemptId, invited.id, candidateId, invited.definition_id, invited.current_version_id,
        sessionHash, 'active', start.started_at_ms, start.expires_at_ms, at, at),
  ]);
  const a = await db.prepare(
    'SELECT ' + PUBLIC_KEYS + ', c.first_name, c.surname, c.email, d.title, d.client_name, d.duration_seconds, v.question_payload_json, v.scoring_key_json, v.scoring_engine_version ' +
    'FROM attempts a JOIN candidates c ON c.id=a.candidate_id JOIN assessment_definitions d ON d.id=a.definition_id ' +
    'JOIN assessment_versions v ON v.id=a.version_id WHERE a.id=?'
  ).bind(attemptId).first();
  return apiJson({ ok: true, ...attemptView(a) }, 200, { 'Set-Cookie': cookieHeader(request, sessionToken) });
}

async function inviteMeta(request, db) {
  const token = new URL(request.url).searchParams.get('token');
  if (!isToken(token)) return failure('A valid invitation is required.', 400);
  const i = await db.prepare(
    'SELECT i.status, i.expires_at, d.title, d.client_name, d.duration_seconds ' +
    'FROM invitations i JOIN assessment_definitions d ON d.id=i.definition_id WHERE i.token_sha256=?'
  ).bind(await tokenHash(token)).first();
  if (!i || i.status !== 'issued' || Date.parse(i.expires_at) <= Date.now()) return failure('Invitation unavailable.', 404);
  return apiJson({ ok: true, title: i.title, client_name: i.client_name, duration_seconds: i.duration_seconds });
}

async function requireAdmin(request, env) {
  const verification = await verifySession(request, env);
  if (!verification.ok) return failure('Admin sign-in required.', 401);
  return null;
}

async function adminPublish(request, db) {
  const data = await requestJson(request);
  const pkg = validateAssessmentPackage(data);
  const slug = typeof data.slug === 'string' ? data.slug.trim() : '';
  const name = typeof data.client_name === 'string' ? data.client_name.trim() : '';
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!/^[a-z0-9-]{3,60}$/.test(slug) || name.length < 2 || name.length > 120 || title.length < 8 || title.length > 160) {
    return failure('Invalid client, slug or assessment title.', 400);
  }
  const old = await db.prepare('SELECT id, status FROM assessment_definitions WHERE slug=?').bind(slug).first();
  const definitionId = old?.id || id();
  const versionId = id();
  const at = nowIso();
  const previous = old ? await db.prepare('SELECT count(*) AS n FROM assessment_versions WHERE definition_id=?').bind(definitionId).first() : null;
  const versionLabel = 'v' + (Number(previous?.n || 0) + 1);
  const duration = 600; // V1 hard requirement
  const operations = [];
  if (!old) {
    operations.push(db.prepare(
      'INSERT INTO assessment_definitions (id, slug, client_name, title, duration_seconds, current_version_id, status, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)'
    ).bind(definitionId, slug, name, title, duration, 'draft', at, at));
  }
  operations.push(db.prepare(
    'INSERT INTO assessment_versions (id, definition_id, version_label, question_payload_json, scoring_key_json, scoring_engine_version, published_at, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(versionId, definitionId, versionLabel, JSON.stringify(pkg.question_payload),
    JSON.stringify(pkg.scoring_key), 'ap-deterministic-v1', at, at));
  operations.push(db.prepare(
    'UPDATE assessment_definitions SET current_version_id=?, client_name=?, title=?, duration_seconds=?, status=?, updated_at=? WHERE id=?'
  ).bind(versionId, name, title, duration, 'published', at, definitionId));
  await db.batch(operations);
  return apiJson({ ok: true, assessment_id: definitionId, version_id: versionId, version_label: versionLabel });
}

async function adminInvite(request, db) {
  const data = await requestJson(request);
  const assessmentId = typeof data.assessment_id === 'string' ? data.assessment_id : '';
  const email = typeof data.intended_email === 'string' ? data.intended_email.trim().toLowerCase() : '';
  const validDays = Number(data.valid_days || 7);
  if (email && (!EMAIL.test(email) || email.length > 254)) return failure('Invalid candidate email.', 400);
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 30) return failure('Invitation duration must be 1 to 30 days.', 400);
  const assessment = await db.prepare('SELECT id FROM assessment_definitions WHERE id=? AND status=? AND current_version_id IS NOT NULL')
    .bind(assessmentId, 'published').first();
  if (!assessment) return failure('This assessment is not published.', 404);
  const token = newToken();
  const at = nowIso();
  const expires = new Date(Date.now() + validDays * 86400000).toISOString();
  await db.prepare(
    'INSERT INTO invitations (id, definition_id, token_sha256, intended_email, status, issued_at, expires_at, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id(), assessmentId, await tokenHash(token), email || null, 'issued', at, expires, at).run();
  const origin = new URL(request.url).origin;
  return apiJson({ ok: true, invitation_url: origin + '/assessment?invite=' + token, expires_at: expires });
}

async function adminList(db) {
  // Lazy-finalise expired attempts, including abandoned browser tabs.
  const overdue = await db.prepare('SELECT id, status, expires_at_ms FROM attempts WHERE status=? AND expires_at_ms<=? LIMIT 50')
    .bind('active', Date.now()).all();
  for (const a of resultRows(overdue)) await closeAttempt(db, a, Date.now(), null);
  const [defs, attempts] = await db.batch([
    db.prepare('SELECT id, slug, client_name, title, status, duration_seconds, updated_at FROM assessment_definitions ORDER BY updated_at DESC LIMIT 100'),
    db.prepare(
      'SELECT a.id, a.status, a.started_at_ms, a.expires_at_ms, a.closed_at_ms, c.first_name, c.surname, c.email, ' +
      'd.client_name, d.title, r.overall_score, r.knowledge_score, r.reconciliation_score, r.critical_flags_json ' +
      'FROM attempts a JOIN candidates c ON c.id=a.candidate_id JOIN assessment_definitions d ON d.id=a.definition_id ' +
      'LEFT JOIN results r ON r.attempt_id=a.id ORDER BY a.started_at_ms DESC LIMIT 100'
    ),
  ]);
  return apiJson({ ok: true, definitions: resultRows(defs), attempts: resultRows(attempts).map((a) => ({
    ...a, critical_flags: safeParse(a.critical_flags_json, []), critical_flags_json: undefined,
  })) });
}

async function adminReport(db, attemptId) {
  if (!/^[a-f0-9-]{36}$/i.test(attemptId)) return failure('Invalid attempt ID.', 400);
  const a = await db.prepare(
    'SELECT a.id, a.status, a.started_at_ms, a.expires_at_ms, a.closed_at_ms, a.last_saved_at_ms, ' +
    'a.mcq_answers_json, a.structured_answers_json, a.workbook_json, c.first_name, c.surname, c.email, ' +
    'd.client_name, d.title, v.version_label, v.question_payload_json, v.scoring_key_json, ' +
    'r.overall_score, r.knowledge_score, r.reconciliation_score, r.breakdown_json, r.critical_flags_json, r.interpretation, r.graded_at ' +
    'FROM attempts a JOIN candidates c ON c.id=a.candidate_id ' +
    'JOIN assessment_definitions d ON d.id=a.definition_id JOIN assessment_versions v ON v.id=a.version_id ' +
    'LEFT JOIN results r ON r.attempt_id=a.id WHERE a.id=?'
  ).bind(attemptId).first();
  if (!a) return failure('Assessment result not found.', 404);
  if (a.status === 'active' && Date.now() >= Number(a.expires_at_ms)) {
    await closeAttempt(db, a, Date.now(), null);
    return adminReport(db, attemptId);
  }
  return apiJson({
    ok: true,
    candidate: { first_name: a.first_name, surname: a.surname, email: a.email },
    assessment: { client_name: a.client_name, title: a.title, version: a.version_label, scenario: safeParse(a.question_payload_json, {}).scenario },
    attempt: { id: a.id, status: a.status, started_at_ms: a.started_at_ms, expires_at_ms: a.expires_at_ms, closed_at_ms: a.closed_at_ms, last_saved_at_ms: a.last_saved_at_ms },
    responses: { mcq: safeParse(a.mcq_answers_json, {}), structured: safeParse(a.structured_answers_json, {}), workbook: safeParse(a.workbook_json, {}) },
    question_review: safeParse(a.question_payload_json, {}).questions?.map((q) => {
      const chosenId = safeParse(a.mcq_answers_json, {})[q.id] || null;
      const expectedId = safeParse(a.scoring_key_json, {}).mcq?.[q.id] || null;
      return {
        prompt: q.prompt,
        chosen: q.options.find((o) => o.id === chosenId)?.text || 'Not answered',
        expected: q.options.find((o) => o.id === expectedId)?.text || 'Not available',
        correct: chosenId !== null && chosenId === expectedId,
      };
    }) || [],
    result: a.overall_score === null ? null : {
      overall_score: a.overall_score, knowledge_score: a.knowledge_score, reconciliation_score: a.reconciliation_score,
      breakdown: safeParse(a.breakdown_json, {}), critical_flags: safeParse(a.critical_flags_json, []),
      interpretation: a.interpretation, graded_at: a.graded_at,
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const dbError = requireDatabase(env);
  if (dbError) return dbError;
  const segments = route(request);
  const operation = segments.join('/');
  const write = request.method === 'POST';
  if (write && !sameOrigin(request)) return failure('Cross-site request blocked.', 403);
  try {
    const db = env.ASSESSMENT_DB;

    if (operation === 'invite' && request.method === 'GET') return inviteMeta(request, db);
    if (operation === 'start' && write) return startAttempt(request, db);

    if (segments[0] === 'admin') {
      const deny = await requireAdmin(request, env);
      if (deny) return deny;
      if (write && request.headers.get(HEADER) !== '1') return failure('Invalid admin request.', 403);
      if (operation === 'admin/list' && request.method === 'GET') return adminList(db);
      if (operation === 'admin/publish' && write) return adminPublish(request, db);
      if (operation === 'admin/invite' && write) return adminInvite(request, db);
      if (segments[1] === 'report' && segments[2] && request.method === 'GET') return adminReport(db, segments[2]);
      return failure('Admin endpoint not found.', 404);
    }

    if (!['me', 'save', 'submit'].includes(operation)) return failure('Endpoint not found.', 404);
    const attempt = await candidateAttempt(request, db);
    if (!attempt) return failure('Session not found. Contact your recruiter.', 401);

    const status = await closeAttempt(db, attempt, Date.now(), null);
    if (operation === 'me' && request.method === 'GET') {
      return apiJson({ ok: true, ...attemptView({ ...attempt, status }) });
    }
    if (!write) return failure('Method not allowed.', 405);
    if (status !== 'active') return failure('Your assessment has closed. Your saved answers have been retained.', 409);

    const data = await requestJson(request);
    const saved = await saveProgress(db, attempt, data);
    if (operation === 'save') return saved;
    if (saved.status !== 200) return saved;
    const finalStatus = await closeAttempt(db, attempt, Date.now(), 'completed');
    return apiJson({ ok: true, status: finalStatus, server_now_ms: Date.now() });
  } catch (error) {
    return errorResponse(error);
  }
}
