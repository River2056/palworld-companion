import type { TodayGuildSummary } from './guild/GuildWorkspace';
import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import type { WorkspaceProps } from './Craft';
import { Queue } from './Queue';
import { Shopping } from './Shopping';
import { catalog } from '../domain/catalog';
import { plan } from '../domain/planner';
import { palStore, type PalSnapshot } from './pals/storage';
import { analyzeBase, catalog as palCatalog, routeWarnings, speciesName, validateBase, validateRoute, type Base, type SavedRoute } from './pals/domain';

function speciesLabel(id:string) {
 return palCatalog.species.some(s=>s.id===id)?speciesName(id):`Unknown species ID: ${id}`;
}

function BreedingAction({route,personal}:{route:SavedRoute;personal:PalSnapshot}) {
 let content;
 try {
  validateRoute(route);
  const next=route.steps.find(step=>!route.completed.includes(step.id));
  const warnings=routeWarnings(route,personal.pals);
  const references=route.steps.flatMap(step=>[
   ...(!palCatalog.species.some(s=>s.id===step.childId)?[`Unknown child species ID: ${step.childId}`]:[]),
   ...(!palCatalog.breedingPairs.some(pair=>pair.id===step.pairId)?[`Unknown breeding pair ID: ${step.pairId}`]:[]),
   ...step.parents.flatMap(ref=>{
    if(!ref.startsWith('owned:')) return [];
    const parent=personal.pals.find(p=>p.id===ref.slice(6));
    if(!parent) return [`Missing parent ID: ${ref}`];
    if(parent.archived) return [`Archived parent: ${parent.nickname||speciesLabel(parent.speciesId)} (${ref})`];
    return !palCatalog.species.some(s=>s.id===parent.speciesId)?[`${ref}: ${speciesLabel(parent.speciesId)}`]:[];
   }),
  ]);
  content=<>
   {next?<p>Next incomplete step {route.steps.indexOf(next)+1}: breed {speciesLabel(next.childId)} for target {speciesLabel(route.targetId)}.</p>:<p>{warnings.length||references.length?'Checklist marked complete, but saved references need review.':'All saved steps marked complete manually; offspring and gender are not verified.'}</p>}
   {!!(warnings.length||references.length)&&<ul aria-label="Saved route warnings">{[...new Set([...references,...warnings])].map(warning=><li key={warning}>{warning}</li>)}</ul>}
  </>;
 } catch {
  content=<><p role="alert">Saved route {route.id} has missing steps or an invalid checklist/graph. Progress is unknown; review or replace it in Breeding.</p><details><summary>Inspect saved step and checklist references</summary><pre>{JSON.stringify({steps:route.steps,completed:route.completed},null,2)}</pre></details></>;
 }
 return <article className="card stack"><h3>Breeding target: {speciesLabel(route.targetId)}</h3><p>Saved route: {route.id}</p>{content}<a href="#/breeding">Review saved route for {speciesLabel(route.targetId)}</a></article>;
}

