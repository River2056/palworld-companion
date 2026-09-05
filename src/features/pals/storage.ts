import Dexie from 'dexie';
import {PersonalDatabase,binding,scopedSnapshots,type BoundRoute,type SnapshotBackup} from '../../data/personal-db';
import {validatePal,validateBase,validateRoute,type Pal,type Base,type SavedRoute,type PalReference} from './domain';
import type {SnapshotId} from '../../domain/catalog-snapshot';
/** Capture alongside the catalog used to enumerate, never at save-click time. */
export interface RouteGenerationContext {snapshotId:SnapshotId;revision:number}
/** A validation-only allowlist for retained IDs; never used for analysis or names. */
function retainedValidationCatalog(catalog:PalReference,speciesId?:string,works:string[]=[]):PalReference {
 const retained={id:speciesId??'',workSuitability:Object.fromEntries(works.map(work=>[work,0]))} as PalReference['species'][number];
 return {...catalog,species:[...catalog.species,retained]};
}
export interface PalSnapshot {pals:Pal[];bases:Base[];routes:BoundRoute[];catalog?:SnapshotBackup}
export class PalDatabase extends PersonalDatabase {}
export class PalStore {
 constructor(public db:PalDatabase=new PalDatabase()){}
 async snapshot():Promise<PalSnapshot>{await Dexie.waitFor(this.db.ready());return this.db.transaction('r',this.db.tables,async()=>{
  const routes=await this.db.routes.toArray();
  return {pals:(await this.db.pals.toArray()).map(p=>({...p,favorite:p.favorite??false})),bases:await this.db.bases.toArray(),routes,catalog:await scopedSnapshots(this.db,routes.map(r=>binding(r.catalogBinding,r.sourceVersion)))};
 });}
 private async selectedCatalog(){
  const meta=(await this.db.metadata.get('personal'))!;
  const snapshot=await this.db.catalogSnapshots.get(meta.selectedCatalog);
  if(!snapshot)throw new Error('Selected catalog unavailable; restore its exact snapshot before saving.');
  return snapshot.pals;
 }
 async savePal(p:Pal){await this.db.write(async()=>{
  const catalog=await this.selectedCatalog(),old=await this.db.pals.get(p.id);
  // Unknown imported/retired IDs remain editable, but cannot be newly introduced.
  validatePal(p,old?.speciesId===p.speciesId&&p.speciesId?retainedValidationCatalog(catalog,p.speciesId):catalog);
  await this.db.pals.put({...p,favorite:p.favorite??false});if(p.archived)await this.release(p.id);
 });}
 async setFavorite(id:string,favorite:boolean){
  if(typeof favorite!=='boolean')throw new Error('Invalid favorite flag.');
  await this.db.write(async()=>{const p=await this.db.pals.get(id);if(!p)throw new Error('Pal no longer exists.');await this.db.pals.put({...p,favorite});});
 }
 private async release(id:string){const bases=await this.db.bases.toArray();for(const b of bases)if(b.workerIds.includes(id))await this.db.bases.put({...b,workerIds:b.workerIds.filter(w=>w!==id)});}
 async removePal(id:string){await this.db.write(async()=>{await this.release(id);await this.db.pals.delete(id);});}
 async saveBase(b:Base){await this.db.write(async()=>{
  const catalog=await this.selectedCatalog(),old=await this.db.bases.get(b.id);
  const retained=b.slots.filter(s=>old?.slots.some(previous=>previous.id===s.id&&previous.work===s.work));
  if(b.slots.some(s=>!catalog.species.some(p=>Object.hasOwn(p.workSuitability,s.work))&&!retained.includes(s)))throw new Error('Slots need supported work.');
  validateBase(b,await this.db.bases.toArray(),await this.db.pals.toArray(),retainedValidationCatalog(catalog,undefined,retained.map(s=>s.work)));
  await this.db.bases.put(b);
 });}
 async removeBase(id:string){await this.db.write(async()=>{await this.db.bases.delete(id);});}
 async saveRoute(route:SavedRoute,generation?:RouteGenerationContext){validateRoute(route);await this.db.write(async()=>{
  const old=await this.db.routes.get(route.id);const meta=(await this.db.metadata.get('personal'))!;
  if(!old){
   if(!generation)throw new Error('New route requires captured generation context; search again.');
   if(!Number.isSafeInteger(generation.revision)||generation.revision!==meta.revision||generation.snapshotId!==meta.selectedCatalog)throw new Error('Data changed; search again before saving route.');
   if(!await this.db.catalogSnapshots.get(generation.snapshotId))throw new Error('Generation catalog unavailable; restore its exact snapshot.');
  }
  // Checklist edits preserve exact historical provenance, including legacy-unbound.
  await this.db.routes.put({...route,catalogBinding:old?binding(old.catalogBinding,old.sourceVersion):{state:'bound',snapshotId:generation!.snapshotId}});
 });}
 async removeRoute(id:string){await this.db.write(async()=>{await this.db.routes.delete(id);});}
}
export const palStore=new PalStore();
