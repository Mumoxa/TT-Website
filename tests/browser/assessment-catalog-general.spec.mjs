import {test, expect} from '@playwright/test';

const examples = [
  {slug:'sample-skills',title:'Example skills assessment',client_name:'Talent Tree',duration_minutes:20,section_titles:['Practical'],item_count:5},
  {slug:'sample-questionnaire',title:'Example questionnaire',client_name:'Talent Tree',kind:'personality',duration_minutes:60,estimated_minutes:10,item_count:50},
];

for (const width of [390, 1280]) {
  test(`the assessment landing page supports different formats at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.route('**/api/assessment/catalog*', route => route.fulfill({json:examples}));
    await page.goto('/assessments');
    await expect(page.getByRole('heading',{level:1,name:'Assessments for candidates.'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Example skills assessment',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Example questionnaire',exact:true})).toBeVisible();
    await expect(page.getByRole('link',{name:'Open Example skills assessment'})).toHaveAttribute('href','/assessments/sample-skills');
    await expect(page.getByRole('link',{name:'Open Example questionnaire'})).toHaveAttribute('href','/assessments/sample-questionnaire');
    await expect(page.getByText('Formats and requirements vary.',{exact:false})).toBeVisible();
    await expect(page.getByText('Every assessment runs the same way, whatever the role.')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('the landing page does not imply a specific assessment when none are open', async ({page}) => {
  await page.route('**/api/assessment/catalog*',route=>route.fulfill({json:[]}));
  await page.goto('/assessments');
  await expect(page.getByRole('status')).toHaveText('No assessments are open right now.');
  await expect(page.getByRole('heading',{level:1,name:'Assessments for candidates.'})).toBeVisible();
  await expect(page.locator('#assessments .ca-card')).toHaveCount(0);
});
