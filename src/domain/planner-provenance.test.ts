import { expect, test } from 'vitest';
import { catalog } from './catalog';
import { plan } from './planner';
const goal = (id:string) => ({id,item:'crossbow',quantity:1,completed:0,notes:''});
test('mixed-depth goal provenance partitions the shared allocation, not independent stock estimates', () => {
 const c=structuredClone(catalog);
 c.recipes.find(r=>r.id==='crossbow')!.inputs=[{item:'nail',count:2},{item:'cloth',count:1}];
 c.recipes.find(r=>r.id==='cloth')!.inputs=[{item:'nail',count:1}];
 const p=plan(c,[goal('first'),goal('second'),{...goal('done'),completed:1}],{nail:1,ore:3});
 expect(p.raw.find(r=>r.item==='ore')).toMatchObject({required:6,reserved:3,missing:3,contributions:[{goalId:'first',required:2,reserved:2,planned:0,missing:0},{goalId:'second',required:4,reserved:1,planned:0,missing:3}]});
 for(const row of [...p.direct,...p.allocations]) {
  for(const key of ['required','reserved','planned','missing'] as const) expect(row.contributions.reduce((n,g)=>n+g[key],0)).toBe(row[key]);
  expect(row.contributions.some(g=>g.goalId==='done')).toBe(false);
 }
});
