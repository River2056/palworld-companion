# Local guild stack

Prerequisites: Node.js, a ready Podman engine, and the repository dependencies for linting. Services bind only to `127.0.0.1`; PostgreSQL has no host port.

## Opt-in Podman setup (macOS)

```sh
node scripts/guild/local.mjs setup-podman        # asks before install, VM init, and VM start
node scripts/guild/local.mjs setup-podman --yes  # explicit consent for unattended setup
node scripts/guild/local.mjs start              # separate: starts the guild services
```

`setup-podman` first checks the CLI and `podman info`. An already-ready engine is a **read-only no-op**, with no prompt, installation, machine changes, or guild startup. Ordinary `start`/`resume`/`stop`/`destroy` perform read-only preflight and fail with setup guidance when unavailable; they never install or activate Podman implicitly. `--yes` is accepted only for `setup-podman`, and never authorizes guild data deletion.

On macOS, if the binary is missing from PATH, setup offers `brew install podman` using **already-installed Homebrew**. The [official installation guide](https://podman.io/docs/installation) supports this command but recommends its native installer instead and does not recommend community-maintained Homebrew packaging. You can install the native package yourself and rerun setup. This script never installs Homebrew, runs sudo, installs a privileged helper, or upgrades an existing Podman installation. A broken CLI or failed engine connection is not treated as a missing installation. Newly installed Podman must be available on the current PATH.

With no machines **and no existing connections**, setup asks to initialize `podman-machine-default` (downloads a Linux VM and adds connections), then asks to start it. Otherwise it reuses only the stopped local machine matching the existing default connection, including rootful `-root` connections. It refuses ambiguous/remote defaults, overridden `CONTAINER_HOST`/`CONTAINER_CONNECTION`, another active machine, or a running machine whose engine is unreachable. Resolve those manually using `podman info`, `podman machine list`, and `podman system connection list`; setup never stops, removes, resets, or silently switches machines/connections. Run setup serially with other Podman configuration operations.

Activation uses the documented [`machine init`](https://docs.podman.io/en/latest/markdown/podman-machine-init.1.html) and [`machine start`](https://docs.podman.io/en/latest/markdown/podman-machine-start.1.html) commands. It feature-detects `--update-connection=false`; older Podman versions (including 5.5.0) get non-interactive stdin instead. Existing connection settings are checked after activation, and final `podman info` must succeed. Failures retain any completed installation/initialization for retry; no rollback or destructive repair is attempted. Read-only commands time out after 30 seconds, installation/VM commands after 20 minutes.

Without `--yes`, mutations require both stdin and stdout to be TTYs and an affirmative answer (default is no). On Linux/Windows, an already-ready engine works, but installation/activation is manual via the official guide.

Deterministic setup/preflight tests (injected commands, platform and prompts; no real installation or VM mutation):

```sh
node --test scripts/guild/podman-preflight.test.mjs
```

## Guild lifecycle

```sh
node scripts/guild/local.mjs start
node scripts/guild/local.mjs stop
node scripts/guild/local.mjs resume
```

`stop` preserves containers, the network, credentials and database. New stacks keep PostgreSQL in a named `<prefix>-data` volume; even removing/recreating their containers retains users and guild data. `start` is repeatable and also resumes a managed stack. Saved ports and credentials are reused, not replaced. The generated anonymous key expires after one day; `start`/`resume` refreshes it without rotating the JWT secret.

Startup waits for Auth's schema initialization, then applies **every** `supabase/migrations/<digits>_<name>.sql` file in filename order. Each migration and its SHA-256 ledger entry commit together. Applied files are not replayed; changing/removing an applied file or adding a migration before an applied version fails explicitly. Migration files must have an outer `begin;`/`commit;` pair. Run lifecycle commands serially per stack.

State/config/env files live in ignored `scripts/guild/.local/`, with owner-only permissions for newly created files. Preserve these together with the database volume. Failed startup retains state for retry.

## Isolated fresh verification (does not migrate the existing user stack)

```sh
node scripts/guild/lifecycle-integration.mjs
```

This creates a random prefix and temporary loopback ports, applies the complete migration directory, runs the guild/owner/details/cursor integration suites, checks stop/resume and repeated start, then deletes and recreates **its own containers** to prove named-volume persistence. It checks retained users, a database sentinel, credentials and the migration ledger. Finally it destroys only its random stack and verifies cleanup plus unchanged existing `pw-guild-local` container IDs/start times/state/config. If another process restarts that stack concurrently, the unchanged-state assertion deliberately fails.

For a separate manually managed stack:

```sh
export GUILD_LOCAL_PREFIX=pw-guild-sandbox
export GUILD_AUTH_PORT=55531 GUILD_REST_PORT=55532
node scripts/guild/local.mjs start
node scripts/guild/integration.mjs
node scripts/guild/owner-integration.mjs
node scripts/guild/details-integration.mjs
GUILD_DB_CONTAINER="$GUILD_LOCAL_PREFIX-db" node scripts/guild/cursor-integration.mjs
node scripts/guild/local.mjs stop
```

Non-default config is `.local/<prefix>/config.json`. The three API integration suites honor `GUILD_LOCAL_PREFIX`; the cursor suite uses `GUILD_DB_CONTAINER` and its own temporary database.

## Legacy stacks

Stacks made by the earlier script have no saved migration ledger and may have manually applied migrations. `start` refuses to guess their schema or overwrite their credentials. `stop` remains non-destructive; `resume` restarts their existing containers without changing their schema (the legacy branch does not perform readiness checks). Use an isolated fresh stack for full-migration verification. Legacy data remains in the existing database container rather than a named volume; do not remove that container. Deliberate legacy migration/adoption needs a separate backup-and-baseline procedure, not automatic migration replay.

## Intentional deletion

Only when you intend to delete the selected stack and all of its data:

```sh
GUILD_LOCAL_PREFIX=pw-guild-sandbox node scripts/guild/local.mjs destroy --confirm-destroy
```

Without `--confirm-destroy`, deletion is refused. Omitting `GUILD_LOCAL_PREFIX` targets `pw-guild-local`; never omit it when cleaning up a test stack. No global prune is used.
