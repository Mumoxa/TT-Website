import {readFileSync} from 'node:fs';
import {database} from './assessment-db.mjs';

// The assessment schema plus the personality migrations, as production would have them.
// publish:true simulates an admin publishing the draft created by migration 0009.
export function personalityDatabase({publish = true} = {}) {
  const db = database();
  for (const file of ['0005_automated_note_scoring.sql', '0006_hpi_research.sql', '0007_workplace_personality.sql', '0009_workplace_personality_definition.sql']) {
    db.sqlite.exec(readFileSync(new URL(`../../migrations/assessments/${file}`, import.meta.url), 'utf8'));
  }
  if (publish) {
    db.sqlite.exec("UPDATE assessment_versions SET published_at='2026-11-25T00:00:00.000Z' WHERE definition_id='6f1c2a90-9b5e-4c1d-8e3a-0d7b5a2f4c11'");
    db.sqlite.exec("UPDATE assessment_definitions SET status='published', current_version_id='6f1c2a90-9b5e-4c1d-8e3a-0d7b5a2f4c12' WHERE slug='workplace-personality-profile'");
  }
  const env = {ASSESSMENT_DB: db, ASSESSMENT_ID_HASH_KEY: 'synthetic-key-with-at-least32-characters-for-tests', ASSESSMENT_PII_KEY: btoa('0'.repeat(32))};
  return {db, env};
}
