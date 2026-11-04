/* Result notification for the assessment platform.
   Sends one email per graded result to ASSESSMENT_RESULTS_TO through the Resend HTTP API.
   Required configuration (see docs/assessments/DEPLOYMENT_RUNBOOK.md):
     RESEND_API_KEY          secret
     ASSESSMENT_FROM_EMAIL   sender on a domain verified with the provider
     ASSESSMENT_RESULTS_TO   recipient (set in wrangler.toml [vars])
   Candidate-supplied values are escaped before being placed in HTML.
   v1 results (five MCQs + discrepancy rubric) and battery-v2 results use different breakdowns;
   each is rendered from its own structure, never from the other's fields.
   The HTML is built for email clients: nested tables, inline styles, no scripts, no external
   images. Colours and type follow the Talent Tree tokens in src/styles.css (DESIGN.md). */

import {publicScreening} from './candidate-privacy.js';
import {assessmentBrandText} from './assessment-core.js';
import { BATTERY_FORMAT, gradeBattery, isBatteryPayload } from './battery.js';

const MAX_RETRIES = 5;
const RESEND_URL = 'https://api.resend.com/emails';

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const safeParse = (str, fallback) => {
  try { return JSON.parse(str); } catch { return fallback; }
};

/* Design tokens (mirrors src/styles.css). Email clients ignore CSS variables, so values are literal. */
const C = {
  inkDeep: '#071f2d', ink: '#0e2a3a', muted: '#4f6b7a', mutedOnDark: '#a9c4d2',
  paper: '#f4f1ea', paperSoft: '#fbf9f4', accent: '#006da3', accentDeep: '#00567e',
  accentBright: '#5ab9e8', accentSoft: '#d9eaf3', line: '#d8e0e5', track: '#e6ecf0',
  warn: '#b3261e', warnSoft: '#fdf0ee',
};
const SERIF = "Fraunces,Georgia,'Times New Roman',serif";
const SANS = "Inter,Arial,Helvetica,sans-serif";

/* Percentage of a maximum, clamped to 0–100. Used when the breakdown does not supply one. */
const percentOf = (value, max) => {
  const n = Number(value), m = Number(max);
  if (!Number.isFinite(n) || !Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((n / m) * 100)));
};

/* Horizontal meter built from two table cells, so it renders in clients that drop CSS width. */
function meter(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = p > 0 ? `<td width="${p}%" style="height:8px;background:${C.accent};font-size:0;line-height:0;">&nbsp;</td>` : '';
  const empty = p < 100 ? `<td style="height:8px;background:${C.track};font-size:0;line-height:0;">&nbsp;</td>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;"><tr>${filled}${empty}</tr></table>`;
}

/* Status label. Only fixed strings are passed in, never candidate text. */
function pill(text, tone = 'ok') {
  const [background, color] = tone === 'warn' ? [C.warnSoft, C.warn] : [C.accentSoft, C.inkDeep];
  return `<span style="display:inline-block;padding:4px 9px;background:${background};color:${color};font:700 11px/1.2 ${SANS};letter-spacing:0.6px;text-transform:uppercase;border-radius:2px;">${text}</span>`;
}

function sectionHeading(text) {
  return `<h2 style="margin:30px 0 12px;padding-bottom:8px;border-bottom:1px solid ${C.line};font:700 11px/1.4 ${SANS};letter-spacing:1.6px;text-transform:uppercase;color:${C.accentDeep};">${text}</h2>`;
}

/* One labelled score line with its meter. The label is escaped by the caller when it carries data. */
function scoreLine(label, percent, detail = '') {
  return `<div style="margin:0 0 16px;">
    <div style="font:14px/1.4 ${SANS};color:${C.ink};">${label}<span style="float:right;font:600 14px/1.4 ${SANS};color:${C.inkDeep};font-variant-numeric:tabular-nums;">${detail}${percent}%</span></div>
    ${meter(percent)}
  </div>`;
}

