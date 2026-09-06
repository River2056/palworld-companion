# Guild semantic source publication — independent integrated quality review

**Verdict: APPROVED. No blocking correctness, privacy or integration finding in the reviewed scope.**

## Baseline and review independence

Reviewed actual current source at `e80a1ba24de1613216fa923cf33c925da10635c4`, including semantic-source commit `a8c5f0451f779d5fb65f1c3b7891af4238f47c2a` and mutation/privacy integration commit `531e5eb1064daa4a68142994c973d3e8e4928e2e`. Scoped tracked Guild source and Today/Guild tests were unchanged from HEAD. Read the implementation, consumers, regression tests, exact-snapshot planner and backend source/revision guards, then independently executed checks. The missing independent specification record was first written as `guild-semantic-source-spec.md`; its acceptance table and execution details are the companion evidence, not an unverified inherited PASS.

## Findings

- **Semantic correctness:** selected source fingerprints use retained exact catalog identity and selected root/nested recipes, not just quantities or the currently bundled recipe. Inventory cannot suppress validation or fingerprinting of a selected nested branch. An independent synthetic browser-module probe verified the exact full-closure digest for a stock-covered child, rejected a root-only digest, distinguished an equal-quantity child alternative while preserving source identity, and rejected a missing child override despite stock coverage.
- **Identity and conservative failure:** `personal:v2` is scoped to local workspace, goal, kind and item. Semantic changes retain that identity. Missing snapshots, invalid selections and unbound sources remain unavailable; legacy quantity fingerprints are unverified, not silently trusted. Removed/completed sources do not erase shared history.
- **Payload and consent:** publication constructs public task fields explicitly rather than spreading a workspace/source context into the RPC. Notes, private inventory objects and snapshots remain local. Both consumers require fresh consent tied to their preview. Reconfirmation preserves source requirement identity, assignee and delivered quantity, and blocks historical tasks or requested quantities below delivery. Exact retries retain a frozen, flat request payload rather than silently adopting a later local recipe or quantity.
- **Async integration:** the hook exposes resolved arrays and disables consumers while stale/unavailable; superseded projections are discarded. Submission checks the local revision, workspace contents and recomputed snapshot projection. Both publish and source-update callbacks keep that await inside the original privacy continuation fence and recheck before dispatch. Local subscriptions have no remote mutation path. Privacy invalidation cannot start a fresh stale refresh or restore a discarded conflict proposal through the reviewed integration.
- **Runtime no-auto-update:** the real isolated backend/browser run published and deduplicated a selected source, claimed it, changed to an equal-quantity recipe, and read back the entire unchanged task before fresh consent. No additional task mutation occurred on source change/reload. Explicit reconfirmation alone changed the checksum and revision; quantity, identity, assignee and delivered progress remained unchanged. Mutation bodies contained no tested private markers, and no browser page errors occurred.

## Verification actually repeated

| Check | Observed result |
|---|---|
| `npx vitest run src/features/today-guild.test.tsx src/features/guild --reporter=json --outputFile=/tmp/guild-semantic-independent-tests.json` | **100 passed, 0 failed, 11 files**; JSON-parsed counts: 58 Today/Guild plus 42 Guild. |
| `npm run typecheck` | PASS, exit 0. |
| Scoped ESLint: publication helper/hook/picker/prompt, GuildWorkspace, their publication tests and Today/Guild tests | PASS, no issues, exit 0. |
| `git diff --check -- src/features/guild src/features/today-guild.test.tsx` | PASS. |
| `node src/features/guild/semantic-source-smoke.mjs` | PASS against existing isolated `pw-guild-semantic-unique` services and Vite port 5197, with actual remote task readback. |
| `node /tmp/guild-semantic-closure-review.mjs` | PASS: five focused stock-covered nested-closure/immutability checks using actual Vite-served modules. No IndexedDB writes. |

The adversarial probe is a temporary execution artifact, not a permanent added regression. The committed suite already provides the core source/hook/consent coverage; persisting the focused nested-closure fixture would be a useful non-blocking follow-up, not a condition of this approval. No additional source changes or open-ended test expansion are required for the reviewed acceptance criteria.

## Explicit limits of approval

1. **No distributed atomicity claim.** Local source verification is point-in-time. An edit after the local read can coexist with an already-consented remote request. The backend's revision, authorization, source-identity/reconfirmation and idempotency rules decide remote acceptance. The implementation does not promise an atomic transaction spanning IndexedDB and Postgres.
2. **No retroactive cancellation claim.** Privacy fences suppress stale client continuations; they do not undo server-accepted writes. Recovery requires explicit reconnect/readback and exact-payload retry where applicable, not an automatic resend or refreshed payload masquerading as the old consent.
3. **Privacy remains separately reviewed.** `today-guild-mutation-fix.md:31-41` records independent red/green verification and approval of the delayed-mutation fix. This review reran the integrated green regressions and inspected the source-verification fence; it did not independently rerun the historical pre-fix red harness. Mocked delayed-promise tests and the ordinary real-browser semantic scenario are distinct evidence, not interchangeable race guarantees.
4. **Bounded scope.** Approval does not certify unrelated evolving App/Today/Pal/catalog work, every backend configuration, production deployment, the optional legacy draft API, or the full repository test suite. No existing backend was reset or migrated. The smoke intentionally left its unique test account/guild/tasks in the already designated isolated backend.

## Deliverable and ownership

Created only the two new repository review documents, `guild-semantic-source-spec.md` and this file. Source, tests, existing reports, package configuration and migrations were not modified; no commits were created. Existing unrelated working-tree changes remain with their owners. No blocker was encountered in the independent verification.
