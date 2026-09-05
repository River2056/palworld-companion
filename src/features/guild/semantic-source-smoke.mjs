import { chromium, expect } from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const {authUrl,restUrl}=JSON.parse(readFileSync(process.env.GUILD_TEST_CONFIG ?? new URL('../../../scripts/guild/.local/pw-guild-semantic-unique/config.json',import.meta.url),'utf8'));
const browser=await chromium.launch();
try {
 const page=await browser.newPage();const mutations=[];const errors=[];let session;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().includes('/rpc/mutate_task'))mutations.push(r.postDataJSON());});
 page.on('response',async r=>{if(r.url()===`${authUrl}/signup` || r.url().includes('/token?'))session=await r.json();});
 await page.goto(`${process.env.GUILD_TEST_APP_URL ?? 'http://127.0.0.1:5197'}/#/guild`);
 await page.evaluate(async()=>{
  const {workspaceStore}=await import('/src/data/workspace.ts');const {bundledSnapshotPayload,createCatalogSnapshot}=await import('/src/domain/catalog-snapshot.ts');
  const payload=bundledSnapshotPayload();const root=payload.craft.recipes[0];payload.craft.recipes.push({...root,id:'synthetic-equal-alternate'});const snapshot=await createCatalogSnapshot(payload);
  await workspaceStore.ready();await workspaceStore.write(async()=>{await workspaceStore.putSnapshot(snapshot);await workspaceStore.workspaces.put({id:'personal',data:{version:1,goals:[{id:'semantic-goal',item:root.outputItemId,recipeId:root.id,catalogBinding:{state:'bound',snapshotId:snapshot.id},quantity:2,completed:0,notes:'PRIVATE-NOTES'}],stock:{'private-unrelated':41},recent:[]}});});
 });
 await page.reload();const suffix=randomUUID(),email=`semantic-${suffix}@example.test`,password=`Test-${suffix}!`;
 async function login(signup=false){await page.getByLabel('Auth URL',{exact:true}).fill(authUrl);await page.getByLabel('REST URL',{exact:true}).fill(restUrl);await page.getByLabel(/I trust both endpoints/).check();await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);if(signup)await page.getByLabel('Create a new account',{exact:true}).check();await page.getByRole('button',{name:signup?'Sign up':'Sign in',exact:true}).click();await expect(page.getByLabel('New guild name')).toBeVisible();}
 await login(true);await page.getByLabel('New guild name').fill(`Semantic ${suffix}`);await page.getByRole('button',{name:'Create guild',exact:true}).click();await expect(page.getByText('Your role: owner',{exact:true})).toBeVisible();const guild=await page.getByLabel('Selected guild').inputValue();
 async function tasks(){const response=await fetch(`${restUrl}/guild_tasks?guild_id=eq.${guild}`,{headers:{Authorization:`Bearer ${session.access_token}`}});expect(response.ok).toBe(true);return response.json();}
 const picker=page.getByLabel('Personal source to copy');const choice=await picker.locator('option').nth(2).getAttribute('value');await picker.selectOption(choice);await page.getByLabel(/I consent to share exactly/).check();await page.getByRole('button',{name:'Publish selected source'}).click();await expect(page.locator('.guild-tasks > li')).toHaveCount(1);
 await page.getByLabel(/I consent to share exactly/).check();await page.getByRole('button',{name:'Publish selected source'}).click();await expect(page.getByText(/Existing source task preserved/)).toBeVisible();expect(await tasks()).toHaveLength(1);
 await page.getByRole('button',{name:'Claim task',exact:true}).click();await expect(page.getByText('Contacting guild server…')).toHaveCount(0);const before=(await tasks())[0];expect(before.assignee).toBeTruthy();const count=mutations.length;
 await page.evaluate(async()=>{const {workspaceStore}=await import('/src/data/workspace.ts');const data=await workspaceStore.load();data.goals[0].recipeId='synthetic-equal-alternate';await workspaceStore.save(data);});
 await page.reload();await login();await page.getByLabel('Selected guild').selectOption(guild);await expect(page.getByText(/Local source semantics changed/)).toBeVisible();expect(mutations.length).toBe(count);expect((await tasks())[0]).toEqual(before);
 await expect(page.getByRole('button',{name:'Apply local source snapshot'})).toBeDisabled();await page.getByLabel(/I coordinated with the assignee/).check();await page.getByRole('button',{name:'Apply local source snapshot'}).click();await expect(page.getByText(/Local source semantics changed/)).toHaveCount(0);
 const after=(await tasks())[0];expect(after.requested_quantity).toBe(before.requested_quantity);expect(after.snapshot_checksum).not.toBe(before.snapshot_checksum);expect(after.assignee).toBe(before.assignee);expect(after.delivered_quantity).toBe(before.delivered_quantity);expect(after.source_requirement_id).toBe(before.source_requirement_id);expect(after.revision).toBe(before.revision+1);expect(JSON.stringify(mutations)).not.toMatch(/PRIVATE-NOTES|private-unrelated|catalogBinding|recipeOverrides/);expect(errors).toEqual([]);
 console.log('PASS real isolated backend/browser: equal-quantity recipe change -> stale -> claimed task byte-unchanged -> explicit fresh preview/reconfirm -> exact readback, privacy, stable identity.');
} finally {await browser.close();}
