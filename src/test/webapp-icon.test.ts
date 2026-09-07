import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('declares the Palworld artwork as the iOS home-screen icon', () => {
  const html = readFileSync('index.html', 'utf8');

  expect(html).toMatch(/<link\s+rel="apple-touch-icon"\s+href="\/favicon\.png"\s*\/?>/);
});
