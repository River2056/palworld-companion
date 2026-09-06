import { inQueue } from './queue-navigation';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('keyboard search → units → pins → inventory → reload → complete; backup and reset',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#/craft');
 const search=page.getByLabel('Search recipes');await search.fill('arow');await search.press('ArrowDown');await expect(page.getByRole('button',{name:'Select Arrow',exact:true})).toBeFocused();await page.keyboard.press('Enter');
 await page.getByLabel('Desired finished units').fill('11');await expect(page.getByText('2 batches · 20 output · 9 surplus')).toBeVisible();await page.getByRole('button',{name:'Pin craft goal'}).click();
 await inQueue(page,async()=>{await expect(page.getByRole('heading',{name:'Arrow · 0 / 11'})).toBeVisible();});
 await page.getByLabel('Wood stock',{exact:true}).fill('3');await page.getByRole('button',{name:'Save Wood stock',exact:true}).click();await expect(page.getByText('Saved in this browser',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByLabel('Wood stock',{exact:true})).toHaveValue('3');await inQueue(page,async()=>{await expect(page.getByRole('heading',{name:'Arrow · 0 / 11'})).toBeVisible();});
 await search.fill('sphere');await page.getByRole('button',{name:'Select Pal Sphere',exact:true}).click();await page.getByRole('button',{name:'Pin craft goal'}).click();await inQueue(page,async()=>{await expect(page.getByRole('heading',{name:'Pal Sphere · 0 / 1'})).toBeVisible();});
 await page.getByRole('link',{name:'Queue',exact:true}).click();
 await page.getByRole('button',{name:'Move Pal Sphere up'}).click();await expect(page.locator('.goal-list > li').first()).toContainText('Pal Sphere');
 await page.getByText('Edit Pal Sphere / partial progress',{exact:true}).click();const editor=page.locator('.goal-list > li').first();await editor.getByLabel('Notes').fill('Bring spheres');await editor.getByRole('button',{name:'Save goal'}).click();await expect(editor.locator('p').filter({hasText:'Bring spheres'})).toBeVisible();
 await page.getByRole('button',{name:'Complete Arrow',exact:true}).click();await inQueue(page,async()=>{await expect(page.getByRole('heading',{name:'Arrow · 11 / 11'})).toBeVisible();});await page.getByRole('link',{name:'Craft',exact:true}).click();await expect(page.getByLabel('Wood stock',{exact:true})).toHaveValue('3');
 await page.getByRole('link',{name:'Today',exact:true}).click();await expect(page.getByText(/1 active goals · 1 completed/)).toBeVisible();
 await page.getByText('Raw-material alternative & dependency steps',{exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('link',{name:'Settings',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON backup'}).click();const file=await download;const path=await file.path();expect(path).toBeTruthy();
 await page.getByRole('textbox',{name:'Backup JSON',exact:true}).fill('{bad');await page.getByRole('button',{name:'Preview import'}).click();await expect(page.getByRole('alert')).toContainText('Existing data is unchanged');await expect(page.getByRole('button',{name:'Confirm replace'})).toHaveCount(0);
 await page.getByRole('button',{name:'Reset crafting workspace'}).click();await page.getByRole('button',{name:'Cancel reset'}).click();await page.getByRole('button',{name:'Reset crafting workspace'}).click();await page.getByRole('button',{name:'Confirm reset'}).click();await expect(page.getByRole('alertdialog')).toHaveCount(0);
 await page.getByLabel('Import JSON file').setInputFiles(path!);await expect(page.getByRole('textbox',{name:'Backup JSON',exact:true})).toContainText('Bring spheres');await page.getByRole('button',{name:'Preview import'}).click();await expect(page.getByRole('region',{name:'Import preview'})).toContainText('2 goals');await page.getByRole('button',{name:'Confirm replace'}).click();await expect(page.getByRole('region',{name:'Import preview'})).toHaveCount(0);
 await page.reload();await page.getByRole('link',{name:'Craft',exact:true}).click();await inQueue(page,async()=>{await expect(page.getByRole('heading',{name:'Arrow · 11 / 11'})).toBeVisible();});await expect(page.getByLabel('Wood stock',{exact:true})).toHaveValue('3');await page.getByRole('link',{name:'Queue',exact:true}).click();await page.getByRole('button',{name:'Remove Arrow',exact:true}).click();await expect(page.getByRole('heading',{name:'Arrow · 11 / 11'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:test.info().outputPath('crafting.png'),fullPage:true});
});

test('no results, invalid quantity, unknown imports retained and blocked',async({page})=>{
 await page.goto('/#/craft');await page.getByLabel('Search recipes').fill('zzzzzzz');await expect(page.getByText('No recipes found.')).toBeVisible();await page.getByLabel('Search recipes').fill('clot');await page.getByRole('button',{name:'Select Cloth',exact:true}).click();await page.getByLabel('Desired finished units').fill('0');await expect(page.getByRole('button',{name:'Pin craft goal'})).toBeDisabled();
 await page.getByRole('link',{name:'Settings',exact:true}).click();
 const initial={version:1,goals:[{id:'x',item:'future-recipe',quantity:3,completed:1,notes:'keep',recipeId:'future-variant',recipeOverrides:{'future-child':'future-child-variant'}}],stock:{'future-stock':9},stockUpdatedAt:{'future-stock':'2020-01-01T00:00:00.000Z'},recent:['future-recent']};
 await page.getByRole('textbox',{name:'Backup JSON',exact:true}).fill(JSON.stringify(initial));
 await page.getByRole('button',{name:'Preview import'}).click();
 const preview=page.getByRole('region',{name:'Import preview'});
 for(const text of ['future-stock: 9','future-recipe: 3','Completed: 1','Notes: keep','future-variant','future-child-variant','2020-01-01T00:00:00.000Z','future-recent','Unknown IDs are retained, not dropped or replaced.'])await expect(preview).toContainText(text);
 await page.getByRole('button',{name:'Confirm replace'}).click();await expect(preview).toHaveCount(0);
 await page.getByRole('link',{name:'Craft',exact:true}).click();
 // A legacy ID cannot be called an unknown recipe under silently substituted current rules.
 const unresolved=page.getByText('Unresolved goal retained. Review diagnostics in Craft; legacy adoption is in Settings.');
 await inQueue(page,async()=>{await expect(unresolved).toBeVisible();});
 await inQueue(page,async()=>{await expect(page.getByRole('button',{name:'Complete future-recipe',exact:true})).toBeDisabled();});
 await expect(page.getByLabel('future-stock stock',{exact:true})).toHaveValue('9');
 await page.reload();await inQueue(page,async()=>{await expect(unresolved).toBeVisible();});
 await inQueue(page,async()=>{await expect(page.getByRole('button',{name:'Complete future-recipe',exact:true})).toBeDisabled();});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('link',{name:'Settings',exact:true}).click();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON backup'}).click();
 const download=await downloaded;const envelope=JSON.parse(await readFile((await download.path())!,'utf8'));
 expect(envelope).toMatchObject({schemaVersion:2,scope:'craft'});
 expect(envelope.workspace).toEqual({...initial,goals:initial.goals.map(g=>({...g,catalogBinding:{state:'legacy-unbound'}}))});
});
