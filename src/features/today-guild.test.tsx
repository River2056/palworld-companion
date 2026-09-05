import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuildWorkspace } from './guild/GuildWorkspace';
import App from '../app/App';

afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear();window.location.hash='';});
const reply=(data:unknown)=>new Response(JSON.stringify(data));
async function fixture() {
 let mode='ok', user='u'; let release:()=>void=()=>{};
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
 return {summary,session,fetcher,view,login,select,setMode:(v:string)=>{mode=v;},setUser:(v:string)=>{user=v;},release:()=>release()};
}
it('default Today performs no authentication or remote request',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<App/>);await screen.findByRole('heading',{name:'Optional guild planning'});expect(fetcher).not.toHaveBeenCalled();expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();});
it('emits only exact user assigned active tasks and scoped digest; switches guild and user without persistence',async()=>{const f=await fixture();expect(f.summary).toHaveBeenLastCalledWith({guildId:'g',guildName:'Guild G',userId:'u',tasks:[{id:'t',title:'private-g-u',status:'doing'}],unread:1});await f.select('h');expect(f.summary.mock.calls.some(([v])=>v===null)).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Sign out'}));await screen.findByRole('button',{name:'Sign in'});expect(f.summary).toHaveBeenLastCalledWith(null);expect(f.session).toHaveBeenLastCalledWith(false);f.setUser('v');await f.login();await f.select();expect(JSON.stringify(localStorage)).not.toMatch(/secret|private/);});
it.each(['401','403','empty','removed','offline'])('purges Today summary on %s',async mode=>{const f=await fixture();f.setMode(mode);fireEvent.click(screen.getByRole('button',{name:'Refresh from server'}));await waitFor(()=>expect(f.summary).toHaveBeenLastCalledWith(null));});
it.each(['logout','offline','unmount'])('blocks late response after %s',async mode=>{const f=await fixture();f.setMode('late');fireEvent.click(screen.getByRole('button',{name:'Refresh from server'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Refresh from server'})).toBeDisabled());await act(async()=>{await Promise.resolve();});if(mode==='logout') f.view.rerender(<GuildWorkspace onSummary={f.summary} onSession={f.session} logoutSignal={1}/>);else if(mode==='offline') fireEvent(window,new Event('offline'));else f.view.unmount();await act(async()=>{f.release();});expect(f.summary).toHaveBeenLastCalledWith(null);if(mode==='logout')expect(f.session).toHaveBeenLastCalledWith(false);});
