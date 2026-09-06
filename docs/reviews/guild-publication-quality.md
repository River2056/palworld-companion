# Independent quality review: scoped Guild publication and conflict flow

**Verdict: APPROVED for the quantity-v1 publication/conflict slice in `d587c9e` plus claim correction `e75177b`.** The claim-preview specification defect is closed. No additional blocking defect was found in that scoped implementation. This is **not** acceptance of semantic snapshot freshness, the concurrent Today integration, or the complete Guild backend.

## Scope and evidence provenance

Read `guild-publication-spec.md`, the actual publication commit, the claim correction, current source, relevant tests, and the task/stock migration. HEAD observed during verification was `ab744760c2f8f591a7d38680003c474ca65038d5`. The shared checkout contains concurrent edits; no source, backend, branch, or other review document was changed by this review. Line references below refer to the inspected working-tree source unless a commit is explicitly named.

The current `GuildWorkspace.tsx` diff is **not only summary plumbing**: it also adds epoch/scope guards, externally signalled logout, and an `offline` event handler that invokes private-state purge. Those changes are distinguished from the reviewed publication commits below. Unit results come from this shared checkout, not an isolated historical checkout.

## Claim specification recheck — PASS

- `conflicts.ts:11-15` now projects claim as `{...latest, assignee: actor, status: 'doing'}` and ignores edit-only fields. This matches `supabase/migrations/202609060005_task_details.sql:62-64`, where the server assigns `auth.uid()` and starts work.
- `ConflictComparison.tsx:7` supplies its `user` to the projector; `GuildWorkspace.tsx:200` supplies `session.user.id`. The authenticated user prop was already supplied in `d587c9e`; no owner/previous-assignee substitution was introduced.
- `ConflictComparison.tsx:9-10` blocks claim reapply for assigned, done, or cancelled tasks, independently of owner status. An unavailable claim remains visible as intended action, with an explicit cannot-reapply explanation; it is not represented as a successful save.
- Revision/timestamps are explicitly described as loaded comparison context, not speculative saved metadata (`ConflictComparison.tsx:10`). Update previews preserve the current assignee, matching the server's update branch (`202609060005_task_details.sql:71`).
- Executed `ConflictComparison.test.tsx` and `conflicts.test.ts` cover actor/status, immutable inputs, ignored claim edit fields, owner/member cases, released claims, closed/already-assigned tasks, consent, disabled/discard behavior, and update semantics.

The original finding in `guild-publication-spec.md:11-21` is therefore resolved by `e75177b`; that historical report was left intact.

## Quality findings and requirement checks

### [GOOD] Reapply is explicit, rebased, and distinct from retry

**Files:** `conflicts.ts:3-9`; `GuildWorkspace.tsx:151-167,199-204`; `ConflictComparison.tsx:5-10`.

```ts
return {...input,p_revision:latest.revision,p_key:crypto.randomUUID(),p_reconfirm:reconfirm};
```

Task/stock reapply constructs a new scalar payload using the loaded revision and a fresh key, without mutating the rejected proposal or current record. Create cannot enter task reapply. The UI checks guild identity, requires loaded comparison and fresh consent, and prevents writes while busy/disconnected/pending. Every confirmed task or stock rejection captures the actual attempted payload and sets `compared=false`, including a rejection of a reapply or exact retry. A subsequent race therefore requires another reload/review; no optimistic local mutation or automatic reapply exists. Server revision and checksum checks remain authoritative (`202609060005_task_details.sql:61,69,92`).

`tests/e2e/guild-publication.spec.ts:44-56` contains a real second-race sequence and stock conflict assertions. These were inspected, **not executed** in this review.

### [GOOD] Unknown-outcome retries preserve the old payload

**Files:** `client.ts:4-10,65-75`; `client.test.ts:16-29`; `202609060005_task_details.sql:34-44,81-88`.

Task and stock retries freeze a shallow copy, sufficient for these scalar contracts, and reject replacement inputs while pending. Network/uncertain server failures retain the original revision, fields and key; definitive rejection clears the retry. Task tests execute repeated network/503 failures and assert identical serialized bodies across attempts. Successful refresh does not itself resend or rebase a pending request. Server idempotency validates actor/key/payload and returns the prior result; legacy nine-parameter payload shape is explicitly retained unless extended fields are supplied. Membership is checked before replay, so an old key is not an authorization bypass.

### [GOOD] Publication is an explicit projection, not a workspace export

**Files:** `publication.ts:8-18`; `PublicationPicker.tsx:3-10`; `GuildWorkspace.tsx:159-160,213`; `SourceChangePrompt.tsx:5-10`.

