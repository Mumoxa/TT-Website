import {test, expect} from '@playwright/test';
import fs from 'node:fs';
import {SYNTHETIC} from '../fixtures/synthetic-assessment.mjs';

const base = 'http://127.0.0.1:8790';
const metadata = [{slug:'accounts-payable-clerk',title:'Accounts Payable Clerk',client_name:'Example client',duration_minutes:10,section_titles:['Technical knowledge','Practical reconciliation'],item_count:6}];
const key = () => fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars','utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
const mockCatalog = page => page.route('**/api/assessment/catalog', route => route.fulfill({json:metadata}));
async function post(api,path,data) {
  const response = await api.post(base+'/api/assessment/'+path,{headers:{Origin:base,'x-tt-assessment-admin':'1'},data});
  expect(response.status(),await response.text()).toBe(200);
  return response.json();
}
async function invite(api, title = metadata[0].title, email = 'design@example.invalid') {
  await post(api,'admin/login',{key:key()});
  const draft=await post(api,'admin/draft',{...SYNTHETIC,slug:'design-test-'+Date.now(),client_name:metadata[0].client_name,title});
  await post(api,'admin/publish',{version_id:draft.version_id,content_approved:true,privacy_approved:true,approval_reference:'Synthetic local design check only'});
  return (await post(api,'admin/invite',{assessment_id:draft.assessment_id,intended_email:email})).invitation_url;
}
async function start(page,url,email = 'design@example.invalid') {
  await page.goto(url);
  await page.getByLabel('First name',{exact:true}).fill('Demo');
  await page.getByLabel('Surname',{exact:true}).fill('Candidate');
  await page.getByLabel('Email address',{exact:true}).fill(email);
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Start assessment',exact:true}).click();
  await expect(page.getByRole('timer')).toBeVisible();
}

