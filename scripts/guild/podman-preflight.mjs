/* global process, console, URL */
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';

const setupHint = 'Run node scripts/guild/local.mjs setup-podman (or setup-podman --yes without a TTY).';
export const command = (bin, args, {mutate = false} = {}) => spawnSync(bin, args, {
  encoding: 'utf8', timeout: mutate ? 20 * 60_000 : 30_000,
  // Never allow Podman itself to prompt to switch the default connection.
  stdio: mutate ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
});
async function confirm(message) {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  try {return /^y(es)?$/i.test((await rl.question(`${message} [y/N] `)).trim());}
  finally {rl.close();}
}
const ok = result => !result.error && result.status === 0;
function checked(run, bin, args, options) {
  const result = run(bin, args, options);
  if (!ok(result)) throw Error(`${bin} ${args.join(' ')} failed${result.error?.code ? ` (${result.error.code})` : ` (exit ${result.status})`}. Check the command manually; existing data was not reset.`);
  return result.stdout ?? '';
}
function list(run, args) {
  const value = JSON.parse(checked(run, 'podman', args));
  if (!Array.isArray(value)) throw Error('Unexpected Podman listing; inspect Podman configuration manually.');
  return value;
}

/** Readiness is read-only unless setup was explicitly requested and consented. */
export async function ensurePodman({setup = false, yes = false, platform = process.platform,
  env = process.env, isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  run = command, prompt = confirm, log = console.log} = {}) {
  const consent = async message => {
    if (yes) return;
    if (!isTTY) throw Error(`Setup needs consent: ${message}. Re-run setup-podman --yes, or use an interactive terminal.`);
    if (!await prompt(message)) throw Error('Podman setup cancelled; no further changes made.');
  };
  const version = run('podman', ['--version']);
  if (!ok(version)) {
    if (version.error?.code !== 'ENOENT') throw Error('Podman CLI exists but could not execute; check permissions/installation. No installation attempted.');
    if (!setup) throw Error(`Podman is not on PATH. ${setupHint}`);
    if (platform !== 'darwin') throw Error('Automatic Podman installation is macOS-only. Install Podman for your platform: https://podman.io/docs/installation');
    if (!ok(run('brew', ['--version']))) throw Error('Homebrew is not available. Install Podman manually from https://podman.io/docs/installation or install Homebrew yourself, then retry. Setup never installs Homebrew or uses sudo.');
    await consent('Install Podman using Homebrew (brew install podman)? Upstream recommends its native installer instead; Homebrew is community-maintained. Homebrew must already be installed; no sudo or Homebrew installation is performed');
    checked(run, 'brew', ['install', 'podman'], {mutate: true});
    checked(run, 'podman', ['--version']);
  }
  if (ok(run('podman', ['info']))) {
    if (setup) log('Podman is ready; no installation or machine changes needed.');
    return;
  }
  if (!setup) throw Error(`Podman is installed but its engine is unavailable (podman info failed). ${setupHint} Check podman info for connection details.`);
  if (platform !== 'darwin') throw Error('Podman is installed but unavailable. Automatic machine activation is macOS-only; check podman info and your platform setup.');
  if (env.CONTAINER_HOST || env.CONTAINER_CONNECTION) throw Error('Podman connection is overridden by CONTAINER_HOST/CONTAINER_CONNECTION. Repair that endpoint or explicitly unset the override; no local machine changes made.');
  const machines = list(run, ['machine', 'list', '--format', 'json']);
  const connections = list(run, ['system', 'connection', 'list', '--format', 'json']);
  let machine;
  if (!machines.length) {
    if (connections.length) throw Error('Existing Podman connections found without a local machine. Repair/select your connection manually; setup will not replace its default.');
    await consent('Initialize podman-machine-default (downloads a Linux VM and creates Podman connections)');
    checked(run, 'podman', ['machine', 'init', 'podman-machine-default'], {mutate: true});
    machine = {Name: 'podman-machine-default', Running: false};
  } else {
    const defaults = connections.filter(c => c.Default === true);
    // Match the effective root/rootless connection, never the machine Default flag alone.
    machine = defaults.length === 1 && machines.find(m => {
      const c = defaults[0];
      try {
        const uri = new URL(c.URI);
        return c.IsMachine === true && [m.Name, `${m.Name}-root`].includes(c.Name)
          && uri.protocol === 'ssh:' && ['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname)
          && String(m.Port) === uri.port && Boolean(m.IdentityPath) && c.Identity === m.IdentityPath;
      } catch {return false;}
    });
    if (!machine) throw Error('Cannot safely identify a local machine for the default connection. Inspect podman machine list and podman system connection list; select/repair manually. No defaults changed.');
    if (machine.Running || machine.Starting) throw Error('The selected Podman machine is running/starting but podman info failed. Repair the connection or wait and retry; setup will not restart/reset it.');
    if (machines.some(m => m.Running || m.Starting)) throw Error('Another Podman machine is active. Resolve it manually; setup will not stop or switch machines.');
  }
  const help = checked(run, 'podman', ['machine', 'start', '--help']);
  await consent(`Start Podman machine ${machine.Name} (existing default connection will be preserved)`);
  // New versions support an explicit no-switch flag; older versions receive non-TTY stdin.
  checked(run, 'podman', ['machine', 'start', ...(help.includes('--update-connection') ? ['--update-connection=false'] : []), machine.Name], {mutate: true});
  if (connections.length) {
    const after = list(run, ['system', 'connection', 'list', '--format', 'json']);
    const identity = rows => rows.map(({Name, URI, Identity, Default}) => ({Name, URI, Identity, Default})).sort((a,b)=>a.Name.localeCompare(b.Name));
    if (JSON.stringify(identity(after)) !== JSON.stringify(identity(connections))) throw Error('Podman connections changed during activation. Inspect them manually before proceeding; setup will not switch or restore defaults automatically.');
  }
  checked(run, 'podman', ['info']);
  log('Podman is ready. Run node scripts/guild/local.mjs start to start the guild stack.');
}
