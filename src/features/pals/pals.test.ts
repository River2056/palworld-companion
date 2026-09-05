import { describe, expect, it } from 'vitest';
import { enumerateRoutes, analyzeBase, routeWarnings, type Pal } from './domain';
const pal = (id: string, speciesId: string, gender: Pal['gender']): Pal => ({id,speciesId,gender,nickname:'',notes:'',location:'',passives:[],archived:false});
describe('explicit breeding from individual roster', () => {
 it('links a supported two-step chain and treats offspring sex as conditional', () => {
  const routes=enumerateRoutes([pal('r','LazyDragon','male'),pal('l','SheepBall','female'),pal('h','RedArmorBird','male')],'Ronin');
  expect(routes.some(r=>r.steps.length===2 && r.conditional && r.steps[0].parents.includes('owned:r'))).toBe(true);
 });
 it('rejects same-sex actual parents, permits unknown conditionally, and does not invent missing routes',()=>{
  expect(enumerateRoutes([pal('r','LazyDragon','male'),pal('l','SheepBall','male')],'CaptainPenguin')).toEqual([]);
  expect(enumerateRoutes([pal('r','LazyDragon','male'),pal('l','SheepBall','unknown')],'CaptainPenguin')[0].conditional).toBe(true);
  expect(enumerateRoutes([], 'Anubis')).toEqual([]);
 });
});

it('bounds cyclic reference routes, excludes archives, and reuses an owned parent in later steps',()=>{
 const roster=[pal('h','RedArmorBird','male'),pal('c','ChickenPal','female')];
 const route=enumerateRoutes(roster,'Ronin')[0];
 expect(route.steps).toHaveLength(2);expect(route.steps.every(s=>s.parents.includes('owned:h'))).toBe(true);
 expect(enumerateRoutes(roster,'Ronin',1)).toEqual([]);
 expect(enumerateRoutes([{...roster[0],archived:true},roster[1]],'Ronin')).toEqual([]);
 expect(enumerateRoutes([pal('m','FlyingManta','male'),pal('c','PinkCat','female')],'PinkCat')[0].steps).toHaveLength(1);
});
it('uses augmenting reassignment and recommends only unassigned eligible workers',()=>{
 const roster=[pal('p','Penguin','unknown'),pal('c','FlyingManta','unknown'),pal('spare','Penguin','male'),pal('busy','Penguin','female')];
 const base={id:'b',name:'Home',capacity:2,workerIds:['p','c'],slots:[{id:'w',work:'Watering',minimum:1,priority:10},{id:'c',work:'Cooling',minimum:1,priority:5}]};
 expect(analyzeBase(base,roster).shortage).toBe(0);
 const report=analyzeBase({...base,workerIds:['c']},roster,[{...base,id:'other',workerIds:['busy','p']}]);
 expect(report.replacements.map(r=>r.palId)).toEqual(['spare']);expect(report.replacements[0].reason).toContain('Cooling 1');
});

it('revalidates saved individual sex and species after roster edits',()=>{
 const roster=[pal('h','RedArmorBird','male'),pal('c','ChickenPal','female')]; const route=enumerateRoutes(roster,'CaptainPenguin')[0];
 expect(routeWarnings(route,roster)).toEqual([]);
 expect(routeWarnings(route,[roster[0],{...roster[1],gender:'male'}]).join(' ')).toContain('same sex');
 expect(routeWarnings(route,[roster[0],{...roster[1],speciesId:'Anubis'}]).join(' ')).toContain('species changed');
});

