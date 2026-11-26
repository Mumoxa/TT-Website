import {apiJson} from './assessment-core.js';
import {PERSONALITY_SLUG, PERSONALITY_FLOW_READY} from './hpi-personality.js';

// Public metadata only. Never spread a database row or a private version payload.
// A valid slug returns that one published assessment, whatever its position in the listing. Without
// a slug the listing is capped at 100 items. Only public metadata is ever selected.
export async function assessmentCatalog(db, slug = null, env = {}) {
  const exact = typeof slug === 'string' && /^[a-z0-9-]{3,60}$/.test(slug);
  const statement = db.prepare(
    'SELECT d.slug, d.title, d.client_name, d.duration_seconds, v.question_payload_json ' +
    'FROM assessment_definitions d JOIN assessment_versions v ON v.id=d.current_version_id ' +
    "WHERE d.status='published' AND v.published_at IS NOT NULL" +
    (exact ? ' AND d.slug=? ORDER BY d.slug' : ' ORDER BY d.title, d.slug LIMIT 100')
  );
  const rows = await (exact ? statement.bind(slug) : statement).all();
  return apiJson((rows.results || []).filter(row => row.slug !== PERSONALITY_SLUG || (PERSONALITY_FLOW_READY && env.ENABLE_HPI_PERSONALITY === 'true')).map(row => {
    const payload = JSON.parse(row.question_payload_json);
    if (payload.format === 'personality-v1') return {
      slug: row.slug, title: row.title, client_name: row.client_name, kind: 'personality',
      duration_minutes: Math.ceil(row.duration_seconds / 60), estimated_minutes: Math.ceil(row.duration_seconds / 60),
      section_titles: ['Self-description', ...(Array.isArray(payload.reasoning_sections) ? payload.reasoning_sections.map(s => typeof s?.title === 'string' ? s.title.slice(0, 120) : '') : [])],
      // Question counts only; the reasoning questions themselves are never in the public catalogue.
      item_count: 50 + (Array.isArray(payload.reasoning) ? payload.reasoning.length : 0),
    };
    const sections = payload.format === 'battery-v2' && Array.isArray(payload.sections) ? payload.sections : null;
    return {
      slug: row.slug,
      title: row.title,
      client_name: row.client_name,
      duration_minutes: Math.ceil(row.duration_seconds / 60),
      section_titles: sections ? sections.map(section => typeof section.title === 'string' ? section.title.slice(0, 120) : '') : ['Technical knowledge', 'Practical reconciliation'],
      item_count: sections ? sections.reduce((total, section) => total + (Array.isArray(section.items) ? section.items.length : 0), 0) : payload.questions.length + 1,
      // Candidate-facing instruction text, shown before the timer starts. Contains no answers.
      ...(sections && typeof payload.instructions === 'string' && payload.instructions.trim() ? { instructions: payload.instructions.trim().slice(0, 1500) } : {}),
    };
  }));
}
