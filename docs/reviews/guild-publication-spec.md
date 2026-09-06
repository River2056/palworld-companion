# Independent spec review: Guild publication and conflict review

**Target:** `d587c9e` against its first parent. Source inspected read-only; only this report was written.

## Verdict

**Quantity-publication/update-conflict slice: PASS, with the claim-preview gap below. Not a blanket full-publication signoff.** Explicit selection, consent, payload projection, stable requirement identity, duplicate-active handling, quantity reconfirmation, update/stock conflict rebasing, offline read-only behavior, confirmed-revocation purge, before-only activity rendering, and the attribution link are implemented. The claim conflict comparison is not a faithful proposed-state preview. Semantic catalog snapshots remain explicitly deferred.

## Findings

### [BUG] Claim conflict's proposed values omit the actual claim changes

**Files:** `src/features/guild/ConflictComparison.tsx:7-10`; `src/features/guild/conflicts.ts:11-12`.

```ts
const next = /* task with current values */ proposedTask(proposal.input, current as Task);
```

**Problem:** `proposedTask` overlays edit fields but never applies claim semantics. A rejected claim against an unassigned task can be reloaded and reapplied, yet its “Proposed values” JSON still displays `assignee: null` and the old status. The actual server claim sets the signed-in user and `status='doing'` (`supabase/migrations/202609060005_task_details.sql:62-64`). The separate “claim for your signed-in user” sentence discloses the action, but does not make the displayed proposed status/assignment accurate. This is a bounded comparison-accuracy gap, not evidence of a silent mutation or authorization bypass.

**Recommendation:** Project the claim's actual assignee and status into the proposed view, or use an explicit action-specific delta instead of labeling an unchanged task as proposed values. Add a rendered claim-conflict test for unassigned/current role state and the disabled already-claimed case. `conflicts.test.ts:4-14` covers update and stock rebasing, not this claim branch.

### [NOTICE] Deferred semantic-snapshot gap prevents full publication acceptance

**File:** `src/features/guild/publication.ts:14-15,21-25`.

```ts
checksum: `quantity-v1:${quantity}`
```

The identity binds goal, kind and item, while freshness compares checksum and requested quantity. A catalog recipe/provenance/ingredient change that preserves the selected quantity is invisible. This is the known deferred snapshot work, not a newly discovered regression. Quantity-only acceptance must not be presented as completion of semantic catalog/snapshot freshness.

### [NOTICE] Privacy and interaction coverage is narrower than test names suggest

- `publication.test.ts:6-16` seeds private notes/recent markers, compares allocated shortage quantity and identity across a stock change, and checks that the marker is absent. It does not seed a private Pal roster or assert the complete outbound payload.
- `tests/e2e/guild-publication.spec.ts:18,36-39` seeds private notes with empty stock, checks the note is absent from mutation payloads, and asserts an exact mutation-key allowlist. This is meaningful outbound-shape coverage, but not an all-request-body privacy audit or a populated roster/inventory sentinel scenario.
- `PublicationPicker.test.tsx:5-16` checks selection, consent and a guild change. Despite its title, it does not rerender a changed source. The implementation's keyed consent child (`PublicationPicker.tsx:6`) does reset consent for changed source fields.
- Browser offline coverage (`tests/e2e/guild-publication.spec.ts:77-85`) occurs after local goals were removed and checks shared-stock write disabling/no mutation. It does not exercise clicking a selected publication while offline. Shared fieldset disabling is present at `GuildWorkspace.tsx:178`.

**Recommendation:** Add populated private inventory/roster markers, source-change consent reset, selected-publication offline, and claim-preview assertions. These are coverage gaps; code inspection found no automatic export of stock, notes or roster.

## Requirement evidence

