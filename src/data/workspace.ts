import {PersonalDatabase, importBudget, binding, scopedSnapshots, verifyBackupSnapshots, type SnapshotBackup} from './personal-db';
import {validateSnapshotShape, type CatalogBinding} from '../domain/catalog-snapshot';
import { integer } from '../domain/catalog';
import { type Goal, type Stock } from '../domain/planner';
export interface Workspace {
 version: 1;
 goals: (Goal & {catalogBinding?:CatalogBinding;recipeId?:string;recipeOverrides?:Record<string,string>})[];
 stock: Stock;
 recent: string[];
 /** Last manual save per stock entry, in canonical UTC ISO format. Absence means unknown. */
 stockUpdatedAt?: Record<string, string>;
}
export const emptyWorkspace = (): Workspace => ({version:1,goals:[],stock:{},recent:[]});
function object(value: unknown): value is Record<string,unknown> { return typeof value==='object' && value!==null && !Array.isArray(value); }
export function parseBackup(text: string): Workspace {
 if(text.length>10*1024*1024||new TextEncoder().encode(text).length>10*1024*1024)throw new Error('Backup exceeds 10 MiB');
 let v: unknown = JSON.parse(text);
 importBudget(v);
 if(object(v) && v.schemaVersion===2){validateCraftEnvelope(v);v=v.workspace;}
 if(!object(v) || v.version!==1 || !Array.isArray(v.goals) || v.goals.length>10000 || !object(v.stock) || !Array.isArray(v.recent)) throw new Error('Unsupported or malformed backup');
 const ids=new Set<string>();
 for(const g of v.goals) { if(!object(g) || typeof g.id!=='string' || !g.id || ids.has(g.id) || typeof g.item!=='string' || !g.item || typeof g.notes!=='string' || typeof g.quantity!=='number' || typeof g.completed!=='number') throw new Error('Invalid goal'); integer(g.quantity,1); integer(g.completed); if(g.completed>g.quantity) throw new Error('Invalid progress'); ids.add(g.id); if(g.catalogBinding!==undefined)binding(g.catalogBinding); if(g.recipeId!==undefined&&(typeof g.recipeId!=='string'||!g.recipeId))throw new Error('Invalid recipe ID'); if(g.recipeOverrides!==undefined&&(!object(g.recipeOverrides)||Object.values(g.recipeOverrides).some(r=>typeof r!=='string'||!r)))throw new Error('Invalid recipe overrides'); }
 for(const [id,n] of Object.entries(v.stock)) { if(!id || typeof n!=='number') throw new Error('Invalid stock'); integer(n); }
 if(v.stockUpdatedAt !== undefined) {
  if(!object(v.stockUpdatedAt)) throw new Error('Invalid stock timestamp map');
  for(const [id,timestamp] of Object.entries(v.stockUpdatedAt)) {
   // Roundtrip rejects normalized impossible dates as well as ambiguous local dates.
   if(!id || !Object.hasOwn(v.stock,id) || typeof timestamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) ||
    !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    throw new Error('Invalid stock timestamp');
   }
  }
 }
 if(v.recent.some(s=>typeof s!=='string')) throw new Error('Invalid recent searches');
 return {version:1,goals:v.goals as Goal[],stock:v.stock as Stock,recent:v.recent as string[],
  ...(v.stockUpdatedAt === undefined ? {} : {stockUpdatedAt: v.stockUpdatedAt as Record<string,string>})};
}
function validateCraftEnvelope(v:Record<string,unknown>){
 if(v.scope!=='craft'||!Array.isArray(v.snapshots)||v.snapshots.length>100)throw new Error('Invalid craft backup envelope');
 for(const s of v.snapshots){if(!object(s))throw new Error('Invalid snapshot');const {id,...payload}=s;binding({state:'bound',snapshotId:id});validateSnapshotShape(payload);}
}
export class WorkspaceStore extends PersonalDatabase {
 async load() { await this.ready();const row=await this.workspaces.get('personal'); return row ? parseBackup(JSON.stringify(row.data)) : emptyWorkspace(); }
 async save(data: Workspace,expectedRevision?:number) {
  const valid=parseBackup(JSON.stringify(data));
  await this.write(async()=>{
   const old=await this.workspaces.get('personal');const meta=(await this.metadata.get('personal'))!;const snapshot=(await this.catalogSnapshots.get(meta.selectedCatalog))!;
   valid.goals=valid.goals.map(g=>{
    const prior=old?.data.goals.find(p=>p.id===g.id);
    if(prior)return {...g,catalogBinding:binding(prior.catalogBinding),...(prior.recipeId===undefined?{}:{recipeId:g.recipeId??prior.recipeId})};
    const recipeId=g.recipeId??snapshot.craft.defaultRecipeByItem[g.item];
    return {...g,catalogBinding:g.catalogBinding??{state:'bound',snapshotId:meta.selectedCatalog},...(recipeId===undefined?{}:{recipeId})};
   });
   await this.workspaces.put({id:'personal',data:valid});
  },expectedRevision);
 }
 async export() {await this.ready();return this.transaction('r',this.tables,async()=>{const data=await this.load();const refs=await scopedSnapshots(this,data.goals.map(g=>binding(g.catalogBinding)));const text=JSON.stringify({schemaVersion:2,scope:'craft',workspace:data,...refs},null,2);importBudget(JSON.parse(text));if(new TextEncoder().encode(text).length>10*1024*1024)throw new Error('Backup exceeds 10 MiB');return text;});}
 async import(text:string) {
  const valid=parseBackup(text);const envelope=JSON.parse(text) as Partial<SnapshotBackup>&{schemaVersion?:number};
  const snapshots=await verifyBackupSnapshots(envelope.schemaVersion===2?envelope.snapshots:[]);
  valid.goals=valid.goals.map(g=>({...g,catalogBinding:binding(envelope.schemaVersion===2?g.catalogBinding:undefined)}));
  // Absent snapshots retain their exact binding as an unresolved recovery state.
  await this.write(async()=>{for(const s of snapshots)await this.putSnapshot(s);await this.workspaces.put({id:'personal',data:valid});});
 }
 async reset() { await this.save(emptyWorkspace()); }
}
export const workspaceStore=new WorkspaceStore();
