import { expect, it } from 'vitest';
import { reapplyTask, reapplyStock } from './conflicts';
import type { TaskInput } from './client';
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
