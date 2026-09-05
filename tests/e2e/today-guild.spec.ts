import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

test('Today guild consent, inert navigation, memory scope, offline recovery and logout', async ({ page, context }, testInfo) => {
  test.skip(process.env.GUILD_E2E !== '1', 'Explicit GUILD_E2E=1 requires real local Auth/PostgREST services.');
  test.setTimeout(90000);
  // Fail visibly if opted in without configuration; never silently skip or reset services.
  const endpoints = JSON.parse(readFileSync(process.env.GUILD_E2E_CONFIG || 'scripts/guild/.local/config.json', 'utf8'));
  const requests: string[] = [], errors: string[] = [], secrets: string[] = [];
  page.on('request', request => {
    if (request.url().startsWith(endpoints.authUrl) || request.url().startsWith(endpoints.restUrl)) requests.push(request.url());
  });
  page.on('response', async response => {
    if (response.url() === `${endpoints.authUrl}/signup`) {
      const body = await response.json();
      if (body.access_token) secrets.push(body.access_token);
    }
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/today');
  await expect(page.getByRole('heading', { name: 'Optional guild planning' })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole('link', { name: 'Open guild workspace', exact: true }).click();
  await page.getByLabel('Auth URL', { exact: true }).fill(endpoints.authUrl);
  await page.getByLabel('REST URL', { exact: true }).fill(endpoints.restUrl);
  const id = randomUUID(), password = `Test-${id}!`, title = `Private task ${id}`, guildName = `Today ${id}`;
  await page.getByLabel('Email', { exact: true }).fill(`today-${id}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Create a new account', { exact: true }).check();
  await expect(page.getByRole('button', { name: 'Sign up', exact: true })).toBeDisabled();
  expect(requests).toEqual([]);
  await page.getByLabel(/I trust both endpoints/).check();
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await page.getByLabel('New guild name').fill(guildName);
  await page.getByRole('button', { name: 'Create guild', exact: true }).click();
  await expect(page.getByText('Your role: owner', { exact: true })).toBeVisible();
  await page.getByLabel('Shared task title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create shared task', exact: true }).click();
  await page.getByRole('button', { name: 'Claim task', exact: true }).click();
  await expect(page.locator('.guild-tasks')).toContainText('Assigned:');
  await expect(page.getByRole('button', { name: 'Refresh from server' })).toBeEnabled();
  const before = requests.length;
  await page.getByRole('navigation').getByRole('link', { name: /Today/ }).click();
  const card = page.getByRole('region', { name: 'Optional guild planning' });
  await expect(card).toContainText('1 assigned active tasks');
  await expect(card).toContainText(title);
  await expect(card).toContainText('unread events since last seen');
  await expect(card).toContainText('Session retained in memory');
  const wrapper = page.locator('.guild-workspace').locator('..');
  await expect(wrapper).toHaveAttribute('hidden', '');
  await expect(wrapper).toHaveAttribute('inert', '');
  await expect(page.getByLabel('Shared task title', { exact: true })).toBeHidden();
  await page.getByLabel('Shared task title', { exact: true }).evaluate(element => (element as HTMLElement).focus());
  expect(await page.locator('.guild-workspace').evaluate(element => element.contains(document.activeElement))).toBe(false);
  // Bounded idle observation plus source inspection; no automatic refresh on navigation.
  await page.waitForTimeout(1100);
  expect(requests).toHaveLength(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(secrets).toHaveLength(1);
  const storage = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
  for (const secret of [id, password, ...secrets]) expect(storage).not.toContain(secret);
  await page.screenshot({ path: testInfo.outputPath('summary.png'), fullPage: true });
  await context.setOffline(true);
  await expect(card).not.toContainText(title);
  await context.setOffline(false);
  expect(requests).toHaveLength(before);
  await page.getByRole('link', { name: 'Refresh deliberately in Guild' }).click();
  await expect(page.getByText(/pending retry payloads were cleared/)).toBeVisible();
  await expect(page.getByLabel('Selected guild')).toHaveValue('');
  await page.getByRole('button', { name: 'Refresh from server' }).click();
  await expect(page.getByLabel('Selected guild')).toBeEnabled();
  await page.getByLabel('Selected guild').selectOption({ label: guildName });
  await expect(page.locator('.guild-tasks')).toContainText(title);
  await page.getByRole('navigation').getByRole('link', { name: /Today/ }).click();
  await expect(card).toContainText(title);
  await page.getByRole('button', { name: 'Sign out of Guild' }).click();
  await expect(card).not.toContainText(title);
  await page.getByRole('link', { name: 'Open guild workspace', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign up', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
