import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import type { WorkspaceProps } from './Craft';
import { Queue } from './Queue';
import { Shopping } from './Shopping';
import { catalog } from '../domain/catalog';
import { plan } from '../domain/planner';
import { palStore, type PalSnapshot } from './pals/storage';
import { analyzeBase } from './pals/domain';
export function Today(props:WorkspaceProps) {
 const [personal,setPersonal]=useState<PalSnapshot>();
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const fail=(e:unknown)=>{if(active)setError(`Pal/base storage unavailable: ${e instanceof Error?e.message:String(e)}. Open the workspace to retry.`);};
  void palStore.snapshot().then(value=>{if(active)setPersonal(value);}).catch(fail);
  const subscription=liveQuery(()=>palStore.snapshot()).subscribe({next:value=>{if(active)setPersonal(value);},error:fail});
  return()=>{active=false;subscription.unsubscribe();};
 },[]);
 let summary='Plan blocked: edit unsafe quantities before calculating.';
 try {const p=plan(catalog,props.data.goals,props.data.stock);summary=`${props.data.goals.filter(g=>g.completed<g.quantity).length} active goals · ${props.data.goals.filter(g=>g.completed===g.quantity).length} completed · ${p.blocked.length} blocked · ${p.direct.filter(r=>r.missing>0).length} direct ingredient types missing`; }catch{/* Shopping shows recovery guidance. */}
 return <div className="stack"><section className="hero"><p className="eyebrow">Your next session</p><h2>A little planning. More exploring.</h2><p>{summary}</p><p>No game connection. All progress and inventory are manually entered in this browser.</p><a className="outline-label" href="#/craft">Find a recipe</a></section>
 <section className="card stack" aria-label="Personal Pal and base summary"><h2>Pals & bases</h2>{error&&<p role="alert">{error}</p>}{!personal&&!error&&<p role="status">Loading local Pals and bases…</p>}{personal&&<><p>{personal.pals.filter(p=>!p.archived).length} active Pals · {personal.pals.filter(p=>p.archived).length} archived · {personal.routes.length} saved breeding routes</p><p>{personal.bases.length} bases · {personal.bases.reduce((count,base)=>count+base.workerIds.length,0)} assigned workers · {personal.bases.reduce((count,base)=>count+analyzeBase(base,personal.pals,personal.bases).shortage,0)} uncovered work slots</p></>}<a href="#/breeding">Manage Pals and breeding routes</a><a href="#/bases">Review base assignments</a><p>Settings provides separate crafting and Pal/base backups. Neither includes guild data.</p></section>
 <section className="card stack"><h2>Optional guild planning</h2><p>Guild data is not loaded on Today. Open Guild and sign in explicitly to read shared tasks; personal plans are never published automatically. Leaving Guild clears its in-memory session.</p><a href="#/guild">Open guild workspace</a></section>
 <Queue {...props}/><Shopping data={props.data}/></div>;
}
