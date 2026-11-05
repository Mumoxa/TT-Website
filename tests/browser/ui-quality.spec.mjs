// UI quality suite. Measures every candidate and recruiter screen at phone and desktop widths
// for the defects reported in production: text stacked one character wide, vertical writing,
// text that is hidden or faded when the page loads, overflow, and large blank gaps.
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {SYNTHETIC_BATTERY,SYNTHETIC_BATTERY_KEY} from '../fixtures/synthetic-battery.mjs';
import {openDetails,fillScreening} from './helpers/screening.mjs';

const base=process.env.UI_BASE||'http://127.0.0.1:8790';
const key=()=>fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars','utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
async function post(api,route,data){const response=await api.post(base+'/api/assessment/'+route,{headers:{Origin:base,'x-tt-assessment-admin':'1'},data});expect(response.status(),await response.text()).toBe(200);return response.json();}
async function publishBattery(api){
 await post(api,'admin/login',{key:key()});
 const slug='ui-quality-'+Date.now();
 const draft=await post(api,'admin/draft',{slug,title:'Accounts Payable Clerk Assessment',client_name:'Talent Tree',question_payload:SYNTHETIC_BATTERY,scoring_key:SYNTHETIC_BATTERY_KEY});
 await post(api,'admin/publish',{version_id:draft.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic local UI quality approval only'});
 return slug;
}

/* Serves the catalogue as production does, with the one assessment the test published. The local
   database accumulates test definitions, and the public catalogue returns at most 100 of them. */
async function mockCatalog(page,slug){
 const sections=SYNTHETIC_BATTERY.sections;
 await page.route('**/api/assessment/catalog',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{slug,title:'Accounts Payable Clerk Assessment',client_name:'Talent Tree',duration_minutes:10,section_titles:sections.map(x=>x.title),item_count:sections.reduce((n,x)=>n+x.items.length,0)}])}));
}

/* Runs inside the page. Returns the defects found on the current screen. */
function uiMeasure(){
 const root=document.querySelector('main')||document.body;
 const label=text=>text.trim().replace(/\s+/g,' ').slice(0,60);
 const displayed=el=>{let n=el;while(n&&n!==document.body){const s=getComputedStyle(n);if(s.display==='none')return false;n=n.parentElement;}return true;};
 // Answers inside a closed accordion are collapsed on purpose; only the summary is shown.
 const collapsed=el=>{const d=el.closest('details');return Boolean(d&&!d.open&&!(d.querySelector(':scope > summary')||{contains:()=>false}).contains(el));};
 const srOnly=el=>{const r=el.getBoundingClientRect();return r.width<=1||r.height<=1;};
 const textNodes=[];
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 for(let n=walker.nextNode();n;n=walker.nextNode()){
  const text=n.textContent.trim();if(!text)continue;
  const el=n.parentElement;if(!el||!displayed(el)||srOnly(el)||collapsed(el))continue;
  textNodes.push({n,el,text});
 }
 // Stacked text: several lines, each holding one or two characters. Counts real lines from the layout.
 const stacked=textNodes.filter(({n,el,text})=>{
  if(text.length<6)return false;
  const range=document.createRange();range.selectNodeContents(n);
  const rect=range.getBoundingClientRect();
  const cs=getComputedStyle(el);
  const lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.2;
  const lines=Math.round(rect.height/lh);
  return lines>=4&&text.replace(/\s/g,'').length/lines<3;
 }).map(({text})=>label(text));
 // Hidden content: visible text that is faded or invisible when the page loads.
 const hidden=textNodes.filter(({el})=>{let n=el;while(n&&n!==document.body){const s=getComputedStyle(n);if(s.visibility==='hidden'||Number(s.opacity)<0.5)return true;n=n.parentElement;}return false;}).map(({text})=>label(text));
 const vertical=[...document.querySelectorAll('body *')].filter(el=>getComputedStyle(el).writingMode.startsWith('vertical')).length;
 // Largest blank band: vertical space in the content area not covered by any text, field or button.
 const boxes=[...textNodes.map(({n})=>{const r=document.createRange();r.selectNodeContents(n);return r.getBoundingClientRect();}),...[...root.querySelectorAll('input,select,textarea,button,img,svg')].filter(el=>displayed(el)&&!srOnly(el)).map(el=>el.getBoundingClientRect())].filter(r=>r.width>0&&r.height>0).sort((a,b)=>a.top-b.top);
 let covered=-Infinity,maxGap=0;
 const top=root.getBoundingClientRect().top+scrollY;
 for(const r of boxes){const t=r.top+scrollY;if(covered!==-Infinity&&t-covered>maxGap)maxGap=t-covered;covered=Math.max(covered,r.bottom+scrollY);}
 return {overflowX:document.documentElement.scrollWidth-window.innerWidth,stacked,stackedCount:stacked.length,hidden:hidden.slice(0,8),hiddenCount:hidden.length,vertical,maxGap:Math.round(maxGap),height:Math.round(document.body.scrollHeight)};
}

