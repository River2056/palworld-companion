import 'fake-indexeddb/auto';
import {expect,it} from 'vitest';
import {enumerateRoutes,routeWarnings,type Pal} from './domain';
import {PalDatabase,PalStore} from './storage';
const pal=(id:string,speciesId:string,gender:Pal['gender']):Pal=>({id,speciesId,gender,nickname:'',notes:'',location:'',passives:[],archived:false});
const roster=[pal('h','RedArmorBird','male'),pal('c','ChickenPal','female')];
it('rejects forward/self graph links without persisting a malformed checklist',async()=>{
 const store=new PalStore(new PalDatabase('bad-route-'+crypto.randomUUID()));
 try {
  const route=enumerateRoutes(roster,'Ronin')[0];
  const broken={...route,completed:[],steps:route.steps.map((s,i)=>i===0?{...s,parents:[`step:${s.id}`,s.parents[1]] as [string,string]}:s)};
  await expect(store.saveRoute(broken)).rejects.toThrow('route');
  expect((await store.snapshot()).routes).toEqual([]);
 } finally {await store.db.delete();}
});
it('warns rather than claiming compatibility when a saved pair or target is unknown',()=>{
 const route=enumerateRoutes(roster,'CaptainPenguin')[0];
 expect(routeWarnings({...route,steps:route.steps.map(s=>({...s,pairId:'removed-pair'}))},roster).join(' ')).toContain('unsupported');
 expect(routeWarnings({...route,targetId:'unknown-species'},roster).join(' ')).toContain('unsupported');
});
it('ranks fewer-step candidates ahead of traversal-order intermediates',()=>{
 const routes=enumerateRoutes([...roster,pal('p','CaptainPenguin','female')],'Ronin');
 expect(routes[0].steps).toHaveLength(1);
 expect(routes.some(r=>r.steps.length===2)).toBe(true);
});
it('preserves stale catalog IDs and keeps manual completion separate from roster/gender success',async()=>{
 const store=new PalStore(new PalDatabase('stale-route-'+crypto.randomUUID()));
 try {
  for(const p of roster)await store.savePal(p);
  const route=enumerateRoutes(roster,'Ronin')[0];
  const saved={...route,sourceVersion:'historical-removed-catalog',completed:route.steps.map(s=>s.id)};
  await store.saveRoute(saved);
  const snapshot=await store.snapshot();
  expect(snapshot.routes[0]).toEqual(saved);
  expect(snapshot.pals).toHaveLength(2);
  expect(routeWarnings(snapshot.routes[0],snapshot.pals).join(' ')).toContain('does not verify gender');
  const oldPair={...saved,steps:saved.steps.map(s=>({...s,pairId:'old-'+s.pairId}))};
  await store.saveRoute(oldPair);
  expect((await store.snapshot()).routes[0].steps[0].pairId).toContain('old-');
  await expect(store.saveRoute({...saved,completed:[saved.completed[0],saved.completed[0]]})).rejects.toThrow('checklist');
 } finally {await store.db.delete();}
});
it('rejects invalid search bounds instead of accidentally unbounding recursion',()=>{
 expect(()=>enumerateRoutes(roster,'Ronin',NaN)).toThrow('bounds');
 expect(()=>enumerateRoutes(roster,'Ronin',4,Infinity)).toThrow('bounds');
});
