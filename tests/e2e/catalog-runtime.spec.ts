import {test as base,expect,type Page} from '@playwright/test';
const test=base.extend<{url:string}>({
 url:async({baseURL},use)=>{
  // Honor the active suite's server; retain the standalone runtime fallback.
  await use(process.env.CATALOG_RUNTIME_URL??baseURL??'http://127.0.0.1:4287');
 },
});
async function acceptMigration(page:Page){
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Accept catalog migration',exact:true}).click()]);
 await expect(page.getByRole('heading',{name:'Workspace and catalog references'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Catalog migration preview',exact:true})).toHaveCount(0);
}

test('snapshot pin, legacy cancel/adopt and rollback retain later quantities',async({page,url})=>{
 await page.goto(url+'/#/craft');
 await page.getByRole('button',{name:'Select Pal Sphere',exact:true}).click();
 await page.getByRole('button',{name:'Pin craft goal',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Pal Sphere · 0 / 1',exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading',{name:'Pal Sphere · 0 / 1',exact:true})).toBeVisible();
 const bound=await page.evaluate(async()=>{const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));return (await workspaceStore.load()).goals[0];});
 expect(bound.catalogBinding.state).toBe('bound');expect(bound.recipeId).toBe('pal-sphere');
 await page.goto(url+'/#/settings');
 await page.getByLabel('Backup JSON',{exact:true}).fill(JSON.stringify({version:1,goals:[{id:'legacy',item:'pal-sphere',quantity:2,completed:0,notes:'retained'}],stock:{wood:3},recent:[]}));
 await page.getByRole('button',{name:'Preview import',exact:true}).click();await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Confirm replace',exact:true}).click()]);
 await expect(page.getByRole('heading',{name:'Workspace and catalog references'})).toBeVisible();
 const revision=()=>page.evaluate(async()=>{const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));return (await workspaceStore.personalMetadata()).revision;});
 const before=await revision();
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();
 await expect(page.getByRole('region',{name:'Catalog migration preview'})).toContainText('historical');
 await page.getByRole('button',{name:'Cancel catalog migration',exact:true}).click();expect(await revision()).toBe(before);
 await page.getByRole('checkbox',{name:/I acknowledge/}).check();await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();await acceptMigration(page);
 await expect(page.getByRole('button',{name:/Preview rollback revision/}).first()).toBeVisible();
 await page.evaluate(async()=>{const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));const data=await workspaceStore.load();data.goals[0].quantity=7;await workspaceStore.save(data);});
 await page.getByRole('button',{name:/Preview rollback revision/}).first().click();await acceptMigration(page);
 await expect(page.getByRole('heading',{name:'Workspace and catalog references'})).toBeVisible();
 const reverted=await page.evaluate(async()=>{const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));return (await workspaceStore.load()).goals[0];});
 expect(reverted.quantity).toBe(7);expect(reverted.catalogBinding.state).toBe('legacy-unbound');
});
test('validated synthetic alternate persists and partial unknown never consumes stock twice',async({page,url})=>{
 await page.goto(url+'/#/craft');await page.getByRole('button',{name:'Select Pal Sphere',exact:true}).waitFor();
 const payload=await page.evaluate(async()=>{
  const {createBundledCatalogSnapshot,createCatalogSnapshot}=await import(/* @vite-ignore */ String('/src/domain/catalog-snapshot.ts'));
  const bundled=await createBundledCatalogSnapshot();const {id,...candidate}=JSON.parse(JSON.stringify(bundled));void id;
  candidate.manifest.datasetId='SYNTHETIC BROWSER FIXTURE — not game facts';
  const ingot=candidate.craft.recipes.find((r:{id:string})=>r.id==='ingot');candidate.craft.recipes.push({...ingot,id:'fixture-ingot-alt',variant:'Synthetic cheaper ingot fixture',inputs:[{item:'ore',count:1}]});
  const sphere=candidate.craft.recipes.find((r:{id:string})=>r.id==='pal-sphere');candidate.craft.recipes.push({...sphere,id:'fixture-sphere-alt',variant:'Synthetic root fixture',inputs:[{item:'ingot',count:2},{item:'wood',count:3}]});
  return JSON.stringify(await createCatalogSnapshot(candidate));
 });
 await page.goto(url+'/#/settings');await page.getByLabel('Import local catalog snapshot').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(payload)});
 await expect(page.getByRole('region',{name:'Catalog migration',exact:true})).toContainText('SYNTHETIC BROWSER FIXTURE');
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();await acceptMigration(page);
 await expect(page.getByRole('button',{name:/Preview rollback revision/}).first()).toBeVisible();
 await page.goto(url+'/#/craft');await page.getByRole('button',{name:'Select Pal Sphere',exact:true}).click();await page.getByLabel('Root recipe',{exact:true}).selectOption('fixture-sphere-alt');
 await page.getByText('Recipe ingredient tree',{exact:true}).click();await page.locator('summary').filter({hasText:/Pal Sphere: 1 units/}).click();await page.locator('summary').filter({hasText:/Ingot: 2 units/}).click();await page.getByLabel('Recipe for Ingot',{exact:true}).selectOption('fixture-ingot-alt');
 await page.getByRole('button',{name:'Pin craft goal',exact:true}).click();await expect(page.getByRole('heading',{name:'Pal Sphere · 0 / 1',exact:true})).toBeVisible();await page.reload();
 const saved=await page.evaluate(async()=>{const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));const data=await workspaceStore.load();const g=data.goals[0];await workspaceStore.save({...data,goals:[g,{...g,id:'second'},{...g,id:'unknown',item:'absent'}],stock:{wood:4,ore:1}});return g;});
 expect(saved.recipeId).toBe('fixture-sphere-alt');expect(saved.recipeOverrides.ingot).toBe('fixture-ingot-alt');await page.reload();
 await expect(page.getByText(/Some goals unresolved/)).toBeVisible();
 const planning=await page.evaluate(async()=>{const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));const {loadCatalogRuntime,planRuntimeWorkspace}=await import(/* @vite-ignore */ String('/src/features/catalog-runtime.ts'));return planRuntimeWorkspace(await loadCatalogRuntime(),await workspaceStore.load());});
 expect(planning.complete).toBe(false);expect(planning.goals).toHaveLength(2);expect(planning.direct.find((r:{item:string})=>r.item==='wood').reserved).toBe(4);expect(planning.raw.find((r:{item:string})=>r.item==='ore').reserved).toBe(1);
});

