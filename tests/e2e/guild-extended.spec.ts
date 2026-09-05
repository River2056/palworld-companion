import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

test('extended guild: quantities, stock CAS, invite revoke, member purge and offline safety', async ({ page, browser, baseURL }) => {
  test.skip(process.env.GUILD_E2E !== '1', 'Requires opt-in and real local guild services.');
  test.setTimeout(90000);
  const { authUrl, restUrl } = JSON.parse(readFileSync(new URL('../../scripts/guild/.local/config.json', import.meta.url), 'utf8')) as { authUrl: string; restUrl: string };
  const suffix = randomUUID();
  const errors: string[] = [];
  const other = await browser.newContext({ baseURL });
  const member = await other.newPage();
  async function signup(p: Page, role: string) {
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => d.accept());
    await p.goto('/#/guild');
    await p.getByLabel('Auth URL', { exact: true }).fill(authUrl);
    await p.getByLabel('REST URL', { exact: true }).fill(restUrl);
    await p.getByLabel(/I trust both endpoints/).check();
    await p.getByLabel('Email', { exact: true }).fill(`${role}-${suffix}@example.test`);
    await p.getByLabel('Password', { exact: true }).fill(`Test-${randomUUID()}!`);
    await p.getByLabel('Create a new account', { exact: true }).check();
    await p.getByRole('button', { name: 'Sign up', exact: true }).click();
    await expect(p.getByText(`Signed in as ${role}-${suffix}@example.test`, { exact: true })).toBeVisible();
  }
  async function refresh(p: Page) {
    await p.getByRole('button', { name: 'Refresh from server', exact: true }).click();
    await expect(p.getByText('Loaded from server. No background sync.', { exact: true })).toBeVisible();
  }
  async function issue() {
    await page.getByRole('button', { name: 'Issue 24-hour invitation', exact: true }).click();
    const token = page.getByLabel('Single-use token — share privately', { exact: true });
    await expect(token).toBeVisible();
    return token.inputValue();
  }
  async function redeem(token: string) {
    await member.getByLabel('Invitation token', { exact: true }).fill(token);
    await member.getByLabel('I accept this invitation and choose to join this shared guild.', { exact: true }).check();
    await member.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  }
  async function stock(p: Page, quantity: string) {
    await p.getByLabel('Shared item reference', { exact: true }).fill('item:wood');
    await p.getByLabel('Shared stock quantity', { exact: true }).fill(quantity);
    await p.getByRole('button', { name: 'Save shared stock', exact: true }).click();
  }
  try {
    await signup(page, 'owner');
    await signup(member, 'member');
    const name = `Extended ${suffix}`;
    await page.getByLabel('New guild name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Create guild', exact: true }).click();
    await expect(page.getByText('Your role: owner', { exact: true })).toBeVisible();
    await page.getByLabel('Rename guild', { exact: true }).fill(`Renamed ${suffix}`);
    await page.getByRole('button', { name: 'Save guild name', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Renamed ${suffix}`, exact: true })).toBeVisible();
    const revoked = await issue();
    await page.getByRole('button', { name: /^Revoke invitation / }).click();
    await expect(page.getByRole('button', { name: /^Revoke invitation / })).toHaveCount(0);
    await expect(page.getByLabel('Single-use token — share privately')).toHaveCount(0);
    await redeem(revoked);
    await expect(member.getByRole('alert')).toContainText('Invalid, used, or expired invite');
    await expect(member.getByRole('heading', { name: `Renamed ${suffix}`, exact: true })).toHaveCount(0);
    await refresh(member);
    await redeem(await issue());
    await expect(member.getByText('Your role: member', { exact: true })).toBeVisible();
    await expect(member.getByRole('group', { name: 'Owner management' })).toHaveCount(0);
    await page.getByText('Create task with details', { exact: true }).click();
    const create = page.getByRole('group', { name: 'Create detailed shared task', exact: true });
    await create.getByLabel('Detailed task title').fill('Private extended wood');
    await create.getByLabel('Task type').fill('gather');
    await create.getByLabel('Description').fill('Private gathering description');
    await create.getByLabel('Requested quantity').fill('20');
    await create.getByLabel('Delivered quantity').fill('4');
    await create.getByLabel('Source reference').fill('item:wood');
    await create.getByLabel('Source requirement identity').fill(`plan:${suffix}:wood`);
    await create.getByLabel('Source checksum').fill('v1');
    await create.getByRole('button', { name: 'Create detailed task' }).click();
    await expect(page.locator('.guild-tasks')).toContainText('4 / 20 delivered');
    const edit = page.getByRole('group', { name: 'Edit shared task', exact: true });
    await edit.getByLabel('Source checksum').fill('v2');
    await expect(edit.getByRole('button', { name: 'Save task' })).toBeDisabled();
    await edit.getByLabel('I reconfirm the changed source plan and quantities').check();
    await edit.getByLabel('Requested quantity').fill('30');
    await edit.getByLabel('Delivered quantity').fill('7');
    await edit.getByRole('button', { name: 'Save task' }).click();
    await expect(page.locator('.guild-tasks')).toContainText('7 / 30 delivered');
    await stock(page, '12');
    await expect(page.getByText('item:wood: 12 · revision 1', { exact: true })).toBeVisible();
    await refresh(member);
    await expect(member.locator('.guild-tasks')).toContainText('7 / 30 delivered');
    await expect(member.locator('.guild-tasks')).toContainText('checksum: v2');
    const change = member.locator('li').filter({ hasText: /^update: Private extended wood/ });
    await expect(change).toContainText('Actor:');
    await expect(change).toContainText('Task:');
    await change.getByText('Change details', { exact: true }).click();
    await expect(change.locator('pre')).toContainText('"delivered_quantity": 4');
    await expect(change.locator('pre')).toContainText('"delivered_quantity": 7');
    await stock(page, '15');
    await expect(page.getByText('item:wood: 15 · revision 2', { exact: true })).toBeVisible();
    await stock(member, '99');
    await expect(member.getByRole('button', { name: 'Reload conflicting tasks' })).toBeVisible();
    await expect(member.getByRole('button', { name: 'Save shared stock' })).toBeDisabled();
    await member.getByRole('button', { name: 'Reload conflicting tasks' }).click();
    await expect(member.getByText('item:wood: 15 · revision 2', { exact: true })).toBeVisible();
    await stock(member, '18');
    await expect(member.getByText('item:wood: 18 · revision 3', { exact: true })).toBeVisible();
    await refresh(page);
    await expect(page.getByText('item:wood: 18 · revision 3', { exact: true })).toBeVisible();
    await other.setOffline(true);
    await member.getByRole('button', { name: 'Refresh from server' }).click();
    await expect(member.getByText(/Disconnected \/ read-only:/)).toBeVisible();
    await expect(member.getByRole('button', { name: 'Save shared stock' })).toBeDisabled();
    await expect(member.locator('.guild-tasks')).toContainText('7 / 30 delivered');
    await other.setOffline(false);
    await refresh(member);
    await page.getByRole('button', { name: /^Remove member / }).click();
    await expect(page.getByRole('button', { name: /^Remove member / })).toHaveCount(0);
    await member.getByRole('button', { name: 'Refresh from server' }).click();
    await expect(member.getByText('Guild membership is no longer available. Private data cleared.', { exact: true })).toBeVisible();
    await expect(member.locator('.guild-tasks')).toHaveCount(0);
    await expect(member.getByText('Private gathering description', { exact: true })).toHaveCount(0);
    await expect(member.getByText('item:wood: 18 · revision 3', { exact: true })).toHaveCount(0);
    await expect(member.getByRole('heading', { name: 'Since last seen' })).toHaveCount(0);
    await expect(member.getByRole('heading', { name: `Renamed ${suffix}`, exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});
