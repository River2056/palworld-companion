/* global document, innerWidth, localStorage, sessionStorage, console */
// Explicit opt-in local backend; creates unique accounts, never resets backend.
import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const endpoints=JSON.parse(readFileSync(new URL('../../../scripts/guild/.local/config.json',import.meta.url),'utf8'));
const output='/tmp/palworld-today-guild-4289';mkdirSync(output,{recursive:true});
const browser=await chromium.launch();
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const context=await browser.newContext({viewport});const page=await context.newPage();const requests=[],errors=[];
  page.on('request',r=>{if(r.url().startsWith(endpoints.authUrl)||r.url().startsWith(endpoints.restUrl)) requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4289/#/today');await expect(page.getByRole('heading',{name:'Optional guild planning'})).toBeVisible();expect(requests).toEqual([]);
  await page.getByRole('link',{name:'Open guild workspace',exact:true}).click();
  await page.getByLabel('Auth URL',{exact:true}).fill(endpoints.authUrl);await page.getByLabel('REST URL',{exact:true}).fill(endpoints.restUrl);
  await page.getByLabel(/I trust both endpoints/).check();const id=randomUUID();await page.getByLabel('Email',{exact:true}).fill(`today-${id}@example.test`);await page.getByLabel('Password',{exact:true}).fill(`Test-${id}!`);await page.getByLabel('Create a new account',{exact:true}).check();await page.getByRole('button',{name:'Sign up',exact:true}).click();
  await page.getByLabel('New guild name').fill(`Today ${id}`);await page.getByRole('button',{name:'Create guild',exact:true}).click();await expect(page.getByText('Your role: owner',{exact:true})).toBeVisible();
  await page.getByLabel('Shared task title',{exact:true}).fill(`Private task ${id}`);await page.getByRole('button',{name:'Create shared task',exact:true}).click();await page.getByRole('button',{name:'Claim task',exact:true}).click();await expect(page.locator('.guild-tasks')).toContainText('Assigned:');await expect(page.getByRole('button',{name:'Refresh from server'})).toBeEnabled();
  const before=requests.length;await page.getByRole('navigation').getByRole('link',{name:/Today/}).click();const card=page.getByRole('region',{name:'Optional guild planning'});await expect(card).toContainText('1 assigned active tasks');await expect(card).toContainText(`Private task ${id}`);await expect(card).toContainText('unread events since last seen');expect(requests.length).toBe(before);await expect(page.getByLabel('Shared task title',{exact:true})).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage]))).not.toContain(id);
  await page.screenshot({path:`${output}/${viewport.width}-summary.png`,fullPage:true});
  await context.setOffline(true);await expect(card).not.toContainText(`Private task ${id}`);await context.setOffline(false);
  await page.getByRole('link',{name:'Refresh deliberately in Guild'}).click();await page.getByRole('button',{name:'Refresh from server'}).click();await expect(page.getByLabel('Selected guild')).toBeEnabled();await page.getByLabel('Selected guild').selectOption({label:`Today ${id}`});await expect(page.locator('.guild-tasks')).toContainText(`Private task ${id}`);await page.getByRole('navigation').getByRole('link',{name:/Today/}).click();await expect(card).toContainText(`Private task ${id}`);
  await page.getByRole('button',{name:'Sign out of Guild'}).click();await expect(card).not.toContainText(`Private task ${id}`);await page.getByRole('link',{name:'Open guild workspace',exact:true}).click();await expect(page.getByRole('button',{name:'Sign up',exact:true})).toBeDisabled();await page.reload();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeDisabled();expect(errors).toEqual([]);
  console.log(`PASS real backend Chromium ${viewport.width}: consent, create+claim, scoped Today, no navigation request, hidden form, storage exclusion, offline purge/recovery, full logout/reload, no overflow/errors`);await context.close();
 }
} finally {await browser.close();}