test('synthetic candidate numeric deltas share queue stock; cancel is inert and missing bytes never fall back',async({page,url})=>{
 await page.goto(url+'/#/craft');
 await page.getByRole('button',{name:'Select Arrow',exact:true}).click();
 await page.getByLabel('Desired finished units').fill('11');
 await page.getByRole('button',{name:'Pin craft goal',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Arrow · 0 / 11',exact:true})).toBeVisible();
 const fixture=await page.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const {createCatalogSnapshot}=await import(/* @vite-ignore */ String('/src/domain/catalog-snapshot.ts'));
  const data=await workspaceStore.load();const first={...data.goals[0],id:'first'},second={...first,id:'second'};
  await workspaceStore.save({...data,goals:[first,second],stock:{wood:3}});
  const original=await workspaceStore.resolveSnapshot(first.catalogBinding.snapshotId);
  const {id,...candidate}=JSON.parse(JSON.stringify(original));void id;
  candidate.manifest.datasetId='SYNTHETIC NUMERIC DELTA FIXTURE — not game facts';
  candidate.craft.recipes.find((r:{id:string})=>r.id==='arrow').inputs.find((i:{item:string})=>i.item==='wood').count=3;
  return {payload:JSON.stringify(await createCatalogSnapshot(candidate)),backup:await workspaceStore.export(),revision:(await workspaceStore.personalMetadata()).revision};
 });
 await page.goto(url+'/#/settings');
 await page.getByLabel('Import local catalog snapshot').setInputFiles({name:'synthetic-delta.json',mimeType:'application/json',buffer:Buffer.from(fixture.payload)});
 await expect(page.getByRole('region',{name:'Catalog migration',exact:true})).toContainText('SYNTHETIC NUMERIC DELTA FIXTURE');
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();
 const first=page.getByRole('heading',{name:'Goal first · queue-priority allocation using current stock'}).locator('..');
 const second=page.getByRole('heading',{name:'Goal second · queue-priority allocation using current stock'}).locator('..');
 await expect(first).toContainText('direct wood: need 4 → 6 (Δ 2); missing 1 → 3 (Δ 2)');
 await expect(second).toContainText('direct wood: need 2 → 3 (Δ 1); missing 2 → 3 (Δ 1)');
 await page.getByRole('button',{name:'Cancel catalog migration',exact:true}).click();
 const unchanged=await page.evaluate(async()=>{const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));return {backup:await workspaceStore.export(),revision:(await workspaceStore.personalMetadata()).revision};});
 expect(unchanged).toEqual({backup:fixture.backup,revision:fixture.revision});
 await page.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const data=await workspaceStore.load();data.goals[0].catalogBinding={state:'bound',snapshotId:'sha256:'+ '0'.repeat(64)};
  await workspaceStore.import(JSON.stringify({schemaVersion:2,scope:'craft',workspace:data,snapshots:[],missingSnapshotIds:[data.goals[0].catalogBinding.snapshotId]}));
 });
 await page.goto(url+'/#/craft');await page.reload();
 await expect(page.getByText(/first: snapshot-missing/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Complete arrow',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Complete Arrow',exact:true})).toBeEnabled();
});


