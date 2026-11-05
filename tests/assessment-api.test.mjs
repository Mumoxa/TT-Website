import {screeningFixture} from './helpers/screening-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/assessment/[[path]].js';
import { tokenHash } from '../functions/lib/assessment-core.js';
import { sessionValue } from '../functions/lib/admin.js';
import { database } from './helpers/assessment-db.mjs';
import { SYNTHETIC } from './fixtures/synthetic-assessment.mjs';

const origin = 'https://assessment.example';
async function setup() {
  const db = database();
  const now = new Date().toISOString();
  db.sqlite.prepare('INSERT INTO assessment_definitions VALUES (?,?,?,?,600,?,?,?,?)').run('definition','synthetic','Demo','Synthetic test','version','published',now,now);
  db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)').run('version','definition','v1',JSON.stringify(SYNTHETIC.question_payload),JSON.stringify(SYNTHETIC.scoring_key),'v1',now,now);
  const env = { ASSESSMENT_ID_HASH_KEY:'synthetic-key-with-at-least32-characters-for-tests', ASSESSMENT_PII_KEY:btoa('0'.repeat(32)), ASSESSMENT_DB: db, ADMIN_KEY: 'synthetic-local-key', ASSESSMENT_ADMIN_KEY: 'independent-assessment-key' };
  async function call(path, body, cookie, extra = {}) {
    const headers = { Origin: origin, 'CF-Connecting-IP': '192.0.2.1', ...extra };
    if (cookie) headers.Cookie = cookie;
    const response = await onRequest({env,request:new Request(origin+'/api/assessment/'+path,{method:body === undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)})});
    return { status:response.status, data:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function invite(char='a', expires=Date.now()+86400000) {
    const token=char.repeat(64);
    db.sqlite.prepare('INSERT INTO invitations (id,definition_id,token_sha256,status,issued_at,expires_at,created_at) VALUES (?,?,?,\'issued\',?,?,?)').run(char,'definition',await tokenHash(token),now,new Date(expires).toISOString(),now);
    return token;
  }
  async function start(char='a') {
    const token = await invite(char);
    const result = await call('start',{...screeningFixture(char.charCodeAt(0)),invitation_token:token,first_name:'Synthetic',surname:'Candidate',email:'synthetic@example.invalid',consent_acknowledged:true,...screeningFixture()});
    assert.equal(result.status,200,JSON.stringify(result.data));return result;
  }
  return {db,env,call,invite,start};
}
const answers = (revision=0,attempt_id) => ({attempt_id,save_revision:revision,mcq:{q1:'a'},structured:{},workbook:{C2:'=SUM(B2:B3)'}});

test('real SQL start, autosave and refresh preserve exactly 600 seconds and private isolation', async () => {
  const t=await setup(); const a=await t.start();
  assert.equal(a.data.expires_at_ms-a.data.started_at_ms,600000);
  assert.equal((await t.call('save',answers(0,a.data.attempt_id),a.cookie)).status,200);
  const recovered=await t.call('me',undefined,a.cookie);
  assert.equal(recovered.data.responses.workbook.C2,'=SUM(B2:B3)');
  assert.equal(recovered.data.expires_at_ms,a.data.expires_at_ms);
  assert.equal(recovered.data.save_revision,1);
  assert.doesNotMatch(JSON.stringify(recovered.data),/scoring_key|DO_NOT_LEAK|overall_score|expected/);
  const b=await t.start('b');assert.deepEqual(b.data.responses.workbook,{});
  assert.equal((await t.call('me')).status,401);
  assert.equal((await t.call('admin/report/'+a.data.attempt_id,undefined,a.cookie)).status,401);
});

test('concurrent duplicate starts create only one candidate and attempt',async()=>{
 const t=await setup();const token=await t.invite();const body={invitation_token:token,first_name:'Synthetic',surname:'Candidate',email:'synthetic@example.invalid',consent_acknowledged:true,...screeningFixture()};
 const outcomes=await Promise.all([t.call('start',body),t.call('start',body)]);
 assert.equal(outcomes.filter(r=>r.status===200).length,1);
 assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM candidates').get().n,1);
});

test('concurrent submissions return the same receipt and one immutable final result',async()=>{
 const t=await setup();const a=await t.start();
 const responses=await Promise.all([t.call('submit',answers(0,a.data.attempt_id),a.cookie),t.call('submit',answers(0,a.data.attempt_id),a.cookie)]);
 assert.deepEqual(responses.map(r=>r.status),[200,200]);
 assert.ok(responses.every(r=>r.data.status==='completed'));
 assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM results').get().n,1);
 assert.equal((await t.call('submit',answers(100,a.data.attempt_id),a.cookie)).status,200);
 assert.equal((await t.call('save',answers(1,a.data.attempt_id),a.cookie)).status,409);
});

