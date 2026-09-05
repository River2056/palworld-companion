import { expect, it } from 'vitest';
import { proposedTask, reapplyTask, reapplyStock } from './conflicts';
import type { Task, TaskInput } from './client';
it('rebases a confirmed rejection onto latest revision with new key and explicit checksum consent', () => {
 const proposed: TaskInput={p_guild:'g',p_action:'update',p_task:'t',p_revision:1,p_title:'Mine',p_status:'doing',p_source:'wood',p_checksum:'old',p_key:'original'};
 const latest={id:'t',revision:3,title:'Theirs',status:'doing' as const,assignee:'me',snapshot_checksum:'new'};
 expect(()=>reapplyTask(proposed,latest,false)).toThrow('reconfirm');
 const result=reapplyTask(proposed,latest,true);
 expect(result).toMatchObject({p_revision:3,p_title:'Mine',p_checksum:'old',p_reconfirm:true});
 expect(result.p_key).not.toBe('original');
 expect(proposed.p_revision).toBe(1);
 const stock=reapplyStock({p_guild:'g',p_item:'wood',p_quantity:5,p_revision:0,p_key:'original'},{item_id:'wood',quantity:9,revision:2});
 expect(stock).toMatchObject({p_quantity:5,p_revision:2}); expect(stock.p_key).not.toBe('original');
});

const latest: Task = Object.freeze({id:'t',title:'Server title',status:'blocked',assignee:null,revision:3,source_id:'wood',snapshot_checksum:'current',task_type:'gather',description:'Server description',requested_quantity:8,delivered_quantity:2,source_requirement_id:'goal:wood'});
const claim: TaskInput = Object.freeze({p_guild:'g',p_action:'claim',p_task:'t',p_revision:1,p_title:'Ignored title',p_status:'cancelled',p_source:'ignored',p_checksum:'ignored',p_key:'original',p_type:'ignored',p_description:'ignored',p_requested:99,p_delivered:9,p_source_requirement:'ignored'});

it('projects the authenticated claimant and doing status, ignoring every claim edit field without mutation', () => {
 const result=proposedTask(claim,latest,'authenticated-user');
 expect(result).toEqual({...latest,assignee:'authenticated-user',status:'doing'});
 expect(result).not.toBe(latest);
 expect(latest).toMatchObject({assignee:null,status:'blocked',revision:3});
 expect(claim).toMatchObject({p_action:'claim',p_status:'cancelled',p_key:'original'});
 expect(proposedTask(claim,{...latest,assignee:'someone-else'},'authenticated-user').assignee).toBe('authenticated-user');
});

it.each(['open','doing','blocked','done','cancelled'] as const)('projects update status %s without claiming or releasing the existing assignee', status => {
 const current=Object.freeze({...latest,assignee:'existing-assignee'});
 const input=Object.freeze({...claim,p_action:'update' as const,p_status:status,p_title:'Edited',p_description:'',p_requested:0,p_delivered:0});
 expect(proposedTask(input,current,'owner')).toEqual({...current,title:'Edited',status,source_id:'ignored',snapshot_checksum:'ignored',task_type:'ignored',description:'',requested_quantity:0,delivered_quantity:0,source_requirement_id:'ignored'});
 expect(current).toEqual({...latest,assignee:'existing-assignee'});
 expect(input.p_revision).toBe(1);
});

it('preserves latest fields for null or omitted update values', () => {
 const input:TaskInput=Object.freeze({p_guild:'g',p_action:'update',p_task:'t',p_revision:1,p_title:null,p_status:null,p_source:null,p_checksum:null,p_key:'original'});
 expect(proposedTask(input,latest,'owner')).toEqual(latest);
});
