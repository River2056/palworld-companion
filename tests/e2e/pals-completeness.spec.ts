import {expect,test,type Page} from '@playwright/test';

async function addPal(page:Page,speciesId:string,nickname:string,gender='unknown',passives='') {
 await page.getByRole('combobox',{name:'Species',exact:true}).selectOption(speciesId);
 await page.getByLabel('Nickname',{exact:true}).fill(nickname);
 await page.getByRole('combobox',{name:'Gender',exact:true}).selectOption(gender);
 await page.getByLabel('Passives (comma separated; notes only)',{exact:true}).fill(passives);
 await page.getByRole('button',{name:'Save Pal',exact:true}).click();
 await expect(page.getByRole('heading',{name:nickname,exact:true})).toBeVisible();
}
const savedRoutes=(page:Page)=>page.getByRole('region',{name:'Saved breeding checklists'});

test('target → save route → manual completion → explicit offspring → favorite → reload',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/#/breeding');
 await addPal(page,'RedArmorBird','Hawk','male');
 await addPal(page,'ChickenPal','Hen','female');
 await page.getByRole('combobox',{name:'Target species',exact:true}).selectOption('Ronin');
 await expect(page.getByText(/Ranked by missing owned parents/)).toBeVisible();
 await expect(page.getByText('Ranking metrics: 0 missing owned parents · 2 steps · generation depth 2.',{exact:true})).toBeVisible();
 await expect(savedRoutes(page).getByRole('checkbox')).toHaveCount(0);
 await page.getByRole('button',{name:'Save route checklist',exact:true}).click();
 const saved=savedRoutes(page);
 await expect(saved.getByRole('checkbox')).toHaveCount(2);
 await expect(saved.getByRole('button',{name:'Add offspring from step 1'})).toHaveCount(0);
 // Completion is persisted asynchronously; assert the settled state.
 await saved.getByRole('checkbox',{name:'Step 1 complete (manual)',exact:true}).click();
 await expect(saved.getByRole('checkbox',{name:'Step 1 complete (manual)',exact:true})).toBeChecked();
 await expect(saved.getByRole('button',{name:'Add offspring from step 1'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Pal roster',exact:true}).getByRole('article')).toHaveCount(2);
 await saved.getByRole('button',{name:'Add offspring from step 1'}).click();
 await expect(page.getByRole('combobox',{name:'Species',exact:true})).toHaveValue('CaptainPenguin');
 await expect(page.getByRole('combobox',{name:'Gender',exact:true})).toHaveValue('unknown');
 await expect(page.getByLabel('Passives (comma separated; notes only)',{exact:true})).toHaveValue('');
 await expect(page.getByRole('region',{name:'Pal roster',exact:true}).getByRole('article')).toHaveCount(2);
 await page.getByRole('button',{name:'New / cancel edit',exact:true}).click();
 await expect(page.getByRole('region',{name:'Pal roster',exact:true}).getByRole('article')).toHaveCount(2);
 await saved.getByRole('button',{name:'Add offspring from step 1'}).click();
 await page.getByLabel('Nickname',{exact:true}).fill('First hatch');
 await page.getByRole('button',{name:'Save Pal',exact:true}).click();
 await expect(page.getByRole('heading',{name:'First hatch',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Favorite First hatch',exact:true}).click();
 await expect(page.getByRole('button',{name:'Favorite First hatch',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();
 await expect(page.getByRole('region',{name:'Pal roster',exact:true}).getByRole('article')).toHaveCount(3);
 await expect(savedRoutes(page).getByRole('checkbox',{name:'Step 1 complete (manual)',exact:true})).toBeChecked();
 await expect(page.getByRole('button',{name:'Favorite First hatch',exact:true})).toHaveAttribute('aria-pressed','true');
 const child=page.getByRole('article').filter({has:page.getByRole('heading',{name:'First hatch',exact:true})});
 await expect(child).toContainText('Penking · unknown');
 await expect(savedRoutes(page)).toContainText('does not verify gender');
 await page.getByRole('button',{name:'Favorite First hatch',exact:true}).click();
 await page.reload();
 await expect(page.getByRole('button',{name:'Favorite First hatch',exact:true})).toHaveAttribute('aria-pressed','false');
 expect(errors).toEqual([]);
});

test('uncovered work → compatible explicit assignment clears warning and shows worker context',async({page})=>{
 await page.goto('/#/breeding');
 await addPal(page,'Penguin','Cool worker','unknown','Artisan (manually recorded)');
 await page.getByRole('link',{name:'Bases',exact:true}).click();
 await page.getByLabel('Base name').fill('Cooling camp');
 await page.getByRole('button',{name:'Add work slot',exact:true}).click();
 await page.getByRole('combobox',{name:'Work',exact:true}).selectOption('Cooling');
 await page.getByRole('button',{name:'Save base',exact:true}).click();
 await expect(page.getByText(/Worker shortage: 1/)).toBeVisible();
 await expect(page.getByText(/Consider Cool worker/)).toBeVisible();
 await page.getByRole('button',{name:'Edit Cooling camp',exact:true}).click();
 await page.getByRole('checkbox',{name:/Cool worker/}).check();
 await page.getByRole('button',{name:'Save base',exact:true}).click();
 await expect(page.getByText(/Worker shortage:/)).toHaveCount(0);
 await expect(page.getByText('1 / 15 workers · 1 / 1 simultaneous slots covered',{exact:true})).toBeVisible();
 const context=page.getByRole('region',{name:'Assigned workers at Cooling camp'});
 await expect(context).toContainText('Cooling 1');
 await expect(context).toContainText('Manually recorded modifiers (notes only): Artisan (manually recorded)');
 await expect(context).toContainText('no speed, passive inheritance, or throughput multipliers are calculated');
 await page.reload();
 await expect(page.getByText(/Worker shortage:/)).toHaveCount(0);
 await expect(context).toContainText('Cooling 1');
});

test('base gap target uses app callback without saving until explicit route action',async({page})=>{
 await page.goto('/#/breeding');
 await addPal(page,'RedArmorBird','Hawk','male');
 await addPal(page,'ChickenPal','Hen','female');
 await page.getByRole('link',{name:'Bases',exact:true}).click();
 await page.getByLabel('Base name').fill('Target camp');
 await page.getByRole('button',{name:'Add work slot',exact:true}).click();
 await page.getByRole('combobox',{name:'Work',exact:true}).selectOption('Cooling');
 await page.getByLabel('Minimum suitability').fill('2');
 await page.getByRole('button',{name:'Save base',exact:true}).click();
 await page.getByRole('button',{name:'Penking',exact:true}).click();
 await expect(page).toHaveURL(/#\/breeding$/);
 await expect(page.getByRole('combobox',{name:'Target species',exact:true})).toHaveValue('CaptainPenguin');
 await expect(savedRoutes(page)).toContainText('No saved routes');
 await expect(page.getByRole('button',{name:'Save route checklist',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save route checklist',exact:true}).click();
 await expect(savedRoutes(page).getByRole('heading',{name:'Penking · 1 step(s)',exact:true})).toBeVisible();
 await page.reload();
 await expect(savedRoutes(page).getByRole('heading',{name:'Penking · 1 step(s)',exact:true})).toBeVisible();
 await expect(savedRoutes(page).getByRole('checkbox')).not.toBeChecked();
});
