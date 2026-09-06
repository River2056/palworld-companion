# Guild browser contract recovery

## Result

**PASS: 8/8 cases, zero retries**, against a newly frozen current working-tree source copy at `/tmp/palworld-guild-recovery-frozen` (HEAD when copied: `89eb10d2ea1dd8eaa3b674dc9acae100ebf810f6`). This replaces the obsolete production code in the earlier reconcile copy; production was copied once and not edited. Only the owned publication fixture was recopied after adding its persisted semantic checksum assertion.

- Desktop and mobile Playwright projects each run publication at 1280px and 390px, personal cross-module integration, and real Guild integration.
- Final execution: **8 passed (13.2s)**. JSON evidence: `/tmp/palworld-guild-recovery-results.json`; output directory: `/tmp/palworld-guild-recovery-artifacts`.
- Dedicated Vite server: `127.0.0.1:4389`, strict port, no server reuse. Default real Auth/PostgREST endpoints: `127.0.0.1:55431` and `127.0.0.1:55432`.
- Explicit absolute default config path; inherited `GUILD_LOCAL_PREFIX`, `GUILD_DB_CONTAINER`, `GUILD_BROWSER_URL`, and `GUILD_BROWSER_CONFIG` removed from runner environment. No credentials printed, no backend reset or migrations performed. This legacy default stack has no `guild_local.migrations` ledger; passing browser behavior is not proof of its historical migration checksums.

## Corrected fixture contracts

1. Seed Cloth from the **selected stored catalog snapshot**, with its actual output item, explicit recipe ID and bound snapshot ID. Use the captured workspace revision for saving; do not fabricate a bundle-derived source binding.
2. Await the publication picker, which exists only after `usePublicationSources` has settled its live-query projection/hash. Assert v2 requirement identity and semantic SHA-256 in both the preview and persisted server task. Real publication and explicit source updates pass through production `assertCurrent`; no hook or RPC mocks are installed.
3. An already loaded requirement is handled by GuildWorkspace's local duplicate guard, not a server create conflict. The test now asserts its exact preservation notice, focused existing task, **zero additional mutation requests**, and complete unchanged server task. Explicit coordinated source replacement remains required.
4. Actual task and stock revision conflicts remain fully exercised, including a second real concurrent edit after conflict reload, renewed consent, revision 3 reapply, and final revision 4 readback. No conflict assertions were weakened.
5. SPA navigation intentionally retains the memory-only Guild session. Integration now verifies that contract and then verifies a full document reload clears the session and loaded private tasks.
6. Preserve the earlier fixture corrections for honest unconfigured base coverage and explicit endpoint-config overrides.

## Preserved coverage and findings

The passing publication cases retain consent, exact payload privacy, nonpersisted password/token checks, changed-source/assignee preservation, source removal, offline recovery without mutation enqueue, before-only owner activity details, real member revocation and private-data purge, and overflow/page-error assertions.

The earlier `/tmp/palworld-reconcile-batch2.json` failures were obsolete expectations: publication waited for a conflict UI despite local duplicate preservation, and integration expected SPA navigation to destroy its session. Latest `/tmp/palworld-reconcile-results.json` concerned an unrelated route blocker; `/tmp/palworld-reconcile-artifacts` retained only `.last-run.json`. Neither was treated as current Guild evidence.

**No production defect reproduced in this narrow recovery.** Production code was not modified. Broader browser suites and backend migration-history validation are outside this result.

## Reproduction

From the frozen copy:

```sh
env -u GUILD_LOCAL_PREFIX -u GUILD_DB_CONTAINER \
  -u GUILD_BROWSER_URL -u GUILD_BROWSER_CONFIG \
  GUILD_E2E=1 \
  GUILD_E2E_CONFIG=/Users/tungchinchen/projects/palworld-companion/scripts/guild/.local/config.json \
  npx playwright test --config playwright.recovery.config.ts
```

The temporary runner config covers only `guild-publication.spec.ts` and `integration.spec.ts`, with four workers, zero retries and both Chromium device projects. `git diff --check` passes for both owned specs.