function BaseAction({base,personal}:{base:Base;personal:PalSnapshot}) {
 let content;
 try {
  const analysis=analyzeBase(base,personal.pals,personal.bases);
  const warnings:string[]=[];
  try {validateBase(base,personal.bases,personal.pals);} catch(e) {warnings.push(`Assignment state needs review: ${e instanceof Error?e.message:String(e)}`);}
  for(const id of base.workerIds) {
   const worker=personal.pals.find(p=>p.id===id);
   if(!worker) warnings.push(`Missing worker ID: ${id}`);
   else if(worker.archived) warnings.push(`Archived worker: ${worker.nickname||speciesLabel(worker.speciesId)} (${id})`);
   else if(!palCatalog.species.some(s=>s.id===worker.speciesId)) warnings.push(`Worker ${id}: ${speciesLabel(worker.speciesId)}`);
  }
  content=<>
   {warnings.length>0&&<ul aria-label="Base assignment warnings">{warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>}
   {analysis.gaps.length>0?<ul aria-label={`Uncovered slots at ${base.name}`}>{analysis.gaps.map(slot=><li key={slot.id}>{base.name}: {slot.work} · minimum level {slot.minimum} · priority {slot.priority} · slot {slot.id} is uncovered. Assign a compatible active worker in Bases.</li>)}</ul>:<p>{warnings.length?'Coverage is not confirmed until assignment warnings are resolved.':base.slots.length?'All configured work slots covered by the saved assignments.':'No work slots configured; coverage has not been assessed.'}</p>}
   <p>{base.workerIds.length} / {base.capacity} worker capacity · Reference suitability only, not a production-rate estimate.</p>
  </>;
 } catch {
  content=<p role="alert">Saved base {base.id} has invalid assignment or slot data. Coverage is unknown; review it in Bases.</p>;
 }
 return <article className="card stack"><h3>Base: {base.name||base.id}</h3>{content}<a href="#/bases">Review assignments for {base.name||base.id}</a></article>;
}

export function Today(props:WorkspaceProps & { guildSummary?: TodayGuildSummary | null; guildAuthenticated?: boolean; onGuildLogout?: () => void }) {
 const [personal,setPersonal]=useState<PalSnapshot>();
 const [error,setError]=useState('');
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;
  const subscription=liveQuery(()=>palStore.snapshot()).subscribe({
   next:value=>{if(active){setPersonal(value);setError('');}},
   error:(e:unknown)=>{if(active){setPersonal(undefined);setError(`Pal/base storage unavailable: ${e instanceof Error?e.message:String(e)}. Personal progress and coverage are unknown.`);}},
  });
  return()=>{active=false;subscription.unsubscribe();};
 },[attempt]);
 let summary='Plan blocked: edit unsafe quantities before calculating.';
 try {const p=plan(catalog,props.data.goals,props.data.stock);summary=`${props.data.goals.filter(g=>g.completed<g.quantity).length} active goals · ${props.data.goals.filter(g=>g.completed===g.quantity).length} completed · ${p.blocked.length} blocked · ${p.direct.filter(r=>r.missing>0).length} direct ingredient types missing`; }catch{/* Shopping shows recovery guidance. */}
 return <div className="stack"><section className="hero"><p className="eyebrow">Your next session</p><h2>A little planning. More exploring.</h2><p>{summary}</p><p>No game connection. All progress and inventory are manually entered in this browser.</p><a className="outline-label" href="#/craft">Find a recipe</a></section>
 <section className="card stack" aria-label="Personal Pal and base summary"><h2>Pals & bases</h2>{error&&<><p role="alert">{error}</p><button onClick={()=>{setError('');setAttempt(value=>value+1);}}>Retry personal summary</button></>}{!personal&&!error&&<p role="status">Loading local Pals and bases…</p>}{personal&&<>
 <p>{personal.pals.filter(p=>!p.archived).length} active Pals · {personal.pals.filter(p=>p.archived).length} archived · {personal.routes.length} saved breeding routes</p>
 <h3>Saved breeding actions</h3><p>Checklists only. Opening Breeding does not create a route or breed a Pal. Confirm parent availability and compatible gender before acting.</p>
 {personal.routes.length?personal.routes.map(route=><BreedingAction key={route.id} route={route} personal={personal}/>):<p>No saved breeding routes. Choose and save a route in Breeding to track its next step.</p>}
 <h3>Base work warnings</h3>{personal.bases.length?personal.bases.map(base=><BaseAction key={base.id} base={base} personal={personal}/>):<p>No bases saved. Add a named base and work slots to assess coverage.</p>}
 </>}<a href="#/breeding">Manage Pals and breeding routes</a><a href="#/bases">Review base assignments</a><p>Settings provides separate crafting and Pal/base backups. Neither includes guild data.</p></section>
 <section className="card stack" aria-label="Optional guild planning"><h2>Optional guild planning</h2><p>Today never signs in or refreshes Guild automatically. Open Guild, approve trusted endpoints and sign in explicitly. Personal plans are never published automatically.</p>{props.guildSummary?<><h3>{props.guildSummary.guildName}</h3><p>Guild: {props.guildSummary.guildId} · User: {props.guildSummary.userId}</p><p>{props.guildSummary.tasks.length} assigned active tasks · {props.guildSummary.unread} unread events since last seen</p><ul>{props.guildSummary.tasks.map(task=><li key={task.id}>{task.title} · {task.status}</li>)}</ul><p>Last explicitly loaded snapshot, not live. Access changes are checked only when you refresh in Guild. Offline or failed authorization clears this summary.</p></>:<p>No authenticated guild summary loaded. Choose a guild after signing in to see your assigned active tasks and unread activity.</p>}{props.guildAuthenticated&&<><p>Session retained in memory while navigating. Sign out or reload to clear it; no private guild data is saved.</p><button type="button" onClick={props.onGuildLogout}>Sign out of Guild</button></>}<a href="#/guild">Open guild workspace</a><a href="#/guild">Refresh deliberately in Guild</a></section>
 <Queue {...props}/><Shopping data={props.data}/></div>;
}
