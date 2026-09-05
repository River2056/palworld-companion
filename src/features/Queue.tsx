import { useState } from 'react';
import { useCatalogRuntime, planRuntimeWorkspace, goalItemName, snapshotItemName, bindingLabel } from './catalog-runtime';
import type { Goal } from '../domain/planner';
import type { WorkspaceProps } from './Craft';
function GoalEditor({goal,onSave}:{goal:Goal;onSave:(g:Goal)=>void}) { const [error,setError]=useState(''); return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const quantity=Number(f.get('quantity')),completed=Number(f.get('completed'));if(!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(completed)||completed<0||completed>quantity){setError('Use whole numbers; progress must be between zero and quantity.');return;}setError('');onSave({...goal,quantity,completed,notes:String(f.get('notes'))});}}><label>Goal quantity<input name="quantity" type="number" min="1" defaultValue={goal.quantity}/></label><label>Completed units<input name="completed" type="number" min="0" defaultValue={goal.completed}/></label><label>Notes<textarea name="notes" defaultValue={goal.notes}/></label>{error&&<p role="alert">{error}</p>}<button>Save goal</button></form>; }
export function Queue({data,update}:WorkspaceProps) {
 const {runtime,error}=useCatalogRuntime();
 if(!runtime)return <p role="status">{error||'Loading bound references…'}</p>;
 const result=planRuntimeWorkspace(runtime,data);
 const resolved=(g:Goal)=>result.goalResults.some(r=>r.id===g.id&&r.status==='resolved');
 const active=data.goals.filter(g=>g.completed<g.quantity);
 const history=data.goals.filter(g=>g.completed===g.quantity);
 const change=(goal:Goal)=>void update({...data,goals:data.goals.map(g=>g.id===goal.id?goal:g)});
 const move=(index:number,delta:number)=>{
  // Swap active slots only; completed records keep their position for reopening.
  const goals=[...data.goals];
  const from=goals.findIndex(g=>g.id===active[index].id);
  const to=goals.findIndex(g=>g.id===active[index+delta].id);
  [goals[from],goals[to]]=[goals[to],goals[from]];
  void update({...data,goals});
 };
 return <section className="card"><h2>Pinned craft queue</h2>
  <p>Craft-more goals: existing target stock does not cancel your goal. Completion is progress-only; inventory stays manual.</p>
  <section aria-label="Active craft goals"><h3>Active goals</h3>
   {!active.length&&<p>{history.length?'No active plans.':'No plans yet.'} Search and pin a recipe to begin, or reopen a completed goal.</p>}
   <ol className="goal-list">{active.map((g,i)=><li key={g.id}>
    <h4>{goalItemName(runtime,g)} · {g.completed} / {g.quantity}</h4>
    {!resolved(g)&&<p>Unresolved goal retained. Review diagnostics in Craft; legacy adoption is in Settings.</p>}
    <p>Bound reference: {bindingLabel(g)} · Recipe: {g.recipeId??'unknown'}</p>{g.notes&&<p>{g.notes}</p>}
    <div className="actions">
     <button disabled={i===0} aria-label={`Move ${goalItemName(runtime,g)} up`} onClick={()=>move(i,-1)}>↑ Priority</button>
     <button disabled={i===active.length-1} aria-label={`Move ${goalItemName(runtime,g)} down`} onClick={()=>move(i,1)}>↓ Priority</button>
     <button disabled={!resolved(g)} aria-label={`Complete ${goalItemName(runtime,g)}`} onClick={()=>change({...g,completed:g.quantity})}>Complete (progress only)</button>
     <button onClick={()=>void update({...data,goals:data.goals.filter(v=>v.id!==g.id)})}>Remove {goalItemName(runtime,g)}</button>
    </div>
    <details><summary>Edit {goalItemName(runtime,g)} / partial progress</summary><GoalEditor key={`${g.quantity}:${g.completed}:${g.notes}`} goal={g} onSave={change}/></details>
   </li>)}</ol>
  </section>
  <section aria-label="Completed goal history"><h3>Completed goal history</h3>
   <p>Completed goals are retained, but excluded from planning. Reopen resets completed units to zero and restores the full goal at its retained queue position. Quantity, ID, notes, inventory and inventory timestamps stay unchanged.</p>
   {!history.length&&<p>No completed goals yet.</p>}
   <ol className="goal-list">{history.map(g=><li key={g.id}>
    <h4>{goalItemName(runtime,g)} · {g.completed} / {g.quantity}</h4>
    <p>Historical progress retained. Reopening reevaluates the exact saved reference; unresolved bindings remain blocked.</p>
    <p>Bound reference: {bindingLabel(g)} · Recipe: {g.recipeId??'unknown'}</p>{g.notes&&<p>{g.notes}</p>}
    <button onClick={()=>change({...g,completed:0})}>Reopen {goalItemName(runtime,g)} (progress only)</button>
    <button onClick={()=>void update({...data,goals:data.goals.filter(v=>v.id!==g.id)})}>Remove {goalItemName(runtime,g)}</button>
   </li>)}</ol>
  </section>
 </section>;
}
export function Inventory({data,update}:WorkspaceProps) {
 const [error,setError]=useState('');
 const {runtime,error:loadError}=useCatalogRuntime();
 if(!runtime)return <p>{loadError||'Loading inventory reference…'}</p>;
 const itemName=(id:string)=>snapshotItemName(runtime.selected,id);
 const ids=[...new Set([...(runtime.selected?.craft.items.map(m=>m.id)??[]),...Object.keys(data.stock)])];
 return <section className="card"><h2>Manual inventory</h2>
  <p>Enter physical stock only, not planned output. Saved locally; completion never changes these counts.</p>
  <p className="warning">Stale manual counts can misstate shortages. There is no live game sync; last updated records your manual save, not verification in the game. Check counts before crafting.</p>
  {error&&<p role="alert">{error}</p>}
  <div className="inventory-grid">{ids.map(id=>{
   const timestamp=Object.hasOwn(data.stockUpdatedAt??{},id)?data.stockUpdatedAt?.[id]:undefined;
   return <form key={`${id}:${data.stock[id]??0}`} onSubmit={e=>{
    e.preventDefault();
    const n=Number(new FormData(e.currentTarget).get('stock'));
    if(!Number.isSafeInteger(n)||n<0){setError('Stock must be a nonnegative safe whole number.');return;}
    setError('');
    void update({...data,stock:{...data.stock,[id]:n},stockUpdatedAt:{...data.stockUpdatedAt,[id]:new Date().toISOString()}});
   }}>
    <label>{itemName(id)} stock<input aria-label={`${itemName(id)} stock`} name="stock" type="number" min="0" step="1" defaultValue={data.stock[id]??0}/></label>
    <p>Last updated: {timestamp?<time dateTime={timestamp}>{timestamp}</time>:'Unknown — no recorded manual save'}</p>
    <button aria-label={`Save ${itemName(id)} stock`}>Save</button>
   </form>;
  })}</div>
 </section>;
}
