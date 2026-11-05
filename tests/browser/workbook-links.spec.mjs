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
async function start(page,url){await page.goto(url);await openDetails(page);await page.getByLabel('First name',{exact:true}).fill('Links');await page.getByLabel('Surname',{exact:true}).fill('Synthetic');await page.getByLabel('Email address',{exact:true}).fill('links@example.invalid');await fillScreening(page);await page.getByRole('button',{name:'Start assessment'}).click();await page.getByRole('button',{name:'OK, start the timer',exact:true}).click();await expect(page.getByRole('timer')).toBeVisible();}

test('a cell activity links to its cell, shows instructions, and its text wraps inside the cell',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await start(page,await invitation(request));
 await expect(page.getByText('Use the source totals to calculate the working value',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Show B12 in workbook',exact:true}).click();
 await expect(page.getByLabel('Cell B12',{exact:true})).toBeFocused();
 await page.getByLabel('Cell D5',{exact:true}).fill('A long working note that must wrap inside the cell so that nothing is cut off at the edge');
 const fits=await page.getByLabel('Cell D5',{exact:true}).evaluate(el=>el.scrollHeight<=el.clientHeight+1);
 expect(fits).toBe(true);
 await expect(page.getByLabel('Cell B2',{exact:true})).toBeDisabled();
 expect(errors).toEqual([]);
});

async function invitationWithReference(api){
 await post(api,'admin/login',{key:key()});
 const payload=structuredClone(SYNTHETIC_BATTERY);
 const item=payload.sections.flatMap(s=>s.items).find(i=>i.id==='k1');
 item.prompt='Synthetic question one: check INV-2214 first, then pick option alpha.';
 item.instructions='Find INV-2214 on the Supplier tab (row 4). Then check column A of the Ledger tab for INV-2214.';
 const draft=await post(api,'admin/draft',{slug:'reference-text-'+Date.now(),client_name:'Synthetic client',title:'Reference text browser test',question_payload:payload,scoring_key:SYNTHETIC_BATTERY_KEY});
 await post(api,'admin/publish',{version_id:draft.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic local browser approval only'});
 return (await post(api,'admin/invite',{assessment_id:draft.assessment_id,intended_email:'links@example.invalid'})).invitation_url;
}

test('a reference code such as INV-2214 stays on one line in a question title and its instructions, and keeps the title style',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await start(page,await invitationWithReference(request));
 const question=page.locator('.tta-question').filter({hasText:'check INV-2214 first'});
 await expect(question.locator('legend')).toBeVisible();
 const refs=await question.locator('.tta-ref').evaluateAll(els=>els.map(el=>({text:el.textContent,whiteSpace:getComputedStyle(el).whiteSpace,lines:el.getClientRects().length})));
 expect(refs.map(r=>r.text)).toEqual(['INV-2214','INV-2214','INV-2214']);
 for(const r of refs){expect(r.whiteSpace).toBe('nowrap');expect(r.lines).toBe(1);}
 const titleStyle=await question.locator('legend .tta-ref').evaluate(el=>{const a=getComputedStyle(el),b=getComputedStyle(el.closest('legend'));return {font:a.fontFamily===b.fontFamily,size:a.fontSize===b.fontSize,color:a.color===b.color,margin:a.marginRight};});
 expect(titleStyle).toEqual({font:true,size:true,color:true,margin:'0px'});
 expect(errors).toEqual([]);
});
