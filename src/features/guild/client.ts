export interface Endpoints { authUrl: string; restUrl: string }
export interface Session { access_token: string; user: { id: string; email?: string } }
export interface Guild { id: string; name: string }
export interface Member { user_id: string; role: 'owner' | 'member' }
export interface Task { id: string; title: string; status: 'open' | 'doing' | 'done'; assignee: string | null; revision: number }
export interface Activity { id: number; kind: string; actor: string; task_id: string | null; created_at: string }
export interface TaskInput { p_guild: string; p_action: 'create' | 'claim' | 'update'; p_task: string | null; p_revision: number | null; p_title: string | null; p_status: Task['status'] | null; p_source: string | null; p_checksum: string | null; p_key: string }
export const localEndpoints: Endpoints = { authUrl: 'http://127.0.0.1:55431', restUrl: 'http://127.0.0.1:55432' };
export function validateEndpoint(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Use HTTPS, or HTTP on localhost only; no credentials, query or fragment in URLs.');
  }
  return url.href.replace(/\/$/, '');
}
export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = '') { super(message); }
  get uncertain() { return this.status === 0 || this.status >= 500 || this.status === 408 || this.status === 429; }
  get conflict() { return this.code === '40001' || this.status === 409; }
}
export class GuildClient {
  readonly endpoints: Endpoints;
  constructor(endpoints: Endpoints, private token = '', private transport: typeof fetch = fetch) {
    this.endpoints = { authUrl: validateEndpoint(endpoints.authUrl), restUrl: validateEndpoint(endpoints.restUrl) };
  }
  private async request<T>(base: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.transport(`${base}/${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit',
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
      });
    } catch { throw new ApiError('Network unavailable or request timed out. Server outcome may be unknown.'); }
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { throw new ApiError('Unreadable server response; outcome unknown.'); }
    if (!response.ok) throw new ApiError(data?.message || data?.msg || data?.error_description || `Request failed (${response.status})`, response.status, data?.code || '');
    return data as T;
  }
  auth(email: string, password: string, signup = false) { return this.request<Session>(this.endpoints.authUrl, signup ? 'signup' : 'token?grant_type=password', { email, password }); }
  logout() { return this.request<null>(this.endpoints.authUrl, 'logout', {}); }
  rpc<T>(name: string, body: unknown) { return this.request<T>(this.endpoints.restUrl, `rpc/${name}`, body); }
  guilds() { return this.request<Guild[]>(this.endpoints.restUrl, 'guilds?select=id,name&order=created_at.asc'); }
  members(id: string) { return this.request<Member[]>(this.endpoints.restUrl, `guild_members?select=user_id,role&guild_id=eq.${encodeURIComponent(id)}`); }
  tasks(id: string) { return this.request<Task[]>(this.endpoints.restUrl, `guild_tasks?select=id,title,status,assignee,revision&guild_id=eq.${encodeURIComponent(id)}&order=updated_at.desc`); }
  mutate(input: TaskInput) { return this.rpc<Task>('mutate_task', input); }
}
/** Hold exactly one immutable task request until success or definitive rejection. */
export class TaskRetry {
  pending: Readonly<TaskInput> | null = null;
  async send(client: GuildClient, input?: TaskInput) {
    if (this.pending && input) throw new Error('Resolve the pending task request before starting another.');
    if (!this.pending) {
      if (!input) throw new Error('No pending request.');
      this.pending = Object.freeze({ ...input });
    }
    try { const task = await client.mutate(this.pending); this.pending = null; return task; }
    catch (error) { if (error instanceof ApiError && !error.uncertain) this.pending = null; throw error; }
  }
}
