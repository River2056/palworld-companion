import { useState } from 'react';
import type { Task, TaskInput } from './client';
import { sourceChange, type PublicationSource } from './publication';
export function SourceChangePrompt({task,sources,editable,disabled,onSave}:{task:Task;sources:PublicationSource[];editable:boolean;disabled:boolean;onSave:(fields:Partial<TaskInput>)=>void}) {
 const [consent,setConsent]=useState(false);
 const state=sourceChange(task,sources);
 if(!state) return null;
 if(state==='removed') return <p role="status">Local source removed, completed, or no longer short. Shared history and claimed work are preserved; coordinate before cancelling.</p>;
 const change=sources.find(s=>s.requirement===task.source_requirement_id)!;
 return <fieldset disabled={disabled}><legend>Local source quantity changed</legend><p>Local source quantity changed: shared {task.requested_quantity} → local {change.quantity}. Claimed work is unchanged until you explicitly reconfirm.</p><p>Source item: {change.source}<br/>Requirement: {change.requirement}<br/>Checksum: {change.checksum}</p>{editable && !['done','cancelled'].includes(task.status) ? <><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I coordinated with the assignee and consent to replace only the source item, requirement, checksum and requested quantity shown above</label><button disabled={!consent || (task.delivered_quantity??0)>change.quantity} onClick={()=>{setConsent(false);onSave({p_requested:change.quantity,p_checksum:change.checksum,p_source:change.source,p_source_requirement:change.requirement,p_reconfirm:true});}}>Apply local source snapshot</button>{(task.delivered_quantity??0)>change.quantity && <p>Delivered quantity exceeds this source. Review progress manually before reconfirming.</p>}</> : <p>Historical tasks are preserved. Only an owner or assignee can update active work.</p>}</fieldset>;
}
