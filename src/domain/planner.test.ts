import { expect, test } from 'vitest';
import { plan } from './planner';
import { catalog, type Catalog } from './catalog';
test('planned target surplus serves later craft-more goals, not existing finished stock', () => {
 const p=plan(catalog,[goal('arrow',11,'first'),goal('arrow',5,'second')],{arrow:100});
 expect(p.direct.find(r=>r.item==='wood')?.required).toBe(4);
 expect(p.goals[1].batches).toBe(0);
});
const goal = (item: string, quantity: number, id = item) => ({ id, item, quantity, completed: 0, notes: '' });
test('finished units round to whole batches without spending final target stock', () => {
 const p = plan(catalog, [goal('arrow', 11)], { arrow: 100, wood: 3 });
 expect(p.goals[0]).toMatchObject({ batches: 2, output: 20, surplus: 9 });
 expect(p.direct.find(r => r.item === 'wood')).toMatchObject({ required: 4, reserved: 3, missing: 1 });
});
test('intermediate stock is spent before expanding only shortage; shared stock once', () => {
 const stock = { ingot: 10, ore: 1 }; const goals = [goal('crossbow',1),goal('nail',2)];
 const before = JSON.stringify({stock,goals}); const p = plan(catalog,goals,stock);
 expect(p.raw.find(r => r.item === 'ore')).toMatchObject({ required: 4, reserved: 1, missing: 3 });
 expect(JSON.stringify({stock,goals})).toBe(before);
});
test('synthetic odd intermediate batch surplus is reused across queue', () => {
 const c: Catalog = structuredClone(catalog); c.recipes.find(r => r.id === 'crossbow')!.inputs = [{item:'nail',count:1}];
 const p = plan(c,[goal('crossbow',1,'a'),goal('crossbow',1,'b')],{});
 expect(p.raw.find(r => r.item === 'ore')?.required).toBe(2);
 expect(p.steps.map(s => s.item)).toEqual(['ingot','nail','crossbow','crossbow']);
});
test('mixed-depth sibling demand shares owned stock and planned surplus in either input order', () => {
 const c = structuredClone(catalog);
 const crossbow=c.recipes.find(r=>r.id==='crossbow')!;
 const cloth=c.recipes.find(r=>r.id==='cloth')!;
 cloth.inputs=[{item:'nail',count:1}];
 crossbow.inputs=[{item:'nail',count:2},{item:'cloth',count:1}];
 for (const inputs of [crossbow.inputs,[...crossbow.inputs].reverse()]) {
  crossbow.inputs=inputs;
  const p=plan(c,[goal('crossbow',1)],{nail:1});
  expect(p.allocations.find(r=>r.item==='nail')).toMatchObject({required:3,reserved:1,planned:inputs[0].item==='nail'?1:0});
  expect(p.raw.find(r=>r.item==='ore')).toMatchObject({required:2,missing:2});
  expect(p.steps.filter(s=>s.item==='nail')).toHaveLength(1);
  expect(p.steps.at(-1)?.item).toBe('crossbow');
 }
});
test('unknown targets block, completed goals disappear, overflow rejects', () => {
 expect(plan(catalog,[goal('absent',1)],{}).blocked).toEqual(['absent']);
 expect(plan(catalog,[{...goal('arrow',2),completed:2}],{}).direct).toEqual([]);
 expect(() => plan(catalog,[goal('crossbow',Number.MAX_SAFE_INTEGER)],{})).toThrow();
});
