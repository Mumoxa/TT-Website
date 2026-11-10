import {fillScreening,openDetails} from './helpers/screening.mjs';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const base='http://127.0.0.1:8790';
const key=()=>fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars','utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
async function post(api,path,data){const r=await api.post(base+'/api/assessment/'+path,{headers:{Origin:base,'x-tt-assessment-admin':'1'},data});expect(r.status(),await r.text()).toBe(200);return r.json();}
// Synthetic line-matching battery (no live content).
const CHOICES=[{id:'o1',text:'Agrees'},{id:'o2',text:'Missing from ledger'},{id:'o3',text:'Posted incorrectly'},{id:'o4',text:'Timing difference'}];
const LINES=[
 {id:'l1',doc:'Synthetic statement',ref:'S-100',detail:'Synthetic invoice',amount:'R100.00'},
 {id:'l2',doc:'Synthetic statement',ref:'S-200',detail:'Synthetic invoice not in ledger',amount:'R200.00'},
 {id:'l3',doc:'Synthetic ledger',ref:'J-1',detail:'Synthetic payment',amount:'−R50.00'},
 {id:'l4',doc:'Synthetic ledger',ref:'J-2',detail:'Synthetic payment repeated',amount:'−R50.00'},
 {id:'l5',doc:'Synthetic ledger',ref:'J-3',detail:'Synthetic payment after cut-off',amount:'−R30.00'},
];
const PAYLOAD={format:'battery-v2',instructions:'Synthetic battery for the line-matching browser test.',
 sections:[
  {id:'s1',title:'Synthetic knowledge',items:[{id:'k1',type:'single',category:'knowledge',points:2,prompt:'Synthetic knowledge question here',options:[{id:'o1',text:'Alpha choice'},{id:'o2',text:'Beta choice'}]},{id:'k2',type:'single',category:'knowledge',points:2,prompt:'Second synthetic knowledge question',options:[{id:'o1',text:'Gamma choice'},{id:'o2',text:'Delta choice'}]}]},
  {id:'s2',title:'Synthetic matching',items:[{id:'mx',type:'match',category:'reconciliation',points:5,prompt:'Classify every synthetic line below.',choices:CHOICES,lines:LINES}]},
 ],
 workbook:{sheets:[{name:'Src',writable:false},{name:'W',writable:true}],source:{'Src!A1':'Ref','Src!A2':'S-100'},display:'documents',documents:[{title:'Synthetic statement',range:'Src!A1:A2'}]}};
const KEY={items:{k1:{answer:'o1'},k2:{answer:'o2'},mx:{answer:{l1:'o1',l2:'o2',l3:'o1',l4:'o3',l5:'o4'},alternatives:[{l3:'o3',l4:'o1'}]}}};

test('line matching: classify lines, progress updates, saves, and scores one point per line',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await post(request,'admin/login',{key:key()});
 const draft=await post(request,'admin/draft',{slug:'synthetic-match-'+Date.now(),client_name:'Synthetic client',title:'Synthetic match browser test',question_payload:PAYLOAD,scoring_key:KEY});
 await post(request,'admin/publish',{version_id:draft.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic local browser approval only'});
 const url=(await post(request,'admin/invite',{assessment_id:draft.assessment_id,intended_email:'match@example.invalid'})).invitation_url;
 await page.goto(url);await openDetails(page);
 await page.getByLabel('First name',{exact:true}).fill('Match');await page.getByLabel('Surname',{exact:true}).fill('Synthetic');await page.getByLabel('Email address',{exact:true}).fill('match@example.invalid');
 await fillScreening(page);await page.getByRole('button',{name:'Start assessment'}).click();await page.getByRole('button',{name:'OK, start the timer',exact:true}).click();
 await expect(page.getByRole('timer')).toBeVisible();
 await expect(page.getByText('0 of 5 lines classified')).toBeVisible();
 // Three of five lines right: S-100 agrees, S-200 missing, J-3 timing; J-1 and J-2 wrong.
 await page.getByLabel('Synthetic statement line S-100: how does it compare?').selectOption({label:'Agrees'});
 await page.getByLabel('Synthetic statement line S-200: how does it compare?').selectOption({label:'Missing from ledger'});
 await page.getByLabel('Synthetic ledger line J-1: how does it compare?').selectOption({label:'Timing difference'});
 await page.getByLabel('Synthetic ledger line J-2: how does it compare?').selectOption({label:'Missing from ledger'});
 await page.getByLabel('Synthetic ledger line J-3: how does it compare?').selectOption({label:'Timing difference'});
 await expect(page.getByText('5 of 5 lines classified')).toBeVisible();
 await page.getByLabel('Alpha choice',{exact:true}).check();await page.getByLabel('Delta choice',{exact:true}).check();
 await expect(page.getByRole('status').filter({hasText:'All changes saved'})).toBeVisible();
 // A reload keeps the classifications.
 await page.reload();await expect(page.getByLabel('Synthetic ledger line J-1: how does it compare?')).toHaveValue('o4');
 await page.getByRole('button',{name:/Submit assessment/}).click();
 await expect(page.getByRole('heading',{name:'Assessment complete.'})).toBeVisible();
 // Matching section: 3 of 5 points = 60%. Knowledge: 100%.
 await expect(page.locator('li',{hasText:'Synthetic matching'}).getByText('60%')).toBeVisible();
 expect(errors).toEqual([]);
});
