// Compatibility entry point; permanent assertions live in the normal E2E suite.
// Explicit GUILD_E2E=1 is required; no backend reset or fixed existing account.
import { spawnSync } from 'node:child_process';
import process from 'node:process';
const result = spawnSync('npx', ['playwright', 'test', '--config=playwright.guild.config.ts', 'today-guild.spec.ts'], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
