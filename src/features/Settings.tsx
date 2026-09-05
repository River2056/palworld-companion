import { useEffect, useRef, useState } from 'react';
import { parseBackup, workspaceStore, type Workspace, emptyWorkspace } from '../data/workspace';
import type { WorkspaceProps } from './Craft';
import { CatalogMigrationPanel } from './CatalogMigrationPanel';

type ImportPreview = { readonly source: string; readonly workspace: Workspace; readonly generation: number };

export function Settings({update}:WorkspaceProps) {
 const [text,setText]=useState(''),[preview,setPreview]=useState<ImportPreview>(),[error,setError]=useState(''),[reset,setReset]=useState(false);
 const [reading,setReading]=useState(false),[saving,setSaving]=useState(false);
 const generation=useRef(0),pendingRead=useRef(false),pendingSave=useRef(false);
 useEffect(()=>()=>{generation.current++;},[]);
 function invalidateConsent() {
  generation.current++;
  pendingRead.current=false;
  setReading(false);
  setPreview(undefined);
  setReset(false);
 }
 async function readFile(file:File|undefined) {
  invalidateConsent();
  if(!file)return;
  const request=generation.current;
  pendingRead.current=true;
  setReading(true);
  setError('');
  try {
   if(file.size>10*1024*1024)throw new Error('Backup exceeds 10 MiB');
   const source=await file.text();
   if(request!==generation.current)return;
   // Keep the previous input on read failure, but never carry its consent forward.
   setText(source);
   setPreview(undefined);
  } catch(e) {
   if(request===generation.current)setError(String(e));
  } finally {
   if(request===generation.current){pendingRead.current=false;setReading(false);}
  }
 }
 function previewImport() {
  if(pendingRead.current||pendingSave.current)return;
  setReset(false);
  try {
   // Retain the original envelope, including snapshot bytes, rather than reserializing its workspace.
   setPreview({source:text,workspace:parseBackup(text),generation:generation.current});
   setError('');
  } catch(e){setPreview(undefined);setError(String(e));}
 }
 async function confirmImport() {
  if(!preview||preview.generation!==generation.current||pendingRead.current||pendingSave.current)return;
  pendingSave.current=true;
  setSaving(true);
  setError('');
  try {
   await workspaceStore.import(preview.source);
   await workspaceStore.load();
   window.location.reload();
  } catch(e){setError(String(e));}
  finally {pendingSave.current=false;setSaving(false);}
 }
 return <section className="card stack">
  <h2>Local first. Yours to manage.</h2><CatalogMigrationPanel/>
  <p>These controls cover crafting goals, inventory and recent selections only. Pal/base backup is separate. Guild server data is not included. Personal planning needs no account and sends no telemetry. No game connection; counts and progress are manual.</p>
  <p>Browser storage can be cleared or lost. Export backups regularly. Use one editing tab at a time. The local server must be running to reload the app.</p>
  <button onClick={async()=>{try{const text=await workspaceStore.export();const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='palworld-craft-snapshots-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(String(e));}}}>Export JSON backup</button>
  <label>Import JSON file<input type="file" accept=".json,application/json" disabled={saving} onChange={e=>{void readFile(e.target.files?.[0]);}}/></label>
  <label>Backup JSON<textarea value={text} disabled={saving} onChange={e=>{invalidateConsent();setText(e.target.value);setError('');}}/></label>
  {reading&&<p role="status">Reading backup file. Preview is unavailable until the read finishes.</p>}
  <button disabled={reading||saving} onClick={previewImport}>Preview import</button>
  {error&&<p role="alert">{error}. Existing data is unchanged unless an earlier action succeeded.</p>}
  {preview&&<section aria-label="Import preview">
   <p>Replace crafting scope with {preview.workspace.goals.length} goals, {Object.keys(preview.workspace.stock).length} stock records and {preview.workspace.recent.length} recent selections. Bindings and available snapshot bytes are preserved by schema-2 import. Legacy backups stay legacy-unbound. Snapshot digests are verified on acceptance; missing bytes stay unresolved, never substituted.</p>
   <p className="warning">Unknown IDs are retained, not dropped or replaced. This preview lists saved IDs without borrowing current catalog labels; unresolved goals remain blocked until their exact reference is available or legacy adoption is explicitly accepted.</p>
   <ul aria-label="Imported goals">{preview.workspace.goals.map(g=><li key={g.id}>{g.item}: {g.quantity} · {g.catalogBinding?.state==='bound'?g.catalogBinding.snapshotId:'legacy-unbound'} · ID: {g.id} · Completed: {g.completed} · Notes: {g.notes} · Recipe: {g.recipeId??'unspecified'}{g.recipeOverrides&&` · Overrides: ${JSON.stringify(g.recipeOverrides)}`}{g.catalogBinding?.state==='legacy-unbound'&&g.catalogBinding.claimedVersion&&` · Claimed version: ${g.catalogBinding.claimedVersion}`}</li>)}</ul>
   <ul aria-label="Imported stock">{Object.entries(preview.workspace.stock).map(([id,quantity])=><li key={id}>{id}: {quantity} · Last updated: {preview.workspace.stockUpdatedAt?.[id]??'Unknown — no recorded manual save'}</li>)}</ul>
   <p>Recent selections (saved IDs): {preview.workspace.recent.join(', ')||'None'}</p>
   <button disabled={reading||saving} onClick={()=>{void confirmImport();}}>Confirm replace</button>
   <button disabled={saving} onClick={invalidateConsent}>Cancel import</button>
  </section>}
  <button disabled={saving} onClick={()=>{invalidateConsent();setReset(true);}}>Reset crafting workspace</button>
  {reset&&<section aria-label="Reset confirmation">
   <p>Remove crafting goals, inventory and recent selections? Export a backup first. Pal/base records and workspace identity are not reset.</p>
   <button onClick={async()=>{if(await update(emptyWorkspace()))setReset(false);}}>Confirm reset</button>
   <button onClick={()=>setReset(false)}>Cancel reset</button>
  </section>}
 </section>;
}
