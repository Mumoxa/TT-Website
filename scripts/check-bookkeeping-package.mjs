// Validate an externally authored package without printing private content or paths.
// This is a local check only; it never writes to D1 or publishes an assessment.
import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve, isAbsolute } from 'node:path';
import { validateAssessmentPackage } from '../functions/lib/assessment-core.js';
import { assertPracticeIsolation } from '../functions/lib/practice-isolation.js';

try {
  if (!process.argv[2] || process.argv.length !== 3) throw new Error('input');
  const root = await realpath(resolve(import.meta.dirname, '..'));
  const file = await realpath(process.argv[2]);
  const rel = relative(root, file);
  if (!rel || (!rel.startsWith('..' + '/') && rel !== '..' && !isAbsolute(rel))) throw new Error('private input required');
  const pkg = JSON.parse(await readFile(file, 'utf8'));
  if (pkg.slug !== 'bookkeeping-to-trial-balance' || !pkg.title?.trim() || !pkg.client_name?.trim() || pkg.question_payload?.format !== 'battery-v2') throw new Error('metadata');
  validateAssessmentPackage(pkg);
  // The shared engine normalises 40/60 by category. Require matching raw point
  // caps so its normalisation is the identity for this particular form.
  const sections = pkg.question_payload.sections;
  const expected = new Map([['principles', 20], ['journals', 12], ['ledger', 4], ['trial-balance', 44], ['controls', 20]]);
  if (sections.length !== expected.size || new Set(sections.map(s => s.id)).size !== expected.size) throw new Error('sections');
  for (const section of sections) {
    const category = ['principles', 'controls'].includes(section.id) ? 'knowledge' : 'reconciliation';
    if (!expected.has(section.id) || section.items.some(item => item.category !== category) || section.items.reduce((sum, item) => sum + item.points, 0) !== expected.get(section.id)) throw new Error('weighting');
  }
  const trialBalance = sections.find(section => section.id === 'trial-balance');
  if (sections.reduce((sum, section) => sum + section.items.length, 0) !== 30 || trialBalance.items.length !== 18 || trialBalance.answer_table?.rows?.length !== 8) throw new Error('trial balance structure');
  assertPracticeIsolation(pkg.question_payload, pkg.scoring_key);
  console.log('PASS: package structure and practice isolation. Content and privacy approval remain required.');
} catch {
  console.error('FAIL: package validation could not be completed. Use an external private JSON package and review it locally.');
  process.exitCode = 1;
}
