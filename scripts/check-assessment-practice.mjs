// Input stays private: never print payloads, scoring keys, paths or exception details.
import { readFile } from 'node:fs/promises';
import { assertPracticeIsolation } from '../functions/lib/practice-isolation.js';
try {
  const path = process.argv[2] || process.env.PUBLISHED_ASSESSMENT_PAYLOAD_PATH;
  if (!path) throw new Error('missing input');
  const data = JSON.parse(await readFile(path, 'utf8'));
  assertPracticeIsolation(data.question_payload, data.scoring_key);
  console.log('PASS');
} catch {
  console.error('FAIL: Published practice isolation could not be verified.');
  process.exitCode = 1;
}