/* Two-column label/value row for candidate and screening details. */
function detailRow(label, value) {
  return `<tr>
    <td width="210" valign="top" style="padding:8px 14px 8px 0;border-bottom:1px solid ${C.line};font:600 13px/1.4 ${SANS};color:${C.muted};">${escapeHtml(label)}</td>
    <td valign="top" style="padding:8px 0;border-bottom:1px solid ${C.line};font:14px/1.45 ${SANS};color:${C.ink};">${escapeHtml(value)}</td>
  </tr>`;
}

/* Headline: the overall score, the two category meters, and the flag status.
   Stacked on purpose: a side-by-side layout squeezes the meters on phones. */
function scoreHero(result) {
  const total = Number(result.overall_score) || 0;
  const flags = result.critical_flags || [];
  const flagLine = flags.length
    ? `<div style="margin-top:16px;">${pill('Review flags', 'warn')}<div style="margin-top:8px;font:13px/1.5 ${SANS};color:${C.warn};">${flags.map(escapeHtml).join('; ')}</div></div>`
    : `<div style="margin-top:16px;">${pill('No critical flags')}</div>`;
  return `<div style="font:700 11px/1.2 ${SANS};letter-spacing:1.6px;text-transform:uppercase;color:${C.muted};">Overall score</div>
    <div style="margin-top:6px;font:500 72px/1 ${SERIF};color:${C.inkDeep};font-variant-numeric:tabular-nums;">${escapeHtml(total)}</div>
    <div style="margin-top:8px;font:14px/1.4 ${SANS};color:${C.muted};">Total: ${escapeHtml(total)} / 100</div>
    <div style="margin-top:22px;">
      ${scoreLine('Knowledge', percentOf(result.knowledge_score, 40), escapeHtml(result.knowledge_score) + ' / 40 · ')}
      ${scoreLine('Practical reconciliation', percentOf(result.reconciliation_score, 60), escapeHtml(result.reconciliation_score) + ' / 60 · ')}
    </div>
    ${flagLine}`;
}

/* Screening values as readable text. Codes come from the candidate form; anything unexpected
   is shown as recorded, never guessed. */
