import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { syntheticTablePackage } from './fixtures/synthetic-answer-table.mjs';
import { gradeBattery, validateBattery, publicBattery, cleanBatterySubmission, cleanBatteryWorkbook, batteryWorkbookRules } from '../functions/lib/battery.js';

const script = 'scripts/check-bookkeeping-package.mjs';
const check = path => spawnSync(process.execPath, [script, path], { encoding: 'utf8' });
const version = p => ({ payload: p.question_payload, key: p.scoring_key });
function answers(p) {
  const mcq = {}, workbook = {};
  for (const section of p.question_payload.sections) for (const item of section.items) {
    if (item.type === 'single') mcq[item.id] = p.scoring_key.items[item.id].answer;
    if (item.type === 'cell') workbook[item.ref] = String(p.scoring_key.items[item.id].answer);
  }
  return { mcq, workbook };
}
test('private checker enforces caps and the table without leaking content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'assessment-check-'));
  try {
    const path = join(dir, 'private.json'), pkg = syntheticTablePackage();
    const save = () => writeFile(path, JSON.stringify(pkg));
    await save(); assert.equal(check(path).status, 0);
    pkg.question_payload.sections[0].items[0].points = 5;
    await save(); assert.notEqual(check(path).status, 0);
    pkg.question_payload.sections[0].items[0].points = 4;
    pkg.scoring_key.items[pkg.question_payload.sections[0].items[0].id].answer = 'private-secret-marker';
    await save(); const failed = check(path);
    assert.notEqual(failed.status, 0);
    assert.doesNotMatch(failed.stderr + failed.stdout, /private-secret-marker|private\.json/);
    assert.notEqual(check('tests/fixtures/synthetic-battery.mjs').status, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('table answers save and score each side and amount independently without exposing the key', () => {
  const p = syntheticTablePackage(), valid = validateBattery(p), pub = publicBattery(valid.question_payload), a = answers(p);
  assert.equal(pub.sections[3].answer_table.rows.length, 8);
  assert.doesNotMatch(JSON.stringify(pub), /"answer"|"points"|"unsafe"|"category"/);
  assert.deepEqual(cleanBatterySubmission(a, pub).mcq, a.mcq);
  assert.deepEqual(cleanBatteryWorkbook(a.workbook, batteryWorkbookRules(pub)), a.workbook);
  assert.equal(gradeBattery(version(p), a).overall_score, 100);
  assert.equal(gradeBattery(version(p), {}).overall_score, 0);
  const row = p.question_payload.sections[3].answer_table.rows[0];
  a.mcq[row.side] = 'o2';
  assert.equal(gradeBattery(version(p), a).overall_score, 98);
  delete a.workbook[p.question_payload.sections[3].items.find(i => i.id === row.amount).ref];
  assert.equal(gradeBattery(version(p), a).overall_score, 96);
});
test('table validation rejects malformed rows and shared or ambiguous cells', () => {
  const p = syntheticTablePackage(), trial = p.question_payload.sections[3];
  trial.answer_table.rows[1].side = trial.answer_table.rows[0].side;
  assert.throws(() => validateBattery(p), /Invalid answer table row/);
  const q = syntheticTablePackage(), t = q.question_payload.sections[3];
  q.scoring_key.items[t.answer_table.rows[0].amount].answer = 0;
  assert.throws(() => validateBattery(q), /positive numeric keys/);
  const r = syntheticTablePackage(), s = r.question_payload.sections[3];
  s.items.find(i => i.id === s.answer_table.rows[1].amount).ref = s.items.find(i => i.id === s.answer_table.rows[0].amount).ref;
  assert.throws(() => validateBattery(r), /unique rand cells/);
  const d = syntheticTablePackage(); d.question_payload.workbook.display = 'grid'; delete d.question_payload.workbook.documents;
  assert.throws(() => validateBattery(d), /Invalid answer table/);
});
