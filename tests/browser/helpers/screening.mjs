import {expect} from '@playwright/test';
import {screeningFixture} from '../../helpers/screening-fixture.mjs';
// Ticks a checkbox and retries until it is checked. WebKit intermittently ignores a single check() on this form.
export async function tick(locator){await expect(async()=>{if(!(await locator.isChecked()))await locator.click();await expect(locator).toBeChecked({timeout:1000});}).toPass({timeout:10000});}
export async function openDetails(page) {
 await page.getByRole('button',{name:'Continue to details',exact:true}).click();
}
export async function fillScreening(page, fields=screeningFixture()) {
 await page.getByLabel('Contact number',{exact:true}).fill(fields.contact_number);
 await page.getByLabel('South African ID number',{exact:true}).fill(fields.id_number);
 await page.getByLabel('Earliest date you can start (your first day)',{exact:true}).fill(fields.earliest_start_date);
 await tick(page.getByLabel('I confirm this is the first day I can start.',{exact:true}));
 await page.getByLabel('How will you travel to the site?',{exact:true}).selectOption(fields.travel_mode);
 if(['public_transport','other'].includes(fields.travel_mode))await page.getByLabel('Route description',{exact:true}).fill(fields.travel_description);
 await page.getByLabel('Do you have your own transport?',{exact:true}).selectOption(fields.own_transport);
 await page.getByLabel('Are you available for a 2-month assignment?',{exact:true}).selectOption(fields.assignment_available);
 await tick(page.getByLabel('I agree to this processing.',{exact:true}));
}