test('deferred comparison read rejects another tab revision; stale consent cannot accept',async({page,context,url})=>{
 await page.goto(url+'/#/settings');
 await expect(page.getByRole('heading',{name:'Workspace and catalog references'})).toBeVisible();
 await page.evaluate(async()=>{
  const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  await db.import(JSON.stringify({version:1,goals:[{id:'coherent',item:'arrow',quantity:11,completed:0,notes:'retained'}],stock:{wood:3},recent:[]}));
 });
 await page.getByRole('checkbox',{name:/I acknowledge/}).check();
 // Pause BEFORE opening the comparison transaction, after proposal capture.
 await page.evaluate(async()=>{
  const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const original=db.transaction.bind(db);let reads=0;
  const state=window as unknown as {comparisonWaiting:boolean;releaseComparison:()=>void};
  db.transaction=(...args:unknown[])=>{
   if(args[0]==='r'&&Array.isArray(args[1])&&++reads===2){
    state.comparisonWaiting=true;
    db.transaction=original;
    return new Promise<void>(resolve=>{state.releaseComparison=resolve;}).then(()=>original(...args));
   }
   return original(...args);
  };
 });
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();
 await page.waitForFunction(()=>(window as unknown as {comparisonWaiting:boolean}).comparisonWaiting);
 const other=await context.newPage();await other.goto(url+'/#/settings');
 const edited=await other.evaluate(async()=>{
  const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const data=await db.load();data.goals[0].quantity=29;data.stock.wood=17;await db.save(data);
  return {revision:(await db.personalMetadata()).revision,backup:await db.export()};
 });
 await page.evaluate(()=>(window as unknown as {releaseComparison:()=>void}).releaseComparison());
 await expect(page.getByRole('alert')).toContainText('Data changed; preview again');
 await expect(page.getByRole('region',{name:'Catalog migration preview',exact:true})).toHaveCount(0);
 await expect(page.getByRole('checkbox',{name:/I acknowledge/})).not.toBeChecked();
 await page.getByRole('checkbox',{name:/I acknowledge/}).check();
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();
 await expect(page.getByRole('region',{name:'Catalog migration preview',exact:true})).toContainText(`Revision ${edited.revision}`);
 await expect(page.getByRole('button',{name:'Accept catalog migration',exact:true})).toBeEnabled();
 const renamed=await other.evaluate(async()=>{const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));await db.rename('Concurrent edit');return await db.export();});
 await expect(page.getByRole('button',{name:'Accept catalog migration',exact:true})).toBeDisabled();
 await expect(page.getByRole('region',{name:'Catalog migration preview',exact:true})).toContainText('comparisons withheld');
 await expect(page.getByRole('heading',{name:/Goal coherent/})).toHaveCount(0);
 const unchanged=await other.evaluate(async()=>{const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));return {backup:await db.export(),history:await db.migrationHistory.count()};});
 expect(unchanged).toEqual({backup:renamed,history:0});
 await page.getByRole('checkbox',{name:/I acknowledge/}).check();
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();
 await acceptMigration(page);
 const adopted=await page.evaluate(async()=>{const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));return (await db.load()).goals[0];});
 expect(adopted).toMatchObject({quantity:29,notes:'retained',catalogBinding:{state:'bound'}});
 await other.close();
});


