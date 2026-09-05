import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { workspaceStore, type Workspace, type WorkspaceStore } from '../../data/workspace';
import { canonicalJson } from '../../domain/catalog-snapshot';
import { projectPublication, type PublicationProjection } from './publication';
export async function readPublicationContext(db: WorkspaceStore = workspaceStore) {
 await db.ready();
 return db.transaction('r',db.metadata,db.workspaces,db.catalogSnapshots,async()=>({metadata:(await db.metadata.get('personal'))!,data:await db.load(),snapshots:await db.catalogSnapshots.toArray()}));
}
/** All IO is local. Hash outside the read transaction; discard superseded generations. */
export function usePublicationSources(workspace?: Workspace, db: WorkspaceStore = workspaceStore) {
 const [value,setValue]=useState<{projection:PublicationProjection;revision:number;key:string;db:WorkspaceStore}>();
 const [error,setError]=useState('');
 const key=workspace ? canonicalJson(workspace) : '';
 useEffect(()=>{
  if(!key) return;
  let active=true, generation=0;
  let subscription: {unsubscribe():void} | undefined;
 void db.ready().then(()=>{if(!active)return; subscription=liveQuery(()=>db.transaction('r',db.metadata,db.workspaces,db.catalogSnapshots,async()=>({metadata:(await db.metadata.get('personal'))!,data:(await db.workspaces.get('personal'))!.data,snapshots:await db.catalogSnapshots.toArray()}))).subscribe({next:context=>{
   const current=++generation;
   setValue(undefined);
   if(canonicalJson(context.data)!==key) {setError('Local workspace changed. Reload personal data before previewing a source.');return;}
   const snapshots=new Map(context.snapshots.map(s=>[s.id,s]));
   void projectPublication(context.data,id=>snapshots.get(id),context.metadata.id).then(projection=>{
    if(active && current===generation) {setValue({projection,revision:context.metadata.revision,key,db});setError('');}
   }).catch(e=>{if(active && current===generation)setError(String(e));});
  },error:e=>{if(active){generation++;setValue(undefined);setError(String(e));}}});
  }).catch(e=>{if(active)setError(String(e));});
  return ()=>{active=false;generation++;subscription?.unsubscribe();};
 },[db,key]); // canonical key intentionally detects in-place edits too
 const ready=!!value && value.key===key && value.db===db && !error;
 async function assertCurrent() {
  if(!ready) throw new Error('Local source is unavailable. Preview again.');
  const context=await readPublicationContext(db);
  if(context.metadata.revision!==value.revision || canonicalJson(context.data)!==key) throw new Error('Local source changed after preview. Reload and consent again.');
  const snapshots=new Map(context.snapshots.map(s=>[s.id,s]));
  const projection=await projectPublication(context.data,id=>snapshots.get(id),context.metadata.id);
  if(canonicalJson(projection)!==canonicalJson(value.projection)) throw new Error('Local catalog source changed after preview. Reload and consent again.');
 }
 return {sources:ready?value.projection.sources:[],unavailable:ready?value.projection.unavailable:[],warnings:ready?value.projection.warnings:[],sourceError:error,loading:!ready,assertCurrent};
}
