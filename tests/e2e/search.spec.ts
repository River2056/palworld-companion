import { expect, test } from '@playwright/test';

test('material Search finds source-backed Ice Organ methods without overflowing', async ({page}) => {
  const externalRequests: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173')) externalRequests.push(request.url()); });
  await page.goto('/#/search');
  await expect(page.getByRole('heading', {name: 'Search', exact: true})).toBeVisible();
  await page.getByLabel('Search raw materials').fill('ice organ');
  await page.getByRole('button', {name: 'Select Ice Organ'}).click();
  await expect(page.getByRole('heading', {name: 'How to obtain Ice Organ'})).toBeFocused();
  await expect(page.getByRole('heading', {name: 'Pal drops'})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Pengullet map'})).toHaveAttribute('href', /pindrop\.gg\/palworld\/map\?pal=Pengullet/);
  await expect(page.getByRole('link', {name: /map/})).toHaveCount(29);
  await expect(page.getByRole('link', {name: 'Penking map'})).toHaveAttribute('href', /Penking/);
  await expect(page.getByText(/Duneshelter Red Shirt Merchant/)).toBeVisible();
  await expect(page.getByText(/357, 347/)).toBeVisible();
  await expect(page.getByText(/Foxcicle and Mau Cryst/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(externalRequests).toEqual([]);
  await page.screenshot({path: test.info().outputPath('material-search.png'), fullPage: true});
});

test('materials without a detailed guide retain catalog source guidance', async ({page}) => {
  await page.goto('/#/search');
  await page.getByLabel('Search raw materials').fill('wood');
  await page.getByRole('button', {name: 'Select Wood'}).click();
  await expect(page.getByRole('heading', {name: 'How to obtain Wood'})).toBeVisible();
  await expect(page.getByText('Material for structures and items. Can be obtained by cutting trees.')).toBeVisible();
});
