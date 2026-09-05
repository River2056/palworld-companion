# Personal Today actions review

## Delivered

- Each saved breeding route displays its named target and next incomplete saved step/child, with a contextual link using the existing `#/breeding` destination. It does not generate, save, or complete routes on navigation.
- Completed checklists explicitly mean manual progress, not verified offspring. Invalid graphs, empty steps, unknown completion IDs, missing/archived parents, unsupported reference IDs, and source/gender warnings remain reviewable instead of producing an unconditional completion claim. Invalid route data includes expandable saved references.
- Named base cards show uncovered work type, minimum level, priority, slot ID, capacity, and `#/bases` assignment links. Missing/archived workers, unknown species, unsupported slots, and invalid assignments prevent clean coverage claims. Empty slot lists mean unassessed coverage.
- A single Dexie liveQuery subscription updates personal actions. Read failure clears stale personal results, states progress/coverage are unknown, and offers retry. No external requests or personal mutations are introduced.
- Craft hero, Queue, Shopping, backups guidance, and opt-in Guild guidance remain present.

## Verification

- `npx vitest run src/features/today-actions.test.tsx src/app/App.test.tsx`: PASS (12), FAIL (0).
- `npm run typecheck`: passed.
- `npx eslint src/features/Today.tsx src/features/today-actions.test.tsx --max-warnings 0`: no issues.
- Added eight DOM tests using nonempty real Dexie/fake-indexeddb snapshots, including live writes, contextual link destinations and no navigation mutation, completed and empty states, corrupt checklists, named gaps, unknown IDs, archived parents, unsupported work IDs, valid coverage, and storage error/retry.
- Visual browser/viewport styling was not separately exercised; DOM behavior is tested.

## Scope and remaining gate

Only `src/features/Today.tsx`, `src/features/today-actions.test.tsx`, and this review are owned/changed for this work. Existing routes are module-level links; per-record routing was deliberately not invented. App, Guild, Pal domain/storage, Queue, and shared crafting state were not edited.

Authenticated Guild tasks on Today remain a separate pending gate. This implements the personal Today slice, not whole-dashboard completion. Reference suitability and breeding data remain historical/unverified; no speculative production or breeding rates are shown.
