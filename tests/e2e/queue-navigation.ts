import type { Page } from '@playwright/test';

/** Visit the visible compact queue, then restore the working view. */
export async function inQueue(page: Page, assertion: () => Promise<unknown>) {
  const previous = new URL(page.url()).hash;
  const compact = await page.evaluate(() => matchMedia('(max-width: 1100px)').matches);
  if (compact) await page.getByRole('link', { name: 'Queue', exact: true }).click();
  await assertion();
  if (compact && previous === '#/craft') await page.getByRole('link', { name: 'Craft', exact: true }).click();
}
