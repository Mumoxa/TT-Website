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
import {normalizeScreening, ScreeningValidationError} from '../../../src/assessments/screening.js';
import {identityHash,encryptId,maskId,publicScreening,PrivacyConfigurationError} from '../../lib/candidate-privacy.js';
import {assertPracticeIsolation} from '../../lib/practice-isolation.js';
import {candidateResult} from '../../lib/candidate-results.js';
import { assessmentCatalog } from '../../lib/assessment-catalog.js';
import { assessmentAdmin, assessmentLogin } from '../../lib/assessment-admin.js';
import {
  AssessmentInputError, apiJson, assessmentContentNeedsBrandReview, failure, requestJson, sameOrigin, normalizeIdentity, newToken, tokenHash,
  isToken, id, nowIso, cookieHeader, getCookie, publicAssessment,
  cleanSubmission, cleanWorkbook, scoreAssessment, validateAssessmentPackage,
} from '../../lib/assessment-core.js';
import { calculateCell } from '../../../src/assessments/formulas.js';
import { scenarioWorkingCells } from '../../../src/assessments/workbook.js';
import { newAttemptTimes } from '../../lib/assessment-core.js';
import { notifyPendingResults } from '../../lib/assessment-email.js';
import { BATTERY_FORMAT, BatteryError, batteryWorkbookRules, cleanBatteryWorkbook, gradeBattery, isBatteryPayload } from '../../lib/battery.js';

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

async function audit(db, actorType, actorId, attemptId, eventType) {
  // Deliberately no raw invitation token, PII or workbook data in audit metadata.
  try {
    await db.prepare('INSERT INTO audit_events (id, actor_type, actor_id, attempt_id, event_type, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id(), actorType, actorId || null, attemptId || null, eventType, nowIso()).run();
  } catch { /* audit failures should not destroy a completed assessment */ }
}

// Retry throttling for the start route is switched off while the assessment is being tested,
// so a candidate can retry the same ID repeatedly. Set to true to restore the per-source limit
// of 30 starts per minute. Invitation probing and admin sign-in stay limited either way.
export const START_THROTTLE_ENABLED = false;

// Persistent per-source throttling across isolates. No raw IP or token is retained.
async function publicRateLimit(request, db, operation) {
  const source = request.headers.get('CF-Connecting-IP') || 'local';
  const actor = await tokenHash(operation + ':' + source);
  const cutoff = new Date(Date.now()-60000).toISOString();
  const event = 'assessment.rate.' + operation;
  const at = nowIso();
  const changed = await db.prepare(
    'INSERT INTO audit_events (id,actor_type,actor_id,event_type,created_at) ' +
    'SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM audit_events WHERE actor_id=? AND event_type=? AND created_at>?) < 30'
  ).bind(id(),'system',actor,event,at,actor,event,cutoff).run();
  return changed?.meta?.changes ? null : apiJson({ok:false,message:'Too many requests. Try again in a minute.'},429,{'Retry-After':'60'});
}

export function errorResponse(error) {
  if(error instanceof ScreeningValidationError)return failure(error.message,400);
  if(error instanceof PrivacyConfigurationError)return failure('Private candidate registration is not configured. Please try again later.',503);
  // Two simultaneous starts with the same ID number: the ordinal key rejects the second.
  if (/UNIQUE constraint failed: assessment_identity_attempts/.test(String(error?.message || ''))) return failure('A start for this ID number was just recorded. Refresh the page and check your results before trying again.', 409);
  if (/UNIQUE constraint failed|FOREIGN KEY constraint failed/.test(String(error?.message || ''))) return failure('This invitation is already in use.', 409);
  if (error?.message === 'Request too large.') return failure(error.message,413);
  if (error instanceof AssessmentInputError || error instanceof BatteryError) return failure(error.message,400);
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
    'SELECT ' + PUBLIC_KEYS + ', c.first_name, c.surname, c.email, COALESCE((SELECT h.attempt_number FROM assessment_identity_attempts h WHERE h.candidate_id=c.id),1) AS attempt_number, d.title, d.client_name, d.duration_seconds, v.question_payload_json, v.scoring_key_json, v.scoring_engine_version ' +
    'FROM attempts a JOIN candidates c ON c.id=a.candidate_id ' +
    'JOIN assessment_definitions d ON d.id=a.definition_id ' +
    'JOIN assessment_versions v ON v.id=a.version_id ' +
    'WHERE a.session_token_sha256=?'
  ).bind(hash).first();
}

