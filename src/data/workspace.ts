import Dexie, { type Table } from 'dexie';
import { integer } from '../domain/catalog';
import { type Goal, type Stock } from '../domain/planner';
export interface Workspace { version: 1; goals: Goal[]; stock: Stock; recent: string[] }
export const emptyWorkspace = (): Workspace => ({version:1,goals:[],stock:{},recent:[]});
function object(value: unknown): value is Record<string,unknown> { return typeof value==='object' && value!==null && !Array.isArray(value); }
export function parseBackup(text: string): Workspace {
 const v: unknown = JSON.parse(text);
 if(!object(v) || v.version!==1 || !Array.isArray(v.goals) || !object(v.stock) || !Array.isArray(v.recent)) throw new Error('Unsupported or malformed backup');
 const ids=new Set<string>();
 for(const g of v.goals) { if(!object(g) || typeof g.id!=='string' || !g.id || ids.has(g.id) || typeof g.item!=='string' || !g.item || typeof g.notes!=='string' || typeof g.quantity!=='number' || typeof g.completed!=='number') throw new Error('Invalid goal'); integer(g.quantity,1); integer(g.completed); if(g.completed>g.quantity) throw new Error('Invalid progress'); ids.add(g.id); }
 for(const [id,n] of Object.entries(v.stock)) { if(!id || typeof n!=='number') throw new Error('Invalid stock'); integer(n); }
 if(v.recent.some(s=>typeof s!=='string')) throw new Error('Invalid recent searches');
 return {version:1,goals:v.goals as Goal[],stock:v.stock as Stock,recent:v.recent as string[]};
}
export class WorkspaceStore extends Dexie {
 private workspaces!: Table<{id:string; data: Workspace},string>;
 constructor(name='palworld-companion') { super(name); this.version(1).stores({workspaces:'id'}); }
 async load() { const row=await this.workspaces.get('personal'); return row ? parseBackup(JSON.stringify(row.data)) : emptyWorkspace(); }
 async save(data: Workspace) { const valid=parseBackup(JSON.stringify(data)); await this.transaction('rw',this.workspaces,()=>this.workspaces.put({id:'personal',data:valid})); }
 async export() { return JSON.stringify(await this.load(),null,2); }
 async import(text:string) { const valid=parseBackup(text); await this.save(valid); }
 async reset() { await this.save(emptyWorkspace()); }
}
export const workspaceStore=new WorkspaceStore();