test('catalogue and slug routes render metadata; no-invite welcome has no form',async({page})=>{
  await mockCatalog(page);await page.goto('/assessments');
  await expect(page.getByRole('heading',{level:1,name:'Assessments',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Accounts Payable Clerk',exact:true})).toBeVisible();
  await expect(page.getByText('10 minutes, timed',{exact:false})).toBeVisible();
  await page.getByRole('link',{name:'View Accounts Payable Clerk'}).click();
  await expect(page).toHaveURL(/\/assessments\/accounts-payable-clerk$/);
  await expect(page.getByRole('heading',{level:1,name:'Accounts Payable Clerk',exact:true})).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Use the invitation link from your recruiter to begin.');
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.getByText(/executive search|niche skills|established|SATURC/i)).toHaveCount(0);
});

test('catalogue announces loading, empty and error states',async({page})=>{
  let release;
  await page.route('**/api/assessment/catalog',async route=>{await new Promise(resolve=>{release=resolve;});await route.fulfill({json:[]});});
  await page.goto('/assessments');await expect(page.getByRole('status')).toHaveText('Loading assessments…');
  release();await expect(page.getByRole('status')).toHaveText('No assessments are open right now.');
  await page.unroute('**/api/assessment/catalog');
  await page.route('**/api/assessment/catalog',route=>route.fulfill({status:503,json:{}}));
  await page.reload();await expect(page.getByRole('alert')).toContainText('Assessments could not be loaded.');
});

test('unknown slug and bare assessment route remain invitation-only',async({page})=>{
  await mockCatalog(page);await page.goto('/assessments/missing');
  await expect(page.getByRole('heading',{name:'Assessment unavailable',exact:true})).toBeVisible();
  await page.goto('/assessment');await expect(page.getByRole('status')).toHaveText('Use the invitation link from your recruiter to begin.');
  await expect(page.locator('form')).toHaveCount(0);
});

test('slug welcome with an invitation reuses the existing registration and Start API',async({page,request})=>{
  await mockCatalog(page);const invitation=await invite(request);
  await start(page,invitation.replace('/assessment?','/assessments/accounts-payable-clerk?'));
  await expect(page).toHaveURL(base+'/assessment');
  await expect(page.getByRole('timer')).toBeVisible();
});

test('timer live announcements change at minute boundaries only',async({page,request})=>{
  await mockCatalog(page);await page.clock.install();await start(page,await invite(request));
  // Keep the server-status poll on the same virtual clock as the display timer.
  const snapshot=await (await page.request.get(base+'/api/assessment/me')).json();
  const offset=snapshot.server_now_ms-await page.evaluate(()=>Date.now());
  await page.route(/\/api\/assessment\/me\?/,async route=>route.fulfill({json:{...snapshot,server_now_ms:await page.evaluate(()=>Date.now())+offset}}));
  const live=page.getByRole('timer').locator('[aria-live=polite]');await expect(live).toBeEmpty();
  await page.clock.fastForward(60000);await expect(live).toHaveText('9 minutes remaining.');
  await page.clock.fastForward(1000);await expect(live).toHaveText('9 minutes remaining.');
  await page.clock.fastForward(8*60000);await expect(live).toHaveText('One minute remaining. This is the final minute.');
  await page.clock.fastForward(5000);await expect(live).toHaveText('One minute remaining. This is the final minute.');
});

test.describe('brand screenshots at device scale 2',()=>{
  test.use({deviceScaleFactor:2});
  for(const width of [390,1280])test('catalogue, welcome, runner and recruiter at '+width+'px',async({page,request})=>{
    await page.setViewportSize({width,height:900});await mockCatalog(page);
    const directory='.wrangler/brand-screenshots';fs.mkdirSync(directory,{recursive:true});
    await page.goto('/assessments');await expect(page.getByRole('heading',{name:'Accounts Payable Clerk',exact:true})).toBeVisible();
    await page.screenshot({path:`${directory}/catalogue-${width}.png`,fullPage:true});
    await page.getByRole('link',{name:'View Accounts Payable Clerk'}).click();await expect(page.getByRole('status')).toHaveText('Use the invitation link from your recruiter to begin.');
    await page.screenshot({path:`${directory}/welcome-${width}.png`,fullPage:true});
    const email=`design-${width}-${Date.now()}@example.invalid`;
    await start(page,await invite(request,metadata[0].title,email),email);await page.getByRole('button',{name:'Continue to reconciliation'}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(width===390)expect(await page.locator('main').evaluate(el=>getComputedStyle(el).marginLeft)).toBe('16px');
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:`${directory}/runner-${width}.png`,fullPage:true});
    await page.evaluate(()=>window.scrollTo(0,500));await expect(page.getByRole('timer')).toBeInViewport();
    await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await expect(page.getByRole('heading',{name:'Assessment complete.'})).toBeVisible();
    await page.goto('/admin/assessments');await expect(page.getByLabel('Admin access key')).toBeVisible();
    await page.screenshot({path:`${directory}/admin-sign-in-${width}.png`,fullPage:true});
    await page.getByLabel('Admin access key').fill(key());await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Assessment results',exact:true})).toBeVisible();
    await page.getByRole('textbox',{name:'Search assessment results'}).fill(email);
    await page.screenshot({path:`${directory}/admin-results-${width}.png`,fullPage:true});
    await page.locator('tr',{hasText:email}).first().getByRole('button',{name:'View',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Saved cells and formulas',exact:true})).toBeVisible();
    await page.screenshot({path:`${directory}/admin-report-${width}.png`,fullPage:true});
  });
});


test('long published titles and client names wrap within the mobile catalogue',async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await page.route('**/api/assessment/catalog',route=>route.fulfill({json:[{...metadata[0],title:'A'.repeat(160),client_name:'B'.repeat(120)}]}));
  await page.goto('/assessments');await expect(page.getByRole('link',{name:'View '+'A'.repeat(160)})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('invitation metadata stays authoritative when the slug describes another assessment',async({page,request})=>{
  await page.route('**/api/assessment/catalog',route=>route.fulfill({json:[{...metadata[0],section_titles:['Unrelated published section'],item_count:99}]}));
  const invitation=await invite(request,'Invited assessment');
  await page.goto(invitation.replace('/assessment?','/assessments/accounts-payable-clerk?'));
  await expect(page.getByRole('heading',{level:1,name:'Invited assessment',exact:true})).toBeVisible();
  await expect(page.getByText('Unrelated published section',{exact:true})).toHaveCount(0);
});