function attemptView(a) {
  const version = { question_payload_json: a.question_payload_json };
  return {
    attempt_id: a.id, status: a.status, attempt_number:a.attempt_number||1,
    first_name: a.first_name, surname: a.surname,
    client_name: safeParse(a.question_payload_json,{})._metadata?.client_name || a.client_name, title: safeParse(a.question_payload_json,{})._metadata?.title || a.title,
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
    'SELECT a.id, a.mcq_answers_json, a.structured_answers_json, a.workbook_json, v.question_payload_json, v.scoring_key_json, v.scoring_engine_version ' +
    'FROM attempts a JOIN assessment_versions v ON v.id=a.version_id WHERE a.id=? AND a.status IN (\'completed\', \'timed_out\')'
  ).bind(attemptId).first();
  if (!a) return;
  const questions = publicAssessment({ question_payload_json: a.question_payload_json });
  const rubric = safeParse(a.scoring_key_json, {});
  const answers = { mcq: safeParse(a.mcq_answers_json, {}), structured: safeParse(a.structured_answers_json, {}) };
  const payloadObj = safeParse(a.question_payload_json, {});
  const score = isBatteryPayload(payloadObj)
    ? gradeBattery({ payload: payloadObj, key: rubric }, { ...answers, workbook: safeParse(a.workbook_json, {}) })
    : scoreAssessment(questions, rubric, answers);
  await db.prepare(
    'INSERT INTO results (id, attempt_id, scoring_version, overall_score, knowledge_score, reconciliation_score, breakdown_json, critical_flags_json, interpretation, graded_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(attempt_id) DO NOTHING'
  ).bind(id(), attemptId, a.scoring_engine_version, score.overall_score, score.knowledge_score,
    score.reconciliation_score, JSON.stringify(score.breakdown), JSON.stringify(score.critical_flags),
    score.interpretation, nowIso()).run();
}

async function closeAttempt(db, a, now, requestedStatus) {
  if (!a) return 'not_found';
  if (a.status !== 'active') { await gradeAndStore(db, a.id); return a.status; }
  const expired = now >= Number(a.expires_at_ms);
  if (!expired && requestedStatus !== 'completed') return 'active';
  const status = expired ? 'timed_out' : 'completed';
  const clause = status === 'completed' ? 'AND expires_at_ms > ?' : 'AND expires_at_ms <= ?';
  const changed = await db.prepare(
    'UPDATE attempts SET status=?, closed_at_ms=?, updated_at=? WHERE id=? AND status=? ' + clause
  ).bind(status, now, nowIso(), a.id, 'active', now).run();
  if (changed?.meta?.changes) {
    await gradeAndStore(db, a.id);
    await audit(db, 'system', null, a.id, status === 'timed_out' ? 'assessment.timed_out' : 'assessment.submitted');
  }
  const refreshed = await db.prepare('SELECT status FROM attempts WHERE id=?').bind(a.id).first();
  // Best effort to repair a result missing after a previous failure.
  if (refreshed?.status !== 'active') await gradeAndStore(db, a.id);
  return refreshed?.status || status;
}

