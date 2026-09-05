import Dexie, {type Table} from 'dexie';
import {createBundledCatalogSnapshot, importCatalogSnapshot, canonicalJson, type CatalogSnapshot, type CatalogBinding, type SnapshotId} from '../domain/catalog-snapshot';
import type {Workspace} from './workspace';
import type {Pal, Base, SavedRoute} from '../features/pals/domain';
export type BoundRoute = SavedRoute & {catalogBinding?:CatalogBinding};
export interface PersonalMetadata {key:'personal';id:string;name:string;revision:number;selectedCatalog:SnapshotId;consolidated:true}
export interface BindingChange {kind:'goal'|'route';id:string;before:CatalogBinding;after:CatalogBinding;beforeRecipeId?:string;afterRecipeId?:string}
export interface MigrationHistory {id:string;before:SnapshotId;after:SnapshotId;changes:BindingChange[];revision:number}
export function binding(value:unknown, claimedVersion?:string):CatalogBinding {
 if(value===undefined)return {state:'legacy-unbound',...(claimedVersion===undefined?{}:{claimedVersion})};
 if(!value||typeof value!=='object')throw new Error('Invalid catalog binding');
 const b=value as CatalogBinding;
 if(b.state==='bound'&&typeof b.snapshotId==='string'&&/^sha256:[a-f0-9]{64}$/.test(b.snapshotId))return {state:'bound',snapshotId:b.snapshotId};
 if(b.state==='legacy-unbound'&& (b.claimedVersion===undefined||typeof b.claimedVersion==='string'))return {state:'legacy-unbound',...(b.claimedVersion===undefined?{}:{claimedVersion:b.claimedVersion})};
 throw new Error('Invalid catalog binding');
}
/** Upgrade and rename, rather than merely mark, the old stores. Dexie v1 retries
 * VersionError with an unversioned open, so a version bump alone is not a fence.
 * Renaming preserves every raw row/index as a recovery backup while making the
 * original client's named-store transactions fail. The versionchange is atomic.
 */
