import 'fake-indexeddb/auto';
import {expect,it} from 'vitest';
import {PalDatabase, PalStore} from './storage';
import {analyzeBase,validateBase,type Base,type Pal} from './domain';
const p:Pal={id:'p',speciesId:'Penguin',nickname:'Pip',gender:'unknown',notes:'',location:'box',passives:[],archived:false};
const base:Base={id:'b',name:'Home',capacity:2,workerIds:['p'],slots:[{id:'w',work:'Watering',minimum:1,priority:2},{id:'c',work:'Cooling',minimum:1,priority:1}]};
it('detects shared-worker shortages instead of counting suitability twice',()=>{
 const result=analyzeBase(base,[p]); expect(result.shortage).toBe(1); expect(result.assignments).toEqual([{palId:'p',slotId:'w'}]);
 expect(()=>validateBase({...base,id:'b2'},[base],[p])).toThrow('two bases');
});
it('round-trips roster and base data, validates assignments and releases archived workers',async()=>{
 const db=new PalDatabase('pals-test-'+crypto.randomUUID()); const store=new PalStore(db);
 await store.savePal(p); await store.saveBase(base); db.close();
 const reopened=new PalDatabase(db.name);const second=new PalStore(reopened);
 expect((await second.snapshot()).pals[0]).toEqual(p);
 expect((await second.snapshot()).bases[0]).toEqual(base);
 await expect(second.saveBase({...base,id:'other'})).rejects.toThrow('two bases');
 await second.savePal({...p,archived:true}); expect((await second.snapshot()).bases[0].workerIds).toEqual([]);
 await second.removePal('p');expect((await second.snapshot()).pals).toEqual([]);await reopened.delete();
});

