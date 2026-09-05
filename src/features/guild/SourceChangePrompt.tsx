import { useState } from 'react';
import type { Task, TaskInput } from './client';
import { matchingSource, sourceChange, type PublicationSource } from './publication';
export function SourceChangePrompt({task,sources,unavailable=[],editable,disabled,onSave}:{task:Task;sources:PublicationSource[];unavailable?:string[];editable:boolean;disabled:boolean;onSave:(fields:Partial<TaskInput>)=>void}) {
 const state=sourceChange(task,sources,unavailable);
 if(!state) return null;
 if(state==='unavailable') return <p role="status">Local source unavailable: its catalog binding or selected recipe cannot be resolved. Repair or explicitly adopt locally before previewing. Shared history and claimed work are unchanged.</p>;
 if(state==='removed') return <p role="status">Local source removed, completed, or no longer short. Shared history and claimed work are preserved; coordinate before cancelling.</p>;
 const change=matchingSource(task,sources);
 return <section><p role="status">{state==='unverified'?'Legacy source fingerprint — unverified source linkage. Confirm this is your intended personal goal in a fresh preview.':'Local source semantics changed (quantity, recipe, or catalog).'} Claimed work is unchanged until you explicitly reconfirm.</p>{change ? <Consent key={JSON.stringify([task.id,task.revision,change])} task={task} change={change} editable={editable} disabled={disabled} onSave={onSave}/> : <p>No verified local candidate is available. Restore or repair the local source; nothing will be rewritten.</p>}</section>;
}
function Consent({task,change,editable,disabled,onSave}:{task:Task;change:PublicationSource;editable:boolean;disabled:boolean;onSave:(fields:Partial<TaskInput>)=>void}) {
 const [consent,setConsent]=useState(false);
 // Keep the original requirement identity when explicitly adopting a legacy link;
 // backend duplicate identity and claimed-work revision guards remain authoritative.
 const requirement=task.source_requirement_id ?? change.requirement;
 return <fieldset disabled={disabled}><legend>Fresh local source preview</legend><p>Shared quantity {task.requested_quantity} → local {change.quantity}. Recipe/catalog changes can leave quantity equal.</p><p>Source item: {change.source}<br/>Requirement: {requirement}<br/>Checksum: {change.checksum}</p>{editable && !['done','cancelled'].includes(task.status) ? <><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I coordinated with the assignee, verified this local goal linkage, and consent to replace only the source item, requirement, checksum and requested quantity shown above</label><button disabled={!consent || (task.delivered_quantity??0)>change.quantity} onClick={()=>{setConsent(false);onSave({p_requested:change.quantity,p_checksum:change.checksum,p_source:change.source,p_source_requirement:requirement,p_reconfirm:true});}}>Apply local source snapshot</button>{(task.delivered_quantity??0)>change.quantity && <p>Delivered quantity exceeds this source. Review progress manually before reconfirming.</p>}</> : <p>Historical tasks are preserved. Only an owner or assignee can update active work.</p>}</fieldset>;
}
