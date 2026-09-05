import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SourceChangePrompt } from './SourceChangePrompt';
afterEach(cleanup);
it('never rewrites claimed work without source consent, and preserves historical tasks',()=>{
 const onSave=vi.fn();const task={id:'t',title:'Mine',status:'doing' as const,revision:1,assignee:'member',requested_quantity:2,delivered_quantity:1,source_requirement_id:'personal:v1:one',snapshot_checksum:'quantity-v1:2'};
 const source={kind:'pin' as const,title:'Craft test',source:'test',requirement:'personal:v1:one',quantity:4,checksum:'semantic-v2:sha256:test'};
 const view=render(<SourceChangePrompt task={task} sources={[source]} editable disabled={false} onSave={onSave}/>);
 expect(onSave).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Apply local source snapshot'})).toBeDisabled();
 fireEvent.click(screen.getByLabelText(/I coordinated with the assignee/));fireEvent.click(screen.getByRole('button',{name:'Apply local source snapshot'}));
 expect(onSave).toHaveBeenCalledWith({p_requested:4,p_checksum:'semantic-v2:sha256:test',p_source:'test',p_source_requirement:'personal:v1:one',p_reconfirm:true});
 view.rerender(<SourceChangePrompt task={{...task,status:'done'}} sources={[source]} editable disabled={false} onSave={onSave}/>);
 expect(screen.queryByRole('button',{name:'Apply local source snapshot'})).toBeNull();
});
