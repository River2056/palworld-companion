import { expect, test } from '@playwright/test';

test('shell is honest, responsive, navigable, and stays on origin', async ({ page, baseURL }) => {
  const externalRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { if (!request.url().startsWith(baseURL!)) externalRequests.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText(/No plans yet/)).toBeVisible();
  await expect(page.getByText(/No game connection/)).toBeVisible();
  for (const name of ['Breeding', 'Bases', 'Guild']) {
    await page.getByRole('link', {name, exact:true}).click();
    await expect(page.getByRole('heading', {name, exact:true, level:1})).toBeVisible();
    await expect(page.getByRole('main').getByRole('heading', {level:2}).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', {name, exact:true, level:1})).toBeVisible();
  }
  await page.getByRole('link', { name: 'Craft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Craft', exact: true })).toBeVisible();
  await expect(page.getByLabel('Search recipes')).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByText(/Personal planning needs no account and sends no telemetry/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Craft', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Today', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 24, 23)');
  await page.screenshot({ path: test.info().outputPath('shell.png'), fullPage: true });
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('keyboard skip link moves focus into content and unknown routes fall back', async ({ page }) => {
  await page.goto('/#/unknown');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});
