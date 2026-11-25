import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './helpers/assessment-db.mjs';
import {createPersonalityAttempt,writePersonalityAttempt,readPersonalityResultForNotification,personalityIdentityHash,NOTICE_VERSION} from '../functions/lib/workplace-personality-store.js';

function setup() {
  const db=database();
  db.sqlite.exec(readFileSync(new URL('../migrations/assessments/0007_workplace_personality.sql',import.meta.url),'utf8'));
  const at=new Date().toISOString();
  db.sqlite.prepare('INSERT INTO assessment_definitions VALUES (?,?,?,?,600,?,?,?,?)').run('def','synthetic-wpp','Talent Tree','Synthetic','v','published',at,at);
  db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)').run('v','def','v','{}','{}','test',at,at);
  for(const n of ['1','2']) {
    db.sqlite.prepare('INSERT INTO candidates (id,first_name,surname,email,privacy_notice_version,consent_recorded_at,created_at) VALUES (?,?,?,?,?,?,?)').run('c'+n,'Synthetic','Candidate',n+'@example.invalid','draft',at,at);
    db.sqlite.prepare('INSERT INTO invitations (id,definition_id,token_sha256,status,issued_at,expires_at,created_at) VALUES (?,?,?,?,?,?,?)').run('i'+n,'def',n.repeat(64),'redeemed',at,at,at);
    db.sqlite.prepare('INSERT INTO attempts (id,invitation_id,candidate_id,definition_id,version_id,session_token_sha256,status,started_at_ms,expires_at_ms,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('a'+n,'i'+n,'c'+n,'def','v',n.repeat(64),'active',1,2,at,at);
  }
  return {db,env:{ASSESSMENT_DB:db,ASSESSMENT_PII_KEY:Buffer.alloc(32,5).toString('base64'),ASSESSMENT_ID_HASH_KEY:'synthetic-key-with-at-least-32-characters'}};
}

test('one per ID and version, encrypted responses, CAS and metadata-only audit',async()=>{
  const {db,env}=setup(), hash=await personalityIdentityHash(env,'def','0001015000087');
  assert.notEqual(hash,await personalityIdentityHash(env,'other','0001015000087'));
  const start={attemptId:'a1',candidateId:'c1',identityHash:hash,noticeVersion:NOTICE_VERSION};
  assert.deepEqual(await createPersonalityAttempt(env,{...start,noticeVersion:'old'}),{error:'invalid'});
  assert.deepEqual(await createPersonalityAttempt(env,{...start,candidateId:'c2'}),{error:'unavailable'});
  assert.deepEqual(await createPersonalityAttempt(env,start),{ok:true,revision:0});
  assert.deepEqual(await createPersonalityAttempt(env,start),{error:'unavailable'});
  assert.deepEqual(await createPersonalityAttempt(env,{...start,attemptId:'a2',candidateId:'c2'}),{error:'unavailable'});
  assert.deepEqual(await writePersonalityAttempt(env,{attemptId:'a1',candidateId:'c2',revision:0,answers:{b1:'o1'}}),{error:'unavailable'});
  const base={attemptId:'a1',candidateId:'c1',revision:0};
  assert.deepEqual(await writePersonalityAttempt(env,{...base,answers:{},submit:true}),{error:'empty'});
  assert.deepEqual(await writePersonalityAttempt(env,{...base,answers:{b1:'bad'}}),{error:'invalid'});
  const updates=await Promise.all([writePersonalityAttempt(env,{...base,answers:{b1:'o1'}}),writePersonalityAttempt(env,{...base,answers:{b1:'o2'}})]);
  assert.equal(updates.filter(value=>value.ok).length,1);
  assert.equal(updates.filter(value=>value.error==='conflict').length,1);
  const saved=db.sqlite.prepare('SELECT * FROM workplace_personality_attempts WHERE attempt_id=?').get('a1');
  assert.match(saved.answers_encrypted,/^enc:v1\./); assert(!saved.answers_encrypted.includes('"b1"'));
  const submitted=await writePersonalityAttempt(env,{...base,revision:1,answers:{b1:'o1',b6:'o1'},submit:true});
  assert.deepEqual(submitted,{ok:true,revision:2,status:'submitted'});
  assert.deepEqual(await writePersonalityAttempt(env,{...base,revision:2,answers:{b1:'o1'},submit:true}),{error:'conflict'});
  const result=await readPersonalityResultForNotification(env,'a1');
  assert.equal(result.factors[0].mean,3); assert.equal(result.attempted,2);
  const stored=db.sqlite.prepare('SELECT * FROM workplace_personality_attempts WHERE attempt_id=?').get('a1');
  assert.match(stored.result_encrypted,/^enc:v1\./); assert(!stored.result_encrypted.includes('Extraversion'));
  const audit=db.sqlite.prepare('SELECT event_type,safe_metadata_json FROM audit_events ORDER BY rowid').all();
  assert.deepEqual(audit.map(row=>row.event_type),['wpp.started','wpp.saved','wpp.submitted']);
  assert.doesNotMatch(JSON.stringify(audit),/b1|o1|Extraversion|identity_hash/);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM results').get().n,0);
  db.sqlite.close();
});

test('wrong encryption key fails closed for recruiter read',async()=>{
  const {db,env}=setup(), hash=await personalityIdentityHash(env,'def','0001015000087');
  await createPersonalityAttempt(env,{attemptId:'a1',candidateId:'c1',identityHash:hash,noticeVersion:NOTICE_VERSION});
  await writePersonalityAttempt(env,{attemptId:'a1',candidateId:'c1',revision:0,answers:{b1:'o3'},submit:true});
  await assert.rejects(()=>readPersonalityResultForNotification({...env,ASSESSMENT_PII_KEY:Buffer.alloc(32,9).toString('base64')},'a1'));
  db.sqlite.close();
});