test('revision conflicts never overwrite saved work',async()=>{
 const t=await setup();const a=await t.start();
 const responses=await Promise.all([t.call('save',answers(0,a.data.attempt_id),a.cookie),t.call('save',{...answers(0,a.data.attempt_id),workbook:{C2:'999'}},a.cookie)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 assert.equal((await t.call('me',undefined,a.cookie)).data.responses.workbook.C2,'=SUM(B2:B3)');
});

test('deadline rejects late writes, grades saved state, and repairs a missing result',async()=>{
 const t=await setup();const a=await t.start();await t.call('save',answers(0,a.data.attempt_id),a.cookie);
 t.db.sqlite.prepare('UPDATE attempts SET started_at_ms=?, expires_at_ms=?').run(Date.now()-600001,Date.now()-1);
 assert.equal((await t.call('save',{...answers(1,a.data.attempt_id),mcq:{q1:'b'}},a.cookie)).status,409);
 assert.equal(t.db.sqlite.prepare('SELECT knowledge_score FROM results').get().knowledge_score,8);
 t.db.sqlite.exec('DELETE FROM results');
 assert.equal((await t.call('me',undefined,a.cookie)).data.status,'timed_out');
 assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM results').get().n,1);
});

test('unavailable invitations and other admin credentials fail closed',async()=>{
 const t=await setup();const token=await t.invite('a',Date.now()-1);
 assert.equal((await t.call('invite?token='+token)).status,404);
 assert.equal((await t.call('invite?token=invalid')).status,400);
 const offerCookie='tt_offer_admin='+await sessionValue(t.env.ADMIN_KEY);
 assert.equal((await t.call('admin/list',undefined,offerCookie)).status,401);
});

test('public invite probing is rate limited in the shared database',async()=>{
 const t=await setup();let result;
 for(let i=0;i<31;i++) result=await t.call('invite?token='+'f'.repeat(64));
 assert.equal(result.status,429);
 assert.equal((await t.call('invite?token='+'f'.repeat(64),undefined,undefined,{'CF-Connecting-IP':'192.0.2.2'})).status,404);
});

test('assessment admin login is independent and grants no offers cookie',async()=>{
 const t=await setup();
 assert.equal((await t.call('admin/login',{key:t.env.ADMIN_KEY})).status,401);
 const login=await t.call('admin/login',{key:t.env.ASSESSMENT_ADMIN_KEY});assert.equal(login.status,200);
 assert.match(login.cookie,/^tt_assessment_admin=/);assert.doesNotMatch(login.cookie,/tt_offer_admin/);
 assert.equal((await t.call('admin/list',undefined,login.cookie)).status,200);
});

test('an upload finishing at the deadline cannot mutate the last saved answers',async()=>{
 const t=await setup();const a=await t.start();await t.call('save',answers(0,a.data.attempt_id),a.cookie);
 // A slow network body reaches the server before expiry, but finishes after it.
 const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({...answers(1,a.data.attempt_id),mcq:{q1:'b'}})));t.db.sqlite.prepare('UPDATE attempts SET started_at_ms=?,expires_at_ms=?').run(Date.now()-600001,Date.now()-1);c.close();}});
 const response=await onRequest({env:t.env,request:new Request(origin+'/api/assessment/save',{method:'POST',headers:{Origin:origin,Cookie:a.cookie},body,duplex:'half'})});
 assert.equal(response.status,409);
 assert.equal(t.db.sqlite.prepare('SELECT mcq_answers_json FROM attempts').get().mcq_answers_json,'{"q1":"a"}');
});

