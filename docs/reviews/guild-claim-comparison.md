# Scoped verification: Guild claim conflict comparison

## Outcome

**PASS for the claim-preview gap identified in `guild-publication-spec.md`.** This is not full publication, semantic snapshot, backend, or privacy acceptance.

`proposedTask` now takes the authenticated actor explicitly. For `claim`, it copies the loaded task and changes only `assignee` to that actor and `status` to `doing`. Claim edit parameters are ignored, matching `mutate_task` in `supabase/migrations/202609060005_task_details.sql:62-64`. No stale task assignee is used as an identity fallback. Update projection retains its existing null-coalescing behavior.

The comparison explains that revision/timestamps are loaded context rather than predicted saved metadata. It remains an intended-field preview, not a synthetic server response or authorization promise. Already-assigned and closed-task claims still show the requested intent, alongside the existing cannot-reapply warning and disabled confirmation.

## Actor propagation / integration

`GuildWorkspace.tsx` already supplies `user={session.user.id}` to `ConflictComparison`. The component now passes that required prop to `proposedTask`. **No GuildWorkspace edit, new prop, optional fallback, or parent integration patch is required.** The server still independently obtains identity from `auth.uid()`; this change does not put an assignee into an outbound payload.

## Action consistency

- **Claim:** authenticated actor + `doing`, regardless of edit fields in the rejected input; only unassigned, nonclosed tasks are eligible for explicit reapply.
- **Update/cancel/reopen:** retain the loaded assignee while applying requested status and edit fields, matching migration 005's update statement. Setting `open` is not claim release; setting `cancelled` does not clear assignment.
- **Release:** there is no `release` TaskInput action. Membership removal releases active claims server-side (`202609060007_owner_activity.sql`, `remove_member`), setting assignee null/status open. The regression checks a loaded released task can be previewed as a new claim by the signed-in actor. No unsupported action or new release API was invented.
- **Stock/create/rebase:** transport and reapply semantics are unchanged. Existing update/stock key/revision tests remain passing.

## Executed evidence

- `./node_modules/.bin/vitest run src/features/guild/conflicts.test.ts src/features/guild/ConflictComparison.test.tsx --maxWorkers=1`: **2 files, 19 tests passed**.
- `./node_modules/.bin/vitest run src/features/guild --maxWorkers=1`: **9 files, 38 tests passed** in the shared worktree (the preceding review recorded 8 files / 20 tests; this patch adds 18 tests).
- `npm run typecheck`: passed.
- Scoped ESLint over all four changed source/test files with `--max-warnings 0`: passed.
- Scoped `git diff --check`: passed.

Rendered jsdom assertions parse current and proposed JSON separately; exercise member and owner claim previews; block already-assigned, done, and cancelled claims; require checkbox plus explicit confirmation; cover disconnected/busy disabling and discard; preserve owner/non-assignee update gating; verify cancellation/reopening preserves assignment. Frozen helper inputs cover ignored claim edit fields, all update statuses, zero/empty values, null/omitted fields, and absence of mutation. Rendering or checking consent alone never calls confirmation.

## Files and limits

Changed `src/features/guild/conflicts.ts`, `ConflictComparison.tsx`, and `conflicts.test.ts`; added `ConflictComparison.test.tsx` and this report. No GuildWorkspace, publication semantic APIs, App/storage, SQL, transport, or other worker files were edited or staged.

No browser E2E or live database tests were run; no backend was started. Server semantics were verified by source inspection, with pure helper and rendered DOM regressions executed locally. Tests use the shared checkout, not a hermetic commit checkout. Semantic catalog freshness and the other wider publication-review coverage notices remain outside this signoff.
