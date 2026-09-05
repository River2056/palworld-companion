import { expect, test } from 'vitest';
import { catalog, validateCatalog } from './catalog';
test('selected attributed catalog resolves all references', () => { expect(catalog.recipes).toHaveLength(10); expect(() => validateCatalog(catalog)).not.toThrow(); });
test('rejects duplicate IDs, missing dependencies, cycles and invalid amounts', () => {
 for (const modify of [
  (c: typeof catalog) => c.recipes.push(c.recipes[0]),
  (c: typeof catalog) => { c.recipes[0].inputs[0].item = 'missing'; },
  (c: typeof catalog) => { c.recipes[0].inputs[0].item = 'nail'; },
  ...[0,-1,0.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1].map(n => (c: typeof catalog) => { c.recipes[0].output_count = n; }),
 ]) { const c = structuredClone(catalog); modify(c); expect(() => validateCatalog(c)).toThrow(); }
});
