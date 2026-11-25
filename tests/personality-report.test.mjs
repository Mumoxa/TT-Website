import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPersonalityReport,spectrumPosition,DIMENSIONS} from '../src/assessments/personality-report-model.js';
import {samples,invalid} from './fixtures/personality-report-samples.mjs';
import source from '../functions/lib/hpi-personality-source.js';
import {scorePersonality} from '../functions/lib/hpi-personality.js';

test('continuous positions have a true 1–5 scale and invalid data are rejected',()=>{
 for (const [score,position] of [[1,0],[2,.25],[3,.5],[4,.75],[5,1],[2.4,.35],[3.8,.7]]) assert.ok(Math.abs(spectrumPosition(score)-position)<1e-10);
 for (const x of [0,5.1,NaN,Infinity,'3',null]) assert.throws(()=>spectrumPosition(x));
 assert.throws(()=>buildPersonalityReport(invalid));
});
test('IPIP official factor key distributions and reverse-scoring arithmetic',()=>{
 assert.deepEqual([1,2,3,4,5].map(f=>source.items.filter(i=>i.factor===f && i.key==='+').length),[5,6,6,2,7]);
 const pos=Object.fromEntries(source.items.map(i=>['b'+i.n,i.key==='+'?'o5':'o1']));
 const neg=Object.fromEntries(source.items.map(i=>['b'+i.n,i.key==='+'?'o1':'o5']));
 assert.deepEqual(scorePersonality(pos).factors.map(f=>f.mean),[5,5,5,5,5]);
 assert.deepEqual(scorePersonality(neg).factors.map(f=>f.mean),[1,1,1,1,1]);
});
test('sample profile is specific, deterministic, private and never a ranking of strengths',()=>{
 const a=buildPersonalityReport(samples.mock); assert.deepEqual(a,buildPersonalityReport(samples.mock));
 assert.deepEqual(a.highlights.top,['Intellect/Imagination']);
 assert.deepEqual(a.highlights.midpoint,['Extraversion','Conscientiousness']);
 assert.match(a.dimensions[1].interpretation,/slight lean/); assert.match(a.dimensions[3].interpretation,/emotional responsiveness/);
 assert.equal(a.submitted_at,'25 Nov 2026, 15:11 UTC');
 assert.doesNotMatch(JSON.stringify(a),/not-for-report|9876|1111|private transport/);
 assert.match(a.summary,/not ranked strengths/); assert.match(a.summary,/self-reported/);
});
test('midpoint tolerance is symmetric and does not create abrupt categories at 3',()=>{
 const d=structuredClone(samples.midpoint); d.personality.factors[0].mean=2.99; d.personality.factors[1].mean=3.01;
 const a=buildPersonalityReport(d); assert.equal(a.dimensions[0].interpretation,a.dimensions[1].interpretation);
});
test('missing and partial scores are never treated as complete',()=>{
 const partial=buildPersonalityReport(samples.incomplete).dimensions[1];
 assert.equal(partial.score,null); assert.equal(partial.position,null); assert.equal(partial.partial,true); assert.equal(partial.answered,4);
 const empty=buildPersonalityReport(samples.unavailable); assert.ok(empty.dimensions.every(d=>d.score===null && d.answered===null));
 assert.match(empty.summary,/not available/);
 const corrupt=structuredClone(samples.mock); corrupt.personality.factors[0].answered=0;
 assert.throws(()=>buildPersonalityReport(corrupt));
 const duplicate=structuredClone(samples.mock); duplicate.personality.factors[1].name=DIMENSIONS[0].name;
 assert.throws(()=>buildPersonalityReport(duplicate));
 const inconsistent=structuredClone(samples.mock); inconsistent.personality.attempted=49;
 assert.throws(()=>buildPersonalityReport(inconsistent));
});
test('questions are deterministic, score-sensitive and neutral when evidence is incomplete',()=>{
 const low=buildPersonalityReport(samples.lower), high=buildPersonalityReport(samples.upper), mid=buildPersonalityReport(samples.midpoint), partial=buildPersonalityReport(samples.incomplete);
 assert.ok(low.dimensions.every((d,i)=>d.question!==high.dimensions[i].question));
 assert.equal(partial.dimensions[1].question,mid.dimensions[1].question);
 const near=structuredClone(samples.midpoint); near.personality.factors[0].mean=2.99;
 assert.equal(buildPersonalityReport(near).dimensions[0].question,mid.dimensions[0].question);
});
