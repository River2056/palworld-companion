# Independent guild review

Reviewed the actual working-tree source in `src/features/guild/**` and all three `supabase/migrations/*.sql`, against the approved plan §6 and `docs/acceptance-matrix.md:63–71`. Source was unchanged in these directories during verification. App/Today integration and full-browser acceptance are outside this review. No source edits, commits, or real backend mutations were performed.

## 1. Spec verdict — NOT complete for full-app acceptance

The delivered authenticated task-board subset has substantial safety controls, but the approved guild specification is broader. The existing backend/UI reports explicitly acknowledge some limitations; they do not supersede the approved plan.

### [BUG] Blocking: revocation detection leaves previously loaded guild data and owner controls displayed

**Files:** `src/features/guild/GuildWorkspace.tsx:39–54,76–79,107–112`; `supabase/migrations/202609060001_guild.sql:64–66`.

**Problem:** `refresh()` stores the newly filtered guild list but retains the selected guild. `load()` updates task/member/digest state only after all three requests succeed. After membership removal, table reads return empty arrays and `guild_digest` rejects with membership-required; `Promise.all` rejects before any of the old arrays are cleared. The generic error handler only sets an error. Previously loaded tasks, digest, and even the owner-derived controls remain visible. Authentication expiry similarly leaves the old signed-in workspace intact. This contradicts plan line 202 and acceptance-matrix line 70. Backend RLS still prevents subsequent remote access; this is not a remote authorization bypass.

**Reproduction:** Load a guild and its task/digest as a member. Remove that disposable membership using an authorized administrative test fixture, then click Refresh. The guild list no longer contains the guild and the digest request returns 403, but the old task/digest render remains. Equivalent isolated transport fixture: first return a populated guild/tasks/members/digest, then return `[]` for guilds/tasks/members and `{code:'42501',message:'Membership required'}`/403 for digest. The exact source path above establishes the stale-state result; this reviewer did not mutate a live membership.

**Recommendation:** On a refreshed guild list that excludes the selection, clear selected guild, tasks, members, digest, issued invite, publication consent, and relevant pending state rather than calling `load` for that selection. Distinguish authentication invalidation and membership loss from network failure; clear the affected private state on confirmed denial while preserving read-only data only for genuine connectivity failures. Add the regression test.

### [BUG] Blocking: invite revocation and owner membership management have no implemented API or UI

**Files:** `supabase/migrations/202609060001_guild.sql:5,26–38,72–75`; `src/features/guild/GuildWorkspace.tsx:103–108`; plan `:179–180,207`; acceptance matrix `:66`.

**Problem:** Invites can be created and redeemed, but there is no revoke/list RPC or revoked state. Authenticated direct writes are correctly denied, so an owner cannot work around the missing RPC. There is also no owner membership-removal/settings API. Expiry and single-use redemption are not revocation. The additive migrations introduce neither capability.

**Recommendation:** Implement owner-authorized revocation/removal with tests proving revoked invites fail and removed members lose remote access, or obtain an explicit product scope reduction before calling the guild phase complete. Administrative deletion in a test is useful authorization evidence, not an owner-facing revocation feature.

### [BUG] Blocking for the full approved specification: task contract and activity are a reduced subset

**Files:** `supabase/migrations/202609060001_guild.sql:6–7`; `supabase/migrations/202609060003_task_conflict.sql:6,10–25`; `src/features/guild/GuildWorkspace.tsx:110–112,117–121`; plan `:181–194,207`.

**Problem:** Tasks expose title, three statuses, assignee, and opaque source/checksum. They lack requested/delivered quantities, description/type, the full status lifecycle, shared stock ledger, source-requirement duplicate protection, and stale-quantity prompting. A fresh idempotency key can create another active task with the same source/checksum: request idempotency does not implement source-level duplicate prevention. Activity stores only action kind/actor/task ID, with no title/status/quantity change snapshot; the digest UI renders only kind and time, not actor or task. An `update` event therefore cannot explain the exact historical change, contrary to acceptance requirements.

**Recommendation:** Do not claim the whole approved guild milestone complete. Either deliver the required contract and integration behaviors with acceptance tests, or explicitly approve/document a smaller milestone. For activity, record meaningful immutable change details transactionally and render actor/task/change context. This is a functional gap, not a request for a style rewrite.

### [NOTICE] Offline read-only behavior is not implemented as specified

**Files:** `src/features/guild/GuildWorkspace.tsx:39–45,90,100–112`; plan `:201`; acceptance matrix `:70`.

