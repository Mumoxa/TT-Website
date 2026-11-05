// Battery items link to their workbook cell, instructions are shown, and cell text wraps instead of being cut off.
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {SYNTHETIC_BATTERY,SYNTHETIC_BATTERY_KEY} from '../fixtures/synthetic-battery.mjs';
import {openDetails,fillScreening} from './helpers/screening.mjs';
const base='http://127.0.0.1:8790';
const key=()=>fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars','utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
async function post(api,route,data){const response=await api.post(base+'/api/assessment/'+route,{headers:{Origin:base,'x-tt-assessment-admin':'1'},data});expect(response.status(),await response.text()).toBe(200);return response.json();}
async function invitation(api){
 await post(api,'admin/login',{key:key()});
 const payload=structuredClone(SYNTHETIC_BATTERY);
 const firstCell=payload.sections.flatMap(s=>s.items).find(item=>item.type==='cell');
 firstCell.instructions='Use the source totals to calculate the working value in the cell named below.';
 const draft=await post(api,'admin/draft',{slug:'workbook-links-'+Date.now(),client_name:'Synthetic client',title:'Workbook links browser test',question_payload:payload,scoring_key:SYNTHETIC_BATTERY_KEY});
 await post(api,'admin/publish',{version_id:draft.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic local browser approval only'});
 return (await post(api,'admin/invite',{assessment_id:draft.assessment_id,intended_email:'links@example.invalid'})).invitation_url;
}
async function start(page,url){await page.goto(url);await openDetails(page);await page.getByLabel('First name',{exact:true}).fill('Links');await page.getByLabel('Surname',{exact:true}).fill('Synthetic');await page.getByLabel('Email address',{exact:true}).fill('links@example.invalid');await fillScreening(page);await page.getByRole('button',{name:'Start assessment'}).click();await expect(page.getByRole('timer')).toBeVisible();}

test('a cell activity links to its cell, shows instructions, and its text wraps inside the cell',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await start(page,await invitation(request));
 await expect(page.getByText('Use the source totals to calculate the working value',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Go to cell B12',exact:true}).click();
 await expect(page.getByLabel('Cell B12',{exact:true})).toBeFocused();
 await page.getByLabel('Cell D5',{exact:true}).fill('A long working note that must wrap inside the cell so that nothing is cut off at the edge');
 const fits=await page.getByLabel('Cell D5',{exact:true}).evaluate(el=>el.scrollHeight<=el.clientHeight+1);
 expect(fits).toBe(true);
 await expect(page.getByLabel('Cell B2',{exact:true})).toBeDisabled();
 expect(errors).toEqual([]);
});
