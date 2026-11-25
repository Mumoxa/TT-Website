import {test, expect} from '@playwright/test';

// All content and answers in this browser test are synthetic; requests never reach a real assessment API.
for (const width of [390, 1280]) test(`personality review and status polling at ${width}px`, async ({page}, testInfo) => {
  await page.setViewportSize({width, height: 900});
  const now = Date.now();
  const options = ['Very inaccurate', 'Moderately inaccurate', 'Neither', 'Moderately accurate', 'Very accurate'].map((label, i) => ({id: `o${i+1}`, label}));
  const items = Array.from({length: 50}, (_, i) => ({id: `q${i+1}`, prompt: `Synthetic statement ${i+1}`, options}));
  const session = {ok: true, attempt_id: 'synthetic-attempt', status: 'active', first_name: 'Demo', surname: 'Candidate',
    title: 'Workplace personality profile', client_name: 'Example client', started_at_ms: now, expires_at_ms: now + 3600000, server_now_ms: now,
    assessment: {format: 'personality-v1', instructions: 'Describe yourself.', items}, personality: {status: 'draft', revision: 0, answers: {}}};
  let revision = 0, statusPolls = 0;
  await page.route('**/api/assessment/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/me')) {
      if (url.searchParams.get('view') === 'status') {
        statusPolls++;
        return route.fulfill({json: {ok:true, attempt_id:session.attempt_id, status:'active', started_at_ms:now, expires_at_ms:now+3600000, server_now_ms:Date.now()}});
      }
      return route.fulfill({json: session});
    }
    if (url.pathname.endsWith('/save')) return route.fulfill({json: {ok:true, save_revision: ++revision}});
    return route.fulfill({status: 404, json: {ok:false}});
  });
  await page.goto('/assessment');
  await expect(page.getByText(/You have 60 minutes from the start/)).toBeVisible();
  await expect(page.getByText(/There is no time limit/)).toHaveCount(0);
  await page.getByRole('button',{name:'Begin',exact:true}).click();
  await page.getByRole('group',{name:'1. Synthetic statement 1'}).getByLabel('Very accurate',{exact:true}).check();
  const screen10=page.getByRole('button',{name:'Screen 10',exact:true});
  await screen10.evaluate(el => el.scrollIntoView({block:'start'}));
  const positions=await screen10.evaluate(el=>({target:el.getBoundingClientRect().top, header:document.querySelector('.ca-topbar').getBoundingClientRect().bottom}));
  expect(positions.target).toBeGreaterThanOrEqual(positions.header);
  await screen10.click();
  await expect(page.getByText('Screen 10 of 10', {exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Review',exact:true}).click();
  const reviewHeading=page.getByRole('heading',{name:'Review your answers'});
  await expect(reviewHeading).toBeVisible();
  await expect.poll(()=>reviewHeading.evaluate(el=>el.getBoundingClientRect().top - document.querySelector('.ca-topbar').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(0);
  await expect(page.locator('.wpp-review li')).toHaveCount(50);
  await expect(page.locator('.wpp-review li').first()).toContainText('Very accurate');
  await expect(page.locator('.wpp-review li').nth(1)).toContainText('Not answered');
  await page.screenshot({path:testInfo.outputPath('review.png'),fullPage:true});
  await page.getByRole('button',{name:'Edit screen 1',exact:true}).click();
  await expect(page.getByRole('group',{name:'1. Synthetic statement 1'}).getByLabel('Very accurate',{exact:true})).toBeChecked();
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(()=>statusPolls).toBeGreaterThan(0);
  await expect(page.getByRole('group',{name:'1. Synthetic statement 1'}).getByLabel('Very accurate',{exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Review answers',exact:true}).click();
  await expect(page.locator('.wpp-review li').first()).toContainText('Very accurate');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
