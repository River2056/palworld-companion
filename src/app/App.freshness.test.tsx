import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import App from './App';
import {workspaceStore,WorkspaceStore} from '../data/workspace';

let peer:WorkspaceStore;
beforeEach(async()=>{
 window.location.hash='#/craft';
 await workspaceStore.reset();
 peer=new WorkspaceStore(workspaceStore.name,false);
 await peer.ready();
});
afterEach(()=>{cleanup();peer.close();vi.restoreAllMocks();});
test('two connections: dirty stale save reaches CAS, writes nothing and preserves inputs/error until explicit review',async()=>{
 const user=userEvent.setup();render(<App/>);
 const stock=await screen.findByRole('spinbutton',{name:'Wood stock'});
 const before=await peer.personalMetadata();
 const save=vi.spyOn(workspaceStore,'save');
 await user.clear(stock);await user.type(stock,'17');
 const other=await peer.load();
 await peer.save({...other,stock:{wood:9},goals:[{id:'remote',item:'arrow',quantity:11,completed:0,notes:'other tab'}]},before.revision);
 await screen.findByRole('button',{name:'Review latest workspace (discard draft)'});
 const persisted=await peer.export();const revision=(await peer.personalMetadata()).revision;
 await user.click(screen.getByRole('button',{name:'Save Wood stock'}));
 await screen.findByText(/Save failed: Data changed/);
 expect(save).toHaveBeenCalledWith(expect.objectContaining({stock:{wood:17}}),before.revision);
 expect(await peer.export()).toBe(persisted);
 expect((await peer.personalMetadata()).revision).toBe(revision);
 expect(stock).toHaveValue(17);
 // A later live notification must neither erase the error nor silently retry.
 await peer.rename('later tab');
 await waitFor(()=>expect(screen.getByText(/Save failed: Data changed/)).toBeVisible());
 expect(stock).toHaveValue(17);
 await user.click(screen.getByRole('button',{name:'Review latest workspace (discard draft)'}));
 expect(await screen.findByRole('heading',{name:'Arrow · 0 / 11'})).toBeVisible();
 expect(await screen.findByRole('spinbutton',{name:'Wood stock'})).toHaveValue(9);
 await user.clear(screen.getByRole('spinbutton',{name:'Wood stock'}));await user.type(screen.getByRole('spinbutton',{name:'Wood stock'}),'12');
 await user.click(screen.getByRole('button',{name:'Save Wood stock'}));
 await waitFor(async()=>expect((await peer.load()).stock.wood).toBe(12));
 expect((await peer.load()).goals[0].notes).toBe('other tab');
});
test('idle cross-connection changes refresh without startup saves',async()=>{
 const save=vi.spyOn(workspaceStore,'save');const before=(await peer.personalMetadata()).revision;
 render(<App/>);await screen.findByRole('spinbutton',{name:'Wood stock'});
 expect(save).not.toHaveBeenCalled();expect((await peer.personalMetadata()).revision).toBe(before);
 await peer.save({...await peer.load(),stock:{wood:33}},before);
 await waitFor(()=>expect(screen.getByRole('spinbutton',{name:'Wood stock'})).toHaveValue(33));
 expect(save).not.toHaveBeenCalled();
});
