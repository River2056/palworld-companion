import {canonicalJson,importCatalogSnapshot,resolveRecipe,type CatalogSnapshot,type CatalogBinding} from '../domain/catalog-snapshot';
import {PersonalDatabase,binding,importBudget,type BindingChange,type MigrationHistory} from './personal-db';
export interface MigrationDecision {goals?:Record<string,'keep'|'migrate'>;routes?:Record<string,'keep'|'migrate'>;acknowledgeLegacy?:boolean}
export interface ReferenceChange {kind:'goal'|'route'|'pal';id:string;status:'unknown'|'changed'|'unchanged'|'historical-unavailable';references:string[];before:CatalogBinding;after:CatalogBinding;decision:'keep'|'migrate'}
export interface MigrationPreview {id:string;expectedRevision:number;candidateId:string;references:ReferenceChange[];changes:BindingChange[];rollbackOf?:string}
interface Proposal {dbName:string;preview:MigrationPreview;candidate:CatalogSnapshot;before:CatalogSnapshot['id']}
const proposals=new Map<string,Proposal>();
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
/** Read-only after startup readiness. Returned form objects cannot mutate the stored proposal. */
export async function previewCatalogMigration(db:PersonalDatabase,candidateValue:unknown,decisions:MigrationDecision={}):Promise<MigrationPreview>{
 importBudget(candidateValue);await db.ready();const candidate=await importCatalogSnapshot(candidateValue);
 const proposal=await db.transaction('r',db.tables,async()=>{
  const meta=(await db.metadata.get('personal'))!;const work=await db.workspaces.get('personal');const routes=await db.routes.toArray();
  const references:ReferenceChange[]=[],changes:BindingChange[]=[];
  for(const goal of work?.data.goals??[]){
   const before=binding(goal.catalogBinding),after:CatalogBinding={state:'bound',snapshotId:candidate.id};
   const old=before.state==='bound'?await db.catalogSnapshots.get(before.snapshotId):undefined;
   const recipeId=goal.recipeId??(before.state==='legacy-unbound'?candidate.craft.defaultRecipeByItem[goal.item]:undefined);
   const selection={...(recipeId===undefined?{}:{recipeId}),...(goal.recipeOverrides?{recipeOverrides:goal.recipeOverrides}:{})};
   const next=resolveRecipe(candidate.craft,goal.item,selection);
   const prior=old?resolveRecipe(old.craft,goal.item,selection):undefined;
   const missing:string[]=[],changed:string[]=[];
   const visited=new Set<string>();
   const visit=(id:string,path:string[],root=false)=>{
    if(path.includes(id)||path.length>=40){missing.push(id);return;}
    if(visited.has(id))return;visited.add(id);
    const selected=root?selection:{recipeOverrides:goal.recipeOverrides};
    const r=resolveRecipe(candidate.craft,id,selected);
    if(old&&!same(resolveRecipe(old.craft,id,selected),r))changed.push(id);
    if(r.status==='unresolved'){missing.push(r.recipeId??id);return;}
    if(r.status==='resolved')r.recipe.inputs.forEach(i=>visit(i.item,[...path,id]));
   };
   visit(goal.item,[],true);
   const status=missing.length?'unknown':!prior?'historical-unavailable':changed.length||!same(prior,next)?'changed':'unchanged';
   const decision=decisions.goals?.[goal.id]??(before.state==='legacy-unbound'?'keep':'migrate');
   if(decision==='migrate'&&before.state==='legacy-unbound'&&!decisions.acknowledgeLegacy)throw new Error('Acknowledge applying current rules, not recovering history');
   references.push({kind:'goal',id:goal.id,status,references:[...new Set([...missing,...changed])],before,after,decision});
   if(decision==='migrate')changes.push({kind:'goal',id:goal.id,before,after,...(goal.recipeId===undefined?{}:{beforeRecipeId:goal.recipeId}),...(recipeId===undefined?{}:{afterRecipeId:recipeId})});
  }
  for(const route of routes){
   const before=binding(route.catalogBinding,route.sourceVersion),after:CatalogBinding={state:'bound',snapshotId:candidate.id};
   const old=before.state==='bound'?await db.catalogSnapshots.get(before.snapshotId):undefined;
   const unknown=route.steps.filter(s=>!candidate.pals.breedingPairs.some(p=>p.id===s.pairId&&p.childId===s.childId)).map(s=>s.pairId);
   const changed=route.steps.filter(s=>{const a=old?.pals.breedingPairs.find(p=>p.id===s.pairId),b=candidate.pals.breedingPairs.find(p=>p.id===s.pairId);return a&&b&&!same(a,b);}).map(s=>s.pairId);
   const status=unknown.length?'unknown':!old?'historical-unavailable':changed.length?'changed':'unchanged';
   const decision=decisions.routes?.[route.id]??(status==='unchanged'?'migrate':'keep');
   if(decision==='migrate'&&before.state==='legacy-unbound'&&!decisions.acknowledgeLegacy)throw new Error('Acknowledge applying current rules, not recovering history');
   references.push({kind:'route',id:route.id,status,references:[...unknown,...changed],before,after,decision});
   if(decision==='migrate')changes.push({kind:'route',id:route.id,before,after});
  }
  for(const pal of await db.pals.toArray())if(!candidate.pals.species.some(s=>s.id===pal.speciesId))references.push({kind:'pal',id:pal.id,status:'unknown',references:[pal.speciesId],before:{state:'bound',snapshotId:meta.selectedCatalog},after:{state:'bound',snapshotId:candidate.id},decision:'keep'});
  return {dbName:db.name,before:meta.selectedCatalog,candidate,preview:{id:crypto.randomUUID(),expectedRevision:meta.revision,candidateId:candidate.id,references,changes}};
 });
 proposals.set(proposal.preview.id,structuredClone(proposal));return structuredClone(proposal.preview);
}
export function cancelCatalogMigration(previewId:string){proposals.delete(previewId);}
export async function acceptCatalogMigration(db:PersonalDatabase,previewId:string,expectedRevision:number):Promise<string>{
 const proposal=proposals.get(previewId);if(!proposal||proposal.dbName!==db.name)throw new Error('Preview expired; preview again');
 const {preview}=proposal;if(expectedRevision!==preview.expectedRevision)throw new Error('Data changed; preview again');
 const candidate=await importCatalogSnapshot(proposal.candidate);
 const historyId=crypto.randomUUID();
 await db.write(async()=>{
  const row=await db.workspaces.get('personal');
  for(const change of preview.changes){
   if(change.kind==='goal'){
    const goal=row?.data.goals.find(g=>g.id===change.id);if(!goal||!same(binding(goal.catalogBinding),change.before)||goal.recipeId!==change.beforeRecipeId)throw new Error('Binding conflict; preview again');
    goal.catalogBinding=change.after;
    if(change.afterRecipeId===undefined)delete goal.recipeId;else goal.recipeId=change.afterRecipeId;
   }else{
    const route=await db.routes.get(change.id);if(!route||!same(binding(route.catalogBinding,route.sourceVersion),change.before))throw new Error('Binding conflict; preview again');
    await db.routes.put({...route,catalogBinding:change.after});
   }
  }
  await db.putSnapshot(candidate);if(row)await db.workspaces.put(row);
  const meta=(await db.metadata.get('personal'))!;await db.metadata.put({...meta,selectedCatalog:candidate.id});
  await db.migrationHistory.add({id:historyId,before:proposal.before,after:candidate.id,changes:preview.changes,revision:meta.revision+1});
 },expectedRevision);
 proposals.delete(previewId);return historyId;
}
/** Rollback is a fresh optimistic preview; only bindings/root adoption and selection change. */
export async function previewCatalogRollback(db:PersonalDatabase,historyId:string):Promise<MigrationPreview>{
 await db.ready();const proposal=await db.transaction('r',db.tables,async()=>{
  const h:MigrationHistory|undefined=await db.migrationHistory.get(historyId);if(!h)throw new Error('Migration history missing');
  const meta=(await db.metadata.get('personal'))!;if(meta.selectedCatalog!==h.after)throw new Error('Selection conflict; preview again');
  const candidate=await db.catalogSnapshots.get(h.before);if(!candidate)throw new Error('Prior snapshot missing');
  const changes=h.changes.map(c=>({kind:c.kind,id:c.id,before:c.after,after:c.before,...(c.afterRecipeId===undefined?{}:{beforeRecipeId:c.afterRecipeId}),...(c.beforeRecipeId===undefined?{}:{afterRecipeId:c.beforeRecipeId})}));
  const row=await db.workspaces.get('personal');
  for(const c of changes){const value=c.kind==='goal'?row?.data.goals.find(g=>g.id===c.id):await db.routes.get(c.id);if(!value||!same(binding(value.catalogBinding),c.before))throw new Error('Binding conflict; preview again');}
  return {dbName:db.name,candidate,before:meta.selectedCatalog,preview:{id:crypto.randomUUID(),expectedRevision:meta.revision,candidateId:candidate.id,references:[],changes,rollbackOf:historyId}};
 });proposals.set(proposal.preview.id,structuredClone(proposal));return structuredClone(proposal.preview);
}
