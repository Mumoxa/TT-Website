import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/assessment/[[path]].js';
import {database} from './helpers/assessment-db.mjs';
import {SYNTHETIC} from './fixtures/synthetic-assessment.mjs';
import {screeningFixture} from './helpers/screening-fixture.mjs';
const origin='https://assessment.example';
async function setup() {
 const db=database(),at=new Date().toISOString();
 db.sqlite.prepare('INSERT INTO assessment_definitions VALUES (?,?,?,?,600,?,?,?,?)').run('open','ap-clerk-v1','Talent Tree','Accounts Payable Clerk Assessment','version','published',at,at);
 db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)').run('version','open','v1',JSON.stringify(SYNTHETIC.question_payload),JSON.stringify(SYNTHETIC.scoring_key),'test',at,at);
 const env={ASSESSMENT_DB:db,ASSESSMENT_ADMIN_KEY:'synthetic-admin',ASSESSMENT_ID_HASH_KEY:'synthetic-key-with-at-least32-characters-for-tests',ASSESSMENT_PII_KEY:btoa('0'.repeat(32))};
 async function call(path,data,cookie){const response=await onRequest({env,request:new Request(origin+'/api/assessment/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),'CF-Connecting-IP':'192.0.2.5'},body:data===undefined?undefined:JSON.stringify(data)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 const fields={assessment_slug:'ap-clerk-v1',first_name:'Synthetic',surname:'Candidate',email:'open@example.invalid',consent_acknowledged:true,...screeningFixture()};
 return {db,env,call,fields};
}
test('open link starts without a token and stores screened identity privately',async()=>{
 const t=await setup(),a=await t.call('start',t.fields);assert.equal(a.status,200,JSON.stringify(a.data));assert.equal(a.data.expires_at_ms-a.data.started_at_ms,1200000);
 const candidate=t.db.sqlite.prepare('SELECT * FROM candidates').get();assert.equal(candidate.contact_number,'+27210000000');assert.equal(candidate.id_number_encrypted.includes(t.fields.id_number),false);assert.equal(candidate.first_day_confirmed,1);
 assert.equal(t.db.sqlite.prepare('SELECT status FROM invitations').get().status,'redeemed');assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM assessment_identity_attempts').get().n,1);
 assert.doesNotMatch(JSON.stringify(a.data),new RegExp(t.fields.id_number));assert.equal(JSON.stringify(a.data).includes(candidate.contact_number),false);
});
test('repeat ID races allocate separate sequential attempts without revealing earlier personal data',async()=>{
 const t=await setup();const results=await Promise.all([t.call('start',t.fields),t.call('start',{...t.fields,email:'second@example.invalid'})]);
 assert.deepEqual(results.map(r=>r.status),[200,200]);assert.deepEqual(results.map(r=>r.data.attempt_number).sort(),[1,2]);
 assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM candidates').get().n,2);assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM invitations').get().n,2);
 assert.notEqual(results[0].data.attempt_id,results[1].data.attempt_id);
 for(const a of results){const receipt=await t.call('submit',{attempt_id:a.data.attempt_id,save_revision:0},a.cookie);assert.equal(receipt.data.attempt_number,a.data.attempt_number);assert.equal(JSON.stringify(receipt.data).includes('second@example.invalid'),false);}
});
test('invalid screening is rejected server-side before any candidate record is created',async()=>{
 const t=await setup();for(const override of [{id_number:'invalid'},{contact_number:'123'},{first_day_confirmed:false},{earliest_start_date:'2020-01-01'},{travel_mode:'public_transport',travel_description:''}])assert.equal((await t.call('start',{...t.fields,...override})).status,400);
 assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM candidates').get().n,0);
});
test('candidate completion exposes only overall and section percentages, including timeout',async()=>{
 const t=await setup(),a=await t.call('start',t.fields);assert.equal(a.status,200);
 const final=await t.call('submit',{attempt_id:a.data.attempt_id,save_revision:0,mcq:{},structured:{},workbook:{}},a.cookie);
 assert.equal(final.status,200);assert.equal(final.data.candidate_result.overall_score,0);assert.equal(final.data.candidate_result.sections.length,2);
 const resumed=await t.call('me',undefined,a.cookie);assert.equal(resumed.data.candidate_result.overall_score,0);
 for(const data of [final.data,resumed.data]){const json=JSON.stringify(data);assert.doesNotMatch(json,/question_review|correctAnswer|scoring_key|expected|workbook_source|interpretation|critical_flags/);assert.equal('assessment' in data,false);assert.equal('responses' in data,false);}
 const second=await t.call('start',{...t.fields,...screeningFixture(1)});t.db.sqlite.prepare('UPDATE attempts SET started_at_ms=?,expires_at_ms=? WHERE id=?').run(Date.now()-600001,Date.now()-1,second.data.attempt_id);
 const timeout=await t.call('submit',{},second.cookie);assert.equal(timeout.data.status,'timed_out');assert.equal(timeout.data.candidate_result.overall_score,0);
});

test('screening is masked in recruiter report and actual notification; repeat results remain distinct',async()=>{
 const t=await setup();const a=await t.call('start',{...t.fields,travel_mode:'public_transport',travel_description:'Synthetic route',assignment_available:'no',assignment_note:'Synthetic availability'});
 await t.call('submit',{attempt_id:a.data.attempt_id,save_revision:0},a.cookie);
 const b=await t.call('start',t.fields);await t.call('submit',{attempt_id:b.data.attempt_id,save_revision:0},b.cookie);
 const admin=await t.call('admin/login',{key:t.env.ASSESSMENT_ADMIN_KEY});
 const report=await t.call('admin/report/'+a.data.attempt_id,undefined,admin.cookie);
 assert.equal(report.status,200);assert.equal(report.data.screening.travel_description,'Synthetic route');assert.equal(report.data.screening.assignment_note,'Synthetic availability');assert.equal(report.data.screening.id_number_masked,t.fields.id_number.slice(0,6)+'***'+t.fields.id_number.slice(-4));assert.equal(report.data.attempt.attempt_number,1);
 const second=await t.call('admin/report/'+b.data.attempt_id,undefined,admin.cookie);assert.equal(second.data.attempt.attempt_number,2);
 const list=await t.call('admin/list',undefined,admin.cookie);assert.deepEqual(list.data.attempts.map(x=>x.attempt_number).sort(),[1,2]);
 const sent=[];
 await notifyPendingResults({...t.env,RESEND_API_KEY:'synthetic-provider-key',ASSESSMENT_FROM_EMAIL:'sender@example.invalid',ASSESSMENT_RESULTS_TO:'recruiter@example.invalid'},t.db,async(_url,init)=>{sent.push(JSON.parse(init.body));return new Response('{}',{status:200});});
 assert.equal(sent.length,2);assert.match(sent[1].text,/Attempt 2/);assert.match(sent[0].html,/Screening details/);assert.match(sent[0].text,/Synthetic route/);
 for(const value of [report.data,list.data,...sent]) {const encoded=JSON.stringify(value);assert.equal(encoded.includes(t.fields.id_number),false);assert.equal(encoded.includes('+27210000000'),false);assert.equal(encoded.includes('id_number_encrypted'),false);}
 // No retention process removes old actual results or hash history.
 t.db.sqlite.prepare('UPDATE attempts SET closed_at_ms=?').run(Date.now()-90*86400000);
 await t.call('admin/list',undefined,admin.cookie);assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM results').get().n,2);
 const third=await t.call('start',t.fields);assert.equal(third.data.attempt_number,3);
});

import {notifyPendingResults} from '../functions/lib/assessment-email.js';
import {SYNTHETIC_BATTERY,SYNTHETIC_BATTERY_KEY} from './fixtures/synthetic-battery.mjs';
import {PRACTICE_ITEMS} from '../src/assessments/practice.js';
test('battery candidate result projects section percentages and never private marking data',async()=>{
 const t=await setup();t.db.sqlite.prepare('UPDATE assessment_versions SET question_payload_json=?,scoring_key_json=?').run(JSON.stringify(SYNTHETIC_BATTERY),JSON.stringify(SYNTHETIC_BATTERY_KEY));
 const a=await t.call('start',t.fields);assert.equal(a.status,200);
 const receipt=await t.call('submit',{attempt_id:a.data.attempt_id,save_revision:0,mcq:{k1:'o1'},structured:{},workbook:{}},a.cookie);
 assert.equal(receipt.status,200);const result=receipt.data.candidate_result;
 assert.equal(result.sections[0].title,'Synthetic knowledge');assert.equal(result.sections[0].percentage,33.3);
 assert.deepEqual(Object.keys(result).sort(),['caveat','overall_score','sections']);assert.deepEqual(Object.keys(result.sections[0]).sort(),['feedback','percentage','title']);
 assert.doesNotMatch(JSON.stringify(receipt.data),/items_correct|question_review|scoring_key|correctAnswer|pass_percent|interpretation|unsafe|workbook_source|k1|o1/);
});
test('start fails closed if the published battery overlaps public practice',async()=>{
 const t=await setup();const payload=structuredClone(SYNTHETIC_BATTERY);payload.sections[0].items[0].prompt=PRACTICE_ITEMS[0].prompt;
 t.db.sqlite.prepare('UPDATE assessment_versions SET question_payload_json=?,scoring_key_json=?').run(JSON.stringify(payload),JSON.stringify(SYNTHETIC_BATTERY_KEY));
 const result=await t.call('start',t.fields);assert.equal(result.status,503);assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM attempts').get().n,0);
 assert.equal(JSON.stringify(result.data).includes(PRACTICE_ITEMS[0].prompt),false);
});
test('candidate supplied names and response text cannot disable recruiter reporting',async()=>{
 const t=await setup(),withheld=String.fromCharCode(115,97,116,117,114,99);
 const a=await t.call('start',{...t.fields,first_name:withheld});assert.equal(a.status,200);
 const admin=await t.call('admin/login',{key:t.env.ASSESSMENT_ADMIN_KEY});assert.equal((await t.call('admin/list',undefined,admin.cookie)).status,200);
});
test('private protocol identifiers needing brand review are rejected before a timer is created',async()=>{
 const t=await setup(),withheld=String.fromCharCode(115,97,116,117,114,99);const payload=structuredClone(SYNTHETIC_BATTERY),key=structuredClone(SYNTHETIC_BATTERY_KEY);
 payload.sections[0].items[0].id=withheld+'-item';key.items[withheld+'-item']=key.items.k1;delete key.items.k1;
 t.db.sqlite.prepare('UPDATE assessment_versions SET question_payload_json=?,scoring_key_json=?').run(JSON.stringify(payload),JSON.stringify(key));
 const result=await t.call('start',t.fields);assert.equal(result.status,503);assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM attempts').get().n,0);
});
test('a person can start at most 3 times; the 4th start is refused and creates no attempt',async()=>{
 const t=await setup();
 for(let i=1;i<=3;i+=1){const r=await t.call('start',{...t.fields,email:`try${i}@example.invalid`});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.attempt_number,i);}
 const fourth=await t.call('start',{...t.fields,email:'try4@example.invalid'});
 assert.equal(fourth.status,403);assert.match(fourth.data.message||fourth.data.error||JSON.stringify(fourth.data),/all 3 attempts/);
 assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM attempts').get().n,3);
 assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM assessment_identity_attempts').get().n,3);
 // A different ID number is unaffected.
 const other=await t.call('start',{...t.fields,...screeningFixture(9),email:'other@example.invalid'});assert.equal(other.status,200,JSON.stringify(other.data));assert.equal(other.data.attempt_number,1);
});
test('simultaneous starts cannot exceed the limit',async()=>{
 const t=await setup();
 const results=await Promise.all([1,2,3,4,5].map((i)=>t.call('start',{...t.fields,email:`race${i}@example.invalid`})));
 assert.equal(results.filter((r)=>r.status===200).length,3,JSON.stringify(results.map((r)=>r.status)));
 assert.equal(t.db.sqlite.prepare('SELECT count(*) n FROM attempts').get().n,3);
});
