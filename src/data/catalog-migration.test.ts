import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,test,vi} from 'vitest';
import {WorkspaceStore,emptyWorkspace} from './workspace';
import {PalStore,PalDatabase} from '../features/pals/storage';
import {createPalBackup,replacePalBackup} from '../features/pals/backup';
import {bundledSnapshotPayload,createCatalogSnapshot} from '../domain/catalog-snapshot';
import {previewCatalogMigration,acceptCatalogMigration,cancelCatalogMigration,previewCatalogRollback} from './catalog-migration';
import {PersonalDatabase,verifyBackupSnapshots} from './personal-db';
const dbs:Dexie[]=[];
const store=()=>{const s=new WorkspaceStore('migration-'+crypto.randomUUID());dbs.push(s);return s;};
const goal={id:'g',item:'nail',quantity:3,completed:1,notes:'keep'};
test('missing snapshot bytes and legacy missing records retain unresolved identities in both scopes',async()=>{
 const db=store();await db.ready();const meta=await db.personalMetadata();
 const missing=`sha256:${'a'.repeat(64)}` as const;
 await db.import(JSON.stringify({schemaVersion:2,scope:'craft',snapshots:[],workspace:{...emptyWorkspace(),goals:[{...goal,item:'removed',recipeId:'removed-recipe',catalogBinding:{state:'bound',snapshotId:missing}}]}}));
 expect((await db.load()).goals[0]).toMatchObject({item:'removed',recipeId:'removed-recipe',catalogBinding:{state:'bound',snapshotId:missing}});
 expect(await db.resolveSnapshot(missing)).toBeUndefined();
 const pals=new PalStore(db as PalDatabase);const backup=createPalBackup({pals:[{id:'p',speciesId:'removed',nickname:'old',gender:'unknown',passives:[],notes:'keep',location:'box',archived:false,favorite:true}],bases:[],routes:[{id:'r',targetId:'removed',sourceVersion:'claimed only',conditional:true,completed:['s'],steps:[{id:'s',pairId:'removed-pair',childId:'removed',parents:['owned:p','owned:missing'],conditional:true}]}]});
 backup.schemaVersion=1;delete backup.catalog;await replacePalBackup(pals,backup);
 expect((await pals.snapshot()).routes[0]).toMatchObject({catalogBinding:{state:'legacy-unbound',claimedVersion:'claimed only'},completed:['s']});
 const bound=createPalBackup(await pals.snapshot());bound.catalog!.snapshots=[];bound.snapshot.routes[0].catalogBinding={state:'bound',snapshotId:missing};
 await replacePalBackup(pals,bound);expect((await pals.snapshot()).routes[0].catalogBinding).toEqual({state:'bound',snapshotId:missing});
 expect(await db.personalMetadata()).toMatchObject({id:meta.id,name:meta.name,selectedCatalog:meta.selectedCatalog});
 expect((await db.load()).goals[0].item).toBe('removed');
 await db.import(JSON.stringify({...emptyWorkspace(),goals:[{...goal,item:'removed'}]}));
 expect((await db.load()).goals[0]).toEqual({...goal,item:'removed',catalogBinding:{state:'legacy-unbound'}});
 expect((await pals.snapshot()).pals[0].favorite).toBe(true);
});
test('byte and record budgets reject before hashing, including object Pal import and candidate preview',async()=>{
 const db=store();await db.ready();const before=await db.personalMetadata();const digest=vi.spyOn(crypto.subtle,'digest');
 await expect(verifyBackupSnapshots(Array(101).fill({}))).rejects.toThrow('snapshot count');
 await expect(verifyBackupSnapshots([{items:Array(10001).fill('x')}])).rejects.toThrow('record count');
 await expect(previewCatalogMigration(db,{items:Array(10001).fill('x')})).rejects.toThrow('record count');
 await expect(db.import(JSON.stringify({...emptyWorkspace(),stock:Object.fromEntries(Array.from({length:10001},(_,i)=>[String(i),1]))}))).rejects.toThrow('record count');
 await expect(replacePalBackup(new PalStore(db as PalDatabase),{padding:'x'.repeat(10*1024*1024)})).rejects.toThrow('10 MiB');
 expect(digest).not.toHaveBeenCalled();expect(await db.personalMetadata()).toEqual(before);
});
test('both scoped exports retain selected and historical bound bytes; malformed IDs and duplicates never write',async()=>{
 const db=store();await db.save({...emptyWorkspace(),goals:[goal]});const pals=new PalStore(db as PalDatabase);const original=(await db.personalMetadata()).selectedCatalog;
 const c=await candidate();const pair=c.pals.breedingPairs[0];const generation=await db.personalMetadata();await pals.saveRoute({id:'r',targetId:pair.childId,sourceVersion:'label',conditional:true,completed:[],steps:[{id:'s',pairId:pair.id,childId:pair.childId,parents:['owned:a','owned:b'],conditional:true}]},{snapshotId:generation.selectedCatalog,revision:generation.revision});
 const p=await previewCatalogMigration(db,c,{goals:{g:'keep'},routes:{r:'keep'}});await acceptCatalogMigration(db,p.id,p.expectedRevision);
 const craft=JSON.parse(await db.export());const pal=createPalBackup(await pals.snapshot());
 expect(craft.snapshots.map((s:{id:string})=>s.id).sort()).toEqual([original,c.id].sort());expect(pal.catalog!.snapshots.map(s=>s.id).sort()).toEqual([original,c.id].sort());
 const before=await db.personalMetadata();
 for(const id of ['sha256:bad',`sha256:${'A'.repeat(64)}`]){
  const bad=structuredClone(craft);bad.snapshots[0].id=id;await expect(db.import(JSON.stringify(bad))).rejects.toThrow();
  const badPal=structuredClone(pal);badPal.catalog!.snapshots[0]={...badPal.catalog!.snapshots[0],id:id as `sha256:${string}`};await expect(replacePalBackup(pals,badPal)).rejects.toThrow();
 }
 const duplicate=structuredClone(craft);duplicate.snapshots.push(duplicate.snapshots[0]);await expect(db.import(JSON.stringify(duplicate))).rejects.toThrow('Duplicate snapshot');expect(await db.personalMetadata()).toEqual(before);
});
async function candidate(){const p=bundledSnapshotPayload();p.manifest.notes=['synthetic migration'];return createCatalogSnapshot(p);}
test('intermediate recipe changes are visible and a separate facade edit invalidates preview',async()=>{
 const db=store();await db.save({...emptyWorkspace(),goals:[goal]});
 const payload=bundledSnapshotPayload();const root=payload.craft.recipes.find(r=>r.id==='nail')!;
 const intermediate=payload.craft.recipes.find(r=>root.inputs.some(i=>i.item===r.outputItemId))!;
 expect(intermediate).toBeDefined();intermediate.output_count+=1;
 const p=await previewCatalogMigration(db,await createCatalogSnapshot(payload));
 expect(p.references[0]).toMatchObject({status:'changed'});expect(p.references[0].references).toContain(intermediate.outputItemId);
 const second=new PalDatabase(db.name);dbs.push(second);const pals=new PalStore(second);
 await pals.savePal({id:'p',speciesId:payload.pals.species[0].id,nickname:'new',gender:'unknown',passives:[],notes:'',location:'box',archived:false,favorite:true});
 await expect(acceptCatalogMigration(db,p.id,p.expectedRevision)).rejects.toThrow('Data changed');
 expect((await db.load()).goals[0].catalogBinding).not.toEqual({state:'bound',snapshotId:p.candidateId});
});
afterEach(async()=>{vi.restoreAllMocks();const all=dbs.splice(0);for(const db of all)db.close();for(const name of new Set(all.map(db=>db.name)))await Dexie.delete(name);});
test('new saves bind; legacy import is explicit unbound; cancel writes nothing and stale proposals reject',async()=>{
 const db=store();await db.save({...emptyWorkspace(),goals:[goal]});
 expect((await db.load()).goals[0]).toMatchObject({catalogBinding:{state:'bound'},recipeId:'nail'});
 await db.import(JSON.stringify({...emptyWorkspace(),goals:[goal]}));
 expect((await db.load()).goals[0].catalogBinding).toEqual({state:'legacy-unbound'});
 const before=await db.personalMetadata();const count=await db.catalogSnapshots.count();
 const p=await previewCatalogMigration(db,await candidate());expect(p.references[0].decision).toBe('keep');
 cancelCatalogMigration(p.id);expect(await db.personalMetadata()).toEqual(before);expect(await db.catalogSnapshots.count()).toBe(count);
 const q=await previewCatalogMigration(db,await candidate(),{goals:{g:'migrate'},acknowledgeLegacy:true});
 await db.rename('Renamed');await expect(acceptCatalogMigration(db,q.id,q.expectedRevision)).rejects.toThrow('Data changed');
 expect((await db.load()).goals[0].catalogBinding?.state).toBe('legacy-unbound');
});
test('accept atomic across craft, routes, snapshots and history; retry; rollback preserves later stock/progress/notes',async()=>{
 const db=store();const pals=new PalStore(db as PalDatabase);await db.save({...emptyWorkspace(),goals:[goal],stock:{wood:5},stockUpdatedAt:{wood:'2026-09-06T00:00:00.000Z'}});
 const c=await candidate();const pair=c.pals.breedingPairs[0];const generation=await db.personalMetadata();await pals.saveRoute({id:'r',targetId:pair.childId,sourceVersion:'original label',conditional:true,completed:[],steps:[{id:'s',pairId:pair.id,childId:pair.childId,parents:['owned:a','owned:b'],conditional:true}]},{snapshotId:generation.selectedCatalog,revision:generation.revision});
 const before=await db.load(),routes=await db.routes.toArray(),meta=await db.personalMetadata();
 const p=await previewCatalogMigration(db,c);p.changes.length=0; // detached public proposal cannot alter accept
 vi.spyOn(db.migrationHistory,'add').mockRejectedValueOnce(new Error('quota'));
 await expect(acceptCatalogMigration(db,p.id,p.expectedRevision)).rejects.toThrow('quota');
 expect(await db.load()).toEqual(before);expect(await db.routes.toArray()).toEqual(routes);expect(await db.catalogSnapshots.get(c.id)).toBeUndefined();expect(await db.personalMetadata()).toEqual(meta);
 const history=await acceptCatalogMigration(db,p.id,p.expectedRevision);
 const edited=await db.load();edited.stock.wood=20;edited.goals[0].notes='later';edited.goals[0].completed=2;await db.save(edited);
 await pals.saveRoute({...routes[0],completed:['s']});
 const revert=await previewCatalogRollback(db,history);await acceptCatalogMigration(db,revert.id,revert.expectedRevision);
 const final=await db.load();expect(final.stock.wood).toBe(20);expect(final.stockUpdatedAt).toEqual(before.stockUpdatedAt);expect(final.goals[0]).toMatchObject({notes:'later',completed:2,catalogBinding:before.goals[0].catalogBinding});expect((await db.routes.get('r'))?.completed).toEqual(['s']);expect(await db.catalogSnapshots.get(c.id)).toBeDefined();
});
test('scoped roundtrips retain snapshots and reject digest corruption before writes',async()=>{
 const db=store();await db.save({...emptyWorkspace(),goals:[goal]});const backup=await db.export();const other=store();await other.import(backup);expect(await other.load()).toEqual(await db.load());
 const changed=JSON.parse(backup);changed.snapshots[0].manifest.notes=['tamper'];const before=await other.personalMetadata();await expect(other.import(JSON.stringify(changed))).rejects.toThrow('digest');expect(await other.personalMetadata()).toEqual(before);
 const pals=new PalStore(db as PalDatabase);const palBackup=createPalBackup(await pals.snapshot());await replacePalBackup(new PalStore(other as PalDatabase),palBackup);expect(await other.load()).toEqual(await db.load());
 const corrupt=structuredClone(palBackup);corrupt.catalog!.snapshots[0]=JSON.parse(JSON.stringify(corrupt.catalog!.snapshots[0]));(corrupt.catalog!.snapshots[0].manifest as {datasetId:string}).datasetId='bad';await expect(replacePalBackup(new PalStore(other as PalDatabase),corrupt)).rejects.toThrow('digest');
});
test('legacy copy is non-destructive, transactional and retryable; marker prevents overwriting later changes',async()=>{
 const name='legacy-'+crypto.randomUUID();const legacy=new Dexie(name);legacy.version(1).stores({pals:'id,speciesId',bases:'id',routes:'id,targetId'});await legacy.table('pals').put({id:'unknown',speciesId:'unknown',nickname:'legacy',gender:'unknown',passives:[],notes:'keep',location:'',archived:false,favorite:true});legacy.close();
 const db=new PersonalDatabase('copy-'+crypto.randomUUID(),name);dbs.push(db);const retained=new Dexie(name);dbs.push(retained);
 vi.spyOn(db.metadata,'add').mockRejectedValueOnce(new Error('copy failure'));await expect(db.ready()).rejects.toThrow('copy failure');expect(await db.pals.count()).toBe(0);
 await db.ready();expect((await db.pals.get('unknown'))?.favorite).toBe(true);await db.write(async()=>{await db.pals.update('unknown',{nickname:'later'});});
 db.close();const reopened=new PersonalDatabase(db.name,name);await reopened.ready();expect((await reopened.pals.get('unknown'))?.nickname).toBe('later');reopened.close();await retained.open();expect((await retained.table('legacyPals').get('unknown')).nickname).toBe('legacy');
});
