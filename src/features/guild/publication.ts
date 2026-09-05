import type { Workspace } from '../../data/workspace';
import { digestCanonicalJson, resolveRecipe } from '../../domain/catalog-snapshot';
import { planWorkspace, type SnapshotResolver } from '../../domain/snapshot-planner';
import type { Task } from './client';
export interface PublicationSource { kind: 'pin' | 'shortage'; title: string; source: string; requirement: string; checksum: string; quantity: number; legacyRequirement?: string }
export interface PublicationProjection { sources: PublicationSource[]; unavailable: string[]; warnings: string[] }
const prefix = 'personal:v1:';
const identity = (goal: string, kind: PublicationSource['kind'], item: string) => prefix + JSON.stringify([goal,kind,item]);
/** Only explicitly projected public semantics enter the digest. Never hash/export the workspace. */
export async function projectPublication(data: Workspace, resolve: SnapshotResolver, workspaceId: string): Promise<PublicationProjection> {
 const goals = data.goals.map(g=>({...g,catalogBinding:g.catalogBinding ?? {state:'legacy-unbound' as const}}));
 const allocation = planWorkspace(resolve, goals, data.stock);
 const sources: PublicationSource[] = [], unavailable: string[] = [], warnings: string[] = [];
 for (const result of allocation.goalResults) if(result.status==='unresolved') {
  unavailable.push(result.id); warnings.push(`Source ${result.id} unavailable: ${result.diagnostics.map(d=>d.code).join(', ')}. Adopt or repair its exact catalog binding locally before publication.`);
 }
 for (const goal of goals) {
  if(!allocation.goals.some(g=>g.id===goal.id) || goal.catalogBinding.state!=='bound') continue;
  const snapshot = resolve(goal.catalogBinding.snapshotId)!;
  // Include the selected closure, even branches covered by private stock. Selection
  // is independent of inventory and uses the planner's exact root/default policy.
  const recipes = new Map<string, unknown>();
  function visit(item: string, root=false) {
   const selected=resolveRecipe(snapshot.craft,item,root && Object.hasOwn(goal,'recipeId') ? {recipeId:goal.recipeId,recipeOverrides:goal.recipeOverrides} : {recipeOverrides:goal.recipeOverrides});
   if(selected.status!=='resolved' || recipes.has(selected.recipe.id)) return;
   const r=selected.recipe;
   recipes.set(r.id,{id:r.id,outputItemId:r.outputItemId,output_count:r.output_count,inputs:r.inputs});
   r.inputs.forEach(i=>visit(i.item));
  }
  visit(goal.item,true);
  async function add(kind: PublicationSource['kind'], item: string, quantity: number, required: number) {
   if(!quantity) return;
   const requirement='personal:v2:'+JSON.stringify([workspaceId,goal.id,kind,item]);
   if(requirement.length>300 || item.length>200) {unavailable.push(goal.id);warnings.push(`Source ${goal.id} identifier exceeds publication limits.`);return;}
   const checksum='semantic-v2:'+await digestCanonicalJson({algorithm:'guild-source-v2',snapshotId:snapshot.id,root:allocation.goals.find(g=>g.id===goal.id)!.recipeId,overrides:goal.recipeOverrides ?? {},recipes:[...recipes.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0),kind,item,quantity,required,goalOutput:goal.item,goalQuantity:goal.quantity,remaining:goal.quantity-goal.completed});
   sources.push({kind,title:`${kind==='pin'?'Craft':'Gather'} ${snapshot.craft.items.find(i=>i.id===item)?.name ?? item}`.slice(0,200),source:item,requirement,legacyRequirement:identity(goal.id,kind,item),checksum,quantity});
  }
  await add('pin',goal.item,goal.quantity,goal.quantity-goal.completed);
  for(const row of allocation.direct) for(const c of row.contributions) if(c.goalId===goal.id) await add('shortage',row.item,c.missing,c.required);
 }
 return {sources,unavailable,warnings};
}
/** No resolver means no authoritative publishable sources; never consult today's bundle. */
export async function publicationSources(data: Workspace, resolve: SnapshotResolver = ()=>undefined, workspaceId=''): Promise<PublicationSource[]> {
 if(!workspaceId) return [];
 return (await projectPublication(data,resolve,workspaceId)).sources;
}
export function matchingSource(task: Pick<Task,'source_requirement_id'>, sources: PublicationSource[]) {
 return sources.find(s=>s.requirement===task.source_requirement_id || s.legacyRequirement===task.source_requirement_id);
}
export function sourceChange(task: Pick<Task,'source_requirement_id'|'snapshot_checksum'|'requested_quantity'>, sources: PublicationSource[], unavailable: string[] = []): 'changed' | 'removed' | 'unavailable' | 'unverified' | null {
 const id=task.source_requirement_id;
 if(!id?.startsWith(prefix) && !id?.startsWith('personal:v2:')) return null;
 let goal: string | undefined;
 try { const parts=JSON.parse(id.slice(id.indexOf(':',9)+1));goal=parts[id.startsWith(prefix)?0:1]; } catch { return 'unverified'; }
 if(goal && unavailable.includes(goal)) return 'unavailable';
 if(!task.snapshot_checksum?.startsWith('semantic-v2:')) return 'unverified';
 const source=matchingSource(task,sources);
 if(!source) return 'removed';
 return source.checksum!==task.snapshot_checksum || source.quantity!==task.requested_quantity ? 'changed' : null;
}