async function fenceLegacy(name:string,target:string):Promise<void>{
 await new Promise<void>((resolve,reject)=>{
  let abandoned=false;
  // Dexie repairs missing stores by opening native version + 1. Reserve
  // the maximum WebIDL-safe version for this archival database, so that
  // repair attempt is rejected by IndexedDB rather than recreating stores.
  const request=indexedDB.open(name,Number.MAX_SAFE_INTEGER);
  // Chromium can report blocked while a just-closed Dexie connection drains.
  // Allow that close to finish, but fail boundedly for a noncooperating tab.
  let blockedTimer:ReturnType<typeof setTimeout>|undefined;
  request.onblocked=()=>{blockedTimer=setTimeout(()=>{abandoned=true;reject(new Error('Legacy database is open in another tab; close it and retry'));},100);};
  request.onupgradeneeded=()=>{
   clearTimeout(blockedTimer);
   const tx=request.transaction!;
   if(abandoned){tx.abort();return;}
   try{
    for(const store of ['pals','bases','routes']){
     const backup=`legacy${store[0].toUpperCase()}${store.slice(1)}`;
     if(request.result.objectStoreNames.contains(store)){
      if(request.result.objectStoreNames.contains(backup))throw new Error('Conflicting legacy recovery stores');
      tx.objectStore(store).name=backup;
     }
     if(!request.result.objectStoreNames.contains(backup))throw new Error(`Missing legacy store: ${store}`);
    }
    const marker=request.result.objectStoreNames.contains('consolidation')?tx.objectStore('consolidation'):request.result.createObjectStore('consolidation',{keyPath:'id'});
    marker.put({id:'read-only',target,backupStores:['legacyPals','legacyBases','legacyRoutes']});
   }catch(error){tx.abort();reject(error);}
  };
  request.onerror=()=>{clearTimeout(blockedTimer);reject(request.error);};
  request.onsuccess=()=>{
   clearTimeout(blockedTimer);
   const names=request.result.objectStoreNames;
   const fenced=['pals','bases','routes'].every(store=>!names.contains(store)&&names.contains(`legacy${store[0].toUpperCase()}${store.slice(1)}`));
   request.result.close();
   if(!abandoned){if(fenced)resolve();else reject(new Error('Legacy database archive fence is incomplete'));}
  };
 });
}
/** All production facades share this schema/name; named test DBs remain isolated. */
export class PersonalDatabase extends Dexie {
 workspaces!:Table<{id:string;data:Workspace},string>;
 metadata!:Table<PersonalMetadata,string>;
 catalogSnapshots!:Table<CatalogSnapshot,string>;
 pals!:Table<Pal,string>;bases!:Table<Base,string>;routes!:Table<BoundRoute,string>;
 migrationHistory!:Table<MigrationHistory,string>;
 private readiness?:Promise<void>;
 constructor(name='palworld-companion',private legacyName:string|false=name==='palworld-companion'?'palworld-companion-pals':false){
  super(name);this.version(1).stores({workspaces:'id',pals:'id,speciesId',bases:'id',routes:'id,targetId'});
  this.version(2).stores({workspaces:'id',pals:'id,speciesId',bases:'id',routes:'id,targetId',metadata:'key',catalogSnapshots:'id',migrationHistory:'id'});
 }
 async ready():Promise<void>{
  if(!this.readiness)this.readiness=this.initialize().catch(e=>{this.readiness=undefined;throw e;});
  await this.readiness;
 }
 private async initialize(){
  // Also repair databases consolidated by the former marker-only implementation.
  const hasLegacy=this.legacyName&&await Dexie.exists(this.legacyName);
  if(hasLegacy)await fenceLegacy(this.legacyName as string,this.name);
  if(await this.metadata.get('personal'))return;
  const snapshot=await createBundledCatalogSnapshot();
  let copied:{pals:Pal[];bases:Base[];routes:BoundRoute[]}|undefined;
  if(hasLegacy){
   const legacy=new Dexie(this.legacyName as string);
   try{
    await legacy.open();
    const raw=await legacy.transaction('r',legacy.tables,async()=>({pals:await legacy.table('legacyPals').toArray(),bases:await legacy.table('legacyBases').toArray(),routes:await legacy.table('legacyRoutes').toArray()}));
    const {createPalBackup}=await import('../features/pals/backup');
    copied=createPalBackup(raw).snapshot;
   }finally{legacy.close();}
  }
  const {parseBackup}=await import('./workspace');
  await this.transaction('rw',this.tables,async()=>{
   if(await this.metadata.get('personal'))return;
   const row=await this.workspaces.get('personal');
   if(row){const data=parseBackup(JSON.stringify(row.data));data.goals=data.goals.map(g=>({...g,catalogBinding:binding(g.catalogBinding)}));await this.workspaces.put({id:'personal',data});}
   if(copied){await this.pals.bulkPut(copied.pals);await this.bases.bulkPut(copied.bases);await this.routes.bulkPut(copied.routes.map(r=>({...r,catalogBinding:binding(r.catalogBinding,r.sourceVersion)})));}
   // Named legacy Pal DBs are upgraded in place without guessing their provenance.
   for(const r of await this.routes.toArray())if(!r.catalogBinding)await this.routes.put({...r,catalogBinding:binding(undefined,r.sourceVersion)});
   await this.putSnapshot(snapshot);
   await this.metadata.add({key:'personal',id:crypto.randomUUID(),name:'Personal workspace',revision:0,selectedCatalog:snapshot.id,consolidated:true});
  });
 }
 async putSnapshot(snapshot:CatalogSnapshot){const old=await this.catalogSnapshots.get(snapshot.id);if(old&&canonicalJson(old)!==canonicalJson(snapshot))throw new Error('Immutable snapshot collision');if(!old)await this.catalogSnapshots.add(snapshot);}
 async write<T>(operation:()=>Promise<T>,expectedRevision?:number):Promise<T>{
  await this.ready();
  return this.transaction('rw',this.tables,async()=>{
   const meta=(await this.metadata.get('personal'))!;
   if(expectedRevision!==undefined&&meta.revision!==expectedRevision)throw new Error('Data changed; preview again');
   const result=await operation();
   const current=(await this.metadata.get('personal'))!;
   await this.metadata.put({...current,revision:meta.revision+1});return result;
  });
 }
 async personalMetadata(){await this.ready();return (await this.metadata.get('personal'))!;}
 async rename(name:string){name=name.trim();if(!name||name.length>100)throw new Error('Workspace name must be 1–100 characters');await this.write(async()=>{const m=(await this.metadata.get('personal'))!;await this.metadata.put({...m,name});});}
 async resolveSnapshot(id:SnapshotId){await this.ready();return this.catalogSnapshots.get(id);}
}
export interface SnapshotBackup {snapshots:CatalogSnapshot[];metadata?:Pick<PersonalMetadata,'id'|'name'|'selectedCatalog'>}
/** Synchronous parser checks shape; cryptographic validation happens before any write. */
export function importBudget(value:unknown){
 const text=JSON.stringify(value);
 if(text===undefined)throw new Error('Invalid backup');
 if(text.length>10*1024*1024||new TextEncoder().encode(text).length>10*1024*1024)throw new Error('Backup exceeds 10 MiB');
 const visit=(v:unknown,depth:number)=>{
  if(depth>100)throw new Error('Backup nesting limit');
  if(v&&typeof v==='object'){
   const entries=Object.values(v);
   if(entries.length>10000)throw new Error('Backup record count exceeds 10000');
   for(const child of entries)visit(child,depth+1);
  }
 };
 visit(value,0);
}
export function requireBackupBindings(snapshots:CatalogSnapshot[],bindings:CatalogBinding[]){const ids=new Set(snapshots.map(s=>s.id));for(const b of bindings)if(b.state==='bound'&&!ids.has(b.snapshotId))throw new Error('Missing bound catalog snapshot');}
export async function verifyBackupSnapshots(values:readonly unknown[]=[]){
 importBudget(values);if(!Array.isArray(values)||values.length>100)throw new Error('Invalid snapshot count');
 const snapshots=await Promise.all(values.map(importCatalogSnapshot));
 if(new Set(snapshots.map(s=>s.id)).size!==snapshots.length)throw new Error('Duplicate snapshot ID');
 return snapshots;
}
export async function scopedSnapshots(db:PersonalDatabase,bindings:CatalogBinding[]):Promise<SnapshotBackup>{
 const metadata=(await db.metadata.get('personal'))!;
 const ids=new Set([metadata.selectedCatalog,...bindings.flatMap(b=>b.state==='bound'?[b.snapshotId]:[])]);
 const snapshots=(await db.catalogSnapshots.bulkGet([...ids])).filter((s):s is CatalogSnapshot=>!!s);
 return {snapshots,metadata:{id:metadata.id,name:metadata.name,selectedCatalog:metadata.selectedCatalog}};
}
