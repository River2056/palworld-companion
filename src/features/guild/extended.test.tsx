import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskDetails } from './TaskDetails';
import { ApiError, GuildClient, localEndpoints, StockRetry } from './client';
afterEach(cleanup);
it('requires explicit checksum reconfirmation and preserves stable requirement identity', () => {
 const save = vi.fn();
 render(<TaskDetails task={{id:'t',title:'Wood',status:'blocked',assignee:null,revision:3,source_requirement_id:'plan:wood',snapshot_checksum:'old',requested_quantity:10,delivered_quantity:2}} disabled={false} onSave={save}/>);
 expect(screen.getByLabelText('Source requirement identity')).toHaveAttribute('readonly');
 fireEvent.change(screen.getByLabelText('Source checksum'),{target:{value:'new'}});
 expect(screen.getByRole('button',{name:'Save task'})).toBeDisabled();
 fireEvent.click(screen.getByLabelText('I reconfirm the changed source plan and quantities'));
 fireEvent.click(screen.getByRole('button',{name:'Save task'}));
 expect(save).toHaveBeenCalledWith(expect.objectContaining({p_source_requirement:'plan:wood',p_checksum:'new',p_reconfirm:true,p_status:'blocked',p_requested:10,p_delivered:2}));
});
it('rejects unsafe quantities and delivered greater than requested', () => {
 render(<TaskDetails disabled={false} onSave={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Detailed task title'),{target:{value:'Wood'}});
 fireEvent.change(screen.getByLabelText('Delivered quantity'),{target:{value:'1'}});
 expect(screen.getByRole('button',{name:'Create detailed task'})).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Requested quantity'),{target:{value:'9007199254740992'}});
 expect(screen.getByRole('button',{name:'Create detailed task'})).toBeDisabled();
});
it('keeps exact immutable stock payload on uncertainty, clears on definitive conflict', async () => {
 const c = new GuildClient(localEndpoints); const rpc = vi.spyOn(c,'rpc').mockRejectedValueOnce(new ApiError('offline')).mockRejectedValueOnce(new ApiError('conflict',409));
 const retry = new StockRetry(); const value = {p_guild:'g',p_item:'wood',p_quantity:4,p_revision:2,p_key:'key'};
 await expect(retry.send(c,value)).rejects.toThrow('offline'); value.p_quantity=9;
 expect(retry.pending?.p_quantity).toBe(4);
 await expect(retry.send(c,value)).rejects.toThrow('Resolve pending');
 await expect(retry.send(c)).rejects.toThrow('conflict');
 expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]); expect(retry.pending).toBeNull();
});
it('binds native default fetch to global receiver', async () => {
 const original=globalThis.fetch;
 globalThis.fetch = function(this: unknown) { expect(this).toBe(globalThis); return Promise.resolve(new Response('[]')); } as typeof fetch;
 try { await new GuildClient(localEndpoints).guilds(); } finally { globalThis.fetch=original; }
});
