import { inQueue } from './queue-navigation';
import {test,expect,type Page} from '@playwright/test';
const read=async(page:Page)=>page.evaluate(async()=>{
 const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
 return {backup:await workspaceStore.export(),revision:(await workspaceStore.personalMetadata()).revision};
});
test('two tabs: actual App stale save rejects with zero writes; draft survives and explicit review recovers',async({page,context})=>{
 await page.goto('/#/craft');await page.getByRole('button',{name:'Select Arrow',exact:true}).click();
 await page.getByRole('button',{name:'Pin craft goal',exact:true}).click();
 await inQueue(page,async()=>{await expect(page.getByRole('heading',{name:'Arrow · 0 / 1',exact:true})).toBeVisible();});
 const tab=await context.newPage();await tab.goto('/#/craft');
 await inQueue(tab,async()=>{await expect(tab.getByRole('heading',{name:'Arrow · 0 / 1',exact:true})).toBeVisible();});
 const baseline=await read(page);
 // Record actual App save arguments; delegate unchanged to real IndexedDB CAS.
 await page.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const original=workspaceStore.save.bind(workspaceStore);
  (window as unknown as {saveRevisions:unknown[]}).saveRevisions=[];
  workspaceStore.save=async(...args:unknown[])=>{(window as unknown as {saveRevisions:unknown[]}).saveRevisions.push(args[1]);return original(...args);};
 });
 await page.getByRole('spinbutton',{name:'Wood stock',exact:true}).fill('17');
 await tab.getByRole('spinbutton',{name:'Wood stock',exact:true}).fill('9');
 await tab.getByRole('button',{name:'Save Wood stock',exact:true}).click();
 await expect.poll(async()=>(await read(tab)).revision).toBe(baseline.revision+1);
 await expect(page.getByRole('button',{name:'Review latest workspace (discard draft)'})).toBeVisible();
 const before=await read(tab);
 await page.getByRole('button',{name:'Save Wood stock',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Save failed: Data changed'})).toBeVisible();
 expect(await read(tab)).toEqual(before);
 expect(await page.evaluate(()=>(window as unknown as {saveRevisions:unknown[]}).saveRevisions)).toEqual([baseline.revision]);
 await expect(page.getByRole('spinbutton',{name:'Wood stock',exact:true})).toHaveValue('17');
 await page.getByRole('button',{name:'Review latest workspace (discard draft)'}).click();
 await expect(page.getByRole('spinbutton',{name:'Wood stock',exact:true})).toHaveValue('9');
 await page.getByRole('spinbutton',{name:'Wood stock',exact:true}).fill('12');
 await page.getByRole('button',{name:'Save Wood stock',exact:true}).click();
 await expect.poll(async()=>(await read(page)).revision).toBe(before.revision+1);
 await tab.reload();await expect(tab.getByRole('spinbutton',{name:'Wood stock',exact:true})).toHaveValue('12');
 await inQueue(tab,async()=>{await expect(tab.getByRole('heading',{name:'Arrow · 0 / 1',exact:true})).toBeVisible();});
});

test('catalog migration while drafting rejects old queue write without restoring old bindings',async({page,context})=>{
 await page.goto('/#/craft');await page.getByRole('button',{name:'Select Arrow',exact:true}).click();
 await page.getByRole('button',{name:'Pin craft goal',exact:true}).click();
 await inQueue(page,async()=>{await expect(page.getByRole('heading',{name:'Arrow · 0 / 1',exact:true})).toBeVisible();});
 await page.getByRole('link',{name:'Queue',exact:true}).click();
 await page.getByText('Edit Arrow / partial progress',{exact:true}).click();
 await page.getByLabel('Notes',{exact:true}).fill('unsaved local note');
 const tab=await context.newPage();await tab.goto('/#/settings');
 await tab.getByRole('heading',{name:'Workspace and catalog references'}).waitFor();
 await tab.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const {createCatalogSnapshot}=await import(/* @vite-ignore */ String('/src/domain/catalog-snapshot.ts'));
  const {previewCatalogMigration,acceptCatalogMigration}=await import(/* @vite-ignore */ String('/src/data/catalog-migration.ts'));
  const meta=await workspaceStore.personalMetadata();
  const original=await workspaceStore.resolveSnapshot(meta.selectedCatalog);
  const {id,...payload}=JSON.parse(JSON.stringify(original));void id;
  payload.manifest.datasetId='SYNTHETIC cross-tab freshness fixture';
  const candidate=await createCatalogSnapshot(payload);
  const goal=(await workspaceStore.load()).goals[0];
  const preview=await previewCatalogMigration(workspaceStore,candidate,{goals:{[goal.id]:'migrate'}});
  await acceptCatalogMigration(workspaceStore,preview.id,preview.expectedRevision);
 });
 await expect(page.getByRole('button',{name:'Review latest workspace (discard draft)'})).toBeVisible();
 const before=await read(tab);
 await page.getByRole('button',{name:'Save goal',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Save failed: Data changed'})).toBeVisible();
 expect(await read(tab)).toEqual(before);
 await expect(page.getByLabel('Notes',{exact:true})).toHaveValue('unsaved local note');
 await page.getByRole('button',{name:'Review latest workspace (discard draft)'}).click();
 await inQueue(page,async()=>{await expect(page.getByRole('heading',{name:'Arrow · 0 / 1',exact:true})).toBeVisible();});
 expect(await read(page)).toEqual(before);
});
