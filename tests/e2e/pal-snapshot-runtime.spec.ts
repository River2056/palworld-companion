import {test,expect} from '@playwright/test';

test('PalWorkspace hands captured generation to storage and a second tab fences the pending UI save',async({page,context})=>{
 await page.goto('/#/breeding');
 const rendered=await page.evaluate(async()=>{
  const {palStore}=await import(/* @vite-ignore */ String('/src/features/pals/storage.ts'));
  const {loadCatalogRuntime}=await import(/* @vite-ignore */ String('/src/features/catalog-runtime.ts'));
  const runtime=await loadCatalogRuntime(palStore.db),pair=runtime.selected.pals.breedingPairs[0];
  for(const [i,speciesId] of pair.parentIds.entries())await palStore.savePal({id:`ui-parent-${i}`,speciesId,nickname:`UI parent ${i}`,gender:i?'female':'male',passives:[],notes:'',location:'',archived:false});
  return {target:pair.childId,metadata:await palStore.db.personalMetadata()};
 });
 await page.reload();
 await page.getByRole('combobox',{name:'Target species',exact:true}).selectOption(rendered.target);
 await expect(page.getByRole('button',{name:'Save route checklist'}).first()).toBeVisible();
 await page.evaluate(async()=>{
  const {palStore}=await import(/* @vite-ignore */ String('/src/features/pals/storage.ts'));
  const save=palStore.saveRoute.bind(palStore);
  const state=window as unknown as {capturedGeneration?:unknown;releaseRouteSave?:()=>void};
  palStore.saveRoute=async(route:Parameters<typeof save>[0],generation:Parameters<typeof save>[1])=>{
   state.capturedGeneration=generation??null;
   await new Promise<void>(resolve=>{state.releaseRouteSave=resolve;});
   return save(route,generation);
  };
 });
 await page.getByRole('button',{name:'Save route checklist'}).first().click();
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {capturedGeneration?:unknown}).capturedGeneration)).toEqual({snapshotId:rendered.metadata.selectedCatalog,revision:rendered.metadata.revision});
 const second=await context.newPage();await second.goto('/#/settings');
 const migrated=await second.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const {createCatalogSnapshot,bundledSnapshotPayload}=await import(/* @vite-ignore */ String('/src/domain/catalog-snapshot.ts'));
  const {previewCatalogMigration,acceptCatalogMigration}=await import(/* @vite-ignore */ String('/src/data/catalog-migration.ts'));
  const payload=bundledSnapshotPayload();payload.manifest.notes=['Synthetic UI save race, not game facts'];
  const candidate=await createCatalogSnapshot(payload),preview=await previewCatalogMigration(workspaceStore,candidate);
  await acceptCatalogMigration(workspaceStore,preview.id,preview.expectedRevision);
  return workspaceStore.personalMetadata();
 });
 await page.evaluate(()=>(window as unknown as {releaseRouteSave:()=>void}).releaseRouteSave());
 await expect(page.getByRole('alert')).toContainText('Data changed; search again before saving route.');
 const result=await second.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  return {metadata:await workspaceStore.personalMetadata(),routes:await workspaceStore.routes.toArray()};
 });
 expect(result).toEqual({metadata:migrated,routes:[]});
 // A fresh render captures the accepted generation and can save normally.
 await page.reload();
 await page.getByRole('combobox',{name:'Target species',exact:true}).selectOption(rendered.target);
 await page.getByRole('button',{name:'Save route checklist'}).first().click();
 await expect(page.getByRole('region',{name:'Saved breeding checklists'}).getByRole('checkbox')).toHaveCount(1);
 const saved=await second.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  return workspaceStore.routes.toArray();
 });
 expect(saved).toHaveLength(1);expect(saved[0].catalogBinding).toEqual({state:'bound',snapshotId:migrated.selectedCatalog});
 await second.close();
});
test('App metadata and Today shopping projection use retained snapshot after migration',async({page})=>{
 await page.goto('/#/craft');await page.getByRole('button',{name:'Select Pal Sphere',exact:true}).click();await page.getByRole('button',{name:'Pin craft goal',exact:true}).click();
 const expected=await page.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const {loadCatalogRuntime,planRuntimeWorkspace}=await import(/* @vite-ignore */ String('/src/features/catalog-runtime.ts'));
  const {createCatalogSnapshot,bundledSnapshotPayload}=await import(/* @vite-ignore */ String('/src/domain/catalog-snapshot.ts'));
  const {previewCatalogMigration,acceptCatalogMigration}=await import(/* @vite-ignore */ String('/src/data/catalog-migration.ts'));
  const data=await workspaceStore.load();const p=bundledSnapshotPayload();p.manifest.datasetId='SYNTHETIC UI fixture, not game facts';p.craft.items.push({...p.craft.items.find((i:{kind:string})=>i.kind==='raw'),id:'synthetic-only',name:'Synthetic only'});
  p.craft.recipes.find((r:{id:string})=>r.id==='pal-sphere').inputs=[{item:'wood',count:999}];const c=await createCatalogSnapshot(p);
  const preview=await previewCatalogMigration(workspaceStore,c,{goals:{[data.goals[0].id]:'keep'}});await acceptCatalogMigration(workspaceStore,preview.id,preview.expectedRevision);
  const plan=planRuntimeWorkspace(await loadCatalogRuntime(),await workspaceStore.load());
  return {recipes:c.craft.recipes.length,raw:c.craft.items.filter((i:{kind:string})=>i.kind==='raw').length,missing:plan.direct.filter((r:{missing:number})=>r.missing>0).length};
 });
 await page.reload();await expect(page.locator('.catalog-status')).toContainText(`${expected.recipes} reference recipes · ${expected.raw} leaf materials`);
 await page.goto('/#/today');await expect(page.locator('.hero')).toContainText(`${expected.missing} direct ingredient types missing`);
 const shopping=page.locator('section').filter({has:page.getByRole('heading',{name:'Combined shopping list',exact:true})});
 await expect(shopping).toBeVisible();
 const missing=await shopping.locator(':scope > ul > li > span').evaluateAll(nodes=>nodes.filter(n=>Number(n.textContent?.match(/Missing (\d+)/)?.[1])>0).length);
 expect(missing).toBe(expected.missing);
});
