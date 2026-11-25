import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticHrPackage } from './fixtures/synthetic-hr.mjs';
import { validateHrGeneralist, publicHrGeneralist, publicHrStep, cleanHrSubmission, gradeHrGeneralist, combineHrScores, validateHrReview } from '../functions/lib/hr-generalist.js';
import { simpleFormulaReferences } from '../src/assessments/formulas.js';
import { validateAssessmentPackage } from '../functions/lib/assessment-core.js';
import { SYNTHETIC } from './fixtures/synthetic-assessment.mjs';

function setup() {
  const pkg = syntheticHrPackage();
  validateHrGeneralist(pkg);
  const payload = publicHrGeneralist(pkg.question_payload);
  const answers = {HR01:Object.fromEntries(pkg.question_payload.modules[0].source.map(row=>[row.id,{...row,reviewed:true,file_status:'complete',missing_documents:[]}])) , HR02:{scenarios:Object.fromEntries(payload.modules[1].scenarios.map(s=>[s.id,'A'])),priorities:['P1','P2']},HR03:Object.fromEntries([...payload.modules[2].items,...payload.modules[2].rule_items].map(i=>[i.id,'A'])),HR04:{subject:'Example',body:'Synthetic email'},HR05:{payroll:{PAY01:'10',PAY02:'10%',PAY03:'A'}}};
  const cleaned = cleanHrSubmission({structured:{hr:answers}},payload);
  const workbook = {E2:'=B2+C2-D2',E3:'=B3+C3-D3',E4:'=B4+C4-D4',E5:'=SUM(E2:E4)'};
  return {pkg,payload,cleaned,workbook};
}
function grade(s) { return gradeHrGeneralist(s.pkg.question_payload,s.pkg.scoring_key,s.cleaned,s.workbook,{HR01:120}); }

test('synthetic full response awards 85 objective points and waits for human review', () => {
  const s=setup(), result=grade(s);
  assert.equal(result.objective_score,85); assert.equal(result.total_score,null); assert.equal(result.score_status,'pending_review');
  assert.equal(result.modules[0].evidence.discrepancies_corrected,6);
  assert.equal(result.modules[0].evidence.correct_verified_fields_per_minute,10);
  const review = validateHrReview(s.pkg.scoring_key.modules.HR04.criteria,{criteria:Object.fromEntries(s.pkg.scoring_key.modules.HR04.criteria.map(c=>[c.id,c.max])),rationale:'Synthetic review rationale',reviewer:'Reviewer'});
  assert.equal(review.earned,15); assert.equal(combineHrScores(result,review.earned).total_score,100);
  assert.throws(()=>combineHrScores(result,16)); assert.throws(()=>combineHrScores(result,-1));
});

test('incomplete and malformed inputs do not gain points or bypass review', () => {
  const s=setup();
  const empty=cleanHrSubmission({},s.payload);
  const result=gradeHrGeneralist(s.pkg.question_payload,s.pkg.scoring_key,empty,{}, {HR01:60});
  assert.equal(result.objective_score,0); assert.equal(result.modules[0].evidence.correct_verified_fields_per_minute,0); assert.equal(result.total_score,null);
  assert.throws(()=>cleanHrSubmission({structured:{hr:{HR02:{priorities:['P1','P1']}}}},s.payload));
  assert.throws(()=>cleanHrSubmission({structured:{hr:{HR02:{priorities:['P1','P2','P3']}}}},s.payload));
  assert.throws(()=>cleanHrSubmission({structured:{hr:{HR05:{payroll:{PAY01:'ten'}}}}},s.payload));
  assert.equal(cleanHrSubmission({structured:{hr:{HR05:{payroll:{PAY01:'10,00'}}}}},s.payload).HR05.payroll.PAY01,'10,00');
  assert.throws(()=>validateHrReview(s.pkg.scoring_key.modules.HR04.criteria,{criteria:{},rationale:'incomplete',reviewer:'Reviewer'}));
});

test('scenario partial points and flags are independently recorded', () => {
  const s=setup(); s.cleaned.HR02.scenarios.S1='B'; s.cleaned.HR02.scenarios.S2='C';
  const result=grade(s), mod=result.modules[1];
  assert.equal(mod.points,19); assert.deepEqual(mod.rows.slice(0,2).map(r=>r.points),[2,0]);
  assert.deepEqual(result.critical_flags.map(f=>f.item_id),['S2']);
  const pending=combineHrScores(result,15);
  assert.equal(pending.total_score,null); assert.equal(pending.score_status,'review_required');
  result.critical_flags[0].status='reviewed';
  assert.equal(combineHrScores(result,15).total_score,result.objective_score+15);
});

test('formula method rejects constants, unrelated cells and wrong dependencies', () => {
  const s=setup();
  assert.deepEqual(simpleFormulaReferences('=SUM(E2:E4)'),['E2','E3','E4']);
  for (const formula of ['=2','=B2-B2+2','=B2+C2-D2+F1','=B2-C2+D2','=SUM(1,1)','=B3+C3-D3']) {
    s.workbook.E2=formula;
    const cell=grade(s).modules[4].evidence.cells.E2;
    assert.equal(cell.formula_ok,false,formula);
  }
  s.workbook.E2='=B2+C2-D2'; s.workbook.E5='=E2+E3+E4';
  assert.equal(grade(s).modules[4].evidence.cells.E5.formula_ok,true);
  s.workbook.E2='1';
  assert.equal(grade(s).modules[4].evidence.cells.E5.formula_ok,true, 'method credit independent of preceding value');
});

test('step projection never includes future or past modules', () => {
  const {question_payload}=syntheticHrPackage();
  assert.deepEqual(publicHrStep(question_payload,'INTRO').modules,[]);
  assert.deepEqual(publicHrStep(question_payload,'HR03').modules.map(m=>m.id),['HR03']);
  assert.throws(()=>publicHrStep(question_payload,'not-a-step'));
});

test('unfinished HR package is not accepted by the existing live package path', () => {
  assert.throws(() => validateAssessmentPackage(syntheticHrPackage()));
  const hybrid=structuredClone(SYNTHETIC); hybrid.question_payload.format='hr-generalist-v1';
  assert.throws(() => validateAssessmentPackage(hybrid), /not available/);
});

test('projection omits private fields and validation rejects broken packages', () => {
  const pkg=syntheticHrPackage(); pkg.question_payload.modules[0].source[0].secret='sentinel-private-value';
  const exposed=JSON.stringify(publicHrGeneralist(pkg.question_payload));
  assert.equal(exposed.includes('sentinel-private-value'),false); assert.equal(exposed.includes('Private synthetic instruction'),false);
  const bad=syntheticHrPackage(); bad.question_payload.modules[0].initial[1]=bad.question_payload.modules[0].initial[0];
  assert.throws(()=>validateHrGeneralist(bad));
  const badScore=syntheticHrPackage(); badScore.scoring_key.modules.HR02.scenarios.S1.option_points.B=9;
  assert.throws(()=>validateHrGeneralist(badScore));
  const badCells=syntheticHrPackage(); badCells.question_payload.modules[4].workbook.source.E2='2';
  assert.throws(()=>validateHrGeneralist(badCells));
});