const TRAVEL_LABELS = { own_vehicle: 'Own vehicle', lift: 'Lift from someone', public_transport: 'Public transport', other: 'Other' };
const YES_NO = { yes: 'Yes', no: 'No' };
const OPTIONAL_SCREENING = new Set(['travel_description', 'assignment_note']);
function formatStartDate(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function screeningValue(key, value) {
  if (key === 'first_day_confirmed') return value ? 'Yes' : 'No';
  if (key === 'travel_mode') return TRAVEL_LABELS[value] || value || 'Not recorded';
  if (key === 'own_transport' || key === 'assignment_available') return YES_NO[value] || 'Not recorded';
  if (key === 'earliest_start_date') return value ? formatStartDate(value) : 'Not recorded';
  return value || 'Not recorded';
}

/* Battery-v2 scoring: category and section meters, using the stored breakdown. */
function batteryScoringHtml(breakdown) {
  const c = breakdown.categories || {};
  const lines = [];
  lines.push(`<p style="margin:0 0 16px;font:13px/1.5 ${SANS};color:${C.muted};">The overall score adds knowledge (out of 40) and practical work (out of 60). The points below are the raw points each part earned.</p>`);
  if (c.knowledge) lines.push(scoreLine(escapeHtml(`Knowledge: ${c.knowledge.earned} / ${c.knowledge.max} points`), Number(c.knowledge.percent) || 0));
  if (c.reconciliation) lines.push(scoreLine(escapeHtml(`Practical work (workbook and reconciliation): ${c.reconciliation.earned} / ${c.reconciliation.max} points`), Number(c.reconciliation.percent) || 0));
  for (const s of breakdown.sections || []) {
    lines.push(scoreLine(escapeHtml(`${s.title}: ${s.earned} / ${s.max}`), Number(s.percent) || 0));
  }
  return sectionHeading('Scoring')
    + lines.join('')
    + `<p style="margin:4px 0 0;font:14px/1.5 ${SANS};color:${C.ink};">Items correct: ${escapeHtml(breakdown.items_correct ?? 0)} of ${escapeHtml(breakdown.items_total ?? 0)}</p>`;
}

/* v1 breakdown: discrepancy identification, corrective actions and the corrected balance. */
function v1ScoringHtml(b) {
  const rows = [
    ['Discrepancies identified', `${b.identified ?? 0} (points ${b.identification_points ?? 0})`],
    ['Incorrect selections', String(b.incorrect_selections ?? 0)],
    ['Corrective action points', String(b.action_points ?? 0)],
    ['Corrected balance points', String(b.balance_points ?? 0)],
  ];
  return sectionHeading('Reconciliation scoring')
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.map(([l, v]) => detailRow(l, v)).join('')}</table>`;
}

/* Question-by-question review. Each question sits in one full-width block: the status label,
   then the question, then what was given and what was correct. Nothing is squeezed into a column. */
function itemReviewHtml(items) {
  const rows = items.map((q, i) => `<tr>
      <td valign="top" width="30" style="padding:16px 10px 16px 0;border-bottom:1px solid ${C.line};font:600 13px/1.4 ${SANS};color:${C.muted};font-variant-numeric:tabular-nums;">${i + 1}</td>
      <td valign="top" style="padding:16px 0;border-bottom:1px solid ${C.line};font:14px/1.5 ${SANS};color:${C.ink};">
        <div>${q.correct ? pill('Correct') : pill('Incorrect', 'warn')}</div>
        <div style="margin-top:10px;font-weight:600;">${escapeHtml(q.prompt)}</div>
        <div style="margin-top:8px;font:13px/1.5 ${SANS};color:${C.muted};">Given: ${escapeHtml(q.chosen)}</div>
        <div style="font:13px/1.5 ${SANS};color:${C.muted};">Correct: ${escapeHtml(q.expected)}</div>
      </td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
}

