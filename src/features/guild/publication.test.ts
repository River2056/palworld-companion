import { expect, it } from 'vitest';
import { publicationSources, projectPublication, sourceChange } from './publication';
import { bundledSnapshotPayload, createCatalogSnapshot } from '../../domain/catalog-snapshot';
import { planWorkspace } from '../../domain/snapshot-planner';
import type { Workspace } from '../../data/workspace';
async function fixture() {
 const payload=bundledSnapshotPayload();
 const first=payload.craft.recipes[0];payload.craft.recipes.push({...first,id:'synthetic-alternative'});
 const snapshot=await createCatalogSnapshot(payload);
 const data:Workspace={version:1,goals:[{id:'one',item:first.outputItemId,recipeId:first.id,catalogBinding:{state:'bound',snapshotId:snapshot.id},quantity:2,completed:0,notes:'PRIVATE'}],stock:{},recent:['PRIVATE']};
 return {snapshot,data,payload};
}
it('uses exact shared-ledger contributions and projects no private workspace fields',async()=>{
 const {snapshot,data}=await fixture(); data.goals.push({...data.goals[0],id:'two'});
 const row=planWorkspace(()=>snapshot,data.goals.map(g=>({...g,catalogBinding:g.catalogBinding!})),{}).direct[0];
 data.stock[row.item]=1;
 const allocation=planWorkspace(()=>snapshot,data.goals.map(g=>({...g,catalogBinding:g.catalogBinding!})),data.stock);
 const sources=await publicationSources(data,()=>snapshot,'workspace');
 for(const c of allocation.direct[0].contributions) if(c.missing) expect(sources.find(s=>s.requirement===`personal:v2:${JSON.stringify(['workspace',c.goalId,'shortage',row.item])}`)?.quantity).toBe(c.missing);
 expect(JSON.stringify(sources)).not.toMatch(/PRIVATE|stock|notes|recent|roster|reserved/);
 const unrelated=await publicationSources({...data,recent:['different'],goals:data.goals.map(g=>({...g,notes:'changed'})),stock:{...data.stock,'unrelated-private':15}},()=>snapshot,'workspace');
 expect(unrelated).toEqual(sources);
});
it('equal quantities with different selected recipes or snapshots are stale, identity is stable',async()=>{
 const {snapshot,data,payload}=await fixture();
 const a=(await publicationSources(data,()=>snapshot,'workspace'))[0];
 const b=(await publicationSources({...data,goals:[{...data.goals[0],recipeId:'synthetic-alternative'}]},()=>snapshot,'workspace'))[0];
 expect(a.quantity).toBe(b.quantity);expect(a.requirement).toBe(b.requirement);expect(a.checksum).not.toBe(b.checksum);
 const task={source_requirement_id:a.requirement,snapshot_checksum:a.checksum,requested_quantity:a.quantity};
 expect(sourceChange(task,[b])).toBe('changed');
 payload.manifest.verificationStatus='synthetic change';const next=await createCatalogSnapshot(payload);
 const c=(await publicationSources({...data,goals:[{...data.goals[0],catalogBinding:{state:'bound',snapshotId:next.id}}]},()=>next,'workspace'))[0];
 expect(c.quantity).toBe(a.quantity);expect(sourceChange(task,[c])).toBe('changed');
 expect(sourceChange(task,[])).toBe('removed');
 expect(sourceChange(task,[],['one'])).toBe('unavailable');
 expect(sourceChange({...task,snapshot_checksum:'quantity-v1:2'},[a])).toBe('unverified');
 expect(sourceChange({source_requirement_id:'manual'},[])).toBeNull();
});
it('detects equal-quantity override changes and scopes identity to the personal workspace',async()=>{
 const {snapshot,data}=await fixture();
 const implicit={...data,goals:[{...data.goals[0]}]};delete implicit.goals[0].recipeId;
 const a=(await publicationSources(implicit,()=>snapshot,'workspace-a'))[0];
 const override={...implicit,goals:[{...implicit.goals[0],recipeOverrides:{[implicit.goals[0].item]:'synthetic-alternative'}}]};
 const b=(await publicationSources(override,()=>snapshot,'workspace-a'))[0];
 expect(b.quantity).toBe(a.quantity);expect(b.requirement).toBe(a.requirement);expect(b.checksum).not.toBe(a.checksum);
 const c=(await publicationSources(implicit,()=>snapshot,'workspace-b'))[0];
 expect(c.requirement).not.toBe(a.requirement);expect(c.checksum).toBe(a.checksum);
 expect(sourceChange({source_requirement_id:a.legacyRequirement,snapshot_checksum:'quantity-v1:2',requested_quantity:2},[a])).toBe('unverified');
});
it('canonicalizes overrides and blocks missing, legacy and invalid selections without bundle fallback',async()=>{
 const {snapshot,data}=await fixture();
 const one={...data,goals:[{...data.goals[0],recipeOverrides:{unusedA:'a',unusedB:'b'}}]};
 const two={...data,goals:[{...data.goals[0],recipeOverrides:{unusedB:'b',unusedA:'a'}}]};
 expect(await publicationSources(one,()=>snapshot,'w')).toEqual(await publicationSources(two,()=>snapshot,'w'));
 expect(await publicationSources(data)).toEqual([]);
 for(const goal of [{...data.goals[0],catalogBinding:undefined},{...data.goals[0],recipeId:'missing'}]) {
  const result=await projectPublication({...data,goals:[goal]},()=>snapshot,'w');expect(result.sources).toEqual([]);expect(result.unavailable).toEqual(['one']);expect(result.warnings.length).toBeGreaterThan(0);
 }
 const result=await projectPublication(data,()=>undefined,'w');expect(result.sources).toEqual([]);expect(result.warnings[0]).toContain('snapshot-missing');
});
