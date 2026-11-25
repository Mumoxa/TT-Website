import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/assessment/[[path]].js';
import {database} from './helpers/assessment-db.mjs';
import {screeningFixture} from './helpers/screening-fixture.mjs';
import {SYNTHETIC} from './fixtures/synthetic-assessment.mjs';

const base='https://assessment.example';
test('personality stays hidden and start fails closed while the flow is unfinished', async () => {
  const db=database(), at=new Date().toISOString(), slug='workplace-personality-profile';
  db.sqlite.prepare('INSERT INTO assessment_definitions VALUES (?,?,?,?,600,?,?,?,?)').run('p',slug,'Talent Tree','Workplace personality profile','v','published',at,at);
  db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)').run('v','p','v1',JSON.stringify(SYNTHETIC.question_payload),JSON.stringify(SYNTHETIC.scoring_key),'test',at,at);
  const env={ASSESSMENT_DB:db,ASSESSMENT_ID_HASH_KEY:'synthetic-key-with-at-least32-characters-for-tests',ASSESSMENT_PII_KEY:btoa('0'.repeat(32))};
  for (const flag of [undefined, 'false', 'true']) {
    const vars={...env,ENABLE_HPI_PERSONALITY:flag};
    const listing=await onRequest({env:vars,request:new Request(base+'/api/assessment/catalog')});
    assert.deepEqual(await listing.json(),[]);
    const direct=await onRequest({env:vars,request:new Request(base+'/api/assessment/catalog?slug='+slug)});
    assert.deepEqual(await direct.json(),[]);
    const request=new Request(base+'/api/assessment/start',{method:'POST',headers:{Origin:base},body:JSON.stringify({assessment_slug:slug,first_name:'Synthetic',surname:'Candidate',email:'candidate@example.invalid',consent_acknowledged:true,...screeningFixture()})});
    assert.equal((await onRequest({env:vars,request})).status,404);
  }
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM candidates').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM attempts').get().n,0);
  db.sqlite.close();
});