async function saveProgress(db, a, data, submit = false) {
  if(data.attempt_id!==a.id)return apiJson({ok:false,session_changed:true,message:"This tab belongs to another assessment session. Reopen the correct invitation."},409);
  const publicQuestions = publicAssessment({ question_payload_json: a.question_payload_json });
  const submission = cleanSubmission(data, publicQuestions);
  const isBattery = publicQuestions.format === BATTERY_FORMAT;
  const workbook = isBattery
    ? cleanBatteryWorkbook(data.workbook || {}, batteryWorkbookRules(publicQuestions))
    : cleanWorkbook(data.workbook || {});
  const expectedRevision = Number(data.save_revision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return failure('Missing or invalid save revision.', 400);
  const now = Date.now();
  const changed = await db.prepare(
    'UPDATE attempts SET mcq_answers_json=?, structured_answers_json=?, workbook_json=?, ' +
    'save_revision=save_revision+1, last_saved_at_ms=?, updated_at=?, status=?, closed_at_ms=? ' +
    "WHERE id=? AND status=? AND expires_at_ms > (strftime('%s','now')*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND save_revision=?"
  ).bind(JSON.stringify(submission.mcq), JSON.stringify(submission.structured), JSON.stringify(workbook),
    now, nowIso(), submit ? 'completed' : 'active', submit ? now : null, a.id, 'active', expectedRevision).run();

  if (!changed?.meta?.changes) {
    const status = await closeAttempt(db, a, Date.now(), null);
    if (status !== 'active') return submit ? apiJson({ok:true,status,server_now_ms:Date.now()}) : failure('Your assessment has closed. Your last saved work was retained.', 409);
    return apiJson({ ok: false, conflict: true, message: 'Another save was completed. Reload your saved answers before continuing.' }, 409);
  }
  // Persist an audit snapshot of each successfully saved workbook revision.
  // The attempts row remains the authoritative last saved state if this
  // supplementary snapshot write ever fails.
  try {
    await db.prepare('INSERT INTO workbook_snapshots (id, attempt_id, revision, workbook_json, saved_at_ms) VALUES (?, ?, ?, ?, ?)')
      .bind(id(), a.id, expectedRevision + 1, JSON.stringify(workbook), now).run();
  } catch { /* last saved workbook remains in attempts.workbook_json */ }
  if (submit) {
    await gradeAndStore(db, a.id);
    await audit(db, 'candidate', a.candidate_id, a.id, 'assessment.submitted');
  }
  return apiJson({ ok: true, ...(submit ? {status:'completed'} : {}), save_revision: expectedRevision + 1, saved_at_ms: now, server_now_ms: Date.now() });
}

async function startAttempt(request, db, env) {
  const data=await requestJson(request);
  const identity=normalizeIdentity(data);
  const screening=normalizeScreening(data);
  const open=typeof data.assessment_slug==='string' && /^[a-z0-9-]{3,60}$/.test(data.assessment_slug);
  let invited;
  if(open){
    const definition=await db.prepare("SELECT id AS definition_id,client_name,title,status AS assessment_status,duration_seconds,current_version_id FROM assessment_definitions WHERE slug=? AND status='published' AND current_version_id IS NOT NULL").bind(data.assessment_slug).first();
    if(!definition)return failure('This assessment is not open right now.',404);
    invited={...definition,id:id()};
  }else{
    if(!isToken(data.invitation_token))return failure('Choose an assessment link to begin.',400);
    invited=await db.prepare('SELECT i.*,d.client_name,d.title,d.status AS assessment_status,d.duration_seconds,d.current_version_id FROM invitations i JOIN assessment_definitions d ON d.id=i.definition_id WHERE i.token_sha256=?').bind(await tokenHash(data.invitation_token)).first();
    if(!invited||invited.status!=='issued'||Date.parse(invited.expires_at)<=Date.now()||invited.assessment_status!=='published'||!invited.current_version_id)return failure('This invitation is unavailable or has expired. Contact your recruiter.',403);
    if(invited.intended_email&&invited.intended_email.toLowerCase()!==identity.email)return failure('Please use the email address associated with your invitation.',403);
  }
  const version=await db.prepare('SELECT question_payload_json,scoring_key_json FROM assessment_versions WHERE id=?').bind(invited.current_version_id).first();
  const payload=safeParse(version?.question_payload_json,{});
  if(isBatteryPayload(payload)){try{assertPracticeIsolation(payload,safeParse(version.scoring_key_json,{}));}catch{return failure('This assessment needs a practice-content review before it can start.',503);}}
  // Check the public projection before creating a timed attempt; never alias opaque IDs.
  if(assessmentContentNeedsBrandReview({assessment:publicAssessment(version)}))return failure('Assessment content needs a branding review. Please contact Talent Tree.',503);
  const hash=await identityHash(env,invited.definition_id,screening.id_number);
  const ciphertext=await encryptId(env,screening.id_number);
  const start=newAttemptTimes(Date.now(),600);
  const candidateId=id(),attemptId=id(),sessionToken=newToken(),sessionHash=await tokenHash(sessionToken),at=nowIso();
  const operations=[];
  if(open)operations.push(db.prepare("INSERT INTO invitations (id,definition_id,token_sha256,status,issued_at,expires_at,redeemed_at,created_at) VALUES (?,?,?,'redeemed',?,?,?,?)").bind(invited.id,invited.definition_id,await tokenHash(newToken()),at,new Date(start.expires_at_ms).toISOString(),at,at));
  const columns='id,first_name,surname,email,privacy_notice_version,consent_recorded_at,created_at,contact_number,id_number_encrypted,id_number_masked,earliest_start_date,first_day_confirmed,travel_mode,travel_description,own_transport,assignment_available,assignment_note';
  const values=[candidateId,identity.first_name,identity.surname,identity.email,'open-assessment-retained-results-v2',at,at,screening.contact_number,ciphertext,maskId(screening.id_number),screening.earliest_start_date,1,screening.travel_mode,screening.travel_description,screening.own_transport,screening.assignment_available,screening.assignment_note];
  const condition=open?"EXISTS (SELECT id FROM assessment_definitions WHERE id=? AND status='published' AND current_version_id=?)":"EXISTS (SELECT i.id FROM invitations i JOIN assessment_definitions d ON d.id=i.definition_id WHERE i.id=? AND i.status='issued' AND i.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND d.status='published' AND d.current_version_id=?)";
  operations.push(db.prepare('INSERT INTO candidates ('+columns+') SELECT '+values.map(()=>'?').join(',')+' WHERE '+condition).bind(...values,open?invited.definition_id:invited.id,invited.current_version_id));
  // Allocate the next ordinal atomically with the new candidate and attempt graph.
  operations.push(db.prepare('INSERT INTO assessment_identity_attempts (definition_id,id_hash,candidate_id,created_at_ms,attempt_number) SELECT ?,?,?,?,COALESCE(MAX(attempt_number),0)+1 FROM assessment_identity_attempts WHERE definition_id=? AND id_hash=?').bind(invited.definition_id,hash,candidateId,start.started_at_ms,invited.definition_id,hash));
  operations.push(db.prepare('INSERT INTO attempts (id,invitation_id,candidate_id,definition_id,version_id,session_token_sha256,status,started_at_ms,expires_at_ms,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(attemptId,invited.id,candidateId,invited.definition_id,invited.current_version_id,sessionHash,'active',start.started_at_ms,start.expires_at_ms,at,at));
  if(!open)operations.push(db.prepare("UPDATE invitations SET status='redeemed',redeemed_at=? WHERE id=? AND status='issued'").bind(at,invited.id));
  await db.batch(operations);
  const a=await db.prepare('SELECT '+PUBLIC_KEYS+',c.first_name,c.surname,COALESCE((SELECT h.attempt_number FROM assessment_identity_attempts h WHERE h.candidate_id=c.id),1) AS attempt_number,d.title,d.client_name,v.question_payload_json FROM attempts a JOIN candidates c ON c.id=a.candidate_id JOIN assessment_definitions d ON d.id=a.definition_id JOIN assessment_versions v ON v.id=a.version_id WHERE a.id=?').bind(attemptId).first();
  await audit(db,'candidate',candidateId,attemptId,'assessment.started');
  return apiJson({ok:true,...attemptView(a)},200,{'Set-Cookie':cookieHeader(request,sessionToken)});
}

async function completionResponse(db,attemptId,status) {
  const row=await db.prepare('SELECT a.id,a.started_at_ms,a.expires_at_ms,c.first_name,c.surname,COALESCE((SELECT h.attempt_number FROM assessment_identity_attempts h WHERE h.candidate_id=c.id),1) AS attempt_number,d.client_name,d.title,r.overall_score,r.knowledge_score,r.reconciliation_score,r.breakdown_json FROM attempts a JOIN candidates c ON c.id=a.candidate_id JOIN assessment_definitions d ON d.id=a.definition_id LEFT JOIN results r ON r.attempt_id=a.id WHERE a.id=?').bind(attemptId).first();
  return apiJson({ok:true,attempt_id:attemptId,status,attempt_number:row?.attempt_number||1,first_name:row?.first_name||'',surname:row?.surname||'',client_name:row?.client_name||'Talent Tree',title:row?.title||'Assessment',started_at_ms:row?.started_at_ms,expires_at_ms:row?.expires_at_ms,server_now_ms:Date.now(),candidate_result:candidateResult(row)});
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
  const verification = await assessmentAdmin(request, env);
  if (!verification) return failure('Admin sign-in required.', 401);
  return null;
}

async function adminDraft(request, db) {
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
  ).bind(versionId, definitionId, versionLabel, JSON.stringify({...pkg.question_payload,_metadata:{title,client_name:name}}),
    JSON.stringify(pkg.scoring_key), pkg.engine || 'ap-deterministic-v1', null, at));
  await db.batch(operations);
  await audit(db, 'admin', null, null, 'assessment.draft_saved');
  return apiJson({ ok: true, assessment_id: definitionId, version_id: versionId, version_label: versionLabel });
}

async function adminReadDraft(db,versionId) {
  const row=await db.prepare('SELECT v.*,d.slug,d.title,d.client_name FROM assessment_versions v JOIN assessment_definitions d ON d.id=v.definition_id WHERE v.id=?').bind(versionId).first();
  if(!row)return failure('Assessment version not found.',404);
  const questionPayload=JSON.parse(row.question_payload_json);
  const metadata=questionPayload._metadata || {};delete questionPayload._metadata;
  return apiJson({ok:true,version_id:row.id,published:!!row.published_at,package:{slug:row.slug,title:metadata.title||row.title,client_name:metadata.client_name||row.client_name,question_payload:questionPayload,scoring_key:JSON.parse(row.scoring_key_json)}});
}
async function adminPublish(request,db) {
  const data=await requestJson(request);
  if(data.content_approved!==true || data.privacy_approved!==true || typeof data.approval_reference!=='string' || data.approval_reference.trim().length<8 || data.approval_reference.length>200) {
    return failure('Assessment content and privacy approvals with a reference are required.',400);
  }
  const version=await db.prepare('SELECT * FROM assessment_versions WHERE id=?').bind(typeof data.version_id==='string'?data.version_id:'').first();
  if(!version)return failure('Assessment draft not found.',404);
  validateAssessmentPackage({question_payload:JSON.parse(version.question_payload_json),scoring_key:JSON.parse(version.scoring_key_json)});
  if(assessmentContentNeedsBrandReview({assessment:publicAssessment(version)}))return failure('Assessment identifiers or workbook sources need a branding review before publishing.',400);
  if(isBatteryPayload(JSON.parse(version.question_payload_json))){try{assertPracticeIsolation(JSON.parse(version.question_payload_json),JSON.parse(version.scoring_key_json));}catch{return failure('Practice content overlaps this assessment. Review practice before publishing.',400);}}
  const at=nowIso();
  const metadata=JSON.parse(version.question_payload_json)._metadata||{};
  await db.batch([
    db.prepare('UPDATE assessment_versions SET published_at=COALESCE(published_at,?) WHERE id=?').bind(at,version.id),
    db.prepare('UPDATE assessment_definitions SET current_version_id=?,status=?,duration_seconds=600,updated_at=?,title=COALESCE(?,title),client_name=COALESCE(?,client_name) WHERE id=?').bind(version.id,'published',at,metadata.title||null,metadata.client_name||null,version.definition_id),
    db.prepare('INSERT INTO audit_events (id,actor_type,actor_id,event_type,safe_metadata_json,created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id(),'admin',version.id,'assessment.published',JSON.stringify({approval_reference:data.approval_reference.trim(),content_approved:true,privacy_approved:true}),at),
  ]);
  return apiJson({ok:true,assessment_id:version.definition_id,version_id:version.id,version_label:version.version_label});
}

async function adminInvite(request, db) {
  const data = await requestJson(request);
  const assessmentId = typeof data.assessment_id === 'string' ? data.assessment_id : '';
  const email = typeof data.intended_email === 'string' ? data.intended_email.trim().toLowerCase() : '';
  const validDays = Number(data.valid_days || 7);
  if (!EMAIL.test(email) || email.length > 254) return failure('Invalid candidate email.', 400);
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
  await audit(db, 'admin', null, null, 'assessment.invitation_created');
  const origin = new URL(request.url).origin;
  return apiJson({ ok: true, invitation_url: origin + '/assessment?invite=' + token, expires_at: expires });
}

// Email is best-effort and must never delay or fail a candidate response.
function scheduleNotifications(context, env, db) {
  const task = notifyPendingResults(env, db).catch(() => {});
  if (context && typeof context.waitUntil === 'function') context.waitUntil(task);
}

async function adminList(db) {
  // Lazy-finalise expired attempts, including abandoned browser tabs.
  const overdue = await db.prepare('SELECT id, status, expires_at_ms FROM attempts WHERE status=? AND expires_at_ms<=? LIMIT 50')
    .bind('active', Date.now()).all();
  for (const a of resultRows(overdue)) await closeAttempt(db, a, Date.now(), null);
  const missing=await db.prepare("SELECT a.id FROM attempts a LEFT JOIN results r ON r.attempt_id=a.id WHERE a.status IN ('completed','timed_out') AND r.attempt_id IS NULL LIMIT 100").all();
  for(const a of resultRows(missing))await gradeAndStore(db,a.id);
  const [defs, attempts] = await db.batch([
    db.prepare("SELECT d.id,d.slug,d.client_name,d.title,d.status,d.duration_seconds,d.updated_at, (SELECT v.id FROM assessment_versions v WHERE v.definition_id=d.id ORDER BY v.created_at DESC,v.version_label DESC LIMIT 1) AS latest_version_id FROM assessment_definitions d ORDER BY d.updated_at DESC LIMIT 100"),
    db.prepare(
      'SELECT a.id, a.status, a.started_at_ms, a.expires_at_ms, a.closed_at_ms, c.first_name, c.surname, c.email, c.earliest_start_date, COALESCE((SELECT h.attempt_number FROM assessment_identity_attempts h WHERE h.candidate_id=c.id),1) AS attempt_number, ' +
      'd.client_name, d.title, r.overall_score, r.knowledge_score, r.reconciliation_score, r.critical_flags_json ' +
      'FROM attempts a JOIN candidates c ON c.id=a.candidate_id JOIN assessment_definitions d ON d.id=a.definition_id ' +
      'LEFT JOIN results r ON r.attempt_id=a.id ORDER BY a.started_at_ms DESC LIMIT 100'
    ),
  ]);
  return apiJson({ ok: true, definitions: resultRows(defs), attempts: resultRows(attempts).map((a) => ({
    ...a, critical_flags: safeParse(a.critical_flags_json, []), critical_flags_json: undefined,
  })) });
}

// Battery report: item-level review with stored (auditable) scores, plus saved workbook history.
async function batteryReport(db, a, attemptId) {
  const payloadObj = safeParse(a.question_payload_json, {});
  const rubric = safeParse(a.scoring_key_json, {});
  const answers = { mcq: safeParse(a.mcq_answers_json, {}), structured: safeParse(a.structured_answers_json, {}), workbook: safeParse(a.workbook_json, {}) };
  const graded = gradeBattery({ payload: payloadObj, key: rubric }, answers);
  const saves = await db.prepare('SELECT revision, saved_at_ms FROM workbook_snapshots WHERE attempt_id=? ORDER BY revision ASC LIMIT 200').bind(attemptId).all();
  const auditEvents = await db.prepare('SELECT event_type,actor_type,created_at FROM audit_events WHERE attempt_id=? ORDER BY created_at LIMIT 300').bind(attemptId).all();
  await audit(db, 'admin', null, attemptId, 'assessment.report_viewed');
  return apiJson({
    ok: true,
    audit_events: resultRows(auditEvents),
    workbook_values: graded.workbook_values,
    workbook_source: payloadObj.workbook?.source || {},
    reconciliation_review: null,
    workbook_save_history: resultRows(saves),
    candidate: { first_name: a.first_name, surname: a.surname, email: a.email },
    screening: publicScreening(a),
    assessment: { client_name: payloadObj._metadata?.client_name || a.client_name, title: payloadObj._metadata?.title || a.title, version: a.version_label, format: payloadObj.format, sheets: payloadObj.workbook?.sheets || null },
    attempt: { id: a.id, attempt_number:a.attempt_number||1, status: a.status, started_at_ms: a.started_at_ms, expires_at_ms: a.expires_at_ms, closed_at_ms: a.closed_at_ms, last_saved_at_ms: a.last_saved_at_ms },
    responses: answers,
    question_review: graded.items.map((i) => ({
      id: i.id, section: i.section, category: i.category, prompt: i.prompt, chosen: i.given ?? 'Not answered',
      expected: i.correctAnswer, correct: i.correct, awarded: i.awarded, points: i.points,
    })),
    result: a.overall_score === null ? null : {
      overall_score: a.overall_score, knowledge_score: a.knowledge_score, reconciliation_score: a.reconciliation_score,
      breakdown: safeParse(a.breakdown_json, {}), critical_flags: safeParse(a.critical_flags_json, []),
      interpretation: a.interpretation, graded_at: a.graded_at,
    },
  });
}

async function adminReport(db, attemptId) {
  if (!/^[a-f0-9-]{36}$/i.test(attemptId)) return failure('Invalid attempt ID.', 400);
  const a = await db.prepare(
    'SELECT a.id, a.status, a.started_at_ms, a.expires_at_ms, a.closed_at_ms, a.last_saved_at_ms, COALESCE((SELECT h.attempt_number FROM assessment_identity_attempts h WHERE h.candidate_id=c.id),1) AS attempt_number, ' +
    'a.mcq_answers_json, a.structured_answers_json, a.workbook_json, c.first_name, c.surname, c.email, c.contact_number, c.id_number_masked, c.earliest_start_date, c.first_day_confirmed, c.travel_mode, c.travel_description, c.own_transport, c.assignment_available, c.assignment_note, ' +
    'd.client_name, d.title, v.version_label, v.question_payload_json, v.scoring_key_json, ' +
    'r.overall_score, r.knowledge_score, r.reconciliation_score, r.breakdown_json, r.critical_flags_json, r.interpretation, r.graded_at ' +
    'FROM attempts a JOIN candidates c ON c.id=a.candidate_id ' +
    'JOIN assessment_definitions d ON d.id=a.definition_id JOIN assessment_versions v ON v.id=a.version_id ' +
    'LEFT JOIN results r ON r.attempt_id=a.id WHERE a.id=?'
  ).bind(attemptId).first();
  if (!a) return failure('Assessment result not found.', 404);
  await audit(db, 'admin', null, attemptId, 'assessment.report_viewed');
  if (a.status === 'active' && Date.now() >= Number(a.expires_at_ms)) {
    await closeAttempt(db, a, Date.now(), null);
    return adminReport(db, attemptId);
  }
  if(['completed','timed_out'].includes(a.status) && a.overall_score===null){await gradeAndStore(db,a.id);return adminReport(db,attemptId);}
  if (isBatteryPayload(safeParse(a.question_payload_json, {}))) return await batteryReport(db, a, attemptId);
  const saves = await db.prepare('SELECT revision, saved_at_ms FROM workbook_snapshots WHERE attempt_id=? ORDER BY revision ASC LIMIT 200')
    .bind(attemptId).all();
  const scenario=safeParse(a.question_payload_json,{}).scenario;
  const workbook={...scenarioWorkingCells(scenario),...safeParse(a.workbook_json,{})};
  const rubric=safeParse(a.scoring_key_json,{});
  const auditEvents=await db.prepare('SELECT event_type,actor_type,created_at FROM audit_events WHERE attempt_id=? ORDER BY created_at LIMIT 300').bind(attemptId).all();
  return apiJson({
    ok: true,
    audit_events:resultRows(auditEvents),
    workbook_values:Object.fromEntries(Object.keys(workbook).map(ref=>[ref,calculateCell(workbook,ref)])),
    reconciliation_review:{expected_discrepancies:rubric.discrepancies,expected_actions:rubric.actions,expected_balance:rubric.corrected_balance},
    workbook_save_history: resultRows(saves),
    candidate: { first_name: a.first_name, surname: a.surname, email: a.email },
    screening: publicScreening(a),
    assessment: { client_name: safeParse(a.question_payload_json,{})._metadata?.client_name || a.client_name, title: safeParse(a.question_payload_json,{})._metadata?.title || a.title, version: a.version_label, scenario: safeParse(a.question_payload_json, {}).scenario },
    attempt: { id: a.id, attempt_number:a.attempt_number||1, status: a.status, started_at_ms: a.started_at_ms, expires_at_ms: a.expires_at_ms, closed_at_ms: a.closed_at_ms, last_saved_at_ms: a.last_saved_at_ms },
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
    const throttled = START_THROTTLE_ENABLED ? ['invite','start','admin/login'] : ['invite','admin/login'];
    if (throttled.includes(operation)) {
      const limited = await publicRateLimit(request,db,operation);
      if (limited) return limited;
    }

    if (operation === 'catalog' && request.method === 'GET') return await assessmentCatalog(db);
    if (operation === 'invite' && request.method === 'GET') return await inviteMeta(request, db);
    if (operation === 'start' && write) return await startAttempt(request, db, env);

    if (operation === 'admin/login' && write) return await assessmentLogin(request,env);
    if (segments[0] === 'admin') {
      const deny = await requireAdmin(request, env);
      if (deny) return deny;
      if (write && request.headers.get(HEADER) !== '1') return failure('Invalid admin request.', 403);
      if (operation === 'admin/session' && request.method === 'GET') return apiJson({ok:true,loggedIn:true});
      if (operation === 'admin/list' && request.method === 'GET') {
        const list = await adminList(db);
        scheduleNotifications(context, env, db);
        return list;
      }
      if (operation === 'admin/draft' && write) return await adminDraft(request,db);
      if (segments.length===3 && segments[1]==='draft' && request.method==='GET') return await adminReadDraft(db,segments[2]);
      if (operation === 'admin/publish' && write) return await adminPublish(request, db);
      if (operation === 'admin/invite' && write) return await adminInvite(request, db);
      if (segments[1] === 'report' && segments[2] && request.method === 'GET') return await adminReport(db, segments[2]);
      return failure('Admin endpoint not found.', 404);
    }

    if (!['me', 'save', 'submit'].includes(operation)) return failure('Endpoint not found.', 404);
    const attempt = await candidateAttempt(request, db);
    if (!attempt) return failure('Session not found. Contact your recruiter.', 401);
    const expectedId=new URL(request.url).searchParams.get('attempt_id');
    if(expectedId && expectedId!==attempt.id)return failure('This tab belongs to another assessment session.',409);
    const invite=new URL(request.url).searchParams.get('invite');
    if(invite){
      const matches=isToken(invite) && await db.prepare('SELECT id FROM invitations WHERE id=? AND token_sha256=?').bind(attempt.invitation_id,await tokenHash(invite)).first();
      if(!matches)return failure('Invitation does not match this session.',401);
    }

    const status = await closeAttempt(db, attempt, Date.now(), null);
    if (status !== 'active') scheduleNotifications(context, env, db);
    if (operation === 'me' && request.method === 'GET') {
      if(status!=='active')return await completionResponse(db,attempt.id,status);
      return apiJson({ ok: true, ...attemptView({ ...await candidateAttempt(request,db), status }) });
    }
    if (!write) return failure('Method not allowed.', 405);
    if (status !== 'active') return operation === 'submit' ? await completionResponse(db,attempt.id,status) : failure('Your assessment has closed. Your saved answers have been retained.', 409);

    const data = await requestJson(request);
    const response = await saveProgress(db, attempt, data, operation === 'submit');
    if (operation === 'submit') {
      scheduleNotifications(context, env, db);
      if(response.status===200){const receipt=await response.json();return await completionResponse(db,attempt.id,receipt.status);}
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
