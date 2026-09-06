/* global process */
import {spawnSync} from 'node:child_process';
import {fileURLToPath, URL} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePodman} from './podman-preflight.mjs';

const success = (stdout = '') => ({status: 0, stdout});
const failure = {status: 125};
const missing = {status: null, error: {code: 'ENOENT'}};
const machine = {Name: 'existing', Default: false, Running: false, Port: 1234, IdentityPath: '/key'};
const connection = {Name: 'existing-root', Default: true, IsMachine: true, URI: 'ssh://root@127.0.0.1:1234/run/podman/podman.sock', Identity: '/key'};
function harness(options = {}) {
  const calls = [], prompts = [];
  let versions = 0, infos = 0, connections = 0;
  const run = (bin, args, mode = {}) => {
    const key = `${bin} ${args.join(' ')}`;
    calls.push({key, mutate: Boolean(mode.mutate)});
    if (options.fail === key) return failure;
    if (key === 'podman --version') return ++versions === 1 ? options.version ?? success() : options.afterInstall ?? success();
    if (key === 'brew --version') return options.brew ?? success();
    if (key === 'podman info') return ++infos === 1 ? options.info ?? failure : options.finalInfo ?? success();
    if (key === 'podman machine list --format json') return success(options.machineJSON ?? JSON.stringify(options.machines ?? [machine]));
    if (key === 'podman system connection list --format json') return success(JSON.stringify(++connections === 1 ? options.connections ?? [connection] : options.afterConnections ?? options.connections ?? [connection]));
    if (key === 'podman machine start --help') return success(options.help ?? '');
    if (mode.mutate) return success();
    assert.fail(`Unexpected command: ${key}`);
  };
  const invoke = extra => ensurePodman({setup: true, yes: true, platform: 'darwin', env: {}, isTTY: false, run,
    log: () => {}, prompt: async message => {prompts.push(message);return options.answer ?? false;}, ...extra});
  return {invoke, calls, prompts, mutations: () => calls.filter(c => c.mutate).map(c => c.key)};
}
test('ready setup and ordinary preflight are read-only on every platform', async () => {
  for (const platform of ['darwin', 'linux', 'win32']) for (const setup of [false, true]) {
    const h = harness({info: success()});
    await h.invoke({platform, setup, yes: false});
    assert.deepEqual(h.calls.map(c=>c.key), ['podman --version', 'podman info']);
    assert.deepEqual(h.mutations(), []);
  }
});
for (const [name, options, extra, message] of [
  ['missing ordinary preflight', {version: missing}, {setup: false}, /not on PATH.*setup-podman/],
  ['unavailable ordinary preflight', {}, {setup: false}, /installed but.*unavailable/],
  ['CLI permission failure is not absence', {version: {status: null, error: {code: 'EACCES'}}}, {}, /could not execute/],
  ['CLI exit failure is not absence', {version: failure}, {}, /could not execute/],
  ['no Homebrew', {version: missing, brew: missing}, {}, /Homebrew is not available/],
  ['unsupported install', {version: missing}, {platform: 'linux'}, /macOS-only/],
  ['unsupported activation', {}, {platform: 'win32'}, /macOS-only/],
  ['noninteractive missing consent', {}, {yes: false}, /needs consent/],
  ['declined interactive start', {}, {yes: false, isTTY: true}, /cancelled/],
  ['declined install', {version: missing}, {yes: false, isTTY: true}, /cancelled/],
  ['host override', {}, {env: {CONTAINER_HOST: 'ssh://remote'}}, /overridden/],
  ['connection override', {}, {env: {CONTAINER_CONNECTION: 'remote'}}, /overridden/],
  ['unrelated remote default', {connections: [{...connection, URI: 'ssh://remote:1234/run/podman/podman.sock'}]}, {}, /Cannot safely identify/],
  ['no default', {connections: []}, {}, /Cannot safely identify/],
  ['multiple defaults', {connections: [connection, connection]}, {}, /Cannot safely identify/],
  ['identity mismatch', {connections: [{...connection, Identity: '/other'}]}, {}, /Cannot safely identify/],
  ['running machine with broken engine', {machines: [{...machine, Running: true}]}, {}, /running\/starting/],
  ['starting machine', {machines: [{...machine, Starting: true}]}, {}, /running\/starting/],
  ['another active machine', {machines: [machine, {...machine, Name: 'other', Running: true}]}, {}, /Another Podman machine/],
  ['connections without machine', {machines: []}, {}, /Existing Podman connections/],
  ['malformed listing', {machineJSON: '{}'}, {}, /Unexpected Podman listing/],
  ['listing command failure', {fail: 'podman machine list --format json'}, {}, /failed/],
]) test(name, async () => {
  const h = harness(options);
  await assert.rejects(h.invoke(extra), message);
  assert.deepEqual(h.mutations(), []);
});
test('root default maps to existing machine regardless of machine Default', async () => {
  const h = harness(); await h.invoke();
  assert.deepEqual(h.mutations(), ['podman machine start existing']);
  assert.equal(h.calls.at(-1).key, 'podman info');
});
test('modern CLI suppresses connection update explicitly', async () => {
  const h = harness({help: '--update-connection'}); await h.invoke();
  assert.deepEqual(h.mutations(), ['podman machine start --update-connection=false existing']);
});
test('fresh installation initializes then starts and verifies', async () => {
  const h = harness({version: missing, machines: [], connections: [], answer: true});
  await h.invoke({yes: false, isTTY: true});
  assert.equal(h.prompts.length, 3);
  assert.match(h.prompts[0], /native installer/);
  assert.deepEqual(h.mutations(), ['brew install podman', 'podman machine init podman-machine-default', 'podman machine start podman-machine-default']);
  assert.equal(h.calls.at(-1).key, 'podman info');
});
test('installed fresh machine setup does not install', async () => {
  const h = harness({machines: [], connections: []}); await h.invoke();
  assert.deepEqual(h.mutations(), ['podman machine init podman-machine-default', 'podman machine start podman-machine-default']);
});
test('default drift is detected and never automatically restored', async () => {
  const h = harness({afterConnections: [{...connection, Default: false}]});
  await assert.rejects(h.invoke(), /connections changed/);
  assert.deepEqual(h.mutations(), ['podman machine start existing']);
});
for (const fail of ['brew install podman', 'podman machine init podman-machine-default', 'podman machine start podman-machine-default']) test(`fails closed on ${fail}`, async () => {
  const h = harness({version: missing, machines: [], connections: [], fail});
  await assert.rejects(h.invoke(), /failed/);
  assert.equal(h.calls.at(-1).key, fail);
});
test('installation must expose CLI on PATH', async () => {
  const h = harness({version: missing, afterInstall: missing});
  await assert.rejects(h.invoke(), /podman --version failed/);
  assert.deepEqual(h.mutations(), ['brew install podman']);
});
test('start success alone is not readiness', async () => {
  const h = harness({finalInfo: failure});
  await assert.rejects(h.invoke(), /podman info failed/);
});
test('declined initialization makes no mutations', async () => {
  const h = harness({machines: [], connections: []});
  await assert.rejects(h.invoke({yes: false, isTTY: true}), /cancelled/);
  assert.deepEqual(h.mutations(), []);
});
test('declining start retains a completed initialization', async () => {
  const h = harness({machines: [], connections: []});
  let answers = 0;
  await assert.rejects(h.invoke({yes: false, isTTY: true, prompt: async () => ++answers === 1}), /cancelled/);
  assert.deepEqual(h.mutations(), ['podman machine init podman-machine-default']);
});
test('rootless default and multiple stopped machines reuse only selected machine', async () => {
  const h = harness({machines: [machine, {...machine, Name: 'other'}], connections: [{...connection, Name: 'existing', URI: 'ssh://core@127.0.0.1:1234/run/user/501/podman/podman.sock'}]});
  await h.invoke();
  assert.deepEqual(h.mutations(), ['podman machine start existing']);
});
test('all lifecycle entrypoints catch missing Podman without raw stack traces', () => {
  for (const args of [['start'], ['resume'], ['stop'], ['destroy', '--confirm-destroy']]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./local.mjs', import.meta.url)), ...args], {
      env: {...process.env, PATH: '', GUILD_LOCAL_PREFIX: 'pw-guild-preflight-test'}, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Local command failed: Podman is not on PATH/);
    assert.doesNotMatch(result.stderr, /\n\s+at /);
  }
});
test('CLI refuses invalid flags and unconfirmed destruction before preflight', () => {
  for (const args of [['destroy'], ['start', '--yes'], ['setup-podman', '--confirm-destroy'], ['bogus']]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./local.mjs', import.meta.url)), ...args], {
      env: {...process.env, PATH: '', GUILD_LOCAL_PREFIX: 'pw-guild-preflight-test'}, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:|requires --confirm-destroy/);
    assert.doesNotMatch(result.stderr, /not on PATH|\n\s+at /);
  }
});
