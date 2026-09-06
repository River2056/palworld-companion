import { expect, test, type Page } from '@playwright/test';

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
  expect(new Set(ids).size).toBe(ids.length);
}

test('queue is beside desktop work, a mobile screen, and retains both drafts', async ({ page, isMobile }) => {
  await page.goto('/#/craft');
  await page.getByLabel('Search recipes').fill('arow');
  await page.getByRole('button', { name: 'Select Arrow', exact: true }).click();
  await page.getByLabel('Desired finished units').fill('11');
  await page.getByRole('button', { name: 'Pin craft goal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pin craft goal', exact: true })).toBeEnabled();
  const queue = page.getByRole('complementary', { name: 'Pinned plans' });
  const craft = page.locator('.craft-working-area');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  if (isMobile) {
    await expect(queue).toBeHidden();
    const n = (await nav.boundingBox())!;
    const c = (await craft.boundingBox())!;
    expect(n.y + n.height).toBeLessThan(c.y);
    expect(n.height).toBeLessThan(160);
  } else {
    const n = (await nav.boundingBox())!;
    const c = (await craft.boundingBox())!;
    const q = (await queue.boundingBox())!;
    expect(n.x + n.width).toBeLessThan(c.x);
    expect(c.x + c.width).toBeLessThan(q.x);
    expect(Math.abs(c.y - q.y)).toBeLessThan(2);
  }
  await noOverflow(page);
  // Craft's unsaved state survives the dedicated queue screen.
  await page.getByLabel('Desired finished units').fill('17');
  await nav.getByRole('link', { name: 'Queue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Queue', exact: true })).toBeVisible();
  await expect(queue).toBeVisible();
  await expect(craft).toBeHidden();
  await expect(queue.getByRole('heading', { name: 'Arrow · 0 / 11', exact: true })).toBeVisible();
  await queue.getByText('Edit Arrow / partial progress', { exact: true }).click();
  await queue.getByRole('textbox', { name: /^Notes/ }).fill('Retained queue draft');
  await nav.getByRole('link', { name: 'Craft', exact: true }).click();
  await expect(page.getByLabel('Desired finished units')).toHaveValue('17');
  await nav.getByRole('link', { name: 'Queue', exact: true }).click();
  await expect(queue.getByRole('textbox', { name: /^Notes/ })).toHaveValue('Retained queue draft');
  await queue.getByRole('button', { name: 'Save goal', exact: true }).click();
  await expect(queue.getByRole('button', { name: 'Complete Arrow', exact: true })).toBeEnabled();
  await noOverflow(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Queue', exact: true })).toBeVisible();
  await expect(queue.locator('p').filter({ hasText: /^Retained queue draft$/ })).toBeVisible();
  await expect(queue.getByRole('heading', { name: 'Arrow · 0 / 11', exact: true })).toBeVisible();
  await noOverflow(page);
  // Resizing changes placement, not the owning component or its form state.
  await queue.getByText('Edit Arrow / partial progress', { exact: true }).click();
  await queue.getByRole('textbox', { name: /^Notes/ }).fill('Resize draft');
  await nav.getByRole('link', { name: 'Craft', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(queue.getByRole('textbox', { name: /^Notes/ })).toHaveValue('Resize draft');
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(queue).toBeHidden();
  await noOverflow(page);
  await nav.getByRole('link', { name: 'Queue', exact: true }).click();
  await expect(queue.getByRole('textbox', { name: /^Notes/ })).toHaveValue('Resize draft');
  await noOverflow(page);
});

test('measure shipped-catalog fuzzy search input-to-render latency', async ({ page }, testInfo) => {
  await page.goto('/#/craft');
  await expect(page.getByRole('button', { name: 'Select Arrow', exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input')!;
    const queries = ['arow', 'ingot', 'pal spere', 'nail', 'cloth'];
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const craftableCount = document.querySelectorAll('.search-results button').length;
    const catalog = [...document.querySelectorAll('p')].find(p => p.textContent?.startsWith('Selected reference:'))?.textContent;
    const samples: { query: string; ms: number; results: number; names: string[] }[] = [];
    for (let i = 0; i < 35; i++) {
      const query = queries[i % queries.length];
      const start = performance.now();
      set.call(input, query);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // Two animation frames include React's result commit and a paint opportunity.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const names = [...document.querySelectorAll('.search-results button')].map(button => button.textContent ?? '');
      if (i >= 5) samples.push({ query, ms: performance.now() - start, results: names.length, names });
    }
    return { catalog, craftableCount, samples };
  });
  expect(result.samples).toHaveLength(30);
  expect(result.samples.every(sample => sample.results > 0)).toBe(true);
  const expected: Record<string, string> = { arow: 'Arrow', ingot: 'Ingot', 'pal spere': 'Pal Sphere', nail: 'Nail', cloth: 'Cloth' };
  for (const sample of result.samples) expect(sample.names).toContain(expected[sample.query]);
  expect(result.catalog).toContain('Selected reference:');
  const sorted = result.samples.map(s => s.ms).sort((a, b) => a - b);
  const summary = { project: testInfo.project.name, catalog: result.catalog, samples: sorted.length, minMs: sorted[0], medianMs: (sorted[14] + sorted[15]) / 2, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1), raw: result.samples };
  console.log('SEARCH_MEASUREMENT', JSON.stringify(summary));
  await testInfo.attach('search-latency.json', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
});
