import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuildWorkspace } from './GuildWorkspace';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const reply = (data: unknown) => new Response(JSON.stringify(data));
function credentials() {
  fireEvent.click(screen.getByLabelText(/I trust both endpoints/));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}
describe('GuildWorkspace', () => {
  it('makes no requests before opt-in and shows auth network errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('offline')); vi.stubGlobal('fetch', fetcher);
    render(<GuildWorkspace />); expect(fetcher).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    credentials(); expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    expect(localStorage.getItem('palworld.guild.endpoints')).toBeNull();
  });
  it('logs in, creates and displays guild, issues owner invite and marks displayed watermark', async () => {
    let created = false; let seen = false;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes('/token?')) return reply({ access_token: 'jwt', user: { id: 'u', email: 'person@example.test' } });
      if (url.includes('/rpc/create_guild')) { created = true; return reply('g'); }
      if (url.includes('/guilds?')) return reply(created ? [{ id: 'g', name: 'Builders' }] : []);
      if (url.includes('/guild_members?')) return reply([{ user_id: 'u', role: 'owner' }]);
      if (url.includes('/guild_tasks?')) return reply([]);
      if (url.includes('/rpc/guild_digest')) return reply(seen ? [] : [{ id: 7, kind: 'guild_created', actor: 'u', task_id: null, created_at: '2026-09-06T00:00:00Z' }]);
      if (url.includes('/rpc/mark_seen')) { expect(JSON.parse(options?.body as string)).toEqual({ p_guild: 'g', p_through_id: 7 }); seen = true; return reply(null); }
      throw Error(`Unexpected request ${url}`);
    }); vi.stubGlobal('fetch', fetcher);
    render(<GuildWorkspace />); credentials();
    await screen.findByText('Signed in as person@example.test');
    await waitFor(() => expect(screen.getByLabelText('New guild name')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('New guild name'), { target: { value: 'Builders' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create guild' }));
    expect(await screen.findByRole('heading', { name: 'Builders' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Issue 24-hour invitation' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark displayed activity seen' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Mark displayed activity seen' }));
    expect(await screen.findByText('Displayed activity marked seen.')).toBeInTheDocument();
    expect(seen).toBe(true);
    expect(localStorage.length).toBe(0);
  });
});
