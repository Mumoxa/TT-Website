/* Parallel forms (pure logic, plus two small D1 reads). See migrations/assessments/0010_assessment_forms.sql.
 *
 * An assessment may hold several active forms (A, B, C...). A start draws at random from the active forms the
 * person (ID hash) has not taken for that assessment. "Taken" is decided by form label, so a corrected version of
 * a form still counts as the form the person already saw. An assessment with no forms keeps its current version.
 */

export const FORM_LABELS = ['A', 'B', 'C', 'D', 'E'];

/* The blueprint a parallel form must share: the same sections, and in each the same item types, categories and
   points in the same order (and the same line count for line matching). Wording, figures, parties, option text
   and answer positions are free to differ, which is the point of a parallel form. */
export function formShape(payload) {
  if (!payload || !Array.isArray(payload.sections)) return null;
  return JSON.stringify({
    format: payload.format || null,
    display: payload.workbook?.display || 'grid',
    sections: payload.sections.map((s) => (s.items || []).map((i) => [
      i.type, i.category, i.points, i.type === 'match' ? (i.lines || []).length : null,
      i.type === 'single' || i.type === 'multi' ? (i.options || []).length : null,
    ])),
  });
}

/* Picks a form at random from those not yet taken. `random` returns a number in [0, 1).
   Returns { form } when one is available, { exhausted: true } when every active form has been taken, and
   { none: true } when the assessment has no forms (the caller then uses the current version). */
export function chooseForm(activeForms, takenLabels, random = Math.random) {
  if (!Array.isArray(activeForms) || activeForms.length === 0) return { none: true };
  const taken = new Set(takenLabels || []);
  const open = activeForms.filter((f) => !taken.has(f.form_label));
  if (!open.length) return { exhausted: true };
  const index = Math.min(open.length - 1, Math.floor(random() * open.length));
  return { form: open[index] };
}

/* Unbiased enough for choosing among a handful of forms; uses the platform CSPRNG where available. */
export function secureRandom() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 2 ** 32; }
  return Math.random();
}

export async function activeForms(db, definitionId) {
  const rows = await db.prepare('SELECT version_id, form_label FROM assessment_forms WHERE definition_id=? AND active=1 ORDER BY form_label')
    .bind(definitionId).all();
  return rows?.results || [];
}

/* Form labels this person has already been given for this assessment, from every earlier attempt. */
export async function takenFormLabels(db, definitionId, idHash) {
  const rows = await db.prepare(
    'SELECT DISTINCT f.form_label FROM assessment_identity_attempts h ' +
    'JOIN attempts a ON a.candidate_id=h.candidate_id ' +
    'JOIN assessment_forms f ON f.version_id=a.version_id AND f.definition_id=h.definition_id ' +
    'WHERE h.definition_id=? AND h.id_hash=?'
  ).bind(definitionId, idHash).all();
  return (rows?.results || []).map((r) => r.form_label);
}

/* The form label of one version, for reports and emails. */
export async function formLabelOf(db, versionId) {
  const row = await db.prepare('SELECT form_label FROM assessment_forms WHERE version_id=? LIMIT 1').bind(versionId).first();
  return row?.form_label || null;
}
