import Dexie, {type Table} from 'dexie';
import {validatePal,validateBase,validateRoute,type Pal,type Base,type SavedRoute} from './domain';
export interface PalSnapshot {pals:Pal[];bases:Base[];routes:SavedRoute[]}
export class PalDatabase extends Dexie {
 pals!:Table<Pal,string>;bases!:Table<Base,string>;routes!:Table<SavedRoute,string>;
 constructor(name='palworld-companion-pals'){super(name);this.version(1).stores({pals:'id,speciesId',bases:'id',routes:'id,targetId'});}
}
export class PalStore {
 constructor(public db:PalDatabase=new PalDatabase()){}
 async snapshot():Promise<PalSnapshot>{return this.db.transaction('r',this.db.pals,this.db.bases,this.db.routes,async()=>({pals:(await this.db.pals.toArray()).map(p=>({...p,favorite:p.favorite??false})),bases:await this.db.bases.toArray(),routes:await this.db.routes.toArray()}));}
 async savePal(p:Pal){validatePal(p);await this.db.transaction('rw',this.db.pals,this.db.bases,async()=>{await this.db.pals.put({...p,favorite:p.favorite??false});if(p.archived)await this.release(p.id);});}
 async setFavorite(id:string,favorite:boolean){
  if(typeof favorite!=='boolean')throw new Error('Invalid favorite flag.');
  await this.db.transaction('rw',this.db.pals,async()=>{
   const p=await this.db.pals.get(id);if(!p)throw new Error('Pal no longer exists.');
   // Metadata-only update preserves imported unknown species and all other fields.
   await this.db.pals.put({...p,favorite});
  });
 }
 private async release(id:string){const bases=await this.db.bases.toArray();for(const b of bases)if(b.workerIds.includes(id))await this.db.bases.put({...b,workerIds:b.workerIds.filter(w=>w!==id)});}
 async removePal(id:string){await this.db.transaction('rw',this.db.pals,this.db.bases,async()=>{await this.release(id);await this.db.pals.delete(id);});}
 async saveBase(b:Base){await this.db.transaction('rw',this.db.pals,this.db.bases,async()=>{validateBase(b,await this.db.bases.toArray(),await this.db.pals.toArray());await this.db.bases.put(b);});}
 async removeBase(id:string){await this.db.bases.delete(id);}
 async saveRoute(route:SavedRoute){validateRoute(route);await this.db.routes.put(route);}
 async removeRoute(id:string){await this.db.routes.delete(id);}
}
export const palStore=new PalStore();
