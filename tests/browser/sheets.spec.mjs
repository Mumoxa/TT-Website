import {fillScreening,openDetails} from './helpers/screening.mjs';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {SYNTHETIC_SHEETS_BATTERY,SYNTHETIC_SHEETS_KEY} from '../fixtures/synthetic-battery.mjs';
const base='http://127.0.0.1:8790';
const key=()=>fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars','utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
async function post(api,path,data){const r=await api.post(base+'/api/assessment/'+path,{headers:{Origin:base,'x-tt-assessment-admin':'1'},data});expect(r.status(),await r.text()).toBe(200);return r.json();}
async function tabsInvitation(api){
 await post(api,'admin/login',{key:key()});
 const draft=await post(api,'admin/draft',{slug:'synthetic-tabs-'+Date.now(),client_name:'Synthetic client',title:'Synthetic tabs browser test',question_payload:SYNTHETIC_SHEETS_BATTERY,scoring_key:SYNTHETIC_SHEETS_KEY});
 await post(api,'admin/publish',{version_id:draft.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic local browser approval only'});
 return (await post(api,'admin/invite',{assessment_id:draft.assessment_id,intended_email:'tabs@example.invalid'})).invitation_url;
}
async function start(page,url){await page.goto(url);await openDetails(page);await page.getByLabel('First name',{exact:true}).fill('Tabs');await page.getByLabel('Surname',{exact:true}).fill('Synthetic');await page.getByLabel('Email address',{exact:true}).fill('tabs@example.invalid');await fillScreening(page);await page.getByRole('button',{name:'Start assessment'}).click();await expect(page.getByRole('timer')).toBeVisible();}

test('tabs: read-only source tab is locked, the working tab calculates across tabs, submission completes',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await start(page,await tabsInvitation(request));
 await expect(page.getByRole('tab',{name:'Supplier (read-only)'})).toBeVisible();
 await page.getByRole('tab',{name:'Supplier (read-only)'}).click();
 await expect(page.getByLabel('Supplier cell B2',{exact:true})).toBeDisabled();
 await page.getByRole('tab',{name:'Working'}).click();
 await page.getByLabel('Working cell B2',{exact:true}).fill('=SUM(Supplier!B2:B4)');
 await page.getByLabel('Working cell B3',{exact:true}).fill('=VLOOKUP("S-2",Supplier!A2:B4,2,FALSE)');
 await page.getByLabel('Working cell B4',{exact:true}).fill('=IF(Working!B2=400,"AGREES","DIFFERS")');
 await expect(page.getByLabel('Current value of Working!B2')).toHaveText('400');
 await expect(page.getByLabel('Current value of Working!B3')).toHaveText('250');
 await expect(page.getByLabel('Current value of Working!B4')).toHaveText('AGREES');
 await page.getByLabel('First',{exact:true}).check();
 await expect(page.getByRole('status').filter({hasText:'All changes saved'})).toBeVisible();
 await page.getByRole('button',{name:/Submit assessment/}).click();
 await expect(page.getByRole('heading',{name:'Assessment complete.'})).toBeVisible();
 expect(errors).toEqual([]);
});
