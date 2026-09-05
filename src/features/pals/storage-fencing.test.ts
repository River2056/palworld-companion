import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,test} from 'vitest';
import {PalDatabase,PalStore,type RouteGenerationContext} from './storage';
import {bundledSnapshotPayload,createCatalogSnapshot,type CatalogSnapshot} from '../../domain/catalog-snapshot';
import {enumerateRoutes,routeWarnings,type Pal,type Base} from './domain';
import {createPalBackup,replacePalBackup} from './backup';
const databases:PalDatabase[]=[];
function connection(name='pal-fence-'+crypto.randomUUID()){const db=new PalDatabase(name);databases.push(db);return db;}
afterEach(async()=>{for(const db of databases)db.close();for(const name of new Set(databases.map(db=>db.name)))await Dexie.delete(name);databases.length=0;});
const pal=(id:string,speciesId:string):Pal=>({id,speciesId,nickname:'',gender:'unknown',passives:[],notes:'',location:'',archived:false});
const base=(work:string):Base=>({id:'base',name:'Base',capacity:2,workerIds:[],slots:[{id:'slot',work,minimum:1,priority:1}]});
async function select(db:PalDatabase,snapshot:CatalogSnapshot){await db.write(async()=>{await db.putSnapshot(snapshot);const meta=(await db.metadata.get('personal'))!;await db.metadata.put({...meta,selectedCatalog:snapshot.id});});}
async function generation(db:PalDatabase):Promise<RouteGenerationContext>{const meta=await db.personalMetadata();return {snapshotId:meta.selectedCatalog,revision:meta.revision};}
async function fixture(){
 const db=connection(),store=new PalStore(db);await db.ready();
 const original=(await db.catalogSnapshots.get((await db.personalMetadata()).selectedCatalog))!;
 const payload=bundledSnapshotPayload();payload.manifest.notes=['Synthetic storage fencing fixture'];
 payload.pals.species.push({...payload.pals.species[0],id:'fixture-species',name:'Fixture species',workSuitability:{...payload.pals.species[0].workSuitability}});
 const changed=await createCatalogSnapshot(payload);return {db,store,original,changed};
}
test('new Pal species and base work validate against the transaction-selected snapshot, not the bundle',async()=>{
 const {db,store,changed}=await fixture();const p=pal('new','fixture-species'),b=base('Kindling');
 const emptyPayload=bundledSnapshotPayload();emptyPayload.pals.species=[];
 const empty=await createCatalogSnapshot(emptyPayload);await select(db,empty);
 const before=await db.personalMetadata();
 await expect(store.savePal(p)).rejects.toThrow('supported species');await expect(store.saveBase(b)).rejects.toThrow('supported work');
 expect(await db.personalMetadata()).toEqual(before);
 await select(db,changed);await store.savePal(p);await store.saveBase(b);
 expect(await db.pals.get(p.id)).toMatchObject(p);expect(await db.bases.get(b.id)).toEqual(b);
 const other=connection(db.name);await select(other,empty);
 await expect(store.savePal({...p,id:'another'})).rejects.toThrow('supported species');
 await expect(store.saveBase({...b,id:'another'})).rejects.toThrow('supported work');
 // Existing retired IDs remain editable without weakening capacity/gender constraints.
 await store.savePal({...p,notes:'retained'});await store.saveBase({...b,name:'Retained'});
 await expect(store.savePal({...p,gender:'invalid'} as unknown as Pal)).rejects.toThrow('gender');
 await expect(store.saveBase({...b,capacity:0})).rejects.toThrow('Capacity');
 await expect(store.saveBase({...b,slots:[...b.slots,{...b.slots[0],id:'new-slot'}]})).rejects.toThrow('supported work');
 expect((await db.bases.get(b.id))?.slots).toEqual(b.slots);
});
test('unknown imported IDs remain editable; new unknown IDs and invalid constraints still reject',async()=>{
 const {store,db,original}=await fixture();const p=pal('legacy','unknown-import'),b=base('Kindling');
 const pair=original.pals.breedingPairs[0],roster=pair.parentIds.map((id,i)=>pal('p'+i,id));
 const route={...enumerateRoutes(roster,pair.childId,4,40,original.pals)[0],sourceVersion:'lost historical version',completed:[]};
 await replacePalBackup(store,createPalBackup({pals:[p],bases:[b],routes:[route]}));
 await store.saveRoute({...route,completed:[route.steps[0].id]});
 expect((await db.routes.get(route.id))?.catalogBinding).toEqual({state:'legacy-unbound',claimedVersion:route.sourceVersion});
 expect((await db.routes.get(route.id))?.steps).toEqual(route.steps);
 await store.savePal({...p,notes:'edited'});await store.saveBase({...b,name:'Edited'});
 await expect(store.savePal({...p,id:'new'})).rejects.toThrow('supported species');
 await expect(store.savePal({...p,notes:'x'.repeat(4001)})).rejects.toThrow('too long');
 await expect(store.saveBase({...b,slots:[{...b.slots[0],priority:0}]})).rejects.toThrow('priority');
 expect((await db.pals.get(p.id))?.speciesId).toBe('unknown-import');
});
test('captured generation is fenced across connections, including selection ABA and unrelated revisions',async()=>{
 const {db,store,original,changed}=await fixture();const other=connection(db.name);
 const pair=original.pals.breedingPairs[0];const roster=pair.parentIds.map((id,i)=>pal('p'+i,id));
 const route={...enumerateRoutes(roster,pair.childId,4,40,original.pals)[0],completed:[]};
 expect(route.steps.length).toBeGreaterThan(0);
 const captured=await generation(db);
 await expect(store.saveRoute(route)).rejects.toThrow('generation context');
 expect(await generation(db)).toEqual(captured);
 await select(other,changed);const afterChange=await db.personalMetadata();
 await expect(store.saveRoute(route,captured)).rejects.toThrow('Data changed');
 // Even a forged current revision cannot bind an old snapshot to a new selection.
 await expect(store.saveRoute(route,{...captured,revision:afterChange.revision})).rejects.toThrow('Data changed');
 expect(await db.personalMetadata()).toEqual(afterChange);expect(await db.routes.count()).toBe(0);
 await select(other,original);await expect(store.saveRoute(route,captured)).rejects.toThrow('Data changed');
 const refreshed=await generation(db);await other.rename('Concurrent edit');
 await expect(store.saveRoute(route,refreshed)).rejects.toThrow('Data changed');
 await store.saveRoute(route,await generation(db));
 expect((await db.routes.get(route.id))?.catalogBinding).toEqual({state:'bound',snapshotId:original.id});
 const saved=(await db.routes.get(route.id))!;
 await select(other,changed);await store.saveRoute({...saved,completed:[saved.steps[0].id]});
 const edited=(await db.routes.get(route.id))!;
 expect(edited.steps).toEqual(saved.steps);expect(edited.catalogBinding).toEqual(saved.catalogBinding);
 expect(edited.sourceVersion).toBe(saved.sourceVersion);
 expect(routeWarnings(edited,roster,original.pals)).toEqual(routeWarnings(saved,roster,original.pals));
});
test('missing exact selection blocks new writes atomically without bundled fallback',async()=>{
 const {db,store,original}=await fixture();await db.write(async()=>{await db.catalogSnapshots.delete(original.id);});
 const before=await db.personalMetadata();
 await expect(store.savePal(pal('p',original.pals.species[0].id))).rejects.toThrow('Selected catalog unavailable');
 await expect(store.saveBase(base(Object.keys(original.pals.species[0].workSuitability)[0]))).rejects.toThrow('Selected catalog unavailable');
 const pair=original.pals.breedingPairs[0],roster=pair.parentIds.map((id,i)=>pal('p'+i,id));
 const route={...enumerateRoutes(roster,pair.childId,4,40,original.pals)[0],completed:[]};
 await expect(store.saveRoute(route,await generation(db))).rejects.toThrow('Generation catalog unavailable');
 expect(await db.personalMetadata()).toEqual(before);expect(await db.pals.count()).toBe(0);expect(await db.bases.count()).toBe(0);expect(await db.routes.count()).toBe(0);
});