// Design limits: no blank band taller than 150px on a phone or 220px on a desktop once the page has settled.
const maxGapFor=width=>width<800?150:220;
async function expectClean(page,name,width){
 await page.waitForTimeout(1300);
 // On load: nothing may be hidden or faded, including sections below the fold.
 const onLoad=await page.evaluate(uiMeasure);
 expect(onLoad.hiddenCount,name+' content hidden on load: '+onLoad.hidden.join(' | ')).toBe(0);
 // Then the way a visitor sees it: scroll the whole page, let the reveals settle, and measure the layout.
 await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=240){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,60));}window.scrollTo(0,0);});
 await page.waitForTimeout(900);
 const m=await page.evaluate(uiMeasure);
 console.log(JSON.stringify({screen:name,width,...m,hiddenOnLoad:onLoad.hiddenCount}));
 expect(m.overflowX,name+' horizontal overflow').toBe(0);
 expect(m.vertical,name+' vertical writing').toBe(0);
 expect(m.stacked,name+' text stacked one or two characters per line').toEqual([]);
 expect(m.maxGap,name+' largest blank band (px)').toBeLessThanOrEqual(maxGapFor(width));
}

for(const width of [390,1280]){
 test.describe('UI quality at '+width+'px',()=>{
  test.use({viewport:{width,height:900}});

  test('candidate landing page',async({page})=>{
   // Production publishes one assessment. The local database holds many test definitions, so the
   // catalogue is served as production has it, which keeps the blank-band measurement honest.
   await page.route('**/api/assessment/catalog',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{slug:'ap-clerk-v1',title:'Accounts Payable Clerk Assessment',client_name:'Talent Tree',duration_minutes:10,section_titles:['1. Debits, credits and ledger mechanics','2. Invoices, VAT and accruals','3. Supplier statement reconciliation','4. Payment controls and fraud prevention','5. Aged creditors and month-end accruals'],item_count:23}])}));
   await page.goto(base+'/assessments',{waitUntil:'networkidle'});
   await expectClean(page,'candidate landing',width);
  });

  test('candidate welcome page',async({page,request})=>{
   const slug=await publishBattery(request);
   await mockCatalog(page,slug);
   await page.goto(base+'/assessments/'+slug,{waitUntil:'networkidle'});
   await expectClean(page,'candidate welcome',width);
  });

  test('candidate runner and results',async({page,request})=>{
   const slug=await publishBattery(request);
   await mockCatalog(page,slug);
   await page.goto(base+'/assessments/'+slug,{waitUntil:'networkidle'});
   await openDetails(page);
   await page.getByLabel('First name',{exact:true}).fill('UI');
   await page.getByLabel('Surname',{exact:true}).fill('Quality');
   await page.getByLabel('Email address',{exact:true}).fill('ui-quality@example.invalid');
   await fillScreening(page);
   await page.getByRole('button',{name:'Start assessment',exact:true}).click();
   await expect(page.getByRole('timer')).toBeVisible();
   await expectClean(page,'candidate runner',width);
   await page.getByRole('button',{name:/Submit assessment/}).click();
   await expect(page.getByRole('heading',{name:'Assessment complete.'})).toBeVisible();
   await expectClean(page,'candidate results',width);
  });

  test('recruiter sign-in, results and report',async({page})=>{
   await page.goto(base+'/admin/assessments',{waitUntil:'networkidle'});
   await expectClean(page,'recruiter sign-in',width);
   await page.getByLabel('Admin access key').fill(key());
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
   await page.getByRole('button',{name:'Results',exact:true}).click();
   await expectClean(page,'recruiter results',width);
   await page.getByRole('button',{name:'View',exact:true}).first().click();
   await expectClean(page,'recruiter report',width);
  });
 });
}
