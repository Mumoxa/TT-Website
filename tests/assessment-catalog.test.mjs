import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from './helpers/assessment-db.mjs';
import {onRequest} from '../functions/api/assessment/[[path]].js';

function seed(db,{id='public',status='published',published=true,payload}={}) {
 const at=new Date().toISOString();
 db.sqlite.prepare('INSERT INTO assessment_definitions VALUES (?,?,?,?,600,?,?,?,?)').run(id,id,'Example client','Accounts Payable Clerk',id+'-version',status,at,at);
 db.sqlite.prepare('INSERT INTO assessment_versions VALUES (?,?,?,?,?,?,?,?)').run(id+'-version',id,'v1',JSON.stringify(payload),JSON.stringify({private_canary:'PRIVATE_CATALOG_CANARY'}),'test-only',published?at:null,at);
}
const get=db=>onRequest({env:{ASSESSMENT_DB:db},request:new Request('https://example.invalid/api/assessment/catalog')});
test('catalogue exposes only six metadata fields, never question or marking data',async()=>{
 const db=database();
 seed(db,{payload:{format:'battery-v2',sections:[{title:'Technical knowledge',items:[{prompt:'PRIVATE_CATALOG_CANARY',options:['PRIVATE_CATALOG_CANARY'],answer:'PRIVATE_CATALOG_CANARY'}]},{title:'Reconciliation',items:[{workbook:'PRIVATE_CATALOG_CANARY'}]}],workbook:{source:{A1:'PRIVATE_CATALOG_CANARY'}},scoring_key:'PRIVATE_CATALOG_CANARY'}});
 const response=await get(db);assert.equal(response.status,200);
 assert.deepEqual(await response.json(),[{slug:'public',title:'Accounts Payable Clerk',client_name:'Example client',duration_minutes:10,section_titles:['Technical knowledge','Reconciliation'],item_count:2}]);
 const serialized=await (await get(db)).text();assert.doesNotMatch(serialized,/PRIVATE_CATALOG_CANARY|prompt|options|answer|workbook|scoring_key/);
});
test('catalogue excludes drafts, retired definitions and unpublished versions',async()=>{
 const db=database();
 for(const [id,status,published] of [['draft','draft',false],['retired','retired',true],['unpublished','published',false]])seed(db,{id,status,published,payload:{}});
 assert.deepEqual(await (await get(db)).json(),[]);
});
test('legacy work sample catalogue derives section and item totals without content',async()=>{
 const db=database();seed(db,{payload:{questions:Array(5).fill({}),scenario:{}}});
 const [item]=await (await get(db)).json();assert.equal(item.item_count,6);assert.deepEqual(item.section_titles,['Technical knowledge','Practical reconciliation']);
});

test('legacy extra metadata cannot impersonate battery sections or leak nested data',async()=>{
 const db=database();seed(db,{payload:{questions:Array(5).fill({}),scenario:{},sections:[{title:{answers:'PRIVATE_CATALOG_CANARY'},items:[]}]}});
 const response=await get(db);const body=await response.text();
 assert.doesNotMatch(body,/PRIVATE_CATALOG_CANARY|answers/);
 assert.deepEqual(JSON.parse(body)[0].section_titles,['Technical knowledge','Practical reconciliation']);
});
