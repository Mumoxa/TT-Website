import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReasoningPackage,publicReasoningPackage,normalizeReasoningAnswers,scoreReasoningPackage,loadReasoningPackage,reasoningPackageFingerprint} from '../functions/lib/wpp-v2-reasoning.js';

// Artificial fixture: placeholders only, not real or replacement assessment content.
const synthetic = () => ({version:'synthetic-fixture-1', sections:['numeric','cognitive'].map((id) => ({id,title:`Synthetic ${id}`,instructions:'Synthetic instructions',items:Array.from({length:6},(_,i)=>({id:(id==='numeric'?'n':'c')+(i+1),prompt:`Synthetic item ${i+1}`,options:['a','b','c','d'].map(id=>({id,label:`Synthetic option ${id}`})),key:'a', extraPrivate:'PRIVATE_SENTINEL'}))}))});

test('public reasoning is strictly projected and never contains keys or unknown fields',()=>{
 const result=publicReasoningPackage(synthetic());
 assert.equal(result.sections.length,2);
 assert.equal(result.sections.flatMap(s=>s.items).length,12);
 assert.doesNotMatch(JSON.stringify(result),/"key"|PRIVATE_SENTINEL|extraPrivate/);
});
test('raw scores count answered items, reject malformed and alien answers',()=>{
 const pkg=synthetic();
 const normalized=normalizeReasoningAnswers(pkg,{n1:'a',n2:'b',c1:'a'});
 assert.equal(Object.keys(normalized).length,12);
 assert.equal(normalized.n3,null);
 assert.deepEqual(scoreReasoningPackage(pkg,{n1:'a',n2:'b',c1:'a'}),{
  numeric:{title:'Synthetic numeric',correct:1,attempted:2,total:6},
  cognitive:{title:'Synthetic cognitive',correct:1,attempted:1,total:6},
 });
 for(const bad of [{z1:'a'},{n1:'x'},{n1:1},null,[]]) assert.throws(()=>normalizeReasoningAnswers(pkg,bad));
});
test('package loading fails closed without exposing content in error messages',()=>{
 const pkg=synthetic();
 assert.deepEqual(loadReasoningPackage({WPP_REASONING_PACKAGE:JSON.stringify(pkg)}),validateReasoningPackage(pkg));
 for(const bad of [undefined,'','not json',JSON.stringify({...pkg,version:'INVALID'}),JSON.stringify({...pkg,sections:[]})]) {
  assert.throws(()=>loadReasoningPackage({WPP_REASONING_PACKAGE:bad}),{message:'Invalid private reasoning package.'});
 }
 const duplicate=synthetic(); duplicate.sections[0].items[1].id='n1'; assert.throws(()=>validateReasoningPackage(duplicate));
 const badKey=synthetic(); badKey.sections[0].items[0].key='z'; assert.throws(()=>validateReasoningPackage(badKey));
});
test('fingerprints are stable and bind all scoring and display content',async()=>{
 const a=synthetic(), b=synthetic(), secret='test-only-key-that-is-at-least-32-characters';
 assert.equal(await reasoningPackageFingerprint(a,secret),await reasoningPackageFingerprint(b,secret));
 b.sections[0].items[0].key='b';
 assert.notEqual(await reasoningPackageFingerprint(a,secret),await reasoningPackageFingerprint(b,secret));
 await assert.rejects(()=>reasoningPackageFingerprint(a,'short'));
});
