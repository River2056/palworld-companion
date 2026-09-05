import type { SharedStock, StockInput, Task, TaskInput } from './client';
export type RejectedProposal = {kind:'task'; input:TaskInput} | {kind:'stock'; input:StockInput};
export function reapplyTask(input:TaskInput, latest:Task, reconfirm:boolean):TaskInput {
 if(input.p_task!==latest.id || input.p_action==='create') throw new Error('Cannot reapply a create or missing task.');
 if(input.p_checksum!==null && input.p_checksum!==latest.snapshot_checksum && !reconfirm) throw new Error('Explicitly reconfirm the changed source checksum.');
 return {...input,p_revision:latest.revision,p_key:crypto.randomUUID(),p_reconfirm:reconfirm};
}
export function reapplyStock(input:StockInput,latest?:SharedStock):StockInput {
 return {...input,p_revision:latest?.revision??0,p_key:crypto.randomUUID()};
}
export function proposedTask(input:TaskInput,latest:Task,actor:string):Task {
 // Claim ignores edit fields: the server assigns auth.uid() and starts work.
 // Revision and server timestamps remain comparison context, not a saved result.
 if(input.p_action==='claim') return {...latest,assignee:actor,status:'doing'};
 return {...latest,title:input.p_title??latest.title,status:input.p_status??latest.status,source_id:input.p_source??latest.source_id,snapshot_checksum:input.p_checksum??latest.snapshot_checksum,task_type:input.p_type??latest.task_type,description:input.p_description??latest.description,requested_quantity:input.p_requested??latest.requested_quantity,delivered_quantity:input.p_delivered??latest.delivered_quantity,source_requirement_id:input.p_source_requirement??latest.source_requirement_id};
}
