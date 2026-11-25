import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './helpers/assessment-db.mjs';
import {syntheticHrPackage} from './fixtures/synthetic-hr.mjs';
import {initialiseHrState,readHrState,saveHrStep,advanceHrStep,sweepDueHrStates} from '../functions/lib/hr-pilot-store.js';

function setup() {
  const db=database();
  db.sqlite.exec(readFileSync(new URL('../migrations/assessments/0008_hr_pilot_state.sql',import.meta.url),'utf8'));
  const p=syntheticHrPackage(), at='2027-01-01T00:00:00.000Z';
  db.sqlite.prepare('INSERT INTO assessment_definitions VALUES (?,?,?,?,?,?,?,?,?)').run('d','synthetic-hr','Demo','Synthetic HR',1200,'v','pilot',at,at);
  db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)').run('v','d','synthetic',JSON.stringify(p.question_payload),JSON.stringify(p.scoring_key),'hr-generalist-v1',null,at);
  db.sqlite.prepare('INSERT INTO candidates (id,first_name,surname,email,privacy_notice_version,consent_recorded_at,created_at) VALUES (?,?,?,?,?,?,?)').run('c','Test','Candidate','test@example.invalid','test',at,at);
  db.sqlite.prepare('INSERT INTO invitations (id,definition_id,token_sha256,status,issued_at,expires_at,created_at) VALUES (?,?,?,?,?,?,?)').run('i','d','hash','redeemed',at,at,at);
  const start=2_000_000;
  db.sqlite.prepare('INSERT INTO attempts (id,invitation_id,candidate_id,definition_id,version_id,session_token_sha256,status,started_at_ms,expires_at_ms,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('a','i','c','d','v','session','active',start,start+1200000,at,at);
  let now=start;
  db.sqlite.function('strftime',{varargs:true},format=>format==='%s'?String(Math.floor(now/1000)):'00.'+String(now%1000).padStart(3,'0'));
  return {db,start,setNow:(t)=>{now=t;}};
}

test('SQL persists independent module snapshots with CAS and immutable closed steps',async()=>{
  const t=setup(); let state=await initialiseHrState(t.db,'a');
  assert.equal(state.clock.step.id,'INTRO');
  let advance=await advanceHrStep(t.db,'a',state.revision,'INTRO'); state=advance.state;
  assert.equal(state.clock.step.id,'HR01');
  const original={ 'EMP-201':{reviewed:true,file_status:'complete',missing_documents:[]} };
  const results=await Promise.all([saveHrStep(t.db,'a',state.revision,'HR01',original),saveHrStep(t.db,'a',state.revision,'HR01',{'EMP-201':{reviewed:false}})]);
  assert.equal(results.filter(r=>r.ok).length,1); assert.equal(results.filter(r=>r.conflict).length,1);
  state=await readHrState(t.db,'a'); assert.deepEqual(state.responses.HR01['EMP-201'],original['EMP-201']);
  state=(await advanceHrStep(t.db,'a',state.revision,'HR01')).state;
  assert.equal(state.clock.step.id,'HR02');
  assert.equal((await saveHrStep(t.db,'a',state.revision,'HR01',{})).ok,false);
  await assert.rejects(()=>saveHrStep(t.db,'a',state.revision,'HR02',{}, {E2:'99'}));
  state=(await saveHrStep(t.db,'a',state.revision,'HR02',{scenarios:{S1:'B'}})).state;
  assert.equal(state.responses.HR01['EMP-201'].reviewed,true);
  assert.equal(state.responses.HR02.scenarios.S1,'B');
});

test('SQL cutoff rejects late saves, advances from deadlines, and preserves last snapshot',async()=>{
  const t=setup(); let state=await initialiseHrState(t.db,'a');
  t.setNow(t.start+60_000); state=await readHrState(t.db,'a');
  assert.equal(state.clock.step.id,'HR01');
  t.setNow(t.start+299_999);
  state=(await saveHrStep(t.db,'a',state.revision,'HR01',{'EMP-201':{reviewed:true}})).state;
  t.setNow(t.start+300_000);
  const late=await saveHrStep(t.db,'a',state.revision,'HR01',{'EMP-201':{reviewed:false}});
  assert.equal(late.ok,false); assert.equal(late.state.clock.step.id,'HR02');
  assert.equal(late.state.responses.HR01['EMP-201'].reviewed,true);
  t.setNow(t.start+2_000_000); state=await readHrState(t.db,'a');
  assert.equal(state.clock.status,'submitted'); assert.equal(state.clock.submitted_at_ms,t.start+1_200_000);
  assert.equal((await advanceHrStep(t.db,'a',state.revision,'HR05')).ok,false);
});

test('database cutoff rejects a body that finishes just before a slow write crosses the deadline',async()=>{
  const t=setup(); let state=await initialiseHrState(t.db,'a');
  t.setNow(t.start+60_000); state=await readHrState(t.db,'a');
  t.setNow(t.start+299_999);
  const prepare=t.db.prepare.bind(t.db); let delayed=false;
  t.db.prepare=(sql)=>{
    const statement=prepare(sql);
    if (!delayed && sql.startsWith('UPDATE hr_pilot_attempt_state SET responses_json=')) {
      delayed=true; const run=statement.run.bind(statement);
      statement.run=async()=>{t.setNow(t.start+300_000); return run();};
    }
    return statement;
  };
  const response=await saveHrStep(t.db,'a',state.revision,'HR01',{'EMP-201':{reviewed:true}});
  assert.equal(response.ok,false);
  assert.deepEqual(response.state.responses,{});
  assert.equal(response.state.clock.step.id,'HR02');
});

test('bounded expiry sweep finalises without a candidate reconnect',async()=>{
  const t=setup(); await initialiseHrState(t.db,'a');
  assert.equal(await sweepDueHrStates(t.db),0);
  t.setNow(t.start+1_200_000);
  assert.equal(await sweepDueHrStates(t.db),1);
  assert.equal((await readHrState(t.db,'a')).clock.status,'submitted');
  assert.equal(await sweepDueHrStates(t.db),0);
  await assert.rejects(()=>sweepDueHrStates(t.db,101));
});

test('parent invalidation blocks further writes; unrelated engines cannot initialise',async()=>{
  const t=setup(); let state=await initialiseHrState(t.db,'a');
  t.db.sqlite.prepare("UPDATE attempts SET status='void' WHERE id='a'").run();
  await assert.rejects(()=>advanceHrStep(t.db,'a',state.revision,'INTRO'));
  t.db.sqlite.prepare("DELETE FROM hr_pilot_attempt_state WHERE attempt_id='a'").run();
  await assert.rejects(()=>initialiseHrState(t.db,'a'));
});
