# Responsive queue recovery acceptance

## Result

Recovered the saved implementation rather than restarting it. Desktop Craft has one queue beside its working area; compact viewports (1100px and below) use the dedicated `#/queue` navigation destination. Craft and Queue keep the same mounted owners while switching between those destinations, preserving unsaved inputs without duplicate queue editors. Hidden Craft is inert on the queue screen.

The eight existing E2E specifications were adapted to navigate to the visible compact queue without dropping their previous persistence, revision, backup, or privacy assertions. The previous integration and Pal-backup navigation failures are now verified passing. No further production changes were needed during recovery.

## Executed verification

- Full Playwright suite with real Guild enabled: **82 passed, 0 skipped, 0 failed, 0 flaky**, zero retries, four workers, 34.185 seconds. Both desktop Chromium and Pixel 7 projects included. JSON: `/tmp/pal-full-responsive-recovery.json`; artifacts: `/tmp/pal-full-responsive-recovery-artifacts`.
- Dedicated responsive suite: **4 passed, 0 skipped, 0 failed**, 3.359 seconds. JSON: `/tmp/pal-responsive-recovery.json`; attachments: `/tmp/pal-responsive-recovery-artifacts`.
- Responsive assertions cover desktop horizontal placement, compact navigation, queue deep-link reload, Craft and Queue drafts across navigation and resizing, saved note persistence, 320px overflow, and duplicate DOM IDs.
- TypeScript, ESLint (zero warnings allowed), production build: passed.
- Vitest: **37 files passed; 319 tests passed, 1 skipped**, 6.62 seconds. Log: `/tmp/pal-responsive-recovery-unit.log`.
- `git diff --check`: passed.

Real backend prerequisites returned HTTP 200: Auth `http://127.0.0.1:55431/health` and PostgREST `http://127.0.0.1:55432/`. Explicit config: `scripts/guild/.local/config.json`. Inherited alternate backend/browser variables were removed for the run. No backend reset or migrations were performed. The real-browser suite exercises existing revision conflicts, publication privacy and revocation contracts, not just layout.

## Shipped fuzzy-search measurements

Actual mounted Craft UI and Fuse results, using `arow`, `ingot`, `pal spere`, `nail`, `cloth`. Each result is asserted to contain its expected recipe. Five warmups followed by 30 measured samples per project; two animation frames after the input event include a render/paint opportunity.

| Project | Median | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Desktop 1440px | 34.00 ms | 37.50 ms | 38.60 ms |
| Pixel 7 emulation | 33.60 ms | 38.20 ms | 39.20 ms |

Selected reference: `crafting-reference-v1+palcalc-v1.20.2-small-reference`, fingerprint `sha256:0af6496e2e63f81a41340e8762bdd03ac2912fe1c04c857931ed993469384ebf`. These are local development-browser measurements including frame scheduling, not isolated Fuse CPU costs, production-bundle timings, physical-mobile measurements, or a large/full-catalog benchmark. The reference remains explicitly unverified for current game-patch compatibility. Raw samples and selected-reference disclosure are in JSON reporter stdout and `search-latency.json` test attachments.

## Reproduction

From the repository root (direct CLI entry points avoid terminal output summarizers):

```sh
env -u GUILD_LOCAL_PREFIX -u GUILD_DB_CONTAINER \
  -u GUILD_BROWSER_URL -u GUILD_BROWSER_CONFIG \
  GUILD_E2E=1 \
  GUILD_E2E_CONFIG=/Users/tungchinchen/projects/palworld-companion/scripts/guild/.local/config.json \
  node node_modules/@playwright/test/cli.js test --workers 4 --retries 0 \
  --output /tmp/pal-full-responsive-recovery-artifacts --reporter json \
  > /tmp/pal-full-responsive-recovery.json
node node_modules/@playwright/test/cli.js test \
  --config playwright.responsive.config.ts \
  --output /tmp/pal-responsive-recovery-artifacts --reporter json \
  > /tmp/pal-responsive-recovery.json
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings 0
node node_modules/vite/bin/vite.js build
node node_modules/vitest/vitest.mjs run
```

## Remaining limitations

Build reports existing mixed static/dynamic import chunking warnings for `workspace.ts` and `pals/backup.ts`; no build errors. The unit suite retains its existing one skipped metadata test. Parent-owned plan/status documents and unrelated untracked files were left untouched and excluded from this delivery. No push performed.