The UI reports a network failure and retains uncertain task requests without automatic replay, which is good. It has no connectivity/read-only state, however: once a failed non-task request releases `busy`, write controls are enabled again. Pending task failures disable task editing through the retry guard rather than an explicit offline mode. Include a real offline browser acceptance case before asserting this gate passes.

## 2. Security/code-quality verdict — sound core boundaries, changes required before full acceptance

### Verified strengths in final source

- **Explicit destination trust:** `GuildWorkspace.tsx:13–14,56–59,85–98` starts unapproved, invalidates approval on endpoint edits, and gates authentication. No mount-time network request. Endpoint saving sends no credentials.
- **Transport boundary:** `client.ts:9–14,23–33` rejects URL userinfo/query/fragment and non-HTTPS except literal loopback HTTP; fetch refuses redirects and omits cookies. Credentials are only in the auth request; authenticated RPCs use the user access token. No browser service-role credential was found in the reviewed module.
- **No secret persistence or automatic publication:** `GuildWorkspace.tsx:7–10,87,105,110` stores endpoint URLs only; session/password/invite/retry state remains in component memory. Personal draft publication requires a separate explicit checkbox and button and sends only title/source/checksum. There is no personal inventory write in this module.
- **Logout/session races:** `GuildWorkspace.tsx:35,39–45,76–79,85,93,100` uses a synchronous ref lock around UI actions and disables conflicting controls. Logout clears visible session/private arrays before awaiting server logout and reports failed remote sign-out honestly. No supported-UI overlapping-login/logout resurrection path was found. Confirmed revocation/expiry handling is the separate defect above.
- **HTTP 409:** final migration `202609060003_task_conflict.sql:13–20` locks the task and emits `PT409`; `client.ts:19,59` and UI `:44,102,109–111` clear definitive pending retry and require conflict reload before editing.
- **Task retry:** `client.ts:49–59` freezes the full request and key, rejects new work while unresolved, and preserves it on uncertain network/server outcomes. UI prevents switching guild or starting another task while pending. Backend final migration `:4–9,24–25` checks membership, serializes actor/key requests, validates identical payload, and stores the result in the same transaction as activity/task changes.
- **Authorization:** initial migration `:9–20,26–38,72–75` enables RLS on all six tables, permits member-filtered reads only, hides invites/request-cache tables, denies direct writes, restricts function execution, and derives actors from `auth.uid()`. Final task RPC `:4,13–20` requires membership and owner/assignee update rights; atomic claims set assignee server-side. No owner/member/outsider privilege escalation was identified in these functions.
- **Displayed digest watermark:** UI `:112` sends the last currently rendered event ID without pre-mark refetch; migration `202609060002_seen_watermark.sql:3–9` verifies same-guild membership/event and advances monotonically. It does not blanket-mark through server current time.

### [NOTICE] Existing timestamp-watermark limitation remains

**Files:** `supabase/migrations/202609060001_guild.sql:7,64–66`; `202609060002_seen_watermark.sql:5–7`.

The database stores `last_seen` as a timestamp, whereas the UI selects its watermark from ID order. A transaction that inserts an earlier-timestamp event, remains uncommitted while another event is displayed/marked, and commits afterward can be permanently omitted by `created_at > last_seen`. Equal timestamps also cannot be distinguished. This is already disclosed in the backend report; the displayed-ID contract is correctly wired but is not an exactly-once/read-complete inbox. A plain increasing ID cursor alone also does not solve out-of-order commits. Treat reliable concurrent unread delivery as unverified, not as a proven guarantee.

## Verification performed independently

- `npm test -- src/features/guild`: exit 0; **2 files, 6 tests passed** (4 transport/retry and 2 component tests).
- `npm run typecheck`: exit 0.
- `npx eslint src/features/guild --max-warnings 0`: exit 0, no issues.
- `git diff --check`: exit 0.
- Read all final migration definitions rather than relying on earlier recovery logs. Parent-reported real authentication/RLS/invite/claim/idempotency tests and client smoke were not rerun here; no new real data was created.

**Release recommendation:** Accept this as a reviewed, constrained authenticated guild-board increment only after addressing confirmed revocation-state clearing. **Do not mark the full guild specification/full-app acceptance complete** without implementing or explicitly descoping the listed functional gaps. Existing six tests pass but do not cover revocation clearing, logout races, component-level conflict/retry interactions, or the concurrent watermark limitation. Browser acceptance remains the integration worker's responsibility.
