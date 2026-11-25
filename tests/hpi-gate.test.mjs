import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/assessment/[[path]].js';
import {screeningFixture} from './helpers/screening-fixture.mjs';
import {personalityDatabase} from './helpers/personality-db.mjs';
import {PERSONALITY_NOTICE_VERSION} from '../src/assessments/personality-notice.js';

const base='https://assessment.example', slug='workplace-personality-profile';
const startBody=extra=>JSON.stringify({assessment_slug:slug,first_name:'Synthetic',surname:'Candidate',email:'candidate@example.invalid',consent_acknowledged:true,personality_notice_version:PERSONALITY_NOTICE_VERSION,...screeningFixture(),...extra});

test('personality is hidden and start fails closed unless the switch is "true" and the draft is published', async () => {
  const {db,env}=personalityDatabase({publish:true});
  for (const flag of [undefined, 'false', 'TRUE', '1']) {
    const vars={...env,ENABLE_HPI_PERSONALITY:flag};
    assert.deepEqual(await (await onRequest({env:vars,request:new Request(base+'/api/assessment/catalog')})).json(),[]);
    assert.deepEqual(await (await onRequest({env:vars,request:new Request(base+'/api/assessment/catalog?slug='+slug)})).json(),[]);
    const request=new Request(base+'/api/assessment/start',{method:'POST',headers:{Origin:base},body:startBody()});
    assert.equal((await onRequest({env:vars,request})).status,404);
  }
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM candidates').get().n,0);
  // The migration leaves the definition as a draft: even with the switch on, nothing is listed or startable.
  const draft=personalityDatabase({publish:false});
  const on={...draft.env,ENABLE_HPI_PERSONALITY:'true'};
  assert.deepEqual(await (await onRequest({env:on,request:new Request(base+'/api/assessment/catalog')})).json(),[]);
  assert.equal((await onRequest({env:on,request:new Request(base+'/api/assessment/start',{method:'POST',headers:{Origin:base},body:startBody()})})).status,404);
  db.sqlite.close(); draft.db.sqlite.close();
});

test('with the switch on, the published profile is listed as a personality questionnaire and needs the notice', async () => {
  const {db,env}=personalityDatabase({publish:true});
  const vars={...env,ENABLE_HPI_PERSONALITY:'true'};
  const list=await (await onRequest({env:vars,request:new Request(base+'/api/assessment/catalog')})).json();
  assert.equal(list.length,1);
  assert.equal(list[0].kind,'personality');
  assert.equal(list[0].item_count,50);
  const noNotice=await onRequest({env:vars,request:new Request(base+'/api/assessment/start',{method:'POST',headers:{Origin:base},body:startBody({personality_notice_version:'old'})})});
  assert.equal(noNotice.status,400);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM attempts').get().n,0);
  db.sqlite.close();
});