The selected pin or allocated shortage is projected into explicit scalar task fields. The RPC construction does not spread workspace, goal, stock, notes or roster objects. Empty description, zero delivered quantity and open status are explicit and match the preview. Derived shortage quantity is consented shared information, not an export of inventory holdings. Consent starts unchecked and is keyed by guild and selected source content; source changes reset it. Publishing and source updates occur only from explicit clicks, and permission/active-state/delivered-quantity guards protect quantity reconfirmation. Removed/completed/no-longer-short local sources do not cancel shared history.

### [GOOD] Duplicate active requirements do not silently update work

**Files:** `publication.ts:12-15`; `202609060005_task_details.sql:10,46-54`; `ConflictComparison.tsx:6,9-10`; `GuildWorkspace.tsx:221`.

Identity binds goal/kind/item independently of quantity. The server serializes requirement operations and enforces uniqueness: matching-checksum creates return existing work; changed-checksum creates reject. The conflict UI cannot reapply create and provides an explicit existing-task focus target (`tabIndex=-1`). Same-checksum publication does not overwrite an assignee's edits. Browser duplicate/focus assertions exist at `tests/e2e/guild-publication.spec.ts:42-43,63-71`, but were not executed here.

### [GOOD] Confirmed revocation purges; ordinary network uncertainty is read-only

**Files:** `GuildWorkspace.tsx:73-80,91-119,121-132`; `revocation.test.tsx:46-108`.

Confirmed denial, an absent selected guild, or missing membership clears loaded tasks/members/stock/invites/activity, proposals, retry holders, and publication consent. Parallel reads use `allSettled`, giving a confirmed denial precedence over another read's network error. A 401 clears authentication and endpoint consent. Executed tests cover these cases, pending task/stock purge, no writes during ordinary uncertainty, and explicit successful-refresh recovery.

In the publication commit, offline/network uncertainty retains already-loaded data read-only and retains unknown-outcome retry payloads; it does not claim immediate offline revocation detection or background synchronization.

## Non-blocking acceptance boundaries / integration notices

### [NOTICE] Semantic freshness remains open

**File:** `publication.ts:14-15,21-25`.

`quantity-v1:${quantity}` cannot detect equal-quantity changes to recipe semantics, provenance, ingredients, or catalog snapshots. Stable identity does not solve freshness. Parent-owned semantic-v2/storage integration must close this separately, with equal-quantity semantic-change tests. This scoped approval must not be used as a full publication signoff.

### [NOTICE] Concurrent Today offline behavior needs its own integration validation

**Files:** current `GuildWorkspace.tsx:65-80`; `tests/e2e/guild-publication.spec.ts:77-89`.

The concurrent `offline` handler now calls `clearPrivateState()`, clearing selected guild, tasks and pending retry holders. This differs materially from ordinary failed-refresh behavior and from the reviewed publication commit. After a real offline event, the existing browser scenario still expects `Save shared stock` to remain rendered/disabled, then expects owner controls after refresh without reselecting a guild. Those assertions need alignment with the final intended purge policy; the executed revocation tests simulate failed fetches rather than dispatching an `offline` event.

Also explicitly reconcile purge of unknown-outcome retry holders with reconnect guidance: the quantity publication review establishes exact-payload safety while the holder exists, not preservation across the newly introduced offline purge. This is a concurrent integration boundary, not a defect attributed to `d587c9e`/`e75177b`.

### [NOTICE] Privacy/interaction test limits remain

**Files:** `publication.test.ts`; `PublicationPicker.test.tsx`; `tests/e2e/guild-publication.spec.ts:17,33-38,77-85`.

Existing tests do not establish an all-request privacy audit with populated private inventory and roster sentinels. The browser test checks mutation key allowlisting and private-note absence; the picker test does not exercise a source-content rerender even though keyed consent reset is implemented. Selected-source offline and repeated claim-race end-to-end coverage would strengthen confidence. These are coverage limitations, not evidence of an identified export or stale-write defect.

## Executed verification

- `./node_modules/.bin/vitest run src/features/guild --maxWorkers=1`: **9 test files / 38 tests passed**, exit 0, duration 4.11s.
- `git diff d587c9e^ d587c9e --check`: passed.
- `git diff e75177b^ e75177b --check`: passed.
- Working-tree `git diff --check`: passed at initial inspection.
- No browser/database integration tests, backend writes, stack startup, full build, or live-service checks were performed. Browser and SQL observations above are source-review evidence only.

## Final verdict

| Area | Result |
|---|---|
| Corrected authenticated claim preview | APPROVED; original bounded defect closed |
| Quantity-only selected publication and conflict/reapply workflow | APPROVED; no additional scoped blocker found |
| Semantic catalog/snapshot freshness | OPEN; explicitly excluded |
| Concurrent Today offline/logout integration and adjusted browser expectations | Separate integration verification required |

Only `docs/reviews/guild-publication-quality.md` was created by this review.
