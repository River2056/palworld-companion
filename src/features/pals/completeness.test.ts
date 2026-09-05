import 'fake-indexeddb/auto';
import {expect,it} from 'vitest';
import {enumerateRoutes,routeMetrics,validateRoute,type Pal} from './domain';
import {createPalBackup,validatePalBackup,replacePalBackup} from './backup';
import {PalDatabase,PalStore} from './storage';
const pal=(id:string,speciesId:string,gender:Pal['gender']):Pal=>({id,speciesId,gender,nickname:'',notes:'',location:'',passives:[],archived:false});
const roster=[pal('h','RedArmorBird','male'),pal('c','ChickenPal','female'),pal('p','CaptainPenguin','female')];
it('ranks before limiting and is independent of roster order',()=>{
 const all=enumerateRoutes(roster,'Ronin');
 expect(all[0].steps).toHaveLength(1);
 expect(enumerateRoutes(roster,'Ronin',4,1)).toEqual(all.slice(0,1));
 expect(enumerateRoutes([...roster].reverse(),'Ronin')).toEqual(all);
 for(const route of all)validateRoute({...route,completed:[]});
 expect(routeMetrics(all[0],roster)).toEqual({missingParents:0,stepCount:1,generationDepth:1});
 const deep=all.find(r=>r.steps.length===2)!;
 expect(routeMetrics(deep,roster).generationDepth).toBe(2);
 expect(routeMetrics(all[0],[]).missingParents).toBe(2);
});
it('does not let early intermediate combinations hide cheaper later parents',()=>{
 const many=[...Array.from({length:45},(_,i)=>pal(`hawk-${i}`,'RedArmorBird','male')),roster[1],roster[2]];
 const routes=enumerateRoutes(many,'Ronin');
 expect(routes).toHaveLength(40);
 expect(routes.every(r=>r.steps.length===1)).toBe(true);
 expect(enumerateRoutes([...many].reverse(),'Ronin')).toEqual(routes);
});
it('defaults legacy favorites to false, persists toggles, validates backups and retains unknown IDs',async()=>{
 const store=new PalStore(new PalDatabase('favorite-'+crypto.randomUUID()));
 try {
  await store.db.pals.put(roster[0]);
  expect((await store.snapshot()).pals[0].favorite).toBe(false);
  await store.savePal({...roster[0],favorite:true});
  const backup=createPalBackup(await store.snapshot());
  expect(backup.snapshot.pals[0].favorite).toBe(true);
  backup.snapshot.pals[0].speciesId='legacy-unknown';
  expect(validatePalBackup(backup).backup.snapshot.pals[0]).toMatchObject({speciesId:'legacy-unknown',favorite:true});
  await replacePalBackup(store,backup);
  await store.setFavorite(roster[0].id,false);
  expect((await store.snapshot()).pals[0]).toMatchObject({speciesId:'legacy-unknown',favorite:false});
  expect(()=>validatePalBackup({...backup,snapshot:{...backup.snapshot,pals:[{...roster[0],favorite:'yes'}]}})).toThrow('favorite');
  await expect(store.savePal({...roster[0],favorite:'yes'} as unknown as Pal)).rejects.toThrow('favorite');
 } finally {await store.db.delete();}
});