| Requirement | Independent observation |
|---|---|
| Selected goal or allocated shortage only | `publication.ts:8-18` projects recipe pins and per-goal direct missing contributions; `PublicationPicker.tsx:5-10` requires a selection and unchecked consent before publishing. Pins explicitly copy full goal quantity rather than remaining progress. |
| Exact preview, no private workspace export | `PublicationPicker.tsx:10` previews shared task fields; `GuildWorkspace.tsx:127-128,178` builds an explicit scalar RPC payload with empty description and zero delivered quantity. Neither the workspace nor stock/notes/roster objects are passed to the transport. Shortage quantity intentionally derives from local allocation; that consented derived value is not an inventory export. |
| Stable identity and duplicate-active behavior | `publication.ts:12` uses `[goal,kind,item]`, independent of quantity. Migration `202609060005_task_details.sql:10,46-54` serializes requirement operations and returns an existing active task for the same checksum, or raises `PT409` on changed checksum. `ConflictComparison.tsx:9-10` disables create reapply and links/focuses the existing task for explicit review. No duplicate publication silently updates it. |
| Quantity changes never silently rewrite claimed work | `SourceChangePrompt.tsx:5-10` only emits updates from a consented click; owner/assignee and active-state controls apply, and delivered-above-proposed is blocked. Removed/completed/no-longer-short sources are informational. `GuildWorkspace.tsx:186` keys prompts by task revision and source state. |
| Current/proposed update and stock comparison | `GuildWorkspace.tsx:119-135,164-169` retains confirmed rejected proposals, requires reload, then displays comparison. `conflicts.ts:3-9` creates a fresh key with the loaded revision. Migration lines `61,69,92` independently enforce revision/checksum/stock conflicts. Claim preview exception is described above. |
| Another race requires another review | A new conflict resets `compared=false` at `GuildWorkspace.tsx:122,133`; no automatic reapply follows. Browser spec lines `44-52` actually asserts a second intervening edit, disappearance of comparison, reload, unchecked reconfirmation, final revision 4 and new key/latest revision 3. |
| Uncertain outcome is distinct from rejected mutation | `client.ts:4-10,65-75` keeps the exact immutable payload/key after network/server uncertainty and clears it after definitive rejection. `client.test.ts:16-29` exercises both paths. Fresh-key reapply does not replace uncertain-outcome retry. |
| Offline and revocation | `GuildWorkspace.tsx:60-105` retains loaded data read-only on uncertainty, but purges task/member/stock/invite/digest/proposal/retry/consent state after confirmed denial or loss of membership. This is not immediate offline purge or background revocation detection. `revocation.test.tsx:46-108` covers removed guild, parallel denial plus network failure, empty membership, expired session, blocked writes and pending-retry purge. |
| Owner before-only events | `GuildWorkspace.tsx:187` renders details when **either** before or after is present. Browser spec lines `89-98` creates/revokes an invite, finds a real before-only event and opens its before details. |
| Attribution footer | `src/app/App.tsx:63` links `/attribution.html`; that target exists in the reviewed commit. Browser spec line `20` checks the link href. |

## Verification and limits

- Independently executed: `./node_modules/.bin/vitest run src/features/guild --maxWorkers=1` — **8 files / 20 tests passed**, exit 0, duration 3.63s.
- `git diff d587c9e^ d587c9e --check` passed.
- Current HEAD at initial inspection was `32dae0a`; checked that tracked Guild source, App, planner/catalog, publication browser spec and relevant migration matched the reviewed commit. The shared worktree contains unrelated concurrent edits; none were changed by this review. Unit execution used that shared checkout, not a hermetic checkout of the commit.
- Read the actual opt-in browser spec, including repeated task races, stock conflict, claimed quantity reconfirmation, changed-checksum duplicate publication, real revocation and before-only events. **Did not run browser or database integration tests** and do not treat their assertions as executed proof. No default stack was started and no network/remote writes were performed.
- Inspected the underlying migration's deduplication, optimistic revision checks, checksum reconfirmation and idempotency handling rather than relying on implementation notes. Existing integration-script assertions were inspected only; that script has concurrent worktree changes and is not claimed as commit-specific execution evidence.

## Acceptance boundary

Accept the explicit quantity-publication and update/stock conflict workflow on the evidence above. Correct the claim proposed-state display before claiming complete conflict-preview fidelity. Keep semantic catalog/snapshot freshness open until the separately active snapshot work is integrated and tested. This report does not certify the entire Guild backend, all privacy permutations, or full publication readiness.