test('private draft survives editing and cannot issue invitations before explicit approval',async()=>{
 const t=await setup();const admin=(await t.call('admin/login',{key:t.env.ASSESSMENT_ADMIN_KEY})).cookie;
 const headers={'x-tt-assessment-admin':'1'};
 const draft=await t.call('admin/draft',{...SYNTHETIC,slug:'draft-only'},admin,headers);assert.equal(draft.status,200);
 const read=await t.call('admin/draft/'+draft.data.version_id,undefined,admin);assert.deepEqual(read.data.package.scoring_key,SYNTHETIC.scoring_key);
 assert.equal((await t.call('admin/invite',{assessment_id:draft.data.assessment_id,intended_email:'demo@example.invalid'},admin,headers)).status,404);
 assert.equal((await t.call('admin/publish',{version_id:draft.data.version_id},admin,headers)).status,400);
 const published=await t.call('admin/publish',{version_id:draft.data.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic local test approval only'},admin,headers);assert.equal(published.status,200);
 assert.equal((await t.call('admin/invite',{assessment_id:draft.data.assessment_id,intended_email:'demo@example.invalid'},admin,headers)).status,200);
});

test('the SQL write boundary accepts 599999ms and rejects 600000ms and 600001ms',async()=>{
 const realNow=Date.now;
 try {
  for(const elapsed of [599999,600000,600001]){
   const t=await setup();const a=await t.start();const instant=a.data.started_at_ms+elapsed;
   Date.now=()=>instant;
   t.db.sqlite.function('strftime',{varargs:true},(format)=>format==='%s'?String(Math.floor(instant/1000)):'00.'+String(instant%1000).padStart(3,'0'));
   const result=await t.call('save',answers(0,a.data.attempt_id),a.cookie);
   assert.equal(result.status,elapsed===599999?200:409,'elapsed '+elapsed);
   assert.equal(t.db.sqlite.prepare('SELECT save_revision FROM attempts').get().save_revision,elapsed===599999?1:0);
   Date.now=realNow;
  }
 }finally{Date.now=realNow;}
});

test('an old tab cannot save its answers under a different candidate cookie',async()=>{
 const t=await setup();const a=await t.start();const b=await t.start('b');
 const response=await t.call('save',{...answers(0,a.data.attempt_id),attempt_id:a.data.attempt_id},b.cookie);
 assert.equal(response.status,409);
 assert.equal((await t.call('me',undefined,b.cookie)).data.save_revision,0);
});

test('revoking an invitation while Start is in flight cannot create an attempt',async()=>{
 const t=await setup();const token=await t.invite();const batch=t.db.batch;
 t.db.batch=async statements=>{t.db.sqlite.exec("UPDATE invitations SET status='revoked'");return batch(statements);};
 const result=await t.call('start',{invitation_token:token,first_name:'Synthetic',surname:'Candidate',email:'synthetic@example.invalid',consent_acknowledged:true,...screeningFixture()});
 assert.notEqual(result.status,200);assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM attempts').get().n,0);
});

test('admin report and dashboard repair interrupted grading without candidate return',async()=>{
 const t=await setup();const a=await t.start();await t.call('submit',answers(0,a.data.attempt_id),a.cookie);
 const admin=(await t.call('admin/login',{key:t.env.ASSESSMENT_ADMIN_KEY})).cookie;
 t.db.sqlite.exec('DELETE FROM results');
 const report=await t.call('admin/report/'+a.data.attempt_id,undefined,admin);
 assert.equal(report.data.result?.knowledge_score,8);
 t.db.sqlite.exec('DELETE FROM results');
 const list=await t.call('admin/list',undefined,admin);assert.equal(list.data.attempts[0].knowledge_score,8);
});

test('editing existing draft metadata round-trips without changing the published version',async()=>{
 const t=await setup();const admin=(await t.call('admin/login',{key:t.env.ASSESSMENT_ADMIN_KEY})).cookie;
 const draft=await t.call('admin/draft',{...SYNTHETIC,slug:'synthetic',title:'Updated synthetic assessment',client_name:'Updated demo'},admin,{'x-tt-assessment-admin':'1'});
 assert.equal(draft.status,200);
 const loaded=await t.call('admin/draft/'+draft.data.version_id,undefined,admin);
 assert.equal(loaded.data.package.title,'Updated synthetic assessment');assert.equal(loaded.data.package.client_name,'Updated demo');
 assert.equal(t.db.sqlite.prepare('SELECT title FROM assessment_definitions').get().title,'Synthetic test');
});

test('a candidate can retry the same ID repeatedly while start throttling is switched off', async () => {
 const t=await setup();const now=new Date().toISOString();const statuses=[];
 for(let i=0;i<35;i++){
  const hex=i.toString(16).padStart(2,'0');const token=hex.repeat(32);
  t.db.sqlite.prepare("INSERT INTO invitations (id,definition_id,token_sha256,status,issued_at,expires_at,created_at) VALUES (?,?,?,'issued',?,?,?)")
   .run('retry-'+i,'definition',await tokenHash(token),now,new Date(Date.now()+86400000).toISOString(),now);
  const result=await t.call('start',{...screeningFixture(),invitation_token:token,first_name:'Synthetic',surname:'Candidate',email:'synthetic@example.invalid',consent_acknowledged:true});
  statuses.push(result.status);
 }
 assert.ok(statuses.every(s=>s===200),JSON.stringify(statuses));
 assert.equal(t.db.sqlite.prepare('SELECT max(attempt_number) n FROM assessment_identity_attempts').get().n,35);
});
