export interface SharedStock { item_id: string; quantity: number; revision: number }
export interface PendingInvite { id: string; expires_at: string; created_by: string }
export interface StockInput { p_guild: string; p_item: string; p_quantity: number; p_revision: number; p_key: string }
export class StockRetry {
  pending: Readonly<StockInput> | null = null;
  async send(client: GuildClient, input?: StockInput) {
    if (this.pending && input) throw new Error('Resolve pending stock request first.');
    if (!this.pending) { if (!input) throw new Error('No pending request.'); this.pending = Object.freeze({ ...input }); }
    try { const result = await client.rpc<SharedStock>('set_shared_stock', this.pending); this.pending = null; return result; }
    catch (error) { if (error instanceof ApiError && !error.uncertain) this.pending = null; throw error; }
  }
}
export interface Endpoints { authUrl: string; restUrl: string }
export interface Session { access_token: string; user: { id: string; email?: string } }
export interface Guild { id: string; name: string }
export interface Member { user_id: string; role: 'owner' | 'member' }
export interface Task { id: string; title: string; status: 'open' | 'doing' | 'done' | 'blocked' | 'cancelled'; assignee: string | null; revision: number; task_type?: string; description?: string; requested_quantity?: number; delivered_quantity?: number; source_id?: string | null; snapshot_checksum?: string | null; source_requirement_id?: string | null }
export interface Activity { id: number; kind: string; actor: string; task_id: string | null; created_at: string; details?: { summary?: string; before?: unknown; after?: unknown } }
export interface TaskInput { p_guild: string; p_action: 'create' | 'claim' | 'update'; p_task: string | null; p_revision: number | null; p_title: string | null; p_status: Task['status'] | null; p_source: string | null; p_checksum: string | null; p_key: string; p_type?: string; p_description?: string; p_requested?: number; p_delivered?: number; p_source_requirement?: string | null; p_reconfirm?: boolean }
export const localEndpoints: Endpoints = {
  authUrl: import.meta.env.VITE_GUILD_AUTH_URL?.trim() || 'http://127.0.0.1:55431',
  restUrl: import.meta.env.VITE_GUILD_REST_URL?.trim() || 'http://127.0.0.1:55432',
};
export function validateEndpoint(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Use HTTPS, or HTTP on localhost only; no credentials, query or fragment in URLs.');
  }
  return url.href.replace(/\/$/, '');
}
export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = '') { super(message); }
  get denied() { return this.status === 401 || this.status === 403 || this.code === '42501'; }
  get uncertain() { return this.status === 0 || this.status >= 500 || this.status === 408 || this.status === 429; }
  get conflict() { return this.code === 'PT409' || this.code === '40001' || this.status === 409; }
}
export class GuildClient {
  readonly endpoints: Endpoints;
  constructor(endpoints: Endpoints, private token = '', private transport: typeof fetch = fetch.bind(globalThis)) {
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
    // Preserve authoritative denial even when an error body is empty or not JSON.
    if (response.status === 401 || response.status === 403) throw new ApiError('Authentication or guild access denied. Private data cleared.', response.status);
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
  tasks(id: string) { return this.request<Task[]>(this.endpoints.restUrl, `guild_tasks?select=*&guild_id=eq.${encodeURIComponent(id)}&order=updated_at.desc`); }
  stock(id: string) { return this.request<SharedStock[]>(this.endpoints.restUrl, `guild_shared_stock?select=*&guild_id=eq.${encodeURIComponent(id)}&order=item_id.asc`); }
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
