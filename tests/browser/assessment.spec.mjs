import {fillScreening,openDetails} from './helpers/screening.mjs';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {SYNTHETIC} from '../fixtures/synthetic-assessment.mjs';
const base='http://127.0.0.1:8790';
const key=()=>fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars','utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
async function post(api,path,data){const r=await api.post(base+'/api/assessment/'+path,{headers:{Origin:base,'x-tt-assessment-admin':'1'},data});expect(r.status(),await r.text()).toBe(200);return r.json();}
async function invitation(api){
 await post(api,'admin/login',{key:key()});
 const draft=await post(api,'admin/draft',{...SYNTHETIC,slug:'synthetic-browser-'+Date.now()});
 await post(api,'admin/publish',{version_id:draft.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic local browser approval only'});
 return (await post(api,'admin/invite',{assessment_id:draft.assessment_id,intended_email:'browser@example.invalid'})).invitation_url;
}
async function start(page,url){await page.goto(url);await openDetails(page);await page.getByLabel('First name',{exact:true}).fill('Browser');await page.getByLabel('Surname',{exact:true}).fill('Synthetic');await page.getByLabel('Email address',{exact:true}).fill('browser@example.invalid');await fillScreening(page);await page.getByRole('button',{name:'Start assessment'}).click();await expect(page.getByRole('timer')).toBeVisible();}

test('workbook editing, formulas, paste clipping, undo and saved recovery',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,await invitation(request));
 await page.getByRole('button',{name:'Continue to reconciliation'}).click();
 await page.getByLabel('Cell B2',{exact:true}).fill('');await page.getByLabel('Cell C2',{exact:true}).fill('=SUM(B3:B4)');await page.getByLabel('Cell C3',{exact:true}).focus();
 await expect(page.getByLabel('Cell C2',{exact:true})).toHaveValue('500');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('Cell C2',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 // Real clipboardData must be constructed inside the browser.
 await page.getByLabel('Cell F20',{exact:true}).evaluate(el=>{const dt=new DataTransfer();dt.setData('text/plain','1\t2\n3\t4');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));});
 await page.getByLabel('Cell C3',{exact:true}).focus();await expect(page.getByRole('status').filter({hasText:'All changes saved'})).toBeVisible();
 await page.reload();await expect(page.getByRole('timer')).toBeVisible();await page.getByRole('button',{name:'Continue to reconciliation'}).click();
 await expect(page.getByLabel('Cell B2',{exact:true})).toHaveValue('');await expect(page.getByLabel('Cell C2',{exact:true})).toHaveValue('500');await expect(page.getByLabel('Cell F20',{exact:true})).toHaveValue('1');
 await page.screenshot({path:'.wrangler/browser-results/candidate-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'.wrangler/browser-results/candidate-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Submit assessment'}).click();await expect(page.getByText('Assessment complete.',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('duplicate tab conflict stops autosave until server recovery is explicit',async({page,context,request})=>{
 await start(page,await invitation(request));const tab=await context.newPage();await tab.goto('/assessment');await expect(tab.getByRole('timer')).toBeVisible();
 await page.locator('input[name=q1][value=a]').check();await expect(page.getByRole('status').filter({hasText:'All changes saved'})).toBeVisible();
 await tab.locator('input[name=q1][value=b]').check();await expect(tab.getByRole('button',{name:'Load saved work'})).toBeVisible();
 await page.waitForTimeout(1800);const saved=await page.request.get(base+'/api/assessment/me');expect((await saved.json()).responses.mcq.q1).toBe('a');
 await tab.getByRole('button',{name:'Load saved work'}).click();await expect(tab.locator('input[name=q1][value=a]')).toBeChecked();
});

test('admin draft authoring, approval, report and printable formula evidence',async({page,request})=>{
 await start(page,await invitation(request));await page.getByRole('button',{name:'Continue to reconciliation'}).click();await page.getByLabel('Cell C2',{exact:true}).fill('=SUM(B2:B3)');await page.getByRole('button',{name:'Submit assessment'}).click();await expect(page.getByText('Assessment complete.',{exact:true})).toBeVisible();
 await page.goto('/admin/assessments');await page.getByLabel('Admin access key').fill(key());await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Assessment results',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Assessment setup',exact:true}).click();await page.getByLabel('Assessment package (JSON)',{exact:true}).fill(JSON.stringify({...SYNTHETIC,slug:'author-browser-'+Date.now()}));await page.getByRole('button',{name:'Save private draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved');
 await page.getByRole('button',{name:'Results',exact:true}).click();await page.getByRole('button',{name:'View',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Saved cells and formulas',exact:true})).toBeVisible();await expect(page.getByText('=SUM(B2:B3)',{exact:true})).toBeVisible();
 await page.screenshot({path:'.wrangler/browser-results/admin-report.png',fullPage:true});
 await page.emulateMedia({media:'print'});await page.pdf({path:'.wrangler/browser-results/synthetic-report.pdf',format:'A4',printBackground:true});expect(fs.statSync('.wrangler/browser-results/synthetic-report.pdf').size).toBeGreaterThan(10000);
});


test('a lost autosave response preserves server work and requires explicit recovery',async({page,request})=>{
 await start(page,await invitation(request));let dropped=false;
 await page.route('**/api/assessment/save',async route=>{
   const response=await route.fetch();
   if(!dropped && response.status()===200){dropped=true;await route.abort('failed');}else await route.fulfill({response});
 });
 await page.locator('input[name=q1][value=a]').check();
 await expect.poll(()=>dropped).toBe(true);
 await page.locator('input[name=q2][value=b]').check();
 await expect(page.getByRole('button',{name:'Load saved work'})).toBeVisible();
 await expect(page.locator('input[name=q2][value=b]')).toBeChecked();
 const stored=await (await page.request.get(base+'/api/assessment/me')).json();expect(stored.responses.mcq.q1).toBe('a');expect(stored.responses.mcq.q2).toBeUndefined();
 await page.getByRole('button',{name:'Load saved work'}).click();await expect(page.locator('input[name=q1][value=a]')).toBeChecked();await expect(page.locator('input[name=q2][value=b]')).not.toBeChecked();
});

test('existing website routes still render and private results reject anonymous access',async({page,request})=>{
 for(const route of ['/','/profile','/profile/finance','/downloads','/cv-builda','/specs','/offer/1','/admin/offers']){
  const errors=[];const listener=e=>errors.push(e.message);page.on('pageerror',listener);const response=await page.goto(route);expect(response.status()).toBe(200);await expect(page.locator('h1').first()).toBeVisible();expect(errors).toEqual([]);page.off('pageerror',listener);
 }
 const anonymous=await request.get(base+'/api/assessment/admin/list');expect(anonymous.status()).toBe(401);
});