export function buildResultEmail({ candidate, title, clientName, status, result, mcqReview, gradedAt, isBattery = false, screening={}, attemptNumber=1 }) {
  const details=publicScreening(screening);
  const labels={contact_number_masked:'Contact number',id_number_masked:'South African ID number',earliest_start_date:'Earliest start date',first_day_confirmed:'First day confirmed',travel_mode:'Travel mode',travel_description:'Route description',own_transport:'Own transport',assignment_available:'Available for a 2-month assignment',assignment_note:'Availability note'};
  const screeningRows=Object.entries(details)
    .filter(([key,value])=>!(OPTIONAL_SCREENING.has(key)&&!value))
    .map(([key,value])=>[labels[key], screeningValue(key,value)]);
  const name = `${candidate.first_name} ${candidate.surname}`.trim();
  const flags = result.critical_flags || [];
  const b = result.breakdown || {};
  const verdict = flags.length ? 'Review flags' : 'No critical flags';
  const subject = `[Assessment] Attempt ${attemptNumber} — ${title} — ${name}: ${result.overall_score}/100`;
  const batteryStyle = isBattery || Boolean(b.categories);
  const scoring = batteryStyle ? batteryScoringHtml(b) : v1ScoringHtml(b);
  const reviewTitle = batteryStyle ? 'Item review' : 'Knowledge questions';
  const preheader = `${name}: ${result.overall_score} out of 100 (attempt ${attemptNumber}). ${verdict}.`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">
  <tr><td style="background:${C.inkDeep};padding:26px 32px 28px;border-radius:4px 4px 0 0;">
    <div style="font:500 20px/1 ${SERIF};color:#ffffff;">Talent Tree</div>
    <div style="margin-top:26px;font:700 11px/1.2 ${SANS};letter-spacing:1.8px;text-transform:uppercase;color:${C.accentBright};">Assessment result · Attempt ${escapeHtml(attemptNumber)}</div>
    <h1 style="margin:10px 0 8px;font:500 28px/1.2 ${SERIF};color:#ffffff;">${escapeHtml(title)}</h1>
    <div style="font:14px/1.6 ${SANS};color:${C.mutedOnDark};">${escapeHtml(clientName)} · Status: ${escapeHtml(status)} · Graded ${escapeHtml(gradedAt)}</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:30px 32px 28px;">
    ${scoreHero(result)}
    ${sectionHeading('Screening details')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${detailRow('Candidate', name)}
      ${detailRow('Email', candidate.email)}
      ${screeningRows.map(([label, value]) => detailRow(label, value)).join('')}
    </table>
    ${scoring}
    ${sectionHeading(reviewTitle)}
    ${itemReviewHtml(mcqReview)}
    <div style="margin-top:26px;padding:16px 18px;background:${C.paperSoft};border-left:3px solid ${C.accent};font:14px/1.6 ${SANS};color:${C.ink};"><strong>Interpretation.</strong> ${escapeHtml(result.interpretation)}</div>
  </td></tr>
  <tr><td style="padding:18px 32px 0;font:12px/1.6 ${SANS};color:${C.muted};">Scores are not validated against job performance. The full detail, including the saved workbook, is in the admin platform at /admin/assessments.</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    `Attempt ${attemptNumber}`,
    'Screening details',
    ...screeningRows.map(([label,value])=>`${label}: ${value}`),
    `${title} — ${name} <${candidate.email}>`,
    `Client: ${clientName} · Status: ${status} · Graded: ${gradedAt}`,
    `Total: ${result.overall_score}/100 (knowledge ${result.knowledge_score}/40, reconciliation ${result.reconciliation_score}/60)`,
    `Flags: ${verdict}${flags.length ? ': ' + flags.join('; ') : ''}`,
    `Interpretation: ${result.interpretation}`,
    '',
    ...mcqReview.map((q, i) => `${i + 1}. ${q.prompt}\n   Candidate: ${q.chosen}\n   Correct: ${q.expected} — ${q.correct ? 'Correct' : 'Incorrect'}`),
  ].join('\n');

  return {subject:assessmentBrandText(subject),html:assessmentBrandText(html),text:assessmentBrandText(text)};
}

