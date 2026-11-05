import {fillScreening,openDetails} from './helpers/screening.mjs';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {SYNTHETIC_BATTERY,SYNTHETIC_BATTERY_KEY} from '../fixtures/synthetic-battery.mjs';
const base='http://127.0.0.1:8790';
const key=()=>fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars','utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
async function post(api,path,data){const r=await api.post(base+'/api/assessment/'+path,{headers:{Origin:base,'x-tt-assessment-admin':'1'},data});expect(r.status(),await r.text()).toBe(200);return r.json();}
async function batteryInvitation(api){
 await post(api,'admin/login',{key:key()});
 const draft=await post(api,'admin/draft',{slug:'synthetic-battery-'+Date.now(),client_name:'Synthetic client',title:'Synthetic battery browser test',question_payload:SYNTHETIC_BATTERY,scoring_key:SYNTHETIC_BATTERY_KEY});
 await post(api,'admin/publish',{version_id:draft.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic local browser approval only'});
 return (await post(api,'admin/invite',{assessment_id:draft.assessment_id,intended_email:'battery@example.invalid'})).invitation_url;
}
async function start(page,url){await page.goto(url);await openDetails(page);await page.getByLabel('First name',{exact:true}).fill('Battery');await page.getByLabel('Surname',{exact:true}).fill('Synthetic');await page.getByLabel('Email address',{exact:true}).fill('battery@example.invalid');await fillScreening(page);await page.getByRole('button',{name:'Start assessment'}).click();await page.getByRole('button',{name:'OK, start the timer',exact:true}).click();await expect(page.getByRole('timer')).toBeVisible();}

test('battery: sections render, cells calculate, read-only source is locked, submission completes',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await start(page,await batteryInvitation(request));
 await expect(page.getByRole('heading',{name:'Synthetic knowledge'})).toBeVisible();
 // Source cells are read-only; working cells are editable.
 await expect(page.getByLabel('Cell B2',{exact:true})).toBeDisabled();
 await page.getByLabel('Alpha',{exact:true}).check();
 await page.getByLabel(/Synthetic text question/).fill('SYNTHETIC');
 await page.getByLabel('Two',{exact:true}).check();
 await page.getByLabel('Four',{exact:true}).check();
 await page.getByLabel('Safe',{exact:true}).check();
 // Workbook calculations are shown as live values for feedback.
 await page.getByLabel('Cell B12',{exact:true}).fill('=SUM(B2:B4)');
 await page.getByLabel('Cell B13',{exact:true}).fill('=COUNTIF(C2:C4,"OPEN")');
 await expect(page.getByLabel('Current value of B12')).toHaveText('400');
 await expect(page.getByLabel('Current value of B13')).toHaveText('2');
 await expect(page.getByRole('status').filter({hasText:'All changes saved'})).toBeVisible();
 await page.getByRole('button',{name:/Submit assessment/}).click();
 await expect(page.getByRole('heading',{name:'Assessment complete.'})).toBeVisible();
 expect(errors).toEqual([]);

 // Recruiter view: the saved formula is replayed for this candidate's battery attempt.
 await page.goto('/admin/assessments');await page.getByLabel('Admin access key').fill(key());await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Results',exact:true}).click();
 await page.locator('tr',{hasText:'battery@example.invalid'}).first().getByRole('button',{name:'View',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Saved cells and formulas',exact:true})).toBeVisible();
 await expect(page.getByText('=SUM(B2:B4)',{exact:true})).toBeVisible();
});
