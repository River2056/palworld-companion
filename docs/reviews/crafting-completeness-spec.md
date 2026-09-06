# Independent spec review: crafting completeness

**Commit:** `4e346a7` (reviewed against its first parent)
**Verdict: PASS** — no concrete gaps found against the delegated requirements.

## Scope and evidence

This is an independent spec-compliance review of the actual source/test diff and surrounding execution paths. The implementer's `docs/reviews/crafting-completeness.md` was not used as evidence. No code, configuration, or other review reports were edited; no commits were created.

The checkout is later than the reviewed commit and contains unrelated concurrent changes. `git diff 4e346a7 --` for `src/domain/planner.ts`, `src/domain/catalog.ts`, `src/features/Craft.tsx`, `src/features/Shopping.tsx`, `src/features/IngredientTree.tsx`, and `src/app/App.tsx` was empty, confirming the inspected implementation matches the review target.

## Requirement assessment

| Requirement | Assessment and evidence |
| --- | --- |
| Duplicate pin explicitly offers increase selected existing goal / separate / cancel | **PASS.** `src/features/Craft.tsx:28` detects existing goals for the selected recipe and renders one increase action per matching goal, a separate-pin action, and cancel. Opening the choice does not write; cancel only dismisses it. `src/features/Craft.tsx:15` changes only the goal whose ID was selected. |
| Preserve completed progress | **PASS.** `src/features/Craft.tsx:15` spreads the selected existing goal and changes only `quantity`; `completed`, notes, and identity remain unchanged. A separate goal starts at zero progress. `src/features/crafting-completeness.test.tsx:28-40` verifies preserving an existing goal's progress and notes. |
| Validate safe quantities and handle failure | **PASS.** Preview invokes the planner before enabling pinning (`src/features/Craft.tsx:23-24`); duplicate increase also checks safe integer addition (`:28`). `pin()` validates the entire proposed queue before calling update (`:15-19`), catching arithmetic overflow. `src/domain/catalog.ts:6` and `src/domain/planner.ts:15,36` reject invalid whole numbers and unsafe calculations. A false update result keeps the duplicate choice open; success alone clears it. The real app reports persistence failures, retains in-memory data on save failure, and disables controls while saving (`src/app/App.tsx:24-29,52,56`). The failure/overflow component test verifies the retained choice and unchanged original goal. |
| Recursive expandable ingredient tree, per-run/per-output ratios and rounded amounts | **PASS.** `src/features/IngredientTree.tsx:5-18` recursively renders native `details` disclosures, input counts per run and as a ratio per output unit, rounded runs/output, branch totals, and surplus. It explicitly distinguishes structure from stock-aware shopping totals and warns not to add parent/child quantities. `src/features/IngredientTree.test.tsx:6-12` exercises expansion and Arrow's rounded quantities. |
| Unknown/cycle guards | **PASS.** `src/features/IngredientTree.tsx:6-9` terminates cyclic, excessive-depth, and unknown branches with explanations. Safe arithmetic failures terminate with an explicit blocked message (`:10-16`). The synthetic unknown/cycle test exercises both guards (`src/features/IngredientTree.test.tsx:13-18`). |
| Per-goal provenance uses the shared allocation ledger, never independently subtracting stock | **PASS.** `src/domain/planner.ts:16-22,34-35` attaches the current goal's contribution within the same allocation operation that updates the aggregate row and consumes its ledger. The existing direct and expanded views retain their respective alternative ledgers, shared across the queue; attribution does not introduce per-goal inventory calculations. `src/features/Shopping.tsx:5-8` renders those contributions directly, including direct, raw, and intermediate rows, with queue-order attribution explained. `src/domain/planner-provenance.test.ts:5-15` verifies mixed-depth allocation, exclusion of completed goals, and contribution sums matching aggregate required/reserved/planned/missing values. |

## Independent verification

Executed successfully:

```text
npm test -- --no-cache src/domain/planner.test.ts src/domain/planner-provenance.test.ts src/features/IngredientTree.test.tsx src/features/crafting-completeness.test.tsx
Test Files  4 passed (4)
Tests       12 passed (12)
```

`git diff --check 4e346a7^ 4e346a7` produced no whitespace diagnostics. The subsequent exact report-path existence check returned false because this report did not yet exist; that was not a validation failure.

Inspected the new Playwright scenario in `tests/e2e/crafting-completeness.spec.ts:2-26`, covering expansion, increase/separate choices, stock attribution, and reload. Browser E2E was not rerun in this review. The reported parent-agent full-suite/typecheck/lint/build results were not treated as independent execution here. Cancel and choosing among multiple existing goals were verified by source inspection, not by dedicated interaction tests in the targeted suite.

## Gaps

None found within the specified compliance scope. This verdict does not assert exhaustive browser, accessibility, or general code-quality coverage.
