import {test, expect} from '@playwright/test';

// Each Playwright context is disposable. Never open/reset a user's browser profile.
// Blank same-origin page allows labeled original databases BEFORE any app boot.
test.beforeEach(async ({page}) => {
  await page.route('**/persistence-review-blank', route => route.fulfill({contentType:'text/html',body:'<title>Isolated persistence review fixture</title>'}));
  await page.goto('/persistence-review-blank');
});

const imports = `
const {default:Dexie}=await import('/node_modules/.vite/deps/dexie.js');
const {PersonalDatabase}=await import('/src/data/personal-db.ts');
const {WorkspaceStore,emptyWorkspace}=await import('/src/data/workspace.ts');
const {PalStore}=await import('/src/features/pals/storage.ts');
const {createPalBackup}=await import('/src/features/pals/backup.ts');
const {bundledSnapshotPayload,createCatalogSnapshot}=await import('/src/domain/catalog-snapshot.ts');
const {previewCatalogMigration,acceptCatalogMigration,previewCatalogRollback}=await import('/src/data/catalog-migration.ts');
const goal={id:'review-goal',item:'nail',quantity:3,completed:1,notes:'labeled review fixture'};
const pal={id:'review-pal',speciesId:'unknown-review-species',nickname:'labeled legacy fixture',gender:'unknown',passives:[],notes:'retain me',location:'box',archived:false,favorite:true};
// Original PalDatabase constructor and PalStore.setFavorite from 333c2eb^ (types erased).
class OriginalPalDatabase extends Dexie {
 constructor(name){super(name);this.version(1).stores({pals:'id,speciesId',bases:'id',routes:'id,targetId'});}
}
class OriginalPalStore {
 constructor(db){this.db=db;}
 async setFavorite(id,favorite){
  if(typeof favorite!=='boolean')throw new Error('Invalid favorite flag.');
  await this.db.transaction('rw',this.db.pals,async()=>{
   const p=await this.db.pals.get(id);
   if(!p)throw new Error('Pal no longer exists.');
   await this.db.pals.put({...p,favorite});
  });
 }
}
const dump=async db=>db.transaction('r',db.tables,async()=>Object.fromEntries(await Promise.all(db.tables.map(async t=>[t.name,await t.toArray()]))));
`;

test('original v1 class cannot reopen for existing or fresh writes',async({page})=>{
 const result=await page.evaluate(`(async()=>{${imports}
  const old=new OriginalPalDatabase('isolated-original-client');await old.pals.put(pal);old.close();
  const db=new PersonalDatabase('isolated-original-target','isolated-original-client');await db.ready();
  const attempts=[];
  for(let i=0;i<2;i++){
   const client=new OriginalPalDatabase('isolated-original-client');let opened=false;
   try{await client.open();opened=true;await new OriginalPalStore(client).setFavorite(pal.id,false);attempts.push('succeeded')}
   catch(e){attempts.push({opened,error:e.name})}finally{client.close()}
  }
  db.close();return attempts;
 })()`);
 console.log('ORIGINAL_CLASS_EVIDENCE',JSON.stringify(result));
 expect(result).toEqual([{opened:false,error:'TypeError'},{opened:false,error:'TypeError'}]);
});

