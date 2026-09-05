import { useRef, useState } from 'react';
import { ApiError, GuildClient, localEndpoints, TaskRetry, validateEndpoint } from './client';
import type { Activity, Endpoints, Guild, Member, Session, Task, TaskInput } from './client';
import './guild.css';
import { TaskDetails } from './TaskDetails';
import { StockRetry } from './client';
import type { SharedStock, PendingInvite, StockInput } from './client';

export interface GuildWorkspaceProps { draft?: { title: string; source?: string; checksum?: string; requirement?: string } }
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
  const [stock, setStock] = useState<SharedStock[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [rename, setRename] = useState('');
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState(0);
  const stockRetry = useRef(new StockRetry());
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
  const pending = !!retry.current.pending || !!stockRetry.current.pending;
  function clearPrivateState() {
    setStock([]); setInvites([]); setRename(''); setItem(''); setQuantity(0); stockRetry.current = new StockRetry();
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
    const results = await Promise.allSettled([c.tasks(id), c.members(id), c.rpc<Activity[]>('guild_digest', { p_guild: id }), c.stock(id)]);
    const denial = results.find(r => r.status === 'rejected' && r.reason instanceof ApiError && r.reason.denied);
    if (denial?.status === 'rejected') throw denial.reason;
    const membership = results[1];
    if (membership.status === 'fulfilled' && !membership.value.some(m => m.user_id === session?.user.id)) {
      throw new ApiError('Guild membership is no longer available. Private data cleared.', 403);
    }
    const [nextTasks, nextMembers, nextDigest, nextStock] = results.map(r => {
      if (r.status === 'rejected') throw r.reason;
      return r.value;
    }) as [Task[], Member[], Activity[], SharedStock[]];
    const nextInvites = nextMembers.some(m => m.user_id === session?.user.id && m.role === 'owner') ? await c.rpc<PendingInvite[]>('list_pending_invites', { p_guild: id }) : [];
    setStock(nextStock); setInvites(nextInvites);
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
    clearPrivateState(); setGuild(id); setTasks([]); setMembers([]); setDigest([]); setIssuedInvite(''); setPublish(false);
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
  async function saveStock(value?: StockInput) {
    await stockRetry.current.send(client(), value);
    await load(client(), guild); setNotice('Shared stock saved on server.');
  }
  async function logout() {
    const c = client(); clearPrivateState(); setSession(null); setPassword(''); setGuilds([]); setGuild(''); setTasks([]); setMembers([]); setDigest([]); setIssuedInvite(''); setInvite(''); setAccept(false); setApproved(false); retry.current = new TaskRetry();
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
    {error && <div role="alert">{error} {pending ? 'The mutation outcome is unknown. Retry the exact request below; do not recreate it.' : 'Displayed data may be stale. Refresh to check the server before repeating a non-task action.'}</div>}
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
      {retry.current.pending && <div role="status"><p>One task request awaits confirmation. Its original payload and idempotency key are held in memory; keep this page open.</p><button disabled={busy || disconnected} onClick={() => void run(() => mutate())}>Retry exact task request</button></div>}
      {conflict && <div role="alert">Task or stock conflict, or source checksum changed. Reload before editing again; changed source plans require explicit reconfirmation.<button disabled={busy} onClick={() => void run(() => refresh(), true)}>Reload conflicting tasks</button></div>}
      <fieldset disabled={busy || disconnected || pending}><legend>Your guilds</legend><label>Selected guild<select value={guild} onChange={e => void run(() => select(e.target.value))}><option value="">Choose a guild</option>{guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <form onSubmit={e => { e.preventDefault(); void run(async () => { const id = await client().rpc<string>('create_guild', { p_name: name.trim() }); setName(''); await refresh(client(), ''); await select(id); }); }}><label>New guild name<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><button disabled={!name.trim()}>Create guild</button></form>
        <form onSubmit={e => { e.preventDefault(); void run(async () => { const id = await client().rpc<string>('redeem_invite', { p_token: invite.trim(), p_accept: accept }); setInvite(''); setAccept(false); await refresh(client(), ''); await select(id); }); }}><label>Invitation token<input required value={invite} onChange={e => setInvite(e.target.value)} autoComplete="off" /></label><label className="guild-check"><input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} />I accept this invitation and choose to join this shared guild.</label><button disabled={!accept || !invite.trim()}>Accept invitation</button></form>
      </fieldset>
      {guild && <><h3>{guilds.find(g => g.id === guild)?.name || 'Selected guild'}</h3><p>Your role: {owner ? 'owner' : members.length ? 'member' : 'not loaded'}</p>
        {owner && <div><button disabled={busy || disconnected || pending} onClick={() => void run(async () => { setIssuedInvite(await client().rpc<string>('create_invite', { p_guild: guild, p_hours: 24 })); await load(client(), guild); })}>Issue 24-hour invitation</button>{issuedInvite && <label>Single-use token — share privately<input readOnly value={issuedInvite} onFocus={e => e.target.select()} /></label>}</div>}
        <form onSubmit={e => { e.preventDefault(); void run(async () => { await mutate(input('create', undefined, { p_title: title.trim() })); setTitle(''); }); }}><fieldset disabled={busy || disconnected || pending || conflict}><legend>Create shared task</legend><label>Shared task title<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label><button disabled={!title.trim()}>Create shared task</button></fieldset></form>
        {draft && <fieldset disabled={busy || disconnected || pending || conflict}><legend>Publish personal draft explicitly</legend><p>{draft.title}</p><p>Only title, source identifier, requirement identity and checksum will be shared with this guild.</p><label className="guild-check"><input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} />Publish this draft to the selected guild</label><button disabled={!publish || !draft.title.trim() || draft.title.length > 200 || (draft.source?.length ?? 0) > 200 || (draft.checksum?.length ?? 0) > 128 || (draft.requirement?.length ?? 0) > 300} onClick={() => void run(async () => { await mutate(input('create', undefined, { p_title: draft.title, p_source: draft.source ?? null, p_checksum: draft.checksum ?? null, p_source_requirement: draft.requirement ?? null })); setPublish(false); })}>Publish draft</button></fieldset>}
        <h4>Members</h4><ul>{members.map(m => <li key={m.user_id}>{m.user_id} · {m.role}{owner && m.role !== 'owner' && <button disabled={busy || disconnected || pending} onClick={() => { if (window.confirm(`Remove member ${m.user_id}? Active claims will be released.`)) void run(async () => { await client().rpc('remove_member', { p_guild: guild, p_user: m.user_id }); await load(client(), guild); }); }}>Remove member {m.user_id}</button>}</li>)}</ul>
        {owner && <fieldset disabled={busy || disconnected || pending}><legend>Owner management</legend><form onSubmit={e => { e.preventDefault(); void run(async () => { await client().rpc('rename_guild', { p_guild: guild, p_name: rename.trim() }); await refresh(); setRename(''); }); }}><label>Rename guild<input required maxLength={100} value={rename} onChange={e => setRename(e.target.value)} /></label><button disabled={!rename.trim()}>Save guild name</button></form><h4>Pending invitations</h4><p>Tokens are only shown when issued; this list never exposes tokens or hashes.</p><ul>{invites.map(i => <li key={i.id}>{i.id} · expires {new Date(i.expires_at).toLocaleString()}<button onClick={() => { if (window.confirm('Revoke this invitation?')) void run(async () => { await client().rpc('revoke_invite', { p_guild: guild, p_invite: i.id }); setIssuedInvite(''); await load(client(), guild); }); }}>Revoke invitation {i.id}</button></li>)}</ul></fieldset>}
        <h4>Shared stock</h4><p>Exact shared quantities; task completion never changes stock or personal inventory.</p><ul>{stock.map(s => <li key={s.item_id}>{s.item_id}: {s.quantity} · revision {s.revision}</li>)}</ul>
        {stockRetry.current.pending && <div role="status">One stock request awaits confirmation. Keep this page open.<button disabled={busy || disconnected} onClick={() => void run(() => saveStock())}>Retry exact stock request</button></div>}
        <form onSubmit={e => { e.preventDefault(); if (!Number.isSafeInteger(quantity) || quantity < 0) return; void run(() => saveStock({ p_guild: guild, p_item: item.trim(), p_quantity: quantity, p_revision: stock.find(s => s.item_id === item.trim())?.revision ?? 0, p_key: crypto.randomUUID() })); }}><fieldset disabled={busy || disconnected || pending || conflict}><legend>Set shared stock</legend><label>Shared item reference<input required maxLength={200} value={item} onChange={e => setItem(e.target.value)} /></label><label>Shared stock quantity<input type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={quantity} onChange={e => setQuantity(e.target.valueAsNumber)} /></label><button disabled={!item.trim() || !Number.isSafeInteger(quantity) || quantity < 0}>Save shared stock</button></fieldset></form>
        <details><summary>Create task with details</summary><TaskDetails disabled={busy || disconnected || pending || conflict} onSave={values => void run(() => mutate(input('create', undefined, values)))} /></details>
        <h4>Shared tasks</h4>{!tasks.length && <p>No shared tasks loaded.</p>}<ul className="guild-tasks">{tasks.map(task => <li key={`${task.id}:${task.revision}`}><TaskEditor task={task} editable={owner || task.assignee === session.user.id} disabled={busy || disconnected || pending || conflict} onClaim={() => void run(() => mutate(input('claim', task)))} onSave={values => void run(() => mutate(input('update', task, values)))} /></li>)}</ul>
        <h4>Since last seen</h4><p>{digest.length ? `${digest.length} unread events` : 'No unread activity loaded.'}</p><ul>{digest.map(event => <li key={event.id}>{event.details?.summary || event.kind} · {new Date(event.created_at).toLocaleString()} · Actor: {event.actor}{event.task_id && <> · Task: {event.task_id}</>}{event.details?.after != null && <details><summary>Change details</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ actor: event.actor, before: event.details.before, after: event.details.after }, null, 2)}</pre></details>}</li>)}</ul><button disabled={busy || disconnected || pending || !digest.length} onClick={() => void run(async () => { const through = digest[digest.length - 1].id; await client().rpc('mark_seen', { p_guild: guild, p_through_id: through }); await load(client(), guild); setNotice('Displayed activity marked seen.'); })}>Mark displayed activity seen</button>
      </>}
    </>}
  </section>;
}
function TaskEditor({ task, editable, disabled, onClaim, onSave }: { task: Task; editable: boolean; disabled: boolean; onClaim: () => void; onSave: (values: Partial<TaskInput>) => void }) {
  return <><strong>{task.title}</strong><p>{task.status} · revision {task.revision} · {task.assignee ? `Assigned: ${task.assignee}` : 'Unclaimed'}</p>
    <p>{task.task_type || 'general'} · {task.delivered_quantity ?? 0} / {task.requested_quantity ?? 0} delivered</p><p>{task.description}</p>
    {task.source_requirement_id && <p>Requirement: {task.source_requirement_id} · checksum: {task.snapshot_checksum}</p>}
    {!task.assignee && !['done', 'cancelled'].includes(task.status) && <button disabled={disabled} onClick={onClaim}>Claim task</button>}
    {editable && <TaskDetails task={task} disabled={disabled} onSave={onSave} />}
  </>;
}
