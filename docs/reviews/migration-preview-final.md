# Independent final review — migration preview coherence

## Verdict

**PASS for the scoped fix `89eb10d`: no blocking specification or quality findings.** This is not whole-application approval. The unrelated live worktree changes, including the separate owner's crafting/backup work, were excluded from execution and not modified.

## Specification verification

- `src/features/CatalogMigrationPanel.tsx:33-69` reads metadata, retained snapshot bytes, workspace/stock, roster, routes and bases within one read-only transaction. It rejects a proposal whose `expectedRevision` differs before rendering. Selected-before and all calculations come from this capture; unpersisted candidate bytes are overlaid in memory only.
- `src/features/CatalogMigrationPanel.tsx:18-28,40,71-75,84-86` uses generation tokens to discard superseded file/comparison completions and removes the existing review when candidate or decisions change. A new candidate cannot reuse the old preview's acceptance button. Observed later revisions withhold comparisons, disable acceptance and clear legacy acknowledgement; observation failure also fails closed.
- `src/data/catalog-migration.ts:57-78` retains the private proposal and applies its candidate, not a mutable current UI candidate. `src/data/personal-db.ts:105-113` checks the expected revision inside the all-table write transaction. UI notification latency therefore cannot authorize a stale write. Migration unit tests exercise independent-connection conflicts, detached proposal mutation, transactional failure/retry and rollback preservation.
- `src/features/CatalogMigrationPanel.tsx:51-65` resolves route before/after snapshots by exact bindings and base context by captured selection/candidate. Missing bytes produce explicit unavailable comparisons, not a bundled fallback. Browser assertions exercise changed route pairs and base coverage, cancellation, adoption and rollback while retaining saved data.
- Queue-priority numeric deltas are computed from complete shared-stock workspace plans before per-goal projection (`src/features/CatalogMigrationPanel.tsx:43-50`), rather than allocating the same stock independently to each goal.

## Independent execution

Created a frozen archive directly from **`git archive 89eb10d`**, with dependencies symlinked, at:

`/var/folders/y1/m4mhk8x543n1ytmrgf9pv41m0000gn/T/palworld-preview-independent-fmjb0r1i`

The dedicated `playwright.migration-preview.config.ts` used **127.0.0.1:4398**, strict port binding and `reuseExistingServer:false`. No listener existed before execution, and none remained afterward. Playwright used fresh browser contexts rather than the user's browser profile/database. The frozen commit, not another worker's development server or current dirty sources, was tested.

| Check | Independent result |
|---|---|
| `node node_modules/@playwright/test/cli.js test --config playwright.migration-preview.config.ts --repeat-each=2` | **24 passed**: six scenarios, desktop Chromium and Pixel 7 emulation, repeated twice |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Scoped ESLint: panel, browser specification, dedicated configuration; `--max-warnings 0` | Passed |
| `npm test` | **37 files passed; 319 tests passed, 1 skipped** |
| `git diff 89eb10d^ 89eb10d --check` | Passed |

The browser run independently reproduced the deferred comparison/read race with a real second tab, rejection without mixed comparisons, explicit fresh review, later visible-preview invalidation, and unchanged export/history before acceptance. It also reproduced the deferred native file read superseded by bundled selection, verifying the old candidate did not return and preview/cancel left export, revision and history unchanged.

## Fixture correction assessment

**Legitimate correction, not weakened acceptance.** Direct inspection of the frozen bundled reference returned first species `SheepBall`, first suitability `Kindling: 0`, and first positive suitability `Handiwork: 1`. A minimum-one slot using the first key could never establish the intended covered baseline. Selecting a positive suitability makes the test actually prove **before 1/1 covered → after 0/1 covered** when candidate suitability becomes zero. The route fixture additionally removes a real pair and asserts its exact unsupported/changed warning. Unavailable-text assertions agree with explicit fail-closed behavior rather than accepting silent fallback.

## Quality and limits

No new blocking correctness, persistence, concurrency or scoped regression issue was found. Build emitted only mixed static/dynamic import chunking notices for workspace and Pal backup modules. The existing catalog-metadata skip remains a skip, not a pass. These results do not claim all unrelated end-to-end, remote-service or live-owner changes were verified.

Only this review report was created in the source repository; no application, test or configuration source was edited. Frozen build/test artifacts remain in the temporary archive; Playwright output uses the dedicated configuration's `/tmp/palworld-migration-preview-results` directory.
