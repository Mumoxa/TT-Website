import AxeBuilder from '@axe-core/playwright';
import { expect, test } from 'playwright/test';

async function expectNoSeriousAccessibilityViolations(page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = result.violations.filter(({ impact }) =>
    ['serious', 'critical'].includes(impact),
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test('the marketing site links to CV Builda', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Specialist recruitment built on reputation.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CV Builda' })).toHaveAttribute('href', '/cv-builda');
  await expectNoSeriousAccessibilityViolations(page);
});

test('CV Builda supports direct access and refresh', async ({ page }) => {
  await page.goto('/cv-builda');
  await expect(page.getByRole('heading', { name: 'Talent Tree CV Builda' })).toBeVisible();
  await expect(page.getByLabel('Choose CV')).toHaveAttribute('accept', '.docx,.pdf');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Talent Tree CV Builda' })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test('CV Builda does not create persistent browser data', async ({ page, context }) => {
  await page.goto('/cv-builda');
  await expect(page.getByRole('heading', { name: 'Talent Tree CV Builda' })).toBeVisible();

  const storage = await page.evaluate(async () => ({
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
    indexedDatabases: typeof indexedDB.databases === 'function'
      ? (await indexedDB.databases()).map(({ name }) => name)
      : [],
    caches: 'caches' in globalThis ? await caches.keys() : [],
  }));
  expect(storage).toEqual({ localStorage: [], sessionStorage: [], indexedDatabases: [], caches: [] });
  expect(await context.cookies()).toEqual([]);
});