test('fresh imported candidate keeps route/base comparisons exact through cancel adopt rollback and missing references',async({page,url})=>{
 await page.goto(url+'/#/settings');
 await expect(page.getByRole('heading',{name:'Workspace and catalog references'})).toBeVisible();
 const fixture=await page.evaluate(async()=>{
  const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const {createBundledCatalogSnapshot,createCatalogSnapshot}=await import(/* @vite-ignore */ String('/src/domain/catalog-snapshot.ts'));
  const current=await createBundledCatalogSnapshot();const {id:_id,...candidate}=JSON.parse(JSON.stringify(current));void _id;
  const species=current.pals.species[0],pair=current.pals.breedingPairs[0];
  await db.write(async()=>{
   await db.pals.put({id:'worker',speciesId:species.id,nickname:'retained',gender:'unknown',passives:[],notes:'keep',location:'base',archived:false});
   await db.bases.put({id:'base',name:'Retained base',capacity:2,workerIds:['worker'],slots:[{id:'slot',work:Object.entries(species.workSuitability).find(([,level])=>Number(level)>0)![0],minimum:1,priority:1}]});
   await db.routes.put({id:'route',targetId:pair.childId,steps:[{id:'retained-check',pairId:pair.id,childId:pair.childId,parents:['owned:worker','owned:other'],conditional:false}],completed:['retained-check'],conditional:false,sourceVersion:current.pals.catalogId,catalogBinding:{state:'bound',snapshotId:current.id}});
  });
  candidate.manifest.datasetId='MIGRATION COHERENCE FIXTURE';candidate.pals.species=candidate.pals.species.map((s:{id:string;workSuitability:Record<string,number>})=>s.id===species.id?{...s,workSuitability:Object.fromEntries(Object.keys(s.workSuitability).map(k=>[k,0]))}:s);
  candidate.pals.breedingPairs=candidate.pals.breedingPairs.filter((p:{id:string})=>p.id!==pair.id);
  const next=await createCatalogSnapshot(candidate);
  return {payload:JSON.stringify(next),id:next.id,oldId:current.id,revision:(await db.personalMetadata()).revision,bases:await db.bases.toArray(),routes:await db.routes.toArray()};
 });
 await page.getByLabel('Import local catalog snapshot').setInputFiles({name:'coherence.json',mimeType:'application/json',buffer:Buffer.from(fixture.payload)});
 await expect(page.getByRole('region',{name:'Catalog migration',exact:true})).toContainText('MIGRATION COHERENCE FIXTURE');
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Decision for route',exact:true})).toHaveValue('keep');
 await page.getByRole('combobox',{name:'Decision for route',exact:true}).selectOption('migrate');
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();
 const preview=page.getByRole('region',{name:'Catalog migration preview',exact:true});
 await expect(preview).toContainText(`Revision ${fixture.revision}`);
 await expect(page.getByRole('region',{name:'base base comparison',exact:true})).toContainText('Before: 1/1 covered; 0 uncovered');
 await expect(page.getByRole('region',{name:'base base comparison',exact:true})).toContainText('After: 0/1 covered; 1 uncovered');
 await expect(page.getByRole('region',{name:'route route comparison',exact:true})).toContainText('After: Step 1: breeding pair is unsupported or changed; select a new route.');
 await page.getByRole('button',{name:'Cancel catalog migration',exact:true}).click();
 const read=()=>page.evaluate(async()=>{const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));return {meta:await db.personalMetadata(),bases:await db.bases.toArray(),routes:await db.routes.toArray(),history:await db.migrationHistory.count(),snapshots:await db.catalogSnapshots.toCollection().primaryKeys()};});
 const cancelled=await read();expect(cancelled.meta.revision).toBe(fixture.revision);expect(cancelled.snapshots).not.toContain(fixture.id);expect(cancelled.routes).toEqual(fixture.routes);
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();await acceptMigration(page);
 const adopted=await read();expect(adopted.meta.selectedCatalog).toBe(fixture.id);expect(adopted.routes[0].catalogBinding.snapshotId).toBe(fixture.id);expect(adopted.routes[0].completed).toEqual(['retained-check']);expect(adopted.bases).toEqual(fixture.bases);
 await page.getByRole('button',{name:/Preview rollback revision/}).first().click();
 await expect(page.getByRole('region',{name:'Catalog migration preview',exact:true})).toContainText(`Revision ${adopted.meta.revision}`);
 await acceptMigration(page);
 const rolledBack=await read();expect(rolledBack.meta.selectedCatalog).toBe(fixture.oldId);expect(rolledBack.routes).toEqual(fixture.routes);expect(rolledBack.bases).toEqual(fixture.bases);
 await page.evaluate(async(id)=>{const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));await db.write(()=>db.catalogSnapshots.delete(id));},fixture.oldId);
 await page.reload();await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();
 await expect(page.getByRole('region',{name:'route route comparison',exact:true})).toContainText('Before: Historical calculation unavailable; migration required, compatibility unverified.');
 await expect(page.getByRole('region',{name:'base base comparison',exact:true})).toContainText('Before: Selected analysis context unavailable; coverage unknown.');
 await page.getByRole('button',{name:'Cancel catalog migration',exact:true}).click();
 const missing=await read();expect(missing.routes).toEqual(fixture.routes);expect(missing.bases).toEqual(fixture.bases);expect(missing.history).toBe(2);
});

