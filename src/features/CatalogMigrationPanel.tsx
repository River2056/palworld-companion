import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { workspaceStore } from '../data/workspace';
import { createBundledCatalogSnapshot, importCatalogSnapshot, type CatalogSnapshot } from '../domain/catalog-snapshot';
import { previewCatalogMigration, previewCatalogRollback, cancelCatalogMigration, acceptCatalogMigration, type MigrationPreview } from '../data/catalog-migration';
import { useCatalogRuntime, loadCatalogRuntime, planRuntimeWorkspace, bindingLabel } from './catalog-runtime';
import type { SnapshotPlan } from '../domain/snapshot-planner';
import type { Workspace } from '../data/workspace';
import { routeWarnings, analyzeBase, suitability } from './pals/domain';
interface PalDelta {id:string;kind:'route'|'base';before:string[];after:string[]}
interface Delta {id:string;before:SnapshotPlan;after:SnapshotPlan}
export function CatalogMigrationPanel() {
 const {runtime,error:loadError}=useCatalogRuntime();
 const [name,setName]=useState(''),[candidate,setCandidate]=useState<CatalogSnapshot>(),[preview,setPreview]=useState<MigrationPreview>(),[deltas,setDeltas]=useState<Delta[]>([]),[ack,setAck]=useState(false),[error,setError]=useState(''),[history,setHistory]=useState<{id:string;revision:number}[]>([]);
 const [palDeltas,setPalDeltas]=useState<PalDelta[]>([]);
 const [busy,setBusy]=useState(false);
 const [selectedBefore,setSelectedBefore]=useState('');
 const generation=useRef(0);
 const [observedRevision,setObservedRevision]=useState(-1);
 const [observationError,setObservationError]=useState('');
 useEffect(()=>{
  const subscription=liveQuery(()=>workspaceStore.metadata.get('personal')).subscribe({next:metadata=>{setObservedRevision(metadata?.revision??-1);setObservationError('');},error:e=>setObservationError(String(e))});
  return ()=>subscription.unsubscribe();
 },[]);
 const stale=!!preview&&(observedRevision>preview.expectedRevision||!!observationError);
 function clearReview(){generation.current++;setPreview(undefined);setBusy(false);setError('');}
 useEffect(()=>{if(stale){setAck(false);if(preview)cancelCatalogMigration(preview.id);}},[stale,preview]);
 useEffect(()=>()=>{generation.current++;},[]);
 const [routeDecisions,setRouteDecisions]=useState<Record<string,'keep'|'migrate'>>({});
 const [decisions,setDecisions]=useState<Record<string,'keep'|'migrate'>>({});
 useEffect(()=>{void workspaceStore.ready().then(()=>workspaceStore.migrationHistory.toArray()).then(setHistory).catch(e=>setError(String(e)));},[]);
 useEffect(()=>()=>{if(preview)cancelCatalogMigration(preview.id);},[preview]);
 async function show(p:MigrationPreview,c:CatalogSnapshot,token:number){
  // All displayed inputs, including retained snapshot bytes, share the proposal revision.
  const captured=await workspaceStore.transaction('r',workspaceStore.tables,async()=>{
   const runtime=await loadCatalogRuntime();
   if(runtime.metadata.revision!==p.expectedRevision)throw new Error('Data changed; preview again');
   return {runtime,data:await workspaceStore.load(),personal:{pals:await workspaceStore.pals.toArray(),routes:await workspaceStore.routes.toArray(),bases:await workspaceStore.bases.toArray()}};
  }).catch(e=>{cancelCatalogMigration(p.id);throw e;});
  if(token!==generation.current){cancelCatalogMigration(p.id);return;}
  const {runtime,data,personal}=captured;
  const nextRuntime={...runtime,resolve:(id:Parameters<typeof runtime.resolve>[0])=>id===c.id?c:runtime.resolve(id)};
  const nextGoals=data.goals.map(g=>{const change=p.changes.find(v=>v.kind==='goal'&&v.id===g.id);return change?{...g,catalogBinding:change.after,recipeId:change.afterRecipeId}:g;});
  const before=planRuntimeWorkspace(runtime,data),after=planRuntimeWorkspace(nextRuntime,{...data,goals:nextGoals});
  const perGoal=(plan:SnapshotPlan,id:string):SnapshotPlan=>{
   const diagnostics=plan.diagnostics.filter(d=>d.goalId===id);
   const rows=(key:'direct'|'raw'|'allocations')=>plan[key].flatMap(r=>r.contributions.filter(c=>c.goalId===id).map(c=>({...r,...c,contributions:[c]})));
   return {...plan,complete:diagnostics.length===0,diagnostics,goals:plan.goals.filter(g=>g.id===id),goalResults:plan.goalResults.filter(g=>g.id===id),steps:plan.steps.filter(s=>s.goalId===id),direct:rows('direct'),raw:rows('raw'),allocations:rows('allocations')};
  };
  setDeltas(data.goals.map(g=>{const prior=perGoal(before,g.id);if(g.catalogBinding?.state!=='bound'||!runtime.resolve(g.catalogBinding.snapshotId))prior.complete=false;return {id:g.id,before:prior,after:perGoal(after,g.id)};}));
  const comparisons:PalDelta[]=personal.routes.map(route=>{
   const change=p.changes.find(v=>v.kind==='route'&&v.id===route.id);
   const before=route.catalogBinding?.state==='bound'?runtime.resolve(route.catalogBinding.snapshotId):undefined;
   const afterBinding=change?.after??route.catalogBinding;
   const after=afterBinding?.state==='bound'?nextRuntime.resolve(afterBinding.snapshotId):undefined;
   const warnings=(snapshot:CatalogSnapshot|undefined)=>snapshot?routeWarnings(route,personal.pals,snapshot.pals):['Historical calculation unavailable; migration required, compatibility unverified.'];
   return {kind:'route',id:route.id,before:warnings(before),after:warnings(after)};
  });
  for(const base of personal.bases){
   const describe=(snapshot:CatalogSnapshot|undefined)=>{
    if(!snapshot)return ['Selected analysis context unavailable; coverage unknown.'];
    const report=analyzeBase(base,personal.pals,personal.bases,snapshot.pals);
    return [`${report.assignments.length}/${base.slots.length} covered; ${report.shortage} uncovered`,...report.gaps.map(s=>`Gap ${s.id}: ${s.work} minimum ${s.minimum}`),...base.workerIds.flatMap(id=>{const pal=personal.pals.find(p=>p.id===id);return !pal?[`Missing worker ${id}`]:base.slots.map(s=>`${id}: ${s.work} suitability ${suitability(pal,s.work,snapshot.pals)} (minimum ${s.minimum})`);})];
   };
   comparisons.push({kind:'base',id:base.id,before:describe(runtime.selected),after:describe(c)});
  }
  setSelectedBefore(runtime.metadata.selectedCatalog);
  setPalDeltas(comparisons);
  setPreview(p);setError('');
 }
 async function prepare(){
  clearReview();const token=generation.current;setBusy(true);
  try{const c=candidate??await createBundledCatalogSnapshot();if(token!==generation.current)return;setCandidate(c);const data=await workspaceStore.load();const goals=Object.fromEntries(data.goals.map(g=>[g.id,decisions[g.id]??(g.catalogBinding?.state!=='bound'?(ack?'migrate':'keep'):'migrate')]));await show(await previewCatalogMigration(workspaceStore,c,{goals,routes:routeDecisions,acknowledgeLegacy:ack}),c,token);}
  catch(e){if(token===generation.current){setAck(false);setError(String(e));}}
  finally{if(token===generation.current)setBusy(false);}
 }
 if(!runtime)return <p>{loadError||'Loading workspace metadata…'}</p>;
 const rows=(d:Delta,projection:'direct'|'raw')=>{
  if(!d.before.complete)return <p>{projection}: historical calculation unavailable (not zero). Candidate: {d.after.complete?d.after[projection].map(r=>`${r.item} need ${r.required}, missing ${r.missing}`).join('; '):'unresolved'}</p>;
  if(!d.after.complete)return <p>{projection}: candidate unresolved; numeric delta unavailable.</p>;
  const ids=[...new Set([...d.before[projection],...d.after[projection]].map(r=>r.item))];
  return <ul>{ids.map(id=>{const a=d.before[projection].find(r=>r.item===id),b=d.after[projection].find(r=>r.item===id);return <li key={id}>{projection} {id}: need {a?.required??0} → {b?.required??0} (Δ {(b?.required??0)-(a?.required??0)}); missing {a?.missing??0} → {b?.missing??0} (Δ {(b?.missing??0)-(a?.missing??0)})</li>;})}</ul>;
 };
 return <section aria-label="Catalog migration" className="card stack"><h3>Workspace and catalog references</h3><p>Workspace: {runtime.metadata.name} · ID: {runtime.metadata.id} · revision {runtime.metadata.revision}</p><label>Workspace name<input value={name} placeholder={runtime.metadata.name} maxLength={100} onChange={e=>setName(e.target.value)}/></label><button onClick={()=>void workspaceStore.rename(name).then(()=>setError('')).catch(e=>setError(String(e)))}>Save workspace name</button><p>Selected reference for new plans: {runtime.metadata.selectedCatalog}</p><p>Changing reference is explicit. Legacy adoption applies available rules; it does not recover historical rules. Preview and cancel do not write personal data.</p><button onClick={()=>{setCandidate(undefined);clearReview();}}>Use bundled candidate</button><label>Import local catalog snapshot<input type="file" accept=".json,application/json" onChange={async e=>{clearReview();setCandidate(undefined);const token=generation.current;const f=e.target.files?.[0];if(!f)return;setBusy(true);try{if(f.size>10*1024*1024)throw new Error('Snapshot exceeds 10 MiB');const imported=await importCatalogSnapshot(JSON.parse(await f.text()));if(token===generation.current){setCandidate(imported);setError('');}}catch(e){if(token===generation.current)setError(String(e));}finally{if(token===generation.current)setBusy(false);}}}/></label><p>Candidate: {candidate?.manifest.datasetId??'Bundled reference'} · {candidate?.id??'computed at preview'}; digest validation is not source trust verification.</p><label><input type="checkbox" checked={ack} onChange={e=>{setAck(e.target.checked);clearReview();}}/>I acknowledge applying current rules to legacy plans, not recovering history</label><button disabled={busy} onClick={()=>void prepare()}>Preview catalog migration</button>
 {preview&&<section aria-label="Catalog migration preview"><h4>{preview.rollbackOf?'Rollback':'Migration'} preview</h4>{stale?<p role="alert">Data changed; preview again. Consent cleared; comparisons withheld.</p>:<><p>Selected {selectedBefore} → {preview.candidateId}. Revision {preview.expectedRevision}. Quantities, progress, notes and inventory timestamps remain unchanged.</p>{preview.references.map(r=><div key={`${r.kind}:${r.id}`}><p>{r.kind} {r.id}: {bindingLabel({catalogBinding:r.before} as Workspace['goals'][number])} → {bindingLabel({catalogBinding:r.after} as Workspace['goals'][number])}; {r.status}; unknown/changed IDs: {r.references.join(', ')||'none'}; decision {r.decision}</p>{(r.kind==='goal'||r.kind==='route')&&<label>Decision for {r.id}<select value={(r.kind==='route'?routeDecisions:decisions)[r.id]??r.decision} onChange={e=>{if(r.kind==='route')setRouteDecisions({...routeDecisions,[r.id]:e.target.value as 'keep'|'migrate'});else setDecisions({...decisions,[r.id]:e.target.value as 'keep'|'migrate'});clearReview();}}><option value="keep">Keep old binding</option><option value="migrate">Migrate</option></select></label>}</div>)}{preview.changes.map(c=><p key={`${c.kind}:${c.id}`}>{c.kind} {c.id}: {c.before.state==='bound'?c.before.snapshotId:c.before.state} → {c.after.state==='bound'?c.after.snapshotId:c.after.state} · recipe {c.beforeRecipeId??'unknown'} → {c.afterRecipeId??'unknown'}</p>)}<p>Base decision: accepting changes the selected analysis context for all bases; cancel keeps the existing context. Bases have no stored snapshot binding or per-base migration decision. Assignments, slots and saved route graphs/checklists are not rewritten.</p>{palDeltas.map(d=><section key={`${d.kind}:${d.id}`} aria-label={`${d.kind} ${d.id} comparison`}><h5>{d.kind} {d.id} · before / after warnings</h5><p>Before: {d.before.join('; ')||'No reference warnings'}</p><p>After: {d.after.join('; ')||'No reference warnings'}</p></section>)}{deltas.map(d=><section key={d.id}><h5>Goal {d.id} · queue-priority allocation using current stock</h5><p>Batch/output/surplus: {d.before.complete?JSON.stringify(d.before.goals.map(g=>[g.batches,g.output,g.surplus])):'historical calculation unavailable'} → {d.after.complete?JSON.stringify(d.after.goals.map(g=>[g.batches,g.output,g.surplus])):'unresolved'}</p>{rows(d,'direct')}{rows(d,'raw')}{d.after.diagnostics.map((v,i)=><p key={i}>{v.code}: {v.path.join(' → ')}</p>)}</section>)}</>}<button onClick={()=>{cancelCatalogMigration(preview.id);clearReview();}}>Cancel catalog migration</button><button disabled={stale||busy||!!error} onClick={async()=>{if(stale||busy||error)return;setBusy(true);try{await acceptCatalogMigration(workspaceStore,preview.id,preview.expectedRevision);await workspaceStore.personalMetadata();window.location.reload();}catch(e){setError(String(e));setBusy(false);setAck(false);}}}>Accept catalog migration</button></section>}
 <h4>Migration history</h4>{history.sort((a,b)=>b.revision-a.revision).map(h=><button key={h.id} disabled={busy} onClick={async()=>{clearReview();const token=generation.current;setBusy(true);try{const p=await previewCatalogRollback(workspaceStore,h.id);const c=await workspaceStore.resolveSnapshot(p.candidateId as CatalogSnapshot['id']);if(!c)throw new Error('Prior snapshot missing');await show(p,c,token);}catch(e){if(token===generation.current)setError(String(e));}finally{if(token===generation.current)setBusy(false);}}}>Preview rollback revision {h.revision}</button>)}{error&&<p role="alert">{error}. No successful change claimed; preview again after concurrent edits.</p>}</section>;
}
