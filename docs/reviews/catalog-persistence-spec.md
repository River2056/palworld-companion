# Independent catalog persistence spec review — 333c2eb

## Verdict: important gap; not an unconditional PASS

**P1 — original legacy Pal writers are not fenced after consolidation.** `src/data/personal-db.ts:34-47` adds a `consolidation` store/marker and upgrades the legacy DB, but that marker is not an enforceable read-only fence. Real Chromium execution reopened the exact original application's Dexie `version(1)` schema after consolidation and successfully updated the legacy Pal. Reading that exact source record confirmed `old-writer edit`. The consolidated destination retained `new-authority edit` after reopen because the destination metadata fast path prevents recopy. This protects the new authority from stale overwrites, but silently strands subsequent old-client edits; it does not prevent the old client from writing or continuing to believe its source is authoritative.

The test does **not** invent a supported old-tab compatibility layer. It recreates the schema and write operation from `git show 333c2eb^:src/features/pals/storage.ts`, using Dexie in an isolated actual browser. An independently held native legacy connection that declines `versionchange` separately proves that pending upgrade cannot report readiness: observed `DatabaseClosedError`, zero copied Pals/metadata, followed by successful retry after closing the blocker. This is fail-closed initialization, not post-consolidation writer fencing. Do not claim a version bump alone permanently disables old Dexie clients.

Required closure: either establish and test an actual supported old-client fencing/recovery contract, or explicitly narrow the product guarantee and surface the unsupported-old-client recovery risk. A marker unknown to old code is insufficient. No production fix was made by this reviewer.

## Historical retention: precise boundary, not an invented full-history requirement

`src/data/personal-db.ts:99-103` includes selected and currently scope-bound snapshots only. `WorkspaceStore.export()` (`src/data/workspace.ts:58`) and `PalStore.snapshot()` (`src/features/pals/storage.ts:8-10`) use that helper. After accepting migration A → B for all current records, both real-browser scoped exports contained only B. A still existed in the local registry and local rollback to A succeeded, preserving subsequent inventory, progress, notes, and route checklist edits. Thus:

- The original requirement in `docs/plans/palworld-companion-plan.md:229` — preserve the old snapshot until acceptance — is satisfied by this path.
- Local retained-history rollback is demonstrated; there is no observed premature deletion of A.
- History-only A is omitted from both scoped exports, and history rows are not serialized/restored. A fresh-device scoped restore cannot recreate that prior migration's rollback capability. This is a **specific backup portability limitation**, and a gap against the broader closure plan's explicit historical-backup promise, not evidence that the original plan requires a universal full-history backup format.
- Existing missing-digest recovery support remains distinct: preserving a reference without its bytes is intentional and does not reconstruct lost history.

## Verified storage behavior

- Existing data/Pal suite: **50 passing tests across 9 files** (`npm test -- src/data src/features/pals`). Covered selected-catalog binding and explicit root recipe for new goals, legacy import provenance, unknown snapshot recovery, scope isolation, corruption/count/byte rejection, and transactional restore failure.
- Independent Chromium test seeds labeled original `palworld-companion` craft and `palworld-companion-pals` Pal/base/route fixtures before any application boot. Tests use a blank intercepted same-origin page and dynamic production module imports, not UI internals or a default real-user reset.
- Injected final consolidation metadata failure aborts copied tables, snapshot registration and marker creation in the destination; retry preserves favorite, base membership, route checklist, exact legacy source claim, unknown IDs and craft notes. Reopening destination does not recopy subsequently divergent source data.
- Injected final migration-history write failure leaves a byte-for-byte all-table dump unchanged. The same private proposal is retryable despite mutation of its returned `changes` array. A second connection's revision change rejects stale acceptance.
- Accept and rollback preserve later inventory quantity, goal progress/notes and route checklist updates, while reverting bindings/selection. The old snapshot is still resolvable locally.
- Direct TypeScript and scoped ESLint CLIs exited zero. Reviewed persistence files have no diff between 333c2eb and checked-out 5f164de.

## Browser test result and reproduction

New file: `tests/e2e/catalog-persistence.spec.ts`.

**Two ordinary passes and one explicitly expected failure** (the reproduced legacy fencing defect). Playwright's aggregate prints `3 passed`, but its JSON reports the first test `expectedStatus: failed`, actual `failed`; this is **not** three satisfied acceptance criteria. `test.fail` is set only after the consolidation/idempotence checks pass, immediately before the fencing assertion. Remove it when implementing the fence so an unexpected pass demands updating this regression.

Measured on isolated Vite port **55337**, with `reuseExistingServer: false`, one Chromium worker and separate temporary outputs. The first requested port 4289 was occupied; it was not reused or stopped. Final measured browser execution: approximately 1.5 seconds; zero unexpected outcomes.

Reproduction using the generated isolated configuration:

```sh
node node_modules/@playwright/test/cli.js test \
  --config /var/folders/y1/m4mhk8x543n1ytmrgf9pv41m0000gn/T/catalog-persistence-review-iPguJZ/playwright.config.cjs \
  --reporter=list
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js tests/e2e/catalog-persistence.spec.ts
```

JSON evidence is beside that config in `review-result.json`; browser artifacts are in its `results/`. To reproduce elsewhere, configure this test file with a disposable Chromium context, a fresh localhost Vite port, and a separate output directory. No application boot is needed for these storage tests. The direct Playwright CLI was used to bypass an `npx` execution path that returned condensed `PASS (3) FAIL (0)` text even with the JSON reporter requested.

## API/integration boundaries for parent

Numeric direct/raw, batches/output/surplus and breeding recommendation deltas remain a pending UI/projection integration capability; this review does not mislabel their absence in the storage preview as a persistence regression. Whole-workspace save conflict protection is opt-in via `expectedRevision`; migration acceptance always requires its revision. A blocked legacy connection currently rejects readiness and can retry, but application-level blocked recovery messaging is outside this storage verification. No active UI-worker files, production files, existing tests, or other agents' work were changed; no commits were created.
