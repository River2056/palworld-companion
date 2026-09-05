import Dexie from 'dexie';
import {PersonalDatabase,binding,scopedSnapshots,type BoundRoute,type SnapshotBackup} from '../../data/personal-db';
import {validatePal,validateBase,validateRoute,type Pal,type Base,type SavedRoute} from './domain';
export interface PalSnapshot {pals:Pal[];bases:Base[];routes:BoundRoute[];catalog?:SnapshotBackup}
export class PalDatabase extends PersonalDatabase {}
export class PalStore {
 constructor(public db:PalDatabase=new PalDatabase()){}
 async snapshot():Promise<PalSnapshot>{await Dexie.waitFor(this.db.ready());return this.db.transaction('r',this.db.tables,async()=>{
  const routes=await this.db.routes.toArray();
  return {pals:(await this.db.pals.toArray()).map(p=>({...p,favorite:p.favorite??false})),bases:await this.db.bases.toArray(),routes,catalog:await scopedSnapshots(this.db,routes.map(r=>binding(r.catalogBinding,r.sourceVersion)))};
 });}
 async savePal(p:Pal){validatePal(p);await this.db.write(async()=>{await this.db.pals.put({...p,favorite:p.favorite??false});if(p.archived)await this.release(p.id);});}
 async setFavorite(id:string,favorite:boolean){
  if(typeof favorite!=='boolean')throw new Error('Invalid favorite flag.');
  await this.db.write(async()=>{const p=await this.db.pals.get(id);if(!p)throw new Error('Pal no longer exists.');await this.db.pals.put({...p,favorite});});
 }
 private async release(id:string){const bases=await this.db.bases.toArray();for(const b of bases)if(b.workerIds.includes(id))await this.db.bases.put({...b,workerIds:b.workerIds.filter(w=>w!==id)});}
 async removePal(id:string){await this.db.write(async()=>{await this.release(id);await this.db.pals.delete(id);});}
 async saveBase(b:Base){await this.db.write(async()=>{validateBase(b,await this.db.bases.toArray(),await this.db.pals.toArray());await this.db.bases.put(b);});}
 async removeBase(id:string){await this.db.write(async()=>{await this.db.bases.delete(id);});}
 async saveRoute(route:SavedRoute){validateRoute(route);await this.db.write(async()=>{
  const old=await this.db.routes.get(route.id);const meta=(await this.db.metadata.get('personal'))!;
  await this.db.routes.put({...route,catalogBinding:old?binding(old.catalogBinding,old.sourceVersion):{state:'bound',snapshotId:meta.selectedCatalog}});
 });}
 async removeRoute(id:string){await this.db.write(async()=>{await this.db.routes.delete(id);});}
}
export const palStore=new PalStore();
