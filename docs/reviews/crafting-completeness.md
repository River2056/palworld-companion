# Crafting completeness review

## Scoped specification verdict: PASS

- Duplicate recipe pins now require an explicit choice: increase a selected existing goal, create a separate pin, or cancel. Increase preserves ID, notes and fulfilled progress; completed goals may be reopened by increasing target units. Safe integer addition and the combined planner are validated before persistence. Failed writes retain the choice.
- Selected recipes expose a recursive, native-details ingredient tree. Each recipe shows requested units, output per run, rounded runs, output and surplus; edges show per-run, exact per-output-unit ratios and branch quantities. Unknown nodes, cycles, excessive depth and unsafe quantities stop with explanations. Tree quantities are explicitly structural, not inventory-adjusted shopping totals; no parent/child summation is suggested.
- Direct, raw and intermediate material disclosures show active contributing goals, with required/reserved/planned/missing values from the SAME allocation operation as the corresponding aggregate row. Stock is never independently subtracted per goal. Queue-order attribution is explicit. Finished goal output and intermediate surplus reuse semantics are unchanged.

## Quality verdict: PASS within crafting scope

Vertical red/green slices exercised public planner and React interaction seams. Regression coverage includes mixed-depth shared ore allocation, completed-goal exclusion, conservation of each contribution field across all ledgers, partial-progress merge, separate pin, completed target overflow, failed persistence, recursive batch quantities, unknown and cyclic trees, UI material attribution, and browser persistence.

Actual execution:
- `npx vitest run src/domain src/data src/app/App.test.tsx src/features/crafting-completeness.test.tsx src/features/IngredientTree.test.tsx src/features/crafting-recovery.test.tsx`: **22 passed, 0 failed**.
- `npm run build`: TypeScript succeeded; Vite built 59 modules successfully.
- Scoped ESLint: **No issues found**.
- `git diff --check`: clean.
- Playwright crafting existing + completeness scenarios: **6 passed (3.9s)** across desktop Chromium and Pixel 7 Chromium, including overflow checks and real reload persistence.

Execution issues resolved: default Playwright port 4173 collided with a concurrent worker; final run used an ephemeral config against existing loopback dev server 5173 with isolated `/tmp/palworld-crafting-completeness-results` output. The temporary config was removed. Existing crafting E2E's loose Backup JSON label became ambiguous after an unrelated Pal backup control was added; scoped test now selects the exact textbox role. No App, Guild, Pals, catalog, shared styles, or package changes were made. This review is not a whole-product verdict.
