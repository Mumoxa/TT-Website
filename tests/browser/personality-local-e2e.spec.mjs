import {test, expect} from '@playwright/test';
import fs from 'node:fs';
import {fillScreening, openDetails} from './helpers/screening.mjs';
import {screeningFixture} from '../helpers/screening-fixture.mjs';

// Requires the isolated local assessment sandbox with ENABLE_HPI_PERSONALITY=true. Never use production.
test('synthetic personality start, save, review, edit and submit on local D1', async ({page, request}) => {
  test.skip(process.env.RUN_PERSONALITY_LOCAL_E2E !== '1', 'Requires explicitly enabled local personality sandbox');
  const base='http://127.0.0.1:8790';
  const key=fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars','utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
  const post=async(path,data)=>request.post(base+'/api/assessment/admin/'+path,{headers:{Origin:base,'x-tt-assessment-admin':'1'},data});
  expect((await post('login',{key})).status()).toBe(200);
  const published=await post('publish',{version_id:'6f1c2a90-9b5e-4c1d-8e3a-0d7b5a2f4c12',content_approved:true,privacy_approved:true,approval_reference:'Synthetic local test only'});
  expect(published.status(), await published.text()).toBe(200);
  await page.goto('/assessments/workplace-personality-profile');
  await expect(page.getByText(/About 10 min; up to 60 min/)).toBeVisible();
  await openDetails(page);
  await page.getByLabel('First name',{exact:true}).fill('Synthetic');
  await page.getByLabel('Surname',{exact:true}).fill('Candidate');
  await page.getByLabel('Email address',{exact:true}).fill('local-test@example.invalid');
  await fillScreening(page,screeningFixture(Math.floor(Math.random()*1000)));
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByText(/You have 60 minutes once you start/)).toBeVisible();
  await page.getByRole('button',{name:'OK, begin'}).click();
  await expect(page.getByText(/You have 60 minutes from the start/)).toBeVisible();
  await page.getByRole('button',{name:'Begin',exact:true}).click();
  const first=page.locator('.wpp-question').first();
  await first.getByRole('radio',{name:'Very Accurate',exact:true}).check();
  await page.getByRole('button',{name:'Review answers',exact:true}).click();
  await expect(page.locator('.wpp-review li').first()).toContainText('Very Accurate');
  await expect(page.locator('.wpp-review li').nth(1)).toContainText('Not answered');
  await page.getByRole('button',{name:'Edit screen 1',exact:true}).click();
  await expect(page.locator('.wpp-question').first().getByRole('radio',{name:'Very Accurate',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Review answers',exact:true}).click();
  await page.getByRole('button',{name:'Submit',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Thank you.'})).toBeVisible();
  await expect(page.getByText(/Extraversion|Conscientiousness/)).toHaveCount(0);
});