test('real browser: legacy copy retries atomically and old version writer is fenced', async ({page}) => {
  const result=await page.evaluate<{
 failure:string;aborted:boolean;copied:{nickname:string;favorite:boolean};legacyGoal:{catalogBinding:unknown};oldWrite:string;latest:{nickname:string};retained:{nickname:string};
 }>(`(async()=>{${imports}
    const craft=new Dexie('isolated-fence-core');craft.version(1).stores({workspaces:'id'});
    await craft.table('workspaces').put({id:'personal',data:{...emptyWorkspace(),goals:[goal],stock:{wood:7},stockUpdatedAt:{wood:'2026-09-06T00:00:00.000Z'}}});craft.close();
    const old=new OriginalPalDatabase('isolated-fence-legacy');
    await old.table('pals').put(pal);
    await old.table('bases').put({id:'review-base',name:'labeled legacy base',capacity:1,workerIds:[pal.id],slots:[]});
    await old.table('routes').put({id:'legacy-route',targetId:'removed-target',sourceVersion:'verbatim fixture claim',conditional:true,completed:['old-step'],steps:[{id:'old-step',pairId:'removed-pair',childId:'removed-target',parents:['owned:review-pal','owned:missing'],conditional:true}]});old.close();
    const db=new PersonalDatabase('isolated-fence-core','isolated-fence-legacy');const add=db.metadata.add.bind(db.metadata);db.metadata.add=async()=>{throw Error('review final-copy failure')};
    let failure='';try{await db.ready()}catch(e){failure=e.message}
    const aborted=await db.pals.count()===0&&await db.bases.count()===0&&await db.routes.count()===0&&await db.metadata.count()===0&&await db.catalogSnapshots.count()===0;
    db.metadata.add=add;await db.ready();const copied=await db.pals.get(pal.id);const legacyGoal=(await db.workspaces.get('personal')).data.goals[0];
    const base=await db.bases.get('review-base'),route=await db.routes.get('legacy-route');
    if(base.workerIds[0]!==pal.id||route.completed[0]!=='old-step'||route.catalogBinding.state!=='legacy-unbound'||route.catalogBinding.claimedVersion!=='verbatim fixture claim')throw Error('Legacy base/route consolidation lost fields');
    await db.write(async()=>{await db.pals.update(pal.id,{nickname:'new-authority edit'})});
    // Exact original app's Dexie version(1) schema, not an invented compatibility client.
    let oldWrite='';try{await old.open();await new OriginalPalStore(old).setFavorite(pal.id,false);oldWrite='succeeded'}catch(e){oldWrite=e.name}finally{old.close()}
    db.close();const reopened=new PersonalDatabase('isolated-fence-core','isolated-fence-legacy');await reopened.ready();const latest=await reopened.pals.get(pal.id);
    const evidence=new Dexie('isolated-fence-legacy');await evidence.open();const retained=await evidence.table('legacyPals').get(pal.id);evidence.close();reopened.close();
    return {failure,aborted,copied,legacyGoal,oldWrite,latest,retained};
  })()`);
  expect(result.failure).toContain('review final-copy failure');expect(result.aborted).toBe(true);
  expect(result.copied).toMatchObject({nickname:'labeled legacy fixture',favorite:true});
  expect(result.legacyGoal.catalogBinding).toEqual({state:'legacy-unbound'});
  expect(result.latest.nickname).toBe('new-authority edit');
  console.log('LEGACY_FENCE_EVIDENCE',JSON.stringify(result));
  expect(result.oldWrite).toBe('TypeError');
  expect(result.retained.nickname).toBe('labeled legacy fixture');
});

test('real browser: live noncooperating legacy connection blocks consolidation',async({page})=>{
 const result=await page.evaluate<{
 blocked:{versionchange:boolean;state:string;copied:number;metadata:number};retry:string;copiedNotes:string;
 }>(`(async()=>{${imports}
  const old=new OriginalPalDatabase('isolated-fence-legacy');await old.table('pals').put(pal);old.close();
  const live=await new Promise((resolve,reject)=>{const r=indexedDB.open('isolated-fence-legacy',10);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  let versionchange=false;live.onversionchange=()=>{versionchange=true};
  const db=new PersonalDatabase('isolated-fence-core','isolated-fence-legacy');let state='pending';const pending=db.ready().then(()=>{state='ready'},e=>{state=e.name});
  await new Promise(r=>setTimeout(r,350));const blocked={versionchange,state,copied:await db.pals.count(),metadata:await db.metadata.count()};
  await new Promise((resolve,reject)=>{const tx=live.transaction('pals','readwrite');tx.objectStore('pals').put({...pal,notes:'last edit before release'});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  live.close();await pending;let retry='';try{await db.ready();retry='ready'}catch(e){retry=e.name};const copiedNotes=(await db.pals.get(pal.id)).notes;db.close();return {blocked,retry,copiedNotes};
 })()`);
 console.log('BLOCKED_EVIDENCE',JSON.stringify(result));
 expect(result.copiedNotes).toBe('last edit before release');
 expect(result.blocked.versionchange).toBe(true);expect(result.blocked.state).not.toBe('ready');expect(result.blocked.copied).toBe(0);expect(result.blocked.metadata).toBe(0);expect(result.retry).toBe('ready');
});

