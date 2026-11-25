import {test, expect} from '@playwright/test';

for (const width of [390, 1280]) {
  test(`personality is absent when not in the published catalogue at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.route('**/api/assessment/catalog*', route => route.fulfill({json: [
      {slug: 'accounts-payable', title: 'Accounts Payable', client_name: 'Talent Tree', duration_minutes: 20, section_titles: ['Skills'], item_count: 10},
      {slug: 'accounts-receivable', title: 'Accounts Receivable', client_name: 'Talent Tree', duration_minutes: 20, section_titles: ['Skills'], item_count: 10},
    ]}));
    await page.goto('/assessments');
    const section = page.locator('#assessments');
    await expect(section.getByRole('link', {name: 'View Accounts Payable'})).toBeVisible();
    await expect(section.getByRole('link', {name: 'View Accounts Receivable'})).toBeVisible();
    await expect(section.getByText('Workplace personality profile')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
