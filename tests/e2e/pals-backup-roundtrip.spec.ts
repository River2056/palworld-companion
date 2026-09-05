import {expect, test, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {PalBackup} from '../../src/features/pals/backup';
import type {Workspace} from '../../src/data/workspace';
import type {SnapshotBackup} from '../../src/data/personal-db';
type CraftBackup = SnapshotBackup & {schemaVersion:2;scope:'craft';workspace:Workspace};

type WriteAudit = {db:string; store:string; operation:string};
type AuditedWindow = Window & {backupWrites:WriteAudit[]};

async function exported<T>(page:Page, button:string):Promise<T> {
 const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:button,exact:true}).click();
 const download=await pending;
 expect(await download.failure()).toBeNull();
 const path=await download.path();
 expect(path).toBeTruthy();
 return JSON.parse(readFileSync(path!,'utf8')) as T;
}
async function preview(page:Page, backup:unknown) {
 await page.getByLabel('Preview Pal backup JSON (maximum 10 MiB)').setInputFiles({name:'synthetic-recovery-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect(page.getByRole('heading',{name:'Import preview — no data changed',exact:true})).toBeVisible();
}
async function replace(page:Page, backup:unknown) {
 await preview(page,backup);
 await expect(page.getByRole('button',{name:'Replace Pal data',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'I have backed up my current data and confirm replacing all Pals, bases and routes.',exact:true}).check();
 await page.getByRole('button',{name:'Replace Pal data',exact:true}).click();
 await expect(page.getByText('Pal, base and route backup restored.',{exact:true})).toBeVisible();
}
async function addPal(page:Page,species:string,name:string,gender:string) {
 await page.getByRole('combobox',{name:'Species',exact:true}).selectOption(species);
 await page.getByLabel('Nickname',{exact:true}).fill(name);
 await page.getByRole('combobox',{name:'Gender',exact:true}).selectOption(gender);
 await page.getByRole('button',{name:'Save Pal',exact:true}).click();
 await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
}
const writes=(page:Page)=>page.evaluate(()=>(window as unknown as AuditedWindow).backupWrites);

test('scoped backup roundtrip retains nonempty roster/checklist/base and unknown IDs; cancel and malformed input never write',async({page,context,baseURL})=>{
 test.setTimeout(90_000);
 const external:string[]=[];
 const errors:string[]=[];
 const mutations:string[]=[];
 await context.route('**/*',async route=>{
  const request=route.request();
  if(!request.url().startsWith(baseURL!)){external.push(request.url());await route.abort();return;}
  if(!['GET','HEAD'].includes(request.method()))mutations.push(`${request.method()} ${request.url()}`);
  await route.continue();
 });
 page.on('pageerror',error=>errors.push(error.message));
 // Observe real IndexedDB mutations, without replacing the persistence implementation.
 await context.addInitScript(()=>{
  const audit:WriteAudit[]=[];
  (window as unknown as AuditedWindow).backupWrites=audit;
  for(const operation of ['add','put','delete','clear'] as const){
   const original=IDBObjectStore.prototype[operation];
   Object.defineProperty(IDBObjectStore.prototype,operation,{configurable:true,writable:true,value:function(this:IDBObjectStore,...args:unknown[]){
    audit.push({db:this.transaction.db.name,store:this.name,operation});
    return Reflect.apply(original,this,args);
   }});
  }
 });
 await page.goto('/#/breeding');
 await addPal(page,'RedArmorBird','Backup hawk','male');
 await addPal(page,'ChickenPal','Backup hen','female');
 await addPal(page,'Penguin','Backup cooler','unknown');
 await page.getByRole('button',{name:'Favorite Backup hawk',exact:true}).click();
 await expect(page.getByRole('button',{name:'Favorite Backup hawk',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('combobox',{name:'Target species',exact:true}).selectOption('Ronin');
 await page.getByRole('button',{name:'Save route checklist',exact:true}).click();
 const saved=page.getByRole('region',{name:'Saved breeding checklists'});
 await expect(saved.getByRole('checkbox')).toHaveCount(2);
 await saved.getByRole('checkbox',{name:'Step 1 complete (manual)',exact:true}).click();
 await expect(saved.getByRole('checkbox',{name:'Step 1 complete (manual)',exact:true})).toBeChecked();
 await expect(saved.getByRole('checkbox',{name:'Step 2 complete (manual)',exact:true})).not.toBeChecked();
 await page.getByRole('link',{name:'Bases',exact:true}).click();
 await page.getByLabel('Base name').fill('Backup cooling camp');
 await page.getByRole('checkbox',{name:/Backup cooler/}).check();
 await page.getByRole('button',{name:'Add work slot',exact:true}).click();
 await page.getByRole('combobox',{name:'Work',exact:true}).selectOption('Cooling');
 await page.getByRole('button',{name:'Save base',exact:true}).click();
 await expect(page.getByText('1 / 15 workers · 1 / 1 simultaneous slots covered',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Craft',exact:true}).click();
 await page.getByLabel('Search recipes').fill('Arrow');
 await page.getByRole('button',{name:'Select Arrow',exact:true}).click();
 await page.getByRole('button',{name:'Pin craft goal',exact:true}).click();
 await expect(page.getByRole('heading',{name:/Arrow · 0 \//})).toBeVisible();
 await page.getByRole('spinbutton',{name:'Wood stock',exact:true}).fill('37');
 await page.getByRole('button',{name:'Save Wood stock',exact:true}).click();
 await page.getByRole('link',{name:'Settings',exact:true}).click();
 const craftBefore=await exported<CraftBackup>(page,'Export JSON backup');
 expect(craftBefore.schemaVersion).toBe(2);
 expect(craftBefore.scope).toBe('craft');
 expect(craftBefore.workspace.goals).toHaveLength(1);
 expect(Object.values(craftBefore.workspace.stock)).toContain(37);
 expect(Object.values(craftBefore.workspace.stockUpdatedAt??{})).toHaveLength(1);
 expect(craftBefore.snapshots).toHaveLength(1);
 const original=await exported<PalBackup>(page,'Export Pal backup');
 expect(original.schemaVersion).toBe(2);
 expect(original.catalog).toEqual({snapshots:craftBefore.snapshots,metadata:craftBefore.metadata});
 expect(original.snapshot.pals).toHaveLength(3);
 expect(original.snapshot.routes).toHaveLength(1);
 expect(original.snapshot.routes[0].steps).toHaveLength(2);
 expect(original.snapshot.routes[0].completed).toEqual([original.snapshot.routes[0].steps[0].id]);
 expect(original.snapshot.bases[0].workerIds).toEqual([original.snapshot.pals.find(p=>p.nickname==='Backup cooler')!.id]);
 expect(original.snapshot.pals.find(p=>p.nickname==='Backup hawk')!.favorite).toBe(true);
 expect(original.snapshot.pals.find(p=>p.nickname==='Backup hen')!.favorite).toBe(false);
 // Explicitly synthetic recovery IDs are not game-catalog facts. All normal records above came from UI.
 const recovery=structuredClone(original);
 recovery.snapshot.pals.push({id:'synthetic-legacy-pal',speciesId:'synthetic-unknown-species',nickname:'Synthetic unresolved favorite',gender:'unknown',passives:['Synthetic manual note'],notes:'Recovery-only fixture, not game data',location:'',archived:false,favorite:true});
 recovery.snapshot.routes.push({id:'synthetic-legacy-route',targetId:'synthetic-unknown-child',sourceVersion:'synthetic-legacy-source',catalogBinding:{state:'legacy-unbound',claimedVersion:'synthetic-legacy-source'},conditional:true,completed:['synthetic-step'],steps:[{id:'synthetic-step',pairId:'synthetic-unknown-pair',childId:'synthetic-unknown-child',parents:['owned:synthetic-legacy-pal','owned:synthetic-missing-parent'],conditional:true}]});
 const beforePreview=await writes(page);
 await preview(page,recovery);
 await expect(page.getByText('Unresolved species ID retained: synthetic-unknown-species',{exact:true})).toBeVisible();
 await expect(page.getByText('Missing original owned-parent link retained: owned:synthetic-missing-parent',{exact:true})).toBeVisible();
 expect(await writes(page)).toEqual(beforePreview);
 await page.getByRole('button',{name:'Cancel Pal import',exact:true}).click();
 await expect(page.getByText('Import cancelled; no data changed.',{exact:true})).toBeVisible();
 expect(await writes(page)).toEqual(beforePreview);
 expect((await exported<PalBackup>(page,'Export Pal backup')).snapshot).toEqual(original.snapshot);
 for(const malformed of ['{broken',JSON.stringify({...original,snapshot:{...original.snapshot,pals:[{...original.snapshot.pals[0],favorite:'yes'}]}})]){
  await page.getByLabel('Preview Pal backup JSON (maximum 10 MiB)').setInputFiles({name:'synthetic-malformed.json',mimeType:'application/json',buffer:Buffer.from(malformed)});
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button',{name:'Replace Pal data',exact:true})).toHaveCount(0);
  expect(await writes(page)).toEqual(beforePreview);
  expect((await exported<PalBackup>(page,'Export Pal backup')).snapshot).toEqual(original.snapshot);
 }
 await replace(page,recovery);
 const recovered=await exported<PalBackup>(page,'Export Pal backup');
 expect(recovered.snapshot).toEqual(recovery.snapshot);
 expect(recovered.catalog).toEqual(original.catalog);
 // Restore an actually downloaded backup after a destructive replacement in this fresh test context.
 await replace(page,{...original,snapshot:{pals:[],bases:[],routes:[]}});
 expect((await exported<PalBackup>(page,'Export Pal backup')).snapshot).toEqual({pals:[],bases:[],routes:[]});
 await replace(page,recovered);
 expect((await exported<PalBackup>(page,'Export Pal backup')).snapshot).toEqual(recovered.snapshot);
 expect(await exported<CraftBackup>(page,'Export JSON backup')).toEqual(craftBefore);
 const restoreWrites=(await writes(page)).slice(beforePreview.length);
 expect(restoreWrites.length).toBeGreaterThan(0);
 // Schema v2 shares one database; a successful replace also advances its revision.
 expect(restoreWrites.every(w=>w.db==='palworld-companion'&&['pals','bases','routes','metadata'].includes(w.store))).toBe(true);
 expect(restoreWrites.filter(w=>w.store==='metadata')).toHaveLength(3);
 await page.reload();
 expect((await exported<PalBackup>(page,'Export Pal backup')).snapshot).toEqual(recovered.snapshot);
 expect(await exported<CraftBackup>(page,'Export JSON backup')).toEqual(craftBefore);
 await page.getByRole('link',{name:'Breeding',exact:true}).click();
 await expect(page.getByRole('button',{name:'Favorite Backup hawk',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Favorite Synthetic unresolved favorite',exact:true})).toHaveAttribute('aria-pressed','true');
 const realRoute=saved.getByRole('article').filter({has:page.getByRole('heading',{name:'Bushi · 2 step(s)',exact:true})});
 await expect(realRoute.getByRole('checkbox',{name:'Step 1 complete (manual)',exact:true})).toBeChecked();
 await expect(realRoute.getByRole('checkbox',{name:'Step 2 complete (manual)',exact:true})).not.toBeChecked();
 await page.getByRole('link',{name:'Bases',exact:true}).click();
 await expect(page.getByText('1 / 15 workers · 1 / 1 simultaneous slots covered',{exact:true})).toBeVisible();
 expect(external).toEqual([]);
 expect(mutations).toEqual([]);
 expect(errors).toEqual([]);
});

// Saved-route favorites are outside the accepted model; roster favorites remain
// covered above. See docs/reviews/e2e-contract-reconciliation.md.
