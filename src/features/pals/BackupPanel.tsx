import {useState} from 'react';
import {palStore, type PalStore} from './storage';
import {createPalBackup, MAX_BACKUP_BYTES, parsePalBackup, replacePalBackup, type PalBackupPreview} from './backup';

export function PalBackupPanel({store=palStore}:{store?:PalStore}) {
 const [preview,setPreview]=useState<PalBackupPreview|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [status,setStatus]=useState('');
 async function read(file:File|undefined) {
  if(!file)return;
  setBusy(true);setError('');setStatus('');setConfirmed(false);
  try {
   if(file.size>MAX_BACKUP_BYTES)throw new Error('File exceeds 10 MiB.');
   setPreview(parsePalBackup(await file.text()));
  } catch(e){setError(e instanceof Error?e.message:'Unable to read backup.');}
  finally{setBusy(false);}
 }
 async function download() {
  setBusy(true);setError('');setStatus('');
  try {
   const backup=createPalBackup(await store.snapshot());
   const json=JSON.stringify(backup,null,2);
   if(new TextEncoder().encode(json).length>MAX_BACKUP_BYTES)throw new Error('Backup exceeds the 10 MiB import limit.');
   const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download='palworld-pals-backup.json';document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setStatus('Backup download requested. Verify the downloaded file before replacing data.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to export backup.');}
  finally{setBusy(false);}
 }
 async function replace() {
  if(!preview||!confirmed||busy)return;
  setBusy(true);setError('');setStatus('');
  try{await replacePalBackup(store,preview.backup);setPreview(null);setConfirmed(false);setStatus('Pal, base and route backup restored.');}
  catch(e){setError(e instanceof Error?e.message:'Restore failed; existing data is unchanged.');}
  finally{setBusy(false);}
 }
 return <section aria-labelledby="pal-backup-title">
  <h2 id="pal-backup-title">Pal, base and route backup</h2>
  <p>This backup is separate from crafting and guild data. Export a backup and verify it before overwriting: replacement permanently removes all current Pals, bases and saved routes.</p>
  <button disabled={busy} onClick={()=>void download()}>Export Pal backup</button>
  <label>Preview Pal backup JSON (maximum 10 MiB)<input type="file" accept=".json,application/json" disabled={busy} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';void read(file);}}/></label>
  {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
  {preview&&<div aria-label="Pal backup preview">
   <h3>Import preview — no data changed</h3>
   <p>{preview.backup.snapshot.pals.length} Pals, {preview.backup.snapshot.bases.length} bases, {preview.backup.snapshot.routes.length} routes</p>
   <p>Exported {preview.backup.exportedAt}; catalog {preview.backup.catalogVersion}</p>
   {preview.warnings.length>0&&<><p>Unresolved records are retained. Review these warnings before replacing:</p><ul>{preview.warnings.map(w=><li key={w}>{w}</li>)}</ul></>}
   <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>I have backed up my current data and confirm replacing all Pals, bases and routes.</label>
   <button disabled={busy||!confirmed} onClick={()=>void replace()}>Replace Pal data</button>
   <button disabled={busy} onClick={()=>{setPreview(null);setConfirmed(false);setError('');setStatus('Import cancelled; no data changed.');}}>Cancel Pal import</button>
  </div>}
  <details><summary>Pal Calc attribution and license</summary><p>Reference adapted from Pal Calc, Tyler Camp and contributors. Partial snapshot; game-patch compatibility is unverified.</p><a href="https://raw.githubusercontent.com/tylercamp/palcalc/d040d12ad362167e99937601b39714c4a145db94/LICENSE.txt">Pinned upstream MIT license notice</a></details>
 </section>;
}
