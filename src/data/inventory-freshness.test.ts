import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { emptyWorkspace, parseBackup, WorkspaceStore } from './workspace';

const invalidMetadata = [null, [], 'yesterday', 123, {wood: null}, {wood: 123}, {wood: 'not-a-date'}, {wood: '2026-02-30T00:00:00.000Z'}, {wood: '2026-09-06'}, {wood: '2026-09-06T01:02:03'}, {'': '2026-09-06T01:02:03.000Z'}, {absent: '2026-09-06T01:02:03.000Z'}];

test('unavailable database rejects the whole write without refreshing counts or timestamps', async () => {
  const store = new WorkspaceStore('failed-freshness-' + crypto.randomUUID());
  const original = {...emptyWorkspace(), stock: {wood: 3}, stockUpdatedAt: {wood: '2026-09-05T00:00:00.000Z'}};
  try {
    await store.save(original);
    store.close({disableAutoOpen: true});
    await expect(store.save({...original, stock: {wood: 8}, stockUpdatedAt: {wood: '2026-09-06T00:00:00.000Z'}})).rejects.toThrow();
    await store.open();
    expect(await store.load()).toEqual(original);
  } finally { await store.delete(); }
});

test.each(invalidMetadata.map(value => [value]))('rejects invalid freshness metadata without replacing persisted data: %j', async (stockUpdatedAt) => {
  const store = new WorkspaceStore('invalid-freshness-' + crypto.randomUUID());
  const original = {...emptyWorkspace(), stock: {wood: 3}};
  try {
    await store.save(original);
    await expect(store.import(JSON.stringify({...original, stockUpdatedAt}))).rejects.toThrow('Invalid stock timestamp');
    expect(await store.load()).toEqual(original);
  } finally { await store.delete(); }
});

test('legacy and partially timestamped backups leave undocumented counts unknown', async () => {
  const store = new WorkspaceStore('legacy-freshness-' + crypto.randomUUID());
  try {
    for (const data of [
      {...emptyWorkspace(), stock: {wood: 3, 'future-material': 4}},
      {...emptyWorkspace(), stock: {wood: 3, 'future-material': 4}, stockUpdatedAt: {wood: '2026-09-06T01:02:03.000Z'}},
    ]) {
      await store.import(JSON.stringify(data));
      expect(parseBackup(await store.export())).toEqual(data);
      expect((await store.load()).stockUpdatedAt?.['future-material']).toBeUndefined();
    }
    const special = JSON.parse('{"__proto__":2,"constructor":3}');
    const stamps = JSON.parse('{"__proto__":"2026-09-06T01:02:03.000Z","constructor":"2026-09-06T01:02:03.000Z"}');
    const data = {...emptyWorkspace(), stock: special, stockUpdatedAt: stamps};
    await store.save(data);
    expect(parseBackup(await store.export())).toEqual(data);
    expect(Object.prototype).not.toHaveProperty('wood');
  } finally { await store.delete(); }
});

test('inventory timestamps survive save, reload, export and import, including unknown IDs', async () => {
  const store = new WorkspaceStore('freshness-' + crypto.randomUUID());
  const data = {...emptyWorkspace(), stock: {wood: 3, 'future-material': 9}, stockUpdatedAt: {wood: '2026-09-06T01:02:03.000Z', 'future-material': '2026-09-05T04:05:06.123Z'}};
  try {
    await store.save(data);
    expect(await store.load()).toEqual(data);
    const backup = await store.export();
    expect(parseBackup(backup)).toEqual(data);
    await store.reset();
    await store.import(backup);
    expect(await store.load()).toEqual(data);
  } finally { await store.delete(); }
});
