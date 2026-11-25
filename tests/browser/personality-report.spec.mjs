import {test,expect} from '@playwright/test';
import {samples,invalid} from '../fixtures/personality-report-samples.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

test('recruiter report selection and browser print use the synthetic dossier',async ({page})=>{
  await page.route('**/api/assessment/admin/**',route=>{
    const url=new URL(route.request().url());
    if (url.pathname.endsWith('/session')) return route.fulfill({json:{ok:true,loggedIn:true}});
    if (url.pathname.endsWith('/list')) return route.fulfill({json:{ok:true,definitions:[],attempts:[{id:'synthetic-attempt-001',first_name:'QA',surname:'Mockrunner',email:'synthetic@example.invalid',client_name:'Talent Tree',title:'Synthetic profile',status:'completed',attempt_number:1}]}});
    if (url.pathname.includes('/report/')) return route.fulfill({json:{ok:true,...samples.mock}});
    return route.abort();
  });
  await page.goto('/admin/assessments');
  await page.getByRole('button',{name:'View',exact:true}).click();
  await expect(page.locator('.pi-page')).toHaveCount(4);
  await expect(page.getByText('QA Mockrunner',{exact:true})).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  await page.emulateMedia({media:'print'});
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await page.pdf({printBackground:true,preferCSSPageSize:true})),useSystemFonts:true}).promise;
  expect(pdf.numPages).toBe(4);
  const text=(await (await pdf.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');
  expect(text).toContain('QA Mockrunner');
  expect(text).not.toContain('Candidate attempts');
  expect(text).not.toContain('not-for-report@example.invalid');
});

test('invalid report is refused in recruiter UI',async({page})=>{
  await page.route('**/api/assessment/admin/**',route=>{
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path.endsWith('/session')?{ok:true,loggedIn:true}:path.endsWith('/list')?{ok:true,definitions:[],attempts:[{id:'synthetic',first_name:'QA',surname:'Mockrunner',email:'',client_name:'',title:'',status:'completed'}]}:{ok:true,...invalid}});
  });
  await page.goto('/admin/assessments');
  await page.getByRole('button',{name:'View',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Report unavailable');
  await expect(page.locator('.pi-page')).toHaveCount(0);
});