test('superseded candidate file reads cannot restore an old candidate or consent',async({page,url})=>{
 await page.goto(url+'/#/settings');
 await expect(page.getByRole('heading',{name:'Workspace and catalog references'})).toBeVisible();
 const fixture=await page.evaluate(async()=>{
  const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const {createBundledCatalogSnapshot,createCatalogSnapshot}=await import(/* @vite-ignore */ String('/src/domain/catalog-snapshot.ts'));
  const {id,...payload}=JSON.parse(JSON.stringify(await createBundledCatalogSnapshot()));void id;
  payload.manifest.datasetId='DELAYED CANDIDATE';const candidate=await createCatalogSnapshot(payload);
  const original=File.prototype.text;
  const state=window as unknown as {fileWaiting:boolean;releaseFile:()=>void};
  File.prototype.text=function(){const read=original.bind(this);return new Promise<void>(resolve=>{state.fileWaiting=true;state.releaseFile=resolve;}).then(read);};
  return {payload:JSON.stringify(candidate),revision:(await db.personalMetadata()).revision,backup:await db.export()};
 });
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();
 await expect(page.getByRole('button',{name:'Accept catalog migration',exact:true})).toBeEnabled();
 await page.getByLabel('Import local catalog snapshot').setInputFiles({name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(fixture.payload)});
 await page.waitForFunction(()=>(window as unknown as {fileWaiting:boolean}).fileWaiting);
 await expect(page.getByRole('region',{name:'Catalog migration preview',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Preview catalog migration',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Use bundled candidate',exact:true}).click();
 await page.evaluate(()=>(window as unknown as {releaseFile:()=>void}).releaseFile());
 await page.getByRole('button',{name:'Preview catalog migration',exact:true}).click();
 await expect(page.getByRole('region',{name:'Catalog migration preview',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Catalog migration',exact:true})).not.toContainText('DELAYED CANDIDATE');
 await page.getByRole('button',{name:'Cancel catalog migration',exact:true}).click();
 const unchanged=await page.evaluate(async()=>{const {workspaceStore:db}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));return {revision:(await db.personalMetadata()).revision,backup:await db.export(),history:await db.migrationHistory.count()};});
 expect(unchanged).toEqual({revision:fixture.revision,backup:fixture.backup,history:0});
});


