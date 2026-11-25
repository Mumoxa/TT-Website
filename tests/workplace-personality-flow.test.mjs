import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/assessment/[[path]].js';
import {notifyPendingPersonality} from '../functions/lib/workplace-personality-flow.js';
import {screeningFixture} from './helpers/screening-fixture.mjs';
import {personalityDatabase} from './helpers/personality-db.mjs';
import {PERSONALITY_NOTICE_VERSION} from '../src/assessments/personality-notice.js';

const base='https://assessment.example', slug='workplace-personality-profile';
const mail={RESEND_API_KEY:'key',ASSESSMENT_FROM_EMAIL:'sender@example.invalid',ASSESSMENT_RESULTS_TO:'recruiter@example.invalid'};

function client(initialEnv) {
  let cookie='';
  const tasks=[];
  const call = async (path, body, method = body === undefined ? 'GET' : 'POST', env = initialEnv) => {
    const headers={Origin:base,...(cookie?{Cookie:cookie}:{})};
    const response=await onRequest({env,request:new Request(base+'/api/assessment/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),waitUntil(task){tasks.push(task);}});
    const set=response.headers.get('Set-Cookie'); if(set) cookie=set.split(';')[0];
    return {status:response.status, body:await response.json()};
  };
  // Wait for the request-time notifier (context.waitUntil) so it never races the test's own queue run.
  call.settle=()=>Promise.all(tasks.splice(0));
  return call;
}
const start=(seed=0,extra={})=>({assessment_slug:slug,first_name:'Synthetic',surname:'Candidate',email:'candidate@example.invalid',consent_acknowledged:true,personality_notice_version:PERSONALITY_NOTICE_VERSION,...screeningFixture(seed),...extra});

test('full candidate cycle: register, answer, resume, submit; scores go only to the recruiter email, once', async () => {
  const {db,env}=personalityDatabase({publish:true});
  // Candidate requests run without mail credentials so the request-time notifier stays offline;
  // the test then drives the queue itself with a fake transport.
  const vars={...env,...mail,ENABLE_HPI_PERSONALITY:'true'};
  const call=client({...env,ENABLE_HPI_PERSONALITY:'true'});

  const started=await call('start',start());
  assert.equal(started.status,200);
  assert.equal(started.body.assessment.format,'personality-v1');
  assert.equal(started.body.assessment.items.length,50);
  // The browser never receives scoring directions or factors.
  assert.doesNotMatch(JSON.stringify(started.body.assessment),/factor|"key"|"sign"|"[+-]"/);
  assert.deepEqual(started.body.personality,{status:'draft',revision:0,answers:{}});
  const attemptId=started.body.attempt_id;
  const notice=db.sqlite.prepare('SELECT c.privacy_notice_version AS v FROM candidates c JOIN attempts a ON a.candidate_id=c.id WHERE a.id=?').get(attemptId).v;
  assert.equal(notice,PERSONALITY_NOTICE_VERSION);

  const saved=await call('save',{attempt_id:attemptId,save_revision:0,answers:{b1:'o5',b6:'o1'}});
  assert.equal(saved.status,200); assert.equal(saved.body.save_revision,1);
  const stale=await call('save',{attempt_id:attemptId,save_revision:0,answers:{b1:'o1'}});
  assert.equal(stale.status,409);
  const bad=await call('save',{attempt_id:attemptId,save_revision:1,answers:{b1:'o9'}});
  assert.equal(bad.status,400);

  // Resume in the same session returns the candidate's own saved answers, never a result.
  const resumed=await call('me');
  assert.deepEqual(resumed.body.personality.answers.b1,'o5');
  assert.equal(resumed.body.personality.revision,1);
  // Answers are never copied into the occupational attempt row.
  const row=db.sqlite.prepare('SELECT mcq_answers_json,structured_answers_json FROM attempts WHERE id=?').get(attemptId);
  assert.equal(row.mcq_answers_json,'{}'); assert.equal(row.structured_answers_json,'{}');
  const stored=db.sqlite.prepare('SELECT answers_encrypted FROM workplace_personality_attempts WHERE attempt_id=?').get(attemptId).answers_encrypted;
  assert.match(stored,/^enc:v1\./); assert(!stored.includes('"b1"') && !stored.includes('"o5"')); // base64 never contains quotes

  const answers=Object.fromEntries(Array.from({length:50},(_,i)=>['b'+(i+1),'o4']));
  const done=await call('submit',{attempt_id:attemptId,save_revision:1,answers});
  assert.equal(done.status,200);
  assert.equal(done.body.status,'completed');
  assert.equal(done.body.format,'personality-v1');
  assert.equal(done.body.candidate_result,null);
  assert.doesNotMatch(JSON.stringify(done.body),/Extraversion|mean|factor/i);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM results").get().n,0);
  const after=await call('me');
  assert.equal(after.body.status,'completed'); assert.equal(after.body.candidate_result,null);

  await call.settle();
  // Concurrent notifiers send exactly one email.
  const sent=[];
  const fetchImpl=async(_url,init)=>{sent.push(JSON.parse(init.body));return new Response('{}');};
  await Promise.all([notifyPendingPersonality(vars,db,fetchImpl),notifyPendingPersonality(vars,db,fetchImpl)]);
  await notifyPendingPersonality(vars,db,fetchImpl);
  assert.equal(sent.length,1);
  assert.deepEqual(sent[0].to,['recruiter@example.invalid']);
  assert.match(sent[0].text,/Extraversion: \d\.\d\d \/ 5 \(10 of 10 answered\)/);
  assert.match(sent[0].text,/Do not use it alone, or as a cut-off/);
  assert.match(sent[0].text,/\*\*\*/); // ID number is masked
  assert.doesNotMatch(sent[0].text+sent[0].html,new RegExp(screeningFixture(0).id_number));
  assert.doesNotMatch(sent[0].text+sent[0].html,/percentile|archetype|composite|pass\/fail|Am the life of the party/i);
  // AP/AR's queue never sees personality attempts.
  assert.equal(db.sqlite.prepare("SELECT notify_status FROM workplace_personality_attempts WHERE attempt_id=?").get(attemptId).notify_status,'sent');

  // Audit events carry no answers.
  for (const e of db.sqlite.prepare('SELECT safe_metadata_json FROM audit_events WHERE attempt_id=?').all(attemptId)) assert.doesNotMatch(e.safe_metadata_json,/o[1-5]|b\d/);

  // One start per ID number.
  const again=await client(vars)('start',start());
  assert.equal(again.status,403);
  assert.match(again.body.message,/already started/);
  db.sqlite.close();
});

test('an attempt that closes at the time limit is submitted with its saved answers and emailed', async () => {
  const {db,env}=personalityDatabase({publish:true});
  // Candidate requests run without mail credentials so the request-time notifier stays offline;
  // the test then drives the queue itself with a fake transport.
  const vars={...env,...mail,ENABLE_HPI_PERSONALITY:'true'};
  const call=client({...env,ENABLE_HPI_PERSONALITY:'true'});
  const started=await call('start',start(3));
  await call('save',{attempt_id:started.body.attempt_id,save_revision:0,answers:{b3:'o5'}});
  db.sqlite.prepare('UPDATE attempts SET started_at_ms=?, expires_at_ms=? WHERE id=?').run(Date.now()-5000, Date.now()-1000, started.body.attempt_id);
  const closed=await call('me');
  assert.equal(closed.body.status,'timed_out');
  assert.equal(closed.body.candidate_result,null);
  await call.settle();
  const sent=[];
  await notifyPendingPersonality(vars,db,async(_u,init)=>{sent.push(JSON.parse(init.body));return new Response('{}');});
  assert.equal(sent.length,1);
  assert.match(sent[0].text,/Conscientiousness: 5\.00 \/ 5 \(1 of 10 answered\)/);
  db.sqlite.close();
});

test('switching the flag off stops saves and submits but keeps the saved answers', async () => {
  const {db,env}=personalityDatabase({publish:true});
  const on={...env,ENABLE_HPI_PERSONALITY:'true'}, off={...env,ENABLE_HPI_PERSONALITY:'false'};
  const call=client(on);
  const started=await call('start',start(4));
  const id=started.body.attempt_id;
  assert.equal((await call('save',{attempt_id:id,save_revision:0,answers:{b2:'o3'}})).status,200);
  const blocked=await call('submit',{attempt_id:id,save_revision:1,answers:{b2:'o1'}},'POST',off);
  assert.equal(blocked.status,409);
  assert.match(blocked.body.message,/retained/);
  assert.equal((await call('me')).body.personality.answers.b2,'o3');
  db.sqlite.close();
});

test('admin can publish the migration draft only with approvals, and the report shows factor means', async () => {
  const {db,env}=personalityDatabase({publish:false});
  const key='synthetic-admin-key-with-enough-length';
  const vars={...env,...mail,ASSESSMENT_ADMIN_KEY:key,ENABLE_HPI_PERSONALITY:'true'};
  const admin=async(path,body)=>{
    const login=await onRequest({env:vars,request:new Request(base+'/api/assessment/admin/login',{method:'POST',headers:{Origin:base},body:JSON.stringify({key})})});
    const cookie=(login.headers.get('Set-Cookie')||'').split(';')[0];
    const r=await onRequest({env:vars,request:new Request(base+'/api/assessment/admin/'+path,{method:body?'POST':'GET',headers:{Origin:base,Cookie:cookie,'x-tt-assessment-admin':'1'},body:body?JSON.stringify(body):undefined}),waitUntil(){}});
    return {status:r.status,body:await r.json()};
  };
  const version='6f1c2a90-9b5e-4c1d-8e3a-0d7b5a2f4c12';
  const refused=await admin('publish',{version_id:version,content_approved:true,privacy_approved:false,approval_reference:'Ref 12345'});
  assert.equal(refused.status,400);
  const ok=await admin('publish',{version_id:version,content_approved:true,privacy_approved:true,approval_reference:'Owner approval 2026-11-25'});
  assert.equal(ok.status,200);
  assert.equal(db.sqlite.prepare("SELECT duration_seconds AS d FROM assessment_definitions WHERE slug=?").get(slug).d,3600);
  const call=client(vars);
  const started=await call('start',start(5));
  await call('submit',{attempt_id:started.body.attempt_id,save_revision:0,answers:{b1:'o5'}});
  const report=await admin('report/'+started.body.attempt_id);
  assert.equal(report.status,200);
  assert.equal(report.body.assessment.format,'personality-v1');
  assert.equal(report.body.personality.factors.find(f=>f.name==='Extraversion').mean,5);
  assert.doesNotMatch(JSON.stringify(report.body),/"answers"|Am the life of the party/);
  db.sqlite.close();
});

test('invitation metadata identifies the personality profile so the invited candidate sees its notice', async () => {
  const {db,env}=personalityDatabase({publish:true});
  const {tokenHash}=await import('../functions/lib/assessment-core.js');
  const token='a'.repeat(64), at=new Date().toISOString(), expires=new Date(Date.now()+86400000).toISOString();
  db.sqlite.prepare("INSERT INTO invitations (id,definition_id,token_sha256,status,issued_at,expires_at,created_at) VALUES ('inv','6f1c2a90-9b5e-4c1d-8e3a-0d7b5a2f4c11',?,'issued',?,?,?)").run(await tokenHash(token),at,expires,at);
  const vars={...env,ENABLE_HPI_PERSONALITY:'true'};
  const meta=await (await onRequest({env:vars,request:new Request(base+'/api/assessment/invite?token='+token)})).json();
  assert.equal(meta.kind,'personality');
  assert.equal(meta.duration_seconds,3600);
  const {assessment_slug,...invited}=start(6);
  const started=await client(vars)('start',{...invited,invitation_token:token});
  assert.equal(started.status,200);
  assert.equal(started.body.assessment.format,'personality-v1');
  db.sqlite.close();
});

test('closed drafts with no answers do not block answered ones from being submitted and emailed', async () => {
  const {db,env}=personalityDatabase({publish:true});
  const on={...env,ENABLE_HPI_PERSONALITY:'true'};
  const ids=[];
  for (let n=0;n<22;n++) {
    const call=client(on);
    const s=await call('start',start(20+n));
    // 21 candidates answer and then clear everything; the last one keeps an answer.
    await call('save',{attempt_id:s.body.attempt_id,save_revision:0,answers:{b1:'o2'}});
    await call('save',{attempt_id:s.body.attempt_id,save_revision:1,answers:n<21?{b1:null}:{b1:'o2'}});
    ids.push(s.body.attempt_id);
  }
  db.sqlite.prepare("UPDATE attempts SET status='timed_out', closed_at_ms=?").run(Date.now());
  const sent=[];
  const fetchImpl=async(_u,init)=>{sent.push(JSON.parse(init.body));return new Response('{}');};
  for (let run=0; run<3; run++) await notifyPendingPersonality({...env,...mail},db,fetchImpl);
  assert.equal(db.sqlite.prepare("SELECT status FROM workplace_personality_attempts WHERE attempt_id=?").get(ids[21]).status,'submitted');
  assert.equal(sent.length,1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM workplace_personality_attempts WHERE notify_status='closed_empty'").get().n,21);
  db.sqlite.close();
});
