# Independent code-quality review: crafting completeness

**Review:** `4e346a7` → first parent (`4e346a7^`)
**Verdict: APPROVED**
**Critical findings:** None. **Important findings:** None.

## Scope

Reviewed the actual commit diff and surrounding `Craft.tsx`, `Shopping.tsx`, `IngredientTree.tsx`, `domain/planner.ts`, catalog validation, workspace persistence, application save coordination, styles, and relevant unit/component/E2E tests. The inspected implementation files match `4e346a7` (`git diff 4e346a7 --` for the four primary files plus `domain/catalog.ts` and `app/App.tsx` was empty). Unrelated working-tree changes were not altered.

## Assessment

- **Duplicate decisions and progress — sound.** `src/features/Craft.tsx:14-20,27` opens an explicit choice without writing, merges only the chosen ID, preserves `completed`, notes, and identity through object spread, or creates a new goal with zero completed progress. Cancel only closes the choice. Multiple existing goals each receive their own action. A false save result does not dismiss the choice.
- **Save coordination — sound in the application integration.** Although `Craft` does not own a pending flag, `src/app/App.tsx:24-29,56-58` supplies a synchronous ref-based single-writer guard and disables workspace form controls while persisting. This prevents overlapping pin/queue/inventory writes within this app instance; the lack of a component-local guard is not independently a defect. State is refreshed from storage after saving, and failures surface in the application alert (`:52`). This is not a claim of cross-tab transactional merge protection, which the existing whole-workspace persistence API does not provide.
- **Arithmetic — guarded.** `src/features/Craft.tsx:17-18,23-24,27` validates the complete proposed plan before persistence, checks unsafe duplicate addition, and disables pinning for an invalid preview. `src/domain/planner.ts:15,21-22,36,42,48,55` uses safe-integer validation for accumulated contributions, aggregates, products, and progress. A completed goal near the safe-integer limit cannot overflow through the merge action.
- **Allocation provenance — correct.** `src/domain/planner.ts:16-22,34-35` records contribution values in the same allocation operation that consumes the relevant shared ledger and updates the aggregate row. No independent per-goal stock subtraction was introduced. The current goal ID remains stable throughout synchronous recursive expansion. Direct and expanded views remain intentionally alternative ledgers, not additive shopping totals. Completed goals are skipped before allocation. `src/features/Shopping.tsx:5-8` displays the resulting contribution records rather than recalculating shortages and explains queue-order attribution.
- **Ingredient expansion — guarded and appropriately distinguished.** `src/features/IngredientTree.tsx:5-18` terminates cycles, unknown branches, excessive depth, and unsafe recipe calculations, while showing run rounding, branch surplus, and per-run/per-output ratios. Its explanatory text explicitly excludes stock allocation and cross-branch surplus reuse, avoiding a misleading second shopping total.
- **Accessibility and layout — no blocking source issue found.** Native `details`/`summary` elements provide keyboard-operable disclosures (`src/features/IngredientTree.tsx:14,17`; `src/features/Shopping.tsx:5`), and duplicate actions are native named buttons in a labelled region (`src/features/Craft.tsx:27`). Error text uses alerts. Wrapping rules and constrained indentation cover long tree/provenance content (`src/features/crafting.module.css:1-5`, `src/app/styles.css:19-21`). This source review is not a complete assistive-technology audit.

## Non-blocking observations

### [PERF] Expansion and attribution will need indexing/lazy rendering if the data grows

**Files:** `src/features/IngredientTree.tsx:5-14,17`; `src/domain/planner.ts:19-20`; `src/features/Shopping.tsx:5`.

**Problem:** Tree construction eagerly traverses descendants even when disclosures are closed. The depth guard limits recursion depth, not total branching work. Contribution lookup uses an array scan per allocation, and rendering scans the goal queue per contribution, leading to quadratic queue work for many goals sharing a material. The current small, bundled catalog makes tree expansion bounded in actual use; no current-user performance blocker was established.

**Recommendation:** When expanding catalog/queue scale, use item and goal maps, index contributions by goal ID, and render children on disclosure expansion with an explicit node budget. Preserve queue order and the shared allocation operation rather than replacing attribution with independent plans.

### [NOTICE] Additional focused regression tests would strengthen existing coverage

**Files:** `src/features/crafting-completeness.test.tsx:18-41`; `src/features/IngredientTree.test.tsx:13-18`; `src/domain/planner-provenance.test.ts:5-15`.

The new tests cover ordinary merge/separate behavior, retained progress, failed writes, completed-goal overflow, cycle/unknown termination, and contribution partitioning. Cancel-with-no-write, selecting the second of multiple matching goals, depth-limit/unsafe-tree messages, and delayed-save interaction through the real application guard are not dedicated cases in this targeted suite. Source inspection found these paths consistent with their intended behavior; add tests as follow-up protection. Dense one-line JSX also makes future control-flow changes harder to review; extracting the duplicate-choice and contribution disclosures would improve maintainability without changing behavior.

## Independent verification

Executed in the repository:

```text
npm test -- --no-cache src/domain/planner.test.ts src/domain/planner-provenance.test.ts src/features/IngredientTree.test.tsx src/features/crafting-completeness.test.tsx
Test Files  4 passed (4)
Tests       12 passed (12)
```

`git diff --check 4e346a7^ 4e346a7` passed without diagnostics. The parent's reported full suite, typecheck, lint, build, and desktop/mobile browser results were not substituted for source inspection and were not rerun as part of this review.

## Verdict

| Category | Result |
| --- | --- |
| Blocking critical/important issues | None found |
| Non-blocking follow-ups | Scale-oriented indexing/lazy rendering; focused edge-case tests; JSX decomposition |
| Recommendation | **APPROVED** for the reviewed scope |

Only this review report was written; no source edits or commits were made.
