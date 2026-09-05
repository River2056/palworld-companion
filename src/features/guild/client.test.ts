import { describe, expect, it, vi } from 'vitest';
import { ApiError, GuildClient, localEndpoints, TaskRetry, validateEndpoint } from './client';
import type { TaskInput } from './client';
const input: TaskInput = { p_guild: 'guild', p_action: 'create', p_task: null, p_revision: null, p_title: 'Wood', p_status: null, p_source: null, p_checksum: null, p_key: 'fixed-key' };
describe('guild transport boundary', () => {
  it('allows HTTPS and loopback only, rejects URL credentials and query', () => {
    for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/?secret=x', 'file:///etc/passwd']) expect(() => validateEndpoint(url)).toThrow();
    expect(validateEndpoint('http://127.0.0.1:55431/')).toBe(localEndpoints.authUrl);
    expect(validateEndpoint('https://example.com/auth/v1')).toBe('https://example.com/auth/v1');
  });
  it('sends authenticated JWT and exact RPC payload without cookies or redirects', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    await new GuildClient(localEndpoints, 'test-jwt', fetcher).mutate(input);
    expect(fetcher).toHaveBeenCalledWith(`${localEndpoints.restUrl}/rpc/mutate_task`, expect.objectContaining({ credentials: 'omit', redirect: 'error', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' } }));
  });
  it('keeps immutable payload and key after uncertain failure, including 503', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response('{"message":"busy"}', { status: 503 })).mockResolvedValueOnce(new Response('{"id":"one"}'));
    const retry = new TaskRetry(); const client = new GuildClient(localEndpoints, 'test', fetcher);
    await expect(retry.send(client, input)).rejects.toThrow('Network unavailable');
    await expect(retry.send(client, { ...input, p_title: 'Changed' })).rejects.toThrow('Resolve');
    await expect(retry.send(client)).rejects.toThrow('busy');
    expect(retry.pending).toEqual(input);
    await retry.send(client); expect(retry.pending).toBeNull();
    expect(fetcher.mock.calls.map(call => call[1].body)).toEqual([JSON.stringify(input), JSON.stringify(input), JSON.stringify(input)]);
  });
  it('clears retry on definitive revision conflict', async () => {
    const retry = new TaskRetry(); const client = new GuildClient(localEndpoints, 'test', vi.fn().mockResolvedValue(new Response('{"code":"PT409","message":"Revision conflict"}', { status: 409 })));
    await expect(retry.send(client, input)).rejects.toMatchObject({ conflict: true }); expect(retry.pending).toBeNull();
    expect(new ApiError('forbidden', 403).uncertain).toBe(false);
  });
});