export async function sendResultEmail(env, message, fetchImpl = fetch) {
  if (!env.RESEND_API_KEY || !env.ASSESSMENT_FROM_EMAIL || !env.ASSESSMENT_RESULTS_TO) {
    return { ok: false, reason: 'not_configured' };
  }
  const response = await fetchImpl(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.ASSESSMENT_FROM_EMAIL,
      to: [env.ASSESSMENT_RESULTS_TO],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  return response.ok ? { ok: true } : { ok: false, reason: `http_${response.status}` };
}

/* Loads everything the email needs for one attempt. Battery items are regraded from the stored
   answers with the same pure function the API uses, so the email matches the saved result. */
async function loadResultForEmail(db, attemptId) {
  const row = await db.prepare(
    'SELECT a.id, a.status, a.mcq_answers_json, a.structured_answers_json, a.workbook_json, c.first_name, c.surname, c.email, c.contact_number,c.id_number_masked,c.earliest_start_date,c.first_day_confirmed,c.travel_mode,c.travel_description,c.own_transport,c.assignment_available,c.assignment_note, COALESCE((SELECT h.attempt_number FROM assessment_identity_attempts h WHERE h.candidate_id=c.id),1) AS attempt_number, d.client_name, d.title, ' +
    'v.question_payload_json, v.scoring_key_json, r.overall_score, r.knowledge_score, r.reconciliation_score, ' +
    'r.breakdown_json, r.critical_flags_json, r.interpretation, r.graded_at ' +
    'FROM attempts a JOIN candidates c ON c.id=a.candidate_id JOIN assessment_definitions d ON d.id=a.definition_id ' +
    'JOIN assessment_versions v ON v.id=a.version_id JOIN results r ON r.attempt_id=a.id WHERE a.id=?'
  ).bind(attemptId).first();
  if (!row) return null;
  const payload = safeParse(row.question_payload_json, {});
  const key = safeParse(row.scoring_key_json, {});
  const chosen = safeParse(row.mcq_answers_json, {});
  const isBattery = isBatteryPayload(payload);

  let mcqReview;
  if (isBattery) {
    const graded = gradeBattery(
      { payload, key },
      { mcq: chosen, structured: safeParse(row.structured_answers_json, {}), workbook: safeParse(row.workbook_json, {}) }
    );
    mcqReview = graded.items.map((i) => ({
      prompt: `${i.section}: ${i.prompt}`,
      chosen: i.given ?? 'Not answered',
      expected: i.correctAnswer,
      correct: i.correct === true,
    }));
  } else {
    mcqReview = (payload.questions || []).map((q) => {
      const chosenId = chosen[q.id] || null;
      const expectedId = key.mcq?.[q.id] || null;
      return {
        prompt: q.prompt,
        chosen: q.options.find((o) => o.id === chosenId)?.text || 'Not answered',
        expected: q.options.find((o) => o.id === expectedId)?.text || 'Not available',
        correct: chosenId !== null && chosenId === expectedId,
      };
    });
  }

  return {
    screening:row,
    attemptNumber:row.attempt_number,
    candidate: { first_name: row.first_name, surname: row.surname, email: row.email },
    title: payload._metadata?.title || row.title,
    clientName: payload._metadata?.client_name || row.client_name,
    status: row.status,
    gradedAt: row.graded_at,
    isBattery,
    result: {
      overall_score: row.overall_score,
      knowledge_score: row.knowledge_score,
      reconciliation_score: row.reconciliation_score,
      breakdown: safeParse(row.breakdown_json, {}),
      critical_flags: safeParse(row.critical_flags_json, []),
      interpretation: row.interpretation,
    },
    mcqReview,
  };
}

/* Sends notifications for graded results not yet emailed. Never throws: failures are
   recorded on the result row and retried on later calls, up to MAX_RETRIES. */
export async function notifyPendingResults(env, db, fetchImpl = fetch, limit = 5) {
  const pending = await db.prepare(
    "SELECT r.attempt_id FROM results r JOIN attempts a ON a.id=r.attempt_id " +
    "WHERE r.notified_at IS NULL AND r.notify_attempts < ? AND a.status IN ('completed','timed_out') " +
    'ORDER BY r.graded_at LIMIT ?'
  ).bind(MAX_RETRIES, limit).all();
  for (const row of pending?.results || []) {
    try {
      const data = await loadResultForEmail(db, row.attempt_id);
      if (!data) continue;
      const sent = await sendResultEmail(env, buildResultEmail(data), fetchImpl);
      if (sent.ok) {
        await db.prepare("UPDATE results SET notified_at=?, notify_status='sent' WHERE attempt_id=?")
          .bind(new Date().toISOString(), row.attempt_id).run();
      } else if (sent.reason === 'not_configured') {
        // Missing configuration is not a delivery failure: keep the retry budget intact.
        await db.prepare("UPDATE results SET notify_status='not_configured' WHERE attempt_id=?")
          .bind(row.attempt_id).run();
      } else {
        await db.prepare('UPDATE results SET notify_attempts=notify_attempts+1, notify_status=? WHERE attempt_id=?')
          .bind(sent.reason, row.attempt_id).run();
      }
    } catch {
      // Log no candidate data; the row keeps notify_status 'pending' and is retried.
      await db.prepare('UPDATE results SET notify_attempts=notify_attempts+1 WHERE attempt_id=?')
        .bind(row.attempt_id).run();
    }
  }
}
