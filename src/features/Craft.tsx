import { useState } from 'react';
import Fuse from 'fuse.js';
import { catalog, itemName, type Recipe } from '../domain/catalog';
import { plan } from '../domain/planner';
import type { Workspace } from '../data/workspace';
import { Shopping } from './Shopping';
export interface WorkspaceProps { data: Workspace; update: (data: Workspace)=>Promise<boolean> }
// Convenience search aliases, not additional game facts.
const index=new Fuse(catalog.recipes.map(r=>({...r,aliases:[...(r.aliases??[]),r.id.replaceAll('-',' '),r.name+'s',...(r.id==='pal-sphere'?['sphere']:[])]})),{keys:['name','id','aliases'],threshold:0.35,ignoreLocation:true});
export function Craft({data,update}:WorkspaceProps) {
 const [query,setQuery]=useState(''); const [selected,setSelected]=useState<Recipe>(); const [quantity,setQuantity]=useState('1'); const [dismissed,setDismissed]=useState(false);
 const matches=query.trim()?index.search(query.trim().replace(/\s+/g,' ')).map(r=>r.item):[...catalog.recipes].sort((a,b)=>(data.recent.includes(a.id)?data.recent.indexOf(a.id):Infinity)-(data.recent.includes(b.id)?data.recent.indexOf(b.id):Infinity));
 const count=Number(quantity); let preview: ReturnType<typeof plan>|undefined; let error='';
 if(selected) { try { preview=plan(catalog,[{id:'preview',item:selected.id,quantity:count,completed:0,notes:''}],{}); } catch { error='Enter a positive safe whole number; calculated amounts must also be safe.'; } }
 return <div className="stack"><section className="card"><h2>Find your next craft</h2><label>Search recipes<input value={query} onChange={e=>{setQuery(e.target.value);setSelected(undefined);setDismissed(false);}} onKeyDown={e=>{if(e.key==='Escape'){setDismissed(true);setSelected(undefined);} if(e.key==='ArrowDown'){e.preventDefault();document.querySelector<HTMLButtonElement>('.search-results button')?.focus();}}} aria-describedby="search-help" /></label><p id="search-help">Typo, partial name or alias. Arrow down to results, Tab to move, Enter to select, Escape to dismiss. Empty search shows recent selections first.</p>
 {!dismissed && <div className="search-results" onKeyDown={e=>{if(e.key==='Escape'){setDismissed(true);setSelected(undefined);}}}>{matches.map(r=><button key={r.id} aria-label={`Select ${r.name}`} onClick={()=>{setSelected(r);setDismissed(true);}}>{r.name}</button>)}{!matches.length&&<p>No recipes found. Try another name.</p>}</div>}
 {selected&&<div className="recipe"><h3>{selected.name}{selected.variant?` (${selected.variant})`:''}</h3><p>Stations: {selected.stations.join(', ')||'Unknown'} (selected supported stations, not exhaustive). Unlock: {selected.unlock_level??'Unknown'}.</p><p>Output per run: {selected.output_count} finished units.</p><p>One reference recipe available; alternate recipes are not included.</p><p><a href={selected.source.revision_url??selected.source.url} target="_blank" rel="noreferrer">Recipe source · {selected.source.attribution}</a> · {selected.source.license}</p>{selected.notes&&<p>{selected.notes}</p>}<label>Desired finished units<input type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>{error?<p role="alert">{error}</p>:preview&&<><p>{preview.goals[0].batches} batches · {preview.goals[0].output} output · {preview.goals[0].surplus} surplus</p><h4>Direct ingredients</h4><ul>{preview.direct.map(r=><li key={r.item}>{itemName(r.item)} × {r.required}</li>)}</ul></>}<button disabled={!preview} onClick={async()=>{await update({...data,goals:[...data.goals,{id:crypto.randomUUID(),item:selected.id,quantity:count,completed:0,notes:''}],recent:[selected.id,...data.recent.filter(id=>id!==selected.id)].slice(0,10)});}}>Pin craft goal</button></div>}
 </section><Shopping data={data}/></div>;
}
