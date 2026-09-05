import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { resolveRecipe } from '../domain/catalog-snapshot';
import type { Workspace } from '../data/workspace';
import { Shopping } from './Shopping';
import { IngredientTree } from './IngredientTree';
import { useCatalogRuntime, planRuntimeWorkspace, snapshotItemName } from './catalog-runtime';
export interface WorkspaceProps { data: Workspace; update: (data: Workspace)=>Promise<boolean> }
export function Craft({data,update}:WorkspaceProps) {
 const {runtime,error:loadError}=useCatalogRuntime();
 const [query,setQuery]=useState(''),[item,setItem]=useState(''),[recipeId,setRecipeId]=useState(''),[quantity,setQuantity]=useState('1');
 const [overrides,setOverrides]=useState<Record<string,string>>({}),[duplicate,setDuplicate]=useState(false),[error,setError]=useState('');
 const snapshot=runtime?.selected;
 const index=useMemo(()=>new Fuse(snapshot?.craft.items.filter(i=>i.kind==='craftable').map(i=>({...i,aliases:[...(i.aliases??[]),i.id.replaceAll('-',' '),i.name+'s']}))??[],{keys:['name','id','aliases'],threshold:0.35,ignoreLocation:true}),[snapshot]);
 if(!runtime)return <p role="status">{loadError||'Loading selected catalog…'}</p>;
 if(!snapshot)return <p role="alert">Selected snapshot missing: {runtime.metadata.selectedCatalog}. Import the exact reference or choose a candidate explicitly in Settings; no bundled fallback is used.</p>;
 const name=(id:string)=>snapshotItemName(snapshot,id);
 const matches=query.trim()?index.search(query.trim()).map(r=>r.item):[...snapshot.craft.items.filter(i=>i.kind==='craftable')].sort((a,b)=>{const rank=(id:string)=>data.recent.includes(id)?data.recent.indexOf(id):data.recent.length;return rank(a.id)-rank(b.id);});
 const count=Number(quantity);
 const goal={id:'preview',item,quantity:count,completed:0,notes:'',catalogBinding:{state:'bound' as const,snapshotId:snapshot.id},recipeId,recipeOverrides:overrides};
 const preview=item?planRuntimeWorkspace(runtime,{...data,goals:[goal],stock:{}}):undefined;
 const selected=resolveRecipe(snapshot.craft,item,{recipeId,recipeOverrides:overrides});
 const alternatives=snapshot.craft.recipes.filter(r=>r.outputItemId===item);
 const compatible=data.goals.filter(g=>g.item===item&&g.catalogBinding?.state==='bound'&&g.catalogBinding.snapshotId===snapshot.id&&g.recipeId===recipeId&&JSON.stringify(Object.entries(g.recipeOverrides??{}).sort())===JSON.stringify(Object.entries(overrides).sort()));
 async function pin(existing?:Workspace['goals'][number]) {
  if(!preview?.complete)return;
  const goals=existing?data.goals.map(g=>g.id===existing.id?{...g,quantity:g.quantity+count}:g):[...data.goals,{...goal,id:crypto.randomUUID()}];
  if(goals.some(g=>!Number.isSafeInteger(g.quantity))){setError('Unsafe goal quantity');return;}
  if(await update({...data,goals,recent:[item,...data.recent.filter(i=>i!==item)].slice(0,10)})){setDuplicate(false);setError('');}
 }
 return <div className="stack"><section className="card"><h2>Find your next craft</h2><p>Selected reference: {snapshot.manifest.datasetId} · {snapshot.id} · {snapshot.manifest.verificationStatus}</p><label>Search recipes<input value={query} onChange={e=>{setQuery(e.target.value);setItem('');setDuplicate(false);}} onKeyDown={e=>{if(e.key==='Escape')setItem('');if(e.key==='ArrowDown'){e.preventDefault();document.querySelector<HTMLButtonElement>('.search-results button')?.focus();}}}/></label><p>Typo, partial name or alias. Arrow down to results; Enter to select.</p>{!item&&<div className="search-results">{matches.map(i=><button key={i.id} aria-label={`Select ${i.name}`} onClick={()=>{setItem(i.id);setRecipeId(snapshot.craft.defaultRecipeByItem[i.id]??'');setOverrides({});}}>{i.name}</button>)}{!matches.length&&<p>No recipes found.</p>}</div>}
 {item&&<div className="recipe"><h3>{name(item)}</h3>{alternatives.length>1?<label>Root recipe<select aria-label="Root recipe" value={recipeId} onChange={e=>setRecipeId(e.target.value)}>{alternatives.map(r=><option key={r.id} value={r.id}>{r.variant??r.id} · yield {r.output_count}</option>)}</select></label>:<p>One reference recipe available; alternate recipes are not included.</p>}
 {selected.status==='resolved'&&<><p>Recipe: {selected.recipe.id} · {selected.recipe.variant} · Stations: {selected.recipe.stations.join(', ')||'Unknown'} · Unlock: {selected.recipe.unlock_level??'Unknown'}</p><p>Output per run: {selected.recipe.output_count} finished units.</p><a href={selected.recipe.source.revision_url??selected.recipe.source.url}>Recipe source · {selected.recipe.source.attribution}</a><p>{selected.recipe.source.license}</p></>}
 <label>Desired finished units<input type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
 {preview?.goals.map(g=><p key={g.id}>{g.batches} batches · {g.output} output · {g.surplus} surplus</p>)}{preview?.diagnostics.map((d,i)=><p role="alert" key={i}>{d.code}: {d.path.join(' → ')}</p>)}<h4>Direct ingredients</h4><ul>{preview?.direct.map(r=><li key={r.item}>{name(r.item)} × {r.required}</li>)}</ul>
 <IngredientTree snapshot={snapshot} item={item} quantity={count} recipeId={recipeId} recipeOverrides={overrides} onRecipeOverride={(id,r)=>setOverrides({...overrides,[id]:r})}/>
 <button disabled={!preview?.complete} onClick={()=>compatible.length?setDuplicate(true):void pin()}>Pin craft goal</button>{duplicate&&<section aria-label="Duplicate pin choice"><p>Same snapshot and recipe choices already pinned.</p>{compatible.map(g=><button key={g.id} disabled={!Number.isSafeInteger(g.quantity+count)} onClick={()=>void pin(g)}>Increase existing goal · {g.completed}/{g.quantity} · {g.notes||g.id}</button>)}<button onClick={()=>void pin()}>Create separate pin</button><button onClick={()=>setDuplicate(false)}>Cancel pin</button></section>}{error&&<p role="alert">{error}</p>}</div>}</section><Shopping data={data}/></div>;
}
