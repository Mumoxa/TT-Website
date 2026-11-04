/* Result notification for the assessment platform.
   Sends one email per graded result to ASSESSMENT_RESULTS_TO through the Resend HTTP API.
   Required configuration (see docs/assessments/DEPLOYMENT_RUNBOOK.md):
     RESEND_API_KEY          secret
     ASSESSMENT_FROM_EMAIL   sender on a domain verified with the provider
     ASSESSMENT_RESULTS_TO   recipient (set in wrangler.toml [vars])
   Candidate-supplied values are escaped before being placed in HTML.
   v1 results (five MCQs + discrepancy rubric) and battery-v2 results use different breakdowns;
   each is rendered from its own structure, never from the other's fields. */

import { BATTERY_FORMAT, gradeBattery, isBatteryPayload } from './battery.js';

const MAX_RETRIES = 5;
const RESEND_URL = 'https://api.resend.com/emails';

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const safeParse = (str, fallback) => {
  try { return JSON.parse(str); } catch { return fallback; }
};

const TABLE_HEAD = `<tr>
  <th align="left" style="padding:6px;border-bottom:2px solid #1d2b3a">#</th>
  <th align="left" style="padding:6px;border-bottom:2px solid #1d2b3a">Question</th>
  <th align="left" style="padding:6px;border-bottom:2px solid #1d2b3a">Candidate answer</th>
  <th align="left" style="padding:6px;border-bottom:2px solid #1d2b3a">Correct answer</th>
  <th align="left" style="padding:6px;border-bottom:2px solid #1d2b3a">Result</th></tr>`;

function itemRows(mcqReview) {
  return mcqReview.map((q, i) => `
    <tr>
      <td style="padding:6px;border-bottom:1px solid #ddd">${i + 1}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${escapeHtml(q.prompt)}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${escapeHtml(q.chosen)}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${escapeHtml(q.expected)}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${q.correct ? 'Correct' : 'Incorrect'}</td>
    </tr>`).join('');
}

/* Battery-v2 breakdown: categories and sections, as stored at grading time. */
function batteryScoringHtml(breakdown) {
  const c = breakdown.categories || {};
  const line = (label, x) => (x ? `<li>${escapeHtml(label)}: ${escapeHtml(x.earned)} / ${escapeHtml(x.max)} points (${escapeHtml(x.percent)}%)</li>` : '');
  const sections = (breakdown.sections || []).map((s) =>
    `<li>${escapeHtml(s.title)}: ${escapeHtml(s.earned)} / ${escapeHtml(s.max)} (${escapeHtml(s.percent)}%)</li>`).join('');
  return `<h3 style="margin:20px 0 6px">Scoring</h3>
  <ul>${line('Knowledge', c.knowledge)}${line('Practical work (workbook and reconciliation)', c.reconciliation)}${sections}</ul>
  <p>Items correct: ${escapeHtml(breakdown.items_correct ?? 0)} of ${escapeHtml(breakdown.items_total ?? 0)}</p>`;
}

/* v1 breakdown: discrepancy identification, corrective actions and the corrected balance. */
function v1ScoringHtml(b) {
  return `<h3 style="margin:20px 0 6px">Reconciliation scoring</h3>
  <ul>
    <li>Discrepancies identified: ${escapeHtml(b.identified ?? 0)} (points ${escapeHtml(b.identification_points ?? 0)})</li>
    <li>Incorrect selections: ${escapeHtml(b.incorrect_selections ?? 0)}</li>
    <li>Corrective action points: ${escapeHtml(b.action_points ?? 0)}</li>
    <li>Corrected balance points: ${escapeHtml(b.balance_points ?? 0)}</li>
  </ul>`;
}

export function buildResultEmail({ candidate, title, clientName, status, result, mcqReview, gradedAt, isBattery = false }) {
  const name = `${candidate.first_name} ${candidate.surname}`.trim();
  const flags = result.critical_flags || [];
  const b = result.breakdown || {};
  const verdict = flags.length ? 'Review flags' : 'No critical flags';
  const subject = `[Assessment] ${title} — ${name}: ${result.overall_score}/100`;
  const scoring = isBattery || b.categories ? batteryScoringHtml(b) : v1ScoringHtml(b);
  const reviewTitle = isBattery || b.categories ? 'Item review' : 'Knowledge questions';

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1d2b3a">
  <h2 style="margin:0 0 4px">${escapeHtml(title)}</h2>
  <p style="margin:0 0 16px;color:#5b6876">Client: ${escapeHtml(clientName)} · Attempt status: ${escapeHtml(status)} · Graded: ${escapeHtml(gradedAt)}</p>
  <p><strong>Candidate:</strong> ${escapeHtml(name)} &lt;${escapeHtml(candidate.email)}&gt;</p>
  <p style="font-size:18px"><strong>Total: ${escapeHtml(result.overall_score)} / 100</strong>
    (knowledge ${escapeHtml(result.knowledge_score)} / 40, reconciliation ${escapeHtml(result.reconciliation_score)} / 60)</p>
  <p><strong>Flags:</strong> ${escapeHtml(verdict)}${flags.length ? ': ' + flags.map(escapeHtml).join('; ') : ''}</p>
  <p><strong>Interpretation:</strong> ${escapeHtml(result.interpretation)}</p>
  <h3 style="margin:20px 0 6px">${reviewTitle}</h3>
  <table style="border-collapse:collapse;width:100%;font-size:13px">${TABLE_HEAD}${itemRows(mcqReview)}</table>
  ${scoring}
  <p style="color:#5b6876;font-size:12px">Draft assessment content. Scores are not validated against job performance. Full detail, including the saved workbook, is in the admin platform at /admin/assessments.</p>
  </body></html>`;

  const text = [
    `${title} — ${name} <${candidate.email}>`,
    `Client: ${clientName} · Status: ${status} · Graded: ${gradedAt}`,
    `Total: ${result.overall_score}/100 (knowledge ${result.knowledge_score}/40, reconciliation ${result.reconciliation_score}/60)`,
    `Flags: ${verdict}${flags.length ? ': ' + flags.join('; ') : ''}`,
    `Interpretation: ${result.interpretation}`,
    '',
    ...mcqReview.map((q, i) => `${i + 1}. ${q.prompt}\n   Candidate: ${q.chosen}\n   Correct: ${q.expected} — ${q.correct ? 'Correct' : 'Incorrect'}`),
  ].join('\n');

  return { subject, html, text };
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
    'SELECT a.id, a.status, a.mcq_answers_json, a.structured_answers_json, a.workbook_json, c.first_name, c.surname, c.email, d.client_name, d.title, ' +
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
