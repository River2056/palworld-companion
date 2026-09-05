import 'fake-indexeddb/auto';
import {afterEach,expect,it} from 'vitest';
import {cleanup,renderHook,waitFor} from '@testing-library/react';
import {WorkspaceStore} from '../../data/workspace';
import {usePublicationSources} from './usePublicationSources';
afterEach(cleanup);
it('loads retained snapshots locally, invalidates old consent on revision change, blocks stale props',async()=>{
 const db=new WorkspaceStore('guild-semantic-hook-'+crypto.randomUUID());
 try {
  await db.ready();const snapshot=(await db.catalogSnapshots.get((await db.metadata.get('personal'))!.selectedCatalog))!;
  const root=snapshot.craft.recipes[0];
  await db.save({version:1,goals:[{id:'one',item:root.outputItemId,quantity:2,completed:0,notes:''}],stock:{},recent:[]});
  const data=await db.load();
  const hook=renderHook(({workspace})=>usePublicationSources(workspace,db),{initialProps:{workspace:data}});
  await waitFor(()=>expect(hook.result.current.loading).toBe(false));
  const assertOld=hook.result.current.assertCurrent;await assertOld();
  await db.save({...data,goals:[{...data.goals[0],quantity:3}]});
  await expect(assertOld()).rejects.toThrow(/changed after preview/);
  await waitFor(()=>expect(hook.result.current.sources).toEqual([]));
  const next=await db.load();hook.rerender({workspace:next});
  await waitFor(()=>expect(hook.result.current.sources[0]?.quantity).toBe(3));
  await hook.result.current.assertCurrent();
  const assertBeforeMissing=hook.result.current.assertCurrent;
  await db.catalogSnapshots.delete(snapshot.id);
  await expect(assertBeforeMissing()).rejects.toThrow(/catalog source changed after preview/);
  await waitFor(()=>expect(hook.result.current.unavailable).toEqual(['one']));
  expect(hook.result.current.sources).toEqual([]);hook.unmount();
 } finally {await db.delete();}
});
