import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { workspaceStore, type Workspace } from '../data/workspace';
import type { PersonalDatabase, PersonalMetadata } from '../data/personal-db';
import type { CatalogSnapshot, SnapshotId } from '../domain/catalog-snapshot';
import { planWorkspace } from '../domain/snapshot-planner';

export interface CatalogRuntime {
 metadata: PersonalMetadata;
 snapshots: ReadonlyMap<string, CatalogSnapshot>;
 selected?: CatalogSnapshot;
 resolve: (id: SnapshotId) => CatalogSnapshot | undefined;
}
/** Exact lookup only. Missing and historical references never consult the bundle. */
export async function loadCatalogRuntime(db: PersonalDatabase = workspaceStore): Promise<CatalogRuntime> {
 await db.ready();
 return db.transaction('r', db.metadata, db.catalogSnapshots, async () => {
  const metadata = (await db.metadata.get('personal'))!;
  const snapshots = new Map((await db.catalogSnapshots.toArray()).map(s => [s.id, s]));
  return { metadata, snapshots, selected: snapshots.get(metadata.selectedCatalog), resolve: id => snapshots.get(id) };
 });
}
export function useCatalogRuntime(db: PersonalDatabase = workspaceStore) {
 const [runtime, setRuntime] = useState<CatalogRuntime>();
 const [error, setError] = useState('');
 useEffect(() => {
  let subscription: { unsubscribe(): void } | undefined; let active = true;
  void db.ready().then(() => { if (active) subscription = liveQuery(() => loadCatalogRuntime(db)).subscribe({next: value => {setRuntime(value);setError('');},error: e => setError(String(e))}); }).catch(e => setError(String(e)));
  return () => {active = false;subscription?.unsubscribe();};
 }, [db]);
 return {runtime,error};
}
export const planRuntimeWorkspace = (runtime: CatalogRuntime, data: Workspace) => planWorkspace(runtime.resolve, data.goals.map(g => ({...g, catalogBinding: g.catalogBinding ?? {state: 'legacy-unbound' as const}})), data.stock);
export function goalSnapshot(runtime: CatalogRuntime, goal: Workspace['goals'][number]) {
 return goal.catalogBinding?.state === 'bound' ? runtime.resolve(goal.catalogBinding.snapshotId) : undefined;
}
export const snapshotItemName = (snapshot: CatalogSnapshot | undefined, id: string) => snapshot?.craft.items.find(i => i.id === id)?.name ?? id;
export const goalItemName = (runtime: CatalogRuntime, goal: Workspace['goals'][number]) => snapshotItemName(goalSnapshot(runtime, goal), goal.item);
export const bindingLabel = (goal: Workspace['goals'][number]) => goal.catalogBinding?.state === 'bound' ? goal.catalogBinding.snapshotId : 'legacy-unbound — historical calculation unavailable; adopt explicitly in Settings';
