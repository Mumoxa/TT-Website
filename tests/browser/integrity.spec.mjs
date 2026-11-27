import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {SYNTHETIC_BATTERY,SYNTHETIC_BATTERY_KEY} from '../fixtures/synthetic-battery.mjs';
import {screeningFixture} from '../helpers/screening-fixture.mjs';
import {openDetails,fillScreening,tick} from './helpers/screening.mjs';
/* Integrity checks for ar-clerk-v1 (synthetic content): honesty statement, copy blocking, page-leave recording. */
const base='http://127.0.0.1:8790';
const key=()=>fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars','utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
async function post(api,route,data){const r=await api.post(base+'/api/assessment/'+route,{headers:{Origin:base,'x-tt-assessment-admin':'1'},data});expect(r.status(),await r.text()).toBe(200);return r.json();}
async function publish(api){await post(api,'admin/login',{key:key()});const draft=await post(api,'admin/draft',{slug:'ar-clerk-v1',title:'Accounts Receivable Clerk Assessment',client_name:'Talent Tree',question_payload:SYNTHETIC_BATTERY,scoring_key:SYNTHETIC_BATTERY_KEY});await post(api,'admin/publish',{version_id:draft.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic browser validation only'});}

test('honesty statement gates the start; question text cannot be copied; leaving the page is recorded',async({page,context,request})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
 await publish(request);
 await page.setViewportSize({width:1280,height:900});
 await page.goto('/assessments/ar-clerk-v1');
 await expect(page.getByText('Copying the questions is switched off, and each time you leave the assessment page',{exact:false})).toBeVisible();
 await openDetails(page);
 await page.getByLabel('First name',{exact:true}).fill('Synthetic');await page.getByLabel('Surname',{exact:true}).fill('Candidate');await page.getByLabel('Email address',{exact:true}).fill('integrity@example.invalid');
 const seed=Math.floor(Date.now()/1000)%5000+9000;await fillScreening(page,screeningFixture(seed));
 const start=page.getByRole('button',{name:'Start assessment',exact:true});
 await expect(start).toBeDisabled();
 await tick(page.getByLabel(/I will do this assessment on my own/));
 await expect(start).toBeEnabled();
 await page.screenshot({path:'.wrangler/browser-results/integrity-form.png',fullPage:true});
 await start.click();await page.getByRole('button',{name:'OK, start the timer',exact:true}).click();
 await expect(page.getByText('Copying the questions is switched off, and leaving this page is recorded.',{exact:true})).toBeVisible();
 const me=await (await page.request.get(base+'/api/assessment/me')).json();expect(me.integrity_checks).toBe(true);
 // Select and copy question text: blocked, clipboard untouched, candidate told.
 await page.evaluate(()=>navigator.clipboard.writeText('before'));
 const prompt=page.locator('.tta-run-fields').getByText(/./).first();
 await prompt.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});
 const selected=await page.evaluate(()=>getSelection().toString());
 await page.keyboard.press('Control+C');
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('before');
 await expect(page.locator('.tta-integrity-toast')).toHaveText('Copying is switched off for this assessment.');
 expect(await page.evaluate(()=>getComputedStyle(document.body).userSelect)).toBe('none');
 // An answer box still accepts typing and its own copy and paste, and that internal paste is not counted.
 const box=page.locator('.tta-run-fields input[type="text"]:not([disabled]), .tta-run-fields textarea:not([disabled])').first();
 await box.click();await box.fill('1250');await box.press('Control+A');await box.press('Control+C');
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('1250');
 await box.fill('');await box.press('Control+V');await expect(box).toHaveValue('1250');
 // A paste from outside is counted.
 await page.evaluate(()=>navigator.clipboard.writeText('9999 from elsewhere'));await box.fill('');await box.press('Control+V');
 // Right-click on question text is blocked.
 const menuBlocked=await prompt.evaluate(el=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;});
 expect(menuBlocked).toBe(true);
 // Playwright keeps every page visible and focused, so drive the browser's own signals: the tab is hidden for about
 // 2 s (another tab), then the window loses focus for about 1 s (another window side by side).
 const setState=(hidden,focused)=>page.evaluate(([h,f])=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>h?'hidden':'visible'});document.hasFocus=()=>f;},[hidden,focused]);
 await setState(true,false);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(2200);
 await setState(false,true);await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});await page.waitForTimeout(400);
 await setState(false,false);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(1200);
 await setState(false,true);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(500);
 await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await page.getByRole('button',{name:'Submit now',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your assessment results',exact:true})).toBeVisible();
 const list=await (await request.get(base+'/api/assessment/admin/list')).json();
 const report=await (await request.get(base+'/api/assessment/admin/report/'+me.attempt_id)).json();
 const r=report.integrity;
 expect(r.statement_accepted).toBe(true);
 expect(r.leaves).toBe(2);
 expect(r.away_seconds).toBeGreaterThanOrEqual(3);
 expect(r.away_seconds).toBeLessThanOrEqual(5);
 expect(r.copy_blocked).toBe(1);
 expect(r.outside_pastes).toBe(1);
 expect(selected).toBe(''); // question text cannot even be selected
 expect(list.ok).toBe(true);
 console.log('integrity record', JSON.stringify({...r,basis:undefined}));
});
