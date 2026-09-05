import {test,expect,type Page} from '@playwright/test';

declare global {
 interface Window {
  backupReads:Record<string,{resolve:()=>Promise<void>;reject:()=>void}>;
  backupAttempts:string[];
 }
}
const backup=(item:string)=>JSON.stringify({version:1,goals:[{id:item,item,quantity:1,completed:0,notes:''}],stock:{},recent:[]});
const file=(name:string,source:string)=>({name,mimeType:'application/json',buffer:Buffer.from(source)});
async function state(page:Page) {
 return page.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  return {data:await workspaceStore.load(),revision:(await workspaceStore.personalMetadata()).revision};
 });
}
test.beforeEach(async({page})=>{
 await page.goto('/#/settings');
 await expect(page.getByRole('heading',{name:'Local first. Yours to manage.'})).toBeVisible();
 await page.evaluate(()=>{
  const nativeText=File.prototype.text;
  window.backupReads={};
  File.prototype.text=function(){
   return new Promise<string>((resolve,reject)=>{
    window.backupReads[this.name]={resolve:()=>nativeText.call(this).then(resolve,reject),reject:()=>reject(new Error('deliberate read failure'))};
   });
  };
 });
});

test('delayed nail file cannot inherit arrow consent; failed real import retries only reviewed bytes',async({page})=>{
 const before=await state(page);
 await page.getByRole('textbox',{name:'Backup JSON',exact:true}).fill(backup('arrow'));
 await page.getByRole('button',{name:'Preview import',exact:true}).click();
 await expect(page.getByRole('region',{name:'Import preview'})).toContainText('arrow: 1');
 await page.getByLabel('Import JSON file',{exact:true}).setInputFiles(file('nail.json',backup('nail')));
 await expect(page.getByRole('button',{name:'Preview import',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Confirm replace',exact:true})).toHaveCount(0);
 // Even a synthetic click cannot bypass the pending-read guard.
 await page.getByRole('button',{name:'Preview import',exact:true}).evaluate(el=>(el as HTMLButtonElement).click());
 await page.evaluate(()=>window.backupReads['nail.json'].resolve());
 await expect(page.getByRole('textbox',{name:'Backup JSON',exact:true})).toHaveValue(backup('nail'));
 await expect(page.getByRole('button',{name:'Confirm replace',exact:true})).toHaveCount(0);
 expect(await state(page)).toEqual(before);
 await page.getByRole('button',{name:'Preview import',exact:true}).click();
 await expect(page.getByRole('region',{name:'Import preview'})).toContainText('nail: 1');
 await page.getByRole('button',{name:'Cancel import',exact:true}).click();
 expect(await state(page)).toEqual(before);
 await expect(page.getByRole('button',{name:'Confirm replace',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Preview import',exact:true}).click();
 await page.evaluate(async()=>{
  const {workspaceStore}=await import(/* @vite-ignore */ String('/src/data/workspace.ts'));
  const original=workspaceStore.import.bind(workspaceStore);
  window.backupAttempts=[];
  workspaceStore.import=async(source:string)=>{
   window.backupAttempts.push(source);
   if(window.backupAttempts.length===1)throw new Error('deliberate save failure');
   await original(source);
   sessionStorage.setItem('backup-consent-attempts',JSON.stringify(window.backupAttempts));
  };
 });
 await page.getByRole('button',{name:'Confirm replace',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('deliberate save failure');
 expect(await state(page)).toEqual(before);
 await expect(page.getByRole('region',{name:'Import preview'})).toContainText('nail: 1');
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Confirm replace',exact:true}).click()]);
 expect((await state(page)).data.goals.map((g:{item:string})=>g.item)).toEqual(['nail']);
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('backup-consent-attempts')!))).toEqual([backup('nail'),backup('nail')]);
});

test('older file completion cannot overwrite newer typing consent',async({page})=>{
 await page.getByLabel('Import JSON file',{exact:true}).setInputFiles(file('old.json',backup('nail')));
 await page.getByRole('textbox',{name:'Backup JSON',exact:true}).fill(backup('arrow'));
 await page.getByRole('button',{name:'Preview import',exact:true}).click();
 await page.evaluate(()=>window.backupReads['old.json'].resolve());
 await expect(page.getByRole('textbox',{name:'Backup JSON',exact:true})).toHaveValue(backup('arrow'));
 await expect(page.getByRole('region',{name:'Import preview'})).toContainText('arrow: 1');
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Confirm replace',exact:true}).click()]);
 expect((await state(page)).data.goals.map((g:{item:string})=>g.item)).toEqual(['arrow']);
});

test('out-of-order file reads preserve the newer reviewed backup through real import',async({page})=>{
 await page.getByLabel('Import JSON file',{exact:true}).setInputFiles(file('old.json',backup('nail')));
 await page.getByLabel('Import JSON file',{exact:true}).setInputFiles(file('latest.json',backup('arrow')));
 await page.evaluate(()=>window.backupReads['latest.json'].resolve());
 await expect(page.getByRole('textbox',{name:'Backup JSON',exact:true})).toHaveValue(backup('arrow'));
 await page.getByRole('button',{name:'Preview import',exact:true}).click();
 await page.evaluate(()=>window.backupReads['old.json'].resolve());
 await expect(page.getByRole('region',{name:'Import preview'})).toContainText('arrow: 1');
 await expect(page.getByRole('textbox',{name:'Backup JSON',exact:true})).toHaveValue(backup('arrow'));
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Confirm replace',exact:true}).click()]);
 expect((await state(page)).data.goals.map((g:{item:string})=>g.item)).toEqual(['arrow']);
});

test('read failure retains prior bytes without consent; reset cancel is inert',async({page})=>{
 const before=await state(page);
 await page.getByRole('textbox',{name:'Backup JSON',exact:true}).fill(backup('arrow'));
 await page.getByRole('button',{name:'Preview import',exact:true}).click();
 await page.getByLabel('Import JSON file',{exact:true}).setInputFiles(file('failure.json',backup('nail')));
 await page.evaluate(()=>window.backupReads['failure.json'].reject());
 await expect(page.getByRole('alert')).toContainText('deliberate read failure');
 await expect(page.getByRole('textbox',{name:'Backup JSON',exact:true})).toHaveValue(backup('arrow'));
 await expect(page.getByRole('button',{name:'Confirm replace',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Preview import',exact:true}).click();
 await page.getByRole('button',{name:'Reset crafting workspace',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm replace',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Cancel reset',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm reset',exact:true})).toHaveCount(0);
 expect(await state(page)).toEqual(before);
});
