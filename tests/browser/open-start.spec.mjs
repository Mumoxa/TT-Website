import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SYNTHETIC_BATTERY,SYNTHETIC_BATTERY_KEY} from '../fixtures/synthetic-battery.mjs';
import {screeningFixture} from '../helpers/screening-fixture.mjs';
import {openDetails,fillScreening} from './helpers/screening.mjs';
const base='http://127.0.0.1:8790';
const withheld=String.fromCharCode(115,97,116,117,114,99);
const key=()=>fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars','utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
async function post(api,route,data){const response=await api.post(base+'/api/assessment/'+route,{headers:{Origin:base,'x-tt-assessment-admin':'1'},data});expect(response.status(),await response.text()).toBe(200);return response.json();}
async function publish(api){await post(api,'admin/login',{key:key()});const slug='open-browser-'+Date.now();const draft=await post(api,'admin/draft',{slug,title:'Accounts Payable Clerk Assessment',client_name:'Talent Tree',question_payload:SYNTHETIC_BATTERY,scoring_key:SYNTHETIC_BATTERY_KEY});await post(api,'admin/publish',{version_id:draft.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic browser validation only'});return '/assessments/'+slug;}
async function identity(page){await page.getByLabel('First name',{exact:true}).fill('Synthetic');await page.getByLabel('Surname',{exact:true}).fill('Candidate');await page.getByLabel('Email address',{exact:true}).fill('synthetic@example.invalid');await fillScreening(page);}
async function noBrand(page){expect((await page.locator('body').innerText()).toLowerCase()).not.toContain(withheld);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
for(const width of [390,1280])test('open start, practice, validation, private results and numbered repeat at '+width+'px',async({page,request})=>{
 await page.setViewportSize({width,height:900});const route=await publish(request);
 const directory='docs/assessments/screenshots/open-start';fs.mkdirSync(directory,{recursive:true});
 await page.goto(route);await expect(page.getByRole('heading',{level:1,name:'Accounts Payable Clerk Assessment'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'What to expect'})).toBeVisible();await expect(page.getByText('We retain your assessment results and attempt history.',{exact:false})).toBeVisible();await noBrand(page);
 await page.screenshot({path:`${directory}/welcome-${width}.png`,fullPage:true});
 const practiceCalls=[];const observe=request=>{if(/\/api\/assessment\/(start|save|submit)/.test(request.url()))practiceCalls.push(request.url());};page.on('request',observe);
 await page.getByRole('button',{name:'Try the practice',exact:true}).click();
 await page.getByLabel('Pencil sharpener',{exact:true}).check();await expect(page.getByRole('status').filter({hasText:'Incorrect. Right answer: Umbrella'})).toBeVisible();
 await page.getByLabel('Umbrella',{exact:true}).check();await expect(page.getByRole('status').filter({hasText:'Correct. Right answer: Umbrella'})).toBeVisible();
 await page.getByLabel('Violin',{exact:true}).check();await page.getByLabel('Clarinet',{exact:true}).check();await expect(page.getByRole('status').filter({hasText:'Correct. Right answer: Violin and Clarinet'})).toBeVisible();
 await page.getByRole('textbox',{name:/how many tokens/}).fill('601.85');await expect(page.getByRole('status').filter({hasText:'Correct. Right answer: 173.25 + 428.60 = 601.85.'})).toBeVisible();
 expect(practiceCalls).toEqual([]);page.off('request',observe);await noBrand(page);await page.screenshot({path:`${directory}/practice-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Continue to your details'}).click();await identity(page);await noBrand(page);
 const consent=page.getByLabel('I agree to this processing.',{exact:true});expect((await consent.boundingBox()).width).toBeLessThanOrEqual(20);expect((await consent.locator('..').boundingBox()).height).toBeLessThan(100);
 await page.screenshot({path:`${directory}/form-${width}.png`,fullPage:true});
 await page.getByLabel('South African ID number',{exact:true}).fill('1234567890123');await page.getByRole('button',{name:'Start assessment',exact:true}).click();await expect(page.getByRole('alert')).toContainText(/ID number/);await expect(page.getByRole('timer')).toHaveCount(0);
 await page.getByLabel('South African ID number',{exact:true}).fill(screeningFixture().id_number);
 let weekend=new Date(screeningFixture().earliest_start_date+'T00:00:00Z');while(weekend.getUTCDay()!==6)weekend=new Date(weekend.getTime()+86400000);
 await page.getByLabel('Earliest date you can start (your first day)',{exact:true}).fill(weekend.toISOString().slice(0,10));await page.getByRole('button',{name:'Start assessment',exact:true}).click();await expect(page.getByRole('alert')).toContainText(/weekday/);
 await page.getByLabel('Earliest date you can start (your first day)',{exact:true}).fill(screeningFixture().earliest_start_date);
 await page.getByRole('button',{name:'Start assessment',exact:true}).click();const starts=[];const seeStart=r=>{if(/\/api\/assessment\/start/.test(r.url()))starts.push(r.url());};page.on('request',seeStart);await expect(page.getByRole('dialog',{name:'Before the timer starts'})).toBeVisible();await expect(page.getByRole('timer')).toHaveCount(0);await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(starts).toEqual([]);await page.getByRole('button',{name:'Start assessment',exact:true}).click();await page.getByRole('button',{name:'OK, start the timer',exact:true}).click();page.off('request',seeStart);await expect(page.getByRole('timer')).toBeVisible();await noBrand(page);
 const receiptPromise=page.waitForResponse(response=>response.url().endsWith('/api/assessment/submit'));
 await page.getByRole('button',{name:'Submit assessment',exact:true}).click();const receipt=await (await receiptPromise).json();
 await expect(page.getByRole('heading',{name:'Your assessment results',exact:true})).toBeVisible();await expect(page.getByText('Attempt 1',{exact:true})).toBeVisible();await expect(page.getByText('0 / 100',{exact:false})).toBeVisible();
 expect(JSON.stringify(receipt)).not.toMatch(/question_review|scoring_key|correctAnswer|interpretation|pass_percent|workbook_source/);await expect(page.locator('input')).toHaveCount(0);await noBrand(page);
 await page.screenshot({path:`${directory}/results-${width}.png`,fullPage:true});await page.reload();await expect(page.getByText('Attempt 1',{exact:true})).toBeVisible();
 await page.goto(route);await openDetails(page);await identity(page);await page.getByRole('button',{name:'Start assessment',exact:true}).click();await page.getByRole('button',{name:'OK, start the timer',exact:true}).click();await expect(page.getByRole('timer')).toBeVisible();await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await expect(page.getByText('Attempt 2',{exact:true})).toBeVisible();
});
test('server timeout shows candidate results without answer review',async({page,request})=>{
 const route=await publish(request);await page.goto(route);await openDetails(page);await identity(page);await page.getByRole('button',{name:'Start assessment',exact:true}).click();await page.getByRole('button',{name:'OK, start the timer',exact:true}).click();await expect(page.getByRole('timer')).toBeVisible();
 const active=await (await page.request.get(base+'/api/assessment/me')).json();
 const directory='.wrangler/assessment-state/v3/d1/miniflare-D1DatabaseObject';
 let updated=false;
 for(const file of fs.readdirSync(directory).filter(name=>name.endsWith('.sqlite')&&name!=='metadata.sqlite')){
  const db=new DatabaseSync(path.join(directory,file));
  try{if(db.prepare("SELECT name FROM sqlite_schema WHERE name='attempts'").get() && db.prepare('SELECT id FROM attempts WHERE id=?').get(active.attempt_id)){
   db.prepare('UPDATE attempts SET started_at_ms=?,expires_at_ms=? WHERE id=?').run(Date.now()-600001,Date.now()-1,active.attempt_id);updated=true;
  }}finally{db.close();}
 }
 expect(updated).toBe(true);
 await page.reload();await expect(page.getByRole('heading',{name:'Your time has expired.'})).toBeVisible();await expect(page.getByRole('heading',{name:'Your assessment results'})).toBeVisible();await noBrand(page);
 await expect(page.getByText('This is a short practical screening. It shows how you did on the items tested, not your overall ability.',{exact:true})).toBeVisible();await expect(page.locator('input')).toHaveCount(0);
});
