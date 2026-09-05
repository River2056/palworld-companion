import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuildWorkspace } from './guild/GuildWorkspace';
import App from '../app/App';

afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear();window.location.hash='';});
const reply=(data:unknown)=>new Response(JSON.stringify(data));
async function fixture() {
 let mode='ok', user='u'; let release:(()=>void)|undefined;
 const summary=vi.fn(), session=vi.fn();
 const fetcher=vi.fn(async(url:string)=>{
  if(url.includes('/token?')) return reply({access_token:`secret-${user}`,user:{id:user}});
  if(url.endsWith('/logout')) return reply(null);
  if(url.includes('/guilds?')) {if(mode==='offline') throw Error('offline');if(mode==='401') return new Response('',{status:401});return reply(mode==='removed'?[]:[{id:'g',name:'Guild G'},{id:'h',name:'Guild H'}]);}
  if(url.includes('/guild_members?')) return reply(mode==='empty'?[]:[{user_id:user,role:'member'}]);
  if(url.includes('/guild_tasks?')) {if(mode==='late') await new Promise<void>(r=>{release=r;});return reply([{id:'t',title:`private-${url.includes('eq.h')?'h':'g'}-${user}`,assignee:user,status:'doing',revision:1},{id:'other',title:'other user',assignee:'other',status:'open',revision:1},{id:'done',title:'completed',assignee:user,status:'done',revision:1}]);}
  if(url.includes('/rpc/guild_digest')) return mode==='403'?new Response('',{status:403}):reply([{id:1,kind:'change'}]);
  if(url.includes('/guild_shared_stock?')) return reply([]);
  throw Error(url);
 });
 vi.stubGlobal('fetch',fetcher);
 const view=render(<GuildWorkspace onSummary={summary} onSession={session}/>);
 async function login(){fireEvent.click(screen.getByLabelText(/I trust both endpoints/));fireEvent.change(screen.getByLabelText('Email'),{target:{value:'u@example.test'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'password'}});fireEvent.click(screen.getByRole('button',{name:'Sign in'}));await waitFor(()=>expect(screen.getByLabelText('Selected guild')).toBeEnabled());}
 async function select(id='g'){fireEvent.change(screen.getByLabelText('Selected guild'),{target:{value:id}});await waitFor(()=>expect(summary).toHaveBeenLastCalledWith(expect.objectContaining({guildId:id,userId:user})));await waitFor(()=>expect(screen.getByRole('button',{name:'Refresh from server'})).toBeEnabled());}
 await login();await select();
 return {summary,session,fetcher,view,login,select,setMode:(v:string)=>{mode=v;},setUser:(v:string)=>{user=v;},isPending:()=>!!release,release:()=>release?.()};
}
it('uses latest callback identities without lifecycle cleanup or fetch loops', async () => {
 const f = await fixture();
 const summary = vi.fn(), session = vi.fn();
 const count = f.fetcher.mock.calls.length;
 f.summary.mockClear(); f.session.mockClear();
 f.view.rerender(<GuildWorkspace onSummary={value => summary(value)} onSession={value => session(value)}/>);
 f.view.rerender(<GuildWorkspace onSummary={value => summary(value)} onSession={value => session(value)}/>);
 expect(f.summary).not.toHaveBeenCalled(); expect(f.session).not.toHaveBeenCalled();
 expect(summary).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
 expect(f.fetcher).toHaveBeenCalledTimes(count);
 fireEvent(window, new Event('offline'));
 expect(summary).toHaveBeenLastCalledWith(null);
 expect(screen.getByLabelText('Selected guild')).toHaveValue('');
 expect(screen.queryByText('private-g-u')).not.toBeInTheDocument();
 expect(session).not.toHaveBeenCalled(); // Offline clears data, not the in-memory account.
 fireEvent(window, new Event('online'));
 expect(f.fetcher).toHaveBeenCalledTimes(count);
 f.view.unmount();
 expect(session).toHaveBeenLastCalledWith(false);
});
it('parent callbacks that update state do not create effect cleanup loops', () => {
 const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
 let renders = 0;
 function Parent() {
  const [changes, setChanges] = useState(0); renders++;
  return <><output>{changes}</output><button onClick={() => setChanges(value => value + 1)}>Rerender</button><GuildWorkspace onSummary={() => setChanges(value => value + 1)} onSession={() => setChanges(value => value + 1)}/></>;
 }
 render(<Parent/>);
 fireEvent.click(screen.getByRole('button', { name: 'Rerender' }));
 expect(screen.getByRole('status')).toHaveTextContent('1');
 expect(renders).toBe(2); expect(fetcher).not.toHaveBeenCalled();
});
it('logout purges runtime data and consent but preserves endpoint-only and personal storage', async () => {
 localStorage.setItem('palworld.guild.endpoints', JSON.stringify({authUrl:'http://127.0.0.1:55431',restUrl:'http://127.0.0.1:55432'}));
 localStorage.setItem('personal-sentinel', 'keep'); sessionStorage.setItem('personal-tab', 'keep');
 const before = JSON.stringify([localStorage, sessionStorage]);
 const f = await fixture();
 fireEvent.change(screen.getByLabelText('Invitation token'), {target:{value:'private-invite'}});
 fireEvent.change(screen.getByLabelText('Shared task title'), {target:{value:'private-draft'}});
 fireEvent.click(screen.getByRole('button', {name:'Sign out'}));
 await screen.findByRole('button', {name:'Sign in'});
 expect(screen.getByLabelText('Password')).toHaveValue('');
 expect(screen.getByLabelText(/I trust both endpoints/)).not.toBeChecked();
 expect(screen.queryByText('private-g-u')).not.toBeInTheDocument();
 expect(f.summary).toHaveBeenLastCalledWith(null); expect(f.session).toHaveBeenLastCalledWith(false);
 expect(JSON.stringify([localStorage, sessionStorage])).toBe(before);
 sessionStorage.clear();
});
it.each(['offline-event', 'unmount'])('fences late responses after %s', async boundary => {
 const f = await fixture(); f.setMode('late');
 fireEvent.click(screen.getByRole('button', {name:'Refresh from server'}));
 await waitFor(() => expect(f.isPending()).toBe(true));
 if (boundary === 'offline-event') fireEvent(window, new Event('offline'));
 if (boundary === 'unmount') f.view.unmount();
 f.summary.mockClear();
 await act(async () => { f.release(); });
 expect(f.summary.mock.calls.every(([value]) => value === null)).toBe(true);
 expect(screen.queryByText('private-g-u')).not.toBeInTheDocument();
});
it('serializes a pending old-guild read before publishing only the newly selected scope', async () => {
 const f = await fixture(); f.setMode('late');
 fireEvent.click(screen.getByRole('button', {name:'Refresh from server'}));
 await waitFor(() => expect(f.isPending()).toBe(true));
 expect(screen.getByLabelText('Selected guild')).toBeDisabled();
 // Even a synthetic change cannot bypass the request lock while g is loading.
 fireEvent.change(screen.getByLabelText('Selected guild'), {target:{value:'h'}});
 expect(f.fetcher.mock.calls.some(([url]) => url.includes('eq.h'))).toBe(false);
 f.setMode('ok'); await act(async () => { f.release(); });
 await waitFor(() => expect(screen.getByLabelText('Selected guild')).toBeEnabled());
 f.summary.mockClear(); await f.select('h');
 expect(f.summary.mock.calls[0]).toEqual([null]);
 const published = f.summary.mock.calls.map(([value]) => value).filter(value => value !== null);
 expect(published.length).toBeGreaterThan(0);
 for (const value of published) expect(value).toMatchObject({guildId:'h',userId:'u',tasks:[{title:'private-h-u'}]});
 expect(screen.queryByText('private-g-u')).not.toBeInTheDocument();
});
it('default Today performs no authentication or remote request',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<App/>);await screen.findByRole('heading',{name:'Optional guild planning'});expect(fetcher).not.toHaveBeenCalled();expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();});
it('emits only exact user assigned active tasks and scoped digest; switches guild and user without persistence',async()=>{const f=await fixture();expect(f.summary).toHaveBeenLastCalledWith({guildId:'g',guildName:'Guild G',userId:'u',tasks:[{id:'t',title:'private-g-u',status:'doing'}],unread:1});await f.select('h');expect(f.summary.mock.calls.some(([v])=>v===null)).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Sign out'}));await screen.findByRole('button',{name:'Sign in'});expect(f.summary).toHaveBeenLastCalledWith(null);expect(f.session).toHaveBeenLastCalledWith(false);f.setUser('v');await f.login();await f.select();expect(JSON.stringify(localStorage)).not.toMatch(/secret|private/);});
it.each(['401','403','empty','removed','offline'])('purges Today summary on %s',async mode=>{const f=await fixture();f.setMode(mode);fireEvent.click(screen.getByRole('button',{name:'Refresh from server'}));await waitFor(()=>expect(f.summary).toHaveBeenLastCalledWith(null));});
it.each(['logout','offline','unmount'])('blocks every private callback after %s during a pending read', async mode => {
 const f = await fixture(); f.setMode('late');
 fireEvent.click(screen.getByRole('button', {name:'Refresh from server'}));
 await waitFor(() => expect(f.isPending()).toBe(true));
 f.summary.mockClear();
 if (mode === 'logout') f.view.rerender(<GuildWorkspace onSummary={f.summary} onSession={f.session} logoutSignal={1}/>);
 else if (mode === 'offline') fireEvent(window, new Event('offline'));
 else f.view.unmount();
 expect(f.summary).toHaveBeenCalledWith(null);
 await act(async () => { f.release(); });
 expect(f.summary.mock.calls.every(([value]) => value === null)).toBe(true);
 if (mode === 'logout') expect(f.session).toHaveBeenLastCalledWith(false);
});
