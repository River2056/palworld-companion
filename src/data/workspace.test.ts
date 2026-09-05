import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { WorkspaceStore, emptyWorkspace, parseBackup } from './workspace';
test('Dexie roundtrip retains unknown records and invalid import never replaces data', async () => {
 const store = new WorkspaceStore('test-'+crypto.randomUUID());
 const data = {...emptyWorkspace(),goals:[{id:'g',item:'unknown-id',quantity:3,completed:1,notes:'keep'}],stock:{'unknown-id':4},recent:['nail']};
 await store.save(data);
 const saved={...data,goals:data.goals.map(g=>({...g,catalogBinding:{state:'bound',snapshotId:''}}))};
 saved.goals[0].catalogBinding.snapshotId=(await store.personalMetadata()).selectedCatalog;
 expect(await store.load()).toEqual(saved);
 const text = await store.export(); expect(parseBackup(text)).toEqual(saved);
 await expect(store.import('{"version":2}')).rejects.toThrow(); expect(await store.load()).toEqual(saved);
 const invalid = JSON.parse(text); invalid.workspace.stock.wood = -1;
 await expect(store.import(JSON.stringify(invalid))).rejects.toThrow(); expect(await store.load()).toEqual(saved);
 await store.reset(); expect(await store.load()).toEqual(emptyWorkspace());
 await store.import(text); expect(await store.load()).toEqual(saved); await store.delete();
});
test('backup rejects duplicate goals, invalid progress, unsafe stock and malformed structure', () => {
 for(const value of [null,{}, {...emptyWorkspace(),stock:{wood:1.5}}, {...emptyWorkspace(),goals:[{id:'x',item:'nail',quantity:1,completed:2,notes:''}]}]) expect(()=>parseBackup(JSON.stringify(value))).toThrow();
});
