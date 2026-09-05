import {catalog, validateBase, validateRoute, workTypes, type Pal, type Base, type SavedRoute} from './domain';
import {type PalSnapshot, type PalStore} from './storage';

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export interface PalBackup {schemaVersion:1; catalogVersion:string; exportedAt:string; snapshot:PalSnapshot}
export interface PalBackupPreview {backup:PalBackup; warnings:string[]}
const fail = (field:string):never => {throw new Error(`Invalid Pal backup: ${field}.`);};
function object(v:unknown, field:string):Record<string,unknown> {if(!v || typeof v!=='object' || Array.isArray(v))return fail(field);return v as Record<string,unknown>;}
function text(v:unknown, field:string, max=4000, required=true):string {if(typeof v!=='string'||v.length>max||(required&&!v.trim()))return fail(field);return v;}
function bool(v:unknown, field:string):boolean {if(typeof v!=='boolean')return fail(field);return v;}
function integer(v:unknown, field:string, min:number,max:number):number {if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)return fail(field);return v;}
function list(v:unknown, field:string,max=10000):unknown[] {if(!Array.isArray(v)||v.length>max)return fail(field);return v;}
function unique(ids:string[],field:string) {if(new Set(ids).size!==ids.length)fail(`duplicate ${field}`);}

/** Shape validation deliberately does not reject records absent from today's catalog. */
export function validatePalBackup(input:unknown):PalBackupPreview {
 const root=object(input,'envelope');
 if(root.schemaVersion!==1)fail('schemaVersion (expected 1)');
 const catalogVersion=text(root.catalogVersion,'catalogVersion',200);
 const exportedAt=text(root.exportedAt,'exportedAt',40);
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(exportedAt)||!Number.isFinite(Date.parse(exportedAt))||new Date(exportedAt).toISOString()!==exportedAt)fail('exportedAt');
 const snapshot=object(root.snapshot,'snapshot');
 const warnings=new Set<string>();
 const species=(id:string)=>{if(!catalog.species.some(s=>s.id===id))warnings.add(`Unresolved species ID retained: ${id}`);};
 if(catalogVersion!==catalog.catalogId)warnings.add('Backup catalog version differs; unresolved records are retained, not converted.');
 const pals:Pal[]=list(snapshot.pals,'pals').map(value=>{
  const p=object(value,'Pal');const gender=text(p.gender,'gender');
  if(!['male','female','unknown'].includes(gender))fail('gender');
  const speciesId=text(p.speciesId,'speciesId');species(speciesId);
  const passives=list(p.passives,'passives',100).map(v=>text(v,'passive',1000,false));
  if(passives.join(',').length>1000)fail('passives length');
  return {id:text(p.id,'Pal id'),speciesId,nickname:text(p.nickname,'nickname',100,false),gender:gender as Pal['gender'],passives,notes:text(p.notes,'notes',4000,false),location:text(p.location,'location',200,false),archived:bool(p.archived,'archived')};
 });
 unique(pals.map(p=>p.id),'Pal IDs');
 const bases:Base[]=list(snapshot.bases,'bases',1000).map(value=>{
  const b=object(value,'base');
  return {id:text(b.id,'base id'),name:text(b.name,'base name',100),capacity:integer(b.capacity,'capacity',1,100),workerIds:list(b.workerIds,'workerIds',100).map(v=>text(v,'worker ID')),slots:list(b.slots,'slots',100).map(value=>{
   const s=object(value,'slot');const work=text(s.work,'work',100);
   if(!workTypes.includes(work))fail('unsupported work type');
   return {id:text(s.id,'slot id'),work,minimum:integer(s.minimum,'minimum',1,10),priority:integer(s.priority,'priority',1,10)};
  })};
 });
 unique(bases.map(b=>b.id),'base IDs');
 for(const b of bases)validateBase(b,bases,pals);
 const routes:SavedRoute[]=list(snapshot.routes,'routes',1000).map(value=>{
  const r=object(value,'route');const targetId=text(r.targetId,'targetId');species(targetId);
  const route:SavedRoute={id:text(r.id,'route id',100000),targetId,conditional:bool(r.conditional,'route conditional'),sourceVersion:text(r.sourceVersion,'sourceVersion',200),completed:list(r.completed,'completed',6).map(v=>text(v,'completed step',100000)),steps:list(r.steps,'steps',6).map(value=>{
   const s=object(value,'step');const pairId=text(s.pairId,'pairId');const childId=text(s.childId,'childId');species(childId);
   const pair=catalog.breedingPairs.find(p=>p.id===pairId);
   if(!pair||pair.childId!==childId)warnings.add(`Unresolved or changed pair retained: ${pairId}`);
   const parents=list(s.parents,'parents',2).map(v=>text(v,'parent',100000));
   if(parents.length!==2)fail('two parents required');
   for(const ref of parents)if(ref.startsWith('owned:')&&!pals.some(p=>p.id===ref.slice(6)))warnings.add(`Missing original owned-parent link retained: ${ref}`);
   return {id:text(s.id,'step id',100000),pairId,childId,parents:parents as [string,string],conditional:bool(s.conditional,'step conditional')};
  })};
  validateRoute(route);return route;
 });
 unique(routes.map(r=>r.id),'route IDs');
 return {backup:{schemaVersion:1,catalogVersion,exportedAt,snapshot:{pals,bases,routes}},warnings:[...warnings]};
}
export function parsePalBackup(json:string):PalBackupPreview {
 if(new TextEncoder().encode(json).length>MAX_BACKUP_BYTES)fail('file exceeds 10 MiB');
 return validatePalBackup(JSON.parse(json) as unknown);
}
export function createPalBackup(snapshot:PalSnapshot,now=new Date()):PalBackup {
 return validatePalBackup({schemaVersion:1,catalogVersion:catalog.catalogId,exportedAt:now.toISOString(),snapshot}).backup;
}
/** Revalidate immediately before a single atomic transaction. No crafting/guild tables. */
export async function replacePalBackup(store:PalStore,input:unknown):Promise<void> {
 const {snapshot}=validatePalBackup(input).backup;
 const {db}=store;
 await db.transaction('rw',db.pals,db.bases,db.routes,async()=>{
  await db.pals.clear();await db.bases.clear();await db.routes.clear();
  await db.pals.bulkPut(snapshot.pals);await db.bases.bulkPut(snapshot.bases);await db.routes.bulkPut(snapshot.routes);
 });
}
