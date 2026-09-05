import {test,expect} from '@playwright/test';
test('real Chromium tabs reject an old route generation after catalog migration',async({page,context})=>{
 await page.goto('/#/pals');
 const captured=await page.evaluate(async()=>{
  const {palStore}=await import(/* @vite-ignore */ String('/src/features/pals/storage.ts'));
  const {enumerateRoutes}=await import(/* @vite-ignore */ String('/src/features/pals/domain.ts'));
  const {loadCatalogRuntime}=await import(/* @vite-ignore */ String('/src/features/catalog-runtime.ts'));
  const runtime=await loadCatalogRuntime(palStore.db),pair=runtime.selected.pals.breedingPairs[0];
  const pals=pair.parentIds.map((speciesId:string,i:number)=>({id:'p'+i,speciesId,nickname:'',gender:'unknown',passives:[],notes:'',location:'',archived:false}));
  const route={...enumerateRoutes(pals,pair.childId,4,40,runtime.selected.pals)[0],completed:[]};
  return {route,generation:{snapshotId:runtime.metadata.selectedCatalog,revision:runtime.metadata.revision}};
 });
 const second=await context.newPage();await second.goto('/#/settings');
 const migrated=await second.evaluate(async()=>{
  const {palStore}=await import(/* @vite-ignore */ String('/src/features/pals/storage.ts'));
  const {createCatalogSnapshot,bundledSnapshotPayload}=await import(/* @vite-ignore */ String('/src/domain/catalog-snapshot.ts'));
  const {previewCatalogMigration,acceptCatalogMigration}=await import(/* @vite-ignore */ String('/src/data/catalog-migration.ts'));
  const payload=bundledSnapshotPayload();payload.manifest.notes=['Synthetic cross-tab route fencing test'];const snapshot=await createCatalogSnapshot(payload);
  const preview=await previewCatalogMigration(palStore.db,snapshot);await acceptCatalogMigration(palStore.db,preview.id,preview.expectedRevision);
  return palStore.db.personalMetadata();
 });
 const result=await page.evaluate(async captured=>{
  const {palStore}=await import(/* @vite-ignore */ String('/src/features/pals/storage.ts'));
  let error='';try{await palStore.saveRoute(captured.route,captured.generation);}catch(e){error=String(e);}
  return {error,metadata:await palStore.db.personalMetadata(),routes:await palStore.db.routes.toArray()};
 },captured);
 expect(result.error).toContain('Data changed');expect(result.routes).toEqual([]);expect(result.metadata).toEqual(migrated);
 await second.close();
});
