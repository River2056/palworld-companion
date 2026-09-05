import { useRef, useState } from 'react';
import { ApiError, GuildClient, localEndpoints, TaskRetry, validateEndpoint } from './client';
import type { Activity, Endpoints, Guild, Member, Session, Task, TaskInput } from './client';
import './guild.css';

export interface GuildWorkspaceProps { draft?: { title: string; source?: string; checksum?: string } }
const settingsKey = 'palworld.guild.endpoints';
function initialEndpoints(): Endpoints {
  try { const saved = JSON.parse(localStorage.getItem(settingsKey) || 'null'); if (saved) return { authUrl: validateEndpoint(saved.authUrl), restUrl: validateEndpoint(saved.restUrl) }; } catch { /* Invalid or unavailable storage: use safe local defaults. */ }
  return localEndpoints;
}
export function GuildWorkspace({ draft }: GuildWorkspaceProps = {}) {
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [approved, setApproved] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guild, setGuild] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [digest, setDigest] = useState<Activity[]>([]);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [invite, setInvite] = useState('');
  const [issuedInvite, setIssuedInvite] = useState('');
  const [accept, setAccept] = useState(false);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const retry = useRef(new TaskRetry());
  const lock = useRef(false);
  const client = () => new GuildClient(endpoints, session?.access_token);
  const owner = members.some(m => m.user_id === session?.user.id && m.role === 'owner');
  const pending = !!retry.current.pending;
  function clearPrivateState() {
    setGuild(''); setTasks([]); setMembers([]); setDigest([]); setIssuedInvite('');
    setPublish(false); setTitle(''); setInvite(''); setAccept(false); setConflict(false);
    retry.current = new TaskRetry();
  }
  async function run(action: () => Promise<void>, allowDisconnected = false) {
    if (lock.current || (session && disconnected && !allowDisconnected)) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      if (e instanceof ApiError && e.denied) {
        clearPrivateState(); setGuilds([]); setDisconnected(true);
        if (e.status === 401) { setSession(null); setPassword(''); setApproved(false); }
      } else if (!(e instanceof ApiError) || e.uncertain) setDisconnected(true);
      if (e instanceof ApiError && e.conflict) setConflict(true);
    } finally { lock.current = false; setBusy(false); }
  }
  async function load(c: GuildClient, id: string) {
    // Inspect every result: a fast network failure must not mask a confirmed denial.
    const results = await Promise.allSettled([c.tasks(id), c.members(id), c.rpc<Activity[]>('guild_digest', { p_guild: id })]);
    const denial = results.find(r => r.status === 'rejected' && r.reason instanceof ApiError && r.reason.denied);
    if (denial?.status === 'rejected') throw denial.reason;
    const membership = results[1];
    if (membership.status === 'fulfilled' && !membership.value.some(m => m.user_id === session?.user.id)) {
      throw new ApiError('Guild membership is no longer available. Private data cleared.', 403);
    }
    const [nextTasks, nextMembers, nextDigest] = results.map(r => {
      if (r.status === 'rejected') throw r.reason;
      return r.value;
    }) as [Task[], Member[], Activity[]];
    setTasks(nextTasks); setMembers(nextMembers); setDigest(nextDigest); setConflict(false);
  }
  async function refresh(c = client(), id = guild) {
    const list = await c.guilds(); setGuilds(list);
    if (id && !list.some(g => g.id === id)) {
      clearPrivateState(); setDisconnected(false);
      setNotice('Guild membership is no longer available. Private data cleared.');
      return;
    }
    if (id) await load(c, id);
    setDisconnected(false);
    setNotice('Loaded from server. No background sync.');
  }
  async function authenticate() {
    if (!approved) throw new Error('Confirm the endpoint destinations before sending credentials.');
    const c = new GuildClient(endpoints);
    const result = await c.auth(email, password, signup); setPassword('');
    if (!result.access_token || !result.user?.id) { setNotice('Account request accepted. Check your email, then sign in.'); return; }
    setSession(result);
    await refresh(new GuildClient(endpoints, result.access_token), '');
  }
  async function select(id: string) {
    setGuild(id); setTasks([]); setMembers([]); setDigest([]); setIssuedInvite(''); setPublish(false);
    if (id) await load(client(), id);
  }
  async function mutate(input?: TaskInput) {
    await retry.current.send(client(), input);
    setNotice('Task saved on server.');
    await load(client(), guild);
  }
  function input(action: TaskInput['p_action'], task?: Task, values: Partial<TaskInput> = {}): TaskInput {
    return { p_guild: guild, p_action: action, p_task: task?.id ?? null, p_revision: task?.revision ?? null, p_title: null, p_status: null, p_source: null, p_checksum: null, p_key: crypto.randomUUID(), ...values };
  }
  async function logout() {
    const c = client(); setSession(null); setPassword(''); setGuilds([]); setGuild(''); setTasks([]); setMembers([]); setDigest([]); setIssuedInvite(''); setInvite(''); setAccept(false); setApproved(false); retry.current = new TaskRetry();
    try { await c.logout(); setNotice('Signed out. Session cleared from memory.'); }
    catch { setError('Local session cleared. Server sign-out could not be confirmed; the token expires on the server.'); }
  }
  return <section className="guild-workspace" aria-labelledby="guild-heading">
    <header><h2 id="guild-heading">Guild workspace</h2><p>Optional account and network features. Your personal planner stays local; nothing is published automatically.</p></header>
    <details open={!session}><summary>Connection settings & privacy</summary>
      <p>Credentials go only to the Auth URL. Your session token and explicitly shared guild data go to the REST URL. Use destinations you trust. Sessions and passwords are never stored; only endpoint URLs are saved.</p>
      <fieldset disabled={busy || !!session}><label>Auth URL<input type="url" value={endpoints.authUrl} onChange={e => { setApproved(false); setEndpoints({ ...endpoints, authUrl: e.target.value }); }} /></label>
      <label>REST URL<input type="url" value={endpoints.restUrl} onChange={e => { setApproved(false); setEndpoints({ ...endpoints, restUrl: e.target.value }); }} /></label>
      <button type="button" onClick={() => void run(async () => { const valid = { authUrl: validateEndpoint(endpoints.authUrl), restUrl: validateEndpoint(endpoints.restUrl) }; setEndpoints(valid); try { localStorage.setItem(settingsKey, JSON.stringify(valid)); setNotice('Endpoint URLs saved.'); } catch { setNotice('Storage unavailable; endpoints kept in memory.'); } })}>Save endpoint URLs</button>
      <label className="guild-check"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I trust both endpoints and consent to sending credentials and shared data there.</label></fieldset>
    </details>
    {error && <div role="alert">{error} {pending ? 'The task outcome is unknown. Retry the exact request below; do not recreate it.' : 'Displayed data may be stale. Refresh to check the server before repeating a non-task action.'}</div>}
    {session && disconnected && <p role="status">Disconnected / read-only: authorization could not be verified. Refresh successfully before making changes.</p>}
    {notice && <p role="status">{notice}</p>}
    {busy && <p role="status">Contacting guild server…</p>}
    {!session ? <form onSubmit={e => { e.preventDefault(); void run(authenticate); }}><fieldset disabled={busy}>
      <legend>{signup ? 'Create guild account' : 'Sign in to guild account'}</legend>
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label className="guild-check"><input type="checkbox" checked={signup} onChange={e => setSignup(e.target.checked)} />Create a new account</label>
      <button disabled={!approved}>{signup ? 'Sign up' : 'Sign in'}</button>
    </fieldset></form> : <>
      <div className="guild-toolbar"><span>Signed in as {session.user.email || email}</span><button disabled={busy} onClick={() => void run(logout, true)}>Sign out</button><button disabled={busy} onClick={() => void run(() => refresh(), true)}>Refresh from server</button></div>
      {pending && <div role="status"><p>One task request awaits confirmation. Its original payload and idempotency key are held in memory; keep this page open.</p><button disabled={busy || disconnected} onClick={() => void run(() => mutate())}>Retry exact task request</button></div>}
      {conflict && <div role="alert">Another member changed this task. Reload before editing again.<button disabled={busy} onClick={() => void run(() => refresh(), true)}>Reload conflicting tasks</button></div>}
      <fieldset disabled={busy || disconnected || pending}><legend>Your guilds</legend><label>Selected guild<select value={guild} onChange={e => void run(() => select(e.target.value))}><option value="">Choose a guild</option>{guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <form onSubmit={e => { e.preventDefault(); void run(async () => { const id = await client().rpc<string>('create_guild', { p_name: name.trim() }); setName(''); await refresh(client(), ''); await select(id); }); }}><label>New guild name<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><button disabled={!name.trim()}>Create guild</button></form>
        <form onSubmit={e => { e.preventDefault(); void run(async () => { const id = await client().rpc<string>('redeem_invite', { p_token: invite.trim(), p_accept: accept }); setInvite(''); setAccept(false); await refresh(client(), ''); await select(id); }); }}><label>Invitation token<input required value={invite} onChange={e => setInvite(e.target.value)} autoComplete="off" /></label><label className="guild-check"><input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} />I accept this invitation and choose to join this shared guild.</label><button disabled={!accept || !invite.trim()}>Accept invitation</button></form>
      </fieldset>
      {guild && <><h3>{guilds.find(g => g.id === guild)?.name || 'Selected guild'}</h3><p>Your role: {owner ? 'owner' : members.length ? 'member' : 'not loaded'}</p>
        {owner && <div><button disabled={busy || disconnected || pending} onClick={() => void run(async () => { setIssuedInvite(await client().rpc<string>('create_invite', { p_guild: guild, p_hours: 24 })); })}>Issue 24-hour invitation</button>{issuedInvite && <label>Single-use token — share privately<input readOnly value={issuedInvite} onFocus={e => e.target.select()} /></label>}</div>}
        <form onSubmit={e => { e.preventDefault(); void run(async () => { await mutate(input('create', undefined, { p_title: title.trim() })); setTitle(''); }); }}><fieldset disabled={busy || disconnected || pending || conflict}><legend>Create shared task</legend><label>Shared task title<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label><button disabled={!title.trim()}>Create shared task</button></fieldset></form>
        {draft && <fieldset disabled={busy || disconnected || pending || conflict}><legend>Publish personal draft explicitly</legend><p>{draft.title}</p><p>Only title, source identifier and checksum will be shared with this guild.</p><label className="guild-check"><input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} />Publish this draft to the selected guild</label><button disabled={!publish || !draft.title.trim() || draft.title.length > 200 || (draft.source?.length ?? 0) > 200 || (draft.checksum?.length ?? 0) > 128} onClick={() => void run(async () => { await mutate(input('create', undefined, { p_title: draft.title, p_source: draft.source ?? null, p_checksum: draft.checksum ?? null })); setPublish(false); })}>Publish draft</button></fieldset>}
        <h4>Shared tasks</h4>{!tasks.length && <p>No shared tasks loaded.</p>}<ul className="guild-tasks">{tasks.map(task => <li key={`${task.id}:${task.revision}`}><TaskEditor task={task} editable={owner || task.assignee === session.user.id} disabled={busy || disconnected || pending || conflict} onClaim={() => void run(() => mutate(input('claim', task)))} onSave={(nextTitle, status) => void run(() => mutate(input('update', task, { p_title: nextTitle, p_status: status })))} /></li>)}</ul>
        <h4>Since last seen</h4><p>{digest.length ? `${digest.length} unread events` : 'No unread activity loaded.'}</p><ul>{digest.map(event => <li key={event.id}>{event.kind} · {new Date(event.created_at).toLocaleString()}</li>)}</ul><button disabled={busy || disconnected || !digest.length} onClick={() => void run(async () => { const through = digest[digest.length - 1].id; await client().rpc('mark_seen', { p_guild: guild, p_through_id: through }); await load(client(), guild); setNotice('Displayed activity marked seen.'); })}>Mark displayed activity seen</button>
      </>}
    </>}
  </section>;
}
function TaskEditor({ task, editable, disabled, onClaim, onSave }: { task: Task; editable: boolean; disabled: boolean; onClaim: () => void; onSave: (title: string, status: Task['status']) => void }) {
  const [title, setTitle] = useState(task.title); const [status, setStatus] = useState(task.status);
  return <><strong>{task.title}</strong><p>{task.status} · revision {task.revision} · {task.assignee ? `Assigned: ${task.assignee}` : 'Unclaimed'}</p>
    {!task.assignee && task.status !== 'done' && <button disabled={disabled} onClick={onClaim}>Claim task</button>}
    {editable && <form onSubmit={e => { e.preventDefault(); onSave(title.trim(), status); }}><fieldset disabled={disabled}><label>Edit title<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label><label>Status<select value={status} onChange={e => setStatus(e.target.value as Task['status'])}><option value="open">Open</option><option value="doing">Doing</option><option value="done">Done</option></select></label><button disabled={!title.trim()}>Save task</button></fieldset></form>}
  </>;
}
