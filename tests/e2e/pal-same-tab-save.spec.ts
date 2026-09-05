import {expect,test} from '@playwright/test';

test('same-tab roster creation saves Bushi with the exact fresh generation without reload',async({page})=>{
 await page.goto('/#/breeding');
 for(const [species,nickname,gender] of [['RedArmorBird','Hawk','male'],['ChickenPal','Hen','female']]){
  await page.getByRole('combobox',{name:'Species',exact:true}).selectOption(species);
  await page.getByLabel('Nickname',{exact:true}).fill(nickname);
  await page.getByRole('combobox',{name:'Gender',exact:true}).selectOption(gender);
  await page.getByRole('button',{name:'Save Pal',exact:true}).click();
  await expect(page.getByRole('heading',{name:nickname,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Save Pal',exact:true})).toBeEnabled();
 }
 await page.getByRole('combobox',{name:'Target species',exact:true}).selectOption('Ronin');
 const before=await page.evaluate(async()=>{
  const {palStore}=await import(/* @vite-ignore */ String('/src/features/pals/storage.ts'));
  const save=palStore.saveRoute.bind(palStore);
  palStore.saveRoute=async(route:Parameters<typeof save>[0],generation:Parameters<typeof save>[1])=>{
   (window as unknown as {generation:unknown}).generation=generation;
   return save(route,generation);
  };
  return palStore.db.personalMetadata();
 });
 await page.getByRole('button',{name:'Save route checklist',exact:true}).click();
 await expect(page.getByRole('region',{name:'Saved breeding checklists'}).getByRole('checkbox')).toHaveCount(2);
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect(page.getByText('Local data changed.',{exact:false})).toHaveCount(0);
 const result=await page.evaluate(async()=>{
  const {palStore}=await import(/* @vite-ignore */ String('/src/features/pals/storage.ts'));
  return {generation:(window as unknown as {generation:unknown}).generation,routes:await palStore.db.routes.toArray(),pals:await palStore.db.pals.toArray()};
 });
 expect(result.generation).toEqual({snapshotId:before.selectedCatalog,revision:before.revision});
 expect(result.routes).toHaveLength(1);
 expect(result.routes[0].targetId).toBe('Ronin');
 expect(result.routes[0].steps).toHaveLength(2);
 expect(result.routes[0].catalogBinding).toEqual({state:'bound',snapshotId:before.selectedCatalog});
 const parents=result.routes[0].steps.flatMap((step:{parents:string[]})=>step.parents).filter((ref:string)=>ref.startsWith('owned:'));
 expect([...new Set(parents)].sort()).toEqual(result.pals.map((p:{id:string})=>`owned:${p.id}`).sort());
 // Same-tab Pal revisions must also be settled before entering a craft draft.
 await page.getByRole('link',{name:'Craft',exact:true}).click();
 await page.getByLabel('Search recipes').fill('Arrow');
 await page.getByRole('button',{name:'Select Arrow',exact:true}).click();
 await page.getByRole('button',{name:'Pin craft goal',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Arrow · 0 / 1',exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('saving one craft editor preserves another draft through a second-tab write and CAS rejection',async({page,context})=>{
 await page.goto('/#/craft');
 const second=await context.newPage();await second.goto('/#/craft');
 await expect(second.getByRole('spinbutton',{name:'Wood stock',exact:true})).toBeVisible();
 await page.getByRole('spinbutton',{name:'Wood stock',exact:true}).fill('17');
 await page.getByRole('spinbutton',{name:'Stone stock',exact:true}).fill('23');
 await page.getByRole('button',{name:'Save Wood stock',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save Wood stock',exact:true})).toBeEnabled();
 await expect(second.getByRole('spinbutton',{name:'Wood stock',exact:true})).toHaveValue('17');
 await second.getByRole('spinbutton',{name:'Stone stock',exact:true}).fill('9');
 await second.getByRole('button',{name:'Save Stone stock',exact:true}).click();
 await expect(second.getByRole('button',{name:'Save Stone stock',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Review latest workspace (discard draft)'})).toBeVisible();
 await expect(page.getByRole('spinbutton',{name:'Stone stock',exact:true})).toHaveValue('23');
 const dump=()=>second.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  return {backup:await workspaceStore.export(),revision:(await workspaceStore.personalMetadata()).revision};
 });
 const before=await dump();
 await page.getByRole('button',{name:'Save Stone stock',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Save failed: Data changed');
 expect(await dump()).toEqual(before);
 await expect(page.getByRole('spinbutton',{name:'Stone stock',exact:true})).toHaveValue('23');
 await page.getByRole('button',{name:'Review latest workspace (discard draft)'}).click();
 await expect(page.getByRole('spinbutton',{name:'Stone stock',exact:true})).toHaveValue('9');
 await expect(page.getByRole('spinbutton',{name:'Wood stock',exact:true})).toHaveValue('17');
 await second.close();
});
