import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuildWorkspace } from './GuildWorkspace';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const reply = (data: unknown) => new Response(JSON.stringify(data));
async function fixture() {
  let mode = 'ok';
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('/token?')) return reply({ access_token: 'jwt', user: { id: 'u' } });
    if (url.includes('/guilds?')) {
      if (mode === 'offline') throw new TypeError('offline');
      if (mode === 'expired') return new Response('', { status: 401 });
      return reply(mode === 'removed' ? [] : [{ id: 'g', name: 'Private guild' }]);
    }
    if (url.includes('/guild_shared_stock?')) return reply([{ item_id: 'private-stock', quantity: 4, revision: 1 }]);
    if (url.includes('/rpc/list_pending_invites')) return reply([{ id: 'private-invite', expires_at: '2026-09-07T00:00:00Z', created_by: 'u' }]);
    if (url.includes('/rpc/set_shared_stock')) throw new TypeError('offline');
    if (url.includes('/guild_members?')) return reply(mode === 'empty' ? [] : [{ user_id: 'u', role: 'owner' }]);
    if (url.includes('/guild_tasks?')) {
      if (mode === 'denied' || mode === 'empty') throw new TypeError('offline');
      return reply([{ id: 't', title: 'Private task', status: 'open', assignee: null, revision: 1 }]);
    }
    if (url.includes('/rpc/guild_digest')) return mode === 'denied' ? new Response('Forbidden', { status: 403 }) : reply([{ id: 7, kind: 'private_event', created_at: '2026-09-06T00:00:00Z' }]);
    if (url.includes('/rpc/create_invite')) return reply('secret-invite');
    if (url.includes('/rpc/mutate_task')) throw new TypeError('offline');
    throw new Error(`Unexpected ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<GuildWorkspace draft={{ title: 'Personal draft' }} />);
  fireEvent.click(screen.getByLabelText(/I trust both endpoints/));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'u@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(screen.getByLabelText('Selected guild')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Selected guild'), { target: { value: 'g' } });
  await screen.findByText('Private task');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Issue 24-hour invitation' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Issue 24-hour invitation' }));
  await screen.findByDisplayValue('secret-invite');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh from server' })).toBeEnabled());
  fireEvent.click(screen.getByLabelText('Publish this draft to the selected guild'));
  return { setMode: (next: string) => { mode = next; }, fetcher };
}

it.each(['removed', 'denied', 'empty', 'expired'])('purges private data and owner controls on %s authorization result', async mode => {
  const f = await fixture();
  f.setMode(mode);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh from server' }));
  await waitFor(() => expect(screen.queryByText('Private task')).not.toBeInTheDocument());
  expect(screen.queryByText(/private_event/)).not.toBeInTheDocument();
  expect(screen.queryByText(/private-stock/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Revoke invitation private-invite' })).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('secret-invite')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Issue 24-hour invitation' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Publish this draft to the selected guild')).not.toBeInTheDocument();
  if (mode === 'expired') expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  else expect(screen.getByLabelText('Selected guild')).toHaveValue('');
  f.setMode('ok');
  if (mode !== 'expired') {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh from server' }));
    await waitFor(() => expect(screen.getByLabelText('Selected guild')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Selected guild'), { target: { value: 'g' } });
    await screen.findByText('Private task');
    expect(screen.getByLabelText('Publish this draft to the selected guild')).not.toBeChecked();
    expect(screen.queryByDisplayValue('secret-invite')).not.toBeInTheDocument();
  }
});

it('purges uncertain stock retry after membership revocation', async () => {
  const f = await fixture();
  fireEvent.change(screen.getByLabelText('Shared item reference'), { target: { value: 'private-stock' } });
  fireEvent.change(screen.getByLabelText('Shared stock quantity'), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save shared stock' }));
  await screen.findByText(/Disconnected \/ read-only/);
  expect(screen.getByRole('button', { name: 'Retry exact stock request' })).toBeDisabled();
  f.setMode('removed');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh from server' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry exact stock request' })).not.toBeInTheDocument());
  expect(screen.queryByText(/private-stock/)).not.toBeInTheDocument();
});

it('retains uncertain data read-only, blocks every write, and recovers only after refresh', async () => {
  const f = await fixture();
  f.setMode('offline');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh from server' }));
  await screen.findByText(/Disconnected \/ read-only/);
  expect(screen.getByText('Private task')).toBeInTheDocument();
  expect(screen.getByDisplayValue('secret-invite')).toBeInTheDocument();
  for (const name of ['Create guild', 'Accept invitation', 'Issue 24-hour invitation', 'Create shared task', 'Publish draft', 'Claim task', 'Save task', 'Mark displayed activity seen', 'Save shared stock', 'Save guild name', 'Revoke invitation private-invite']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
  const calls = f.fetcher.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Publish draft' }));
  expect(f.fetcher).toHaveBeenCalledTimes(calls);
  f.setMode('ok');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh from server' }));
  await waitFor(() => expect(screen.queryByText(/Disconnected \/ read-only/)).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Publish draft' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Claim task' }));
  await screen.findByText(/Disconnected \/ read-only/);
  expect(screen.getByRole('button', { name: 'Retry exact task request' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh from server' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry exact task request' })).toBeEnabled());
  f.setMode('removed');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh from server' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry exact task request' })).not.toBeInTheDocument());
  expect(screen.queryByText('Private task')).not.toBeInTheDocument();
});
