// Synthetic local-harness data only. Never run against production.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { syntheticTablePackage } from '../fixtures/synthetic-answer-table.mjs';
import { fillScreening, openDetails } from './helpers/screening.mjs';

const base = 'http://127.0.0.1:8790';
const adminKey = () => fs.readFileSync('.wrangler/assessment-sandbox/.dev.vars', 'utf8').match(/^ASSESSMENT_ADMIN_KEY=(.+)$/m)[1];
async function post(api, path, data) {
  const response = await api.post(base + '/api/assessment/' + path, { headers: { Origin: base }, data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
test('synthetic balance table preserves independently editable fields after reload', async ({ page, request }) => {
  const pkg = syntheticTablePackage();
  await post(request, 'admin/login', { key: adminKey() });
  const draft = await post(request, 'admin/draft', { ...pkg, slug: 'synthetic-table-' + Date.now() });
  await post(request, 'admin/publish', { version_id: draft.version_id, content_approved: true, privacy_approved: true, approval_reference: 'Synthetic local browser approval only' });
  const invitation = await post(request, 'admin/invite', { assessment_id: draft.assessment_id, intended_email: 'table@example.invalid' });
  await page.goto(invitation.invitation_url);
  await openDetails(page);
  await page.getByLabel('First name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Surname', { exact: true }).fill('Table');
  await page.getByLabel('Email address', { exact: true }).fill('table@example.invalid');
  await fillScreening(page);
  await page.getByRole('button', { name: 'Start assessment' }).click();
  await page.getByRole('button', { name: 'OK, start the timer', exact: true }).click();
  const table = page.getByRole('table', { name: 'Synthetic response table' });
  await expect(table).toBeVisible();
  await table.getByLabel('Synthetic row 1: choose the side.').selectOption('o1');
  await table.getByLabel('Synthetic row 1: enter the amount.').fill('R100.00');
  await expect(table.getByText('Read as R100.00')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(table.getByLabel('Synthetic row 1: choose the side.')).toHaveValue('o1');
  await expect(table.getByLabel('Synthetic row 1: enter the amount.')).toHaveValue('R100.00');
});