test('real browser: interrupted store fence rolls back; marker-only v2 retries',async({page})=>{
 const result=await page.evaluate<{failure:string;before:unknown;after:unknown;copied:{notes:string}}>(`(async()=>{${imports}
  const name='isolated-interrupted-fence';
  const old=new Dexie(name);old.version(1).stores({pals:'id,speciesId',bases:'id'});await old.table('pals').put(pal);old.close();
  const db=new PersonalDatabase('isolated-interrupted-target',name);
  let failure='';try{await db.ready()}catch(e){failure=e.message}
  const inspect=new Dexie(name);await inspect.open();
  const before={version:inspect.backendDB().version,names:inspect.tables.map(t=>t.name).sort(),row:await inspect.table('pals').get(pal.id),copied:await db.pals.count(),metadata:await db.metadata.count()};inspect.close();
  const repair=new Dexie(name);repair.version(1).stores({pals:'id,speciesId',bases:'id'});repair.version(2).stores({pals:'id,speciesId',bases:'id',routes:'id,targetId',consolidation:'id'});
  await repair.open();await repair.table('consolidation').put({id:'read-only',target:db.name});await repair.table('pals').update(pal.id,{notes:'edit after partial upgrade failure'});repair.close();
  await db.ready();const copied=await db.pals.get(pal.id);db.close();
  const archive=new Dexie(name);await archive.open();const after={version:archive.backendDB().version,names:archive.tables.map(t=>t.name).sort(),row:await archive.table('legacyPals').get(pal.id)};archive.close();
  return {failure,before,after,copied};
 })()`);
 expect(result.failure).toContain('Missing legacy store: routes');
 expect(result.before).toMatchObject({version:10,names:['bases','pals'],copied:0,metadata:0,row:{favorite:true,notes:'retain me'}});
 expect(result.after).toMatchObject({version:Number.MAX_SAFE_INTEGER,names:['consolidation','legacyBases','legacyPals','legacyRoutes'],row:{notes:'edit after partial upgrade failure'}});
 expect(result.copied.notes).toBe('edit after partial upgrade failure');
});

test('real browser: migration transaction retry, later edits, and history-only export evidence',async({page})=>{
 const result=await page.evaluate<{
 failure:string;
 atomic:boolean;localOld:boolean;a:string;b:string;craftIds:string[];palIds:string[];historyCount:number;restored:unknown;route:{completed:string[]};staleError:string;
 }>(`(async()=>{${imports}
  const db=new WorkspaceStore('isolated-review-core');await db.save({...emptyWorkspace(),goals:[goal],stock:{wood:5}});const a=(await db.personalMetadata()).selectedCatalog;
  const ps=new PalStore(db);await ps.savePal({...pal,speciesId:bundledSnapshotPayload().pals.species[0].id});const payload=bundledSnapshotPayload();payload.manifest.notes=['synthetic review B'];const b=await createCatalogSnapshot(payload);
  const pair=b.pals.breedingPairs[0];await ps.saveRoute({id:'review-route',targetId:pair.childId,sourceVersion:'fixture claim',conditional:true,completed:[],steps:[{id:'review-step',pairId:pair.id,childId:pair.childId,parents:['owned:review-pal','owned:missing'],conditional:true}]},{snapshotId:a,revision:(await db.personalMetadata()).revision});
  const before=await dump(db);const p=await previewCatalogMigration(db,b);p.changes.length=0;const add=db.migrationHistory.add.bind(db.migrationHistory);db.migrationHistory.add=async()=>{throw Error('review final history failure')};
  let failure='';try{await acceptCatalogMigration(db,p.id,p.expectedRevision)}catch(e){failure=e.message};const atomic=JSON.stringify(await dump(db))===JSON.stringify(before);db.migrationHistory.add=add;
  const history=await acceptCatalogMigration(db,p.id,p.expectedRevision);const craftExport=JSON.parse(await db.export());const palExport=createPalBackup(await ps.snapshot());const localOld=!!await db.catalogSnapshots.get(a);
  const later=await db.load();later.stock.wood=99;later.goals[0].notes='later edit';later.goals[0].completed=2;await db.save(later);await ps.saveRoute({...await db.routes.get('review-route'),completed:['review-step']});
  const rollback=await previewCatalogRollback(db,history);await acceptCatalogMigration(db,rollback.id,rollback.expectedRevision);const restored=await db.load();
  const stale=await previewCatalogMigration(db,b);const second=new WorkspaceStore(db.name);await second.rename('another connection');let staleError='';try{await acceptCatalogMigration(db,stale.id,stale.expectedRevision)}catch(e){staleError=e.message};second.close();
  const result={failure,atomic,localOld,a,b:b.id,craftIds:craftExport.snapshots.map(s=>s.id),palIds:palExport.catalog.snapshots.map(s=>s.id),historyCount:await db.migrationHistory.count(),restored,route:await db.routes.get('review-route'),staleError};db.close();return result;
 })()`);
 expect(result.failure).toContain('final history failure');expect(result.atomic).toBe(true);expect(result.localOld).toBe(true);expect(result.historyCount).toBe(2);
 expect(result.restored).toMatchObject({stock:{wood:99},goals:[{notes:'later edit',completed:2,catalogBinding:{state:'bound',snapshotId:result.a}}]});expect(result.route.completed).toEqual(['review-step']);expect(result.staleError).toContain('Data changed');
 console.log('HISTORY_RETENTION_EVIDENCE',JSON.stringify({old:result.a,selected:result.b,craftIds:result.craftIds,palIds:result.palIds,localOld:result.localOld}));
 // Observational regression: local rollback retains A, but both scoped exports omit history-only A.
 expect(result.craftIds).toEqual([result.b]);expect(result.palIds).toEqual([result.b]);
});
